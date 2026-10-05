# 2026-07-10 아침 브리핑

2026-07-10 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-10_1603_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정](https://skyan0213.github.io/tech-knowledge-garden/news/060f4905c5779472)

발표 2026-07-10

Anthropic은 2026년 7월 10일 Claude Code v2.1.206을 공개하고, 프로젝트의 .claude/worktrees/ 밖에 있는 Git 작업공간으로 들어갈 때 확인을 요청하도록 바꿨습니다. MCP 서버별 요청 시간 제한이 무시되던 오류를 고치고, 백그라운드 에이전트가 프로그램 업데이트 직후 새 버전으로 갱신되도록 변경했습니다.

## 분야별 브리핑

### AI · 1건

#### [Claude Code v2.1.206, 외부 작업공간 진입 확인과 MCP 시간 제한 수정](https://skyan0213.github.io/tech-knowledge-garden/news/060f4905c5779472)

발표 2026-07-10

제품·서비스 · 기능 추가 · Anthropic

Anthropic은 2026년 7월 10일 Claude Code v2.1.206을 공개하고, 프로젝트의 .claude/worktrees/ 밖에 있는 Git 작업공간으로 들어갈 때 확인을 요청하도록 바꿨습니다. MCP 서버별 요청 시간 제한이 무시되던 오류를 고치고, 백그라운드 에이전트가 프로그램 업데이트 직후 새 버전으로 갱신되도록 변경했습니다.

##### 경로 이동·지침 점검·원격 저장소 처리

/cd에는 /add-dir과 같은 디렉터리 경로 제안이 추가됐습니다. /doctor는 저장소에 포함된 CLAUDE.md에서 Claude가 코드로 파악할 수 있는 내용을 줄이도록 제안합니다.

/commit-push-pr은 기존 origin 외에도 remote.pushDefault로 지정한 push 대상, 또는 remote가 하나뿐인 저장소의 해당 대상을 자동 허용합니다. EnterWorktree의 진입 확인은 프로젝트의 .claude/worktrees/ 밖에 있는 작업공간에 적용됩니다.

Gateway의 /login은 Anthropic이 운영하는 공개 게이트웨이 엔드포인트를 지원합니다.

##### MCP 요청 설정과 백그라운드 업데이트

--mcp-config나 .mcp.json으로 연결한 MCP 서버의 request_timeout_ms가 적용되지 않아, 새 세션의 긴 도구 호출이 기본값인 60초에서 종료되던 문제를 수정했습니다. 서버마다 지정한 시간 제한을 무시하던 설정 처리의 수정입니다.

백그라운드 에이전트의 버전 갱신은 Claude Code 업데이트 직후 수행됩니다. 이전에는 해당 에이전트에 다시 연결할 때 오래된 세션을 새 버전으로 올리느라 대기하는 방식이었습니다.

[github.com 원문](https://github.com/anthropics/claude-code/releases/tag/v2.1.206)
