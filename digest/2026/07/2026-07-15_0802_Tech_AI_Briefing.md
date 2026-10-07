# 2026-07-15 아침 브리핑

2026-07-15 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-15_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GitHub, PR 자동 AI 보안 검사 공개 미리보기](https://skyan0213.github.io/tech-knowledge-garden/news/27d181b6a4903b28)

발표 2026-07-15

GitHub가 2026년 7월 15일(한국시간) 풀 리퀘스트(PR)에 AI 보안 탐지 결과를 표시하는 공개 미리보기를 시작했다. AI 엔진은 PR이 열리거나 갱신될 때 자동으로 실행되며, CodeQL이 지원하지 않는 언어·프레임워크까지 탐지 범위를 넓힌다.

### [GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가](https://skyan0213.github.io/tech-knowledge-garden/news/fe469724f5828fb0)

발표 2026-07-14

GitHub는 2026년 7월 14일(한국시간) Copilot 앱에 /security-review 명령을 공개 미리보기로 제공한다고 밝혔다. 해당 명령어는 진행 중인 코드 변경 사항을 분석해 심각도와 신뢰도 점수를 매긴 보안 이슈와 적용 가능한 개선 제안을 제시한다. 공개 미리보기 기간에는 Copilot Free·Pro·Business·Enterprise 사용자가 이용할 수 있다.

### [Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성](https://skyan0213.github.io/tech-knowledge-garden/news/55f3f57477bf071c)

발표 2026-07-15

GitHub가 2026년 7월 15일(한국시간) Dependabot의 일반 버전 업데이트 기본값을 바꿨다. 새 릴리스가 패키지 레지스트리에 공개된 뒤 최소 3일이 지나야 업데이트 풀 리퀘스트(PR)를 생성한다. 보안 업데이트 PR은 기존처럼 즉시 생성한다.

## 분야별 브리핑

### 사이버보안 · 3건

#### [GitHub, PR 자동 AI 보안 검사 공개 미리보기](https://skyan0213.github.io/tech-knowledge-garden/news/27d181b6a4903b28)

발표 2026-07-15

제품·서비스 · 기능 추가 · GitHub

GitHub가 2026년 7월 15일(한국시간) 풀 리퀘스트(PR)에 AI 보안 탐지 결과를 표시하는 공개 미리보기를 시작했다. AI 엔진은 PR이 열리거나 갱신될 때 자동으로 실행되며, CodeQL이 지원하지 않는 언어·프레임워크까지 탐지 범위를 넓힌다.

##### 결과 표시와 병합

분석 결과가 나오는 대로 PR에 표시하며, AI로 생성한 경고에는 AI 라벨을 붙여 CodeQL 결과와 구분한다. 결과는 정보 제공용으로 PR 병합을 차단하지 않는다.

##### 활성화·과금 조건

GitHub Code Security(GitHub Advanced Security) 고객을 대상으로 github.com에서 제공한다. 기업 정책의 허용, 조직 단위 활성화, 저장소의 CodeQL 기본 분석 설정이 필요하다. AI 분석은 CodeQL 대신 AI 엔진이 수행한다.

공개 미리보기에서도 GitHub Copilot 라이선스가 필요하고, 탐지를 실행할 때 조직의 AI 크레딧을 사용한다.

[GitHub 원문](https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/)

#### [GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가](https://skyan0213.github.io/tech-knowledge-garden/news/fe469724f5828fb0)

발표 2026-07-14

제품·서비스 · 기능 추가 · GitHub

GitHub는 2026년 7월 14일(한국시간) Copilot 앱에 /security-review 명령을 공개 미리보기로 제공한다고 밝혔다. 해당 명령어는 진행 중인 코드 변경 사항을 분석해 심각도와 신뢰도 점수를 매긴 보안 이슈와 적용 가능한 개선 제안을 제시한다. 공개 미리보기 기간에는 Copilot Free·Pro·Business·Enterprise 사용자가 이용할 수 있다.

##### 요청 시 검사하는 로컬 변경

GitHub는 인젝션, 크로스사이트 스크립팅, 안전하지 않은 데이터 처리, 경로 조작, 약한 암호화 등의 취약점을 찾도록 설계했다고 설명했다.

개발자가 작업 중인 로컬 변경을 필요할 때 검사하는 방식이다. 기존 code scanning·Dependabot·secret scanning을 보완한다.

[GitHub 원문](https://github.blog/changelog/2026-07-14-security-reviews-now-available-in-the-github-copilot-app/)

#### [Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성](https://skyan0213.github.io/tech-knowledge-garden/news/55f3f57477bf071c)

발표 2026-07-15

제품·서비스 · 기능 변경 · GitHub

GitHub가 2026년 7월 15일(한국시간) Dependabot의 일반 버전 업데이트 기본값을 바꿨다. 새 릴리스가 패키지 레지스트리에 공개된 뒤 최소 3일이 지나야 업데이트 풀 리퀘스트(PR)를 생성한다. 보안 업데이트 PR은 기존처럼 즉시 생성한다.

##### 적용 범위와 설정

github.com의 모든 지원 생태계에 기본 적용하며, .github/dependabot.yml의 cooldown 옵션으로 기간을 바꾸거나 대기를 해제할 수 있다. GitHub Enterprise Server에는 3.23에서 적용할 예정이다.

[GitHub 원문](https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/)
