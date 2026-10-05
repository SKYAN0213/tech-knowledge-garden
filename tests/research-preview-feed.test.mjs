import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Parser from "rss-parser"
import { noteText, feeds } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { newEditionFeedBaseline, verifyKnowledgeOutputs } from "../scripts/research/preview.mjs"

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

test("source-event preview compares escaped numeric prose and rejects missing source links", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "topic-preview-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const put = (relative, content) => {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  const edition = "Editions/2026/09/2026-09-12_0800_Tech_AI_Briefing",
    event = "0123456789abcdef",
    title = "Verified source event",
    summary = "Measured range 1.5~1.9; issue #42.",
    url = "https://example.org/original",
    thesis = "Reviewed source summary."
  put(
    "vault/" + edition + ".md",
    noteText(
      {
        schema_version: "tech-ai-magazine/v2",
        type: "briefing",
        date: "2026-09-12",
        article_reviews: [
          {
            title,
            event_id: event,
            review_status: "verified",
            published_at: "2026-09-11",
            reviewed_at: "2026-09-12",
            concept_ids: [],
          },
        ],
      },
      `# 뉴스 데스크\n\n## ${title}\n\n${summary} [S1]\n\n# Source List\n\n[S1] ${url}`,
    ),
  )
  put(
    "vault/Signals/review.md",
    noteText(
      {
        schema_version: "tech-signals/v1",
        edition,
        date: "2026-09-12",
        reviewed: "2026-09-22",
        review_basis: "primary-research",
        observations: [
          {
            id: "source-event",
            event_id: event,
            topic_id: "topic",
            stance: "context",
            change: "Recorded event",
            meaning: "Private meaning",
            limit: "Private limit",
            next_check: "Private next",
          },
        ],
      },
      "",
    ),
  )
  const content = noteText(
    {
      schema_version: "tech-trend/v1",
      id: "topic",
      title: "Source topic",
      question: "What happened?",
      thesis,
      watch_for: "Private next",
      disconfirming: "Private condition",
      reviewed: "2026-09-22",
      reader_format: "source-events/v1",
      knowledge_notes: [],
      lessons: [],
    },
    `[Source](${url})`,
  )
  put("vault/TrendTopics/topic.md", content)
  put("public/briefings/index.html", `<p>${thesis}</p>`)
  const html = `<p>${thesis}</p><p>${summary}</p><a href="${url}">Source</a>`
  put("public/briefings/topics/topic.html", html)
  put(
    "digest/topics/topic.md",
    `${thesis}\n\nMeasured range 1.5\\~1.9; issue \\#42.\n\n[Source](${url})`,
  )
  const notes = [{ path: "TrendTopics/topic.md", content, sha256: sha256(content) }]
  assert.deepEqual(verifyKnowledgeOutputs(root, notes)[0].event_ids, [event])
  put("public/briefings/topics/topic.html", `<p>${thesis}</p><p>${summary}</p>`)
  assert.throws(
    () => verifyKnowledgeOutputs(root, notes),
    /history differs from its verified event/,
  )
})
