---
title: Agent Evaluation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-13
aliases:
  - 에이전트 평가
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]"
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
  - "[[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]]"
  - "[[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]]"
tags:
  - AI
  - Agent
  - Evaluation
last_reviewed: 2026-09-13
concept_id: evaluation
label: 에이전트 평가
group: 평가와 운영
keywords:
  - 평가 과제
  - trial
  - grader
  - 성공 기준
  - outcome
verified_sources:
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://openai.github.io/openai-agents-python/tracing/
  - https://prometheus.io/docs/practices/histograms/
relations:
  - target: agents
    type: evaluates
    reason: 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - target: observability
    type: uses
    reason: 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
      - https://openai.github.io/openai-agents-python/tracing/
  - target: metrics
    type: uses
    reason: 동일한 과제·시도 조건의 평가 결과를 집계한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
      - https://prometheus.io/docs/practices/histograms/
---

# Agent Evaluation

## 한 문장 정의

정의된 과제와 성공 기준 아래 에이전트를 반복 실행하고 결과·과정·환경 상태를 채점하는 활동이다. [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 에이전트 평가 |
| 영어 | Agent Evaluation |
| 키워드 | 평가 과제 · trial · grader · 성공 기준 · outcome |

## 범위

**포함:** 과제, 시도, 채점기, 실행 기록, 실제 결과를 포함한 평가 설계.

**포함하지 않음:** 한 번의 데모나 모델의 완료 선언만으로 하는 성공 판정.

## 왜 중요한가

모델·프롬프트·도구를 바꾼 뒤 실제 업무가 나아졌는지 비교할 기준을 만든다. 실행 기록의 완료 문구와 환경의 실제 변화를 구분하게 해 준다.

## 핵심 구성 요소

- 평가 과제
- trial
- grader
- 성공 기준
- outcome

## 작동 원리

입력과 초기 환경을 정하고 여러 시도를 실행한다. 최종 응답뿐 아니라 바뀐 환경 상태를 채점하고 실패 유형을 비교한다. [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 실제 예시

예약 에이전트의 응답과 실제 예약 레코드 생성을 각각 확인하는 평가.

## 한계와 실패 조건

채점기가 잘못되면 올바른 행동을 실패로 판정할 수 있다. 테스트셋 성공률이 배포 환경의 성공률을 보장하지 않는다.

## 혼동하기 쉬운 개념

관측성은 무슨 일이 있었는지 기록하고, 평가는 그 일이 목표와 기준을 만족했는지 판단한다.

## 관련 개념

- → 평가: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- → 활용: [[Knowledge/AI Systems/Agent Observability#한 문장 정의|에이전트 관측성]] — 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://openai.github.io/openai-agents-python/tracing/))
- → 활용: [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 동일한 과제·시도 조건의 평가 결과를 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/))
- ← 활용: [[Knowledge/AI Systems/Enterprise AI Operating Model#한 문장 정의|기업 AI 운영 모델]] — 도입 범위를 정할 때 실제 업무 결과를 평가한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- ← 활용: [[Knowledge/AI Systems/Vision-Language-Action Models#한 문장 정의|시각·언어·행동 모델]] — 로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다. (해석; [근거](https://arxiv.org/abs/2307.15818) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- ← 대비: [[Knowledge/AI Systems/AI for Scientific Discovery#한 문장 정의|과학 발견 AI]] — 과학적 결과의 검증과 에이전트 업무 성공의 평가는 대상·기준이 다르다. (해석; [근거](https://www.nature.com/articles/s41586-021-03819-2) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))

## 최근 변화

- 2026-09-11 — GitHub 코드 리뷰가 셸 도구와 Lite 다중 에이전트 분석을 도입했습니다. 자동 종료된 지적과 실제 결함 해결은 별도 확인 대상입니다. [source](https://github.blog/changelog/2026-09-11-auto-resolution-and-analysis-updates-in-copilot-code-review/) [관련 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)

- 2026-09-06 — OpenAI 내부 연구 보고서는 성공한 장시간 과제에도 사람 개입이 흔하며 불확실한 판정은 성공률 분석에서 제외한다고 설명했습니다. 성공률과 개입량, 판정 가능한 표본의 범위를 함께 보고해야 한다는 평가 경계를 보여줍니다. [source](https://openai.com/index/research-acceleration-view-inside-openai/)
- 2026-09-02 — Google은 Gemini 3.8 Flash Cyber의 공개·내부 취약점 탐지, 외부 패치 벤치마크, Chrome·Wiz 내부 결과를 함께 제시했습니다. 서로 다른 과제의 점수를 한 일반 성능으로 합치지 않고 공개 재현 가능성, 비교 모델, 실제 배포 조건을 각각 확인해야 합니다. [source](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/)
- 2026-08-29 — Microsoft의 현장 프레임워크는 에이전트 출력 검증을 검사 주체·비용·실제로 입증하는 범위·행동 가능한 산출물로 층화했습니다. 빌드·린트 통과와 점검자의 전반적 인상을 실제 업무 정확성의 증거로 과대해석하지 말아야 한다는 경계가 명확해졌습니다. [source](https://devblogs.microsoft.com/all-things-azure/only-believe-what-you-can-validate/)
- 2026-08-27 — Google DeepMind와 외부 기관들은 기밀 벤치마크와 독점 모델을 GPU enclave에서 상호 비공개로 실행하는 이중맹검 평가 파일럿을 공개했습니다. 평가 무결성은 점수뿐 아니라 시험 데이터·가중치의 격리와 원격 증명까지 포함하는 방향으로 넓어졌습니다. [source](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)
- 2026-08-27 — 1,053명 무작위 실험에서 ChatGPT 접근은 표준 루브릭 점수를 높였지만 인과 추론 훈련은 아이디어 다양성과 반증·기제 설명을 높였습니다. 평가가 원하는 사고 품질을 별도 축으로 요구하지 않으면 매끄러운 결과와 독창성을 혼동할 수 있습니다. [source](https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf)
- 2026 — OpenAI Agents SDK는 모델 호출 없이 도구 실행·handoff·guardrail·재시도·세션 동작을 검사하는 결정적 테스트 유틸리티를 문서화했습니다.
- 2026-08-04 — Microsoft Orchard는 실제 배포 harness와 같은 환경에서 데이터 수집·훈련·평가를 이어가는 공개 프레임워크를 발표했습니다.

## 출처

- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI Agents SDK · Tracing](https://openai.github.io/openai-agents-python/tracing/)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
