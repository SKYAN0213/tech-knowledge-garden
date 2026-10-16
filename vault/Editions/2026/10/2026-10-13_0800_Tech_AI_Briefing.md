---
title: 2026-10-13 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-10-13
timezone: Asia/Seoul
coverage_start: 2026-10-10T00:00:00+09:00
coverage_end: 2026-10-16T04:07:34.624Z
backfilled_at: 2026-10-16T04:07:34.624Z
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 9
new_items_count: 9
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - QAMQOR, 로봇 보조 자폐 치료 참여도 데이터셋과 평가 기준 공개
  - AMD, 에이전트 실행 겨냥 CPU 중심 AI 랙 Helion 공개
  - LS일렉트릭, 미국 데이터센터 배전설비 1,853억원 공급 계약
  - 인텔, 공랭식 AI 추론 GPU D-시리즈 공개…최대 480GB 메모리
  - SEMI, 2030년까지 글로벌 D램 생산능력 확대 전망
article_records:
  - title: QAMQOR, 로봇 보조 자폐 치료 참여도 데이터셋과 평가 기준 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: QAMQOR 연구진
      when: 2026-10-13
      where: 미기재
      what: 새 아동·치료 세션·활동으로의 일반화 평가
      how: 미기재
      why: 미기재
    lead: 2026년 10월 13일 공개된 논문은 자폐 스펙트럼 장애 아동 34명이 참여한 로봇 보조 치료 187개 세션의 영상에서 참여도
      주석과 시각 특징을 구성한 QAMQOR 데이터셋을 소개했다. QAMQOR는 무작위 분할, 아동 독립 분할, 세션 독립 분할, 활동
      독립 분할의 네 평가 프로토콜을 두어 훈련에 없던 아동·치료 세션·활동에 대한 일반화를 각각 평가한다. 다중 등급 참여도 분류에서
      평가 프로토콜별 평균 macro-F1 차이는 0.12로, 분류기 선택에 따른 차이 0.07보다 컸으며 아동 독립 분할은 무작위
      분할보다 훨씬 어려웠다.
    explanations:
      - heading: 비교 가능한 기준선을 제공하는 벤치마크
        paragraphs:
          - 연구진은 동일한 윈도·프로토콜·훈련 일정·미조정 하이퍼파라미터 조건에서 Temporal Convolutional
            Network가 전통적 분류 기준 모델보다 나은 성능을 내지 않았다고 보고했으며, 논문 기여를 새 분류 알고리즘이 아닌
            재현 가능한 벤치마크로 한정했다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1868211/full
    papers: []
    relations: []
    topic_ids: []
  - title: AMD, 에이전트 실행 겨냥 CPU 중심 AI 랙 Helion 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AMD
      when: 2026-10-13
      where: 미기재
      what: 에이전트 실행과 모델 추론을 분리하거나 단일 랙에서 결합하는 시스템
      how: 미기재
      why: 미기재
    lead: 더일렉은 2026년 10월 13일 보도에서 AMD가 12일(현지시간) OCP Global Summit에서 AI 에이전트 실행에 초점을
      둔 CPU 중심 랙 설계 Helion을 공개했다고 전했다. 대형 데이터센터 구성은 랙 하나에 최대 3만2,768개의 서버 CPU
      코어를 탑재하고 에이전트를 실행하며, 모델 추론은 별도 GPU 시스템에 요청하도록 설계됐다.
    explanations:
      - heading: 고객 구성에 따라 CPU와 GPU를 나누거나 결합
        paragraphs:
          - 기업용 구성은 AMD EPYC CPU와 Instinct MI350P GPU를 한 랙에 결합해 에이전트 실행과 모델 추론을
            함께 처리하며 GPU를 최대 16개 탑재한다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63596
      - heading: 모델 요청 라우팅과 개방형 공급 계획
        paragraphs:
          - Helion에 통합된 토큰 라우터는 에이전트의 모델 요청을 고성능 모델과 오픈소스 모델로 나누며, AMD는 일부 요청을
            자체 서버의 오픈소스 모델로 보내면 AI 사용 비용을 줄일 수 있다고 설명했다.
          - Helion은 완제품 서버가 아닌 OCP 기반 개방형 참조 설계로 공랭·수랭과 고객별 CPU·전력 구성을 지원하며,
            AMD는 관련 사양을 OCP에 제공하고 서버 업체를 통한 공급을 11월 시작할 계획이라고 밝혔다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63596
    papers: []
    relations: []
    topic_ids: []
  - title: LS일렉트릭, 미국 데이터센터 배전설비 1,853억원 공급 계약
    kind: 사건 뉴스
    region: 국내
    facts:
      who: LS일렉트릭
      when: 2026-10-13
      where: 미기재
      what: 펜실베이니아주 빅테크 데이터센터 현장 발전설비
      how: 미기재
      why: 미기재
    lead: LS일렉트릭은 2026년 10월 13일 Bloom Energy와 수배전반·배전용 변압기를 공급하는 1억3,846만 달러(약
      1,853억원) 규모 계약을 맺었다고 밝혔다. 납품 대상은 미국 펜실베이니아주에 건설되는 빅테크 데이터센터의 연료전지 기반 현장
      발전설비이며, 2027년 4월부터 7월까지 38kV급 고압 수배전반과 배전 변압기를 공급할 예정이다.
    explanations:
      - heading: Bloom Energy 누적 수주와 북미 거점
        paragraphs:
          - LS일렉트릭은 2025년 4월부터 약 1년 6개월 동안 Bloom Energy에서 5억 달러 이상을 수주했으며, 미국
            유타주·텍사스주 사업 거점을 활용해 북미 데이터센터 전력 인프라 시장 공략을 이어가겠다고 밝혔다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63607
    papers: []
    relations: []
    topic_ids: []
  - title: 인텔, 공랭식 AI 추론 GPU D-시리즈 공개…최대 480GB 메모리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 인텔
      when: 2026-10-13
      where: 미기재
      what: 공랭·PCIe 5.0 기반 데이터센터 추론 가속기
      how: 미기재
      why: 미기재
    lead: 더일렉은 2026년 10월 13일 보도에서 인텔이 12일(현지시간) OCP Global Summit에서 최신 Xe3P 아키텍처를
      적용한 AI 추론용 D-시리즈 GPU를 공개했다고 전했다. 공랭식 설계와 PCIe 5.0 인터페이스를 적용해 전용 랙이나 추가 냉각
      설비 없이 데이터센터에 설치하도록 했으며, 공개된 D270은 Xe3P 코어 32개와 행렬 연산 엔진 256개를 갖춘다.
    explanations:
      - heading: D270의 연산·메모리 구성
        paragraphs:
          - D270의 연산 성능은 FP8 기준 1.3페타플롭스이며 전력 사양은 350W다.
          - 저전력 LPDDR5X 메모리는 160GB에서 최대 480GB까지 탑재하며, 카드 한 장으로 3,000억 파라미터 모델을
            구동하고 GPU 8개 시스템으로 1조 파라미터 모델을 지원한다고 인텔은 설명했다. 현재 검증용 샘플을 고객사에 공급하고
            있다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63633
    papers: []
    relations: []
    topic_ids: []
  - title: SEMI, 2030년까지 글로벌 D램 생산능력 확대 전망
    kind: 사건 뉴스
    region: 해외
    facts:
      who: SEMI
      when: 2026-10-13
      where: 미기재
      what: 선단 메모리 중심의 용량 증가와 레거시 D램 축소
      how: 미기재
      why: 미기재
    lead: 더일렉은 2026년 10월 13일 보도에서 SEMI가 12일(현지시간) 글로벌 D램 생산능력이 웨이퍼 환산 기준 2025년 월
      208만 장에서 2030년 월 294만 장으로 늘어날 것으로 전망했다고 전했다. SEMI는 증가분이 15㎚급 이하 D램에 집중돼 이
      부문의 생산능력이 월 145만 장에서 245만 장으로 늘고, 16㎚급 이상 레거시 D램은 월 63만4천 장에서 49만2천 장으로 줄
      것으로 내다봤다.
    explanations:
      - heading: 낸드는 생산능력 증가와 세대 전환 동반
        paragraphs:
          - 낸드 생산능력은 월 167만 장에서 202만 장으로 증가하고, 400단 이상 제품은 2030년 전체 낸드 생산능력의 약
            82%를 차지할 것으로 전망됐다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63632
      - heading: 총량 증가와 제품별 수급은 다를 수 있어
        paragraphs:
          - SEMI는 HBM 생산에 일반 D램보다 선단 웨이퍼와 후공정 자원이 더 필요하고 레거시 생산능력은 축소·전환되고 있어,
            전체 생산능력이 늘어도 선단과 레거시 D램에서 공급 부족이 함께 생길 수 있다고 말했다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63632
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 철회된 Dependabot 경고를 webhook·API에서 구분
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-10-13
      where: 미기재
      what: 유효하지 않게 된 보안 경고와 삭제된 경고의 구분
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 한국시간 10월 13일 Dependabot이 취약점 경고를 철회할 때 webhook과 REST API에서 그
      상태를 식별할 수 있도록 동작을 추가했다고 밝혔다. dependabot_alert webhook 이벤트에는 withdrawn 동작이
      추가됐고, 페이로드에는 경고 번호·GHSA 및 CVE ID·패키지·manifest 경로 등 경고 제거 전 식별 정보가 담긴다.
    explanations:
      - heading: API 응답 코드로 철회 상태 확인
        paragraphs:
          - 철회된 경고를 조회하거나 갱신하는 REST API 요청은 기존 404 Not Found 대신 410 Gone을 반환해
            철회된 경고와 존재하지 않았던 경고를 구분한다.
        source_urls:
          - https://github.blog/changelog/2026-10-13-improved-detection-for-withdrawn-dependabot-alerts
      - heading: Enterprise Server 포함 일정
        paragraphs:
          - 이 변경은 github.com의 모든 저장소에서 제공되며 GitHub Enterprise Server 3.24에도 포함될
            예정이다.
        source_urls:
          - https://github.blog/changelog/2026-10-13-improved-detection-for-withdrawn-dependabot-alerts
    papers: []
    relations: []
    topic_ids: []
  - title: LX세미콘, SiC 특허 60건 이상 매각 추진…전력반도체 사업 정리
    kind: 사건 뉴스
    region: 국내
    facts:
      who: LX세미콘
      when: 2026-10-13
      where: 미기재
      what: 전력반도체 사업 정리와 사업 포트폴리오 조정
      how: 미기재
      why: 미기재
    lead: 더일렉은 2026년 10월 13일 업계 관계자를 인용해 LX세미콘이 실리콘카바이드(SiC) 소자·에피웨이퍼 특허 60건 이상을 묶음
      단위로 매물에 내놨다고 보도했다. 보도에 따르면 특허 전체의 매각 예상액은 10억원 미만이며, 대상에는 평면형·트렌치형 게이트와
      터미네이션 등 SiC MOSFET 기술이 포함되고 한국·미국·중국·유럽·일본·대만에서 출원됐다.
    explanations:
      - heading: SiC 사업 진입에서 지식재산권 정리까지
        paragraphs:
          - LX세미콘은 2021년 LG이노텍에서 SiC 소자 설비와 특허를 인수해 사업에 진입했으며, 더일렉은 2023년 말 경영진
            교체 후 전기차 수요 둔화 속에 2024년 SiC 연구개발 조직이 축소됐다고 전했다.
          - 회사는 2026년 3월 정기 주주총회에서 지식재산권 이전·양도·라이선스 관련 사업 목적을 추가했고, 당시 관계자는 사업
            경량화를 위한 것이라고 설명했다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63514
    papers: []
    relations: []
    topic_ids: []
  - title: MIT 연구진, 스스로 학습 회로를 조직하는 신경망 모델 제시
    kind: 사건 뉴스
    region: 해외
    facts:
      who: MIT 연구진
      when: 2026-10-13
      where: 미기재
      what: 생물학적 학습의 가능성을 탐색하는 계산 모델
      how: 미기재
      why: 미기재
    lead: MIT는 2026년 10월 13일 소개한 연구에서 무작위 연결로 시작한 인공신경망이 연결을 바꾸는 간단한 규칙만으로 정보 처리 구조를
      스스로 조직하고 학습할 수 있다고 밝혔다. 논문은 10월 9일 PNAS에 게재됐다. 연구진의 모델은 층마다 무작위로 연결된 뉴런 유사
      단위로 시작하며, 동시에 활성화된 연결을 강화하는 등의 규칙에 따라 자기조립 패턴을 형성해 이미지 인식과 분류를 학습한다.
    explanations:
      - heading: 간단한 연결 규칙으로 정보 처리 구조 형성
        paragraphs:
          - 연구진은 자기조직화된 패턴이 기능 회로의 구성 요소가 되며, 오류에 따라 연결을 조정하는 경사하강법과 유사한 최적화가
            나타났다고 설명했다.
        source_urls:
          - https://news.mit.edu/2026/how-artificial-neural-networks-build-their-own-learning-machinery-1013
      - heading: 뇌의 학습을 입증한 결과로 해석하지 않아
        paragraphs:
          - 연구진이 설계된 학습 네트워크와 비교했을 때 모델은 비슷한 수준으로 수행했지만, 이 결과가 뇌가 같은 방식으로 학습한다는
            뜻은 아니며 생물학적 개연성을 검토하기 위한 출발점이라고 설명했다.
        source_urls:
          - https://news.mit.edu/2026/how-artificial-neural-networks-build-their-own-learning-machinery-1013
    papers: []
    relations: []
    topic_ids: []
  - title: 엔비디아, 5년간 10억 달러 미국 과학 연구 인프라 투자 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 엔비디아
      when: 2026-10-13
      where: 미기재
      what: 고등교육·양자컴퓨팅·정부 연구 클라우드 지원
      how: 미기재
      why: 미기재
    lead: 더일렉은 2026년 10월 13일 보도에서 엔비디아가 12일 미국 과학 연구자에게 고도화한 AI 역량을 제공하기 위해 향후 5년간
      10억 달러를 투자하겠다고 밝혔다고 전했다. 투자금은 미국 고등교육 연구기관, 양자컴퓨팅 관련 투자, 미국 정부의 공공·연구 과제를
      맡는 클라우드 서비스 제공업체에 집행하고, 고성능 연산과 AI 인프라 제공 및 공동 연구개발 지원에 사용할 계획이다.
    explanations:
      - heading: Genesis Mission 아래 지원 분야와 연산 시스템
        paragraphs:
          - 이 투자는 미국 행정부가 주도하는 50억 달러 규모 Genesis Mission의 일부로 소개됐으며, 엔비디아는 2단계
            지원에서 양자컴퓨팅·핵융합·가속기 설계·마이크로전자공학 프로젝트 참여를 넓히고 아르곤·로스앨러모스 국립연구소에 신규 연산
            시스템 7개를 추가 구축할 예정이다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63586
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: QAMQOR, 로봇 보조 자폐 치료 참여도 데이터셋과 평가 기준 공개
    event_id: 9dd5cb0fe6550808
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: AMD, 에이전트 실행 겨냥 CPU 중심 AI 랙 Helion 공개
    event_id: 8326f813bf7f2ab5
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: LS일렉트릭, 미국 데이터센터 배전설비 1,853억원 공급 계약
    event_id: 5aa5cd51bc4472b9
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: 인텔, 공랭식 AI 추론 GPU D-시리즈 공개…최대 480GB 메모리
    event_id: b998ef7cef43e146
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: SEMI, 2030년까지 글로벌 D램 생산능력 확대 전망
    event_id: 0d6fb350c5a191ab
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: GitHub, 철회된 Dependabot 경고를 webhook·API에서 구분
    event_id: 1b3d7c4e863349bc
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-10-13T07:03:57-07:00
  - title: LX세미콘, SiC 특허 60건 이상 매각 추진…전력반도체 사업 정리
    event_id: 6b00dfe7bf5353c7
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: MIT 연구진, 스스로 학습 회로를 조직하는 신경망 모델 제시
    event_id: 08d1bb7044624eeb
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: 엔비디아, 5년간 10억 달러 미국 과학 연구 인프라 투자 계획
    event_id: 5a92755ec45def06
    review_status: verified
    published_at: 2026-10-13
    reviewed_at: 2026-10-16
    concept_ids: []
---

# 이번 호 표지

QAMQOR, 로봇 보조 자폐 치료 참여도 데이터셋과 평가 기준 공개

# 차례

- QAMQOR, 로봇 보조 자폐 치료 참여도 데이터셋과 평가 기준 공개
- AMD, 에이전트 실행 겨냥 CPU 중심 AI 랙 Helion 공개
- LS일렉트릭, 미국 데이터센터 배전설비 1,853억원 공급 계약
- 인텔, 공랭식 AI 추론 GPU D-시리즈 공개…최대 480GB 메모리
- SEMI, 2030년까지 글로벌 D램 생산능력 확대 전망

# 커버 스토리

없음

# 뉴스 데스크

## QAMQOR, 로봇 보조 자폐 치료 참여도 데이터셋과 평가 기준 공개

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 실증·재현
**기업·기관:** QAMQOR 연구진

2026년 10월 13일 공개된 논문은 자폐 스펙트럼 장애 아동 34명이 참여한 로봇 보조 치료 187개 세션의 영상에서 참여도 주석과 시각 특징을 구성한 QAMQOR 데이터셋을 소개했다. QAMQOR는 무작위 분할, 아동 독립 분할, 세션 독립 분할, 활동 독립 분할의 네 평가 프로토콜을 두어 훈련에 없던 아동·치료 세션·활동에 대한 일반화를 각각 평가한다. 다중 등급 참여도 분류에서 평가 프로토콜별 평균 macro-F1 차이는 0.12로, 분류기 선택에 따른 차이 0.07보다 컸으며 아동 독립 분할은 무작위 분할보다 훨씬 어려웠다. [S1]

### 비교 가능한 기준선을 제공하는 벤치마크

연구진은 동일한 윈도·프로토콜·훈련 일정·미조정 하이퍼파라미터 조건에서 Temporal Convolutional Network가 전통적 분류 기준 모델보다 나은 성능을 내지 않았다고 보고했으며, 논문 기여를 새 분류 알고리즘이 아닌 재현 가능한 벤치마크로 한정했다. [S1]

## AMD, 에이전트 실행 겨냥 CPU 중심 AI 랙 Helion 공개

**분야:** 반도체·컴퓨팅
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** AMD

더일렉은 2026년 10월 13일 보도에서 AMD가 12일(현지시간) OCP Global Summit에서 AI 에이전트 실행에 초점을 둔 CPU 중심 랙 설계 Helion을 공개했다고 전했다. 대형 데이터센터 구성은 랙 하나에 최대 3만2,768개의 서버 CPU 코어를 탑재하고 에이전트를 실행하며, 모델 추론은 별도 GPU 시스템에 요청하도록 설계됐다. [S2]

### 고객 구성에 따라 CPU와 GPU를 나누거나 결합

기업용 구성은 AMD EPYC CPU와 Instinct MI350P GPU를 한 랙에 결합해 에이전트 실행과 모델 추론을 함께 처리하며 GPU를 최대 16개 탑재한다. [S2]

### 모델 요청 라우팅과 개방형 공급 계획

Helion에 통합된 토큰 라우터는 에이전트의 모델 요청을 고성능 모델과 오픈소스 모델로 나누며, AMD는 일부 요청을 자체 서버의 오픈소스 모델로 보내면 AI 사용 비용을 줄일 수 있다고 설명했다.

Helion은 완제품 서버가 아닌 OCP 기반 개방형 참조 설계로 공랭·수랭과 고객별 CPU·전력 구성을 지원하며, AMD는 관련 사양을 OCP에 제공하고 서버 업체를 통한 공급을 11월 시작할 계획이라고 밝혔다. [S2]

## LS일렉트릭, 미국 데이터센터 배전설비 1,853억원 공급 계약

**분야:** 에너지·기후기술
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 수주·계약
**기업·기관:** LS일렉트릭

LS일렉트릭은 2026년 10월 13일 Bloom Energy와 수배전반·배전용 변압기를 공급하는 1억3,846만 달러(약 1,853억원) 규모 계약을 맺었다고 밝혔다. 납품 대상은 미국 펜실베이니아주에 건설되는 빅테크 데이터센터의 연료전지 기반 현장 발전설비이며, 2027년 4월부터 7월까지 38kV급 고압 수배전반과 배전 변압기를 공급할 예정이다. [S3]

### Bloom Energy 누적 수주와 북미 거점

LS일렉트릭은 2025년 4월부터 약 1년 6개월 동안 Bloom Energy에서 5억 달러 이상을 수주했으며, 미국 유타주·텍사스주 사업 거점을 활용해 북미 데이터센터 전력 인프라 시장 공략을 이어가겠다고 밝혔다. [S3]

## 인텔, 공랭식 AI 추론 GPU D-시리즈 공개…최대 480GB 메모리

**분야:** 반도체·컴퓨팅
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** 인텔

더일렉은 2026년 10월 13일 보도에서 인텔이 12일(현지시간) OCP Global Summit에서 최신 Xe3P 아키텍처를 적용한 AI 추론용 D-시리즈 GPU를 공개했다고 전했다. 공랭식 설계와 PCIe 5.0 인터페이스를 적용해 전용 랙이나 추가 냉각 설비 없이 데이터센터에 설치하도록 했으며, 공개된 D270은 Xe3P 코어 32개와 행렬 연산 엔진 256개를 갖춘다. [S4]

### D270의 연산·메모리 구성

D270의 연산 성능은 FP8 기준 1.3페타플롭스이며 전력 사양은 350W다.

저전력 LPDDR5X 메모리는 160GB에서 최대 480GB까지 탑재하며, 카드 한 장으로 3,000억 파라미터 모델을 구동하고 GPU 8개 시스템으로 1조 파라미터 모델을 지원한다고 인텔은 설명했다. 현재 검증용 샘플을 고객사에 공급하고 있다. [S4]

## SEMI, 2030년까지 글로벌 D램 생산능력 확대 전망

**분야:** 반도체·컴퓨팅
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 공급 부족
**기업·기관:** SEMI

더일렉은 2026년 10월 13일 보도에서 SEMI가 12일(현지시간) 글로벌 D램 생산능력이 웨이퍼 환산 기준 2025년 월 208만 장에서 2030년 월 294만 장으로 늘어날 것으로 전망했다고 전했다. SEMI는 증가분이 15㎚급 이하 D램에 집중돼 이 부문의 생산능력이 월 145만 장에서 245만 장으로 늘고, 16㎚급 이상 레거시 D램은 월 63만4천 장에서 49만2천 장으로 줄 것으로 내다봤다. [S5]

### 낸드는 생산능력 증가와 세대 전환 동반

낸드 생산능력은 월 167만 장에서 202만 장으로 증가하고, 400단 이상 제품은 2030년 전체 낸드 생산능력의 약 82%를 차지할 것으로 전망됐다. [S5]

### 총량 증가와 제품별 수급은 다를 수 있어

SEMI는 HBM 생산에 일반 D램보다 선단 웨이퍼와 후공정 자원이 더 필요하고 레거시 생산능력은 축소·전환되고 있어, 전체 생산능력이 늘어도 선단과 레거시 D램에서 공급 부족이 함께 생길 수 있다고 말했다. [S5]

## GitHub, 철회된 Dependabot 경고를 webhook·API에서 구분

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 한국시간 10월 13일 Dependabot이 취약점 경고를 철회할 때 webhook과 REST API에서 그 상태를 식별할 수 있도록 동작을 추가했다고 밝혔다. dependabot\_alert webhook 이벤트에는 withdrawn 동작이 추가됐고, 페이로드에는 경고 번호·GHSA 및 CVE ID·패키지·manifest 경로 등 경고 제거 전 식별 정보가 담긴다. [S6]

### API 응답 코드로 철회 상태 확인

철회된 경고를 조회하거나 갱신하는 REST API 요청은 기존 404 Not Found 대신 410 Gone을 반환해 철회된 경고와 존재하지 않았던 경고를 구분한다. [S6]

### Enterprise Server 포함 일정

이 변경은 github.com의 모든 저장소에서 제공되며 GitHub Enterprise Server 3.24에도 포함될 예정이다. [S6]

## LX세미콘, SiC 특허 60건 이상 매각 추진…전력반도체 사업 정리

**분야:** 반도체·컴퓨팅
**테마:** 투자·기업거래
**보조 테마:** 사업·고객
**세부 태그:** 사업 매각, 사업 철수
**기업·기관:** LX세미콘

더일렉은 2026년 10월 13일 업계 관계자를 인용해 LX세미콘이 실리콘카바이드(SiC) 소자·에피웨이퍼 특허 60건 이상을 묶음 단위로 매물에 내놨다고 보도했다. 보도에 따르면 특허 전체의 매각 예상액은 10억원 미만이며, 대상에는 평면형·트렌치형 게이트와 터미네이션 등 SiC MOSFET 기술이 포함되고 한국·미국·중국·유럽·일본·대만에서 출원됐다. [S7]

### SiC 사업 진입에서 지식재산권 정리까지

LX세미콘은 2021년 LG이노텍에서 SiC 소자 설비와 특허를 인수해 사업에 진입했으며, 더일렉은 2023년 말 경영진 교체 후 전기차 수요 둔화 속에 2024년 SiC 연구개발 조직이 축소됐다고 전했다.

회사는 2026년 3월 정기 주주총회에서 지식재산권 이전·양도·라이선스 관련 사업 목적을 추가했고, 당시 관계자는 사업 경량화를 위한 것이라고 설명했다. [S7]

## MIT 연구진, 스스로 학습 회로를 조직하는 신경망 모델 제시

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** MIT 연구진

MIT는 2026년 10월 13일 소개한 연구에서 무작위 연결로 시작한 인공신경망이 연결을 바꾸는 간단한 규칙만으로 정보 처리 구조를 스스로 조직하고 학습할 수 있다고 밝혔다. 논문은 10월 9일 PNAS에 게재됐다. 연구진의 모델은 층마다 무작위로 연결된 뉴런 유사 단위로 시작하며, 동시에 활성화된 연결을 강화하는 등의 규칙에 따라 자기조립 패턴을 형성해 이미지 인식과 분류를 학습한다. [S8]

### 간단한 연결 규칙으로 정보 처리 구조 형성

연구진은 자기조직화된 패턴이 기능 회로의 구성 요소가 되며, 오류에 따라 연결을 조정하는 경사하강법과 유사한 최적화가 나타났다고 설명했다. [S8]

### 뇌의 학습을 입증한 결과로 해석하지 않아

연구진이 설계된 학습 네트워크와 비교했을 때 모델은 비슷한 수준으로 수행했지만, 이 결과가 뇌가 같은 방식으로 학습한다는 뜻은 아니며 생물학적 개연성을 검토하기 위한 출발점이라고 설명했다. [S8]

## 엔비디아, 5년간 10억 달러 미국 과학 연구 인프라 투자 계획

**분야:** AI
**테마:** 투자·기업거래
**보조 테마:** 없음
**세부 태그:** 자본 배분
**기업·기관:** 엔비디아

더일렉은 2026년 10월 13일 보도에서 엔비디아가 12일 미국 과학 연구자에게 고도화한 AI 역량을 제공하기 위해 향후 5년간 10억 달러를 투자하겠다고 밝혔다고 전했다. 투자금은 미국 고등교육 연구기관, 양자컴퓨팅 관련 투자, 미국 정부의 공공·연구 과제를 맡는 클라우드 서비스 제공업체에 집행하고, 고성능 연산과 AI 인프라 제공 및 공동 연구개발 지원에 사용할 계획이다. [S9]

### Genesis Mission 아래 지원 분야와 연산 시스템

이 투자는 미국 행정부가 주도하는 50억 달러 규모 Genesis Mission의 일부로 소개됐으며, 엔비디아는 2단계 지원에서 양자컴퓨팅·핵융합·가속기 설계·마이크로전자공학 프로젝트 참여를 넓히고 아르곤·로스앨러모스 국립연구소에 신규 연산 시스템 7개를 추가 구축할 예정이다. [S9]

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

- [S1] https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1868211/full
- [S2] https://www.thelec.kr/news/articleView.html?idxno=63596
- [S3] https://www.thelec.kr/news/articleView.html?idxno=63607
- [S4] https://www.thelec.kr/news/articleView.html?idxno=63633
- [S5] https://www.thelec.kr/news/articleView.html?idxno=63632
- [S6] https://github.blog/changelog/2026-10-13-improved-detection-for-withdrawn-dependabot-alerts
- [S7] https://www.thelec.kr/news/articleView.html?idxno=63514
- [S8] https://news.mit.edu/2026/how-artificial-neural-networks-build-their-own-learning-machinery-1013
- [S9] https://www.thelec.kr/news/articleView.html?idxno=63586
