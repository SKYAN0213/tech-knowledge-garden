---
title: 2026-09-08 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-08
timezone: Asia/Seoul
coverage_start: 2026-09-07T08:01:13+09:00
coverage_end: 2026-09-08T08:01:15+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 2
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated:
  - "[[Knowledge/AI Systems/AI for Scientific Discovery|AI for Scientific
    Discovery]]"
  - "[[Knowledge/AI Systems/AI Medical Imaging|AI Medical Imaging]]"
headlines:
  - Google·Cathay Pacific, 비행운 회피 2단계 시험 확대
  - 초음파 다중 프레임 AI, 외부 두 기관에서 분류 성능 평가
article_records:
  - title: Google·Cathay Pacific, 비행운 회피 2단계 시험 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google·Cathay Pacific
      when: 2026-09-07 발표
      where: 아시아·태평양 운항 구간
      what: 비행운 회피2단계 시험 확대
      how: AI·위성·기상 예측으로 고도 조정 지원
      why: 비행운 온난화 영향을 줄일 운항 가능성 평가
    lead: Google은 9월 7일 Cathay Pacific과 아시아·태평양 지역의 비행운 회피 시험을 확대한다고 발표했다. 초기 시험은
      100편 넘는 항공편을 대상으로 했고, 80편 이상이 회피 경로를 따랐다. Google은 위성 영상 분석으로 해당 항공편의 비행운
      온난화 영향이 약 40% 줄었다고 추정했으며, 더 큰 2단계 시험과 Contrails.org 협력을 진행한다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 예측을 조종석으로 전달하는 과정
        paragraphs:
          - AI 예측·위성 영상·기상 정보를 결합해 비행운이 생기기 쉬운 구역을 찾고, 운항팀이 고도를 조금 조정하도록 돕는다.
            Cathay Pacific은 기내 Wi-Fi와 전자 비행 자료 시스템으로 예보를 전달한다. 40%는 비행운 영향의 추정
            감소율이며 항공 전체 배출량 감소율이 아니다.
        source_urls:
          - https://blog.google/innovation-and-ai/models-and-research/google-research/contrail-avoidance-ultra-long-haul-flights/
  - title: 초음파 다중 프레임 AI, 외부 두 기관에서 분류 성능 평가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Haiman Guo 등 연구진
      when: 2026-09-07 논문 공개
      where: JHU 학습·내부 평가, 외부 2기관 평가
      what: 다중프레임 우상복부 초음파 모델 평가
      how: 영상과 보고서 언어를 결합한3과제 평가
      why: 진단 소견·보고서·수술 판단 보조 연구
    lead: Haiman Guo 등 연구진은 9월 7일 Nature Communications에 우상복부 초음파를 여러 프레임으로 해석하는
      시각·언어 모델 연구를 발표했다. 한 기관의 9,189건·594,099개 영상으로 구성된 코호트를 학습과 내부 평가에 쓰고, 외부 두
      기관의 1,704건과 108건으로 평가했다. 16개 소견 분류의 macro AUROC는 내부 0.820, 외부 0.794·0.775로
      보고됐다.
    explanations:
      - heading: 분류 점수와 보고서 평가의 조건
        paragraphs:
          - 모델은 영상별 정보와 보고서 언어 정보를 연결해 소견 분류, 보고서 작성, 수술 관련 판단 보조를 연구했다. 눈가림 평가는
            미편집 AI 보고서와 의사가 후편집한 AI 보고서를 서로 다른 사례 집합과 독립된 평가자 집단으로 나눠 진행했으며, 두
            결과를 구분해야 한다. 이번 결과는 후향적 자료를 바탕으로 연구진이 수행한 외부 기관 평가로, 실제 진료에서의 임상 효과를
            입증한 시험은 아니다. 연구진은 실제 진료에서의 영향을 확인하려면 전향적 임상 평가가 필요하다고 밝혔다.
        source_urls:
          - https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13646249/fullTextXML
    papers:
      - work_id: ruq-ultrasound-77498
        identifiers:
          - doi:10.1038/s41467-026-77498-w
        access: 전문
        status: 동료심사
        evidence_url: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13646249/fullTextXML
    relations: []
    topic_ids: []
article_reviews:
  - title: Google·Cathay Pacific, 비행운 회피 2단계 시험 확대
    event_id: 1908c6027b69920e
    review_status: verified
    concept_ids: []
    published_at: 2026-09-07
    reviewed_at: 2026-10-10
  - title: 초음파 다중 프레임 AI, 외부 두 기관에서 분류 성능 평가
    event_id: 6e376a02cbe3c1ab
    review_status: verified
    published_at: 2026-09-07
    reviewed_at: 2026-10-23
    concept_ids: []
source_marker_format: preserved-retrospective/v1
---

# 이번 호 표지

Google·Cathay Pacific, 비행운 회피 2단계 시험 확대

# 차례

- Google·Cathay Pacific, 비행운 회피 2단계 시험 확대
- 초음파 다중 프레임 AI, 외부 두 기관에서 분류 성능 평가

# 커버 스토리

없음

# 뉴스 데스크

## Google·Cathay Pacific, 비행운 회피 2단계 시험 확대

**분야:** 에너지·기후기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Google, Cathay Pacific

Google은 9월 7일 Cathay Pacific과 아시아·태평양 지역의 비행운 회피 시험을 확대한다고 발표했다. 초기 시험은 100편 넘는 항공편을 대상으로 했고, 80편 이상이 회피 경로를 따랐다. Google은 위성 영상 분석으로 해당 항공편의 비행운 온난화 영향이 약 40% 줄었다고 추정했으며, 더 큰 2단계 시험과 Contrails.org 협력을 진행한다. [S1]

### 예측을 조종석으로 전달하는 과정

AI 예측·위성 영상·기상 정보를 결합해 비행운이 생기기 쉬운 구역을 찾고, 운항팀이 고도를 조금 조정하도록 돕는다. Cathay Pacific은 기내 Wi-Fi와 전자 비행 자료 시스템으로 예보를 전달한다. 40%는 비행운 영향의 추정 감소율이며 항공 전체 배출량 감소율이 아니다. [S1]

## 초음파 다중 프레임 AI, 외부 두 기관에서 분류 성능 평가

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

Haiman Guo 등 연구진은 9월 7일 Nature Communications에 우상복부 초음파를 여러 프레임으로 해석하는 시각·언어 모델 연구를 발표했다. 한 기관의 9,189건·594,099개 영상으로 구성된 코호트를 학습과 내부 평가에 쓰고, 외부 두 기관의 1,704건과 108건으로 평가했다. 16개 소견 분류의 macro AUROC는 내부 0.820, 외부 0.794·0.775로 보고됐다. [S3]

### 분류 점수와 보고서 평가의 조건

모델은 영상별 정보와 보고서 언어 정보를 연결해 소견 분류, 보고서 작성, 수술 관련 판단 보조를 연구했다. 눈가림 평가는 미편집 AI 보고서와 의사가 후편집한 AI 보고서를 서로 다른 사례 집합과 독립된 평가자 집단으로 나눠 진행했으며, 두 결과를 구분해야 한다. 이번 결과는 후향적 자료를 바탕으로 연구진이 수행한 외부 기관 평가로, 실제 진료에서의 임상 효과를 입증한 시험은 아니다. 연구진은 실제 진료에서의 영향을 확인하려면 전향적 임상 평가가 필요하다고 밝혔다. [S3]

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

- [S1] https://blog.google/innovation-and-ai/models-and-research/google-research/contrail-avoidance-ultra-long-haul-flights/
- [S3] https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13646249/fullTextXML
