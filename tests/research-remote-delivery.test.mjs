import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fixture } from "./fixtures/publication-operation.mjs"
import {
  deliverApprovedPublication,
  deliveryCheckpointStatus,
} from "../scripts/research/delivery-run.mjs"
import { recordPublicationPush } from "../scripts/research/publication-operation.mjs"
import { archiveClosure } from "../scripts/research/archive-closure.mjs"
import { RunState, atomicCreate, readJSON } from "../scripts/research/run-state.mjs"
import { sha256, sourceId } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import {
  deliverRemoteArtifacts,
  inspectRemoteDelivery,
  REMOTE_DELIVERY_ROOTS,
} from "../scripts/research/remote-delivery.mjs"

const FILES = [
  "README.md",
  "articles.csv",
  "briefing.xml",
  "catalog.json",
  "concepts.csv",
  "connections.csv",
  "contentIndex.json",
  "knowledge-graph.json",
  "pages.csv",
  "reader-index.json",
  "snapshot.json",
]
async function setup(t, { wrongSourceEvent = false } = {}) {
  const f = await fixture(t, ".local/research/local-ai")
  f.put(".local/drive-sync/receipt.json", {
    schema: "tech-drive-receipt/v1",
    verified_at: "2026-10-04T00:00:00Z",
    files: [{ path: "Editions/controlled.md", id: "original-id", sha256: "original-hash" }],
  })
  const publication = (
    await deliverApprovedPublication({
      ...f.options,
      releasePath: f.releasePath,
      fetchImpl: f.fetchImpl,
      execute: async (file, args) => {
        if (file === process.execPath) {
          await recordPublicationPush({ ...f.options, pushPath: f.pushPath })
          return ""
        }
        return JSON.stringify(
          args[1] === "list"
            ? [{ databaseId: 123, headSha: f.push.local_commit, workflowName: "Publish Garden" }]
            : { ...f.deployment, workflowName: "Publish Garden" },
        )
      },
    })
  ).publication
  const state = new RunState(f.root, "custody", { kind: "controlled-operational-custody" })
  await state.stage("custody", { inputs: ["reviewed operational record"] }, async () => ({
    files: [
      atomicCreate(f.root, "runs/custody/record.json", {
        kind: "operational-proof",
        candidate_approved: false,
      }),
    ],
  }))
  const url = "https://example.org/controlled-source",
    body = "The company announced a robot.",
    id = sourceId(url),
    hash = sha256(body),
    parseId = sha256("controlled parse")
  const doc = {
    source_id: id,
    source_version_id: id + ":" + hash,
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
  atomicCreate(f.root, doc.body_path, body)
  storeParseArtifact(f.root, parse)
  atomicCreate(f.root, "runs/custody/documents.json", [doc])
  atomicCreate(f.root, "runs/custody/parses.json", [parse])
  const article = {
    event_id: (wrongSourceEvent ? "2" : "1").repeat(16),
    title: "A robot",
    source_urls: [url],
    review_status: "verified",
  }
  atomicCreate(f.root, "runs/custody/approved-article.json", article)
  atomicCreate(f.root, "runs/custody-approval/candidate-approval.json", {
    schema: "research-candidate-approval/v1",
    approved_run: "custody",
    article_sha256: sha256(JSON.stringify(article)),
  })
  const archive = await archiveClosure(f.root, "portable", "custody", ["custody-approval"])
  const stage = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "remote-website-")))
  t.after(() => fs.rmSync(stage, { recursive: true, force: true }))
  const planFile = f.privatePut("remote-plan.json", {
    schema: "research-remote-delivery-plan/v1",
    website_stage: stage,
    archives: [{ root: f.root, run_id: "portable" }],
  })
  const remote = new Map(),
    outputs = new Map(),
    commands = [],
    events = []
  const execute = async (file, args, repository, options) => {
    commands.push(args)
    if (args[0] === "scripts/export-website-data.py") {
      const destination = path.join(options.env.TECH_GARDEN_DRIVE_STAGE_DIR, "WebsiteData")
      fs.mkdirSync(destination, { recursive: true })
      const assets = []
      for (const name of FILES) {
        const publicName = name === "contentIndex.json" ? "static/contentIndex.json" : name
        const isAsset = [
          "reader-index.json",
          "knowledge-graph.json",
          "contentIndex.json",
          "briefing.xml",
        ].includes(name)
        const value = isAsset
          ? fs.readFileSync(path.join(f.repository, "public", publicName))
          : Buffer.from("controlled:" + name)
        outputs.set("WebsiteData/" + name, value)
        if (isAsset)
          assets.push({
            file: name,
            origin: "live-website",
            sha256: sha256(value),
            bytes: value.length,
            matches_local_build_bytes: true,
          })
      }
      outputs.set(
        "WebsiteData/snapshot.json",
        Buffer.from(JSON.stringify({ schema: "website-data-archive/v1", assets })),
      )
      for (const [name, value] of outputs)
        fs.writeFileSync(path.join(destination, path.basename(name)), value)
      return ""
    }
    return execFileSync(file, args, { cwd: repository, encoding: "utf8" })
  }
  const options = {
    ...f.options,
    publication,
    planFile,
    execute,
    emit: (event) => events.push(event),
  }
  await deliverRemoteArtifacts(options)
  const manifest = readJSON(f.root, "runs/operation/remote-delivery/manifest.json")
  for (const row of manifest.files)
    remote.set(row.path, {
      id: sha256(row.path).slice(0, 20),
      value: fs.readFileSync(path.join(f.root, row.staged_path)),
    })
  let sequence = 0
  function capture(change = (v) => v) {
    const observed = new Date().toISOString()
    const files = [],
      listings = []
    for (const [name, id] of Object.entries(REMOTE_DELIVERY_ROOTS)) {
      const list = []
      for (const [relative, record] of remote) {
        if (!relative.startsWith(name + "/")) continue
        const metadata = {
          id: record.id,
          title: path.basename(relative),
          parent_ids: [id],
          mime_type: name === "Research" ? "application/zip" : "application/octet-stream",
          shared: false,
          size: String(record.value.length),
          modified_time: observed,
        }
        list.push(metadata)
        files.push({
          path: relative,
          metadata,
          raw: {
            ...metadata,
            file_size_bytes: record.value.length,
            b64_string: record.value.toString("base64"),
          },
        })
      }
      listings.push({ path: name, id, limit: 100, before: list, after: list })
    }
    return f.privatePut(
      "captures/" + ++sequence + ".json",
      change({
        schema: "research-authoring-drive-acquisition/v1",
        observed_at: observed,
        folders: Object.entries(REMOTE_DELIVERY_ROOTS).map(([name, id]) => ({
          path: name,
          metadata: {
            id,
            mime_type: "application/vnd.google-apps.folder",
            parent_ids: ["1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"],
            shared: false,
          },
        })),
        listings,
        files,
      }),
    )
  }
  return { ...f, options, archive, capture, remote, commands, events, manifest }
}

test("native remote delivery restores and registers a raw ZIP and reuses completed export and proof without HTTP or writes", async (t) => {
  const f = await setup(t)
  const complete = await deliverRemoteArtifacts({
    ...f.options,
    acquisitionFile: f.capture((c) => {
      const folder = {
        id: "unrelated-folder",
        title: "2026-10-01",
        mime_type: "application/vnd.google-apps.folder",
        modified_time: c.observed_at,
      }
      c.listings[0].before.push(folder)
      return c
    }),
  })
  assert.equal(complete.status, "remote_delivery_complete")
  assert.equal(complete.website_data_verified, true)
  assert.equal(complete.source_archive_verified, true)
  assert.equal(complete.new_regular_operation_counted, false)
  assert.equal(
    readJSON(f.root, "archive-staging/portable/drive-location.json").drive.raw_sha256_verified,
    true,
  )
  assert.equal(f.commands.length, 2) // One controlled exporter and real native ZIP restore.
  const mapping = JSON.parse(
    fs.readFileSync(path.join(f.repository, ".local/drive-sync/receipt.json")),
  )
  assert.deepEqual(
    mapping.files.find((r) => r.path === "Editions/controlled.md"),
    { path: "Editions/controlled.md", id: "original-id", sha256: "original-hash" },
  )
  assert.equal(mapping.verified_at, "2026-10-04T00:00:00Z")
  assert.equal(mapping.files.filter((r) => r.path.startsWith("WebsiteData/")).length, 11)
  const again = await deliverRemoteArtifacts({
    ...f.options,
    planFile: undefined,
    execute: () => {
      throw Error("No command repeats")
    },
    nextCapture: () => {
      throw Error("No capture repeats")
    },
  })
  assert.equal(again.reused, true)
  assert.equal(again.observation, "archived_raw_bytes")
  const linked = await deliverApprovedPublication({
    ...f.options,
    root: f.root,
    run: f.run,
    repository: f.repository,
    execute: () => {
      throw Error("No publication repeats")
    },
  })
  assert.equal(linked.website_data_verified, true)
  assert.equal(linked.source_archive_verified, true)
  assert.equal(f.commands.length, 2)
  const receipt = readJSON(f.root, "runs/operation/remote-delivery/receipt.json")
  const restored = path.join(
    f.root,
    receipt.archives[0].restore_directory,
    "runs/custody/record.json",
  )
  fs.writeFileSync(restored, "tampered")
  assert.throws(() => inspectRemoteDelivery(f.root, f.run), /dependency changed/)
})

test("lost connector response preserves an exact write intent; fresh raw readback resolves it without a second write", async (t) => {
  const f = await setup(t)
  const target = "WebsiteData/snapshot.json",
    desired = f.remote.get(target)
  f.remote.delete(target)
  const first = await deliverRemoteArtifacts({
    ...f.options,
    acquisitionFile: f.capture(),
    nextCapture: async () => {
      throw Error("response lost")
    },
  })
  assert.equal(first.status, "remote_write_recovery_required")
  assert.equal(f.events.filter((e) => e.type === "remote_write_intent").length, 1)
  const unresolved = await deliverRemoteArtifacts({
    ...f.options,
    acquisitionFile: f.capture(),
    nextCapture: () => {
      throw Error("Must not retry")
    },
  })
  assert.equal(unresolved.status, "remote_write_recovery_required")
  assert.equal(f.events.filter((e) => e.type === "remote_write_intent").length, 1)
  f.remote.set(target, desired)
  const fixed = await deliverRemoteArtifacts({ ...f.options, acquisitionFile: f.capture() })
  assert.equal(fixed.status, "remote_delivery_complete")
  assert.equal(f.events.filter((e) => e.type === "remote_write_intent").length, 1)
})

test("unknown remote bytes, private-parent mismatches, duplicate identities and truncated capture are rejected", async (t) => {
  const f = await setup(t)
  const target = f.remote.get("WebsiteData/reader-index.json")
  target.value = Buffer.from("new unreviewed remote edit")
  await assert.rejects(
    deliverRemoteArtifacts({ ...f.options, acquisitionFile: f.capture() }),
    /conflicts/,
  )
  target.value = fs.readFileSync(path.join(f.repository, "public/reader-index.json"))
  await assert.rejects(
    deliverRemoteArtifacts({
      ...f.options,
      acquisitionFile: f.capture((c) => {
        c.folders[0].metadata.shared = true
        return c
      }),
    }),
    /Private remote folders/,
  )
  await assert.rejects(
    deliverRemoteArtifacts({
      ...f.options,
      acquisitionFile: f.capture((c) => {
        c.listings[0].limit = c.listings[0].before.length
        return c
      }),
    }),
    /truncated/,
  )
  await assert.rejects(
    deliverRemoteArtifacts({
      ...f.options,
      acquisitionFile: f.capture((c) => {
        c.listings[1].before.push(c.listings[1].before[0])
        return c
      }),
    }),
    /Ambiguous/,
  )
  assert.equal(
    f.events.some((e) => e.type === "remote_write_intent"),
    false,
  )
})

test("pinned plan changes cannot silently substitute an archive", async (t) => {
  const f = await setup(t)
  fs.appendFileSync(f.options.planFile, "\n")
  await assert.rejects(
    deliverRemoteArtifacts({ ...f.options, acquisitionFile: f.capture() }),
    /plan changed/,
  )
  const status = inspectRemoteDelivery(f.root, f.run)
  assert.equal(status.website_data_verified, false)
  assert.equal(
    f.events.some((e) => e.type === "remote_write_intent"),
    false,
  )
})

test("missing source-event coverage is rejected before exporting or issuing remote writes", async (t) => {
  await assert.rejects(
    setup(t, { wrongSourceEvent: true }),
    /every published event before export or writes/,
  )
})

test("readonly private delivery status reports remote completion and detects changed stored raw bytes", async (t) => {
  const f = await setup(t)
  await deliverRemoteArtifacts({ ...f.options, acquisitionFile: f.capture() })
  const before = fs.readdirSync(path.join(f.root, "runs/operation/remote-delivery"))
  const status = await deliverRemoteArtifacts({
    ...f.options,
    statusOnly: true,
    execute: () => {
      throw Error("No readonly command")
    },
  })
  assert.equal(status.status, "remote_delivery_complete")
  assert.deepEqual(fs.readdirSync(path.join(f.root, "runs/operation/remote-delivery")), before)
  const receipt = readJSON(f.root, "runs/operation/remote-delivery/receipt.json")
  const proof = readJSON(f.root, receipt.readback.path)
  fs.writeFileSync(path.join(f.root, proof.files[0].raw_path), "wrong")
  const privateStatus = deliveryCheckpointStatus(f.root, {
    runs: [{ run_id: f.run, status: "public_bytes_verified", commit: f.push.local_commit }],
  })
  assert.equal(privateStatus.runs[0].status, "invalid")
})

test("the real delivery CLI shares its live connector channel with remote writes and consumes post-write raw capture", async (t) => {
  const f = await setup(t)
  const desired = f.remote.get("WebsiteData/snapshot.json")
  f.remote.delete("WebsiteData/snapshot.json")
  const pre = f.capture()
  f.remote.set("WebsiteData/snapshot.json", desired)
  const post = f.capture()
  const stdout = execFileSync(
    process.execPath,
    [
      path.resolve("scripts/research-deliver.mjs"),
      "--run",
      f.run,
      "--root",
      f.root,
      "--remote-acquisition",
      pre,
      "--connector-wait-ms",
      "3000",
    ],
    {
      cwd: f.repository,
      encoding: "utf8",
      timeout: 10000,
      input:
        JSON.stringify({ type: "ready" }) +
        "\n" +
        JSON.stringify({ type: "remote_readback", acquisition_file: post }) +
        "\n",
    },
  )
  assert.match(stdout, /remote_write_intent/)
  assert.equal(inspectRemoteDelivery(f.root, f.run).status, "remote_delivery_complete")
})
