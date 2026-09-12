import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import YAML from "yaml"
import { walk, parseNote, noteText } from "./garden.mjs"

const source = path.resolve(process.argv[2] || "")
if (!process.argv[2] || !fs.existsSync(path.join(source, "Knowledge")))
  throw new Error("Usage: node scripts/migrate.mjs <old Tech Knowledge directory>")
const local = path.resolve(".local/migration")
const manifestPath = path.join(local, "manifest.json")
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath))
  for (const item of manifest.files) {
    if (hash(fs.readFileSync(path.join(local, "source", item.original))) !== item.sha256)
      throw new Error(`Backup mismatch: ${item.original}`)
    if (item.destination && !fs.existsSync(item.destination))
      throw new Error(`Missing migrated file: ${item.destination}`)
  }
  console.log(
    `Already migrated; ${manifest.files.length} backups verified. Existing edits preserved.`,
  )
  process.exit(0)
}
fs.mkdirSync(local, { recursive: true })
const files = walk(source).filter((f) => path.basename(f) !== ".DS_Store")
const mapping = new Map()
for (const f of files) {
  const rel = path.relative(source, f)
  if (!rel.endsWith(".md") || rel.startsWith("Automation/")) continue
  mapping.set(rel, rel.replace(/^Briefings\//, "Editions/"))
}
const names = new Map()
const rank = (x) =>
  x.startsWith("Knowledge/")
    ? 0
    : x.startsWith("Knowledge Maps/")
      ? 1
      : x.startsWith("Briefings/")
        ? 2
        : 3
for (const [old, dest] of [...mapping].sort((a, b) => rank(b[0]) - rank(a[0]))) {
  const { meta } = parseNote(fs.readFileSync(path.join(source, old), "utf8"))
  for (const n of [
    path.basename(old, ".md"),
    meta.title,
    ...(Array.isArray(meta.aliases) ? meta.aliases : []),
  ].filter(Boolean))
    names.set(n, dest.replace(/\.md$/, ""))
}
const manifest = { version: 1, source, created_at: new Date().toISOString(), files: [] }
for (const f of files) {
  const rel = path.relative(source, f),
    raw = fs.readFileSync(f)
  const backup = path.join(local, "source", rel)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  fs.writeFileSync(backup, raw)
  const dest = mapping.get(rel)
  const row = {
    original: rel,
    sha256: hash(raw),
    bytes: raw.length,
    destination: dest ? `vault/${dest}` : null,
  }
  if (dest) {
    const { meta, body } = parseNote(raw.toString("utf8"))
    if (rel.startsWith("Archive/")) delete meta.aliases
    const rewrite = (text) =>
      text.replace(/\[\[([^\]]+)\]\]/g, (all, rawLink) => {
        const [target, ...aliasParts] = rawLink.split("|")
        const [file, ...headingParts] = target.split("#")
        if (!file) return all
        const cleaned = file.replace(/^Tech Knowledge\//, "").replace(/\.md$/, "")
        const explicit = mapping.get(`${cleaned}.md`)
        const resolved = explicit?.replace(/\.md$/, "") || names.get(path.basename(cleaned))
        if (!resolved) return all
        const suffix = headingParts.length ? "#" + headingParts.join("#") : ""
        return `[[${resolved}${suffix}|${aliasParts.length ? aliasParts.join("|") : path.basename(file)}]]`
      })
    const output = rewrite(noteText(meta, body))
    const target = path.join("vault", dest)
    if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${target}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, output)
    row.migrated_sha256 = hash(output)
  }
  manifest.files.push(row)
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
const summary = {
  original_markdown: files.filter((f) => f.endsWith(".md")).length,
  reader_notes: mapping.size,
  operational_markdown: files.filter((f) => f.endsWith(".md")).length - mapping.size,
  backups: files.length,
  files: manifest.files.map(({ original, sha256, destination }) => ({
    original,
    sha256,
    destination,
  })),
}
fs.mkdirSync("data", { recursive: true })
fs.writeFileSync("data/migration.json", JSON.stringify(summary, null, 2) + "\n")
console.log(
  JSON.stringify(
    {
      original_markdown: summary.original_markdown,
      reader_notes: summary.reader_notes,
      operational_markdown: summary.operational_markdown,
      backups: summary.backups,
    },
    null,
    2,
  ),
)
