import { module as collection } from "./modules/collection.mjs"
import { module as parsing } from "./modules/parsing.mjs"
import { module as edition } from "./modules/edition.mjs"
import { module as classification } from "./modules/classification.mjs"
import { module as curation } from "./modules/curation.mjs"
import { module as selection } from "./modules/selection.mjs"
import { module as evidence } from "./modules/evidence.mjs"
import { module as writing } from "./modules/writing.mjs"
import { module as knowledge } from "./modules/knowledge.mjs"
import { module as validation } from "./modules/validation.mjs"
import { module as publication } from "./modules/publication.mjs"
import { module as reasoning } from "./modules/reasoning.mjs"
import { validateArguments } from "./modules/contracts.mjs"

export const MODULES = Object.freeze([
  collection,
  parsing,
  edition,
  classification,
  curation,
  selection,
  evidence,
  writing,
  knowledge,
  validation,
  publication,
  reasoning,
])
export function moduleOperation(moduleId, operationId) {
  const module = MODULES.find((entry) => entry.id === moduleId)
  const operation = module?.operations[operationId]
  if (!operation || !Object.hasOwn(module.operations, operationId))
    throw Error("Unknown research module operation")
  return { module, operation }
}
export function moduleCatalog(ids = MODULES.map((module) => module.id)) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !MODULES.some((module) => module.id === id))
  )
    throw Error("Unknown or duplicate module selection")
  return {
    schema: "research-module-catalog/v1",
    modules: MODULES.filter((module) => ids.includes(module.id)).map(
      ({ operations, ...module }) => ({
        ...module,
        operations: Object.entries(operations).map(([id, { run, ...operation }]) => ({
          id,
          tool_name: `${module.id}_${id}`,
          ...operation,
        })),
      }),
    ),
  }
}
export async function executeModule(context, moduleId, operationId, parameters = {}) {
  const { operation } = moduleOperation(moduleId, operationId)
  validateArguments(parameters, operation.inputSchema, context)
  return operation.run(context, parameters)
}
