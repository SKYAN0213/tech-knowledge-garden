---
title: Tech & AI Briefing - 16:03
time: 16:03
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-10
timezone: Asia/Seoul
coverage_start: 2026-07-10T08:02:00+09:00
coverage_end: 2026-07-10T16:03:00+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 1
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - "[[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security
    and Governance]]"
  - Knowledge/AI Systems/Model Context Protocol
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정
article_records:
  - title: Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Anthropic
      when: 2026-07-10
      where: 미기재
      what: Claude Code v2.1.206 업데이트
      how: 명령어 기능 추가 및 버그 수정
      why: 미기재
    lead: Anthropic은 2026년 7월 10일 Claude Code v2.1.206을 공개하고, 프로젝트의
      .claude/worktrees/ 밖에 있는 Git 작업공간으로 들어갈 때 확인을 요청하도록 바꿨습니다. MCP 서버별 요청 시간
      제한이 무시되던 오류를 고치고, 백그라운드 에이전트가 프로그램 업데이트 직후 새 버전으로 갱신되도록 변경했습니다.
    explanations:
      - heading: 경로 이동·지침 점검·원격 저장소 처리
        paragraphs:
          - /cd에는 /add-dir과 같은 디렉터리 경로 제안이 추가됐습니다. /doctor는 저장소에 포함된 CLAUDE.md에서
            Claude가 코드로 파악할 수 있는 내용을 줄이도록 제안합니다.
          - /commit-push-pr은 기존 origin 외에도 remote.pushDefault로 지정한 push 대상, 또는
            remote가 하나뿐인 저장소의 해당 대상을 자동 허용합니다. EnterWorktree의 진입 확인은 프로젝트의
            .claude/worktrees/ 밖에 있는 작업공간에 적용됩니다.
          - Gateway의 /login은 Anthropic이 운영하는 공개 게이트웨이 엔드포인트를 지원합니다.
        source_urls:
          - https://github.com/anthropics/claude-code/releases/tag/v2.1.206
      - heading: MCP 요청 설정과 백그라운드 업데이트
        paragraphs:
          - --mcp-config나 .mcp.json으로 연결한 MCP 서버의 request_timeout_ms가 적용되지 않아, 새
            세션의 긴 도구 호출이 기본값인 60초에서 종료되던 문제를 수정했습니다. 서버마다 지정한 시간 제한을 무시하던 설정 처리의
            수정입니다.
          - 백그라운드 에이전트의 버전 갱신은 Claude Code 업데이트 직후 수행됩니다. 이전에는 해당 에이전트에 다시 연결할 때
            오래된 세션을 새 버전으로 올리느라 대기하는 방식이었습니다.
        source_urls:
          - https://github.com/anthropics/claude-code/releases/tag/v2.1.206
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정
    event_id: 060f4905c5779472
    review_status: verified
    published_at: 2026-07-10
    reviewed_at: 2026-10-06
    concept_ids:
      - mcp
    date_kind: source-publication-time
    source_published_at: 2026-07-10T01:45:26Z
---

# 이번 호 표지

Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정

# 차례

- Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정

# 커버 스토리

없음

# 뉴스 데스크

## Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Anthropic

Anthropic은 2026년 7월 10일 Claude Code v2.1.206을 공개하고, 프로젝트의 .claude/worktrees/ 밖에 있는 Git 작업공간으로 들어갈 때 확인을 요청하도록 바꿨습니다. MCP 서버별 요청 시간 제한이 무시되던 오류를 고치고, 백그라운드 에이전트가 프로그램 업데이트 직후 새 버전으로 갱신되도록 변경했습니다. [S1]

### 경로 이동·지침 점검·원격 저장소 처리

/cd에는 /add-dir과 같은 디렉터리 경로 제안이 추가됐습니다. /doctor는 저장소에 포함된 CLAUDE.md에서 Claude가 코드로 파악할 수 있는 내용을 줄이도록 제안합니다.

/commit-push-pr은 기존 origin 외에도 remote.pushDefault로 지정한 push 대상, 또는 remote가 하나뿐인 저장소의 해당 대상을 자동 허용합니다. EnterWorktree의 진입 확인은 프로젝트의 .claude/worktrees/ 밖에 있는 작업공간에 적용됩니다.

Gateway의 /login은 Anthropic이 운영하는 공개 게이트웨이 엔드포인트를 지원합니다. [S1]

### MCP 요청 설정과 백그라운드 업데이트

--mcp-config나 .mcp.json으로 연결한 MCP 서버의 request_timeout_ms가 적용되지 않아, 새 세션의 긴 도구 호출이 기본값인 60초에서 종료되던 문제를 수정했습니다. 서버마다 지정한 시간 제한을 무시하던 설정 처리의 수정입니다.

백그라운드 에이전트의 버전 갱신은 Claude Code 업데이트 직후 수행됩니다. 이전에는 해당 에이전트에 다시 연결할 때 오래된 세션을 새 버전으로 올리느라 대기하는 방식이었습니다. [S1]

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

- [S1] https://github.com/anthropics/claude-code/releases/tag/v2.1.206
