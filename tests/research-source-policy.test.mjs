import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { SourceFetcher } from "../scripts/research/fetch.mjs"
import { checkRobots, ROBOTS_MAX_AGE_MS } from "../scripts/research/robots.mjs"
import {
  fetchWithPolicy,
  recheckDueSourcePolicies,
  recheckSourcePolicy,
} from "../scripts/research/source-policy.mjs"
import {
  sourceAvailability,
  sourceFailureRetry,
  retryAfterAt,
} from "../scripts/research/source-retry.mjs"
import {
  recordSourcePolicy,
  readSourcePolicyState,
  registerPolicyWatch,
  readPolicyWatch,
  reviewSourcePolicy,
  listSourcePolicyChecks,
  requestSourcePolicyRecheck,
} from "../scripts/research/source-policy-state.mjs"
import { RunState, readJSON, atomicWrite } from "../scripts/research/run-state.mjs"
import { sourceId, sha256 } from "../scripts/research/contracts.mjs"
import { storeParseArtifact } from "../scripts/research/parser.mjs"
import {
  rememberAccessExclusion,
  matchingAccessExclusion,
} from "../scripts/research/source-access.mjs"
import { main as policyCLI } from "../scripts/research-source-policy.mjs"
import { dailyRetryAssessment, dailyRetryQueue } from "../scripts/research/daily-scan.mjs"

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "website-policy-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  let now = Date.now()
  const calls = []
  const responses = {
    robots: { status: 200, body: "User-agent: *\nAllow: /\n" },
    article: { status: 200, body: "<h1>Public article</h1><p>Original body</p>" },
    terms: { status: 200, body: "Official collection conditions, version one" },
  }
  const url = "https://publisher.example/story"
  function fetcher(extra = {}) {
    const instance = new SourceFetcher(root, {
      attempts: 1,
      interval_ms: 0,
      policy_recheck_limit: 0,
      policy_now: () => now,
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      transport: async (target) => {
        calls.push(target.href)
        const response =
          target.pathname === "/robots.txt"
            ? responses.robots
            : target.pathname === "/terms"
              ? responses.terms
              : responses.article
        return {
          status: response.status,
          headers: {
            "content-type": target.pathname === "/robots.txt" ? "text/plain" : "text/html",
            ...(response.headers || {}),
          },
          body: Buffer.from(response.body),
        }
      },
      ...extra,
    })
    const nativeFetch = instance.fetch.bind(instance)
    // Advance the observation clock together with the policy clock in these
    // controlled responses; the native request/cache/hash path is unchanged.
    instance.fetch = async (...args) => ({
      ...(await nativeFetch(...args)),
      observed_at: new Date(now).toISOString(),
    })
    return instance
  }
  return {
    root,
    url,
    calls,
    responses,
    fetcher,
    now: () => now,
    advance: (ms) => {
      now += ms
    },
    set: (ms) => {
      now = ms
    },
  }
}

test("disabled maintenance never reads unrelated cold policy observations", async (t) => {
  const f = fixture(t)
  atomicWrite(f.root, "source-policy/index/" + "f".repeat(20) + ".json", { url: "https://unrelated.example/story", reference: { path: "missing-cold-payload" } })
  const report = await recheckDueSourcePolicies(f.root, f.fetcher(), { maxChecks: 0 })
  assert.equal(report.status, "disabled")
  assert.deepEqual(report.checks, [])
  assert.equal((await fetchWithPolicy(f.root, f.fetcher(), f.url)).fetch_status, "captured")
})

test("malformed robots HTML retains its exact failed policy evidence and never authorizes the article", async (t) => {
  const f = fixture(t)
  f.responses.robots.body = "<!DOCTYPE html><html><body>Website landing page</body></html>"
  const result = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(result.fetch_status, "blocked")
  assert.equal(result.request_performed, false)
  assert.match(result.error, /HTML page/)
  assert.ok(result.policy_failure.body_path)
  assert.equal(fs.readFileSync(path.join(f.root, result.policy_failure.body_path), "utf8"), f.responses.robots.body)
  assert.ok(f.calls.every((url) => url.endsWith("/robots.txt")))
})

test("a missing Drive policy payload propagates as storage recovery rather than a website failure", async (t) => {
  const f = fixture(t), fetcher = f.fetcher()
  fetcher.fetch = async () => { throw Object.assign(Error("Exact Drive payload required"), { code: "STORAGE_PENDING" }) }
  await assert.rejects(fetchWithPolicy(f.root, fetcher, f.url), { code: "STORAGE_PENDING" })
  assert.equal(readSourcePolicyState(f.root, f.url), null)
})

test("policy maintenance lists metadata without hydrating an unrelated available article", async (t) => {
  const f = fixture(t), first = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  fs.unlinkSync(path.join(f.root, first.body_path))
  const next = await fetchWithPolicy(f.root, f.fetcher({ policy_recheck_limit: 1 }), "https://publisher.example/new-story")
  assert.equal(next.fetch_status, "captured")
  assert.throws(() => readSourcePolicyState(f.root, f.url), /ENOENT/)
  assert.ok(listSourcePolicyChecks(f.root, { metadataOnly: true }).some((row) => row.url === f.url))
})

test("availability separates temporary responses, confirmed restrictions and unknown failures", () => {
  for (const status of [408, 429, 500, 502, 503, 504])
    assert.equal(
      sourceAvailability({ http_status: status, fetch_status: "failed" }).status,
      "temporary_unavailable",
    )
  for (const status of [400, 401, 403, 404, 410])
    assert.equal(
      sourceAvailability({ http_status: status, fetch_status: "blocked" }).status,
      "undetermined",
    )
  assert.equal(
    sourceAvailability({ fetch_status: "failed", error_code: "EAI_AGAIN" }).status,
    "temporary_unavailable",
  )
  const failedPolicy = {
    fetch_status: "blocked",
    policy_status: "failed",
    policy_failure: { http_status: 503, fetch_status: "failed" },
  }
  assert.equal(sourceAvailability(failedPolicy).status, "temporary_unavailable")
  assert.equal(sourceFailureRetry(failedPolicy).state, "retryable")
  assert.equal(
    sourceAvailability({ policy_status: "denied", policy: { allowed: false } }).reason,
    "robots_disallow",
  )
  assert.equal(
    sourceAvailability({ fetch_status: "captured" }, { status: "failed", quality: {} }).status,
    "undetermined",
  )
})

test("repeated failures never imply permanence and durable intervals grow within their cap", async (t) => {
  const f = fixture(t)
  for (let count = 1; count <= 18; count++) {
    const document = {
      original_url: f.url,
      source_id: sourceId(f.url),
      observed_at: new Date(f.now()).toISOString(),
      fetch_status: "failed",
      http_status: 503,
    }
    const state = await recordSourcePolicy(f.root, f.url, document, { now: f.now() })
    assert.equal(state.assessment.status, "temporary_unavailable")
    assert.equal(state.assessment.permanence, "undetermined")
    assert.equal(state.assessment.consecutive_failures, count)
    assert.ok(Date.parse(state.assessment.next_check_at) - f.now() <= ROBOTS_MAX_AGE_MS)
    f.set(Date.parse(state.assessment.next_check_at))
  }
  const old = readSourcePolicyState(f.root, f.url)
  assert.deepEqual(readSourcePolicyState(f.root, f.url).reference, old.reference)
  const snapshot = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/research-source-policy.mjs", "list", "--root", f.root],
      { encoding: "utf8" },
    ),
  )
  assert.equal(snapshot.checks[0].consecutive_failures, 18)
  assert.equal(snapshot.checks[0].status, "temporary_unavailable")
})

test("an unknown 403 pauses requests, cannot become a policy restriction by review, and can recover", async (t) => {
  const f = fixture(t)
  f.responses.article.status = 403
  const first = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(first.availability.status, "undetermined")
  const before = f.calls.length
  const deferred = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(deferred.request_performed, false)
  assert.equal(deferred.observed_at, first.observed_at)
  assert.equal(f.calls.length, before)
  await assert.rejects(
    reviewSourcePolicy(f.root, f.url, {
      expected: first.availability.observation.sha256,
      decision: "restrict",
      reviewer: "operator",
      reason: "403 repeated",
      now: f.now(),
    }),
    /explicit robots prohibition/,
  )
  f.responses.article.status = 200
  f.advance(ROBOTS_MAX_AGE_MS + 1)
  const recovered = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(recovered.availability.status, "available")
  assert.equal(recovered.availability.consecutive_failures, 0)
})

test("robots tightening blocks content; relaxation needs a fresh exact review before resumption", async (t) => {
  const f = fixture(t)
  await fetchWithPolicy(f.root, f.fetcher(), f.url)
  f.responses.robots.body = "User-agent: *\nDisallow: /story\n"
  f.advance(1000)
  const denied = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  const state = readSourcePolicyState(f.root, f.url)
  assert.equal(denied.policy_status, "denied")
  assert.equal(state.policy_change.baseline_known, true)
  assert.equal(state.policy_change.content_changed, true)
  assert.equal(state.policy_change.scope_changed, true)
  assert.equal(f.calls.filter((url) => url === f.url).length, 1)
  f.responses.robots.body = "User-agent: *\nAllow: /\n"
  f.advance(7 * ROBOTS_MAX_AGE_MS + 1)
  const held = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(held.request_performed, false)
  assert.equal(held.availability.requires_review, true)
  assert.equal(held.availability.reason, "robots_permission_relaxed_requires_review")
  assert.equal(f.calls.filter((url) => url === f.url).length, 1)
  await assert.rejects(
    reviewSourcePolicy(f.root, f.url, {
      expected: state.reference.sha256,
      decision: "allow",
      reviewer: "operator",
      reason: "Fresh policy now allows this exact path",
      now: f.now(),
    }),
    /observation changed/,
  )
  const latest = readSourcePolicyState(f.root, f.url)
  await reviewSourcePolicy(f.root, f.url, {
    expected: latest.reference.sha256,
    decision: "allow",
    reviewer: "operator",
    reason: "Fresh official policy checked for this path",
    now: f.now(),
  })
  const resumed = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(resumed.fetch_status, "captured")
  assert.equal(resumed.availability.status, "available")
  assert.equal(fs.existsSync(path.join(f.root, latest.reference.path)), true)
})

test("unrelated robots edits retain a changed-version record without pausing an allowed path", async (t) => {
  const f = fixture(t)
  await fetchWithPolicy(f.root, f.fetcher(), f.url)
  f.responses.robots.body += "Disallow: /unrelated\n"
  f.advance(1000)
  const result = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  const state = readSourcePolicyState(f.root, f.url)
  assert.equal(result.availability.status, "available")
  assert.equal(state.policy_change.content_changed, true)
  assert.equal(state.policy_change.scope_changed, false)
})

test("a long-lived fetcher refreshes robots at expiry, and HTML is not an empty allow policy", async (t) => {
  const f = fixture(t)
  const fetcher = f.fetcher({ robots_cache_ttl_ms: 1000 })
  await checkRobots(f.root, fetcher, f.url)
  f.advance(999)
  f.responses.robots.body = "User-agent: *\nDisallow: /story\n"
  assert.equal((await checkRobots(f.root, fetcher, f.url)).allowed, true)
  f.advance(1)
  assert.equal((await checkRobots(f.root, fetcher, f.url)).allowed, false)
  assert.equal(f.calls.length, 2)
  await assert.rejects(
    checkRobots(f.root, f.fetcher({ robots_cache_ttl_ms: ROBOTS_MAX_AGE_MS + 1 }), f.url),
    /within 24 hours/,
  )
  f.responses.robots.body = "<!doctype html><html>Sign in</html>"
  const failed = await fetchWithPolicy(f.root, f.fetcher(), "https://publisher.example/other")
  assert.equal(failed.policy_status, "failed")
  assert.equal(failed.availability.status, "undetermined")
  assert.equal(f.calls.filter((url) => url.endsWith("/other")).length, 0)
})

test("Retry-After persists across URLs and processes without an early retry or a new observation", async (t) => {
  const f = fixture(t)
  f.responses.article = { status: 429, headers: { "retry-after": "3600" }, body: "Rate limit" }
  const result = await fetchWithPolicy(f.root, f.fetcher({ attempts: 3 }), f.url)
  assert.equal(result.availability.status, "temporary_unavailable")
  assert.ok(Date.parse(result.availability.next_check_at) >= f.now() + 3600000)
  assert.equal(f.calls.length, 2)
  const second = await fetchWithPolicy(f.root, f.fetcher(), "https://publisher.example/other")
  assert.equal(second.availability.status, "temporary_unavailable")
  assert.equal(f.calls.length, 2)
  const nativeModule = new URL("../scripts/research/fetch.mjs", import.meta.url).href
  const child = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {SourceFetcher} from ${JSON.stringify(nativeModule)}; const f=new SourceFetcher(process.argv[1],{attempts:1,interval_ms:0,resolve:async()=>[{address:'1.1.1.1',family:4}],transport:async()=>{throw Error('cooldown reached transport')}}); console.log(JSON.stringify(await f.fetch('https://publisher.example/third')));`,
        f.root,
      ],
      { encoding: "utf8" },
    ),
  )
  assert.equal(child.fetch_status, "rate_limited")
  assert.equal(child.error_code, "SOURCE_HOST_COOLDOWN")
  assert.equal(child.request_performed, false)
  assert.equal(listSourcePolicyChecks(f.root, { now: f.now(), dueOnly: true }).length, 0)
  const probe = await fetchWithPolicy(f.root, f.fetcher(), f.url, { policy_probe: true })
  assert.equal(probe.request_performed, false)
  assert.equal(f.calls.length, 2)
  const next = new Date(f.now() + 5000).toUTCString()
  assert.ok(retryAfterAt(next, f.now()) > f.now())
  assert.equal(retryAfterAt("bogus", f.now()), null)
})

test("watched terms baseline, 304, edits and explicit restrictions all use exact versions", async (t) => {
  const f = fixture(t)
  await registerPolicyWatch(
    f.root,
    f.url,
    [{ url: "https://publisher.example/terms", kind: "terms" }],
    { now: f.now() },
  )
  const first = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(first.request_performed, false)
  assert.equal(first.availability.requires_review, true)
  assert.equal(f.calls.includes(f.url), false)
  await reviewSourcePolicy(f.root, f.url, {
    expected: first.availability.observation.sha256,
    decision: "allow",
    reviewer: "operator",
    reason: "Official conditions explicitly reviewed",
    now: f.now(),
  })
  assert.equal((await fetchWithPolicy(f.root, f.fetcher(), f.url)).availability.status, "available")
  f.responses.terms.status = 304
  f.advance(ROBOTS_MAX_AGE_MS + 1)
  assert.equal((await fetchWithPolicy(f.root, f.fetcher(), f.url)).availability.status, "available")
  const before = readPolicyWatch(f.root, f.url)
  assert.equal(before.changed, false)
  f.responses.terms.status = 200
  f.responses.terms.body = "Official collection conditions changed to version two"
  f.advance(ROBOTS_MAX_AGE_MS + 1)
  const count = f.calls.filter((url) => url === f.url).length
  const changed = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(changed.availability.requires_review, true)
  assert.equal(f.calls.filter((url) => url === f.url).length, count)
  assert.notEqual(
    readPolicyWatch(f.root, f.url).documents[0].document.source_version_id,
    before.documents[0].document.source_version_id,
  )
  await reviewSourcePolicy(f.root, f.url, {
    expected: changed.availability.observation.sha256,
    decision: "restrict",
    reviewer: "operator",
    reason: "New official conditions prohibit this collection scope",
    now: f.now(),
  })
  f.advance(7 * ROBOTS_MAX_AGE_MS + 1)
  const stillRestricted = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(stillRestricted.availability.status, "policy_restricted")
  assert.equal(f.calls.filter((url) => url === f.url).length, count)
  assert.equal(readPolicyWatch(f.root, f.url).restriction_active, true)
  await registerPolicyWatch(
    f.root,
    f.url,
    [{ url: "https://publisher.example/terms", kind: "terms" }],
    { now: f.now() },
  )
  const reregistered = await fetchWithPolicy(f.root, f.fetcher(), f.url, {
    policy_probe: true,
    policy_only: true,
  })
  assert.equal(reregistered.availability.status, "policy_restricted")
  assert.equal(readPolicyWatch(f.root, f.url).restriction_active, true)
})

test("policy fetch failure retains the last verified text and cannot authorize resumption", async (t) => {
  const f = fixture(t)
  await registerPolicyWatch(
    f.root,
    f.url,
    [{ url: "https://publisher.example/terms", kind: "terms" }],
    { now: f.now() },
  )
  const first = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  await reviewSourcePolicy(f.root, f.url, {
    expected: first.availability.observation.sha256,
    decision: "allow",
    reviewer: "operator",
    reason: "Reviewed public conditions",
    now: f.now(),
  })
  const old = readPolicyWatch(f.root, f.url).documents[0].document
  f.responses.terms.status = 503
  f.advance(ROBOTS_MAX_AGE_MS + 1)
  const failed = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(failed.availability.status, "temporary_unavailable")
  assert.equal(
    readPolicyWatch(f.root, f.url).documents[0].document.source_version_id,
    old.source_version_id,
  )
  await assert.rejects(
    reviewSourcePolicy(f.root, f.url, {
      expected: failed.availability.observation.sha256,
      decision: "allow",
      reviewer: "operator",
      reason: "Cannot use old terms as a fresh check",
      now: f.now(),
    }),
    /fresh verified policy documents/,
  )
})

test("due maintenance is bounded, survives a new fetcher and never activates a relaxed route", async (t) => {
  const f = fixture(t)
  f.responses.robots.body = "User-agent: *\nDisallow: /\n"
  await fetchWithPolicy(f.root, f.fetcher(), f.url)
  await fetchWithPolicy(f.root, f.fetcher(), "https://publisher.example/second")
  f.advance(7 * ROBOTS_MAX_AGE_MS + 1)
  f.responses.robots.body = "User-agent: *\nAllow: /\n"
  const report = await recheckDueSourcePolicies(f.root, f.fetcher(), { maxChecks: 1 })
  assert.equal(report.checks.length, 1)
  assert.equal(report.remaining, 1)
  assert.equal(report.checks[0].status, "undetermined")
  assert.equal(readSourcePolicyState(f.root, report.checks[0].url).assessment.requires_review, true)
  const auto = f.fetcher({ policy_recheck_limit: 1 })
  await fetchWithPolicy(f.root, auto, "https://publisher.example/new-story")
  assert.equal(auto.policyMaintenanceReport.checks.length, 1)
  assert.equal(f.calls.filter((url) => url === f.url || url.endsWith("/second")).length, 0)
})

test("checkpoint replay preserves old observations; policy state detects receipt and body tampering", async (t) => {
  const f = fixture(t)
  const run = new RunState(f.root, "collection-v1", { url: f.url })
  const first = await run.stage("source", { url: f.url }, () =>
    fetchWithPolicy(f.root, f.fetcher(), f.url),
  )
  const count = f.calls.length
  const restarted = new RunState(f.root, "collection-v1", { url: f.url })
  const cached = await restarted.stage("source", { url: f.url }, () =>
    assert.fail("checkpoint replay requested the website"),
  )
  assert.deepEqual(cached, first)
  assert.equal(f.calls.length, count)
  const state = readSourcePolicyState(f.root, f.url)
  fs.writeFileSync(
    path.join(f.root, state.last_robots_policy.policy_document.body_path),
    "tampered",
  )
  assert.throws(() => readSourcePolicyState(f.root, f.url), /body hash mismatch/)
  fs.writeFileSync(path.join(f.root, state.reference.path), "{}")
  assert.throws(() => readSourcePolicyState(f.root, f.url), /receipt changed/)
})

test("parallel state updates retain a single history, and duplicate observations do not increase failures", async (t) => {
  const f = fixture(t)
  const document = {
    original_url: f.url,
    fetch_status: "failed",
    http_status: 503,
    observed_at: new Date(f.now()).toISOString(),
  }
  const [a, b] = await Promise.all([
    recordSourcePolicy(f.root, f.url, document, { now: f.now() }),
    recordSourcePolicy(f.root, f.url, document, { now: f.now() }),
  ])
  assert.equal(a.reference.sha256, b.reference.sha256)
  assert.equal(readSourcePolicyState(f.root, f.url).assessment.consecutive_failures, 1)
  const listed = await policyCLI(["list", "--root", f.root])
  assert.equal(listed.status, "read_only")
  assert.equal(listed.checks.length, 1)
  const before = readSourcePolicyState(f.root, f.url)
  const old = await recordSourcePolicy(
    f.root,
    f.url,
    { ...document, observed_at: new Date(f.now() - 1000).toISOString(), http_status: 403 },
    { now: f.now() },
  )
  assert.equal(old.reference.sha256, before.reference.sha256)
  await assert.rejects(
    policyCLI([
      "watch",
      "--root",
      f.root,
      "--url",
      f.url,
      "--document",
      "https://publisher.example/terms",
    ]),
    /--apply/,
  )
  await assert.rejects(
    registerPolicyWatch(f.root, f.url, [{ url: "https://foreign.example/terms", kind: "terms" }]),
    /outside/,
  )
})

test("daily retries wait for a durable check time without consuming the retry allowance", async (t) => {
  const f = fixture(t)
  const id = "daily-window_a1"
  const document = {
    original_url: f.url,
    source_id: sourceId(f.url),
    fetch_status: "blocked",
    policy_status: "failed",
    policy_failure: { http_status: 503 },
    availability: {
      status: "temporary_unavailable",
      reason: "temporary_policy_fetch_failure",
      next_check_at: new Date(Date.now() + 3600000).toISOString(),
    },
  }
  const run = new RunState(f.root, id, {})
  await run.stage("listing", {}, () => document)
  const window = { channel_id: "publisher", since: "2026-10-01", until_exclusive: "2026-10-02" }
  const receipt = {
    ...window,
    attempt_id: id,
    status: "blocked",
    scan_evidence: { list_scan_run: id },
  }
  const stored = { summary: { ...window, window, status: "blocked" }, documents: [], parses: [] }
  const options = { loadStored: () => stored }
  const assessment = dailyRetryAssessment(f.root, receipt, options)
  assert.equal(assessment.state, "retryable")
  assert.equal(assessment.next_check_at, document.availability.next_check_at)
  const queue = dailyRetryQueue(f.root, { windows: [window] }, [receipt], null, options)
  assert.equal(queue[0].state, "awaiting_retry_time")
  assert.equal(queue[0].attempts, 1)
  assert.equal(queue[0].next_check_at, document.availability.next_check_at)
  assert.equal(readJSON(f.root, `runs/${id}/state.json`).run_id, id)
})

test("redirect policy revalidation holds a relaxed destination until its exact review", async (t) => {
  const f = fixture(t)
  let destinationDenied = true
  const destination = "https://destination.example/private/story"
  const make = () =>
    f.fetcher({
      transport: async (url) => {
        f.calls.push(url.href)
        if (url.pathname === "/robots.txt")
          return {
            status: 200,
            headers: { "content-type": "text/plain" },
            body: Buffer.from(
              url.hostname === "destination.example" && destinationDenied
                ? "User-agent: *\nDisallow: /private\n"
                : "User-agent: *\nAllow: /\n",
            ),
          }
        if (url.hostname === "publisher.example")
          return { status: 302, headers: { location: destination }, body: Buffer.alloc(0) }
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          body: Buffer.from("Public destination article"),
        }
      },
    })
  const options = { allowed_hosts: ["publisher.example", "destination.example"] }
  const denied = await fetchWithPolicy(f.root, make(), f.url, options)
  assert.equal(denied.policy_status, "denied")
  assert.equal(readSourcePolicyState(f.root, destination).assessment.status, "policy_restricted")
  destinationDenied = false
  f.advance(7 * ROBOTS_MAX_AGE_MS + 1)
  const held = await fetchWithPolicy(f.root, make(), f.url, options)
  assert.equal(held.fetch_status, "blocked")
  const state = readSourcePolicyState(f.root, destination)
  assert.equal(state.assessment.requires_review, true)
  assert.equal(f.calls.includes(destination), false)
  await reviewSourcePolicy(f.root, destination, {
    expected: state.reference.sha256,
    decision: "allow",
    reviewer: "operator",
    reason: "Exact redirect destination permission revalidated",
    now: f.now(),
  })
  const resumed = await fetchWithPolicy(f.root, make(), f.url, { ...options, policy_probe: true })
  assert.equal(resumed.fetch_status, "captured")
  assert.equal(resumed.final_url, destination)
  assert.equal(f.calls.filter((url) => url === destination).length, 1)
})

test("member recheck validates a native public parse and exact CLI review before reopening", async (t) => {
  const f = fixture(t)
  const oldPython = process.env.RESEARCH_PYTHON
  process.env.RESEARCH_PYTHON =
    oldPython || path.resolve(".local/research/local-ai/runtime/venv/bin/python")
  t.after(() => {
    if (oldPython === undefined) delete process.env.RESEARCH_PYTHON
    else process.env.RESEARCH_PYTHON = oldPython
  })
  const title = "Robot actuator test"
  const timestamp = "2026-10-01T12:30:00+00:00"
  const header = `<h1 class="wp-block-post-title">${title}</h1><time datetime="${timestamp}">${timestamp}</time>`
  f.responses.article.body = "<html><body>" + header + "<p>Members only</p></body></html>"
  const document = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  const parsed = {
    schema_version: "source-parse/v1",
    source_id: document.source_id,
    source_version_id: document.source_version_id,
    parse_id: sha256("member-header"),
    status: "blocked",
    title,
    title_profile_status: "matched",
    blocks: [],
    dates: {
      published_at: "2026-10-01",
      access_scope: "metadata-only",
      profile_status: "matched",
      basis: { dom_path: "/html/body/time", text: timestamp },
      observed_at: document.observed_at,
    },
    quality: { reason: "authentication-page", required_fields_present: false },
  }
  storeParseArtifact(f.root, parsed)
  const channel = { channel_id: "publisher", access_policy: "public-only" }
  const link = { url: f.url, text: title, published_at: parsed.dates.published_at }
  await rememberAccessExclusion(f.root, channel, link, document, parsed, "member-v1")
  assert.ok(matchingAccessExclusion(f.root, channel, link))
  const profile = JSON.parse(
    fs.readFileSync("data/research-acquisition.json"),
  ).article_profiles.find((item) => item.id === "techcrunch-article-en-v1")
  atomicWrite(f.root, "data/research-acquisition.json", {
    article_profiles: [{ ...profile, url_pattern: "^https://publisher\\.example/story$" }],
  })
  f.responses.article.body =
    "<html><body>" +
    header +
    '<div class="entry-content wp-block-post-content"><p>The actuator test documents the original control method and the publicly released test results.</p></div></body></html>'
  f.set(Date.now())
  await recheckSourcePolicy(f.root, f.fetcher(), f.url, { repo: f.root })
  const state = readSourcePolicyState(f.root, f.url)
  assert.equal(state.parsed.status, "extracted")
  assert.ok(state.parsed.blocks.length)
  assert.equal(
    state.public_access_restricted,
    false,
    JSON.stringify({
      old: state.access_evidence?.parsed?.dates,
      current: state.parsed.dates,
      title: state.parsed.title,
      reason: state.assessment.reason,
    }),
  )
  assert.equal(state.assessment.requires_review, true)
  assert.ok(matchingAccessExclusion(f.root, channel, link))
  const reviewed = await policyCLI([
    "review",
    "--root",
    f.root,
    "--url",
    f.url,
    "--expected",
    state.reference.sha256,
    "--decision",
    "allow",
    "--reviewer",
    "operator",
    "--reason",
    "Fresh public article and official policy verified",
    "--apply",
  ])
  assert.equal(reviewed.status, "reviewed")
  assert.equal(reviewed.reference.sha256, readSourcePolicyState(f.root, f.url).reference.sha256)
  assert.equal(matchingAccessExclusion(f.root, channel, link), null)
  await rememberAccessExclusion(f.root, channel, link, document, parsed, "frozen-member-replay")
  assert.equal(matchingAccessExclusion(f.root, channel, link), null)
  assert.equal(readSourcePolicyState(f.root, f.url).assessment.status, "available")
  assert.equal(readSourcePolicyState(f.root, f.url).investigation_pending, true)
  await rememberAccessExclusion(
    f.root,
    channel,
    link,
    state.document,
    state.parsed,
    "native-public-recovery",
  )
  const completed = readSourcePolicyState(f.root, f.url)
  assert.equal(completed.assessment.status, "available")
  assert.equal(completed.investigation_pending, false)
  assert.equal(completed.recheck_requested, false)
  assert.equal(fs.existsSync(path.join(f.root, document.body_path)), true)
})

test("an investigation request cannot bypass the review of a relaxed robots policy", async (t) => {
  const f = fixture(t)
  f.responses.robots.body = "User-agent: *\nDisallow: /story\n"
  await fetchWithPolicy(f.root, f.fetcher(), f.url)
  await requestSourcePolicyRecheck(f.root, f.url, { now: f.now() })
  f.responses.robots.body = "User-agent: *\nAllow: /\n"
  f.advance(1000)
  const first = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(first.availability.policy_review_required, true)
  assert.equal(first.request_performed, false)
  const second = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(second.request_performed, false)
  assert.equal(f.calls.includes(f.url), false)
})

test("a failed explicit investigation consumes its one-shot bypass and resumes durable backoff", async (t) => {
  const f = fixture(t)
  f.responses.article.status = 503
  await fetchWithPolicy(f.root, f.fetcher(), f.url)
  await requestSourcePolicyRecheck(f.root, f.url, { now: f.now() })
  f.advance(1000)
  await fetchWithPolicy(f.root, f.fetcher(), f.url)
  const state = readSourcePolicyState(f.root, f.url)
  assert.equal(state.recheck_requested, false)
  assert.equal(state.investigation_pending, true)
  assert.equal(state.assessment.status, "temporary_unavailable")
  assert.ok(Date.parse(state.assessment.next_check_at) > f.now())
  const count = f.calls.length
  const held = await fetchWithPolicy(f.root, f.fetcher(), f.url)
  assert.equal(held.request_performed, false)
  assert.equal(f.calls.length, count)
})

test("a due read-only POST recheck preserves the original method and URL-bound form", async (t) => {
  const f = fixture(t)
  const url = "https://publisher.example/query?page=1"
  let status = 503
  const methods = []
  const make = () =>
    f.fetcher({
      transport: async (target, _addresses, _headers, _budget, request) => {
        f.calls.push(target.href)
        if (target.pathname === "/robots.txt")
          return {
            status: 200,
            headers: { "content-type": "text/plain" },
            body: Buffer.from(f.responses.robots.body),
          }
        methods.push(request)
        return {
          status,
          headers: { "content-type": "application/json" },
          body: Buffer.from('{"items":[]}'),
        }
      },
    })
  const failed = await fetchWithPolicy(f.root, make(), url, { method: "POST", form: "page=1" })
  const state = readSourcePolicyState(f.root, url)
  assert.equal(failed.availability.status, "temporary_unavailable")
  assert.equal(state.request.method, "POST")
  assert.equal(state.request.form, "page=1")
  status = 200
  f.set(Date.parse(state.assessment.next_check_at))
  const report = await recheckSourcePolicy(f.root, make(), url)
  assert.equal(report.status, "available")
  assert.deepEqual(methods, [
    { method: "POST", body: "page=1" },
    { method: "POST", body: "page=1" },
  ])
})
