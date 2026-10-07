const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
// Approved prose is plain text. Numeric ranges and hash-prefixed labels must not
// become strikethrough, emphasis or Obsidian tags, including code identifiers.
export const markdownProse = (value) =>
  value
    .replace(/(?<!\\)~/g, "\\~")
    .replace(/(?<!\\)#/g, "\\#")
    .replace(/(?<!\\)_/g, "\\_")
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
