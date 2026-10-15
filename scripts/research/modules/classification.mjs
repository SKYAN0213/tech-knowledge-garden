import { operation, schema, id, text, file, integer, standalone } from "./contracts.mjs"
import { readBacklog } from "../../research-window.mjs"
import {
  projectIntakeOntology,
  summarizeIntakeOntology,
  relatedCandidateKeys,
} from "../intake-ontology.mjs"
import { processDailyQueue } from "../daily-processing-queue.mjs"
import { editionReference } from "./edition.mjs"
import { proposeEditionEvents, reviewEditionEvents } from "../event-pipeline.mjs"
import { extractEditionEventProposals } from "../event-inference.mjs"
import { digest } from "../event-pipeline.mjs"

export const module = {
  id: "classification",
  title: "분류·중복 관계 모듈",
  inputs: [
    "frozen edition",
    "source-based relation reviews",
    "candidate backlog",
    "frozen daily handoff",
  ],
  outputs: [
    "unreviewed event proposals",
    "reviewed event plan",
    "intake ontology",
    "native processing queue plan",
  ],
  operations: {
    extract: operation(
      "고정 회차의 원문을 읽어 최소 사건 후보를 모델로 구조화한다. 원문·블록·추출 정책별 재사용과 페이지 재개를 지원하며 사실 검토나 작성 승인을 하지 않는다.",
      schema(
        {
          run_id: id,
          ...editionReference,
          material_ids: { type: "array", minItems: 1, maxItems: 500, items: digest },
          offset: integer(0, 1000000),
          max_items: integer(1, 40),
        },
        ["run_id", ...Object.keys(editionReference)],
      ),
      extractEditionEventProposals,
      { model: true },
    ),
    plan: operation(
      "고정 회차에서 원문별 최소 사건 검토 후보를 만든다. 제목·날짜·판본·원문 블록 접근을 제공하며 서로 다른 원문을 자동 병합하거나 writer를 호출하지 않는다.",
      schema(editionReference, Object.keys(editionReference)),
      proposeEditionEvents,
      { readOnly: true },
    ),
    review: operation(
      "원문 블록·정확한 인용·주체/행위/대상/날짜와 기존 승인 사건을 대조한 관계 판정을 저장한다. same_event·보충·후속·정정·재사용·보류를 구분하며 기사 승인은 하지 않는다.",
      schema({ run_id: id, ...editionReference, review_file: file() }, [
        "run_id",
        ...Object.keys(editionReference),
        "review_file",
      ]),
      reviewEditionEvents,
    ),
    inspect: operation(
      "후보의 URL·본문·제목/날짜 관계와 검토 대상을 조회한다. 유사성을 같은 사건으로 확정하지 않고 작성기를 호출하지 않는다.",
      schema({ candidate_key: text }),
      (ctx, p) => {
        const backlog = readBacklog(ctx.backlog)
        if (!backlog) throw Error("Stored candidate backlog required")
        const ontology = projectIntakeOntology(backlog.candidates)
        return {
          summary: summarizeIntakeOntology(ontology),
          ...(p.candidate_key
            ? { related_candidate_keys: relatedCandidateKeys(ontology, p.candidate_key) }
            : {}),
          ontology,
        }
      },
      { readOnly: true },
    ),
    queue: operation(
      "고정된 회차 수집 입력을 읽어 기존 처리 큐의 계획을 저장한다. 수집·추론·작성·후보 승인을 실행하지 않는다.",
      schema(
        { run_id: id, daily_run: id, collection_basis: file("root"), limit: integer(1, 500) },
        ["run_id", "daily_run", "collection_basis"],
      ),
      (ctx, p) =>
        processDailyQueue({
          root: ctx.root,
          runId: p.run_id,
          dailyRunId: p.daily_run,
          collectionBasis: p.collection_basis,
          policyFile: ctx.policy,
          backlogFile: ctx.backlog,
          vault: ctx.vault,
          limit: p.limit ?? 40,
          execute: false,
        }),
    ),
  },
}
standalone(module, import.meta.url)
