---
title: Software Supply Chain Security
type: knowledge
status: evergreen
created: 2026-06-26
updated: 2026-07-29
tags:
  - SoftwareEngineering
  - Security
  - SupplyChain
---

# Software Supply Chain Security

## 한 줄 정의

Software Supply Chain Security는 코드가 작성되고, 의존성이 설치되고, CI/CD에서 빌드되고, 서명되어 사용자에게 배포되는 전체 경로의 신뢰성을 관리하는 보안 영역입니다.

## 왜 중요한가

AI 개발 도구와 에이전트는 npm package, MCP server, desktop app, browser extension, cloud credential, local sandbox를 동시에 사용합니다. 어느 한 지점이 오염되면 모델 자체가 안전하더라도 개발자 장비, 소스 저장소, signing certificate, 배포물이 위험해질 수 있습니다.

특히 AI coding agent와 desktop AI app에서는 다음 경계가 이어져 있습니다.

- package registry 계정과 publish 권한
- lockfile과 dependency provenance
- CI/CD token, OIDC, build artifact
- code-signing certificate와 notarization
- 자동 업데이트와 강제 재설치 정책
- agent/plugin marketplace와 MCP server 출처

## 핵심 개념

| 개념 | 설명 |
|---|---|
| Dependency Provenance | 패키지가 어떤 source, build workflow, identity에서 만들어졌는지 추적하는 정보 |
| Code Signing | 배포물이 신뢰된 개발자나 조직에서 나왔음을 서명으로 확인하는 절차 |
| Certificate Rotation | 인증서 노출 가능성이 있을 때 새 인증서로 교체하고 이전 서명을 무효화하는 절차 |
| Lockfile Verification | 설치되는 의존성과 버전을 고정하고 예상하지 않은 변경을 탐지하는 방식 |
| CI/CD Credential Hygiene | build pipeline의 token, secret, OIDC 권한을 최소화하고 회수 가능한 상태로 관리하는 방식 |

## Recent Signals

- 2026-07-29 08:01 KST 브리핑: GitHub Advisory Database가 OpenSSF `malicious-packages`의 OSV 형식 보고서를 자동 수집해 Dependabot Malware alerts의 생태계 범위를 npm, PyPI 등으로 넓혔고, GitHub Actions는 탈취된 자격증명으로 추가된 것으로 의심되는 공개 저장소 워크플로를 쓰기 권한자의 웹 승인 전까지 자동 보류하기 시작했습니다. 공급망 방어가 더 넓은 악성 패키지 데이터 공유와 실행 전 행동 차단을 결합하는 신호입니다. 패키지 이름 충돌에 따른 오탐, 새 악성코드 반영 지연, 공개 github.com 저장소로 한정된 워크플로 보호는 남은 한계입니다.
- 2026-07-16 08:02 KST 브리핑: GitHub는 APIclub·Resend secret detector를 추가하고 VolcEngine Ark API 키를 기본 push protection 대상으로 넓혔습니다. `secret_scanning_alert` 웹훅에는 일반·AI 탐지를 구분하는 `secret_category`가 추가됐고, enterprise public monitoring에는 유출 귀속과 구성원·검증 도메인 현황이 표시됩니다. secret 보안 운영이 탐지에서 커밋 전 차단, 발급사 통지·폐기, 경보 라우팅, 공개 유출 범위 파악까지 연결되는 신호입니다.
- 2026-07-15 08:02 KST 브리핑: GitHub는 Dependabot 일반 버전 업데이트가 새 release 공개 뒤 최소 3일을 기다리도록 기본값을 바꿨습니다. 보안 업데이트는 즉시 열리고, 저장소는 `dependabot.yml`의 `cooldown`으로 기간을 조정하거나 해제할 수 있습니다. 자동 업데이트의 기본 운영 원칙이 '가장 빠른 반영'에서 '초기 이상 신호가 드러날 짧은 관찰 시간 확보'로 이동한 사례입니다.
- 2026-07-11 08:03 KST 브리핑: GitHub는 secret scanning detector type 이름을 `Generic patterns`와 `AI-detected secrets`로 정리했습니다. 탐지 방식 자체는 바뀌지 않았지만, 공급망 보안 운영에서는 deterministic pattern으로 잡히는 secret과 AI가 주변 문맥을 읽어 찾는 비정형 secret을 구분해 리포팅하고 대응 우선순위를 설명하기 쉬워졌습니다.
- 2026-07-05 16:03 KST 브리핑: `modelcontextprotocol/servers`는 `2026.7.4` release 범위에서 npm publishing을 OIDC trusted publishing과 provenance 중심으로 옮기고, release 전에 test를 실행하도록 release pipeline을 정리했습니다. MCP처럼 agent가 직접 붙는 서버 패키지는 기능 변화뿐 아니라 registry identity, build provenance, publish guard도 신뢰 경계가 됩니다.
- 2026-07-03 08:05 KST 브리핑: GitHub는 Copilot CLI를 GitHub Actions에서 실행할 때 장기 personal access token 대신 내장 `GITHUB_TOKEN`을 사용할 수 있게 했습니다. workflow에는 `copilot-requests: write` 권한이 필요하고, 조직 저장소에서 쓰는 AI credit은 조직에 직접 과금됩니다. AI 자동화 공급망 보안은 "토큰을 어디에 저장하느냐"보다 기본 실행 토큰, 권한 범위, 조직 단위 비용 한도, session limit을 함께 관리하는 방향으로 이동하고 있습니다.
- 2026-07-02 16:03 KST 브리핑: GitHub는 Enterprise Cloud 고객용 secret scanning public monitoring 공개 preview를 발표했습니다. 공급망 보안은 소유 repository 내부의 dependency와 secret만 보는 단계에서, 직원 계정·verified domain을 기준으로 공개 GitHub 전체에 노출된 secret을 attribution하고 회수하는 incident response 문제로 넓어지고 있습니다.
- 2026-07-01 08:05 KST 브리핑: GitHub는 open source license compliance public preview를 공개해 enterprise-wide license policy를 ruleset 조건으로 적용하고, noncompliant dependency가 production에 들어가기 전 PR에서 차단할 수 있게 했습니다. 공급망 보안은 취약점뿐 아니라 라이선스 정책, 예외 승인, 정책 관리자 역할까지 포함하는 governance 문제로 확장되고 있습니다.
- 2026-07-01 00:04 KST 브리핑: GitHub는 Dependabot이 npm private registry용 `.npmrc`를 lockfile URL에서 추정하지 않도록 바꾸고, `dependabot.yml`의 registry `scope`를 authoritative configuration으로 쓰게 했습니다. dependency automation에서는 암묵적 추론보다 repository-owned configuration이 공급망 실패와 인증 오동작을 줄입니다.
- 2026-07-01 00:04 KST 브리핑: GitHub는 2026-08-25부터 closed Dependabot security alerts 중 2년 이상 지난 항목을 archival storage로 이동하고 CSV 다운로드 경로를 제공한다고 예고했습니다. remediation evidence를 API에서 장기간 직접 조회하던 조직은 감사 보존 쿼리와 archive export 흐름을 미리 점검해야 합니다.
- 2026-06-28 06:04 KST 브리핑: The Verge는 Apple이 RAM 공급 압박을 낮추기 위해 Pentagon blacklist에 오른 CXMT로부터 memory chip을 구매할 수 있도록 미국 정부의 예외적 승인을 모색한다고 보도했습니다. 공급망 보안은 package registry나 signing certificate뿐 아니라 memory component 조달, entity-list/export-control 리스크, 지정학적 평판 리스크까지 포함합니다.
- 2026-06-26 18:02 KST 브리핑: OpenAI의 TanStack/npm 공급망 대응 문서는 June 26 amendment 신호가 있었지만 정확한 post-cutoff 수정 시각을 확인하지 못해 Major News에서 제외했습니다. 그래도 macOS 앱 code-signing certificate, desktop app update, package compromise 대응은 재사용 가능한 supply chain security 개념으로 정리할 필요가 있습니다.
- 2026-06-26 06:01 KST 브리핑: npm은 high-impact account가 이메일 변경 또는 2FA recovery code 사용 뒤 72시간 read-only 보호를 적용하는 registry safeguard를 추가했습니다. supply chain 방어는 token rotation뿐 아니라 계정 변경 직후 publish 권한을 멈추는 정책까지 포함합니다.
- 2026-06-26 12:04 KST 브리핑: GitHub Copilot CLI와 VS Code의 `strictKnownMarketplaces`는 agent/plugin 설치 출처를 제한하는 configuration-as-code 신호입니다. agent supply chain은 package dependency뿐 아니라 plugin marketplace까지 포함합니다.

## 브리핑에서 볼 체크리스트

- 새 도구가 어느 registry나 marketplace에서 배포되는가
- release artifact가 서명되고 검증 가능한가
- build workflow와 source repository가 연결되어 있는가
- credential 노출 시 회수와 재서명 절차가 있는가
- 사용자가 오래된 앱을 계속 실행할 때 OS나 updater가 어떤 정책을 적용하는가

## 연결 문서

- [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]
- [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]]
- [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]
- [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]

## Source Links

- https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
- https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
- https://github.com/ossf/malicious-packages
- https://docs.github.com/en/code-security/concepts/supply-chain-security/malware-alerts
- https://docs.github.com/en/organizations/managing-organization-settings/actions-policies/workflow-execution-protections
- https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/
- https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/
- https://github.com/modelcontextprotocol/servers/releases/tag/2026.7.4
- https://github.com/modelcontextprotocol/servers/compare/2026.6.16...2026.7.4
- https://openai.com/index/our-response-to-the-tanstack-npm-supply-chain-attack/
- https://github.blog/changelog/2026-06-25-npm-adds-preventive-account-protection-for-high-impact-accounts/
- https://github.blog/changelog/2026-06-25-enterprise-managed-settings-now-support-strictknownmarketplaces-in-vs-code-and-the-cli
- https://www.theverge.com/tech/958707/apple-ram-buy-memory-blacklisted-china-cxmt
- https://github.blog/changelog/2026-06-30-dependabot-no-longer-infers-npmrc
- https://github.blog/changelog/2026-06-30-cloud-data-retention-policy-for-closed-security-alerts
- https://github.blog/changelog/2026-06-30-open-source-license-compliance-is-in-public-preview
- https://github.blog/changelog/2026-07-01-secret-scanning-public-monitoring-for-enterprises/
- https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/secret-security/secret-scanning
- https://github.blog/changelog/2026-07-02-copilot-cli-no-longer-needs-a-personal-access-token-in-github-actions/
- https://docs.github.com/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions
- https://github.blog/changelog/2026-07-10-clearer-names-for-secret-scanning-detector-types
