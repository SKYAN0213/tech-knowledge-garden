---
title: Context Compaction
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 평가와 운영
concept_id: context-compaction
label: 문맥 압축
created: 2026-10-05
updated: 2026-10-05
last_reviewed: 2026-10-05
aliases:
  - 문맥 압축
  - 컨텍스트 압축
  - compaction
keywords:
  - 대화 문맥 교체
  - 짧은 문맥 표현
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Inference
verified_sources:
  - https://developers.openai.com/api/docs/guides/prompt-caching.md
  - https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/
map_review:
  decision: include
  kind: mechanism
  reason: 문맥 압축은 대화 문맥 교체·짧은 문맥 표현의 작동 관계를 따로 배워야 하는 전문 방법이며, 회사·제품명이나 일반 단어가 아니다.
  reviewed: 2026-10-05
connections:
  - target: prompt-caching
    reason: 대화 문맥을 교체하면 프롬프트 앞부분이 바뀌어 압축 직후 이전 캐시의 재사용을 줄일 수 있다.
    evidence:
      - https://developers.openai.com/api/docs/guides/prompt-caching.md
  - target: evaluation
    reason: OpenAI는 ARC-AGI-3 평가 실행기의 오래된 메시지 삭제를 문맥 압축으로 바꿔 추론 보존과 함께 시험했다.
    evidence:
      - https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/
---

# Context Compaction

## 한 문장 정의

이전 대화 문맥을 더 짧은 표현으로 교체해 후속 요청에 사용할 문맥을 줄이는 방법이다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 문맥 압축 |
| 영어 | Context Compaction |
| 대상 | 이전 대화 기록 |

## 범위

**포함:** 이전 대화 문맥을 더 짧은 표현으로 바꾸는 처리.

**포함하지 않음:** 오래된 메시지를 순서대로 삭제하기만 하는 rolling truncation. [OpenAI](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

## 왜 중요한가

긴 에이전트 실행에서 이전에 학습한 게임 내용을 이어 쓰기 위해 문맥 관리 방식을 바꾼 사례가 있다. [OpenAI](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

## 핵심 구성 요소

이전 대화 기록, 이를 교체할 짧은 표현, 교체 뒤의 후속 요청.

## 작동 원리

이전 대화 문맥을 더 짧은 표현으로 바꾼 뒤 작업을 이어간다. OpenAI는 ARC-AGI-3 실행기의 오래된 기록 삭제를 compaction으로 교체했다. [문맥 교체](https://developers.openai.com/api/docs/guides/prompt-caching.md) · [실험](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

## 실제 예시

ARC-AGI-3 공개 과제에서 추론 보존과 문맥 압축을 함께 사용한 실행기의 RHAE 점수는 38.3%였다. [원문](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

## 한계와 실패 조건

문맥을 교체하면 입력 앞부분도 바뀔 수 있어 압축 직후 요청에서 이전 프롬프트 캐시를 덜 재사용할 수 있다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 혼동하기 쉬운 개념

프롬프트 캐싱은 동일한 입력 앞부분의 계산을 재사용한다. 문맥 압축은 입력에 담는 이전 기록 자체를 더 짧은 표현으로 교체한다. [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching.md)

## 관련 개념

- [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]] — 문맥 교체는 캐시의 앞부분 일치에 영향을 줄 수 있다. [근거](https://developers.openai.com/api/docs/guides/prompt-caching.md)
- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] — 평가 실행기의 문맥 보존 조건으로 사용된 사례가 있다. [근거](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

## 최근 변화

- 2026-07-29 — OpenAI가 ARC-AGI-3 실행기에서 추론 보존·문맥 압축을 함께 시험한 결과를 발표했다. [[News/265c6a0134aba9b6|기사]] · [원문](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

## 출처

- [OpenAI · ARC-AGI-3 실행기 실험](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)
- [OpenAI · Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching.md)
