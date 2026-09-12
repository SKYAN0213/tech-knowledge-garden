---
title: AI Agent Governance
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-02
aliases:
  - 에이전트 거버넌스
parent_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI Governance]]"
related_concepts:
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]"
  - "[[Knowledge/AI Systems/Agent Observability|Agent Observability]]"
tags:
  - AI
  - Agent
  - Governance
---

# AI Agent Governance

## 한 문장 정의

AI Agent Governance는 에이전트가 어떤 목적과 권한으로 행동하며 누가 승인·감독·책임지는지를 생애주기 전체에서 정하고 증거로 남기는 운영 체계입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | AI 에이전트 거버넌스 |
| 영어 이름 | AI Agent Governance |
| 핵심 질문 | 무엇을 맡기고, 어디서 사람이 개입하며, 누가 책임지는가 |
| 상위 개념 | [[Knowledge/AI Systems/AI Governance|AI Governance]] |

## 범위

**포함:** 목적·책임자·사용 범위, 권한 정책, 승인 지점, 품질 문턱, 변경 승인, 사고 대응, 감사 증거와 폐기 기준입니다.

**포함하지 않음:** 취약점·프롬프트 주입·자격증명 보호의 기술 구현은 [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]], 개별 결과의 측정법은 [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]입니다.

## 왜 중요한가

같은 에이전트라도 읽기 전용 조사와 외부 전송·결제 업무의 위험은 다릅니다. 모델의 능력만 보고 도입하면 누가 어떤 실패를 받아들였는지, 새 도구나 모델을 누가 승인했는지, 사고 뒤 무엇을 중단해야 하는지 알기 어렵습니다.

## 핵심 구성 요소

| 요소 | 질문 |
|---|---|
| 목적과 소유권 | 이 에이전트가 해결할 일과 책임자는 누구인가 |
| 권한 정책 | 읽기·쓰기·외부 전송·결제 중 무엇을 허용하는가 |
| 사람 개입 | 어떤 조건에서 승인·검토·이관하는가 |
| 품질 문턱 | 어떤 평가를 통과해야 배포·변경할 수 있는가 |
| 변경 관리 | 모델·도구·프롬프트 변경을 누가 승인하는가 |
| 증거와 보존 | 실행·승인·오류 기록을 얼마나 보관하는가 |

## 작동 원리

1. 목적, 사용자, 데이터, 도구, 영향 범위를 등록합니다.
2. 위험 등급에 맞춰 행동별 허용·차단·승인 규칙을 정합니다.
3. 배포 전 [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]으로 품질 문턱을 확인합니다.
4. 운영 중 [[Knowledge/AI Systems/Agent Observability|Agent Observability]]로 실제 행동과 이관을 추적합니다.
5. 사고와 피드백을 검토해 정책을 바꾸되 승인 없는 자동 승격은 막습니다.

## 실제 예시

- 브리핑 에이전트는 `Tech Knowledge` 안에서만 쓰고, 파일 삭제·메일 발송·계정 변경은 금지합니다.
- 예약 에이전트는 좌석 확보까지 허용하되 결제와 취소는 사람만 할 수 있게 합니다.
- 새 모델을 도입할 때 정확도뿐 아니라 비용, 데이터 보존, 실패 회귀 검사를 승인 자료로 남깁니다.

## 한계와 실패 조건

- 정책이 문서에만 있고 실제 도구 권한에서 강제되지 않으면 효과가 없습니다.
- 모든 행동에 승인을 요구하면 자동화 가치가 사라지고 승인 피로가 생깁니다.
- 평균 성공률만 보면 드물지만 큰 피해를 내는 실패를 놓칠 수 있습니다.
- 책임자가 불분명하면 사고 때 중단·복구 결정이 늦어집니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]] | 거버넌스는 책임·정책·승인 운영이고, 보안은 공격과 권한 오용을 줄이는 기술 통제입니다. |
| [[Knowledge/AI Systems/AI Governance|AI Governance]] | AI 거버넌스는 조직 전체 AI를 다루고, 에이전트 거버넌스는 도구를 사용해 행동하는 시스템에 초점을 둡니다. |
| [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]] | 평가는 품질을 측정하는 수단이며, 거버넌스는 그 결과로 무엇을 허용할지 결정합니다. |

## 관련 개념

- 상위: [[Knowledge/AI Systems/AI Governance|AI Governance]]
- 하위: 행동 승인 정책, 에이전트 인벤토리, 변경 관리
- 함께 쓰임: [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]], [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]], [[Knowledge/AI Systems/Agent Observability|Agent Observability]]
- 대비: 단순 모델 사용 정책

## 최근 변화

- 2026-09-01 — OpenAI의 Astra 배포 계획은 고급 사이버 역량을 제한 접근으로 분리하고, 감시가 작업을 멈추면 ChatGPT·Codex에서는 사용자 검토를 요구하되 API에서는 중단하도록 표면별 개입 책임을 달리 정했습니다. [source](https://openai.com/index/path-to-astra/)
- 2026-09-01 — Anthropic의 Enterprise Frontier Safeguards는 안전 탐지는 공급자가 운영하되 로그 보관·키·경고 검토는 고객이 통제하는 책임 분리를 제안했습니다. 규제 업무의 거버넌스가 정책 문서보다 데이터 custody와 실제 검토 권한으로 구체화되는 사례입니다. [source](https://www.anthropic.com/news/enterprise-frontier-safeguards)
- 2026-02-17 — NIST의 에이전트 표준화 구상은 신원·권한·상호운용을 기술 문제이자 운영 책임 문제로 함께 다루기 시작했습니다.
- 2026-01-12 — NIST CAISI의 보안 의견 수렴은 개발과 배포 단계 모두에서 에이전트 고유 위험을 측정·관리할 필요를 명시했습니다.

## 출처

- https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook
- https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- https://www.nist.gov/news-events/news/2026/01/caisi-issues-request-information-about-securing-ai-agent-systems
- https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure
- https://openai.com/index/path-to-astra/
- https://www.anthropic.com/news/enterprise-frontier-safeguards
