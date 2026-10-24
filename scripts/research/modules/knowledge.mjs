import fs from "node:fs"
import {
  operation,
  schema,
  id,
  list,
  file,
  integer,
  repoFile,
  nativeResearch,
  standalone,
} from "./contracts.mjs"
import { sha256 } from "../contracts.mjs"
import { safePath, withLock } from "../run-state.mjs"
import { approveNoteReview } from "../note-review.mjs"
import { syncKnowledgeWorkflow, readKnowledgeWorkflow } from "../knowledge-workflow.mjs"
import { exploreKnowledge, knowledgeExplorerSchema } from "../knowledge-explorer.mjs"
import {
  ontologyKnowledgeIndex,
  readOntologyKnowledgePage,
  approveKnowledgeConnections,
} from "../ontology-knowledge.mjs"
import {
  loadApprovedOntologyInput,
  projectEvidenceOntology,
  assertEvidenceOntology,
} from "../ontology.mjs"
import {
  prepareArticleSemanticReviews,
  retryInvalidArticleSemanticReview,
  resumeArticleSemanticReviews,
  articleSemanticReviewStatus,
  exportArticleSemanticReviewIndex,
} from "../article-semantic-review.mjs"

const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const json = (ctx, file) => JSON.parse(fs.readFileSync(repoFile(ctx, file)))

function graphInput(ctx, parameters) {
  const bytes = fs.readFileSync(safePath(ctx.root, parameters.graph_file))
  if (sha256(bytes) !== parameters.graph_sha256)
    throw Error("Knowledge graph file SHA-256 mismatch")
  const graph = JSON.parse(bytes)
  assertEvidenceOntology(graph)
  return graph
}

export const module = {
  id: "knowledge",
  title: "지식·온톨로지 모듈",
  inputs: [
    "approved article runs",
    "explicit specialist evidence selection",
    "native note and connection reviews",
  ],
  outputs: [
    "knowledge draft",
    "approved evidence ontology projection",
    "paged knowledge index",
    "native review receipts",
  ],
  operations: {
    explore: operation(
      "고정한 승인 색인·원문 그래프에서 질문 검색, 용어 학습, 기간별 변화와 기업 비교를 조회한다. 근거 없는 분석이나 미검토 연결을 추가하지 않는다.",
      knowledgeExplorerSchema,
      exploreKnowledge,
      { readOnly: true },
    ),
    draft: operation(
      "명시적으로 선택한 전문용어와 검증 사실로 용어 초안을 작성한다. 기존 Knowledge를 자동 덮어쓰거나 지도 노드를 자동 승인하지 않는다.",
      schema({ run_id: id, input_file: file() }, ["run_id", "input_file"]),
      (ctx, p) =>
        nativeResearch(
          ctx,
          "knowledge-draft",
          { run_id: p.run_id, review_file: p.input_file },
          { run_id: "run", review_file: "review" },
          { model: true },
        ),
      { model: true },
    ),
    project: operation(
      "정확한 승인 원문·검토 영수증을 검증해 기존 온톨로지 투영을 생성한다. 후보 유사성을 승인 관계로 사용하지 않는다.",
      schema({ approved_runs: list(id, 400) }, ["approved_runs"]),
      (ctx, p) => {
        const graph = projectEvidenceOntology(
          p.approved_runs.map((run) =>
            loadApprovedOntologyInput(ctx.root, run, { vault: ctx.vault }),
          ),
        )
        assertEvidenceOntology(graph)
        return graph
      },
      { readOnly: true },
    ),
    index: operation(
      "기존 graph의 정확한 파일 SHA와 native 정의·주제·관계 승인을 읽어 지식 색인을 조회한다. 원문·그래프·정의를 재생성하지 않는다.",
      schema(
        {
          graph_file: file("root"),
          graph_sha256: hash,
          knowledge_selections_file: file(),
          trend_review_runs: list(id, 64, 0),
          connection_review_run: id,
          company_review_file: file("root"),
          company_review_sha256: hash,
        },
        ["graph_file", "graph_sha256"],
      ),
      (ctx, p) => {
        if (Boolean(p.company_review_file) !== Boolean(p.company_review_sha256))
          throw Error("Exact company review path/SHA required")
        let companyReview
        if (p.company_review_file) {
          const bytes = fs.readFileSync(safePath(ctx.root, p.company_review_file))
          if (sha256(bytes) !== p.company_review_sha256)
            throw Error("Company review file SHA changed")
          companyReview = JSON.parse(bytes)
        }
        return ontologyKnowledgeIndex(ctx.root, graphInput(ctx, p), {
          vault: ctx.vault,
          knowledgeSelections: p.knowledge_selections_file
            ? json(ctx, p.knowledge_selections_file)
            : [],
          trendReviewRuns: p.trend_review_runs || [],
          connectionReviewRun: p.connection_review_run,
          companyReview,
        })
      },
      { readOnly: true },
    ),
    read: operation(
      "저장한 지식 색인을 정확한 파일 SHA로 고정해 구조별 페이지를 읽는다. 검토나 온톨로지 생성을 다시 실행하지 않는다.",
      schema(
        {
          result_file: file("root"),
          result_sha256: hash,
          section: {
            type: "string",
            enum: [
              "concepts",
              "events",
              "trend_topics",
              "knowledge_connections",
              "entity_timelines",
              "company_timelines",
              "research_papers",
              "research_people",
              "research_relationships",
            ],
          },
          offset: integer(0, 1_000_000),
          limit: integer(1, 100),
        },
        ["result_file", "result_sha256"],
      ),
      (ctx, p) => readOntologyKnowledgePage(ctx.root, p.result_file, p.result_sha256, p),
      { readOnly: true },
    ),
    review: operation(
      "명시적으로 검토한 Knowledge·Signals·TrendTopics 판본을 기존 native note-review로 승인한다. 반영은 기존 별도 경로를 사용한다.",
      schema({ run_id: id, review_file: file() }, ["run_id", "review_file"]),
      (ctx, p) =>
        withLock(ctx.root, "run-" + p.run_id, () =>
          approveNoteReview(ctx.root, p.run_id, json(ctx, p.review_file), { vault: ctx.vault }),
        ),
    ),
    connections: operation(
      "현재 승인된 전문용어 판본 사이의 기존 관계를 정확한 native 사실로 검토한다. 정의를 재승인하거나 공동 등장으로 관계를 만들지 않는다.",
      schema({ run_id: id, review_file: file(), knowledge_selections_file: file() }, [
        "run_id",
        "review_file",
        "knowledge_selections_file",
      ]),
      (ctx, p) =>
        approveKnowledgeConnections(
          ctx.root,
          p.run_id,
          json(ctx, p.review_file),
          json(ctx, p.knowledge_selections_file),
          { vault: ctx.vault },
        ),
    ),
    sync: operation(
      "같은 workflow ID로 native graph·정의·누적 note·관계의 변경을 감지한다. 정확한 native 기사 승인 연결 파일을 선택해 누락 사건을 연결하고 영향 검토를 재개한다. 의미 승인·원문 요청·canonical 쓰기는 하지 않는다.",
      schema(
        {
          workflow_id: id,
          basis_file: file("root"),
          article_links_file: file("root"),
          max_items: integer(0, 256),
          recover_lock_owner: {
            type: "string",
            pattern: "^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$",
          },
        },
        ["workflow_id"],
      ),
      (ctx, p) =>
        syncKnowledgeWorkflow({
          root: ctx.root,
          vault: ctx.vault,
          workflowId: p.workflow_id,
          basisFile: p.basis_file,
          articleLinksFile: p.article_links_file,
          maxItems: p.max_items,
          recoverLockOwner: p.recover_lock_owner,
        }),
    ),
    status: operation(
      "지속 연결 workflow의 저장 checkpoint·현재 index·검토 대기열을 페이지로 읽는다. sync나 원문·승인 재검증을 다시 실행하지 않는다.",
      schema(
        {
          workflow_id: id,
          status: { type: "string", enum: ["pending", "ready", "review_pending", "blocked"] },
          offset: integer(0, 1_000_000),
          limit: integer(1, 100),
        },
        ["workflow_id"],
      ),
      (ctx, p) => readKnowledgeWorkflow(ctx.root, p.workflow_id, p),
      { readOnly: true },
    ),
    semantic_prepare: operation(
      "전체 공개 기사와 정확히 일치하는 native 승인 원문을 고정하고, 검증 사실을 근거로 한 Luna 의미 검토 요청만 만든다. 개발 완료 관문 전에는 대기한다.",
      schema(
        {
          workflow_id: id,
          offset: integer(0, 1000000),
          limit: integer(1, 100),
          event_ids: {
            ...list({ type: "string", pattern: "^[a-f0-9]{16}$" }, 1000),
            uniqueItems: true,
          },
          pilot_review_refs: list(
            schema({ path: file("root"), sha256: hash }, ["path", "sha256"]),
            1000,
            0,
          ),
          approval_selection_refs: list(
            schema({ path: file("root"), sha256: hash }, ["path", "sha256"]),
            1000,
            0,
          ),
          completed_review_refs: list(
            schema({ path: file("root"), sha256: hash }, ["path", "sha256"]),
            1000,
            0,
          ),
          full_registry_event_ids: {
            ...list({ type: "string", pattern: "^[a-f0-9]{16}$" }, 1000, 0),
            uniqueItems: true,
          },
          full_registry_review_refs: list(
            schema(
              {
                event_id: { type: "string", pattern: "^[a-f0-9]{16}$" },
                path: file("root"),
                sha256: hash,
              },
              ["event_id", "path", "sha256"],
            ),
            1000,
            0,
          ),
        },
        ["workflow_id"],
      ),
      (ctx, p) =>
        prepareArticleSemanticReviews({
          root: ctx.root,
          vault: ctx.vault,
          repo: ctx.repo,
          policyFile: ctx.policy,
          workflowId: p.workflow_id,
          offset: p.offset,
          limit: p.limit,
          eventIds: p.event_ids,
          pilotReviewRefs: p.pilot_review_refs,
          approvalSelectionRefs: p.approval_selection_refs,
          completedReviewRefs: p.completed_review_refs,
          fullRegistryEventIds: p.full_registry_event_ids,
          fullRegistryReviewRefs: p.full_registry_review_refs,
        }),
      { model: true },
    ),
    semantic_status: operation(
      "고정한 기사별 의미 검토 inventory와 정확한 추론 요청·영수증 상태를 읽는다. 원문, 요청, 승인, 공개 자료를 수정하지 않는다.",
      schema(
        {
          workflow_id: id,
          offset: integer(0, 1000000),
          limit: integer(1, 100),
        },
        ["workflow_id"],
      ),
      (ctx, p) =>
        articleSemanticReviewStatus({
          root: ctx.root,
          vault: ctx.vault,
          repo: ctx.repo,
          policyFile: ctx.policy,
          workflowId: p.workflow_id,
          offset: p.offset,
          limit: p.limit,
        }),
      { readOnly: true },
    ),
    semantic_retry: operation(
      "잘못된 불변 의미 검토 결과를 덮어쓰지 않고, 같은 고정 기사·승인·개념·정책 입력에 새 추론 요청을 만든다.",
      schema({ workflow_id: id, event_id: { type: "string", pattern: "^[a-f0-9]{16}$" } }, [
        "workflow_id",
        "event_id",
      ]),
      (ctx, p) =>
        retryInvalidArticleSemanticReview({
          root: ctx.root,
          vault: ctx.vault,
          repo: ctx.repo,
          policyFile: ctx.policy,
          workflowId: p.workflow_id,
          eventId: p.event_id,
        }),
      { model: true },
    ),
    semantic_resume: operation(
      "같은 inventory의 완료된 Codex gpt-6-luna 결과만 검증해 기사별 의미 검토 영수증으로 고정한다. 새 모델 호출이나 승인·배포는 하지 않는다.",
      schema({ workflow_id: id, offset: integer(0, 1000000), limit: integer(1, 100) }, [
        "workflow_id",
      ]),
      (ctx, p) =>
        resumeArticleSemanticReviews({
          root: ctx.root,
          vault: ctx.vault,
          repo: ctx.repo,
          policyFile: ctx.policy,
          workflowId: p.workflow_id,
          offset: p.offset,
          limit: p.limit,
        }),
      { model: true },
    ),
    semantic_export: operation(
      "모든 공개 기사의 native 승인과 의미 검토가 완료된 뒤 해시 고정 검토 색인을 생성한다. 이 자료는 로컬 사이트 빌드 입력일 뿐 배포나 기사 승인이 아니다.",
      schema({ workflow_id: id }, ["workflow_id"]),
      (ctx, p) =>
        exportArticleSemanticReviewIndex({
          root: ctx.root,
          vault: ctx.vault,
          repo: ctx.repo,
          policyFile: ctx.policy,
          workflowId: p.workflow_id,
        }),
      { model: true },
    ),
  },
}
standalone(module, import.meta.url)
