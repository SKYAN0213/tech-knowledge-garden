import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import {
  compareProcessingArtifacts,
  benchmarkArticleProcessing,
} from "../scripts/research/operations-benchmark.mjs"
import { fixture } from "./fixtures/research-event-fixtures.mjs"
import { atomicCreate } from "../scripts/research/run-state.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { recordedProcessingProvider } from "../scripts/research/processing-replay.mjs"
import {
  copyFixtureTree,
  materializeProcessingCode,
} from "../scripts/research/processing-fixture.mjs"

function output() {
  return {
    artifacts: Array.from({ length: 32 }, (_, i) => ({
      candidate_id: "candidate-" + i,
      writer_run: "writer-" + i,
      action: i ? "write" : "reuse",
      claims: [
        {
          claim_id: "claim-" + i,
          statement: "100 ms under the original condition",
          evidence: [{ source_id: "source-" + i, quote: "exact source" }],
        },
      ],
      draft: {
        draft: { text: "reader prose", claim_ids: ["claim-" + i] },
        completeness_context: { review: { important: true } },
      },
      editorial: { status: "approved", source_read: true, coverage: ["claim-" + i] },
      approval: {
        event_id: "event-" + i,
        record: "reader prose",
        article_review: { status: "approved" },
      },
    })),
  }
}

test("replay maps only recorded positive coverage into explicit preserved decisions", async (t) => {
  const f = fixture(t),
    run = "replay-coverage",
    instance = { root: f.root, repo: f.repo, live: false, imported_replay_oracle: true },
    telemetry = { requests: [], provider_ms: 0 }
  const directory = path.join(f.root, "runs", run)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, "draft.json"), JSON.stringify({ draft_id: "draft-a" }))
  const original = {
    claim_id: "claim-a",
    reason: "The exact cited fact was previously reviewed",
    meaning_checked: true,
    preserved_aspects: ["fact"],
    locations: [{ location: "lead[0]", text_sha256: "a".repeat(64) }],
  }
  const oracle = {
    exchanges: [],
    articles: [{
      writer_run: run,
      fact_review: { reviewer: "recorded-reviewer", reviewed_at: "2026-10-26" },
      final_draft: { draft_id: "draft-a" },
      editorial_review: { status: "approved", draft_id: "draft-a", reviewer: "recorded-reviewer", reviewed_at: "2026-10-26" },
      coverage_review: { reviewed_at: "2026-10-26", coverage: [original] },
      corrections: [], editorial_attempts: [], coverage_attempts: [],
    }],
  }
  const provider = recordedProcessingProvider(instance, oracle, telemetry)
  const request = {
    messages: [{ role: "system", content: "fixture" }, { role: "user", content: JSON.stringify({ task: "combined_review", kind: "editorial", run_id: run, input_sha256: "b".repeat(64), source_manifest: { sha256: "c".repeat(64) }, part: 1, assigned_claim_ids: ["claim-a"] }) }],
    schema: { type: "object" },
  }
  const result = await provider.structured(request)
  assert.deepEqual(result.output.coverage, [original])
  assert.deepEqual(result.output.coverage_decisions, [{ claim_id: "claim-a", decision: "preserved", reason: null }])
  assert.equal(result.output.editorial_review, null)
  assert.equal(telemetry.requests[0].model_execution, false)
  oracle.articles[0].coverage_review.coverage[0].meaning_checked = false
  await assert.rejects(provider.structured(request), /explicit historical coverage judgment/)
  assert.throws(() => recordedProcessingProvider({ ...instance, live: true }, oracle, telemetry), /forbidden/)
})

test("fixture tree copies exact files with independent writes and refuses an existing destination", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(path.join(source, "nested"), { recursive: true })
  fs.writeFileSync(path.join(source, ".hidden"), "source bytes\n")
  fs.writeFileSync(path.join(source, "nested", "document.json"), '{"value":42}\n')
  copyFixtureTree(source, destination)
  assert.equal(fs.readFileSync(path.join(destination, ".hidden"), "utf8"), "source bytes\n")
  fs.writeFileSync(path.join(destination, "nested", "document.json"), "changed copy\n")
  assert.equal(
    fs.readFileSync(path.join(source, "nested", "document.json"), "utf8"),
    '{"value":42}\n',
  )
  assert.throws(() => copyFixtureTree(source, destination), /fresh destination/)
})

test("fixture tree rejects source symlinks before creating a destination", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, "document"), "original")
  fs.symlinkSync("document", path.join(source, "alias"))
  assert.throws(() => copyFixtureTree(source, destination), /symlinks/)
  assert.equal(fs.existsSync(destination), false)
  assert.equal(fs.readFileSync(path.join(source, "document"), "utf8"), "original")
})

test("fixture tree refuses a broken destination symlink", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, "document"), "original")
  fs.symlinkSync("absent-target", destination)
  assert.throws(() => copyFixtureTree(source, destination), /fresh destination/)
  assert.equal(fs.lstatSync(destination).isSymbolicLink(), true)
  assert.equal(fs.existsSync(path.join(f.root, "absent-target")), false)
})

test("fixture tree preserves the requested free-space reserve before a possible full copy", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "fixture-source"),
    destination = path.join(f.root, "fixture-copy")
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, "document"), "original")
  assert.throws(
    () => copyFixtureTree(source, destination, { reserveBytes: Number.MAX_SAFE_INTEGER }),
    /insufficient.*space/i,
  )
  assert.equal(fs.existsSync(destination), false)
  assert.equal(fs.readFileSync(path.join(source, "document"), "utf8"), "original")
})
test("processing comparison detects claim, source, prose, importance, approval, action and duplicate regressions", () => {
  const a = output()
  assert.equal(compareProcessingArtifacts(a, structuredClone(a)).equivalent, true)
  const mutations = [
    (b) => {
      b.artifacts[0].draft.provenance = { changed: true }
    },
    (b) => {
      b.artifacts[0].claims[0].statement = "100 seconds"
    },
    (b) => {
      b.artifacts[0].claims[0].evidence[0].quote = "different"
    },
    (b) => {
      b.artifacts[0].draft.draft.text = "changed"
    },
    (b) => {
      b.artifacts[0].draft.completeness_context.review.important = false
    },
    (b) => {
      b.artifacts[0].editorial.coverage = []
    },
    (b) => {
      b.artifacts[0].approval.article_review.status = "pending"
    },
    (b) => {
      b.artifacts[0].action = "write"
    },
  ]
  for (const mutate of mutations) {
    const b = structuredClone(a)
    mutate(b)
    assert.equal(compareProcessingArtifacts(a, b).equivalent, false)
  }
  const duplicate = structuredClone(a)
  duplicate.artifacts[1] = duplicate.artifacts[0]
  assert.throws(() => compareProcessingArtifacts(a, duplicate), /32 distinct/)
})

test("isolated cases contain exact executable bytes at their native cwd and reject configuration drift", (t) => {
  const f = fixture(t),
    source = path.join(f.root, "frozen-code"),
    destination = path.join(f.root, "private-case")
  fs.mkdirSync(path.join(source, "scripts/research"), { recursive: true })
  fs.mkdirSync(path.join(source, "data"))
  fs.mkdirSync(destination)
  fs.writeFileSync(
    path.join(source, "scripts/research/draft-checkpoint.mjs"),
    "export const frozen = true\n",
  )
  fs.writeFileSync(path.join(source, "data/research-model-policy-codex.json"), '{"fixed":true}')
  assert.equal(
    fs.existsSync(path.join(destination, "scripts/research/draft-checkpoint.mjs")),
    false,
  )
  const receipt = materializeProcessingCode(source, destination)
  assert.equal(receipt.files.length, 2)
  assert.equal(receipt.installed_production_runtime, false)
  assert.deepEqual(
    fs.readFileSync(path.join(destination, "scripts/research/draft-checkpoint.mjs")),
    fs.readFileSync(path.join(source, "scripts/research/draft-checkpoint.mjs")),
  )
  const config = path.join(destination, "data/research-model-policy-codex.json")
  fs.chmodSync(config, 0o644)
  fs.writeFileSync(config, '{"fixed":false}')
  assert.throws(() => materializeProcessingCode(source, destination), /differs from frozen code/)
  assert.equal(fs.readFileSync(config, "utf8"), '{"fixed":false}')
})
test("benchmark rejects a changed manifest before creating cases or executing a provider", async (t) => {
  const f = fixture(t),
    r = atomicCreate(f.root, "benchmark.json", {
      schema: "research-article-processing-benchmark/v1",
    })
  const relative = (await import("node:path")).default.relative(f.ctx.repo, f.root + "/" + r.path)
  await assert.rejects(
    benchmarkArticleProcessing(f.ctx, { path: relative, sha256: "0".repeat(64) }),
    /input SHA/,
  )
})

test("article benchmark launches its native worker from a path containing spaces and URL characters", async (t) => {
  const f = fixture(t),
    copied = path.join(f.root, "runtime with # spaces"),
    workspace = path.join(f.root, "workspace with spaces"),
    code = path.join(f.root, "candidate with spaces"),
    seed = path.join(f.root, "seed"),
    destination = path.join(f.root, "benchmark output");
  fs.mkdirSync(copied);
  materializeProcessingCode(f.ctx.repo, copied);
  const worker = path.join(copied, "scripts/research/processing-replay.mjs"),
    invalidConfig = path.join(f.root, "invalid-config.json");
  fs.writeFileSync(
    invalidConfig,
    JSON.stringify({ mode: "invalid", instance: {} }),
  );
  const direct = spawnSync(process.execPath, [worker, invalidConfig], {
    encoding: "utf8",
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /Explicit replay mode required/);

  fs.mkdirSync(path.join(code, "scripts/research/modules"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(code, "scripts/research/module-runtime.mjs"),
    'throw Error("spaced native worker reached candidate code"); export const moduleContext = null\n',
  );
  fs.writeFileSync(
    path.join(code, "scripts/research/curation-workflow.mjs"),
    "export const advanceCuration = null\n",
  );
  fs.writeFileSync(
    path.join(code, "scripts/research/modules/contracts.mjs"),
    "export const nativeResearch = null\n",
  );
  const {
    processingCodeFingerprint,
    benchmarkArticleProcessing: runBenchmark,
  } = await import(
    pathToFileURL(
      path.join(copied, "scripts/research/operations-benchmark.mjs"),
    ).href
  );
  const candidate = processingCodeFingerprint(code);
  const seedRoot = path.join(seed, ".local/research/local-ai");
  fs.mkdirSync(seedRoot, { recursive: true });
  fs.mkdirSync(path.join(seed, "vault"));
  fs.writeFileSync(path.join(seedRoot, "pool.json"), "{}\n");
  fs.writeFileSync(path.join(seedRoot, "selection.json"), '{"pool":{}}\n');
  const oracle = path.join(f.root, "oracle.json");
  fs.writeFileSync(oracle, "{}\n");
  const manifest = path.join(f.root, "fixture.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      seed,
      files: [],
      fresh_articles: 31,
      preserved_reuse: 1,
      articles: Array.from({ length: 32 }, (_, i) => ({
        action: i ? "write" : "reuse",
        writer_run: "writer-" + i,
      })),
      original_pool: { path: "pool.json" },
      selection: { path: "selection.json" },
      oracle: { path: oracle },
    }),
  );
  fs.mkdirSync(workspace);
  const input = path.join(workspace, "benchmark.json");
  fs.writeFileSync(
    input,
    JSON.stringify({
      schema: "research-article-processing-benchmark/v1",
      fixture: { path: manifest, sha256: sha256(fs.readFileSync(manifest)) },
      baseline: candidate,
      candidate,
      destination,
    }),
  );
  await assert.rejects(
    runBenchmark(
      { repo: workspace },
      { path: "benchmark.json", sha256: sha256(fs.readFileSync(input)) },
    ),
    /Native article replay failed/,
  );
  const log = fs.readFileSync(
    path.join(destination, "pair-1-baseline.log"),
    "utf8",
  );
  assert.match(log, /spaced native worker reached candidate code/);
});
