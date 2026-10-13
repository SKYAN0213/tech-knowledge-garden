export function readerListLimit(value, batchSize = 12) {
  if (!/^\d{1,6}$/.test(value || "")) return batchSize
  return Math.max(batchSize, Number(value))
}

// The caller supplies every matching row before applying the display limit.
// Filtering, event identity and the total result count stay independent of it.
export function bindReaderList({
  button,
  location,
  history,
  onChange,
  rowSelector,
  batchSize = 12,
}) {
  let nextLimit = batchSize
  button.addEventListener("click", () => {
    if (button.hidden) return
    const url = new URL(location.href)
    url.searchParams.set("show", String(nextLimit))
    history.pushState(null, "", url)
    onChange()
  })
  return {
    apply(rows, groups) {
      const limit = readerListLimit(new URL(location.href).searchParams.get("show"), batchSize)
      rows.forEach((row, index) => {
        row.hidden = index >= limit
      })
      for (const group of groups)
        group.hidden = ![...group.querySelectorAll(rowSelector)].some((row) => !row.hidden)
      const shown = Math.min(limit, rows.length)
      const nextCount = Math.min(batchSize, rows.length - shown)
      nextLimit = shown + nextCount
      button.hidden = nextCount === 0
      button.textContent = `더 보기 · ${nextCount}건`
      return { shown, total: rows.length }
    },
  }
}
