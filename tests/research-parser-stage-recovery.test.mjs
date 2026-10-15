import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { loadCapturedStagesForReparse } from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite, readJSON, RunState } from "../scripts/research/run-state.mjs"

const repo = fileURLToPath(new URL("../", import.meta.url))

function setup(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "parser-stage-recovery-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function capture(root, url, text = "Original source text.") {
  const bytes = Buffer.from(text),
    id = sourceId(url),
    hash = sha256(bytes)
  const document = {
    schema_version: "source-document/v1",
    source_id: id,
    source_version_id: `${id}:${hash}`,
    original_url: url,
    final_url: url,
    body_path: `documents/${id}/${hash}/body.bin`,
    body_sha256: hash,
    fetch_status: "captured",
    mime_type: "text/plain",
    observed_at: "2026-10-10T00:00:00.000Z",
  }
  atomicWrite(root, document.body_path, bytes)
  return document
}

test("recovers scanner listing/detail/image/support captures after parsing failed without a run snapshot", async (t) => {
  const root = setup(t),
    run = new RunState(root, "failed-scan", { command: "scan-list" })
  const stageNames = [
    "listing-fetch",
    "listing-fetch-page-2",
    "listing-fetch-2026-09",
    "detail",
    "body-image",
    "supporting-document",
    "supporting-evidence",
    "fetch",
  ]
  const documents = []
  for (const [index, prefix] of stageNames.entries()) {
    const document = capture(root, `https://example.org/source/${index}`)
    documents.push(document)
    const stage = prefix.startsWith("listing-fetch") ? prefix : `${prefix}-${document.source_id}`
    await run.stage(stage, { url: document.original_url }, async () => document)
  }
  await assert.rejects(
    run.stage("listing-parse", {}, async () => {
      throw Error("Parser failed")
    }),
  )
  const stateBefore = fs.readFileSync(path.join(root, "runs/failed-scan/state.json"))
  const recovered = loadCapturedStagesForReparse(root, "failed-scan")
  assert.deepEqual(
    new Set(recovered.documents.map((d) => d.source_version_id)),
    new Set(documents.map((d) => d.source_version_id)),
  )
  assert.deepEqual(recovered.parses, [])
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/failed-scan/state.json")), stateBefore)
  assert.equal(fs.existsSync(path.join(root, "runs/failed-scan/documents.json")), false)
  assert.ok(recovered.documents.every((d) => d.observed_at === "2026-10-10T00:00:00.000Z"))
})

test("recovery ignores incomplete, blocked and unrelated stages without inventing captured source evidence", async (t) => {
  const root = setup(t),
    run = new RunState(root, "blocked-scan", {})
  const blocked = {
    original_url: "https://example.org/list",
    source_id: sourceId("https://example.org/list"),
    fetch_status: "blocked",
  }
  await run.stage("listing-fetch", {}, async () => blocked)
  const captured = capture(root, "https://example.org/ignored")
  await run.stage("metadata", {}, async () => captured)
  await assert.rejects(
    run.stage(`detail-${captured.source_id}`, {}, async () => {
      throw Error("Not acquired")
    }),
  )
  assert.throws(
    () => loadCapturedStagesForReparse(root, "blocked-scan"),
    /No completed fetch stages/,
  )
})

test("recovered native checkpoints reject changed paths, result hashes, source IDs and source bytes", async (t) => {
  const root = setup(t),
    run = new RunState(root, "saved-scan", {})
  const document = capture(root, "https://example.org/news/one")
  const stageName = `detail-${document.source_id}`
  await run.stage(stageName, {}, async () => document)
  const original = readJSON(root, "runs/saved-scan/state.json")
  for (const change of [
    { result_path: "runs/another/listing-fetch.json" },
    { result_hash: "0".repeat(64) },
  ]) {
    const state = structuredClone(original)
    Object.assign(state.stages[stageName], change)
    atomicWrite(root, "runs/saved-scan/state.json", state)
    assert.throws(() => loadCapturedStagesForReparse(root, "saved-scan"), /fetch stage/)
  }
  const state = structuredClone(original)
  const wrongSource = { ...document, source_id: sourceId("https://example.org/another") }
  atomicWrite(root, state.stages[stageName].result_path, wrongSource)
  state.stages[stageName].result_hash = sha256(JSON.stringify(wrongSource))
  atomicWrite(root, "runs/saved-scan/state.json", state)
  assert.throws(() => loadCapturedStagesForReparse(root, "saved-scan"), /source identity/)
  atomicWrite(root, state.stages[stageName].result_path, document)
  atomicWrite(root, "runs/saved-scan/state.json", original)
  atomicWrite(root, document.body_path, "Changed raw bytes")
  assert.throws(() => loadCapturedStagesForReparse(root, "saved-scan"), /body hash mismatch/)
})

test("recovery deduplicates identical observations and refuses conflicting versions or observation times", async (t) => {
  const root = setup(t),
    run = new RunState(root, "duplicate-scan", {})
  const document = capture(root, "https://example.org/news/one")
  await run.stage("listing-fetch", {}, async () => document)
  await run.stage(`detail-${document.source_id}`, {}, async () => document)
  assert.equal(loadCapturedStagesForReparse(root, "duplicate-scan").documents.length, 1)
  const stateBefore = readJSON(root, "runs/duplicate-scan/state.json")
  for (const conflicting of [
    capture(root, document.original_url, "Changed version"),
    { ...document, observed_at: "2026-10-10T01:00:00.000Z" },
  ]) {
    const state = structuredClone(stateBefore)
    atomicWrite(root, `runs/duplicate-scan/detail-${document.source_id}.json`, conflicting)
    state.stages[`detail-${document.source_id}`].result_hash = sha256(JSON.stringify(conflicting))
    atomicWrite(root, "runs/duplicate-scan/state.json", state)
    assert.throws(() => loadCapturedStagesForReparse(root, "duplicate-scan"), /conflict/)
  }
})

test("a saved source snapshot remains authoritative instead of importing neighboring stage captures", async (t) => {
  const root = setup(t),
    run = new RunState(root, "saved-snapshot", {})
  const document = capture(root, "https://example.org/source/one")
  await run.stage("listing-fetch", {}, async () => capture(root, "https://example.org/neighbor"))
  atomicWrite(root, "runs/saved-snapshot/documents.json", [document])
  atomicWrite(root, "runs/saved-snapshot/parses.json", [])
  const result = loadCapturedStagesForReparse(root, "saved-snapshot")
  assert.deepEqual(result.documents, [document])
})

test("the actual parser worker reads saved bytes from a different process working directory", (t) => {
  const root = setup(t),
    document = capture(root, "https://example.org/news/plain")
  const parserURL = new URL("../scripts/research/parser.mjs", import.meta.url).href
  const parsed = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import { parseDocument } from ${JSON.stringify(parserURL)};
    const request = JSON.parse(process.env.PARSER_RECOVERY_INPUT);
    const parsed = await parseDocument(request.root, request.document);
    process.stdout.write(JSON.stringify(parsed));
  `,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          RESEARCH_PYTHON:
            process.env.RESEARCH_PYTHON ||
            path.join(repo, ".local/research/local-ai/runtime/venv/bin/python"),
          PARSER_RECOVERY_INPUT: JSON.stringify({ root, document }),
        },
        encoding: "utf8",
        timeout: 20000,
      },
    ),
  )
  assert.equal(parsed.status, "extracted")
  assert.equal(parsed.source_version_id, document.source_version_id)
  assert.equal(parsed.blocks[0].text, "Original source text.")
})
