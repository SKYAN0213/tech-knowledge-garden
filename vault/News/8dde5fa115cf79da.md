---
title: Onur Mutlu 교수, AI 인프라의 데이터 이동을 줄이는 세 가지 설계 설명
type: news
schema_version: tech-news/v1
date: 2026-10-04
created: 2026-10-04
updated: 2026-10-04
event_id: 8dde5fa115cf79da
review_status: verified
concept_ids: []
published_at: 2026-10-02
reviewed_at: 2026-10-04
source_url: https://news.skhynix.com/en/ai-ecosystem-series-ep3/
sources:
  - https://news.skhynix.com/en/ai-ecosystem-series-ep3/
concepts: []
description: SK하이닉스 뉴스룸은 10월 2일 ETH Zurich의 Onur Mutlu 교수가 쓴 AI 인프라 아키텍처 기고를
  공개했다. 교수는 데이터의 위치와 이동 비용을 고려해 메모리 배치와 연산 구조를 함께 설계하는 ‘메모리 중심 컴퓨팅’을 설명했다.
theme_format: news-themes/v1
sector: 반도체·컴퓨팅
theme: 연구·기술
secondary_theme: null
event_tags:
  - 새로운 방법
entities:
  - Onur Mutlu
tags:
  - sector/semiconductors-computing
  - theme/research
  - event/새로운-방법
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: SK하이닉스 뉴스룸은 10월 2일 ETH Zurich의 Onur Mutlu 교수가 쓴 AI 인프라 아키텍처 기고를 공개했다. 교수는
  데이터의 위치와 이동 비용을 고려해 메모리 배치와 연산 구조를 함께 설계하는 ‘메모리 중심 컴퓨팅’을 설명했다.
facts:
  who: Onur Mutlu
  when: 2026-10-02 기고 공개
  where: 미기재
  what: AI 인프라의 메모리 중심 구조 설명
  how: 연결·근접 연산·공유 자원 배치를 구분
  why: 데이터 이동 비용을 줄이는 시스템 설계
explanations:
  - heading: CXL과 NVLink가 맡는 연결
    paragraphs:
      - 기고에서 CXL은 프로세서·가속기·메모리 장치의 연결을 넓혀 메모리 확장·공유·풀링을 지원하는 기술로 설명된다.
        NVLink·NVSwitch는 GPU 클러스터 내부의 고대역폭 연결을 제공해 모델 파라미터·활성값·KV 캐시 등의 이동을
        지원한다.
    source_urls:
      - https://news.skhynix.com/en/ai-ecosystem-series-ep3/
  - heading: 데이터 가까이에서 나누어 연산
    paragraphs:
      - 근접 메모리 가속기 구조는 메모리 안이나 주변의 가속기들이 작업을 나누는 방식이다. 교수는 전체 데이터를 중앙 연산 장치로
        보내기보다 가까운 곳에서 먼저 처리하고 필요한 결과만 교환한다고 설명했다.
    source_urls:
      - https://news.skhynix.com/en/ai-ecosystem-series-ep3/
  - heading: 워크로드에 맞춰 공유 자원 조합
    paragraphs:
      - 분리형 아키텍처는 CPU·GPU·메모리·저장장치·네트워크를 공유 자원 풀로 구성해 작업 요구에 맞춰 조합한다. 교수는 자원 배분과
        통신 비용을 함께 고려해야 하며, 통신이 과도하면 지연과 에너지 소비가 늘 수 있다고 설명했다.
    source_urls:
      - https://news.skhynix.com/en/ai-ecosystem-series-ep3/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# Onur Mutlu 교수, AI 인프라의 데이터 이동을 줄이는 세 가지 설계 설명


SK하이닉스 뉴스룸은 10월 2일 ETH Zurich의 Onur Mutlu 교수가 쓴 AI 인프라 아키텍처 기고를 공개했다. 교수는 데이터의 위치와 이동 비용을 고려해 메모리 배치와 연산 구조를 함께 설계하는 ‘메모리 중심 컴퓨팅’을 설명했다. [원문 1](<https://news.skhynix.com/en/ai-ecosystem-series-ep3/>)

### CXL과 NVLink가 맡는 연결

기고에서 CXL은 프로세서·가속기·메모리 장치의 연결을 넓혀 메모리 확장·공유·풀링을 지원하는 기술로 설명된다. NVLink·NVSwitch는 GPU 클러스터 내부의 고대역폭 연결을 제공해 모델 파라미터·활성값·KV 캐시 등의 이동을 지원한다. [원문 1](<https://news.skhynix.com/en/ai-ecosystem-series-ep3/>)

### 데이터 가까이에서 나누어 연산

근접 메모리 가속기 구조는 메모리 안이나 주변의 가속기들이 작업을 나누는 방식이다. 교수는 전체 데이터를 중앙 연산 장치로 보내기보다 가까운 곳에서 먼저 처리하고 필요한 결과만 교환한다고 설명했다. [원문 1](<https://news.skhynix.com/en/ai-ecosystem-series-ep3/>)

### 워크로드에 맞춰 공유 자원 조합

분리형 아키텍처는 CPU·GPU·메모리·저장장치·네트워크를 공유 자원 풀로 구성해 작업 요구에 맞춰 조합한다. 교수는 자원 배분과 통신 비용을 함께 고려해야 하며, 통신이 과도하면 지연과 에너지 소비가 늘 수 있다고 설명했다. [원문 1](<https://news.skhynix.com/en/ai-ecosystem-series-ep3/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/10/2026-10-04_0800_Tech_AI_Briefing|2026-10-04 브리핑]]
