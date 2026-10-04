---
schema_version: tech-trend/v1
type: trend-topic-source
reviewed: 2026-10-04
id: performance-path
title: 성능 평가를 전체 실행 경로로
question: 단품 속도가 빨라지면 실제 요청도 빨라지는가?
thesis: NVIDIA의 Vera Rubin·Groq 3 LPX 자료는 GPU·LPU의 계산 역할과 네트워크·서빙 구성을 설명한다.
  9월15일 갱신 성능은 DeepSeek V4 Pro·AgentX에서 GB300 NVL72와 비교한 값이다. Model Connect는 지원
  모델의 체크포인트부터 TensorRT 엔진·전후처리·C++ 실행 자산까지 번들로 묶는 별도 배포 사례다.
watch_for: 같은 모델·워크로드·전력·지연 조건의 후속 비교와 Model Connect의 지원 모델·번들 실행 API 변경.
disconfirming: 측정 모델·워크로드·비교 대상·제공 범위가 바뀌면 해당 판본을 구분한다.
knowledge_notes:
  - Knowledge/AI Systems/AI Inference Infrastructure
  - Knowledge/AI Systems/KV Cache
  - Knowledge/Data Systems/Latency Percentiles
lessons: []
reader_format: source-events/v1
---

# 성능 평가를 전체 실행 경로로

2026-08-24 — NVIDIA는 Groq 3 LPX 양산과 Rubin GPU·LPU 공동 추론 구성을 소개했다. [[News/19af374b78b369cd|기사]] · [원문](https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/)

2026-08-28 — NVIDIA는 지원되는 공개 모델의 준비·변환과 배포된 C++ 애플리케이션의 실행을 구분하는 Model Connect를 소개했다. [[News/a0eed0f62d0dd240|기사]] · [원문](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/)

2026-09-15 — NVIDIA의 성능 자료 갱신은 최초 게시일과 별도로 기록한다. DeepSeek V4 Pro·AgentX의 GB300 NVL72 비교 결과에 속한다. [[News/19af374b78b369cd|기사]] · [갱신 원문](https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/)
