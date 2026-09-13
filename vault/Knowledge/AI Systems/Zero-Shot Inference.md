---
title: Zero-Shot Inference
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-09-13
updated: 2026-09-13
last_reviewed: 2026-09-13
aliases:
  - 제로샷 추론
  - 제로샷
  - zero-shot
  - zero shot
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]]"
tags:
  - Technology
concept_id: zero-shot
label: 제로샷 추론
group: 과학과 물리 세계
keywords:
  - 사전학습
  - 새 과제 적용
  - 추가 학습 없음
verified_sources:
  - https://arxiv.org/abs/2403.07815
map_review:
  decision: include
  kind: evaluation
  reason: 추가 학습 없이 새 데이터에 적용한다는 조건을 모델의 정확도나 학습 데이터 부재와 혼동하지 않도록 익혀야 한다.
  reviewed: 2026-09-13
connections:
  - target: timeseries
    reason: 사전학습한 시계열 모델을 새 데이터셋에 추가 학습 없이 적용할 때 사용하는 평가 조건이다.
    evidence:
      - https://arxiv.org/abs/2403.07815
---

# Zero-Shot Inference

## 한 문장 정의

여기서 제로샷 추론은 새 대상 데이터셋에 맞춘 추가 학습 없이 사전학습 모델을 적용하는 조건을 뜻한다. [Chronos 논문](https://arxiv.org/abs/2403.07815)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 제로샷 추론 |
| 영어 | Zero-Shot Inference |
| 키워드 | 사전학습 · 새 과제 적용 · 추가 학습 없음 |

## 범위

**포함:** 시계열 뉴스에서 새 데이터셋에 추가 학습 없이 예측하는 경우.

**포함하지 않음:** 모든 분야에서 동일하게 쓰이는 평가 설정이라는 가정.

## 왜 중요한가

새로운 업무마다 모델을 다시 학습해야 하는지 판단하는 데 필요하다. 제로샷이라는 말만으로 정확도 우위를 알 수는 없다.

## 핵심 구성 요소

- 사전학습된 모델
- 새 대상 데이터셋
- 추가 학습 여부와 명시된 평가 조건

## 작동 원리

Chronos는 여러 시계열에서 사전학습한 패턴을 활용해 학습에 포함되지 않은 데이터셋에서도 예측을 평가했다. 새 데이터에 맞춰 가중치를 다시 학습하지 않는 조건이다.

## 실제 예시

사전학습된 예측 모델에 처음 접하는 시계열의 과거 관측값을 넣어 이후 값을 예측한다.

## 한계와 실패 조건

제로샷도 입력 데이터가 필요하다. 특정 벤치마크 결과가 모든 새로운 데이터에서 같은 성능을 보장하지 않는다.

## 혼동하기 쉬운 개념

미세조정은 대상 데이터로 가중치를 추가 학습한다. 제로샷은 그 학습을 하지 않는 조건이며, 사전학습 자체가 없다는 뜻이 아니다.

## 관련 개념

- [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] — 사전학습한 시계열 모델을 새 데이터셋에 추가 학습 없이 적용할 때 사용하는 평가 조건이다.

## 최근 변화

없음

## 출처

- [Chronos: Learning the Language of Time Series](https://arxiv.org/abs/2403.07815)
