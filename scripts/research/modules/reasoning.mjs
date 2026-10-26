import { operation, schema, id, integer, standalone } from "./contracts.mjs"
import {
  reasoningTasks,
  readReasoningTask,
  submitReasoningResult,
  executeReasoningTask,
  readReasoningBatch,
  submitReasoningBatch,
  retireReasoningTask,
} from "../reasoning-tasks.mjs"

const task = { type: "string", pattern: "^reasoning-[a-f0-9]{64}$" }
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const reference = { task_id: task, request_sha256: hash }
export const module = {
  id: "reasoning",
  title: "추론 수행자 교체 모듈",
  inputs: ["exact source-bound reasoning task and output schema"],
  outputs: ["pending task", "validated executor result without factual approval"],
  operations: {
    read_batch: operation(
      "최대3개 요청을 각 SHA와 페이지 범위로 읽는다.",
      schema(
        {
          requests: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: schema(
              { ...reference, offset: integer(0, 2000000), limit: integer(1, 64000) },
              Object.keys(reference),
            ),
          },
        },
        ["requests"],
      ),
      (ctx, p) => readReasoningBatch(ctx.root, p),
      { readOnly: true },
    ),
    submit_batch: operation(
      "최대3개 독립 결과를 병렬 제출하고 준비된 소유 job을 반환한다. 실패한 항목과 완료 항목을 보존한다.",
      schema(
        {
          results: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: schema(
              {
                ...reference,
                output: {},
                executor: { type: "string", enum: ["codex"] },
                model: { type: "string", minLength: 1, maxLength: 200 },
              },
              [...Object.keys(reference), "output", "executor", "model"],
            ),
          },
        },
        ["results"],
      ),
      (ctx, p) => submitReasoningBatch(ctx.root, p),
    ),
    retire: operation(
      "폐기 요청을 불변 기록으로 실행 목록에서 제외한다.",
      schema({ ...reference, reason: { type: "string", minLength: 1, maxLength: 1000 } }, [
        ...Object.keys(reference),
        "reason",
      ]),
      (ctx, p) => retireReasoningTask(ctx.root, p),
    ),
    pending: operation(
      "Codex 위임 결과가 필요한 추론 작업을 조회한다. 원문을 다시 수집하지 않는다.",
      schema({
        run_id: id,
        job_id: id,
        round_id: id,
        offset: integer(0, 1000000),
        limit: integer(1, 100),
      }),
      (ctx, p) => reasoningTasks(ctx.root, p),
      { readOnly: true },
    ),
    read: operation(
      "정확한 SHA로 고정된 원문 입력·출력 Schema를 페이지별로 읽는다.",
      schema(
        { ...reference, offset: integer(0, 2000000), limit: integer(1, 64000) },
        Object.keys(reference),
      ),
      (ctx, p) => readReasoningTask(ctx.root, p),
      { readOnly: true },
    ),
    submit: operation(
      "Codex가 작성한 정형 결과를 고정 요청에 제출한다. 잘못된 형식·변경된 입력·다른 결과 덮어쓰기를 거부하며 사실/편집 승인을 하지 않는다.",
      schema(
        {
          ...reference,
          output: {},
          executor: { type: "string", enum: ["codex"] },
          model: { type: "string", minLength: 1, maxLength: 200 },
        },
        [...Object.keys(reference), "output", "executor"],
      ),
      (ctx, p) => submitReasoningResult(ctx.root, p),
    ),
    execute: operation(
      "고정된 위임 작업을 로컬 Ollama가 대신 수행해 같은 출력 계약에 제출한다. 완료 결과는 재사용한다.",
      schema(
        { ...reference, model: { type: "string", minLength: 1, maxLength: 200 } },
        Object.keys(reference),
      ),
      executeReasoningTask,
      { model: true },
    ),
  },
}
standalone(module, import.meta.url)
