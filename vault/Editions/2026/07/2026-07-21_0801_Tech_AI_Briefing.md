---
title: 2026-07-21 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-07-21
timezone: Asia/Seoul
coverage_start: null
coverage_end: null
historical_coverage: unrecorded/v1
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 3
new_items_count: 3
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시
  - GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리
  - GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가
article_records:
  - title: GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-21
      where: GitHub 설정의 Copilot 사용량 페이지
      what: 결제 주기별 실제 AI 크레딧 사용량 표시
      how: 예산 설정 여부에 따라 총 사용량 또는 예산 대비 사용량 표시
      why: 미기재
    lead: GitHub는 한국시간 7월 21일 Copilot Business·Enterprise 사용자가 개인 예산 없이도 이번 결제 주기의
      AI 크레딧 사용량을 볼 수 있게 했다. 사용량은 GitHub 설정의 Copilot 사용량 페이지에서 확인한다.
    explanations:
      - heading: 예산 설정에 따른 표시
        paragraphs:
          - 기존 페이지는 예산 대비 사용 비율만 보여줘, 개인 예산이 없는 사용자는 월간 사용량을 확인하기 어려웠다.
          - 관리자가 예산을 설정하면 전체 예산 중 사용한 크레딧을 표시하고, 예산이 없으면 현재 결제 주기의 총 사용 크레딧을
            표시한다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-21
      where: GitHub Enterprise Cloud 청구 화면
      what: 비용센터별 AI 크레딧 풀 UI 관리
      how: 라이선스 기반 자동 한도 계산 및 한도 이후 정책 선택
      why: 미기재
    lead: GitHub는 한국시간 7월 21일 비용센터를 만들거나 수정하는 청구 화면에서 Copilot AI 크레딧 풀을 직접 관리할 수 있게
      했다. 대상은 GitHub Enterprise Cloud에서 Copilot Business·Enterprise를 사용하는 고객이며,
      기존에는 REST API로만 관리할 수 있었다.
    explanations:
      - heading: 한도 계산과 초과 사용 정책
        paragraphs:
          - 풀 한도는 해당 비용센터에 배정된 라이선스에 따라 자동 계산되며, 라이선스 추가·제거에 맞춰 조정된다. 관리자가 한도
            숫자를 직접 지정하는 방식은 아니다.
          - 한도에 도달하면 포함 사용량을 더 쓰지 못하게 하거나, 기업이 초과 사용을 허용하는 경우 추가 지출로 계속 사용하게 설정할
            수 있다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-ai-credit-pools-for-cost-centers-in-the-billing-ui/
      - heading: 포함 크레딧과 추가 요금의 별도 한도
        paragraphs:
          - 크레딧 풀은 비용센터의 Copilot 라이선스가 제공하는 포함 AI 크레딧의 사용 한도다. 비용센터 예산은 풀이 소진된 뒤
            발생하는 사용량 기반 요금을 제한하며, 같은 비용센터에 두 설정을 함께 적용할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-ai-credit-pools-for-cost-centers-in-the-billing-ui/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-20
      where: GitHub Enterprise Cloud와 GitHub Team
      what: Code Quality 정식 출시
      how: CodeQL 분석·AI 탐지 및 병합 전 수정 제안
      why: 미기재
    lead: GitHub는 한국시간 7월 20일 코드 품질 검사 제품 Code Quality를 GitHub Enterprise Cloud와
      GitHub Team에 정식 출시했다. CodeQL의 규칙 기반 분석과 AI 탐지로 풀 리퀘스트의 유지보수성·신뢰성 문제를 찾고,
      Copilot Autofix가 병합 전에 사람이 검토할 수정안을 제안한다.
    explanations:
      - heading: 품질 지표와 병합 기준
        paragraphs:
          - 조직 전체에서 기능을 켜고 대시보드로 저장소별 유지보수성·신뢰성 점수를 볼 수 있다. 기존 Cobertura XML 테스트
            보고서의 코드 커버리지도 풀 리퀘스트에 표시한다.
          - GitHub ruleset으로 커버리지 기준을 포함한 품질 기준을 설정하고, evaluate 모드에서 점진적으로 적용할 수
            있다. 저장소의 기능 활성화 관리와 발견 항목 조회를 위한 API도 제공한다.
          - GitHub는 자사 엔지니어링 조직에서 발견 항목의 67.3%를 풀 리퀘스트 병합 전에 해결한다고 밝혔다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/
      - heading: 기본 요금과 과금 대상
        paragraphs:
          - 기본 요금은 활성 커미터 1명당 월 10달러다. 최근 90일 동안 Code Quality가 켜진 저장소에 커밋을 푸시한
            사용자가 대상이다.
          - 여러 저장소에 기여해도 조직 내에서는 한 번만 계산하며, 봇 계정은 과금하지 않는다.
          - GitHub Advanced Security와 별도로 판매하는 유료 제품이며, 출시 시점에는 GitHub
            Enterprise Server를 지원하지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/
      - heading: 별도 사용료
        paragraphs:
          - AI 탐지와 Copilot Autofix에는 사용량 기반 요금이 붙는다. 이 기능을 쓰기 위해 GitHub Copilot
            구독이 필요하지는 않다.
          - 규칙 기반 CodeQL 분석에는 GitHub Actions 실행 비용이 발생하며, GitHub 호스팅 러너와 자체 호스팅
            러너를 모두 지원한다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/
      - heading: 공개 시험 운영에서 유료 서비스로 전환
        paragraphs:
          - 과금은 정식 출시일인 7월 20일 자동으로 시작된다. GitHub에 따르면 공개 시험 운영에 1만 개가 넘는 기업이
            참여했으며, 기존 사용자는 이전 작업이나 재설정 없이 기존 GitHub 계약에 따라 유료 제품을 계속 사용한다.
          - 이후 검사와 과금을 중단하려면 저장소 또는 조직에서 Code Quality를 비활성화해야 한다.
        source_urls:
          - https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시
    event_id: 80bba25e13259f42
    review_status: verified
    published_at: 2026-07-21
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-20T09:00:14-07:00
  - title: GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리
    event_id: e6ab1f9b9683cfdd
    review_status: verified
    published_at: 2026-07-21
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-20T11:24:14-07:00
  - title: GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가
    event_id: 426d91706ebf17e3
    review_status: verified
    published_at: 2026-07-20
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-20T06:01:24-07:00
---

# 이번 호 표지

GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시

# 차례

- GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시
- GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리
- GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가

# 커버 스토리

없음

# 뉴스 데스크

## GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 한국시간 7월 21일 Copilot Business·Enterprise 사용자가 개인 예산 없이도 이번 결제 주기의 AI 크레딧 사용량을 볼 수 있게 했다. 사용량은 GitHub 설정의 Copilot 사용량 페이지에서 확인한다. [S1]

### 예산 설정에 따른 표시

기존 페이지는 예산 대비 사용 비율만 보여줘, 개인 예산이 없는 사용자는 월간 사용량을 확인하기 어려웠다.

관리자가 예산을 설정하면 전체 예산 중 사용한 크레딧을 표시하고, 예산이 없으면 현재 결제 주기의 총 사용 크레딧을 표시한다. [S1]

## GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 한국시간 7월 21일 비용센터를 만들거나 수정하는 청구 화면에서 Copilot AI 크레딧 풀을 직접 관리할 수 있게 했다. 대상은 GitHub Enterprise Cloud에서 Copilot Business·Enterprise를 사용하는 고객이며, 기존에는 REST API로만 관리할 수 있었다. [S2]

### 한도 계산과 초과 사용 정책

풀 한도는 해당 비용센터에 배정된 라이선스에 따라 자동 계산되며, 라이선스 추가·제거에 맞춰 조정된다. 관리자가 한도 숫자를 직접 지정하는 방식은 아니다.

한도에 도달하면 포함 사용량을 더 쓰지 못하게 하거나, 기업이 초과 사용을 허용하는 경우 추가 지출로 계속 사용하게 설정할 수 있다. [S2]

### 포함 크레딧과 추가 요금의 별도 한도

크레딧 풀은 비용센터의 Copilot 라이선스가 제공하는 포함 AI 크레딧의 사용 한도다. 비용센터 예산은 풀이 소진된 뒤 발생하는 사용량 기반 요금을 제한하며, 같은 비용센터에 두 설정을 함께 적용할 수 있다. [S2]

## GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품, 가격 변경
**기업·기관:** GitHub

GitHub는 한국시간 7월 20일 코드 품질 검사 제품 Code Quality를 GitHub Enterprise Cloud와 GitHub Team에 정식 출시했다. CodeQL의 규칙 기반 분석과 AI 탐지로 풀 리퀘스트의 유지보수성·신뢰성 문제를 찾고, Copilot Autofix가 병합 전에 사람이 검토할 수정안을 제안한다. [S3]

### 품질 지표와 병합 기준

조직 전체에서 기능을 켜고 대시보드로 저장소별 유지보수성·신뢰성 점수를 볼 수 있다. 기존 Cobertura XML 테스트 보고서의 코드 커버리지도 풀 리퀘스트에 표시한다.

GitHub ruleset으로 커버리지 기준을 포함한 품질 기준을 설정하고, evaluate 모드에서 점진적으로 적용할 수 있다. 저장소의 기능 활성화 관리와 발견 항목 조회를 위한 API도 제공한다.

GitHub는 자사 엔지니어링 조직에서 발견 항목의 67.3%를 풀 리퀘스트 병합 전에 해결한다고 밝혔다. [S3]

### 기본 요금과 과금 대상

기본 요금은 활성 커미터 1명당 월 10달러다. 최근 90일 동안 Code Quality가 켜진 저장소에 커밋을 푸시한 사용자가 대상이다.

여러 저장소에 기여해도 조직 내에서는 한 번만 계산하며, 봇 계정은 과금하지 않는다.

GitHub Advanced Security와 별도로 판매하는 유료 제품이며, 출시 시점에는 GitHub Enterprise Server를 지원하지 않는다. [S3]

### 별도 사용료

AI 탐지와 Copilot Autofix에는 사용량 기반 요금이 붙는다. 이 기능을 쓰기 위해 GitHub Copilot 구독이 필요하지는 않다.

규칙 기반 CodeQL 분석에는 GitHub Actions 실행 비용이 발생하며, GitHub 호스팅 러너와 자체 호스팅 러너를 모두 지원한다. [S3]

### 공개 시험 운영에서 유료 서비스로 전환

과금은 정식 출시일인 7월 20일 자동으로 시작된다. GitHub에 따르면 공개 시험 운영에 1만 개가 넘는 기업이 참여했으며, 기존 사용자는 이전 작업이나 재설정 없이 기존 GitHub 계약에 따라 유료 제품을 계속 사용한다.

이후 검사와 과금을 중단하려면 저장소 또는 조직에서 Code Quality를 비활성화해야 한다. [S3]

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

- [S1] https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle/
- [S2] https://github.blog/changelog/2026-07-20-ai-credit-pools-for-cost-centers-in-the-billing-ui/
- [S3] https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/
