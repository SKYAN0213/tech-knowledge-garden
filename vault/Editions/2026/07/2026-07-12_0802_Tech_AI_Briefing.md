---
title: Tech & AI Briefing - 08:02
time: 08:02
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-12
timezone: Asia/Seoul
coverage_start: 2026-07-12T00:03:59+09:00
coverage_end: 2026-07-12T08:02:30+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - Knowledge/AI Systems/Prompt Caching
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정
article_records:
  - title: Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: "@ai-sdk/groq"
      when: 2026-07-11T20:21:42Z
      where: 미기재
      what: 프롬프트 캐시 읽기 반영을 위한 4.0.8 및 3.0.51 버전 패치 릴리스
      how: convertGroqUsage의 cached_tokens 미반영 버그 수정 및 Groq 암시적 캐싱의
        usage.cachedInputTokens 매핑
      why: 캐시 히트가 noCache로 잘못 계산되는 문제 해결
    lead: Vercel AI SDK의 Groq 연동 패키지 @ai-sdk/groq가 한국시간 7월 12일 4.0.8과 3.0.51 패치 버전을
      GitHub에 공개했다. 두 버전은 캐시에서 읽은 입력 토큰이 일반 입력 토큰과 구분되지 않던 사용량 표기 오류를 수정했다.
    explanations:
      - heading: 캐시 사용량 필드의 연결
        paragraphs:
          - 기존 convertGroqUsage는 Groq 응답의 prompt_tokens_details.cached_tokens를
            전달받아도 읽지 않아 cacheRead를 undefined로 두고 입력 토큰 전체를 noCache로 기록했다. 수정 후에는
            캐시 입력 토큰을 usage.cachedInputTokens와 cacheRead에 반영하고, 그만큼을 noCache에서
            뺀다.
        source_urls:
          - https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%404.0.8
      - heading: cacheWrite 값의 처리
        paragraphs:
          - SDK 릴리스 설명에 따르면 Groq에는 캐시 생성 과금이 없어 cacheWrite는 undefined로 유지된다.
        source_urls:
          - https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%404.0.8
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정
    event_id: 18f464ca2bf3c740
    review_status: verified
    published_at: 2026-07-12
    reviewed_at: 2026-10-06
    concept_ids:
      - prompt-caching
    date_kind: source-publication-time
    source_published_at: 2026-07-11T20:21:42Z
---

# 이번 호 표지

Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정

# 차례

- Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정

# 커버 스토리

없음

# 뉴스 데스크

## Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** @ai-sdk/groq, Groq

Vercel AI SDK의 Groq 연동 패키지 @ai-sdk/groq가 한국시간 7월 12일 4.0.8과 3.0.51 패치 버전을 GitHub에 공개했다. 두 버전은 캐시에서 읽은 입력 토큰이 일반 입력 토큰과 구분되지 않던 사용량 표기 오류를 수정했다. [S1] [S2]

### 캐시 사용량 필드의 연결

기존 convertGroqUsage는 Groq 응답의 prompt_tokens_details.cached_tokens를 전달받아도 읽지 않아 cacheRead를 undefined로 두고 입력 토큰 전체를 noCache로 기록했다. 수정 후에는 캐시 입력 토큰을 usage.cachedInputTokens와 cacheRead에 반영하고, 그만큼을 noCache에서 뺀다. [S1]

### cacheWrite 값의 처리

SDK 릴리스 설명에 따르면 Groq에는 캐시 생성 과금이 없어 cacheWrite는 undefined로 유지된다. [S1]

**개념:** [[Knowledge/AI Systems/Prompt Caching]]

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

- [S1] https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%404.0.8
- [S2] https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%403.0.51
