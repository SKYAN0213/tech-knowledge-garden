---
title: 2026-08-04 Tech & AI Briefing
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-08-04
timezone: Asia/Seoul
coverage_start: 2026-08-03T08:01:46+09:00
coverage_end: 2026-08-04T08:03:22+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 5
new_items_count: 2
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/Conversational Voice AI|Conversational Voice AI]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - Knowledge/AI Systems/Agent Evaluation
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - OpenAI, 음성 전송과 도구 실행을 분리한 GPT-Live 구조 설명
  - Microsoft Research, 학습·평가 환경을 재사용하는 Orchard 소개
article_records:
  - title: OpenAI, 음성 전송과 도구 실행을 분리한 GPT-Live 구조 설명
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-08-03
      where: 미기재
      what: GPT-Live의 실시간 음성 전송·상태 유지·비동기 위임 구조 설명
      how: 전용 음성 경로, 대체 모델 사전 준비, 비동기 업무 실행 및 WebRTC 연결 절차 최적화
      why: 미기재
    lead: OpenAI가 8월 3일 실시간 음성 시스템 GPT-Live의 전송·추론·대화 상태 관리 구조를 설명했다. 듣기와 말하기를 동시에
      처리하고, 검색·깊은 추론·도구 사용은 GPT-5.5 등 별도 모델에 비동기로 맡겨 음성 흐름을 유지한다.
    explanations:
      - heading: 음성·업무 경로 분리
        paragraphs:
          - 오디오는 클라이언트와 음성 모델 사이의 전용 경로로 보내고, 도구·업무 실행은 비동기 RPC로 분리한다.
          - 미디어 프런트엔드·추론 로직을 Python asyncio에서 Go로 바꿨다. 데스크톱 앱의 컴퓨터 제어·에이전트 조율에도
            쓰인다.
        source_urls:
          - https://openai.com/index/continuous-voice-interaction-with-gpt-live/
      - heading: 모델·문맥 교체
        paragraphs:
          - 기존 모델이 대화를 이어가는 동안 새 모델을 준비하고 문맥을 미리 입력해 전환한다. 긴 대화의 문맥 압축에도 적용한다.
          - 깊은 작업용 모델의 세션과 초기 문맥을 미리 준비하고, 후속 요청은 같은 세션·프롬프트 캐시를 재사용한다. 대화 화면은
            수정 가능한 임시 전사문을, 분석 로그는 확정 전사문을 사용한다.
        source_urls:
          - https://openai.com/index/continuous-voice-interaction-with-gpt-live/
      - heading: 연결 시작 절차 단축
        paragraphs:
          - OpenAI에 따르면 WARP는 연결 시작의 네트워크 왕복을 6회에서 1회로 줄인다. libwebrtc와 Pion에도
            지원을 추가했다.
          - ICE·DTLS 핸드셰이크를 함께 보내는 SPED, DTLS 1.3, SCTP·데이터 채널 사전 협상을 결합한다.
            Instant Connect는 용량 예약 없이 SDP를 미리 협상하고, 정보가 무효하면 일반 절차로 돌아간다. 두 방식을
            함께 쓰면 UDP 패킷 하나로 세션을 시작한다.
        source_urls:
          - https://openai.com/index/continuous-voice-interaction-with-gpt-live/
      - heading: 기존 서비스와 병행 시험
        paragraphs:
          - 기존 Advanced Voice Mode가 응답하는 동안 새 시스템을 읽기 전용으로 시험했다. CPU 큐·네트워크·지역별
            지연·장시간 세션·재연결 문제를 확인했다. 8월 3일 자료에서는 향후 GPT-Live API의 기반으로 사용할 계획이라고
            밝혔다.
        source_urls:
          - https://openai.com/index/continuous-voice-interaction-with-gpt-live/
    papers: []
    relations: []
    topic_ids: []
  - title: Microsoft Research, 학습·평가 환경을 재사용하는 Orchard 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Microsoft Research
      when: 2026-08-03
      where: 미기재
      what: Orchard의 공통 실행 환경과 세 가지 에이전트 학습 절차 소개
      how: Kubernetes 기반 격리 환경을 데이터 생성·강화학습·평가에 재사용하고 실제 실행기의 모델 호출을 프록시로 기록
      why: 미기재
    lead: Microsoft Research가 8월 3일 코딩·웹 탐색·개인 비서 에이전트를 학습하고 평가하는 오픈소스 프레임워크
      Orchard를 소개했다. Orchard Env의 격리 환경을 재사용하며, 배포용 에이전트 실행기에서 모델 호출을 기록하고 학습한다.
    explanations:
      - heading: 공통 격리 환경과 실행기
        paragraphs:
          - Orchard Env는 Kubernetes 기반의 독립 서비스다. 격리 환경을 생성·관리하고 학습 데이터
            수집·강화학습·평가에 재사용한다.
          - 모델 요청과 도구 사용을 담당하는 실행기의 호출을 경량 프록시로 기록한다. 각 실행을 별도 컨테이너에 넣으며
            Codex·OpenClaw·ZeroClaw 등 배포용 실행기에서 학습 데이터를 모은다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
      - heading: 학습 절차와 공개 자료
        paragraphs:
          - 연구팀은 코딩용 Orchard-SWE, 브라우저용 Orchard-GUI, 개인 비서용 Orchard-Claw의 학습 절차를
            설명하고 관련 학습 데이터와 평가 방법을 공개한다고 밝혔다.
          - Orchard-SWE 학습에는 MiniMax-M2.5와 Qwen3.5-397B에서 수집한 에이전트 상호작용
            107,000건을 사용했다고 연구팀은 설명했다.
          - 공식 저장소는 Orchard Env와 학습·평가 구성을 제공한다. 데이터 카드에는 코딩 궤적의 패치 검증 결과, 웹 탐색
            기록의 대화·스크린샷·보상 정보가 있다. 논문 초록은 세 학습 절차와 공통 환경 구조를 설명한다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
          - https://github.com/microsoft/Orchard
          - https://huggingface.co/datasets/microsoft/Orchard
          - https://arxiv.org/abs/2605.15040
      - heading: 8월 21일 수정본의 평가
        paragraphs:
          - 연구팀은 8월 21일 수정본에서, 활성 매개변수 약 30억 개를 사용하는 Orchard-SWE의 SWE-bench
            Verified 점수를 69.7%로 보고했다. 별도 가치 모델로 후보 답안을 재정렬한 조건에서는 73.0%였다.
          - Orchard-GUI는 매개변수 40억 개의 비전·언어 모델이다. 연구팀이 보고한 평가 결과는 WebVoyager
            74.1%, Online-Mind2Web 67.0%, DeepShop 64.0%로, 각각 다른 웹 탐색 과제 묶음의
            점수다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
      - heading: 시도 횟수·실행기별 성공률
        paragraphs:
          - 같은 수정본에서 연구팀은 Orchard-Claw가 Claw-Eval 과제를 최대 세 번 시도하는 조건에서 59.6%를
            완료했다고 보고했다. ZeroClaw 실행기와 결합한 조건의 완료율은 73.9%였다.
          - Codex 실행기 조건에서 연구팀이 보고한 성공률은 학습 전 모델 18.6%, Orchard 학습 후 51.5%였다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: OpenAI, 음성 전송과 도구 실행을 분리한 GPT-Live 구조 설명
    event_id: deec56a13e2b9b57
    review_status: verified
    published_at: 2026-08-03
    reviewed_at: 2026-10-05
    concept_ids:
      - voice
  - title: Microsoft Research, 학습·평가 환경을 재사용하는 Orchard 소개
    event_id: a8dbd4f6642c381b
    review_status: verified
    published_at: 2026-08-03
    reviewed_at: 2026-10-05
    concept_ids:
      - evaluation
---

# 이번 호 표지

OpenAI, 음성 전송과 도구 실행을 분리한 GPT-Live 구조 설명

# 차례

- OpenAI, 음성 전송과 도구 실행을 분리한 GPT-Live 구조 설명
- Microsoft Research, 학습·평가 환경을 재사용하는 Orchard 소개

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI, 음성 전송과 도구 실행을 분리한 GPT-Live 구조 설명

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 성능 개선
**기업·기관:** OpenAI

OpenAI가 8월 3일 실시간 음성 시스템 GPT-Live의 전송·추론·대화 상태 관리 구조를 설명했다. 듣기와 말하기를 동시에 처리하고, 검색·깊은 추론·도구 사용은 GPT-5.5 등 별도 모델에 비동기로 맡겨 음성 흐름을 유지한다. [S1]

### 음성·업무 경로 분리

오디오는 클라이언트와 음성 모델 사이의 전용 경로로 보내고, 도구·업무 실행은 비동기 RPC로 분리한다.

미디어 프런트엔드·추론 로직을 Python asyncio에서 Go로 바꿨다. 데스크톱 앱의 컴퓨터 제어·에이전트 조율에도 쓰인다. [S1]

### 모델·문맥 교체

기존 모델이 대화를 이어가는 동안 새 모델을 준비하고 문맥을 미리 입력해 전환한다. 긴 대화의 문맥 압축에도 적용한다.

깊은 작업용 모델의 세션과 초기 문맥을 미리 준비하고, 후속 요청은 같은 세션·프롬프트 캐시를 재사용한다. 대화 화면은 수정 가능한 임시 전사문을, 분석 로그는 확정 전사문을 사용한다. [S1]

### 연결 시작 절차 단축

OpenAI에 따르면 WARP는 연결 시작의 네트워크 왕복을 6회에서 1회로 줄인다. libwebrtc와 Pion에도 지원을 추가했다.

ICE·DTLS 핸드셰이크를 함께 보내는 SPED, DTLS 1.3, SCTP·데이터 채널 사전 협상을 결합한다. Instant Connect는 용량 예약 없이 SDP를 미리 협상하고, 정보가 무효하면 일반 절차로 돌아간다. 두 방식을 함께 쓰면 UDP 패킷 하나로 세션을 시작한다. [S1]

### 기존 서비스와 병행 시험

기존 Advanced Voice Mode가 응답하는 동안 새 시스템을 읽기 전용으로 시험했다. CPU 큐·네트워크·지역별 지연·장시간 세션·재연결 문제를 확인했다. 8월 3일 자료에서는 향후 GPT-Live API의 기반으로 사용할 계획이라고 밝혔다. [S1]

**개념:** [[Knowledge/AI Systems/Conversational Voice AI]]

## Microsoft Research, 학습·평가 환경을 재사용하는 Orchard 소개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 성능 개선
**기업·기관:** Microsoft Research

Microsoft Research가 8월 3일 코딩·웹 탐색·개인 비서 에이전트를 학습하고 평가하는 오픈소스 프레임워크 Orchard를 소개했다. Orchard Env의 격리 환경을 재사용하며, 배포용 에이전트 실행기에서 모델 호출을 기록하고 학습한다. [S2] [S3] [S4] [S5]

### 공통 격리 환경과 실행기

Orchard Env는 Kubernetes 기반의 독립 서비스다. 격리 환경을 생성·관리하고 학습 데이터 수집·강화학습·평가에 재사용한다.

모델 요청과 도구 사용을 담당하는 실행기의 호출을 경량 프록시로 기록한다. 각 실행을 별도 컨테이너에 넣으며 Codex·OpenClaw·ZeroClaw 등 배포용 실행기에서 학습 데이터를 모은다. [S2]

### 학습 절차와 공개 자료

연구팀은 코딩용 Orchard-SWE, 브라우저용 Orchard-GUI, 개인 비서용 Orchard-Claw의 학습 절차를 설명하고 관련 학습 데이터와 평가 방법을 공개한다고 밝혔다.

Orchard-SWE 학습에는 MiniMax-M2.5와 Qwen3.5-397B에서 수집한 에이전트 상호작용 107,000건을 사용했다고 연구팀은 설명했다.

공식 저장소는 Orchard Env와 학습·평가 구성을 제공한다. 데이터 카드에는 코딩 궤적의 패치 검증 결과, 웹 탐색 기록의 대화·스크린샷·보상 정보가 있다. 논문 초록은 세 학습 절차와 공통 환경 구조를 설명한다. [S2] [S3] [S4] [S5]

### 8월 21일 수정본의 평가

연구팀은 8월 21일 수정본에서, 활성 매개변수 약 30억 개를 사용하는 Orchard-SWE의 SWE-bench Verified 점수를 69.7%로 보고했다. 별도 가치 모델로 후보 답안을 재정렬한 조건에서는 73.0%였다.

Orchard-GUI는 매개변수 40억 개의 비전·언어 모델이다. 연구팀이 보고한 평가 결과는 WebVoyager 74.1%, Online-Mind2Web 67.0%, DeepShop 64.0%로, 각각 다른 웹 탐색 과제 묶음의 점수다. [S2]

### 시도 횟수·실행기별 성공률

같은 수정본에서 연구팀은 Orchard-Claw가 Claw-Eval 과제를 최대 세 번 시도하는 조건에서 59.6%를 완료했다고 보고했다. ZeroClaw 실행기와 결합한 조건의 완료율은 73.9%였다.

Codex 실행기 조건에서 연구팀이 보고한 성공률은 학습 전 모델 18.6%, Orchard 학습 후 51.5%였다. [S2]

**개념:** [[Knowledge/AI Systems/Agent Evaluation]]

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

- [S1] https://openai.com/index/continuous-voice-interaction-with-gpt-live/
- [S2] https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
- [S3] https://github.com/microsoft/Orchard
- [S4] https://huggingface.co/datasets/microsoft/Orchard
- [S5] https://arxiv.org/abs/2605.15040
