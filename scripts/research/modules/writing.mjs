import { operation, schema, id, file, nativeResearch, standalone } from "./contracts.mjs"
import { selectionReference } from "./selection.mjs"
import { loadSelectedEvent } from "../event-pipeline.mjs"

export const module = {
  id: "writing",
  title: "기사 작성 모듈",
  inputs: ["reviewed-claims", "stored source selection/bundle"],
  outputs: ["draft", "private preview"],
  operations: {
    draft: operation(
      "선별된 사건의 원문 범위에 속한 검증 사실만 육하원칙 기사·상세 설명으로 작성한다. 검토된 다른 사건의 사실도 범위 밖이면 차단하며 기존 승인 관문을 유지한다.",
      schema(
        {
          run_id: id,
          ...selectionReference,
          completeness_review_file: file(),
          draft_input_migration_file: file(),
          draft_input_migration_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          authoring_scope_file: file(),
          authoring_scope_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
        ["run_id", ...Object.keys(selectionReference)],
      ),
      (ctx, p) => {
        loadSelectedEvent(ctx, p, { requireProcessed: true })
        return nativeResearch(
          ctx,
          "draft",
          p,
          {
            run_id: "run",
            completeness_review_file: "completeness-review",
            draft_input_migration_file: "draft-input-migration",
            draft_input_migration_sha256: "draft-input-migration-sha256",
            authoring_scope_file: "authoring-scope",
            authoring_scope_sha256: "authoring-scope-sha256",
          },
          { model: true },
        )
      },
      { model: true },
    ),
    correct: operation(
      "정확한 draft ID·수정 이유·검토일이 포함된 파일로 기존 원고를 수정한다. 이전 원고와 근거 검증을 보존한다.",
      schema({ run_id: id, review_file: file() }, ["run_id", "review_file"]),
      (ctx, p) => nativeResearch(ctx, "correct", p, { run_id: "run", review_file: "review" }),
    ),
  },
}
standalone(module, import.meta.url)
