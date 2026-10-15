import { operation, schema, id, file, standalone } from "./contracts.mjs"
import { digest, prepareEventSelection, reuseEventArticle } from "../event-pipeline.mjs"

export const selectionReference = { selection_path: file("root"), selection_sha256: digest }
const planReference = { plan_path: file("root"), plan_sha256: digest, group_id: id }
export const module = {
  id: "selection",
  title: "사건별 작성 대상 선별 모듈",
  inputs: ["reviewed edition event plan"],
  outputs: ["event-bound native source selection/bundle", "approved article reuse"],
  operations: {
    prepare: operation(
      "확정된 write 사건 하나를 선별하고 정확한 원문들만 native selector/bundle로 연결한다. 하나의 사건은 한 writer run에 바인딩하며 추출·작성·승인은 실행하지 않는다.",
      schema({ run_id: id, ...planReference }, ["run_id", ...Object.keys(planReference)]),
      prepareEventSelection,
    ),
    reuse: operation(
      "재관측으로 판정한 기존 사건의 정확한 native 승인 원고를 재사용한다. 새 기사·새 날짜·모델 호출·공개 발행을 만들지 않는다.",
      schema(planReference, Object.keys(planReference)),
      reuseEventArticle,
      { readOnly: true },
    ),
  },
}
standalone(module, import.meta.url)
