import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sourceVersionId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, RunState } from "../scripts/research/run-state.mjs"
import { buildSourceRegister, archiveManifest } from "../scripts/research/archive.mjs"
import { main } from "../scripts/research.mjs"

function fixture(t, url = "https://example.com/research/") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-register-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = Buffer.from("Archived original evidence"),
    id = sourceId(url),
    hash = sha256(body)
  const record = {
    schema_version: "source-document/v1",
    source_id: id,
    source_version_id: sourceVersionId(id, hash),
    body_sha256: hash,
    body_path: `documents/${id}/${hash}/body.bin`,
    original_url: url,
    final_url: url.slice(0, -1),
    fetch_status: "captured",
    observed_at: "2020-01-01T00:00:00Z",
  }
  atomicWrite(root, record.body_path, body)
  const first = `documents/${id}/${hash}/document.json`
  atomicWrite(root, first, record)
  return { root, record, first, body, id, hash }
}

test("source register keeps verified first observations and never promotes article review", (t) => {
  const { root, record, first } = fixture(t)
  atomicWrite(root, `documents/${record.source_id}/latest.json`, {
    ...record,
    observed_at: "2020-02-01T00:00:00Z",
  })
  const output = buildSourceRegister(root)
  assert.equal(output.schema_version, "local-ai-source-register/v2")
  assert.equal(output.metadata_complete, true)
  assert.equal(output.sources.length, 1)
  assert.equal(output.sources[0].observed_at, record.observed_at)
  assert.equal(output.sources[0].article_review_status, "unreviewed")
  assert.equal(output.capture_is_article_review, false)
  assert.equal(output.sources[0].metadata_provenance.status, "verified")
  assert.equal(output.sources[0].metadata_provenance.selected_metadata_path, first)
})

test("URL metadata reconciliation uses an exact acquired version and preserves the failed capture", (t) => {
  const { root, record, first, body } = fixture(t)
  const incorrect = { ...record, original_url: record.original_url.slice(0, -1) }
  atomicWrite(root, first, incorrect)
  const before = fs.readFileSync(path.join(root, first))
  const attempt = `documents/${record.source_id}/attempts/fixed.json`
  const correction = {
    ...record,
    fetch_status: "not_modified",
    observed_at: "2020-02-01T00:00:00Z",
  }
  atomicWrite(root, attempt, correction)
  atomicWrite(root, `documents/${record.source_id}/latest.json`, {
    ...record,
    observed_at: "2020-03-01T00:00:00Z",
  })
  const result = buildSourceRegister(root),
    entry = result.sources[0]
  assert.equal(result.metadata_complete, true)
  assert.equal(entry.original_url, record.original_url)
  assert.equal(entry.observed_at, correction.observed_at)
  assert.equal(entry.fetch_status, "not_modified")
  assert.equal(entry.metadata_provenance.status, "reconciled_from_observation")
  assert.equal(entry.metadata_provenance.selected_metadata_path, attempt)
  assert.equal(entry.metadata_provenance.first_capture_metadata_sha256, sha256(before))
  assert.deepEqual(fs.readFileSync(path.join(root, first)), before)
  assert.deepEqual(fs.readFileSync(path.join(root, record.body_path)), body)
})

test("unresolved versions are explicit and cannot borrow a different, failed or undated observation", (t) => {
  const { root, record, first } = fixture(t)
  atomicWrite(root, first, { ...record, original_url: record.original_url.slice(0, -1) })
  const different = {
    ...record,
    body_sha256: sha256("Other version"),
    source_version_id: sourceVersionId(record.source_id, sha256("Other version")),
  }
  atomicWrite(root, `documents/${record.source_id}/latest.json`, different)
  atomicWrite(root, `documents/${record.source_id}/attempts/failed.json`, {
    ...record,
    fetch_status: "failed",
  })
  atomicWrite(root, `documents/${record.source_id}/attempts/no-time.json`, {
    ...record,
    observed_at: "2020-01-01",
  })
  const output = buildSourceRegister(root)
  assert.equal(output.metadata_complete, false)
  assert.deepEqual(output.sources, [])
  assert.equal(output.unresolved_versions.length, 1)
  assert.equal(output.unresolved_versions[0].source_version_id, record.source_version_id)
  assert.equal(output.unresolved_versions[0].reason, "no_valid_version_observation")
  assert.equal("original_url" in output.unresolved_versions[0], false)
})

test("corrupted source bytes and observation symlinks stop source register generation", (t) => {
  const { root, record } = fixture(t)
  fs.writeFileSync(path.join(root, record.body_path), "Corrupted")
  assert.throws(() => buildSourceRegister(root), /body hash mismatch/)
  fs.writeFileSync(path.join(root, record.body_path), "Archived original evidence")
  fs.symlinkSync(os.tmpdir(), path.join(root, `documents/${record.source_id}/attempts`))
  assert.throws(() => buildSourceRegister(root), /Symlink/)
})

test("registered URL identity can repair spelling only with matching ID, request identity and preserved evidence", (t) => {
  const { root, record, first } = fixture(t)
  const incorrect = { ...record, original_url: record.original_url.slice(0, -1) }
  atomicWrite(root, first, incorrect)
  const before = fs.readFileSync(path.join(root, first))
  atomicWrite(root, "registered-urls.json", {
    schema: "source-url-inputs/v1",
    urls: [record.original_url],
  })
  const result = buildSourceRegister(root, { url_reference_path: "registered-urls.json" })
  assert.equal(result.metadata_complete, true)
  assert.equal(result.sources[0].observed_at, record.observed_at)
  assert.equal(result.sources[0].metadata_provenance.status, "reconciled_url_identity")
  assert.equal(
    result.sources[0].metadata_provenance.url_reference_sha256,
    sha256(fs.readFileSync(path.join(root, "registered-urls.json"))),
  )
  assert.equal(result.sources[0].metadata_provenance.changes[0].before, incorrect.original_url)
  assert.deepEqual(fs.readFileSync(path.join(root, first)), before)
  atomicWrite(root, "registered-urls.json", {
    schema: "source-url-inputs/v1",
    urls: ["https://example.com/other"],
  })
  assert.equal(
    buildSourceRegister(root, { url_reference_path: "registered-urls.json" }).metadata_complete,
    false,
  )
  atomicWrite(root, first, { ...record, original_url: "https://example.com/unrelated" })
  atomicWrite(root, "registered-urls.json", {
    schema: "source-url-inputs/v1",
    urls: [record.original_url],
  })
  assert.equal(
    buildSourceRegister(root, { url_reference_path: "registered-urls.json" }).metadata_complete,
    false,
  )
})

test("source register CLI runs without model/network access and stores its exact result", async (t) => {
  const { root } = fixture(t)
  const previous = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previous
  })
  globalThis.fetch = async () => {
    throw Error("Source register must not call a model or network")
  }
  const receipt = await main(["source-register", "--root", root, "--run", "source-audit"])
  assert.equal(receipt.versions, 1)
  assert.equal(receipt.unresolved, 0)
  assert.equal(receipt.candidate_published, false)
  assert.equal(readJSON(root, "runs/source-audit/source-register.json").metadata_complete, true)
})

test("source register uses byte-verified browser resource references and rejects a modified capture", async (t) => {
  const { root, record, first } = fixture(t)
  atomicWrite(root, first, { ...record, original_url: record.original_url.slice(0, -1) })
  const body = Buffer.from("<html>Browser capture fixture</html>"),
    resources = [
      { url: record.original_url, source_version_id: record.source_version_id, status: "captured" },
    ],
    capture = sha256(JSON.stringify([record.source_version_id, sha256(body), resources]))
  atomicWrite(root, `renders/${capture}/body.html`, body)
  atomicWrite(root, `renders/${capture}/manifest.json`, {
    capture_id: capture,
    original_source_version_id: record.source_version_id,
    body_sha256: sha256(body),
    resources,
  })
  const result = await main(["source-register", "--root", root, "--run", "render-reference"])
  assert.equal(result.metadata_complete, true)
  assert.equal(
    readJSON(root, "runs/render-reference/source-register.json").sources[0].metadata_provenance
      .status,
    "reconciled_url_identity",
  )
  atomicWrite(root, `renders/${capture}/body.html`, "Corrupted")
  await assert.rejects(
    main(["source-register", "--root", root, "--run", "render-corrupted"]),
    /reference hash mismatch/,
  )
})

test("archives preserve raw listing pages and captured checkpoints even when article arrays are empty", async (t) => {
  const { root, record } = fixture(t)
  atomicWrite(root, "runs/acquisition/documents.json", [])
  atomicWrite(root, "runs/acquisition/parses.json", [])
  atomicWrite(root, "runs/acquisition/list-pages.json", [record])
  const state = new RunState(root, "acquisition", {})
  await state.stage("page", {}, async () => record)
  const manifest = archiveManifest(root, "acquisition")
  assert.equal(manifest.files.filter((f) => f.drive_root === "Sources").length, 1)
  atomicWrite(root, "runs/acquisition/list-pages.json", [])
  assert.equal(
    archiveManifest(root, "acquisition").files.filter((f) => f.drive_root === "Sources").length,
    1,
  )
  atomicWrite(root, "runs/acquisition/page.json", { ...record, http_status: 999 })
  assert.throws(() => archiveManifest(root, "acquisition"), /checkpoint hash mismatch/)
})
