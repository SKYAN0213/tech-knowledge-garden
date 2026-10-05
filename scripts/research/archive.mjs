import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { sourceId, sourceVersionId, sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, safePath, readJSON } from "./run-state.mjs"
import { parseResearchDate } from "./dates.mjs"
import { assertURL } from "./fetch.mjs"
import { canonicalURL } from "../garden.mjs"

// Preserve the original capture and select only an independently stored,
// byte-matching observation when its URL metadata needs reconciliation.
export function buildSourceRegister(root, { url_reference_path = null } = {}) {
  const directory = safePath(root, "documents")
  const sources = [],
    unresolved_versions = []
  const reference = url_reference_path ? readJSON(root, url_reference_path) : null
  if (
    url_reference_path &&
    (reference?.schema !== "source-url-inputs/v1" ||
      !Array.isArray(reference.urls) ||
      reference.urls.some((url) => typeof url !== "string"))
  )
    throw Error("Invalid source URL reference")
  const referencedURLs = new Map((reference?.urls || []).map((url) => [sourceId(url), url]))
  const folders = (base) =>
    fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  for (const source of fs.existsSync(directory) ? folders(directory) : []) {
    if (source.isSymbolicLink()) throw Error("Symlink in source register")
    if (!source.isDirectory()) continue
    if (!/^[a-f0-9]{20}$/.test(source.name)) throw Error("Unsupported stored source identity")
    const base = path.join(directory, source.name)
    const observationPaths = []
    if (fs.existsSync(path.join(base, "latest.json")))
      observationPaths.push(path.join(base, "latest.json"))
    const attempts = safePath(root, `documents/${source.name}/attempts`)
    if (fs.existsSync(attempts))
      for (const attempt of folders(attempts)) {
        if (attempt.isSymbolicLink()) throw Error("Symlink in source observations")
        if (attempt.isFile() && attempt.name.endsWith(".json"))
          observationPaths.push(path.join(attempts, attempt.name))
      }
    const observations = observationPaths.map((file) => ({
      file,
      record: readJSON(root, path.relative(root, file)),
    }))
    for (const version of folders(base)) {
      if (version.isSymbolicLink()) throw Error("Symlink in source version")
      if (!version.isDirectory() || version.name === "attempts") continue
      if (!/^[a-f0-9]{64}$/.test(version.name)) throw Error("Unsupported stored source version")
      const bodyPath = `documents/${source.name}/${version.name}/body.bin`
      const body = fs.readFileSync(safePath(root, bodyPath))
      if (sha256(body) !== version.name) throw Error("Source register body hash mismatch")
      const firstPath = `documents/${source.name}/${version.name}/document.json`
      const first = readJSON(root, firstPath)
      const publicURL = (url) => {
        try {
          assertURL(url)
          return true
        } catch {
          return false
        }
      }
      const valid = (record) => {
        if (!(
          record &&
          record.schema_version === "source-document/v1" &&
          record.source_id === source.name &&
          record.body_sha256 === version.name &&
          record.source_version_id === sourceVersionId(source.name, version.name) &&
          record.body_path === bodyPath &&
          typeof record.original_url === "string" &&
          publicURL(record.original_url) &&
          sourceId(record.original_url) === source.name &&
          ["captured", "not_modified"].includes(record.fetch_status) &&
          parseResearchDate(record.observed_at)?.precision === "timestamp"
        ))
          return false
        if (record.capture_method === "manual-readable-tool") {
          try {
            assertReadableCaptureEvidence(root, record, body)
          } catch {
            return false
          }
        }
        return true
      }
      let selected = valid(first)
        ? { file: safePath(root, firstPath), record: first }
        : observations
            .filter((entry) => valid(entry.record))
            .sort(
              (a, b) =>
                Date.parse(a.record.observed_at) - Date.parse(b.record.observed_at) ||
                a.file.localeCompare(b.file),
            )[0]
      const knownURL = referencedURLs.get(source.name)
      if (
        !selected &&
        knownURL &&
        first &&
        valid({ ...first, original_url: knownURL }) &&
        canonicalURL(first.original_url) === canonicalURL(knownURL)
      )
        selected = {
          file: safePath(root, firstPath),
          record: { ...first, original_url: knownURL },
          reconciliation: {
            url_reference_path,
            url_reference_sha256: sha256(fs.readFileSync(safePath(root, url_reference_path))),
            reconciled_at: new Date().toISOString(),
            changes: [{ field: "original_url", before: first.original_url, after: knownURL }],
          },
        }
      if (!selected) {
        unresolved_versions.push({
          source_id: source.name,
          source_version_id: sourceVersionId(source.name, version.name),
          body_sha256: version.name,
          body_path: bodyPath,
          first_capture_metadata_path: fs.existsSync(safePath(root, firstPath)) ? firstPath : null,
          reason: "no_valid_version_observation",
        })
        continue
      }
      sources.push({
        ...selected.record,
        article_review_status: "unreviewed",
        metadata_provenance: {
          status: valid(first)
            ? "verified"
            : selected.reconciliation
              ? "reconciled_url_identity"
              : "reconciled_from_observation",
          first_capture_metadata_path: fs.existsSync(safePath(root, firstPath)) ? firstPath : null,
          first_capture_metadata_sha256: first
            ? sha256(fs.readFileSync(safePath(root, firstPath)))
            : null,
          selected_metadata_path: path.relative(root, selected.file).split(path.sep).join("/"),
          selected_metadata_sha256: sha256(
            fs.readFileSync(safePath(root, path.relative(root, selected.file))),
          ),
          ...(selected.reconciliation || {}),
        },
      })
    }
  }
  return {
    schema_version: "local-ai-source-register/v2",
    generated_at: new Date().toISOString(),
    sources,
    unresolved_versions,
    metadata_complete: unresolved_versions.length === 0,
    capture_is_article_review: false,
  }
}

export function importLegacySources(root, register, snapshotRoot) {
  const results = [],
    index = readJSON(root, "registry-state/legacy-source-index.json") || {}
  for (const entry of register.sources) {
    if (entry.status !== "captured_unreviewed" || !entry.snapshot || !entry.sha256) continue
    if (entry.source_id !== sourceId(entry.url)) throw Error("Legacy source ID changed")
    const raw = fs.readFileSync(safePath(snapshotRoot, entry.snapshot))
    if (sha256(raw) !== entry.sha256) throw Error("Legacy source snapshot hash mismatch")
    const body =
      raw[0] === 0x1f && raw[1] === 0x8b
        ? zlib.gunzipSync(raw, { maxOutputLength: 50 * 1024 ** 2 })
        : raw
    const hash = sha256(body),
      id = entry.source_id
    const record = {
      schema_version: "source-document/v1",
      source_id: id,
      source_version_id: sourceVersionId(id, hash),
      original_url: entry.url,
      final_url: entry.final_url || entry.url,
      observed_at: entry.attempted_at,
      fetch_status: "captured",
      mime_type: entry.content_type,
      body_sha256: hash,
      body_path: `documents/${id}/${hash}/body.bin`,
      legacy_raw_sha256: entry.sha256,
      imported_from: "prepare-drive",
      article_review_status: "unreviewed",
    }
    const old = readJSON(root, `documents/${id}/${hash}/document.json`)
    if (!old) {
      atomicWrite(root, record.body_path, body)
      atomicWrite(root, `documents/${id}/${hash}/document.json`, record)
    } else if (sha256(fs.readFileSync(safePath(root, old.body_path))) !== hash)
      throw Error("Existing source version corrupted")
    // Do not turn a historical import into a latest conditional-request cache.
    index[entry.url] = { source_id: id, source_version_id: record.source_version_id }
    results.push(record)
  }
  atomicWrite(root, "registry-state/legacy-source-index.json", index)
  return results
}

// Import a separately captured public source without rewriting the collector's
// blocked attempt or pretending that the normal fetch route succeeded. Inspect
// every entry before writing any source version, then create immutable copies.
export function readableCaptureBody(transcript, source) {
  const normalization = source.readable
  if (
    normalization?.provider !== "web.run" ||
    !/^[a-zA-Z0-9]+$/.test(normalization.source_reference || "") ||
    !Number.isInteger(normalization.first_line) ||
    !Number.isInteger(normalization.last_line) ||
    normalization.first_line < 0 ||
    normalization.last_line < normalization.first_line ||
    normalization.last_line - normalization.first_line >= 5000
  )
    throw Error("Explicit readable source reference and bounded lines required")
  const headers = [
    ...transcript.matchAll(/^.+ \((https:\/\/[^\r\n]+)\)\r?\ncite([a-zA-Z0-9]+)[^\n]*\n/gm),
  ]
  const matching = headers.filter(
    (h) => h[1] === source.final_url && h[2] === normalization.source_reference,
  )
  if (matching.length !== 1) throw Error("Exact readable page URL/reference required")
  const header = matching[0],
    next = headers[headers.indexOf(header) + 1],
    page = transcript.slice(header.index + header[0].length, next?.index ?? transcript.length),
    lines = [...page.matchAll(/(?:^|\n| )L(\d+):[ \t]?([\s\S]*?)(?=(?:\n| )L\d+:|$)/g)]
      .map((m) => ({ number: Number(m[1]), text: m[2].replace(/\n$/, "") }))
      .filter(
        (line) => line.number >= normalization.first_line && line.number <= normalization.last_line,
      )
  if (
    lines.length !== normalization.last_line - normalization.first_line + 1 ||
    lines.some((line, index) => line.number !== normalization.first_line + index)
  )
    throw Error("Readable source range contains missing, repeated or unordered lines")
  return Buffer.from(lines.map((line) => line.text).join("\n") + "\n")
}

export function inspectManualCapture(root, manifestPath, blockedRunId) {
  if (typeof manifestPath !== "string" || !manifestPath.endsWith(".json"))
    throw Error("Manual capture manifest path required")
  if (typeof blockedRunId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(blockedRunId))
    throw Error("Blocked source run id required")
  const manifestBytes = fs.readFileSync(safePath(root, manifestPath))
  const manifest = JSON.parse(manifestBytes)
  if (
    !["manual-http-capture/v1", "manual-readable-capture/v1"].includes(manifest.schema) ||
    manifest.article_review_status !== "unreviewed" ||
    !Array.isArray(manifest.sources) ||
    !manifest.sources.length ||
    manifest.sources.length > 8
  )
    throw Error("Invalid manual capture manifest")
  const blockedPath = `runs/${blockedRunId}/documents.json`
  const blockedBytes = fs.readFileSync(safePath(root, blockedPath))
  const blocked = JSON.parse(blockedBytes)
  if (!Array.isArray(blocked)) throw Error("Invalid blocked source run")
  const seen = new Set()
  const readable = manifest.schema === "manual-readable-capture/v1"
  const entries = manifest.sources.map((source) => {
    if (
      !source ||
      typeof source !== "object" ||
      typeof source.name !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(source.name) ||
      source.body_path !==
        `${source.name}.${readable ? "md" : source.mime_type?.startsWith("application/pdf") ? "pdf" : "html"}` ||
      source.http_status !== (readable ? null : 200) ||
      !(readable ? ["text/markdown"] : ["text/html", "application/pdf"]).some(
        (mime) => source.mime_type?.split(";")[0] === mime,
      ) ||
      !/^[a-f0-9]{64}$/.test(source.body_sha256 || "") ||
      !Number.isInteger(source.body_bytes) ||
      source.body_bytes < 1 ||
      source.body_bytes > (source.mime_type.startsWith("application/pdf") ? 50 : 10) * 1024 ** 2 ||
      parseResearchDate(source.observed_at)?.precision !== "timestamp"
    )
      throw Error("Invalid manual capture entry")
    assertURL(source.original_url)
    assertURL(source.final_url)
    if (new URL(source.original_url).origin !== new URL(source.final_url).origin)
      throw Error("Manual capture redirected to another origin")
    const id = sourceId(source.original_url)
    if (seen.has(id)) throw Error("Duplicate manual source identity")
    seen.add(id)
    const attempt = blocked.find((candidate) => candidate.original_url === source.original_url)
    if (
      !attempt ||
      attempt.source_id !== id ||
      attempt.fetch_status !== "blocked" ||
      attempt.http_status !== 403 ||
      attempt.policy_status !== "checked" ||
      attempt.policy?.allowed !== true
    )
      throw Error("Matching policy-allowed blocked attempt required")
    const localPath = path.posix.join(path.posix.dirname(manifestPath), source.body_path)
    const body = fs.readFileSync(safePath(root, localPath))
    if (body.length !== source.body_bytes || sha256(body) !== source.body_sha256)
      throw Error("Manual capture body hash/size mismatch")
    let readableEvidence = null
    if (readable) {
      const evidencePath = path.posix.join(path.posix.dirname(manifestPath), `${source.name}.txt`)
      if (
        source.readable?.transcript_path !== `${source.name}.txt` ||
        !/^[a-f0-9]{64}$/.test(source.readable?.transcript_sha256 || "") ||
        (source.parse_options?.markdown_title_line !== undefined &&
          (!Number.isInteger(source.parse_options.markdown_title_line) ||
            source.parse_options.markdown_title_line < 1 ||
            source.parse_options.markdown_title_line >
              source.readable.last_line - source.readable.first_line + 1)) ||
        !Number.isInteger(source.parse_options?.markdown_publication_date_line) ||
        source.parse_options.markdown_publication_date_line < 1 ||
        source.parse_options.markdown_publication_date_line >
          source.readable.last_line - source.readable.first_line + 1 ||
        ![
          source.parse_options.publication_date_pattern,
          source.parse_options.publication_date_format,
        ].every((value) => typeof value === "string" && value.length > 0 && value.length <= 512) ||
        Object.keys(source.parse_options).some(
          (key) =>
            ![
              "markdown_publication_date_line",
              "publication_date_pattern",
              "publication_date_format",
              "markdown_title_line",
            ].includes(key),
        )
      )
        throw Error("Readable capture needs exact transcript and explicit date parse options")
      const transcript = fs.readFileSync(safePath(root, evidencePath))
      if (
        transcript.length > 10 * 1024 ** 2 ||
        sha256(transcript) !== source.readable.transcript_sha256
      )
        throw Error("Readable transcript hash/size mismatch")
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(transcript)
      if (!readableCaptureBody(decoded, source).equals(body))
        throw Error("Readable body differs from recorded source lines")
      readableEvidence = { path: evidencePath, body: transcript, sha256: sha256(transcript) }
    }
    return { source, body, id, localPath, readableEvidence }
  })
  return {
    entries,
    identity: {
      manifest_path: manifestPath,
      manifest_sha256: sha256(manifestBytes),
      blocked_run_id: blockedRunId,
      blocked_documents_sha256: sha256(blockedBytes),
      capture_schema: manifest.schema,
      source_versions: entries.map(({ source, id }) => sourceVersionId(id, source.body_sha256)),
    },
  }
}

export function storeManualCapture(root, inspected) {
  if (!inspected?.entries?.length || !inspected.identity) throw Error("Inspected capture required")
  return inspected.entries.map(({ source, body, id, localPath }) => {
    const hash = source.body_sha256
    const bodyPath = `documents/${id}/${hash}/body.bin`
    const record = {
      schema_version: "source-document/v1",
      source_id: id,
      source_version_id: sourceVersionId(id, hash),
      original_url: source.original_url,
      final_url: source.final_url,
      observed_at: source.observed_at,
      fetch_status: "captured",
      http_status: source.http_status,
      mime_type: source.mime_type,
      etag: source.etag || null,
      last_modified: source.last_modified || null,
      body_sha256: hash,
      body_path: bodyPath,
      article_review_status: "unreviewed",
      capture_method:
        inspected.identity.capture_schema === "manual-readable-capture/v1"
          ? "manual-readable-tool"
          : "manual-https",
      capture_provenance: {
        local_path: localPath,
        manifest_path: inspected.identity.manifest_path,
        manifest_sha256: inspected.identity.manifest_sha256,
        blocked_run_id: inspected.identity.blocked_run_id,
        blocked_documents_sha256: inspected.identity.blocked_documents_sha256,
        ...(source.readable
          ? { readable: source.readable, evidence_paths: inspected.identity.evidence_paths }
          : {}),
      },
    }
    const storedBody = safePath(root, bodyPath)
    if (fs.existsSync(storedBody)) {
      if (sha256(fs.readFileSync(storedBody)) !== hash)
        throw Error("Stored manual source body corrupted")
    } else atomicCreate(root, bodyPath, body)
    const first = `documents/${id}/${hash}/document.json`
    const previous = readJSON(root, first)
    if (previous) {
      if (
        previous.source_id !== id ||
        previous.source_version_id !== record.source_version_id ||
        previous.body_sha256 !== hash ||
        previous.original_url !== source.original_url ||
        previous.body_path !== bodyPath ||
        !["captured", "not_modified"].includes(previous.fetch_status)
      )
        throw Error("Existing manual source metadata conflicts")
    } else atomicCreate(root, first, record)
    const readableSuffix = source.readable
      ? `-${sha256(JSON.stringify(record.capture_provenance)).slice(0, 12)}`
      : ""
    const attemptPath = `documents/${id}/attempts/manual-${sha256(source.observed_at).slice(0, 16)}-${hash.slice(0, 12)}${readableSuffix}.json`
    const previousAttempt = readJSON(root, attemptPath)
    if (previousAttempt) {
      if (sha256(JSON.stringify(previousAttempt)) !== sha256(JSON.stringify(record)))
        throw Error("Existing manual capture observation conflicts")
    } else atomicCreate(root, attemptPath, record)
    return record
  })
}

// A readable snapshot is evidence only while its exact tool observation and
// failed collector observation remain available, including after restoration.
export function assertReadableCaptureEvidence(root, document, body) {
  if (document.capture_method !== "manual-readable-tool") return
  const provenance = document.capture_provenance
  const paths = provenance?.evidence_paths
  if (
    document.http_status !== null ||
    !Array.isArray(paths) ||
    paths.length < 3 ||
    paths.length > 10 ||
    new Set(paths).size !== paths.length ||
    !/^runs\/[a-zA-Z0-9_-]+\/capture-evidence\/manifest\.json$/.test(paths[0] || "")
  )
    throw Error("Readable capture provenance is incomplete")
  const prefix = path.posix.dirname(paths[0])
  if (paths.some((p) => path.posix.dirname(p) !== prefix))
    throw Error("Readable capture evidence paths differ")
  const manifestBytes = fs.readFileSync(safePath(root, paths[0]))
  if (sha256(manifestBytes) !== provenance.manifest_sha256)
    throw Error("Stored readable manifest hash mismatch")
  const manifest = JSON.parse(manifestBytes)
  const matching = manifest.sources?.filter((s) => s.original_url === document.original_url)
  if (manifest.schema !== "manual-readable-capture/v1" || matching?.length !== 1)
    throw Error("Stored readable manifest source identity mismatch")
  const source = matching[0]
  if (
    source.body_sha256 !== document.body_sha256 ||
    source.body_bytes !== body.length ||
    source.observed_at !== document.observed_at ||
    source.final_url !== document.final_url ||
    source.mime_type !== document.mime_type ||
    source.http_status !== null ||
    JSON.stringify(source.readable) !== JSON.stringify(provenance.readable)
  )
    throw Error("Readable document differs from its recorded observation")
  const blockedPath = `${prefix}/blocked-documents.json`
  const transcriptPath = `${prefix}/${source.name}.txt`
  if (!paths.includes(blockedPath) || !paths.includes(transcriptPath))
    throw Error("Readable capture original observations missing")
  const blockedBytes = fs.readFileSync(safePath(root, blockedPath))
  if (sha256(blockedBytes) !== provenance.blocked_documents_sha256)
    throw Error("Stored readable blocked observation hash mismatch")
  const blocked = JSON.parse(blockedBytes).find((d) => d.original_url === source.original_url)
  if (
    blocked?.source_id !== document.source_id ||
    blocked.fetch_status !== "blocked" ||
    blocked.http_status !== 403 ||
    blocked.policy_status !== "checked" ||
    blocked.policy?.allowed !== true
  )
    throw Error("Readable capture blocked observation differs")
  const transcript = fs.readFileSync(safePath(root, transcriptPath))
  if (sha256(transcript) !== source.readable.transcript_sha256)
    throw Error("Stored readable transcript hash mismatch")
  if (
    !readableCaptureBody(
      new TextDecoder("utf-8", { fatal: true }).decode(transcript),
      source,
    ).equals(body)
  )
    throw Error("Stored readable body differs from source lines")
}
export function archiveManifest(root, runId) {
  const base = safePath(root, `runs/${runId}`)
  const manifestPath = path.join(base, "archive-manifest.json")
  const results = []
  const walk = (folder) => {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name)
      if (file === manifestPath) continue
      if (item.isSymbolicLink()) throw Error("Symlink in research archive")
      if (item.isDirectory()) walk(file)
      else {
        const body = fs.readFileSync(file)
        results.push({
          path: path.relative(root, file),
          bytes: body.length,
          sha256: sha256(body),
          drive_root: "Research",
          public: false,
        })
      }
    }
  }
  walk(base)
  const documentsPath = `runs/${runId}/documents.json`
  const documents = readJSON(root, documentsPath)
  const sourceFiles = new Map()
  for (const document of documents || []) {
    if (!["captured", "not_modified"].includes(document.fetch_status)) continue
    if (
      !/^[a-f0-9]{20}$/.test(document.source_id || "") ||
      !/^[a-f0-9]{64}$/.test(document.body_sha256 || "") ||
      document.source_version_id !== sourceVersionId(document.source_id, document.body_sha256) ||
      typeof document.body_path !== "string" ||
      !document.body_path.endsWith("/body.bin")
    )
      throw Error("Captured source is missing a valid immutable body reference")
    const bodyPath = safePath(root, document.body_path)
    const body = fs.readFileSync(bodyPath)
    if (sha256(body) !== document.body_sha256)
      throw Error("Captured source body hash mismatch: " + document.source_version_id)
    assertReadableCaptureEvidence(root, document, body)
    if (document.capture_method === "manual-readable-tool") {
      for (const relative of document.capture_provenance.evidence_paths) {
        const evidence = fs.readFileSync(safePath(root, relative))
        if (!results.some((file) => file.path === relative))
          results.push({
            path: relative,
            bytes: evidence.length,
            sha256: sha256(evidence),
            drive_root: "Research",
            public: false,
          })
      }
    }
    const previous = sourceFiles.get(document.body_path)
    if (previous && previous.source_version_id !== document.source_version_id)
      throw Error("Conflicting source versions share one archive path")
    sourceFiles.set(document.body_path, {
      path: document.body_path,
      bytes: body.length,
      sha256: document.body_sha256,
      drive_root: "Sources",
      public: false,
      source_id: document.source_id,
      source_version_id: document.source_version_id,
    })
  }
  results.push(...sourceFiles.values())
  results.sort((a, b) => a.path.localeCompare(b.path))
  return {
    schema: "research-archive/v1",
    run_id: runId,
    created_at: new Date().toISOString(),
    files: results,
    drive_verified: false,
  }
}

export function packageResearchArchive(root, runId) {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "package-archive.py")
  const result = spawnSync("python3", [script, "--root", path.resolve(root), "--run", runId], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  if (result.error) throw Error("Research archive packaging failed: " + result.error.message)
  if (result.status !== 0)
    throw Error("Research archive packaging failed: " + (result.stderr || "unknown error").trim())
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw Error("Research archive packager returned invalid JSON")
  }
}
