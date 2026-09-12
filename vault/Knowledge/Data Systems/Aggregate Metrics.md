---
title: Aggregate Metrics
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Data Systems
created: 2026-09-05
updated: 2026-09-13
aliases:
  - 집계 지표
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
  - "[[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
  - "[[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]]"
  - "[[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]]"
tags:
  - Data
  - Metrics
last_reviewed: 2026-09-13
concept_id: metrics
label: 집계 지표
group: 평가와 운영
keywords:
  - 집계
  - 모집단
  - 히스토그램
  - 분위수
  - p95
  - 분모
verified_sources:
  - https://prometheus.io/docs/practices/histograms/
  - https://opentelemetry.io/docs/concepts/signals/metrics/
relations: []
---

# Aggregate Metrics

## 한 문장 정의

여러 관측을 같은 모집단·시간 구간·계산 규칙으로 묶어 수치나 분포로 요약한 지표다. [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/) · [OpenTelemetry · Metrics](https://opentelemetry.io/docs/concepts/signals/metrics/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 집계 지표 |
| 영어 | Aggregate Metrics |
| 키워드 | 집계 · 모집단 · 히스토그램 · 분위수 · p95 · 분모 |

## 범위

**포함:** 횟수, 합계, 평균, 비율, 히스토그램과 적절히 계산한 분위수.

**포함하지 않음:** 관측 조건이 다른 값을 임의로 더하거나 분위수 자체를 평균하는 계산.

## 왜 중요한가

많은 실행을 비교 가능한 형태로 요약하되 평균에 가려진 느린 요청과 실패를 살펴볼 수 있게 한다.

## 핵심 구성 요소

- 집계
- 모집단
- 히스토그램
- 분위수
- p95
- 분모

## 작동 원리

관측 단위와 레이블을 정하고 집계한다. 합계와 건수로 전체 평균을 계산할 수 있지만 서버별 p95를 평균해 전체 p95를 얻을 수는 없다. [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/) · [OpenTelemetry · Metrics](https://opentelemetry.io/docs/concepts/signals/metrics/)

## 실제 예시

서버들의 히스토그램을 합친 뒤 전체 요청 지연 분포를 계산한다.

## 한계와 실패 조건

평균은 느린 꼬리와 작은 집단의 실패를 숨길 수 있다. 분모·시간창·집단 구성이 달라지면 같은 이름의 지표도 비교가 어렵다.

## 혼동하기 쉬운 개념

trace는 개별 실행 경로이며 집계 지표는 여러 실행의 요약이다.

## 관련 개념

- ← 활용: [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 동일한 과제·시도 조건의 평가 결과를 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/))
- ← 근거 제공: [[Knowledge/AI Systems/Agent Observability#한 문장 정의|에이전트 관측성]] — 개별 실행에서 수집한 관측을 운영 지표로 집계할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://opentelemetry.io/docs/concepts/signals/metrics/))
- ← 활용: [[Knowledge/AI Systems/AI Inference Infrastructure#한 문장 정의|AI 추론 인프라]] — 서빙 성능을 지연 분포와 처리량으로 비교한다. (해석; [근거](https://docs.vllm.ai/en/latest/) · [근거](https://prometheus.io/docs/practices/histograms/))
- ← 활용: [[Knowledge/AI Systems/Enterprise AI Operating Model#한 문장 정의|기업 AI 운영 모델]] — 성과를 볼 때 사용량과 과제 성공 기준을 구분해 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/))
- ← 활용: [[Knowledge/AI Systems/Time-Series Foundation Models#한 문장 정의|시계열 파운데이션 모델]] — 시간 분할과 예측 평가 지표의 계산 조건을 맞춰 비교한다. (해석; [근거](https://arxiv.org/abs/2403.07815) · [근거](https://prometheus.io/docs/practices/histograms/))

## 최근 변화

- 2026-09-11 — GitHub는 VS Code Agents 전용 창 지표를 다른 Agent Mode와 분리하고 결측은 생략 또는 null로 유지한다고 명시했습니다. 집계 대상과 결측 규칙을 보존해야 비교가 성립합니다. [source](https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/) [관련 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)

- 2026-09-04 — GitHub가 개인 stargazer 신원 없이 별 이력을 제공하는 API를 발표했습니다. 개별 신원 공개와 시간별 관심도 관찰을 분리한 구현 사례입니다. [source](https://github.blog/changelog/2026-09-04-new-api-endpoint-provides-privacy-safe-star-history-data/)

## 출처

- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [OpenTelemetry · Metrics](https://opentelemetry.io/docs/concepts/signals/metrics/)
