---
title: Retrieval-Augmented Generation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-08-24
aliases:
  - RAG
  - 검색 증강 생성
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]"
  - "[[Knowledge/AI Systems/AI Content Access|AI Content Access]]"
tags:
  - AI
  - RAG
  - KnowledgeManagement
---

# Retrieval-Augmented Generation

## 한 문장 정의

Retrieval-Augmented Generation, RAG는 질문과 관련된 외부 자료를 먼저 검색한 뒤 그 근거를 문맥으로 넣어 답변을 생성하는 방식입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 검색 증강 생성 |
| 영어 이름 | Retrieval-Augmented Generation |
| 약어 | RAG |
| 핵심 흐름 | 검색 → 선택 → 문맥 구성 → 생성 → 근거 표시 |

## 범위

**포함:** 문서 수집·분할, 색인, 검색, 재순위화, 문맥 구성, 근거 기반 생성, 인용과 검색 평가입니다.

**포함하지 않음:** 모델 자체를 새 데이터로 재학습하는 fine-tuning, 일반 도구 연결 프로토콜인 [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]], 접근 허가 정책인 [[Knowledge/AI Systems/AI Content Access|AI Content Access]]입니다.

## 왜 중요한가

모델은 최신 정보와 조직 내부 문서를 모를 수 있고 세부 출처를 정확히 기억하지 못할 수 있습니다. RAG는 답변 시점에 근거를 가져와 최신성과 추적성을 높일 수 있지만 잘못된 검색은 잘못된 답을 더 그럴듯하게 만들 수 있습니다.

## 핵심 구성 요소

- 원문과 메타데이터
- 문서 분할과 색인
- 키워드·벡터·하이브리드 검색
- 필터와 재순위화
- 문맥 창 구성
- 근거 기반 생성과 인용
- 검색·답변 품질 평가

## 작동 원리

1. 원문을 출처·권한·날짜와 함께 색인합니다.
2. 질문을 검색 표현으로 바꾸고 후보 문서를 찾습니다.
3. 권한과 최신성을 필터링하고 관련도를 재순위화합니다.
4. 선택한 구절과 출처를 모델 문맥에 넣습니다.
5. 모델이 근거 범위 안에서 답하고 출처를 표시합니다.
6. 검색 recall과 답변 충실도를 별도로 평가합니다.

## 실제 예시

- 사내 규정 문서를 검색해 최신 조항과 링크를 포함한 답변을 만듭니다.
- 이전 브리핑과 지식 노트를 찾아 새 뉴스의 중복 여부를 확인합니다.
- 제품 매뉴얼에서 사용자 권한에 맞는 문단만 검색합니다.

## 한계와 실패 조건

- 원문이 오래되거나 잘못되면 답변도 잘못됩니다.
- 분할 단위와 검색어가 나쁘면 필요한 근거를 놓칩니다.
- 권한 필터가 검색 뒤에만 적용되면 민감정보가 노출될 수 있습니다.
- 인용이 존재해도 문장이 실제 원문을 충실히 반영한다는 보장은 없습니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| Fine-tuning | 모델 파라미터를 바꾸는 방식이고 RAG는 답변 시 외부 근거를 넣습니다. |
| [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]] | MCP는 도구 연결 규격이고 RAG는 검색 결과를 생성에 결합하는 패턴입니다. |
| 검색 엔진 | 검색 엔진은 자료를 찾고, RAG는 찾은 자료를 이용해 답변까지 생성합니다. |

## 관련 개념

- 상위: 정보 검색, 생성형 AI
- 하위: hybrid retrieval, reranking, grounded generation
- 함께 쓰임: [[Knowledge/AI Systems/AI Agents|AI Agents]], [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]], [[Knowledge/AI Systems/AI Content Access|AI Content Access]]
- 대비: 파라미터 기억만 사용하는 생성

## 최근 변화

- 2026 — 기업용 RAG는 검색 정확도뿐 아니라 데이터 보존, provider 선택, 원문 인용, 검색 결과 재사용 권한까지 운영 범위로 넓어졌습니다.

## 출처

- https://arxiv.org/abs/2005.11401
- https://blog.cloudflare.com/ai-search-easier/
- https://developers.googleblog.com/expanding-choice-in-gemini-enterprise-agent-platform-introducing-grounding-with-parallel-web-search/
- https://aws.amazon.com/blogs/machine-learning/building-agentic-ai-applications-with-a-modern-data-mesh-strategy-on-aws/
