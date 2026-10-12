---
title: 2026-09-04 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-04
timezone: Asia/Seoul
coverage_start: 2026-09-03T08:03:00+09:00
coverage_end: 2026-09-04T08:02:54+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 3
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/Security/OpenID Connect]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - npm, 패키지 하나에 여러 OIDC 배포 설정 지원
  - GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
  - CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
article_records:
  - title: npm, 패키지 하나에 여러 OIDC 배포 설정 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-03 발표
      where: 공식 웹사이트
      what: npm, 패키지 하나에 여러 OIDC 배포 설정 지원
      how: 저장소·워크플로·환경별 독립 신뢰 배포 설정
      why: 발표에 별도 배경 설명 없음
    lead: GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에
      저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는
      악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다.
    explanations:
      - heading: 게시 대기가 기본, 즉시 게시는 구성별 선택
        paragraphs:
          - 각 신뢰 배포 구성은 기본적으로 패키지를 게시 대기 상태로 올릴 수 있다. 즉시 게시는 구성별로 별도 허용해야 하며, 게시
            대기 방식에는 버전이 레지스트리에 공개되기 전 사람의 승인 단계가 있다.
        source_urls:
          - https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
      - heading: 여러 구성은 서로를 제한하지 않는다
        paragraphs:
          - 구성은 독립적으로 추가되며 다른 구성의 권한을 제한하지 않는다. 평가 순서도 보장하지 않으므로 특정 구성이 먼저 일치한다는
            조건에 의존해 배포 로직을 작성할 수 없다.
        source_urls:
          - https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-03 발표
      where: 공식 웹사이트
      what: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
      how: 실행기 버전 API·최소 토큰 권한·재사용 워크플로 신원 속성 추가
      why: 발표에 별도 배경 설명 없음
    lead: GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다.
      GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다.
      재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub
      Enterprise Server에서는 제공하지 않는다.
    explanations:
      - heading: 현재 작업을 정의한 워크플로의 신원
        paragraphs:
          - job.workflow_ref, job.workflow_sha, job.workflow_repository,
            job.workflow_file_path는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 제공한다. 재사용
            워크플로에서는 호출한 쪽을 가리키는 기존 github.workflow_ref·github.workflow_sha와 값이
            달라질 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
      - heading: 등록 지원과 실행 지원 종료일을 각각 조회
        paragraphs:
          - GET /actions/runners/deprecations/{version}은 runner_version과 함께
            runtime_deprecates_at, registration_deprecates_at을 반환한다.
            저장소·조직·엔터프라이즈 수준에서 버전별 종료 시점을 조회할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
    papers: []
    relations: []
    topic_ids: []
  - title: CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-03 발표
      where: 공식 웹사이트
      what: CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
      how: 언어별 데이터 흐름 모델과 가변 워크플로 참조 탐지 갱신
      why: 발표에 별도 배경 설명 없음
    lead: GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의
      위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를
      추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다.
    explanations:
      - heading: Rust 경보 위치와 데이터 흐름 모델
        paragraphs:
          - Rust 데이터 흐름 경보는 실제 source와 sink 노드에 맞춰 위치를 표시한다. 위치가 바뀌는 경보는 새 경보로
            나타나고 이전 경보는 닫힌다. Java/Kotlin에는 Spring R2DBC DatabaseClient와 R2DBC
            SPI의 SQL 주입 sink 모델을 추가했다.
        source_urls:
          - https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
      - heading: 이벤트에 존재하는 필드만 보호 조건으로 인정
        paragraphs:
          - Actions 이벤트의 actor 필드를 확인하는 검사는 해당 필드를 실제로 채우는 이벤트에서만 보호 조건으로 인정한다.
            Python의 list.extend와 list.insert에도 기존 list.append와 같은 오염 데이터 흐름을
            추가했다.
        source_urls:
          - https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: npm, 패키지 하나에 여러 OIDC 배포 설정 지원
    event_id: 322b7c88af36f3ac
    review_status: verified
    published_at: 2026-09-03
    reviewed_at: 2026-10-09
    concept_ids:
      - oidc
  - title: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
    event_id: 473fea8bb1cbf9cb
    review_status: verified
    published_at: 2026-09-03
    reviewed_at: 2026-10-09
    concept_ids: []
  - title: CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
    event_id: 13cebc4d5ec60b11
    review_status: verified
    published_at: 2026-09-03
    reviewed_at: 2026-10-09
    concept_ids: []
---

# 이번 호 표지

npm, 패키지 하나에 여러 OIDC 배포 설정 지원

# 차례

- npm, 패키지 하나에 여러 OIDC 배포 설정 지원
- GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
- CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선

# 커버 스토리

없음

# 뉴스 데스크

## npm, 패키지 하나에 여러 OIDC 배포 설정 지원

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에 저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는 악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다. [S1]

### 게시 대기가 기본, 즉시 게시는 구성별 선택

각 신뢰 배포 구성은 기본적으로 패키지를 게시 대기 상태로 올릴 수 있다. 즉시 게시는 구성별로 별도 허용해야 하며, 게시 대기 방식에는 버전이 레지스트리에 공개되기 전 사람의 승인 단계가 있다. [S1]

### 여러 구성은 서로를 제한하지 않는다

구성은 독립적으로 추가되며 다른 구성의 권한을 제한하지 않는다. 평가 순서도 보장하지 않으므로 특정 구성이 먼저 일치한다는 조건에 의존해 배포 로직을 작성할 수 없다. [S1]

**개념:** [[Knowledge/Security/OpenID Connect]]

## GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB\_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다. [S2]

### 현재 작업을 정의한 워크플로의 신원

job.workflow\_ref, job.workflow\_sha, job.workflow\_repository, job.workflow\_file\_path는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 제공한다. 재사용 워크플로에서는 호출한 쪽을 가리키는 기존 github.workflow\_ref·github.workflow\_sha와 값이 달라질 수 있다. [S2]

### 등록 지원과 실행 지원 종료일을 각각 조회

GET /actions/runners/deprecations/{version}은 runner\_version과 함께 runtime\_deprecates\_at, registration\_deprecates\_at을 반환한다. 저장소·조직·엔터프라이즈 수준에서 버전별 종료 시점을 조회할 수 있다. [S2]

## CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의 위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를 추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다. [S3]

### Rust 경보 위치와 데이터 흐름 모델

Rust 데이터 흐름 경보는 실제 source와 sink 노드에 맞춰 위치를 표시한다. 위치가 바뀌는 경보는 새 경보로 나타나고 이전 경보는 닫힌다. Java/Kotlin에는 Spring R2DBC DatabaseClient와 R2DBC SPI의 SQL 주입 sink 모델을 추가했다. [S3]

### 이벤트에 존재하는 필드만 보호 조건으로 인정

Actions 이벤트의 actor 필드를 확인하는 검사는 해당 필드를 실제로 채우는 이벤트에서만 보호 조건으로 인정한다. Python의 list.extend와 list.insert에도 기존 list.append와 같은 오염 데이터 흐름을 추가했다. [S3]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

[[Knowledge/Security/OpenID Connect]]

# Source List

- [S1] https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
- [S2] https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
- [S3] https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
