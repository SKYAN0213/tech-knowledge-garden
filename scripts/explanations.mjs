const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
export const explanationHTML = (a) =>
  (a.editorial?.explanations || [])
    .map(
      (s) =>
        `<section class="news-explanation"><h4>${esc(s.heading)}</h4>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`,
    )
    .join("")
export const explanationMarkdown = (a) =>
  (a.editorial?.explanations || [])
    .map((s) => `##### ${s.heading}\n\n${s.paragraphs.join("\n\n")}`)
    .join("\n\n")
