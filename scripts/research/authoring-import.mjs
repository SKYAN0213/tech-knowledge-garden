import fs from "node:fs"
import path from "node:path"
import { sha256, PUBLIC_ROOTS } from "./contracts.mjs"
import { authoringInventory } from "./authoring-transfer.mjs"
import {
  inspectedAuthoringRelease,
  assertNoUnresolvedAuthoringWrites,
} from "./authoring-execution.mjs"
import {
  atomicCreate,
  readJSON,
  safePath,
  withGardenOperationLock,
  withLock,
} from "./run-state.mjs"
import { runDeliveryCommand } from "./delivery-run.mjs"

const ROOT_ID = "1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD"
const bytes = (root, relative) => fs.readFileSync(safePath(root, relative))
const immutable = (root, relative, value) => {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n")
  if (!fs.existsSync(safePath(root, relative))) return atomicCreate(root, relative, data)
  if (!bytes(root, relative).equals(data)) throw Error("Authoring import evidence changed")
}

// Only transfer approved authoring and immutable evidence. Native pull-drive
// checks the full connector receipt; no collection result becomes an approval.
export async function importVerifiedAuthoring({
  root,
  sourceRoot,
  run,
  releasePath,
  snapshotFile,
  readbackFile,
  repository = process.cwd(),
  execute = runDeliveryCommand,
  now = Date.now,
}) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(run || "")) throw Error("Exact authoring import run required")
  repository = fs.realpathSync(repository)
  root = path.resolve(repository, root)
  sourceRoot = path.resolve(repository, sourceRoot)
  const base = `runs/${run}/authoring-import`
  return withLock(root, "authoring-import-" + run, () =>
    withGardenOperationLock(root, async () => {
      const action = async () => {
        assertNoUnresolvedAuthoringWrites(root)
        const prior = readJSON(root, base + "/receipt.json")
        if (
          prior &&
          (prior.schema !== "research-authoring-import/v1" ||
            prior.run_id !== run ||
            prior.status !== "canonical_verified")
        )
          throw Error("Invalid completed authoring import receipt")
        const verified = inspectedAuthoringRelease(sourceRoot, releasePath, {
          fresh: !prior,
          now: now(),
        })
        const snapshotBytes = fs.readFileSync(snapshotFile),
          receiptBytes = fs.readFileSync(readbackFile)
        if (snapshotBytes.length > 40 * 1048576 || receiptBytes.length > 8 * 1048576)
          throw Error("Authoring source input exceeds the bounded transfer limit")
        const snapshot = JSON.parse(snapshotBytes),
          readback = JSON.parse(receiptBytes)
        const sourceObserved = Date.parse(snapshot.exported_at)
        if (
          snapshot.schema !== "tech-drive-source/v1" ||
          snapshot.transport !== "codex-drive-connector" ||
          snapshot.complete !== true ||
          snapshot.root_folder_id !== ROOT_ID ||
          verified.plan.destination_folder_id !== ROOT_ID ||
          JSON.stringify(snapshot.roots) !== JSON.stringify(PUBLIC_ROOTS) ||
          snapshot.readback?.receipt_sha256 !== sha256(receiptBytes) ||
          readback.verified_at !== snapshot.exported_at ||
          !Number.isFinite(sourceObserved) ||
          sourceObserved < Date.parse(verified.execution.observed_at) ||
          (!prior && (sourceObserved > now() || now() - sourceObserved > 600000))
        )
          throw Error("Matching complete post-write Drive source proof required")
        const inventory = authoringInventory(path.join(repository, "vault"))
        const incoming = new Map((snapshot.files || []).map((r) => [r.path, r]))
        const declared = new Map(verified.plan.files.map((r) => [r.path, r]))
        const remoteProof = readJSON(
          sourceRoot,
          path.posix.dirname(verified.execution_path) + "/readback.json",
        )
        if (
          incoming.size !== snapshot.files?.length ||
          incoming.size !== new Set([...inventory.keys(), ...declared.keys()]).size
        )
          throw Error("Authoring source proof changes the complete path inventory")
        for (const [relative, local] of inventory) {
          const approved = declared.get(relative),
            post = incoming.get(relative)
          if (
            !post ||
            (approved
              ? ![approved.previous_sha256, approved.sha256].includes(local.sha256)
              : post.sha256 !== local.sha256)
          )
            throw Error("Unapproved canonical or remote authoring change: " + relative)
        }
        for (const [relative, approved] of declared) {
          const post = incoming.get(relative),
            captured = remoteProof.files.find((r) => r.path === relative)
          const metadata = readback.files?.find((r) => r.path === relative)
          if (
            !post ||
            post.sha256 !== approved.sha256 ||
            sha256(Buffer.from(post.content || "")) !== approved.sha256 ||
            !captured ||
            !metadata ||
            metadata.file_id !== captured.file_id ||
            metadata.modified_time !== captured.modified_at ||
            JSON.stringify(metadata.parent_ids) !== JSON.stringify([captured.parent_id]) ||
            metadata.sha256 !== captured.sha256
          )
            throw Error("Post-write source differs from the approved raw evidence: " + relative)
        }
        const input = {
          schema: "research-authoring-import-input/v1",
          run_id: run,
          repository,
          source_root: sourceRoot,
          release: { path: releasePath, sha256: verified.release_sha256 },
          execution: {
            path: verified.execution_path,
            sha256: sha256(bytes(sourceRoot, verified.execution_path)),
          },
          snapshot_sha256: sha256(snapshotBytes),
          readback_sha256: sha256(receiptBytes),
        }
        const existing = readJSON(root, base + "/input.json")
        if (existing && JSON.stringify(existing) !== JSON.stringify(input))
          throw Error("Pinned authoring import input changed; use a new run")
        if (prior) {
          if (
            prior.input_sha256 !== sha256(JSON.stringify(input)) ||
            [...incoming].some(([relative, row]) => inventory.get(relative)?.sha256 !== row.sha256)
          )
            throw Error("Completed authoring import no longer matches canonical bytes")
          inspectedAuthoringRelease(root, releasePath)
          const status = JSON.parse(
            await execute(
              "python3",
              ["scripts/pull-drive.py", "--verify-working-copy", "--repository", repository],
              repository,
            ),
          )
          if (
            status.verified_source_files !== incoming.size ||
            status.snapshot_sha256 !== prior.native_pull.snapshot_sha256
          )
            throw Error("Native canonical verification failed")
          return { ...prior, reused: true, apply_performed: false }
        }
        // Preflight every destination before touching the canonical authoring copy.
        const copies = new Map([
          [
            `runs/${verified.release.preview_run}/preview-manifest.json`,
            bytes(sourceRoot, `runs/${verified.release.preview_run}/preview-manifest.json`),
          ],
        ])
        const visit = (relative) => {
          for (const entry of fs.readdirSync(safePath(sourceRoot, relative), {
            withFileTypes: true,
          })) {
            const file = relative + "/" + entry.name
            safePath(sourceRoot, file)
            if (entry.isDirectory()) visit(file)
            else if (entry.isFile()) copies.set(file, bytes(sourceRoot, file))
            else throw Error("Non-regular authoring transfer evidence")
          }
        }
        visit(verified.base)
        if (
          copies.size > 2000 ||
          [...copies.values()].reduce((n, b) => n + b.length, 0) > 40 * 1048576
        )
          throw Error("Authoring evidence transfer exceeds the bounded limit")
        for (const [relative, value] of copies)
          if (fs.existsSync(safePath(root, relative)) && !bytes(root, relative).equals(value))
            throw Error("Canonical authoring evidence collision: " + relative)
        const args = [
          "scripts/pull-drive.py",
          "--snapshot",
          path.resolve(snapshotFile),
          "--readback",
          path.resolve(readbackFile),
          "--repository",
          repository,
        ]
        const dry = JSON.parse(await execute("python3", args, repository))
        if (
          !Array.isArray(dry.deleted) ||
          dry.deleted.length ||
          !Array.isArray(dry.updated) ||
          dry.updated.some((relative) => !declared.has(relative))
        )
          throw Error("Native authoring import delta exceeds the approved scope")
        immutable(root, base + "/input.json", input)
        immutable(root, base + "/source-snapshot.json", snapshotBytes)
        immutable(root, base + "/source-readback.json", receiptBytes)
        for (const [relative, value] of copies) immutable(root, relative, value)
        const applied = JSON.parse(await execute("python3", [...args, "--apply"], repository))
        const actual = authoringInventory(path.join(repository, "vault"))
        if (
          applied.deleted.length ||
          actual.size !== incoming.size ||
          [...incoming].some(([relative, row]) => actual.get(relative)?.sha256 !== row.sha256)
        )
          throw Error("Canonical authoring differs after the native Drive import")
        inspectedAuthoringRelease(root, releasePath, { fresh: true, now: now() })
        const result = {
          schema: "research-authoring-import/v1",
          run_id: run,
          input_sha256: sha256(JSON.stringify(input)),
          observed_at: new Date(now()).toISOString(),
          source_observed_at: snapshot.exported_at,
          status: "canonical_verified",
          files: actual.size,
          approved_files: declared.size,
          native_pull: applied,
          proof_files: copies.size,
          apply_performed: true,
          reused: false,
          candidate_published: false,
          public_deployment_verified: false,
          new_regular_operation_counted: false,
        }
        immutable(root, base + "/receipt.json", result)
        return result
      }
      return sourceRoot === root ? action() : withGardenOperationLock(sourceRoot, action)
    }),
  )
}
