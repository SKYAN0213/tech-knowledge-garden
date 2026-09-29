import { DEEP_KINDS } from "../editorial.mjs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { assertVerifiedClaim } from "./claims.mjs"
import { assertReviewDate, parseResearchDate } from "./dates.mjs"
import { paperKey, reconcilePaperVersions } from "./knowledge-links.mjs"

const text = { type: "string", minLength: 1 }
const id = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }
const references = { type: "array", minItems: 1, items: text }
export const DEEP_ROLES = {
  "기업 전략": ["goal", "allocation", "comparison", "outcome"],
  "논문 해설": ["problem", "method", "conditions", "comparison", "results", "constraints"],
  "연구 사업화": ["research", "relationship", "product", "customers", "funding"],
}
const requiredRoles = {
  "기업 전략": ["goal", "allocation", "comparison"],
  "논문 해설": ["problem", "method", "conditions", "comparison", "results"],
  "연구 사업화": ["research", "relationship", "product"],
}
const paperSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "work_id",
    "identifiers",
    "access",
    "status",
    "evidence_url",
    "full_text_source_version_id",
    "claim_ids",
  ],
  properties: {
    work_id: id,
    identifiers: {
      type: "array",
      minItems: 1,
      items: {
        type: "string",
        pattern: "^(doi:10\\.\\S+|arxiv:\\d{4}\\.\\d{4,5}(v\\d+)?|url:https://[^\\s#]+)$",
      },
    },
    access: { type: "string", enum: ["전문"] },
    status: { type: ["string", "null"], enum: ["사전공개", "동료심사", null] },
    evidence_url: text,
    full_text_source_version_id: text,
    claim_ids: references,
  },
}
export const articlePaperReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "reviewer", "reviewed_at", "papers"],
  properties: {
    schema: { type: "string", enum: ["article-paper-review/v1"] },
    reviewer: text,
    reviewed_at: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    papers: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "work_id",
          "identifiers",
          "access",
          "scope",
          "status",
          "evidence_url",
          "source_version_id",
          "parse_id",
          "claim_ids",
          "checks",
        ],
        properties: {
          ...Object.fromEntries(
            ["work_id", "identifiers", "status", "evidence_url", "claim_ids"].map((key) => [
              key,
              paperSchema.properties[key],
            ]),
          ),
          access: { type: "string", enum: ["초록", "전문"] },
          scope: { type: "string", enum: ["abstract_only", "full_document"] },
          source_version_id: { type: "string", pattern: "^[a-f0-9]{20}:[a-f0-9]{64}$" },
          parse_id: { type: "string", pattern: "^[a-f0-9]{64}$" },
          publication_source_version_id: { type: "string", pattern: "^[a-f0-9]{20}:[a-f0-9]{64}$" },
          checks: {
            type: "object",
            additionalProperties: false,
            required: [
              "source_read",
              "identity_and_version_checked",
              "access_scope_checked",
              "publication_status_checked",
            ],
            properties: Object.fromEntries(
              [
                "source_read",
                "identity_and_version_checked",
                "access_scope_checked",
                "publication_status_checked",
              ].map((key) => [key, { type: "boolean", enum: [true] }]),
            ),
          },
        },
      },
    },
  },
}
const paperIdentityText = (document, parses) =>
  [
    document.original_url,
    ...parses
      .filter((p) => p.source_version_id === document.source_version_id)
      .flatMap((p) => p.blocks.map((b) => b.text)),
  ].join("\n")
const containsPaperIdentifier = (value, identifier) => {
  const literal = identifier
    .replace(/^(doi:|arxiv:|url:)/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![a-z0-9._-])${literal}(?![a-z0-9._-])`, "i").test(value)
}
function assertURLPaperIdentifiers(paper, document) {
  const urls = paper.identifiers.filter((value) => value.startsWith("url:"))
  for (const identifier of urls) {
    const key = paperKey(identifier)
    if (
      ![document.original_url, document.final_url].filter(Boolean).some((url) => {
        const parsed = new URL(url)
        return (
          parsed.protocol === "https:" &&
          !parsed.username &&
          !parsed.password &&
          !parsed.hash &&
          "url:" + parsed.toString() === key
        )
      })
    )
      throw Error("Paper URL identifier must equal the selected source")
  }
}
export function publicPaperMetadata(papers) {
  return papers.map((p) =>
    Object.fromEntries(
      ["work_id", "identifiers", "access", "status", "evidence_url"].map((key) => [key, p[key]]),
    ),
  )
}
// Independent paper references never supply deep-analysis eligibility. Source
// meaning and publication status are explicitly reviewed, not inferred here.
export function assertArticlePaperReview(review, claims, parses, documents, articleReviewedAt) {
  assertSchema(review, articlePaperReviewSchema)
  if (!review.reviewer.trim()) throw Error("Paper reviewer required")
  unique(
    review.papers.map((p) => p.work_id),
    "paper identities",
  )
  reconcilePaperVersions(review.papers)
  assertReviewDate(review.reviewed_at, { notBefore: claims.map((c) => c.review.reviewed_at) })
  assertReviewDate(articleReviewedAt, { notBefore: [review.reviewed_at] })
  for (const paper of review.papers) {
    const doc = documents.find((d) => d.source_version_id === paper.source_version_id)
    const parse = parses.find(
      (p) =>
        p.parse_id === paper.parse_id &&
        p.source_version_id === paper.source_version_id &&
        p.source_id === doc?.source_id,
    )
    if (
      !doc ||
      !parse ||
      !["captured", "not_modified"].includes(doc.fetch_status) ||
      paper.evidence_url !== doc.original_url
    )
      throw Error("Paper requires exact captured source and parse identity")
    unique(paper.claim_ids, "paper claim references")
    unique(paper.identifiers.map(paperKey), "paper identifiers")
    for (const claimId of paper.claim_ids) {
      const claim = claims.find((c) => c.claim_id === claimId)
      if (
        !claim ||
        !claim.evidence.some(
          (e) => e.source_version_id === paper.source_version_id && e.parse_id === paper.parse_id,
        )
      )
        throw Error("Paper reference requires a fact used in the article and the selected parse")
      assertVerifiedClaim(claim, parses)
    }
    assertReviewDate(review.reviewed_at, {
      notBefore: [doc.observed_at, parse.dates?.published_at],
    })
    if ((paper.access === "전문") !== (paper.scope === "full_document"))
      throw Error("Paper access and reviewed scope differ")
    if (
      paper.access === "전문" &&
      (parse.status !== "extracted" ||
        parse.quality?.required_fields_present !== true ||
        parse.quality?.missing_pages?.length ||
        parse.quality?.missing_math?.length)
    )
      throw Error("Full-text paper reference requires complete parsed evidence")
    const url = new URL(doc.original_url)
    const isArxiv = ["arxiv.org", "www.arxiv.org", "export.arxiv.org"].includes(url.hostname)
    if (isArxiv) {
      const version = /^\/(abs|html|pdf)\/(\d{4}\.\d{4,5})(v\d+)(?:\.pdf)?\/?$/.exec(url.pathname)
      if (
        !version ||
        !paper.identifiers.includes(`arxiv:${version[2]}${version[3]}`) ||
        paper.identifiers.some(
          (i) => i.startsWith("arxiv:") && i !== `arxiv:${version[2]}${version[3]}`,
        )
      )
        throw Error("Paper identifier must retain the exact arXiv source version")
      if (paper.access === "전문" && version[1] === "abs")
        throw Error("An arXiv abstract is not full-text evidence")
      if (paper.status === "동료심사" && !paper.publication_source_version_id)
        throw Error("Peer-reviewed arXiv paper requires publisher evidence")
    }
    assertURLPaperIdentifiers(paper, doc)
    if (paper.identifiers.some((i) => !containsPaperIdentifier(paperIdentityText(doc, [parse]), i)))
      throw Error("Paper identifier missing from the selected source")
    if (paper.publication_source_version_id) {
      const publisher = documents.find(
        (d) => d.source_version_id === paper.publication_source_version_id,
      )
      const publisherClaims = claims.filter((c) =>
        c.evidence.some((e) => e.source_version_id === paper.publication_source_version_id),
      )
      const dois = paper.identifiers.filter((i) => i.startsWith("doi:"))
      if (
        !publisher ||
        !publisherClaims.length ||
        !["captured", "not_modified"].includes(publisher.fetch_status) ||
        /(^|\.)arxiv\.org$/.test(new URL(publisher.original_url).hostname) ||
        !dois.length ||
        dois.some((i) => !containsPaperIdentifier(paperIdentityText(publisher, parses), i))
      )
        throw Error("Paper publication status requires used publisher evidence of the same DOI")
      for (const claim of publisherClaims) assertVerifiedClaim(claim, parses)
      assertReviewDate(review.reviewed_at, { notBefore: [publisher.observed_at] })
    }
  }
  return publicPaperMetadata(review.papers)
}
const relationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "person_id",
    "person_name",
    "affiliation",
    "organization",
    "role",
    "claim",
    "as_of",
    "evidence_urls",
    "claim_ids",
  ],
  properties: {
    person_id: id,
    person_name: text,
    affiliation: text,
    organization: text,
    role: {
      type: "string",
      enum: ["공동저자", "기술자문", "기술이전", "공동창업", "창업", "소속"],
    },
    claim: text,
    as_of: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    evidence_urls: { type: "array", minItems: 1, items: text },
    claim_ids: references,
  },
}
export const deepDiveInputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "kind",
    "topic_ids",
    "event_claim_ids",
    "basis",
    "sources",
    "papers",
    "relations",
  ],
  properties: {
    schema: { type: "string", enum: ["deep-dive-input/v1"] },
    kind: { type: "string", enum: DEEP_KINDS },
    topic_ids: { type: "array", minItems: 1, items: id },
    event_claim_ids: references,
    basis: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "claim_ids"],
        properties: {
          role: { type: "string", enum: [...new Set(Object.values(DEEP_ROLES).flat())] },
          claim_ids: references,
        },
      },
    },
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_version_id", "organization_id", "organization_kind", "scope"],
        properties: {
          source_version_id: text,
          organization_id: id,
          organization_kind: {
            type: "string",
            enum: [
              "company",
              "university",
              "research_institution",
              "publisher",
              "regulator",
              "other",
            ],
          },
          scope: { type: "string", enum: ["full_document", "abstract_only", "partial"] },
        },
      },
    },
    papers: { type: "array", items: paperSchema },
    relations: { type: "array", items: relationSchema },
  },
}

const unique = (values, label) => {
  if (new Set(values).size !== values.length) throw Error("Unique deep-dive " + label + " required")
}
export const deepClaimIds = (input) => [
  ...new Set([
    ...input.event_claim_ids,
    ...input.basis.flatMap((b) => b.claim_ids),
    ...input.papers.flatMap((p) => p.claim_ids),
    ...input.relations.flatMap((r) => r.claim_ids),
  ]),
]

function validateInput(input, claims, parses, documents) {
  assertSchema(input, deepDiveInputSchema)
  unique(
    claims.map((c) => c.claim_id),
    "claim identities",
  )
  unique(input.topic_ids, "topic identities")
  unique(
    input.basis.map((b) => b.role),
    "basis roles",
  )
  unique(
    input.sources.map((s) => s.source_version_id),
    "source versions",
  )
  const roles = new Set(input.basis.map((b) => b.role))
  if (
    input.basis.some((b) => !DEEP_ROLES[input.kind].includes(b.role)) ||
    requiredRoles[input.kind].some((role) => !roles.has(role))
  )
    throw Error("Required evidence roles missing for " + input.kind)
  const byId = new Map(claims.map((c) => [c.claim_id, c]))
  for (const ids of [
    input.event_claim_ids,
    ...input.basis.map((b) => b.claim_ids),
    ...input.papers.map((p) => p.claim_ids),
    ...input.relations.map((r) => r.claim_ids),
  ])
    unique(ids, "fact references")
  const used = deepClaimIds(input).map((id) => {
    const claim = byId.get(id)
    if (!claim) throw Error("Unknown deep-dive claim reference")
    return assertVerifiedClaim(claim, parses)
  })
  const versions = new Set(used.flatMap((c) => c.evidence.map((e) => e.source_version_id)))
  if (
    versions.size !== input.sources.length ||
    input.sources.some((s) => !versions.has(s.source_version_id))
  )
    throw Error("Deep-dive source roles must match referenced evidence")
  const docs = new Map(documents.map((d) => [d.source_version_id, d]))
  unique(
    documents.map((d) => d.source_version_id),
    "stored documents",
  )
  for (const source of input.sources) {
    const doc = docs.get(source.source_version_id)
    if (
      !doc ||
      !["captured", "not_modified"].includes(doc.fetch_status) ||
      !doc.body_sha256 ||
      !used.some((c) =>
        c.evidence.some(
          (e) => e.source_version_id === source.source_version_id && e.source_id === doc.source_id,
        ),
      )
    )
      throw Error("Acquired deep-dive evidence document required")
    if (
      source.scope === "full_document" &&
      !parses.some(
        (p) =>
          p.source_version_id === source.source_version_id &&
          p.status === "extracted" &&
          !p.quality?.missing_pages?.length,
      )
    )
      throw Error("Full-document scope requires complete extracted source")
    if (
      source.scope === "full_document" &&
      used.some((c) =>
        c.evidence.some(
          (e) =>
            e.source_version_id === source.source_version_id &&
            parses.some(
              (p) =>
                p.parse_id === e.parse_id &&
                (p.status !== "extracted" || p.quality?.missing_pages?.length),
            ),
        ),
      )
    )
      throw Error("Full-document facts cannot use partial source parses")
  }
  const evidenceVersions = (ids) =>
    new Set(ids.flatMap((id) => byId.get(id).evidence.map((e) => e.source_version_id)))
  if (input.kind === "기업 전략") {
    const ids = input.basis.find((b) => b.role === "comparison").claim_ids
    const compared = evidenceVersions(ids)
    const dates = new Set(
      parses
        .filter((p) => compared.has(p.source_version_id))
        .map((p) => parseResearchDate(p.dates?.published_at)?.day)
        .filter(Boolean),
    )
    if (compared.size < 2 || dates.size < 2)
      throw Error("Strategy comparison needs distinct dated source evidence")
    if (input.sources.some((s) => !["company", "regulator"].includes(s.organization_kind)))
      throw Error("Strategy basis requires reviewed company or filing sources")
  }
  reconcilePaperVersions(input.papers)
  unique(
    input.papers.map((p) => p.work_id),
    "paper identities",
  )
  for (const paper of input.papers) {
    const source = input.sources.find(
      (s) => s.source_version_id === paper.full_text_source_version_id,
    )
    const doc = docs.get(paper.full_text_source_version_id)
    if (
      !source ||
      source.scope !== "full_document" ||
      !["publisher", "university", "research_institution"].includes(source.organization_kind) ||
      !doc ||
      paper.evidence_url !== doc.original_url ||
      !evidenceVersions(paper.claim_ids).has(source.source_version_id)
    )
      throw Error("Paper analysis requires reviewed full-text evidence")
    assertURLPaperIdentifiers(paper, doc)
    const content = [
      doc.original_url,
      ...parses
        .filter((p) => p.source_version_id === source.source_version_id)
        .flatMap((p) => p.blocks.map((b) => b.text)),
    ]
      .join("\n")
      .toLowerCase()
    if (
      paper.identifiers.some(
        (identifier) =>
          !content.includes(identifier.replace(/^(doi:|arxiv:|url:)/, "").toLowerCase()),
      )
    )
      throw Error("Paper identifier missing from its source")
  }
  if (input.kind === "논문 해설") {
    if (!input.papers.length) throw Error("Deep paper requires full-text paper metadata")
    const full = new Set(input.papers.map((p) => p.full_text_source_version_id))
    if (
      input.basis.some(
        (b) =>
          !b.claim_ids.some((id) =>
            byId.get(id).evidence.some((e) => full.has(e.source_version_id)),
          ),
      )
    )
      throw Error("Paper explanation roles require full-text facts")
  }
  const people = new Map()
  for (const relation of input.relations) {
    if (!parseResearchDate(relation.as_of) || parseResearchDate(relation.as_of).precision !== "day")
      throw Error("Valid relationship date required")
    if (people.has(relation.person_id) && people.get(relation.person_id) !== relation.person_name)
      throw Error("Person identity conflict in deep-dive relationships")
    people.set(relation.person_id, relation.person_name)
    const relatedVersions = evidenceVersions(relation.claim_ids)
    const evidenceDocs = [...relatedVersions].map((version) => docs.get(version))
    const allowedURLs = new Set(evidenceDocs.map((d) => d.original_url))
    unique(relation.evidence_urls, "relationship URLs")
    if (relation.evidence_urls.some((url) => !allowedURLs.has(url)))
      throw Error("Relationship URL must have claim evidence")
    if (["창업", "공동창업", "기술이전"].includes(relation.role)) {
      const relatedSources = input.sources.filter(
        (s) =>
          relatedVersions.has(s.source_version_id) &&
          relation.evidence_urls.includes(docs.get(s.source_version_id).original_url),
      )
      const universities = relatedSources.filter((s) =>
        ["university", "research_institution"].includes(s.organization_kind),
      )
      const companies = relatedSources.filter((s) => s.organization_kind === "company")
      if (
        !universities.some((u) =>
          companies.some(
            (c) =>
              u.organization_id !== c.organization_id &&
              new URL(docs.get(u.source_version_id).original_url).hostname !==
                new URL(docs.get(c.source_version_id).original_url).hostname,
          ),
        )
      )
        throw Error(
          "Commercialization relationship requires distinct university and company evidence, including a reviewed research institution",
        )
    }
  }
  if (
    input.kind === "연구 사업화" &&
    !input.relations.some((r) => ["창업", "공동창업", "기술이전"].includes(r.role))
  )
    throw Error(
      "Commercialization requires an explicit founding or technology-transfer relationship",
    )
  return used
}

const fingerprints = (input, used, parses, documents) => {
  const versions = new Set(input.sources.map((s) => s.source_version_id))
  return {
    input_sha256: sha256(JSON.stringify(input)),
    claims_sha256: sha256(
      JSON.stringify([...used].sort((a, b) => a.claim_id.localeCompare(b.claim_id))),
    ),
    parses_sha256: sha256(
      JSON.stringify(
        parses
          .filter((p) => versions.has(p.source_version_id))
          .sort((a, b) => a.parse_id.localeCompare(b.parse_id)),
      ),
    ),
    documents_sha256: sha256(
      JSON.stringify(
        documents
          .filter((d) => versions.has(d.source_version_id))
          .sort((a, b) => a.source_version_id.localeCompare(b.source_version_id)),
      ),
    ),
  }
}
const checks = [
  "source_read",
  "source_roles_checked",
  "basis_checked",
  "identities_checked",
  "scope_checked",
]
function assertReview(review, input, used, documents) {
  if (!review?.reviewer?.trim() || checks.some((key) => review[key] !== true))
    throw Error("Explicit deep-dive source, scope, basis and identity review required")
  assertReviewDate(review.reviewed_at, {
    notBefore: [
      ...used.map((c) => c.review.reviewed_at),
      ...documents
        .filter((d) => input.sources.some((s) => s.source_version_id === d.source_version_id))
        .map((d) => d.observed_at),
      ...input.relations.map((r) => r.as_of),
    ],
  })
}
export function recordDeepDiveReview(input, claims, parses, documents, review) {
  const used = validateInput(input, claims, parses, documents)
  assertReview(review, input, used, documents)
  return {
    schema: "deep-dive-context/v1",
    input: structuredClone(input),
    review: Object.fromEntries(
      ["reviewer", "reviewed_at", ...checks].map((key) => [key, review[key]]),
    ),
    fingerprints: fingerprints(input, used, parses, documents),
  }
}
export function assertDeepDiveContext(context, claims, parses, documents) {
  if (context?.schema !== "deep-dive-context/v1") throw Error("Reviewed deep-dive context required")
  const used = validateInput(context.input, claims, parses, documents)
  assertReview(context.review, context.input, used, documents)
  if (
    JSON.stringify(context.fingerprints) !==
    JSON.stringify(fingerprints(context.input, used, parses, documents))
  )
    throw Error("Deep-dive context or evidence changed after review")
  return used
}
export function publicDeepMetadata(input) {
  return {
    kind: input.kind,
    topic_ids: [...input.topic_ids],
    papers: publicPaperMetadata(input.papers),
    relations: input.relations.map((r) =>
      Object.fromEntries(
        [
          "person_id",
          "person_name",
          "affiliation",
          "organization",
          "role",
          "claim",
          "as_of",
          "evidence_urls",
        ].map((key) => [key, r[key]]),
      ),
    ),
  }
}
