import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { moduleContext } from "../../scripts/research/module-runtime.mjs"
import { executeModule } from "../../scripts/research/module-registry.mjs"
import { summarizeCollection } from "../../scripts/research/collection-report.mjs"
import { sha256, sourceId } from "../../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../../scripts/research/run-state.mjs"
const repo = fs.realpathSync(fileURLToPath(new URL("../../", import.meta.url)))
export function fixture(t) {
  fs.mkdirSync(path.join(repo, ".local/research"), { recursive: true })
  const root = fs.mkdtempSync(path.join(repo, ".local/research/module-test-"))
  fs.mkdirSync(path.join(root, ".storage"))
  fs.writeFileSync(
    path.join(root, ".storage/policy.json"),
    JSON.stringify({ schema: "research-cold-storage/v1", root, enabled: false }),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  // These fixtures exercise injected local providers. Production MCP defaults
  // to GPT; an Ollama fixture must select its existing local policy explicitly.
  return { ctx: moduleContext({ repo, root, policy: "data/research-model-policy.json" }), root }
}
export function source(root, index, origin = "origin-" + index, publishedAt = "2026-09-27") {
  const url = `https://fixture.example/article/${index}`,
    body = `Original test source ${index}`
  const sid = sourceId(url),
    body_sha256 = sha256(body),
    version = `${sid}:${body_sha256}`,
    parse = sha256("test-parse-" + index)
  const document = {
    schema_version: "source-document/v1",
    source_id: sid,
    source_version_id: version,
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    observed_at: "2026-09-28T00:00:00Z",
    body_sha256,
    body_path: `documents/${sid}/${body_sha256}/body.bin`,
  }
  const texts = [
    `Fixture Robotics and Partner announced the Contract-123 robot order on 2026-09-27. Source ${index}.`,
    "A different event in the same source concerns another customer and a later schedule.",
  ]
  const parsed = {
    schema_version: "source-parse/v1",
    source_id: sid,
    source_version_id: version,
    parse_id: parse,
    status: "extracted",
    title: "Fixture Robotics order " + index,
    dates: { published_at: publishedAt, observed_at: document.observed_at },
    quality: { missing_pages: [] },
    links: [],
    blocks: texts.map((text, i) => ({
      block_id: `${parse}:b${i + 1}`,
      text,
      locator: { text_hash: sha256(text) },
    })),
  }
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, `parses/${parse}/parse.json`, parsed)
  const docs = readJSON(root, `runs/${origin}/documents.json`) || [],
    parses = readJSON(root, `runs/${origin}/parses.json`) || []
  atomicWrite(root, `runs/${origin}/documents.json`, [...docs, document])
  atomicWrite(root, `runs/${origin}/parses.json`, [...parses, parsed])
  return { document, parsed, origin }
}
export function editionFixture(t, { differentDate = false } = {}) {
  const f = fixture(t),
    sources = [
      source(f.root, 0),
      source(f.root, 1, "origin-1", differentDate ? "2026-09-28" : "2026-09-27"),
      source(f.root, 2),
      source(f.root, 3, "origin-0"),
    ]
  const windows = [{ channel_id: "fixture", since: "2026-09-27", until_exclusive: "2026-09-28" }]
  const scans = sources.map((s) => ({
    run_id: s.origin,
    indexDocuments: [],
    documents: [s.document],
    parses: [s.parsed],
    candidates: [
      {
        article_source_version_id: s.document.source_version_id,
        article_parse_id: s.parsed.parse_id,
      },
    ],
  }))
  // Test-only native source artifacts; production freeze additionally rebuilds
  // and verifies the actual daily plan/receipts before accepting this shape.
  const report = summarizeCollection({
    plan: { run_id: "daily-fixture", windows },
    receipts: [{ ...windows[0], attempt_id: "attempt", status: "incomplete" }],
    scans,
    sizeOf: (file) => fs.statSync(safePath(f.root, file)).size,
  })
  report.materials.forEach((m) => {
    m.parse_sha256 = sha256(fs.readFileSync(safePath(f.root, m.parse_path)))
  })
  const bytes = JSON.stringify(report, null, 2) + "\n",
    reportRef = {
      path: `daily/runs/daily-fixture/collection-reports/${sha256(bytes)}.json`,
      sha256: sha256(bytes),
    }
  atomicWrite(f.root, reportRef.path, bytes)
  const edition = {
    schema: "research-edition-materials/v1",
    run_id: "fixture-edition",
    daily_run: "daily-fixture",
    report: reportRef,
    status: "partial",
    frozen_at: "2026-09-28T01:00:00Z",
    candidate_approved: false,
    candidate_published: false,
  }
  const editionRef = atomicWrite(f.root, "editions/fixture-edition/materials.json", edition)
  const materialOf = (s) =>
    report.materials.find((m) => m.source_version_id === s.document.source_version_id)
  const evidenceOf = (s) =>
    ["identity_marker", "event_action"].map((aspect) => ({
      aspect,
      block_id: s.parsed.blocks[0].block_id,
      quote: s.parsed.blocks[0].text,
    }))
  const materials = sources.slice(0, 3).map((s, i) => ({
    material_id: materialOf(s).id,
    role: i ? "same_event" : "primary",
    block_ids: [s.parsed.blocks[0].block_id],
    evidence: evidenceOf(s),
    ...(i
      ? {
          matches: evidenceOf(s).map((e) => ({
            ...e,
            primary_block_id: sources[0].parsed.blocks[0].block_id,
            primary_quote: sources[0].parsed.blocks[0].text,
            conclusion: "Same Contract-123 order and announcement action in the test originals",
          })),
        }
      : {}),
  }))
  const event = {
    group_id: "order",
    action: "write",
    identity: {
      who: "Fixture Robotics",
      action: "announced order",
      object: "Contract-123",
      occurred_at: "2026-09-27",
      external_id: "Contract-123",
    },
    reason: "Originals identify the same contract and action",
    materials,
  }
  const deferred = {
    ...structuredClone(event),
    group_id: "deferred",
    action: "defer",
    identity: { ...event.identity, object: "Another customer", external_id: null },
    materials: [
      {
        material_id: materialOf(sources[3]).id,
        role: "primary",
        block_ids: [sources[3].parsed.blocks[0].block_id],
        evidence: evidenceOf(sources[3]),
      },
    ],
  }
  const review = {
    schema: "research-event-decisions/v1",
    reviewer: "test-source-review",
    reviewed_at: "2026-09-28T01:00:00Z",
    events: [event, deferred],
  }
  const file = path.relative(repo, path.join(f.root, "review.json"))
  atomicWrite(f.root, "review.json", review)
  const parameters = {
    run_id: "fixture-plan",
    edition_path: editionRef.path,
    edition_sha256: editionRef.sha256,
    review_file: file,
  }
  return { ...f, sources, report, editionRef, review, parameters }
}
export async function selectedFixture(t) {
  const f = editionFixture(t),
    plan = await executeModule(f.ctx, "classification", "review", f.parameters)
  const selection = await executeModule(f.ctx, "selection", "prepare", {
    run_id: "writer",
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    group_id: "order",
  })
  return {
    ...f,
    plan,
    selection,
    selectedParameters: {
      run_id: selection.writer_run,
      selection_path: selection.path,
      selection_sha256: selection.sha256,
    },
  }
}
