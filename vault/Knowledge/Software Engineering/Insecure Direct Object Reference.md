---
title: Insecure Direct Object Reference
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
group: 접근 제어 취약점
concept_id: insecure-direct-object-reference
label: IDOR
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - IDOR
  - 안전하지 않은 직접 객체 참조
keywords:
  - 객체 접근 권한
parent_concepts: []
related_concepts: []
tags:
  - Security
verified_sources:
  - https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/
connections: []
map_review:
  decision: include
  kind: security
  reason: 객체 식별자 사용 시 접근 권한 확인이 빠진 취약점을 정의하는 전문용어다.
  reviewed: 2026-10-09
---

# Insecure Direct Object Reference

## 한 문장 정의

IDOR는 사용자·객체 식별자로 데이터를 조회하면서 요청자에게 해당 객체의 접근 권한이 있는지 확인하지 않는 취약점이다. [Semgrep 설명](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 안전하지 않은 직접 객체 참조 |
| 영어 | Insecure Direct Object Reference |
| 약어 | IDOR |

## 범위

**포함:** 요청자가 식별자를 바꿔 다른 사용자의 객체에 접근하는 권한 확인 누락.

**포함하지 않음:** 식별자를 요청에 사용하는 모든 구현. Semgrep의 정의에서 핵심은 식별자 노출 자체가 아니라 해당 객체의 접근 권한 확인 누락이다. [원문](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/)

## 작동 원리

Semgrep 예시는 URL의 사용자 ID로 데이터를 조회하고 그대로 반환하는 경로다. 로그인한 사용자가 ID를 바꿨을 때 소유권 검사 없이 다른 사용자의 기록까지 반환한다. [원문](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/)

## 혼동하기 쉬운 개념

로그인 여부 확인과 조회할 객체의 소유권 확인은 다르다. 이 예시에서는 로그인한 상태에서도 다른 사용자의 객체를 조회할 수 있다. [원문](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/)

## 최근 변화

- **2026-06-29:** GLM-5.2 보안 평가 보도가 Semgrep의 IDOR 탐지 실험을 소개했다. 해당 실험의 F1은 39%이며 모델·실행 도구·프롬프트 조건을 함께 기록한다. [기사](../../News/946d307c203886f8.md) · [원문](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/)

## 출처

- [Semgrep · IDOR 정의와 탐지 평가](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/)
