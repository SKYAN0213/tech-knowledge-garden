---
title: AI Governance
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-08-24
aliases:
  - AI 거버넌스
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Conformity Assessment|AI Conformity Assessment]]"
  - "[[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]"
tags:
  - AI
  - Governance
  - RiskManagement
---

# AI Governance

## 한 문장 정의

AI Governance는 조직이 AI의 목적, 책임, 위험 허용 수준, 데이터와 모델 사용, 평가, 배포, 감시, 중단을 일관된 규칙과 증거로 관리하는 체계입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | AI 거버넌스 |
| 영어 이름 | AI Governance |
| 적용 범위 | 조직의 AI 생애주기 전체 |
| 대표 틀 | NIST AI RMF의 Govern·Map·Measure·Manage |

## 범위

**포함:** AI 인벤토리, 책임 배분, 위험 분류, 데이터·모델 정책, 평가와 승인, 운영 감시, 사고 대응, 외부 요구사항 연결입니다.

**포함하지 않음:** 특정 규정 충족 여부를 판정하는 절차는 [[Knowledge/AI Systems/AI Conformity Assessment|AI Conformity Assessment]], 도구 행동 중심 운영은 [[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]입니다.

## 왜 중요한가

AI 위험은 모델 정확도만으로 설명되지 않습니다. 같은 모델도 의료, 채용, 코드 수정처럼 쓰임과 영향이 달라지면 요구되는 검증과 책임이 바뀝니다. 거버넌스는 이 차이를 조직의 반복 가능한 결정 과정으로 바꿉니다.

## 핵심 구성 요소

- AI 시스템과 사용 사례 인벤토리
- 역할·책임·의사결정 권한
- 맥락과 영향에 따른 위험 분류
- 정량·정성 평가와 배포 문턱
- 데이터·보안·개인정보·공급망 정책
- 운영 감시, 사고 대응, 개선 기록

## 작동 원리

NIST AI RMF의 대표 흐름은 조직의 책임 기반을 세우는 `Govern`, 쓰임과 영향을 파악하는 `Map`, 위험을 평가하는 `Measure`, 우선순위를 정해 대응하는 `Manage`입니다. 네 기능은 한 번 끝나는 순서가 아니라 운영 중 반복됩니다.

## 실제 예시

- 고객 상담 AI와 설계 계산 AI를 서로 다른 위험 등급과 검토 주기로 관리합니다.
- 새 모델을 배포하기 전 품질·보안·데이터 보존·비용 자료를 같은 승인 기록에 묶습니다.
- 사고가 발생하면 해당 모델만이 아니라 연결된 데이터·도구·사용 사례를 인벤토리에서 추적합니다.

## 한계와 실패 조건

- 체크리스트 완료 자체를 안전의 증거로 착각할 수 있습니다.
- 책임·권한 없이 원칙만 적으면 실제 배포 결정을 바꾸지 못합니다.
- 모든 사용 사례에 같은 기준을 적용하면 과잉 통제와 사각지대가 함께 생깁니다.
- 공급자 증거를 그대로 믿으면 실제 적용 환경의 위험을 놓칠 수 있습니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/AI Conformity Assessment|AI Conformity Assessment]] | 거버넌스는 지속적인 운영 체계이고, 적합성 평가는 정해진 요구사항 충족 여부를 판정하는 절차입니다. |
| AI 윤리 | 윤리는 가치와 원칙을 다루며, 거버넌스는 이를 역할·통제·증거로 운영합니다. |
| AI 위험 관리 | 위험 관리는 거버넌스의 핵심 기능이지만 조직 책임과 의사결정 구조 전체와 같지는 않습니다. |

## 관련 개념

- 상위: 조직 거버넌스, 위험 관리
- 하위: [[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]], 모델 거버넌스, 데이터 거버넌스
- 함께 쓰임: [[Knowledge/AI Systems/AI Conformity Assessment|AI Conformity Assessment]], [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]], [[Knowledge/AI Systems/Agent Observability|Agent Observability]]
- 대비: 원칙 선언만 있는 AI 윤리 문서

## 최근 변화

- 2026-06-10 — NIST는 AI RMF 1.0 개정 작업과 연동해 Playbook을 계속 갱신할 계획임을 명시했습니다.

## 출처

- https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- https://airc.nist.gov/airmf-resources/airmf/
- https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook
- https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
