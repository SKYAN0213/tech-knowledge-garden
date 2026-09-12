---
title: Vision-Language-Action Models
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-26
updated: 2026-08-24
aliases:
  - VLA
  - 시각-언어-행동 모델
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]"
tags:
  - AI
  - Robotics
  - VLA
---

# Vision-Language-Action Models

## 한 문장 정의

Vision-Language-Action Models, VLA는 시각 관측과 언어 지시를 받아 로봇이 실행할 수 있는 시간 순서의 행동을 생성하는 모델입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 시각-언어-행동 모델 |
| 영어 이름 | Vision-Language-Action Model |
| 약어 | VLA |
| 출력 | 관절·그리퍼·이동 명령 또는 행동 토큰 |

## 범위

**포함:** 이미지·비디오·센서와 언어 지시의 결합, 행동 표현, 로봇 제어 정책, cross-embodiment 전이, 시뮬레이션·실환경 평가입니다.

**포함하지 않음:** 시각과 언어만 이해하는 VLM, 자연어 계획만 만드는 에이전트, 저수준 안전 제어 전체를 대신하지 않습니다.

## 왜 중요한가

로봇은 “무엇이 보이는가”를 답하는 데서 끝나지 않고 시간에 따라 물리 행동을 내야 합니다. 행동 공간은 로봇 형태와 센서, 환경에 따라 달라지므로 데이터와 안전 평가가 언어 모델보다 더 강하게 현실 조건에 묶입니다.

## 핵심 구성 요소

- 카메라·센서 관측 인코더
- 언어 지시 표현
- 시각·언어 융합 모델
- 행동 토큰 또는 연속 제어 출력
- 로봇 embodiment와 좌표 변환
- 안전 제약과 저수준 제어기
- 시뮬레이션·실환경 평가

## 작동 원리

1. 현재 장면과 로봇 상태, 언어 목표를 입력받습니다.
2. 모델이 목표와 관련된 물체·공간 관계를 표현합니다.
3. 다음 행동 또는 짧은 행동 묶음을 생성합니다.
4. 저수준 제어기와 안전 장치가 실행 가능성을 확인합니다.
5. 새 관측을 받아 행동을 수정하며 목표까지 반복합니다.

## 실제 예시

- “빨간 컵을 집어 오른쪽 선반에 놓아라”는 지시를 카메라 관측과 연결합니다.
- 다른 로봇 팔에서 배운 집기 패턴을 새 형태의 로봇에 맞게 전이합니다.
- 시뮬레이션에서 희귀 결함 이미지를 만들고 실제 검사 로봇의 인식·행동을 평가합니다.

## 한계와 실패 조건

- 학습 환경과 실제 조명·마찰·물체 차이가 행동 실패로 이어집니다.
- 언어적으로 맞는 계획도 로봇의 관절 한계와 충돌할 수 있습니다.
- 드문 위험 상황 데이터가 부족해 평균 성공률이 안전을 보장하지 못합니다.
- 다른 로봇으로 옮길 때 행동 표현과 좌표계가 맞지 않을 수 있습니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| Vision-Language Model | VLM은 시각·언어 이해가 중심이고 VLA는 실행 가능한 행동 출력을 포함합니다. |
| [[Knowledge/AI Systems/AI Agents|AI Agents]] | 에이전트는 도구·업무 전반을 다루며 VLA는 물리 로봇 행동 모델에 초점을 둡니다. |
| 로봇 제어기 | 제어기는 안정적인 저수준 명령을 실행하고 VLA는 높은 수준 관측·지시를 행동으로 연결합니다. |

## 관련 개념

- 상위: embodied AI, 로보틱스
- 하위: action tokenization, cross-embodiment learning
- 함께 쓰임: [[Knowledge/AI Systems/AI Agents|AI Agents]], [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]], 시뮬레이션
- 대비: Vision-Language Model

## 최근 변화

- 2026 — VLA 연구는 더 큰 시각·언어 모델뿐 아니라 행동 시간 구조를 학습하고 다른 로봇 형태로 옮기는 문제를 강조하고 있습니다.

## 출처

- https://arxiv.org/abs/2606.26095
- https://deepmind.google/discover/blog/rt-2-new-model-translates-vision-and-language-into-action/
- https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
