import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  parseSECSubmissions,
  scanSECSubmissionsRoute,
  validateSECRoute,
} from "../scripts/research/sec-scan.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"

const channel = {
  channel_id: "route-tesla-sec-filings",
  url: "https://data.sec.gov/submissions/CIK0001318605.json",
  allowed_hosts: ["data.sec.gov", "www.sec.gov"],
  item_pattern:
    "^https://www\\.sec\\.gov/Archives/edgar/data/1318605/[0-9]{18}/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$",
  api_profile: {
    id: "sec-submissions-json-v1",
    cik: "1318605",
    forms: ["8-K", "10-K", "10-Q"],
    max_submissions: 100,
    max_details: 20,
  },
}

const submission = (date, form, accession, document) => ({
  filingDate: date,
  form,
  accessionNumber: accession,
  primaryDocument: document,
})

function payload(rows, cik = "0001318605") {
  return {
    cik,
    name: "Tesla, Inc.",
    filings: {
      recent: Object.fromEntries(
        ["filingDate", "form", "accessionNumber", "primaryDocument"].map((key) => [
          key,
          rows.map((row) => row[key]),
        ]),
      ),
    },
  }
}

test("SEC scanner selects dated business filings, allows safe nested primary documents, and fails closed", () => {
  const body = payload([
    submission("2026-10-02", "8-K", "0001628280-26-064366", "tsla-20261002.htm"),
    submission("2026-09-29", "8-K", "0001628280-26-063820", "tsla-20260929.htm"),
    submission("2026-09-09", "4", "0001104659-26-106432", "xslF345X06/tm2625055d1_4seq1.xml"),
    submission("2026-09-08", "144", "0001950047-26-009212", "xsl144X01/primary_doc.xml"),
    submission("2026-09-01", "8-K", "0001628280-26-060001", "tsla-20260901.htm"),
  ])
  const result = parseSECSubmissions(body, channel, {
    since: "2026-09-25",
    until: "2026-10-04",
  })
  assert.equal(result.scanned_items, 5)
  assert.equal(result.items[0].form, "8-K")
  assert.deepEqual(
    result.items.map(({ url, published_at, json_pointer }) => ({ url, published_at, json_pointer })),
    [
      {
        url: "https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/tsla-20261002.htm",
        published_at: "2026-10-02",
        json_pointer: "/filings/recent/0",
      },
      {
        url: "https://www.sec.gov/Archives/edgar/data/1318605/000162828026063820/tsla-20260929.htm",
        published_at: "2026-09-29",
        json_pointer: "/filings/recent/1",
      },
    ],
  )
  assert.throws(
    () => parseSECSubmissions(body, channel, { since: "2026-09-01", until: "2026-10-04" }),
    /do not reach the beginning/,
  )
  const traversal = payload([
    submission("2026-10-02", "8-K", "0001628280-26-064366", "../outside.htm"),
    submission("2026-09-01", "8-K", "0001628280-26-060001", "older.htm"),
  ])
  assert.throws(
    () => parseSECSubmissions(traversal, channel, { since: "2026-09-25", until: "2026-10-04" }),
    /Invalid SEC filing identity/,
  )
  assert.throws(
    () =>
      parseSECSubmissions(
        payload(body.filings.recent.accessionNumber.map((_value, index) => ({
          filingDate: body.filings.recent.filingDate[index],
          form: body.filings.recent.form[index],
          accessionNumber: body.filings.recent.accessionNumber[index],
          primaryDocument: body.filings.recent.primaryDocument[index],
        })), "0000000000"),
        channel,
        { since: "2026-09-25", until: "2026-10-04" },
      ),
    /identity or bounded filing list/,
  )
})

test("SEC route can declare issuer-specific article profiles without changing the shared scanner", () => {
  const issuerRoute = {
    ...channel,
    api_profile: {
      ...channel.api_profile,
      company_filing_article_profile_id: "sec-amazon-company-filing-en-v1",
      filing_shell_article_profile_id: "sec-amazon-filing-shell-en-v1",
    },
  }
  assert.equal(
    validateSECRoute(issuerRoute).company_filing_article_profile_id,
    "sec-amazon-company-filing-en-v1",
  )
  assert.equal(
    validateSECRoute(issuerRoute).filing_shell_article_profile_id,
    "sec-amazon-filing-shell-en-v1",
  )
  assert.throws(
    () =>
      validateSECRoute({
        ...issuerRoute,
        api_profile: { ...issuerRoute.api_profile, filing_shell_article_profile_id: "../unsafe" },
      }),
    /Invalid SEC submissions route profile/,
  )
})

test("SEC filing shell checkpoints keep the full submissions index after index 9", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sec-scan-index-")))
  const rows = Array.from({ length: 11 }, (_, index) =>
    submission(
      "2026-10-02",
      "8-K",
      `0000000001-26-${String(index + 1).padStart(6, "0")}`,
      `release-${index + 1}.html`,
    ),
  )
  rows.push(submission("2026-09-01", "8-K", "0000000001-26-000099", "older.html"))
  const bytes = Buffer.from(JSON.stringify(payload(rows)))
  fs.writeFileSync(path.join(root, "submissions.json"), bytes)
  const stages = []
  const run = {
    stage: async (name, _input, action) => {
      assert.ok(!stages.includes(name), `duplicate checkpoint stage: ${name}`)
      stages.push(name)
      return action()
    },
  }
  const fetchPolicy = async (_root, _fetcher, url) => ({
    fetch_status: "captured",
    original_url: url,
    final_url: url,
    mime_type: url.includes("submissions/CIK") ? "application/json" : "text/html",
    body_path: "submissions.json",
    body_sha256: sha256(bytes),
    source_version_id: `source:${sha256(url)}`,
    observed_at: "2026-10-03T01:00:00.000Z",
  })
  const parse = async (_root, document) => ({
    status: "extracted",
    parse_id: `parse:${sha256(document.original_url)}`,
    title: "Tesla filing",
    blocks: [{ text: "Tesla filing announcement" }],
    links: [],
    dates: { published_at: "2026-10-02" },
    quality: { required_fields_present: true },
  })
  const channelWithBudget = {
    ...channel,
    api_profile: { ...channel.api_profile, max_details: 20 },
  }
  try {
    const result = await scanSECSubmissionsRoute(
      root,
      run,
      {},
      channelWithBudget,
      [
        {
          id: "sec-tesla-filing-shell-en-v1",
          url_pattern: "^https://www\\.sec\\.gov/Archives/edgar/data/1318605/",
          options: {},
        },
      ],
      { since: "2026-10-01", until: "2026-10-04" },
      { fetchPolicy, parse },
    )
    assert.equal(result.summary.status, "window_scanned", JSON.stringify(result.summary.details))
    assert.equal(stages.filter((name) => name.startsWith("filing-shell-") && !name.startsWith("filing-shell-parse-")).length, 11)
    assert.ok(stages.includes("filing-shell-10"))
    assert.ok(stages.includes("filing-shell-parse-10"))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
