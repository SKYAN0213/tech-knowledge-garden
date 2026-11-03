import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

// Quartz writes its transpiled build under quartz/.quartz-cache. Keep its
// root and CLI private, while sharing only source directories read by builds.
const sharedDirectories = [
  "scripts", "quartz/util", "quartz/plugins", "quartz/processors",
  "quartz/styles", "quartz/components", "quartz/static", "quartz/i18n",
]
const isShared = (relative) => sharedDirectories.some((name) => relative.startsWith(name + "/"))
const schema = "research-preview-renderer-cache/v1"

// Materialized files remain independent from their source, even when the
// filesystem can use a copy-on-write clone for their data blocks.
export function copyFiles(source, destination, entries) {
  for (const entry of entries) {
    const original = safePath(source, entry.path)
    const bytes = fs.readFileSync(original)
    if (sha256(bytes) !== entry.sha256) throw Error("Snapshot source changed during copy")
    const file = safePath(destination, entry.path)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + "." + randomUUID() + ".tmp"
    try {
      fs.copyFileSync(original, tmp, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL)
      fs.chmodSync(tmp, 0o600)
      if (sha256(fs.readFileSync(tmp)) !== entry.sha256)
        throw Error("Snapshot source changed during copy")
      const fd = fs.openSync(tmp, "r")
      try {
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      safePath(destination, entry.path)
      fs.renameSync(tmp, file)
      const dir = fs.openSync(path.dirname(file), "r")
      try {
        fs.fsyncSync(dir)
      } finally {
        fs.closeSync(dir)
      }
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    }
  }
}

export function previewRendererSpec(repo, runtime) {
  repo = path.resolve(repo)
  const dependencies = path.join(repo, "node_modules")
  if (!Array.isArray(runtime) || !runtime.length) throw Error("Exact renderer inputs required")
  const names = new Set()
  for (const entry of runtime) {
    if (
      typeof entry?.path !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 || "") ||
      names.has(entry.path)
    )
      throw Error("Unique renderer input paths and SHA required")
    safePath(repo, entry.path, { materialize: false })
    names.add(entry.path)
  }
  // ESM resolution may walk from a shared file to root configuration files.
  // Keep their exact snapshots in the base too, even when the workspace has
  // its own independently writable copy.
  const files = runtime
  const manifest = { schema, node_version: process.version, dependencies, shared_directories: sharedDirectories, files }
  return { ...manifest, base_id: sha256(JSON.stringify(manifest)) }
}

function assertRendererAvailable(spec) {
  const dependencies = spec.dependencies
  if (
    !fs.lstatSync(dependencies, { throwIfNoEntry: false })?.isDirectory() ||
    fs.realpathSync(dependencies) !== dependencies
  )
    throw Error("Installed local dependencies required")
  for (const name of sharedDirectories)
    if (!spec.files.some((entry) => entry.path.startsWith(name + "/")))
      throw Error("Complete shared renderer directories required")
}

function cacheDirectory(root, baseId) {
  if (!/^[a-f0-9]{64}$/.test(baseId || "")) throw Error("Exact renderer cache identity required")
  return safePath(root, `runtime/preview-renderer-bases/${baseId}`, { materialize: false })
}

function inspectTree(directory, relative, files) {
  const current = relative ? path.join(directory, relative) : directory
  const info = fs.lstatSync(current)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o222))
    throw Error("Shared renderer directory is not sealed")
  for (const name of fs.readdirSync(current).sort()) {
    const next = relative ? relative + "/" + name : name
    if (!relative && name === "node_modules") continue
    if (!relative && name === "manifest.json") continue
    const item = fs.lstatSync(path.join(directory, next))
    if (item.isSymbolicLink()) throw Error("Symlink inside shared renderer")
    if (item.isDirectory()) inspectTree(directory, next, files)
    else if (item.isFile() && !(item.mode & 0o222)) files.push(next)
    else throw Error("Shared renderer file is not sealed")
  }
}

function inspectBase(base, spec) {
  if (fs.realpathSync(base) !== base) throw Error("Shared renderer root changed")
  const manifest = path.join(base, "manifest.json"), info = fs.lstatSync(manifest)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o222))
    throw Error("Shared renderer manifest is not sealed")
  if (JSON.stringify(JSON.parse(fs.readFileSync(manifest))) !== JSON.stringify(spec))
    throw Error("Shared renderer manifest changed")
  const dependencies = path.join(base, "node_modules"), link = fs.lstatSync(dependencies)
  if (!link.isSymbolicLink() || fs.realpathSync(dependencies) !== spec.dependencies)
    throw Error("Shared renderer dependency binding changed")
  const files = []
  inspectTree(base, "", files)
  if (JSON.stringify(files.sort()) !== JSON.stringify(spec.files.map((entry) => entry.path).sort()))
    throw Error("Shared renderer file set changed")
  for (const entry of spec.files)
    if (sha256(fs.readFileSync(safePath(base, entry.path, { materialize: false }))) !== entry.sha256)
      throw Error("Shared renderer bytes changed: " + entry.path)
}

function sealTree(directory, root = directory) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name), info = fs.lstatSync(file)
    if (info.isSymbolicLink()) {
      if (file !== path.join(root, "node_modules"))
        throw Error("Unexpected symlink while sealing renderer")
    } else if (info.isDirectory()) sealTree(file, root)
    else if (info.isFile()) fs.chmodSync(file, 0o444)
    else throw Error("Non-regular shared renderer input")
  }
  fs.chmodSync(directory, 0o555)
}

function removeOwnTemporary(directory) {
  if (!fs.existsSync(directory)) return
  const visit = (current) => {
    fs.chmodSync(current, 0o700)
    for (const name of fs.readdirSync(current)) {
      const child = path.join(current, name), info = fs.lstatSync(child)
      if (info.isDirectory() && !info.isSymbolicLink()) visit(child)
    }
  }
  visit(directory)
  fs.rmSync(directory, { recursive: true })
}

function ensureBase(root, repo, spec) {
  const base = cacheDirectory(root, spec.base_id)
  const parent = safePath(root, "runtime/preview-renderer-bases", { materialize: false })
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 })
  safePath(root, "runtime/preview-renderer-bases", { materialize: false })
  if (!fs.existsSync(base)) {
    const temp = fs.mkdtempSync(path.join(parent, ".preview-renderer-"))
    try {
      copyFiles(repo, temp, spec.files)
      fs.symlinkSync(spec.dependencies, path.join(temp, "node_modules"), "dir")
      const manifest = path.join(temp, "manifest.json")
      const fd = fs.openSync(manifest, "wx", 0o600)
      try {
        fs.writeFileSync(fd, JSON.stringify(spec) + "\n")
        fs.fsyncSync(fd)
      } finally {
        fs.closeSync(fd)
      }
      const directory = fs.openSync(temp, "r")
      try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
      sealTree(temp)
      try {
        fs.renameSync(temp, base)
        const directory = fs.openSync(parent, "r")
        try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
      } catch (error) {
        // macOS can report EACCES when the winner has already sealed its
        // destination. Reuse is safe only after checking the entire winner.
        if (!["EEXIST", "ENOTEMPTY", "EACCES"].includes(error.code) || !fs.existsSync(base))
          throw error
        inspectBase(base, spec)
      }
    } finally {
      removeOwnTemporary(temp)
    }
  }
  inspectBase(base, spec)
  return base
}

function checkedWorkspace(root, workspace) {
  root = fs.realpathSync(root)
  workspace = path.resolve(workspace)
  const relative = path.relative(root, workspace).split(path.sep).join("/")
  if (!/^runs\/[A-Za-z0-9_-]+\/preview-workspace$/.test(relative) ||
      fs.realpathSync(workspace) !== workspace)
    throw Error("Exact private preview workspace required")
  return { root, workspace }
}

function ensureWorkspaceLinks(workspace, base, spec) {
  for (const name of sharedDirectories) {
    const link = path.join(workspace, name), target = path.join(base, name)
    if (name.includes("/")) {
      const parent = safePath(workspace, path.dirname(name), { materialize: false })
      fs.mkdirSync(parent, { recursive: true })
      safePath(workspace, path.dirname(name), { materialize: false })
    }
    const info = fs.lstatSync(link, { throwIfNoEntry: false })
    if (!info) fs.symlinkSync(target, link, "dir")
    else if (!info.isSymbolicLink() || fs.realpathSync(link) !== target)
      throw Error("Private renderer link changed: " + name)
  }
  const dependencies = path.join(workspace, "node_modules")
  const info = fs.lstatSync(dependencies, { throwIfNoEntry: false })
  if (!info) fs.symlinkSync(spec.dependencies, dependencies, "dir")
  else if (!info.isSymbolicLink() || fs.realpathSync(dependencies) !== spec.dependencies)
    throw Error("Unexpected private dependency path")
}

export function prepareSharedPreviewRenderer(root, repo, workspace, runtime) {
  const checked = checkedWorkspace(root, workspace)
  root = checked.root
  workspace = checked.workspace
  repo = path.resolve(repo)
  const spec = previewRendererSpec(repo, runtime)
  assertRendererAvailable(spec)
  const base = ensureBase(root, repo, spec)
  ensureWorkspaceLinks(workspace, base, spec)
  return { schema, base_id: spec.base_id }
}

export function assertSharedPreviewRenderer(root, repo, workspace, runtime, binding) {
  const checked = checkedWorkspace(root, workspace)
  root = checked.root
  workspace = checked.workspace
  const spec = previewRendererSpec(repo, runtime)
  if (binding?.schema !== schema || binding.base_id !== spec.base_id)
    throw Error("Private renderer binding changed")
  assertRendererAvailable(spec)
  const base = ensureBase(root, path.resolve(repo), spec)
  const quartz = safePath(workspace, "quartz", { materialize: false })
  if (!fs.lstatSync(quartz, { throwIfNoEntry: false })?.isDirectory())
    throw Error("Private Quartz workspace changed")
  // Backup deliberately excludes these disposable links. Recreate only the
  // exact pinned targets after the base and workspace have been verified.
  ensureWorkspaceLinks(workspace, base, spec)
  for (const name of sharedDirectories) {
    const link = path.join(workspace, name)
    if (!fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink() ||
        fs.realpathSync(link) !== path.join(base, name))
      throw Error("Private renderer link changed: " + name)
  }
  for (const entry of runtime.filter((row) => !isShared(row.path)))
    if (sha256(fs.readFileSync(safePath(workspace, entry.path))) !== entry.sha256)
      throw Error("Private renderer changed: " + entry.path)
  return base
}

export function privatePreviewRuntimeEntries(runtime) {
  return runtime.filter((entry) => !isShared(entry.path))
}
