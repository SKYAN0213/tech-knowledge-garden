---
title: Metadata Filtering
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 검색과 기억
concept_id: metadata-filtering
label: 메타데이터 필터링
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - 메타데이터 필터링
keywords:
  - Metadata filtering
parent_concepts: []
related_concepts: []
tags:
  - AI
verified_sources:
  - https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
map_review:
  decision: include
  kind: mechanism
  reason: 구조화된 속성 조건으로 검색 범위를 좁히는 전문 방법이며 의미 유사도 검색 및 네임스페이스 격리와의 차이를 따로 배울 가치가 있다.
  reviewed: 2026-10-09
connections:
  - target: agents
    reason: AWS는 AI 에이전트의 대화 기억 검색에 메타데이터 필터를 적용해 네임스페이스 안에서 날짜·부서·우선순위 조건을 지정하는 방식을
      설명한다.
    evidence:
      - https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
---

# Metadata Filtering

## 한 문장 정의

메타데이터 필터링은 데이터에 붙은 날짜·분류·우선순위 같은 구조화된 속성의 조건으로 검색 대상을 좁히는 방법이다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

## 용어 카드

- 한국어: 메타데이터 필터링
- 영어: Metadata filtering

## 작동 원리

Amazon Bedrock AgentCore Memory는 메타데이터 조건을 먼저 적용하고, 남은 기억 레코드 안에서 벡터 유사도 검색을 수행한다. 문장의 의미가 비슷한지를 찾는 단계와 부서·기간 같은 조건을 만족하는지를 확인하는 단계가 구분된다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

이 서비스에서 필터에 사용할 속성은 인덱스 키로 등록해야 한다. 대화에서 속성을 추출해 레코드에 채우려면 해당 키가 기억 전략의 memoryRecordSchema에도 있어야 한다. 스키마에만 있는 비인덱스 속성은 레코드에서 읽을 수 있지만 필터에는 사용할 수 없다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

호출 애플리케이션이 이미 아는 값은 STRICTLY_CONSISTENT로 지정해 LLM의 재추론 없이 전달할 수 있다. 서로 다른 결정적 속성 값을 가진 기록은 추출과 통합 단계에서도 나뉜다. 이 동작은 이벤트 기반 추출 경로에 적용되며 BatchCreateMemoryRecords와 BatchUpdateMemoryRecords의 직접 기록 경로는 추출 자체를 거치지 않는다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

## 실제 예시

AgentCore Memory의 ListMemoryRecords는 의미 검색 없이도 조건에 맞는 기억 레코드를 조회한다. 의미가 가까운 문장을 찾는 대신 날짜나 분류 조건으로 레코드 목록을 얻는 방식이다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

## 혼동하기 쉬운 개념

네임스페이스는 고객·개체별 데이터 격리의 기본 경계이고, 메타데이터 필터는 그 경계 안에서 검색 대상을 세분한다. AWS는 tenant_id 필터만으로 네임스페이스 격리를 대신하지 말라고 설명한다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

## 관련 개념

- [[AI Agents]] — 에이전트가 대화 기억을 찾을 때 검색 범위를 지정하는 데 적용한다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

## 최근 변화

- 2026-07-02 — AWS가 AgentCore Memory에서 메타데이터 구성·기록·검색을 연결하는 설명을 공개했다. 날짜는 한국시간 기준이다. [AWS 설명](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)

## 출처

- [AWS: Structured memory filtering with metadata in AgentCore Memory](https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/)
