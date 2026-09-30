import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { SourceFetcher } from "./research/fetch.mjs"
import {
  parseDocument,
  assertStoredEvidence,
  loadStoredSourceRun,
  bundleStoredSourceRuns,
  selectStoredSources,
} from "./research/parser.mjs"
import { Ollama } from "./research/ollama.mjs"
import { extractClaims, recordFactReview, extractionBudget } from "./research/claims.mjs"
import { writeDraft, draftMarkdown, correctDraft, draftFingerprint } from "./research/editor.mjs"
import { registry, discoverChannel, mergeBacklog, coverageGrid } from "./research/discovery.mjs"
import { saveBaseline } from "./research/baseline.mjs"
import {
  DEFAULT_ROOT,
  atomicWrite,
  readJSON,
  RunState,
  withLock,
  safePath,
} from "./research/run-state.mjs"
import { canonicalURL, editions, extractArticles } from "./garden.mjs"
import { briefingLibrary } from "./briefings.mjs"
import { BACKLOG_PATH, readBacklog, researchWindow } from "./research-window.mjs"
import { sourceId } from "./research/contracts.mjs"
import { sha256 } from "./research/contracts.mjs"
import {
  planSearchQueries,
  loadSearchPlan,
  validateSearchQueries,
  SearxSearch,
  discoverSearch,
  buildSearchContext,
  validateCompleteSearchPlan,
} from "./research/search.mjs"
import { approvedArticle } from "./research/publish-adapter.mjs"
import {
  archiveManifest,
  buildSourceRegister,
  inspectManualCapture,
  storeManualCapture,
} from "./research/archive.mjs"
import { withLocalSearch } from "./research/search-runtime.mjs"
import { fetchWithPolicy } from "./research/source-policy.mjs"
import { saveEvaluationCase } from "./research/evaluation.mjs"
import { recordDeepDiveReview } from "./research/deep-dive.mjs"
import { assertReviewDate } from "./research/dates.mjs"
import { privatePreview } from "./research/preview.mjs"
import { approveNoteReview } from "./research/note-review.mjs"
import { saveRetrospectiveInventory } from "./research/retrospective.mjs"
import { writeKnowledgeDraft } from "./research/knowledge-editor.mjs"
import { prepareRoleOllama } from "./research/model-policy.mjs"
import { scanSinglePageRoute } from "./research/list-scan.mjs"
import { scanCalendarMonthRoute } from "./research/monthly-scan.mjs"
import { scanBoundedRSSRoute } from "./research/rss-scan.mjs"
import { scanPaginatedHDRoute } from "./research/api-scan.mjs"
import { scanPaginatedKUKARoute } from "./research/kuka-scan.mjs"
import { scanPaginatedABBRoute } from "./research/abb-scan.mjs"
import { recordCandidateDisposition } from "./research/candidate-disposition.mjs"
import { recordCandidateIdentity } from "./research/candidate-identity.mjs"
import { recordCandidateApproval } from "./research/candidate-approval.mjs"
import { mergeCompletedScan } from "./research/scan-completion.mjs"
import { loadDailySearchBasis } from "./research/daily-search-basis.mjs"
import { generateDailyHandoff, selectCandidateSource } from "./research/editorial-handoff.mjs"

async function saveSourceSelection(root, runId, selected, context = {}) {
  return withLock(root, "run-" + runId, async () => {
    const manifest = {
      schema: "research-source-selection/v1",
      ...selected.identity,
      ...context,
      candidate_published: false,
    }
    const existing = readJSON(root, `runs/${runId}/source-selection.json`)
    if (existing && sha256(JSON.stringify(existing)) !== sha256(JSON.stringify(manifest)))
      throw Error("Source selection input changed; use a new run")
    if (existing) {
      const current = loadStoredSourceRun(root, runId)
      if (
        current.identity.documents_sha256 !== selected.identity.documents_sha256 ||
        current.identity.parses_sha256 !== selected.identity.parses_sha256
      )
        throw Error("Stored source selection changed after creation")
    }
    atomicWrite(root, `runs/${runId}/documents.json`, selected.documents)
    atomicWrite(root, `runs/${runId}/parses.json`, selected.parses)
    atomicWrite(root, `runs/${runId}/source-selection.json`, manifest)
    return {
      sources: selected.documents.length,
      parses: selected.parses.length,
      candidate_published: false,
    }
  })
}

export async function main(argv = process.argv.slice(2)) {
  const { values: v, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      url: { type: "string", multiple: true },
      channel: { type: "string", multiple: true },
      run: { type: "string" },
      model: { type: "string", default: "qwen3.8:27b" },
      think: { type: "string", default: "medium" },
      "model-policy": { type: "string" },
      review: { type: "string" },
      provisional: { type: "boolean", default: false },
      "merge-backlog": { type: "boolean", default: false },
      query: { type: "string" },
      date: { type: "string" },
      "daily-run": { type: "string" },
      "candidate-key": { type: "string" },
      backlog: { type: "string" },
      "source-run": { type: "string" },
      "published-source-run": { type: "string" },
      "candidate-run": { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      "additional-source-run": { type: "string", multiple: true },
      deep: { type: "boolean", default: false },
      "num-ctx": { type: "string" },
      "input-char-budget": { type: "string" },
      "num-predict": { type: "string" },
      "call-timeout-ms": { type: "string" },
      "extraction-timeout-ms": { type: "string" },
      "facts-per-batch": { type: "string" },
      "approved-run": { type: "string", multiple: true },
      "knowledge-run": { type: "string", multiple: true },
      vault: { type: "string" },
    },
  })
  const command = positionals[0],
    root = v.root
  if (
    !command ||
    ![
      "baseline",
      "inventory",
      "discover",
      "scan-list",
      "collect",
      "extract",
      "review",
      "draft",
      "correct",
      "preview",
      "note-review",
      "knowledge-draft",
      "model-info",
      "queries",
      "localize-queries",
      "search",
      "approve",
      "archive",
      "gold-case",
      "deep-review",
      "reparse",
      "bundle",
      "select-source",
      "select-candidate",
      "candidate-approval",
      "source-register",
      "import-capture",
      "candidate-disposition",
      "candidate-identity",
    ].includes(command)
  )
    throw Error(
      "Usage: research.mjs baseline|inventory|discover|scan-list|collect|reparse|bundle|select-source|select-candidate|candidate-approval|import-capture|candidate-disposition|candidate-identity|extract|review|deep-review|draft|correct|preview|note-review|knowledge-draft|model-info|queries|localize-queries|search|approve|archive|gold-case|source-register --run ID [--url URL --source-run ID --daily-run ID --candidate-key KEY --backlog FILE --published-source-run ID --candidate-run ID --additional-source-run ID --review JSON --channel ID --since DAY --until DAY --provisional --deep --approved-run ID --knowledge-run ID]; preview --review accepts a private new-edition specification",
    )
  const budgetFields = [
    "num-ctx",
    "input-char-budget",
    "num-predict",
    "call-timeout-ms",
    "extraction-timeout-ms",
    "facts-per-batch",
  ]
  if (command !== "extract" && budgetFields.some((field) => v[field] !== undefined))
    throw Error("Extraction budgets are only supported for extract")
  const configuredBudget = {}
  for (const field of budgetFields)
    if (v[field] !== undefined) {
      if (!/^\d+$/.test(v[field])) throw Error("Extraction budget must be an integer: " + field)
      configuredBudget[field.replaceAll("-", "_")] = Number(v[field])
    }
  let budget =
    command === "extract" && !v["model-policy"] ? extractionBudget(configuredBudget) : null
  let ollama = new Ollama()
  const policyRole = {
    queries: "search_plan",
    "localize-queries": "search_plan",
    extract: "fact_extract",
    draft: "article_write",
    "knowledge-draft": "concept_write",
  }[command]
  if (v["model-policy"] && !policyRole)
    throw Error("Model policy is only supported for model-generating commands")
  if (v.deep && command !== "draft") throw Error("--deep is only supported for draft")
  if (command !== "scan-list" && (v.since || v.until))
    throw Error("--since and --until are only supported for scan-list")
  if (v["daily-run"] && !["queries", "select-candidate"].includes(command))
    throw Error("--daily-run is only supported for queries or select-candidate")
  if (
    (v["candidate-key"] || v.backlog) &&
    !["select-candidate", "candidate-approval"].includes(command)
  )
    throw Error(
      "--candidate-key and --backlog are only supported for candidate selection or approval",
    )
  if (command !== "preview" && (v["approved-run"] || v["knowledge-run"]))
    throw Error("--approved-run and --knowledge-run are only supported for preview")
  if (
    ![
      "preview",
      "note-review",
      "inventory",
      "knowledge-draft",
      "select-candidate",
      "candidate-approval",
    ].includes(command) &&
    v.vault
  )
    throw Error(
      "--vault is only supported for preview, note-review, inventory, knowledge-draft, select-candidate or candidate-approval",
    )
  if (
    v["source-run"] &&
    ![
      "extract",
      "gold-case",
      "reparse",
      "bundle",
      "select-source",
      "candidate-approval",
      "import-capture",
      "candidate-disposition",
      "candidate-identity",
    ].includes(command)
  )
    throw Error(
      "--source-run is only supported for extract, gold-case, reparse, bundle, select-source, candidate-approval, import-capture, candidate-disposition or candidate-identity",
    )
  if (v["published-source-run"] && command !== "candidate-identity")
    throw Error("--published-source-run is only supported for candidate-identity")
  if (v["additional-source-run"] && command !== "bundle")
    throw Error("--additional-source-run is only supported for bundle")
  if (v["candidate-run"] && !["candidate-disposition", "candidate-identity"].includes(command))
    throw Error("--candidate-run is only supported for candidate-disposition or candidate-identity")
  if (v["source-run"] && (v.channel?.length || (v.url?.length && command !== "select-source")))
    throw Error("Stored source input cannot be combined with live URLs or channels")
  if (command === "model-info") return ollama.metadata(v.model)
  if (!v.run) throw Error("Explicit --run ID required")
  if (!/^[a-zA-Z0-9_-]+$/.test(v.run)) throw Error("Invalid run id")
  if (command === "select-candidate") {
    if (
      !v["daily-run"] ||
      !/^[a-zA-Z0-9_-]+$/.test(v["daily-run"]) ||
      !v["candidate-key"] ||
      v.run === v["daily-run"] ||
      v["source-run"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Select candidate requires one daily run, candidate key and new output run")
    const handoffRef = await withLock(root, "daily-acquisition", () =>
      generateDailyHandoff({
        root,
        runId: v["daily-run"],
        vault: v.vault || "vault",
        backlogFile: v.backlog || BACKLOG_PATH,
      }),
    )
    const handoff = readJSON(root, handoffRef.path)
    const { candidate, source_attempt_id, selected } = selectCandidateSource(
      root,
      handoff,
      v["candidate-key"],
    )
    if (v.run === source_attempt_id) throw Error("Output run must differ from source attempt")
    const result = await saveSourceSelection(root, v.run, selected, {
      candidate_key: candidate.key,
      candidate_source_version_id: candidate.article_source_version_id,
      candidate_parse_id: candidate.article_parse_id,
      next_route: candidate.next_route,
      daily_run: v["daily-run"],
      handoff_path: handoffRef.path,
      handoff_sha256: sha256(fs.readFileSync(safePath(root, handoffRef.path))),
    })
    return { ...result, candidate_key: candidate.key, source_attempt_id }
  }
  if (command === "candidate-approval") {
    if (
      !v["source-run"] ||
      !v["candidate-key"] ||
      v.url?.length ||
      v.channel?.length ||
      v.review ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Candidate approval requires an approved --source-run and candidate key")
    const publishedArticles = editions(v.vault || "vault").flatMap((edition) =>
      extractArticles(edition).map((article) => ({
        event_id: article.id,
        source_urls: article.urls,
      })),
    )
    return recordCandidateApproval({
      root,
      runId: v.run,
      approvedRunId: v["source-run"],
      candidateKey: v["candidate-key"],
      backlogFile: v.backlog || BACKLOG_PATH,
      publishedArticles,
    })
  }
  if (command === "candidate-disposition") {
    if (
      !v["source-run"] ||
      !v.review ||
      v.url?.length ||
      v.channel?.length ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Candidate disposition requires --source-run and private --review only")
    const all = editions("vault")
    return recordCandidateDisposition({
      root,
      runId: v.run,
      sourceRunId: v["source-run"],
      candidateRunId: v["candidate-run"] || v["source-run"],
      reviewPath: v.review,
      publishedURLs: all.flatMap((edition) => extractArticles(edition).flatMap((a) => a.urls)),
      publishedContent: all.map((edition) => edition.body),
    })
  }
  if (command === "candidate-identity") {
    if (
      !v["source-run"] ||
      !v["published-source-run"] ||
      !v.review ||
      v.url?.length ||
      v.channel?.length ||
      v["merge-backlog"] ||
      v.provisional
    )
      throw Error("Candidate identity requires both stored source runs and private --review only")
    const all = editions("vault")
    return recordCandidateIdentity({
      root,
      runId: v.run,
      sourceRunId: v["source-run"],
      publishedSourceRunId: v["published-source-run"],
      candidateRunId: v["candidate-run"] || v["source-run"],
      reviewPath: v.review,
      publishedArticles: all.flatMap((edition) =>
        extractArticles(edition).map((article) => ({
          event_id: article.id,
          title: article.title,
          published_at: article.review?.published_at,
          review_status: article.review?.review_status,
          source_urls: article.urls,
        })),
      ),
    })
  }
  if (command === "bundle") {
    if (!v["source-run"] || !v["additional-source-run"]?.length)
      throw Error("Bundle requires --source-run and --additional-source-run")
    const ids = [v["source-run"], ...v["additional-source-run"]]
    if (ids.includes(v.run)) throw Error("Bundle output run must differ from source runs")
    return withLock(root, "run-" + v.run, async () => {
      const bundle = bundleStoredSourceRuns(root, ids)
      const manifest = {
        schema: "research-source-bundle/v1",
        ...bundle.identity,
        candidate_published: false,
      }
      const existing = readJSON(root, `runs/${v.run}/source-bundle.json`)
      if (existing && sha256(JSON.stringify(existing)) !== sha256(JSON.stringify(manifest)))
        throw Error("Source bundle input changed; use a new run")
      if (existing) {
        const current = loadStoredSourceRun(root, v.run)
        if (
          current.identity.documents_sha256 !== bundle.identity.documents_sha256 ||
          current.identity.parses_sha256 !== bundle.identity.parses_sha256
        )
          throw Error("Stored source bundle changed after creation")
      }
      atomicWrite(root, `runs/${v.run}/documents.json`, bundle.documents)
      atomicWrite(root, `runs/${v.run}/parses.json`, bundle.parses)
      atomicWrite(root, `runs/${v.run}/source-bundle.json`, manifest)
      return {
        sources: bundle.documents.length,
        parses: bundle.parses.length,
        candidate_published: false,
      }
    })
  }
  if (command === "select-source") {
    if (!v["source-run"] || v["source-run"] === v.run || !v.url?.length)
      throw Error("Select source requires a different --source-run and one or more --url values")
    return saveSourceSelection(root, v.run, selectStoredSources(root, v["source-run"], v.url))
  }
  if (command === "import-capture") {
    if (!v.review || !v["source-run"] || v["source-run"] === v.run)
      throw Error("Import requires a root-relative --review manifest and a different --source-run")
    return withLock(root, "run-" + v.run, async () => {
      const inspected = inspectManualCapture(root, v.review, v["source-run"])
      const registryBytes = fs.readFileSync("data/research-acquisition.json")
      const profiles = JSON.parse(registryBytes).article_profiles || []
      const run = new RunState(root, v.run, {
        command,
        capture: inspected.identity,
        registry_sha256: sha256(registryBytes),
        worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
        importer_sha256: sha256(fs.readFileSync("scripts/research/archive.mjs")),
      })
      const selectedProfiles = inspected.entries.map(({ source }) => {
        const matching = profiles.filter((profile) =>
          new RegExp(profile.url_pattern).test(source.final_url),
        )
        if (matching.length !== 1) throw Error("Manual capture needs one exact article profile")
        return matching[0]
      })
      const documents = storeManualCapture(root, inspected)
      const parses = []
      for (const [index, document] of documents.entries()) {
        const profile = selectedProfiles[index]
        parses.push(
          await run.stage(`parse-${document.source_id}`, { document, profile }, () =>
            parseDocument(root, document, profile.options),
          ),
        )
      }
      assertStoredEvidence(root, documents, parses)
      atomicWrite(root, `runs/${v.run}/documents.json`, documents)
      atomicWrite(root, `runs/${v.run}/parses.json`, parses)
      atomicWrite(root, `runs/${v.run}/manual-capture-import.json`, {
        schema: "manual-capture-import/v1",
        ...inspected.identity,
        documents_sha256: sha256(JSON.stringify(documents)),
        parses_sha256: sha256(JSON.stringify(parses)),
        candidate_published: false,
      })
      return {
        sources: documents.length,
        parses: parses.map((parse) => ({
          id: parse.parse_id,
          status: parse.status,
          blocks: parse.blocks.length,
        })),
        candidate_published: false,
      }
    })
  }
  if (v["model-policy"]) {
    const explicit = (key) =>
      argv.some((arg) => arg === "--" + key || arg.startsWith("--" + key + "="))
    const overrides = {
      ...configuredBudget,
      ...(explicit("model") ? { model: v.model } : {}),
      ...(explicit("think")
        ? { think: v.think === "false" ? false : v.think === "true" ? true : v.think }
        : {}),
    }
    ollama = await prepareRoleOllama(
      ollama,
      JSON.parse(fs.readFileSync(v["model-policy"], "utf8")),
      policyRole,
      { root, run: v.run, overrides },
    )
    const settings = ollama.executionPolicy.settings
    v.model = settings.model
    v.think = settings.think
    if (command === "extract")
      budget = extractionBudget(
        Object.fromEntries(
          budgetFields
            .map((field) => field.replaceAll("-", "_"))
            .map((key) => [key, settings[key]]),
        ),
      )
  }
  if (command === "knowledge-draft")
    return withLock(root, "run-" + v.run, () => {
      if (!v.review) throw Error("Explicit knowledge draft input JSON required")
      return writeKnowledgeDraft(root, v.run, JSON.parse(fs.readFileSync(v.review, "utf8")), {
        vault: v.vault || "vault",
        ollama,
        model: v.model,
      })
    })
  if (command === "inventory")
    return withLock(root, "run-" + v.run, () =>
      saveRetrospectiveInventory(root, v.run, v.vault || "vault"),
    )
  if (command === "note-review")
    return withLock(root, "run-" + v.run, () => {
      if (!v.review) throw Error("Explicit canonical note review JSON required")
      return approveNoteReview(root, v.run, JSON.parse(fs.readFileSync(v.review, "utf8")), {
        vault: v.vault || "vault",
      })
    })
  if (command === "preview")
    return withLock(root, "run-" + v.run, () =>
      privatePreview(root, v.run, v["approved-run"] || [], {
        vault: v.vault || "vault",
        knowledgeRuns: v["knowledge-run"] || [],
        ...(v.review ? { editionSpec: JSON.parse(fs.readFileSync(v.review, "utf8")) } : {}),
      }),
    )
  if (command === "source-register")
    return withLock(root, "run-" + v.run, async () => {
      const urls = new Set(),
        inputFiles = []
      const visit = (value) => {
        if (typeof value === "string" && /^https?:\/\//.test(value)) urls.add(value)
        else if (Array.isArray(value)) value.forEach(visit)
        else if (value && typeof value === "object") Object.values(value).forEach(visit)
      }
      for (const file of [
        "data/research-source-channels.json",
        "data/research-watchlist.json",
        "data/research-acquisition.json",
      ]) {
        const bytes = fs.readFileSync(file)
        visit(JSON.parse(bytes))
        inputFiles.push({ path: file, sha256: sha256(bytes) })
      }
      const renders = safePath(root, "renders")
      for (const item of fs.existsSync(renders)
        ? fs.readdirSync(renders, { withFileTypes: true })
        : []) {
        if (item.isSymbolicLink()) throw Error("Symlink in render source references")
        if (!item.isDirectory()) continue
        const relative = `renders/${item.name}/manifest.json`,
          file = safePath(root, relative)
        const bytes = fs.readFileSync(file),
          manifest = JSON.parse(bytes)
        if (
          manifest.capture_id !== item.name ||
          sha256(fs.readFileSync(safePath(root, `renders/${item.name}/body.html`))) !==
            manifest.body_sha256 ||
          sha256(
            JSON.stringify([
              manifest.original_source_version_id,
              manifest.body_sha256,
              manifest.resources,
            ]),
          ) !== item.name
        )
          throw Error("Render source reference hash mismatch")
        for (const resource of manifest.resources)
          if (
            ["captured", "not_modified"].includes(resource.status) &&
            resource.source_version_id?.startsWith(sourceId(resource.url) + ":")
          )
            urls.add(resource.url)
        inputFiles.push({ path: relative, sha256: sha256(bytes) })
      }
      const referencePath = `runs/${v.run}/source-url-inputs.json`
      atomicWrite(root, referencePath, {
        schema: "source-url-inputs/v1",
        observed_at: new Date().toISOString(),
        urls: [...urls].sort(),
        input_files: inputFiles,
      })
      const register = buildSourceRegister(root, { url_reference_path: referencePath })
      atomicWrite(root, `runs/${v.run}/source-register.json`, register)
      return {
        path: path.resolve(root, `runs/${v.run}/source-register.json`),
        versions: register.sources.length,
        unresolved: register.unresolved_versions.length,
        metadata_complete: register.metadata_complete,
        candidate_published: false,
      }
    })
  if (command === "reparse" && !v["source-run"]) throw Error("Reparse requires --source-run")
  if (command === "gold-case") {
    if (!v["source-run"] || !v.review) throw Error("--source-run and --review required")
    return saveEvaluationCase(
      root,
      v.run,
      v["source-run"],
      JSON.parse(fs.readFileSync(v.review, "utf8")),
    )
  }
  if (command === "queries") {
    const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json"))
    const dailyBasis = v["daily-run"] ? loadDailySearchBasis(root, v["daily-run"]) : null
    const date =
      v.date || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
    if (dailyBasis && date !== dailyBasis.reference.kst_day)
      throw Error("Search date must match the verified daily acquisition day")
    const all = editions("vault")
    const library = briefingLibrary(
      "vault",
      all,
      new Map(all.map((i) => [i.slug, extractArticles(i)])),
      { requireLatest: false },
    )
    const observedAt =
      readJSON(root, `runs/${v.run}/search-plan/context.json`)?.window?.discovery_end ||
      new Date().toISOString()
    const window = researchWindow(library.latest.cutoff, observedAt, readBacklog(), library.issues)
    const context = buildSearchContext(
      watchlist,
      window,
      dailyBasis?.coverage || readJSON(root, `runs/${v.run}/coverage.json`) || [],
    )
    if (dailyBasis) context.daily_basis = dailyBasis.reference
    const q = await planSearchQueries(root, v.run, ollama, {
      model: v.model,
      date,
      context,
      manufacturers: watchlist.robot_manufacturers || [],
      dailyBasis: dailyBasis?.reference,
    })
    return { queries: q.queries.length, candidate_published: false }
  }
  if (command === "localize-queries") {
    const q = v.query
      ? JSON.parse(fs.readFileSync(v.query, "utf8"))
      : readJSON(root, `runs/${v.run}/queries.json`)
    if (!q?.queries?.length) throw Error("Source queries are required")
    const watchlist = JSON.parse(fs.readFileSync("data/research-watchlist.json"))
    const result = await planSearchQueries(root, v.run, ollama, {
      sourcePlan: q,
      model: v.model,
      manufacturers: watchlist.robot_manufacturers || [],
      date:
        v.date ||
        q.observation_date ||
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
    })
    return {
      queries: result.queries.length,
      localized: result.localization?.slots.length || 0,
      candidate_published: false,
    }
  }
  if (command === "search") {
    const result = await withLock(root, "run-" + v.run, async () => {
      const q = v.query ? JSON.parse(fs.readFileSync(v.query, "utf8")) : loadSearchPlan(root, v.run)
      if (!q?.queries?.length) throw Error("Generate or supply search queries first")
      if (["research-search-plan/v1", "research-search-plan/v2"].includes(q.schema))
        validateCompleteSearchPlan(q)
      if (
        q.daily_basis &&
        JSON.stringify(q.daily_basis) !==
          JSON.stringify(loadDailySearchBasis(root, q.daily_basis.daily_run).reference)
      )
        throw Error("Daily acquisition basis changed after search planning")
      validateSearchQueries(q.queries)
      const state = new RunState(
        root,
        v.run,
        {
          queries_sha256: sha256(JSON.stringify(q.queries)),
          daily_basis_sha256: q.daily_basis ? sha256(JSON.stringify(q.daily_basis)) : null,
          module_sha256: sha256(fs.readFileSync("scripts/research/search.mjs")),
          service: process.env.SEARXNG_URL || "managed-local",
        },
        { scope: "search" },
      )
      return process.env.SEARXNG_URL
        ? discoverSearch(root, v.run, new SearxSearch(), q.queries, { state })
        : withLocalSearch(root, (search, health) => {
            atomicWrite(root, `runs/${v.run}/search-runtime-${health.owner}.json`, health)
            atomicWrite(root, `runs/${v.run}/search-runtime.json`, health)
            return discoverSearch(root, v.run, search, q.queries, { state })
          })
    })
    if (v["merge-backlog"])
      await mergeBacklog(".local/research/candidate-backlog.json", result.candidates)
    return {
      queries: result.records.length,
      discovered: result.candidates.length,
      failures: result.records.filter((r) => r.status === "failed"),
      engine_failures: result.records
        .filter((r) => r.failures?.length)
        .map((r) => ({ query: r.query, failures: r.failures })),
      candidate_published: false,
    }
  }
  if (command === "archive") {
    return withLock(root, "run-" + v.run, async () => {
      const manifest = archiveManifest(root, v.run)
      atomicWrite(root, `runs/${v.run}/archive-manifest.json`, manifest)
      return { files: manifest.files.length, drive_verified: false }
    })
  }
  if (command === "baseline") {
    const b = saveBaseline(root, v.run, "vault")
    return {
      notes: b.notes,
      editions: b.editions,
      counts: b.counts,
      snapshot: `baselines/${v.run}/inventory.json`,
    }
  }
  if (["review", "deep-review", "draft", "correct", "approve"].includes(command))
    return withLock(root, "run-" + v.run, async () => {
      const extracted = readJSON(root, `runs/${v.run}/claims.json`),
        documents = readJSON(root, `runs/${v.run}/documents.json`),
        parses = readJSON(root, `runs/${v.run}/parses.json`)
      if (!extracted || !documents) throw Error("Extract sources first")
      assertStoredEvidence(root, documents, parses)
      if (command === "correct") {
        if (!v.review) throw Error("Explicit draft correction JSON required")
        const decision = JSON.parse(fs.readFileSync(v.review, "utf8")),
          originalPath = `runs/${v.run}/draft.json`,
          originalBytes = fs.readFileSync(safePath(root, originalPath)),
          original = JSON.parse(originalBytes),
          reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
        if (!reviewed) throw Error("Reviewed claims required for correction")
        const allowed = ["draft_id", "reviewer", "reason", "reviewed_at", "draft"]
        if (Object.keys(decision).some((key) => !allowed.includes(key)))
          throw Error("Unknown draft correction field")
        assertReviewDate(decision.reviewed_at, {
          notBefore: reviewed.claims.map((c) => c.review.reviewed_at),
        })
        if (original.draft_id !== draftFingerprint(original.draft, original.deep_context))
          throw Error("Original draft changed before correction")
        const inputHash = sha256(JSON.stringify(decision))
        if (original.correction_input_sha256 === inputHash)
          return { status: "editorial_review", draft_id: original.draft_id, reused: true }
        const { draft: replacement, ...review } = decision,
          corrected = {
            ...correctDraft(original, replacement, reviewed.claims, review),
            correction_input_sha256: inputHash,
          },
          historyPath = `runs/${v.run}/drafts/${original.draft_id}.json`,
          existingHistory = safePath(root, historyPath)
        if (
          fs.existsSync(existingHistory) &&
          sha256(fs.readFileSync(existingHistory)) !== sha256(originalBytes)
        )
          throw Error("Original draft history differs; use a separate review")
        atomicWrite(root, historyPath, originalBytes)
        atomicWrite(root, `runs/${v.run}/corrections/${inputHash}.json`, decision)
        atomicWrite(root, originalPath, corrected)
        atomicWrite(
          root,
          `runs/${v.run}/preview.md`,
          draftMarkdown(corrected, reviewed.claims, documents),
        )
        return {
          status: corrected.status,
          draft_id: corrected.draft_id,
          previous_draft_id: original.draft_id,
          problems: corrected.problems,
          candidate_published: false,
        }
      }
      if (command === "approve") {
        if (!v.review) throw Error("Explicit editorial review JSON required")
        const draft = readJSON(root, `runs/${v.run}/draft.json`),
          reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
        if (!draft || !reviewed) throw Error("Reviewed claims and exact draft required")
        const decision = JSON.parse(fs.readFileSync(v.review, "utf8")),
          article = approvedArticle(draft, reviewed.claims, documents, decision, parses)
        atomicWrite(root, `runs/${v.run}/editorial-review.json`, decision)
        atomicWrite(root, `runs/${v.run}/approved-article.json`, article)
        return { event_id: article.event_id, status: "approved", candidate_published: false }
      }
      if (command === "review") {
        if (!v.review) throw Error("--review JSON decision file required")
        const decisions = JSON.parse(fs.readFileSync(v.review, "utf8"))
        const claims = recordFactReview(extracted.claims, decisions.claims, decisions, parses)
        atomicWrite(root, `runs/${v.run}/reviewed-claims.json`, { ...extracted, claims })
        return {
          verified: claims.filter((c) => c.review.status === "verified").length,
          deferred: claims.filter((c) => c.review.status === "deferred").length,
          rejected: claims.filter((c) => c.review.status === "rejected").length,
        }
      }
      const reviewed = readJSON(root, `runs/${v.run}/reviewed-claims.json`)
      if (command === "deep-review") {
        if (!reviewed || !v.review)
          throw Error("Reviewed claims and explicit deep review JSON required")
        const decision = JSON.parse(fs.readFileSync(v.review, "utf8"))
        const context = recordDeepDiveReview(
          decision.input,
          reviewed.claims,
          parses,
          documents,
          decision.review,
        )
        atomicWrite(root, `runs/${v.run}/deep-context.json`, context)
        return { kind: context.input.kind, status: "basis_reviewed", candidate_published: false }
      }
      const claims = (reviewed || extracted).claims
      if (command === "draft") {
        const previous = readJSON(root, `runs/${v.run}/draft.json`)
        if (
          previous?.correction_review ||
          fs.existsSync(safePath(root, `runs/${v.run}/approved-article.json`))
        )
          throw Error("Draft is already corrected or approved; use a new run for model drafting")
      }
      const deepContext = v.deep ? readJSON(root, `runs/${v.run}/deep-context.json`) : null
      if (v.deep && !deepContext) throw Error("Review deep-dive source context first")
      const draft = await writeDraft(ollama, claims, {
        model: v.model,
        think: false,
        provisional: v.provisional,
        deepContext,
        parses,
        documents,
      })
      atomicWrite(root, `runs/${v.run}/draft.json`, draft)
      atomicWrite(root, `runs/${v.run}/preview.md`, draftMarkdown(draft, claims, documents))
      return {
        status: draft.status,
        problems: draft.problems,
        candidate_published: false,
        preview: path.resolve(root, `runs/${v.run}/preview.md`),
      }
    })
  return withLock(root, "run-" + v.run, async () => {
    if (v["source-run"] === v.run) throw Error("Output run must differ from source run")
    const stored = v["source-run"]
      ? loadStoredSourceRun(root, v["source-run"], { allowUnacquired: command === "reparse" })
      : null
    const input = {
      command,
      urls: v.url || [],
      channels: v.channel || [],
      model: v.model,
      think: v.think,
      ...(ollama.executionPolicy ? { model_policy: ollama.executionPolicy } : {}),
      ...(budget ? { extraction_budget: budget } : {}),
      ...(stored ? { stored_source: stored.identity } : {}),
      ...(!stored ? { fetcher_sha256: sha256(fs.readFileSync("scripts/research/fetch.mjs")) } : {}),
      registry_sha256: sha256(fs.readFileSync("data/research-acquisition.json")),
      watchlist_sha256: sha256(fs.readFileSync("data/research-watchlist.json")),
      channels_sha256: sha256(fs.readFileSync("data/research-source-channels.json")),
      collector_sha256: sha256(fs.readFileSync("scripts/research/discovery.mjs")),
      ...(command === "scan-list"
        ? {
            list_scan_sha256: sha256(fs.readFileSync("scripts/research/list-scan.mjs")),
            api_scan_sha256: sha256(fs.readFileSync("scripts/research/api-scan.mjs")),
            kuka_scan_sha256: sha256(fs.readFileSync("scripts/research/kuka-scan.mjs")),
            abb_scan_sha256: sha256(fs.readFileSync("scripts/research/abb-scan.mjs")),
            rss_scan_sha256: sha256(fs.readFileSync("scripts/research/rss-scan.mjs")),
          }
        : {}),
      policy_sha256: sha256(fs.readFileSync("scripts/research/source-policy.mjs")),
      worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
    }
    const run = new RunState(root, v.run, input),
      fetcher = new SourceFetcher(root)
    if (command === "discover") {
      const routes = registry(
        JSON.parse(fs.readFileSync("data/research-source-channels.json")),
        JSON.parse(fs.readFileSync("data/research-watchlist.json")),
        JSON.parse(fs.readFileSync("data/research-acquisition.json")),
      )
      const wanted = v.channel?.length
        ? v.channel.map((id) => {
            const c = routes.find((r) => r.channel_id === id)
            if (!c) throw Error("Unknown channel: " + id)
            return c
          })
        : routes
      const results = []
      // Bounded four-host discovery; SourceFetcher serializes each host.
      for (let i = 0; i < wanted.length; i += 4)
        results.push(
          ...(await Promise.all(
            wanted
              .slice(i, i + 4)
              .map((c) =>
                run.stage("channel-" + c.channel_id, c, () => discoverChannel(root, fetcher, c)),
              ),
          )),
        )
      const candidates = results.flatMap((r) => r.candidates)
      atomicWrite(root, `runs/${v.run}/coverage.json`, coverageGrid(results))
      atomicWrite(root, `runs/${v.run}/candidates.json`, candidates)
      if (v["merge-backlog"])
        await mergeBacklog(".local/research/candidate-backlog.json", candidates)
      return {
        routes: results.length,
        discovered: candidates.length,
        failures: results
          .filter((r) => r.status !== "partial")
          .map((r) => ({ id: r.channel_id, status: r.status })),
        candidate_published: false,
      }
    }
    if (command === "scan-list") {
      if (v.channel?.length !== 1 || !v.since || !v.until || v.url?.length)
        throw Error("scan-list requires one --channel and a [--since, --until) day window")
      const routes = registry(
        JSON.parse(fs.readFileSync("data/research-source-channels.json")),
        JSON.parse(fs.readFileSync("data/research-watchlist.json")),
        JSON.parse(fs.readFileSync("data/research-acquisition.json")),
      )
      const channel = routes.find((route) => route.channel_id === v.channel[0])
      if (!channel) throw Error("Unknown channel: " + v.channel[0])
      const profiles =
        JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles || []
      const scanner =
        channel.api_profile?.id === "hd-press-json-pages-v1"
          ? scanPaginatedHDRoute
          : channel.api_profile?.id === "kuka-news-form-pages-v1"
            ? scanPaginatedKUKARoute
            : channel.api_profile?.id === "abb-newsbank-json-pages-v1"
              ? scanPaginatedABBRoute
              : channel.api_profile
                ? null
                : channel.listing_profile?.pagination === "calendar-month"
                  ? scanCalendarMonthRoute
                  : channel.method === "rss" &&
                      channel.listing_profile?.pagination === "bounded-feed"
                    ? scanBoundedRSSRoute
                    : channel.method === "html-list" &&
                        channel.listing_profile?.pagination === "single-page"
                      ? scanSinglePageRoute
                      : null
      if (!scanner) throw Error("Unknown or unsupported listing route: " + channel.channel_id)
      const result = await scanner(root, run, fetcher, channel, profiles, {
        since: v.since,
        until: v.until,
      })
      atomicWrite(root, `runs/${v.run}/list-scan.json`, result.summary)
      if (result.indexDocuments)
        atomicWrite(root, `runs/${v.run}/list-pages.json`, result.indexDocuments)
      atomicWrite(root, `runs/${v.run}/documents.json`, result.documents)
      atomicWrite(root, `runs/${v.run}/parses.json`, result.parses)
      atomicWrite(root, `runs/${v.run}/candidates.json`, result.candidates)
      const backlogMerge = v["merge-backlog"]
        ? await mergeCompletedScan(result, ".local/research/candidate-backlog.json")
        : null
      return {
        channel_id: channel.channel_id,
        status: result.summary.status,
        reason: result.summary.reason,
        candidates: result.candidates.length,
        ...(backlogMerge ? { backlog_merge: backlogMerge } : {}),
        candidate_published: false,
      }
    }
    if (!stored && !v.url?.length) throw Error("At least one --url or --source-run required")
    const documents = stored?.documents || [],
      parses = command === "reparse" ? [] : stored?.parses || []
    if (command === "reparse") {
      const profiles =
        JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles || []
      // Failed captures remain in documents.json; only readable stored bodies
      // are reparsed. Extraction and evaluation still require acquired sources.
      for (const document of documents.filter((d) =>
        ["captured", "not_modified"].includes(d.fetch_status),
      )) {
        const options =
          profiles.find((p) => new RegExp(p.url_pattern).test(document.final_url))?.options || {}
        parses.push(
          await run.stage(
            `parse-${document.source_id}-${document.body_sha256.slice(0, 12)}`,
            {
              document,
              options,
              worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
            },
            () => parseDocument(root, document, options),
          ),
        )
      }
    }
    for (const url of v.url || []) {
      const id = sourceId(url)
      const document = await run.stage("fetch-" + id, { url }, () =>
        fetchWithPolicy(root, fetcher, url),
      )
      documents.push(document)
      const profiles =
        JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles || []
      const options =
        profiles.find((p) => new RegExp(p.url_pattern).test(document.final_url))?.options || {}
      if (["captured", "not_modified"].includes(document.fetch_status))
        parses.push(
          await run.stage(
            "parse-" + id,
            {
              document,
              options,
              worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
            },
            () => parseDocument(root, document, options),
          ),
        )
    }
    atomicWrite(root, `runs/${v.run}/documents.json`, documents)
    atomicWrite(root, `runs/${v.run}/parses.json`, parses)
    if (command === "extract") {
      if (documents.some((d) => !["captured", "not_modified"].includes(d.fetch_status)))
        throw Error("A source was not acquired; inspect documents.json")
      assertStoredEvidence(root, documents, parses)
      const metadata = await ollama.metadata(v.model)
      const claims = await run.stage(
        "claims",
        {
          parse_ids: parses.map((p) => p.parse_id),
          metadata,
          prompt_module_sha256: sha256(fs.readFileSync("scripts/research/claims.mjs")),
          model: v.model,
          think: v.think,
          ...(ollama.executionPolicy ? { model_policy: ollama.executionPolicy } : {}),
          budget,
        },
        () =>
          extractClaims(ollama, parses, {
            ...budget,
            candidate_key: "source-" + sourceId(canonicalURL(documents[0].original_url)),
            model: v.model,
            think: v.think === "false" ? false : v.think === "true" ? true : v.think,
            checkpoint: (id, request, action) =>
              run.stage(
                "claims-batch-" + id,
                {
                  metadata,
                  ...(ollama.executionPolicy ? { model_policy: ollama.executionPolicy } : {}),
                  candidate_key: "source-" + sourceId(canonicalURL(documents[0].original_url)),
                  request,
                },
                action,
              ),
          }),
      )
      return {
        claims: claims.claims.length,
        structural_pass: claims.claims.filter((c) => c.review.structural_pass).length,
        fact_review_required: true,
        candidate_published: false,
      }
    }
    return {
      sources: documents.map((d) => ({ url: d.original_url, status: d.fetch_status })),
      parses: parses.map((p) => ({ id: p.parse_id, status: p.status, blocks: p.blocks.length })),
      candidate_published: false,
    }
  })
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/research.mjs")) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((e) => {
      console.error(e.message)
      process.exitCode = 1
    })
}
