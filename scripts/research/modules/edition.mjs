import { operation, schema, id, file, text, standalone } from "./contracts.mjs"
import { digest, freezeEdition, editionMaterials } from "../event-pipeline.mjs"
import { advanceEventWorkflow } from "../event-workflow.mjs"
import { advanceRoundWorkflow } from "../round-workflow.mjs"
import { integer } from "./contracts.mjs"

export const editionReference = { edition_path: file("root"), edition_sha256: digest }
export const module = {
  id: "edition",
  title: "회차 자료 고정 모듈",
  inputs: ["settled native collection report"],
  outputs: [
    "immutable edition material reference",
    "event workflow checkpoints and approved ontology",
  ],
  operations: {
    advance: operation(
      "round 모드에서 수집·회차 고정·관계 검토·선별·작성·명시 승인·지식 색인·발행 준비를 같은 회차로 이어간다. 기본 고정 회차 동작도 유지하며 완료 단계는 재실행하지 않는다.",
      schema(
        {
          run_id: id,
          round: { type: "boolean" },
          require_curation: { type: "boolean" },
          require_completeness: { type: "boolean" },
          daily_run: id,
          report_path: file("root"),
          report_sha256: digest,
          collect: { type: "boolean" },
          stop_after_collection: { type: "boolean" },
          collection_max_windows: integer(1, 500),
          collection_time_budget_ms: integer(1, 3600000),
          collection_config_file: file(),
          ...editionReference,
          plan_path: file("root"),
          plan_sha256: digest,
          curation_path: file("root"),
          curation_sha256: digest,
          execute: { type: "boolean" },
          propose: { type: "boolean" },
          max_items: integer(1, 40),
          time_budget_ms: integer(1, 3600000),
          max_model_calls: integer(1, 64),
          retry_failed: { type: "boolean" },
          material_ids: { type: "array", minItems: 1, maxItems: 500, items: digest },
          offset: integer(0, 1000000),
          fact_reviews: { type: "object", additionalProperties: file() },
          editorial_reviews: { type: "object", additionalProperties: file() },
          revision_reviews: { type: "object", additionalProperties: file() },
          completeness_reviews: { type: "object", additionalProperties: file() },
          coverage_reviews: { type: "object", additionalProperties: file() },
          retry_groups: { type: "array", maxItems: 40, uniqueItems: true, items: id },
          note_review_runs: { type: "array", maxItems: 64, uniqueItems: true, items: id },
          connection_review_run: id,
          knowledge_selections_file: file(),
          trend_review_runs: { type: "array", maxItems: 64, uniqueItems: true, items: id },
          ontology_path: file("root"),
          ontology_sha256: digest,
        },
        ["run_id"],
      ),
      (ctx, p) =>
        p.round || p.daily_run || p.report_path
          ? advanceRoundWorkflow(ctx, { ...p, require_curation: p.require_curation ?? true })
          : advanceEventWorkflow(ctx, p),
      { model: true, network: true },
    ),
    freeze: operation(
      "계획된 모든 창을 시도한 회차의 native 수집 보고서와 실제 원문/parse를 검증해 고정한다. 실패 창은 partial로 보존하며 작성·승인은 하지 않는다.",
      schema({ run_id: id, report_path: file("root"), report_sha256: digest }, [
        "run_id",
        "report_path",
        "report_sha256",
      ]),
      freezeEdition,
    ),
    read: operation(
      "고정 회차의 전체 수집 상태·자료 목록 또는 정확한 원문 블록을 읽는다. 미수집을 새 소식 없음으로 해석하지 않는다.",
      schema({ ...editionReference, material_id: text }, Object.keys(editionReference)),
      editionMaterials,
      { readOnly: true },
    ),
  },
}
standalone(module, import.meta.url)
