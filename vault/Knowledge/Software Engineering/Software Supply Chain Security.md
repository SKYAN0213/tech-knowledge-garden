---
title: Software Supply Chain Security
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
created: 2026-06-26
updated: 2026-09-13
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
last_reviewed: 2026-09-13
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
  - https://slsa.dev/spec/v1.1/levels
relations: []
map_review:
  decision: include
  kind: security
  reason: 빌드 출처와 산출물 무결성을 검증하는 기술이 일반적인 코드 보안 검토와 어떻게 다른지 배워야 한다.
  reviewed: 2026-09-13
---

# Software Supply Chain Security

## 한 문장 정의

소스·의존성·빌드·배포에 이르는 소프트웨어 전달 경로의 무결성과 출처를 보호하는 활동이다. [SLSA · Build levels v1.1](https://slsa.dev/spec/v1.1/levels)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 소프트웨어 공급망 보안 |
| 영어 | Software Supply Chain Security |
| 키워드 | provenance · 의존성 · 빌드 · 산출물 · 무결성 |

## 범위

**포함:** 빌드 입력, 실행 주체, 산출물과 provenance의 검증.

**포함하지 않음:** 서명된 프로그램에는 취약점이나 악성 동작이 없다는 보증.

## 왜 중요한가

패키지 이름이나 서명만 신뢰하지 않고, 실제 산출물이 기대한 소스와 빌드 경로에서 왔는지 확인하게 한다.

## 핵심 구성 요소

- provenance
- 의존성
- 빌드
- 산출물
- 무결성

## 작동 원리

SLSA는 산출물을 누가 어떤 입력과 과정으로 만들었는지 기록하고 그 기록과 빌드를 위변조로부터 보호하는 수준을 구분한다. [SLSA · Build levels v1.1](https://slsa.dev/spec/v1.1/levels)

## 실제 예시

배포 전에 패키지의 빌드 출처가 기대한 저장소와 과정에 맞는지 확인하는 단계.

## 한계와 실패 조건

낮은 수준의 provenance는 존재해도 위조가 쉬울 수 있다. 출처 확인과 코드 동작의 안전성 검증을 혼동하면 안 된다.

## 혼동하기 쉬운 개념

취약점 검사는 코드 결함을 찾고 공급망 보안은 제작·전달 경로의 신뢰를 다룬다.

## 관련 개념

- ← 활용: [[Knowledge/Software Engineering/AI-Assisted Security Engineering#한 문장 정의|AI 보조 보안 개발]] — AI가 제안한 코드도 기존 빌드·배포 출처 검증을 거쳐 전달한다. (해석; [근거](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features) · [근거](https://slsa.dev/spec/v1.1/levels))

## 최근 변화

- 2026-09-10 — GitHub Actions가 cache-mode를 정식 제공해 캐시 접근을 workflow·job별로 제한합니다. 캐시도 최소 권한 경계에 포함되지만, 낮은 신뢰 이벤트의 명시적 쓰기 허용은 기본 보호를 약화할 수 있습니다. [source](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/)

- 2026-09-09 — GitHub는 최신 PR 커밋의 비밀정보 검사 완료와 관련 열린 경보 해소를 요구하는 병합 규칙을 공개 미리보기로 추가했습니다. 푸시 보호와 별개로 병합 시점에도 출하 조건을 검증할 수 있습니다. [source](https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/)

- 2026-09-08 — Dependabot의 GitHub Packages 자동 접근이 fallback 인증으로 재활성화됐습니다. 토큰 관리 축소와 별개로 저장소별 패키지 읽기 권한 및 레지스트리 경로 우선순위를 검증해야 합니다. [source](https://github.blog/changelog/2026-09-08-automatic-dependabot-access-to-github-hosted-registries/)

- 2026-09-03 — npm trusted publishing이 패키지별 여러 OIDC 구성을 지원하고 malware scan 완료 전 staged package 승인을 막기 시작했습니다. 배포 권한을 장기 token이 아니라 저장소·workflow·environment 신원과 단계별 승인으로 분리할 수 있게 됐습니다. https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/
- 2026-09-03 — GitHub Actions가 재사용 workflow의 실제 정의 ref·SHA·저장소·경로를 `job.workflow_*`로 노출하고, CodeQL이 mutable reusable-workflow reference 탐지를 확대했습니다. 실행 신원 기록과 변경 가능한 의존성 탐지를 함께 적용할 수 있게 됐습니다. https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/ https://github.blog/changelog/2026-09-03-codeql-2-26-4-improves-github-actions-security-detections/
- 2026 — 공급망 방어는 악성 패키지 데이터 공유, 신규 릴리스 cooldown, 검증되지 않은 CI workflow의 실행 전 보류를 함께 쓰는 방향으로 강화되었습니다.

## 출처

- [SLSA · Build levels v1.1](https://slsa.dev/spec/v1.1/levels)
