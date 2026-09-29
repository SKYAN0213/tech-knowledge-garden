import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { noteText } from "../scripts/garden.mjs"
import {
  retrospectiveInventory,
  saveRetrospectiveInventory,
} from "../scripts/research/retrospective.mjs"

const eventId = "1234567890abcdef"
function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-retrospective-")))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const vault = path.join(base, "vault"),
    root = path.join(base, "private")
  for (const folder of ["Editions", "Knowledge", "Signals", "TrendTopics"])
    fs.mkdirSync(path.join(vault, folder), { recursive: true })
  const write = (relative, meta, body) =>
    fs.writeFileSync(path.join(vault, relative), noteText(meta, body))
  const article = (date, status = "unreviewed") =>
    write(
      `Editions/${date}.md`,
      {
        schema_version: "tech-ai-magazine/v2",
        date,
        article_reviews: [
          {
            title: "Robot announced",
            event_id: eventId,
            review_status: status,
            concept_ids: [],
            ...(status === "verified"
              ? { published_at: "2026-09-10", reviewed_at: "2026-09-27" }
              : {}),
          },
        ],
      },
      "# 뉴스 데스크\n\n## Robot announced\n\nRobot launch. [[Knowledge/Robot|Robot]] [S1]\n\n# Source List\n\n[S1] https://example.com/news?utm_source=daily\n",
    )
  article("2026-09-11")
  article("2026-09-12", "verified")
  write(
    "Editions/2026-09-09.md",
    { date: "2026-09-09" },
    "# Earlier story\n\n[Original](https://example.com/news)\n\n# A different story\n\n[Same publisher link](https://example.com/news)\n\n```md\n# Fake heading\nhttps://ignored.example.com/code\n```\n",
  )
  write(
    "Knowledge/Robot.md",
    {
      entry_type: "concept",
      concept_id: "robot",
      title: "Robot",
      verified_sources: ["https://example.com/news"],
      relations: [
        {
          target: "control",
          type: "uses",
          basis: "inference",
          reason: "Confirmed relation",
          evidence: ["https://example.com/news"],
        },
      ],
    },
    "# Robot\n\n[Version with parentheses](https://example.com/paper_(v1))\n\n[[Knowledge/Control|Control]]\n",
  )
  write(
    "Knowledge/Control.md",
    { entry_type: "concept", concept_id: "control", title: "Control" },
    "# Control",
  )
  write(
    "Signals/2026-09-12.md",
    {
      edition: "Editions/2026-09-12",
      date: "2026-09-12",
      reviewed: "2026-09-12",
      observations: [
        {
          id: "robot-launch",
          event_id: eventId,
          topic_id: "robot-strategy",
          change: "Announcement",
        },
      ],
    },
    "# Observation",
  )
  write(
    "TrendTopics/robot-strategy.md",
    {
      id: "robot-strategy",
      title: "Robot strategy",
      reviewed: "2026-09-12",
      knowledge_notes: ["Knowledge/Robot"],
      lessons: [],
    },
    "# Strategy",
  )
  fs.writeFileSync(
    path.join(vault, "briefing.xml"),
    '<?xml version="1.0"?><rss version="2.0"><channel><title>Briefing</title><link>https://example.com</link><description>Briefing</description><item><title>Original</title><guid isPermaLink="false">original-guid</guid><pubDate>Tue, 22 Sep 2026 00:00:00 GMT</pubDate><link>https://example.com/briefing</link></item></channel></rss>',
  )
  return { vault, root, article }
}

test("retrospective inventory preserves all appearances, unresolved dates and dependent records", async (t) => {
  const { vault } = fixture(t),
    original = fs.readFileSync(path.join(vault, "Editions/2026-09-11.md"))
  const result = await retrospectiveInventory(vault)
  assert.equal(result.counts.distinct_events, 1)
  assert.equal(result.counts.appearances, 2)
  assert.equal(result.counts.verified_events, 0)
  const event = result.events[0]
  assert.equal(event.review_status, "mixed")
  assert.equal(event.date_review_required, true)
  assert.equal(event.appearances[0].published_at, null)
  assert.deepEqual(event.dependencies.edition_paths, [
    "Editions/2026-09-11.md",
    "Editions/2026-09-12.md",
  ])
  assert.deepEqual(event.dependencies.explicit_concept_paths, ["Knowledge/Robot.md"])
  assert.deepEqual(event.dependencies.shared_source_concept_paths, ["Knowledge/Robot.md"])
  assert.deepEqual(event.dependencies.topic_paths, ["TrendTopics/robot-strategy.md"])
  assert.equal(event.dependencies.observations[0].observation_id, "robot-launch")
  assert.equal(result.relations[0].basis, "inference")
  assert.equal(result.relations[0].type, "uses")
  assert.equal(result.rss.items[0].guid, "original-guid")
  assert.deepEqual(fs.readFileSync(path.join(vault, "Editions/2026-09-11.md")), original)
})

test("legacy units keep separate identities, exact spans and shared URL candidates without guessed events", async (t) => {
  const { vault } = fixture(t),
    result = await retrospectiveInventory(vault)
  const legacy = result.legacy[0]
  assert.equal(legacy.units.length, 2)
  assert.equal(legacy.units[0].title, "Earlier story")
  assert.equal(legacy.units[1].title, "A different story")
  assert.notEqual(legacy.units[0].unit_id, legacy.units[1].unit_id)
  assert.equal(legacy.units[0].body_end, legacy.units[1].body_start)
  assert.equal(result.events.length, 1)
  const group = result.source_groups.find((g) => g.canonical_url === "https://example.com/news")
  assert.equal(group.event_ids.length, 1)
  assert.equal(group.legacy_units.length, 2)
  assert.equal(group.source_ids.length, 2)
  assert(result.sources.some((s) => s.url === "https://example.com/paper_(v1)"))
  assert(!result.sources.some((s) => s.url.includes("ignored.example.com")))
})

test("same inventory run is immutable, resumption checks authored changes and checkpoint tampering", async (t) => {
  const { vault, root } = fixture(t)
  const first = await saveRetrospectiveInventory(root, "inventory", vault)
  const bytes = fs.readFileSync(path.join(root, first.inventory))
  assert.equal(first.authoring_mutated, false)
  assert.equal(first.published, false)
  await saveRetrospectiveInventory(root, "inventory", vault)
  assert.deepEqual(fs.readFileSync(path.join(root, first.inventory)), bytes)
  fs.appendFileSync(path.join(vault, "Knowledge/Robot.md"), "\nCorrection\n")
  await assert.rejects(saveRetrospectiveInventory(root, "inventory", vault), /Run input changed/)
  const second = await saveRetrospectiveInventory(root, "fresh", vault)
  const saved = JSON.parse(fs.readFileSync(path.join(root, second.inventory)))
  saved.counts.distinct_events = 0
  fs.writeFileSync(path.join(root, second.inventory), JSON.stringify(saved))
  await assert.rejects(saveRetrospectiveInventory(root, "fresh", vault), /checkpoint hash mismatch/)
})

test("inventory CLI writes only private output and rejects missing folders and symlinks", async (t) => {
  const { vault, root } = fixture(t)
  const before = await retrospectiveInventory(vault)
  const command = spawnSync(
    process.execPath,
    ["scripts/research.mjs", "inventory", "--run", "cli", "--root", root, "--vault", vault],
    { encoding: "utf8" },
  )
  assert.equal(command.status, 0, command.stderr)
  assert.equal(JSON.parse(command.stdout).counts.appearances, 2)
  const after = await retrospectiveInventory(vault)
  assert.deepEqual(after.hashes, before.hashes)
  assert.equal(after.rss.sha256, before.rss.sha256)
  fs.symlinkSync(path.join(vault, "Knowledge/Robot.md"), path.join(vault, "Knowledge/Alias.md"))
  await assert.rejects(retrospectiveInventory(vault), /Symlink/)
  fs.unlinkSync(path.join(vault, "Knowledge/Alias.md"))
  fs.renameSync(path.join(vault, "TrendTopics"), path.join(path.dirname(vault), "moved-topics"))
  await assert.rejects(retrospectiveInventory(vault), /Missing authoring/)
})

test("generated note destinations are preserved as derivatives with separate fingerprints", async (t) => {
  const { vault, root } = fixture(t)
  fs.mkdirSync(path.join(vault, "Briefings/Topics"), { recursive: true })
  fs.writeFileSync(path.join(vault, "Briefings/Topics/robot-strategy.md"), "# Generated page\n")
  fs.appendFileSync(
    path.join(vault, "TrendTopics/robot-strategy.md"),
    "\n[[Briefings/Topics/robot-strategy]]\n",
  )
  const result = await retrospectiveInventory(vault)
  assert.equal(result.diagnostics.length, 0)
  const link = result.notes.find((n) => n.path === "TrendTopics/robot-strategy.md").links[0]
  assert.equal(link.authority, "generated")
  assert.equal(result.notes.length, 7)
  assert(result.generated_dependencies[link.path])
  await saveRetrospectiveInventory(root, "generated", vault)
  fs.appendFileSync(path.join(vault, link.path), "New derivative\n")
  await assert.rejects(saveRetrospectiveInventory(root, "generated", vault), /Run input changed/)
})

test("distinct fixed events sharing a canonical URL remain separate", async (t) => {
  const { vault } = fixture(t)
  const another = fs
    .readFileSync(path.join(vault, "Editions/2026-09-11.md"), "utf8")
    .replaceAll(eventId, "abcdef1234567890")
    .replaceAll("2026-09-11", "2026-09-13")
  fs.writeFileSync(path.join(vault, "Editions/2026-09-13.md"), another)
  const result = await retrospectiveInventory(vault)
  assert.equal(result.events.length, 2)
  assert.equal(
    result.source_groups.find((g) => g.canonical_url === "https://example.com/news").event_ids
      .length,
    2,
  )
})
