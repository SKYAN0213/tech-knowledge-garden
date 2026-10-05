---
title: Software Supply Chain Security
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
created: 2026-06-26
updated: 2026-10-05
aliases:
  - 소프트웨어 공급망 보안
parent_concepts: []
related_concepts:
  - "[[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI 보조 보안
    개발]]"
tags:
  - SoftwareEngineering
  - Security
  - SupplyChain
last_reviewed: 2026-10-05
concept_id: supply-chain
label: 소프트웨어 공급망 보안
group: 위험과 책임
keywords:
  - provenance
  - 의존성
  - 빌드
  - 산출물
  - 무결성
verified_sources:
  - https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
  - https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
  - https://slsa.dev/spec/v1.1/levels
  - https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/
  - https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
  - https://github.blog/changelog/2026-09-08-automatic-dependabot-access-to-github-hosted-registries/
  - https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
  - https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
  - https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
  - https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features
relations: []
map_review:
  decision: include
  kind: security
  reason: 빌드 출처와 산출물 무결성을 검증하는 기술이 일반적인 코드 보안 검토와 어떻게 다른지 배워야 한다.
  reviewed: 2026-10-05
---

# Software Supply Chain Security

## 한 문장 정의

소프트웨어가 소스에서 빌드·배포 산출물로 이어지는 과정의 변조를 막고, 산출물의 출처와 제작 경로를 확인하는 보안 활동이다. [SLSA v1.1](https://slsa.dev/spec/v1.1/levels)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 소프트웨어 공급망 보안 |
| 영어 | Software Supply Chain Security |
| 키워드 | provenance · 의존성 · 빌드 · 산출물 · 무결성 |

## 범위

**포함:** 빌드 입력과 제작 주체, 빌드 과정, 산출물이 기대한 경로에서 만들어졌는지 확인하는 절차. 악성 의존성 경보와 자동화 실행 보호도 전달 경로의 각 단계에서 적용된다.

**포함하지 않음:** 제작 이력 확인만으로 프로그램의 모든 동작이 안전하다고 판정하는 것. [SLSA v1.1](https://slsa.dev/spec/v1.1/levels) · [Dependabot](https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/) · [Actions](https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/)

## 왜 중요한가

SLSA 빌드 트랙은 사용자가 기대하는 출처·제작 과정과 실제 산출물에 붙은 기록을 대조하도록 한다. 빌드가 기대한 소스와 과정에서 수행됐는지를 확인할 수 있다. [SLSA v1.1](https://slsa.dev/spec/v1.1/levels)

## 핵심 구성 요소

- **빌드 입력:** 제작에 사용한 소스 등 입력.
- **빌드 주체와 과정:** 누가 어떤 방식으로 산출물을 만들었는지.
- **Provenance:** 이 입력·주체·과정을 설명하는 제작 이력.
- **검증:** 실제 기록을 기대한 값과 비교하는 절차.

[SLSA v1.1](https://slsa.dev/spec/v1.1/levels)

## 작동 원리

SLSA v1.1의 Build L1은 빌드 provenance가 존재하는 수준이다. Build L2는 호스팅된 빌드 플랫폼이 기록을 생성·서명하고, 소비자가 진위를 확인하도록 요구한다. Build L3는 빌드 실행끼리 영향을 주지 않도록 통제하고 서명 비밀을 사용자 정의 빌드 단계에서 격리하는 등 빌드 과정 자체의 보호를 강화한다. [SLSA v1.1](https://slsa.dev/spec/v1.1/levels)

## 실제 예시

Dependabot은 등록된 악성 패키지 정보와 의존성을 대조해 경보를 보내고, GitHub Actions는 악성으로 의심되는 일부 실행을 협업자의 승인 전까지 보류한다. 하나는 의존성 정보의 대조이고 다른 하나는 실행 허용 단계의 통제다. [Dependabot](https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/) · [Actions](https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/)

## 한계와 실패 조건

Build L1의 provenance는 존재하더라도 우회·위조하기 쉬울 수 있다. 제작 이력이 있다는 사실과 그 기록이 변조로부터 보호된다는 보장을 구분해야 한다. [SLSA v1.1](https://slsa.dev/spec/v1.1/levels)

## 혼동하기 쉬운 개념

악성 패키지 경보는 등록된 악성 의존성과의 일치를 찾는 기능이다. 빌드 provenance 검증은 산출물의 제작 주체·입력·과정을 확인한다. 두 절차의 검증 대상이 다르다. [Dependabot](https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/) · [SLSA v1.1](https://slsa.dev/spec/v1.1/levels)

## 관련 개념

- ← 활용: [[Knowledge/Software Engineering/AI-Assisted Security Engineering#한 문장 정의|AI 보조 보안 개발]] — AI가 제안한 의존성 변경도 검토·시험하고 산출물 제작 경로를 검증하는 과정과 연결할 수 있다. (해석; [근거](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features) · [근거](https://slsa.dev/spec/v1.1/levels))

## 최근 변화

- **2026-09-10:** GitHub Actions가 workflow·job별 cache-mode를 모든 요금제에 정식 제공했다. 낮은 신뢰 이벤트에 쓰기 권한을 명시하면 읽기 전용 기본값을 덮어쓰며, 캐시 오염 위험에 대한 경고가 표시된다. [원문](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/)
- **2026-09-09:** GitHub가 PR 최신 커밋의 비밀정보 검사 완료와 해당 PR이 추가한 비밀정보의 열린 경보 해소를 요구하는 병합 규칙을 공개 미리보기로 발표했다. [원문](https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/)
- **2026-09-08:** Dependabot이 저장소의 Manage Actions access 권한으로 비공개 GitHub Packages를 읽는 기능을 재활성화했다. 자동 인증은 fallback으로 한정하며 명시적 인증과 기존 레지스트리 경로가 우선한다. [원문](https://github.blog/changelog/2026-09-08-automatic-dependabot-access-to-github-hosted-registries/)
- **2026-09-03:** npm 패키지별 여러 OIDC trusted publishing 구성을 정식 지원하고, staged package의 악성 코드 검사가 끝나기 전에는 승인 버튼을 비활성화한다. [원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/)
- **2026-09-03:** GitHub Actions는 job.workflow_*로 재사용 workflow의 실제 정의 위치를 제공하고, CodeQL 2.26.4는 재사용 workflow의 변경 가능한 참조를 탐지한다. [Actions 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/) · [CodeQL 원문](https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/)
- **2026-07-28:** OpenSSF의 악성 패키지 보고가 Advisory Database에 자동 반영돼 Dependabot의 경보 범위가 npm·PyPI 등으로 확대됐다. [[News/1618822b0726a28a|기사]] · [원문](https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/)
- **2026-07-28:** GitHub Actions가 github.com 공개 저장소의 악성 의심 실행을 승인 전까지 보류하는 보호를 자동 적용했다. [[News/7e9257b6dba23518|기사]] · [원문](https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/)

## 출처

- https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
- https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
- https://slsa.dev/spec/v1.1/levels
- https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/
- https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
- https://github.blog/changelog/2026-09-08-automatic-dependabot-access-to-github-hosted-registries/
- https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
- https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
- https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
- https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features
