import { canonicalURL } from "../garden.mjs"
import { parseResearchDate } from "./dates.mjs"

// A dated listing can link a primary document and its supplement even when
// the PDF itself has no hyperlinks. This proves a material link, not approval.
export function validateListingSupportRelations(
  parses,
  document,
  parsed,
  relations,
  supportingURLs,
) {
  if (
    !Array.isArray(relations) ||
    relations.length > 7 ||
    new Set(relations.map((r) => canonicalURL(r.url))).size !== relations.length
  )
    throw Error("Candidate listing support relations are invalid")
  const linkedURLs = new Set()
  for (const relation of relations) {
    if (!relation.profile_id || !relation.primary_dom_path || !relation.support_dom_path)
      throw Error("Candidate listing support relation needs exact locators")
    const listing = parses.find(
      (p) =>
        p.parse_id === relation.listing_parse_id &&
        p.source_version_id === relation.listing_source_version_id,
    )
    const primary = listing?.links?.find(
      (l) =>
        l.profile_id === relation.profile_id &&
        l.dom_path === relation.primary_dom_path &&
        canonicalURL(l.url) === canonicalURL(document.original_url),
    )
    const linked = primary?.supporting_links?.find(
      (l) =>
        l.dom_path === relation.support_dom_path &&
        canonicalURL(l.url) === canonicalURL(relation.url),
    )
    if (
      !linked ||
      !supportingURLs.some((u) => canonicalURL(u) === canonicalURL(relation.url)) ||
      parseResearchDate(primary.published_at)?.day !==
        parseResearchDate(parsed.dates?.published_at)?.day
    )
      throw Error("Candidate supporting source lacks its exact dated listing relation")
    linkedURLs.add(canonicalURL(relation.url))
  }
  return linkedURLs
}
