---
title: Enterprise AI Operating Model
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-07-11
updated: 2026-09-28
aliases:
  - 기업 AI 운영 모델
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
tags:
  - AI
  - EnterpriseAI
  - OperatingModel
last_reviewed: 2026-09-28
concept_id: enterprise
label: 기업 AI 운영 모델
group: 평가와 운영
keywords:
  - 업무 평가
  - 조직 권한
  - 사용량 관리
  - 변경 승인
verified_sources:
  - https://openai.com/index/introducing-admin-plugin/
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
relations:
  - target: evaluation
    type: uses
    reason: 기업의 에이전트 업무는 과제의 실행 결과를 평가해 운영 기준을 정할 수 있다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
map_review:
  decision: exclude
  reason: 기업의 업무·권한·평가 운영을 묶는 범주이며 독립적인 기술 작동 원리를 뜻하는 용어가 아니다.
  reviewed: 2026-09-28
---

# Enterprise AI Operating Model

## 한 문장 정의

기업 AI 운영 모델은 AI를 실제 업무에 쓰면서 과제의 성공 기준, 조직 권한, 사용량과 변경 승인을 함께 관리하는 업무 운영 구조다. [Anthropic · Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [OpenAI · Admin plugin](https://openai.com/index/introducing-admin-plugin/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 기업 AI 운영 모델 |
| 영어 | Enterprise AI Operating Model |
| 이 문서의 관점 | 업무 평가 · 조직 권한 · 사용량 관리 · 변경 승인 |

## 범위

**포함:** 에이전트 과제와 성공 기준, 역할별 접근 권한, 구성원·그룹 변경, 사용량 한도와 승인 흐름. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [OpenAI](https://openai.com/index/introducing-admin-plugin/)

**포함하지 않음:** 한 공급업체의 기능을 모든 기업의 표준 운영 방식으로 일반화하는 것. IT 지원 사례의 해결률을 별도 관리 도구의 효과로 간주하는 것. [OpenAI](https://openai.com/index/introducing-admin-plugin/)

## 왜 중요한가

에이전트를 업무에 넣을 때는 실행 결과가 성공 기준을 충족하는지와 누가 어떤 데이터·기능·모델에 접근하고 설정을 바꿀 수 있는지를 구분해 관리해야 한다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [OpenAI](https://openai.com/index/introducing-admin-plugin/)

## 핵심 구성 요소

- 업무 평가: 과제·시도·채점기·실행 기록을 구별해 성공 기준과 결과를 확인한다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- 권한 관리: 구성원과 그룹을 바꾸고 실제 적용 권한과 역할·그룹별 기능 접근을 확인한다. [OpenAI](https://openai.com/index/introducing-admin-plugin/)
- 사용량 관리: 구성원·그룹·작업공간의 사용량과 한도, 추가 사용 요청을 살펴본다. [OpenAI](https://openai.com/index/introducing-admin-plugin/)
- 변경 승인: 지원되는 관리 작업을 기존 역할·작업공간 정책·승인 절차 안에서 수행하고 결과를 확인한다. [OpenAI](https://openai.com/index/introducing-admin-plugin/)

## 작동 원리

먼저 업무 과제와 성공 기준을 정하고, 각 시도의 실행 기록과 최종 상태를 평가한다. 운영자는 조직 역할에 따라 조회·변경할 수 있는 범위를 정하고 사용량과 권한 변경을 승인한다. OpenAI가 발표한 Admin plugin은 이러한 관리 작업 일부를 ChatGPT Work와 Codex에서 처리하되 사용자에게 기존 권한 이상의 접근을 부여하지 않는 사례다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [OpenAI](https://openai.com/index/introducing-admin-plugin/)

## 실제 예시

OpenAI가 2026년 8월 25일 발표한 Admin plugin은 관리자에게 ChatGPT Work와 Codex 사용량 확인, 구성원·그룹 변경, 역할별 기능·모델 접근 설정, 사용량 요청 승인 기능을 제공한다고 설명한다. 요청은 지원되는 읽기·쓰기 작업에 매핑되고 기존 작업공간 정책과 승인 경계를 따른다. [원문](https://openai.com/index/introducing-admin-plugin/)

## 한계와 실패 조건

관리 도구가 제공하는 기능 목록은 사용 기업의 성과를 입증하지 않는다. 에이전트 평가는 과제별 입력·성공 기준·시도와 최종 결과를 정해야 비교할 수 있다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [OpenAI](https://openai.com/index/introducing-admin-plugin/)

## 혼동하기 쉬운 개념

에이전트 평가는 개별 과제의 실행과 결과를 판단하는 방법이다. 기업 AI 운영 모델은 평가 결과에 더해 구성원 권한·사용량·승인 절차를 함께 다루는 운영 범주다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [OpenAI](https://openai.com/index/introducing-admin-plugin/)

## 관련 개념

- [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 업무 과제의 성공 기준과 실행 결과를 구분해 검토한다. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 최근 변화

- 2026-08-25 — OpenAI는 ChatGPT Work와 Codex의 일부 관리 작업을 대화형으로 수행하는 Admin plugin을 발표했다. 사용량·구성원·권한 변경은 사용자의 기존 역할과 작업공간 승인 정책을 따르고, 관리자는 변경 결과를 확인할 수 있다고 설명했다. [[News/33eae878317d27dc|관련 기사]] · [원문](https://openai.com/index/introducing-admin-plugin/)

## 출처

- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI · Introducing Admin plugin](https://openai.com/index/introducing-admin-plugin/)
