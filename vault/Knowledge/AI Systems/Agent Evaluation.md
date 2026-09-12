---
title: Agent Evaluation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-07
aliases:
  - 에이전트 평가
parent_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
related_concepts:
  - "[[Knowledge/AI Systems/Agent Observability|Agent Observability]]"
  - "[[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]"
tags:
  - AI
  - Agent
  - Evaluation
---

# Agent Evaluation

## 한 문장 정의

Agent Evaluation은 에이전트가 주어진 과제를 얼마나 정확하고 안전하고 효율적으로 끝냈는지 결과와 실행 과정을 기준에 따라 측정하는 방법입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 에이전트 평가 |
| 영어 이름 | Agent Evaluation |
| 평가 단위 | 최종 결과, 단계, 도구 호출, 전체 업무 성공 |
| 대표 용도 | 회귀 검사, 모델·프롬프트·도구 비교, 배포 문턱 |

## 범위

**포함:** 과제·데이터셋 설계, 성공 기준, 결정적 검사, 모델 판정, 사람 검토, 안전·비용·지연 측정, 회귀 비교입니다.

**포함하지 않음:** 실행을 기록하고 원인을 추적할 수 있게 만드는 일은 [[Knowledge/AI Systems/Agent Observability|Agent Observability]], 평가 결과로 허용 정책을 정하는 일은 [[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]입니다.

## 왜 중요한가

에이전트는 같은 최종 답을 내더라도 잘못된 출처, 불필요한 도구 호출, 과도한 비용, 위험한 우회 경로를 사용할 수 있습니다. 최종 문장만 채점하면 실제 업무 성공과 안전을 놓치므로 결과와 과정의 중요한 조건을 함께 평가해야 합니다.

## 핵심 구성 요소

| 요소 | 역할 |
|---|---|
| 대표 과제 | 실제 사용을 닮은 입력과 환경 |
| 기대 결과·불변조건 | 반드시 맞아야 할 값과 절대 깨지면 안 되는 규칙 |
| 판정기 | 결정적 코드, 모델 판정, 사람 검토 |
| 과정 지표 | 도구 선택, 재시도, 출처, 단계 수, 권한 위반 |
| 운영 지표 | 지연, 토큰, 비용, 성공 업무당 총비용 |
| 고정 비교 | 동일 버전·데이터·환경에서 회귀 판단 |

## 작동 원리

1. 실제 업무에서 성공과 실패를 구체적으로 정의합니다.
2. 정상·경계·공격·중단 사례를 포함한 고정 과제를 만듭니다.
3. 모델, 프롬프트, 도구, 환경 버전을 기록하고 반복 실행합니다.
4. 결정적 검사로 사실·형식·안전 불변조건을 먼저 판정합니다.
5. 정성 판단이 필요한 부분만 모델 또는 사람에게 올립니다.
6. 기준선과 비교해 배포·보류·되돌림을 결정합니다.

## 실제 예시

- 브리핑 에이전트가 컷오프 이후 자료만 사용했는지, URL 수와 메타데이터가 일치하는지 검사합니다.
- 코딩 에이전트가 테스트를 통과했더라도 허용되지 않은 경로를 수정했으면 실패로 판정합니다.
- 예약 에이전트는 좌석 탐색 성공률과 함께 무단 결제·취소가 한 번도 없었는지 확인합니다.

## 한계와 실패 조건

- 평가 과제가 실제 업무 분포를 대표하지 못하면 점수가 높아도 운영에서 실패합니다.
- 모델 판정기만 쓰면 판정기의 편향과 불안정성이 결과에 섞입니다.
- 평균 점수는 드문 고위험 실패와 모든 모델이 함께 틀리는 꼬리 위험을 숨깁니다.
- 관측 데이터가 없으면 실패 원인을 모델·도구·데이터 중 어디로 돌릴지 알기 어렵습니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/Agent Observability|Agent Observability]] | 평가는 잘했는지를 판정하고, 관측성은 무엇을 했는지 재구성할 자료를 제공합니다. |
| 모델 벤치마크 | 모델 단일 능력을 비교하며 도구·환경·업무 완료까지 포함하지 않을 수 있습니다. |
| 모니터링 | 운영 상태를 계속 지켜보는 일이며 배포 전 고정 평가와 목적이 다릅니다. |

## 관련 개념

- 상위: [[Knowledge/AI Systems/AI Agents|AI Agents]], 소프트웨어 테스트
- 하위: 회귀 평가, 안전 평가, 과정 평가
- 함께 쓰임: [[Knowledge/AI Systems/Agent Observability|Agent Observability]], [[Knowledge/AI Systems/AI Agent Governance|AI Agent Governance]]
- 대비: 단일 모델 벤치마크

## 최근 변화

- 2026-09-06 — OpenAI 내부 연구 보고서는 성공한 장시간 과제에도 사람 개입이 흔하며 불확실한 판정은 성공률 분석에서 제외한다고 설명했습니다. 성공률과 개입량, 판정 가능한 표본의 범위를 함께 보고해야 한다는 평가 경계를 보여줍니다. [source](https://openai.com/index/research-acceleration-view-inside-openai/)
- 2026-09-02 — Google은 Gemini 3.8 Flash Cyber의 공개·내부 취약점 탐지, 외부 패치 벤치마크, Chrome·Wiz 내부 결과를 함께 제시했습니다. 서로 다른 과제의 점수를 한 일반 성능으로 합치지 않고 공개 재현 가능성, 비교 모델, 실제 배포 조건을 각각 확인해야 합니다. [source](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/)
- 2026-08-29 — Microsoft의 현장 프레임워크는 에이전트 출력 검증을 검사 주체·비용·실제로 입증하는 범위·행동 가능한 산출물로 층화했습니다. 빌드·린트 통과와 점검자의 전반적 인상을 실제 업무 정확성의 증거로 과대해석하지 말아야 한다는 경계가 명확해졌습니다. [source](https://devblogs.microsoft.com/all-things-azure/only-believe-what-you-can-validate/)
- 2026-08-27 — Google DeepMind와 외부 기관들은 기밀 벤치마크와 독점 모델을 GPU enclave에서 상호 비공개로 실행하는 이중맹검 평가 파일럿을 공개했습니다. 평가 무결성은 점수뿐 아니라 시험 데이터·가중치의 격리와 원격 증명까지 포함하는 방향으로 넓어졌습니다. [source](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)
- 2026-08-27 — 1,053명 무작위 실험에서 ChatGPT 접근은 표준 루브릭 점수를 높였지만 인과 추론 훈련은 아이디어 다양성과 반증·기제 설명을 높였습니다. 평가가 원하는 사고 품질을 별도 축으로 요구하지 않으면 매끄러운 결과와 독창성을 혼동할 수 있습니다. [source](https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf)
- 2026 — OpenAI Agents SDK는 모델 호출 없이 도구 실행·handoff·guardrail·재시도·세션 동작을 검사하는 결정적 테스트 유틸리티를 문서화했습니다.
- 2026-08-04 — Microsoft Orchard는 실제 배포 harness와 같은 환경에서 데이터 수집·훈련·평가를 이어가는 공개 프레임워크를 발표했습니다.

## 출처

- https://openai.github.io/openai-agents-python/testing/
- https://openai.github.io/openai-agents-python/multi_agent/
- https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
- https://github.com/microsoft/Orchard
- https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
- https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
- https://devblogs.microsoft.com/all-things-azure/only-believe-what-you-can-validate/
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/
- https://openai.com/index/research-acceleration-view-inside-openai/
