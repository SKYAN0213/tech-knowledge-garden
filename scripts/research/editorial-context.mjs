import fs from "node:fs"
import path from "node:path"
import { editions } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath } from "./run-state.mjs"

const prefix = (run) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(run || "")) throw Error("Exact daily run required")
  return `daily/runs/${run}/`
}

export function editorialInventory(vault, all = editions(vault)) {
  const latest = all.at(-1)
  if (!latest?.meta.coverage_end || !Number.isFinite(Date.parse(latest.meta.coverage_end)))
    throw Error("Latest local edition coverage_end required for discovery planning")
  const inventory = all.map((edition) => {
    const relative = path.relative(vault, edition.file)
    return { path: relative, sha256: sha256(fs.readFileSync(safePath(vault, relative))) }
  })
  return {
    inventory,
    snapshot: {
      cutoff: latest.meta.coverage_end,
      edition: latest.slug,
      file_sha256: inventory.at(-1).sha256,
      inventory_sha256: sha256(JSON.stringify(inventory)),
      authority: "local_vault_unreconciled",
    },
  }
}

// Reconcile editorial bytes only. The acquisition period and source evidence
// remain immutable; this record never grants fresh Drive or article approval.
export function assertEditorialContext(record, plan, planSha, inventorySha, relative) {
  if (
    record?.schema !== "research-daily-editorial-context/v1" ||
    record.daily_run !== plan.run_id ||
    record.plan_sha256 !== planSha ||
    JSON.stringify(record.original_edition) !== JSON.stringify(plan.edition) ||
    record.current_edition?.edition !== plan.edition.edition ||
    record.current_edition.cutoff !== plan.edition.cutoff ||
    record.current_edition.authority !== "local_vault_unreconciled" ||
    !Array.isArray(record.inventory) ||
    !record.inventory.length ||
    record.inventory.some(
      (r) =>
        !/^Editions\/.+\.md$/.test(r.path || "") ||
        r.path.split("/").some((p) => p === ".." || p === ".") ||
        !/^[a-f0-9]{64}$/.test(r.sha256 || ""),
    ) ||
    new Set(record.inventory.map((r) => r.path)).size !== record.inventory.length ||
    sha256(JSON.stringify(record.inventory)) !== record.current_edition.inventory_sha256 ||
    record.current_edition.inventory_sha256 !== inventorySha ||
    record.inventory.at(-1).path !== record.current_edition.edition + ".md" ||
    record.inventory.at(-1).sha256 !== record.current_edition.file_sha256 ||
    relative !==
      prefix(plan.run_id) + `editorial-contexts/${sha256(JSON.stringify(record))}.json` ||
    record.network_used !== false ||
    record.candidate_approved !== false ||
    record.candidate_published !== false ||
    record.drive_verified !== false
  )
    throw Error("Editorial reconciliation changed or belongs to another collection period")
  return record
}

export function loadEditorialContext(root, plan, inventorySha, reference) {
  const pointer = reference ? null : readJSON(root, prefix(plan.run_id) + "editorial-context.json")
  const ref = reference || pointer?.context
  if (!ref)
    throw Error(
      "Local edition inventory changed after daily planning; reconcile with a new run or editorial context",
    )
  if (
    pointer &&
    (pointer.schema !== "research-daily-editorial-context-pointer/v1" ||
      pointer.daily_run !== plan.run_id)
  )
    throw Error("Editorial context pointer changed")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Editorial context bytes changed")
  const planSha = sha256(fs.readFileSync(safePath(root, prefix(plan.run_id) + "plan.json")))
  return {
    reference: ref,
    value: assertEditorialContext(JSON.parse(bytes), plan, planSha, inventorySha, ref.path),
  }
}

export function reconcileEditorialContext({ root, runId, vault }) {
  const base = prefix(runId),
    plan = readJSON(root, base + "plan.json")
  if (
    plan?.schema !== "research-daily-plan/v1" ||
    plan.run_id !== runId ||
    !plan.edition?.inventory_sha256
  )
    throw Error("Pinned acquisition plan required")
  const { inventory, snapshot } = editorialInventory(vault)
  if (snapshot.edition !== plan.edition.edition || snapshot.cutoff !== plan.edition.cutoff)
    throw Error("Edition or coverage cutoff changed; create a new acquisition plan")
  const previous = readJSON(root, base + "editorial-context.json")
  if (previous) {
    if (
      previous.schema !== "research-daily-editorial-context-pointer/v1" ||
      previous.daily_run !== runId ||
      !previous.context?.path
    )
      throw Error("Editorial context pointer changed")
    const old = readJSON(root, previous.context.path)
    loadEditorialContext(root, plan, old?.current_edition?.inventory_sha256)
    if (old?.current_edition.inventory_sha256 === snapshot.inventory_sha256) {
      const checked = loadEditorialContext(root, plan, snapshot.inventory_sha256)
      return { ...checked.reference, reused: true }
    }
  }
  const record = {
    schema: "research-daily-editorial-context/v1",
    daily_run: runId,
    plan_sha256: sha256(fs.readFileSync(safePath(root, base + "plan.json"))),
    original_edition: plan.edition,
    current_edition: snapshot,
    inventory,
    network_used: false,
    candidate_approved: false,
    candidate_published: false,
    drive_verified: false,
  }
  const relative = base + `editorial-contexts/${sha256(JSON.stringify(record))}.json`
  assertEditorialContext(record, plan, record.plan_sha256, snapshot.inventory_sha256, relative)
  const old = readJSON(root, relative)
  if (old && JSON.stringify(old) !== JSON.stringify(record))
    throw Error("Existing editorial context changed")
  if (!old) atomicCreate(root, relative, record)
  const reference = { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) }
  atomicWrite(root, base + "editorial-context.json", {
    schema: "research-daily-editorial-context-pointer/v1",
    daily_run: runId,
    context: reference,
  })
  return { ...reference, reused: Boolean(old) }
}
