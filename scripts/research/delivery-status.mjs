import fs from "node:fs"
import path from "node:path"
import { registry } from "./discovery.mjs"
import { dailySources } from "./daily-scan.mjs"
import { auditRuns } from "../research-audit.mjs"
import { sha256 } from "./contracts.mjs"
import { canonicalURL, editions, extractArticles } from "../garden.mjs"
import { titleDayKey } from "../article-identity.mjs"
import { projectIntakeOntology, summarizeIntakeOntology } from "./intake-ontology.mjs"

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const safeCanonical = (url) => {
  try {
    return canonicalURL(url)
  } catch {
    return null
  }
}
const filesUnder = (root, suffix) => {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? filesUnder(file, suffix) : file.endsWith(suffix) ? [file] : []
  })
}
const counter = (values) =>
  Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((x) => x === value).length]),
  )

function loadDailyRuns(root) {
  return filesUnder(path.join(root, "daily/runs"), "/summary.json")
    .map((file) => {
      const summary = readJSON(file)
      const planFile = path.join(path.dirname(file), "plan.json")
      const plan = fs.existsSync(planFile) ? readJSON(planFile) : null
      const receiptDirectory = path.join(path.dirname(file), "receipts")
      const receipts = fs.existsSync(receiptDirectory)
        ? fs
            .readdirSync(receiptDirectory)
            .filter((name) => name.endsWith(".json"))
            .map((name) => readJSON(path.join(receiptDirectory, name)))
        : []
      return { file, summary, plan, receipts, mtime: fs.statSync(file).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

function loadTargetedScans(root) {
  return filesUnder(root, "/list-scan.json")
    .map((file) => ({
      file,
      summary: readJSON(file),
      mtime: fs.statSync(file).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
}

export function loadTargetedSearchRuns(root) {
  return filesUnder(root, "/targeted-queries.json")
    .flatMap((planFile) => {
      const plan = readJSON(planFile)
      const searchFile = path.join(path.dirname(planFile), "search.json")
      if (plan.schema !== "research-source-targeted-plan/v1" || !fs.existsSync(searchFile))
        return []
      const search = readJSON(searchFile)
      const queriesBySlot = new Map((plan.queries || []).map((query) => [query.slot_id, query]))
      const records = (search.records || []).map((record) => {
        const query = queriesBySlot.get(record.slot_id)
        return {
          run_id: plan.run_id || path.basename(path.dirname(planFile)),
          slot_id: record.slot_id || query?.slot_id || null,
          source_channel_id: record.source_channel_id || query?.source_channel_id || null,
          source_url: record.source_url || query?.source_url || null,
          status: record.status || "unknown",
          result_count: Number.isInteger(record.result_count) ? record.result_count : 0,
          candidate_count: Number.isInteger(record.candidate_count) ? record.candidate_count : 0,
          engine_failure_count: Array.isArray(record.failures) ? record.failures.length : 0,
          error: record.error || null,
        }
      })
      const candidates = Array.isArray(search.candidates) ? search.candidates : []
      const candidatesWithCanonicalUrl = candidates.filter((candidate) =>
        (candidate.source_urls || []).some((url) => safeCanonical(url)),
      )
      const uniqueCandidateUrls = new Set(
        candidatesWithCanonicalUrl.flatMap((candidate) =>
          (candidate.source_urls || []).map(safeCanonical).filter(Boolean),
        ),
      )
      const file = searchFile
      return [
        {
          file,
          plan,
          records,
          mtime: fs.statSync(file).mtimeMs,
          summary: {
            run_id: plan.run_id || path.basename(path.dirname(planFile)),
            daily_run: plan.daily_basis?.daily_run || null,
            planned_queries: (plan.queries || []).length,
            recorded_queries: records.length,
            query_statuses: counter(records.map((record) => record.status)),
            queries_with_candidates: records.filter((record) => record.candidate_count > 0).length,
            failed_queries: records.filter((record) => record.status === "failed").length,
            engine_failures: records.reduce(
              (total, record) => total + record.engine_failure_count,
              0,
            ),
            failed_queries_without_engine_details: records.filter(
              (record) =>
                record.status === "failed" &&
                record.engine_failure_count === 0 &&
                record.error?.includes("engines reported failures"),
            ).length,
            candidates: candidates.length,
            unique_candidate_urls: uniqueCandidateUrls.size,
            duplicate_candidate_rows: Math.max(
              0,
              candidatesWithCanonicalUrl.length - uniqueCandidateUrls.size,
            ),
            candidates_missing_canonical_url: candidates.length - candidatesWithCanonicalUrl.length,
            unresolved_slots: Array.isArray(plan.unresolved_slots) ? plan.unresolved_slots : [],
            candidate_published: plan.candidate_published === true,
          },
        },
      ]
    })
    .sort((a, b) => b.mtime - a.mtime)
}

function loadRunAudit(repo) {
  const directory = path.join(repo, ".local/research/runs")
  const records = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJSON(path.join(directory, file)))
    : []
  return auditRuns(records)
}

function loadPlanProgress(repo) {
  const file = path.join(repo, "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md")
  if (!fs.existsSync(file)) return { status: "missing", required: 0, completed: 0, rows: [] }
  const document = fs.readFileSync(file, "utf8")
  const sectionStart = document.indexOf("## 현재 진척과 다음 완료 증거")
  const sectionEnd = document.indexOf("## 5. P0", sectionStart)
  if (sectionStart < 0 || sectionEnd < 0)
    return { status: "unreadable", required: 0, completed: 0, rows: [] }
  const rows = document
    .slice(sectionStart, sectionEnd)
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\|\s*(P[0-6]-\d{2})\s*\|\s*([^|]+)\|\s*([^|]+)\|/)
      if (!match) return []
      const [, id, detail, next] = match
      const label = detail.match(/^\s*(완료|부분|미완료|미승격)\s*:/)?.[1]
      if (!label) return []
      const status = {
        완료: "complete",
        부분: "partial",
        미완료: "not_started",
        미승격: "not_promoted",
      }[label]
      return [
        {
          id,
          status,
          required: status !== "not_promoted",
          evidence: detail.replace(/^\s*(?:완료|부분|미완료|미승격)\s*:\s*/, "").trim(),
          next: next.trim(),
        },
      ]
    })
  const expectedIds = Array.from({ length: 7 }, (_, phase) =>
    Array.from(
      { length: [3, 5].includes(phase) ? 4 : 3 },
      (_, index) => `P${phase}-${String(index + 1).padStart(2, "0")}`,
    ),
  ).flat()
  const valid =
    rows.length === expectedIds.length &&
    expectedIds.every((id) => rows.filter((row) => row.id === id).length === 1)
  if (!valid) return { status: "invalid_plan_rows", required: 0, completed: 0, rows }
  const requiredRows = rows.filter((row) => row.required)
  return {
    status: "current_plan_wbs",
    plan_as_of: document.match(/기준일[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null,
    required: requiredRows.length,
    completed: requiredRows.filter((row) => row.status === "complete").length,
    partial: requiredRows.filter((row) => row.status === "partial").length,
    not_started: requiredRows.filter((row) => row.status === "not_started").length,
    excluded_from_assisted_completion: rows.filter((row) => !row.required).map((row) => row.id),
    rows,
  }
}

function approvalReconciliation(
  repo,
  publishedArticles,
  backlogFile = ".local/research/candidate-backlog.json",
) {
  const absoluteBacklog = path.resolve(repo, backlogFile)
  if (!fs.existsSync(absoluteBacklog))
    return { status: "missing", counts: {}, candidates: [], source_sha256: null }
  const bytes = fs.readFileSync(absoluteBacklog)
  const backlog = JSON.parse(bytes.toString("utf8"))
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    return { status: "invalid", counts: {}, candidates: [], source_sha256: sha256(bytes) }
  const candidates = backlog.candidates.map((candidate) => ({
    key: candidate.key,
    title: candidate.title,
    review_status: candidate.review_status || "unreviewed",
    has_approval_receipt: Boolean(
      candidate.approval?.approved_run && candidate.approval?.article_sha256,
    ),
    event_id: candidate.event_id || null,
    source_count: candidate.source_urls?.length || 0,
    disposition: candidate.disposition?.status || null,
    published_matches: {
      event_id: publishedArticles
        .filter((article) => candidate.event_id && article.event_id === candidate.event_id)
        .map((article) => article.edition),
      source_url: publishedArticles
        .filter((article) =>
          (candidate.source_urls || []).some((url) =>
            article.source_urls.some(
              (sourceURL) => safeCanonical(url) && safeCanonical(url) === safeCanonical(sourceURL),
            ),
          ),
        )
        .map((article) => article.edition),
      title_and_day: publishedArticles
        .filter(
          (article) =>
            titleDayKey(candidate.title, candidate.source_published_at) &&
            titleDayKey(article.title, article.published_at) ===
              titleDayKey(candidate.title, candidate.source_published_at),
        )
        .map((article) => article.edition),
    },
  }))
  const publishedRelation = (candidate) => {
    if (candidate.published_matches.event_id.length) return "event_id_match"
    if (candidate.published_matches.source_url.length) return "source_url_match_review_required"
    if (candidate.published_matches.title_and_day.length) return "title_day_match_review_required"
    return "no_published_match_found"
  }
  const relationCounts = counter(candidates.map(publishedRelation))
  const publishedEventCounts = new Map()
  for (const article of publishedArticles)
    if (article.event_id)
      publishedEventCounts.set(
        `${article.edition}:${article.event_id}`,
        (publishedEventCounts.get(`${article.edition}:${article.event_id}`) || 0) + 1,
      )
  return {
    status: "read_only_inventory",
    counts: {
      total: candidates.length,
      review_status: counter(candidates.map((candidate) => candidate.review_status)),
      approval_receipt_linked: candidates.filter((candidate) => candidate.has_approval_receipt)
        .length,
      event_id_linked: candidates.filter((candidate) => candidate.event_id).length,
      identity_or_disposition: candidates.filter((candidate) => candidate.disposition).length,
      published_relation: relationCounts,
      published_duplicate_events_within_editions: [...publishedEventCounts.values()].filter(
        (count) => count > 1,
      ).length,
    },
    candidates,
    source_sha256: sha256(bytes),
  }
}

export function buildIntakeOntologyAudit(
  repo,
  backlogFile = ".local/research/candidate-backlog.json",
) {
  const file = path.resolve(repo, backlogFile)
  if (!fs.existsSync(file))
    return { status: "missing", source_sha256: null, candidate_count: 0, ontology: null }
  const bytes = fs.readFileSync(file)
  const backlog = JSON.parse(bytes.toString("utf8"))
  if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
    return { status: "invalid", source_sha256: sha256(bytes), candidate_count: 0, ontology: null }
  return {
    status: "read_only_projection",
    source_sha256: sha256(bytes),
    candidate_count: backlog.candidates.length,
    ontology: summarizeIntakeOntology(projectIntakeOntology(backlog.candidates)),
  }
}

function currentCodeEvidence(runs, currentFingerprint) {
  const latestIntegrated = runs.find(
    ({ summary, plan }) =>
      plan &&
      summary.routes?.length > 1 &&
      summary.routes.every((route) => route.status === "window_scanned"),
  )
  if (!latestIntegrated)
    return { status: "no_completed_integrated_run", current_fingerprint: currentFingerprint }
  return {
    status:
      latestIntegrated.plan.config_sha256 === currentFingerprint
        ? "verified_for_current_fingerprint"
        : "historical_success_requires_current_revalidation",
    run_id: latestIntegrated.summary.run_id,
    route_count: latestIntegrated.summary.routes.length,
    window_count: latestIntegrated.plan.windows.length,
    run_fingerprint: latestIntegrated.plan.config_sha256,
    current_fingerprint: currentFingerprint,
    coverage: counter(latestIntegrated.summary.coverage_grid.map((cell) => cell.status)),
    candidate_published: latestIntegrated.summary.candidate_published === true,
    drive_verified: latestIntegrated.summary.drive_verified === true,
    public_verified: latestIntegrated.summary.public_verified === true,
  }
}

export function buildSourceInventory({ knownRoutes, activeRoutes }) {
  const dailyById = new Map(activeRoutes.map((route) => [route.channel_id, route]))
  return knownRoutes
    .map((source) => {
      const id = source.id || source.channel_id
      if (typeof id !== "string" || !id) throw Error("Registered source ID required")
      const daily = dailyById.get(id)
      return {
        id,
        name: source.name || source.label || id,
        kind: source.kind || "미분류",
        language: source.language || "미분류",
        region: source.region || "미분류",
        sectors: source.sectors || [],
        axis: source.axis || "미분류",
        method: source.method || "미분류",
        verification: source.verification || "unverified",
        url: source.url || null,
        daily_enabled: Boolean(daily?.enabled),
        baseline_run: daily?.baseline_run || null,
        development_status: daily?.baseline_run ? "baseline_configured" : "registered_only",
      }
    })
    .sort(
      (a, b) =>
        Number(b.daily_enabled) - Number(a.daily_enabled) ||
        a.name.localeCompare(b.name, "ko") ||
        a.id.localeCompare(b.id),
    )
}

export function buildDeliveryStatus({
  repo = process.cwd(),
  root = ".local/research/local-ai",
} = {}) {
  const absoluteRoot = path.resolve(repo, root)
  const channelConfig = readJSON(path.resolve(repo, "data/research-source-channels.json"))
  const watchlist = readJSON(path.resolve(repo, "data/research-watchlist.json"))
  const acquisition = readJSON(path.resolve(repo, "data/research-acquisition.json"))
  const configFile = path.relative(
    process.cwd(),
    path.resolve(repo, "data/research-daily-routes.json"),
  )
  const { activeRoutes, config_sha256 } = dailySources(configFile)
  const knownRoutes = registry(channelConfig, watchlist, acquisition)
  const sourceRows = buildSourceInventory({ knownRoutes, activeRoutes })
  const dailyRuns = loadDailyRuns(absoluteRoot)
  const targetedScans = loadTargetedScans(absoluteRoot)
  const targetedSearchRuns = loadTargetedSearchRuns(absoluteRoot)
  const latest = dailyRuns[0] || null
  const latestCompleted = dailyRuns.find(
    ({ summary }) =>
      summary.routes?.length > 1 &&
      summary.routes.every((route) => route.status === "window_scanned"),
  )
  const publishedArticles = editions(path.resolve(repo, "vault")).flatMap((edition) =>
    extractArticles(edition).map((article) => ({
      event_id: article.id,
      title: article.title,
      published_at: article.review?.published_at,
      source_urls: article.urls,
      edition: edition.slug,
    })),
  )
  const backlog = approvalReconciliation(repo, publishedArticles)
  const intakeOntology = buildIntakeOntologyAudit(repo)
  const runAudit = loadRunAudit(repo)
  const sourceKinds = knownRoutes.map((route) => route.kind || "미분류")
  const runById = new Map(dailyRuns.map((run) => [run.summary.run_id, run]))
  const sourceEvidence = sourceRows.map((source) => {
    const baseline = source.baseline_run ? runById.get(source.baseline_run) : null
    return {
      ...source,
      baseline_evidence: baseline
        ? {
            exists: true,
            summary_status: baseline.summary.status,
            route_status:
              baseline.summary.routes?.find((route) => route.channel_id === source.id)?.status ||
              null,
          }
        : { exists: false, summary_status: null, route_status: null },
      last_run:
        dailyRuns
          .flatMap((run) =>
            (run.summary.routes || []).map((route) => ({
              ...route,
              run_id: run.summary.run_id,
              mtime: run.mtime,
              reason:
                [...run.receipts]
                  .filter((receipt) => receipt.channel_id === route.channel_id)
                  .sort((a, b) => (b.finished_at || "").localeCompare(a.finished_at || ""))
                  .find((receipt) => receipt.status !== "window_scanned")?.reason || null,
            })),
          )
          .filter((route) => route.channel_id === source.id)
          .sort((a, b) => b.mtime - a.mtime)[0] || null,
      latest_targeted_scan:
        targetedScans
          .filter(({ summary }) => summary.channel_id === source.id)
          .map(({ summary, file, mtime }) => ({
            run_id: path.basename(path.dirname(file)),
            status: summary.status,
            reason: summary.reason || null,
            window: summary.window || null,
            mtime,
          }))[0] || null,
      latest_targeted_search:
        targetedSearchRuns
          .flatMap((run) => run.records.map((record) => ({ ...record, mtime: run.mtime })))
          .filter((record) => record.source_channel_id === source.id)
          .sort((a, b) => b.mtime - a.mtime)[0] || null,
    }
  })
  for (const source of sourceEvidence) {
    if (
      source.latest_targeted_scan?.status === "window_scanned" ||
      source.last_run?.status === "window_scanned"
    )
      source.development_status = "collection_receipt_exists"
    else if (source.baseline_evidence.exists) source.development_status = "baseline_receipt_exists"
  }
  const completedCoverage = latestCompleted?.summary.coverage_grid || []
  const coverageGrid = completedCoverage.map((cell) => ({
    sector: cell.sector,
    region: cell.region,
    axis: cell.axis,
    status: cell.status,
    route_count: cell.usable_route_count,
    routes: cell.route_ids,
    failed_routes: cell.failed_route_ids,
  }))
  const sourceIndex = new Map(sourceEvidence.map((source) => [source.id, source]))
  const enrichedCoverage = coverageGrid.map((cell) => ({
    ...cell,
    development_statuses: [
      ...new Set(
        cell.routes.map((id) => sourceIndex.get(id)?.development_status || "not_in_daily_scope"),
      ),
    ],
  }))
  const legacyAudit = loadRunAudit(repo)
  const planProgress = loadPlanProgress(repo)
  const latestOntology = filesUnder(absoluteRoot, "/graph.json")
    .filter((file) => file.includes(`${path.sep}ontology${path.sep}`))
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs, graph: readJSON(file) }))
    .sort((a, b) => b.mtime - a.mtime)[0]

  return {
    schema: "research-delivery-status/v1",
    generated_at: new Date().toISOString(),
    access: "local_private",
    scope: {
      fixed_workstreams: [
        "현황·계측",
        "승인·사건 연결",
        "일일 전 구간",
        "출처 확대",
        "품질·소급",
        "평가·운영",
      ],
      total_registered_routes: knownRoutes.length,
      enabled_daily_routes: activeRoutes.filter((route) => route.enabled).length,
      acquisition_profiles: Object.keys(acquisition).filter((key) => key !== "article_profiles")
        .length,
      article_profiles: Object.keys(acquisition.article_profiles || {}).length,
      source_kind_distribution: counter(sourceKinds),
      fixed_coverage_cells: 32,
    },
    overall_completion: {
      numerator: planProgress.completed,
      denominator: planProgress.required,
      percent:
        planProgress.required > 0
          ? Math.round((100 * planProgress.completed) / planProgress.required)
          : null,
      partial: planProgress.partial,
      not_started: planProgress.not_started,
      plan_as_of: planProgress.plan_as_of,
      status: planProgress.status,
      excluded_from_assisted_completion: planProgress.excluded_from_assisted_completion,
      workstreams: planProgress.rows,
    },
    current_integrated_evidence: currentCodeEvidence(dailyRuns, config_sha256),
    latest_daily_run: latest
      ? {
          run_id: latest.summary.run_id,
          status: latest.summary.status,
          routes: latest.summary.routes?.length || 0,
          route_statuses: counter((latest.summary.routes || []).map((route) => route.status)),
          windows: latest.plan?.windows?.length || null,
          coverage: counter((latest.summary.coverage_grid || []).map((cell) => cell.status)),
          candidate_published: latest.summary.candidate_published === true,
          drive_verified: latest.summary.drive_verified === true,
          public_verified: latest.summary.public_verified === true,
        }
      : null,
    latest_complete_coverage: latestCompleted
      ? { run_id: latestCompleted.summary.run_id, grid: enrichedCoverage }
      : null,
    sources: sourceEvidence,
    targeted_search: {
      status: targetedSearchRuns.length ? "stored_search_receipts" : "no_targeted_search_runs",
      run_count: targetedSearchRuns.length,
      latest: targetedSearchRuns[0]?.summary || null,
    },
    source_inventory_counts: {
      registered: sourceEvidence.length,
      daily_enabled: sourceEvidence.filter((source) => source.daily_enabled).length,
      outside_daily_scope: sourceEvidence.filter((source) => !source.daily_enabled).length,
      with_collection_evidence: sourceEvidence.filter((source) =>
        ["collection_receipt_exists", "baseline_receipt_exists"].includes(
          source.development_status,
        ),
      ).length,
      registered_only: sourceEvidence.filter(
        (source) => source.development_status === "registered_only",
      ).length,
      unclassified_kind: sourceEvidence.filter((source) => source.kind === "미분류").length,
    },
    approvals_reconciliation: backlog,
    intake_ontology_audit: intakeOntology,
    existing_briefing_audit: {
      completed_runs: legacyAudit.completed_runs,
      target_runs: 7,
      ready: legacyAudit.first_seven_ready,
      rejected: legacyAudit.rejected,
      runs: legacyAudit.runs,
    },
    local_ai_shadow_operations: {
      completed_runs: filesUnder(path.join(absoluteRoot, "evaluation/shadow"), ".json").length,
      target_runs: 7,
      latest_ontology_snapshot: latestOntology
        ? {
            path: path.relative(repo, latestOntology.file),
            schema: latestOntology.graph.schema,
            events: latestOntology.graph.nodes?.filter((node) => node.type === "Event").length || 0,
            claims: latestOntology.graph.nodes?.filter((node) => node.type === "Claim").length || 0,
            source_versions:
              latestOntology.graph.nodes?.filter((node) => node.type === "SourceVersion").length ||
              0,
          }
        : null,
    },
  }
}

const htmlEscape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  )

export function renderDeliveryStatusHTML(status) {
  const rows = status.sources
    .map((source) => {
      const sourceLink = source.url
        ? `<a href='${htmlEscape(source.url)}'>${htmlEscape(source.name)}</a>`
        : htmlEscape(source.name)
      return `<tr><td>${sourceLink}<small>${htmlEscape(source.id)}</small></td><td>${htmlEscape(source.verification)} · ${htmlEscape(source.method)}</td><td>${htmlEscape(source.sectors.join(", ") || "미분류")}</td><td>${htmlEscape(source.region)} · ${htmlEscape(source.axis)}</td><td>${htmlEscape(source.kind)} · ${htmlEscape(source.language)}</td><td>${source.daily_enabled ? "활성" : "비활성"}<small>${htmlEscape(source.baseline_run || "기준선 없음")}</small></td><td>${htmlEscape(source.development_status)}</td><td>${htmlEscape(source.last_run?.status || "미실행")}${source.last_run?.reason ? `<small>${htmlEscape(source.last_run.reason)}</small>` : ""}</td><td>${htmlEscape(source.latest_targeted_search?.status || "—")}<small>${htmlEscape(source.latest_targeted_search?.run_id || "")}${source.latest_targeted_search ? ` · 결과 ${source.latest_targeted_search.result_count} · 후보 ${source.latest_targeted_search.candidate_count}` : ""}</small></td><td>${htmlEscape(source.latest_targeted_scan?.status || "—")}<small>${htmlEscape(source.latest_targeted_scan?.run_id || "")}${source.latest_targeted_scan?.reason ? " · " + htmlEscape(source.latest_targeted_scan.reason) : ""}</small></td></tr>`
    })
    .join("")
  const cards = [
    [
      "전체 완료 기준",
      `${status.overall_completion.percent ?? "—"}% · ${status.overall_completion.numerator}/${status.overall_completion.denominator}`,
    ],
    ["등록 경로", status.scope.total_registered_routes],
    ["일일 활성 경로", status.scope.enabled_daily_routes],
    ["후보 원장", status.approvals_reconciliation.counts.total || 0],
    ["승인 연결", status.approvals_reconciliation.counts.approval_receipt_linked || 0],
    ["기존 발행 감사", `${status.existing_briefing_audit.completed_runs}/7`],
    ["로컬 비교 운영", `${status.local_ai_shadow_operations.completed_runs}/7`],
  ]
    .map(
      ([label, value]) =>
        `<article><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></article>`,
    )
    .join("")
  const grid = (status.latest_complete_coverage?.grid || [])
    .map(
      (cell) =>
        `<tr><td>${htmlEscape(cell.sector)}</td><td>${htmlEscape(cell.region)}</td><td>${htmlEscape(cell.axis)}</td><td>${htmlEscape(cell.status)}</td><td>${htmlEscape(cell.routes.join(", ") || "—")}</td></tr>`,
    )
    .join("")
  const planRows = status.overall_completion.workstreams
    .filter((row) => row.required)
    .map(
      (row) =>
        `<tr><td>${htmlEscape(row.id)}</td><td>${htmlEscape(row.status)}</td><td>${htmlEscape(row.evidence)}</td><td>${htmlEscape(row.next)}</td></tr>`,
    )
    .join("")
  const latest = status.latest_daily_run
  const integrated = status.current_integrated_evidence
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수집·온톨로지 개발 현황</title><style>
    :root{color-scheme:dark;--bg:#10151b;--panel:#171f28;--line:#2b3743;--muted:#9eacb9;--text:#e8edf2;--accent:#79c8b0}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1280px;margin:auto;padding:32px 22px 70px}h1{font-size:28px;margin:4px 0}h2{font-size:19px;margin:30px 0 12px}p,.muted,small{color:var(--muted)}.top{display:flex;justify-content:space-between;gap:20px;align-items:start}.stamp{font-size:12px;color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:10px;margin:24px 0}.cards article,.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px}.cards span{display:block;color:var(--muted);font-size:12px}.cards strong{display:block;font-size:25px;margin-top:7px}.tabs{display:flex;gap:8px;border-bottom:1px solid var(--line)}button{border:1px solid var(--line);border-radius:8px 8px 0 0;background:var(--panel);color:var(--text);padding:10px 14px;cursor:pointer}button[aria-selected=true]{border-color:var(--accent);color:var(--accent)}section[hidden]{display:none}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:10px 12px}th{color:var(--muted);font-weight:500;position:sticky;top:0;background:var(--panel)}td small{display:block;font-size:11px}.status{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 8px;margin:3px;color:var(--accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)}@media(max-width:850px){.cards{grid-template-columns:repeat(3,1fr)}.status{grid-template-columns:1fr}}@media(max-width:480px){main{padding:22px 14px}.cards{grid-template-columns:repeat(2,1fr)}h1{font-size:23px}.tabs{overflow:auto}button{white-space:nowrap}}
    </style><main><div class="top"><div><h1>수집·온톨로지 개발 현황</h1><div class="muted">비공개 로컬 운영 현황 · 독자용 뉴스 화면과 분리</div></div><div class="stamp">계획 기준 ${htmlEscape(status.overall_completion.plan_as_of || "확인 불가")} · 생성 ${htmlEscape(status.generated_at)}</div></div><div class="cards">${cards}</div><nav class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="overview" id="tab-overview">전체</button><button role="tab" aria-selected="false" aria-controls="source" id="tab-source">출처 개발</button><button role="tab" aria-selected="false" aria-controls="coverage" id="tab-coverage">조사 범위</button><button role="tab" aria-selected="false" aria-controls="pipeline" id="tab-pipeline">승인·발행</button></nav>
    <section role="tabpanel" id="overview" aria-labelledby="tab-overview"><h2>필수 작업 ${status.overall_completion.numerator}/${status.overall_completion.denominator} 완료 (${status.overall_completion.percent ?? "—"}%)</h2><p>부분 진행 ${status.overall_completion.partial ?? "—"}개 · 미착수 ${status.overall_completion.not_started ?? "—"}개. WBS는 전체 완료로 닫힐 때만 분자에 반영합니다.</p><div class="status"><article class="panel"><strong>현재 버전 통합 수집</strong><p>${htmlEscape(integrated.status)}</p><small>${htmlEscape(integrated.run_id || "완료 영수증 없음")} · ${integrated.route_count || 0}개 경로 / ${integrated.window_count || 0}개 기간 창</small></article><article class="panel"><strong>최근 일일 수집</strong><p>${htmlEscape(latest?.status || "기록 없음")}</p><small>${htmlEscape(latest?.run_id || "")} · ${latest?.routes || 0}개 경로 / ${latest?.windows || 0}개 창</small></article><article class="panel"><strong>조사 대상 32칸</strong><p>${htmlEscape(
      Object.entries(latest?.coverage || {})
        .map(([key, value]) => `${key} ${value}`)
        .join(" · ") || "기록 없음",
    )}</p></article></div><h2>계획 작업 상태</h2><div class="tablewrap"><table><thead><tr><th>작업 ID</th><th>상태</th><th>현재 증거</th><th>다음 완료 항목</th></tr></thead><tbody>${planRows}</tbody></table></div></section>
    <section role="tabpanel" id="source" aria-labelledby="tab-source" hidden><h2>출처 등록부 (${status.source_inventory_counts.registered})</h2><p>일일 활성 ${status.source_inventory_counts.daily_enabled}개 · 일일 범위 밖 ${status.source_inventory_counts.outside_daily_scope}개 · 수집 영수증/기준선 보유 ${status.source_inventory_counts.with_collection_evidence}개 · 등록만 된 출처 ${status.source_inventory_counts.registered_only}개 · 유형 미분류 ${status.source_inventory_counts.unclassified_kind}개. 기본 출처 등록과 날짜 경계를 확인한 수집 영수증을 구분합니다.</p><div class="tablewrap"><table><thead><tr><th>출처</th><th>등록 검증·방식</th><th>분야</th><th>지역·축</th><th>유형·언어</th><th>일일 활성·기준선</th><th>개발 상태</th><th>최근 일일 결과</th><th>최근 보완 검색</th><th>최근 개별 검증</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section role="tabpanel" id="coverage" aria-labelledby="tab-coverage" hidden><h2>최근 완료 수집의 조사 범위</h2><p>${htmlEscape(status.latest_complete_coverage?.run_id || "완료된 통합 범위 기록 없음")}</p><div class="tablewrap"><table><thead><tr><th>분야</th><th>지역</th><th>축</th><th>상태</th><th>경로</th></tr></thead><tbody>${grid}</tbody></table></div><h2>보완 검색 영수증</h2><p>일일 수집 범위와 분리한 등록 출처 질의 결과입니다. 검색 결과는 원문 수집·기사 검증·후보 승인으로 계산하지 않습니다.</p><pre>${htmlEscape(JSON.stringify(status.targeted_search, null, 2))}</pre></section>
    <section role="tabpanel" id="pipeline" aria-labelledby="tab-pipeline" hidden><h2>후보 승인 대조</h2><p>아래 집계는 원장 읽기 결과입니다. 자동 승인이나 백로그 변경을 하지 않았습니다.</p><pre>${htmlEscape(JSON.stringify(status.approvals_reconciliation.counts, null, 2))}</pre><p>원장 SHA-256: ${htmlEscape(status.approvals_reconciliation.source_sha256)}</p><h2>후보 원문 온톨로지</h2><p>원문 URL·본문 지문·제목과 날짜의 관계를 읽기 전용으로 계산합니다. 관계는 검토 신호이며 사건 병합이나 발행 판정이 아닙니다.</p><pre>${htmlEscape(JSON.stringify(status.intake_ontology_audit, null, 2))}</pre><h2>발행·운영 증거</h2><pre>${htmlEscape(JSON.stringify({ existing_briefing_audit: status.existing_briefing_audit, local_ai_shadow_operations: status.local_ai_shadow_operations, latest_daily_run: status.latest_daily_run }, null, 2))}</pre></section>
    </main><script>const tabs=[...document.querySelectorAll('[role=tab]')];for(const [i,tab] of tabs.entries()){tab.addEventListener('click',()=>{tabs.forEach((t,j)=>{const active=i===j;t.setAttribute('aria-selected',String(active));document.getElementById(t.getAttribute('aria-controls')).hidden=!active});history.replaceState(null,'','#'+tab.id)});tab.addEventListener('keydown',e=>{let j=i;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i+tabs.length-1)%tabs.length;else return;e.preventDefault();tabs[j].focus();tabs[j].click()})}</script></html>`
}
