import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawn } from "node:child_process"
import { assertParse, sha256, sourceId } from "./contracts.mjs"
import { parseResearchDate } from "./dates.mjs"
import { atomicCreate, atomicWrite, safePath, readJSON } from "./run-state.mjs"

function parseContentFingerprint(parse) {
  const content = structuredClone(parse)
  delete content.dates?.observed_at
  return sha256(JSON.stringify(content))
}

// Compare the article text the editorial pipeline actually read. A page can
// change navigation, tracking or other HTML bytes without changing its title,
// publication date or selected content blocks. This is not a substitute for
// preserving and checking the full original source version.
export function articleContentFingerprint(parse) {
  if (
    parse?.status !== "extracted" ||
    typeof parse.title !== "string" ||
    !parse.title.trim() ||
    !(typeof parse.dates?.published_at === "string" || parse.dates?.published_at === null) ||
    !Array.isArray(parse.blocks) ||
    !parse.blocks.length ||
    parse.blocks.some((block) => typeof block.text !== "string" || !block.text.trim())
  )
    throw Error("Complete parsed article content required for fingerprint")
  return sha256(
    JSON.stringify({
      title: parse.title.trim(),
      published_at: parse.dates.published_at,
      blocks: parse.blocks.map((block) => block.text),
    }),
  )
}

// The parse identity describes source bytes and parser settings. A later 304
// observation has its own time in the run copy, but must not replace the
// content-addressed parse artifact used by an earlier run.
export function storeParseArtifact(root, parse) {
  assertParse(parse)
  const relative = `parses/${parse.parse_id}/parse.json`
  const existing = readJSON(root, relative)
  if (existing) {
    if (parseContentFingerprint(existing) !== parseContentFingerprint(parse))
      throw Error("Stored parse identity collision")
    return parse
  }
  atomicCreate(root, relative, parse)
  return parse
}

// Keep evidence cited by an earlier extraction alongside a newly parsed view
// of the same immutable response. Matching IDs must still describe identical
// content and observation; retention never replaces an earlier parse.
export function retainParse(parses, parse) {
  assertParse(parse)
  const existing = parses.find((item) => item.parse_id === parse.parse_id)
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(parse))
      throw Error("Retained parse identity collision")
  } else parses.push(parse)
  return parses
}

export function loadStoredSourceRun(root, runId, { allowUnacquired = false } = {}) {
  if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runId))
    throw Error("Invalid source run id")
  const documents = readJSON(root, `runs/${runId}/documents.json`),
    parses = readJSON(root, `runs/${runId}/parses.json`)
  assertStoredEvidence(root, documents, parses)
  if (
    !allowUnacquired &&
    documents.some((d) => !["captured", "not_modified"].includes(d.fetch_status))
  )
    throw Error("Stored source run contains an unacquired document")
  return {
    documents,
    parses,
    identity: {
      source_run: runId,
      documents_sha256: sha256(JSON.stringify(documents)),
      parses_sha256: sha256(JSON.stringify(parses)),
    },
  }
}

// Recover a fetch stage when collection saved the raw response but parsing
// failed before the run-level documents/parses snapshot was written.
export function loadCapturedStagesForReparse(root, runId) {
  if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runId))
    throw Error("Invalid source run id")
  const documentPath = `runs/${runId}/documents.json`
  if (fs.existsSync(safePath(root, documentPath)))
    return loadStoredSourceRun(root, runId, { allowUnacquired: true })

  const state = readJSON(root, `runs/${runId}/state.json`)
  if (state?.schema !== "research-run/v1" || state.run_id !== runId || !state.stages)
    throw Error("Stored fetch-stage state required for reparse recovery")
  const documents = []
  for (const [stageName, stage] of Object.entries(state.stages).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!stageName.startsWith("fetch-") || stage.status !== "complete") continue
    const expectedPath = `runs/${runId}/${stageName}.json`
    if (stage.result_path !== expectedPath || !/^[a-f0-9]{64}$/.test(stage.result_hash || ""))
      throw Error("Stored fetch stage identity is invalid")
    const document = readJSON(root, expectedPath)
    if (!document || sha256(JSON.stringify(document)) !== stage.result_hash)
      throw Error("Stored fetch stage checksum changed")
    if (document.source_id !== stageName.slice("fetch-".length))
      throw Error("Stored fetch stage source identity changed")
    if (documents.some((prior) => prior.source_id === document.source_id)) {
      const prior = documents.find((item) => item.source_id === document.source_id)
      if (prior.source_version_id !== document.source_version_id)
        throw Error("Stored fetch stages conflict for one source identity")
      continue
    }
    documents.push(document)
  }
  if (!documents.length) throw Error("No completed fetch stages are available to reparse")
  assertStoredEvidence(root, documents, [])
  return {
    documents,
    parses: [],
    identity: {
      source_run: runId,
      documents_sha256: sha256(JSON.stringify(documents)),
      parses_sha256: sha256(JSON.stringify([])),
    },
  }
}

// Combine independently captured source versions without fetching them again.
// Each input is byte-verified before the bundle is returned; duplicate source
// versions are rejected so a reparse cannot silently replace an earlier parse.
export function bundleStoredSourceRuns(root, runIds) {
  if (!Array.isArray(runIds) || runIds.length < 2 || runIds.length > 8)
    throw Error("Source bundle requires two to eight stored runs")
  if (new Set(runIds).size !== runIds.length) throw Error("Source bundle run ids must be unique")
  const inputs = runIds.map((id) => loadStoredSourceRun(root, id))
  const documents = inputs.flatMap((input) => input.documents)
  const parses = inputs.flatMap((input) => input.parses)
  if (new Set(documents.map((d) => d.source_version_id)).size !== documents.length)
    throw Error("Source bundle has duplicate source versions")
  assertStoredEvidence(root, documents, parses)
  return {
    documents,
    parses,
    identity: {
      source_runs: inputs.map((input) => input.identity),
      documents_sha256: sha256(JSON.stringify(documents)),
      parses_sha256: sha256(JSON.stringify(parses)),
    },
  }
}

// Reuse one or more exact source versions from a larger stored run for a
// separate event review. Do not refetch, reparse, or copy a neighboring event's
// evidence into the new review input.
export function selectStoredSources(root, runId, urls) {
  if (!Array.isArray(urls) || !urls.length || urls.length > 8 || new Set(urls).size !== urls.length)
    throw Error("Source selection requires one to eight unique original URLs")
  // A failed neighbor remains in the source-run receipt but must not prevent
  // review of an independently captured article from the same batch.
  const input = loadStoredSourceRun(root, runId, { allowUnacquired: true })
  const documents = urls.map((url) => {
    const matches = input.documents.filter((document) => document.original_url === url)
    if (matches.length !== 1) throw Error("Source selection needs one exact stored URL/version")
    if (!["captured", "not_modified"].includes(matches[0].fetch_status))
      throw Error("Selected source was not acquired")
    return matches[0]
  })
  const versions = new Set(documents.map((document) => document.source_version_id))
  const parses = input.parses.filter((parse) => versions.has(parse.source_version_id))
  if (
    parses.length !== documents.length ||
    documents.some(
      (document) =>
        parses.filter((parse) => parse.source_version_id === document.source_version_id).length !==
        1,
    )
  )
    throw Error("Source selection needs one parse per stored version")
  assertStoredEvidence(root, documents, parses)
  return {
    documents,
    parses,
    identity: {
      source_run: input.identity,
      selected_urls: urls,
      documents_sha256: sha256(JSON.stringify(documents)),
      parses_sha256: sha256(JSON.stringify(parses)),
    },
  }
}

// Check the real stored bytes and immutable parser artifact before review or
// approval. A run's copied metadata is insufficient evidence on its own.
export function assertStoredEvidence(root, documents, parses) {
  if (!Array.isArray(documents) || !documents.length || !Array.isArray(parses))
    throw Error("Stored source documents and parses required")
  if (new Set(parses.map((p) => p.parse_id)).size !== parses.length)
    throw Error("Unique stored parse identities required")
  for (const document of documents.filter((d) =>
    ["captured", "not_modified"].includes(d.fetch_status),
  )) {
    if (
      !/^[a-f0-9]{64}$/.test(document.body_sha256 || "") ||
      typeof document.original_url !== "string" ||
      document.source_id !== sourceId(document.original_url) ||
      document.source_version_id !== `${document.source_id}:${document.body_sha256}`
    )
      throw Error("Source document version/hash mismatch")
    if (
      !["captured", "not_modified"].includes(document.fetch_status) ||
      !parseResearchDate(document.observed_at)
    )
      throw Error("Captured source and valid observation timestamp required")
    const body = fs.readFileSync(safePath(root, document.body_path))
    if (sha256(body) !== document.body_sha256) throw Error("Stored original body hash mismatch")
  }
  for (const parse of parses) {
    assertParse(parse)
    const document = documents.find(
      (d) => d.source_id === parse.source_id && d.source_version_id === parse.source_version_id,
    )
    if (
      !/^[a-f0-9]{64}$/.test(parse.parse_id) ||
      !document ||
      !["captured", "not_modified"].includes(document.fetch_status)
    )
      throw Error("Parse must reference an exact stored source version")
    // Older valid parse artifacts may not include this optional field. When a
    // parser supplies it, its run-local value must match that observation.
    if (parse.dates?.observed_at && parse.dates.observed_at !== document.observed_at)
      throw Error("Parse observation does not match its stored source")
    const stored = JSON.parse(
      fs.readFileSync(safePath(root, `parses/${parse.parse_id}/parse.json`), "utf8"),
    )
    if (parseContentFingerprint(stored) !== parseContentFingerprint(parse))
      throw Error("Stored parse differs from the run's copied source evidence")
  }
  return parses
}

export async function parseDocument(root, document, options = {}) {
  if (!["captured", "not_modified"].includes(document.fetch_status))
    throw Error("Cannot parse an uncaptured source")
  const body = fs.readFileSync(safePath(root, document.body_path))
  if (sha256(body) !== document.body_sha256) throw Error("Parser input hash mismatch")
  const python = process.env.RESEARCH_PYTHON || path.resolve(root, "runtime/venv/bin/python")
  const request_id = crypto.randomUUID()
  const request = {
    schema_version: "research-worker/v1",
    request_id,
    operation: "parse",
    input_path: document.body_path,
    input_sha256: document.body_sha256,
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    url: document.final_url,
    mime_type: document.mime_type,
    observed_at: document.observed_at,
    options,
  }
  const result = await new Promise((resolve, reject) => {
    const worker = spawn(
      python,
      ["integrations/research-worker/worker.py", "--root", path.resolve(root)],
      { stdio: ["pipe", "pipe", "pipe"] },
    )
    // Preserve UTF-8 characters split across pipe chunks (Japanese/PDF tables are often large).
    worker.stdout.setEncoding("utf8")
    worker.stderr.setEncoding("utf8")
    let output = "",
      diagnostic = ""
    const timer = setTimeout(() => {
      worker.kill("SIGKILL")
      reject(Error("Parser time budget exceeded"))
    }, options.timeout_ms || 120000)
    worker.stdout.on("data", (b) => {
      output += b
      if (output.length > 20 * 1024 ** 2) {
        worker.kill("SIGKILL")
        reject(Error("Parser output too large"))
      }
    })
    worker.stderr.on("data", (b) => {
      diagnostic = (diagnostic + b).slice(-4000)
    })
    worker.once("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    worker.once("close", (code) => {
      clearTimeout(timer)
      try {
        if (code !== 0) throw Error("Worker failed: " + diagnostic)
        const lines = output.trim().split("\n")
        if (lines.length !== 1) throw Error("Invalid worker JSON-lines output")
        const response = JSON.parse(lines[0])
        if (response.request_id !== request_id || response.worker_status !== "complete")
          throw Error(response.error || "Worker identity mismatch")
        resolve(assertParse(response.result))
      } catch (e) {
        reject(e)
      }
    })
    worker.stdin.end(JSON.stringify(request) + "\n")
  })
  return storeParseArtifact(root, result)
}
