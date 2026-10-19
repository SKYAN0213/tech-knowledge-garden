const DIAGNOSTIC_SCHEMA = "research-cli-error/v1"
const STORAGE_REQUEST_SCHEMA = "research-storage-download-request/v1"

export function formatStoragePendingDiagnostic(error) {
  if (error?.code !== "STORAGE_PENDING" || !error.storage_request) return null
  return JSON.stringify({
    schema: DIAGNOSTIC_SCHEMA,
    code: error.code,
    message: String(error.message || "Drive payload download required"),
    storage_request: error.storage_request,
  })
}

export function parseStoragePendingDiagnostic(stderr) {
  const text = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr)
  for (const line of text.split(/\r?\n/).toReversed()) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line)
      if (
        value?.schema === DIAGNOSTIC_SCHEMA &&
        value.code === "STORAGE_PENDING" &&
        typeof value.message === "string" &&
        value.storage_request?.schema === STORAGE_REQUEST_SCHEMA &&
        Array.isArray(value.storage_request.requests)
      )
        return value
    } catch {
      // Stderr can contain ordinary diagnostics; only accept the versioned envelope.
    }
  }
  return null
}
