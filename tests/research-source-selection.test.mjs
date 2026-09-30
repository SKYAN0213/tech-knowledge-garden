import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { main } from "../scripts/research.mjs"
import {
  articleContentFingerprint,
  selectStoredSources,
  storeParseArtifact,
} from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { selectCandidateSource } from "../scripts/research/editorial-handoff.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "research-select-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const urls = ["https://example.org/admin", "https://example.org/chip?mode=V&id=1"]
  const documents = [],
    parses = []
  for (const [index, url] of urls.entries()) {
    const body = `Original article ${index}`,
      source_id = sourceId(url),
      body_sha256 = sha256(body),
      source_version_id = `${source_id}:${body_sha256}`,
      parse_id = sha256(`parse ${index}`)
    const document = {
      source_id,
      source_version_id,
      original_url: url,
      final_url: url,
      body_path: `documents/${source_id}/${body_sha256}/body.bin`,
      body_sha256,
      fetch_status: "captured",
      observed_at: "2026-09-28T00:00:00Z",
    }
    const parse = {
      schema_version: "source-parse/v1",
      source_id,
      source_version_id,
      parse_id,
      title: `Article ${index}`,
      status: "extracted",
      dates: { published_at: "2026-09-27", observed_at: document.observed_at },
      blocks: [{ block_id: `${parse_id}:b1`, text: body, locator: { text_hash: sha256(body) } }],
      quality: { missing_pages: [] },
    }
    atomicWrite(root, document.body_path, body)
    atomicWrite(root, `parses/${parse_id}/parse.json`, parse)
    documents.push(document)
    parses.push(parse)
  }
  atomicWrite(root, "runs/source/documents.json", documents)
  atomicWrite(root, "runs/source/parses.json", parses)
  return { root, urls, documents, parses }
}

test("article content fingerprint ignores raw-wrapper and parse identities but detects editorial changes", (t) => {
  const { parses } = fixture(t)
  const original = parses[0]
  const sameText = structuredClone(original)
  sameText.source_version_id = "new-source-version"
  sameText.parse_id = "new-parse-id"
  sameText.blocks[0].block_id = "new-parse-id:b1"
  assert.equal(articleContentFingerprint(original), articleContentFingerprint(sameText))
  sameText.blocks[0].text = "A different announcement"
  assert.notEqual(articleContentFingerprint(original), articleContentFingerprint(sameText))
  sameText.blocks[0].text = original.blocks[0].text
  sameText.dates.published_at = "2026-09-28"
  assert.notEqual(articleContentFingerprint(original), articleContentFingerprint(sameText))
})

test("exact source selection isolates one article without refetching or changing the source run", async (t) => {
  const { root, urls, documents, parses } = fixture(t)
  const before = fs.readFileSync(path.join(root, "runs/source/documents.json"))
  const selected = selectStoredSources(root, "source", [urls[1]])
  assert.deepEqual(selected.documents, [documents[1]])
  assert.deepEqual(selected.parses, [parses[1]])
  const args = [
    "select-source",
    "--root",
    root,
    "--run",
    "chip-only",
    "--source-run",
    "source",
    "--url",
    urls[1],
  ]
  assert.deepEqual(await main(args), { sources: 1, parses: 1, candidate_published: false })
  assert.deepEqual(await main(args), { sources: 1, parses: 1, candidate_published: false })
  assert.deepEqual(readJSON(root, "runs/chip-only/documents.json"), [documents[1]])
  assert.deepEqual(readJSON(root, "runs/chip-only/parses.json"), [parses[1]])
  assert.equal(readJSON(root, "runs/chip-only/source-selection.json").selected_urls[0], urls[1])
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/source/documents.json")), before)
  assert.equal(readJSON(root, "runs/chip-only/claims.json"), null)
})

test("editorial candidate selection uses only the exact observed source and parse", (t) => {
  const { root, urls, documents, parses } = fixture(t)
  const key = `source-${documents[1].source_id}`
  const content = articleContentFingerprint(parses[1])
  const candidate = {
    key,
    source_urls: ["https://example.org/chip?id=1&mode=V"],
    article_source_version_id: documents[1].source_version_id,
    article_parse_id: parses[1].parse_id,
    article_content_sha256: content,
    source_evidence_state: "exact",
    source_attempts: [
      {
        attempt_id: "source",
        article_source_version_id: documents[1].source_version_id,
        article_parse_id: parses[1].parse_id,
        article_content_sha256: content,
      },
    ],
  }
  const handoff = { schema: "research-editorial-handoff/v1", pending: [candidate] }
  const selected = selectCandidateSource(root, handoff, key)
  assert.equal(selected.source_attempt_id, "source")
  assert.deepEqual(selected.selected.documents, [documents[1]])
  assert.deepEqual(selected.selected.parses, [parses[1]])
  assert.throws(() => selectCandidateSource(root, handoff, "missing"), /not uniquely pending/)
  assert.throws(
    () =>
      selectCandidateSource(
        root,
        {
          ...handoff,
          pending: [{ ...candidate, source_evidence_state: "changed" }],
        },
        key,
      ),
    /were not observed/,
  )
  assert.throws(
    () =>
      selectCandidateSource(
        root,
        {
          ...handoff,
          pending: [{ ...candidate, article_parse_id: "different" }],
        },
        key,
      ),
    /no exact completed source attempt/,
  )
  fs.writeFileSync(path.join(root, documents[1].body_path), "corrupted")
  assert.throws(() => selectCandidateSource(root, handoff, key), /body hash mismatch/)
})

test("selection fails on a missing, duplicate, changed or corrupted source", async (t) => {
  const { root, urls, documents } = fixture(t)
  assert.throws(
    () => selectStoredSources(root, "source", ["https://example.org/missing"]),
    /one exact stored URL/,
  )
  assert.throws(() => selectStoredSources(root, "source", [urls[0], urls[0]]), /unique/)
  await main([
    "select-source",
    "--root",
    root,
    "--run",
    "selected",
    "--source-run",
    "source",
    "--url",
    urls[0],
  ])
  await assert.rejects(
    () =>
      main([
        "select-source",
        "--root",
        root,
        "--run",
        "selected",
        "--source-run",
        "source",
        "--url",
        urls[1],
      ]),
    /input changed/,
  )
  fs.writeFileSync(path.join(root, documents[0].body_path), "changed")
  assert.throws(() => selectStoredSources(root, "source", [urls[1]]), /body hash mismatch/)
})

test("a blocked neighbor remains recorded while an acquired source can be selected", (t) => {
  const { root, urls, documents, parses } = fixture(t)
  const blockedURL = "https://example.org/blocked"
  const blocked = {
    source_id: sourceId(blockedURL),
    source_version_id: null,
    original_url: blockedURL,
    fetch_status: "blocked",
    observed_at: "2026-09-28T00:00:00Z",
    policy_status: "failed",
  }
  atomicWrite(root, "runs/source/documents.json", [...documents, blocked])
  const selected = selectStoredSources(root, "source", [urls[0]])
  assert.deepEqual(selected.documents, [documents[0]])
  assert.deepEqual(selected.parses, [parses[0]])
  assert.throws(() => selectStoredSources(root, "source", [blockedURL]), /not acquired/)
  assert.equal(readJSON(root, "runs/source/documents.json").length, 3)
})

test("repeat observations share immutable parsed content without losing their own capture time", (t) => {
  const { root, urls, documents, parses } = fixture(t)
  const nextDocument = { ...documents[0], observed_at: "2026-09-29T00:00:00Z" }
  const nextParse = structuredClone(parses[0])
  nextParse.dates.observed_at = nextDocument.observed_at
  atomicWrite(root, "runs/reobserved/documents.json", [nextDocument])
  atomicWrite(root, "runs/reobserved/parses.json", [nextParse])
  assert.deepEqual(selectStoredSources(root, "reobserved", [urls[0]]).parses, [nextParse])
  assert.deepEqual(storeParseArtifact(root, nextParse), nextParse)
  assert.equal(
    readJSON(root, `parses/${nextParse.parse_id}/parse.json`).dates.observed_at,
    documents[0].observed_at,
  )
  const changed = structuredClone(nextParse)
  changed.title = "Changed article"
  assert.throws(() => storeParseArtifact(root, changed), /identity collision/)
  nextParse.dates.observed_at = "2026-09-30T00:00:00Z"
  atomicWrite(root, "runs/reobserved/parses.json", [nextParse])
  assert.throws(() => selectStoredSources(root, "reobserved", [urls[0]]), /observation/)
})
