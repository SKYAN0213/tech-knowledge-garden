import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { researchWindow } from "../scripts/research-window.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

function fixture(t, date = "2026-09-23") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-approved-day-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const article = {
    event_id: "fixed-event",
    article_review: {
      review_status: "verified",
      published_at: date,
    },
  }
  const candidate = {
    key: "candidate",
    title: "Later coverage",
    source_urls: ["https://example.org/later"],
    source_published_at: "2026-10-02",
    discovered_at: "2026-10-03T00:00:00Z",
    review_status: "verified",
    priority: "normal",
    event_id: "fixed-event",
    approval: {
      approved_run: "approved",
      article_sha256: sha256(JSON.stringify(article)),
      source_alternative_resolution_run: "same-event",
    },
  }
  const backlog = { schema: "research-candidates/v1", candidates: [candidate] }
  const window = () =>
    researchWindow("2026-10-01T13:38:20Z", "2026-10-04T00:00:00Z", backlog, [], {
      approvalRoot: root,
    })
  return { root, article, candidate, backlog, window }
}
test("later reporting keeps an approved older event out of the new edition queue", (t) => {
  const f = fixture(t)
  atomicCreate(f.root, "runs/approved/approved-article.json", f.article)
  const candidate = f.window().pending[0]
  assert.equal(candidate.next_route, "approved-historical")
  assert.equal(candidate.approved_published_at, "2026-09-23")
  assert.equal(candidate.source_published_at, "2026-10-02")
  assert.equal(candidate.event_id, f.candidate.event_id)
})
test("an alternate-source approval without its dated article waits for date verification", (t) => {
  const f = fixture(t)
  assert.equal(f.window().pending[0].next_route, "verify-original-date")
})
test("approved publication dates cannot be read from a changed or mismatched approval", (t) => {
  for (const mutation of [
    (a) => {
      a.article_review.published_at = "2026-10-03"
    },
    (a) => {
      a.event_id = "other-event"
    },
  ]) {
    const f = fixture(t)
    mutation(f.article)
    atomicCreate(f.root, "runs/approved/approved-article.json", f.article)
    assert.throws(f.window, /approval.*publication|publication.*approval/i)
  }
})
test("a newly approved event remains eligible with its fixed event identity", (t) => {
  const f = fixture(t, "2026-10-02")
  atomicCreate(f.root, "runs/approved/approved-article.json", f.article)
  assert.equal(f.window().pending[0].next_route, "approved-unpublished")
})
