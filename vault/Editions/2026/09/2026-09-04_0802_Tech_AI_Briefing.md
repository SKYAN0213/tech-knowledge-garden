---
title: 2026-09-04 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-04
timezone: Asia/Seoul
coverage_start: 2026-09-03T08:03:00+09:00
coverage_end: 2026-09-04T08:02:54+09:00
source_count: 3
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/Security/OpenID Connect]]"
knowledge_notes_created: []
knowledge_notes_updated: []
article_reviews:
  - title: npm, 패키지 하나에 여러 OIDC 배포 설정 지원
    event_id: 322b7c88af36f3ac
    review_status: verified
    published_at: 2026-09-03
    reviewed_at: 2026-09-13
    concept_ids:
      - oidc
  - title: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
    event_id: 473fea8bb1cbf9cb
    review_status: verified
    published_at: 2026-09-03
    reviewed_at: 2026-09-13
    concept_ids: []
  - title: CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
    event_id: 13cebc4d5ec60b11
    review_status: verified
    published_at: 2026-09-03
    reviewed_at: 2026-09-13
    concept_ids: []
editorial_format: six-w/v1
theme_format: news-themes/v1
briefing_format: sector-five/v1
headlines:
  - npm, 패키지 하나에 여러 OIDC 배포 설정 지원
  - GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
  - CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
article_records:
  - title: npm, 패키지 하나에 여러 OIDC 배포 설정 지원
    kind: 사건 뉴스
    region: 해외
    lead: GitHub는 9월 3일 npm 패키지 하나에 여러 OIDC 기반 신뢰 배포 설정을 등록하는 기능을 정식 제공했다. 각 설정에
      저장소·워크플로·환경 조건을 지정하며, 들어온 토큰이 어느 한 설정과 일치하면 게시 또는 게시 대기가 허용된다. 게시 대기 패키지는
      악성코드 검사가 끝난 뒤 승인할 수 있고, 관리자는 버전 탭에서 승인·거부·대기 이력을 확인할 수 있다.
    facts:
      who: GitHub
      when: 2026-09-03 발표
      where: 공식 웹사이트
      what: npm, 패키지 하나에 여러 OIDC 배포 설정 지원
      how: 저장소·워크플로·환경별 독립 신뢰 배포 설정
      why: 발표에 별도 배경 설명 없음
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
    kind: 사건 뉴스
    region: 해외
    lead: GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다.
      GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다.
      재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub
      Enterprise Server에서는 제공하지 않는다.
    facts:
      who: GitHub
      when: 2026-09-03 발표
      where: 공식 웹사이트
      what: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
      how: 실행기 버전 API·최소 토큰 권한·재사용 워크플로 신원 속성 추가
      why: 발표에 별도 배경 설명 없음
    papers: []
    relations: []
    topic_ids: []
  - title: CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
    kind: 사건 뉴스
    region: 해외
    lead: GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의
      위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를
      추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다.
    facts:
      who: GitHub
      when: 2026-09-03 발표
      where: 공식 웹사이트
      what: CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선
      how: 언어별 데이터 흐름 모델과 가변 워크플로 참조 탐지 갱신
      why: 발표에 별도 배경 설명 없음
    papers: []
    relations: []
    topic_ids: []
---

# 이번 호 표지

> **한 줄 편집:** npm 다중 OIDC 설정 · Actions 실행기·권한 업데이트 · CodeQL 2.26.4

# 차례

뉴스 데스크

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

[[Knowledge/Security/OpenID Connect]]

## GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다. [S2]

## CodeQL 2.26.4, Go 1.27과 GitHub Actions 보안 탐지 개선

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 3일 CodeQL 2.26.4의 변경 내용을 공개했다. Go 1.27을 지원하고 Rust 데이터 흐름 경보의 위치를 실제 출발·도착 지점에 맞추며, GitHub Actions에서는 변경 가능한 참조를 사용하는 재사용 워크플로의 탐지를 추가했다. github.com 코드 스캔에는 자동 배포되며, 향후 Enterprise Server 릴리스에도 포함될 예정이다. [S3]

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
