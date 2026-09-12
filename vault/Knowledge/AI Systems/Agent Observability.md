---
title: Agent Observability
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-07
aliases:
  - 에이전트 관측성
parent_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
related_concepts:
  - "[[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]"
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
tags:
  - AI
  - Agent
  - Observability
---

# Agent Observability

## 한 문장 정의

Agent Observability는 에이전트 실행의 입력, 모델 호출, 도구 사용, handoff, 승인, 오류, 비용, 상태 변화를 trace·log·metric으로 남겨 무슨 일이 왜 일어났는지 재구성할 수 있게 하는 능력입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 에이전트 관측성 |
| 영어 이름 | Agent Observability |
| 핵심 산출물 | trace, span, log, metric, event |
| 주요 목적 | 디버깅, 감사, 비용 추적, 실패 원인 분석 |

## 범위

**포함:** 실행 식별자, 모델·프롬프트·도구 버전, 단계와 시간, 도구 입출력, 승인·재시도·handoff, 오류 전파, 비용·지연, 민감정보 캡처 정책입니다.

**포함하지 않음:** 기록을 기준으로 잘했는지 판정하는 일은 [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]], 어떤 행동을 허용할지 정하는 일은 [[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]입니다.

## 왜 중요한가

에이전트는 여러 모델과 도구를 오가므로 최종 오류만으로 원인을 알기 어렵습니다. 실행 흐름을 연결해 기록해야 잘못된 검색, 도구 선택, 재시도 폭증, 승인 누락, 상태 불일치 같은 원인을 찾고 같은 조건을 재현할 수 있습니다.

## 핵심 구성 요소

| 요소 | 설명 |
|---|---|
| Trace | 한 업무 실행 전체를 묶는 기록 |
| Span | 모델 호출·도구 호출·handoff 같은 한 작업 구간 |
| 구조화 로그 | 오류, 상태 변화, 승인, 재시도 사건 |
| Metric | 성공률, 지연, 토큰, 비용, 이관 비율 |
| Correlation ID | 여러 서비스와 하위 에이전트 기록을 연결하는 식별자 |
| 캡처 정책 | 민감 입력·출력·오디오를 기록하거나 제외하는 규칙 |

## 작동 원리

1. 하나의 업무에 trace ID를 부여합니다.
2. 모델·도구·handoff·승인 단계를 부모-자식 span으로 연결합니다.
3. 버전, 시작·종료 시간, 결과 상태, 오류, 사용량을 구조화해 기록합니다.
4. 민감정보는 최소화·마스킹하고 접근·보존 정책을 적용합니다.
5. 평가나 사고 분석에서 trace를 재생·비교해 원인 단계를 찾습니다.

## 실제 예시

- 브리핑 실행에서 검색한 URL, 제외 이유, 작성 파일, 검증 결과를 같은 run ID로 묶습니다.
- 하위 에이전트가 실패했을 때 partial output과 API 오류가 상위 작업에 어떻게 전달됐는지 남깁니다.
- 도구 재시도 횟수와 비용 증가를 추적해 무한 루프를 탐지합니다.

## 한계와 실패 조건

- 모든 입력·출력을 기록하면 개인정보와 비밀정보가 유출될 수 있습니다.
- 로그가 많아도 trace ID와 버전 정보가 없으면 실행을 재구성하기 어렵습니다.
- 관측 시스템 장애나 샘플링 때문에 중요한 고위험 사건이 빠질 수 있습니다.
- 기록 자체는 품질 판정이 아니므로 명시적 평가 기준이 별도로 필요합니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]] | 관측성은 실행 증거를 제공하고, 평가는 그 증거와 결과를 기준에 따라 판정합니다. |
| 로깅 | 로그는 개별 사건 기록이고 관측성은 trace·metric·상태 관계로 원인을 추론할 수 있게 합니다. |
| 감사 | 감사는 책임과 준수 판단이며 관측 데이터는 그 증거 중 하나입니다. |

## 관련 개념

- 상위: [[Knowledge/AI Systems/AI Agents|AI Agents]], 소프트웨어 관측성
- 하위: 에이전트 tracing, 비용 관측, 실행 재생
- 함께 쓰임: [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]], [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]], [[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]
- 대비: 최종 출력만 저장하는 기록

## 최근 변화

- 2026-09-06 — OpenAI 수석과학자는 내부 평가상 추론 과정 감시에 대한 의존 가능성이 감소한다고 설명했습니다. 언어화된 추론 기록이 모든 행동을 설명한다는 보장은 없으며 실제 도구·환경 기록과의 교차 확인이 필요합니다. 감소 폭의 독립 검증은 이 글에서 확인되지 않습니다. [source](https://openai.com/index/an-alien-mind/)
- 2026 — OpenAI Agents SDK는 모델 생성, 도구 호출, handoff, guardrail, 사용자 정의 사건을 trace와 span으로 기록하고 민감 데이터 캡처를 끌 수 있는 설정을 제공합니다.

## 출처

- https://openai.github.io/openai-agents-python/tracing/
- https://openai.github.io/openai-agents-python/config/
- https://openai.github.io/openai-agents-python/running_agents/
- https://openai.github.io/openai-agents-python/quickstart/
- https://openai.com/index/an-alien-mind/
