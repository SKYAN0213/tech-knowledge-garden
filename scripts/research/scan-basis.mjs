import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"

// Only prove a scope for a literal, anchored HTTP(S) authority. Alternation,
// variable hosts and optional separators remain global dependencies. Do not
// guess whether two arbitrary regular expressions can overlap.
function literalProfileHost(pattern) {
  if (typeof pattern !== "string" || pattern.includes("|")) return null
  const match = pattern.match(/^\^https?:\/\/((?:[A-Za-z0-9-]|\\\.)+)\/(?![?*{])/)
  if (!match) return null
  try {
    new RegExp(pattern)
    const host = match[1].replaceAll("\\.", ".").toLowerCase()
    return new URL("https://" + host).hostname === host ? host : null
  } catch {
    return null
  }
}

export function collectionArticleProfiles(channel, articleProfiles) {
  const hosts = channel.allowed_hosts
  if (!Array.isArray(hosts) || !hosts.length || hosts.some((host) => typeof host !== "string"))
    return articleProfiles
  const allowed = new Set(hosts.map((host) => host.toLowerCase()))
  const referenced = new Set()
  const visit = (value) => {
    if (typeof value === "string") referenced.add(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === "object") Object.values(value).forEach(visit)
  }
  visit(channel)
  // Preserve profile order: overlapping matching profiles must still fail the
  // existing ambiguity check, and explicitly selected IDs remain dependencies.
  return articleProfiles.filter((profile) => {
    const host = literalProfileHost(profile.url_pattern)
    return host === null || allowed.has(host) || referenced.has(profile.id)
  })
}

export function scanListImplementationFingerprints(repo = process.cwd()) {
  const modules = {
    list_scan_sha256: "scripts/research/list-scan.mjs",
    api_scan_sha256: "scripts/research/api-scan.mjs",
    api_helpers_sha256: "scripts/research/api.mjs",
    sec_scan_sha256: "scripts/research/sec-scan.mjs",
    wordpress_scan_sha256: "scripts/research/wordpress-scan.mjs",
    monthly_scan_sha256: "scripts/research/monthly-scan.mjs",
    ur_scan_sha256: "scripts/research/ur-scan.mjs",
    kuka_scan_sha256: "scripts/research/kuka-scan.mjs",
    abb_scan_sha256: "scripts/research/abb-scan.mjs",
    rss_scan_sha256: "scripts/research/rss-scan.mjs",
    form_html_scan_sha256: "scripts/research/form-html-scan.mjs",
    parser_sha256: "scripts/research/parser.mjs",
    scan_evidence_sha256: "scripts/research/scan-evidence.mjs",
    supporting_sources_sha256: "scripts/research/supporting-sources.mjs",
    scan_completion_sha256: "scripts/research/scan-completion.mjs",
    run_state_sha256: "scripts/research/run-state.mjs",
    scan_basis_sha256: "scripts/research/scan-basis.mjs",
    collection_cli_sha256: "scripts/research-scan.mjs",
    collection_command_sha256: "scripts/research/list-scan-command.mjs",
  }
  return Object.fromEntries(
    Object.entries(modules).map(([key, file]) => [
      key,
      sha256(fs.readFileSync(path.join(repo, file))),
    ]),
  )
}

export function collectionBasis(channel, articleProfiles, repo = process.cwd()) {
  const route = structuredClone(channel)
  // Editorial progress notes and registration status do not change selectors,
  // allowed hosts or parsing. Collection permission is checked separately.
  delete route.onboarding
  const files = [
    "scripts/research/fetch.mjs",
    "scripts/research/discovery.mjs",
    "scripts/research/source-policy.mjs",
    "scripts/research/source-recipes.mjs",
    "integrations/research-worker/worker.py",
  ]
  return {
    schema: "research-collection-basis/v2",
    channel_id: channel.channel_id,
    route_sha256: sha256(JSON.stringify(route)),
    article_profile_scope: "allowed-hosts-conservative/v1",
    article_profiles_sha256: sha256(
      JSON.stringify(collectionArticleProfiles(channel, articleProfiles)),
    ),
    implementation: scanListImplementationFingerprints(repo),
    dependencies: Object.fromEntries(
      files.map((file) => [file, sha256(fs.readFileSync(path.join(repo, file)))]),
    ),
    node_version: process.version,
  }
}
