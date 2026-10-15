import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createArchiveSourceReuse } from "../scripts/research/list-scan-command.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

function fixture(t, policy) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archive-policy-input-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.org/retained-article", body = "Original retained source.", id = sourceId(url)
  const document = { source_id: id, source_version_id: `${id}:${sha256(body)}`, original_url: url, final_url: url,
    observed_at: "2026-10-11T00:00:00Z", body_sha256: sha256(body), body_path: `documents/${id}/${sha256(body)}/body.bin`,
    fetch_status: "captured", policy_status: "checked", policy: { allowed: true } }
  const channel = { channel_id: "fixture", allowed_hosts: ["example.org"] }, window = { since: "2026-10-09", until: "2026-10-12" }
  const basis = { dependencies: { fetch: "same-fetch" }, implementation: { parser_sha256: "same-parser" }, article_profiles_sha256: "same-profiles", route_sha256: sha256(JSON.stringify(channel)) }
  const input = { schema: "research-list-run-input/v2", channel_id: channel.channel_id, since: window.since, until_exclusive: window.until, reuse_listing_run: null, collection_basis: basis, ...(policy === undefined ? {} : { policy_recheck_limit: policy }) }
  atomicWrite(root, document.body_path, body)
  atomicWrite(root, "runs/original/documents.json", [document])
  atomicWrite(root, "runs/original/parses.json", [])
  atomicWrite(root, "runs/original/collection-basis.json", basis)
  atomicWrite(root, "runs/original/state.json", { schema: "research-run/v1", input_hash: sha256(JSON.stringify(input)) })
  atomicWrite(root, "runs/original/list-scan.json", { channel_id: channel.channel_id, pagination: "path-pages", window: { since: window.since, until_exclusive: window.until }, status: "incomplete", reason: "archive_cutoff_not_reached" })
  return { root, document, channel, window, basis, now: Date.parse("2026-10-11T00:10:00Z") }
}

test("archive reuse preserves an exactly declared zero policy input and original source time without network", async (t) => {
  const f = fixture(t, 0), before = fs.readFileSync(path.join(f.root, "runs/original/state.json"))
  const reuse = createArchiveSourceReuse(f.root, "original", f.channel, f.basis, f.window, { now: f.now, policy_recheck_limit: 0, fetchPolicy: () => { throw Error("unexpected source request") } })
  assert.deepEqual(await reuse.fetchPolicy(f.root, {}, f.document.original_url, { allowed_hosts: f.channel.allowed_hosts }), f.document)
  assert.equal(reuse.used.get(f.document.original_url).observed_at, f.document.observed_at)
  assert.deepEqual(fs.readFileSync(path.join(f.root, "runs/original/state.json")), before)
})

test("archive reuse keeps omitted policy inputs distinct from explicit values and rejects a changed declaration", (t) => {
  const omitted = fixture(t), zero = fixture(t, 0), maximum = fixture(t, 3)
  assert.equal(createArchiveSourceReuse(omitted.root, "original", omitted.channel, omitted.basis, omitted.window, { now: omitted.now }).available.size, 1)
  assert.equal(createArchiveSourceReuse(maximum.root, "original", maximum.channel, maximum.basis, maximum.window, { now: maximum.now, policy_recheck_limit: 3 }).available.size, 1)
  for (const [f, options] of [[omitted, { policy_recheck_limit: 0 }], [zero, {}], [zero, { policy_recheck_limit: 1 }], [maximum, { policy_recheck_limit: 2 }]])
    assert.throws(() => createArchiveSourceReuse(f.root, "original", f.channel, f.basis, f.window, { now: f.now, ...options }), /same window and unchanged/)
  assert.throws(() => createArchiveSourceReuse(zero.root, "original", zero.channel, zero.basis, zero.window, { now: zero.now, policy_recheck_limit: "0" }), /0\.\.3/)
})
