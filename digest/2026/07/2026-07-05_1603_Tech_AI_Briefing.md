# 2026-07-05 아침 브리핑

2026-07-05 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-05_1603_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영](https://skyan0213.github.io/tech-knowledge-garden/news/90b363febceab42d)

발표 2026-07-05

Model Context Protocol 프로젝트가 2026년 7월 5일(한국시간) 참조 서버의 GitHub 릴리스 2026.7.4를 공개했다. server-memory·server-filesystem·server-sequential-thinking·server-everything 네 패키지가 업데이트 목록에 포함됐다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 1건

#### [MCP 참조 서버 2026.7.4, 메모리 그래프 리소스·구독 기능 반영](https://skyan0213.github.io/tech-knowledge-garden/news/90b363febceab42d)

발표 2026-07-05

제품·서비스 · 기능 추가 · Model Context Protocol

Model Context Protocol 프로젝트가 2026년 7월 5일(한국시간) 참조 서버의 GitHub 릴리스 2026.7.4를 공개했다. server-memory·server-filesystem·server-sequential-thinking·server-everything 네 패키지가 업데이트 목록에 포함됐다.

##### 메모리 그래프를 읽고 구독하는 경로

2026.6.16과 2026.7.4의 코드 비교에는 메모리 서버의 지식 그래프를 memory://knowledge-graph 리소스로 노출하는 변경이 있다. 클라이언트는 도구 호출 없이 MCP 리소스 프로토콜로 그래프를 발견하고 읽을 수 있다.

resources.subscribe 기능 선언과 구독·해제 처리기를 추가했다. 그래프가 변경되면 해당 URI를 구독한 클라이언트에만 notifications/resources/updated 알림을 보낸다.

##### 배포 인증과 사전 테스트

npm 배포 작업은 OIDC trusted publishing으로 전환하고 NPM\_CONFIG\_PROVENANCE 설정을 추가했다. npm CLI 갱신 버전은 ^11.5.1로 고정했다.

npm 배포 전에는 npm test --if-present를, PyPI 배포 전에는 테스트 디렉터리가 있는 경우 pytest를 실행하도록 했다. README의 .md 변경도 배포 대상 판단에 반영하도록 수정했다.

[api.github.com 원문](https://api.github.com/repos/modelcontextprotocol/servers/releases/tags/2026.7.4) · [api.github.com 원문](https://api.github.com/repos/modelcontextprotocol/servers/compare/2026.6.16...2026.7.4)
