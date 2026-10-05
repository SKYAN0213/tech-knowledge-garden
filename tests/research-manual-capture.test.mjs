import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { archiveClosure } from "../scripts/research/archive-closure.mjs"
import { loadStoredSourceRun, storeParseArtifact } from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  buildSourceRegister,
  readableCaptureBody,
  assertReadableCaptureEvidence,
  archiveManifest,
  inspectManualCapture,
  storeManualCapture,
} from "../scripts/research/archive.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "manual-source-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.com/research/",
    body = Buffer.from("<html><article><h1>Original report</h1></article></html>"),
    blockedRun = "blocked-original",
    manifestPath = "captures/example/manifest.json",
    source = {
      name: "example",
      original_url: url,
      final_url: url,
      observed_at: "2026-09-27T22:49:53Z",
      http_status: 200,
      mime_type: "text/html; charset=utf-8",
      etag: null,
      last_modified: null,
      body_sha256: sha256(body),
      body_bytes: body.length,
      body_path: "example.html",
    }
  atomicWrite(root, "captures/example/example.html", body)
  atomicWrite(root, manifestPath, {
    schema: "manual-http-capture/v1",
    article_review_status: "unreviewed",
    sources: [source],
  })
  atomicWrite(root, `runs/${blockedRun}/documents.json`, [
    {
      original_url: url,
      source_id: sourceId(url),
      fetch_status: "blocked",
      http_status: 403,
      policy_status: "checked",
      policy: { allowed: true },
    },
  ])
  return { root, body, source, blockedRun, manifestPath }
}

test("manual capture imports immutable bytes while keeping the collector's 403 and unreviewed state", (t) => {
  const { root, body, source, blockedRun, manifestPath } = fixture(t)
  const blockedPath = `runs/${blockedRun}/documents.json`
  const blockedBytes = fs.readFileSync(path.join(root, blockedPath))
  const inspected = inspectManualCapture(root, manifestPath, blockedRun)
  const [record] = storeManualCapture(root, inspected)
  assert.equal(record.source_id, sourceId(source.original_url))
  assert.equal(record.body_sha256, sha256(body))
  assert.equal(record.capture_method, "manual-https")
  assert.equal(record.article_review_status, "unreviewed")
  assert.equal(record.capture_provenance.blocked_documents_sha256, sha256(blockedBytes))
  assert.deepEqual(fs.readFileSync(path.join(root, record.body_path)), body)
  assert.deepEqual(fs.readFileSync(path.join(root, blockedPath)), blockedBytes)
  assert.equal(readJSON(root, `documents/${record.source_id}/latest.json`), null)
  assert.deepEqual(storeManualCapture(root, inspected), [record])
  const registered = buildSourceRegister(root)
  assert.equal(registered.metadata_complete, true)
  assert.equal(registered.sources[0].source_version_id, record.source_version_id)
  assert.equal(registered.sources[0].article_review_status, "unreviewed")
})

test("capture validation rejects changed bytes and a path outside the declared capture", (t) => {
  const { root, source, blockedRun, manifestPath } = fixture(t)
  atomicWrite(root, "captures/example/example.html", "changed")
  assert.throws(
    () => inspectManualCapture(root, manifestPath, blockedRun),
    /body hash\/size mismatch/,
  )
  atomicWrite(
    root,
    "captures/example/example.html",
    "<html><article><h1>Original report</h1></article></html>",
  )
  atomicWrite(root, manifestPath, {
    schema: "manual-http-capture/v1",
    article_review_status: "unreviewed",
    sources: [{ ...source, body_path: "../other.html" }],
  })
  assert.throws(
    () => inspectManualCapture(root, manifestPath, blockedRun),
    /Invalid manual capture entry/,
  )
  assert.equal(fs.existsSync(path.join(root, "documents")), false)
})

test("capture validation requires the exact allowed blocked attempt and unique source identity", (t) => {
  const { root, source, blockedRun, manifestPath } = fixture(t)
  atomicWrite(root, `runs/${blockedRun}/documents.json`, [
    {
      original_url: source.original_url,
      source_id: sourceId(source.original_url),
      fetch_status: "blocked",
      http_status: 403,
      policy_status: "denied",
      policy: { allowed: false },
    },
  ])
  assert.throws(
    () => inspectManualCapture(root, manifestPath, blockedRun),
    /policy-allowed blocked attempt/,
  )
  atomicWrite(root, `runs/${blockedRun}/documents.json`, [
    {
      original_url: source.original_url,
      source_id: sourceId(source.original_url),
      fetch_status: "blocked",
      http_status: 403,
      policy_status: "checked",
      policy: { allowed: true },
    },
  ])
  atomicWrite(root, manifestPath, {
    schema: "manual-http-capture/v1",
    article_review_status: "unreviewed",
    sources: [source, source],
  })
  assert.throws(
    () => inspectManualCapture(root, manifestPath, blockedRun),
    /Duplicate manual source identity/,
  )
  assert.equal(fs.existsSync(path.join(root, "documents")), false)
})

test("manual capture never overwrites a corrupted stored source version", (t) => {
  const { root, blockedRun, manifestPath } = fixture(t)
  const inspected = inspectManualCapture(root, manifestPath, blockedRun)
  const [record] = storeManualCapture(root, inspected)
  fs.writeFileSync(path.join(root, record.body_path), "corrupt")
  assert.throws(() => storeManualCapture(root, inspected), /body corrupted/)
})

function readableFixture(t) {
  const f = fixture(t)
  const transcript = Buffer.from(
    `Original report (${f.source.final_url})\nciteturn1view0 [wordlim: 200] Total lines: 4\nL0: August 3, 2026\nL1: \nL2: # Original report L3: A directly readable public announcement.\n`,
  )
  const source = {
    ...f.source,
    http_status: null,
    mime_type: "text/markdown",
    body_path: "example.md",
    readable: {
      provider: "web.run",
      source_reference: "turn1view0",
      first_line: 0,
      last_line: 3,
      transcript_path: "example.txt",
      transcript_sha256: sha256(transcript),
    },
    parse_options: {
      markdown_publication_date_line: 1,
      publication_date_pattern: "[A-Z][a-z]+ [0-9]{1,2}, [0-9]{4}",
      publication_date_format: "%B %d, %Y",
    },
  }
  const body = readableCaptureBody(transcript.toString(), source)
  source.body_sha256 = sha256(body)
  source.body_bytes = body.length
  atomicWrite(f.root, "captures/example/example.txt", transcript)
  atomicWrite(f.root, "captures/example/example.md", body)
  const manifest = {
    schema: "manual-readable-capture/v1",
    article_review_status: "unreviewed",
    sources: [source],
  }
  atomicWrite(f.root, f.manifestPath, manifest)
  return { ...f, source, transcript, body, manifest }
}

test("readable capture preserves tool evidence without inventing HTTP 200 or replacing a blocked attempt", (t) => {
  const f = readableFixture(t)
  const blocked = fs.readFileSync(path.join(f.root, `runs/${f.blockedRun}/documents.json`))
  const inspected = inspectManualCapture(f.root, f.manifestPath, f.blockedRun)
  assert.equal(inspected.entries[0].readableEvidence.sha256, sha256(f.transcript))
  const [record] = storeManualCapture(f.root, inspected)
  assert.equal(record.http_status, null)
  assert.equal(record.capture_method, "manual-readable-tool")
  assert.equal(record.article_review_status, "unreviewed")
  assert.deepEqual(fs.readFileSync(path.join(f.root, record.body_path)), f.body)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, `runs/${f.blockedRun}/documents.json`)),
    blocked,
  )
  assert.deepEqual(storeManualCapture(f.root, inspected), [record])
})

test("readable capture rejects invented status, changed transcript, or edited normalized text", (t) => {
  const f = readableFixture(t)
  atomicWrite(f.root, f.manifestPath, {
    ...f.manifest,
    sources: [{ ...f.source, http_status: 200 }],
  })
  assert.throws(
    () => inspectManualCapture(f.root, f.manifestPath, f.blockedRun),
    /Invalid manual capture entry/,
  )
  atomicWrite(f.root, f.manifestPath, f.manifest)
  atomicWrite(f.root, "captures/example/example.txt", "changed")
  assert.throws(
    () => inspectManualCapture(f.root, f.manifestPath, f.blockedRun),
    /transcript hash\/size/,
  )
  atomicWrite(f.root, "captures/example/example.txt", f.transcript)
  const changed = Buffer.from("# A different report\n")
  atomicWrite(f.root, "captures/example/example.md", changed)
  atomicWrite(f.root, f.manifestPath, {
    ...f.manifest,
    sources: [{ ...f.source, body_sha256: sha256(changed), body_bytes: changed.length }],
  })
  assert.throws(
    () => inspectManualCapture(f.root, f.manifestPath, f.blockedRun),
    /differs from recorded source lines/,
  )
})

test("readable normalization refuses a different page, missing lines, and ambiguous references", (t) => {
  const { transcript, source } = readableFixture(t)
  assert.throws(
    () =>
      readableCaptureBody(transcript.toString(), {
        ...source,
        final_url: "https://example.com/elsewhere/",
      }),
    /Exact readable page/,
  )
  assert.throws(
    () => readableCaptureBody(transcript.toString().replace(" L3:", " L4:"), source),
    /missing, repeated or unordered/,
  )
  assert.throws(
    () => readableCaptureBody(transcript.toString() + transcript.toString(), source),
    /Exact readable page/,
  )
  assert.throws(
    () => readableCaptureBody(transcript.toString().replace("L2:", "L1:"), source),
    /missing, repeated or unordered/,
  )
})

test("readable capture accepts a bounded title line and rejects invalid title selectors", (t) => {
  const f = readableFixture(t)
  const titleOptions = { ...f.source.parse_options, markdown_title_line: 3 }
  atomicWrite(f.root, f.manifestPath, {
    ...f.manifest,
    sources: [{ ...f.source, parse_options: titleOptions }],
  })
  assert.doesNotThrow(() => inspectManualCapture(f.root, f.manifestPath, f.blockedRun))
  for (const markdown_title_line of [true, 0, "3", 5]) {
    atomicWrite(f.root, f.manifestPath, {
      ...f.manifest,
      sources: [{ ...f.source, parse_options: { ...titleOptions, markdown_title_line } }],
    })
    assert.throws(
      () => inspectManualCapture(f.root, f.manifestPath, f.blockedRun),
      /explicit date parse options/,
    )
  }
})

test("source evidence checks re-read the tool and blocked observations before approving readable facts", (t) => {
  const f = readableFixture(t)
  const inspected = inspectManualCapture(f.root, f.manifestPath, f.blockedRun)
  const prefix = "runs/readable-import/capture-evidence"
  inspected.identity.evidence_paths = [
    `${prefix}/manifest.json`,
    `${prefix}/blocked-documents.json`,
    `${prefix}/example.txt`,
  ]
  atomicWrite(
    f.root,
    inspected.identity.evidence_paths[0],
    fs.readFileSync(path.join(f.root, f.manifestPath)),
  )
  atomicWrite(
    f.root,
    inspected.identity.evidence_paths[1],
    fs.readFileSync(path.join(f.root, `runs/${f.blockedRun}/documents.json`)),
  )
  atomicWrite(f.root, inspected.identity.evidence_paths[2], f.transcript)
  const [record] = storeManualCapture(f.root, inspected)
  assert.doesNotThrow(() => assertReadableCaptureEvidence(f.root, record, f.body))
  atomicWrite(f.root, "runs/extracted/documents.json", [record])
  const archived = archiveManifest(f.root, "extracted")
  assert.ok(
    inspected.identity.evidence_paths.every((p) => archived.files.some((file) => file.path === p)),
  )
  assert.equal(buildSourceRegister(f.root).metadata_complete, true)
  atomicWrite(f.root, inspected.identity.evidence_paths[2], "changed")
  assert.throws(
    () => assertReadableCaptureEvidence(f.root, record, f.body),
    /transcript hash mismatch/,
  )
  assert.throws(() => archiveManifest(f.root, "extracted"), /transcript hash mismatch/)
  assert.equal(buildSourceRegister(f.root).metadata_complete, false)
  atomicWrite(f.root, inspected.identity.evidence_paths[2], f.transcript)
  atomicWrite(f.root, inspected.identity.evidence_paths[1], "[]")
  assert.throws(
    () => assertReadableCaptureEvidence(f.root, record, f.body),
    /blocked observation hash mismatch/,
  )
})

test("portable closure follows the readable import and restores its exact proof before reuse", async (t) => {
  const f = readableFixture(t)
  const inspected = inspectManualCapture(f.root, f.manifestPath, f.blockedRun)
  const prefix = "runs/readable-import/capture-evidence"
  inspected.identity.evidence_paths = [
    `${prefix}/manifest.json`,
    `${prefix}/blocked-documents.json`,
    `${prefix}/example.txt`,
  ]
  atomicWrite(
    f.root,
    inspected.identity.evidence_paths[0],
    fs.readFileSync(path.join(f.root, f.manifestPath)),
  )
  atomicWrite(
    f.root,
    inspected.identity.evidence_paths[1],
    fs.readFileSync(path.join(f.root, `runs/${f.blockedRun}/documents.json`)),
  )
  atomicWrite(f.root, inspected.identity.evidence_paths[2], f.transcript)
  const [record] = storeManualCapture(f.root, inspected)
  const parseId = sha256("readable-parse")
  const parsed = {
    schema_version: "source-parse/v1",
    source_id: record.source_id,
    source_version_id: record.source_version_id,
    parse_id: parseId,
    title: "Original report",
    status: "extracted",
    dates: { published_at: "2026-08-03" },
    blocks: [
      {
        block_id: parseId + ":b1",
        text: f.body.toString(),
        locator: { text_hash: sha256(f.body) },
      },
    ],
    quality: { missing_pages: [] },
  }
  storeParseArtifact(f.root, parsed)
  for (const run of ["readable-import", "extracted"]) {
    atomicWrite(f.root, `runs/${run}/documents.json`, [record])
    atomicWrite(f.root, `runs/${run}/parses.json`, [parsed])
  }
  const result = await archiveClosure(f.root, "portable", "extracted")
  assert.ok(result.bound_runs.includes("readable-import"))
  const manifest = readJSON(f.root, "runs/portable/archive-manifest.json")
  assert.ok(
    manifest.dependencies.some(
      (edge) =>
        edge.from === "extracted" &&
        edge.to === "readable-import" &&
        edge.kind === "readable_capture",
    ),
  )
  const restored = spawnSync(
    "python3",
    [
      path.resolve("scripts/research/package-archive.py"),
      "--root",
      f.root,
      "--package",
      result.package.path,
      "--expected-sha256",
      result.package.sha256,
      "--restore-to",
      "restore/readable",
    ],
    { encoding: "utf8" },
  )
  assert.equal(restored.status, 0, restored.stderr)
  const fresh = path.join(f.root, "restore/readable")
  assert.deepEqual(loadStoredSourceRun(fresh, "extracted").documents, [record])
  atomicWrite(fresh, inspected.identity.evidence_paths[2], "changed")
  assert.throws(() => loadStoredSourceRun(fresh, "extracted"), /transcript hash mismatch/)
  atomicWrite(f.root, "runs/readable-import/documents.json", [])
  await assert.rejects(
    () => archiveClosure(f.root, "changed", "extracted"),
    /Stored source documents and parses required/,
  )
  atomicWrite(f.root, "runs/readable-import/documents.json", [
    { ...record, article_review_status: "verified" },
  ])
  await assert.rejects(
    () => archiveClosure(f.root, "changed-status", "extracted"),
    /Readable capture dependency changed/,
  )
})
