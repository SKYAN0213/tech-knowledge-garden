import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { prepareEditorialDraft } from "./research/editorial-authoring.mjs"
import { sha256 } from "./research/contracts.mjs"
import { assertStoredEvidence } from "./research/parser.mjs"
import { assertProcessedFactReview, isProcessedRun } from "./research/evidence-review-packet.mjs"
import { DEFAULT_ROOT, readJSON, atomicCreate, withLock } from "./research/run-state.mjs"
import { bindEditorialCompleteness } from "./research/editorial-completeness.mjs"

export async function main(args = process.argv.slice(2)) {
  const { values: v } = parseArgs({
    args,
    strict: true,
    options: {
      root: { type: "string" },
      run: { type: "string" },
      review: { type: "string" },
      "completeness-review": { type: "string" },
      deep: { type: "boolean", default: false },
    },
  })
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(v.run || "") || !v.review)
    throw Error("Standalone source-reviewed run and explicit editorial input required")
  const root = v.root || DEFAULT_ROOT
  return withLock(root, "run-" + v.run, async () => {
    if (isProcessedRun(root, v.run))
      throw Error(
        "Local processing runs retain their model draft checkpoint; use a separate GPT editorial run",
      )
    const base = `runs/${v.run}/`,
      documents = readJSON(root, base + "documents.json"),
      parses = readJSON(root, base + "parses.json"),
      reviewed = readJSON(root, base + "reviewed-claims.json")
    if (!documents || !parses || !reviewed)
      throw Error("Reviewed source run required before authoring")
    assertStoredEvidence(root, documents, parses)
    await assertProcessedFactReview(root, v.run, reviewed)
    const deepContext = v.deep ? readJSON(root, base + "deep-context.json") : null
    if (v.deep && !deepContext) throw Error("Reviewed deep-dive context required before authoring")
    const completenessContext = await bindEditorialCompleteness(
      root,
      v.run,
      v["completeness-review"],
    )
    const input = JSON.parse(fs.readFileSync(v.review, "utf8")),
      record = prepareEditorialDraft(input, reviewed.claims, parses, {
        deepContext,
        documents,
        completenessContext,
      })
    const previous = readJSON(root, base + "editorial-authoring-input.json"),
      current = readJSON(root, base + "draft.json")
    // The existing approval entry point expects a facts ledger, including for
    // directly reviewed facts. This is not an extraction/model checkpoint.
    const retainDirectFacts = () => {
      if (!readJSON(root, base + "claims.json"))
        atomicCreate(root, base + "claims.json", {
          claims: structuredClone(reviewed.claims),
          provenance: {
            provider: "gpt-editorial-direct-reviewed-facts",
            reviewed_claims_sha256: sha256(JSON.stringify(reviewed)),
            local_model_generated: false,
            model_extraction_completed: false,
          },
          requires_fact_review: false,
        })
    }
    if (previous || current) {
      if (
        !previous ||
        JSON.stringify(previous) !== JSON.stringify(input) ||
        (current && JSON.stringify(current) !== JSON.stringify(record))
      )
        throw Error(
          "Editorial authoring is immutable; preserve the existing draft and use another run",
        )
      retainDirectFacts()
      // An interrupted create can leave the frozen input without its draft.
      // Recover only those exact bytes; never overwrite a draft/correction.
      if (!current) {
        atomicCreate(root, base + "draft.json", record)
        return {
          status: "editorial_review",
          draft_id: record.draft_id,
          recovered: true,
          candidate_published: false,
        }
      }
      return {
        status: "editorial_review",
        draft_id: record.draft_id,
        reused: true,
        candidate_published: false,
      }
    }
    retainDirectFacts()
    atomicCreate(root, base + "editorial-authoring-input.json", input)
    atomicCreate(root, base + "draft.json", record)
    return {
      status: "editorial_review",
      draft_id: record.draft_id,
      reused: false,
      candidate_published: false,
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await main(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
