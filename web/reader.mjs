import { matchesNews } from "./news-filter.mjs"
import { searchReaderEntries, readerSearchEvidence } from "./reader-search.mjs"
import { bindReaderExplore } from "./reader-explore.mjs"
import { bindNewsChronology } from "./news-chronology.mjs"
import { bindReaderList } from "./reader-list.mjs"

const base = document.body.dataset.base || ""
const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (text !== undefined) e.textContent = text
  return e
}
const searchDialog = document.querySelector("#search-dialog"),
  search = document.querySelector("#site-search"),
  searchType = document.querySelector("#search-type")
let searchData
let searchLoading
const searchResults = document.querySelector("#search-results")
async function showSearch() {
  if (!searchDialog.open) searchDialog.showModal()
  search.focus()
  try {
    searchData ||= await (searchLoading ||= fetch(base + "/reader-index.json")
      .then((r) => {
        if (!r.ok) throw Error("Search data unavailable")
        return r.json()
      })
      .catch((error) => {
        searchLoading = undefined
        throw error
      }))
    renderSearch()
  } catch {
    searchResults.textContent = "검색 데이터를 불러오지 못했습니다."
  }
}
function renderSearch() {
  if (!searchData) return
  searchResults.replaceChildren()
  if (!search.value.trim()) return
  const rows = searchReaderEntries(searchData, search.value, { type: searchType?.value || "" })
  for (const n of rows) {
    const evidence = readerSearchEvidence(n)
    const result = el("article", { class: "search-result" })
    result.append(
      el(
        "small",
        { class: "search-result-meta" },
        [n.type, evidence.dateLabel].filter(Boolean).join(" · "),
      ),
    )
    const title = el("h3")
    title.append(el("a", { href: n.url }, n.title))
    result.append(title)
    for (const fact of evidence.facts) {
      result.append(el("p", { class: "search-snippet" }, fact.text))
      if (fact.published_at || fact.article_url) {
        const reference = el("div", { class: "search-sources" })
        if (fact.published_at)
          reference.append(
            el("time", { datetime: fact.published_at }, fact.published_at.slice(0, 10)),
          )
        if (fact.article_url) reference.append(el("a", { href: fact.article_url }, "기사 보기 →"))
        result.append(reference)
      }
    }
    const sources = el("div", { class: "search-sources" })
    for (const url of evidence.sourceUrls.slice(0, 3)) {
      sources.append(
        el("a", { href: url }, new URL(url).hostname.replace(/^www\./, "") + " 원문 ↗"),
      )
    }
    if (sources.childElementCount) result.append(sources)
    searchResults.append(result)
  }
  if (!rows.length) searchResults.textContent = "검색 결과 없음"
}
function searchURL() {
  const url = new URL(location.href)
  for (const [key, value] of [
    ["search", search.value.trim()],
    ["search_type", searchType?.value || ""],
  ])
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  history.replaceState(null, "", url)
}
function restoreSearch() {
  const params = new URL(location.href).searchParams
  search.value = params.get("search") || ""
  if (searchType) searchType.value = params.get("search_type") || ""
  if (params.has("search")) void showSearch()
  else if (searchDialog.open) searchDialog.close()
}
document.querySelector("#search-open")?.addEventListener("click", () => void showSearch())
search?.addEventListener("input", () => {
  searchURL()
  renderSearch()
})
searchType?.addEventListener("change", () => {
  searchURL()
  renderSearch()
})
if (searchDialog) {
  searchDialog.addEventListener("close", () => {
    const url = new URL(location.href)
    url.searchParams.delete("search")
    url.searchParams.delete("search_type")
    history.replaceState(null, "", url)
  })
  window.addEventListener("popstate", restoreSearch)
  restoreSearch()
}
searchDialog?.addEventListener("click", (e) => {
  if (e.target === searchDialog) searchDialog.close()
})
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchDialog?.open) {
    e.preventDefault()
    searchDialog.close()
    document.querySelector("#search-open")?.focus()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault()
    if (!searchDialog.open) showSearch()
  }
})
document.querySelector("#copy-feed")?.addEventListener("click", async () => {
  const input = document.querySelector("#feed-url"),
    status = document.querySelector("#copy-status")
  try {
    await navigator.clipboard.writeText(input.value)
    status.textContent = "복사했습니다."
  } catch {
    input.focus()
    input.select()
    status.textContent = "주소를 선택했습니다. 복사해 주세요."
  }
})

const roots = document.querySelectorAll("[data-connections]")
for (const root of roots) {
  const load = () =>
    import("./connection-map.mjs")
      .then((m) => m.mountConnections(root))
      .catch(() => {
        root.textContent = "연결 지도를 불러오지 못했습니다."
      })
  if (root.dataset.mode === "full" || !("IntersectionObserver" in window)) load()
  else {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          load()
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(root)
  }
}

const newsQuery = document.querySelector("#news-query")
const newsMore = document.querySelector("#news-more")
const newsList = newsMore
  ? bindReaderList({
      button: newsMore,
      location,
      history,
      onChange: () => filterNews(false),
      rowSelector: "[data-news-row]",
    })
  : null
const newsControls = Object.fromEntries(
  ["sector", "theme", "entity", "kind"].map((key) => [key, document.querySelector(`#news-${key}`)]),
)
function filterNews(updateURL = true) {
  const url = new URL(location.href)
  const filters = { query: newsQuery.value }
  for (const [key, control] of Object.entries(newsControls))
    filters[key] = control?.value ?? url.searchParams.get(key) ?? ""
  for (const tab of document.querySelectorAll("[data-sector-tab]")) {
    if (!filters.kind && tab.dataset.sectorTab === filters.sector)
      tab.setAttribute("aria-current", "page")
    else tab.removeAttribute("aria-current")
  }
  let visible = 0
  let availableDeep = false
  for (const row of document.querySelectorAll("[data-news-row]")) {
    const data = { ...JSON.parse(row.dataset.classification || "{}"), text: row.textContent }
    row.hidden = !matchesNews(data, filters)
    if (data.deep && matchesNews(data, { ...filters, kind: "" })) availableDeep = true
    if (!row.hidden) visible++
  }
  for (const tab of document.querySelectorAll("[data-deep-tab]")) {
    tab.hidden = !availableDeep
    if (filters.kind === "deep") tab.setAttribute("aria-current", "page")
    else tab.removeAttribute("aria-current")
    const deepURL = new URL(location.href)
    for (const [key, value] of Object.entries({
      q: filters.query,
      sector: filters.sector,
      theme: filters.theme,
      entity: filters.entity,
    }))
      if (value) deepURL.searchParams.set(key, value)
      else deepURL.searchParams.delete(key)
    deepURL.searchParams.set("kind", "deep")
    tab.setAttribute("href", deepURL.href)
  }
  for (const group of document.querySelectorAll("[data-news-day]"))
    group.hidden = ![...group.querySelectorAll("[data-news-row]")].some((row) => !row.hidden)
  document.querySelector("#news-count").textContent = `${visible}건`
  document.querySelector("#news-empty").hidden = visible > 0
  if (updateURL) {
    url.searchParams.delete("show")
    for (const [key, value] of Object.entries({
      q: filters.query,
      sector: filters.sector,
      theme: filters.theme,
      entity: filters.entity,
      kind: filters.kind,
    }))
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    if (url.href !== location.href) history.pushState(null, "", url)
  }
  newsList?.apply(
    [...document.querySelectorAll("[data-news-row]")].filter((row) => !row.hidden),
    [...document.querySelectorAll("[data-news-day]")],
  )
}
function restoreNewsFilters() {
  const params = new URL(location.href).searchParams
  newsQuery.value = params.get("q") || ""
  for (const [key, control] of Object.entries(newsControls)) {
    if (!control) continue
    const value = params.get(key) || ""
    // A stale shared filter must show zero matches, not silently become "all".
    if (value && ![...control.options].some((o) => o.value === value))
      control.add(new Option(value, value))
    control.value = value
  }
  filterNews(false)
}
if (newsQuery) {
  for (const tab of document.querySelectorAll("[data-sector-tab]"))
    tab.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      if (!newsControls.sector) return
      e.preventDefault()
      newsControls.sector.value = tab.dataset.sectorTab
      if (newsControls.kind) newsControls.kind.value = ""
      filterNews()
    })
  for (const tab of document.querySelectorAll("[data-deep-tab]"))
    tab.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !newsControls.kind) return
      e.preventDefault()
      newsControls.kind.value = "deep"
      filterNews()
    })
  newsQuery.addEventListener("input", () => filterNews())
  for (const control of Object.values(newsControls))
    control?.addEventListener("change", () => filterNews())
  document.querySelector("#news-reset")?.addEventListener("click", () => {
    newsQuery.value = ""
    for (const control of Object.values(newsControls)) if (control) control.value = ""
    filterNews()
  })
  window.addEventListener("popstate", restoreNewsFilters)
  restoreNewsFilters()
}
if (document.querySelector('[data-news-stream="rolling"]'))
  bindNewsChronology({ document, window, onChange: () => filterNews(false) })
bindReaderExplore({
  document,
  window,
  location,
  history,
  makeOption: (value) => new Option(value, value),
})
