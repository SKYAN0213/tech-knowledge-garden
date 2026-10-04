import { sha256 } from "./contracts.mjs"
import { draftFingerprint } from "./editor.mjs"

// Deterministic editorial checks only. Shared references are a prompt to read,
// not a semantic duplicate verdict or a substitute for source review.
const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" })
export function readerSentences(text) {
  const result = []
  for (const part of segmenter.segment(text.normalize("NFC"))) {
    const sentence = part.segment.trim()
    if (!sentence) continue
    if (result.length && /^(?:[”’"')\]]*)(?:이라고|라고|라며|고|며)\s/.test(sentence))
      result[result.length - 1] += sentence
    else result.push(sentence)
  }
  return result
}

const day = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
function hasDate(text, date) {
  const [year, month, dateDay] = date.split("-").map(Number)
  const full = new RegExp(`(?<!\\d)${year}[./-]0?${month}[./-]0?${dateDay}(?!\\d)`)
  const korean = new RegExp(`(?<!\\d)(?:${year}년\\s*)?0?${month}월\\s*0?${dateDay}일(?!\\d)`)
  return full.test(text) || korean.test(text)
}
const normalizeSentence = (text) => text.normalize("NFC").replace(/\s+/g, " ").trim()

export function inspectReaderQuality(record, claims, { publishedAt = null } = {}) {
  const draft = record.draft
  if (record.draft_id !== draftFingerprint(draft, record.deep_context))
    throw Error("Reader quality requires the exact draft")
  const lead = draft.lead.map((s) => s.text).join(" ")
  const leadSentences = readerSentences(lead)
  const findings = []
  const add = (code, severity, locations, details = {}) =>
    findings.push({ code, severity, locations, ...details })
  if (leadSentences.length < 2 || leadSentences.length > 4)
    add("lead_sentence_count", "block", ["lead"], { actual: leadSentences.length, min: 2, max: 4 })
  if ([...lead].length > 900)
    add("lead_length", "block", ["lead"], { actual: [...lead].length, max: 900 })
  const references = new Set(draft.lead.flatMap((s) => s.claim_ids))
  const dates = [
    ...new Set(
      [
        publishedAt,
        draft.facts.when,
        ...claims
          .filter((c) => references.has(c.claim_id) && c.review.status === "verified")
          .map((c) => c.published_at),
      ].filter(day),
    ),
  ]
  if (dates.length && !dates.some((date) => hasDate(lead, date)))
    add("lead_date_missing", "block", ["lead"], { known_dates: dates })
  const paragraphs = [
    ...draft.lead.map((s, i) => ({ ...s, location: `lead[${i}]` })),
    ...draft.explanations.flatMap((e, i) =>
      e.paragraphs.map((p, j) => ({
        ...p,
        location: `explanations[${i}].paragraphs[${j}]`,
      })),
    ),
    ...(draft.analysis ? [{ ...draft.analysis, location: "analysis" }] : []),
  ]
  const seen = new Map()
  for (const paragraph of paragraphs) {
    for (const sentence of readerSentences(paragraph.text)) {
      const key = normalizeSentence(sentence)
      if (seen.has(key)) add("repeated_sentence", "block", [seen.get(key), paragraph.location])
      else seen.set(key, paragraph.location)
    }
    if (
      paragraph.location.startsWith("explanations") &&
      paragraph.claim_ids.some((id) => references.has(id))
    )
      add("lead_explanation_shared_facts", "review", ["lead", paragraph.location], {
        claim_ids: paragraph.claim_ids.filter((id) => references.has(id)),
      })
  }
  return {
    schema: "research-reader-quality/v1",
    draft_id: record.draft_id,
    draft_sha256: sha256(JSON.stringify(draft)),
    lead_sentences: leadSentences.length,
    lead_characters: [...lead].length,
    findings,
    blocked: findings.some((f) => f.severity === "block"),
    requires_repetition_review: findings.some((f) => f.severity === "review"),
    candidate_published: false,
  }
}

export function assertReaderQuality(report, decision) {
  if (report.blocked)
    throw Error(
      "Reader quality blocks approval: " +
        [...new Set(report.findings.filter((f) => f.severity === "block").map((f) => f.code))].join(
          ", ",
        ),
    )
  if (
    report.requires_repetition_review &&
    decision.reader_quality_review?.repetition_checked !== true
  )
    throw Error("Explicit repetition review required for shared lead/explanation facts")
}
