---
title: Zero-Knowledge Proofs
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Security
created: 2026-09-03
updated: 2026-10-09
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
last_reviewed: 2026-10-09
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
  - https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/
relations:
  - target: governance
    type: informs
    reason: 원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다.
    basis: inference
    evidence:
      - https://csrc.nist.gov/glossary/term/zero_knowledge_proof
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
map_review:
  decision: include
  kind: security
  reason: 비밀을 공개하지 않고 명제의 참을 보이는 암호학적 증명 원리를 따로 익혀야 한다.
  reviewed: 2026-10-09
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

## 핵심 구성 요소

증명자는 명제의 참을 입증하고 검증자는 그 증명을 확인한다. NIST의 정의에서 검증자에게 추가로 제공하는 정보는 해당 명제가 참이라는 사실에 한정된다. [NIST](https://csrc.nist.gov/glossary/term/zero_knowledge_proof)

## 작동 원리

원본 개인정보 전체를 전달하는 대신 확인할 조건에 대한 증명을 전달한다. Google은 디지털 신원과 결합했을 때 다른 개인정보를 공유하지 않고 성인 여부를 증명하는 예를 설명한다. [Google](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)

## 실제 예시

웹사이트에 만 18세를 넘는다는 조건을 입증하는 경우다. 생년월일 등 다른 개인정보를 함께 공유하는 방식과 구분된다. [Google](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)

## 관련 개념

- → 근거 제공: [[Knowledge/AI Systems/AI Governance#한 문장 정의|AI 거버넌스]] — 원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다. (해석; [근거](https://csrc.nist.gov/glossary/term/zero_knowledge_proof) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))

## 최근 변화

- 2026-09-02 — Google은 Longfellow ZKP 라이브러리를 Linux Foundation Europe 산하 Post-Quantum Cryptography Alliance에 기증한다고 발표했다. [원문](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)

## 출처

- [NIST · Zero-Knowledge Proof](https://csrc.nist.gov/glossary/term/zero_knowledge_proof)
- [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [Google · Longfellow ZKP 기증](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)
