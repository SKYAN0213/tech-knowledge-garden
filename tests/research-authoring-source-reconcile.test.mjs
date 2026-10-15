import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { DRIVE_AUTHORING_ROOTS } from "../scripts/research/authoring-transfer.mjs"
import { captureAuthoringSourceSnapshot } from "../scripts/research/authoring-source-snapshot.mjs"
import {
  prepareAuthoringSourceReconciliation,
  loadAuthoringSourceReconciliation,
} from "../scripts/research/authoring-source-reconcile.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
} from "../scripts/research/ontology.mjs"
import {
  approvedArticle,
  editionProjection,
  existingArticleProjection,
} from "../scripts/research/publish-adapter.mjs"
import { parseNote, noteText, extractArticles } from "../scripts/garden.mjs"
import { legacyTransitionUnits } from "../scripts/research/legacy-transition.mjs"

const repository = process.cwd(),
  rootId = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
const reference = (root, p) => ({ path: p, sha256: sha256(fs.readFileSync(path.join(root, p))) })
async function fixture(t, { reviewedRemoteEdition = false } = {}) {
  const f = await knowledgeFixture(t),
    now = Date.now() - 700001,
    observed_at = new Date(now).toISOString()
  const approved = loadApprovedOntologyInput(f.root, "source", { vault: f.vault })
  const edition = editionProjection([approved.article], {
    key: "2026-09-25_0800_Tech_AI_Briefing",
    date: "2026-09-25",
    coverage_start: "2026-09-24T08:00:00+09:00",
    coverage_end: "2026-09-25T08:00:00+09:00",
  })
  const previousTitle = "이전 표시 제목"
  const reviewedBefore = editionProjection(
    [
      {
        ...approved.article,
        title: previousTitle,
        record: { ...approved.article.record, title: previousTitle },
        article_review: { ...approved.article.article_review, title: previousTitle },
      },
    ],
    {
      key: "2026-09-25_0800_Tech_AI_Briefing",
      date: "2026-09-25",
      coverage_start: "2026-09-24T08:00:00+09:00",
      coverage_end: "2026-09-25T08:00:00+09:00",
    },
  )
  atomicWrite(f.vault, edition.path, edition.content)
  atomicWrite(f.vault, "Signals/unchanged.md", "# Remote unchanged\n")
  atomicWrite(f.vault, "TrendTopics/unchanged.md", "# Remote unchanged\n")
  atomicWrite(
    f.vault,
    "Knowledge/source-only.md",
    "---\nreview_status: verified\n---\n# Only a canonical claim\n",
  )
  const folders = Object.entries(DRIVE_AUTHORING_ROOTS).map(([name, id]) => ({
    path: name,
    metadata: {
      id,
      title: name,
      mime_type: "application/vnd.google-apps.folder",
      shared: false,
      parent_ids: [rootId],
      modified_time: observed_at,
    },
  }))
  const oldNotes = JSON.parse(
    fs.readFileSync(path.join(f.root, "runs/notes/approved-notes.json")),
  ).notes
  const contents = [
    ...oldNotes.map((n) => ({ path: n.path, content: n.before_content })),
    {
      path: edition.path,
      content: reviewedRemoteEdition ? reviewedBefore.content : "# Earlier edition bytes\n",
    },
    { path: "Signals/unchanged.md", content: "# Remote unchanged\n" },
    { path: "TrendTopics/unchanged.md", content: "# Remote unchanged\n" },
  ]
  // The source fixture has nested Editions directories, observed individually.
  for (const relative of ["Editions/2026", "Editions/2026/09"]) {
    const parent = folders.find((f) => f.path === path.posix.dirname(relative)).metadata.id
    folders.push({
      path: relative,
      metadata: {
        id: "folder-" + relative.replaceAll("/", "-"),
        title: path.posix.basename(relative),
        mime_type: "application/vnd.google-apps.folder",
        parent_ids: [parent],
        shared: false,
        modified_time: observed_at,
      },
    })
  }
  const files = contents.map((file, i) => {
    const bytes = Buffer.from(file.content),
      metadata = {
        id: "file-" + i,
        title: path.posix.basename(file.path),
        mime_type: "text/markdown",
        size: String(bytes.length),
        modified_time: observed_at,
        parent_ids: [folders.find((f) => f.path === path.posix.dirname(file.path)).metadata.id],
        shared: false,
      }
    return {
      path: file.path,
      metadata,
      raw: { ...metadata, b64_string: bytes.toString("base64"), file_size_bytes: bytes.length },
    }
  })
  const acquisition = {
    schema: "research-authoring-drive-acquisition/v1",
    observed_at,
    root_metadata: {
      id: rootId,
      mime_type: "application/vnd.google-apps.folder",
      shared: false,
      parent_ids: ["1psoNS5hryuS9YGJg7JTK4AhG6X6B2LZE"],
    },
    folders,
    files,
    listings: folders.map((folder) => {
      const rows = [
        ...files
          .filter((file) => path.posix.dirname(file.path) === folder.path)
          .map((file) => file.metadata),
        ...folders
          .filter((child) => path.posix.dirname(child.path) === folder.path)
          .map((child) => child.metadata),
      ]
      return { path: folder.path, id: folder.metadata.id, limit: 500, before: rows, after: rows }
    }),
  }
  atomicWrite(f.root, "acquisition.json", acquisition)
  const capture = captureAuthoringSourceSnapshot({
    root: f.root,
    runId: "source",
    acquisitionFile: path.join(f.root, "acquisition.json"),
    repository,
    vault: f.vault,
    now,
  })
  const input = { schema: "research-knowledge-linking-input/v1", workflow_id: "fixture" }
  atomicWrite(f.root, "knowledge-input.json", input)
  atomicWrite(f.root, "checkpoint.json", {
    schema: "research-knowledge-linking/v1",
    workflow_id: "fixture",
    input_sha256: sha256(JSON.stringify(input)),
    input: reference(f.root, "knowledge-input.json"),
    ontology: reference(f.root, "graph.json"),
    tasks: oldNotes.map((note) => ({
      path: note.path,
      kind: "definition",
      status: "ready",
      note_sha256: note.sha256,
      approval_run: "notes",
      approval: reference(f.root, "runs/notes/approved-notes.json"),
    })),
  })
  const preview = "existing-preview",
    candidate = oldNotes[0],
    stage = "runs/" + preview + "/drive-authoring/files/" + candidate.path
  atomicWrite(f.root, stage, candidate.content)
  atomicWrite(f.root, "runs/" + preview + "/preview-manifest.json", {
    run_id: preview,
    workspace: "runs/" + preview + "/preview-workspace",
    observed_at,
    approved_runs: ["source"],
    knowledge_runs: ["notes"],
    editions: [],
    knowledge: [{ path: candidate.path, sha256: candidate.sha256 }],
    candidate_published: false,
  })
  atomicWrite(f.root, "runs/" + preview + "/drive-authoring/transfer-plan.json", {
    schema: "research-authoring-transfer/v1",
    preview_run: preview,
    preview_sha256: reference(f.root, "runs/" + preview + "/preview-manifest.json").sha256,
    files: [{ path: candidate.path, sha256: candidate.sha256, staged_path: stage }],
    release_approved: false,
    upload_allowed: false,
    candidate_published: false,
  })
  const reconciliation = {
    schema: "research-authoring-source-reconciliation-input/v1",
    run_id: "reconcile",
    source_capture: { run_id: "source", sha256: capture.capture.sha256 },
    knowledge_checkpoint: reference(f.root, "checkpoint.json"),
    preview_manifest: reference(f.root, "runs/" + preview + "/preview-manifest.json"),
  }
  atomicWrite(f.root, "reconcile-input.json", reconciliation)
  return { ...f, edition, reconciliation, stage }
}

test("source reconciliation CLI privately stages exact native notes while isolating edition and source-only reviews and reusing stale preview pins", async (t) => {
  const f = await fixture(t),
    planPath = "runs/existing-preview/drive-authoring/transfer-plan.json"
  const planBefore = fs.readFileSync(path.join(f.root, planPath)),
    previewBefore = fs.readFileSync(
      path.join(f.root, "runs/existing-preview/preview-manifest.json"),
    ),
    candidateBefore = fs.readFileSync(path.join(f.root, f.stage))
  const executed = spawnSync(
    process.execPath,
    [
      "scripts/research-authoring.mjs",
      "reconcile-source",
      "--root",
      f.root,
      "--vault",
      f.vault,
      "--reconcile-input",
      "reconcile-input.json",
    ],
    { cwd: repository, encoding: "utf8" },
  )
  assert.equal(executed.status, 0, executed.stderr)
  const result = JSON.parse(executed.stdout)
  assert.deepEqual(result.counts, { different_files: 4, prepared_private: 2, review_required: 2 })
  assert.equal(result.source_capture.freshness, "stale")
  assert.ok(result.external_requirements.includes("fresh_complete_drive_readback_required"))
  for (const row of result.files.filter((r) => r.status === "prepared_private"))
    assert.equal(sha256(fs.readFileSync(path.join(f.root, row.staged_path))), row.local_sha256)
  const edition = result.files.find((row) => row.path === f.edition.path)
  assert.equal(edition.native_support.length, 1)
  assert.deepEqual(edition.missing_evidence, ["exact_edition_container_review_required"])
  assert.deepEqual(
    result.files.find((row) => row.path === "Knowledge/source-only.md").missing_evidence,
    ["exact_native_note_approval_required"],
  )
  assert.equal(result.upload_allowed, false)
  assert.equal(result.approval_granted, false)
  assert.equal(result.remote_write_performed, false)
  assert.equal(result.private_preview.renderer_reexecuted, false)
  assert.ok(fs.readFileSync(path.join(f.root, planPath)).equals(planBefore))
  assert.ok(
    fs
      .readFileSync(path.join(f.root, "runs/existing-preview/preview-manifest.json"))
      .equals(previewBefore),
  )
  assert.ok(fs.readFileSync(path.join(f.root, f.stage)).equals(candidateBefore))
  assert.equal(
    fs.existsSync(path.join(f.root, "drive-reconcile/reconcile/files/Knowledge/source-only.md")),
    false,
  )
})

test("changed common approval or private preview bytes fail before any reconciliation staging", async (t) => {
  const f = await fixture(t)
  fs.appendFileSync(path.join(f.root, f.stage), "unreviewed")
  assert.throws(
    () =>
      prepareAuthoringSourceReconciliation({
        root: f.root,
        inputFile: "reconcile-input.json",
        repository,
        vault: f.vault,
      }),
    /preview authoring bytes changed/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "drive-reconcile")), false)
  fs.writeFileSync(path.join(f.root, f.stage), f.notes[0].content)
  fs.appendFileSync(path.join(f.root, "checkpoint.json"), " ")
  assert.throws(
    () =>
      prepareAuthoringSourceReconciliation({
        root: f.root,
        inputFile: "reconcile-input.json",
        repository,
        vault: f.vault,
      }),
    /Pinned reconciliation bytes changed/,
  )
  assert.equal(fs.existsSync(path.join(f.root, "drive-reconcile")), false)
})

test("an exact full native retrospective prepares its edition, reuses prior private stages and isolates unreviewed coverage changes", async (t) => {
  const f = await fixture(t, { reviewedRemoteEdition: true }),
    prepare = () =>
      prepareAuthoringSourceReconciliation({
        root: f.root,
        inputFile: "reconcile-input.json",
        repository,
        vault: f.vault,
      })
  const result = prepare(),
    edition = result.files.find((row) => row.path === f.edition.path)
  assert.deepEqual(result.counts, { different_files: 4, prepared_private: 3, review_required: 1 })
  assert.equal(edition.file_projection.kind, "native_retrospective")
  assert.equal(edition.file_projection.projected_sha256, edition.local_sha256)
  assert.deepEqual(edition.missing_evidence, [])
  assert.equal(
    sha256(fs.readFileSync(path.join(f.root, edition.staged_path))),
    edition.local_sha256,
  )
  const input = {
    ...f.reconciliation,
    run_id: "reconcile-v2",
    prior_reconciliation: result.reconciliation,
  }
  atomicWrite(f.root, "reconcile-input.json", input)
  const reused = prepare()
  assert.deepEqual(reused.private_staging, { new_files: 0, reused_files: 3 })
  assert.equal(
    reused.files.find((row) => row.path === f.edition.path).staged_path,
    edition.staged_path,
  )
  const original = fs.readFileSync(path.join(f.vault, f.edition.path), "utf8")
  fs.writeFileSync(
    path.join(f.vault, f.edition.path),
    original.replace("2026-09-25T08:00:00+09:00", "2026-09-26T08:00:00+09:00"),
  )
  atomicWrite(f.root, "reconcile-input.json", {
    ...input,
    run_id: "reconcile-v3",
    prior_reconciliation: reused.reconciliation,
  })
  const changed = prepare(),
    blocked = changed.files.find((row) => row.path === f.edition.path)
  assert.equal(blocked.status, "review_required")
  assert.match(blocked.file_projection_error, /Full approved source projection differs/)
  assert.deepEqual(changed.private_staging, { new_files: 0, reused_files: 2 })
  assert.equal(changed.release_approved, false)
  assert.equal(changed.upload_allowed, false)
})

test("saved reconciliation status validates exact evidence and private bytes without staging and pages remaining reviews with current expiry and drift", async (t) => {
  const f = await fixture(t, { reviewedRemoteEdition: true })
  const prepared = prepareAuthoringSourceReconciliation({
    root: f.root,
    inputFile: "reconcile-input.json",
    repository,
    vault: f.vault,
  })
  const pinned = [
    prepared.reconciliation.path,
    "reconcile-input.json",
    f.stage,
    ...prepared.files
      .filter((row) => row.status === "prepared_private")
      .map((row) => row.staged_path),
  ]
  const before = pinned.map((p) => [p, fs.readFileSync(path.join(f.root, p))])
  const read = (options = {}) =>
    loadAuthoringSourceReconciliation(f.root, "reconcile", {
      repository,
      vault: f.vault,
      ...options,
    })
  const status = read({ limit: 1 })
  assert.deepEqual(status.counts, { different_files: 4, prepared_private: 3, review_required: 1 })
  assert.equal(status.source_capture.freshness, "stale")
  assert.equal(
    status.source_capture.expires_at,
    new Date(Date.parse(status.source_capture.observed_at) + 600000).toISOString(),
  )
  assert.deepEqual(status.current_local_drift, {
    changed_files: 0,
    absent_files: 0,
    current_bytes_match: true,
  })
  assert.equal(status.review_required_files[0].path, "Knowledge/source-only.md")
  assert.equal(status.page.next_offset, null)
  assert.equal(read({ offset: 1 }).review_required_files.length, 0)
  assert.equal(status.read_only, true)
  assert.equal(status.approvals_created, false)
  assert.equal(status.staging_reexecuted, false)
  assert.equal(status.renderer_reexecuted, false)
  assert.equal(status.remote_write_performed, false)
  assert.equal("files" in status, false)
  assert.equal("nodes" in status, false)
  for (const [p, bytes] of before) assert.ok(fs.readFileSync(path.join(f.root, p)).equals(bytes))
  assert.throws(() => read({ limit: 101 }), /Bounded reconciliation page/)
  const staged = prepared.files.find((row) => row.path === f.edition.path).staged_path,
    stageBytes = fs.readFileSync(path.join(f.root, staged))
  fs.appendFileSync(path.join(f.root, staged), "unapproved")
  assert.throws(() => read(), /Prepared reconciliation bytes changed/)
  fs.writeFileSync(path.join(f.root, staged), stageBytes)
  const approval = "runs/notes/approved-notes.json",
    approvalBytes = fs.readFileSync(path.join(f.root, approval))
  fs.appendFileSync(path.join(f.root, approval), " ")
  assert.throws(() => read(), /Saved native note approval changed/)
  fs.writeFileSync(path.join(f.root, approval), approvalBytes)
  const original = fs.readFileSync(path.join(f.vault, f.notes[0].path))
  fs.appendFileSync(path.join(f.vault, f.notes[0].path), "\nlocal changed after preparation\n")
  assert.deepEqual(read().current_local_drift, {
    changed_files: 1,
    absent_files: 0,
    current_bytes_match: false,
  })
  fs.writeFileSync(path.join(f.vault, f.notes[0].path), original)
  fs.appendFileSync(path.join(f.root, "checkpoint.json"), " ")
  assert.throws(() => read(), /Pinned reconciliation bytes changed/)
  for (const [p, bytes] of before) assert.ok(fs.readFileSync(path.join(f.root, p)).equals(bytes))
})

test("an existing article-free legacy review preserves empty original metadata and unknown cutoffs without inventing an article approval", async (t) => {
  const f = await fixture(t)
  const relative = "Editions/2026/09/2026-09-05_0800_Tech_AI_Briefing.md",
    content =
      "---\n{}\n---\n\n" +
      [
        "한눈에 보기",
        "오늘의 핵심 기사",
        "논문과 연구",
        "오픈소스와 도구",
        "흐름 읽기",
        "바로 써먹을 점",
        "Source List",
      ]
        .map((title) => `# ${title}\n\n없음\n`)
        .join("\n"),
    before = { file: path.join(f.vault, relative), ...parseNote(content) }
  const packet = {
    schema: "research-legacy-edition-transition/v1",
    reviewer: "Fixture explicit empty original review",
    reviewed_at: "2026-09-28",
    original_read: true,
    source_read: true,
    duplicate_checked: true,
    reason: "All original sections are empty; no successful collection or article is inferred.",
    target_path: relative,
    target_sha256: sha256(content),
    before_content: content,
    events: [],
    no_article_review: {
      original_content_checked: true,
      article_sections_checked: true,
      discovery_routes_checked: true,
      unsupported_no_news_claims_removed: true,
      reason: "Exact empty sections checked.",
    },
    unrecorded_coverage_review: {
      original_metadata_read: true,
      original_archive_read: true,
      edition_identity_checked: true,
      timezone_checked: true,
      cutoffs_not_recorded: true,
      reason: "Empty metadata has no known cutoff.",
    },
  }
  packet.units = legacyTransitionUnits(packet, before, relative).map(({ unit_id, sha256 }) => ({
    unit_id,
    sha256,
    decision: "omitted_empty",
    event_ids: [],
    reason: "The original section contains only 없음.",
  }))
  const projected = editionProjection([], {
    key: path.basename(relative, ".md"),
    date: "2026-09-05",
    coverage_start: null,
    coverage_end: null,
    existing: before,
    legacy_review: packet,
    source_root: f.root,
  })
  fs.unlinkSync(path.join(f.vault, f.edition.path))
  atomicWrite(f.vault, relative, projected.content)
  const acquisition = JSON.parse(fs.readFileSync(path.join(f.root, "acquisition.json"))),
    file = acquisition.files.find((row) => row.path === f.edition.path)
  file.path = relative
  file.metadata.title = path.basename(relative)
  file.metadata.size = String(Buffer.byteLength(content))
  file.raw = {
    ...file.metadata,
    b64_string: Buffer.from(content).toString("base64"),
    file_size_bytes: Buffer.byteLength(content),
  }
  for (const listing of acquisition.listings)
    for (const key of ["before", "after"])
      listing[key] = listing[key].map((row) => (row.id === file.metadata.id ? file.metadata : row))
  atomicWrite(f.root, "empty-acquisition.json", acquisition)
  const capture = captureAuthoringSourceSnapshot({
    root: f.root,
    runId: "empty-source",
    acquisitionFile: path.join(f.root, "empty-acquisition.json"),
    repository,
    vault: f.vault,
    now: Date.parse(acquisition.observed_at),
  })
  atomicWrite(f.root, "legacy-review.json", {
    schema: "research-legacy-transition-batch/v1",
    reviews: [packet],
  })
  const input = {
    ...f.reconciliation,
    source_capture: { run_id: "empty-source", sha256: capture.capture.sha256 },
    legacy_reviews: [reference(f.root, "legacy-review.json")],
  }
  atomicWrite(f.root, "reconcile-input.json", input)
  const prepare = () =>
    prepareAuthoringSourceReconciliation({
      root: f.root,
      inputFile: "reconcile-input.json",
      repository,
      vault: f.vault,
    })
  const result = prepare(),
    row = result.files.find((file) => file.path === relative)
  assert.equal(row.status, "prepared_private")
  assert.equal(row.file_projection.kind, "complete_legacy_transition")
  assert.deepEqual(row.file_projection.approved_inputs, [])
  assert.deepEqual(parseNote(content).meta, {})
  const staged = parseNote(fs.readFileSync(path.join(f.root, row.staged_path), "utf8"))
  assert.equal(staged.meta.coverage_start, null)
  assert.equal(staged.meta.coverage_end, null)
  assert.equal(staged.meta.historical_coverage, "unrecorded/v1")
  assert.deepEqual(staged.meta.article_records, [])
  assert.equal(result.approval_granted, false)
  atomicWrite(f.root, "reconcile-input.json", {
    ...input,
    run_id: "without-empty-review",
    legacy_reviews: [],
    prior_reconciliation: result.reconciliation,
  })
  const missing = prepare().files.find((file) => file.path === relative)
  assert.equal(missing.status, "review_required")
  assert.match(missing.file_projection_error, /Exact complete legacy review required/)
})

test("complete projection preserves existing YAML mapping order only when every value and the full body are exact", async (t) => {
  const f = await fixture(t, { reviewedRemoteEdition: true })
  const parsed = parseNote(fs.readFileSync(path.join(f.vault, f.edition.path), "utf8")),
    reordered = noteText(Object.fromEntries(Object.entries(parsed.meta).reverse()), parsed.body)
  atomicWrite(f.vault, f.edition.path, reordered)
  const prepare = () =>
    prepareAuthoringSourceReconciliation({
      root: f.root,
      inputFile: "reconcile-input.json",
      repository,
      vault: f.vault,
    })
  const result = prepare(),
    edition = result.files.find((row) => row.path === f.edition.path)
  assert.equal(edition.status, "prepared_private")
  assert.equal(edition.file_projection.mapping_order_preserved, true)
  assert.equal(edition.file_projection.projected_sha256, sha256(reordered))
  assert.notEqual(edition.file_projection.native_projected_sha256, sha256(reordered))
  assert.ok(fs.readFileSync(path.join(f.root, edition.staged_path)).equals(Buffer.from(reordered)))
  atomicWrite(f.vault, f.edition.path, reordered + "\nUnreviewed additional section\n")
  atomicWrite(f.root, "reconcile-input.json", {
    ...f.reconciliation,
    run_id: "unreviewed-body",
    prior_reconciliation: result.reconciliation,
  })
  const rejected = prepare().files.find((row) => row.path === f.edition.path)
  assert.equal(rejected.status, "review_required")
  assert.match(rejected.file_projection_error, /Full approved source projection differs/)
  assert.equal(rejected.staged_path, undefined)
})

test("exact saved native projection steps bind later retrospective approval to its intermediate bytes without loosening the original guard", async (t) => {
  const f = await fixture(t),
    first = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
    second = addKnowledgeArticle(f, { run: "second" })
  const oldArticle = (article) => {
    const title = "이전 " + article.title
    return {
      ...article,
      title,
      record: { ...article.record, title },
      article_review: { ...article.article_review, title },
    }
  }
  const options = {
    key: path.basename(f.edition.path, ".md"),
    date: "2026-09-25",
    coverage_start: "2026-09-24T08:00:00+09:00",
    coverage_end: "2026-09-25T08:00:00+09:00",
  }
  const original = editionProjection(
    [oldArticle(first.article), oldArticle(second.article)],
    options,
  )
  const existing = { file: path.join(f.vault, f.edition.path), ...parseNote(original.content) },
    old = extractArticles(existing)
  const intermediate = editionProjection(
    [
      first.article,
      existingArticleProjection(old.find((article) => article.id === second.article.event_id)),
    ],
    { ...options, existing },
  )
  const review = JSON.parse(
      fs.readFileSync(path.join(f.root, "runs/second/editorial-review.json")),
    ),
    record = JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/draft.json"))),
    documents = JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/documents.json"))),
    parses = JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/parses.json"))),
    claims = JSON.parse(
      fs.readFileSync(path.join(f.root, "runs/second/reviewed-claims.json")),
    ).claims
  review.retrospective_review = {
    schema_version: "retrospective-article-review/v1",
    event_id: second.article.event_id,
    reviewer: review.reviewer,
    reviewed_at: review.reviewed_at,
    reason: "Fixture source and exact intermediate appearance reviewed.",
    source_read: true,
    date_change_checked: true,
    ancillary_copy_read: true,
    appearances: [
      {
        path: f.edition.path,
        sha256: sha256(intermediate.content),
        before_content: intermediate.content,
        previous_title: old.find((article) => article.id === second.article.event_id).title,
        previous_published_at: second.article.article_review.published_at,
        sections: [],
      },
    ],
  }
  atomicWrite(f.root, "runs/second/editorial-review.json", review)
  atomicWrite(
    f.root,
    "runs/second/approved-article.json",
    approvedArticle(record, claims, documents, review, parses),
  )
  const approvedSecond = loadApprovedOntologyInput(f.root, "second", { vault: f.vault })
  atomicWrite(f.root, "graph.json", projectEvidenceOntology([first, approvedSecond]))
  const middle = { file: existing.file, ...parseNote(intermediate.content) },
    middleArticles = extractArticles(middle)
  const final = editionProjection(
    [
      existingArticleProjection(
        middleArticles.find((article) => article.id === first.article.event_id),
      ),
      approvedSecond.article,
    ],
    { ...options, existing: middle },
  )
  atomicWrite(f.vault, f.edition.path, final.content)
  const acquisition = JSON.parse(fs.readFileSync(path.join(f.root, "acquisition.json"))),
    remote = acquisition.files.find((row) => row.path === f.edition.path)
  remote.metadata.size = String(Buffer.byteLength(original.content))
  remote.raw = {
    ...remote.metadata,
    b64_string: Buffer.from(original.content).toString("base64"),
    file_size_bytes: Buffer.byteLength(original.content),
  }
  for (const listing of acquisition.listings)
    for (const key of ["before", "after"])
      listing[key] = listing[key].map((row) =>
        row.id === remote.metadata.id ? remote.metadata : row,
      )
  atomicWrite(f.root, "chain-acquisition.json", acquisition)
  const capture = captureAuthoringSourceSnapshot({
    root: f.root,
    runId: "chain-source",
    acquisitionFile: path.join(f.root, "chain-acquisition.json"),
    repository,
    vault: f.vault,
    now: Date.parse(acquisition.observed_at),
  })
  const checkpoint = JSON.parse(fs.readFileSync(path.join(f.root, "checkpoint.json")))
  atomicWrite(f.root, "checkpoint.json", {
    ...checkpoint,
    ontology: reference(f.root, "graph.json"),
  })
  const input = {
    ...f.reconciliation,
    source_capture: { run_id: "chain-source", sha256: capture.capture.sha256 },
    knowledge_checkpoint: reference(f.root, "checkpoint.json"),
  }
  atomicWrite(f.root, "reconcile-input.json", input)
  const prepare = () =>
    prepareAuthoringSourceReconciliation({
      root: f.root,
      inputFile: "reconcile-input.json",
      repository,
      vault: f.vault,
    })
  const blocked = prepare()
  assert.equal(blocked.files.find((row) => row.path === f.edition.path).status, "review_required")
  assert.match(
    blocked.files.find((row) => row.path === f.edition.path).file_projection_error,
    /current original appearance/,
  )
  for (const [name, before_sha256, after_sha256, event_id] of [
    [
      "first-step.json",
      sha256(original.content),
      sha256(intermediate.content),
      first.article.event_id,
    ],
    [
      "second-step.json",
      sha256(intermediate.content),
      sha256(final.content),
      second.article.event_id,
    ],
  ])
    atomicWrite(f.root, name, {
      schema: "research-local-approved-articles-apply/v1",
      mutations: [{ path: f.edition.path, before_sha256, after_sha256, event_ids: [event_id] }],
    })
  atomicWrite(f.root, "reconcile-input.json", {
    ...input,
    run_id: "with-chain",
    prior_reconciliation: blocked.reconciliation,
    retrospective_steps: [
      {
        path: f.edition.path,
        batches: [
          { runs: ["source"], readback: reference(f.root, "first-step.json") },
          { runs: ["second"], readback: reference(f.root, "second-step.json") },
        ],
      },
    ],
  })
  const ready = prepare(),
    edition = ready.files.find((row) => row.path === f.edition.path)
  assert.equal(edition.status, "prepared_private")
  assert.equal(edition.file_projection.kind, "native_retrospective_chain")
  assert.equal(edition.file_projection.steps[1].before_sha256, sha256(intermediate.content))
  assert.ok(
    fs.readFileSync(path.join(f.root, edition.staged_path)).equals(Buffer.from(final.content)),
  )
  assert.deepEqual(ready.private_staging, { new_files: 1, reused_files: 2 })
  const read = () =>
    loadAuthoringSourceReconciliation(f.root, "with-chain", { repository, vault: f.vault })
  assert.deepEqual(read().counts, { different_files: 4, prepared_private: 3, review_required: 1 })
  fs.appendFileSync(path.join(f.root, "second-step.json"), " ")
  assert.throws(() => read(), /Pinned reconciliation bytes changed/)
  assert.equal(ready.approval_granted, false)
  assert.equal(ready.remote_write_performed, false)
})

test("saved reconciliation status detects drift in previously unchanged files and new local paths without preparing them", async (t) => {
  const f = await fixture(t, { reviewedRemoteEdition: true })
  const prepared = prepareAuthoringSourceReconciliation({
      root: f.root,
      inputFile: "reconcile-input.json",
      repository,
      vault: f.vault,
    }),
    before = fs.readFileSync(path.join(f.root, prepared.reconciliation.path))
  const read = () =>
    loadAuthoringSourceReconciliation(f.root, "reconcile", { repository, vault: f.vault })
  fs.appendFileSync(path.join(f.vault, "Signals/unchanged.md"), "\nLater local change\n")
  atomicWrite(f.vault, "Knowledge/later-unreviewed.md", "# Later unreviewed file\n")
  assert.deepEqual(read().current_local_drift, {
    changed_files: 2,
    absent_files: 0,
    current_bytes_match: false,
  })
  fs.unlinkSync(path.join(f.vault, "Signals/unchanged.md"))
  const status = read()
  assert.deepEqual(status.current_local_drift, {
    changed_files: 1,
    absent_files: 1,
    current_bytes_match: false,
  })
  assert.deepEqual(status.counts, { different_files: 4, prepared_private: 3, review_required: 1 })
  assert.equal(status.staging_reexecuted, false)
  assert.equal(
    fs.existsSync(
      path.join(f.root, "drive-reconcile/reconcile/files/Knowledge/later-unreviewed.md"),
    ),
    false,
  )
  assert.ok(fs.readFileSync(path.join(f.root, prepared.reconciliation.path)).equals(before))
})

test("explicit private container presentation reviews accept exact citation aliases and empty lines, reject semantic changes, and preserve later retrospective guards", async (t) => {
  const f = await fixture(t, { reviewedRemoteEdition: true }),
    source = JSON.parse(
      fs.readFileSync(path.join(f.root, "drive-source/source/source-snapshot.json")),
    ).files.find((file) => file.path === f.edition.path),
    parsed = parseNote(f.edition.content),
    presented = noteText(
      parsed.meta,
      parsed.body.replaceAll("[S1]", "[S90]").replace(/\n\n(?=## )/, "\n\n\n\n"),
    )
  assert.notEqual(presented, f.edition.content)
  const storeReview = (name, projection, target, sourceSha) => {
    atomicWrite(f.root, `${name}-projection.md`, projection)
    atomicWrite(f.root, `${name}-target.md`, target)
    atomicWrite(f.root, `${name}-review.json`, {
      schema: "research-authoring-container-presentation-review/v1",
      target_path: f.edition.path,
      source_sha256: sourceSha,
      projection: reference(f.root, `${name}-projection.md`),
      target: reference(f.root, `${name}-target.md`),
      reviewer: "Fixture explicit private presentation review",
      reviewed_at: "2026-09-28",
      reason: "Exact metadata, all article text and raw citation targets checked.",
      all_articles_read: true,
      all_metadata_checked: true,
      citation_targets_checked: true,
      article_ids: extractArticles(parseNote(projection)).map((article) => article.id),
      approval_granted: false,
      release_approved: false,
    })
    return reference(f.root, `${name}-review.json`)
  }
  const prepare = () =>
    prepareAuthoringSourceReconciliation({
      root: f.root,
      inputFile: "reconcile-input.json",
      repository,
      vault: f.vault,
    })
  atomicWrite(f.vault, f.edition.path, presented)
  const blocked = prepare()
  assert.equal(blocked.files.find((row) => row.path === f.edition.path).status, "review_required")
  const review = storeReview("presentation", f.edition.content, presented, source.sha256)
  atomicWrite(f.root, "reconcile-input.json", {
    ...f.reconciliation,
    run_id: "presentation",
    prior_reconciliation: blocked.reconciliation,
    container_reviews: [review],
  })
  const ready = prepare(),
    edition = ready.files.find((row) => row.path === f.edition.path)
  assert.equal(edition.status, "prepared_private")
  assert.equal(
    edition.file_projection.presentation.native_projected_sha256,
    sha256(f.edition.content),
  )
  assert.equal(edition.file_projection.presentation.presented_sha256, sha256(presented))
  assert.ok(fs.readFileSync(path.join(f.root, edition.staged_path)).equals(Buffer.from(presented)))
  assert.deepEqual(ready.private_staging, { new_files: 1, reused_files: 2 })
  assert.equal(ready.approval_granted, false)
  assert.equal(ready.release_approved, false)
  assert.equal(ready.publication_performed, false)
  const read = () =>
    loadAuthoringSourceReconciliation(f.root, "presentation", { repository, vault: f.vault })
  assert.deepEqual(read().counts, { different_files: 4, prepared_private: 3, review_required: 1 })

  const changedTargets = [
    presented.replace("# Source List", "Unreviewed article text\n\n# Source List"),
    presented.replace(/^(## .+)$/m, "$1 changed headline"),
    noteText({ ...parsed.meta, date: "2026-09-26" }, parseNote(presented).body),
    presented.replace(/(https?:\/\/[^\s]+)(?=\n?$)/, "$1?changed=1"),
    presented.replace("[S90]", "[S999]"),
    presented.replace(/^(## .+)$/m, "$1 "),
  ]
  for (let i = 0; i < changedTargets.length; i++) {
    assert.notEqual(changedTargets[i], presented)
    const invalid = storeReview(`invalid-${i}`, f.edition.content, changedTargets[i], source.sha256)
    atomicWrite(f.root, "reconcile-input.json", {
      ...f.reconciliation,
      run_id: `invalid-${i}`,
      container_reviews: [invalid],
    })
    assert.throws(() => prepare(), /presentation review changes|exact raw source target/)
    assert.equal(fs.existsSync(path.join(f.root, `drive-reconcile/invalid-${i}`)), false)
  }
  const codeProjection = f.edition.content.replace(
      "# Source List",
      "```text\n[S1]\n\ncode\n```\n\n# Source List",
    ),
    codeTarget = codeProjection.replace("[S1]\n\ncode", "[S1]\n\n\ncode"),
    codeReview = storeReview("literal-code", codeProjection, codeTarget, source.sha256)
  atomicWrite(f.root, "reconcile-input.json", {
    ...f.reconciliation,
    run_id: "literal-code",
    container_reviews: [codeReview],
  })
  assert.throws(() => prepare(), /presentation review changes/)
  fs.appendFileSync(path.join(f.root, "presentation-review.json"), " ")
  assert.throws(() => read(), /Pinned reconciliation bytes changed/)

  // A later approval names the exact historical intermediate. Only the
  // reviewed presentation bridge may connect the native projection to it.
  const first = loadApprovedOntologyInput(f.root, "source", { vault: f.vault }),
    second = addKnowledgeArticle(f, { run: "second" }),
    oldArticle = (article) => {
      const title = "이전 " + article.title
      return {
        ...article,
        title,
        record: { ...article.record, title },
        article_review: { ...article.article_review, title },
      }
    },
    options = {
      key: path.basename(f.edition.path, ".md"),
      date: "2026-09-25",
      coverage_start: "2026-09-24T08:00:00+09:00",
      coverage_end: "2026-09-25T08:00:00+09:00",
    },
    original = editionProjection([oldArticle(first.article), oldArticle(second.article)], options),
    existing = { file: path.join(f.vault, f.edition.path), ...parseNote(original.content) },
    old = extractArticles(existing),
    intermediate = editionProjection(
      [
        first.article,
        existingArticleProjection(old.find((article) => article.id === second.article.event_id)),
      ],
      { ...options, existing },
    ),
    middleParsed = parseNote(intermediate.content),
    historicalMiddle = noteText(middleParsed.meta, middleParsed.body.replaceAll("[S1]", "[S90]")),
    secondReview = JSON.parse(
      fs.readFileSync(path.join(f.root, "runs/second/editorial-review.json")),
    )
  secondReview.retrospective_review = {
    schema_version: "retrospective-article-review/v1",
    event_id: second.article.event_id,
    reviewer: secondReview.reviewer,
    reviewed_at: secondReview.reviewed_at,
    reason: "Exact existing intermediate appearance reviewed.",
    source_read: true,
    date_change_checked: true,
    ancillary_copy_read: true,
    appearances: [
      {
        path: f.edition.path,
        sha256: sha256(historicalMiddle),
        before_content: historicalMiddle,
        previous_title: old.find((article) => article.id === second.article.event_id).title,
        previous_published_at: second.article.article_review.published_at,
        sections: [],
      },
    ],
  }
  atomicWrite(f.root, "runs/second/editorial-review.json", secondReview)
  atomicWrite(
    f.root,
    "runs/second/approved-article.json",
    approvedArticle(
      JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/draft.json"))),
      JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/reviewed-claims.json"))).claims,
      JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/documents.json"))),
      secondReview,
      JSON.parse(fs.readFileSync(path.join(f.root, "runs/second/parses.json"))),
    ),
  )
  const approvedSecond = loadApprovedOntologyInput(f.root, "second", { vault: f.vault }),
    middle = { file: existing.file, ...parseNote(historicalMiddle) },
    final = editionProjection(
      [
        existingArticleProjection(
          extractArticles(middle).find((article) => article.id === first.article.event_id),
        ),
        approvedSecond.article,
      ],
      { ...options, existing: middle },
    )
  atomicWrite(f.vault, f.edition.path, final.content)
  atomicWrite(f.root, "graph.json", projectEvidenceOntology([first, approvedSecond]))
  const acquisition = JSON.parse(fs.readFileSync(path.join(f.root, "acquisition.json"))),
    remote = acquisition.files.find((row) => row.path === f.edition.path)
  remote.metadata.size = String(Buffer.byteLength(original.content))
  remote.raw = {
    ...remote.metadata,
    b64_string: Buffer.from(original.content).toString("base64"),
    file_size_bytes: Buffer.byteLength(original.content),
  }
  for (const listing of acquisition.listings)
    for (const key of ["before", "after"])
      listing[key] = listing[key].map((row) =>
        row.id === remote.metadata.id ? remote.metadata : row,
      )
  atomicWrite(f.root, "presentation-chain-acquisition.json", acquisition)
  const capture = captureAuthoringSourceSnapshot({
      root: f.root,
      runId: "presentation-chain-source",
      acquisitionFile: path.join(f.root, "presentation-chain-acquisition.json"),
      repository,
      vault: f.vault,
      now: Date.parse(acquisition.observed_at),
    }),
    checkpoint = JSON.parse(fs.readFileSync(path.join(f.root, "checkpoint.json")))
  atomicWrite(f.root, "checkpoint.json", {
    ...checkpoint,
    ontology: reference(f.root, "graph.json"),
  })
  const chainInput = {
    ...f.reconciliation,
    run_id: "without-presentation-bridge",
    source_capture: { run_id: "presentation-chain-source", sha256: capture.capture.sha256 },
    knowledge_checkpoint: reference(f.root, "checkpoint.json"),
    retrospective_steps: [
      { path: f.edition.path, batches: [{ runs: ["source"] }, { runs: ["second"] }] },
    ],
  }
  atomicWrite(f.root, "reconcile-input.json", chainInput)
  const unbridged = prepare().files.find((row) => row.path === f.edition.path)
  assert.equal(unbridged.status, "review_required")
  assert.match(unbridged.file_projection_error, /current original appearance/)
  const bridge = storeReview(
    "historical-presentation",
    intermediate.content,
    historicalMiddle,
    sha256(original.content),
  )
  atomicWrite(f.root, "reconcile-input.json", {
    ...chainInput,
    run_id: "with-presentation-bridge",
    container_reviews: [bridge],
  })
  const bridged = prepare(),
    bridgedEdition = bridged.files.find((row) => row.path === f.edition.path)
  assert.equal(bridgedEdition.status, "prepared_private")
  assert.equal(
    bridgedEdition.file_projection.steps[0].presentation.presented_sha256,
    sha256(historicalMiddle),
  )
  assert.equal(bridgedEdition.file_projection.steps[1].before_sha256, sha256(historicalMiddle))
  assert.ok(
    fs
      .readFileSync(path.join(f.root, bridgedEdition.staged_path))
      .equals(Buffer.from(final.content)),
  )
  assert.equal(
    loadAuthoringSourceReconciliation(f.root, "with-presentation-bridge", {
      repository,
      vault: f.vault,
    }).counts.prepared_private,
    3,
  )
  assert.equal(bridged.approval_granted, false)
})
