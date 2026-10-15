import test from "node:test"
import assert from "node:assert/strict"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { checkResearchMCP } from "../integrations/research-mcp/check.mjs"

test("selective MCP checks reject mutation, models, network and disabled operations before launching", async (t) => {
  const { ctx } = fixture(t)
  for (const [module, operation] of [
    ["validation", "evaluation_import"],
    ["writing", "draft"],
    ["publication", "deliver"],
  ]) {
    await assert.rejects(
      () => checkResearchMCP({ ...ctx, checks: [{ module, operation, parameters: {} }] }),
      /read-only without network or model/,
    )
  }
  await assert.rejects(
    () =>
      checkResearchMCP({
        ...ctx,
        modules: ["validation"],
        checks: [{ module: "collection", operation: "inventory", parameters: {} }],
      }),
    /operation is not enabled/,
  )
})

test("selective MCP checks validate pinned plan paths and explicit check selection", async (t) => {
  const { ctx } = fixture(t)
  await assert.rejects(() => checkResearchMCP({ ...ctx, checks: [] }), /one to six/)
  await assert.rejects(
    () =>
      checkResearchMCP({
        ...ctx,
        checks: [
          {
            module: "validation",
            operation: "progress",
            parameters: { plan_file: "../other-plan.md" },
          },
        ],
      }),
    /enum|escapes/,
  )
})
