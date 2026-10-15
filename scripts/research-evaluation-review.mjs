import { parseArgs } from "node:util"
import fs from "node:fs"
import { DEFAULT_ROOT, atomicCreate } from "./research/run-state.mjs"
import {
  prepareEvaluationReviewPacket,
  importEvaluationHumanReview,
  prepareEvaluationSourceReviewPacket,
  readEvaluationReviewPacket,
  auditEvaluationReviewPacket,
} from "./research/evaluation-review-packet.mjs"
import { auditEvaluationCases } from "./research/evaluation.mjs"
import {
  readLocalModelResourceSnapshot,
  inspectEvaluationWriterQuality,
} from "./research/evaluation-cost.mjs"
import { createModelProvider } from "./research/model-provider.mjs"
import { resolveRolePolicy } from "./research/model-policy.mjs"

try {
  const { values: v, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      run: { type: "string" },
      cases: { type: "string" },
      "packet-run": { type: "string" },
      review: { type: "string" },
      selection: { type: "string" },
      "case-id": { type: "string" },
      "policy-file": { type: "string" },
    },
  })
  if (
    positionals.length !== 1 ||
    (v["policy-file"] && positionals[0] !== "resources") ||
    (positionals[0] === "prepare"
      ? !v.run || !v.cases === !v.selection || v.review || v["packet-run"] || v["case-id"]
      : positionals[0] === "import"
        ? !v.run || !v.review || !v["packet-run"] || v.cases || v.selection || v["case-id"]
        : positionals[0] === "read"
          ? !v["packet-run"] || v.run || v.review || v.cases || v.selection
          : positionals[0] === "quality"
            ? !v.run || !v.selection || !v["case-id"] || v.review || v.cases || v["packet-run"]
            : positionals[0] === "resources"
              ? !v.run || v.review || v.cases || v.selection || v["case-id"] || v["packet-run"]
              : positionals[0] === "audit"
                ? v.run || v.review || v.cases || v.selection || v["case-id"]
                : true)
  )
    throw Error(
      "Use prepare --run ID --cases CASE1,CASE2|--selection ROOT_RELATIVE_JSON; read --packet-run ID [--case-id ID]; import --run ID --packet-run ID --review ROOT_RELATIVE_JSON; audit [--packet-run ID]; quality --run WRITER_ID --selection ROOT_RELATIVE_JSON --case-id DEVELOPMENT_ID; resources --run NEW_ID [--policy-file JSON] (no inference)",
    )
  async function resources() {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(v.run))
      throw Error("Exact new resource observation run required")
    const policy = JSON.parse(
      fs.readFileSync(v["policy-file"] || "data/research-model-policy.json"),
    )
    const settings = resolveRolePolicy(policy, "article_write")
    if (settings.provider !== "ollama")
      throw Error("Resource observation requires the configured local provider")
    const provider = createModelProvider(policy, "article_write", { root: v.root, run: v.run })
    const metadata = await provider.metadata(settings.model, { timeout_ms: 5000 })
    const snapshot = await readLocalModelResourceSnapshot(provider, {
      model: settings.model,
      expected_digest: metadata.digest,
    })
    const report = {
      schema: "evaluation-runtime-resource-snapshot/v1",
      settings,
      metadata,
      snapshot,
      model_calls: 0,
      source_requests: 0,
      candidate_published: false,
    }
    const saved = atomicCreate(
      v.root,
      "runs/" + v.run + "/evaluation-cost/resource-snapshot.json",
      report,
    )
    return { ...report, path: saved.path, sha256: saved.sha256 }
  }
  const result =
    positionals[0] === "prepare"
      ? v.selection
        ? await prepareEvaluationSourceReviewPacket(v.root, v.run, v.selection)
        : await prepareEvaluationReviewPacket(v.root, v.run, v.cases.split(","))
      : positionals[0] === "import"
        ? await importEvaluationHumanReview(v.root, v.run, v["packet-run"], v.review)
        : positionals[0] === "quality"
          ? inspectEvaluationWriterQuality(v.root, v.run, v.selection, v["case-id"])
          : positionals[0] === "resources"
            ? await resources()
            : positionals[0] === "read"
              ? readEvaluationReviewPacket(v.root, v["packet-run"], {
                  case_id: v["case-id"] || null,
                })
              : {
                  fixtures: auditEvaluationCases(v.root),
                  ...(v["packet-run"]
                    ? { packet: auditEvaluationReviewPacket(v.root, v["packet-run"]) }
                    : {}),
                }
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
