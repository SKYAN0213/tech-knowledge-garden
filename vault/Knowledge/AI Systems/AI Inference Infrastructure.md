---
title: AI Inference Infrastructure
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-24
updated: 2026-09-28
aliases:
  - AI 추론 인프라
parent_concepts: []
related_concepts:
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
tags:
  - AI
  - Inference
  - Infrastructure
last_reviewed: 2026-09-28
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
  - https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/
  - https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/
  - https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/
  - https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai
  - https://openai.com/index/jalapeno-first-results/
relations:
  - target: metrics
    type: uses
    reason: 서빙 요청의 평균과 지연 분포를 구분해 관측한다.
    basis: inference
    evidence:
      - https://docs.vllm.ai/en/latest/
      - https://prometheus.io/docs/practices/histograms/
map_review:
  decision: include
  kind: architecture
  reason: 학습과 추론을 구별하고 서빙의 계산·메모리·스케줄링 구조를 이해해야 한다.
  reviewed: 2026-09-28
---

# AI Inference Infrastructure

## 한 문장 정의

AI 추론 인프라는 학습된 모델을 요청에 응답하도록 실행하는 서빙 소프트웨어와 메모리 관리·요청 배치·분산 실행 기반이다. [vLLM](https://docs.vllm.ai/en/latest/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 추론 인프라 |
| 영어 | AI Inference Infrastructure |
| 핵심 용어 | 서빙 · KV 캐시 · 연속 배치 · 양자화 · 지연 |

## 범위

**포함:** 모델 서빙, attention key/value 메모리, 요청 배치, 캐시, 지원 양자화 형식과 분산 실행을 다룬다. 모델의 준비·변환과 배포된 애플리케이션의 실제 실행도 구분한다. [vLLM](https://docs.vllm.ai/en/latest/) · [Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

**포함하지 않음:** 체크포인트 준비 단계와 배포 후 추론 실행을 같은 단계로 취급하는 것. 지원 기능 목록을 비교 성능 측정치로 취급하는 것. [Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

## 왜 중요한가

모델 체크포인트를 실행하려면 엔진 생성뿐 아니라 전처리·실행 조정·후처리와 배포 자산도 필요할 수 있다. NVIDIA의 Model Connect는 이 전체 경로를 공개 참조 구현과 모델별 번들로 연결하는 사례다. [Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

## 핵심 구성 요소

- 메모리 관리: vLLM의 PagedAttention은 attention key/value 메모리를 관리한다. [vLLM](https://docs.vllm.ai/en/latest/)
- 요청 처리: 연속 배치, chunked prefill과 prefix caching을 지원한다. [vLLM](https://docs.vllm.ai/en/latest/)
- 실행 구성: 지원되는 양자화 형식, 최적화 커널과 분산 병렬 실행을 제공한다. [vLLM](https://docs.vllm.ai/en/latest/)
- 관측: 요청 시간의 개수·합·분포를 기록해 평균과 분위수를 구분한다. [Prometheus](https://prometheus.io/docs/practices/histograms/)

## 작동 원리

vLLM은 들어오는 요청을 연속 배치로 처리하고, PagedAttention·chunked prefill·prefix caching 등의 서빙 기능을 제공한다고 설명한다. 문서는 tensor·pipeline·data·expert·context 병렬 처리와 여러 양자화 형식·커널 지원도 소개한다. [vLLM](https://docs.vllm.ai/en/latest/)

Model Connect에서는 지원되는 모델의 체크포인트를 매핑해 TensorRT 엔진과 모델별 실행 자산을 번들로 만든다. C++ 애플리케이션은 번들을 불러와 전처리·추론·후처리를 실행한다. [Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

## 실제 예시

NVIDIA는 2026년 8월 24일 게시한 발표에서 Rubin GPU가 대규모 문맥을 처리하고 Groq 3 LPX가 지연에 민감한 토큰 생성을 가속하는 공동 설계를 소개했다. 캐시·라우팅·분산 실행과 계산 장치의 역할을 함께 설명하는 사례다. [발표](https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/) · [최적화 구성](https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/)

NVIDIA가 2026년 8월 28일 소개한 Model Connect는 Hugging Face 모델 ID나 로컬 체크포인트에서 번들을 만든다. 준비 단계에서는 Python을 사용할 수 있지만, 배포된 애플리케이션 실행에는 PyTorch나 Python 인터프리터가 필요하지 않다. [Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

AWS와 NVIDIA는 2026년 8월 26일, AWS의 글로벌 인프라에 Blackwell Ultra·Rubin·Rubin Ultra GPU 200만 개를 2027~2028년에 추가 배치할 계획을 발표했다. [원문](https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai)

## 한계와 실패 조건

기능 목록은 비교 성능 수치가 아니다. Model Connect는 지원되는 모델의 공개 참조 구현 모음으로, 모든 공개 모델을 자동 변환하는 새 추론 프레임워크라고 설명하지 않는다. [vLLM](https://docs.vllm.ai/en/latest/) · [Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

Prometheus의 분위수는 표현 방식에 따른 추정치다. histogram은 버킷 구성·해상도가 결과에 영향을 주며, 여러 인스턴스의 summary 분위수를 평균내 전체 분위수를 구하는 것은 통계적으로 타당하지 않다. [Prometheus](https://prometheus.io/docs/practices/histograms/)

## 혼동하기 쉬운 개념

관측 값의 합과 개수로 구하는 평균은 요청 지연의 분위수와 다르다. summary는 계측 프로그램에서 설정한 분위수를 계산하며, histogram은 분포를 기록한 뒤 합쳐 histogram_quantile로 분위수를 추정할 수 있다. [Prometheus](https://prometheus.io/docs/practices/histograms/)

## 관련 개념

- [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 서빙 요청의 평균과 지연 분포를 구분해 관측한다. [Prometheus](https://prometheus.io/docs/practices/histograms/)

## 최근 변화

- 2026-09-15 — NVIDIA는 8월 24일 최초 게시한 성능 자료를 갱신했다. 갱신본은 DeepSeek V4 Pro의 AgentX 코딩 궤적에서 GB300 NVL72 대비 메가와트당 처리량은 최대 30배 높고 백만 토큰당 비용은 최대 45배 낮다고 제시한다. 이 수치는 회사 자료의 모델·워크로드 조건에 속하며 도구 호출의 Vera CPU 성능은 포함하지 않는다. [[News/19af374b78b369cd|관련 기사]] · [갱신 원문](https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/)
- 2026-08-28 — NVIDIA는 지원 모델의 체크포인트 매핑·TensorRT 엔진·전후처리·실행 자산을 번들로 묶고 Python 준비와 C++ 실행을 구분하는 Model Connect를 소개했다. [[News/a0eed0f62d0dd240|관련 기사]] · [원문](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

- 2026-08-26 — AWS와 NVIDIA는 AWS 글로벌 인프라에 GPU 200만 개를 2027~2028년 추가 배치할 계획을 발표했다. [[News/9f43a79e9c23b1f3|관련 기사]] · [원문](https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai)
- 2026-08-25 — OpenAI는 자체 추론 칩 Jalapeño와 주변 시스템의 시험 결과를 발표했다. 회사는 InferenceX의 GPT-OSS 120B·DeepSeek R1·Kimi K2.5 1T 비교에서 최고 처리량 기준 전력당 작업량이 1.5~1.9배였고 종단 간 지연도 낮았다고 보고했다. 전력 비교에는 공표된 칩 정격을 사용했으며, Jalapeño의 정격 700W와 시험 중 지속 전력 550W 이하를 구분했다. 2026년 말부터 자체 인프라에 배치한다는 내용은 발표 시점의 계획이다. [[News/b9406ae170bd9133|관련 기사]] · [원문](https://openai.com/index/jalapeno-first-results/)
- 2026-08-24 — NVIDIA는 Groq 3 LPX 양산과 Vera Rubin NVL72를 함께 사용하는 추론 구성을 발표했다. 문맥 처리·토큰 생성과 네트워크·인프라 서비스의 역할을 구분해 소개한다. [[News/19af374b78b369cd|관련 기사]] · [원문](https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/)

## 출처

- [vLLM · Inference and Serving](https://docs.vllm.ai/en/latest/)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [NVIDIA · TensorRT Model Connect](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)
- [NVIDIA · Vera Rubin 추론 구성](https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/)
- [NVIDIA · AgentX 성능 자료와 9월 15일 갱신](https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/)
- [AWS·NVIDIA · GPU 인프라 추가 배치 계획](https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai)
- [OpenAI · Jalapeño 시험 결과](https://openai.com/index/jalapeno-first-results/)
