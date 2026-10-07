---
title: GitHub Copilot, 기업이 원격측정 데이터 전송과 수집 범위 관리
type: news
schema_version: tech-news/v1
date: 2026-07-10
created: 2026-07-10
updated: 2026-07-10
event_id: 25cd2c8cb0feed28
review_status: verified
concept_ids: []
published_at: 2026-07-09
reviewed_at: 2026-10-06
date_kind: source-publication-time
source_published_at: 2026-07-08T13:50:07-07:00
source_url: https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/
sources:
  - https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/
concepts: []
description: GitHub는 한국시간 7월 9일(미국 태평양시간 7월 8일) 기업 관리 설정으로 Copilot의
  OpenTelemetry 데이터 전송 경로를 지정할 수 있다고 밝혔다. 이 설정은 VS Code의 Copilot Chat 확장 프로그램과
  Copilot CLI를 실행하는 에이전트 호스트에 적용된다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
entities: []
tags:
  - sector/software-cloud
  - theme/products
  - event/기능-추가
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: GitHub는 한국시간 7월 9일(미국 태평양시간 7월 8일) 기업 관리 설정으로 Copilot의 OpenTelemetry 데이터
  전송 경로를 지정할 수 있다고 밝혔다. 이 설정은 VS Code의 Copilot Chat 확장 프로그램과 Copilot CLI를 실행하는
  에이전트 호스트에 적용된다.
facts:
  who: GitHub Copilot
  when: 2026-07-09 (한국시각; 원문 2026-07-08 PDT)
  where: VS Code와 Copilot CLI
  what: 기업 관리 설정을 통한 OpenTelemetry 데이터 전송 및 수집 범위 제어
  how: telemetry block으로 관리 값을 배포
  why: 미기재
explanations:
  - heading: 수집 서버와 기록 범위 지정
    paragraphs:
      - 관리자는 데이터를 받는 서버의 주소와 OTLP 전송 방식인 otlp-http 또는 otlp-grpc, 서비스 이름과 리소스 속성을
        설정할 수 있다.
      - 프롬프트·응답·도구 내용의 기록 여부와 개발자가 그 설정을 바꿀 수 있는지도 관리한다.
    source_urls:
      - https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/
  - heading: 관리 설정을 우선 적용
    paragraphs:
      - 관리 값은 환경변수와 사용자 설정보다 우선한다. 네이티브 MDM, 로그인한 GitHub 계정에서 받는 서버 관리 설정,
        managed-settings.json 파일로 전달할 수 있다.
    source_urls:
      - https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/
  - heading: 인증 헤더의 적용 범위
    paragraphs:
      - GitHub는 수집 서버의 인증 토큰 같은 관리 헤더가 Copilot Chat 확장 프로그램의 OTLP 내보내기에만 적용된다고
        설명했다. 이 헤더를 환경변수로 전달하지 않아 에이전트 호스트가 생성하는 도구 하위 프로세스에 넘기지 않는다는 설명이다.
    source_urls:
      - https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# GitHub Copilot, 기업이 원격측정 데이터 전송과 수집 범위 관리


GitHub는 한국시간 7월 9일(미국 태평양시간 7월 8일) 기업 관리 설정으로 Copilot의 OpenTelemetry 데이터 전송 경로를 지정할 수 있다고 밝혔다. 이 설정은 VS Code의 Copilot Chat 확장 프로그램과 Copilot CLI를 실행하는 에이전트 호스트에 적용된다. [원문 1](<https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/>)

### 수집 서버와 기록 범위 지정

관리자는 데이터를 받는 서버의 주소와 OTLP 전송 방식인 otlp-http 또는 otlp-grpc, 서비스 이름과 리소스 속성을 설정할 수 있다.

프롬프트·응답·도구 내용의 기록 여부와 개발자가 그 설정을 바꿀 수 있는지도 관리한다. [원문 1](<https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/>)

### 관리 설정을 우선 적용

관리 값은 환경변수와 사용자 설정보다 우선한다. 네이티브 MDM, 로그인한 GitHub 계정에서 받는 서버 관리 설정, managed-settings.json 파일로 전달할 수 있다. [원문 1](<https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/>)

### 인증 헤더의 적용 범위

GitHub는 수집 서버의 인증 토큰 같은 관리 헤더가 Copilot Chat 확장 프로그램의 OTLP 내보내기에만 적용된다고 설명했다. 이 헤더를 환경변수로 전달하지 않아 에이전트 호스트가 생성하는 도구 하위 프로세스에 넘기지 않는다는 설명이다. [원문 1](<https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-10_0802_Tech_AI_Briefing|2026-07-10 브리핑]]
