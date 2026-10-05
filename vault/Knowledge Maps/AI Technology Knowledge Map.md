---
title: AI Technology Knowledge Map
type: map
status: active
created: 2026-06-23
updated: 2026-10-06
last_reviewed: 2026-10-06
tags:
  - AI
  - KnowledgeMap
  - Obsidian
---

# AI Technology Knowledge Map

## 전문 용어

- [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]]
- [[Knowledge/AI Systems/AI Agents|AI 에이전트]]
- [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]
- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]
- [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]
- [[Knowledge/AI Systems/Classifier-Free Guidance|분류기 없는 가이던스]]
- [[Knowledge/AI Systems/Context Compaction|문맥 압축]]
- [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]
- [[Knowledge/AI Systems/Diffusion Transformer|확산 트랜스포머]]
- [[Knowledge/AI Systems/Double-Blind AI Evaluation|이중 블라인드 AI 평가]]
- [[Knowledge/AI Systems/KV Cache|KV 캐시]]
- [[Knowledge/AI Systems/Model Context Protocol|MCP]]
- [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]]
- [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]]
- [[Knowledge/AI Systems/Speculative Decoding|추측 디코딩]]
- [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]]
- [[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]]
- [[Knowledge/AI Systems/Zero-Shot Inference|제로샷 추론]]
- [[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]]
- [[Knowledge/Research Methods/Randomized Controlled Trial|무작위 대조 시험]]
- [[Knowledge/Robotics/Hierarchical Fuzzy Neural Network (Fabric Grasping)|옷감 집기용 HFNN]]
- [[Knowledge/Robotics/Machine Tending|머신 텐딩]]
- [[Knowledge/Security/OpenID Connect|OIDC]]
- [[Knowledge/Security/Zero-Knowledge Proofs|영지식 증명]]
- [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]]

## 연결 관계

| 용어 | 연결된 용어 | 연결 이유 |
|---|---|---|
| [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 모델과 도구 실행의 신원·권한·검사 경계를 보호한다. [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents) · [근거](https://openai.github.io/openai-agents-python/guardrails/) |
| [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | [[Knowledge/AI Systems/Model Context Protocol|MCP]] | 호스트가 연결별 동의·권한과 서버 사이의 경계를 유지한다. [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | [[Knowledge/AI Systems/Model Context Protocol|MCP]] | 외부 도구 연결에 MCP를 사용할 수 있다. SDK의 MCP 서버 설정은 선택 사항이다. [근거](https://openai.github.io/openai-agents-python/agents/) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]] | 문서 검색 도구와 생성 모델을 결합하는 에이전트 작업에 RAG 구성을 사용할 수 있다. [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://arxiv.org/abs/2005.11401) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 모델을 호출하는 실행은 해당 모델의 추론 실행 기반을 사용한다. [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://docs.vllm.ai/en/latest/) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다. [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다. [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://openai.github.io/openai-agents-python/tracing/) |
| [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 모델 호출·도구 사용·이관으로 구성된 실행을 추적한다. [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://openai.github.io/openai-agents-python/agents/) |
| [[Knowledge/AI Systems/Classifier-Free Guidance|분류기 없는 가이던스]] | [[Knowledge/AI Systems/Diffusion Transformer|확산 트랜스포머]] | 영상 확산 모델은 각 DiT 경로의 노이즈 예측을 CFG로 결합해 다음 sampler 입력을 만든다. [근거](https://arxiv.org/html/2512.03451v1) |
| [[Knowledge/AI Systems/Context Compaction|문맥 압축]] | [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]] | 대화 문맥을 교체하면 프롬프트 앞부분이 바뀌어 압축 직후 이전 캐시의 재사용을 줄일 수 있다. [근거](https://developers.openai.com/api/docs/guides/prompt-caching.md) |
| [[Knowledge/AI Systems/Context Compaction|문맥 압축]] | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | OpenAI는 ARC-AGI-3 평가 실행기의 오래된 메시지 삭제를 문맥 압축으로 바꿔 추론 보존과 함께 시험했다. [근거](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/) |
| [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다. [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) |
| [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]] | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 음성 처리와 업무 실행의 단계를 추적으로 연결한다. [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/tracing/) |
| [[Knowledge/AI Systems/KV Cache|KV 캐시]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 모델 서빙에서 이전 토큰의 어텐션 키·값을 재사용해 반복 계산을 줄인다. [근거](https://huggingface.co/docs/transformers/en/cache_explanation) |
| [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]] | [[Knowledge/AI Systems/KV Cache|KV 캐시]] | 동일한 입력 앞부분에 대한 KV 텐서를 저장하고 후속 요청에서 재사용한다. [근거](https://developers.openai.com/api/docs/guides/prompt-caching.md) |
| [[Knowledge/AI Systems/Speculative Decoding|추측 디코딩]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 작은 모델의 후보 토큰을 주 모델이 검증해 비싼 순차 추론 횟수를 줄이는 서빙 기법이다. [근거](https://huggingface.co/docs/transformers/en/assisted_decoding) · [근거](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/) |
| [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 예측 모델의 구조와 실제 추론 실행 비용을 함께 살펴본다. [근거](https://arxiv.org/abs/2403.07815) · [근거](https://docs.vllm.ai/en/latest/) · [근거](https://arxiv.org/html/2403.07815v3) |
| [[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]] | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다. [근거](https://arxiv.org/abs/2307.15818) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| [[Knowledge/AI Systems/Zero-Shot Inference|제로샷 추론]] | [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] | 사전학습한 시계열 모델을 새 데이터셋에 추가 학습 없이 적용할 때 사용하는 평가 조건이다. [근거](https://arxiv.org/abs/2403.07815) |
| [[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 모델 서빙의 느린 요청 구간을 지연 분포로 평가할 때 사용한다. [근거](https://prometheus.io/docs/practices/histograms/) |
| [[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]] | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 실행 과정에서 수집한 지연을 분포로 집계해 느린 요청이 얼마나 발생하는지 확인한다. [근거](https://prometheus.io/docs/practices/histograms/) |
| [[Knowledge/Security/OpenID Connect|OIDC]] | [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]] | 배포 워크플로의 신원을 확인해 단기 자격 증명을 발급하는 방식으로 빌드·배포 경로를 보호할 수 있다. [근거](https://docs.github.com/en/actions/concepts/security/openid-connect) |
