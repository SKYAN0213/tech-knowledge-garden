---
title: AI Conformity Assessment
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-13
aliases:
  - AI 적합성 평가
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI 거버넌스]]"
  - "[[Knowledge/AI Systems/AI Medical Imaging|AI 의료 영상]]"
tags:
  - AI
  - Governance
  - ConformityAssessment
last_reviewed: 2026-09-13
concept_id: conformity
label: AI 적합성 평가
group: 위험과 책임
keywords:
  - 사용 목적
  - 기술 문서
  - 적합성
  - 중대한 변경
verified_sources:
  - https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
relations:
  - target: governance
    type: uses
    reason: 책임·문서·위험 관리 증거를 적용 요구사항의 충족 여부와 대응시킨다.
    basis: inference
    evidence:
      - https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
---

# AI Conformity Assessment

## 한 문장 정의

AI 시스템이 적용 대상 법·기술 요구사항을 충족하는지 정해진 증거와 절차로 확인하는 평가다. [EU AI Act · Article 43](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 적합성 평가 |
| 영어 | AI Conformity Assessment |
| 키워드 | 사용 목적 · 기술 문서 · 적합성 · 중대한 변경 |

## 범위

**포함:** 특정 사용 목적·시스템 버전·요구사항에 대응하는 기술 문서와 평가 절차.

**포함하지 않음:** 일반 벤치마크 점수가 높다는 이유만으로 하는 법적 준수 선언.

## 왜 중요한가

성능 주장과 규정 충족 증거를 구분하고, 제품의 사용 목적·버전이 바뀌었을 때 다시 확인할 범위를 드러낸다.

## 핵심 구성 요소

- 사용 목적
- 기술 문서
- 적합성
- 중대한 변경

## 작동 원리

대상 시스템과 적용 요건을 정하고 증거를 대응시킨다. EU AI Act 제43조는 시스템 유형별 경로와 중대한 변경 시 재평가를 다룬다. [EU AI Act · Article 43](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)

## 실제 예시

같은 모델이라도 고위험 제품의 사용 목적과 변경 내용에 맞춰 평가 자료를 구성하는 절차.

## 한계와 실패 조건

관할·제품·변경 범위마다 요구가 다르다. 기존 평가 결과를 다른 버전과 용도에 그대로 확장할 수 없다.

## 혼동하기 쉬운 개념

위험 관리 체계의 존재와 특정 요구사항의 충족 판정은 구분한다.

## 관련 개념

- → 활용: [[Knowledge/AI Systems/AI Governance#한 문장 정의|AI 거버넌스]] — 책임·문서·위험 관리 증거를 적용 요구사항의 충족 여부와 대응시킨다. (해석; [근거](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))
- ← 활용: [[Knowledge/AI Systems/AI Medical Imaging#한 문장 정의|AI 의료 영상]] — 의료 목적의 AI는 해당 관할·제품에 맞는 평가 경로를 확인한다. FDA와 EU 절차는 서로 동일하지 않다. (해석; [근거](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices) · [근거](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng))

## 최근 변화

- 2026-07-27 — EUR-Lex 통합본은 AI Act 제43조의 고위험 AI 적합성 평가 절차와 지정기관 관여 조건을 반영했습니다.

## 출처

- [EU AI Act · Article 43](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)
- [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
