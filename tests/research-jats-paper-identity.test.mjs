import test from "node:test"
import assert from "node:assert/strict"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { recordFactReview } from "../scripts/research/claims.mjs"
import { assertArticlePaperReview, recordDeepDiveReview } from "../scripts/research/deep-dive.mjs"

// Isolated synthetic producer-shaped parses; never operational reviews or gold.
const doi = "10.1234/study"
function fixture({
  url = "https://papers.example.org/PMC123/fullTextXML",
  reference = null,
  html = false,
} = {}) {
  const lines = [
    "The study identifies a scheduling problem." + (html ? ` arXiv:2609.12345v1 doi:${doi}` : ""),
    "The method schedules tasks using a learned policy.",
    "Tests use fixed workloads and the same hardware.",
    "The policy is compared with a rule-based scheduler.",
    "The study reports reduced task latency in these tests.",
    ...(reference ? [`References: doi:${reference}`] : []),
  ]
  const source_id = sourceId(url),
    body_sha256 = sha256(lines.join("\n")),
    source_version_id = `${source_id}:${body_sha256}`,
    parse_id = sha256(source_version_id + ":synthetic-parse")
  const document = {
    source_id,
    source_version_id,
    body_sha256,
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    observed_at: "2026-09-26T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id,
    source_version_id,
    parse_id,
    parser: html
      ? { id: "html", version: "synthetic" }
      : { id: "jats-xml", version: "frontiers-jats/v1" },
    metadata: html ? {} : { doi, identifiers: [{ type: "doi", value: doi }] },
    title: "Synthetic scheduling study",
    status: "extracted",
    dates: { published_at: "2026-09-02" },
    quality: { required_fields_present: true, missing_pages: [], missing_math: [] },
    blocks: lines.map((text, i) => ({
      block_id: `${parse_id}:b${i}`,
      kind: "paragraph",
      text,
      locator: {
        type: html ? "html" : "jats",
        text_hash: sha256(text),
        xml_path: `/article/body/sec/p[${i + 1}]`,
      },
    })),
  }
  const raw = lines.slice(0, 5).map((statement, i) => ({
    claim_id: sha256(url + statement + i).slice(0, 24),
    candidate_key: "synthetic-jats-study",
    statement,
    subject: "Research Lab",
    claim_kind: "attributed_fact",
    event_state: "reported",
    published_at: "2026-09-02",
    effective_period: null,
    numbers: [],
    evidence: [
      {
        source_id,
        source_version_id,
        parse_id,
        block_id: parse.blocks[i].block_id,
        quote: statement,
        support: "direct",
      },
    ],
  }))
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
      reason: "Synthetic contract review",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    review,
    [parse],
  )
  const ids = claims.map((c) => c.claim_id)
  const news = {
    schema: "article-paper-review/v1",
    reviewer: review.reviewer,
    reviewed_at: review.reviewed_at,
    papers: [
      {
        work_id: "synthetic-study",
        identifiers: [`doi:${doi}`],
        access: "전문",
        scope: "full_document",
        status: null,
        evidence_url: url,
        source_version_id,
        parse_id,
        claim_ids: [ids[0]],
        checks: {
          source_read: true,
          identity_and_version_checked: true,
          access_scope_checked: true,
          publication_status_checked: true,
        },
      },
    ],
  }
  const deep = {
    schema: "deep-dive-input/v1",
    kind: "논문 해설",
    topic_ids: ["scheduling-study"],
    event_claim_ids: [ids[0]],
    basis: ["problem", "method", "conditions", "comparison", "results"].map((role, i) => ({
      role,
      claim_ids: [ids[i]],
    })),
    sources: [
      {
        source_version_id,
        organization_id: "synthetic-publisher",
        organization_kind: "publisher",
        scope: "full_document",
      },
    ],
    papers: [
      {
        work_id: "synthetic-study",
        identifiers: [`doi:${doi}`],
        access: "전문",
        status: null,
        evidence_url: url,
        full_text_source_version_id: source_version_id,
        claim_ids: ids,
      },
    ],
    relations: [],
  }
  return { document, parse, documents: [document], parses: [parse], claims, news, deep, review }
}
const article = (s) =>
  assertArticlePaperReview(s.news, s.claims, s.parses, s.documents, "2026-09-28")
const deep = (s) => recordDeepDiveReview(s.deep, s.claims, s.parses, s.documents, s.review)
// Review each intentionally different synthetic parse before testing identity;
// otherwise the existing fact fingerprint correctly rejects it first.
function rereview(s) {
  const raw = s.claims.map(({ review, ...claim }) => claim)
  s.claims = recordFactReview(
    raw,
    raw.map((c) => ({
      claim_id: c.claim_id,
      status: "verified",
      reason: "Synthetic variant contract review",
      source_read: true,
      entailment_checked: true,
      identity_checked: true,
      numbers_checked: true,
      time_checked: true,
    })),
    s.review,
    s.parses,
  )
}
const unusedParse = (s) => {
  const parse = structuredClone(s.parse)
  parse.parse_id = sha256(parse.parse_id + ":unused")
  parse.blocks.forEach((b, i) => {
    b.block_id = `${parse.parse_id}:b${i}`
  })
  return parse
}

test("JATS article and deep paper identity use matching article-meta DOI fields without DOI text or URL", () => {
  const s = fixture(),
    before = structuredClone(s)
  assert.equal(
    s.parse.blocks.some((b) => b.text.includes(doi)),
    false,
  )
  assert.equal(s.document.original_url.includes(doi), false)
  assert.deepEqual(article(s)[0].identifiers, [`doi:${doi}`])
  assert.equal(article(s)[0].status, null)
  assert.equal(deep(s).input.papers[0].status, null)
  assert.deepEqual(s, before)
})

test("JATS DOI comparison normalizes case and outer whitespace without rewriting reviewed identifiers", () => {
  const s = fixture()
  s.parse.metadata.doi = " 10.1234/STUDY "
  s.parse.metadata.identifiers = [
    { type: "DOI", value: "10.1234/Study" },
    { type: "doi", value: doi },
  ]
  s.news.papers[0].identifiers = ["doi:10.1234/STUDY"]
  rereview(s)
  assert.deepEqual(article(s)[0].identifiers, ["doi:10.1234/STUDY"])
  assert.doesNotThrow(() => deep(s))
})

test("JATS rejects conflicting, malformed or absent structured DOI even when body references contain the requested DOI", () => {
  const mutations = [
    (m) => {
      m.doi = "10.1234/other"
    },
    (m) => {
      m.identifiers[0].value = "10.1234/other"
    },
    (m) => {
      m.identifiers.push({ type: "doi", value: "10.1234/other" })
    },
    (m) => {
      m.doi_candidates = [doi, "10.1234/other"]
    },
    (m) => {
      delete m.doi
    },
    (m) => {
      m.identifiers = []
    },
    (m) => {
      m.identifiers = [{ type: "reference-doi", value: doi }]
    },
    (m) => {
      m.doi = `https://doi.org/${doi}`
    },
    (m) => {
      m.doi = "10.1234/stu dy"
    },
    (m) => {
      m.doi = 42
    },
  ]
  for (const mutate of mutations) {
    const s = fixture({ reference: doi })
    mutate(s.parse.metadata)
    rereview(s)
    assert.throws(() => article(s), /identifier|DOI/i, String(mutate))
    assert.throws(() => deep(s), /identifier|DOI/i, String(mutate))
  }
})

test("JATS own DOI never identifies another paper cited in references, including a prefix DOI", () => {
  for (const foreign of ["10.1234/foreign", "10.1234/study-appendix", "10.1234/stu"]) {
    const s = fixture({ reference: foreign })
    s.news.papers[0].identifiers = [`doi:${foreign}`]
    s.deep.papers[0].identifiers = [`doi:${foreign}`]
    assert.throws(() => article(s), /identifier|DOI/i)
    assert.throws(() => deep(s), /identifier|DOI/i)
  }
})

test("arbitrary metadata and unrecognized parser contracts cannot supply paper DOI identity", () => {
  for (const mutate of [
    (p) => {
      p.parser.id = "html"
    },
    (p) => {
      p.parser.version = "unknown-jats/v2"
    },
    (p) => {
      delete p.parser
    },
    (p) => {
      p.metadata = { title: `doi:${doi}`, references: [doi] }
    },
  ]) {
    const s = fixture()
    mutate(s.parse)
    rereview(s)
    assert.throws(() => article(s), /identifier|DOI/i)
    assert.throws(() => deep(s), /identifier|DOI/i)
  }
})

test("structured DOI cannot be borrowed from another parse or source version", () => {
  for (const mismatch of ["unused-parse", "source-version", "source-id"]) {
    const s = fixture(),
      other = unusedParse(s)
    if (mismatch === "source-version")
      other.source_version_id = `${other.source_id}:${sha256("other bytes")}`
    if (mismatch === "source-id") other.source_id = sourceId("https://papers.example.org/other")
    s.parse.parser = { id: "html", version: "synthetic" }
    delete s.parse.metadata
    s.parses.push(other)
    rereview(s)
    assert.throws(() => article(s), /identifier|DOI/i)
    assert.throws(() => deep(s), /identifier|DOI/i)
  }
  const s = fixture()
  s.news.papers[0].parse_id = sha256("unselected-parse")
  assert.throws(() => article(s), /exact captured source and parse identity/i)
})

test("JATS identity does not bypass claim, full-text scope, URL or explicit publication checks", () => {
  for (const mutate of [
    (s) => {
      s.news.papers[0].claim_ids = ["unknown"]
    },
    (s) => {
      s.news.papers[0].scope = "abstract_only"
    },
    (s) => {
      s.news.papers[0].evidence_url += "/other"
    },
    (s) => {
      s.news.papers[0].identifiers.push("url:https://papers.example.org/other")
    },
    (s) => {
      s.news.papers[0].checks.publication_status_checked = false
    },
    (s) => {
      s.parse.quality.missing_math = [{ reason: "unresolved" }]
    },
    (s) => {
      s.parse.quality.required_fields_present = false
    },
    (s) => {
      s.parse.status = "partial"
    },
    (s) => {
      s.parse.quality.missing_pages = [2]
    },
  ]) {
    const s = fixture()
    mutate(s)
    assert.throws(
      () => {
        rereview(s)
        article(s)
      },
      undefined,
      String(mutate),
    )
  }
  for (const mutate of [
    (s) => {
      s.parse.status = "partial"
    },
    (s) => {
      s.parse.quality.missing_pages = [2]
    },
    (s) => {
      s.deep.sources[0].scope = "abstract_only"
    },
  ]) {
    const s = fixture()
    mutate(s)
    assert.throws(() => {
      rereview(s)
      deep(s)
    })
  }
})

test("peer-reviewed arXiv status can bind the same DOI from a used JATS publisher parse only", () => {
  const s = fixture({ url: "https://arxiv.org/html/2609.12345v1", html: true }),
    publisher = fixture()
  s.news.papers[0].identifiers.unshift("arxiv:2609.12345v1")
  s.news.papers[0].status = "동료심사"
  s.news.papers[0].publication_source_version_id = publisher.document.source_version_id
  s.documents.push(publisher.document)
  s.parses.push(publisher.parse)
  s.claims.push(...publisher.claims)
  assert.equal(article(s)[0].status, "동료심사")
  const other = unusedParse(publisher)
  publisher.parse.parser = { id: "html", version: "synthetic" }
  delete publisher.parse.metadata
  s.parses.push(other)
  rereview(s)
  assert.throws(() => article(s), /same DOI|publisher evidence/i)
})

test("changing JATS DOI metadata after fact review still invalidates the fact fingerprint", () => {
  const s = fixture()
  s.parse.metadata.doi = "10.1234/changed"
  assert.throws(() => article(s), /source parse changed after fact review/)
  assert.throws(() => deep(s), /source parse changed after fact review/)
})
