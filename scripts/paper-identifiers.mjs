// Pure identity normalization shared by research review and canonical editions.
// Source selection and publication status still require their own evidence review.
export function paperKey(identifier) {
  if (typeof identifier !== "string" || /\s/.test(identifier))
    throw Error("Unsupported paper identifier")
  const raw = identifier.trim()
  if (raw.startsWith("url:")) {
    if (raw !== identifier || /\s/.test(raw) || !raw.startsWith("url:https://"))
      throw Error("Paper URL identifier requires an exact HTTPS URL without whitespace")
    const url = new URL(raw.slice(4))
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw Error("Paper URL identifier requires HTTPS without credentials or fragments")
    return "url:" + url.toString()
  }
  const id = raw.toLowerCase()
  if (/^doi:10\.\S+$/.test(id)) return id
  if (/^arxiv:\d{4}\.\d{4,5}(v\d+)?$/.test(id)) return id.replace(/v\d+$/, "")
  throw Error("Unsupported paper identifier")
}
