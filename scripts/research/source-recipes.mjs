import fs from "node:fs"

export const DEFAULT_SOURCE_RECIPES = JSON.parse(
  fs.readFileSync(new URL("../../data/research-source-recipes.json", import.meta.url), "utf8"),
)
const forbidden = new Set(["__proto__", "prototype", "constructor"])
const identity = new Set(["id", "channel_id", "url", "seed_urls", "entity_ids", "verification"])
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

export function mergeSourceOptions(base, override) {
  if (!object(base) || !object(override)) throw Error("Source options must be objects")
  const result = {}
  for (const [key, value] of Object.entries(base)) {
    if (forbidden.has(key)) throw Error("Unsafe source option key")
    result[key] = object(value) ? mergeSourceOptions({}, value) : structuredClone(value)
  }
  for (const [key, value] of Object.entries(override)) {
    if (forbidden.has(key)) throw Error("Unsafe source option key")
    result[key] = object(value)
      ? mergeSourceOptions(object(result[key]) ? result[key] : {}, value)
      : structuredClone(value)
  }
  return result
}

export function sourceRecipe(id, library = DEFAULT_SOURCE_RECIPES, chain = []) {
  if (library?.schema !== "research-source-recipes/v1" || !library.recipes)
    throw Error("Invalid source recipe library")
  if (chain.includes(id)) throw Error("Cyclic source recipe: " + id)
  const recipe = Object.hasOwn(library.recipes, id) && library.recipes[id]
  if (!recipe || !object(recipe.config)) throw Error("Unknown or invalid source recipe: " + id)
  if (Object.keys(recipe.config).some((key) => identity.has(key)))
    throw Error("Source recipe cannot replace route identity")
  return mergeSourceOptions(
    recipe.extends ? sourceRecipe(recipe.extends, library, [...chain, id]) : {},
    recipe.config,
  )
}

export function resolveSourceRecipe(route, library = DEFAULT_SOURCE_RECIPES) {
  return route.source_recipe
    ? mergeSourceOptions(sourceRecipe(route.source_recipe, library), route)
    : route
}
