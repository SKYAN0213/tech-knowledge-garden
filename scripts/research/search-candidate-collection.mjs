import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sourceId, sha256 } from "./contracts.mjs"
import { SourceFetcher } from "./fetch.mjs"
import { parseDocument } from "./parser.mjs"
import { atomicWrite, readJSON, RunState, withLock } from "./run-state.mjs"
import { fetchWithPolicy } from "./source-policy.mjs"

function selectSearchCandidates(search, candidateKeys) {
  if (!Array.isArray(candidateKeys) || candidateKeys.length < 1 || candidateKeys.length > 12)
    throw Error("Select one to twelve exact search candidates per collection run")
  if (new Set(candidateKeys).size !== candidateKeys.length)
    throw Error("Duplicate candidate keys in collection request")
  const selected = candidateKeys.map((key) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw Error("Invalid exact search candidate key")
    const matches = search.candidates.filter((candidate) => candidate.key === key)
    if (matches.length !== 1) throw Error("One exact search candidate required: " + key)
    const candidate = matches[0]
    if (!Array.isArray(candidate.source_urls) || candidate.source_urls.length !== 1)
      throw Error("Search candidate must resolve to one exact original URL: " + key)
    const url = candidate.source_urls[0]
    const canonical = canonicalURL(url)
    if (key !== `source-${sourceId(canonical)}`)
      throw Error("Search candidate key does not match canonical URL: " + key)
    return { candidate_key: key, url }
  })
  if (new Set(selected.map((candidate) => canonicalURL(candidate.url))).size !== selected.length)
    throw Error("Different candidate keys resolve to the same canonical URL")
  return selected
}

export async function collectSearchCandidates({
  root,
  runId,
  searchRunId,
  candidateKeys,
  articleProfiles,
  fetcher = new SourceFetcher(root, { pdf_profiles: articleProfiles }),
  fetchSource = fetchWithPolicy,
  parseSource = parseDocument,
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId || "")) throw Error("Valid collection run ID required")
  if (!/^[a-zA-Z0-9_-]+$/.test(searchRunId || "")) throw Error("Valid search run ID required")
  if (runId === searchRunId) throw Error("Collection and search runs must be distinct")
  if (!Array.isArray(articleProfiles)) throw Error("Article profiles are required")
  const search = readJSON(root, `runs/${searchRunId}/search.json`)
  if (!search || !Array.isArray(search.candidates)) throw Error("Stored search candidates required")
  const selected = selectSearchCandidates(search, candidateKeys)
  const input = {
    schema: "research-search-candidate-collection-input/v1",
    search_run: searchRunId,
    search_sha256: sha256(JSON.stringify(search)),
    candidates: selected,
    article_profiles_sha256: sha256(JSON.stringify(articleProfiles)),
    fetcher_sha256: sha256(fs.readFileSync("scripts/research/fetch.mjs")),
    source_policy_sha256: sha256(fs.readFileSync("scripts/research/source-policy.mjs")),
    parser_sha256: sha256(fs.readFileSync("scripts/research/parser.mjs")),
    worker_sha256: sha256(fs.readFileSync("integrations/research-worker/worker.py")),
  }

  return withLock(root, "run-" + runId, async () => {
    const run = new RunState(root, runId, input)
    const documents = []
    const parses = []
    const results = []
    const manifestPath = `runs/${runId}/search-candidate-collection.json`
    const persist = () => {
      const fetchFailed = results.filter((result) => result.status === "fetch_failed").length
      const parseFailed = results.filter((result) => result.status === "parse_failed").length
      const parsed = results.filter((result) => result.status === "source_parsed").length
      const complete = results.length === selected.length && parsed === selected.length
      atomicWrite(root, `runs/${runId}/documents.json`, documents)
      atomicWrite(root, `runs/${runId}/parses.json`, parses)
      atomicWrite(root, manifestPath, {
        schema: "research-search-candidate-collection/v1",
        ...input,
        status: complete ? "complete" : "partial",
        processed: results.length,
        total: selected.length,
        source_parsed: parsed,
        fetch_failed: fetchFailed,
        parse_failed: parseFailed,
        not_acquired: results.filter(
          (result) => result.status.startsWith("fetch_") && result.status !== "fetch_failed",
        ).length,
        parse_needs_review: results.filter((result) => result.status === "parse_needs_review")
          .length,
        candidate_published: false,
        results,
      })
    }

    for (const candidate of selected) {
      const sourceToken = sha256(candidate.candidate_key).slice(0, 14)
      let document
      try {
        document = await run.stage(`fetch-${sourceToken}`, candidate, () =>
          fetchSource(root, fetcher, candidate.url),
        )
      } catch (error) {
        results.push({
          ...candidate,
          status: "fetch_failed",
          error: error instanceof Error ? error.message : String(error),
        })
        persist()
        continue
      }
      documents.push(document)
      if (!["captured", "not_modified"].includes(document.fetch_status)) {
        results.push({
          ...candidate,
          status:
            document.fetch_status === "failed" ? "fetch_failed" : `fetch_${document.fetch_status}`,
          source_id: document.source_id,
          fetch_status: document.fetch_status,
          ...(document.policy_status ? { policy_status: document.policy_status } : {}),
          ...(document.error ? { error: document.error } : {}),
        })
        persist()
        continue
      }

      const options =
        articleProfiles.find((profile) => new RegExp(profile.url_pattern).test(document.final_url))
          ?.options || {}
      try {
        const parse = await run.stage(
          `parse-${sourceToken}`,
          {
            document,
            options,
            worker_sha256: input.worker_sha256,
          },
          () => parseSource(root, document, options),
        )
        parses.push(parse)
        results.push({
          ...candidate,
          status: parse.status === "extracted" ? "source_parsed" : "parse_needs_review",
          source_id: document.source_id,
          source_version_id: document.source_version_id,
          parse_id: parse.parse_id,
          fetch_status: document.fetch_status,
          parse_status: parse.status,
        })
      } catch (error) {
        results.push({
          ...candidate,
          status: "parse_failed",
          source_id: document.source_id,
          source_version_id: document.source_version_id,
          fetch_status: document.fetch_status,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      persist()
    }
    persist()
    const receipt = readJSON(root, manifestPath)
    return {
      status: receipt.status,
      processed: receipt.processed,
      total: receipt.total,
      source_parsed: receipt.source_parsed,
      fetch_failed: receipt.fetch_failed,
      parse_failed: receipt.parse_failed,
      not_acquired: receipt.not_acquired,
      parse_needs_review: receipt.parse_needs_review,
      candidate_published: false,
      receipt: manifestPath,
    }
  })
}
