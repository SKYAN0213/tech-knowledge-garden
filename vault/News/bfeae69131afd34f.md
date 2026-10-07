---
title: AWS, 다중 턴 에이전트 강화학습의 환경·보상·평가 설계 지침 공개
type: news
schema_version: tech-news/v1
date: 2026-07-03
created: 2026-07-03
updated: 2026-07-03
event_id: bfeae69131afd34f
review_status: verified
concept_ids: []
published_at: 2026-07-03
reviewed_at: 2026-10-08
date_kind: source-publication-time
source_published_at: 2026-07-02T09:50:23-08:00
source_url: https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/
sources:
  - https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/
concepts: []
description: AWS는 2026년 7월 3일(한국시간) Amazon SageMaker AI에서 다중 턴 에이전트를 강화학습으로 훈련할
  때 적용할 설계 지침을 공개했다. SOP-Bench 사례를 바탕으로 실제 서비스와 분리한 학습 환경, 보상과 독립적인 업무 성공 평가, 학습
  중 점검할 지표를 설명했다.
theme_format: news-themes/v1
sector: AI
theme: 연구·기술
secondary_theme: null
event_tags:
  - 구현·운영 지침
entities:
  - AWS
tags:
  - sector/ai
  - theme/research
  - event/구현-운영-지침
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: AWS는 2026년 7월 3일(한국시간) Amazon SageMaker AI에서 다중 턴 에이전트를 강화학습으로 훈련할 때 적용할
  설계 지침을 공개했다. SOP-Bench 사례를 바탕으로 실제 서비스와 분리한 학습 환경, 보상과 독립적인 업무 성공 평가, 학습 중 점검할
  지표를 설명했다.
facts:
  who: AWS
  when: 2026-07-03
  where: 미기재
  what: Amazon SageMaker AI 다중 턴 강화학습 모범 사례 및 MTRL 기능 공개
  how: 신뢰성 있는 학습 환경, 외부 평가, 보상 설계, 턴 예산, 학습 지표 관리 방법 제시
  why: 미기재
explanations:
  - heading: 도구 실행을 실제 서비스와 분리
    paragraphs:
      - AWS는 실제 도구의 입력·출력 형식과 업무 로직을 유지한 시뮬레이션 또는 샌드박스 환경을 권장했다. 읽기 전용 도구는 기록한
        응답을 재생하고, 상태를 바꾸는 도구는 학습 에피소드마다 자원을 따로 만든 뒤 실패하거나 종료돼도 정리한다. 코드·SQL·수학
        결과는 격리된 환경에서 실행해 같은 입력과 상태가 같은 결과를 내도록 한다.
    source_urls:
      - https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/
  - heading: 보상 점수와 업무 성공을 따로 확인
    paragraphs:
      - SOP-Bench의 독립 평가는 final_output 태그에 담긴 최종 JSON의 모든 필드가 정답과 일치해야 성공으로
        판정한다. 학습 보상에는 부분 점수를 줄 수 있지만, 이를 업무 성공 평가와 동일하게 취급하지 않는다. SageMaker의
        MultiTurnRLEvaluator도 기본적으로 에이전트가 정의한 보상 함수로 평가하므로, 보상과 독립적인 검증을 하려면 같은
        실행 결과를 별도의 엄격한 판정기로 확인해야 한다.
    source_urls:
      - https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/
  - heading: 출력 형식 불일치가 만든 실패 사례
    paragraphs:
      - AWS가 소개한 SOP-Bench 실행에서는 보상 계산기가 final_output 대신 final_response 형식도
        받아들였다. 모델이 평가에 필요한 태그를 생략하면서 학습 보상은 올라갔지만 독립 평가 성능은 내려갔다. AWS는 이런 차이를
        발견하면 실행 과정을 읽고 보상 계산기와 평가 기준을 대조하도록 설명했다.
    source_urls:
      - https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# AWS, 다중 턴 에이전트 강화학습의 환경·보상·평가 설계 지침 공개


AWS는 2026년 7월 3일(한국시간) Amazon SageMaker AI에서 다중 턴 에이전트를 강화학습으로 훈련할 때 적용할 설계 지침을 공개했다. SOP-Bench 사례를 바탕으로 실제 서비스와 분리한 학습 환경, 보상과 독립적인 업무 성공 평가, 학습 중 점검할 지표를 설명했다. [원문 1](<https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/>)

### 도구 실행을 실제 서비스와 분리

AWS는 실제 도구의 입력·출력 형식과 업무 로직을 유지한 시뮬레이션 또는 샌드박스 환경을 권장했다. 읽기 전용 도구는 기록한 응답을 재생하고, 상태를 바꾸는 도구는 학습 에피소드마다 자원을 따로 만든 뒤 실패하거나 종료돼도 정리한다. 코드·SQL·수학 결과는 격리된 환경에서 실행해 같은 입력과 상태가 같은 결과를 내도록 한다. [원문 1](<https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/>)

### 보상 점수와 업무 성공을 따로 확인

SOP-Bench의 독립 평가는 final\_output 태그에 담긴 최종 JSON의 모든 필드가 정답과 일치해야 성공으로 판정한다. 학습 보상에는 부분 점수를 줄 수 있지만, 이를 업무 성공 평가와 동일하게 취급하지 않는다. SageMaker의 MultiTurnRLEvaluator도 기본적으로 에이전트가 정의한 보상 함수로 평가하므로, 보상과 독립적인 검증을 하려면 같은 실행 결과를 별도의 엄격한 판정기로 확인해야 한다. [원문 1](<https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/>)

### 출력 형식 불일치가 만든 실패 사례

AWS가 소개한 SOP-Bench 실행에서는 보상 계산기가 final\_output 대신 final\_response 형식도 받아들였다. 모델이 평가에 필요한 태그를 생략하면서 학습 보상은 올라갔지만 독립 평가 성능은 내려갔다. AWS는 이런 차이를 발견하면 실행 과정을 읽고 보상 계산기와 평가 기준을 대조하도록 설명했다. [원문 1](<https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-03_0805_Tech_AI_Briefing|2026-07-03 브리핑]]
