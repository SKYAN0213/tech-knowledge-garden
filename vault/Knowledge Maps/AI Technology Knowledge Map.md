---
title: AI Technology Knowledge Map
type: map
status: active
created: 2026-06-23
updated: 2026-09-13
last_reviewed: 2026-09-13
tags:
  - AI
  - KnowledgeMap
  - Obsidian
---

# AI Technology Knowledge Map

## 개념

- [[Knowledge/AI Systems/AI Agent Governance|에이전트 거버넌스]]
- [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]]
- [[Knowledge/AI Systems/AI Agents|AI 에이전트]]
- [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI 보조 보안 개발]]
- [[Knowledge/AI Systems/AI Conformity Assessment|AI 적합성 평가]]
- [[Knowledge/AI Systems/AI Content Access|AI 콘텐츠 접근]]
- [[Knowledge/AI Systems/AI Content Monetization|AI 콘텐츠 수익화]]
- [[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]]
- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]
- [[Knowledge/AI Systems/AI Governance|AI 거버넌스]]
- [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]
- [[Knowledge/AI Systems/Model Context Protocol|MCP]]
- [[Knowledge/AI Systems/AI Medical Imaging|AI 의료 영상]]
- [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]
- [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]
- [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]]
- [[Knowledge/AI Systems/AI for Scientific Discovery|과학 발견 AI]]
- [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]]
- [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]]
- [[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]]
- [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]
- [[Knowledge/AI Systems/AI Wellness Devices|AI 웰니스 기기]]
- [[Knowledge/Security/Zero-Knowledge Proofs|영지식 증명]]

## 연결 관계

| 출발 | 관계 | 도착 | 연결 이유와 근거 |
|---|---|---|---|
| [[Knowledge/AI Systems/AI Agent Governance|에이전트 거버넌스]] | 근거 제공 | [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | 책임과 허용 범위를 신원·인가 통제의 운영 기준으로 연결한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)) |
| [[Knowledge/AI Systems/AI Agent Governance|에이전트 거버넌스]] | 속함 | [[Knowledge/AI Systems/AI Governance|AI 거버넌스]] | 조직 AI 거버넌스를 자율 행동과 위임 권한에 적용하는 하위 범위다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)) |
| [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | 통제 | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 모델과 도구 실행의 신원·권한·검사 경계를 보호한다. (해석; [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents) · [근거](https://openai.github.io/openai-agents-python/guardrails/)) |
| [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | 통제 | [[Knowledge/AI Systems/Model Context Protocol|MCP]] | 호스트가 연결별 동의·권한과 서버 사이의 경계를 유지한다. (해석; [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture)) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 활용 | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 모델 호출을 수행하려면 해당 모델의 추론 실행 기반을 사용한다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://docs.vllm.ai/en/latest/)) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 활용 | [[Knowledge/AI Systems/Model Context Protocol|MCP]] | 외부 도구 연결에 MCP를 사용할 수 있다. MCP 사용은 에이전트의 필수 조건이 아니다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://modelcontextprotocol.io/specification/2025-11-25/architecture)) |
| [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 활용 | [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]] | 외부 문서를 근거로 삼는 작업에는 검색-생성 경로를 조합할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://arxiv.org/abs/2005.11401)) |
| [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI 보조 보안 개발]] | 대비 | [[Knowledge/AI Systems/AI Agent Security|에이전트 보안]] | AI로 보안 업무를 돕는 활동과 AI 실행 자체를 보호하는 통제는 대상이 다르다. (해석; [근거](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features) · [근거](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents)) |
| [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI 보조 보안 개발]] | 활용 | [[Knowledge/Software Engineering/Software Supply Chain Security|소프트웨어 공급망 보안]] | AI가 제안한 코드도 기존 빌드·배포 출처 검증을 거쳐 전달한다. (해석; [근거](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features) · [근거](https://slsa.dev/spec/v1.1/levels)) |
| [[Knowledge/AI Systems/AI Conformity Assessment|AI 적합성 평가]] | 활용 | [[Knowledge/AI Systems/AI Governance|AI 거버넌스]] | 책임·문서·위험 관리 증거를 적용 요구사항의 충족 여부와 대응시킨다. (해석; [근거](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)) |
| [[Knowledge/AI Systems/AI Content Monetization|AI 콘텐츠 수익화]] | 활용 | [[Knowledge/AI Systems/AI Content Access|AI 콘텐츠 접근]] | 가격과 지급 조건을 허용된 콘텐츠 접근에 결합한다. (해석; [근거](https://blog.cloudflare.com/introducing-pay-per-crawl/) · [근거](https://blog.cloudflare.com/introducing-ai-crawl-control/)) |
| [[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]] | 활용 | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 도입 범위를 정할 때 실제 업무 결과를 평가한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)) |
| [[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]] | 활용 | [[Knowledge/AI Systems/AI Governance|AI 거버넌스]] | 업무 도입·운영 책임에 AI 위험 관리 체계를 결합한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)) |
| [[Knowledge/AI Systems/Enterprise AI Operating Model|기업 AI 운영 모델]] | 활용 | [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]] | 성과를 볼 때 사용량과 과제 성공 기준을 구분해 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/)) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 평가 | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 활용 | [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]] | 동일한 과제·시도 조건의 평가 결과를 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/)) |
| [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 활용 | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://openai.github.io/openai-agents-python/tracing/)) |
| [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 활용 | [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]] | 서빙 성능을 지연 분포와 처리량으로 비교한다. (해석; [근거](https://docs.vllm.ai/en/latest/) · [근거](https://prometheus.io/docs/practices/histograms/)) |
| [[Knowledge/AI Systems/AI Medical Imaging|AI 의료 영상]] | 활용 | [[Knowledge/AI Systems/AI Conformity Assessment|AI 적합성 평가]] | 의료 목적의 AI는 해당 관할·제품에 맞는 평가 경로를 확인한다. FDA와 EU 절차는 서로 동일하지 않다. (해석; [근거](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices) · [근거](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)) |
| [[Knowledge/AI Systems/AI Medical Imaging|AI 의료 영상]] | 대비 | [[Knowledge/AI Systems/AI Wellness Devices|AI 웰니스 기기]] | 임상 목적과 저위험 생활습관 지원의 목적 경계가 다르다. (해석; [근거](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices) · [근거](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)) |
| [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 관측 | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 모델 호출·도구 사용·이관으로 구성된 실행을 추적한다. (해석; [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://openai.github.io/openai-agents-python/agents/)) |
| [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 근거 제공 | [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]] | 개별 실행에서 수집한 관측을 운영 지표로 집계할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/tracing/) · [근거](https://opentelemetry.io/docs/concepts/signals/metrics/)) |
| [[Knowledge/AI Systems/Retrieval-Augmented Generation|검색 증강 생성]] | 활용 | [[Knowledge/AI Systems/AI Content Access|AI 콘텐츠 접근]] | 외부 콘텐츠를 검색할 때 제공자의 접근 조건을 확인해야 한다. (해석; [근거](https://arxiv.org/abs/2005.11401) · [근거](https://blog.cloudflare.com/introducing-ai-crawl-control/)) |
| [[Knowledge/AI Systems/AI for Scientific Discovery|과학 발견 AI]] | 대비 | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 과학적 결과의 검증과 에이전트 업무 성공의 평가는 대상·기준이 다르다. (해석; [근거](https://www.nature.com/articles/s41586-021-03819-2) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)) |
| [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] | 활용 | [[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]] | 예측 모델도 실행 자원과 요청 처리 기반 위에서 동작한다. (해석; [근거](https://arxiv.org/abs/2403.07815) · [근거](https://docs.vllm.ai/en/latest/)) |
| [[Knowledge/AI Systems/Time-Series Foundation Models|시계열 파운데이션 모델]] | 활용 | [[Knowledge/Data Systems/Aggregate Metrics|집계 지표]] | 시간 분할과 예측 평가 지표의 계산 조건을 맞춰 비교한다. (해석; [근거](https://arxiv.org/abs/2403.07815) · [근거](https://prometheus.io/docs/practices/histograms/)) |
| [[Knowledge/AI Systems/Vision-Language-Action Models|시각·언어·행동 모델]] | 활용 | [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]] | 로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다. (해석; [근거](https://arxiv.org/abs/2307.15818) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)) |
| [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]] | 활용 | [[Knowledge/AI Systems/AI Agents|AI 에이전트]] | 음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/agents/)) |
| [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]] | 활용 | [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]] | 음성 처리와 업무 실행의 단계를 추적으로 연결한다. (해석; [근거](https://openai.github.io/openai-agents-python/voice/pipeline/) · [근거](https://openai.github.io/openai-agents-python/tracing/)) |
| [[Knowledge/AI Systems/AI Wellness Devices|AI 웰니스 기기]] | 활용 | [[Knowledge/AI Systems/AI Governance|AI 거버넌스]] | 건강 지원 주장과 사용 목적을 책임 있는 운영 범위로 관리한다. (해석; [근거](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)) |
| [[Knowledge/Security/Zero-Knowledge Proofs|영지식 증명]] | 근거 제공 | [[Knowledge/AI Systems/AI Governance|AI 거버넌스]] | 원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다. (해석; [근거](https://csrc.nist.gov/glossary/term/zero_knowledge_proof) · [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)) |
