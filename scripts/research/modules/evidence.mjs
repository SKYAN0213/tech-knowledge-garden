import { operation, schema, id, text, file, nativeResearch, standalone } from "./contracts.mjs"
import { loadStoredSourceRun } from "../parser.mjs"
import { readJSON } from "../run-state.mjs"
import { selectionReference } from "./selection.mjs"
import { loadSelectedEvent } from "../event-pipeline.mjs"
import { extractSelectedEventEvidence } from "../event-inference.mjs"

export const module = {
  id: "evidence",
  title: "근거 추출·검토 모듈",
  inputs: ["stored parses", "explicit fact review"],
  outputs: ["claims", "reviewed-claims"],
  operations: {
    extract: operation(
      "회차에서 선별된 사건의 원문 묶음에서 근거 사실을 추출한다. 미확정/미선별 사건은 모델 준비 전에 차단하고 기존 모델 정책·예산·근거 검증을 유지한다.",
      schema({ run_id: id, ...selectionReference, candidate_key: text }, [
        "run_id",
        ...Object.keys(selectionReference),
      ]),
      extractSelectedEventEvidence,
      { model: true },
    ),
    inspect: operation(
      "원본 해시를 검증하고 저장 사실·검토 상태를 조회한다. 추출이나 승인을 새로 수행하지 않는다.",
      schema({ run_id: id }, ["run_id"]),
      (ctx, p) => {
        const source = loadStoredSourceRun(ctx.root, p.run_id)
        const claims = readJSON(ctx.root, `runs/${p.run_id}/claims.json`)
        const reviewed = readJSON(ctx.root, `runs/${p.run_id}/reviewed-claims.json`)
        if (!claims && !reviewed) throw Error("Stored claims required")
        return { source_identity: source.identity, claims, reviewed }
      },
      { readOnly: true },
    ),
    review: operation(
      "명시적인 원문 대조 검토 파일을 기존 사실 검증기에 전달한다. 모델 평가를 사실 승인으로 승격하지 않는다.",
      schema({ run_id: id, review_file: file() }, ["run_id", "review_file"]),
      (ctx, p) => nativeResearch(ctx, "review", p, { run_id: "run", review_file: "review" }),
    ),
  },
}
standalone(module, import.meta.url)
