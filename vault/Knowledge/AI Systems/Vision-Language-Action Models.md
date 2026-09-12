---
title: Vision-Language-Action Models
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-26
updated: 2026-09-13
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
last_reviewed: 2026-09-13
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
---

# Vision-Language-Action Models

## 한 문장 정의

영상과 언어 지시를 입력으로 받아 로봇 행동을 출력하도록 학습한 모델 계열이다. [Brohan et al. · RT-2](https://arxiv.org/abs/2307.15818)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 시각·언어·행동 모델 |
| 영어 | Vision-Language-Action Models |
| 키워드 | VLA · 로봇 정책 · 행동 토큰 · 시각언어 · 궤적 |

## 범위

**포함:** 로봇 관측·언어 목표·행동 표현을 연결한 정책 학습.

**포함하지 않음:** 그림을 설명할 수 있다는 이유만으로 가능한 물리 제어.

## 왜 중요한가

시각·언어 사전학습의 지식을 로봇 행동 학습과 연결하는 접근이다. 말의 이해가 물리적 수행으로 전이되는 조건을 연구할 수 있다.

## 핵심 구성 요소

- VLA
- 로봇 정책
- 행동 토큰
- 시각언어
- 궤적

## 작동 원리

RT-2는 로봇 궤적과 웹 시각언어 과제를 공동 학습하고 행동을 텍스트 토큰으로 표현한다. 생성한 행동을 로봇 제어 입력으로 변환한다. [Brohan et al. · RT-2](https://arxiv.org/abs/2307.15818)

## 실제 예시

영상 속 물체를 보고 자연어 지시가 가리키는 대상을 집는 로봇 정책.

## 한계와 실패 조건

웹 지식 전이가 새로운 환경의 안전한 행동을 보장하지 않는다. 센서·기구·접촉 조건과 실제 로봇 평가가 필요하다.

## 혼동하기 쉬운 개념

VLM은 시각과 언어를 다루고 VLA는 행동 출력을 학습 목표에 포함한다.

## 관련 개념

- → 활용: [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다. (해석; [근거](https://arxiv.org/abs/2307.15818) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))

## 최근 변화

- 2026 — VLA 연구는 더 큰 시각·언어 모델뿐 아니라 행동 시간 구조를 학습하고 다른 로봇 형태로 옮기는 문제를 강조하고 있습니다.

## 출처

- [Brohan et al. · RT-2](https://arxiv.org/abs/2307.15818)
- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
