---
title: AI Technology Knowledge Map
type: map
status: active
created: 2026-06-23
updated: 2026-10-22
last_reviewed: 2026-10-22
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
- [[Knowledge/AI Systems/Air-Gapped Deployment|에어갭 배포]]
- [[Knowledge/AI Systems/Classifier-Free Guidance|분류기 없는 가이던스]]
- [[Knowledge/AI Systems/Context Compaction|문맥 압축]]
- [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]
- [[Knowledge/AI Systems/Diffusion Transformer|확산 트랜스포머]]
- [[Knowledge/AI Systems/Double-Blind AI Evaluation|이중 블라인드 AI 평가]]
- [[Knowledge/AI Systems/KV Cache|KV 캐시]]
- [[Knowledge/AI Systems/Metadata Filtering|메타데이터 필터링]]
- [[Knowledge/AI Systems/Model Context Protocol|MCP]]
- [[Knowledge/AI Systems/OpenUSD|OpenUSD 장면 기술]]
- [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]]
- [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]]
- [[Knowledge/AI Systems/Row-Level Security|행 단위 보안]]
- [[Knowledge/AI Systems/Safety Classifier|안전 분류기]]
- [[Knowledge/AI Systems/Speculative Decoding|추측 디코딩]]
- [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]]
- [[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]]
- [[Knowledge/AI Systems/Zero-Shot Inference|제로샷 추론]]
- [[Knowledge/AI Systems/x402|x402]]
- [[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]]
- [[Knowledge/Research Methods/High Performance Linpack|HPL]]
- [[Knowledge/Research Methods/Randomized Controlled Trial|무작위 대조 시험]]
- [[Knowledge/Robotics/Hierarchical Fuzzy Neural Network (Fabric Grasping)|옷감 집기용 HFNN]]
- [[Knowledge/Robotics/Machine Tending|머신 텐딩]]
- [[Knowledge/Robotics/Welding Weaving|용접 위빙]]
- [[Knowledge/Security/OpenID Connect|OIDC]]
- [[Knowledge/Security/Zero-Knowledge Proofs|영지식 증명]]
- [[Knowledge/Software Engineering/Code Coverage|코드 커버리지]]
- [[Knowledge/Software Engineering/Insecure Direct Object Reference|IDOR]]
- [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]]
- [[Knowledge/Van der Waals Contact|반데르발스 접촉]]

## 연결 관계

| 용어 | 연결된 용어 | 연결 이유 |
|---|---|---|
| [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 모델과 도구 실행의 신원·권한·검사 경계를 보호한다. [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents) · [근거](https://openai.github.io/openai-agents-python/guardrails/) |
| [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | [[Knowledge/AI Systems/Model Context Protocol|MCP]] | 호스트가 연결별 동의·권한과 서버 사이의 경계를 유지한다. [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | [[Knowledge/AI Systems/Model Context Protocol|MCP]] | 외부 도구 연결에 MCP를 사용할 수 있다. SDK의 MCP 서버 설정은 선택 사항이다. [근거](https://openai.github.io/openai-agents-python/agents/) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다. [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다. [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://openai.github.io/openai-agents-python/tracing/) |
| [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 모델 생성·도구 호출·handoff·guardrail을 실행 기록으로 남긴다. [근거](https://openai.github.io/openai-agents-python/tracing/) |
| [[Knowledge/AI Systems/Classifier-Free Guidance|분류기 없는 가이던스]] | [[Knowledge/AI Systems/Diffusion Transformer|확산 트랜스포머]] | 영상 확산 모델은 각 DiT 경로의 노이즈 예측을 CFG로 결합해 다음 sampler 입력을 만든다. [근거](https://arxiv.org/html/2512.03451v1) |
| [[Knowledge/AI Systems/Context Compaction|문맥 압축]] | [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]] | 대화 문맥을 교체하면 프롬프트 앞부분이 바뀌어 압축 직후 이전 캐시의 재사용을 줄일 수 있다. [근거](https://developers.openai.com/api/docs/guides/prompt-caching.md) |
| [[Knowledge/AI Systems/Context Compaction|문맥 압축]] | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | OpenAI는 ARC-AGI-3 평가 실행기의 오래된 메시지 삭제를 문맥 압축으로 바꿔 추론 보존과 함께 시험했다. [근거](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/) |
| [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다. [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) |
| [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]] | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 음성 처리와 업무 실행의 단계를 추적으로 연결한다. [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/tracing/) |
| [[Knowledge/AI Systems/KV Cache|KV 캐시]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 모델 서빙에서 이전 토큰의 어텐션 키·값을 재사용해 반복 계산을 줄인다. [근거](https://huggingface.co/docs/transformers/en/cache_explanation) |
| [[Knowledge/AI Systems/Metadata Filtering|메타데이터 필터링]] | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | AWS는 AI 에이전트의 대화 기억 검색에 메타데이터 필터를 적용해 네임스페이스 안에서 날짜·부서·우선순위 조건을 지정하는 방식을 설명한다. [근거](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/) |
| [[Knowledge/AI Systems/Prompt Caching|프롬프트 캐싱]] | [[Knowledge/AI Systems/KV Cache|KV 캐시]] | 동일한 입력 앞부분에 대한 KV 텐서를 저장하고 후속 요청에서 재사용한다. [근거](https://developers.openai.com/api/docs/guides/prompt-caching.md) |
| [[Knowledge/AI Systems/Row-Level Security|행 단위 보안]] | [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | PAR의 분석 에이전트는 검증된 사용자 권한으로 조회 행을 먼저 제한해 모델의 데이터 접근 경계를 강제한다. [근거](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/) |
| [[Knowledge/AI Systems/Speculative Decoding|추측 디코딩]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 작은 모델의 후보 토큰을 주 모델이 검증해 비싼 순차 추론 횟수를 줄이는 서빙 기법이다. [근거](https://huggingface.co/docs/transformers/en/assisted_decoding) · [근거](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/) |
| [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 예측 모델의 구조와 실제 추론 실행 비용을 함께 살펴본다. [근거](https://arxiv.org/abs/2403.07815) · [근거](https://docs.vllm.ai/en/latest/) · [근거](https://arxiv.org/html/2403.07815v3) |
| [[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]] | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다. [근거](https://arxiv.org/abs/2307.15818) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| [[Knowledge/AI Systems/Zero-Shot Inference|제로샷 추론]] | [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] | 사전학습한 시계열 모델을 새 데이터셋에 추가 학습 없이 적용할 때 사용하는 평가 조건이다. [근거](https://arxiv.org/abs/2403.07815) |
| [[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]] | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 모델 서빙의 느린 요청 구간을 지연 분포로 평가할 때 사용한다. [근거](https://prometheus.io/docs/practices/histograms/) |
| [[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]] | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 실행 과정에서 수집한 지연을 분포로 집계해 느린 요청이 얼마나 발생하는지 확인한다. [근거](https://prometheus.io/docs/practices/histograms/) |
| [[Knowledge/Security/OpenID Connect|OIDC]] | [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]] | 배포 워크플로의 신원을 확인해 단기 자격 증명을 발급하는 방식으로 빌드·배포 경로를 보호할 수 있다. [근거](https://docs.github.com/en/actions/concepts/security/openid-connect) |
