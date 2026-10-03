import { parseArgs } from "node:util"
import { loadSourceRegistration, registerSourceCatalog } from "./research/source-registration.mjs"
import { sourceRecipe } from "./research/source-recipes.mjs"
import { verifySourceOnboarding, activateSourceOnboarding } from "./research/source-onboarding.mjs"

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: "string", multiple: true },
      input: { type: "string" },
      repo: { type: "string" },
      root: { type: "string" },
      apply: { type: "boolean", default: false },
      channel: { type: "string" },
      "baseline-run": { type: "string" },
      "empty-run": { type: "string" },
      receipt: { type: "string" },
    },
  })
  const [command = "list"] = positionals
  if (
    positionals.length > 1 ||
    !["list", "plan", "register", "recipes", "verify", "activate"].includes(command)
  )
    throw Error(
      "Usage: npm run research:sources -- list|plan|register|recipes|verify|activate; verify --channel ID --baseline-run ID --empty-run ID; activate --channel ID --receipt PRIVATE_PATH [--apply]",
    )
  if (values.apply && !["register", "activate"].includes(command))
    throw Error("--apply is only valid with register or activate")
  const options = { ...values, ids: values.id || [] }
  if (["verify", "activate"].includes(command)) {
    if (!values.channel || values.id?.length || values.input)
      throw Error("Onboarding requires one --channel and no catalog selection")
    if (command === "verify") {
      if (!values["baseline-run"] || !values["empty-run"] || values.receipt)
        throw Error("verify requires --baseline-run and --empty-run")
      return verifySourceOnboarding({
        ...options,
        baselineRun: values["baseline-run"],
        emptyRun: values["empty-run"],
      })
    }
    if (!values.receipt || values["baseline-run"] || values["empty-run"])
      throw Error("activate requires --receipt")
    return activateSourceOnboarding(options)
  }
  if (values.channel || values.receipt || values["baseline-run"] || values["empty-run"])
    throw Error("Onboarding arguments require verify or activate")
  if (command === "register" && values.apply) return registerSourceCatalog(options)
  const loaded = loadSourceRegistration(options)
  if (command === "recipes")
    return Object.entries(loaded.recipes.recipes).map(([id, entry]) => ({
      id,
      description: entry.description,
      extends: entry.extends || null,
      config: sourceRecipe(id, loaded.recipes),
    }))
  const { next_channels, ...plan } = loaded.plan
  if (command === "list")
    return {
      ...plan,
      status: "read_only",
      results: plan.results.map((entry) => {
        const original = loaded.catalog.entries.find((item) => item.id === entry.catalog_id)
        const registered = next_channels.channels.find((item) => item.id === entry.channel_id)
        const daily = JSON.parse(
          loaded.snapshots.find((s) => s.file === "data/research-daily-routes.json").bytes,
        )
        return {
          ...entry,
          name: original.name,
          observation: registered?.onboarding?.observation || original.observation,
          role: original.role,
          suggested_recipe: original.suggested_recipe,
          remaining_checks: registered?.onboarding?.remaining_checks ?? original.remaining_checks,
          onboarding_status: registered?.onboarding?.status || null,
          daily_enabled: daily.routes.some((r) => r.channel_id === entry.channel_id && r.enabled),
        }
      }),
    }
  return { ...plan, status: "dry_run" }
}

try {
  console.log(JSON.stringify(await main(), null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
