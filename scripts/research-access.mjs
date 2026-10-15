import fs from "node:fs"
import { parseArgs } from "node:util"
import { registry } from "./research/discovery.mjs"
import { rememberAccessExclusion, reopenAccessExclusion } from "./research/source-access.mjs"
import { DEFAULT_ROOT, readJSON } from "./research/run-state.mjs"
const { values, positionals } = parseArgs({ allowPositionals: true, options: { root: { type: "string", default: DEFAULT_ROOT }, run: { type: "string" }, channel: { type: "string" }, url: { type: "string" }, apply: { type: "boolean", default: false } } })
try {
  if (positionals.length !== 1 || !["seed", "reopen"].includes(positionals[0])) throw Error("Usage: research-access.mjs seed --run ID --channel ID [--apply]; reopen --url URL --apply")
  if (positionals[0] === "reopen") {
    if (!values.apply || !values.url || values.run || values.channel) throw Error("Explicit reopen requires --url and --apply")
    console.log(JSON.stringify(await reopenAccessExclusion(values.root, values.url)))
  } else {
    if (!/^[A-Za-z0-9_-]+$/.test(values.run || "") || !values.channel || values.url) throw Error("Seed requires exact source run and channel")
    const read = (name) => JSON.parse(fs.readFileSync(`data/research-${name}.json`))
    const channel = registry(read("source-channels"), read("watchlist"), read("acquisition")).find((row) => row.channel_id === values.channel)
    const summary = readJSON(values.root, `runs/${values.run}/list-scan.json`)
    const documents = readJSON(values.root, `runs/${values.run}/documents.json`)
    const parses = readJSON(values.root, `runs/${values.run}/parses.json`)
    if (channel?.access_policy !== "public-only" || summary?.channel_id !== channel.channel_id || !Array.isArray(documents) || !Array.isArray(parses)) throw Error("Seed needs a public-only route and its stored scan")
    let recorded = 0
    for (const detail of summary.details || []) {
      const document = documents.find((row) => row.source_version_id === detail.source_version_id)
      const parsed = parses.find((row) => row.parse_id === detail.parse_id)
      if (parsed?.status !== "blocked" || parsed.quality?.reason !== "authentication-page") continue
      const listing = parses.find((row) => row.links?.some((link) => link.url === detail.url && (link.published_at === detail.listed_at || summary.date_resolutions?.some((date) => date.url === link.url && date.published_at === detail.listed_at))))
      const link = listing?.links?.find((row) => row.url === detail.url)
      if (!link || !document) throw Error("Blocked detail lacks its stored listing")
      if (values.apply && await rememberAccessExclusion(values.root, channel, { ...link, published_at: detail.listed_at }, document, parsed, values.run)) recorded++
      else if (!values.apply) recorded++
    }
    console.log(JSON.stringify({ status: values.apply ? "recorded" : "dry_run", channel_id: channel.channel_id, access_exclusions: recorded, candidate_approved: false, candidate_published: false }, null, 2))
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
