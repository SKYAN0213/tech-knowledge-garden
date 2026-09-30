// This key only finds a potential duplicate. Matching titles and days do not
// establish event identity without an original-source review.
export function titleDayKey(title, publishedAt) {
  if (typeof title !== "string" || typeof publishedAt !== "string") return null
  const day = publishedAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "")
  return normalized ? `${day}:${normalized}` : null
}
