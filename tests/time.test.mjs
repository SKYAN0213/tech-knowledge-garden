import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

test("Legacy KST and explicit-offset publication dates render identically on Mac and UTC CI", () => {
  const script = `import { coverageDate } from './scripts/time.mjs';
    console.log(JSON.stringify(['2026-06-23 17:00', '2026-06-23T17:00:00+09:00', '2026-06-23T08:00:00Z'].map(x => {
      const d=coverageDate(x); return [d.toISOString(), d.toLocaleString('sv-SE', {timeZone:'Asia/Seoul'}).slice(0,16), d.toUTCString()];
    })));`
  const expected = Array(3).fill([
    "2026-06-23T08:00:00.000Z",
    "2026-06-23 17:00",
    "Tue, 23 Jun 2026 08:00:00 GMT",
  ])
  for (const TZ of ["Asia/Seoul", "UTC", "America/Los_Angeles"]) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, TZ },
    })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout), expected)
  }
})
