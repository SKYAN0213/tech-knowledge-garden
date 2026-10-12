---
title: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
type: news
schema_version: tech-news/v1
date: 2026-09-04
created: 2026-09-04
updated: 2026-09-04
event_id: 473fea8bb1cbf9cb
review_status: verified
concept_ids: []
published_at: 2026-09-03
reviewed_at: 2026-10-09
source_url: https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
sources:
  - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
concepts: []
description: GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다.
  GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용
  워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise
  Server에서는 제공하지 않는다.
theme_format: news-themes/v1
sector: 사이버보안
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
entities:
  - GitHub
tags:
  - sector/cybersecurity
  - theme/products
  - event/기능-추가
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다.
  GITHUB_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용
  워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise
  Server에서는 제공하지 않는다.
facts:
  who: GitHub
  when: 2026-09-03 발표
  where: 공식 웹사이트
  what: GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가
  how: 실행기 버전 API·최소 토큰 권한·재사용 워크플로 신원 속성 추가
  why: 발표에 별도 배경 설명 없음
explanations:
  - heading: 현재 작업을 정의한 워크플로의 신원
    paragraphs:
      - job.workflow_ref, job.workflow_sha, job.workflow_repository,
        job.workflow_file_path는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 제공한다. 재사용 워크플로에서는
        호출한 쪽을 가리키는 기존 github.workflow_ref·github.workflow_sha와 값이 달라질 수 있다.
    source_urls:
      - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
  - heading: 등록 지원과 실행 지원 종료일을 각각 조회
    paragraphs:
      - GET /actions/runners/deprecations/{version}은 runner_version과 함께
        runtime_deprecates_at, registration_deprecates_at을 반환한다. 저장소·조직·엔터프라이즈
        수준에서 버전별 종료 시점을 조회할 수 있다.
    source_urls:
      - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가


GitHub는 9월 3일 Actions 실행기의 버전별 등록·실행 지원 종료일을 조회하는 REST API를 추가했다. GITHUB\_TOKEN에는 Dependabot 경보를 읽기 전용으로 조회하는 vulnerability-alerts 권한이 생겼다. 재사용 워크플로는 새 job 속성으로 해당 작업을 정의한 파일·저장소·커밋을 확인할 수 있으며, 이 속성은 GitHub Enterprise Server에서는 제공하지 않는다. [원문 1](<https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/>)

### 현재 작업을 정의한 워크플로의 신원

job.workflow\_ref, job.workflow\_sha, job.workflow\_repository, job.workflow\_file\_path는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 제공한다. 재사용 워크플로에서는 호출한 쪽을 가리키는 기존 github.workflow\_ref·github.workflow\_sha와 값이 달라질 수 있다. [원문 1](<https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/>)

### 등록 지원과 실행 지원 종료일을 각각 조회

GET /actions/runners/deprecations/{version}은 runner\_version과 함께 runtime\_deprecates\_at, registration\_deprecates\_at을 반환한다. 저장소·조직·엔터프라이즈 수준에서 버전별 종료 시점을 조회할 수 있다. [원문 1](<https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/09/2026-09-04_0802_Tech_AI_Briefing|2026-09-04 브리핑]]
