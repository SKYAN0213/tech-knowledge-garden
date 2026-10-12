---
title: High Performance Linpack
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Research Methods
group: 병렬 계산 성능 평가
concept_id: high-performance-linpack
label: HPL
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - HPL
keywords:
  - 배정밀도 선형대수 평가
parent_concepts: []
related_concepts: []
tags:
  - Computing
  - Benchmark
verified_sources:
  - https://www.netlib.org/benchmark/hpl/
  - https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/
connections: []
map_review:
  decision: include
  kind: metric
  reason: 분산 메모리 시스템의 배정밀도 선형대수 계산을 측정하는 전문 벤치마크다.
  reviewed: 2026-10-09
---

# High Performance Linpack

## 한 문장 정의

HPL은 분산 메모리 컴퓨터에서 64비트 배정밀도로 밀집 선형 연립방정식을 풀고 정확도와 계산 시간을 측정하는 벤치마크 구현이다. [Netlib 설명](https://www.netlib.org/benchmark/hpl/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 영어 | High Performance Linpack |
| 약어 | HPL |

## 범위

**포함:** 배정밀도 밀집 선형대수 문제를 분산 메모리 시스템에서 푸는 계산.

**포함하지 않음:** 이론상 최대 성능과 혼합 정밀도 HPL-MxP 측정 성능. TOP500은 이 값들을 HPL 측정 성능과 구분한다. [Netlib](https://www.netlib.org/benchmark/hpl/) · [TOP500](https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/)

## 작동 원리

행렬을 2차원 블록 순환 방식으로 나누고, 부분 피벗을 적용한 LU 분해와 역대입으로 해를 계산한다. MPI와 BLAS 또는 VSIPL 구현을 사용하며, 계산 결과와 걸린 시간을 측정한다. [Netlib](https://www.netlib.org/benchmark/hpl/)

## 혼동하기 쉬운 개념

이론상 최대 성능은 HPL에서 실제 측정한 값과 다르다. 혼합 정밀도 HPL-MxP도 별도 평가다. 2026년 6월 TOP500 발표에서 LineShine은 HPL 1위, HPL-MxP 4위였다. [TOP500](https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/)

## 최근 변화

- **2026-06-23:** TOP500은 CPU 기반 LineShine의 HPL 성능을 2.198 엑사플롭/초로 발표했다. 6월 29일(한국시간) 후속 보도 기사에서 발표일·측정 정밀도·전력·별도 평가 순위를 함께 기록한다. [기사](../../News/642dca497b289b98.md) · [원문](https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/)

## 출처

- [Netlib · HPL 정의와 알고리즘](https://www.netlib.org/benchmark/hpl/)
- [TOP500 · 2026년 6월 발표](https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/)
