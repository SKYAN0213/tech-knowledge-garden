import { sections } from "./garden.mjs"
import { topicPath } from "./briefings.mjs"
import { markdownProseText } from "./explanations.mjs"
import { parseResearchDate } from "./research/dates.mjs"
import { isLearningTerm } from "../web/graph-model.mjs"

const unique = (values) => [...new Set(values)]
const string = (value) => (typeof value === "string" ? value.trim() : "")
const validDay = (value) => parseResearchDate(value)?.precision === "day"
const normalize = (value) => string(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ")
const empty = /^(?:없음|해당 없음|미기재|미확인|알 수 없음|null|undefined|-)$/u
const byDate = (a, b) =>
  b.published_at.localeCompare(a.published_at) || a.event_id.localeCompare(b.event_id)
const safeSource = (value) => {
  if (!/^https?:\/\//i.test(string(value))) return false
  try {
    const url = new URL(value)
    return !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}
const sources = (values = []) => unique(Array.isArray(values) ? values.filter(safeSource) : [])
export const readerKnowledgeText = (value) => {
  const text = markdownProseText(string(value))
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, path, label) => label || path.split("/").at(-1).split("#")[0],
    )
    .replace(/\[(?:원문(?:\s*\d+)?|근거)\]\(https?:[^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[S\d+\]/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim()
  return empty.test(text) ? "" : text
}

const hasPrivateProvenance = (article) =>
  article.candidate_published === false ||
  article.private === true ||
  article.visibility === "private" ||
  /^research-/.test(article.schema || "") ||
  /(?:^|\/)\.local(?:\/|$)/.test(String(article.edition?.file || ""))

function publicArticle(article, excluded) {
  if (
    !article ||
    excluded.has(article.id) ||
    hasPrivateProvenance(article) ||
    article.review?.review_status !== "verified" ||
    article.review.event_id !== article.id ||
    !/^[a-f0-9]{16}$/.test(article.id || "") ||
    !validDay(article.review.published_at) ||
    !validDay(article.review.reviewed_at) ||
    (article.review.source_published_at !== undefined &&
      article.review.source_published_at !== null &&
      !parseResearchDate(article.review.source_published_at)) ||
    (article.review.occurred_at !== undefined && !validDay(article.review.occurred_at)) ||
    article.review.reviewed_at < article.review.published_at ||
    article.edition?.meta?.schema_version !== "tech-ai-magazine/v2" ||
    !/^Editions\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\n]+$/.test(article.edition?.slug || "") ||
    !string(article.title) ||
    !sources(article.urls).length
  )
    return false
  return true
}

function eventProjection(article, href) {
  const sourceUrls = sources(article.urls)
  const record = article.editorial || {}
  const facts = Object.fromEntries(
    ["who", "when", "where", "what", "how", "why"].flatMap((key) => {
      const text = readerKnowledgeText(record.facts?.[key])
      return text ? [[key, text]] : []
    }),
  )
  const explanations = (Array.isArray(record.explanations) ? record.explanations : []).flatMap(
    (section) => {
      const heading = readerKnowledgeText(section.heading)
      const paragraphs = Array.isArray(section.paragraphs)
        ? section.paragraphs.map(readerKnowledgeText).filter(Boolean)
        : []
      if (!heading || !paragraphs.length) return []
      const refs = sources(section.source_urls).filter((url) => sourceUrls.includes(url))
      return [{ heading, paragraphs, source_urls: refs.length ? refs : sourceUrls }]
    },
  )
  const lead = readerKnowledgeText(record.lead || article.summary)
  const entities = unique(
    (Array.isArray(article.classification?.entities) ? article.classification.entities : []).filter(
      (name) => !!string(name),
    ),
  )
  const conceptIds = unique(
    (article.review.concept_ids || []).filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)),
  )
  return {
    event_id: article.id,
    article_path: "News/" + article.id,
    url: href("News/" + article.id),
    title: readerKnowledgeText(article.title),
    published_at: article.review.published_at,
    reviewed_at: article.review.reviewed_at,
    ...(article.review.date_kind ? { date_kind: article.review.date_kind } : {}),
    ...(Object.hasOwn(article.review, "source_published_at")
      ? { source_published_at: article.review.source_published_at }
      : {}),
    ...(article.review.occurred_at ? { occurred_at: article.review.occurred_at } : {}),
    ...(string(article.sector) ? { sector: article.sector } : {}),
    ...(string(article.classification?.theme) ? { theme: article.classification.theme } : {}),
    ...(string(article.classification?.secondary_theme)
      ? { secondary_theme: article.classification.secondary_theme }
      : {}),
    tags: unique((article.classification?.event_tags || []).filter((tag) => !!string(tag))),
    entities,
    concept_ids: conceptIds,
    source_urls: sourceUrls,
    facts,
    lead,
    explanations,
    topic_ids: unique(
      (record.topic_ids || []).filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)),
    ),
    briefing_path: article.edition.slug.replace(/^Editions\//, "Briefings/"),
    briefing_date: String(article.edition.meta.date || ""),
  }
}

const definitionSections = {
  scope: "범위",
  components: "핵심 구성 요소",
  mechanism: "작동 원리",
  examples: "실제 예시",
  conditions: "한계와 실패 조건",
  distinctions: "혼동하기 쉬운 개념",
}
function termProjection(note, href) {
  const meta = note?.meta
  if (
    !meta ||
    meta.entry_type !== "concept" ||
    meta.schema_version !== "tech-encyclopedia/v2" ||
    meta.map_review?.decision !== "include"
  )
    return null
  const path = string(note.path).replace(/\.md$/, "")
  if (
    !/^Knowledge\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\n]+$/.test(path) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.concept_id || "") ||
    !validDay(meta.last_reviewed)
  )
    return null
  const parts = sections(note.body || "", 2)
  const definition = readerKnowledgeText(
    parts.find((section) => section.title === "한 문장 정의")?.body || note.definition,
  )
  const sourceUrls = sources(meta.verified_sources)
  if (!definition || !sourceUrls.length || sourceUrls.length !== meta.verified_sources?.length)
    return null
  const node = {
    id: meta.concept_id,
    definition,
    slug: path,
    sources: sourceUrls,
    mapReview: meta.map_review,
  }
  if (!isLearningTerm(node)) return null
  return {
    concept_id: meta.concept_id,
    path,
    url: href(path),
    label: string(meta.label || meta.title),
    aliases: unique((meta.aliases || []).filter((alias) => !!string(alias))),
    keywords: unique((meta.keywords || []).filter((keyword) => !!string(keyword))),
    kind: meta.map_review.kind,
    reviewed_at: meta.last_reviewed,
    definition,
    source_urls: sourceUrls,
    sections: Object.entries(definitionSections).flatMap(([key, heading]) => {
      const text = readerKnowledgeText(parts.find((section) => section.title === heading)?.body)
      return text ? [{ key, heading, text }] : []
    }),
    event_ids: [],
    relations: [],
  }
}

function reviewedTopics(topics, events, terms, href) {
  const eventIds = new Set(events.map((event) => event.event_id))
  const termByPath = new Map(terms.map((term) => [term.path, term.concept_id]))
  const out = []
  for (const raw of topics) {
    if (!raw || typeof raw !== "object") continue
    const topic = raw.meta ? { ...raw.meta, history: raw.history || [] } : raw
    if (
      topic.schema_version !== "tech-trend/v1" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.id || "") ||
      !validDay(topic.reviewed) ||
      !string(topic.title)
    )
      continue
    const sourceHistory = Array.isArray(topic.history) ? topic.history : []
    const history = sourceHistory.filter(
      (row) =>
        eventIds.has(row.event_id) &&
        row.topic_id === topic.id &&
        validDay(row.reviewed) &&
        row.reviewed <= topic.reviewed,
    )
    const ids = unique([
      ...history.map((row) => row.event_id),
      ...events
        .filter((event) => event.topic_ids.includes(topic.id))
        .map((event) => event.event_id),
    ])
    if (!ids.length) continue
    const relatedEvents = events.filter((event) => ids.includes(event.event_id))
    out.push({
      topic_id: topic.id,
      path: topicPath(topic.id),
      url: href(topicPath(topic.id)),
      title: readerKnowledgeText(topic.title),
      reviewed_at: topic.reviewed,
      ...(topic.reader_format === "source-events/v1" &&
      history.length &&
      history.length === sourceHistory.length &&
      readerKnowledgeText(topic.thesis)
        ? { summary: readerKnowledgeText(topic.thesis) }
        : {}),
      concept_ids: unique(
        (topic.knowledge_notes || [])
          .map((p) => termByPath.get(p.replace(/\.md$/, "")))
          .filter(Boolean),
      ),
      event_ids: relatedEvents.map((event) => event.event_id),
      observations: history
        .map((row) => ({
          event_id: row.event_id,
          published_at: relatedEvents.find((event) => event.event_id === row.event_id).published_at,
          text: readerKnowledgeText(row.change),
        }))
        .filter((row) => row.text),
      source_urls: unique(relatedEvents.flatMap((event) => event.source_urls)),
    })
  }
  return out.sort(
    (a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || a.title.localeCompare(b.title, "ko"),
  )
}

function weekPeriod(day) {
  const start = new Date(day + "T12:00:00Z")
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const from = start.toISOString().slice(0, 10)
  start.setUTCDate(start.getUTCDate() + 6)
  return { from, to: start.toISOString().slice(0, 10) }
}
export function readerEventFacts(event) {
  const identity = {
    event_id: event.event_id,
    published_at: event.published_at,
    article_url: event.url,
  }
  return [
    ...(event.lead ? [{ text: event.lead, source_urls: event.source_urls, ...identity }] : []),
    ...event.explanations.flatMap((section) =>
      section.paragraphs.map((text) => ({ text, source_urls: section.source_urls, ...identity })),
    ),
  ]
}

// Pure canonical-public projection. Native candidates, private graphs and
// model/approval files are deliberately not inputs to the deployed reader.
export function buildReaderKnowledge({
  articles,
  knowledge = [],
  topics = [],
  href,
  excludedEventIds = [],
  companyLabels = [],
}) {
  if (
    !Array.isArray(articles) ||
    !Array.isArray(knowledge) ||
    !Array.isArray(topics) ||
    typeof href !== "function" ||
    !Array.isArray(companyLabels) ||
    !Array.isArray(excludedEventIds)
  )
    throw Error("Canonical article/note collections and a public href resolver required")
  const excluded = new Set([
    ...excludedEventIds,
    ...articles.flatMap((article) => article?.edition?.meta?.excluded_events || []),
    ...articles
      .filter((article) => ["excluded", "공개 제외"].includes(article?.review?.review_status))
      .map((article) => article.id),
  ])
  const newest = new Map()
  for (const article of articles) {
    if (!publicArticle(article, excluded)) continue
    const prior = newest.get(article.id)
    const order = article.review.reviewed_at + "|" + String(article.edition.meta.date || "")
    const priorOrder =
      prior && prior.review.reviewed_at + "|" + String(prior.edition.meta.date || "")
    if (!prior || order >= priorOrder) newest.set(article.id, article)
  }
  const events = [...newest.values()].map((article) => eventProjection(article, href)).sort(byDate)
  const terms = knowledge.map((note) => termProjection(note, href)).filter(Boolean)
  const termById = new Map(terms.map((term) => [term.concept_id, term]))
  if (termById.size !== terms.length) throw Error("Duplicate reviewed specialist identity")
  for (const term of terms) {
    term.event_ids = events
      .filter((event) => event.concept_ids.includes(term.concept_id))
      .map((event) => event.event_id)
    const raw = knowledge.find((note) => note.meta?.concept_id === term.concept_id)
    const seen = new Set()
    for (const relation of [...(raw.meta.relations || []), ...(raw.meta.connections || [])]) {
      const target = termById.get(relation.target)
      const reason = readerKnowledgeText(relation.reason)
      if (
        !target ||
        target.concept_id === term.concept_id ||
        !reason ||
        seen.has(target.concept_id)
      )
        continue
      seen.add(target.concept_id)
      term.relations.push({
        concept_id: target.concept_id,
        label: target.label,
        path: target.path,
        url: target.url,
        reason,
        source_urls: sources(relation.evidence),
      })
    }
  }
  terms.sort((a, b) => a.label.localeCompare(b.label, "ko"))
  const companies = unique(companyLabels)
    .filter((name) => events.some((event) => event.entities.includes(name)))
    .map((name) => ({
      label: name,
      url: href("Companies/index") + "?" + new URLSearchParams({ company: name }),
      event_ids: events
        .filter((event) => event.entities.includes(name))
        .map((event) => event.event_id),
      source_urls: unique(
        events
          .filter((event) => event.entities.includes(name))
          .flatMap((event) => event.source_urls),
      ),
      classification_basis: "exact-published-entity-tag",
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"))
  const publicTopics = reviewedTopics(topics, events, terms, href)
  const periods = new Map()
  for (const event of events) {
    const period = weekPeriod(event.published_at)
    if (!periods.has(period.from)) periods.set(period.from, { ...period, event_ids: [] })
    periods.get(period.from).event_ids.push(event.event_id)
  }
  const search = [
    ...events.map((event) => ({
      url: event.url,
      title: event.title,
      type: "뉴스",
      date: event.published_at,
      aliases: [],
      keywords: [
        event.sector,
        event.theme,
        event.secondary_theme,
        ...event.tags,
        ...event.entities,
      ].filter(Boolean),
      text: [
        event.lead,
        ...Object.values(event.facts),
        ...event.explanations.flatMap((section) => [section.heading, ...section.paragraphs]),
      ].join(" "),
      source_urls: event.source_urls,
      sources: event.source_urls,
      facts: readerEventFacts(event),
      event_id: event.event_id,
      concept_ids: event.concept_ids,
    })),
    ...terms.map((term) => ({
      url: term.url,
      title: term.label,
      type: "키워드",
      date: term.reviewed_at,
      aliases: term.aliases,
      keywords: term.keywords,
      text: [term.definition, ...term.sections.map((section) => section.text)].join(" "),
      source_urls: term.source_urls,
      sources: term.source_urls,
      facts: [
        { text: term.definition, source_urls: term.source_urls },
        ...term.sections.map((section) => ({ text: section.text, source_urls: term.source_urls })),
      ],
      concept_id: term.concept_id,
    })),
    ...publicTopics.map((topic) => ({
      url: topic.url,
      title: topic.title,
      type: "누적 주제",
      date: topic.reviewed_at,
      aliases: [],
      keywords: [],
      text: [topic.summary || "", ...topic.observations.map((row) => row.text)].join(" "),
      source_urls: topic.source_urls,
      sources: topic.source_urls,
      facts: topic.observations.map((row) => ({
        text: row.text,
        source_urls: events.find((event) => event.event_id === row.event_id).source_urls,
        event_id: row.event_id,
        published_at: row.published_at,
        article_url: events.find((event) => event.event_id === row.event_id).url,
      })),
      topic_id: topic.topic_id,
    })),
    ...companies.map((company) => ({
      url: company.url,
      title: company.label,
      type: "기업",
      date: events.find((event) => event.event_id === company.event_ids[0]).published_at,
      aliases: [],
      keywords: [company.label],
      text: events
        .filter((event) => company.event_ids.includes(event.event_id))
        .map((event) => event.title + " " + event.lead)
        .join(" "),
      source_urls: company.source_urls,
      sources: company.source_urls,
      facts: events
        .filter((event) => company.event_ids.includes(event.event_id))
        .flatMap(readerEventFacts),
      entity: company.label,
    })),
  ]
  return {
    schema: "reader-knowledge/v1",
    events,
    terms,
    topics: publicTopics,
    companies,
    periods: [...periods.values()].sort((a, b) => b.from.localeCompare(a.from)),
    search,
  }
}

export function searchReaderKnowledge(
  model,
  question,
  { from = "", to = "", company = "", sector = "", limit = 40 } = {},
) {
  if (model?.schema !== "reader-knowledge/v1") throw Error("Public reader knowledge model required")
  if ((from && !validDay(from)) || (to && !validDay(to)) || (from && to && from > to))
    throw Error("Valid inclusive publication period required")
  const tokens = normalize(question).split(/\s+/).filter(Boolean)
  if (!tokens.length) return []
  return model.search
    .map((row) => {
      const event = row.event_id && model.events.find((item) => item.event_id === row.event_id)
      const title = normalize([row.title, ...row.aliases, ...row.keywords].join(" "))
      const haystack = title + " " + normalize(row.text)
      const eligible =
        (!(from || to || company || sector) || !!event) &&
        (!from || row.date >= from) &&
        (!to || row.date <= to) &&
        (!company || (event ? event.entities.includes(company) : row.entity === company)) &&
        (!sector || event?.sector === sector)
      return {
        ...row,
        score:
          eligible && tokens.every((token) => haystack.includes(token))
            ? tokens.reduce((sum, token) => sum + (title.includes(token) ? 5 : 1), 0)
            : 0,
      }
    })
    .filter((row) => row.score)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, limit)
}
