---
title: Agent Observability
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-10-09
aliases:
  - 에이전트 관측성
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
tags:
  - AI
  - Agent
  - Observability
last_reviewed: 2026-10-09
concept_id: observability
label: 에이전트 관측성
group: 평가와 운영
keywords:
  - trace
  - span
  - 도구 호출
  - 지연
  - 오류
verified_sources:
  - https://openai.github.io/openai-agents-python/tracing/
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://prometheus.io/docs/practices/histograms/
  - https://www.langchain.com/state-of-agent-engineering
relations:
  - target: agents
    type: observes
    reason: 모델 생성·도구 호출·handoff·guardrail을 실행 기록으로 남긴다.
    basis: source
    evidence:
      - https://openai.github.io/openai-agents-python/tracing/
  - target: evaluation
    type: informs
    reason: 실행 기록은 평가에 쓰이는 증거이며 최종 환경 상태와 함께 확인한다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/tracing/
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - target: metrics
    type: informs
    reason: 개별 실행 기록과 관측 수·합계의 집계는 서로 다른 정보를 제공한다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/tracing/
      - https://prometheus.io/docs/practices/histograms/
map_review:
  decision: include
  kind: architecture
  reason: 로그만 읽는 것과 실행 추적의 trace·span 구조로 원인을 찾는 것을 구분해야 한다.
  reviewed: 2026-10-09
---

# Agent Observability

## 한 문장 정의

에이전트의 모델 생성·도구 호출·이관·검사 이벤트를 연결된 실행 기록으로 남겨, 어떤 단계가 수행됐는지 살펴보는 기능이다. [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/tracing/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 에이전트 관측성 |
| 영어 | Agent Observability |
| 구조 | 전체 워크플로를 나타내는 trace와 개별 동작을 나타내는 span |

## 범위

**포함:** 모델 생성·도구 호출·handoff·guardrail·사용자 정의 이벤트의 실행 기록. [SDK](https://openai.github.io/openai-agents-python/tracing/)

**포함하지 않음:** 기록이 있다는 사실만으로 과제 성공을 판정하는 것. 과제의 성공 기준과 실행 종료 때 환경에 남은 결과를 함께 확인한다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 핵심 구성 요소

trace는 워크플로의 처음부터 끝까지를 나타내며 여러 span으로 구성된다. span에는 시작·종료 시각, 소속 trace, 부모 span과 동작의 정보가 들어간다. [SDK](https://openai.github.io/openai-agents-python/tracing/)

## 작동 원리

SDK는 에이전트 실행에서 모델 생성·도구 호출·handoff·guardrail과 사용자 정의 이벤트를 수집한다. 같은 trace의 span들을 연결하면 실행 과정의 각 동작을 확인할 수 있다. [SDK](https://openai.github.io/openai-agents-python/tracing/)

## 혼동하기 쉬운 개념

관측성은 실행 기록을 제공하고, 에이전트 평가는 과제의 성공 기준으로 실행과 최종 결과를 채점한다. histogram과 summary가 기록하는 관측 수·합계는 개별 실행 경로와 구분한다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [SDK](https://openai.github.io/openai-agents-python/tracing/) · [Prometheus](https://prometheus.io/docs/practices/histograms/)

## 관련 개념

- [[Knowledge/AI Systems/AI Agents|AI 에이전트]] — 모델·도구·이관 동작을 실행 기록으로 연결한다. [SDK](https://openai.github.io/openai-agents-python/tracing/)
- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] — 실행 기록과 실제 최종 상태를 성공 기준에 대조한다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 최근 변화

- 2026-06-12 — LangChain의 공개 설문은 응답 조직의 89%가 에이전트 관측을 수행하고, 62%가 개별 단계·도구 호출의 상세 추적을 사용한다고 보고했다. 2025년 11월 18일부터 12월 2일까지 받은 1,340건의 응답이며 응답자의 63%는 기술 업종이었다. [[News/2253bdfec0d930ce|기사]] · [보고서](https://www.langchain.com/state-of-agent-engineering)

## 출처

- [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)
- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [LangChain · State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering)
