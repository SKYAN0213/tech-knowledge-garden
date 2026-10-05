import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { editions, extractArticles, parseNote, walk } from "./garden.mjs"

// Generated reader notes are projections, not the authoring notes stored in Drive.
export function noteLineage(notes, issues, topics) {
  const appearances = new Map()
  for (const issue of issues) {
    for (const article of issue.articles) {
      const paths = appearances.get(article.id) || []
      if (!paths.includes(issue.path)) paths.unshift(issue.path)
      appearances.set(article.id, paths)
    }
  }
  const topicPaths = new Map()
  for (const topic of topics) {
    if (topicPaths.has(topic.id)) throw Error("Duplicate source topic ID: " + topic.id)
    topicPaths.set(topic.id, topic.path)
  }
  const issuePaths = new Set(issues.map((i) => i.path))
  return Object.fromEntries(notes.map((note) => {
    let sources = []
    if (note.meta.type === "news") sources = appearances.get(note.meta.event_id) || []
    else if (note.meta.type === "briefing-index") {
      const source = note.meta.edition + ".md"
      if (issuePaths.has(source)) sources = [source]
    } else if (note.meta.type === "briefing-topic") {
      const source = topicPaths.get(note.meta.topic_id)
      if (source) sources = [source]
    } else if (note.path.startsWith("Knowledge/")) sources = [note.path + ".md"]
    return [note.slug, sources]
  }))
}

export function loadNoteLineage(root) {
  const vault = path.join(root, "vault")
  const notes = JSON.parse(fs.readFileSync(path.join(root, ".local/site-notes.json")))
  const issues = editions(vault).map((issue) => ({
    path: issue.slug + ".md", articles: extractArticles(issue),
  }))
  const topics = walk(path.join(vault, "TrendTopics"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({ id: parseNote(fs.readFileSync(file, "utf8")).meta.id,
      path: path.relative(vault, file).split(path.sep).join("/") }))
  const mapping = noteLineage(notes, issues, topics)
  const sources = {}
  for (const relative of new Set(Object.values(mapping).flat())) {
    const target = path.resolve(vault, relative)
    if (!target.startsWith(vault + path.sep) || fs.lstatSync(target).isSymbolicLink())
      throw Error("Unsafe source note path: " + relative)
    const bytes = fs.readFileSync(target)
    sources[relative] = { sha256: crypto.createHash("sha256").update(bytes).digest("hex") }
  }
  return { schema: "website-note-lineage/v1", mapping, sources }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(JSON.stringify(loadNoteLineage(path.resolve(process.argv[2] || "."))))
}
