---
title: Air-Gapped Deployment
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 모델 배포 경계
concept_id: air-gapped-deployment
label: 에어갭 배포
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - Air Gapped Deployment
  - 에어갭 배포
keywords:
  - 네트워크 격리
  - 모델 배포 환경
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Security
verified_sources:
  - https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/
connections: []
map_review:
  decision: include
  kind: security
  reason: 고객의 자체 모델 운영과 비보안 네트워크로부터의 격리를 구분하는 배포 경계 개념이다.
  reviewed: 2026-10-09
---

# Air-Gapped Deployment

## 한 문장 정의

에어갭 배포는 비보안 네트워크와 완전히 분리된 환경에서 모델을 실행하는 방식이다. [NVIDIA 설명](https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 에어갭 배포 |
| 영어 | Air-Gapped Deployment |

## 범위

**포함:** 모델이 실행되는 환경의 네트워크 격리.

**포함하지 않음:** 데이터 접근 권한, 감사 기록, 모델 가중치 소유권. NVIDIA·Palantir 발표에서는 이들을 별도 운영·통제 요소로 설명한다. [원문](https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/)

## 작동 원리

Palantir 사례에서는 격리된 NVIDIA 가속 컴퓨팅에 Nemotron을 배포한다. 기관은 자체 데이터로 모델을 조정하고 그 환경에서 새 데이터·피드백을 사용한다. 데이터 권한과 감사는 Palantir 운영 계층이 담당한다. [원문](https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/)

## 혼동하기 쉬운 개념

공개 모델은 검토·조정·배포의 선택을 제공하고, 에어갭은 실행 환경의 격리를 설명한다. 공개 모델 사용 자체가 네트워크 격리를 뜻하지는 않는다. [원문](https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/)

## 최근 변화

- **2026-06-29:** NVIDIA·Palantir가 정부기관·중요 인프라용 Nemotron 격리 배포 구조를 발표했다. [기사](../../News/e32b6bfc0436d5b8.md) · [원문](https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/)

## 출처

- [NVIDIA · Palantir 격리 배포 발표](https://blogs.nvidia.com/blog/palantir-secure-ai-us-agencies-nemotron-open-models/)
