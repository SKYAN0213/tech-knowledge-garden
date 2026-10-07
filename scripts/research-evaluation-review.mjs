import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import {
  prepareEvaluationReviewPacket,
  importEvaluationHumanReview,
} from "./research/evaluation-review-packet.mjs"

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
    },
  })
  if (
    positionals.length !== 1 ||
    !v.run ||
    (positionals[0] === "prepare"
      ? !v.cases || v.review || v["packet-run"]
      : positionals[0] === "import"
        ? !v.review || !v["packet-run"] || v.cases
        : true)
  )
    throw Error(
      "Use prepare --run ID --cases CASE1,CASE2 or import --run ID --packet-run ID --review ROOT_RELATIVE_JSON",
    )
  const result =
    positionals[0] === "prepare"
      ? await prepareEvaluationReviewPacket(v.root, v.run, v.cases.split(","))
      : await importEvaluationHumanReview(v.root, v.run, v["packet-run"], v.review)
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
