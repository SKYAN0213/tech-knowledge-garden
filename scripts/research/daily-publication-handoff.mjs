import fs from "node:fs"
import path from "node:path"
import { editions, extractArticles } from "../garden.mjs"
import { readBacklog } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { verifyPinnedSourceRevision } from "./candidate-approval.mjs"

// Routing metadata only: privatePreview must still validate every native approval.
export function loadDailyPublicationSelection(root, relative, { vault = "vault" } = {}) {
  const bytes = fs.readFileSync(safePath(root, relative)),
    selection = JSON.parse(bytes)
  if (
    selection.schema !== "research-daily-publication-handoff/v1" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(selection.run_id || "") ||
    !Array.isArray(selection.approved_runs) ||
    !selection.approved_runs.length ||
    selection.approved_runs.length > 12
  )
    throw Error("Nonempty exact daily publication selection required")
  const base = `runs/${selection.run_id}/daily-editorial/`
  const input = readJSON(root, base + "input.json"),
    latest = readJSON(root, base + "latest.json")
  if (
    input?.schema !== "research-daily-editorial-input/v1" ||
    latest?.schema !== "research-daily-editorial/v1" ||
    latest.status === "running" ||
    latest.run_id !== selection.run_id ||
    latest.input_sha256 !== sha256(JSON.stringify(input)) ||
    selection.input_sha256 !== latest.input_sha256 ||
    latest.publication_handoff?.path !== relative ||
    latest.publication_handoff.sha256 !== sha256(bytes) ||
    path.resolve(vault) !== input.vault ||
    !Array.isArray(latest.results) ||
    !Array.isArray(input.entries)
  )
    throw Error("Daily publication selection changed or belongs to another vault")
  const ready = latest.results.filter((r) => r.status === "approval_ready")
  const unique = new Map(ready.map((r) => [r.approval.event_id, r.approval]))
  if (JSON.stringify([...unique.values()]) !== JSON.stringify(selection.approved_runs))
    throw Error("Daily publication selection differs from approved editorial results")
  const backlog = readBacklog(input.backlog_file)
  const existing = new Set(
    editions(vault)
      .flatMap(extractArticles)
      .map((a) => a.id),
  )
  for (const row of ready) {
    const matches = backlog?.candidates.filter((c) => c.key === row.candidate_key)
    const candidate = matches?.[0],
      approval = row.approval
    const entry = input.entries.find((e) => e.candidate_key === row.candidate_key)
    const linkBytes = fs.readFileSync(safePath(root, approval.candidate_approval.path))
    const link = JSON.parse(linkBytes)
    const article = readJSON(root, `runs/${approval.approved_run}/approved-article.json`)
    const revised = entry?.source_revision?.sources.find(
      (s) =>
        s.approved_source_version_id === entry.source_version_id &&
        s.approved_parse_id === entry.parse_id,
    )
    if (entry?.source_revision) {
      verifyPinnedSourceRevision({
        root,
        approvedRunId: approval.approved_run,
        candidateKey: row.candidate_key,
        candidate,
        sourceRevision: entry.source_revision,
      })
      if (
        !revised ||
        JSON.stringify(link.source_revision) !== JSON.stringify(entry.source_revision) ||
        JSON.stringify(candidate.approval?.source_revision) !==
          JSON.stringify(entry.source_revision) ||
        link.reviewed_source_version_id !== entry.source_version_id ||
        link.reviewed_parse_id !== entry.parse_id
      )
        throw Error("Daily publication source revision binding changed")
    }
    const sourceVersion = revised?.current_source_version_id || entry?.source_version_id
    const parseId = revised?.current_parse_id || entry?.parse_id
    if (
      matches?.length !== 1 ||
      !entry ||
      approval.current_source_matches !== true ||
      link.schema !== "research-candidate-approval/v1" ||
      sha256(linkBytes) !== approval.candidate_approval.sha256 ||
      link.candidate_key !== row.candidate_key ||
      link.approved_run !== approval.approved_run ||
      link.event_id !== approval.event_id ||
      link.article_sha256 !== approval.article_sha256 ||
      sha256(JSON.stringify(article)) !== approval.article_sha256 ||
      article.event_id !== approval.event_id ||
      candidate.review_status !== "verified" ||
      candidate.event_id !== approval.event_id ||
      candidate.approval?.approved_run !== approval.approved_run ||
      candidate.approval.article_sha256 !== approval.article_sha256 ||
      link.source_version_id !== sourceVersion ||
      link.parse_id !== parseId ||
      candidate.approval.source_version_id !== sourceVersion ||
      candidate.approval.parse_id !== parseId ||
      candidate.article_source_version_id !== sourceVersion ||
      candidate.article_parse_id !== parseId ||
      candidate.article_content_sha256 !== entry.content_sha256 ||
      existing.has(approval.event_id)
    )
      throw Error("Daily publication source changed or event already appears in an edition")
  }
  return {
    approvedRuns: [...new Set(selection.approved_runs.map((a) => a.approved_run))],
    reference: { path: relative, sha256: sha256(bytes), run_id: selection.run_id },
  }
}
