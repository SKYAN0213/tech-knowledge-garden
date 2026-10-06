# 2026-07-04 아침 브리핑

2026-07-04 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-04_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Claude Code 2.1.200, 권한 기본값과 백그라운드 세션 복구 수정](https://skyan0213.github.io/tech-knowledge-garden/news/3c9c826b5f004bf4)

발표 2026-07-04

Claude Code v2.1.200이 7월 4일 한국시간 오전 1시 52분에 공개됐다. AskUserQuestion 대화의 자동 진행을 기본으로 끄고, 기본 권한 모드 표시를 Manual로 바꿨다. 절전·복귀 후 백그라운드 세션이 중간에 멈추거나 Esc로 취소한 턴을 다시 실행하는 오류도 수정했다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 1건

#### [Claude Code 2.1.200, 권한 기본값과 백그라운드 세션 복구 수정](https://skyan0213.github.io/tech-knowledge-garden/news/3c9c826b5f004bf4)

발표 2026-07-04

제품·서비스 · 기능 변경 · 오류 수정

Claude Code v2.1.200이 7월 4일 한국시간 오전 1시 52분에 공개됐다. AskUserQuestion 대화의 자동 진행을 기본으로 끄고, 기본 권한 모드 표시를 Manual로 바꿨다. 절전·복귀 후 백그라운드 세션이 중간에 멈추거나 Esc로 취소한 턴을 다시 실행하는 오류도 수정했다.

##### 권한 설정과 플러그인 로딩

AskUserQuestion 대화에서 유휴 시간 제한을 쓰려면 /config에서 선택할 수 있다. CLI, --help, VS Code, JetBrains의 기본 권한 모드 표시는 Manual로 바뀌었고, --permission-mode manual과 "defaultMode": "manual"은 기존 default와 함께 허용된다.

.claude.json의 disabledMcpServers 또는 enabledMcpServers가 배열이 아닐 때 시작 시 충돌하는 문제를 수정했다. claude agents --plugin-dir 명령에서 플래그가 agents 뒤에 오면 플러그인의 에이전트와 스킬이 표시되지 않는 문제와, 같은 저장소의 Git worktree에서 프로젝트 범위 플러그인이 로드되지 않는 문제도 수정했다.

##### 백그라운드 세션과 데몬 복구

멈춘 세션을 다시 열 때도 작업 중간에 세션이 조용히 종료되지 않도록 수정했다. 충돌 후 남은 daemon.lock의 PID를 운영체제가 재사용하면 백그라운드 에이전트가 다시 시작되지 않는 문제도 바로잡았다.

이전 빌드를 재설치해도 그 빌드가 백그라운드 에이전트 데몬을 인수하지 않도록 수정하고, 빌드 최신 여부는 버전에 포함된 빌드 타임스탬프로 판단한다. 에이전트 명단의 일시적 손상이 고아 에이전트 정리를 영구 비활성화하는 문제, 이전 실행 파일이 새 버전의 필드를 보존하지 못하는 문제, 데몬 재시작 때 소켓 인증 토큰이 제거되는 문제도 수정했다.

##### 하위 에이전트와 터미널 출력

텍스트를 출력하기 전에 사용량 제한으로 중단된 하위 에이전트가 정상 실패 대신 빈 결과를 반환하는 문제를 수정했다. 백그라운드 에이전트 출력의 제어 바이트가 터미널로 전달되는 문제도 수정했다.

tmux 3.4 이상에서는 동기화된 터미널 출력을 활성화해 화면 깜빡임을 수정했다. 시스템 메모리 부족으로 설치가 종료되면 설치 스크립트가 해당 이유를 설명하도록 개선했다.

##### 접근성과 음성 입력

/mcp 서버 목록의 포커스가 스크린 리더와 확대 도구에서 추적되지 않는 문제를 수정했다. 스크린 리더는 장식 문자를 숨기고 대화 기록 기호를 짧은 이름으로 읽으며, 중첩 표는 Header: value. 형식으로 읽도록 개선했다.

녹음에 오디오가 없을 때 음성 입력에 Voice connection failed라는 오해를 부르는 메시지가 표시되는 문제를 수정했다.

[api.github.com 원문](https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.200)
