import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { matchesNews } from "../web/news-filter.mjs"

// Exercise the actual reader event handlers; these fixtures never enter publication.
function reader(search = "") {
  const element = (value = "", dataset = {}) => ({
    value,
    dataset,
    hidden: false,
    textContent: "",
    attrs: {},
    handlers: {},
    options: ["", "LG전자", "ABB", "Robot", "Energy", "Company", "deep"].map((value) => ({
      value,
    })),
    add(option) {
      this.options.push(option)
    },
    setAttribute(key, value) {
      this.attrs[key] = value
    },
    removeAttribute(key) {
      delete this.attrs[key]
    },
    addEventListener(key, handler) {
      this.handlers[key] = handler
    },
  })
  const query = element(),
    controls = Object.fromEntries(
      ["sector", "theme", "entity", "kind"].map((key) => [key, element()]),
    )
  const deepTab = element(),
    allTab = element("", { sectorTab: "" })
  const rows = [
    {
      sector: "Energy",
      entities: ["LG전자"],
      themes: ["Company"],
      deep: false,
      text: "cooling contract",
    },
    {
      sector: "Robot",
      entities: ["ABB"],
      themes: ["Company"],
      deep: true,
      text: "planning comparison",
    },
    {
      sector: "Energy",
      entities: ["ABB"],
      themes: ["Company"],
      deep: false,
      text: "factory opening",
    },
  ].map((data) =>
    Object.assign(element("", { classification: JSON.stringify(data) }), {
      textContent: data.text,
    }),
  )
  const count = element(),
    empty = element(),
    reset = element()
  const group = { hidden: false, querySelectorAll: () => rows }
  const selectors = {
    "#news-query": query,
    "#news-count": count,
    "#news-empty": empty,
    "#news-reset": reset,
    ...Object.fromEntries(Object.entries(controls).map(([key, value]) => ["#news-" + key, value])),
  }
  const lists = {
    "[data-news-row]": rows,
    "[data-news-day]": [group],
    "[data-deep-tab]": [deepTab],
    "[data-sector-tab]": [allTab],
  }
  const location = { href: "https://example.org/news/index" + search }
  const window = {
    handlers: {},
    addEventListener(key, handler) {
      this.handlers[key] = handler
    },
  }
  const context = {
    document: {
      body: { dataset: {} },
      querySelector: (key) => selectors[key] || null,
      querySelectorAll: (key) => lists[key] || [],
      addEventListener() {},
    },
    location,
    window,
    URL,
    matchesNews,
    history: {
      pushState(state, title, url) {
        location.href = String(url)
      },
    },
    Option: function (text, value) {
      this.text = text
      this.value = value
    },
  }
  const source = fs.readFileSync(new URL("../web/reader.mjs", import.meta.url), "utf8")
  assert.ok(source.startsWith('import { matchesNews } from "./news-filter.mjs"\n'))
  vm.runInNewContext(source.replace(/^import[^\n]+\n/, ""), context)
  return { query, controls, deepTab, rows, count, empty, reset, group, location, window }
}

test("a company with ordinary news does not expose another company's deep tab", () => {
  const r = reader("?entity=LG%EC%A0%84%EC%9E%90")
  assert.equal(r.deepTab.hidden, true)
  assert.equal(r.count.textContent, "1건")
  assert.equal(r.rows[0].hidden, false)
  assert.equal(r.rows[1].hidden, true)
})

test("deep navigation retains sector, theme, company and query in clicks and link URLs", () => {
  const r = reader("?entity=ABB&sector=Robot&theme=Company&q=planning")
  assert.equal(r.deepTab.hidden, false)
  const url = new URL(r.deepTab.attrs.href)
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    entity: "ABB",
    sector: "Robot",
    theme: "Company",
    q: "planning",
    kind: "deep",
  })
  let prevented = false
  r.deepTab.handlers.click({
    preventDefault() {
      prevented = true
    },
  })
  assert.equal(prevented, true)
  assert.equal(r.controls.sector.value, "Robot")
  assert.equal(r.deepTab.attrs["aria-current"], "page")
  assert.equal(r.count.textContent, "1건")
  assert.equal(new URL(r.location.href).searchParams.get("kind"), "deep")
})

test("typing and reset recalculate deep availability without clearing a chosen query", () => {
  const r = reader("?entity=ABB")
  assert.equal(r.deepTab.hidden, false)
  r.query.value = "factory"
  r.query.handlers.input()
  assert.equal(r.deepTab.hidden, true)
  assert.equal(r.count.textContent, "1건")
  assert.equal(new URL(r.location.href).searchParams.get("q"), "factory")
  r.reset.handlers.click()
  assert.equal(r.deepTab.hidden, false)
  assert.equal(r.count.textContent, "3건")
})

test("stale deep shared URLs stay empty while back navigation restores availability", () => {
  const r = reader("?entity=LG%EC%A0%84%EC%9E%90&kind=deep")
  assert.equal(r.deepTab.hidden, true)
  assert.equal(r.count.textContent, "0건")
  assert.equal(r.empty.hidden, false)
  assert.equal(new URL(r.location.href).searchParams.get("kind"), "deep")
  r.location.href = "https://example.org/news/index?entity=ABB&kind=deep"
  r.window.handlers.popstate()
  assert.equal(r.deepTab.hidden, false)
  assert.equal(r.deepTab.attrs["aria-current"], "page")
  assert.equal(r.count.textContent, "1건")
})
