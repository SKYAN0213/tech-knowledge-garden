# 2026-09-04 아침 브리핑

npm 다중 OIDC 설정 · Actions 실행기·권한 업데이트 · CodeQL 2.26.4

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [npm, 패키지 하나에 여러 OIDC 배포 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac)

발표 2026-09-03

GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에 저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는 악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다.

### [GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb)

발표 2026-09-03

GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다.

### [CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선](https://skyan0213.github.io/tech-knowledge-garden/news/13cebc4d5ec60b11)

발표 2026-09-03

GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의 위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를 추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다.

## 분야별 브리핑

### 사이버보안 · 3건

#### [npm, 패키지 하나에 여러 OIDC 배포 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac)

발표 2026-09-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에 저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는 악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다.



[GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)

#### [GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb)

발표 2026-09-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다.



[GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/)

#### [CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선](https://skyan0213.github.io/tech-knowledge-garden/news/13cebc4d5ec60b11)

발표 2026-09-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의 위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를 추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다.



[GitHub 원문](https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/)
