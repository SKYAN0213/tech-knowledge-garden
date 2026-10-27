const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
// Approved prose is plain text. Numeric ranges and hash-prefixed labels must not
// become strikethrough, emphasis or Obsidian tags, including code identifiers.
const escapePlainProse = (value) =>
  value
    .replace(/(?<!\\)~/g, "\\~")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_")
export function markdownProse(value) {
  // Backslashes are literal inside CommonMark code spans. Escape only prose
  // outside matching backtick runs; an escaped or unmatched opener is text.
  const runs = [...value.matchAll(/`+/g)]
  let output = "",
    offset = 0
  for (let i = 0; i < runs.length; i++) {
    const opener = runs[i]
    const slashes = /\\*$/.exec(value.slice(0, opener.index))[0].length
    if (slashes % 2) continue
    let closing = i + 1
    while (closing < runs.length && runs[closing][0] !== opener[0]) closing++
    if (closing === runs.length) continue
    const end = runs[closing].index + runs[closing][0].length
    output += escapePlainProse(value.slice(offset, opener.index)) + value.slice(opener.index, end)
    offset = end
    i = closing
  }
  return output + escapePlainProse(value.slice(offset))
}
export const markdownProseText = (value) => value.replace(/\\([~#_])/g, "$1")
export const explanationHTML = (a, { level = 4 } = {}) =>
  (a.editorial?.explanations || [])
    .map(
      (s) =>
        `<section class="news-explanation"><h${level}>${esc(s.heading)}</h${level}>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`,
    )
    .join("")
export const explanationMarkdown = (a, { level = 5 } = {}) =>
  (a.editorial?.explanations || [])
    .map(
      (s) => `${"#".repeat(level)} ${s.heading}\n\n${s.paragraphs.map(markdownProse).join("\n\n")}`,
    )
    .join("\n\n")
