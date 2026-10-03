// Public metadata helps discover originals; metadata/abstracts never become full-text evidence.
export function crossrefLinks(body) {
  if (body.status !== "ok" || !Array.isArray(body.message?.items))
    throw Error("Invalid Crossref response")
  return body.message.items
    .filter((i) => i.DOI && i.title?.[0])
    .map((i) => ({
      url: i.URL || "https://doi.org/" + i.DOI,
      text: i.title[0],
      doi: i.DOI,
      access: "metadata",
      version_relation: i.relation || {},
    }))
}
export function secLinks(body, cik) {
  if (!/^\d{1,10}$/.test(String(cik)) || !body.filings?.recent)
    throw Error("Invalid SEC submissions response")
  const r = body.filings.recent,
    keys = ["accessionNumber", "filingDate", "form", "primaryDocument"]
  if (keys.some((k) => !Array.isArray(r[k]) || r[k].length !== r.accessionNumber.length))
    throw Error("SEC parallel columns mismatch")
  return r.accessionNumber.map((accession, n) => {
    const doc = r.primaryDocument[n]
    if (
      !/^\d{10}-\d{2}-\d{6}$/.test(accession) ||
      typeof doc !== "string" ||
      doc.startsWith("/") ||
      doc.split("/").some((part) => !/^[\w.-]+$/.test(part) || part === "." || part === "..")
    )
      throw Error("Invalid SEC filing identity")
    return {
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${doc}`,
      text: `${body.name}: ${r.form[n]} ${r.filingDate[n]}`,
      published_at: r.filingDate[n],
      event_date_requires_review: true,
    }
  })
}
