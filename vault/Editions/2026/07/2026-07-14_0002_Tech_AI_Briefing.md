---
title: Tech & AI Briefing - 00:02
time: 00:02
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-14
timezone: Asia/Seoul
coverage_start: 2026-07-13T16:02:25+09:00
coverage_end: 2026-07-14T00:02:49+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가
article_records:
  - title: Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI의 Codex GitHub 저장소
      when: 2026-07-13T19:49:55+09:00
      where: GitHub
      what: Codex 0.145.0-alpha.7 시험판 공개
      how: 고급 추론 선택 경고와 다중 에이전트 모델 지정·호환성 검사 변경
      why: 고급 추론의 우발적 선택 방지
    lead: OpenAI는 7월 13일 19시 49분(한국시각) GitHub에 Codex 0.145.0-alpha.7 시험판을 공개했다. 공식
      변경 자료에는 Max·Ultra 추론 선택 경고와 다중 에이전트의 모델·추론 수준 지정 기능이 담겼다. 현재 다중 에이전트 백엔드와
      맞지 않는 모델은 선택 목록에서 제외하고 실행 요청도 거부한다.
    explanations:
      - heading: Max·Ultra 선택과 Ultra 적용 범위
        paragraphs:
          - Max와 Ultra는 일반 추론 단계와 분리된 More reasoning… 항목에서 경고와 설명을 거쳐 고른다. 공식 변경
            설명은 두 수준이 일반 추론보다 사용 한도를 더 빨리 소모한다고 명시했다.
          - 단축키가 고급 단계로 조용히 넘어가지 않도록 했다. Ultra는 현재 대화에 적용해 새 대화의 기본값을 바꾸지 않으며,
            모드 전환과 대화 재개에서도 설정을 유지한다.
        source_urls:
          - https://api.github.com/repos/openai/codex/compare/rust-v0.145.0-alpha.4...rust-v0.145.0-alpha.7
      - heading: 에이전트별 모델 지정과 허용 조건
        paragraphs:
          - 다중 에이전트 v2의 spawn_agent는 기본 설정에서 model과 reasoning_effort를 노출한다.
            features.multi_agent_v2.expose_spawn_agent_model_overrides 설정으로 이
            기능을 독립적으로 끌 수 있으며, 다른 spawn 메타정보가 숨겨져도 모델 지정 기능은 유지된다.
          - 모델과 추론 수준을 지정할 때는 명시적 허가와 부분 문맥 또는 문맥 없는 fork에서 사용하라는 지침이 적용된다.
          - 호환성 검사는 현재 다중 에이전트 백엔드를 기준으로 한다. 오류 메시지의 대안 제안도 선택기에 표시되는 호환 모델로
            제한한다.
        source_urls:
          - https://api.github.com/repos/openai/codex/compare/rust-v0.145.0-alpha.4...rust-v0.145.0-alpha.7
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가
    event_id: 661912ab39baa4f1
    review_status: verified
    published_at: 2026-07-13
    reviewed_at: 2026-10-05
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-13T10:49:55Z
---

# 이번 호 표지

Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가

# 차례

- Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가

# 커버 스토리

없음

# 뉴스 데스크

## Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

OpenAI는 7월 13일 19시 49분(한국시각) GitHub에 Codex 0.145.0-alpha.7 시험판을 공개했다. 공식 변경 자료에는 Max·Ultra 추론 선택 경고와 다중 에이전트의 모델·추론 수준 지정 기능이 담겼다. 현재 다중 에이전트 백엔드와 맞지 않는 모델은 선택 목록에서 제외하고 실행 요청도 거부한다. [S1] [S2]

### Max·Ultra 선택과 Ultra 적용 범위

Max와 Ultra는 일반 추론 단계와 분리된 More reasoning… 항목에서 경고와 설명을 거쳐 고른다. 공식 변경 설명은 두 수준이 일반 추론보다 사용 한도를 더 빨리 소모한다고 명시했다.

단축키가 고급 단계로 조용히 넘어가지 않도록 했다. Ultra는 현재 대화에 적용해 새 대화의 기본값을 바꾸지 않으며, 모드 전환과 대화 재개에서도 설정을 유지한다. [S1]

### 에이전트별 모델 지정과 허용 조건

다중 에이전트 v2의 spawn_agent는 기본 설정에서 model과 reasoning_effort를 노출한다. features.multi_agent_v2.expose_spawn_agent_model_overrides 설정으로 이 기능을 독립적으로 끌 수 있으며, 다른 spawn 메타정보가 숨겨져도 모델 지정 기능은 유지된다.

모델과 추론 수준을 지정할 때는 명시적 허가와 부분 문맥 또는 문맥 없는 fork에서 사용하라는 지침이 적용된다.

호환성 검사는 현재 다중 에이전트 백엔드를 기준으로 한다. 오류 메시지의 대안 제안도 선택기에 표시되는 호환 모델로 제한한다. [S1]

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

- [S1] https://api.github.com/repos/openai/codex/compare/rust-v0.145.0-alpha.4...rust-v0.145.0-alpha.7
- [S2] https://api.github.com/repos/openai/codex/releases/tags/rust-v0.145.0-alpha.7
