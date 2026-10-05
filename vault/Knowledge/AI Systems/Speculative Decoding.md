---
title: Speculative Decoding
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 평가와 운영
concept_id: speculative-decoding
label: 추측 디코딩
created: 2026-10-05
updated: 2026-10-05
last_reviewed: 2026-10-05
aliases:
  - 추측 디코딩
  - 추정 디코딩
keywords:
  - 보조 모델
  - 후보 토큰 검증
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Inference
verified_sources:
  - https://huggingface.co/docs/transformers/en/assisted_decoding
  - https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/
map_review:
  decision: include
  kind: mechanism
  reason: 추측 디코딩은 보조 모델·후보 토큰 검증의 작동 관계를 따로 배워야 하는 전문 방법이며, 회사·제품명이나 일반 단어가 아니다.
  reviewed: 2026-10-05
connections:
  - target: inference
    reason: 작은 모델의 후보 토큰을 주 모델이 검증해 비싼 순차 추론 횟수를 줄이는 서빙 기법이다.
    evidence:
      - https://huggingface.co/docs/transformers/en/assisted_decoding
      - https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/
---

# Speculative Decoding

## 한 문장 정의

작은 보조 모델이 후보 토큰을 먼저 제안하고 주 모델이 한 번에 검증해 수락한 토큰을 출력하는 생성 방법이다. [Hugging Face](https://huggingface.co/docs/transformers/en/assisted_decoding)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 추측 디코딩 |
| 영어 | Speculative Decoding |
| 구성 | 초안 생성 · 주 모델 검증 |

## 범위

**포함:** 보조 모델이 제안한 토큰을 주 모델로 검증하는 생성 경로.

**포함하지 않음:** 검증 없이 작은 모델의 답변을 그대로 사용하기. [Hugging Face](https://huggingface.co/docs/transformers/en/assisted_decoding)

## 왜 중요한가

주 모델의 비싼 순차 실행 횟수를 줄여 여러 토큰을 생성할 수 있다. [Hugging Face](https://huggingface.co/docs/transformers/en/assisted_decoding)

## 핵심 구성 요소

빠른 보조 모델, 후보 토큰, 주 모델의 검증과 수락·거절 처리.

## 작동 원리

주 모델이 후보를 한 번에 검증한다. 수락한 토큰은 출력에 들어가고 거절한 토큰은 일반적인 샘플링으로 처리한다. [Hugging Face](https://huggingface.co/docs/transformers/en/assisted_decoding)

## 실제 예시

OpenAI는 작은 초안 모델을 개선해 토큰 생성 효율이 15% 이상 높아졌다고 보고했다. [원문](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

## 한계와 실패 조건

Hugging Face는 주 모델보다 훨씬 작은 보조 모델이 같은 토크나이저를 사용하는 구성을 설명한다. 표준 추측 디코딩은 주 모델의 출력 분포를 유지하며, 검증 분포를 섞는 변형은 별개의 방식이다. [Hugging Face](https://huggingface.co/docs/transformers/en/assisted_decoding)

## 혼동하기 쉬운 개념

프롬프트 조회 디코딩은 별도 보조 모델 없이 입력의 n-그램에서 후보를 찾는다. 자기 추측 디코딩은 같은 모델의 중간 층을 후보 생성에 사용한다. [Hugging Face](https://huggingface.co/docs/transformers/en/assisted_decoding)

## 관련 개념

- [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] — 후보 제안과 검증으로 모델 서빙의 순차 계산을 줄인다. [근거](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

## 최근 변화

- 2026-07-29 — OpenAI가 GPT-5.6의 초안 모델 개선과 병렬 검증 방식을 공개했다. [[News/eb71f165025c2507|기사]] · [원문](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

## 출처

- [Hugging Face · Assisted decoding](https://huggingface.co/docs/transformers/en/assisted_decoding)
- [OpenAI · GPT-5.6 효율 개선](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)
