import { operation, schema, id, file, day, integer, standalone } from "./contracts.mjs"
import { digest } from "../event-pipeline.mjs"
import { prepareCuration, evaluateCuration, selectCuration } from "../curation.mjs"
import { advanceCuration } from "../curation-workflow.mjs"
import { readCurationInsights, recordCurationFeedback } from "../curation-insights.mjs"

const pool = { pool_path: file("root"), pool_sha256: digest }
export const module = {
  id: "curation",
  title: "미수록 사건·정보 가치 큐레이션 모듈",
  inputs: [
    "reviewed event plans",
    "previously unfeatured event references",
    "original-source score evidence",
  ],
  outputs: [
    "frozen mixed-age pool",
    "private ratings and reasons",
    "ranked selected events",
    "native writer/publication handoffs",
  ],
  operations: {
    prepare: operation(
      "오늘 관계 검토 계획과 이전 미수록 계획을 같은 후보 풀로 고정한다. 원문·판본·발표일을 유지하고 기존 기사 이력을 비교 입력으로 제공한다. 수집·추론·작성하지 않는다.",
      schema(
        {
          run_id: id,
          briefing_date: day,
          plans: {
            type: "array",
            maxItems: 40,
            items: schema({ path: file("root"), sha256: digest }, ["path", "sha256"]),
          },
          include_backlog: { type: "boolean" },
          max_articles: integer(1, 40),
        },
        ["run_id", "briefing_date", "plans"],
      ),
      prepareCuration,
    ),
    evaluate: operation(
      "동일 원문·관련 과거 기사로 모델의 미검토 점수 제안을 만들거나 명시적 큐레이터 검토를 저장한다. 신규성·영향·구체성·지식 가치·현재 유효성의 근거를 검증하며 사실/기사 승인을 하지 않는다.",
      schema(
        {
          ...pool,
          review_file: file(),
          execute: { type: "boolean" },
          candidate_ids: { type: "array", uniqueItems: true, maxItems: 500, items: digest },
          time_budget_ms: integer(1, 3600000),
          max_model_calls: integer(1, 64),
          retry_failed: { type: "boolean" },
        },
        Object.keys(pool),
      ),
      evaluateCuration,
      { model: true },
    ),
    select: operation(
      "근거·신규성·현재 유효성 조건을 통과한 후보의 점수를 유지하고 같은 우선순위·가까운 점수에서 반복/편중을 줄여 브리핑을 구성한다. 명시적으로 검토한 추가 정보와 하루·분야 상한을 적용하고 보류 후보를 보존한다.",
      schema(pool, Object.keys(pool)),
      selectCuration,
    ),
    status: operation(
      "정확한 선정/실행 참조에서 비공개 구성·고득점 보류·단계 시간·완료 재사용·원고 피드백을 읽는다. 저장 writer 예산과 호출 시간·하루 전체 시간을 구분하며 수집·모델·승인·점수 변경을 실행하지 않는다.",
      schema(
        {
          selection_path: file("root"),
          selection_sha256: digest,
          workflow_path: file("root"),
          workflow_sha256: digest,
          limit: integer(1, 100),
        },
        ["selection_path", "selection_sha256"],
      ),
      readCurationInsights,
      { readOnly: true },
    ),
    feedback: operation(
      "정확한 선정/원고 판본에 사용자 또는 편집자 피드백을 비공개로 고정한다. 유용성·이미 아는 내용·설명 부족·반복·후속 조사 요청을 보존하며 점수 정책·기사/사실 승인을 자동 변경하지 않는다.",
      schema(
        { run_id: id, selection_path: file("root"), selection_sha256: digest, review_file: file() },
        ["run_id", "selection_path", "selection_sha256", "review_file"],
      ),
      recordCurationFeedback,
    ),
    advance: operation(
      "선정된 사건만 원래 고정 회차의 native 근거 추출·작성·승인 대기로 진행한다. 완료 결과·첫 발표일을 재사용하고 여러 회차의 정확한 발행 인계를 합친다. 정본/Drive/웹 발행을 실행하지 않는다.",
      schema(
        {
          run_id: id,
          selection_path: file("root"),
          selection_sha256: digest,
          execute: { type: "boolean" },
          max_items: integer(1, 40),
          require_completeness: { type: "boolean" },
          time_budget_ms: integer(1, 3600000),
          max_model_calls: integer(1, 64),
          retry_failed: { type: "boolean" },
          retry_candidates: { type: "array", uniqueItems: true, maxItems: 40, items: digest },
          fact_reviews: { type: "object", additionalProperties: file() },
          editorial_reviews: { type: "object", additionalProperties: file() },
          revision_reviews: { type: "object", additionalProperties: file() },
          completeness_reviews: { type: "object", additionalProperties: file() },
          coverage_reviews: { type: "object", additionalProperties: file() },
          note_review_runs: { type: "array", maxItems: 64, uniqueItems: true, items: id },
        },
        ["run_id", "selection_path", "selection_sha256"],
      ),
      advanceCuration,
      { model: true },
    ),
  },
}
standalone(module, import.meta.url)
