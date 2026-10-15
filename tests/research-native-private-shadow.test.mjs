// Orchestration regression only. Collection/publication verifier boundaries are
// stubbed; all receipts live in disposable fixtures and are never real 0/7 proof.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { slugifyFilePath } from "@quartz-community/utils"
import { deliveryFixture } from "./fixtures/publication-delivery.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../scripts/research/run-state.mjs"
import { articleDateLabel } from "../scripts/article-review.mjs"
import { digestPath } from "../scripts/briefings.mjs"
import * as deliveryModule from "../scripts/research/authoring-delivery-request.mjs"
import * as collectionModule from "../scripts/research/daily-scan.mjs"
import * as publicationModule from "../scripts/research/publication-operation.mjs"

test("one legacy publication accepts a private native comparison, while native publication, old legacy evidence and repeated execution do not count", async (t) => {
  // Keep the repository's normal node --test command compatible. Experimental
  // module mocks are confined to this single disposable orchestration fixture.
  if (!process.execArgv.includes("--experimental-test-module-mocks")) {
    const fixtureEnv = { ...process.env }
    delete fixtureEnv.NODE_TEST_CONTEXT
    const result = execFileSync(
      process.execPath,
      ["--experimental-test-module-mocks", "--test", fileURLToPath(import.meta.url)],
      { encoding: "utf8", env: fixtureEnv },
    )
    assert.match(result, /pass 1/)
    return
  }
  const f = await deliveryFixture(t)
  const put = (file, value) => atomicWrite(f.root, file, value)
  const ref = (file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(f.root, file))) })
  const initial = await deliveryModule.requestPublicationDelivery(f.ctx, f.request)
  const invocation = {
    schema: "research-scheduled-invocation/v1",
    kind: "scheduled",
    schedule_id: "tech-ai-briefing-08",
    execution_id: "test-only-execution",
    started_at: "2026-09-27T23:00:00Z",
    reason: "Test-only attributed capture",
    evidence: put("invocation-evidence.json", { fixture: true }),
  }
  const basis = {
    daily_run: "daily-20260928-fixture",
    config: put("frozen-config.json", { fixture: true }),
    config_sha256: "a".repeat(64),
    active_routes: [{ channel_id: "fixture" }],
    backlog: put("frozen-backlog.json", { candidates: [] }),
    handoff: put("collection-handoff.json", { incomplete_windows: [] }),
  }
  const request = {
    ...readJSON(f.root, initial.request.path),
    invocation: put("scheduled-invocation.json", invocation),
    collection_basis: put("test-only-basis.json", basis),
  }
  // Test-only request extension; production requests remain immutable.
  put(initial.request.path, request)
  const requestRef = ref(initial.request.path)
  const scheduled = {
    invocation,
    basis,
    plan: { kst_day: "2026-09-28" },
    receipts: [],
    report: {
      status: "collected",
      counts: { incomplete_windows: 0, pending_windows: 0 },
      missing: [],
    },
  }
  let nativePublished = false
  let legacyPublicCalls = 0
  t.mock.module(
    new URL("../scripts/research/authoring-delivery-request.mjs", import.meta.url).href,
    {
      namedExports: {
        ...deliveryModule,
        loadScheduledPublicationInputs: () => scheduled,
        publicationDeliveryStatus: () => ({
          request: requestRef,
          binding: null,
          execution: null,
          publication: nativePublished ? { status: "public_bytes_verified" } : null,
          public_verified: nativePublished,
        }),
      },
    },
  )
  t.mock.module(new URL("../scripts/research/daily-scan.mjs", import.meta.url).href, {
    namedExports: {
      ...collectionModule,
      validateStoredDailyPlan: () => true,
      verifyDailyReceipts: () => true,
    },
  })
  t.mock.module(new URL("../scripts/research/publication-operation.mjs", import.meta.url).href, {
    namedExports: {
      ...publicationModule,
      publicationOperationStatus: ({ run }) => {
        assert.equal(run, "legacy")
        legacyPublicCalls++
        return {
          status: "public_bytes_verified",
          observation_basis: "archived_observation",
          commit: "b".repeat(40),
        }
      },
    },
  })
  const shadow = await import("../scripts/research/shadow-operations.mjs?private-native-regression")
  const article = readJSON(f.root, "runs/writer/approved-article.json")
  const edition = "Editions/2026/09/2026-09-28_0800_Tech_AI_Briefing.md"
  const slug = slugifyFilePath(edition.replace(/^Editions\//, "Briefings/"))
  const workspace = "runs/native-reader/preview-workspace"
  const date = `${articleDateLabel(article.article_review)} ${article.article_review.published_at}`
  const prose = [
    article.title,
    article.record.lead,
    ...article.record.explanations.flatMap((e) => e.paragraphs),
  ]
  const escape = (text) =>
    text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  const html =
    prose.map((p) => `<p>${escape(p)}</p>`).join("") +
    `<p>${date}</p><time datetime="${article.article_review.published_at}">${article.article_review.published_at}</time>` +
    article.source_urls.map((url) => `<a href="${url}">source</a>`).join("")
  const markdown = prose.join("\n\n") + "\n\n" + date + "\n" + article.source_urls.join("\n") + "\n"
  const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Fixture</title><link>https://fixture.invalid/</link><description>Fixture</description><item><title>Issue</title><link>https://fixture.invalid/${slug}</link><guid>https://fixture.invalid/${slug}</guid><pubDate>Mon, 28 Sep 2026 08:00:00 +0900</pubDate><description><![CDATA[${html}]]></description><content:encoded><![CDATA[${html}]]></content:encoded></item></channel></rss>`
  const projection = put(`${workspace}/vault/${edition}`, markdown)
  const publicFiles = [
    [`news/${article.event_id}.html`, html],
    [`${slug}.html`, html],
    ["briefing.xml", rss],
    ["knowledge-graph.json", { nodes: [], articles: [] }],
  ].map(([file, value]) => ({
    path: file,
    sha256: put(`${workspace}/public/${file}`, value).sha256,
  }))
  const digest = digestPath(edition.replace(/\.md$/, ""))
  const digestRef = put(`${workspace}/${digest}`, markdown)
  const preview = {
    schema: "private-reader-preview/v1",
    run_id: "native-reader",
    workspace,
    observed_at: "2026-09-29T02:00:00Z",
    candidate_published: false,
    approved_runs: ["writer"],
    knowledge_runs: [],
    knowledge: [],
    editions: [{ path: edition, sha256: projection.sha256, event_ids: [article.event_id] }],
    public: publicFiles,
    digest: [{ path: digest.replace(/^digest\//, ""), sha256: digestRef.sha256 }],
    daily_editorial_handoff: request.handoff,
    source_feed: put("source-feed.xml", rss),
  }
  const candidateRef = put("runs/native-reader/preview-manifest.json", preview)
  const legacyPreview = put("runs/legacy-reader/preview-manifest.json", {
    schema: "private-reader-preview/v1",
    run_id: "legacy-reader",
    approved_runs: ["legacy-writer"],
    editions: [{ path: edition }],
  })
  put("runs/legacy/publication-operation/input.json", {
    preview: legacyPreview,
    execution: put("legacy-drive.json", { observed_at: "2026-09-29T01:00:00Z" }),
    release: put("legacy-release.json", { fixture: true }),
  })
  const observation = () =>
    put("legacy-public-readback.json", {
      files: [{ observed_at: "2026-09-29T01:10:00Z" }],
    })
  put("runs/legacy/publication-operation/public.json", { readback: observation() })
  const evidence = put("comparison.json", { fixture: "source and final reader comparison" })
  const review = {
    schema: "research-shadow-review/v2",
    run_id: "native-shadow",
    reviewer_kind: "human",
    reviewer: "test-only reviewer",
    reviewed_at: "2026-09-29T03:00:00Z",
    processing_seconds: 1,
    published_by: "legacy",
    candidate_published: false,
    delivery_run: f.request.run_id,
    delivery_request: requestRef,
    invocation,
    collection_basis: request.collection_basis,
    handoff: request.handoff,
    legacy_publication_run: "legacy",
    edition,
    candidate_preview: candidateRef,
    comparison: Object.fromEntries(
      shadow.SHADOW_CRITERIA.map((key) => [
        key,
        {
          decision: "accepted",
          reason: "Test-only source and reader comparison",
          evidence,
        },
      ]),
    ),
  }
  const receipt = await shadow.verifyShadowReview({ root: f.root, review, repository: f.ctx.repo })
  assert.equal(receipt.status, "completed_comparison")
  assert.equal(receipt.published_by, "legacy")
  assert.equal(receipt.candidate_published, false)
  assert.equal(receipt.operational_promotion_verified, false)
  assert.equal(receipt.local_reader.articles[0].appearances[0].rss_in_current_feed, true)
  assert.equal(legacyPublicCalls, 1)
  nativePublished = true
  await assert.rejects(
    shadow.verifyShadowReview({ root: f.root, review, repository: f.ctx.repo }),
    /must remain private/,
  )
  nativePublished = false
  const publicPreview = put("runs/native-reader/preview-manifest.json", {
    ...preview,
    candidate_published: true,
  })
  await assert.rejects(
    shadow.verifyShadowReview({
      root: f.root,
      review: { ...review, candidate_preview: publicPreview },
      repository: f.ctx.repo,
    }),
    /unpublished candidate preview/,
  )
  put(candidateRef.path, preview)
  const old = put("legacy-old-readback.json", { files: [{ observed_at: "2026-09-26T01:10:00Z" }] })
  put("runs/legacy/publication-operation/public.json", { readback: old })
  await assert.rejects(
    shadow.verifyShadowReview({ root: f.root, review, repository: f.ctx.repo }),
    /scheduled execution/,
  )
  put("runs/legacy/publication-operation/public.json", { readback: observation() })
  const repeated = {
    ...receipt,
    run_id: "same-execution-again",
    reviewed_at: "2026-09-29T04:00:00Z",
  }
  const grouped = shadow.summarizeShadowOperations([receipt, repeated])
  assert.deepEqual(grouped.counted_runs, ["native-shadow"])
  assert.deepEqual(grouped.duplicate_runs, ["same-execution-again"])
  assert.equal(grouped.completed_runs, 1)
})
