import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SECTORS } from "./sectors.mjs"
import { DEEP_KINDS } from "./editorial.mjs"

export function auditRuns(records) {
  const seen = new Set(),
    accepted = [],
    rejected = []
  for (const r of [...records].sort((a, b) => String(a.edition).localeCompare(String(b.edition)))) {
    const valid =
      typeof r.edition === "string" &&
      /^Editions\//.test(r.edition) &&
      !seen.has(r.edition) &&
      !isNaN(Date.parse(r.checked_at)) &&
      ["drive_verified", "deployment_verified", "rss_verified", "github_verified"].every(
        (k) => r[k] === true,
      ) &&
      (DEEP_KINDS.includes(r.deep_kind) ||
        (typeof r.skip_reason === "string" && r.skip_reason.trim())) &&
      Number.isFinite(r.reading_minutes) &&
      r.reading_minutes >= 0 &&
      Array.isArray(r.coverage) &&
      r.coverage.length === 32 &&
      SECTORS.every((sector) =>
        ["기술·제품", "기업·운영"].every((channel) =>
          ["국내", "해외"].every((region) => {
            const rows = r.coverage.filter(
              (c) => c.sector === sector && c.channel === channel && c.region === region,
            )
            return (
              rows.length === 1 &&
              ["확인", "부분 확인", "접근 실패", "미실시"].includes(rows[0].status) &&
              Array.isArray(rows[0].urls) &&
              (rows[0].status !== "확인" || rows[0].urls.length > 0)
            )
          }),
        ),
      )
    if (!valid) {
      rejected.push(r.edition || "unknown")
      continue
    }
    seen.add(r.edition)
    accepted.push(r)
  }
  const first = accepted.slice(0, 7)
  return {
    completed_runs: accepted.length,
    first_seven_ready: first.length === 7,
    rejected,
    regions: Object.fromEntries(
      ["국내", "해외"].map((region) => [
        region,
        Object.fromEntries(
          ["확인", "부분 확인", "접근 실패", "미실시"].map((s) => [
            s,
            first.flatMap((r) => r.coverage).filter((c) => c.region === region && c.status === s)
              .length,
          ]),
        ),
      ]),
    ),
    runs: first.map((r) => ({
      edition: r.edition,
      deep_kind: r.deep_kind || null,
      skip_reason: r.skip_reason || null,
      reading_minutes: r.reading_minutes,
      notes: r.notes || "",
    })),
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = ".local/research/runs"
  const records = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    : []
  console.log(JSON.stringify(auditRuns(records), null, 2))
}
