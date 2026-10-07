import fs from "node:fs"
import { sha256 } from "./contracts.mjs"
import { loadEvaluationSource, saveEvaluationCase, immutableSourceKey } from "./evaluation.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)
const base = (run) => `runs/${run}/evaluation-review`
const encoded = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n")
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )

function sourceReference(root, caseId) {
  const source = loadEvaluationSource(root, caseId)
  if (source.manifest.origin !== "actual-source" || source.manifest.split !== "development")
    throw Error("Blind development review requires an actual development source")
  const manifestPath = `evaluation/fixtures/${caseId}/manifest.json`
  return {
    case_id: caseId,
    source_run: source.manifest.source_run,
    fixture_manifest: {
      path: manifestPath,
      sha256: sha256(fs.readFileSync(safePath(root, manifestPath))),
    },
    documents_sha256: source.manifest.documents_sha256,
    parses_sha256: source.manifest.parses_sha256,
    immutable_source_key: immutableSourceKey(source.documents),
    documents: source.documents,
    parses: source.parses,
  }
}

function submissionTemplate(packet, packetHash, item) {
  return {
    schema: "evaluation-human-review-submission/v1",
    packet_run: packet.run_id,
    packet_sha256: packetHash,
    original_case_id: item.case_id,
    specification: {
      schema: "evaluation-spec/v1",
      case_id: item.case_id + "-human-v1",
      supersedes: item.case_id,
      supersedes_mode: "exact-snapshot",
      origin: "actual-source",
      split: "development",
      event_id: null,
      sectors: [],
      languages: [],
      article_kind: "",
      document_scope: "",
      review: {
        reviewer: "",
        reviewer_kind: "human",
        reviewed_at: null,
        source_read: false,
        candidate_output_seen: null,
        independent_of_candidate_output: null,
        notes: "",
      },
      facts: [],
      required_explanations: [],
      forbidden_transformations: [],
    },
  }
}

function render(packet, hash) {
  const articles = packet.cases
    .map((item) => {
      const documents = item.documents
        .map((document) => {
          const url = new URL(document.original_url)
          if (!["https:", "http:"].includes(url.protocol)) throw Error("Invalid review source URL")
          const parses = item.parses.filter(
            (p) => p.source_version_id === document.source_version_id,
          )
          return `<section><a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">원문</a>
        <code>${escape(document.source_version_id)}</code>${parses
          .map(
            (parse) =>
              `<h3>${escape(parse.title)}</h3><p>발표 ${escape(parse.dates?.published_at || "—")}</p>
          ${parse.blocks
            .map(
              (
                block,
              ) => `<details><summary>${escape(block.kind || "본문")} · ${escape(block.block_id)}</summary>
          <pre>${escape(block.text)}</pre><code>${escape(JSON.stringify(block.locator || {}))}</code></details>`,
            )
            .join("")}`,
          )
          .join("")}</section>`
        })
        .join("")
      return `<article id="${escape(item.case_id)}"><h2>${escape(item.case_id)}</h2>${documents}
      <details><summary>검토 결과 작성</summary><p>핵심 사실·필요한 설명·금지 변형을 원문에서 직접 작성합니다. 사실에는 source_id, source_version_id, parse_id, block_id와 정확한 인용을 연결하세요. 제출 전 검토자·분야·언어·기사 종류·문서 범위와 검토 여부를 입력하세요.</p>
      <textarea aria-label="${escape(item.case_id)} 검토 결과" spellcheck="false">${escape(JSON.stringify(submissionTemplate(packet, hash, item), null, 2))}</textarea>
      <button data-download="${escape(item.case_id)}">검토 JSON 저장</button><output aria-live="polite"></output></details></article>`
    })
    .join("")
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>독립 원문 검토</title><style>body{margin:0;background:#f6f7fa;color:#202a38;font:16px/1.65 system-ui}main{max-width:1000px;margin:auto;padding:32px 18px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{padding:6px 10px;border-radius:8px;background:#e5ebf5;color:#234a80}article{background:white;padding:24px;margin-top:24px;border-radius:12px}h2,h3{overflow-wrap:anywhere}section{margin:24px 0}summary,button{cursor:pointer}details{border:1px solid #dee3eb;border-radius:6px;margin:8px 0;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}code{display:block;font-size:12px;overflow-wrap:anywhere;color:#516070}textarea{box-sizing:border-box;width:100%;min-height:440px;font:13px/1.5 monospace}button{padding:10px 16px;margin-top:10px}output{display:block;color:#a33131}a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #366fd6;outline-offset:3px}</style>
  <main><h1>독립 원문 검토</h1><p>모델 출력과 기존 정답은 제공하지 않습니다. 초안 저장만으로 독립 평가가 등록되지 않습니다.</p>
  <nav aria-label="검토 사례">${packet.cases.map((c) => `<a href="#${escape(c.case_id)}">${escape(c.case_id)}</a>`).join("")}</nav>${articles}</main>
  <script>document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>{const parent=button.parentElement,output=parent.querySelector('output');try{const value=JSON.parse(parent.querySelector('textarea').value),blob=new Blob([JSON.stringify(value,null,2)+'\\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=button.dataset.download+'-review.json';a.click();URL.revokeObjectURL(url);output.textContent='';}catch(error){output.textContent='JSON 형식을 확인하세요: '+error.message;}}));</script></html>`
}

export async function prepareEvaluationReviewPacket(root, run, caseIds) {
  if (
    !validId(run) ||
    !Array.isArray(caseIds) ||
    !caseIds.length ||
    caseIds.length > 60 ||
    caseIds.some((id) => !validId(id)) ||
    new Set(caseIds).size !== caseIds.length
  )
    throw Error("One to sixty distinct development case IDs required")
  return withLock(root, "evaluation-review-" + run, async () => {
    const packet = {
      schema: "evaluation-source-review-packet/v1",
      run_id: run,
      cases: caseIds.map((id) => sourceReference(root, id)),
      independent_gold: false,
      candidate_published: false,
    }
    if (new Set(packet.cases.map((c) => c.immutable_source_key)).size !== packet.cases.length)
      throw Error("Duplicate immutable source snapshots in review packet")
    const bytes = encoded(packet),
      hash = sha256(bytes)
    if (bytes.length > 16 * 1024 ** 2) throw Error("Review packet exceeds its private byte budget")
    const outputs = new Map([
      [base(run) + "/packet.json", bytes],
      [base(run) + "/index.html", Buffer.from(render(packet, hash))],
    ])
    for (const item of packet.cases)
      outputs.set(
        base(run) + "/templates/" + item.case_id + ".json",
        encoded(submissionTemplate(packet, hash, item)),
      )
    for (const item of packet.cases)
      for (const document of item.documents) {
        const content = fs.readFileSync(
          safePath(root, `evaluation/fixtures/${item.case_id}/${document.body_path}`),
        )
        if (sha256(content) !== document.body_sha256) throw Error("Review original bytes changed")
        outputs.set(
          `${base(run)}/originals/${document.source_id}/${document.body_sha256}/body.bin`,
          content,
        )
      }
    if ([...outputs.values()].reduce((sum, content) => sum + content.length, 0) > 64 * 1024 ** 2)
      throw Error("Review originals exceed the private bundle budget")
    for (const [file, content] of outputs) {
      const target = safePath(root, file)
      if (fs.existsSync(target) && !fs.readFileSync(target).equals(content))
        throw Error("Review packet input changed; use a new run ID")
    }
    let created = 0
    for (const [file, content] of outputs)
      if (!fs.existsSync(safePath(root, file))) {
        atomicCreate(root, file, content)
        created++
      }
    return {
      packet: base(run) + "/packet.json",
      sha256: hash,
      html: base(run) + "/index.html",
      cases: packet.cases.length,
      created_files: created,
      independent_gold: false,
      candidate_published: false,
    }
  })
}

export async function importEvaluationHumanReview(root, run, packetRun, reviewPath) {
  if (!validId(run) || !validId(packetRun)) throw Error("Exact review and packet run IDs required")
  const packetPath = base(packetRun) + "/packet.json",
    packet = readJSON(root, packetPath)
  const input = readJSON(root, reviewPath),
    spec = input?.specification
  if (
    packet?.schema !== "evaluation-source-review-packet/v1" ||
    packet.run_id !== packetRun ||
    input?.schema !== "evaluation-human-review-submission/v1" ||
    input.packet_run !== packetRun ||
    input.packet_sha256 !== sha256(fs.readFileSync(safePath(root, packetPath)))
  )
    throw Error("Human review must bind the exact frozen packet")
  const item = packet.cases.find((c) => c.case_id === input.original_case_id)
  if (!item || JSON.stringify(sourceReference(root, item.case_id)) !== JSON.stringify(item))
    throw Error("Review source snapshot changed")
  if (
    spec?.review?.reviewer_kind !== "human" ||
    spec.review.source_read !== true ||
    spec.review.candidate_output_seen !== false ||
    spec.review.independent_of_candidate_output !== true ||
    spec.supersedes !== item.case_id ||
    spec.supersedes_mode !== "exact-snapshot" ||
    spec.origin !== "actual-source" ||
    spec.split !== "development" ||
    spec.case_id === item.case_id
  )
    throw Error("Explicit independent human review of this source is required")
  const stored = loadStoredSourceRun(root, item.source_run)
  if (
    stored.identity.documents_sha256 !== item.documents_sha256 ||
    stored.identity.parses_sha256 !== item.parses_sha256
  )
    throw Error("Original source run differs from the frozen review input")
  const result = await saveEvaluationCase(root, run, item.source_run, spec)
  return { ...result, packet_run: packetRun, original_case_id: item.case_id }
}
