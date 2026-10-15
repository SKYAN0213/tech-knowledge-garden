import { operation, schema, id, list, nativeResearch, standalone } from "./contracts.mjs"
import { loadStoredSourceRun } from "../parser.mjs"
import { registerArticleImageReview } from "../article-image-review-cache.mjs"

export const module = {
  id: "parsing",
  title: "파싱 모듈",
  inputs: ["stored source runs"],
  outputs: ["source-parse/v1", "research-source-bundle/v1"],
  operations: {
    remember_image_review: operation(
      "원 기사와 모든 이미지의 전체 프레임 검토가 연결된 저장 run을 해시별로 등록한다. 동일 원본만 이후 수집에서 재사용한다.",
      schema({ source_run: id }, ["source_run"]),
      (ctx, p) => registerArticleImageReview({ root: ctx.root, sourceRun: p.source_run }),
    ),
    inspect: operation(
      "저장 원문·parse의 실제 바이트와 해시를 검증하고 조회한다. 재수집·모델 호출은 없다.",
      schema({ run_id: id }, ["run_id"]),
      (ctx, p) => loadStoredSourceRun(ctx.root, p.run_id),
      { readOnly: true },
    ),
    bundle: operation(
      "2~8개의 저장 원문 run을 검증해 명시적 다중 출처 묶음으로 연결한다. 같은 사건 확정이나 승인은 하지 않는다.",
      schema({ run_id: id, source_runs: list(id, 8, 2) }, ["run_id", "source_runs"]),
      (ctx, p) =>
        nativeResearch(
          ctx,
          "bundle",
          {
            run_id: p.run_id,
            source_run: p.source_runs[0],
            additional_runs: p.source_runs.slice(1),
          },
          { run_id: "run", source_run: "source-run", additional_runs: "additional-source-run" },
        ),
    ),
    reparse: operation(
      "보존한 원본을 현재 공통 파서로 다시 파싱한다. 원 발표일과 원본을 유지하고 별도 run을 사용한다.",
      schema({ run_id: id, source_run: id }, ["run_id", "source_run"]),
      (ctx, p) => nativeResearch(ctx, "reparse", p, { run_id: "run", source_run: "source-run" }),
    ),
  },
}
standalone(module, import.meta.url)
