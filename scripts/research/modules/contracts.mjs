import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assertSchema } from "../contracts.mjs"
import { safePath } from "../run-state.mjs"

export const id = { type: "string", pattern: "^[A-Za-z0-9_-]{1,100}$" }
export const text = { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" }
export const day = { type: "string", pattern: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}$" }
export const file = (scope = "repo") => ({ ...text, "x-path-scope": scope })
export const list = (items, maxItems = 40, minItems = 1) => ({
  type: "array",
  items,
  minItems,
  maxItems,
})
export const integer = (minimum, maximum) => ({ type: "integer", minimum, maximum })
export const schema = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
})
export function operation(
  description,
  inputSchema,
  run,
  { readOnly = false, network = false, model = false } = {},
) {
  return { description, inputSchema, run, readOnly, network, model }
}

export function validateArguments(value, contract, context, at = "$parameters") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of contract.required || [])
      if (!Object.hasOwn(value, key)) throw Error(`Missing module field: ${at}.${key}`)
    for (const key of Object.keys(value)) {
      if (contract.additionalProperties === false && !Object.hasOwn(contract.properties || {}, key))
        throw Error(`Unknown module field: ${at}.${key}`)
    }
  }
  assertSchema(value, contract, at)
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      value < (contract.minimum ?? -Infinity) ||
      value > (contract.maximum ?? Infinity))
  )
    throw Error(`Module bound exceeded: ${at}`)
  if (contract["x-path-scope"]) {
    safePath(context[contract["x-path-scope"]], value)
  }
  if (Array.isArray(value))
    value.forEach((entry, i) => validateArguments(entry, contract.items, context, `${at}[${i}]`))
  else if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value))
      if (contract.properties?.[key] || typeof contract.additionalProperties === "object")
        validateArguments(
          entry,
          contract.properties?.[key] || contract.additionalProperties,
          context,
          `${at}.${key}`,
        )
  return value
}

export const readConfig = (ctx, name) =>
  JSON.parse(fs.readFileSync(safePath(ctx.repo, `data/research-${name}.json`)))
export const repoFile = (ctx, value) => safePath(ctx.repo, value)

// Reuse the native command's complete source/review/approval gates. No shell,
// arbitrary command or unvalidated CLI flags are accepted by the module API.
export async function nativeResearch(ctx, command, params, mapping, { model = false } = {}) {
  const { main } = await import("../../research.mjs")
  const args = [command, "--root", ctx.root]
  if (["approve", "knowledge-draft"].includes(command)) args.push("--vault", ctx.vault)
  if (model) args.push("--model-policy", ctx.policy)
  for (const [key, flag] of Object.entries(mapping)) {
    if (params[key] === undefined) continue
    const values = Array.isArray(params[key]) ? params[key] : [params[key]]
    for (const value of values)
      args.push(`--${flag}`, key.endsWith("_file") ? repoFile(ctx, value) : String(value))
  }
  return main(args)
}

export function standalone(module, meta) {
  if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(meta)) {
    import("../module-cli.mjs")
      .then(({ moduleCLI }) => moduleCLI(process.argv.slice(2), module.id))
      .then((result) => {
        console.log(JSON.stringify(result, null, 2))
        if (["failed", "interrupted"].includes(result.state)) process.exitCode = 1
      })
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
