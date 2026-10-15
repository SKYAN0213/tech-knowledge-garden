import fs from "node:fs"
import { canonicalURL } from "../garden.mjs"
import { sha256 } from "./contracts.mjs"
import { articleContentFingerprint, assertStoredEvidence, loadStoredSourceRun } from "./parser.mjs"
import { atomicWrite, readJSON, safePath, withLock } from "./run-state.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const titleBasis = (basis) => {
  const value = structuredClone(basis)
  // Newer parsers record an empty exclusion list explicitly. It describes the
  // same untouched header; nonempty exclusions must still match exactly.
  if (Array.isArray(value?.excluded) && value.excluded.length === 0) delete value.excluded
  return value
}
const indexPath = (document) =>
  `article-image-reviews/index/${document.source_id}/${document.body_sha256}.json`
const assetsKey = (assets) =>
  sha256(
    JSON.stringify(
      assets.map(({ url, dom_path, source_version_id }) => ({ url, dom_path, source_version_id })),
    ),
  )

// An index is only a lookup hint. Every use revalidates its immutable native
// binding, original bytes, review cells and parse derivations.
export function loadArticleImageReview(root, reference) {
  if (
    !/^runs\/[A-Za-z0-9_-]{1,100}\/article-image-source\.json$/.test(reference?.path || "") ||
    !/^[a-f0-9]{64}$/.test(reference.sha256 || "")
  )
    throw Error("Exact native article image review reference required")
  const bytes = fs.readFileSync(safePath(root, reference.path))
  if (sha256(bytes) !== reference.sha256) throw Error("Registered article image review changed")
  const binding = JSON.parse(bytes)
  const source = loadStoredSourceRun(root, reference.path.split("/")[1])
  const metadata = source.parses.filter((p) => p.parser?.id === "article-image-metadata")
  if (
    binding.source_document_complete !== true ||
    metadata.length !== 1 ||
    metadata[0].source_version_id !== source.documents[0]?.source_version_id
  )
    throw Error("Only a complete native article image review can be registered")
  articleContentFingerprint(metadata[0], source.parses)
  return { reference, binding, source, metadata: metadata[0] }
}

export async function registerArticleImageReview({ root, sourceRun }) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(sourceRun || ""))
    throw Error("Exact image source run required")
  const path = `runs/${sourceRun}/article-image-source.json`
  const reference = { path, sha256: sha256(fs.readFileSync(safePath(root, path))) }
  const reviewed = loadArticleImageReview(root, reference)
  const document = reviewed.source.documents[0]
  const entry = { key: assetsKey(reviewed.binding.assets), reference }
  return withLock(root, "article-image-review-" + document.source_id, () => {
    const file = indexPath(document)
    const index = readJSON(root, file) || {
      schema: "research-article-image-review-index/v1",
      source_version_id: document.source_version_id,
      entries: [],
    }
    validateIndex(index, document)
    const previous = index.entries.find((e) => e.key === entry.key)
    if (previous) {
      const existing = loadArticleImageReview(root, previous.reference)
      if (
        articleContentFingerprint(existing.metadata, existing.source.parses) !==
        articleContentFingerprint(reviewed.metadata, reviewed.source.parses)
      )
        throw Error(
          "A different review exists for these exact image versions; reconcile explicitly",
        )
      return {
        status: "registered",
        index_path: file,
        reference: previous.reference,
        reused: true,
        source_requests: 0,
        model_calls: 0,
      }
    }
    if (index.entries.length >= 100)
      throw Error("Image review history for this article version needs explicit reconciliation")
    atomicWrite(root, file, { ...index, entries: [...index.entries, entry] })
    return {
      status: "registered",
      index_path: file,
      reference,
      reused: false,
      source_requests: 0,
      model_calls: 0,
    }
  })
}

function validateIndex(index, document) {
  if (
    index?.schema !== "research-article-image-review-index/v1" ||
    index.source_version_id !== document.source_version_id ||
    !Array.isArray(index.entries) ||
    index.entries.length > 100 ||
    new Set(index.entries.map((e) => e.key)).size !== index.entries.length ||
    index.entries.some((e) => !/^[a-f0-9]{64}$/.test(e?.key || ""))
  )
    throw Error("Invalid article image review index")
}

export function matchingArticleImageReview(root, document, parsed, imageDocuments) {
  if (!/^[a-f0-9]{64}$/.test(document.body_sha256 || "")) return null
  const index = readJSON(root, indexPath(document))
  if (!index) return null
  validateIndex(index, document)
  const images = parsed.body_images || []
  if (
    images.length !== imageDocuments.length ||
    images.some(
      (image, i) =>
        image.url !== imageDocuments[i]?.original_url ||
        !["captured", "not_modified"].includes(imageDocuments[i]?.fetch_status),
    )
  )
    return null
  const key = assetsKey(
    images.map((image, i) => ({
      ...image,
      source_version_id: imageDocuments[i].source_version_id,
    })),
  )
  const entry = index.entries.find((e) => e.key === key)
  if (!entry) return null
  const reviewed = loadArticleImageReview(root, entry.reference)
  const original = readJSON(root, reviewed.binding.original_parse.path)
  if (
    assetsKey(reviewed.binding.assets) !== key ||
    original.source_version_id !== document.source_version_id ||
    canonicalURL(reviewed.source.documents[0].original_url) !==
      canonicalURL(document.original_url) ||
    original.title !== parsed.title ||
    original.dates?.published_at !== parsed.dates?.published_at ||
    !same(titleBasis(original.title_basis), titleBasis(parsed.title_basis)) ||
    !same(original.dates?.basis, parsed.dates?.basis) ||
    !same(original.body_images, parsed.body_images)
  )
    throw Error("Registered image review differs from the current article metadata or DOM")
  return reviewed
}

// Run copies keep the new observation while their content-addressed canonical
// parse and the original review timestamps stay unchanged.
export function reviewedArticleImageParses(root, reviewed, documents) {
  const parses = reviewed.source.parses.map((p) => {
    const document = documents.find((d) => d.source_version_id === p.source_version_id)
    if (!document) throw Error("Current observation is missing a reviewed image source")
    return {
      ...structuredClone(p),
      dates: { ...structuredClone(p.dates), observed_at: document.observed_at },
    }
  })
  assertStoredEvidence(root, documents, parses)
  return parses
}

export function verifyReviewedImageCandidate(root, scan, candidate, document, parsed) {
  const reviewed = loadArticleImageReview(root, candidate.article_image_review)
  const urls = reviewed.binding.assets.map((asset) => asset.url)
  if (
    parsed.parse_id !== reviewed.metadata.parse_id ||
    document.source_version_id !== reviewed.metadata.source_version_id ||
    !same(candidate.supporting_source_urls, urls)
  )
    throw Error("Image candidate differs from its exact native review binding")
  const documents = [
    document,
    ...urls.map((url) => {
      const matches = scan.documents.filter((d) => d.original_url === url)
      if (matches.length !== 1) throw Error("Image candidate needs each exact body source")
      return matches[0]
    }),
  ]
  const expected = reviewedArticleImageParses(root, reviewed, documents)
  if (
    expected.some(
      (p) =>
        !same(
          scan.parses.find((item) => item.parse_id === p.parse_id),
          p,
        ),
    ) ||
    candidate.article_content_sha256 !== articleContentFingerprint(parsed, expected)
  )
    throw Error("Image candidate lacks its reviewed current source observations")
  const details = scan.summary.details.filter(
    (d) =>
      d.parse_id === parsed.parse_id &&
      d.source_version_id === document.source_version_id &&
      d.url === document.original_url,
  )
  if (
    details.length !== 1 ||
    !same(details[0].article_image_review, candidate.article_image_review) ||
    details[0].status !== "source_parsed_unreviewed"
  )
    throw Error("Image candidate detail review reference changed")
  return true
}
