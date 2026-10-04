import fs from "node:fs"
import { parseArgs } from "node:util"
import { Ollama, localOllamaURL } from "./research/ollama.mjs"
import { prepareRoleProvider, resolveRolePolicy } from "./research/model-policy.mjs"
import { DEFAULT_ROOT, readJSON, withLock } from "./research/run-state.mjs"
import { loadStoredSourceRun } from "./research/parser.mjs"
import { assessEvidenceCheckpoint } from "./research/evidence-assessment.mjs"

try {
  const { values } = parseArgs({
    options: {
      "source-run": { type: "string" },
      run: { type: "string" },
      root: { type: "string" },
      "claims-per-batch": { type: "string", default: "3" },
      think: { type: "string" },
      "model-policy": { type: "string", default: "data/research-model-policy.json" },
    },
  })
  if (!/^[A-Za-z0-9_-]+$/.test(values.run || "") || !values["source-run"])
    throw Error(
      "Usage: npm run research:evidence -- --source-run EXTRACTION_RUN --run NEW_ASSESSMENT_RUN [--root PRIVATE_ROOT] [--model-policy FILE] [--claims-per-batch 1..6] [--think false|low|medium|xhigh]",
    )
  const root = values.root || DEFAULT_ROOT
  const result = await withLock(root, values.run, async () => {
    const { documents, parses } = loadStoredSourceRun(root, values["source-run"])
    const claims = readJSON(root, `runs/${values["source-run"]}/claims.json`)?.claims
    if (!claims?.length) throw Error("Stored extracted candidate claims required")
    const policy = JSON.parse(fs.readFileSync(values["model-policy"], "utf8"))
    if (resolveRolePolicy(policy, "evidence_compare").provider !== "ollama")
      throw Error("Evidence review CLI requires the configured local Ollama provider")
    const provider = await prepareRoleProvider(
      new Ollama({ url: localOllamaURL() }),
      policy,
      "evidence_compare",
      {
        root,
        run: values.run,
        overrides:
          values.think === undefined
            ? {}
            : {
                think:
                  values.think === "false" ? false : values.think === "true" ? true : values.think,
              },
      },
    )
    return assessEvidenceCheckpoint(root, values.run, provider, claims, documents, parses, {
      claimsPerBatch: Number(values["claims-per-batch"]),
    })
  })
  console.log(
    JSON.stringify(
      {
        run: values.run,
        generated_batches: result.generated_batches,
        reused_batches: result.reused_batches,
        claims: result.record.assessments.length,
        requires_attention: result.record.assessments.filter((row) => row.requires_attention)
          .length,
        requires_fact_review: true,
        public_approved: false,
        assessment_path: `${root}/runs/${values.run}/evidence-assessment/assessment.json`,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
