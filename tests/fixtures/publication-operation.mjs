import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { sha256 } from "../../scripts/research/contracts.mjs"
import {
  compareAuthoringRemote,
  DRIVE_AUTHORING_ROOTS,
} from "../../scripts/research/authoring-transfer.mjs"
import { reconcileAuthoringExecution } from "../../scripts/research/authoring-execution.mjs"
import { publicReadbackPlan } from "../../scripts/research/public-readback.mjs"

export async function fixture(t, rootRelative = ".local/research") {
  const repository = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "publication-operation-")),
  )
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const root = path.join(repository, rootRelative),
    run = "operation",
    previewRun = "preview",
    now = Date.now() - 1000
  const put = (relative, value) => {
    const file = path.join(repository, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
    )
    return file
  }
  const privatePut = (relative, value) => put(rootRelative + "/" + relative, value)
  const edition = "Editions/2026/01/issue.md",
    content = "# Reviewed news\n",
    event = "1".repeat(16)
  put("vault/" + edition, content)
  const preview = {
    schema: "private-reader-preview/v1",
    run_id: previewRun,
    editions: [{ path: edition, sha256: sha256(content) }],
    knowledge: [],
    consistency: {
      articles: [
        {
          event_id: event,
          appearances: [
            { html: "public/briefings/2026/01/issue.html", digest: "digest/2026/01/issue.md" },
          ],
        },
      ],
    },
  }
  const base = `runs/${previewRun}/drive-authoring`
  const manifest = privatePut(`runs/${previewRun}/preview-manifest.json`, preview)
  const plan = {
    schema: "research-authoring-transfer/v1",
    preview_run: previewRun,
    preview_sha256: sha256(fs.readFileSync(manifest)),
    destination_folder_id: "root",
    roots: DRIVE_AUTHORING_ROOTS,
    files: [
      {
        path: edition,
        operation: "update",
        previous_sha256: sha256("old"),
        sha256: sha256(content),
        bytes: Buffer.byteLength(content),
        staged_path: `${base}/files/${edition}`,
      },
    ],
  }
  privatePut(base + "/transfer-plan.json", plan)
  privatePut(plan.files[0].staged_path, content)
  const folder = { path: "Editions/2026", id: "year", parent_id: DRIVE_AUTHORING_ROOTS.Editions },
    month = { path: "Editions/2026/01", id: "month", parent_id: "year" }
  const observation = {
    schema: "research-authoring-remote-observation/v1",
    root_folder_id: "root",
    observed_at: new Date(now).toISOString(),
    folders: [folder, month],
    listings: [
      {
        path: "Editions/2026/01",
        id: "month",
        complete: true,
        files: [
          {
            name: "issue.md",
            id: "existing",
            parent_id: "month",
            modified_at: new Date(now - 3600000).toISOString(),
            sha256: sha256("old"),
          },
        ],
      },
    ],
  }
  const input_sha256 = {
    plan: sha256(fs.readFileSync(path.join(root, base + "/transfer-plan.json"))),
    manifest: plan.preview_sha256,
    review: sha256("review"),
    snapshot: sha256("snapshot"),
    observation: sha256("observation"),
  }
  const release = {
    schema: "research-authoring-release/v1",
    preview_run: previewRun,
    input_sha256,
    operations: compareAuthoringRemote(plan, observation, { now }).operations,
    release_approved: true,
    upload_allowed: true,
  }
  const releasePath = base + "/releases/" + sha256(JSON.stringify(input_sha256)) + ".json"
  privatePut(releasePath, release)
  Object.assign(observation.listings[0].files[0], {
    modified_at: observation.observed_at,
    sha256: sha256(content),
  })
  const rawPath = "capture/raw.bin"
  privatePut(rawPath, content)
  const readback = {
    schema: "research-authoring-readback/v1",
    observed_at: observation.observed_at,
    files: [
      {
        path: edition,
        file_id: "existing",
        parent_id: "month",
        mime_type: "text/markdown",
        shared: false,
        modified_at: observation.observed_at,
        raw_path: rawPath,
        bytes: Buffer.byteLength(content),
        sha256: sha256(content),
      },
    ],
  }
  const execution = await reconcileAuthoringExecution({
    root,
    releasePath,
    observationFile: privatePut("capture/observation.json", observation),
    readbackFile: privatePut("capture/readback.json", readback),
    now,
  })
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim()
  git("init", "-q")
  git("config", "user.name", "Test")
  git("config", "user.email", "test@example.invalid")
  git("add", "vault")
  git("commit", "-qm", "Reviewed authoring")
  const commit = git("rev-parse", "HEAD"),
    pushPath = "publication/push-attempts/actual-local-commit.json"
  const push = {
    schema: "publication-push-receipt/v1",
    attempt_id: "actual-local-commit",
    remote: "origin",
    branch: "main",
    created_at: new Date().toISOString(),
    local_commit: commit,
    remote_after_sha: commit,
    status: "remote_confirmed",
    remote_before_sha: null,
    readback_error: false,
    push_command_error: false,
  }
  privatePut(pushPath, push)
  const deployment = {
    status: "completed",
    conclusion: "success",
    headSha: commit,
    url: "https://github.com/SKYAN0213/tech-knowledge-garden/actions/runs/123",
    jobs: ["build", "deploy"].map((name) => ({ name, status: "completed", conclusion: "success" })),
  }
  put(".local/site-notes.json", [])
  for (const f of [
    "drive-sync.json",
    "briefing.xml",
    "reader-index.json",
    "knowledge-graph.json",
    "static/contentIndex.json",
    "reader.css",
    `news/${event}.html`,
    "briefings/2026/01/issue.html",
  ])
    put("public/" + f, "artifact:" + f)
  put("public/reader.js", 'import("./chunks/connection-map-AAA111.js");')
  put("public/chunks/connection-map-AAA111.js", "map")
  put(`vault/News/${event}.md`, "news")
  put("digest/2026/01/issue.md", "digest")
  const options = { root, run, repository },
    rbOptions = { root, run: "readback", previewRun, repository, commit, deployment }
  const publicPlan = publicReadbackPlan({ repository, preview, commit, deployment })
  let calls = 0
  const fetchImpl = async (url) => {
    calls++
    const row = publicPlan.files.find((r) => r.url === url)
    return new Response(
      fs.readFileSync(path.join(repository, row?.local || publicPlan.reader_module.local)),
    )
  }
  return {
    ...options,
    options,
    rbOptions,
    now,
    releasePath,
    pushPath,
    push,
    deployment,
    privatePut,
    put,
    git,
    edition,
    execution,
    fetchImpl,
    expectedReadbackCalls: publicPlan.files.length + 1,
    calls: () => calls,
  }
}
