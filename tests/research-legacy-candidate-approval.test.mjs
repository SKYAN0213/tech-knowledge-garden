import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import {
  importLegacyCandidateApproval,
  loadLegacyCandidateApproval,
} from "../scripts/research/legacy-candidate-approval.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

function fixture(
  t,
  { articleSourceUrl = "https://rocketlabcorp.com/missions/launches/owl-by-the-dozen/" } = {},
) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "legacy-approval-")))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const root = path.join(temp, "research")
  const backlogFile = path.join(temp, "candidate-backlog.json")
  const candidate = {
    key: "rocketlab-electron",
    title: "Rocket Lab, Synspective 레이더 위성의 572km 궤도 발사 완료",
    event_id: "c8c055684e1b9e3a",
    source_urls: ["https://rocketlabcorp.com/missions/launches/owl-by-the-dozen/"],
    source_published_at: "2026-09-19",
    review_status: "verified",
  }
  const sourceBody = "Owl By The Dozen mission page with a completed Electron launch."
  const source_id = sourceId(candidate.source_urls[0])
  const body_sha256 = sha256(sourceBody)
  const source_version_id = `${source_id}:${body_sha256}`
  const parse_id = sha256("rocketlab mission parse")
  const document = {
    source_id,
    source_version_id,
    original_url: candidate.source_urls[0],
    final_url: candidate.source_urls[0],
    body_path: `documents/${source_id}/${body_sha256}/body.bin`,
    body_sha256,
    fetch_status: "captured",
    observed_at: "2026-10-03T09:00:00.000Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    status: "extracted",
    title: "Owl By The Dozen | Rocket Lab",
    dates: { published_at: null, observed_at: document.observed_at },
    blocks: [
      {
        block_id: `${parse_id}:b1`,
        text: "Synspective launched a StriX satellite aboard Electron.",
        locator: { text_hash: sha256("Synspective launched a StriX satellite aboard Electron.") },
      },
      {
        block_id: `${parse_id}:b2`,
        text: "Rocket Lab states this was its 96th Electron mission.",
        locator: { text_hash: sha256("Rocket Lab states this was its 96th Electron mission.") },
      },
    ],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, document.body_path, sourceBody)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  atomicWrite(root, "runs/rocketlab-source/documents.json", [document])
  atomicWrite(root, "runs/rocketlab-source/parses.json", [parse])

  const articleContent = `---\ntitle: ${candidate.title}\ntype: news\nevent_id: ${candidate.event_id}\nreview_status: verified\npublished_at: 2026-09-19\nsource_url: ${articleSourceUrl}\n---\n\nRocket Lab launched the Synspective StriX satellite.\n`
  const articleReadback = {
    schema: "research-drive-publication-readback/v1",
    retrieved_at: "2026-10-03T10:00:00.000Z",
    file_id: "142iXIFStCWa5Tt1gDuPN7xN6KT-wMAu_",
    url: "https://drive.google.com/file/d/142iXIFStCWa5Tt1gDuPN7xN6KT-wMAu_/view?usp=drivesdk",
    title: `${candidate.event_id}.md`,
    mime_type: "text/markdown",
    size: String(Buffer.byteLength(articleContent)),
    updated_at: "2026-09-20T00:00:00.000Z",
    parent_ids: ["news-folder"],
    content: articleContent,
  }
  const editionContent = `---\ntitle: 2026-09-20 데일리 Tech & AI 매거진\ndate: 2026-09-20\narticle_records:\n  - title: ${candidate.title}\narticle_reviews:\n  - title: ${candidate.title}\n    event_id: ${candidate.event_id}\n    review_status: verified\n    published_at: 2026-09-19\n---\n\n# 브리핑\n`
  const editionReadback = {
    schema: "research-drive-publication-readback/v1",
    retrieved_at: "2026-10-03T10:00:00.000Z",
    file_id: "1CuQuHwbY7evakLihsyT0n1Elm_toPLfG",
    url: "https://drive.google.com/file/d/1CuQuHwbY7evakLihsyT0n1Elm_toPLfG/view?usp=drivesdk",
    title: "2026-09-20_0800_Tech_AI_Briefing.md",
    mime_type: "text/markdown",
    size: String(Buffer.byteLength(editionContent)),
    updated_at: "2026-09-20T00:00:00.000Z",
    parent_ids: ["editions-folder"],
    content: editionContent,
  }
  const articlePath = path.join(temp, "article-readback.json")
  const editionPath = path.join(temp, "edition-readback.json")
  const reviewPath = path.join(temp, "legacy-review.json")
  fs.writeFileSync(articlePath, JSON.stringify(articleReadback))
  fs.writeFileSync(editionPath, JSON.stringify(editionReadback))
  fs.writeFileSync(
    reviewPath,
    JSON.stringify({
      schema: "research-legacy-publication-approval-review/v1",
      candidate_key: candidate.key,
      event_id: candidate.event_id,
      article_drive_file_id: articleReadback.file_id,
      edition_drive_file_id: editionReadback.file_id,
      decision: "reuse_verified_publication",
      reviewer: "Codex Drive readback",
      reviewed_at: "2026-10-03",
      source_checked: true,
      article_checked: true,
      edition_checked: true,
      identity_checked: true,
      dates_checked: true,
      new_article: false,
      candidate_published: false,
    }),
  )
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [candidate] }),
  )
  return {
    root,
    backlogFile,
    candidate,
    articlePath,
    editionPath,
    reviewPath,
    sourceRunId: "rocketlab-source",
  }
}

test("imports a verified historical Drive issue as a pinned, non-publishing candidate approval", async (t) => {
  const f = fixture(t)
  const result = await importLegacyCandidateApproval({
    root: f.root,
    runId: "legacy-drive-approval",
    sourceRunId: f.sourceRunId,
    candidateKey: f.candidate.key,
    articleReadbackPath: f.articlePath,
    editionReadbackPath: f.editionPath,
    reviewPath: f.reviewPath,
    backlogFile: f.backlogFile,
  })
  const updated = readJSON(path.dirname(f.backlogFile), path.basename(f.backlogFile)).candidates[0]
  const receipt = readJSON(f.root, "runs/legacy-drive-approval/candidate-approval.json")
  const linked = loadLegacyCandidateApproval(f.root, updated)
  assert.equal(result.candidate_published, false)
  assert.equal(updated.event_id, f.candidate.event_id)
  assert.deepEqual(updated.source_urls, f.candidate.source_urls)
  assert.equal(updated.approval.approved_run, "legacy-drive-approval")
  assert.equal(receipt.legacy_publication.published_by, "legacy_drive_verified_article")
  assert.equal(
    receipt.legacy_publication.article_drive_file_id,
    "142iXIFStCWa5Tt1gDuPN7xN6KT-wMAu_",
  )
  assert.equal(linked.run_id, "legacy-drive-approval")
  assert.equal(linked.receipt_sha256, updated.approval.legacy_publication_receipt_sha256)
})

test("refuses a Drive readback whose article source differs from the candidate without changing the backlog", async (t) => {
  const f = fixture(t, { articleSourceUrl: "https://example.org/wrong-source" })
  const before = fs.readFileSync(f.backlogFile)
  await assert.rejects(
    () =>
      importLegacyCandidateApproval({
        root: f.root,
        runId: "legacy-drive-approval",
        sourceRunId: f.sourceRunId,
        candidateKey: f.candidate.key,
        articleReadbackPath: f.articlePath,
        editionReadbackPath: f.editionPath,
        reviewPath: f.reviewPath,
        backlogFile: f.backlogFile,
      }),
    /Drive verified article and edition do not match/,
  )
  assert.deepEqual(fs.readFileSync(f.backlogFile), before)
  assert.equal(readJSON(f.root, "runs/legacy-drive-approval/candidate-approval.json"), null)
})
