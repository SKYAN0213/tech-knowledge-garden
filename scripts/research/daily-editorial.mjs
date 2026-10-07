import fs from "node:fs"
import path from "node:path"
import { main as research } from "../research.mjs"
import { editions, extractArticles } from "../garden.mjs"
import { readBacklog } from "../research-window.mjs"
import { sha256 } from "./contracts.mjs"
import { processSourceRun } from "./source-processing.mjs"
import { loadProcessedSourceResult } from "./processed-source-result.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const validId = (id) => /^[A-Za-z0-9_-]{1,160}$/.test(id || "")
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const blockedRoutes = new Set([
  "review-existing-identity",
  "review-related-candidate",
  "review-existing-unverified",
  "review-source-revision",
  "verify-original-date",
])

// Continue a frozen daily selection through the existing explicit review gates.
// It never regenerates collection handoffs, invents reviews, or publishes a page.
export async function processDailyEditorial({
  root,
  runId,
  processingRun,
  candidateKeys,
  policyFile = "data/research-model-policy.json",
  vault = "vault",
  backlogFile = ".local/research/candidate-backlog.json",
  execute = false,
  reviewFiles = {},
  editorialReviewFiles = {},
  provider,
  processor = processSourceRun,
  command = research,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(runId || "") ||
    !validId(processingRun) ||
    runId === processingRun
  )
    throw Error("Distinct editorial and stored daily processing runs required")
  root = path.resolve(root)
  vault = path.resolve(vault)
  backlogFile = path.resolve(backlogFile)
  return withLock(root, "daily-processing-" + processingRun, () =>
    withLock(root, "daily-editorial-" + runId, async () => {
      const parentBase = `runs/${processingRun}/`
      const parentInput = readJSON(root, parentBase + "daily-processing-input.json")
      const parent = readJSON(root, parentBase + "daily-processing.json")
      const handoff = readJSON(root, parentBase + "daily-handoff-reference.json")
      if (
        parentInput?.schema !== "research-daily-processing-input/v1" ||
        parent?.schema !== "research-daily-processing/v1" ||
        parent.run_id !== processingRun ||
        parent.status === "running" ||
        parent.input_sha256 !== sha256(JSON.stringify(parentInput)) ||
        parent.daily_run !== parentInput.daily_run ||
        !Array.isArray(parentInput.entries) ||
        !Array.isArray(parentInput.candidate_keys) ||
        !Array.isArray(parent.results) ||
        parent.total !== parent.results.length ||
        !same(
          parent.results.map((r) => r.candidate_key),
          parentInput.candidate_keys,
        ) ||
        !handoff?.path ||
        sha256(fs.readFileSync(safePath(root, handoff.path))) !== handoff.sha256
      )
        throw Error("Completed exact daily processing and frozen handoff required")
      const frozenHandoff = readJSON(root, handoff.path)
      if (
        frozenHandoff.schema !== "research-editorial-handoff/v1" ||
        frozenHandoff.daily_run !== parentInput.daily_run ||
        !Array.isArray(frozenHandoff.pending)
      )
        throw Error("Exact frozen daily editorial handoff required")
      const counts = Object.fromEntries(
        [...new Set(parent.results.map((r) => r.status))].map((s) => [
          s,
          parent.results.filter((r) => r.status === s).length,
        ]),
      )
      if (!same(counts, parent.counts)) throw Error("Stored daily processing counts changed")
      const keys = candidateKeys || parentInput.candidate_keys
      if (
        !Array.isArray(keys) ||
        !keys.length ||
        keys.length > 12 ||
        new Set(keys).size !== keys.length ||
        keys.some((k) => !parentInput.candidate_keys.includes(k))
      )
        throw Error("One to twelve selected daily candidates required")
      for (const mapping of [reviewFiles, editorialReviewFiles])
        if (
          !mapping ||
          typeof mapping !== "object" ||
          Array.isArray(mapping) ||
          Object.entries(mapping).some(
            ([key, file]) => !keys.includes(key) || typeof file !== "string" || !file.trim(),
          )
        )
          throw Error("Review files must name selected daily candidates")
      const entries = keys.map((key) => {
        const row = parent.results.find((r) => r.candidate_key === key)
        const matches = parentInput.entries.filter((e) => e.candidate_key === key)
        const frozen = frozenHandoff.pending.filter((e) => e.key === key)
        if (matches.length !== 1 || (row.processing_run && !validId(row.processing_run)))
          throw Error("Unique exact daily processing entry required")
        const entry = matches[0]
        if (
          frozen.length !== 1 ||
          frozen[0].article_source_version_id !== entry.source_version_id ||
          frozen[0].article_parse_id !== entry.parse_id ||
          frozen[0].article_content_sha256 !== entry.content_sha256 ||
          (row.processing_run &&
            row.processing_run !==
              (entry.reuse_run || `${processingRun}-${sha256(key).slice(0, 12)}`))
        )
          throw Error("Daily processing differs from its frozen candidate selection")
        return {
          ...matches[0],
          processing_run: row.processing_run || null,
          initial_status: row.status,
          primary_candidate_key: row.primary_candidate_key || null,
        }
      })
      const input = {
        schema: "research-daily-editorial-input/v1",
        processing_run: processingRun,
        parent_input_sha256: parent.input_sha256,
        handoff,
        entries,
        vault,
        backlog_file: backlogFile,
        policy_file: path.resolve(policyFile),
        policy_sha256: sha256(fs.readFileSync(policyFile)),
        implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
      }
      const base = `runs/${runId}/daily-editorial/`
      const priorInput = readJSON(root, base + "input.json")
      if (priorInput && !same(priorInput, input))
        throw Error("Daily editorial input changed; use a new run")
      if (!priorInput) atomicCreate(root, base + "input.json", input)
      const reviewPath = (key, kind, supplied) => {
        const target = base + `reviews/${sha256(key)}/${kind}.json`
        const previous = readJSON(root, target)
        const file = supplied || previous?.path
        if (!file) return null
        const ref = { path: path.resolve(file), sha256: sha256(fs.readFileSync(file)) }
        if (previous && !same(previous, ref))
          throw Error("Pinned explicit review changed; use a new run")
        if (execute && !previous) atomicCreate(root, target, ref)
        return ref.path
      }
      // Preflight every supplied/pinned review before any native review writes.
      const reviews = new Map(
        entries.map((e) => [
          e.candidate_key,
          {
            fact: reviewPath(e.candidate_key, "fact", reviewFiles[e.candidate_key]),
            editorial: reviewPath(
              e.candidate_key,
              "editorial",
              editorialReviewFiles[e.candidate_key],
            ),
          },
        ]),
      )
      const rows = []
      let activeCandidate = null
      let existingLinks
      const priorLink = (key, child, current) => {
        if (!existingLinks) {
          existingLinks = fs
            .readdirSync(safePath(root, "runs"), { withFileTypes: true })
            .filter((e) => e.isDirectory() && validId(e.name))
            .map((e) => `runs/${e.name}/candidate-approval.json`)
            .filter((file) => fs.existsSync(safePath(root, file)))
            .sort()
            .map((file) => ({ file, link: readJSON(root, file) }))
        }
        const matches = existingLinks.filter(
          ({ link }) =>
            link.schema === "research-candidate-approval/v1" &&
            link.candidate_key === key &&
            link.approved_run === child &&
            link.event_id === current.event_id &&
            link.article_sha256 === current.article_sha256,
        )
        if (!matches.length)
          throw Error("Existing backlog approval lacks its native candidate receipt")
        const { file } = matches[0]
        return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
      }
      const persist = () => {
        const result = {
          schema: "research-daily-editorial/v1",
          run_id: runId,
          processing_run: processingRun,
          input_sha256: sha256(JSON.stringify(input)),
          status: execute ? "running" : "planned",
          active_candidate: activeCandidate,
          results: rows,
          candidate_published: false,
          new_regular_operation_counted: false,
        }
        atomicWrite(root, base + "latest.json", result)
        return result
      }
      for (const entry of entries) {
        const key = entry.candidate_key,
          child = entry.processing_run
        const row = { candidate_key: key, processing_run: child }
        activeCandidate = row
        persist()
        const failurePath = base + `failures/${sha256(key)}.json`
        const failure = readJSON(root, failurePath)
        if (failure) {
          if (
            failure.input_sha256 !== sha256(JSON.stringify(input)) ||
            failure.candidate_key !== key ||
            failure.automatic_retry !== false
          )
            throw Error("Daily editorial failure changed")
          rows.push(failure)
          persist()
          continue
        }
        if (
          !child ||
          entry.initial_status === "failed" ||
          entry.initial_status === "same_source" ||
          blockedRoutes.has(entry.next_route) ||
          entry.initial_status === "identity_review"
        ) {
          rows.push({
            ...row,
            status: entry.initial_status,
            primary_candidate_key: entry.primary_candidate_key,
          })
          persist()
          continue
        }
        try {
          const explicit = reviews.get(key)
          let current = await loadProcessedSourceResult(root, child, entry, { vault })
          if (execute && explicit.fact) {
            await command(["review", "--root", root, "--run", child, "--review", explicit.fact])
            current = await loadProcessedSourceResult(root, child, entry, { vault })
          }
          if (execute && current.status === "writer_required") {
            const binding = readJSON(root, `runs/${child}/source-processing-input.json`)
            await processor({
              root,
              run: child,
              sourceRun: binding.source_run,
              policyFile,
              candidateKey: binding.candidate_key,
              extractionRun: binding.extraction_run,
              assessmentRun: binding.assessment_run === child ? undefined : binding.assessment_run,
              assessmentReuseRun: binding.assessment_reuse_run,
              draftRun: binding.draft_run === child ? undefined : binding.draft_run,
              evidenceThink: binding.evidence_overrides?.think,
              provider,
            })
            current = await loadProcessedSourceResult(root, child, entry, { vault })
          }
          if (execute && explicit.editorial) {
            if (!["editorial_review", "approved"].includes(current.status))
              throw Error(
                "Exact reviewed facts and working draft required before editorial approval",
              )
            await command([
              "approve",
              "--root",
              root,
              "--run",
              child,
              "--review",
              explicit.editorial,
              "--vault",
              vault,
            ])
            current = await loadProcessedSourceResult(root, child, entry, { vault })
          }
          let approval = null
          if (execute && current.status === "approved") {
            const linkRun = `${runId}-${sha256(key).slice(0, 12)}-approval`
            const refPath = base + `approvals/${sha256(key)}.json`
            let ref = readJSON(root, refPath)
            if (!ref) {
              const priorCandidates = readBacklog(backlogFile)?.candidates.filter(
                (c) => c.key === key,
              )
              if (priorCandidates?.length !== 1)
                throw Error("One exact discovery candidate required")
              if (priorCandidates[0].approval) {
                ref = priorLink(key, child, current)
              } else {
                await command([
                  "candidate-approval",
                  "--root",
                  root,
                  "--run",
                  linkRun,
                  "--source-run",
                  child,
                  "--candidate-key",
                  key,
                  "--backlog",
                  backlogFile,
                  "--vault",
                  vault,
                ])
                const linkPath = `runs/${linkRun}/candidate-approval.json`
                ref = { path: linkPath, sha256: sha256(fs.readFileSync(safePath(root, linkPath))) }
              }
              atomicCreate(root, refPath, ref)
            }
            const bytes = fs.readFileSync(safePath(root, ref.path)),
              link = JSON.parse(bytes)
            const candidates = readBacklog(backlogFile)?.candidates.filter((c) => c.key === key)
            const candidate = candidates?.[0]
            if (
              sha256(bytes) !== ref.sha256 ||
              link.schema !== "research-candidate-approval/v1" ||
              link.candidate_key !== key ||
              link.approved_run !== child ||
              link.event_id !== current.event_id ||
              link.article_sha256 !== current.article_sha256 ||
              link.source_version_id !== entry.source_version_id ||
              link.parse_id !== entry.parse_id ||
              link.article_content_sha256 !== entry.content_sha256 ||
              candidates?.length !== 1 ||
              candidate.event_id !== link.event_id ||
              candidate.review_status !== "verified" ||
              candidate.approval?.approved_run !== child ||
              candidate.approval.article_sha256 !== link.article_sha256 ||
              candidate.approval.source_version_id !== entry.source_version_id ||
              candidate.approval.parse_id !== entry.parse_id ||
              candidate.approval.article_content_sha256 !== entry.content_sha256
            )
              throw Error("Candidate approval handoff differs from its exact source or backlog")
            const published = editions(vault)
              .flatMap(extractArticles)
              .some((a) => a.id === link.event_id)
            const currentSourceMatches =
              candidate.article_source_version_id === entry.source_version_id &&
              candidate.article_parse_id === entry.parse_id &&
              candidate.article_content_sha256 === entry.content_sha256
            approval = {
              approved_run: child,
              event_id: link.event_id,
              article_sha256: link.article_sha256,
              candidate_approval: ref,
              current_source_matches: currentSourceMatches,
            }
            current = {
              ...current,
              status: published
                ? "already_in_edition"
                : currentSourceMatches
                  ? "approval_ready"
                  : "source_revision_review",
            }
          }
          rows.push({
            ...row,
            status: current.status,
            result: current,
            ...(approval ? { approval } : {}),
          })
        } catch (error) {
          const failed = {
            ...row,
            status: "failed",
            input_sha256: sha256(JSON.stringify(input)),
            error: error instanceof Error ? error.message : String(error),
            automatic_retry: false,
          }
          if (execute) atomicCreate(root, failurePath, failed)
          rows.push(failed)
        }
        persist()
      }
      const ready = rows.filter((r) => r.status === "approval_ready")
      const events = new Map()
      for (const row of ready) {
        const previous = events.get(row.approval.event_id)
        if (
          previous &&
          (previous.approved_run !== row.approval.approved_run ||
            previous.article_sha256 !== row.approval.article_sha256)
        )
          throw Error("One event has conflicting daily article approvals")
        events.set(row.approval.event_id, row.approval)
      }
      const handoffResult = {
        schema: "research-daily-publication-handoff/v1",
        run_id: runId,
        input_sha256: sha256(JSON.stringify(input)),
        approved_runs: [...events.values()],
        candidate_published: false,
        drive_verified: false,
        new_regular_operation_counted: false,
      }
      const handoffPath =
        base + `publication-handoffs/${sha256(JSON.stringify(handoffResult))}.json`
      if (!readJSON(root, handoffPath)) atomicCreate(root, handoffPath, handoffResult)
      activeCandidate = null
      const result = persist()
      result.status = rows.some((r) => r.status === "failed")
        ? "partial"
        : execute
          ? "review_pending"
          : "planned"
      result.publication_handoff = {
        path: handoffPath,
        sha256: sha256(fs.readFileSync(safePath(root, handoffPath))),
      }
      atomicWrite(root, base + "latest.json", result)
      return result
    }),
  )
}
