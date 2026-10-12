---
title: Row-Level Security
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 데이터 접근 제어
concept_id: row-level-security
label: 행 단위 보안
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - Row Level Security
  - RLS
  - 행 단위 보안
keywords:
  - CTE
  - 행 필터
  - 테넌트 격리
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agent Security|에이전트 보안]]"
tags:
  - AI
  - Security
verified_sources:
  - https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/
connections:
  - target: agent-security
    reason: PAR의 분석 에이전트는 검증된 사용자 권한으로 조회 행을 먼저 제한해 모델의 데이터 접근 경계를 강제한다.
    evidence:
      - https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/
map_review:
  decision: include
  kind: security
  reason: 같은 테이블을 조회해도 사용자별로 허용되는 행이 다른 접근 제어 원리를 이해해야 자연어 SQL 에이전트의 데이터 경계를 설명할 수 있다.
  reviewed: 2026-10-09
---

# Row-Level Security

## 한 문장 정의

행 단위 보안은 같은 데이터 테이블에서도 사용자의 권한에 따라 조회 가능한 행을 제한하는 접근 제어다. [PAR의 구현 설명](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 행 단위 보안 |
| 영어 | Row-Level Security |
| 약어 | RLS |

## 범위

**포함:** 사용자·사업체·테넌트별 조회 행의 제한. PAR 사례에서는 같은 사업체 안에서도 관리하는 매장에 따라 결과 범위를 다르게 설정한다.

**포함하지 않음:** 호출자와 요청 값의 서명 확인, 질문이 지원되는 지표인지 판단하는 절차. PAR는 이를 행 필터와 별도 단계로 구분한다. [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 왜 중요한가

같은 매출 질문이라도 가맹점 운영자와 전체 브랜드 관리자가 볼 수 있는 데이터는 다르다. PAR는 모델이 프롬프트의 사업체 필터를 누락할 가능성에 의존하지 않도록 서버에서 조회 범위를 정했다. [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 핵심 구성 요소

- 인증된 사용자 문맥: Tenant ID·Business ID·Admin ID를 요청 서명과 함께 확인한다.
- 행 필터: 확인된 권한으로 서버가 공통 테이블 식(CTE)을 생성한다.
- 제한된 스키마: 모델에 원본 테이블 대신 사전 필터링된 CTE의 열과 자료형을 전달한다.

[구현 근거](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 작동 원리

PAR의 Split-Plane SQL 구조는 보안 부분과 분석 부분을 나눈다. 서버가 사용자 권한으로 CTE를 생성한 뒤 Bedrock 모델이 해당 스키마에 대한 분석 SQL을 작성한다. 최종 쿼리는 서버의 CTE와 모델의 SQL을 합쳐 Databricks에서 실행한다. 행 필터를 결정하는 단계에는 사용자 질문이나 모델 출력을 사용하지 않는다. [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 실제 예시

브랜드 관리자는 해당 사업체의 매장 전체를, 가맹점 운영자는 자신이 운영하는 매장만 조회하도록 서로 다른 CTE를 생성한다. 모델은 각 요청에 허용된 데이터 범위의 스키마를 받는다. [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 한계와 실패 조건

PAR는 이 설계가 자사의 다중 고객 환경을 위해 만들어졌으며 다른 조직에서는 규제·운영 요구에 맞춘 보안 평가와 침투 테스트가 필요하다고 설명했다. [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 혼동하기 쉬운 개념

요청 서명은 호출자와 전달 값의 무결성을 확인하고, 질문 검토는 지원되는 지표인지 판단한다. 행 단위 보안은 그 뒤에 실제 조회할 수 있는 행을 제한한다. PAR의 구현은 세 단계를 각각 독립된 경계로 둔다. [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 관련 개념

- [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] — 생성 모델의 지시에 맡기지 않고 데이터 조회 범위를 서버에서 제한하는 통제다. [근거](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 최근 변화

- 2026-06-30 — PAR가 SigV4 요청 서명·질문 검토·서버 생성 CTE를 결합한 자연어 분석 에이전트 구조를 공개했다. [[News/ed903f9a68cea8a4|기사]] · [원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

## 출처

- [PAR Technology · AWS 공식 블로그](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)
