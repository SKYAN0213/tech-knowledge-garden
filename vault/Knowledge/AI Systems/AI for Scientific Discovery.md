---
title: AI for Scientific Discovery
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-26
updated: 2026-09-13
aliases:
  - 과학 발견 AI
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Science
  - Research
last_reviewed: 2026-09-13
concept_id: science
label: 과학 발견 AI
group: 과학과 물리 세계
keywords:
  - 가설
  - 예측
  - 도메인 지식
  - 실험
  - 재현
verified_sources:
  - https://www.nature.com/articles/s41586-021-03819-2
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
relations:
  - target: evaluation
    type: contrast
    reason: 과학적 결과의 검증과 에이전트 업무 성공의 평가는 대상·기준이 다르다.
    basis: inference
    evidence:
      - https://www.nature.com/articles/s41586-021-03819-2
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
---

# AI for Scientific Discovery

## 한 문장 정의

과학 문제의 예측·후보 생성·분석에 AI를 사용하고 분야별 검증으로 결과를 확인하는 연구 접근이다. [Jumper et al. · AlphaFold](https://www.nature.com/articles/s41586-021-03819-2)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 과학 발견 AI |
| 영어 | AI for Scientific Discovery |
| 키워드 | 가설 · 예측 · 도메인 지식 · 실험 · 재현 |

## 범위

**포함:** 데이터와 도메인 지식을 결합한 예측·설계·실험 지원.

**포함하지 않음:** 모델이 제안했다는 이유만으로 새로운 과학 사실을 확정하는 일.

## 왜 중요한가

실험과 분석의 후보 공간을 좁히고 사람이 확인할 예측을 제공한다. 예측의 유용성은 분야별 검증 조건 안에서 판단한다.

## 핵심 구성 요소

- 가설
- 예측
- 도메인 지식
- 실험
- 재현

## 작동 원리

문제와 관측 자료를 정하고 모델이 예측을 만든다. 알려진 평가 자료나 실험 결과와 비교해 예측의 정확도와 적용 범위를 확인한다. [Jumper et al. · AlphaFold](https://www.nature.com/articles/s41586-021-03819-2)

## 실제 예시

AlphaFold는 아미노산 서열과 관련 정보를 활용한 단백질 구조 예측을 CASP14에서 평가했다.

## 한계와 실패 조건

예측 구조가 모든 생물학적 기능이나 실험 조건을 설명하지는 않는다. 모델 결과와 독립 검증을 구분해야 한다.

## 혼동하기 쉬운 개념

후보 생성은 발견 과정의 일부다. 실험적으로 확인한 발견과 같은 완료 상태가 아니다.

## 관련 개념

- → 대비: [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 과학적 결과의 검증과 에이전트 업무 성공의 평가는 대상·기준이 다르다. (해석; [근거](https://www.nature.com/articles/s41586-021-03819-2) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))

## 최근 변화

- 2026-09-08 — OpenAI는 AI 증명안과 Lean 형식화 자료를 공개했습니다. 연구 산출물 공개와 독립 검증 완료를 구분하고 가정·연구 기여·데이터 경위를 함께 추적해야 한다는 신호입니다. [source](https://openai.com/index/navier-stokes-solution/)

- 2026-09-07 — Google은 Cathay Pacific과 AI 비행운 회피 시험 확대를 발표했습니다. 현장 실험에서도 효과가 위성 분석 추정인지 직접 측정인지 구분해야 하며, 노선별 결과를 다른 환경으로 일반화하려면 추가 검증이 필요합니다. [source](https://blog.google/innovation-and-ai/models-and-research/google-research/contrail-avoidance-ultra-long-haul-flights/)
- 2026-09-06 — OpenAI는 내부 연구 자동화 측정을 공개하면서 코드·실험 증가가 전체 연구 진전 속도를 그대로 뜻하지 않는다고 밝혔습니다. 연구 작업량과 검증된 발견을 분리해야 하며, 이는 내부 관찰 자료로 독립 재현은 아닙니다. [source](https://openai.com/index/research-acceleration-view-inside-openai/)
- 2026-08-27 — Google Research의 Planetary Prediction Engine은 지리공간 데이터 발견·특성 구성·모델 학습·평가를 연결하고 목표 누출과 과적합 검사를 파이프라인에 포함했습니다. 과학 AI의 자동화 범위가 후보 생성뿐 아니라 데이터 계보와 평가 설계까지 넓어졌지만 현장 검증은 별도입니다. [source](https://arxiv.org/abs/2608.26088)
- 2026-08-26 — Nature Computational Science에 게재된 CrysVCD는 결정 생성 전에 원자가 균형을 제약해, 미세조정 조건에서 준안정성 85%와 포논 안정성 68%를 보고했습니다. 과학 AI의 후보 생성은 사후 필터링뿐 아니라 도메인 규칙을 앞단에 넣는 방식으로 계산 낭비를 줄일 수 있지만 실제 합성 검증은 별도입니다. [source](https://www.nature.com/articles/s43588-026-01037-2)
- 2026 — 과학 AI는 문헌 요약을 넘어 국립 연구시설, 시뮬레이션, 실험 워크벤치를 연결하는 인프라로 확장되고 있습니다.

## 출처

- [Jumper et al. · AlphaFold](https://www.nature.com/articles/s41586-021-03819-2)
- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
