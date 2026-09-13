---
schema_version: tech-signals/v1
type: trend-observations
edition: Editions/2026/09/2026-09-04_0802_Tech_AI_Briefing
date: 2026-09-04
reviewed: 2026-09-13
review_basis: saved-coverage
observations:
  - id: permissions-oidc
    topic_id: execution-permissions
    event_id: 322b7c88af36f3ac
    stance: support
    change: npm 배포 신원을 여러 OIDC 경로로 나눌 수 있게 됐다.
    meaning: stable·prerelease 경로마다 저장소·workflow·환경 신원을 검토할 수 있다.
    limit: 여러 구성은 추가적으로 작동하고 direct publishing은 사람 승인 경계를 없앨 수 있다.
    next_check: 각 경로의 opt-in과 예외, 변경 감사·회수 절차.
  - id: permissions-workflow
    topic_id: execution-permissions
    event_id: 473fea8bb1cbf9cb
    stance: support
    change: 재사용 workflow의 실제 정의 신원과 읽기 권한이 세분화됐다.
    meaning: 실행 정의의 ref·SHA·저장소를 감사하고 불필요한 token scope를 줄일 수 있다.
    limit: 신원 값 노출만으로 무결성이 보장되지 않으며 GHES 제공 범위도 다르다.
    next_check: SHA 고정과 권한 검토, runner 지원 종료 점검.
---

# 2026-09-04 트렌드 기록

2026-09-13에 기존 수록 기사를 재정리했다. 당일에 작성된 실시간 평가로 보지 않는다.

[[Editions/2026/09/2026-09-04_0802_Tech_AI_Briefing|수록 원고]]
