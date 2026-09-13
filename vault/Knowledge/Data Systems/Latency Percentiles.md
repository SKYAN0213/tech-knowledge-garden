---
title: Latency Percentiles
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Data Systems
created: 2026-09-13
updated: 2026-09-13
last_reviewed: 2026-09-13
aliases:
  - p95·p99 지연
  - 지연 백분위수
  - p95
  - p99
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
  - "[[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]"
tags:
  - Technology
concept_id: latency-percentiles
label: p95·p99 지연
group: 평가와 운영
keywords:
  - 지연 분포
  - 백분위수
  - 꼬리 지연
verified_sources:
  - https://prometheus.io/docs/practices/histograms/
map_review:
  decision: include
  kind: metric
  reason: 평균이 숨기는 느린 요청을 백분위수로 해석하고 서로 다른 집계의 p95·p99를 잘못 평균 내지 않도록 배워야 한다.
  reviewed: 2026-09-13
connections:
  - target: inference
    reason: 모델 서빙의 느린 요청 구간을 지연 분포로 평가할 때 사용한다.
    evidence:
      - https://prometheus.io/docs/practices/histograms/
  - target: observability
    reason: 실행 과정에서 수집한 지연을 분포로 집계해 느린 요청이 얼마나 발생하는지 확인한다.
    evidence:
      - https://prometheus.io/docs/practices/histograms/
---

# Latency Percentiles

## 한 문장 정의

요청 시간 분포에서 p95와 p99는 각각 관측의 약 95%와 99%가 그 이하에 놓이는 지연 값이다. [Prometheus](https://prometheus.io/docs/practices/histograms/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 지연 백분위수 |
| 영어 | Latency Percentiles |
| 키워드 | 지연 분포 · 백분위수 · 꼬리 지연 |

## 범위

**포함:** 같은 측정 구간과 모집단에서 계산한 요청 시간 분포.

**포함하지 않음:** 요청의 성공률이나 모든 요청의 최대 지연.

## 왜 중요한가

평균이 낮아도 일부 요청은 오래 걸릴 수 있다. 백분위수는 분포의 느린 쪽을 읽는 데 쓰인다.

## 핵심 구성 요소

- 요청 시간 표본
- 측정 구간과 모집단
- 백분위수 계산법 또는 히스토그램 구간

## 작동 원리

요청 시간을 작은 값부터 정렬한 분포에서 해당 비율의 경계를 찾는다. 히스토그램을 쓰면 구간별 개수로 근삿값을 계산한다.

## 실제 예시

p99가 2초라는 측정은 약 99%의 요청이 2초 이내였다는 뜻이다. 모든 요청이 2초 이내라는 보장은 아니다.

## 한계와 실패 조건

서버별 p99를 단순 평균하면 전체 요청의 p99가 되지 않는다. 히스토그램 구간과 측정 시간에 따라 근사 오차도 달라진다.

## 혼동하기 쉬운 개념

평균은 모든 값을 더해 나눈 값이다. p95·p99는 순위 경계이며 최대값과도 다르다.

## 관련 개념

- [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] — 모델 서빙의 느린 요청 구간을 지연 분포로 평가할 때 사용한다.
- [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] — 실행 과정에서 수집한 지연을 분포로 집계해 느린 요청이 얼마나 발생하는지 확인한다.

## 최근 변화

없음

## 출처

- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
