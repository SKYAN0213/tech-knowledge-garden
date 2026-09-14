import { sectorGroups } from "./sectors.mjs"
// A recap references a reviewed article; it never creates another event or issue.
export function attachRecentEvents(issues) {
  const day = 86400000
  for (const i of issues) {
    const ids = i.original.meta.recent_event_ids || []
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
      throw Error("Invalid recent event IDs")
    i.recentItems = ids.map((id) => {
      const earlier = issues
        .filter((p) => p.date < i.date)
        .flatMap((p) => p.items)
        .filter((a) => a.id === id)
      const a = earlier.at(-1)
      const age = Date.parse(i.date) - Date.parse(a?.review?.published_at)
      if (
        !a ||
        a.review?.review_status !== "verified" ||
        i.items.some((a) => a.id === id) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > 6 * day
      )
        throw Error(
          "Recent event must reference a verified previous article within seven calendar days: " +
            id,
        )
      return a
    })
    if (i.recentItems.length) sectorGroups(i.original, [...i.items, ...i.recentItems])
    const picks = i.original.meta.briefing_highlights
    if (picks !== undefined) {
      const available = [...i.items, ...i.recentItems]
      if (
        !Array.isArray(picks) ||
        new Set(picks).size !== picks.length ||
        picks.length < Math.min(3, available.length) ||
        picks.length > 5
      )
        throw Error("Choose 3-5 briefing highlights")
      i.highlights = picks.map((id) => {
        const a = available.find((a) => a.id === id)
        if (!a) throw Error("Unknown briefing highlight: " + id)
        return a
      })
    }
  }
}
