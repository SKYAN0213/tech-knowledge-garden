import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { collectionBasis } from "../scripts/research/scan-basis.mjs"
import {
  dailySourcePaths,
  dailyScan,
  reconcileSupplementalScan,
} from "../scripts/research/daily-scan.mjs"
import { main as research } from "../scripts/research.mjs"
import { main as scan } from "../scripts/research-scan.mjs"

test("custom daily roots require an explicit backlog before locks, plans or source requests", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "daily-backlog-boundary-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const mode of ["plan-only", "execute", "resume", "handoff"])
    await assert.rejects(
      dailyScan({ root, runId: "daily-20261004-isolated", mode }),
      /explicit --backlog/,
    )
  await assert.rejects(
    reconcileSupplementalScan({ root, scanRun: "stored", reconciliationRun: "reconcile" }),
    /explicit --backlog/,
  )
  await assert.rejects(
    dailyScan({ root, runId: "daily-20261004-isolated", mode: "execute", backlogFile: "" }),
    /non-empty/,
  )
  assert.deepEqual(fs.readdirSync(root), [])
  for (const entry of [research, scan])
    await assert.rejects(
      entry([
        "scan-list",
        "--root",
        root,
        "--run",
        "isolated-merge",
        "--channel",
        "etnews-ai-rss",
        "--since",
        "2026-10-02",
        "--until",
        "2026-10-04",
        "--merge-backlog",
      ]),
      /cannot use --merge-backlog/,
    )
  assert.deepEqual(fs.readdirSync(root), [])
})

test("collection evidence ignores editorial/archive commands and still binds collection entry, parser and worker", (t) => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "collection-boundary-")))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  for (const file of [
    ...dailySourcePaths(),
    "scripts/research.mjs",
    "scripts/research/archive-closure.mjs",
    "scripts/research/editor.mjs",
  ]) {
    const dest = path.join(repo, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  }
  const route = { channel_id: "fixture", method: "rss", url: "https://example.org/feed" }
  const basis = collectionBasis(route, [], repo)
  for (const file of [
    "scripts/research.mjs",
    "scripts/research/archive-closure.mjs",
    "scripts/research/editor.mjs",
  ]) {
    fs.appendFileSync(path.join(repo, file), "\n// unrelated change\n")
    assert.deepEqual(collectionBasis(route, [], repo), basis)
  }
  assert.equal(dailySourcePaths().includes("scripts/research.mjs"), false)
  for (const file of [
    "scripts/research-scan.mjs",
    "scripts/research/list-scan-command.mjs",
    "scripts/research/parser.mjs",
    "scripts/research/supporting-sources.mjs",
    "integrations/research-worker/worker.py",
  ]) {
    assert.ok(dailySourcePaths().includes(file))
    const previous = collectionBasis(route, [], repo)
    fs.appendFileSync(path.join(repo, file), "\n# collection change\n")
    assert.notDeepEqual(collectionBasis(route, [], repo), previous)
  }
  assert.notDeepEqual(
    collectionBasis({ ...route, url: "https://example.org/new" }, [], repo),
    collectionBasis(route, [], repo),
  )
  assert.notDeepEqual(
    collectionBasis(route, [{ id: "new-profile" }], repo),
    collectionBasis(route, [], repo),
  )
})

test("both collection CLIs reject invalid windows before creating artifacts; dedicated CLI rejects model and publication options", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "collection-input-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const entry of [research, scan]) {
    for (const [since, until] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-10-04", "2026-10-04"],
      ["2026-10-05", "2026-10-04"],
    ]) {
      await assert.rejects(
        entry([
          "scan-list",
          "--root",
          root,
          "--run",
          "invalid",
          "--channel",
          "etnews-ai-rss",
          "--since",
          since,
          "--until",
          until,
        ]),
        /day window/,
      )
      assert.equal(fs.existsSync(path.join(root, "runs")), false)
    }
  }
  for (const flag of ["--model", "--review", "--approved-run"]) {
    await assert.rejects(scan(["scan-list", flag, "unsupported"]), /Unknown option/)
  }
})
