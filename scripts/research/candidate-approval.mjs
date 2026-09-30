import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { BACKLOG_PATH } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { samePublicationDate } from "./dates.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { approvedArticle } from "./publish-adapter.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

// Link an already reviewed private article to its discovery candidate. This
// never creates an edition, changes its cutoff, or marks the article published.
export async function recordCandidateApproval({
  root,
  runId,
  approvedRunId,
  candidateKey,
  backlogFile = BACKLOG_PATH,
  publishedArticles = [],
}) {
  if (
    !/^[a-zA-Z0-9_-]+$/.test(runId || "") ||
    !/^[a-zA-Z0-9_-]+$/.test(approvedRunId || "") ||
    runId === approvedRunId ||
    !/^[a-zA-Z0-9_-]+$/.test(candidateKey || "") ||
    !Array.isArray(publishedArticles)
  )
    throw Error("Distinct approval link run, reviewed article run and candidate key required")

  return withLock(root, "run-" + approvedRunId, () =>
    linkCandidateApproval({
      root,
      runId,
      approvedRunId,
      candidateKey,
      backlogFile,
      publishedArticles,
    }),
  )
}

async function linkCandidateApproval({
  root,
  runId,
  approvedRunId,
  candidateKey,
  backlogFile,
  publishedArticles,
}) {
  const { documents, parses } = loadStoredSourceRun(root, approvedRunId)
  const draft = readJSON(root, `runs/${approvedRunId}/draft.json`)
  const reviewed = readJSON(root, `runs/${approvedRunId}/reviewed-claims.json`)
  const decision = readJSON(root, `runs/${approvedRunId}/editorial-review.json`)
  const storedArticle = readJSON(root, `runs/${approvedRunId}/approved-article.json`)
  if (!draft || !reviewed || !decision || !storedArticle)
    throw Error("Complete private fact and editorial approval required")
  const article = approvedArticle(draft, reviewed.claims, documents, decision, parses)
  if (sha256(JSON.stringify(article)) !== sha256(JSON.stringify(storedArticle)))
    throw Error("Stored approved article differs from its reviewed source and draft")
  if (article.article_review?.review_status !== "verified")
    throw Error("Only verified articles can close a discovery candidate")

  const receiptPath = `runs/${runId}/candidate-approval.json`
  return withLock(root, "run-" + runId, async () => {
    const backlogRoot = path.dirname(backlogFile)
    const backlogName = path.basename(backlogFile)
    return withLock(backlogRoot, "candidate-backlog", async () => {
      const backlog = readJSON(backlogRoot, backlogName)
      if (backlog?.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
        throw Error("Existing candidate backlog required")
      const matches = backlog.candidates.filter((item) => item.key === candidateKey)
      if (matches.length !== 1) throw Error("One exact discovery candidate required")
      const candidate = matches[0]
      if (candidate.source_urls?.length !== 1 || !candidate.source_published_at)
        throw Error("Dated candidate with one original URL required")
      const url = canonicalURL(candidate.source_urls[0])
      const matchedDocuments = documents.filter(
        (document) => canonicalURL(document.original_url) === url,
      )
      if (matchedDocuments.length !== 1) throw Error("Approved run lacks the candidate source")
      const document = matchedDocuments[0]
      const parse = parses.find((item) => item.source_version_id === document.source_version_id)
      if (!parse || parse.status !== "extracted")
        throw Error("Approved candidate needs its exact extracted parse")
      const contentSha = articleContentFingerprint(parse)
      if (
        !article.source_urls.some((sourceURL) => canonicalURL(sourceURL) === url) ||
        !samePublicationDate(candidate.source_published_at, article.article_review.published_at) ||
        candidate.article_source_version_id !== document.source_version_id ||
        candidate.article_parse_id !== parse.parse_id ||
        candidate.article_content_sha256 !== contentSha
      )
        throw Error("Candidate and approved article differ in URL, date or source version")
      if (
        publishedArticles.some((existing) =>
          existing.source_urls?.some((sourceURL) => canonicalURL(sourceURL) === url),
        ) ||
        backlog.candidates.some(
          (other) => other.key !== candidateKey && other.event_id === article.event_id,
        )
      )
        throw Error("Candidate source already appears in an edition or event belongs elsewhere")

      const receipt = {
        schema: "research-candidate-approval/v1",
        candidate_key: candidateKey,
        event_id: article.event_id,
        approved_run: approvedRunId,
        article_sha256: sha256(JSON.stringify(article)),
        source_version_id: document.source_version_id,
        parse_id: parse.parse_id,
        article_content_sha256: contentSha,
        candidate_published: false,
      }
      const previous = readJSON(root, receiptPath)
      if (previous && JSON.stringify(previous) !== JSON.stringify(receipt))
        throw Error("Candidate approval link changed; use a new run ID")
      if (candidate.approval) {
        if (
          candidate.review_status !== "verified" ||
          candidate.event_id !== article.event_id ||
          JSON.stringify(candidate.approval) !==
            JSON.stringify({
              approved_run: approvedRunId,
              article_sha256: receipt.article_sha256,
              source_version_id: document.source_version_id,
              parse_id: parse.parse_id,
              article_content_sha256: contentSha,
            })
        )
          throw Error("Candidate has a different editorial approval")
      } else {
        if (
          !["unreviewed", "deferred"].includes(candidate.review_status) ||
          candidate.event_id ||
          candidate.identity ||
          candidate.disposition ||
          candidate.source_revision_alert
        )
          throw Error("Candidate already has another editorial disposition")
        candidate.review_status = "verified"
        candidate.event_id = article.event_id
        candidate.reviewed_at = article.article_review.reviewed_at
        candidate.approval = {
          approved_run: approvedRunId,
          article_sha256: receipt.article_sha256,
          source_version_id: document.source_version_id,
          parse_id: parse.parse_id,
          article_content_sha256: contentSha,
        }
        delete candidate.reason
        backlog.updated_at = new Date().toISOString()
        atomicWrite(backlogRoot, backlogName, backlog)
      }
      if (!previous) atomicWrite(root, receiptPath, receipt)
      return {
        candidate_key: candidateKey,
        event_id: article.event_id,
        review_status: "verified",
        backlog_sha256: sha256(JSON.stringify(backlog)),
        receipt: safePath(root, receiptPath),
        candidate_published: false,
      }
    })
  })
}
