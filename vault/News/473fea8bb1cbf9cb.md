---
title: GitHub Actions, 최소 권한과 재사용 workflow 신원을 더 세밀하게 노출
type: news
schema_version: tech-news/v1
date: 2026-09-04
created: 2026-09-04
updated: 2026-09-04
event_id: 473fea8bb1cbf9cb
review_status: unreviewed
concept_ids: []
source_url: https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
sources:
  - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
concepts:
  - Knowledge/Software Engineering/Software Supply Chain Security
description: Actions의 GITHUB_TOKEN에 Dependabot alert 읽기 전용 vulnerability-alerts
  권한이 추가됐다. 재사용 workflow에는 실제 정의 파일의 ref·SHA·저장소·경로를 나타내는 job.workflow_ context가
  생겼고, runner version의 등록·실행 지원 종료일을 조회하는 REST API도 제공된다.
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# GitHub Actions, 최소 권한과 재사용 workflow 신원을 더 세밀하게 노출

**핵심:** Actions의 `GITHUB_TOKEN`에 Dependabot alert 읽기 전용 `vulnerability-alerts` 권한이 추가됐다. 재사용 workflow에는 실제 정의 파일의 ref·SHA·저장소·경로를 나타내는 `job.workflow_*` context가 생겼고, runner version의 등록·실행 지원 종료일을 조회하는 REST API도 제공된다. [S2]

**의미:** 넓은 token scope 없이 취약점 정보를 읽고, 호출한 workflow가 아니라 실제 실행 정의의 신원을 감사하며, runner 지원 종료를 자동 점검할 수 있다.

**확인할 점:** 새 context는 GitHub Enterprise Server에서 아직 제공되지 않는다. 값의 노출만으로 workflow 무결성이 보장되는 것은 아니므로 SHA 고정과 권한 검토가 함께 필요하다.

**개념:** [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]

**근거:** [S2]

## 이어 읽기

- [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]

## 이 소식을 다룬 브리핑

- [[Briefings/2026/09/2026-09-04_0802_Tech_AI_Briefing|2026-09-04 브리핑]]

## 출처

- [S2] https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
