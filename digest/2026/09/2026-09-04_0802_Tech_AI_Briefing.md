# 2026-09-04 아침 브리핑

패키지 배포와 CI 보안이 장기 토큰·넓은 권한에서 단계별 승인과 검증 가능한 실행 신원으로 이동했다.

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 오늘의 변화

기존 수록 기사 재정리 · 2026-09-13 검토

### npm 배포 신원을 여러 OIDC 경로로 나눌 수 있게 됐다.

stable·prerelease 경로마다 저장소·workflow·환경 신원을 검토할 수 있다.

- 판단: 관측
- 한계: 여러 구성은 추가적으로 작동하고 direct publishing은 사람 승인 경계를 없앨 수 있다.
- 다음 확인: 각 경로의 opt-in과 예외, 변경 감사·회수 절차.
- 근거: [npm trusted publishing, 한 패키지에 여러 OIDC 배포 경로를 열다](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac) · [GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)
- 누적 기록: [실행·배포 권한을 경로별로 세분화](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/execution-permissions)

### 재사용 workflow의 실제 정의 신원과 읽기 권한이 세분화됐다.

실행 정의의 ref·SHA·저장소를 감사하고 불필요한 token scope를 줄일 수 있다.

- 판단: 관측
- 한계: 신원 값 노출만으로 무결성이 보장되지 않으며 GHES 제공 범위도 다르다.
- 다음 확인: SHA 고정과 권한 검토, runner 지원 종료 점검.
- 근거: [GitHub Actions, 최소 권한과 재사용 workflow 신원을 더 세밀하게 노출](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb) · [GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/)
- 누적 기록: [실행·배포 권한을 경로별로 세분화](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/execution-permissions)

## 헤드라인과 원문

### [npm trusted publishing, 한 패키지에 여러 OIDC 배포 경로를 열다](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac)

npm 패키지 하나가 stable·prerelease·staging용 trusted publishing 구성을 여러 개 가질 수 있게 됐다. 각 경로는 독립된 저장소·workflow·environment 조건으로 인증되고, malware scan이 끝나기 전에는 staged package를 승인할 수 없다.

[GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)

### [GitHub Actions, 최소 권한과 재사용 workflow 신원을 더 세밀하게 노출](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb)

Actions의 GITHUB_TOKEN에 Dependabot alert 읽기 전용 vulnerability-alerts 권한이 추가됐다. 재사용 workflow에는 실제 정의 파일의 ref·SHA·저장소·경로를 나타내는 job.workflow_ context가 생겼고, runner version의 등록·실행 지원 종료일을 조회하는 REST API도 제공된다.

[GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/)

### [CodeQL 2.26.4](https://skyan0213.github.io/tech-knowledge-garden/news/13cebc4d5ec60b11)

코드와 workflow의 데이터 흐름을 따라가며 취약할 수 있는 경로를 규칙으로 찾는다.

[GitHub 원문](https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/)

## 흐름 읽기

> **확인된 사실**
> npm은 여러 OIDC 배포 구성을 열고 staging 검사를 승인보다 앞에 배치했다. Actions는 취약점 읽기 권한을 좁히고 재사용 workflow의 실제 정의 신원을 노출했으며, CodeQL은 mutable workflow reference 탐지를 확대했다. [S1](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/), [S2](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/), [S3](https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/)

> **분석**
> 세 변화는 공급망 보안의 초점이 “누가 token을 갖는가”에서 “어떤 workflow가 어떤 환경에서 무엇을 배포했고 어느 검사를 통과했는가”로 세분화되고 있음을 보여준다. 다만 신원·경보·승인 기록은 증거일 뿐, 안전한 artifact를 자동으로 보장하지 않는다.

## 오늘의 적용

- **대상:** npm 패키지 maintainer. **행동:** stable·prerelease·staging workflow를 별도 OIDC 구성으로 나누고 direct publishing이 꼭 필요한 구성만 명시한다. **가드레일:** 여러 구성은 서로를 제한하지 않으므로 느슨한 구성 하나가 전체 우회 경로가 되지 않는지 검토한다.
- **대상:** 재사용 GitHub Actions를 운영하는 팀. **행동:** 실행 로그에 `job.workflow_sha`와 저장소·경로를 남기고 `vulnerability-alerts: read`만 필요한 검사 workflow의 넓은 권한을 줄인다. **가드레일:** context 기록을 SHA 고정, environment 보호, 사람 승인 대신으로 취급하지 않는다.
