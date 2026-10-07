---
title: 2026-07-15 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-07-15
timezone: Asia/Seoul
coverage_start: null
coverage_end: null
historical_coverage: unrecorded/v1
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 3
new_items_count: 3
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GitHub, PR 자동 AI 보안 검사 공개 미리보기
  - GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가
  - Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성
article_records:
  - title: GitHub, PR 자동 AI 보안 검사 공개 미리보기
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-15
      where: github.com
      what: AI 기반 보안 탐지 기능 공개
      how: pull request에 AI 탐지 결과 표시 및 자동 실행
      why: CodeQL 미지원 언어·프레임워크의 취약점 탐지 범위 확대
    lead: GitHub가 2026년 7월 15일(한국시간) 풀 리퀘스트(PR)에 AI 보안 탐지 결과를 표시하는 공개 미리보기를 시작했다. AI
      엔진은 PR이 열리거나 갱신될 때 자동으로 실행되며, CodeQL이 지원하지 않는 언어·프레임워크까지 탐지 범위를 넓힌다.
    explanations:
      - heading: 결과 표시와 병합
        paragraphs:
          - 분석 결과가 나오는 대로 PR에 표시하며, AI로 생성한 경고에는 AI 라벨을 붙여 CodeQL 결과와 구분한다. 결과는
            정보 제공용으로 PR 병합을 차단하지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/
      - heading: 활성화·과금 조건
        paragraphs:
          - GitHub Code Security(GitHub Advanced Security) 고객을 대상으로 github.com에서
            제공한다. 기업 정책의 허용, 조직 단위 활성화, 저장소의 CodeQL 기본 분석 설정이 필요하다. AI 분석은
            CodeQL 대신 AI 엔진이 수행한다.
          - 공개 미리보기에서도 GitHub Copilot 라이선스가 필요하고, 탐지를 실행할 때 조직의 AI 크레딧을 사용한다.
        source_urls:
          - https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-14
      where: 미기재
      what: GitHub Copilot 앱에 /security-review 슬래시 명령어 공개 프리뷰 제공
      how: 진행 중인 코드 변경 사항을 분석해 보안 이슈와 개선 제안을 제시
      why: 미기재
    lead: GitHub는 2026년 7월 14일(한국시간) Copilot 앱에 /security-review 명령을 공개 미리보기로 제공한다고
      밝혔다. 해당 명령어는 진행 중인 코드 변경 사항을 분석해 심각도와 신뢰도 점수를 매긴 보안 이슈와 적용 가능한 개선 제안을
      제시한다. 공개 미리보기 기간에는 Copilot Free·Pro·Business·Enterprise 사용자가 이용할 수 있다.
    explanations:
      - heading: 요청 시 검사하는 로컬 변경
        paragraphs:
          - GitHub는 인젝션, 크로스사이트 스크립팅, 안전하지 않은 데이터 처리, 경로 조작, 약한 암호화 등의 취약점을 찾도록
            설계했다고 설명했다.
          - 개발자가 작업 중인 로컬 변경을 필요할 때 검사하는 방식이다. 기존 code
            scanning·Dependabot·secret scanning을 보완한다.
        source_urls:
          - https://github.blog/changelog/2026-07-14-security-reviews-now-available-in-the-github-copilot-app/
    papers: []
    relations: []
    topic_ids: []
  - title: Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub, Dependabot
      when: 2026-07-15
      where: github.com, GitHub Enterprise Server
      what: Dependabot 버전 업데이트 풀 리퀘스트 생성 전 3일 대기 기간 도입
      how: 레지스트리 등록 후 3일 경과 시 PR 생성, 보안 업데이트는 즉시 생성, .github/dependabot.yml로 설정 가능
      why: 미기재
    lead: GitHub가 2026년 7월 15일(한국시간) Dependabot의 일반 버전 업데이트 기본값을 바꿨다. 새 릴리스가 패키지
      레지스트리에 공개된 뒤 최소 3일이 지나야 업데이트 풀 리퀘스트(PR)를 생성한다. 보안 업데이트 PR은 기존처럼 즉시 생성한다.
    explanations:
      - heading: 적용 범위와 설정
        paragraphs:
          - github.com의 모든 지원 생태계에 기본 적용하며, .github/dependabot.yml의 cooldown
            옵션으로 기간을 바꾸거나 대기를 해제할 수 있다. GitHub Enterprise Server에는 3.23에서 적용할
            예정이다.
        source_urls:
          - https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub, PR 자동 AI 보안 검사 공개 미리보기
    event_id: 27d181b6a4903b28
    review_status: verified
    published_at: 2026-07-15
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-14T12:12:48-07:00
  - title: GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가
    event_id: fe469724f5828fb0
    review_status: verified
    published_at: 2026-07-14
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-14T05:54:12-07:00
  - title: Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성
    event_id: 55f3f57477bf071c
    review_status: verified
    published_at: 2026-07-15
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-14T09:42:59-07:00
---

# 이번 호 표지

GitHub, PR 자동 AI 보안 검사 공개 미리보기

# 차례

- GitHub, PR 자동 AI 보안 검사 공개 미리보기
- GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가
- Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성

# 커버 스토리

없음

# 뉴스 데스크

## GitHub, PR 자동 AI 보안 검사 공개 미리보기

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub가 2026년 7월 15일(한국시간) 풀 리퀘스트(PR)에 AI 보안 탐지 결과를 표시하는 공개 미리보기를 시작했다. AI 엔진은 PR이 열리거나 갱신될 때 자동으로 실행되며, CodeQL이 지원하지 않는 언어·프레임워크까지 탐지 범위를 넓힌다. [S1]

### 결과 표시와 병합

분석 결과가 나오는 대로 PR에 표시하며, AI로 생성한 경고에는 AI 라벨을 붙여 CodeQL 결과와 구분한다. 결과는 정보 제공용으로 PR 병합을 차단하지 않는다. [S1]

### 활성화·과금 조건

GitHub Code Security(GitHub Advanced Security) 고객을 대상으로 github.com에서 제공한다. 기업 정책의 허용, 조직 단위 활성화, 저장소의 CodeQL 기본 분석 설정이 필요하다. AI 분석은 CodeQL 대신 AI 엔진이 수행한다.

공개 미리보기에서도 GitHub Copilot 라이선스가 필요하고, 탐지를 실행할 때 조직의 AI 크레딧을 사용한다. [S1]

## GitHub Copilot 앱, 코드 변경의 보안 검사 명령 추가

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 7월 14일(한국시간) Copilot 앱에 /security-review 명령을 공개 미리보기로 제공한다고 밝혔다. 해당 명령어는 진행 중인 코드 변경 사항을 분석해 심각도와 신뢰도 점수를 매긴 보안 이슈와 적용 가능한 개선 제안을 제시한다. 공개 미리보기 기간에는 Copilot Free·Pro·Business·Enterprise 사용자가 이용할 수 있다. [S2]

### 요청 시 검사하는 로컬 변경

GitHub는 인젝션, 크로스사이트 스크립팅, 안전하지 않은 데이터 처리, 경로 조작, 약한 암호화 등의 취약점을 찾도록 설계했다고 설명했다.

개발자가 작업 중인 로컬 변경을 필요할 때 검사하는 방식이다. 기존 code scanning·Dependabot·secret scanning을 보완한다. [S2]

## Dependabot, 일반 버전 업데이트 PR을 최소 3일 뒤 생성

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** GitHub

GitHub가 2026년 7월 15일(한국시간) Dependabot의 일반 버전 업데이트 기본값을 바꿨다. 새 릴리스가 패키지 레지스트리에 공개된 뒤 최소 3일이 지나야 업데이트 풀 리퀘스트(PR)를 생성한다. 보안 업데이트 PR은 기존처럼 즉시 생성한다. [S3]

### 적용 범위와 설정

github.com의 모든 지원 생태계에 기본 적용하며, .github/dependabot.yml의 cooldown 옵션으로 기간을 바꾸거나 대기를 해제할 수 있다. GitHub Enterprise Server에는 3.23에서 적용할 예정이다. [S3]

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

- [S1] https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/
- [S2] https://github.blog/changelog/2026-07-14-security-reviews-now-available-in-the-github-copilot-app/
- [S3] https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/
