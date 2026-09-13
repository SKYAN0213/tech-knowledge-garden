// Editorial diagnostic only. First-link counts do not establish source independence.
export function sourceDiversity(issues, extract, through) {
  const end = new Date(through + "T00:00:00Z")
  if (Number.isNaN(end.valueOf())) throw Error("Invalid source audit date")
  const current = issues.filter((i) => i.meta.schema_version === "tech-ai-magazine/v2")
  // Count each event at its first appearance, so reprints cannot manufacture freshness.
  const events = new Map()
  for (const issue of [...current].sort((a, b) =>
    String(a.meta.date).localeCompare(String(b.meta.date)),
  ))
    for (const a of extract(issue)) {
      if (a.review?.review_status === "excluded" || events.has(a.id)) continue
      let host = "unknown"
      try {
        host = new URL(a.urls[0]).hostname.replace(/^www\./, "")
      } catch {}
      events.set(a.id, { date: String(issue.meta.date), host })
    }
  return {
    basis: "unique event / first edition date / first source hostname",
    legacy_editions_not_counted: issues.length - current.length,
    windows: [7, 30].map((days) => {
      const from = new Date(end.valueOf() - (days - 1) * 86400000).toISOString().slice(0, 10)
      const items = [...events.values()].filter((a) => a.date >= from && a.date <= through)
      const counts = new Map()
      for (const a of items) counts.set(a.host, (counts.get(a.host) || 0) + 1)
      const domains = [...counts]
        .map(([domain, events]) => ({ domain, events }))
        .sort((a, b) => b.events - a.events || a.domain.localeCompare(b.domain))
      const top = domains[0]?.events || 0
      const topTwo = top + (domains[1]?.events || 0)
      return {
        days,
        from,
        through,
        events: items.length,
        domains,
        largest_source_percent: items.length ? Math.round((top / items.length) * 100) : null,
        top_two_percent: items.length ? Math.round((topTwo / items.length) * 100) : null,
        additional_discovery_recommended:
          items.length >= 10 && (top / items.length > 0.4 || topTwo / items.length > 0.6),
      }
    }),
  }
}
