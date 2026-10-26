import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sha256 } from "../scripts/research/contracts.mjs"
import { materializeConnectorFile } from "../scripts/research/connector-transport.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tkg-connector-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const bytes = Buffer.from("Connector unit transport only, not a Drive integration result.\n")
  const request = {
    file_uri: {
      file_id: "connector-unit-only",
      file_name: "unit.txt",
      download_url: "https://connector.invalid/unit?transient=not-saved",
    },
    file_name: "unit.txt",
    expected_sha256: sha256(bytes),
    expected_size: bytes.length,
    destination_name: "unit.bin",
  }
  return { root, bytes, request }
}
test("connector stream keeps exact bytes and reuses an identical transport file without another request", async (t) => {
  const f = fixture(t)
  let calls = 0
  const fetchImpl = async () => {
    calls++
    return new Response(f.bytes)
  }
  const result = await materializeConnectorFile(f.root, f.request, { fetchImpl })
  assert.equal(result.sha256, f.request.expected_sha256)
  assert.deepEqual(fs.readFileSync(path.join(f.root, result.path)), f.bytes)
  assert.equal((await materializeConnectorFile(f.root, f.request, { fetchImpl })).reused, true)
  assert.equal(calls, 1)
  assert.equal(JSON.stringify(result).includes("transient"), false)
})
test("corrupt, oversized, untrusted and conflicting connector bytes never become verified downloads", async (t) => {
  const f = fixture(t)
  for (const bytes of [Buffer.from("wrong"), Buffer.concat([f.bytes, Buffer.from("extra")])]) {
    await assert.rejects(
      materializeConnectorFile(f.root, f.request, { fetchImpl: async () => new Response(bytes) }),
      /Connector download/,
    )
    assert.deepEqual(fs.readdirSync(path.join(f.root, ".storage/incoming")), [])
  }
  await assert.rejects(
    materializeConnectorFile(f.root, { ...f.request, destination_name: "../escape" }),
    /Exact connector/,
  )
  await assert.rejects(
    materializeConnectorFile(f.root, {
      ...f.request,
      file_uri: { ...f.request.file_uri, download_url: "http://localhost/unit" },
    }),
    /HTTPS/,
  )
  fs.writeFileSync(path.join(f.root, ".storage/incoming/unit.bin"), "preserved conflict")
  await assert.rejects(
    materializeConnectorFile(f.root, f.request),
    /Existing connector bytes conflict/,
  )
  assert.equal(
    fs.readFileSync(path.join(f.root, ".storage/incoming/unit.bin"), "utf8"),
    "preserved conflict",
  )
})
