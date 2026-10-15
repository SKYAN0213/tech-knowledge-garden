import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { researchSlots, validateSearchQueries } from "./search.mjs"
import { registry, mergeBacklog, mergeUniqueDiscovery } from "./discovery.mjs"
import { loadDailySearchBasis, loadStoredReportSearchBasis } from "./daily-search-basis.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { loadInquirySearchPlan } from "./inquiry-tracking.mjs"

const sectorTerms = {
  ko: ["인공지능", "클라우드", "보안", "반도체", "로봇", "에너지", "바이오", "우주"],
  en: ["AI", "cloud", "security", "semiconductor", "robotics", "energy", "biotech", "space"],
  ja: [
    "人工知能",
    "クラウド",
    "セキュリティ",
    "半導体",
    "ロボット",
    "エネルギー",
    "バイオ",
    "宇宙",
  ],
  zh: ["人工智能", "云计算", "网络安全", "半导体", "机器人", "能源", "生物技术", "航天"],
  de: [
    "KI",
    "Cloud",
    "Sicherheit",
    "Halbleiter",
    "Robotik",
    "Energie",
    "Biotechnologie",
    "Raumfahrt",
  ],
}
const axisTerms = {
  ko: ["기술 연구", "실적 투자"],
  en: ["technology research", "earnings investment"],
  ja: ["技術ニュース", "決算ニュース"],
  zh: ["技术研究", "财报投资"],
  de: ["Technologie Forschung", "Investitionen Unternehmen"],
}

function sourceType(route) {
  if (
    route.kind === "company" ||
    route.watch_groups?.includes("companies") ||
    route.watch_groups?.includes("robot_manufacturers")
  )
    return "company"
  if (route.kind === "filing-ir" || route.kind === "regulator") return "regulator"
  if (
    route.watch_groups?.includes("institutions") ||
    ["research", "commercialization"].includes(route.kind)
  )
    return "institution"
  if (/press|media|journal/.test(route.kind || "")) return "press"
  return "other"
}

function publisherSearchHost(route) {
  const publisher = typeof route.publisher_id === "string" ? route.publisher_id.toLowerCase() : ""
  const domain = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
  if (
    domain.test(publisher) &&
    route.allowed_hosts?.some((host) => host.toLowerCase() === publisher)
  )
    return publisher
  return new URL(route.url).hostname
}

export function targetedSourceQueries(coverage, routes, day, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || new Date(day).toISOString().slice(0, 10) !== day)
    throw Error("Valid targeted search day required")
  const slots = researchSlots()
  const { languages, slotIds, maxQueries } = options
  if (
    languages !== undefined &&
    (!Array.isArray(languages) ||
      !languages.length ||
      new Set(languages).size !== languages.length ||
      languages.some((language) => !Object.hasOwn(sectorTerms, language)))
  )
    throw Error("Unique supported targeted search languages required")
  if (
    slotIds !== undefined &&
    (!Array.isArray(slotIds) ||
      !slotIds.length ||
      new Set(slotIds).size !== slotIds.length ||
      slotIds.some((id) => !slots.some((slot) => slot.slot_id === id)))
  )
    throw Error("Unique registered research slots required")
  if (
    maxQueries !== undefined &&
    (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 64)
  )
    throw Error("Targeted search query limit must be 1..64")
  if (
    !Array.isArray(coverage) ||
    coverage.length !== slots.length ||
    slots.some(
      (slot) =>
        coverage.filter((cell) =>
          ["sector", "region", "axis"].every((key) => cell[key] === slot[key]),
        ).length !== 1,
    )
  )
    throw Error("Complete daily coverage grid required for targeted search")
  const queries = [],
    unresolved = []
  const orderedSlots = slots
    .map((slot, sectorIndex) => ({ slot, sectorIndex }))
    .sort((a, b) => {
      const priority = (slot) =>
        coverage.find((cell) =>
          ["sector", "region", "axis"].every((key) => cell[key] === slot[key]),
        )?.status === "not_attempted"
          ? 0
          : 1
      return priority(a.slot) - priority(b.slot) || a.sectorIndex - b.sectorIndex
    })
  for (const { sectorIndex, slot } of orderedSlots) {
    if (slotIds && !slotIds.includes(slot.slot_id)) continue
    const cell = coverage.find((item) =>
      ["sector", "region", "axis"].every((key) => item[key] === slot[key]),
    )
    const recoveryRoutes = new Set([
      ...(cell.failed_route_ids || []),
      ...(cell.pending_route_ids || []),
    ])
    if (cell.status === "partial" && !recoveryRoutes.size) continue
    if (!["not_attempted", "failed", "incomplete", "partial"].includes(cell.status))
      throw Error("Invalid targeted search coverage status")
    const preferences =
      slot.axis === "기술·제품"
        ? ["institution", "press", "company", "regulator", "other"]
        : ["company", "regulator", "press", "institution", "other"]
    const candidates = routes
      .filter(
        (route) =>
          [...(route.sectors || []), ...(route.coverage_sectors || [])].includes(slot.sector) &&
          route.region === slot.region &&
          route.axis === slot.axis &&
          route.collection_mode !== "excluded" &&
          (cell.status !== "partial" || recoveryRoutes.has(route.channel_id)) &&
          (!languages || languages.includes(route.language)) &&
          sectorTerms[route.language],
      )
      .map((route) => ({ route, type: sourceType(route), host: publisherSearchHost(route) }))
      .sort(
        (a, b) =>
          preferences.indexOf(a.type) - preferences.indexOf(b.type) ||
          sha256(`${day}:${slot.slot_id}:${a.route.channel_id}`).localeCompare(
            sha256(`${day}:${slot.slot_id}:${b.route.channel_id}`),
          ),
      )
    const first = candidates[0]
    const relevantTypes =
      slot.axis === "기술·제품"
        ? ["institution", "press", "company", "regulator"]
        : ["company", "regulator", "press"]
    const otherHost = (candidate) => candidate.host !== first?.host
    const second =
      candidates.find(
        (candidate) =>
          otherHost(candidate) &&
          candidate.type !== first?.type &&
          relevantTypes.includes(candidate.type),
      ) ||
      candidates.find((candidate) => otherHost(candidate) && candidate.type === first?.type) ||
      candidates.find(otherHost)
    const chosen =
      cell.status === "partial"
        ? candidates.filter(
            (candidate, index) =>
              candidates.findIndex(
                (other) =>
                  other.host === candidate.host &&
                  other.route.language === candidate.route.language,
              ) === index,
          )
        : languages
          ? languages
              .map((language) =>
                candidates.find((candidate) => candidate.route.language === language),
              )
              .filter(Boolean)
          : [first, second].filter(Boolean)
    if (!chosen.length) unresolved.push(slot.slot_id)
    for (const [n, { route, type, host }] of chosen.entries()) {
      const language = route.language
      const axis = slot.axis === "기술·제품" ? 0 : 1
      const sector = Math.floor(sectorIndex / 4)
      queries.push({
        ...slot,
        slot_id: `target-${slot.slot_id}-${n}`,
        scope: "registered-source",
        source_channel_id: route.channel_id,
        source_type: type,
        source_url: host === new URL(route.url).hostname ? route.url : `https://${host}/`,
        ...(host !== new URL(route.url).hostname ? { source_listing_url: route.url } : {}),
        coverage_status: cell.status,
        ...(cell.status === "partial"
          ? {
              recovery_route_ids: candidates
                .filter(
                  (candidate) => candidate.host === host && candidate.route.language === language,
                )
                .map((candidate) => candidate.route.channel_id),
            }
          : {}),
        language,
        query: `site:${host} ${sectorTerms[language][sector]} ${axisTerms[language][axis]} ${day.slice(0, 4)}`,
      })
    }
  }
  const selected = maxQueries === undefined ? queries : queries.slice(0, maxQueries)
  if (selected.length) validateSearchQueries(selected)
  return {
    queries: selected,
    unresolved,
    ...(maxQueries !== undefined ? { deferred: queries.slice(maxQueries) } : {}),
  }
}

function reference(root, relative) {
  return { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) }
}

function saveImmutable(root, relative, value) {
  const existing = readJSON(root, relative)
  if (existing && JSON.stringify(existing) !== JSON.stringify(value))
    throw Error("Targeted search inputs changed; use a new run ID")
  if (!existing) atomicCreate(root, relative, value)
  return reference(root, relative)
}

// The aggregate and every successful query must agree with native checkpoints.
// A failed query remains a failed observation, including when the other queries
// found candidates. Reusing this receipt never requests that query again.
function storedSearchOutcome(root, runId, queries, nativeInputHash) {
  const searchPath = `runs/${runId}/search.json`
  const statePath = `runs/${runId}/search/state.json`
  const search = readJSON(root, searchPath),
    state = readJSON(root, statePath)
  if (
    !search ||
    !Array.isArray(search.records) ||
    !Array.isArray(search.candidates) ||
    search.records.length !== queries.length ||
    state?.run_id !== runId ||
    state.input_hash !== nativeInputHash
  )
    throw Error("Complete native targeted search output required")
  const expectedCandidates = new Map(),
    urls = new Map(),
    checkpoints = []
  for (const [index, query] of queries.entries()) {
    const record = search.records[index],
      stage = state.stages?.[`query-${query.slot_id}`]
    if (
      record.slot_id !== query.slot_id ||
      record.query !== query.query ||
      stage?.input_hash !== sha256(JSON.stringify(query))
    )
      throw Error("Targeted search query checkpoint changed")
    if (stage.status === "failed") {
      if (record.status !== "failed" || record.error !== stage.error)
        throw Error("Failed search observation differs from native checkpoint")
      continue
    }
    if (
      stage.status !== "complete" ||
      stage.result_path !== `runs/${runId}/search/query-${query.slot_id}.json`
    )
      throw Error("Native query checkpoint is incomplete")
    const saved = readJSON(root, stage.result_path)
    if (
      !saved ||
      sha256(JSON.stringify(saved)) !== stage.result_hash ||
      JSON.stringify(saved.record) !== JSON.stringify(record)
    )
      throw Error("Native query checkpoint hash mismatch")
    checkpoints.push(reference(root, stage.result_path))
    for (const candidate of saved.candidates) {
      const key = candidate.key,
        canonical = candidate.source_urls.map(canonicalURL).join("\n")
      if (
        (urls.has(canonical) && urls.get(canonical) !== key) ||
        (expectedCandidates.has(key) &&
          expectedCandidates.get(key).source_urls.map(canonicalURL).join("\n") !== canonical)
      )
        throw Error("Native search candidate identity conflict")
      urls.set(canonical, key)
      const prior = expectedCandidates.get(key)
      if (prior)
        prior.discovery = mergeUniqueDiscovery(prior.discovery || [], candidate.discovery || [])
      else expectedCandidates.set(key, structuredClone(candidate))
    }
  }
  if (JSON.stringify(search.candidates) !== JSON.stringify([...expectedCandidates.values()]))
    throw Error("Search candidates differ from native query checkpoints")
  return {
    search,
    searchRef: reference(root, searchPath),
    stateRef: reference(root, statePath),
    checkpoints,
  }
}

export async function executeTargetedSourceSearch({
  repo,
  root,
  runId,
  mode,
  day,
  dailyRun,
  reportPath,
  reportSha256,
  inquiryPlanPath,
  inquiryPlanSha256,
  vault,
  backlogFile,
  languages,
  slotIds,
  maxQueries = 8,
  runSearch,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(runId || "") ||
    !["plan-only", "execute", "resume"].includes(mode) ||
    Boolean(reportPath) !== Boolean(reportSha256) ||
    Boolean(inquiryPlanPath) !== Boolean(inquiryPlanSha256) ||
    [
      !!dailyRun,
      !!day,
      reportPath !== undefined || reportSha256 !== undefined,
      !!inquiryPlanPath,
    ].filter(Boolean).length !== 1 ||
    !Number.isInteger(maxQueries) ||
    maxQueries < 1 ||
    maxQueries > 8
  )
    throw Error(
      "Targeted search requires a run, mode, one daily/day/report basis or one inquiry basis, and a 1..8 query limit",
    )
  return withLock(root, `targeted-${runId}`, async () => {
    const configs = ["source-channels", "watchlist", "acquisition", "source-recipes"]
    const loaded = configs.map((name) =>
      JSON.parse(fs.readFileSync(safePath(repo, `data/research-${name}.json`))),
    )
    const routes = registry(...loaded)
    const inquiryRef = inquiryPlanPath ? { path: inquiryPlanPath, sha256: inquiryPlanSha256 } : null
    const inquiry = inquiryRef ? loadInquirySearchPlan({ repo, root, vault }, inquiryRef) : null
    const basis = reportPath
      ? loadStoredReportSearchBasis(root, { path: reportPath, sha256: reportSha256 })
      : dailyRun
        ? loadDailySearchBasis(root, dailyRun, { vault })
        : null
    const coverage = inquiry
      ? []
      : basis?.coverage || researchSlots().map((slot) => ({ ...slot, status: "not_attempted" }))
    if (inquiry && (languages || slotIds))
      throw Error("Inquiry plan already fixes its languages and target IDs")
    const selected = inquiry
      ? {
          queries: inquiry.queries.slice(0, maxQueries),
          deferred: [...inquiry.queries.slice(maxQueries), ...inquiry.deferred_queries],
          unresolved: [],
        }
      : targetedSourceQueries(coverage, routes, basis?.reference.kst_day || day, {
          languages,
          slotIds,
          maxQueries,
        })
    const planPath = `runs/${runId}/targeted-queries.json`,
      resultPath = `runs/${runId}/targeted-result.json`
    const savedPlan = readJSON(root, planPath)
    const plan = {
      schema: "research-source-targeted-plan/v1",
      run_id: runId,
      basis_kind: inquiry
        ? "reviewed-inquiry"
        : basis
          ? basis.reference.basis_kind || "native-daily-receipts"
          : "registry-only",
      ...(inquiry
        ? {
            inquiry_plan: inquiryRef,
            observation_day: inquiry.observation_day,
            held_inquiries: inquiry.held,
          }
        : basis
          ? { daily_basis: basis.reference }
          : { observation_day: day }),
      config_refs: configs.map((name) => reference(repo, `data/research-${name}.json`)),
      // Preserve an existing receipt's implementation stamp when its frozen
      // semantic inputs still match; adding a question path never re-searches it.
      implementation_sha256:
        savedPlan?.implementation_sha256 || sha256(fs.readFileSync(new URL(import.meta.url))),
      search_sha256: reference(repo, "scripts/research/search.mjs").sha256,
      service: process.env.SEARXNG_URL || "managed-local",
      coverage,
      selection: {
        languages: languages || null,
        slot_ids: slotIds || null,
        max_queries: maxQueries,
      },
      queries: selected.queries,
      deferred_queries: selected.deferred,
      unresolved_slots: selected.unresolved,
      source_body_confirmed: false,
      candidate_published: false,
    }
    if (mode === "resume" && !readJSON(root, planPath))
      throw Error("Resume requires a saved targeted search plan")
    const planRef = saveImmutable(root, planPath, plan)
    const nativeInputHash = sha256(
      JSON.stringify({
        queries_sha256: sha256(JSON.stringify(plan.queries)),
        daily_basis_sha256: plan.daily_basis ? sha256(JSON.stringify(plan.daily_basis)) : null,
        module_sha256: plan.search_sha256,
        service: plan.service,
      }),
    )
    if (mode === "plan-only")
      return {
        run_id: runId,
        status: "planned",
        plan: planRef,
        queries: plan.queries.length,
        deferred_queries: plan.deferred_queries.length,
        unresolved_slots: plan.unresolved_slots,
        ...(inquiryRef
          ? { inquiry_plan: inquiryRef, held_inquiries: inquiry.held, progress_confirmed: false }
          : {}),
        coverage_complete: false,
        candidate_published: false,
      }
    if (!plan.queries.length)
      return {
        run_id: runId,
        status: "no_registered_route",
        plan: planRef,
        unresolved_slots: plan.unresolved_slots,
        coverage_complete: false,
        candidate_published: false,
        ...(inquiryRef
          ? { inquiry_plan: inquiryRef, held_inquiries: inquiry.held, progress_confirmed: false }
          : {}),
      }
    const previous = readJSON(root, resultPath)
    if (previous) {
      const stored = storedSearchOutcome(root, runId, plan.queries, nativeInputHash)
      if (
        JSON.stringify(previous.plan) !== JSON.stringify(planRef) ||
        JSON.stringify(previous.search) !== JSON.stringify(stored.searchRef) ||
        JSON.stringify(previous.state) !== JSON.stringify(stored.stateRef)
      )
        throw Error("Targeted search receipt input changed")
      if (backlogFile)
        await mergeBacklog(backlogFile, inquirySearchCandidates(stored.search, plan, planRef))
      return { ...previous, result: reference(root, resultPath), reused: true }
    }
    if (!readJSON(root, `runs/${runId}/search.json`)) {
      const state = readJSON(root, `runs/${runId}/search/state.json`)
      if (
        state &&
        (!Object.keys(state.stages || {}).length ||
          Object.values(state.stages || {}).some((stage) => stage.status !== "complete"))
      )
        return {
          run_id: runId,
          status: "interrupted",
          plan: planRef,
          state: reference(root, `runs/${runId}/search/state.json`),
          resume_condition:
            "Retain failed/running query observations; provide a new allowed search input and run ID. Do not automatically retry the failed query.",
          coverage_complete: false,
          candidate_published: false,
        }
      if (typeof runSearch !== "function") throw Error("Native search executor required")
      await runSearch({ run_id: runId, query_path: safePath(root, planPath) })
    }
    const stored = storedSearchOutcome(root, runId, plan.queries, nativeInputHash)
    const observations = plan.queries.map((query, index) => {
      const record = stored.search.records[index],
        failed = record.status === "failed"
      const stage = readJSON(root, `runs/${runId}/search/state.json`).stages[
        `query-${query.slot_id}`
      ]
      return {
        ...query,
        checked_at: record.checked_at || null,
        attempted_at: stage.started_at || null,
        status: failed
          ? "provider_failed"
          : record.failures?.length
            ? "provider_partial"
            : record.candidate_count
              ? "discovered"
              : record.result_count
                ? "no_registered_candidate"
                : "provider_empty",
        failures: record.failures || [],
        primary_engines: record.primary_engines || [],
        provider_requests: record.provider_requests || [],
        error: record.error || null,
        engine_count: record.engine_count ?? null,
        result_count: record.result_count ?? null,
        candidate_count: record.candidate_count,
        source_body_confirmed: false,
        publication_approved: false,
      }
    })
    const receipt = {
      schema: "research-targeted-search-result/v1",
      run_id: runId,
      plan: planRef,
      search: stored.searchRef,
      state: stored.stateRef,
      checkpoints: stored.checkpoints,
      status: observations.some((row) =>
        ["provider_failed", "provider_partial"].includes(row.status),
      )
        ? "partial"
        : "observed",
      observations,
      candidate_count: stored.search.candidates.length,
      deferred_query_count: plan.deferred_queries.length,
      unresolved_slots: plan.unresolved_slots,
      coverage_complete: false,
      source_body_confirmed: false,
      candidate_published: false,
      ...(inquiryRef
        ? { inquiry_plan: inquiryRef, held_inquiries: inquiry.held, progress_confirmed: false }
        : {}),
    }
    if (backlogFile)
      await mergeBacklog(backlogFile, inquirySearchCandidates(stored.search, plan, planRef))
    const resultRef = saveImmutable(root, resultPath, receipt)
    return { ...receipt, result: resultRef, reused: false }
  })
}

function inquirySearchCandidates(search, plan, planRef) {
  if (!plan.inquiry_plan) return search.candidates
  return search.candidates.map((candidate) => {
    const matches = (candidate.discovery || []).flatMap((entry) => {
      const query = plan.queries.find(
        (row) =>
          row.slot_id === entry.query_slot_id ||
          row.slot_id === entry.slot_id ||
          row.query === entry.query,
      )
      return (query?.inquiry_intents || []).map((intent) => ({
        channel_id: "reviewed-inquiry-search",
        method: "search",
        source_url: candidate.source_urls[0],
        query_slot_id: query.slot_id,
        discovered_at: entry.discovered_at || entry.checked_at || candidate.discovered_at,
        inquiry_plan: plan.inquiry_plan,
        targeted_plan: planRef,
        question_id: intent.question_id,
        question_review: intent.review,
        source_role: intent.role,
        role_is_search_intent: true,
        progress_confirmed: false,
      }))
    })
    return { ...candidate, discovery: mergeUniqueDiscovery(candidate.discovery || [], matches) }
  })
}
