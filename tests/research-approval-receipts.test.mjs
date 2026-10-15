import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { atomicWrite } from "../scripts/research/run-state.mjs"
import {
  createApprovalReceiptSnapshot,
  findApprovalReceipts,
} from "../scripts/research/approval-receipts.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "approval-receipts-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const receipt = {
    approved_run: "article",
    candidate_key: "source-one",
    event_id: "event-one",
    existing_editorial_approval: { prior_approved_run: "prior" },
    candidate_published: false,
  }
  atomicWrite(root, "runs/link/candidate-approval.json", receipt)
  atomicWrite(root, "runs/other/candidate-approval.json", {
    ...receipt,
    approved_run: "other",
    candidate_key: "source-two",
  })
  atomicWrite(root, "runs/empty/state.json", { status: "unrelated" })
  return {
    root,
    receipt,
    file: "runs/link/candidate-approval.json",
    snapshot: createApprovalReceiptSnapshot(root),
  }
}

test("one approval reading phase shares its scan, isolates returned values and validates at closure", (t) => {
  const f = fixture(t),
    options = { approvalSnapshot: f.snapshot }
  assert.deepEqual(f.snapshot.statistics(), { scans: 0, lookups: 0, readbacks: 0, receipts: 0 })
  f.snapshot.assertCurrent()
  assert.equal(f.snapshot.statistics().scans, 0)
  const result = findApprovalReceipts(
    f.root,
    { approvedRun: "article", candidateKey: "source-one", eventId: "event-one" },
    options,
  )
  assert.deepEqual(result, [{ file: f.file, value: f.receipt }])
  result[0].value.candidate_published = true
  for (let i = 0; i < 30; i++)
    assert.equal(
      findApprovalReceipts(
        f.root,
        { approvedRun: "article", priorApprovedRun: "prior" },
        options,
      )[0].value.candidate_published,
      false,
    )
  assert.equal(f.snapshot.statistics().scans, 1)
  assert.equal(f.snapshot.statistics().lookups, 31)
  assert.equal(findApprovalReceipts(f.root, { approvedRun: "missing" }, options).length, 0)
  f.snapshot.assertCurrent()
  assert.equal(f.snapshot.statistics().scans, 2)
})

test("selected raw receipt edits are rejected without trusting cached JSON or metadata", (t) => {
  const f = fixture(t),
    options = { approvalSnapshot: f.snapshot },
    file = path.join(f.root, f.file)
  findApprovalReceipts(f.root, { approvedRun: "article" }, options)
  const bytes = fs.readFileSync(file),
    before = fs.statSync(file)
  const changed = Buffer.from(
    bytes.toString().replace('"candidate_published": false', '"candidate_published": true '),
  )
  assert.equal(changed.length, bytes.length)
  fs.writeFileSync(file, changed)
  fs.utimesSync(file, before.atime, before.mtime)
  assert.throws(
    () => findApprovalReceipts(f.root, { approvedRun: "article" }, options),
    /snapshot changed/,
  )
  assert.throws(() => f.snapshot.assertCurrent(), /inventory changed/)
  fs.writeFileSync(file, bytes)
  f.snapshot.assertCurrent()
})

test("phase closure catches new conflicts in existing folders and a fresh phase sees every native receipt", (t) => {
  const f = fixture(t),
    options = { approvalSnapshot: f.snapshot }
  findApprovalReceipts(f.root, { approvedRun: "article" }, options)
  atomicWrite(f.root, "runs/empty/candidate-approval.json", {
    ...f.receipt,
    candidate_published: true,
  })
  assert.throws(() => f.snapshot.assertCurrent(), /inventory changed/)
  assert.equal(findApprovalReceipts(f.root, { approvedRun: "article" }).length, 2)
  const fresh = createApprovalReceiptSnapshot(f.root)
  assert.equal(
    findApprovalReceipts(f.root, { approvedRun: "article" }, { approvalSnapshot: fresh }).length,
    2,
  )
  fresh.assertCurrent()
})

test("phase closure detects unselected edits and receipt removal", (t) => {
  const f = fixture(t)
  findApprovalReceipts(f.root, { approvedRun: "article" }, { approvalSnapshot: f.snapshot })
  atomicWrite(f.root, "runs/other/candidate-approval.json", {
    ...f.receipt,
    approved_run: "article",
    candidate_published: true,
  })
  assert.throws(() => f.snapshot.assertCurrent(), /inventory changed/)
  const fresh = createApprovalReceiptSnapshot(f.root)
  findApprovalReceipts(f.root, { approvedRun: "article" }, { approvalSnapshot: fresh })
  fs.unlinkSync(path.join(f.root, f.file))
  assert.throws(() => fresh.assertCurrent(), /inventory changed/)
})

test("approval phases reject fake snapshots, wrong roots, unknown lookup keys and unreadable native data", (t) => {
  const f = fixture(t)
  assert.throws(
    () => findApprovalReceipts(f.root, { approvedRun: "article" }, { approvalSnapshot: {} }),
    /Native approval/,
  )
  assert.throws(
    () =>
      findApprovalReceipts(
        f.root + "/other",
        { approvedRun: "article" },
        { approvalSnapshot: f.snapshot },
      ),
    /another root/,
  )
  for (const query of [
    {},
    { approvedRun: "../article" },
    { approvedRun: "article", status: "approved" },
    { approvedRun: "article", eventId: null },
  ])
    assert.throws(() => findApprovalReceipts(f.root, query), /Exact native/)
  fs.writeFileSync(path.join(f.root, f.file), "invalid JSON")
  assert.throws(() => findApprovalReceipts(f.root, { approvedRun: "article" }), SyntaxError)
  fs.unlinkSync(path.join(f.root, f.file))
  fs.symlinkSync(path.join(f.root, "runs/other/candidate-approval.json"), path.join(f.root, f.file))
  assert.throws(() => findApprovalReceipts(f.root, { approvedRun: "article" }), /Symlink/)
})
