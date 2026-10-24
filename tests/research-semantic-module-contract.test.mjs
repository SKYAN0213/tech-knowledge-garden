import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { moduleOperation } from "../scripts/research/module-registry.mjs"
import { validateArguments } from "../scripts/research/modules/contracts.mjs"

function contract(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "semantic-module-contract-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, "review.json"), "{}")
  return {
    context: { root, repo: root },
    schema: moduleOperation("knowledge", "semantic_prepare").operation.inputSchema,
  }
}

test("semantic module accepts scoped full registry expansion references", (t) => {
  const { context, schema } = contract(t),
    input = {
      workflow_id: "targeted-registry",
      event_ids: ["a".repeat(16)],
      full_registry_event_ids: ["b".repeat(16)],
      full_registry_review_refs: [
        { event_id: "b".repeat(16), path: "review.json", sha256: "c".repeat(64) },
      ],
    }
  assert.equal(validateArguments(input, schema, context), input)
  assert.doesNotThrow(() =>
    validateArguments(
      {
        workflow_id: input.workflow_id,
        full_registry_event_ids: [],
        full_registry_review_refs: [],
      },
      schema,
      context,
    ),
  )
  for (const invalid of [null, "a".repeat(16), ["bad"], ["a".repeat(16), "a".repeat(16)]])
    assert.throws(() =>
      validateArguments({ ...input, full_registry_event_ids: invalid }, schema, context),
    )
  assert.throws(
    () =>
      validateArguments(
        {
          ...input,
          full_registry_review_refs: [
            { event_id: "b".repeat(16), path: "../review.json", sha256: "c".repeat(64) },
          ],
        },
        schema,
        context,
      ),
    /escapes/,
  )
})

test("semantic module accepts exact root-scoped pilot references and selected article IDs", (t) => {
  const { context, schema } = contract(t)
  const input = {
    workflow_id: "pilot-20261023",
    event_ids: ["a".repeat(16), "b".repeat(16)],
    pilot_review_refs: [{ path: "review.json", sha256: "c".repeat(64) }],
    approval_selection_refs: [{ path: "review.json", sha256: "d".repeat(64) }],
    completed_review_refs: [{ path: "review.json", sha256: "e".repeat(64) }],
    offset: 0,
    limit: 20,
  }
  assert.equal(validateArguments(input, schema, context), input)
  assert.doesNotThrow(() => validateArguments({ workflow_id: input.workflow_id }, schema, context))
  assert.doesNotThrow(() =>
    validateArguments({ workflow_id: input.workflow_id, pilot_review_refs: [] }, schema, context),
  )
  assert.doesNotThrow(() =>
    validateArguments(
      { workflow_id: input.workflow_id, approval_selection_refs: [] },
      schema,
      context,
    ),
  )
  assert.doesNotThrow(() =>
    validateArguments(
      { workflow_id: input.workflow_id, completed_review_refs: [] },
      schema,
      context,
    ),
  )
})

test("semantic module rejects unbound, escaping and oversized pilot selections", (t) => {
  const { context, schema } = contract(t)
  const validate = (extra) => validateArguments({ workflow_id: "pilot", ...extra }, schema, context)
  assert.throws(() => validate({ event_ids: [] }), /Missing items/)
  assert.throws(() => validate({ event_ids: ["a".repeat(16), "a".repeat(16)] }), /Duplicate items/)
  assert.throws(() => validate({ event_ids: ["article-title"] }), /pattern/)
  assert.throws(() => validate({ event_ids: Array(1001).fill("a".repeat(16)) }), /Too many/)
  assert.throws(() => validate({ pilot_review_refs: [{ path: "review.json" }] }), /Missing/)
  assert.throws(
    () => validate({ pilot_review_refs: [{ path: "../review.json", sha256: "c".repeat(64) }] }),
    /escapes/,
  )
  assert.throws(
    () => validate({ pilot_review_refs: [{ path: "review.json", sha256: "missing" }] }),
    /pattern/,
  )
  assert.throws(() => validate({ approval_selection_refs: [{ path: "review.json" }] }), /Missing/)
  assert.throws(
    () =>
      validate({ approval_selection_refs: [{ path: "../review.json", sha256: "d".repeat(64) }] }),
    /escapes/,
  )
  assert.throws(
    () => validate({ approval_selection_refs: [{ path: "review.json", sha256: "missing" }] }),
    /pattern/,
  )
  assert.throws(() => validate({ completed_review_refs: [{ path: "review.json" }] }), /Missing/)
  assert.throws(
    () => validate({ completed_review_refs: [{ path: "../review.json", sha256: "e".repeat(64) }] }),
    /escapes/,
  )
  assert.throws(
    () => validate({ completed_review_refs: [{ path: "review.json", sha256: "missing" }] }),
    /pattern/,
  )
  assert.throws(
    () =>
      validate({
        completed_review_refs: Array(1001).fill({ path: "review.json", sha256: "e".repeat(64) }),
      }),
    /Too many/,
  )
})
