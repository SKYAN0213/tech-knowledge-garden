import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { sha256 } from "../scripts/research/contracts.mjs"
import { safePath } from "../scripts/research/run-state.mjs"
import {
  assertSharedPreviewRenderer,
  copyFiles,
  prepareSharedPreviewRenderer,
  previewRendererSpec,
  privatePreviewRuntimeEntries,
} from "../scripts/research/preview-renderer-cache.mjs"

function removeFixture(directory) {
  const unlock = (current) => {
    if (!fs.existsSync(current)) return
    const info = fs.lstatSync(current)
    if (!info.isDirectory() || info.isSymbolicLink()) return
    fs.chmodSync(current, 0o700)
    for (const name of fs.readdirSync(current)) unlock(path.join(current, name))
  }
  unlock(directory)
  fs.rmSync(directory, { recursive: true, force: true })
}
function fixture(t) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preview-renderer-cache-")))
  t.after(() => removeFixture(parent))
  const root = path.join(parent, "root"), repo = path.join(parent, "repo")
  fs.mkdirSync(root)
  fs.mkdirSync(path.join(repo, "node_modules"), { recursive: true })
  const values = {
    "scripts/garden.mjs": "export const source = 'garden'\n",
    "scripts/research/check.mjs": "export const check = true\n",
    "quartz/worker.ts": "export const worker = true\n",
    "quartz/cli/handler.js": "export const handler = true\n",
    "quartz/util/path.ts": "export const util = true\n",
    "quartz/plugins/check.ts": "export const plugin = true\n",
    "quartz/processors/check.ts": "export const processor = true\n",
    "quartz/styles/check.css": "body {}\n",
    "quartz/components/check.ts": "export const component = true\n",
    "quartz/static/check.txt": "static\n",
    "quartz/i18n/check.ts": "export const locale = true\n",
    "web/page.mjs": "export const page = true\n",
    "data/policy.json": '{"policy":"current"}\n',
    "quartz.config.yaml": "configuration: {}\n",
  }
  for (const [relative, content] of Object.entries(values)) {
    const target = path.join(repo, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  const runtime = Object.entries(values)
    .map(([relative, content]) => ({ path: relative, sha256: sha256(content) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const workspace = (name) => {
    const target = path.join(root, "runs", name, "preview-workspace")
    fs.mkdirSync(target, { recursive: true })
    copyFiles(repo, target, privatePreviewRuntimeEntries(runtime))
    return target
  }
  return { parent, root, repo, runtime, workspace, values }
}

test("two preview workspaces share sealed renderer code and keep mutable inputs independent", (t) => {
  const f = fixture(t), first = f.workspace("first"), second = f.workspace("second")
  const a = prepareSharedPreviewRenderer(f.root, f.repo, first, f.runtime)
  const b = prepareSharedPreviewRenderer(f.root, f.repo, second, f.runtime)
  assert.deepEqual(a, b)
  const base = assertSharedPreviewRenderer(f.root, f.repo, first, f.runtime, a)
  assert.equal(assertSharedPreviewRenderer(f.root, f.repo, second, f.runtime, b), base)
  for (const name of ["scripts", "quartz/util", "quartz/plugins", "quartz/processors", "quartz/styles", "quartz/components", "quartz/static", "quartz/i18n"]) {
    assert.ok(fs.lstatSync(path.join(first, name)).isSymbolicLink())
    assert.equal(fs.realpathSync(path.join(second, name)), path.join(base, name))
  }
  assert.equal(fs.lstatSync(path.join(first, "quartz")).isSymbolicLink(), false)
  assert.equal(fs.lstatSync(path.join(first, "quartz/cli")).isSymbolicLink(), false)
  assert.equal(fs.lstatSync(path.join(first, "web")).isSymbolicLink(), false)
  assert.equal(fs.lstatSync(path.join(first, "data")).isSymbolicLink(), false)
  assert.equal(fs.realpathSync(path.join(first, "node_modules")), path.join(f.repo, "node_modules"))
  assert.equal(fs.statSync(path.join(base, "scripts/garden.mjs")).mode & 0o222, 0)
  assert.equal(fs.statSync(path.join(base, "scripts")).mode & 0o222, 0)
  assert.throws(() => safePath(first, "scripts/garden.mjs"), /Symlink/)
  fs.writeFileSync(path.join(first, "data/policy.json"), "changed private copy")
  assert.equal(fs.readFileSync(path.join(second, "data/policy.json"), "utf8"), f.values["data/policy.json"])
  assert.equal(fs.readFileSync(path.join(f.repo, "data/policy.json"), "utf8"), f.values["data/policy.json"])
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, first, f.runtime, a), /Private renderer changed/)
})

test("renderer links and cached bytes cannot be redirected or modified", (t) => {
  const f = fixture(t), workspace = f.workspace("preview")
  const binding = prepareSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime)
  const base = assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding)
  fs.unlinkSync(path.join(workspace, "scripts"))
  fs.symlinkSync(path.join(f.repo, "scripts"), path.join(workspace, "scripts"), "dir")
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), /link changed/)
  assert.throws(() => prepareSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime), /link changed/)
  fs.unlinkSync(path.join(workspace, "scripts"))
  fs.symlinkSync(path.join(base, "scripts"), path.join(workspace, "scripts"), "dir")
  const cached = path.join(base, "scripts/garden.mjs")
  fs.chmodSync(cached, 0o644)
  fs.writeFileSync(cached, "changed renderer")
  fs.chmodSync(cached, 0o444)
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), /bytes changed/)
  assert.equal(fs.readFileSync(path.join(f.repo, "scripts/garden.mjs"), "utf8"), f.values["scripts/garden.mjs"])
})

test("unexpected nested links or extra files invalidate a sealed renderer", (t) => {
  const f = fixture(t), workspace = f.workspace("extra")
  const binding = prepareSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime)
  const base = assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding)
  const scripts = path.join(base, "scripts")
  fs.chmodSync(scripts, 0o755)
  const unexpected = path.join(scripts, "node_modules")
  fs.symlinkSync(path.join(f.repo, "node_modules"), unexpected, "dir")
  fs.chmodSync(scripts, 0o555)
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), /Symlink inside/)
  fs.chmodSync(scripts, 0o755)
  fs.unlinkSync(unexpected)
  fs.writeFileSync(path.join(scripts, "extra.mjs"), "unexpected", { mode: 0o444 })
  fs.chmodSync(scripts, 0o555)
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), /file set changed/)
})

test("a missing disposable renderer base is rebuilt only from the exact pinned inputs", (t) => {
  const f = fixture(t), workspace = f.workspace("resume")
  const binding = prepareSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime)
  const base = assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding)
  removeFixture(base)
  assert.equal(assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), base)
  removeFixture(base)
  fs.writeFileSync(path.join(f.repo, "scripts/garden.mjs"), "changed source")
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), /Snapshot source changed/)
  assert.equal(fs.existsSync(base), false)
})

test("resume restores only missing disposable links after backup", (t) => {
  const f = fixture(t), workspace = f.workspace("restored")
  const binding = prepareSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime)
  const base = assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding)
  for (const name of ["scripts", "quartz/util", "quartz/plugins", "quartz/processors", "quartz/styles", "quartz/components", "quartz/static", "quartz/i18n", "node_modules"])
    fs.unlinkSync(path.join(workspace, name))
  removeFixture(base)
  assert.equal(assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), base)
  assert.equal(fs.realpathSync(path.join(workspace, "scripts")), path.join(base, "scripts"))
  assert.equal(fs.realpathSync(path.join(workspace, "node_modules")), path.join(f.repo, "node_modules"))
  fs.unlinkSync(path.join(workspace, "node_modules"))
  fs.symlinkSync(f.repo, path.join(workspace, "node_modules"), "dir")
  assert.throws(() => assertSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime, binding), /Unexpected private dependency path/)
})

test("renderer cache rejects paths outside the exact run workspace", (t) => {
  const f = fixture(t), outside = path.join(f.parent, "outside")
  fs.mkdirSync(outside)
  assert.throws(() => prepareSharedPreviewRenderer(f.root, f.repo, outside, f.runtime), /Exact private preview workspace/)
  const spec = previewRendererSpec(f.repo, f.runtime)
  assert.match(spec.base_id, /^[a-f0-9]{64}$/)
})

test("renderer identity can be checked before missing runtime inputs block preparation", (t) => {
  const f = fixture(t), workspace = f.workspace("inputs")
  fs.rmdirSync(path.join(f.repo, "node_modules"))
  assert.match(previewRendererSpec(f.repo, f.runtime).base_id, /^[a-f0-9]{64}$/)
  assert.throws(() => prepareSharedPreviewRenderer(f.root, f.repo, workspace, f.runtime), /Installed local dependencies required/)
  fs.mkdirSync(path.join(f.repo, "node_modules"))
  const incomplete = f.runtime.filter((row) => !row.path.startsWith("quartz/i18n/"))
  assert.match(previewRendererSpec(f.repo, incomplete).base_id, /^[a-f0-9]{64}$/)
  assert.throws(() => prepareSharedPreviewRenderer(f.root, f.repo, workspace, incomplete), /Complete shared renderer directories required/)
})

test("concurrent first previews converge on one sealed renderer base", async (t) => {
  const f = fixture(t), first = f.workspace("first"), second = f.workspace("second")
  const moduleFile = fileURLToPath(new URL("../scripts/research/preview-renderer-cache.mjs", import.meta.url))
  const source = `import {prepareSharedPreviewRenderer} from ${JSON.stringify(new URL("file://" + moduleFile).href)}; const [root,repo,workspace,raw]=process.argv.slice(1); console.log(JSON.stringify(prepareSharedPreviewRenderer(root,repo,workspace,JSON.parse(raw))));`
  const launch = (workspace) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, f.root, f.repo, workspace, JSON.stringify(f.runtime)])
    let output = "", error = ""
    child.stdout.on("data", (data) => { output += data })
    child.stderr.on("data", (data) => { error += data })
    child.on("error", reject)
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(output)) : reject(Error(error)))
  })
  const [a, b] = await Promise.all([launch(first), launch(second)])
  assert.deepEqual(a, b)
  assert.equal(assertSharedPreviewRenderer(f.root, f.repo, first, f.runtime, a), assertSharedPreviewRenderer(f.root, f.repo, second, f.runtime, b))
})
