---
title: AI Agent Governance
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-13
aliases:
  - 에이전트 거버넌스
parent_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI 거버넌스]]"
related_concepts:
  - "[[Knowledge/AI Systems/AI Agent Security|에이전트 보안]]"
tags:
  - AI
  - Agent
  - Governance
last_reviewed: 2026-09-13
concept_id: agent-governance
label: 에이전트 거버넌스
group: 위험과 책임
keywords:
  - 위임
  - 승인
  - 중단
  - 책임
  - 인가
verified_sources:
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
  - https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
relations:
  - target: governance
    type: scope
    reason: 조직 AI 거버넌스를 자율 행동과 위임 권한에 적용하는 하위 범위다.
    basis: inference
    evidence:
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
      - https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
  - target: agent-security
    type: informs
    reason: 책임과 허용 범위를 신원·인가 통제의 운영 기준으로 연결한다.
    basis: inference
    evidence:
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
      - https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
---

# AI Agent Governance

## 한 문장 정의

에이전트가 맡을 목표·위임 범위·승인·중단·책임을 정하고 운영 중 검토하는 거버넌스의 적용 범위다. [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [NIST · Identity and Authority of Software Agents](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 에이전트 거버넌스 |
| 영어 | AI Agent Governance |
| 키워드 | 위임 · 승인 · 중단 · 책임 · 인가 |

## 범위

**포함:** 조직의 AI 위험 관리를 에이전트의 자율 행동과 권한 위임에 적용하는 정책.

**포함하지 않음:** 특정 신원 규격 하나만 도입하면 완성되는 통제.

## 왜 중요한가

행동을 위임할수록 목적과 권한이 일치하는지, 사람이 언제 개입할지 운영 기준이 필요해진다.

## 핵심 구성 요소

- 위임
- 승인
- 중단
- 책임
- 인가

## 작동 원리

업무 책임과 허용 행동을 정한 뒤 신원·권한 통제와 실행 기록으로 연결한다. 문제가 생기면 권한 회수와 사람 이관을 수행하도록 운영한다. [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [NIST · Identity and Authority of Software Agents](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)

## 실제 예시

문서 작성은 자동화하되 외부 전송은 지정 담당자가 승인하도록 정하는 운영 정책.

## 한계와 실패 조건

NIST의 에이전트 신원 문서는 개념·의견 수렴 문서다. 이를 의무 인증이나 완성된 표준으로 취급하면 안 된다.

## 혼동하기 쉬운 개념

에이전트 보안은 기술적 공격·권한 오용을 다루고, 거버넌스는 목적과 책임을 함께 정한다.

## 관련 개념

- → 속함: [[Knowledge/AI Systems/AI Governance#한 문장 정의|AI 거버넌스]] — 조직 AI 거버넌스를 자율 행동과 위임 권한에 적용하는 하위 범위다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents))
- → 근거 제공: [[Knowledge/AI Systems/AI Agent Security#한 문장 정의|에이전트 보안]] — 책임과 허용 범위를 신원·인가 통제의 운영 기준으로 연결한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents))

## 최근 변화

- 2026-09-01 — OpenAI의 Astra 배포 계획은 고급 사이버 역량을 제한 접근으로 분리하고, 감시가 작업을 멈추면 ChatGPT·Codex에서는 사용자 검토를 요구하되 API에서는 중단하도록 표면별 개입 책임을 달리 정했습니다. [source](https://openai.com/index/path-to-astra/)
- 2026-09-01 — Anthropic의 Enterprise Frontier Safeguards는 안전 탐지는 공급자가 운영하되 로그 보관·키·경고 검토는 고객이 통제하는 책임 분리를 제안했습니다. 규제 업무의 거버넌스가 정책 문서보다 데이터 custody와 실제 검토 권한으로 구체화되는 사례입니다. [source](https://www.anthropic.com/news/enterprise-frontier-safeguards)
- 2026-02-17 — NIST의 에이전트 표준화 구상은 신원·권한·상호운용을 기술 문제이자 운영 책임 문제로 함께 다루기 시작했습니다.
- 2026-01-12 — NIST CAISI의 보안 의견 수렴은 개발과 배포 단계 모두에서 에이전트 고유 위험을 측정·관리할 필요를 명시했습니다.

## 출처

- [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [NIST · Identity and Authority of Software Agents](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)
