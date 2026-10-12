const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
export function validReaderDay(value) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + "T00:00:00Z")
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export function readerEventWithin(day, from, to) {
  return (
    validReaderDay(from) &&
    validReaderDay(to) &&
    (!from || !to || from <= to) &&
    (!from || day >= from) &&
    (!to || day <= to)
  )
}

export function bindReaderExplore({ document, window, location, history, makeOption }) {
  const query = document.querySelector("#knowledge-query")
  const company = document.querySelector("#company-select")
  const from = document.querySelector("#weekly-from"),
    to = document.querySelector("#weekly-to"),
    period = document.querySelector("#weekly-period")
  if (!query && !company && !from) return
  const defaults = { from: from?.value || "", to: to?.value || "" }
  const terms = [...document.querySelectorAll("[data-knowledge-term]")]
  const companies = [...document.querySelectorAll("[data-company-section]")]
  const events = [...document.querySelectorAll("[data-weekly-event]")]
  const groups = [...document.querySelectorAll("[data-weekly-group]")]
  const count = (id, visible, suffix) => {
    const status = document.querySelector("#" + id + "-count")
    if (status) status.textContent = visible + suffix
    const empty = document.querySelector("#" + id + "-empty")
    if (empty) empty.hidden = visible > 0
  }
  const draw = ({ start = from?.value || "", end = to?.value || "" } = {}) => {
    if (query) {
      const words = normalize(query.value).split(/\s+/).filter(Boolean)
      for (const term of terms)
        term.hidden = !words.every((word) => normalize(term.dataset.search).includes(word))
      count("knowledge", terms.filter((term) => !term.hidden).length, "개")
    }
    if (company) {
      for (const section of companies)
        section.hidden = !!company.value && company.value !== section.dataset.company
      count("company", companies.filter((section) => !section.hidden).length, "곳")
    }
    if (from && to) {
      if (period) {
        const selected = `${start}/${end}`
        period.value = [...period.options].some((option) => option.value === selected)
          ? selected
          : ""
      }
      for (const event of events)
        event.hidden = !readerEventWithin(event.dataset.publishedDay, start, end)
      for (const group of groups)
        group.hidden = ![...group.querySelectorAll("[data-weekly-event]")].some(
          (event) => !event.hidden,
        )
      count("weekly", events.filter((event) => !event.hidden).length, "건")
    }
  }
  const restore = () => {
    const p = new URL(location.href).searchParams
    if (query) query.value = p.get("q") || ""
    if (company) {
      const value = p.get("company") || ""
      if (value && ![...company.options].some((option) => option.value === value))
        company.add(makeOption(value))
      company.value = value
    }
    const start = p.has("from") ? p.get("from") : defaults.from
    const end = p.has("to") ? p.get("to") : defaults.to
    if (from) from.value = start
    if (to) to.value = end
    draw({ start, end })
  }
  const update = (replace = false) => {
    const url = new URL(location.href)
    if (query) {
      if (query.value.trim()) url.searchParams.set("q", query.value.trim())
      else url.searchParams.delete("q")
    }
    if (company) {
      if (company.value) url.searchParams.set("company", company.value)
      else url.searchParams.delete("company")
    }
    if (from && to) {
      // Empty dates explicitly mean all dates and must survive sharing/reload.
      url.searchParams.set("from", from.value)
      url.searchParams.set("to", to.value)
    }
    if (url.href !== location.href) history[replace ? "replaceState" : "pushState"](null, "", url)
    draw()
  }
  query?.addEventListener("input", () => update(true))
  company?.addEventListener("change", () => update())
  from?.addEventListener("change", () => update())
  to?.addEventListener("change", () => update())
  period?.addEventListener("change", () => {
    if (!period.value || !from || !to) return
    const [start, end] = period.value.split("/")
    if (!start || !end || !validReaderDay(start) || !validReaderDay(end) || start > end) return
    from.value = start
    to.value = end
    update()
  })
  for (const form of document.querySelectorAll(".reader-explore-controls"))
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      update()
    })
  window.addEventListener("popstate", restore)
  restore()
}
