---
title: Hierarchical Fuzzy Neural Network (Fabric Grasping)
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Robotics
group: Robotics
concept_id: fabric-grasping-hfnn
label: 옷감 집기용 HFNN
created: 2026-10-06
updated: 2026-10-06
last_reviewed: 2026-10-06
aliases: []
keywords:
  - HFNN
  - Hierarchical Fuzzy Neural Network
  - 집기 자세 평가
  - 퍼지 규칙
parent_concepts: []
related_concepts: []
tags:
  - Robotics
  - AI
verified_sources:
  - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full
relations: []
connections: []
map_review:
  decision: include
  kind: model
  reason: 공식 논문에서 이름과 원리를 확인한 집기 자세 평가 모델이다. 같은 명칭을 쓰는 다른 모델과 혼동하지 않도록 적용 범위를 명시한다.
  reviewed: 2026-10-06
---

# Hierarchical Fuzzy Neural Network (Fabric Grasping)

## 한 문장 정의

옷감 집기용 계층형 퍼지 신경망(HFNN)은 장면 전체·집기 후보 주변·자세 매개변수의 정보를 신경망으로 결합하고, 퍼지 규칙으로 집기 자세 후보를 평가하는 모델이다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

## 용어 카드

- 원문 명칭: Hierarchical Fuzzy Neural Network (HFNN)
- 분야: 로봇의 옷감 집기
- 평가 대상: 후보 자세의 집기 가능성·단일층 분리 능력·집기 안정성

## 범위

**포함:** 2026년 10월 5일 발표된 쌓인 옷감 집기 논문의 HFNN 구조, 학습과 추론, 해당 실험의 비교 결과.

**포함하지 않음:** 같은 HFNN 명칭을 사용하는 다른 모델이나 다른 로봇·옷감·실험 환경의 성능 수치.

## 왜 중요한가

없음

## 핵심 구성 요소

이 논문의 HFNN은 장면 전체의 점군 이미지에 합성곱 신경망, 집기 후보 주변의 점군에 PointNet, 자세 매개변수에 다층 퍼셉트론(MLP)을 사용한다. 세 수준의 특징을 어텐션으로 결합한다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

이 논문은 집기 가능성·단일층 분리 능력·집기 안정성을 각각 Low, Medium, High로 표현해 27개의 퍼지 규칙을 구성했다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

## 작동 원리

이 논문의 HFNN 학습 데이터에는 사람이 후보 자세의 세 속성을 0·1·2로 표시한다. 각 숫자는 Low·Medium·High에 대응한다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

이 논문의 HFNN은 추론할 때 퍼지 규칙과 종합 점수로 후보 자세를 평가하고 순위를 정한다. 전문가가 미리 지정한 규칙 점수는 학습 가능한 신경망 매개변수가 아니며, 학습의 경사 업데이트에 참여하지 않는다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

## 실제 예시

연구진은 Intel RealSense D435i로 옷감 장면의 RGB 이미지와 3차원 점군을 취득했다. 무작위로 쌓인 옷감의 로봇 분류 실험을 총 30회 실시했고, 같은 볼록 구조 후보 생성에 수작업 점수를 사용한 방법은 80.0%, HFNN 평가를 사용한 방법은 93.3%의 집기 성공률을 보고했다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

별도의 속성 예측 비교에서는 같은 학습·시험 분할과 학습 전략, 평가 지표를 사용했다. 평균 정확도는 HFNN 91.7%, Direct-fusion 90.9%였고, 분리 효과 예측 정확도는 HFNN 80.3%, Local-PointNet 82.0%였다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

## 한계와 실패 조건

없음

## 혼동하기 쉬운 개념

이 논문에서 신경망의 학습과 퍼지 규칙의 점수화는 다른 단계다. 속성 등급은 학습 데이터로 제공하며, 전문가가 지정한 규칙 점수는 추론에서 후보 순위를 정하는 데 사용한다. [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

## 관련 개념

없음

## 최근 변화

- 2026-10-05: 쌓인 옷감의 집기 후보 생성과 HFNN 평가를 결합한 논문 발표. [기사](https://skyan0213.github.io/tech-knowledge-garden/news/72081e8f67345f20) · [원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)

## 출처

- [Frontiers in Robotics and AI — DOI 10.3389/frobt.2026.1917009](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1917009/full)
