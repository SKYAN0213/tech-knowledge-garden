import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import {
  ARTIFACT_MANIFEST_SHA256,
  exportSemanticBundle,
} from "../scripts/research/semantic-exchange.mjs"
import {
  loadBundle,
  validateBundle,
  normalizeSearch,
} from "../scripts/vendor/semantic-common/0.1.0/semantic-common.mjs"
import {
  publicFixture,
  PRIVATE_SENTINEL,
  hash,
  rewriteNote,
  noteBytes,
} from "./fixtures/semantic-exchange/public-fixture.mjs"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(repo, "scripts/research/semantic-exchange.mjs")
const vendor = path.join(repo, "scripts/vendor/semantic-common/0.1.0")
const sourceId = "synthetic-garden"
const articleId = (id) => `garden:${sourceId}:article:${id.repeat(16)}`
const run = (f, extra = {}) =>
  exportSemanticBundle({ root: repo, vault: f.vault, output: f.output, sourceId, ...extra })
const read = (f) => loadBundle(f.output, { sourceId, requirePublic: true })
const findArticle = (f, id) => read(f).bundle.records.find((r) => r.id === articleId(id))
const pointer = (f) => fs.readFileSync(path.join(f.output, "current.json"))

function treeHashes(directory) {
  const results = []
  function visit(root) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name)
      if (entry.isDirectory()) visit(file)
      else results.push([path.relative(directory, file), hash(fs.readFileSync(file))])
    }
  }
  visit(directory)
  return results.sort((a, b) => a[0].localeCompare(b[0]))
}

test("public allowlist preserves IDs, roles, native relation semantics and all citation URLs", async (t) => {
  const f = publicFixture(t)
  const before = treeHashes(f.root)
  const result = await run(f)
  const { bundle, manifest, pointer: current } = read(f)
  assert.equal(result.status, "updated")
  assert.equal(bundle.coverage.status, "partial")
  assert.equal(bundle.coverage.inventory, "complete")
  assert.equal(bundle.records.length, 9)
  assert.ok(bundle.records.every((r) => r.review.publication === "approved"))
  assert.ok(!JSON.stringify(bundle).includes(PRIVATE_SENTINEL))
  assert.ok(!JSON.stringify(bundle).includes("approved_run"))
  assert.ok(!JSON.stringify(bundle).includes(".local/"))
  assert.ok(!JSON.stringify(bundle).includes(f.directory))
  assert.ok(
    !bundle.records.some((r) => r.native_id === "excluded" || r.native_id === "6".repeat(16)),
  )
  assert.equal(findArticle(f, "1").review.semantic, "reviewed_links")
  assert.equal(findArticle(f, "2").review.semantic, "reviewed_none")
  assert.equal(findArticle(f, "3").review.semantic, "unreviewed")
  assert.equal(findArticle(f, "4").review.native_status, "legacy_untyped")
  const roles = bundle.relations.filter((r) => r.source_id === articleId("1"))
  assert.deepEqual(
    roles.map((r) => r.predicate).sort(),
    [
      "garden:topic",
      "garden:application",
      "garden:comparison_evaluation",
      "garden:context_background",
    ].sort(),
  )
  assert.ok(roles.every((r) => r.directed && r.native_directed && r.status === "reviewed"))
  assert.deepEqual(
    roles.flatMap((r) => r.native_evidence_ids).sort(),
    [0, 1, 2, 3].map((i) => "synthetic-public-claim-" + i),
  )
  assert.ok(roles.every((r) => r.evidence_ids.length === 0))
  assert.deepEqual(bundle.evidence, [])
  const typed = bundle.relations.find((r) => r.native_type === "uses")
  assert.equal(typed.predicate, "garden:associated")
  assert.equal(typed.directed, false)
  assert.equal(typed.native_directed, true)
  assert.equal(typed.native_basis, "source")
  assert.equal(bundle.relations.find((r) => r.source_id === articleId("4")).native_type, null)
  assert.equal(findArticle(f, "1").provenance.urls.length, 2)
  assert.ok(bundle.records.find((r) => r.native_id === "alpha").aliases.includes("alpha"))
  assert.equal(
    findArticle(f, "1").provenance.bytes_sha256,
    hash(fs.readFileSync(f.articles.get("1".repeat(16)).file)),
  )
  assert.equal(manifest.bundle_id, current.bundle_id)
  assert.equal(
    hash(fs.readFileSync(path.join(f.output, "bundles", current.bundle_id, "bundle.json"))),
    current.bundle_id,
  )
  assert.deepEqual(treeHashes(f.root), before)
})

test("missing public review index remains partial/unreviewed and creates no index or approvals", async (t) => {
  const f = publicFixture(t, { semanticIndex: false })
  const before = treeHashes(f.root)
  await run(f)
  const { bundle } = read(f)
  assert.ok(
    bundle.records
      .filter((r) => r.kind === "article")
      .every((r) => r.review.semantic === "unreviewed"),
  )
  assert.ok(bundle.coverage.omissions.some((o) => o.reason === "semantic_index_missing"))
  assert.equal(fs.existsSync(f.indexFile), false)
  assert.deepEqual(treeHashes(f.root), before)
})

test("unchanged inputs reuse every record and leave the atomic pointer untouched", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  const stat = fs.statSync(path.join(f.output, "current.json"), { bigint: true })
  const result = await run(f)
  assert.equal(result.status, "unchanged")
  assert.equal(result.counts.projected, 0)
  assert.equal(result.counts.reused, result.counts.records)
  assert.deepEqual(pointer(f), before)
  assert.equal(fs.statSync(path.join(f.output, "current.json"), { bigint: true }).ino, stat.ino)
  assert.equal(
    fs.statSync(path.join(f.output, "current.json"), { bigint: true }).mtimeNs,
    stat.mtimeNs,
  )
})

test("unchanged public prose skips native normalization and projection work", async (t) => {
  const f = publicFixture(t)
  const original = String.prototype.normalize
  let proseNormalizations = 0
  String.prototype.normalize = function (form) {
    if (String(this).includes("측정값은")) proseNormalizations++
    return original.call(this, form)
  }
  try {
    await run(f)
    assert.equal(proseNormalizations, 5)
    proseNormalizations = 0
    await run(f)
    assert.equal(proseNormalizations, 0)
  } finally {
    String.prototype.normalize = original
  }
})

test("changed article bytes are reprojected despite unchanged size and restored timestamps", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const file = f.articles.get("3".repeat(16)).file
  const old = fs.statSync(file)
  const bytes = fs.readFileSync(file)
  fs.writeFileSync(file, Buffer.from(bytes.toString().replace("±5%", "±6%")))
  fs.utimesSync(file, old.atime, old.mtime)
  assert.equal(fs.statSync(file).size, old.size)
  const result = await run(f)
  assert.equal(result.counts.projected, 1)
  assert.equal(result.counts.reused, result.counts.records - 1)
  assert.ok(findArticle(f, "3").text.includes("±6%"))
})

test("raw CRLF/NFD revision differs from normalized native public/search fingerprints", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = findArticle(f, "1")
  const file = f.articles.get("1".repeat(16)).file
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").normalize("NFC").replaceAll("\r\n", "\n"))
  const result = await run(f)
  const after = findArticle(f, "1")
  assert.equal(before.id, after.id)
  assert.notEqual(before.provenance.bytes_sha256, after.provenance.bytes_sha256)
  assert.notEqual(before.provenance.revision, after.provenance.revision)
  const publicHash = (record) =>
    record.provenance.fingerprints.find((p) => p.profile === "garden:article-public/v1").value
  assert.equal(publicHash(before), publicHash(after))
  assert.equal(after.review.semantic, "reviewed_links")
  assert.equal(result.counts.projected, 1)
  assert.equal(normalizeSearch(before.text), normalizeSearch(after.text))
  assert.ok(
    after.text.includes("±5%") && after.text.includes("−2 ms") && after.text.includes("+2 ms"),
  )
})

test("public prose change invalidates the exact old semantic review without inventing a new outcome", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const old = read(f).pointer
  rewriteNote(f.articles.get("1".repeat(16)).file, (n) => {
    n.body = n.body.replace("±5%", "±7%")
  })
  await run(f)
  const record = findArticle(f, "1")
  assert.equal(record.review.semantic, "unavailable")
  assert.equal(record.review.currentness, "stale")
  assert.equal(record.review.native_status, "reviewed_links")
  assert.ok(
    read(f).bundle.coverage.omissions.some(
      (o) => o.record_id === record.id && o.reason === "semantic_review_fingerprint_mismatch",
    ),
  )
  assert.ok(fs.existsSync(path.join(f.output, "bundles", old.bundle_id, "bundle.json")))
})

test("current concept registry revision invalidates linked and reviewed-empty native receipts", async (t) => {
  const f = publicFixture(t)
  await run(f)
  rewriteNote(f.concepts.get("alpha").file, (n) => {
    n.body = n.body.replace("작동 원리", "동작 조건")
  })
  const result = await run(f)
  assert.equal(result.counts.projected, 3)
  assert.equal(findArticle(f, "1").review.semantic, "unavailable")
  assert.equal(findArticle(f, "2").review.semantic, "unavailable")
  assert.equal(findArticle(f, "2").review.native_status, "reviewed_none")
  assert.equal(findArticle(f, "3").review.semantic, "unreviewed")
})

test("rename keeps native identity and confirmed deletion is distinct from semantic omissions", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const file = f.articles.get("3".repeat(16)).file
  const renamed = path.join(path.dirname(file), "renamed.md")
  fs.renameSync(file, renamed)
  const renamedResult = await run(f)
  assert.equal(renamedResult.counts.deleted, 0)
  assert.equal(findArticle(f, "3").provenance.path, "News/renamed.md")
  fs.unlinkSync(renamed)
  const deletedResult = await run(f)
  assert.equal(deletedResult.counts.deleted, 1)
  assert.equal(read(f).bundle.coverage.inventory, "complete")
  assert.equal(read(f).bundle.coverage.status, "partial")
  assert.equal(findArticle(f, "3"), undefined)
  const original = f.articles.get("3".repeat(16))
  fs.writeFileSync(file, noteBytes(original.meta, original.body))
  await run(f)
  assert.equal(findArticle(f, "3").native_id, "3".repeat(16))
})

test("source directory/volume absence never replaces last verified current with an empty result", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  fs.renameSync(path.join(f.vault, "News"), path.join(f.vault, "OfflineNews"))
  await assert.rejects(run(f))
  assert.deepEqual(pointer(f), before)
})

test("malformed or duplicate-key review index fails closed and preserves existing pointer", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  for (const bytes of [
    "{broken",
    '{"schema":"article-semantic-review-index/v1","reviews":[],"reviews":[]}',
  ]) {
    fs.writeFileSync(f.indexFile, bytes)
    await assert.rejects(run(f))
    assert.deepEqual(pointer(f), before)
  }
})

test("corrupt last generation is reported instead of regenerated as success", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  const current = read(f).pointer
  fs.appendFileSync(path.join(f.output, "bundles", current.bundle_id, "bundle.json"), " ")
  await assert.rejects(run(f))
  assert.deepEqual(pointer(f), before)
})

test("duplicate native event identity is rejected without silently merging equal article titles", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  const one = f.articles.get("1".repeat(16)).file
  fs.writeFileSync(path.join(f.vault, "News/duplicate.md"), fs.readFileSync(one))
  await assert.rejects(run(f), { code: "DUPLICATE_NATIVE_ID" })
  assert.deepEqual(pointer(f), before)
  assert.notEqual(findArticle(f, "1").id, findArticle(f, "2").id)
  assert.equal(findArticle(f, "1").title, findArticle(f, "2").title)
})

test("source mutation during projection blocks atomic promotion and remains pending for a fresh export", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  await assert.rejects(
    run(f, {
      beforePublish() {
        rewriteNote(f.articles.get("3".repeat(16)).file, (n) => {
          n.body += "\n새 합성 판본이다."
        })
      },
    }),
    { code: "SOURCE_CHANGED" },
  )
  assert.deepEqual(pointer(f), before)
  assert.equal((await run(f)).status, "updated")
})

test("symlink sources and output/source overlap are rejected without reading a private target", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  const file = path.join(f.vault, "News/private.md")
  fs.symlinkSync(path.join(f.root, ".local/research/local-ai/private.json"), file)
  await assert.rejects(run(f), { code: "UNSAFE_SOURCE_PATH" })
  assert.deepEqual(pointer(f), before)
  fs.unlinkSync(file)
  await assert.rejects(run(f, { output: path.join(f.vault, "Knowledge/exchange") }), {
    code: "OUTPUT_OVERLAPS_SOURCE",
  })
})

test("native public frontmatter review labels cannot impersonate a bound public semantic index", async (t) => {
  const f = publicFixture(t, { semanticIndex: false })
  rewriteNote(f.articles.get("3".repeat(16)).file, (n) => {
    n.meta.semantic_review_status = "reviewed_none"
  })
  await run(f)
  const record = findArticle(f, "3")
  assert.equal(record.review.semantic, "unreviewed")
  assert.equal(record.review.native_status, "reviewed_none")
  assert.ok(
    read(f).bundle.coverage.omissions.some(
      (o) => o.reason === "native_role_review_without_bound_public_index",
    ),
  )
})

test("unregistered root and oversized public files fail before output promotion", async (t) => {
  const f = publicFixture(t)
  await run(f)
  const before = pointer(f)
  await assert.rejects(run(f, { root: f.root }), { code: "REGISTERED_ROOT_MISMATCH" })
  fs.writeFileSync(path.join(f.vault, "News/oversized.md"), Buffer.alloc(4 * 1024 * 1024 + 1, 65))
  await assert.rejects(run(f), { code: "UNSAFE_SOURCE_FILE" })
  assert.deepEqual(pointer(f), before)
})

test("frozen artifact and shared fixtures are exact; generated bundles interoperate with the Python writer/reader", async (t) => {
  const f = publicFixture(t)
  const manifestBytes = fs.readFileSync(path.join(vendor, "artifact-manifest.json"))
  assert.equal(hash(manifestBytes), ARTIFACT_MANIFEST_SHA256)
  const manifest = JSON.parse(manifestBytes)
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(vendor, relative))
    assert.equal(hash(bytes), expected.sha256, relative)
    assert.equal(bytes.length, expected.bytes, relative)
  }
  for (const file of ["garden.json", "wiki.json", "partial.json"])
    validateBundle(JSON.parse(fs.readFileSync(path.join(vendor, "fixtures", file))))
  await run(f)
  const pythonOutput = path.join(f.directory, "python-exchange")
  const code =
    "import sys,json;sys.path.insert(0,sys.argv[1]);from semantic_common import load_bundle,write_bundle;v=load_bundle(sys.argv[2],source_id=sys.argv[4],require_public=True);write_bundle(sys.argv[3],v['bundle']);print(json.dumps({'records':len(v['bundle']['records']),'ok':True}))"
  const python = spawnSync("python3", ["-c", code, vendor, f.output, pythonOutput, sourceId], {
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  })
  assert.equal(python.status, 0, python.stderr)
  assert.deepEqual(JSON.parse(python.stdout), { records: 9, ok: true })
  const roundtrip = loadBundle(pythonOutput, { sourceId, requirePublic: true })
  assert.deepEqual(roundtrip.bundle, read(f).bundle)
})

test("fixed CLI emits one JSON result, isolates synthetic index and redacts parser/IO failure details", (t) => {
  const f = publicFixture(t)
  const args = [
    cli,
    "export",
    "--root",
    repo,
    "--vault",
    f.vault,
    "--output",
    f.output,
    "--source-id",
    sourceId,
  ]
  const result = spawnSync(process.execPath, args, { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim().split("\n").length, 1)
  const value = JSON.parse(result.stdout)
  assert.equal(value.source_id, sourceId)
  assert.match(value.implementation_sha256, /^[a-f0-9]{64}$/)
  assert.match(value.source_snapshot_sha256, /^[a-f0-9]{64}$/)
  assert.equal(findArticle(f, "1").review.semantic, "reviewed_links")
  const before = pointer(f)
  fs.writeFileSync(f.indexFile, '{"private_token":"' + PRIVATE_SENTINEL + '" broken}')
  const failed = spawnSync(process.execPath, args, { encoding: "utf8" })
  assert.equal(failed.status, 1)
  assert.equal(failed.stdout, "")
  assert.ok(!failed.stderr.includes(PRIVATE_SENTINEL))
  assert.ok(!failed.stderr.includes(f.directory))
  assert.equal(JSON.parse(failed.stderr).code, "EXPORT_FAILED")
  assert.deepEqual(pointer(f), before)
})
