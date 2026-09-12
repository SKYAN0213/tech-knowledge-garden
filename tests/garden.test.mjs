import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import {
  canonicalURL,
  extractArticles,
  refresh,
  editions,
  walk,
  noteText,
} from "../scripts/garden.mjs"

test("Tracking parameters and fragments do not make duplicate events", () => {
  assert.equal(
    canonicalURL("https://example.org/announcement/?utm_source=rss#intro"),
    "https://example.org/announcement",
  )
  assert.notEqual(
    canonicalURL("https://example.org/releases?id=1"),
    canonicalURL("https://example.org/releases?id=2"),
  )
  assert.throws(() => canonicalURL("file:///etc/passwd"))
})
const issue = (date, url = "https://example.org/release/") => ({
  file: `${date}.md`,
  slug: `Editions/${date}`,
  meta: { schema_version: "tech-ai-magazine/v2", date, coverage_end: date + "T08:00:00+09:00" },
  body: `# 커버 스토리\n\n## 새 기술 발표\n\n**핵심:** 검증한 발표 내용입니다. [S1]\n\n[[Knowledge/Concept|개념]]\n\n# Source List\n\n- [S1] ${url}`,
})
test("The same announcement has one stable event ID across editions", () => {
  const a = extractArticles(issue("2026-09-11"))[0],
    b = extractArticles(issue("2026-09-12", "https://example.org/release/?utm_source=email"))[0]
  assert.equal(a.id, b.id)
  assert.deepEqual(a.concepts, ["Knowledge/Concept"])
  assert.equal(a.sources.S1, "https://example.org/release/")
})
test("Unresolved source markers stop article creation", () => {
  const a = issue("2026-09-11")
  a.body = a.body.replace("내용입니다. [S1]", "내용입니다. [S2]")
  assert.throws(() => extractArticles(a), /Unresolved/)
})
test("Missing historical metadata cannot displace the latest cutoff", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "garden-history-"))
  try {
    fs.mkdirSync(path.join(temp, "Editions"))
    fs.writeFileSync(path.join(temp, "Editions/2026-07-23_0803.md"), "# Historical")
    const a = issue("2026-09-11")
    fs.writeFileSync(path.join(temp, "Editions/2026-09-11_0800.md"), noteText(a.meta, a.body))
    assert.equal(editions(temp).at(-1).meta.coverage_end, "2026-09-11T08:00:00+09:00")
  } finally {
    fs.rmSync(temp, { recursive: true })
  }
})
test("Refresh is idempotent and keeps hand-written notes", () => {
  const original = process.cwd(),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "garden-refresh-"))
  try {
    fs.copyFileSync(
      path.join(original, "quartz.config.yaml"),
      path.join(temp, "quartz.config.yaml"),
    )
    process.chdir(temp)
    fs.mkdirSync("vault/Editions", { recursive: true })
    fs.mkdirSync("vault/News", { recursive: true })
    fs.writeFileSync("vault/News/manual.md", "# 직접 작성한 노트\n")
    for (const date of ["2026-09-11", "2026-09-12"]) {
      const a = issue(date)
      fs.writeFileSync(`vault/Editions/${date}.md`, noteText(a.meta, a.body))
    }
    refresh()
    const bytes = () =>
      Object.fromEntries(walk("vault").map((f) => [f, fs.readFileSync(f, "utf8")]))
    const first = bytes()
    refresh()
    assert.deepEqual(bytes(), first)
    assert.equal(fs.readFileSync("vault/News/manual.md", "utf8"), "# 직접 작성한 노트\n")
    const c = JSON.parse(fs.readFileSync("data/catalog.json"))
    assert.equal(c.news_count, 1)
    assert.equal(c.edition_count, 2)
    assert.equal(c.latest_cutoff, "2026-09-12T08:00:00+09:00")
  } finally {
    process.chdir(original)
    fs.rmSync(temp, { recursive: true })
  }
})
test("Publication vault traversal rejects symlinks to outside data", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "garden-symlink-"))
  try {
    fs.symlinkSync("/tmp", path.join(temp, "outside"))
    assert.throws(() => walk(temp), /Symlink/)
  } finally {
    fs.rmSync(temp, { recursive: true })
  }
})
test("Every migrated original has an intact local recovery copy when present", () => {
  const p = ".local/migration/manifest.json"
  if (!fs.existsSync(p)) return
  const m = JSON.parse(fs.readFileSync(p))
  for (const f of m.files)
    assert.equal(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(".local/migration/source", f.original)))
        .digest("hex"),
      f.sha256,
      f.original,
    )
  assert.equal(m.files.filter((f) => f.destination).length, 159)
})
