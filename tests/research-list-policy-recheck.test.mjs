import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { executeListScan, listScanPolicyRecheckOptions } from "../scripts/research/list-scan-command.mjs"
import { SourceFetcher } from "../scripts/research/fetch.mjs"

test("explicit list policy maintenance zero survives native input and fetch options while omitted inputs stay unchanged", () => {
  const base = { schema: "research-list-run-input/v2", channel_id: "fixture", collection_basis: {} }
  assert.deepEqual({ ...base, ...listScanPolicyRecheckOptions(undefined) }, base)
  assert.deepEqual(listScanPolicyRecheckOptions(0), { policy_recheck_limit: 0 })
  const input = { ...base, ...listScanPolicyRecheckOptions(0) }
  const fetcher = new SourceFetcher("/fixture", { ...listScanPolicyRecheckOptions(0) })
  assert.equal(input.policy_recheck_limit, fetcher.options.policy_recheck_limit)
  assert.equal(fetcher.options.policy_recheck_limit, 0)
  assert.equal(new SourceFetcher("/fixture").options.policy_recheck_limit, undefined)
  assert.deepEqual(listScanPolicyRecheckOptions(3), { policy_recheck_limit: 3 })
})

test("invalid list policy limits fail before creating a native run or requesting any source", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "list-policy-options-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const invalid of [-1, 4, NaN, Infinity, 1.5, "0", null, false]) {
    await assert.rejects(executeListScan({ root, run: "fixture", channel: ["nasa-technology-rss"], since: "2026-10-09", until: "2026-10-12", "policy-recheck-limit": invalid }), /0\.\.3/)
    assert.equal(fs.existsSync(path.join(root, "runs")), false)
  }
})
