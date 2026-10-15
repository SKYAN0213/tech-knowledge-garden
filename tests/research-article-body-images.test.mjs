import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { captureArticleBodyImages, collectWindowDetails } from "../scripts/research/list-scan.mjs"
import { RunState, readJSON } from "../scripts/research/run-state.mjs"
import { sourceId } from "../scripts/research/contracts.mjs"

const url = "https://publisher.example/news/1"
const imageURL = "https://cdn.publisher.example/news/photo/202610/table.png"
const parent = { final_url: url, source_version_id: "parent:v1", fetch_status: "captured" }
const image = { final_url: imageURL, source_version_id: "image:v1", fetch_status: "captured" }
const parsed = {
  status: "partial",
  title: "Original stock table",
  parse_id: "parent-parse",
  blocks: [],
  dates: { published_at: "2026-10-02" },
  quality: { required_fields_present: false },
  body_images: [{ url: imageURL, dom_path: "/html/body/article/img" }],
}
const profile = {
  id: "article",
  url_pattern: "^https://publisher\\.example/news/1$",
  options: {
    body_images: {
      max_images: 2,
      url_pattern: "^https://cdn\\.publisher\\.example/news/photo/[0-9]{6}/[a-z]+\\.png$",
      parse_options: { ocr: true, language: "ko" },
    },
  },
}
const channel = {
  url: "https://publisher.example/feed",
  method: "rss",
  allowed_hosts: ["publisher.example", "cdn.publisher.example"],
}
const run = { stage: async (_name, _input, action) => action() }

test("image-only article keeps original metadata and separate OCR evidence without making a candidate", async () => {
  const calls = []
  const result = await collectWindowDetails(
    "private",
    run,
    {},
    channel,
    [profile],
    [{ url, text: parsed.title, published_at: "2026-10-02" }],
    {
      fetchPolicy: async (_root, _fetcher, target) => {
        calls.push(target)
        return target === url ? parent : image
      },
      parse: async (_root, document, options) =>
        document === parent
          ? parsed
          : {
              status: "extracted",
              parse_id: "image-parse",
              blocks: [{ text: "FANUC 123.45" }],
              quality: { numeric_verification: "unreviewed", table_structure: "unreviewed" },
              title: options.title,
            },
    },
  )
  assert.deepEqual(calls, [url, imageURL])
  assert.equal(result.candidates.length, 0)
  assert.equal(result.documents.length, 2)
  assert.equal(result.parses.length, 2)
  assert.equal(result.details[0].status, "article_image_body_requires_review")
  const record = result.details[0].body_images[0]
  assert.equal(record.parent_parse_id, "parent-parse")
  assert.equal(record.parent_source_version_id, "parent:v1")
  assert.equal(record.parent_dom_path, "/html/body/article/img")
  assert.equal(record.source_version_id, "image:v1")
  assert.equal(record.parse_id, "image-parse")
  assert.equal(record.numeric_verification, "unreviewed")
  assert.equal(parsed.status, "partial")
  assert.deepEqual(parsed.blocks, [])
})

test("partial OCR remains separate with its failure state and blocks", async () => {
  const result = await captureArticleBodyImages(
    "private",
    run,
    {},
    channel,
    parent,
    parsed,
    profile,
    {
      fetchPolicy: async () => image,
      parse: async () => ({
        status: "partial",
        parse_id: "image-parse",
        blocks: [{ text: "Uncertain OCR" }],
        quality: { missing_pages: [1] },
      }),
    },
  )
  assert.equal(result.images[0].parse_status, "partial")
  assert.deepEqual(result.images[0].ocr_quality.missing_pages, [1])
  assert.equal(result.parses[0].blocks.length, 1)
})

test("parent image host and count violations are rejected before any network call", async () => {
  for (const input of [
    {
      ...parsed,
      body_images: [{ ...parsed.body_images[0], url: "https://other.example/image.png" }],
    },
    { ...parsed, body_images: [parsed.body_images[0], parsed.body_images[0]] },
    { ...parsed, body_images: [{ url: imageURL }] },
  ]) {
    await assert.rejects(
      captureArticleBodyImages("private", run, {}, channel, parent, input, profile, {
        fetchPolicy: () => assert.fail("invalid policy reached network"),
      }),
    )
  }
})

test("an image fetch failure is retained and never invokes OCR", async () => {
  const result = await captureArticleBodyImages(
    "private",
    run,
    {},
    channel,
    parent,
    parsed,
    profile,
    {
      fetchPolicy: async () => ({ fetch_status: "blocked" }),
      parse: () => assert.fail("blocked image reached parser"),
    },
  )
  assert.equal(result.images[0].fetch_status, "blocked")
  assert.equal(result.documents.length, 0)
  assert.equal(result.parses.length, 0)
})

test("image metadata conflicts stop asset requests and OCR before body review", async () => {
  for (const [link, expected] of [
    [{ url, text: "Different original title", published_at: "2026-10-02" }, "title_conflict"],
    [{ url, text: parsed.title, published_at: "2026-10-03" }, "date_conflict"],
  ]) {
    const calls = []
    const result = await collectWindowDetails("private", run, {}, channel, [profile], [link], {
      fetchPolicy: async (_root, _fetcher, target) => {
        calls.push(target)
        assert.equal(target, url)
        return parent
      },
      parse: async () => parsed,
    })
    assert.deepEqual(calls, [url])
    assert.equal(result.details[0].status, expected)
    assert.equal(result.candidates.length, 0)
    assert.equal(result.documents.length, 1)
    assert.equal(result.details[0].body_images, undefined)
  }
})

test("source-authoritative RSS titles still reach separate image review", async () => {
  const result = await collectWindowDetails("private", run, {}, {
    ...channel,
    listing_profile: { rss_title_policy: "source_title_authoritative" },
  }, [profile], [{ url, text: "RSS title variant", published_at: "2026-10-02" }], {
    fetchPolicy: async (_root, _fetcher, target) => target === url ? parent : image,
    parse: async (_root, document) => document === parent ? parsed : {
      status: "partial", parse_id: "image-parse", blocks: [], quality: { missing_pages: [1] },
    },
  })
  assert.equal(result.details[0].status, "article_image_body_requires_review")
  assert.equal(result.details[0].title_relation, "rss_variant_source_title_authoritative")
  assert.equal(result.candidates.length, 0)
})

test("OCR exceptions retain acquired images, continue adjacent assets and resume without refetching", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "body-image-failure-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const secondURL = imageURL.replace("table.png", "second.png")
  const input = { ...parsed, body_images: [...parsed.body_images, { url: secondURL, dom_path: "/html/body/article/img[2]" }] }
  let fetches = 0, fail = true
  const execute = () => collectWindowDetails(root, new RunState(root, "image-failure", {}), {}, channel, [profile], [{ url, text: parsed.title, published_at: "2026-10-02" }], {
    fetchPolicy: async (_root, _fetcher, target) => {
      fetches++
      return target === url ? parent : { ...image, final_url: target, source_version_id: `${sourceId(target)}:v1` }
    },
    parse: async (_root, document) => {
      if (document.final_url === url) return input
      if (document.final_url === imageURL && fail) throw Error("OCR runtime unavailable")
      return { status: "partial", parse_id: `parse-${sourceId(document.final_url)}`, blocks: [{ text: "Unreviewed OCR cells" }], quality: { missing_pages: [1] } }
    },
  })
  const failed = await execute()
  assert.equal(failed.documents.length, 3)
  assert.equal(failed.parses.length, 2)
  assert.equal(failed.candidates.length, 0)
  assert.equal(failed.details[0].status, "article_image_body_parse_failed")
  assert.equal(failed.details[0].body_images[0].error, "OCR runtime unavailable")
  assert.equal(failed.details[0].body_images[0].numeric_verification, "unreviewed")
  assert.equal(failed.details[0].body_images[1].parse_status, "partial")
  assert.equal(readJSON(root, "runs/image-failure/state.json").stages[`parse-body-image-${sourceId(imageURL)}`].status, "failed")
  assert.equal(fetches, 3)
  fail = false
  const resumed = await execute()
  assert.equal(fetches, 3)
  assert.deepEqual(resumed.documents, failed.documents)
  assert.equal(resumed.parses.length, 3)
  assert.equal(resumed.details[0].status, "article_image_body_requires_review")
  assert.equal(resumed.details[0].body_images[0].numeric_verification, "unreviewed")
  assert.equal(resumed.details[0].body_images[0].error, undefined)
  assert.equal(resumed.candidates.length, 0)
})
