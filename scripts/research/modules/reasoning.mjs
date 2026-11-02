import { operation, schema, id, integer, file, standalone } from "./contracts.mjs"
import {
  reasoningTasks,
  readReasoningTask,
  submitReasoningResult,
  executeReasoningTask,
  readReasoningBatch,
  submitReasoningBatch,
  retireReasoningTask,
} from "../reasoning-tasks.mjs"
import { planRelayBatch, planRelayRequest } from "../relay-scheduling.mjs"
import { recordRelayAssignment, recordRelayExit, recordRelayObservation } from "../relay-ledger.mjs"

const task = { type: "string", pattern: "^reasoning-[a-f0-9]{64}$" }
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" }
const reference = { task_id: task, request_sha256: hash }
const storedReference = schema({ path: file("root"), sha256: hash }, ["path", "sha256"])
const actor = { type: "string", minLength: 1, maxLength: 200 }
const actorHistory = {
  type: "array",
  maxItems: 100,
  items: schema(
    { writer_run: id, actors: { type: "array", maxItems: 100, uniqueItems: true, items: actor } },
    ["writer_run", "actors"],
  ),
}
const historyMap = (rows) => {
  const result = Object.create(null)
  for (const row of rows) {
    if (Object.hasOwn(result, row.writer_run)) throw Error("Duplicate article actor history")
    result[row.writer_run] = row.actors
  }
  return result
}
const lanes = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  items: schema(
    {
      id: integer(1, 3),
      agent: actor,
      phase: { anyOf: [actor, { type: "null" }] },
      busy: { anyOf: [{ type: "boolean" }, actor, { type: "null" }] },
      retiring: { type: "boolean" },
    },
    ["id", "agent", "phase", "busy", "retiring"],
  ),
}
export const module = {
  id: "reasoning",
  title: "추론 수행자 교체 모듈",
  inputs: ["exact source-bound reasoning task and output schema"],
  outputs: ["pending task", "validated executor result without factual approval"],
  operations: {
    relay_observe: operation(
      "Codex가 전달한 실행자 시작·종료 관측을 기록한다. 호스트가 실행자 신원을 인증했다는 의미는 아니다.",
      schema({ round_id: id, event: { type: "string", enum: ["started", "completed"] }, agent: actor,
        lane: integer(1, 3), generation: integer(1, 1000000), model: actor, thinking: actor,
        observed_at: { type: "string", minLength: 1, maxLength: 64 }, evidence: storedReference },
        ["round_id", "event", "agent", "lane", "generation", "observed_at"]),
      (ctx, p) => recordRelayObservation(ctx.root, p),
    ),
    relay_assign: operation(
      "현재 회차의 원 소유 기사 요청과 실행자·슬롯을 불변 기록한다. 실행자 식별은 호출자 선언으로 보존한다.",
      schema({ ...reference, agent: actor, lane: integer(1, 3), generation: integer(1, 1000000), observation: storedReference },
        [...Object.keys(reference), "agent", "lane", "generation", "observation"]),
      (ctx, p) => recordRelayAssignment(ctx.root, p),
    ),
    relay_exit: operation(
      "완료된 Codex 실행자 관측을 보존하고 같은 슬롯의 다음 실행자를 허용한다.",
      schema({ round_id: id, agent: actor, lane: integer(1, 3), generation: integer(1, 1000000), observation: storedReference },
        ["round_id", "agent", "lane", "generation", "observation"]),
      (ctx, p) => recordRelayExit(ctx.root, p),
    ),
    plan_relay: operation(
      "원 소유 job의 요청을 확인하고 실행자별 작성·검토 분리를 지키는 중계 배정을 제안한다.",
      schema(
        {
          ...reference,
          lanes,
          writers: actorHistory,
          reviewers: actorHistory,
        },
        [...Object.keys(reference), "lanes", "writers", "reviewers"],
      ),
      (ctx, p) =>
        planRelayRequest(ctx.root, {
          ...p,
          writers: historyMap(p.writers),
          reviewers: historyMap(p.reviewers),
        }),
      { readOnly: true },
    ),
    plan_relay_batch: operation(
      "최대3개 소유 요청을 함께 확인해 기존 기사 검토 문맥을 우선 재사용하는 중계 배정을 제안한다.",
      schema(
        {
          requests: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: schema(reference, Object.keys(reference)),
          },
          lanes,
          writers: actorHistory,
          reviewers: actorHistory,
        },
        ["requests", "lanes", "writers", "reviewers"],
      ),
      (ctx, p) =>
        planRelayBatch(ctx.root, {
          ...p,
          writers: historyMap(p.writers),
          reviewers: historyMap(p.reviewers),
        }),
      { readOnly: true },
    ),
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
                relay_assignment: storedReference,
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
          relay_assignment: storedReference,
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
