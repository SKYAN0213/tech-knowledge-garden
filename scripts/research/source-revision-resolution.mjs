import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate, samePublicationDate } from "./dates.mjs"
import { loadApprovedOntologyInput } from "./ontology.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const hash = (value) => sha256(JSON.stringify(value))
const validRun = (id) => /^[A-Za-z0-9_-]+$/.test(id || "")

// Resolve an explicitly reviewed source revision. This cannot publish or
// fabricate a new approval: both article revisions pass the existing loader.
export async function resolveSourceRevision({ root, runId, backlogFile, reviewPath }) {
  if (!validRun(runId)) throw Error("Explicit resolution run required")
  const reviewBytes = fs.readFileSync(safePath(root, reviewPath))
  const review = JSON.parse(reviewBytes)
  if (
    review.schema !== "research-source-revision-resolution-review/v1" ||
    !["restore_primary", "replace_approval"].includes(review.action) ||
    !validRun(review.prior_approved_run) ||
    !validRun(review.current_source_run) ||
    !validRun(review.candidate_key) ||
    !review.reviewer?.trim() ||
    !review.reason?.trim() ||
    [
      "source_read",
      "revision_read",
      "identity_checked",
      "dates_checked",
      "numbers_checked",
      "dependencies_checked",
    ].some((k) => review[k] !== true) ||
    review.new_article !== false ||
    review.candidate_published !== false ||
    !/^[a-f0-9]{64}$/.test(review.expected_candidate_sha256 || "") ||
    [review.prior_approved_run, review.current_source_run, review.new_approved_run].includes(runId)
  )
    throw Error("Complete source revision resolution review required")
  return withLock(root, "run-" + runId, () =>
    withLock(path.dirname(backlogFile), "candidate-backlog", async () => {
      const bytes = fs.readFileSync(backlogFile),
        backlog = JSON.parse(bytes)
      if (backlog.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
        throw Error("Candidate backlog required")
      const matches = backlog.candidates.filter((c) => c.key === review.candidate_key)
      if (matches.length !== 1) throw Error("One exact revision candidate required")
      const candidate = matches[0],
        receiptPath = `runs/${runId}/source-revision-resolution.json`
      const previous = readJSON(root, receiptPath)
      if (previous) {
        const { receipt_sha256, ...body } = previous
        if (hash(body) !== receipt_sha256) throw Error("Resolution receipt hash mismatch")
      }
      if (previous && previous.review_sha256 !== sha256(reviewBytes))
        throw Error("Resolution review changed; use a new run")
      if (previous && hash(candidate) === previous.after_candidate_sha256) {
        if (previous.publication_precision) {
          const bound = previous.publication_precision
          if (
            hash(readJSON(root, `runs/${bound.run}/publication-time-revision.json`)) !==
              bound.manifest_sha256 ||
            hash(loadStoredSourceRun(root, bound.source_identity.source_run).identity) !==
              hash(bound.source_identity)
          )
            throw Error("Resolved publication precision lineage changed")
        }
        for (const input of previous.approved_inputs)
          if (
            JSON.stringify(loadApprovedOntologyInput(root, input.run).file_hashes) !==
            JSON.stringify(input.files)
          )
            throw Error("Resolved approval evidence changed")
        const observed = loadStoredSourceRun(root, review.current_source_run)
        if (hash(observed.identity) !== previous.current_source_identity_sha256)
          throw Error("Resolved source observation changed")
        return {
          path: receiptPath,
          reused: true,
          event_id: candidate.event_id,
          candidate_published: false,
        }
      }
      if (
        hash(candidate) !== review.expected_candidate_sha256 ||
        candidate.approval?.approved_run !== review.prior_approved_run
      )
        throw Error("Revision candidate changed before resolution")
      const old = loadApprovedOntologyInput(root, review.prior_approved_run)
      if (
        old.article.event_id !== candidate.event_id ||
        hash(old.article) !== candidate.approval.article_sha256
      )
        throw Error("Prior approval does not match the candidate")
      const current = loadStoredSourceRun(root, review.current_source_run)
      const observedDoc = current.documents.find(
        (d) => d.source_version_id === candidate.article_source_version_id,
      )
      const observedParse = current.parses.find(
        (p) =>
          p.parse_id === candidate.article_parse_id &&
          p.source_version_id === candidate.article_source_version_id,
      )
      if (
        !observedDoc ||
        !observedParse ||
        articleContentFingerprint(observedParse) !== candidate.article_content_sha256
      )
        throw Error("Current source does not match the revision candidate")
      const before = structuredClone(candidate),
        next = structuredClone(candidate)
      const inputs = [old]
      let publicationPrecision = null
      if (review.action === "restore_primary") {
        if (review.publication_time_revision_run)
          throw Error("Publication precision upgrade requires a replacement approval")
        if (review.new_approved_run) throw Error("Primary restoration cannot replace approval")
        const primaryDoc = old.documents.find(
          (d) => d.source_version_id === candidate.approval.source_version_id,
        )
        const primaryParse = old.parses.find(
          (p) =>
            p.parse_id === candidate.approval.parse_id &&
            p.source_version_id === primaryDoc?.source_version_id,
        )
        const alias = candidate.source_record_aliases?.find(
          (a) => canonicalURL(a.source_url) === canonicalURL(observedDoc.original_url),
        )
        if (
          !primaryDoc ||
          !primaryParse ||
          !alias ||
          primaryDoc.source_id === observedDoc.source_id ||
          candidate.source_urls?.length !== 1 ||
          canonicalURL(primaryDoc.original_url) !== canonicalURL(candidate.source_urls[0]) ||
          articleContentFingerprint(primaryParse) !== candidate.approval.article_content_sha256 ||
          !candidate.discovery?.some(
            (d) =>
              d.publisher_id === alias.publisher_id &&
              d.profile_id === alias.profile_id &&
              d.source_item_id === alias.source_item_id,
          ) ||
          !samePublicationDate(primaryParse.dates.published_at, observedParse.dates.published_at)
        )
          throw Error(
            "Primary restoration requires an exact approved source and explicit publisher record alias",
          )
        next.source_observation_history = [
          ...(next.source_observation_history || []),
          {
            source_version_id: before.article_source_version_id,
            parse_id: before.article_parse_id,
            article_content_sha256: before.article_content_sha256,
            observed_at: before.article_observed_at,
            resolution_run: runId,
          },
        ]
        next.related_source_observations = [
          ...(next.related_source_observations || []),
          {
            source_url: observedDoc.original_url,
            article_source_version_id: observedDoc.source_version_id,
            article_parse_id: observedParse.parse_id,
            article_content_sha256: before.article_content_sha256,
            observed_at: observedDoc.observed_at,
            decision: "reviewed_publisher_record_alias",
            resolution_run: runId,
          },
        ]
        next.article_source_version_id = primaryDoc.source_version_id
        next.article_parse_id = primaryParse.parse_id
        next.article_content_sha256 = articleContentFingerprint(primaryParse)
        next.article_observed_at = primaryDoc.observed_at
      } else {
        if (
          !validRun(review.new_approved_run) ||
          review.new_approved_run === review.prior_approved_run
        )
          throw Error("Distinct new reviewed approval required")
        const revised = loadApprovedOntologyInput(root, review.new_approved_run)
        inputs.push(revised)
        const doc = revised.documents.find(
          (d) => d.source_version_id === candidate.article_source_version_id,
        )
        const parse = revised.parses.find(
          (p) =>
            p.parse_id === candidate.article_parse_id &&
            p.source_version_id === doc?.source_version_id,
        )
        if (
          !doc ||
          !parse ||
          candidate.source_urls?.length !== 1 ||
          canonicalURL(doc.original_url) !== canonicalURL(candidate.source_urls[0]) ||
          articleContentFingerprint(parse) !== candidate.article_content_sha256 ||
          revised.article.event_id !== old.article.event_id ||
          !samePublicationDate(
            revised.article.article_review.published_at,
            old.article.article_review.published_at,
          ) ||
          !samePublicationDate(
            revised.article.article_review.published_at,
            candidate.source_published_at,
          ) ||
          JSON.stringify(revised.article.source_urls.map(canonicalURL).sort()) !==
            JSON.stringify(old.article.source_urls.map(canonicalURL).sort())
        )
          throw Error(
            "Revised approval must preserve the event, publication date and exact source URLs",
          )
        assertReviewDate(revised.article.article_review.reviewed_at, {
          notBefore: current.documents.map((d) => d.observed_at),
        })
        let approvedParse = parse
        if (review.publication_time_revision_run) {
          const precision = readJSON(root, `runs/${revised.run}/publication-time-revision.json`)
          const basis = readJSON(
            root,
            `runs/${revised.run}/editorial-review.json`,
          )?.event_date_basis
          const precise = revised.parses.find((p) => p.parse_id === basis?.parse_id)
          if (
            review.publication_time_revision_run !== revised.run ||
            precision?.schema !== "research-publication-time-revision/v1" ||
            precision.prior_run !== old.run ||
            JSON.stringify(precision.prior_files) !== JSON.stringify(old.file_hashes) ||
            basis?.kind !== "source-publication-time" ||
            !precise ||
            precise.source_version_id !== parse.source_version_id ||
            precise.title !== parse.title ||
            JSON.stringify(precise.blocks.map((b) => ({ ...b, block_id: null }))) !==
              JSON.stringify(parse.blocks.map((b) => ({ ...b, block_id: null }))) ||
            precise.dates?.published_at !== revised.article.article_review.source_published_at ||
            !samePublicationDate(candidate.source_published_at, precise.dates.published_at)
          )
            throw Error(
              "Publication precision replacement needs its reviewed unchanged-source lineage",
            )
          const precisionSource = loadStoredSourceRun(root, precision.source_identity?.source_run)
          if (
            hash(precisionSource.identity) !== hash(precision.source_identity) ||
            !precisionSource.parses.some((p) => JSON.stringify(p) === JSON.stringify(precise))
          )
            throw Error("Publication precision source changed")
          approvedParse = precise
          publicationPrecision = {
            run: revised.run,
            manifest_sha256: hash(precision),
            source_identity: precision.source_identity,
          }
          next.source_published_at = precise.dates.published_at
          next.article_parse_id = precise.parse_id
          next.article_content_sha256 = articleContentFingerprint(precise)
          next.article_observed_at = doc.observed_at
        }
        next.approval_history = [
          ...(next.approval_history || []),
          {
            approval: candidate.approval,
            review_status: candidate.review_status,
            source_revision_alert: candidate.source_revision_alert || null,
            reviewed_at: candidate.reviewed_at || null,
            resolution_run: runId,
          },
        ]
        next.approval = {
          approved_run: revised.run,
          article_sha256: hash(revised.article),
          source_version_id: doc.source_version_id,
          parse_id: approvedParse.parse_id,
          article_content_sha256: articleContentFingerprint(approvedParse),
          revision_resolution_run: runId,
        }
      }
      assertReviewDate(review.reviewed_at, {
        notBefore: [...current.documents.map((d) => d.observed_at), candidate.source_published_at],
      })
      next.review_status = "verified"
      next.reviewed_at = review.reviewed_at
      next.source_revision_resolutions = [
        ...(next.source_revision_resolutions || []),
        {
          run_id: runId,
          action: review.action,
          reviewer: review.reviewer,
          reviewed_at: review.reviewed_at,
          review_sha256: sha256(reviewBytes),
        },
      ]
      delete next.source_revision_alert
      delete next.reason
      const receipt = {
        schema: "research-source-revision-resolution/v1",
        ...(publicationPrecision ? { publication_precision: publicationPrecision } : {}),
        review_sha256: sha256(reviewBytes),
        review_path: reviewPath,
        action: review.action,
        event_id: candidate.event_id,
        candidate_key: candidate.key,
        before_candidate_sha256: hash(before),
        after_candidate_sha256: hash(next),
        before,
        after: next,
        backlog_sha256: sha256(bytes),
        current_source_identity_sha256: hash(current.identity),
        approved_inputs: inputs.map((i) => ({ run: i.run, files: i.file_hashes })),
        candidate_published: false,
        new_article: false,
      }
      receipt.receipt_sha256 = hash(receipt)
      for (const input of inputs)
        if (
          JSON.stringify(loadApprovedOntologyInput(root, input.run).file_hashes) !==
          JSON.stringify(input.file_hashes)
        )
          throw Error("Approval changed during revision resolution")
      if (previous && JSON.stringify(previous) !== JSON.stringify(receipt))
        throw Error("Resolution receipt changed; use a new run")
      if (!previous) atomicCreate(root, receiptPath, receipt)
      backlog.candidates[backlog.candidates.indexOf(candidate)] = next
      backlog.updated_at = new Date().toISOString()
      atomicWrite(path.dirname(backlogFile), path.basename(backlogFile), backlog)
      return {
        path: receiptPath,
        reused: false,
        event_id: next.event_id,
        candidate_published: false,
      }
    }),
  )
}
