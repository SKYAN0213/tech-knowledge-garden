import fs from "node:fs"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import { reviewEvidenceQuotes } from "./research/evidence-quote-review.mjs"

try {
  const { values } = parseArgs({
    options: {
      run: { type: "string" },
      root: { type: "string" },
      "source-run": { type: "string" },
      review: { type: "string" },
    },
  })
  if (!values.review) throw Error("Explicit quote review JSON file required")
  const result = await reviewEvidenceQuotes({
    root: values.root || DEFAULT_ROOT,
    run: values.run,
    sourceRun: values["source-run"],
    review: JSON.parse(fs.readFileSync(values.review, "utf8")),
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
