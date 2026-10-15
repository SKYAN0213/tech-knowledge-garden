import fs from "node:fs"
import {
  createApprovalReceiptSnapshot,
  assertApprovalReceiptSnapshot,
} from "./approval-receipts.mjs"
import { loadExistingEditorialRevision } from "./existing-editorial-approval.mjs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { processDailyEditorial } from "./daily-editorial.mjs"
import { assertDeepReviewDecision } from "./deep-dive.mjs"
import { loadCurrentCandidateDisposition } from "./candidate-disposition.mjs"
import { loadCurrentCandidateApproval } from "./candidate-approval.mjs"
import { loadCandidateParseRecovery } from "./candidate-parse-recovery.mjs"
import { matchesFrozenDailyCandidateSource } from "./frozen-daily-processing-handoff.mjs"
import { loadRevisionSourceEvidence } from "./source-revision-queue.mjs"
import { findStoredSourceDetailReviewFiles, loadSourceDetailReview } from "./source-followups.mjs"
import { loadDailyPublicationSelection } from "./daily-publication-handoff.mjs"
import {
  assertEvidenceOntology,
  extendEvidenceOntology,
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "./ontology.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const reference = (root, file) => ({
  path: file,
  sha256: sha256(fs.readFileSync(safePath(root, file))),
})
const checked = (root, ref) => {
  if (!/^[a-f0-9]{64}$/.test(ref?.sha256 || "")) throw Error("Pinned queue reference required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Queue reference changed: " + ref.path)
  return JSON.parse(bytes)
}

export async function processDailyQueueEditorial({
  root,
  runId,
  queueRun,
  candidateKeys,
  policyFile = "data/research-model-policy.json",
  vault = "vault",
  backlogFile = ".local/research/candidate-backlog.json",
  execute = false,
  reviewFiles = {},
  deepReviewFiles = {},
  editorialReviewFiles = {},
  ontologyBase,
  maxItems = 4,
  timeBudgetMs = 1_800_000,
  clock = Date.now,
  processor = processDailyEditorial,
  selectionLoader = loadDailyPublicationSelection,
  dispositionLoader = loadCurrentCandidateDisposition,
  approvalLoader = loadCurrentCandidateApproval,
  revisionSourceLoader = loadRevisionSourceEvidence,
  approvalSnapshot,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,70}$/.test(runId || "") ||
    !/^[A-Za-z0-9_-]{1,70}$/.test(queueRun || "") ||
    runId === queueRun ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > 40 ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > 3_600_000
  )
    throw Error("Distinct editorial/queue IDs and bounded execution required")
  root = path.resolve(root)
  vault = path.resolve(vault)
  backlogFile = path.resolve(backlogFile)
  approvalSnapshot ??= createApprovalReceiptSnapshot(root)
  assertApprovalReceiptSnapshot(root, approvalSnapshot)
  const revisionLoader = (sourceRoot, previous, current) =>
    loadExistingEditorialRevision(sourceRoot, previous, current, { approvalSnapshot })
  return withLock(root, "daily-queue-" + queueRun, () =>
    withLock(root, "queue-editorial-" + runId, async () => {
      const queueBase = `runs/${queueRun}/`,
        base = `runs/${runId}/queue-editorial/`
      const queueInputRef = reference(root, queueBase + "daily-queue-input.json")
      const queueInput = checked(root, queueInputRef),
        queue = readJSON(root, queueBase + "daily-queue.json")
      if (
        queueInput.schema !== "research-daily-processing-queue-input/v1" ||
        queue?.schema !== "research-daily-processing-queue/v1" ||
        queue.run_id !== queueRun ||
        queue.status === "running" ||
        queue.input_sha256 !== sha256(JSON.stringify(queueInput)) ||
        !Array.isArray(queue.results) ||
        !same(
          queue.results.map((r) => r.candidate_key),
          queueInput.candidate_keys,
        )
      )
        throw Error("Stopped exact queue checkpoint required")
      const priorInput = readJSON(root, base + "input.json")
      const keys =
        candidateKeys ||
        priorInput?.entries.map((e) => e.candidate_key) ||
        queue.results.filter((row) => row.status === "processed").map((row) => row.candidate_key)
      if (
        !Array.isArray(keys) ||
        !keys.length ||
        keys.length > 40 ||
        new Set(keys).size !== keys.length
      )
        throw Error("One to forty completed queue candidates required")
      const entries = keys.map((key) => {
        const row = queue.results.find((r) => r.candidate_key === key)
        const outcomeRef = reference(root, queueBase + `queue-outcomes/${sha256(key)}.json`)
        const outcome = checked(root, outcomeRef)
        if (
          row?.status !== "processed" ||
          outcome.input_sha256 !== queue.input_sha256 ||
          !same(row, outcome.row) ||
          !outcome.native_receipt ||
          row.processing_run !== `${queueRun}-${sha256(key).slice(0, 12)}`
        )
          throw Error("Only exact completed queue outcomes can continue editorially")
        const native = checked(root, outcome.native_receipt)
        if (
          native.schema !== "research-daily-processing/v1" ||
          native.run_id !== row.processing_run ||
          native.status === "running" ||
          native.total !== 1 ||
          native.results.length !== 1 ||
          native.results[0].candidate_key !== key ||
          !native.results[0].processing_run
        )
          throw Error("Exact queue child processing receipt required")
        return {
          candidate_key: key,
          processing_run: row.processing_run,
          source_processing_run: native.results[0].processing_run,
          outcome: outcomeRef,
          native_receipt: outcome.native_receipt,
        }
      })
      const input = {
        schema: "research-queue-editorial-input/v1",
        queue_run: queueRun,
        queue_input: queueInputRef,
        entries,
        vault,
        backlog_file: backlogFile,
        policy_file: path.resolve(policyFile),
        policy_sha256: sha256(fs.readFileSync(policyFile)),
        implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
        processor_sha256: sha256(
          fs.readFileSync(new URL("./daily-editorial.mjs", import.meta.url)),
        ),
        disposition_reader_sha256: sha256(
          fs.readFileSync(new URL("./candidate-disposition.mjs", import.meta.url)),
        ),
        approval_reader_sha256: sha256(
          fs.readFileSync(new URL("./candidate-approval.mjs", import.meta.url)),
        ),
        source_review_reader_sha256: sha256(
          fs.readFileSync(new URL("./source-followups.mjs", import.meta.url)),
        ),
        revision_source_reader_sha256: sha256(
          fs.readFileSync(new URL("./source-revision-queue.mjs", import.meta.url)),
        ),
        ...(ontologyBase || priorInput?.ontology_base
          ? {
              ontology_base: reference(root, ontologyBase || priorInput.ontology_base.path),
            }
          : {}),
      }
      const ontologyInput = input.ontology_base
        ? assertEvidenceOntology(checked(root, input.ontology_base))
        : null
      if (priorInput && !same(priorInput, input))
        throw Error("Queue editorial inputs changed; use a new run")
      if (!priorInput) atomicCreate(root, base + "input.json", input)
      const reviews = new Map()
      const sourceReviewFiles = findStoredSourceDetailReviewFiles({
        root,
        handoffFile: safePath(root, queueInput.handoff.path),
        candidateKeys: keys,
      })
      // Preflight all supplied and previously pinned files before any writer or approval.
      for (const [kind, mapping] of [
        ["fact", reviewFiles],
        ["deep", deepReviewFiles],
        ["editorial", editorialReviewFiles],
        [
          "source",
          Object.fromEntries(
            Object.entries(sourceReviewFiles).map(([key, file]) => [key, safePath(root, file)]),
          ),
        ],
      ]) {
        if (
          !mapping ||
          Array.isArray(mapping) ||
          typeof mapping !== "object" ||
          Object.entries(mapping).some(
            ([key, file]) => !keys.includes(key) || typeof file !== "string" || !file.trim(),
          )
        )
          throw Error("Reviews must name selected queue candidates")
        for (const key of keys) {
          const target = base + `reviews/${sha256(key)}/${kind}.json`,
            old = readJSON(root, target)
          const file = mapping[key] || old?.path
          if (!file) continue
          const bytes = fs.readFileSync(file)
          const decision = JSON.parse(bytes)
          if (kind === "deep") assertDeepReviewDecision(decision)
          const sourceReview =
            kind === "source"
              ? loadSourceDetailReview({
                  root,
                  handoffFile: safePath(root, queueInput.handoff.path),
                  candidateKey: key,
                  reviewPath: path.relative(root, file),
                })
              : null
          const ref = { path: path.resolve(file), sha256: sha256(bytes) }
          if (old && !same(old, ref)) throw Error("Pinned queue review changed; use a new run")
          reviews.set(`${key}:${kind}`, {
            target,
            ref,
            previous: old,
            ...(sourceReview ? { sourceReview } : {}),
          })
        }
      }
      if (execute)
        for (const item of reviews.values())
          if (!item.previous) atomicCreate(root, item.target, item.ref)
      const inputHash = sha256(JSON.stringify(input)),
        old = readJSON(root, base + "latest.json")
      if (
        old &&
        (old.input_sha256 !== inputHash ||
          !same(
            old.results.map((r) => r.candidate_key),
            keys,
          ))
      )
        throw Error("Queue editorial checkpoint changed")
      const rows = new Map((old?.results || []).map((r) => [r.candidate_key, r]))
      const workFingerprint = (entry) =>
        sha256(
          JSON.stringify([
            execute,
            entry.current_approval || null,
            [
              "reviewed-claims.json",
              "deep-context.json",
              "draft.json",
              "approved-article.json",
            ].map((file) => {
              const p = safePath(root, `runs/${entry.source_processing_run}/${file}`)
              return fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null
            }),
            ["fact", "deep", "editorial"].map(
              (kind) => reviews.get(`${entry.candidate_key}:${kind}`)?.ref || null,
            ),
          ]),
        )
      const persist = (status, activeCandidate = null) => {
        const results = keys.map(
          (key) => rows.get(key) || { candidate_key: key, status: "pending" },
        )
        const receipt = {
          schema: "research-queue-editorial/v1",
          run_id: runId,
          queue_run: queueRun,
          input_sha256: inputHash,
          status,
          active_candidate: activeCandidate,
          results,
          counts: Object.fromEntries(
            [...new Set(results.map((r) => r.status))].map((s) => [
              s,
              results.filter((r) => r.status === s).length,
            ]),
          ),
          candidate_published: false,
          new_regular_operation_counted: false,
        }
        atomicWrite(root, base + "latest.json", receipt)
        return receipt
      }
      const start = clock()
      let attempted = 0,
        yielded = false
      const currentCandidates = new Map(
        JSON.parse(fs.readFileSync(backlogFile, "utf8")).candidates.map((item) => [item.key, item]),
      )
      // A waiting fact packet must not consume the bounded slot before work
      // with an explicit review or stored reviewed facts can reach the writer.
      // These files establish scheduling only; native gates still read them.
      const continuationPriority = (entry) => {
        const explicit = ["fact", "deep", "editorial"].some((kind) =>
          reviews.has(`${entry.candidate_key}:${kind}`),
        )
        const candidate = currentCandidates.get(entry.candidate_key)
        // Labels schedule cheap validation only; loaders below still prove the
        // exact native disposition/approval before resolving any candidate.
        if (
          !explicit &&
          (candidate?.disposition ||
            candidate?.approval?.approved_run === entry.source_processing_run)
        )
          return 3
        return explicit
          ? 2
          : Number(
              fs.existsSync(
                safePath(root, `runs/${entry.source_processing_run}/reviewed-claims.json`),
              ),
            )
      }
      const scheduled = [...entries].sort(
        (a, b) => continuationPriority(b) - continuationPriority(a),
      )
      // A bad late source review must stop before any other candidate writes.
      for (const entry of entries) {
        const key = entry.candidate_key
        const detail = reviews.get(`${key}:source`)
        if (!detail) continue
        const candidate = currentCandidates.get(key)
        const frozen = checked(root, queueInput.handoff).pending.find((item) => item.key === key)
        if (
          !candidate ||
          !frozen ||
          candidate.article_source_version_id !== detail.sourceReview.source_version_id ||
          candidate.article_parse_id !== detail.sourceReview.parse_id ||
          candidate.article_content_sha256 !== frozen.article_content_sha256 ||
          candidate.approval ||
          ["approved", "published"].includes(candidate.review_status) ||
          fs.existsSync(
            safePath(root, `runs/${entry.source_processing_run}/approved-article.json`),
          ) ||
          ["fact", "deep", "editorial"].some((kind) => reviews.has(`${key}:${kind}`))
        )
          throw Error(
            "Source detail review conflicts with current source, approval or editorial reviews",
          )
      }
      let revisionSources
      for (const originalEntry of scheduled) {
        let entry = originalEntry
        const key = entry.candidate_key,
          prior = rows.get(key)
        // A disposition may be recorded after extraction or a cached review.
        // Revalidate native evidence against this queue's exact frozen source
        // before spending a writer slot; a rejected label alone is insufficient.
        const disposition = dispositionLoader(root, currentCandidates.get(key))
        if (disposition) {
          const frozen = checked(root, queueInput.handoff).pending.find((item) => item.key === key)
          if (
            !frozen ||
            frozen.article_source_version_id !== disposition.source_version_id ||
            frozen.article_parse_id !== disposition.parse_id ||
            frozen.article_content_sha256 !== disposition.article_content_sha256 ||
            ["fact", "deep", "editorial"].some((kind) => reviews.has(`${key}:${kind}`))
          )
            throw Error("Candidate disposition differs from frozen editorial source or reviews")
          rows.set(key, {
            candidate_key: key,
            status: "resolved",
            processing_run: entry.source_processing_run,
            resolution: disposition,
            native_receipt: reference(root, disposition.receipt),
            model_calls: 0,
            candidate_published: false,
          })
          continue
        }
        // A source-reading review may arrive after raw extraction or a cached
        // fact packet. Keep the frozen queue intact and defer only this source;
        // a short body or a mere link never grants this routing decision.
        const detail = reviews.get(`${key}:source`)
        if (detail) {
          rows.set(key, {
            candidate_key: key,
            status: "source_review",
            processing_run: entry.source_processing_run,
            source_review: detail.sourceReview,
            native_receipt: {
              path: detail.sourceReview.receipt,
              sha256: detail.sourceReview.sha256,
            },
            model_calls: 0,
            candidate_published: false,
          })
          continue
        }
        // A completed candidate may acquire a reviewed revision after the queue
        // was frozen. Reuse the native approval and daily-editorial continuation
        // rather than redrafting the original run or changing the frozen input.
        const candidate = currentCandidates.get(key)
        if (candidate?.approval && candidate.source_revision_alert) {
          if (["fact", "deep", "editorial"].some((kind) => reviews.has(`${key}:${kind}`)))
            throw Error("Changed source requires revision review before frozen editorial reviews")
          const frozen = checked(root, queueInput.handoff).pending.find((item) => item.key === key)
          const historical = {
            ...candidate,
            review_status: "verified",
            article_source_version_id: candidate.approval.source_version_id,
            article_parse_id: candidate.approval.parse_id,
            article_content_sha256: candidate.approval.article_content_sha256,
          }
          delete historical.source_revision_alert
          if (!matchesFrozenDailyCandidateSource(frozen, [historical]))
            throw Error("Source revision does not belong to the frozen editorial candidate")
          const approval = await approvalLoader(root, historical, { vault, approvalSnapshot })
          if (!approval || approval.event_id !== candidate.event_id)
            throw Error("Source revision requires an exact native prior approval")
          revisionSources ??= revisionSourceLoader(
            root,
            entries
              .map((item) => currentCandidates.get(item.candidate_key))
              .filter((item) => item?.approval && item.source_revision_alert),
          )
          const observed = revisionSources.get(key)
          if (!observed) throw Error("Source revision requires the stored current original")
          const sourceReview = {
            schema: "research-queue-source-revision/v1",
            candidate_key: key,
            candidate_sha256: sha256(JSON.stringify(candidate)),
            candidate,
            prior_approval: approval,
            current_source_run: observed.source_run,
            current_source_files: observed.files,
            next_route: "review-source-revision",
            model_calls: 0,
            publication_approved: false,
          }
          const file = base + `source-revisions/${sha256(JSON.stringify(sourceReview))}.json`
          if (!readJSON(root, file)) atomicCreate(root, file, sourceReview)
          else if (!same(readJSON(root, file), sourceReview))
            throw Error("Source revision checkpoint changed")
          rows.set(key, {
            candidate_key: key,
            status: "source_review",
            processing_run: originalEntry.source_processing_run,
            source_revision: {
              next_route: sourceReview.next_route,
              candidate_sha256: sourceReview.candidate_sha256,
            },
            native_receipt: reference(root, file),
            model_calls: 0,
            candidate_published: false,
          })
          continue
        }
        if (candidate?.approval) {
          const approval = await approvalLoader(root, candidate, { vault, approvalSnapshot })
          if (approval) {
            const frozen = checked(root, queueInput.handoff).pending.find(
              (item) => item.key === key,
            )
            const recovery = loadCandidateParseRecovery(root, candidate)
            const original = recovery?.candidate_before
            const recovered = recovery?.recovered_fields
            const sourceMatches =
              frozen &&
              ((frozen.article_source_version_id === candidate.approval.source_version_id &&
                frozen.article_parse_id === candidate.approval.parse_id &&
                frozen.article_content_sha256 === candidate.approval.article_content_sha256) ||
                (original &&
                  frozen.article_source_version_id === original.article_source_version_id &&
                  frozen.article_parse_id === original.article_parse_id &&
                  frozen.article_content_sha256 === original.article_content_sha256 &&
                  recovered.article_source_version_id === candidate.approval.source_version_id &&
                  recovered.article_parse_id === candidate.approval.parse_id &&
                  recovered.article_content_sha256 === candidate.approval.article_content_sha256))
            if (
              !frozen ||
              approval.approved_run !== candidate.approval.approved_run ||
              approval.event_id !== candidate.event_id ||
              approval.article_sha256 !== candidate.approval.article_sha256 ||
              !sourceMatches
            )
              throw Error("Candidate approval differs from frozen editorial source or binding")
            // A stale extraction frontier can resolve without a writer. An
            // exact approval already in the requested cumulative graph still
            // goes through the native editorial publication gate below.
            const cumulativeApproval = ontologyInput?.inputs.some(
              (item) =>
                item.run === approval.approved_run &&
                item.event_id === approval.event_id &&
                same(item.files, approval.approved_files),
            )
            if (
              approval.approved_run === originalEntry.source_processing_run &&
              !cumulativeApproval &&
              !["fact", "deep", "editorial"].some((kind) => reviews.has(`${key}:${kind}`))
            ) {
              rows.set(key, {
                candidate_key: key,
                status: "resolved",
                processing_run: approval.approved_run,
                resolution: approval,
                native_receipt: reference(root, approval.receipt),
                model_calls: 0,
                candidate_published: false,
              })
              continue
            }
            // Its own completed approval must not change the work fingerprint.
            // A later approved revision still selects a distinct continuation.
            if (approval.approved_run !== originalEntry.source_processing_run)
              entry = {
                ...originalEntry,
                source_processing_run: approval.approved_run,
                current_approval: reference(root, approval.receipt),
              }
          }
        }
        const revision = entry.source_processing_run !== originalEntry.source_processing_run
        const workKey = revision
          ? sha256(JSON.stringify([key, entry.source_processing_run, entry.current_approval]))
          : sha256(key)
        const failurePath = base + `failures/${workKey}.json`
        const failure = readJSON(root, failurePath)
        if (failure) {
          if (
            failure.input_sha256 !== inputHash ||
            failure.candidate_key !== key ||
            failure.automatic_retry !== false
          )
            throw Error("Queue editorial failure changed")
          rows.set(key, failure)
          continue
        }
        if (prior?.work_fingerprint === workFingerprint(entry)) {
          checked(root, prior.native_receipt)
          if (prior.status !== "approval_ready") continue
          try {
            selectionLoader(root, prior.publication_handoff.path, { vault })
            continue
          } catch (error) {
            // Reclassify changed sources or an event now in an edition through
            // the native gate. The cached approval is no longer publishable.
            rows.set(key, {
              ...prior,
              status: "approval_revalidation",
              revalidation_reason: error instanceof Error ? error.message : String(error),
            })
          }
        }
        if (execute && (attempted >= maxItems || clock() - start >= timeBudgetMs)) {
          yielded = true
          break
        }
        attempted++
        const childRun = `${runId}-${workKey.slice(0, 12)}`
        persist(execute ? "running" : "planned", key)
        try {
          const result = await processor({
            root,
            runId: childRun,
            processingRun: entry.processing_run,
            candidateKeys: [key],
            policyFile,
            vault,
            backlogFile,
            execute,
            ...(revision
              ? { editorialProcessingRuns: { [key]: entry.source_processing_run } }
              : {}),
            reviewFiles: reviews.has(`${key}:fact`)
              ? { [key]: reviews.get(`${key}:fact`).ref.path }
              : {},
            deepReviewFiles: reviews.has(`${key}:deep`)
              ? { [key]: reviews.get(`${key}:deep`).ref.path }
              : {},
            editorialReviewFiles: reviews.has(`${key}:editorial`)
              ? { [key]: reviews.get(`${key}:editorial`).ref.path }
              : {},
          })
          if (
            result.schema !== "research-daily-editorial/v1" ||
            result.run_id !== childRun ||
            result.results.length !== 1 ||
            result.results[0].candidate_key !== key ||
            result.status === "running" ||
            result.candidate_published !== false
          )
            throw Error("Native queue editorial result differs from its candidate")
          const nativeReceipt = reference(root, `runs/${childRun}/daily-editorial/latest.json`)
          if (!same(checked(root, nativeReceipt), result))
            throw Error("Native queue editorial receipt changed")
          rows.set(key, {
            candidate_key: key,
            status: result.results[0].status,
            editorial_run: childRun,
            processing_run: entry.source_processing_run,
            ...(revision
              ? {
                  original_processing_run: originalEntry.source_processing_run,
                  current_approval: entry.current_approval,
                }
              : {}),
            native_receipt: nativeReceipt,
            publication_handoff: result.publication_handoff,
            result: result.results[0],
            work_fingerprint: workFingerprint(entry),
          })
          if (result.results[0].status === "failed") {
            const failure = { ...rows.get(key), input_sha256: inputHash, automatic_retry: false }
            atomicCreate(root, failurePath, failure)
            rows.set(key, failure)
          }
        } catch (error) {
          const failure = {
            candidate_key: key,
            status: "failed",
            input_sha256: inputHash,
            error: error instanceof Error ? error.message : String(error),
            automatic_retry: false,
          }
          if (execute) atomicCreate(root, failurePath, failure)
          rows.set(key, failure)
        }
        persist(execute ? "running" : "planned")
      }
      const ready = keys
        .map((key) => rows.get(key))
        .filter((row) => row?.status === "approval_ready")
      const events = new Map()
      for (const row of ready) {
        const selected = selectionLoader(root, row.publication_handoff.path, { vault })
        if (selected.reference.sha256 !== row.publication_handoff.sha256)
          throw Error("Queue child publication reference changed")
        const publication = checked(root, row.publication_handoff)
        for (const approval of publication.approved_runs) {
          const previous = events.get(approval.event_id)
          if (
            previous &&
            (previous.approved_run !== approval.approved_run ||
              previous.article_sha256 !== approval.article_sha256)
          )
            throw Error("Conflicting queue approvals for one event")
          events.set(approval.event_id, approval)
        }
      }
      const handoff = {
        schema: "research-daily-publication-handoff/v2",
        run_id: runId,
        input_sha256: inputHash,
        child_handoffs: ready.map((row) => row.publication_handoff),
        approved_runs: [...events.values()],
        candidate_published: false,
        drive_verified: false,
        new_regular_operation_counted: false,
      }
      let ontology = null
      if (events.size || input.ontology_base) {
        const approvedRuns = [
          ...new Set([
            ...[...events.values()].map((event) => event.approved_run),
            ...[...rows.values()]
              .filter((row) => row.status === "resolved" && row.resolution?.approved_run)
              .map((row) => row.resolution.approved_run),
          ]),
        ]
        const graph = input.ontology_base
          ? extendEvidenceOntology(root, ontologyInput, approvedRuns, {
              vault,
              revisionLoader,
            })
          : projectEvidenceOntology(
              approvedRuns.map((run) => loadApprovedOntologyInput(root, run, { vault })),
            )
        const graphPath = `ontology/${runId}-${sha256(JSON.stringify(graph)).slice(0, 16)}/graph.json`
        const existing = readJSON(root, graphPath)
        if (existing && !same(existing, graph)) throw Error("Queue evidence ontology changed")
        if (!existing) atomicCreate(root, graphPath, graph)
        ontology = reference(root, graphPath)
        handoff.evidence_ontology = ontology
        if (input.ontology_base) handoff.ontology_base = input.ontology_base
      }
      approvalSnapshot.assertCurrent()
      const handoffPath = base + `publication-handoffs/${sha256(JSON.stringify(handoff))}.json`
      if (!readJSON(root, handoffPath)) atomicCreate(root, handoffPath, handoff)
      const result = persist(
        !execute
          ? "planned"
          : yielded
            ? "yielded"
            : [...rows.values()].some((row) => row.status === "failed")
              ? "partial"
              : [...rows.values()].some((row) => row.status === "source_review")
                ? "source_review_pending"
                : keys.every((key) =>
                      ["approval_ready", "resolved"].includes(rows.get(key)?.status),
                    )
                  ? ready.length
                    ? "approval_ready"
                    : "resolved"
                  : "review_pending",
      )
      result.publication_handoff = reference(root, handoffPath)
      if (ontology) result.evidence_ontology = ontology
      atomicWrite(root, base + "latest.json", result)
      return result
    }),
  )
}
