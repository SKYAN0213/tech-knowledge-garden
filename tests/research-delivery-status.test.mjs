import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildIntakeOntologyAudit,
  buildSourceInventory,
  loadDailyModelTiming,
  loadSupplementalCoverageEvidence,
  loadLatestCandidateEvidenceReviewBatch,
  loadLatestDriveReconciliation,
  loadLatestHistoricalSourceReconciliation,
  loadHistoricalSourceAdjudications,
  summarizeCandidateSourceAlternativeResolutions,
  summarizeCurrentSnapshot,
  loadTargetedSearchRuns,
  renderSupplementalCoverageTable,
  renderIntegratedCoveragePanel,
  sourceBaselineEvidence,
  loadLatestSourceRevisionReview,
} from "../scripts/research/delivery-status.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { articleContentFingerprint } from "../scripts/research/parser.mjs"

test("revision status reports missing or invalid evidence without claiming zero pending reviews", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "revision-status-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.deepEqual(loadLatestSourceRevisionReview(root, "missing-backlog.json"), {
    status: "missing",
    pending: null,
  })
  fs.mkdirSync(path.join(root, "review-queues", "broken"), { recursive: true })
  fs.writeFileSync(
    path.join(root, "review-queues", "broken", "queue.json"),
    JSON.stringify({ schema: "research-source-revision-queue/v1", counts: { pending: 0 } }),
  )
  const result = loadLatestSourceRevisionReview(root, "missing-backlog.json")
  assert.equal(result.status, "requires_new_snapshot")
  assert.equal(result.pending, null)
  assert.match(result.reason, /snapshot hash mismatch/)
})

test("integrated coverage panel does not replace the full grid with a narrow latest run", () => {
  const html = renderIntegratedCoveragePanel({
    status: "historical_success_requires_current_revalidation",
    run_id: "daily-20261003-core38-planonly-v1",
    coverage: { partial: 19, not_attempted: 13 },
  })

  assert.match(html, /마지막 통합 조사 범위 · 32칸/)
  assert.match(html, /partial 19 · not_attempted 13/)
  assert.match(html, /이 실행 이후 설정 변경이 있어 최신 경로 실행은 별도 확인 필요/)
  assert.doesNotMatch(html, /partial 1 · not_attempted 31/)
})

test("daily model timing joins only integrity-checked model budgets through exact source selection", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-daily-model-time-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = { documents: [{ id: "doc-1" }], parses: [{ id: "parse-1" }] }
  const hashes = {
    documents_sha256: sha256(JSON.stringify(source.documents)),
    parses_sha256: sha256(JSON.stringify(source.parses)),
  }
  const writeSelection = (runId, dailyRun = "daily-20260930", selectedSource = source) => {
    const directory = path.join(root, "runs", runId)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(
      path.join(directory, "documents.json"),
      JSON.stringify(selectedSource.documents),
    )
    fs.writeFileSync(path.join(directory, "parses.json"), JSON.stringify(selectedSource.parses))
    fs.writeFileSync(
      path.join(directory, "source-selection.json"),
      JSON.stringify({
        schema: "research-source-selection/v1",
        daily_run: dailyRun,
        candidate_key: `candidate-${runId}`,
        candidate_published: false,
        documents_sha256: sha256(JSON.stringify(selectedSource.documents)),
        parses_sha256: sha256(JSON.stringify(selectedSource.parses)),
      }),
    )
  }
  const writeBudget = (
    runId,
    { corrupt = false, schema = "model-budget/v1", extensions = undefined } = {},
  ) => {
    const directory = path.join(root, "runs", runId)
    fs.mkdirSync(path.join(directory, "model-policy", "fact_extract"), { recursive: true })
    fs.writeFileSync(path.join(directory, "documents.json"), JSON.stringify(source.documents))
    fs.writeFileSync(path.join(directory, "parses.json"), JSON.stringify(source.parses))
    const result = {
      provenance: {
        wall_ms: 120,
        load_duration: 10_000_000,
        prompt_eval_duration: 20_000_000,
        eval_duration: 90_000_000,
        prompt_eval_count: 12,
        eval_count: 34,
      },
    }
    const resultWithoutPromptTiming = structuredClone(result)
    delete resultWithoutPromptTiming.provenance.prompt_eval_duration
    const attempts = [
      {
        id: "complete-1",
        status: "complete",
        reserved_ms: 1000,
        wall_ms: 120,
        result,
        result_sha256: sha256(JSON.stringify(result)),
      },
      {
        id: "complete-without-prompt-timing",
        status: "complete",
        reserved_ms: 1000,
        wall_ms: 120,
        result: resultWithoutPromptTiming,
        result_sha256: sha256(JSON.stringify(resultWithoutPromptTiming)),
      },
      { id: "failed-1", status: "failed", reserved_ms: 500, wall_ms: 45 },
      { id: "running-1", status: "running", reserved_ms: 800 },
    ]
    const ledger = {
      schema,
      binding: {
        schema: "model-role-binding/v1",
        role: "fact_extract",
        settings: { provider: "ollama", model: "qwen3.8:27b" },
      },
      attempts,
      ...(extensions === undefined ? {} : { extensions }),
    }
    fs.writeFileSync(
      path.join(directory, "model-policy", "fact_extract", "budget.json"),
      JSON.stringify({
        ...ledger,
        sha256: corrupt ? "f".repeat(64) : sha256(JSON.stringify(ledger)),
      }),
    )
  }
  writeSelection("selected-source")
  writeBudget("model-extract-valid", {
    schema: "model-budget/v2",
    extensions: [
      {
        additional_ms: 30000,
        reason: "Complete a source-backed extraction after the initial budget expired.",
        created_at: "2026-09-30T09:00:00.000Z",
      },
    ],
  })
  writeBudget("model-extract-tampered", { corrupt: true })
  writeBudget("model-extract-invalid-v2-extension", {
    schema: "model-budget/v2",
    extensions: [{ additional_ms: 0, reason: "", created_at: "invalid" }],
  })
  writeSelection("other-day-source", "daily-other", {
    documents: [{ id: "other-doc" }],
    parses: [{ id: "other-parse" }],
  })

  const timing = loadDailyModelTiming(root, "daily-20260930")
  assert.equal(timing.status, "partial_invalid_receipts")
  assert.equal(timing.linked_selection_runs, 1)
  assert.equal(timing.measured_runs, 1)
  assert.equal(timing.unmeasured_runs, 2)
  assert.equal(timing.invalid_receipts, 2)
  assert.deepEqual(timing.attempts, { complete: 2, failed: 1, running: 1 })
  assert.equal(timing.model_wall_ms, 285)
  assert.equal(timing.reserved_running_ms, 800)
  assert.deepEqual(timing.by_role.fact_extract.attempts, timing.attempts)
  assert.equal(timing.by_provider.ollama.model_wall_ms, 285)
  assert.deepEqual(timing.local_phase_timing, {
    instrumented_attempts: 2,
    phase_attempts: { load: 2, prompt_eval: 1, generation: 2 },
    load_ms: 20,
    prompt_eval_ms: 20,
    generation_ms: 180,
    prompt_tokens: 24,
    output_tokens: 68,
  })
  assert.deepEqual(timing.by_provider.ollama.local_phase_timing, timing.local_phase_timing)
  assert.equal(JSON.stringify(timing).includes("candidate-selected-valid"), false)
  const unrelatedDailyRun = loadDailyModelTiming(root, "daily-unobserved")
  assert.equal(unrelatedDailyRun.status, "no_linked_model_runs")
  assert.equal(unrelatedDailyRun.local_phase_timing.load_ms, null)
  assert.equal(unrelatedDailyRun.local_phase_timing.generation_ms, null)
})

test("daily model timing rejects fingerprints selected by multiple daily runs", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "research-daily-model-ambiguous-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const documents = [{ id: "shared-doc" }]
  const parses = [{ id: "shared-parse" }]
  const hashes = {
    documents_sha256: sha256(JSON.stringify(documents)),
    parses_sha256: sha256(JSON.stringify(parses)),
  }
  for (const [runId, dailyRun] of [
    ["selection-a", "daily-a"],
    ["selection-b", "daily-b"],
  ]) {
    const directory = path.join(root, "runs", runId)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, "documents.json"), JSON.stringify(documents))
    fs.writeFileSync(path.join(directory, "parses.json"), JSON.stringify(parses))
    fs.writeFileSync(
      path.join(directory, "source-selection.json"),
      JSON.stringify({
        schema: "research-source-selection/v1",
        daily_run: dailyRun,
        candidate_key: `candidate-${runId}`,
        candidate_published: false,
        ...hashes,
      }),
    )
  }
  const modelRun = path.join(root, "runs", "model-run")
  fs.mkdirSync(path.join(modelRun, "model-policy", "fact_extract"), { recursive: true })
  fs.writeFileSync(path.join(modelRun, "documents.json"), JSON.stringify(documents))
  fs.writeFileSync(path.join(modelRun, "parses.json"), JSON.stringify(parses))
  const ledger = {
    schema: "model-budget/v1",
    binding: { role: "fact_extract", settings: { provider: "ollama", model: "test" } },
    attempts: [],
  }
  fs.writeFileSync(
    path.join(modelRun, "model-policy", "fact_extract", "budget.json"),
    JSON.stringify({ ...ledger, sha256: sha256(JSON.stringify(ledger)) }),
  )
  const timing = loadDailyModelTiming(root, "daily-a")
  assert.equal(timing.status, "partial_invalid_receipts")
  assert.equal(timing.linked_selection_runs, 1)
  assert.equal(timing.measured_runs, 0)
  assert.equal(timing.invalid_receipts, 1)
})

test("live status snapshot separates configured parser profiles from current candidate review states", () => {
  const snapshot = summarizeCurrentSnapshot(
    { acquisition_profiles: 27, article_profiles: 67 },
    {
      status: "read_only_inventory",
      source_sha256: "a".repeat(64),
      counts: {
        total: 146,
        review_status: { verified: 62, deferred: 11, rejected: 1, unreviewed: 72 },
        approval_receipt_linked: 6,
      },
    },
  )

  assert.deepEqual(snapshot, {
    status: "current_local_snapshot",
    acquisition_profiles: 27,
    article_profiles: 67,
    candidate_count: 146,
    review_status: { verified: 62, deferred: 11, rejected: 1, unreviewed: 72 },
    approval_receipt_linked: 6,
    backlog_sha256: "a".repeat(64),
  })
  assert.deepEqual(
    summarizeCurrentSnapshot(
      { acquisition_profiles: 1, article_profiles: 1 },
      { status: "invalid" },
    ),
    {
      status: "invalid",
      candidate_count: 0,
      review_status: {},
      approval_receipt_linked: 0,
    },
  )
})

test("source inventory keeps registered-only routes visible and marks daily scope separately", () => {
  const inventory = buildSourceInventory({
    knownRoutes: [
      {
        id: "inactive-unclassified",
        name: "Pending source",
        sectors: ["AI"],
        region: "국내",
        kind: "미분류",
      },
      {
        channel_id: "registered-channel-only",
        name: "Legacy source",
        sectors: ["AI"],
        region: "해외",
        kind: "research",
      },
      {
        id: "active-company",
        name: "Active source",
        sectors: ["AI"],
        region: "해외",
        kind: "company",
        verification: "verified",
        method: "rss",
      },
    ],
    activeRoutes: [{ channel_id: "active-company", enabled: true, baseline_run: "baseline-run" }],
  })

  assert.equal(inventory.length, 3)
  assert.equal(inventory[0].id, "active-company")
  assert.equal(inventory[0].daily_enabled, true)
  assert.equal(inventory[0].baseline_run, "baseline-run")
  assert.equal(inventory[1].id, "registered-channel-only")
  assert.equal(inventory[1].daily_enabled, false)
  assert.equal(inventory[1].development_status, "registered_only")
  assert.equal(inventory[2].id, "inactive-unclassified")
})

test("targeted list-scan baselines count only when their route window and stored bytes verify", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "research-source-baseline-status-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "route-baseline"
  const url = "https://example.org/news"
  const body = Buffer.from("official news list")
  const digest = sha256(body)
  const id = sourceId(url)
  const bodyPath = `documents/${id}/${digest}/body.bin`
  fs.mkdirSync(path.dirname(path.join(root, bodyPath)), { recursive: true })
  fs.writeFileSync(path.join(root, bodyPath), body)
  const document = {
    fetch_status: "captured",
    source_id: id,
    original_url: url,
    source_version_id: `${id}:${digest}`,
    body_sha256: digest,
    body_path: bodyPath,
  }
  const summary = {
    status: "window_scanned",
    channel_id: "route-baseline",
    window: { since: "2026-10-01", until_exclusive: "2026-10-02" },
    candidate_count: 0,
  }
  const runDirectory = path.join(root, "runs", runId)
  fs.mkdirSync(runDirectory, { recursive: true })
  fs.writeFileSync(path.join(runDirectory, "list-scan.json"), JSON.stringify(summary))
  fs.writeFileSync(path.join(runDirectory, "documents.json"), "[]")
  fs.writeFileSync(path.join(runDirectory, "parses.json"), "[]")
  fs.writeFileSync(path.join(runDirectory, "candidates.json"), "[]")
  fs.writeFileSync(path.join(runDirectory, "list-pages.json"), JSON.stringify([document]))
  const source = { id: "route-baseline", baseline_run: runId }
  const targetedScan = { file: path.join(runDirectory, "list-scan.json"), summary }

  assert.deepEqual(sourceBaselineEvidence(root, source, null, targetedScan), {
    exists: true,
    summary_status: "window_scanned",
    route_status: "window_scanned",
    evidence_type: "targeted_list_scan",
  })
  fs.writeFileSync(path.join(root, bodyPath), "changed bytes")
  assert.deepEqual(sourceBaselineEvidence(root, source, null, targetedScan), {
    exists: false,
    summary_status: "invalid_evidence",
    route_status: "invalid_evidence",
    evidence_type: "targeted_list_scan",
    validation_error: "Daily scan original body hash mismatch",
  })
})

test("delivery status reports only supplemental scans whose source bytes and coverage still verify", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "research-supplemental-status-")),
  )
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const backlogFile = path.join(root, "candidate-backlog.json")
  fs.writeFileSync(
    backlogFile,
    JSON.stringify({ schema: "research-candidates/v1", candidates: [] }),
  )
  const run = "independent-scan"
  const channel_id = "route-test"
  const since = "2026-09-30"
  const until_exclusive = "2026-10-02"
  const url = "https://example.org/news"
  const body = Buffer.from('{"items":[]}')
  const body_sha256 = sha256(body)
  const body_path = `sources/${sourceId(url)}.json`
  fs.mkdirSync(path.join(root, "sources"), { recursive: true })
  fs.writeFileSync(path.join(root, body_path), body)
  const document = {
    original_url: url,
    source_id: sourceId(url),
    source_version_id: `${sourceId(url)}:${body_sha256}`,
    fetch_status: "captured",
    body_path,
    body_sha256,
  }
  const scanDir = path.join(root, "runs", run)
  fs.mkdirSync(scanDir, { recursive: true })
  fs.writeFileSync(
    path.join(scanDir, "list-scan.json"),
    JSON.stringify({
      status: "window_scanned",
      channel_id,
      window: { since, until_exclusive },
      candidate_count: 0,
    }),
  )
  fs.writeFileSync(path.join(scanDir, "list-pages.json"), JSON.stringify([document]))
  fs.writeFileSync(path.join(scanDir, "documents.json"), "[]")
  fs.writeFileSync(path.join(scanDir, "parses.json"), "[]")
  fs.writeFileSync(path.join(scanDir, "candidates.json"), "[]")
  const reconciliation_run = "daily-example-reconcile"
  const reconciliations = path.join(root, "daily/reconciliations")
  fs.mkdirSync(reconciliations, { recursive: true })
  const receiptFile = path.join(reconciliations, `${reconciliation_run}.json`)
  fs.writeFileSync(
    receiptFile,
    JSON.stringify({
      schema: "research-supplemental-coverage/v2",
      reconciliation_run,
      scan_run: run,
      channel_id,
      since,
      scan_until_exclusive: until_exclusive,
      coverage_until: "2026-10-01",
      reconciled_at: "2026-10-01T00:30:00+09:00",
      candidate_keys: [],
      candidate_published: false,
      backlog_merge: { status: "merged", same_event_aliases: [] },
    }),
  )
  fs.mkdirSync(path.join(root, "daily"), { recursive: true })
  fs.writeFileSync(
    path.join(root, "daily/route-coverage.json"),
    JSON.stringify({
      schema: "research-daily-coverage/v1",
      routes: {
        [channel_id]: {
          covered: [
            {
              since,
              until_exclusive: "2026-10-01",
              source_run: run,
              kind: "verified_supplemental_scan",
              reconciliation_run,
            },
          ],
        },
      },
    }),
  )

  const evidence = loadSupplementalCoverageEvidence(root, [{ channel_id }], backlogFile)
  assert.equal(evidence.status, "verified")
  assert.equal(evidence.receipt_count, 1)
  assert.equal(evidence.candidate_count, 0)
  assert.equal(evidence.entries[0].coverage_until, "2026-10-01")
  assert.equal(JSON.stringify(evidence).includes("example.org"), false)

  const missingAliases = JSON.parse(fs.readFileSync(receiptFile, "utf8"))
  delete missingAliases.backlog_merge.same_event_aliases
  fs.writeFileSync(receiptFile, JSON.stringify(missingAliases))
  const withMissingAliases = loadSupplementalCoverageEvidence(root, [{ channel_id }], backlogFile)
  assert.equal(withMissingAliases.status, "partial_or_invalid")
  assert.equal(withMissingAliases.receipt_count, 0)
  assert.equal(withMissingAliases.invalid_receipt_count, 1)
  fs.writeFileSync(
    receiptFile,
    JSON.stringify({
      schema: "research-supplemental-coverage/v2",
      reconciliation_run,
      scan_run: run,
      channel_id,
      since,
      scan_until_exclusive: until_exclusive,
      coverage_until: "2026-10-01",
      reconciled_at: "2026-10-01T00:30:00+09:00",
      candidate_keys: [],
      candidate_published: false,
      backlog_merge: { status: "merged", same_event_aliases: [] },
    }),
  )

  fs.writeFileSync(path.join(reconciliations, "invalid.json"), JSON.stringify({ schema: "wrong" }))
  fs.writeFileSync(path.join(reconciliations, "malformed.json"), "{")
  const withInvalid = loadSupplementalCoverageEvidence(root, [{ channel_id }], backlogFile)
  assert.equal(withInvalid.status, "partial_or_invalid")
  assert.equal(withInvalid.receipt_count, 1)
  assert.equal(withInvalid.invalid_receipt_count, 2)
})

test("supplemental coverage is rendered as a concise, escaped period table", () => {
  const html = renderSupplementalCoverageTable({
    status: "verified",
    receipt_count: 2,
    invalid_receipt_count: 0,
    unique_candidate_count: 1,
    entries: [
      {
        reconciliation_run: "older-reconcile",
        scan_run: "older-scan",
        channel_id: "route-older",
        since: "2026-09-20",
        scan_until_exclusive: "2026-09-27",
        coverage_until: "2026-09-26",
        candidate_count: 1,
        reconciled_at: "2026-09-26T12:00:00Z",
      },
      {
        reconciliation_run: "latest-reconcile",
        scan_run: "latest-scan",
        channel_id: "route-<script>",
        since: "2026-09-28",
        scan_until_exclusive: "2026-10-04",
        coverage_until: "2026-10-03",
        candidate_count: 0,
        reconciled_at: "2026-10-02T16:13:16.876Z",
      },
    ],
  })

  assert.match(html, /검증된 2건 · 무효 0건 · 관측 후보 1건/)
  assert.match(html, /관측 후보는 승인·발행 건수가 아닙니다/)
  assert.ok(html.indexOf("latest-scan") < html.indexOf("older-scan"))
  assert.match(html, /\[2026-09-28, 2026-10-04\)/)
  assert.match(html, /route-&lt;script&gt;/)
  assert.doesNotMatch(html, /route-<script>/)
  assert.match(html, /coverage 반영 종료/)
})

test("alternative-source same-event receipts are counted read-only and invalid receipts stay visible", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-alternative-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receiptDir = path.join(root, "runs", "resolution-1")
  fs.mkdirSync(receiptDir, { recursive: true })
  const receiptPath = path.join(receiptDir, "candidate-source-alternative.json")
  const receipt = {
    schema: "research-candidate-source-alternative-resolution/v1",
    candidate_key: "candidate-1",
    original_source: { url: "https://example.org/original" },
    alternative_source: {
      url: "https://example.org/official-alternate",
      body_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
    },
    decision: "same_event",
    claim_evidence: [{ claim_id: "claim-1" }],
    candidate_approved: false,
    candidate_published: false,
    backlog_written: false,
    drive_written: false,
    public_verified: false,
  }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt))
  assert.deepEqual(summarizeCandidateSourceAlternativeResolutions(root), {
    status: "read_only",
    receipt_count: 1,
    invalid_receipt_count: 0,
    decision_counts: { same_event: 1 },
  })

  receipt.candidate_published = true
  fs.writeFileSync(receiptPath, JSON.stringify(receipt))
  assert.deepEqual(summarizeCandidateSourceAlternativeResolutions(root), {
    status: "partial_or_invalid",
    receipt_count: 0,
    invalid_receipt_count: 1,
    decision_counts: {},
  })
})

test("delivery status reports ontology review links from the candidate ledger without modifying it", (t) => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-delivery-status-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  const candidatePath = path.join(repo, ".local/research/candidate-backlog.json")
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true })
  const ledger = {
    schema: "research-candidates/v1",
    candidates: [
      {
        key: "source-one",
        title: "Example robotics announcement",
        source_urls: ["https://example.org/story?utm_source=rss"],
        source_published_at: "2026-09-29",
        review_status: "unreviewed",
        article_source_version_id: `source-one:${"a".repeat(64)}`,
        article_content_sha256: "b".repeat(64),
      },
      {
        key: "source-two",
        title: "Example robotics announcement",
        source_urls: ["https://example.org/story#details"],
        source_published_at: "2026-09-29",
        review_status: "verified",
        event_id: "0123456789abcdef",
        article_source_version_id: `source-two:${"c".repeat(64)}`,
        article_content_sha256: "b".repeat(64),
      },
      {
        key: "without-body-fingerprint",
        title: "A separate robotics announcement",
        source_urls: ["https://example.org/another-story"],
        source_published_at: "2026-09-28",
        review_status: "unreviewed",
      },
    ],
  }
  fs.writeFileSync(candidatePath, JSON.stringify(ledger))
  const before = fs.readFileSync(candidatePath)

  const result = buildIntakeOntologyAudit(repo)

  assert.equal(result.status, "read_only_projection")
  assert.equal(result.candidate_count, 3)
  assert.equal(result.fingerprint_evidence.stale_receipt_count, 0)
  assert.deepEqual(result.ontology.node_counts, {
    Candidate: 3,
    Event: 1,
    Source: 2,
    SourceVersion: 2,
  })
  assert.equal(result.ontology.review_required_count, 3)
  assert.equal(result.ontology.fingerprinted_candidate_count, 2)
  assert.equal(result.ontology.missing_content_fingerprint_count, 1)
  assert.equal(result.ontology.invalid_content_fingerprint_count, 0)
  assert.deepEqual(
    result.ontology.review_relations.map((relation) => relation.type),
    ["sameExtractedContentCandidate", "sameTitleDayCandidate", "sharedCanonicalSourceCandidate"],
  )
  assert.deepEqual(fs.readFileSync(candidatePath), before)
})

test("delivery status maps targeted search receipts back to source registrations", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-targeted-search-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = path.join(root, "runs/target-run")
  fs.mkdirSync(run, { recursive: true })
  fs.writeFileSync(
    path.join(run, "targeted-queries.json"),
    JSON.stringify({
      schema: "research-source-targeted-plan/v1",
      run_id: "target-run",
      daily_basis: { daily_run: "daily-run" },
      unresolved_slots: ["4-0-1"],
      candidate_published: false,
      queries: [
        {
          slot_id: "target-0-0-0-0",
          source_channel_id: "registered-source",
          source_url: "https://example.org/news",
        },
      ],
    }),
  )
  fs.writeFileSync(
    path.join(run, "search.json"),
    JSON.stringify({
      records: [
        {
          slot_id: "target-0-0-0-0",
          status: "partial",
          result_count: 7,
          candidate_count: 4,
          failures: [["engine-one", "CAPTCHA"]],
        },
        {
          slot_id: "target-0-0-0-1",
          status: "failed",
          error: "No usable search results; engines reported failures",
        },
      ],
      candidates: [
        { key: "one", source_urls: ["https://example.org/a?utm_source=rss"] },
        { key: "one-copy", source_urls: ["https://example.org/a#article"] },
        { key: "two", source_urls: ["https://example.org/b"] },
      ],
    }),
  )

  const [result] = loadTargetedSearchRuns(root)

  assert.equal(result.summary.run_id, "target-run")
  assert.equal(result.summary.planned_queries, 1)
  assert.equal(result.summary.recorded_queries, 2)
  assert.deepEqual(result.summary.query_statuses, { failed: 1, partial: 1 })
  assert.equal(result.summary.queries_with_candidates, 1)
  assert.equal(result.summary.failed_queries, 1)
  assert.equal(result.summary.engine_failures, 1)
  assert.equal(result.summary.candidates, 3)
  assert.equal(result.summary.unique_candidate_urls, 2)
  assert.equal(result.summary.duplicate_candidate_rows, 1)
  assert.equal(result.summary.candidates_missing_canonical_url, 0)
  assert.equal(result.summary.failed_queries_without_engine_details, 1)
  assert.equal(result.records[0].source_channel_id, "registered-source")
  assert.equal(result.records[0].engine_failure_count, 1)
})

test("delivery status exposes only aggregate counts from the newest private Drive reconciliation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-drive-reconciliation-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receipts = path.join(root, "daily/runs/daily-example/drive-reconciliations")
  fs.mkdirSync(receipts, { recursive: true })
  const receiptPath = path.join(receipts, `${"a".repeat(64)}.json`)
  fs.writeFileSync(
    receiptPath,
    JSON.stringify({
      schema: "research-drive-approval-reconciliation/v1",
      generated_at: "2026-09-30T13:00:00Z",
      daily_run: "daily-example",
      drive_snapshot: { file_count: 193, age_ms: 900000, fresh_for_new_plan: false },
      candidate_count: 100,
      classification_counts: { exact_source_and_verified_event: 4, new_event_identity_review: 96 },
      duplicate_source_groups: [],
      candidate_published: false,
      drive_written: false,
      public_verified: false,
      candidates: [{ source_urls: ["https://private.example/story"] }],
    }),
  )

  const summary = loadLatestDriveReconciliation(root)

  assert.equal(summary.status, "reconciled_read_only")
  assert.equal(summary.daily_run, "daily-example")
  assert.equal(summary.drive_file_count, 193)
  assert.equal(summary.fresh_for_new_plan, false)
  assert.equal(summary.candidate_count, 100)
  assert.equal(summary.classification_counts.new_event_identity_review, 96)
  assert.equal(summary.candidate_published, false)
  assert.equal(summary.drive_written, false)
  assert.equal(summary.public_verified, false)
  assert.equal("candidates" in summary, false)
})

test("delivery status includes verified source receipt coverage without exposing article content", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-source-evidence-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receipts = path.join(root, "daily/runs/daily-example/identity-review-batches")
  fs.mkdirSync(receipts, { recursive: true })
  fs.writeFileSync(
    path.join(receipts, `${"b".repeat(64)}.json`),
    JSON.stringify({
      schema: "research-candidate-source-evidence-review/v1",
      generated_at: "2026-09-30T13:30:00Z",
      daily_run: "daily-example",
      candidate_count: 96,
      source_attempt_count: 62,
      source_attempt_counts: {
        candidate_exact_source_and_parse: 30,
        prior_source_version_same_article_content: 31,
        prior_source_version_article_content_changed: 1,
      },
      candidate_source_states: {
        "private-key": { candidate_exact_source_and_parse: 1 },
      },
      candidates: [
        { candidate_key: "private-key", source_urls: ["https://private.example/secret"] },
      ],
      candidate_approved: false,
      candidate_published: false,
      drive_written: false,
      public_verified: false,
    }),
  )
  const file = path.join(receipts, `${"b".repeat(64)}.json`)
  const batch = JSON.parse(fs.readFileSync(file, "utf8"))
  batch.candidate_count = 1
  fs.writeFileSync(file, JSON.stringify(batch))

  const summary = loadLatestCandidateEvidenceReviewBatch(root)

  assert.equal(summary.status, "source_evidence_reviewed")
  assert.equal(summary.daily_run, "daily-example")
  assert.equal(summary.candidate_count, 1)
  assert.equal(summary.candidates_with_source_attempts, 1)
  assert.equal(summary.candidates_without_source_attempts, 0)
  assert.equal(summary.source_attempt_count, 62)
  assert.equal(summary.source_attempt_counts.prior_source_version_same_article_content, 31)
  assert.equal(summary.candidate_published, false)
  assert.equal("candidates" in summary, false)
  assert.equal(JSON.stringify(summary).includes("private.example"), false)
})

test("delivery status summarizes historical source reconciliation without exposing identities", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-historical-source-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, "daily/runs/daily-example/historical-source-reconciliations")
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, `${"d".repeat(64)}.json`),
    JSON.stringify({
      schema: "research-historical-source-reconciliation/v1",
      generated_at: "2026-09-30T14:00:00Z",
      daily_run: "daily-example",
      candidate_count: 2,
      candidates_with_historical_sources: 1,
      historical_source_version_count: 4,
      historical_parse_count: 3,
      candidate_status_counts: {
        historical_source_and_parse_found: 1,
        no_exact_url_in_stored_runs: 1,
      },
      comparison_counts: { prior_source_version_same_content: 2 },
      run_validation_failure_count: 0,
      candidates: [
        {
          candidate_key: "private-candidate",
          source_urls: ["https://private.example/story"],
          historical_sources: [{ article_text: "private article body" }],
        },
        { candidate_key: "private-candidate-2", source_urls: [], historical_sources: [] },
      ],
      candidate_approved: false,
      candidate_published: false,
      drive_written: false,
      public_verified: false,
    }),
  )

  const summary = loadLatestHistoricalSourceReconciliation(root)

  assert.equal(summary.status, "historical_sources_reconciled_read_only")
  assert.equal(summary.daily_run, "daily-example")
  assert.equal(summary.candidate_count, 2)
  assert.equal(summary.candidates_with_historical_sources, 1)
  assert.equal(summary.historical_source_version_count, 4)
  assert.equal(summary.candidate_status_counts.no_exact_url_in_stored_runs, 1)
  assert.equal(summary.candidate_published, false)
  assert.equal("candidates" in summary, false)
  assert.equal(JSON.stringify(summary).includes("private.example"), false)
})

test("delivery status counts only adjudications bound to exact historical parse evidence", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-parse-adjudication-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceUrl = "https://example.org/story"
  const body = Buffer.from('<script>datePublished": "2026-09-30</script>')
  const sourceHash = sha256(body)
  const sourceVersion = `${sourceId(sourceUrl)}:${sourceHash}`
  const approvedParse = "b".repeat(64)
  const oldParse = "c".repeat(64)
  const metadataParse = "8".repeat(64)
  const metadataBlocksParse = "7".repeat(64)
  const priorVersionParse = "6".repeat(64)
  const priorMetadataParse = "5".repeat(64)
  const priorVersionBody = Buffer.from("<p>Second full story paragraph</p>")
  const priorVersionHash = sha256(priorVersionBody)
  const priorVersion = `${sourceId(sourceUrl)}:${priorVersionHash}`
  const dateEvidence = 'datePublished": "2026-09-30'
  const priorMetadataBody = Buffer.from(`<script>${dateEvidence}</script>`)
  const priorMetadataHash = sha256(priorMetadataBody)
  const priorMetadataVersion = `${sourceId(sourceUrl)}:${priorMetadataHash}`
  const approvedBlocks = [
    { type: "paragraph", text: "First full story paragraph" },
    { type: "paragraph", text: "Second full story paragraph" },
  ]
  const historicalBlocks = [{ type: "paragraph", text: approvedBlocks[0].text }]
  const approvedRecord = {
    parse_id: approvedParse,
    source_version_id: sourceVersion,
    status: "extracted",
    title: "Example story",
    dates: { published_at: "2026-09-30" },
    blocks: approvedBlocks,
  }
  const oldRecord = {
    ...approvedRecord,
    parse_id: oldParse,
    blocks: historicalBlocks,
  }
  const metadataRecord = {
    ...approvedRecord,
    parse_id: metadataParse,
    dates: { published_at: null },
  }
  const metadataBlocksRecord = {
    ...approvedRecord,
    parse_id: metadataBlocksParse,
    dates: { published_at: null },
    blocks: [
      { type: "heading", text: approvedRecord.title },
      { type: "paragraph", text: "2026. 09. 30" },
      ...approvedBlocks,
    ],
  }
  const approvedFingerprint = articleContentFingerprint(approvedRecord)
  const oldFingerprint = articleContentFingerprint(oldRecord)
  const metadataFingerprint = articleContentFingerprint(metadataRecord)
  const metadataBlocksFingerprint = articleContentFingerprint(metadataBlocksRecord)
  const source = {
    original_url: sourceUrl,
    source_version_id: sourceVersion,
    body_sha256: sourceHash,
    parses: [
      {
        parse_id: approvedParse,
        article_content_sha256: approvedFingerprint,
        comparison_to_candidate: "same_source_version_parse_and_content",
      },
      {
        parse_id: oldParse,
        article_content_sha256: oldFingerprint,
        comparison_to_candidate: "same_source_version_content_differs",
      },
      {
        parse_id: metadataParse,
        article_content_sha256: metadataFingerprint,
        comparison_to_candidate: "same_source_version_content_differs",
      },
      {
        parse_id: metadataBlocksParse,
        article_content_sha256: metadataBlocksFingerprint,
        comparison_to_candidate: "same_source_version_content_differs",
      },
    ],
  }
  const reconciliation = {
    comparison_counts: {
      same_source_version_content_differs: 3,
      prior_source_version_different_content: 2,
    },
    candidates: [
      {
        candidate_key: "candidate-one",
        historical_sources: [
          source,
          {
            original_url: sourceUrl,
            source_version_id: priorVersion,
            body_sha256: priorVersionHash,
            parses: [
              {
                parse_id: priorVersionParse,
                article_content_sha256: oldFingerprint,
                comparison_to_candidate: "prior_source_version_different_content",
              },
            ],
          },
          {
            original_url: sourceUrl,
            source_version_id: priorMetadataVersion,
            body_sha256: priorMetadataHash,
            parses: [
              {
                parse_id: priorMetadataParse,
                article_content_sha256: metadataFingerprint,
                comparison_to_candidate: "prior_source_version_different_content",
              },
            ],
          },
        ],
      },
    ],
  }
  const bodyDirectory = path.join(root, "documents", sourceId(sourceUrl), sourceHash)
  fs.mkdirSync(bodyDirectory, { recursive: true })
  fs.writeFileSync(path.join(bodyDirectory, "body.bin"), body)
  const priorVersionBodyDirectory = path.join(
    root,
    "documents",
    sourceId(sourceUrl),
    priorVersionHash,
  )
  fs.mkdirSync(priorVersionBodyDirectory, { recursive: true })
  fs.writeFileSync(path.join(priorVersionBodyDirectory, "body.bin"), priorVersionBody)
  const priorMetadataBodyDirectory = path.join(
    root,
    "documents",
    sourceId(sourceUrl),
    priorMetadataHash,
  )
  fs.mkdirSync(priorMetadataBodyDirectory, { recursive: true })
  fs.writeFileSync(path.join(priorMetadataBodyDirectory, "body.bin"), priorMetadataBody)
  const parseArtifacts = path.join(root, "parses")
  const priorVersionRecord = {
    ...oldRecord,
    parse_id: priorVersionParse,
    source_version_id: priorVersion,
  }
  const priorMetadataRecord = {
    ...metadataRecord,
    parse_id: priorMetadataParse,
    source_version_id: priorMetadataVersion,
  }
  for (const parse of [
    approvedRecord,
    oldRecord,
    metadataRecord,
    metadataBlocksRecord,
    priorVersionRecord,
    priorMetadataRecord,
  ]) {
    const parseDirectory = path.join(parseArtifacts, parse.parse_id)
    fs.mkdirSync(parseDirectory, { recursive: true })
    fs.writeFileSync(path.join(parseDirectory, "parse.json"), JSON.stringify(parse))
  }
  const approvedParseBytes = fs.readFileSync(path.join(parseArtifacts, approvedParse, "parse.json"))
  const oldParseBytes = fs.readFileSync(path.join(parseArtifacts, oldParse, "parse.json"))
  const metadataParseBytes = fs.readFileSync(path.join(parseArtifacts, metadataParse, "parse.json"))
  const metadataBlocksParseBytes = fs.readFileSync(
    path.join(parseArtifacts, metadataBlocksParse, "parse.json"),
  )
  const approval = {
    candidate_key: "candidate-one",
    event_id: "f".repeat(16),
    source_version_id: sourceVersion,
    parse_id: approvedParse,
    article_content_sha256: approvedFingerprint,
    candidate_published: false,
  }
  const runDirectory = path.join(root, "runs", "approved-run")
  fs.mkdirSync(runDirectory, { recursive: true })
  fs.writeFileSync(path.join(runDirectory, "candidate-approval.json"), JSON.stringify(approval))
  const approvalBytes = fs.readFileSync(path.join(runDirectory, "candidate-approval.json"))
  const receipt = {
    schema: "historical-parse-adjudication/v1",
    adjudication_id: "example-truncation-v1",
    generated_at: "2026-10-01T01:00:00Z",
    scope: {
      candidate_key: "candidate-one",
      event_id: "f".repeat(16),
      source_url: sourceUrl,
      source_version_id: sourceVersion,
      source_body_sha256: sourceHash,
      source_bytes: body.length,
    },
    decision: {
      classification: "same_source_parser_truncation",
      raw_reconciliation_class: "same_source_version_content_differs",
      affected_historical_parse_count: 1,
      raw_comparison_rows_resolved: 1,
      source_content_changed: false,
      candidate_identity_changed: false,
      approval_changed: false,
      publication_changed: false,
    },
    approved_baseline: {
      parse_id: approvedParse,
      article_content_sha256: approvedFingerprint,
      block_count: approvedBlocks.length,
      run_id: "approved-run",
      approval_receipt_sha256: sha256(approvalBytes),
      parse_artifact_sha256: sha256(approvedParseBytes),
    },
    incomplete_historical_parses: [
      {
        parse_id: oldParse,
        article_content_sha256: oldFingerprint,
        parse_artifact_sha256: sha256(oldParseBytes),
        block_count: historicalBlocks.length,
        parser: { id: "trafilatura" },
        blocks_exactly_present_in_approved_parse: historicalBlocks.length,
      },
    ],
    constraints: {
      candidate_published: false,
      drive_written: false,
      public_verified: false,
      source_and_approval_artifacts_mutated: false,
    },
  }
  fs.mkdirSync(path.join(root, "adjudications"), { recursive: true })
  fs.writeFileSync(path.join(root, "adjudications/receipt.json"), JSON.stringify(receipt))
  const metadataReceipt = structuredClone(receipt)
  metadataReceipt.adjudication_id = "example-publication-date-gap-v1"
  metadataReceipt.decision.classification = "same_source_parser_metadata_gap"
  metadataReceipt.decision.changed_field = "dates.published_at"
  metadataReceipt.incomplete_historical_parses = [
    {
      parse_id: metadataParse,
      article_content_sha256: metadataFingerprint,
      parse_artifact_sha256: sha256(metadataParseBytes),
      block_count: approvedBlocks.length,
      parser: { id: "trafilatura" },
      blocks_exactly_present_in_approved_parse: approvedBlocks.length,
    },
  ]
  fs.writeFileSync(path.join(root, "adjudications/metadata.json"), JSON.stringify(metadataReceipt))
  const metadataBlocksReceipt = structuredClone(receipt)
  metadataBlocksReceipt.adjudication_id = "example-title-date-blocks-v1"
  metadataBlocksReceipt.decision.classification = "same_source_parser_metadata_blocks"
  metadataBlocksReceipt.decision.metadata_block_indexes = [0, 1]
  metadataBlocksReceipt.decision.metadata_block_fields = ["title", "published_at"]
  metadataBlocksReceipt.incomplete_historical_parses = [
    {
      parse_id: metadataBlocksParse,
      article_content_sha256: metadataBlocksFingerprint,
      parse_artifact_sha256: sha256(metadataBlocksParseBytes),
      block_count: approvedBlocks.length + 2,
      parser: { id: "trafilatura" },
      blocks_exactly_present_in_approved_parse: approvedBlocks.length,
    },
  ]
  fs.writeFileSync(
    path.join(root, "adjudications/metadata-blocks.json"),
    JSON.stringify(metadataBlocksReceipt),
  )
  const priorVersionReceipt = structuredClone(receipt)
  priorVersionReceipt.adjudication_id = "prior-version-subset-v1"
  priorVersionReceipt.decision.classification = "prior_version_parse_is_ordered_subset"
  priorVersionReceipt.decision.raw_reconciliation_class = "prior_source_version_different_content"
  priorVersionReceipt.decision.source_content_changed = true
  priorVersionReceipt.decision.source_version_changed = true
  priorVersionReceipt.approved_baseline.source_version_id = sourceVersion
  priorVersionReceipt.incomplete_historical_parses = [
    {
      source_version_id: priorVersion,
      source_body_sha256: priorVersionHash,
      source_bytes: priorVersionBody.length,
      source_body_evidence: ["Second full story paragraph"],
      parse_id: priorVersionParse,
      article_content_sha256: oldFingerprint,
      parse_artifact_sha256: sha256(
        fs.readFileSync(path.join(parseArtifacts, priorVersionParse, "parse.json")),
      ),
      block_count: historicalBlocks.length,
      parser: { id: "trafilatura" },
      blocks_exactly_present_in_approved_parse: historicalBlocks.length,
    },
  ]
  fs.writeFileSync(
    path.join(root, "adjudications/prior-version.json"),
    JSON.stringify(priorVersionReceipt),
  )
  const priorMetadataReceipt = structuredClone(priorVersionReceipt)
  priorMetadataReceipt.adjudication_id = "prior-version-date-gap-v1"
  priorMetadataReceipt.decision.classification = "prior_version_parse_metadata_gap"
  priorMetadataReceipt.decision.changed_field = "dates.published_at"
  priorMetadataReceipt.approved_baseline.source_body_evidence = [dateEvidence]
  priorMetadataReceipt.incomplete_historical_parses = [
    {
      source_version_id: priorMetadataVersion,
      source_body_sha256: priorMetadataHash,
      source_bytes: priorMetadataBody.length,
      source_body_evidence: [dateEvidence],
      parse_id: priorMetadataParse,
      article_content_sha256: metadataFingerprint,
      parse_artifact_sha256: sha256(
        fs.readFileSync(path.join(parseArtifacts, priorMetadataParse, "parse.json")),
      ),
      block_count: approvedBlocks.length,
      parser: { id: "trafilatura" },
      blocks_exactly_present_in_approved_parse: approvedBlocks.length,
    },
  ]
  fs.writeFileSync(
    path.join(root, "adjudications/prior-version-date-gap.json"),
    JSON.stringify(priorMetadataReceipt),
  )

  const result = loadHistoricalSourceAdjudications(root, reconciliation)

  assert.equal(result.status, "verified_read_only_projection")
  assert.equal(result.receipt_count, 5)
  assert.equal(result.invalid_receipt_count, 0)
  assert.equal(result.adjudicated_comparison_rows, 5)
  assert.equal(result.entries[0].candidate_key, "candidate-one")
  assert.equal(
    result.entries.find((entry) => entry.classification === "prior_version_parse_is_ordered_subset")
      ?.raw_reconciliation_class,
    "prior_source_version_different_content",
  )
  assert.equal(
    result.entries.find((entry) => entry.classification === "prior_version_parse_metadata_gap")
      ?.adjudicated_comparison_rows,
    1,
  )
  assert.equal(result.candidate_published, false)
  assert.equal(JSON.stringify(result).includes(sourceUrl), false)

  receipt.incomplete_historical_parses[0].parse_id = "9".repeat(64)
  fs.writeFileSync(path.join(root, "adjudications/receipt.json"), JSON.stringify(receipt))
  const invalid = loadHistoricalSourceAdjudications(root, reconciliation)
  assert.equal(invalid.status, "partial_or_invalid")
  assert.equal(invalid.receipt_count, 4)
  assert.equal(invalid.invalid_receipt_count, 1)
  assert.equal(invalid.adjudicated_comparison_rows, 4)

  priorMetadataReceipt.approved_baseline.source_body_evidence = ['datePublished": "2026-09-29']
  fs.writeFileSync(
    path.join(root, "adjudications/prior-version-date-gap.json"),
    JSON.stringify(priorMetadataReceipt),
  )
  const wrongDateEvidence = loadHistoricalSourceAdjudications(root, reconciliation)
  assert.equal(wrongDateEvidence.status, "partial_or_invalid")
  assert.equal(wrongDateEvidence.invalid_receipt_count, 2)
  assert.equal(wrongDateEvidence.adjudicated_comparison_rows, 3)
})
