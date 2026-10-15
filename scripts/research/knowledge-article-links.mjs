import fs from "node:fs"
import { assertSchema, sha256 } from "./contracts.mjs"
import { safePath } from "./run-state.mjs"

const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const reference = {
  type: "object",
  additionalProperties: false,
  required: ["path", "sha256"],
  properties: { path: { type: "string", minLength: 1, maxLength: 500 }, sha256: hash },
}
const files = [
  "draft.json",
  "reviewed-claims.json",
  "documents.json",
  "parses.json",
  "editorial-review.json",
  "approved-article.json",
]
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "basis", "articles"],
  properties: {
    schema: { type: "string", enum: ["research-knowledge-article-links/v1"] },
    basis: reference,
    articles: {
      type: "array",
      minItems: 1,
      maxItems: 400,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["run", "event_id", "files"],
        properties: {
          run: { type: "string", pattern: "^[A-Za-z0-9_-]{1,160}$" },
          event_id: { type: "string", pattern: "^[a-f0-9]{16}$" },
          files: {
            type: "object",
            additionalProperties: false,
            required: files,
            properties: Object.fromEntries(
              [...files, "article-concept-review.json"].map((name) => [name, hash]),
            ),
          },
        },
      },
    },
  },
}
const sameFiles = (a, b) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([name, digest]) => b[name] === digest)

// A link selects an existing native approval; it is never an approval decision.
// Bind the selected event and all native bytes before extending the graph.
export function assertKnowledgeArticleLink(root, row, inputLoader, vault) {
  const input = inputLoader(root, row.run, { vault })
  if (
    input.run !== row.run ||
    input.article.event_id !== row.event_id ||
    !sameFiles(row.files, input.file_hashes)
  )
    throw Error("Knowledge article link differs from its exact native approval")
  return input
}

export function loadKnowledgeArticleLinks(root, file, basis, inputLoader, vault) {
  if (!file) return null
  const bytes = fs.readFileSync(safePath(root, file))
  if (bytes.length > 512 * 1024) throw Error("Knowledge article links exceed the bounded input")
  const packet = JSON.parse(bytes)
  assertSchema(packet, schema, "$article_links")
  if (packet.articles.length > 400 || !packet.articles.length)
    throw Error("Bounded knowledge article links required")
  if (packet.basis.path !== basis.path || packet.basis.sha256 !== basis.sha256)
    throw Error("Knowledge article links belong to another native basis")
  const runs = new Set(),
    events = new Set()
  for (const row of packet.articles) {
    if (runs.has(row.run) || events.has(row.event_id))
      throw Error("Distinct knowledge article runs and events required")
    runs.add(row.run)
    events.add(row.event_id)
    assertKnowledgeArticleLink(root, row, inputLoader, vault)
  }
  return { reference: { path: file, sha256: sha256(bytes) }, articles: packet.articles }
}
