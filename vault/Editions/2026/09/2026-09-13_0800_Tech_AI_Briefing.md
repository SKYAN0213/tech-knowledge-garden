---
title: 2026-09-13 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-13
timezone: Asia/Seoul
coverage_start: 2026-09-11T08:00:52+09:00
coverage_end: 2026-09-13T08:01:40+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 8
new_items_count: 6
linked_knowledge_notes:
  - "[[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]]"
  - Knowledge/AI Systems/AI Agents
  - Knowledge/Software Engineering/Software Supply Chain Security
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - HD현대로보틱스, 에이딘에 130억 원 투자…로봇손·표면가공 공동 개발
  - FANUC, 도면에서 용접 조건·동작 생성하는 AI Welding Agent 개발
  - RubyGems, 5월 악성 패키지 500개 이상 제거한 사건의 조사 결과 공개
  - OpenAI, 저장소 서비스 Rust로 재작성…발표 당시 요청 95% 처리
  - VS Code Agents 전용 창의 사용량을 별도로 집계
article_records:
  - title: OpenAI, 저장소 서비스 Rust로 재작성…발표 당시 요청 95% 처리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-09-11 발표
      where: 공식 기술 블로그
      what: Habitat의 Rust 재작성과 운영 경험 공개
      how: 엔지니어 2명이 Codex와 GPT-5.5를 이용해 2026년 2분기에 재작성
      why: 제품 개발과 안정성을 우선해 Python 서비스로 분리한 뒤 자원 효율 개선
    lead: OpenAI는 9월 11일 온라인 저장소 서비스 Habitat의 확장 경험을 공개했다. 회사에 따르면 엔지니어 2명이 Codex와
      GPT-5.5를 이용해 2026년 2분기에 서비스를 Rust로 재작성했으며, 발표 당시 운영 요청의 95%를 처리하고 있었다.
      OpenAI는 자사 측정에서 Python 버전 대비 CPU 효율 6배, 메모리 효율 15배를 기록했다고 밝혔다.
    explanations:
      - heading: 느린 요청을 추적한 배경
        paragraphs:
          - OpenAI는 Habitat의 Python 서비스에서 p99 이상 지연 요청의 추적 기록을 분석한 결과, 하위 저장소는
            빨리 응답해도 코루틴 재스케줄링을 기다리느라 요청이 멈추는 경우가 잦았다고 설명했다.
          - 회사 측정에서는 Rust 서비스가 Python 버전보다 평균 지연과 꼬리 지연도 낮았다고 밝혔다.
        source_urls:
          - https://openai.com/index/scaling-storage-one-billion-users-part-one/
    papers: []
    relations: []
    topic_ids: []
  - title: VS Code Agents 전용 창의 사용량을 별도로 집계
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-11 발표
      where: GitHub Copilot 사용량 보고서
      what: VS Code Agents 전용 창의 사용량 지표 추가
      how: 기업·조직의 1일·28일 집계 및 사용자별 보고서에 선택 항목으로 제공
      why: 미기재
    lead: GitHub는 9월 11일 Copilot 사용량 보고서에 VS Code Agents 전용 창의 활동 지표를 정식으로 추가했다.
      기업·조직의 1일 및 28일 집계 보고서에는 이 창의 활성 사용자 수, 세션 수, 사용자 메시지 수가 선택 항목으로 포함된다. 기업
      소유자·결제 관리자·조직 소유자와 관련 조회 권한을 부여받은 사용자가 지표를 볼 수 있으며, Copilot 사용량 지표 정책도 켜져
      있어야 한다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 별도로 집계하는 범위
        paragraphs:
          - GitHub는 전용 창의 지표를 편집기 창 Agent Mode와 일반 Copilot 사용량 집계와 구분한다.
          - 사용자별 보고서에는 전용 창 사용 여부와 사용자별 세션·메시지 수가 포함된다. 해당 데이터가 없으면 선택 항목은 생략되거나
            null로 표시될 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/
  - title: Copilot, 수정된 코드 리뷰 댓글을 재검토 때 자동 정리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-11 발표
      where: GitHub Copilot 코드 리뷰
      what: 해결된 자체 댓글 자동 종료와 제안 코드의 커밋 메시지 생성
      how: 후속 커밋 재검토·Copilot SDK 셸 도구·Lite 다중 에이전트
      why: 미기재
    lead: GitHub는 9월 11일 Copilot 코드 리뷰가 후속 커밋에서 해결된 자체 댓글을 다시 확인해 자동 종료하는 기능을 발표했다.
      Copilot의 수정 제안을 적용할 때는 변경 내용에 맞는 커밋 메시지를 만들고, 리뷰 과정에서는 빌드·테스트 등을 실행할 수 있는
      Copilot SDK 셸 도구를 사용한다. Lite 단계는 여러 에이전트의 결과를 종합해 리뷰한다.
    papers: []
    relations: []
    topic_ids: []
    explanations: []
  - title: HD현대로보틱스, 에이딘에 130억 원 투자…로봇손·표면가공 공동 개발
    kind: 사건 뉴스
    region: 국내
    facts:
      who: HD현대로보틱스, 에이딘로보틱스, 삼성벤처투자
      when: 2026-09-11 지분 취득 발표; 에이딘 투자 유치 발표는 9월 10일
      where: 국내 조선·중공업 현장
      what: 지분 취득과 로봇손·표면가공 공동 개발
      how: 로봇 플랫폼에 힘·촉각 센서와 제어 기술 결합
      why: 미기재
    lead: HD현대로보틱스는 9월 11일 힘·촉각 센서 기업 에이딘로보틱스의 지분을 130억 원에 취득했다고 밝혔다. 자사 로봇 플랫폼에
      에이딘의 센서·제어 기술을 결합하고, 조선·중공업용 다섯 손가락 로봇손과 표면처리 자동화 솔루션을 공동 개발할 계획이다. 에이딘은
      HD현대로보틱스와 삼성벤처투자가 참여한 160억 원 규모 투자 유치를 마쳤다고 9월 10일 발표했으며, 투자금을 생산설비·품질
      검증·연구개발 인력 확충에 투입하겠다고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 선체 표면처리와 로봇손 적용
        paragraphs:
          - 표면처리 솔루션은 선체 외판과 블록 용접부 가공을 대상으로 개발해 조선소에 적용할 계획이다. 조선·중공업 현장에 맞춘 다섯
            손가락 로봇손은 HD현대로보틱스의 휴머노이드 로봇에 적용하는 구상이다.
        source_urls:
          - https://www.newspim.com/news/view/20260911000305
          - https://www1.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02932326645579136
      - heading: 양산 준비와 기존 공급 분야
        paragraphs:
          - 에이딘은 연간 3만 대 규모 생산체제를 구축할 계획이라고 밝혔다. 회사는 이미 방산, 반도체 장비 부품, 자동차 제조 현장
            등에 힘 제어 기반 표면가공 솔루션을 공급하고 있다.
        source_urls:
          - https://www1.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02932326645579136
  - title: FANUC, 도면에서 용접 조건·동작 생성하는 AI Welding Agent 개발
    kind: 사건 뉴스
    region: 해외
    facts:
      who: FANUC, Google Cloud
      when: 2026-09-11 개발 발표; 9월 16일 시연·12월 말 출하 예정
      where: 일본 도쿄 빅사이트 국제용접전시회
      what: AI Welding Agent 개발
      how: 도면 해석으로 용접 조건·로봇 동작 생성 및 실행
      why: 미기재
    lead: FANUC는 9월 11일 Google Cloud의 Gemini Enterprise를 활용해 부품 도면에서 로봇 아크용접 프로그램을
      생성·실행하는 AI Welding Agent를 개발했다고 발표했다. 시스템은 재료와 완성 형상을 읽어 전류·전압 조건과 로봇 동작을
      생성하며, 작업자는 생성 결과를 그대로 실행하거나 미세 조정할 수 있다. 회사는 9월 16일 도쿄 빅사이트에서 시작하는
      국제용접전시회에서 시연하고 2026년 12월 말 출하를 시작할 예정이라고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 도면 입력과 용접 전원 연결
        paragraphs:
          - CRX 태블릿 티치 펜던트에 내장된 카메라로 도면을 촬영하므로 별도 카메라나 전용 장치를 추가할 필요가 없다고 FANUC는
            설명했다. FANUC 로봇에 연결된 용접 전원은 특정 제조사 제품으로 제한하지 않는다는 설명이다.
        source_urls:
          - https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html
      - heading: 기존 FANUC 계약을 통한 구독
        paragraphs:
          - FANUC는 기존 FANUC 계약을 통해 서비스를 구독할 수 있으며, 별도의 Google Cloud 기업 계약이 반드시
            필요한 것은 아니라고 안내했다.
        source_urls:
          - https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html
  - title: RubyGems, 5월 악성 패키지 500개 이상 제거한 사건의 조사 결과 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: RubyGems 운영팀·Nightingale Collective
      when: 2026-09-11 조사 설명; 대응 사건은 2026년 5월
      where: rubygems.org
      what: 5월 스팸 패키지 사건 조사 결과 공개와 당시 운영 대응 설명
      how: 신규 가입 일시 중단·관련 계정 차단·악성 패키지 500개 이상 제거
      why: 관련 보도와 Nightingale Collective 연구 뒤 확인 내용을 설명
    lead: RubyGems 운영팀은 9월 11일 지난 5월 rubygems.org에서 벌어진 스팸 패키지 대량 게시 사건의 조사 결과를
      공개했다. 운영팀은 당시 신규 가입을 일시 중단하고 관련 계정을 차단·삭제했으며, 악성 패키지 500개 이상을 배포 목록에서 내렸다고
      밝혔다. 기존 이용자의 gem 설치와 패키지 게시는 유지됐고 신규 가입은 5월 16일 재개됐다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 운영팀의 확인 내용과 연구자의 주장
        paragraphs:
          - Nightingale Collective는 일부 패키지가 공유 Ruby 인프라에서 코드를 실행하고 공개 웹 데이터를 가져와
            다시 게시하도록 설계됐다고 설명했다.
          - 운영팀은 다른 이용자의 API 키를 얻으려는 시도가 성공했다는 증거를 찾지 못했다고 밝혔다. 연구자들은 활동을 OpenAI
            에이전트와 연결했지만, 운영팀은 AI가 패키지를 만들거나 게시했는지 판단할 수 없다고 했다.
        source_urls:
          - https://blog.rubygems.org/2026/09/11/update-may-spam-publishing-campaign.html
article_reviews:
  - title: OpenAI, 저장소 서비스 Rust로 재작성…발표 당시 요청 95% 처리
    event_id: 46fcf5bb7b99520f
    review_status: verified
    published_at: 2026-09-11
    reviewed_at: 2026-10-10
    concept_ids:
      - latency-percentiles
  - title: VS Code Agents 전용 창의 사용량을 별도로 집계
    event_id: 28ba300194033bae
    review_status: verified
    concept_ids: []
    published_at: 2026-09-11
    reviewed_at: 2026-09-28
  - title: Copilot, 수정된 코드 리뷰 댓글을 재검토 때 자동 정리
    event_id: f5b7434d849eacf1
    review_status: verified
    concept_ids: []
    published_at: 2026-09-11
    reviewed_at: 2026-09-28
  - title: HD현대로보틱스, 에이딘에 130억 원 투자…로봇손·표면가공 공동 개발
    event_id: 902d86854fec2b7d
    review_status: verified
    concept_ids: []
    published_at: 2026-09-11
    reviewed_at: 2026-10-09
  - title: FANUC, 도면에서 용접 조건·동작 생성하는 AI Welding Agent 개발
    event_id: eb739a02acad3ab9
    review_status: verified
    concept_ids:
      - agents
    published_at: 2026-09-11
    reviewed_at: 2026-10-09
  - title: RubyGems, 5월 악성 패키지 500개 이상 제거한 사건의 조사 결과 공개
    event_id: 67402935155ca6d3
    review_status: verified
    concept_ids:
      - supply-chain
    published_at: 2026-09-11
    reviewed_at: 2026-09-28
---

# 이번 호 표지

HD현대로보틱스, 에이딘에 130억 원 투자…로봇손·표면가공 공동 개발

# 차례

- HD현대로보틱스, 에이딘에 130억 원 투자…로봇손·표면가공 공동 개발
- FANUC, 도면에서 용접 조건·동작 생성하는 AI Welding Agent 개발
- RubyGems, 5월 악성 패키지 500개 이상 제거한 사건의 조사 결과 공개
- OpenAI, 저장소 서비스 Rust로 재작성…발표 당시 요청 95% 처리
- VS Code Agents 전용 창의 사용량을 별도로 집계

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI, 저장소 서비스 Rust로 재작성…발표 당시 요청 95% 처리

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 성능 개선
**기업·기관:** OpenAI

OpenAI는 9월 11일 온라인 저장소 서비스 Habitat의 확장 경험을 공개했다. 회사에 따르면 엔지니어 2명이 Codex와 GPT-5.5를 이용해 2026년 2분기에 서비스를 Rust로 재작성했으며, 발표 당시 운영 요청의 95%를 처리하고 있었다. OpenAI는 자사 측정에서 Python 버전 대비 CPU 효율 6배, 메모리 효율 15배를 기록했다고 밝혔다. [S1]

### 느린 요청을 추적한 배경

OpenAI는 Habitat의 Python 서비스에서 p99 이상 지연 요청의 추적 기록을 분석한 결과, 하위 저장소는 빨리 응답해도 코루틴 재스케줄링을 기다리느라 요청이 멈추는 경우가 잦았다고 설명했다.

회사 측정에서는 Rust 서비스가 Python 버전보다 평균 지연과 꼬리 지연도 낮았다고 밝혔다. [S1]

**개념:** [[Knowledge/Data Systems/Latency Percentiles]]

## VS Code Agents 전용 창의 사용량을 별도로 집계

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 11일 Copilot 사용량 보고서에 VS Code Agents 전용 창의 활동 지표를 정식으로 추가했다. 기업·조직의 1일 및 28일 집계 보고서에는 이 창의 활성 사용자 수, 세션 수, 사용자 메시지 수가 선택 항목으로 포함된다. 기업 소유자·결제 관리자·조직 소유자와 관련 조회 권한을 부여받은 사용자가 지표를 볼 수 있으며, Copilot 사용량 지표 정책도 켜져 있어야 한다. [S2]

### 별도로 집계하는 범위

GitHub는 전용 창의 지표를 편집기 창 Agent Mode와 일반 Copilot 사용량 집계와 구분한다.

사용자별 보고서에는 전용 창 사용 여부와 사용자별 세션·메시지 수가 포함된다. 해당 데이터가 없으면 선택 항목은 생략되거나 null로 표시될 수 있다. [S2]

## Copilot, 수정된 코드 리뷰 댓글을 재검토 때 자동 정리

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 11일 Copilot 코드 리뷰가 후속 커밋에서 해결된 자체 댓글을 다시 확인해 자동 종료하는 기능을 발표했다. Copilot의 수정 제안을 적용할 때는 변경 내용에 맞는 커밋 메시지를 만들고, 리뷰 과정에서는 빌드·테스트 등을 실행할 수 있는 Copilot SDK 셸 도구를 사용한다. Lite 단계는 여러 에이전트의 결과를 종합해 리뷰한다. [S3]

## HD현대로보틱스, 에이딘에 130억 원 투자…로봇손·표면가공 공동 개발

**분야:** 로봇·제조
**테마:** 투자·기업거래
**보조 테마:** 생산·공급망
**세부 태그:** 지분 투자, 설비 투자
**기업·기관:** HD현대로보틱스, 에이딘로보틱스, 삼성벤처투자

HD현대로보틱스는 9월 11일 힘·촉각 센서 기업 에이딘로보틱스의 지분을 130억 원에 취득했다고 밝혔다. 자사 로봇 플랫폼에 에이딘의 센서·제어 기술을 결합하고, 조선·중공업용 다섯 손가락 로봇손과 표면처리 자동화 솔루션을 공동 개발할 계획이다. 에이딘은 HD현대로보틱스와 삼성벤처투자가 참여한 160억 원 규모 투자 유치를 마쳤다고 9월 10일 발표했으며, 투자금을 생산설비·품질 검증·연구개발 인력 확충에 투입하겠다고 밝혔다. [S4] [S5]

### 선체 표면처리와 로봇손 적용

표면처리 솔루션은 선체 외판과 블록 용접부 가공을 대상으로 개발해 조선소에 적용할 계획이다. 조선·중공업 현장에 맞춘 다섯 손가락 로봇손은 HD현대로보틱스의 휴머노이드 로봇에 적용하는 구상이다. [S4] [S5]

### 양산 준비와 기존 공급 분야

에이딘은 연간 3만 대 규모 생산체제를 구축할 계획이라고 밝혔다. 회사는 이미 방산, 반도체 장비 부품, 자동차 제조 현장 등에 힘 제어 기반 표면가공 솔루션을 공급하고 있다. [S5]

## FANUC, 도면에서 용접 조건·동작 생성하는 AI Welding Agent 개발

**분야:** 로봇·제조
**테마:** 제품·서비스
**보조 테마:** 표준·생태계
**세부 태그:** 신제품, 기술 제휴
**기업·기관:** FANUC, Google Cloud

FANUC는 9월 11일 Google Cloud의 Gemini Enterprise를 활용해 부품 도면에서 로봇 아크용접 프로그램을 생성·실행하는 AI Welding Agent를 개발했다고 발표했다. 시스템은 재료와 완성 형상을 읽어 전류·전압 조건과 로봇 동작을 생성하며, 작업자는 생성 결과를 그대로 실행하거나 미세 조정할 수 있다. 회사는 9월 16일 도쿄 빅사이트에서 시작하는 국제용접전시회에서 시연하고 2026년 12월 말 출하를 시작할 예정이라고 밝혔다. [S6] [S7]

### 도면 입력과 용접 전원 연결

CRX 태블릿 티치 펜던트에 내장된 카메라로 도면을 촬영하므로 별도 카메라나 전용 장치를 추가할 필요가 없다고 FANUC는 설명했다. FANUC 로봇에 연결된 용접 전원은 특정 제조사 제품으로 제한하지 않는다는 설명이다. [S6]

### 기존 FANUC 계약을 통한 구독

FANUC는 기존 FANUC 계약을 통해 서비스를 구독할 수 있으며, 별도의 Google Cloud 기업 계약이 반드시 필요한 것은 아니라고 안내했다. [S6]

**개념:** [[Knowledge/AI Systems/AI Agents]]

## RubyGems, 5월 악성 패키지 500개 이상 제거한 사건의 조사 결과 공개

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** rubygems.org team, Nightingale Collective

RubyGems 운영팀은 9월 11일 지난 5월 rubygems.org에서 벌어진 스팸 패키지 대량 게시 사건의 조사 결과를 공개했다. 운영팀은 당시 신규 가입을 일시 중단하고 관련 계정을 차단·삭제했으며, 악성 패키지 500개 이상을 배포 목록에서 내렸다고 밝혔다. 기존 이용자의 gem 설치와 패키지 게시는 유지됐고 신규 가입은 5월 16일 재개됐다. [S8]

### 운영팀의 확인 내용과 연구자의 주장

Nightingale Collective는 일부 패키지가 공유 Ruby 인프라에서 코드를 실행하고 공개 웹 데이터를 가져와 다시 게시하도록 설계됐다고 설명했다.

운영팀은 다른 이용자의 API 키를 얻으려는 시도가 성공했다는 증거를 찾지 못했다고 밝혔다. 연구자들은 활동을 OpenAI 에이전트와 연결했지만, 운영팀은 AI가 패키지를 만들거나 게시했는지 판단할 수 없다고 했다. [S8]

**개념:** [[Knowledge/Software Engineering/Software Supply Chain Security]]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

[[Knowledge/Data Systems/Latency Percentiles|p95·p99 지연]]

# Source List

- [S1] https://openai.com/index/scaling-storage-one-billion-users-part-one/
- [S2] https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/
- [S3] https://github.blog/changelog/2026-09-11-auto-resolution-and-analysis-updates-in-copilot-code-review/
- [S4] https://www.newspim.com/news/view/20260911000305
- [S5] https://www1.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02932326645579136
- [S6] https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html
- [S7] https://www.fanuc.co.jp/ja/profile/pr/newsrelease/2026/news20260911.html
- [S8] https://blog.rubygems.org/2026/09/11/update-may-spam-publishing-campaign.html
