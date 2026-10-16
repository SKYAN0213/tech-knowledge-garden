---
title: 2026-10-15 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-10-15
timezone: Asia/Seoul
coverage_start: 2026-10-10T00:00:00+09:00
coverage_end: 2026-10-16T04:11:15.551Z
backfilled_at: 2026-10-16T04:11:15.551Z
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 9
new_items_count: 9
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - 안랩 ARTEX 실험, 취약 웹서버와 내부 호스트 4대까지 접근 확인
  - LG CNS, 새마을금고 계정계 현대화 2,910억원 본계약
  - NLR, 자연어로 건물 에너지 모델을 만드는 OpenStudio-MCP 공개
  - MIT 연구진, 유전자 발현 패턴으로 세포 신호 이력 추정하는 IRIS 소개
  - 삼성전자, PIM 추론 성능 공개…AI 메모리 표준화 과제 지적
article_records:
  - title: 안랩 ARTEX 실험, 취약 웹서버와 내부 호스트 4대까지 접근 확인
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 안랩 ASEC·ARTEX
      when: 2026-10-15
      where: 미기재
      what: AI 에이전트 기반 침투 도구의 실제 실험 범위와 탐지 한계
      how: 미기재
      why: 미기재
    lead: 안랩 시큐리티대응센터(ASEC)는 2026년 10월 15일 ARTEX 노출 인프라와 공격 활동 정황, 별도 환경에서 수행한 자율 침투
      실험을 분석한 내용을 공개했다. 두 실험에서 사용자는 대상·목표·허용 범위만 입력했다. 파일 업로드 취약 웹 서버 실험은 프로그램
      실행까지, Apache ActiveMQ 5.15.15 노출 환경 실험은 초기 접근 뒤 내부 호스트 4대에서 원격 명령 실행까지
      도달했다.
    explanations:
      - heading: 노출 IP 수와 공격자 식별은 별개
        paragraphs:
          - ASEC가 ARTEX 운영 인프라로 확인한 공개 IP 600개 중 미국·중국·홍콩·싱가포르 주소는
            541개(90.2%)였다. ASEC는 IP 위치 정보만으로 운영자 국적이나 공격 출발지를 판단할 수 없다고 밝혔다.
          - ASEC는 User-Agent 하나만으로 ARTEX 활동을 확인하거나 차단하기 어렵고 HTTP가 아닌 통신에는 이 값이
            없을 수 있다며 웹·네트워크·인증 기록과 단말 탐지 결과를 함께 분석할 것을 제시했다.
        source_urls:
          - https://asec.ahnlab.com/ko/95844/
    papers: []
    relations: []
    topic_ids: []
  - title: LG CNS, 새마을금고 계정계 현대화 2,910억원 본계약
    kind: 사건 뉴스
    region: 국내
    facts:
      who: LG CNS·새마을금고중앙회
      when: 2026-10-15
      where: 미기재
      what: 전국 새마을금고의 예금·대출·거래 시스템 재구축
      how: 미기재
      why: 미기재
    lead: 디일렉은 2026년 10월 15일 LG CNS가 전날 새마을금고중앙회와 전국 새마을금고의 계정계 최신화 구축 계약을 체결했다고
      보도했다. 이 시스템은 예금·대출·입출금 등 금융거래를 처리한다. 보도된 계약금액은 2,910억원으로 LG CNS의 전년도 연결
      매출의 4.75%에 해당한다.
    explanations:
      - heading: 재구축 대상과 계약 수행 기간
        paragraphs:
          - 계약 기간은 2026년 10월 14일부터 2029년 2월 14일까지다. 계약금과 선급금 없이 프로젝트 진행에 따라 대금을
            청구하는 조건이며, 새마을금고중앙회가 앞서 책정한 사업 예산은 총 3,370억원이었다.
          - LG CNS는 기존 계정계를 Java 기반으로 전환하고 예금·대출·고객·회계·체크카드·전자금융 시스템, HTML5 기반
            영업점 단말, 전자서식·태블릿 영업 지원과 재해복구 인프라를 재구축할 예정이다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63795
    papers: []
    relations: []
    topic_ids: []
  - title: NLR, 자연어로 건물 에너지 모델을 만드는 OpenStudio-MCP 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: National Laboratory of the Rockies·OpenStudio-MCP
      when: 2026-10-15
      where: 미기재
      what: AI assistant와 OpenStudio·EnergyPlus를 잇는 공개 도구
      how: 미기재
      why: 미기재
    lead: National Laboratory of the Rockies(NLR)는 2026년 10월 15일 AI 비서가 자연어 요청을
      OpenStudio 건물 모델링 작업으로 바꾸도록 연결하는 OpenStudio-MCP를 공개했다. 이 도구는 미국 에너지부의
      EnergyPlus 시뮬레이션 엔진을 사용한다. NLR는 검증된 도구 사용 절차를 담은 모델링 스킬 150개 이상으로 사무실·학교의
      기본 모델 작성, 조명·냉난방 설비 교체 같은 개선 적용, 전체 시뮬레이션 실행을 지원한다고 설명했다.
    explanations:
      - heading: 자동화하는 준비 작업과 남는 계산 시간
        paragraphs:
          - OpenStudio-MCP는 모델 수정 코드 작성, 실행, 출력 정리와 결과 점검 같은 반복 작업을 맡는다. NLR
            연구자는 시뮬레이션 자체의 계산 시간은 물리 모델의 크기와 상세도에 좌우되며 도구가 이를 바꾸지는 않는다고 설명했다.
          - NLR는 OpenStudio-MCP를 오픈소스·무료 도구로 제공하며 일반 AI 비서와 연결해 사용할 수 있고 다른 개발자가
            자신의 응용프로그램에 통합할 수 있다고 밝혔다.
        source_urls:
          - https://www.nlr.gov/news/detail/program/2026/building-energy-modeling-made-easy-with-natural-language-prompts
    papers: []
    relations: []
    topic_ids: []
  - title: MIT 연구진, 유전자 발현 패턴으로 세포 신호 이력 추정하는 IRIS 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: MIT 연구진·IRIS
      when: 2026-10-15
      where: 미기재
      what: 유전자 발현 패턴으로 배아 세포의 신호 전달 이력 재구성
      how: 미기재
      why: 미기재
    lead: MIT News는 2026년 10월 15일 Pulin Li와 Nicholas Hutchins 연구팀이 세포의 유전자 발현 패턴에서
      발달 과정의 신호 경로를 추정하는 기계학습 모델 IRIS를 소개했다. 연구진은 같은 신호 경로가 서로 다른 세포 유형에서도 일관된
      유전자 발현 지문을 남긴다고 설명했다. IRIS는 세포의 전체 유전자 활동을 살펴 특정 시점에 활성화됐을 가능성이 있는 경로를
      추정한다.
    explanations:
      - heading: 생쥐 배아 자료에서 시험한 예측
        paragraphs:
          - 모델은 여러 신호 경로 조합에 대한 인간 배아줄기세포 반응 자료로 학습됐고, 생쥐 배아의 낭배형성기 단일 세포 자료에서
            심장·장·근육·척수 조직으로 분화할 세포의 신호 경로를 예측하는 데 시험됐다.
          - MIT가 소개한 논문은 2026년 9월 8일 Nature Methods에 게재됐다. 연구진은 폐 발달에 필요한 신호 경로에
            대한 IRIS의 예측이 생쥐 배아 실험에서 확인됐다고 보고했으며, 줄기세포·오가노이드 연구 활용 가능성을 제시했다.
        source_urls:
          - https://news.mit.edu/2026/ai-model-decodes-language-cells-use-communicate-1015
    papers: []
    relations: []
    topic_ids: []
  - title: 삼성전자, PIM 추론 성능 공개…AI 메모리 표준화 과제 지적
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 삼성전자 DS 메모리사업부·JEDEC
      when: 2026-10-15
      where: 미기재
      what: 맞춤형 AI 메모리 기능의 공통 규격과 추론 성능
      how: 미기재
      why: 미기재
    lead: 디일렉은 2026년 10월 15일 서울 반도체대전의 JEDEC 포럼에서 삼성전자 메모리사업부 황가람 박사가 LPDDR-PIM과
      zHBM의 고객 맞춤 기능이 제조·관리와 공통 표준 수립을 어렵게 한다고 설명했다고 보도했다. 황 박사는 LPDDR6-PIM 표준이
      연내 정립되기를 기대한다고 말했다. 보도에 따르면 삼성전자가 제시한 zHBM은 HBM과 연산 프로세서를 직접 연결하는 3차원 적층
      구조로, D램 코어 다이 안에 실리콘관통전극을 분산 배치한다. 황 박사는 모든 기능의 완전한 표준화가 어렵지만 JEDEC 회원사들의
      공통 기준 마련을 바란다고 밝혔다.
    explanations:
      - heading: 전력당 추론 성능과 비교 기준
        paragraphs:
          - 삼성전자가 공개한 LPDDR5X-PIM 결과에서 AI 추론은 초당 102토큰으로 LPDDR5X의 27토큰보다 높았고,
            전력당 추론 성능은 9TPS/W로 기존 3.2TPS/W보다 높았다. 평균 소비전력은 각각 11.5W와 8.4W였다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63772
    papers: []
    relations: []
    topic_ids: []
  - title: NASA, VIIRS로 산타렝 화재를 FIRMS보다 약 40% 더 포착
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NASA Earth Observatory·VIIRS 연구진
      when: 2026-10-15
      where: 미기재
      what: 연기·구름·수관 아래 화재의 위성 관측 누락 보완
      how: 미기재
      why: 미기재
    lead: NASA Earth Observatory는 2026년 10월 15일 9월부터 아마존 중부·동부의 화재 활동과 연기 배출이 증가했다고
      보도했다. NASA Aqua 위성의 MODIS는 10월 12일 아마존강 양쪽의 화재 연기를 촬영했다. NASA 연구진 Shane
      Coffield는 VIIRS 관측 자료로 FIRMS 공식 제품의 탐지 기준에 들지 않은 후보 화재를 찾는 작업을 진행 중이라고
      밝혔다. 산타렝 주변에서는 FIRMS 활성 화재 집계보다 약 40% 많은 화재를 확인했다고 설명했다.
    explanations:
      - heading: 연기와 수관이 만드는 위성 탐지 공백
        paragraphs:
          - NASA 기사에 따르면 두꺼운 연기·구름·수관은 적외선 신호를 가려 위성 센서가 특히 숲 하층부의 낮은 강도 화재를 놓칠
            수 있다. 브라질 기상 당국 자료를 인용한 보도는 마나우스의 강수량이 2026년 8월 평년보다 95%, 9월 60%
            적었다고 전했다.
        source_urls:
          - https://science.nasa.gov/earth/earth-observatory/fires-arrive-in-the-amazon-rainforest/
    papers: []
    relations: []
    topic_ids: []
  - title: 아이언디바이스, 로봇 손용 온디바이스 AI 모듈 개발 참여
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 아이언디바이스·테솔로 컨소시엄
      when: 2026-10-15
      where: 미기재
      what: 저전력 SoC와 센서·모터 통합 제어
      how: 미기재
      why: 미기재
    lead: 디일렉은 2026년 10월 15일 아이언디바이스가 산업통상부 주관 로봇 손·정밀 조작 제어기술 개발 과제의 공동연구개발 기관으로
      선정됐다고 보도했다. 과제에는 테솔로·한양대 ERICA 산학협력단·한국로봇융합연구원이 참여하고 총사업 규모는 약 52억5,000만원,
      수행 기간은 2026년 8월부터 2029년 말까지다. 아이언디바이스의 역할은 CPU·GPU·NPU를 통합한 시스템온칩 형태의 저전력
      모듈을 로봇 손 안에 구현하는 것이다. 회사가 제시한 목표는 NVIDIA Jetson Orin Nano 플랫폼 대비 모듈 면적 59%
      축소와 와트당 연산 효율 약 3배 향상이다.
    explanations:
      - heading: 센서 입력부터 모터 제어까지의 목표
        paragraphs:
          - 개발 모듈은 테솔로 로봇 손과 센서 모듈에 결합할 계획이며, 회사는 센서 수집부터 모터 제어까지를 0.02초(20ms)
            이하로 줄이고 공동연구진의 추론 알고리즘을 모듈에 이식하는 목표를 제시했다.
          - 아이언디바이스는 과제와 별도로 완성 모듈을 국내외 휴머노이드·산업용 로봇 고객에게 판매할 계획이라고 밝혔고, 회사 임원은
            고객 로봇 시스템 원가를 25% 이상 낮추겠다는 목표를 제시했다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63776
    papers: []
    relations: []
    topic_ids: []
  - title: 제이알에너지솔루션·ACC, 프랑스 전극 생산 협력 검토
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 제이알에너지솔루션·ACC
      when: 2026-10-15
      where: 미기재
      what: 프랑스 네르삭 시설 활용과 고객 맞춤형 배터리 전극 제조 검토
      how: 미기재
      why: 미기재
    lead: 디일렉은 2026년 10월 15일 제이알에너지솔루션이 9월 30일 프랑스 배터리 제조사 ACC와 전극 제조 협력 양해각서(MOU)를
      체결했다고 보도했다. 양사는 ACC의 네르삭 시설을 활용해 고객별 생산 물량과 기술 요구에 맞추는 방안을 검토한다. 네르삭 공장은
      배터리 제품·제조공정을 개발하고 양산 기술을 검증하는 시설이다. 제이알에너지솔루션은 자체 생산시설이 없는 기업을 위한 전극·셀 제조를
      맡고, 양사는 해당 경험과 ACC 시설을 결합해 유럽에서 고객 제품 개발과 양산 확대를 지원하는 방안을 검토한다고 보도됐다.
    explanations:
      - heading: 확정된 공급 계약 전 남은 절차
        paragraphs:
          - 양사는 기술 적합성과 품질 기준을 검증한 뒤 구체적인 제조·공급 계약을 협의할 예정이다. 계약에는 양사 내부 승인과 필요한
            규제 당국의 허가가 남아 있다.
          - 제이알에너지솔루션은 충북 음성에서 연간 500MWh 전극 생산시설을 운영하며, 현재 생산라인을 풀가동하고 1.5GWh 규모
            설비를 추가 중이라고 보도됐다. 회사는 2027년 2월 전체 생산능력을 2GWh로 확대할 계획이다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=63740
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Bedrock AgentCore 웹 검색을 GovCloud 포함 4개 리전으로 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS Bedrock AgentCore
      when: 2026-10-15
      where: 미기재
      what: AI 에이전트용 관리형 웹 검색의 미국·호주 리전 제공
      how: 미기재
      why: 미기재
    lead: AWS는 2026년 10월 15일 Amazon Bedrock AgentCore의 Web Search를 미국 동부 오하이오, 미국 서부
      오리건, 아시아태평양 시드니, AWS GovCloud(US-West) 등 4개 추가 리전에서 제공한다고 밝혔다. AWS는 Web
      Search를 에이전트가 조사·요약·질의응답에 활용할 최신 웹 정보를 얻는 완전 관리형 도구라고 설명했다. 회사는 애플리케이션과
      사용자에 가까운 리전에서 검색해 지연을 낮출 수 있으며 GovCloud(US-West) 제공으로 정부 업무의 규정 준수·데이터 거주
      요구를 지원한다고 밝혔다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: 안랩 ARTEX 실험, 취약 웹서버와 내부 호스트 4대까지 접근 확인
    event_id: 7df7a40a0bfae339
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: LG CNS, 새마을금고 계정계 현대화 2,910억원 본계약
    event_id: 7776daef2e8cdd6b
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: NLR, 자연어로 건물 에너지 모델을 만드는 OpenStudio-MCP 공개
    event_id: a5e6da561421be6e
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: MIT 연구진, 유전자 발현 패턴으로 세포 신호 이력 추정하는 IRIS 소개
    event_id: 38a125a6c95bf334
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: 삼성전자, PIM 추론 성능 공개…AI 메모리 표준화 과제 지적
    event_id: 9167920bcb4fa476
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: NASA, VIIRS로 산타렝 화재를 FIRMS보다 약 40% 더 포착
    event_id: 5f2528424985d275
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: 아이언디바이스, 로봇 손용 온디바이스 AI 모듈 개발 참여
    event_id: b0a1ef4178fda46e
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: 제이알에너지솔루션·ACC, 프랑스 전극 생산 협력 검토
    event_id: a7e61ea6da5699a4
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
  - title: AWS, Bedrock AgentCore 웹 검색을 GovCloud 포함 4개 리전으로 확대
    event_id: 5464d0f93499f85b
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-16
    concept_ids: []
---

# 이번 호 표지

안랩 ARTEX 실험, 취약 웹서버와 내부 호스트 4대까지 접근 확인

# 차례

- 안랩 ARTEX 실험, 취약 웹서버와 내부 호스트 4대까지 접근 확인
- LG CNS, 새마을금고 계정계 현대화 2,910억원 본계약
- NLR, 자연어로 건물 에너지 모델을 만드는 OpenStudio-MCP 공개
- MIT 연구진, 유전자 발현 패턴으로 세포 신호 이력 추정하는 IRIS 소개
- 삼성전자, PIM 추론 성능 공개…AI 메모리 표준화 과제 지적

# 커버 스토리

없음

# 뉴스 데스크

## 안랩 ARTEX 실험, 취약 웹서버와 내부 호스트 4대까지 접근 확인

**분야:** 사이버보안
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** 안랩 ASEC·ARTEX

안랩 시큐리티대응센터(ASEC)는 2026년 10월 15일 ARTEX 노출 인프라와 공격 활동 정황, 별도 환경에서 수행한 자율 침투 실험을 분석한 내용을 공개했다. 두 실험에서 사용자는 대상·목표·허용 범위만 입력했다. 파일 업로드 취약 웹 서버 실험은 프로그램 실행까지, Apache ActiveMQ 5.15.15 노출 환경 실험은 초기 접근 뒤 내부 호스트 4대에서 원격 명령 실행까지 도달했다. [S1]

### 노출 IP 수와 공격자 식별은 별개

ASEC가 ARTEX 운영 인프라로 확인한 공개 IP 600개 중 미국·중국·홍콩·싱가포르 주소는 541개(90.2%)였다. ASEC는 IP 위치 정보만으로 운영자 국적이나 공격 출발지를 판단할 수 없다고 밝혔다.

ASEC는 User-Agent 하나만으로 ARTEX 활동을 확인하거나 차단하기 어렵고 HTTP가 아닌 통신에는 이 값이 없을 수 있다며 웹·네트워크·인증 기록과 단말 탐지 결과를 함께 분석할 것을 제시했다. [S1]

## LG CNS, 새마을금고 계정계 현대화 2,910억원 본계약

**분야:** 소프트웨어·클라우드
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 수주·계약
**기업·기관:** LG CNS·새마을금고중앙회

디일렉은 2026년 10월 15일 LG CNS가 전날 새마을금고중앙회와 전국 새마을금고의 계정계 최신화 구축 계약을 체결했다고 보도했다. 이 시스템은 예금·대출·입출금 등 금융거래를 처리한다. 보도된 계약금액은 2,910억원으로 LG CNS의 전년도 연결 매출의 4.75%에 해당한다. [S2]

### 재구축 대상과 계약 수행 기간

계약 기간은 2026년 10월 14일부터 2029년 2월 14일까지다. 계약금과 선급금 없이 프로젝트 진행에 따라 대금을 청구하는 조건이며, 새마을금고중앙회가 앞서 책정한 사업 예산은 총 3,370억원이었다.

LG CNS는 기존 계정계를 Java 기반으로 전환하고 예금·대출·고객·회계·체크카드·전자금융 시스템, HTML5 기반 영업점 단말, 전자서식·태블릿 영업 지원과 재해복구 인프라를 재구축할 예정이다. [S2]

## NLR, 자연어로 건물 에너지 모델을 만드는 OpenStudio-MCP 공개

**분야:** 에너지·기후기술
**테마:** 제품·서비스
**보조 테마:** 표준·생태계
**세부 태그:** 신제품, 오픈소스
**기업·기관:** National Laboratory of the Rockies·OpenStudio-MCP

National Laboratory of the Rockies(NLR)는 2026년 10월 15일 AI 비서가 자연어 요청을 OpenStudio 건물 모델링 작업으로 바꾸도록 연결하는 OpenStudio-MCP를 공개했다. 이 도구는 미국 에너지부의 EnergyPlus 시뮬레이션 엔진을 사용한다. NLR는 검증된 도구 사용 절차를 담은 모델링 스킬 150개 이상으로 사무실·학교의 기본 모델 작성, 조명·냉난방 설비 교체 같은 개선 적용, 전체 시뮬레이션 실행을 지원한다고 설명했다. [S3]

### 자동화하는 준비 작업과 남는 계산 시간

OpenStudio-MCP는 모델 수정 코드 작성, 실행, 출력 정리와 결과 점검 같은 반복 작업을 맡는다. NLR 연구자는 시뮬레이션 자체의 계산 시간은 물리 모델의 크기와 상세도에 좌우되며 도구가 이를 바꾸지는 않는다고 설명했다.

NLR는 OpenStudio-MCP를 오픈소스·무료 도구로 제공하며 일반 AI 비서와 연결해 사용할 수 있고 다른 개발자가 자신의 응용프로그램에 통합할 수 있다고 밝혔다. [S3]

## MIT 연구진, 유전자 발현 패턴으로 세포 신호 이력 추정하는 IRIS 소개

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** MIT 연구진·IRIS

MIT News는 2026년 10월 15일 Pulin Li와 Nicholas Hutchins 연구팀이 세포의 유전자 발현 패턴에서 발달 과정의 신호 경로를 추정하는 기계학습 모델 IRIS를 소개했다. 연구진은 같은 신호 경로가 서로 다른 세포 유형에서도 일관된 유전자 발현 지문을 남긴다고 설명했다. IRIS는 세포의 전체 유전자 활동을 살펴 특정 시점에 활성화됐을 가능성이 있는 경로를 추정한다. [S4]

### 생쥐 배아 자료에서 시험한 예측

모델은 여러 신호 경로 조합에 대한 인간 배아줄기세포 반응 자료로 학습됐고, 생쥐 배아의 낭배형성기 단일 세포 자료에서 심장·장·근육·척수 조직으로 분화할 세포의 신호 경로를 예측하는 데 시험됐다.

MIT가 소개한 논문은 2026년 9월 8일 Nature Methods에 게재됐다. 연구진은 폐 발달에 필요한 신호 경로에 대한 IRIS의 예측이 생쥐 배아 실험에서 확인됐다고 보고했으며, 줄기세포·오가노이드 연구 활용 가능성을 제시했다. [S4]

## 삼성전자, PIM 추론 성능 공개…AI 메모리 표준화 과제 지적

**분야:** 반도체·컴퓨팅
**테마:** 연구·기술
**보조 테마:** 표준·생태계
**세부 태그:** 성능 개선
**기업·기관:** 삼성전자 DS 메모리사업부·JEDEC

디일렉은 2026년 10월 15일 서울 반도체대전의 JEDEC 포럼에서 삼성전자 메모리사업부 황가람 박사가 LPDDR-PIM과 zHBM의 고객 맞춤 기능이 제조·관리와 공통 표준 수립을 어렵게 한다고 설명했다고 보도했다. 황 박사는 LPDDR6-PIM 표준이 연내 정립되기를 기대한다고 말했다. 보도에 따르면 삼성전자가 제시한 zHBM은 HBM과 연산 프로세서를 직접 연결하는 3차원 적층 구조로, D램 코어 다이 안에 실리콘관통전극을 분산 배치한다. 황 박사는 모든 기능의 완전한 표준화가 어렵지만 JEDEC 회원사들의 공통 기준 마련을 바란다고 밝혔다. [S5]

### 전력당 추론 성능과 비교 기준

삼성전자가 공개한 LPDDR5X-PIM 결과에서 AI 추론은 초당 102토큰으로 LPDDR5X의 27토큰보다 높았고, 전력당 추론 성능은 9TPS/W로 기존 3.2TPS/W보다 높았다. 평균 소비전력은 각각 11.5W와 8.4W였다. [S5]

## NASA, VIIRS로 산타렝 화재를 FIRMS보다 약 40% 더 포착

**분야:** 우주·기초과학
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** NASA Earth Observatory·VIIRS 연구진

NASA Earth Observatory는 2026년 10월 15일 9월부터 아마존 중부·동부의 화재 활동과 연기 배출이 증가했다고 보도했다. NASA Aqua 위성의 MODIS는 10월 12일 아마존강 양쪽의 화재 연기를 촬영했다. NASA 연구진 Shane Coffield는 VIIRS 관측 자료로 FIRMS 공식 제품의 탐지 기준에 들지 않은 후보 화재를 찾는 작업을 진행 중이라고 밝혔다. 산타렝 주변에서는 FIRMS 활성 화재 집계보다 약 40% 많은 화재를 확인했다고 설명했다. [S6]

### 연기와 수관이 만드는 위성 탐지 공백

NASA 기사에 따르면 두꺼운 연기·구름·수관은 적외선 신호를 가려 위성 센서가 특히 숲 하층부의 낮은 강도 화재를 놓칠 수 있다. 브라질 기상 당국 자료를 인용한 보도는 마나우스의 강수량이 2026년 8월 평년보다 95%, 9월 60% 적었다고 전했다. [S6]

## 아이언디바이스, 로봇 손용 온디바이스 AI 모듈 개발 참여

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 아이언디바이스·테솔로 컨소시엄

디일렉은 2026년 10월 15일 아이언디바이스가 산업통상부 주관 로봇 손·정밀 조작 제어기술 개발 과제의 공동연구개발 기관으로 선정됐다고 보도했다. 과제에는 테솔로·한양대 ERICA 산학협력단·한국로봇융합연구원이 참여하고 총사업 규모는 약 52억5,000만원, 수행 기간은 2026년 8월부터 2029년 말까지다. 아이언디바이스의 역할은 CPU·GPU·NPU를 통합한 시스템온칩 형태의 저전력 모듈을 로봇 손 안에 구현하는 것이다. 회사가 제시한 목표는 NVIDIA Jetson Orin Nano 플랫폼 대비 모듈 면적 59% 축소와 와트당 연산 효율 약 3배 향상이다. [S7]

### 센서 입력부터 모터 제어까지의 목표

개발 모듈은 테솔로 로봇 손과 센서 모듈에 결합할 계획이며, 회사는 센서 수집부터 모터 제어까지를 0.02초(20ms) 이하로 줄이고 공동연구진의 추론 알고리즘을 모듈에 이식하는 목표를 제시했다.

아이언디바이스는 과제와 별도로 완성 모듈을 국내외 휴머노이드·산업용 로봇 고객에게 판매할 계획이라고 밝혔고, 회사 임원은 고객 로봇 시스템 원가를 25% 이상 낮추겠다는 목표를 제시했다. [S7]

## 제이알에너지솔루션·ACC, 프랑스 전극 생산 협력 검토

**분야:** 에너지·기후기술
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 기술 제휴
**기업·기관:** 제이알에너지솔루션·ACC

디일렉은 2026년 10월 15일 제이알에너지솔루션이 9월 30일 프랑스 배터리 제조사 ACC와 전극 제조 협력 양해각서(MOU)를 체결했다고 보도했다. 양사는 ACC의 네르삭 시설을 활용해 고객별 생산 물량과 기술 요구에 맞추는 방안을 검토한다. 네르삭 공장은 배터리 제품·제조공정을 개발하고 양산 기술을 검증하는 시설이다. 제이알에너지솔루션은 자체 생산시설이 없는 기업을 위한 전극·셀 제조를 맡고, 양사는 해당 경험과 ACC 시설을 결합해 유럽에서 고객 제품 개발과 양산 확대를 지원하는 방안을 검토한다고 보도됐다. [S8]

### 확정된 공급 계약 전 남은 절차

양사는 기술 적합성과 품질 기준을 검증한 뒤 구체적인 제조·공급 계약을 협의할 예정이다. 계약에는 양사 내부 승인과 필요한 규제 당국의 허가가 남아 있다.

제이알에너지솔루션은 충북 음성에서 연간 500MWh 전극 생산시설을 운영하며, 현재 생산라인을 풀가동하고 1.5GWh 규모 설비를 추가 중이라고 보도됐다. 회사는 2027년 2월 전체 생산능력을 2GWh로 확대할 계획이다. [S8]

## AWS, Bedrock AgentCore 웹 검색을 GovCloud 포함 4개 리전으로 확대

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS Bedrock AgentCore

AWS는 2026년 10월 15일 Amazon Bedrock AgentCore의 Web Search를 미국 동부 오하이오, 미국 서부 오리건, 아시아태평양 시드니, AWS GovCloud(US-West) 등 4개 추가 리전에서 제공한다고 밝혔다. AWS는 Web Search를 에이전트가 조사·요약·질의응답에 활용할 최신 웹 정보를 얻는 완전 관리형 도구라고 설명했다. 회사는 애플리케이션과 사용자에 가까운 리전에서 검색해 지연을 낮출 수 있으며 GovCloud(US-West) 제공으로 정부 업무의 규정 준수·데이터 거주 요구를 지원한다고 밝혔다. [S9]



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

- [S1] https://asec.ahnlab.com/ko/95844/
- [S2] https://www.thelec.kr/news/articleView.html?idxno=63795
- [S3] https://www.nlr.gov/news/detail/program/2026/building-energy-modeling-made-easy-with-natural-language-prompts
- [S4] https://news.mit.edu/2026/ai-model-decodes-language-cells-use-communicate-1015
- [S5] https://www.thelec.kr/news/articleView.html?idxno=63772
- [S6] https://science.nasa.gov/earth/earth-observatory/fires-arrive-in-the-amazon-rainforest/
- [S7] https://www.thelec.kr/news/articleView.html?idxno=63776
- [S8] https://www.thelec.kr/news/articleView.html?idxno=63740
- [S9] https://aws.amazon.com/about-aws/whats-new/2026/10/amazon-bedrock-agentcore/
