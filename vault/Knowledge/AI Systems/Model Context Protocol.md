---
title: Model Context Protocol
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-10-05
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
last_reviewed: 2026-10-05
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
  - https://blog.modelcontextprotocol.io/posts/2026-07-28/
  - https://blog.cloudflare.com/mcp-v2/
  - https://openai.github.io/openai-agents-python/agents/
  - https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/
relations: []
map_review:
  decision: include
  kind: protocol
  reason: AI 호스트와 외부 도구 서버의 통신 역할과 메시지 규격을 별도로 익혀야 한다.
  reviewed: 2026-10-05
---

# Model Context Protocol

## 한 문장 정의

AI 호스트와 외부 기능 제공 서버가 도구·리소스·프롬프트를 교환하는 프로토콜이다. [MCP 아키텍처](https://modelcontextprotocol.io/specification/2025-11-25/architecture)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | MCP |
| 영어 | Model Context Protocol |

## 범위

**포함:** 호스트·클라이언트·서버의 도구·리소스·프롬프트 교환 규격.

**포함하지 않음:** 애플리케이션의 모든 상태 관리. 프로토콜 세션 제거가 애플리케이션 상태 제거를 뜻하지 않는다.

[원문](https://modelcontextprotocol.io/specification/2025-11-25/architecture)

## 왜 중요한가

없음

## 핵심 구성 요소

없음

## 작동 원리

2025-11-25 아키텍처에서 호스트는 서버별 클라이언트, 연결 권한과 동의를 관리하고 여러 클라이언트의 문맥을 모은다. 서버는 도구·리소스·프롬프트를 노출하며 필요한 문맥만 받는다. 서버 사이의 정보 격리는 호스트가 관리한다. [원문](https://modelcontextprotocol.io/specification/2025-11-25/architecture)

## 실제 예시

없음

## 한계와 실패 조건

없음

## 혼동하기 쉬운 개념

프로토콜의 세션과 애플리케이션의 상태는 다르다. 2026-07-28 규격은 필수 연결 초기화와 프로토콜 세션을 요청 경로에서 제거했다. 애플리케이션이 상태를 유지해야 한다면 명시적 핸들을 전달하는 방식 등을 사용할 수 있다. [규격 발표](https://blog.modelcontextprotocol.io/posts/2026-07-28/)

## 관련 개념

- ← 활용: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 외부 MCP 서버의 도구를 사용할 수 있다. OpenAI Agents SDK에서 MCP 서버 설정은 선택 사항이다. (원문; [근거](https://openai.github.io/openai-agents-python/agents/))
- ← 통제: [[Knowledge/AI Systems/AI Agent Security#한 문장 정의|에이전트 보안]] — 호스트가 연결 권한·동의와 서버 사이의 정보 경계를 관리한다. (원문; [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture))

## 최근 변화

- 2026-07-23 — GitHub는 7월 28일 공개 예정인 차기 규격을 공식 MCP Server에서 사전 지원한다고 발표했다. Redis 세션과 초기화·요청별 데이터베이스 작업을 제거했으며 이전 클라이언트 호환을 유지한 Go SDK 베타 지원과 적합성 시험을 안내했다. [[News/12e0b107d161c130|기사]] · [원문](https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/)
- 2026-07-28 — MCP 유지관리팀이 무상태 요청·응답 코어와 MRTR을 포함한 새 규격을 공개했다. [원문](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- 2026-08-06 — Cloudflare가 Workers에서 새 규격을 지원한다고 발표했다. 애플리케이션 자체에 상태가 필요한 경우에는 Durable Objects를 계속 사용할 수 있다고 설명했다. [원문](https://blog.cloudflare.com/mcp-v2/)

## 출처

- [MCP 아키텍처 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [MCP 규격 발표 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [Cloudflare의 새 규격 지원 안내](https://blog.cloudflare.com/mcp-v2/)
- [OpenAI Agents SDK의 에이전트 설정](https://openai.github.io/openai-agents-python/agents/)

- [GitHub MCP Server 사전 지원 2026-07-23](https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/)
