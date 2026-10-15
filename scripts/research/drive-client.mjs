import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { safePath } from "./run-state.mjs"
import {
  DriveError,
  driveAccessToken,
  driveAuthStatus,
  readDrivePrivate,
  writeDrivePrivate,
} from "./drive-auth.mjs"

const API = "https://www.googleapis.com/drive/v3/files"
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
const FOLDER = "application/vnd.google-apps.folder"
const FIELDS = "id,name,mimeType,size,parents,shared,trashed,modifiedTime,version,sha256Checksum"
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex")
export function driveFileId(id) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id || "")) throw Error("Invalid Drive file ID")
  return id
}
export async function fileSHA256(file) {
  const digest = crypto.createHash("sha256")
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk)
  return digest.digest("hex")
}
function googleURL(value) {
  const url = new URL(value)
  if (
    url.origin !== "https://www.googleapis.com" ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/(?:upload\/)?drive\/v3\/files(?:\/|$)/.test(url.pathname)
  )
    throw new DriveError("DRIVE_ENDPOINT_REJECTED", "Unexpected Google Drive endpoint")
  return url.toString()
}
function revision(m) {
  return JSON.stringify([m.id, m.modifiedTime, m.version, m.size, m.parents])
}
function offset(response, bytes) {
  const range = response.headers.get("range")
  if (!range) return 0
  const match = /^bytes=0-(\d+)$/.exec(range)
  const end = Number(match?.[1]) + 1
  if (!match || !Number.isSafeInteger(end) || end > bytes || end <= 0)
    throw new DriveError("DRIVE_UPLOAD_PROTOCOL", "Invalid resumable upload range")
  return end
}
async function cancel(response) {
  if (response.body) await response.body.cancel()
}

// No model or connector credentials enter this transport. Production URLs are
// fixed; injectable fetch is used only by isolated protocol tests.
export class LocalDriveClient {
  constructor(root, policy, { fetchImpl = fetch } = {}) {
    this.root = path.resolve(root)
    this.policy = policy
    this.fetch = fetchImpl
    driveFileId(policy.root_folder_id)
    if (
      !Number.isSafeInteger(policy.chunk_bytes) ||
      policy.chunk_bytes < 256 * 1024 ||
      policy.chunk_bytes > 16 * 1024 ** 2 ||
      policy.chunk_bytes % (256 * 1024) ||
      !Number.isSafeInteger(policy.timeout_ms) ||
      policy.timeout_ms < 1000 ||
      policy.timeout_ms > 120000
    )
      throw Error("Invalid Drive transfer policy")
  }
  async request(url, init = {}, accepted = []) {
    const endpoint = googleURL(url)
    let token = await driveAccessToken(this.root, { fetchImpl: this.fetch })
    for (let attempt = 0; attempt < 2; attempt++) {
      let response
      try {
        response = await this.fetch(endpoint, {
          ...init,
          redirect: "manual",
          signal: AbortSignal.timeout(this.policy.timeout_ms),
          headers: { ...init.headers, Authorization: `Bearer ${token}` },
        })
      } catch {
        throw new DriveError(
          "DRIVE_TRANSFER_INTERRUPTED",
          "Drive request interrupted; resume the same transfer explicitly",
        )
      }
      if (response.status === 401 && attempt === 0) {
        await cancel(response)
        token = await driveAccessToken(this.root, {
          forceRefresh: true,
          rejectedToken: token,
          fetchImpl: this.fetch,
        })
        continue
      }
      if (!response.ok && !accepted.includes(response.status)) {
        const status = response.status
        const retryAfter = response.headers.get("retry-after")
        await cancel(response)
        throw new DriveError(
          status === 404 ? "DRIVE_NOT_FOUND" : "DRIVE_HTTP_ERROR",
          `Drive request rejected (HTTP ${status})`,
          {
            http_status: status,
            ...(retryAfter && /^\d{1,8}$/.test(retryAfter)
              ? { retry_after_seconds: Number(retryAfter) }
              : {}),
          },
        )
      }
      return response
    }
  }
  async metadata(id, { allowMissing = false } = {}) {
    const response = await this.request(
      `${API}/${driveFileId(id)}?fields=${encodeURIComponent(FIELDS)}`,
      {},
      allowMissing ? [404] : [],
    )
    if (response.status === 404) {
      await cancel(response)
      return null
    }
    const m = await response.json()
    if (
      m.id !== id ||
      m.shared !== false ||
      m.trashed !== false ||
      !Array.isArray(m.parents) ||
      typeof m.name !== "string" ||
      typeof m.mimeType !== "string"
    )
      throw new DriveError(
        "DRIVE_PRIVATE_SCOPE",
        "Drive file is shared, trashed or has incomplete metadata",
      )
    return m
  }
  async inProject(id) {
    const seen = new Set()
    let first
    for (let current = driveFileId(id); seen.size < 32;) {
      if (seen.has(current)) break
      seen.add(current)
      const m = await this.metadata(current)
      first ||= m
      if (m.mimeType === "application/vnd.google-apps.shortcut")
        throw new DriveError(
          "DRIVE_PRIVATE_SCOPE",
          "Drive shortcuts are outside the private archive contract",
        )
      if (current === this.policy.root_folder_id) {
        if (m.mimeType !== FOLDER)
          throw new DriveError("DRIVE_PRIVATE_SCOPE", "Project Drive root must be a folder")
        return first
      }
      if (m.parents.length !== 1 || (current !== id && m.mimeType !== FOLDER)) break
      current = driveFileId(m.parents[0])
    }
    throw new DriveError("DRIVE_PRIVATE_SCOPE", "Drive file is outside the configured project root")
  }
  async list(parent) {
    if ((await this.inProject(parent)).mimeType !== FOLDER)
      throw Error("Drive listing requires a folder")
    const files = [],
      pages = new Set(),
      ids = new Set()
    let page = ""
    do {
      if (pages.has(page) || pages.size >= 100)
        throw new DriveError("DRIVE_LIST_INCOMPLETE", "Drive pagination did not complete")
      pages.add(page)
      const query = new URLSearchParams({
        q: `'${driveFileId(parent)}' in parents and trashed = false`,
        fields: `nextPageToken,incompleteSearch,files(${FIELDS})`,
        pageSize: "1000",
        spaces: "drive",
        ...(page ? { pageToken: page } : {}),
      })
      const data = await (await this.request(`${API}?${query}`)).json()
      if (data.incompleteSearch || !Array.isArray(data.files))
        throw new DriveError("DRIVE_LIST_INCOMPLETE", "Drive returned an incomplete listing")
      for (const m of data.files) {
        if (
          ids.has(m.id) ||
          m.shared !== false ||
          m.trashed !== false ||
          !m.parents?.includes(parent)
        )
          throw new DriveError(
            "DRIVE_LIST_INCOMPLETE",
            "Drive listing contains conflicting or nonprivate entries",
          )
        ids.add(driveFileId(m.id))
        files.push(m)
      }
      page = data.nextPageToken || ""
    } while (page)
    return { files, pages: pages.size, complete: true }
  }
  async download(id, { sha256, bytes, parent_id }) {
    if (
      !/^[a-f0-9]{64}$/.test(sha256 || "") ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > this.policy.maximum_bundle_bytes
    )
      throw Error("An expected Drive content SHA and bounded byte size are required")
    let metadata = await this.inProject(id)
    const check = (m) => {
      if (
        Number(m.size) !== bytes ||
        m.mimeType.startsWith("application/vnd.google-apps.") ||
        (parent_id && !m.parents.includes(parent_id)) ||
        (m.sha256Checksum && m.sha256Checksum !== sha256)
      )
        throw new DriveError(
          "DRIVE_CONTENT_CHANGED",
          "Drive metadata differs from the expected private bytes",
        )
    }
    check(metadata)
    const identity = hash(`${id}:${sha256}`),
      journal = `transfers/download-${identity}.json`
    const relative = `.storage/incoming/local-${identity}.bin`
    const destination = safePath(this.root, relative, { materialize: false })
    const partial = safePath(this.root, relative + ".part", { materialize: false })
    const previous = readDrivePrivate(this.root, journal)
    if (previous && (previous.revision !== revision(metadata) || previous.bytes !== bytes))
      throw new DriveError(
        "DRIVE_CONTENT_CHANGED",
        "Drive revision changed during a download; preserve the interrupted transfer",
      )
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
    if (fs.existsSync(destination)) {
      if (
        !previous ||
        fs.statSync(destination).size !== bytes ||
        (await fileSHA256(destination)) !== sha256
      )
        throw new DriveError("DRIVE_CONTENT_CHANGED", "Preserve conflicting local download bytes")
      return { metadata, path: relative, sha256, bytes, observed_at: new Date().toISOString() }
    }
    if (fs.existsSync(partial) && !previous)
      throw Error("Preserve an untracked partial Drive download")
    const start = fs.existsSync(partial) ? fs.statSync(partial).size : 0
    if (start > bytes) throw Error("Partial Drive download exceeds the expected size")
    writeDrivePrivate(this.root, journal, {
      file_id: id,
      sha256,
      bytes,
      revision: revision(metadata),
      status: "downloading",
    })
    if (start < bytes) {
      const response = await this.request(
        `${API}/${driveFileId(id)}?alt=media`,
        { headers: start ? { Range: `bytes=${start}-` } : {} },
        [206],
      )
      let append = false
      if (response.status === 206) {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "")
        if (
          !match ||
          Number(match[1]) !== start ||
          Number(match[2]) !== bytes - 1 ||
          Number(match[3]) !== bytes
        ) {
          await cancel(response)
          throw new DriveError("DRIVE_DOWNLOAD_PROTOCOL", "Unexpected Drive download range")
        }
        append = start > 0
      }
      const fd = fs.openSync(partial, append ? "a" : "w", 0o600)
      let length = append ? start : 0
      try {
        for await (const chunk of response.body) {
          length += chunk.length
          if (length > bytes)
            throw new DriveError(
              "DRIVE_CONTENT_CHANGED",
              "Drive download exceeds the expected size",
            )
          fs.writeFileSync(fd, chunk)
        }
      } catch (error) {
        if (error instanceof DriveError) throw error
        throw new DriveError(
          "DRIVE_TRANSFER_INTERRUPTED",
          "Drive download interrupted; partial bytes are preserved",
        )
      } finally {
        fs.fsyncSync(fd)
        fs.closeSync(fd)
      }
    }
    if (fs.statSync(partial).size !== bytes || (await fileSHA256(partial)) !== sha256)
      throw new DriveError(
        "DRIVE_CONTENT_CHANGED",
        "Drive download does not match the expected SHA and size",
      )
    const fresh = await this.inProject(id)
    check(fresh)
    if (revision(fresh) !== revision(metadata))
      throw new DriveError("DRIVE_CONTENT_CHANGED", "Drive changed while reading back bytes")
    metadata = fresh
    fs.renameSync(partial, destination)
    writeDrivePrivate(this.root, journal, {
      file_id: id,
      sha256,
      bytes,
      revision: revision(metadata),
      status: "downloaded",
    })
    return { metadata, path: relative, sha256, bytes, observed_at: new Date().toISOString() }
  }
  async upload(localPath, { sha256, bytes, name, parent_id, mime_type }) {
    if (driveAuthStatus(this.root).mode !== "readwrite")
      throw new DriveError(
        "DRIVE_WRITE_SCOPE_REQUIRED",
        "Configure readwrite OAuth access before saving Drive archives",
      )
    if (
      !/^[a-f0-9]{64}$/.test(sha256 || "") ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > this.policy.maximum_bundle_bytes ||
      typeof name !== "string" ||
      !name ||
      name.length > 200 ||
      /[\/\\\x00-\x1f]/.test(name) ||
      !["application/zip", "application/gzip"].includes(mime_type)
    )
      throw Error("Invalid private archive upload")
    const file = safePath(this.root, localPath)
    if (
      !fs.statSync(file).isFile() ||
      fs.statSync(file).size !== bytes ||
      (await fileSHA256(file)) !== sha256
    )
      throw new DriveError("DRIVE_CONTENT_CHANGED", "Prepared archive changed before upload")
    if ((await this.inProject(parent_id)).mimeType !== FOLDER)
      throw Error("Drive upload parent must be a folder")
    const identity = hash(JSON.stringify([parent_id, name, sha256, bytes, mime_type]))
    const journal = `transfers/upload-${identity}.json`
    let state = readDrivePrivate(this.root, journal)
    if (!state) {
      const ids = await (
        await this.request(`${API}/generateIds?count=1&space=drive&type=files`)
      ).json()
      if (ids.ids?.length !== 1)
        throw new DriveError("DRIVE_UPLOAD_PROTOCOL", "Drive did not allocate one file ID")
      state = {
        schema: "research-drive-upload/v1",
        file_id: driveFileId(ids.ids[0]),
        sha256,
        bytes,
        name,
        parent_id,
        mime_type,
        status: "prepared",
        session: null,
      }
      writeDrivePrivate(this.root, journal, state)
    }
    const save = (changes) => {
      state = { ...state, ...changes }
      writeDrivePrivate(this.root, journal, state)
    }
    const finish = async () => {
      const result = await this.download(state.file_id, { sha256, bytes, parent_id })
      if (result.metadata.mimeType !== mime_type)
        throw new DriveError("DRIVE_CONTENT_CHANGED", "Uploaded Drive MIME type differs")
      save({ status: "verified", session: null })
      return { ...result, file_id: state.file_id }
    }
    const existing = await this.metadata(state.file_id, { allowMissing: true })
    if (existing && Number(existing.size) === bytes) return finish()
    if (existing && !state.session)
      throw new DriveError(
        "DRIVE_CONTENT_CHANGED",
        "Preserve conflicting content at the reserved Drive ID",
      )
    let start = 0
    if (state.session) {
      const response = await this.request(
        state.session,
        { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${bytes}` } },
        [308, 404],
      )
      if (response.ok) {
        await cancel(response)
        return finish()
      }
      if (response.status === 308) start = offset(response, bytes)
      else save({ session: null, status: "session_expired" })
      await cancel(response)
    }
    if (!state.session) {
      const response = await this.request(
        `${UPLOAD}?uploadType=resumable&fields=${encodeURIComponent(FIELDS)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime_type,
            "X-Upload-Content-Length": String(bytes),
          },
          body: JSON.stringify({
            id: state.file_id,
            name,
            parents: [parent_id],
            mimeType: mime_type,
            appProperties: { garden_sha256: sha256 },
          }),
        },
      )
      const location = response.headers.get("location")
      await cancel(response)
      if (!location)
        throw new DriveError("DRIVE_UPLOAD_PROTOCOL", "Drive did not return an upload session")
      save({ session: googleURL(location), status: "uploading" })
    }
    if (start === bytes)
      throw new DriveError(
        "DRIVE_UPLOAD_PROTOCOL",
        "Drive has all bytes but did not confirm completion; query the same transfer again",
      )
    const fd = fs.openSync(file, "r")
    try {
      while (start < bytes) {
        const end = Math.min(start + this.policy.chunk_bytes, bytes)
        const chunk = Buffer.allocUnsafe(end - start)
        if (fs.readSync(fd, chunk, 0, chunk.length, start) !== chunk.length)
          throw new DriveError("DRIVE_CONTENT_CHANGED", "Prepared archive shortened during upload")
        // Journal already contains the same ID/session before any uncertain PUT.
        save({ status: "uploading", confirmed_bytes: start })
        const response = await this.request(
          state.session,
          {
            method: "PUT",
            headers: {
              "Content-Type": mime_type,
              "Content-Length": String(chunk.length),
              "Content-Range": `bytes ${start}-${end - 1}/${bytes}`,
            },
            body: chunk,
          },
          [308],
        )
        if (response.ok) {
          await cancel(response)
          return finish()
        }
        const next = offset(response, bytes)
        await cancel(response)
        if (next <= start || next > end)
          throw new DriveError(
            "DRIVE_UPLOAD_PROTOCOL",
            "Drive did not acknowledge a valid next chunk",
          )
        start = next
      }
    } finally {
      fs.closeSync(fd)
    }
    throw new DriveError("DRIVE_UPLOAD_PROTOCOL", "Drive upload completion was not confirmed")
  }
}
