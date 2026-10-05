import test from "node:test"
import assert from "node:assert/strict"
import { noteLineage } from "../scripts/website-note-lineage.mjs"

test("Reader pages retain every exact event appearance and the canonical topic path", () => {
  const notes = [
    { slug: "news/fixed", path: "News/fixed", meta: { type: "news", event_id: "fixed" } },
    { slug: "briefings/latest", meta: { type: "briefing-index", edition: "Editions/latest" } },
    { slug: "briefings/topics/robot", meta: { type: "briefing-topic", topic_id: "robot" } },
    { slug: "news/unrelated", meta: { type: "news", event_id: "different" } },
    { slug: "knowledge/grasp", path: "Knowledge/Grasp", meta: { entry_type: "concept" } },
  ]
  const issues = [
    { path: "Editions/old.md", articles: [{ id: "fixed" }] },
    { path: "Editions/latest.md", articles: [{ id: "fixed" }, { id: "fixed" }] },
  ]
  assert.deepEqual(noteLineage(notes, issues, [{ id: "robot", path: "TrendTopics/Renamed note.md" }]), {
    "news/fixed": ["Editions/latest.md", "Editions/old.md"],
    "briefings/latest": ["Editions/latest.md"],
    "briefings/topics/robot": ["TrendTopics/Renamed note.md"],
    "news/unrelated": [], "knowledge/grasp": ["Knowledge/Grasp.md"],
  })
})

test("Duplicate topic identities stop lineage rather than picking an arbitrary file", () => {
  assert.throws(() => noteLineage([], [], [{ id: "same", path: "A.md" }, { id: "same", path: "B.md" }]), /Duplicate/)
})
