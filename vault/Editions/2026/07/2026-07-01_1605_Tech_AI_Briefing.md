---
title: Tech & AI Briefing - 16:05
time: 16:05
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-01
timezone: Asia/Seoul
coverage_start: 2026-07-01T08:05:25+09:00
coverage_end: 2026-07-01T16:05:55+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security
    and Governance]]"
  - "[[Knowledge/AI Systems/AI Governance and Conformity Assessment|AI
    Governance and Conformity Assessment]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - Knowledge/AI Systems/Safety Classifier
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - AWS, Fable 5 보호 조치 설명…Anthropic은 7월 1일 재제공 계획
article_records:
  - title: AWS, Fable 5 보호 조치 설명…Anthropic은 7월 1일 재제공 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS, Anthropic
      when: 2026-07-01
      where: 미기재
      what: Fable 5 보호 조치 설명과 재제공 계획
      how: 안전 분류기와 Opus 4.8 요청 전환
      why: 유해한 사이버보안 요청 차단
    lead: AWS는 7월 1일 한국시간 12시 13분 공개한 글에서 Anthropic과 Fable 5 보호 조치를 점검했으며, 가드레일에 걸린
      요청을 Opus 4.8로 전환한다고 설명했다. Anthropic은 앞선 6월 30일 발표에서 Fable 5·Mythos 5의 수출
      통제가 해제됐다고 밝히고, Fable 5를 7월 1일부터 Claude Platform과 Claude.ai·Claude
      Code·Claude Cowork에서 전 세계에 다시 제공할 계획을 공개했다.
    explanations:
      - heading: 안전 분류기와 요청 전환
        paragraphs:
          - Anthropic이 설명한 안전 분류기는 잠재적으로 유해한 사이버보안 입력이나 출력을 감지해 응답을 차단하는 작은 AI
            시스템이다. 회사는 Amazon이 보고한 우회 기법에 대응하도록 분류기를 개선했으며, 차단된 Fable 5 요청은
            사용자에게 알린 뒤 Opus 4.8로 보낸다고 밝혔다.
          - Anthropic이 밝힌 차단율은 Amazon 보고서의 특정 기법에 대해 99% 초과다. 회사는 새 분류기가 일반적인
            코딩·디버깅의 무해한 요청도 더 자주 걸러내며, 오탐을 줄이도록 조정할 계획이라고 설명했다.
        source_urls:
          - https://www.anthropic.com/news/redeploying-fable-5
      - heading: 제공 범위와 이용 조건
        paragraphs:
          - Anthropic의 6월 30일 계획에 따르면 AWS·Google Cloud·Microsoft Foundry의 접근은
            가능한 한 빨리 재개한다. Pro·Max·Team과 일부 Enterprise 플랜에는 7월 7일까지 주간 사용 한도의 최대
            50% 범위에서 Fable 5를 포함하고, 이후에는 사용 크레딧으로 제공할 예정이다.
          - Mythos 5는 6월 26일 정부 승인을 받은 일부 미국 조직의 접근이 복구됐다고 Anthropic이 밝혔다. 더 넓은
            Glasswing 파트너의 접근을 위한 조율은 진행 중이라고 설명했다.
        source_urls:
          - https://www.anthropic.com/news/redeploying-fable-5
      - heading: 우회 기법의 심각도와 대응 계획
        paragraphs:
          - Anthropic은 Amazon·Microsoft·Google과 Glasswing 파트너들이 함께 검토 중인 심각도 기준을
            제안했다. 평가 축은 우회로 늘어난 능력, 그 능력이 적용되는 범위, 공격에 활용하기 쉬운 정도, 우회 기법을 발견하기
            쉬운 정도다.
          - 회사는 가장 심각한 우회 기법이 확인되면 즉시 초기 완화 조치를 시작하는 방안을 제시했으며, 주요 신고 채널을 24시간
            감시할 팀을 구성 중이라고 밝혔다.
        source_urls:
          - https://www.anthropic.com/news/redeploying-fable-5
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: AWS, Fable 5 보호 조치 설명…Anthropic은 7월 1일 재제공 계획
    event_id: b3b1b85723aa6104
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-08
    concept_ids:
      - safety-classifier
    date_kind: source-publication-time
    source_published_at: 2026-06-30T19:13:19-08:00
---

# 이번 호 표지

AWS, Fable 5 보호 조치 설명…Anthropic은 7월 1일 재제공 계획

# 차례

- AWS, Fable 5 보호 조치 설명…Anthropic은 7월 1일 재제공 계획

# 커버 스토리

없음

# 뉴스 데스크

## AWS, Fable 5 보호 조치 설명…Anthropic은 7월 1일 재제공 계획

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** AWS, Anthropic

AWS는 7월 1일 한국시간 12시 13분 공개한 글에서 Anthropic과 Fable 5 보호 조치를 점검했으며, 가드레일에 걸린 요청을 Opus 4.8로 전환한다고 설명했다. Anthropic은 앞선 6월 30일 발표에서 Fable 5·Mythos 5의 수출 통제가 해제됐다고 밝히고, Fable 5를 7월 1일부터 Claude Platform과 Claude.ai·Claude Code·Claude Cowork에서 전 세계에 다시 제공할 계획을 공개했다. [S1] [S2]

### 안전 분류기와 요청 전환

Anthropic이 설명한 안전 분류기는 잠재적으로 유해한 사이버보안 입력이나 출력을 감지해 응답을 차단하는 작은 AI 시스템이다. 회사는 Amazon이 보고한 우회 기법에 대응하도록 분류기를 개선했으며, 차단된 Fable 5 요청은 사용자에게 알린 뒤 Opus 4.8로 보낸다고 밝혔다.

Anthropic이 밝힌 차단율은 Amazon 보고서의 특정 기법에 대해 99% 초과다. 회사는 새 분류기가 일반적인 코딩·디버깅의 무해한 요청도 더 자주 걸러내며, 오탐을 줄이도록 조정할 계획이라고 설명했다. [S2]

### 제공 범위와 이용 조건

Anthropic의 6월 30일 계획에 따르면 AWS·Google Cloud·Microsoft Foundry의 접근은 가능한 한 빨리 재개한다. Pro·Max·Team과 일부 Enterprise 플랜에는 7월 7일까지 주간 사용 한도의 최대 50% 범위에서 Fable 5를 포함하고, 이후에는 사용 크레딧으로 제공할 예정이다.

Mythos 5는 6월 26일 정부 승인을 받은 일부 미국 조직의 접근이 복구됐다고 Anthropic이 밝혔다. 더 넓은 Glasswing 파트너의 접근을 위한 조율은 진행 중이라고 설명했다. [S2]

### 우회 기법의 심각도와 대응 계획

Anthropic은 Amazon·Microsoft·Google과 Glasswing 파트너들이 함께 검토 중인 심각도 기준을 제안했다. 평가 축은 우회로 늘어난 능력, 그 능력이 적용되는 범위, 공격에 활용하기 쉬운 정도, 우회 기법을 발견하기 쉬운 정도다.

회사는 가장 심각한 우회 기법이 확인되면 즉시 초기 완화 조치를 시작하는 방안을 제시했으며, 주요 신고 채널을 24시간 감시할 팀을 구성 중이라고 밝혔다. [S2]

**개념:** [[Knowledge/AI Systems/Safety Classifier]]

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

- [S1] https://aws.amazon.com/blogs/machine-learning/safely-releasing-frontier-models-to-customers/
- [S2] https://www.anthropic.com/news/redeploying-fable-5
