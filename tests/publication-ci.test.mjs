import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { classifyPublicationCI, FULL_PROOF_STEPS } from "../scripts/publication-ci.mjs"

const repository = "SKYAN0213/tech-knowledge-garden"
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tkg-publication-ci-"))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  git(cwd, "init", "-b", "main")
  git(cwd, "config", "user.name", "Test")
  git(cwd, "config", "user.email", "test@example.invalid")
  const write = (name, contents) => {
    const target = path.join(cwd, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }
  write("scripts/app.mjs", "export const release = 1\n")
  write(".github/workflows/publish.yaml", "name: Publish Garden\n")
  write("vault/News/one.md", "first article\n")
  write("vault/About.md", "about\n")
  git(cwd, "add", ".")
  git(cwd, "commit", "-m", "base")
  const base = git(cwd, "rev-parse", "HEAD")
  const commit = (name) => {
    git(cwd, "add", "-A")
    git(cwd, "commit", "-m", name)
    return git(cwd, "rev-parse", "HEAD")
  }
  const proof = (headSha = base, options = {}) => ({
    id: 41,
    status: "completed",
    conclusion: "success",
    event: "push",
    head_sha: headSha,
    head_branch: "main",
    path: ".github/workflows/publish.yaml",
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    ...options,
  })
  const jobs = (
    steps = FULL_PROOF_STEPS.map((name) => ({ name, status: "completed", conclusion: "success" })),
  ) => ({
    total_count: 1,
    jobs: [{ name: "build", status: "completed", conclusion: "success", steps }],
  })
  const decide = (changes = {}) =>
    classifyPublicationCI({
      cwd,
      repository,
      eventName: "push",
      branch: "main",
      headSha: changes.headSha || git(cwd, "rev-parse", "HEAD"),
      beforeSha: base,
      currentRunId: 999,
      listRuns: async () => ({ total_count: 1, workflow_runs: [proof()] }),
      listJobs: async () => jobs(),
      ...changes,
    })
  return { cwd, write, commit, base, proof, jobs, decide }
}

test("content-only commit reuses actual same-repository full CI evidence", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "revised article\n")
  f.commit("article")
  const result = await f.decide()
  assert.equal(result.mode, "fast")
  assert.equal(result.safe_to_publish, true)
  assert.equal(result.proof_run_id, 41)
  assert.equal(result.proof_head_sha, f.base)
})

test("content changes across multiple linear commits are checked", async (t) => {
  const f = fixture(t)
  f.write("vault/News/two.md", "second\n")
  f.commit("second")
  f.write("digest/one.md", "digest\n")
  f.commit("digest")
  assert.equal((await f.decide()).mode, "fast")
})

test("a source change, even if reverted inside a multi-commit push, forces full CI", async (t) => {
  const f = fixture(t)
  f.write("scripts/app.mjs", "export const release = 2\n")
  f.commit("changed code")
  f.write("scripts/app.mjs", "export const release = 1\n")
  f.commit("restore code")
  f.write("vault/News/one.md", "article\n")
  f.commit("content")
  assert.equal((await f.decide()).mode, "full")
})

test("a rename from content to source, or a file allowlist entry changed to directory, cannot use fast CI", async (t) => {
  const f = fixture(t)
  git(f.cwd, "mv", "vault/News/one.md", "scripts/renamed.md")
  f.commit("rename")
  assert.equal((await f.decide()).mode, "full")
  const other = fixture(t)
  fs.rmSync(path.join(other.cwd, "vault/About.md"))
  other.write("vault/About.md/child.md", "not a file\n")
  other.commit("replace file by directory")
  assert.equal((await other.decide()).mode, "full")
})

test("untracked or staged source changes prevent publishing, even with a good baseline", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "article\n")
  f.commit("content")
  f.write("scripts/new.mjs", "untracked\n")
  let result = await f.decide()
  assert.equal(result.mode, "full")
  assert.equal(result.safe_to_publish, false)
  git(f.cwd, "add", "scripts/new.mjs")
  result = await f.decide()
  assert.equal(result.mode, "full")
  assert.equal(result.safe_to_publish, false)
})

test("drive sync may use fast CI for content-only working-tree changes", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "drive article\n")
  const result = await f.decide({ mode: "drive", eventName: "workflow_dispatch", beforeSha: null })
  assert.equal(result.mode, "fast")
  assert.equal(result.safe_to_publish, true)
})

test("normal publishing with a dirty content tree refuses fast CI", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "uncommitted article\n")
  const result = await f.decide()
  assert.equal(result.mode, "full")
  assert.equal(result.safe_to_publish, false)
})

test("absent, malformed, failed, skipped, foreign or unverifiable proofs fall back to full CI", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "article\n")
  f.commit("article")
  for (const testRuns of [
    [],
    [f.proof(f.base, { conclusion: "failure" })],
    [f.proof(f.base, { head_repository: { full_name: "foreign/repo" } })],
  ]) {
    assert.equal(
      (
        await f.decide({
          listRuns: async () => ({ total_count: testRuns.length, workflow_runs: testRuns }),
        })
      ).mode,
      "full",
    )
  }
  assert.equal(
    (
      await f.decide({
        listRuns: async () => {
          throw Error("offline")
        },
      })
    ).mode,
    "full",
  )
  const skipped = FULL_PROOF_STEPS.map((name, i) => ({
    name,
    status: "completed",
    conclusion: i ? "success" : "skipped",
  }))
  assert.equal((await f.decide({ listJobs: async () => f.jobs(skipped) })).mode, "full")
})

test("several newer fast runs cannot hide an earlier real full regression", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "article\n")
  f.commit("content")
  const runs = Array.from({ length: 6 }, (_, index) => f.proof(f.base, { id: 100 + index }))
  const result = await f.decide({
    listRuns: async () => ({ total_count: runs.length, workflow_runs: runs }),
    listJobs: async (id) =>
      id === 105
        ? f.jobs()
        : f.jobs(
            FULL_PROOF_STEPS.map((name) => ({ name, status: "completed", conclusion: "skipped" })),
          ),
  })
  assert.equal(result.mode, "fast")
  assert.equal(result.proof_run_id, 105)
})

test("force push, unknown prior SHA, non-main run and main manual dispatch use full CI", async (t) => {
  const f = fixture(t)
  f.write("vault/News/one.md", "article\n")
  f.commit("content")
  for (const options of [
    { beforeSha: "0".repeat(40) },
    { beforeSha: "f".repeat(40) },
    { branch: "feature" },
    { eventName: "workflow_dispatch" },
  ]) {
    assert.equal((await f.decide(options)).mode, "full")
  }
})

test("a predeployment branch full run is reusable only for the identical commit", async (t) => {
  const f = fixture(t)
  f.write("scripts/app.mjs", "export const release = 2\n")
  const sha = f.commit("new code")
  const prior = f.proof(sha, { event: "workflow_dispatch", head_branch: "candidate" })
  let result = await f.decide({
    listRuns: async () => ({ total_count: 1, workflow_runs: [prior] }),
  })
  assert.equal(result.mode, "fast")
  assert.equal(result.proof_head_sha, sha)
  f.write("vault/News/one.md", "article\n")
  f.commit("content")
  result = await f.decide({ listRuns: async () => ({ total_count: 1, workflow_runs: [prior] }) })
  assert.equal(result.mode, "full")
})

test("a merge commit and ambiguous proof pagination require full CI", async (t) => {
  const f = fixture(t)
  git(f.cwd, "checkout", "-b", "branch")
  f.write("vault/News/two.md", "branch content\n")
  f.commit("branch")
  git(f.cwd, "checkout", "main")
  f.write("digest/one.md", "main content\n")
  f.commit("main")
  git(f.cwd, "merge", "--no-ff", "branch", "-m", "merge")
  assert.equal((await f.decide()).mode, "full")
  assert.equal(
    (await f.decide({ listRuns: async () => ({ total_count: 101, workflow_runs: [f.proof()] }) }))
      .mode,
    "full",
  )
})

test("content symlinks cannot authorize the fast path in commits or Drive changes", async (t) => {
  const f = fixture(t)
  fs.symlinkSync("/tmp", path.join(f.cwd, "vault/News/link"))
  f.commit("symlink")
  assert.equal((await f.decide()).mode, "full")
  const drive = fixture(t)
  fs.symlinkSync("/tmp", path.join(drive.cwd, "vault/News/link"))
  const result = await drive.decide({
    mode: "drive",
    eventName: "workflow_dispatch",
    beforeSha: null,
  })
  assert.equal(result.mode, "full")
  assert.equal(result.safe_to_publish, false)
})

test("unreadable Git state cannot authorize a production build", async (t) => {
  const f = fixture(t)
  const headSha = git(f.cwd, "rev-parse", "HEAD")
  fs.rmSync(path.join(f.cwd, ".git"), { recursive: true, force: true })
  const result = await f.decide({ headSha })
  assert.equal(result.mode, "full")
  assert.equal(result.safe_to_publish, false)
})

test("both publication workflows retain exact full-proof steps and main-only deploy", () => {
  for (const name of ["publish.yaml", "drive-sync.yaml"]) {
    const text = fs.readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8")
    for (const step of FULL_PROOF_STEPS)
      assert.ok(text.includes(`name: "${step}"`), `${name}: ${step}`)
    assert.match(text, /actions: read/)
    assert.match(text, /github\.ref == 'refs\/heads\/main'/)
    assert.match(text, /run: npm run build/)
    assert.match(text, /run: node scripts\/verify-site\.mjs/)
    assert.match(text, /run: node scripts\/publication-ci\.mjs check/)
  }
})

test("the actual CLI falls back to full CI without a token and rechecks source after build", (t) => {
  const f = fixture(t)
  for (const name of ["publication-ci.mjs", "publication-state.mjs"])
    fs.copyFileSync(
      new URL(`../scripts/${name}`, import.meta.url),
      path.join(f.cwd, "scripts", name),
    )
  const before = f.commit("release code")
  f.write("vault/News/one.md", "article\n")
  const headSha = f.commit("article")
  const eventPath = path.join(os.tmpdir(), `tkg-event-${process.pid}-${Date.now()}.json`)
  const outputPath = `${eventPath}.output`
  t.after(() => {
    fs.rmSync(eventPath, { force: true })
    fs.rmSync(outputPath, { force: true })
  })
  fs.writeFileSync(eventPath, JSON.stringify({ before }))
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: repository,
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: headSha,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_RUN_ID: "999",
    GITHUB_TOKEN: "",
  }
  const result = JSON.parse(
    execFileSync(process.execPath, ["scripts/publication-ci.mjs", "publish"], {
      cwd: f.cwd,
      env,
      encoding: "utf8",
    }),
  )
  assert.equal(result.mode, "full")
  assert.equal(result.safe_to_publish, true)
  assert.match(fs.readFileSync(outputPath, "utf8"), /^mode=full\nsafe_to_publish=true\n/)
  execFileSync(process.execPath, ["scripts/publication-ci.mjs", "check"], { cwd: f.cwd, env })
  f.write("scripts/app.mjs", "modified by build\n")
  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/publication-ci.mjs", "check"], { cwd: f.cwd, env }),
  )
})
