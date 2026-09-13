import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import vm from "node:vm"
import test from "node:test"

const code = readFileSync(new URL("../integrations/google-drive/Code.gs", import.meta.url), "utf8")
const iterator = (items) => ({ hasNext: () => items.length > 0, next: () => items.shift() })
function file(name = "sample.md", content = "# Example\n") {
  return {
    getName: () => name,
    getSize: () => content.length,
    isTrashed: () => false,
    getMimeType: () => "text/markdown",
    getLastUpdated: () => new Date("2026-09-13T00:00:00Z"),
    getBlob: () => ({ getDataAsString: () => content }),
  }
}
function environment(overrides = {}) {
  const visited = []
  const context = vm.createContext({
    DriveApp: {
      getFolderById: () => ({
        getFoldersByName: (name) => {
          visited.push(name)
          const folder = {
            getFiles: () => iterator(overrides[name] || [file()]),
            getFolders: () => iterator([]),
          }
          return iterator([folder])
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_, text) => [...createHash("sha256").update(text).digest()],
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this
        },
      }),
    },
  })
  vm.runInContext(code, context)
  return { context, visited }
}
test("Drive exporter only reads the four publishable source roots", () => {
  const { context, visited } = environment()
  const data = JSON.parse(vm.runInContext("JSON.stringify(sourceSnapshot())", context))
  assert.deepEqual(visited, ["Editions", "Knowledge", "Signals", "TrendTopics"])
  assert.equal(data.complete, true)
  assert.equal(data.files.length, 4)
  assert.equal(data.files[0].sha256, createHash("sha256").update("# Example\n").digest("hex"))
})
test("Drive exporter fails closed instead of returning partial sources", () => {
  for (const invalid of [[], [file(), file()], [file("../secret.md")], [file("notes.json")]]) {
    const { context } = environment({ Knowledge: invalid })
    const result = JSON.parse(vm.runInContext("doGet().text", context))
    assert.equal(result.complete, false)
    assert.equal(result.files, undefined)
  }
})
