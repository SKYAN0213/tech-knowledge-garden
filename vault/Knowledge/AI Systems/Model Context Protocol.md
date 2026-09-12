---
title: Model Context Protocol
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-08-24
aliases:
  - MCP
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
tags:
  - AI
  - MCP
  - Protocol
---

# Model Context Protocol

## 한 문장 정의

Model Context Protocol, MCP는 AI 애플리케이션이 외부 도구, 데이터, 프롬프트 같은 기능을 공통 메시지와 생애주기로 발견하고 호출하도록 정한 개방형 연결 프로토콜입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 모델 컨텍스트 프로토콜 |
| 영어 이름 | Model Context Protocol |
| 약어 | MCP |
| 연결 주체 | host, client, server |

## 범위

**포함:** 연결 초기화, 기능 협상, tools·resources·prompts 노출, 요청·응답·알림, 전송 방식, HTTP authorization입니다.

**포함하지 않음:** 에이전트의 계획·판단 전체, 서버가 제공하는 도구의 안전성 보증, 검색 결과를 답변에 넣는 [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]] 자체는 별개입니다.

## 왜 중요한가

도구마다 독자적인 연결 코드를 만들면 재사용과 보안 검토가 어렵습니다. MCP는 연결 표면을 표준화해 여러 AI 앱이 같은 서버를 사용할 수 있게 하지만, 연결이 표준이라는 사실이 서버와 도구를 신뢰해도 된다는 뜻은 아닙니다.

## 핵심 구성 요소

- Host: 사용자가 쓰는 AI 애플리케이션
- Client: 한 MCP server와 연결을 관리하는 구성 요소
- Server: tools, resources, prompts를 제공하는 프로세스
- Capability negotiation: 지원 기능 합의
- Transport: stdio 또는 HTTP 기반 통신
- Authorization: 제한된 원격 자원 접근 권한
- Schema: 도구 입력과 출력의 구조

## 작동 원리

1. client와 server가 연결하고 프로토콜 버전·기능을 합의합니다.
2. client가 사용할 수 있는 도구·자료를 조회합니다.
3. 모델 또는 애플리케이션이 구조화된 인자로 기능을 요청합니다.
4. server가 권한을 확인하고 실행 결과 또는 오류를 반환합니다.
5. host가 결과를 다음 모델 호출이나 사용자 화면에 반영합니다.

## 실제 예시

- Obsidian MCP server가 지정 vault의 문서를 읽기 도구로 제공합니다.
- GitHub MCP server가 이슈 조회와 PR 검토 도구를 노출합니다.
- 사내 데이터 server가 tenant별 읽기 권한을 확인한 뒤 자료를 반환합니다.

## 한계와 실패 조건

- 악성·오구성 server는 표준 형식을 사용해도 위험합니다.
- tool description과 schema가 바뀌면 검토한 권한 표면과 달라질 수 있습니다.
- HTTP authorization은 선택적이므로 transport별 보안 경계를 따로 봐야 합니다.
- 너무 많은 도구를 한꺼번에 노출하면 선택 오류와 공격면이 커집니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]] | RAG는 찾은 지식을 생성에 쓰는 방식이고 MCP는 도구·데이터를 연결하는 프로토콜입니다. |
| REST API | REST는 일반 서비스 API 방식이고 MCP는 AI host가 기능을 발견·호출하는 공통 의미 구조를 더합니다. |
| [[Knowledge/AI Systems/AI Agents|AI Agents]] | 에이전트는 목표를 수행하는 시스템이고 MCP는 사용할 수 있는 연결 수단 중 하나입니다. |

## 관련 개념

- 상위: 애플리케이션 프로토콜, 도구 통합
- 하위: MCP tools, MCP resources, MCP authorization
- 함께 쓰임: [[Knowledge/AI Systems/AI Agents|AI Agents]], [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]], [[Knowledge/AI Systems/Agent Observability|Agent Observability]]
- 대비: 도구별 전용 플러그인 API

## 최근 변화

- 2026 — MCP 구현은 긴 세션 상태 의존을 줄이고 상태 없는 원격 호출과 적합성 시험을 강화하는 방향으로 발전하고 있습니다.

## 출처

- https://modelcontextprotocol.io/specification/2025-06-18
- https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
- https://github.com/modelcontextprotocol/specification
- https://blog.cloudflare.com/mcp-v2/
