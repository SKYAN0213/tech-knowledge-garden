import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { main } from "../scripts/research.mjs"
import { archiveClosure } from "../scripts/research/archive-closure.mjs"
import { archiveManifest, packageResearchArchive } from "../scripts/research/archive.mjs"
import { atomicWrite, readJSON } from "../scripts/research/run-state.mjs"
import { loadStoredSourceRun, storeParseArtifact } from "../scripts/research/parser.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import {
  registerArchiveLocation,
  lookupArchiveLocations,
} from "../scripts/research/archive-locations.mjs"

const script = path.resolve("scripts/research/package-archive.py")
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archive-closure-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const body = "The company announced a robot.",
    url = "https://example.org/robot"
  const id = sourceId(url),
    hash = sha256(body),
    parseId = sha256("robot-parse")
  const doc = {
    source_id: id,
    source_version_id: `${id}:${hash}`,
    body_sha256: hash,
    body_path: `documents/${id}/${hash}/body.bin`,
    original_url: url,
    final_url: url,
    fetch_status: "captured",
    observed_at: "2026-10-04T00:00:00Z",
  }
  const parse = {
    schema_version: "source-parse/v1",
    source_id: id,
    source_version_id: doc.source_version_id,
    parse_id: parseId,
    title: "A robot",
    status: "extracted",
    dates: { published_at: "2026-10-03" },
    blocks: [{ block_id: parseId + ":b1", text: body, locator: { text_hash: hash } }],
    quality: { missing_pages: [] },
  }
  atomicWrite(root, doc.body_path, body)
  storeParseArtifact(root, parse)
  for (const run of ["extraction", "article"]) {
    atomicWrite(root, `runs/${run}/documents.json`, [doc])
    atomicWrite(root, `runs/${run}/parses.json`, [parse])
  }
  atomicWrite(root, "runs/extraction/claims.json", {
    claims: [],
    provenance: { model: "controlled-fixture" },
  })
  atomicWrite(root, "runs/article/extraction-reuse.json", {
    schema: "research-extraction-reuse/v1",
    source_run: "extraction",
    source_claims_sha256: sha256(fs.readFileSync(path.join(root, "runs/extraction/claims.json"))),
    source_identity_sha256: sha256(
      JSON.stringify(loadStoredSourceRun(root, "extraction").identity),
    ),
    destination_identity_sha256: sha256(
      JSON.stringify(loadStoredSourceRun(root, "article").identity),
    ),
  })
  const article = {
    event_id: "robot-event",
    title: "A robot",
    source_urls: [url],
    review_status: "verified",
  }
  atomicWrite(root, "runs/article/approved-article.json", article)
  atomicWrite(root, "runs/approval/candidate-approval.json", {
    schema: "research-candidate-approval/v1",
    approved_run: "article",
    article_sha256: sha256(JSON.stringify(article)),
  })
  return { root, doc, parse }
}
function restore(root, receipt, destination, packagePath = receipt.path, hash = receipt.sha256) {
  return spawnSync(
    "python3",
    [
      script,
      "--root",
      root,
      "--package",
      packagePath,
      "--restore-to",
      destination,
      "--expected-sha256",
      hash,
    ],
    { encoding: "utf8" },
  )
}

async function locationFixture(t) {
  const data = fixture(t)
  const archive = await archiveClosure(data.root, "portable", "article", ["approval"])
  const remotePackageFile = path.join(data.root, "remote.zip")
  fs.copyFileSync(path.join(data.root, archive.package.path), remotePackageFile)
  const metadata = {
    schema: "research-drive-archive-observation/v1",
    observed_at: new Date().toISOString(),
    file_id: "drive-archive-1",
    name: "portable.zip",
    mime_type: "application/zip",
    size: archive.package.bytes,
    parent_ids: ["research-folder"],
    shared: false,
  }
  const metadataFile = path.join(data.root, "metadata.json")
  fs.writeFileSync(metadataFile, JSON.stringify(metadata))
  return {
    ...data,
    archive,
    metadata,
    metadataFile,
    remotePackageFile,
    args: {
      root: data.root,
      runId: "portable",
      metadataFile,
      remotePackageFile,
      expectedParentId: "research-folder",
    },
  }
}

test("archive location connects exact source versions and event IDs to verified Drive bytes without the source cache", async (t) => {
  const f = await locationFixture(t)
  const registered = await registerArchiveLocation(f.args)
  assert.equal(registered.sources.length, 1)
  assert.deepEqual(registered.sources[0].event_ids, ["robot-event"])
  assert.deepEqual(registered.sources[0].source_runs, ["article", "extraction"])
  const record = fs.readFileSync(path.join(f.root, "archive-staging/portable/drive-location.json"))
  assert.equal((await registerArchiveLocation(f.args)).reused, true)
  assert.deepEqual(
    fs.readFileSync(path.join(f.root, "archive-staging/portable/drive-location.json")),
    record,
  )
  fs.rmSync(path.join(f.root, "documents"), { recursive: true })
  const result = lookupArchiveLocations(f.root, {
    sourceVersionId: f.doc.source_version_id,
    eventId: "robot-event",
  })
  assert.equal(result[0].drive.file_id, "drive-archive-1")
  assert.equal(result[0].candidate_published, false)
  assert.deepEqual(lookupArchiveLocations(f.root, { eventId: "different-event" }), [])
})

test("archive location rejects unverified, stale or changed Drive identity without overwriting a record", async (t) => {
  const f = await locationFixture(t)
  await registerArchiveLocation(f.args)
  const recordPath = path.join(f.root, "archive-staging/portable/drive-location.json")
  const before = fs.readFileSync(recordPath)
  for (const change of [
    { shared: true },
    { parent_ids: ["other-folder"] },
    { observed_at: "2020-01-01T00:00:00Z" },
  ]) {
    fs.writeFileSync(f.metadataFile, JSON.stringify({ ...f.metadata, ...change }))
    await assert.rejects(registerArchiveLocation(f.args), /Fresh private/)
  }
  fs.writeFileSync(f.metadataFile, JSON.stringify({ ...f.metadata, file_id: "different-file" }))
  await assert.rejects(registerArchiveLocation(f.args), /Archive location changed/)
  fs.writeFileSync(f.metadataFile, JSON.stringify(f.metadata))
  fs.writeFileSync(f.remotePackageFile, "corrupt")
  await assert.rejects(registerArchiveLocation(f.args), /raw bytes do not match/)
  assert.deepEqual(fs.readFileSync(recordPath), before)
})

test("archive location refuses changed dependencies and corrupt stored source indexes", async (t) => {
  const f = await locationFixture(t)
  await registerArchiveLocation(f.args)
  fs.appendFileSync(path.join(f.root, f.doc.body_path), " altered")
  await assert.rejects(registerArchiveLocation(f.args), /dependency changed/)
  const recordPath = path.join(f.root, "archive-staging/portable/drive-location.json")
  const record = JSON.parse(fs.readFileSync(recordPath))
  record.sources[0].event_ids.push("unreviewed-event")
  fs.writeFileSync(recordPath, JSON.stringify(record))
  assert.throws(
    () => lookupArchiveLocations(f.root, { eventId: "unreviewed-event" }),
    /Invalid verified archive/,
  )
})

test("CLI archive follows pinned extraction and approval, preserves sources and restores immutable parses without network", async (t) => {
  const { root, doc, parse } = fixture(t)
  const oldFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = oldFetch
  })
  globalThis.fetch = () => assert.fail("Archive must not use a model or network")
  const result = await main([
    "archive-closure",
    "--root",
    root,
    "--run",
    "portable",
    "--source-run",
    "article",
    "--related-run",
    "approval",
  ])
  assert.deepEqual(result.bound_runs, ["approval", "article", "extraction"])
  assert.equal(result.parse_count, 1)
  assert.equal(result.package.source_versions, 1)
  const restored = restore(root, result.package, "restore/check")
  assert.equal(restored.status, 0, restored.stderr)
  const fresh = path.join(root, "restore/check")
  assert.deepEqual(loadStoredSourceRun(fresh, "article").parses, [parse])
  assert.deepEqual(
    fs.readFileSync(path.join(fresh, doc.body_path)),
    fs.readFileSync(path.join(root, doc.body_path)),
  )
  assert.ok(readJSON(fresh, "runs/extraction/claims.json"))
  assert.ok(readJSON(fresh, "runs/approval/candidate-approval.json"))
  assert.equal(readJSON(fresh, "restore-receipt.json").candidate_published, false)
  assert.notEqual(restore(root, result.package, "restore/check").status, 0)
  assert.equal(
    (await archiveClosure(root, "portable", "article", ["approval"])).package.sha256,
    result.package.sha256,
  )
})

test("changed dependency and unbound related approval fail without replacing a package", async (t) => {
  const { root } = fixture(t)
  const result = await archiveClosure(root, "portable", "article", ["approval"])
  const before = fs.readFileSync(path.join(root, result.package.path))
  atomicWrite(root, "runs/extraction/claims.json", { changed: true })
  await assert.rejects(
    archiveClosure(root, "portable", "article", ["approval"]),
    /dependency changed/,
  )
  assert.deepEqual(fs.readFileSync(path.join(root, result.package.path)), before)
  await assert.rejects(archiveClosure(root, "other", "article", ["approval"]), /dependency changed/)
  const isolated = fixture(t)
  atomicWrite(isolated.root, "runs/unrelated/candidate-approval.json", {
    approved_run: "different",
  })
  await assert.rejects(
    archiveClosure(isolated.root, "portable", "article", ["unrelated"]),
    /Related run/,
  )
  assert.equal(
    fs.existsSync(path.join(isolated.root, "runs/portable/archive-manifest.json")),
    false,
  )
})

test("archive retains blocked collection observations behind an exact captured selection without promoting them", async (t) => {
  const { root, doc, parse } = fixture(t)
  const blocked = {
    source_id: sourceId("https://example.org/blocked"),
    original_url: "https://example.org/blocked",
    fetch_status: "blocked",
    http_status: 403,
    observed_at: "2026-10-04T00:00:00Z",
  }
  atomicWrite(root, "runs/collection/documents.json", [doc, blocked])
  atomicWrite(root, "runs/collection/parses.json", [parse])
  const original = loadStoredSourceRun(root, "collection", { allowUnacquired: true })
  const selected = loadStoredSourceRun(root, "article")
  atomicWrite(root, "runs/article/source-selection.json", {
    schema: "research-source-selection/v1",
    source_run: original.identity,
    selected_urls: [doc.original_url],
    documents_sha256: selected.identity.documents_sha256,
    parses_sha256: selected.identity.parses_sha256,
    candidate_published: false,
  })
  const result = await archiveClosure(root, "portable", "article")
  assert.equal(result.package.source_versions, 1)
  assert.ok(result.bound_runs.includes("collection"))
  const restored = restore(root, result.package, "restore/with-blocked")
  assert.equal(restored.status, 0, restored.stderr)
  const fresh = path.join(root, "restore/with-blocked")
  assert.deepEqual(readJSON(fresh, "runs/collection/documents.json"), [doc, blocked])
  assert.throws(() => loadStoredSourceRun(fresh, "collection"), /unacquired document/)
  assert.deepEqual(loadStoredSourceRun(fresh, "article").documents, [doc])
  const metadataFile = path.join(root, "blocked-archive-metadata.json")
  fs.writeFileSync(
    metadataFile,
    JSON.stringify({
      schema: "research-drive-archive-observation/v1",
      observed_at: new Date().toISOString(),
      file_id: "blocked-observation-archive",
      name: "portable.zip",
      mime_type: "application/zip",
      size: result.package.bytes,
      parent_ids: ["research-folder"],
      shared: false,
    }),
  )
  const location = await registerArchiveLocation({
    root,
    runId: "portable",
    metadataFile,
    remotePackageFile: path.join(root, result.package.path),
    expectedParentId: "research-folder",
  })
  assert.equal(location.sources.length, 1)
  assert.equal(location.sources[0].source_version_id, doc.source_version_id)
  assert.equal(
    location.sources.some((s) => s.url === blocked.original_url),
    false,
  )
  const docs = readJSON(root, "runs/collection/documents.json")
  docs[1].http_status = 429
  atomicWrite(root, "runs/collection/documents.json", docs)
  await assert.rejects(() => archiveClosure(root, "changed", "article"), /dependency changed/)
})

test("parse corruption and source symlinks cannot enter a portable archive", async (t) => {
  const { root, parse } = fixture(t)
  atomicWrite(root, `parses/${parse.parse_id}/parse.json`, { ...parse, title: "Changed" })
  await assert.rejects(archiveClosure(root, "portable", "article"), /Stored parse differs/)
  const other = fixture(t)
  fs.symlinkSync(os.tmpdir(), path.join(other.root, "runs/article/external"))
  await assert.rejects(archiveClosure(other.root, "portable", "article"), /Symlink/)
})

test("source selection snapshots must match both their destination and upstream identity", async (t) => {
  const { root } = fixture(t)
  const identity = loadStoredSourceRun(root, "article").identity
  const selection = {
    schema: "research-source-selection/v1",
    source_run: loadStoredSourceRun(root, "extraction").identity,
    documents_sha256: identity.documents_sha256,
    parses_sha256: identity.parses_sha256,
  }
  atomicWrite(root, "runs/article/source-selection.json", selection)
  await archiveClosure(root, "portable", "article")
  selection.parses_sha256 = "0".repeat(64)
  atomicWrite(root, "runs/article/source-selection.json", selection)
  await assert.rejects(
    archiveClosure(root, "bad-destination", "article"),
    /Invalid source selection/,
  )
  selection.parses_sha256 = identity.parses_sha256
  selection.source_run.documents_sha256 = "0".repeat(64)
  atomicWrite(root, "runs/article/source-selection.json", selection)
  await assert.rejects(
    archiveClosure(root, "bad-parent", "article"),
    /selection dependency changed/,
  )
})

test("restore rejects wrong checksum, extra files, traversal, duplicate and corrupted members before writing", async (t) => {
  const { root } = fixture(t)
  const { package: receipt } = await archiveClosure(root, "portable", "article")
  assert.notEqual(
    restore(root, receipt, "restore/wrong-hash", receipt.path, "0".repeat(64)).status,
    0,
  )
  for (const mode of ["extra", "traversal", "duplicate", "corrupt"]) {
    const file = `tampered-${mode}.zip`
    const mutate = spawnSync(
      "python3",
      [
        "-c",
        `import sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z: entries=[(i,z.read(i)) for i in z.infolist()]
with zipfile.ZipFile(sys.argv[2],'w') as z:
 for i,b in entries: z.writestr(i, b+b'changed' if sys.argv[3]=='corrupt' and i.filename.endswith('body.bin') else b)
 if sys.argv[3]=='extra': z.writestr('Research/LocalAI/unlisted.json','extra')
 if sys.argv[3]=='traversal': z.writestr('../outside.txt','extra')
 if sys.argv[3]=='duplicate': z.writestr(entries[0][0],entries[0][1])
`,
        path.join(root, receipt.path),
        path.join(root, file),
        mode,
      ],
      { encoding: "utf8" },
    )
    assert.equal(mutate.status, 0, mutate.stderr)
    const result = restore(
      root,
      receipt,
      `restore/${mode}`,
      file,
      sha256(fs.readFileSync(path.join(root, file))),
    )
    assert.notEqual(result.status, 0, mode)
    assert.equal(fs.existsSync(path.join(root, `restore/${mode}`)), false)
  }
})

test("existing single-run package stays compatible and cannot be called a restorable closure", (t) => {
  const { root } = fixture(t)
  atomicWrite(root, "runs/article/archive-manifest.json", archiveManifest(root, "article"))
  const receipt = packageResearchArchive(root, "article")
  assert.equal(receipt.source_versions, 1)
  assert.equal(packageResearchArchive(root, "article").sha256, receipt.sha256)
  const result = restore(root, receipt, "restore/legacy")
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /portable dependency archive/)
})
