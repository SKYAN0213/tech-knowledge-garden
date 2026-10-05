---
title: Conversational Voice AI
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-07-10
updated: 2026-10-05
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
last_reviewed: 2026-10-05
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
  - https://openai.com/index/introducing-gpt-live-1-in-the-api/
  - https://openai.com/index/continuous-voice-interaction-with-gpt-live/
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/
  - https://openai.github.io/openai-agents-python/voice/pipeline/
  - https://openai.github.io/openai-agents-python/tracing/
relations:
  - target: agents
    type: uses
    reason: 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/voice/pipeline/
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
  reviewed: 2026-10-05
---

# Conversational Voice AI

## 한 문장 정의

사용자의 음성을 받아 대화나 업무를 처리하고 음성으로 응답하는 상호작용 시스템이다. [음성 파이프라인](https://openai.github.io/openai-agents-python/voice/pipeline/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 대화형 음성 AI |
| 영어 | Conversational Voice AI |
| 입력과 출력 | 음성 입력 · 업무 처리 · 음성 응답 |

## 범위

**포함:** 음성 인식·업무 코드·음성 합성을 잇는 파이프라인과, 음성을 직접 주고받으며 배경 업무를 위임하는 모델 구조.

**포함하지 않음:** 음성을 출력하기만 하고 입력 음성을 대화나 업무에 연결하지 않는 기능. [파이프라인](https://openai.github.io/openai-agents-python/voice/pipeline/) · [직접 음성 처리](https://openai.com/index/introducing-gpt-live-1-in-the-api/)

## 왜 중요한가

사용자가 말하는 시점과 업무 실행 시점을 연결하는 방식이 다르다. SDK의 스트리밍 파이프라인은 발화 종료를 감지해 업무를 시작하고, GPT-Live-1은 동시 청취·발화와 백엔드 업무 위임을 지원한다. [SDK](https://openai.github.io/openai-agents-python/voice/pipeline/) · [API](https://openai.com/index/introducing-gpt-live-1-in-the-api/)

## 핵심 구성 요소

음성 입력, 대화 또는 업무 처리, 음성 출력. 파이프라인에서는 STT·TTS 모델을 설정하고 업무 코드를 연결한다. [SDK](https://openai.github.io/openai-agents-python/voice/pipeline/)

## 작동 원리

파이프라인은 입력 음성을 전사하고 발화 종료를 감지한 뒤 업무 코드를 실행해 결과를 음성으로 변환한다. 스트리밍 입력에서는 오디오 조각을 받아 활동 감지로 실행 시점을 정한다. [SDK](https://openai.github.io/openai-agents-python/voice/pipeline/)

GPT-Live-1은 한 모델에서 청취와 발화를 처리하고 추론·도구 호출은 백엔드 텍스트 모델에 위임한다. 대화를 이어가면서 배경 업무를 수행하는 구조다. [API](https://openai.com/index/introducing-gpt-live-1-in-the-api/)

## 실제 예시

업무 코드를 VoicePipeline에 연결하면 음성 입력을 업무에 전달하고 결과를 음성으로 받는다. [SDK](https://openai.github.io/openai-agents-python/voice/pipeline/)

## 한계와 실패 조건

SDK의 StreamedAudioInput은 내장된 끼어들기 처리를 제공하지 않는다. 감지한 턴마다 별도로 업무를 실행하며, 애플리케이션은 턴 시작·종료 이벤트로 재생을 제어할 수 있다. [SDK](https://openai.github.io/openai-agents-python/voice/pipeline/)

## 혼동하기 쉬운 개념

STT·업무 코드·TTS를 잇는 파이프라인과 한 모델이 직접 듣고 말하는 구현을 구별한다. 별도 업무 위임 여부와 끼어들기 처리도 각각 확인한다. [SDK](https://openai.github.io/openai-agents-python/voice/pipeline/) · [API](https://openai.com/index/introducing-gpt-live-1-in-the-api/)

## 관련 개념

- → 활용: [[Knowledge/AI Systems/AI Agents|AI 에이전트]] — 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/))
- → 활용: [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] — 음성 처리와 업무 실행의 단계를 추적으로 연결한다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/tracing/))

## 최근 변화

- 2026-09-15 — Google은 Gemini 3.8 Live와 Extended Thinking을 발표했다. 9월 17일 수정본은 대화 중 배경 도구 실행과 추론·발화 병행을 설명한다. [원문](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/)
- 2026-09-10 — OpenAI가 GPT-Live-1 API를 출시했다. 동시 청취·발화와 백엔드 모델로의 추론·도구 호출 위임을 제공한다. [원문](https://openai.com/index/introducing-gpt-live-1-in-the-api/)
- 2026-08-03 — OpenAI가 GPT-Live의 음성 전송과 도구 실행 경로를 분리한 구조를 설명했다. 당시 API는 출시 예정으로 안내했다. [[News/deec56a13e2b9b57|기사]] · [원문](https://openai.com/index/continuous-voice-interaction-with-gpt-live/)

## 출처

- [OpenAI Agents SDK · Voice pipeline](https://openai.github.io/openai-agents-python/voice/pipeline/)
- [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)
- [OpenAI · 음성 모드 구조](https://openai.com/index/continuous-voice-interaction-with-gpt-live/)
- [OpenAI · GPT-Live-1 API 출시](https://openai.com/index/introducing-gpt-live-1-in-the-api/)
- [Google · Gemini Live 발표](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/)
