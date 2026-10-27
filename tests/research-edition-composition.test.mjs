import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { reviewedEditionComposition } from "../scripts/research/edition-composition.mjs"
import { sectorGroups } from "../scripts/sectors.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "edition-composition-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const articles = Array.from({ length: 6 }, (_, i) => ({
    event_id: i.toString(16).padStart(16, "0"),
    sector: "로봇·제조",
    title: "Synthetic fixture " + i,
    record: { lead: "Exact unchanged test prose " + i },
    article_review: { review_status: "verified", reviewed_at: "2026-10-20" },
  }))
  const spec = { key: "2026-10-27_0800_Tech_AI_Briefing" },
    curation = { path: "selection.json", sha256: sha256("test selection") }
  const review = {
    schema: "research-edition-composition-review/v1",
    edition_key: spec.key,
    curation_selection: curation,
    reviewer: "Synthetic fixture only",
    reviewed_at: "2026-10-27",
    reason: "Synthetic exact composition test",
    source_read: true,
    classification_checked: true,
    relationships_checked: true,
    articles: articles.map((a) => ({
      event_id: a.event_id,
      approved_article_sha256: sha256(JSON.stringify(a)),
      sector: a.sector,
      reason: "Retain reviewed scope",
    })),
    briefing_groups: [
      {
        id: "related-fixtures",
        title: "Related synthetic fixtures",
        sector: "로봇·제조",
        event_ids: articles.slice(0, 2).map((a) => a.event_id),
        reason: "Explicitly reviewed test relationship, not production evidence",
      },
    ],
  }
  const save = (value = review) => {
    const bytes = JSON.stringify(value)
    fs.writeFileSync(path.join(root, "review.json"), bytes)
    return { path: "review.json", sha256: sha256(bytes) }
  }
  const run = (reference = save()) =>
    reviewedEditionComposition(root, reference, { spec, curation, articles })
  return { root, articles, spec, curation, review, save, run }
}

test("exact composition keeps six event identities and prose within five reviewed reading entries", (t) => {
  const f = fixture(t),
    before = JSON.stringify(f.articles),
    result = f.run()
  const rows = result.articles.map((a) => ({ ...a, id: a.event_id, review: a.article_review }))
  assert.throws(
    () => sectorGroups({ meta: { briefing_format: "sector-five/v1" } }, rows),
    /More than five/,
  )
  const groups = sectorGroups(
    {
      meta: {
        briefing_format: "sector-five/v1",
        briefing_group_format: "related-events/v1",
        briefing_groups: result.groups,
      },
    },
    rows,
  )
  assert.equal(groups.find((g) => g.name === "로봇·제조").entries.length, 5)
  assert.equal(rows.length, 6)
  assert.equal(JSON.stringify(f.articles), before)
})

test("classification changes only the explicit sector and preserves immutable approved bytes", (t) => {
  const f = fixture(t),
    before = JSON.stringify(f.articles)
  f.review.articles[5].sector = "에너지·기후기술"
  const result = f.run()
  assert.equal(result.articles[5].sector, "에너지·기후기술")
  assert.deepEqual(result.articles[5].record, f.articles[5].record)
  assert.equal(JSON.stringify(f.articles), before)
})

test("composition rejects changed approval, selection, SHA, duplicate events and unsupported groups", (t) => {
  const f = fixture(t),
    original = structuredClone(f.review)
  for (const mutate of [
    (r) => {
      r.articles[0].approved_article_sha256 = "0".repeat(64)
    },
    (r) => {
      r.articles.pop()
    },
    (r) => {
      r.articles[1].event_id = r.articles[0].event_id
    },
    (r) => {
      r.curation_selection.sha256 = "0".repeat(64)
    },
    (r) => {
      r.classification_checked = false
    },
    (r) => {
      r.briefing_groups[0].event_ids[1] = "f".repeat(16)
    },
    (r) => {
      r.briefing_groups[0].reason = ""
    },
    (r) => {
      r.briefing_groups[0].event_ids = [r.articles[0].event_id]
    },
  ]) {
    const review = structuredClone(original)
    mutate(review)
    assert.throws(() => f.run(f.save(review)))
  }
  const ref = f.save(original)
  fs.appendFileSync(path.join(f.root, ref.path), " ")
  assert.throws(() => f.run(ref), /review changed/)
  assert.throws(
    () => reviewedEditionComposition(f.root, ref, { spec: f.spec, articles: f.articles }),
    /curated/,
  )
})
