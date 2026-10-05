# 2026-07-24 아침 브리핑

2026-07-24 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-24_0800_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [ChatGPT Health, 미국 성인 이용자에게 의료기록·Apple Health 연결 제공](https://skyan0213.github.io/tech-knowledge-garden/news/f2d1b40c0608be47)

발표 2026-07-23

OpenAI는 7월 23일 미국의 18세 이상 로그인 이용자에게 ChatGPT Health를 웹과 iOS에서 단계적으로 제공한다고 발표했다. 이용자가 의료기록과 Apple Health를 연결하고 사용을 허용하면, ChatGPT가 검사 결과·수면·활동 기록을 대화에 활용할 수 있다.

### [GitHub Issues, 에이전트 변경에 확신도·이유·승인 제안 표시](https://skyan0213.github.io/tech-knowledge-garden/news/315398693b2d0d19)

발표 2026-07-23

GitHub는 7월 23일 Issues에서 에이전트의 변경 제안·확신도·이유를 표시하는 기능을 공개 미리보기로 제공했다. 제안 방식으로 실행한 자동화의 변경은 검토 패널에서 대기하며, 사용자가 건별 또는 일괄로 승인·거절할 수 있다.

### [Linear 이슈를 Copilot에 배정해 초안 PR 생성, 연동 정식 제공](https://skyan0213.github.io/tech-knowledge-garden/news/2b6a41b2be21650d)

발표 2026-07-23

GitHub는 7월 23일 Linear 이슈를 Copilot 클라우드 에이전트에 배정하는 연동을 정식 제공한다고 발표했다. 에이전트는 GitHub Actions의 별도 임시 개발 환경에서 작업해 초안 PR을 만들고 Linear 활동 화면에 진행 상황을 전달한다.

### [GitHub MCP Server, 세션을 없애는 차기 MCP 규격 사전 지원](https://skyan0213.github.io/tech-knowledge-garden/news/12e0b107d161c130)

발표 2026-07-23

GitHub는 7월 23일 공식 MCP Server가 7월 28일 공개 예정인 차기 MCP 규격을 미리 지원한다고 발표했다. 차기 규격은 세션과 initialize를 제거하며, GitHub는 서버의 Redis 세션과 초기화·요청별 데이터베이스 작업을 없앴다고 밝혔다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 3건

#### [GitHub Issues, 에이전트 변경에 확신도·이유·승인 제안 표시](https://skyan0213.github.io/tech-knowledge-garden/news/315398693b2d0d19)

발표 2026-07-23

제품·서비스 · 기능 추가 · GitHub

GitHub는 7월 23일 Issues에서 에이전트의 변경 제안·확신도·이유를 표시하는 기능을 공개 미리보기로 제공했다. 제안 방식으로 실행한 자동화의 변경은 검토 패널에서 대기하며, 사용자가 건별 또는 일괄로 승인·거절할 수 있다.

##### 확신도에 따른 자동 적용과 검토

지원 행동의 확신도는 높음·중간·낮음으로 표시된다. 높은 확신도는 자동 적용되고 중간·낮음은 제안으로 보류되며, 저장소 관리자가 기준을 조정할 수 있다.

자동 적용 여부와 관계없이 변경 이유가 기록된다. has:suggestions 검색으로 검토 대기 이슈를 찾을 수 있다.

##### 지원 행동과 권한 경계

라벨·필드·이슈 유형·닫기·담당자 변경에 적용된다. Agentic Workflows·Copilot 클라우드 에이전트 자동화와 REST·GraphQL API에서 사용할 수 있다.

GitHub는 승인이 서버의 권한 경계를 강제하는 보안 통제는 아니라고 설명했다. 이슈 변경 권한을 가진 에이전트는 제안 대신 변경을 직접 적용할 수 있다.

[GitHub 원문](https://github.blog/changelog/2026-07-23-agent-automation-controls-in-github-issues-in-public-preview/)

#### [Linear 이슈를 Copilot에 배정해 초안 PR 생성, 연동 정식 제공](https://skyan0213.github.io/tech-knowledge-garden/news/2b6a41b2be21650d)

발표 2026-07-23

제품·서비스 · 기능 추가 · GitHub

GitHub는 7월 23일 Linear 이슈를 Copilot 클라우드 에이전트에 배정하는 연동을 정식 제공한다고 발표했다. 에이전트는 GitHub Actions의 별도 임시 개발 환경에서 작업해 초안 PR을 만들고 Linear 활동 화면에 진행 상황을 전달한다.

##### 작업 설정과 실행 중 지시

Linear에서 모델·저장소의 사용자 정의 에이전트·PR 대상 브랜치·커밋 작업 브랜치를 정할 수 있다. 설정은 이슈별 또는 워크스페이스·팀 안내로 적용한다.

작업 중 댓글에서 Copilot을 언급해 지시를 바꿀 수 있다. 작업이 끝나면 사용자에게 PR 검토를 요청한다.

##### 설치 권한과 요금제

설치에는 GitHub 조직 소유자 권한과 Linear 워크스페이스 관리자 권한이 필요하다. Copilot 클라우드 에이전트는 Pro·Pro+·Business·Enterprise 요금제에서 제공된다.

[GitHub 원문](https://github.blog/changelog/2026-07-23-copilot-cloud-agent-for-linear-is-now-generally-available/)

#### [GitHub MCP Server, 세션을 없애는 차기 MCP 규격 사전 지원](https://skyan0213.github.io/tech-knowledge-garden/news/12e0b107d161c130)

발표 2026-07-23

표준·생태계 · 표준 채택 · 호환성 · GitHub

GitHub는 7월 23일 공식 MCP Server가 7월 28일 공개 예정인 차기 MCP 규격을 미리 지원한다고 발표했다. 차기 규격은 세션과 initialize를 제거하며, GitHub는 서버의 Redis 세션과 초기화·요청별 데이터베이스 작업을 없앴다고 밝혔다.

##### 요청 처리 방식의 변경

클라이언트는 연결 핸드셰이크를 병렬로 진행할 수 있다고 GitHub는 설명했다. 로깅과 비밀정보 검사에 필요한 값은 규격이 보장하는 HTTP 헤더에서 읽어, SDK 처리 전에 모든 요청 본문을 검사하던 방식을 바꿨다.

##### 이전 클라이언트 호환과 적합성 시험

GitHub MCP Server는 공식 Go SDK를 사용한다. 1등급 SDK는 이전 버전 호환을 유지한 베타 지원을 제공하며, Go SDK의 래퍼가 URL elicitation의 이전 방식과 단계별 HTTP 요청 방식을 함께 지원한다.

공식 적합성 시험·초안 규격 문서·SDK 구현을 이용해 자체 MCP 클라이언트와 서버를 검증할 수 있다고 GitHub는 안내했다.

[GitHub 원문](https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/)

### 바이오·의료기술 · 1건

#### [ChatGPT Health, 미국 성인 이용자에게 의료기록·Apple Health 연결 제공](https://skyan0213.github.io/tech-knowledge-garden/news/f2d1b40c0608be47)

발표 2026-07-23

제품·서비스 · 기능 추가 · OpenAI

OpenAI는 7월 23일 미국의 18세 이상 로그인 이용자에게 ChatGPT Health를 웹과 iOS에서 단계적으로 제공한다고 발표했다. 이용자가 의료기록과 Apple Health를 연결하고 사용을 허용하면, ChatGPT가 검사 결과·수면·활동 기록을 대화에 활용할 수 있다.

##### 연결할 수 있는 기록과 이용 범위

Free·Go·Plus·Pro 요금제가 대상이다. Apple Health, 지원되는 미국 병원의 의료기록, One Medical, Function Health를 연결하며, 허용한 정보는 일반 대화에서도 사용할 수 있다.

웨어러블 앱이 Apple Health에 공유한 정보도 활용할 수 있다. 앱과 지표에 따라 제공 정보가 달라지고 독자 점수 일부는 전달되지 않을 수 있다.

##### 정보 사용 허가와 학습 설정

발표 당시 기본 설정은 연결 의료기록과 Apple Health 정보를 사용하기 전에 허가를 묻는 방식이었다. 요청별 허용 또는 항상 허용을 선택하고 설정에서 변경할 수 있다.

OpenAI는 연결한 건강 정보와 이를 사용하는 대화를 기반 모델 학습이나 광고 표적화에 쓰지 않는다고 밝혔다. 연결 데이터를 쓰지 않는 대화에는 일반 학습 설정이 적용된다.

##### 연결 해제·대화 삭제·메모리

연결 계정을 해제하면 해당 출처의 동기화 데이터는 30일 이내 삭제되지만, 대화에 이미 포함된 정보는 그 대화를 삭제할 때까지 남는다.

건강 대화에서는 메모리가 생성될 수 있으나 연결 의료기록이나 Apple Health 정보에서 직접 생성하지는 않는다. 임시 대화나 메모리 설정으로 이를 관리할 수 있다.

[OpenAI 원문](https://openai.com/index/health-in-chatgpt/)
