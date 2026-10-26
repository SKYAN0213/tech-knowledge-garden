import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { safePath } from "./run-state.mjs"

// A connector-returned transport reference is consumed once. Its signed URL is
// never stored in a receipt, logged, used as source evidence or retried here.
export async function materializeConnectorFile(root, request, { fetchImpl = fetch } = {}) {
  const {
    file_uri: uri,
    expected_sha256: expected,
    expected_size: size,
    destination_name: name,
  } = request
  if (
    !uri ||
    typeof uri !== "object" ||
    typeof uri.download_url !== "string" ||
    typeof uri.file_id !== "string" ||
    !uri.file_id ||
    uri.file_name !== request.file_name ||
    !/^[a-f0-9]{64}$/.test(expected || "") ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 256 * 1024 * 1024 ||
    !/^[A-Za-z0-9._-]{1,160}$/.test(name || "")
  )
    throw Error("Exact connector reference and expected bytes required")
  const url = new URL(uri.download_url)
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw Error("HTTPS connector download reference required")
  const directory = safePath(root, ".storage/incoming", { materialize: false })
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const destination = safePath(root, `.storage/incoming/${name}`, { materialize: false })
  const digestFile = async (file) => {
    const hash = crypto.createHash("sha256")
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest("hex")
  }
  if (fs.existsSync(destination)) {
    if (fs.statSync(destination).size !== size || (await digestFile(destination)) !== expected)
      throw Error("Existing connector bytes conflict with the pinned request")
    return {
      status: "materialized",
      path: path.relative(root, destination),
      bytes: size,
      sha256: expected,
      reused: true,
    }
  }
  const partial = destination + ".part"
  const fd = fs.openSync(partial, "wx", 0o600)
  let written = 0
  const digest = crypto.createHash("sha256")
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(60000), redirect: "error" })
    if (!response.ok || !response.body) throw Error("Connector download failed")
    for await (const chunk of response.body) {
      written += chunk.length
      if (written > size) throw Error("Connector download exceeds expected bytes")
      let offset = 0
      while (offset < chunk.length) offset += fs.writeSync(fd, chunk, offset, chunk.length - offset)
      digest.update(chunk)
    }
    if (written !== size || digest.digest("hex") !== expected)
      throw Error("Connector download differs from pinned bytes")
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fs.linkSync(partial, destination)
    fs.unlinkSync(partial)
    return {
      status: "materialized",
      path: path.relative(root, destination),
      bytes: size,
      sha256: expected,
      reused: false,
    }
  } catch (error) {
    try {
      fs.closeSync(fd)
    } catch {
      /* Already closed after verification. */
    }
    // Only this call's exclusive transport partial may be removed.
    fs.unlinkSync(partial)
    throw Error(
      error.message.startsWith("Connector ") ? error.message : "Connector materialization failed",
    )
  }
}
