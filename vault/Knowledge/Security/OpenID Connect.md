---
title: OpenID Connect
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Security
created: 2026-09-13
updated: 2026-09-13
last_reviewed: 2026-09-13
aliases:
  - OIDC
  - OpenID Connect
parent_concepts: []
related_concepts:
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망
    보안]]"
tags:
  - Technology
concept_id: oidc
label: OIDC
group: 위험과 책임
keywords:
  - ID 토큰
  - 신원 확인
  - 단기 자격 증명
verified_sources:
  - https://openid.net/specs/openid-connect-core-1_0.html
  - https://docs.github.com/en/actions/concepts/security/openid-connect
map_review:
  decision: include
  kind: protocol
  reason: OAuth 2.0의 권한 위임과 신원 확인을 구별하고 배포 작업이 장기 비밀 없이 인증하는 원리를 이해해야 한다.
  reviewed: 2026-09-13
connections:
  - target: supply-chain
    reason: 배포 워크플로의 신원을 확인해 단기 자격 증명을 발급하는 방식으로 빌드·배포 경로를 보호할 수 있다.
    evidence:
      - https://docs.github.com/en/actions/concepts/security/openid-connect
---

# OpenID Connect

## 한 문장 정의

OAuth 2.0 위에 신원 확인 계층을 더해, 인증 결과와 신원 정보를 ID 토큰 등으로 전달하는 프로토콜이다. [OpenID 명세](https://openid.net/specs/openid-connect-core-1_0.html)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 오픈아이디 커넥트 |
| 영어 | OpenID Connect · OIDC |
| 키워드 | ID 토큰 · 신원 확인 · 단기 자격 증명 |

## 범위

**포함:** 신원 제공자가 전달한 인증 결과와 주장(claim)을 검증하는 방식.

**포함하지 않음:** 검증된 모든 주체에 자동으로 권한을 주는 정책.

## 왜 중요한가

배포 자동화에서는 신뢰할 워크플로를 정하고 단기 자격 증명을 받을 수 있어 장기 클라우드 비밀의 복제를 줄인다. [GitHub](https://docs.github.com/en/actions/concepts/security/openid-connect)

## 핵심 구성 요소

- 신원 제공자와 검증 주체
- ID 토큰과 발급자·대상·주체 정보
- 토큰 검증과 별도의 권한 정책

## 작동 원리

검증 주체가 서명·발급자·대상·만료 등 토큰 조건을 확인한다. 접근을 허용할지는 서비스의 정책으로 결정한다.

## 실제 예시

GitHub Actions 작업이 자신의 신원 토큰을 제시하고 클라우드 제공자로부터 작업용 단기 토큰을 받는다.

## 한계와 실패 조건

신뢰할 저장소·브랜치 등 허용 조건을 넓게 잡으면 의도하지 않은 작업도 권한을 받을 수 있다.

## 혼동하기 쉬운 개념

OAuth 2.0은 접근 권한 위임을 다룬다. OIDC는 그 위에서 신원 확인 정보를 제공한다. ID 토큰은 일반적인 API 접근 토큰과 용도가 다르다.

## 관련 개념

- [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]] — 배포 워크플로의 신원을 확인해 단기 자격 증명을 발급하는 방식으로 빌드·배포 경로를 보호할 수 있다.

## 최근 변화

없음

## 출처

- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [GitHub Actions · OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)
