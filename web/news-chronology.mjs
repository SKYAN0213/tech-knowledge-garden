import { validReaderDay } from "./reader-explore.mjs"

const day = (value) => (value && validReaderDay(value) ? value : "")
const DAY = 86400000
export const newsToday = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now)

export function firstBriefingDates(articles) {
  const first = new Map()
  for (const article of articles) {
    const date = day(String(article.edition?.meta?.date || ""))
    if (date && (!first.has(article.id) || date < first.get(article.id)))
      first.set(article.id, date)
  }
  return first
}

export function newsArticleDates(article) {
  return {
    publishedAt: day(article.review?.published_at),
    briefingDate: day(article.firstBriefingDate || String(article.edition?.meta?.date || "")),
  }
}

export function newsDatePlacement({ publishedAt, briefingDate }, today = newsToday()) {
  if (!day(today)) throw Error("A valid news reading day is required")
  publishedAt = day(publishedAt)
  briefingDate = day(briefingDate)
  const age = briefingDate ? (Date.parse(today) - Date.parse(briefingDate)) / DAY : Infinity
  const recent = age >= 0 && age < 7
  const basis = briefingDate && (recent || !publishedAt) ? "briefing" : "announcement"
  const date = basis === "briefing" ? briefingDate : publishedAt
  return {
    key: basis + ":" + date,
    basis,
    date,
    label: date ? (basis === "briefing" ? "브리핑 발행" : "발표") : "",
  }
}

export function groupNewsDates(records, { today = newsToday() } = {}) {
  const groups = new Map()
  for (const record of records) {
    const placement = newsDatePlacement(record, today)
    if (!groups.has(placement.key)) groups.set(placement.key, { ...placement, items: [] })
    groups.get(placement.key).items.push(record)
  }
  for (const group of groups.values())
    group.items.sort(
      (a, b) =>
        String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")) ||
        String(a.id || "").localeCompare(String(b.id || "")),
    )
  return [...groups.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.basis.localeCompare(a.basis),
  )
}

export function refreshNewsChronology({ document, now = new Date() }) {
  const stream = document.querySelector('[data-news-stream="rolling"]')
  if (!stream) return false
  const today = newsToday(now)
  if (stream.dataset.newsToday === today) return false
  const records = [...stream.querySelectorAll("[data-news-row]")].map((row) => ({
    id: row.dataset.eventId,
    publishedAt: row.dataset.publishedAt,
    briefingDate: row.dataset.briefingDate,
    row,
  }))
  const fragment = document.createDocumentFragment()
  for (const group of groupNewsDates(records, { today })) {
    const section = document.createElement("section")
    section.className = "news-day"
    section.setAttribute("data-news-day", "")
    section.setAttribute("data-date-basis", group.basis)
    if (group.date) {
      const heading = document.createElement("h2")
      const time = document.createElement("time")
      time.setAttribute("datetime", group.date)
      time.textContent = group.date.replaceAll("-", ".")
      const label = document.createElement("span")
      label.className = "news-date-basis"
      label.textContent = group.label
      heading.append(time, label)
      section.append(heading)
    }
    const content = document.createElement("div")
    content.append(...group.items.map(({ row }) => row))
    section.hidden = group.items.every(({ row }) => row.hidden)
    section.append(content)
    fragment.append(section)
  }
  stream.replaceChildren(fragment)
  stream.dataset.newsToday = today
  return true
}

export function bindNewsChronology({
  document,
  window,
  now = () => new Date(),
  onChange = () => {},
}) {
  let timer
  const refresh = () => {
    const current = now()
    if (refreshNewsChronology({ document, now: current })) onChange()
    window.clearTimeout(timer)
    const midnight = Date.parse(newsToday(current) + "T00:00:00+09:00") + DAY
    timer = window.setTimeout(refresh, midnight - current.getTime())
  }
  refresh()
  window.addEventListener("pageshow", refresh)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh()
  })
}
