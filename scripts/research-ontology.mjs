import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import {
  assertEvidenceOntology,
  extendEvidenceOntology,
  loadApprovedOntologyInput,
  ontologyConceptArticles,
  ontologyEntityTimeline,
  projectEvidenceOntology,
  traceOntologyClaim,
} from "./research/ontology.mjs"
import {
  ontologyKnowledge,
  ontologyKnowledgeIndex,
  ontologyResearchPaper,
  ontologyResearchPerson,
  ontologyCompany,
  ontologyImpact,
} from "./research/ontology-knowledge.mjs"
import { DEFAULT_ROOT, assertAbsent, atomicCreate, safePath } from "./research/run-state.mjs"
import { prepareTrendReviewRuns } from "./research/ontology-trends.mjs"

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
      "base-snapshot": { type: "string" },
      vault: { type: "string", default: "vault" },
      "approved-run": { type: "string", multiple: true },
      "claim-id": { type: "string" },
      run: { type: "string" },
      entity: { type: "string" },
      "concept-id": { type: "string" },
      "work-id": { type: "string" },
      "person-id": { type: "string" },
      "company-id": { type: "string" },
      "company-review": { type: "string" },
      "source-version-id": { type: "string" },
      "event-id": { type: "string" },
      "note-review-run": { type: "string", multiple: true },
      "connection-review-run": { type: "string" },
      "knowledge-reviews": { type: "string" },
      "trend-reviews": { type: "string" },
    },
  })
  const [command] = positionals
  if (
    positionals.length !== 1 ||
    ![
      "build",
      "extend",
      "trace",
      "timeline",
      "concept",
      "knowledge",
      "knowledge-index",
      "paper",
      "person",
      "company",
      "impact",
    ].includes(command)
  )
    throw Error(
      "Usage: research-ontology.mjs build|extend|trace|timeline|concept|knowledge|knowledge-index|paper|person|company|impact --snapshot ID [--base-snapshot ID --approved-run ID | --claim-id ID | --entity NAME | --concept-id ID | --work-id ID | --person-id ID | --company-id ID --company-review FILE | --source-version-id ID | --event-id ID]",
    )
  if (!validId(options.snapshot)) throw Error("Explicit safe --snapshot ID required")
  if (options["knowledge-reviews"] && !["knowledge", "knowledge-index", "impact"].includes(command))
    throw Error("--knowledge-reviews requires knowledge, knowledge-index or impact")
  if (options["trend-reviews"] && !["knowledge-index", "impact"].includes(command))
    throw Error("--trend-reviews requires knowledge-index or impact")
  if (
    options["connection-review-run"] !== undefined &&
    (!["knowledge-index", "impact"].includes(command) || !validId(options["connection-review-run"]))
  )
    throw Error(
      "--connection-review-run requires knowledge-index or impact and a safe approval run",
    )
  if (
    ["source-version-id", "event-id", "note-review-run"].some(
      (key) => options[key] !== undefined,
    ) &&
    command !== "impact"
  )
    throw Error("Evidence impact options require impact")
  if (
    command === "impact" &&
    (options.entity || options["concept-id"] || options["company-review"])
  )
    throw Error("Impact uses exact evidence selectors only")
  if (options["work-id"] !== undefined && command !== "paper")
    throw Error("--work-id requires paper")
  if (options["person-id"] !== undefined && command !== "person")
    throw Error("--person-id requires person")
  if (options["company-id"] !== undefined && command !== "company")
    throw Error("--company-id requires company")
  if (options["company-review"] !== undefined && !["company", "knowledge-index"].includes(command))
    throw Error("--company-review requires company or knowledge-index")
  if (
    command === "company" &&
    (!options["company-id"] ||
      !options["company-review"] ||
      options["claim-id"] ||
      options.run ||
      options.entity ||
      options["concept-id"])
  )
    throw Error("Company query requires --company-id and --company-review only")
  if (
    command === "person" &&
    (!options["person-id"] ||
      options["claim-id"] ||
      options.run ||
      options.entity ||
      options["concept-id"])
  )
    throw Error("Person query requires --person-id only")
  if (
    command === "paper" &&
    (!options["work-id"] ||
      options["claim-id"] ||
      options.run ||
      options.entity ||
      options["concept-id"])
  )
    throw Error("Paper query requires --work-id only")
  const root = options.root,
    approvedRuns = options["approved-run"] || []
  if (options["base-snapshot"] && command !== "extend")
    throw Error("--base-snapshot requires extend")
  if (command === "build" || command === "extend") {
    if (
      !approvedRuns.length ||
      approvedRuns.some((run) => !validId(run)) ||
      new Set(approvedRuns).size !== approvedRuns.length ||
      options["claim-id"] ||
      options.run ||
      options.entity ||
      options["concept-id"]
    )
      throw Error("Build/extend requires distinct --approved-run IDs only")
    if (
      command === "extend" &&
      (!validId(options["base-snapshot"]) || options["base-snapshot"] === options.snapshot)
    )
      throw Error("Extend requires a distinct safe --base-snapshot")
    assertAbsent(root, graphPath(options.snapshot))
    const graph =
      command === "extend"
        ? extendEvidenceOntology(
            root,
            JSON.parse(
              fs.readFileSync(safePath(root, graphPath(options["base-snapshot"])), "utf8"),
            ),
            approvedRuns,
            { vault: options.vault },
          )
        : projectEvidenceOntology(
            approvedRuns.map((run) =>
              loadApprovedOntologyInput(root, run, { vault: options.vault }),
            ),
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
  if (approvedRuns.length) throw Error("--approved-run is only supported for build/extend")
  const file = safePath(root, graphPath(options.snapshot))
  if (!fs.existsSync(file)) throw Error("Ontology snapshot not found")
  const graph = assertEvidenceOntology(JSON.parse(fs.readFileSync(file, "utf8")))
  const trendReviewRuns = options["trend-reviews"]
    ? prepareTrendReviewRuns(root, JSON.parse(fs.readFileSync(options["trend-reviews"], "utf8")), {
        vault: options.vault,
      }).map(({ run }) => run)
    : []
  const knowledgeOptions = {
    vault: options.vault,
    ...(options["connection-review-run"]
      ? { connectionReviewRun: options["connection-review-run"] }
      : {}),
    trendReviewRuns,
    ...(options["knowledge-reviews"]
      ? {
          knowledgeSelections: JSON.parse(fs.readFileSync(options["knowledge-reviews"], "utf8")),
        }
      : {}),
    ...(options["company-review"]
      ? {
          companyReview: JSON.parse(fs.readFileSync(options["company-review"], "utf8")),
        }
      : {}),
  }
  if (command === "impact") {
    const query = Object.fromEntries(
      [
        ["source_version_id", options["source-version-id"]],
        ["event_id", options["event-id"]],
        ["claim_id", options["claim-id"]],
        ["run", options.run],
      ].filter(([, value]) => value !== undefined),
    )
    return ontologyImpact(root, graph, query, {
      vault: options.vault,
      ...knowledgeOptions,
      noteReviewRuns: [...new Set([...(options["note-review-run"] || []), ...trendReviewRuns])],
    })
  }
  if (command === "company")
    return ontologyCompany(root, graph, options["company-id"], knowledgeOptions)
  if (command === "paper")
    return ontologyResearchPaper(root, graph, options["work-id"], { vault: options.vault })
  if (command === "person")
    return ontologyResearchPerson(root, graph, options["person-id"], { vault: options.vault })
  if (command === "knowledge-index") {
    if (options["claim-id"] || options.run || options.entity || options["concept-id"])
      throw Error("Knowledge index requires a snapshot only")
    return ontologyKnowledgeIndex(root, graph, knowledgeOptions)
  }
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
  if (command === "knowledge")
    return ontologyKnowledge(root, graph, options["concept-id"], knowledgeOptions)
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
