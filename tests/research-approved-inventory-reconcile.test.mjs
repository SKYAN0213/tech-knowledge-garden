import test from "node:test"
import assert from "node:assert/strict"
import {
  buildApprovedInventoryReconciliation,
  DRIVE_ROOT_ID,
  DRIVE_ROOTS,
} from "../scripts/research/approved-inventory-reconcile.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const stamp = "2026-09-30T12:51:59.000Z"
const sourceUrl = "https://example.org/research/robotics?utm_source=rss"

function fixture() {
  const files = DRIVE_ROOTS.map(([name], index) => {
    const content = `# ${name}\n`
    return {
      path: `${name}/fixture.md`,
      content,
      sha256: sha256(content),
      file_id: `file-${index}`,
      parent_id: DRIVE_ROOTS[index][1],
      parent_ids: [DRIVE_ROOTS[index][1]],
      size: Buffer.byteLength(content),
      modified_time: stamp,
    }
  })
  const readback = {
    schema: "tech-drive-connector-readback/v1",
    root_folder_id: DRIVE_ROOT_ID,
    roots: DRIVE_ROOTS.map(([name, id]) => ({ name, id })),
    verified_at: stamp,
    folders: [],
    files: files.map(({ path, file_id, parent_id, parent_ids, size, modified_time, sha256 }) => ({
      path,
      file_id,
      parent_id,
      parent_ids,
      size,
      modified_time,
      sha256,
    })),
  }
  const readbackSha256 = sha256(JSON.stringify(readback))
  const driveSnapshot = {
    schema: "tech-drive-source/v1",
    complete: true,
    root_folder_id: DRIVE_ROOT_ID,
    roots: DRIVE_ROOTS.map(([name]) => name),
    exported_at: stamp,
    readback: {
      schema: readback.schema,
      receipt_sha256: readbackSha256,
      source_files: files.length,
    },
    files: files.map(({ path, content, sha256 }) => ({ path, content, sha256 })),
  }
  const inventory = {
    schema: "research-retrospective-inventory/v1",
    observed_at: stamp,
    hashes: Object.fromEntries(files.map(({ path, sha256 }) => [path, sha256])),
    events: [
      {
        event_id: "event-verified",
        review_status: "verified",
        date_review_required: false,
        appearances: [{ source_urls: [sourceUrl] }],
      },
      {
        event_id: "event-review",
        review_status: "review_required",
        date_review_required: true,
        appearances: [{ source_urls: ["https://example.org/research/ambiguous"] }],
      },
    ],
  }
  const handoff = {
    schema: "research-editorial-handoff/v1",
    daily_run: "daily-test-v1",
    authority: "local_vault_unreconciled",
    candidate_published: false,
    drive_verified: false,
    public_verified: false,
    pending: [
      { key: "exact", event_id: "event-verified", source_urls: [sourceUrl] },
      { key: "url-only", event_id: null, source_urls: [sourceUrl] },
      { key: "conflict", event_id: "event-verified", source_urls: ["https://example.org/other"] },
      {
        key: "ambiguous-event",
        event_id: "event-review",
        source_urls: ["https://example.org/research/ambiguous"],
      },
      { key: "duplicate-a", source_urls: ["https://example.org/duplicate"] },
      { key: "duplicate-b", source_urls: ["https://example.org/duplicate"] },
    ],
    observed_resolved: [],
  }
  return {
    files,
    readback,
    driveReadback: readback,
    readbackSha256,
    driveReadbackSha256: readbackSha256,
    driveSnapshot,
    inventory,
    handoff,
  }
}

test("reconciliation matches exact event identity and source while keeping every decision manual", () => {
  const input = fixture()
  const result = buildApprovedInventoryReconciliation(input)
  const byKey = Object.fromEntries(result.candidates.map((row) => [row.candidate_key, row]))

  assert.equal(byKey.exact.classification, "exact_source_and_verified_event")
  assert.equal(byKey["url-only"].classification, "exact_source_existing_event_id_unconfirmed")
  assert.equal(byKey.conflict.classification, "event_id_source_url_conflict")
  assert.equal(byKey["ambiguous-event"].classification, "exact_source_but_event_review_incomplete")
  assert.equal(result.duplicate_source_groups.length, 2)
  assert.ok(result.duplicate_source_groups.every((group) => group.automatic_merge === false))
  assert.ok(
    result.candidates.every(
      (row) => row.automatic_merge === false && row.automatic_approval === false,
    ),
  )
  assert.equal(result.candidate_published, false)
  assert.equal(result.drive_written, false)
  assert.equal(result.public_verified, false)
})

test("reconciliation rejects unbound or incomplete source snapshots and inventory drift", () => {
  const input = fixture()
  assert.throws(
    () => buildApprovedInventoryReconciliation({ ...input, driveReadbackSha256: "0".repeat(64) }),
    /Complete Drive source snapshot/,
  )

  const incomplete = fixture()
  incomplete.driveReadback.files[0].sha256 = "0".repeat(64)
  assert.throws(() => buildApprovedInventoryReconciliation(incomplete), /disagree/)

  const drifted = fixture()
  drifted.inventory.hashes[drifted.files[0].path] = "0".repeat(64)
  assert.throws(() => buildApprovedInventoryReconciliation(drifted), /does not match/)
})
