import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import RSSParser from "rss-parser"
import { fromHtml } from "hast-util-from-html"
import { slugifyFilePath } from "@quartz-community/utils"
import {
  canonicalURL,
  editions,
  extractArticles,
  walk,
  parseNote,
  sections,
  noteText,
  feeds,
} from "../garden.mjs"
import { digestPath, briefingLibrary, topicPath } from "../briefings.mjs"
import { collect } from "../verify-site.mjs"
import { PUBLIC_ROOTS, sha256 } from "./contracts.mjs"
import {
  approvedArticle,
  editionProjection,
  existingArticleProjection,
} from "./publish-adapter.mjs"
import { assertStoredEvidence } from "./parser.mjs"
import { assertLegacyTransition, legacyTransitionBatch } from "./legacy-transition.mjs"
import { markdownProseText } from "../explanations.mjs"
import { loadNoteApproval } from "./note-review.mjs"
import { atomicWrite, atomicCreate, readJSON, safePath, RunState } from "./run-state.mjs"
import { assertConceptConflicts } from "./knowledge-links.mjs"
import { assertRetrospectiveAppearance, assertHistoricalAdditionReview } from "./event-date.mjs"
import { articleDateLabel } from "../article-review.mjs"
import { parseResearchDate, seoulPublicationDay } from "./dates.mjs"
import { evaluateArticleConceptReview } from "./article-concept-review.mjs"
import { loadPreviewSourceAlternatives } from "./preview-source-alternatives.mjs"

const approvalFiles = [
  "draft.json",
  "reviewed-claims.json",
  "documents.json",
  "parses.json",
  "editorial-review.json",
  "approved-article.json",
]
const validRun = (run) => {
  if (typeof run !== "string" || !/^[a-zA-Z0-9_-]+$/.test(run)) throw Error("Invalid run id")
}

export function loadCurrentApproval(root, run, { vault = "vault" } = {}) {
  validRun(run)
  const entries = Object.fromEntries(
    approvalFiles.map((name) => {
      const relative = `runs/${run}/${name}`
      const bytes = fs.readFileSync(safePath(root, relative))
      return [name, { value: JSON.parse(bytes), sha256: sha256(bytes) }]
    }),
  )
  const value = (name) => entries[name].value
  const documents = value("documents.json"),
    parses = value("parses.json")
  assertStoredEvidence(root, documents, parses)
  const article = approvedArticle(
    value("draft.json"),
    value("reviewed-claims.json").claims,
    documents,
    value("editorial-review.json"),
    parses,
  )
  if (sha256(JSON.stringify(article)) !== sha256(JSON.stringify(value("approved-article.json"))))
    throw Error("Saved approval differs from the currently reviewed article")
  const conceptPath = `runs/${run}/article-concept-review.json`
  const concepts = readJSON(root, conceptPath)
  if (concepts || value("editorial-review.json").concept_review) {
    const current = evaluateArticleConceptReview(
      root,
      article,
      value("draft.json"),
      value("reviewed-claims.json").claims,
      parses,
      value("editorial-review.json"),
      // The location records where review happened; byte identity and current
      // validation use the supplied vault, including a verified archive copy.
      { vault, sourceVault: concepts?.source_vault || vault },
    )
    if (!concepts || JSON.stringify(concepts) !== JSON.stringify(current))
      throw Error("Saved article concept assignment differs from current evidence")
    entries["article-concept-review.json"] = {
      sha256: sha256(fs.readFileSync(safePath(root, conceptPath))),
    }
  }
  return {
    run,
    article,
    ...(concepts ? { concept_review: concepts } : {}),
    source_observed_at: documents.map((document) => document.observed_at),
    files: Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, entry.sha256])),
  }
}

// A concept selected from a private note approval must use that exact reviewed
// definition in the reader, even if an older note with the same ID exists.
export function assertPreviewConceptNotes(approvals, knowledge) {
  for (const approval of approvals)
    for (const selected of approval.concept_review?.notes || []) {
      if (selected.approval_run === undefined) continue
      const included = knowledge.find((k) => k.run === selected.approval_run)
      if (
        !included?.approval.notes.some(
          (n) => n.path === selected.path && n.sha256 === selected.sha256,
        )
      )
        throw Error("Private reader requires the exact approved concept note: " + selected.path)
    }
}

export function verifyReviewedConceptOutputs(workspace, approvals) {
  const selected = approvals.filter((a) => a.concept_review)
  if (!selected.length) return []
  const graph = readJSON(workspace, "public/knowledge-graph.json")
  const hasPath = (tree, destination) =>
    [...links(tree)].some((href) =>
      new URL(href, "https://preview.invalid/").pathname
        .replace(/\.html$/, "")
        .endsWith("/" + destination),
    )
  return selected.flatMap((approval) =>
    approval.concept_review.links.map((link) => {
      const source = approval.concept_review.notes.find(
        (n) => n.path.replace(/\.md$/, "") === link.path,
      )
      if (
        !source ||
        sha256(fs.readFileSync(safePath(path.join(workspace, "vault"), source.path))) !==
          source.sha256
      )
        throw Error("Reader specialist definition differs from the assigned note")
      const node = graph.nodes.find((n) => n.id === link.concept_id)
      const slug = slugifyFilePath(source.path)
      const eventId = approval.article.event_id
      const graphArticle = graph.articles.find((a) => a.id === "news:" + eventId)
      if (
        !node ||
        node.slug !== slug ||
        !graphArticle?.matches.some((m) => m.termId === link.concept_id && m.basis === "editorial")
      )
        throw Error("Reviewed specialist assignment missing from reader graph")
      const termTree = fromHtml(fs.readFileSync(safePath(workspace, `public/${slug}.html`), "utf8"))
      const newsTree = fromHtml(
        fs.readFileSync(safePath(workspace, `public/news/${eventId}.html`), "utf8"),
      )
      const termLinks = links(termTree)
      if (
        !hasPath(newsTree, slug) ||
        !hasPath(termTree, "news/" + eventId) ||
        !normalizedText(htmlText(termTree)).includes(
          approval.article.article_review.published_at,
        ) ||
        approval.article.source_urls.some((url) => !termLinks.has(url))
      )
        throw Error("Reader concept tag, dated event history or original source missing")
      return {
        event_id: eventId,
        concept_id: link.concept_id,
        note_sha256: source.sha256,
        reciprocal_links_verified: true,
        original_date: approval.article.article_review.published_at,
      }
    }),
  )
}

export function assertNewEditionSourceCutoff(approvals, spec) {
  const cutoff = Date.parse(spec?.coverage_end)
  if (!Number.isFinite(cutoff)) throw Error("New-edition coverage cutoff required")
  for (const approval of approvals)
    if (
      !approval.source_observed_at?.length ||
      approval.source_observed_at.some(
        (observedAt) => !Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) > cutoff,
      )
    )
      throw Error("New-edition source was observed after the coverage cutoff")
}

// The cached feed can predate saved authoring files. A private new issue must
// preserve identities derived from the pinned source vault, not a stale cache.
export function newEditionFeedBaseline(root, run, vault) {
  validRun(run)
  const directory = `runs/${run}/preview/source-feed`
  feeds(vault, safePath(root, directory))
  const relative = directory + "/briefing.xml",
    bytes = fs.readFileSync(safePath(root, relative)),
    cached = fs.readFileSync(path.join(vault, "briefing.xml"))
  return {
    path: relative,
    sha256: sha256(bytes),
    cached_sha256: sha256(cached),
    cached_feed_current: sha256(bytes) === sha256(cached),
    candidate_published: false,
  }
}

export function retrospectiveProjections(
  vault,
  approvals,
  knowledgeNotes = [],
  legacyReviews = [],
) {
  if (
    (!approvals.length && !legacyReviews.length) ||
    new Set(approvals.map((a) => a.event_id)).size !== approvals.length
  )
    throw Error("Distinct approved events required")
  const knowledgeByPath = new Map(
    walk(path.join(vault, "Knowledge"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => [
        path.relative(vault, file).split(path.sep).join("/").replace(/\.md$/, ""),
        parseNote(fs.readFileSync(file, "utf8")).meta,
      ]),
  )
  for (const note of knowledgeNotes)
    if (note.path.startsWith("Knowledge/") && note.path.endsWith(".md"))
      knowledgeByPath.set(note.path.replace(/\.md$/, ""), parseNote(note.content).meta)
  const concept_paths_by_id = Object.create(null)
  for (const [notePath, meta] of knowledgeByPath)
    if (meta.concept_id) {
      if (concept_paths_by_id[meta.concept_id])
        throw Error("Duplicate canonical knowledge concept ID: " + meta.concept_id)
      concept_paths_by_id[meta.concept_id] = notePath
    }
  const byId = new Map(approvals.map((a) => [a.event_id, a])),
    found = new Set(),
    projections = [],
    appearances = new Map(approvals.map((a) => [a.event_id, []])),
    additionsByPath = new Map()
  const reviewsByPath = new Map(
    legacyReviews.length
      ? legacyTransitionBatch({
          schema: "research-legacy-transition-batch/v1",
          reviews: legacyReviews,
        }).map((p) => [p.target_path, p])
      : [],
  )
  const appliedReviews = new Set()
  for (const article of approvals) {
    const packet = article.historical_addition_review
    if (!packet) continue
    assertHistoricalAdditionReview(packet, {
      event_id: article.event_id,
      reviewer: packet.reviewer,
      reviewed_at: article.article_review.reviewed_at,
      published_at: article.article_review.published_at,
    })
    if (!additionsByPath.has(packet.target_path)) additionsByPath.set(packet.target_path, [])
    additionsByPath.get(packet.target_path).push(article)
  }
  for (const existing of editions(vault)) {
    const articles = extractArticles(existing)
    const relativePath = path.relative(vault, existing.file).split(path.sep).join("/")
    const additions = additionsByPath.get(relativePath) || []
    const legacyReview = reviewsByPath.get(relativePath)
    if (legacyReview) {
      const revised = legacyReview.events.map((e) => byId.get(e.event_id))
      if (revised.some((a) => !a) || additions.length)
        throw Error("Complete legacy transition cannot borrow missing or additional events")
      const originalBytes = fs.readFileSync(existing.file)
      if (sha256(originalBytes) !== legacyReview.target_sha256)
        throw Error("Legacy transition original edition bytes changed")
      assertLegacyTransition(legacyReview, revised, existing, relativePath)
      const projection = editionProjection(revised, {
        key: path.basename(existing.file, ".md"),
        date: existing.meta.date,
        coverage_start: existing.meta.coverage_start,
        coverage_end: existing.meta.coverage_end,
        existing,
        legacy_review: legacyReview,
        concept_paths_by_id,
      })
      projections.push({ ...projection, event_ids: revised.map((a) => a.event_id) })
      for (const article of revised) {
        found.add(article.event_id)
        appearances.get(article.event_id).push(relativePath)
      }
      appliedReviews.add(relativePath)
      continue
    }
    if (!articles.some((a) => byId.has(a.id)) && !additions.length) continue
    const originalBytes = fs.readFileSync(existing.file)
    const reviewed_sections = {}
    const revised = articles.map((a) => {
      const replacement = byId.get(a.id)
      if (!replacement) return existingArticleProjection(a)
      if (replacement.article_review.published_at > existing.meta.date)
        throw Error("Retrospective event date cannot follow its original edition day")
      const omissions = assertRetrospectiveAppearance(replacement, a, relativePath, originalBytes)
      for (const [name, content] of Object.entries(omissions)) {
        if (!sections(existing.body).some((s) => s.title === name))
          throw Error("Reviewed ancillary section does not exist in the original edition")
        reviewed_sections[name] = content
      }
      appearances.get(a.id).push(relativePath)
      found.add(a.id)
      return replacement
    })
    for (const article of additions) {
      const packet = article.historical_addition_review
      const start = parseResearchDate(existing.meta.coverage_start)
      const end = parseResearchDate(existing.meta.coverage_end)
      const sourceTime = parseResearchDate(article.article_review.source_published_at)
      const startDay = seoulPublicationDay(existing.meta.coverage_start) || start?.day
      const endDay = seoulPublicationDay(existing.meta.coverage_end) || end?.day
      if (
        packet.target_sha256 !== sha256(originalBytes) ||
        articles.some((a) => a.id === article.event_id) ||
        article.source_urls.some((url) =>
          revised.some((a) => (a.source_urls || []).includes(url)),
        ) ||
        !start ||
        !end ||
        start.instant > end.instant ||
        article.article_review.published_at < startDay ||
        article.article_review.published_at > endDay ||
        (article.article_review.date_kind === "source-publication-time" &&
          (sourceTime?.precision !== "timestamp" ||
            sourceTime.instant <= start.instant ||
            sourceTime.instant > end.instant))
      )
        throw Error("Historical addition does not match source edition, date or event identity")
      revised.push(article)
      appearances.get(article.event_id).push(relativePath)
      found.add(article.event_id)
    }
    const projection = editionProjection(revised, {
      key: path.basename(existing.file, ".md"),
      date: existing.meta.date,
      coverage_start: existing.meta.coverage_start,
      coverage_end: existing.meta.coverage_end,
      existing,
      reviewed_sections,
      added_event_ids: additions.map((a) => a.event_id),
      concept_paths_by_id,
    })
    projections.push({
      ...projection,
      event_ids: [
        ...articles.filter((a) => byId.has(a.id)).map((a) => a.id),
        ...additions.map((a) => a.event_id),
      ],
    })
  }
  if (appliedReviews.size !== reviewsByPath.size)
    throw Error("Legacy transition target edition is missing")
  if (approvals.some((a) => !found.has(a.event_id)))
    throw Error("Approved event has no existing edition; use the new-edition workflow")
  for (const a of approvals.filter((a) => a.retrospective_review))
    if (
      JSON.stringify(appearances.get(a.event_id).sort()) !==
      JSON.stringify(a.retrospective_review.appearances.map((p) => p.path).sort())
    )
      throw Error("Retrospective review must include every original appearance exactly once")
  return projections
}

// A new issue may be assembled privately from reviewed events. This does not
// certify the eight-sector coverage or install the issue in the authority vault.
export function newEditionProjections(
  vault,
  approvals,
  spec,
  knowledgeNotes = [],
  sourceOriginals = new Map(),
) {
  if (
    !spec ||
    spec.schema !== "research-private-edition/v1" ||
    spec.intent !== "private_slice" ||
    Object.keys(spec).some(
      (key) => !["schema", "intent", "key", "date", "coverage_start", "coverage_end"].includes(key),
    )
  )
    throw Error("Explicit private new-edition specification required")
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(spec.date || "") ||
    spec.key !== `${spec.date}_0800_Tech_AI_Briefing` ||
    !Number.isFinite(Date.parse(spec.coverage_start)) ||
    !Number.isFinite(Date.parse(spec.coverage_end)) ||
    Date.parse(spec.coverage_start) >= Date.parse(spec.coverage_end) ||
    Date.parse(spec.coverage_end) > Date.now()
  )
    throw Error("New-edition identity and completed coverage interval required")
  const kstDay = (value) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value))
  if (kstDay(spec.coverage_end) !== spec.date)
    throw Error("New-edition day must match the KST coverage cutoff")
  const existing = editions(vault)
  if (
    !existing.length ||
    existing.at(-1).meta.coverage_end !== spec.coverage_start ||
    existing.at(-1).meta.date >= spec.date
  )
    throw Error("New edition must continue the latest authority cutoff")
  const destination = `Editions/${spec.date.slice(0, 4)}/${spec.date.slice(5, 7)}/${spec.key}.md`
  if (fs.existsSync(path.join(vault, destination)))
    throw Error("New-edition destination already exists")
  if (
    !approvals.length ||
    new Set(approvals.map((a) => a.event_id)).size !== approvals.length ||
    approvals.some((a) => a.retrospective_review || a.historical_addition_review)
  )
    throw Error("New edition requires distinct, non-retrospective approved events")
  const prior = existing.flatMap(extractArticles)
  const priorIds = new Set(prior.map((a) => a.id))
  const priorUrls = new Set(prior.flatMap((a) => a.urls.map(canonicalURL)))
  const firstDay = kstDay(spec.coverage_start)
  for (const article of approvals) {
    const published = article.article_review.published_at
    // Keep fixed IDs from approvals made before URL canonicalization. Only
    // hashes of this exact approved source or its canonical form are accepted.
    const sourceIDs = new Set([
      sha256(canonicalURL(article.source_urls[0])).slice(0, 16),
      sha256(article.source_urls[0]).slice(0, 16),
    ])
    const original = sourceOriginals.get(article.event_id)
    if (original) {
      sourceIDs.add(sha256(original).slice(0, 16))
      sourceIDs.add(sha256(canonicalURL(original)).slice(0, 16))
    }
    if (
      !sourceIDs.has(article.event_id) ||
      priorIds.has(article.event_id) ||
      article.source_urls.some((url) => priorUrls.has(canonicalURL(url))) ||
      (original && priorUrls.has(canonicalURL(original))) ||
      published < firstDay ||
      published > spec.date
    )
      throw Error("New edition contains a duplicate or out-of-window event")
  }
  const knowledgeByPath = new Map(
    walk(path.join(vault, "Knowledge"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => [
        path.relative(vault, file).split(path.sep).join("/").replace(/\.md$/, ""),
        parseNote(fs.readFileSync(file, "utf8")).meta,
      ]),
  )
  for (const note of knowledgeNotes.filter((note) => note.path.startsWith("Knowledge/")))
    knowledgeByPath.set(note.path.replace(/\.md$/, ""), parseNote(note.content).meta)
  const conceptPaths = Object.create(null)
  for (const [notePath, meta] of knowledgeByPath)
    if (meta.concept_id) {
      if (conceptPaths[meta.concept_id])
        throw Error("Duplicate canonical knowledge concept ID: " + meta.concept_id)
      conceptPaths[meta.concept_id] = notePath
    }
  const projection = editionProjection(approvals, {
    ...spec,
    concept_paths_by_id: conceptPaths,
  })
  return [{ ...projection, event_ids: approvals.map((a) => a.event_id) }]
}

function filesUnder(directory) {
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory())
    throw Error("Snapshot source must be an existing directory: " + directory)
  if (fs.realpathSync(directory) !== path.resolve(directory))
    throw Error("Snapshot source cannot follow a symlink")
  return walk(directory).filter((file) => {
    if (!fs.lstatSync(file).isFile()) throw Error("Snapshot source must be a regular file")
    return !path.basename(file).startsWith(".")
  })
}
function fingerprints(directory, files = filesUnder(directory)) {
  return files.map((file) => ({
    path: path.relative(directory, file),
    sha256: sha256(fs.readFileSync(file)),
  }))
}
function assertFiles(directory, entries, message) {
  for (const entry of entries)
    if (sha256(fs.readFileSync(safePath(directory, entry.path))) !== entry.sha256)
      throw Error(message + ": " + entry.path)
}
function assertSnapshot(directory, entries, message) {
  if (JSON.stringify(fingerprints(directory)) !== JSON.stringify(entries)) throw Error(message)
}
export function copyFiles(source, destination, entries) {
  for (const entry of entries) {
    const original = safePath(source, entry.path)
    const bytes = fs.readFileSync(original)
    if (sha256(bytes) !== entry.sha256) throw Error("Snapshot source changed during copy")
    const file = safePath(destination, entry.path)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + "." + randomUUID() + ".tmp"
    try {
      // Reflinks keep independent writable files without duplicating every
      // preview's runtime bytes. Node uses a normal copy when unsupported.
      fs.copyFileSync(original, tmp, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL)
      fs.chmodSync(tmp, 0o600)
      if (sha256(fs.readFileSync(tmp)) !== entry.sha256)
        throw Error("Snapshot source changed during copy")
      const fd = fs.openSync(tmp, "r")
      try {
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      safePath(destination, entry.path)
      fs.renameSync(tmp, file)
      const dir = fs.openSync(path.dirname(file), "r")
      try {
        fs.fsyncSync(dir)
      } finally {
        fs.closeSync(dir)
      }
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    }
  }
}

const textBlocks = new Set([
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
])
function htmlText(node) {
  if (node.type === "text") return node.value
  if (node.tagName === "br") return "\n"
  const text = (node.children || []).map(htmlText).join("")
  return textBlocks.has(node.tagName) ? "\n" + text + "\n" : text
}
const normalizedText = (value) => value.normalize("NFC").replace(/\s+/g, " ").trim()
const links = (tree) =>
  new Set(collect(tree, (n) => n.tagName === "a").map((n) => n.properties?.href))

export async function verifyRetrospectiveOutputs(
  workspace,
  approvals,
  projections,
  originalRSS,
  { newEdition = false } = {},
) {
  const parser = new RSSParser(),
    original = await parser.parseString(originalRSS),
    feed = await parser.parseString(
      fs.readFileSync(path.join(workspace, "public/briefing.xml"), "utf8"),
    ),
    identity = (f) => f.items.map(({ guid, pubDate }) => ({ guid, pubDate }))
  const oldIdentity = identity(original)
  const currentIdentity = identity(feed)
  if (newEdition) {
    if (
      currentIdentity.length !== Math.min(40, oldIdentity.length + 1) ||
      JSON.stringify(currentIdentity.slice(1)) !==
        JSON.stringify(oldIdentity.slice(0, currentIdentity.length - 1))
    )
      throw Error("New edition changed existing RSS GUIDs, dates or edition order")
    const slug = slugifyFilePath(projections[0].path.replace(/^Editions\//, "Briefings/"))
    if (!new URL(currentIdentity[0].guid).pathname.endsWith("/" + slug.replace(/\.md$/, "")))
      throw Error("New edition RSS GUID does not match its briefing URL")
  } else if (JSON.stringify(oldIdentity) !== JSON.stringify(currentIdentity))
    throw Error("Retrospective changed existing RSS GUIDs, dates or edition order")
  const graph = readJSON(workspace, "public/knowledge-graph.json")
  const results = []
  for (const article of approvals) {
    const mapConcepts = (article.article_review.concept_ids || []).filter((id) =>
      graph.nodes.some((n) => n.id === id),
    )
    const mapArticle = graph.articles.find((a) => a.id === "news:" + article.event_id)
    if (
      mapConcepts.some(
        (id) => !mapArticle?.matches.some((m) => m.termId === id && m.basis === "editorial"),
      )
    )
      throw Error("Reviewed article concept missing from the generated map: " + article.event_id)
    const newsPath = `public/news/${article.event_id}.html`,
      news = fromHtml(fs.readFileSync(safePath(workspace, newsPath), "utf8")),
      phrases = [
        article.title,
        article.record.lead,
        ...article.record.explanations.flatMap((e) => e.paragraphs),
      ],
      text = normalizedText(htmlText(news)),
      sourceLinks = links(news),
      dateText = `${articleDateLabel(article.article_review)} ${article.article_review.published_at}`
    if (
      phrases.some((p) => !text.includes(normalizedText(p))) ||
      article.source_urls.some((u) => !sourceLinks.has(u))
    )
      throw Error("Private news differs from approved prose or source URLs: " + article.event_id)
    if (!text.includes(dateText))
      throw Error("Private news must distinguish publication from dated updates")
    if (
      !collect(
        news,
        (n) =>
          n.tagName === "time" && n.properties?.dateTime === article.article_review.published_at,
      ).length
    )
      throw Error("Private news must display the original announcement date: " + article.event_id)
    if (
      !article.record.analysis_summary &&
      collect(
        news,
        (n) => /^h[2-4]$/.test(n.tagName || "") && normalizedText(htmlText(n)) === "분석",
      ).length
    )
      throw Error("Omitted analysis leaked into private news")
    const appearances = []
    for (const projection of projections.filter((p) => p.event_ids.includes(article.event_id))) {
      const key = projection.path.replace(/\.md$/, ""),
        slug = slugifyFilePath(key.replace(/^Editions\//, "Briefings/") + ".md"),
        issuePath = `public/${slug}.html`,
        issue = fromHtml(fs.readFileSync(safePath(workspace, issuePath), "utf8")),
        markdownPath = digestPath(key),
        markdown = fs.readFileSync(safePath(workspace, markdownPath), "utf8"),
        rssItem = feed.items.find((i) => new URL(i.link).pathname.endsWith("/" + slug))
      if (
        phrases.some(
          (p) =>
            !normalizedText(htmlText(issue)).includes(normalizedText(p)) ||
            !markdownProseText(markdown).includes(p),
        ) ||
        article.source_urls.some((u) => !links(issue).has(u) || !markdown.includes(u)) ||
        !markdown.includes(dateText)
      )
        throw Error("Private briefing/digest differs from approved prose or URLs: " + key)
      if (rssItem) {
        const content = fromHtml(rssItem.content || "", { fragment: true }),
          contentText = normalizedText(htmlText(content))
        if (
          phrases.some((p) => !contentText.includes(normalizedText(p))) ||
          article.source_urls.some((u) => !links(content).has(u)) ||
          !contentText.includes(dateText)
        )
          throw Error("Existing RSS item differs from approved prose or URLs: " + key)
      }
      appearances.push({
        edition: key,
        html: issuePath,
        digest: markdownPath,
        rss_in_current_feed: !!rssItem,
      })
    }
    results.push({
      event_id: article.event_id,
      map_concept_ids: mapConcepts,
      published_at: article.article_review.published_at,
      date_label: articleDateLabel(article.article_review),
      news: newsPath,
      appearances,
    })
  }
  return {
    rss_identities_preserved: newEdition ? feed.items.length - 1 : feed.items.length,
    ...(newEdition ? { new_rss_guid: feed.items[0].guid } : {}),
    articles: results,
  }
}

const markdownText = (value) =>
  normalizedText(
    value
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, label) => label || p.split("/").pop())
      .replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1")
      .replace(/[*`]/g, ""),
  )

export function verifyKnowledgeOutputs(workspace, approvedNotes) {
  if (!approvedNotes.length) return []
  const vault = path.join(workspace, "vault"),
    all = editions(vault)
  const library = briefingLibrary(vault, all, new Map(all.map((i) => [i.slug, extractArticles(i)])))
  const hubPath = "public/briefings/index.html"
  const hub = fromHtml(fs.readFileSync(safePath(workspace, hubPath), "utf8"))
  return approvedNotes.map((n) => {
    if (sha256(fs.readFileSync(safePath(vault, n.path))) !== n.sha256)
      throw Error("Private knowledge differs from approved authoring bytes")
    const note = parseNote(n.content)
    if (n.path.startsWith("Knowledge/")) {
      const htmlPath = "public/" + slugifyFilePath(n.path) + ".html"
      const tree = fromHtml(fs.readFileSync(safePath(workspace, htmlPath), "utf8"))
      const text = normalizedText(htmlText(tree)),
        sourceLinks = links(tree)
      for (const section of sections(note.body, 2)) {
        if (/^(없음|해당 없음)$/.test(section.body.trim())) {
          if (
            collect(
              tree,
              (e) => e.tagName === "h2" && normalizedText(htmlText(e)) === section.title,
            ).length
          )
            throw Error("Empty approved knowledge section leaked into the reader")
        } else if (
          ["한 문장 정의", "작동 원리", "실제 예시"].includes(section.title) &&
          !text.includes(markdownText(section.body))
        )
          throw Error("Private knowledge explanation differs from approved prose")
      }
      if (note.meta.verified_sources.some((u) => !sourceLinks.has(u)))
        throw Error("Private knowledge source links differ from approved sources")
      return { path: n.path, html: htmlPath, concept_id: note.meta.concept_id, sha256: n.sha256 }
    }
    if (n.path.startsWith("TrendTopics/")) {
      const topic = library.current.topics.find((t) => t.id === note.meta.id)
      if (!topic) throw Error("Approved topic has no actual event history")
      const htmlPath = "public/" + slugifyFilePath(topicPath(topic.id) + ".md") + ".html"
      const digestPath = "digest/topics/" + topic.id + ".md"
      const tree = fromHtml(fs.readFileSync(safePath(workspace, htmlPath), "utf8"))
      const text = normalizedText(htmlText(tree)),
        sourceLinks = links(tree)
      const digest = fs.readFileSync(safePath(workspace, digestPath), "utf8")
      if (
        !text.includes(normalizedText(note.meta.thesis)) ||
        !digest.includes(note.meta.thesis) ||
        !normalizedText(htmlText(hub)).includes(normalizedText(note.meta.thesis))
      )
        throw Error(
          "Private topic, briefing hub and digest differ from the current reviewed summary",
        )
      const history = [
        ...new Map(
          topic.history
            .filter((s) => s.article.review?.review_status === "verified")
            .map((s) => [s.event_id, s]),
        ).values(),
      ]
      if (topic.reader_format === "source-events/v1") {
        for (const s of history)
          if (
            !text.includes(normalizedText(s.article.summary)) ||
            !markdownProseText(digest).includes(s.article.summary) ||
            s.article.urls.some((u) => !sourceLinks.has(u) || !digest.includes(u))
          )
            throw Error("Private topic history differs from its verified event")
        if (
          collect(
            tree,
            (e) =>
              e.tagName === "h2" &&
              ["다음 확인", "판단을 바꿀 조건", "재사용할 원칙", "관측 기록"].includes(
                normalizedText(htmlText(e)),
              ),
          ).length
        )
          throw Error("Private topic operations leaked into the source-event reader")
      }
      return {
        path: n.path,
        html: htmlPath,
        digest: digestPath,
        sha256: n.sha256,
        event_ids: history.map((s) => s.event_id),
        reviewed_at: note.meta.reviewed,
      }
    }
    return { path: n.path, sha256: n.sha256, public_projection: "event-history-only" }
  })
}
function runtimeFiles(repo) {
  const files = ["scripts", "quartz", "web", "data"].flatMap((folder) =>
    filesUnder(path.join(repo, folder)),
  )
  for (const relative of [
    "package.json",
    "package-lock.json",
    "quartz.config.yaml",
    "quartz.ts",
    "tsconfig.json",
    ".quartz/plugins/index.ts",
  ])
    files.push(safePath(repo, relative))
  return fingerprints(
    repo,
    files.filter(
      (file) =>
        !["data/drive-source-state.json", "data/catalog.json"].includes(path.relative(repo, file)),
    ),
  ).sort((a, b) => a.path.localeCompare(b.path))
}

async function execute(workspace, root, relativeLog, script, args = []) {
  relativeLog = relativeLog.replace(/\.log$/, `-attempt-${randomUUID()}.log`)
  const log = safePath(root, relativeLog)
  fs.mkdirSync(path.dirname(log), { recursive: true })
  const fd = fs.openSync(log, "wx", 0o600),
    started = Date.now()
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: workspace,
        stdio: ["ignore", fd, fd],
        env: { ...process.env, npm_config_offline: "true" },
      })
      child.once("error", reject)
      child.once("close", (code, signal) => {
        if (code !== 0)
          reject(Error(`Private preview ${script} failed (${code ?? signal}); see ${relativeLog}`))
        else resolve()
      })
    })
  } finally {
    fs.closeSync(fd)
  }
  return {
    script,
    args,
    log: relativeLog,
    log_sha256: sha256(fs.readFileSync(log)),
    duration_ms: Date.now() - started,
  }
}

export function stageApprovedNote(vault, note, { creationReceipt = null } = {}) {
  if (sha256(note.content) !== note.sha256) throw Error("Approved note content hash changed")
  if (note.operation === "create") {
    const file = safePath(vault, note.path),
      stat = fs.lstatSync(file, { throwIfNoEntry: false })
    if (stat) {
      if (
        !creationReceipt ||
        creationReceipt.path !== note.path ||
        creationReceipt.sha256 !== note.sha256 ||
        !stat.isFile() ||
        sha256(fs.readFileSync(file)) !== note.sha256
      )
        throw Error("New preview note destination already exists without matching creation receipt")
      return { path: note.path, sha256: note.sha256, created: false }
    }
    atomicCreate(vault, note.path, note.content)
    return { path: note.path, sha256: note.sha256, created: true }
  }
  if (note.operation !== undefined && note.operation !== "replace")
    throw Error("Unknown approved note operation")
  const before = fs.readFileSync(safePath(vault, note.path))
  if (sha256(before) !== note.previous_sha256) throw Error("Preview replacement input changed")
  atomicWrite(vault, note.path, note.content)
  return { path: note.path, sha256: note.sha256, created: false }
}

// The canonical index is navigation, not a second concept approval. Derive only
// links to approved new concepts, while preserving its existing prose and dates.
export function conceptIndexProjection(vault, notes) {
  const created = notes.filter((n) => n.operation === "create" && n.path.startsWith("Knowledge/"))
  if (!created.length) return null
  const relative = "Knowledge/00 Tech Encyclopedia Index.md"
  const before = fs.readFileSync(safePath(vault, relative)),
    index = parseNote(before.toString("utf8"))
  if (index.meta.entry_type !== "index" || index.meta.schema_version !== "tech-encyclopedia/v2")
    throw Error("Canonical concept navigation index required")
  const current = sections(index.body, 2).find((s) => s.title === "포함하는 개념")
  if (!current) throw Error("Canonical index concept section required")
  const groups = new Map(),
    days = []
  for (const n of created) {
    if (/[\[\]|#]/.test(n.path)) throw Error("New concept path cannot contain wiki delimiters")
    const meta = parseNote(n.content).meta,
      key = n.path.replace(/\.md$/, "")
    const existing = [...index.body.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map((m) => m[1])
    if (existing.includes(key)) throw Error("New concept already appears in canonical navigation")
    if (!groups.has(meta.domain)) groups.set(meta.domain, [])
    groups.get(meta.domain).push(`- [[${key}|${meta.label}]]`)
    days.push(meta.last_reviewed)
  }
  const appended = [...groups]
    .map(([domain, links]) => `### ${domain}\n\n${links.join("\n")}`)
    .join("\n\n")
  const pattern = /(^## 포함하는 개념\n)([\s\S]*?)(?=^## |$(?![\s\S]))/m
  if (!pattern.test(index.body)) throw Error("Canonical index concept section cannot be projected")
  const body = index.body.replace(
    pattern,
    (_, heading, contents) => heading + contents.trimEnd() + "\n\n" + appended + "\n\n",
  )
  const content = noteText(
    { ...index.meta, updated: [index.meta.updated, ...days].sort().at(-1) },
    body,
  )
  return { path: relative, previous_sha256: sha256(before), sha256: sha256(content), content }
}

// Copy the trusted renderer and authoring vault into a private working directory.
// Only installed dependencies are shared; Quartz caches and all generated output
// belong to this copy. No model, Drive, Git or publication command is invoked.
export async function privatePreview(
  root,
  run,
  approvedRuns,
  {
    repo = process.cwd(),
    vault = "vault",
    knowledgeRuns = [],
    editionSpec = null,
    legacyReviews = [],
    sourceAlternatives = [],
  } = {},
) {
  validRun(run)
  if (
    (!approvedRuns.length && !knowledgeRuns.length && !legacyReviews.length) ||
    new Set(approvedRuns).size !== approvedRuns.length ||
    new Set(knowledgeRuns).size !== knowledgeRuns.length ||
    approvedRuns.includes(run) ||
    knowledgeRuns.includes(run)
  )
    throw Error("Distinct approved input runs required")
  repo = path.resolve(repo)
  vault = path.resolve(repo, vault)
  const approvals = approvedRuns.map((id) => loadCurrentApproval(root, id, { vault }))
  if (sourceAlternatives.length && !editionSpec)
    throw Error("New-edition alternate-source references required")
  const sourceOriginals = loadPreviewSourceAlternatives(root, sourceAlternatives, approvals)
  const knowledge = knowledgeRuns.map((id) => loadNoteApproval(root, id, { vault }))
  assertPreviewConceptNotes(approvals, knowledge)
  const notes = knowledge.flatMap((k) => k.approval.notes)
  if (legacyReviews.length && editionSpec)
    throw Error("Legacy transition requires retrospective approved articles")
  if (editionSpec) assertNewEditionSourceCutoff(approvals, editionSpec)
  const projections =
      approvals.length || legacyReviews.length
        ? editionSpec
          ? newEditionProjections(
              vault,
              approvals.map((a) => a.article),
              editionSpec,
              notes,
              sourceOriginals,
            )
          : retrospectiveProjections(
              vault,
              approvals.map((a) => a.article),
              notes,
              legacyReviews,
            )
        : [],
    sourceFiles = fingerprints(vault),
    runtime = runtimeFiles(repo),
    navigation = conceptIndexProjection(vault, notes),
    input = {
      schema: "private-reader-preview/v1",
      preview_implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      node_version: process.version,
      approvals,
      knowledge,
      ...(editionSpec ? { edition_spec: editionSpec } : {}),
      ...(sourceAlternatives.length ? { source_alternatives: sourceAlternatives } : {}),
      ...(legacyReviews.length
        ? {
            legacy_reviews: legacyReviews,
            legacy_transition_sha256: sha256(
              fs.readFileSync(new URL("./legacy-transition.mjs", import.meta.url)),
            ),
            legacy_review_units_sha256: sha256(
              fs.readFileSync(new URL("./legacy-review.mjs", import.meta.url)),
            ),
          }
        : {}),
      source_vault: vault,
      source_files: sourceFiles,
      runtime_files: runtime,
      ...(navigation ? { navigation } : {}),
    },
    state = new RunState(root, run, input, { scope: "preview" }),
    relativeWorkspace = `runs/${run}/preview-workspace`,
    workspace = safePath(root, relativeWorkspace)
  const sourceFeed = editionSpec
    ? await state.stage("source-feed", { sourceFiles, runtime }, () =>
        newEditionFeedBaseline(root, run, vault),
      )
    : null
  if (sourceFeed && sha256(fs.readFileSync(safePath(root, sourceFeed.path))) !== sourceFeed.sha256)
    throw Error("Source feed baseline changed")
  if (new Set(notes.map((n) => n.path)).size !== notes.length)
    throw Error("Multiple knowledge approvals replace the same canonical note")
  assertConceptConflicts(vault, notes)
  if (workspace === vault || workspace.startsWith(vault + path.sep))
    throw Error("Private workspace cannot overlap the source vault")
  const resumeWorkspace = ["running", "failed"].includes(state.state.stages.workspace?.status)
  const staged = await state.stage("workspace", input, () => {
    copyFiles(vault, path.join(workspace, "vault"), sourceFiles)
    copyFiles(repo, workspace, runtime)
    const dependencies = path.join(repo, "node_modules")
    if (
      !fs.existsSync(dependencies) ||
      !fs.lstatSync(dependencies).isDirectory() ||
      fs.realpathSync(dependencies) !== dependencies
    )
      throw Error("Installed local dependencies required")
    const link = path.join(workspace, "node_modules")
    if (fs.existsSync(link)) {
      if (!fs.lstatSync(link).isSymbolicLink() || fs.realpathSync(link) !== dependencies)
        throw Error("Unexpected private dependency path")
    } else fs.symlinkSync(dependencies, link, "dir")
    for (const projection of projections)
      atomicWrite(path.join(workspace, "vault"), projection.path, projection.content)
    for (const note of notes) {
      const receiptPath = `runs/${run}/preview/created-notes/${sha256(note.path)}.json`
      const prior = resumeWorkspace ? readJSON(root, receiptPath) : null
      const receipt = prior?.input_hash === state.state.input_hash ? prior : null
      const applied = stageApprovedNote(path.join(workspace, "vault"), note, {
        creationReceipt: receipt,
      })
      if (applied.created)
        atomicWrite(root, receiptPath, {
          path: note.path,
          sha256: note.sha256,
          input_hash: state.state.input_hash,
        })
    }
    if (navigation)
      stageApprovedNote(path.join(workspace, "vault"), { ...navigation, operation: "replace" })
    return {
      knowledge: notes.map(({ path: notePath, sha256 }) => ({ path: notePath, sha256 })),
      editions: projections.map(({ path: notePath, content, event_ids }) => ({
        path: notePath,
        sha256: sha256(content),
        event_ids,
      })),
      ...(navigation
        ? {
            navigation: {
              path: navigation.path,
              previous_sha256: navigation.previous_sha256,
              sha256: navigation.sha256,
            },
          }
        : {}),
      authoring: fingerprints(
        path.join(workspace, "vault"),
        PUBLIC_ROOTS.flatMap((folder) => filesUnder(path.join(workspace, "vault", folder))),
      ),
    }
  })
  assertFiles(workspace, runtime, "Private renderer changed")
  assertFiles(path.join(workspace, "vault"), staged.authoring, "Private authoring input changed")
  for (const [name, script, args] of [
    ["refresh", "scripts/garden.mjs", ["refresh"]],
    ["knowledge-sync", "scripts/knowledge.mjs", ["sync"]],
    ["knowledge-check", "scripts/knowledge.mjs", ["check"]],
    ["validate", "scripts/garden.mjs", ["validate"]],
    ["build", "scripts/build-site.mjs", []],
    ["verify", "scripts/verify-site.mjs", []],
  ]) {
    const result = await state.stage(name, { staged, runtime }, () =>
      execute(workspace, root, `runs/${run}/preview/${name}.log`, script, args),
    )
    if (sha256(fs.readFileSync(safePath(root, result.log))) !== result.log_sha256)
      throw Error("Private preview command log changed")
  }
  assertSnapshot(vault, sourceFiles, "Original vault changed during private preview")
  assertFiles(
    path.join(workspace, "vault"),
    staged.authoring,
    "Private renderer changed authoring inputs",
  )
  assertFiles(repo, runtime, "Original renderer changed during private preview")
  for (const approval of approvals)
    if (
      sha256(JSON.stringify(loadCurrentApproval(root, approval.run, { vault }))) !==
      sha256(JSON.stringify(approval))
    )
      throw Error("Editorial approval changed during private preview")
  if (
    JSON.stringify([...loadPreviewSourceAlternatives(root, sourceAlternatives, approvals)]) !==
    JSON.stringify([...sourceOriginals])
  )
    throw Error("Alternate-source identity changed during private preview")
  for (const approved of knowledge)
    if (
      sha256(JSON.stringify(loadNoteApproval(root, approved.run, { vault }))) !==
      sha256(JSON.stringify(approved))
    )
      throw Error("Knowledge approval changed during private preview")
  const consistency = await state.stage(
    "consistency",
    { staged, approvals, knowledge },
    async () => ({
      ...(await verifyRetrospectiveOutputs(
        workspace,
        approvals.map((a) => a.article),
        projections,
        fs.readFileSync(
          sourceFeed ? safePath(root, sourceFeed.path) : path.join(vault, "briefing.xml"),
          "utf8",
        ),
        { newEdition: !!editionSpec },
      )),
      knowledge: verifyKnowledgeOutputs(workspace, notes),
      concept_assignments: verifyReviewedConceptOutputs(workspace, approvals),
    }),
  )
  const result = await state.stage("outputs", { staged, runtime }, () => ({
    schema: "private-reader-preview/v1",
    run_id: run,
    approved_runs: approvedRuns,
    ...(sourceAlternatives.length ? { source_alternatives: sourceAlternatives } : {}),
    ...(editionSpec ? { edition_spec: editionSpec, coverage_complete: false } : {}),
    ...(legacyReviews.length ? { legacy_reviews: legacyReviews } : {}),
    ...(sourceFeed ? { source_feed: sourceFeed } : {}),
    knowledge_runs: knowledgeRuns,
    observed_at: new Date().toISOString(),
    workspace: relativeWorkspace,
    editions: staged.editions,
    knowledge: staged.knowledge,
    ...(staged.navigation ? { navigation: staged.navigation } : {}),
    consistency,
    public: fingerprints(path.join(workspace, "public")),
    digest: fingerprints(path.join(workspace, "digest")),
    source_files: sourceFiles.length,
    candidate_published: false,
    drive_verified: false,
    browser_verified: false,
  }))
  assertSnapshot(path.join(workspace, "public"), result.public, "Private reader output changed")
  assertSnapshot(path.join(workspace, "digest"), result.digest, "Private digest output changed")
  atomicWrite(root, `runs/${run}/preview-manifest.json`, result)
  return {
    workspace,
    editions: result.editions.length,
    knowledge_notes: result.knowledge.length,
    public_files: result.public.length,
    candidate_published: false,
    drive_verified: false,
    browser_verified: false,
  }
}
