import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { registry } from "../scripts/research/discovery.mjs"
import { assessBoundedRSSFeed } from "../scripts/research/rss-scan.mjs"

const read = (name) =>
  JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"))

test("IEEE Spectrum Robotics uses the shared bounded RSS contract and preserves the linked publisher host", () => {
  const acquisition = read("research-acquisition")
  const route = registry(
    read("research-source-channels"),
    read("research-watchlist"),
    acquisition,
  ).find((entry) => entry.channel_id === "ieee-spectrum-robotics")
  assert.ok(route)
  assert.equal(route.method, "rss")
  assert.equal(route.url, "https://spectrum.ieee.org/rss/robotics/fulltext")
  assert.deepEqual(route.allowed_hosts, ["spectrum.ieee.org", "robotsguide.com"])
  assert.equal(route.listing_profile.pagination, "bounded-feed")
  assert.equal(route.listing_profile.feed_title, "IEEE Spectrum")

  const links = [
    {
      url: "https://spectrum.ieee.org/robust-robot-hand",
      guid: "https://spectrum.ieee.org/robust-robot-hand",
      text: "Atlas Robot’s New Hand May Outperform Humanlike Designs",
      listed_date_text: "Thu, 01 Oct 2026 14:40:12 +0000",
      published_at: "2026-10-01",
      published_timestamp: "2026-10-01T14:40:12.000Z",
    },
    {
      url: "https://robotsguide.com/learn/a-day-in-the-life-of-a-roboticist-charlie-kemp",
      guid: "https://robotsguide.com/learn/a-day-in-the-life-of-a-roboticist-charlie-kemp",
      text: "A Day in the Life of a Roboticist: Charlie Kemp",
      listed_date_text: "Mon, 28 Sep 2026 21:48:56 +0000",
      published_at: "2026-09-28",
      published_timestamp: "2026-09-28T21:48:56.000Z",
    },
    {
      url: "https://spectrum.ieee.org/graduate-student-nasas-robots-assembly",
      guid: "https://spectrum.ieee.org/graduate-student-nasas-robots-assembly",
      text: "This Graduate Student Equips NASA’s Robots With Assembly Skills",
      listed_date_text: "Fri, 17 Jul 2026 18:00:01 +0000",
      published_at: "2026-07-17",
      published_timestamp: "2026-07-17T18:00:01.000Z",
    },
  ]
  const parse = {
    status: "extracted",
    title: "IEEE Spectrum",
    quality: { required_fields_present: true },
    links: links.map((link) => ({ ...link, categories: [] })),
  }
  const result = assessBoundedRSSFeed(parse, route, "2026-09-25", "2026-10-02")
  assert.equal(result.status, "window_covered")
  assert.deepEqual(result.links.map((link) => link.url), links.slice(0, 2).map((link) => link.url))

  const unexpectedHost = {
    ...parse,
    links: [{ ...parse.links[0], url: "https://outside.example/robot-news" }],
  }
  assert.equal(
    assessBoundedRSSFeed(unexpectedHost, route, "2026-09-25", "2026-10-02").reason,
    "feed_article_url_outside_policy",
  )
})
