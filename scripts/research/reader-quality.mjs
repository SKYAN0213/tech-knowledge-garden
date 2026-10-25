import { sha256 } from "./contracts.mjs"
import { draftFingerprint, inspectLeadRepetition } from "./editor.mjs"
import { parseResearchDate, seoulPublicationDay } from "./dates.mjs"
import { inspectEditorialCompleteness } from "./editorial-completeness.mjs"

// Deterministic editorial checks only. Shared references are a prompt to read,
// not a semantic duplicate verdict or a substitute for source review.
const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" })
export function readerSentences(text) {
  const result = []
  const normalized = text.normalize("NFC")
  // A leading period in .NET is an identifier, not a Korean sentence end.
  // Mask only that character while segmenting, then read the original span.
  const segmentation = normalized.replace(/(?<=^|\s)\.(?=NET\b)/gu, "\uE000")
  for (const part of segmenter.segment(segmentation)) {
    const original = normalized.slice(part.index, part.index + part.segment.length)
    // Unicode sentence rules can treat a period followed by lowercase Latin
    // text as an abbreviation, even after a complete Korean sentence.
    // Split these Korean endings without touching decimals, versions or URLs.
    for (const segment of original.split(/(?<=(?:다|요|죠)[.!?])\s+(?=[a-z])/u)) {
      const sentence = segment.trim()
      if (!sentence) continue
      if (result.length && /^(?:[”’"')\]]*)(?:이라고|라고|라며|고|며)\s/.test(sentence))
        result[result.length - 1] += sentence
      else result.push(sentence)
    }
  }
  return result
}

const publicationDay = (value) => {
  const date = parseResearchDate(value)
  return date?.precision === "timestamp" ? seoulPublicationDay(value) : date?.day
}
function hasDate(text, date) {
  const [year, month, dateDay] = date.split("-").map(Number)
  const full = new RegExp(`(?<!\\d)${year}[./-]0?${month}[./-]0?${dateDay}(?!\\d)`)
  const korean = new RegExp(`(?<!\\d)(?:${year}년\\s*)?0?${month}월\\s*0?${dateDay}일(?!\\d)`)
  return full.test(text) || korean.test(text)
}
const normalizeSentence = (text) => text.normalize("NFC").replace(/\s+/g, " ").trim()

// Compare explicit percentages with the facts cited by this paragraph, never
// with incidental numbers elsewhere in an evidence block or another article.
// This is a value/unit check, not a verdict on metric, period or causality.
const ratePattern =
  /(?<![\d.,eE])([+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%\s*(?:p|points?|포인트)|퍼센트\s*포인트|(?:percentage|percent)[\s‐‑–-]+points?|pp|%|퍼센트|percent)(?![a-z])/giu
function rateUnit(unit) {
  const normalized = unit
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[-‐‑–]/g, " ")
    .replace(/\s+/g, " ")
  if (["%", "퍼센트", "percent"].includes(normalized)) return "percent"
  if (
    /^(?:%\s*(?:p|points?|포인트)|퍼센트\s*포인트|(?:percent|percentage) points?|pp)$/.test(
      normalized,
    )
  )
    return "percentage_point"
  return null
}
function rateValue(value) {
  const normalized = value.normalize("NFKC").trim().replaceAll("−", "-")
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(normalized)) return null
  const negative = normalized.startsWith("-")
  const [whole, fraction = ""] = normalized.replace(/^[+-]/, "").replaceAll(",", "").split(".")
  const integer = whole.replace(/^0+(?=\d)/, ""),
    decimal = fraction.replace(/0+$/, "")
  const magnitude = integer + (decimal ? "." + decimal : "")
  return (negative && magnitude !== "0" ? "-" : "") + magnitude
}
function explicitRates(text) {
  return [
    ...text
      .normalize("NFKC")
      .replace(/https?:\/\/\S+/g, " ")
      .matchAll(ratePattern),
  ].map((match) => ({ value: rateValue(match[1]), unit: rateUnit(match[2]) }))
}
function rateKey(rate) {
  return rate.unit + ":" + rate.value
}
function supportedRates(claims) {
  return new Set(
    claims
      .filter((c) => c.review.status === "verified")
      .flatMap((c) => [
        ...explicitRates(c.statement || "").map(rateKey),
        ...(c.numbers || []).flatMap((n) => {
          const unit = rateUnit(n.unit),
            value = rateValue(n.literal)
          if (!unit) return []
          return value !== null
            ? [rateKey({ unit, value })]
            : explicitRates(n.literal)
                .filter((rate) => rate.unit === unit)
                .map(rateKey)
        }),
      ]),
  )
}

// Nominal amounts only: exact decimal/scaling arithmetic, never FX conversion.
// Qualified dollar currencies remain distinct from an unqualified "$"/달러.
const currencyAliases = {
  KRW: ["KRW", "₩", "원", "Korean won", "won"],
  USD: ["USD", "US$", "미국 달러", "미달러"],
  dollar: ["$", "달러", "dollars?"],
  EUR: ["EUR", "€", "유로", "euros?"],
  JPY: ["JPY", "엔", "yen", "円"],
  currency_symbol_yen_yuan: ["¥"],
  CNY: ["CNY", "RMB", "위안", "yuan", "元"],
  GBP: ["GBP", "£", "파운드", "pounds?"],
  CAD: ["CAD", "CA$", "캐나다 달러"],
  AUD: ["AUD", "AU$", "호주 달러"],
  HKD: ["HKD", "HK$", "홍콩 달러"],
  SGD: ["SGD", "SG$", "싱가포르 달러"],
}
const currencyPatterns = Object.entries(currencyAliases).map(([unit, aliases]) => ({
  unit,
  pattern: aliases
    .map((alias) =>
      alias.includes("?")
        ? alias
        : alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*"),
    )
    .join("|"),
}))
const currencyPattern = currencyPatterns.map((c) => c.pattern).join("|")
const amountScalePowers = {
  trillion: 12,
  billion: 9,
  million: 6,
  thousand: 3,
  兆: 12,
  億: 8,
  亿: 8,
  万: 4,
  조: 12,
  천억: 11,
  백억: 10,
  십억: 9,
  억: 8,
  천만: 7,
  백만: 6,
  십만: 5,
  만: 4,
  천: 3,
  백: 2,
  십: 1,
  t: 12,
  b: 9,
  m: 6,
  k: 3,
}
const amountScalePattern = Object.keys(amountScalePowers).join("|")
const numericPattern = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?"
const amountTerm = `${numericPattern}\\s*(?:${amountScalePattern})?`
const amountExpression = `[+−-]?${amountTerm}(?:\\s*${amountTerm})*`
const amountPrefixPattern = new RegExp(
  `(${currencyPattern})\\s*(${amountExpression})(?!\\d|[.,]\\d|[a-z])`,
  "giu",
)
const amountSuffixPattern = new RegExp(
  // Currency names may take Korean particles, but must not consume the start
  // of a technical word such as "1 엔드포인트" or "1 원칙".
  `(?<![\\d.,a-z])(${amountExpression})\\s*(${currencyPattern})(?=$|[^\\p{L}\\p{N}]|[이가은는을를의과와에로]|으로|보다|만|씩)`,
  "giu",
)
function amountUnit(raw) {
  return currencyPatterns.find((c) => new RegExp(`^(?:${c.pattern})$`, "iu").test(raw))?.unit
}
function amountValue(raw) {
  const text = raw.normalize("NFKC").trim().replaceAll("−", "-"),
    negative = text.startsWith("-"),
    unsigned = text.replace(/^[+-]/, "")
  const pattern = new RegExp(`(${numericPattern})\\s*(${amountScalePattern})?`, "giu")
  const terms = [...unsigned.matchAll(pattern)]
  if (!terms.length || unsigned.replace(pattern, "").trim()) return null
  const numbers = terms.map((m) => {
    const value = rateValue(m[1]),
      [whole, fraction = ""] = value.split(".")
    return {
      coefficient: BigInt(whole + fraction),
      power: (amountScalePowers[(m[2] || "").toLowerCase()] || 0) - fraction.length,
    }
  })
  const power = Math.min(0, ...numbers.map((n) => n.power))
  let digits = numbers
    .reduce((sum, n) => sum + n.coefficient * 10n ** BigInt(n.power - power), 0n)
    .toString()
  if (power < 0) {
    digits = digits.padStart(1 - power, "0")
    digits = digits.slice(0, power) + "." + digits.slice(power)
  }
  return rateValue((negative ? "-" : "") + digits)
}
function explicitAmounts(raw) {
  const text = raw.normalize("NFKC").replace(/https?:\/\/\S+/g, " ")
  return [
    ...[...text.matchAll(amountPrefixPattern)].map((m) => ({
      unit: amountUnit(m[1]),
      value: amountValue(m[2]),
    })),
    ...[...text.matchAll(amountSuffixPattern)].map((m) => ({
      unit: amountUnit(m[2]),
      value: amountValue(m[1]),
    })),
  ].filter((a) => a.unit && a.value !== null)
}
function supportedAmounts(claims) {
  return new Set(
    claims
      .filter((c) => c.review.status === "verified")
      .flatMap((c) => [
        ...explicitAmounts(c.statement || "").map(rateKey),
        ...(c.numbers || []).flatMap((n) => {
          const declared =
            amountUnit(n.unit.normalize("NFKC").trim()) ||
            amountUnit(
              n.unit
                .normalize("NFKC")
                .trim()
                .replace(new RegExp(`^(?:${amountScalePattern})\\s*`, "iu"), ""),
            )
          if (!declared) return []
          const literal = explicitAmounts(n.literal)
          const amounts = literal.length ? literal : explicitAmounts(`${n.literal} ${n.unit}`)
          return amounts.filter((a) => a.unit === declared).map(rateKey)
        }),
      ]),
  )
}

// Explicit counts only. Match value and object against cited verified facts,
// not incidental figures in source quotations. Conditions and attribution still
// require source review; this is not a semantic entailment decision.
const countPatterns = [
  [
    "person",
    "(?:명|인)(?=$|[^\\p{L}\\p{N}]|[이가은는을를의과와에]|보다|만|씩)|people|persons?|patients?|participants?|security\\s+leaders|leaders|researchers?|employees?|workers?(?!\\s+(?:processes?|threads?|nodes?|agents?|instances?)\\b)",
  ],
  ["organization", "(?:개\\s*)?조직|organizations?"],
  [
    "company",
    "(?:개\\s*)?(?:(?:로봇|관련|상장|국내|해외|기술|글로벌)\\s*){0,3}(?:기업|업체)|companies|firms?",
  ],
  ["stock", "(?:개\\s*)?종목|stocks?"],
  ["session", "(?:개\\s*)?세션|sessions?"],
  ["workshop", "(?:개\\s*)?(?:실습\\s*)?워크숍|(?:hands-on\\s+)?workshops?"],
].map(([unit, pattern]) => ({
  unit,
  regex: new RegExp(
    `(?<![\\d.,a-z])(${amountExpression})\\s*(?:\\+\\s*)?(?:(?:개(?:가|를)?\\s*)?(?:넘는|초과(?:의)?|이상(?:의)?|이하(?:의)?|미만(?:의)?)\\s*)?(${pattern})(?![a-z])`,
    "giu",
  ),
}))
function explicitCounts(raw) {
  const text = raw.normalize("NFKC").replace(/https?:\/\/\S+/g, " ")
  return countPatterns
    .flatMap(({ unit, regex }) =>
      [...text.matchAll(regex)].map((m) => ({ unit, value: amountValue(m[1]) })),
    )
    .filter((count) => count.value !== null)
}
function supportedCounts(claims) {
  return new Set(
    claims
      .filter((c) => c.review.status === "verified")
      .flatMap((c) => [
        ...explicitCounts(c.statement || ""),
        ...(c.numbers || []).flatMap((n) => explicitCounts(`${n.literal} ${n.unit}`)),
      ])
      .map(rateKey),
  )
}

export function inspectReaderQuality(record, claims, { publishedAt = null } = {}) {
  const draft = record.draft
  if (record.draft_id !== draftFingerprint(draft, record.deep_context))
    throw Error("Reader quality requires the exact draft")
  const lead = draft.lead.map((s) => s.text).join(" ")
  const leadSentences = readerSentences(lead)
  const findings = inspectLeadRepetition(draft)
  const completeness = inspectEditorialCompleteness(record, claims)
  if (completeness) findings.push(...completeness.findings)
  const add = (code, severity, locations, details = {}) =>
    findings.push({ code, severity, locations, ...details })
  if (leadSentences.length < 2 || leadSentences.length > 4)
    add("lead_sentence_count", "block", ["lead"], { actual: leadSentences.length, min: 2, max: 4 })
  if ([...lead].length > 900)
    add("lead_length", "block", ["lead"], { actual: [...lead].length, max: 900 })
  const references = new Set(draft.lead.flatMap((s) => s.claim_ids))
  const sourceDates = [
    publishedAt,
    ...claims
      .filter((c) => references.has(c.claim_id) && c.review.status === "verified")
      .map((c) => c.published_at),
  ]
    .map(publicationDay)
    .filter(Boolean)
  const dates = [
    ...new Set(
      sourceDates.length ? sourceDates : [publicationDay(draft.facts.when)].filter(Boolean),
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
  const citedClaims = (ids) => claims.filter((c) => ids.includes(c.claim_id))
  const rateLocations = [
    ...paragraphs,
    {
      text: draft.title || "",
      claim_ids: paragraphs.flatMap((p) => p.claim_ids),
      location: "title",
    },
    ...Object.entries(draft.facts || {}).map(([key, value]) => ({
      text: value || "",
      claim_ids: paragraphs.flatMap((p) => p.claim_ids),
      location: `facts.${key}`,
    })),
    ...draft.explanations.map((e, i) => ({
      text: e.heading || "",
      claim_ids: e.paragraphs.flatMap((p) => p.claim_ids),
      location: `explanations[${i}].heading`,
    })),
  ]
  for (const location of rateLocations) {
    const countFacts = supportedCounts(citedClaims(location.claim_ids))
    const unknownCounts = explicitCounts(location.text).filter(
      (count) => !countFacts.has(rateKey(count)),
    )
    if (unknownCounts.length)
      add("unsupported_count", "block", [location.location], {
        values: [...new Map(unknownCounts.map((c) => [rateKey(c), c])).values()],
        claim_ids: location.claim_ids,
      })
    const amountFacts = supportedAmounts(citedClaims(location.claim_ids))
    const unknownAmounts = explicitAmounts(location.text).filter(
      (amount) => !amountFacts.has(rateKey(amount)),
    )
    if (unknownAmounts.length)
      add("unsupported_amount", "block", [location.location], {
        values: [...new Map(unknownAmounts.map((a) => [rateKey(a), a])).values()],
        claim_ids: location.claim_ids,
      })
    const allowed = supportedRates(citedClaims(location.claim_ids))
    const unsupported = explicitRates(location.text).filter((rate) => !allowed.has(rateKey(rate)))
    if (unsupported.length)
      add("unsupported_percentage", "block", [location.location], {
        values: [...new Map(unsupported.map((rate) => [rateKey(rate), rate])).values()],
        claim_ids: location.claim_ids,
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
    ...(completeness ? { completeness } : {}),
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
  if (report.completeness && !decision.completeness_review)
    throw Error("Explicit important fact coverage review required for this exact draft")
}
