import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { nonContentChanges } from "../scripts/publication-state.mjs"

test("publication preflight allows generated content but blocks source and untracked changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "garden-publish-preflight-"))
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" })
  const write = (file, value) => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, value)
  }
  try {
    git("init", "-b", "main")
    write("scripts/generate.mjs", "export const version = 1\n")
    write("vault/News/article.md", "original\n")
    write("digest/briefing.md", "original\n")
    write("data/catalog.json", "{}\n")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "base")

    write("vault/News/article.md", "updated\n")
    write("digest/briefing.md", "updated\n")
    write("data/catalog.json", '{"updated":true}\n')
    write("data/drive-source-state.json", "{}\n")
    assert.equal(nonContentChanges(root), "")

    write("scripts/generate.mjs", "export const version = 2\n")
    assert.match(nonContentChanges(root), /scripts\/generate\.mjs/)
    git("add", "scripts/generate.mjs")
    assert.match(nonContentChanges(root), /scripts\/generate\.mjs/)
    git("reset", "--quiet", "--", "scripts/generate.mjs")
    write("scripts/generate.mjs", "export const version = 1\n")

    write("docs/notes.md", "new documentation\n")
    assert.match(nonContentChanges(root), /docs\/notes\.md/)
    fs.rmSync(path.join(root, "docs/notes.md"))

    write("vault/Archive/private.md", "private source\n")
    assert.match(nonContentChanges(root), /vault\/Archive\/private\.md/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
