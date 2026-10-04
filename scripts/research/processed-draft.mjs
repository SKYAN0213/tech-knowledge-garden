import fs from "node:fs"
import { sha256, assertSchema } from "./contracts.mjs"
import { readJSON, safePath } from "./run-state.mjs"
import { draftFingerprint, schemaForDraft, draftProblems, correctDraft } from "./editor.mjs"

// Validate the frozen model generation and each explicit correction. Resume
// must preserve editorial work rather than overwrite it with model output.
export function loadProcessedDraft(root, run, reviewed, documents, parses) {
  const base = `runs/${run}/`
  const reference = readJSON(root, base + "draft-generation-reference.json")
  const current = readJSON(root, base + "draft.json")
  if (!reference || !current) throw Error("Processing draft generation reference required")
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(reference.run || ""))
    throw Error("Invalid draft generation run")
  const origin = `runs/${reference.run}/`
  const checkpoint = readJSON(root, origin + "model-draft-checkpoint.json")
  const input = readJSON(root, origin + "model-draft-input.json")
  if (
    !checkpoint ||
    !input ||
    checkpoint.input_sha256 !== sha256(JSON.stringify(input)) ||
    reference.input_sha256 !== checkpoint.input_sha256 ||
    reference.output_sha256 !== checkpoint.output_sha256 ||
    input.claims_sha256 !== sha256(JSON.stringify(reviewed.claims)) ||
    input.documents_sha256 !== sha256(JSON.stringify(documents)) ||
    input.parses_sha256 !== sha256(JSON.stringify(parses))
  )
    throw Error("Processing draft source or generation binding changed")
  const bytes = fs.readFileSync(safePath(root, checkpoint.output_path))
  if (sha256(bytes) !== checkpoint.output_sha256) throw Error("Processing model draft changed")
  const original = JSON.parse(bytes)
  const validate = (record) => {
    assertSchema(record.draft, schemaForDraft())
    if (
      record.draft_id !== draftFingerprint(record.draft) ||
      record.public_approved !== false ||
      JSON.stringify(record.claim_ids) !==
        JSON.stringify(
          reviewed.claims.filter((c) => c.review.status === "verified").map((c) => c.claim_id),
        ) ||
      JSON.stringify(record.problems) !==
        JSON.stringify(
          draftProblems(
            record.draft,
            reviewed.claims.filter((c) => c.review.status === "verified"),
          ),
        )
    )
      throw Error("Processing working draft differs from its reviewed facts")
  }
  validate(original)
  const visited = new Set()
  function follow(record) {
    validate(record)
    if (
      record.draft_id === original.draft_id &&
      JSON.stringify(record) === JSON.stringify(original)
    )
      return
    if (visited.has(record.draft_id) || visited.size >= 32)
      throw Error("Invalid processing correction chain")
    visited.add(record.draft_id)
    if (
      !/^[a-f0-9]{64}$/.test(record.correction_input_sha256 || "") ||
      !/^[a-f0-9]{64}$/.test(record.previous_draft_id || "")
    )
      throw Error("Invalid processing correction identity")
    const correction = readJSON(root, base + `corrections/${record.correction_input_sha256}.json`)
    const previous = readJSON(root, base + `drafts/${record.previous_draft_id}.json`)
    if (
      !correction ||
      !previous ||
      sha256(JSON.stringify(correction)) !== record.correction_input_sha256
    )
      throw Error("Processing correction history changed")
    follow(previous)
    const { draft, ...review } = correction
    const expected = {
      ...correctDraft(previous, draft, reviewed.claims, review),
      correction_input_sha256: record.correction_input_sha256,
    }
    if (JSON.stringify(record) !== JSON.stringify(expected))
      throw Error("Processing correction no longer matches its decision")
  }
  follow(current)
  return current
}
