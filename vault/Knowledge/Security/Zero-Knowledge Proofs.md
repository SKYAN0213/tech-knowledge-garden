---
title: Zero-Knowledge Proofs
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Security
created: 2026-09-03
updated: 2026-09-03
aliases:
  - 영지식 증명
  - ZKP
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI Governance]]"
tags:
  - Security
  - Privacy
  - Cryptography
---

# Zero-Knowledge Proofs

## 한 문장 정의

Zero-Knowledge Proofs는 증명자가 비밀 자체를 공개하지 않고도 특정 명제가 참이거나 그 비밀을 알고 있음을 검증자에게 입증하는 암호학적 방법입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 영지식 증명 |
| 영어 이름 | Zero-Knowledge Proofs |
| 약어 | ZKP |
| 핵심 참여자 | 증명자, 검증자 |

## 범위

**포함:** 명제와 비밀 증거의 정의, 증명 생성, 공개 입력을 이용한 검증, 완전성·건전성·영지식성, 선택적 속성 공개입니다.

**포함하지 않음:** 원본 자격증명의 발급자 신뢰, 기기 인증, 철회 확인, 계정 추적 방지 전체를 자동으로 보장하는 것은 아닙니다.

## 왜 중요한가

서비스가 나이·회원 자격·권한 같은 조건만 확인하면 될 때 전체 신원 정보나 원본 비밀을 복사하지 않아도 됩니다. 검증에 필요한 정보 노출을 줄여 데이터 유출 범위와 불필요한 수집을 낮출 수 있습니다.

## 핵심 구성 요소

| 요소 | 역할 |
|---|---|
| 명제 | 검증하려는 조건 |
| 증거 또는 witness | 명제를 참으로 만드는 비공개 정보 |
| 증명 시스템 | 증거를 드러내지 않는 증명값 생성 규칙 |
| 검증기 | 공개 입력과 증명값으로 명제의 유효성을 판정 |
| 매개변수·회로 | 허용할 명제와 암호 연산을 고정 |

## 작동 원리

1. 확인할 조건과 공개해도 되는 입력을 명제로 표현합니다.
2. 증명자는 비밀 증거를 이용해 영지식 증명값을 만듭니다.
3. 검증자는 비밀을 받지 않고 공개 입력과 증명값만 검사합니다.
4. 시스템은 올바른 증거는 통과시키고 거짓 증거는 통과하기 어렵게 하면서, 증명값에서 추가 비밀을 알아내지 못하도록 설계합니다.

## 실제 예시

- 디지털 신분증의 생년월일 전체를 보내지 않고 만 18세 이상이라는 속성만 증명합니다.
- 비밀키를 공개하지 않고 해당 공개키에 대응하는 비밀키를 알고 있음을 증명합니다.
- 거래 세부값을 모두 공개하지 않고 정해진 규칙을 만족한다는 사실만 검증합니다.

## 한계와 실패 조건

- 회로·구현·매개변수에 결함이 있으면 이론적 보장과 실제 보안이 달라집니다.
- 증명 생성 비용, 증명 크기, 검증 지연이 사용 환경에 맞지 않을 수 있습니다.
- 발급, 기기 인증, 철회 확인, 네트워크 식별자가 남으면 전체 시스템은 여전히 사용자를 추적할 수 있습니다.
- 특정 시스템이 양자 공격에 안전한지는 사용한 암호 가정과 구현을 별도로 검토해야 합니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| 암호화 | 암호화는 데이터를 키로 숨겼다가 복호화하며, ZKP는 비밀을 전달하지 않고 명제의 참을 증명합니다. |
| 선택적 공개 자격증명 | 공개할 속성을 줄이는 자격증명 방식이며, 구현에 ZKP를 쓸 수 있지만 둘은 같은 개념이 아닙니다. |
| 익명성 | ZKP는 증명 내용의 노출을 줄이지만 네트워크·계정·기기 식별까지 자동으로 익명화하지 않습니다. |

## 관련 개념

- 상위: 개인정보 보호 강화 암호
- 하위: 영지식 지식 증명, 비대화형 영지식 증명
- 함께 쓰임: 디지털 자격증명, 선택적 공개, [[Knowledge/AI Systems/AI Governance|AI Governance]]
- 대비: 일반 암호화

## 최근 변화

- 2026-09-02 — Google은 디지털 신원용 Longfellow ZKP 라이브러리를 Linux Foundation Europe 산하 Post-Quantum Cryptography Alliance에 이관한다고 발표했습니다. 구현의 관리 주체가 단일 공급자에서 공개 재단으로 이동하지만, 표준 채택과 양자 안전성은 별도 기술 검증이 필요합니다. [source](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)

## 출처

- https://csrc.nist.gov/glossary/term/zero_knowledge_proof
- https://csrc.nist.gov/projects/pec/zkproof
- https://github.com/google/longfellow-zk
- https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/
