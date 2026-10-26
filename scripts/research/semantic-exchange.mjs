// Read-only projection of native public notes. This is not semantic review/export.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseNote, sections, canonicalURL } from "../garden.mjs"
import { articleSearchText } from "../knowledge.mjs"
import { conceptRegistry } from "./knowledge-links.mjs"
import {
  articlePublicFingerprint,
  articleRelationRoles,
  assertArticleSemanticReviewIndex,
} from "../../web/article-semantic-index.mjs"

export const ARTIFACT_MANIFEST_SHA256 =
  "3f894b066246ac2e163b54e582068aa179bfa28baeed8563ae23f992d236a0fa"
export const WATCH_INPUTS = Object.freeze({
  notes: ["News", "Knowledge"],
  extension: ".md",
  index: "../data/article-semantic-review-index.json",
})
const selfFile = fileURLToPath(import.meta.url)
const implementationRoot = path.resolve(path.dirname(selfFile), "../..")
const vendorRoot = path.join(implementationRoot, "scripts/vendor/semantic-common/0.1.1")
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex")
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const serial = (value) => JSON.stringify(value)
const present = (value) => typeof value === "string" && !!value.trim()
const strings = (value) => Array.isArray(value) && value.every(present)
const inside = (root, file) => file === root || file.startsWith(root + path.sep)
const recordId = (sourceId, kind, nativeId) => `garden:${sourceId}:${kind}:${nativeId}`
const fingerprint = (profile, value) => ({ profile: "garden:" + profile, value })
const fingerprintValue = (record, profile) =>
  record?.provenance.fingerprints.find((f) => f.profile === "garden:" + profile)?.value
const unchangedRecord = (record, entry, producer) =>
  record &&
  record.provenance.path === entry.relative &&
  record.provenance.bytes_sha256 === entry.sha256 &&
  fingerprintValue(record, "producer/v1") === producer

export class SemanticExchangeError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
const fail = (code) => {
  throw new SemanticExchangeError(code)
}

function assertRealDirectory(directory) {
  if (!path.isAbsolute(directory) || path.resolve(directory) !== directory)
    fail("UNSAFE_SOURCE_PATH")
  const info = fs.lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(directory) !== directory)
    fail("UNSAFE_SOURCE_PATH")
  return directory
}

function boundedRead(file, limit = 4 * 1024 * 1024) {
  const named = fs.lstatSync(file)
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || named.size > limit)
    fail("UNSAFE_SOURCE_FILE")
  if (fs.realpathSync(file) !== file) fail("UNSAFE_SOURCE_PATH")
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0),
  )
  try {
    const opened = fs.fstatSync(fd)
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino)
      fail("SOURCE_CHANGED")
    const chunks = []
    let total = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - total))
      const size = fs.readSync(fd, chunk, 0, chunk.length, null)
      if (!size) break
      total += size
      if (total > limit) fail("INPUT_TOO_LARGE")
      chunks.push(chunk.subarray(0, size))
    }
    const bytes = Buffer.concat(chunks, total)
    const after = fs.fstatSync(fd)
    const current = fs.lstatSync(file)
    if (
      bytes.length > limit ||
      opened.size !== after.size ||
      opened.mtimeMs !== after.mtimeMs ||
      after.dev !== current.dev ||
      after.ino !== current.ino ||
      current.nlink !== 1 ||
      fs.realpathSync(file) !== file
    )
      fail("SOURCE_CHANGED")
    return bytes
  } finally {
    fs.closeSync(fd)
  }
}

function captureInputs(vault) {
  assertRealDirectory(vault)
  const entries = []
  let totalBytes = 0
  function visit(directory) {
    assertRealDirectory(directory)
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => compare(a.name, b.name))) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) fail("UNSAFE_SOURCE_PATH")
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) visit(file)
      } else if (entry.name.endsWith(".md")) {
        const bytes = boundedRead(file)
        totalBytes += bytes.length
        if (totalBytes > 64 * 1024 * 1024) fail("INPUT_TOO_LARGE")
        entries.push({
          relative: path.relative(vault, file).split(path.sep).join("/"),
          bytes,
          sha256: sha(bytes),
        })
      }
    }
  }
  for (const name of WATCH_INPUTS.notes) visit(path.join(vault, name))
  const indexFile = path.resolve(vault, WATCH_INPUTS.index)
  assertRealDirectory(path.dirname(indexFile))
  let indexBytes = null
  try {
    indexBytes = boundedRead(indexFile, 64 * 1024 * 1024)
    if (totalBytes + indexBytes.length > 64 * 1024 * 1024) fail("INPUT_TOO_LARGE")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    // Only an absent optional index is unreviewed. A missing source root is an error.
    assertRealDirectory(path.dirname(indexFile))
  }
  return {
    entries,
    indexBytes,
    sha256: sha(
      serial([
        ...entries.map((e) => [e.relative, e.sha256]),
        ["@public-semantic-index", indexBytes === null ? null : sha(indexBytes)],
      ]),
    ),
  }
}

// Pin the actual local reader import closure, adapter, dependency lock and common artifact.
// No operational native state or private source files are read here.
export function implementationFingerprint() {
  const files = new Map()
  function visit(file) {
    if (files.has(file)) return
    if (!inside(implementationRoot, file)) fail("UNSAFE_IMPLEMENTATION_PATH")
    const bytes = boundedRead(file)
    files.set(file, sha(bytes))
    if (!file.endsWith(".mjs") && !file.endsWith(".js")) return
    const source = bytes.toString("utf8")
    const imports = /\bfrom\s*["'](\.{1,2}\/[^"']+)["']|^\s*import\s*["'](\.{1,2}\/[^"']+)["']/gm
    for (const match of source.matchAll(imports))
      visit(path.resolve(path.dirname(file), match[1] || match[2]))
  }
  visit(selfFile)
  visit(path.join(implementationRoot, "package-lock.json"))
  visit(path.join(vendorRoot, "artifact-manifest.json"))
  const manifest = [...files]
    .map(([file, digest]) => [
      path.relative(implementationRoot, file).split(path.sep).join("/"),
      digest,
    ])
    .sort((a, b) => compare(a[0], b[0]))
  return { sha256: sha(serial(manifest)), script_sha256: files.get(selfFile), files: manifest }
}

async function commonRuntime() {
  const manifestBytes = boundedRead(path.join(vendorRoot, "artifact-manifest.json"))
  if (sha(manifestBytes) !== ARTIFACT_MANIFEST_SHA256) fail("COMMON_PIN_MISMATCH")
  const manifest = JSON.parse(manifestBytes)
  if (manifest.schema !== "semantic-common-artifact/v1" || manifest.version !== "0.1.1")
    fail("COMMON_PIN_MISMATCH")
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.resolve(vendorRoot, relative)
    if (!inside(vendorRoot, file)) fail("COMMON_PIN_MISMATCH")
    const bytes = boundedRead(file)
    if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256)
      fail("COMMON_PIN_MISMATCH")
  }
  return import(pathToFileURL(path.join(vendorRoot, "semantic-common.mjs")).href)
}

function publicURLs(value) {
  if (!strings(value) || !value.length) fail("INVALID_PUBLIC_SOURCE_URLS")
  for (const item of value) {
    const url = new URL(item)
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      /[\s\\\x00-\x1f\x7f]/.test(item) ||
      [...url.searchParams.keys()].some((key) =>
        /^(?:access_token|api_key|authorization|client_secret|password|token|signature)$/i.test(
          key,
        ),
      )
    )
      fail("UNSAFE_PUBLIC_SOURCE_URL")
  }
  return [...new Set(value)]
}

function nativeRegistry(vault, notes, oldById, sourceId, producer) {
  const registry = conceptRegistry(vault)
  const rows = registry
    .map((note) => {
      const relative = note.path + ".md"
      const entry = notes.get(relative)
      if (!entry || serial(note.meta) !== serial(entry.note.meta) || note.body !== entry.note.body)
        fail("SOURCE_CHANGED")
      const meta = note.meta
      const old = oldById.get(recordId(sourceId, "concept", meta.concept_id))
      const definition =
        old?.kind === "concept" && unchangedRecord(old, entry, producer)
          ? old.text
          : sections(note.body, 2)
              .find((section) => section.title === "한 문장 정의")
              ?.body.trim()
      if (
        meta.entry_type !== "concept" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.concept_id) ||
        !present(meta.title) ||
        !present(meta.label) ||
        !present(definition) ||
        definition === "없음" ||
        !present(meta.map_review.reason) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(meta.map_review.reviewed) ||
        !strings(meta.aliases || []) ||
        !strings(meta.keywords || [])
      )
        fail("INVALID_REVIEWED_CONCEPT")
      publicURLs(meta.verified_sources)
      // Exact native conceptSnapshot profile, including private metadata only in this hash input.
      return {
        concept_id: meta.concept_id,
        path: relative,
        title: meta.title,
        label: meta.label,
        aliases: meta.aliases || [],
        keywords: meta.keywords || [],
        kind: meta.map_review.kind,
        reason: meta.map_review.reason,
        definition,
        verified_sources: meta.verified_sources,
        sha256: entry.sha256,
      }
    })
    .sort((a, b) => a.concept_id.localeCompare(b.concept_id, "en"))
  if (new Set(rows.map((r) => r.concept_id)).size !== rows.length) fail("DUPLICATE_NATIVE_ID")
  return { rows, sha256: sha(serial(rows)), byId: new Map(rows.map((r) => [r.concept_id, r])) }
}

function provenance(entry, urls, extraFingerprints) {
  return {
    path: entry.relative,
    url: urls[0] || null,
    urls,
    bytes_sha256: entry.sha256,
    revision: "sha256:" + entry.sha256,
    fingerprints: extraFingerprints.sort((a, b) => compare(a.profile, b.profile)),
  }
}

function relation(sourceId, from, target, role, reason, nativeEvidence, extra = {}) {
  const nativeId = serial([from.kind, from.native_id, target.native_id, role])
  return {
    id: `garden:${sourceId}:relation:${sha(nativeId)}`,
    native_id: nativeId,
    source_id: from.id,
    target_id: target.id,
    predicate: role && from.kind === "article" ? "garden:" + role : "garden:associated",
    directed: !!role && from.kind === "article",
    status: "declared",
    basis: "explicit",
    reason,
    evidence_ids: [],
    native_type: role,
    native_directed: role ? true : null,
    native_basis: null,
    native_evidence_ids: [...new Set(nativeEvidence)],
    ...extra,
  }
}

export async function exportSemanticBundle({ root, output, sourceId, vault, beforePublish } = {}) {
  if (+process.versions.node.split(".")[0] < 22) fail("NODE_22_REQUIRED")
  if (
    !present(root) ||
    !present(output) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sourceId || "")
  )
    fail("INVALID_ARGUMENTS")
  root = path.resolve(root)
  if (root !== implementationRoot) fail("REGISTERED_ROOT_MISMATCH")
  vault = vault === undefined ? path.join(root, "vault") : path.resolve(vault)
  output = path.resolve(output)
  assertRealDirectory(root)
  assertRealDirectory(vault)
  // Output may never mutate the registered repository or a selected public source tree.
  if (
    inside(root, output) ||
    inside(path.dirname(vault), output) ||
    inside(output, root) ||
    inside(output, vault)
  )
    fail("OUTPUT_OVERLAPS_SOURCE")
  let ancestor = output
  while (!fs.existsSync(ancestor)) {
    if (fs.lstatSync(path.dirname(ancestor), { throwIfNoEntry: false })?.isSymbolicLink())
      fail("UNSAFE_OUTPUT_PATH")
    ancestor = path.dirname(ancestor)
  }
  assertRealDirectory(ancestor)
  const common = await commonRuntime()
  const implementation = implementationFingerprint()
  let previous = null
  const pointerFile = path.join(output, "current.json")
  if (fs.lstatSync(pointerFile, { throwIfNoEntry: false }))
    previous = common.loadBundle(output, { sourceId, requirePublic: true })
  const snapshot = captureInputs(vault)
  const notes = new Map(
    snapshot.entries.map((entry) => [
      entry.relative,
      { ...entry, note: parseNote(new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes)) },
    ]),
  )
  const oldById = new Map((previous?.bundle.records || []).map((record) => [record.id, record]))
  const registry = nativeRegistry(vault, notes, oldById, sourceId, implementation.sha256)
  const index =
    snapshot.indexBytes === null
      ? null
      : assertArticleSemanticReviewIndex(common.parseJSON(snapshot.indexBytes))
  const reviews = new Map((index?.reviews || []).map((review) => [review.event_id, review]))
  const records = [],
    relations = [],
    omissions = []
  const omit = (id, reason) => omissions.push({ record_id: id, reason })
  let projected = 0,
    reused = 0
  function reuseOrProject(entry, id, dependencies, create) {
    const key = sha(
      serial({
        path: entry.relative,
        bytes: entry.sha256,
        producer: implementation.sha256,
        dependencies,
      }),
    )
    const old = oldById.get(id)
    if (
      old &&
      old.provenance.bytes_sha256 === entry.sha256 &&
      fingerprintValue(old, "projection-input/v1") === key
    ) {
      reused++
      records.push(old)
      return old
    }
    const record = create([
      fingerprint("producer/v1", implementation.sha256),
      fingerprint("projection-input/v1", key),
    ])
    projected++
    records.push(record)
    return record
  }
  const concepts = new Map()
  for (const row of registry.rows) {
    const entry = notes.get(row.path)
    const record = reuseOrProject(
      entry,
      recordId(sourceId, "concept", row.concept_id),
      null,
      (prints) => ({
        id: recordId(sourceId, "concept", row.concept_id),
        native_id: row.concept_id,
        kind: "concept",
        title: row.title,
        text: row.definition,
        scope: row.kind,
        aliases: [...new Set([...(row.label === row.title ? [] : [row.label]), ...row.aliases])],
        provenance: provenance(entry, publicURLs(row.verified_sources), prints),
        review: {
          semantic: "unreviewed",
          evidence: "declared",
          currentness: "current",
          application: "not_applied",
          publication: "approved",
          native_status: "map_review:include",
        },
        evidence_ids: [],
      }),
    )
    concepts.set(row.concept_id, record)
  }
  for (const row of registry.rows) {
    const entry = notes.get(row.path)
    const from = concepts.get(row.concept_id)
    for (const [name, typed] of [
      ["relations", true],
      ["connections", false],
    ]) {
      const edges = entry.note.meta[name] || []
      if (!Array.isArray(edges)) fail("INVALID_NATIVE_RELATION")
      for (const edge of edges) {
        if (
          !present(edge.target) ||
          !present(edge.reason) ||
          (edge.evidence !== undefined && !strings(edge.evidence)) ||
          (typed && (!present(edge.type) || !["source", "inference"].includes(edge.basis)))
        )
          fail("INVALID_NATIVE_RELATION")
        if (edge.evidence?.length) publicURLs(edge.evidence)
        const target = concepts.get(edge.target)
        if (!target) {
          omit(from.id, "concept_relation_target_outside_reviewed_registry:" + edge.target)
          continue
        }
        relations.push(
          relation(
            sourceId,
            from,
            target,
            typed ? edge.type : null,
            edge.reason,
            edge.evidence || [],
            {
              basis: typed && edge.basis === "inference" ? "inferred" : "explicit",
              native_basis: typed ? edge.basis : null,
            },
          ),
        )
      }
    }
  }
  const publicIds = new Set()
  for (const entry of notes.values()) {
    const { meta, body } = entry.note
    if (
      !entry.relative.startsWith("News/") ||
      meta.type !== "news" ||
      meta.review_status === "excluded"
    )
      continue
    if (!/^[a-f0-9]{16}$/.test(meta.event_id || "")) fail("INVALID_NATIVE_ARTICLE_ID")
    if (publicIds.has(meta.event_id)) fail("DUPLICATE_NATIVE_ID")
    publicIds.add(meta.event_id)
    const id = recordId(sourceId, "article", meta.event_id)
    if (meta.review_status !== "verified") {
      omit(id, "unapproved_public_projection")
      continue
    }
    const urls = publicURLs(
      Array.isArray(meta.sources) ? meta.sources : meta.source_url ? [meta.source_url] : [],
    )
    const old = oldById.get(id)
    const oldPublicSha = fingerprintValue(old, "article-public/v1")
    const reuseText =
      old?.kind === "article" && unchangedRecord(old, entry, implementation.sha256) && oldPublicSha
    const text = reuseText
      ? old.text
      : [meta.title, articleSearchText(body)].filter(Boolean).join("\n")
    const publicSha = reuseText
      ? oldPublicSha
      : sha(
          articlePublicFingerprint({
            event_id: meta.event_id,
            title: meta.title,
            published_at: meta.published_at,
            source_urls: [...new Set(urls.map(canonicalURL))].sort(),
            prose: text,
          }),
        )
    const review = reviews.get(meta.event_id)
    let semantic = "unreviewed",
      currentness = "current",
      nativeStatus = "unreviewed",
      links = []
    const prints = [fingerprint("article-public/v1", publicSha)]
    if (review) {
      nativeStatus = review.status
      const hashes = [
        "semantic_input_sha256",
        "request_sha256",
        "result_sha256",
        "receipt_sha256",
        "article_public_sha256",
        "approval_files_sha256",
        "concept_registry_sha256",
        "policy_sha256",
      ]
      for (const key of hashes) prints.push(fingerprint("native-review/" + key, review[key]))
      prints.push(fingerprint("current-concept-registry/v1", registry.sha256))
      const stale =
        review.article_public_sha256 !== publicSha ||
        review.concept_registry_sha256 !== registry.sha256 ||
        review.links.some((link) => {
          const concept = registry.byId.get(link.concept_id)
          return (
            !concept || link.concept_path !== concept.path || link.concept_sha256 !== concept.sha256
          )
        })
      semantic = stale ? "unavailable" : review.status
      currentness = stale ? "stale" : "current"
      if (stale) omit(id, "semantic_review_fingerprint_mismatch")
      links = review.links.map((link) => ({ ...link, reviewed: true }))
    } else if (meta.semantic_review_status !== undefined || meta.concept_links !== undefined) {
      const direct = meta.concept_links || []
      if (
        !Array.isArray(direct) ||
        !["reviewed_links", "reviewed_none"].includes(meta.semantic_review_status) ||
        (meta.semantic_review_status === "reviewed_none" &&
          (direct.length || meta.concept_ids?.length)) ||
        (meta.semantic_review_status === "reviewed_links" &&
          (!direct.length ||
            serial(direct.map((l) => l.concept_id)) !== serial(meta.concept_ids || [])))
      )
        fail("INVALID_NATIVE_ARTICLE_RELATION")
      nativeStatus = meta.semantic_review_status
      links = direct
      omit(id, "native_role_review_without_bound_public_index")
    } else {
      if (meta.concept_ids !== undefined && !strings(meta.concept_ids))
        fail("INVALID_NATIVE_ARTICLE_RELATION")
      if (meta.concepts !== undefined && !strings(meta.concepts))
        fail("INVALID_NATIVE_ARTICLE_RELATION")
      const pathToId = new Map(
        registry.rows.map((r) => [r.path.replace(/\.md$/, ""), r.concept_id]),
      )
      const ids = [
        ...new Set([
          ...(meta.concept_ids || []),
          ...(meta.concepts || []).map((p) => pathToId.get(p) || p),
        ]),
      ]
      links = ids.map((concept_id) => ({
        concept_id,
        role: null,
        reason: "기존 공개 기사에 명시된 유형 없는 개념 지정이다.",
        evidence_claim_ids: [],
      }))
      nativeStatus = ids.length ? "legacy_untyped" : "unreviewed"
      omit(id, index ? "semantic_review_missing" : "semantic_index_missing")
    }
    const dependencies = {
      review: review || null,
      registry: review ? registry.sha256 : null,
      targets: links.map((link) => [link.concept_id, concepts.has(link.concept_id)]),
    }
    const record = reuseOrProject(entry, id, dependencies, (producerPrints) => ({
      id,
      native_id: meta.event_id,
      kind: "article",
      title: meta.title,
      text,
      scope: typeof meta.sector === "string" ? meta.sector : "",
      aliases: [],
      provenance: provenance(entry, urls, [...producerPrints, ...prints]),
      review: {
        semantic,
        evidence: "declared",
        currentness,
        application: "not_applied",
        publication: "approved",
        native_status: nativeStatus,
      },
      evidence_ids: [],
    }))
    const seen = new Set()
    for (const link of links) {
      if (
        !present(link.concept_id) ||
        seen.has(link.concept_id) ||
        (link.role !== null && !articleRelationRoles.includes(link.role)) ||
        (link.evidence_claim_ids !== undefined && !strings(link.evidence_claim_ids))
      )
        fail("INVALID_NATIVE_ARTICLE_RELATION")
      seen.add(link.concept_id)
      const target = concepts.get(link.concept_id)
      if (!target) {
        omit(id, "article_relation_target_outside_reviewed_registry:" + link.concept_id)
        continue
      }
      relations.push(
        relation(
          sourceId,
          record,
          target,
          link.role,
          link.reason || "기존 공개 기사에서 명시한 개념 역할이다.",
          link.evidence_claim_ids || [],
          { status: link.reviewed ? "reviewed" : "declared" },
        ),
      )
    }
  }
  for (const eventId of reviews.keys())
    if (!publicIds.has(eventId))
      omit(recordId(sourceId, "article", eventId), "public_semantic_review_without_current_article")
  const bundle = {
    schema: "semantic-bundle/v1",
    contract_version: "0.1.0",
    source: { id: sourceId, project: "garden" },
    normalization: "nfc-lf-space/v1",
    coverage: {
      status: omissions.length ? "partial" : "complete",
      inventory: "complete",
      omissions: [...new Map(omissions.map((o) => [serial(o), o])).values()].sort((a, b) =>
        compare(serial(a), serial(b)),
      ),
    },
    records: records.sort((a, b) => compare(a.id, b.id)),
    relations: relations.sort((a, b) => compare(a.id, b.id)),
    evidence: [],
  }
  common.validateBundle(bundle, { sourceId, requirePublic: true })
  if (beforePublish) await beforePublish()
  if (
    captureInputs(vault).sha256 !== snapshot.sha256 ||
    implementationFingerprint().sha256 !== implementation.sha256
  )
    fail("SOURCE_CHANGED")
  const changed = !previous || serial(previous.bundle) !== serial(bundle)
  const pointer = changed ? common.writeBundle(output, bundle) : previous.pointer
  const readback = common.loadBundle(output, { sourceId, requirePublic: true })
  if (serial(readback.pointer) !== serial(pointer)) fail("OUTPUT_CHANGED")
  const currentIds = new Set(records.map((record) => record.id))
  return {
    schema: "semantic-exchange-result/v1",
    status: changed ? "updated" : "unchanged",
    source_id: sourceId,
    contract_version: "0.1.0",
    artifact_manifest_sha256: ARTIFACT_MANIFEST_SHA256,
    implementation_sha256: implementation.sha256,
    script_sha256: implementation.script_sha256,
    source_snapshot_sha256: snapshot.sha256,
    pointer,
    coverage: bundle.coverage,
    counts: {
      records: records.length,
      relations: relations.length,
      projected,
      reused,
      deleted: [...oldById.keys()].filter((id) => !currentIds.has(id)).length,
    },
  }
}

function cliArguments(args) {
  if (args.shift() !== "export") fail("INVALID_ARGUMENTS")
  const values = {}
  const names = {
    "--root": "root",
    "--output": "output",
    "--source-id": "sourceId",
    "--vault": "vault",
  }
  while (args.length) {
    const name = names[args.shift()]
    const value = args.shift()
    if (!name || values[name] !== undefined || !present(value) || value.startsWith("--"))
      fail("INVALID_ARGUMENTS")
    values[name] = value
  }
  if (
    ["root", "output", "vault"].some(
      (name) => values[name] !== undefined && !path.isAbsolute(values[name]),
    )
  )
    fail("INVALID_ARGUMENTS")
  return values
}

if (process.argv[1] && path.resolve(process.argv[1]) === selfFile) {
  try {
    const result = await exportSemanticBundle(cliArguments(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(result) + "\n")
  } catch (error) {
    // Native parser/IO errors can contain private frontmatter or absolute paths.
    const code = error instanceof SemanticExchangeError ? error.code : "EXPORT_FAILED"
    process.stderr.write(JSON.stringify({ schema: "semantic-exchange-error/v1", code }) + "\n")
    process.exitCode = 1
  }
}
