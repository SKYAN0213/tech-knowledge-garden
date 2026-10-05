import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { noteText } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import {
  assertEmptyLegacyReview,
  legacyReviewUnits,
  saveEmptyLegacyReview,
} from "../scripts/research/legacy-review.mjs"
import {
  retrospectiveInventory,
  saveRetrospectiveInventory,
} from "../scripts/research/retrospective.mjs"
import { legacyTransitionReadiness } from "../scripts/research/legacy-transition.mjs"

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

test("legacy metadata readiness exposes missing cutoffs without guessing dates or reviewing prose", async (t) => {
  const { vault } = fixture(t)
  const relative = "Editions/2026/07/2026-07-23_0803_Tech_AI_Briefing.md"
  const target = path.join(vault, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const original = "---\n{}\n---\n\n# Original news\n\n[Source](https://example.com/july)\n"
  fs.writeFileSync(target, original)
  const result = await retrospectiveInventory(vault)
  const edition = result.legacy.find((e) => e.path === relative)
  assert.deepEqual(edition.transition_readiness, {
    status: "metadata_recovery_required",
    issues: ["date", "timezone", "coverage_start", "coverage_end"],
  })
  assert.equal(edition.date, "2026-07-23") // existing routing date, not source metadata
  assert.equal(edition.review_status, "unreviewed")
  assert.equal(result.counts.legacy_editions_metadata_recovery_required, 2)
  assert.equal(result.counts.legacy_editions_requiring_review, 2)
  assert.equal(result.counts.distinct_events, 1)
  assert.equal(fs.readFileSync(target, "utf8"), original)
})

test("legacy readiness shares transition identity and cutoff checks without promoting eligibility", () => {
  const relative = "Editions/2026/07/2026-07-24_0800_Tech_AI_Briefing.md"
  const meta = {
    date: "2026-07-24",
    timezone: "Asia/Seoul",
    coverage_start: "2026-07-23T08:03:00+09:00",
    coverage_end: "2026-07-24T08:00:36+09:00",
  }
  assert.deepEqual(legacyTransitionReadiness(meta, relative), {
    status: "metadata_ready",
    issues: [],
  })
  for (const field of ["date", "timezone", "coverage_start", "coverage_end"]) {
    const changed = { ...meta, [field]: "invalid" }
    assert.deepEqual(legacyTransitionReadiness(changed, relative).issues, [field])
  }
  assert.deepEqual(
    legacyTransitionReadiness({ ...meta, coverage_end: meta.coverage_start }, relative).issues,
    ["coverage_order"],
  )
  assert.deepEqual(legacyTransitionReadiness(meta, relative.replace("/07/", "/08/")).issues, [
    "path",
  ])
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

function emptyFixture(t, { overview = "없음", meta = {} } = {}) {
  const setup = fixture(t)
  const relative = "Editions/2026/08/2026-08-23_0205_Tech_AI_Briefing.md"
  const names = [
    "한눈에 보기",
    "오늘의 핵심 기사",
    "논문과 연구",
    "오픈소스와 도구",
    "흐름 읽기",
    "바로 써먹을 점",
    "Source List",
  ]
  const body = names.map((name, i) => `# ${name}\n\n${i === 0 ? overview : "없음"}`).join("\n\n")
  const content = noteText(
    { date: "2026-08-23", source_count: 0, new_items_count: 0, ...meta },
    body,
  )
  const file = path.join(setup.vault, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  const packet = {
    schema: "research-empty-legacy-review/v1",
    reviewer: "fixture-reviewer",
    reviewed_at: "2026-10-04",
    authoring_read: true,
    decision: "empty_record",
    records: [
      {
        path: relative,
        sha256: sha256(content),
        before_content: content,
        units: legacyReviewUnits(body, relative).map(({ unit_id, sha256 }) => ({
          unit_id,
          sha256,
        })),
        reason: "Read all original units; no authored news or sources are present.",
      },
    ],
  }
  return { ...setup, packet, file }
}

test("explicit empty legacy review preserves original bytes and separates records from verified news", async (t) => {
  const { vault, root, packet, file } = emptyFixture(t)
  const original = fs.readFileSync(file)
  const before = await saveRetrospectiveInventory(root, "before-empty-review", vault)
  const result = await saveEmptyLegacyReview(root, "empty-review", vault, packet)
  assert.equal(result.records, 1)
  assert.equal(result.units, 7)
  assert.equal(result.verified_events, 0)
  assert.equal(result.source_research_completed, false)
  assert.equal(result.authoring_mutated, false)
  assert.equal(result.drive_verified, false)
  assert.equal(result.published, false)
  const receipt = fs.readFileSync(
    path.join(root, "runs/empty-review/retrospective/empty-record-review.json"),
  )
  const review = fs.readFileSync(path.join(root, result.review))
  assert.deepEqual(await saveEmptyLegacyReview(root, "empty-review", vault, packet), result)
  assert.deepEqual(fs.readFileSync(path.join(root, result.review)), review)
  assert.deepEqual(
    fs.readFileSync(path.join(root, "runs/empty-review/retrospective/empty-record-review.json")),
    receipt,
  )
  assert.deepEqual(fs.readFileSync(file), original)
  const current = await retrospectiveInventory(vault, { reviewRoot: root })
  assert.equal(current.counts.legacy_editions, before.counts.legacy_editions)
  assert.equal(current.counts.legacy_units, before.counts.legacy_units)
  assert.equal(current.counts.empty_legacy_records, 1)
  assert.equal(current.counts.empty_legacy_units, 7)
  assert.equal(current.counts.legacy_units_requiring_review, 2)
  assert.equal(current.counts.verified_events, before.counts.verified_events)
  assert.deepEqual(current.rss, JSON.parse(fs.readFileSync(path.join(root, before.inventory))).rss)
  assert.equal(
    current.legacy.find((edition) => edition.path === packet.records[0].path).review.reviewed_at,
    packet.reviewed_at,
  )
  assert.equal((await retrospectiveInventory(vault)).counts.empty_legacy_records, 0)
  await assert.rejects(
    saveRetrospectiveInventory(root, "before-empty-review", vault),
    /Run input changed/,
  )
  fs.appendFileSync(file, "\nActual announcement requiring source review\n")
  const stale = await retrospectiveInventory(vault, { reviewRoot: root })
  assert.equal(stale.counts.empty_legacy_records, 0)
  assert(stale.diagnostics.some((diagnostic) => diagnostic.kind === "stale_empty_record_review"))
  await assert.rejects(
    saveEmptyLegacyReview(root, "empty-review", vault, packet),
    /current authoring bytes/,
  )
})

test("empty legacy review accepts only empty template prose, including the old overview list", (t) => {
  const { packet } = emptyFixture(t, {
    overview: "- 오늘의 핵심 기사: 없음\n- 논문과 연구: 없음\n- 오픈소스와 도구: 없음",
  })
  assert.equal(assertEmptyLegacyReview(packet), packet)
  const replace = (from, to) => {
    const altered = structuredClone(packet)
    const record = altered.records[0]
    record.before_content = record.before_content.replace(from, to)
    record.sha256 = sha256(record.before_content)
    return altered
  }
  assert.throws(
    () => assertEmptyLegacyReview(replace("- 오늘의 핵심 기사: 없음", "오늘 새 소식은 없었다.")),
    /requiring source review/,
  )
  assert.throws(
    () =>
      assertEmptyLegacyReview(
        replace("# Source List\n\n없음", "# Source List\n\n[Source](https://example.com)"),
      ),
    /requiring source review/,
  )
  assert.throws(
    () => assertEmptyLegacyReview(replace("new_items_count: 0", "new_items_count: 1")),
    /report news or sources/,
  )
  assert.throws(
    () =>
      assertEmptyLegacyReview(
        replace("date: 2026-08-23", "source_urls: [https://example.com]\ndate: 2026-08-23"),
      ),
    /metadata requires separate review/,
  )
  assert.throws(
    () =>
      assertEmptyLegacyReview(
        replace("# Source List\n\n없음", "# Source List\n\n없음\n\n```\nExtra material\n```"),
      ),
    /additional unreviewed content/,
  )
})

test("empty review requires exact full unit coverage, hashes, actor, date and a private destination", async (t) => {
  const { vault, root, packet } = emptyFixture(t)
  for (const mutate of [
    (p) => p.records[0].units.pop(),
    (p) => p.records[0].units.reverse(),
    (p) => p.records[0].units.push(p.records[0].units[0]),
    (p) => {
      p.records[0].units[0].sha256 = "0".repeat(64)
    },
    (p) => {
      p.records[0].sha256 = "0".repeat(64)
    },
    (p) => {
      p.authoring_read = false
    },
    (p) => {
      p.reviewer = ""
    },
    (p) => {
      p.reviewed_at = "2026-08-22"
    },
    (p) => {
      p.records[0].path = "../outside.md"
    },
    (p) => {
      p.records[0].path = p.records[0].path.replace("2026/08/", "2026/07/")
    },
    (p) => {
      p.source_research_completed = true
    },
  ]) {
    const invalid = structuredClone(packet)
    mutate(invalid)
    await assert.rejects(saveEmptyLegacyReview(root, "invalid-empty", vault, invalid))
    assert(!fs.existsSync(path.join(root, "runs/invalid-empty")))
  }
  await assert.rejects(
    saveEmptyLegacyReview(path.join(vault, "private"), "inside", vault, packet),
    /outside the authoring vault/,
  )
  await saveEmptyLegacyReview(root, "first-empty", vault, packet)
  const repeated = structuredClone(packet)
  repeated.reviewer = "another reviewer"
  await assert.rejects(
    saveEmptyLegacyReview(root, "overlap", vault, repeated),
    /already has a private review/,
  )
  const result = await retrospectiveInventory(vault, { reviewRoot: root })
  const file = Object.keys(result.private_legacy_review_hashes)[0]
  const tampered = structuredClone(packet)
  tampered.records[0].reason = "Edited after approval"
  fs.writeFileSync(path.join(root, file), JSON.stringify(tampered))
  await assert.rejects(retrospectiveInventory(vault, { reviewRoot: root }), /content hash mismatch/)
  fs.rmSync(path.join(root, file))
  fs.symlinkSync(path.join(vault, packet.records[0].path), path.join(root, file))
  await assert.rejects(retrospectiveInventory(vault, { reviewRoot: root }), /Symlink/)
})

test("empty-record CLI uses the common private review and inventory path without a model", (t) => {
  const { vault, root, packet } = emptyFixture(t)
  const review = path.join(root, "review.json")
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(review, JSON.stringify(packet))
  const result = spawnSync(
    process.execPath,
    [
      "scripts/research.mjs",
      "review-legacy-empty",
      "--root",
      root,
      "--run",
      "cli-empty",
      "--vault",
      vault,
      "--review",
      review,
    ],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).decision, "empty_record")
  const inventory = spawnSync(
    process.execPath,
    [
      "scripts/research.mjs",
      "inventory",
      "--root",
      root,
      "--run",
      "cli-inventory",
      "--vault",
      vault,
    ],
    { encoding: "utf8" },
  )
  assert.equal(inventory.status, 0, inventory.stderr)
  assert.equal(JSON.parse(inventory.stdout).counts.empty_legacy_records, 1)
})
