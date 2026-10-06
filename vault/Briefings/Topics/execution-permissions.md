---
title: 실행·배포 권한을 경로별로 세분화
type: briefing-topic
topic_id: execution-permissions
date: 2026-10-07
description: npm 배포 신원, 에이전트 작업, PR 병합, 캐시 접근에 각각 통제 지점이 추가됐다. 제어 기능이 존재하는 것과 실제
  설정이 안전하게 적용된 것은 구분해야 한다. 9월21일 GitHub의 자격증명 목록 내보내기는 감사 입력을 추가했지만 토큰 폐기나 최소 권한
  적용은 별도 조치다. 9월22일 네이버 DSAC 출시와 Proofpoint 연말 기능 예고는 제공 단계가 다르다. 접근 정책·로그·사람 승인
  적용은 별도 운영 검증이 필요하다.  10월1일 Data Agent Kit는 사용자·서비스 계정 권한 전파를 설명했지만, 같은 날
  Cisco와 AMD는 각각 관리 API·RCCL 실행 경계 취약점을 공지했다. 통제 기능의 존재와 설치된 최소 권한·패치 안전성을 구분한다.
github_url: https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/execution-permissions.md
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# 실행·배포 권한을 경로별로 세분화

자동화가 할 수 있는 일을 어느 단계에서 제한하는가?

[[Briefings/index|← 브리핑]] · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/execution-permissions.md)

## 현재 판단

npm 배포 신원, 에이전트 작업, PR 병합, 캐시 접근에 각각 통제 지점이 추가됐다. 제어 기능이 존재하는 것과 실제 설정이 안전하게 적용된 것은 구분해야 한다. 9월21일 GitHub의 자격증명 목록 내보내기는 감사 입력을 추가했지만 토큰 폐기나 최소 권한 적용은 별도 조치다. 9월22일 네이버 DSAC 출시와 Proofpoint 연말 기능 예고는 제공 단계가 다르다. 접근 정책·로그·사람 승인 적용은 별도 운영 검증이 필요하다.  10월1일 Data Agent Kit는 사용자·서비스 계정 권한 전파를 설명했지만, 같은 날 Cisco와 AMD는 각각 관리 API·RCCL 실행 경계 취약점을 공지했다. 통제 기능의 존재와 설치된 최소 권한·패치 안전성을 구분한다.

2026-10-07까지 서로 다른 원문 11건 · 6일에 걸쳐 관측. 최근 7일 3건 / 이전 7일 0건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

실제 실행 SHA·환경 신원, 예외·우회 권한, 실패 시 차단 결과를 테스트하고 변경 이력을 확인한다.

## 판단을 바꿀 조건

하위 설정이나 우회 권한이 경계를 넓히거나 낮은 신뢰 이벤트에 쓰기를 허용하면 통제 강화 효과를 다시 평가한다.

## 재사용할 원칙

### 배포·실행 경로마다 신원과 최소 권한을 별도로 검증한다.

편집 분석 · 2026-09-13 검토

적용 한계: GitHub와 npm의 해당 제공 범위에 근거한다. 검사 통과가 모든 비밀정보의 부재나 workflow 무결성을 보증하지 않으며 우회 설정을 함께 점검해야 한다.

근거 기록: [[Briefings/Topics/execution-permissions#permissions-oidc|2026-09-04 · npm 배포 신원을 여러 OIDC 경로로 나눌 수 있게 됐다.]] · [[Briefings/Topics/execution-permissions#permissions-cache|2026-09-11 · Actions 캐시의 읽기·쓰기 권한을 명시한다.]] · [[Briefings/Topics/execution-permissions#permissions-secrets|2026-09-10 · 비밀정보 경보가 남은 PR의 병합을 막는 규칙이 추가됐다.]]

## 관측 기록

기존 수록 기사 재정리 · 2026-09-13 검토. 아래 날짜는 기사 수록일이다.

<span id="20261001-data-agent-permissions"></span>

### 2026-10-01 · 관측

**Data Agent Kit 도구가 사용자 또는 가장된 서비스 계정 권한을 사용하고 IAM 및 데이터 보안 정책을 따르도록 제공됐다.**

에이전트 데이터 작업에 기존 사용자 권한을 전파하는 통제 지점이 명시됐다.

- 한계: 문서화된 기능은 실제 조직 설정, 최소 권한과 감사 적용이 안전하다는 증거가 아니다.
- 다음 확인: 가장 역할 설정, 행·열 수준 정책, 감사 로그와 비인가 호출 거부를 실제 구성에서 확인한다.
- [[News/294333117691a99b|Google Cloud Data Agent Kit 정식 제공…Bigtable·Spark 지원 추가]] · [Google 원문](https://cloud.google.com/blog/topics/developers-practitioners/data-agent-kit-is-now-ga-bring-google-data-cloud-to-any-coding-agent/) · [[Briefings/2026/10/2026-10-01_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-10-01 원문 검토

<span id="20261001-cisco-api-vulnerability"></span>

### 2026-10-01 · 반대·제약

**Cisco는 SD-WAN Manager API의 CVSS 9.8 비인증 관리자 접근 취약점을 공개하고 우회책이 없어 업그레이드를 안내했다.**

관리 API 인증 경계의 결함은 제품에 명시된 운영 권한 통제도 취약점 하나로 무력화될 수 있음을 보여준다.

- 한계: 취약점 공지는 실제 침해가 확인됐다는 뜻이 아니며 영향은 취약 버전 구성에 한정된다.
- 다음 확인: 설치 버전과 패치 상태, 관리자 진단 자료, Cisco의 후속 악용 현황을 확인한다.
- [[News/0b883a59e5850ce3|Cisco Catalyst SD-WAN Manager API 인증 우회 취약점 공개]] · [cisco.com 원문](https://www.cisco.com/c/en/us/support/docs/csa/cisco-sa-sdwan-webauth-xr8beuuU.html) · [[Briefings/2026/10/2026-10-01_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-10-01 원문 검토

<span id="20261001-amd-rccl-vulnerability"></span>

### 2026-10-01 · 반대·제약

**AMD가 RCCL 취약점에서 조건부 메모리 노출과 원격 코드 실행 가능성을 공지하고 완화 버전을 제시했다.**

분산 GPU 통신 라이브러리 입력 검증이 에이전트·계산 작업의 실행 권한 경계에 영향을 줄 수 있다.

- 한계: AMD 공지의 영향 제품 표에 다른 CVE 식별자가 함께 있어 해당 버전·식별자는 별도 확인이 필요하다. 침해가 보고된 것은 아니다.
- 다음 확인: AMD가 수정하는 제품·CVE 매핑, RCCL 버전별 패치 적용과 악용 여부를 확인한다.
- [[News/2000861d5f1c75c8|AMD ROCm RCCL 입력 검증 취약점, 원격 코드 실행 가능성 보고]] · [amd.com 원문](https://www.amd.com/en/resources/product-security/bulletin/amd-sb-6033.html) · [[Briefings/2026/10/2026-10-01_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-10-01 원문 검토

<span id="20260923-proofpoint-execution-permissions"></span>

### 2026-09-23 · 참고

**Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표**

데이터 유출과 AI 사용 위험의 통합 관리

- 한계: 공통 그래프와 자동 대응은 제품 설계 설명이다. 실제 오탐률, 대응 지연과 사람이 승인해야 하는 범위는 도입 환경에서 별도로 확인할 사항이다.
- 다음 확인: 실제 제공 범위, 오탐률, 사람 승인 정책.
- [[News/f73f3c73e2cee66d|Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표]] · [proofpoint.com 원문](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-breaks-down-divide-between-data-security-and-ai-security) · [[Briefings/2026/09/2026-09-23_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-09-23 원문 검토

<span id="20260923-naver-execution-permissions"></span>

### 2026-09-23 · 참고

**네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시**

DB·서버 접근과 감사 기록의 통합

- 한계: 접근 통제 도구의 제공과 조직의 정책 준수는 별개다. 사용자 권한·예외 정책·경보 후 대응을 실제 업무에 맞게 설정해야 하며, 제품 도입만으로 규정 준수가 보장되지는 않는다.
- 다음 확인: 실제 권한·예외 설정과 경보 대응 결과.
- [[News/c2a48879e9e88507|네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시]] · [navercorp.com 원문](https://navercorp.com/media/pressReleasesDetail?seq=10034680) · [[Briefings/2026/09/2026-09-23_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-09-23 원문 검토

<span id="20260922-github-execution-permissions"></span>

### 2026-09-22 · 참고

**GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공**

기업 접근 권한의 목록화와 감사

- 한계: Enterprise Server 지원은 향후 제공 예정이다. 목록을 얻는 것만으로 오래된 토큰이 폐기되지는 않으므로, 실제 권한 축소와 자격증명 정리는 별도 운영 조치다.
- 다음 확인: 기업 설정 적용, 토큰 폐기·권한 축소 여부.
- [[News/f631d543deb02b09|GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공]] · [GitHub 원문](https://github.blog/changelog/2026-09-21-github-enterprise-adds-credential-inventory-exports/) · [[Briefings/2026/09/2026-09-22_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-09-22 원문 검토

<span id="permissions-cache"></span>

### 2026-09-11 · 관측

**Actions 캐시의 읽기·쓰기 권한을 명시한다.**

캐시 서비스에서 접근을 제한하고 재사용 workflow의 상위 권한 경계를 유지할 수 있다.

- 한계: 낮은 신뢰 이벤트에 쓰기를 명시하면 기존 읽기 전용 기본값을 덮어쓸 수 있다.
- 다음 확인: 신뢰 수준별 캐시 쓰기 허용과 경고 이후 실제 권한.
- [[News/688d14b85e07a8db|GitHub Actions, 작업별 캐시 읽기·쓰기 권한 설정 지원]] · [GitHub 원문](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/) · [[Briefings/2026/09/2026-09-11_0800_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="permissions-secrets"></span>

### 2026-09-10 · 관측

**비밀정보 경보가 남은 PR의 병합을 막는 규칙이 추가됐다.**

푸시 이후 병합 시점에도 검사 결과를 통제 조건으로 쓸 수 있다.

- 한계: 일부 고객 대상 공개 미리보기이며 탐지 패턴과 우회 권한에 따라 범위가 달라진다.
- 다음 확인: 최신 커밋의 검사 완료, 경보 처리, 우회·패턴 설정.
- [[News/0ef68bd8a0105dab|GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개]] · [GitHub 원문](https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/) · [[Briefings/2026/09/2026-09-10_0801_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="permissions-agent"></span>

### 2026-09-10 · 관측

**조직 정책으로 에이전트의 셸·파일·도메인 권한을 집행한다.**

개인의 승인 이력 외에 조직이 허용 범위를 정하는 통제 지점이 생겼다.

- 한계: 발표에 명시된 Copilot 앱·CLI·Agent Host 사용 세션 범위다.
- 다음 확인: 실제 조직 정책과 사용자 설정 충돌 시 차단 결과.
- [[News/faa37362568657fb|Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리]] · [GitHub 원문](https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/) · [[Briefings/2026/09/2026-09-10_0801_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="permissions-workflow"></span>

### 2026-09-04 · 관측

**재사용 workflow의 실제 정의 신원과 읽기 권한이 세분화됐다.**

실행 정의의 ref·SHA·저장소를 감사하고 불필요한 token scope를 줄일 수 있다.

- 한계: 신원 값 노출만으로 무결성이 보장되지 않으며 GHES 제공 범위도 다르다.
- 다음 확인: SHA 고정과 권한 검토, runner 지원 종료 점검.
- [[News/473fea8bb1cbf9cb|GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가]] · [GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/) · [[Briefings/2026/09/2026-09-04_0802_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="permissions-oidc"></span>

### 2026-09-04 · 관측

**npm 배포 신원을 여러 OIDC 경로로 나눌 수 있게 됐다.**

stable·prerelease 경로마다 저장소·workflow·환경 신원을 검토할 수 있다.

- 한계: 여러 구성은 추가적으로 작동하고 direct publishing은 사람 승인 경계를 없앨 수 있다.
- 다음 확인: 각 경로의 opt-in과 예외, 변경 감사·회수 절차.
- [[News/322b7c88af36f3ac|npm, 패키지 하나에 여러 OIDC 배포 설정 지원]] · [GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/) · [[Briefings/2026/09/2026-09-04_0802_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

## 관련 개념

- [[Knowledge/Security/OpenID Connect|OpenID Connect]]
- [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]
- [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]
