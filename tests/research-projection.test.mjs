import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { draftProblems } from "../scripts/research/editor.mjs"
import {
  approvedArticle,
  editionProjection,
  existingArticleProjection,
} from "../scripts/research/publish-adapter.mjs"
import {
  retrospectiveProjections,
  newEditionProjections,
  assertNewEditionSourceCutoff,
  verifyKnowledgeOutputs,
  stageApprovedNote,
  conceptIndexProjection,
  copyFiles,
} from "../scripts/research/preview.mjs"
import { slugifyFilePath } from "@quartz-community/utils"
import {
  correctionImpact,
  reconcilePaperVersions,
  assertPersonIdentity,
  conceptRegistry,
  verifiedConceptLinks,
} from "../scripts/research/knowledge-links.mjs"
import { importLegacySources } from "../scripts/research/archive.mjs"
import { promotionAudit, shadowRecord } from "../scripts/research/promotion.mjs"
import { robotsPolicy, checkRobots } from "../scripts/research/robots.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { parseNote, extractArticles, noteText } from "../scripts/garden.mjs"
import { legacyReviewUnits } from "../scripts/research/legacy-review.mjs"
import {
  assertLegacyTransition,
  legacyTransitionBatch,
} from "../scripts/research/legacy-transition.mjs"

function legacyTransitionFixture(t, { sourceListOnly = false, sourceMarkers = false } = {}) {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "legacy-transition-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  fs.mkdirSync(path.join(vault, "Knowledge"))
  const s = sample(),
    first = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses)
  const second = structuredClone(first)
  second.event_id = second.article_review.event_id = "abcdef1234567890"
  second.title = second.record.title = second.article_review.title = "다른 연구 발표"
  second.source_urls = ["https://example.com/second"]
  const articles = [first, second],
    key = "2026-09-28_0801_Tech_AI_Briefing"
  const relative = `Editions/2026/09/${key}.md`
  let content = noteText(
    {
      title: "2026-09-28 Tech & AI Briefing",
      date: "2026-09-28",
      timezone: "Asia/Seoul",
      coverage_start: "2026-09-27T08:01:00+09:00",
      coverage_end: "2026-09-28T08:01:00+09:00",
      source_count: 2,
      new_items_count: 2,
      linked_knowledge_notes: [],
    },
    "# 한눈에 보기\n\n이전 요약.\n\n# 오늘의 핵심 기사\n\n없음\n\n# 논문과 연구\n\n" +
      "## 이전 첫 제목\n\n이전 본문. https://example.com/announcement\n\n" +
      "## 이전 두 번째 제목\n\n이전 본문. https://example.com/second\n\n" +
      "# 오픈소스와 도구\n\n없음\n\n# 흐름 읽기\n\n근거 없는 옛 추론.\n\n" +
      "# 바로 써먹을 점\n\n옛 조언.\n\n# Source List\n\nhttps://example.com/announcement\nhttps://example.com/second\n",
  )
  if (sourceListOnly)
    content = content
      .replace("이전 본문. https://example.com/announcement", "이전 본문.")
      .replace("이전 본문. https://example.com/second", "이전 본문.")
  if (sourceMarkers)
    content = content
      .replace("이전 본문. https://example.com/announcement", "이전 본문. [S1]")
      .replace("이전 본문. https://example.com/second", "이전 본문. [S2]")
      .replace("\nhttps://example.com/announcement", "\n[S1] https://example.com/announcement")
      .replace("\nhttps://example.com/second", "\n[S2] https://example.com/second")
  atomicWrite(vault, relative, content)
  const existing = { ...parseNote(content), file: path.join(vault, relative) }
  const units = legacyReviewUnits(existing.body, relative)
  const packet = {
    schema: "research-legacy-edition-transition/v1",
    reviewer: "test-reviewer",
    reviewed_at: "2026-09-28",
    original_read: true,
    source_read: true,
    duplicate_checked: true,
    reason: "Complete source review",
    target_path: relative,
    target_sha256: sha256(content),
    before_content: content,
    events: [
      {
        event_id: first.event_id,
        unit_id: units[3].unit_id,
        previous_title: units[3].title,
        source_urls: first.source_urls,
      },
      {
        event_id: second.event_id,
        unit_id: units[4].unit_id,
        previous_title: units[4].title,
        source_urls: second.source_urls,
      },
    ],
    units: units.map((u, i) => ({
      unit_id: u.unit_id,
      sha256: u.sha256,
      decision: [0, 3, 4, 8].includes(i)
        ? "replaced"
        : [1, 2, 5].includes(i)
          ? "omitted_empty"
          : "omitted_editorial",
      event_ids:
        i === 3
          ? [first.event_id]
          : i === 4
            ? [second.event_id]
            : [0, 8].includes(i)
              ? articles.map((a) => a.event_id)
              : [],
      reason: "Read original unit and its sources",
    })),
  }
  return { vault, articles, existing, relative, packet, key }
}

function reviseLegacyFixture(f, body) {
  f.packet.before_content = noteText(f.existing.meta, body)
  f.existing.body = body = parseNote(f.packet.before_content).body
  f.packet.target_sha256 = sha256(f.packet.before_content)
  const units = legacyReviewUnits(body, f.relative)
  const byOldID = new Map(f.packet.units.map((unit, i) => [unit.unit_id, i]))
  for (const event of f.packet.events) {
    const unit = units[byOldID.get(event.unit_id)]
    event.unit_id = unit.unit_id
    event.previous_title = unit.title
  }
  f.packet.units = f.packet.units.map((row, i) => ({
    ...row,
    unit_id: units[i].unit_id,
    sha256: units[i].sha256,
  }))
  atomicWrite(f.vault, f.relative, f.packet.before_content)
}

test("preview snapshot copies preserve exact bytes, independent writes and drift rejection", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preview-clone-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "source"),
    destination = path.join(root, "destination")
  fs.mkdirSync(source)
  const original = Buffer.alloc(1024 * 1024, 65)
  fs.writeFileSync(path.join(source, "asset.bin"), original)
  const entries = [{ path: "asset.bin", sha256: sha256(original) }]
  copyFiles(source, destination, entries)
  assert.deepEqual(fs.readFileSync(path.join(destination, "asset.bin")), original)
  fs.writeFileSync(path.join(destination, "asset.bin"), "edited preview")
  assert.deepEqual(fs.readFileSync(path.join(source, "asset.bin")), original)
  fs.writeFileSync(path.join(source, "asset.bin"), "changed source")
  assert.throws(() => copyFiles(source, destination, entries), /Snapshot source changed/)
  assert.equal(fs.readFileSync(path.join(destination, "asset.bin"), "utf8"), "edited preview")
  assert.deepEqual(fs.readdirSync(destination), ["asset.bin"])
  const link = path.join(root, "link")
  fs.symlinkSync(source, link)
  assert.throws(() => copyFiles(link, destination, entries), /Symlink/)
  assert.throws(
    () => copyFiles(source, link, [{ path: "asset.bin", sha256: sha256("changed source") }]),
    /Symlink/,
  )
})

test("complete pre-v2 transition retains edition identity and all source events without old editorial prose", (t) => {
  const f = legacyTransitionFixture(t)
  const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
  const after = parseNote(projection.content)
  assert.equal(projection.path, f.relative)
  assert.deepEqual(
    extractArticles({ ...after, file: f.existing.file })
      .map((a) => a.id)
      .sort(),
    f.articles.map((a) => a.event_id).sort(),
  )
  for (const k of ["date", "coverage_start", "coverage_end", "linked_knowledge_notes"])
    assert.deepEqual(after.meta[k], f.existing.meta[k])
  for (const prose of ["근거 없는 옛 추론", "옛 조언", "Complete source review", "original_read"])
    assert.equal(projection.content.includes(prose), false)
  assert.equal(fs.readFileSync(f.existing.file, "utf8"), f.packet.before_content)
  assert.throws(
    () => retrospectiveProjections(f.vault, [f.articles[0]], [], [f.packet]),
    /missing or additional/,
  )
  assert.throws(
    () =>
      editionProjection(f.articles, {
        key: f.key,
        date: f.existing.meta.date,
        coverage_start: f.existing.meta.coverage_start,
        coverage_end: f.existing.meta.coverage_end,
        existing: f.existing,
        added_event_ids: f.articles.map((a) => a.event_id),
      }),
    /complete legacy transition/,
  )
})

test("legacy reviewed metadata preserves clocks and tags while retaining obsolete counters privately", (t) => {
  const f = legacyTransitionFixture(t)
  Object.assign(f.existing.meta, {
    time: "08:01",
    type: "briefing",
    tags: ["AI", "TechBriefing", "Obsidian"],
    excluded_items_count: 5,
  })
  reviseLegacyFixture(f, f.existing.body)
  f.packet.metadata_review = {
    metadata_read: true,
    dispositions: [
      { field: "time", action: "preserve", reason: "Original clock matches edition identity" },
      { field: "type", action: "preserve", reason: "Original document is a briefing" },
      {
        field: "tags",
        action: "preserve",
        reason: "Original edition tags, not concept assignments",
      },
      {
        field: "excluded_items_count",
        action: "private_only",
        reason: "Historical research count",
      },
    ],
  }
  const projected = () =>
    editionProjection(f.articles, {
      key: f.key,
      date: f.existing.meta.date,
      coverage_start: f.existing.meta.coverage_start,
      coverage_end: f.existing.meta.coverage_end,
      existing: f.existing,
      legacy_review: f.packet,
    })
  const before = f.packet.before_content
  const result = parseNote(projected().content)
  assert.equal(result.meta.time, "08:01")
  assert.equal(result.meta.type, "briefing")
  assert.deepEqual(result.meta.tags, ["AI", "TechBriefing", "Obsidian"])
  assert.equal(result.meta.excluded_items_count, undefined)
  assert.equal(f.packet.before_content, before)
  assert.equal(parseNote(before).meta.excluded_items_count, 5)
  for (const mutate of [
    (p) => delete p.metadata_review,
    (p) => p.metadata_review.dispositions.pop(),
    (p) => p.metadata_review.dispositions.push(p.metadata_review.dispositions[0]),
    (p) => (p.metadata_review.dispositions[3].action = "preserve"),
    (p) => (p.metadata_review.dispositions[2].reason = " "),
  ]) {
    const p = structuredClone(f.packet)
    mutate(p)
    assert.throws(() => assertLegacyTransition(p, f.articles, f.existing, f.relative))
  }
  for (const [field, value] of [
    ["time", "09:01"],
    ["type", "news"],
    ["tags", ["AI", "AI"]],
    ["excluded_items_count", -1],
    ["private_notes", "sensitive"],
  ]) {
    const changed = structuredClone(f)
    changed.existing.meta[field] = value
    changed.packet.before_content = noteText(changed.existing.meta, changed.existing.body)
    changed.packet.target_sha256 = sha256(changed.packet.before_content)
    assert.throws(() =>
      assertLegacyTransition(changed.packet, changed.articles, changed.existing, changed.relative),
    )
  }
})

test("legacy discovery source roles stay private and cannot remove inline or approved article evidence", (t) => {
  const f = legacyTransitionFixture(t)
  const discovery = "https://api.github.com/repos/vercel/ai/releases?per_page=5"
  reviseLegacyFixture(f, f.existing.body + `\n${discovery}\n`)
  assert.throws(
    () => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative),
    /retain every/,
  )
  f.packet.source_list_dispositions = [
    {
      url: discovery,
      role: "discovery",
      source_role_checked: true,
      reason: "This release-list query is a research route, not one of the cited event permalinks",
    },
  ]
  assert.equal(assertLegacyTransition(f.packet, f.articles, f.existing, f.relative), f.packet)
  const after = editionProjection(f.articles, {
    key: f.key,
    date: f.existing.meta.date,
    coverage_start: f.existing.meta.coverage_start,
    coverage_end: f.existing.meta.coverage_end,
    existing: f.existing,
    legacy_review: f.packet,
  })
  assert.equal(after.content.includes(discovery), false)
  assert.equal(f.packet.before_content.includes(discovery), true)
  for (const mutate of [
    (p) => (p.source_list_dispositions[0].url = f.articles[0].source_urls[0]),
    (p) => (p.source_list_dispositions[0].url = "https://example.org/not-listed"),
    (p) => (p.source_list_dispositions[0].reason = " "),
    (p) => p.source_list_dispositions.push(p.source_list_dispositions[0]),
    (p) => (p.source_list_dispositions[0].source_role_checked = false),
  ]) {
    const p = structuredClone(f.packet)
    mutate(p)
    assert.throws(() => assertLegacyTransition(p, f.articles, f.existing, f.relative))
  }
  reviseLegacyFixture(
    f,
    f.existing.body.replace("근거 없는 옛 추론.", `근거 없는 옛 추론. ${discovery}`),
  )
  assert.throws(
    () => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative),
    /discovery/,
  )
})

test("legacy timestamp dates use the exact exclusive-start inclusive-end coverage instants", (t) => {
  const f = legacyTransitionFixture(t)
  const article = f.articles[0]
  article.article_review.date_kind = "source-publication-time"
  article.article_review.source_published_at = "2026-09-27T23:01:00Z"
  article.article_review.published_at = "2026-09-28"
  assert.equal(assertLegacyTransition(f.packet, f.articles, f.existing, f.relative), f.packet)
  for (const timestamp of [
    f.existing.meta.coverage_start,
    "2026-09-26T23:00:59Z",
    "2026-09-27T23:01:00.001Z",
  ]) {
    const changed = structuredClone(f.articles)
    changed[0].article_review.source_published_at = timestamp
    changed[0].article_review.published_at =
      timestamp === f.existing.meta.coverage_start
        ? "2026-09-27"
        : timestamp.startsWith("2026-09-26")
          ? "2026-09-27"
          : "2026-09-28"
    assert.throws(
      () => assertLegacyTransition(f.packet, changed, f.existing, f.relative),
      /reviewed source events/,
    )
  }
})

test("legacy transition rejects partial review, hash drift, lost sources and false empty dispositions", (t) => {
  const f = legacyTransitionFixture(t)
  const mutations = [
    (p) => p.units.pop(),
    (p) => (p.units[3].sha256 = "0".repeat(64)),
    (p) => (p.target_sha256 = "0".repeat(64)),
    (p) => (p.events[0].previous_title = "changed"),
    (p) => (p.events[0].source_urls = ["https://example.org/unrelated"]),
    (p) => (p.units[3].event_ids = []),
    (p) => (p.units[3].decision = "omitted_editorial"),
    (p) => {
      p.units[6].decision = "omitted_empty"
    },
    (p) => (p.units[8].event_ids = [f.articles[0].event_id]),
    (p) => p.units[3].event_ids.push("0000000000000000"),
    (p) => (p.reviewed_at = "2026-09-26"),
    (p) => {
      p.units[0].decision = "omitted_editorial"
      p.units[0].event_ids = []
    },
    (p) => (p.reviewer = " "),
  ]
  for (const mutate of mutations) {
    const p = structuredClone(f.packet)
    mutate(p)
    assert.throws(() => assertLegacyTransition(p, f.articles, f.existing, f.relative))
  }
  assert.throws(
    () =>
      legacyTransitionBatch({
        schema: "research-legacy-transition-batch/v1",
        reviews: [f.packet, f.packet],
      }),
    /unique/,
  )
  const changed = structuredClone(f.articles)
  changed[0].source_urls = []
  assert.throws(() => assertLegacyTransition(f.packet, changed, f.existing, f.relative), /retain/)
  fs.appendFileSync(f.existing.file, "\nChanged original")
  assert.throws(
    () => retrospectiveProjections(f.vault, f.articles, [], [f.packet]),
    /bytes changed/,
  )
})

test("source-free legacy articles require explicit original source-list assignments", (t) => {
  const f = legacyTransitionFixture(t, { sourceListOnly: true })
  assert.throws(
    () => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative),
    /exact title, unit and original sources/,
  )
  for (const event of f.packet.events)
    event.source_list_review = {
      source_list_read: true,
      article_source_read: true,
      association_checked: true,
      reason: "Read the original list and matched this article to its captured original",
    }
  const before = fs.readFileSync(f.existing.file)
  const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
  const after = parseNote(projection.content)
  const articles = extractArticles({ ...after, file: f.existing.file })
  assert.deepEqual(
    articles.map((a) => a.urls),
    f.articles.map((a) => a.source_urls),
  )
  assert.deepEqual(
    articles.map((a) => a.id),
    f.articles.map((a) => a.event_id),
  )
  for (const k of ["date", "coverage_start", "coverage_end"])
    assert.equal(after.meta[k], f.existing.meta[k])
  assert.equal(projection.content.includes("source_list_review"), false)
  assert.equal(projection.content.includes("matched this article"), false)
  assert.deepEqual(fs.readFileSync(f.existing.file), before)

  for (const mutate of [
    (p) => delete p.events[0].source_list_review,
    (p) => (p.events[0].source_list_review.source_list_read = false),
    (p) => (p.events[0].source_list_review.article_source_read = false),
    (p) => (p.events[0].source_list_review.association_checked = false),
    (p) => (p.events[0].source_list_review.reason = " "),
    (p) => (p.events[0].source_urls = ["https://example.org/unlisted"]),
    (p) => (p.events[0].source_urls = f.articles[1].source_urls),
    (p) => p.events[0].source_urls.push(p.events[0].source_urls[0]),
    (p) => p.units.pop(),
    (p) => (p.units[8].event_ids = [f.articles[0].event_id]),
  ]) {
    const packet = structuredClone(f.packet)
    mutate(packet)
    assert.throws(() => assertLegacyTransition(packet, f.articles, f.existing, f.relative))
  }
  const unlistedApproval = structuredClone(f.articles)
  unlistedApproval[0].source_urls.push("https://example.org/extra")
  const unlistedPacket = structuredClone(f.packet)
  unlistedPacket.events[0].source_urls = unlistedApproval[0].source_urls
  assert.throws(
    () => assertLegacyTransition(unlistedPacket, unlistedApproval, f.existing, f.relative),
    /original list sources/,
  )
})

test("source-list review cannot override inline sources or explicit source markers", (t) => {
  const f = legacyTransitionFixture(t)
  f.packet.events[0].source_list_review = {
    source_list_read: true,
    article_source_read: true,
    association_checked: true,
    reason: "Manual association",
  }
  assert.throws(
    () => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative),
    /original list sources/,
  )
  const marker = legacyTransitionFixture(t, { sourceMarkers: true })
  marker.packet.events.forEach((event) => {
    event.source_list_review = { ...f.packet.events[0].source_list_review }
  })
  assert.throws(
    () => assertLegacyTransition(marker.packet, marker.articles, marker.existing, marker.relative),
    /original list sources/,
  )
})

test("reviewed source-list supplements preserve the inline anchor and require approved original evidence", (t) => {
  const f = legacyTransitionFixture(t)
  const extra = "https://example.com/framework-data"
  reviseLegacyFixture(f, f.existing.body + "\n" + extra + "\n")
  f.articles[0].source_urls = [...f.articles[0].source_urls, extra]
  f.packet.events[0].source_urls = [...f.articles[0].source_urls]
  f.packet.events[0].source_list_review = {
    source_list_read: true,
    article_source_read: true,
    association_checked: true,
    reason:
      "Read the listed dataset as material for this original event; retain the inline announcement",
  }
  assert.doesNotThrow(() => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative))
  const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
  const articles = extractArticles({ ...parseNote(projection.content), file: f.existing.file })
  assert.deepEqual(
    articles.find((a) => a.id === f.articles[0].event_id).urls,
    f.articles[0].source_urls,
  )
  assert.equal(projection.content.includes("source_list_review"), false)
  const missingAnchor = structuredClone(f.packet)
  missingAnchor.events[0].source_urls = [extra]
  assert.throws(
    () => assertLegacyTransition(missingAnchor, f.articles, f.existing, f.relative),
    /retain every reviewed original source/,
  )
  const missingApproval = structuredClone(f.articles)
  missingApproval[0].source_urls = missingApproval[0].source_urls.filter((url) => url !== extra)
  assert.throws(
    () => assertLegacyTransition(f.packet, missingApproval, f.existing, f.relative),
    /retain every reviewed original source/,
  )
  const unlisted = structuredClone(f.packet)
  unlisted.events[0].source_urls.push("https://example.com/not-in-original")
  const extended = structuredClone(f.articles)
  extended[0].source_urls.push("https://example.com/not-in-original")
  assert.throws(
    () => assertLegacyTransition(unlisted, extended, f.existing, f.relative),
    /original list sources/,
  )
})

test("legacy source markers resolve only unique original list entries and preserve published sources", (t) => {
  const f = legacyTransitionFixture(t, { sourceMarkers: true })
  const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
  const after = parseNote(projection.content)
  assert.deepEqual(
    extractArticles({ ...after, file: f.existing.file }).map((a) => a.urls),
    f.articles.map((a) => a.source_urls),
  )
  const original = f.existing.body
  for (const body of [
    original.replace("이전 본문. [S1]", "이전 본문. [S99]"),
    original + "\n[S1] https://example.org/different\n",
    original + "\n[S1] https://example.com/announcement\n",
    original.replace(
      "[S1] https://example.com/announcement",
      "[S1] https://example.com/announcement https://example.org/extra",
    ),
    original.replace(
      "[S1] https://example.com/announcement",
      "[S1] [S3] https://example.com/announcement",
    ),
  ]) {
    reviseLegacyFixture(f, body)
    assert.throws(
      () => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative),
      /source marker/,
    )
  }
})

test("one legacy article can split into explicitly reviewed distinct events without source loss", (t) => {
  for (const sourceListOnly of [false, true]) {
    const f = legacyTransitionFixture(t, { sourceListOnly })
    reviseLegacyFixture(
      f,
      f.existing.body
        .replace(
          "## 이전 두 번째 제목\n\n이전 본문." +
            (sourceListOnly ? "" : " https://example.com/second"),
          "## 이전 두 번째 제목\n\n없음",
        )
        .replace(
          "## 이전 첫 제목\n\n이전 본문." +
            (sourceListOnly ? "" : " https://example.com/announcement"),
          "## 이전 첫 제목\n\n두 발표를 다룬 이전 본문." +
            (sourceListOnly ? "" : " https://example.com/announcement https://example.com/second"),
        ),
    )
    f.packet.events[1].unit_id = f.packet.events[0].unit_id
    f.packet.events[1].previous_title = f.packet.events[0].previous_title
    f.packet.units[3].event_ids = f.articles.map((a) => a.event_id)
    f.packet.units[4].decision = "omitted_empty"
    f.packet.units[4].event_ids = []
    for (const event of f.packet.events) {
      event.event_split_review = {
        distinct_event_checked: true,
        reason: "Separate source announcements directly reviewed",
      }
      if (sourceListOnly)
        event.source_list_review = {
          source_list_read: true,
          article_source_read: true,
          association_checked: true,
          reason: "Original source list directly matched to this distinct event",
        }
    }
    const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
    const after = parseNote(projection.content)
    const projected = extractArticles({ ...after, file: f.existing.file })
    assert.deepEqual(
      projected.map((a) => [a.id, a.urls]),
      f.articles.map((a) => [a.event_id, a.source_urls]),
    )
    assert.equal(after.meta.coverage_end, f.existing.meta.coverage_end)
    assert.equal(projection.content.includes("event_split_review"), false)
    assert.equal(fs.readFileSync(f.existing.file, "utf8"), f.packet.before_content)
    for (const mutate of [
      (p) => delete p.events[1].event_split_review,
      (p) => (p.events[1].event_split_review.distinct_event_checked = false),
      (p) => (p.events[1].event_split_review.reason = " "),
      (p) => (p.events[1].source_urls = f.articles[0].source_urls),
      (p) => p.units[3].event_ids.pop(),
      (p) => (p.events[1].event_id = p.events[0].event_id),
      (p) => (p.events[1].previous_title = "Unrelated original article"),
      ...(sourceListOnly ? [(p) => delete p.events[1].source_list_review] : []),
    ]) {
      const packet = structuredClone(f.packet)
      mutate(packet)
      assert.throws(() => assertLegacyTransition(packet, f.articles, f.existing, f.relative))
    }
  }
})

test("legacy duplicate article sections require explicit same-event review and preserve one fixed event", (t) => {
  const f = legacyTransitionFixture(t)
  reviseLegacyFixture(
    f,
    f.existing.body.replaceAll("https://example.com/second", "https://example.com/announcement"),
  )
  f.articles.pop()
  f.packet.events.pop()
  const id = f.articles[0].event_id
  for (const row of f.packet.units) row.event_ids = row.event_ids.filter((v) => v === id)
  f.packet.units[4].event_ids = [id]
  f.packet.units[4].duplicate_event_review = {
    original_read: true,
    source_read: true,
    same_event_checked: true,
    dates_checked: true,
    reason:
      "Both original sections describe the same dated source announcement; preserve one event.",
  }
  assert.doesNotThrow(() => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative))
  const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
  const after = parseNote(projection.content)
  assert.deepEqual(
    extractArticles({ ...after, file: f.existing.file }).map((a) => a.id),
    [id],
  )
  assert.equal(after.meta.new_items_count, 1)
  assert.equal(after.meta.coverage_end, f.existing.meta.coverage_end)
  assert.equal(projection.content.includes("duplicate_event_review"), false)
  for (const mutate of [
    (p) => delete p.units[4].duplicate_event_review,
    (p) => (p.units[4].duplicate_event_review.source_read = false),
    (p) => (p.units[4].duplicate_event_review.same_event_checked = false),
    (p) => (p.units[4].duplicate_event_review.dates_checked = false),
    (p) => (p.units[4].duplicate_event_review.reason = " "),
    (p) => p.units[4].event_ids.push(id),
    (p) => (p.units[4].event_ids = ["0000000000000000"]),
    (p) => (p.units[3].duplicate_event_review = structuredClone(p.units[4].duplicate_event_review)),
    (p) => (p.units[0].duplicate_event_review = structuredClone(p.units[4].duplicate_event_review)),
  ]) {
    const packet = structuredClone(f.packet)
    mutate(packet)
    assert.throws(() => assertLegacyTransition(packet, f.articles, f.existing, f.relative))
  }
  const before = f.existing.body
  reviseLegacyFixture(
    f,
    before.replace(
      "이전 본문. https://example.com/announcement\n\n# 오픈소스",
      "이전 본문. https://example.org/unrelated\n\n# 오픈소스",
    ),
  )
  assert.throws(
    () => assertLegacyTransition(f.packet, f.articles, f.existing, f.relative),
    /retain/,
  )
})

test("legacy official alternatives retain original citations and use only the same event's approved sources", (t) => {
  for (const mode of [{}, { sourceMarkers: true }, { sourceListOnly: true }]) {
    const f = legacyTransitionFixture(t, mode)
    const original = f.packet.events[0].source_urls[0]
    const alternative = "https://official.example.com/system-card"
    f.articles[0].source_urls = [alternative]
    f.packet.events[0].source_alternative_reviews = [
      {
        original_url: original,
        alternative_url: alternative,
        alternative_source_read: true,
        official_source_checked: true,
        same_event_checked: true,
        event_date_checked: true,
        reason: "Original unavailable; publisher system card directly confirms this dated release",
      },
    ]
    if (mode.sourceListOnly)
      for (const event of f.packet.events)
        event.source_list_review = {
          source_list_read: true,
          article_source_read: true,
          association_checked: true,
          reason: "Matched original list entry to original article before reviewing alternative",
        }
    const [projection] = retrospectiveProjections(f.vault, f.articles, [], [f.packet])
    const after = parseNote(projection.content)
    assert.deepEqual(
      extractArticles({ ...after, file: f.existing.file }).map((a) => [a.id, a.urls]),
      f.articles.map((a) => [a.event_id, a.source_urls]),
    )
    assert.equal(after.meta.coverage_end, f.existing.meta.coverage_end)
    assert.equal(fs.readFileSync(f.existing.file, "utf8"), f.packet.before_content)
    assert.equal(f.packet.events[0].source_urls[0], original)
    assert.equal(projection.content.includes("source_alternative_reviews"), false)
    assert.equal(projection.content.includes("Original unavailable"), false)
    for (const mutate of [
      (p) => delete p.events[0].source_alternative_reviews,
      (p) => (p.events[0].source_alternative_reviews[0].original_url = alternative),
      (p) => (p.events[0].source_alternative_reviews[0].alternative_url = original),
      (p) =>
        (p.events[0].source_alternative_reviews[0].alternative_url = f.articles[1].source_urls[0]),
      (p) => (p.events[0].source_alternative_reviews[0].alternative_source_read = false),
      (p) => (p.events[0].source_alternative_reviews[0].official_source_checked = false),
      (p) => (p.events[0].source_alternative_reviews[0].same_event_checked = false),
      (p) => (p.events[0].source_alternative_reviews[0].event_date_checked = false),
      (p) => (p.events[0].source_alternative_reviews[0].reason = " "),
      (p) => p.events[0].source_alternative_reviews.push(p.events[0].source_alternative_reviews[0]),
      (p) => (p.events[0].source_urls = [alternative]),
    ]) {
      const packet = structuredClone(f.packet)
      mutate(packet)
      assert.throws(() => assertLegacyTransition(packet, f.articles, f.existing, f.relative))
    }
    const changed = structuredClone(f.articles)
    changed[0].source_urls = []
    assert.throws(() => assertLegacyTransition(f.packet, changed, f.existing, f.relative))
    changed[0].source_urls = [original, alternative]
    assert.throws(() => assertLegacyTransition(f.packet, changed, f.existing, f.relative))
  }
})

test("new concept navigation is derived without changing existing index prose or authority bytes", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "new-concept-index-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  fs.mkdirSync(path.join(vault, "Knowledge"))
  const relative = "Knowledge/00 Tech Encyclopedia Index.md"
  const before = noteText(
    {
      title: "Index",
      entry_type: "index",
      schema_version: "tech-encyclopedia/v2",
      created: "2026-08-01",
      updated: "2026-08-01",
    },
    "# Index\n\n## 포함하는 개념\n\n- [[Knowledge/Old|기존 용어]]\n\n## 개념 경계\n\n기존 설명.\n",
  )
  fs.writeFileSync(path.join(vault, relative), before)
  const notes = [
    {
      operation: "create",
      path: "Knowledge/New.md",
      content: noteText(
        { domain: "AI Systems", label: "새 전문용어", last_reviewed: "2026-09-27" },
        "",
      ),
    },
  ]
  const result = conceptIndexProjection(vault, notes),
    parsed = parseNote(result.content)
  assert.equal(result.previous_sha256, sha256(before))
  assert.equal(parsed.meta.created, "2026-08-01")
  assert.equal(parsed.meta.updated, "2026-09-27")
  assert.ok(parsed.body.includes("- [[Knowledge/Old|기존 용어]]"))
  assert.ok(parsed.body.includes("- [[Knowledge/New|새 전문용어]]"))
  assert.ok(parsed.body.includes("## 개념 경계\n\n기존 설명."))
  assert.equal(fs.readFileSync(path.join(vault, relative), "utf8"), before)
  assert.equal(conceptIndexProjection(vault, []), null)
  assert.equal(
    conceptIndexProjection(vault, [
      { operation: "create", path: "Signals/2026-09-27_0800_Tech_AI_Briefing.md" },
    ]),
    null,
  )
  notes[0].path = "Knowledge/Old.md"
  assert.throws(() => conceptIndexProjection(vault, notes), /already appears/)
})

test("private creation resumes only unchanged receipt-owned bytes and refuses foreign files or links", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "new-concept-stage-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const note = {
    operation: "create",
    path: "Knowledge/Term.md",
    content: "approved text",
    sha256: sha256("approved text"),
  }
  const receipt = { path: note.path, sha256: note.sha256 }
  assert.equal(stageApprovedNote(vault, note).created, true)
  assert.throws(() => stageApprovedNote(vault, note), /already exists/)
  assert.equal(stageApprovedNote(vault, note, { creationReceipt: receipt }).created, false)
  assert.throws(
    () =>
      stageApprovedNote(vault, note, {
        creationReceipt: { ...receipt, path: "Knowledge/Other.md" },
      }),
    /already exists/,
  )
  fs.writeFileSync(path.join(vault, note.path), "another writer")
  assert.throws(
    () => stageApprovedNote(vault, note, { creationReceipt: receipt }),
    /already exists/,
  )
  assert.equal(fs.readFileSync(path.join(vault, note.path), "utf8"), "another writer")
  const linked = { ...note, path: "Knowledge/Linked.md" }
  fs.symlinkSync(path.join(vault, "missing"), path.join(vault, linked.path))
  assert.throws(
    () => stageApprovedNote(vault, linked, { creationReceipt: { ...receipt, path: linked.path } }),
    /Symlink/,
  )
  assert.throws(() => stageApprovedNote(vault, { ...note, content: "changed" }), /hash changed/)
})

test("knowledge prose verification preserves inline Korean particles and block boundaries", (t) => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-prose-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const notePath = "Knowledge/Time Series.md"
  const content = `---
concept_id: timeseries
verified_sources:
  - https://example.org/paper
---
## 한 문장 정의

**Chronos**는 관측값을 토큰으로 표현한다.

## 작동 원리

**Chronos**는 입력을 처리한다.

**TimesFM-3**는 9개 분위수를 예측한다.

## 실제 예시

[논문](https://example.org/paper)은 연구 결과를 설명한다.

## 왜 중요한가

없음
`
  const approved = [{ path: notePath, content, sha256: sha256(content) }]
  const htmlPath = path.join(workspace, "public", slugifyFilePath(notePath) + ".html")
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true })
  fs.mkdirSync(path.join(workspace, "vault", "Knowledge"), { recursive: true })
  fs.mkdirSync(path.join(workspace, "public", "briefings"), { recursive: true })
  fs.writeFileSync(path.join(workspace, "vault", notePath), content)
  fs.writeFileSync(path.join(workspace, "public", "briefings", "index.html"), "<main></main>")
  const html = `<main><h2>한 문장 정의</h2><p><strong>Chronos</strong>는 관측값을 토큰으로 표현한다.</p><h2>작동 원리</h2><p><strong>Chronos</strong>는 입력을 처리한다.</p><p><strong>TimesFM-3</strong>는 9개 분위수를 예측한다.</p><h2>실제 예시</h2><p><a href="https://example.org/paper">논문</a>은 연구 결과를 설명한다.</p></main>`
  fs.writeFileSync(htmlPath, html)
  assert.equal(verifyKnowledgeOutputs(workspace, approved)[0].concept_id, "timeseries")

  fs.writeFileSync(htmlPath, html.replace("9개 분위수", "8개 분위수"))
  assert.throws(() => verifyKnowledgeOutputs(workspace, approved), /differs from approved prose/)
  fs.writeFileSync(
    htmlPath,
    html.replace("</p><h2>실제 예시", "</p><h2>왜 중요한가</h2><p>없음</p><h2>실제 예시"),
  )
  assert.throws(
    () => verifyKnowledgeOutputs(workspace, approved),
    /Empty approved knowledge section/,
  )
  fs.writeFileSync(
    htmlPath,
    html.replace('href="https://example.org/paper"', 'href="https://example.org/other"'),
  )
  assert.throws(() => verifyKnowledgeOutputs(workspace, approved), /source links differ/)
})

const sample = () => {
  const draft = {
    title: "장비 개발 발표",
    lead: [
      { text: "Example Co가 장비 개발을 발표했다.", claim_ids: ["c1"] },
      { text: "회사는 내년 출하할 계획이라고 밝혔다.", claim_ids: ["c1"] },
    ],
    facts: {
      who: "Example Co",
      when: "2026-09-27",
      where: null,
      what: "장비 개발",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: ["Example Co"],
    explanations: [],
  }
  const record = { draft, draft_id: sha256(JSON.stringify(draft)) }
  const text = "Example Co plans a product"
  const parses = [
    {
      schema_version: "source-parse/v1",
      source_id: "s1",
      source_version_id: "s1:v1",
      parse_id: "p1",
      title: "Plan",
      status: "extracted",
      dates: { published_at: "2026-09-27" },
      quality: { missing_pages: [] },
      blocks: [{ block_id: "p1:b1", text, locator: { text_hash: sha256(text) } }],
    },
  ]
  const claims = recordFactReview(
    [
      {
        claim_id: "c1",
        candidate_key: "event",
        statement: text,
        claim_kind: "attributed_fact",
        subject: "Example Co",
        event_state: "planned",
        published_at: "2026-09-27",
        effective_period: null,
        numbers: [],
        evidence: [
          {
            source_id: "s1",
            source_version_id: "s1:v1",
            parse_id: "p1",
            block_id: "p1:b1",
            quote: text,
            support: "direct",
          },
        ],
      },
    ],
    [
      {
        claim_id: "c1",
        status: "verified",
        reason: "Fixture source checked",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "test-reviewer", reviewed_at: "2026-09-27" },
    parses,
  )
  const documents = [
    {
      source_id: "s1",
      source_version_id: "s1:v1",
      original_url: "https://example.com/announcement",
    },
  ]
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "test-reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "1234567890abcdef",
    published_at: "2026-09-27",
    reviewed_at: "2026-09-27",
    region: "해외",
    private_notes: "must not be projected",
  }
  return { record, claims, documents, review, parses }
}

test("editorial directions cannot enter approved reader prose", () => {
  const direction =
    "두 지표를 합쳐 ChatGPT가 모든 아이디어 다양성을 높이거나 낮췄다고 표현하지 않는다."
  for (const location of ["title", "lead", "heading", "paragraph"]) {
    const { record, claims, documents, review, parses } = sample()
    if (location === "title") record.draft.title = direction
    else if (location === "lead") record.draft.lead[0].text = direction
    else
      record.draft.explanations = [
        {
          heading: location === "heading" ? direction : "아이디어 다양성의 두 기준",
          paragraphs: [{ text: direction, claim_ids: ["c1"] }],
        },
      ]
    record.draft_id = sha256(JSON.stringify(record.draft))
    review.draft_id = record.draft_id
    assert.throws(
      () => approvedArticle(record, claims, documents, review, parses),
      /operational_or_generic_prose/,
      location,
    )
  }
})

test("prose guard allows negative results and technical descriptions", () => {
  for (const text of [
    "참가자 사이의 다양성에서는 ChatGPT 단독 효과가 0과 통계적으로 구분되지 않았다.",
    "모델은 외부 도구를 사용하지 않는다.",
    "모델은 음성을 표현하지 않는다.",
  ]) {
    const { record, claims } = sample()
    record.draft.explanations = [
      { heading: "실험 결과", paragraphs: [{ text, claim_ids: ["c1"] }] },
    ]
    assert.ok(!draftProblems(record.draft, claims).includes("operational_or_generic_prose"))
  }
  const { record, claims } = sample()
  record.draft.explanations = [
    {
      heading: "분석",
      paragraphs: [{ text: "근거가 부족해 분석을 생략한다.", claim_ids: ["c1"] }],
    },
  ]
  assert.ok(draftProblems(record.draft, claims).includes("operational_or_generic_prose"))
})

test("internal claim identities cannot enter reader titles, leads or explanations", () => {
  for (const location of ["title", "lead", "heading", "paragraph"]) {
    const { record, claims, documents, review, parses } = sample()
    const id = claims[0].claim_id
    if (location === "title") record.draft.title += ` [${id}]`
    else if (location === "lead") record.draft.lead[0].text += ` [${id}]`
    else
      record.draft.explanations = [
        {
          heading: location === "heading" ? `원문 기능 [${id}]` : "원문 기능",
          paragraphs: [
            {
              text:
                location === "paragraph"
                  ? `회사는 장비 개발을 발표했다. [${id}]`
                  : "회사는 장비 개발을 발표했다.",
              claim_ids: [id],
            },
          ],
        },
      ]
    record.draft_id = sha256(JSON.stringify(record.draft))
    review.draft_id = record.draft_id
    assert.throws(
      () => approvedArticle(record, claims, documents, review, parses),
      /internal_claim_identity/,
    )
  }
})
test("approved projection uses existing editorial contract and omits private notes/model data", () => {
  const s = sample(),
    article = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses)
  const projection = editionProjection([article], {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T23:00:00Z",
    coverage_end: "2026-09-27T00:00:00Z",
  })
  assert.ok(projection.content.includes("event_id: 1234567890abcdef"))
  assert.ok(projection.content.includes("https://example.com/announcement"))
  assert.equal(projection.content.includes("private_notes"), false)
  assert.equal(projection.content.includes("prompt_sha256"), false)
  assert.equal(projection.content.includes("deep_skip_reason"), false)
  assert.equal(projection.content.includes("분석 생략"), false)
})

test("private new-edition slice continues the cutoff without reusing an event or changing the vault", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "new-edition-slice-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const editionDir = path.join(vault, "Editions/2026/09")
  fs.mkdirSync(editionDir, { recursive: true })
  fs.mkdirSync(path.join(vault, "Knowledge"))
  const prior = path.join(editionDir, "2026-09-27_0800_Tech_AI_Briefing.md")
  fs.writeFileSync(
    prior,
    noteText(
      { title: "prior", date: "2026-09-27", coverage_end: "2026-09-27T00:00:00Z" },
      "# Source List\n",
    ),
  )
  const s = sample()
  s.review.event_id = sha256("https://example.com/announcement").slice(0, 16)
  const article = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses)
  const spec = {
    schema: "research-private-edition/v1",
    intent: "private_slice",
    key: "2026-09-28_0800_Tech_AI_Briefing",
    date: "2026-09-28",
    coverage_start: "2026-09-27T00:00:00Z",
    coverage_end: "2026-09-27T23:00:00Z",
  }
  const [projection] = newEditionProjections(vault, [article], spec)
  assert.equal(projection.path, "Editions/2026/09/2026-09-28_0800_Tech_AI_Briefing.md")
  assert.deepEqual(projection.event_ids, [article.event_id])
  assert.deepEqual(
    extractArticles({
      ...parseNote(projection.content),
      file: path.join(vault, projection.path),
    }).map((entry) => entry.id),
    [article.event_id],
  )
  assert.equal(fs.existsSync(path.join(vault, projection.path)), false)
  // Earlier approvals used the exact original URL, including a trailing slash.
  // Publication must preserve their fixed event identity and URL.
  const originalURL = "https://example.com/announcement/"
  const originalID = sha256(originalURL).slice(0, 16)
  const originalArticle = {
    ...article,
    event_id: originalID,
    source_urls: [originalURL],
    article_review: { ...article.article_review, event_id: originalID },
  }
  const [originalProjection] = newEditionProjections(vault, [originalArticle], spec)
  assert.deepEqual(originalProjection.event_ids, [originalID])
  assert.ok(originalProjection.content.includes(originalURL))
  assert.throws(
    () =>
      newEditionProjections(
        vault,
        [{ ...originalArticle, event_id: sha256("https://example.com/other/").slice(0, 16) }],
        spec,
      ),
    /duplicate or out-of-window event/,
  )
  assert.throws(
    () => newEditionProjections(vault, [{ ...article, event_id: "0000000000000000" }], spec),
    /duplicate or out-of-window event/,
  )
  assert.throws(
    () =>
      newEditionProjections(vault, [article], { ...spec, coverage_start: "2026-09-26T00:00:00Z" }),
    /latest authority cutoff/,
  )
  assert.throws(
    () => newEditionProjections(vault, [article], { ...spec, intent: "publish" }),
    /private new-edition/,
  )
  const officialArticle = {
    ...originalArticle,
    source_urls: ["https://official.example.org/new-source"],
  }
  assert.throws(
    () => newEditionProjections(vault, [officialArticle], spec),
    /duplicate or out-of-window event/,
  )
  const verifiedOriginals = new Map([[originalID, originalURL]])
  const [officialProjection] = newEditionProjections(
    vault,
    [officialArticle],
    spec,
    [],
    verifiedOriginals,
  )
  const projectedArticles = extractArticles({
    ...parseNote(officialProjection.content),
    file: path.join(vault, officialProjection.path),
  })
  assert.deepEqual(
    projectedArticles.map((entry) => entry.id),
    [originalID],
  )
  assert.deepEqual(projectedArticles[0].urls, officialArticle.source_urls)
  assert.equal(officialProjection.content.includes(originalURL), false)
  const priorBytes = fs.readFileSync(prior)
  fs.writeFileSync(
    prior,
    editionProjection(
      [
        {
          ...article,
          source_urls: [originalURL],
          event_id: sha256("https://example.com/announcement").slice(0, 16),
        },
      ],
      {
        key: "2026-09-27_0800_Tech_AI_Briefing",
        date: "2026-09-27",
        coverage_start: "2026-09-26T00:00:00Z",
        coverage_end: "2026-09-27T00:00:00Z",
      },
    ).content,
  )
  assert.throws(
    () => newEditionProjections(vault, [officialArticle], spec, [], verifiedOriginals),
    /duplicate or out-of-window event/,
  )
  fs.writeFileSync(prior, priorBytes)
  const duplicateConcept = noteText({ concept_id: "same-concept" }, "# Term\n")
  fs.writeFileSync(path.join(vault, "Knowledge/First.md"), duplicateConcept)
  fs.writeFileSync(path.join(vault, "Knowledge/Second.md"), duplicateConcept)
  assert.throws(
    () => newEditionProjections(vault, [article], spec),
    /Duplicate canonical knowledge concept ID/,
  )
  fs.rmSync(path.join(vault, "Knowledge/Second.md"))
  fs.writeFileSync(path.join(vault, projection.path), projection.content)
  assert.throws(
    () => newEditionProjections(vault, [article], spec),
    /latest authority cutoff|already exists/,
  )
})

test("private new edition refuses sources observed after its coverage cutoff", () => {
  const spec = { coverage_end: "2026-09-29T06:24:00Z" }
  assert.doesNotThrow(() =>
    assertNewEditionSourceCutoff([{ source_observed_at: ["2026-09-29T04:27:51.981Z"] }], spec),
  )
  assert.throws(
    () => assertNewEditionSourceCutoff([{ source_observed_at: ["2026-09-29T06:24:01Z"] }], spec),
    /observed after the coverage cutoff/,
  )
  assert.throws(
    () => assertNewEditionSourceCutoff([{ source_observed_at: [] }], spec),
    /observed after the coverage cutoff/,
  )
})

test("retrospective edition projection preserves headline order, knowledge references and secondary classification", () => {
  const s = sample(),
    a = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses)
  const b = structuredClone(a)
  b.event_id = "abcdef1234567890"
  b.title = b.record.title = b.article_review.title = "두 번째 장비 발표"
  b.article_review.event_id = b.event_id
  const options = {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T23:00:00Z",
    coverage_end: "2026-09-27T00:00:00Z",
  }
  const initial = editionProjection([a, b], options),
    existing = parseNote(initial.content)
  existing.file = "vault/" + initial.path
  existing.meta.headlines = [b.title, a.title]
  existing.meta.linked_knowledge_notes = ["Knowledge/Existing Term"]
  existing.meta.knowledge_notes_created = []
  existing.meta.knowledge_notes_updated = ["Knowledge/Existing Term"]
  existing.meta.recent_event_ids = ["0011223344556677"]
  existing.meta.briefing_highlights = [b.event_id, "0011223344556677"]
  existing.meta.excluded_events = ["0011223344556677"]
  existing.meta.private_notes = "never copied into generated publication"
  let at = 0
  existing.body = existing.body.replace(/\*\*보조 테마:\*\* 없음/g, (value) =>
    ++at === 2 ? "**보조 테마:** 연구·기술" : value,
  )
  const updated = structuredClone(b)
  updated.title = updated.record.title = updated.article_review.title = "정정한 두 번째 장비 발표"
  const result = parseNote(editionProjection([a, updated], { ...options, existing }).content)
  result.file = existing.file
  assert.deepEqual(result.meta.headlines, [updated.title, a.title])
  for (const key of [
    "linked_knowledge_notes",
    "knowledge_notes_created",
    "knowledge_notes_updated",
    "recent_event_ids",
    "briefing_highlights",
    "excluded_events",
  ])
    assert.deepEqual(result.meta[key], existing.meta[key])
  assert.equal(result.meta.private_notes, undefined)
  assert.equal(
    extractArticles(result).find((c) => c.id === b.event_id).classification.secondary_theme,
    "연구·기술",
  )
})

test("retrospective correction removes only retired concept links and preserves shared links", () => {
  const s = sample()
  const revised = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses)
  const prior = structuredClone(revised)
  prior.article_review.concept_ids = ["agents"]
  prior.concept_paths = ["Knowledge/AI Systems/AI Agents"]
  const sibling = structuredClone(prior)
  sibling.event_id = sibling.article_review.event_id = "abcdef1234567890"
  sibling.title =
    sibling.record.title =
    sibling.article_review.title =
      "공동 개념을 참조한 다른 기사"
  sibling.article_review.concept_ids = ["metrics"]
  sibling.concept_paths = ["Knowledge/Data Systems/Aggregate Metrics"]
  const options = {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T23:00:00Z",
    coverage_end: "2026-09-27T00:00:00Z",
  }
  const existing = parseNote(editionProjection([prior, sibling], options).content)
  existing.meta.linked_knowledge_notes = [
    "Knowledge/AI Systems/AI Agents",
    "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]",
    "Knowledge/Independent Note",
  ]
  const corrected = parseNote(
    editionProjection([revised, sibling], {
      ...options,
      existing,
      concept_paths_by_id: {
        agents: "Knowledge/AI Systems/AI Agents",
        metrics: "Knowledge/Data Systems/Aggregate Metrics",
      },
    }).content,
  )
  assert.deepEqual(corrected.meta.linked_knowledge_notes, [
    "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]",
    "Knowledge/Independent Note",
  ])
  assert.equal(corrected.body.includes("[[Knowledge/AI Systems/AI Agents]]"), false)
  assert.ok(corrected.body.includes("[[Knowledge/Data Systems/Aggregate Metrics]]"))

  const shared = structuredClone(sibling)
  shared.article_review.concept_ids = ["agents", "metrics"]
  shared.concept_paths = [
    "Knowledge/AI Systems/AI Agents",
    "Knowledge/Data Systems/Aggregate Metrics",
  ]
  const kept = parseNote(
    editionProjection([revised, shared], {
      ...options,
      existing,
      concept_paths_by_id: {
        agents: "Knowledge/AI Systems/AI Agents",
        metrics: "Knowledge/Data Systems/Aggregate Metrics",
      },
    }).content,
  )
  assert.ok(kept.meta.linked_knowledge_notes.includes("Knowledge/AI Systems/AI Agents"))

  const newlyLinked = structuredClone(revised)
  newlyLinked.article_review.concept_ids = ["metrics"]
  const noMetricsMetadata = structuredClone(existing)
  noMetricsMetadata.meta.linked_knowledge_notes = ["Knowledge/Independent Note"]
  const added = parseNote(
    editionProjection([newlyLinked, sibling], {
      ...options,
      existing: noMetricsMetadata,
      concept_paths_by_id: { metrics: "Knowledge/Data Systems/Aggregate Metrics" },
    }).content,
  )
  assert.ok(added.body.includes("**개념:** [[Knowledge/Data Systems/Aggregate Metrics]]"))
  assert.ok(added.meta.linked_knowledge_notes.includes("Knowledge/Data Systems/Aggregate Metrics"))
  assert.throws(
    () => editionProjection([newlyLinked, sibling], { ...options, existing }),
    /canonical knowledge note/,
  )
})

test("projected editions satisfy the complete authoring validator without changing it", (t) => {
  const vault = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "research-edition-contract-")),
  )
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const s = sample(),
    article = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses)
  const projected = editionProjection([article], {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T23:00:00Z",
    coverage_end: "2026-09-27T00:00:00Z",
  })
  const file = path.join(vault, projected.path)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, projected.content)
  const result = spawnSync(
    "python3",
    ["scripts/validate_encyclopedia.py", "--vault-root", vault, "--briefing", file],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
test("unchecked facts and a changed draft cannot be approved", () => {
  const s = sample()
  assert.throws(
    () => approvedArticle(s.record, s.claims, s.documents, { ...s.review, source_read: "true" }),
    /approval/,
  )
  assert.throws(
    () =>
      approvedArticle(s.record, s.claims, s.documents, { ...s.review, final_prose_read: false }),
    /approval/,
  )
  s.record.draft.lead[0].text = "임의의 수치가 바뀌었다."
  assert.throws(
    () => approvedArticle(s.record, s.claims, s.documents, s.review),
    /changed after review/,
  )
})

test("private retrospective updates every appearance and retains other articles and reviews", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-retrospective-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const s = sample(),
    a = approvedArticle(s.record, s.claims, s.documents, s.review, s.parses),
    b = structuredClone(a)
  b.event_id = b.article_review.event_id = "abcdef1234567890"
  b.title = b.record.title = b.article_review.title = "함께 실린 다른 장비 발표"
  b.article_review.review_status = "unreviewed"
  b.concept_paths = ["Knowledge/Existing Term"]
  const before = new Map()
  for (const date of ["2026-09-27", "2026-09-28"]) {
    const projected = editionProjection([a, b], {
      key: `${date}_0800_Tech_AI_Briefing`,
      date,
      coverage_start: `${date}T00:00:00Z`,
      coverage_end: `${date}T01:00:00Z`,
    })
    const file = path.join(vault, projected.path)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, projected.content)
    before.set(file, fs.readFileSync(file))
  }
  const updated = structuredClone(a)
  updated.title = updated.record.title = updated.article_review.title = "원문을 재검토한 장비 발표"
  const projections = retrospectiveProjections(vault, [updated])
  assert.equal(projections.length, 2)
  for (const projected of projections) {
    const parsed = parseNote(projected.content)
    parsed.file = path.join(vault, projected.path)
    const current = extractArticles(parsed)
    assert.deepEqual(
      current.map((c) => c.id),
      [a.event_id, b.event_id],
    )
    const retained = current[1]
    assert.equal(retained.review.review_status, "unreviewed")
    assert.deepEqual(retained.concepts, b.concept_paths)
    assert.deepEqual(existingArticleProjection(retained), { ...b, secondary_theme: null })
    retained.editorial.private_notes = "private review must not survive public normalization"
    assert.equal(existingArticleProjection(retained).record.private_notes, undefined)
    assert.equal(current[0].title, updated.title)
  }
  for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(file), bytes)
  assert.throws(() => retrospectiveProjections(vault, [updated, updated]), /Distinct/)
  const wrongDate = structuredClone(updated)
  wrongDate.article_review.published_at = "2026-09-26"
  assert.throws(
    () => retrospectiveProjections(vault, [wrongDate]),
    /original event publication date/,
  )
  const absent = structuredClone(updated)
  absent.event_id = absent.article_review.event_id = "0011223344556677"
  assert.throws(() => retrospectiveProjections(vault, [absent]), /no existing edition/)
})

test("a reviewed historical addition enters its original edition without changing existing event IDs", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-backfill-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const original = sample()
  const prior = approvedArticle(
    original.record,
    original.claims,
    original.documents,
    original.review,
    original.parses,
  )
  const key = "2026-09-28_0800_Tech_AI_Briefing"
  const initial = editionProjection([prior], {
    key,
    date: "2026-09-28",
    coverage_start: "2026-09-27T08:00:00+09:00",
    coverage_end: "2026-09-28T08:00:00+09:00",
  })
  const file = path.join(vault, initial.path)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, initial.content)

  const next = sample()
  next.review.event_id = "abcdef1234567890"
  next.documents[0].original_url = "https://example.com/second-announcement"
  next.record.draft.title = "둘째 장비 개발 발표"
  next.record.draft_id = next.review.draft_id = sha256(JSON.stringify(next.record.draft))
  const backfill = {
    schema_version: "historical-addition-review/v1",
    event_id: next.review.event_id,
    reviewer: next.review.reviewer,
    reviewed_at: next.review.reviewed_at,
    reason: "원문 날짜를 확인하고 과거 회차에 누락된 별도 사건을 추가한다.",
    source_read: true,
    duplicate_checked: true,
    calendar_window_checked: true,
    target_path: initial.path,
    target_sha256: sha256(initial.content),
  }
  next.review.historical_addition_review = backfill
  const addition = approvedArticle(
    next.record,
    next.claims,
    next.documents,
    next.review,
    next.parses,
  )
  const [projected] = retrospectiveProjections(vault, [addition])
  const parsed = parseNote(projected.content)
  parsed.file = path.join(vault, projected.path)
  assert.deepEqual(
    extractArticles(parsed).map((a) => a.id),
    [prior.event_id, addition.event_id],
  )
  assert.deepEqual(projected.event_ids, [addition.event_id])
  assert.equal(parsed.meta.new_items_count, 2)
  assert.equal(projected.content.includes(backfill.reason), false)
  assert.equal(fs.readFileSync(file, "utf8"), initial.content)

  const wrongHash = structuredClone(addition)
  wrongHash.historical_addition_review.target_sha256 = "0".repeat(64)
  assert.throws(() => retrospectiveProjections(vault, [wrongHash]), /does not match/)
  const duplicateSource = structuredClone(addition)
  duplicateSource.source_urls = prior.source_urls
  assert.throws(() => retrospectiveProjections(vault, [duplicateSource]), /does not match/)
  const withoutReview = structuredClone(addition)
  delete withoutReview.historical_addition_review
  assert.throws(() => retrospectiveProjections(vault, [withoutReview]), /no existing edition/)

  // Daily collection persists UTC cutoffs; editorial publication days use KST.
  const utc = parseNote(initial.content)
  utc.meta.coverage_start = "2026-09-26T23:00:00Z"
  utc.meta.coverage_end = "2026-09-27T23:00:00Z"
  const utcContent = noteText(utc.meta, utc.body)
  fs.writeFileSync(file, utcContent)
  const within = structuredClone(addition)
  within.historical_addition_review.target_sha256 = sha256(utcContent)
  within.article_review.published_at = "2026-09-28"
  within.article_review.reviewed_at = "2026-09-28"
  within.historical_addition_review.reviewed_at = "2026-09-28"
  within.article_review.date_kind = "source-publication-time"
  within.article_review.source_published_at = "2026-09-27T22:00:00Z"
  const [utcProjection] = retrospectiveProjections(vault, [within])
  assert.equal(parseNote(utcProjection.content).meta.coverage_end, utc.meta.coverage_end)

  const after = structuredClone(within)
  after.article_review.source_published_at = "2026-09-28T00:00:00Z"
  assert.throws(() => retrospectiveProjections(vault, [after]), /does not match/)
  const malformed = structuredClone(within)
  malformed.article_review.source_published_at = "2026-09-28"
  assert.throws(() => retrospectiveProjections(vault, [malformed]), /does not match/)
})

test("article approval requires current parse evidence and real calendar dates", () => {
  const s = sample()
  assert.throws(() => approvedArticle(s.record, s.claims, s.documents, s.review), /parse|evidence/i)
  assert.throws(
    () =>
      approvedArticle(
        s.record,
        s.claims,
        s.documents,
        {
          ...s.review,
          published_at: "2026-09-31",
          reviewed_at: "2026-10-01",
        },
        s.parses,
      ),
    /date|time/i,
  )
})

test("approval refuses altered facts or parse metadata after the exact fact review", () => {
  for (const mutate of [
    (s) => {
      s.claims[0].statement = "A different claim with the old review"
    },
    (s) => {
      s.claims[0].subject = "Another company"
    },
    (s) => {
      s.parses[0].dates.modified_at = "2026-09-28"
    },
    (s) => {
      s.claims[0].review.claim_sha256 = "forged"
    },
    (s) => {
      s.claims[0].review.checks.entailment_checked = "true"
    },
  ]) {
    const s = sample()
    mutate(s)
    assert.throws(
      () => approvedArticle(s.record, s.claims, s.documents, s.review, s.parses),
      /changed|review|problems/,
    )
  }
})

test("approval date cannot come from an unrelated or later source", () => {
  const s = sample()
  assert.throws(
    () =>
      approvedArticle(
        s.record,
        s.claims,
        s.documents,
        { ...s.review, published_at: "2026-09-26" },
        s.parses,
      ),
    /supporting source date/,
  )
  assert.throws(
    () =>
      approvedArticle(
        s.record,
        s.claims,
        s.documents,
        { ...s.review, reviewed_at: "2999-01-01" },
        s.parses,
      ),
    /future/,
  )
  assert.throws(
    () =>
      approvedArticle(
        s.record,
        s.claims,
        [{ ...s.documents[0], observed_at: "2999-01-01T00:00:00Z" }],
        s.review,
        s.parses,
      ),
    /date|time/,
  )
})
test("invalid sources propagate review requirements without deleting historical judgments", () => {
  const records = {
    claims: [{ claim_id: "c1", evidence: [{ source_version_id: "v1" }] }],
    articles: [{ event_id: "e1", claim_ids: ["c1"] }],
    concepts: [{ concept_id: "term", evidence: [{ event_id: "e1" }] }],
    histories: [{ id: "h1", event_id: "e1" }],
  }
  const impact = correctionImpact(records, ["v1"])
  assert.deepEqual(impact.event_ids, ["e1"])
  assert.deepEqual(impact.concept_ids, ["term"])
  assert.deepEqual(impact.history_ids, ["h1"])
  assert.equal(impact.public_mutation_performed, false)
  assert.equal(records.histories.length, 1)
})
test("paper versions and same-name people require explicit identity reconciliation", () => {
  assert.deepEqual(
    reconcilePaperVersions([
      { work_id: "work1", identifiers: ["arxiv:2609.12345v1", "arxiv:2609.12345v2"] },
    ]),
    [["arxiv:2609.12345", "work1"]],
  )
  assert.throws(
    () =>
      reconcilePaperVersions([
        { work_id: "w1", identifiers: ["arxiv:2609.12345v1"] },
        { work_id: "w2", identifiers: ["arxiv:2609.12345v2"] },
      ]),
    /conflict/,
  )
  assert.throws(
    () =>
      assertPersonIdentity(
        { person_id: "same", name: "A", affiliation: "NewLab", evidence_urls: ["u"] },
        [{ person_id: "same", name: "A", affiliation: "OtherLab" }],
      ),
    /conflict/,
  )
})
test("concept assignments use reviewed specialist registry, never generic entities or cooccurrence", (t) => {
  const vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "concept-registry-")))
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const metadata = {
    title: "Runtime Policy",
    entry_type: "concept",
    concept_id: "runtime-policy",
    verified_sources: ["https://example.org/policy"],
    map_review: {
      decision: "include",
      kind: "security",
      reason: "Synthetic review of execution policy boundaries",
      reviewed: "2026-09-27",
    },
  }
  atomicWrite(vault, "Knowledge/Policy.md", noteText(metadata, "Synthetic definition"))
  atomicWrite(
    vault,
    "Knowledge/FANUC.md",
    noteText(
      { ...metadata, concept_id: "fanuc", map_review: { decision: "exclude", kind: "security" } },
      "Synthetic company entry",
    ),
  )
  atomicWrite(
    vault,
    "Knowledge/Unreviewed.md",
    noteText(
      { ...metadata, concept_id: "unreviewed", map_review: null },
      "Synthetic unreviewed definition",
    ),
  )
  const registry = conceptRegistry(vault)
  assert.deepEqual(
    registry.map((n) => n.meta.concept_id),
    ["runtime-policy"],
  )
  assert.throws(
    () =>
      verifiedConceptLinks(
        { review_status: "verified", event_id: "e1", claim_ids: ["c1"] },
        [{ concept_id: "fanuc", status: "verified" }],
        registry,
      ),
    /specialist/,
  )
  assert.deepEqual(verifiedConceptLinks({ review_status: "unreviewed" }, [], registry), [])
  assert.deepEqual(
    verifiedConceptLinks(
      { review_status: "verified", event_id: "e1", claim_ids: ["c1"] },
      [],
      registry,
    ),
    [],
  )
})
test("legacy archive verifies old IDs/raw hash and keeps imports unreviewed", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-archive-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const snapshots = path.join(root, "snapshots")
  fs.mkdirSync(snapshots)
  const url = "https://example.com/a/",
    bytes = Buffer.from("Original body")
  fs.writeFileSync(path.join(snapshots, "a.bin"), bytes)
  const entry = {
    source_id: sha256(url).slice(0, 20),
    url,
    status: "captured_unreviewed",
    snapshot: "a.bin",
    sha256: sha256(bytes),
  }
  const r = importLegacySources(root, { sources: [entry] }, snapshots)
  assert.equal(r[0].source_id, entry.source_id)
  assert.equal(r[0].article_review_status, "unreviewed")
  assert.equal(fs.existsSync(path.join(root, `documents/${entry.source_id}/latest.json`)), false)
  assert.throws(
    () => importLegacySources(root, { sources: [{ ...entry, sha256: "wrong" }] }, snapshots),
    /hash mismatch/,
  )
})
test("robots uses longest matching rule and concurrent same-origin checks coalesce", async () => {
  const text = "User-agent: *\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 3\n"
  assert.equal(
    robotsPolicy(text, "TechKnowledgeGarden/1.0", "https://example.com/private/a").allowed,
    false,
  )
  assert.equal(
    robotsPolicy(text, "TechKnowledgeGarden/1.0", "https://example.com/private/public").allowed,
    true,
  )
  let calls = 0
  const fetcher = {
    options: {},
    fetch: async () => {
      calls++
      await new Promise((r) => setTimeout(r, 5))
      return { fetch_status: "not_found" }
    },
  }
  await Promise.all([
    checkRobots("unused", fetcher, "https://example.com/en"),
    checkRobots("unused", fetcher, "https://example.com/ja"),
  ])
  assert.equal(calls, 1)
})
test("legacy publication is never candidate publication or seven shadow runs", () => {
  const record = shadowRecord({
    edition_key: "edition1",
    run_id: "run1",
    actual_started_at: "2026-09-27T00:00:00Z",
    legacy_publication: {
      published_by: "legacy",
      live_verified: true,
      drive_verified: true,
      github_verified: true,
    },
    candidate_review: { approved: true, source_reviewed: true, prose_reviewed: true },
    coverage: Array.from({ length: 32 }, () => ({ status: "partial" })),
    evaluation: { critical_errors: 0, quality_score: 9, lowest_dimension_score: 1 },
  })
  const audit = promotionAudit(
    Array.from({ length: 7 }, () => record),
    {},
  )
  assert.equal(record.candidate_published, false)
  assert.equal(audit.completed_comparisons, 1)
  assert.equal(audit.assisted_transition_allowed, false)
  assert.equal(audit.unattended_publication_allowed, false)
})
test("reviewed inline project routes can be replaced by exact original event permalinks without losing evidence", (t) => {
  const f = legacyTransitionFixture(t, { sourceListOnly: true })
  const route = "https://example.com"
  reviseLegacyFixture(f, f.existing.body.replace("이전 본문.", `이전 본문. ${route}`))
  const event = f.packet.events[0]
  event.source_list_review = {
    source_list_read: true,
    article_source_read: true,
    association_checked: true,
    reason:
      "Original listed permalink identifies this event; the inline project homepage is a discovery route.",
  }
  f.packet.events[1].source_list_review = {
    source_list_read: true,
    article_source_read: true,
    association_checked: true,
    reason: "Reviewed exact original source-list assignment.",
  }
  const unit = f.packet.units.find((u) => u.unit_id === event.unit_id)
  f.packet.inline_discovery_dispositions = [
    {
      unit_id: unit.unit_id,
      sha256: unit.sha256,
      url: route,
      role: "discovery",
      source_role_checked: true,
      article_sources_read: true,
      association_checked: true,
      reason:
        "Same project homepage precedes the original event permalink; reviewed full original unit and article.",
    },
  ]
  assert.equal(assertLegacyTransition(f.packet, f.articles, f.existing, f.relative), f.packet)
  const projected = editionProjection(f.articles, {
    key: f.key,
    date: f.existing.meta.date,
    coverage_start: f.existing.meta.coverage_start,
    coverage_end: f.existing.meta.coverage_end,
    existing: f.existing,
    legacy_review: f.packet,
  })
  assert.equal(projected.content.includes("inline_discovery_dispositions"), false)
  assert.equal(projected.content.includes("Same project homepage"), false)
  for (const mutate of [
    (p) => delete p.inline_discovery_dispositions,
    (p) => (p.inline_discovery_dispositions[0].sha256 = "0".repeat(64)),
    (p) => (p.inline_discovery_dispositions[0].unit_id = p.units[0].unit_id),
    (p) => (p.inline_discovery_dispositions[0].url = "https://unrelated.example"),
    (p) => (p.inline_discovery_dispositions[0].url = p.events[0].source_urls[0]),
    (p) => (p.inline_discovery_dispositions[0].association_checked = false),
    (p) => p.inline_discovery_dispositions.push(p.inline_discovery_dispositions[0]),
    (p) => delete p.events[0].source_list_review,
  ]) {
    const p = structuredClone(f.packet)
    mutate(p)
    assert.throws(() => assertLegacyTransition(p, f.articles, f.existing, f.relative))
  }
})
