---
title: Time-Series Foundation Models
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-09-01
updated: 2026-09-27
aliases:
  - 시계열 파운데이션 모델
  - Time Series Foundation Models
parent_concepts: []
related_concepts:
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI 추론 인프라]]"
tags:
  - AI
  - Forecasting
  - TimeSeries
last_reviewed: 2026-09-27
concept_id: timeseries
label: 시계열 파운데이션 모델
group: 과학과 물리 세계
keywords:
  - 시계열
  - zero-shot
  - 공변량
  - 패치
  - 확률 예측
  - 분위수
verified_sources:
  - https://arxiv.org/abs/2403.07815
  - https://arxiv.org/html/2403.07815v3
  - https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/
  - https://prometheus.io/docs/practices/histograms/
  - https://docs.vllm.ai/en/latest/
relations:
  - target: metrics
    type: uses
    reason: 상대 오차와 분위수를 비교할 때 지표의 집계 조건을 확인한다.
    basis: inference
    evidence:
      - https://arxiv.org/abs/2403.07815
      - https://prometheus.io/docs/practices/histograms/
      - https://arxiv.org/html/2403.07815v3
  - target: inference
    type: uses
    reason: 예측 모델의 구조와 실제 추론 실행 비용을 함께 살펴본다.
    basis: inference
    evidence:
      - https://arxiv.org/abs/2403.07815
      - https://docs.vllm.ai/en/latest/
      - https://arxiv.org/html/2403.07815v3
map_review:
  decision: include
  kind: model
  reason: 시계열 사전학습과 새 데이터로의 전이가 일반적인 개별 예측 모델과 어떻게 다른지 배워야 한다.
  reviewed: 2026-09-27
---

# Time-Series Foundation Models

## 한 문장 정의

다양한 시계열에서 사전학습한 패턴을 새로운 시계열의 예측에 활용하는 모델이다. [Chronos 논문](https://arxiv.org/abs/2403.07815) · [TimesFM-3 발표](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 시계열 파운데이션 모델 |
| 영어 | Time-Series Foundation Models |
| 키워드 | zero-shot · 공변량 · 패치 · 확률 예측 · 분위수 |

## 범위

**포함:** 사전학습한 모델을 새 시계열에 적용하는 예측 방식이다. **포함하지 않음:** 특정 업무의 데이터만으로 새 예측 모델을 학습하는 작업. 사전학습한 모델을 적용하는 단계와 구분한다. Chronos의 zero-shot 예측은 해당 작업의 추가 학습 없이 수행한다. [Chronos 논문](https://arxiv.org/html/2403.07815v3)

TimesFM-3는 여러 목표 시계열뿐 아니라 과거에만 알려진 변수와 미래 구간에도 알려진 변수를 입력으로 받는다. 지원하는 입력과 예측 출력은 각 모델의 구현에 따라 확인한다. [TimesFM-3 발표](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

## 왜 중요한가

Chronos 연구진은 작업마다 학습하는 모델과 비교해, 서로 다른 이력 길이·주기·예측 구간에 사전학습 모델을 배포하는 방식을 설명한다. 새 작업의 학습 단계와 모델 실행 비용을 구분해 볼 수 있다. [Chronos 논문](https://arxiv.org/html/2403.07815v3)

## 핵심 구성 요소

- **Chronos의 입력 표현:** 관측값을 스케일링하고 양자화해 토큰으로 표현한다. 공개·합성 시계열로 사전학습한다. [Chronos 논문](https://arxiv.org/abs/2403.07815)
- **TimesFM-3의 입력 표현:** 연속된 32개 시점의 값을 패치로 묶고 시계열별로 정규화한다. 시간 방향의 과거 정보와 같은 시점의 다른 변수 정보를 다루는 어텐션을 번갈아 적용한다. [TimesFM-3 발표](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

## 작동 원리

**Chronos**는 다음 토큰을 자기회귀적으로 샘플링하고 이를 숫자로 역변환·역스케일링한다. 여러 번 샘플링해 서로 다른 미래 경로를 얻는다. [Chronos 논문](https://arxiv.org/html/2403.07815v3)

**TimesFM-3**는 미래의 목표값과 과거 변수 자리를 가리고, 미리 알려진 미래 변수는 남긴다. 전체 예측 구간을 한 번의 순전파로 채우며, 각 목표의 미래 시점마다 10~90백분위의 9개 분위수를 출력한다. [TimesFM-3 발표](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

## 실제 예시

Google의 TimesFM-3 설명은 여러 아이스크림 브랜드의 판매량을 함께 예측하는 예를 든다. 과거 방문객 수와 예정된 판촉 캠페인을 각각 과거 변수·미래에도 알려진 변수로 사용한다. 이 예는 모델 입력을 설명하는 사례다. [TimesFM-3 발표](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

## 한계와 실패 조건

Chronos의 토큰화는 표현 범위를 벗어난 관측과 양자화에 따른 정밀도 손실을 가질 수 있다. 큰 Chronos 모델의 추론 속도는 작업별 모델보다 느릴 수 있어, 생략하는 학습 비용과 실제 실행 비용을 구분한다. [Chronos 논문](https://arxiv.org/html/2403.07815v3)

## 혼동하기 쉬운 개념

- **Zero-shot 예측과 작업별 학습:** 사전학습 모델을 새 데이터에 적용하는 것과 그 작업의 데이터로 모델을 학습하는 것은 다른 단계다. [Chronos 논문](https://arxiv.org/html/2403.07815v3)
- **예측 모델과 추론 인프라:** vLLM의 PagedAttention·연속 배칭은 모델을 실행하는 메모리·요청 처리 기능이다. 이 기술 설명은 Chronos의 토큰화나 TimesFM의 예측 구조를 설명하는 자료와 구분된다. [vLLM 문서](https://docs.vllm.ai/en/latest/)

## 관련 개념

- → 활용: [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 비교에는 지표의 집계 조건도 필요하다. Chronos는 기준선 대비 상대 오차를 기하평균으로 집계하며, Prometheus의 인스턴스별 분위수 집계는 별도의 통계 조건을 가진다. (해석; [근거](https://arxiv.org/html/2403.07815v3) · [근거](https://prometheus.io/docs/practices/histograms/))
- → 활용: [[Knowledge/AI Systems/AI Inference Infrastructure#한 문장 정의|AI 추론 인프라]] — 모델의 예측 구조와 실제 실행 비용을 함께 살펴본다. (해석; [근거](https://arxiv.org/html/2403.07815v3) · [근거](https://docs.vllm.ai/en/latest/))

## 최근 변화

- 2026-08-31 — Google이 발표한 TimesFM-3는 여러 목표·과거 공변량·알려진 미래 공변량을 입력으로 지원하고 전체 예측 구간을 한 번에 생성한다. [[News/09a390c59d8969e0|발표 기사]] · [원문](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

## 출처

- [Chronos 초록](https://arxiv.org/abs/2403.07815)
- [Chronos 전문 v3](https://arxiv.org/html/2403.07815v3)
- [Google Research · TimesFM-3](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [vLLM](https://docs.vllm.ai/en/latest/)
