---
title: Zero-Knowledge Proofs
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Security
created: 2026-09-03
updated: 2026-09-13
aliases:
  - 영지식 증명
  - ZKP
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI 거버넌스]]"
tags:
  - Security
  - Privacy
  - Cryptography
last_reviewed: 2026-09-13
concept_id: zkp
label: 영지식 증명
group: 위험과 책임
keywords:
  - ZKP
  - 증명자
  - 검증자
  - 비공개 증거
  - 명제
verified_sources:
  - https://csrc.nist.gov/glossary/term/zero_knowledge_proof
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
relations:
  - target: governance
    type: informs
    reason: 원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다.
    basis: inference
    evidence:
      - https://csrc.nist.gov/glossary/term/zero_knowledge_proof
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
---

# Zero-Knowledge Proofs

## 한 문장 정의

증명자가 비밀 내용 자체를 추가로 공개하지 않고 검증자에게 어떤 명제가 참임을 보이는 암호학적 방식이다. [NIST · Zero-Knowledge Proof](https://csrc.nist.gov/glossary/term/zero_knowledge_proof)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 영지식 증명 |
| 영어 | Zero-Knowledge Proofs |
| 키워드 | ZKP · 증명자 · 검증자 · 비공개 증거 · 명제 |

## 범위

**포함:** 명제·증거·검증 알고리즘과 공개 정보의 경계.

**포함하지 않음:** 네트워크 식별이나 발급자 신뢰까지 자동으로 없애는 익명성 보증.

## 왜 중요한가

검증에 필요한 조건만 입증하고 원본 정보 공개를 줄일 수 있다. 정보 최소화와 검증을 함께 설계하는 선택지를 제공한다.

## 핵심 구성 요소

- ZKP
- 증명자
- 검증자
- 비공개 증거
- 명제

## 작동 원리

증명자는 비공개 증거를 이용해 증명을 만든다. 검증자는 공개된 명제와 증명으로 참인지 확인하며 비밀 증거를 직접 받지 않는다. [NIST · Zero-Knowledge Proof](https://csrc.nist.gov/glossary/term/zero_knowledge_proof)

## 실제 예시

생년월일 전체를 공개하지 않고 나이 조건을 만족한다는 명제를 입증하는 적용 예.

## 한계와 실패 조건

무엇을 증명하는지와 원천 정보의 신뢰가 별도 문제다. 공개 입력이나 사용 방식에서 정보가 드러날 수 있다.

## 혼동하기 쉬운 개념

암호화는 내용을 감추고, 영지식 증명은 내용을 드러내지 않은 검증을 다룬다.

## 관련 개념

- → 근거 제공: [[Knowledge/AI Systems/AI Governance#한 문장 정의|AI 거버넌스]] — 원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다. (해석; [근거](https://csrc.nist.gov/glossary/term/zero_knowledge_proof) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))

## 최근 변화

- 2026-09-02 — Google은 디지털 신원용 Longfellow ZKP 라이브러리를 Linux Foundation Europe 산하 Post-Quantum Cryptography Alliance에 이관한다고 발표했습니다. 구현의 관리 주체가 단일 공급자에서 공개 재단으로 이동하지만, 표준 채택과 양자 안전성은 별도 기술 검증이 필요합니다. [source](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)

## 출처

- [NIST · Zero-Knowledge Proof](https://csrc.nist.gov/glossary/term/zero_knowledge_proof)
- [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
