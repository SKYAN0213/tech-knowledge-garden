import fs from "node:fs"
import { assertSchema, sha256 } from "./contracts.mjs"
import {
  evaluationSpecSchema,
  loadEvaluationCase,
  loadEvaluationSource,
  loadEvaluationSourceScope,
  saveEvaluationCase,
  immutableSourceKey,
} from "./evaluation.mjs"
import { loadStoredSourceRun } from "./parser.mjs"
import { atomicCreate, readJSON, safePath, withLock } from "./run-state.mjs"

const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)
const operationId = (id) => validId(id) && id.length <= 100
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
  if (packet?.schema === "evaluation-source-review-packet/v2")
    return importReferencedHumanReview(root, run, packetRun, reviewPath)
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

const selectionIdentity = {
  type: "string",
  pattern: "^[A-Za-z0-9_-]+$",
  minLength: 1,
  maxLength: 100,
}
export const evaluationHumanReviewSubmissionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "packet_run", "packet_sha256", "original_case_id", "specification"],
  properties: {
    schema: { type: "string", enum: ["evaluation-human-review-submission/v2"] },
    packet_run: selectionIdentity,
    original_case_id: selectionIdentity,
    packet_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    specification: evaluationSpecSchema,
  },
}
export const evaluationSourceReviewSelectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "cases", "provenance"],
  properties: {
    schema: { type: "string", enum: ["evaluation-source-review-selection/v1"] },
    provenance: {
      type: "object",
      required: ["prepared_by"],
      properties: { prepared_by: { type: "string", minLength: 1 } },
    },
    cases: {
      type: "array",
      minItems: 1,
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["case_id", "split", "source_run", "source_scope", "coverage_tags", "prior_use"],
        properties: {
          case_id: selectionIdentity,
          original_case_id: selectionIdentity,
          split: { type: "string", enum: ["development", "heldout"] },
          source_run: { type: "string", pattern: "^[A-Za-z0-9_-]+$", minLength: 1 },
          source_scope: {
            type: "object",
            additionalProperties: false,
            required: ["source_version_ids", "parse_ids"],
            properties: {
              source_version_ids: {
                type: "array",
                minItems: 1,
                items: { type: "string", minLength: 1 },
              },
              parse_ids: {
                type: "array",
                minItems: 1,
                items: { type: "string", pattern: "^[a-f0-9]{64}$" },
              },
            },
          },
          coverage_tags: { type: "array", items: { type: "string", minLength: 1 } },
          prior_use: { type: "string", enum: ["development", "heldout", "source-only"] },
        },
      },
    },
  },
}
function assertSelection(selection) {
  assertSchema(selection, evaluationSourceReviewSelectionSchema)
  if (
    !selection.provenance.prepared_by.trim() ||
    new Set(selection.cases.map((c) => c.case_id)).size !== selection.cases.length
  )
    throw Error(
      "One to sixty distinct source-first review cases with preparation provenance required",
    )
  for (const c of selection.cases) {
    if (
      c.coverage_tags.some((s) => !s.trim()) ||
      new Set(c.coverage_tags).size !== c.coverage_tags.length ||
      !["development", "heldout", "source-only"].includes(c.prior_use) ||
      (c.split === "heldout" && c.prior_use === "development")
    )
      throw Error("Exact source references, split and prior-use provenance required")
  }
}

function assertPreparationProvenance(root, selection, cases) {
  const pins = selection.provenance.input_files || []
  if (
    !Array.isArray(pins) ||
    pins.some((pin) => typeof pin.path !== "string" || !/^[a-f0-9]{64}$/.test(pin.sha256 || ""))
  )
    throw Error("Exact preparation input file pins required")
  for (const pin of pins)
    if (sha256(fs.readFileSync(safePath(root, pin.path))) !== pin.sha256)
      throw Error("Preparation provenance input changed")
  const newHeldout = cases.filter((c) => c.split === "heldout" && !c.original_case_id)
  if (!newHeldout.length) return
  const reference = selection.provenance.heldout_exclusion_file
  if (
    !reference ||
    !pins.some((pin) => pin.path === reference.path && pin.sha256 === reference.sha256)
  )
    throw Error("New heldout sources require a pinned prior-use exclusion audit")
  const audit = readJSON(root, reference.path)
  if (
    audit?.schema !== "evaluation-source-prior-use-audit/v1" ||
    !Array.isArray(audit.excluded_urls) ||
    !Array.isArray(audit.excluded_body_sha256s) ||
    typeof audit.prepared_by !== "string" ||
    !audit.prepared_by.trim()
  )
    throw Error("Prior-use source exclusion audit required")
  const urls = new Set(audit.excluded_urls),
    bodies = new Set(audit.excluded_body_sha256s)
  // Preserve prior development classification even if a new selection leaves
  // those cases out of its visible packet. Read metadata only, never gold.
  const fixtures = safePath(root, "evaluation/fixtures")
  if (fs.existsSync(fixtures))
    for (const caseId of fs
      .readdirSync(fixtures, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && validId(entry.name))
      .map((entry) => entry.name)) {
      const manifest = readJSON(root, `evaluation/fixtures/${caseId}/manifest.json`)
      if (manifest?.origin !== "actual-source" || manifest.split !== "development") continue
      const documents = readJSON(
        root,
        manifest.source_storage === "shared-source/v1"
          ? `runs/${manifest.source_run}/documents.json`
          : `evaluation/fixtures/${caseId}/runs/source/documents.json`,
      )
      for (const d of documents || []) {
        if (
          manifest.source_scope?.source_version_ids &&
          !manifest.source_scope.source_version_ids.includes(d.source_version_id)
        )
          continue
        urls.add(d.original_url)
        bodies.add(d.body_sha256)
      }
    }
  for (const c of newHeldout)
    if (c.originals.some((d) => urls.has(d.original_url) || bodies.has(d.sha256)))
      throw Error("A previously used source cannot be relabelled as heldout")
}

function referencedSource(root, item) {
  const source = loadEvaluationSourceScope(root, item.source_run, item.source_scope || {})
  const original = item.original_case_id ? loadEvaluationSource(root, item.original_case_id) : null
  if (
    original &&
    (original.manifest.source_run !== item.source_run ||
      original.manifest.split !== item.split ||
      original.manifest.documents_sha256 !== source.identity.documents_sha256 ||
      original.manifest.parses_sha256 !== source.identity.parses_sha256)
  )
    throw Error("Original fixture and referenced source/split differ")
  return {
    ...item,
    source_scope: item.source_scope || {},
    documents_sha256: source.identity.documents_sha256,
    parses_sha256: source.identity.parses_sha256,
    immutable_source_key: immutableSourceKey(source.documents),
    files: Object.fromEntries(
      ["documents.json", "parses.json"].map((name) => [
        name,
        {
          path: `runs/${item.source_run}/${name}`,
          sha256: sha256(fs.readFileSync(safePath(root, `runs/${item.source_run}/${name}`))),
        },
      ]),
    ),
    originals: source.documents.map((d) => ({
      source_id: d.source_id,
      source_version_id: d.source_version_id,
      path: d.body_path,
      sha256: d.body_sha256,
      original_url: d.original_url,
      mime_type: d.mime_type,
    })),
    parse_refs: source.parses.map((p) => ({
      parse_id: p.parse_id,
      source_version_id: p.source_version_id,
      path: `parses/${p.parse_id}/parse.json`,
      sha256: sha256(fs.readFileSync(safePath(root, `parses/${p.parse_id}/parse.json`))),
      language: p.language,
      published_at: p.dates?.published_at || null,
      status: p.status,
      block_count: p.blocks.length,
      table_count: p.blocks.filter((b) => b.kind === "table").length,
      ocr_pages: p.quality?.ocr_pages || [],
    })),
    gold_candidate: original
      ? {
          path: original.manifest.gold_path,
          canonical_sha256: original.manifest.gold_sha256,
          specification_sha256: original.manifest.specification_sha256,
          status: original.manifest.status,
          fixture_manifest: {
            path: `evaluation/fixtures/${item.original_case_id}/manifest.json`,
            sha256: sha256(
              fs.readFileSync(
                safePath(root, `evaluation/fixtures/${item.original_case_id}/manifest.json`),
              ),
            ),
          },
        }
      : null,
  }
}

function referencedTemplate(packet, hash, item) {
  const value = submissionTemplate(packet, hash, item)
  value.schema = "evaluation-human-review-submission/v2"
  value.specification.case_id = item.case_id + "-human-v1"
  value.specification.split = item.split
  if (item.original_case_id) value.specification.supersedes = item.original_case_id
  else {
    delete value.specification.supersedes
    delete value.specification.supersedes_mode
  }
  return value
}

function referenceHTML(packet, hash) {
  const link = (p, label) => `<a href="../../../${escape(encodeURI(p))}">${escape(label)}</a>`
  const publicLink = (value) => {
    const url = new URL(value)
    if (!["https:", "http:"].includes(url.protocol)) throw Error("Invalid review source URL")
    return `<a href="${escape(url.href)}" rel="noopener noreferrer">출처</a>`
  }
  const cases = packet.cases
    .map(
      (c) => `<article id="${escape(c.case_id)}"><h2>${escape(c.case_id)}</h2>
    <p>${c.split === "heldout" ? "보류" : "개발"} · ${escape(c.coverage_tags.join(" · "))}</p>
    ${c.parse_refs.map((p) => `<p>${link(p.path, "저장 원문 본문·표·위치 보기")} · 발표 ${escape(p.published_at || "미확인")}<br><code>${escape(p.parse_id)}</code></p>`).join("")}
    ${c.originals.map((d) => `<p>${link(d.path, "보존 원본")} · ${publicLink(d.original_url)}<br><code>${escape(d.sha256)}</code></p>`).join("")}
    <p>검토 결과 양식: <a href="templates/${escape(c.case_id)}.json">JSON 열기</a></p></article>`,
    )
    .join("")
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>독립 원문 검토</title>
    <style>body{font:16px/1.6 system-ui;background:#f7f8fa;color:#182235}main{max-width:960px;margin:auto;padding:24px}article{background:white;padding:20px;margin:20px 0;border-radius:10px}a{color:#2159ad}code{font-size:12px;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #2159ad}</style><main><h1>독립 원문 검토</h1>
    <p>원문과 빈 검토 양식을 제공합니다. 기존 정답과 모델 출력은 표시하지 않습니다. 보류 원문은 모델 조정에 사용하지 마세요. 양식 저장은 평가 완료가 아니며 명시 제출 후 원문 검증을 통과해야 등록됩니다.</p>
    <p>묶음 SHA <code>${escape(hash)}</code></p>${cases}</main></html>`
}

// Reference existing immutable evidence. No raw body, parse payload, candidate output
// or gold content is copied into the packet or opened by this source-only path.
export async function prepareEvaluationSourceReviewPacket(root, run, selectionFile) {
  if (!operationId(run)) throw Error("Exact packet run required (up to 100 characters)")
  const selection = readJSON(root, selectionFile)
  assertSelection(selection)
  return withLock(root, "evaluation-review-" + run, async () => {
    const packet = {
      schema: "evaluation-source-review-packet/v2",
      run_id: run,
      selection: {
        path: selectionFile,
        sha256: sha256(fs.readFileSync(safePath(root, selectionFile))),
      },
      provenance: selection.provenance,
      cases: selection.cases.map((c) => referencedSource(root, c)),
      independent_gold: false,
      candidate_published: false,
      source_payload_copies: 0,
    }
    assertPreparationProvenance(root, selection, packet.cases)
    if (new Set(packet.cases.map((c) => c.immutable_source_key)).size !== packet.cases.length)
      throw Error("Duplicate immutable source snapshots in review packet")
    // A previously used development document may not become heldout by changing
    // its parse or grouping it with another source.
    const development = new Set(
      packet.cases
        .filter((c) => c.split === "development")
        .flatMap((c) => c.originals.map((d) => d.sha256)),
    )
    for (const c of packet.cases.filter((c) => c.split === "heldout"))
      if (c.originals.some((d) => development.has(d.sha256)))
        throw Error("Development/heldout source overlap")
    const bytes = encoded(packet),
      hash = sha256(bytes)
    if (bytes.length > 4 * 1024 ** 2) throw Error("Review reference packet exceeds private budget")
    const outputs = new Map([
      [base(run) + "/packet.json", bytes],
      [base(run) + "/index.html", Buffer.from(referenceHTML(packet, hash))],
    ])
    for (const c of packet.cases)
      outputs.set(
        base(run) + "/templates/" + c.case_id + ".json",
        encoded(referencedTemplate(packet, hash, c)),
      )
    for (const [file, content] of outputs) {
      if (fs.existsSync(safePath(root, file))) {
        if (!fs.readFileSync(safePath(root, file)).equals(content))
          throw Error("Review packet input changed; use a new run ID")
      }
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
      development: packet.cases.filter((c) => c.split === "development").length,
      heldout: packet.cases.filter((c) => c.split === "heldout").length,
      created_files: created,
      independent_gold: false,
      candidate_published: false,
      source_payload_copies: 0,
    }
  })
}

export function readEvaluationReviewPacket(root, packetRun, { case_id = null } = {}) {
  if (!operationId(packetRun) || (case_id !== null && !operationId(case_id)))
    throw Error("Exact packet run and optional case ID required (up to 100 characters)")
  const packetPath = base(packetRun) + "/packet.json",
    packet = readJSON(root, packetPath)
  if (packet?.schema !== "evaluation-source-review-packet/v2" || packet.run_id !== packetRun)
    throw Error("Source reference packet required")
  if (sha256(fs.readFileSync(safePath(root, packet.selection.path))) !== packet.selection.sha256)
    throw Error("Review selection changed")
  const selection = readJSON(root, packet.selection.path)
  assertSelection(selection)
  if (
    JSON.stringify(packet.cases.map((c) => c.case_id)) !==
      JSON.stringify(selection.cases.map((c) => c.case_id)) ||
    JSON.stringify(packet.provenance) !== JSON.stringify(selection.provenance)
  )
    throw Error("Review packet differs from its frozen selection")
  assertPreparationProvenance(root, selection, packet.cases)
  const cases = case_id ? packet.cases.filter((c) => c.case_id === case_id) : packet.cases
  if (!cases.length) throw Error("Review case not found")
  for (const c of cases) {
    const keys = selection.cases.find((item) => item.case_id === c.case_id)
    if (!keys) throw Error("Review case is outside the frozen selection")
    if (JSON.stringify(referencedSource(root, keys)) !== JSON.stringify(c))
      throw Error("Review source snapshot changed")
  }
  return {
    packet,
    sha256: sha256(fs.readFileSync(safePath(root, packetPath))),
    ...(case_id
      ? {
          source: loadEvaluationSourceScope(root, cases[0].source_run, cases[0].source_scope),
          template: referencedTemplate(
            packet,
            sha256(fs.readFileSync(safePath(root, packetPath))),
            cases[0],
          ),
        }
      : {}),
  }
}

export function auditEvaluationReviewPacket(root, packetRun) {
  const { packet, sha256: hash } = readEvaluationReviewPacket(root, packetRun)
  const submitted = [],
    invalid_submissions = []
  for (const item of packet.cases) {
    const caseId = item.case_id + "-human-v1"
    if (!readJSON(root, `evaluation/fixtures/${caseId}/manifest.json`)) continue
    try {
      const source = loadEvaluationCase(root, caseId)
      if (
        source.manifest.status !== "independent_gold" ||
        source.manifest.split !== item.split ||
        source.manifest.documents_sha256 !== item.documents_sha256 ||
        source.manifest.parses_sha256 !== item.parses_sha256
      )
        throw Error("Submitted human gold differs from the packet source or split")
      const receipt = readJSON(root, `evaluation/fixtures/${caseId}/review-submission.json`)
      if (
        receipt?.schema !== "evaluation-human-review-import/v1" ||
        receipt.case_id !== caseId ||
        receipt.packet_run !== packetRun ||
        receipt.packet.sha256 !== hash ||
        receipt.packet.path !== base(packetRun) + "/packet.json" ||
        sha256(fs.readFileSync(safePath(root, receipt.submission.path))) !==
          receipt.submission.sha256 ||
        sha256(JSON.stringify(readJSON(root, receipt.submission.path)?.specification)) !==
          source.manifest.specification_sha256
      )
        throw Error("Pinned explicit human submission for this packet required")
      submitted.push({ case_id: caseId, split: item.split })
    } catch (error) {
      invalid_submissions.push({ case_id: caseId, reason: error.message })
    }
  }
  const dimensions = (field) =>
    Object.fromEntries(
      [...new Set(packet.cases.flatMap((c) => c.parse_refs.map((p) => p[field])))]
        .sort()
        .map((v) => [
          v,
          packet.cases.filter((c) => c.parse_refs.some((p) => p[field] === v)).length,
        ]),
    )
  return {
    schema: "evaluation-review-readiness/v1",
    packet_run: packetRun,
    packet_sha256: hash,
    prepared_cases: packet.cases.length,
    prepared_by_split: Object.fromEntries(
      ["development", "heldout"].map((s) => [s, packet.cases.filter((c) => c.split === s).length]),
    ),
    dimensions: {
      languages: dimensions("language"),
      statuses: dimensions("status"),
      cases_with_tables: packet.cases.filter((c) => c.parse_refs.some((p) => p.table_count)).length,
      cases_with_ocr_pages: packet.cases.filter((c) => c.parse_refs.some((p) => p.ocr_pages.length))
        .length,
      coverage_tags: Object.fromEntries(
        [...new Set(packet.cases.flatMap((c) => c.coverage_tags))]
          .sort()
          .map((tag) => [tag, packet.cases.filter((c) => c.coverage_tags.includes(tag)).length]),
      ),
    },
    submitted_independent_gold: submitted.length,
    submitted_by_split: Object.fromEntries(
      ["development", "heldout"].map((s) => [s, submitted.filter((c) => c.split === s).length]),
    ),
    invalid_submissions,
    source_payload_copies: 0,
    candidate_published: false,
  }
}

async function importReferencedHumanReview(root, run, packetRun, reviewPath) {
  if (!operationId(run)) throw Error("Exact import run required (up to 100 characters)")
  return withLock(root, "evaluation-human-import-" + run, async () => {
    const { packet, sha256: hash } = readEvaluationReviewPacket(root, packetRun)
    const input = readJSON(root, reviewPath),
      spec = input?.specification
    assertSchema(input, evaluationHumanReviewSubmissionSchema)
    const item = packet.cases.find((c) => c.case_id === input?.original_case_id)
    if (
      !item ||
      input.schema !== "evaluation-human-review-submission/v2" ||
      input.packet_run !== packetRun ||
      input.packet_sha256 !== hash ||
      spec?.case_id !== item.case_id + "-human-v1" ||
      spec.origin !== "actual-source" ||
      spec.split !== item.split ||
      spec.review?.reviewer_kind !== "human" ||
      spec.review.source_read !== true ||
      spec.review.candidate_output_seen !== false ||
      spec.review.independent_of_candidate_output !== true ||
      (item.original_case_id
        ? spec.supersedes !== item.original_case_id || spec.supersedes_mode !== "exact-snapshot"
        : spec.supersedes !== undefined || spec.supersedes_mode !== undefined)
    )
      throw Error("Explicit independent human review of the exact frozen source/split required")
    const receipt = {
      schema: "evaluation-human-review-import/v1",
      case_id: spec.case_id,
      packet_run: packetRun,
      packet: { path: base(packetRun) + "/packet.json", sha256: hash },
      submission: { path: reviewPath, sha256: sha256(fs.readFileSync(safePath(root, reviewPath))) },
      source_run: item.source_run,
      documents_sha256: item.documents_sha256,
      parses_sha256: item.parses_sha256,
      reviewer: spec.review.reviewer,
      reviewer_kind: "human",
      reviewed_at: spec.review.reviewed_at,
      independent_gold: true,
      source_payload_copies: 0,
      candidate_published: false,
    }
    const receiptPath = `evaluation/fixtures/${spec.case_id}/review-submission.json`
    const prior = readJSON(root, receiptPath)
    if (prior && JSON.stringify(prior) !== JSON.stringify(receipt))
      throw Error("Human submission binding changed; preserve the original import")
    const runReceipt = `runs/${run}/evaluation-human-review-import.json`
    const previousRun = readJSON(root, runReceipt)
    if (previousRun && JSON.stringify(previousRun) !== JSON.stringify(receipt))
      throw Error("Import run belongs to another human submission")
    const result = await saveEvaluationCase(root, run, item.source_run, spec, {
      storage: "shared-source/v1",
      source_scope: item.source_scope,
    })
    if (!prior) atomicCreate(root, receiptPath, receipt)
    if (!previousRun) atomicCreate(root, runReceipt, receipt)
    return {
      ...result,
      packet_run: packetRun,
      original_case_id: item.case_id,
      submission_receipt: receiptPath,
      source_payload_copies: 0,
    }
  })
}
