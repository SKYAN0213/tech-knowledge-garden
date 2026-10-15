import test from "node:test"
import assert from "node:assert/strict"
import { validateRouteDispositions } from "../scripts/research/source-route-disposition.mjs"
import { discoverChannel } from "../scripts/research/discovery.mjs"
import { validateDailyRoutes } from "../scripts/research/daily-plan.mjs"

const row = { channel_id: "source", url: "https://publisher.example/", role: "entrypoint", mode: "discovery", reason: "Public discovery entry" }
const route = { ...row, collection_mode: "discovery", method: "html-list", listing_profile: { pagination: "single-page" } }
const audit = { routes: [{ ...row, status: "blocked", document: { policy_status: "failed" } }] }

test("temporary failures cannot be converted into permanent exclusions", () => {
  assert.deepEqual(validateRouteDispositions([row], audit, [route], new Set()), [row])
  assert.throws(() => validateRouteDispositions([{ ...row, mode: "excluded", reason_code: "policy_denied" }], audit, [route], new Set()), /failed robots request/)
  assert.throws(() => validateRouteDispositions([{ ...row, mode: "excluded", reason_code: "timeout" }], audit, [route], new Set()), /confirmed policy/)
  assert.throws(() => validateRouteDispositions([row], audit, [route], new Set(["source"])), /Disable an active/)
  assert.throws(() => validateRouteDispositions([row, row], audit, [route], new Set()), /exactly one/)
})

test("excluded routes never request network and discovery routes cannot enter daily collection", async () => {
  const result = await discoverChannel("unused", { fetch: () => { throw Error("no request allowed") } }, { ...route, collection_mode: "excluded" })
  assert.equal(result.status, "collection_excluded")
  assert.deepEqual(result.candidates, [])
  const config = { schema: "research-daily-routes/v1", lookback_days: 7, max_window_days: 7, routes: [{ channel_id: "source", enabled: true, baseline_run: "baseline" }] }
  assert.throws(() => validateDailyRoutes(config, [route]), /discovery-only or excluded/)
  assert.throws(() => validateDailyRoutes(config, [{ ...route, collection_mode: "excluded" }]), /discovery-only or excluded/)
})
