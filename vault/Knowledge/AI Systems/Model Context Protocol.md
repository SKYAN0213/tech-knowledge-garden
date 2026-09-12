---
title: Model Context Protocol
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-09-13
aliases:
  - MCP
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/AI Agent Security|에이전트 보안]]"
tags:
  - AI
  - MCP
  - Protocol
last_reviewed: 2026-09-13
concept_id: mcp
label: MCP
group: 지식과 연결
keywords:
  - MCP
  - 호스트
  - 클라이언트
  - 서버
  - JSON-RPC
  - 도구
verified_sources:
  - https://modelcontextprotocol.io/specification/2025-11-25/architecture
relations: []
---

# Model Context Protocol

## 한 문장 정의

AI 호스트와 외부 기능 제공 서버가 도구·리소스·프롬프트를 교환하는 프로토콜이다. [MCP · Architecture (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/architecture)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | MCP |
| 영어 | Model Context Protocol |
| 키워드 | MCP · 호스트 · 클라이언트 · 서버 · JSON-RPC · 도구 |

## 범위

**포함:** 호스트가 관리하는 클라이언트와 서버 간 능력 협상, 메시지 교환, 보안 경계.

**포함하지 않음:** 에이전트의 계획 능력이나 연결된 도구의 정확성 보증.

## 왜 중요한가

도구 제공자와 AI 호스트가 공통 인터페이스를 쓰면 연결을 재사용할 수 있다. 동시에 권한과 문맥을 어느 주체가 관리하는지 명확해진다.

## 핵심 구성 요소

- MCP
- 호스트
- 클라이언트
- 서버
- JSON-RPC
- 도구

## 작동 원리

호스트가 서버별 클라이언트를 만들고 연결 권한을 관리한다. 서버는 기능을 노출하고 클라이언트가 요청과 응답을 중계한다. [MCP · Architecture (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/architecture)

## 실제 예시

문서 서버의 검색 도구를 AI 호스트가 발견하고 호출하는 연결.

## 한계와 실패 조건

규격을 준수해도 서버를 신뢰할 수 있다는 뜻은 아니다. 동의·인가와 다른 서버의 정보 격리는 호스트가 관리한다.

## 혼동하기 쉬운 개념

API 자체와 달리 AI 문맥 교환의 공통 인터페이스를 정의한다. RAG는 검색과 생성 방식이다.

## 관련 개념

- ← 활용: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 외부 도구 연결에 MCP를 사용할 수 있다. MCP 사용은 에이전트의 필수 조건이 아니다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture))
- ← 통제: [[Knowledge/AI Systems/AI Agent Security#한 문장 정의|에이전트 보안]] — 호스트가 연결별 동의·권한과 서버 사이의 경계를 유지한다. (해석; [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture))

## 최근 변화

- 2026 — MCP 구현은 긴 세션 상태 의존을 줄이고 상태 없는 원격 호출과 적합성 시험을 강화하는 방향으로 발전하고 있습니다.

## 출처

- [MCP · Architecture (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
