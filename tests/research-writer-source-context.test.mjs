import test from "node:test"
import assert from "node:assert/strict"
import { sha256 } from "../scripts/research/contracts.mjs"
import { writeDraft } from "../scripts/research/editor.mjs"
import { SECTORS } from "../scripts/sectors.mjs"

function fixture() {
  const quote = "The study compared methods under fixed conditions.",
    parse = {
      source_id: "source",
      source_version_id: "source:v1",
      parse_id: "parse-v1",
      status: "extracted",
      title: "A technical review, not a product release",
      blocks: [
        { block_id: "b1", text: quote, locator: { text_hash: sha256(quote) } },
        { block_id: "b2", text: "Unreviewed material must not reach the writer." },
      ],
      dates: { observed_at: "2026-10-08", published_at: "2026-10-07" },
    },
    document = {
      source_id: "source",
      source_version_id: "source:v1",
      original_url: "https://example.org/paper",
      body_path: "private/source.bin",
    },
    claim = {
      claim_id: "c1",
      subject: "The study",
      statement: "The study compared methods under fixed conditions.",
      published_at: null,
      review: { status: "verified" },
      evidence: [
        {
          source_id: "source",
          source_version_id: "source:v1",
          parse_id: "parse-v1",
          block_id: "b1",
          quote,
          support: "direct",
        },
      ],
    }
  return {
    claims: [claim, { ...structuredClone(claim), claim_id: "c2" }],
    parses: [parse],
    documents: [document],
  }
}

test("writer receives only exact reviewed citations, deduplicated with source identity context", async () => {
  const f = fixture(),
    before = structuredClone(f),
    stopped = Error("Inspect model request")
  let request
  await assert.rejects(
    writeDraft(
      {
        structured: async (input) => {
          request = input
          throw stopped
        },
      },
      [
        ...f.claims,
        {
          ...structuredClone(f.claims[0]),
          claim_id: "unreviewed",
          review: { status: "unreviewed" },
        },
      ],
      f,
    ),
    (error) => error === stopped,
  )
  const input = JSON.parse(request.messages[1].content)
  assert.deepEqual(
    input.sectors.map((sector) => sector.name),
    SECTORS,
  )
  assert.ok(input.sectors.every((sector) => sector.scope.length > 0))
  assert.match(input.sectors.find((sector) => sector.name === "바이오·의료기술").scope, /의약품/)
  assert.ok(input.themes.find((theme) => theme.name === "인력·조직").tags.includes("위원 모집"))
  assert.deepEqual(input.source_context, [
    {
      document: 1,
      title: f.parses[0].title,
      original_url: f.documents[0].original_url,
      citations: [{ quote: f.claims[0].evidence[0].quote, claim_ids: ["c1", "c2"] }],
    },
  ])
  assert.deepEqual(
    input.claims.map((claim) => claim.claim_id),
    ["c1", "c2"],
  )
  assert.equal(input.claims[0].publication_date, null)
  assert.doesNotMatch(
    request.messages[1].content,
    /Unreviewed material|private\/|2026-10-08|source:v1|parse-v1/,
  )
  assert.match(request.messages[0].content, /claims에 없는 새 사실/)
  assert.match(request.messages[0].content, /기업·기관이 없으면 entities는 빈 배열/)
  assert.doesNotMatch(request.messages[0].content, /entities에는 원래 subject의 표기를 그대로 쓴다/)
  assert.deepEqual(f, before)
})

test("writer rejects wrong source versions, modified blocks and unsupported quotes before inference", async () => {
  let calls = 0
  const model = {
    structured: async () => {
      calls++
      throw Error("Unexpected inference")
    },
  }
  const mutations = [
    (f) => {
      f.documents[0].source_version_id = "source:v2"
    },
    (f) => {
      f.parses[0].source_version_id = "source:v2"
    },
    (f) => {
      f.parses[0].blocks[0].text += " Modified."
    },
    (f) => {
      f.claims[0].evidence[0].quote = "Not in source"
    },
    (f) => {
      f.claims[0].evidence[0].support = "partial"
    },
    (f) => {
      f.documents.push(structuredClone(f.documents[0]))
    },
  ]
  for (const mutate of mutations) {
    const f = fixture()
    mutate(f)
    await assert.rejects(writeDraft(model, f.claims, f), /exact direct evidence/)
  }
  assert.equal(calls, 0)
})

test("writer keeps separate citations for revised parses of the same source", async () => {
  const f = fixture(),
    revised = structuredClone(f.parses[0]),
    stopped = Error("Inspect request")
  revised.parse_id = "parse-v2"
  revised.title = "Revised extraction"
  f.parses.push(revised)
  f.claims[1].evidence[0].parse_id = revised.parse_id
  let request
  await assert.rejects(
    writeDraft(
      {
        structured: async (input) => {
          request = input
          throw stopped
        },
      },
      f.claims,
      f,
    ),
    (error) => error === stopped,
  )
  const input = JSON.parse(request.messages[1].content)
  assert.equal(input.source_context.length, 2)
  assert.deepEqual(
    input.source_context.map((source) => source.citations[0].claim_ids),
    [["c1"], ["c2"]],
  )
})
