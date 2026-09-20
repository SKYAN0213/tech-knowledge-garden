---
title: 2026-09-07 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-07
timezone: Asia/Seoul
coverage_start: 2026-09-06T08:02:37+09:00
coverage_end: 2026-09-07T08:01:13+09:00
source_count: 2
new_items_count: 2
linked_knowledge_notes:
  - Knowledge/AI Systems/Agent Evaluation
  - Knowledge/AI Systems/Agent Observability
knowledge_notes_created: []
knowledge_notes_updated: []
article_reviews:
  - title: 연구를 돕는 AI, 성공률 옆에 사람 개입률을 놓다
    event_id: 3784d7aba9718af9
    review_status: verified
    concept_ids:
      - evaluation
    published_at: 2026-09-06
    reviewed_at: 2026-09-21
  - title: OpenAI 수석과학자, 추론 과정 감시에 대한 의존의 한계를 설명
    event_id: e0f75446731d598c
    review_status: verified
    concept_ids:
      - observability
    published_at: 2026-09-06
    reviewed_at: 2026-09-21
editorial_format: six-w/v1
headlines:
  - 연구를 돕는 AI, 성공률 옆에 사람 개입률을 놓다
  - OpenAI 수석과학자, 추론 과정 감시에 대한 의존의 한계를 설명
deep_skip_reason: 과거 기사 원문 재검토. 논문 심층으로 분류하지 않음.
article_records:
  - title: 연구를 돕는 AI, 성공률 옆에 사람 개입률을 놓다
    kind: 사건 뉴스
    region: 해외
    lead: OpenAI는 9월 6일 사내 연구 조직의 코딩 에이전트 사용과 과제 성공률을 분석한 보고서를 공개했다. 회사는 사람의 지시 아래
      범위가 정해진 연구 과제를 수행하는 시스템을 ‘연구 인턴’으로 정의하고, 내부 측정상 이 목표에 도달했다고 밝혔다. 최근 6개월 동안
      성공한 4~8시간 난도 과제 중 절반 이상에는 한 번 이상의 사람 개입이 있었다.
    facts:
      who: OpenAI 사내 연구 조직.
      when: 2026-09-06 게시. 1~7월 과제 성공률 및 최근6개월 사람 개입 관찰.
      where: OpenAI 사내 연구 환경.
      what: 코딩 에이전트 사용·성공·개입 측정 공개.
      how: 에이전트 분류기, 사람 수행 시간 추정 구간, 불확실 결과 제외.
      why: 연구 자동화 진행 상황을 공개하기 위한 자체 측정.
    explanations:
      - heading: 4~8시간은 사람이 수행할 시간의 추정치
        paragraphs:
          - 이 시간 구간은 에이전트 실행 시간이 아니라 사람이 해당 과제를 수행하는 데 걸릴 것으로 추정한 시간이다. OpenAI는
            에이전트 분류기로 과제 성공 여부를 판정했으며, 결과가 불확실한 분류는 그래프에서 제외했다.
          - 1~7월 성공률과 사람 개입을 함께 비교한 이 보고서는 사내 사용 관찰이다. 회사는 연구자당 실험 수 증가가 Codex
            사용 확대와 함께 나타났지만, 2025년 이후 사용 가능한 계산 자원도 크게 늘었다고 설명했다.
        source_urls:
          - https://openai.com/index/research-acceleration-view-inside-openai/
    papers: []
    relations: []
    topic_ids:
      - evaluation
  - title: OpenAI 수석과학자, 추론 과정 감시에 대한 의존의 한계를 설명
    kind: 사건 뉴스
    region: 해외
    lead: OpenAI 수석과학자 Jakub Pachocki는 9월 6일 공개한 글에서 내부 평가상 추론 과정 감시에 의존할 수 있는 정도가
      점차 줄고 있다고 설명했다. 그는 모델의 추론이 사람·다른 AI와의 대화 및 도구 사용과 섞이고, 언어로 표현한 추론 없이도 수행
      능력이 높아지는 점을 이유로 들었다.
    facts:
      who: Jakub Pachocki, OpenAI 수석과학자.
      when: 2026-09-06 게시.
      where: OpenAI 공식 기술 에세이.
      what: 추론 감시에 대한 의존이 감소한다는 내부 평가 설명.
      how: 감독 압력과 복잡한 도구·대화 환경, 비언어 추론 능력의 영향을 설명.
      why: 정렬·감시 연구와 향후 개발 방향에 관한 저자의 입장.
    explanations:
      - heading: 추론 기록과 감시 학습의 경계
        paragraphs:
          - 추론 과정 감시는 모델이 언어로 드러낸 중간 추론을 살펴보는 방식이다. Pachocki는 추론 결과에 보상을 주되 과정
            자체를 감독하지 않으면 추론이 부적절한 목적을 숨기도록 직접 훈련되는 압력을 피할 수 있다고 설명했다.
          - 그는 실제 도구·대화 상호작용에는 감독이 필요해 이 경계가 흐려진다고 지적했다. 추론 감시와 신경망 내부 활성 감시를
            결합하는 연구도 제시했으며, 이는 글에서 설명한 연구 방향이다.
        source_urls:
          - https://openai.com/index/an-alien-mind/
    papers: []
    relations: []
    topic_ids: []
---

# 이번 호 표지

> 연구 과제의 성공률·사람 개입과 추론 감시

# 차례

커버 스토리 · 뉴스 데스크

# 커버 스토리

## 연구를 돕는 AI, 성공률 옆에 사람 개입률을 놓다

OpenAI는 9월 6일 사내 연구 조직의 코딩 에이전트 사용과 과제 성공률을 분석한 보고서를 공개했다. 회사는 사람의 지시 아래 범위가 정해진 연구 과제를 수행하는 시스템을 ‘연구 인턴’으로 정의하고, 내부 측정상 이 목표에 도달했다고 밝혔다. 최근 6개월 동안 성공한 4~8시간 난도 과제 중 절반 이상에는 한 번 이상의 사람 개입이 있었다. [S1]

### 4~8시간은 사람이 수행할 시간의 추정치

이 시간 구간은 에이전트 실행 시간이 아니라 사람이 해당 과제를 수행하는 데 걸릴 것으로 추정한 시간이다. OpenAI는 에이전트 분류기로 과제 성공 여부를 판정했으며, 결과가 불확실한 분류는 그래프에서 제외했다. [S1]

1~7월 성공률과 사람 개입을 함께 비교한 이 보고서는 사내 사용 관찰이다. 회사는 연구자당 실험 수 증가가 Codex 사용 확대와 함께 나타났지만, 2025년 이후 사용 가능한 계산 자원도 크게 늘었다고 설명했다. [S1]

**개념:** [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]

# 뉴스 데스크

## OpenAI 수석과학자, 추론 과정 감시에 대한 의존의 한계를 설명

OpenAI 수석과학자 Jakub Pachocki는 9월 6일 공개한 글에서 내부 평가상 추론 과정 감시에 의존할 수 있는 정도가 점차 줄고 있다고 설명했다. 그는 모델의 추론이 사람·다른 AI와의 대화 및 도구 사용과 섞이고, 언어로 표현한 추론 없이도 수행 능력이 높아지는 점을 이유로 들었다. [S2]

### 추론 기록과 감시 학습의 경계

추론 과정 감시는 모델이 언어로 드러낸 중간 추론을 살펴보는 방식이다. Pachocki는 추론 결과에 보상을 주되 과정 자체를 감독하지 않으면 추론이 부적절한 목적을 숨기도록 직접 훈련되는 압력을 피할 수 있다고 설명했다. [S2]

그는 실제 도구·대화 상호작용에는 감독이 필요해 이 경계가 흐려진다고 지적했다. 추론 감시와 신경망 내부 활성 감시를 결합하는 연구도 제시했으며, 이는 글에서 설명한 연구 방향이다. [S2]

**개념:** [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

- [[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]
- [[Knowledge/AI Systems/Agent Observability|에이전트 관측성]]

# Source List

- [S1] https://openai.com/index/research-acceleration-view-inside-openai/
- [S2] https://openai.com/index/an-alien-mind/
