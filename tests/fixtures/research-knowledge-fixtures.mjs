import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isolatedMCPFixtureParent } from "../../integrations/research-mcp/test/storage-fixture.mjs"
import { noteText } from "../../scripts/garden.mjs"
import { sha256, sourceId } from "../../scripts/research/contracts.mjs"
import { recordFactReview } from "../../scripts/research/claims.mjs"
import { atomicWrite } from "../../scripts/research/run-state.mjs"
import { executeModule } from "../../scripts/research/module-registry.mjs"
import {
  projectEvidenceOntology,
  loadApprovedOntologyInput,
} from "../../scripts/research/ontology.mjs"
import { draftFingerprint } from "../../scripts/research/editor.mjs"
import { approvedArticle } from "../../scripts/research/publish-adapter.mjs"

export async function knowledgeFixture(
  t,
  { nativeJob = false, fixtureRepo = fileURLToPath(new URL("../../", import.meta.url)) } = {},
) {
  const parent = isolatedMCPFixtureParent(fixtureRepo),
    repo = fs.realpathSync(fs.mkdtempSync(path.join(parent, "knowledge-integration-"))),
    root = nativeJob ? path.join(repo, "native") : repo
  fs.mkdirSync(path.join(repo, ".storage"))
  fs.writeFileSync(
    path.join(repo, ".storage/policy.json"),
    JSON.stringify({ schema: "research-cold-storage/v1", root: repo, enabled: false }),
  )
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  const vault = path.join(root, "vault"),
    ctx = { root, vault, repo }
  const url = "https://fixture.example/mechanism",
    text = "The source mechanism reuses the target during a planned deployment."
  const sid = sourceId(url),
    version = `${sid}:${sha256(text)}`,
    pid = sha256("fixture-parse")
  const doc = {
    source_id: sid,
    source_version_id: version,
    original_url: url,
    body_sha256: sha256(text),
    body_path: "documents/body.bin",
    fetch_status: "captured",
    observed_at: "2026-09-26T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: sid,
    source_version_id: version,
    parse_id: pid,
    title: "Mechanism",
    status: "extracted",
    dates: { published_at: "2026-09-25", observed_at: doc.observed_at },
    quality: { missing_pages: [] },
    blocks: [{ block_id: pid + ":b1", text, locator: { text_hash: sha256(text) } }],
  }
  const claims = recordFactReview(
    ["selected", "unassigned"].map((claim_id) => ({
      claim_id,
      statement: text,
      claim_kind: "fact",
      subject: "Mechanism",
      event_state: "planned",
      published_at: "2026-09-25",
      effective_period: "2027",
      numbers: [],
      evidence: [
        {
          source_id: sid,
          source_version_id: version,
          parse_id: pid,
          block_id: parse.blocks[0].block_id,
          quote: text,
          support: "direct",
        },
      ],
    })),
    ["selected", "unassigned"].map((claim_id) => ({
      claim_id,
      status: "verified",
      reason: "Fixture source read",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-26" },
    [parse],
  )
  atomicWrite(root, doc.body_path, text)
  atomicWrite(root, `parses/${pid}/parse.json`, parse)
  atomicWrite(root, "runs/source/documents.json", [doc])
  atomicWrite(root, "runs/source/parses.json", [parse])
  atomicWrite(root, "runs/source/reviewed-claims.json", { claims })
  const notes = ["source-concept", "target-concept"].map((id, i) => {
    const meta = {
      title: id,
      type: "knowledge",
      entry_type: "concept",
      schema_version: "tech-encyclopedia/v2",
      concept_id: id,
      label: id,
      keywords: [id],
      last_reviewed: "2026-09-26",
      aliases: [],
      verified_sources: [url],
      connections: i
        ? []
        : [
            {
              target: "target-concept",
              reason: "원문에서 설명한 재사용 메커니즘을 연결한다.",
              evidence: [url],
            },
          ],
      map_review: {
        decision: "include",
        kind: "mechanism",
        reason: "독립된 작동 원리를 확인했다.",
        reviewed: "2026-09-26",
      },
    }
    const relative = `Knowledge/${id}.md`,
      before = noteText(meta, "## 한 문장 정의\n\n원문에서 설명한 작동 원리.\n")
    atomicWrite(vault, relative, before)
    return {
      path: relative,
      previous_sha256: sha256(before),
      content: noteText(
        {
          ...meta,
          last_reviewed: "2026-09-27",
          map_review: { ...meta.map_review, reviewed: "2026-09-27" },
        },
        "## 한 문장 정의\n\n원문에서 설명한 작동 원리.\n",
      ),
      evidence: [{ run_id: "source", claim_ids: ["selected"] }],
    }
  })
  const noteDecision = {
    schema: "knowledge-note-review/v1",
    reviewer: "Fixture reviewer",
    reviewed_at: "2026-09-27",
    reason: "Fixture definition review",
    source_read: true,
    final_prose_read: true,
    aliases_checked: true,
    connections_checked: true,
    histories_checked: true,
    notes,
  }
  atomicWrite(repo, "inputs/notes.json", noteDecision)
  await executeModule(ctx, "knowledge", "review", {
    run_id: "notes",
    review_file: "inputs/notes.json",
  })
  for (const note of notes) atomicWrite(vault, note.path, note.content)
  const selections = notes.map((note) => ({
    run: "notes",
    path: note.path,
    sha256: sha256(note.content),
  }))
  const decision = {
    schema: "research-knowledge-connection-review/v1",
    reviewer: "Fixture reviewer",
    reviewed_at: "2026-09-28",
    reason: "Review the existing mechanism relationship, preserving the planned state.",
    source_read: true,
    definitions_read: true,
    relationships_checked: true,
    cooccurrence_rejected: true,
    connections: [
      {
        from: "source-concept",
        target: "target-concept",
        field: "connections",
        source_sha256: selections[0].sha256,
        target_sha256: selections[1].sha256,
        reason: "명시된 메커니즘의 실제 재사용 관계를 원문으로 대조했다.",
        evidence: [{ run_id: "source", claim_ids: ["selected"] }],
      },
    ],
  }
  // A real native approval is required even when no article assigns either
  // definition. The article uses a different fact from the same source.
  const draft = {
    title: "기법 재사용을 포함한 배포 계획 공개",
    lead: [
      {
        text: "공개 자료는 배포 계획에서 다른 기법을 재사용하는 구조를 설명했다.",
        claim_ids: ["unassigned"],
      },
      { text: "배포는 계획 상태로 제시됐다.", claim_ids: ["unassigned"] },
    ],
    facts: {
      who: "Mechanism",
      when: "2026-09-25",
      where: null,
      what: "배포 계획 설명",
      how: "다른 기법 재사용",
      why: null,
    },
    sector: "AI",
    theme: "연구·기술",
    tags: ["새로운 방법"],
    entities: ["Mechanism"],
    explanations: [
      {
        heading: "재사용 구조",
        paragraphs: [
          {
            text: "원문은 배포 계획에서 다른 기법을 재사용하는 방식을 설명한다.",
            claim_ids: ["unassigned"],
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
  const review = {
    status: "approved",
    draft_id: record.draft_id,
    event_id: sid.slice(0, 16),
    published_at: "2026-09-25",
    reviewed_at: "2026-09-27",
    region: "해외",
    reviewer: "Fixture reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    concept_ids: [],
  }
  atomicWrite(root, "runs/source/draft.json", record)
  atomicWrite(root, "runs/source/editorial-review.json", review)
  atomicWrite(
    root,
    "runs/source/approved-article.json",
    approvedArticle(record, claims, [doc], review, [parse]),
  )
  const graph = projectEvidenceOntology([loadApprovedOntologyInput(root, "source", { vault })])
  atomicWrite(root, "graph.json", graph)
  atomicWrite(repo, "inputs/selections.json", selections)
  atomicWrite(repo, "inputs/connections.json", decision)
  return { root, vault, ctx, notes, selections, decision, graph, doc }
}

export function addKnowledgeArticle(
  f,
  { run = "additional", url = "https://fixture.example/new-report", text, publishedAt } = {},
) {
  const oldDoc = JSON.parse(fs.readFileSync(path.join(f.root, "runs/source/documents.json")))[0]
  const oldParse = JSON.parse(fs.readFileSync(path.join(f.root, "runs/source/parses.json")))[0]
  const oldFact = JSON.parse(fs.readFileSync(path.join(f.root, "runs/source/reviewed-claims.json")))
    .claims[1]
  const body = text || oldParse.blocks[0].text,
    sid = sourceId(url),
    version = `${sid}:${sha256(body)}`,
    pid = sha256("parse-" + run)
  const doc = {
    ...oldDoc,
    source_id: sid,
    source_version_id: version,
    original_url: url,
    body_sha256: sha256(body),
    body_path: `documents/${run}.bin`,
  }
  const parsed = {
    ...oldParse,
    dates: { ...oldParse.dates, published_at: publishedAt || oldParse.dates.published_at },
    source_id: sid,
    source_version_id: version,
    parse_id: pid,
    blocks: [{ block_id: pid + ":b1", text: body, locator: { text_hash: sha256(body) } }],
  }
  const claim_id = run + "-fact",
    { review: unused, ...raw } = oldFact
  const claims = recordFactReview(
    [
      {
        ...raw,
        claim_id,
        statement: body,
        published_at: publishedAt || raw.published_at,
        evidence: [
          {
            source_id: sid,
            source_version_id: version,
            parse_id: pid,
            block_id: parsed.blocks[0].block_id,
            quote: body,
            support: "direct",
          },
        ],
      },
    ],
    [
      {
        claim_id,
        status: "verified",
        reason: "Read the independent fixture source",
        source_read: true,
        entailment_checked: true,
        identity_checked: true,
        numbers_checked: true,
        time_checked: true,
      },
    ],
    { reviewer: "Fixture reviewer", reviewed_at: "2026-09-26" },
    [parsed],
  )
  atomicWrite(f.root, doc.body_path, body)
  atomicWrite(f.root, `parses/${pid}/parse.json`, parsed)
  atomicWrite(f.root, `runs/${run}/documents.json`, [doc])
  atomicWrite(f.root, `runs/${run}/parses.json`, [parsed])
  atomicWrite(f.root, `runs/${run}/reviewed-claims.json`, { claims })
  const before = JSON.parse(fs.readFileSync(path.join(f.root, "runs/source/draft.json")))
  const draft = JSON.parse(
    JSON.stringify(before.draft).replaceAll('"unassigned"', JSON.stringify(claim_id)),
  )
  draft.title = "독립 자료의 배포 계획 공개"
  const record = { ...before, draft_id: draftFingerprint(draft), draft }
  const priorReview = JSON.parse(
    fs.readFileSync(path.join(f.root, "runs/source/editorial-review.json")),
  )
  const review = {
    ...priorReview,
    draft_id: record.draft_id,
    event_id: sid.slice(0, 16),
    published_at: publishedAt || priorReview.published_at,
  }
  atomicWrite(f.root, `runs/${run}/draft.json`, record)
  atomicWrite(f.root, `runs/${run}/editorial-review.json`, review)
  atomicWrite(
    f.root,
    `runs/${run}/approved-article.json`,
    approvedArticle(record, claims, [doc], review, [parsed]),
  )
  return loadApprovedOntologyInput(f.root, run, { vault: f.vault })
}
