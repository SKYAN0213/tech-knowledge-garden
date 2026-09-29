import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  SourceFetcher,
  assertURL,
  isPublicIP,
  pinnedAddresses,
  retryDelay,
} from "../scripts/research/fetch.mjs"
import {
  sha256,
  assertTransition,
  assertSchema,
  assertParse,
  sourceId,
} from "../scripts/research/contracts.mjs"
import {
  acquireLock,
  atomicWrite,
  atomicCreate,
  assertAbsent,
  readJSON,
  safePath,
  RunState,
} from "../scripts/research/run-state.mjs"
import { validateEvidence, recordFactReview } from "../scripts/research/claims.mjs"
import { Ollama } from "../scripts/research/ollama.mjs"
import { candidatesFromLinks, coverageGrid, mergeBacklog } from "../scripts/research/discovery.mjs"
import { researchWindow } from "../scripts/research-window.mjs"

const temporary = (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-research-")))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}
const resolver = async () => [{ address: "1.1.1.1", family: 4 }]
test("atomic creation never replaces existing or racing files and removes only its temporary file", (t) => {
  const root = temporary(t),
    relative = "Knowledge/New.md"
  const created = atomicCreate(root, relative, "reviewed text")
  assert.equal(created.sha256, sha256("reviewed text"))
  assert.equal(fs.statSync(path.join(root, relative)).mode & 0o777, 0o600)
  assert.throws(() => atomicCreate(root, relative, "replacement"), /already exists/)
  assert.equal(fs.readFileSync(path.join(root, relative), "utf8"), "reviewed text")
  const link = fs.linkSync
  fs.linkSync = (from, destination) => {
    fs.writeFileSync(destination, "another writer", { flag: "wx" })
    return link(from, destination)
  }
  try {
    assert.throws(() => atomicCreate(root, "Knowledge/Race.md", "candidate"), { code: "EEXIST" })
  } finally {
    fs.linkSync = link
  }
  assert.equal(fs.readFileSync(path.join(root, "Knowledge/Race.md"), "utf8"), "another writer")
  assert.deepEqual(fs.readdirSync(path.join(root, "Knowledge")).sort(), ["New.md", "Race.md"])
})
test("absence checks reject dangling destination and parent links", (t) => {
  const root = temporary(t)
  fs.symlinkSync(path.join(root, "missing"), path.join(root, "dangling"))
  assert.throws(() => assertAbsent(root, "dangling"), /Symlink/)
  assert.throws(() => atomicCreate(root, "dangling/file.md", "text"), /Symlink/)
  assert.equal(fs.lstatSync(path.join(root, "dangling")).isSymbolicLink(), true)
  assert.equal(fs.existsSync(path.join(root, "missing")), false)
})
test("fetch blocks private, mixed DNS, encoded IPs and scoped addresses", async () => {
  for (const a of [
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "203.0.113.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "2001:db8::1",
    "2002:7f00:1::",
    "2001:4860::1%eth0",
  ])
    assert.equal(isPublicIP(a), false, a)
  for (const a of ["1.1.1.1", "8.8.8.8", "192.0.66.2", "2001:4860:4860::8888"])
    assert.equal(isPublicIP(a), true, a)
  assert.throws(() => assertURL("http://2130706433"), /Non-public/)
  assert.throws(() => assertURL("https://user:secret@example.com"), /public HTTP/)
  assert.throws(() => assertURL("https://example.com:8888"), /standard ports/)
  await assert.rejects(
    pinnedAddresses("example.com", async () => [{ address: "1.1.1.1" }, { address: "10.1.1.1" }]),
    /non-public/,
  )
  assert.deepEqual(
    await pinnedAddresses("github.blog", async () => [{ address: "192.0.66.2", family: 4 }]),
    [{ address: "192.0.66.2", family: 4 }],
  )
})
test("versioned fetch preserves legacy ID, body, 304 observation and source changes", async (t) => {
  const root = temporary(t),
    responses = [
      {
        status: 200,
        headers: { etag: "v1", "content-type": "text/html" },
        body: Buffer.from("first"),
      },
      { status: 304, headers: {}, body: Buffer.alloc(0) },
      {
        status: 200,
        headers: { etag: "v2", "content-type": "text/html" },
        body: Buffer.from("second"),
      },
    ],
    requests = []
  const fetcher = new SourceFetcher(root, {
    interval_ms: 0,
    resolve: resolver,
    transport: async (_u, _a, h) => {
      requests.push(h)
      return responses.shift()
    },
  })
  const url = "https://example.com/news/",
    first = await fetcher.fetch(url),
    same = await fetcher.fetch(url),
    changed = await fetcher.fetch(url)
  assert.equal(first.source_id, sha256(url).slice(0, 20))
  assert.equal(first.original_url, url)
  assert.equal(first.final_url, url)
  assert.equal(first.source_id, sourceId(first.original_url))
  assert.equal(same.source_version_id, first.source_version_id)
  assert.equal(same.fetch_status, "not_modified")
  assert.equal(requests[1]["if-none-match"], "v1")
  assert.notEqual(first.source_version_id, changed.source_version_id)
  assert.equal(fs.readFileSync(safePath(root, first.body_path), "utf8"), "first")
  assert.equal(
    readJSON(root, `documents/${first.source_id}/latest.json`).body_sha256,
    sha256("second"),
  )
})
test("fetch keeps path trailing slashes when the origin routes them differently", async (t) => {
  const requested = []
  const fetcher = new SourceFetcher(temporary(t), {
    resolve: resolver,
    interval_ms: 0,
    transport: async (url) => {
      requested.push(url.toString())
      return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("news") }
    },
  })
  const withSlash = "https://example.com/en/about/promotion/news/"
  const withoutSlash = "https://example.com/en/about/promotion/news"
  const first = await fetcher.fetch(withSlash)
  const second = await fetcher.fetch(withoutSlash)
  assert.deepEqual(requested, [withSlash, withoutSlash])
  assert.equal(first.final_url, withSlash)
  assert.equal(second.final_url, withoutSlash)
  assert.notEqual(first.source_id, second.source_id)
})
test("redirect SSRF and cache corruption never become successful captures", async (t) => {
  const root = temporary(t)
  let calls = 0
  const f = new SourceFetcher(root, {
    resolve: resolver,
    interval_ms: 0,
    transport: async () => {
      calls++
      return {
        status: 302,
        headers: { location: "http://169.254.169.254/" },
        body: Buffer.alloc(0),
      }
    },
  })
  const result = await f.fetch("https://example.com/a")
  assert.equal(result.fetch_status, "failed")
  assert.equal(calls, 1)
  atomicWrite(root, `documents/${sourceId("https://example.com/b")}/latest.json`, {
    body_path: "body.bin",
    body_sha256: sha256("original"),
  })
  atomicWrite(root, "body.bin", "corrupted")
  await assert.rejects(f.fetch("https://example.com/b"), /hash mismatch/)
})
test("304 without cache and bounded Retry-After are explicit", async (t) => {
  const f = new SourceFetcher(temporary(t), {
    resolve: resolver,
    interval_ms: 0,
    transport: async () => ({ status: 304, headers: {}, body: Buffer.alloc(0) }),
  })
  assert.equal((await f.fetch("https://example.com")).fetch_status, "failed")
  assert.equal(retryDelay("9999", 1), 60000)
  assert.equal(retryDelay("2", 1), 2000)
})
test("read-only form requests bind each POST body to its public source URL", async (t) => {
  const root = temporary(t),
    form = new URLSearchParams({ contextid: "public-id", offset: "0", count: "20" }),
    url = `https://example.com/api/news?${form}`,
    requests = []
  const fetcher = new SourceFetcher(root, {
    interval_ms: 0,
    resolve: resolver,
    transport: async (_url, _addresses, headers, _budget, request) => {
      requests.push({ headers, request })
      return {
        status: 200,
        headers: { "content-type": "application/json", etag: "page" },
        body: Buffer.from('{"items":[]}'),
      }
    },
  })
  const first = await fetcher.fetch(url, { method: "POST", form: form.toString() })
  const second = await fetcher.fetch(url, { method: "POST", form: form.toString() })
  assert.equal(first.fetch_status, "captured")
  assert.equal(first.source_id, sourceId(url))
  assert.equal(first.request_method, "POST")
  assert.equal(first.request_body_sha256, sha256(form.toString()))
  assert.equal(second.source_version_id, first.source_version_id)
  assert.equal(requests[0].request.method, "POST")
  assert.equal(requests[0].request.body, form.toString())
  assert.equal(requests[0].headers["content-length"], Buffer.byteLength(form.toString()))
  assert.equal(requests[1].headers["if-none-match"], undefined)
  await assert.rejects(
    fetcher.fetch(url, { method: "POST", form: "offset=1&count=20" }),
    /POST form fields must match source URL/,
  )
  await assert.rejects(
    fetcher.fetch(url, { method: "POST", form: form.toString(), source_id: "a".repeat(20) }),
    /POST source identity/,
  )
  await assert.rejects(fetcher.fetch(url, { method: "DELETE" }), /Unsupported fetch method/)
  let attempts = 0
  const failed = new SourceFetcher(root, {
    interval_ms: 0,
    attempts: 3,
    resolve: resolver,
    transport: async () => {
      attempts++
      return { status: 503, headers: {}, body: Buffer.alloc(0) }
    },
  })
  assert.equal(
    (await failed.fetch(url, { method: "POST", form: form.toString() })).fetch_status,
    "failed",
  )
  assert.equal(attempts, 1)
})
test("private paths reject traversal, symlinks and duplicate locks", (t) => {
  const root = temporary(t)
  assert.throws(() => safePath(root, "../public/news.json"), /escapes/)
  fs.symlinkSync(os.tmpdir(), path.join(root, "linked"))
  assert.throws(() => atomicWrite(root, "linked/exposed.txt", "bad"), /Symlink/)
  const release = acquireLock(root, "a")
  assert.throws(() => acquireLock(root, "a"), /EEXIST/)
  release()
  acquireLock(root, "a")()
})
test("completed stage resumes only matching input and intact checkpoint", async (t) => {
  const root = temporary(t),
    r = new RunState(root, "test-run", { urls: ["a"] })
  let calls = 0
  const result = await r.stage("fetch", { url: "a" }, async () => {
    calls++
    return { version: 1 }
  })
  assert.deepEqual(
    await new RunState(root, "test-run", { urls: ["a"] }).stage("fetch", { url: "a" }, async () => {
      calls++
      return { version: 2 }
    }),
    result,
  )
  assert.equal(calls, 1)
  assert.throws(() => new RunState(root, "test-run", { urls: ["b"] }), /input changed/)
  atomicWrite(root, "runs/test-run/fetch.json", { version: 9 })
  await assert.rejects(
    r.stage("fetch", { url: "a" }, async () => ({})),
    /checkpoint hash/,
  )
})
test("approval is separate from schema, collection and model agreement", () => {
  assert.throws(() => assertTransition("discovered", "approved"), /Invalid/)
  assert.doesNotThrow(() => assertTransition("fact_review", "editorial_review"))
  assert.throws(
    () =>
      assertSchema(
        { status: "verified", secret: "no" },
        {
          type: "object",
          additionalProperties: false,
          required: ["status"],
          properties: { status: { type: "string", enum: ["unreviewed"] } },
        },
      ),
    /Invalid enum/,
  )
})
const fixture = () => {
  const text = "Example Co plans to deliver 50 robots in 2027.",
    parse_id = "p1"
  const p = {
    schema_version: "source-parse/v1",
    source_id: "s1",
    source_version_id: "s1:v1",
    parse_id,
    status: "extracted",
    title: "Plan",
    dates: { published_at: "2026-09-27" },
    blocks: [{ block_id: "p1:b1", text, locator: { text_hash: sha256(text) } }],
    quality: { missing_pages: [] },
  }
  const c = {
    claim_id: "c1",
    statement: text,
    subject: "Example",
    claim_kind: "attributed_fact",
    event_state: "planned",
    published_at: "2026-09-27",
    effective_period: "2027",
    numbers: [{ literal: "50", unit: "robots", condition: "in 2027" }],
    evidence: [
      {
        source_id: "s1",
        source_version_id: "s1:v1",
        parse_id,
        block_id: "p1:b1",
        quote: text,
        support: "direct",
      },
    ],
  }
  return { p, c }
}
test("facts detect fake quotes, version mixing, numeric condition loss and plan promotion", () => {
  const { p, c } = fixture()
  assertParse(p)
  assert.equal(validateEvidence(c, [p]).structural_pass, true)
  assert.ok(
    validateEvidence({ ...c, event_state: "completed" }, [p]).problems.includes(
      "plan_promoted_to_completion",
    ),
  )
  assert.ok(
    validateEvidence({ ...c, evidence: [{ ...c.evidence[0], quote: "Fake claim" }] }, [
      p,
    ]).problems.includes("quote_not_in_block"),
  )
  assert.ok(
    validateEvidence({ ...c, numbers: [{ literal: "500", unit: "USD", condition: "profit" }] }, [
      p,
    ]).problems.includes("number_not_in_evidence"),
  )
  assert.ok(
    validateEvidence({ ...c, evidence: [{ ...c.evidence[0], source_version_id: "s1:v2" }] }, [
      p,
    ]).problems.includes("evidence_identity_mismatch"),
  )
})
test("unresolved math cannot become verified evidence while unrelated prose remains usable", () => {
  const { p, c } = fixture()
  const unresolved = p.blocks[0].text + " Equation: [수식 원문 확인 필요]."
  p.status = "partial"
  p.blocks[0].text = unresolved
  p.blocks[0].locator.text_hash = sha256(unresolved)
  p.quality.missing_math = [{ dom_path: "/article/p/math", reason: "unsupported-presentation" }]
  assert.equal(validateEvidence(c, [p]).structural_pass, true)
  const unresolvedClaim = { ...c, evidence: [{ ...c.evidence[0], quote: unresolved }] }
  const result = validateEvidence(unresolvedClaim, [p])
  assert.equal(result.structural_pass, false)
  assert.ok(result.problems.includes("unresolved_math_in_evidence"))
})
test("fact review requires actual reading and each critical dimension", () => {
  const { p, c } = fixture()
  c.review = validateEvidence(c, [p])
  const d = { claim_id: "c1", status: "verified", reason: "Checked source" }
  assert.throws(() => recordFactReview([c], [d], { reviewer: "reviewer" }), /requires source/)
  const reviewed = recordFactReview(
    [c],
    [
      {
        ...d,
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "reviewer" },
    [p],
  )
  assert.equal(reviewed[0].review.status, "verified")
})
test("Ollama rejects unsupported think types, cloud-only models and truncated output", async () => {
  const f = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith("/show")
        ? { capabilities: ["completion"], thinking: { values: [false, "medium"] } }
        : url.endsWith("/tags")
          ? { models: [{ name: "local", digest: "hash" }] }
          : url.endsWith("/version")
            ? { version: "v" }
            : { done: true, done_reason: "length", message: { content: "{}" } },
  })
  const o = new Ollama({ fetchImpl: f })
  await assert.rejects(
    o.structured({ model: "local", think: true, messages: [], schema: {} }),
    /Unsupported/,
  )
  await assert.rejects(
    o.structured({ model: "local", think: "medium", messages: [], schema: {} }),
    /Incomplete/,
  )
  await assert.rejects(o.metadata("remote:cloud"), /Local model/)
  assert.throws(() => new Ollama({ url: "https://other.example.com" }), /local endpoint/)
})
test("model artifacts preserve the exact request and content without storing model reasoning", async () => {
  const content = ' { "value" : 1 } ',
    messages = [{ role: "user", content: "Original source block" }],
    schema = { type: "object", required: ["value"], properties: { value: { type: "integer" } } }
  let submitted
  const adapter = new Ollama({
    fetchImpl: async (url, options) => {
      if (url.endsWith("/api/chat")) {
        submitted = JSON.parse(options.body)
        return Response.json({
          done: true,
          done_reason: "stop",
          message: { content, thinking: "Local internal reasoning" },
        })
      }
      return Response.json(
        url.endsWith("/show")
          ? { capabilities: ["completion"], thinking: { values: [false] } }
          : url.endsWith("/tags")
            ? { models: [{ name: "local", digest: "hash" }] }
            : { version: "test" },
      )
    },
  })
  const result = await adapter.structured({ model: "local", think: false, messages, schema })
  assert.deepEqual(result.artifacts.request, submitted)
  assert.equal(result.artifacts.request_sha256, sha256(JSON.stringify(submitted)))
  assert.equal(result.artifacts.response_content, content)
  assert.equal(result.artifacts.response_content_sha256, sha256(content))
  assert.deepEqual(result.output, { value: 1 })
  assert.equal(JSON.stringify(result.artifacts).includes("Local internal reasoning"), false)
})

test("local model budgets reject invalid settings before metadata and record bounded call time", async () => {
  const calls = []
  const adapter = new Ollama({
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return Response.json(
        url.endsWith("/show")
          ? { capabilities: ["completion"], thinking: { values: [false] } }
          : url.endsWith("/tags")
            ? { models: [{ name: "local", digest: "hash" }] }
            : url.endsWith("/version")
              ? { version: "test" }
              : { done: true, done_reason: "stop", message: { content: '{"value":1}' } },
      )
    },
  })
  for (const invalid of [
    { num_ctx: 0 },
    { num_predict: 0 },
    { timeout_ms: 0 },
    { temperature: NaN },
  ])
    await assert.rejects(
      adapter.structured({ model: "local", think: false, messages: [], schema: {}, ...invalid }),
      /budget/,
    )
  assert.equal(calls.length, 0)
  assert.throws(() => new Ollama({ timeout_ms: 0 }), /timeout/)
  const result = await adapter.structured({
    model: "local",
    think: false,
    messages: [],
    schema: { type: "object" },
    timeout_ms: 1000,
    num_ctx: 8192,
    num_predict: 512,
  })
  assert.equal(result.provenance.call_timeout_ms, 1000)
  assert.ok(result.provenance.metadata_wall_ms >= 0)
  assert.ok(calls.every((c) => c.options.signal instanceof AbortSignal))
  assert.equal(result.artifacts.request.options.num_predict, 512)
  assert.equal(Object.hasOwn(result.artifacts.request, "timeout_ms"), false)
})

test("discovery backlog retains reviewed IDs and never expires older pending candidates", async (t) => {
  const root = temporary(t),
    file = path.join(root, "candidate-backlog.json")
  atomicWrite(root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [
      {
        key: "old",
        title: "Reviewed",
        event_id: "123",
        review_status: "verified",
        source_urls: ["https://example.com/news/1"],
        discovered_at: "2020-01-01",
      },
    ],
  })
  const candidates = candidatesFromLinks(
    [
      { url: "https://example.com/news/1?utm_source=a", text: "Changed title" },
      { url: "https://example.com/news/2", text: "New release" },
    ],
    {
      channel_id: "test",
      url: "https://example.com",
      sectors: ["AI"],
      region: "국내",
      axis: "기술·제품",
    },
    new Date().toISOString(),
  )
  await mergeBacklog(file, candidates)
  const firstBytes = fs.readFileSync(file)
  await mergeBacklog(file, candidates)
  assert.deepEqual(fs.readFileSync(file), firstBytes)
  const b = readJSON(root, "candidate-backlog.json")
  assert.equal(b.candidates.length, 2)
  assert.equal(b.candidates[0].title, "Reviewed")
  assert.equal(b.candidates[0].event_id, "123")
  assert.equal(coverageGrid([]).length, 32)
  assert.equal(
    coverageGrid([]).every((c) => c.status === "not_attempted"),
    true,
  )
})

test("a changed article body reopens a rejected candidate while listing-only changes do not", async (t) => {
  const root = temporary(t)
  const file = path.join(root, "candidate-backlog.json")
  const url = "https://example.com/news/feature"
  const id = sourceId(url)
  const oldVersion = `${id}:${sha256("original article")}`
  const wrapperVersion = `${id}:${sha256("same article, changed wrapper")}`
  const newVersion = `${id}:${sha256("revised article")}`
  const originalContent = sha256("original title, date and blocks")
  const revisedContent = sha256("changed title, date or blocks")
  const discovered = {
    key: `source-${id}`,
    title: "Background feature",
    source_urls: [url],
    source_published_at: "2026-09-02",
    discovered_at: "2026-09-28T00:00:00Z",
    review_status: "unreviewed",
    priority: "normal",
    article_source_version_id: oldVersion,
    article_content_sha256: originalContent,
    discovery: [{ channel_id: "news", source_version_id: "listing:v1" }],
  }
  const decision = {
    decision: "background_only_no_news_event",
    source_version_id: oldVersion,
    article_content_sha256: originalContent,
    review_sha256: sha256("direct review"),
  }
  atomicWrite(root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [
      { ...discovered, review_status: "rejected", reason: "No new event", disposition: decision },
    ],
  })
  await mergeBacklog(file, [
    { ...discovered, discovery: [{ channel_id: "news", source_version_id: "listing:v2" }] },
  ])
  let backlog = readJSON(root, "candidate-backlog.json")
  assert.equal(backlog.candidates[0].review_status, "rejected")
  assert.equal(backlog.candidates[0].disposition.review_sha256, decision.review_sha256)

  const wrapperOnly = {
    ...discovered,
    article_source_version_id: wrapperVersion,
    discovered_at: "2026-09-28T12:00:00Z",
    discovery: [{ channel_id: "news", source_version_id: "listing:v2b" }],
  }
  await mergeBacklog(file, [wrapperOnly])
  backlog = readJSON(root, "candidate-backlog.json")
  assert.equal(backlog.candidates[0].review_status, "rejected")
  assert.equal(backlog.candidates[0].article_source_version_id, wrapperVersion)
  assert.equal(backlog.candidates[0].disposition.review_sha256, decision.review_sha256)

  const revised = {
    ...discovered,
    article_source_version_id: newVersion,
    article_content_sha256: revisedContent,
    discovered_at: "2026-09-29T00:00:00Z",
    discovery: [{ channel_id: "news", source_version_id: "listing:v3" }],
  }
  await mergeBacklog(file, [revised])
  backlog = readJSON(root, "candidate-backlog.json")
  const candidate = backlog.candidates[0]
  assert.equal(candidate.review_status, "deferred")
  assert.match(candidate.reason, /기사 내용 변경/)
  assert.equal(candidate.source_revision_alert.change_basis, "content")
  assert.equal(candidate.article_source_version_id, newVersion)
  assert.equal(candidate.disposition, undefined)
  assert.equal(candidate.disposition_history[0].review_sha256, decision.review_sha256)
  assert.equal(candidate.source_revision_alert.previous_source_version_id, wrapperVersion)
  assert.equal(candidate.source_revision_alert.current_source_version_id, newVersion)
  assert.equal(candidate.source_revision_alert.previous_content_sha256, originalContent)
  assert.equal(candidate.source_revision_alert.current_content_sha256, revisedContent)
  const window = researchWindow("2026-09-27T00:00:00Z", "2026-09-29T01:00:00Z", backlog, [])
  assert.equal(window.pending[0].key, discovered.key)
  assert.equal(window.pending[0].next_route, "historical-review")
  const before = fs.readFileSync(file)
  await mergeBacklog(file, [revised])
  assert.deepEqual(fs.readFileSync(file), before)
  await mergeBacklog(file, [discovered])
  assert.equal(
    readJSON(root, "candidate-backlog.json").candidates[0].article_source_version_id,
    newVersion,
  )
  assert.equal(readJSON(root, "candidate-backlog.json").candidates[0].review_status, "deferred")
  const conflicting = {
    ...revised,
    article_source_version_id: `${id}:${sha256("other bytes")}`,
    article_content_sha256: sha256("other editorial content"),
  }
  const unchanged = fs.readFileSync(file)
  await assert.rejects(mergeBacklog(file, [conflicting]), /same observation time/)
  assert.deepEqual(fs.readFileSync(file), unchanged)
})

test("a legacy rejection without a content fingerprint reopens when its parse changes", async (t) => {
  const root = temporary(t)
  const file = path.join(root, "candidate-backlog.json")
  const url = "https://example.com/news/legacy"
  const id = sourceId(url)
  const version = `${id}:${sha256("unchanged raw article")}`
  const key = `source-${id}`
  atomicWrite(root, "candidate-backlog.json", {
    schema: "research-candidates/v1",
    candidates: [
      {
        key,
        source_urls: [url],
        discovered_at: "2026-09-28T00:00:00Z",
        review_status: "rejected",
        reason: "Earlier reading found no event",
        article_source_version_id: version,
        article_parse_id: "old-parse",
        article_observed_at: "2026-09-28T00:00:00Z",
        disposition: {
          source_version_id: version,
          parse_id: "old-parse",
          review_sha256: sha256("review"),
        },
      },
    ],
  })
  await mergeBacklog(file, [
    {
      key,
      source_urls: [url],
      discovered_at: "2026-09-29T00:00:00Z",
      review_status: "unreviewed",
      article_source_version_id: version,
      article_parse_id: "new-parse",
      article_observed_at: "2026-09-29T00:00:00Z",
      article_content_sha256: sha256("now complete extracted content"),
    },
  ])
  const candidate = readJSON(root, "candidate-backlog.json").candidates[0]
  assert.equal(candidate.review_status, "deferred")
  assert.equal(candidate.disposition_history[0].parse_id, "old-parse")
  assert.equal(candidate.source_revision_alert.previous_source_version_id, version)
  assert.equal(candidate.source_revision_alert.current_source_version_id, version)
  assert.equal(candidate.source_revision_alert.change_basis, "parse_version")
})
