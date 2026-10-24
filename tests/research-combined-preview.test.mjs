import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  approvedArticleMatchesRenderedContent,
  groupPreviewApprovalRuns,
  verifyReviewedConceptOutputs,
} from "../scripts/research/preview.mjs"
import { assertAuthoringReleaseReview } from "../scripts/research/authoring-release.mjs"
import { PUBLIC_ROOTS, sha256 } from "../scripts/research/contracts.mjs"

const curated = (patch = {}) =>
  groupPreviewApprovalRuns({
    run: "combined-preview",
    approvedRuns: [],
    handoffRuns: ["new-one", "new-two"],
    retrospectiveRuns: ["retro-one", "retro-two"],
    publicationHandoff: "runs/handoff.json",
    curation: { path: "runs/curation/selection.json", sha256: "a".repeat(64) },
    editionSpec: { date: "2026-10-12" },
    ...patch,
  })

test("rendered-prose verification compares inline-code content without Markdown delimiters", () => {
  const article = {
    title: "S3 Vectors update",
    record: {
      lead: "The `UpdateIndexMode` API updates an index in place.",
      explanations: [{ paragraphs: ["`QueryVectors`의 query parameters compare both modes."] }],
    },
    source_urls: ["https://example.org/source"],
  }
  const sourceLinks = new Set(article.source_urls)
  assert.equal(
    approvedArticleMatchesRenderedContent(
      article,
      "S3 Vectors update The `UpdateIndexMode` API updates an index in place. `QueryVectors` 의 query parameters compare both modes.",
      sourceLinks,
    ),
    true,
  )
  assert.equal(
    approvedArticleMatchesRenderedContent(
      article,
      "S3 Vectors update The UpdateIndexMode API updates an index in place. QueryVectors 는 query parameters cannot compare both modes.",
      sourceLinks,
    ),
    false,
  )
})

test("concept history binds a visible localized date to the exact linked article", () => {
  const workspace = fs.mkdtempSync(path.join(process.cwd(), ".local/research/concept-history-")),
    eventId = "0123456789abcdef",
    date = "2026-09-01",
    sourceURL = "https://example.org/source",
    notePath = "Knowledge/Test Term.md",
    noteBytes = Buffer.from("approved term bytes"),
    slug = "knowledge/test-term"
  const write = (relative, bytes) => {
    const target = path.join(workspace, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }
  try {
    write("vault/" + notePath, noteBytes)
    write(
      "public/knowledge-graph.json",
      JSON.stringify({
        nodes: [{ id: "test-term", slug }],
        articles: [
          {
            id: "news:" + eventId,
            matches: [{ termId: "test-term", basis: "editorial", role: "untyped" }],
          },
        ],
      }),
    )
    write(
      "public/knowledge/test-term.html",
      `<main><article><a href="/news/${eventId}">기사</a><time datetime="${date}">발표 2026.09.01</time></article><time datetime="2026-09-02">발표 2026.09.02</time><a href="${sourceURL}">원문</a></main>`,
    )
    write("public/news/" + eventId + ".html", `<a href="/${slug}">용어</a>`)
    const approval = {
      run: "native-approval",
      article: {
        event_id: eventId,
        article_review: { published_at: date },
        source_urls: [sourceURL],
      },
      concept_review: {
        links: [{ path: "Knowledge/Test Term", concept_id: "test-term" }],
        notes: [{ path: notePath, sha256: sha256(noteBytes) }],
      },
    }
    assert.equal(verifyReviewedConceptOutputs(workspace, [approval]).length, 1)
    write(
      "public/knowledge/test-term.html",
      `<main><article><a href="/news/${eventId}">기사</a><time datetime="2026-09-02">발표 2026.09.02</time></article><time datetime="${date}">발표 2026.09.01</time><a href="${sourceURL}">원문</a></main>`,
    )
    assert.throws(() => verifyReviewedConceptOutputs(workspace, [approval]), /dated event history/)
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

test("curated preview keeps the handoff issue and retrospective approvals in separate exact groups", () => {
  const groups = curated()
  assert.deepEqual(groups.newEditionRuns, ["new-one", "new-two"])
  assert.deepEqual(groups.retrospectiveRuns, ["retro-one", "retro-two"])
  assert.deepEqual(groups.retrospectiveProjectionRuns, ["retro-one", "retro-two"])
  assert.deepEqual(groups.approvedRuns, ["new-one", "new-two", "retro-one", "retro-two"])
})

test("curated preview rejects overlapping, duplicate, or unbound retrospective runs", () => {
  assert.throws(() => curated({ retrospectiveRuns: ["new-one"] }), /must be disjoint/)
  assert.throws(
    () => curated({ retrospectiveRuns: ["retro-one", "retro-one"] }),
    /Distinct native approval run IDs/,
  )
  assert.throws(() => curated({ curation: null }), /curated new-edition handoff/)
  assert.throws(() => curated({ editionSpec: null }), /curated new-edition handoff/)
})

test("ordinary daily and retrospective previews retain their existing approval groups", () => {
  assert.deepEqual(
    groupPreviewApprovalRuns({
      run: "daily-preview",
      approvedRuns: ["daily-one"],
      editionSpec: { date: "2026-10-12" },
    }),
    {
      approvedRuns: ["daily-one"],
      newEditionRuns: ["daily-one"],
      retrospectiveRuns: [],
      retrospectiveProjectionRuns: [],
    },
  )
  assert.deepEqual(
    groupPreviewApprovalRuns({ run: "retro-preview", approvedRuns: ["retro-one"] }),
    {
      approvedRuns: ["retro-one"],
      newEditionRuns: [],
      retrospectiveRuns: [],
      retrospectiveProjectionRuns: ["retro-one"],
    },
  )
})

test("curated release binds the selection to the new-edition subset while reviewing all combined events", () => {
  const now = Date.parse("2026-10-13T00:00:00Z"),
    reference = { path: "curation/selection.json", sha256: "b".repeat(64) },
    sourceFiles = PUBLIC_ROOTS.map((name) => ({
      path: `${name}/source.md`,
      sha256: sha256(name),
    })).sort((a, b) => a.path.localeCompare(b.path)),
    input = {
      plan: {
        preview_sha256: sha256("preview"),
        destination_folder_id: "drive-root",
        source_files: sourceFiles,
      },
      manifest: {
        observed_at: "2026-10-12T23:00:00Z",
        edition_spec: { date: "2026-10-12" },
        consistency: { articles: [{ event_id: "new-event" }, { event_id: "retro-event" }] },
        knowledge: [],
      },
      snapshot: {
        schema: "tech-drive-source/v1",
        complete: true,
        root_folder_id: "drive-root",
        roots: PUBLIC_ROOTS,
        exported_at: "2026-10-12T23:59:00Z",
        files: sourceFiles,
      },
      review: {
        schema: "research-authoring-release-review/v1",
        kind: "curated",
        preview_sha256: sha256("preview"),
        reviewer: "independent-reader",
        reviewed_at: "2026-10-12T23:30:00Z",
        event_ids: ["new-event", "retro-event"],
        note_paths: [],
        checks: Object.fromEntries(
          [
            "source_fidelity",
            "detail_preservation",
            "dependent_knowledge",
            "reader_content",
            "reader_interactions",
          ].map((key) => [key, "pass"]),
        ),
        curation_selection: reference,
      },
      curation: {
        reference,
        briefing_date: "2026-10-12",
        event_ids: ["new-event"],
      },
      now,
    }
  const result = assertAuthoringReleaseReview(input)
  assert.equal(result.new_operational_run, false)
  assert.equal(result.coverage_reviewed, false)
  assert.deepEqual(result.reviewed_event_ids, ["new-event", "retro-event"])
  assert.throws(
    () =>
      assertAuthoringReleaseReview({
        ...input,
        curation: { ...input.curation, event_ids: ["unknown-event"] },
      }),
    /curated release requires|Curated release requires/,
  )
})
