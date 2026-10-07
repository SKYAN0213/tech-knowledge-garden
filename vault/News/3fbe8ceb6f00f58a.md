---
title: GitHub, Resend 키 탐지·VolcEngine Ark 커밋 차단 추가
type: news
schema_version: tech-news/v1
date: 2026-07-16
created: 2026-07-16
updated: 2026-07-16
event_id: 3fbe8ceb6f00f58a
review_status: verified
concept_ids: []
published_at: 2026-07-16
reviewed_at: 2026-10-07
date_kind: source-publication-time
source_published_at: 2026-07-15T15:38:16-07:00
source_url: https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/
sources:
  - https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/
concepts: []
description: GitHub는 2026년 7월 16일(한국시간) Resend를 secret scanning 파트너로 추가하고
  APIclub·Resend 키 탐지를 지원한다고 밝혔다. VolcEngine Ark 키가 포함된 커밋의 기본 차단 대상도 확대하고, 보안
  경보 웹훅과 기업용 유출 현황 화면을 개선했다.
theme_format: news-themes/v1
sector: 사이버보안
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
  - 기능 변경
entities:
  - GitHub
  - Resend
  - APIclub
  - VolcEngine
tags:
  - sector/cybersecurity
  - theme/products
  - event/기능-추가
  - event/기능-변경
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: GitHub는 2026년 7월 16일(한국시간) Resend를 secret scanning 파트너로 추가하고
  APIclub·Resend 키 탐지를 지원한다고 밝혔다. VolcEngine Ark 키가 포함된 커밋의 기본 차단 대상도 확대하고, 보안
  경보 웹훅과 기업용 유출 현황 화면을 개선했다.
facts:
  who: GitHub
  when: 2026-07-16
  where: 미기재
  what: 시크릿 스캐닝 파트너 추가, 신규 시크릿 유형 자동 감지, VolcEngine 시크릿 푸시 보호 기본 적용, 웹훅 페이로드 필드
    추가, 공개 모니터링 인사이트 카드 도입
  how: Resend를 파트너로 등록해 노출된 시크릿을 전달하고, APIclub 및 Resend 키를 자동 감지하며, VolcEngine 키에
    대한 푸시 보호를 활성화하고, 웹훅에 secret_category 필드를 포함해 감지 유형을 구분하며, 모니터링 화면에 인사이트 카드를
    배치
  why: 미기재
explanations:
  - heading: 발급사 통보와 커밋 차단
    paragraphs:
      - 공개 저장소에서 노출된 Resend 키는 GitHub가 발급사에 전달하고, Resend가 키 폐기나 관리자 통지 등의 조치를
        한다는 설명이다. 새 탐지 유형은 APIclub의 apiclub_api_key와 Resend의 resend_api_key다.
      - secret scanning이 켜진 저장소는 volcengine_ark_api_key가 포함된 커밋을 기본 push
        protection으로 차단한다. 무료 공개 저장소도 적용 대상에 포함된다.
    source_urls:
      - https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/
  - heading: 경보 분류와 유출 귀속
    paragraphs:
      - secret_scanning_alert 웹훅의 secret_category는 제공자·사용자 정의 패턴을 default로, 일반
        패턴·AI 탐지 결과를 generic으로 구분한다.
      - 기업용 public monitoring은 기업 구성원이 작성한 커밋과 검증된 도메인의 커미터 이메일을 기준으로 유출 경보 수를
        나눠 보여준다. 기업 구성원 수와 검증된 도메인도 같은 화면에서 확인할 수 있다.
    source_urls:
      - https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# GitHub, Resend 키 탐지·VolcEngine Ark 커밋 차단 추가


GitHub는 2026년 7월 16일(한국시간) Resend를 secret scanning 파트너로 추가하고 APIclub·Resend 키 탐지를 지원한다고 밝혔다. VolcEngine Ark 키가 포함된 커밋의 기본 차단 대상도 확대하고, 보안 경보 웹훅과 기업용 유출 현황 화면을 개선했다. [원문 1](<https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/>)

### 발급사 통보와 커밋 차단

공개 저장소에서 노출된 Resend 키는 GitHub가 발급사에 전달하고, Resend가 키 폐기나 관리자 통지 등의 조치를 한다는 설명이다. 새 탐지 유형은 APIclub의 apiclub_api_key와 Resend의 resend_api_key다.

secret scanning이 켜진 저장소는 volcengine_ark_api_key가 포함된 커밋을 기본 push protection으로 차단한다. 무료 공개 저장소도 적용 대상에 포함된다. [원문 1](<https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/>)

### 경보 분류와 유출 귀속

secret_scanning_alert 웹훅의 secret_category는 제공자·사용자 정의 패턴을 default로, 일반 패턴·AI 탐지 결과를 generic으로 구분한다.

기업용 public monitoring은 기업 구성원이 작성한 커밋과 검증된 도메인의 커미터 이메일을 기준으로 유출 경보 수를 나눠 보여준다. 기업 구성원 수와 검증된 도메인도 같은 화면에서 확인할 수 있다. [원문 1](<https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-16_0802_Tech_AI_Briefing|2026-07-16 브리핑]]
