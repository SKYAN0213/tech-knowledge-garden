---
title: Vision-Language-Action Models
type: knowledge
status: evergreen
created: 2026-06-26
tags:
  - AI
  - Robotics
  - VLA
  - EmbodiedAI
---

# Vision-Language-Action Models

## 한 줄 정의

Vision-Language-Action Models는 시각 입력, 언어 지시, 물리적 행동 출력을 함께 다뤄 로봇이나 embodied system이 실제 환경에서 작업을 수행하도록 하는 모델입니다.

## 왜 중요한가

LLM이나 VLM은 텍스트와 이미지 이해에 강하지만, 로봇은 시간에 따른 물리 행동을 만들어야 합니다. 행동 공간은 로봇 형태, 관절, 그리퍼, 센서, 환경에 따라 달라지므로 단순히 언어/시각 backbone을 키우는 것만으로는 충분하지 않습니다.

## 핵심 개념

| 개념 | 설명 |
|---|---|
| Action Prior | 물리적 움직임의 시간 구조를 미리 학습한 표현 |
| Cross-embodiment | 다른 로봇 형태나 플랫폼 사이에 행동 지식을 옮기는 문제 |
| History Compression | 이전 상태와 행동 이력을 작은 temporal context로 요약하는 방식 |
| Data-scarce Real-world Task | 실제 로봇 데이터가 적은 상황에서 일반화해야 하는 작업 |

## Recent Signals

- 2026-07-01 00:04 KST 브리핑: NVIDIA는 Omniverse, Metropolis, Cosmos, TAO, VSS skills를 조합해 vision AI agent의 합성데이터 생성, fine-tuning, video search/summarization workflow를 반복 가능한 형태로 묶는 글을 공개했습니다. physical AI에서는 모델 자체뿐 아니라 rare event 데이터 생성, 현장별 fine-tuning, edge/cloud deployment workflow가 성능 병목을 줄이는 핵심 요소가 되고 있습니다.
- 2026-06-30 00:04 KST 브리핑: TechCrunch는 Proception이 센서 장갑으로 human hand interaction data를 수집하고 22 자유도 robotic hand를 개발하려 한다고 보도했습니다. dexterous manipulation에서는 policy architecture만큼 tactile/interaction data 수집 방식과 robot-in-the-loop 비용이 핵심 병목입니다.
- 2026-06-26 00:05 KST 브리핑: `Learning Action Priors for Cross-embodiment Robot Manipulation` 논문은 action trajectory 기반 선행 학습과 latent distillation로 VLA 모델의 행동 모듈에 motion prior를 주는 방법을 제안했습니다.

## 브리핑에서 볼 체크리스트

- action module이 처음부터 학습되는가, 별도 motion prior가 있는가
- simulated task와 real-world task가 모두 평가되었는가
- cross-embodiment 일반화를 로봇 형태별로 검증했는가
- language/vision 성능과 실제 task success를 구분해 보고했는가
- history나 memory가 latency와 안정성에 어떤 영향을 주는가

## 연결 문서

- [[Knowledge/AI Systems/AI Agents|AI Agents]]
- [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]
- [[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]

## Source Links

- https://arxiv.org/abs/2606.26095
- https://techcrunch.com/2026/06/29/robot-hand-company-settles-tesla-trade-secret-suit-and-announces-11m-raise/
- https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
- https://github.com/NVIDIA/skills/tree/main/skills/physical-ai-defect-image-generation
- https://github.com/NVIDIA-TAO/tao-skills-bank
- https://github.com/NVIDIA-AI-Blueprints/video-search-and-summarization/tree/main/skills
