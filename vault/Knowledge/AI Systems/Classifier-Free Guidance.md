---
title: Classifier-Free Guidance
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 생성 모델
concept_id: classifier-free-guidance
label: 분류기 없는 가이던스
created: 2026-10-05
updated: 2026-10-05
last_reviewed: 2026-10-05
aliases:
  - CFG
  - 분류기 없는 가이던스
keywords:
  - Classifier-Free Guidance
  - CFG
  - 분류기 없는 가이던스
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Diffusion Transformer|확산 트랜스포머]]"
tags:
  - AI
  - 영상 생성
verified_sources:
  - https://arxiv.org/html/2512.03451v1
connections:
  - target: diffusion-transformer
    reason: 영상 확산 모델은 각 DiT 경로의 노이즈 예측을 CFG로 결합해 다음 sampler 입력을 만든다.
    evidence:
      - https://arxiv.org/html/2512.03451v1
map_review:
  decision: include
  kind: mechanism
  reason: 모델 구조와 조건부 생성 계산을 구분하는 전문용어이며 독립 정의와 실제 계산 흐름을 논문 전문에서 확인했다.
  reviewed: 2026-10-05
---

# Classifier-Free Guidance

## 한 문장 정의

조건을 준 확산 경로와 조건 없는 경로의 노이즈 예측을 결합해 생성 방향을 조절하는 방법이다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 분류기 없는 가이던스 |
| 영어 | Classifier-Free Guidance |
| 별칭 | CFG · 분류기 없는 가이던스 |

## 범위

**포함:** 조건부·무조건부 노이즈 예측, 예측 결합, 영상 생성 추론의 두 경로.

**포함하지 않음:** 개별 영상 모델의 제품명이나 재사용 임계값 그 자체.

## 왜 중요한가

확산 트랜스포머는 각 경로의 모델 구조이고 CFG는 두 경로의 출력을 결합하는 절차다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 핵심 구성 요소

- 조건 벡터: 영상 생성에서는 텍스트 임베딩 등을 사용한다.
- 조건부 경로: 조건 벡터를 넣어 노이즈를 예측한다.
- 무조건부 경로: 조건 없이 노이즈를 예측한다.
- 결합과 sampler: 두 예측을 결합하고 다음 확산 단계의 입력을 만든다.

[GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 작동 원리

같은 노이즈 제거 단계에서 조건부·무조건부 계산을 수행한다. 두 경로의 노이즈 예측을 결합한 뒤 sampler에 전달해 다음 단계의 입력을 만든다. GalaxyDiT의 계산 재사용은 두 경로에 같은 결정을 적용한다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 실제 예시

GalaxyDiT는 조건부 첫 DiT 블록의 대리 지표로 재사용 시점을 판단하고 두 경로를 함께 계산하거나 함께 재사용한다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 한계와 실패 조건

GalaxyDiT 연구진은 두 경로의 재사용 여부를 따로 결정하면 서로 다른 노이즈 단계의 예측이 섞여 영상 왜곡이 생길 수 있다고 설명한다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 혼동하기 쉬운 개념

확산 트랜스포머는 각 경로의 모델 구조이고 CFG는 두 경로의 출력을 결합하는 절차다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 관련 개념

- [[Knowledge/AI Systems/Diffusion Transformer#한 문장 정의|확산 트랜스포머]] — 영상 확산 모델은 각 DiT 경로의 노이즈 예측을 CFG로 결합해 다음 sampler 입력을 만든다. [근거](https://arxiv.org/html/2512.03451v1)

## 최근 변화

- 2026-07-26 — NVIDIA의 GalaxyDiT 소개는 CFG 두 경로의 계산 재사용을 함께 결정하는 방법을 다룬다. [[News/a9911e33a5a858b4|기사]] · [논문 전문](https://arxiv.org/html/2512.03451v1)

## 출처

- [GalaxyDiT · arXiv 2512.03451v1](https://arxiv.org/html/2512.03451v1)
