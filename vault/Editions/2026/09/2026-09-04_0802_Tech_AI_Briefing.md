---
title: 2026-09-04 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-04
timezone: Asia/Seoul
coverage_start: 2026-09-03T08:03:00+09:00
coverage_end: 2026-09-04T08:02:54+09:00
source_count: 3
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
knowledge_notes_created: []
knowledge_notes_updated:
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
article_reviews:
  - title: npm trusted publishing, 한 패키지에 여러 OIDC 배포 경로를 열다
    event_id: 322b7c88af36f3ac
    review_status: unreviewed
    concept_ids: []
  - title: GitHub Actions, 최소 권한과 재사용 workflow 신원을 더 세밀하게 노출
    event_id: 473fea8bb1cbf9cb
    review_status: unreviewed
    concept_ids: []
  - title: CodeQL 2.26.4
    event_id: 13cebc4d5ec60b11
    review_status: unreviewed
    concept_ids: []
---

# 이번 호 표지

> [!abstract] 2026년 9월 4일 · 데일리 Tech & AI
> **한 줄 편집:** 패키지 배포와 CI 보안이 장기 토큰·넓은 권한에서 단계별 승인과 검증 가능한 실행 신원으로 이동했다.
> **취재 범위:** 2026-09-03 08:03:00 → 2026-09-04 08:02:54 KST
> **이번 호:** 새 항목 3건 · 원문 3개 · 새 개념 0개 · 갱신 개념 1개

# 차례

| 섹션 | 상태 |
|---|---|
| 커버 스토리 | 커버 |
| 뉴스 데스크 | 1건 |
| 리서치 노트 | 없음 |
| 도구 상자 | 1건 |
| 흐름 읽기 | 1건 |
| 오늘의 적용 | 2건 |
| 개념 색인 | 1건 |

# 커버 스토리

## npm trusted publishing, 한 패키지에 여러 OIDC 배포 경로를 열다

> [!summary] 30초 요약
> npm 패키지 하나가 stable·prerelease·staging용 trusted publishing 구성을 여러 개 가질 수 있게 됐다. 각 경로는 독립된 저장소·workflow·environment 조건으로 인증되고, malware scan이 끝나기 전에는 staged package를 승인할 수 없다. [S1]

### 무엇이 바뀌었나

GitHub는 npm의 세 기능을 정식 제공했다. 패키지마다 여러 OIDC trusted publishing 구성을 둘 수 있고, 각 구성은 서로 독립적이면서 추가적으로 작동한다. 들어온 OIDC token이 구성 하나와 일치하면 stage 또는 publish가 허용되며 평가 순서는 보장되지 않는다. 직접 배포는 구성별 opt-in이고, 기본은 staging이다. [S1]

staged publishing에는 사람이 승인하는 단계가 있으며, publish-time malware scan이 끝날 때까지 승인 버튼이 비활성화된다. versions 탭에는 승인·거절·대기 이력도 남는다. [S1]

### 왜 중요한가

장기 npm token을 여러 workflow가 공유하는 대신 실행 시점의 저장소·workflow·environment 신원으로 배포 권한을 나눌 수 있다. 자동화가 침해돼도 staging과 검사·승인 단계를 통과해야 공개 registry에 도달하도록 경계를 추가한다.

### 독자에게 미치는 영향

npm maintainer는 stable과 prerelease 배포를 별도 OIDC 조건으로 운영하면서 장기 token 의존을 줄일 수 있다. 이미 trusted publishing을 쓰는 팀도 각 구성이 서로를 제한하지 않는다는 점을 반영해 권한을 다시 점검해야 한다.

### 아직 모르는 것

정식 제공은 통제가 존재한다는 뜻이지 malware scan의 탐지율이나 사람 승인 품질을 보장하지 않는다. OIDC 발급 전 workflow나 environment가 장악되면 올바른 신원처럼 보일 수 있고, direct publishing을 켜면 사람 승인 경계가 사라진다. [S1]

### 다음에 볼 것

구성별 direct publishing 사용률, staged package의 탐지·거절 통계, workflow와 environment 변경에 대한 감사·회수 절차를 확인한다.

### 개념 더 읽기

[[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]

**근거:** [S1]

# 뉴스 데스크

## GitHub Actions, 최소 권한과 재사용 workflow 신원을 더 세밀하게 노출

**핵심:** Actions의 `GITHUB_TOKEN`에 Dependabot alert 읽기 전용 `vulnerability-alerts` 권한이 추가됐다. 재사용 workflow에는 실제 정의 파일의 ref·SHA·저장소·경로를 나타내는 `job.workflow_*` context가 생겼고, runner version의 등록·실행 지원 종료일을 조회하는 REST API도 제공된다. [S2]

**의미:** 넓은 token scope 없이 취약점 정보를 읽고, 호출한 workflow가 아니라 실제 실행 정의의 신원을 감사하며, runner 지원 종료를 자동 점검할 수 있다.

**확인할 점:** 새 context는 GitHub Enterprise Server에서 아직 제공되지 않는다. 값의 노출만으로 workflow 무결성이 보장되는 것은 아니므로 SHA 고정과 권한 검토가 함께 필요하다.

**개념:** [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]

**근거:** [S2]

# 리서치 노트

없음

# 도구 상자

## CodeQL 2.26.4

**프로젝트:** GitHub code scanning의 정적 분석 엔진 CodeQL 최신 릴리스. [S3]

**쉽게 설명:** 코드와 workflow의 데이터 흐름을 따라가며 취약할 수 있는 경로를 규칙으로 찾는다.

**상태:** Go 1.27 지원, Rust data-flow 경보 위치 개선, Spring R2DBC SQL injection sink와 Python list 조작의 taint flow 모델 등이 추가됐다. GitHub Actions에서는 mutable reference를 쓰는 재사용 workflow를 `actions/unpinned-tag`가 탐지하고, event별로 실제 존재하는 actor field만 보호 검사로 인정한다. github.com code scanning에는 자동 배포되며 GHES에는 향후 포함 예정이다. [S3]

**용도:** 지원 언어의 정적 취약점 분석과, 변경 가능한 tag로 재사용 workflow를 불러오는 공급망 위험 탐지.

**한계:** 규칙·모델이 다루지 않는 흐름은 놓칠 수 있고 위치·모델 변경으로 기존 경보가 닫힌 뒤 새 경보처럼 보일 수 있다. GHES 버전과 수동 CodeQL 버전은 별도 확인이 필요하다. 별 수 비교 대상이 아니므로 `추세 확인 불가`다.

**개념:** [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]

**근거:** [S3]

# 흐름 읽기

> [!info] 확인된 사실
> npm은 여러 OIDC 배포 구성을 열고 staging 검사를 승인보다 앞에 배치했다. Actions는 취약점 읽기 권한을 좁히고 재사용 workflow의 실제 정의 신원을 노출했으며, CodeQL은 mutable workflow reference 탐지를 확대했다. [S1], [S2], [S3]

> [!tip] 분석
> 세 변화는 공급망 보안의 초점이 “누가 token을 갖는가”에서 “어떤 workflow가 어떤 환경에서 무엇을 배포했고 어느 검사를 통과했는가”로 세분화되고 있음을 보여준다. 다만 신원·경보·승인 기록은 증거일 뿐, 안전한 artifact를 자동으로 보장하지 않는다.

# 오늘의 적용

- **대상:** npm 패키지 maintainer. **행동:** stable·prerelease·staging workflow를 별도 OIDC 구성으로 나누고 direct publishing이 꼭 필요한 구성만 명시한다. **가드레일:** 여러 구성은 서로를 제한하지 않으므로 느슨한 구성 하나가 전체 우회 경로가 되지 않는지 검토한다.
- **대상:** 재사용 GitHub Actions를 운영하는 팀. **행동:** 실행 로그에 `job.workflow_sha`와 저장소·경로를 남기고 `vulnerability-alerts: read`만 필요한 검사 workflow의 넓은 권한을 줄인다. **가드레일:** context 기록을 SHA 고정, environment 보호, 사람 승인 대신으로 취급하지 않는다.

# 개념 색인

| 개념 | 이 기사에서 필요한 이유 | 문서 상태 |
|---|---|---|
| [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]] | OIDC 배포 신원, 최소 CI 권한, staging 승인, 정적 탐지를 하나의 출하 경로로 설명 | 기존 concept 갱신 |

# Source List

- [S1] https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
- [S2] https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
- [S3] https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/