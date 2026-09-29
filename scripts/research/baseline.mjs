import fs from "node:fs"
import path from "node:path"
import { walk, parseNote, extractArticles, editions } from "../garden.mjs"
import { PUBLIC_ROOTS, sha256, sourceId } from "./contracts.mjs"
import { atomicWrite } from "./run-state.mjs"

export function inventory(vault) {
  const notes = PUBLIC_ROOTS.flatMap((folder) => {
    if (!fs.existsSync(path.join(vault, folder))) throw Error("Missing authoring folder: " + folder)
    return walk(path.join(vault, folder)).filter((p) => p.endsWith(".md"))
  })
  const hashes = {},
    sources = new Map(),
    items = [],
    legacy = []
  for (const file of notes) {
    const text = fs.readFileSync(file, "utf8"),
      relative = path.relative(vault, file)
    hashes[relative] = sha256(text)
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'\])]+/g)) {
      try {
        const id = sourceId(match[0])
        const entry = sources.get(id) || { source_id: id, url: match[0], notes: [] }
        if (!entry.notes.includes(relative)) entry.notes.push(relative)
        sources.set(id, entry)
      } catch {
        /* malformed prose is not a downloadable URL */
      }
    }
  }
  for (const edition of editions(vault)) {
    const relative = path.relative(vault, edition.file)
    if (edition.meta.schema_version !== "tech-ai-magazine/v2") {
      legacy.push({
        path: relative,
        schema_version: edition.meta.schema_version || null,
        headings: [...edition.body.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1]),
        review_status: "unreviewed",
      })
    } else
      items.push(
        ...extractArticles(edition).map((a) => ({
          event_id: a.id,
          title: a.title,
          path: relative,
          urls: a.urls,
          review_status: a.review?.review_status || "unreviewed",
        })),
      )
  }
  const rssFile = path.join(vault, "briefing.xml"),
    rss = fs.existsSync(rssFile) ? fs.readFileSync(rssFile, "utf8") : ""
  const rss_items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    guid: m[1].match(/<guid[^>]*>(.*?)<\/guid>/s)?.[1],
    pubDate: m[1].match(/<pubDate>(.*?)<\/pubDate>/s)?.[1],
  }))
  return {
    schema: "research-baseline/v1",
    observed_at: new Date().toISOString(),
    notes: Object.keys(hashes).length,
    hashes,
    editions: { v2: editions(vault).length - legacy.length, legacy: legacy.length },
    articles: items,
    legacy,
    sources: [...sources.values()],
    rss_items,
    counts: {
      article_appearances: items.length,
      distinct_events: new Set(items.map((a) => a.event_id)).size,
      verified_events: new Set(
        items.filter((a) => a.review_status === "verified").map((a) => a.event_id),
      ).size,
      legacy_editions_unreviewed: legacy.length,
    },
  }
}
export function saveBaseline(root, id, vault) {
  const result = inventory(vault)
  for (const [relative, hash] of Object.entries(result.hashes)) {
    const bytes = fs.readFileSync(path.join(vault, relative))
    if (sha256(bytes) !== hash) throw Error("Original changed during baseline")
    atomicWrite(root, `baselines/${id}/vault/${relative}`, bytes)
  }
  atomicWrite(root, `baselines/${id}/inventory.json`, result)
  return result
}
