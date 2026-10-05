import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseDocument } from "../scripts/research/parser.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

const oldPython = process.env.RESEARCH_PYTHON
before(() => {
  process.env.RESEARCH_PYTHON =
    oldPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
})
after(() => {
  if (oldPython === undefined) delete process.env.RESEARCH_PYTHON
  else process.env.RESEARCH_PYTHON = oldPython
})

const url = "https://publisher.test/articles/alpha"
const profile = () => ({
  language: "en",
  format: "json-document",
  json_document: {
    title_pointer: "/title",
    identities: [
      { pointer: "/id", url_pattern: "https://publisher\\.test/articles/(?P<value>[^?#]+)" },
    ],
    published_at_pointer: "/published",
    fields: [{ pointer: "/body", format: "markdown" }],
  },
})
const article = () => ({
  id: "alpha",
  title: "API announcement",
  published: "2026-07-13T10:49:55Z",
  body: "A verified announcement.",
})

test("GitHub pull request profile preserves proposal publication, merge state and body without UI text", async (t) => {
  const settings = JSON.parse(fs.readFileSync("data/research-acquisition.json", "utf8"))
  const options = settings.article_profiles.find(
    (p) => p.id === "github-pull-request-json-v1",
  ).options
  const address = "https://api.github.com/repos/openai/codex/pulls/32672"
  const value = {
    number: 32672,
    html_url: "https://github.com/openai/codex/pull/32672",
    title: "Revert auto review prompting",
    created_at: "2026-07-13T02:00:00Z",
    updated_at: "2026-07-13T03:13:56Z",
    merged: true,
    merged_at: "2026-07-13T03:13:56Z",
    merge_commit_sha: "32649bc5e6591ad8ea0b7b8ce073df447565ec7c",
    body: "## Summary\n\nRestore policy, request layout and tool specifications.\n\n## Validation\n\n58 passed.",
  }
  const result = await parse(t, value, options, "application/json", address)
  assert.equal(result.status, "extracted")
  assert.equal(result.dates.published_at, value.created_at)
  assert.equal(result.dates.modified_at, value.updated_at)
  assert(
    result.blocks.some(
      (b) => b.locator.json_pointer === "/merged_at" && b.text === value.merged_at,
    ),
  )
  assert(result.blocks.some((b) => b.locator.json_pointer === "/body" && b.text === "58 passed."))
  const open = await parse(
    t,
    { ...value, merged: false, merged_at: null, merge_commit_sha: null },
    options,
    "application/json",
    address,
  )
  assert.equal(open.status, "extracted")
  assert(open.blocks.some((b) => b.locator.json_pointer === "/merged" && b.text === "false"))
  await assert.rejects(
    parse(t, { ...value, number: 32673 }, options, "application/json", address),
    /identity mismatch/,
  )
})
async function parse(t, value, options = profile(), mime = "application/json", address = url) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "garden-json-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const data = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))
  fs.writeFileSync(path.join(root, "body.bin"), data)
  return parseDocument(
    root,
    {
      fetch_status: "captured",
      original_url: address,
      final_url: address,
      source_id: sourceId(address),
      source_version_id: `${sourceId(address)}:${sha256(data)}`,
      body_sha256: sha256(data),
      body_path: "body.bin",
      mime_type: mime,
      observed_at: "2026-10-05T10:13:10.797Z",
    },
    options,
  )
}

test("configured JSON retains source pointers, Markdown structure, source date precision and inert content", async (t) => {
  const value = article()
  value.body =
    "## Method\n\nA **verified** [source](https://publisher.test/source).\n\n| Item | Result |\n| --- | --- |\n| A | 3 |\n\n```sh\nDO_NOT_EXECUTE\n```\n"
  const result = await parse(t, value)
  assert.equal(result.status, "extracted")
  assert.equal(result.title_basis.json_pointer, "/title")
  assert.equal(result.dates.published_at, value.published)
  assert.equal(result.dates.precision, "timestamp")
  assert.equal(result.dates.basis.json_pointer, "/published")
  assert.equal(result.dates.observed_at, "2026-10-05T10:13:10.797Z")
  assert.equal(result.quality.reviewed, false)
  assert.deepEqual(result.quality.json_issues, [])
  assert.equal(result.blocks.find((b) => b.kind === "table").rows[1][1], "3")
  assert.equal(result.blocks.find((b) => b.kind === "code").text, "DO_NOT_EXECUTE")
  assert.equal(result.links[0].url, "https://publisher.test/source")
  for (const block of result.blocks) {
    assert.equal(block.locator.json_pointer, "/body")
    assert.equal(block.locator.field_sha256, sha256(value.body))
    assert.equal(block.locator.fragment.type, "markdown")
    assert.equal(block.locator.text_hash, sha256(block.text))
    assert.ok(block.block_id.startsWith(result.parse_id + ":"))
  }
})

test("RFC 6901 pointers preserve escaped names, array entries and typed scalar evidence", async (t) => {
  const value = article(),
    options = profile()
  value["a/b"] = { "~key": ["로봇 원문", true, 22] }
  options.json_document.fields = [
    { pointer: "/a~1b/~0key/0" },
    { pointer: "/a~1b/~0key/1", format: "scalar" },
    { pointer: "/a~1b/~0key/2", format: "scalar" },
  ]
  const result = await parse(t, value, options, "application/vnd.publisher+json")
  assert.deepEqual(
    result.blocks.map((b) => b.text),
    ["로봇 원문", "true", "22"],
  )
  assert.equal(result.blocks[0].locator.json_pointer, "/a~1b/~0key/0")
  for (const pointer of ["body", "/a~2b", "/a~1b/~0key/01"]) {
    const bad = profile()
    bad.json_document.fields = [{ pointer }]
    if (pointer.endsWith("/01")) {
      const partial = await parse(t, value, bad)
      assert.equal(partial.status, "partial")
    } else await assert.rejects(parse(t, value, bad), /JSON pointer/)
  }
})

test("record identity, complete counts and commit dates remain separate from document publication", async (t) => {
  const value = {
    id: "alpha",
    title: "Version comparison",
    status: "diverged",
    total: 2,
    commits: [
      { sha: "a", date: "2026-07-11T01:15:48Z", message: "Fix one." },
      { sha: "b", date: "2026-07-13T09:52:27Z", message: "Fix two." },
    ],
  }
  const options = profile()
  delete options.json_document.published_at_pointer
  options.json_document.fields = [{ pointer: "/status" }]
  options.json_document.records = {
    pointer: "/commits",
    id_pointer: "/sha",
    date_pointer: "/date",
    count_pointer: "/total",
    fields: [{ pointer: "/message", format: "markdown" }],
  }
  const result = await parse(t, value, options)
  assert.equal(result.status, "extracted")
  assert.equal(result.dates.published_at, null)
  assert.equal(result.dates.profile_status, "not-configured")
  assert.equal(result.quality.record_count, 2)
  assert.deepEqual(
    result.blocks.slice(1).map((b) => b.locator.record.id),
    ["a", "b"],
  )
  assert.equal(result.blocks[2].locator.record.date, value.commits[1].date)
  assert.equal(result.blocks[2].locator.record.date_pointer, "/commits/1/date")
  assert.equal(result.blocks[2].locator.json_pointer, "/commits/1/message")
  for (const mutate of [
    (v) => v.total++,
    (v) => (v.total = true),
    (v) => (v.commits[1].sha = "a"),
    (v) => delete v.commits[1].sha,
  ]) {
    const bad = structuredClone(value)
    mutate(bad)
    await assert.rejects(parse(t, bad, options), /collection|identity/)
  }
  const missing = structuredClone(value)
  delete missing.commits[1].date
  const partial = await parse(t, missing, options)
  assert.equal(partial.status, "partial")
  assert.equal(partial.quality.required_fields_present, false)
  assert.equal(partial.quality.json_issues[0].pointer, "/commits/1/date")
})

test("duplicate keys, non-finite values, source identity mismatch and field type changes cannot pass", async (t) => {
  for (const [raw, pattern] of [
    ['{"id":"alpha","id":"other"}', /Duplicate JSON key/],
    ['{"id":"alpha","extra":NaN}', /Non-finite/],
    ['{"id":"alpha","extra":1e9999}', /Non-finite/],
    ['{"id":"alpha"', /Expecting/],
  ])
    await assert.rejects(parse(t, Buffer.from(raw)), pattern)
  for (const [mutate, pattern] of [
    [(v) => (v.id = "another"), /identity mismatch/],
    [(v) => (v.body = { text: "hidden" }), /value type/],
    [(v) => (v.title = ["ambiguous"]), /title must/],
  ]) {
    const value = article()
    mutate(value)
    await assert.rejects(parse(t, value), pattern)
  }
  await assert.rejects(parse(t, article(), profile(), "text/html"), /JSON response/)
  const duplicate = profile()
  duplicate.json_document.fields.push({ pointer: "/body" })
  await assert.rejects(parse(t, article(), duplicate), /Duplicate JSON field/)
  const mismatch = profile()
  mismatch.json_document.identities.push({
    pointer: "/html_url",
    url_pattern: "https://publisher\\.test/articles/(?P<value>[^?#]+)",
    expected: "https://publisher.test/articles/{value}",
  })
  await assert.rejects(
    parse(t, { ...article(), html_url: "https://another.test/articles/alpha" }, mismatch),
    /identity mismatch/,
  )
})

test("declared missing fields and ambiguous source dates are partial without invented timezones", async (t) => {
  for (const mutate of [
    (v) => delete v.title,
    (v) => delete v.body,
    (v) => delete v.published,
    (v) => (v.published = "2026-07-13T10:49:55"),
  ]) {
    const value = article()
    mutate(value)
    const result = await parse(t, value)
    assert.equal(result.status, "partial")
    assert.equal(result.quality.required_fields_present, false)
    assert.ok(result.quality.json_issues.length)
  }
  const value = article()
  value.published = "2026-07-13"
  assert.equal((await parse(t, value)).dates.precision, "day")
  const optional = profile()
  optional.json_document.fields.push({ pointer: "/absent", required: false })
  assert.equal((await parse(t, article(), optional)).status, "extracted")
})

test("JSON bytes, depth, nodes, selected characters, records and blocks enforce explicit budgets", async (t) => {
  for (const [key, limit, pattern] of [
    ["max_bytes", 4, /byte budget/],
    ["max_depth", 1, /structure budget/],
    ["max_nodes", 2, /structure budget/],
    ["max_field_chars", 3, /character budget/],
    ["max_blocks", 1, /block budget/],
  ]) {
    const options = profile()
    options.json_document[key] = limit
    const value = article()
    value.body = "One.\n\nTwo."
    value.extra = { nested: [1] }
    await assert.rejects(parse(t, value, options), pattern)
  }
  const invalid = profile()
  invalid.json_document.max_records = true
  await assert.rejects(parse(t, article(), invalid), /Invalid JSON budget/)
  const record = profile()
  record.json_document.max_records = 1
  record.json_document.records = {
    pointer: "/rows",
    id_pointer: "/id",
    fields: [{ pointer: "/text" }],
  }
  await assert.rejects(
    parse(
      t,
      {
        ...article(),
        rows: [
          { id: "a", text: "a" },
          { id: "b", text: "b" },
        ],
      },
      record,
    ),
    /over budget/,
  )
})

test("JSON parsing is explicit while existing HTML and Markdown parsers remain available", async (t) => {
  assert.equal((await parse(t, article(), {})).status, "unsupported")
  const md = await parse(
    t,
    Buffer.from("# Existing source\n\nExisting paragraph."),
    {},
    "text/markdown",
  )
  assert.equal(md.parser.id, "markdown-it-py")
  assert.equal(md.status, "extracted")
  const html = await parse(
    t,
    Buffer.from(
      "<html><head><title>Existing source</title></head><body><article><h1>Existing source</h1><p>A sufficiently long factual source paragraph that existing profiles retain.</p></article></body></html>",
    ),
    { title_xpath: "//h1", content_xpath: "//article" },
    "text/html",
  )
  assert.equal(html.status, "extracted")
  assert.equal(html.parser.id, "trafilatura")
})

test("registered API profiles use valid JS selectors and bind tags, repositories and comparison endpoints", async (t) => {
  const profiles = JSON.parse(fs.readFileSync("data/research-acquisition.json")).article_profiles
  for (const profile of profiles) new RegExp(profile.url_pattern)
  const releaseURL = "https://api.github.com/repos/another-owner/tool/releases/tags/v1.2.3"
  const release = profiles.filter((p) => new RegExp(p.url_pattern).test(releaseURL))
  assert.equal(release.length, 1)
  const body = {
    name: "v1.2.3",
    tag_name: "v1.2.3",
    published_at: "2026-07-13T10:49:55Z",
    prerelease: true,
    body: "A release.",
    html_url: "https://github.com/another-owner/tool/releases/tag/v1.2.3",
  }
  const parsed = await parse(t, body, release[0].options, "application/json", releaseURL)
  assert.equal(parsed.status, "extracted")
  await assert.rejects(
    parse(
      t,
      { ...body, html_url: "https://github.com/wrong-owner/tool/releases/tag/v1.2.3" },
      release[0].options,
      "application/json",
      releaseURL,
    ),
    /identity mismatch/,
  )
  const compareURL = "https://api.github.com/repos/another-owner/tool/compare/v1...v2"
  const compare = profiles.filter((p) => new RegExp(p.url_pattern).test(compareURL))
  assert.equal(compare.length, 1)
  const comparison = {
    url: compareURL,
    html_url: "https://github.com/another-owner/tool/compare/v1...v2",
    status: "identical",
    ahead_by: 0,
    behind_by: 0,
    total_commits: 0,
    base_commit: { sha: "base" },
    merge_base_commit: { sha: "base" },
    commits: [],
  }
  assert.equal(
    (await parse(t, comparison, compare[0].options, "application/json", compareURL)).status,
    "extracted",
  )
  await assert.rejects(
    parse(
      t,
      { ...comparison, url: compareURL.replace("tool", "other") },
      compare[0].options,
      "application/json",
      compareURL,
    ),
    /identity mismatch/,
  )
})

test("generic JSON source identities support numeric IDs without accepting boolean aliases", async (t) => {
  const address = "https://publisher.test/articles/42"
  assert.equal(
    (await parse(t, { ...article(), id: 42 }, profile(), "application/json", address)).status,
    "extracted",
  )
  await assert.rejects(
    parse(
      t,
      { ...article(), id: true },
      profile(),
      "application/json",
      "https://publisher.test/articles/True",
    ),
    /identity mismatch/,
  )
})
