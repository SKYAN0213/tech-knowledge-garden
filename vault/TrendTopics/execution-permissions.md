---
schema_version: tech-trend/v1
type: trend-topic-source
reviewed: 2026-10-22
id: execution-permissions
title: 실행·배포 권한을 경로별로 세분화
question: 자동화가 할 수 있는 일을 어느 단계에서 제한하는가?
thesis: npm 배포 신원, 에이전트 작업, PR 병합, 캐시 접근에 각각 통제 지점이 추가됐다. 제어 기능이 존재하는 것과 실제 설정이
  안전하게 적용된 것은 구분해야 한다. 9월21일 GitHub의 자격증명 목록 내보내기는 감사 입력을 추가했지만 토큰 폐기나 최소 권한 적용은
  별도 조치다. 9월22일 네이버 DSAC 출시와 Proofpoint 연말 기능 예고는 제공 단계가 다르다. 접근 정책·로그·사람 승인 적용은
  별도 운영 검증이 필요하다.  9월30일 Data Agent Kit은 사용자·서비스 계정 권한 전파를 설명했지만, 같은 날 Cisco와
  AMD는 각각 관리 API·RCCL 실행 경계 취약점을 공지했다. 통제 기능의 존재와 설치된 최소 권한·패치 안전성을 구분한다.
watch_for: 실제 실행 SHA·환경 신원, 예외·우회 권한, 실패 시 차단 결과를 테스트하고 변경 이력을 확인한다.
disconfirming: 하위 설정이나 우회 권한이 경계를 넓히거나 낮은 신뢰 이벤트에 쓰기를 허용하면 통제 강화 효과를 다시 평가한다.
knowledge_notes:
  - Knowledge/Security/OpenID Connect
  - Knowledge/Software Engineering/Software Supply Chain Security
  - Knowledge/AI Systems/AI Agent Security
lessons: []
---

# 실행·배포 권한을 경로별로 세분화

기존 수록 원문 기반 기사에서 검토한 편집 판단이다. 관측 이력과 근거는 [[Briefings/Topics/execution-permissions|누적 기록]]에서 읽는다.


2026-09-22 검토: 9월21일 GitHub의 자격증명 목록 내보내기는 감사 입력을 추가했지만 토큰 폐기나 최소 권한 적용은 별도 조치다.


2026-09-23 검토: 9월22일 네이버 DSAC 출시와 Proofpoint 연말 기능 예고는 제공 단계가 다르다. 접근 정책·로그·사람 승인 적용은 별도 운영 검증이 필요하다.

2026-10-01 검토: Google Data Agent Kit의 IAM 연동은 문서화된 기능이다. Cisco의 비인증 관리자 접근 취약점과 AMD RCCL의 조건부 RCE 가능성은 권한 경계 유지가 패치·구성에 달렸음을 보인다. Cisco는 9월 실제 악용을 인지했다고 밝혔으며 이 보고만으로 특정 조직의 침해 여부를 판정하지 않는다. 영향 버전과 패치 확인이 다음 단계다.

2026-10-10 검토: Cisco가 10월2일 추가한 Live Protect shield는 임시 부분 보호이며 수정 버전 업그레이드를 대체하지 않는다. AMD는 10월6일 제품 표의 CVE를 정정해 현재 표와 본문의 CVE-2026-43598이 일치한다. 최초 공지와 후속 정정을 구분하고 실제 설치 버전·구성과 대조한다.

2026-10-22 검토: GitHub가 한국시간 10월21일 공개한 npm 패키지 방화벽은 의존성을 내려받는 경로에 정책 평가 지점을 더한다. Enterprise Cloud용 공개 미리보기이며, 엔드포인트가 방화벽을 사용하도록 설정해야 한다. 대기 기간·악성코드와 취약점 경보·검증 증명 수준 저하를 검사할 수 있지만 실제 공격 차단 효과를 이 발표만으로 판정할 수는 없다. 오탐 예외가 통제를 넓히는지, 설정한 경로 밖의 직접 다운로드가 남는지 후속 검토한다. [원문](https://github.blog/changelog/2026-10-20-github-package-firewall-in-public-preview)
