// Historical Korean issues sometimes stored local time without an offset.
// Interpret that recorded time as KST on both the Mac and the UTC build server.
export function coverageDate(value) {
  const text = String(value).trim()
  const local = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
  return new Date(local ? text.replace(" ", "T") + "+09:00" : value)
}
