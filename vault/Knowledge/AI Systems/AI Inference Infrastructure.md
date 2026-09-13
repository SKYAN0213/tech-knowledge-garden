---
title: AI Inference Infrastructure
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-24
updated: 2026-09-13
aliases:
  - AI 추론 인프라
parent_concepts: []
related_concepts:
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]]"
tags:
  - AI
  - Inference
  - Infrastructure
last_reviewed: 2026-09-13
concept_id: inference
label: AI 추론 인프라
group: 평가와 운영
keywords:
  - 서빙
  - KV 캐시
  - 연속 배치
  - 양자화
  - 지연
verified_sources:
  - https://docs.vllm.ai/en/latest/
  - https://prometheus.io/docs/practices/histograms/
relations:
  - target: metrics
    type: uses
    reason: 서빙 성능을 지연 분포와 처리량으로 비교한다.
    basis: inference
    evidence:
      - https://docs.vllm.ai/en/latest/
      - https://prometheus.io/docs/practices/histograms/
map_review:
  decision: include
  kind: architecture
  reason: 학습과 추론을 구별하고 서빙의 계산·메모리·스케줄링 구조를 이해해야 한다.
  reviewed: 2026-09-13
---

# AI Inference Infrastructure

## 한 문장 정의

학습된 모델을 요청에 응답하는 서비스로 실행하기 위한 계산·메모리·스케줄링·서빙 기반이다. [vLLM · Serving](https://docs.vllm.ai/en/latest/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 추론 인프라 |
| 영어 | AI Inference Infrastructure |
| 키워드 | 서빙 · KV 캐시 · 연속 배치 · 양자화 · 지연 |

## 범위

**포함:** KV 캐시, 배치 처리, 분산 실행, 모델 서빙과 자원 운영.

**포함하지 않음:** 학습 데이터 수집과 모델 사전학습 전체.

## 왜 중요한가

같은 모델도 자원 배치와 요청 처리 방식에 따라 비용·처리량·지연이 달라진다. 모델 품질과 서비스 품질을 연결하는 기반이다.

## 핵심 구성 요소

- 서빙
- KV 캐시
- 연속 배치
- 양자화
- 지연

## 작동 원리

요청을 배치하고 메모리와 실행 장치를 할당한다. vLLM은 PagedAttention, 연속 배치, 캐시와 양자화 등으로 서빙 효율을 다룬다. [vLLM · Serving](https://docs.vllm.ai/en/latest/)

## 실제 예시

여러 사용자의 생성 요청을 연속 배치로 처리하는 모델 서버.

## 한계와 실패 조건

처리량 개선이 개별 사용자의 지연 개선과 같지는 않다. 입력 길이·배치·정밀도·장치 조건을 함께 봐야 한다.

## 혼동하기 쉬운 개념

모델 능력은 무엇을 할 수 있는지, 추론 인프라는 어떤 비용과 지연으로 실행하는지를 다룬다.

## 관련 개념

- → 활용: [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 서빙 성능을 지연 분포와 처리량으로 비교한다. (해석; [근거](https://docs.vllm.ai/en/latest/) · [근거](https://prometheus.io/docs/practices/histograms/))
- ← 활용: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 모델 호출을 수행하려면 해당 모델의 추론 실행 기반을 사용한다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://docs.vllm.ai/en/latest/))
- ← 활용: [[Knowledge/AI Systems/Time-Series Foundation Models#한 문장 정의|시계열 파운데이션 모델]] — 예측 모델도 실행 자원과 요청 처리 기반 위에서 동작한다. (해석; [근거](https://arxiv.org/abs/2403.07815) · [근거](https://docs.vllm.ai/en/latest/))

## 최근 변화

- 2026-08-28 — NVIDIA TensorRT Model Connect는 지원되는 공개 모델의 체크포인트 매핑, TensorRT engine, 전후처리와 런타임 조정을 하나의 bundle로 묶어 Python 준비 단계와 네이티브 C++ 실행을 분리했습니다. 추론 인프라의 배포 단위가 개별 변환 스크립트에서 검증 가능한 모델별 아티팩트로 이동하는 사례지만, 모델·하드웨어별 재검증은 남습니다. [source](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)
- 2026-08-26 — AWS와 NVIDIA는 2027~2028년 Blackwell Ultra·Rubin 계열 GPU 200만 개 추가 배치와 Vera CPU, NVLink Fusion·NVHBM, Nitro·EFA 통합 계획을 발표했습니다. 추론 용량 계획이 칩 수량을 넘어 CPU·메모리·네트워크·보안·지역별 가용성을 함께 봐야 하는 장기 공급 문제임을 보여주지만, 아직 계획 단계입니다. [source](https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai)
- 2026-08-25 — OpenAI는 첫 자체 추론 칩 Jalapeño가 세 공개 모델의 회사 측 InferenceX 시험에서 비교 시스템보다 최고 처리량 기준 전력당 작업량 1.5~1.9배와 종단 간 지연 1.7~3.6배의 결과를 냈다고 발표했습니다. 칩·메모리·네트워크·서빙 소프트웨어의 공동 설계를 강조하지만 독립 재현과 생산 규모 총소유비용은 아직 확인되지 않았습니다. [source](https://openai.com/index/jalapeno-first-results/)
- 2026-08-24 — NVIDIA는 Vera Rubin NVL72에서 문맥 처리와 토큰 생성을 GPU·LPU로 분담하고 네트워크·KV cache·전력 관리를 함께 최적화하는 구성을 공개했습니다. 에이전트 추론 성능을 단일 요청이 아니라 실제 도구 호출 궤적의 전력당 처리량과 토큰 비용으로 재려는 변화지만, 핵심 배수 수치는 공급업체 측정이며 일부는 외부 검토 전입니다. [source](https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/) [benchmark](https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/)
- 2026 — 추론 효율 경쟁은 전용 가속기뿐 아니라 캐시, kernel, speculative decoding, agent 실행 중복 축소를 함께 다루는 방향으로 넓어졌습니다.

## 출처

- [vLLM · Serving](https://docs.vllm.ai/en/latest/)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
