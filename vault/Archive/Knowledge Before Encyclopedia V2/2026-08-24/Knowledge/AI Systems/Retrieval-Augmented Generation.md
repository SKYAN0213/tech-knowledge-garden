---
title: Retrieval-Augmented Generation
type: knowledge
status: evergreen
created: 2026-06-23
tags:
  - AI
  - RAG
  - KnowledgeManagement
---

# Retrieval-Augmented Generation

## 한 줄 정의

Retrieval-Augmented Generation, RAG는 AI가 외부 문서나 데이터베이스를 검색한 뒤 그 내용을 근거로 답변을 생성하는 방식입니다.

## 왜 중요한가

AI 모델은 학습 시점 이후의 최신 정보를 모를 수 있고, 세부 출처를 스스로 정확히 기억하지 못할 수 있습니다. RAG는 이 문제를 줄이기 위해 외부 지식베이스를 검색합니다.

Obsidian 기반 자동화에서는 RAG가 특히 중요합니다. 매일 브리핑으로 쌓이는 Markdown 노트가 시간이 지나면 개인 지식베이스가 되고, 새 브리핑은 이 지식베이스를 다시 참고해 중복을 줄이고 연결을 강화할 수 있습니다.

## 기본 흐름

1. 질문이나 작업 목표를 받는다.
2. 관련 문서를 검색한다.
3. 검색 결과 중 신뢰할 만한 내용을 고른다.
4. 선택한 근거를 바탕으로 답변이나 문서를 만든다.
5. 출처를 남긴다.

## 브리핑 자동화에서의 역할

| 단계 | RAG가 하는 일 |
|---|---|
| 수집 | 새 소식과 관련된 기존 지식 노트를 찾음 |
| 중복 제거 | 이미 정리한 개념인지 확인 |
| 연결 | 브리핑에서 지식 노트로 링크 |
| 업데이트 | 기존 노트에 Recent Signals 추가 |
| 검색성 강화 | 나중에 Obsidian에서 개념별로 찾아볼 수 있게 함 |

## 실패 유형

| 실패 | 설명 | 방지 방법 |
|---|---|---|
| 오래된 정보 사용 | 최신 동향인데 과거 문서만 참고 | coverage window와 날짜 확인 |
| 출처 혼합 | 서로 다른 주장을 하나처럼 요약 | 원문 링크별로 분리 |
| 과도한 일반화 | 특정 사례를 전체 트렌드로 확대 | 사례와 해석을 구분 |
| 중복 축적 | 같은 내용을 매일 새 노트로 생성 | 기존 지식 노트 업데이트 우선 |

## 이 Obsidian 구조에서의 설계

- `Briefings/`는 시간순 기록입니다.
- `Knowledge/`는 개념별 에버그린 노트입니다.
- `Knowledge Maps/`는 상위 목차입니다.

새 브리핑이 생성될 때마다 다음 규칙을 적용합니다.

1. 기존 지식 노트와 연결 가능한지 먼저 확인합니다.
2. 너무 좁은 제품명으로 노트를 만들지 않습니다.
3. 새 개념이 반복해서 등장할 때만 지식 노트로 승격합니다.
4. 각 지식 노트에는 최근 신호와 출처를 누적합니다.

## Recent Signals

- 2026-08-07 08:02 KST 브리핑: Cloudflare AI Search는 소유한 파일·웹사이트를 색인해 의미 검색과 키워드 검색을 함께 제공하고 `/search`와 `/mcp` endpoint로 여러 자료원을 묶습니다. agent용 RAG는 검색 품질뿐 아니라 crawler identity, robots 정책, 원문 인용, endpoint 인증과 예측 가능한 색인·질의 비용을 함께 관리하는 방향으로 이동하고 있습니다.
- 2026-07-17 08:01 KST 브리핑: Google Cloud는 Gemini Enterprise Agent Platform에 Parallel Web Search를 기본 웹 grounding 제공자로 통합했습니다. Gemini API와 Agent Studio에서 실시간 웹 결과와 원문 인용을 사용하고, 검색 결과를 추출·영구 저장·후처리하거나 다른 LLM으로 넘길 수 있습니다. 민감한 작업에는 zero data retention 선택지도 제공됩니다. RAG 운영은 검색 정확도뿐 아니라 데이터 보존, 재사용 권리, 제공자 선택과 과금까지 함께 설계하는 방향으로 넓어지고 있습니다.
- 2026-07-06 08:02 KST 브리핑: LangChain `langchain-mistralai==1.1.6`은 Mistral chat response의 citation metadata를 노출하는 변경을 포함했습니다. RAG와 검색 기반 답변에서는 모델이 "무슨 문서를 참고했는지"를 앱 레벨에서 표시하고 검증할 수 있는 metadata surface가 점점 중요해지고 있습니다.
- 2026-07-02 08:05 KST 브리핑: AWS는 AgentCore Memory metadata filtering을 통해 agent memory retrieval을 issue type, case status, time window 같은 metadata 조건과 결합하는 방법을 설명했습니다. RAG와 memory retrieval은 "비슷한 문서 찾기"에서 tenant, namespace, business metadata로 검색 범위를 통제하는 구조로 발전하고 있습니다.
- 2026-06-26 06:01 KST 브리핑: AWS의 data mesh 기반 agentic AI application 패턴은 RAG/agent가 여러 데이터 소스를 조회할 때 retrieval이 단순 검색이 아니라 identity, catalog, data policy, fine-grained access control과 연결되어야 함을 보여줍니다.
- 2026-06-24 07:00 KST 브리핑: Privacy-Preserving RAG via Multi-Agent Semantic Rewriting 논문은 검색된 문서를 privacy extraction, semantic analysis, reconstruction agent로 오프라인 재작성해 민감 식별자를 줄이면서 의미를 유지하는 접근을 제시했습니다. RAG 보안은 retrieval 권한뿐 아니라 검색 결과를 모델에 넘기기 전 정화하는 단계로 확장되고 있습니다.

## 연결 문서

- [[Knowledge/AI Systems/AI Agents|AI Agents]]
- [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]
- [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]

## Source Links

- https://blog.cloudflare.com/ai-search-easier/
- https://developers.googleblog.com/expanding-choice-in-gemini-enterprise-agent-platform-introducing-grounding-with-parallel-web-search/
- https://github.com/langchain-ai/langchain/releases/tag/langchain-mistralai%3D%3D1.1.6
- https://arxiv.org/abs/2606.24623
- https://aws.amazon.com/blogs/machine-learning/building-agentic-ai-applications-with-a-modern-data-mesh-strategy-on-aws/
- https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
