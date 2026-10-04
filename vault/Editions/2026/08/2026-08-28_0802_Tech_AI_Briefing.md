---
title: 2026-08-28 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-08-28
timezone: Asia/Seoul
coverage_start: 2026-08-27T08:02:22+09:00
coverage_end: 2026-08-28T08:02:09+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 6
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI for Scientific Discovery|AI for Scientific
    Discovery]]"
  - Knowledge/AI Systems/Double-Blind AI Evaluation
knowledge_notes_created: []
knowledge_notes_updated:
  - "[[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]"
  - "[[Knowledge/AI Systems/AI for Scientific Discovery|AI for Scientific
    Discovery]]"
headlines:
  - Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구
  - 보코니대·OpenAI, 학생 1,053명 실험에서 ChatGPT와 인과 추론 훈련 비교
  - Google Research, 데이터 수집·학습·예측을 잇는 지리공간 PPE 연구 공개
article_records:
  - title: Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: Google DeepMind, Singapore AI Safety Institute, OpenMined, AVERI, MLCommons
      when: 2026-08-27
      where: Google Cloud Confidential Space
      what: 비공개 모델과 비공개 벤치마크의 이중 블라인드 평가 시범 연구 발표
      how: 격리된 기밀 실행 환경에서 모델·평가 자료를 함께 실행하고 두 참여자가 코드를 승인하는 절차
      why: 평가 문제의 사전 노출과 모델 가중치 공개를 피하는 외부 평가 연구
    lead: Google DeepMind는 2026년 8월 27일 Singapore AI Safety Institute, OpenMined,
      AVERI, MLCommons와 이중 블라인드 평가 시범 연구를 발표했다. Google Cloud Confidential
      Space에서 모델과 평가 문제를 함께 실행하되, 평가자는 모델 가중치를 볼 수 없고 모델 제공자는 평가 문제를 볼 수 없도록
      구성하는 방식이다. 연구진은 Gemini 2.5 Flash Lite와 비공개 AILuminate 문제를 사용해 이 절차를 시험했다.
    explanations:
      - heading: 시험 문제와 가중치를 나눠 보호하는 절차
        paragraphs:
          - 평가 문제를 미리 접한 모델은 시험 점수가 부풀려질 수 있다. Google DeepMind는 이 벤치마크 오염과 함께,
            외부 평가자가 문제를 모델 제공자에게 넘기거나 제공자가 가중치를 평가자에게 넘겨야 했던 기밀성 문제를 연구 배경으로
            설명했다.
          - 제안한 절차에서는 두 참여자가 실행 환경이 서명한 소프트웨어 해시를 확인하고 PySyft로 코드와 비공개 자료를
            업로드한다. 양쪽이 모두 승인한 뒤 코드를 실행하며, 결과를 어느 참여자에게 보낼지도 정한다.
        source_urls:
          - https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/
          - https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
      - heading: Gemini 2.5 Flash Lite와 비공개 문제의 실제 평가
        paragraphs:
          - 실험 방법 절은 AILuminate AIRR 1.4의 예비 세트를 사용했다고 명시한다. 연구진은 이 세트가 어떤 모델도
            처리하지 않은 문제로 구성돼 있다고 설명했다.
          - 평가 환경은 Intel TDX로 호스트 메모리를 암호화하는 Google Cloud A3 Confidential VM과
            NVIDIA H100 80GB Confidential GPU였다. OpenMined PySyft v0.10.x를 사용했다.
          - 문제에는 화학·생물학·방사선·핵·폭발물 위험과 사이버공격, 혐오 발언, 자해, 폭력 범죄 유도 등이 포함됐다. AVERI가
            문제와 출력을 암호화·복호화하고, AVERI 직원이 출력을 평가했다.
        source_urls:
          - https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
      - heading: 시범 연구에서 사용한 검증 조건
        paragraphs:
          - 기술 보고서는 실제 실행 구성에 일부 독점 메서드 구현이 남아 모든 코드를 검사하거나 허용 목록으로 검증하지는 않았다고
            밝힌다. AVERI는 이 조건을 전달받고 해당 구성을 수용했다.
          - Confidential Space 운영체제의 소스와 기준값은 공개되어 있지만, 개별 빌드는 비공개 서명 키를 사용하므로
            독립적으로 재현할 수 없다고 설명했다. 인증 보고서의 서명과 검증에는 Google 서비스가 참여한다.
        source_urls:
          - https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
      - heading: 코드 검토와 다중 노드 확장 계획
        paragraphs:
          - 연구진은 시범 운영의 주요 부담을 법적 합의와 코드 검토에 필요한 절차 및 사람 사이의 조율로 설명했다. 여러
            H100/B200 노드의 기밀 클러스터로 확장하는 것은 다음 연구 단계로 제시했다.
        source_urls:
          - https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
    papers: []
    relations: []
    topic_ids: []
  - title: 보코니대·OpenAI, 학생 1,053명 실험에서 ChatGPT와 인과 추론 훈련 비교
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 보코니대학교·OpenAI 연구진
      when: 2026년 8월 27일 공개; 실험은 2025년 11월
      where: 유럽의 한 대학
      what: 인과 추론 훈련과 ChatGPT 접근을 조합한 무작위 대조 시험
      how: 전공별로 13개 수업을 네 조건에 무작위 배정하고 학생 1,053명의 자문 제안을 평가
      why: 미기재
    lead: 보코니대학교는 2026년 8월 27일 OpenAI와 협력한 연구진의 무작위 대조 시험(RCT) 결과를 공개했다. 연구진은 2025년
      11월 유럽 한 대학의 1학년 학생 1,053명이 속한 13개 수업에 인과 추론 훈련과 ChatGPT 접근을 다르게 제공하고 자문
      제안의 품질을 비교했다. ChatGPT 접근 조건에서는 제안 점수가, 인과 추론 훈련 조건에서는 아이디어 다양성이 높아졌다고
      보고했다.
    explanations:
      - heading: 네 조건으로 나눈 수업
        paragraphs:
          - 경제·경영·금융 관련 전공별로 수업을 무작위 배정했다. 조건은 인과 추론 훈련만, ChatGPT 접근만, 두 가지 모두,
            두 가지 모두 없음으로 구성했다. 무작위 배정 단위는 학생 개인이 아니라 수업이었다.
          - ChatGPT 접근 조건에서는 기관 구독의 ChatGPT Edu와 GPT-4o를 사용할 수 있었다.
        source_urls:
          - https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
      - heading: 훈련과 자문 과제
        paragraphs:
          - 훈련은 가상 도시의 정책 사례를 다룬 12개 이지선다 문항으로 구성했다. 풀이 예시와 답변별 피드백으로 인과관계, 논리,
            반증 가능성, 작동 기제를 연습했다. 대조 조건은 같은 문항을 풀었지만 예시·설명·피드백을 받지 않았다.
          - 이후 참가자들은 동문이 대학 상품을 더 잘 알고 이용하도록 하는 방안을 최대 180단어의 자문 제안으로 작성했다. 석사과정
            학생 20명 중 무작위 배정한 세 명이 각 제안의 인지도·이용 기준을 채점했고, 연구진은 그 평가의 평균을 사용했다.
        source_urls:
          - https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
      - heading: 자문 제안 점수와 논리
        paragraphs:
          - 인지도·이용을 1~5점으로 평가한 뒤 통제 변수를 반영한 회귀분석에서 ChatGPT 접근의 점수 증가 추정치는
            0.862점이었다. 같은 분석의 대조 조건 추정 점수는 2.09점이다. 이는 통제 조건을 반영한 추정치이며 참가자의 단순
            평균 점수 차이와 구분된다.
          - 인과 추론 훈련만 제공한 조건의 제안 점수 효과는 약한 음수였고, 훈련과 ChatGPT를 함께 제공할 때 더해지는 추가
            점수 효과는 통계적으로 유의하지 않았다.
          - 별도의 사고 과정 지표에서는 인과 추론 훈련이 원인 관계의 작동 기제를 설명하거나 반증 조건을 제시하는 정도를 높였다.
            일관된 논리의 향상은 주로 ChatGPT 접근 조건에서 나타났다.
        source_urls:
          - https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
      - heading: 아이디어 다양성의 두 기준
        paragraphs:
          - 연구진은 한 제안 안의 아이디어 사이 거리와 서로 다른 참가자 제안의 핵심 아이디어 사이 거리를 나눠 측정했다. 인과 추론
            훈련은 두 다양성 지표 모두에서 효과가 나타났다.
          - ChatGPT 접근은 한 제안 안의 다양성에 더 작은 양의 효과를 보였다. 참가자 사이의 다양성에서는 ChatGPT 단독
            효과가 0과 통계적으로 구분되지 않았다.
        source_urls:
          - https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
    papers:
      - work_id: novices-rct-202608
        identifiers:
          - url:https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
        access: 전문
        status: null
        evidence_url: https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
    relations: []
    topic_ids: []
  - title: Google Research, 데이터 수집·학습·예측을 잇는 지리공간 PPE 연구 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google Research, INRB 연구자
      when: 2026-08-26
      where: 미국·나이지리아·콩고민주공화국의 연구 과제
      what: Planetary Prediction Engine(PPE) 논문 최초 판본 공개
      how: 자연어 질문 기반 데이터 선택, 다중모달 데이터 구성, 모델 학습 및 예측 단계 연결
      why: 식량안보·질병 확산·지역 취약성 분석에 필요한 데이터가 여러 저장소에 흩어져 있어 수작업 부담을 줄이기 위해
    lead: Google Research와 콩고민주공화국 INRB 연구자들이 참여한 Planetary Prediction Engine(PPE)
      논문 최초 판본이 2026년 8월 26일 arXiv에 공개됐다. PPE는 자연어 질문을 받아 데이터 선택, 다중모달 데이터 구성,
      모델 학습과 예측 단계를 연결하는 연구 시스템이다. 연구팀은 미국 CDC 건강지표 예측에서 PPE의 평균 R²가 76.8%로 수동
      전문가 파이프라인의 60%보다 높다고 보고했다.
    explanations:
      - heading: 질문에서 예측 모델까지
        paragraphs:
          - PPE는 대규모 언어모델을 조정자로 사용해 사용자의 질문을 해석하고 미리 정의한 도구를 고른다. 예측 단계에서는 준비된
            학습·시험 자료를 받아 정규화 선형모델, 그래디언트 부스팅, XGBoost, 다층 퍼셉트론 계열을 비교하며 자료를 새로
            수집하거나 수정하지 않는다.
        source_urls:
          - https://arxiv.org/html/2608.26088v1
      - heading: 통계와 위성영상 특성을 함께 구성
        paragraphs:
          - 자료 선택 단계에서는 Data Commons의 통계, Google Earth Engine의 환경 자료, Google
            Maps Platform Insights의 장소 밀도와 공개 웹의 정부·학술 데이터셋을 조사한다. 이 과정에서 출처와
            라이선스, 공간·시간 적합성, 목표 신호와의 관계, 형식·품질, 중복을 평가해 자료의 우선순위를 정하고 데이터 출처와 처리
            이력을 기록한다.
          - PPE는 준비된 통계 특성과 PDFM의 인구·사회경제 임베딩, AlphaEarth의 위성영상 임베딩을 결합한다. 논문은
            PDFM과 AlphaEarth 임베딩을 해당 과제에 맞게 다시 학습하지 않고 고정된 특성 추출기로 사용했다고 설명한다.
        source_urls:
          - https://arxiv.org/html/2608.26088v1
      - heading: 목표 정보 누출 검사와 시험 조건
        paragraphs:
          - PPE의 Feature Gate는 목표값을 계산하는 구성요소, 동일 설문이나 보정모델에서 나온 정보, 예측 대상의 결과에
            해당하는 변수, 예측 시점 이후 정보를 검사해 배제하도록 설계했다. 누락값의 평균·중앙값·최빈값은 학습 자료에서만 계산해
            검증·시험 자료에 적용한다.
          - 연구팀은 미국 CDC 건강지표 예측에서 21개 지표의 평균 R²를 백분율로 표시해 PPE 76.8%, 수동 전문가
            파이프라인 60%로 보고했다. CDC와 FEMA의 공간회귀 실험은 같은 센서스 구역 수준의 자료를 80:20 무작위
            학습·시험 분할로 평가했다.
        source_urls:
          - https://arxiv.org/html/2608.26088v1
    papers:
      - work_id: ppe-2608-26088
        identifiers:
          - arxiv:2608.26088v1
        access: 전문
        status: 사전공개
        evidence_url: https://arxiv.org/html/2608.26088v1
    relations: []
    topic_ids: []
article_reviews:
  - title: Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구
    event_id: 7a7d38500197da71
    review_status: verified
    published_at: 2026-08-27
    reviewed_at: 2026-09-27
    concept_ids:
      - double-blind-ai-evaluation
  - title: 보코니대·OpenAI, 학생 1,053명 실험에서 ChatGPT와 인과 추론 훈련 비교
    event_id: de0d8b99a9cda9c5
    review_status: verified
    published_at: 2026-08-27
    reviewed_at: 2026-10-01
    concept_ids: []
  - title: Google Research, 데이터 수집·학습·예측을 잇는 지리공간 PPE 연구 공개
    event_id: 068cf5b2747d434f
    review_status: verified
    published_at: 2026-08-26
    reviewed_at: 2026-09-28
    concept_ids:
      - science
---

# 이번 호 표지

Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구

# 차례

- Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구
- 보코니대·OpenAI, 학생 1,053명 실험에서 ChatGPT와 인과 추론 훈련 비교
- Google Research, 데이터 수집·학습·예측을 잇는 지리공간 PPE 연구 공개

# 커버 스토리

없음

# 뉴스 데스크

## Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** Google DeepMind, Singapore AI Safety Institute, OpenMined, AVERI, MLCommons

Google DeepMind는 2026년 8월 27일 Singapore AI Safety Institute, OpenMined, AVERI, MLCommons와 이중 블라인드 평가 시범 연구를 발표했다. Google Cloud Confidential Space에서 모델과 평가 문제를 함께 실행하되, 평가자는 모델 가중치를 볼 수 없고 모델 제공자는 평가 문제를 볼 수 없도록 구성하는 방식이다. 연구진은 Gemini 2.5 Flash Lite와 비공개 AILuminate 문제를 사용해 이 절차를 시험했다. [S1] [S2]

### 시험 문제와 가중치를 나눠 보호하는 절차

평가 문제를 미리 접한 모델은 시험 점수가 부풀려질 수 있다. Google DeepMind는 이 벤치마크 오염과 함께, 외부 평가자가 문제를 모델 제공자에게 넘기거나 제공자가 가중치를 평가자에게 넘겨야 했던 기밀성 문제를 연구 배경으로 설명했다.

제안한 절차에서는 두 참여자가 실행 환경이 서명한 소프트웨어 해시를 확인하고 PySyft로 코드와 비공개 자료를 업로드한다. 양쪽이 모두 승인한 뒤 코드를 실행하며, 결과를 어느 참여자에게 보낼지도 정한다. [S1] [S2]

### Gemini 2.5 Flash Lite와 비공개 문제의 실제 평가

실험 방법 절은 AILuminate AIRR 1.4의 예비 세트를 사용했다고 명시한다. 연구진은 이 세트가 어떤 모델도 처리하지 않은 문제로 구성돼 있다고 설명했다.

평가 환경은 Intel TDX로 호스트 메모리를 암호화하는 Google Cloud A3 Confidential VM과 NVIDIA H100 80GB Confidential GPU였다. OpenMined PySyft v0.10.x를 사용했다.

문제에는 화학·생물학·방사선·핵·폭발물 위험과 사이버공격, 혐오 발언, 자해, 폭력 범죄 유도 등이 포함됐다. AVERI가 문제와 출력을 암호화·복호화하고, AVERI 직원이 출력을 평가했다. [S2]

### 시범 연구에서 사용한 검증 조건

기술 보고서는 실제 실행 구성에 일부 독점 메서드 구현이 남아 모든 코드를 검사하거나 허용 목록으로 검증하지는 않았다고 밝힌다. AVERI는 이 조건을 전달받고 해당 구성을 수용했다.

Confidential Space 운영체제의 소스와 기준값은 공개되어 있지만, 개별 빌드는 비공개 서명 키를 사용하므로 독립적으로 재현할 수 없다고 설명했다. 인증 보고서의 서명과 검증에는 Google 서비스가 참여한다. [S2]

### 코드 검토와 다중 노드 확장 계획

연구진은 시범 운영의 주요 부담을 법적 합의와 코드 검토에 필요한 절차 및 사람 사이의 조율로 설명했다. 여러 H100/B200 노드의 기밀 클러스터로 확장하는 것은 다음 연구 단계로 제시했다. [S2]

**개념:** [[Knowledge/AI Systems/Double-Blind AI Evaluation]]

## 보코니대·OpenAI, 학생 1,053명 실험에서 ChatGPT와 인과 추론 훈련 비교

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** Bocconi, OpenAI

보코니대학교는 2026년 8월 27일 OpenAI와 협력한 연구진의 무작위 대조 시험(RCT) 결과를 공개했다. 연구진은 2025년 11월 유럽 한 대학의 1학년 학생 1,053명이 속한 13개 수업에 인과 추론 훈련과 ChatGPT 접근을 다르게 제공하고 자문 제안의 품질을 비교했다. ChatGPT 접근 조건에서는 제안 점수가, 인과 추론 훈련 조건에서는 아이디어 다양성이 높아졌다고 보고했다. [S3] [S4]

### 네 조건으로 나눈 수업

경제·경영·금융 관련 전공별로 수업을 무작위 배정했다. 조건은 인과 추론 훈련만, ChatGPT 접근만, 두 가지 모두, 두 가지 모두 없음으로 구성했다. 무작위 배정 단위는 학생 개인이 아니라 수업이었다.

ChatGPT 접근 조건에서는 기관 구독의 ChatGPT Edu와 GPT-4o를 사용할 수 있었다. [S4]

### 훈련과 자문 과제

훈련은 가상 도시의 정책 사례를 다룬 12개 이지선다 문항으로 구성했다. 풀이 예시와 답변별 피드백으로 인과관계, 논리, 반증 가능성, 작동 기제를 연습했다. 대조 조건은 같은 문항을 풀었지만 예시·설명·피드백을 받지 않았다.

이후 참가자들은 동문이 대학 상품을 더 잘 알고 이용하도록 하는 방안을 최대 180단어의 자문 제안으로 작성했다. 석사과정 학생 20명 중 무작위 배정한 세 명이 각 제안의 인지도·이용 기준을 채점했고, 연구진은 그 평가의 평균을 사용했다. [S4]

### 자문 제안 점수와 논리

인지도·이용을 1\~5점으로 평가한 뒤 통제 변수를 반영한 회귀분석에서 ChatGPT 접근의 점수 증가 추정치는 0.862점이었다. 같은 분석의 대조 조건 추정 점수는 2.09점이다. 이는 통제 조건을 반영한 추정치이며 참가자의 단순 평균 점수 차이와 구분된다.

인과 추론 훈련만 제공한 조건의 제안 점수 효과는 약한 음수였고, 훈련과 ChatGPT를 함께 제공할 때 더해지는 추가 점수 효과는 통계적으로 유의하지 않았다.

별도의 사고 과정 지표에서는 인과 추론 훈련이 원인 관계의 작동 기제를 설명하거나 반증 조건을 제시하는 정도를 높였다. 일관된 논리의 향상은 주로 ChatGPT 접근 조건에서 나타났다. [S4]

### 아이디어 다양성의 두 기준

연구진은 한 제안 안의 아이디어 사이 거리와 서로 다른 참가자 제안의 핵심 아이디어 사이 거리를 나눠 측정했다. 인과 추론 훈련은 두 다양성 지표 모두에서 효과가 나타났다.

ChatGPT 접근은 한 제안 안의 다양성에 더 작은 양의 효과를 보였다. 참가자 사이의 다양성에서는 ChatGPT 단독 효과가 0과 통계적으로 구분되지 않았다. [S4]

## Google Research, 데이터 수집·학습·예측을 잇는 지리공간 PPE 연구 공개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 성능 개선
**기업·기관:** Google Research, INRB

Google Research와 콩고민주공화국 INRB 연구자들이 참여한 Planetary Prediction Engine(PPE) 논문 최초 판본이 2026년 8월 26일 arXiv에 공개됐다. PPE는 자연어 질문을 받아 데이터 선택, 다중모달 데이터 구성, 모델 학습과 예측 단계를 연결하는 연구 시스템이다. 연구팀은 미국 CDC 건강지표 예측에서 PPE의 평균 R²가 76.8%로 수동 전문가 파이프라인의 60%보다 높다고 보고했다. [S5] [S6]

### 질문에서 예측 모델까지

PPE는 대규모 언어모델을 조정자로 사용해 사용자의 질문을 해석하고 미리 정의한 도구를 고른다. 예측 단계에서는 준비된 학습·시험 자료를 받아 정규화 선형모델, 그래디언트 부스팅, XGBoost, 다층 퍼셉트론 계열을 비교하며 자료를 새로 수집하거나 수정하지 않는다. [S6]

### 통계와 위성영상 특성을 함께 구성

자료 선택 단계에서는 Data Commons의 통계, Google Earth Engine의 환경 자료, Google Maps Platform Insights의 장소 밀도와 공개 웹의 정부·학술 데이터셋을 조사한다. 이 과정에서 출처와 라이선스, 공간·시간 적합성, 목표 신호와의 관계, 형식·품질, 중복을 평가해 자료의 우선순위를 정하고 데이터 출처와 처리 이력을 기록한다.

PPE는 준비된 통계 특성과 PDFM의 인구·사회경제 임베딩, AlphaEarth의 위성영상 임베딩을 결합한다. 논문은 PDFM과 AlphaEarth 임베딩을 해당 과제에 맞게 다시 학습하지 않고 고정된 특성 추출기로 사용했다고 설명한다. [S6]

### 목표 정보 누출 검사와 시험 조건

PPE의 Feature Gate는 목표값을 계산하는 구성요소, 동일 설문이나 보정모델에서 나온 정보, 예측 대상의 결과에 해당하는 변수, 예측 시점 이후 정보를 검사해 배제하도록 설계했다. 누락값의 평균·중앙값·최빈값은 학습 자료에서만 계산해 검증·시험 자료에 적용한다.

연구팀은 미국 CDC 건강지표 예측에서 21개 지표의 평균 R²를 백분율로 표시해 PPE 76.8%, 수동 전문가 파이프라인 60%로 보고했다. CDC와 FEMA의 공간회귀 실험은 같은 센서스 구역 수준의 자료를 80:20 무작위 학습·시험 분할로 평가했다. [S6]

**개념:** [[Knowledge/AI Systems/AI for Scientific Discovery]]

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

- [S1] https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/
- [S2] https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
- [S3] https://www.unibocconi.it/en/news/better-evaluations-chatgpt-critical-thinking-broadens-ideas
- [S4] https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf
- [S5] https://arxiv.org/abs/2608.26088v1
- [S6] https://arxiv.org/html/2608.26088v1
