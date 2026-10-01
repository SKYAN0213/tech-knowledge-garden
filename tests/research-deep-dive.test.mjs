import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { recordDeepDiveReview, assertDeepDiveContext } from "../scripts/research/deep-dive.mjs"
import {
  writeDraft,
  correctDraft,
  draftFingerprint,
  draftMarkdown,
  draftProblems,
} from "../scripts/research/editor.mjs"
import { approvedArticle, editionProjection } from "../scripts/research/publish-adapter.mjs"
import { loadCurrentApproval } from "../scripts/research/preview.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { parseNote, extractArticles } from "../scripts/garden.mjs"
import { main } from "../scripts/research.mjs"
import { sectorTabs, articleCard } from "../scripts/reader-cards.mjs"
import { digestMarkdown, feedDescription } from "../scripts/briefings.mjs"

// Synthetic regression inputs exercise contracts; they are not research or gold cases.
function fixture(kind = "기업 전략", { paperReferenceURL = null } = {}) {
  const paper = kind === "논문 해설",
    venture = kind === "연구 사업화"
  const definitions = paper
    ? [
        [
          "https://research.example.edu/arxiv/2609.12345v1",
          "2026-09-02",
          [
            "A study identifies a scheduling problem. arXiv:2609.12345v1",
            "The method schedules tasks using a learned policy.",
            "Tests use fixed workloads and the same hardware.",
            "The policy is compared with a rule-based scheduler.",
            "The study reports reduced task latency in these tests.",
          ],
        ],
      ]
    : venture
      ? [
          [
            "https://university.example.edu/startup",
            "2026-09-01",
            [
              "Professor Kim researches scheduling systems.",
              "The university reports that Professor Kim founded Example Venture.",
            ],
          ],
          [
            "https://venture.example.com/announcement",
            "2026-09-02",
            [
              "Example Venture identifies Professor Kim as its founder.",
              "Example Venture announces a task scheduling product.",
            ],
          ],
        ]
      : [
          [
            "https://example.com/strategy-previous",
            "2026-09-01",
            ["Example Co plans to build a production line."],
          ],
          [
            "https://example.com/strategy-update",
            "2026-09-02",
            ["Example Co has signed the production equipment contract."],
          ],
        ]
  const documents = [],
    parses = [],
    raw = []
  definitions.forEach(([url, date, statements], index) => {
    const corpus =
      paper && paperReferenceURL ? [...statements, `References: ${paperReferenceURL}`] : statements
    const body = Buffer.from(corpus.join("\n")),
      sid = sourceId(url),
      version = sid + ":" + sha256(body),
      pid = sha256("deep-fixture-" + index + kind)
    const document = {
      source_id: sid,
      source_version_id: version,
      original_url: url,
      final_url: url,
      fetch_status: "captured",
      observed_at: "2026-09-26T01:00:00Z",
      body_sha256: sha256(body),
      body_path: `sources/${sid}/${sha256(body)}/body.bin`,
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id: sid,
      source_version_id: version,
      parse_id: pid,
      title: "Synthetic source",
      status: "extracted",
      dates: { published_at: date, observed_at: document.observed_at },
      quality: { missing_pages: [] },
      blocks: corpus.map((text, n) => ({
        block_id: pid + ":b" + n,
        text,
        locator: { text_hash: sha256(text) },
      })),
    }
    documents.push(document)
    parses.push(parse)
    statements.forEach((statement, n) =>
      raw.push({
        claim_id: sha256(kind + index + n).slice(0, 24),
        candidate_key: "synthetic",
        statement,
        subject: venture ? (index === 0 ? "Professor Kim" : "Example Venture") : "Example Co",
        claim_kind: "attributed_fact",
        event_state: index === 0 && !paper && !venture ? "planned" : "reported",
        published_at: date,
        effective_period: null,
        numbers: [],
        evidence: [
          {
            source_id: sid,
            source_version_id: version,
            parse_id: pid,
            block_id: parse.blocks[n].block_id,
            quote: statement,
            support: "direct",
          },
        ],
      }),
    )
  })
  const review = {
    reviewer: "synthetic-reviewer",
    reviewed_at: "2026-09-27",
    source_read: true,
    source_roles_checked: true,
    basis_checked: true,
    identities_checked: true,
    scope_checked: true,
  }
  const claims = recordFactReview(
    raw,
    raw.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Synthetic fixture only",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    review,
    parses,
  )
  const ids = claims.map((c) => c.claim_id),
    versions = documents.map((d) => d.source_version_id)
  const basis = paper
    ? ["problem", "method", "conditions", "comparison", "results"].map((role, i) => ({
        role,
        claim_ids: [ids[i]],
      }))
    : venture
      ? [
          { role: "research", claim_ids: [ids[0]] },
          { role: "relationship", claim_ids: [ids[1], ids[2]] },
          { role: "product", claim_ids: [ids[3]] },
        ]
      : [
          { role: "goal", claim_ids: [ids[0]] },
          { role: "allocation", claim_ids: [ids[1]] },
          { role: "comparison", claim_ids: ids },
        ]
  const input = {
    schema: "deep-dive-input/v1",
    kind,
    topic_ids: [paper ? "research-scheduling" : venture ? "venture-example" : "company-example"],
    event_claim_ids: [ids.at(-1)],
    basis,
    sources: versions.map((source_version_id, i) => ({
      source_version_id,
      organization_id: paper
        ? "research-university"
        : venture
          ? i === 0
            ? "example-university"
            : "example-venture"
          : "example-company",
      organization_kind: paper ? "university" : venture && i === 0 ? "university" : "company",
      scope: "full_document",
    })),
    papers: paper
      ? [
          {
            work_id: "scheduling-2026",
            identifiers: ["arxiv:2609.12345v1"],
            access: "전문",
            status: "사전공개",
            evidence_url: documents[0].original_url,
            full_text_source_version_id: versions[0],
            claim_ids: ids,
          },
        ]
      : [],
    relations: venture
      ? [
          {
            person_id: "professor-kim-university",
            person_name: "Professor Kim",
            affiliation: "Example University",
            organization: "Example Venture",
            role: "창업",
            claim: "Professor Kim founded Example Venture.",
            as_of: "2026-09-02",
            evidence_urls: documents.map((d) => d.original_url),
            claim_ids: [ids[1], ids[2]],
          },
        ]
      : [],
  }
  const context = recordDeepDiveReview(input, claims, parses, documents, review)
  const draft = {
    title: "확인한 자료의 기술과 사업 진행",
    lead: [
      { text: "회사는 새 발표를 공개했다.", claim_ids: [ids.at(-1)] },
      { text: "이전 기록과 비교할 수 있는 조건을 제시했다.", claim_ids: [ids[0]] },
    ],
    facts: {
      who: "Example Co",
      when: "2026-09-02",
      where: null,
      what: "공식 발표",
      how: null,
      why: null,
    },
    sector: "로봇·제조",
    theme: "제품·서비스",
    tags: ["신제품"],
    entities: [],
    explanations: basis.map((b, i) => ({
      role: b.role,
      heading: "자료의 구체적인 내용 " + (i + 1),
      paragraphs: [{ text: "발표 자료가 밝힌 내용과 조건을 설명한다.", claim_ids: b.claim_ids }],
    })),
    analysis: {
      text: "이전 기록과 이번 자료는 적용 조건과 실행 단계를 구분해 보여 준다.",
      claim_ids: ids.slice(0, 2),
    },
  }
  const record = { draft, deep_context: context, draft_id: draftFingerprint(draft, context) }
  const editorialReview = {
    status: "approved",
    draft_id: record.draft_id,
    reviewer: "synthetic-reviewer",
    source_read: true,
    final_prose_read: true,
    title_checked: true,
    dates_checked: true,
    numbers_checked: true,
    analysis_checked: true,
    event_id: "1234567890abcdef",
    published_at: "2026-09-02",
    reviewed_at: "2026-09-27",
    region: "해외",
  }
  return {
    input,
    context,
    claims,
    parses,
    documents,
    review,
    draft,
    record,
    editorialReview,
    definitions,
  }
}

test("three deep kinds preserve paper/person metadata and use the existing edition contract", () => {
  for (const kind of ["기업 전략", "논문 해설", "연구 사업화"]) {
    const s = fixture(kind),
      article = approvedArticle(s.record, s.claims, s.documents, s.editorialReview, s.parses)
    assert.equal(article.record.kind, kind)
    assert.deepEqual(article.record.topic_ids, s.input.topic_ids)
    assert.equal(article.record.analysis_summary, s.draft.analysis.text)
    const projection = editionProjection([article], {
      key: "2026-09-27_0800_Tech_AI_Briefing",
      date: "2026-09-27",
      coverage_start: "2026-09-26T23:00:00Z",
      coverage_end: "2026-09-27T00:00:00Z",
    })
    const parsed = parseNote(projection.content),
      extracted = extractArticles({ meta: parsed.meta, body: parsed.body, file: projection.path })
    assert.equal(extracted[0].editorial.kind, kind)
    assert.equal(extracted[0].id, "1234567890abcdef")
    assert.ok(projection.content.includes("### 분석"))
    for (const hidden of [
      "deep-dive-context",
      "source_roles_checked",
      "claims_sha256",
      "full_text_source_version_id",
      "claim_ids",
      "synthetic-reviewer",
    ])
      assert.equal(projection.content.includes(hidden), false, hidden)
    assert.equal(article.record.papers.length, kind === "논문 해설" ? 1 : 0)
    assert.equal(article.record.relations.length, kind === "연구 사업화" ? 1 : 0)
  }
})

test("deep full-text paper with unknown publication status preserves null without changing access gates", () => {
  const s = fixture("논문 해설")
  s.input.papers[0].status = null
  s.input.papers[0].identifiers = ["url:" + s.documents[0].original_url]
  const context = recordDeepDiveReview(s.input, s.claims, s.parses, s.documents, s.review)
  s.record.deep_context = context
  s.record.draft_id = draftFingerprint(s.record.draft, context)
  s.editorialReview.draft_id = s.record.draft_id
  const article = approvedArticle(s.record, s.claims, s.documents, s.editorialReview, s.parses)
  const projected = editionProjection([article], {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T23:00:00Z",
    coverage_end: "2026-09-27T00:00:00Z",
  })
  const note = parseNote(projected.content)
  const items = extractArticles({ file: projected.path, ...note })
  assert.equal(items[0].editorial.papers[0].status, null)
  assert.equal(items[0].editorial.papers[0].access, "전문")
  const abstract = structuredClone(s.input)
  abstract.papers[0].access = "초록"
  assert.throws(() => recordDeepDiveReview(abstract, s.claims, s.parses, s.documents, s.review))
})

test("strategy rejects one dated source, missing roles and declared nonofficial basis", () => {
  const s = fixture()
  const one = structuredClone(s.input)
  one.basis.find((b) => b.role === "comparison").claim_ids = [s.claims[1].claim_id]
  assert.throws(
    () => recordDeepDiveReview(one, s.claims, s.parses, s.documents, s.review),
    /distinct dated/,
  )
  const missing = structuredClone(s.input)
  missing.basis[0].role = "outcome"
  assert.throws(
    () => recordDeepDiveReview(missing, s.claims, s.parses, s.documents, s.review),
    /roles missing/,
  )
  const source = structuredClone(s.input)
  source.sources[0].organization_kind = "publisher"
  assert.throws(
    () => recordDeepDiveReview(source, s.claims, s.parses, s.documents, s.review),
    /company or filing/,
  )
})

test("paper rejects abstract-only, incomplete full text and identifiers from another work", () => {
  const s = fixture("논문 해설")
  const abstract = structuredClone(s.input)
  abstract.sources[0].scope = "abstract_only"
  assert.throws(
    () => recordDeepDiveReview(abstract, s.claims, s.parses, s.documents, s.review),
    /full-text/,
  )
  const wrong = structuredClone(s.input)
  wrong.papers[0].identifiers = ["arxiv:2609.99999"]
  assert.throws(
    () => recordDeepDiveReview(wrong, s.claims, s.parses, s.documents, s.review),
    /identifier missing/,
  )
  const partial = structuredClone(s.parses)
  partial[0].status = "partial"
  partial[0].quality.missing_pages = [4]
  assert.throws(
    () => recordDeepDiveReview(s.input, s.claims, partial, s.documents, s.review),
    /changed after fact review/,
  )
  const incomplete = structuredClone(s.input)
  incomplete.papers = []
  assert.throws(
    () => recordDeepDiveReview(incomplete, s.claims, s.parses, s.documents, s.review),
    /full-text paper/,
  )
})

test("deep paper URL identity uses the selected source rather than another URL mentioned in it", () => {
  const s = fixture("논문 해설", { paperReferenceURL: "https://papers.example.org/related.pdf" })
  s.input.papers[0].identifiers = ["url:" + s.documents[0].original_url]
  assert.doesNotThrow(() =>
    recordDeepDiveReview(s.input, s.claims, s.parses, s.documents, s.review),
  )
  const unrelated = structuredClone(s.input)
  unrelated.papers[0].identifiers = ["url:https://papers.example.org/related.pdf"]
  assert.throws(
    () => recordDeepDiveReview(unrelated, s.claims, s.parses, s.documents, s.review),
    /selected source/,
  )
  const tampered = structuredClone(s.parses)
  tampered[0].blocks.at(-1).text += " edited after review"
  assert.throws(
    () => recordDeepDiveReview(s.input, s.claims, tampered, s.documents, s.review),
    /Block text hash mismatch/,
  )
})

test("commercialization distinguishes advisory work and requires distinct university and company evidence", () => {
  const s = fixture("연구 사업화")
  const advisory = structuredClone(s.input)
  advisory.relations[0].role = "기술자문"
  assert.throws(
    () => recordDeepDiveReview(advisory, s.claims, s.parses, s.documents, s.review),
    /explicit founding/,
  )
  const twoCompany = structuredClone(s.input)
  twoCompany.sources[0].organization_kind = "company"
  assert.throws(
    () => recordDeepDiveReview(twoCompany, s.claims, s.parses, s.documents, s.review),
    /distinct university and company/,
  )
  const sameOrganization = structuredClone(s.input)
  sameOrganization.sources[0].organization_id = sameOrganization.sources[1].organization_id
  assert.throws(
    () => recordDeepDiveReview(sameOrganization, s.claims, s.parses, s.documents, s.review),
    /distinct university and company/,
  )
  const changedURL = structuredClone(s.input)
  changedURL.relations[0].evidence_urls.push("https://university.example.edu/unread")
  assert.throws(
    () => recordDeepDiveReview(changedURL, s.claims, s.parses, s.documents, s.review),
    /claim evidence/,
  )
})

test("review fingerprints bind topic, identities, source roles and observations without trusting flags", () => {
  const s = fixture()
  assert.throws(
    () =>
      recordDeepDiveReview(s.input, s.claims, s.parses, s.documents, {
        ...s.review,
        scope_checked: "true",
      }),
    /Explicit deep-dive/,
  )
  const context = structuredClone(s.context)
  context.input.topic_ids = ["company-another"]
  assert.throws(
    () => assertDeepDiveContext(context, s.claims, s.parses, s.documents),
    /changed after review/,
  )
  const documents = structuredClone(s.documents)
  documents[0].observed_at = "2026-09-26T02:00:00Z"
  assert.throws(
    () => assertDeepDiveContext(s.context, s.claims, s.parses, documents),
    /changed after review/,
  )
  const claims = structuredClone(s.claims)
  claims[0].statement += " unsupported"
  assert.throws(
    () => assertDeepDiveContext(s.context, claims, s.parses, s.documents),
    /changed after fact review/,
  )
  assert.deepEqual(
    new Set(
      assertDeepDiveContext(
        s.context,
        [...s.claims].reverse(),
        [...s.parses].reverse(),
        [...s.documents].reverse(),
      ).map((c) => c.claim_id),
    ),
    new Set(s.claims.map((c) => c.claim_id)),
  )
})

test("deep writer uses kind roles, binds its context and includes separately labeled analysis", async () => {
  const s = fixture("논문 해설"),
    requests = []
  const model = {
    structured: async (request) => {
      requests.push(request)
      return { output: s.draft, provenance: { model: "test-only" } }
    },
  }
  const record = await writeDraft(model, s.claims, {
    deepContext: s.context,
    parses: s.parses,
    documents: s.documents,
  })
  assert.equal(record.draft_id, draftFingerprint(s.draft, s.context))
  assert.deepEqual(record.problems, [])
  assert.equal(requests[0].schema.properties.analysis.properties.claim_ids.minItems, 2)
  assert.match(requests[0].messages[0].content, /subject와 구분해 그 발언자에게/)
  assert.deepEqual(
    JSON.parse(requests[0].messages[1].content)
      .claims.map((claim) => claim.statement)
      .sort(),
    s.claims.map((claim) => claim.statement).sort(),
  )
  assert.ok(JSON.parse(requests[0].messages[1].content).deep_basis.kind === "논문 해설")
  const preview = draftMarkdown(record, s.claims, s.documents)
  assert.ok(preview.includes("## 분석"))
  assert.equal((preview.match(/\[원문\]\(/g) || []).length, 1)
  await assert.rejects(
    writeDraft(model, s.claims, {
      deepContext: s.context,
      parses: s.parses,
      documents: s.documents,
      provisional: true,
    }),
    /provisional/,
  )
  const mismatch = structuredClone(s.draft)
  mismatch.explanations[0].paragraphs[0].claim_ids = [s.claims[4].claim_id]
  assert.ok(draftProblems(mismatch, s.claims, s.context).includes("deep_role_claim_mismatch"))
  const correction = correctDraft(record, s.draft, s.claims, {
    reviewer: "fixture",
    reason: "Synthetic replacement",
    draft_id: record.draft_id,
  })
  assert.equal(correction.draft_id, record.draft_id)
})

test("deep approval rejects changed context, wrong event date, later relation and reader IDs in analysis", () => {
  const s = fixture("연구 사업화"),
    changed = structuredClone(s.record)
  changed.deep_context.input.relations[0].person_name = "Someone Else"
  assert.throws(
    () => approvedArticle(changed, s.claims, s.documents, s.editorialReview, s.parses),
    /changed after review/,
  )
  assert.throws(
    () =>
      approvedArticle(
        s.record,
        s.claims,
        s.documents,
        { ...s.editorialReview, published_at: "2026-09-01" },
        s.parses,
      ),
    /supporting source date/,
  )
  const leaked = structuredClone(s.record)
  leaked.draft.analysis.text += " [" + s.claims[0].claim_id + "]"
  leaked.draft_id = draftFingerprint(leaked.draft, leaked.deep_context)
  assert.throws(
    () =>
      approvedArticle(
        leaked,
        s.claims,
        s.documents,
        { ...s.editorialReview, draft_id: leaked.draft_id },
        s.parses,
      ),
    /internal_claim_identity/,
  )
  const futureInput = structuredClone(s.input)
  futureInput.relations[0].as_of = "2026-09-03"
  const context = recordDeepDiveReview(futureInput, s.claims, s.parses, s.documents, s.review)
  const later = { ...s.record, deep_context: context, draft_id: draftFingerprint(s.draft, context) }
  assert.throws(
    () =>
      approvedArticle(
        later,
        s.claims,
        s.documents,
        { ...s.editorialReview, draft_id: later.draft_id },
        s.parses,
      ),
    /cannot follow/,
  )
})

test("deep CLI binds source files and preserves existing news mode without starting a model for review", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-deep-cli-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const s = fixture(),
    run = "deep-synthetic",
    dir = `runs/${run}`
  s.documents.forEach((doc, i) =>
    atomicWrite(root, doc.body_path, Buffer.from(s.definitions[i][2].join("\n"))),
  )
  s.parses.forEach((parse) => atomicWrite(root, `parses/${parse.parse_id}/parse.json`, parse))
  atomicWrite(root, `${dir}/documents.json`, s.documents)
  atomicWrite(root, `${dir}/parses.json`, s.parses)
  atomicWrite(root, `${dir}/claims.json`, { claims: s.claims })
  atomicWrite(root, `${dir}/reviewed-claims.json`, { claims: s.claims })
  atomicWrite(root, "deep-review.json", { input: s.input, review: s.review })
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw Error("Review must not call a model or publisher")
  }
  t.after(() => {
    globalThis.fetch = oldFetch
  })
  const result = await main([
    "deep-review",
    "--root",
    root,
    "--run",
    run,
    "--review",
    path.join(root, "deep-review.json"),
  ])
  assert.equal(result.kind, "기업 전략")
  assert.equal(result.candidate_published, false)
  const context = readJSON(root, `${dir}/deep-context.json`)
  assert.ok(context.fingerprints.documents_sha256)
  const record = {
    ...s.record,
    deep_context: context,
    draft_id: draftFingerprint(s.draft, context),
  }
  atomicWrite(root, `${dir}/draft.json`, record)
  atomicWrite(root, "editorial-review.json", { ...s.editorialReview, draft_id: record.draft_id })
  const approved = await main([
    "approve",
    "--root",
    root,
    "--run",
    run,
    "--review",
    path.join(root, "editorial-review.json"),
  ])
  assert.equal(approved.status, "approved")
  assert.equal(readJSON(root, `${dir}/approved-article.json`).record.kind, "기업 전략")
  assert.equal(loadCurrentApproval(root, run).article.record.kind, "기업 전략")
  const approvedArticleBytes = fs.readFileSync(path.join(root, dir, "approved-article.json"))
  const alteredApproval = readJSON(root, `${dir}/approved-article.json`)
  alteredApproval.record.lead = "승인 후 교체한 미검토 문장"
  atomicWrite(root, `${dir}/approved-article.json`, alteredApproval)
  assert.throws(() => loadCurrentApproval(root, run), /Saved approval differs/)
  await assert.rejects(
    main([
      "approve",
      "--root",
      root,
      "--run",
      run,
      "--review",
      path.join(root, "editorial-review.json"),
    ]),
    /immutable.*new run/i,
  )
  assert.equal(
    readJSON(root, `${dir}/approved-article.json`).record.lead,
    "승인 후 교체한 미검토 문장",
  )
  // Restore this test's deliberate fixture tampering; production approval is create-only.
  atomicWrite(root, `${dir}/approved-article.json`, approvedArticleBytes)
  atomicWrite(root, `${dir}/draft.json`, {
    ...record,
    draft: { ...record.draft, title: "승인 후 바뀐 제목" },
  })
  assert.throws(() => loadCurrentApproval(root, run), /changed after review/)
  atomicWrite(root, `${dir}/draft.json`, record)
  atomicWrite(root, s.documents[0].body_path, "corrupted")
  assert.throws(() => loadCurrentApproval(root, run), /body|hash/i)
  await assert.rejects(
    main([
      "deep-review",
      "--root",
      root,
      "--run",
      run,
      "--review",
      path.join(root, "deep-review.json"),
    ]),
    /body|hash/i,
  )
  await assert.rejects(
    main(["collect", "--root", root, "--run", run, "--deep"]),
    /only supported for draft/,
  )
})

test("one deep explanation can combine basis roles without hiding required facts", async () => {
  const s = fixture("논문 해설"),
    draft = structuredClone(s.draft)
  draft.explanations = [
    {
      role: s.input.basis.map((b) => b.role),
      heading: "연구 방법과 비교 조건",
      paragraphs: [
        {
          text: "실험 방법과 비교 조건을 한 설명으로 전달한다.",
          claim_ids: s.claims.map((c) => c.claim_id),
        },
      ],
    },
  ]
  const record = await writeDraft(
    { structured: async () => ({ output: draft, provenance: { model: "synthetic" } }) },
    s.claims,
    { deepContext: s.context, parses: s.parses, documents: s.documents },
  )
  assert.deepEqual(record.problems, [])
  assert.equal(record.draft.explanations.length, 1)
  const missing = structuredClone(draft)
  missing.explanations[0].paragraphs[0].claim_ids = s.claims.slice(0, -1).map((c) => c.claim_id)
  assert.ok(draftProblems(missing, s.claims, s.context).includes("missing_deep_basis_fact"))
  const unassigned = structuredClone(draft)
  unassigned.explanations[0].role = ["problem", "method", "conditions", "comparison"]
  assert.ok(
    draftProblems(unassigned, s.claims, s.context).includes("missing_deep_basis_explanation"),
  )
  const invalid = structuredClone(draft)
  invalid.explanations[0].role = ["problem", "problem", "invented"]
  assert.ok(draftProblems(invalid, s.claims, s.context).includes("invalid_deep_basis_role"))
})

test("correction CLI preserves model draft bytes and rejects changed or stale review inputs", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-correction-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const s = fixture(),
    run = "correction-synthetic",
    dir = `runs/${run}`
  s.documents.forEach((doc, i) =>
    atomicWrite(root, doc.body_path, Buffer.from(s.definitions[i][2].join("\n"))),
  )
  s.parses.forEach((parse) => atomicWrite(root, `parses/${parse.parse_id}/parse.json`, parse))
  atomicWrite(root, `${dir}/documents.json`, s.documents)
  atomicWrite(root, `${dir}/parses.json`, s.parses)
  atomicWrite(root, `${dir}/claims.json`, { claims: s.claims })
  atomicWrite(root, `${dir}/reviewed-claims.json`, { claims: s.claims })
  const original = { ...s.record, model_artifacts: { fixture: "synthetic-response" } }
  atomicWrite(root, `${dir}/draft.json`, original)
  const originalBytes = fs.readFileSync(path.join(root, dir, "draft.json"))
  const decision = {
    draft_id: original.draft_id,
    reviewer: "synthetic-reviewer",
    reason: "No additional analysis in this fixture",
    reviewed_at: "2026-09-27",
    draft: { ...s.draft, analysis: null },
  }
  atomicWrite(root, "correction.json", decision)
  const args = [
    "correct",
    "--root",
    root,
    "--run",
    run,
    "--review",
    path.join(root, "correction.json"),
  ]
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw Error("Correction must not invoke models or publishers")
  }
  t.after(() => {
    globalThis.fetch = oldFetch
  })
  const result = await main(args)
  assert.deepEqual(result.problems, [])
  assert.notEqual(result.draft_id, original.draft_id)
  assert.deepEqual(
    fs.readFileSync(path.join(root, dir, "drafts", original.draft_id + ".json")),
    originalBytes,
  )
  const corrected = readJSON(root, `${dir}/draft.json`)
  assert.deepEqual(corrected.model_artifacts, original.model_artifacts)
  assert.equal(corrected.previous_draft_id, original.draft_id)
  assert.equal(corrected.public_approved, false)
  assert.equal((await main(args)).reused, true)
  assert.equal(fs.readdirSync(path.join(root, dir, "drafts")).length, 1)
  const tampered = structuredClone(corrected)
  tampered.draft.title += " changed"
  atomicWrite(root, `${dir}/draft.json`, tampered)
  await assert.rejects(main(args), /changed before correction/)
  atomicWrite(root, `${dir}/draft.json`, corrected)
  atomicWrite(root, "correction.json", { ...decision, draft_id: "stale" })
  await assert.rejects(main(args), /Exact draft correction/)
  assert.deepEqual(readJSON(root, `${dir}/draft.json`), corrected)
  atomicWrite(root, "correction.json", { ...decision, unexpected: true })
  await assert.rejects(main(args), /Unknown draft correction field/)
  atomicWrite(root, "correction.json", decision)
  atomicWrite(root, s.documents[0].body_path, "corrupted")
  await assert.rejects(main(args), /body|hash/i)
  assert.deepEqual(readJSON(root, `${dir}/draft.json`), corrected)
})

test("source-backed deep explanation may omit analysis throughout the public rendering contract", async () => {
  const s = fixture("논문 해설"),
    draft = { ...s.draft, analysis: null }
  const record = await writeDraft(
    { structured: async () => ({ output: draft, provenance: { model: "synthetic" } }) },
    s.claims,
    { deepContext: s.context, parses: s.parses, documents: s.documents },
  )
  assert.deepEqual(record.problems, [])
  assert.equal(draftMarkdown(record, s.claims, s.documents).includes("## 분석"), false)
  const article = approvedArticle(
    record,
    s.claims,
    s.documents,
    { ...s.editorialReview, draft_id: record.draft_id },
    s.parses,
  )
  assert.equal(Object.hasOwn(article.record, "analysis_summary"), false)
  const projection = editionProjection([article], {
    key: "2026-09-27_0800_Tech_AI_Briefing",
    date: "2026-09-27",
    coverage_start: "2026-09-26T23:00:00Z",
    coverage_end: "2026-09-27T00:00:00Z",
  })
  const parsed = parseNote(projection.content),
    issue = { ...parsed, file: projection.path, slug: projection.path.slice(0, -3) },
    items = extractArticles(issue)
  assert.equal(items[0].editorial.kind, "논문 해설")
  assert.equal(sectorTabs(items, "/news").includes("data-deep-tab"), false)
  assert.equal(articleCard(items[0], (p) => "/" + p, true).includes("undefined"), false)
  const model = {
    key: issue.slug,
    date: "2026-09-27",
    original: issue,
    items,
    lead: "확인한 논문",
    analysis: "",
    snapshot: { review: null },
  }
  const digest = digestMarkdown(model, "https://example.org"),
    feed = feedDescription(model, "https://example.org")
  assert.equal(/오늘의 심층 분석|분석할 수|undefined/.test(digest + feed), false)
  assert.ok(digest.includes(draft.explanations[0].heading))
  const unreviewed = structuredClone(issue)
  unreviewed.meta.article_reviews[0].review_status = "unreviewed"
  unreviewed.meta.article_reviews[0].concept_ids = []
  assert.throws(() => extractArticles(unreviewed), /deep analysis needs/)
})
