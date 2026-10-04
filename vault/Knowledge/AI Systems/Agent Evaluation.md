---
title: Agent Evaluation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-28
aliases:
  - 에이전트 평가
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]"
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
tags:
  - AI
  - Agent
  - Evaluation
last_reviewed: 2026-09-28
concept_id: evaluation
label: 에이전트 평가
group: 평가와 운영
keywords:
  - 평가 과제
  - trial
  - grader
  - 성공 기준
  - outcome
verified_sources:
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://openai.github.io/openai-agents-python/tracing/
  - https://prometheus.io/docs/practices/histograms/
relations:
  - target: agents
    type: evaluates
    reason: 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - target: observability
    type: uses
    reason: 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
      - https://openai.github.io/openai-agents-python/tracing/
  - target: metrics
    type: uses
    reason: 동일한 과제·시도 조건의 평가 결과를 집계한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
      - https://prometheus.io/docs/practices/histograms/
map_review:
  decision: include
  kind: evaluation
  reason: 과제·반복 시도·채점기·최종 환경 상태를 구분하는 평가 방법을 배울 필요가 있다.
  reviewed: 2026-09-28
---

# Agent Evaluation

## 한 문장 정의

도구를 사용하며 여러 단계로 환경을 바꾸는 AI 에이전트의 실행 과정과 최종 결과를, 과제에 정한 성공 기준으로 평가하는 방법이다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 에이전트 평가 |
| 영어 | Agent Evaluation |
| 평가 단위 | 과제와 그 과제를 실행한 개별 시도 |
| 핵심 증거 | 실행 기록과 최종 환경 상태 |

## 범위

**포함:** 에이전트의 도구 사용, 여러 단계의 실행 기록과 실제 최종 환경 상태를 성공 기준에 대조하는 평가.

**포함하지 않음:** 에이전트가 완료했다고 답변한 것만으로 작업 성공을 판정하는 방식. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 왜 중요한가

같은 과제에서도 실행마다 모델의 출력이 달라질 수 있어 여러 시도의 결과를 확인한다. 고정된 과제 묶음은 변경 전후의 지연 시간·토큰 사용량·과제당 비용·오류율을 추적하는 기준선이 된다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 핵심 구성 요소

| 요소 | 의미 |
|---|---|
| Task · 과제 | 입력과 성공 기준을 정한 시험 |
| Trial · 시도 | 과제를 한 번 실행한 결과 |
| Grader · 채점기 | 수행의 일부를 판정하는 논리 |
| Transcript · 실행 기록 | 출력·도구 호출·중간 결과 등 시도의 기록 |
| Outcome · 최종 결과 | 시도가 끝났을 때 환경에 남은 상태 |

한 과제에 여러 채점기를 두고, 각 채점기에 여러 검사를 포함할 수 있다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 작동 원리

입력과 성공 기준을 정한 과제를 반복 실행하고, 각 시도의 기록과 최종 상태를 채점한다. 코드 기반 검사, 모델 기반 평가와 사람 평가를 과제에 맞게 조합한다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

OpenAI Agents SDK의 tracing은 LLM 생성, 도구 호출, handoff, guardrail과 사용자 정의 이벤트를 수집한다. 이 기록은 에이전트가 어떤 경로로 결과에 도달했는지 살펴볼 자료가 된다. [원문](https://openai.github.io/openai-agents-python/tracing/)

Prometheus의 histogram과 summary는 관측 수와 관측값의 합계를 기록한다. 같은 기간에 대한 수와 합계의 변화율을 집계한 뒤 나눠 평균 요청 시간을 계산한다. [원문](https://prometheus.io/docs/practices/histograms/)

## 실제 예시

코딩 에이전트는 결과의 통과·실패 검사와 함께 생성 코드의 품질, 도구 호출이나 사용자와의 상호작용을 실행 기록으로 평가할 수 있다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

연구 에이전트에서는 주장이 검색한 자료의 근거와 맞는지, 필요한 사실을 빠뜨리지 않았는지, 출처가 신뢰할 만한지, 종합 설명이 일관적인지를 구별해 확인한다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 한계와 실패 조건

항공편 예약 에이전트가 답변에서 예약을 완료했다고 말해도, 실제 예약이 데이터베이스에 존재하는지는 별도로 확인한다. 실행 기록의 마지막 문장과 환경의 최종 상태는 서로 다른 평가 증거다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 혼동하기 쉬운 개념

실행 기록은 시도에서 일어난 일을 보존한다. 채점기는 그 기록이나 최종 결과를 성공 기준에 따라 판정한다. 기록을 수집하는 기능과 수행을 평가하는 기준은 각각 설계한다. [원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [원문](https://openai.github.io/openai-agents-python/tracing/)

## 관련 개념

- → 평가: [[Knowledge/AI Systems/AI Agents|AI 에이전트]] — 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- → 활용: [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] — 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://openai.github.io/openai-agents-python/tracing/))
- → 활용: [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]] — 동일한 과제·시도 조건의 평가 결과를 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/))

## 최근 변화

없음

## 출처

- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
