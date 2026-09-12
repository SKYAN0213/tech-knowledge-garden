---
title: Aggregate Metrics
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Data Systems
created: 2026-09-05
updated: 2026-09-13
aliases:
  - 집계 지표
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Agent Observability|Agent Observability]]"
  - "[[Knowledge/AI Systems/Enterprise AI Operating Model|Enterprise AI Operating Model]]"
tags:
  - Data
  - Metrics
---

# Aggregate Metrics

## 한 문장 정의

집계 지표는 여러 관측 기록을 명시된 대상·기간·계산 규칙으로 묶어 개수나 합계 같은 요약값으로 표현한 측정치입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 집계 지표 |
| 영어 이름 | Aggregate Metrics |
| 약어 | 없음 |
| 상위 개념 | 데이터 측정 |

## 범위

**포함:** 집계 대상, 시간 구간, 계산 규칙, 단위, 결측 처리와 비교 조건입니다.

**포함하지 않음:** 개별 기록의 추적, 원인 추론, 개인 식별 불가능성의 수학적 보장, 지표가 대표하는 대상의 품질 판정 자체입니다.

## 왜 중요한가

기록 전체를 공개하지 않고도 규모와 변화를 비교할 수 있습니다. 다만 무엇을 세었는지 다르면 비슷한 숫자도 다른 의미가 됩니다.

## 핵심 구성 요소

- 관측 대상과 포함·제외 조건
- 시간 구간과 시간대
- 합계·개수 등 계산 규칙과 단위
- 결측과 실제 0의 구별
- 조회 시점과 정의 버전

## 작동 원리

관측을 같은 기준으로 묶고 요약값을 계산합니다. 비교할 때는 두 구간의 대상·시간 경계·집계 규칙이 같은지 먼저 확인합니다. 생성된 사건 수와 현재 남아 있는 대상 수는 구별합니다.

## 실제 예시

- 서비스 요청을 일별로 세어 처리량 변화를 봅니다.
- 성공 업무 수와 전체 시도 수를 같은 기간으로 집계해 성공률을 계산합니다.

## 한계와 실패 조건

집계는 개별 실패의 원인과 분포를 숨길 수 있습니다. 시간 경계나 대상이 바뀌면 가짜 증감이 생깁니다. 개인 식별자를 빼는 것만으로 모든 재식별 가능성이 사라진다고 단정해서는 안 됩니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| 개별 이벤트 로그 | 로그는 사건별 기록이고 집계는 여러 사건의 요약입니다. |
| 현재 잔존 개수 | 특정 시점에 남은 수이며 기간 중 새로 생성된 수와 다릅니다. |
| 품질 평가 | 집계는 측정 형식이며 품질 판단에는 별도의 성공 기준이 필요합니다. |

## 관련 개념

- 상위: 데이터 측정
- 하위: 기간별 개수·합계 지표
- 함께 쓰임: [[Knowledge/AI Systems/Agent Observability|Agent Observability]]의 실행량·오류 요약
- 함께 쓰임: [[Knowledge/AI Systems/Enterprise AI Operating Model|Enterprise AI Operating Model]]의 업무 성과 측정
- 대비: 개별 실행 trace와 사건 로그

## 최근 변화

- 2026-09-11 — GitHub는 VS Code Agents 전용 창 지표를 다른 Agent Mode와 분리하고 결측은 생략 또는 null로 유지한다고 명시했습니다. 집계 대상과 결측 규칙을 보존해야 비교가 성립합니다. [source](https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/) [관련 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)

- 2026-09-04 — GitHub가 개인 stargazer 신원 없이 별 이력을 제공하는 API를 발표했습니다. 개별 신원 공개와 시간별 관심도 관찰을 분리한 구현 사례입니다. [source](https://github.blog/changelog/2026-09-04-new-api-endpoint-provides-privacy-safe-star-history-data/)

## 출처

- https://github.blog/changelog/2026-09-04-new-api-endpoint-provides-privacy-safe-star-history-data/
- https://docs.github.com/en/rest/activity/starring?apiVersion=2026-03-10

- https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/
