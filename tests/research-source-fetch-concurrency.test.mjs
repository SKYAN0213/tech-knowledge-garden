import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { SourceFetcher } from "../scripts/research/fetch.mjs"
import { sourceId } from "../scripts/research/contracts.mjs"

test("two processes fetching the same source wait for its owner and preserve source/cache hashes", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-lock-concurrency-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const module = new URL("../scripts/research/fetch.mjs", import.meta.url).href
  const script = `import {SourceFetcher} from ${JSON.stringify(module)};
    const f=new SourceFetcher(process.argv[1],{interval_ms:0,attempts:1,
      resolve:async()=>[{address:'8.8.8.8',family:4}],
      transport:async()=>{await new Promise(r=>setTimeout(r,200));return {status:200,headers:{'content-type':'text/plain'},body:Buffer.from('User-agent: *\\nDisallow:\\n')}}});
    console.log(JSON.stringify(await f.fetch('https://example.com/robots.txt')));`
  const child = () =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e", script, root])
      let output = "",
        diagnostic = ""
      p.stdout.on("data", (bytes) => (output += bytes))
      p.stderr.on("data", (bytes) => (diagnostic += bytes))
      p.on("error", reject)
      p.on("close", (code) => (code ? reject(Error(diagnostic)) : resolve(JSON.parse(output))))
    })
  const [first, second] = await Promise.all([child(), child()])
  assert.equal(first.fetch_status, "captured")
  assert.equal(second.fetch_status, "captured")
  assert.equal(first.source_version_id, second.source_version_id)
  assert.equal(first.body_sha256, second.body_sha256)
  assert.equal(
    fs.existsSync(
      path.join(root, `locks/source-${sourceId("https://example.com/robots.txt")}.json`),
    ),
    false,
  )
})

test("a stale source lock is preserved for explicit recovery", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "source-lock-stale-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const url = "https://example.com/robots.txt",
    file = path.join(root, `locks/source-${sourceId(url)}.json`)
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(
    file,
    JSON.stringify({
      owner: "owner-preserved",
      pid: 2147483647,
      started_at: new Date().toISOString(),
    }),
  )
  const before = fs.readFileSync(file)
  const fetcher = new SourceFetcher(root, {
    transport: () => assert.fail("stale lock reached network"),
  })
  await assert.rejects(fetcher.fetch(url), /Source request lock is stale/)
  assert.deepEqual(fs.readFileSync(file), before)
})
