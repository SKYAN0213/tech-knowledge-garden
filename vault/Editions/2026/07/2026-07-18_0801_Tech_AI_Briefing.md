---
title: 2026-07-18 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-07-18
timezone: Asia/Seoul
coverage_start: null
coverage_end: null
historical_coverage: unrecorded/v1
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 2
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - OpenAI, AI 비용 평가에 성공 업무당 총비용 제안
  - GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공
article_records:
  - title: OpenAI, AI 비용 평가에 성공 업무당 총비용 제안
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-07-17
      where: 미기재
      what: 완료 업무·성공 업무당 비용·신뢰성·사용 확대에 따른 가치를 함께 평가하는 틀 제안
      how: 전체 비용을 품질 기준을 통과한 업무 수로 나누고 결과 상태와 같은 업무의 변화 추적
      why: 미기재
    lead: OpenAI는 7월 17일 AI가 끝낸 유용한 업무와 비용을 함께 평가하는 Useful Intelligence per Dollar를
      제안했다. Sarah Friar가 쓴 기고문은 토큰 단가에 더해 사람의 검토·재시도·재작업 비용과 결과 품질을 함께 살피는 기준을
      설명한다.
    explanations:
      - heading: 전체 비용을 성공한 업무 수로 나눈다
        paragraphs:
          - 계산은 업무를 수행하는 데 들어간 전체 비용을 합산하고, 요구한 품질 기준을 충족한 업무 수로 나누는 방식이다. 직원의
            시간, 사람의 검토, 재시도와 재작업 비용도 기업의 총비용에 포함한다.
          - 기고문은 먼저 한 가지 업무에서 완료의 기준을 정하고 실제 업무 시스템에서 결과를 측정하도록 제안한다. 고객 문의 해결,
            테스트를 통과한 코드 변경, 정확하고 기한 내에 끝낸 계약 검토가 예시다.
        source_urls:
          - https://openai.com/index/a-scorecard-for-the-ai-age/
      - heading: 바로 사용·수정·사람 이관을 구분한다
        paragraphs:
          - 신뢰성은 세 가지 결과로 살핀다. 그대로 품질 기준을 충족하면 바로 사용, 재시도나 사람의 수정이 필요하면 수정 필요,
            사람이 이어받아 끝내야 하면 사람 이관으로 분류한다.
          - AI가 초안 작성에서 실제 작업 수행으로 넘어가기 전에는 접근할 데이터, 사용하거나 변경할 시스템, 사람이 검토·승인할
            시점을 정하도록 설명한다.
        source_urls:
          - https://openai.com/index/a-scorecard-for-the-ai-age/
      - heading: 같은 업무의 비용과 품질을 시간에 따라 비교한다
        paragraphs:
          - 사용 규모가 커질 때도 같은 업무를 기준으로 품질을 통과한 업무 수, 전체 비용, 성공 업무당 비용을 함께 추적하는
            방식이다. 기고문은 유용한 업무, 결과를 얻는 비용, 안심하고 사용할 수 있는 정도, 사용 확대에 따른 가치를 네 가지
            평가 축으로 구분한다.
        source_urls:
          - https://openai.com/index/a-scorecard-for-the-ai-age/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-18
      where: GitHub의 기업·조직용 Copilot 사용량 지표 REST API
      what: Copilot usage metrics REST API에 리포지토리 단위 보고 기능 추가
      how: 새로운 엔드포인트 2개 도입
      why: 코드베이스 전반에서 Copilot의 풀 리퀘스트 활동 위치 파악 지원
    lead: GitHub는 한국시간 7월 18일 Copilot 사용량 지표 REST API에 기업·조직의 저장소별 하루 활동 보고서를 추가했다.
      보고서는 Copilot coding agent의 PR 생성·병합과 Copilot code review의 검토·제안 활동을 집계한다.
    explanations:
      - heading: 조직·사용자 집계에서 저장소별 보고서로
        paragraphs:
          - 기존 지표는 조직과 사용자 단위까지만 제공됐다. 새 보고서는 특정 날짜에 어느 저장소에서 Copilot 활동이 발생했는지
            보여준다.
          - coding agent가 만든 PR과 병합된 PR, code review가 검토한 PR을 담고, 리뷰 제안 수는 댓글
            유형별로 나눠 제공한다.
        source_urls:
          - https://github.blog/changelog/2026-07-17-repository-level-github-copilot-usage-metrics-generally-available/
      - heading: 기업·조직별 API와 접근 조건
        paragraphs:
          - 기업용 경로는 GET
            /enterprises/{enterprise}/copilot/metrics/reports/repos-1-day?day=YYYY-MM-DD,
            조직용 경로는 GET
            /orgs/{org}/copilot/metrics/reports/repos-1-day?day=YYYY-MM-DD다.
            day에 지정한 하루의 저장소별 보고서를 반환한다.
          - 기업 소유자·청구 관리자, 조직 소유자, View Copilot Metrics 권한이 있는 기업·조직의 사용자 지정 역할이
            조회할 수 있다. Copilot usage metrics 정책도 활성화돼 있어야 한다.
        source_urls:
          - https://github.blog/changelog/2026-07-17-repository-level-github-copilot-usage-metrics-generally-available/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: OpenAI, AI 비용 평가에 성공 업무당 총비용 제안
    event_id: c5c5248230951857
    review_status: verified
    published_at: 2026-07-17
    reviewed_at: 2026-10-07
    concept_ids: []
  - title: GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공
    event_id: a7ef730e554338df
    review_status: verified
    published_at: 2026-07-18
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-17T15:05:18-07:00
---

# 이번 호 표지

OpenAI, AI 비용 평가에 성공 업무당 총비용 제안

# 차례

- OpenAI, AI 비용 평가에 성공 업무당 총비용 제안
- GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI, AI 비용 평가에 성공 업무당 총비용 제안

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** OpenAI

OpenAI는 7월 17일 AI가 끝낸 유용한 업무와 비용을 함께 평가하는 Useful Intelligence per Dollar를 제안했다. Sarah Friar가 쓴 기고문은 토큰 단가에 더해 사람의 검토·재시도·재작업 비용과 결과 품질을 함께 살피는 기준을 설명한다. [S1]

### 전체 비용을 성공한 업무 수로 나눈다

계산은 업무를 수행하는 데 들어간 전체 비용을 합산하고, 요구한 품질 기준을 충족한 업무 수로 나누는 방식이다. 직원의 시간, 사람의 검토, 재시도와 재작업 비용도 기업의 총비용에 포함한다.

기고문은 먼저 한 가지 업무에서 완료의 기준을 정하고 실제 업무 시스템에서 결과를 측정하도록 제안한다. 고객 문의 해결, 테스트를 통과한 코드 변경, 정확하고 기한 내에 끝낸 계약 검토가 예시다. [S1]

### 바로 사용·수정·사람 이관을 구분한다

신뢰성은 세 가지 결과로 살핀다. 그대로 품질 기준을 충족하면 바로 사용, 재시도나 사람의 수정이 필요하면 수정 필요, 사람이 이어받아 끝내야 하면 사람 이관으로 분류한다.

AI가 초안 작성에서 실제 작업 수행으로 넘어가기 전에는 접근할 데이터, 사용하거나 변경할 시스템, 사람이 검토·승인할 시점을 정하도록 설명한다. [S1]

### 같은 업무의 비용과 품질을 시간에 따라 비교한다

사용 규모가 커질 때도 같은 업무를 기준으로 품질을 통과한 업무 수, 전체 비용, 성공 업무당 비용을 함께 추적하는 방식이다. 기고문은 유용한 업무, 결과를 얻는 비용, 안심하고 사용할 수 있는 정도, 사용 확대에 따른 가치를 네 가지 평가 축으로 구분한다. [S1]

## GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 한국시간 7월 18일 Copilot 사용량 지표 REST API에 기업·조직의 저장소별 하루 활동 보고서를 추가했다. 보고서는 Copilot coding agent의 PR 생성·병합과 Copilot code review의 검토·제안 활동을 집계한다. [S2]

### 조직·사용자 집계에서 저장소별 보고서로

기존 지표는 조직과 사용자 단위까지만 제공됐다. 새 보고서는 특정 날짜에 어느 저장소에서 Copilot 활동이 발생했는지 보여준다.

coding agent가 만든 PR과 병합된 PR, code review가 검토한 PR을 담고, 리뷰 제안 수는 댓글 유형별로 나눠 제공한다. [S2]

### 기업·조직별 API와 접근 조건

기업용 경로는 GET /enterprises/{enterprise}/copilot/metrics/reports/repos-1-day?day=YYYY-MM-DD, 조직용 경로는 GET /orgs/{org}/copilot/metrics/reports/repos-1-day?day=YYYY-MM-DD다. day에 지정한 하루의 저장소별 보고서를 반환한다.

기업 소유자·청구 관리자, 조직 소유자, View Copilot Metrics 권한이 있는 기업·조직의 사용자 지정 역할이 조회할 수 있다. Copilot usage metrics 정책도 활성화돼 있어야 한다. [S2]

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

- [S1] https://openai.com/index/a-scorecard-for-the-ai-age/
- [S2] https://github.blog/changelog/2026-07-17-repository-level-github-copilot-usage-metrics-generally-available/
