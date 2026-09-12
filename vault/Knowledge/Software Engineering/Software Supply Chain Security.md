---
title: Software Supply Chain Security
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
created: 2026-06-26
updated: 2026-09-11
aliases:
  - 소프트웨어 공급망 보안
parent_concepts: []
related_concepts:
  - "[[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]]"
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
tags:
  - SoftwareEngineering
  - Security
  - SupplyChain
---

# Software Supply Chain Security

## 한 문장 정의

Software Supply Chain Security는 소스 코드와 의존성이 선택되고 빌드·서명·배포·업데이트되어 사용자에게 도달하는 전체 경로의 무결성, 출처, 권한, 재현 가능성을 보호하는 분야입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 소프트웨어 공급망 보안 |
| 영어 이름 | Software Supply Chain Security |
| 보호 경로 | source → dependency → build → artifact → signature → release |
| 대표 자산 | 패키지 계정, CI token, lockfile, artifact, 서명 인증서 |

## 범위

**포함:** 패키지 출처·악성 의존성, lockfile, 빌드 격리, CI/CD 권한, provenance, artifact 검증, 서명·공증, 릴리스 계정, 업데이트·회수입니다.

**포함하지 않음:** 애플리케이션 코드 취약점 전반, AI 모델 출력의 안전, 개별 런타임 권한만을 뜻하지 않습니다.

## 왜 중요한가

좋은 소스 코드도 의존성 계정, CI workflow, 서명 인증서, 배포 채널 중 한 곳이 오염되면 사용자의 장비에 악성 결과가 전달될 수 있습니다. AI 코딩 도구와 플러그인은 더 많은 패키지·MCP server·credential을 연결해 경계를 넓힙니다.

## 핵심 구성 요소

- 저장소와 maintainer 계정 보호
- 의존성 출처, 버전 고정, 악성 패키지 탐지
- 격리·재현 가능한 빌드와 최소 CI 권한
- SBOM과 provenance
- artifact 해시·서명·공증
- 승인된 배포 채널과 업데이트
- incident response, credential 회수, 버전 차단

## 작동 원리

1. 소스·패키지·빌드·서명·배포의 소유자와 경계를 목록화합니다.
2. 버전과 출처를 고정하고 새 패키지에는 관찰 시간을 둡니다.
3. CI 권한을 최소화하고 검증되지 않은 workflow 실행을 보류합니다.
4. 빌드 결과에 provenance와 서명을 붙입니다.
5. 설치·업데이트 전 해시와 서명을 확인합니다.
6. 사고 시 토큰·인증서를 회수하고 오염 버전을 차단합니다.

## 실제 예시

- 새 패키지 릴리스 직후 자동 업데이트하지 않고 cooldown 뒤 검증합니다.
- 처음 보는 GitHub Actions workflow는 실행 전에 사람 승인을 요구합니다.
- macOS 앱은 코드 서명과 notarization을 검증하고 오염된 인증서 버전을 차단합니다.

## 한계와 실패 조건

- SBOM이 있어도 패키지가 안전하거나 빌드가 재현된다는 보장은 없습니다.
- 서명 키가 탈취되면 악성 artifact도 정상처럼 보일 수 있습니다.
- lockfile만 믿으면 maintainer 계정 탈취와 빌드 스크립트 위험을 놓칩니다.
- 경보가 늦거나 회수 경로가 없으면 알려진 오염 버전이 계속 배포됩니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| 애플리케이션 보안 | 애플리케이션 로직의 취약점을 다루며 공급 경로의 출처·무결성과 초점이 다릅니다. |
| SBOM | 구성요소 목록은 한 증거이며 공급망 보안 전체 통제와 같지 않습니다. |
| [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]] | AI 보조 보안은 분석·패치 업무 방식이고 공급망 보안은 출하 경로 자체를 보호합니다. |

## 관련 개념

- 상위: 사이버보안, 소프트웨어 배포
- 하위: SBOM, provenance, artifact signing, dependency security
- 함께 쓰임: [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]], [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]
- 대비: 출처 검증 없는 자동 업데이트

## 최근 변화

- 2026-09-10 — GitHub Actions가 cache-mode를 정식 제공해 캐시 접근을 workflow·job별로 제한합니다. 캐시도 최소 권한 경계에 포함되지만, 낮은 신뢰 이벤트의 명시적 쓰기 허용은 기본 보호를 약화할 수 있습니다. [source](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/)

- 2026-09-09 — GitHub는 최신 PR 커밋의 비밀정보 검사 완료와 관련 열린 경보 해소를 요구하는 병합 규칙을 공개 미리보기로 추가했습니다. 푸시 보호와 별개로 병합 시점에도 출하 조건을 검증할 수 있습니다. [source](https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/)

- 2026-09-08 — Dependabot의 GitHub Packages 자동 접근이 fallback 인증으로 재활성화됐습니다. 토큰 관리 축소와 별개로 저장소별 패키지 읽기 권한 및 레지스트리 경로 우선순위를 검증해야 합니다. [source](https://github.blog/changelog/2026-09-08-automatic-dependabot-access-to-github-hosted-registries/)

- 2026-09-03 — npm trusted publishing이 패키지별 여러 OIDC 구성을 지원하고 malware scan 완료 전 staged package 승인을 막기 시작했습니다. 배포 권한을 장기 token이 아니라 저장소·workflow·environment 신원과 단계별 승인으로 분리할 수 있게 됐습니다. https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
- 2026-09-03 — GitHub Actions가 재사용 workflow의 실제 정의 ref·SHA·저장소·경로를 `job.workflow_*`로 노출하고, CodeQL이 mutable reusable-workflow reference 탐지를 확대했습니다. 실행 신원 기록과 변경 가능한 의존성 탐지를 함께 적용할 수 있게 됐습니다. https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/ https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
- 2026 — 공급망 방어는 악성 패키지 데이터 공유, 신규 릴리스 cooldown, 검증되지 않은 CI workflow의 실행 전 보류를 함께 쓰는 방향으로 강화되었습니다.

## 출처

- https://github.com/ossf/malicious-packages
- https://docs.github.com/en/code-security/concepts/supply-chain-security/malware-alerts
- https://docs.github.com/en/organizations/managing-organization-settings/actions-policies/workflow-execution-protections
- https://openai.com/index/our-response-to-the-tanstack-npm-supply-chain-attack/
- https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/
- https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
- https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
- https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
- https://github.blog/changelog/2026-09-08-automatic-dependabot-access-to-github-hosted-registries/
- https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
- https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/
