---
title: 2026-07-28 Tech & AI Briefing
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-07-28
timezone: Asia/Seoul
coverage_start: 2026-07-27T08:00:24+09:00
coverage_end: 2026-07-28T08:05:00+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 4
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/Enterprise AI Operating Model|Enterprise AI
    Operating Model]]"
  - "[[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security
    and Governance]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - OpenAI 업무 사용 조사, 직종 특화 메시지의 43.5%가 다른 직종 과업
  - GitHub, Copilot 앱 접근 정책을 CLI와 분리
  - Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대
article_records:
  - title: OpenAI 업무 사용 조사, 직종 특화 메시지의 43.5%가 다른 직종 과업
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-07-27
      where: 미국
      what: Work at the Frontier 보고서 공개 및 ChatGPT 업무 사용 조사
      how: 미국 이용자 개인 ChatGPT 계정 업무 메시지 80만 건 이상을 O*NET 업무 활동과 비교 분석
      why: 직종 간 ChatGPT 업무 사용 현황 파악
    lead: OpenAI는 7월 27일 미국 이용자의 개인 ChatGPT 계정에서 보낸 업무 메시지 80만 건 이상을 분석한 Work at the
      Frontier 보고서를 공개했다. 다른 직종의 과업으로 분류된 메시지는 전체 업무 메시지의 16.8%였으며, 여러 직종에 공통인
      활동을 뺀 직종 특화 메시지에서는 43.5%였다.
    explanations:
      - heading: 분석 대상과 직종 정보
        paragraphs:
          - 직종은 ChatGPT Business에서 이용자가 자기보고한 정보와 연결했다. 고객
            경험·디자인·엔지니어링·재무·인사·법률·마케팅·영업의 8개 직종을 대상으로, O*NET의 상세 업무 활동과 각 메시지의
            주요 활동을 대조했다.
        source_urls:
          - https://cdn.openai.com/pdf/work-at-the-frontier-report.pdf
      - heading: 메시지를 분류한 방법
        paragraphs:
          - 글쓰기·요약·일정 관리처럼 여러 직종에 공통인 활동은 일반 업무로 따로 분류했다. 분류 단위는 이용자 메시지 한 건이며,
            같은 대화의 이전 메시지를 최대 9개까지 맥락으로 사용했다.
        source_urls:
          - https://cdn.openai.com/pdf/work-at-the-frontier-report.pdf
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, Copilot 앱 접근 정책을 CLI와 분리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-27
      where: 미기재
      what: Copilot 앱 접근을 기업·조직별로 관리하는 전용 정책 발표
      how: 기업 또는 조직 설정의 AI Controls → Copilot Clients → Copilot app policy에서 정책 변경
      why: 미기재
    lead: GitHub는 7월 27일 Copilot 앱의 기업·조직별 접근 정책을 Copilot CLI 정책과 분리했다고 발표했다. 관리자는 앱
      사용을 전체 허용·전체 차단하거나 조직별로 결정하도록 설정할 수 있으며, 기본값은 전체 허용이다.
    explanations:
      - heading: 관리자가 정책을 변경하는 위치
        paragraphs:
          - 기업 또는 조직 설정의 AI Controls → Copilot Clients → Copilot app policy에서
            변경한다. 앱을 차단하면 개발자가 앱을 열 때 관리자가 사용을 허용하지 않았다는 알림을 본다.
        source_urls:
          - https://github.blog/changelog/2026-07-27-manage-github-copilot-app-access-with-a-dedicated-policy/
    papers: []
    relations: []
    topic_ids: []
  - title: Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-27
      where: 미기재
      what: 기업 관리 설정 적용 대상 확대
      how: managed-settings.json을 통한 설정 지정 및 적용
      why: 미기재
    lead: GitHub는 7월 27일 Copilot 앱과 클라우드 에이전트에 기업 관리 설정을 적용한다고 발표했다. 기업은
      managed-settings.json에 허용할 플러그인과 마켓플레이스를 지정하고, 지원되는 키에서 이 값은 개발자의 로컬 설정보다
      우선한다.
    explanations:
      - heading: 앱과 클라우드의 적용 항목
        paragraphs:
          - 앱에서는 명령 실행·파일 접근·URL 요청 전 승인 절차의 우회 허용 여부와 새 대화의 자동 모델 선택 기본값을 정할 수
            있다. 클라우드 에이전트에는 플러그인·마켓플레이스 설정이 적용되며, 승인 프롬프트 우회 통제는 앱·CLI·VS Code
            같은 대화형 클라이언트에만 적용된다.
        source_urls:
          - https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
      - heading: 배포와 설정 반영 시점
        paragraphs:
          - 서버 관리 방식은 기업의 .github-private 저장소에 copilot/managed-settings.json을
            작성해 기본 브랜치에 반영하는 방식이다. MDM이나 파일 배포도 지원한다.
          - 기존 설정은 앱의 다음 로그인·재시작 때 반영되고, 클라우드 에이전트는 다음 작업 배정 때 변경을 적용한다. 지원
            클라이언트는 변경을 약 한 시간 안에 반영하며 재시작·재로그인 때 즉시 적용한다.
        source_urls:
          - https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: OpenAI 업무 사용 조사, 직종 특화 메시지의 43.5%가 다른 직종 과업
    event_id: db9d0913513df69e
    review_status: verified
    published_at: 2026-07-27
    reviewed_at: 2026-10-05
    concept_ids: []
  - title: GitHub, Copilot 앱 접근 정책을 CLI와 분리
    event_id: bbabde57472042d3
    review_status: verified
    published_at: 2026-07-27
    reviewed_at: 2026-10-05
    concept_ids: []
  - title: Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대
    event_id: beab8f92f6eeb134
    review_status: verified
    published_at: 2026-07-27
    reviewed_at: 2026-10-05
    concept_ids: []
---

# 이번 호 표지

OpenAI 업무 사용 조사, 직종 특화 메시지의 43.5%가 다른 직종 과업

# 차례

- OpenAI 업무 사용 조사, 직종 특화 메시지의 43.5%가 다른 직종 과업
- GitHub, Copilot 앱 접근 정책을 CLI와 분리
- Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI 업무 사용 조사, 직종 특화 메시지의 43.5%가 다른 직종 과업

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** OpenAI

OpenAI는 7월 27일 미국 이용자의 개인 ChatGPT 계정에서 보낸 업무 메시지 80만 건 이상을 분석한 Work at the Frontier 보고서를 공개했다. 다른 직종의 과업으로 분류된 메시지는 전체 업무 메시지의 16.8%였으며, 여러 직종에 공통인 활동을 뺀 직종 특화 메시지에서는 43.5%였다. [S1] [S2]

### 분석 대상과 직종 정보

직종은 ChatGPT Business에서 이용자가 자기보고한 정보와 연결했다. 고객 경험·디자인·엔지니어링·재무·인사·법률·마케팅·영업의 8개 직종을 대상으로, O*NET의 상세 업무 활동과 각 메시지의 주요 활동을 대조했다. [S2]

### 메시지를 분류한 방법

글쓰기·요약·일정 관리처럼 여러 직종에 공통인 활동은 일반 업무로 따로 분류했다. 분류 단위는 이용자 메시지 한 건이며, 같은 대화의 이전 메시지를 최대 9개까지 맥락으로 사용했다. [S2]

## GitHub, Copilot 앱 접근 정책을 CLI와 분리

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 7월 27일 Copilot 앱의 기업·조직별 접근 정책을 Copilot CLI 정책과 분리했다고 발표했다. 관리자는 앱 사용을 전체 허용·전체 차단하거나 조직별로 결정하도록 설정할 수 있으며, 기본값은 전체 허용이다. [S3]

### 관리자가 정책을 변경하는 위치

기업 또는 조직 설정의 AI Controls → Copilot Clients → Copilot app policy에서 변경한다. 앱을 차단하면 개발자가 앱을 열 때 관리자가 사용을 허용하지 않았다는 알림을 본다. [S3]

## Copilot 앱·클라우드 에이전트에 기업 관리 설정 확대

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 7월 27일 Copilot 앱과 클라우드 에이전트에 기업 관리 설정을 적용한다고 발표했다. 기업은 managed-settings.json에 허용할 플러그인과 마켓플레이스를 지정하고, 지원되는 키에서 이 값은 개발자의 로컬 설정보다 우선한다. [S4]

### 앱과 클라우드의 적용 항목

앱에서는 명령 실행·파일 접근·URL 요청 전 승인 절차의 우회 허용 여부와 새 대화의 자동 모델 선택 기본값을 정할 수 있다. 클라우드 에이전트에는 플러그인·마켓플레이스 설정이 적용되며, 승인 프롬프트 우회 통제는 앱·CLI·VS Code 같은 대화형 클라이언트에만 적용된다. [S4]

### 배포와 설정 반영 시점

서버 관리 방식은 기업의 .github-private 저장소에 copilot/managed-settings.json을 작성해 기본 브랜치에 반영하는 방식이다. MDM이나 파일 배포도 지원한다.

기존 설정은 앱의 다음 로그인·재시작 때 반영되고, 클라우드 에이전트는 다음 작업 배정 때 변경을 적용한다. 지원 클라이언트는 변경을 약 한 시간 안에 반영하며 재시작·재로그인 때 즉시 적용한다. [S4]

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

- [S1] https://openai.com/index/how-ai-is-expanding-what-people-do-at-work/
- [S2] https://cdn.openai.com/pdf/work-at-the-frontier-report.pdf
- [S3] https://github.blog/changelog/2026-07-27-manage-github-copilot-app-access-with-a-dedicated-policy/
- [S4] https://github.blog/changelog/2026-07-27-enterprise-managed-settings-now-apply-to-the-github-copilot-app/
