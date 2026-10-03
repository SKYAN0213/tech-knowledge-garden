import fs from "node:fs"
import path from "node:path"
import { approvalSourceChange } from "../article-identity.mjs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertStoredEvidence, articleContentFingerprint } from "./parser.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
  traceOntologyClaim,
} from "./ontology.mjs"
import { retrospectiveInventory } from "./retrospective.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const target = (candidate) =>
  Boolean(
    candidate.approval &&
    (candidate.source_revision_alert ||
      approvalSourceChange(candidate) ||
      candidate.related_source_observations?.some(
        (o) => o.decision !== "reviewed_publisher_record_alias",
      )),
  )

function implementationFingerprint() {
  return sha256(
    [
      import.meta.url,
      ...[
        "../article-identity.mjs",
        "./ontology.mjs",
        "./parser.mjs",
        "./retrospective.mjs",
        "./claims.mjs",
        "./contracts.mjs",
        "./preview.mjs",
      ].map((p) => new URL(p, import.meta.url)),
    ]
      .map((file) => sha256(fs.readFileSync(new URL(file))))
      .join("\n") + process.version,
  )
}

export function inspectSourceRevisionQueue({ root, snapshot, backlogFile }) {
  if (!/^[A-Za-z0-9_-]+$/.test(snapshot || "")) throw Error("Explicit revision snapshot required")
  const relative = `review-queues/${snapshot}/queue.json`,
    queue = readJSON(root, relative)
  if (!queue) throw Error("Revision snapshot missing")
  const { sha256: expected, ...body } = queue
  if (
    queue.schema !== "research-source-revision-queue/v1" ||
    sha256(JSON.stringify(body)) !== expected ||
    queue.input_sha256 !== sha256(JSON.stringify(queue.inputs))
  )
    throw Error("Revision queue snapshot hash mismatch")
  if (sha256(fs.readFileSync(backlogFile)) !== queue.inputs.backlog_sha256)
    throw Error("Revision queue backlog is stale")
  if (queue.inputs.implementation_sha256 !== implementationFingerprint())
    throw Error("Revision queue code is stale")
  for (const approved of queue.inputs.approved_files) {
    for (const [file, hash] of Object.entries(approved.files))
      if (sha256(fs.readFileSync(safePath(approved.root, `runs/${approved.run}/${file}`))) !== hash)
        throw Error("Revision queue approval files changed")
    loadApprovedOntologyInput(approved.root, approved.run)
  }
  for (const source of queue.inputs.current_source_files)
    for (const [file, hash] of Object.entries(source.files))
      if (sha256(fs.readFileSync(safePath(root, file))) !== hash)
        throw Error("Revision queue source files changed")
  for (const entry of queue.entries) {
    if (!entry.current_source) continue
    const prefix = `runs/${entry.current_source.source_run}/`
    const document = readJSON(root, prefix + "documents.json").find(
      (d) => d.source_version_id === entry.current_source.source_version_id,
    )
    const parse = readJSON(root, prefix + "parses.json").find(
      (p) => p.parse_id === entry.current_source.parse_id,
    )
    assertStoredEvidence(root, [document], [parse])
  }
  return {
    path: relative,
    sha256: sha256(fs.readFileSync(safePath(root, relative))),
    counts: queue.counts,
    entries: queue.entries,
    candidate_approved: false,
    candidate_published: false,
    status: "verified_private_review_queue",
  }
}

// Read the existing source store once; reuse its immutable-byte/parse verifier.
// A matching metadata row alone never establishes available source evidence.
export function loadRevisionSourceEvidence(root, candidates) {
  const pending = candidates.filter(target)
  const found = new Map()
  const directory = safePath(root, "runs")
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]+$/.test(entry.name)) continue
    const docsPath = `runs/${entry.name}/documents.json`,
      parsesPath = `runs/${entry.name}/parses.json`
    const docs = readJSON(root, docsPath)
    if (docs === null) continue
    if (!Array.isArray(docs)) throw Error("Invalid source inventory: " + docsPath)
    if (!docs.some((d) => pending.some((c) => c.article_source_version_id === d.source_version_id)))
      continue
    const parses = readJSON(root, parsesPath)
    // v1 source snapshots aggregate body references; their parse receipts live
    // under scans/. They are not standalone source runs and remain archived.
    const archive =
      parses === null ? readJSON(root, `runs/${entry.name}/archive-manifest.json`) : null
    if (archive?.schema === "research-archive/v1" && archive.run_id === entry.name) continue
    if (!Array.isArray(parses))
      throw Error("Matching source run lacks parse inventory: " + entry.name)
    for (const candidate of pending) {
      const document = docs.find((d) => d.source_version_id === candidate.article_source_version_id)
      const parse = parses.find(
        (p) =>
          p.parse_id === candidate.article_parse_id &&
          p.source_version_id === candidate.article_source_version_id,
      )
      if (!document || !parse || found.has(candidate.key)) continue
      assertStoredEvidence(root, [document], [parse])
      if (articleContentFingerprint(parse) !== candidate.article_content_sha256)
        throw Error("Current revision source fingerprint changed: " + candidate.key)
      found.set(candidate.key, {
        document,
        parse,
        source_run: entry.name,
        files: {
          [docsPath]: sha256(fs.readFileSync(safePath(root, docsPath))),
          [parsesPath]: sha256(fs.readFileSync(safePath(root, parsesPath))),
        },
      })
    }
  }
  return found
}

export function projectSourceRevisionQueue({ candidates, inventory, approvals, currentSources }) {
  if (
    !Array.isArray(candidates) ||
    inventory?.schema !== "research-retrospective-inventory/v1" ||
    !(approvals instanceof Map) ||
    !(currentSources instanceof Map)
  )
    throw Error("Source revision queue requires pinned inventory, approvals and stored sources")
  const entries = candidates
    .filter(target)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((candidate) => {
      const approved = approvals.get(candidate.approval.approved_run)
      if (
        !approved ||
        approved.article.event_id !== candidate.event_id ||
        sha256(JSON.stringify(approved.article)) !== candidate.approval.article_sha256
      )
        throw Error("Revision candidate approval or event changed: " + candidate.key)
      const graph = projectEvidenceOntology([approved])
      const cited = graph.nodes
        .filter((n) => n.type === "Claim")
        .map((n) => traceOntologyClaim(graph, n.claim_id, approved.run))
      const changed = approvalSourceChange(candidate)
      const reviewedVersion =
        changed?.reviewed_source_version_id ||
        candidate.source_revision_alert?.reviewed_source_version_id ||
        candidate.approval.source_version_id
      const affected = cited.filter((t) =>
        t.evidence.some((e) => e.source_version_id === reviewedVersion),
      )
      const event = inventory.events.find((e) => e.event_id === candidate.event_id)
      const dependencies = event?.dependencies || {
        edition_paths: [],
        observations: [],
        topic_paths: [],
        explicit_concept_paths: [],
        shared_source_concept_paths: [],
      }
      const sources = new Set(approved.article.source_urls.map(canonicalURL))
      const concepts = inventory.concepts
        .filter((c) => (c.verified_sources || []).some((u) => sources.has(canonicalURL(u))))
        .map((c) => c.path)
      const current = currentSources.get(candidate.key)
      return {
        candidate_key: candidate.key,
        event_id: candidate.event_id,
        approved_run: approved.run,
        reason:
          changed?.reason ||
          candidate.source_revision_alert?.change_basis ||
          "related_source_observation",
        review_status: "review_required",
        latest_approval_preserved: true,
        source_evidence_state: current
          ? "verified_stored_source"
          : "missing_current_source_evidence",
        change: changed || candidate.source_revision_alert || null,
        current_source: current
          ? {
              url: current.document.original_url,
              source_version_id: current.document.source_version_id,
              parse_id: current.parse.parse_id,
              body_sha256: current.document.body_sha256,
              observed_at: current.document.observed_at,
              source_run: current.source_run,
            }
          : null,
        related_source_observations: candidate.related_source_observations || [],
        affected_claims: affected.map((t) => ({
          claim_id: t.claim.claim_id,
          statement: t.claim.statement,
          evidence: t.evidence,
        })),
        dependencies: {
          ...dependencies,
          explicit_concept_ids: approved.article.article_review.concept_ids || [],
          shared_source_concept_paths: [
            ...new Set([...dependencies.shared_source_concept_paths, ...concepts]),
          ].sort(),
        },
        historical_appearances: event?.appearances || [],
        dependency_basis: "explicit_event_concept_source_links",
        comparison_incomplete: !current,
        recommended_actions: [
          "compare_original_versions",
          "review_affected_facts",
          "review_dependent_notes",
          "preserve_event_and_feed_ids",
        ],
      }
    })
  return {
    schema: "research-source-revision-queue/v1",
    entries,
    counts: {
      pending: entries.length,
      stored_source_available: entries.filter((e) => !e.comparison_incomplete).length,
      affected_claims: entries.reduce((n, e) => n + e.affected_claims.length, 0),
    },
    candidate_approved: false,
    candidate_published: false,
    drive_written: false,
    public_verified: false,
  }
}

export async function saveSourceRevisionQueue({
  root,
  snapshot,
  backlogFile,
  vault,
  approvalRoots = new Map(),
}) {
  if (!/^[A-Za-z0-9_-]+$/.test(snapshot || "")) throw Error("Explicit revision snapshot required")
  return withLock(root, "source-revision-" + snapshot, async () => {
    const relative = `review-queues/${snapshot}/queue.json`,
      previous = readJSON(root, relative)
    const bytes = fs.readFileSync(backlogFile),
      backlog = JSON.parse(bytes)
    if (backlog.schema !== "research-candidates/v1" || !Array.isArray(backlog.candidates))
      throw Error("Candidate backlog required")
    const generatedAt = previous?.generated_at || new Date().toISOString()
    const inventory = await retrospectiveInventory(vault, { observedAt: generatedAt })
    const approvals = new Map()
    for (const candidate of backlog.candidates.filter(target)) {
      const run = candidate.approval.approved_run
      if (!approvals.has(run))
        approvals.set(run, {
          ...loadApprovedOntologyInput(approvalRoots.get(run) || root, run),
          root: path.resolve(approvalRoots.get(run) || root),
        })
    }
    const currentSources = loadRevisionSourceEvidence(root, backlog.candidates)
    const inputs = {
      backlog_sha256: sha256(bytes),
      vault_inventory_sha256: sha256(JSON.stringify(inventory)),
      approved_files: [...approvals.values()].map((a) => ({
        run: a.run,
        root: a.root,
        files: a.file_hashes,
      })),
      current_source_files: [...currentSources].map(([key, s]) => ({ key, files: s.files })),
      implementation_sha256: implementationFingerprint(),
    }
    const body = {
      ...projectSourceRevisionQueue({
        candidates: backlog.candidates,
        inventory,
        approvals,
        currentSources,
      }),
      generated_at: generatedAt,
      authority: "local_authoring_snapshot",
      inputs,
      input_sha256: sha256(JSON.stringify(inputs)),
    }
    const queue = { ...body, sha256: sha256(JSON.stringify(body)) }
    if (sha256(fs.readFileSync(backlogFile)) !== inputs.backlog_sha256)
      throw Error("Backlog changed during revision snapshot")
    if (previous && JSON.stringify(previous) !== JSON.stringify(queue))
      throw Error("Revision snapshot input changed; use a new snapshot")
    if (!previous) atomicCreate(root, relative, queue)
    return {
      path: relative,
      sha256: sha256(fs.readFileSync(safePath(root, relative))),
      reused: Boolean(previous),
      counts: queue.counts,
      candidate_approved: false,
      candidate_published: false,
    }
  })
}
