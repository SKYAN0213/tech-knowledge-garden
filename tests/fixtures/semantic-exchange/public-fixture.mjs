// Synthetic public projections only. No operational approval or model is invoked.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { parseNote, sections, canonicalURL } from "../../../scripts/garden.mjs"
import { articleSearchText } from "../../../scripts/knowledge.mjs"
import { articlePublicFingerprint } from "../../../web/article-semantic-index.mjs"

export const PRIVATE_SENTINEL = "SYNTHETIC_PRIVATE_APPROVAL_TOKEN_DO_NOT_EXPORT"
export const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")
export const noteBytes = (meta, body, newline = "\n") =>
  Buffer.from(
    ("---\n" + JSON.stringify(meta) + "\n---\n\n" + body + "\n").replaceAll("\n", newline),
  )

export function publicFixture(t, { semanticIndex = true } = {}) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "tkg-exchange-"))
  const root = path.join(directory, "source")
  const vault = path.join(root, "vault")
  const output = path.join(directory, "exchange")
  for (const relative of ["vault/News", "vault/Knowledge", "data", ".local/research/local-ai"])
    fs.mkdirSync(path.join(root, relative), { recursive: true })
  fs.writeFileSync(path.join(root, ".local/research/local-ai/private.json"), PRIVATE_SENTINEL)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const concepts = new Map()
  function writeConcept(id, extra = {}) {
    const meta = {
      type: "knowledge",
      entry_type: "concept",
      concept_id: id,
      title: "합성 개념 " + id,
      label: id,
      aliases: [id + " alias"],
      keywords: [PRIVATE_SENTINEL],
      verified_sources: ["https://example.test/concepts/" + id, "https://example.test/manual"],
      map_review: {
        decision: "include",
        kind: "mechanism",
        reason: "독자가 작동 원리를 이해하기 위한 합성 전문 개념이다.",
        reviewed: "2026-10-23",
      },
      private_payload: PRIVATE_SENTINEL,
      ...extra,
    }
    const body =
      "## 한 문장 정의\n\n합성 개념 " +
      id +
      "의 범위와 작동 원리를 구별한다.\n\n## 내부 편집 기록\n\n" +
      PRIVATE_SENTINEL
    const file = path.join(vault, "Knowledge", id + ".md")
    fs.writeFileSync(file, noteBytes(meta, body))
    concepts.set(id, { file, meta, body })
    return concepts.get(id)
  }
  writeConcept("alpha", {
    relations: [
      {
        target: "beta",
        type: "uses",
        basis: "source",
        reason: "알파 개념은 베타 개념을 사용하는 합성 관계다.",
        evidence: ["https://example.test/concepts/alpha"],
      },
    ],
    connections: [
      {
        target: "gamma",
        reason: "방향과 유형을 지정하지 않은 확인된 합성 연관성이다.",
        evidence: [],
      },
    ],
  })
  for (const id of ["beta", "gamma", "delta"]) writeConcept(id)
  writeConcept("excluded", {
    map_review: {
      decision: "exclude",
      kind: "mechanism",
      reason: "합성 제외 개념이다.",
      reviewed: "2026-10-23",
    },
  })
  const articles = new Map()
  function writeArticle(
    eventId,
    extra = {},
    body = "# 같은 제목의 합성 기사\n\nCafe\u0301에서 측정값은 ±5%이고 −2 ms와 +2 ms를 구별한다.",
    newline = "\n",
  ) {
    const meta = {
      type: "news",
      event_id: eventId,
      title: "같은 제목의 합성 기사",
      published_at: "2026-10-23",
      review_status: "verified",
      sources: [
        "https://example.test/article/" + eventId + "/?utm_source=fixture",
        "https://example.test/reference",
      ],
      private_payload: PRIVATE_SENTINEL,
      ...extra,
    }
    const file = path.join(vault, "News", eventId + ".md")
    fs.writeFileSync(file, noteBytes(meta, body, newline))
    articles.set(eventId, { file, meta, body })
    return articles.get(eventId)
  }
  const roles = ["topic", "application", "comparison_evaluation", "context_background"]
  writeArticle("1".repeat(16), {}, undefined, "\r\n")
  writeArticle("2".repeat(16))
  writeArticle("3".repeat(16))
  writeArticle("4".repeat(16), { concept_ids: ["alpha"] })
  writeArticle("5".repeat(16), { concept_ids: ["excluded"] })
  writeArticle(
    "6".repeat(16),
    { review_status: "pending", semantic_review_status: "reviewed_none" },
    PRIVATE_SENTINEL,
  )
  const indexFile = path.join(root, "data/article-semantic-review-index.json")
  const registrySnapshot = () =>
    [...concepts.values()]
      .filter((n) => n.meta.map_review.decision === "include")
      .map((n) => ({
        concept_id: n.meta.concept_id,
        path: "Knowledge/" + n.meta.concept_id + ".md",
        title: n.meta.title,
        label: n.meta.label,
        aliases: n.meta.aliases,
        keywords: n.meta.keywords,
        kind: n.meta.map_review.kind,
        reason: n.meta.map_review.reason,
        definition: sections(n.body, 2)
          .find((s) => s.title === "한 문장 정의")
          .body.trim(),
        verified_sources: n.meta.verified_sources,
        sha256: hash(fs.readFileSync(n.file)),
      }))
      .sort((a, b) => a.concept_id.localeCompare(b.concept_id, "en"))
  const reviews = ["1".repeat(16), "2".repeat(16)].map((id, i) => {
    const { meta, body } = articles.get(id)
    return {
      event_id: id,
      status: i ? "reviewed_none" : "reviewed_links",
      reviewed_at: "2026-10-23T06:00:00Z",
      workflow_id: "synthetic-public-index",
      approved_run: "synthetic-native-run",
      semantic_input_sha256: "a".repeat(64),
      executor: "codex",
      model: "gpt-6-luna",
      task_id: "reasoning-" + "b".repeat(64),
      request_sha256: "c".repeat(64),
      result_sha256: "d".repeat(64),
      receipt_sha256: "e".repeat(64),
      article_public_sha256: hash(
        articlePublicFingerprint({
          event_id: id,
          title: meta.title,
          published_at: meta.published_at,
          source_urls: meta.sources.map(canonicalURL),
          prose: [meta.title, articleSearchText(body)].join("\n"),
        }),
      ),
      approval_files_sha256: "f".repeat(64),
      concept_registry_sha256: hash(JSON.stringify(registrySnapshot())),
      policy_sha256: "0".repeat(64),
      links: i
        ? []
        : [...concepts.keys()]
            .filter((k) => k !== "excluded")
            .map((conceptId, index) => ({
              concept_id: conceptId,
              role: roles[index],
              reason: "합성 공개 검토가 이 개념의 역할을 명시한다.",
              evidence_claim_ids: ["synthetic-public-claim-" + index],
              concept_path: "Knowledge/" + conceptId + ".md",
              concept_sha256: hash(fs.readFileSync(concepts.get(conceptId).file)),
            })),
    }
  })
  function writeIndex() {
    fs.writeFileSync(
      indexFile,
      JSON.stringify({ schema: "article-semantic-review-index/v1", reviews }),
    )
  }
  if (semanticIndex) writeIndex()
  return {
    directory,
    root,
    vault,
    output,
    concepts,
    articles,
    reviews,
    indexFile,
    writeConcept,
    writeArticle,
    writeIndex,
    registrySnapshot,
  }
}

export function rewriteNote(file, change) {
  const note = parseNote(fs.readFileSync(file, "utf8"))
  change(note)
  fs.writeFileSync(file, noteBytes(note.meta, note.body))
}
