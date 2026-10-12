---
title: AI Agents
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-10-09
aliases:
  - AI Agent
  - AI 에이전트
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Model Context Protocol|MCP]]"
tags:
  - AI
  - Agent
last_reviewed: 2026-10-09
concept_id: agents
label: AI 에이전트
group: 에이전트
keywords:
  - 도구 호출
  - 실행 루프
  - 상태
  - handoff
verified_sources:
  - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.196
  - https://openai.github.io/openai-agents-python/agents/
  - https://arxiv.org/abs/2005.11401
relations:
  - target: mcp
    type: uses
    reason: 외부 도구 연결에 MCP를 사용할 수 있다. SDK의 MCP 서버 설정은 선택 사항이다.
    basis: source
    evidence:
      - https://openai.github.io/openai-agents-python/agents/
map_review:
  decision: include
  kind: mechanism
  reason: 챗봇 응답과 구별되는 도구 선택·실행 루프를 이해해야 기사 내용을 해석할 수 있다.
  reviewed: 2026-10-09
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

## 작동 원리

OpenAI Agents SDK에서 Agent는 모델·지시·도구를 설정하고 Runner가 모델 호출, 도구 실행, 이관과 세션을 관리한다. 기본 동작은 도구 결과를 받은 뒤 모델을 다시 호출하는 것이다. 결과 처리 함수로 실행을 종료하거나 이어 갈 수도 있다. [원문](https://openai.github.io/openai-agents-python/agents/)

handoff는 다른 에이전트에 대화 이력과 제어를 넘기는 동작이다. guardrail은 입력과 출력에 검사를 수행한다. 두 기능은 선택 가능한 실행 구성으로, 모든 에이전트가 반드시 사용하는 요소는 아니다. [원문](https://openai.github.io/openai-agents-python/agents/)

## 혼동하기 쉬운 개념

에이전트는 실행 주체이고 MCP는 외부 도구를 연결하는 통신 규격이다. SDK의 mcp_servers 설정은 선택 사항이다. RAG는 검색한 문서를 생성에 결합하는 구성으로, 에이전트의 모든 작업이 RAG일 필요는 없다. [SDK 설정](https://openai.github.io/openai-agents-python/agents/) · [RAG 원논문 초록](https://arxiv.org/abs/2005.11401)

## 관련 개념

- → 활용: [[Knowledge/AI Systems/Model Context Protocol|MCP]] — 외부 도구 연결에 MCP를 사용할 수 있다. SDK의 MCP 서버 설정은 선택 사항이다. (원문; [근거](https://openai.github.io/openai-agents-python/agents/))

## 최근 변화

- 2026-06-30 — Claude Code v2.1.196은 긴 백그라운드 명령과 작업을 프로세스 중지·재시작·업데이트 이후에도 유지하고, daemon 재시작으로 종료된 에이전트 worker를 다음 agents 화면 열기 때 이어서 실행하도록 개선했다. [[News/a3d36f8b621698a5|기사]] · [공식 릴리스](https://github.com/anthropics/claude-code/releases/tag/v2.1.196)

## 출처

- [OpenAI Agents SDK의 에이전트 설정](https://openai.github.io/openai-agents-python/agents/)
- [Lewis et al. RAG 원논문 초록](https://arxiv.org/abs/2005.11401)
