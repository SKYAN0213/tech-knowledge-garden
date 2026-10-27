import fs from "node:fs"
import path from "node:path"
import { canonicalURL, parseNote, walk } from "../garden.mjs"
import { assertStoredEvidence } from "./parser.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import {
  assertReviewDate,
  parseResearchDate,
  samePublicationDate,
  seoulPublicationDay,
} from "./dates.mjs"
import { assertSignalDateMetadata, assertSignalOccurredAt } from "./signal-dates.mjs"
import { loadCurrentApproval, loadHistoricalApproval } from "./preview.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicWrite, assertAbsent, readJSON, safePath, RunState } from "./run-state.mjs"
import {
  assertNewConceptMetadata,
  assertNewConceptBody,
  assertConceptConflicts,
  assertPreservedConceptIdentities,
  assertConceptConnections,
} from "./knowledge-links.mjs"

const checks = [
  "source_read",
  "final_prose_read",
  "aliases_checked",
  "connections_checked",
  "histories_checked",
]
const nonempty = (s) => typeof s === "string" && !!s.trim()
const exactName = (s) => s.normalize("NFKC").toLowerCase().trim()
const validRun = (run) => {
  if (typeof run !== "string" || !/^[a-zA-Z0-9_-]+$/.test(run))
    throw Error("Invalid note review run")
}
const notePath = (p) => {
  if (
    typeof p !== "string" ||
    !/^(Knowledge|Signals|TrendTopics)\/.+\.md$/.test(p) ||
    /[\\\x00-\x1f\x7f]/.test(p) ||
    p.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("Only canonical knowledge, signal and topic note paths allowed")
  return p
}

export function loadReviewedNoteSource(root, run) {
  validRun(run)
  const files = Object.fromEntries(
    ["documents.json", "parses.json", "reviewed-claims.json"].map((name) => {
      const bytes = fs.readFileSync(safePath(root, `runs/${run}/${name}`))
      return [name, { value: JSON.parse(bytes), sha256: sha256(bytes) }]
    }),
  )
  const documents = files["documents.json"].value,
    parses = files["parses.json"].value
  assertStoredEvidence(root, documents, parses)
  const claims = files["reviewed-claims.json"].value.claims
  if (!Array.isArray(claims) || new Set(claims.map((c) => c.claim_id)).size !== claims.length)
    throw Error("Distinct reviewed source facts required")
  return {
    run,
    documents,
    parses,
    claims,
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.sha256])),
  }
}

function signalEventBindings(root, facts, observations, vault, historical) {
  // Preserve the source-only URL identity and exact publication precision.
  const bindings = facts.flatMap(({ source, claim }) =>
    claim.evidence.flatMap((e) => {
      const doc = source.documents.find(
        (d) => d.source_id === e.source_id && d.source_version_id === e.source_version_id,
      )
      return doc?.original_url && claim.published_at
        ? [
            {
              event_id: sha256(canonicalURL(doc.original_url)).slice(0, 16),
              event_date: claim.published_at,
              claim,
              source_run: source.run,
            },
          ]
        : []
    }),
  )
  const articles = []
  if (!observations.length) return { bindings, articles }

  for (const source of [...new Map(facts.map(({ source }) => [source.run, source])).values()]) {
    if (!fs.existsSync(safePath(root, `runs/${source.run}/approved-article.json`))) continue
    let approval
    try {
      // New/current notes require current canonical definitions. Historical
      // lookups reuse the existing immutable approved-concept snapshot path;
      // source bytes, article validation and exact approval pins still apply.
      approval = historical
        ? loadHistoricalApproval(root, source.run, { vault })
        : loadCurrentApproval(root, source.run, { vault })
    } catch (cause) {
      throw Error("Signal evidence conflicts with the native article approval: " + cause.message, {
        cause,
      })
    }
    if (Object.entries(source.files).some(([name, hash]) => approval.files[name] !== hash))
      throw Error("Signal source changed during article approval validation")
    const bytes = fs.readFileSync(safePath(root, `runs/${source.run}/draft.json`))
    if (sha256(bytes) !== approval.files["draft.json"])
      throw Error("Signal article draft changed during approval validation")
    const draft = JSON.parse(bytes).draft,
      publicClaims = new Set([
        ...draft.lead.flatMap((row) => row.claim_ids),
        ...draft.explanations.flatMap((section) =>
          section.paragraphs.flatMap((row) => row.claim_ids),
        ),
        ...(draft.analysis?.claim_ids || []),
      ]),
      article = approval.article,
      urls = new Set(article.source_urls.map(canonicalURL))
    articles.push(article)
    const nativeBindings = []
    for (const { source: selected, claim } of facts) {
      const review = article.article_review
      // loadCurrent/HistoricalApproval already validates the exact header,
      // used claim and source parse behind this explicit timezone conversion.
      // Ordinary source days and source-only bindings keep their existing rule.
      const publicationMatches =
        samePublicationDate(review.published_at, claim.published_at) ||
        (review.date_kind === "source-publication-time" &&
          parseResearchDate(review.source_published_at)?.precision === "timestamp" &&
          samePublicationDate(review.source_published_at, claim.published_at) &&
          seoulPublicationDay(review.source_published_at) === review.published_at)
      if (
        selected.run !== source.run ||
        !publicClaims.has(claim.claim_id) ||
        (claim.event_id && claim.event_id !== article.event_id) ||
        !publicationMatches ||
        !claim.evidence.every((e) => {
          const doc = source.documents.find(
            (d) => d.source_id === e.source_id && d.source_version_id === e.source_version_id,
          )
          return doc?.original_url && urls.has(canonicalURL(doc.original_url))
        })
      )
        continue
      nativeBindings.push({
        event_id: article.event_id,
        event_date: article.article_review.published_at,
        claim,
        source_run: source.run,
        approval_run: source.run,
        approval_files: approval.files,
      })
    }
    // An approved source can contain several independent events. Its URL must
    // not assign another approved event's public claim to this observation.
    // Keep the old URL/date path only when the approved identity agrees too.
    for (let index = bindings.length - 1; index >= 0; index--)
      if (
        bindings[index].source_run === source.run &&
        !nativeBindings.some(
          (binding) =>
            binding.event_id === bindings[index].event_id &&
            binding.claim.claim_id === bindings[index].claim.claim_id,
        )
      )
        bindings.splice(index, 1)
    bindings.push(...nativeBindings)
  }
  return { bindings, articles }
}

function assertBoundSignalOccurredAt(observation, bindings, articles) {
  assertSignalDateMetadata(observation, { articles })
  const matching = bindings.filter(
    (b) => b.event_id === observation.event_id && b.event_date === observation.event_date,
  )
  const supporting = matching.find(
    ({ claim }) =>
      (!claim.event_id || claim.event_id === observation.event_id) &&
      ["reported", "completed", "in_progress"].includes(claim.event_state) &&
      claim.effective_period === observation.occurred_at,
  )
  // A native article retains the source calendar day while a cited fact may
  // retain its exact timestamp. Validate that public date above, then use the
  // unmodified fact's publication value for the existing effective-day check.
  const exact = supporting
    ? {
        ...observation,
        event_date: supporting.claim.published_at,
        ...(observation.source_published_at !== undefined
          ? { source_published_at: supporting.claim.published_at }
          : {}),
      }
    : observation
  assertSignalOccurredAt(exact, { facts: matching, articles })
}

// The full replacement is approved against preserved authoring bytes and exact
// reviewed source facts. This never writes the authority vault or publishes.
export function evaluateNoteReview(root, decision, { vault = "vault", sourceVault = vault } = {}) {
  return evaluateNoteReviewInternal(root, decision, { vault, sourceVault })
}

function evaluateNoteReviewInternal(
  root,
  decision,
  { vault, sourceVault, historical = false },
  applied = null,
) {
  const v2 = decision?.schema === "knowledge-note-review/v2"
  const allowed = ["schema", "reviewer", "reason", "reviewed_at", ...checks, "notes"]
  if (
    !decision ||
    Object.keys(decision).some((k) => !allowed.includes(k)) ||
    (!v2 && decision.schema !== "knowledge-note-review/v1") ||
    !nonempty(decision.reviewer) ||
    !nonempty(decision.reason) ||
    checks.some((k) => decision[k] !== true)
  )
    throw Error("Explicit source and final note review required")
  const review = assertReviewDate(decision.reviewed_at)
  const reviewDay =
    review.precision === "day"
      ? review.day
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
          new Date(review.instant),
        )
  if (
    !Array.isArray(decision.notes) ||
    !decision.notes.length ||
    decision.notes.length > 64 ||
    new Set(decision.notes.map((n) => n.path)).size !== decision.notes.length
  )
    throw Error("Distinct canonical note replacements required")
  const runs = [...new Set(decision.notes.flatMap((n) => (n.evidence || []).map((e) => e.run_id)))]
  const sources = runs.map((r) => loadReviewedNoteSource(root, r))
  const signalApprovalFiles = new Map()
  const approved = decision.notes.map((n) => {
    if (
      Object.keys(n).some(
        (k) =>
          ![
            "path",
            "previous_sha256",
            "content",
            "evidence",
            ...(v2 ? ["operation"] : []),
          ].includes(k),
      ) ||
      (v2 && !["create", "replace"].includes(n.operation)) ||
      !nonempty(n.content) ||
      Buffer.byteLength(n.content) > 1048576 ||
      !Array.isArray(n.evidence) ||
      !n.evidence.length
    )
      throw Error("Complete source-bound note replacement required")
    const relative = notePath(n.path),
      creating = v2 && n.operation === "create"
    if (
      creating &&
      ((!relative.startsWith("Knowledge/") &&
        !relative.startsWith("Signals/") &&
        !relative.startsWith("TrendTopics/")) ||
        n.previous_sha256 !== null)
    )
      throw Error(
        "Creation requires a new Knowledge, Signals or TrendTopics path and null previous hash",
      )
    const preserved = applied?.notes.find((note) => note.path === relative)
    const before = preserved
      ? preserved.before_content === null
        ? null
        : Buffer.from(preserved.before_content, "utf8")
      : creating
        ? (assertAbsent(vault, relative), null)
        : fs.readFileSync(safePath(vault, relative))
    const original = before === null ? null : parseNote(before.toString("utf8")),
      next = parseNote(n.content)
    if (!creating && sha256(before) !== n.previous_sha256)
      throw Error("Canonical note changed after review: " + relative)
    const facts = n.evidence.flatMap((e) => {
      if (
        Object.keys(e).some((k) => !["run_id", "claim_ids"].includes(k)) ||
        !Array.isArray(e.claim_ids) ||
        !e.claim_ids.length ||
        new Set(e.claim_ids).size !== e.claim_ids.length
      )
        throw Error("Exact reviewed claim references required")
      const source = sources.find((s) => s.run === e.run_id)
      return e.claim_ids.map((id) => {
        const claim = source?.claims?.find((c) => c.claim_id === id)
        if (!claim) throw Error("Note references an unknown reviewed fact")
        assertVerifiedClaim(claim, source.parses)
        return { source, claim }
      })
    })
    assertReviewDate(decision.reviewed_at, {
      notBefore: facts.flatMap(({ source, claim }) => [
        claim.review.reviewed_at,
        ...source.documents.map((d) => d.observed_at),
      ]),
    })
    const sourceURLs = new Set(
      facts.flatMap(({ source, claim }) =>
        claim.evidence.map(
          (e) =>
            source.documents.find((d) => d.source_version_id === e.source_version_id)?.original_url,
        ),
      ),
    )
    if (creating && relative.startsWith("Knowledge/")) {
      assertNewConceptMetadata(next.meta, { reviewDay, sourceURLs })
      assertNewConceptBody(next)
    }
    if (relative.startsWith("Knowledge/")) {
      if (
        (!creating && original.meta.entry_type !== "concept") ||
        next.meta.entry_type !== "concept" ||
        next.meta.schema_version !== "tech-encyclopedia/v2" ||
        (!creating && next.meta.concept_id !== original.meta.concept_id) ||
        !nonempty(next.meta.concept_id) ||
        next.meta.last_reviewed !== reviewDay ||
        next.meta.map_review?.reviewed !== reviewDay ||
        !Array.isArray(next.meta.verified_sources) ||
        !next.meta.verified_sources.length ||
        next.meta.verified_sources.some((u) => !sourceURLs.has(u))
      )
        throw Error("Canonical concept identity and reviewed sources must be retained")
      const names = next.meta.aliases || []
      if (
        !Array.isArray(names) ||
        names.some((s) => !nonempty(s)) ||
        new Set(names.map(exactName)).size !== names.length
      )
        throw Error("Distinct exact concept aliases required")
      assertConceptConnections(next.meta, sourceURLs)
    } else if (relative.startsWith("TrendTopics/")) {
      if (
        next.meta.schema_version !== "tech-trend/v1" ||
        (!creating && next.meta.id !== original.meta.id) ||
        next.meta.reviewed !== reviewDay ||
        !Array.isArray(next.meta.knowledge_notes) ||
        !Array.isArray(next.meta.lessons)
      )
        throw Error("Topic identity and current review day required")
      if (creating) {
        const fields = [
          "schema_version",
          "type",
          "id",
          "title",
          "question",
          "thesis",
          "watch_for",
          "disconfirming",
          "reviewed",
          "reader_format",
          "knowledge_notes",
          "lessons",
        ]
        if (
          next.meta.type !== "trend-topic-source" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.meta.id || "") ||
          relative !== `TrendTopics/${next.meta.id}.md` ||
          Object.keys(next.meta).some((key) => !fields.includes(key)) ||
          ["title", "question", "thesis", "watch_for", "disconfirming"].some(
            (key) => !nonempty(next.meta[key]),
          ) ||
          (next.meta.reader_format !== undefined &&
            next.meta.reader_format !== "source-events/v1") ||
          ![...sourceURLs].some((url) => next.body.includes(url))
        )
          throw Error(
            "New topic requires a fixed identity, complete source-bound content and an original source link",
          )
        if (
          !historical &&
          walk(path.join(vault, "TrendTopics"))
            .filter(
              (file) =>
                file.endsWith(".md") && path.resolve(file) !== path.resolve(vault, relative),
            )
            .some((file) => parseNote(fs.readFileSync(file, "utf8")).meta.id === next.meta.id)
        )
          throw Error("Duplicate topic identity in authority vault")
      }
    } else {
      if (
        next.meta.schema_version !== "tech-signals/v1" ||
        (creating
          ? relative !== `Signals/${next.meta.edition?.split("/").at(-1)}.md` ||
            !/^Editions\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}_(?:[01]\d|2[0-3])[0-5]\d_Tech_AI_Briefing$/.test(
              next.meta.edition || "",
            ) ||
            next.meta.date !== next.meta.edition.split("/").at(-1).slice(0, 10) ||
            !next.body.includes(`[[${next.meta.edition}`)
          : next.meta.edition !== original.meta.edition || next.meta.date !== original.meta.date) ||
        next.meta.reviewed !== reviewDay ||
        (creating && next.meta.review_basis !== "primary-research") ||
        !Array.isArray(next.meta.observations)
      )
        throw Error("Observation edition and date must be retained")
      const ids = new Set(next.meta.observations.map((s) => s.id))
      if (!creating && (original.meta.observations || []).some((s) => !ids.has(s.id)))
        throw Error("Prior observations must be retained")
      const { bindings, articles } =
        creating || next.meta.observations.some((row) => row.occurred_at !== undefined)
          ? signalEventBindings(root, facts, next.meta.observations, vault, historical)
          : { bindings: [], articles: [] }
      for (const observation of next.meta.observations) {
        const matching = bindings.filter(
          (b) => b.event_id === observation.event_id && b.event_date === observation.event_date,
        )
        // Source-only reviews keep their original three-file approval shape.
        // Every consumed article approval is pinned, even if its ID is a URL ID.
        for (const binding of matching)
          if (binding.approval_run)
            signalApprovalFiles.set(binding.approval_run, binding.approval_files)
      }
      if (creating) {
        // An explicit, source-bound review may find no useful trend observation.
        // Missing review/evidence remains invalid; never manufacture a judgment.
        if (ids.size !== next.meta.observations.length)
          throw Error("New Signals review requires distinct source-bound observations")
        const events = new Set(bindings.map((b) => `${b.event_id}:${b.event_date}`))
        for (const observation of next.meta.observations)
          if (
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(observation.id || "") ||
            !events.has(`${observation.event_id}:${observation.event_date}`) ||
            !["support", "challenge", "context"].includes(observation.stance) ||
            ["topic_id", "change", "meaning", "limit", "next_check"].some(
              (key) => !nonempty(observation[key]),
            )
          )
            throw Error(
              "New Signals observation needs a reviewed source event and complete judgment",
            )
      }
      // Source-only fact review never becomes an article approval. An actual
      // article approval also constrains the same event's optional actual day.
      for (const observation of next.meta.observations) {
        if (observation.occurred_at === undefined) continue
        const prior = original?.meta.observations?.find((row) => row.id === observation.id)
        // A legacy ledger may have stored the actual day in event_date. Split
        // it only when that same day is preserved as occurred_at; the exact
        // reviewed publication/effective-period checks below still apply.
        const legacyDateSplit =
          prior?.occurred_at === undefined &&
          prior?.source_published_at === undefined &&
          prior?.event_id === observation.event_id &&
          prior?.event_date === observation.occurred_at
        if (
          prior &&
          (prior.event_id !== observation.event_id ||
            (prior.event_date !== observation.event_date && !legacyDateSplit) ||
            (prior.source_published_at !== undefined &&
              prior.source_published_at !== observation.source_published_at))
        )
          throw Error("Signal event identity and source publication date must be retained")
        assertBoundSignalOccurredAt(observation, bindings, articles)
      }
    }
    return {
      ...(v2 ? { operation: n.operation } : {}),
      path: relative,
      previous_sha256: n.previous_sha256,
      before_content: before === null ? null : before.toString("utf8"),
      content: n.content,
      sha256: sha256(n.content),
      evidence: n.evidence,
    }
  })
  if (historical) assertPreservedConceptIdentities(approved)
  else assertConceptConflicts(vault, approved)
  return {
    schema: v2 ? "approved-knowledge-notes/v2" : "approved-knowledge-notes/v1",
    reviewed_at: decision.reviewed_at,
    reviewer: decision.reviewer,
    vault: path.resolve(sourceVault),
    notes: approved,
    source_files: sources.map(({ run, files }) => ({
      run,
      files: { ...files, ...(signalApprovalFiles.get(run) || {}) },
    })),
    candidate_published: false,
    drive_verified: false,
  }
}

export async function approveNoteReview(root, run, decision, options = {}) {
  validRun(run)
  const approval = evaluateNoteReview(root, decision, options)
  const state = new RunState(
    root,
    run,
    {
      decision,
      approval,
      implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    },
    { scope: "note-review" },
  )
  const result = await state.stage("approved", { decision, approval }, () => approval)
  atomicWrite(root, `runs/${run}/note-review.json`, decision)
  atomicWrite(root, `runs/${run}/approved-notes.json`, result)
  return {
    notes: result.notes.length,
    reviewed_at: result.reviewed_at,
    candidate_published: false,
    drive_verified: false,
  }
}

export function loadNoteApproval(root, run, { vault = "vault" } = {}) {
  validRun(run)
  const decisionBytes = fs.readFileSync(safePath(root, `runs/${run}/note-review.json`))
  const bytes = fs.readFileSync(safePath(root, `runs/${run}/approved-notes.json`))
  const stored = JSON.parse(bytes)
  const current = evaluateNoteReview(root, JSON.parse(decisionBytes), {
    vault,
    sourceVault: stored.vault || vault,
  })
  if (sha256(JSON.stringify(current)) !== sha256(JSON.stringify(stored)))
    throw Error("Saved knowledge approval differs from current evidence")
  return {
    run,
    approval: current,
    files: { review_sha256: sha256(decisionBytes), approval_sha256: sha256(bytes) },
  }
}

// Reading a completed transfer is separate from authorizing a replacement.
// Every destination must be exactly applied; mixed or changed states fail closed.
export function loadAppliedNoteApproval(root, run, { vault = "vault" } = {}) {
  return readPreservedNoteApproval(root, run, vault, true)
}

// Read-only evidence lookup. Original before/after bytes and source reviews
// remain mandatory even when the current canonical note has since changed.
export function loadHistoricalNoteApproval(root, run, { vault = "vault" } = {}) {
  return readPreservedNoteApproval(root, run, vault, false)
}

function readPreservedNoteApproval(root, run, vault, requireApplied) {
  validRun(run)
  const decisionBytes = fs.readFileSync(safePath(root, `runs/${run}/note-review.json`))
  const bytes = fs.readFileSync(safePath(root, `runs/${run}/approved-notes.json`))
  const decision = JSON.parse(decisionBytes)
  const stored = JSON.parse(bytes)
  if (
    !Array.isArray(stored.notes) ||
    !stored.notes.length ||
    stored.notes.length !== decision.notes?.length ||
    new Set(stored.notes.map((n) => n.path)).size !== stored.notes.length
  )
    throw Error("Exact applied approval note inventory required")
  for (const note of stored.notes) {
    const relative = notePath(note.path)
    const input = decision.notes.find((n) => n.path === relative)
    const creating = decision.schema === "knowledge-note-review/v2" && input?.operation === "create"
    if (
      !input ||
      note.content !== input.content ||
      sha256(note.content) !== note.sha256 ||
      note.previous_sha256 !== input.previous_sha256 ||
      (creating
        ? note.before_content !== null || note.previous_sha256 !== null
        : typeof note.before_content !== "string" ||
          sha256(note.before_content) !== note.previous_sha256)
    )
      throw Error("Preserved before and approved after bytes differ from the review")
    if (requireApplied && sha256(fs.readFileSync(safePath(vault, relative))) !== note.sha256)
      throw Error("Approval is not fully applied or canonical content changed")
  }
  const current = evaluateNoteReviewInternal(
    root,
    decision,
    { vault, sourceVault: stored.vault || vault, historical: !requireApplied },
    stored,
  )
  if (sha256(JSON.stringify(current)) !== sha256(JSON.stringify(stored)))
    throw Error("Saved applied knowledge approval differs from current evidence")
  return {
    run,
    approval: current,
    files: { review_sha256: sha256(decisionBytes), approval_sha256: sha256(bytes) },
  }
}

export function loadReferencedNoteApproval(root, run, { vault = "vault" } = {}) {
  validRun(run)
  const stored = readJSON(root, `runs/${run}/approved-notes.json`)
  const applied =
    Array.isArray(stored?.notes) &&
    stored.notes.length > 0 &&
    stored.notes.every((n) => {
      const file = safePath(vault, notePath(n.path))
      return fs.existsSync(file) && sha256(fs.readFileSync(file)) === n.sha256
    })
  return applied
    ? loadAppliedNoteApproval(root, run, { vault })
    : loadNoteApproval(root, run, { vault })
}
