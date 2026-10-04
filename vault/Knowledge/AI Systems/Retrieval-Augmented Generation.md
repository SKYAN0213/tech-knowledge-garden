---
title: Retrieval-Augmented Generation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-06-23
updated: 2026-10-05
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
last_reviewed: 2026-10-05
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
  reviewed: 2026-10-05
---

# Retrieval-Augmented Generation

## 한 문장 정의

외부 자료를 검색하고 검색한 내용을 생성 모델의 입력에 결합해 답변을 만드는 구성이다. [Lewis et al. 원논문 초록](https://arxiv.org/abs/2005.11401)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 검색 증강 생성 |
| 영어 | Retrieval-Augmented Generation |

## 범위

**포함:** 검색 문서를 생성 모델에 결합하는 구성.

**포함하지 않음:** 모델 가중치를 추가 학습하는 미세조정 자체. RAG와 미세조정은 함께 사용할 수 있다.

[원문](https://arxiv.org/abs/2005.11401)

## 왜 중요한가

없음

## 핵심 구성 요소

없음

## 작동 원리

원논문은 사전 학습한 시퀀스 생성 모델과 Wikipedia 문서의 벡터 색인을 결합하고, 신경망 검색기로 관련 문서를 조회한다. 검색 문서가 전체 출력에 공통으로 적용되는 구성과 토큰마다 달라질 수 있는 구성을 비교했다. [원논문 초록](https://arxiv.org/abs/2005.11401)

## 실제 예시

없음

## 한계와 실패 조건

없음

## 혼동하기 쉬운 개념

RAG는 검색과 생성을 결합하는 구조이고, 미세조정은 모델을 추가로 학습하는 방법이다. 두 개념은 서로 배타적이지 않으며 원논문도 미세조정을 포함한 학습 방법을 제안했다. 검색 문서를 붙이는 단계와 가중치를 학습하는 단계를 구분해야 한다. [원논문 초록](https://arxiv.org/abs/2005.11401)

## 관련 개념

- → 활용: [[Knowledge/AI Systems/AI Content Access|AI 콘텐츠 접근]] — 외부 콘텐츠를 검색할 때 제공자의 접근 조건을 확인해야 한다. (해석; [근거](https://arxiv.org/abs/2005.11401) · [근거](https://blog.cloudflare.com/introducing-ai-crawl-control/))

## 최근 변화

- 2020-05-22 — Lewis 등의 RAG 논문 초판이 arXiv에 제출됐다. 검색과 생성의 결합, 출력 전체와 토큰 단위의 검색 문서 적용 방식이 초록에 설명돼 있다. [원문과 제출 이력](https://arxiv.org/abs/2005.11401)

## 출처

- [Lewis et al. RAG 원논문 초록·제출 이력](https://arxiv.org/abs/2005.11401)
- [Cloudflare AI Crawl Control](https://blog.cloudflare.com/introducing-ai-crawl-control/)
