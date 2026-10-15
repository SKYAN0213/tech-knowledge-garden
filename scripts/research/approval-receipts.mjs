import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

// One immutable reading phase, never a persistent approval cache. Callers must
// assertCurrent before accepting phase results. Selected bytes are checked on
// every lookup; the final scan also catches changed or newly conflicting files.
class ApprovalReceiptSnapshot {
  #root
  #rows = null
  #byRun = new Map()
  #stats = { scans: 0, lookups: 0, readbacks: 0, receipts: 0 }

  constructor(root) {
    this.#root = path.resolve(root)
  }

  assertRoot(root) {
    if (path.resolve(root) !== this.#root)
      throw Error("Approval receipt snapshot belongs to another root")
  }

  #scan() {
    this.#stats.scans++
    return fs
      .readdirSync(safePath(this.#root, "runs"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9_-]+$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const file = `runs/${entry.name}/candidate-approval.json`
        let bytes
        try {
          bytes = fs.readFileSync(safePath(this.#root, file))
        } catch (error) {
          if (error.code === "ENOENT") return []
          throw error
        }
        return [{ file, sha256: sha256(bytes), value: JSON.parse(bytes) }]
      })
  }

  find(query) {
    const fields = {
      approvedRun: "approved_run",
      candidateKey: "candidate_key",
      eventId: "event_id",
    }
    if (
      !query ||
      !/^[A-Za-z0-9_-]+$/.test(query.approvedRun || "") ||
      Object.keys(query).some(
        (key) => ![...Object.keys(fields), "priorApprovedRun"].includes(key),
      ) ||
      Object.values(query).some(
        (value) => typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value),
      )
    )
      throw Error("Exact native approval lookup required")
    if (!this.#rows) {
      this.#rows = this.#scan()
      this.#stats.receipts = this.#rows.length
      for (const row of this.#rows) {
        const run = row.value?.approved_run
        if (!this.#byRun.has(run)) this.#byRun.set(run, [])
        this.#byRun.get(run).push(row)
      }
    }
    this.#stats.lookups++
    return (this.#byRun.get(query.approvedRun) || [])
      .filter(
        (row) =>
          Object.entries(fields).every(
            ([key, field]) => !Object.hasOwn(query, key) || row.value?.[field] === query[key],
          ) &&
          (!Object.hasOwn(query, "priorApprovedRun") ||
            row.value?.existing_editorial_approval?.prior_approved_run === query.priorApprovedRun),
      )
      .map((row) => {
        this.#stats.readbacks++
        if (sha256(fs.readFileSync(safePath(this.#root, row.file))) !== row.sha256)
          throw Error("Approval receipt snapshot changed during reading")
        return { file: row.file, value: structuredClone(row.value) }
      })
  }

  assertCurrent() {
    if (!this.#rows) return
    const manifest = (rows) => rows.map((row) => ({ file: row.file, sha256: row.sha256 }))
    if (JSON.stringify(manifest(this.#scan())) !== JSON.stringify(manifest(this.#rows)))
      throw Error("Approval receipt inventory changed during reading; start a fresh phase")
  }

  statistics() {
    return { ...this.#stats }
  }
}

export const createApprovalReceiptSnapshot = (root) => new ApprovalReceiptSnapshot(root)

export function assertApprovalReceiptSnapshot(root, snapshot) {
  if (!(snapshot instanceof ApprovalReceiptSnapshot))
    throw Error("Native approval receipt snapshot required")
  snapshot.assertRoot(root)
  return snapshot
}

export function findApprovalReceipts(root, query, { approvalSnapshot } = {}) {
  const snapshot = assertApprovalReceiptSnapshot(
    root,
    approvalSnapshot ?? createApprovalReceiptSnapshot(root),
  )
  return snapshot.find(query)
}
