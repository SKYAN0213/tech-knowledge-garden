import fs from "node:fs"
import path from "node:path"
import { sha256 } from "./contracts.mjs"
import { safePath, atomicCreate, atomicWrite, withLock } from "./run-state.mjs"
import { loadPlanProgress } from "./plan-progress.mjs"

export const GPT_DEVELOPMENT_CHECKS = [
  "collection_parsing",
  "curation_writing",
  "gpt_execution_resume",
  "storage_readback_resume",
  "publication_recovery",
  "targeted_regressions",
]
export const LOCAL_DEVELOPMENT_CHECKS = ["local_execution_resume", "local_oauth_roundtrip"]
const hashPattern = /^[a-f0-9]{64}$/
const sourceRoots = [
  "scripts",
  "integrations/research-mcp",
  "integrations/research-worker",
  "integrations/google-drive",
  "quartz",
  "web",
]
const extensions = new Set([
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".py",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".sh",
  ".yaml",
  ".yml",
  ".gs",
])
const ignored = new Set([
  "node_modules",
  "venv",
  "runtime",
  ".git",
  ".cache",
  "__pycache__",
  "test",
  "tests",
])
const policyPath = "data/research-operation-policy.json"

export function executionIdentity(policy) {
  return {
    schema: policy.schema,
    schedule_id: policy.schedule_id,
    default_executor: policy.default_executor,
    storage_backend: policy.storage_backend || "connected_drive",
    model_policies: policy.model_policies,
    recovery: policy.recovery,
    local_execution_enabled: policy.optional_execution?.ollama?.enabled === true,
  }
}
export function implementationFiles(repo) {
  const files = []
  function visit(relative) {
    const file = safePath(repo, relative, { materialize: false })
    const stat = fs.lstatSync(file, { throwIfNoEntry: false })
    if (!stat) return
    if (stat.isSymbolicLink()) throw Error("Symlink in release implementation")
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort())
        if (!ignored.has(name) && !name.startsWith(".")) visit(`${relative}/${name}`)
    } else if (stat.isFile() && extensions.has(path.extname(relative))) files.push(relative)
  }
  for (const root of sourceRoots) visit(root)
  for (const file of [
    "package.json",
    "package-lock.json",
    "quartz.config.ts",
    "quartz.layout.ts",
    "tsconfig.json",
    ".github/workflows/publish.yaml",
    "integrations/research-worker/requirements.txt",
  ])
    if (fs.existsSync(safePath(repo, file, { materialize: false }))) files.push(file)
  const data = path.join(repo, "data")
  if (fs.existsSync(data))
    for (const name of fs.readdirSync(data).sort())
      if (
        name.startsWith("research-") &&
        name.endsWith(".json") &&
        name !== "research-operation-policy.json"
      )
        files.push(`data/${name}`)
  return [...new Set(files)].sort()
}
const bytes = (repo, relative) => fs.readFileSync(safePath(repo, relative))
export function evidenceReference(repo, relative) {
  if (
    typeof relative !== "string" ||
    /(?:^|\/)(?:credentials?|oauth|secrets?)(?:\/|$)/i.test(relative)
  )
    throw Error("Development evidence must not include credentials")
  return { path: relative, sha256: sha256(bytes(repo, relative)) }
}
function readPinned(repo, ref) {
  if (!ref || typeof ref.path !== "string" || !hashPattern.test(ref.sha256 || ""))
    throw Error("Exact development evidence path/SHA required")
  const body = bytes(repo, ref.path)
  if (body.length > 1024 * 1024 || sha256(body) !== ref.sha256)
    throw Error("Development evidence changed or exceeds its budget")
  return JSON.parse(body)
}
function checkRows(checks, required) {
  return required.every(
    (key) =>
      checks?.[key]?.status === "passed" &&
      Array.isArray(checks[key].evidence) &&
      checks[key].evidence.length > 0 &&
      checks[key].evidence.length <= 20 &&
      checks[key].evidence.every(
        (ref) => typeof ref.path === "string" && hashPattern.test(ref.sha256 || ""),
      ),
  )
}
export function inspectDevelopmentCompletion(repo, ref, policy, { executor = "codex" } = {}) {
  const record = readPinned(repo, ref)
  const required = executor === "codex" ? GPT_DEVELOPMENT_CHECKS : LOCAL_DEVELOPMENT_CHECKS
  if (
    record.schema !== "research-development-completion/v2" ||
    record.development_complete !== true ||
    record.executor !== executor ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(record.release_id || "") ||
    !checkRows(record.checks, required)
  )
    return { valid: false, reason: "development_checks_incomplete" }
  const manifest = readPinned(repo, record.release_manifest)
  if (
    manifest.schema !== "research-development-release/v1" ||
    manifest.release_id !== record.release_id ||
    !releaseRootMatches(repo, manifest, record.release_manifest) ||
    manifest.execution_identity_sha256 !== sha256(JSON.stringify(executionIdentity(policy)))
  )
    return { valid: false, reason: "development_policy_changed" }
  const current = implementationFiles(repo)
  if (
    !Array.isArray(manifest.files) ||
    JSON.stringify(manifest.files.map((f) => f.path)) !== JSON.stringify(current)
  )
    return { valid: false, reason: "development_implementation_set_changed" }
  for (const file of manifest.files) {
    if (!hashPattern.test(file.sha256 || "") || sha256(bytes(repo, file.path)) !== file.sha256)
      return { valid: false, reason: "development_implementation_changed", changed_path: file.path }
  }
  // Large source payloads stay cold. Their original proof references were read
  // and hashed at finalization; routine scheduling reads only this hot receipt
  // and implementation files, never hydrating or fetching news on its own.
  return { valid: true, record, manifest }
}

// Relocation is allowed only for a complete byte-verified installation of the
// original reviewed release. The receipt and manifest themselves stay unchanged.
function releaseRootMatches(repo, manifest, manifestRef) {
  if (manifest.repo_root === fs.realpathSync(repo)) return true
  const file = safePath(repo, ".local/.storage/runtime-release.json", { materialize: false })
  if (!fs.existsSync(file)) return false
  const installed = JSON.parse(fs.readFileSync(file))
  return (
    installed.schema === "research-runtime-installation/v1" &&
    installed.repo_root === fs.realpathSync(repo) &&
    installed.source_repo === manifest.repo_root &&
    installed.release_id === manifest.release_id &&
    installed.operation_policy_sha256 === sha256(bytes(repo, policyPath)) &&
    installed.release_manifest.path === manifestRef.path &&
    installed.release_manifest.sha256 === manifestRef.sha256
  )
}

export async function finalizeDevelopmentRelease(repo, reviewRef) {
  const lockRoot = safePath(repo, ".local/.storage", { materialize: false })
  fs.mkdirSync(lockRoot, { recursive: true })
  return withLock(lockRoot, "development-release", async () => {
    const policyBytes = bytes(repo, policyPath),
      policy = JSON.parse(policyBytes)
    if (
      policy.schema !== "research-operation-policy/v1" ||
      policy.default_executor !== "codex" ||
      (policy.storage_backend || "connected_drive") !== "connected_drive"
    )
      throw Error("GPT with the existing Drive connection must remain the default")
    const review = readPinned(repo, reviewRef)
    if (
      review.schema !== "research-development-review/v1" ||
      review.executor !== "codex" ||
      review.storage_backend !== "connected_drive" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(review.release_id || "") ||
      !checkRows(review.checks, GPT_DEVELOPMENT_CHECKS)
    )
      throw Error("All six GPT development checks need reviewed evidence")
    const progress = loadPlanProgress(repo)
    if (
      progress.status !== "current_system_wbs" ||
      progress.required !== 12 ||
      progress.completed !== 12
    )
      throw Error("System construction WBS must be complete before finalization")
    const model = JSON.parse(bytes(repo, policy.model_policies.codex))
    if (
      !Object.keys(model.roles || {}).length ||
      Object.values(model.roles).some((role) => role.provider !== "codex")
    )
      throw Error("Every GPT role must use the Codex provider")
    for (const check of Object.values(review.checks))
      for (const ref of check.evidence) {
        const actual = evidenceReference(repo, ref.path)
        if (actual.sha256 !== ref.sha256)
          throw Error("Reviewed development evidence changed: " + ref.path)
      }
    const manifest = {
      schema: "research-development-release/v1",
      release_id: review.release_id,
      repo_root: fs.realpathSync(repo),
      execution_identity_sha256: sha256(JSON.stringify(executionIdentity(policy))),
      files: implementationFiles(repo).map((file) => evidenceReference(repo, file)),
    }
    const manifestPath = `.local/.storage/releases/${review.release_id}/manifest.json`
    const recordPath = `.local/research/development-releases/${review.release_id}/receipt.json`
    function install(relative, value) {
      const file = safePath(repo, relative, { materialize: false })
      if (fs.existsSync(file)) {
        if (JSON.stringify(JSON.parse(fs.readFileSync(file))) !== JSON.stringify(value))
          throw Error("Development release is immutable; choose a new release ID")
      } else atomicCreate(repo, relative, value)
      return evidenceReference(repo, relative)
    }
    const manifestRef = install(manifestPath, manifest)
    const record = {
      schema: "research-development-completion/v2",
      release_id: review.release_id,
      executor: "codex",
      storage_backend: "connected_drive",
      development_complete: true,
      review: reviewRef,
      release_manifest: manifestRef,
      checks: review.checks,
      optional_capabilities: {
        local_execution: "not_enabled",
        local_oauth: "not_required_for_gpt",
      },
      production_release_verified: false,
      scheduled_runs_counted: 0,
    }
    const completionRef = install(recordPath, record)
    const checked = inspectDevelopmentCompletion(repo, completionRef, policy)
    if (!checked.valid) throw Error("Development release validation failed: " + checked.reason)
    if (!bytes(repo, policyPath).equals(policyBytes))
      throw Error("Operation policy changed during finalization")
    atomicWrite(repo, policyPath, {
      ...policy,
      phase: "ready",
      development_completion: completionRef,
    })
    return {
      status: "ready",
      release_id: review.release_id,
      development_completion: completionRef,
      release_manifest: manifestRef,
      implementation_files: manifest.files.length,
      executor: "codex",
      production_release_verified: false,
      scheduled_runs_counted: 0,
    }
  })
}
