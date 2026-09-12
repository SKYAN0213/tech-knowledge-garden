---
title: AI Agents
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-09-13
aliases:
  - AI Agent
  - AI 에이전트
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Model Context Protocol|MCP]]"
  - "[[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]]"
  - "[[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]"
  - "[[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
  - "[[Knowledge/AI Systems/AI Agent Security|에이전트 보안]]"
tags:
  - AI
  - Agent
last_reviewed: 2026-09-13
concept_id: agents
label: AI 에이전트
group: 에이전트
keywords:
  - 도구 호출
  - 실행 루프
  - 상태
  - handoff
verified_sources:
  - https://openai.github.io/openai-agents-python/agents/
  - https://modelcontextprotocol.io/specification/2025-11-25/architecture
  - https://arxiv.org/abs/2005.11401
  - https://docs.vllm.ai/en/latest/
relations:
  - target: mcp
    type: uses
    reason: 외부 도구 연결에 MCP를 사용할 수 있다. MCP 사용은 에이전트의 필수 조건이 아니다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
      - https://modelcontextprotocol.io/specification/2025-11-25/architecture
  - target: rag
    type: uses
    reason: 외부 문서를 근거로 삼는 작업에는 검색-생성 경로를 조합할 수 있다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
      - https://arxiv.org/abs/2005.11401
  - target: inference
    type: uses
    reason: 모델 호출을 수행하려면 해당 모델의 추론 실행 기반을 사용한다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
      - https://docs.vllm.ai/en/latest/
---

# AI Agents

## 한 문장 정의

모델이 지시와 현재 상태를 바탕으로 도구를 선택하고 결과를 받아 다음 행동을 정하는 실행 시스템이다. [OpenAI Agents SDK · Agents](https://openai.github.io/openai-agents-python/agents/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 에이전트 |
| 영어 | AI Agents |
| 키워드 | 도구 호출 · 실행 루프 · 상태 · handoff |

## 범위

**포함:** 모델·도구·상태·반복 실행·종료 조건을 연결하는 런타임.

**포함하지 않음:** 고정 순서로 호출만 이어 붙인 모든 프로그램을 에이전트라고 부르지는 않는다.

## 왜 중요한가

자연어 목표를 외부 시스템의 행동으로 이어 주므로, 모델의 답변 품질뿐 아니라 실행 결과와 권한 경계가 중요해진다.

## 핵심 구성 요소

- 도구 호출
- 실행 루프
- 상태
- handoff

## 작동 원리

목표와 관측을 입력하고 모델이 행동을 선택한다. 런타임이 도구를 실행해 결과를 돌려주고, 완료·재시도·이관 조건을 판단한다. [OpenAI Agents SDK · Agents](https://openai.github.io/openai-agents-python/agents/)

## 실제 예시

검색 도구로 근거를 찾고 파일 도구로 브리핑을 저장한 뒤 결과를 확인하는 조사 에이전트.

## 한계와 실패 조건

긴 실행에서 오류가 누적된다. 도구 성공과 목표 달성이 다를 수 있어 종료 조건과 실제 결과 검증이 필요하다.

## 혼동하기 쉬운 개념

MCP는 연결 규격이고, 에이전트는 그 규격을 사용할 수 있는 실행 주체다.

## 관련 개념

- → 활용: [[Knowledge/AI Systems/Model Context Protocol#한 문장 정의|MCP]] — 외부 도구 연결에 MCP를 사용할 수 있다. MCP 사용은 에이전트의 필수 조건이 아니다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture))
- → 활용: [[Knowledge/AI Systems/Retrieval-Augmented Generation#한 문장 정의|검색 증강 생성]] — 외부 문서를 근거로 삼는 작업에는 검색-생성 경로를 조합할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://arxiv.org/abs/2005.11401))
- ← 활용: [[Knowledge/AI Systems/Conversational Voice AI#한 문장 정의|대화형 음성 AI]] — 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/agents/))
- ← 관측: [[Knowledge/AI Systems/Agent Observability#한 문장 정의|에이전트 관측성]] — 모델 호출·도구 사용·이관으로 구성된 실행을 추적한다. (해석; [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://openai.github.io/openai-agents-python/agents/))
- ← 평가: [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- → 활용: [[Knowledge/AI Systems/AI Inference Infrastructure#한 문장 정의|AI 추론 인프라]] — 모델 호출을 수행하려면 해당 모델의 추론 실행 기반을 사용한다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://docs.vllm.ai/en/latest/))
- ← 통제: [[Knowledge/AI Systems/AI Agent Security#한 문장 정의|에이전트 보안]] — 모델과 도구 실행의 신원·권한·검사 경계를 보호한다. (해석; [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents) · [근거](https://openai.github.io/openai-agents-python/guardrails/))

## 최근 변화

- 2026-09-10 — OpenAI가 Agents API 공개 베타로 문맥 압축·도구 탐색·하위 에이전트 실행을 관리 서비스에 묶었습니다. 실행 관리 계층과 계산 환경의 선택을 나누는 구현 방식이며, 업무별 신뢰성은 별도 평가 대상입니다. [source](https://openai.com/index/introducing-the-agents-api/)

- 2026 — OpenAI Agents SDK는 도구, handoff, guardrail, 세션, tracing을 에이전트 런타임의 기본 요소로 문서화했습니다.

## 출처

- [OpenAI Agents SDK · Agents](https://openai.github.io/openai-agents-python/agents/)
- [MCP · Architecture (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [Lewis et al. · Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)
- [vLLM · Serving](https://docs.vllm.ai/en/latest/)
