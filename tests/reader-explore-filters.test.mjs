import test from "node:test"
import assert from "node:assert/strict"
import { bindReaderExplore, validReaderDay, readerEventWithin } from "../web/reader-explore.mjs"

function fixture(kind, search = "") {
  const element = (value = "", dataset = {}) => ({
    value,
    dataset,
    hidden: false,
    textContent: "",
    handlers: {},
    options: [{ value: "" }, { value: "FANUC" }, { value: "KUKA" }],
    add(o) {
      this.options.push(o)
    },
    addEventListener(name, handler) {
      this.handlers[name] = handler
    },
  })
  const controls = {
    query: element(),
    company: element(),
    from: element("2026-10-05"),
    to: element("2026-10-11"),
  }
  const terms = [
    element("", { search: "MCP Model Context Protocol 연결 규격" }),
    element("", { search: "Bin Picking 빈 피킹 집기 위치" }),
  ]
  const companies = [element("", { company: "FANUC" }), element("", { company: "KUKA" })]
  const events = [
    element("", { publishedDay: "2026-09-30" }),
    element("", { publishedDay: "2026-10-07" }),
  ]
  const counts = {},
    empty = {}
  for (const name of ["knowledge", "company", "weekly"]) {
    counts[name] = element()
    empty[name] = element()
  }
  const selectors = Object.fromEntries(
    Object.keys(counts).flatMap((name) => [
      [`#${name}-count`, counts[name]],
      [`#${name}-empty`, empty[name]],
    ]),
  )
  Object.assign(
    selectors,
    kind === "knowledge"
      ? { "#knowledge-query": controls.query }
      : kind === "companies"
        ? { "#company-select": controls.company }
        : { "#weekly-from": controls.from, "#weekly-to": controls.to },
  )
  const groups = [{ hidden: false, querySelectorAll: () => events }]
  const lists = {
    "[data-knowledge-term]": terms,
    "[data-company-section]": companies,
    "[data-weekly-event]": events,
    "[data-weekly-group]": groups,
    ".reader-explore-controls": [],
  }
  const document = {
    querySelector: (key) => selectors[key] || null,
    querySelectorAll: (key) => lists[key] || [],
  }
  const window = {
    handlers: {},
    addEventListener(name, handler) {
      this.handlers[name] = handler
    },
  }
  const location = { href: "https://fixture.example/reader?" + search }
  const calls = [],
    history = Object.fromEntries(
      ["pushState", "replaceState"].map((name) => [
        name,
        (s, t, u) => {
          calls.push(name)
          location.href = String(u)
        },
      ]),
    )
  bindReaderExplore({ document, window, location, history, makeOption: (value) => ({ value }) })
  return { controls, terms, companies, events, groups, counts, empty, window, location, calls }
}
test("term query uses published definition/alias text and retains share URL", () => {
  const f = fixture("knowledge", "q=MCP")
  assert.deepEqual(
    f.terms.map((x) => x.hidden),
    [false, true],
  )
  f.controls.query.value = "빈 피킹"
  f.controls.query.handlers.input()
  assert.deepEqual(
    f.terms.map((x) => x.hidden),
    [true, false],
  )
  assert.equal(new URL(f.location.href).searchParams.get("q"), "빈 피킹")
  assert.equal(f.counts.knowledge.textContent, "1개")
  assert.deepEqual(f.calls, ["replaceState"])
})
test("exact company filters restore browser history and an unknown shared name never becomes all", () => {
  const f = fixture("companies", "company=FANUC")
  assert.deepEqual(
    f.companies.map((x) => x.hidden),
    [false, true],
  )
  f.controls.company.value = "KUKA"
  f.controls.company.handlers.change()
  assert.equal(new URL(f.location.href).searchParams.get("company"), "KUKA")
  f.location.href = "https://fixture.example/reader?company=Unknown"
  f.window.handlers.popstate()
  assert.deepEqual(
    f.companies.map((x) => x.hidden),
    [true, true],
  )
  assert.equal(f.empty.company.hidden, false)
  assert.equal(f.controls.company.value, "Unknown")
})
test("date filters retain original publication dates, explicit empty ranges and malformed shared input", () => {
  const f = fixture("weekly")
  assert.deepEqual(
    f.events.map((x) => x.hidden),
    [true, false],
  )
  f.controls.from.value = ""
  f.controls.to.value = ""
  f.controls.from.handlers.change()
  assert.deepEqual(
    f.events.map((x) => x.hidden),
    [false, false],
  )
  assert.equal(new URL(f.location.href).searchParams.get("from"), "")
  f.window.handlers.popstate()
  assert.deepEqual(
    f.events.map((x) => x.hidden),
    [false, false],
  )
  f.location.href = "https://fixture.example/reader?from=2026-02-30&to=2026-10-10"
  f.window.handlers.popstate()
  assert.equal(f.counts.weekly.textContent, "0건")
  assert.equal(f.groups[0].hidden, true)
})
test("calendar validation preserves leap dates and rejects reversed or impossible periods", () => {
  assert.equal(validReaderDay("2028-02-29"), true)
  assert.equal(validReaderDay("2026-02-29"), false)
  assert.equal(readerEventWithin("2026-10-07", "2026-10-08", "2026-10-05"), false)
  assert.equal(readerEventWithin("2026-10-07", "2026-10-01", "2026-10-07"), true)
})
