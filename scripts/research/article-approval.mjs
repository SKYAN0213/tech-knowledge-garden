import { atomicCreate, readJSON } from "./run-state.mjs"
import { sha256 } from "./contracts.mjs"

function sameJSON(left, right) {
  return sha256(JSON.stringify(left)) === sha256(JSON.stringify(right))
}

// Store the reviewed decision and its exact approved projection as an immutable
// checkpoint. A changed review must use a new run so previews retain their lineage.
export function recordArticleApproval(root, runId, decision, article) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw Error("Invalid run id")
  if (
    !decision ||
    typeof decision !== "object" ||
    !article ||
    typeof article !== "object" ||
    article.article_review?.review_status !== "verified"
  )
    throw Error("Verified article and exact editorial decision required")

  const decisionPath = `runs/${runId}/editorial-review.json`
  const articlePath = `runs/${runId}/approved-article.json`
  const existingDecision = readJSON(root, decisionPath)
  const existingArticle = readJSON(root, articlePath)
  if (existingDecision || existingArticle) {
    if (!existingDecision || !existingArticle)
      throw Error("Incomplete editorial approval checkpoint; preserve it and use a new run")
    if (!sameJSON(existingDecision, decision) || !sameJSON(existingArticle, article))
      throw Error("Editorial approval is immutable; use a new run")
    return { event_id: article.event_id, status: "approved", reused: true }
  }

  // Create-only writes refuse to replace files that appeared after the read.
  atomicCreate(root, decisionPath, decision)
  atomicCreate(root, articlePath, article)
  return { event_id: article.event_id, status: "approved", reused: false }
}
