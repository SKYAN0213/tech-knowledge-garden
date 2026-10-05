---
title: Diffusion Transformer
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 생성 모델
concept_id: diffusion-transformer
label: 확산 트랜스포머
created: 2026-10-05
updated: 2026-10-05
last_reviewed: 2026-10-05
aliases:
  - DiT
  - 확산 트랜스포머
keywords:
  - Diffusion Transformer
  - DiT
  - 확산 트랜스포머
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Classifier-Free Guidance|분류기 없는 가이던스]]"
tags:
  - AI
  - 영상 생성
verified_sources:
  - https://arxiv.org/html/2512.03451v1
connections:
  - target: classifier-free-guidance
    reason: 영상 생성의 DiT 조건부·무조건부 경로 출력은 CFG 결합에 사용된다.
    evidence:
      - https://arxiv.org/html/2512.03451v1
map_review:
  decision: include
  kind: architecture
  reason: 모델 구조와 조건부 생성 계산을 구분하는 전문용어이며 독립 정의와 실제 계산 흐름을 논문 전문에서 확인했다.
  reviewed: 2026-10-05
---

# Diffusion Transformer

## 한 문장 정의

영상 확산 생성에서 노이즈 제거 계산을 attention·cross-attention·MLP 블록으로 수행하는 트랜스포머 구조다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 확산 트랜스포머 |
| 영어 | Diffusion Transformer |
| 별칭 | DiT · 확산 트랜스포머 |

## 범위

**포함:** 영상 토큰·조건 벡터·트랜스포머 블록과 반복 노이즈 제거 계산.

**포함하지 않음:** Transformer를 쓰는 모든 언어 모델이나 특정 영상 제품의 이름.

## 왜 중요한가

DiT는 모델의 계산 구조이고 CFG는 두 확산 경로의 예측 결합이다. GalaxyDiT는 DiT 영상 모델의 중간 계산을 재사용하는 방법이다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 핵심 구성 요소

- 토큰 시퀀스: 각 DiT 블록이 처리하는 영상 표현.
- Attention·cross-attention: 블록 내부의 계산 계층.
- MLP: 블록에서 토큰을 처리하는 계층.
- 반복 확산 단계: 예측한 노이즈와 sampler로 다음 입력을 만든다.

[GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 작동 원리

영상 생성은 노이즈를 단계적으로 제거하며 각 DiT 블록은 전체 토큰 시퀀스를 처리한다. 조건 벡터는 보통 텍스트 임베딩이며, CFG를 사용할 때는 조건부·무조건부 경로의 노이즈 예측이 결합되어 sampler로 전달된다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 실제 예시

GalaxyDiT는 각 모델의 중간 계산에서 재사용 판단에 적합한 대리 지표를 고르고, 조건부 첫 DiT 블록에서 이 지표를 읽는다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 한계와 실패 조건

영상 생성에는 여러 노이즈 제거 단계가 필요하며 CFG는 각 단계에서 두 경로의 계산을 수행한다. GalaxyDiT의 속도·품질 수치는 모델과 재사용 설정에 따라 다르다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 혼동하기 쉬운 개념

DiT는 모델의 계산 구조이고 CFG는 두 확산 경로의 예측 결합이다. GalaxyDiT는 DiT 영상 모델의 중간 계산을 재사용하는 방법이다. [GalaxyDiT · 2.1절·3.3절](https://arxiv.org/html/2512.03451v1)

## 관련 개념

- [[Knowledge/AI Systems/Classifier-Free Guidance#한 문장 정의|분류기 없는 가이던스]] — 영상 생성의 DiT 조건부·무조건부 경로 출력은 CFG 결합에 사용된다. [근거](https://arxiv.org/html/2512.03451v1)

## 최근 변화

- 2026-07-26 — NVIDIA가 소개한 GalaxyDiT는 Wan2.1과 Cosmos-Predict2의 영상 확산 계산을 재사용한다. [[News/a9911e33a5a858b4|기사]] · [논문 전문](https://arxiv.org/html/2512.03451v1)

## 출처

- [GalaxyDiT · arXiv 2512.03451v1](https://arxiv.org/html/2512.03451v1)
