---
title: Tech & AI Briefing - 06:02
time: 06:02
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-06-29
timezone: Asia/Seoul
coverage_start: 2026-06-29T00:05:57+09:00
coverage_end: 2026-06-29T06:02:21+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 8
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Governance and Conformity Assessment|AI
    Governance and Conformity Assessment]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - Knowledge/Research Methods/High Performance Linpack
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Suno Spark, 독립 아티스트 지원…참여 조건도 보도
  - LineShine, TOP500 1위…CPU로 HPL 2.198 엑사플롭/초
  - Ford, 숙련 엔지니어 350명 채용…AI 품질관리 보완
article_records:
  - title: Suno Spark, 독립 아티스트 지원…참여 조건도 보도
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-29
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: The Verge는 2026년 6월 29일(한국시간) Suno의 독립 아티스트 지원 프로그램 Spark와 참여 조건을 보도했다.
      Suno가 6월 25일 발표한 프로그램은 창작 지원금·멘토링·마케팅 지원을 제공한다.
    explanations:
      - heading: 신청 대상과 지원 구성
        paragraphs:
          - 신청 대상은 만 18세 이상이며, 자기 이름으로 음악을 발표하는 미계약 독립 가수·작곡가·프로듀서다.
          - 선발된 아티스트에게 창작 지원금과 별도 마케팅 자금을 제공하고, 기존 아티스트와 협업하는 작곡 캠프 및 제품 피드백 기회를
            마련한다. Suno는 작품의 창작 통제권과 상업적 권리를 아티스트가 유지한다고 설명했다.
        source_urls:
          - https://suno.com/blog/introducing-spark
      - heading: 보도가 다룬 참여 약관
        paragraphs:
          - The Verge는 참가자가 Suno에서 노래를 리믹스할 수 있도록 하고, 파생 작품 제작을 포함한 사용권과 일부 독점권을
            허용하는 조건을 보도했다. 재판·집단소송 참여 권리 포기 조항도 언급했다.
          - 같은 보도는 Suno에 대한 부정적 발언을 제한하고, 회사가 참가자 콘텐츠의 수정·삭제를 요구할 수 있는 조건을 소개했다.
            이를 위반하면 프로그램에서 제외될 수 있다는 설명이다.
        source_urls:
          - https://www.theverge.com/ai-artificial-intelligence/958801/suno-launches-spark-incubator-program-to-feed-independent-artists-to-its-ai-machine
    papers: []
    relations: []
    topic_ids: []
  - title: LineShine, TOP500 1위…CPU로 HPL 2.198 엑사플롭/초
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-29
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: The Verge는 2026년 6월 29일(한국시간) 중국 선전의 LineShine이 TOP500 1위에 올랐다고 보도했다.
      TOP500의 6월 23일 공식 발표에서 CPU 기반 시스템의 HPL 측정 성능은 2.198 엑사플롭/초였다.
    explanations:
      - heading: CPU·연결망과 전력
        paragraphs:
          - 공식 목록은 304코어 LX2 프로세서, LingQi 연결망, Kylin 운영체제와 총 13,789,440개 코어를
            명시한다. GPU 가속기 없이 CPU로 구성한 시스템이다.
          - TOP500은 소비전력을 약 42.2메가와트, 에너지 효율을 와트당 52.07기가플롭으로 발표했다. 이론상 최대 성능
            2.736 엑사플롭/초와 HPL 측정 성능은 서로 다른 값이다.
        source_urls:
          - https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/
          - https://top500.org/lists/top500/2026/06/
      - heading: HPL이 측정하는 계산
        paragraphs:
          - HPL은 분산 메모리 컴퓨터에서 64비트 배정밀도 연산으로 밀집 선형 연립방정식을 풀고, 결과의 정확도와 계산 시간을
            측정하는 벤치마크다.
          - HPL의 공식 목록에서는 LineShine이 2.198 엑사플롭/초, 2위 El Capitan이 1.809 엑사플롭/초다.
        source_urls:
          - https://www.netlib.org/benchmark/hpl/
          - https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/
          - https://top500.org/lists/top500/2026/06/
      - heading: 혼합 정밀도 평가는 별도 순위
        paragraphs:
          - 혼합 정밀도 HPL-MxP에서는 LineShine이 7.92 엑사플롭/초로 4위이며, El Capitan이 16.7
            엑사플롭/초로 1위다. 계산 정밀도와 평가 과제가 다른 결과를 구분해 기록한다.
        source_urls:
          - https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/
          - https://top500.org/lists/top500/2026/06/
    papers: []
    relations: []
    topic_ids: []
  - title: Ford, 숙련 엔지니어 350명 채용…AI 품질관리 보완
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-29
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: TechCrunch는 2026년 6월 29일(한국시간) Ford의 숙련 엔지니어 채용을 보도했다. Bloomberg의 6월 25일
      보도에 따르면, Ford가 밝힌 채용 규모는 지난 3년간 350명이다.
    explanations:
      - heading: 채용 인력과 역할
        paragraphs:
          - Bloomberg는 채용 인력에 Ford의 전직 직원과 부품 공급사 출신 엔지니어가 포함된다고 전했다.
          - Kumar Galhotra 최고운영책임자는 부품의 생산 전 문제점을 찾는 역할이라고 설명했다. 이들은 신입교육과 AI도구
            재프로그래밍도 담당한다.
        source_urls:
          - https://news.bloomberglaw.com/tech-and-telecom-law/ford-ai-hiccups-push-carmaker-to-rehire-gray-beard-inspectors
          - https://techcrunch.com/2026/06/28/ford-rehires-gray-beard-engineers-after-ai-falls-short/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Suno Spark, 독립 아티스트 지원…참여 조건도 보도
    event_id: 13b1053481f6a8a0
    review_status: verified
    published_at: 2026-06-29
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-28T20:27:36+00:00
  - title: LineShine, TOP500 1위…CPU로 HPL 2.198 엑사플롭/초
    event_id: 642dca497b289b98
    review_status: verified
    published_at: 2026-06-29
    reviewed_at: 2026-10-09
    concept_ids:
      - high-performance-linpack
    date_kind: source-publication-time
    source_published_at: 2026-06-28T17:20:59+00:00
  - title: Ford, 숙련 엔지니어 350명 채용…AI 품질관리 보완
    event_id: 1b13fe6ad15a6b39
    review_status: verified
    published_at: 2026-06-29
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-28T19:05:39+00:00
---

# 이번 호 표지

Suno Spark, 독립 아티스트 지원…참여 조건도 보도

# 차례

- Suno Spark, 독립 아티스트 지원…참여 조건도 보도
- LineShine, TOP500 1위…CPU로 HPL 2.198 엑사플롭/초
- Ford, 숙련 엔지니어 350명 채용…AI 품질관리 보완

# 커버 스토리

없음

# 뉴스 데스크

## Suno Spark, 독립 아티스트 지원…참여 조건도 보도

**분야:** AI
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 사업 모델
**기업·기관:** Suno

The Verge는 2026년 6월 29일(한국시간) Suno의 독립 아티스트 지원 프로그램 Spark와 참여 조건을 보도했다. Suno가 6월 25일 발표한 프로그램은 창작 지원금·멘토링·마케팅 지원을 제공한다. [S1] [S2]

### 신청 대상과 지원 구성

신청 대상은 만 18세 이상이며, 자기 이름으로 음악을 발표하는 미계약 독립 가수·작곡가·프로듀서다.

선발된 아티스트에게 창작 지원금과 별도 마케팅 자금을 제공하고, 기존 아티스트와 협업하는 작곡 캠프 및 제품 피드백 기회를 마련한다. Suno는 작품의 창작 통제권과 상업적 권리를 아티스트가 유지한다고 설명했다. [S2]

### 보도가 다룬 참여 약관

The Verge는 참가자가 Suno에서 노래를 리믹스할 수 있도록 하고, 파생 작품 제작을 포함한 사용권과 일부 독점권을 허용하는 조건을 보도했다. 재판·집단소송 참여 권리 포기 조항도 언급했다.

같은 보도는 Suno에 대한 부정적 발언을 제한하고, 회사가 참가자 콘텐츠의 수정·삭제를 요구할 수 있는 조건을 소개했다. 이를 위반하면 프로그램에서 제외될 수 있다는 설명이다. [S1]

## LineShine, TOP500 1위…CPU로 HPL 2.198 엑사플롭/초

**분야:** 반도체·컴퓨팅
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 성능 개선
**기업·기관:** TOP500, National Supercomputing Centre in Shenzhen

The Verge는 2026년 6월 29일(한국시간) 중국 선전의 LineShine이 TOP500 1위에 올랐다고 보도했다. TOP500의 6월 23일 공식 발표에서 CPU 기반 시스템의 HPL 측정 성능은 2.198 엑사플롭/초였다. [S3] [S4] [S5] [S6]

### CPU·연결망과 전력

공식 목록은 304코어 LX2 프로세서, LingQi 연결망, Kylin 운영체제와 총 13,789,440개 코어를 명시한다. GPU 가속기 없이 CPU로 구성한 시스템이다.

TOP500은 소비전력을 약 42.2메가와트, 에너지 효율을 와트당 52.07기가플롭으로 발표했다. 이론상 최대 성능 2.736 엑사플롭/초와 HPL 측정 성능은 서로 다른 값이다. [S4] [S5]

### HPL이 측정하는 계산

HPL은 분산 메모리 컴퓨터에서 64비트 배정밀도 연산으로 밀집 선형 연립방정식을 풀고, 결과의 정확도와 계산 시간을 측정하는 벤치마크다.

HPL의 공식 목록에서는 LineShine이 2.198 엑사플롭/초, 2위 El Capitan이 1.809 엑사플롭/초다. [S6] [S4] [S5]

### 혼합 정밀도 평가는 별도 순위

혼합 정밀도 HPL-MxP에서는 LineShine이 7.92 엑사플롭/초로 4위이며, El Capitan이 16.7 엑사플롭/초로 1위다. 계산 정밀도와 평가 과제가 다른 결과를 구분해 기록한다. [S4] [S5]

**개념:** [[Knowledge/Research Methods/High Performance Linpack]]

## Ford, 숙련 엔지니어 350명 채용…AI 품질관리 보완

**분야:** 로봇·제조
**테마:** 인력·조직
**보조 테마:** 없음
**세부 태그:** 채용 확대, 교육·훈련
**기업·기관:** Ford

TechCrunch는 2026년 6월 29일(한국시간) Ford의 숙련 엔지니어 채용을 보도했다. Bloomberg의 6월 25일 보도에 따르면, Ford가 밝힌 채용 규모는 지난 3년간 350명이다. [S7] [S8]

### 채용 인력과 역할

Bloomberg는 채용 인력에 Ford의 전직 직원과 부품 공급사 출신 엔지니어가 포함된다고 전했다.

Kumar Galhotra 최고운영책임자는 부품의 생산 전 문제점을 찾는 역할이라고 설명했다. 이들은 신입교육과 AI도구 재프로그래밍도 담당한다. [S8] [S7]

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

- [S1] https://www.theverge.com/ai-artificial-intelligence/958801/suno-launches-spark-incubator-program-to-feed-independent-artists-to-its-ai-machine
- [S2] https://suno.com/blog/introducing-spark
- [S3] https://www.theverge.com/tech/958768/china-claims-the-worlds-fastest-supercomputer
- [S4] https://top500.org/news/lineshine-debuts-no-1-top500-enters-new-global-exascale-era/
- [S5] https://top500.org/lists/top500/2026/06/
- [S6] https://www.netlib.org/benchmark/hpl/
- [S7] https://techcrunch.com/2026/06/28/ford-rehires-gray-beard-engineers-after-ai-falls-short/
- [S8] https://news.bloomberglaw.com/tech-and-telecom-law/ford-ai-hiccups-push-carmaker-to-rehire-gray-beard-inspectors
