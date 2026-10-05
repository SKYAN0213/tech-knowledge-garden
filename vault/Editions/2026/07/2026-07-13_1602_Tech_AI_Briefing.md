---
title: Tech & AI Briefing - 16:02
time: 16:02
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-13
timezone: Asia/Seoul
coverage_start: 2026-07-13T08:02:28+09:00
coverage_end: 2026-07-13T16:02:25+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Codex 0.144.2, 자동 코드 리뷰 프롬프트 회귀 복구
article_records:
  - title: Codex 0.144.2, 자동 코드 리뷰 프롬프트 회귀 복구
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-07-13T13:39:22+09:00
      where: GitHub
      what: Codex 0.144.2의 자동 코드 리뷰 회귀 복구
      how: release/0.144 브랜치의 프롬프트 변경 되돌리기
      why: 프롬프트 회귀 복구
    lead: OpenAI는 7월 13일 13시 39분(한국시각) GitHub에 Codex 0.144.2를 공개했다. 이번 버전은 자동 코드 리뷰
      프롬프트의 회귀를 되돌려 이전 Guardian 리뷰 정책·요청 형식·도구 동작을 복구했다.
    explanations:
      - heading: 함께 복구한 정책·도구·테스트
        paragraphs:
          - "수정 PR #32672는 release/0.144 브랜치에서 이전 프롬프트 변경 커밋을 전체 되돌렸다. 복구 대상에는
            Guardian 정책 템플릿, 리뷰 요청 레이아웃, 도구 사양뿐 아니라 관련 테스트와 스냅샷도 포함됐다."
        source_urls:
          - https://api.github.com/repos/openai/codex/releases/tags/rust-v0.144.2
          - https://api.github.com/repos/openai/codex/pulls/32672
      - heading: 수정 병합과 릴리스
        paragraphs:
          - 수정 PR은 7월 13일 12시 13분(한국시각)에 병합됐다. PR 작성자는 Guardian 테스트 58개가 통과했다고
            보고했다.
        source_urls:
          - https://api.github.com/repos/openai/codex/pulls/32672
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Codex 0.144.2, 자동 코드 리뷰 프롬프트 회귀 복구
    event_id: b5e2211dddab87f3
    review_status: verified
    published_at: 2026-07-13
    reviewed_at: 2026-10-05
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-13T04:39:22Z
---

# 이번 호 표지

Codex 0.144.2, 자동 코드 리뷰 프롬프트 회귀 복구

# 차례

- Codex 0.144.2, 자동 코드 리뷰 프롬프트 회귀 복구

# 커버 스토리

없음

# 뉴스 데스크

## Codex 0.144.2, 자동 코드 리뷰 프롬프트 회귀 복구

**분야:** AI
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 오픈소스
**기업·기관:** 없음

OpenAI는 7월 13일 13시 39분(한국시각) GitHub에 Codex 0.144.2를 공개했다. 이번 버전은 자동 코드 리뷰 프롬프트의 회귀를 되돌려 이전 Guardian 리뷰 정책·요청 형식·도구 동작을 복구했다. [S1] [S2]

### 함께 복구한 정책·도구·테스트

수정 PR \#32672는 release/0.144 브랜치에서 이전 프롬프트 변경 커밋을 전체 되돌렸다. 복구 대상에는 Guardian 정책 템플릿, 리뷰 요청 레이아웃, 도구 사양뿐 아니라 관련 테스트와 스냅샷도 포함됐다. [S1] [S2]

### 수정 병합과 릴리스

수정 PR은 7월 13일 12시 13분(한국시각)에 병합됐다. PR 작성자는 Guardian 테스트 58개가 통과했다고 보고했다. [S2]

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

- [S1] https://api.github.com/repos/openai/codex/releases/tags/rust-v0.144.2
- [S2] https://api.github.com/repos/openai/codex/pulls/32672
