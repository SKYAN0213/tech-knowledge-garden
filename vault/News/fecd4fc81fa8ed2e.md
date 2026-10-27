---
title: GitHub, SCIM 계정 오삭제 원인 공개…영향 사용자 기록 복원과 재발 방지 조치
type: news
schema_version: tech-news/v1
date: 2026-10-27
created: 2026-10-27
updated: 2026-10-27
event_id: fecd4fc81fa8ed2e
review_status: verified
concept_ids: []
semantic_review_status: reviewed_none
published_at: 2026-10-24
reviewed_at: 2026-10-27
date_kind: source-publication-time
source_published_at: 2026-10-23T11:56:18-07:00
source_url: https://github.blog/changelog/2026-10-23-emu-deletions-fix
sources:
  - https://github.blog/changelog/2026-10-23-emu-deletions-fix
concepts: []
description: GitHub은 2026년 10월 24일(한국시간) 공개한 공지에서 2026년 6월 1일부터 13일까지 SCIM으로
  프로비저닝 해제된 일부 Enterprise Managed User 계정이 예상된 정지·난독화 대신 잘못 삭제됐다고 밝혔다. GitHub은
  여러 기업에서 약 12,285개 계정이 영향을 받았으며, 해당 사용자가 기업 안에서 정지·난독화된 기록으로 남는 대신 이슈·풀 리퀘스트·감사
  로그에 유령 사용자로 나타났다고 설명했다. 기업은 6월 1일부터 13일까지 감사 로그에 Enterprise Managed User의
  user.delete 이벤트가 있는지로 영향을 확인할 수 있으며, 해당 이벤트가 없으면 영향받지 않았고 이벤트가 있는 기업에는 별도 조치가
  필요 없다고 GitHub은 안내하면서 계정 복원을 진행 중이라고 밝혔다. GitHub은 6월 1일 도입한 새 프로비저닝 해제 경로가 계정의
  Enterprise Managed User 여부를 확인하지 않아 삭제를 일으켰으며, 6월 13일 해당 경로를 비활성화해 문제를 차단했다고
  밝혔다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 위험·사고
secondary_theme: null
event_tags:
  - 서비스 장애
entities:
  - GitHub
tags:
  - sector/software-cloud
  - theme/incidents
  - event/서비스-장애
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: GitHub은 2026년 10월 24일(한국시간) 공개한 공지에서 2026년 6월 1일부터 13일까지 SCIM으로 프로비저닝 해제된
  일부 Enterprise Managed User 계정이 예상된 정지·난독화 대신 잘못 삭제됐다고 밝혔다. GitHub은 여러 기업에서 약
  12,285개 계정이 영향을 받았으며, 해당 사용자가 기업 안에서 정지·난독화된 기록으로 남는 대신 이슈·풀 리퀘스트·감사 로그에 유령
  사용자로 나타났다고 설명했다. 기업은 6월 1일부터 13일까지 감사 로그에 Enterprise Managed User의 user.delete
  이벤트가 있는지로 영향을 확인할 수 있으며, 해당 이벤트가 없으면 영향받지 않았고 이벤트가 있는 기업에는 별도 조치가 필요 없다고
  GitHub은 안내하면서 계정 복원을 진행 중이라고 밝혔다. GitHub은 6월 1일 도입한 새 프로비저닝 해제 경로가 계정의
  Enterprise Managed User 여부를 확인하지 않아 삭제를 일으켰으며, 6월 13일 해당 경로를 비활성화해 문제를 차단했다고
  밝혔다.
facts:
  who: GitHub.
  when: 공지 게시일은 2026년 10월 24일(한국시간); 오삭제 기간은 2026년 6월 1~13일, 잘못된 경로 비활성화일은 2026년
    6월 13일, 영향 사용자 기록 복원은 2026년 10월.
  where: 미기재
  what: SCIM 프로비저닝 해제 과정에서 Enterprise Managed User 계정 일부가 잘못 삭제된 문제와 GitHub의 경로
    비활성화·재발 방지 코드 변경·사용자 기록 복원 보고.
  how: 6월 1일 새 경로가 계정이 Enterprise Managed User인지 확인하지 않은 것이 원인이었고, GitHub은 6월 13일
    그 경로를 비활성화한 뒤 재발 방지 코드를 변경하고 영향받은 기록을 복원했다.
  why: 미기재
explanations:
  - heading: 계정 삭제 경로와 영향 규모
    paragraphs:
      - GitHub은 영향 계정 대부분이 이미 정지되고 강제 프로비저닝 해제된 상태여서 설계상 다시 프로비저닝할 수 없었다고 설명했다.
        삭제 당시 활성 상태였던 계정은 더 작은 집단인 76개였다.
    source_urls:
      - https://github.blog/changelog/2026-10-23-emu-deletions-fix
  - heading: 복원 및 재발 방지
    paragraphs:
      - GitHub은 재발 방지 코드 변경을 완료했다고 밝혔고, 2026년 10월에 영향 사용자 기록을 복원했다고 보고했다. 복원된
        계정은 예상된 정지·난독화 상태로 돌아갔으며 기업 내부의 추적 가능성과 감사 이력이 보존됐다고 설명했다.
    source_urls:
      - https://github.blog/changelog/2026-10-23-emu-deletions-fix
  - heading: 재프로비저닝 절차
    paragraphs:
      - 강제 프로비저닝 해제된 Enterprise Managed User 계정은 설계상 다시 프로비저닝할 수 없으므로, GitHub은
        이번 문제가 재프로비저닝 워크플로에 영향을 주지 않는다고 밝혔다.
    source_urls:
      - https://github.blog/changelog/2026-10-23-emu-deletions-fix
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# GitHub, SCIM 계정 오삭제 원인 공개…영향 사용자 기록 복원과 재발 방지 조치


GitHub은 2026년 10월 24일(한국시간) 공개한 공지에서 2026년 6월 1일부터 13일까지 SCIM으로 프로비저닝 해제된 일부 Enterprise Managed User 계정이 예상된 정지·난독화 대신 잘못 삭제됐다고 밝혔다. GitHub은 여러 기업에서 약 12,285개 계정이 영향을 받았으며, 해당 사용자가 기업 안에서 정지·난독화된 기록으로 남는 대신 이슈·풀 리퀘스트·감사 로그에 유령 사용자로 나타났다고 설명했다. 기업은 6월 1일부터 13일까지 감사 로그에 Enterprise Managed User의 user.delete 이벤트가 있는지로 영향을 확인할 수 있으며, 해당 이벤트가 없으면 영향받지 않았고 이벤트가 있는 기업에는 별도 조치가 필요 없다고 GitHub은 안내하면서 계정 복원을 진행 중이라고 밝혔다. GitHub은 6월 1일 도입한 새 프로비저닝 해제 경로가 계정의 Enterprise Managed User 여부를 확인하지 않아 삭제를 일으켰으며, 6월 13일 해당 경로를 비활성화해 문제를 차단했다고 밝혔다. [원문 1](<https://github.blog/changelog/2026-10-23-emu-deletions-fix>)

### 계정 삭제 경로와 영향 규모

GitHub은 영향 계정 대부분이 이미 정지되고 강제 프로비저닝 해제된 상태여서 설계상 다시 프로비저닝할 수 없었다고 설명했다. 삭제 당시 활성 상태였던 계정은 더 작은 집단인 76개였다. [원문 1](<https://github.blog/changelog/2026-10-23-emu-deletions-fix>)

### 복원 및 재발 방지

GitHub은 재발 방지 코드 변경을 완료했다고 밝혔고, 2026년 10월에 영향 사용자 기록을 복원했다고 보고했다. 복원된 계정은 예상된 정지·난독화 상태로 돌아갔으며 기업 내부의 추적 가능성과 감사 이력이 보존됐다고 설명했다. [원문 1](<https://github.blog/changelog/2026-10-23-emu-deletions-fix>)

### 재프로비저닝 절차

강제 프로비저닝 해제된 Enterprise Managed User 계정은 설계상 다시 프로비저닝할 수 없으므로, GitHub은 이번 문제가 재프로비저닝 워크플로에 영향을 주지 않는다고 밝혔다. [원문 1](<https://github.blog/changelog/2026-10-23-emu-deletions-fix>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/10/2026-10-27_0800_Tech_AI_Briefing|2026-10-27 브리핑]]
