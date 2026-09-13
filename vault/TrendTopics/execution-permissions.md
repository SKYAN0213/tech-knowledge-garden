---
schema_version: tech-trend/v1
type: trend-topic-source
reviewed: 2026-09-13
id: execution-permissions
title: 실행·배포 권한을 경로별로 세분화
question: 자동화가 할 수 있는 일을 어느 단계에서 제한하는가?
thesis: npm 배포 신원, 에이전트 작업, PR 병합, 캐시 접근에 각각 통제 지점이 추가됐다. 제어 기능이 존재하는 것과 실제 설정이
  안전하게 적용된 것은 구분해야 한다.
watch_for: 실제 실행 SHA·환경 신원, 예외·우회 권한, 실패 시 차단 결과를 테스트하고 변경 이력을 확인한다.
disconfirming: 하위 설정이나 우회 권한이 경계를 넓히거나 낮은 신뢰 이벤트에 쓰기를 허용하면 통제 강화 효과를 다시 평가한다.
knowledge_notes:
  - Knowledge/Security/OpenID Connect
  - Knowledge/Software Engineering/Software Supply Chain Security
  - Knowledge/AI Systems/AI Agent Security
lessons:
  - id: verify-each-boundary
    claim: 배포·실행 경로마다 신원과 최소 권한을 별도로 검증한다.
    signal_ids:
      - permissions-oidc
      - permissions-cache
      - permissions-secrets
    limit: GitHub와 npm의 해당 제공 범위에 근거한다. 검사 통과가 모든 비밀정보의 부재나 workflow 무결성을 보증하지 않으며
      우회 설정을 함께 점검해야 한다.
    reviewed: 2026-09-13
---

# 실행·배포 권한을 경로별로 세분화

기존 수록 원문 기반 기사에서 검토한 편집 판단이다. 관측 이력과 근거는 [[Briefings/Topics/execution-permissions|누적 기록]]에서 읽는다.
