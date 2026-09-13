---
title: AI-Assisted Security Engineering
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
created: 2026-06-23
updated: 2026-09-13
aliases:
  - AI 보조 보안 엔지니어링
  - AI 보조 보안 개발
parent_concepts: []
related_concepts:
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망
    보안]]"
tags:
  - AI
  - Security
  - SoftwareEngineering
last_reviewed: 2026-09-13
concept_id: ai-security-engineering
label: AI 보조 보안 개발
group: 위험과 책임
keywords:
  - CodeQL
  - Autofix
  - 수정 제안
  - 보안 검토
verified_sources:
  - https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features
  - https://slsa.dev/spec/v1.1/levels
  - https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
relations:
  - target: supply-chain
    type: uses
    reason: AI가 제안한 코드도 기존 빌드·배포 출처 검증을 거쳐 전달한다.
    basis: inference
    evidence:
      - https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features
      - https://slsa.dev/spec/v1.1/levels
  - target: agent-security
    type: contrast
    reason: AI로 보안 업무를 돕는 활동과 AI 실행 자체를 보호하는 통제는 대상이 다르다.
    basis: inference
    evidence:
      - https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features
      - https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
map_review:
  decision: exclude
  reason: 보안 업무에 AI를 활용한다는 넓은 활동 범주다. 정적 분석 등 구체적 기법을 설명하는 용어로 좁혀 검토한다.
  reviewed: 2026-09-13
---

# AI-Assisted Security Engineering

## 한 문장 정의

보안 탐지·분석·수정 제안에 AI를 사용하고 별도 검증으로 결과를 확인하는 개발 방식이다. [GitHub · Security and quality AI features](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 보조 보안 개발 |
| 영어 | AI-Assisted Security Engineering |
| 키워드 | CodeQL · Autofix · 수정 제안 · 보안 검토 |

## 범위

**포함:** 코드 경보 해석, 수정안 생성과 보안 검토 지원.

**포함하지 않음:** AI가 만든 수정안을 검증 없이 안전하다고 승인하는 일.

## 왜 중요한가

탐지된 보안 문제의 이해와 수정안 작성을 돕는다. 개발자는 제안을 출발점으로 삼아 동작과 보안을 확인할 수 있다.

## 핵심 구성 요소

- CodeQL
- Autofix
- 수정 제안
- 보안 검토

## 작동 원리

GitHub Copilot Autofix처럼 탐지된 경보와 코드 문맥에서 수정안을 생성하고 개발자가 결과를 검토한다. [GitHub · Security and quality AI features](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)

## 실제 예시

CodeQL 경보에 제안된 패치를 적용하기 전 동작 테스트와 보안 재검사를 수행하는 흐름.

## 한계와 실패 조건

탐지는 빠뜨리거나 잘못 판단할 수 있고 제안은 부정확할 수 있다. 책임 있는 검토와 검증이 남는다.

## 혼동하기 쉬운 개념

AI 자체를 공격으로부터 보호하는 에이전트 보안과, AI로 보안 업무를 돕는 활동은 대상이 다르다.

## 관련 개념

- → 활용: [[Knowledge/Software Engineering/Software Supply Chain Security#한 문장 정의|소프트웨어 공급망 보안]] — AI가 제안한 코드도 기존 빌드·배포 출처 검증을 거쳐 전달한다. (해석; [근거](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features) · [근거](https://slsa.dev/spec/v1.1/levels))
- → 대비: [[Knowledge/AI Systems/AI Agent Security#한 문장 정의|에이전트 보안]] — AI로 보안 업무를 돕는 활동과 AI 실행 자체를 보호하는 통제는 대상이 다르다. (해석; [근거](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents))

## 최근 변화

- 2026 — AI 보안 검사는 코딩 중 온디맨드 리뷰와 PR 자동 탐지로 개발 흐름 안에 들어오고 있습니다.

## 출처

- [GitHub · Security and quality AI features](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)
- [SLSA · Build levels v1.1](https://slsa.dev/spec/v1.1/levels)
- [NIST · Identity and Authority of Software Agents](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)
