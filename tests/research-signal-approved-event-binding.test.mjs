import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { canonicalURL, noteText, parseNote } from "../scripts/garden.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import {
  evaluateNoteReview,
  loadNoteApproval,
  loadHistoricalNoteApproval,
} from "../scripts/research/note-review.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"

// A final article's reviewed event identity differs from its source URL hash.
// The source timestamp also deliberately crosses a Korean calendar boundary.
function fixture(
  t,
  {
    approved = true,
    claimEventId = null,
    urlIdentity = false,
    dayOnly = false,
    publicationTimeBasis = false,
  } = {},
) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "signal-approved-event-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vault = path.join(root, "vault")
  fs.mkdirSync(vault)
  const published = dayOnly ? "2026-09-22" : "2026-09-22T15:30:00-07:00",
    articleDay = publicationTimeBasis ? "2026-09-23" : "2026-09-22",
    reviewed = "2026-09-24",
    url = "https://fixture.example/events",
    body = "Acme launched Alpha on 2026-09-20. Acme launched Beta on 2026-09-19."

  function source(run, eventId, { item = 0, originalURL = url, approve = approved } = {}) {
    const sid = sourceId(originalURL),
      version = `${sid}:${sha256(body)}`,
      pid = sha256(run),
      doc = {
        source_id: sid,
        source_version_id: version,
        original_url: originalURL,
        body_sha256: sha256(body),
        body_path: `documents/${run}.txt`,
        fetch_status: "captured",
        observed_at: "2026-09-23T00:00:00Z",
      },
      parse = {
        schema_version: "source-parse/v1",
        source_id: sid,
        source_version_id: version,
        parse_id: pid,
        title: "Acme announcements",
        status: "extracted",
        dates: {
          published_at: published,
          observed_at: doc.observed_at,
          ...(publicationTimeBasis
            ? {
                precision: "timestamp",
                profile_status: "matched",
                basis: { type: "json-ld", dom_path: "/head/script", text: published },
              }
            : {}),
        },
        quality: { missing_pages: [] },
        blocks: [{ block_id: `${pid}:b1`, text: body, locator: { text_hash: sha256(body) } }],
      }
    const facts = ["2026-09-20", "2026-09-19"].map((day, n) => ({
      claim_id: `${run}-fact-${n}`,
      statement: n ? "Acme launched Beta on 2026-09-19." : "Acme launched Alpha on 2026-09-20.",
      claim_kind: "attributed_fact",
      subject: "Acme",
      event_id: run === "alpha" ? claimEventId : null,
      event_state: "completed",
      published_at: published,
      effective_period: day,
      numbers: [],
      evidence: [
        {
          source_id: sid,
          source_version_id: version,
          parse_id: pid,
          block_id: parse.blocks[0].block_id,
          quote: n ? "Acme launched Beta on 2026-09-19." : "Acme launched Alpha on 2026-09-20.",
          support: "direct",
        },
      ],
    }))
    const claims = recordFactReview(
      facts,
      facts.map((fact) => ({
        claim_id: fact.claim_id,
        status: "verified",
        reason: "Synthetic exact source review",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      })),
      { reviewer: "Synthetic reviewer", reviewed_at: reviewed },
      [parse],
    )
    const claim = claims[item],
      draft = {
        title: `Acme, ${item ? "Beta" : "Alpha"} 공개`,
        lead: [
          {
            text: "Acme는 2026년 9월 22일 제품 공개 소식을 발표했다.",
            claim_ids: [claim.claim_id],
          },
          { text: "원문에는 해당 제품을 공개한 날짜가 기록돼 있다.", claim_ids: [claim.claim_id] },
        ],
        facts: {
          who: "Acme",
          when: articleDay,
          where: null,
          what: "제품 공개",
          how: null,
          why: null,
        },
        sector: "AI",
        theme: "제품·서비스",
        tags: ["신제품"],
        entities: ["Acme"],
        explanations: [],
      },
      record = {
        draft_id: draftFingerprint(draft),
        draft,
        status: "editorial_review",
        problems: [],
        public_approved: false,
      },
      review = {
        status: "approved",
        draft_id: record.draft_id,
        reviewer: "Synthetic reviewer",
        source_read: true,
        final_prose_read: true,
        title_checked: true,
        dates_checked: true,
        numbers_checked: true,
        analysis_checked: true,
        event_id: eventId,
        published_at: articleDay,
        reviewed_at: reviewed,
        region: "해외",
        concept_ids: [],
        ...(publicationTimeBasis
          ? {
              event_date_basis: {
                kind: "source-publication-time",
                source_id: sid,
                source_version_id: version,
                parse_id: pid,
                claim_id: claim.claim_id,
                source_published_at: published,
                timezone: "Asia/Seoul",
              },
            }
          : {}),
      }
    atomicWrite(root, doc.body_path, body)
    atomicWrite(root, `parses/${pid}/parse.json`, parse)
    for (const [name, value] of [
      ["documents.json", [doc]],
      ["parses.json", [parse]],
      ["reviewed-claims.json", { claims }],
      ...(approve
        ? [
            ["draft.json", record],
            ["editorial-review.json", review],
            ["approved-article.json", approvedArticle(record, claims, [doc], review, [parse])],
          ]
        : []),
    ])
      atomicWrite(root, `runs/${run}/${name}`, value)
    return { run, eventId, claim, claims, doc, parse, articleDay, published, originalURL }
  }
  const first = source(
      "alpha",
      urlIdentity ? sha256(canonicalURL(url)).slice(0, 16) : "a".repeat(16),
    ),
    second = source("beta", "b".repeat(16), { item: 1 }),
    other = source("other", "c".repeat(16), { originalURL: "https://fixture.example/other" })
  function decision({
    event = first.eventId,
    date = articleDay,
    occurred,
    evidence = [first],
    claimIds,
  } = {}) {
    const edition = "Editions/2026/09/2026-09-24_0800_Tech_AI_Briefing",
      observation = {
        id: "alpha-change",
        topic_id: "product-launches",
        event_id: event,
        event_date: date,
        stance: "context",
        change: "Acme가 제품을 공개했다.",
        meaning: "제품 공개 이력이다.",
        limit: "합성 회귀 자료에 한정한다.",
        next_check: "후속 발표를 확인한다.",
        ...(occurred ? { occurred_at: occurred, source_published_at: date } : {}),
      }
    return {
      schema: "knowledge-note-review/v2",
      reviewer: "Synthetic reviewer",
      reason: "Exact event binding regression",
      reviewed_at: reviewed,
      source_read: true,
      final_prose_read: true,
      aliases_checked: true,
      connections_checked: true,
      histories_checked: true,
      notes: [
        {
          operation: "create",
          path: "Signals/2026-09-24_0800_Tech_AI_Briefing.md",
          previous_sha256: null,
          content: noteText(
            {
              schema_version: "tech-signals/v1",
              type: "trend-observations",
              edition,
              date: "2026-09-24",
              reviewed,
              review_basis: "primary-research",
              observations: [observation],
            },
            `[[${edition}|합성 회귀 자료]]`,
          ),
          evidence: evidence.map((s) => ({
            run_id: s.run,
            claim_ids: claimIds || [s.claim.claim_id],
          })),
        },
      ],
    }
  }
  const evaluate = (input = decision()) => evaluateNoteReview(root, input, { vault })
  return { root, vault, first, second, other, decision, evaluate }
}

test("Signals create reuses the current approved event ID and article publication day", (t) => {
  const f = fixture(t)
  assert.notEqual(f.first.eventId, sha256(canonicalURL(f.first.originalURL)).slice(0, 16))
  const result = f.evaluate()
  const observation = parseNote(result.notes[0].content).meta.observations[0]
  assert.equal(observation.event_id, f.first.eventId)
  assert.equal(observation.event_date, f.first.articleDay)
  assert.equal(result.candidate_published, false)
  assert.equal(fs.existsSync(path.join(f.vault, result.notes[0].path)), false)
})

test("Signals reuse an explicitly approved KST publication day without changing source precision", (t) => {
  const f = fixture(t, { publicationTimeBasis: true }),
    originalClaims = fs.readFileSync(path.join(f.root, "runs/alpha/reviewed-claims.json")),
    result = f.evaluate(),
    observation = parseNote(result.notes[0].content).meta.observations[0]
  assert.equal(observation.event_date, "2026-09-23")
  assert.equal(observation.event_id, f.first.eventId)
  assert.ok(result.source_files[0].files["approved-article.json"])
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "runs/alpha/reviewed-claims.json")),
    originalClaims,
  )
  for (const input of [
    f.decision({ date: "2026-09-22" }),
    f.decision({ date: f.first.published }),
    f.decision({ claimIds: [f.first.claims[1].claim_id] }),
    f.decision({ evidence: [f.second] }),
    f.decision({ evidence: [f.other] }),
  ])
    assert.throws(() => f.evaluate(input), /reviewed source event/)
  const unconverted = fixture(t)
  assert.throws(
    () => unconverted.evaluate(unconverted.decision({ date: "2026-09-23" })),
    /reviewed source event/,
  )
})

test("approved event occurred_at uses its own cited claim without changing source timestamp", (t) => {
  const f = fixture(t)
  const result = f.evaluate(f.decision({ occurred: "2026-09-20" }))
  const observation = parseNote(result.notes[0].content).meta.observations[0]
  assert.equal(observation.occurred_at, "2026-09-20")
  assert.equal(observation.event_date, "2026-09-22")
  assert.equal(
    readJSON(f.root, "runs/alpha/reviewed-claims.json").claims[0].published_at,
    f.first.published,
  )
  assert.throws(
    () => f.evaluate(f.decision({ occurred: "2026-09-19", evidence: [f.first, f.second] })),
    /same event|reviewed source event/,
  )
})

test("an approved event rejects unused claims, another event on the same source, another source and wrong dates", (t) => {
  const f = fixture(t)
  for (const input of [
    f.decision({ claimIds: [f.first.claims[1].claim_id] }),
    f.decision({ evidence: [f.second] }),
    f.decision({ evidence: [f.other] }),
    f.decision({ date: f.first.published }),
    f.decision({ date: "2026-09-23" }),
  ])
    assert.throws(() => f.evaluate(input), /reviewed source event/)
  const differentClaimEvent = fixture(t, { claimEventId: "b".repeat(16) })
  assert.throws(() => differentClaimEvent.evaluate(), /reviewed source event/)
})

test("an approved URL identity cannot borrow another event's claim or occurred_at on that page", (t) => {
  const f = fixture(t, { urlIdentity: true, dayOnly: true })
  assert.equal(
    parseNote(f.evaluate(f.decision({ occurred: "2026-09-20" })).notes[0].content).meta
      .observations[0].event_id,
    f.first.eventId,
  )
  assert.throws(() => f.evaluate(f.decision({ evidence: [f.second] })), /reviewed source event/)
  assert.throws(
    () => f.evaluate(f.decision({ claimIds: [f.first.claims[1].claim_id] })),
    /reviewed source event/,
  )
  assert.throws(
    () => f.evaluate(f.decision({ occurred: "2026-09-19", evidence: [f.first, f.second] })),
    /same event/,
  )
})

test("a preserved Signal approval pins the exact final article approval files", (t) => {
  for (const options of [{}, { urlIdentity: true, dayOnly: true }]) {
    const f = fixture(t, options),
      decision = f.decision(),
      approved = f.evaluate(decision),
      loaders = [loadNoteApproval, loadHistoricalNoteApproval]
    assert.ok(approved.source_files[0].files["approved-article.json"])
    assert.ok(approved.source_files[0].files["draft.json"])
    atomicWrite(f.root, "runs/signal-review/note-review.json", decision)
    atomicWrite(f.root, "runs/signal-review/approved-notes.json", approved)
    for (const loader of loaders)
      assert.equal(loader(f.root, "signal-review", { vault: f.vault }).approval.notes.length, 1)

    for (const file of ["approved-article.json", "draft.json", "editorial-review.json"]) {
      const relative = `runs/alpha/${file}`,
        original = fs.readFileSync(path.join(f.root, relative)),
        value = JSON.parse(original)
      if (file === "draft.json") value.draft.title += " altered"
      else if (file === "editorial-review.json") value.reviewer += " altered"
      else value.title += " altered"
      atomicWrite(f.root, relative, value)
      for (const loader of loaders)
        assert.throws(() => loader(f.root, "signal-review", { vault: f.vault }), undefined, file)
      fs.writeFileSync(path.join(f.root, relative), original)
    }

    // Even a newly self-consistent current article cannot replace the exact
    // approval that authorized this preserved note's event binding.
    const record = readJSON(f.root, "runs/alpha/draft.json"),
      review = readJSON(f.root, "runs/alpha/editorial-review.json")
    record.draft.title += " revised"
    record.draft_id = draftFingerprint(record.draft)
    review.draft_id = record.draft_id
    atomicWrite(f.root, "runs/alpha/draft.json", record)
    atomicWrite(f.root, "runs/alpha/editorial-review.json", review)
    atomicWrite(
      f.root,
      "runs/alpha/approved-article.json",
      approvedArticle(record, f.first.claims, [f.first.doc], review, [f.first.parse]),
    )
    for (const loader of loaders)
      assert.throws(
        () => loader(f.root, "signal-review", { vault: f.vault }),
        /Saved (?:applied )?knowledge approval differs/,
      )
  }
})

test("a missing, partial or changed article approval cannot authorize its event ID", (t) => {
  for (const change of ["missing", "partial", "article", "review", "draft", "source-version"]) {
    const f = fixture(t, { approved: change !== "missing" && change !== "partial" })
    if (change === "partial")
      atomicWrite(f.root, "runs/alpha/approved-article.json", { event_id: f.first.eventId })
    if (["article", "review", "draft"].includes(change)) {
      const file =
          change === "article"
            ? "approved-article.json"
            : change === "review"
              ? "editorial-review.json"
              : "draft.json",
        value = readJSON(f.root, `runs/alpha/${file}`)
      if (change === "draft") value.draft.title += " altered"
      else if (change === "review") value.event_id = "d".repeat(16)
      else value.title += " altered"
      atomicWrite(f.root, `runs/alpha/${file}`, value)
    }
    if (change === "source-version") {
      const documents = readJSON(f.root, "runs/alpha/documents.json")
      documents[0].source_version_id += "altered"
      atomicWrite(f.root, "runs/alpha/documents.json", documents)
    }
    assert.throws(() => f.evaluate(), undefined, change)
  }
})

test("source-only Signals retain the URL-hash identity and exact source timestamp", (t) => {
  const f = fixture(t, { approved: false }),
    event = sha256(canonicalURL(f.first.originalURL)).slice(0, 16),
    input = f.decision({ event, date: f.first.published, occurred: "2026-09-20" })
  assert.equal(parseNote(f.evaluate(input).notes[0].content).meta.observations[0].event_id, event)
  assert.deepEqual(Object.keys(f.evaluate(input).source_files[0].files), [
    "documents.json",
    "parses.json",
    "reviewed-claims.json",
  ])
  assert.throws(() => f.evaluate(f.decision({ event: f.first.eventId })), /reviewed source event/)
  assert.equal(fs.existsSync(path.join(f.root, "runs/alpha/approved-article.json")), false)
})

test("fresh Node imports resolve the note-review and preview cycle in either order", () => {
  const modules = ["../scripts/research/note-review.mjs", "../scripts/research/preview.mjs"].map(
    (file) => new URL(file, import.meta.url).href,
  )
  for (const order of [modules, [...modules].reverse()]) {
    const code = `for (const url of ${JSON.stringify(order)}) await import(url);`
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8",
    })
    assert.equal(result.status, 0, result.stderr)
  }
})
