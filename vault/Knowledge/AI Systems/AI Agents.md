---
title: AI Agents
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-09-11
aliases:
  - AI Agent
  - AI 에이전트
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]"
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
tags:
  - AI
  - Agent
---

# AI Agents

## 한 문장 정의

AI Agent는 목표를 받아 상황을 해석하고, 필요한 도구와 정보를 선택하며, 여러 단계를 실행하고, 결과를 확인해 다음 행동을 정하는 AI 시스템입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | AI 에이전트 |
| 영어 이름 | AI Agent |
| 핵심 차이 | 답변 생성에 그치지 않고 상태를 바꾸는 행동 수행 |
| 기본 구성 | 지시, 모델, 도구, 실행 루프, 상태, 제어 |

## 범위

**포함:** 목표 해석, 계획, 검색·도구 호출, handoff, 상태·메모리 사용, 결과 확인, 중단과 사람 이관을 갖춘 시스템입니다.

**포함하지 않음:** 한 번의 질문에 텍스트만 답하는 일반 챗봇, 단순한 고정 순서 자동화, 특정 연결 규격인 [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]] 자체는 별개입니다.

## 왜 중요한가

에이전트는 자연어를 실제 업무 흐름과 연결합니다. 그래서 모델 성능뿐 아니라 도구 권한, 실행 상태, 실패 복구, 평가, 관측, 사람 승인까지 제품 품질의 일부가 됩니다.

## 핵심 구성 요소

- 목표와 지시
- 언어·추론 모델
- 검색, 코드, 파일, API 같은 도구
- 다음 행동을 정하는 실행 루프
- 세션 상태와 필요한 메모리
- guardrail, 승인, 중단, 이관
- 결과를 판정하는 [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]

## 작동 원리

1. 목표와 현재 상태를 입력받습니다.
2. 모델이 다음 단계와 필요한 도구를 고릅니다.
3. 런타임이 권한을 확인하고 도구를 실행합니다.
4. 결과를 상태에 반영하고 완료·재시도·이관을 결정합니다.
5. 완료 조건이나 중단 조건에 도달할 때까지 반복합니다.

## 실제 예시

- 최신 원문을 찾아 중복을 제거하고 Obsidian에 브리핑을 저장합니다.
- 저장소를 읽고 코드를 수정한 뒤 테스트 결과로 완료 여부를 판단합니다.
- 일정 후보를 찾고 충돌을 확인한 뒤 사람의 승인을 받아 예약합니다.

## 한계와 실패 조건

- 목표가 모호하면 그럴듯하지만 다른 일을 끝낼 수 있습니다.
- 도구 오류와 외부 상태 변화 때문에 같은 입력도 결과가 달라질 수 있습니다.
- 긴 실행에서 비용·지연·상태 불일치·무한 반복이 커집니다.
- 권한이 크면 프롬프트 주입과 잘못된 판단이 실제 피해로 이어집니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| 챗봇 | 챗봇은 대화 응답이 중심이고 에이전트는 도구로 실제 행동을 수행합니다. |
| 워크플로 자동화 | 고정 워크플로는 경로가 미리 정해지고, 에이전트는 상황에 따라 경로를 선택할 수 있습니다. |
| [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]] | MCP는 도구 연결 규격이고 에이전트는 목표를 수행하는 전체 시스템입니다. |

## 관련 개념

- 상위: 지능형 시스템, 업무 자동화
- 하위: 단일 에이전트, 다중 에이전트, 코딩 에이전트
- 함께 쓰임: [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]], [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]], [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]], [[Knowledge/AI Systems/Agent Observability|Agent Observability]]
- 대비: 고정 규칙 자동화

## 최근 변화

- 2026-09-10 — OpenAI가 Agents API 공개 베타로 문맥 압축·도구 탐색·하위 에이전트 실행을 관리 서비스에 묶었습니다. 실행 관리 계층과 계산 환경의 선택을 나누는 구현 방식이며, 업무별 신뢰성은 별도 평가 대상입니다. [source](https://openai.com/index/introducing-the-agents-api/)

- 2026 — OpenAI Agents SDK는 도구, handoff, guardrail, 세션, tracing을 에이전트 런타임의 기본 요소로 문서화했습니다.

## 출처

- https://openai.github.io/openai-agents-python/agents/
- https://openai.github.io/openai-agents-python/running_agents/
- https://openai.github.io/openai-agents-python/tools/
- https://openai.github.io/openai-agents-python/multi_agent/
- https://openai.com/index/introducing-the-agents-api/
