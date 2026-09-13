---
title: Retrieval-Augmented Generation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-09-13
aliases:
  - RAG
  - 검색 증강 생성
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI 에이전트]]"
  - "[[Knowledge/AI Systems/AI Content Access|AI 콘텐츠 접근]]"
tags:
  - AI
  - RAG
  - KnowledgeManagement
last_reviewed: 2026-09-13
concept_id: rag
label: 검색 증강 생성
group: 지식과 연결
keywords:
  - RAG
  - 검색기
  - 문서 색인
  - 근거
  - 생성
verified_sources:
  - https://arxiv.org/abs/2005.11401
  - https://blog.cloudflare.com/introducing-ai-crawl-control/
relations:
  - target: content-access
    type: uses
    reason: 외부 콘텐츠를 검색할 때 제공자의 접근 조건을 확인해야 한다.
    basis: inference
    evidence:
      - https://arxiv.org/abs/2005.11401
      - https://blog.cloudflare.com/introducing-ai-crawl-control/
map_review:
  decision: include
  kind: mechanism
  reason: 모델 재학습과 구별되는 검색 후 생성 방식과 근거 전달 원리를 이해해야 한다.
  reviewed: 2026-09-13
---

# Retrieval-Augmented Generation

## 한 문장 정의

질문과 관련된 외부 자료를 검색한 뒤 그 자료를 문맥으로 사용해 답변을 생성하는 방식이다. [Lewis et al. · Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 검색 증강 생성 |
| 영어 | Retrieval-Augmented Generation |
| 키워드 | RAG · 검색기 · 문서 색인 · 근거 · 생성 |

## 범위

**포함:** 검색기·문서 색인·생성 모델을 결합하는 검색-생성 경로.

**포함하지 않음:** 검색 문서가 사실이라는 보증이나 모델 파라미터의 직접 갱신.

## 왜 중요한가

모델을 다시 학습시키지 않고도 실행 시 필요한 문서를 제공할 수 있다. 검색 품질과 답변의 근거 일치를 함께 관리하는 출발점이다.

## 핵심 구성 요소

- RAG
- 검색기
- 문서 색인
- 근거
- 생성

## 작동 원리

질문으로 후보 문서를 찾고 관련 근거를 생성 모델에 넣는다. 원 논문은 검색 문서가 시퀀스 전체 또는 토큰마다 달라지는 구성을 비교했다. [Lewis et al. · Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)

## 실제 예시

사내 매뉴얼에서 관련 절을 찾아 출처와 함께 답변하는 시스템.

## 한계와 실패 조건

관련 문서를 놓치거나 오래된 문서를 고르면 답변도 흔들린다. 출처를 붙였다고 문장이 근거와 일치하는 것은 아니다.

## 혼동하기 쉬운 개념

미세조정은 가중치를 바꾸고, RAG는 실행 시 참조 자료를 공급한다.

## 관련 개념

- ← 활용: [[Knowledge/AI Systems/AI Agents#한 문장 정의|AI 에이전트]] — 외부 문서를 근거로 삼는 작업에는 검색-생성 경로를 조합할 수 있다. (해석; [근거](https://openai.github.io/openai-agents-python/agents/) · [근거](https://arxiv.org/abs/2005.11401))
- → 활용: [[Knowledge/AI Systems/AI Content Access#한 문장 정의|AI 콘텐츠 접근]] — 외부 콘텐츠를 검색할 때 제공자의 접근 조건을 확인해야 한다. (해석; [근거](https://arxiv.org/abs/2005.11401) · [근거](https://blog.cloudflare.com/introducing-ai-crawl-control/))

## 최근 변화

- 2026 — 기업용 RAG는 검색 정확도뿐 아니라 데이터 보존, provider 선택, 원문 인용, 검색 결과 재사용 권한까지 운영 범위로 넓어졌습니다.

## 출처

- [Lewis et al. · Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)
- [Cloudflare · AI Crawl Control](https://blog.cloudflare.com/introducing-ai-crawl-control/)
