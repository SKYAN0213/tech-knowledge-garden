---
schema_version: tech-signals/v1
type: trend-observations
edition: Editions/2026/09/2026-09-04_0802_Tech_AI_Briefing
date: 2026-09-04
reviewed: 2026-10-09
review_basis: saved-coverage
observations:
  - id: permissions-oidc
    topic_id: execution-permissions
    event_id: 322b7c88af36f3ac
    stance: support
    change: npm이 패키지별 여러 OIDC 신뢰 배포 구성을 정식 제공했다.
    meaning: 각 구성은 저장소·워크플로·환경 조건을 갖고 어느 한 구성과 일치하는 토큰으로 게시 또는 게시 대기를 허용한다.
    limit: 여러 구성은 독립적으로 추가되고 즉시 게시는 구성별로 별도 허용한다.
    next_check: 각 경로의 opt-in과 예외, 변경 감사·회수 절차.
    event_date: 2026-09-03T13:34:34-07:00
  - id: permissions-workflow
    topic_id: execution-permissions
    event_id: 473fea8bb1cbf9cb
    stance: support
    change: GitHub Actions가 실행기 버전별 지원 종료 API, vulnerability-alerts 읽기 권한과 재사용 워크플로
      job 신원 속성을 추가했다.
    meaning: job.workflow_*는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 가리킨다.
    limit: 해당 job 신원 속성은 GitHub Enterprise Server에서 제공하지 않는다.
    next_check: SHA 고정과 권한 검토, runner 지원 종료 점검.
    event_date: 2026-09-03T13:30:53-07:00
---

# 2026-09-04 트렌드 기록

2026-09-13에 기존 수록 기사를 재정리했다. 당일에 작성된 실시간 평가로 보지 않는다.

[[Editions/2026/09/2026-09-04_0802_Tech_AI_Briefing|수록 원고]]
