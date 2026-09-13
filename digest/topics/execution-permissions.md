# 실행·배포 권한을 경로별로 세분화

자동화가 할 수 있는 일을 어느 단계에서 제한하는가?

[← 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/execution-permissions.md)

## 현재 판단

npm 배포 신원, 에이전트 작업, PR 병합, 캐시 접근에 각각 통제 지점이 추가됐다. 제어 기능이 존재하는 것과 실제 설정이 안전하게 적용된 것은 구분해야 한다.

2026-09-14까지 서로 다른 원문 5건 · 3일에 걸쳐 관측. 최근 7일 3건 / 이전 7일 2건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

실제 실행 SHA·환경 신원, 예외·우회 권한, 실패 시 차단 결과를 테스트하고 변경 이력을 확인한다.

## 판단을 바꿀 조건

하위 설정이나 우회 권한이 경계를 넓히거나 낮은 신뢰 이벤트에 쓰기를 허용하면 통제 강화 효과를 다시 평가한다.

## 재사용할 원칙

### 배포·실행 경로마다 신원과 최소 권한을 별도로 검증한다.

편집 분석 · 2026-09-13 검토

적용 한계: GitHub와 npm의 해당 제공 범위에 근거한다. 검사 통과가 모든 비밀정보의 부재나 workflow 무결성을 보증하지 않으며 우회 설정을 함께 점검해야 한다.

근거 기록: [2026-09-04 · npm 배포 신원을 여러 OIDC 경로로 나눌 수 있게 됐다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/execution-permissions#permissions-oidc) · [2026-09-11 · Actions 캐시의 읽기·쓰기 권한을 명시한다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/execution-permissions#permissions-cache) · [2026-09-10 · 비밀정보 경보가 남은 PR의 병합을 막는 규칙이 추가됐다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/execution-permissions#permissions-secrets)

## 관측 기록

기존 수록 기사 재정리 · 2026-09-13 검토. 아래 날짜는 기사 수록일이다.

<a id="permissions-cache"></a>

### 2026-09-11 · 관측

**Actions 캐시의 읽기·쓰기 권한을 명시한다.**

캐시 서비스에서 접근을 제한하고 재사용 workflow의 상위 권한 경계를 유지할 수 있다.

- 한계: 낮은 신뢰 이벤트에 쓰기를 명시하면 기존 읽기 전용 기본값을 덮어쓸 수 있다.
- 다음 확인: 신뢰 수준별 캐시 쓰기 허용과 경고 이후 실제 권한.
- [GitHub Actions, 작업별 캐시 읽기·쓰기 권한 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/688d14b85e07a8db) · [GitHub 원문](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-11_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="permissions-secrets"></a>

### 2026-09-10 · 관측

**비밀정보 경보가 남은 PR의 병합을 막는 규칙이 추가됐다.**

푸시 이후 병합 시점에도 검사 결과를 통제 조건으로 쓸 수 있다.

- 한계: 일부 고객 대상 공개 미리보기이며 탐지 패턴과 우회 권한에 따라 범위가 달라진다.
- 다음 확인: 최신 커밋의 검사 완료, 경보 처리, 우회·패턴 설정.
- [GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개](https://skyan0213.github.io/tech-knowledge-garden/news/0ef68bd8a0105dab) · [GitHub 원문](https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-10_0801_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="permissions-agent"></a>

### 2026-09-10 · 관측

**조직 정책으로 에이전트의 셸·파일·도메인 권한을 집행한다.**

개인의 승인 이력 외에 조직이 허용 범위를 정하는 통제 지점이 생겼다.

- 한계: 발표에 명시된 Copilot 앱·CLI·Agent Host 사용 세션 범위다.
- 다음 확인: 실제 조직 정책과 사용자 설정 충돌 시 차단 결과.
- [Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리](https://skyan0213.github.io/tech-knowledge-garden/news/faa37362568657fb) · [GitHub 원문](https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-10_0801_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="permissions-workflow"></a>

### 2026-09-04 · 관측

**재사용 workflow의 실제 정의 신원과 읽기 권한이 세분화됐다.**

실행 정의의 ref·SHA·저장소를 감사하고 불필요한 token scope를 줄일 수 있다.

- 한계: 신원 값 노출만으로 무결성이 보장되지 않으며 GHES 제공 범위도 다르다.
- 다음 확인: SHA 고정과 권한 검토, runner 지원 종료 점검.
- [GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb) · [GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="permissions-oidc"></a>

### 2026-09-04 · 관측

**npm 배포 신원을 여러 OIDC 경로로 나눌 수 있게 됐다.**

stable·prerelease 경로마다 저장소·workflow·환경 신원을 검토할 수 있다.

- 한계: 여러 구성은 추가적으로 작동하고 direct publishing은 사람 승인 경계를 없앨 수 있다.
- 다음 확인: 각 경로의 opt-in과 예외, 변경 감사·회수 절차.
- [npm, 패키지 하나에 여러 OIDC 배포 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac) · [GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

## 관련 개념

- [OpenID Connect](https://skyan0213.github.io/tech-knowledge-garden/knowledge/security/openid-connect)
- [Software Supply Chain Security](https://skyan0213.github.io/tech-knowledge-garden/knowledge/software-engineering/software-supply-chain-security)
- [AI Agent Security](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/ai-agent-security)
