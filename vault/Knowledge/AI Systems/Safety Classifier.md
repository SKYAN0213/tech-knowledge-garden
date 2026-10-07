---
title: Safety Classifier
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: AI 안전
concept_id: safety-classifier
label: 안전 분류기
created: 2026-10-08
updated: 2026-10-08
last_reviewed: 2026-10-08
aliases:
  - 안전 분류기
keywords:
  - Safety Classifier
  - 안전 분류기
parent_concepts: []
related_concepts: []
tags:
  - AI
  - 사이버보안
verified_sources:
  - https://www.anthropic.com/news/redeploying-fable-5
connections: []
map_review:
  decision: include
  kind: mechanism
  reason: 유해한 입력과 출력을 판별해 응답을 차단하는 독립적인 안전 메커니즘으로 공식 원문에서 정의와 오탐을 확인했다.
  reviewed: 2026-10-08
---

# Safety Classifier

## 한 문장 정의

모델과의 상호작용 중 잠재적으로 유해한 사이버보안 입력이나 출력을 감지해 응답을 차단하는 작은 AI 시스템이다. [Anthropic](https://www.anthropic.com/news/redeploying-fable-5)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 안전 분류기 |
| 영어 | Safety Classifier |

## 범위

**포함:** 유해한 사이버보안 요청·출력의 판별과 응답 차단.

**포함하지 않음:** Fable 5·Opus 4.8 같은 개별 모델명, 모델의 전체 사이버보안 성능.

## 왜 중요한가

없음

## 핵심 구성 요소

- 판별 대상: 모델에 들어온 요청 또는 모델이 생성하는 출력.
- 분류기: 잠재적으로 유해한 사이버보안 내용을 감지하는 작은 AI 시스템.
- 차단: 위험한 내용이 감지되면 모델의 응답을 막는다.

[Anthropic](https://www.anthropic.com/news/redeploying-fable-5)

## 작동 원리

모델과 상호작용하는 동안 요청과 출력을 판별하고, 잠재적으로 유해한 사이버보안 작업이나 출력이 감지되면 응답을 차단한다. [Anthropic](https://www.anthropic.com/news/redeploying-fable-5)

## 실제 예시

Anthropic은 Fable 5의 차단 요청을 사용자에게 알린 뒤 Opus 4.8로 보낸다고 설명했다. 회사가 밝힌 새 분류기의 차단율은 Amazon 보고서에 나온 특정 우회 기법에 대해 99% 초과다. [Anthropic](https://www.anthropic.com/news/redeploying-fable-5)

## 한계와 실패 조건

분류기는 위험한 내용을 놓치거나 특이한 입력 방식으로 우회될 수 있다. Anthropic은 개선된 Fable 5 분류기가 일반적인 코딩·디버깅 중 무해한 요청도 더 자주 걸러낸다고 밝혔다. [Anthropic](https://www.anthropic.com/news/redeploying-fable-5)

## 혼동하기 쉬운 개념

없음

## 관련 개념

없음

## 최근 변화

- 2026-06-30 — Anthropic은 Amazon 보고서의 우회 기법에 대응하도록 분류기를 개선했다고 발표했다. [원문](https://www.anthropic.com/news/redeploying-fable-5)

## 출처

- [Anthropic · Redeploying Fable 5](https://www.anthropic.com/news/redeploying-fable-5)
