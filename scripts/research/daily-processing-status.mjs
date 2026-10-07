import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"

const statuses = new Set([
  "pending",
  "ready",
  "running",
  "failed",
  "fact_review",
  "editorial_review",
  "writer_required",
  "approved",
  "reviewed_without_publishable_facts",
  "identity_review",
  "source_required",
  "approval_ready",
  "same_source",
  "empty_extraction_review",
  "empty_extraction_recovery_required",
  "empty_extraction_recovered",
  "empty_extraction_source_deferred",
  "empty_extraction_no_event",
])
function inspectProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return "missing_handle"
  try {
    process.kill(pid, 0)
    return "alive"
  } catch (error) {
    if (error.code === "ESRCH") return "missing_handle"
    if (error.code === "EPERM") return "unobservable"
    throw error
  }
}

export function loadDailyProcessingStatus(root, { processState = inspectProcess } = {}) {
  const directory = safePath(root, "runs")
  if (!fs.existsSync(directory)) return { status: "missing", runs: [] }
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[A-Za-z0-9_-]+$/.test(e.name))
    .map((e) => ({ run: e.name, file: safePath(root, `runs/${e.name}/daily-processing.json`) }))
    .filter((e) => fs.existsSync(e.file))
    .sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs)
  const runs = files.map(({ run }) => {
    try {
      const base = `runs/${run}/`,
        input = readJSON(root, base + "daily-processing-input.json"),
        receipt = readJSON(root, base + "daily-processing.json")
      if (
        !input ||
        receipt.schema !== "research-daily-processing/v1" ||
        receipt.run_id !== run ||
        receipt.input_sha256 !== sha256(JSON.stringify(input)) ||
        receipt.total !== input.candidate_keys.length ||
        !Array.isArray(receipt.results) ||
        JSON.stringify(receipt.results.map((r) => r.candidate_key)) !==
          JSON.stringify(input.candidate_keys) ||
        receipt.results.some((r) => !statuses.has(r.status))
      )
        throw Error("Processing receipt does not match its input")
      const counts = Object.fromEntries(
        [...new Set(receipt.results.map((r) => r.status))].map((s) => [
          s,
          receipt.results.filter((r) => r.status === s).length,
        ]),
      )
      if (JSON.stringify(counts) !== JSON.stringify(receipt.counts))
        throw Error("Processing counts changed")
      const lock = readJSON(root, `locks/daily-processing-${run}.json`)
      const live = receipt.status === "running" ? processState(lock?.pid) : "not_running"
      const results = receipt.results.map((row) => {
        let phase = null,
          progress = null
        const binding = row.processing_run
          ? readJSON(root, `runs/${row.processing_run}/source-processing-input.json`)
          : null
        if (row.reused_processing === true) {
          const entry = input.entries.find((e) => e.candidate_key === row.candidate_key)
          const bytes = fs.readFileSync(
            safePath(root, `runs/${row.processing_run}/source-processing-input.json`),
          )
          if (
            !entry?.reuse_run ||
            entry.reuse_run !== row.processing_run ||
            entry.reuse_input_sha256 !== sha256(bytes) ||
            row.result?.processing_input_sha256 !== entry.reuse_input_sha256 ||
            row.result?.model_calls !== 0
          )
            throw Error("Reused processing receipt differs from the pinned run")
        }
        const implementationStatus = !binding
          ? "unrecorded"
          : Object.entries(binding.implementation || {}).some(([file, hash]) => {
                if (!/^[A-Za-z0-9_-]+\.mjs$/.test(file))
                  throw Error("Invalid processing implementation path")
                return sha256(fs.readFileSync(new URL(file, import.meta.url))) !== hash
              })
            ? "changed"
            : "current"
        if (row.status === "running" && row.processing_run) {
          const state = readJSON(root, `runs/${row.processing_run}/processing/state.json`)
          phase =
            Object.entries(state?.stages || {}).find(([, s]) => s.status === "running")?.[0] || null
          for (const role of ["article_write", "evidence_compare", "fact_extract"]) {
            const ledger = readJSON(
              root,
              `runs/${row.processing_run}/model-policy/${role}/budget.json`,
            )
            const attempt = ledger?.attempts?.find((a) => a.status === "running")
            if (attempt) {
              const detail = readJSON(
                root,
                `runs/${row.processing_run}/model-policy/${role}/progress/${attempt.id}.json`,
              )
              progress = {
                role,
                attempt_id: attempt.id,
                status: detail?.status || "running",
                elapsed_ms: detail?.elapsed_ms ?? null,
                frames: detail?.frames ?? null,
                content_chars: detail?.content_chars ?? null,
              }
              break
            }
          }
        }
        return {
          candidate_key: row.candidate_key,
          status: row.status,
          processing_run: row.processing_run || null,
          source_run: row.source_run || null,
          elapsed_ms: row.elapsed_ms ?? null,
          implementation_status: implementationStatus,
          phase,
          progress,
          ...(row.status === "failed" ? { error: row.error, automatic_retry: false } : {}),
          ...(row.status === "same_source"
            ? { primary_candidate_key: row.primary_candidate_key }
            : {}),
          packet: row.result?.packet || null,
          preview: row.result?.preview || null,
          reused_processing: row.reused_processing === true,
          assessment_run: row.result?.assessment_run || null,
          quote_review_run: row.result?.quote_review_run || null,
          empty_extraction_review_run: row.result?.review_run || null,
          empty_extraction_recovery_run: row.result?.recovery?.run || null,
          model_calls: row.reused_processing === true ? (row.result?.model_calls ?? null) : null,
        }
      })
      return {
        run_id: run,
        daily_run: receipt.daily_run,
        status: receipt.status,
        live_process: live,
        total: receipt.total,
        counts,
        results,
        candidate_published: false,
      }
    } catch (error) {
      return { run_id: run, status: "invalid", error: error.message, candidate_published: false }
    }
  })
  const editorial = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[A-Za-z0-9_-]+$/.test(e.name))
    .map((e) => ({
      run: e.name,
      file: safePath(root, `runs/${e.name}/daily-editorial/latest.json`),
    }))
    .filter((e) => fs.existsSync(e.file))
    .sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs)
    .map(({ run }) => {
      try {
        const base = `runs/${run}/daily-editorial/`,
          input = readJSON(root, base + "input.json"),
          receipt = readJSON(root, base + "latest.json")
        if (
          input?.schema !== "research-daily-editorial-input/v1" ||
          receipt.schema !== "research-daily-editorial/v1" ||
          receipt.run_id !== run ||
          receipt.processing_run !== input.processing_run ||
          receipt.input_sha256 !== sha256(JSON.stringify(input)) ||
          !Array.isArray(receipt.results) ||
          !Array.isArray(input.entries) ||
          receipt.results.length > input.entries.length ||
          !receipt.results.every((r, i) => r.candidate_key === input.entries[i].candidate_key) ||
          receipt.results.some(
            (r) =>
              !statuses.has(r.status) &&
              !["already_in_edition", "source_revision_review"].includes(r.status),
          )
        )
          throw Error("Editorial continuation differs from its frozen input")
        if (receipt.publication_handoff) {
          const bytes = fs.readFileSync(safePath(root, receipt.publication_handoff.path))
          const handoff = JSON.parse(bytes)
          if (
            sha256(bytes) !== receipt.publication_handoff.sha256 ||
            handoff.schema !== "research-daily-publication-handoff/v1" ||
            handoff.run_id !== run ||
            handoff.input_sha256 !== receipt.input_sha256
          )
            throw Error("Daily publication handoff changed")
        }
        const parent = readJSON(root, `runs/${input.processing_run}/daily-processing-input.json`)
        if (!parent || sha256(JSON.stringify(parent)) !== input.parent_input_sha256)
          throw Error("Editorial parent processing input changed")
        return {
          run_id: run,
          daily_run: parent.daily_run,
          stage_kind: "editorial",
          processing_run: input.processing_run,
          status: receipt.status,
          live_process:
            receipt.status === "running"
              ? processState(readJSON(root, `locks/daily-editorial-${run}.json`)?.pid)
              : "not_running",
          active_candidate: receipt.active_candidate || null,
          total: input.entries.length,
          counts: Object.fromEntries(
            [...new Set(receipt.results.map((r) => r.status))].map((s) => [
              s,
              receipt.results.filter((r) => r.status === s).length,
            ]),
          ),
          results: receipt.results.map((r) => ({
            candidate_key: r.candidate_key,
            status: r.status,
            processing_run: r.processing_run,
            packet: r.result?.packet || null,
            preview: r.result?.preview || null,
            current_source_matches: r.approval?.current_source_matches ?? null,
            ...(r.error ? { error: r.error, automatic_retry: false } : {}),
          })),
          publication_handoff: receipt.publication_handoff || null,
          candidate_published: false,
        }
      } catch (error) {
        return {
          run_id: run,
          stage_kind: "editorial",
          status: "invalid",
          error: error.message,
          candidate_published: false,
        }
      }
    })
  return {
    status: runs.length || editorial.length ? "available" : "missing",
    runs: [...editorial, ...runs],
  }
}
