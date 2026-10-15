import { parseArgs } from "node:util"
import {
  prepareArticleImageSource,
  createArticleImageSource,
} from "./research/article-image-source.mjs"
import { DEFAULT_ROOT, readJSON } from "./research/run-state.mjs"
import {
  intakeArticleImageCandidate,
  selectIntakenArticleImageCandidate,
} from "./research/article-image-intake.mjs"
import { saveSourceSelection } from "./research/source-selection.mjs"

const { values: v } = parseArgs({
  strict: true,
  options: {
    root: { type: "string", default: DEFAULT_ROOT },
    run: { type: "string" },
    "source-run": { type: "string" },
    "parse-id": { type: "string" },
    "image-run": { type: "string", multiple: true },
    "intake-run": { type: "string" },
    "select-run": { type: "string" },
    backlog: { type: "string" },
    "plan-only": { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
  },
})
if ([v["plan-only"], v.execute].filter(Boolean).length !== 1)
  throw Error("Explicit --plan-only or --execute required")
if ((v["intake-run"] || v["select-run"]) && !v.execute)
  throw Error("Native article intake/selection requires explicit --execute")
if (v["select-run"] && !v["intake-run"]) throw Error("Selection requires an exact --intake-run")
const options = {
  root: v.root,
  run: v.run,
  sourceRun: v["source-run"],
  parseId: v["parse-id"],
  imageRuns: v["image-run"],
}
if (v.execute) {
  const result = await createArticleImageSource(options)
  if (v["intake-run"]) {
    const intakeOptions = {
      root: v.root,
      run: v["intake-run"],
      sourceRun: v.run,
      ...(v.backlog ? { backlogFile: v.backlog } : {}),
    }
    const intake = await intakeArticleImageCandidate(intakeOptions)
    result.intake = {
      status: intake.status,
      candidate_key: intake.candidate_key,
      reused: intake.reused,
      backlog_changed: intake.backlog_changed,
    }
    if (v["select-run"]) {
      const selection = selectIntakenArticleImageCandidate({
        ...intakeOptions,
        intakeRun: v["intake-run"],
        allowReviewed:
          intake.reused &&
          Boolean(readJSON(v.root, `runs/${v["select-run"]}/source-selection.json`)),
      })
      result.selection = await saveSourceSelection(v.root, v["select-run"], selection.selected, {
        article_image_intake_run: v["intake-run"],
        candidate_key: selection.candidate.key,
      })
    }
  }
  console.log(JSON.stringify(result, null, 2))
} else {
  const plan = prepareArticleImageSource(options)
  console.log(
    JSON.stringify(
      {
        status: "planned",
        source_identity: plan.identity,
        image_sources: plan.binding.assets.length,
        source_document_complete: plan.binding.source_document_complete,
        candidate_approved: false,
        candidate_published: false,
      },
      null,
      2,
    ),
  )
}
