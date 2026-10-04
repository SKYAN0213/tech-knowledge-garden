---
title: AI for Scientific Discovery
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-26
updated: 2026-09-28
aliases:
  - 과학 발견 AI
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Science
  - Research
last_reviewed: 2026-09-28
concept_id: science
label: 과학 발견 AI
group: 과학과 물리 세계
keywords:
  - 단백질 구조 예측
  - 블라인드 평가
  - 지리공간 예측
  - 결정 물질 생성
verified_sources:
  - https://www.nature.com/articles/s41586-021-03819-2
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://arxiv.org/html/2608.26088v1
  - https://arxiv.org/abs/2608.26088v1
  - https://www.nature.com/articles/s43588-026-01037-2
relations:
  - target: evaluation
    type: contrast
    reason: 과학 모델의 예측 구조 정확도와 도구를 사용하는 에이전트의 업무 수행은 서로 다른 평가 대상을 다룬다.
    basis: inference
    evidence:
      - https://www.nature.com/articles/s41586-021-03819-2
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
map_review:
  decision: exclude
  reason: 과학 연구 활용이라는 넓은 응용 분야다. 개별 예측·탐색 기법을 설명하는 학습 용어를 우선한다.
  reviewed: 2026-09-28
---

# AI for Scientific Discovery

## 한 문장 정의

과학 연구에 AI 예측·생성 모델을 적용하고, 과제별 조건과 기준으로 결과를 평가하는 연구 접근이다. [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) · [PPE](https://arxiv.org/html/2608.26088v1) · [CrysVCD](https://www.nature.com/articles/s43588-026-01037-2)

## 용어 카드

| 항목 | 내용 |
| --- | --- |
| 한국어 | 과학 발견 AI |
| 영어 | AI for Scientific Discovery |
| 예시 | 단백질 구조 예측 · 지리공간 예측 · 결정 물질 후보 생성 |

## 범위

**포함:** 단백질 구조·지역 지표 예측, 결정 물질 후보 생성과 과제별 안정성·성능 평가. [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) · [PPE](https://arxiv.org/html/2608.26088v1) · [CrysVCD](https://www.nature.com/articles/s43588-026-01037-2)

**포함하지 않음:** 여러 턴의 도구 사용과 환경 상태 변경 자체를 평가하는 에이전트 업무 평가. [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 왜 중요한가

단백질 구조 예측은 아미노산 서열에서 삼차원 구조를 계산하는 과제다. AlphaFold 연구팀은 물리·생물학 지식과 다중서열정렬을 신경망 설계에 이용했다. [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2)

## 핵심 구성 요소

- 예측할 대상과 입력 자료.
- 모델에 반영할 분야별 정보.
- 예측·생성 결과를 비교할 기준 자료와 평가 조건.

[AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) · [PPE](https://arxiv.org/html/2608.26088v1) · [CrysVCD](https://www.nature.com/articles/s43588-026-01037-2)

## 작동 원리

연구 과제에 필요한 자료를 준비하고 모델이 예측값이나 후보 구조를 만든다. AlphaFold는 단백질 서열과 관련 정보를 이용해 구조를 예측했으며, PPE는 통계 자료와 지리공간 임베딩을 구성해 모델을 학습하고 예측했다. 두 연구의 평가 대상은 각각 단백질 구조와 지역별 지표다. CrysVCD는 원자가 균형을 맞춘 조성을 먼저 생성하고 확산 모델로 결정 구조를 만든다. [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) · [PPE](https://arxiv.org/html/2608.26088v1) · [CrysVCD](https://www.nature.com/articles/s43588-026-01037-2)

## 실제 예시

AlphaFold는 공개되지 않은 실험 구조를 사용하는 CASP14 블라인드 평가에 참여했다. PPE는 자연어 질문에서 자료 선택·구성·모델 학습과 예측을 연결하며, 준비된 학습·시험 자료에서 예측 모델 계열을 비교한다. [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) · [PPE](https://arxiv.org/html/2608.26088v1)

CrysVCD 논문 초록은 안정성 지표로 미세조정한 생성 결과의 준안정성 비율을 85%로 제시한다. 기준은 Ehull이 원자당 0.1eV 미만인 경우다. 별도로 포논 안정성 비율 68%를 보고했다. [논문](https://www.nature.com/articles/s43588-026-01037-2)

## 한계와 실패 조건

AlphaFold의 학습 목표는 일반적으로 PDB 구조에 나타날 가능성이 가장 높은 단백질 구조를 생성하는 것이다. [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2)

## 혼동하기 쉬운 개념

언어모델의 도구 실행과 예측 모델의 학습은 역할이 다르다. PPE는 언어모델을 조정자로 사용하지만, 예측 단계에서는 준비된 자료에 선형모델·부스팅·다층 퍼셉트론 계열을 적용한다. [PPE](https://arxiv.org/html/2608.26088v1)

## 관련 개념

- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] — 여러 턴에서 도구를 사용하고 환경 상태를 바꾸는 시스템의 평가와, 과학 예측 모델의 정확도 평가는 대상이 다르다. (해석; [AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) · [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))

## 최근 변화

- 2026-08-26 — CrysVCD 논문이 Nature Computational Science에 출판됐다. 연구팀은 화학 규칙을 생성 과정에 포함하는 방법과 별도 안정성 지표를 보고했다. [[News/8bc2cce05a4ccf4a|기사]] · [논문](https://www.nature.com/articles/s43588-026-01037-2)
- 2026-08-26 — PPE 최초 논문 판본 공개. 자연어 질문 기반 자료 선택·다중모달 자료 구성·모델 학습과 예측을 연결한 방법을 소개했다. [[News/068cf5b2747d434f|기사]] · [논문 v1](https://arxiv.org/html/2608.26088v1) · [최초 공개일](https://arxiv.org/abs/2608.26088v1)

## 출처

- [Jumper et al. · AlphaFold](https://www.nature.com/articles/s41586-021-03819-2)
- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Planetary Prediction Engine · v1 전문](https://arxiv.org/html/2608.26088v1)
- [Planetary Prediction Engine · v1 제출 기록](https://arxiv.org/abs/2608.26088v1)
- [CrysVCD · Nature Computational Science](https://www.nature.com/articles/s43588-026-01037-2)
