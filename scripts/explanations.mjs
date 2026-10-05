const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
// Approved prose is plain text. Numeric ranges and issue numbers must not
// become strikethrough or Obsidian tags, including numbers with Korean particles.
export const markdownProse = (value) =>
  value.replace(/(?<!\\)~/g, "\\~").replace(/(?<!\\)#(?=\d)/g, "\\#")
export const markdownProseText = (value) => value.replace(/\\([~#])/g, "$1")
export const explanationHTML = (a) =>
  (a.editorial?.explanations || [])
    .map(
      (s) =>
        `<section class="news-explanation"><h4>${esc(s.heading)}</h4>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`,
    )
    .join("")
export const explanationMarkdown = (a) =>
  (a.editorial?.explanations || [])
    .map((s) => `##### ${s.heading}\n\n${s.paragraphs.map(markdownProse).join("\n\n")}`)
    .join("\n\n")
