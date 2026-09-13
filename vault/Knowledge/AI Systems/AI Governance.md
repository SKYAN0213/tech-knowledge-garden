---
title: AI Governance
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-13
aliases:
  - AI 거버넌스
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]]"
  - "[[Knowledge/AI Systems/AI Conformity Assessment|AI 적합성 평가]]"
  - "[[Knowledge/AI Systems/AI Wellness Devices|AI 웰니스 기기]]"
  - "[[Knowledge/Security/Zero-Knowledge Proofs|영지식 증명]]"
tags:
  - AI
  - Governance
  - RiskManagement
last_reviewed: 2026-09-13
concept_id: governance
label: AI 거버넌스
group: 위험과 책임
keywords:
  - GOVERN
  - MAP
  - MEASURE
  - MANAGE
  - 책임
verified_sources:
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
relations: []
map_review:
  decision: exclude
  reason: 현재 문서는 조직의 책임과 위험 관리라는 넓은 주제다. 학습 지도에는 개별 기술이나 평가 방법을 우선한다.
  reviewed: 2026-09-13
---

# AI Governance

## 한 문장 정의

AI의 목적·책임·위험 허용 범위와 관리 절차를 조직의 생애주기 활동에 연결하는 체계다. [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 거버넌스 |
| 영어 | AI Governance |
| 키워드 | GOVERN · MAP · MEASURE · MANAGE · 책임 |

## 범위

**포함:** 역할, 감독, 위험 관리, 운영 정책과 재검토.

**포함하지 않음:** 특정 제품의 법적 적합성을 자동 인정하는 인증서.

## 왜 중요한가

위험을 누가 판단하고 대응할지 정해 기술적 검사와 조직의 책임이 이어지게 한다.

## 핵심 구성 요소

- GOVERN
- MAP
- MEASURE
- MANAGE
- 책임

## 작동 원리

NIST AI RMF의 GOVERN은 MAP·MEASURE·MANAGE 전반에 걸친 기능이다. 네 기능은 고정된 일회성 순서가 아니라 반복 관리에 사용된다. [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)

## 실제 예시

담당자·사용 목적·점검 기준을 정하고 배포 후 위험을 주기적으로 재검토하는 조직 운영.

## 한계와 실패 조건

정책 문서만 있고 실행 책임과 피드백이 없으면 통제가 작동하지 않는다.

## 혼동하기 쉬운 개념

거버넌스는 지속적 운영 체계이며 적합성 평가는 특정 요구사항의 충족 여부를 확인하는 절차다.

## 관련 개념

- ← 속함: [[Knowledge/AI Systems/AI Agent Governance#한 문장 정의|에이전트 거버넌스]] — 조직 AI 거버넌스를 자율 행동과 위임 권한에 적용하는 하위 범위다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents))
- ← 활용: [[Knowledge/AI Systems/Enterprise AI Operating Model#한 문장 정의|기업 AI 운영 모델]] — 업무 도입·운영 책임에 AI 위험 관리 체계를 결합한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))
- ← 활용: [[Knowledge/AI Systems/AI Conformity Assessment#한 문장 정의|AI 적합성 평가]] — 책임·문서·위험 관리 증거를 적용 요구사항의 충족 여부와 대응시킨다. (해석; [근거](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))
- ← 활용: [[Knowledge/AI Systems/AI Wellness Devices#한 문장 정의|AI 웰니스 기기]] — 건강 지원 주장과 사용 목적을 책임 있는 운영 범위로 관리한다. (해석; [근거](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))
- ← 근거 제공: [[Knowledge/Security/Zero-Knowledge Proofs#한 문장 정의|영지식 증명]] — 원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다. (해석; [근거](https://csrc.nist.gov/glossary/term/zero_knowledge_proof) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))

## 최근 변화

- 2026-06-10 — NIST는 AI RMF 1.0 개정 작업과 연동해 Playbook을 계속 갱신할 계획임을 명시했습니다.

## 출처

- [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
