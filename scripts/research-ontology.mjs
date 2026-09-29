import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import {
  assertEvidenceOntology,
  loadApprovedOntologyInput,
  ontologyConceptArticles,
  ontologyEntityTimeline,
  projectEvidenceOntology,
  traceOntologyClaim,
} from "./research/ontology.mjs"
import { DEFAULT_ROOT, assertAbsent, atomicCreate, safePath } from "./research/run-state.mjs"

const validId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value)
const graphPath = (snapshot) => `ontology/${snapshot}/graph.json`

export function main(argv = process.argv.slice(2)) {
  const { values: options, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string", default: DEFAULT_ROOT },
      snapshot: { type: "string" },
      "approved-run": { type: "string", multiple: true },
      "claim-id": { type: "string" },
      run: { type: "string" },
      entity: { type: "string" },
      "concept-id": { type: "string" },
    },
  })
  const [command] = positionals
  if (positionals.length !== 1 || !["build", "trace", "timeline", "concept"].includes(command))
    throw Error(
      "Usage: research-ontology.mjs build|trace|timeline|concept --snapshot ID [--approved-run ID | --claim-id ID | --entity NAME | --concept-id ID]",
    )
  if (!validId(options.snapshot)) throw Error("Explicit safe --snapshot ID required")
  const root = options.root,
    approvedRuns = options["approved-run"] || []
  if (command === "build") {
    if (
      !approvedRuns.length ||
      approvedRuns.some((run) => !validId(run)) ||
      new Set(approvedRuns).size !== approvedRuns.length ||
      options["claim-id"] ||
      options.run ||
      options.entity ||
      options["concept-id"]
    )
      throw Error("Build requires distinct --approved-run IDs only")
    assertAbsent(root, graphPath(options.snapshot))
    const graph = projectEvidenceOntology(
      approvedRuns.map((run) => loadApprovedOntologyInput(root, run)),
    )
    const receipt = atomicCreate(root, graphPath(options.snapshot), graph)
    return {
      schema: graph.schema,
      path: receipt.path,
      sha256: receipt.sha256,
      events: graph.nodes.filter((node) => node.type === "Event").length,
      verified_claims: graph.nodes.filter((node) => node.type === "Claim").length,
      evidence_blocks: graph.nodes.filter((node) => node.type === "EvidenceBlock").length,
      source_versions: graph.nodes.filter((node) => node.type === "SourceVersion").length,
      candidate_published: false,
    }
  }
  if (approvedRuns.length) throw Error("--approved-run is only supported for build")
  const file = safePath(root, graphPath(options.snapshot))
  if (!fs.existsSync(file)) throw Error("Ontology snapshot not found")
  const graph = assertEvidenceOntology(JSON.parse(fs.readFileSync(file, "utf8")))
  if (command === "trace") {
    if (
      !options["claim-id"] ||
      options.entity ||
      options["concept-id"] ||
      (options.run && !validId(options.run))
    )
      throw Error("Trace requires --claim-id and optional --run only")
    return traceOntologyClaim(graph, options["claim-id"], options.run)
  }
  if (command === "timeline") {
    if (!options.entity || options["claim-id"] || options.run || options["concept-id"])
      throw Error("Timeline requires --entity only")
    return ontologyEntityTimeline(graph, options.entity)
  }
  if (!options["concept-id"] || options["claim-id"] || options.run || options.entity)
    throw Error("Concept requires --concept-id only")
  return ontologyConceptArticles(graph, options["concept-id"])
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/research-ontology.mjs")
) {
  try {
    console.log(JSON.stringify(main(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
