---
title: Tech & AI Briefing - 08:01
time: 08:01
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-14
timezone: Asia/Seoul
coverage_start: 2026-07-14T00:02:49+09:00
coverage_end: 2026-07-14T08:01:42+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 3
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - AI SDK, 음성 전사 취소와 도구 호출 추적 수정
article_records:
  - title: AI SDK, 음성 전사 취소와 도구 호출 추적 수정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AI SDK의 ai 패키지
      when: 2026-07-14 (Asia/Seoul)
      where: 미기재
      what: ai@7.0.23·7.0.25·7.0.26 공개
      how: 음성 전사 취소 전파와 추적 문맥·상위 span 연결 수정
      why: 미기재
    lead: AI SDK의 ai 패키지는 7월 14일(한국시각) 7.0.23·7.0.25·7.0.26 패치를 공개했다. 7.0.25에서는 스트리밍
      음성 전사를 취소할 때 아직 준비 중인 doStream 작업도 중단하도록 고쳤다. 나머지 두 패치는 embedMany의 추적 문맥과
      승인 후 도구 호출의 상위 span 연결을 수정했다.
    explanations:
      - heading: "7.0.25: 음성 전사 준비 단계까지 취소"
        paragraphs:
          - experimental_streamTranscribe의 fullStream을 취소하면 아직 완료되지 않은 doStream
            준비도 중단한다. doStream이 완료되기 전에 취소한 작업이 남는 문제를 수정했다. gateway 문자열 모델 ID가
            스트리밍 전사를 지원할 수 있다는 점을 반영해 unsupported-model 오류 메시지도 바꿨다.
        source_urls:
          - https://github.com/vercel/ai/releases/tag/ai%407.0.25
      - heading: "7.0.23·7.0.26: 실행 추적 문맥 연결"
        paragraphs:
          - 7.0.23은 embedMany를 tracing channel context 안에서 처리하도록 변경했다. 7.0.26은
            도구 승인 뒤 상위 연결을 잃은 도구 호출을 parent span 아래 묶도록 했다.
        source_urls:
          - https://github.com/vercel/ai/releases/tag/ai%407.0.23
          - https://github.com/vercel/ai/releases/tag/ai%407.0.26
      - heading: 함께 갱신한 의존성
        paragraphs:
          - 7.0.23에서는 @ai-sdk/gateway를 4.0.17로 갱신했다. 7.0.25에서는
            @ai-sdk/provider-utils가 5.0.9, @ai-sdk/gateway가 4.0.19로 바뀌었다.
        source_urls:
          - https://github.com/vercel/ai/releases/tag/ai%407.0.23
          - https://github.com/vercel/ai/releases/tag/ai%407.0.25
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: AI SDK, 음성 전사 취소와 도구 호출 추적 수정
    event_id: 6c31b0895d6be835
    review_status: verified
    published_at: 2026-07-14
    reviewed_at: 2026-10-05
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-13T22:04:00Z
---

# 이번 호 표지

AI SDK, 음성 전사 취소와 도구 호출 추적 수정

# 차례

- AI SDK, 음성 전사 취소와 도구 호출 추적 수정

# 커버 스토리

없음

# 뉴스 데스크

## AI SDK, 음성 전사 취소와 도구 호출 추적 수정

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

AI SDK의 ai 패키지는 7월 14일(한국시각) 7.0.23·7.0.25·7.0.26 패치를 공개했다. 7.0.25에서는 스트리밍 음성 전사를 취소할 때 아직 준비 중인 doStream 작업도 중단하도록 고쳤다. 나머지 두 패치는 embedMany의 추적 문맥과 승인 후 도구 호출의 상위 span 연결을 수정했다. [S1] [S2] [S3]

### 7.0.25: 음성 전사 준비 단계까지 취소

experimental_streamTranscribe의 fullStream을 취소하면 아직 완료되지 않은 doStream 준비도 중단한다. doStream이 완료되기 전에 취소한 작업이 남는 문제를 수정했다. gateway 문자열 모델 ID가 스트리밍 전사를 지원할 수 있다는 점을 반영해 unsupported-model 오류 메시지도 바꿨다. [S2]

### 7.0.23·7.0.26: 실행 추적 문맥 연결

7.0.23은 embedMany를 tracing channel context 안에서 처리하도록 변경했다. 7.0.26은 도구 승인 뒤 상위 연결을 잃은 도구 호출을 parent span 아래 묶도록 했다. [S1] [S3]

### 함께 갱신한 의존성

7.0.23에서는 @ai-sdk/gateway를 4.0.17로 갱신했다. 7.0.25에서는 @ai-sdk/provider-utils가 5.0.9, @ai-sdk/gateway가 4.0.19로 바뀌었다. [S1] [S2]

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

- [S1] https://github.com/vercel/ai/releases/tag/ai%407.0.23
- [S2] https://github.com/vercel/ai/releases/tag/ai%407.0.25
- [S3] https://github.com/vercel/ai/releases/tag/ai%407.0.26
