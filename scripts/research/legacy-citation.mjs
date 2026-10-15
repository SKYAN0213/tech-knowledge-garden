import { canonicalURL } from "../garden.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { readJSON } from "./run-state.mjs"

// A report citing an unavailable original is a citation chain, not an official
// replacement, independently read source, or confirmation of the original.
export function assertLegacyCitationEvidence(review, article, stored) {
  const original = new URL(review.original_url)
  const cited = new URL(review.cited_url)
  const reporting = canonicalURL(review.reporting_url)
  const parse = stored.parses.find((p) => p.parse_id === review.parse_id)
  const document = stored.documents.find((d) => d.source_version_id === review.source_version_id)
  const block = parse?.blocks.find((b) => b.block_id === review.block_id)
  if (
    !review.reason.trim() ||
    review.reporting_source_read !== true ||
    review.attribution_checked !== true ||
    review.citation_identity_checked !== true ||
    review.unread_original_not_used !== true ||
    ![original.protocol, cited.protocol].every((p) => ["http:", "https:"].includes(p)) ||
    original.origin !== cited.origin ||
    original.pathname !== cited.pathname ||
    [...original.searchParams].some(([key, value]) => cited.searchParams.get(key) !== value) ||
    !article.source_urls.map(canonicalURL).includes(reporting) ||
    article.source_urls.map(canonicalURL).includes(canonicalURL(review.original_url)) ||
    canonicalURL(document?.original_url || "") !== reporting ||
    !["captured", "not_modified"].includes(document?.fetch_status) ||
    parse?.status !== "extracted" ||
    parse.source_version_id !== document.source_version_id ||
    parse.source_version_id !== review.source_version_id ||
    block?.text !== review.quote ||
    !parse.links?.some((link) => link.url === review.cited_url && link.text === review.link_text)
  )
    throw Error(
      "Legacy citation requires the exact read report, attributed block and original-resource link",
    )
  return reporting
}

export function loadLegacyCitationEvidence(root, review, article) {
  if (!root) throw Error("Stored evidence root required for legacy citation review")
  const stored = loadStoredSourceRun(root, review.approved_run)
  const approved = readJSON(root, `runs/${review.approved_run}/approved-article.json`)
  if (JSON.stringify(approved) !== JSON.stringify(article))
    throw Error("Legacy citation run differs from the projected approved article")
  return assertLegacyCitationEvidence(review, article, stored)
}
