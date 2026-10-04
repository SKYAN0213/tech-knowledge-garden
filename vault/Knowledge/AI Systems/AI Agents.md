---
title: AI Agents
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-10-05
aliases:
  - AI Agent
  - AI 에이전트
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Model Context Protocol|MCP]]"
  - "[[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
tags:
  - AI
  - Agent
last_reviewed: 2026-10-05
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
  - https://arxiv.org/abs/2005.11401
  - https://docs.vllm.ai/en/latest/
relations:
  - target: mcp
    type: uses
    reason: 외부 도구 연결에 MCP를 사용할 수 있다. SDK의 MCP 서버 설정은 선택 사항이다.
    basis: source
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
  - target: rag
    type: uses
    reason: 문서 검색 도구와 생성 모델을 결합하는 에이전트 작업에 RAG 구성을 사용할 수 있다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
      - https://arxiv.org/abs/2005.11401
  - target: inference
    type: uses
    reason: 모델을 호출하는 실행은 해당 모델의 추론 실행 기반을 사용한다.
    basis: inference
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
      - https://docs.vllm.ai/en/latest/
map_review:
  decision: include
  kind: mechanism
  reason: 챗봇 응답과 구별되는 도구 선택·실행 루프를 이해해야 기사 내용을 해석할 수 있다.
  reviewed: 2026-10-05
---

# AI Agents

## 한 문장 정의

언어 모델에 지시·도구와 실행 동작을 결합해, 도구의 결과를 받아 다음 행동이나 종료를 결정하는 시스템이다. [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 에이전트 |
| 영어 | AI Agents |

## 범위

**포함:** 언어 모델의 지시·도구와 실행 제어 구성.

**포함하지 않음:** 외부 연결 규격인 MCP 자체와 검색·생성을 결합하는 RAG 자체.

[원문](https://openai.github.io/openai-agents-python/agents/)

## 왜 중요한가

없음

## 핵심 구성 요소

없음

## 작동 원리

OpenAI Agents SDK에서 Agent는 모델·지시·도구를 설정하고 Runner가 모델 호출, 도구 실행, 이관과 세션을 관리한다. 기본 동작은 도구 결과를 받은 뒤 모델을 다시 호출하는 것이다. 결과 처리 함수로 실행을 종료하거나 이어 갈 수도 있다. [원문](https://openai.github.io/openai-agents-python/agents/)

handoff는 다른 에이전트에 대화 이력과 제어를 넘기는 동작이다. guardrail은 입력과 출력에 검사를 수행한다. 두 기능은 선택 가능한 실행 구성으로, 모든 에이전트가 반드시 사용하는 요소는 아니다. [원문](https://openai.github.io/openai-agents-python/agents/)

## 실제 예시

없음

## 한계와 실패 조건

없음

## 혼동하기 쉬운 개념

에이전트는 실행 주체이고 MCP는 외부 도구를 연결하는 통신 규격이다. SDK의 mcp_servers 설정은 선택 사항이다. RAG는 검색한 문서를 생성에 결합하는 구성으로, 에이전트의 모든 작업이 RAG일 필요는 없다. [SDK 설정](https://openai.github.io/openai-agents-python/agents/) · [RAG 원논문 초록](https://arxiv.org/abs/2005.11401)

## 관련 개념

- → 활용: [[Knowledge/AI Systems/Model Context Protocol|MCP]] — 외부 도구 연결에 MCP를 사용할 수 있다. SDK의 MCP 서버 설정은 선택 사항이다. (원문; [근거](https://openai.github.io/openai-agents-python/agents/))
- → 활용: [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]] — 문서 검색 도구와 생성 모델을 결합하는 에이전트 작업에 RAG 구성을 사용할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://arxiv.org/abs/2005.11401))
- → 활용: [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] — 모델을 호출하는 실행은 해당 모델의 추론 실행 기반을 사용한다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://docs.vllm.ai/en/latest/))

## 최근 변화

없음

## 출처

- [OpenAI Agents SDK의 에이전트 설정](https://openai.github.io/openai-agents-python/agents/)
- [Lewis et al. RAG 원논문 초록](https://arxiv.org/abs/2005.11401)
- [vLLM 추론·서빙 문서](https://docs.vllm.ai/en/latest/)
