---
title: Prompt Caching
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 평가와 운영
concept_id: prompt-caching
label: 프롬프트 캐싱
created: 2026-10-05
updated: 2026-10-05
last_reviewed: 2026-10-05
aliases:
  - 프롬프트 캐싱
  - 프롬프트 캐시
keywords:
  - 동일한 프롬프트 접두부
  - KV 텐서 재사용
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Inference
verified_sources:
  - https://developers.openai.com/api/docs/guides/prompt-caching.md
  - https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/
map_review:
  decision: include
  kind: mechanism
  reason: 프롬프트 캐싱은 동일한 프롬프트 접두부·KV 텐서 재사용의 작동 관계를 따로 배워야 하는 전문 방법이며, 회사·제품명이나 일반 단어가 아니다.
  reviewed: 2026-10-05
connections:
  - target: kv-cache
    reason: 동일한 입력 앞부분에 대한 KV 텐서를 저장하고 후속 요청에서 재사용한다.
    evidence:
      - https://developers.openai.com/api/docs/guides/prompt-caching.md
---

# Prompt Caching

## 한 문장 정의

여러 요청이 동일한 프롬프트 앞부분을 공유할 때 이미 계산한 중간 상태를 재사용하는 기능이다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 프롬프트 캐싱 |
| 영어 | Prompt Caching |
| 재사용 대상 | 동일한 입력 앞부분의 KV 상태 |

## 범위

**포함:** 요청 사이에서 변하지 않은 입력 앞부분의 계산 재사용.

**포함하지 않음:** 이전 답변을 그대로 반환하는 응답 캐시. 캐시된 앞부분으로도 새 응답을 생성한다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 왜 중요한가

같은 입력 앞부분을 다시 계산하는 작업을 줄인다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 핵심 구성 요소

동일한 입력 앞부분, 저장된 KV 텐서, 그 뒤에 추가되는 새 입력.

## 작동 원리

일치하는 캐시 항목이 있으면 저장된 KV 상태를 사용하고 새 입력을 처리해 응답을 생성한다. 저장하는 것은 토큰 자체가 아닌 KV 텐서다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 실제 예시

OpenAI는 Codex·ChatGPT Work에서 새 메시지를 문맥 끝에 추가하고 도구 순서를 일정하게 유지하는 설계를 설명했다. [원문](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

## 한계와 실패 조건

캐시를 재사용하려면 렌더링된 앞부분이 일치해야 한다. 앞쪽 내용이나 관련 설정 변경은 그 뒤의 캐시 일치를 깨뜨릴 수 있다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 혼동하기 쉬운 개념

문맥 압축은 대화 기록을 짧은 표현으로 교체한다. 프롬프트 캐싱은 일치하는 입력의 계산을 재사용하며, 동일한 출력은 보장하지 않는다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 관련 개념

- [[Knowledge/AI Systems/KV Cache|KV 캐시]] — 재사용할 프롬프트 앞부분의 KV 텐서를 보관한다. [근거](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 최근 변화

- 2026-07-29 — OpenAI가 프롬프트 앞부분을 유지하는 에이전트 실행기 설계를 공개했다. [[News/eb71f165025c2507|기사]] · [원문](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

## 출처

- [OpenAI · Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching.md)
- [OpenAI · GPT-5.6 효율 개선](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)
