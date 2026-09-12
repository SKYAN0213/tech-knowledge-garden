import fs from "node:fs"
import path from "node:path"
import { walk } from "./garden.mjs"
const files = walk("public"),
  errors = []
const index = JSON.parse(fs.readFileSync("public/static/contentIndex.json"))
for (const [slug, item] of Object.entries(index))
  if (!item.title) errors.push(`Missing title: ${slug}`)
for (const f of files.filter((f) => f.endsWith(".html"))) {
  const text = fs.readFileSync(f, "utf8")
  for (const m of text.matchAll(/\b(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const url = m[1].replaceAll("&amp;", "&")
    if (/^(https?:|mailto:|data:|javascript:|obsidian:|\/\/)/.test(url)) continue
    const clean = decodeURIComponent(url.split("?")[0])
    const resolved = clean.startsWith("/")
      ? path.resolve("public", clean.replace(/^\/(?:tech-knowledge-garden\/?)?/, ""))
      : path.resolve(path.dirname(f), clean)
    if (
      ![resolved, resolved + ".html", path.join(resolved, "index.html")].some((p) =>
        fs.existsSync(p),
      )
    )
      errors.push(`${f}: ${url}`)
  }
}
const rss = fs.readFileSync("public/briefing.xml", "utf8")
for (const m of rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)) {
  const u = new URL(m[1])
  const slug = decodeURIComponent(u.pathname.replace(/^\/tech-knowledge-garden\//, ""))
  if (!fs.existsSync(path.join("public", slug + ".html")))
    errors.push(`RSS destination missing: ${slug}`)
}
if (files.some((f) => /\.local|automation\.toml|manifest\.json|\.obsidian/.test(f)))
  errors.push("Operational files leaked into output")
if (fs.readFileSync("public/index.html", "utf8").includes("generated_by:"))
  errors.push("Frontmatter leaked into rendered page")
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else
  console.log(
    `PASS: ${files.filter((f) => f.endsWith(".html")).length} HTML pages, local links/assets, ${Object.keys(index).length} search entries and RSS destinations.`,
  )
