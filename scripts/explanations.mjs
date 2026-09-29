const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
// Approved prose is plain text. Escape a literal tilde before inserting it
// into Markdown so numeric ranges do not become GFM strikethrough.
export const markdownProse = (value) => value.replace(/(?<!\\)~/g, "\\~")
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
