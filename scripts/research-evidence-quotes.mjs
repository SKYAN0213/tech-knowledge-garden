import fs from "node:fs"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { reviewEvidenceQuotes } from "./research/evidence-quote-review.mjs"
import { Ollama, localOllamaURL } from "./research/ollama.mjs"
import { prepareRoleProvider } from "./research/model-policy.mjs"

try {
  const { values } = parseArgs({
    options: {
      run: { type: "string" },
      root: { type: "string" },
      "source-run": { type: "string" },
      review: { type: "string" },
      "complete-missing": { type: "boolean", default: false },
      "model-policy": { type: "string" },
      "resume-local-budget-ms": { type: "string" },
      "resume-budget-reason": { type: "string" },
    },
  })
  if (!values.review) throw Error("Explicit quote review JSON file required")
  const result = await reviewEvidenceQuotes({
    root: values.root || DEFAULT_ROOT,
    run: values.run,
    sourceRun: values["source-run"],
    review: JSON.parse(fs.readFileSync(values.review, "utf8")),
    completeMissing: values["complete-missing"],
    createMissingProvider: values["complete-missing"]
      ? async () => {
          const root = values.root || DEFAULT_ROOT
          const ledger = JSON.parse(
            fs.readFileSync(
              `${root}/runs/${values["source-run"]}/model-policy/evidence_compare/budget.json`,
              "utf8",
            ),
          )
          return prepareRoleProvider(
            new Ollama({ url: localOllamaURL() }),
            JSON.parse(
              fs.readFileSync(values["model-policy"] || "data/research-model-policy.json", "utf8"),
            ),
            "evidence_compare",
            {
              root,
              run: values.run,
              overrides: { think: ledger.binding.settings.think },
              additionalBudgetMs: Number(values["resume-local-budget-ms"] || 0),
              extensionReason: values["resume-budget-reason"],
            },
          )
        }
      : null,
  })
  console.log(
    JSON.stringify(
      {
        run: values.run,
        model_calls: result.model_calls,
        materialized_batches: result.materialized_batches,
        reused_batches: result.reused_batches,
        repaired_quotes: result.repaired_quotes,
        requires_fact_review: true,
        public_approved: false,
        candidate_published: false,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
