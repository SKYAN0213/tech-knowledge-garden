import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { main as author } from "../scripts/research-editorial-author.mjs"
import { main as research } from "../scripts/research.mjs"
import { inspectEvaluationWriterQuality } from "../scripts/research/evaluation-cost.mjs"

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "editorial-development-"))),
    run = "editorial-candidate",
    sourceRun = "reviewed-source",
    caseId = "development-example",
    text = "Example released an API. Users can inspect request status.",
    source_id = sourceId("https://example.org/api"),
    parse_id = sha256(text),
    source_version_id = source_id + ":" + sha256(text),
    body_path = "documents/source/body.bin",
    parse = {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id,
      parse_id,
      status: "extracted",
      title: "API release",
      dates: { published_at: "2026-09-26", observed_at: "2026-09-27T00:00:00Z" },
      blocks: [{ block_id: parse_id + ":b0", text, locator: { text_hash: sha256(text) } }],
      quality: { missing_pages: [] },
    },
    documents = [
      {
        source_id,
        source_version_id,
        original_url: "https://example.org/api",
        final_url: "https://example.org/api",
        observed_at: parse.dates.observed_at,
        fetch_status: "captured",
        body_sha256: sha256(text),
        body_path,
      },
    ]
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "documents/source"), { recursive: true })
  fs.writeFileSync(path.join(root, body_path), text)
  atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
  const claim = {
    claim_id: "example-api",
    candidate_key: "source-" + source_id,
    statement: text,
    claim_kind: "attributed_fact",
    subject: "Example",
    event_state: "reported",
    published_at: "2026-09-26",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: parse.blocks[0].block_id,
        quote: text,
        support: "direct",
      },
    ],
  }
  const claims = recordFactReview(
    [claim],
    [
      {
        claim_id: claim.claim_id,
        status: "verified",
        reason: "Injected fixture source review only",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "fixture Codex", reviewed_at: "2026-09-28" },
    [parse],
  )
  for (const id of [sourceRun, run]) {
    atomicWrite(root, `runs/${id}/documents.json`, documents)
    atomicWrite(root, `runs/${id}/parses.json`, [parse])
    atomicWrite(root, `runs/${id}/reviewed-claims.json`, { claims })
  }
  atomicWrite(root, "selection.json", {
    schema: "evaluation-source-review-selection/v1",
    cases: [
      {
        case_id: caseId,
        split: "development",
        source_run: sourceRun,
        source_scope: { source_version_ids: [source_version_id], parse_ids: [parse_id] },
      },
    ],
  })
  atomicWrite(root, "input.json", {
    reviewer: "fixture Codex",
    reviewed_at: "2026-09-29",
    reason: "Injected source-bound candidate; not an independent review",
    source_read: true,
    final_prose_read: true,
    draft: {
      title: "Example, 요청 상태 조회 API 공개",
      sector: "소프트웨어·클라우드",
      theme: "제품·서비스",
      tags: ["기능 추가"],
      entities: ["Example"],
      facts: {
        who: "Example",
        when: "2026-09-26",
        where: null,
        what: "API release",
        how: null,
        why: null,
      },
      lead: [
        { text: "Example은 2026년 9월 26일 API를 공개했다.", claim_ids: [claim.claim_id] },
        { text: "사용자는 요청 상태를 조회할 수 있다.", claim_ids: [claim.claim_id] },
      ],
      explanations: [],
    },
  })
  const drafted = await author([
    "--root",
    root,
    "--run",
    run,
    "--review",
    path.join(root, "input.json"),
  ])
  atomicWrite(root, "review.json", {
    status: "approved",
    draft_id: drafted.draft_id,
    reviewer: "fixture Codex",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: source_id.slice(0, 16),
    published_at: "2026-09-26",
    reviewed_at: "2026-09-30",
    region: "해외",
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  })
  await research([
    "approve",
    "--root",
    root,
    "--run",
    run,
    "--review",
    path.join(root, "review.json"),
  ])
  const inspect = () => inspectEvaluationWriterQuality(root, run, "selection.json", caseId)
  return { root, run, sourceRun, caseId, inspect }
}

test("native editorial development candidate binds exact approval without a fabricated model or gold", async (t) => {
  const f = await fixture(t),
    result = f.inspect()
  assert.equal(result.schema, "evaluation-editorial-candidate-quality/v1")
  assert.equal(result.case_split, "development")
  assert.equal(result.native_article_approved, true)
  assert.equal(result.checkpoint, null)
  assert.equal(result.independent_gold, false)
  assert.equal(result.independent_human_review, false)
  assert.equal(result.public_approved, false)
  assert.equal(result.new_model_calls, 0)
  assert.equal(result.reader_quality.blocked, false)
  assert.equal(Object.keys(result.approved_file_hashes).length, 6)
  assert.equal(readJSON(f.root, `runs/${f.run}/model-draft-checkpoint.json`), null)
  assert.equal(fs.existsSync(path.join(f.root, "evaluation/gold")), false)
})

test("changed editorial input and changed selected fact receipts cannot reuse native approval", async (t) => {
  const f = await fixture(t),
    inputPath = `runs/${f.run}/editorial-authoring-input.json`,
    input = readJSON(f.root, inputPath)
  input.reason += " altered"
  atomicWrite(f.root, inputPath, input)
  assert.throws(f.inspect, /authoring input changed/)
  input.reason = input.reason.replace(" altered", "")
  atomicWrite(f.root, inputPath, input)
  const factsPath = `runs/${f.sourceRun}/reviewed-claims.json`,
    facts = readJSON(f.root, factsPath)
  facts.claims[0].review.reviewer = "different reviewer"
  atomicWrite(f.root, factsPath, facts)
  assert.throws(f.inspect, /exact selected source and reviewed facts/)
})

test("partial model checkpoint cannot fall back to the editorial development path", async (t) => {
  const f = await fixture(t)
  atomicWrite(f.root, `runs/${f.run}/model-draft-input.json`, { incomplete: true })
  assert.throws(f.inspect, /native writer checkpoint required/)
})

test("editorial candidates also refuse heldout before opening source or candidate files", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "editorial-heldout-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  atomicWrite(root, "selection.json", {
    schema: "evaluation-source-review-selection/v1",
    cases: [{ case_id: "blind", split: "heldout", source_run: "do-not-open" }],
  })
  assert.throws(
    () => inspectEvaluationWriterQuality(root, "do-not-open", "selection.json", "blind"),
    /development cases/,
  )
})

test("editorial candidate reports the exact native article review publication date", async (t) => {
  const f = await fixture(t),
    result = f.inspect()
  assert.equal(result.published_at, "2026-09-26")
  assert.equal(result.event_id, readJSON(f.root, `runs/${f.run}/approved-article.json`).event_id)
})
