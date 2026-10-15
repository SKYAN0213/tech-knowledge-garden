import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  bodyLinkLeads,
  planCandidateFollowups,
  intakeCandidateFollowups,
  registerCollectedFollowups,
  recordSourceDetailReview,
  loadSourceDetailReview,
  selectFollowupLeads,
} from "../scripts/research/source-followups.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { storeParseArtifact, articleContentFingerprint } from "../scripts/research/parser.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"

function source() {
  const url = "https://example.org/roundup/"
  const text = "New robot report and study"
  const id = sourceId(url),
    bodyHash = sha256(text),
    parseId = sha256("parse")
  const document = {
    source_id: id,
    source_version_id: `${id}:${bodyHash}`,
    original_url: url,
    final_url: url,
    body_sha256: bodyHash,
    body_path: "sources/body.html",
    fetch_status: "captured",
    observed_at: "2026-10-07T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    status: "extracted",
    title: "Roundup",
    dates: { published_at: "2026-10-07" },
    quality: { required_fields_present: true, missing_pages: [] },
    blocks: [
      {
        block_id: `${parseId}:b1`,
        text,
        locator: { dom_path: "/html/body/article/li[1]", text_hash: sha256(text) },
      },
    ],
    links: [
      {
        url: "https://publisher.org/report?id=7&utm_source=x",
        text: "robot report",
        dom_path: "/html/body/article/li[1]/a[1]",
      },
    ],
  }
  return { document, parse, text }
}

test("body anchors preserve exact evidence, deduplicate targets and exclude navigation and unsafe URLs", () => {
  const { document, parse } = source()
  const base = parse.links[0]
  parse.links.push(
    { ...base, url: "https://publisher.org/report?id=7#result" },
    { ...base, dom_path: "/html/body/nav/a" },
    { ...base, dom_path: "/html/body/article/li[10]/a" },
    { ...base, text: "invented headline" },
    { ...base, url: undefined },
    { ...base, url: "" },
    ...[
      "javascript:alert(1)",
      "https://localhost/news",
      "http://127.0.0.1/news",
      "https://user:secret@example.org/news",
      document.original_url + "#section",
    ].map((url) => ({ ...base, url })),
  )
  const leads = bodyLinkLeads(document, parse)
  assert.equal(leads.length, 1)
  assert.equal(leads[0].url, "https://publisher.org/report?id=7")
  assert.equal(leads[0].provenance.length, 2)
  assert.equal(leads[0].provenance[0].href, base.url)
  assert.equal(leads[0].source_published_at, null)
  assert.equal(leads[0].confirmed_identity, false)
  assert.equal(leads[0].provenance[0].block_id, parse.blocks[0].block_id)
})

test("short public body keeps all event leads; nested blocks select closest source locator", () => {
  const { document, parse } = source()
  parse.blocks.unshift({
    ...parse.blocks[0],
    block_id: `${parse.parse_id}:outer`,
    locator: { ...parse.blocks[0].locator, dom_path: "/html/body/article" },
  })
  parse.links.push({ url: "/study", text: "study", dom_path: "/html/body/article/li[1]/a[2]" })
  const leads = bodyLinkLeads(document, parse)
  assert.equal(leads.length, 2)
  assert.equal(leads[0].provenance[0].block_id, `${parse.parse_id}:b1`)
  assert.equal(leads[1].url, "https://example.org/study")
  assert.deepEqual(bodyLinkLeads(document, { ...parse, status: "blocked" }), [])
  assert.throws(() => bodyLinkLeads(document, { ...parse, source_version_id: "other" }), /mismatch/)
})

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-followups-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const { document, parse, text } = source()
  atomicWrite(root, document.body_path, text)
  storeParseArtifact(root, parse)
  atomicWrite(root, "runs/parent/documents.json", [document])
  atomicWrite(root, "runs/parent/parses.json", [parse])
  const entry = {
    key: "source-feed-alias",
    source_urls: [document.original_url.slice(0, -1)],
    source_evidence_state: "exact",
    article_source_version_id: document.source_version_id,
    article_parse_id: parse.parse_id,
    article_content_sha256: articleContentFingerprint(parse),
    source_attempts: [
      {
        attempt_id: "parent",
        article_source_version_id: document.source_version_id,
        article_parse_id: parse.parse_id,
        article_content_sha256: articleContentFingerprint(parse),
      },
    ],
  }
  const handoffFile = path.join(root, "handoff.json"),
    backlogFile = path.join(root, "backlog.json")
  fs.writeFileSync(
    handoffFile,
    JSON.stringify({ schema: "research-editorial-handoff/v1", pending: [entry] }),
  )
  const approved = {
    key: "existing",
    title: "Reviewed target",
    source_urls: ["https://publisher.org/report?id=7"],
    source_published_at: "2026-10-06",
    discovered_at: "2026-10-06T00:00:00Z",
    review_status: "approved",
    approval: { run_id: "prior" },
    priority: "high",
    discovery: [],
  }
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [approved] }),
  )
  return { root, document, parse, handoffFile, backlogFile, candidateKey: entry.key, approved }
}

test("native intake accepts source URL aliases, is idempotent and preserves existing review/date", async (t) => {
  const options = fixture(t)
  const planned = planCandidateFollowups(options)
  const first = await intakeCandidateFollowups(options)
  const bytes = fs.readFileSync(options.backlogFile)
  const second = await intakeCandidateFollowups(options)
  assert.equal(first.plan_id, planned.plan_id)
  assert.equal(second.plan_id, first.plan_id)
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
  const [row] = JSON.parse(bytes).candidates
  assert.equal(row.review_status, "approved")
  assert.equal(row.source_published_at, "2026-10-06")
  assert.deepEqual(row.approval, options.approved.approval)
  assert.equal(row.discovery[0].parent_candidate_key, "source-feed-alias")
  assert.equal(first.publication_approved, false)
})

test("new target has no inherited date/event/approval; tampering blocks intake before mutation", async (t) => {
  const options = fixture(t)
  fs.writeFileSync(
    options.backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  await intakeCandidateFollowups(options)
  const bytes = fs.readFileSync(options.backlogFile)
  const [row] = JSON.parse(bytes).candidates
  assert.equal(row.source_published_at, null)
  assert.equal(row.review_status, "unreviewed")
  assert.equal(row.event_id, undefined)
  assert.equal(row.approval, undefined)
  fs.writeFileSync(path.join(options.root, options.document.body_path), "changed raw source")
  await assert.rejects(intakeCandidateFollowups(options), /body hash mismatch/)
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

function capturedTarget(options, status = "extracted") {
  const url = "https://publisher.org/report?id=7",
    body = "The manufacturer announced a new robot."
  const id = sourceId(url),
    hash = sha256(body),
    parseId = sha256("target parse " + status)
  const document = {
    source_id: id,
    source_version_id: `${id}:${hash}`,
    original_url: url,
    final_url: url,
    body_path: "sources/target.html",
    body_sha256: hash,
    fetch_status: "captured",
    observed_at: "2026-10-08T00:00:00Z",
  }
  atomicWrite(options.root, document.body_path, body)
  const parse = storeParseArtifact(options.root, {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: document.source_version_id,
    parse_id: parseId,
    title: "Robot announcement",
    status,
    dates: { published_at: status === "extracted" ? "2026-10-05" : null },
    blocks:
      status === "extracted"
        ? [{ block_id: `${parseId}:b1`, text: body, locator: { text_hash: hash } }]
        : [],
    quality: { required_fields_present: status === "extracted", missing_pages: [] },
  })
  atomicWrite(options.root, "runs/target/documents.json", [document])
  atomicWrite(options.root, "runs/target/parses.json", [parse])
  return { document, parse }
}

function storedParentOptions(t) {
  const options = fixture(t)
  const backlog = JSON.parse(fs.readFileSync(options.backlogFile))
  backlog.candidates.push({
    key: options.candidateKey,
    title: "Roundup",
    source_urls: [options.document.original_url.slice(0, -1)],
    source_published_at: "2026-10-07",
    discovered_at: options.document.observed_at,
    review_status: "unreviewed",
    priority: "normal",
    discovery: [],
    article_source_version_id: options.document.source_version_id,
    article_parse_id: options.parse.parse_id,
    article_content_sha256: articleContentFingerprint(options.parse),
  })
  fs.writeFileSync(options.backlogFile, JSON.stringify(backlog))
  return { ...options, handoffFile: undefined, parentSourceRun: "parent" }
}

test("explicit follow-up targets skip unrelated body links and reject invented or duplicate URLs", () => {
  const { document, parse } = source()
  parse.links.push({ url: "/study", text: "study", dom_path: "/html/body/article/li[1]/a[2]" })
  const plan = { leads: bodyLinkLeads(document, parse) }
  assert.equal(
    selectFollowupLeads(plan, { targetURLs: ["https://example.org/study"], limit: 1 })[0].url,
    "https://example.org/study",
  )
  assert.throws(
    () => selectFollowupLeads(plan, { targetURLs: ["https://example.org/invented"] }),
    /body links/,
  )
  assert.throws(
    () =>
      selectFollowupLeads(plan, {
        targetURLs: ["https://example.org/study", "https://example.org/study#duplicate"],
      }),
    /uniquely/,
  )
})

test("stored parent follows native body links without a new daily observation or model call", async (t) => {
  const options = storedParentOptions(t)
  const planned = planCandidateFollowups(options)
  assert.equal(planned.plan.parent_source_run, "parent")
  assert.equal(planned.plan.handoff_sha256, null)
  assert.equal(planned.plan.leads.length, 1)
  assert.equal(planned.plan.leads[0].source_published_at, null)
  const first = await intakeCandidateFollowups(options)
  const bytes = fs.readFileSync(options.backlogFile)
  const second = await intakeCandidateFollowups(options)
  assert.equal(first.plan_id, second.plan_id)
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
  capturedTarget(options)
  const collected = await registerCollectedFollowups({ ...options, sourceRun: "target", limit: 1 })
  assert.equal(collected.receipt.readable_sources, 1)
  assert.equal(collected.receipt.publication_approved, false)
})

test("stored parent rejects ambiguous input, changed candidate identity and original bytes before intake", async (t) => {
  const options = storedParentOptions(t)
  const bytes = fs.readFileSync(options.backlogFile)
  assert.throws(() => planCandidateFollowups({ ...options, handoffFile: "other.json" }), /Choose/)
  assert.throws(() => planCandidateFollowups({ ...options, backlogFile: undefined }), /backlog/)
  for (const [key, value] of [
    ["article_source_version_id", "changed"],
    ["article_parse_id", sha256("other")],
    ["article_content_sha256", sha256("changed")],
    ["source_urls", ["https://other.org/article"]],
  ]) {
    const changed = JSON.parse(bytes)
    changed.candidates[1][key] = value
    fs.writeFileSync(options.backlogFile, JSON.stringify(changed))
    await assert.rejects(intakeCandidateFollowups(options), /Stored follow-up parent/)
    assert.deepEqual(fs.readFileSync(options.backlogFile), Buffer.from(JSON.stringify(changed)))
  }
  fs.writeFileSync(options.backlogFile, bytes)
  fs.writeFileSync(path.join(options.root, options.document.body_path), "changed raw source")
  await assert.rejects(intakeCandidateFollowups(options), /body hash mismatch/)
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

test("collected readable target reuses native bytes and its own date; no automatic approval or event link", async (t) => {
  const options = fixture(t)
  fs.writeFileSync(
    options.backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  await intakeCandidateFollowups(options)
  const { document, parse } = capturedTarget(options)
  const result = await registerCollectedFollowups({ ...options, sourceRun: "target" })
  assert.equal(result.receipt.readable_sources, 1)
  assert.equal(result.receipt.sources[0].next_route, "fact-review")
  const [row] = JSON.parse(fs.readFileSync(options.backlogFile)).candidates
  assert.equal(row.source_published_at, "2026-10-05")
  assert.equal(row.article_source_version_id, document.source_version_id)
  assert.equal(row.article_parse_id, parse.parse_id)
  assert.equal(row.review_status, "unreviewed")
  assert.equal(row.event_id, undefined)
  assert.equal(row.approval, undefined)
  assert.deepEqual(await registerCollectedFollowups({ ...options, sourceRun: "target" }), result)
})

test("HTML shell is a source-content problem, preserves lead and cannot become article evidence", async (t) => {
  const options = fixture(t)
  await intakeCandidateFollowups(options)
  const bytes = fs.readFileSync(options.backlogFile)
  capturedTarget(options, "partial")
  const result = await registerCollectedFollowups({ ...options, sourceRun: "target" })
  assert.equal(result.receipt.readable_sources, 0)
  assert.equal(result.receipt.sources[0].next_route, "source-content-review")
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
  const documents = JSON.parse(
    fs.readFileSync(path.join(options.root, "runs/target/documents.json")),
  )
  documents[0] = { ...documents[0], fetch_status: "blocked" }
  atomicWrite(options.root, "runs/failed/documents.json", documents)
  atomicWrite(options.root, "runs/failed/parses.json", [])
  const failed = await registerCollectedFollowups({ ...options, sourceRun: "failed" })
  assert.equal(failed.receipt.sources[0].next_route, "source-access-review")
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

test("collection rejects unrelated URLs before any candidate update", async (t) => {
  const options = fixture(t)
  capturedTarget(options)
  const bytes = fs.readFileSync(options.backlogFile)
  const documents = JSON.parse(
    fs.readFileSync(path.join(options.root, "runs/target/documents.json")),
  )
  documents.push({ original_url: "https://other.org/news", fetch_status: "blocked" })
  atomicWrite(options.root, "runs/target/documents.json", documents)
  await assert.rejects(
    registerCollectedFollowups({ ...options, sourceRun: "target" }),
    /requested targets/,
  )
  assert.deepEqual(fs.readFileSync(options.backlogFile), bytes)
})

test("only an explicit exact body reading can defer detail; native review detects altered evidence", (t) => {
  const options = fixture(t)
  const plan = planCandidateFollowups(options).plan
  const lead = plan.leads[0],
    evidence = lead.provenance[0]
  const review = {
    schema: "research-source-detail-review-input/v1",
    candidate_key: options.candidateKey,
    source_version_id: plan.parent.source_version_id,
    parse_id: plan.parent.parse_id,
    source_read: true,
    reviewer: "Direct source review",
    reviewed_at: "2026-10-08",
    required_details: [
      {
        candidate_key: lead.key,
        block_id: evidence.block_id,
        quote: evidence.block_text,
        reason: "The list links the report; detail is required to write the event accurately.",
      },
    ],
  }
  assert.throws(
    () => recordSourceDetailReview({ ...options, review: { ...review, source_read: false } }),
    /source-read/,
  )
  assert.throws(
    () =>
      recordSourceDetailReview({
        ...options,
        review: {
          ...review,
          required_details: [{ ...review.required_details[0], quote: "Invented detail" }],
        },
      }),
    /exact parent/,
  )
  const stored = recordSourceDetailReview({ ...options, review })
  const read = loadSourceDetailReview({ ...options, reviewPath: stored.path })
  assert.equal(read.model_calls, 0)
  assert.deepEqual(read.required_candidate_keys, [lead.key])
  const receipt = JSON.parse(fs.readFileSync(path.join(options.root, stored.path)))
  receipt.review.required_details[0].reason = "Changed decision"
  fs.writeFileSync(path.join(options.root, stored.path), JSON.stringify(receipt))
  assert.throws(
    () => loadSourceDetailReview({ ...options, reviewPath: stored.path }),
    /identity changed/,
  )
})
