---
title: Tech & AI Briefing - 16:03
time: 16:03
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-06
timezone: Asia/Seoul
coverage_start: 2026-07-06T08:02:31+09:00
coverage_end: 2026-07-06T16:03:56+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 3
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정
  - Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송
  - Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정
article_records:
  - title: Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Vercel AI SDK
      when: 2026-07-06
      where: 미기재
      what: Anthropic 연동의 thinking 비활성화 설정 전달 오류 수정
      how: disabled 값을 요청에서 제거하지 않고 Anthropic Messages API로 전송
      why: 미기재
    lead: "Vercel AI SDK의 Anthropic 연동 패키지 3.0.93이 2026년 7월 6일(한국시간) 공개됐다. 생각 기능을 끄는
      thinking: { type: 'disabled' } 설정이 Anthropic API로 전달되도록 수정했다."
    explanations:
      - heading: 요청에서 사라지던 설정
        paragraphs:
          - "이전에는 providerOptions.anthropic.thinking = { type: 'disabled' } 값을
            설정해도 스키마 검사만 통과하고 전송 요청에서는 빠졌다."
          - 릴리스 문서는 생각 기능이 기본으로 켜진 모델에서 이 문제 때문에 작은 max_tokens 예산을 모두 소모할 수 있었다고
            설명한다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fanthropic%403.0.93
    papers: []
    relations: []
    topic_ids: []
  - title: Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Vercel AI SDK
      when: 2026-07-06
      where: 미기재
      what: OpenAI 채팅 요청의 인라인 이미지 전송 형식 수정
      how: base64 문자열 대신 data URL로 전송
      why: 미기재
    lead: Vercel AI SDK의 OpenAI 연동 패키지 4.0.8이 2026년 7월 6일(한국시간) 공개됐다. OpenAI 채팅 요청에
      포함된 인라인 이미지 파일을 base64 문자열 대신 data URL로 보내도록 바꿨다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Vercel AI SDK
      when: 2026-07-06
      where: 미기재
      what: Anthropic AWS 연동 패키지의 버전 번호를 2.0.0으로 정정
      how: 초기 메이저 변경 적용에 따른 버전 번호를 의도한 v2 계열에 맞춤
      why: 미기재
    lead: Vercel AI SDK가 2026년 7월 6일(한국시간) Anthropic AWS 연동 패키지 2.0.0을 공개했다. 처음
      1.0.0으로 배포된 버전 번호를 의도했던 v2 계열에 맞춰 정정한 릴리스다.
    explanations:
      - heading: 버전 번호가 달라진 경위
        paragraphs:
          - 프로젝트는 메이저 변경이 시작 버전 0.0.1에 적용되면서 1.0.0으로 공개됐다고 설명했다. 이번 메이저 버전 변경은
            의도한 v2 계열을 반영한다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fanthropic-aws%402.0.0
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정
    event_id: 830814f3f9f9f11b
    review_status: verified
    published_at: 2026-07-06
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-05T23:09:05Z
  - title: Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송
    event_id: c7b2e07cfca0bff5
    review_status: verified
    published_at: 2026-07-06
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-05T23:10:11Z
  - title: Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정
    event_id: a8d066afc8b4014f
    review_status: verified
    published_at: 2026-07-06
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T06:02:25Z
---

# 이번 호 표지

Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정

# 차례

- Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정
- Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송
- Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정

# 커버 스토리

없음

# 뉴스 데스크

## Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 오류 수정
**기업·기관:** Anthropic

Vercel AI SDK의 Anthropic 연동 패키지 3.0.93이 2026년 7월 6일(한국시간) 공개됐다. 생각 기능을 끄는 thinking: { type: 'disabled' } 설정이 Anthropic API로 전달되도록 수정했다. [S1]

### 요청에서 사라지던 설정

이전에는 providerOptions.anthropic.thinking = { type: 'disabled' } 값을 설정해도 스키마 검사만 통과하고 전송 요청에서는 빠졌다.

릴리스 문서는 생각 기능이 기본으로 켜진 모델에서 이 문제 때문에 작은 max_tokens 예산을 모두 소모할 수 있었다고 설명한다. [S1]

## Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 오류 수정
**기업·기관:** OpenAI

Vercel AI SDK의 OpenAI 연동 패키지 4.0.8이 2026년 7월 6일(한국시간) 공개됐다. OpenAI 채팅 요청에 포함된 인라인 이미지 파일을 base64 문자열 대신 data URL로 보내도록 바꿨다. [S2]



## Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 오류 수정
**기업·기관:** Vercel

Vercel AI SDK가 2026년 7월 6일(한국시간) Anthropic AWS 연동 패키지 2.0.0을 공개했다. 처음 1.0.0으로 배포된 버전 번호를 의도했던 v2 계열에 맞춰 정정한 릴리스다. [S3]

### 버전 번호가 달라진 경위

프로젝트는 메이저 변경이 시작 버전 0.0.1에 적용되면서 1.0.0으로 공개됐다고 설명했다. 이번 메이저 버전 변경은 의도한 v2 계열을 반영한다. [S3]

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

- [S1] https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fanthropic%403.0.93
- [S2] https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fopenai%404.0.8
- [S3] https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fanthropic-aws%402.0.0
