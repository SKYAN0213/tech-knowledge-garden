import { matchesNews } from "./news-filter.mjs"

const base = document.body.dataset.base || ""
const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (text !== undefined) e.textContent = text
  return e
}
const searchDialog = document.querySelector("#search-dialog"),
  search = document.querySelector("#site-search")
let searchData
const searchResults = document.querySelector("#search-results")
async function showSearch() {
  searchDialog.showModal()
  search.focus()
  try {
    searchData ||= await fetch(base + "/reader-index.json").then((r) => {
      if (!r.ok) throw Error()
      return r.json()
    })
    renderSearch()
  } catch {
    searchResults.textContent = "검색 데이터를 불러오지 못했습니다."
  }
}
function renderSearch() {
  if (!searchData) return
  const query = search.value.normalize("NFC").toLowerCase().trim()
  searchResults.replaceChildren()
  if (!query) return
  const terms = query.split(/\s+/)
  const rows = searchData
    .map((n) => {
      const title = (n.title + " " + n.aliases.join(" ") + " " + n.keywords.join(" ")).toLowerCase()
      const all = title + " " + n.text.toLowerCase()
      return {
        ...n,
        score: terms.every((t) => all.includes(t))
          ? terms.reduce((s, t) => s + (title.includes(t) ? 5 : 1), 0)
          : 0,
      }
    })
    .filter((n) => n.score)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
    .slice(0, 40)
  for (const n of rows) {
    const a = el("a", { href: n.url }, n.title)
    a.prepend(el("small", {}, n.type + " · " + n.date.slice(0, 10) + " "))
    searchResults.append(a)
  }
  if (!rows.length) searchResults.textContent = "검색 결과 없음"
}
document.querySelector("#search-open")?.addEventListener("click", showSearch)
search?.addEventListener("input", renderSearch)
searchDialog?.addEventListener("click", (e) => {
  if (e.target === searchDialog) searchDialog.close()
})
document.addEventListener("keydown", (e) => {
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
  for (const tab of document.querySelectorAll("[data-deep-tab]")) {
    if (filters.kind === "deep") tab.setAttribute("aria-current", "page")
    else tab.removeAttribute("aria-current")
  }
  let visible = 0
  for (const row of document.querySelectorAll("[data-news-row]")) {
    const data = JSON.parse(row.dataset.classification || "{}")
    row.hidden = !matchesNews({ ...data, text: row.textContent }, filters)
    if (!row.hidden) visible++
  }
  for (const group of document.querySelectorAll("[data-news-day]"))
    group.hidden = ![...group.querySelectorAll("[data-news-row]")].some((row) => !row.hidden)
  document.querySelector("#news-count").textContent = `${visible}건`
  document.querySelector("#news-empty").hidden = visible > 0
  if (updateURL) {
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
      if (newsControls.sector) newsControls.sector.value = ""
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
