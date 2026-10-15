import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT, withGardenOperationLock } from "./research/run-state.mjs"
import {
  preparePublicationOperation,
  recordPublicationPush,
  recordPublicationDeployment,
  recordPublicationReadback,
  publicationOperationStatus,
  loadPublicationOperations,
} from "./research/publication-operation.mjs"
import {
  prepareEventPublicationHandoff,
  eventPublicationStatus,
} from "./research/daily-publication-handoff.mjs"
import {
  requestPublicationDelivery,
  publicationDeliveryStatus,
  selectLegacyPublicationFallback,
} from "./research/authoring-delivery-request.mjs"
import {
  saveShadowCollectionBasis,
  recordShadowOperation,
  auditShadowOperations,
} from "./research/shadow-operations.mjs"

const localModes = [
  "handoff",
  "handoff-status",
  "request-delivery",
  "delivery-status",
  "shadow-basis",
  "shadow-record",
  "shadow-status",
  "fallback",
]

try {
  const { values: v, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      release: { type: "string" },
      push: { type: "string" },
      deployment: { type: "string" },
      "readback-run": { type: "string" },
      repo: { type: "string" },
      vault: { type: "string" },
      workflow: { type: "string" },
      "workflow-sha256": { type: "string" },
      group: { type: "string", multiple: true },
      handoff: { type: "string" },
      "handoff-sha256": { type: "string" },
      invocation: { type: "string" },
      "invocation-sha256": { type: "string" },
      "collection-basis": { type: "string" },
      "collection-basis-sha256": { type: "string" },
      "preview-run": { type: "string" },
      "edition-spec": { type: "string" },
      "edition-spec-sha256": { type: "string" },
      "daily-run": { type: "string" },
      review: { type: "string" },
      "review-sha256": { type: "string" },
    },
  })
  const mode = positionals[0]
  if (
    positionals.length !== 1 ||
    !["bind", "deployment", "public", "status", ...localModes].includes(mode) ||
    (mode !== "bind" && (v.release || v.push)) ||
    (mode !== "deployment" && v.deployment) ||
    (mode !== "public" && v["readback-run"]) ||
    (mode !== "handoff" && (v.workflow || v["workflow-sha256"] || v.group)) ||
    (!localModes.includes(mode) && (v.repo || v.vault)) ||
    (!["request-delivery", "shadow-basis"].includes(mode) && v.handoff) ||
    (mode !== "request-delivery" &&
      (v["handoff-sha256"] ||
        v.invocation ||
        v["invocation-sha256"] ||
        v["collection-basis"] ||
        v["collection-basis-sha256"] ||
        v["preview-run"] ||
        v["edition-spec"] ||
        v["edition-spec-sha256"])) ||
    (mode !== "shadow-basis" && v["daily-run"]) ||
    (!["shadow-record", "fallback"].includes(mode) && (v.review || v["review-sha256"])) ||
    (["shadow-basis", "shadow-status"].includes(mode) && v.run)
  )
    throw Error(
      "Use publication bind/deployment/public/status, handoff, request-delivery, delivery-status or shadow-basis/record/status with only that stage's exact evidence",
    )
  const options = { root: v.root, run: v.run }
  let result
  if (localModes.includes(mode)) {
    const repo = fs.realpathSync(v.repo || fileURLToPath(new URL("../", import.meta.url)))
    const ctx = {
      repo,
      root: path.resolve(repo, v.root),
      vault: path.resolve(repo, v.vault || "vault"),
    }
    if (mode === "request-delivery")
      result = await requestPublicationDelivery(ctx, {
        run_id: v.run,
        handoff_path: v.handoff,
        handoff_sha256: v["handoff-sha256"],
        invocation_path: v.invocation,
        invocation_sha256: v["invocation-sha256"],
        collection_basis_path: v["collection-basis"],
        collection_basis_sha256: v["collection-basis-sha256"],
        preview_run_id: v["preview-run"],
        edition_spec_path: v["edition-spec"],
        edition_spec_sha256: v["edition-spec-sha256"],
      })
    else if (mode === "delivery-status") result = publicationDeliveryStatus(ctx, { run_id: v.run })
    else if (mode === "shadow-status") result = await auditShadowOperations(ctx.root, ctx.repo)
    else if (mode === "shadow-basis")
      result = await saveShadowCollectionBasis({
        root: ctx.root,
        dailyRun: v["daily-run"],
        handoffPath: v.handoff,
        backlogFile: path.join(ctx.repo, ".local/research/candidate-backlog.json"),
      })
    else if (mode === "fallback") {
      if (!v.review || !/^[a-f0-9]{64}$/.test(v["review-sha256"] || ""))
        throw Error("Exact fallback review path/SHA required")
      result = await selectLegacyPublicationFallback(ctx, {
        run_id: v.run,
        review_path: v.review,
        review_sha256: v["review-sha256"],
      })
    } else if (mode === "shadow-record") {
      if (!v.review || !/^[a-f0-9]{64}$/.test(v["review-sha256"] || ""))
        throw Error("Exact comparison review path/SHA required")
      result = await recordShadowOperation({
        root: ctx.root,
        run: v.run,
        reviewPath: v.review,
        reviewSha256: v["review-sha256"],
        repository: ctx.repo,
      })
    } else if (mode === "handoff-status") result = eventPublicationStatus(ctx, { run_id: v.run })
    else
      result = await prepareEventPublicationHandoff(ctx, {
        run_id: v.run,
        workflow_path: v.workflow,
        workflow_sha256: v["workflow-sha256"],
        ...(v.group ? { group_ids: v.group } : {}),
      })
  } else if (mode === "status")
    result = v.run ? publicationOperationStatus(options) : loadPublicationOperations(v.root)
  else
    result = await withGardenOperationLock(v.root, async () => {
      if (mode === "bind" && v.release && v.push) {
        await preparePublicationOperation({ ...options, releasePath: v.release })
        return recordPublicationPush({ ...options, pushPath: v.push })
      }
      if (mode === "deployment" && v.deployment)
        return recordPublicationDeployment({
          ...options,
          deployment: JSON.parse(fs.readFileSync(v.deployment)),
        })
      if (mode === "public" && v["readback-run"])
        return recordPublicationReadback({ ...options, readbackRun: v["readback-run"] })
      throw Error("Exact operation and stage evidence required")
    })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
