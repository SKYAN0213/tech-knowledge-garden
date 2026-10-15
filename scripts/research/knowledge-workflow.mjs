import fs from "node:fs"
import path from "node:path"
import { parseNote, walk } from "../garden.mjs"
import { validateTrendRecords } from "../trends.mjs"
import { sha256 } from "./contracts.mjs"
import {
  atomicCreate,
  atomicWrite,
  readJSON,
  recoverLock,
  safePath,
  withLock,
} from "./run-state.mjs"
import { loadHistoricalNoteApproval, loadReviewedNoteSource } from "./note-review.mjs"
import {
  loadHistoricalKnowledgeConnectionApproval,
  ontologyKnowledgeIndex,
} from "./ontology-knowledge.mjs"
import {
  assertEvidenceOntology,
  createOntologyReader,
  extendEvidenceOntology,
  loadApprovedOntologyInput,
} from "./ontology.mjs"
import {
  assertKnowledgeArticleLink,
  loadKnowledgeArticleLinks,
} from "./knowledge-article-links.mjs"
import { assertSignalOccurredAt } from "./signal-dates.mjs"
import { samePublicationDate } from "./dates.mjs"

const hash = (value) => sha256(JSON.stringify(value ?? null))
const identity = (row) => [row.from, row.field, row.target, row.type || ""].join("|")
const statuses = ["pending", "ready", "review_pending", "blocked"]
const order = { definition: 0, connection: 1, signal: 2, topic: 3, invalid_note: 4 }
const taskSchema = "research-knowledge-task-dependencies/v2"
const articleReference = (input) => (input ? { run: input.run, files: input.file_hashes } : null)
function taskImplementation(kind, implementation) {
  const files = ["knowledge-workflow.mjs", "note-review.mjs", "../garden.mjs"]
  if (kind === "connection") files.push("ontology-knowledge.mjs")
  if (["signal", "topic"].includes(kind))
    files.push("ontology-trends.mjs", "../trends.mjs", "signal-dates.mjs", "dates.mjs")
  return Object.fromEntries(files.map((file) => [file, implementation[file]]))
}
const footprint = () =>
  Object.fromEntries(
    [
      "knowledge-workflow.mjs",
      "../garden.mjs",
      "../trends.mjs",
      "ontology-knowledge.mjs",
      "ontology-trends.mjs",
      "note-review.mjs",
      "ontology.mjs",
      "knowledge-links.mjs",
      "knowledge-article-links.mjs",
      "signal-dates.mjs",
      "dates.mjs",
    ].map((file) => [file, sha256(fs.readFileSync(new URL(file, import.meta.url)))]),
  )
function base(id) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id || "")) throw Error("Safe knowledge workflow ID required")
  return `runs/${id}/knowledge-linking/`
}
function reference(root, file) {
  return { path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) }
}
function checked(root, ref) {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256 || ""))
    throw Error("Exact workflow file reference required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Knowledge workflow artifact SHA changed")
  return JSON.parse(bytes)
}
function loadLatest(root, id) {
  const pointer = readJSON(root, base(id) + "latest.json")
  if (!pointer) return null
  const state = checked(root, pointer.checkpoint)
  if (
    state.schema !== "research-knowledge-linking/v1" ||
    state.workflow_id !== id ||
    !Array.isArray(state.tasks)
  )
    throw Error("Knowledge workflow checkpoint identity changed")
  const input = checked(root, state.input)
  if (input.workflow_id !== id || state.input_sha256 !== hash(input))
    throw Error("Knowledge workflow input changed")
  if (state.index) checked(root, state.index)
  return { pointer, state }
}
function basis(root, file) {
  const ref = reference(root, file),
    stored = checked(root, ref)
  const value = stored.schema === "research-module-result/v1" ? stored.data : stored
  if (!["research-event-workflow/v1", "research-daily-core/v1"].includes(value?.schema))
    throw Error("Native event workflow or daily core basis required")
  const graph = checked(root, value.ontology)
  assertEvidenceOntology(graph)
  return { file: ref, graph: value.ontology, data: graph }
}
function canonicalNotes(vault) {
  return ["Knowledge", "Signals", "TrendTopics"]
    .flatMap((folder) => {
      const directory = safePath(vault, folder)
      if (!fs.existsSync(directory)) return []
      return walk(directory)
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
          const relative = path.relative(vault, file).split(path.sep).join("/")
          const bytes = fs.readFileSync(safePath(vault, relative))
          try {
            return {
              path: relative,
              sha256: sha256(bytes),
              meta: parseNote(bytes.toString("utf8")).meta,
            }
          } catch (error) {
            return { path: relative, sha256: sha256(bytes), error: error.message }
          }
        })
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}
function nativeInventory(root) {
  const directory = safePath(root, "runs"),
    files = [],
    notes = new Map(),
    connections = new Map(),
    errors = []
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const run = entry.name
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(run)) continue
    for (const [output, input] of [
      ["approved-notes.json", "note-review.json"],
      ["approved-connections.json", "connection-review.json"],
    ]) {
      const file = `runs/${run}/${output}`
      if (!fs.existsSync(safePath(root, file))) continue
      try {
        const ref = reference(root, file),
          inputRef = reference(root, `runs/${run}/${input}`)
        files.push(ref, inputRef)
        const data = checked(root, ref)
        if (output === "approved-notes.json") {
          if (!Array.isArray(data.notes)) throw Error("Native note inventory missing")
          for (const note of data.notes) {
            const key = `${note.path}|${note.sha256}`,
              rows = notes.get(key) || []
            rows.push({ run, ref, input: inputRef, reviewed_at: data.reviewed_at, note })
            notes.set(key, rows)
          }
        } else {
          if (!Array.isArray(data.connections)) throw Error("Native connection inventory missing")
          for (const connection of data.connections) {
            const key = identity(connection),
              rows = connections.get(key) || []
            rows.push({ run, ref, input: inputRef, reviewed_at: data.reviewed_at, connection })
            connections.set(key, rows)
          }
        }
      } catch (error) {
        errors.push({ path: file, reason: error.message })
      }
    }
  }
  return { files, notes, connections, errors }
}
function newest(rows = []) {
  return [...rows].sort(
    (a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at) || a.run.localeCompare(b.run),
  )[0]
}
function counts(tasks) {
  return Object.fromEntries(
    statuses.map((status) => [status, tasks.filter((row) => row.status === status).length]),
  )
}

// The workflow audits existing authority and native receipts. It never chooses
// a new semantic association, approves prose, edits canonical notes or publishes.
export async function syncKnowledgeWorkflow({
  root,
  vault = "vault",
  workflowId,
  basisFile,
  articleLinksFile,
  maxItems = 20,
  recoverLockOwner,
  afterCheckpoint,
}) {
  const directory = base(workflowId),
    lock = "knowledge-linking-" + workflowId
  if (!Number.isSafeInteger(maxItems) || maxItems < 0 || maxItems > 256)
    throw Error("Bounded knowledge workflow item count required")
  root = path.resolve(root)
  vault = path.resolve(vault)
  if (recoverLockOwner !== undefined) recoverLock(root, lock, recoverLockOwner)
  return withLock(root, lock, async () => {
    let previous = loadLatest(root, workflowId)
    const configFile = directory + "config.json"
    let config = readJSON(root, configFile)
    if (config && (config.workflow_id !== workflowId || config.vault !== vault))
      throw Error("Knowledge workflow authority changed; use a new workflow ID")
    const sourceFile = basisFile || previous?.state.basis_file || config?.basis_file
    if (!sourceFile) throw Error("First knowledge sync requires a native basis_file")
    const source = basis(root, sourceFile),
      canonical = canonicalNotes(vault),
      inventory = nativeInventory(root)
    const inputs = new Map(),
      approvals = new Map(),
      reviews = new Map(),
      sources = new Map()
    const inputLoader = (r, run, options) => {
      if (!inputs.has(run)) inputs.set(run, loadApprovedOntologyInput(r, run, options))
      return inputs.get(run)
    }
    const noteLoader = (r, run) => {
      if (!approvals.has(run)) approvals.set(run, loadHistoricalNoteApproval(r, run, { vault }))
      return approvals.get(run)
    }
    const reviewedSourceLoader = (r, run) => {
      if (!sources.has(run)) sources.set(run, loadReviewedNoteSource(r, run))
      return sources.get(run)
    }
    const previousInput = previous ? checked(root, previous.state.input) : null
    const incoming = loadKnowledgeArticleLinks(
      root,
      articleLinksFile,
      source.file,
      inputLoader,
      vault,
    )
    const linkPackets = structuredClone(previousInput?.article_link_packets || [])
    for (const packet of linkPackets) checked(root, packet)
    if (incoming && !linkPackets.some((packet) => packet.sha256 === incoming.reference.sha256))
      linkPackets.push(incoming.reference)
    const priorLinks = previousInput?.article_links || []
    for (const link of priorLinks) assertKnowledgeArticleLink(root, link, inputLoader, vault)
    const unchangedBasis =
      previous &&
      previousInput.basis.sha256 === source.file.sha256 &&
      previousInput.basis.path === source.file.path
    const graphBase = unchangedBasis ? checked(root, previous.state.ontology) : source.data
    const selectedRuns = [
      // A newly supplied native basis may already include a linked article or
      // its explicitly reviewed replacement. Do not reactivate the old run.
      ...(!unchangedBasis
        ? priorLinks.filter(
            (link) =>
              !graphBase.inputs.some((ref) => ref.run === link.run) &&
              !graphBase.revision_history?.some((row) => row.previous.run === link.run),
          )
        : []),
      ...(incoming?.articles || []),
    ].map((link) => link.run)
    // Revalidate native body/parse/revision proof on every sync, including a
    // no-op. Status and index pages use saved bytes without this expensive step.
    source.data = extendEvidenceOntology(root, graphBase, [...new Set(selectedRuns)], {
      vault,
      inputLoader,
      noteApprovalLoader: noteLoader,
    })
    const originalGraph = checked(root, source.graph)
    const articleLinks = source.data.inputs.filter(
      (ref) => !originalGraph.inputs.some((row) => row.run === ref.run),
    )
    if (source.data.sha256 !== originalGraph.sha256) {
      const file = directory + `article-graphs/${hash(source.data)}.json`
      const stored = readJSON(root, file)
      if (stored && hash(stored) !== hash(source.data))
        throw Error("Stored linked article graph changed")
      if (!stored) atomicCreate(root, file, source.data)
      source.graph = reference(root, file)
    }
    const active = source.data.inputs.map((ref) => inputs.get(ref.run)),
      byRun = new Map(active.map((item) => [item.run, item]))
    const byEvent = new Map(active.map((item) => [item.article.event_id, item]))
    if (previous && previous.state.ontology.sha256 !== source.graph.sha256) {
      const old = checked(root, previous.state.ontology)
      for (const ref of old.inputs) {
        const prior = inputLoader(root, ref.run, { vault }),
          current = byEvent.get(prior.article.event_id)
        if (
          !current ||
          (current.run !== ref.run &&
            !source.data.revision_history?.some(
              (revision) =>
                revision.event_id === prior.article.event_id && revision.previous.run === ref.run,
            ))
        )
          throw Error("New graph drops an already tracked event or its native revision lineage")
      }
    }
    if (!config) {
      config = {
        schema: "research-knowledge-linking-config/v1",
        workflow_id: workflowId,
        vault,
        basis_file: sourceFile,
      }
      atomicCreate(root, configFile, config)
    }
    const reader = createOntologyReader(source.data),
      used = new Set(),
      versions = new Map()
    for (const node of source.data.nodes.filter((node) => node.type === "Claim")) {
      used.add(`${node.run}|${node.claim_id}`)
      const input = byRun.get(node.run)
      for (const evidence of node.evidence ||
        input?.claims.find((claim) => claim.claim_id === node.claim_id)?.evidence ||
        []) {
        const doc = input?.documents.find(
          (item) => item.source_version_id === evidence.source_version_id,
        )
        if (doc)
          versions.set(
            doc.original_url,
            [...new Set([...(versions.get(doc.original_url) || []), doc.source_version_id])].sort(),
          )
      }
    }
    const included = canonical.filter(
      (note) =>
        note.path.startsWith("Knowledge/") &&
        note.meta?.type === "knowledge" &&
        note.meta?.map_review?.decision === "include",
    )
    const concepts = new Map(included.map((note) => [note.meta.concept_id, note])),
      noteRecords = new Map()
    for (const note of canonical) {
      const candidate = newest(inventory.notes.get(`${note.path}|${note.sha256}`))
      if (!candidate) continue
      try {
        const loaded = noteLoader(root, candidate.run),
          native = loaded.approval.notes.find(
            (row) => row.path === note.path && row.sha256 === note.sha256,
          )
        if (!native) throw Error("Current note differs from native approval")
        const changedSources = native.evidence.flatMap((ref) => {
          const raw = reviewedSourceLoader(root, ref.run_id)
          return ref.claim_ids.flatMap((id) =>
            raw.claims
              .find((claim) => claim.claim_id === id)
              .evidence.flatMap((evidence) => {
                const doc = raw.documents.find(
                  (item) => item.source_version_id === evidence.source_version_id,
                )
                const current = versions.get(doc.original_url)
                return current?.length && !current.includes(doc.source_version_id)
                  ? [{ url: doc.original_url, previous: doc.source_version_id, current }]
                  : []
              }),
          )
        })
        noteRecords.set(note.path, { candidate, loaded, native, changedSources })
      } catch (error) {
        noteRecords.set(note.path, { candidate, error: error.message })
      }
    }
    const tasks = [],
      excluded = [],
      implementation = footprint()
    // The v1 cache used absent input.files and pinned every helper to each
    // task. Its data is reusable only against the same exact graph, unchanged
    // supporting implementations and the original per-task dependency hash.
    const legacyCompatible =
      previousInput &&
      !previousInput.task_dependency_schema &&
      previous.state.ontology.sha256 === source.graph.sha256 &&
      Object.entries(implementation).every(
        ([file, digest]) =>
          file === "knowledge-workflow.mjs" ||
          (file === "knowledge-article-links.mjs" &&
            !articleLinks.length &&
            !linkPackets.length &&
            !previousInput.implementation?.[file]) ||
          previousInput.implementation?.[file] === digest,
      )
    if (previousInput && !previousInput.task_dependency_schema && !legacyCompatible)
      throw Error(
        "Legacy knowledge task migration requires its unchanged native basis and supporting implementations",
      )
    const taskDependencies = {},
      legacyHashes = new Map(),
      legacyByPath = new Map()
    const add = (kind, note, extra, dependencies) => {
      const key = { kind, path: note.path, ...extra },
        id = hash(key).slice(0, 24)
      taskDependencies[id] = { key, dependencies }
      if (legacyCompatible) {
        const oldDependencies = structuredClone(dependencies)
        if (["signal", "topic"].includes(kind)) {
          for (const ref of oldDependencies?.articles || []) ref.input = null
          for (const ref of oldDependencies?.related_notes || [])
            ref.task_sha256 = legacyByPath.get(ref.path) || null
        }
        const digest = hash({
          key,
          canonical_sha256: note.sha256,
          dependencies: oldDependencies,
          implementation: previousInput.implementation,
        })
        legacyHashes.set(id, digest)
        if (["definition", "signal"].includes(kind)) legacyByPath.set(note.path, digest)
      }
      tasks.push({
        id,
        ...key,
        note_sha256: note.sha256,
        task_sha256: hash({
          key,
          canonical_sha256: note.sha256,
          dependencies,
          implementation: taskImplementation(kind, implementation),
        }),
        status: "pending",
      })
    }
    for (const note of canonical) {
      const record = noteRecords.get(note.path)
      const dependency = record
        ? {
            approval: record.candidate.ref,
            error: record.error,
            changed_sources: record.changedSources,
          }
        : null
      if (note.error) add("invalid_note", note, { reason: note.error }, null)
      else if (included.includes(note))
        add("definition", note, { concept_id: note.meta.concept_id }, dependency)
      else if (note.path.startsWith("Signals/")) {
        const editionFile = note.meta.edition?.replace(/\.md$/, "") + ".md"
        let edition, error
        try {
          if (!/^Editions\/.+\.md$/.test(editionFile)) throw Error("Exact signal edition required")
          edition = reference(vault, editionFile)
          const meta = parseNote(fs.readFileSync(safePath(vault, editionFile), "utf8")).meta
          if (!Array.isArray(meta.article_reviews)) throw Error("Edition article inventory missing")
          const eventIds = [...new Set(meta.article_reviews.map((row) => row.event_id))]
          add(
            "signal",
            note,
            { edition: editionFile, event_ids: eventIds },
            {
              dependency,
              edition,
              articles: eventIds.map((id) => ({
                event_id: id,
                input: articleReference(byEvent.get(id)),
              })),
            },
          )
        } catch (cause) {
          error = cause.message
        }
        if (error) add("invalid_note", note, { reason: error }, edition || null)
      } else if (note.path.startsWith("TrendTopics/")) {
        add(
          "topic",
          note,
          { topic_id: note.meta.id },
          {
            dependency,
            articles: record?.native?.evidence.map((ref) => ({
              run: ref.run_id,
              input: articleReference(byRun.get(ref.run_id)),
            })),
            related_notes: [
              ...(note.meta.knowledge_notes || []).map((file) => {
                const path = file.replace(/\.md$/, "") + ".md"
                return { path, kind: "definition" }
              }),
              ...canonical
                .filter(
                  (n) =>
                    n.path.startsWith("Signals/") &&
                    n.meta?.observations?.some(
                      (signal) =>
                        signal.topic_id === note.meta.id ||
                        note.meta.lessons?.some((lesson) => lesson.signal_ids.includes(signal.id)),
                    ),
                )
                .map(({ path }) => ({ path, kind: "signal" })),
            ].map(({ path, kind }) => ({
              path,
              task_sha256:
                tasks.find((row) => row.kind === kind && row.path === path)?.task_sha256 || null,
            })),
          },
        )
      }
    }
    for (const note of included) {
      for (const field of ["connections", "relations"])
        for (const edge of note.meta[field] || []) {
          const target = concepts.get(edge.target)
          if (!target) {
            excluded.push({
              from: note.meta.concept_id,
              target: edge.target,
              field,
              reason: "excluded_endpoint",
            })
            continue
          }
          const key = {
            from: note.meta.concept_id,
            field,
            target: edge.target,
            ...(edge.type ? { type: edge.type } : {}),
          }
          const candidates = inventory.connections.get(identity(key)) || []
          add("connection", note, key, {
            target: target.sha256,
            endpoints: [note, target].map((n) => {
              const r = noteRecords.get(n.path)
              return {
                approval: r?.candidate?.ref,
                error: r?.error,
                changed_sources: r?.changedSources,
              }
            }),
            approvals: candidates.map((row) => row.ref),
            edge,
          })
        }
    }
    tasks.sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id))
    const input = {
      schema: "research-knowledge-linking-input/v1",
      workflow_id: workflowId,
      vault,
      basis_file: sourceFile,
      basis: source.file,
      ontology: source.graph,
      ...(articleLinks.length ? { article_links: articleLinks } : {}),
      ...(linkPackets.length ? { article_link_packets: linkPackets } : {}),
      implementation,
      task_dependency_schema: taskSchema,
      task_dependencies: taskDependencies,
      canonical: canonical.map(({ path, sha256 }) => ({ path, sha256 })),
      native_files: inventory.files,
      native_errors: inventory.errors,
      tasks: tasks.map(({ status, ...row }) => row),
    }
    const inputHash = hash(input),
      cycle = directory + `cycles/${inputHash}/`,
      inputFile = cycle + "input.json"
    const storedInput = readJSON(root, inputFile)
    if (storedInput && hash(storedInput) !== inputHash)
      throw Error("Frozen knowledge workflow cycle changed")
    if (!storedInput) atomicCreate(root, inputFile, input)
    const inputRef = reference(root, inputFile)
    // Recover a fully written checkpoint after a stop before latest-pointer
    // installation. A live/stale lock still follows the native recovery rules.
    let sequence = previous?.state.input_sha256 === inputHash ? previous.state.sequence + 1 : 1
    if (previous?.state.input_sha256 !== inputHash) {
      const sequences = fs
        .readdirSync(safePath(root, cycle))
        .map((name) => /^checkpoint-([1-9][0-9]*)\.json$/.exec(name)?.[1])
        .filter(Boolean)
        .map(Number)
      const highest = Math.max(0, ...sequences)
      if (highest) {
        const last = readJSON(root, cycle + `checkpoint-${highest}.json`)
        sequence =
          hash(last.previous) === hash(previous?.pointer.checkpoint || null) ? highest : highest + 1
      }
    }
    const orphan = readJSON(root, cycle + `checkpoint-${sequence}.json`)
    if (orphan) {
      if (
        orphan.schema !== "research-knowledge-linking/v1" ||
        orphan.workflow_id !== workflowId ||
        orphan.input_sha256 !== inputHash ||
        orphan.sequence !== sequence ||
        hash(orphan.previous) !== hash(previous?.pointer.checkpoint || null) ||
        hash(checked(root, orphan.input)) !== inputHash ||
        !Array.isArray(orphan.tasks)
      )
        throw Error("Interrupted knowledge checkpoint differs from its lineage")
      if (orphan.index) checked(root, orphan.index)
      const checkpoint = reference(root, cycle + `checkpoint-${sequence}.json`)
      atomicWrite(root, directory + "latest.json", {
        schema: "research-knowledge-linking-pointer/v1",
        workflow_id: workflowId,
        checkpoint,
      })
      previous = loadLatest(root, workflowId)
      sequence++
    }
    const oldTasks = new Map((previous?.state.tasks || []).map((row) => [row.id, row]))
    let migrated = 0
    for (const row of tasks) {
      const old = oldTasks.get(row.id)
      if (old?.task_sha256 === row.task_sha256 && old.status !== "pending") Object.assign(row, old)
      else if (old && old.status !== "pending" && legacyHashes.get(row.id) === old.task_sha256) {
        const digest = row.task_sha256
        Object.assign(row, old, { task_sha256: digest })
        migrated++
      }
    }
    const resumed = previous?.state.input_sha256 === inputHash
    if (resumed && !tasks.some((row) => row.status === "pending"))
      return {
        ...previous.state,
        checkpoint: previous.pointer.checkpoint,
        reused: true,
        processed_items: 0,
        migrated_items: 0,
      }
    const noteByPath = new Map(canonical.map((row) => [row.path, row])),
      rows = new Map(tasks.map((row) => [row.path + "|" + row.kind, row]))
    let processed = 0
    for (const row of tasks) {
      if (row.status !== "pending" || processed >= maxItems) continue
      processed++
      const note = noteByPath.get(row.path),
        record = noteRecords.get(row.path)
      const block = (reason, details = {}) =>
        Object.assign(row, { status: "blocked", reason, ...details })
      const review = (reason, details = {}) =>
        Object.assign(row, { status: "review_pending", reason, ...details })
      const ready = (run, ref) =>
        Object.assign(row, { status: "ready", approval_run: run, approval: ref })
      if (row.kind === "invalid_note") {
        block(row.reason)
        continue
      }
      if (row.kind === "signal") {
        const missing = row.event_ids.filter((id) => !byEvent.has(id))
        if (missing.length) {
          block("current_article_approvals_missing", { event_ids: missing })
          continue
        }
      }
      if (row.kind === "connection") {
        const target = concepts.get(row.target),
          fromRecord = record,
          targetRecord = noteRecords.get(target.path)
        if (
          rows.get(row.path + "|definition")?.status !== "ready" ||
          rows.get(target.path + "|definition")?.status !== "ready"
        ) {
          block("current_definition_review_required")
          continue
        }
        const endpointFacts = new Set(
          [fromRecord, targetRecord].flatMap((r) =>
            r.native.evidence.flatMap((ref) => ref.claim_ids.map((id) => `${ref.run_id}|${id}`)),
          ),
        )
        const eligible = (inventory.connections.get(identity(row)) || []).filter(
          ({ connection }) =>
            connection.source_definition.sha256 === note.sha256 &&
            connection.target_definition.sha256 === target.sha256 &&
            connection.facts.every((fact) => endpointFacts.has(`${fact.run}|${fact.claim_id}`)),
        )
        const chosen = newest(eligible)
        if (!chosen) {
          review("current_connection_review_required", {
            source_definition: fromRecord.candidate.run,
            target_definition: targetRecord.candidate.run,
          })
          continue
        }
        try {
          if (!reviews.has(chosen.run))
            reviews.set(
              chosen.run,
              loadHistoricalKnowledgeConnectionApproval(root, chosen.run, {
                vault,
                noteApprovalLoader: noteLoader,
                reviewedSourceLoader,
              }),
            )
          const connection = reviews
            .get(chosen.run)
            .approval.connections.find((edge) => identity(edge) === identity(row))
          const authored = (note.meta[row.field] || []).find(
            (edge) => edge.target === row.target && edge.type === row.type,
          )
          if (
            !connection ||
            ["reason", "basis", "evidence", "type"].some(
              (key) => hash(connection[key]) !== hash(authored[key]),
            )
          )
            throw Error("Current authored connection differs from its native receipt")
          ready(chosen.run, chosen.ref)
        } catch (error) {
          block("native_connection_approval_invalid", { error: error.message })
        }
        continue
      }
      if (!record) {
        review("current_note_review_required")
        continue
      }
      if (record.error) {
        block("native_note_approval_invalid", { error: record.error })
        continue
      }
      if (record.changedSources.length) {
        review("source_version_revalidation_required", { changed_sources: record.changedSources })
        continue
      }
      if (row.kind === "definition") {
        ready(record.candidate.run, record.candidate.ref)
        continue
      }
      const missing = record.native.evidence.flatMap((ref) =>
        ref.claim_ids
          .filter((id) => !used.has(`${ref.run_id}|${id}`))
          .map((claim_id) => ({ run: ref.run_id, claim_id })),
      )
      if (missing.length) {
        review("current_article_fact_rebinding_required", { facts: missing })
        continue
      }
      if (row.kind === "signal") {
        const invalid = (note.meta.observations || []).filter(
          (signal) =>
            !record.native.evidence.some(
              (ref) =>
                byRun.get(ref.run_id)?.article.event_id === signal.event_id &&
                ref.claim_ids.some(
                  (id) =>
                    samePublicationDate(
                      signal.event_date,
                      reader.traceClaim(id, ref.run_id).claim.published_at,
                    ),
                ),
            ),
        )
        if (invalid.length) {
          block("signal_fact_event_or_date_mismatch", { observation_ids: invalid.map((r) => r.id) })
          continue
        }
        const occurredObservations = (note.meta.observations || []).filter(
          (signal) => signal.occurred_at !== undefined,
        )
        if (occurredObservations.length) {
          const facts = record.native.evidence.flatMap((ref) =>
            ref.claim_ids.map((id) => ({
              event_id: byRun.get(ref.run_id)?.article.event_id,
              claim: reader.traceClaim(id, ref.run_id).claim,
            })),
          )
          const articles = [...byRun.values()].map((input) => input.article)
          const invalidOccurred = occurredObservations.flatMap((signal) => {
            try {
              assertSignalOccurredAt(signal, { facts, articles })
              return []
            } catch (error) {
              return [{ id: signal.id, error: error.message }]
            }
          })
          if (invalidOccurred.length) {
            block("signal_occurrence_evidence_mismatch", { observations: invalidOccurred })
            continue
          }
        }
      } else {
        const missingDefinitions = (note.meta.knowledge_notes || []).filter(
          (file) => rows.get(file.replace(/\.md$/, "") + ".md|definition")?.status !== "ready",
        )
        if (missingDefinitions.length) {
          block("reviewed_knowledge_definition_required", { knowledge_notes: missingDefinitions })
          continue
        }
        const observations = new Set(
          tasks
            .filter((t) => t.kind === "signal" && t.status === "ready")
            .flatMap((t) => noteByPath.get(t.path).meta.observations.map((r) => r.id)),
        )
        const missingLessons = (note.meta.lessons || []).flatMap((lesson) =>
          lesson.signal_ids.filter((id) => !observations.has(id)),
        )
        if (missingLessons.length) {
          block("reviewed_signal_history_required", { observation_ids: missingLessons })
          continue
        }
        // Use the same source/history validation as the final reader index.
        // An invalid topic must not look ready or prevent unrelated projections.
        const ledgers = tasks
          .filter((task) => task.kind === "signal" && task.status === "ready")
          .map((task) => noteByPath.get(task.path))
        try {
          validateTrendRecords(
            [{ ...note.meta, file: row.path }],
            ledgers.map((ledger) => ({
              ...ledger.meta,
              file: ledger.path,
              observations: ledger.meta.observations.filter(
                (signal) => signal.topic_id === note.meta.id,
              ),
            })),
            ledgers.map((ledger) => ({
              key: ledger.meta.edition,
              date: ledger.meta.date,
              items: ledger.meta.observations.map((signal) => {
                const article = byEvent.get(signal.event_id).article
                return { id: article.event_id, review: article.article_review }
              }),
            })),
            {
              requireLatest: false,
              knowledgeResolver: (file) =>
                rows.get(file.replace(/\.md$/, "") + ".md|definition")?.status === "ready",
            },
          )
        } catch (error) {
          block("native_topic_projection_invalid", { error: error.message })
          continue
        }
      }
      ready(record.candidate.run, record.candidate.ref)
    }
    let index = null,
      projectionError = null
    const readyRows = tasks.filter((row) => row.status === "ready"),
      selections = readyRows
        .filter((row) => row.kind === "definition")
        .map((row) => ({ run: row.approval_run, path: row.path, sha256: row.note_sha256 }))
    if (!tasks.some((row) => row.status === "pending")) {
      const selectedTrends = readyRows.filter((row) => ["signal", "topic"].includes(row.kind))
      const selectedPaths = new Map(selectedTrends.map((row) => [row.path, row.approval_run]))
      const selectedRuns = [...new Set(selectedTrends.map((row) => row.approval_run))]
      try {
        for (const row of readyRows.filter((row) => row.kind === "connection"))
          if (!reviews.has(row.approval_run))
            reviews.set(
              row.approval_run,
              loadHistoricalKnowledgeConnectionApproval(root, row.approval_run, {
                vault,
                noteApprovalLoader: noteLoader,
                reviewedSourceLoader,
              }),
            )
        const projected = ontologyKnowledgeIndex(root, source.data, {
          vault,
          inputLoader,
          knowledgeSelections: selections,
          trendReviewRuns: selectedRuns,
          noteApprovalLoader: (r, run) => {
            const loaded = noteLoader(r, run)
            return {
              ...loaded,
              approval: {
                ...loaded.approval,
                notes: loaded.approval.notes.filter(
                  (note) =>
                    note.path.startsWith("Knowledge/") || selectedPaths.get(note.path) === run,
                ),
              },
            }
          },
        })
        const connectionRows = readyRows.filter((row) => row.kind === "connection")
        projected.knowledge_connections = connectionRows.map((row) => ({
          ...reviews
            .get(row.approval_run)
            .approval.connections.find((edge) => identity(edge) === identity(row)),
          approval_run: row.approval_run,
        }))
        projected.knowledge_connection_reviews = [
          ...new Set(connectionRows.map((row) => row.approval_run)),
        ].map((run) => ({ run, files: reviews.get(run).files }))
        projected.linking_scope = {
          workflow_id: workflowId,
          current_native_definitions: selections.length,
          current_native_signals: selectedTrends.filter((r) => r.kind === "signal").length,
          current_native_topics: selectedTrends.filter((r) => r.kind === "topic").length,
          pending_note_paths: tasks
            .filter(
              (r) => ["definition", "signal", "topic"].includes(r.kind) && r.status !== "ready",
            )
            .map((r) => r.path),
        }
        const file = directory + `indexes/${hash(projected)}.json`,
          stored = readJSON(root, file)
        if (stored && hash(stored) !== hash(projected)) throw Error("Stored workflow index changed")
        if (!stored) atomicCreate(root, file, projected)
        index = reference(root, file)
      } catch (error) {
        projectionError = error.message
      }
    }
    // Do not install a result against authority or approval files that changed
    // while this call was auditing. The last successful checkpoint stays intact.
    const currentInventory = nativeInventory(root)
    if (
      hash(canonicalNotes(vault).map(({ path, sha256 }) => ({ path, sha256 }))) !==
        hash(input.canonical) ||
      reference(root, sourceFile).sha256 !== source.file.sha256 ||
      hash({ files: currentInventory.files, errors: currentInventory.errors }) !==
        hash({ files: inventory.files, errors: inventory.errors }) ||
      hash(footprint()) !== hash(implementation)
    )
      throw Error(
        "Knowledge authority or native inputs changed during sync; resume with the new basis",
      )
    for (const packet of linkPackets) checked(root, packet)
    for (const link of articleLinks)
      for (const [name, digest] of Object.entries(link.files))
        if (reference(root, `runs/${link.run}/${name}`).sha256 !== digest)
          throw Error("Native linked article changed during knowledge sync")
    const totals = counts(tasks),
      status =
        projectionError || inventory.errors.length
          ? "partial"
          : totals.pending
            ? "yielded"
            : totals.blocked || totals.review_pending
              ? "review_pending"
              : "complete"
    const state = {
      schema: "research-knowledge-linking/v1",
      workflow_id: workflowId,
      input_sha256: inputHash,
      input: inputRef,
      basis_file: sourceFile,
      ontology: source.graph,
      sequence,
      previous: previous?.pointer.checkpoint || null,
      status,
      counts: totals,
      migrated_items: migrated,
      tasks,
      excluded_connections: excluded,
      native_errors: inventory.errors,
      index,
      projection_error: projectionError,
      next_task: tasks.find((row) => row.status === "pending")?.id || null,
      review_tasks: tasks.filter((row) => ["review_pending", "blocked"].includes(row.status))
        .length,
      canonical_writes: 0,
      approvals_created: false,
      candidate_published: false,
      model_calls: 0,
      source_requests: 0,
    }
    const checkpoint = atomicCreate(root, cycle + `checkpoint-${sequence}.json`, state)
    if (afterCheckpoint) await afterCheckpoint({ checkpoint, state })
    // Signals bind the edition's article inventory as well as its own note.
    // Do not install a checkpoint if that inventory changed during the audit.
    const signalEditions = new Map(
      Object.values(taskDependencies)
        .filter((row) => row.key.kind === "signal" && row.dependencies?.edition)
        .map((row) => [row.dependencies.edition.path, row.dependencies.edition]),
    )
    for (const edition of signalEditions.values()) {
      if (reference(vault, edition.path).sha256 !== edition.sha256)
        throw Error("Signal edition changed during knowledge sync; resume with the new basis")
    }
    atomicWrite(root, directory + "latest.json", {
      schema: "research-knowledge-linking-pointer/v1",
      workflow_id: workflowId,
      checkpoint,
    })
    return { ...state, checkpoint, reused: false, processed_items: processed }
  })
}

export function readKnowledgeWorkflow(root, workflowId, { status, offset = 0, limit = 20 } = {}) {
  if (
    (status !== undefined && !statuses.includes(status)) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("Bounded knowledge workflow page required")
  const loaded = loadLatest(root, workflowId),
    lock = readJSON(root, `locks/knowledge-linking-${workflowId}.json`)
  if (!loaded)
    return {
      schema: "research-knowledge-linking-page/v1",
      workflow_id: workflowId,
      status: "not_started",
      lock,
      page: { offset, total: 0, returned: 0, next_offset: null, items: [] },
      read_only: true,
      approvals_created: false,
    }
  const { state, pointer } = loaded,
    rows = status ? state.tasks.filter((row) => row.status === status) : state.tasks
  if (offset > rows.length) throw Error("Workflow page offset exceeds its stored queue")
  const items = rows.slice(offset, offset + limit),
    next = offset + items.length
  return {
    schema: "research-knowledge-linking-page/v1",
    workflow_id: workflowId,
    status: state.status,
    checkpoint: pointer.checkpoint,
    input_sha256: state.input_sha256,
    ontology: state.ontology,
    counts: state.counts,
    index: state.index,
    projection_error: state.projection_error,
    native_errors: state.native_errors,
    previous: state.previous,
    lock,
    page: {
      offset,
      total: rows.length,
      returned: items.length,
      next_offset: next < rows.length ? next : null,
      items,
    },
    read_only: true,
    approvals_created: false,
  }
}
