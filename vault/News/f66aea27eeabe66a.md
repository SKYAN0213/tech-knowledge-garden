---
title: Cloudflare, 무상태 MCP 규격을 Workers에서 지원
type: news
schema_version: tech-news/v1
date: 2026-08-07
created: 2026-08-07
updated: 2026-08-07
event_id: f66aea27eeabe66a
review_status: verified
concept_ids:
  - mcp
published_at: 2026-08-06
reviewed_at: 2026-10-05
source_url: https://blog.cloudflare.com/mcp-v2/
sources:
  - https://blog.cloudflare.com/mcp-v2/
  - https://blog.modelcontextprotocol.io/posts/2026-07-28/
  - https://blog.cloudflare.com/the-agentic-internet/
concepts:
  - Knowledge/AI Systems/Model Context Protocol
description: Cloudflare는 2026년 8월 6일 새 MCP 규격을 자사 플랫폼에서 사용할 수 있으며, Workers에 무상태
  MCP 서버를 배포할 수 있다고 발표했다. 이 규격은 MCP 유지관리팀이 7월 28일 공개한 것으로, 필수 핸드셰이크와
  Mcp-Session-Id 헤더를 핵심 요청 경로에서 제거했다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 표준·생태계
secondary_theme: null
event_tags:
  - 표준 채택
  - 호환성
entities:
  - Cloudflare
tags:
  - sector/software-cloud
  - theme/ecosystem
  - event/표준-채택
  - event/호환성
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: Cloudflare는 2026년 8월 6일 새 MCP 규격을 자사 플랫폼에서 사용할 수 있으며, Workers에 무상태 MCP 서버를
  배포할 수 있다고 발표했다. 이 규격은 MCP 유지관리팀이 7월 28일 공개한 것으로, 필수 핸드셰이크와 Mcp-Session-Id 헤더를
  핵심 요청 경로에서 제거했다.
facts:
  who: Cloudflare
  when: 2026-08-06
  where: 미기재
  what: MCP 2026-07-28 규격의 Cloudflare 지원
  how: Workers와 Agents SDK를 통한 무상태 MCP 서버 지원
  why: 미기재
explanations:
  - heading: 요청의 상태와 애플리케이션의 상태를 구분
    paragraphs:
      - 무상태가 되는 것은 프로토콜의 요청 경로다. 애플리케이션에 상태가 필요하면 상태를 계속 유지할 수 있으며, Cloudflare는
        이런 경우 Durable Objects를 사용하도록 안내했다. Agents SDK도 새 규격을 지원한다.
    source_urls:
      - https://blog.cloudflare.com/mcp-v2/
      - https://blog.modelcontextprotocol.io/posts/2026-07-28/
  - heading: 사용자 입력과 기존 서버의 이전 방식
    paragraphs:
      - MRTR은 서버가 input_required 결과로 필요한 입력을 요청하면 클라이언트가 답을 inputResponses에 담아
        원래 작업을 다시 요청하는 방식이다. 사용자 답변을 기다리는 동안 양방향 스트림을 계속 열어 둘 필요가 없다.
      - 새 Streamable HTTP 요청에는 Mcp-Method와 Mcp-Name 헤더가 필요하다. Cloudflare의 /mcp
        경로는 2025년 Streamable HTTP 클라이언트의 무상태 요청도 받지만, 이전 세션이나 독립 스트림에 의존하는 서버에는
        별도 이전 작업이 필요하다고 설명했다.
      - 이 규격에서 deprecated 상태가 된 기능은 제거 전까지 최소 12개월의 이전 기간을 제공한다.
    source_urls:
      - https://blog.cloudflare.com/mcp-v2/
      - https://blog.modelcontextprotocol.io/posts/2026-07-28/
  - heading: Cloudflare가 설명한 공개 표준의 역할
    paragraphs:
      - Cloudflare는 에이전트용 인터넷 소개에서 MCP를 x402, Web Bot Auth, PACT와 함께 누구나 구현할 수
        있는 공개 표준으로 설명했다. 사이트 운영자가 인증 제공업체·결제 처리업체·에이전트 파트너를 선택한다고 밝혔다.
    source_urls:
      - https://blog.cloudflare.com/the-agentic-internet/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# Cloudflare, 무상태 MCP 규격을 Workers에서 지원


Cloudflare는 2026년 8월 6일 새 MCP 규격을 자사 플랫폼에서 사용할 수 있으며, Workers에 무상태 MCP 서버를 배포할 수 있다고 발표했다. 이 규격은 MCP 유지관리팀이 7월 28일 공개한 것으로, 필수 핸드셰이크와 Mcp-Session-Id 헤더를 핵심 요청 경로에서 제거했다. [원문 1](<https://blog.cloudflare.com/mcp-v2/>) [원문 2](<https://blog.modelcontextprotocol.io/posts/2026-07-28/>) [원문 3](<https://blog.cloudflare.com/the-agentic-internet/>)

### 요청의 상태와 애플리케이션의 상태를 구분

무상태가 되는 것은 프로토콜의 요청 경로다. 애플리케이션에 상태가 필요하면 상태를 계속 유지할 수 있으며, Cloudflare는 이런 경우 Durable Objects를 사용하도록 안내했다. Agents SDK도 새 규격을 지원한다. [원문 1](<https://blog.cloudflare.com/mcp-v2/>) [원문 2](<https://blog.modelcontextprotocol.io/posts/2026-07-28/>)

### 사용자 입력과 기존 서버의 이전 방식

MRTR은 서버가 input_required 결과로 필요한 입력을 요청하면 클라이언트가 답을 inputResponses에 담아 원래 작업을 다시 요청하는 방식이다. 사용자 답변을 기다리는 동안 양방향 스트림을 계속 열어 둘 필요가 없다.

새 Streamable HTTP 요청에는 Mcp-Method와 Mcp-Name 헤더가 필요하다. Cloudflare의 /mcp 경로는 2025년 Streamable HTTP 클라이언트의 무상태 요청도 받지만, 이전 세션이나 독립 스트림에 의존하는 서버에는 별도 이전 작업이 필요하다고 설명했다.

이 규격에서 deprecated 상태가 된 기능은 제거 전까지 최소 12개월의 이전 기간을 제공한다. [원문 1](<https://blog.cloudflare.com/mcp-v2/>) [원문 2](<https://blog.modelcontextprotocol.io/posts/2026-07-28/>)

### Cloudflare가 설명한 공개 표준의 역할

Cloudflare는 에이전트용 인터넷 소개에서 MCP를 x402, Web Bot Auth, PACT와 함께 누구나 구현할 수 있는 공개 표준으로 설명했다. 사이트 운영자가 인증 제공업체·결제 처리업체·에이전트 파트너를 선택한다고 밝혔다. [원문 3](<https://blog.cloudflare.com/the-agentic-internet/>)

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]



## 이어 읽기

- [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]

## 이 소식을 다룬 브리핑

- [[Briefings/2026/08/2026-08-07_0802_Tech_AI_Briefing|2026-08-07 브리핑]]
