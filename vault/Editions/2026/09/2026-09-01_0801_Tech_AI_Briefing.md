---
title: 2026-09-01 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-01
timezone: Asia/Seoul
coverage_start: 2026-08-31T08:01:30+09:00
coverage_end: 2026-09-01T08:01:37+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 2
linked_knowledge_notes: []
knowledge_notes_created:
  - "[[Knowledge/AI Systems/Time-Series Foundation Models|Time-Series Foundation
    Models]]"
knowledge_notes_updated:
  - "[[Knowledge/AI Systems/AI Content Access|AI Content Access]]"
headlines:
  - Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개
  - Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대
article_records:
  - title: Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google Research
      when: 2026-08-31
      where: 미기재
      what: TimesFM-3 공개
      how: 여러 목표 시계열과 과거·미래에 알려진 변수를 입력으로 처리하는 다변량 예측
      why: 미기재
    lead: Google Research는 8월 31일 3억 3천만 매개변수의 다변량 시계열 예측 모델 TimesFM-3를 공개했다. 여러 목표
      시계열을 함께 예측하고, 과거에만 알 수 있는 변수와 예정 행사처럼 미래 구간에도 알려진 변수를 입력으로 받는다. 모델은
      GitHub와 Hugging Face에서 제공하며, BigQuery 통합은 발표 당시 향후 몇 주 내 제공할 계획이라고 밝혔다.
    explanations:
      - heading: 시간의 흐름과 변수 사이의 관계를 함께 처리
        paragraphs:
          - 연속된 32개 시점의 값을 패치라는 묶음으로 만들고, 크기가 다른 시계열을 다루기 위해 각 시계열을 정규화한다.
          - 시간 방향의 어텐션은 같은 시계열의 과거 토큰만 보고, 변수 방향의 어텐션은 같은 시점의 다른 시계열을 본다. 두 어텐션을
            번갈아 적용한다.
          - 미래 예측 구간에서 목표값과 과거에만 알 수 있는 변수는 가리고, 미리 알려진 미래 변수는 그대로 둔다. 전체 예측 구간은
            반복 생성하지 않고 한 번의 순전파로 계산한다.
        source_urls:
          - https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/
      - heading: 9개 분위수 출력과 공개 벤치마크 비교
        paragraphs:
          - 각 목표 시계열의 미래 시점마다 10~90백분위에 해당하는 9개 분위수를 출력한다.
          - 개발팀은 Gift-Eval·FEV-Bench·Time에서 비교한 사전학습 기반 모델 중 점 예측과 확률 예측의 평균 순위가
            가장 좋았다고 보고했다.
        source_urls:
          - https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/
    papers: []
    relations: []
    topic_ids: []
  - title: Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google
      when: 2026-08-31 업데이트
      where: 전 세계
      what: 생성형 검색 제어와 인사이트 확대
      how: Search Console의 사이트별 선택 제어와 페이지·국가·노출 정보
      why: 미기재
    lead: Google은 8월 31일 업데이트에서 Search Console의 생성형 검색 제어와 인사이트 기능을 전 세계 모든 웹사이트로
      확대했다고 밝혔다. 사이트 운영자는 자신의 콘텐츠와 링크가 AI Overviews·AI Mode 등의 응답 근거로 쓰일지 선택할 수
      있다. 인사이트에서는 생성형 AI 검색의 노출 지표, AI 응답에 나타나는 페이지, 노출 국가 정보를 확인할 수 있다.
    explanations:
      - heading: 생성형 검색에서 제외했을 때의 적용 범위
        paragraphs:
          - Google은 이 제어에서 제외한 사이트가 생성형 AI 기능의 트래픽과 노출을 받지 않는다고 밝혔다. 이 제어 자체를
            생성형 기능 밖의 일반 검색 결과 순위를 판단하는 신호로 사용하지 않는다고 설명했다.
        source_urls:
          - https://blog.google/products-and-platforms/products/search/new-controls-website-owners/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개
    event_id: 09a390c59d8969e0
    review_status: verified
    published_at: 2026-08-31
    reviewed_at: 2026-09-27
    concept_ids: []
  - title: Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대
    event_id: 89b2997d0ccfa477
    review_status: verified
    published_at: 2026-08-31
    reviewed_at: 2026-09-27
    concept_ids: []
    date_kind: dated-update
    source_published_at: 2026-06-03
---

# 이번 호 표지

Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개

# 차례

- Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개
- Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대

# 커버 스토리

없음

# 뉴스 데스크

## Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** Google

Google Research는 8월 31일 3억 3천만 매개변수의 다변량 시계열 예측 모델 TimesFM-3를 공개했다. 여러 목표 시계열을 함께 예측하고, 과거에만 알 수 있는 변수와 예정 행사처럼 미래 구간에도 알려진 변수를 입력으로 받는다. 모델은 GitHub와 Hugging Face에서 제공하며, BigQuery 통합은 발표 당시 향후 몇 주 내 제공할 계획이라고 밝혔다. [S1]

### 시간의 흐름과 변수 사이의 관계를 함께 처리

연속된 32개 시점의 값을 패치라는 묶음으로 만들고, 크기가 다른 시계열을 다루기 위해 각 시계열을 정규화한다.

시간 방향의 어텐션은 같은 시계열의 과거 토큰만 보고, 변수 방향의 어텐션은 같은 시점의 다른 시계열을 본다. 두 어텐션을 번갈아 적용한다.

미래 예측 구간에서 목표값과 과거에만 알 수 있는 변수는 가리고, 미리 알려진 미래 변수는 그대로 둔다. 전체 예측 구간은 반복 생성하지 않고 한 번의 순전파로 계산한다. [S1]

### 9개 분위수 출력과 공개 벤치마크 비교

각 목표 시계열의 미래 시점마다 10\~90백분위에 해당하는 9개 분위수를 출력한다.

개발팀은 Gift-Eval·FEV-Bench·Time에서 비교한 사전학습 기반 모델 중 점 예측과 확률 예측의 평균 순위가 가장 좋았다고 보고했다. [S1]

## Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Google

Google은 8월 31일 업데이트에서 Search Console의 생성형 검색 제어와 인사이트 기능을 전 세계 모든 웹사이트로 확대했다고 밝혔다. 사이트 운영자는 자신의 콘텐츠와 링크가 AI Overviews·AI Mode 등의 응답 근거로 쓰일지 선택할 수 있다. 인사이트에서는 생성형 AI 검색의 노출 지표, AI 응답에 나타나는 페이지, 노출 국가 정보를 확인할 수 있다. [S2]

### 생성형 검색에서 제외했을 때의 적용 범위

Google은 이 제어에서 제외한 사이트가 생성형 AI 기능의 트래픽과 노출을 받지 않는다고 밝혔다. 이 제어 자체를 생성형 기능 밖의 일반 검색 결과 순위를 판단하는 신호로 사용하지 않는다고 설명했다. [S2]

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

- [S1] https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/
- [S2] https://blog.google/products-and-platforms/products/search/new-controls-website-owners/
