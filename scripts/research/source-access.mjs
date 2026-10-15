import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { assertStoredEvidence, hasBlockedPublicationMetadata } from "./parser.mjs"
import { parseResearchDate } from "./dates.mjs"
import { atomicCreate, atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"
import {
  recordSourcePolicy,
  requestSourcePolicyRecheck,
  readSourcePolicyState,
} from "./source-policy-state.mjs"

const title = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim()
const indexPath = (url) => `source-access/index/${sourceId(canonicalURL(url))}.json`

function validEvidence(root, proof) {
  if (
    proof?.schema !== "research-source-access-exclusion/v1" ||
    proof.reason !== "authentication-page" ||
    proof.scope !== "public-only" ||
    !hasBlockedPublicationMetadata(proof.parse) ||
    proof.document?.policy_status !== "checked" ||
    canonicalURL(proof.url) !== canonicalURL(proof.document.original_url) ||
    proof.parse.source_version_id !== proof.document.source_version_id
  )
    throw Error("Public access exclusion lacks exact authentication evidence")
  assertStoredEvidence(root, [proof.document], [proof.parse])
  return proof
}

export function readAccessExclusion(root, reference) {
  if (!reference?.path || !/^[a-f0-9]{64}$/.test(reference.sha256 || ""))
    throw Error("Access exclusion reference required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Access exclusion receipt changed")
  return validEvidence(root, JSON.parse(bytes))
}

export function matchingAccessExclusion(root, channel, link) {
  if (channel.access_policy !== "public-only") return null
  const index = readJSON(root, indexPath(link.url))
  if (!index || index.status === "reopened") return null
  if (index.status !== "excluded") throw Error("Invalid access exclusion index")
  const proof = readAccessExclusion(root, index.reference)
  const day = parseResearchDate(proof.parse.dates.published_at)?.day
  if (
    canonicalURL(proof.url) !== canonicalURL(link.url) ||
    title(proof.parse.title) !== title(link.text) ||
    (link.published_at && parseResearchDate(link.published_at)?.day !== day)
  )
    return null
  if (!link.published_at && link.listed_date_text?.slice(0, 5) !== day?.slice(5)) return null
  return { proof, reference: index.reference }
}

export async function rememberAccessExclusion(root, channel, link, document, parsed, sourceRun) {
  if (channel.access_policy !== "public-only") return null
  if (!hasBlockedPublicationMetadata(parsed)) {
    const prior = readSourcePolicyState(root, link.url)
    if (prior?.investigation_pending || prior?.recheck_requested)
      await recordSourcePolicy(root, link.url, document, {
        parsed,
        allowed_hosts: channel.allowed_hosts,
        request_interval_ms: channel.request_interval_ms,
      })
    return null
  }
  if (
    title(parsed.title) !== title(link.text) ||
    (link.published_at &&
      parseResearchDate(link.published_at)?.day !==
        parseResearchDate(parsed.dates.published_at)?.day)
  )
    return null
  const proof = validEvidence(root, {
    schema: "research-source-access-exclusion/v1",
    scope: "public-only",
    reason: "authentication-page",
    url: canonicalURL(link.url),
    channel_id: channel.channel_id,
    source_run: sourceRun,
    observed_at: document.observed_at,
    document,
    parse: parsed,
  })
  const bytes = JSON.stringify(proof, null, 2) + "\n"
  const hash = sha256(bytes)
  const reference = { path: `source-access/decisions/${hash}.json`, sha256: hash }
  await withLock(root, "source-access-" + sourceId(proof.url), async () => {
    if (!readJSON(root, reference.path)) atomicCreate(root, reference.path, bytes)
    else readAccessExclusion(root, reference)
    const index = readJSON(root, indexPath(proof.url))
    const policyState = readSourcePolicyState(root, proof.url)
    // Replaying a frozen member observation cannot undo a later public check
    // or explicit reopening. The old proof remains usable by its old run.
    if (
      (index?.status === "reopened" &&
        Date.parse(document.observed_at) <= Date.parse(index.reopened_at)) ||
      (policyState &&
        Date.parse(document.observed_at) < Date.parse(policyState.document.observed_at))
    )
      return
    atomicWrite(root, indexPath(proof.url), { status: "excluded", url: proof.url, reference })
  })
  await recordSourcePolicy(root, proof.url, document, {
    parsed,
    allowed_hosts: channel.allowed_hosts,
    request_interval_ms: channel.request_interval_ms,
  })
  return { proof, reference }
}

export function accessExclusionDetail(link, exclusion, requestPerformed = false) {
  const { proof, reference } = exclusion
  return {
    url: link.url,
    listed_at: link.published_at,
    listed_title: link.text,
    listing_source_version_id: link.listing_source_version_id,
    listing_parse_id: link.listing_parse_id,
    status: "public_access_excluded",
    access_scope: "metadata-only",
    request_performed: requestPerformed,
    observed_at: proof.observed_at,
    source_version_id: proof.document.source_version_id,
    parse_id: proof.parse.parse_id,
    source_published_at: proof.parse.dates.published_at,
    access_exclusion: reference,
  }
}

export function isCollectedDetail(detail) {
  return detail.status === "source_parsed_unreviewed" || detail.status === "public_access_excluded"
}

export function verifyAccessExclusionDetail(root, detail, scan) {
  const proof = readAccessExclusion(root, detail.access_exclusion)
  const listing = scan.parses.find((row) => row.parse_id === detail.listing_parse_id)
  const link = listing?.links?.find(
    (row) =>
      canonicalURL(row.url) === canonicalURL(detail.url) &&
      title(row.text) === title(detail.listed_title) &&
      (parseResearchDate(row.published_at)?.day === parseResearchDate(detail.listed_at)?.day ||
        scan.summary.date_resolutions?.some(
          (date) =>
            date.listing_parse_id === listing.parse_id &&
            canonicalURL(date.url) === canonicalURL(row.url) &&
            date.published_at === detail.listed_at,
        )),
  )
  if (
    scan.summary.access_scope !== "public-only" ||
    detail.access_scope !== "metadata-only" ||
    !link ||
    listing.source_version_id !== detail.listing_source_version_id ||
    canonicalURL(proof.url) !== canonicalURL(detail.url) ||
    detail.source_version_id !== proof.document.source_version_id ||
    detail.parse_id !== proof.parse.parse_id ||
    title(proof.parse.title) !== title(detail.listed_title) ||
    parseResearchDate(detail.listed_at)?.day !==
      parseResearchDate(proof.parse.dates.published_at)?.day ||
    !scan.documents.some((row) => row.source_version_id === proof.document.source_version_id) ||
    !scan.parses.some((row) => row.parse_id === proof.parse.parse_id) ||
    scan.candidates.some((row) =>
      row.source_urls?.some((url) => canonicalURL(url) === canonicalURL(detail.url)),
    )
  )
    throw Error("Excluded detail lacks matching listing, blocked source and public-only scope")
  return true
}

export async function reopenAccessExclusion(root, url) {
  await requestSourcePolicyRecheck(root, url)
  return withLock(root, "source-access-" + sourceId(canonicalURL(url)), async () => {
    const previous = readJSON(root, indexPath(url))
    if (!previous) throw Error("No recorded exclusion for URL")
    atomicWrite(root, indexPath(url), {
      ...previous,
      status: "reopened",
      reopened_at: new Date().toISOString(),
    })
    return { url: canonicalURL(url), status: "reopened" }
  })
}
