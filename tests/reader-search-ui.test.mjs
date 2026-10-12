import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { searchReaderEntries, readerSearchEvidence } from "../web/reader-search.mjs"

test("Escape closes search even when the search input consumes native cancel and restores the trigger focus", () => {
  const handlers = {},
    dialogHandlers = {}
  const location = { href: "https://fixture.example/" }
  const search = { value: "", addEventListener() {} }
  let focused = false,
    prevented = false
  const dialog = {
    open: false,
    addEventListener(name, handler) {
      dialogHandlers[name] = handler
    },
    close() {
      this.open = false
      dialogHandlers.close()
    },
  }
  const selectors = {
    "#search-dialog": dialog,
    "#site-search": search,
    "#search-type": { value: "", addEventListener() {} },
    "#search-open": {
      addEventListener() {},
      focus() {
        focused = true
      },
    },
  }
  const document = {
    body: { dataset: {} },
    querySelector: (key) => selectors[key] || null,
    querySelectorAll: () => [],
    addEventListener(name, handler) {
      handlers[name] = handler
    },
  }
  const context = {
    document,
    location,
    URL,
    window: { addEventListener() {} },
    history: {
      replaceState(state, title, url) {
        location.href = String(url)
      },
    },
    searchReaderEntries,
    readerSearchEvidence,
    bindReaderExplore() {},
  }
  const source = fs.readFileSync(new URL("../web/reader.mjs", import.meta.url), "utf8")
  vm.runInNewContext(source.replace(/^(?:import[^\n]+\n)+/, ""), context)
  dialog.open = true
  location.href = "https://fixture.example/?sector=AI&search=FANUC&search_type=%E4%BC%81%E6%A5%AD"
  handlers.keydown({
    key: "Escape",
    preventDefault() {
      prevented = true
    },
  })
  assert.equal(dialog.open, false)
  assert.equal(prevented, true)
  assert.equal(focused, true)
  assert.equal(new URL(location.href).searchParams.get("sector"), "AI")
  assert.equal(new URL(location.href).searchParams.has("search"), false)
  assert.equal(new URL(location.href).searchParams.has("search_type"), false)
})
