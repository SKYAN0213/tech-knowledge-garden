import fs from "node:fs"
import path from "node:path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import RSSParser from "rss-parser"
import { editions, extractArticles, parseNote, walk, canonicalURL } from "../garden.mjs"
import { makeResolver } from "../links.mjs"
import { PUBLIC_ROOTS, sha256, sourceId } from "./contracts.mjs"
import { RunState } from "./run-state.mjs"
import { legacyReviewUnits, loadEmptyLegacyReviews } from "./legacy-review.mjs"

const distinct = (xs) => [...new Set(xs)].sort()
const markdown = unified().use(remarkParse)
const text = (node) => node.value || (node.children || []).map(text).join("")
function traverse(node, action) {
  action(node)
  for (const child of node.children || []) traverse(child, action)
}
function metadataStrings(value, field = "$", action) {
  if (typeof value === "string") action(value, field)
  else if (Array.isArray(value))
    value.forEach((item, i) => metadataStrings(item, `${field}[${i}]`, action))
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value))
      metadataStrings(item, `${field}.${key}`, action)
}
function externalURLs(body) {
  const urls = []
  traverse(markdown.parse(body), (node) => {
    if (["link", "definition"].includes(node.type) && /^https?:\/\//.test(node.url || ""))
      urls.push({ url: node.url, line: node.position.start.line, kind: node.type })
    // Code and images are not prose source references.
    if (node.type === "text")
      for (const match of node.value.matchAll(/https?:\/\/[^\s<>"'\])]+/g))
        urls.push({ url: match[0], line: node.position.start.line, kind: "literal" })
  })
  return urls
}
function wikiReferences(body) {
  const references = []
  traverse(markdown.parse(body), (node) => {
    if (node.type !== "text") return
    for (const match of node.value.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g))
      references.push(match[1])
  })
  return distinct(references)
}

// This inventories authored records. A legacy section is a review unit, not an
// automatically inferred event; sharing a URL never merges two event identities.
export async function retrospectiveInventory(
  vault,
  { observedAt = new Date().toISOString(), reviewRoot = null } = {},
) {
  const base = path.resolve(vault)
  if (fs.realpathSync(base) !== base) throw Error("Inventory vault cannot follow a symlink")
  const privateReviews = loadEmptyLegacyReviews(reviewRoot)
  const reviewHashes = Object.fromEntries(
    privateReviews.map((review) => [review.path, review.sha256]),
  )
  const notes = PUBLIC_ROOTS.flatMap((folder) => {
    const directory = path.join(base, folder)
    if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory())
      throw Error("Missing authoring folder: " + folder)
    return walk(directory)
      .filter((file) => file.endsWith(".md"))
      .map((file) => {
        const bytes = fs.readFileSync(file)
        return {
          file,
          path: path.relative(base, file),
          sha256: sha256(bytes),
          ...parseNote(bytes.toString("utf8")),
        }
      })
  })
  const hashes = Object.fromEntries(notes.map((n) => [n.path, n.sha256]))
  const resolve = makeResolver(notes.map((n) => ({ ...n, path: n.path.replace(/\.md$/, "") })))
  const sources = new Map(),
    groups = new Map(),
    diagnostics = [],
    generatedDependencies = new Map()
  const addSource = (url, reference) => {
    try {
      const parsed = new URL(url)
      if (parsed.username || parsed.password) throw Error("Source URL includes credentials")
      const canonical = canonicalURL(url),
        id = sourceId(url)
      const source = sources.get(id) || {
        source_id: id,
        url,
        canonical_url: canonical,
        references: [],
      }
      if (!source.references.some((r) => JSON.stringify(r) === JSON.stringify(reference)))
        source.references.push(reference)
      sources.set(id, source)
      if (!groups.has(canonical))
        groups.set(canonical, {
          canonical_url: canonical,
          source_ids: [],
          event_ids: [],
          legacy_units: [],
          note_paths: [],
        })
      const group = groups.get(canonical)
      group.source_ids.push(id)
      if (reference.event_id) group.event_ids.push(reference.event_id)
      if (reference.legacy_unit_id) group.legacy_units.push(reference.legacy_unit_id)
      group.note_paths.push(reference.path)
      return id
    } catch (error) {
      // Inventory malformed authoring instead of silently counting it as a source.
      diagnostics.push({ kind: "invalid_source_reference", ...reference, reason: error.message })
      return null
    }
  }
  const noteRows = notes.map((n) => {
    const source_ids = []
    metadataStrings(n.meta, "$", (value, field) => {
      if (/^https?:\/\//.test(value))
        source_ids.push(addSource(value, { path: n.path, kind: "metadata", field }))
    })
    for (const { url, line, kind } of externalURLs(n.body))
      source_ids.push(addSource(url, { path: n.path, kind, body_line: line }))
    const rawLinks = wikiReferences(n.body)
    metadataStrings(n.meta, "$", (value) => rawLinks.push(...wikiReferences(value)))
    const links = distinct(rawLinks).map((target) => {
      try {
        const resolved = resolve(target, n.path.replace(/\.md$/, ""))
        return {
          target,
          path: resolved.note.path + ".md",
          fragment: resolved.hash || null,
          authority: "authoring",
        }
      } catch (error) {
        const [file, ...fragment] = target.split("#")
        const generated = path.resolve(base, file + ".md")
        if (
          /^(?:Briefings|News|Trends|Knowledge Maps)\//.test(file) &&
          generated.startsWith(base + path.sep) &&
          fs.existsSync(generated)
        ) {
          if (fs.realpathSync(generated) !== generated || !fs.lstatSync(generated).isFile())
            throw Error("Generated reference cannot follow a symlink")
          const relative = path.relative(base, generated)
          generatedDependencies.set(relative, sha256(fs.readFileSync(generated)))
          return {
            target,
            path: relative,
            fragment: fragment.join("#") || null,
            authority: "generated",
          }
        }
        diagnostics.push({
          kind: "unresolved_note_reference",
          path: n.path,
          target,
          reason: error.message,
        })
        return { target, path: null, fragment: null }
      }
    })
    return {
      path: n.path,
      sha256: n.sha256,
      type: n.meta.type || null,
      schema_version: n.meta.schema_version || null,
      source_ids: distinct(source_ids.filter(Boolean)),
      links,
    }
  })
  const concepts = notes
    .filter((n) => n.path.startsWith("Knowledge/"))
    .map((n) => ({
      path: n.path,
      concept_id: n.meta.concept_id || null,
      title: n.meta.title || path.basename(n.path, ".md"),
      entry_type: n.meta.entry_type || null,
      aliases: n.meta.aliases || [],
      last_reviewed: n.meta.last_reviewed || null,
      map_review: n.meta.map_review || null,
      verified_sources: n.meta.verified_sources || [],
    }))
  const relations = notes
    .filter((n) => n.meta.concept_id)
    .flatMap((n) =>
      ["relations", "connections"].flatMap((field) =>
        (n.meta[field] || []).map((r, index) => ({
          path: n.path,
          field,
          index,
          source: n.meta.concept_id,
          target: r.target,
          reason: r.reason,
          basis: r.basis || null,
          type: r.type || null,
          evidence: r.evidence || [],
        })),
      ),
    )
  const signals = notes
    .filter((n) => n.path.startsWith("Signals/"))
    .map((n) => ({
      path: n.path,
      edition: n.meta.edition,
      date: n.meta.date,
      reviewed: n.meta.reviewed,
      review_basis: n.meta.review_basis,
      observations: n.meta.observations || [],
    }))
  const topics = notes
    .filter((n) => n.path.startsWith("TrendTopics/"))
    .map((n) => ({
      path: n.path,
      id: n.meta.id,
      reviewed: n.meta.reviewed,
      title: n.meta.title,
      knowledge_notes: n.meta.knowledge_notes || [],
      lessons: n.meta.lessons || [],
    }))
  const eventMap = new Map(),
    legacy = [],
    excluded = new Map()
  const all = editions(base)
  for (const edition of all) {
    const relative = path.relative(base, edition.file)
    if (sha256(fs.readFileSync(edition.file)) !== hashes[relative])
      throw Error("Edition changed during inventory")
    for (const id of edition.meta.excluded_events || []) {
      if (!excluded.has(id)) excluded.set(id, { event_id: id, edition_paths: [] })
      excluded.get(id).edition_paths.push(relative)
    }
    if (edition.meta.schema_version !== "tech-ai-magazine/v2") {
      const units = legacyReviewUnits(edition.body, relative, (content, id) =>
        distinct(
          externalURLs(content)
            .map(({ url }) => addSource(url, { path: relative, legacy_unit_id: id }))
            .filter(Boolean),
        ),
      )
      legacy.push({
        path: relative,
        date: edition.meta.date,
        sha256: hashes[relative],
        schema_version: edition.meta.schema_version || null,
        review_status: "unreviewed",
        units,
      })
      continue
    }
    for (const article of extractArticles(edition)) {
      const event = eventMap.get(article.id) || { event_id: article.id, appearances: [] }
      event.appearances.push({
        path: relative,
        date: edition.meta.date,
        title: article.title,
        review_status: article.review.review_status,
        published_at: article.review.published_at || null,
        reviewed_at: article.review.reviewed_at || null,
        source_urls: article.urls,
        concept_ids: article.review.concept_ids,
        concept_paths: article.concepts,
        topic_ids: article.editorial?.topic_ids || [],
      })
      for (const url of article.urls) addSource(url, { path: relative, event_id: article.id })
      eventMap.set(article.id, event)
    }
  }
  for (const review of privateReviews) {
    for (const record of review.packet.records) {
      const current = legacy.find((edition) => edition.path === record.path)
      if (!current || current.sha256 !== record.sha256) {
        diagnostics.push({
          kind: "stale_empty_record_review",
          path: record.path,
          review: review.path,
        })
        continue
      }
      if (current.review_status !== "unreviewed") throw Error("Conflicting private legacy reviews")
      current.review_status = "empty_record"
      current.review = {
        path: review.path,
        sha256: review.sha256,
        reviewer: review.packet.reviewer,
        reviewed_at: review.packet.reviewed_at,
      }
    }
  }
  const sourceGroups = [...groups.values()]
    .map((g) =>
      Object.fromEntries(
        Object.entries(g).map(([k, v]) => [k, Array.isArray(v) ? distinct(v) : v]),
      ),
    )
    .sort((a, b) => a.canonical_url.localeCompare(b.canonical_url))
  const events = [...eventMap.values()]
    .map((event) => {
      const statuses = distinct(event.appearances.map((a) => a.review_status))
      const dates = distinct(event.appearances.map((a) => a.published_at).filter(Boolean))
      const sourceURLs = distinct(event.appearances.flatMap((a) => a.source_urls).map(canonicalURL))
      const observations = signals.flatMap((s) =>
        s.observations
          .filter((o) => o.event_id === event.event_id)
          .map((o) => ({ path: s.path, observation_id: o.id, topic_id: o.topic_id })),
      )
      const explicitConcepts = distinct(
        event.appearances.flatMap((a) => [
          ...a.concept_paths.map((p) => p + ".md"),
          ...concepts.filter((c) => a.concept_ids.includes(c.concept_id)).map((c) => c.path),
        ]),
      )
      const sourceDependentConcepts = concepts
        .filter((c) => c.verified_sources.some((u) => sourceURLs.includes(canonicalURL(u))))
        .map((c) => c.path)
      const topicIds = distinct([
        ...event.appearances.flatMap((a) => a.topic_ids),
        ...observations.map((o) => o.topic_id),
      ])
      return {
        ...event,
        review_status: statuses.length === 1 ? statuses[0] : "mixed",
        date_review_required: dates.length !== 1 || event.appearances.some((a) => !a.published_at),
        published_at: dates.length === 1 ? dates[0] : null,
        dependencies: {
          edition_paths: distinct(event.appearances.map((a) => a.path)),
          observations,
          topic_paths: topics.filter((t) => topicIds.includes(t.id)).map((t) => t.path),
          explicit_concept_paths: explicitConcepts,
          shared_source_concept_paths: distinct(sourceDependentConcepts),
        },
      }
    })
    .sort(
      (a, b) =>
        b.appearances.at(-1).date.localeCompare(a.appearances.at(-1).date) ||
        a.event_id.localeCompare(b.event_id),
    )
  const rssFile = path.join(base, "briefing.xml")
  if (!fs.existsSync(rssFile)) throw Error("Existing RSS required for retrospective inventory")
  const rssBytes = fs.readFileSync(rssFile)
  const rss = await new RSSParser().parseString(rssBytes.toString("utf8"))
  for (const note of notes)
    if (sha256(fs.readFileSync(note.file)) !== note.sha256)
      throw Error("Authoring changed during inventory")
  const finalFiles = PUBLIC_ROOTS.flatMap((folder) =>
    walk(path.join(base, folder)).filter((file) => file.endsWith(".md")),
  ).sort()
  if (JSON.stringify(finalFiles) !== JSON.stringify(notes.map((n) => n.file).sort()))
    throw Error("Authoring file list changed during inventory")
  for (const [relative, hash] of generatedDependencies)
    if (sha256(fs.readFileSync(path.join(base, relative))) !== hash)
      throw Error("Generated reference changed during inventory")
  if (sha256(fs.readFileSync(rssFile)) !== sha256(rssBytes))
    throw Error("RSS changed during inventory")
  if (
    JSON.stringify(reviewHashes) !==
    JSON.stringify(
      Object.fromEntries(
        loadEmptyLegacyReviews(reviewRoot).map((review) => [review.path, review.sha256]),
      ),
    )
  )
    throw Error("Private legacy reviews changed during inventory")
  return {
    schema: "research-retrospective-inventory/v1",
    observed_at: observedAt,
    hashes,
    notes: noteRows,
    events,
    legacy,
    private_legacy_review_hashes: reviewHashes,
    concepts,
    relations,
    signals,
    topics,
    generated_dependencies: Object.fromEntries(
      [...generatedDependencies].sort(([a], [b]) => a.localeCompare(b)),
    ),
    excluded_events: [...excluded.values()],
    sources: [...sources.values()].sort((a, b) => a.source_id.localeCompare(b.source_id)),
    source_groups: sourceGroups,
    rss: {
      sha256: sha256(rssBytes),
      items: rss.items.map(({ guid, pubDate, link }) => ({ guid, pubDate, link })),
    },
    diagnostics,
    counts: {
      authoring_notes: notes.length,
      v2_editions: all.length - legacy.length,
      legacy_editions: legacy.length,
      legacy_units: legacy.reduce((n, e) => n + e.units.length, 0),
      empty_legacy_records: legacy.filter((e) => e.review_status === "empty_record").length,
      empty_legacy_units: legacy
        .filter((e) => e.review_status === "empty_record")
        .reduce((n, e) => n + e.units.length, 0),
      legacy_editions_requiring_review: legacy.filter((e) => e.review_status === "unreviewed")
        .length,
      legacy_units_requiring_review: legacy
        .filter((e) => e.review_status === "unreviewed")
        .reduce((n, e) => n + e.units.length, 0),
      distinct_events: events.length,
      appearances: events.reduce((n, e) => n + e.appearances.length, 0),
      verified_events: events.filter((e) => e.review_status === "verified").length,
      events_requiring_review: events.filter(
        (e) => e.review_status !== "verified" || e.date_review_required,
      ).length,
      concepts: concepts.filter((c) => c.entry_type === "concept").length,
      knowledge_notes: concepts.length,
      authored_relations: relations.length,
      signals: signals.length,
      topics: topics.length,
      sources: sources.size,
      source_url_groups: sourceGroups.length,
      rss_items: rss.items.length,
    },
  }
}

export async function saveRetrospectiveInventory(root, runId, vault) {
  const implementations = Object.fromEntries(
    [
      "retrospective.mjs",
      "legacy-review.mjs",
      "../garden.mjs",
      "../links.mjs",
      "../article-review.mjs",
      "../themes.mjs",
      "../editorial.mjs",
      "../sectors.mjs",
    ].map((file) => [file, sha256(fs.readFileSync(new URL(file, import.meta.url)))]),
  )
  const current = await retrospectiveInventory(vault, { reviewRoot: root })
  const state = new RunState(
    root,
    runId,
    {
      schema: current.schema,
      vault: fs.realpathSync(vault),
      hashes: current.hashes,
      rss_sha256: current.rss.sha256,
      generated_dependencies: current.generated_dependencies,
      private_legacy_review_hashes: current.private_legacy_review_hashes,
      implementations,
    },
    { scope: "retrospective" },
  )
  const saved = await state.stage(
    "inventory",
    { hashes: current.hashes, rss_sha256: current.rss.sha256 },
    () => current,
  )
  if (
    sha256(JSON.stringify({ ...saved, observed_at: null })) !==
    sha256(JSON.stringify({ ...current, observed_at: null }))
  )
    throw Error("Saved inventory differs from current authored records")
  return {
    inventory: `runs/${runId}/retrospective/inventory.json`,
    counts: saved.counts,
    diagnostics: saved.diagnostics.length,
    authoring_mutated: false,
    drive_verified: false,
    published: false,
  }
}
