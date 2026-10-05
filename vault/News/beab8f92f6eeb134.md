---
title: Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대
type: news
schema_version: tech-news/v1
date: 2026-07-28
created: 2026-07-28
updated: 2026-07-28
event_id: beab8f92f6eeb134
review_status: verified
concept_ids: []
published_at: 2026-07-27
reviewed_at: 2026-10-05
source_url: https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
sources:
  - https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
concepts: []
description: GitHub는 7월 27일 Copilot 앱과 클라우드 에이전트에 기업 관리 설정을 적용한다고 발표했다. 기업은
  managed-settings.json에 허용할 플러그인과 마켓플레이스를 지정하고, 지원되는 키에서 이 값은 개발자의 로컬 설정보다
  우선한다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
entities:
  - GitHub
tags:
  - sector/software-cloud
  - theme/products
  - event/기능-추가
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: GitHub는 7월 27일 Copilot 앱과 클라우드 에이전트에 기업 관리 설정을 적용한다고 발표했다. 기업은
  managed-settings.json에 허용할 플러그인과 마켓플레이스를 지정하고, 지원되는 키에서 이 값은 개발자의 로컬 설정보다
  우선한다.
facts:
  who: GitHub
  when: 2026-07-27
  where: 미기재
  what: 기업 관리 설정 적용 대상 확대
  how: managed-settings.json을 통한 설정 지정 및 적용
  why: 미기재
explanations:
  - heading: 앱과 클라우드의 적용 항목
    paragraphs:
      - 앱에서는 명령 실행·파일 접근·URL 요청 전 승인 절차의 우회 허용 여부와 새 대화의 자동 모델 선택 기본값을 정할 수 있다.
        클라우드 에이전트에는 플러그인·마켓플레이스 설정이 적용되며, 승인 프롬프트 우회 통제는 앱·CLI·VS Code 같은 대화형
        클라이언트에만 적용된다.
    source_urls:
      - https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
  - heading: 배포와 설정 반영 시점
    paragraphs:
      - 서버 관리 방식은 기업의 .github-private 저장소에 copilot/managed-settings.json을 작성해 기본
        브랜치에 반영하는 방식이다. MDM이나 파일 배포도 지원한다.
      - 기존 설정은 앱의 다음 로그인·재시작 때 반영되고, 클라우드 에이전트는 다음 작업 배정 때 변경을 적용한다. 지원 클라이언트는
        변경을 약 한 시간 안에 반영하며 재시작·재로그인 때 즉시 적용한다.
    source_urls:
      - https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대


GitHub는 7월 27일 Copilot 앱과 클라우드 에이전트에 기업 관리 설정을 적용한다고 발표했다. 기업은 managed-settings.json에 허용할 플러그인과 마켓플레이스를 지정하고, 지원되는 키에서 이 값은 개발자의 로컬 설정보다 우선한다. [원문 1](<https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/>)

### 앱과 클라우드의 적용 항목

앱에서는 명령 실행·파일 접근·URL 요청 전 승인 절차의 우회 허용 여부와 새 대화의 자동 모델 선택 기본값을 정할 수 있다. 클라우드 에이전트에는 플러그인·마켓플레이스 설정이 적용되며, 승인 프롬프트 우회 통제는 앱·CLI·VS Code 같은 대화형 클라이언트에만 적용된다. [원문 1](<https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/>)

### 배포와 설정 반영 시점

서버 관리 방식은 기업의 .github-private 저장소에 copilot/managed-settings.json을 작성해 기본 브랜치에 반영하는 방식이다. MDM이나 파일 배포도 지원한다.

기존 설정은 앱의 다음 로그인·재시작 때 반영되고, 클라우드 에이전트는 다음 작업 배정 때 변경을 적용한다. 지원 클라이언트는 변경을 약 한 시간 안에 반영하며 재시작·재로그인 때 즉시 적용한다. [원문 1](<https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-28_0805_Tech_AI_Briefing|2026-07-28 브리핑]]
