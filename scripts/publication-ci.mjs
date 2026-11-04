import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { nonContentChanges, publicationContentPaths } from "./publication-state.mjs"

// These names are the required, independently observed GitHub job steps. A
// successful workflow or a successful fast build alone is not full CI proof.
export const FULL_PROOF_STEPS = Object.freeze([
  "Full: research MCP dependencies",
  "Full: research MCP regression",
  "Full: fixture metadata repair",
  "Full: storage capacity policy",
  "Full: Drive regression",
  "Full: connector snapshot",
  "Full: WebsiteData export",
  "Full: Python dependencies",
  "Full: PDF context and publisher profiles",
  "Full: browser dependencies",
  "Full: garden regression",
])
const repositoryName = "SKYAN0213/tech-knowledge-garden"
const workflowPath = ".github/workflows/publish.yaml"
const shaPattern = /^[a-f0-9]{40}$/
const idPattern = /^[1-9][0-9]*$/
const singleFiles = new Set(
  publicationContentPaths.filter((entry) => /\.(?:md|xml|json)$/.test(entry)),
)
const contentPath = (name) =>
  publicationContentPaths.some((entry) =>
    singleFiles.has(entry) ? name === entry : name === entry || name.startsWith(entry + "/"),
  )
const full = (reason, safe = true) => ({ mode: "full", reason, safe_to_publish: safe })

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
}
const gitText = (cwd, ...args) => git(cwd, args, { encoding: "utf8" }).trim()
function isAncestor(cwd, ancestor, head) {
  try {
    git(cwd, ["merge-base", "--is-ancestor", ancestor, head])
    return true
  } catch {
    return false
  }
}
function hasChangedUnsafePath(cwd, before, after) {
  // -z and --no-renames make both sides of a rename independently visible.
  // Reject symlink and submodule transitions even under a content directory.
  const fields = git(cwd, ["diff", "--raw", "-z", "--no-renames", before, after])
    .toString("utf8")
    .split("\0")
  if (fields.at(-1) !== "") throw Error("Truncated Git diff")
  fields.pop()
  if (fields.length % 2) throw Error("Unexpected Git diff record")
  for (let i = 0; i < fields.length; i += 2) {
    const meta = /^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ [A-Z]$/.exec(fields[i])
    const name = fields[i + 1]
    if (
      !meta ||
      !name ||
      !contentPath(name) ||
      ["120000", "160000"].includes(meta[1]) ||
      ["120000", "160000"].includes(meta[2])
    )
      return true
  }
  return false
}
function contentAncestors(cwd, head, targetShas) {
  // Inspect the linear history once, not once per GitHub run. Stop at the
  // first code/config change, merge or bounded-history limit. Each intermediate
  // commit is checked, including a change that was subsequently reverted.
  const rows = gitText(cwd, "rev-list", "--parents", "--first-parent", "--max-count=1001", head)
    .split("\n")
    .filter(Boolean)
  const commits = new Set([head]),
    outstanding = new Set(targetShas)
  outstanding.delete(head)
  if (!outstanding.size) return commits
  let current = head
  for (const row of rows) {
    const values = row.split(" ")
    if (values.length !== 2 || values[0] !== current || !shaPattern.test(values[1])) break
    const parent = values[1]
    if (hasChangedUnsafePath(cwd, parent, current)) break
    commits.add(parent)
    outstanding.delete(parent)
    if (!outstanding.size) break
    current = parent
  }
  return commits
}
function dirtyPaths(cwd) {
  const result = git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  return result.length > 0
}
function unsafeWorkingContent(cwd) {
  const raw = git(cwd, ["diff", "--raw", "-z", "--no-renames", "HEAD"]).toString("utf8").split("\0")
  if (raw.at(-1) !== "") throw Error("Truncated Git working diff")
  raw.pop()
  if (raw.length % 2) throw Error("Unexpected Git working diff")
  const paths = []
  for (let i = 0; i < raw.length; i += 2) {
    const meta = /^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ [A-Z]$/.exec(raw[i])
    if (
      !meta ||
      !contentPath(raw[i + 1]) ||
      ["120000", "160000"].includes(meta[1]) ||
      ["120000", "160000"].includes(meta[2])
    )
      return true
    paths.push(raw[i + 1])
  }
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
  if (untracked.at(-1) !== "") throw Error("Truncated untracked list")
  untracked.pop()
  for (const name of [...paths, ...untracked]) {
    if (!contentPath(name)) return true
    const target = path.join(cwd, name)
    const stat = fs.lstatSync(target, { throwIfNoEntry: false })
    if (stat && !stat.isFile()) return true
    // A symlink ancestor can redirect a regular-looking leaf outside the tree.
    let current = cwd
    for (const part of name.split("/").slice(0, -1)) {
      current = path.join(current, part)
      const parent = fs.lstatSync(current, { throwIfNoEntry: false })
      if (parent?.isSymbolicLink()) return true
    }
  }
  return git(cwd, ["diff", "--name-only", "--diff-filter=U", "-z"]).length > 0
}
export function safePublicationWorktree(cwd) {
  try {
    return !nonContentChanges(cwd) && !unsafeWorkingContent(cwd)
  } catch {
    return false
  }
}
function validRun(run, head, repository, currentRunId) {
  if (
    !run ||
    !idPattern.test(String(run.id)) ||
    String(run.id) === String(currentRunId) ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    !shaPattern.test(run.head_sha || "") ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.path?.split("@")[0] !== workflowPath
  )
    return false
  // Non-main history is useful only as a full predeployment run of this exact
  // commit. A proof for some other branch's ancestor is never adopted.
  return run.head_branch === "main" || (run.head_sha === head && run.event === "workflow_dispatch")
}
function validJobs(response) {
  if (
    !response ||
    !Array.isArray(response.jobs) ||
    !Number.isSafeInteger(response.total_count) ||
    response.total_count < 1 ||
    response.total_count !== response.jobs.length
  )
    return false
  const builds = response.jobs.filter((job) => job.name === "build")
  if (
    builds.length !== 1 ||
    builds[0].status !== "completed" ||
    builds[0].conclusion !== "success" ||
    !Array.isArray(builds[0].steps)
  )
    return false
  return FULL_PROOF_STEPS.every((name) => {
    const matches = builds[0].steps.filter((step) => step.name === name)
    return (
      matches.length === 1 &&
      matches[0].status === "completed" &&
      matches[0].conclusion === "success"
    )
  })
}

/** Decide whether full development CI can be reused. Any uncertainty is full. */
export async function classifyPublicationCI({
  cwd,
  repository,
  eventName,
  branch,
  headSha,
  beforeSha,
  currentRunId,
  mode = "publish",
  listRuns,
  listJobs,
}) {
  let safe = false
  try {
    if (
      !cwd ||
      !["publish", "drive"].includes(mode) ||
      repository !== repositoryName ||
      !shaPattern.test(headSha || "") ||
      gitText(cwd, "rev-parse", "HEAD") !== headSha
    )
      return full("invalid_context", false)
    // Production source changes in a dirty tree must never be silently built,
    // even if the full development suite happens to pass.
    if (!safePublicationWorktree(cwd)) return full("unsafe_worktree", false)
    if (mode === "publish" && dirtyPaths(cwd)) return full("dirty_publish_tree", false)
    safe = true
    if (mode === "publish") {
      if (eventName !== "push" || branch !== "main") return full("manual_or_non_main")
      if (
        !shaPattern.test(beforeSha || "") ||
        beforeSha === "0".repeat(40) ||
        !isAncestor(cwd, beforeSha, headSha)
      )
        return full("unverified_push_base")
    } else if (eventName !== "workflow_dispatch" || branch !== "main")
      return full("invalid_drive_context", false)
    if (typeof listRuns !== "function" || typeof listJobs !== "function")
      return full("missing_github_evidence")
    const response = await listRuns()
    if (
      !response ||
      !Array.isArray(response.workflow_runs) ||
      !Number.isSafeInteger(response.total_count) ||
      response.total_count < response.workflow_runs.length ||
      response.workflow_runs.length > 100 ||
      response.workflow_runs.length < Math.min(100, response.total_count)
    )
      return full("invalid_github_runs")
    const valid = response.workflow_runs.filter((run) =>
      validRun(run, headSha, repository, currentRunId),
    )
    if (!valid.length) return full("no_matching_full_ci")
    const ancestors = contentAncestors(
      cwd,
      headSha,
      valid.map((run) => run.head_sha),
    )
    const candidates = valid.filter((run) => ancestors.has(run.head_sha))
    // A fast content run is not proof. Look for an actual full run, keeping
    // API fan-out bounded even after many daily content-only publications.
    for (let offset = 0; offset < candidates.length; offset += 5) {
      const batch = candidates.slice(offset, offset + 5)
      const jobs = await Promise.all(batch.map((run) => listJobs(run.id)))
      const index = jobs.findIndex(validJobs)
      if (index !== -1)
        return {
          mode: "fast",
          reason: "matching_full_ci",
          safe_to_publish: true,
          proof_run_id: batch[index].id,
          proof_head_sha: batch[index].head_sha,
        }
    }
    return full("no_matching_full_ci")
  } catch {
    // Network, process, Git, malformed output and JSON errors never grant fast CI.
    return full("evidence_unavailable", safe)
  }
}

async function githubJSON(url, token) {
  if (!token) throw Error("GitHub token unavailable")
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tkg-publication-ci",
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error("GitHub evidence request failed")
  return response.json()
}
async function runCLI() {
  const mode = process.argv[2] || "publish"
  const cwd = process.cwd(),
    repository = process.env.GITHUB_REPOSITORY || ""
  const eventName = process.env.GITHUB_EVENT_NAME || "",
    branch = (process.env.GITHUB_REF || "").replace(/^refs\/heads\//, "")
  let headSha = process.env.GITHUB_SHA || "",
    beforeSha = null
  try {
    if (mode === "drive") headSha = gitText(cwd, "rev-parse", "HEAD")
    if (process.env.GITHUB_EVENT_PATH)
      beforeSha = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).before || null
  } catch {
    /* The classifier falls back to full on an absent push base. */
  }
  const prefix = `https://api.github.com/repos/${repositoryName}/actions`
  const token = process.env.GITHUB_TOKEN || ""
  let sameCheckout = false
  try {
    sameCheckout =
      fs.realpathSync(path.join(cwd, "scripts/publication-ci.mjs")) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    /* An absent or redirected classifier cannot approve publication. */
  }
  if (mode === "check") {
    const safe = sameCheckout && safePublicationWorktree(cwd)
    console.log(JSON.stringify({ safe_to_publish: safe }))
    if (!safe) process.exitCode = 1
    return
  }
  const result = sameCheckout
    ? await classifyPublicationCI({
        cwd,
        repository,
        eventName,
        branch,
        headSha,
        beforeSha,
        currentRunId: process.env.GITHUB_RUN_ID,
        mode,
        listRuns: () =>
          githubJSON(`${prefix}/workflows/publish.yaml/runs?status=completed&per_page=100`, token),
        listJobs: (id) => githubJSON(`${prefix}/runs/${id}/jobs?filter=latest&per_page=100`, token),
      })
    : full("classifier_checkout_mismatch", false)
  console.log(JSON.stringify(result))
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `mode=${result.mode}\nsafe_to_publish=${result.safe_to_publish}\nproof_run_id=${result.proof_run_id || ""}\n`,
    )
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await runCLI()
