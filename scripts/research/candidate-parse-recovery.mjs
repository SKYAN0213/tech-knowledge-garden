import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { articleContentFingerprint, loadStoredSourceRun } from "./parser.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"

const fields = [
  "article_source_version_id",
  "article_parse_id",
  "article_content_sha256",
  "article_observed_at",
]

// Parser recovery is separate from a changed publication or an editorial decision.
export function candidateParseRecovery(candidate, original, recovered) {
  if (
    candidate?.review_status !== "unreviewed" ||
    candidate.event_id ||
    candidate.approval ||
    candidate.editorial_approval_run ||
    candidate.identity ||
    candidate.disposition ||
    candidate.source_revision_alert ||
    candidate.publication ||
    candidate.source_urls?.length !== 1
  )
    throw Error("Unreviewed candidate without an editorial disposition required")
  const url = canonicalURL(candidate.source_urls[0])
  const match = (stored, parseId) => {
    const docs = stored.documents.filter((d) => canonicalURL(d.original_url) === url)
    if (docs.length !== 1) throw Error("One exact captured candidate source required")
    const doc = docs[0]
    const parses = stored.parses.filter(
      (p) => p.source_version_id === doc.source_version_id && (!parseId || p.parse_id === parseId),
    )
    if (
      parses.length !== 1 ||
      parses[0].status !== "extracted" ||
      parses[0].quality?.required_fields_present === false ||
      parses[0].quality?.missing_pages?.length ||
      !parses[0].blocks?.length ||
      !parses[0].blocks.some((b) => b.text?.trim())
    )
      throw Error("One complete original and recovered parse required")
    return { doc, parse: parses[0] }
  }
  const old = match(original, candidate.article_parse_id),
    next = match(recovered)
  if (
    candidate.article_source_version_id !== old.doc.source_version_id ||
    candidate.article_parse_id !== old.parse.parse_id ||
    candidate.article_content_sha256 !== articleContentFingerprint(old.parse) ||
    next.doc.source_version_id !== old.doc.source_version_id ||
    next.doc.body_sha256 !== old.doc.body_sha256 ||
    next.doc.observed_at !== old.doc.observed_at ||
    next.parse.parse_id === old.parse.parse_id ||
    next.parse.title !== old.parse.title ||
    !old.parse.dates?.published_at ||
    candidate.source_published_at !== old.parse.dates.published_at ||
    next.parse.dates?.published_at !== old.parse.dates.published_at
  )
    throw Error("Parse recovery must preserve the exact raw version, title and publication date")
  return {
    schema: "research-candidate-parse-recovery-input/v1",
    candidate_key: candidate.key,
    original_source: original.identity,
    recovered_source: recovered.identity,
    candidate_before: structuredClone(candidate),
    recovered_fields: {
      article_source_version_id: next.doc.source_version_id,
      article_parse_id: next.parse.parse_id,
      article_content_sha256: articleContentFingerprint(next.parse),
      article_observed_at: next.doc.observed_at,
    },
  }
}

export async function recoverCandidateParse({
  root,
  runId,
  sourceRunId,
  reparseRunId,
  candidateKey,
  backlogFile,
}) {
  if (
    ![runId, sourceRunId, reparseRunId].every((v) => /^[A-Za-z0-9_-]+$/.test(v || "")) ||
    new Set([runId, sourceRunId, reparseRunId]).size !== 3 ||
    !candidateKey ||
    !backlogFile
  )
    throw Error("Distinct recovery/source/reparse runs, candidate and explicit backlog required")
  return withGardenOperationLock(root, () =>
    withLock(root, "daily-acquisition", () =>
      withLock(root, "run-" + runId, () =>
        withLock(path.dirname(backlogFile), "candidate-backlog", async () => {
          const original = loadStoredSourceRun(root, sourceRunId, { allowUnacquired: true })
          const recovered = loadStoredSourceRun(root, reparseRunId)
          const backlog = JSON.parse(fs.readFileSync(backlogFile, "utf8"))
          if (backlog.schema !== "research-candidates/v1") throw Error("Candidate backlog required")
          const matches = backlog.candidates.filter((c) => c.key === candidateKey)
          if (matches.length !== 1) throw Error("One exact backlog candidate required")
          const current = matches[0],
            base = `runs/${runId}/`
          const pinned = readJSON(root, base + "parse-recovery-input.json")
          const input = candidateParseRecovery(
            pinned?.candidate_before || current,
            original,
            recovered,
          )
          if (input.candidate_key !== candidateKey)
            throw Error("Recovery belongs to another candidate")
          if (pinned && JSON.stringify(pinned) !== JSON.stringify(input))
            throw Error("Parse recovery input changed")
          const existing = readJSON(root, base + "candidate-parse-recovery.json")
          const receipt = {
            schema: "research-candidate-parse-recovery/v1",
            run_id: runId,
            candidate_key: candidateKey,
            input_sha256: sha256(JSON.stringify(input)),
            original_parse_id: input.candidate_before.article_parse_id,
            ...input.recovered_fields,
            raw_version_preserved: true,
            candidate_approved: false,
            candidate_published: false,
            model_calls: 0,
            source_requests: 0,
          }
          const atTarget = fields.every((f) => current[f] === input.recovered_fields[f])
          if (existing) {
            if (
              JSON.stringify(existing) !== JSON.stringify(receipt) ||
              !atTarget ||
              current.source_published_at !== input.candidate_before.source_published_at ||
              JSON.stringify(current.source_urls) !==
                JSON.stringify(input.candidate_before.source_urls)
            )
              throw Error("Recorded parse recovery or current candidate changed")
            return { ...existing, reused: true }
          }
          if (
            JSON.stringify(current) !== JSON.stringify(input.candidate_before) &&
            (!pinned ||
              JSON.stringify(current) !==
                JSON.stringify({ ...input.candidate_before, ...input.recovered_fields }))
          )
            throw Error("Candidate changed during parse recovery")
          if (!pinned) atomicCreate(root, base + "parse-recovery-input.json", input)
          // Keep observation merging strict: this repairs a parse of the same
          // response, so it must not invent a newer HTTP observation timestamp.
          if (!atTarget) {
            Object.assign(current, input.recovered_fields)
            backlog.updated_at = new Date().toISOString()
            atomicWrite(path.dirname(backlogFile), path.basename(backlogFile), backlog)
          }
          const after = JSON.parse(fs.readFileSync(backlogFile, "utf8"))
          const updated = after.candidates.find((c) => c.key === candidateKey)
          if (
            updated?.review_status !== "unreviewed" ||
            !fields.every((f) => updated[f] === input.recovered_fields[f]) ||
            JSON.stringify(backlog.candidates.filter((c) => c.key !== candidateKey)) !==
              JSON.stringify(after.candidates.filter((c) => c.key !== candidateKey))
          )
            throw Error("Recovery changed another candidate or an editorial status")
          atomicCreate(root, base + "candidate-parse-recovery.json", receipt)
          return { ...receipt, reused: false }
        }),
      ),
    ),
  )
}
