import fs from "node:fs"
import { assertSchema, sourceGeographySchema } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"

export const DEFAULT_SOURCE_RECIPES = JSON.parse(
  fs.readFileSync(new URL("../../data/research-source-recipes.json", import.meta.url), "utf8"),
)
const forbidden = new Set(["__proto__", "prototype", "constructor"])
const identity = new Set(["id", "channel_id", "url", "seed_urls", "entity_ids", "verification"])
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

// Keep optional declarations verbatim. Absence stays absent in collection
// inputs, so adding this contract does not rewrite established route snapshots.
export function declaredSourceGeography(route) {
  const declared = Object.fromEntries(
    Object.keys(sourceGeographySchema.properties)
      .filter((key) => Object.hasOwn(route, key))
      .map((key) => [key, route[key]]),
  )
  assertSchema(declared, sourceGeographySchema, "$source_geography")
  for (const declaration of Object.values(declared).filter((value) => value !== null)) {
    const url = assertURL(declaration.official_evidence.url)
    if (
      !url.hostname.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)
    )
      throw Error("Official geography evidence requires a public source hostname")
    if (
      [...url.searchParams.keys()].some((key) =>
        /^(?:api[-_]?key|token|secret|password|access[-_]?token|authorization)$/i.test(key),
      )
    )
      throw Error("Credential query must not be stored in official geography evidence")
  }
  return declared
}

export function sourceGeographyInventory(route) {
  const declared = declaredSourceGeography(route)
  return Object.fromEntries(
    Object.keys(sourceGeographySchema.properties).flatMap((key) => [
      [key, declared[key] || null],
      [`${key}_status`, declared[key] ? "declared" : "unknown"],
    ]),
  )
}

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
  if (
    Object.keys(sourceGeographySchema.properties).some((key) => Object.hasOwn(recipe.config, key))
  )
    throw Error(
      "Source geography must be declared on its registered route, not inherited from a recipe",
    )
  return mergeSourceOptions(
    recipe.extends ? sourceRecipe(recipe.extends, library, [...chain, id]) : {},
    recipe.config,
  )
}

export function resolveSourceRecipe(route, library = DEFAULT_SOURCE_RECIPES) {
  declaredSourceGeography(route)
  return route.source_recipe
    ? mergeSourceOptions(sourceRecipe(route.source_recipe, library), route)
    : route
}
