import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { formHTMLPageRequest, scanFormHTMLRoute } from "../scripts/research/form-html-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const channel = {
  channel_id: "kind-ir-schedule-ko",
  url: "https://kind.krx.co.kr/corpgeneral/irschedule.do?method=searchIRScheduleMain&gubun=iRSchedule",
  allowed_hosts: ["kind.krx.co.kr"],
  item_pattern:
    "^https://kind\\.krx\\.co\\.kr/corpgeneral/irschedule\\.do\\?irSeq=[0-9]+&method=searchIRScheduleDetail$",
  api_profile: {
    id: "post-html-fragment-pages-v1",
    endpoint: "https://kind.krx.co.kr/corpgeneral/irschedule.do",
    page_size: 2,
    max_pages: 4,
    page_field: "pageIndex",
    page_size_field: "currentPageSize",
    listing_link_rule_id: "kind-ir-schedule-event-list-ko-v1",
    item_identity_pattern: "\\?irSeq=[0-9]+&method=searchIRScheduleDetail$",
    form_fields: {
      method: "searchIRScheduleSub",
      currentPageSize: "{page_size}",
      pageIndex: "{page}",
      fromDate: "{since}",
      toDate: "{until}",
    },
    parser_options: {
      format: "html-fragment",
      publication_date_policy: "not_applicable",
      listing_link_rules: [{ id: "kind-ir-schedule-event-list-ko-v1", date_kind: "event_date" }],
    },
  },
}

const row = (seq, day, company = "두산로보틱스") => ({
  url: `https://kind.krx.co.kr/corpgeneral/irschedule.do?irSeq=${seq}&method=searchIRScheduleDetail`,
  text: `${day} 경영실적 발표`,
  event_date: day,
  listed_date_text: day,
  categories: [company],
  profile_id: "kind-ir-schedule-event-list-ko-v1",
})

test("form HTML page request binds page and window fields into both URL and body", () => {
  const request = formHTMLPageRequest(channel, 3, { since: "2026-07-01", until: "2026-10-03" })
  const url = new URL(request.url)
  const form = new URLSearchParams(request.form)
  assert.equal(url.searchParams.get("pageIndex"), "3")
  assert.equal(url.searchParams.get("currentPageSize"), "2")
  assert.equal(form.get("fromDate"), "2026-07-01")
  assert.equal(form.get("toDate"), "2026-10-03")
  for (const [key, value] of form) assert.deepEqual(url.searchParams.getAll(key), [value])
  assert.throws(() => formHTMLPageRequest(channel, 0, { since: "2026-07-01", until: "2026-10-03" }))
})

test("form HTML scan validates pages and saves scheduled events separately from candidates", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "form-html-scan-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "pages"))
  const pageRows = [
    [row(46478, "2026-09-28"), row(46484, "2026-09-20")],
    [row(45182, "2026-09-10"), row(45100, "2026-08-31")],
  ]
  const stages = new Map(), calls = []
  const run = {
    async stage(name, _input, action) {
      if (!stages.has(name)) stages.set(name, await action())
      return stages.get(name)
    },
  }
  const fetchPolicy = async (_root, _fetcher, url, options) => {
    calls.push({ url, options })
    assert.equal(options.method, "POST")
    const page = Number(new URLSearchParams(options.form).get("pageIndex"))
    const body = `fragment page ${page}`
    const body_path = `pages/${page}.html`
    fs.writeFileSync(path.join(root, body_path), body)
    return {
      original_url: url,
      final_url: url,
      source_version_id: `source:${page}`,
      fetch_status: "captured",
      observed_at: "2026-10-02T00:00:00Z",
      mime_type: "text/html; charset=UTF-8",
      body_sha256: sha256(body),
      body_path,
    }
  }
  const parse = async (_root, document) => {
    const page = Number(new URLSearchParams(document.final_url.split("?")[1]).get("pageIndex"))
    return {
      status: "extracted",
      parse_id: `parse:${page}`,
      quality: { required_fields_present: true },
      blocks: [{ text: "KIND event list" }],
      links: pageRows[page - 1].map((item) => ({ ...item })),
    }
  }
  const result = await scanFormHTMLRoute(
    root,
    run,
    {},
    channel,
    [],
    { since: "2026-09-01", until: "2026-09-29" },
    { fetchPolicy, parse },
  )
  assert.equal(result.summary.status, "event_window_scanned")
  assert.equal(result.summary.reached_older_item, true)
  assert.equal(result.summary.pages.length, 2)
  assert.equal(result.events.length, 3)
  assert.equal(result.candidates.length, 0)
  assert.equal(result.events[0].company, "두산로보틱스")
  assert.equal(result.events[0].event_date, "2026-09-28")
  assert.equal(calls.length, 2)
})

test("form HTML scan refuses incomplete page windows and duplicate identities", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "form-html-incomplete-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "pages"))
  const run = { stage: async (_name, _input, action) => action() }
  let page = 0
  const fetchPolicy = async (_root, _fetcher, url) => {
    page++
    const body = `page ${page}`
    const body_path = `pages/${page}.html`
    fs.writeFileSync(path.join(root, body_path), body)
    return {
      original_url: url,
      final_url: url,
      source_version_id: `source:${page}`,
      fetch_status: "captured",
      observed_at: "2026-10-02T00:00:00Z",
      mime_type: "text/html",
      body_sha256: sha256(body),
      body_path,
    }
  }
  const parse = async (_root, document) => {
    const pageNumber = Number(new URLSearchParams(document.final_url.split("?")[1]).get("pageIndex"))
    const rows = pageNumber === 1
      ? [row(46478, "2026-09-28"), row(46478, "2026-09-20")]
      : [row(45182, "2026-08-31")]
    return {
      status: "extracted",
      parse_id: `parse:${pageNumber}`,
      quality: { required_fields_present: true },
      blocks: [{ text: "KIND event list" }],
      links: rows,
    }
  }
  const result = await scanFormHTMLRoute(root, run, {}, channel, [], {
    since: "2026-09-01",
    until: "2026-09-29",
  }, { fetchPolicy, parse })
  assert.equal(result.summary.status, "incomplete")
  assert.equal(result.summary.reason, "duplicate_or_unordered_event")
  assert.deepEqual(result.events, [])
})
