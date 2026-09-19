---
title: Conversational Voice AI
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-07-10
updated: 2026-09-20
aliases:
  - 대화형 음성 AI
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]"
tags:
  - AI
  - Voice
  - Multimodal
last_reviewed: 2026-09-13
concept_id: voice
label: 대화형 음성 AI
group: 에이전트
keywords:
  - 음성 인식
  - STT
  - 대화 상태
  - 음성 합성
  - TTS
verified_sources:
  - https://openai.github.io/openai-agents-python/voice/pipeline/
  - https://openai.github.io/openai-agents-python/tracing/
  - https://openai.github.io/openai-agents-python/agents/
relations:
  - target: agents
    type: uses
    reason: 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/voice/pipeline/
      - https://openai.github.io/openai-agents-python/agents/
  - target: observability
    type: uses
    reason: 음성 처리와 업무 실행의 단계를 추적으로 연결한다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/voice/pipeline/
      - https://openai.github.io/openai-agents-python/tracing/
map_review:
  decision: include
  kind: architecture
  reason: 음성 인식·업무 처리·음성 합성으로 이어지는 대화 파이프라인을 이해해야 한다.
  reviewed: 2026-09-13
---

# Conversational Voice AI

## 한 문장 정의

사용자의 음성을 받아 대화 또는 업무를 처리하고 음성으로 응답하는 상호작용 시스템이다. [OpenAI Agents SDK · Voice pipeline](https://openai.github.io/openai-agents-python/voice/pipeline/) · [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 대화형 음성 AI |
| 영어 | Conversational Voice AI |
| 키워드 | 음성 인식 · STT · 대화 상태 · 음성 합성 · TTS |

## 범위

**포함:** 음성 입력·대화 상태·업무 실행·음성 출력의 결합.

**포함하지 않음:** 음성 합성 기능만 있는 모든 시스템.

## 왜 중요한가

사용자가 화면과 키보드 없이도 업무를 지시하고 결과를 들을 수 있게 한다. 음성 처리의 지연과 오인식이 전체 업무 경험에 영향을 준다.

## 핵심 구성 요소

- 음성 인식
- STT
- 대화 상태
- 음성 합성
- TTS

## 작동 원리

문서화된 파이프라인 방식은 음성 인식으로 텍스트를 만들고 업무 코드를 실행한 뒤 음성을 합성한다. 음성 처리 단계와 업무 단계를 각각 추적할 수 있다. [OpenAI Agents SDK · Voice pipeline](https://openai.github.io/openai-agents-python/voice/pipeline/) · [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)

## 실제 예시

말로 한 요청을 텍스트 에이전트에 전달하고 결과를 읽어 주는 음성 인터페이스.

## 한계와 실패 조건

인식 오류와 출력 지연이 대화 품질을 바꾼다. 녹음·전사문을 추적할 때 데이터 수집 경계를 정해야 한다.

## 혼동하기 쉬운 개념

파이프라인 방식과 음성을 직접 주고받는 모델 구조는 같은 구현이 아니다.

## 관련 개념

- → 활용: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/agents/))
- → 활용: [[Knowledge/AI Systems/Agent Observability#한 문장 정의|에이전트 관측성]] — 음성 처리와 업무 실행의 단계를 추적으로 연결한다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/tracing/))

## 최근 변화

- 2026-09-15 — Google은 대화 중 배경 도구를 실행하는 Gemini 3.8 Live와 추론·발화를 병행하는 Extended Thinking을 공개했다. 기존 음성 파이프라인과 별도로 음성을 직접 처리하는 모델의 제공 사례다. [Google 발표](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/)

- 2026-09-10 — GPT‑Live‑1 API가 동시 청취·발화와 별도 모델로의 추론·도구 위임을 제공합니다. 음성 인터페이스와 배경 업무 경로를 분리하는 구현 선택지가 늘었으며, 언어별 대화 품질은 별도 검증이 필요합니다. [source](https://openai.com/index/introducing-gpt-live-1-in-the-api/)

- 2026 — 실시간 음성 제품은 낮은 지연 대화 경로와 깊은 추론·도구 경로를 분리하면서 장시간 세션 복구와 문맥 압축을 다루기 시작했습니다.

## 출처

- [OpenAI Agents SDK · Voice pipeline](https://openai.github.io/openai-agents-python/voice/pipeline/)
- [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)
- [OpenAI Agents SDK · Agents](https://openai.github.io/openai-agents-python/agents/)
