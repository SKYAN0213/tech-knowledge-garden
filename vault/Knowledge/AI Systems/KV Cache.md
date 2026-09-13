---
title: KV Cache
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-09-13
updated: 2026-09-13
last_reviewed: 2026-09-13
aliases:
  - KV 캐시
  - KV cache
  - key-value cache
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
tags:
  - Technology
concept_id: kv-cache
label: KV 캐시
group: 평가와 운영
keywords:
  - 어텐션
  - 키·값 저장
  - 메모리 재사용
verified_sources:
  - https://huggingface.co/docs/transformers/en/cache_explanation
map_review:
  decision: include
  kind: mechanism
  reason: 문맥이 길어질 때 추론 메모리와 속도가 달라지는 이유를 어텐션의 키·값 재사용으로 설명하는 기술이다.
  reviewed: 2026-09-13
connections:
  - target: inference
    reason: 모델 서빙에서 이전 토큰의 어텐션 키·값을 재사용해 반복 계산을 줄인다.
    evidence:
      - https://huggingface.co/docs/transformers/en/cache_explanation
---

# KV Cache

## 한 문장 정의

다음 토큰을 생성할 때 이전 토큰의 어텐션 키·값을 다시 계산하지 않도록 저장해 두는 추론용 캐시다. [Hugging Face](https://huggingface.co/docs/transformers/en/cache_explanation)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | KV 캐시 |
| 영어 | Key-Value Cache |
| 키워드 | 어텐션 · 키·값 저장 · 메모리 재사용 |

## 범위

**포함:** 생성 과정에서 각 층의 과거 키·값을 저장하고 재사용하는 방식.

**포함하지 않음:** 완성된 답변을 통째로 저장하는 응답 캐시.

## 왜 중요한가

이전 문맥 계산을 반복하는 비용을 줄이지만, 긴 문맥의 키·값을 보관할 메모리가 필요하다.

## 핵심 구성 요소

- 과거 토큰의 키와 값
- 층별 캐시
- 새 토큰의 위치와 어텐션 마스크

## 작동 원리

새 토큰의 키·값을 계산해 기존 캐시에 잇는다. 새 질의는 저장된 과거 키·값도 참조한다. 생성 단계가 진행되면 캐시 길이가 늘어난다.

## 실제 예시

긴 대화에서 한 토큰을 더 생성할 때 앞선 대화의 키·값을 재사용한다.

## 한계와 실패 조건

메모리 사용량이 문맥 길이에 따라 커진다. 캐시의 위치 정보와 마스크가 실제 토큰 순서에 맞아야 한다.

## 혼동하기 쉬운 개념

응답 캐시는 답변을 재사용한다. KV 캐시는 토큰 생성을 위한 중간 계산값을 재사용한다.

## 관련 개념

- [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] — 모델 서빙에서 이전 토큰의 어텐션 키·값을 재사용해 반복 계산을 줄인다.

## 최근 변화

없음

## 출처

- [Hugging Face · Caching](https://huggingface.co/docs/transformers/en/cache_explanation)
