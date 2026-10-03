import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { registry } from "../scripts/research/discovery.mjs"
import { collectionBasis } from "../scripts/research/scan-basis.mjs"
import {
  verifySourceOnboarding,
  activateSourceOnboarding,
} from "../scripts/research/source-onboarding.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import { storeParseArtifact, articleContentFingerprint } from "../scripts/research/parser.mjs"

const read = (file) => JSON.parse(fs.readFileSync(file))
const channel = "catalog-x46"
function fixture(t) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-onboarding-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repo, "data"))
  for (const file of [
    "research-source-channels",
    "research-watchlist",
    "research-acquisition",
    "research-source-recipes",
    "research-daily-routes",
  ])
    fs.copyFileSync(`data/${file}.json`, path.join(repo, `data/${file}.json`))
  const dailyFile = path.join(repo, "data/research-daily-routes.json"),
    daily = read(dailyFile)
  daily.routes = daily.routes.filter((r) => r.channel_id !== channel)
  fs.writeFileSync(dailyFile, JSON.stringify(daily))
  const channelsFile = path.join(repo, "data/research-source-channels.json"),
    channels = read(channelsFile)
  channels.channels.find((c) => c.id === channel).onboarding.status = "configured"
  fs.writeFileSync(channelsFile, JSON.stringify(channels))
  fs.cpSync("scripts/research", path.join(repo, "scripts/research"), { recursive: true })
  fs.copyFileSync("scripts/research-scan.mjs", path.join(repo, "scripts/research-scan.mjs"))
  fs.mkdirSync(path.join(repo, "integrations/research-worker"), { recursive: true })
  fs.copyFileSync(
    "integrations/research-worker/worker.py",
    path.join(repo, "integrations/research-worker/worker.py"),
  )
  const root = path.join(repo, ".local/research/local-ai")
  const routes = registry(
    read(path.join(repo, "data/research-source-channels.json")),
    read(path.join(repo, "data/research-watchlist.json")),
    read(path.join(repo, "data/research-acquisition.json")),
    read(path.join(repo, "data/research-source-recipes.json")),
  )
  const route = routes.find((r) => r.channel_id === channel)
  const profiles = read(path.join(repo, "data/research-acquisition.json")).article_profiles
  const basis = collectionBasis(route, profiles, repo)
  for (const [run, empty] of [
    ["normal", false],
    ["empty", true],
  ]) {
    const url = empty
      ? route.url
      : "https://www.krcert.or.kr/kr/bbs/view.do?bbsId=B0000133&nttId=123"
    const bytes = Buffer.from(empty ? "Dated empty listing" : "Confirmed original article")
    const id = sourceId(url),
      hash = sha256(bytes),
      parseId = sha256(run)
    const document = {
      original_url: url,
      final_url: url,
      source_id: id,
      source_version_id: `${id}:${hash}`,
      body_path: `fixtures/${run}.bin`,
      body_sha256: hash,
      observed_at: "2026-10-03T00:00:00Z",
      fetch_status: "captured",
      policy_status: "checked",
    }
    atomicWrite(root, document.body_path, bytes)
    const parsed = {
      schema_version: "source-parse/v1",
      source_id: id,
      source_version_id: document.source_version_id,
      parse_id: parseId,
      parser: { id: "controlled-fixture" },
      status: "extracted",
      title: "Confirmed title",
      dates: { published_at: empty ? null : "2026-10-01", observed_at: document.observed_at },
      quality: { required_fields_present: true, missing_pages: [] },
      blocks: [
        {
          block_id: parseId + ":block-0001",
          kind: "paragraph",
          text: "Confirmed original article",
          locator: { text_hash: sha256("Confirmed original article") },
        },
      ],
    }
    storeParseArtifact(root, parsed)
    const candidates = empty
      ? []
      : [
          {
            key: "source-" + id,
            title: parsed.title,
            source_urls: [url],
            source_published_at: "2026-10-01",
            article_source_version_id: document.source_version_id,
            article_parse_id: parseId,
            article_observed_at: document.observed_at,
            article_content_sha256: articleContentFingerprint(parsed),
            review_status: "unreviewed",
            discovered_at: document.observed_at,
            discovery: [],
          },
        ]
    atomicWrite(root, `runs/${run}/documents.json`, [document])
    atomicWrite(root, `runs/${run}/parses.json`, [parsed])
    atomicWrite(root, `runs/${run}/candidates.json`, candidates)
    atomicWrite(root, `runs/${run}/list-pages.json`, [])
    atomicWrite(root, `runs/${run}/list-scan.json`, {
      status: "window_scanned",
      channel_id: channel,
      candidate_count: candidates.length,
      window: {
        since: empty ? "2026-10-02" : "2026-10-01",
        until_exclusive: empty ? "2026-10-03" : "2026-10-02",
      },
    })
    atomicWrite(root, `runs/${run}/collection-basis.json`, basis)
    atomicWrite(root, `runs/${run}/state.json`, {
      schema: "research-run/v1",
      run_id: run,
      stages: {
        "collection-basis": {
          status: "complete",
          input_hash: sha256(JSON.stringify(basis)),
          result_hash: sha256(JSON.stringify(basis)),
          result_path: `runs/${run}/collection-basis.json`,
        },
      },
    })
  }
  return { repo, root, channel, baselineRun: "normal", emptyRun: "empty" }
}
const reuse = { resume: async () => {} }

test("verified real-path contract activates only its registered route with backups and idempotence", async (t) => {
  const options = fixture(t)
  const before = read(path.join(options.repo, "data/research-daily-routes.json"))
  const verified = await verifySourceOnboarding(options, reuse)
  const dry = await activateSourceOnboarding({ ...options, receipt: verified.receipt })
  assert.equal(dry.status, "dry_run")
  assert.equal(dry.daily_after, before.routes.filter((r) => r.enabled).length + 1)
  assert.deepEqual(read(path.join(options.repo, "data/research-daily-routes.json")), before)
  const applied = await activateSourceOnboarding({
    ...options,
    receipt: verified.receipt,
    apply: true,
  })
  assert.equal(applied.status, "applied")
  const after = read(path.join(options.repo, "data/research-daily-routes.json"))
  assert.deepEqual(after.routes.slice(0, before.routes.length), before.routes)
  assert.deepEqual(after.routes.at(-1), {
    channel_id: channel,
    enabled: true,
    baseline_run: "normal",
  })
  assert.equal(
    read(path.join(options.repo, "data/research-source-channels.json")).channels.find(
      (c) => c.id === channel,
    ).onboarding.status,
    "verified",
  )
  assert.equal(
    (await activateSourceOnboarding({ ...options, receipt: verified.receipt, apply: true })).status,
    "unchanged",
  )
  assert.ok(
    fs.existsSync(
      path.join(
        options.root,
        applied.receipt.replace("applied.json", "research-source-channels.json.before"),
      ),
    ),
  )
  assert.equal(applied.candidate_published, false)
})

test("incomplete, future or empty-as-normal evidence cannot pass verification", async (t) => {
  const o = fixture(t),
    file = path.join(o.root, "runs/normal/list-scan.json"),
    before = read(file)
  for (const change of [
    { status: "incomplete" },
    { window: { since: "2100-01-01", until_exclusive: "2100-01-02" } },
  ]) {
    fs.writeFileSync(file, JSON.stringify({ ...before, ...change }))
    await assert.rejects(verifySourceOnboarding(o, reuse))
  }
  fs.writeFileSync(file, JSON.stringify(before))
  await assert.rejects(
    verifySourceOnboarding({ ...o, baselineRun: "empty", emptyRun: "normal" }, reuse),
    /Normal candidates/,
  )
})

test("stale collection code and settings fail while progress metadata does not change collection basis", async (t) => {
  const o = fixture(t),
    file = path.join(o.repo, "data/research-source-channels.json")
  const original = read(file)
  original.channels.find((c) => c.id === channel).onboarding.observation = "More evidence reviewed"
  fs.writeFileSync(file, JSON.stringify(original))
  await verifySourceOnboarding(o, reuse)
  original.channels.find((c) => c.id === channel).sectors = ["AI"]
  fs.writeFileSync(file, JSON.stringify(original))
  await assert.rejects(verifySourceOnboarding(o, reuse), /missing or stale/)
})

test("resume mutation or post-verification artifact tampering blocks activation without changing daily routes", async (t) => {
  const o = fixture(t)
  const verified = await verifySourceOnboarding(o, reuse)
  const before = fs.readFileSync(path.join(o.repo, "data/research-daily-routes.json"))
  const file = path.join(o.root, "runs/normal/list-scan.json")
  const summary = read(file)
  fs.writeFileSync(file, JSON.stringify({ ...summary, extra: "tampered" }))
  await assert.rejects(
    activateSourceOnboarding({ ...o, receipt: verified.receipt, apply: true }),
    /evidence changed/,
  )
  assert.deepEqual(fs.readFileSync(path.join(o.repo, "data/research-daily-routes.json")), before)
  fs.writeFileSync(file, JSON.stringify(summary, null, 2) + "\n")
  await assert.rejects(
    verifySourceOnboarding(o, {
      resume: async () => {
        fs.appendFileSync(file, " ")
      },
    }),
    /Resume replaced/,
  )
})
