import fs from "node:fs"
import path from "node:path"
import { noteText, extractArticles, sections, sourceMap } from "../garden.mjs"
import { assertSchema } from "./contracts.mjs"
import { draftProblems, draftFingerprint, schemaForDraft } from "./editor.mjs"
import { atomicWrite } from "./run-state.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { parseResearchDate, assertReviewDate } from "./dates.mjs"
import {
  assertDeepDiveContext,
  deepClaimIds,
  publicDeepMetadata,
  assertArticlePaperReview,
} from "./deep-dive.mjs"
import {
  eventDateMetadata,
  assertRetrospectiveReview,
  assertHistoricalAdditionReview,
} from "./event-date.mjs"
import { markdownProse } from "../explanations.mjs"
import { assertLegacyTransition } from "./legacy-transition.mjs"

// Pure projection: no Drive write, Git commit or push is performed here.
export function approvedArticle(draftRecord, claims, documents, review, parses = []) {
  const d = draftRecord.draft
  const deepContext = draftRecord.deep_context || null
  if (
    review.status !== "approved" ||
    review.draft_id !== draftRecord.draft_id ||
    !review.reviewer?.trim() ||
    review.source_read !== true ||
    review.final_prose_read !== true ||
    review.title_checked !== true ||
    review.dates_checked !== true ||
    review.numbers_checked !== true ||
    review.analysis_checked !== true
  )
    throw Error("Explicit editorial approval of this exact draft is required")
  assertSchema(d, schemaForDraft(deepContext))
  if (draftRecord.draft_id !== draftFingerprint(d, deepContext))
    throw Error("Draft changed after review")
  if (deepContext) assertDeepDiveContext(deepContext, claims, parses, documents)
  const problems = draftProblems(d, claims, deepContext)
  if (problems.length) throw Error("Draft has unresolved problems: " + problems.join(", "))
  if (
    !/^[a-f0-9]{16}$/.test(review.event_id) ||
    parseResearchDate(review.published_at)?.precision !== "day" ||
    parseResearchDate(review.reviewed_at)?.precision !== "day" ||
    review.reviewed_at < review.published_at
  )
    throw Error("Fixed event ID and original/review dates required")
  if (!review.region || !["국내", "해외", "국제 공동"].includes(review.region))
    throw Error("Reviewed region required")
  const references = [
    ...d.lead,
    ...d.explanations.flatMap((e) => e.paragraphs),
    ...(deepContext && d.analysis ? [d.analysis] : []),
  ].flatMap((s) => s.claim_ids)
  const publicReferences = [...references]
  if (deepContext) references.push(...deepClaimIds(deepContext.input))
  const used = claims.filter((c) => references.includes(c.claim_id))
  for (const claim of used) assertVerifiedClaim(claim, parses)
  const sourceIds = new Set(used.flatMap((c) => c.evidence.map((e) => e.source_version_id)))
  const sourceDocuments = documents.filter((doc) => sourceIds.has(doc.source_version_id))
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      review.published_at,
      ...used.map((c) => c.review.reviewed_at),
      ...sourceDocuments.map((doc) => doc.observed_at),
      ...(deepContext ? [deepContext.review.reviewed_at] : []),
    ],
  })
  const eventDate = eventDateMetadata(
    review,
    used.filter((c) => publicReferences.includes(c.claim_id)),
    parses,
    deepContext?.input.event_claim_ids,
  )
  if (review.retrospective_review) assertRetrospectiveReview(review.retrospective_review, review)
  if (review.historical_addition_review)
    assertHistoricalAdditionReview(review.historical_addition_review, review)
  if (review.retrospective_review && review.historical_addition_review)
    throw Error("An event cannot be both a correction and a historical addition")
  if (deepContext && deepContext.input.relations.some((r) => r.as_of > review.published_at))
    throw Error("Relationship date cannot follow the original article event")
  const urlsFor = (ids) => [
    ...new Set(
      used
        .filter((c) => ids.includes(c.claim_id))
        .flatMap((c) =>
          c.evidence.map((e) => {
            const doc = documents.find(
              (s) => s.source_id === e.source_id && s.source_version_id === e.source_version_id,
            )
            if (!doc) throw Error("Article evidence document missing")
            return doc.original_url
          }),
        ),
    ),
  ]
  const source_urls = urlsFor(references)
  let papers = []
  if (Object.hasOwn(review, "paper_review")) {
    if (deepContext) throw Error("Separate paper references are only for ordinary news")
    papers = assertArticlePaperReview(
      review.paper_review,
      used.filter((c) => publicReferences.includes(c.claim_id)),
      parses,
      documents,
      review.reviewed_at,
    )
  }
  const lead = d.lead.map((s) => s.text).join(" ")
  const record = {
    title: d.title,
    kind: "사건 뉴스",
    region: review.region,
    facts: Object.fromEntries(Object.entries(d.facts).map(([k, value]) => [k, value || "미기재"])),
    lead,
    explanations: d.explanations.map((e) => ({
      heading: e.heading,
      paragraphs: e.paragraphs.map((p) => p.text),
      source_urls: urlsFor(e.paragraphs.flatMap((p) => p.claim_ids)),
    })),
    papers,
    relations: [],
    topic_ids: [],
    ...(deepContext
      ? {
          ...publicDeepMetadata(deepContext.input),
          ...(d.analysis ? { analysis_summary: d.analysis.text } : {}),
          explanations: [
            ...d.explanations.map((e) => ({
              heading: e.heading,
              paragraphs: e.paragraphs.map((p) => p.text),
              source_urls: urlsFor(e.paragraphs.flatMap((p) => p.claim_ids)),
            })),
            ...(d.analysis
              ? [
                  {
                    heading: "분석",
                    paragraphs: [d.analysis.text],
                    source_urls: urlsFor(d.analysis.claim_ids),
                  },
                ]
              : []),
          ],
        }
      : {}),
  }
  // Empty six-w fields remain internal metadata; no filler is inserted into prose.
  return {
    event_id: review.event_id,
    title: d.title,
    source_urls,
    sector: d.sector,
    theme: d.theme,
    tags: d.tags,
    entities: d.entities,
    record,
    article_review: {
      title: d.title,
      event_id: review.event_id,
      review_status: "verified",
      published_at: review.published_at,
      reviewed_at: review.reviewed_at,
      concept_ids: review.concept_ids || [],
      ...eventDate,
    },
    ...(review.retrospective_review
      ? { retrospective_review: structuredClone(review.retrospective_review) }
      : {}),
    ...(review.historical_addition_review
      ? { historical_addition_review: structuredClone(review.historical_addition_review) }
      : {}),
  }
}
// Retain an article's existing review and classification during a partial
// retrospective. This conversion does not approve previously unreviewed work.
export function existingArticleProjection(article) {
  if (!article.editorial) {
    if (
      !article.edition ||
      article.edition.meta.editorial_format !== undefined ||
      !parseResearchDate(article.edition.meta.date) ||
      article.edition.meta.date >= "2026-09-14"
    )
      throw Error("Only historical legacy articles can be preserved")
    return {
      event_id: article.id,
      title: article.title,
      source_urls: [...article.urls],
      article_review: { title: article.title, ...structuredClone(article.review) },
      legacy: { body: article.body, desk: article.desk },
    }
  }
  if (!article.editorial || !article.classification)
    throw Error("Retrospective requires an existing six-w article with classification")
  return {
    event_id: article.id,
    title: article.title,
    source_urls: [...article.urls],
    sector: article.sector,
    theme: article.classification.theme,
    secondary_theme: article.classification.secondary_theme,
    tags: [...article.classification.event_tags],
    entities: [...article.classification.entities],
    record: Object.fromEntries(
      [
        "title",
        "kind",
        "region",
        "facts",
        "lead",
        "papers",
        "relations",
        "topic_ids",
        "explanations",
        "analysis_summary",
        "next_check",
      ]
        .filter((field) => Object.hasOwn(article.editorial, field))
        .map((field) => [field, structuredClone(article.editorial[field])]),
    ),
    article_review: { title: article.title, ...structuredClone(article.review) },
    concept_paths: [...article.concepts],
  }
}
export function editionProjection(
  articles,
  {
    key,
    date,
    coverage_start,
    coverage_end,
    existing,
    reviewed_sections = {},
    added_event_ids = [],
    concept_paths_by_id = {},
    legacy_review = null,
  },
) {
  if (
    Object.entries(reviewed_sections).some(
      ([name, value]) =>
        !["흐름 읽기", "오늘의 적용", "개념 색인"].includes(name) || value !== "없음",
    )
  )
    throw Error("Only explicitly reviewed ancillary omissions are supported")
  if (
    !articles.length ||
    articles.length > 40 ||
    new Set(articles.map((a) => a.event_id)).size !== articles.length
  )
    throw Error("Unique approved articles required")
  if (!/^\d{4}-\d{2}-\d{2}_\d{4}_Tech_AI_Briefing$/.test(key) || date !== key.slice(0, 10))
    throw Error("Existing edition identity required")
  if (
    existing &&
    (existing.meta.date !== date ||
      existing.meta.coverage_start !== coverage_start ||
      existing.meta.coverage_end !== coverage_end)
  )
    throw Error("Historical edition dates/cutoffs must be preserved")
  const old = existing ? extractArticles(existing) : []
  if (legacy_review) {
    if (added_event_ids.length)
      throw Error("Legacy transition cannot add unrelated historical events")
    assertLegacyTransition(
      legacy_review,
      articles,
      existing,
      `Editions/${date.slice(0, 4)}/${date.slice(5, 7)}/${key}.md`,
    )
    reviewed_sections = { "흐름 읽기": "없음", "오늘의 적용": "없음", "개념 색인": "없음" }
  } else if (existing) {
    if (existing.meta.schema_version !== "tech-ai-magazine/v2")
      throw Error("Pre-v2 edition requires a complete legacy transition review")
    if (
      old.length + added_event_ids.length !== articles.length ||
      new Set(added_event_ids).size !== added_event_ids.length ||
      old.some((a) => !articles.some((p) => p.event_id === a.id))
    )
      throw Error("Partial retrospective cannot silently remove other articles")
    for (const a of articles) {
      const match = old.find((p) => p.id === a.event_id)
      if (!match) {
        if (!added_event_ids.includes(a.event_id) || !a.historical_addition_review)
          throw Error("Historical addition requires an exact reviewed event and edition")
        continue
      }
      if (
        a.legacy &&
        (match.editorial ||
          a.record ||
          a.title !== match.title ||
          a.legacy.body !== match.body ||
          a.legacy.desk !== match.desk ||
          JSON.stringify(a.source_urls) !== JSON.stringify(match.urls) ||
          JSON.stringify(a.article_review) !==
            JSON.stringify({ title: match.title, ...match.review }))
      )
        throw Error("Legacy preservation must retain exact prose, sources, review, title and desk")
    }
  }
  const partial = articles.some((a) => a.legacy)
  if (
    partial &&
    (!existing || existing.meta.editorial_format !== undefined || date >= "2026-09-14")
  )
    throw Error("Legacy preservation requires an existing historical edition")
  const byId = new Map(articles.map((a) => [a.event_id, a]))
  const priorById = new Map(old.map((a) => [a.id, a]))
  const conceptPaths = (article) => {
    if (article.concept_paths) return article.concept_paths
    return (article.article_review.concept_ids || []).map((id) => {
      const notePath = concept_paths_by_id[id]
      if (typeof notePath !== "string" || !notePath.startsWith("Knowledge/"))
        throw Error("Reviewed concept has no canonical knowledge note: " + id)
      return notePath
    })
  }
  const headlines = existing?.meta.headlines
    ? existing.meta.headlines.map((title) => {
        const prior = old.find((a) => a.title === title)
        if (!prior) throw Error("Existing headline must match a retained event")
        return byId.get(prior.id).title
      })
    : articles.slice(0, 5).map((a) => a.title)
  for (const added of articles.filter((a) => added_event_ids.includes(a.event_id))) {
    if (headlines.length >= Math.min(3, articles.length)) break
    headlines.push(added.title)
  }
  const knowledge = {}
  for (const field of [
    "linked_knowledge_notes",
    "knowledge_notes_created",
    "knowledge_notes_updated",
  ])
    if (existing && Object.hasOwn(existing.meta, field)) {
      const value = existing.meta[field]
      if (!Array.isArray(value) || value.some((p) => typeof p !== "string" || !p.trim()))
        throw Error("Existing knowledge references require explicit note paths")
      knowledge[field] = [...value]
    }
  const navigation = {}
  for (const field of ["recent_event_ids", "briefing_highlights", "excluded_events"])
    if (existing && Object.hasOwn(existing.meta, field)) {
      const value = existing.meta[field]
      if (
        !Array.isArray(value) ||
        new Set(value).size !== value.length ||
        value.some((id) => typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id))
      )
        throw Error("Existing briefing navigation requires fixed event IDs")
      navigation[field] = [...value]
    }
  const secondaryTheme = (a) =>
    Object.hasOwn(a, "secondary_theme")
      ? a.secondary_theme
      : priorById.get(a.event_id)?.classification?.theme === a.theme
        ? priorById.get(a.event_id).classification.secondary_theme
        : null
  const priorSources = existing ? sourceMap(existing.body) : new Map()
  const all_urls = [
    ...new Set([
      ...(partial ? [...priorSources.values()] : []),
      ...articles.flatMap((a) => a.source_urls),
    ]),
  ]
  const sourceMarkers = partial ? new Map(priorSources) : new Map()
  let nextMarker = Math.max(0, ...[...sourceMarkers.keys()].map((k) => Number(k.slice(1))))
  for (const url of all_urls)
    if (![...sourceMarkers.values()].includes(url)) sourceMarkers.set(`S${++nextMarker}`, url)
  const marker = (u) => `[${[...sourceMarkers].find(([, url]) => url === u)?.[0]}]`
  const meta = {
    title: existing?.meta.title || `${date} Tech & AI 브리핑`,
    ...(legacy_review?.metadata_review
      ? Object.fromEntries(
          legacy_review.metadata_review.dispositions
            .filter((d) => d.action === "preserve")
            .map((d) => [d.field, structuredClone(existing.meta[d.field])]),
        )
      : {}),
    type: "briefing",
    schema_version: "tech-ai-magazine/v2",
    date,
    timezone: "Asia/Seoul",
    coverage_start,
    coverage_end,
    ...(partial
      ? Object.fromEntries(
          ["briefing_format", "theme_format"]
            .filter((k) => Object.hasOwn(existing.meta, k))
            .map((k) => [k, existing.meta[k]]),
        )
      : {
          editorial_format: "six-w/v1",
          briefing_format: "sector-five/v1",
          theme_format: "news-themes/v1",
        }),
    source_count: all_urls.length,
    new_items_count: articles.length,
    linked_knowledge_notes: [],
    knowledge_notes_created: [],
    knowledge_notes_updated: [],
    ...knowledge,
    ...navigation,
    headlines,
    article_records: articles.filter((a) => a.record).map((a) => a.record),
    article_reviews: articles.map((a) => a.article_review),
  }
  const card = (a) =>
    `## ${a.title}\n\n**분야:** ${a.sector}\n**테마:** ${a.theme}\n**보조 테마:** ${secondaryTheme(a) || "없음"}\n**세부 태그:** ${a.tags.join(", ")}\n**기업·기관:** ${a.entities.length ? a.entities.join(", ") : "없음"}\n\n${markdownProse(a.record.lead)} ${a.source_urls.map(marker).join(" ")}\n\n${(a.record.explanations || []).map((e) => `### ${e.heading}\n\n${e.paragraphs.map(markdownProse).join("\n\n")} ${e.source_urls.map(marker).join(" ")}`).join("\n\n")}${
      conceptPaths(a).length
        ? "\n\n**개념:** " +
          conceptPaths(a)
            .map((p) => `[[${p}]]`)
            .join(", ")
        : ""
    }`
  const priorSections = new Map(
    existing ? sections(existing.body).map((s) => [s.title, s.body]) : [],
  )
  const retainedSection = (name) =>
    (priorSections.get(name) || "없음").replace(/\[S\d+\]/g, (value) => {
      const url = priorSources.get(value.slice(1, -1))
      if (!url || !all_urls.includes(url))
        throw Error("Existing cumulative section depends on a removed source; review it explicitly")
      return marker(url)
    })
  // Editions remain valid Obsidian authoring documents. The reader projection
  // handles cover/navigation and hides empty sections; no framing is shown as
  // an operational instruction in the news, RSS or digest.
  const articleBody =
    [
      ["이번 호 표지", headlines[0]],
      ["차례", headlines.map((title) => `- ${title}`).join("\n")],
      ...["커버 스토리", "뉴스 데스크", "리서치 노트", "도구 상자"].map((name) => [
        name,
        articles
          .filter((a) => (partial && a.legacy ? a.legacy.desk : "뉴스 데스크") === name)
          .map((a) => (a.legacy ? `## ${a.title}\n\n${a.legacy.body}` : card(a)))
          .join("\n\n") || "없음",
      ]),
      ...["흐름 읽기", "오늘의 적용", "개념 색인"].map((name) => [
        name,
        reviewed_sections[name] || retainedSection(name),
      ]),
    ]
      .map(([name, content]) => `# ${name}\n\n${content}`)
      .join("\n\n") + "\n"
  const currentConceptLinks = new Set(
    [...articleBody.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map((match) => match[1]),
  )
  const retiredConcepts = new Set(
    old.flatMap((prior) => {
      const current = byId.get(prior.id)
      if (!current || current.legacy) return []
      const kept = new Set(conceptPaths(current))
      return prior.concepts.filter((notePath) => !kept.has(notePath))
    }),
  )
  const knowledgePath = (value) => value.match(/^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/)?.[1] || value
  meta.linked_knowledge_notes = meta.linked_knowledge_notes.filter((value) => {
    const notePath = knowledgePath(value)
    return !retiredConcepts.has(notePath) || currentConceptLinks.has(notePath)
  })
  const linkedPaths = new Set(meta.linked_knowledge_notes.map(knowledgePath))
  for (const article of articles.filter((a) => !a.legacy && !a.concept_paths))
    for (const notePath of conceptPaths(article))
      if (!linkedPaths.has(notePath)) {
        meta.linked_knowledge_notes.push(notePath)
        linkedPaths.add(notePath)
      }
  const usedMarkers = new Set([...articleBody.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]))
  const usedSources = [...sourceMarkers].filter(([key]) => usedMarkers.has(key))
  meta.source_count = usedSources.length
  if (partial && usedSources.some(([key], index) => key !== `S${index + 1}`))
    meta.source_marker_format = "preserved-retrospective/v1"
  const body =
    articleBody +
    "\n# Source List\n\n" +
    usedSources.map(([key, url]) => `- [${key}] ${url}`).join("\n") +
    "\n"
  const issue = {
    file: `vault/Editions/${date.slice(0, 4)}/${date.slice(5, 7)}/${key}.md`,
    meta,
    body,
  }
  extractArticles(issue) // Existing six-w, sector, theme, date and ID validators are the final contract.
  return { path: issue.file.replace(/^vault\//, ""), content: noteText(meta, body) }
}
export function stageProjection(root, run, projection) {
  if (!projection.path.startsWith("Editions/") || !projection.path.endsWith(".md"))
    throw Error("Only approved edition projection allowed")
  return atomicWrite(root, `runs/${run}/approved-vault/${projection.path}`, projection.content)
}
