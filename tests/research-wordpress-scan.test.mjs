import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  parseWordPressPage,
  scanWordPressPostsRoute,
  wordpressPageURL,
} from "../scripts/research/wordpress-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const channel = {
  channel_id: "boston-dynamics-blog",
  publisher_id: "bostondynamics.com",
  url: "https://bostondynamics.com/blog/",
  method: "html-list",
  language: "en",
  region: "해외",
  axis: "기술·제품",
  sectors: ["로봇·제조"],
  allowed_hosts: ["bostondynamics.com"],
  item_pattern: "^https://bostondynamics\\.com/blog/[^/?#]+/?$",
  api_profile: {
    id: "wordpress-rest-posts-json-v1",
    endpoint: "https://bostondynamics.com/wp-json/wp/v2/blog",
    page_size: 2,
    max_pages: 3,
    max_details: 4,
  },
}
const post = (id, day, slug = `article-${id}`) => ({
  id,
  date: `${day}T13:10:02`,
  date_gmt: `${day}T13:10:02`,
  link: `https://bostondynamics.com/blog/${slug}/`,
  title: { rendered: `Official &amp; <em>robot</em> news ${id}` },
  status: "publish",
  type: "blog",
  slug,
})

test("WordPress REST route bounds requests and validates post identity and dates", () => {
  const url = new URL(wordpressPageURL(channel, 2, { since: "2026-09-25", until: "2026-10-02" }))
  assert.equal(url.pathname, "/wp-json/wp/v2/blog")
  assert.equal(url.searchParams.get("page"), "2")
  assert.equal(url.searchParams.get("per_page"), "2")
  assert.equal(url.searchParams.get("after"), "2026-09-25T00:00:00")
  assert.match(url.searchParams.get("_fields"), /date_gmt/)
  const parsed = parseWordPressPage([post(10, "2026-10-01")], channel, 1, {
    since: "2026-09-25",
    until_exclusive: "2026-10-02",
  })
  assert.equal(parsed.items[0].text, "Official & robot news 10")
  assert.equal(parsed.items[0].published_at, "2026-10-01")
  assert.equal(parsed.page_complete, true)
  assert.throws(
    () =>
      parseWordPressPage(
        [{ ...post(10, "2026-10-01"), link: "https://bostondynamics.com/news/other/" }],
        channel,
        1,
        { since: "2026-09-25", until_exclusive: "2026-10-02" },
      ),
    /outside the channel article policy/,
  )
  assert.throws(
    () => parseWordPressPage([{ ...post(10, "2026-10-01"), status: "draft" }], channel, 1, {}),
    /published identity/,
  )
})

test("WordPress REST scan paginates to a short page and keeps detail evidence unreviewed", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wp-rest-scan-")))
  try {
    fs.mkdirSync(path.join(root, "pages"))
    const calls = []
    const run = {
      async stage(_name, _input, action) {
        return action()
      },
    }
    const fetchPolicy = async (_root, _fetcher, url) => {
      calls.push(url)
      const parsedURL = new URL(url)
      let body, mime_type
      if (parsedURL.pathname.endsWith("/wp/v2/blog")) {
        const page = Number(parsedURL.searchParams.get("page"))
        body = JSON.stringify(page === 1 ? [post(10, "2026-10-01"), post(9, "2026-09-30")] : [])
        mime_type = "application/json"
      } else {
        body = "official article"
        mime_type = "text/html"
      }
      const body_path = `pages/${calls.length}.body`
      fs.writeFileSync(path.join(root, body_path), body)
      return {
        original_url: url,
        final_url: url,
        source_version_id: `source-v${calls.length}`,
        fetch_status: "captured",
        mime_type,
        body_path,
        body_sha256: sha256(body),
        observed_at: "2026-10-02T00:00:00Z",
      }
    }
    const parse = async (_root, document) => {
      const second = document.original_url.includes("article-9")
      return {
        schema: "source-parse/v1",
        parse_id: `parse-${document.source_version_id}`,
        source_version_id: document.source_version_id,
        status: "extracted",
        title: `Official & robot news ${second ? 9 : 10}`,
        quality: { required_fields_present: true },
        blocks: [{ text: "Verified article body." }],
        dates: { published_at: second ? "2026-09-30" : "2026-10-01" },
      }
    }
    const result = await scanWordPressPostsRoute(
      root,
      run,
      {},
      channel,
      [
        {
          id: "boston-blog-article",
          url_pattern: channel.item_pattern,
          options: { language: "en" },
        },
      ],
      { since: "2026-09-25", until: "2026-10-02" },
      { fetchPolicy, parse },
    )
    assert.equal(result.summary.status, "window_scanned", JSON.stringify(result.summary))
    assert.equal(result.summary.scanned_items, 2)
    assert.equal(result.summary.window_items, 2)
    assert.equal(result.summary.pages.length, 2)
    assert.equal(result.candidates.length, 2)
    assert.equal(result.candidates[0].discovery[0].method, "json-page")
    assert.equal(new URL(calls[0]).searchParams.get("orderby"), "date")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
