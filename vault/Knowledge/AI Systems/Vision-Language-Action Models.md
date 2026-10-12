---
title: Vision-Language-Action Models
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-26
updated: 2026-10-09
aliases:
  - VLA
  - 시각-언어-행동 모델
  - 시각·언어·행동 모델
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
tags:
  - AI
  - Robotics
  - VLA
last_reviewed: 2026-10-09
concept_id: vla
label: 시각·언어·행동 모델
group: 과학과 물리 세계
keywords:
  - VLA
  - 로봇 정책
  - 행동 토큰
  - 시각언어
  - 궤적
verified_sources:
  - https://arxiv.org/abs/2307.15818
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
relations:
  - target: evaluation
    type: uses
    reason: 로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다.
    basis: inference
    evidence:
      - https://arxiv.org/abs/2307.15818
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
map_review:
  decision: include
  kind: model
  reason: 영상·언어 입력이 로봇 행동 출력으로 이어지는 모델의 표현과 학습 방식을 이해해야 한다.
  reviewed: 2026-10-09
---

# Vision-Language-Action Models

## 한 문장 정의

시각·언어 사전학습을 로봇 제어에 연결해, 로봇 관측과 언어 지시에서 행동을 생성하도록 학습하는 모델 계열이다. [RT-2 초록](https://arxiv.org/abs/2307.15818)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 시각·언어·행동 모델 |
| 영어 | Vision-Language-Action Models |
| 별칭 | VLA |
| RT-2의 행동 표현 | 텍스트 토큰 |

## 범위

**포함:** 로봇 관측을 행동으로 연결하는 학습과 시각·언어 사전학습의 결합.

**포함하지 않음:** 영상에 대한 자연어 설명만 생성하는 모델. RT-2는 자연어 응답과 로봇 행동을 같은 토큰 형식으로 학습한다. [RT-2 초록](https://arxiv.org/abs/2307.15818)

## 핵심 구성 요소

RT-2는 로봇 궤적 데이터와 웹 시각언어 과제를 함께 사용한다. 로봇 행동을 텍스트 토큰으로 표현해 자연어 토큰과 같은 방식으로 학습 데이터에 넣는다. 시각·언어 모델의 사전학습과 로봇 행동 학습이 이 표현으로 연결된다. [RT-2 초록](https://arxiv.org/abs/2307.15818)

## 작동 원리

연구진은 기존 시각·언어 모델을 로봇 궤적과 시각 질의응답 등의 웹 과제에 공동 미세조정하는 방법을 제안했다. 이 모델은 사전학습된 시각·언어 지식을 활용하면서 로봇 관측을 행동으로 연결하도록 학습한다. [RT-2 초록](https://arxiv.org/abs/2307.15818)

## 실제 예시

RT-2 연구진은 특정 숫자나 아이콘 위에 물체를 놓는 지시, 가장 작거나 큰 물체를 고르는 지시를 평가 예로 설명했다. 이는 해당 연구가 다룬 로봇 과제의 예다. [RT-2 초록](https://arxiv.org/abs/2307.15818)

## 혼동하기 쉬운 개념

시각·언어 모델이 영상을 보고 문장을 생성하는 것과, 행동을 출력 목표에 포함해 로봇 제어를 학습하는 것은 구분된다. VLA는 후자의 행동 학습을 포함한다. [RT-2 초록](https://arxiv.org/abs/2307.15818)

## 관련 개념

- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] — 행동을 수행하는 시스템은 정한 과제와 성공 기준으로 실행 결과를 평가한다. [RT-2 초록](https://arxiv.org/abs/2307.15818) · [평가 구조](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 출처

- [Brohan et al. · RT-2 초록](https://arxiv.org/abs/2307.15818)
- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
