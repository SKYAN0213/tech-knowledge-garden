---
title: Tech & AI Briefing - 12:04
time: 12:04
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-06-26
timezone: Asia/Seoul
coverage_start: 2026-06-26T06:01:00+09:00
coverage_end: 2026-06-26T12:04:47+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 6
new_items_count: 6
linked_knowledge_notes:
  - AI Agents
  - Agent Evaluation and Observability
  - AI Agent Security and Governance
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GitHub Copilot 코드 리뷰, 조직별 분석 깊이 설정과 파일 탐색 도구 변경
  - GitHub Copilot CLI·VS Code, 기업이 지정한 플러그인 마켓만 허용
  - 모델 응답 선택형 결합의 정확도 상한을 공동 실패율로 설명한 연구
  - 이력서의 자격 정보 없는 자기 홍보 문구가 LLM 채용 순위를 바꾼 실험
  - LLM 초안의 의미 변화로 중단 시점 찾기…HotpotQA 60문항 실험
article_records:
  - title: GitHub Copilot 코드 리뷰, 조직별 분석 깊이 설정과 파일 탐색 도구 변경
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-26
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 26일(한국시간), Copilot 코드 리뷰의 파일 탐색 도구와 Medium 분석 깊이 공개 미리보기
      설정을 갱신했다. 조직 기본 분석 수준을 지정하고, 풀 리퀘스트의 개요 댓글에서 Medium 수준으로 실행됐는지 확인할 수 있다.
    explanations:
      - heading: 조직 기본값과 저장소 설정
        paragraphs:
          - Medium 공개 미리보기에 참여한 조직은 아직 수준을 설정하지 않은 저장소에 적용할 기본 리뷰 수준을 지정할 수 있다.
            저장소는 조직 기본값을 별도로 덮어쓸 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates
      - heading: 탐색 방식과 회사의 비용 평가
        paragraphs:
          - 리뷰 경로의 파일 탐색에는 Copilot CLI·SDK의 grep·rg·glob·view가 쓰인다. GitHub는 기존
            맞춤형 탐색 도구를 대체하고 내부 지침도 조정했다고 설명했다.
          - GitHub는 오프라인·온라인 평가에서 같은 리뷰 품질 기준을 유지하면서 코드 리뷰 비용이 약 20% 줄었다고 밝혔다. 이
            수치는 회사가 평가한 리뷰 비용이며 이용자의 요금 인하 발표는 아니다.
        source_urls:
          - https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot CLI·VS Code, 기업이 지정한 플러그인 마켓만 허용
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-26
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 26일(한국시간), Copilot CLI와 VS Code에서 기업이 플러그인 설치 출처를 제한하는
      기능을 공개 미리보기로 제공했다. 기업 관리 settings.json에 strictKnownMarketplaces를 지정하면 명시한
      마켓플레이스에서만 플러그인을 설치할 수 있다.
    explanations:
      - heading: 설정이 적용되는 사용자
        paragraphs:
          - Copilot Business 또는 Copilot Enterprise 계정으로 라이선스를 받은 사용자는 기업 설정을
            자동으로 내려받아 적용한다. 통제 대상은 플러그인 설치 출처이며 도구 실행 전에 적용된다.
        source_urls:
          - https://github.blog/changelog/2026-06-25-enterprise-managed-settings-now-support-strictknownmarketplaces-in-vs-code-and-the-cli
    papers: []
    relations: []
    topic_ids: []
  - title: 모델 응답 선택형 결합의 정확도 상한을 공동 실패율로 설명한 연구
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 25일 arXiv에 여러 언어 모델의 공동 실패율과 결합 시스템의 정확도 상한을 다룬 사전공개 논문을
      등록했다. 구성 모델의 답 중 하나를 출력하는 방식에서는 모든 모델이 같은 질문을 틀리는 비율 베타 때문에 정확도가 1에서 베타를 뺀
      값을 넘을 수 없다고 설명했다.
    explanations:
      - heading: 오류 상관과 공동 실패의 차이
        paragraphs:
          - 평균적인 모델 쌍의 오류 상관이 같아도 모든 모델이 동시에 틀리는 비율은 달라질 수 있다는 점이 출발점이다. 저자들은
            베타의 Clopper–Pearson 한계로 라우터 학습 전에 가능한 개선 폭을 평가하는 방법을 제시했다.
        source_urls:
          - https://arxiv.org/abs/2606.27288v1
      - heading: 초록에 보고한 비교 조건
        paragraphs:
          - 초록은 21개 제공사의 67개 모델을 비교했다고 밝힌다. 개방형 수학 문제에서 관측한 공동 실패율은 0.052였고 전체
            모델의 Gaussian copula 모형 예측은 0.023이었다.
          - 같은 수준의 모델 품질에서는 오류 상관이 낮은 이질적 모델 조합이 높은 상관의 Self-MoA보다 나았다. 저자들은 검사
            가능한 과제에서 강한 질문별 라우팅 신호가 없으면 결합이 최상위 단일 모델을 넘는 경우가 드물었다고 보고했다.
        source_urls:
          - https://arxiv.org/abs/2606.27288v1
    papers:
      - work_id: arxiv-2606-27288
        identifiers:
          - arxiv:2606.27288v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.27288v1
    relations: []
    topic_ids: []
  - title: 이력서의 자격 정보 없는 자기 홍보 문구가 LLM 채용 순위를 바꾼 실험
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 25일 arXiv에 LLM 기반 이력서 심사에서 프롬프트 주입이 순위를 바꾸는지 조사한 사전공개 논문을
      등록했다. 실험에서는 새 자격을 추가하지 않는 자기 홍보 문구를 이력서에 넣고, 지원자 간 품질 차이와 주입 사용 비율에 따른 순위
      변화를 비교했다.
    explanations:
      - heading: 품질과 주입 비율에 따른 결과
        paragraphs:
          - 초록에 따르면 이력서 품질이 비슷하고 주입을 쓰는 지원자가 적을 때 순위 상승이 안정적으로 나타났다. 주입 사용자가 늘면
            효과가 빠르게 줄었고 조작이 널리 퍼지면 효과가 무너졌다.
          - 지원자 품질 차이가 있을 때 평균 효과는 더 작았지만, 일부 조건에서는 낮은 품질의 지원자가 더 높은 품질의 지원자를
            앞섰다. 저자들은 조작이 드물고 품질 차이가 작을 때 심사 시스템이 특히 취약했다고 설명했다.
        source_urls:
          - https://arxiv.org/abs/2606.27287v1
    papers:
      - work_id: arxiv-2606-27287
        identifiers:
          - arxiv:2606.27287v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.27287v1
    relations: []
    topic_ids: []
  - title: LLM 초안의 의미 변화로 중단 시점 찾기…HotpotQA 60문항 실험
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 25일 arXiv에 작성자·비평자 LLM 반복 흐름의 의미 변화로 중단 시점을 정하는 사전공개 논문을
      등록했다. 연속 초안 임베딩의 변화와 품질 개선을 살펴, 고정 반복 횟수 대신 작업을 끝내는 조건을 연구했다.
    explanations:
      - heading: 같은 초안 경로의 정책 비교
        paragraphs:
          - 저자들은 질문별 전체 초안 경로를 한 번 생성한 뒤 같은 경로에서 각 중단 정책을 재생해 비교했다. 평가용 모델 호출은
            캐시하고 정책 운용 토큰과 실험 측정용 토큰을 구분했다.
        source_urls:
          - https://arxiv.org/abs/2606.27009v1
      - heading: 보고된 토큰과 품질 결과
        paragraphs:
          - HotpotQA 시험용 60문항에서는 판정 모델 없는 의미 기반 중단 방식이 고정 최대 반복 대비 운용 토큰을 38%
            줄이고 비슷한 품질을 유지했다고 초록에 보고했다. 이 결과는 해당 다단계 검색 질의응답 실험의 비교다.
          - 매 반복에서 품질 판정을 수행한 변형은 판정 비용이 커 역효과였다. 저자들은 거리 수열의 수렴을 실험적으로 시험한 추측으로
            구분하고, 어떤 회차의 답을 선택할지가 남은 문제라고 밝혔다.
        source_urls:
          - https://arxiv.org/abs/2606.27009v1
    papers:
      - work_id: arxiv-2606-27009
        identifiers:
          - arxiv:2606.27009v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.27009v1
    relations: []
    topic_ids: []
  - title: 에이전트의 자연어 지침을 Cedar 정책으로 변환하는 연구 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 25일 arXiv에 에이전트 지침을 실행 가능한 정책으로 변환하는 사전공개 논문을 등록했다. LLM
      생성자·비평자 반복으로 에이전트 프롬프트, MCP 도구 설명, 자연어 정책 문서를 Cedar Policy Language 정책으로
      옮기는 파이프라인을 제시했다.
    explanations:
      - heading: 비교 대상과 보고 범위
        paragraphs:
          - 저자들은 확률적 가드레일이나 수작업 기호 정책 대신 자동 형식화한 정책을 생성하는 접근을 연구했다. 초록은
            MedAgentBench에서 기존 수작업 기호 정책보다 원래 자연어 명세를 더 넓게 포괄했다고 보고했다.
        source_urls:
          - https://arxiv.org/abs/2606.26649v1
    papers:
      - work_id: arxiv-2606-26649
        identifiers:
          - arxiv:2606.26649v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.26649v1
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub Copilot 코드 리뷰, 조직별 분석 깊이 설정과 파일 탐색 도구 변경
    event_id: 0c70c8e30a8ac7bb
    review_status: verified
    published_at: 2026-06-26
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-25T14:41:18-07:00
  - title: GitHub Copilot CLI·VS Code, 기업이 지정한 플러그인 마켓만 허용
    event_id: 7b363c1ebde197cd
    review_status: verified
    published_at: 2026-06-26
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-25T14:30:42-07:00
  - title: 모델 응답 선택형 결합의 정확도 상한을 공동 실패율로 설명한 연구
    event_id: c6535d8abed89b4e
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-25
  - title: 이력서의 자격 정보 없는 자기 홍보 문구가 LLM 채용 순위를 바꾼 실험
    event_id: c4cfe0d77202509b
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-25
  - title: LLM 초안의 의미 변화로 중단 시점 찾기…HotpotQA 60문항 실험
    event_id: 9a64fae68418e394
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-25
  - title: 에이전트의 자연어 지침을 Cedar 정책으로 변환하는 연구 공개
    event_id: c8dc21c33120d411
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-25
---

# 이번 호 표지

GitHub Copilot 코드 리뷰, 조직별 분석 깊이 설정과 파일 탐색 도구 변경

# 차례

- GitHub Copilot 코드 리뷰, 조직별 분석 깊이 설정과 파일 탐색 도구 변경
- GitHub Copilot CLI·VS Code, 기업이 지정한 플러그인 마켓만 허용
- 모델 응답 선택형 결합의 정확도 상한을 공동 실패율로 설명한 연구
- 이력서의 자격 정보 없는 자기 홍보 문구가 LLM 채용 순위를 바꾼 실험
- LLM 초안의 의미 변화로 중단 시점 찾기…HotpotQA 60문항 실험

# 커버 스토리

없음

# 뉴스 데스크

## GitHub Copilot 코드 리뷰, 조직별 분석 깊이 설정과 파일 탐색 도구 변경

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** GitHub

GitHub는 2026년 6월 26일(한국시간), Copilot 코드 리뷰의 파일 탐색 도구와 Medium 분석 깊이 공개 미리보기 설정을 갱신했다. 조직 기본 분석 수준을 지정하고, 풀 리퀘스트의 개요 댓글에서 Medium 수준으로 실행됐는지 확인할 수 있다. [S1]

### 조직 기본값과 저장소 설정

Medium 공개 미리보기에 참여한 조직은 아직 수준을 설정하지 않은 저장소에 적용할 기본 리뷰 수준을 지정할 수 있다. 저장소는 조직 기본값을 별도로 덮어쓸 수 있다. [S1]

### 탐색 방식과 회사의 비용 평가

리뷰 경로의 파일 탐색에는 Copilot CLI·SDK의 grep·rg·glob·view가 쓰인다. GitHub는 기존 맞춤형 탐색 도구를 대체하고 내부 지침도 조정했다고 설명했다.

GitHub는 오프라인·온라인 평가에서 같은 리뷰 품질 기준을 유지하면서 코드 리뷰 비용이 약 20% 줄었다고 밝혔다. 이 수치는 회사가 평가한 리뷰 비용이며 이용자의 요금 인하 발표는 아니다. [S1]

## GitHub Copilot CLI·VS Code, 기업이 지정한 플러그인 마켓만 허용

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 6월 26일(한국시간), Copilot CLI와 VS Code에서 기업이 플러그인 설치 출처를 제한하는 기능을 공개 미리보기로 제공했다. 기업 관리 settings.json에 strictKnownMarketplaces를 지정하면 명시한 마켓플레이스에서만 플러그인을 설치할 수 있다. [S2]

### 설정이 적용되는 사용자

Copilot Business 또는 Copilot Enterprise 계정으로 라이선스를 받은 사용자는 기업 설정을 자동으로 내려받아 적용한다. 통제 대상은 플러그인 설치 출처이며 도구 실행 전에 적용된다. [S2]

## 모델 응답 선택형 결합의 정확도 상한을 공동 실패율로 설명한 연구

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 25일 arXiv에 여러 언어 모델의 공동 실패율과 결합 시스템의 정확도 상한을 다룬 사전공개 논문을 등록했다. 구성 모델의 답 중 하나를 출력하는 방식에서는 모든 모델이 같은 질문을 틀리는 비율 베타 때문에 정확도가 1에서 베타를 뺀 값을 넘을 수 없다고 설명했다. [S3]

### 오류 상관과 공동 실패의 차이

평균적인 모델 쌍의 오류 상관이 같아도 모든 모델이 동시에 틀리는 비율은 달라질 수 있다는 점이 출발점이다. 저자들은 베타의 Clopper–Pearson 한계로 라우터 학습 전에 가능한 개선 폭을 평가하는 방법을 제시했다. [S3]

### 초록에 보고한 비교 조건

초록은 21개 제공사의 67개 모델을 비교했다고 밝힌다. 개방형 수학 문제에서 관측한 공동 실패율은 0.052였고 전체 모델의 Gaussian copula 모형 예측은 0.023이었다.

같은 수준의 모델 품질에서는 오류 상관이 낮은 이질적 모델 조합이 높은 상관의 Self-MoA보다 나았다. 저자들은 검사 가능한 과제에서 강한 질문별 라우팅 신호가 없으면 결합이 최상위 단일 모델을 넘는 경우가 드물었다고 보고했다. [S3]

## 이력서의 자격 정보 없는 자기 홍보 문구가 LLM 채용 순위를 바꾼 실험

**분야:** 사이버보안
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 25일 arXiv에 LLM 기반 이력서 심사에서 프롬프트 주입이 순위를 바꾸는지 조사한 사전공개 논문을 등록했다. 실험에서는 새 자격을 추가하지 않는 자기 홍보 문구를 이력서에 넣고, 지원자 간 품질 차이와 주입 사용 비율에 따른 순위 변화를 비교했다. [S4]

### 품질과 주입 비율에 따른 결과

초록에 따르면 이력서 품질이 비슷하고 주입을 쓰는 지원자가 적을 때 순위 상승이 안정적으로 나타났다. 주입 사용자가 늘면 효과가 빠르게 줄었고 조작이 널리 퍼지면 효과가 무너졌다.

지원자 품질 차이가 있을 때 평균 효과는 더 작았지만, 일부 조건에서는 낮은 품질의 지원자가 더 높은 품질의 지원자를 앞섰다. 저자들은 조작이 드물고 품질 차이가 작을 때 심사 시스템이 특히 취약했다고 설명했다. [S4]

## LLM 초안의 의미 변화로 중단 시점 찾기…HotpotQA 60문항 실험

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 25일 arXiv에 작성자·비평자 LLM 반복 흐름의 의미 변화로 중단 시점을 정하는 사전공개 논문을 등록했다. 연속 초안 임베딩의 변화와 품질 개선을 살펴, 고정 반복 횟수 대신 작업을 끝내는 조건을 연구했다. [S5]

### 같은 초안 경로의 정책 비교

저자들은 질문별 전체 초안 경로를 한 번 생성한 뒤 같은 경로에서 각 중단 정책을 재생해 비교했다. 평가용 모델 호출은 캐시하고 정책 운용 토큰과 실험 측정용 토큰을 구분했다. [S5]

### 보고된 토큰과 품질 결과

HotpotQA 시험용 60문항에서는 판정 모델 없는 의미 기반 중단 방식이 고정 최대 반복 대비 운용 토큰을 38% 줄이고 비슷한 품질을 유지했다고 초록에 보고했다. 이 결과는 해당 다단계 검색 질의응답 실험의 비교다.

매 반복에서 품질 판정을 수행한 변형은 판정 비용이 커 역효과였다. 저자들은 거리 수열의 수렴을 실험적으로 시험한 추측으로 구분하고, 어떤 회차의 답을 선택할지가 남은 문제라고 밝혔다. [S5]

## 에이전트의 자연어 지침을 Cedar 정책으로 변환하는 연구 공개

**분야:** 사이버보안
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 25일 arXiv에 에이전트 지침을 실행 가능한 정책으로 변환하는 사전공개 논문을 등록했다. LLM 생성자·비평자 반복으로 에이전트 프롬프트, MCP 도구 설명, 자연어 정책 문서를 Cedar Policy Language 정책으로 옮기는 파이프라인을 제시했다. [S6]

### 비교 대상과 보고 범위

저자들은 확률적 가드레일이나 수작업 기호 정책 대신 자동 형식화한 정책을 생성하는 접근을 연구했다. 초록은 MedAgentBench에서 기존 수작업 기호 정책보다 원래 자연어 명세를 더 넓게 포괄했다고 보고했다. [S6]

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

- [S1] https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates
- [S2] https://github.blog/changelog/2026-06-25-enterprise-managed-settings-now-support-strictknownmarketplaces-in-vs-code-and-the-cli
- [S3] https://arxiv.org/abs/2606.27288v1
- [S4] https://arxiv.org/abs/2606.27287v1
- [S5] https://arxiv.org/abs/2606.27009v1
- [S6] https://arxiv.org/abs/2606.26649v1
