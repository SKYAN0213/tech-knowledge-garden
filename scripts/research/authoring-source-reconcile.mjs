import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { parseNote, noteText, extractArticles, sourceMap, canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { atomicCreate, safePath } from "./run-state.mjs"
import { authoringInventory } from "./authoring-transfer.mjs"
import { loadAuthoringSourceCapture } from "./authoring-source-snapshot.mjs"
import { loadHistoricalNoteApproval } from "./note-review.mjs"
import { assertEvidenceOntology, loadApprovedOntologyInput } from "./ontology.mjs"
import { editionProjection, existingArticleProjection } from "./publish-adapter.mjs"
import { assertRetrospectiveAppearance } from "./event-date.mjs"
import { legacyTransitionBatch, legacyTransitionMetadata } from "./legacy-transition.mjs"

const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n")
const pinnedBytes = (root, ref) => {
  if (!/^[a-f0-9]{64}$/.test(ref?.sha256 || ""))
    throw Error("Exact reconciliation reference required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Pinned reconciliation bytes changed")
  return bytes
}
const checked = (root, ref) => JSON.parse(pinnedBytes(root, ref))
const ref = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(safePath(root, file))) })
const legacyEvidence = (root, references) =>
  references.flatMap((reference) => {
    const stored = checked(root, reference)
    const packets =
      stored.schema === "research-authoring-legacy-projection-evidence/v1"
        ? stored.packets.map((row) => {
            if (sha256(JSON.stringify(row.packet)) !== row.sha256)
              throw Error("Preserved legacy packet bytes changed")
            return row.packet
          })
        : legacyTransitionBatch(stored)
    return packets.map((packet) => ({ packet, reference }))
  })

// A presentation review cannot supply article facts. The entire projected
// metadata and text must remain exact after resolving citation aliases to the
// original URL and collapsing extra empty lines outside literal code.
const presentationView = (content) => {
  const note = parseNote(content),
    headings = [...note.body.matchAll(/^# Source List$/gm)]
  if (note.meta.schema_version !== "tech-ai-magazine/v2" || headings.length !== 1)
    throw Error("Exact v2 container Source List required")
  const marker = headings[0],
    prefix = note.body.slice(0, marker.index).replace(/\n+$/, ""),
    sourceLines = note.body.slice(marker.index + marker[0].length).split("\n"),
    sources = new Map(),
    urls = []
  for (const line of sourceLines) {
    if (line === "") continue
    const match = line.match(/^- \[(S\d+)\] (https?:\/\/[^\s<>\)]+)$/)
    if (!match || sources.has(match[1])) throw Error("Exact unique raw source markers required")
    const url = new URL(match[2])
    if (!["http:", "https:"].includes(url.protocol)) throw Error("Exact raw source URL required")
    sources.set(match[1], match[2])
    urls.push(match[2])
  }
  const lines = prefix.split("\n"),
    normalized = []
  let fence = null,
    inlineCode = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      normalized.push({ literal: line })
      if (
        delimiter &&
        delimiter[1][0] === fence.character &&
        delimiter[1].length >= fence.length &&
        delimiter[2].trim() === ""
      )
        fence = null
      continue
    }
    if (delimiter) {
      fence = { character: delimiter[1][0], length: delimiter[1].length }
      normalized.push({ literal: line })
      continue
    }
    if (/^(?: {4}|\t)/.test(line)) {
      normalized.push({ literal: line })
      continue
    }
    if (line === "" && !inlineCode && normalized.at(-1) === null) {
      let previous = i - 1,
        next = i + 1
      while (previous >= 0 && lines[previous] === "") previous--
      while (next < lines.length && lines[next] === "") next++
      if (![lines[previous] || "", lines[next] || ""].some((s) => /^(?: {4}|\t)/.test(s))) continue
    }
    const tokens = []
    let cursor = 0
    for (const match of line.matchAll(/(`+)|\[(S\d+)\]/g)) {
      const [token, ticks, citation] = match
      if (match.index > cursor) tokens.push({ text: line.slice(cursor, match.index) })
      cursor = match.index + token.length
      if (ticks) {
        if (inlineCode === ticks.length) inlineCode = null
        else if (inlineCode === null) inlineCode = ticks.length
        tokens.push({ text: token })
        continue
      }
      if (inlineCode !== null) {
        tokens.push({ text: token })
        continue
      }
      const raw = sources.get(citation)
      if (!raw) throw Error("Container citation has no exact raw source target")
      tokens.push({ source: raw })
    }
    if (cursor < line.length) tokens.push({ text: line.slice(cursor) })
    normalized.push(line === "" && !inlineCode ? null : tokens)
  }
  return { meta: note.meta, body: normalized, urls: urls.sort() }
}
const presentationEvidence = (root, references) => {
  if (!Array.isArray(references) || references.length > 32)
    throw Error("Bounded explicit container presentation reviews required")
  const evidence = references.map((reference) => {
    const packet = checked(root, reference)
    if (
      packet.schema !== "research-authoring-container-presentation-review/v1" ||
      !/^Editions\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}_\d{4}_Tech_AI_Briefing\.md$/.test(
        packet.target_path || "",
      ) ||
      !/^[a-f0-9]{64}$/.test(packet.source_sha256 || "") ||
      !packet.reviewer?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(packet.reviewed_at || "") ||
      !packet.reason?.trim() ||
      ["all_articles_read", "all_metadata_checked", "citation_targets_checked"].some(
        (key) => packet[key] !== true,
      ) ||
      packet.approval_granted !== false ||
      packet.release_approved !== false
    )
      throw Error("Explicit private container presentation review required")
    const projection = pinnedBytes(root, packet.projection),
      target = pinnedBytes(root, packet.target)
    if (
      !Buffer.from(projection.toString("utf8")).equals(projection) ||
      !Buffer.from(target.toString("utf8")).equals(target)
    )
      throw Error("Exact UTF-8 container bytes required")
    const before = presentationView(projection.toString("utf8")),
      after = presentationView(target.toString("utf8"))
    if (!isDeepStrictEqual(before, after))
      throw Error("Container presentation review changes metadata, text, or raw source targets")
    const articleIds = extractArticles(parseNote(projection.toString("utf8"))).map(
        (article) => article.id,
      ),
      targetIds = extractArticles(parseNote(target.toString("utf8"))).map((article) => article.id)
    if (
      !articleIds.length ||
      articleIds.some((id) => !id) ||
      new Set(articleIds).size !== articleIds.length ||
      !isDeepStrictEqual(articleIds, targetIds) ||
      !isDeepStrictEqual(packet.article_ids, articleIds)
    )
      throw Error("Exact native article identities required")
    return { packet, reference, target: target.toString("utf8") }
  })
  if (
    new Set(evidence.map(({ packet }) => `${packet.target_path}:${packet.projection.sha256}`))
      .size !== evidence.length
  )
    throw Error("Unique exact container presentation reviews required")
  return evidence
}

// Prepare independently supported files. This is neither a release nor a new
// review: article approval alone cannot approve an entire edition container.
export function prepareAuthoringSourceReconciliation({
  root,
  inputFile,
  repository = process.cwd(),
  vault = "vault",
  now = Date.now(),
}) {
  const inputBytes = fs.readFileSync(safePath(root, inputFile)),
    input = JSON.parse(inputBytes)
  if (
    input.schema !== "research-authoring-source-reconciliation-input/v1" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.run_id || "")
  )
    throw Error("Exact private reconciliation input required")
  const capturePath = `drive-source/${input.source_capture?.run_id}/capture.json`
  const capture = checked(root, { path: capturePath, sha256: input.source_capture?.sha256 })
  const sourceStatus = loadAuthoringSourceCapture(root, input.source_capture.run_id, {
    now,
    repository,
    vault,
  })
  const snapshot = checked(root, capture.source_snapshot)
  const checkpoint = checked(root, input.knowledge_checkpoint),
    knowledgeInput = checked(root, checkpoint.input)
  if (
    checkpoint.schema !== "research-knowledge-linking/v1" ||
    checkpoint.input_sha256 !== sha256(JSON.stringify(knowledgeInput)) ||
    checkpoint.workflow_id !== knowledgeInput.workflow_id ||
    !Array.isArray(checkpoint.tasks)
  )
    throw Error("Exact saved knowledge checkpoint required")
  const graph = checked(root, checkpoint.ontology)
  assertEvidenceOntology(graph)
  const legacyReviews = legacyEvidence(root, input.legacy_reviews || [])
  const containerReviews = presentationEvidence(root, input.container_reviews || [])
  const retrospectiveSteps = input.retrospective_steps || []
  if (
    !Array.isArray(retrospectiveSteps) ||
    new Set(retrospectiveSteps.map((row) => row.path)).size !== retrospectiveSteps.length
  )
    throw Error("Unique exact retrospective step paths required")
  for (const row of retrospectiveSteps) {
    if (
      !/^Editions\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}_\d{4}_Tech_AI_Briefing\.md$/.test(row.path) ||
      !Array.isArray(row.batches) ||
      row.batches.length < 2 ||
      row.batches.length > 16 ||
      row.batches.some(
        (batch) =>
          !Array.isArray(batch.runs) ||
          !batch.runs.length ||
          batch.runs.some((run) => !/^[A-Za-z0-9_-]{1,100}$/.test(run)),
      ) ||
      new Set(row.batches.flatMap((batch) => batch.runs)).size !==
        row.batches.flatMap((batch) => batch.runs).length
    )
      throw Error("Bounded exact native retrospective steps required")
    for (const batch of row.batches) if (batch.readback) checked(root, batch.readback)
  }
  const priorReconciliation = input.prior_reconciliation
    ? checked(root, input.prior_reconciliation)
    : null
  if (
    priorReconciliation &&
    (priorReconciliation.schema !== "research-authoring-source-reconciliation/v1" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(priorReconciliation.run_id || "") ||
      priorReconciliation.approval_granted !== false)
  )
    throw Error("Exact previous private reconciliation required")
  const manifest = checked(root, input.preview_manifest)
  if (
    input.preview_manifest.path !== `runs/${manifest.run_id}/preview-manifest.json` ||
    manifest.workspace !== `runs/${manifest.run_id}/preview-workspace` ||
    manifest.candidate_published !== false
  )
    throw Error("Existing private preview identity required")
  const planPath = `runs/${manifest.run_id}/drive-authoring/transfer-plan.json`,
    planRef = ref(root, planPath),
    plan = checked(root, planRef)
  const authoring = [
    ...manifest.editions,
    ...manifest.knowledge,
    ...(manifest.navigation ? [manifest.navigation] : []),
  ]
  if (
    plan.schema !== "research-authoring-transfer/v1" ||
    plan.preview_run !== manifest.run_id ||
    plan.preview_sha256 !== input.preview_manifest.sha256 ||
    plan.release_approved !== false ||
    plan.upload_allowed !== false ||
    plan.candidate_published !== false ||
    !Array.isArray(plan.files) ||
    plan.files.length !== authoring.length ||
    new Set(plan.files.map((f) => f.path)).size !== plan.files.length
  )
    throw Error("Exact existing private authoring plan required")
  for (const file of plan.files) {
    if (
      !authoring.some((f) => f.path === file.path && f.sha256 === file.sha256) ||
      file.staged_path !== `runs/${manifest.run_id}/drive-authoring/files/${file.path}` ||
      sha256(fs.readFileSync(safePath(root, file.staged_path))) !== file.sha256
    )
      throw Error("Existing preview authoring bytes changed")
  }
  const absoluteVault = path.resolve(repository, vault),
    local = authoringInventory(absoluteVault)
  const remote = new Map(snapshot.files.map((file) => [file.path, file]))
  const noteCache = new Map(),
    articleCache = new Map()
  const noteApproval = (run) => {
    if (!noteCache.has(run))
      noteCache.set(run, loadHistoricalNoteApproval(root, run, { vault: absoluteVault }))
    return noteCache.get(run)
  }
  const articleApproval = (selection) => {
    if (!articleCache.has(selection.run)) {
      const loaded = loadApprovedOntologyInput(root, selection.run, { vault: absoluteVault })
      if (
        loaded.article.event_id !== selection.event_id ||
        !isDeepStrictEqual(loaded.file_hashes, selection.files)
      )
        throw Error("Native article selection bytes changed")
      articleCache.set(selection.run, loaded)
    }
    return articleCache.get(selection.run)
  }
  // Reuse existing approved private candidates; don't render or restage them.
  for (const run of manifest.approved_runs) {
    const selected = graph.inputs.find((row) => row.run === run)
    if (!selected) throw Error("Preview article approval is absent from the pinned native basis")
    articleApproval(selected)
  }
  for (const run of manifest.knowledge_runs) noteApproval(run)
  const concepts = Object.fromEntries(
    [...local]
      .filter(([p]) => p.startsWith("Knowledge/"))
      .map(([p, row]) => {
        const meta = parseNote(row.bytes.toString("utf8")).meta
        return [meta.concept_id, p.replace(/\.md$/, "")]
      })
      .filter(([id]) => id),
  )
  const fileRows = [],
    stage = []
  const citationBody = (article, edition) =>
    article.body.replace(
      /\[(S\d+)\]/g,
      (_, marker) => `{source:${canonicalURL(sourceMap(edition.body).get(marker))}}`,
    )
  const articleView = (article, edition) => ({
    id: article.id,
    title: article.title,
    body: citationBody(article, edition),
    review: article.review,
    editorial: article.editorial,
    classification: article.classification,
    concepts: article.concepts,
    urls: article.urls,
  })
  const presentContainer = (relative, originalSha, content) => {
    const review = containerReviews.find(
      ({ packet }) =>
        packet.target_path === relative && packet.projection.sha256 === sha256(content),
    )
    if (!review) return { content, proof: null }
    if (review.packet.source_sha256 !== originalSha)
      throw Error("Container presentation review has a different original source")
    return {
      content: review.target,
      proof: {
        review: review.reference,
        native_projected_sha256: review.packet.projection.sha256,
        presented_sha256: review.packet.target.sha256,
      },
    }
  }
  const completeEditionProjection = (relative, before, current) => {
    if (!before) throw Error("Existing remote edition required")
    const original = { file: path.join(absoluteVault, relative), ...parseNote(before.content) },
      after = { file: original.file, ...parseNote(current.bytes.toString("utf8")) }
    const reviewed = legacyReviews.find(
      (row) => row.packet.target_path === relative && row.packet.target_sha256 === before.sha256,
    )
    const support = [],
      preserved = [],
      omissions = {}
    let metadata = original.meta,
      revised,
      projection,
      chainContent
    const chain = retrospectiveSteps.find((row) => row.path === relative),
      chainProof = []
    if (chain) {
      if (reviewed || original.meta.schema_version !== "tech-ai-magazine/v2")
        throw Error("Native retrospective steps require the original v2 edition")
      let content = before.content
      for (const batch of chain.batches) {
        const existing = { file: original.file, ...parseNote(content) },
          priorArticles = extractArticles(existing),
          selected = batch.runs.map((run) => {
            const row = graph.inputs.find((input) => input.run === run)
            if (!row || !priorArticles.some((article) => article.id === row.event_id))
              throw Error("Exact same-edition native step approval required")
            return row
          }),
          stepOmissions = {}
        const stepArticles = priorArticles.map((article) => {
          const selection = selected.find((row) => row.event_id === article.id)
          if (!selection) return existingArticleProjection(article)
          const approved = articleApproval(selection).article
          Object.assign(
            stepOmissions,
            assertRetrospectiveAppearance(approved, article, relative, Buffer.from(content)),
          )
          support.push(selection)
          return approved
        })
        const priorSha = sha256(content)
        projection = editionProjection(stepArticles, {
          key: path.basename(relative, ".md"),
          date: existing.meta.date,
          coverage_start: existing.meta.coverage_start,
          coverage_end: existing.meta.coverage_end,
          existing,
          reviewed_sections: stepOmissions,
          concept_paths_by_id: concepts,
        })
        const presented = presentContainer(relative, before.sha256, projection.content)
        content = presented.content
        if (batch.readback) {
          const receipt = checked(root, batch.readback),
            mutation = receipt.mutations?.find((row) => row.path === relative)
          if (
            receipt.schema !== "research-local-approved-articles-apply/v1" ||
            !mutation ||
            (mutation.before_sha256 && mutation.before_sha256 !== priorSha) ||
            mutation.after_sha256 !== sha256(content) ||
            !isDeepStrictEqual(
              [...mutation.event_ids].sort(),
              selected.map((row) => row.event_id).sort(),
            )
          )
            throw Error("Exact stored retrospective step readback differs")
        }
        chainProof.push({
          runs: batch.runs,
          readback: batch.readback || null,
          before_sha256: priorSha,
          after_sha256: sha256(content),
          ...(presented.proof ? { presentation: presented.proof } : {}),
        })
      }
      preserved.push(
        ...extractArticles(original)
          .filter((article) => !support.some((row) => row.event_id === article.id))
          .map((article) => article.id),
      )
      chainContent = content
    } else if (reviewed) {
      const packet = reviewed.packet
      revised = packet.events.map((event) => {
        const selected = graph.inputs.find((row) => row.event_id === event.event_id)
        if (!selected) throw Error("Complete legacy event approval required: " + event.event_id)
        support.push(selected)
        return articleApproval(selected).article
      })
      metadata = legacyTransitionMetadata(packet, original.meta, relative)
    } else {
      if (original.meta.schema_version !== "tech-ai-magazine/v2")
        throw Error("Exact complete legacy review required")
      const originals = extractArticles(original),
        currentArticles = extractArticles(after)
      if (
        !originals.length ||
        originals.length !== currentArticles.length ||
        originals.some((article) => !currentArticles.some((row) => row.id === article.id))
      )
        throw Error("Exact empty or historical addition disposition required")
      revised = originals.map((article) => {
        const next = currentArticles.find((row) => row.id === article.id)
        if (isDeepStrictEqual(articleView(article, original), articleView(next, after))) {
          preserved.push(article.id)
          return existingArticleProjection(article)
        }
        const selected = graph.inputs.find((row) => row.event_id === article.id)
        if (!selected) throw Error("Changed event requires native approval: " + article.id)
        const approved = articleApproval(selected).article
        Object.assign(
          omissions,
          assertRetrospectiveAppearance(approved, article, relative, Buffer.from(before.content)),
        )
        support.push(selected)
        return approved
      })
    }
    projection ||= editionProjection(revised, {
      key: path.basename(relative, ".md"),
      date: metadata.date,
      coverage_start: metadata.coverage_start,
      coverage_end: metadata.coverage_end,
      existing: original,
      reviewed_sections: omissions,
      concept_paths_by_id: concepts,
      legacy_review: reviewed?.packet || null,
      source_root: root,
    })
    const presented = presentContainer(relative, before.sha256, chainContent || projection.content)
    let projectedContent = presented.content
    const projected = parseNote(projectedContent)
    // Mapping order is serialization, while array order and the complete body
    // remain exact. Preserve an existing serializer's key order only after all
    // projected metadata values and body bytes have independently matched.
    const mappingOrderPreserved = !Buffer.from(projectedContent).equals(current.bytes)
    if (mappingOrderPreserved) {
      if (!isDeepStrictEqual(projected.meta, after.meta) || projected.body !== after.body)
        throw Error("Full approved source projection differs from current edition bytes")
      projectedContent = noteText(after.meta, projected.body)
      if (!Buffer.from(projectedContent).equals(current.bytes))
        throw Error("Full approved source projection differs from current edition bytes")
    }
    return {
      kind: chain
        ? "native_retrospective_chain"
        : reviewed
          ? "complete_legacy_transition"
          : "native_retrospective",
      original_sha256: before.sha256,
      projected_sha256: sha256(projectedContent),
      ...(presented.proof ? { presentation: presented.proof } : {}),
      ...(mappingOrderPreserved
        ? { mapping_order_preserved: true, native_projected_sha256: sha256(presented.content) }
        : {}),
      ...(chain ? { steps: chainProof } : {}),
      ...(reviewed
        ? { review: reviewed.reference, packet_sha256: sha256(JSON.stringify(reviewed.packet)) }
        : {}),
      approved_inputs: support,
      preserved_event_ids: preserved,
    }
  }
  const prepareRow = (row, current) => {
    const prior = priorReconciliation?.files.find(
      (file) =>
        file.path === row.path &&
        file.status === "prepared_private" &&
        file.local_sha256 === row.local_sha256 &&
        file.remote_sha256 === row.remote_sha256,
    )
    if (prior) {
      const origin = prior.stage_origin_run || priorReconciliation.run_id
      if (
        !/^[A-Za-z0-9_-]{1,100}$/.test(origin) ||
        prior.staged_path !== `drive-reconcile/${origin}/files/${row.path}` ||
        !fs.readFileSync(safePath(root, prior.staged_path)).equals(current.bytes)
      )
        throw Error("Previous approved private stage changed")
      row.staged_path = prior.staged_path
      row.stage_origin_run = origin
      row.stage_reused = true
    } else {
      row.staged_path = `drive-reconcile/${input.run_id}/files/${row.path}`
      row.stage_origin_run = input.run_id
      row.stage_reused = false
      stage.push({ path: row.staged_path, bytes: current.bytes })
    }
    row.status = "prepared_private"
  }
  for (const [relative, current] of local) {
    const before = remote.get(relative)
    if (before?.sha256 === current.sha256) continue
    const row = {
      path: relative,
      operation: before ? "replace" : "create",
      remote_sha256: before?.sha256 || null,
      local_sha256: current.sha256,
      bytes: current.bytes.length,
      status: "review_required",
      missing_evidence: [],
      native_support: [],
    }
    if (!relative.startsWith("Editions/")) {
      const task = checkpoint.tasks.find(
        (t) =>
          t.path === relative &&
          t.kind !== "connection" &&
          t.status === "ready" &&
          t.note_sha256 === current.sha256,
      )
      if (!task?.approval_run || !task.approval)
        row.missing_evidence.push("exact_native_note_approval_required")
      else
        try {
          checked(root, task.approval)
          const approved = noteApproval(task.approval_run),
            note = approved.approval.notes.find(
              (n) => n.path === relative && n.sha256 === current.sha256,
            )
          if (
            !note ||
            task.approval.sha256 !== approved.files.approval_sha256 ||
            !Buffer.from(note.content).equals(current.bytes)
          )
            throw Error("Current note is not the exact approved native bytes")
          row.native_support.push({
            run: approved.run,
            approval: task.approval,
            review_sha256: approved.files.review_sha256,
            approved_note_sha256: note.sha256,
          })
          prepareRow(row, current)
        } catch (error) {
          row.missing_evidence.push("native_note_evidence_invalid")
          row.evidence_error = error.message
        }
    } else {
      try {
        const edition = {
            file: path.join(absoluteVault, relative),
            ...parseNote(current.bytes.toString("utf8")),
          },
          articles = extractArticles(edition)
        if (!articles.length) row.missing_evidence.push("native_article_evidence_required")
        const normalizedBody = (article, source) =>
          article.body.replace(
            /\[(S\d+)\]/g,
            (_, marker) => `{source:${canonicalURL(source.get(marker))}}`,
          )
        for (const article of articles) {
          const selection = graph.inputs.find((s) => s.event_id === article.id)
          if (!selection) {
            row.missing_evidence.push(`native_article_approval_required:${article.id}`)
            continue
          }
          try {
            const approved = articleApproval(selection)
            const projected = editionProjection(
              articles.map((a) =>
                a.id === article.id ? approved.article : existingArticleProjection(a),
              ),
              {
                key: path.basename(relative, ".md"),
                date: edition.meta.date,
                coverage_start: edition.meta.coverage_start,
                coverage_end: edition.meta.coverage_end,
                existing: edition,
                concept_paths_by_id: concepts,
              },
            )
            const generated = { file: edition.file, ...parseNote(projected.content) },
              exact = extractArticles(generated).find((a) => a.id === article.id)
            const view = (a) => ({
              title: a.title,
              urls: a.urls,
              review: a.review,
              editorial: a.editorial,
              classification: a.classification,
              concepts: a.concepts,
            })
            if (
              !exact ||
              !isDeepStrictEqual(view(article), view(exact)) ||
              normalizedBody(article, sourceMap(edition.body)) !==
                normalizedBody(exact, sourceMap(generated.body))
            )
              throw Error("Canonical article differs from its approved native projection")
            row.native_support.push({
              run: selection.run,
              event_id: article.id,
              files: selection.files,
            })
          } catch (error) {
            row.missing_evidence.push(`native_article_projection_invalid:${article.id}`)
            row.evidence_error = error.message
          }
        }
      } catch (error) {
        row.missing_evidence.push("edition_projection_evidence_invalid")
        row.evidence_error = error.message
      }
      try {
        row.file_projection = completeEditionProjection(relative, before, current)
        row.native_support = row.file_projection.approved_inputs
        row.missing_evidence = []
        delete row.evidence_error
        prepareRow(row, current)
      } catch (error) {
        row.missing_evidence.push("exact_edition_container_review_required")
        row.file_projection_error = error.message
      }
    }
    fileRows.push(row)
  }
  for (const [relative, before] of remote)
    if (!local.has(relative))
      fileRows.push({
        path: relative,
        operation: "local_absent",
        remote_sha256: before.sha256,
        local_sha256: null,
        status: "review_required",
        missing_evidence: ["explicit_remote_file_disposition_required"],
        native_support: [],
      })
  const result = {
    schema: "research-authoring-source-reconciliation/v1",
    run_id: input.run_id,
    input: { path: inputFile, sha256: sha256(inputBytes) },
    observed_at: new Date(now).toISOString(),
    source_capture: sourceStatus,
    knowledge_checkpoint: input.knowledge_checkpoint,
    knowledge_input: checkpoint.input,
    ontology: checkpoint.ontology,
    legacy_reviews: input.legacy_reviews || [],
    container_reviews: input.container_reviews || [],
    retrospective_steps: retrospectiveSteps,
    prior_reconciliation: input.prior_reconciliation || null,
    private_preview: {
      manifest: input.preview_manifest,
      generation_observed_at: manifest.observed_at,
      existing_transfer_plan: planRef,
      files: plan.files.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        staged_path: file.staged_path,
      })),
      reused: true,
      renderer_reexecuted: false,
    },
    counts: {
      different_files: fileRows.length,
      prepared_private: fileRows.filter((r) => r.status === "prepared_private").length,
      review_required: fileRows.filter((r) => r.status === "review_required").length,
    },
    private_staging: {
      new_files: stage.length,
      reused_files: fileRows.filter((row) => row.stage_reused).length,
    },
    files: fileRows,
    external_requirements: [
      ...(!sourceStatus.fresh ? ["fresh_complete_drive_readback_required"] : []),
      "explicit_authoring_release_required",
      "remote_prewrite_conflict_check_required",
    ],
    generation_implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    approval_granted: false,
    release_approved: false,
    upload_allowed: false,
    canonical_applied: false,
    remote_write_performed: false,
    publication_performed: false,
  }
  // Pin again before any private staging. One missing file's review does not
  // block exact approved files; changed common evidence does block this run.
  checked(root, input.knowledge_checkpoint)
  checked(root, input.preview_manifest)
  checked(root, planRef)
  checked(root, { path: capturePath, sha256: input.source_capture.sha256 })
  checked(root, capture.source_snapshot)
  checked(root, capture.source_readback)
  for (const reference of input.legacy_reviews || []) checked(root, reference)
  presentationEvidence(root, input.container_reviews || [])
  for (const row of retrospectiveSteps)
    for (const batch of row.batches) if (batch.readback) checked(root, batch.readback)
  checked(root, { path: inputFile, sha256: sha256(inputBytes) })
  if (input.prior_reconciliation) checked(root, input.prior_reconciliation)
  for (const approved of noteCache.values()) {
    checked(root, {
      path: `runs/${approved.run}/approved-notes.json`,
      sha256: approved.files.approval_sha256,
    })
    checked(root, {
      path: `runs/${approved.run}/note-review.json`,
      sha256: approved.files.review_sha256,
    })
  }
  for (const approved of articleCache.values())
    for (const [name, digest] of Object.entries(approved.file_hashes))
      checked(root, { path: `runs/${approved.run}/${name}`, sha256: digest })
  if (
    !isDeepStrictEqual(
      [...local].map(([p, r]) => [p, r.sha256]),
      [...authoringInventory(absoluteVault)].map(([p, r]) => [p, r.sha256]),
    )
  )
    throw Error("Authoring inputs changed during reconciliation")
  const target = `drive-reconcile/${input.run_id}/reconciliation.json`
  if (fs.existsSync(safePath(root, target)))
    throw Error("Reconciliation run already exists; preserve the stored result")
  for (const file of stage) atomicCreate(root, file.path, file.bytes)
  atomicCreate(root, target, jsonBytes(result))
  return { ...result, reconciliation: { path: target, sha256: sha256(jsonBytes(result)) } }
}

// Consume saved evidence and private bytes without preparing again. Historical
// generation pins stay separate from this read's implementation and expiry.
export function loadAuthoringSourceReconciliation(
  root,
  runId,
  { repository = process.cwd(), vault = "vault", now = Date.now(), offset = 0, limit = 20 } = {},
) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId || "")) throw Error("Exact reconciliation run required")
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("Bounded reconciliation page required")
  const resultRef = ref(root, `drive-reconcile/${runId}/reconciliation.json`),
    result = checked(root, resultRef),
    input = checked(root, result.input)
  if (
    result.schema !== "research-authoring-source-reconciliation/v1" ||
    result.run_id !== runId ||
    input.schema !== "research-authoring-source-reconciliation-input/v1" ||
    input.run_id !== runId ||
    [
      "approval_granted",
      "release_approved",
      "upload_allowed",
      "canonical_applied",
      "remote_write_performed",
      "publication_performed",
    ].some((key) => result[key] !== false) ||
    !Array.isArray(result.files) ||
    new Set(result.files.map((file) => file.path)).size !== result.files.length
  )
    throw Error("Exact saved private reconciliation required")
  const sourceStatus = loadAuthoringSourceCapture(root, input.source_capture.run_id, {
    repository,
    vault,
    now,
  })
  if (
    sourceStatus.capture.sha256 !== input.source_capture.sha256 ||
    !isDeepStrictEqual(sourceStatus.capture, result.source_capture.capture)
  )
    throw Error("Pinned source capture changed")
  const snapshot = checked(root, sourceStatus.source_snapshot),
    remote = new Map(snapshot.files.map((file) => [file.path, file])),
    checkpoint = checked(root, input.knowledge_checkpoint),
    knowledgeInput = checked(root, checkpoint.input),
    graph = checked(root, checkpoint.ontology)
  if (
    checkpoint.schema !== "research-knowledge-linking/v1" ||
    checkpoint.input_sha256 !== sha256(JSON.stringify(knowledgeInput)) ||
    checkpoint.workflow_id !== knowledgeInput.workflow_id ||
    !isDeepStrictEqual(input.knowledge_checkpoint, result.knowledge_checkpoint) ||
    !isDeepStrictEqual(checkpoint.input, result.knowledge_input) ||
    !isDeepStrictEqual(checkpoint.ontology, result.ontology) ||
    !isDeepStrictEqual(input.legacy_reviews || [], result.legacy_reviews || []) ||
    !isDeepStrictEqual(input.container_reviews || [], result.container_reviews || []) ||
    !isDeepStrictEqual(input.retrospective_steps || [], result.retrospective_steps || []) ||
    !isDeepStrictEqual(input.prior_reconciliation || null, result.prior_reconciliation || null)
  )
    throw Error("Saved reconciliation basis changed")
  assertEvidenceOntology(graph)
  const reviews = legacyEvidence(root, input.legacy_reviews || [])
  const containerReviews = presentationEvidence(root, input.container_reviews || [])
  if (input.prior_reconciliation) checked(root, input.prior_reconciliation)
  if (!isDeepStrictEqual(input.preview_manifest, result.private_preview.manifest))
    throw Error("Saved preview pin changed")
  const manifest = checked(root, input.preview_manifest),
    plan = checked(root, result.private_preview.existing_transfer_plan)
  if (
    input.preview_manifest.path !== `runs/${manifest.run_id}/preview-manifest.json` ||
    result.private_preview.existing_transfer_plan.path !==
      `runs/${manifest.run_id}/drive-authoring/transfer-plan.json` ||
    plan.preview_run !== manifest.run_id ||
    plan.preview_sha256 !== input.preview_manifest.sha256 ||
    manifest.candidate_published !== false ||
    plan.release_approved !== false ||
    plan.upload_allowed !== false ||
    plan.candidate_published !== false ||
    !isDeepStrictEqual(
      result.private_preview.files,
      plan.files.map(({ path, sha256, staged_path }) => ({ path, sha256, staged_path })),
    )
  )
    throw Error("Saved private preview plan changed")
  const authoring = [
    ...manifest.editions,
    ...manifest.knowledge,
    ...(manifest.navigation ? [manifest.navigation] : []),
  ]
  for (const file of plan.files)
    if (
      file.staged_path !== `runs/${manifest.run_id}/drive-authoring/files/${file.path}` ||
      !authoring.some((row) => row.path === file.path && row.sha256 === file.sha256) ||
      sha256(fs.readFileSync(safePath(root, file.staged_path))) !== file.sha256
    )
      throw Error("Existing preview authoring bytes changed")
  const absoluteVault = path.resolve(repository, vault),
    local = authoringInventory(absoluteVault),
    notes = new Map(),
    articles = new Map()
  const expectedLocal = new Map(snapshot.files.map((file) => [file.path, file.sha256]))
  for (const file of result.files) {
    if (file.local_sha256 === null) expectedLocal.delete(file.path)
    else expectedLocal.set(file.path, file.local_sha256)
  }
  const changed = [...local].filter(
      ([file, current]) => expectedLocal.get(file) !== current.sha256,
    ).length,
    absent = [...expectedLocal.keys()].filter((file) => !local.has(file)).length
  const articleApproval = (support) => {
    const selected = graph.inputs.find(
      (row) => row.run === support.run && row.event_id === support.event_id,
    )
    if (!selected || !isDeepStrictEqual(selected.files, support.files))
      throw Error("Saved native article selection changed")
    if (!articles.has(support.run))
      articles.set(
        support.run,
        loadApprovedOntologyInput(root, support.run, { vault: absoluteVault }),
      )
    const approved = articles.get(support.run)
    if (!isDeepStrictEqual(approved.file_hashes, support.files))
      throw Error("Saved native article approval changed")
  }
  for (const run of manifest.approved_runs) {
    const selected = graph.inputs.find((row) => row.run === run)
    if (!selected) throw Error("Preview article approval is absent from the pinned native basis")
    articleApproval(selected)
  }
  for (const run of manifest.knowledge_runs)
    notes.set(run, loadHistoricalNoteApproval(root, run, { vault: absoluteVault }))
  let prepared = 0,
    stagedNew = 0,
    stagedReused = 0
  for (const file of result.files) {
    if (
      !/^(Editions|Knowledge|Signals|TrendTopics)\/.+\.md$/.test(file.path) ||
      !["prepared_private", "review_required"].includes(file.status) ||
      file.remote_sha256 !== (remote.get(file.path)?.sha256 || null)
    )
      throw Error("Saved reconciliation file identity changed")
    safePath(absoluteVault, file.path)
    if (file.status !== "prepared_private") continue
    prepared++
    const origin =
      file.stage_origin_run ||
      (file.stage_reused
        ? JSON.parse(fs.readFileSync(safePath(root, result.prior_reconciliation.path))).run_id
        : runId)
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(origin || "") ||
      file.staged_path !== `drive-reconcile/${origin}/files/${file.path}`
    )
      throw Error("Saved reconciliation stage path changed")
    const bytes = fs.readFileSync(safePath(root, file.staged_path))
    if (sha256(bytes) !== file.local_sha256 || bytes.length !== file.bytes)
      throw Error("Prepared reconciliation bytes changed")
    if (file.stage_reused) stagedReused++
    else stagedNew++
    if (file.path.startsWith("Editions/")) {
      if (
        !file.file_projection ||
        file.file_projection.original_sha256 !== file.remote_sha256 ||
        file.file_projection.projected_sha256 !== file.local_sha256 ||
        !isDeepStrictEqual(file.file_projection.approved_inputs, file.native_support)
      )
        throw Error("Saved complete edition projection changed")
      const validatePresentation = (proof, outputSha) => {
        if (
          !containerReviews.some(
            ({ packet, reference }) =>
              isDeepStrictEqual(reference, proof.review) &&
              packet.target_path === file.path &&
              packet.source_sha256 === file.remote_sha256 &&
              packet.projection.sha256 === proof.native_projected_sha256 &&
              packet.target.sha256 === proof.presented_sha256 &&
              proof.presented_sha256 === outputSha,
          )
        )
          throw Error("Saved exact container presentation review changed")
      }
      if (file.file_projection.presentation)
        validatePresentation(
          file.file_projection.presentation,
          file.file_projection.native_projected_sha256 || file.local_sha256,
        )
      for (const support of file.native_support) articleApproval(support)
      if (file.file_projection.kind === "complete_legacy_transition") {
        if (
          !reviews.some(
            ({ packet, reference }) =>
              isDeepStrictEqual(reference, file.file_projection.review) &&
              packet.target_path === file.path &&
              packet.target_sha256 === file.remote_sha256 &&
              sha256(JSON.stringify(packet)) === file.file_projection.packet_sha256,
          )
        )
          throw Error("Saved complete legacy review changed")
      } else if (file.file_projection.kind === "native_retrospective_chain") {
        const selected = (input.retrospective_steps || []).find((row) => row.path === file.path)
        if (
          !selected ||
          !Array.isArray(file.file_projection.steps) ||
          selected.batches.length !== file.file_projection.steps.length
        )
          throw Error("Saved exact retrospective chain required")
        let expectedBefore = file.remote_sha256
        for (let i = 0; i < selected.batches.length; i++) {
          const batch = selected.batches[i],
            step = file.file_projection.steps[i]
          if (
            !isDeepStrictEqual(batch.runs, step.runs) ||
            !isDeepStrictEqual(batch.readback || null, step.readback) ||
            step.before_sha256 !== expectedBefore ||
            !/^[a-f0-9]{64}$/.test(step.after_sha256 || "")
          )
            throw Error("Saved retrospective chain pins changed")
          if (step.presentation) validatePresentation(step.presentation, step.after_sha256)
          if (batch.readback) {
            const receipt = checked(root, batch.readback),
              mutation = receipt.mutations?.find((row) => row.path === file.path)
            const events = batch.runs.map(
              (run) => file.native_support.find((row) => row.run === run)?.event_id,
            )
            if (
              receipt.schema !== "research-local-approved-articles-apply/v1" ||
              !mutation ||
              (mutation.before_sha256 && mutation.before_sha256 !== step.before_sha256) ||
              mutation.after_sha256 !== step.after_sha256 ||
              !isDeepStrictEqual([...mutation.event_ids].sort(), events.sort())
            )
              throw Error("Saved retrospective chain readback changed")
          }
          expectedBefore = step.after_sha256
        }
        if (
          expectedBefore !==
          (file.file_projection.presentation?.native_projected_sha256 ||
            file.file_projection.native_projected_sha256 ||
            file.local_sha256)
        )
          throw Error("Saved retrospective chain output changed")
      } else if (file.file_projection.kind !== "native_retrospective")
        throw Error("Saved complete edition proof required")
    } else {
      const task = checkpoint.tasks.find(
        (row) =>
          row.path === file.path &&
          row.kind !== "connection" &&
          row.status === "ready" &&
          row.note_sha256 === file.local_sha256,
      )
      if (!task?.approval_run || file.native_support.length !== 1)
        throw Error("Saved ready note approval required")
      const support = file.native_support[0]
      if (!notes.has(support.run))
        notes.set(
          support.run,
          loadHistoricalNoteApproval(root, support.run, { vault: absoluteVault }),
        )
      const approved = notes.get(support.run),
        note = approved.approval.notes.find(
          (row) => row.path === file.path && row.sha256 === file.local_sha256,
        )
      if (
        !note ||
        !Buffer.from(note.content).equals(bytes) ||
        task.approval_run !== support.run ||
        !isDeepStrictEqual(task.approval, support.approval) ||
        support.approval.sha256 !== approved.files.approval_sha256 ||
        support.review_sha256 !== approved.files.review_sha256 ||
        support.approved_note_sha256 !== file.local_sha256
      )
        throw Error("Saved native note approval changed")
      checked(root, support.approval)
    }
  }
  const blocked = result.files.filter((file) => file.status === "review_required"),
    counts = {
      different_files: result.files.length,
      prepared_private: prepared,
      review_required: blocked.length,
    }
  if (
    !isDeepStrictEqual(counts, result.counts) ||
    (result.private_staging &&
      !isDeepStrictEqual(result.private_staging, {
        new_files: stagedNew,
        reused_files: stagedReused,
      }))
  )
    throw Error("Saved reconciliation counts changed")
  return {
    schema: "research-authoring-source-reconciliation-status/v1",
    run_id: runId,
    reconciliation: resultRef,
    input: result.input,
    observed_at: new Date(now).toISOString(),
    generation_observed_at: result.observed_at,
    generation_implementation_sha256: result.generation_implementation_sha256,
    consumption_implementation_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
    source_capture: {
      ...sourceStatus,
      expires_at: new Date(Date.parse(sourceStatus.observed_at) + 600000).toISOString(),
    },
    knowledge_checkpoint: input.knowledge_checkpoint,
    preview_manifest: input.preview_manifest,
    counts,
    private_staging: result.private_staging || { new_files: stagedNew, reused_files: stagedReused },
    current_local_drift: {
      changed_files: changed,
      absent_files: absent,
      current_bytes_match: !changed && !absent,
    },
    page: {
      offset,
      limit,
      total: blocked.length,
      next_offset: offset + limit < blocked.length ? offset + limit : null,
    },
    review_required_files: blocked
      .slice(offset, offset + limit)
      .map(
        ({
          path,
          operation,
          local_sha256,
          remote_sha256,
          missing_evidence,
          evidence_error,
          file_projection_error,
        }) => ({
          path,
          operation,
          local_sha256,
          remote_sha256,
          missing_evidence,
          ...(evidence_error ? { evidence_error } : {}),
          ...(file_projection_error ? { file_projection_error } : {}),
        }),
      ),
    external_requirements: [
      ...(!sourceStatus.fresh ? ["fresh_complete_drive_readback_required"] : []),
      "explicit_authoring_release_required",
      "remote_prewrite_conflict_check_required",
    ],
    read_only: true,
    approvals_created: false,
    staging_reexecuted: false,
    renderer_reexecuted: false,
    remote_write_performed: false,
    publication_performed: false,
  }
}
