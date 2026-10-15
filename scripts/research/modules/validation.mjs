import fs from "node:fs"
import {
  operation,
  schema,
  id,
  file,
  nativeResearch,
  readConfig,
  standalone,
} from "./contracts.mjs"
import { storedListScan, verifyStoredListScan } from "../daily-scan.mjs"
import { readJSON, safePath } from "../run-state.mjs"
import { registry } from "../discovery.mjs"
import { collectionBasis } from "../scan-basis.mjs"
import { loadStoredSourceRun } from "../parser.mjs"
import { assertProcessedFactReview } from "../evidence-review-packet.mjs"
import { inspectReaderQuality } from "../reader-quality.mjs"
import { prepareEditorialCompleteness } from "../editorial-completeness.mjs"
import { approveSelectedEvent } from "../event-publication.mjs"
import { PLAN_FILE, loadPlanProgress } from "../plan-progress.mjs"
import { readOperationGate } from "../operation-policy.mjs"
import { readKnowledgeWorkflow } from "../knowledge-workflow.mjs"
import { auditEvaluationCases } from "../evaluation.mjs"
import {
  prepareEvaluationSourceReviewPacket,
  readEvaluationReviewPacket,
  importEvaluationHumanReview,
  auditEvaluationReviewPacket,
} from "../evaluation-review-packet.mjs"

export const module = {
  id: "validation",
  title: "검증·승인 모듈",
  inputs: ["stored native scans", "exact draft/fact review", "explicit editorial review"],
  outputs: [
    "native evidence verification",
    "reader quality findings",
    "immutable approval receipt",
  ],
  operations: {
    completeness: operation(
      "검토 사실·원문 범위/SHA와 중요도 검토 템플릿을 읽는다. 핵심 내용을 자동 추정하거나 원고·승인·점수를 생성하지 않는다. 새 원고는 정확한 중요도/조건 검토를 연결한다.",
      schema({ run_id: id }, ["run_id"]),
      prepareEditorialCompleteness,
      { readOnly: true },
    ),
    progress: operation(
      "시스템 구축 WBS를 주 집계로 읽고 기존 운영 수용·완료 묶음·지정 지식 checkpoint·독립 검토·전달 입력은 별도 반환한다. 기사 잔량·운영 회수·사용자 결정이 구축 분모를 늘리지 않으며 조사·모델·sync·승인·발행을 수행하지 않는다.",
      schema(
        {
          plan_file: { ...file(), enum: [PLAN_FILE] },
          workflow_id: id,
          evaluation_packet_run: id,
          publication_run_id: id,
          source_capture_run: id,
          source_reconcile_run: id,
        },
        ["plan_file"],
      ),
      async (ctx, p) => {
        if (
          (p.workflow_id ||
            p.evaluation_packet_run ||
            p.publication_run_id ||
            p.source_capture_run ||
            p.source_reconcile_run) &&
          typeof ctx.root !== "string"
        )
          throw Error("Selected private root required for stored progress")
        const progress = loadPlanProgress(ctx.repo)
        const result = {
          schema: "research-plan-progress/v1",
          ...progress,
          operation_gate: readOperationGate(ctx.repo),
          completion_scope: progress.completion_scope || "operational_acceptance",
          evidence_verified: false,
          source_requests: 0,
          model_calls: 0,
        }
        if (p.workflow_id) {
          const stored = readKnowledgeWorkflow(ctx.root, p.workflow_id, {
            status: "blocked",
            limit: 20,
          })
          result.stored_workflow = {
            workflow_id: stored.workflow_id,
            scope: "last_installed_checkpoint",
            status: stored.status,
            checkpoint: stored.checkpoint || null,
            input_sha256: stored.input_sha256 || null,
            counts: stored.counts || null,
            index: stored.index || null,
            projection_error: stored.projection_error || null,
            native_errors: stored.native_errors || [],
            blocked_tasks: stored.page,
            current_canonical_checked: false,
            semantic_review_performed: false,
            next_read: {
              module: "knowledge",
              operation: "status",
              parameters: {
                workflow_id: p.workflow_id,
                status: "blocked",
                offset: stored.page.next_offset ?? 0,
                limit: 20,
              },
            },
          }
        }
        if (p.evaluation_packet_run) {
          const packetPath = "runs/" + p.evaluation_packet_run + "/evaluation-review/packet.json"
          const exists = fs.existsSync(safePath(ctx.root, packetPath))
          if (!exists) {
            result.stored_evaluation = {
              packet_run: p.evaluation_packet_run,
              scope: "frozen_source_packet_and_submissions",
              status: "not_prepared",
              prepared_cases: null,
              submitted_independent_gold: null,
              remaining_independent_gold: null,
              source_payload_disclosed: false,
              next_read: {
                module: "validation",
                operation: "evaluation_read",
                parameters: { packet_run: p.evaluation_packet_run },
              },
            }
          } else {
            const audit = auditEvaluationReviewPacket(ctx.root, p.evaluation_packet_run)
            const remaining = audit.prepared_cases - audit.submitted_independent_gold
            result.stored_evaluation = {
              ...audit,
              scope: "frozen_source_packet_and_submissions",
              status: audit.invalid_submissions.length
                ? "review_submission_integrity_required"
                : remaining
                  ? "waiting_for_independent_reviews"
                  : "independent_reviews_imported",
              remaining_independent_gold: remaining,
              remaining_by_split: Object.fromEntries(
                ["development", "heldout"].map((split) => [
                  split,
                  audit.prepared_by_split[split] - audit.submitted_by_split[split],
                ]),
              ),
              source_payload_disclosed: false,
              model_quality_evaluated: false,
              operational_acceptance_granted: false,
              next_read: {
                module: "validation",
                operation: "evaluation_read",
                parameters: { packet_run: p.evaluation_packet_run },
              },
            }
          }
        }
        if (p.publication_run_id) {
          const { loadPublicationNextActions } = await import("../delivery-status.mjs")
          result.stored_publication = await loadPublicationNextActions({
            root: ctx.root,
            runId: p.publication_run_id,
            repository: ctx.repo,
          })
        }
        if (p.source_capture_run) {
          const { loadAuthoringSourceCapture } = await import("../authoring-source-snapshot.mjs")
          result.stored_source_authority = await loadAuthoringSourceCapture(
            ctx.root,
            p.source_capture_run,
            { repository: ctx.repo, vault: ctx.vault },
          )
        }
        if (p.source_reconcile_run) {
          const { loadAuthoringSourceReconciliation } =
            await import("../authoring-source-reconcile.mjs")
          result.stored_source_reconciliation = await loadAuthoringSourceReconciliation(
            ctx.root,
            p.source_reconcile_run,
            { repository: ctx.repo, vault: ctx.vault },
          )
        }
        return result
      },
      { readOnly: true },
    ),
    evaluation_prepare: operation(
      "독립 사람 검토용 원문 참조 묶음을 준비한다. 고정 원문·parse SHA와 split만 연결하고 원문을 복사하거나 평가 정답·모델 결과를 제시하지 않는다.",
      schema({ run_id: id, selection_file: file("root") }, ["run_id", "selection_file"]),
      (ctx, p) => prepareEvaluationSourceReviewPacket(ctx.root, p.run_id, p.selection_file),
    ),
    evaluation_read: operation(
      "준비된 독립 검토 묶음과 지정 사례의 정확한 원문·parse 참조를 읽는다. 이 조회는 독립 정답 판정이나 운영 승인이 아니다.",
      schema({ packet_run: id, case_id: id }, ["packet_run"]),
      (ctx, p) => readEvaluationReviewPacket(ctx.root, p.packet_run, { case_id: p.case_id }),
      { readOnly: true },
    ),
    evaluation_import: operation(
      "실제로 원문을 읽은 독립 사람의 명시적 검토 파일을 native 평가 사례로 가져온다. 자동 모델은 사람 검토를 대신할 수 없다.",
      schema({ run_id: id, packet_run: id, review_file: file("root") }, [
        "run_id",
        "packet_run",
        "review_file",
      ]),
      (ctx, p) => importEvaluationHumanReview(ctx.root, p.run_id, p.packet_run, p.review_file),
    ),
    evaluation_audit: operation(
      "준비 사례와 독립 사람 검토의 실제 완료 수를 구분한다. 준비 묶음이 없으면 기존 평가 사례 전체의 원문·split·중복 상태를 읽는다.",
      schema({ packet_run: id }),
      (ctx, p) =>
        p.packet_run
          ? auditEvaluationReviewPacket(ctx.root, p.packet_run)
          : auditEvaluationCases(ctx.root),
      { readOnly: true },
    ),
    scan: operation(
      "저장 기간 수집의 원문·parse·목록·예외 근거를 native 검증한다. 현재 수집 조건 일치 여부도 구분한다.",
      schema({ run_id: id, require_current_basis: { type: "boolean" } }, ["run_id"]),
      (ctx, p) => {
        const scan = storedListScan(ctx.root, p.run_id)
        verifyStoredListScan(ctx.root, scan, {
          channel_id: scan.summary.channel_id,
          ...scan.summary.window,
        })
        const acq = readConfig(ctx, "acquisition")
        const channel = registry(
          readConfig(ctx, "source-channels"),
          readConfig(ctx, "watchlist"),
          acq,
          readConfig(ctx, "source-recipes"),
        ).find((r) => r.channel_id === scan.summary.channel_id)
        const stored = readJSON(ctx.root, `runs/${p.run_id}/collection-basis.json`)
        const current = Boolean(
          channel &&
          stored &&
          JSON.stringify(stored) ===
            JSON.stringify(collectionBasis(channel, acq.article_profiles, ctx.repo)),
        )
        if (p.require_current_basis && !current)
          throw Error("Stored scan uses a different collection basis")
        return {
          native_verified: true,
          current_basis: current,
          status: scan.summary.status,
          candidates: scan.candidates.length,
          access_excluded_count: scan.summary.access_excluded_count || 0,
        }
      },
      { readOnly: true },
    ),
    reader: operation(
      "정확한 원고 ID와 검토 사실·원문 근거를 대조해 독자 품질을 검사한다. 검사 통과만으로 승인하지 않는다.",
      schema({ run_id: id }, ["run_id"]),
      async (ctx, p) => {
        loadStoredSourceRun(ctx.root, p.run_id)
        const draft = readJSON(ctx.root, `runs/${p.run_id}/draft.json`)
        const reviewed = readJSON(ctx.root, `runs/${p.run_id}/reviewed-claims.json`)
        if (!draft || !reviewed) throw Error("Exact draft and reviewed claims required")
        await assertProcessedFactReview(ctx.root, p.run_id, reviewed)
        return inspectReaderQuality(draft, reviewed.claims)
      },
      { readOnly: true },
    ),
    approve: operation(
      "명시적인 편집 검토 파일을 기존 원문·사실·품질·전문용어 승인 관문에 전달한다. Drive·Git·공개 배포는 하지 않는다.",
      schema(
        { run_id: id, review_file: file(), revision_file: file(), coverage_review_file: file() },
        ["run_id", "review_file"],
      ),
      approveSelectedEvent,
    ),
  },
}
standalone(module, import.meta.url)
