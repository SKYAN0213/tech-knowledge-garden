export const ARTICLE_SEMANTIC_INDEX_SCHEMA = "article-semantic-review-index/v1"
export const ARTICLE_SEMANTIC_REVIEW_SCHEMA = "research-article-semantic-review/v2"
export const articleRelationRoles = [
  "topic",
  "application",
  "comparison_evaluation",
  "context_background",
]

const hash = (value) => /^[a-f0-9]{64}$/.test(value || "")
const eventId = (value) => /^[a-f0-9]{16}$/.test(value || "")
const conceptId = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || "")
const exactKeys = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000")

export function articlePublicFingerprint({ event_id, title, published_at, source_urls, prose }) {
  if (
    !eventId(event_id) ||
    typeof title !== "string" ||
    !title.trim() ||
    typeof published_at !== "string" ||
    !Array.isArray(source_urls) ||
    source_urls.some((url) => typeof url !== "string" || !/^https?:\/\//.test(url)) ||
    typeof prose !== "string"
  )
    throw Error("Exact public article identity required for semantic review")
  return JSON.stringify({
    event_id,
    title,
    published_at,
    source_urls: [...new Set(source_urls)].sort(),
    prose: prose.normalize("NFC").replace(/\s+/g, " ").trim(),
  })
}

export function assertArticleSemanticReviewIndex(index) {
  if (
    !exactKeys(index, ["schema", "reviews"]) ||
    index.schema !== ARTICLE_SEMANTIC_INDEX_SCHEMA ||
    !Array.isArray(index.reviews)
  )
    throw Error("Valid article semantic review index required")
  const events = new Set()
  for (const review of index.reviews) {
    if (
      !exactKeys(review, [
        "event_id",
        "status",
        "reviewed_at",
        "workflow_id",
        "approved_run",
        "semantic_input_sha256",
        "executor",
        "model",
        "task_id",
        "request_sha256",
        "result_sha256",
        "receipt_sha256",
        "article_public_sha256",
        "approval_files_sha256",
        "concept_registry_sha256",
        "policy_sha256",
        "links",
      ]) ||
      !eventId(review.event_id) ||
      events.has(review.event_id) ||
      !["reviewed_links", "reviewed_none"].includes(review.status) ||
      typeof review.reviewed_at !== "string" ||
      !Number.isFinite(Date.parse(review.reviewed_at)) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(review.workflow_id || "") ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(review.approved_run || "") ||
      !hash(review.semantic_input_sha256) ||
      review.executor !== "codex" ||
      review.model !== "gpt-6-luna" ||
      !/^reasoning-[a-f0-9]{64}$/.test(review.task_id || "") ||
      ![
        review.request_sha256,
        review.result_sha256,
        review.receipt_sha256,
        review.article_public_sha256,
        review.approval_files_sha256,
        review.concept_registry_sha256,
        review.policy_sha256,
      ].every(hash) ||
      !Array.isArray(review.links) ||
      (review.status === "reviewed_links" && !review.links.length) ||
      (review.status === "reviewed_none" && review.links.length)
    )
      throw Error("Invalid or duplicated article semantic review record")
    events.add(review.event_id)
    const concepts = new Set()
    for (const link of review.links) {
      if (
        !exactKeys(link, [
          "concept_id",
          "role",
          "reason",
          "evidence_claim_ids",
          "concept_path",
          "concept_sha256",
        ]) ||
        !conceptId(link.concept_id) ||
        concepts.has(link.concept_id) ||
        !articleRelationRoles.includes(link.role) ||
        typeof link.reason !== "string" ||
        link.reason.trim().length < 10 ||
        !Array.isArray(link.evidence_claim_ids) ||
        !link.evidence_claim_ids.length ||
        link.evidence_claim_ids.some((id) => typeof id !== "string" || !id.trim()) ||
        new Set(link.evidence_claim_ids).size !== link.evidence_claim_ids.length ||
        typeof link.concept_path !== "string" ||
        !/^Knowledge\/.+\.md$/.test(link.concept_path) ||
        link.concept_path.split("/").some((part) => !part || part === "." || part === "..") ||
        !hash(link.concept_sha256)
      )
        throw Error("Invalid article semantic concept relation")
      concepts.add(link.concept_id)
    }
  }
  return index
}
