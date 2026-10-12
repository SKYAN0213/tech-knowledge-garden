---
title: Tech & AI Briefing - 16:05
time: 16:05
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-06-30
timezone: Asia/Seoul
coverage_start: 2026-06-30T06:02:28+09:00
coverage_end: 2026-06-30T16:05:57+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 6
new_items_count: 4
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security
    and Governance]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - Knowledge/AI Systems/Model Context Protocol
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Base44, 앱 생성용 자체 모델 Base1 운영 시작
  - Google·Public First, 영국 직장 내 AI 활용 비율 73% 보고
  - Claude Code v2.1.196, 조직 모델 설정·MCP 승인·백그라운드 복구 개선
  - AI SDK 7.0.8, 비디오 생성에 프레임 이미지·참조 입력 옵션 추가
article_records:
  - title: Base44, 앱 생성용 자체 모델 Base1 운영 시작
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Base44
      when: 2026-06-29
      where: 미기재
      what: 앱 생성용 자체 모델 Base1 운영
      how: 실제 앱 제작 피드백과 자체 실행 환경을 활용
      why: 비용·지연시간·품질을 제품 환경에 맞게 최적화
    lead: Wix는 2026년 6월 29일(한국시간) Base44가 앱 생성용 자체 모델 Base1을 출시해 플랫폼 사용자에게 제공하고 있다고
      발표했다. TechCrunch도 6월 30일(한국시간) 자연어 앱 제작을 지원하는 자체 모델의 도입 시작을 보도했다.
    explanations:
      - heading: 앱 제작 과정에서 얻는 학습 데이터
        paragraphs:
          - Wix에 따르면 모델 개발과 최적화에는 플랫폼의 수천만 건 실제 사용자 상호작용에서 만들어진 데이터셋을 사용했다. 창업자
            Maor Shlomo는 사용자의 요청, 에이전트가 만든 결과, 오류, 사용자의 수정과 수락·거절, 실제 앱의 작동 여부를
            피드백으로 살핀다고 설명했다.
        source_urls:
          - https://www.wix.com/press-room/home/post/base44-becomes-first-app-creation-platform-to-launch-its-own-proprietary-llm-base-1-marking-a-maj
          - https://base44.com/blog/maor-shlomo-building-the-model-behind-base
      - heading: 모델과 실행 환경을 함께 설계
        paragraphs:
          - Wix는 에이전트가 대화·코딩·여러 차례 이어지는 상호작용과 도구 사용, 실행 환경 관리, 백엔드 작업을 처리한다고
            설명했다. Shlomo는 모델을 둘러싼 실행 환경인 harness를 도구·맥락·작업 흐름·제품 환경의 묶음으로 설명하며,
            Base44가 이 환경을 직접 관리한다고 밝혔다.
          - Shlomo는 Base44가 프런트엔드와 백엔드를 보유하고, 자체 데이터베이스·백엔드·모델·이를 잇는 지능 계층을 함께
            갖추는 방향으로 확장한다고 설명했다.
        source_urls:
          - https://www.wix.com/press-room/home/post/base44-becomes-first-app-creation-platform-to-launch-its-own-proprietary-llm-base-1-marking-a-maj
          - https://base44.com/blog/maor-shlomo-building-the-model-behind-base
      - heading: 개발 인력과 평가 기반
        paragraphs:
          - Wix의 데이터 과학·연구팀은 Wix Harmony 학습 경험을 Base44 모델 개발에 적용한다. Wix 발표에 따르면
            샌드박스, 평가 프레임워크, 실험 파이프라인을 마련해 여러 에이전트 설정을 실시간으로 시험하고 실제 트래픽에 배포한다.
            모델 구축에는 Wix·Base44와 추론 서비스 제공업체들이 참여했다.
        source_urls:
          - https://www.wix.com/press-room/home/post/base44-becomes-first-app-creation-platform-to-launch-its-own-proprietary-llm-base-1-marking-a-maj
      - heading: 비용 최적화와 후속 개발 방향
        paragraphs:
          - TechCrunch는 Shlomo가 모델을 직접 학습·보유하면 지연시간·비용·효율을 더 세밀하게 최적화할 수 있다고
            설명했다고 전했다. Wix는 컴퓨팅과 추론 지출을 직접 관리해 시간이 흐르면서 마진이 개선될 것으로 기대한다고 밝혔다.
          - Shlomo는 작업에 적합한 경우 외부의 고성능 모델도 계속 사용하겠다고 밝혔다. 후속 개발에서는 코드를 구현하는 능력과
            함께 제품 설계 판단, 다음 요구 예측, 더 나은 경로 제안을 학습시키며 기술 파트너 역할을 목표로 한다.
        source_urls:
          - https://www.wix.com/press-room/home/post/base44-becomes-first-app-creation-platform-to-launch-its-own-proprietary-llm-base-1-marking-a-maj
          - https://base44.com/blog/maor-shlomo-building-the-model-behind-base
          - https://techcrunch.com/2026/06/29/vibe-coding-platform-base44-launches-own-model-as-ai-startups-seek-defensibility/
    papers: []
    relations: []
    topic_ids: []
  - title: Google·Public First, 영국 직장 내 AI 활용 비율 73% 보고
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Google은 2026년 6월 30일(한국시간) Public First와 진행한 영국 직장 내 AI 활용 조사를 소개했다. 발표에
      따르면 직장 내 AI 활용 비율은 2025년 34%에서 2026년 73%로 늘었으며, 활용 수준에 따라 직장인을 네 집단으로 나눴다.
    explanations:
      - heading: 네 집단과 활용 양상
        paragraphs:
          - AI를 아직 시험하지 않는 Spectators는 10%, 간단한 작업부터 시험하는 Experimenters는 38%,
            일상에서 꾸준히 사용하는 Practitioners는 37%, 새로운 작업 방식을 찾아 쓰는 고급 사용자
            Trailblazers는 15%로 분류했다.
          - Google은 Trailblazers가 개인 생활과 업무를 합쳐 근무 주당 거의 8시간을 절약한다고 소개했다.
            나이·산업·성별·민족·교육·기업 규모의 차이를 고려한 뒤에도 깊은 AI 활용과 경력 진전이 연관돼 있었다고 밝혔다.
        source_urls:
          - https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/unlocking-britains-next-era-of-productivity-building-a-nation-of-ai-trailblazers/
      - heading: 행동·인식·조직의 장벽
        paragraphs:
          - 발표는 질문 한 번으로 끝내는 습관, 프롬프트를 반복해서 다듬지 않는 방식, 작업에 맞는 도구 선택과 텍스트·시각·음성
            입력 및 에이전트 작업 흐름에 대한 익숙함을 행동상의 과제로 짚었다.
          - 검색창처럼 사용하는 인식도 장벽으로 꼽았다. 이전 AI 사용자 중 더 나은 프롬프트를 작성하도록 AI에 요청한 경험은
            37%였다. Google에 따르면 명확한 업무 지침을 가진 AI 사용자는 3분의 1이고, 책임 있는 사용에 대해 누구에게
            물어야 하는지 아는 사람은 절반 미만이었다.
        source_urls:
          - https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/unlocking-britains-next-era-of-productivity-building-a-nation-of-ai-trailblazers/
      - heading: 진단 도구와 교육 계획
        paragraphs:
          - Google은 Public First가 자신의 활용 수준을 비교하고 사용자 유형을 확인하는 AI skills quiz를
            공개한다고 안내했다.
          - AI Works for Britain은 지난 10년 동안 120만 명 이상을 교육한 Google Digital
            Garage를 기반으로 AI 활용 격차를 줄이는 프로그램이다. Google은 정부와의 협력을 통해 2030년까지 근로자
            1,000만 명에게 AI 기술을 교육한다는 목표를 지원한다고 밝혔다.
        source_urls:
          - https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/unlocking-britains-next-era-of-productivity-building-a-nation-of-ai-trailblazers/
    papers: []
    relations: []
    topic_ids: []
  - title: Claude Code v2.1.196, 조직 모델 설정·MCP 승인·백그라운드 복구 개선
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Claude Code는 2026년 6월 30일(한국시간) v2.1.196 릴리스에서 조직 관리자의 기본 모델 설정을 지원했다. MCP
      서버 승인 경계를 수정하고, 프로세스가 중지·재시작·업데이트돼도 긴 백그라운드 작업을 유지하도록 개선했다.
    explanations:
      - heading: 조직 설정과 파일 접근
        paragraphs:
          - 관리자가 조직 콘솔에서 기본 모델을 정하면, 사용자가 직접 모델을 선택하지 않은 경우 /model에 Org default
            또는 Role default로 표시된다. 세션을 시작할 때 읽기 쉬운 기본 이름을 붙이고, 채팅에 첨부한 파일은
            Cmd/Ctrl 키와 함께 클릭해 Finder나 Explorer에서 찾을 수 있다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.196
      - heading: MCP 서버와 인증 범위
        paragraphs:
          - claude mcp list/get은 저장소에 커밋된 .claude/settings.json의 자체 승인만으로
            .mcp.json 서버를 실행하지 않는다. 신뢰하지 않는 작업 공간에는 Pending approval을 표시한다.
          - MCP OAuth에서 scope를 지정하지 않았을 때 인증 서버의 scopes_supported 전체 목록을 요청해
            GitLab 자체 호스팅과 기업 인증 제공자에서 invalid_scope 오류가 발생하던 동작도 수정했다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.196
      - heading: 백그라운드 작업과 원격 세션 복구
        paragraphs:
          - 백그라운드 작업을 깨울 때 실제 대화 기록을 잘못 읽어 파일을 영구 삭제하고 원래 프롬프트를 다시 실행하던 오류를
            수정했다. 이제 해당 파일은 삭제하지 않고 별도로 둔다.
          - 긴 명령과 작업 흐름은 세션 프로세스를 중지·재시작·업데이트해도 유지한다. Windows에서는 백그라운드 셸을 종료하는
            대신 인계한다. daemon 재시작으로 종료된 에이전트 worker는 다음 agents 화면 열기 때 중단 지점부터 이어서
            실행한다.
          - 서버 재시작으로 실행 중 끊긴 Remote 세션은 다음 worker에서 자동으로 재개하도록 수정했다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.196
      - heading: 검토 비용과 운영 동작
        paragraphs:
          - 릴리스 설명에 따르면 /code-review는 코드 정리 항목을 찾는 모듈 5개를 하나로 통합해 토큰 사용량을 약 25%
            줄였다. 병렬 요청 중 사용량 한도에 도달하면 경고가 깜박이고 집계가 중복되던 오류도 수정했다.
            /deep-research의 검증기 오류는 모든 주장이 반박됐다는 결과로 표시하지 않고 미검증으로 구분한다.
          - 모든 제공자에서 스트리밍 유휴 감시 기능을 기본으로 켰다. 응답 스트림에 5분 동안 이벤트가 없으면 중단 후 재시도하며,
            CLAUDE_ENABLE_STREAM_WATCHDOG=0으로 끌 수 있다. ANTHROPIC_BASE_URL이
            Anthropic 이외의 호스트를 가리키면 Remote Control은 비활성화한다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.196
    papers: []
    relations: []
    topic_ids: []
  - title: AI SDK 7.0.8, 비디오 생성에 프레임 이미지·참조 입력 옵션 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Vercel의 AI SDK는 2026년 6월 30일(한국시간) ai@7.0.8 패키지를 공개했다. 비디오 생성 호출에
      frameImages와 inputReferences를 정식 옵션으로 추가했다.
    explanations:
      - heading: 변경된 호출 옵션과 의존성
        paragraphs:
          - 이번 변경은 비디오 생성 호출에서 프레임 이미지와 참조 입력을 별도 옵션으로 받도록 한다. 릴리스에는
            @ai-sdk/provider 4.0.1, @ai-sdk/gateway 4.0.6,
            @ai-sdk/provider-utils 5.0.2로의 의존성 갱신도 포함한다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/ai%407.0.8
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Base44, 앱 생성용 자체 모델 Base1 운영 시작
    event_id: 559a10d0dfda2d93
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T02:28:41+00:00
  - title: Google·Public First, 영국 직장 내 AI 활용 비율 73% 보고
    event_id: 2987e3b3c79a3a0a
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T06:00:00+00:00
  - title: Claude Code v2.1.196, 조직 모델 설정·MCP 승인·백그라운드 복구 개선
    event_id: a3d36f8b621698a5
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids:
      - agents
      - mcp
    date_kind: source-publication-time
    source_published_at: 2026-06-29T23:27:32Z
  - title: AI SDK 7.0.8, 비디오 생성에 프레임 이미지·참조 입력 옵션 추가
    event_id: 940d319c8ef1fe0c
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T04:07:36Z
---

# 이번 호 표지

Base44, 앱 생성용 자체 모델 Base1 운영 시작

# 차례

- Base44, 앱 생성용 자체 모델 Base1 운영 시작
- Google·Public First, 영국 직장 내 AI 활용 비율 73% 보고
- Claude Code v2.1.196, 조직 모델 설정·MCP 승인·백그라운드 복구 개선
- AI SDK 7.0.8, 비디오 생성에 프레임 이미지·참조 입력 옵션 추가

# 커버 스토리

없음

# 뉴스 데스크

## Base44, 앱 생성용 자체 모델 Base1 운영 시작

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Base44, Wix

Wix는 2026년 6월 29일(한국시간) Base44가 앱 생성용 자체 모델 Base1을 출시해 플랫폼 사용자에게 제공하고 있다고 발표했다. TechCrunch도 6월 30일(한국시간) 자연어 앱 제작을 지원하는 자체 모델의 도입 시작을 보도했다. [S1] [S2] [S3]

### 앱 제작 과정에서 얻는 학습 데이터

Wix에 따르면 모델 개발과 최적화에는 플랫폼의 수천만 건 실제 사용자 상호작용에서 만들어진 데이터셋을 사용했다. 창업자 Maor Shlomo는 사용자의 요청, 에이전트가 만든 결과, 오류, 사용자의 수정과 수락·거절, 실제 앱의 작동 여부를 피드백으로 살핀다고 설명했다. [S1] [S2]

### 모델과 실행 환경을 함께 설계

Wix는 에이전트가 대화·코딩·여러 차례 이어지는 상호작용과 도구 사용, 실행 환경 관리, 백엔드 작업을 처리한다고 설명했다. Shlomo는 모델을 둘러싼 실행 환경인 harness를 도구·맥락·작업 흐름·제품 환경의 묶음으로 설명하며, Base44가 이 환경을 직접 관리한다고 밝혔다.

Shlomo는 Base44가 프런트엔드와 백엔드를 보유하고, 자체 데이터베이스·백엔드·모델·이를 잇는 지능 계층을 함께 갖추는 방향으로 확장한다고 설명했다. [S1] [S2]

### 개발 인력과 평가 기반

Wix의 데이터 과학·연구팀은 Wix Harmony 학습 경험을 Base44 모델 개발에 적용한다. Wix 발표에 따르면 샌드박스, 평가 프레임워크, 실험 파이프라인을 마련해 여러 에이전트 설정을 실시간으로 시험하고 실제 트래픽에 배포한다. 모델 구축에는 Wix·Base44와 추론 서비스 제공업체들이 참여했다. [S1]

### 비용 최적화와 후속 개발 방향

TechCrunch는 Shlomo가 모델을 직접 학습·보유하면 지연시간·비용·효율을 더 세밀하게 최적화할 수 있다고 설명했다고 전했다. Wix는 컴퓨팅과 추론 지출을 직접 관리해 시간이 흐르면서 마진이 개선될 것으로 기대한다고 밝혔다.

Shlomo는 작업에 적합한 경우 외부의 고성능 모델도 계속 사용하겠다고 밝혔다. 후속 개발에서는 코드를 구현하는 능력과 함께 제품 설계 판단, 다음 요구 예측, 더 나은 경로 제안을 학습시키며 기술 파트너 역할을 목표로 한다. [S1] [S2] [S3]

## Google·Public First, 영국 직장 내 AI 활용 비율 73% 보고

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** Google, Public First

Google은 2026년 6월 30일(한국시간) Public First와 진행한 영국 직장 내 AI 활용 조사를 소개했다. 발표에 따르면 직장 내 AI 활용 비율은 2025년 34%에서 2026년 73%로 늘었으며, 활용 수준에 따라 직장인을 네 집단으로 나눴다. [S4]

### 네 집단과 활용 양상

AI를 아직 시험하지 않는 Spectators는 10%, 간단한 작업부터 시험하는 Experimenters는 38%, 일상에서 꾸준히 사용하는 Practitioners는 37%, 새로운 작업 방식을 찾아 쓰는 고급 사용자 Trailblazers는 15%로 분류했다.

Google은 Trailblazers가 개인 생활과 업무를 합쳐 근무 주당 거의 8시간을 절약한다고 소개했다. 나이·산업·성별·민족·교육·기업 규모의 차이를 고려한 뒤에도 깊은 AI 활용과 경력 진전이 연관돼 있었다고 밝혔다. [S4]

### 행동·인식·조직의 장벽

발표는 질문 한 번으로 끝내는 습관, 프롬프트를 반복해서 다듬지 않는 방식, 작업에 맞는 도구 선택과 텍스트·시각·음성 입력 및 에이전트 작업 흐름에 대한 익숙함을 행동상의 과제로 짚었다.

검색창처럼 사용하는 인식도 장벽으로 꼽았다. 이전 AI 사용자 중 더 나은 프롬프트를 작성하도록 AI에 요청한 경험은 37%였다. Google에 따르면 명확한 업무 지침을 가진 AI 사용자는 3분의 1이고, 책임 있는 사용에 대해 누구에게 물어야 하는지 아는 사람은 절반 미만이었다. [S4]

### 진단 도구와 교육 계획

Google은 Public First가 자신의 활용 수준을 비교하고 사용자 유형을 확인하는 AI skills quiz를 공개한다고 안내했다.

AI Works for Britain은 지난 10년 동안 120만 명 이상을 교육한 Google Digital Garage를 기반으로 AI 활용 격차를 줄이는 프로그램이다. Google은 정부와의 협력을 통해 2030년까지 근로자 1,000만 명에게 AI 기술을 교육한다는 목표를 지원한다고 밝혔다. [S4]

## Claude Code v2.1.196, 조직 모델 설정·MCP 승인·백그라운드 복구 개선

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가, 오류 수정
**기업·기관:** Anthropic

Claude Code는 2026년 6월 30일(한국시간) v2.1.196 릴리스에서 조직 관리자의 기본 모델 설정을 지원했다. MCP 서버 승인 경계를 수정하고, 프로세스가 중지·재시작·업데이트돼도 긴 백그라운드 작업을 유지하도록 개선했다. [S5]

### 조직 설정과 파일 접근

관리자가 조직 콘솔에서 기본 모델을 정하면, 사용자가 직접 모델을 선택하지 않은 경우 /model에 Org default 또는 Role default로 표시된다. 세션을 시작할 때 읽기 쉬운 기본 이름을 붙이고, 채팅에 첨부한 파일은 Cmd/Ctrl 키와 함께 클릭해 Finder나 Explorer에서 찾을 수 있다. [S5]

### MCP 서버와 인증 범위

claude mcp list/get은 저장소에 커밋된 .claude/settings.json의 자체 승인만으로 .mcp.json 서버를 실행하지 않는다. 신뢰하지 않는 작업 공간에는 Pending approval을 표시한다.

MCP OAuth에서 scope를 지정하지 않았을 때 인증 서버의 scopes\_supported 전체 목록을 요청해 GitLab 자체 호스팅과 기업 인증 제공자에서 invalid\_scope 오류가 발생하던 동작도 수정했다. [S5]

### 백그라운드 작업과 원격 세션 복구

백그라운드 작업을 깨울 때 실제 대화 기록을 잘못 읽어 파일을 영구 삭제하고 원래 프롬프트를 다시 실행하던 오류를 수정했다. 이제 해당 파일은 삭제하지 않고 별도로 둔다.

긴 명령과 작업 흐름은 세션 프로세스를 중지·재시작·업데이트해도 유지한다. Windows에서는 백그라운드 셸을 종료하는 대신 인계한다. daemon 재시작으로 종료된 에이전트 worker는 다음 agents 화면 열기 때 중단 지점부터 이어서 실행한다.

서버 재시작으로 실행 중 끊긴 Remote 세션은 다음 worker에서 자동으로 재개하도록 수정했다. [S5]

### 검토 비용과 운영 동작

릴리스 설명에 따르면 /code-review는 코드 정리 항목을 찾는 모듈 5개를 하나로 통합해 토큰 사용량을 약 25% 줄였다. 병렬 요청 중 사용량 한도에 도달하면 경고가 깜박이고 집계가 중복되던 오류도 수정했다. /deep-research의 검증기 오류는 모든 주장이 반박됐다는 결과로 표시하지 않고 미검증으로 구분한다.

모든 제공자에서 스트리밍 유휴 감시 기능을 기본으로 켰다. 응답 스트림에 5분 동안 이벤트가 없으면 중단 후 재시도하며, CLAUDE\_ENABLE\_STREAM\_WATCHDOG=0으로 끌 수 있다. ANTHROPIC\_BASE\_URL이 Anthropic 이외의 호스트를 가리키면 Remote Control은 비활성화한다. [S5]

**개념:** [[Knowledge/AI Systems/AI Agents]], [[Knowledge/AI Systems/Model Context Protocol]]

## AI SDK 7.0.8, 비디오 생성에 프레임 이미지·참조 입력 옵션 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

Vercel의 AI SDK는 2026년 6월 30일(한국시간) ai@7.0.8 패키지를 공개했다. 비디오 생성 호출에 frameImages와 inputReferences를 정식 옵션으로 추가했다. [S6]

### 변경된 호출 옵션과 의존성

이번 변경은 비디오 생성 호출에서 프레임 이미지와 참조 입력을 별도 옵션으로 받도록 한다. 릴리스에는 @ai-sdk/provider 4.0.1, @ai-sdk/gateway 4.0.6, @ai-sdk/provider-utils 5.0.2로의 의존성 갱신도 포함한다. [S6]

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

- [S1] https://www.wix.com/press-room/home/post/base44-becomes-first-app-creation-platform-to-launch-its-own-proprietary-llm-base-1-marking-a-maj
- [S2] https://base44.com/blog/maor-shlomo-building-the-model-behind-base
- [S3] https://techcrunch.com/2026/06/29/vibe-coding-platform-base44-launches-own-model-as-ai-startups-seek-defensibility/
- [S4] https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/unlocking-britains-next-era-of-productivity-building-a-nation-of-ai-trailblazers/
- [S5] https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.196
- [S6] https://api.github.com/repos/vercel/ai/releases/tags/ai%407.0.8
