---
title: Tech & AI Briefing - 00:04
time: 00:04
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-01
timezone: Asia/Seoul
coverage_start: 2026-06-30T16:05:57+09:00
coverage_end: 2026-07-01T00:04:06+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 5
new_items_count: 5
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security
    and Governance]]"
  - "[[Knowledge/AI Systems/Vision-Language-Action Models|Vision-Language-Action
    Models]]"
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
  - Knowledge/AI Systems/OpenUSD
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GitHub, Dependabot의 npm 설정 추론 중단…scope를 우선 적용
  - GitHub, 오래된 Dependabot 보안 알림을 CSV 보관으로 전환 예고
  - NVIDIA, 결함 검사·도시 영상·작업 검증용 비전 AI 구현 지침 공개
  - AWS, 고객 현장에 AI 엔지니어를 투입하는 전담 조직 출범
  - OKX, AI 에이전트가 서비스를 고용하고 결제하는 시장 공개
article_records:
  - title: GitHub, Dependabot의 npm 설정 추론 중단…scope를 우선 적용
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 30일(한국시간) Dependabot이 npm 비공개 레지스트리의 .npmrc 설정을
      lockfile에서 추론하는 방식을 중단한다고 발표했다. 대신 dependabot.yml의 registry에 scope를 지정하면 그
      설정으로 .npmrc를 생성한다.
    explanations:
      - heading: 설정의 우선순위
        paragraphs:
          - scope를 지정하면 저장소에 커밋한 .npmrc를 포함한 다른 설정 출처보다 우선한다. scope를 지정하지 않았고
            저장소에 .npmrc가 있으면 기존 파일을 계속 사용한다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-dependabot-no-longer-infers-npmrc
      - heading: 변경 배경
        paragraphs:
          - GitHub는 기존 방식이 lockfile의 resolved URL을 읽어 .npmrc를 재구성했다고 설명했다. 잘못된
            URL, npm·Yarn·pnpm 사이의 lockfile 형식 차이 등이 레지스트리 인증 실패를 일으켰다는 설명이다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-dependabot-no-longer-infers-npmrc
      - heading: 제공 대상
        paragraphs:
          - 모든 github.com 사용자가 이용할 수 있으며, GitHub Enterprise Server에서는 3.23 버전에
            포함될 예정이다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-dependabot-no-longer-infers-npmrc
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 오래된 Dependabot 보안 알림을 CSV 보관으로 전환 예고
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 30일(한국시간) 닫힌 Dependabot 보안 알림에 대한 데이터 보존 정책을 예고했다. 정책은
      github.com과 GitHub Enterprise Cloud에 적용하며 GitHub Enterprise Server는 대상에서
      제외한다.
    explanations:
      - heading: 열린 알림과 닫힌 알림의 조회 범위
        paragraphs:
          - 열린 알림은 오래돼도 화면과 API에서 조회할 수 있고, 닫힌 알림은 종료 후 2년 동안 조회할 수 있다. 그보다 오래된
            닫힌 알림은 보관 저장소로 옮기고, 기업·조직·저장소 관리자와 보안 관리자가 해당 수준의 보안 알림 페이지에서 CSV로
            내려받도록 한다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-cloud-data-retention-policy-for-closed-security-alerts
      - heading: 갱신된 공지의 적용 일정
        paragraphs:
          - 갱신된 공지는 적용 예정일을 2026년 9월 25일로 명시한다. Dependabot 이외의 알림 유형에 대한 변경 일정은
            시행 최소 60일 전에 changelog로 알리겠다고 밝혔다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-cloud-data-retention-policy-for-closed-security-alerts
      - heading: 보관 기간과 저장 지역
        paragraphs:
          - GitHub는 계정이 유지되는 동안 보관 알림의 원래 내용을 보존한다고 설명했다. 데이터 거주 지역을 지정한
            Enterprise Cloud에서는 보관 알림도 기존 데이터와 같은 지역에 남는다. 관련 저장소·조직·계정을 삭제하거나
            기업 계약이 종료되면 알림 데이터도 삭제된다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-cloud-data-retention-policy-for-closed-security-alerts
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, 결함 검사·도시 영상·작업 검증용 비전 AI 구현 지침 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: NVIDIA는 2026년 6월 30일(한국시간) 합성 결함 이미지 생성·영상 데이터 보강·TAO 미세 조정·영상 검색과 요약을
      연결하는 비전 AI 구현 지침을 공개했다. 카메라와 장비 가까이에서 동작하는 에이전트의 지연시간·전력·비용·연결성·현장 조건을 고려해
      학습 데이터 생성부터 모델 조정과 배포까지 구성한다.
    explanations:
      - heading: 실제 결함 이미지와 합성 데이터
        paragraphs:
          - NVIDIA는 Roboflow가 Defect Image Generation skill과 Cosmos를 비전 AI 플랫폼에
            통합해 실제 학습 자료가 부족할 때 Corning 같은 고객을 위한 합성 결함 이미지를 만드는 사례를 소개했다.
          - 회사에 따르면 Corning의 광섬유 제조 엔지니어링팀과 진행한 벤치마크에서 실제 결함 이미지 8개를 합성 데이터로 보강해
            학습한 모델은 가장 어려운 결함 종류에서 평균 정밀도 95%와 완전한 재현율을 얻었다.
        source_urls:
          - https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
      - heading: 도시 환경을 만들고 영상 작업을 연결
        paragraphs:
          - OpenUSD는 3D 세계를 기술·합성·재사용하는 공통 구조이며, 이를 기반으로 한 Omniverse는
            조명·날씨·교통·카메라 각도·가림 조건을 달리한 시뮬레이션과 합성데이터·디지털 트윈을 구성한다.
          - Linker Vision 사례는 VSS로 검색·요약·알림·보고·스트림 관리를 구성하고, Omniverse 디지털 트윈으로
            도시 환경을 시험하며, Cosmos로 영상을 보강하고 TAO로 모델을 미세 조정한다. NVIDIA는 가오슝 사례의 개발
            작업량이 85%, 사고 대응 시간이 최대 80% 줄었다고 소개했다.
        source_urls:
          - https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
      - heading: 작업 순서와 표준 절차 확인
        paragraphs:
          - Foxconn에서 사용하는 DeepHow의 Live SOP Verification agent는 Metropolis VSS로
            영상 검색·요약·분석을 수행하고 Cosmos로 조립 동작과 순서가 표준 작업 절차에 맞는지 해석한다.
          - NVIDIA는 GB300 서버 생산 라인 사례에서 초회 통과 수율이 3% 개선됐고, 핵심 작업 단계의 미세 동작을 이해하는
            과제 수준 정확도가 99%였다고 밝혔다.
        source_urls:
          - https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, 고객 현장에 AI 엔지니어를 투입하는 전담 조직 출범
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-07-01
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: TechCrunch는 2026년 7월 1일(한국시간) AWS가 AI 전진 배치 엔지니어(FDE)를 위한 내부 조직을 출범했다고
      보도했다. 이 조직의 엔지니어는 고객사에 들어가 용도에 맞는 에이전트를 구축하고, 짧은 도입 과정과 고객의 자체 운영 역량 확보에
      집중할 예정이다.
    explanations:
      - heading: 고객 환경에 들어가는 개발 방식
        paragraphs:
          - FDE는 공급사 엔지니어가 시스템을 구축하는 동안 고객사에 임시로 들어가 현장의 기회와 문제에 직접 대응하는 방식이다.
            TechCrunch는 배포 간 재사용할 수 있는 기술을 각 회사의 업무 흐름에 맞추는 구조라고 설명했다.
        source_urls:
          - https://techcrunch.com/2026/06/30/amazon-launches-new-1-billion-fde-org-following-openai-and-anthropic/
      - heading: 내부 자원 배분
        paragraphs:
          - 보도에 따르면 Amazon은 새 조직에 10억 달러 상당의 내부 자원을 배정할 계획이라고 밝혔다.
        source_urls:
          - https://techcrunch.com/2026/06/30/amazon-launches-new-1-billion-fde-org-following-openai-and-anthropic/
      - heading: AWS가 밝힌 목표
        paragraphs:
          - TechCrunch가 인용한 AWS Frontier AI 부사장 Francessca Vasquez의 설명은 고객의 AWS
            환경에 목적별 에이전트를 구축하고, 고객에게 AI 기술·업무 흐름·재사용 패턴과 개발 역량을 남기는 것이다.
        source_urls:
          - https://techcrunch.com/2026/06/30/amazon-launches-new-1-billion-fde-org-following-openai-and-anthropic/
    papers: []
    relations: []
    topic_ids: []
  - title: OKX, AI 에이전트가 서비스를 고용하고 결제하는 시장 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-30
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: TechCrunch는 2026년 6월 30일(한국시간) OKX가 AI 에이전트끼리 서비스를 고용하고 결제하며 온체인 평판을 쌓는
      시장을 개발자에게 공개한다고 보도했다. 50개 초기 서비스 제공자가 참여한 폐쇄 베타를 거쳐 공개하며, 개발자는 OnchainOS에서
      OKX 계정 없이 접근할 수 있다.
    explanations:
      - heading: 개발자와 에이전트 도구
        paragraphs:
          - OKX가 겨냥한 이용자는 암호화폐 개발자와 개인 사업자이며, 개발자가 여러 에이전트의 서비스를 조합한 앱을 만드는 구조다.
            회사는 Claude Code·Codex·Hermes·OpenClaw와 함께 사용할 수 있다고 설명했다.
        source_urls:
          - https://techcrunch.com/2026/06/30/crypto-exchange-okx-wants-ai-agents-to-hire-and-pay-each-other/
      - heading: 서비스 고용과 사용량별 결제
        paragraphs:
          - 보도에서 CertiK는 거래 전 지갑과 토큰의 보안 확인, CoinAnk는 조회마다 비용을 지불하는 실시간 데이터 제공,
            GenLayer는 에이전트 사이의 분쟁 해결을 맡는 예로 소개됐다.
          - OKX는 블록체인과 스테이블코인을 이용하면 에이전트가 시간 제약 없이 소액 결제를 할 수 있다고 설명했다.
        source_urls:
          - https://techcrunch.com/2026/06/30/crypto-exchange-okx-wants-ai-agents-to-hire-and-pay-each-other/
      - heading: 거래 통제와 공개 범위
        paragraphs:
          - TechCrunch가 인용한 OKX의 Haider Rafique는 기존 거래소의 사기 탐지·규정 준수·내부 인프라를 이
            시장에 적용한다고 말했다. 제공 범위는 단계적으로 확대한다.
        source_urls:
          - https://techcrunch.com/2026/06/30/crypto-exchange-okx-wants-ai-agents-to-hire-and-pay-each-other/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub, Dependabot의 npm 설정 추론 중단…scope를 우선 적용
    event_id: c54465745fc299ec
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T06:53:48-07:00
  - title: GitHub, 오래된 Dependabot 보안 알림을 CSV 보관으로 전환 예고
    event_id: c12b394bcd713139
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T06:24:21-07:00
  - title: NVIDIA, 결함 검사·도시 영상·작업 검증용 비전 AI 구현 지침 공개
    event_id: a5ac4346ca76b814
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids:
      - openusd
    date_kind: source-publication-time
    source_published_at: 2026-06-30T13:00:27+00:00
  - title: AWS, 고객 현장에 AI 엔지니어를 투입하는 전담 조직 출범
    event_id: d6adaabeb707b608
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T15:00:00+00:00
  - title: OKX, AI 에이전트가 서비스를 고용하고 결제하는 시장 공개
    event_id: 2783ddb1c4c5abed
    review_status: verified
    published_at: 2026-06-30
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T09:00:00+00:00
---

# 이번 호 표지

GitHub, Dependabot의 npm 설정 추론 중단…scope를 우선 적용

# 차례

- GitHub, Dependabot의 npm 설정 추론 중단…scope를 우선 적용
- GitHub, 오래된 Dependabot 보안 알림을 CSV 보관으로 전환 예고
- NVIDIA, 결함 검사·도시 영상·작업 검증용 비전 AI 구현 지침 공개
- AWS, 고객 현장에 AI 엔지니어를 투입하는 전담 조직 출범
- OKX, AI 에이전트가 서비스를 고용하고 결제하는 시장 공개

# 커버 스토리

없음

# 뉴스 데스크

## GitHub, Dependabot의 npm 설정 추론 중단…scope를 우선 적용

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** GitHub

GitHub는 2026년 6월 30일(한국시간) Dependabot이 npm 비공개 레지스트리의 .npmrc 설정을 lockfile에서 추론하는 방식을 중단한다고 발표했다. 대신 dependabot.yml의 registry에 scope를 지정하면 그 설정으로 .npmrc를 생성한다. [S1]

### 설정의 우선순위

scope를 지정하면 저장소에 커밋한 .npmrc를 포함한 다른 설정 출처보다 우선한다. scope를 지정하지 않았고 저장소에 .npmrc가 있으면 기존 파일을 계속 사용한다. [S1]

### 변경 배경

GitHub는 기존 방식이 lockfile의 resolved URL을 읽어 .npmrc를 재구성했다고 설명했다. 잘못된 URL, npm·Yarn·pnpm 사이의 lockfile 형식 차이 등이 레지스트리 인증 실패를 일으켰다는 설명이다. [S1]

### 제공 대상

모든 github.com 사용자가 이용할 수 있으며, GitHub Enterprise Server에서는 3.23 버전에 포함될 예정이다. [S1]

## GitHub, 오래된 Dependabot 보안 알림을 CSV 보관으로 전환 예고

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** GitHub

GitHub는 2026년 6월 30일(한국시간) 닫힌 Dependabot 보안 알림에 대한 데이터 보존 정책을 예고했다. 정책은 github.com과 GitHub Enterprise Cloud에 적용하며 GitHub Enterprise Server는 대상에서 제외한다. [S2]

### 열린 알림과 닫힌 알림의 조회 범위

열린 알림은 오래돼도 화면과 API에서 조회할 수 있고, 닫힌 알림은 종료 후 2년 동안 조회할 수 있다. 그보다 오래된 닫힌 알림은 보관 저장소로 옮기고, 기업·조직·저장소 관리자와 보안 관리자가 해당 수준의 보안 알림 페이지에서 CSV로 내려받도록 한다. [S2]

### 갱신된 공지의 적용 일정

갱신된 공지는 적용 예정일을 2026년 9월 25일로 명시한다. Dependabot 이외의 알림 유형에 대한 변경 일정은 시행 최소 60일 전에 changelog로 알리겠다고 밝혔다. [S2]

### 보관 기간과 저장 지역

GitHub는 계정이 유지되는 동안 보관 알림의 원래 내용을 보존한다고 설명했다. 데이터 거주 지역을 지정한 Enterprise Cloud에서는 보관 알림도 기존 데이터와 같은 지역에 남는다. 관련 저장소·조직·계정을 삭제하거나 기업 계약이 종료되면 알림 데이터도 삭제된다. [S2]

## NVIDIA, 결함 검사·도시 영상·작업 검증용 비전 AI 구현 지침 공개

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** NVIDIA, Roboflow, Corning, Linker Vision, DeepHow, Foxconn

NVIDIA는 2026년 6월 30일(한국시간) 합성 결함 이미지 생성·영상 데이터 보강·TAO 미세 조정·영상 검색과 요약을 연결하는 비전 AI 구현 지침을 공개했다. 카메라와 장비 가까이에서 동작하는 에이전트의 지연시간·전력·비용·연결성·현장 조건을 고려해 학습 데이터 생성부터 모델 조정과 배포까지 구성한다. [S3]

### 실제 결함 이미지와 합성 데이터

NVIDIA는 Roboflow가 Defect Image Generation skill과 Cosmos를 비전 AI 플랫폼에 통합해 실제 학습 자료가 부족할 때 Corning 같은 고객을 위한 합성 결함 이미지를 만드는 사례를 소개했다.

회사에 따르면 Corning의 광섬유 제조 엔지니어링팀과 진행한 벤치마크에서 실제 결함 이미지 8개를 합성 데이터로 보강해 학습한 모델은 가장 어려운 결함 종류에서 평균 정밀도 95%와 완전한 재현율을 얻었다. [S3]

### 도시 환경을 만들고 영상 작업을 연결

OpenUSD는 3D 세계를 기술·합성·재사용하는 공통 구조이며, 이를 기반으로 한 Omniverse는 조명·날씨·교통·카메라 각도·가림 조건을 달리한 시뮬레이션과 합성데이터·디지털 트윈을 구성한다.

Linker Vision 사례는 VSS로 검색·요약·알림·보고·스트림 관리를 구성하고, Omniverse 디지털 트윈으로 도시 환경을 시험하며, Cosmos로 영상을 보강하고 TAO로 모델을 미세 조정한다. NVIDIA는 가오슝 사례의 개발 작업량이 85%, 사고 대응 시간이 최대 80% 줄었다고 소개했다. [S3]

### 작업 순서와 표준 절차 확인

Foxconn에서 사용하는 DeepHow의 Live SOP Verification agent는 Metropolis VSS로 영상 검색·요약·분석을 수행하고 Cosmos로 조립 동작과 순서가 표준 작업 절차에 맞는지 해석한다.

NVIDIA는 GB300 서버 생산 라인 사례에서 초회 통과 수율이 3% 개선됐고, 핵심 작업 단계의 미세 동작을 이해하는 과제 수준 정확도가 99%였다고 밝혔다. [S3]

**개념:** [[Knowledge/AI Systems/OpenUSD]]

## AWS, 고객 현장에 AI 엔지니어를 투입하는 전담 조직 출범

**분야:** AI
**테마:** 인력·조직
**보조 테마:** 없음
**세부 태그:** 조직 개편
**기업·기관:** AWS, Amazon

TechCrunch는 2026년 7월 1일(한국시간) AWS가 AI 전진 배치 엔지니어(FDE)를 위한 내부 조직을 출범했다고 보도했다. 이 조직의 엔지니어는 고객사에 들어가 용도에 맞는 에이전트를 구축하고, 짧은 도입 과정과 고객의 자체 운영 역량 확보에 집중할 예정이다. [S4]

### 고객 환경에 들어가는 개발 방식

FDE는 공급사 엔지니어가 시스템을 구축하는 동안 고객사에 임시로 들어가 현장의 기회와 문제에 직접 대응하는 방식이다. TechCrunch는 배포 간 재사용할 수 있는 기술을 각 회사의 업무 흐름에 맞추는 구조라고 설명했다. [S4]

### 내부 자원 배분

보도에 따르면 Amazon은 새 조직에 10억 달러 상당의 내부 자원을 배정할 계획이라고 밝혔다. [S4]

### AWS가 밝힌 목표

TechCrunch가 인용한 AWS Frontier AI 부사장 Francessca Vasquez의 설명은 고객의 AWS 환경에 목적별 에이전트를 구축하고, 고객에게 AI 기술·업무 흐름·재사용 패턴과 개발 역량을 남기는 것이다. [S4]

## OKX, AI 에이전트가 서비스를 고용하고 결제하는 시장 공개

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** OKX, CertiK, CoinAnk, GenLayer

TechCrunch는 2026년 6월 30일(한국시간) OKX가 AI 에이전트끼리 서비스를 고용하고 결제하며 온체인 평판을 쌓는 시장을 개발자에게 공개한다고 보도했다. 50개 초기 서비스 제공자가 참여한 폐쇄 베타를 거쳐 공개하며, 개발자는 OnchainOS에서 OKX 계정 없이 접근할 수 있다. [S5]

### 개발자와 에이전트 도구

OKX가 겨냥한 이용자는 암호화폐 개발자와 개인 사업자이며, 개발자가 여러 에이전트의 서비스를 조합한 앱을 만드는 구조다. 회사는 Claude Code·Codex·Hermes·OpenClaw와 함께 사용할 수 있다고 설명했다. [S5]

### 서비스 고용과 사용량별 결제

보도에서 CertiK는 거래 전 지갑과 토큰의 보안 확인, CoinAnk는 조회마다 비용을 지불하는 실시간 데이터 제공, GenLayer는 에이전트 사이의 분쟁 해결을 맡는 예로 소개됐다.

OKX는 블록체인과 스테이블코인을 이용하면 에이전트가 시간 제약 없이 소액 결제를 할 수 있다고 설명했다. [S5]

### 거래 통제와 공개 범위

TechCrunch가 인용한 OKX의 Haider Rafique는 기존 거래소의 사기 탐지·규정 준수·내부 인프라를 이 시장에 적용한다고 말했다. 제공 범위는 단계적으로 확대한다. [S5]

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

- [S1] https://github.blog/changelog/2026-06-30-dependabot-no-longer-infers-npmrc
- [S2] https://github.blog/changelog/2026-06-30-cloud-data-retention-policy-for-closed-security-alerts
- [S3] https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
- [S4] https://techcrunch.com/2026/06/30/amazon-launches-new-1-billion-fde-org-following-openai-and-anthropic/
- [S5] https://techcrunch.com/2026/06/30/crypto-exchange-okx-wants-ai-agents-to-hire-and-pay-each-other/
