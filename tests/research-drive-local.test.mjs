import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import {
  configureDriveAuth,
  driveAuthStatus,
  loginDrive,
  driveAccessToken,
  writeDrivePrivate,
  readDrivePrivate,
  drivePrivatePath,
  logoutDrive,
} from "../scripts/research/drive-auth.mjs"
import { LocalDriveClient } from "../scripts/research/drive-client.mjs"
import { driveStorageAction } from "../scripts/research/drive-storage.mjs"
import { storageAction } from "../scripts/research/cold-storage.mjs"
import { safePath } from "../scripts/research/run-state.mjs"
import { executeModule, moduleCatalog } from "../scripts/research/module-registry.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex")
const clientId = "fixture-desktop.apps.googleusercontent.com"
const policy = {
  schema: "research-local-drive-policy/v1",
  root_folder_id: "project-root",
  archive_parent_id: "archive-parent",
  timeout_ms: 10000,
  chunk_bytes: 262144,
  maximum_bundle_bytes: 4 * 1024 ** 2,
  automatic_retry: false,
}
const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers })
function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-drive-local-")))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, ".local")
  fs.mkdirSync(root)
  fs.mkdirSync(path.join(dir, "data"))
  fs.writeFileSync(path.join(dir, "data/research-drive-policy.json"), JSON.stringify(policy))
  const operationPolicy = JSON.parse(
    fs.readFileSync(path.join(repo, "data/research-operation-policy.json"), "utf8"),
  )
  operationPolicy.phase = "development"
  operationPolicy.development_completion = null
  fs.writeFileSync(
    path.join(dir, "data/research-operation-policy.json"),
    JSON.stringify(operationPolicy),
  )
  const client = path.join(dir, "desktop-client.json")
  fs.writeFileSync(
    client,
    JSON.stringify({ installed: { client_id: clientId, client_secret: "fixture-client-secret" } }),
  )
  return { repo: dir, root, client }
}
async function connected(t, mode = "readwrite") {
  const f = fixture(t)
  await configureDriveAuth(f.root, f.client, mode)
  writeDrivePrivate(f.root, "token.json", {
    schema: "research-drive-oauth-token/v1",
    client_id: clientId,
    access_token: "fixture-access-secret",
    refresh_token: "fixture-refresh-secret",
    scope: `https://www.googleapis.com/auth/drive${mode === "readonly" ? ".readonly" : ""}`,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    reauth_required: false,
  })
  return f
}
function driveFixture() {
  const records = new Map(),
    sessions = new Map(),
    calls = [],
    uploads = []
  let serial = 0,
    failChunk = false,
    failAck = false,
    failDownload = false
  const meta = (id, mimeType, parents, bytes) => ({
    id,
    name: id,
    mimeType,
    parents,
    shared: false,
    trashed: false,
    modifiedTime: "2026-10-16T00:00:00.000Z",
    version: "1",
    ...(bytes ? { size: String(bytes.length), sha256Checksum: hash(bytes) } : {}),
  })
  records.set("project-root", {
    metadata: meta("project-root", "application/vnd.google-apps.folder", ["drive-home"]),
  })
  records.set("archive-parent", {
    metadata: meta("archive-parent", "application/vnd.google-apps.folder", ["project-root"]),
  })
  const store = (id, bytes, extra = {}) =>
    records.set(id, {
      bytes,
      metadata: { ...meta(id, "application/zip", ["archive-parent"], bytes), ...extra },
    })
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input),
      method = init.method || "GET"
    calls.push({
      path: url.pathname,
      method,
      range: init.headers?.Range || init.headers?.["Content-Range"],
    })
    assert.equal(url.origin, "https://www.googleapis.com")
    assert.equal(init.headers.Authorization, "Bearer fixture-access-secret")
    if (url.pathname.endsWith("/generateIds")) return json({ ids: ["reserved-" + ++serial] })
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      const m = JSON.parse(init.body)
      assert.equal(records.has(m.id), false, "a stable Drive ID must not be created twice")
      const session = `https://www.googleapis.com/upload/drive/v3/files?upload_id=${m.id}`
      sessions.set(m.id, {
        m,
        chunks: [],
        received: 0,
        bytes: Number(init.headers["X-Upload-Content-Length"]),
      })
      uploads.push(m.id)
      return new Response(null, { status: 200, headers: { Location: session } })
    }
    if (method === "PUT") {
      const id = url.searchParams.get("upload_id"),
        s = sessions.get(id)
      if (!s) return new Response(null, { status: 404 })
      const range = init.headers["Content-Range"]
      if (range.startsWith("bytes */"))
        return records.has(id)
          ? json(records.get(id).metadata)
          : new Response(null, {
              status: 308,
              headers: s.received ? { Range: `bytes=0-${s.received - 1}` } : {},
            })
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)
      assert.equal(Number(match[1]), s.received, "only unconfirmed bytes may be sent")
      s.chunks.push(Buffer.from(init.body))
      s.received += init.body.length
      if (s.received === s.bytes) {
        store(id, Buffer.concat(s.chunks), {
          ...s.m,
          ...meta(id, s.m.mimeType, s.m.parents, Buffer.concat(s.chunks)),
          name: s.m.name,
        })
        if (failAck) {
          failAck = false
          throw Error("fixture disconnected after final write")
        }
        return json(records.get(id).metadata)
      }
      if (failChunk) {
        failChunk = false
        throw Error("fixture disconnected after chunk write")
      }
      return new Response(null, { status: 308, headers: { Range: `bytes=0-${s.received - 1}` } })
    }
    if (url.pathname === "/drive/v3/files") {
      return json({
        files: [...records.values()]
          .map((r) => r.metadata)
          .filter((m) => m.parents.includes("archive-parent")),
        incompleteSearch: false,
      })
    }
    const id = url.pathname.split("/").at(-1),
      item = records.get(id)
    if (!item) return new Response(null, { status: 404 })
    if (url.searchParams.get("alt") === "media") {
      const start = Number(/^bytes=(\d+)-$/.exec(init.headers?.Range || "")?.[1] || 0)
      if (failDownload) {
        failDownload = false
        let sent = false
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (!sent) {
                sent = true
                controller.enqueue(item.bytes.subarray(0, 100000))
              } else controller.error(Error("fixture interrupted stream"))
            },
          }),
        )
      }
      return new Response(item.bytes.subarray(start), {
        status: start ? 206 : 200,
        headers: start
          ? { "Content-Range": `bytes ${start}-${item.bytes.length - 1}/${item.bytes.length}` }
          : {},
      })
    }
    return json(item.metadata)
  }
  return {
    fetchImpl,
    calls,
    records,
    store,
    uploads,
    sessions,
    failChunk: () => {
      failChunk = true
    },
    failAck: () => {
      failAck = true
    },
    failDownload: () => {
      failDownload = true
    },
  }
}

test("local OAuth status is read-only, and configure rejects a non-Google desktop client", async (t) => {
  const f = fixture(t)
  assert.equal(driveAuthStatus(f.root).status, "setup_required")
  assert.deepEqual(fs.readdirSync(f.root), [])
  fs.writeFileSync(
    f.client,
    JSON.stringify({
      installed: {
        client_id: clientId,
        client_secret: "private",
        token_uri: "https://example.com/token",
      },
    }),
  )
  await assert.rejects(configureDriveAuth(f.root, f.client), /Google Desktop/)
  assert.deepEqual(fs.readdirSync(f.root), [])
})

test("Desktop OAuth verifies state and PKCE on the real loopback; only private offline tokens are stored", async (t) => {
  const f = fixture(t)
  await configureDriveAuth(f.root, f.client)
  let challenge,
    redirect,
    tokenCalls = 0
  const result = await loginDrive(f.root, {
    timeoutMs: 5000,
    onAuthorization: async (value) => {
      const u = new URL(value)
      assert.equal(u.origin, "https://accounts.google.com")
      challenge = u.searchParams.get("code_challenge")
      redirect = u.searchParams.get("redirect_uri")
      assert.equal(u.searchParams.get("code_challenge_method"), "S256")
      const bad = new URL(redirect)
      bad.search = "state=wrong&code=do-not-exchange"
      assert.equal((await fetch(bad)).status, 400)
      const good = new URL(redirect)
      good.search = new URLSearchParams({
        state: u.searchParams.get("state"),
        code: "fixture-only-code",
      })
      assert.equal((await fetch(good)).status, 200)
    },
    fetchImpl: async (url, init) => {
      tokenCalls++
      assert.equal(url, "https://oauth2.googleapis.com/token")
      assert.equal(
        hash(init.body.get("code_verifier")),
        Buffer.from(challenge, "base64url").toString("hex"),
      )
      assert.equal(init.body.get("redirect_uri"), redirect)
      assert.equal(init.body.get("code"), "fixture-only-code")
      return json({
        access_token: "private-access",
        refresh_token: "private-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      })
    },
  })
  assert.equal(tokenCalls, 1)
  assert.equal(result.status, "connected")
  assert.deepEqual(result.locks, {})
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-access|private-refresh|fixture-client-secret/,
  )
  assert.equal(fs.statSync(drivePrivatePath(f.root, "token.json")).mode & 0o777, 0o600)
  assert.equal(
    fs.statSync(path.dirname(drivePrivatePath(f.root, "token.json"))).mode & 0o777,
    0o700,
  )
  await assert.rejects(fetch(redirect))
  assert.equal((await logoutDrive(f.root)).status, "authorization_required")
})

test("expired access refreshes once and revoked refresh waits for new authorization without leaking the response", async (t) => {
  const f = await connected(t)
  const token = readDrivePrivate(f.root, "token.json")
  writeDrivePrivate(f.root, "token.json", { ...token, expires_at: "2000-01-01T00:00:00Z" })
  let calls = 0
  const fetchImpl = async (url, init) => {
    calls++
    assert.equal(init.body.get("grant_type"), "refresh_token")
    return json({ access_token: "refreshed-access", expires_in: 3600, token_type: "Bearer" })
  }
  assert.equal(await driveAccessToken(f.root, { fetchImpl }), "refreshed-access")
  assert.equal(await driveAccessToken(f.root, { fetchImpl }), "refreshed-access")
  assert.equal(calls, 1)
  await assert.rejects(
    driveAccessToken(f.root, {
      forceRefresh: true,
      fetchImpl: async () =>
        json({ error: "invalid_grant", error_description: "private-refresh-secret" }, 400),
    }),
    (e) => e.code === "DRIVE_REAUTH_REQUIRED" && !e.message.includes("secret"),
  )
  assert.equal(driveAuthStatus(f.root).status, "authorization_required")
})

test("Drive private paths reject symlinks and broad file permissions", async (t) => {
  const f = await connected(t),
    token = drivePrivatePath(f.root, "token.json")
  fs.chmodSync(token, 0o644)
  assert.throws(() => driveAuthStatus(f.root), /0600/)
  fs.chmodSync(token, 0o600)
  fs.renameSync(token, token + ".old")
  fs.symlinkSync(token + ".old", token)
  assert.throws(() => driveAuthStatus(f.root), /Symlink/)
})

test("private-tree checks stop shared or unrelated files and support complete folder listings", async (t) => {
  const f = await connected(t),
    api = driveFixture(),
    client = new LocalDriveClient(f.root, policy, api)
  api.store("valid", Buffer.from("fixture evidence"))
  assert.equal((await client.list("archive-parent")).files.length, 1)
  api.store("shared", Buffer.from("private"), { shared: true })
  await assert.rejects(client.inProject("shared"), (e) => e.code === "DRIVE_PRIVATE_SCOPE")
  api.store("elsewhere", Buffer.from("private"), { parents: [] })
  await assert.rejects(client.inProject("elsewhere"), (e) => e.code === "DRIVE_PRIVATE_SCOPE")
  await assert.rejects(
    client.request("https://example.com/drive/v3/files"),
    (e) => e.code === "DRIVE_ENDPOINT_REJECTED",
  )
})

test("interrupted upload queries the same session and sends only remaining chunks", async (t) => {
  const f = await connected(t),
    api = driveFixture(),
    client = new LocalDriveClient(f.root, policy, api)
  const bytes = crypto.randomBytes(700000),
    source = ".storage/fixture-upload.zip"
  fs.writeFileSync(path.join(f.root, source), bytes)
  const params = {
    sha256: hash(bytes),
    bytes: bytes.length,
    name: "fixture.zip",
    parent_id: "archive-parent",
    mime_type: "application/zip",
  }
  api.failChunk()
  await assert.rejects(
    client.upload(source, params),
    (e) => e.code === "DRIVE_TRANSFER_INTERRUPTED",
  )
  const result = await client.upload(source, params)
  assert.equal(result.file_id, "reserved-1")
  assert.equal(result.sha256, hash(bytes))
  assert.deepEqual(api.uploads, ["reserved-1"])
  assert.equal(
    api.calls.filter((c) => c.method === "PUT" && c.range === "bytes */700000").length,
    1,
  )
  assert.deepEqual(fs.readFileSync(path.join(f.root, result.path)), bytes)
  assert.doesNotMatch(JSON.stringify(result), /upload_id|fixture-access-secret/)
})

test("lost final upload acknowledgement is recovered by raw readback without another create", async (t) => {
  const f = await connected(t),
    api = driveFixture(),
    client = new LocalDriveClient(f.root, policy, api)
  const body = crypto.randomBytes(15000),
    source = ".storage/fixture-upload.zip"
  fs.writeFileSync(path.join(f.root, source), body)
  const p = {
    sha256: hash(body),
    bytes: body.length,
    name: "fixture.zip",
    parent_id: "archive-parent",
    mime_type: "application/zip",
  }
  api.failAck()
  await assert.rejects(client.upload(source, p), (e) => e.code === "DRIVE_TRANSFER_INTERRUPTED")
  const r = await client.upload(source, p)
  assert.equal(r.file_id, "reserved-1")
  assert.equal(api.uploads.length, 1)
  assert.equal(api.calls.filter((c) => c.method === "PUT").length, 1)
})

test("interrupted download resumes its actual byte range and rejects changed or corrupt bytes", async (t) => {
  const f = await connected(t),
    api = driveFixture(),
    client = new LocalDriveClient(f.root, policy, api)
  const body = crypto.randomBytes(300000),
    p = { sha256: hash(body), bytes: body.length, parent_id: "archive-parent" }
  api.store("download", body)
  api.failDownload()
  await assert.rejects(
    client.download("download", p),
    (e) => e.code === "DRIVE_TRANSFER_INTERRUPTED",
  )
  const result = await client.download("download", p)
  assert.ok(api.calls.some((c) => c.range === "bytes=100000-"))
  assert.deepEqual(fs.readFileSync(path.join(f.root, result.path)), body)
  api.records.get("download").metadata.version = "2"
  await assert.rejects(client.download("download", p), (e) => e.code === "DRIVE_CONTENT_CHANGED")
  api.store("corrupt", Buffer.alloc(body.length, 1), { sha256Checksum: undefined })
  await assert.rejects(client.download("corrupt", p), (e) => e.code === "DRIVE_CONTENT_CHANGED")
})

test("readonly OAuth denies writes before remote requests", async (t) => {
  const f = await connected(t, "readonly")
  let calls = 0
  const client = new LocalDriveClient(f.root, policy, {
    fetchImpl: () => {
      calls++
      throw Error("unexpected")
    },
  })
  await assert.rejects(client.upload("unused", {}), (e) => e.code === "DRIVE_WRITE_SCOPE_REQUIRED")
  assert.equal(calls, 0)
})

test("a 401 refreshes once; persistent rejection and incomplete listings never become success", async (t) => {
  const f = await connected(t),
    api = driveFixture()
  let rejected = 0,
    refreshed = 0
  const client = new LocalDriveClient(f.root, policy, {
    fetchImpl: async (url, init) => {
      if (url === "https://oauth2.googleapis.com/token") {
        refreshed++
        return json({
          access_token: "fixture-access-secret",
          token_type: "Bearer",
          expires_in: 3600,
        })
      }
      if (rejected++ === 0) return new Response(null, { status: 401 })
      return api.fetchImpl(url, init)
    },
  })
  assert.equal((await client.inProject("archive-parent")).id, "archive-parent")
  assert.equal(refreshed, 1)
  let attempts = 0
  const denied = new LocalDriveClient(f.root, policy, {
    fetchImpl: async (url) => {
      if (url === "https://oauth2.googleapis.com/token")
        return json({
          access_token: "fixture-access-secret",
          token_type: "Bearer",
          expires_in: 3600,
        })
      attempts++
      return new Response(null, { status: 401 })
    },
  })
  await assert.rejects(denied.inProject("archive-parent"), (e) => e.code === "DRIVE_HTTP_ERROR")
  assert.equal(attempts, 2)
  const incomplete = new LocalDriveClient(f.root, policy, {
    fetchImpl: async (url, init) =>
      new URL(url).pathname === "/drive/v3/files"
        ? json({ files: [], incompleteSearch: true })
        : api.fetchImpl(url, init),
  })
  await assert.rejects(incomplete.list("archive-parent"), (e) => e.code === "DRIVE_LIST_INCOMPLETE")
})

test("expired resumable sessions restart with the reserved file ID and untrusted session URLs are rejected", async (t) => {
  const f = await connected(t),
    api = driveFixture(),
    client = new LocalDriveClient(f.root, policy, api)
  const body = crypto.randomBytes(400000),
    relative = ".storage/expired-upload.zip"
  fs.writeFileSync(path.join(f.root, relative), body)
  const p = {
    sha256: hash(body),
    bytes: body.length,
    name: "expire.zip",
    parent_id: "archive-parent",
    mime_type: "application/zip",
  }
  api.failChunk()
  await assert.rejects(client.upload(relative, p), (e) => e.code === "DRIVE_TRANSFER_INTERRUPTED")
  api.sessions.clear()
  const result = await client.upload(relative, p)
  assert.equal(result.file_id, "reserved-1")
  assert.deepEqual(api.uploads, ["reserved-1", "reserved-1"])
  assert.equal(api.calls.filter((c) => c.path.endsWith("generateIds")).length, 1)
  let foreignCalls = 0
  const malicious = new LocalDriveClient(f.root, policy, {
    fetchImpl: async (url, init) => {
      if (new URL(url).origin !== "https://www.googleapis.com") foreignCalls++
      if (new URL(url).pathname === "/upload/drive/v3/files")
        return new Response(null, { headers: { Location: "https://example.com/token-theft" } })
      return api.fetchImpl(url, init)
    },
  })
  await assert.rejects(
    malicious.upload(relative, { ...p, name: "different.zip" }),
    (e) => e.code === "DRIVE_ENDPOINT_REJECTED",
  )
  assert.equal(foreignCalls, 0)
})

test("isolated cold storage archives, verifies raw ZIP members, restores exact files and imports its remote catalog", async (t) => {
  const f = await connected(t),
    api = driveFixture()
  const body = Buffer.from("preserve native IDs and source edition bytes\n".repeat(4000))
  const relative = "research/local-ai/documents/original/body.bin"
  fs.mkdirSync(path.dirname(path.join(f.root, relative)), { recursive: true })
  fs.writeFileSync(path.join(f.root, relative), body)
  storageAction(f.root, "prepare", { parent_id: "archive-parent" })
  const pushed = await driveStorageAction(f.repo, f.root, "remote-push", {}, api)
  assert.equal(pushed.status, "archived")
  assert.equal(pushed.results.length, 1)
  assert.equal(pushed.remaining_uploads, 0)
  const bundle = storageAction(f.root, "pending").uploads
  assert.equal(bundle.length, 0)
  const same = await driveStorageAction(
    f.repo,
    f.root,
    "remote-push",
    { bundle_id: pushed.results[0].bundle_id },
    api,
  )
  assert.equal(same.results[0].reused, true)
  assert.equal(same.catalog.file_id, pushed.catalog.file_id)
  assert.equal(storageAction(f.root, "pending").uploads.length, 0)
  storageAction(f.root, "enable")
  storageAction(f.root, "evict", { cache_bytes: 0 })
  assert.throws(
    () => safePath(f.root, relative),
    (e) => e.code === "STORAGE_PENDING",
  )
  const pulled = await driveStorageAction(f.repo, f.root, "remote-pull", {}, api)
  assert.equal(pulled.status, "hydrated")
  assert.equal(pulled.remaining_downloads, 0)
  assert.equal(pulled.domain_job_resumed, false)
  const before = api.calls.length
  assert.equal(
    (
      await driveStorageAction(
        f.repo,
        f.root,
        "remote-pull",
        { bundle_id: pulled.results[0].bundle_id },
        api,
      )
    ).status,
    "idle",
  )
  assert.equal(api.calls.length, before, "an already restored bundle performs no remote work")
  assert.deepEqual(fs.readFileSync(path.join(f.root, relative)), body)
  const fresh = await connected(t)
  const imported = await driveStorageAction(
    fresh.repo,
    fresh.root,
    "remote-import",
    { file_id: pushed.catalog.file_id, expected_sha256: pushed.catalog.sha256 },
    api,
  )
  assert.equal(imported.status, "catalog_restored")
  assert.equal(imported.restored_catalog.files, 1)
  assert.throws(
    () => safePath(fresh.root, relative),
    (e) => e.code === "STORAGE_PENDING",
  )
  await driveStorageAction(fresh.repo, fresh.root, "remote-pull", {}, api)
  assert.deepEqual(fs.readFileSync(path.join(fresh.root, relative)), body)
  assert.equal(api.uploads.length, 2, "one archive and one catalog; pulls never create Drive files")
})

test("regular transfers hold before credentials or network; setup errors retain pending input", async (t) => {
  const f = fixture(t)
  let calls = 0
  const options = {
    fetchImpl: () => {
      calls++
      throw Error("unexpected")
    },
  }
  const result = await driveStorageAction(f.repo, f.root, "remote-push", { regular: true }, options)
  assert.equal(result.status, "development_pending")
  assert.equal(calls, 0)
  assert.deepEqual(fs.readdirSync(f.root), [])
  await assert.rejects(
    driveStorageAction(f.repo, f.root, "remote-pull", {}, options),
    (e) => e.code === "DRIVE_SETUP_REQUIRED",
  )
  assert.equal(calls, 0)
  assert.deepEqual(fs.readdirSync(f.root), [])
})

test("ready phase keeps optional local transfers disabled before credentials or network", async (t) => {
  const f = fixture(t)
  const policyFile = path.join(f.repo, "data/research-operation-policy.json")
  const operationPolicy = JSON.parse(fs.readFileSync(policyFile, "utf8"))
  operationPolicy.phase = "ready"
  operationPolicy.optional_execution.ollama.enabled = false
  fs.writeFileSync(policyFile, JSON.stringify(operationPolicy))
  let calls = 0
  const result = await driveStorageAction(
    f.repo,
    f.root,
    "remote-push",
    { regular: true },
    {
      fetchImpl: () => {
        calls++
        throw Error("unexpected")
      },
    },
  )
  assert.equal(result.status, "executor_not_ready")
  assert.equal(result.operation_gate.reason, "local_executor_not_enabled")
  assert.equal(result.operation_gate.regular_execution_allowed, false)
  assert.equal(result.remote_requests, 0)
  assert.equal(result.remote_writes, 0)
  assert.equal(calls, 0)
  assert.deepEqual(fs.readdirSync(f.root), [])
})

test("existing collection.storage operation exposes local transfer actions", async (t) => {
  const f = fixture(t)
  const catalog = moduleCatalog()
  assert.equal(catalog.modules.length, 12)
  // Collection recovery is a separate operation; local Drive actions still
  // share the existing storage operation. The three batch/retirement additions
  // belong to reasoning, not extra storage operations.
  assert.equal(catalog.modules.flatMap((m) => m.operations).length, 75)
  assert.equal(
    catalog.modules.find((m) => m.id === "collection").operations.filter((o) => o.id === "storage")
      .length,
    1,
  )
  const result = await executeModule({ repo: f.repo, root: f.root }, "collection", "storage", {
    action: "remote-status",
  })
  assert.equal(result.auth.status, "setup_required")
  assert.equal(result.remote_requests, 0)
  assert.doesNotMatch(JSON.stringify(result), /access_token"|refresh_token"|client_secret"/)
})
