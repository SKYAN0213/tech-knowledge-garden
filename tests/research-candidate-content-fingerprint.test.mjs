import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildCandidateContentFingerprintEvidence,
  projectVerifiedCandidateContentFingerprints,
} from "../scripts/research/candidate-content-fingerprint.mjs"
import { main as researchMain } from "../scripts/research.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

function setup(t) {
  const workspace = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "candidate-fingerprint-")),
  )
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  return {
    workspace,
    root: path.join(workspace, "research"),
    backlogPath: path.join(workspace, "candidate-backlog.json"),
  }
}

function addStoredSource(root, { runId, url, bodyText, publishedAt = "2026-09-13" }) {
  const body = Buffer.from(bodyText)
  const bodySha = sha256(body)
  const source = sourceId(url)
  const version = `${source}:${bodySha}`
  const observedAt = "2026-09-14T01:00:00Z"
  const document = {
    schema_version: "source-document/v1",
    source_id: source,
    source_version_id: version,
    original_url: url,
    final_url: url,
    body_path: `documents/${source}/${bodySha}/body.bin`,
    body_sha256: bodySha,
    fetch_status: "captured",
    observed_at: observedAt,
  }
  atomicWrite(root, document.body_path, body)
  const parseId = sha256(version + ":fingerprint-test")
  const parse = storeParseArtifact(root, {
    schema_version: "source-parse/v1",
    source_id: source,
    source_version_id: version,
    parse_id: parseId,
    title: "Robotics source example",
    status: "extracted",
    dates: { published_at: publishedAt, observed_at: observedAt },
    blocks: [
      {
        block_id: `${parseId}:block-1`,
        text: bodyText,
        locator: { text_hash: sha256(bodyText) },
      },
    ],
    quality: { missing_pages: [] },
  })
  atomicWrite(root, `runs/${runId}/documents.json`, [document])
  atomicWrite(root, `runs/${runId}/parses.json`, [parse])
}

function candidate(key, url, more = {}) {
  return {
    key,
    title: `Candidate ${key}`,
    source_urls: [url],
    source_published_at: "2026-09-13",
    review_status: "unreviewed",
    ...more,
  }
}

test("stored-source receipt recovers only exact-date fingerprints without changing the candidate ledger", (t) => {
  const { root } = setup(t)
  const url = "https://example.org/news/robot"
  const candidates = [candidate("robot-news", url)]
  addStoredSource(root, {
    runId: "source-run",
    url,
    bodyText: "A robot maker announced a new industrial arm.",
  })
  const backlogSha256 = sha256("unchanged-backlog")

  const receipt = buildCandidateContentFingerprintEvidence({
    root,
    runId: "fingerprint-recovery",
    candidates,
    backlogSha256,
    generatedAt: "2026-10-02T00:00:00.000Z",
  })
  assert.equal(receipt.status_counts.unique_fingerprint, 1)
  assert.equal(receipt.candidates[0].observations.length, 1)
  assert.equal(candidates[0].article_content_sha256, undefined)

  atomicWrite(
    root,
    "runs/fingerprint-recovery/candidate-content-fingerprint-evidence.json",
    receipt,
  )
  atomicWrite(root, "runs/fingerprint-recovery-copy/candidate-content-fingerprint-evidence.json", {
    ...receipt,
    run_id: "fingerprint-recovery-copy",
  })
  const projection = projectVerifiedCandidateContentFingerprints({
    root,
    candidates,
    backlogSha256,
  })
  assert.equal(projection.receipt_count, 2)
  assert.equal(projection.recovered_candidate_count, 1)
  assert.equal(projection.invalid_receipt_count, 0)
  assert.equal(projection.candidates[0].content_fingerprint_basis, "verified_stored_source_receipt")
  assert.equal(
    projection.candidates[0].article_content_sha256,
    receipt.candidates[0].content_sha256,
  )
})

test("conflicting stored article versions stay ambiguous and are never projected", (t) => {
  const { root } = setup(t)
  const url = "https://example.org/news/robot"
  const candidates = [candidate("robot-news", url)]
  const backlogSha256 = sha256("unchanged-backlog")
  addStoredSource(root, {
    runId: "source-run-a",
    url,
    bodyText: "First captured version of the robot story.",
  })
  const firstReceipt = buildCandidateContentFingerprintEvidence({
    root,
    runId: "fingerprint-recovery-a",
    candidates,
    backlogSha256,
  })
  atomicWrite(
    root,
    "runs/fingerprint-recovery-a/candidate-content-fingerprint-evidence.json",
    firstReceipt,
  )
  addStoredSource(root, {
    runId: "source-run-b",
    url,
    bodyText: "A materially different second version of the robot story.",
  })
  const receipt = buildCandidateContentFingerprintEvidence({
    root,
    runId: "fingerprint-recovery-b",
    candidates,
    backlogSha256,
  })
  assert.equal(receipt.candidates[0].status, "ambiguous_fingerprint")
  atomicWrite(
    root,
    "runs/fingerprint-recovery-b/candidate-content-fingerprint-evidence.json",
    receipt,
  )
  const projection = projectVerifiedCandidateContentFingerprints({
    root,
    candidates,
    backlogSha256,
  })
  assert.equal(projection.receipt_count, 2)
  assert.equal(projection.invalid_receipt_count, 0)
  assert.equal(projection.recovered_candidate_count, 0)
})

test("receipts for earlier backlog revisions are stale, not invalid or projectable", (t) => {
  const { root } = setup(t)
  const url = "https://example.org/news/robot"
  const candidates = [candidate("robot-news", url)]
  const receipt = buildCandidateContentFingerprintEvidence({
    root,
    runId: "old-fingerprint-recovery",
    candidates,
    backlogSha256: sha256("previous-backlog"),
  })
  atomicWrite(
    root,
    "runs/old-fingerprint-recovery/candidate-content-fingerprint-evidence.json",
    receipt,
  )

  const projection = projectVerifiedCandidateContentFingerprints({
    root,
    candidates,
    backlogSha256: sha256("current-backlog"),
  })

  assert.equal(projection.receipt_count, 0)
  assert.equal(projection.stale_receipt_count, 1)
  assert.equal(projection.invalid_receipt_count, 0)
  assert.equal(projection.recovered_candidate_count, 0)
  assert.equal(projection.candidates[0].article_content_sha256, undefined)
})

test("research CLI writes a private fingerprint receipt idempotently", async (t) => {
  const { root, backlogPath } = setup(t)
  const url = "https://example.org/news/robot"
  const backlog = {
    schema: "research-candidates/v1",
    candidates: [candidate("robot-news", url)],
  }
  fs.writeFileSync(backlogPath, JSON.stringify(backlog))
  addStoredSource(root, {
    runId: "source-run",
    url,
    bodyText: "A robot maker announced a new industrial arm.",
  })

  const args = [
    "reconcile-content-fingerprint-evidence",
    "--run",
    "fingerprint-recovery",
    "--root",
    root,
    "--backlog",
    backlogPath,
  ]
  const first = await researchMain(args)
  const receiptPath = path.join(root, first.path)
  const receiptBytes = fs.readFileSync(receiptPath)
  assert.match(JSON.parse(receiptBytes.toString("utf8")).source_inventory_sha256, /^[a-f0-9]{64}$/)
  const second = await researchMain(args)
  assert.equal(first.status_counts.unique_fingerprint, 1)
  assert.equal(second.reused, true)
  assert.deepEqual(fs.readFileSync(receiptPath), receiptBytes)

  addStoredSource(root, {
    runId: "new-source-run",
    url,
    bodyText: "A robot maker announced a different industrial arm.",
  })
  await assert.rejects(researchMain(args), /Source inventory changed or is unpinned/)
  assert.deepEqual(fs.readFileSync(receiptPath), receiptBytes)

  const refreshedArgs = [...args]
  refreshedArgs[refreshedArgs.indexOf("--run") + 1] = "fingerprint-recovery-next"
  const refreshed = await researchMain(refreshedArgs)
  assert.equal(refreshed.status_counts.ambiguous_fingerprint, 1)
  assert.deepEqual(JSON.parse(fs.readFileSync(backlogPath, "utf8")), backlog)
})
