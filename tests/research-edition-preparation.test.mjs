import test from "node:test"
import assert from "node:assert/strict"
import { sha256 } from "../scripts/research/contracts.mjs"
import { selectEditionApprovals } from "../scripts/research/edition-preparation.mjs"

function fixture() {
  const article = { event_id: "0123456789abcdef", source_urls: ["https://example.com/news/one"] }
  const approval = { run: "reviewed-one", article }
  const candidate = {
    key: "source-one",
    review_status: "verified",
    event_id: article.event_id,
    source_urls: article.source_urls,
    article_source_version_id: "source:bytes",
    article_parse_id: "parse",
    article_content_sha256: "content",
    approval: {
      approved_run: approval.run,
      article_sha256: sha256(JSON.stringify(article)),
      source_version_id: "source:bytes",
      parse_id: "parse",
      article_content_sha256: "content",
    },
  }
  const entry = {
    ...structuredClone(candidate),
    next_route: "approved-unpublished",
    publication: null,
    possible_publications: [],
    source_revision_alert: false,
  }
  return {
    handoff: {
      schema: "research-editorial-handoff/v1",
      publication_after: "2026-10-01T00:00:00Z",
      pending: [entry],
    },
    backlog: { schema: "research-candidates/v1", candidates: [candidate] },
    decision: {
      schema: "research-edition-preparation/v1",
      candidate_keys: [candidate.key],
      knowledge_runs: ["reviewed-signals"],
      edition_spec: {
        schema: "research-private-edition/v1",
        intent: "private_slice",
        coverage_start: "2026-10-01T00:00:00Z",
      },
    },
    approvals: new Map([[approval.run, approval]]),
  }
}

test("edition preparation selects exact approved candidates without changing or approving inputs", () => {
  const input = fixture(),
    before = structuredClone(input)
  const result = selectEditionApprovals(input)
  assert.equal(result.length, 1)
  assert.equal(result[0].approved_run, "reviewed-one")
  assert.equal(result[0].event_id, "0123456789abcdef")
  assert.deepEqual(input, before)
})

test("edition preparation rejects unreviewed, published, ambiguous and changed-source candidates", () => {
  for (const mutate of [
    (x) => {
      x.backlog.candidates[0].review_status = "unreviewed"
    },
    (x) => {
      x.handoff.pending[0].publication = { event_id: "existing" }
    },
    (x) => {
      x.handoff.pending[0].possible_publications = [{ event_id: "existing" }]
    },
    (x) => {
      x.handoff.pending[0].source_revision_alert = true
    },
    (x) => {
      x.handoff.pending[0].primary_candidate_key = "primary-event"
    },
    (x) => {
      x.handoff.pending[0].next_route = "historical-review"
    },
    (x) => {
      x.handoff.pending[0].next_route = "approved-historical"
    },
    (x) => {
      x.backlog.candidates[0].article_parse_id = "changed"
    },
    (x) => {
      x.backlog.candidates[0].approval.article_sha256 = "changed"
    },
    (x) => {
      x.handoff.pending.push(x.handoff.pending[0])
    },
    (x) => {
      x.approvals.get("reviewed-one").article.source_urls = ["https://example.com/changed"]
    },
  ]) {
    const input = fixture()
    mutate(input)
    assert.throws(() => selectEditionApprovals(input))
  }
})

test("edition preparation cannot repeat one event through multiple selected candidates", () => {
  const input = fixture()
  const other = { ...structuredClone(input.backlog.candidates[0]), key: "source-two" }
  input.backlog.candidates.push(other)
  input.handoff.pending.push({ ...structuredClone(input.handoff.pending[0]), key: other.key })
  input.decision.candidate_keys.push(other.key)
  assert.throws(() => selectEditionApprovals(input), /same approved event/)
})

test("edition preparation accepts a pinned reviewed alternate original and rejects an invented bypass", () => {
  const input = fixture(),
    candidate = input.backlog.candidates[0],
    entry = input.handoff.pending[0]
  delete candidate.article_source_version_id
  delete candidate.article_parse_id
  delete candidate.article_content_sha256
  entry.article_source_version_id = null
  entry.article_parse_id = null
  entry.article_content_sha256 = null
  candidate.approval.source_alternative_resolution_run = "alternate-review"
  candidate.approval.source_url = "https://example.com/official/one"
  input.approvals.get("reviewed-one").article.source_urls = [candidate.approval.source_url]
  candidate.approval.article_sha256 = sha256(
    JSON.stringify(input.approvals.get("reviewed-one").article),
  )
  entry.approval.article_sha256 = candidate.approval.article_sha256
  assert.throws(() => selectEditionApprovals(input), /pinned identity review/)
  const resolution = {
    schema: "research-candidate-source-alternative-resolution/v1",
    decision: "same_event",
    candidate_key: candidate.key,
    original_source: { url: candidate.source_urls[0] },
    alternative_source: {
      url: candidate.approval.source_url,
      source_version_id: "source:bytes",
      parse_id: "parse",
      content_sha256: "content",
    },
  }
  const hash = sha256(JSON.stringify(resolution))
  candidate.approval.source_alternative_resolution_sha256 = hash
  input.alternatives = new Map([["alternate-review", { value: resolution, sha256: hash }]])
  assert.equal(selectEditionApprovals(input)[0].source_version_id, "source:bytes")
  resolution.candidate_key = "another-event"
  assert.throws(() => selectEditionApprovals(input), /pinned identity review/)
})

test("edition preparation rejects duplicate selections, changed intervals and publication intent", () => {
  for (const mutate of [
    (x) => {
      x.decision.candidate_keys.push("source-one")
    },
    (x) => {
      x.decision.candidate_keys = []
    },
    (x) => {
      x.decision.knowledge_runs.push("reviewed-signals")
    },
    (x) => {
      x.decision.edition_spec.coverage_start = "2026-09-30T00:00:00Z"
    },
    (x) => {
      x.decision.edition_spec.intent = "publish"
    },
    (x) => {
      x.decision.public_approved = true
    },
  ]) {
    const input = fixture()
    mutate(input)
    assert.throws(() => selectEditionApprovals(input), /Explicit unique candidate selection/)
  }
})
