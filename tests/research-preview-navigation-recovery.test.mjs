import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { noteText, parseNote } from "../scripts/garden.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { conceptIndexProjection } from "../scripts/research/preview.mjs"

test("private navigation recovers eight reviewed canonical concept links without approving or changing their notes", (t) => {
  const vault = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "private-navigation-recovery-")),
  )
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }))
  const write = (relative, content) => {
    const file = path.join(vault, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
    return { path: relative, sha256: sha256(content) }
  }
  const indexPath = "Knowledge/00 Tech Encyclopedia Index.md"
  const originalIndex = noteText(
    {
      title: "Index",
      entry_type: "index",
      schema_version: "tech-encyclopedia/v2",
      created: "2026-08-24",
      updated: "2026-10-08",
    },
    "# Index\n\n## 포함하는 개념\n\n- [[Knowledge/Old|기존 개념]]\n\n## 개념 경계\n\n기존 설명과 날짜는 유지한다.\n",
  )
  write(indexPath, originalIndex)
  const canonical = [
    ["AI Systems/Air-Gapped Deployment", "에어갭 배포", "security"],
    ["AI Systems/Metadata Filtering", "메타데이터 필터링", "mechanism"],
    ["AI Systems/OpenUSD", "OpenUSD 장면 기술", "architecture"],
    ["AI Systems/Row-Level Security", "행 단위 보안", "security"],
    ["AI Systems/x402", "x402", "protocol"],
    ["Research Methods/High Performance Linpack", "HPL", "metric"],
    ["Software Engineering/Code Coverage", "코드 커버리지", "metric"],
    ["Software Engineering/Insecure Direct Object Reference", "IDOR", "security"],
  ]
  const metadata = (relative, label, kind) => ({
    title: path.basename(relative),
    type: "knowledge",
    entry_type: "concept",
    schema_version: "tech-encyclopedia/v2",
    status: "evergreen",
    domain: relative.split("/")[0],
    concept_id: path.basename(relative).toLowerCase().replaceAll(" ", "-"),
    label,
    last_reviewed: "2026-10-09",
    verified_sources: ["https://fixture.example/reviewed-source"],
    map_review: {
      decision: "include",
      kind,
      reason: "Stored specialist review remains unchanged by navigation",
      reviewed: "2026-10-09",
    },
  })
  const before = canonical.map(([relative, label, kind]) =>
    write(
      `Knowledge/${relative}.md`,
      noteText(
        metadata(relative, label, kind),
        "# Existing reviewed definition\n\nThe stored note and source evidence are not reauthored.\n",
      ),
    ),
  )
  const sourceOnly = metadata("AI Systems/Source Only", "원문 링크만 있는 개념", "method")
  delete sourceOnly.map_review
  before.push(
    write(
      "Knowledge/AI Systems/Source Only.md",
      noteText(sourceOnly, "# Source-only canonical input"),
    ),
  )
  const excluded = metadata("AI Systems/Excluded", "제외된 항목", "method")
  excluded.map_review.decision = "exclude"
  before.push(write("Knowledge/AI Systems/Excluded.md", noteText(excluded, "# Excluded review")))
  const noReason = metadata("AI Systems/No Review Reason", "검토 사유 없음", "method")
  delete noReason.map_review.reason
  before.push(
    write("Knowledge/AI Systems/No Review Reason.md", noteText(noReason, "# Incomplete review")),
  )
  const recovery = conceptIndexProjection(vault, [])
  assert.ok(
    recovery,
    "Existing reviewed canonical omissions must be repaired without a new note approval",
  )
  const parsed = parseNote(recovery.content)
  assert.equal(recovery.path, indexPath)
  assert.equal(recovery.previous_sha256, sha256(originalIndex))
  assert.equal(parsed.meta.created, "2026-08-24")
  assert.equal(parsed.meta.updated, "2026-10-09")
  for (const [relative, label] of canonical)
    assert.equal(parsed.body.split(`[[Knowledge/${relative}|${label}]]`).length - 1, 1)
  assert.ok(parsed.body.includes("- [[Knowledge/Old|기존 개념]]"))
  assert.ok(parsed.body.includes("## 개념 경계\n\n기존 설명과 날짜는 유지한다."))
  for (const label of ["Source Only", "Excluded", "No Review Reason"])
    assert.equal(parsed.body.includes(label), false)
  assert.equal(fs.readFileSync(path.join(vault, indexPath), "utf8"), originalIndex)
  for (const row of before)
    assert.equal(sha256(fs.readFileSync(path.join(vault, row.path))), row.sha256)
  assert.equal(Object.hasOwn(recovery, "approval_granted"), false)
  assert.equal(Object.hasOwn(recovery, "approved_runs"), false)
  // Apply only the disposable fixture's index to verify idempotence and retain
  // the existing separately approved create behavior without duplicate links.
  write(indexPath, recovery.content)
  assert.equal(conceptIndexProjection(vault, []), null)
  const next = conceptIndexProjection(vault, [
    {
      operation: "create",
      path: "Knowledge/Robotics/Approved New.md",
      content: noteText(
        { domain: "Robotics", label: "이미 승인된 새 용어", last_reviewed: "2026-10-10" },
        "",
      ),
    },
  ])
  assert.ok(next.content.includes("[[Knowledge/Robotics/Approved New|이미 승인된 새 용어]]"))
  for (const [relative, label] of canonical)
    assert.equal(next.content.split(`[[Knowledge/${relative}|${label}]]`).length - 1, 1)
})
