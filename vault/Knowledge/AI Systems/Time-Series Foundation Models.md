---
title: Time-Series Foundation Models
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-09-01
updated: 2026-09-13
aliases:
  - 시계열 파운데이션 모델
  - Time Series Foundation Models
parent_concepts: []
related_concepts:
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
tags:
  - AI
  - Forecasting
  - TimeSeries
last_reviewed: 2026-09-13
concept_id: timeseries
label: 시계열 파운데이션 모델
group: 과학과 물리 세계
keywords:
  - 시계열
  - zero-shot
  - 확률 예측
  - 토큰화
  - 시간 분할
verified_sources:
  - https://arxiv.org/abs/2403.07815
  - https://prometheus.io/docs/practices/histograms/
  - https://docs.vllm.ai/en/latest/
relations:
  - target: metrics
    type: uses
    reason: 시간 분할과 예측 평가 지표의 계산 조건을 맞춰 비교한다.
    basis: inference
    evidence:
      - https://arxiv.org/abs/2403.07815
      - https://prometheus.io/docs/practices/histograms/
  - target: inference
    type: uses
    reason: 예측 모델도 실행 자원과 요청 처리 기반 위에서 동작한다.
    basis: inference
    evidence:
      - https://arxiv.org/abs/2403.07815
      - https://docs.vllm.ai/en/latest/
map_review:
  decision: include
  kind: model
  reason: 시계열 사전학습과 새 데이터로의 전이가 일반적인 개별 예측 모델과 어떻게 다른지 배워야 한다.
  reviewed: 2026-09-13
---

# Time-Series Foundation Models

## 한 문장 정의

여러 시계열에서 사전학습한 패턴을 이용해 새로운 시계열의 예측 등에 전이하는 모델이다. [Ansari et al. · Chronos](https://arxiv.org/abs/2403.07815)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 시계열 파운데이션 모델 |
| 영어 | Time-Series Foundation Models |
| 키워드 | 시계열 · zero-shot · 확률 예측 · 토큰화 · 시간 분할 |

## 범위

**포함:** 다양한 시간순 관측의 사전학습과 zero-shot 또는 적응 예측.

**포함하지 않음:** 관측 순서를 무시한 일반 텍스트 분류나 모든 시계열의 우월 성능 보증.

## 왜 중요한가

다양한 과거 시계열에서 얻은 패턴을 새로운 예측 문제에 활용해 데이터별 학습 부담을 줄이는 접근이다.

## 핵심 구성 요소

- 시계열
- zero-shot
- 확률 예측
- 토큰화
- 시간 분할

## 작동 원리

Chronos는 값을 스케일링·양자화해 토큰으로 표현하고 확률적 예측을 학습한다. 학습에 포함되지 않은 데이터셋에서도 예측을 평가한다. [Ansari et al. · Chronos](https://arxiv.org/abs/2403.07815)

## 실제 예시

신규 수요 시계열에 사전학습 모델을 적용하고 해당 업무의 단순 기준선과 비교하는 사용 예.

## 한계와 실패 조건

분포 변화와 학습 데이터 중복이 평가를 왜곡할 수 있다. 시간 순서에 맞춘 분할과 불확실성 점검이 필요하다.

## 혼동하기 쉬운 개념

시계열 전용 사전학습 모델과 특정 한 데이터에 맞춘 예측 모델은 학습 범위가 다르다.

## 관련 개념

- → 활용: [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 시간 분할과 예측 평가 지표의 계산 조건을 맞춰 비교한다. (해석; [근거](https://arxiv.org/abs/2403.07815) · [근거](https://prometheus.io/docs/practices/histograms/))
- → 활용: [[Knowledge/AI Systems/AI Inference Infrastructure#한 문장 정의|AI 추론 인프라]] — 예측 모델도 실행 자원과 요청 처리 기반 위에서 동작한다. (해석; [근거](https://arxiv.org/abs/2403.07815) · [근거](https://docs.vllm.ai/en/latest/))

## 최근 변화

- 2026-08-31 — Google Research는 여러 목표·과거 공변량·알려진 미래 공변량을 zero-shot으로 처리하고 전체 예측 구간을 한 번에 복원하는 TimesFM-3를 공개했습니다. 공급자 보고 기준으로 세 공개 벤치마크에서 비교 사전학습 모델 중 평균 순위가 가장 높았습니다. [source]

## 출처

- [Ansari et al. · Chronos](https://arxiv.org/abs/2403.07815)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [vLLM · Serving](https://docs.vllm.ai/en/latest/)
