import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { saveEvaluationCase, loadEvaluationCase } from "../scripts/research/evaluation.mjs"
import {
  prepareEvaluationSourceReviewPacket,
  readEvaluationReviewPacket,
  auditEvaluationReviewPacket,
  importEvaluationHumanReview,
} from "../scripts/research/evaluation-review-packet.mjs"
import { measureWriterPreparation } from "../scripts/research/evaluation-cost.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "evaluation-packet-v2-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = ["alpha", "beta", "gamma"].map((name, i) => {
    const url = `https://example.test/${name}`,
      source_id = sourceId(url)
    const text = `${name} plans to ship ${50 + i} units in 2027.`,
      body = Buffer.from(`<article>${text}</article>`)
    const source_version_id = source_id + ":" + sha256(body),
      parse_id = sha256(name + "-parser")
    const document = {
      source_id,
      source_version_id,
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      mime_type: "text/html",
      observed_at: "2026-09-26T01:00:00Z",
      body_path: `documents/${source_id}/${sha256(body)}/body.bin`,
      body_sha256: sha256(body),
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id,
      parse_id,
      title: name,
      status: "extracted",
      language: "en",
      dates: { published_at: "2026-09-11", observed_at: document.observed_at },
      blocks: [
        {
          block_id: parse_id + ":block-0001",
          kind: "paragraph",
          text,
          locator: { text_hash: sha256(text) },
        },
      ],
      quality: { missing_pages: [] },
    }
    atomicWrite(root, document.body_path, body)
    atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
    atomicWrite(root, `runs/${name}/documents.json`, [document])
    atomicWrite(root, `runs/${name}/parses.json`, [parse])
    const claim = {
      statement: text,
      subject: name,
      claim_kind: "attributed_fact",
      event_state: "planned",
      published_at: "2026-09-11",
      effective_period: "2027",
      numbers: [{ literal: String(50 + i), unit: "units", condition: "in 2027" }],
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
    const spec = {
      schema: "evaluation-spec/v1",
      case_id: name + "-old",
      origin: "actual-source",
      split: "development",
      event_id: "0123456789abcdef",
      sectors: ["로봇·제조"],
      languages: ["en"],
      article_kind: "사건 뉴스",
      document_scope: "full_document",
      review: {
        reviewer: "Codex",
        reviewer_kind: "codex",
        reviewed_at: "2026-09-27",
        source_read: true,
        candidate_output_seen: false,
        independent_of_candidate_output: true,
        notes: "Synthetic test source; never an operational human gold submission.",
      },
      facts: [{ fact_id: "plan", importance: "core", claim }],
      required_explanations: [],
      forbidden_transformations: [],
    }
    return {
      name,
      document,
      parse,
      claim,
      spec,
      scope: { source_version_ids: [source_version_id], parse_ids: [parse_id] },
    }
  })
  const exclusionPath = "evaluation/review-selections/exclusions.json"
  atomicWrite(root, exclusionPath, {
    schema: "evaluation-source-prior-use-audit/v1",
    prepared_by: "Codex",
    excluded_urls: [],
    excluded_body_sha256s: [],
  })
  const exclusionPin = {
    path: exclusionPath,
    sha256: sha256(fs.readFileSync(safePath(root, exclusionPath))),
  }
  const selection = {
    schema: "evaluation-source-review-selection/v1",
    provenance: {
      prepared_by: "Codex",
      input_files: [exclusionPin],
      heldout_exclusion_file: exclusionPin,
    },
    cases: sources.slice(0, 2).map((s, i) => ({
      case_id: s.name,
      split: i ? "heldout" : "development",
      source_run: s.name,
      source_scope: s.scope,
      coverage_tags: ["planned-versus-completed"],
      prior_use: i ? "source-only" : "development",
    })),
  }
  const selectionFile = "evaluation/review-selections/selection.json"
  const saveSelection = (value = selection) => atomicWrite(root, selectionFile, value)
  saveSelection()
  return { root, sources, selection, selectionFile, saveSelection, exclusionPath }
}
async function packet(f) {
  return prepareEvaluationSourceReviewPacket(f.root, "packet", f.selectionFile)
}
function humanSubmission(f, id, hash) {
  const source = f.sources.find((s) => s.name === id)
  const value = readEvaluationReviewPacket(f.root, "packet", { case_id: id }).template
  value.packet_sha256 = hash
  value.specification = {
    ...structuredClone(source.spec),
    case_id: id + "-human-v1",
    split: id === "beta" ? "heldout" : "development",
    review: {
      ...source.spec.review,
      reviewer: "Independent test reviewer",
      reviewer_kind: "human",
    },
  }
  return value
}

test("source reference packet keeps full exact scoped evidence readable without copying gold, model output or source payload", async (t) => {
  const f = fixture(t),
    [a, b] = f.sources
  a.spec.required_explanations.push({
    id: "private-gold-marker",
    text: "NEVER DISPLAY HISTORICAL GOLD",
    fact_ids: ["plan"],
  })
  await saveEvaluationCase(f.root, "seed", a.name, a.spec)
  f.selection.cases[0].original_case_id = a.spec.case_id
  atomicWrite(f.root, "runs/alpha/documents.json", [a.document, b.document])
  atomicWrite(f.root, "runs/alpha/parses.json", [a.parse, b.parse])
  atomicWrite(f.root, "runs/alpha/private-model-output.json", {
    output: "NEVER DISPLAY MODEL OUTPUT",
  })
  f.saveSelection()
  const p = await packet(f),
    read = readEvaluationReviewPacket(f.root, "packet", { case_id: "alpha" })
  assert.equal(p.cases, 2)
  assert.equal(p.source_payload_copies, 0)
  assert.deepEqual(read.source.documents, [a.document])
  assert.deepEqual(read.source.parses, [a.parse])
  assert.equal(read.packet.cases[0].parse_refs[0].parse_id, a.parse.parse_id)
  assert.equal(
    read.packet.cases[0].gold_candidate.specification_sha256,
    loadEvaluationCase(f.root, a.spec.case_id).manifest.specification_sha256,
  )
  const html = fs.readFileSync(safePath(f.root, p.html), "utf8"),
    bytes = fs.readFileSync(safePath(f.root, p.packet), "utf8")
  for (const marker of [
    "NEVER DISPLAY HISTORICAL GOLD",
    "NEVER DISPLAY MODEL OUTPUT",
    a.parse.blocks[0].text,
  ]) {
    assert.equal(html.includes(marker), false)
    assert.equal(bytes.includes(marker), false)
  }
  assert.match(html, new RegExp("parses/" + a.parse.parse_id + "/parse.json"))
  assert.equal(html.includes("runs/alpha/parses.json"), false)
  assert.equal(fs.existsSync(safePath(f.root, "runs/packet/evaluation-review/originals")), false)
  assert.equal(read.template.specification.review.source_read, false)
  assert.equal(auditEvaluationReviewPacket(f.root, "packet").submitted_independent_gold, 0)
})

test("prior development source cannot become heldout by excluding it from the visible packet", async (t) => {
  const f = fixture(t),
    a = f.sources[0]
  await saveEvaluationCase(f.root, "seed", a.name, a.spec)
  f.selection.cases = [{ ...f.selection.cases[0], split: "heldout", prior_use: "source-only" }]
  f.saveSelection()
  await assert.rejects(packet(f), /previously used source cannot be relabelled/)
  assert.equal(fs.existsSync(safePath(f.root, "runs/packet/evaluation-review/packet.json")), false)
})

test("prior-use audit pins and source bytes remain immutable, and operation IDs are bounded", async (t) => {
  const f = fixture(t)
  await assert.rejects(
    prepareEvaluationSourceReviewPacket(f.root, "a".repeat(101), f.selectionFile),
    /100 characters/,
  )
  await packet(f)
  assert.throws(
    () => readEvaluationReviewPacket(f.root, "packet", { case_id: "a".repeat(101) }),
    /100 characters/,
  )
  fs.appendFileSync(safePath(f.root, f.exclusionPath), " ")
  assert.throws(
    () => readEvaluationReviewPacket(f.root, "packet", { case_id: "beta" }),
    /provenance input changed/,
  )
})

test("blank or AI-labelled reviews cannot be human gold; explicit validated human import is source-shared and submission-pinned", async (t) => {
  const f = fixture(t),
    p = await packet(f)
  const blank = readEvaluationReviewPacket(f.root, "packet", { case_id: "beta" }).template
  atomicWrite(f.root, "reviews/blank.json", blank)
  await assert.rejects(importEvaluationHumanReview(f.root, "blank", "packet", "reviews/blank.json"))
  const value = humanSubmission(f, "beta", p.sha256),
    ai = structuredClone(value)
  ai.specification.review.reviewer = "Codex (direct source reading)"
  atomicWrite(f.root, "reviews/ai.json", ai)
  await assert.rejects(
    importEvaluationHumanReview(f.root, "ai", "packet", "reviews/ai.json"),
    /AI reviewer provenance/,
  )
  assert.equal(auditEvaluationReviewPacket(f.root, "packet").submitted_independent_gold, 0)
  atomicWrite(f.root, "reviews/human.json", value)
  const imported = await importEvaluationHumanReview(
    f.root,
    "human",
    "packet",
    "reviews/human.json",
  )
  assert.equal(imported.status, "independent_gold")
  assert.equal(imported.source_payload_copies, 0)
  const gold = loadEvaluationCase(f.root, "beta-human-v1")
  assert.equal(gold.manifest.source_storage, "shared-source/v1")
  assert.equal(gold.root, f.root)
  for (const file of ["documents", "parses", "runs"])
    assert.equal(
      fs.existsSync(safePath(f.root, "evaluation/fixtures/beta-human-v1/" + file)),
      false,
    )
  const audit = auditEvaluationReviewPacket(f.root, "packet")
  assert.equal(audit.submitted_independent_gold, 1)
  assert.deepEqual(audit.submitted_by_split, { development: 0, heldout: 1 })
  fs.appendFileSync(safePath(f.root, "reviews/human.json"), " ")
  const changed = auditEvaluationReviewPacket(f.root, "packet")
  assert.equal(changed.submitted_independent_gold, 0)
  assert.match(changed.invalid_submissions[0].reason, /explicit human submission/)
})

test("human import rejects an altered packet binding, split or unsupported numeric claim before registering gold", async (t) => {
  const f = fixture(t),
    p = await packet(f),
    value = humanSubmission(f, "beta", p.sha256)
  const wrongHash = { ...value, packet_sha256: "0".repeat(64) }
  atomicWrite(f.root, "reviews/hash.json", wrongHash)
  await assert.rejects(
    importEvaluationHumanReview(f.root, "hash", "packet", "reviews/hash.json"),
    /exact frozen source\/split/,
  )
  const wrongSplit = structuredClone(value)
  wrongSplit.specification.split = "development"
  atomicWrite(f.root, "reviews/split.json", wrongSplit)
  await assert.rejects(
    importEvaluationHumanReview(f.root, "split", "packet", "reviews/split.json"),
    /exact frozen source\/split/,
  )
  const wrongNumber = structuredClone(value)
  wrongNumber.specification.facts[0].claim.numbers[0].literal = "99"
  atomicWrite(f.root, "reviews/number.json", wrongNumber)
  await assert.rejects(
    importEvaluationHumanReview(f.root, "number", "packet", "reviews/number.json"),
    /Invalid source-reviewed fact/,
  )
  assert.equal(auditEvaluationReviewPacket(f.root, "packet").submitted_independent_gold, 0)
})

test("cost comparison measures real writer preparation, stops before dispatch, and preserves strict evidence gating", async (t) => {
  const f = fixture(t),
    claims = f.sources.map((s, i) => ({
      ...s.claim,
      claim_id: "claim-" + i,
      review: { status: "verified", structural_pass: true },
    }))
  const documents = f.sources.map((s) => s.document),
    parses = f.sources.map((s) => s.parse)
  const measured = await measureWriterPreparation(claims, documents, parses, {
    model: "test-no-dispatch",
  })
  assert.equal(measured.per_source.aggregate.writer_preparations, 3)
  assert.equal(measured.source_first.aggregate.writer_preparations, 1)
  assert.equal(measured.model_calls, 0)
  assert.equal(measured.generated_drafts, 0)
  assert.equal(measured.expected_only.observed_duplicate_articles, null)
  assert.ok(
    measured.per_source.aggregate.request_bytes > measured.source_first.aggregate.request_bytes,
  )
  assert.ok(measured.source_first.aggregate.wall_ms >= 0)
  const wrong = structuredClone(claims)
  wrong[0].evidence[0].quote = "No such sentence in this source"
  await assert.rejects(measureWriterPreparation(wrong, documents, parses), /exact direct evidence/)
})

test("CLI read returns exact case source and audit distinguishes preparation from submitted gold", async (t) => {
  const f = fixture(t)
  await packet(f)
  const cli = path.resolve("scripts/research-evaluation-review.mjs")
  const read = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, "read", "--root", f.root, "--packet-run", "packet", "--case-id", "beta"],
      { encoding: "utf8" },
    ),
  )
  assert.equal(read.source.documents.length, 1)
  assert.equal(read.source.parses[0].parse_id, f.sources[1].parse.parse_id)
  const audit = JSON.parse(
    execFileSync(process.execPath, [cli, "audit", "--root", f.root, "--packet-run", "packet"], {
      encoding: "utf8",
    }),
  )
  assert.equal(audit.packet.prepared_cases, 2)
  assert.equal(audit.packet.submitted_independent_gold, 0)
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          cli,
          "prepare",
          "--root",
          f.root,
          "--run",
          "absolute",
          "--selection",
          safePath(f.root, f.selectionFile),
        ],
        { encoding: "utf8", stdio: "pipe" },
      ),
    /Private path escapes working root/,
  )
})
