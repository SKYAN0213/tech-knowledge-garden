---
title: 성능 평가를 전체 실행 경로로
type: briefing-topic
topic_id: performance-path
date: 2026-10-08
description: NVIDIA의 Vera Rubin·Groq 3 LPX 자료는 GPU·LPU의 계산 역할과 네트워크·서빙 구성을 설명한다.
  9월15일 갱신 성능은 DeepSeek V4 Pro·AgentX에서 GB300 NVL72와 비교한 값이다. Model Connect는 지원
  모델의 체크포인트부터 TensorRT 엔진·전후처리·C++ 실행 자산까지 번들로 묶는 별도 배포 사례다.
github_url: https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/performance-path.md
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# 성능 평가를 전체 실행 경로로

NVIDIA의 Vera Rubin·Groq 3 LPX 자료는 GPU·LPU의 계산 역할과 네트워크·서빙 구성을 설명한다. 9월15일 갱신 성능은 DeepSeek V4 Pro·AgentX에서 GB300 NVL72와 비교한 값이다. Model Connect는 지원 모델의 체크포인트부터 TensorRT 엔진·전후처리·C++ 실행 자산까지 번들로 묶는 별도 배포 사례다.

[[Briefings/index|← 브리핑]] · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/performance-path.md)

## 사건 이력

<span id="20261001-gke-agent-substrate"></span>

### 2026-09-30 · [[News/72249bd53d8a5849|Google Cloud, 에이전트 격리용 GKE Agent Substrate와 고속 저장 VM 공개]]

Google Cloud는 10월 1일 게시한 9월 업데이트에서 GKE Agent Substrate와 M4N·Z4D 인스턴스의 정식 제공 등 에이전트 인프라 변경을 발표했다. Google은 Agent Substrate가 표준 컨테이너 실행보다 샌드박스 밀도를 10배 높이고 500밀리초 미만 재개를 지원한다고 밝혔다. M4N은 Hyperdisk Extreme 구성에서 호스트 저장 성능 최대 25,000 MiB/s·100만 IOPS를 제시했으며, Z4D 베어메탈은 한 호스트에서 수천 개 microVM 샌드박스를 실행할 수 있도록 설계했다고 설명했다.

[Google 원문](https://cloud.google.com/blog/topics/ai-infrastructure/whats-new-in-ai-infrastructure-this-month) · [[Briefings/2026/10/2026-10-01_0800_Tech_AI_Briefing|당일 브리핑]]

<span id="20261001-synopsys-design-agent"></span>

### 2026-09-30 · [[News/8fac3ce4d39c6ea9|OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약]]

OpenAI와 Synopsys는 2026년 9월 30일 반도체 설계 특화 모델 GPT-Synopsys를 공동 개발하고 고객에게 함께 제공하는 다년 계약을 발표했다. OpenAI는 Synopsys의 전자설계자동화(EDA) 도구를 사용할 수 있도록 라이선스를 받고, 양사는 연구개발·시장 출시와 수익 배분에 협력한다. 초기 기술 협의는 시작됐지만 제품 출시일과 실제 설계 성과는 발표되지 않았다.

[news.synopsys.com 원문](https://news.synopsys.com/2026-09-30-OpenAI-and-Synopsys-Announce-GPT-Synopsys-Frontier-Intelligence-to-Revolutionize-Chip-Design) · [[Briefings/2026/10/2026-10-01_0800_Tech_AI_Briefing|당일 브리핑]]

<span id="20260923-sol-performance-path"></span>

### 2026-09-22 · [[News/73461b3e97af0d93|OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하]]

OpenAI는 9월 22일 GPT-6 Sol과 Luna를 공개하고 API와 ChatGPT Work·Codex에 제공하기 시작했다. API의 100만 토큰당 입력·출력 가격은 Sol이 각각 2달러·10달러, Luna가 0.10달러·0.50달러다. 이전 GPT-5.6 Sol의 4달러·20달러, Luna의 0.20달러·1.20달러보다 낮다.

[OpenAI 원문](https://openai.com/index/introducing-gpt-6-sol-and-luna/) · [[Briefings/2026/09/2026-09-23_0800_Tech_AI_Briefing|당일 브리핑]]

<span id="performance-habitat"></span>

### 2026-09-11 · [[News/46fcf5bb7b99520f|OpenAI, 저장소 서비스 Rust로 재작성…발표 당시 요청 95% 처리]]

OpenAI는 9월 11일 온라인 저장소 서비스 Habitat의 확장 경험을 공개했다. 회사에 따르면 엔지니어 2명이 Codex와 GPT-5.5를 이용해 2026년 2분기에 서비스를 Rust로 재작성했으며, 발표 당시 운영 요청의 95%를 처리하고 있었다. OpenAI는 자사 측정에서 Python 버전 대비 CPU 효율 6배, 메모리 효율 15배를 기록했다고 밝혔다.

[OpenAI 원문](https://openai.com/index/scaling-storage-one-billion-users-part-one/) · [[Briefings/2026/09/2026-09-13_0800_Tech_AI_Briefing|당일 브리핑]]

<span id="performance-bundle"></span>

### 2026-08-28 · [[News/a0eed0f62d0dd240|NVIDIA, 공개 모델 체크포인트를 C++ 추론으로 연결하는 Model Connect 소개]]

NVIDIA는 2026년 8월 28일 기술 블로그에서 지원되는 공개 모델을 TensorRT 기반 네이티브 C++ 애플리케이션으로 배포하는 TensorRT Model Connect를 소개했다. Hugging Face 모델 ID나 로컬 체크포인트에서 TensorRT 엔진과 모델별 실행 자산을 담은 번들을 만든 뒤 C++ 애플리케이션에서 불러와 추론한다. 모델 준비에는 Python을 사용할 수 있지만, 배포된 애플리케이션의 실행에는 PyTorch나 Python 인터프리터가 필요하지 않다.

[NVIDIA 원문](https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/) · [[Briefings/2026/08/2026-08-29_0800_Tech_AI_Briefing|당일 브리핑]]

<span id="performance-chip"></span>

### 2026-08-25 · [[News/b9406ae170bd9133|OpenAI, 자체 추론 칩 Jalapeño의 세 모델 시험 결과 발표]]

OpenAI는 2026년 8월 25일 자체 추론 칩 Jalapeño와 이를 적용한 시스템의 회사 측 성능 시험 결과를 발표했다. 회사는 SemiAnalysis의 공개 InferenceX 벤치마크로 GPT‑OSS 120B, DeepSeek R1, Kimi K2.5 1T를 비교했으며, 최고 처리량 기준 전력당 AI 작업량은 비교 시스템의 1.5\~1.9배, 종단 간 지연은 1.7\~3.6배 낮았다고 밝혔다. Jalapeño의 자사 컴퓨팅 인프라 배치는 2026년 말 시작할 계획이며, 생산 검증과 소프트웨어 준비는 계속 중이다.

[OpenAI 원문](https://openai.com/index/jalapeno-first-results/) · [[Briefings/2026/08/2026-08-26_0802_Tech_AI_Briefing|당일 브리핑]]

<span id="performance-nvidia"></span>

### 2026-08-24 · [[News/19af374b78b369cd|NVIDIA, Groq 3 LPX 양산과 GPU·LPU 공동 추론 구성 소개]]

NVIDIA는 2026년 8월 24일 공식 블로그에서 Groq 3 LPX가 양산 단계라고 밝히고 Vera Rubin NVL72와 함께 사용하는 추론 구성을 소개했다. Rubin GPU가 대규모 문맥 처리를 맡고 LPX가 지연에 민감한 토큰 생성을 가속하며, 두 종류의 계산 장치가 모델의 각 계층을 함께 계산하는 설계다. 회사는 Nebius를 LPX의 첫 도입사로 소개하고 Nebius Token Factory에 Vera Rubin NVL72와 LPX를 결합할 계획이라고 설명했다.

[NVIDIA 원문](https://blogs.nvidia.com/blog/vera-rubin-lpx-spectrum-x-nvlink-fusion/) · [NVIDIA 원문](https://blogs.nvidia.com/blog/vera-rubin-nvl72-efficiency-ai-agents/) · [[Briefings/2026/08/2026-08-25_0801_Tech_AI_Briefing|당일 브리핑]]

<span id="galaxydit-settings-20260726"></span>

### 2026-07-26 · [[News/a9911e33a5a858b4|GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용]]

NVIDIA는 7월 26일 DAC 2026의 GalaxyDiT 논문을 연구 페이지에 소개했다. 이 방법은 영상 확산 트랜스포머의 반복 계산을 모델 재학습 없이 재사용하며, 조건부·무조건부 경로의 계산과 재사용을 함께 결정한다.

[NVIDIA 원문](https://research.nvidia.com/publication/2026-07_galaxydit-efficient-video-generation-guidance-alignment-and-adaptive-proxy) · [arXiv 원문](https://arxiv.org/html/2512.03451v1) · [[Briefings/2026/07/2026-07-27_0800_Tech_AI_Briefing|당일 브리핑]]

<span id="20260930-tita-edge-robot-computing"></span>

### 2026-06-27 · [[News/ef404a41d1e5901f|Direct Drive Tech, 바퀴·다리형 TITA의 설계와 사양 소개]]

Direct Drive Tech는 2026년 6월 27일 배송·점검·공공 서비스에 쓰일 바퀴·다리형 로봇 TITA의 설계와 사양을 소개했다. 회사 발표에 따르면 TITA는 온보드 AI 연산 100 TOPS, 동적 적재량 최대 10 kg, 8개 준직구동 모듈 기반 8자유도와 최대 토크 120 N·m를 갖췄다. 또 오픈 Linux 커널 소스와 API·모터 수준 인터페이스, ROS 2 호환성을 개발자용 기능으로 제시했으며, 보도자료는 독립 성능시험이나 현장 운용 결과를 제시하지 않았다.

[globenewswire.com 원문](https://www.globenewswire.com/news-release/2026/06/27/3318546/0/en/direct-drive-tech-highlights-tita-wheeled-legged-robot-for-delivery-inspection-and-public-service-applications.html) · [[Briefings/2026/06/2026-06-28_0004_Tech_AI_Briefing|당일 브리핑]]

<span id="20260930-deepx-edge-npu"></span>

### 2026-06-26 · [[News/bef8ee041d7dc1a0|DEEPX·Sixfab, Raspberry Pi 5용 NPU 보드 공개]]

DEEPX와 Sixfab은 2026년 6월 26일 DEEPX NPU를 넣은 Raspberry Pi 5용 AI HAT를 공개하고 기술 구성을 발표했다. 두 회사 설명에 따르면 보드는 임베디드 AI 모델을 Raspberry Pi 5에서 로컬 실시간 추론하도록 설계됐으며, 개발자용 SDK는 모델 컴파일과 배포를 지원한다. 보드의 공식 유통은 향후 시작될 예정이라고 발표했으며, 원문에는 실제 판매 개시일이나 독립 성능 측정 결과가 제시되지 않았다.

[prnewswire.com 원문](https://www.prnewswire.com/news-releases/deepx-and-sixfab-launch-deepx-ai-hat-to-drive-edge-physical-ai-on-raspberry-pi-302811628.html) · [[Briefings/2026/06/2026-06-26_1802_Tech_AI_Briefing|당일 브리핑]]

## 관련 개념

- [[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]
- [[Knowledge/AI Systems/KV Cache|KV Cache]]
- [[Knowledge/Data Systems/Latency Percentiles|Latency Percentiles]]
- [[Knowledge/AI Systems/Classifier-Free Guidance|Classifier-Free Guidance]]
- [[Knowledge/AI Systems/Diffusion Transformer|Diffusion Transformer]]
