import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import http from "node:http"
import { safePath, atomicWrite, withLock, recoverLock } from "./run-state.mjs"

const CREDENTIALS = ".storage/credentials/drive"
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN = "https://oauth2.googleapis.com/token"
const SCOPES = {
  readonly: "https://www.googleapis.com/auth/drive.readonly",
  readwrite: "https://www.googleapis.com/auth/drive",
}

export class DriveError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}

// Tokens and resumable session URIs never enter module results or cold archives.
export function drivePrivatePath(root, relative, { create = false } = {}) {
  const file = safePath(root, `${CREDENTIALS}/${relative}`, { materialize: false })
  if (create) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    let dir = path.dirname(file)
    const base = safePath(root, CREDENTIALS, { materialize: false })
    while (dir === base || dir.startsWith(base + path.sep)) {
      fs.chmodSync(dir, 0o700)
      dir = path.dirname(dir)
    }
  }
  return file
}
export function readDrivePrivate(root, relative) {
  const file = drivePrivatePath(root, relative)
  if (!fs.existsSync(file)) return null
  const directory = safePath(root, CREDENTIALS, { materialize: false })
  if (fs.statSync(directory).mode & 0o077)
    throw new DriveError(
      "DRIVE_CREDENTIAL_PERMISSIONS",
      "Drive credentials directory requires mode 0700",
    )
  if (!fs.statSync(file).isFile() || fs.statSync(file).mode & 0o077)
    throw new DriveError("DRIVE_CREDENTIAL_PERMISSIONS", "Drive private files require mode 0600")
  if (fs.statSync(file).size > 1024 * 1024)
    throw new DriveError("DRIVE_CREDENTIAL_INVALID", "Drive private record exceeds its size budget")
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    throw new DriveError("DRIVE_CREDENTIAL_INVALID", "Invalid private Drive record")
  }
}
export function writeDrivePrivate(root, relative, value) {
  drivePrivatePath(root, relative, { create: true })
  atomicWrite(root, `${CREDENTIALS}/${relative}`, value)
}
export function driveLockRoot(root) {
  drivePrivatePath(root, "locks/placeholder", { create: true })
  return safePath(root, CREDENTIALS, { materialize: false })
}
export function recoverDriveLock(root, name, owner) {
  if (!["auth", "storage"].includes(name)) throw Error("Unknown Drive lock")
  return recoverLock(driveLockRoot(root), name, owner)
}

function readConfig(root) {
  const config = readDrivePrivate(root, "client.json")
  if (!config)
    throw new DriveError("DRIVE_SETUP_REQUIRED", "Configure a Google Desktop OAuth client first")
  if (config.schema !== "research-drive-oauth-client/v1" || !SCOPES[config.mode])
    throw new DriveError("DRIVE_CREDENTIAL_INVALID", "Invalid Drive OAuth configuration")
  return config
}
export async function configureDriveAuth(root, clientPath, mode = "readwrite") {
  if (!SCOPES[mode]) throw Error("OAuth mode must be readonly or readwrite")
  const stat = fs.lstatSync(clientPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    throw Error("Use a regular Google Desktop client JSON file smaller than 64 KiB")
  let client
  try {
    client = JSON.parse(fs.readFileSync(clientPath, "utf8")).installed
  } catch {
    throw new DriveError("DRIVE_CREDENTIAL_INVALID", "Invalid Desktop OAuth client JSON")
  }
  if (
    !client ||
    !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(client.client_id || "") ||
    typeof client.client_secret !== "string" ||
    !client.client_secret ||
    (client.token_uri && client.token_uri !== TOKEN) ||
    (client.auth_uri &&
      client.auth_uri !== "https://accounts.google.com/o/oauth2/auth" &&
      client.auth_uri !== AUTH)
  )
    throw Error("A Google Desktop (installed) OAuth client is required")
  return withLock(driveLockRoot(root), "auth", async () => {
    const previous = readDrivePrivate(root, "client.json")
    if (
      readDrivePrivate(root, "token.json") &&
      (previous?.client_id !== client.client_id || previous?.mode !== mode)
    )
      throw Error("Use auth logout before changing the OAuth client or scope")
    writeDrivePrivate(root, "client.json", {
      schema: "research-drive-oauth-client/v1",
      mode,
      client_id: client.client_id,
      client_secret: client.client_secret,
    })
    return driveAuthStatus(root)
  }).then(() => driveAuthStatus(root))
}

export function driveAuthStatus(root) {
  const config = readDrivePrivate(root, "client.json")
  const token = readDrivePrivate(root, "token.json")
  if (config) readConfig(root)
  if (token && !validStoredToken(token, config))
    throw new DriveError(
      "DRIVE_CREDENTIAL_INVALID",
      "Stored Drive authorization is invalid; login again",
    )
  const locks = {}
  for (const name of ["auth", "storage"]) {
    const record = readDrivePrivate(root, `locks/${name}.json`)
    if (record) locks[name] = record
  }
  return {
    schema: "research-drive-auth-status/v1",
    status: !config
      ? "setup_required"
      : !token || token.reauth_required
        ? "authorization_required"
        : "connected",
    client_configured: Boolean(config),
    mode: config?.mode || null,
    refresh_available: Boolean(token?.refresh_token && !token.reauth_required),
    expires_at: token?.expires_at || null,
    access_token_expired: token ? Date.parse(token.expires_at) <= Date.now() : null,
    locks,
  }
}

function validStoredToken(token, config) {
  return (
    config &&
    token.schema === "research-drive-oauth-token/v1" &&
    token.client_id === config.client_id &&
    typeof token.refresh_token === "string" &&
    Boolean(token.refresh_token) &&
    typeof token.access_token === "string" &&
    (token.reauth_required || Boolean(token.access_token)) &&
    typeof token.scope === "string" &&
    token.scope.split(/\s+/).includes(SCOPES[config.mode]) &&
    Number.isFinite(Date.parse(token.expires_at))
  )
}

async function tokenRequest(fetchImpl, fields) {
  let response
  try {
    response = await fetchImpl(TOKEN, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    })
  } catch {
    throw new DriveError("DRIVE_AUTH_NETWORK", "Google token request interrupted; retry explicitly")
  }
  let value
  try {
    value = await response.json()
  } catch {
    throw new DriveError("DRIVE_AUTH_RESPONSE", "Invalid Google token response")
  }
  if (!response.ok) {
    throw new DriveError(
      value.error === "invalid_grant" ? "DRIVE_REAUTH_REQUIRED" : "DRIVE_AUTH_REJECTED",
      value.error === "invalid_grant"
        ? "Google authorization expired or was revoked; login again"
        : "Google rejected the token request",
    )
  }
  return value
}
function saveToken(root, config, value, previous = null) {
  const scope = (value.scope || previous?.scope || SCOPES[config.mode]).split(/\s+/)
  if (
    !scope.includes(SCOPES[config.mode]) ||
    value.token_type?.toLowerCase() !== "bearer" ||
    typeof value.access_token !== "string" ||
    !value.access_token ||
    !Number.isFinite(Number(value.expires_in)) ||
    Number(value.expires_in) <= 0 ||
    !(value.refresh_token || previous?.refresh_token)
  )
    throw new DriveError(
      "DRIVE_AUTH_RESPONSE",
      "Google did not grant the required offline Drive access",
    )
  const token = {
    schema: "research-drive-oauth-token/v1",
    client_id: config.client_id,
    access_token: value.access_token,
    refresh_token: value.refresh_token || previous.refresh_token,
    scope: scope.join(" "),
    expires_at: new Date(Date.now() + Number(value.expires_in) * 1000).toISOString(),
    reauth_required: false,
  }
  writeDrivePrivate(root, "token.json", token)
  return token
}

export async function driveAccessToken(
  root,
  { forceRefresh = false, rejectedToken, fetchImpl = fetch } = {},
) {
  return withLock(driveLockRoot(root), "auth", async () => {
    const config = readConfig(root),
      token = readDrivePrivate(root, "token.json")
    if (!token || token.reauth_required || !validStoredToken(token, config))
      throw new DriveError("DRIVE_REAUTH_REQUIRED", "Google Drive login is required")
    // Another process may already have replaced the rejected token.
    if (
      (!forceRefresh || (rejectedToken && rejectedToken !== token.access_token)) &&
      Date.parse(token.expires_at) > Date.now() + 60000
    )
      return token.access_token
    try {
      return saveToken(
        root,
        config,
        await tokenRequest(fetchImpl, {
          client_id: config.client_id,
          client_secret: config.client_secret,
          refresh_token: token.refresh_token,
          grant_type: "refresh_token",
        }),
        token,
      ).access_token
    } catch (error) {
      if (error.code === "DRIVE_REAUTH_REQUIRED")
        writeDrivePrivate(root, "token.json", { ...token, access_token: "", reauth_required: true })
      throw error
    }
  })
}

export async function loginDrive(
  root,
  { onAuthorization, fetchImpl = fetch, timeoutMs = 300000 } = {},
) {
  if (typeof onAuthorization !== "function" || timeoutMs < 1000 || timeoutMs > 600000)
    throw Error("An authorization URL handler and a 1–600 second timeout are required")
  return withLock(driveLockRoot(root), "auth", async () => {
    const config = readConfig(root)
    const verifier = crypto.randomBytes(48).toString("base64url")
    const state = crypto.randomBytes(32).toString("base64url")
    let resolveCallback, rejectCallback
    const callback = new Promise((resolve, reject) => {
      resolveCallback = resolve
      rejectCallback = reject
    })
    // Register the rejection handler before invoking a caller-provided browser hook.
    callback.catch(() => {})
    const server = http.createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store")
      response.setHeader("Content-Type", "text/plain; charset=utf-8")
      const u = new URL(request.url, "http://127.0.0.1")
      const got = Buffer.from(u.searchParams.get("state") || "")
      if (
        request.method !== "GET" ||
        u.pathname !== "/oauth2/callback" ||
        request.headers.host !== `127.0.0.1:${server.address().port}` ||
        u.searchParams.getAll("state").length !== 1 ||
        got.length !== Buffer.byteLength(state) ||
        !crypto.timingSafeEqual(got, Buffer.from(state))
      ) {
        response.writeHead(400).end("Invalid OAuth callback.")
        return
      }
      if (u.searchParams.has("error")) {
        response.writeHead(400).end("Authorization was not granted. Close this window.")
        rejectCallback(
          new DriveError("DRIVE_AUTH_DENIED", "Google Drive authorization was not granted"),
        )
      } else if (u.searchParams.getAll("code").length === 1 && u.searchParams.get("code")) {
        response.end(
          "Google response received. Return to the terminal to check the connection result.",
        )
        resolveCallback(u.searchParams.get("code"))
      } else response.writeHead(400).end("Missing authorization code.")
    })
    await new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const redirect = `http://127.0.0.1:${server.address().port}/oauth2/callback`
    const timer = setTimeout(
      () =>
        rejectCallback(
          new DriveError("DRIVE_AUTH_TIMEOUT", "Drive authorization timed out; login again"),
        ),
      timeoutMs,
    )
    try {
      const url = new URL(AUTH)
      url.search = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPES[config.mode],
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      }).toString()
      await onAuthorization(url.toString())
      const code = await callback
      saveToken(
        root,
        config,
        await tokenRequest(fetchImpl, {
          client_id: config.client_id,
          client_secret: config.client_secret,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirect,
        }),
      )
      return driveAuthStatus(root)
    } finally {
      clearTimeout(timer)
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }).then(() => driveAuthStatus(root))
}

export async function logoutDrive(root) {
  return withLock(driveLockRoot(root), "auth", async () => {
    const token = drivePrivatePath(root, "token.json")
    if (fs.existsSync(token)) fs.unlinkSync(token)
    return driveAuthStatus(root)
  }).then(() => driveAuthStatus(root))
}
