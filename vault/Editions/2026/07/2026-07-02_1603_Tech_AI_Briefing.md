---
title: Tech & AI Briefing - 16:03
time: 16:03
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-02
timezone: Asia/Seoul
coverage_start: 2026-07-02T08:05:09+09:00
coverage_end: 2026-07-02T16:03:53+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 3
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
  - "[[Knowledge/Software Engineering/AI-Assisted Security
    Engineering|AI-Assisted Security Engineering]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입
  - GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개
  - Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가
article_records:
  - title: NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA
      when: 2026-07-02
      where: 미기재
      what: AI 클라우드 인프라 조달을 위한 수익 공유·신용 지원 모델 발표
      how: AI 클라우드의 서비스 판매 매출 일부와 NVIDIA 제품 판매 매출을 결합
      why: 스타트업·모델 개발사·기업·연구기관 등의 컴퓨팅 인프라 접근 확대
    lead: NVIDIA가 2026년 7월 2일(한국시간) AI 클라우드 사업자의 인프라 조달을 돕는 수익 공유·신용 지원 모델을 발표했다. AI
      클라우드가 NVIDIA 기반 서비스를 판매하면, NVIDIA는 일반 제품 판매 매출과 지원 용량에서 발생하는 클라우드 매출 일부를
      받는 구조다.
    explanations:
      - heading: 초기 참여사의 GPU·전력 규모
        paragraphs:
          - NVIDIA는 Sharon AI와 Firmus를 초기 참여사로 소개했다. Sharon AI는 Grace Blackwell
            GB300 GPU를 최대 4만 개 배치하는 작업을 진행 중이다.
          - Firmus는 인도네시아 바탐에 DSX AI 팩토리 캠퍼스를 건설하고 있다. NVIDIA가 제시한 확장 계획은
            360메가와트와 GPU 최대 17만 개다.
        source_urls:
          - https://blogs.nvidia.com/blog/nvidia-unlocks-ai-compute-at-scale-capital-partners-to-power-ai-infrastructure-buildout/
      - heading: 학습에서 상시 추론까지
        paragraphs:
          - NVIDIA는 수요가 모델 개발에서 상시 가동하는 추론 인프라로 이동하고 있다고 설명했다. Baseten·Fireworks
            AI·Together AI가 필요로 하는 작업으로 모델 학습, 후속 학습, 미세조정, 대규모 에이전트 추론을 제시했다.
        source_urls:
          - https://blogs.nvidia.com/blog/nvidia-unlocks-ai-compute-at-scale-capital-partners-to-power-ai-infrastructure-buildout/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-02
      where: 미기재
      what: 공개 시크릿 유출 모니터링 기능의 공개 프리뷰 제공
      how: github.com의 공개 콘텐츠에서 유출된 시크릿을 실시간으로 스캔하고, 멤버 기반 귀속 및 검증된 도메인 매칭을 통해 기업에
        귀속한다.
      why: 미기재
    lead: GitHub가 2026년 7월 2일(한국시간) 기업용 public monitoring을 공개 프리뷰로 제공한다고 발표했다. 회사 소유
      저장소 밖의 공개 저장소·풀 리퀘스트 댓글·이슈에 노출된 비밀정보를 찾아, GitHub 계정과 검증된 도메인 정보로 해당 기업에
      연결하는 기능이다.
    explanations:
      - heading: 계정과 이메일 도메인으로 기업을 식별
        paragraphs:
          - 기업 멤버의 GitHub 계정이 커밋했는지 확인하거나, 커미터의 이메일이 기업·조직이 검증한 도메인에 속하는지 대조한다.
            도메인 대조는 계정이 기업에 연결돼 있지 않거나 이메일이 공개되지 않은 경우에도 적용된다.
          - GitHub는 github.com의 공개 콘텐츠를 실시간으로 감시한다고 설명했다. 이 기능은 비공개 저장소를 검사하지
            않고, 이미 공개된 비밀정보만 표시한다.
        source_urls:
          - https://github.blog/changelog/2026-07-01-secret-scanning-public-monitoring-for-enterprises/
      - heading: 지원 고객과 활성화 권한
        paragraphs:
          - 대상은 GitHub Enterprise Cloud의 Secret Protection 또는 Advanced Security
            고객이며 추가 비용은 없다. 엔터프라이즈 소유자와 보안 관리자가 Security 탭에서 켤 수 있고, 별도 구성을 하지
            않아도 최근 유출과 이후 일치 항목을 확인할 수 있다.
          - 데이터 레지던시를 사용하는 Enterprise Cloud 지원은 발표 당시 예정 상태였다.
        source_urls:
          - https://github.blog/changelog/2026-07-01-secret-scanning-public-monitoring-for-enterprises/
    papers: []
    relations: []
    topic_ids: []
  - title: Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Vercel
      when: 2026-07-02
      where: 미기재
      what: "@ai-sdk/google 4.0.6 버전 공개 및 vertex.interactions() 함수 추가"
      how: commit d20f0dc를 통한 패치 변경으로 Vertex AI Gemini Interactions API 연동 기능 구현
      why: 미기재
    lead: Vercel이 2026년 7월 2일(한국시간) AI SDK의 @ai-sdk/google 패키지 4.0.6을 배포했다. 이번 패치에
      Vertex AI의 Gemini Interactions API를 호출하는 vertex.interactions() 함수를 추가했다.
    explanations:
      - heading: 리전별 요청과 기존 인증 사용
        paragraphs:
          - 함수는 리전별 /locations/{region}/interactions 리소스로 요청하고, 인증에는 기존 Vertex
            OAuth 자격 증명을 사용한다. 공식 릴리스는 영상 출력이 가능한 gemini-omni-flash-preview를 지원
            모델의 예로 들었다.
          - 다른 프로바이더가 재사용할 수 있도록 GoogleInteractionsLanguageModel 클래스도
            @ai-sdk/google/internal에서 내보냈다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk/google%404.0.6
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입
    event_id: 4f2226d872abe871
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-08
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-02T03:34:48+00:00
  - title: GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개
    event_id: e456906813d94efb
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-08
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-01T17:37:55-07:00
  - title: Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가
    event_id: c2ff68732c7e19e0
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-08
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-02T00:19:19Z
---

# 이번 호 표지

NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입

# 차례

- NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입
- GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개
- Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가

# 커버 스토리

없음

# 뉴스 데스크

## NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입

**분야:** 소프트웨어·클라우드
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 사업 모델
**기업·기관:** NVIDIA, Sharon AI, Firmus, Baseten, Fireworks AI, Together AI

NVIDIA가 2026년 7월 2일(한국시간) AI 클라우드 사업자의 인프라 조달을 돕는 수익 공유·신용 지원 모델을 발표했다. AI 클라우드가 NVIDIA 기반 서비스를 판매하면, NVIDIA는 일반 제품 판매 매출과 지원 용량에서 발생하는 클라우드 매출 일부를 받는 구조다. [S1]

### 초기 참여사의 GPU·전력 규모

NVIDIA는 Sharon AI와 Firmus를 초기 참여사로 소개했다. Sharon AI는 Grace Blackwell GB300 GPU를 최대 4만 개 배치하는 작업을 진행 중이다.

Firmus는 인도네시아 바탐에 DSX AI 팩토리 캠퍼스를 건설하고 있다. NVIDIA가 제시한 확장 계획은 360메가와트와 GPU 최대 17만 개다. [S1]

### 학습에서 상시 추론까지

NVIDIA는 수요가 모델 개발에서 상시 가동하는 추론 인프라로 이동하고 있다고 설명했다. Baseten·Fireworks AI·Together AI가 필요로 하는 작업으로 모델 학습, 후속 학습, 미세조정, 대규모 에이전트 추론을 제시했다. [S1]

## GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub가 2026년 7월 2일(한국시간) 기업용 public monitoring을 공개 프리뷰로 제공한다고 발표했다. 회사 소유 저장소 밖의 공개 저장소·풀 리퀘스트 댓글·이슈에 노출된 비밀정보를 찾아, GitHub 계정과 검증된 도메인 정보로 해당 기업에 연결하는 기능이다. [S2]

### 계정과 이메일 도메인으로 기업을 식별

기업 멤버의 GitHub 계정이 커밋했는지 확인하거나, 커미터의 이메일이 기업·조직이 검증한 도메인에 속하는지 대조한다. 도메인 대조는 계정이 기업에 연결돼 있지 않거나 이메일이 공개되지 않은 경우에도 적용된다.

GitHub는 github.com의 공개 콘텐츠를 실시간으로 감시한다고 설명했다. 이 기능은 비공개 저장소를 검사하지 않고, 이미 공개된 비밀정보만 표시한다. [S2]

### 지원 고객과 활성화 권한

대상은 GitHub Enterprise Cloud의 Secret Protection 또는 Advanced Security 고객이며 추가 비용은 없다. 엔터프라이즈 소유자와 보안 관리자가 Security 탭에서 켤 수 있고, 별도 구성을 하지 않아도 최근 유출과 이후 일치 항목을 확인할 수 있다.

데이터 레지던시를 사용하는 Enterprise Cloud 지원은 발표 당시 예정 상태였다. [S2]

## Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Vercel

Vercel이 2026년 7월 2일(한국시간) AI SDK의 @ai-sdk/google 패키지 4.0.6을 배포했다. 이번 패치에 Vertex AI의 Gemini Interactions API를 호출하는 vertex.interactions() 함수를 추가했다. [S3]

### 리전별 요청과 기존 인증 사용

함수는 리전별 /locations/{region}/interactions 리소스로 요청하고, 인증에는 기존 Vertex OAuth 자격 증명을 사용한다. 공식 릴리스는 영상 출력이 가능한 gemini-omni-flash-preview를 지원 모델의 예로 들었다.

다른 프로바이더가 재사용할 수 있도록 GoogleInteractionsLanguageModel 클래스도 @ai-sdk/google/internal에서 내보냈다. [S3]

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

- [S1] https://blogs.nvidia.com/blog/nvidia-unlocks-ai-compute-at-scale-capital-partners-to-power-ai-infrastructure-buildout/
- [S2] https://github.blog/changelog/2026-07-01-secret-scanning-public-monitoring-for-enterprises/
- [S3] https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk/google%404.0.6
