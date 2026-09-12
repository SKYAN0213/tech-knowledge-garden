---
title: Agent Observability
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-13
aliases:
  - 에이전트 관측성
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]"
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
tags:
  - AI
  - Agent
  - Observability
last_reviewed: 2026-09-13
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
  - https://openai.github.io/openai-agents-python/agents/
  - https://opentelemetry.io/docs/concepts/signals/metrics/
relations:
  - target: agents
    type: observes
    reason: 모델 호출·도구 사용·이관으로 구성된 실행을 추적한다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/tracing/
      - https://openai.github.io/openai-agents-python/agents/
  - target: metrics
    type: informs
    reason: 개별 실행에서 수집한 관측을 운영 지표로 집계할 수 있다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/tracing/
      - https://opentelemetry.io/docs/concepts/signals/metrics/
---

# Agent Observability

## 한 문장 정의

에이전트 실행의 모델 호출·도구 사용·이관·오류를 연결된 기록으로 남겨 경로와 원인을 살펴보는 능력이다. [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 에이전트 관측성 |
| 영어 | Agent Observability |
| 키워드 | trace · span · 도구 호출 · 지연 · 오류 |

## 범위

**포함:** 하나의 trace를 구성하는 span과 실행 문맥, 지연·오류 등 운영 증거.

**포함하지 않음:** 기록의 존재만으로 작업 품질이나 규정 준수를 인증하는 일.

## 왜 중요한가

실패나 지연을 모델·도구·이관 중 어느 단계에서 찾을지 좁힐 수 있다. 개별 실행의 증거를 품질 평가와 운영 점검에 제공한다.

## 핵심 구성 요소

- trace
- span
- 도구 호출
- 지연
- 오류

## 작동 원리

작업별 trace 안에 시작·종료 시각과 부모 span을 기록한다. 모델·도구·이관 이벤트를 연결해 실행 경로를 재구성한다. [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)

## 실제 예시

응답 지연을 모델 처리와 검색 도구 대기로 나누어 추적한다.

## 한계와 실패 조건

기록 누락과 샘플링은 원인 분석을 제한한다. 입력·음성 같은 민감한 데이터의 수집 범위도 따로 정해야 한다.

## 혼동하기 쉬운 개념

집계 지표는 여러 실행을 요약하고 trace는 개별 실행의 연결을 보여준다.

## 관련 개념

- ← 활용: [[Knowledge/AI Systems/Conversational Voice AI#한 문장 정의|대화형 음성 AI]] — 음성 처리와 업무 실행의 단계를 추적으로 연결한다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/tracing/))
- → 관측: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 모델 호출·도구 사용·이관으로 구성된 실행을 추적한다. (해석; [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://openai.github.io/openai-agents-python/agents/))
- ← 활용: [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://openai.github.io/openai-agents-python/tracing/))
- → 근거 제공: [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 개별 실행에서 수집한 관측을 운영 지표로 집계할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://opentelemetry.io/docs/concepts/signals/metrics/))

## 최근 변화

- 2026-09-06 — OpenAI 수석과학자는 내부 평가상 추론 과정 감시에 대한 의존 가능성이 감소한다고 설명했습니다. 언어화된 추론 기록이 모든 행동을 설명한다는 보장은 없으며 실제 도구·환경 기록과의 교차 확인이 필요합니다. 감소 폭의 독립 검증은 이 글에서 확인되지 않습니다. [source](https://openai.com/index/an-alien-mind/)
- 2026 — OpenAI Agents SDK는 모델 생성, 도구 호출, handoff, guardrail, 사용자 정의 사건을 trace와 span으로 기록하고 민감 데이터 캡처를 끌 수 있는 설정을 제공합니다.

## 출처

- [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)
- [OpenAI Agents SDK · Agents](https://openai.github.io/openai-agents-python/agents/)
- [OpenTelemetry · Metrics](https://opentelemetry.io/docs/concepts/signals/metrics/)
