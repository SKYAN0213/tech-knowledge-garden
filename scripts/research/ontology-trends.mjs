import { parseNote } from "../garden.mjs"
import { validateTrendRecords } from "../trends.mjs"
import { loadHistoricalNoteApproval } from "./note-review.mjs"
import { sha256 } from "./contracts.mjs"
import { createOntologyReader } from "./ontology.mjs"
import { assertReviewDate, samePublicationDate, seoulPublicationDay } from "./dates.mjs"
import { assertSignalOccurredAt, signalHistoryDate } from "./signal-dates.mjs"

export function prepareTrendReviewRuns(root, runs, options = {}) {
  if (
    !Array.isArray(runs) ||
    runs.length > 64 ||
    new Set(runs).size !== runs.length ||
    runs.some((run) => typeof run !== "string" || !/^[A-Za-z0-9_-]+$/.test(run))
  )
    throw Error("Distinct native trend approval runs required")
  return runs.map((run) => {
    const approval = (options.noteApprovalLoader || loadHistoricalNoteApproval)(root, run, options)
    if (!approval.approval.notes.some((note) => /^(Signals|TrendTopics)\//.test(note.path)))
      throw Error("Trend approval must contain a reviewed signal or topic")
    return { run, files: approval.files }
  })
}

// A projection of existing reviewed Signals/TrendTopics, never a new store or
// an automatic trend judgment. Internal uncertainty and workflow copy stay out.
export function projectApprovedTrends(root, graph, inputs, concepts, runs, options = {}) {
  const reader = createOntologyReader(graph)
  const loader = options.noteApprovalLoader || loadHistoricalNoteApproval
  const paths = new Map()
  const byRun = new Map(inputs.map((input) => [input.run, input]))
  const events = new Map(inputs.map((input) => [input.article.event_id, input]))
  for (const { run } of prepareTrendReviewRuns(root, runs, options)) {
    const loaded = loader(root, run, options)
    for (const note of loaded.approval.notes) {
      if (!/^(Signals|TrendTopics)\//.test(note.path)) continue
      if (sha256(note.content) !== note.sha256) throw Error("Trend note bytes changed")
      const rows = paths.get(note.path) || []
      const duplicate = rows.find((row) => row.note.sha256 === note.sha256)
      if (duplicate) {
        if (JSON.stringify(duplicate.note.evidence) !== JSON.stringify(note.evidence))
          throw Error("Conflicting trend evidence for identical note bytes")
        continue
      }
      rows.push({ note, meta: parseNote(note.content).meta, run, files: loaded.files })
      paths.set(note.path, rows)
    }
  }
  const latest = [...paths.entries()].map(([file, rows]) => {
    // Multiple approved versions must have an explicit before/after chain.
    const tips = rows.filter(
      (row) => !rows.some((next) => next !== row && next.note.previous_sha256 === row.note.sha256),
    )
    if (tips.length !== 1) throw Error("Competing or cyclic trend note versions")
    const chain = [],
      seen = new Set()
    let current = tips[0]
    while (current) {
      if (seen.has(current.note.sha256)) throw Error("Cyclic trend note lineage")
      seen.add(current.note.sha256)
      chain.push(current)
      // A native evidence-only reapproval may preserve the exact note bytes.
      // Its own before hash is not another version or a lineage edge.
      const prior = rows.filter(
        (row) => row !== current && row.note.sha256 === current.note.previous_sha256,
      )
      if (prior.length > 1) throw Error("Conflicting trend note lineage")
      current = prior[0]
    }
    if (seen.size !== rows.length) throw Error("Disconnected trend note versions")
    if (chain.some((row, i) => i && row.meta.reviewed > chain[i - 1].meta.reviewed))
      throw Error("Trend note lineage reverses review dates")
    // Only the current note's facts become current dependencies. Historical
    // before/after bytes and their native source reviews were checked by the
    // approval loader; a retired article run must not block its replacement.
    const facts = tips[0].note.evidence.flatMap((ref) => {
      const input = byRun.get(ref.run_id)
      if (!input) throw Error("Trend source is not a current approved graph article")
      return ref.claim_ids.map((id) => {
        const trace = reader.traceClaim(id, input.run)
        if (trace.event.id !== `event:${input.article.event_id}`)
          throw Error("Trend fact belongs to another event")
        return { input, trace }
      })
    })
    return { ...tips[0], facts, file, previous: chain.slice(1) }
  })
  const topics = latest.filter((row) => row.file.startsWith("TrendTopics/"))
  const reviews = latest.filter((row) => row.file.startsWith("Signals/"))
  const issues = reviews
    .map((row) => {
      for (const signal of row.meta.observations) {
        const input = events.get(signal.event_id)
        if (
          !input ||
          // A reviewed article may retain the publisher's calendar day or
          // explicitly use the Korean day. Preserve the exact claim timestamp
          // below; do not replace it with either display date.
          (!samePublicationDate(input.article.article_review.published_at, signal.event_date) &&
            seoulPublicationDay(signal.event_date) !== input.article.article_review.published_at) ||
          !row.facts.some(
            (fact) =>
              fact.input.article.event_id === signal.event_id &&
              samePublicationDate(signal.event_date, fact.trace.claim.published_at),
          )
        )
          throw Error("Trend observation lacks its exact approved event/date/evidence")
        assertSignalOccurredAt(signal, {
          facts: row.facts.map(({ input, trace }) => ({
            event_id: input.article.event_id,
            claim: trace.claim,
          })),
          articles: [input.article],
        })
        assertReviewDate(row.meta.reviewed, { notBefore: [signal.event_date] })
      }
      return {
        key: row.meta.edition,
        date: row.meta.date,
        items: row.meta.observations.map((signal) => {
          const article = events.get(signal.event_id).article
          return {
            id: article.event_id,
            title: article.title,
            urls: article.source_urls,
            review: article.article_review,
          }
        }),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
  const conceptPaths = new Map(
    concepts.map((concept) => [concept.current.note_path.replace(/\.md$/, ""), concept.concept_id]),
  )
  const selectedTopics = new Set(topics.map((row) => row.meta.id))
  const data = validateTrendRecords(
    topics.map((row) => ({ ...row.meta, file: row.file })),
    // A complete approved ledger can reference topics still being migrated.
    // Validate every source/event/date above, but only project observations
    // whose topic has an explicitly selected native approval. The original
    // ledger remains intact; this is not a reviewed-empty judgment.
    reviews.map((row) => ({
      ...row.meta,
      file: row.file,
      observations: row.meta.observations.filter((signal) => selectedTopics.has(signal.topic_id)),
    })),
    issues,
    { requireLatest: false, knowledgeResolver: (p) => conceptPaths.has(p) },
  )
  return topics
    .map((row) => {
      const signals = data.signals.filter((signal) => signal.topic_id === row.meta.id)
      for (const lesson of row.meta.lessons) {
        const dates = lesson.signal_ids.map((id) => {
          return signalHistoryDate(signals.find((signal) => signal.id === id))
        })
        if (new Set(dates).size < 2)
          throw Error("Trend analysis requires two actual source event dates")
      }
      const history = signals
        .map((signal) => {
          const review = reviews.find((item) => item.meta.edition === signal.issue)
          const input = events.get(signal.event_id)
          const facts = review.facts.filter(
            (fact) => fact.input.article.event_id === signal.event_id,
          )
          return {
            observation_id: signal.id,
            event_id: signal.event_id,
            title: input.article.title,
            published_at: input.article.article_review.published_at,
            source_published_at: signal.event_date,
            ...(signal.occurred_at !== undefined ? { occurred_at: signal.occurred_at } : {}),
            reviewed_at: signal.reviewed,
            change: signal.change,
            stance: signal.stance,
            article_path: `news/${signal.event_id}`,
            source_urls: input.article.source_urls,
            facts: facts.map(({ trace }) => ({
              claim_id: trace.claim.claim_id,
              statement: trace.claim.statement,
              event_state: trace.claim.event_state,
              effective_period: trace.claim.effective_period,
              numbers: trace.claim.numbers,
              evidence: trace.evidence,
            })),
          }
        })
        .sort(
          (a, b) =>
            signalHistoryDate(b).localeCompare(signalHistoryDate(a)) ||
            a.observation_id.localeCompare(b.observation_id),
        )
      return {
        topic_id: row.meta.id,
        title: row.meta.title,
        question: row.meta.question,
        reviewed_at: row.meta.reviewed,
        topic_path: `briefings/topics/${row.meta.id}`,
        note_approval: { run: row.run, path: row.file, sha256: row.note.sha256, files: row.files },
        // An approved topic may precede migration of its complete Signals
        // ledger. Keep its exact article facts without inventing observations.
        source_facts: row.facts.map(({ input, trace }) => ({
          run: input.run,
          event_id: input.article.event_id,
          article_path: `news/${input.article.event_id}`,
          claim_id: trace.claim.claim_id,
          statement: trace.claim.statement,
          published_at: trace.claim.published_at,
          reviewed_at: trace.claim.reviewed_at,
          event_state: trace.claim.event_state,
          effective_period: trace.claim.effective_period,
          numbers: trace.claim.numbers,
          evidence: trace.evidence,
        })),
        ...(history.length ? { history } : {}),
        ...(row.meta.knowledge_notes.length
          ? { concept_ids: row.meta.knowledge_notes.map((p) => conceptPaths.get(p)) }
          : {}),
        ...(row.meta.lessons.length
          ? {
              analyses: row.meta.lessons.map((lesson) => ({
                id: lesson.id,
                text: lesson.claim,
                reviewed_at: lesson.reviewed,
                observation_ids: lesson.signal_ids,
              })),
            }
          : {}),
        ...(row.previous.length
          ? {
              previous_versions: row.previous.map((prior) => ({
                sha256: prior.note.sha256,
                title: prior.meta.title,
                reviewed_at: prior.meta.reviewed,
              })),
            }
          : {}),
      }
    })
    .sort((a, b) => a.topic_id.localeCompare(b.topic_id))
}
