---
title: 2026-06-29 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-06-29
timezone: Asia/Seoul
coverage_start: 2026-06-29T12:04:53+09:00
coverage_end: 2026-06-29T18:03:13+09:00
source_count: 2
new_items_count: 1
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
headlines:
  - WIRobotics, ALLEX 로봇 시뮬레이션 모델 공개
article_records:
  - title: WIRobotics, ALLEX 로봇 시뮬레이션 모델 공개
    kind: 사건 뉴스
    region: 국내
    facts:
      who: WIRobotics
      when: 2026-06-28 20:00 미국 동부시간(2026-06-29 09:00 KST)
      where: 대한민국 서울; 배포 지역 전 세계
      what: ALLEX 휴머노이드 시뮬레이션 모델과 Sim-to-Real 검증 결과 공개
      how: MuJoCo용 MJCF, Isaac Sim용 USD, ROS용 URDF 형식으로 모델 제공
      why: 물리 로봇 접근 전 외부 연구자·개발자가 제어·학습·합성 데이터 연구를 할 수 있도록 공개
    lead: WIRobotics는 6월 28일 20:00 미국 동부시간(6월 29일 09:00 KST)에 휴머노이드 ALLEX 시뮬레이션 모델과 실제 로봇을 이용한 Sim-to-Real 검증 결과를 공개했다고 발표했다. 모델은 MuJoCo용 MJCF, Isaac Sim용 USD, ROS용 URDF 형식으로 연구자·개발자가 하드웨어 없이 제어·학습·합성데이터 연구를 하도록 제공한다고 밝혔다.
    papers: []
    relations: []
    topic_ids:
      - company-wirobotics
    explanations:
      - heading: 공개 모델의 용도와 검증 범위
        paragraphs:
          - 시뮬레이션 모델은 하드웨어 접근 전 제어·학습 알고리즘을 개발하고 시험할 수 있는 입력 자료다. 세 형식은 각기 MuJoCo 동역학, ROS 기반 기구학·통합, Isaac Sim 생태계 등 서로 다른 도구 흐름을 겨냥한다.
          - 회사 발표는 높은 역구동성과 힘 투명성을 포함한 실제 로봇 특성을 시뮬레이션에 반영했다고 설명하지만, 검증과 성능 평가는 회사가 제시한 결과다. 당시 연구용 로봇의 상업적 제공은 아직 예정 단계였고, 공개 모델은 제조용 설계 자료가 아니다.
        source_urls:
          - https://www.prnewswire.com/news-releases/wirobotics-begins-building-a-physical-ai-development-ecosystem-the-first-technology-release-features-the-allex-simulation-model-302812541.html
          - https://github.com/wirobotics-rih/allex_model
article_reviews:
  - title: WIRobotics, ALLEX 로봇 시뮬레이션 모델 공개
    event_id: 5d4d3b62cb746a95
    review_status: verified
    published_at: 2026-06-28
    reviewed_at: 2026-09-30
    concept_ids: []
---

# 이번 호 표지

> [!abstract] 2026년 6월 29일 · 데일리 Tech & AI
> **한 줄 편집:** WIRobotics가 ALLEX의 연구용 시뮬레이션 모델과 실기기 검증을 공개했다.
> **취재 범위:** 2026-06-29 12:04 KST → 2026-06-29 18:03 KST
> **이번 호:** 새 항목 1건 · 원문 2개 · 새 개념 0개 · 갱신 개념 0개

# 차례

| 구역 | 내용 |
| --- | --- |
| 커버 스토리 | 없음 |
| 뉴스 데스크 | 1건 |
| 리서치 노트 | 없음 |
| 도구 상자 | 없음 |
| 흐름 읽기 | 없음 |
| 오늘의 적용 | 없음 |
| 개념 색인 | 없음 |

# 커버 스토리

없음

# 뉴스 데스크

## WIRobotics, ALLEX 로봇 시뮬레이션 모델 공개

**분야:** 로봇·제조  
**테마:** 연구·기술  
**보조 테마:** 표준·생태계  
**세부 태그:** 실증·재현, 오픈소스  
**기업·기관:** WIRobotics

WIRobotics는 6월 28일 20:00 미국 동부시간(6월 29일 09:00 KST)에 휴머노이드 ALLEX 시뮬레이션 모델과 실제 로봇을 이용한 Sim-to-Real 검증 결과를 공개했다고 발표했다. 모델은 MuJoCo용 MJCF, Isaac Sim용 USD, ROS용 URDF 형식으로 연구자·개발자가 하드웨어 없이 제어·학습·합성데이터 연구를 하도록 제공한다고 밝혔다. [S1]

### 공개 모델의 용도와 검증 범위

시뮬레이션 모델은 하드웨어 접근 전 제어·학습 알고리즘을 개발하고 시험할 수 있는 입력 자료다. 세 형식은 각기 MuJoCo 동역학, ROS 기반 기구학·통합, Isaac Sim 생태계 등 서로 다른 도구 흐름을 겨냥한다. [S1] [S2]

회사 발표는 높은 역구동성과 힘 투명성을 포함한 실제 로봇 특성을 시뮬레이션에 반영했다고 설명하지만, 검증과 성능 평가는 회사가 제시한 결과다. 당시 연구용 로봇의 상업적 제공은 아직 예정 단계였고, 공개 모델은 제조용 설계 자료가 아니다. [S1]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

없음

# Source List

- [S1] https://www.prnewswire.com/news-releases/wirobotics-begins-building-a-physical-ai-development-ecosystem-the-first-technology-release-features-the-allex-simulation-model-302812541.html
- [S2] https://github.com/wirobotics-rih/allex_model
