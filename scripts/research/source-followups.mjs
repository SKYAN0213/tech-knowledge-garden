import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256, sourceId } from "./contracts.mjs"
import { assertURL } from "./fetch.mjs"
import { selectCandidateSource } from "./editorial-handoff.mjs"
import { mergeBacklog } from "./discovery.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { loadStoredSourceRun, articleContentFingerprint } from "./parser.mjs"
import { readBacklog } from "../research-window.mjs"
import { inquiryFollowupBinding, loadInquiryNativeParent } from "./inquiry-tracking.mjs"

// Links are research leads, never evidence of the linked page's content or
// publication date. Bind only anchors actually inside a retained body block.
export function bodyLinkLeads(document, parse) {
  if (document.source_version_id !== parse.source_version_id)
    throw Error("Follow-up parent source mismatch")
  if (!["extracted", "partial"].includes(parse.status)) return []
  const parent = canonicalURL(document.original_url)
  const targets = new Map()
  for (const link of parse.links || []) {
    if (
      typeof link.url !== "string" ||
      !link.url.trim() ||
      typeof link.text !== "string" ||
      typeof link.dom_path !== "string"
    )
      continue
    let url
    try {
      const parsed = assertURL(new URL(link.url, document.final_url || parent).href)
      if (/^(?:localhost|.*\.localhost|.*\.local)$/i.test(parsed.hostname)) continue
      url = canonicalURL(parsed.href)
    } catch {
      continue
    }
    if (url === parent || url === canonicalURL(document.final_url || parent)) continue
    const anchor = link.text.trim()
    if (!anchor || !link.dom_path) continue
    const blocks = (parse.blocks || []).filter((block) => {
      const dom = block.locator?.dom_path
      return (
        dom &&
        (link.dom_path === dom || link.dom_path.startsWith(dom + "/")) &&
        block.text.includes(anchor)
      )
    })
    // Keep the closest body block when nested list/table blocks overlap.
    blocks.sort((a, b) => b.locator.dom_path.length - a.locator.dom_path.length)
    const block = blocks[0]
    if (!block) continue
    const provenance = {
      source_id: document.source_id,
      source_version_id: document.source_version_id,
      body_sha256: document.body_sha256,
      parse_id: parse.parse_id,
      block_id: block.block_id,
      block_text: block.text,
      block_dom_path: block.locator.dom_path,
      anchor_text: anchor,
      anchor_dom_path: link.dom_path,
      href: link.url,
    }
    const target = targets.get(url) || {
      key: "source-" + sourceId(url),
      url,
      title: anchor.slice(0, 400),
      source_published_at: null,
      confirmed_identity: false,
      provenance: [],
    }
    if (!target.provenance.some((item) => JSON.stringify(item) === JSON.stringify(provenance)))
      target.provenance.push(provenance)
    targets.set(url, target)
  }
  return [...targets.values()]
}

function selectFollowupParent({
  repo,
  root,
  vault,
  handoffFile,
  candidateKey,
  parentSourceRun,
  backlogFile,
  inquiryPlanRef,
  questionId,
  parentMaterialId,
}) {
  if (parentMaterialId) {
    if (!inquiryPlanRef || !questionId || handoffFile || parentSourceRun || candidateKey)
      throw Error(
        "Native inquiry material parent is exclusive of candidate, handoff and source-run parents",
      )
    return loadInquiryNativeParent(
      { repo, root, vault },
      inquiryPlanRef,
      questionId,
      parentMaterialId,
    )
  }
  if (!!handoffFile === !!parentSourceRun)
    throw Error("Choose one follow-up parent: handoff or stored source run")
  if (handoffFile) {
    const bytes = fs.readFileSync(handoffFile)
    return {
      ...selectCandidateSource(root, JSON.parse(bytes), candidateKey),
      handoffHash: sha256(bytes),
    }
  }
  if (!backlogFile) throw Error("Stored follow-up parent requires an explicit backlog")
  const matches = (readBacklog(backlogFile)?.candidates || []).filter(
    (row) => row.key === candidateKey,
  )
  if (matches.length !== 1) throw Error("Stored follow-up parent requires one current candidate")
  const candidate = matches[0]
  const stored = loadStoredSourceRun(root, parentSourceRun, { allowUnacquired: true })
  const documents = stored.documents.filter(
    (row) => row.source_version_id === candidate.article_source_version_id,
  )
  const parses = stored.parses.filter(
    (row) =>
      row.source_version_id === candidate.article_source_version_id &&
      row.parse_id === candidate.article_parse_id,
  )
  if (
    documents.length !== 1 ||
    parses.length !== 1 ||
    !["captured", "not_modified"].includes(documents[0].fetch_status) ||
    !["extracted", "partial"].includes(parses[0].status) ||
    !candidate.article_content_sha256 ||
    articleContentFingerprint(parses[0]) !== candidate.article_content_sha256 ||
    !(candidate.source_urls || []).some(
      (url) => canonicalURL(url) === canonicalURL(documents[0].original_url),
    )
  )
    throw Error("Stored follow-up parent differs from the current candidate source")
  return {
    candidate,
    source_attempt_id: null,
    handoffHash: null,
    selected: { documents, parses, identity: stored.identity },
  }
}

export function planCandidateFollowups(options) {
  const { root, parentSourceRun } = options
  const { candidate, source_attempt_id, selected, handoffHash, native } =
    selectFollowupParent(options)
  const document = selected.documents[0]
  const parse = selected.parses.find(
    (item) => item.source_version_id === document.source_version_id,
  )
  const plan = {
    schema: "research-source-followups/v1",
    candidate_key: candidate.key,
    handoff_sha256: handoffHash,
    ...(parentSourceRun || native
      ? { parent_source_run: parentSourceRun || native.source_run }
      : {}),
    ...(native ? { native_parent: native } : {}),
    source_attempt_id,
    selection_identity: selected.identity,
    parent: {
      url: document.original_url,
      source_version_id: document.source_version_id,
      parse_id: parse.parse_id,
      observed_at: document.observed_at,
    },
    leads: bodyLinkLeads(document, parse),
  }
  const id = sha256(JSON.stringify(plan))
  const relative = `followups/${id}.json`
  const existing = readJSON(root, relative)
  if (existing && JSON.stringify(existing) !== JSON.stringify(plan))
    throw Error("Follow-up plan changed")
  if (!existing) atomicCreate(root, relative, plan)
  return { plan_id: id, path: relative, plan }
}

export function selectFollowupLeads(plan, { targetURLs, limit } = {}) {
  let leads = plan.leads
  if (targetURLs !== undefined) {
    if (!Array.isArray(targetURLs) || !targetURLs.length || targetURLs.length > 8)
      throw Error("Follow-up targets must be one to eight body-link URLs")
    const targets = targetURLs.map((url) => canonicalURL(assertURL(url).href))
    if (
      new Set(targets).size !== targets.length ||
      targets.some((url) => !leads.some((lead) => lead.url === url))
    )
      throw Error("Follow-up targets must uniquely match retained body links")
    leads = leads.filter((lead) => targets.includes(lead.url))
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 8)
      throw Error("Follow-up limit must be 1..8")
    leads = leads.slice(0, limit)
  }
  return leads
}

export async function intakeCandidateFollowups(options) {
  const { backlogFile, targetURLs, limit, inquiryBinding } = options
  // Re-read the native source selector immediately before intake. Tampered
  // raw/parse data cannot register a target merely from a saved proposal.
  const result = planCandidateFollowups(options)
  const { plan } = result
  const candidates = selectFollowupLeads(plan, { targetURLs, limit }).map((lead) => ({
    key: lead.key,
    title: lead.title,
    source_urls: [lead.url],
    source_published_at: null,
    discovered_at: plan.parent.observed_at,
    review_status: "unreviewed",
    priority: "normal",
    discovery: lead.provenance.map((evidence) => ({
      channel_id: "stored-body-followups",
      method: "html-list",
      publisher_id: new URL(plan.parent.url).hostname,
      profile_id: "stored-body-anchor-v1",
      discovered_at: plan.parent.observed_at,
      parent_candidate_key: plan.candidate_key,
      parent_source_attempt_id: plan.source_attempt_id,
      followup_plan_id: result.plan_id,
      source_url: lead.url,
      ...(inquiryBinding
        ? {
            inquiry_plan: inquiryBinding.inquiry_plan,
            question_id: inquiryBinding.question_id,
            question_review: inquiryBinding.review,
            role_is_search_intent: true,
            progress_confirmed: false,
          }
        : {}),
      ...evidence,
    })),
  }))
  await mergeBacklog(backlogFile, candidates)
  return { ...result, intake_count: candidates.length, publication_approved: false }
}

export async function registerCollectedFollowups({
  repo,
  root,
  vault,
  handoffFile,
  candidateKey,
  backlogFile,
  sourceRun,
  parentSourceRun,
  targetURLs,
  limit = 3,
  inquiryBinding,
  inquiryPlanRef,
  questionId,
  parentMaterialId,
}) {
  const result = planCandidateFollowups({
    root,
    handoffFile,
    candidateKey,
    parentSourceRun,
    backlogFile,
    repo,
    vault,
    inquiryPlanRef,
    questionId,
    parentMaterialId,
  })
  const leads = selectFollowupLeads(result.plan, { targetURLs, limit })
  const stored = loadStoredSourceRun(root, sourceRun, { allowUnacquired: true })
  if (
    stored.documents.length !== leads.length ||
    leads.some(
      (lead) =>
        stored.documents.filter((document) => document.original_url === lead.url).length !== 1,
    )
  )
    throw Error("Collected follow-up sources differ from the requested targets")
  const candidates = [],
    sources = []
  for (const lead of leads) {
    const document = stored.documents.find((item) => item.original_url === lead.url)
    const parses = stored.parses.filter(
      (item) => item.source_version_id === document.source_version_id,
    )
    if (parses.length > 1) throw Error("Follow-up source has ambiguous parses")
    const parse = parses[0]
    const captured = ["captured", "not_modified"].includes(document.fetch_status)
    const readable =
      captured &&
      parse?.status === "extracted" &&
      parse.quality?.required_fields_present === true &&
      parse.blocks.length > 0
    sources.push({
      candidate_key: lead.key,
      url: lead.url,
      source_version_id: document.source_version_id || null,
      parse_id: parse?.parse_id || null,
      fetch_status: document.fetch_status,
      parse_status: parse?.status || null,
      block_count: parse?.blocks.length || 0,
      ...(document.availability ? { availability: document.availability } : {}),
      ...(document.error ? { error: document.error } : {}),
      ...(document.request_performed !== undefined
        ? { request_performed: document.request_performed }
        : {}),
      next_route: readable
        ? "fact-review"
        : captured
          ? "source-content-review"
          : "source-access-review",
      publication_approved: false,
    })
    if (readable)
      candidates.push({
        key: lead.key,
        title: parse.title,
        source_urls: [lead.url],
        source_published_at: parse.dates?.published_at || null,
        discovered_at: document.observed_at,
        article_observed_at: document.observed_at,
        article_source_version_id: document.source_version_id,
        article_parse_id: parse.parse_id,
        article_content_sha256: articleContentFingerprint(parse),
        review_status: "unreviewed",
        priority: "normal",
        discovery: [
          {
            channel_id: "stored-body-followups",
            method: "html-list",
            followup_plan_id: result.plan_id,
            parent_candidate_key: result.plan.candidate_key,
            captured_source_run: sourceRun,
            source_url: lead.url,
            discovered_at: document.observed_at,
            ...(inquiryBinding
              ? {
                  inquiry_plan: inquiryBinding.inquiry_plan,
                  question_id: inquiryBinding.question_id,
                  question_review: inquiryBinding.review,
                  role_is_search_intent: true,
                  progress_confirmed: false,
                }
              : {}),
          },
        ],
      })
  }
  const receipt = {
    schema: "research-collected-followups/v1",
    plan_id: result.plan_id,
    source_run: sourceRun,
    collection_identity: stored.identity,
    sources,
    readable_sources: candidates.length,
    publication_approved: false,
    ...(inquiryBinding ? { inquiry: inquiryBinding } : {}),
  }
  const relative = `followups/${result.plan_id}/${sourceRun}.json`
  const existing = readJSON(root, relative)
  if (existing && JSON.stringify(existing) !== JSON.stringify(receipt))
    throw Error("Collected follow-up receipt changed")
  await mergeBacklog(backlogFile, candidates)
  if (!existing) atomicCreate(root, relative, receipt)
  return { path: relative, receipt }
}

// Stage inputs are fixed before any intake or request. Larger stored source
// batches are selected by the native command instead of copying raw/parse data
// into a second collection contract. An incomplete request is never retried by
// reopening this operation under the same input.
export async function executeCandidateFollowups({
  repo,
  root,
  runId,
  mode,
  handoffFile,
  candidateKey,
  parentSourceRun,
  backlogFile,
  sourceRun,
  targetURLs,
  limit = 3,
  runNative,
  vault,
  inquiryPlanPath,
  inquiryPlanSha256,
  questionId,
  parentMaterialId,
}) {
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(runId || "") ||
    !["plan-only", "reuse", "collect"].includes(mode) ||
    (mode === "reuse" && !sourceRun) ||
    (mode === "collect" && sourceRun) ||
    (sourceRun && sourceRun === runId) ||
    Boolean(inquiryPlanPath) !== Boolean(inquiryPlanSha256) ||
    Boolean(inquiryPlanPath) !== Boolean(questionId) ||
    (parentMaterialId && (!inquiryPlanPath || candidateKey || handoffFile || parentSourceRun)) ||
    (!parentMaterialId && !candidateKey)
  )
    throw Error(
      "Follow-up operation requires a safe run and a distinct stored source run for reuse",
    )
  return withLock(root, `followups-${runId}`, async () => {
    const options = {
      repo,
      root,
      vault,
      handoffFile,
      candidateKey,
      parentSourceRun,
      backlogFile,
      targetURLs,
      limit,
      ...(parentMaterialId
        ? {
            parentMaterialId,
            inquiryPlanRef: { path: inquiryPlanPath, sha256: inquiryPlanSha256 },
            questionId,
          }
        : {}),
    }
    const planned = planCandidateFollowups(options)
    const leads = selectFollowupLeads(planned.plan, { targetURLs, limit })
    const inquiryBinding = inquiryPlanPath
      ? inquiryFollowupBinding(
          { repo, root, vault },
          { path: inquiryPlanPath, sha256: inquiryPlanSha256 },
          questionId,
          planned.plan.parent,
          leads,
        )
      : null
    if (inquiryBinding) options.inquiryBinding = inquiryBinding
    const ref = (relative) => ({
      path: relative,
      sha256: sha256(fs.readFileSync(safePath(root, relative))),
    })
    const inputPath = `runs/${runId}/followup-input.json`,
      resultPath = `runs/${runId}/followup-result.json`
    const previousInput = readJSON(root, inputPath)
    const input = {
      schema: "research-followup-execution-input/v1",
      run_id: runId,
      plan_id: planned.plan_id,
      plan: ref(planned.path),
      targets: leads.map((lead) => lead.url),
      limit,
      acquisition: sourceRun ? "stored-source-selection" : "native-policy-collection",
      source_run: sourceRun || null,
      stored_source_identity: sourceRun
        ? loadStoredSourceRun(root, sourceRun, { allowUnacquired: true }).identity
        : null,
      implementation_sha256:
        previousInput?.implementation_sha256 || sha256(fs.readFileSync(new URL(import.meta.url))),
      acquisition_sha256: sha256(fs.readFileSync(safePath(repo, "data/research-acquisition.json"))),
      publication_approved: false,
      ...(inquiryBinding ? { inquiry: inquiryBinding } : {}),
    }
    if (previousInput && JSON.stringify(previousInput) !== JSON.stringify(input))
      throw Error("Follow-up execution inputs changed; use a new run ID")
    if (!previousInput) atomicCreate(root, inputPath, input)
    const inputRef = ref(inputPath)
    if (mode === "plan-only" || !leads.length)
      return {
        run_id: runId,
        status: leads.length ? "planned" : "no_body_link",
        input: inputRef,
        selected_leads: leads,
        deferred_leads: planned.plan.leads.length - leads.length,
        publication_approved: false,
        ...(inquiryBinding ? { inquiry: inquiryBinding } : {}),
        ...(planned.plan.native_parent ? { native_parent: planned.plan.native_parent } : {}),
      }
    const previous = readJSON(root, resultPath)
    if (!readJSON(root, `runs/${runId}/documents.json`)) {
      const state = readJSON(root, `runs/${runId}/state.json`)
      if (state)
        return {
          run_id: runId,
          status: "interrupted",
          input: inputRef,
          state: ref(`runs/${runId}/state.json`),
          resume_condition:
            "Preserve the existing request observation. Supply a complete stored source run, or new policy-permitted evidence and a new run ID; do not repeat the same failed request.",
          publication_approved: false,
        }
      if (previous) throw Error("Follow-up source output disappeared")
      if (typeof runNative !== "function") throw Error("Native follow-up executor required")
      await intakeCandidateFollowups(options)
      await runNative(sourceRun ? "select-source" : "collect", {
        run_id: runId,
        ...(sourceRun ? { source_run: sourceRun } : {}),
        urls: input.targets,
      })
    }
    const collected = await registerCollectedFollowups({ ...options, sourceRun: runId })
    const receipt = {
      schema: "research-followup-execution-result/v1",
      run_id: runId,
      input: inputRef,
      followup_receipt: ref(collected.path),
      documents: ref(`runs/${runId}/documents.json`),
      parses: ref(`runs/${runId}/parses.json`),
      selected_lead_count: leads.length,
      readable_source_count: collected.receipt.readable_sources,
      status: collected.receipt.sources.every((row) => row.next_route === "fact-review")
        ? "source-ready-for-review"
        : "partial",
      sources: collected.receipt.sources,
      publication_approved: false,
      ...(inquiryBinding ? { inquiry: inquiryBinding } : {}),
      ...(planned.plan.native_parent ? { native_parent: planned.plan.native_parent } : {}),
    }
    if (previous && JSON.stringify(previous) !== JSON.stringify(receipt))
      throw Error("Follow-up execution receipt changed")
    if (!previous) atomicCreate(root, resultPath, receipt)
    return { ...receipt, result: ref(resultPath), reused: !!previous }
  })
}

function assertDetailReview(plan, review) {
  if (
    review?.schema !== "research-source-detail-review-input/v1" ||
    review.source_read !== true ||
    !review.reviewer?.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewed_at || "") ||
    review.candidate_key !== plan.candidate_key ||
    review.source_version_id !== plan.parent.source_version_id ||
    review.parse_id !== plan.parent.parse_id ||
    !Array.isArray(review.required_details) ||
    !review.required_details.length ||
    new Set(review.required_details.map((row) => row.candidate_key)).size !==
      review.required_details.length
  )
    throw Error("Exact source-read review and unique required detail targets are required")
  for (const row of review.required_details) {
    const lead = plan.leads.find((item) => item.key === row.candidate_key)
    if (
      !lead ||
      typeof row.reason !== "string" ||
      !row.reason.trim() ||
      !lead.provenance.some(
        (item) => item.block_id === row.block_id && item.block_text === row.quote,
      )
    )
      throw Error("Required detail must match an exact parent body-link quote")
  }
}

// Only an explicit source-reading decision can defer a complete short source.
// Merely having links, little text or a subscription banner cannot do so.
export function recordSourceDetailReview(options) {
  const { root, review } = options
  const result = planCandidateFollowups(options)
  assertDetailReview(result.plan, review)
  const receipt = { schema: "research-source-detail-review/v1", plan_id: result.plan_id, review }
  const relative = `followups/${result.plan_id}/reviews/${sha256(JSON.stringify(receipt))}.json`
  const existing = readJSON(root, relative)
  if (existing && JSON.stringify(existing) !== JSON.stringify(receipt))
    throw Error("Source detail review changed")
  if (!existing) atomicCreate(root, relative, receipt)
  return { path: relative, sha256: sha256(fs.readFileSync(safePath(root, relative))) }
}

export function loadSourceDetailReview(options) {
  const { root, reviewPath } = options
  const receipt = readJSON(root, reviewPath)
  const result = planCandidateFollowups(options)
  if (
    receipt?.schema !== "research-source-detail-review/v1" ||
    receipt.plan_id !== result.plan_id ||
    reviewPath !== `followups/${result.plan_id}/reviews/${sha256(JSON.stringify(receipt))}.json`
  )
    throw Error("Native source detail review identity changed")
  assertDetailReview(result.plan, receipt.review)
  return {
    receipt: reviewPath,
    sha256: sha256(fs.readFileSync(safePath(root, reviewPath))),
    source_version_id: result.plan.parent.source_version_id,
    parse_id: result.plan.parent.parse_id,
    required_candidate_keys: receipt.review.required_details.map((row) => row.candidate_key),
    next_route: "followup-source-review",
    model_calls: 0,
    publication_approved: false,
  }
}

// Discover only reviews already bound to this exact frozen handoff and key.
// The native loader still rechecks the source, anchors, quotes and receipt hash.
export function findStoredSourceDetailReviewFiles({ root, handoffFile, candidateKeys }) {
  const directory = safePath(root, "followups")
  if (!fs.existsSync(directory)) return {}
  const handoffHash = sha256(fs.readFileSync(handoffFile))
  const selected = new Set(candidateKeys)
  const found = {}
  for (const name of fs.readdirSync(directory).sort()) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
    const plan = readJSON(root, `followups/${name}`)
    if (
      plan?.schema !== "research-source-followups/v1" ||
      plan.handoff_sha256 !== handoffHash ||
      !selected.has(plan.candidate_key)
    )
      continue
    const reviewsDirectory = `followups/${name.slice(0, -5)}/reviews`
    if (!fs.existsSync(safePath(root, reviewsDirectory))) continue
    for (const file of fs.readdirSync(safePath(root, reviewsDirectory)).sort()) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
      const reviewPath = `${reviewsDirectory}/${file}`
      loadSourceDetailReview({ root, handoffFile, candidateKey: plan.candidate_key, reviewPath })
      if (found[plan.candidate_key] && found[plan.candidate_key] !== reviewPath)
        throw Error("Multiple source detail reviews require an explicit selection")
      found[plan.candidate_key] = reviewPath
    }
  }
  return found
}
