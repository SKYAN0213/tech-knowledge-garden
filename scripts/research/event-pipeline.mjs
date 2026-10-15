import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { assertReviewDate, parseResearchDate, samePublicationDate } from "./dates.mjs"
import {
  buildCollectionReport,
  readCollectionMaterial,
  createCollectionMaterialReader,
} from "./collection-report.mjs"
import { selectStoredSources, loadStoredSourceRun } from "./parser.mjs"
import { saveSourceSelection } from "./source-selection.mjs"
import { loadCurrentApproval, loadHistoricalApproval } from "./preview.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { schema, id, text, list, validateArguments, nativeResearch } from "./modules/contracts.mjs"

export const digest = { type: "string", pattern: "^[a-f0-9]{64}$" }
const optionalText = { type: ["string", "null"], maxLength: 500 }
const citation = schema(
  {
    aspect: { type: "string", enum: ["identity_marker", "event_action", "event_date", "context"] },
    block_id: text,
    quote: { type: "string", minLength: 8, maxLength: 4000 },
  },
  ["aspect", "block_id", "quote"],
)
const match = schema(
  {
    ...citation.properties,
    primary_block_id: text,
    primary_quote: citation.properties.quote,
    conclusion: text,
  },
  [...citation.required, "primary_block_id", "primary_quote", "conclusion"],
)
const priorMatch = schema({ ...match.properties, parse_id: text }, [...match.required, "parse_id"])
export const eventReviewSchema = schema(
  {
    schema: { type: "string", enum: ["research-event-decisions/v1"] },
    reviewer: text,
    reviewed_at: text,
    events: list(
      schema(
        {
          group_id: id,
          action: { type: "string", enum: ["write", "reuse", "update", "correction", "defer"] },
          identity: schema(
            {
              who: text,
              action: text,
              object: text,
              occurred_at: optionalText,
              external_id: optionalText,
            },
            ["who", "action", "object", "occurred_at", "external_id"],
          ),
          reason: text,
          prior_run: id,
          prior_matches: list(priorMatch, 8, 2),
          materials: list(
            schema(
              {
                material_id: digest,
                role: {
                  type: "string",
                  enum: ["primary", "same_event", "supplement", "counter_evidence"],
                },
                block_ids: list(text, 2000),
                evidence: list(citation, 20),
                matches: list(match, 8, 2),
              },
              ["material_id", "role", "block_ids", "evidence"],
            ),
            8,
          ),
        },
        ["group_id", "action", "identity", "reason", "materials"],
      ),
      500,
    ),
  },
  ["schema", "reviewer", "reviewed_at", "events"],
)

function checkedJSON(root, reference) {
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (!/^[a-f0-9]{64}$/.test(reference.sha256 || "") || sha256(bytes) !== reference.sha256)
    throw Error("Frozen pipeline input SHA-256 changed")
  return JSON.parse(bytes)
}
function immutable(root, file, value) {
  const bytes = JSON.stringify(value, null, 2) + "\n"
  if (!fs.existsSync(safePath(root, file))) return atomicCreate(root, file, bytes)
  if (!fs.readFileSync(safePath(root, file)).equals(Buffer.from(bytes)))
    throw Error("Pipeline input changed; use a new run ID")
  return { path: file, sha256: sha256(bytes) }
}
export function checkedEdition(ctx, reference) {
  const edition = checkedJSON(ctx.root, reference)
  if (
    edition.schema !== "research-edition-materials/v1" ||
    reference.path !== `editions/${edition.run_id}/materials.json`
  )
    throw Error("Exact frozen edition required")
  const report = checkedJSON(ctx.root, edition.report)
  if (report.schema !== "research-collection-report/v1" || report.daily_run !== edition.daily_run)
    throw Error("Edition collection report identity changed")
  return { edition, report }
}
const materialRead = (ctx, edition, materialId) =>
  readCollectionMaterial({
    root: ctx.root,
    reportPath: edition.report.path,
    reportSha256: edition.report.sha256,
    materialId,
  })
const editionReader = (ctx, edition) =>
  createCollectionMaterialReader({
    root: ctx.root,
    reportPath: edition.report.path,
    reportSha256: edition.report.sha256,
  })

export async function freezeEdition(ctx, { run_id, report_path, report_sha256 }) {
  const reference = { path: report_path, sha256: report_sha256 }
  return withLock(ctx.root, "edition-" + run_id, () => {
    const prior = readJSON(ctx.root, `editions/${run_id}/materials.json`)
    if (prior) {
      if (JSON.stringify(prior.report) !== JSON.stringify(reference))
        throw Error("Edition report changed; use a new run ID")
      const saved = {
        path: `editions/${run_id}/materials.json`,
        sha256: sha256(fs.readFileSync(safePath(ctx.root, `editions/${run_id}/materials.json`))),
      }
      const { edition, report } = checkedEdition(ctx, saved)
      const readMaterial = editionReader(ctx, edition)
      report.materials.forEach((material) => readMaterial(material.id))
      return {
        ...saved,
        status: edition.status,
        daily_run: edition.daily_run,
        counts: report.counts,
        reused: true,
      }
    }
    const report = checkedJSON(ctx.root, reference)
    if (report_path !== `daily/runs/${report.daily_run}/collection-reports/${report_sha256}.json`)
      throw Error("Native immutable collection report required")
    const supplementalIds = new Set(
      report.materials.flatMap((m) =>
        m.observations.filter((o) => o.linked_from).map((o) => o.scan_run),
      ),
    )
    const supplementalRuns = report.evidence
      .filter(
        (ref) =>
          /^runs\/[^/]+\/documents\.json$/.test(ref.path) &&
          supplementalIds.has(ref.path.split("/")[1]),
      )
      .map((ref) => ref.path.split("/")[1])
    const rebuilt = buildCollectionReport({
      root: ctx.root,
      runId: report.daily_run,
      supplementalRuns,
    })
    if (sha256(JSON.stringify(rebuilt)) !== sha256(JSON.stringify(report)))
      throw Error("Collection report is not the settled native report")
    if (report.routes.some((route) => route.windows.some((window) => window.status === "pending")))
      throw Error("Attempt all planned collection windows before freezing an edition")
    const edition = {
      schema: "research-edition-materials/v1",
      run_id,
      daily_run: report.daily_run,
      report: reference,
      status: report.status,
      frozen_at: new Date().toISOString(),
      candidate_approved: false,
      candidate_published: false,
    }
    const readMaterial = editionReader(ctx, edition)
    report.materials.forEach((material) => readMaterial(material.id))
    return {
      ...immutable(ctx.root, `editions/${run_id}/materials.json`, edition),
      status: edition.status,
      daily_run: edition.daily_run,
      counts: report.counts,
      reused: false,
    }
  })
}

export function editionMaterials(ctx, { edition_path, edition_sha256, material_id }) {
  const { edition, report } = checkedEdition(ctx, { path: edition_path, sha256: edition_sha256 })
  return material_id
    ? materialRead(ctx, edition, material_id)
    : {
        edition,
        counts: report.counts,
        routes: report.routes,
        missing: report.missing,
        materials: report.materials,
      }
}

export function proposeEditionEvents(ctx, parameters) {
  const { edition, report } = checkedEdition(ctx, {
    path: parameters.edition_path,
    sha256: parameters.edition_sha256,
  })
  const readMaterial = editionReader(ctx, edition)
  return {
    schema: "research-edition-event-proposals/v1",
    edition: { path: parameters.edition_path, sha256: parameters.edition_sha256 },
    status: "relationship_review",
    writer_allowed: false,
    candidates: report.materials
      .filter((m) => m.roles.includes("article_candidate"))
      .map((m) => {
        const read = readMaterial(m.id)
        return {
          proposal_id: `proposal-${m.id.slice(0, 24)}`,
          material_id: m.id,
          title: m.title,
          published_at: m.published_at,
          source_version_id: m.source_version_id,
          parse_id: m.parse_id,
          block_count: read.blocks.length,
          relation_status: "unreviewed",
        }
      }),
    supplemental_material_ids: report.materials
      .filter((m) => !m.roles.includes("listing") && !m.roles.includes("article_candidate"))
      .map((m) => m.id),
  }
}

function assertQuote(blocks, evidence) {
  const block = blocks.find((b) => b.block_id === evidence.block_id)
  if (!block || !block.text.includes(evidence.quote))
    throw Error("Event relation requires an exact original block and quote")
}
function assertIdentityAspects(rows) {
  if (!["identity_marker", "event_action"].every((aspect) => rows.some((r) => r.aspect === aspect)))
    throw Error("Event relation requires identity-marker and event-action comparisons")
}

function verifyEvents(ctx, edition, report, review) {
  validateArguments(review, eventReviewSchema, ctx)
  const materials = new Map(report.materials.map((m) => [m.id, m]))
  const reads = new Map(),
    identities = new Set(),
    groups = new Set()
  const readMaterial = editionReader(ctx, edition)
  const read = (id) => {
    if (!reads.has(id)) reads.set(id, readMaterial(id))
    return reads.get(id)
  }
  return review.events.map((event) => {
    if (groups.has(event.group_id)) throw Error("Duplicate event group ID")
    groups.add(event.group_id)
    const identityKey = sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(event.identity).map(([key, value]) => [
            key,
            typeof value === "string"
              ? value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()
              : value,
          ]),
        ),
      ),
    )
    if (identities.has(identityKey)) throw Error("Duplicate event identity in one edition plan")
    identities.add(identityKey)
    if (event.identity.occurred_at !== null && !parseResearchDate(event.identity.occurred_at))
      throw Error("Valid event date or explicit null required")
    if (
      event.materials.filter((m) => m.role === "primary").length !== 1 ||
      new Set(event.materials.map((m) => m.material_id)).size !== event.materials.length
    )
      throw Error("One primary and unique event materials required")
    const primary = event.materials.find((m) => m.role === "primary"),
      primaryRead = read(primary.material_id)
    if (
      !primaryRead.material.roles.includes("article_candidate") ||
      primaryRead.material.parse_status !== "extracted"
    )
      throw Error("Primary event must use a collected article candidate with an extracted body")
    assertIdentityAspects(primary.evidence)
    const versions = new Set()
    const sources = event.materials.map((row) => {
      const original = materials.get(row.material_id)
      if (!original || original.roles.includes("listing") || original.parse_status !== "extracted")
        throw Error("Event material must be an extracted source in the frozen edition")
      if (versions.has(original.source_version_id))
        throw Error("Duplicate source version in an event; select one exact parse")
      versions.add(original.source_version_id)
      const source = read(row.material_id)
      if (
        new Set(row.block_ids).size !== row.block_ids.length ||
        row.block_ids.some((blockId) => !source.blocks.some((b) => b.block_id === blockId))
      )
        throw Error("Event block scope differs from the stored source")
      row.evidence.forEach((proof) => {
        assertQuote(source.blocks, proof)
        if (!row.block_ids.includes(proof.block_id))
          throw Error("Relation evidence must belong to the event block scope")
      })
      if (row.role === "same_event") {
        assertIdentityAspects(row.matches || [])
        if (
          original.published_at &&
          primaryRead.material.published_at &&
          !samePublicationDate(original.published_at, primaryRead.material.published_at) &&
          !row.matches.some((proof) => proof.aspect === "event_date")
        )
          throw Error("Different publication dates require a direct event-date comparison")
        row.matches.forEach((proof) => {
          assertQuote(source.blocks, proof)
          assertQuote(primaryRead.blocks, {
            block_id: proof.primary_block_id,
            quote: proof.primary_quote,
          })
          if (
            !row.block_ids.includes(proof.block_id) ||
            !primary.block_ids.includes(proof.primary_block_id)
          )
            throw Error("Same-event comparison is outside the selected block scope")
        })
      } else if (row.matches) throw Error("Same-event matches belong only to a same_event source")
      assertReviewDate(review.reviewed_at, {
        notBefore: original.observations.map((o) => o.observed_at),
      })
      const origin = original.observations.find((o) => {
        const documents = readJSON(ctx.root, `runs/${o.scan_run}/documents.json`)
        return documents?.some(
          (d) =>
            d.source_version_id === original.source_version_id && d.original_url === original.url,
        )
      })
      if (!origin) throw Error("Event source has no native captured run in this edition")
      return {
        material_id: row.material_id,
        source_run: origin.scan_run,
        source_id: original.source_id,
        source_version_id: original.source_version_id,
        parse_id: original.parse_id,
        url: original.url,
        role: row.role,
        block_ids: row.block_ids,
      }
    })
    let prior = null
    if (["reuse", "update", "correction"].includes(event.action) && !event.prior_run)
      throw Error("Existing-event action requires an exact native approval run")
    if (event.prior_run) {
      const approved = (ctx.historical ? loadHistoricalApproval : loadCurrentApproval)(
        ctx.root,
        event.prior_run,
        { vault: ctx.vault },
      )
      assertIdentityAspects(event.prior_matches || [])
      const parses = readJSON(ctx.root, `runs/${event.prior_run}/parses.json`)
      if (
        event.action === "reuse" &&
        primaryRead.material.published_at &&
        !samePublicationDate(
          primaryRead.material.published_at,
          approved.article.article_review.published_at,
        ) &&
        !event.prior_matches.some((proof) => proof.aspect === "event_date")
      )
        throw Error(
          "Re-observation on another publication date requires a direct prior event-date comparison",
        )
      event.prior_matches.forEach((proof) => {
        const parsed = parses.find((p) => p.parse_id === proof.parse_id)
        if (!parsed) throw Error("Prior event comparison needs its exact approved parse")
        assertQuote(parsed.blocks, proof)
        assertQuote(primaryRead.blocks, {
          block_id: proof.primary_block_id,
          quote: proof.primary_quote,
        })
      })
      prior = {
        run_id: event.prior_run,
        event_id: approved.article.event_id,
        article_sha256: sha256(JSON.stringify(approved.article)),
      }
    } else if (event.prior_matches)
      throw Error("Prior event evidence requires a prior approval run")
    return { ...event, sources, prior, writer_allowed: event.action === "write" }
  })
}

export async function reviewEditionEvents(
  ctx,
  { run_id, edition_path, edition_sha256, review_file },
) {
  const editionRef = { path: edition_path, sha256: edition_sha256 },
    { edition, report } = checkedEdition(ctx, editionRef)
  const bytes = fs.readFileSync(safePath(ctx.repo, review_file)),
    review = JSON.parse(bytes)
  const events = verifyEvents(ctx, edition, report, review)
  // An already approved source may contain further actions (e.g. an IR report),
  // but an explicit comparison with that event is required before another writer.
  if (ctx.backlog && fs.existsSync(ctx.backlog)) {
    const candidates = JSON.parse(fs.readFileSync(ctx.backlog, "utf8")).candidates || []
    const approvals = new Map()
    for (const event of events.filter((e) => e.action !== "defer")) {
      const urls = new Set(
        event.sources
          .filter((source) => ["primary", "same_event"].includes(source.role))
          .map((source) => canonicalURL(source.url)),
      )
      for (const candidate of candidates.filter(
        (c) =>
          c.approval?.approved_run &&
          (c.source_urls || []).some((url) => urls.has(canonicalURL(url))),
      )) {
        const run = candidate.approval.approved_run
        if (!approvals.has(run))
          approvals.set(run, loadCurrentApproval(ctx.root, run, { vault: ctx.vault }))
        const approved = approvals.get(run)
        if (
          candidate.event_id !== approved.article.event_id ||
          candidate.approval.article_sha256 !== sha256(JSON.stringify(approved.article))
        )
          throw Error("Known-source candidate differs from its native approval")
        if (!event.prior || event.prior.event_id !== approved.article.event_id)
          throw Error(
            "Already approved source requires an explicit prior-event comparison before writing",
          )
      }
    }
  }
  return withLock(ctx.root, "event-plan-" + run_id, () => {
    const reviewRef = immutable(ctx.root, `event-plans/${run_id}/review.json`, review)
    const plan = {
      schema: "research-edition-event-plan/v1",
      run_id,
      edition: editionRef,
      review: reviewRef,
      input_review_sha256: sha256(bytes),
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
      events,
      unassigned_material_ids: report.materials
        .filter(
          (m) =>
            m.roles.includes("article_candidate") &&
            !events.some((e) => e.sources.some((s) => s.material_id === m.id)),
        )
        .map((m) => m.id),
      candidate_approved: false,
      candidate_published: false,
    }
    return {
      ...immutable(ctx.root, `event-plans/${run_id}/plan.json`, plan),
      status: "relationship_reviewed",
      groups: events.length,
      write_candidates: events.filter((e) => e.writer_allowed).length,
      deferred_or_existing: events.filter((e) => !e.writer_allowed).length,
    }
  })
}

export function checkedPlan(ctx, reference, groupId) {
  const plan = checkedJSON(ctx.root, reference)
  if (
    plan.schema !== "research-edition-event-plan/v1" ||
    reference.path !== `event-plans/${plan.run_id}/plan.json`
  )
    throw Error("Exact reviewed edition event plan required")
  const { edition, report } = checkedEdition(ctx, plan.edition)
  const review = checkedJSON(ctx.root, plan.review)
  if (
    review.reviewer !== plan.reviewer ||
    review.reviewed_at !== plan.reviewed_at ||
    JSON.stringify(review.events) !==
      JSON.stringify(plan.events.map(({ sources, prior, writer_allowed, ...event }) => event))
  )
    throw Error("Event plan differs from its recorded relationship review")
  const selected = groupId ? plan.events.filter((event) => event.group_id === groupId) : plan.events
  if (!selected.length) throw Error("Exact reviewed event group required")
  const original = {
    schema: "research-event-decisions/v1",
    reviewer: plan.reviewer,
    reviewed_at: plan.reviewed_at,
    events: selected.map(({ sources, prior, writer_allowed, ...event }) => event),
  }
  if (JSON.stringify(verifyEvents(ctx, edition, report, original)) !== JSON.stringify(selected))
    throw Error("Event plan no longer matches its original evidence")
  return plan
}

export function eventWorkKey(event) {
  return sha256(
    JSON.stringify([
      event.action,
      event.identity,
      event.prior,
      event.sources
        .map(({ source_run, material_id, ...source }) => source)
        .sort((a, b) => a.parse_id.localeCompare(b.parse_id)),
    ]),
  )
}

export async function prepareEventSelection(ctx, { run_id, plan_path, plan_sha256, group_id }) {
  const planRef = { path: plan_path, sha256: plan_sha256 },
    plan = checkedPlan(ctx, planRef, group_id)
  const event = plan.events.find((e) => e.group_id === group_id)
  if (!event || !["write", "update", "correction"].includes(event.action))
    throw Error("Only a reviewed write or revision event can be selected for a writer")
  const input = { schema: "research-event-selection-input/v1", run_id, plan: planRef, group_id }
  return withLock(ctx.root, "event-selection", async () => {
    const workKey = eventWorkKey(event)
    const globalBindingFile = `event-work/${workKey}/selection.json`
    const bindingFile = `event-plans/${plan.run_id}/selections/${group_id}.json`,
      binding = readJSON(ctx.root, bindingFile) || readJSON(ctx.root, globalBindingFile)
    if (binding) {
      const prior = loadSelectedEvent(ctx, {
        run_id: binding.writer_run,
        selection_path: binding.selection.path,
        selection_sha256: binding.selection.sha256,
      })
      return {
        ...binding.selection,
        status: "selected",
        writer_run: binding.writer_run,
        source_run: prior.source_run,
        sources: prior.sources.length,
        group_id,
        reused: true,
      }
    }
    const folder = `event-selections/${run_id}/`,
      pointer = `runs/${run_id}/event-selection.json`
    const priorInput = readJSON(ctx.root, folder + "input.json")
    if (!priorInput && fs.existsSync(safePath(ctx.root, `runs/${run_id}`)))
      throw Error("Preserve the existing run; choose a new event writer run ID")
    immutable(ctx.root, folder + "input.json", input)
    const origins = [...new Set(event.sources.map((s) => s.source_run))],
      selectionRuns = []
    for (const [index, origin] of origins.entries()) {
      const selected = selectStoredSources(
        ctx.root,
        origin,
        event.sources.filter((s) => s.source_run === origin).map((s) => s.url),
      )
      if (
        selected.documents.length !== event.sources.filter((s) => s.source_run === origin).length ||
        selected.parses.some(
          (p) =>
            !event.sources.some(
              (s) => s.source_version_id === p.source_version_id && s.parse_id === p.parse_id,
            ),
        )
      )
        throw Error(
          "Selected native source scope changed; review the exact image assets or parse first",
        )
      const selectedRun = `sel-${sha256(run_id).slice(0, 24)}-${index}`
      await saveSourceSelection(ctx.root, selectedRun, selected)
      selectionRuns.push(selectedRun)
    }
    const sourceRun =
      selectionRuns.length === 1 ? selectionRuns[0] : `sel-${sha256(run_id).slice(0, 24)}-bundle`
    if (selectionRuns.length > 1)
      await nativeResearch(
        ctx,
        "bundle",
        {
          run_id: sourceRun,
          source_run: selectionRuns[0],
          additional_runs: selectionRuns.slice(1),
        },
        { run_id: "run", source_run: "source-run", additional_runs: "additional-source-run" },
      )
    const stored = loadStoredSourceRun(ctx.root, sourceRun)
    const selection = {
      ...input,
      schema: "research-event-selection/v1",
      source_run: sourceRun,
      source_identity: stored.identity,
      identity: event.identity,
      sources: event.sources,
      existing_event: event.prior,
      action: event.action,
      candidate_approved: false,
      candidate_published: false,
    }
    const result = immutable(ctx.root, folder + "selection.json", selection)
    immutable(ctx.root, pointer, result)
    immutable(ctx.root, bindingFile, { writer_run: run_id, selection: result })
    immutable(ctx.root, globalBindingFile, { writer_run: run_id, selection: result })
    return {
      ...result,
      status: "selected",
      writer_run: run_id,
      source_run: sourceRun,
      sources: stored.documents.length,
      group_id,
      reused: false,
    }
  })
}

export function loadSelectedEvent(
  ctx,
  { run_id, selection_path, selection_sha256 },
  { requireProcessed = false } = {},
) {
  const reference = { path: selection_path, sha256: selection_sha256 },
    selection = checkedJSON(ctx.root, reference)
  if (
    selection.schema !== "research-event-selection/v1" ||
    selection.run_id !== run_id ||
    selection_path !== `event-selections/${run_id}/selection.json` ||
    JSON.stringify(readJSON(ctx.root, `runs/${run_id}/event-selection.json`)) !==
      JSON.stringify(reference)
  )
    throw Error("Writer requires its exact selected event binding")
  const plan = checkedPlan(ctx, selection.plan, selection.group_id),
    event = plan.events.find((e) => e.group_id === selection.group_id)
  if (
    !event ||
    !["write", "update", "correction"].includes(event.action) ||
    (selection.action !== undefined && event.action !== selection.action) ||
    JSON.stringify(event.sources) !== JSON.stringify(selection.sources) ||
    JSON.stringify(event.identity) !== JSON.stringify(selection.identity) ||
    JSON.stringify(event.prior) !== JSON.stringify(selection.existing_event)
  )
    throw Error("Event is not selected from a reviewed write decision")
  const stored = loadStoredSourceRun(ctx.root, selection.source_run)
  if (JSON.stringify(stored.identity) !== JSON.stringify(selection.source_identity))
    throw Error("Selected event sources changed")
  if (requireProcessed) {
    const current = loadStoredSourceRun(ctx.root, run_id)
    if (
      current.identity.documents_sha256 !== stored.identity.documents_sha256 ||
      current.identity.parses_sha256 !== stored.identity.parses_sha256
    )
      throw Error("Writer run differs from its selected event sources")
    const reviewed = readJSON(ctx.root, `runs/${run_id}/reviewed-claims.json`)
    if (!reviewed?.claims?.some((c) => c.review?.status === "verified"))
      throw Error("Selected event requires verified facts")
    for (const claim of reviewed.claims.filter((c) => c.review?.status === "verified"))
      if (
        !claim.evidence?.length ||
        claim.evidence.some(
          (proof) =>
            !selection.sources.some(
              (source) =>
                source.parse_id === proof.parse_id &&
                source.source_version_id === proof.source_version_id &&
                source.block_ids.includes(proof.block_id),
            ),
        )
      )
        throw Error(
          "Verified writer facts are outside the selected event block scope; defer unrelated facts in the explicit review",
        )
  }
  return selection
}

export function reuseEventArticle(ctx, { plan_path, plan_sha256, group_id }) {
  const plan = checkedPlan(ctx, { path: plan_path, sha256: plan_sha256 }, group_id),
    event = plan.events.find((e) => e.group_id === group_id)
  if (event?.action !== "reuse" || !event.prior)
    throw Error("Exact reviewed reuse decision required")
  const approved = loadCurrentApproval(ctx.root, event.prior.run_id, { vault: ctx.vault })
  return {
    status: "approved_reused",
    event_id: approved.article.event_id,
    approved_run: event.prior.run_id,
    article: approved.article,
    writer_called: false,
    candidate_published: false,
  }
}
