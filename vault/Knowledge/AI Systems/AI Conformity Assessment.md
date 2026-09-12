---
title: AI Conformity Assessment
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-08-24
aliases:
  - AI 적합성 평가
parent_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI Governance]]"
related_concepts:
  - "[[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]"
tags:
  - AI
  - Governance
  - ConformityAssessment
---

# AI Conformity Assessment

## 한 문장 정의

AI Conformity Assessment는 AI 시스템이 법, 표준, 공통 규격, 계약처럼 미리 정한 요구사항을 충족하는지 증거를 모아 판정하는 절차입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | AI 적합성 평가 |
| 영어 이름 | AI Conformity Assessment |
| 판정 대상 | 시스템, 품질관리체계, 기술 문서, 운영 통제 |
| 가능한 수행자 | 공급자 내부 조직 또는 지정된 제3자 기관 |

## 범위

**포함:** 적용 요구사항 식별, 시험·검사·문서 검토, 증거 추적, 내부 통제 또는 제3자 평가, 부적합 처리와 재평가입니다.

**포함하지 않음:** 조직이 계속 위험을 관리하는 전체 체계는 [[Knowledge/AI Systems/AI Governance|AI Governance]], 제품 성능을 개선하기 위한 일반 실험은 [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]입니다.

## 왜 중요한가

“안전하다”는 주장과 “어떤 요구사항을 어떤 증거로 충족했다”는 판정은 다릅니다. 적합성 평가는 공급자, 사용자, 규제기관 사이에서 확인할 수 있는 증거 단위를 만듭니다.

## 핵심 구성 요소

| 요소 | 설명 |
|---|---|
| 요구사항 기준선 | 어떤 조항·표준·규격을 평가할지 확정 |
| 평가 범위 | 모델, 데이터, 시스템 경계와 버전 고정 |
| 시험·검사 | 성능, 안전, 보안, 문서와 운영 통제 확인 |
| 추적 가능한 증거 | 결과를 요구사항과 정확히 연결 |
| 독립성 수준 | 내부 통제인지 제3자 평가인지 구분 |
| 부적합 처리 | 시정, 재시험, 인증 제한·중단 절차 |

## 작동 원리

1. 적용 법규·표준과 평가할 시스템 버전을 고정합니다.
2. 요구사항별 증거 계획과 책임자를 정합니다.
3. 시험 결과, 기술 문서, 품질관리 기록을 수집합니다.
4. 요구사항별 충족·부적합·판정 불가를 기록합니다.
5. 필요한 경우 지정 기관이 검토하고 인증·선언을 발행합니다.
6. 중대한 변경 뒤에는 영향 범위를 판단해 재평가합니다.

## 실제 예시

EU AI Act의 고위험 AI는 적용 영역과 표준 사용 여부에 따라 내부 통제 또는 품질관리체계·기술문서에 대한 지정기관 평가 절차를 거칠 수 있습니다.

## 한계와 실패 조건

- 평가 범위 밖의 실제 사용 방식까지 안전하다고 보장하지 않습니다.
- 모델·데이터·도구가 바뀌었는데 버전 증거를 갱신하지 않으면 판정이 오래됩니다.
- 조화표준이 아직 없거나 일부만 적용되면 필요한 제3자 관여가 달라질 수 있습니다.
- 서류 존재와 실제 통제 작동을 혼동하면 형식적 준수에 그칩니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/AI Governance|AI Governance]] | 거버넌스는 지속적인 책임·위험 운영이고, 적합성 평가는 특정 요구사항에 대한 판정 절차입니다. |
| 인증 | 인증은 적합성 평가 결과를 제3자가 공식 확인하는 한 형태입니다. 모든 적합성 평가가 인증은 아닙니다. |
| [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]] | 에이전트 평가는 품질과 실패를 측정하며 법적·표준 요구사항의 공식 판정과 같지 않습니다. |

## 관련 개념

- 상위: [[Knowledge/AI Systems/AI Governance|AI Governance]], 적합성 평가
- 하위: 내부 통제 평가, 제3자 적합성 평가
- 함께 쓰임: 품질관리체계, 기술 문서, [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]
- 대비: 자체 성능 벤치마크

## 최근 변화

- 2026-07-27 — EUR-Lex 통합본은 AI Act 제43조의 고위험 AI 적합성 평가 절차와 지정기관 관여 조건을 반영했습니다.

## 출처

- https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=en
- https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02024R1689-20260727
- https://airc.nist.gov/
