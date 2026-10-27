import fs from "node:fs"
import { SECTORS, reviewedBriefingGroups } from "../sectors.mjs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate } from "./dates.mjs"
import { safePath } from "./run-state.mjs"

// A final reading composition may change a reviewed sector or group related
// events. It never changes immutable native approvals, prose or event identity.
export function reviewedEditionComposition(root, reference, { spec, curation, articles }) {
  if (
    !root ||
    !curation ||
    Object.keys(reference || {})
      .sort()
      .join() !== "path,sha256"
  )
    throw Error("Exact curated composition reference required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Edition composition review changed")
  const review = JSON.parse(bytes)
  const fields = [
    "schema",
    "edition_key",
    "curation_selection",
    "reviewer",
    "reviewed_at",
    "reason",
    "source_read",
    "classification_checked",
    "relationships_checked",
    "articles",
    "briefing_groups",
  ]
  if (
    Object.keys(review).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(review, key)) ||
    review.schema !== "research-edition-composition-review/v1" ||
    review.edition_key !== spec.key ||
    JSON.stringify(review.curation_selection) !== JSON.stringify(curation) ||
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    ["source_read", "classification_checked", "relationships_checked"].some(
      (key) => review[key] !== true,
    ) ||
    !Array.isArray(review.articles) ||
    review.articles.length !== articles.length ||
    new Set(review.articles.map((row) => row.event_id)).size !== articles.length ||
    !Array.isArray(review.briefing_groups)
  )
    throw Error("Complete exact edition composition review required")
  assertReviewDate(review.reviewed_at, {
    notBefore: articles.map((article) => article.article_review.reviewed_at),
  })
  const projected = articles.map((article) => {
    const row = review.articles.find((row) => row.event_id === article.event_id)
    if (
      !row ||
      Object.keys(row).sort().join() !== "approved_article_sha256,event_id,reason,sector" ||
      row.approved_article_sha256 !== sha256(JSON.stringify(article)) ||
      !SECTORS.includes(row.sector) ||
      !row.reason?.trim()
    )
      throw Error("Composition must retain every exact approved article")
    return { ...article, sector: row.sector }
  })
  const groups = review.briefing_groups.map(({ reason, ...group }) => {
    if (typeof reason !== "string" || !reason.trim())
      throw Error("Related reading groups require an explicit reviewed relationship")
    return group
  })
  if (groups.length)
    reviewedBriefingGroups(
      groups,
      projected.map((article) => ({
        id: article.event_id,
        sector: article.sector,
        review: article.article_review,
      })),
    )
  return { articles: projected, groups }
}
