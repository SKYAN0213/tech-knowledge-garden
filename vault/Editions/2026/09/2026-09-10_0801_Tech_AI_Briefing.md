---
title: 2026-09-10 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-10
timezone: Asia/Seoul
coverage_start: 2026-09-09T08:02:08+09:00
coverage_end: 2026-09-10T08:01:46+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 4
new_items_count: 3
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어
  - Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리
  - GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개
article_records:
  - title: Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-09-09 발표; 원문 게시 시각 11:00 GMT, 한국시간 20:00
      where: OpenAI 공식 웹사이트
      what: 기업용 Astra의 접근 제한·파일 전송·브라우징 기록 관리 기능 소개
      how: 관리자 제어로 허용 웹사이트·앱과 업로드·다운로드·브라우징 기록을 설정
      why: 제한된 구성에서 시작해 조직의 접근 범위를 단계적으로 넓히도록 지원
    lead: OpenAI는 9월 9일 기업용 Astra의 관리자 통제 기능을 소개했다. 관리자는 허용한 웹사이트와 데스크톱 앱으로 접근을 제한하고
      업로드·다운로드와 브라우징 기록을 관리할 수 있다.
    explanations:
      - heading: 조직이 정하는 접근과 활성화 범위
        paragraphs:
          - OpenAI는 조직이 업무 시스템 접근 범위를 제한한 구성에서 시작하고 이후 접근을 넓힐 수 있다고 설명했다.
          - Enterprise의 Astra 접근은 출시 당시 기본 비활성화 상태다. 관리자는 적용 요금표와 계약에 따라 활성화할 수
            있다.
        source_urls:
          - https://openai.com/index/gpt-6-astra-next-generation-work/
    papers: []
    relations: []
    topic_ids: []
  - title: Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-09
      where: Copilot 앱·CLI와 Agent Host 기반 VS Code
      what: 조직 관리 에이전트 작업 권한 정식 제공
      how: 셸·파일·네트워크 작업별 차단·승인·허용 정책
      why: 민감한 작업의 권한을 조직에서 세분화
    lead: GitHub는 9월 9일 Copilot Business·Enterprise 관리자가 에이전트 작업 권한을 중앙에서 지정하는 기능을
      정식 제공한다고 발표했다. 셸 명령·파일 읽기와 편집·네트워크 도메인의 작업별로 차단·사람 승인·자동 허용을 정하며,
      사용자·워크스페이스 설정이나 이전 승인이 조직의 제한을 완화할 수 없다. 적용 범위는 Copilot 앱·CLI와 Agent Host를
      사용하는 Visual Studio Code 세션이다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-09 발표
      where: GitHub 공식 웹사이트
      what: PR 병합 단계의 비밀정보 검사 규칙 공개 미리보기
      how: 최신 커밋 검사 완료와 PR 도입 비밀정보의 열린 경보 여부 확인
      why: 푸시 단계 보호가 잡지 못하거나 설정상 검사하지 않은 경우에도 병합 단계 보호 추가
    lead: GitHub는 9월 9일 비밀정보 경보가 남아 있는 풀 리퀘스트(PR)의 병합을 차단하는 저장소 규칙을 공개 미리보기로 제공한다고
      발표했다. GitHub Secret Protection 또는 Advanced Security 고객이 규칙을 켜면 최신 커밋의 비밀정보
      검사가 완료되고 해당 PR이 도입한 비밀정보의 열린 경보가 없어야 병합할 수 있다. 기본 탐지 대상은 서비스 제공자 패턴이며, 사용자
      정의·일반 패턴은 추가로 설정할 수 있고 우회 권한이 없는 개발자는 경보를 해결해야 차단을 해제할 수 있다.
    explanations:
      - heading: 푸시 단계와 병합 단계의 보호
        paragraphs:
          - 푸시 보호는 비밀정보가 저장소에 들어오기 전에 차단한다. 새 규칙은 PR 병합 단계에서 추가로 검사하므로, 푸시 보호에서
            검사하지 않도록 설정한 일반 패턴도 병합 규칙의 대상으로 지정할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
      - heading: 브랜치별 규칙과 API 설정
        paragraphs:
          - 저장소·조직·엔터프라이즈의 Repository → Rulesets에서 보호할 브랜치를 지정하고 Require secret
            scanning alerts are resolved를 선택한다. REST API에서는
            require_secret_scanning_alert_resolution과 secret_types로 같은 규칙을 설정할 수
            있다.
        source_urls:
          - https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어
    event_id: 333ccaae81484d3a
    review_status: verified
    published_at: 2026-09-09
    reviewed_at: 2026-10-13
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-09-09T11:00:00Z
  - title: Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리
    event_id: faa37362568657fb
    review_status: verified
    published_at: 2026-09-09
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개
    event_id: 0ef68bd8a0105dab
    review_status: verified
    published_at: 2026-09-09
    reviewed_at: 2026-10-09
    concept_ids: []
---

# 이번 호 표지

Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어

# 차례

- Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어
- Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리
- GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개

# 커버 스토리

없음

# 뉴스 데스크

## Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** OpenAI

OpenAI는 9월 9일 기업용 Astra의 관리자 통제 기능을 소개했다. 관리자는 허용한 웹사이트와 데스크톱 앱으로 접근을 제한하고 업로드·다운로드와 브라우징 기록을 관리할 수 있다. [S1] [S2]

### 조직이 정하는 접근과 활성화 범위

OpenAI는 조직이 업무 시스템 접근 범위를 제한한 구성에서 시작하고 이후 접근을 넓힐 수 있다고 설명했다.

Enterprise의 Astra 접근은 출시 당시 기본 비활성화 상태다. 관리자는 적용 요금표와 계약에 따라 활성화할 수 있다. [S1]

## Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 9일 Copilot Business·Enterprise 관리자가 에이전트 작업 권한을 중앙에서 지정하는 기능을 정식 제공한다고 발표했다. 셸 명령·파일 읽기와 편집·네트워크 도메인의 작업별로 차단·사람 승인·자동 허용을 정하며, 사용자·워크스페이스 설정이나 이전 승인이 조직의 제한을 완화할 수 없다. 적용 범위는 Copilot 앱·CLI와 Agent Host를 사용하는 Visual Studio Code 세션이다. [S3]



## GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 9일 비밀정보 경보가 남아 있는 풀 리퀘스트(PR)의 병합을 차단하는 저장소 규칙을 공개 미리보기로 제공한다고 발표했다. GitHub Secret Protection 또는 Advanced Security 고객이 규칙을 켜면 최신 커밋의 비밀정보 검사가 완료되고 해당 PR이 도입한 비밀정보의 열린 경보가 없어야 병합할 수 있다. 기본 탐지 대상은 서비스 제공자 패턴이며, 사용자 정의·일반 패턴은 추가로 설정할 수 있고 우회 권한이 없는 개발자는 경보를 해결해야 차단을 해제할 수 있다. [S4]

### 푸시 단계와 병합 단계의 보호

푸시 보호는 비밀정보가 저장소에 들어오기 전에 차단한다. 새 규칙은 PR 병합 단계에서 추가로 검사하므로, 푸시 보호에서 검사하지 않도록 설정한 일반 패턴도 병합 규칙의 대상으로 지정할 수 있다. [S4]

### 브랜치별 규칙과 API 설정

저장소·조직·엔터프라이즈의 Repository → Rulesets에서 보호할 브랜치를 지정하고 Require secret scanning alerts are resolved를 선택한다. REST API에서는 require\_secret\_scanning\_alert\_resolution과 secret\_types로 같은 규칙을 설정할 수 있다. [S4]

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

- [S1] https://openai.com/index/gpt-6-astra-next-generation-work/
- [S2] https://openai.com/news/rss.xml
- [S3] https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/
- [S4] https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
