import fs from "node:fs"
import { assertParse, sha256 } from "./contracts.mjs"
import { samePublicationDate, parseResearchDate } from "./dates.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"
import { loadStoredSourceRun } from "./parser.mjs"

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const validRun = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(s)
const readingBindings = new Set()
const pin = (root, path) => ({ path, sha256: sha256(fs.readFileSync(safePath(root, path))) })
const readPinned = (root, ref) => {
  if (!/^parses\/[a-f0-9]{64}\/parse\.json$/.test(ref?.path || ""))
    throw Error("Exact original article parse reference required")
  const bytes = fs.readFileSync(safePath(root, ref.path))
  if (sha256(bytes) !== ref.sha256) throw Error("Article metadata original parse changed")
  const parent = JSON.parse(bytes)
  if (ref.path !== `parses/${parent.parse_id}/parse.json`)
    throw Error("Article parse path mismatch")
  return parent
}

// Metadata is independent evidence. Never paste image values into an HTML
// source block or transfer the page's publication date to the image parse.
export function projectArticleImageMetadata(parent, parser) {
  assertParse(parent)
  const title = parent.title_basis,
    date = parent.dates?.basis,
    images = parent.body_images
  if (
    parent.parser?.id === "article-image-metadata" ||
    parent.status !== "partial" ||
    parent.blocks.length ||
    parent.title_profile_status !== "matched" ||
    title?.type !== "html" ||
    !title.dom_path ||
    title.text !== parent.title ||
    title.text_hash !== sha256(parent.title) ||
    parent.dates?.profile_status !== "matched" ||
    !date?.dom_path ||
    !date.text ||
    !parseResearchDate(parent.dates.published_at) ||
    !samePublicationDate(parent.dates.published_at, date.text) ||
    !Array.isArray(images) ||
    !images.length ||
    images.length > 7 ||
    new Set(images.map((i) => i.url)).size !== images.length ||
    images.some(
      (i) => !/^https?:\/\//.test(i.url || "") || typeof i.dom_path !== "string" || !i.dom_path,
    )
  )
    throw Error(
      "Matched image-only HTML title, publication evidence and body image positions required",
    )
  const parseId = sha256(JSON.stringify([parent.source_version_id, parser, "local-research/v1"]))
  const blocks = [
    { kind: "heading", text: title.text, locator: structuredClone(title) },
    {
      kind: "metadata",
      text: date.text,
      locator: { type: "html", ...structuredClone(date), text_hash: sha256(date.text) },
    },
  ].map((b, i) => ({ block_id: `${parseId}:block-${String(i + 1).padStart(4, "0")}`, ...b }))
  return assertParse({
    schema_version: "source-parse/v1",
    source_id: parent.source_id,
    source_version_id: parent.source_version_id,
    parse_id: parseId,
    parser,
    status: "partial",
    title: parent.title,
    title_basis: structuredClone(title),
    title_profile_status: parent.title_profile_status,
    language: parent.language,
    dates: structuredClone(parent.dates),
    blocks,
    links: [],
    attachments: [],
    body_images: structuredClone(images),
    quality: {
      required_fields_present: false,
      reviewed: false,
      missing_pages: [...(parent.quality?.missing_pages || [])],
      metadata_only: true,
      source_document_complete: false,
    },
  })
}

export function loadArticleImageMetadataDependencies(root, parse) {
  const parser = parse.parser
  if (parser?.id !== "article-image-metadata") return []
  if (parser.version !== "1" || !/^[a-f0-9]{64}$/.test(parser.adapter_sha256 || ""))
    throw Error("Native article metadata derivation required")
  const parent = readPinned(root, parser.parent_parse)
  if (parser.config_hash !== sha256(JSON.stringify(parent.body_images)))
    throw Error("Original article body image positions changed")
  const expected = projectArticleImageMetadata(parent, parser)
  expected.dates.observed_at = parse.dates?.observed_at
  if (!same(expected, parse)) throw Error("Article metadata differs from original evidence")
  return [parser.parent_parse]
}

function sourceIdentity(run, documents, parses) {
  return {
    source_run: run,
    documents_sha256: sha256(JSON.stringify(documents)),
    parses_sha256: sha256(JSON.stringify(parses)),
  }
}

export function prepareArticleImageSource({ root, run, sourceRun, parseId, imageRuns }) {
  const metadataRun = `${run}-meta`
  if (
    !validRun(run) ||
    !validRun(metadataRun) ||
    !validRun(sourceRun) ||
    !Array.isArray(imageRuns) ||
    !imageRuns.length ||
    imageRuns.length > 7 ||
    imageRuns.some((r) => !validRun(r)) ||
    new Set([run, metadataRun, sourceRun, ...imageRuns]).size !== imageRuns.length + 3
  )
    throw Error("Distinct article, metadata and selected image source runs required")
  const source = loadStoredSourceRun(root, sourceRun, { allowUnacquired: true })
  const parents = source.parses.filter((p) => p.parse_id === parseId)
  if (parents.length !== 1) throw Error("One exact original image-only article parse required")
  const parent = parents[0],
    document = source.documents.find((d) => d.source_version_id === parent.source_version_id)
  if (!/^text\/html(?:;|$)/i.test(document?.mime_type || ""))
    throw Error("Original HTML article required")
  const parentRef = pin(root, `parses/${parent.parse_id}/parse.json`)
  if (!same(readPinned(root, parentRef), parent))
    throw Error("Original article canonical parse differs")
  // A completed run pins its original adapter identity. Code upgrades do not
  // rewrite immutable metadata or make the same native input a new candidate.
  const savedMetadata = readJSON(root, `runs/${metadataRun}/parses.json`)
  if (savedMetadata && (!Array.isArray(savedMetadata) || savedMetadata.length !== 1))
    throw Error("One immutable article metadata parse required")
  const parser = savedMetadata?.[0]?.parser || {
    id: "article-image-metadata",
    version: "1",
    parent_parse: parentRef,
    config_hash: sha256(JSON.stringify(parent.body_images)),
    adapter_sha256: sha256(fs.readFileSync(new URL(import.meta.url))),
  }
  if (
    parser.id !== "article-image-metadata" ||
    parser.version !== "1" ||
    !same(parser.parent_parse, parentRef) ||
    parser.config_hash !== sha256(JSON.stringify(parent.body_images)) ||
    !/^[a-f0-9]{64}$/.test(parser.adapter_sha256 || "")
  )
    throw Error("Article metadata parser differs from its pinned original")
  const metadata = projectArticleImageMetadata(parent, parser)
  const images = imageRuns.map((r) => loadStoredSourceRun(root, r))
  if (images.length !== parent.body_images.length)
    throw Error("All declared body image sources must be explicitly selected")
  const assets = parent.body_images.map((image, i) => {
    const stored = images[i],
      d = stored.documents[0],
      p = stored.parses[0]
    if (
      stored.documents.length !== 1 ||
      stored.parses.length !== 1 ||
      d.original_url !== image.url ||
      !/^image\/(png|jpeg)(?:;|$)/i.test(d.mime_type || "") ||
      p.source_version_id !== d.source_version_id ||
      p.quality?.source_format !== "raster-image" ||
      !p.blocks.length ||
      p.dates?.published_at != null
    )
      throw Error("Exact independent PNG/JPEG body source and unchanged image dates required")
    return {
      source_identity: stored.identity,
      url: image.url,
      dom_path: image.dom_path,
      source_version_id: d.source_version_id,
      parse_id: p.parse_id,
    }
  })
  const documents = [document, ...images.map((s) => s.documents[0])],
    parses = [metadata, ...images.map((s) => s.parses[0])]
  const bodyComplete = images.every(
    (s) =>
      s.parses[0].status === "extracted" &&
      s.parses[0].quality?.required_fields_present === true &&
      s.parses[0].quality?.source_document_complete === true &&
      s.parses[0].parser?.id === "reviewed-raster-table" &&
      s.parses[0].quality?.coverage_review?.scope === "whole-image",
  )
  const identity = sourceIdentity(run, documents, parses)
  const metadataIdentity = sourceIdentity(metadataRun, [document], [metadata])
  const bundle = {
    schema: "research-source-bundle/v1",
    source_runs: [metadataIdentity, ...images.map((s) => s.identity)],
    documents_sha256: identity.documents_sha256,
    parses_sha256: identity.parses_sha256,
    candidate_published: false,
  }
  const binding = {
    schema: "research-article-image-source/v1",
    run_id: run,
    original_source: source.identity,
    original_parse: parentRef,
    metadata_run: metadataRun,
    assets,
    documents_sha256: identity.documents_sha256,
    parses_sha256: identity.parses_sha256,
    source_document_complete: bodyComplete && !parent.quality?.missing_pages?.length,
    candidate_approved: false,
    candidate_published: false,
  }
  const files = {
    [`parses/${metadata.parse_id}/parse.json`]: metadata,
    [`runs/${metadataRun}/input.json`]: {
      command: "article-image-metadata",
      original_source: source.identity,
      original_parse: parentRef,
    },
    [`runs/${metadataRun}/documents.json`]: [document],
    [`runs/${metadataRun}/parses.json`]: [metadata],
    [`runs/${run}/input.json`]: {
      command: "article-image-source",
      binding_sha256: sha256(JSON.stringify(binding)),
    },
    [`runs/${run}/documents.json`]: documents,
    [`runs/${run}/parses.json`]: parses,
    [`runs/${run}/source-bundle.json`]: bundle,
    [`runs/${run}/article-image-source.json`]: binding,
  }
  for (const [file, value] of Object.entries(files)) {
    const previous = readJSON(root, file)
    if (previous && !same(previous, value))
      throw Error("Article image destination changed; use a new run: " + file)
  }
  return {
    files,
    binding,
    documents,
    parses,
    identity,
    reused: Object.keys(files).every((f) => readJSON(root, f)),
  }
}

export function assertArticleImageSource(root, run, stored) {
  const binding = readJSON(root, `runs/${run}/article-image-source.json`)
  if (!binding) return
  if (binding.schema !== "research-article-image-source/v1" || binding.run_id !== run)
    throw Error("Native article body image binding required")
  const key = `${fs.realpathSync(root)}:${run}`
  if (readingBindings.has(key) || readingBindings.size >= 8)
    throw Error("Cyclic article body image binding")
  readingBindings.add(key)
  try {
    const expected = prepareArticleImageSource({
      root,
      run,
      sourceRun: binding.original_source?.source_run,
      parseId: binding.original_parse?.path?.split("/")[1],
      imageRuns: binding.assets?.map((a) => a.source_identity?.source_run),
    })
    if (
      !same(expected.binding, binding) ||
      !same(expected.documents, stored.documents) ||
      !same(expected.parses, stored.parses)
    )
      throw Error("Article body image binding changed")
  } finally {
    readingBindings.delete(key)
  }
}

export async function createArticleImageSource(options) {
  if (!validRun(options.run)) throw Error("Safe article image run required")
  return withLock(options.root, `run-${options.run}`, () => {
    const prepared = prepareArticleImageSource(options)
    for (const [file, value] of Object.entries(prepared.files))
      if (!readJSON(options.root, file)) atomicCreate(options.root, file, value)
    loadStoredSourceRun(options.root, options.run)
    return {
      run: options.run,
      source_identity: prepared.identity,
      reused: prepared.reused,
      image_sources: prepared.binding.assets.length,
      source_document_complete: prepared.binding.source_document_complete,
      candidate_approved: false,
      candidate_published: false,
      source_requests: 0,
      model_calls: 0,
    }
  })
}
