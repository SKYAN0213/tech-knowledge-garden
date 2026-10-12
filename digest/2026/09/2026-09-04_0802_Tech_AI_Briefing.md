# 2026-09-04 아침 브리핑

2026-09-04 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [npm, 패키지 하나에 여러 OIDC 배포 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac)

발표 2026-09-03

GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에 저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는 악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다.

### [GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb)

발표 2026-09-03

GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB\_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다.

### [CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선](https://skyan0213.github.io/tech-knowledge-garden/news/13cebc4d5ec60b11)

발표 2026-09-03

GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의 위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를 추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다.

## 분야별 브리핑

### 사이버보안 · 3건

#### [npm, 패키지 하나에 여러 OIDC 배포 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac)

발표 2026-09-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에 저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는 악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다.

##### 게시 대기가 기본, 즉시 게시는 구성별 선택

각 신뢰 배포 구성은 기본적으로 패키지를 게시 대기 상태로 올릴 수 있다. 즉시 게시는 구성별로 별도 허용해야 하며, 게시 대기 방식에는 버전이 레지스트리에 공개되기 전 사람의 승인 단계가 있다.

##### 여러 구성은 서로를 제한하지 않는다

구성은 독립적으로 추가되며 다른 구성의 권한을 제한하지 않는다. 평가 순서도 보장하지 않으므로 특정 구성이 먼저 일치한다는 조건에 의존해 배포 로직을 작성할 수 없다.

[GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)

#### [GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb)

발표 2026-09-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB\_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다.

##### 현재 작업을 정의한 워크플로의 신원

job.workflow\_ref, job.workflow\_sha, job.workflow\_repository, job.workflow\_file\_path는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 제공한다. 재사용 워크플로에서는 호출한 쪽을 가리키는 기존 github.workflow\_ref·github.workflow\_sha와 값이 달라질 수 있다.

##### 등록 지원과 실행 지원 종료일을 각각 조회

GET /actions/runners/deprecations/{version}은 runner\_version과 함께 runtime\_deprecates\_at, registration\_deprecates\_at을 반환한다. 저장소·조직·엔터프라이즈 수준에서 버전별 종료 시점을 조회할 수 있다.

[GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/)

#### [CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선](https://skyan0213.github.io/tech-knowledge-garden/news/13cebc4d5ec60b11)

발표 2026-09-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의 위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를 추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다.

##### Rust 경보 위치와 데이터 흐름 모델

Rust 데이터 흐름 경보는 실제 source와 sink 노드에 맞춰 위치를 표시한다. 위치가 바뀌는 경보는 새 경보로 나타나고 이전 경보는 닫힌다. Java/Kotlin에는 Spring R2DBC DatabaseClient와 R2DBC SPI의 SQL 주입 sink 모델을 추가했다.

##### 이벤트에 존재하는 필드만 보호 조건으로 인정

Actions 이벤트의 actor 필드를 확인하는 검사는 해당 필드를 실제로 채우는 이벤트에서만 보호 조건으로 인정한다. Python의 list.extend와 list.insert에도 기존 list.append와 같은 오염 데이터 흐름을 추가했다.

[GitHub 원문](https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/)
