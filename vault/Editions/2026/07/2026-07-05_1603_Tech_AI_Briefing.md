---
title: Tech & AI Briefing - 16:03
time: 16:03
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-05
timezone: Asia/Seoul
coverage_start: 2026-07-05T08:02:00+09:00
coverage_end: 2026-07-05T16:03:00+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]"
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영
article_records:
  - title: MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Model Context Protocol
      when: 2026-07-05
      where: 미기재
      what: 참조 서버 2026.7.4 릴리스와 메모리 리소스·배포 작업 변경
      how: 리소스 읽기·구독 처리와 OIDC 배포·사전 테스트 변경
      why: 미기재
    lead: Model Context Protocol 프로젝트가 2026년 7월 5일(한국시간) 참조 서버의 GitHub 릴리스 2026.7.4를
      공개했다.
      server-memory·server-filesystem·server-sequential-thinking·server-everything
      네 패키지가 업데이트 목록에 포함됐다.
    explanations:
      - heading: 메모리 그래프를 읽고 구독하는 경로
        paragraphs:
          - 2026.6.16과 2026.7.4의 코드 비교에는 메모리 서버의 지식 그래프를
            memory://knowledge-graph 리소스로 노출하는 변경이 있다. 클라이언트는 도구 호출 없이 MCP 리소스
            프로토콜로 그래프를 발견하고 읽을 수 있다.
          - resources.subscribe 기능 선언과 구독·해제 처리기를 추가했다. 그래프가 변경되면 해당 URI를 구독한
            클라이언트에만 notifications/resources/updated 알림을 보낸다.
        source_urls:
          - https://api.github.com/repos/modelcontextprotocol/servers/compare/2026.6.16...2026.7.4
      - heading: 배포 인증과 사전 테스트
        paragraphs:
          - npm 배포 작업은 OIDC trusted publishing으로 전환하고 NPM_CONFIG_PROVENANCE 설정을
            추가했다. npm CLI 갱신 버전은 ^11.5.1로 고정했다.
          - npm 배포 전에는 npm test --if-present를, PyPI 배포 전에는 테스트 디렉터리가 있는 경우
            pytest를 실행하도록 했다. README의 .md 변경도 배포 대상 판단에 반영하도록 수정했다.
        source_urls:
          - https://api.github.com/repos/modelcontextprotocol/servers/compare/2026.6.16...2026.7.4
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영
    event_id: 90b363febceab42d
    review_status: verified
    published_at: 2026-07-05
    reviewed_at: 2026-10-07
    concept_ids:
      - mcp
    date_kind: source-publication-time
    source_published_at: 2026-07-04T23:05:56Z
---

# 이번 호 표지

MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영

# 차례

- MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영

# 커버 스토리

없음

# 뉴스 데스크

## MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Model Context Protocol

Model Context Protocol 프로젝트가 2026년 7월 5일(한국시간) 참조 서버의 GitHub 릴리스 2026.7.4를 공개했다. server-memory·server-filesystem·server-sequential-thinking·server-everything 네 패키지가 업데이트 목록에 포함됐다. [S1] [S2]

### 메모리 그래프를 읽고 구독하는 경로

2026.6.16과 2026.7.4의 코드 비교에는 메모리 서버의 지식 그래프를 memory://knowledge-graph 리소스로 노출하는 변경이 있다. 클라이언트는 도구 호출 없이 MCP 리소스 프로토콜로 그래프를 발견하고 읽을 수 있다.

resources.subscribe 기능 선언과 구독·해제 처리기를 추가했다. 그래프가 변경되면 해당 URI를 구독한 클라이언트에만 notifications/resources/updated 알림을 보낸다. [S2]

### 배포 인증과 사전 테스트

npm 배포 작업은 OIDC trusted publishing으로 전환하고 NPM_CONFIG_PROVENANCE 설정을 추가했다. npm CLI 갱신 버전은 ^11.5.1로 고정했다.

npm 배포 전에는 npm test --if-present를, PyPI 배포 전에는 테스트 디렉터리가 있는 경우 pytest를 실행하도록 했다. README의 .md 변경도 배포 대상 판단에 반영하도록 수정했다. [S2]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

없음

# Source List

- [S1] https://api.github.com/repos/modelcontextprotocol/servers/releases/tags/2026.7.4
- [S2] https://api.github.com/repos/modelcontextprotocol/servers/compare/2026.6.16...2026.7.4
