import fs from "node:fs"
import path from "node:path"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { generateDailyHandoff } from "./editorial-handoff.mjs"
import { loadCurrentApproval, privatePreview } from "./preview.mjs"
import {
  atomicCreate,
  readJSON,
  safePath,
  RunState,
  withLock,
  withGardenOperationLock,
} from "./run-state.mjs"

// Selection is explicit. This does not approve candidates or certify daily coverage.
export function selectEditionApprovals({
  handoff,
  backlog,
  decision,
  approvals,
  alternatives = new Map(),
}) {
  if (
    handoff?.schema !== "research-editorial-handoff/v1" ||
    backlog?.schema !== "research-candidates/v1" ||
    decision?.schema !== "research-edition-preparation/v1" ||
    Object.keys(decision).some(
      (k) => !["schema", "candidate_keys", "knowledge_runs", "edition_spec"].includes(k),
    ) ||
    !Array.isArray(decision.candidate_keys) ||
    !decision.candidate_keys.length ||
    decision.candidate_keys.length > 40 ||
    new Set(decision.candidate_keys).size !== decision.candidate_keys.length ||
    !Array.isArray(decision.knowledge_runs) ||
    new Set(decision.knowledge_runs).size !== decision.knowledge_runs.length ||
    decision.edition_spec?.schema !== "research-private-edition/v1" ||
    decision.edition_spec.intent !== "private_slice" ||
    decision.edition_spec.coverage_start !== handoff.publication_after
  )
    throw Error(
      "Explicit unique candidate selection and matching private edition interval required",
    )
  const selected = decision.candidate_keys.map((key) => {
    const entries = handoff.pending.filter((entry) => entry.key === key)
    const candidates = backlog.candidates.filter((candidate) => candidate.key === key)
    if (entries.length !== 1 || candidates.length !== 1)
      throw Error("Selected candidate is absent or ambiguous: " + key)
    const [entry] = entries,
      [candidate] = candidates
    const approval = approvals.get(candidate.approval?.approved_run)
    if (
      entry.next_route !== "approved-unpublished" ||
      candidate.review_status !== "verified" ||
      entry.source_revision_alert ||
      candidate.source_revision_alert ||
      entry.publication ||
      entry.possible_publications?.length ||
      entry.primary_candidate_key ||
      !approval ||
      entry.event_id !== candidate.event_id ||
      candidate.event_id !== approval.article.event_id ||
      entry.approval?.approved_run !== candidate.approval.approved_run ||
      entry.approval?.article_sha256 !== candidate.approval.article_sha256 ||
      candidate.approval.article_sha256 !== sha256(JSON.stringify(approval.article)) ||
      ["article_source_version_id", "article_parse_id", "article_content_sha256"].some(
        (field) => entry[field] !== (candidate[field] || null),
      )
    )
      throw Error("Selected candidate lacks its current unpublished approval: " + key)
    const alternate = candidate.approval.source_alternative_resolution_run
    if (alternate) {
      const pinned = alternatives.get(alternate),
        resolution = pinned?.value
      if (
        pinned?.sha256 !== candidate.approval.source_alternative_resolution_sha256 ||
        resolution?.schema !== "research-candidate-source-alternative-resolution/v1" ||
        resolution.decision !== "same_event" ||
        resolution.candidate_key !== key ||
        canonicalURL(resolution.original_source?.url) !== canonicalURL(candidate.source_urls[0]) ||
        resolution.alternative_source?.url !== candidate.approval.source_url ||
        resolution.alternative_source.source_version_id !== candidate.approval.source_version_id ||
        resolution.alternative_source.parse_id !== candidate.approval.parse_id ||
        resolution.alternative_source.content_sha256 !== candidate.approval.article_content_sha256
      )
        throw Error("Selected alternate source lacks its pinned identity review: " + key)
    }
    if (
      !alternate &&
      (!candidate.article_source_version_id ||
        !candidate.article_parse_id ||
        !candidate.article_content_sha256 ||
        candidate.approval.source_version_id !== candidate.article_source_version_id ||
        candidate.approval.parse_id !== candidate.article_parse_id ||
        candidate.approval.article_content_sha256 !== candidate.article_content_sha256)
    )
      throw Error("Selected candidate source changed after approval: " + key)
    if (
      !approval.article.source_urls.some(
        (url) =>
          canonicalURL(url) ===
          canonicalURL(candidate.approval.source_url || candidate.source_urls[0]),
      )
    )
      throw Error("Selected candidate and approved article source differ: " + key)
    return {
      candidate_key: key,
      event_id: candidate.event_id,
      approved_run: approval.run,
      article_sha256: candidate.approval.article_sha256,
      source_version_id: candidate.approval.source_version_id,
      parse_id: candidate.approval.parse_id,
      content_sha256: candidate.approval.article_content_sha256,
    }
  })
  if (
    new Set(selected.map((item) => item.event_id)).size !== selected.length ||
    new Set(selected.map((item) => item.approved_run)).size !== selected.length
  )
    throw Error("Multiple selected candidates belong to the same approved event")
  return selected
}

export async function prepareDailyEdition({
  root,
  runId,
  dailyRunId,
  reviewPath,
  vault = "vault",
  backlogFile = ".local/research/candidate-backlog.json",
  repo = process.cwd(),
}) {
  if (![runId, dailyRunId].every((id) => /^[A-Za-z0-9_-]+$/.test(id || "")) || runId === dailyRunId)
    throw Error("Distinct preparation and daily run IDs required")
  return withGardenOperationLock(root, () =>
    withLock(root, "run-" + runId, async () => {
      const reviewBytes = fs.readFileSync(reviewPath)
      const decision = JSON.parse(reviewBytes)
      const handoffRef = await withLock(root, "daily-acquisition", () =>
        generateDailyHandoff({ root, runId: dailyRunId, vault, backlogFile }),
      )
      const handoffBytes = fs.readFileSync(safePath(root, handoffRef.path))
      const handoff = JSON.parse(handoffBytes)
      const backlogBytes = fs.readFileSync(backlogFile),
        backlog = JSON.parse(backlogBytes)
      const requested = new Set(
        Array.isArray(decision.candidate_keys) ? decision.candidate_keys : [],
      )
      const runs = [
        ...new Set(
          backlog.candidates
            .filter((c) => requested.has(c.key))
            .map((c) => c.approval?.approved_run)
            .filter(Boolean),
        ),
      ]
      const approvals = new Map(runs.map((id) => [id, loadCurrentApproval(root, id)]))
      const alternatives = new Map(
        backlog.candidates
          .filter((c) => requested.has(c.key))
          .map((c) => c.approval?.source_alternative_resolution_run)
          .filter(Boolean)
          .map((id) => {
            const bytes = fs.readFileSync(
              safePath(root, `runs/${id}/candidate-source-alternative.json`),
            )
            return [id, { value: JSON.parse(bytes), sha256: sha256(bytes) }]
          }),
      )
      const selected = selectEditionApprovals({
        handoff,
        backlog,
        decision,
        approvals,
        alternatives,
      })
      const input = {
        schema: "research-edition-preparation-input/v1",
        daily_run: dailyRunId,
        implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
        decision_sha256: sha256(reviewBytes),
        handoff_path: handoffRef.path,
        handoff_sha256: sha256(handoffBytes),
        backlog_sha256: sha256(backlogBytes),
        source_vault: path.resolve(vault),
        selected,
        knowledge_runs: decision.knowledge_runs,
        edition_spec: decision.edition_spec,
      }
      const state = new RunState(root, runId, input, { scope: "edition-preparation" })
      await state.stage("selection", input, async () => input)
      // The existing preview rechecks approvals, notes, source files and outputs on resume.
      const preview = await privatePreview(
        root,
        runId,
        selected.map((item) => item.approved_run),
        {
          repo,
          vault,
          knowledgeRuns: decision.knowledge_runs,
          editionSpec: decision.edition_spec,
        },
      )
      const previewPath = `runs/${runId}/preview-manifest.json`
      const previewBytes = fs.readFileSync(safePath(root, previewPath))
      if (
        sha256(fs.readFileSync(backlogFile)) !== input.backlog_sha256 ||
        sha256(fs.readFileSync(reviewPath)) !== input.decision_sha256
      )
        throw Error("Edition preparation input changed during generation")
      const result = await state.stage(
        "reader-delivery",
        { preview_sha256: sha256(previewBytes) },
        async () => ({
          schema: "research-edition-preparation-result/v1",
          run_id: runId,
          daily_run: dailyRunId,
          selected,
          edition_spec: decision.edition_spec,
          preview_path: previewPath,
          preview_sha256: sha256(previewBytes),
          preview,
          coverage_complete: false,
          candidate_published: false,
          drive_written: false,
        }),
      )
      const receipt = `runs/${runId}/edition-preparation.json`
      const previous = readJSON(root, receipt)
      if (previous && JSON.stringify(previous) !== JSON.stringify(result))
        throw Error("Edition preparation receipt changed")
      if (!previous) atomicCreate(root, receipt, result)
      return { ...result, receipt }
    }),
  )
}
