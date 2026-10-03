import path from "node:path"
import { resolveSourceRevision } from "./research/source-revision-resolution.mjs"
import { parseArgs } from "node:util"
import { DEFAULT_ROOT } from "./research/run-state.mjs"
import {
  saveSourceRevisionQueue,
  inspectSourceRevisionQueue,
} from "./research/source-revision-queue.mjs"

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      snapshot: { type: "string" },
      backlog: { type: "string" },
      vault: { type: "string", default: "vault" },
      "approval-root": { type: "string", multiple: true },
      run: { type: "string" },
      review: { type: "string" },
    },
  })
  if (positionals.length !== 1 || !["plan", "inspect", "resolve"].includes(positionals[0]))
    throw Error(
      "Usage: research-revisions.mjs plan|inspect --snapshot ID, or resolve --run ID --review PRIVATE_PATH",
    )
  const approvalRoots = new Map()
  for (const value of values["approval-root"] || []) {
    const match = value.match(/^([A-Za-z0-9_-]+)=(.+)$/)
    if (!match || approvalRoots.has(match[1]))
      throw Error("Distinct --approval-root RUN=PATH mappings required")
    approvalRoots.set(match[1], match[2])
  }
  const args = {
    root: values.root,
    snapshot: values.snapshot,
    backlogFile: values.backlog || path.join(path.dirname(values.root), "candidate-backlog.json"),
    vault: values.vault,
    approvalRoots,
  }
  if (positionals[0] === "resolve") {
    if (!values.run || !values.review || values.snapshot || approvalRoots.size)
      throw Error(
        "Resolution requires --run and --review; snapshot and approval roots are separate",
      )
    return resolveSourceRevision({ ...args, runId: values.run, reviewPath: values.review })
  }
  if (values.run || values.review) throw Error("--run and --review are only supported for resolve")
  return positionals[0] === "inspect"
    ? inspectSourceRevisionQueue(args)
    : saveSourceRevisionQueue(args)
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/research-revisions.mjs")
)
  main()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message)
      process.exitCode = 1
    })
