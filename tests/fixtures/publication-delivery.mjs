// Test-only native source and approval fixtures; never used as operational receipts.
import fs from "node:fs"
import path from "node:path"
import { selectedFixture } from "./research-event-fixtures.mjs"
import { executeModule } from "../../scripts/research/module-registry.mjs"
import { extractSelectedEventEvidence } from "../../scripts/research/event-inference.mjs"
import { advanceEventWorkflow } from "../../scripts/research/event-workflow.mjs"
import { approveSelectedEvent } from "../../scripts/research/event-publication.mjs"
import { draftFingerprint } from "../../scripts/research/editor.mjs"
import { sha256 } from "../../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, safePath } from "../../scripts/research/run-state.mjs"
import {
  compareAuthoringRemote,
  DRIVE_AUTHORING_ROOTS,
} from "../../scripts/research/authoring-transfer.mjs"
import { prepareEventPublicationHandoff } from "../../scripts/research/daily-publication-handoff.mjs"
const repoFile = (f, name, value) => {
  atomicWrite(f.root, name, value)
  return path.relative(f.ctx.repo, safePath(f.root, name))
}
function provider() {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    async metadata(model) {
      return {
        model,
        digest: sha256("test-installed-model"),
        runtime: "test-runtime",
        capabilities: ["completion"],
        thinking: { values: [false, "medium"] },
      }
    },
    async structured(request) {
      calls++
      const docs = JSON.parse(request.messages[1].content)
      return {
        output: {
          claims: docs.flatMap((d) =>
            d.blocks.map((b) => ({
              statement:
                "Fixture Robotics와 Partner가 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
              claim_kind: "fact",
              subject: "Fixture Robotics",
              event_state: "completed",
              published_at: "2026-09-27",
              effective_period: null,
              numbers: [],
              evidence: [{ block_key: b.block_key, support: "direct" }],
            })),
          ),
        },
        provenance: {
          model: request.model,
          think: request.think,
          digest: sha256("test-installed-model"),
          prompt_sha256: sha256(JSON.stringify(request.messages)),
        },
      }
    },
  }
}
async function approve(f, run, selected = f.selectedParameters, revisionFile) {
  await extractSelectedEventEvidence(f.ctx, selected, { baseProvider: f.provider })
  const claims = readJSON(f.root, `runs/${run}/claims.json`).claims
  const review_file = repoFile(f, `facts-${run}.json`, {
    reviewer: "test-original-reader",
    reviewed_at: "2026-09-29T01:00:00Z",
    claims: claims.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Compared with the exact test original",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
  })
  await executeModule(f.ctx, "evidence", "review", { run_id: run, review_file })
  const ids = claims.map((c) => c.claim_id)
  const draft = {
    title: "Fixture Robotics, Partner와 로봇 주문 발표",
    lead: [
      {
        text: "Fixture Robotics와 Partner는 2026년 9월 27일 Contract-123 로봇 주문을 발표했다.",
        claim_ids: ids,
      },
      {
        text: "이번 발표는 해당 계약을 대상으로 하며 각 원문에 같은 주문이 명시돼 있다.",
        claim_ids: ids,
      },
    ],
    facts: {
      who: "Fixture Robotics와 Partner",
      when: "2026-09-27",
      where: null,
      what: "로봇 주문 발표",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "사업·고객",
    tags: ["수주·계약"],
    entities: ["Fixture Robotics", "Partner"],
    explanations: [
      {
        heading: run === "writer" ? "계약 대상" : "대조한 계약 내용",
        paragraphs: [
          {
            text: "각 원문은 Contract-123 주문의 주체와 발표 시점을 명시한다. 다른 고객의 별도 일정은 이번 계약의 완료 내용으로 포함하지 않았다.",
            claim_ids: ids,
          },
        ],
      },
    ],
  }
  const record = {
    draft_id: draftFingerprint(draft),
    draft,
    status: "editorial_review",
    problems: [],
    public_approved: false,
  }
  atomicWrite(f.root, `runs/${run}/draft.json`, record)
  const editorial = repoFile(f, `editorial-${run}.json`, {
    status: "approved",
    draft_id: record.draft_id,
    event_id: "abcdef0123456789",
    published_at: "2026-09-27",
    reviewed_at: "2026-09-29",
    region: "해외",
    reviewer: "test-final-reader",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    concept_ids: [],
    reader_quality_review: { repetition_checked: true },
  })
  if (revisionFile) revisionFile = revisionFile(record, claims)
  await approveSelectedEvent(f.ctx, {
    run_id: run,
    review_file: editorial,
    ...(revisionFile ? { revision_file: revisionFile } : {}),
  })
}
async function advance(f, workflow = "workflow", plan = f.plan, execute = true) {
  return advanceEventWorkflow(f.ctx, {
    run_id: workflow,
    edition_path: f.editionRef.path,
    edition_sha256: f.editionRef.sha256,
    plan_path: plan.path,
    plan_sha256: plan.sha256,
    execute,
  })
}
async function ready(t) {
  const f = await selectedFixture(t)
  f.provider = provider()
  await approve(f, "writer")
  f.workflow = await advance(f)
  return f
}

export async function deliveryFixture(t) {
  const f = await ready(t)
  const workflow = "event-workflows/workflow/latest.json"
  const handoff = await prepareEventPublicationHandoff(f.ctx, {
    run_id: "handoff",
    workflow_path: workflow,
    workflow_sha256: sha256(fs.readFileSync(safePath(f.root, workflow))),
  })
  f.put = (name, value) => {
    atomicWrite(f.root, name, value)
    return name
  }
  f.ref = (name) => ({ path: name, sha256: sha256(fs.readFileSync(safePath(f.root, name))) })
  f.request = {
    run_id: "delivery",
    handoff_path: handoff.publication_handoff.path,
    handoff_sha256: handoff.publication_handoff.sha256,
  }
  const previewRun = "reader",
    relative = "Knowledge/fixture.md",
    desired = "Approved test content\n"
  const manifest = {
    schema: "private-reader-preview/v1",
    run_id: previewRun,
    approved_runs: ["writer"],
    knowledge_runs: [],
    daily_editorial_handoff: handoff.publication_handoff,
    editions: [],
    knowledge: [{ path: relative, sha256: sha256(desired) }],
    consistency: { articles: [{ event_id: "abcdef0123456789" }] },
  }
  f.put(`runs/${previewRun}/preview-manifest.json`, manifest)
  const base = `runs/${previewRun}/drive-authoring`
  const plan = {
    schema: "research-authoring-transfer/v1",
    preview_run: previewRun,
    preview_sha256: f.ref(`runs/${previewRun}/preview-manifest.json`).sha256,
    destination_folder_id: "root",
    roots: DRIVE_AUTHORING_ROOTS,
    files: [
      {
        path: relative,
        operation: "update",
        previous_sha256: sha256("old"),
        sha256: sha256(desired),
        bytes: Buffer.byteLength(desired),
        staged_path: `${base}/files/${relative}`,
      },
    ],
  }
  f.put(base + "/transfer-plan.json", plan)
  f.put(plan.files[0].staged_path, desired)
  const now = Date.now()
  const observation = {
    schema: "research-authoring-remote-observation/v1",
    root_folder_id: "root",
    observed_at: new Date(now).toISOString(),
    folders: [],
    listings: [
      {
        path: "Knowledge",
        id: DRIVE_AUTHORING_ROOTS.Knowledge,
        complete: true,
        files: [
          {
            name: "fixture.md",
            id: "existing",
            parent_id: DRIVE_AUTHORING_ROOTS.Knowledge,
            modified_at: new Date(now - 3600000).toISOString(),
            sha256: sha256("old"),
          },
        ],
      },
    ],
  }
  const hashes = {
    plan: f.ref(base + "/transfer-plan.json").sha256,
    manifest: plan.preview_sha256,
    review: sha256("test-review"),
    snapshot: sha256("test-snapshot"),
    observation: sha256("test-observation"),
  }
  const release = {
    schema: "research-authoring-release/v1",
    preview_run: previewRun,
    input_sha256: hashes,
    operations: compareAuthoringRemote(plan, observation, { now }).operations,
    reviewed_event_ids: ["abcdef0123456789"],
    release_approved: true,
    upload_allowed: true,
  }
  f.releasePath = f.put(base + "/releases/" + sha256(JSON.stringify(hashes)) + ".json", release)
  f.deliver = {
    run_id: "delivery",
    execution_id: "attempt",
    stage: "authoring",
    release_path: f.releasePath,
    release_sha256: f.ref(f.releasePath).sha256,
    wait_ms: 5000,
  }
  f.capture = (name, applied = false, content = applied ? desired : "old") => {
    const modified = applied
      ? new Date().toISOString()
      : observation.listings[0].files[0].modified_at
    const metadata = {
      id: "existing",
      title: "fixture.md",
      parent_ids: [DRIVE_AUTHORING_ROOTS.Knowledge],
      modified_time: modified,
      mime_type: "text/markdown",
      shared: false,
      size: String(Buffer.byteLength(content)),
    }
    const file = f.put(name, {
      schema: "research-authoring-drive-acquisition/v1",
      observed_at: new Date().toISOString(),
      folders: [],
      listings: [
        {
          path: "Knowledge",
          id: DRIVE_AUTHORING_ROOTS.Knowledge,
          limit: 100,
          before: [metadata],
          after: [metadata],
        },
      ],
      files: [
        {
          path: relative,
          metadata,
          raw: {
            id: metadata.id,
            mime_type: metadata.mime_type,
            modified_time: modified,
            parent_ids: metadata.parent_ids,
            file_size_bytes: Buffer.byteLength(content),
            b64_string: Buffer.from(content).toString("base64"),
          },
        },
      ],
    })
    const ref = f.ref(file)
    return { acquisition_path: ref.path, acquisition_sha256: ref.sha256 }
  }
  f.deliver = { ...f.deliver, ...f.capture("captures/before.json") }
  return f
}
