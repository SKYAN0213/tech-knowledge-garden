import fs from "node:fs"
import path from "node:path"
import { BACKLOG_PATH } from "../research-window.mjs"
import { canonicalURL } from "../garden.mjs"
import { loadStoredSourceRun, articleContentFingerprint, selectStoredSources } from "./parser.mjs"
import { mergeBacklog } from "./discovery.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { parseResearchDate } from "./dates.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const runId = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(s)
const readBacklog = (file) => readJSON(path.dirname(file), path.basename(file))

// Discovery is the actual captured article/image relationship, not a fabricated
// search result. Intake never approves facts, events or public publication.
export function prepareArticleImageIntake(root, sourceRun) {
  if (!runId(sourceRun)) throw Error("Exact article image source run required")
  const source = loadStoredSourceRun(root, sourceRun)
  const binding = readJSON(root, `runs/${sourceRun}/article-image-source.json`)
  if (
    binding?.schema !== "research-article-image-source/v1" ||
    binding.source_document_complete !== true
  )
    throw Error("Native whole-article body image binding required for intake")
  const metadata = source.parses.filter((p) => p.parser?.id === "article-image-metadata")
  if (metadata.length !== 1 || !parseResearchDate(metadata[0].dates?.published_at))
    throw Error("One exact original article title and publication date required")
  const parse = metadata[0],
    document = source.documents.find((d) => d.source_version_id === parse.source_version_id),
    url = canonicalURL(document.original_url),
    fingerprint = articleContentFingerprint(parse, source.parses)
  const fields = {
    key: `source-${sourceId(url)}`,
    title: parse.title,
    source_urls: [url],
    source_published_at: parse.dates.published_at,
    article_source_version_id: document.source_version_id,
    article_parse_id: parse.parse_id,
    article_observed_at: document.observed_at,
    article_content_sha256: fingerprint,
  }
  return {
    source,
    binding,
    fields,
    input: {
      source_identity: source.identity,
      binding_sha256: sha256(
        fs.readFileSync(safePath(root, `runs/${sourceRun}/article-image-source.json`)),
      ),
      candidate: fields,
    },
  }
}

export async function intakeArticleImageCandidate({
  root,
  run,
  sourceRun,
  backlogFile = BACKLOG_PATH,
}) {
  if (!runId(run) || run === sourceRun) throw Error("Distinct native intake run required")
  return withLock(root, `run-${run}`, async () => {
    const prepared = prepareArticleImageIntake(root, sourceRun),
      file = `runs/${run}/article-image-intake.json`,
      oldReceipt = readJSON(root, file),
      backlog = readBacklog(backlogFile)
    const matches = (backlog?.candidates || []).filter(
      (c) =>
        c.key === prepared.fields.key ||
        c.source_urls.some((u) => canonicalURL(u) === prepared.fields.source_urls[0]),
    )
    if (matches.length > 1) throw Error("Article URL branches across existing candidates")
    const old = matches[0]
    if (
      old &&
      Object.entries(prepared.fields).some(([k, v]) => old[k] !== undefined && !same(old[k], v))
    )
      throw Error("Article intake conflicts with existing exact source; reconcile first")
    if (oldReceipt) {
      if (
        oldReceipt.schema !== "research-article-image-intake/v1" ||
        !same(oldReceipt.input, prepared.input) ||
        oldReceipt.candidate_key !== prepared.fields.key ||
        oldReceipt.status !== "source_verified_unreviewed" ||
        oldReceipt.candidate_approved !== false ||
        oldReceipt.candidate_published !== false ||
        !old ||
        Object.entries(prepared.fields).some(([k, v]) => !same(old[k], v))
      )
        throw Error("Article intake receipt or candidate changed")
      return { ...oldReceipt, reused: true, backlog_changed: false }
    }
    // Replaying the original intake is read-only after an explicit review.
    // A different intake must use the existing event reconciliation instead.
    if (old && old.review_status !== "unreviewed")
      throw Error("Reviewed article requires existing event reconciliation")
    const candidate = {
      ...prepared.fields,
      review_status: "unreviewed",
      discovered_at: prepared.fields.article_observed_at,
      priority: "normal",
      discovery: [
        {
          method: "article-image-source-intake",
          source_run: sourceRun,
          original_source_run: prepared.binding.original_source.source_run,
          source_version_id: prepared.fields.article_source_version_id,
          parse_id: prepared.fields.article_parse_id,
          discovered_at: prepared.fields.article_observed_at,
        },
      ],
    }
    const merged = await mergeBacklog(backlogFile, [candidate])
    const current = readBacklog(backlogFile)?.candidates.find((c) => c.key === candidate.key)
    if (
      !current ||
      current.review_status !== "unreviewed" ||
      Object.entries(prepared.fields).some(([k, v]) => !same(current[k], v))
    )
      throw Error("Backlog changed before article intake acceptance")
    const receipt = {
      schema: "research-article-image-intake/v1",
      input: prepared.input,
      status: "source_verified_unreviewed",
      candidate_key: candidate.key,
      backlog_sha256: merged.sha256,
      backlog_changed: merged.changed,
      candidate_approved: false,
      candidate_published: false,
    }
    atomicCreate(root, file, receipt)
    return { ...receipt, reused: false }
  })
}

export function selectIntakenArticleImageCandidate({
  root,
  intakeRun,
  sourceRun,
  backlogFile = BACKLOG_PATH,
  allowReviewed = false,
}) {
  if (!runId(intakeRun) || intakeRun === sourceRun)
    throw Error("Exact native intake receipt required")
  const receipt = readJSON(root, `runs/${intakeRun}/article-image-intake.json`),
    prepared = prepareArticleImageIntake(root, sourceRun),
    matches = (readBacklog(backlogFile)?.candidates || []).filter(
      (c) => c.key === prepared.fields.key,
    )
  if (
    receipt?.schema !== "research-article-image-intake/v1" ||
    receipt.status !== "source_verified_unreviewed" ||
    receipt.candidate_key !== prepared.fields.key ||
    receipt.candidate_approved !== false ||
    receipt.candidate_published !== false ||
    !same(receipt.input, prepared.input) ||
    matches.length !== 1 ||
    (!allowReviewed && matches[0].review_status !== "unreviewed") ||
    Object.entries(prepared.fields).some(([k, v]) => !same(matches[0][k], v))
  )
    throw Error("Exact unreviewed native article intake required before processing")
  return {
    candidate: matches[0],
    selected: selectStoredSources(root, sourceRun, prepared.fields.source_urls),
  }
}
