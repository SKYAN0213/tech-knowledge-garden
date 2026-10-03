import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Parser from "rss-parser"
import { noteText, feeds } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { newEditionFeedBaseline } from "../scripts/research/preview.mjs"

test("private new-issue baseline derives existing RSS identities from source editions without updating stale authority outputs", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-feed-"))),
    vault = path.join(root, "vault")
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const dir of ["Editions/2026/09", "Knowledge", "Signals", "TrendTopics"])
    fs.mkdirSync(path.join(vault, dir), { recursive: true })
  const add = (day) => {
    const key = `2026-09-${day}_0800_Tech_AI_Briefing`,
      edition = `Editions/2026/09/${key}`
    fs.writeFileSync(
      path.join(vault, edition + ".md"),
      noteText(
        {
          title: key,
          type: "briefing",
          date: `2026-09-${day}`,
          coverage_end: `2026-09-${day}T00:00:00Z`,
        },
        "# Source List\n\n없음",
      ),
    )
    fs.writeFileSync(
      path.join(vault, `Signals/${key}.md`),
      noteText(
        {
          schema_version: "tech-signals/v1",
          type: "trend-observations",
          edition,
          date: `2026-09-${day}`,
          reviewed: `2026-09-${day}`,
          review_basis: "primary-research",
          observations: [],
        },
        "",
      ),
    )
  }
  add("25")
  feeds(vault, vault)
  const cached = fs.readFileSync(path.join(vault, "briefing.xml"))
  add("26")
  const result = newEditionFeedBaseline(root, "case", vault)
  assert.equal(result.cached_feed_current, false)
  assert.equal(result.cached_sha256, sha256(cached))
  assert.deepEqual(fs.readFileSync(path.join(vault, "briefing.xml")), cached)
  const items = (
    await new Parser().parseString(fs.readFileSync(path.join(root, result.path), "utf8"))
  ).items
  const old = (await new Parser().parseString(cached.toString())).items
  assert.equal(items.length, 2)
  assert.deepEqual(
    items.slice(1).map(({ guid, pubDate }) => ({ guid, pubDate })),
    old.map(({ guid, pubDate }) => ({ guid, pubDate })),
  )
  assert.ok(items[0].guid.includes("2026-09-26_0800"))
  assert.equal(result.candidate_published, false)
})
