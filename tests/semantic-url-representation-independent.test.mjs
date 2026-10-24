import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { knowledgeFixture, addKnowledgeArticle } from "./fixtures/research-knowledge-fixtures.mjs"
import { noteText, parseNote, canonicalURL } from "../scripts/garden.mjs"
import { markdownProse } from "../scripts/explanations.mjs"
import { articleSearchText } from "../scripts/knowledge.mjs"
import { sha256 } from "../scripts/research/contracts.mjs"
import { draftFingerprint } from "../scripts/research/editor.mjs"
import { approvedArticle } from "../scripts/research/publish-adapter.mjs"
import { loadApprovedOntologyInput } from "../scripts/research/ontology.mjs"
import {
  articleSemanticReviewStatus,
  exportArticleSemanticReviewIndex,
  prepareArticleSemanticReviews,
} from "../scripts/research/article-semantic-review.mjs"
import { articlePublicFingerprint } from "../web/article-semantic-index.mjs"

const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n")
const nativeURL = "https://fixture.example/independent-release"
const lead =
  "문서는 require_secret_scanning_alert_resolution 설정과 10~90 범위를 #security로 설명했다."
const explanation = "별도 설명은 literal \\x 표기를 보존하고 다른 원문의 결과로 바꾸지 않는다."

function policies(f) {
  fs.mkdirSync(path.join(f.root, "data"), { recursive: true })
  for (const name of [
    "research-model-policy-codex.json",
    "research-semantic-retrieval-policy.json",
  ])
    fs.copyFileSync(path.join("data", name), path.join(f.root, "data", name))
  return path.join(f.root, "data/research-model-policy-codex.json")
}

function publish(f, run) {
  const { article } = loadApprovedOntologyInput(f.root, run, { vault: f.vault }),
    file = path.join(f.vault, "News", article.event_id + ".md")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    noteText(
      {
        type: "news",
        event_id: article.event_id,
        title: article.title,
        sector: article.sector,
        published_at: article.article_review.published_at,
        review_status: "verified",
        sources: article.source_urls,
      },
      [
        "# " + article.title,
        markdownProse(article.record.lead),
        ...article.record.explanations.flatMap((s) => s.paragraphs).map(markdownProse),
        "## 출처\n\n- [원문](" + article.source_urls[0] + ")",
      ].join("\n\n"),
    ),
  )
  return { article, file }
}

async function articles(t) {
  const f = await knowledgeFixture(t),
    policyFile = policies(f),
    healthy = publish(f, "source")
  addKnowledgeArticle(f, {
    run: "representation-target",
    url: nativeURL,
    text: lead + " " + explanation,
  })
  const dir = path.join(f.root, "runs/representation-target"),
    draft = json(path.join(dir, "draft.json")),
    decision = json(path.join(dir, "editorial-review.json")),
    claims = json(path.join(dir, "reviewed-claims.json")).claims,
    documents = json(path.join(dir, "documents.json")),
    parses = json(path.join(dir, "parses.json"))
  draft.draft.lead[0].text = lead
  draft.draft.explanations[0].paragraphs[0].text = explanation
  draft.draft_id = draftFingerprint(draft.draft)
  decision.draft_id = draft.draft_id
  write(path.join(dir, "draft.json"), draft)
  write(path.join(dir, "editorial-review.json"), decision)
  write(
    path.join(dir, "approved-article.json"),
    approvedArticle(draft, claims, documents, decision, parses),
  )
  const target = publish(f, "representation-target"),
    note = parseNote(fs.readFileSync(target.file, "utf8"))
  // Reverse spelling from the reported defect: native has no trailing slash,
  // while generated public metadata retains it. Canonical identity is the same.
  note.meta.sources = [nativeURL + "/"]
  note.body = note.body.replace(nativeURL + ")", nativeURL + "/)")
  fs.writeFileSync(target.file, noteText(note.meta, note.body))
  return { f, policyFile, healthy, target }
}

const noEmbedding = {
  async metadata() {
    throw Error("Q0 synthetic embedding unavailable; full registry required")
  },
}
const parameters = ({ f, policyFile }, workflowId) => ({
  root: f.root,
  repo: f.root,
  vault: f.vault,
  policyFile,
  workflowId,
  gateReader: () => ({ regular_execution_allowed: true }),
  embeddingClient: noEmbedding,
})

test("Q0 representation: equivalent spellings preserve raw fingerprints, approvals and full export inventory", async (t) => {
  const fixture = await articles(t),
    { f, target, healthy } = fixture,
    before = loadApprovedOntologyInput(f.root, "representation-target", {
      vault: f.vault,
    }).file_hashes,
    publicBytes = fs.readFileSync(target.file),
    note = parseNote(publicBytes.toString("utf8")),
    rawProse = [note.meta.title, articleSearchText(note.body)].join("\n"),
    p = parameters(fixture, "q0-equivalent-representation-v1"),
    prepared = await prepareArticleSemanticReviews({ ...p, eventIds: [target.article.event_id] })
  assert.equal(prepared.status_counts.total, 2)
  assert.equal(prepared.status_counts.waiting_for_reasoning, 1)
  assert.equal(prepared.status_counts.ready, 1)
  assert.deepEqual(
    prepared.tasks.map((task) => task.event_id),
    [target.article.event_id],
  )
  const pointer = json(
      path.join(f.root, `runs/${p.workflowId}/article-semantic-review/latest.json`),
    ),
    inventory = json(path.join(f.root, pointer.inventory.path)),
    row = inventory.items.find((row) => row.event_id === target.article.event_id),
    request = json(path.join(f.root, "reasoning-tasks", prepared.tasks[0].task_id, "request.json")),
    expectedFingerprint = sha256(
      articlePublicFingerprint({
        event_id: target.article.event_id,
        title: target.article.title,
        published_at: target.article.article_review.published_at,
        source_urls: target.article.source_urls.map(canonicalURL),
        prose: rawProse,
      }),
    )
  assert.equal(row.article_public_sha256, expectedFingerprint)
  assert.equal(request.input.context.article.prose, rawProse)
  assert.ok(rawProse.includes("require\\_secret"))
  assert.ok(rawProse.includes("10\\~90"))
  assert.ok(rawProse.includes("\\#security"))
  assert.ok(rawProse.includes("literal \\x"))
  assert.equal(request.input.context.article.event_id, target.article.event_id)
  assert.ok(inventory.items.some((row) => row.event_id === healthy.article.event_id))
  await assert.rejects(
    exportArticleSemanticReviewIndex(p),
    /completed semantic review|still waiting/,
  )
  assert.deepEqual(
    loadApprovedOntologyInput(f.root, "representation-target", { vault: f.vault }).file_hashes,
    before,
  )
  assert.ok(fs.readFileSync(target.file).equals(publicBytes))
  assert.equal(fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")), false)
})

test("Q0 representation: real source or prose differences block only that article and forbid export", async (t) => {
  const cases = [
    ["extra source", (n) => n.meta.sources.push("https://fixture.example/other-source")],
    [
      "missing lead",
      (n) => {
        n.body = n.body.replace(markdownProse(lead), "")
      },
    ],
    [
      "missing explanation",
      (n) => {
        n.body = n.body.replace(markdownProse(explanation), "")
      },
    ],
    [
      "changed numeric endpoint",
      (n) => {
        n.body = n.body.replace("10\\~90", "10\\~95")
      },
    ],
    [
      "changed hash label",
      (n) => {
        n.body = n.body.replace("\\#security", "\\#safety")
      },
    ],
    [
      "removed unsupported backslash",
      (n) => {
        n.body = n.body.replace("literal \\x", "literal x")
      },
    ],
  ]
  for (const [index, [name, mutate]] of cases.entries())
    await t.test(name, async (t) => {
      const fixture = await articles(t),
        { f, target, healthy } = fixture,
        note = parseNote(fs.readFileSync(target.file, "utf8"))
      const before = JSON.stringify(note)
      mutate(note)
      assert.notEqual(JSON.stringify(note), before)
      fs.writeFileSync(target.file, noteText(note.meta, note.body))
      const p = parameters(fixture, "q0-representation-negative-" + index),
        prepared = await prepareArticleSemanticReviews(p),
        status = articleSemanticReviewStatus(p)
      assert.equal(prepared.status_counts.total, 2)
      assert.equal(prepared.status_counts.blocked, 1)
      assert.deepEqual(
        prepared.tasks.map((task) => task.event_id),
        [healthy.article.event_id],
      )
      assert.equal(
        status.items.find((row) => row.event_id === target.article.event_id).status,
        "blocked",
      )
      await assert.rejects(exportArticleSemanticReviewIndex(p), /Complete every article/)
      assert.equal(
        fs.existsSync(path.join(f.root, "data/article-semantic-review-index.json")),
        false,
      )
    })
})

test("Q0 representation: helper-only isolated revision rejects frozen jobs and separates metric cohorts", async (t) => {
  const fixture = await articles(t),
    snapshot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "q0-helper-snapshot-"))),
    source = fileURLToPath(new URL("../", import.meta.url))
  t.after(() => fs.rmSync(snapshot, { recursive: true, force: true }))
  for (const directory of ["scripts", "web", "data"])
    fs.cpSync(path.join(source, directory), path.join(snapshot, directory), {
      recursive: true,
      filter: (file) =>
        !["node_modules", "__pycache__", "venv", "runtime"].includes(path.basename(file)),
    })
  fs.copyFileSync(path.join(source, "package.json"), path.join(snapshot, "package.json"))
  fs.symlinkSync(
    fs.realpathSync(path.join(source, "node_modules")),
    path.join(snapshot, "node_modules"),
    "dir",
  )
  const config = path.join(snapshot, "q0-fixture.json")
  write(config, {
    root: fixture.f.root,
    vault: fixture.f.vault,
    repo: fixture.f.root,
    policyFile: fixture.policyFile,
    workflowId: "q0-same-input-different-helper",
  })
  const driver = `
    import fs from "node:fs";
    import path from "node:path";
    import {pathToFileURL} from "node:url";
    const [snapshot,mode,config] = process.argv.slice(1);
    const runtime=await import(pathToFileURL(path.join(snapshot,"scripts/research/module-runtime.mjs")));
    const semantic=await import(pathToFileURL(path.join(snapshot,"scripts/research/article-semantic-review.mjs")));
    const ctx=runtime.moduleContext({repo:snapshot,root:"native",vault:"native/vault"});
    const jobId="module-q0-decoder-provenance";
    let rejected=false,rejection=null;
    if(mode==="before") {
      const job=await runtime.submitModuleJob(ctx,"knowledge","semantic_status",{workflow_id:"q0-not-started"},{jobId,background:false});
      if(job.state!=="completed") throw Error("Read-only fixture job did not complete: "+JSON.stringify(job));
    } else {
      try {runtime.loadModuleJobForWorker(ctx,jobId);} catch(error) {rejected=true;rejection=error.message;}
    }
    const args={...JSON.parse(fs.readFileSync(config)),gateReader:()=>({regular_execution_allowed:true}),
      embeddingClient:{async metadata(){throw Error("Q0 isolated fixture; no model call");}}};
    const prepared=await semantic.prepareArticleSemanticReviews(args);
    const status=semantic.articleSemanticReviewStatus(args);
    const manifestDir=path.join(args.root,"semantic-review-metrics/implementations");
    const implementations=fs.readdirSync(manifestDir).map(file=>path.basename(file,".json")).sort();
    console.log(JSON.stringify({rejected,rejection,request:prepared.tasks[0].request_sha256,
      implementations,cohortImplementations:[...new Set(status.metrics.cohorts.map(c=>c.provenance.implementation_sha256))].sort()}));
  `
  const execute = (mode) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["--input-type=module", "-e", driver, snapshot, mode, config],
        { cwd: snapshot, encoding: "utf8", timeout: 20000, maxBuffer: 2 * 1024 * 1024 },
      ),
    )
  const originalHelper = path.join(source, "scripts/explanations.mjs"),
    originalBytes = fs.readFileSync(originalHelper),
    isolatedHelper = path.join(snapshot, "scripts/explanations.mjs"),
    before = execute("before")
  // Mutate only the private snapshot, then import it in a fresh process. A
  // byte-level helper revision must invalidate job provenance even if the
  // fixture's prose/result itself does not change.
  fs.appendFileSync(isolatedHelper, "\n// Q0 isolated helper-only implementation revision.\n")
  const after = execute("after")
  assert.equal(after.rejected, true)
  assert.match(after.rejection, /implementation changed/)
  assert.equal(before.implementations.length, 1)
  assert.equal(after.implementations.length, 2)
  assert.equal(after.cohortImplementations.length, 2)
  assert.equal(after.request, before.request)
  assert.ok(fs.readFileSync(originalHelper).equals(originalBytes))
})
