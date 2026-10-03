import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  createArchiveSourceReuse,
  preserveArchiveReuseReceipt,
} from "../scripts/research/list-scan-command.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archive-source-reuse-")))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const url = "https://example.org/article/one",
    body = "Recorded original."
  const doc = {
    source_id: sourceId(url),
    source_version_id: sourceId(url) + ":" + sha256(body),
    original_url: url,
    final_url: url,
    observed_at: "2026-10-04T00:00:00Z",
    body_sha256: sha256(body),
    body_path: `documents/${sourceId(url)}/${sha256(body)}/body.bin`,
    fetch_status: "captured",
    policy_status: "checked",
    policy: { allowed: true },
  }
  const basis = {
    dependencies: { fetch: "same-fetch", worker: "same-worker" },
    implementation: { parser_sha256: "same-parser" },
    article_profiles_sha256: "same-profiles",
  }
  const window = { since: "2026-09-27", until: "2026-10-04" },
    channel = { channel_id: "archive", allowed_hosts: ["example.org"] }
  const input = {
    schema: "research-list-run-input/v2",
    channel_id: channel.channel_id,
    since: window.since,
    until_exclusive: window.until,
    reuse_listing_run: null,
    collection_basis: basis,
  }
  atomicWrite(root, doc.body_path, body)
  atomicWrite(root, "runs/old/documents.json", [doc])
  atomicWrite(root, "runs/old/parses.json", [])
  atomicWrite(root, "runs/old/state.json", {
    schema: "research-run/v1",
    input_hash: sha256(JSON.stringify(input)),
  })
  atomicWrite(root, "runs/old/collection-basis.json", basis)
  atomicWrite(root, "runs/old/list-scan.json", {
    channel_id: channel.channel_id,
    pagination: "path-pages",
    window: { since: window.since, until_exclusive: window.until },
    status: "incomplete",
    reason: "archive_cutoff_not_reached",
  })
  return { root, doc, basis, window, channel, now: Date.parse("2026-10-04T00:10:00Z") }
}

test("archive source reuse verifies stored bytes, keeps original time and requests only missing URLs", async (t) => {
  const f = fixture(t),
    requested = []
  const reuse = createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, {
    now: f.now,
    fetchPolicy: async (_r, _f, url) => {
      requested.push(url)
      return { original_url: url }
    },
  })
  const original = await reuse.fetchPolicy(f.root, {}, f.doc.original_url, {
    allowed_hosts: ["example.org"],
  })
  assert.deepEqual(original, f.doc)
  assert.equal(reuse.used.size, 1)
  assert.equal(reuse.used.get(f.doc.original_url).observed_at, f.doc.observed_at)
  await reuse.fetchPolicy(f.root, {}, "https://example.org/article/new", {
    allowed_hosts: ["example.org"],
  })
  assert.deepEqual(requested, ["https://example.org/article/new"])
  await assert.rejects(
    reuse.fetchPolicy(f.root, {}, f.doc.original_url, { allowed_hosts: ["other.org"] }),
    /Host outside/,
  )
})

test("archive source reuse rejects changed source bytes, fetch dependencies, profiles and windows", (t) => {
  const f = fixture(t)
  for (const basis of [
    { ...f.basis, dependencies: { fetch: "changed" } },
    { ...f.basis, article_profiles_sha256: "changed" },
    { ...f.basis, implementation: { parser_sha256: "changed" } },
  ])
    assert.throws(
      () => createArchiveSourceReuse(f.root, "old", f.channel, basis, f.window, { now: f.now }),
      /same window/,
    )
  assert.throws(
    () =>
      createArchiveSourceReuse(
        f.root,
        "old",
        f.channel,
        f.basis,
        { ...f.window, since: "2026-09-28" },
        { now: f.now },
      ),
    /same window/,
  )
  fs.appendFileSync(path.join(f.root, f.doc.body_path), " changed")
  assert.throws(
    () => createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, { now: f.now }),
    /body hash mismatch/,
  )
})

test("archive source reuse rejects stale, denied and tampered checkpoint observations", (t) => {
  const f = fixture(t)
  assert.throws(
    () =>
      createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, {
        now: f.now + 3600000,
      }),
    /recent policy-checked/,
  )
  atomicWrite(f.root, "runs/old/documents.json", [{ ...f.doc, policy: { allowed: false } }])
  assert.throws(
    () => createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, { now: f.now }),
    /recent policy-checked/,
  )
  atomicWrite(f.root, "runs/old/collection-basis.json", { ...f.basis, route_sha256: "tampered" })
  assert.throws(
    () => createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, { now: f.now }),
    /same window/,
  )
})

test("completed archive sources can be reused without losing the receipt on checkpoint replay", async (t) => {
  const f = fixture(t)
  const summaryFile = path.join(f.root, "runs/old/list-scan.json")
  const summary = JSON.parse(fs.readFileSync(summaryFile))
  atomicWrite(f.root, "runs/old/list-scan.json", {
    ...summary,
    status: "window_scanned",
    reason: null,
  })
  const reuse = createArchiveSourceReuse(f.root, "old", f.channel, f.basis, f.window, {
    now: f.now,
  })
  await reuse.fetchPolicy(f.root, {}, f.doc.original_url, { allowed_hosts: ["example.org"] })
  preserveArchiveReuseReceipt(f.root, "new", reuse)
  const receiptFile = path.join(f.root, "runs/new/archive-reuse.json")
  const bytes = fs.readFileSync(receiptFile)
  reuse.used.clear()
  preserveArchiveReuseReceipt(f.root, "new", reuse)
  assert.deepEqual(fs.readFileSync(receiptFile), bytes)
  const receipt = JSON.parse(bytes)
  receipt.reused_sources[0].observed_at = "2026-10-04T00:01:00Z"
  atomicWrite(f.root, "runs/new/archive-reuse.json", receipt)
  assert.throws(() => preserveArchiveReuseReceipt(f.root, "new", reuse), /observation is invalid/)
})
