import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import {
  buildSourceRegister,
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
