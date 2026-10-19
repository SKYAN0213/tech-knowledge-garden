import { operation, schema, id, file, list, integer, standalone } from "./contracts.mjs"
import { digest } from "../event-pipeline.mjs"
import { loadPublicationNextActions } from "../delivery-status.mjs"
import {
  prepareEventPublicationHandoff,
  eventPublicationStatus,
} from "../daily-publication-handoff.mjs"
import {
  requestPublicationDelivery,
  executePublicationDelivery,
  submitPublicationDeliveryReceipt,
  publicationDeliveryStatus,
  selectLegacyPublicationFallback,
} from "../authoring-delivery-request.mjs"
import {
  saveShadowCollectionBasis,
  recordShadowOperation,
  auditShadowOperations,
} from "../shadow-operations.mjs"

export const module = {
  id: "publication",
  title: "승인·발행 인계 모듈",
  inputs: [
    "exact native event workflow checkpoint",
    "existing approved source/draft/revision evidence",
  ],
  outputs: [
    "immutable publication selection",
    "local readiness and review/retry state",
    "pinned native delivery request and connector capture requests",
    "verified authoring, publication and remote delivery receipts",
  ],
  operations: {
    prepare: operation(
      "사건 workflow의 native 승인·수정 계보를 기존 preview/authoring 발행 선택으로 인계한다. 재사용·보류·실패를 구분하며 모델·Drive·Git·배포를 실행하지 않는다.",
      schema(
        {
          run_id: id,
          workflow_path: file("root"),
          workflow_sha256: digest,
          group_ids: list(id, 500),
        },
        ["run_id", "workflow_path", "workflow_sha256"],
      ),
      prepareEventPublicationHandoff,
    ),
    status: operation(
      "저장된 사건 인계를 정확한 원문·승인 해시와 대조하고 로컬 준비/검토 대기 상태를 읽는다. 원격 인증·조회·쓰기를 요구하지 않는다.",
      schema({ run_id: id }, ["run_id"]),
      eventPublicationStatus,
      { readOnly: true },
    ),
    request_delivery: operation(
      "정확한 승인 인계 path/SHA를 기존 authoring/delivery 실행 요청으로 고정한다. preview_run_id를 지정하면 같은 요청/승인 SHA의 비공개 reader preview를 생성하며 완료한 정확한 출력은 재사용한다. 새 회차 사양은 명시 edition_spec path/SHA만 받는다. 기존08시 실제 invocation과 frozen collection basis를 함께 지정하면 같은 실행의 native 기사/원문에 연결한다. release 검토·Drive 저장·공개 성공·정규회차 완료를 생성하지 않는다.",
      schema(
        {
          run_id: id,
          handoff_path: file("root"),
          handoff_sha256: digest,
          invocation_path: file("root"),
          invocation_sha256: digest,
          collection_basis_path: file("root"),
          collection_basis_sha256: digest,
          preview_run_id: id,
          edition_spec_path: file("root"),
          edition_spec_sha256: digest,
        },
        ["run_id", "handoff_path", "handoff_sha256"],
      ),
      requestPublicationDelivery,
    ),
    deliver: operation(
      "명시적 실행 ID·단계·release를 기존 전달 실행기에 연결한다. authoring 단계는 durable 요청을 통해 연결 도구가 원격 쓰기 후 raw capture를 제출해야 하며 publication 단계는 검증된 Drive 원본 import·publisher·공개 readback을 실행한다. 미확정 create 재개에는 기존 intent, 새 원문 목록, 사망한 이전 writer와 connector 호출 미전송에 대한 운영자 확인을 모두 요구한다. 미확인 쓰기/발행은 자동 재시도하지 않고 완료된 실행은 재사용한다. 외부 발행의 명시적 운영 실행에만 사용한다.",
      schema(
        {
          run_id: id,
          execution_id: id,
          stage: { type: "string", enum: ["authoring", "publication"] },
          release_path: file("root"),
          release_sha256: digest,
          acquisition_path: file("root"),
          acquisition_sha256: digest,
          source_snapshot_path: file("root"),
          source_snapshot_sha256: digest,
          source_readback_path: file("root"),
          source_readback_sha256: digest,
          remote_plan_path: file("root"),
          remote_plan_sha256: digest,
          remote_acquisition_path: file("root"),
          remote_acquisition_sha256: digest,
          resume_intent: file("root"),
          connector_call_not_dispatched: { type: "boolean" },
          resume_remote_intent: file("root"),
          retry_publish: { type: "boolean" },
          actions_run: { type: "string", pattern: "^[0-9]+$", maxLength: 30 },
          wait_ms: integer(1, 60000),
        },
        ["run_id", "execution_id", "stage", "release_path", "release_sha256"],
      ),
      executePublicationDelivery,
      { network: true },
    ),
    delivery_receipt: operation(
      "대기 중인 정확한 connector event에 실제 획득 파일 path/SHA를 제출한다. 업로드 응답·성공 boolean으로 완료하지 않고 기존 native raw-byte 검증기가 receipt를 소비한다. 같은 event와 입력의 재제출은 쓰기를 반복하지 않는다.",
      schema(
        {
          run_id: id,
          execution_id: id,
          event_id: digest,
          acquisition_path: file("root"),
          acquisition_sha256: digest,
        },
        ["run_id", "execution_id", "event_id", "acquisition_path", "acquisition_sha256"],
      ),
      submitPublicationDeliveryReceipt,
    ),
    delivery_status: operation(
      "정확한 전달 요청·실행·대기 connector intent와 native Drive/발행/원격 receipt를 읽는다. next_actions는 사용자 결정·외부 증거·로컬 준비·실패를 exact request/preview SHA에 결속해 분리한다. 저장 원격 관측과 현재 원격 검증을 구분하며 네트워크·모델·쓰기를 실행하지 않는다.",
      schema({ run_id: id, source_capture_run: id, source_reconcile_run: id }, ["run_id"]),
      async (ctx, p) => {
        const status = publicationDeliveryStatus(ctx, p)
        const result = {
          ...status,
          next_actions: loadPublicationNextActions({
            root: ctx.root,
            runId: p.run_id,
            repository: ctx.repo,
            nativeStatus: status,
          }),
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
          const { loadAuthoringSourceReconciliation } = await import("../authoring-source-reconcile.mjs")
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
    fallback: operation(
      "명시 검토 path/SHA로 같은 회차의 기존 승인 legacy release/preview를 선택한다. 미해결 쓰기·발행 intent와 fresh legacy Drive proof 부재는 복귀를 차단한다. 회차·사건 ID에 귀속된 선택은 새 run/구현 지문으로 native 재진입할 수 없으며 원본 실패를 보존한다. 원격 복원·승인·실제 발행·운영 복구 성공을 생성하지 않는다.",
      schema({ run_id: id, review_path: file("root"), review_sha256: digest }, [
        "run_id",
        "review_path",
        "review_sha256",
      ]),
      selectLegacyPublicationFallback,
    ),
    shadow_basis: operation(
      "기존08시 수집의 자동 frozen acquisition/handoff snapshot을 정확히 조회·고정한다. 과거 설정을 재구성하거나 새로운 조사·검토·7회 완료를 생성하지 않는다.",
      schema({ daily_run: id, handoff_path: file("root") }, ["daily_run"]),
      (ctx, p) =>
        saveShadowCollectionBasis({
          root: ctx.root,
          dailyRun: p.daily_run,
          handoffPath: p.handoff_path,
          backlogFile: ctx.repo + "/.local/research/candidate-backlog.json",
        }),
    ),
    shadow_record: operation(
      "명시적인 운영 비교 검토 path/SHA를 제출한다. 같은 실제08시 수집·정확한 native 비공개 원문/최종 원고와 웹/RSS/MD 비교·기존 정상 경로의 Drive/공개 archived 증거를 검증하고 서로 다른 완료 회차만 기록한다. native 후보 공개·모델 작성자 자신의 성공 선언·독립 사람 평가·무인 승격을 생성하지 않는다.",
      schema({ run_id: id, review_path: file("root"), review_sha256: digest }, [
        "run_id",
        "review_path",
        "review_sha256",
      ]),
      (ctx, p) =>
        recordShadowOperation({
          root: ctx.root,
          run: p.run_id,
          reviewPath: p.review_path,
          reviewSha256: p.review_sha256,
          repository: ctx.repo,
        }),
    ),
    shadow_status: operation(
      "저장된 운영 비교 영수증의 정확한 근거를 재검증하고 날짜·회차·실행·invocation raw 증거가 중복된 완료를 제외해7회 진척을 읽는다. 새 예약·모델·네트워크·자동 공개 승격을 실행하지 않는다.",
      schema({}),
      (ctx) => auditShadowOperations(ctx.root, ctx.repo),
      { readOnly: true },
    ),
  },
}
standalone(module, import.meta.url)
