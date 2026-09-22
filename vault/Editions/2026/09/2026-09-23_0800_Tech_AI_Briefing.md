---
title: 2026-09-23 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-23
timezone: Asia/Seoul
coverage_start: 2026-09-21T23:18:19.442Z
coverage_end: 2026-09-22T23:17:13.068Z
source_count: 16
new_items_count: 13
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
editorial_format: six-w/v1
theme_format: news-themes/v1
briefing_format: sector-five/v1
headlines:
  - OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하
  - LS일렉트릭, 부산 변압기 공장에 사족보행 로봇 Spot 도입
  - Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공
  - Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개
  - Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약
article_records:
  - title: OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: OpenAI API·ChatGPT Work·Codex
      what: OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하
      how: 새 모델과 프롬프트 캐시 정책 제공
      why: 에이전트 작업의 성능·비용 개선이라는 회사 설명
    lead: OpenAI는 9월 22일 GPT-6 Sol과 Luna를 공개하고 API와 ChatGPT Work·Codex에 제공하기 시작했다.
      API의 100만 토큰당 입력·출력 가격은 Sol이 각각 2달러·10달러, Luna가 0.10달러·0.50달러다. 이전 GPT-5.6
      Sol의 4달러·20달러, Luna의 0.20달러·1.20달러보다 낮다.
    papers: []
    relations: []
    topic_ids:
      - performance-path
    explanations:
      - heading: 긴 작업에서 앞선 문맥의 계산을 재사용
        paragraphs:
          - 새 모델은 추론 노력 수준이나 사용 가능한 도구를 바꾸더라도 그 이전 문맥의 프롬프트 캐시를 유지하도록 개선됐다. 개발자는
            명시적 캐시 경계도 지정할 수 있으며, 캐시된 입력에는 90% 할인이 적용된다.
          - 이는 토큰 단가와 캐시 정책의 변화다. 실제 작업 비용은 입력·출력 길이, 추론량, 캐시 적중률과 재시도 횟수에 따라
            달라지므로 같은 과제의 성공률·총비용으로 비교해야 한다.
        source_urls:
          - https://openai.com/index/introducing-gpt-6-sol-and-luna/
  - title: Nutanix, 프랑스 AI 연산 조율 기업 Ryax 인수
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Nutanix, Ryax Technologies
      when: 2026-09-22 6:00 am 게시; 사이트에 시간대 미표시
      where: 미국 Nutanix와 프랑스 Ryax
      what: Nutanix, 프랑스 AI 연산 조율 기업 Ryax 인수
      how: 연산 조율 기술·인력 인수 및 플랫폼 통합 계획
      why: 기업 AI 작업의 자원 배치 효율 개선
    lead: Nutanix는 9월 22일 프랑스의 AI 연산 조율 소프트웨어 기업 Ryax Technologies를 인수했다고 발표했다.
      Ryax의 GPU·CPU 자원 최적화와 작업 배치 기술을 Nutanix Kubernetes Platform 및 Enterprise
      AI에 통합할 계획이다. 회사는 거래가 재무에 미치는 영향이 중요하지 않은 수준이라고 밝혔지만 인수 금액은 공개하지 않았다.
    papers: []
    relations: []
    topic_ids:
      - agent-runtime
    explanations:
      - heading: 인수 완료와 제품 통합은 다른 단계
        paragraphs:
          - Ryax 기술은 사내 인프라와 대형 클라우드·GPU 전문 클라우드에 걸쳐 작업에 필요한 연산 자원을 배치하는 데 쓰인다.
            Ryax 팀은 프랑스 Nutanix 조직에 합류한다.
          - 이번 발표로 확인되는 것은 회사 인수다. 통합 제품의 기능·성능과 제공 시점은 개발 계획이며, 특정 출시일이나 고객의 절감
            실적은 제시되지 않았다.
        source_urls:
          - https://www.nutanix.com/press-releases/2026/nutanix-acquires-ryax-technologies-to-help-customers-accelerate-agentic-ai-initiatives
  - title: VAST, 데이터·모델을 보호하는 DataEnclave 공개…출하는 내년 1분기
    kind: 사건 뉴스
    region: 해외
    facts:
      who: VAST Data, NVIDIA
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 기업 사내·규제 대상 AI 인프라
      what: VAST, 데이터·모델을 보호하는 DataEnclave 공개…출하는 내년 1분기
      how: CPU·GPU 보호 영역과 검증 기반 키 전달
      why: 데이터와 모델 지식재산의 동시 보호
    lead: VAST Data는 9월 22일 민감한 기업 데이터와 AI 모델을 보호된 연산 환경에서 함께 실행하는 DataEnclave를 사전
      공개했다. NVIDIA의 기밀 컴퓨팅 기술을 사용하며, 정식 출하는 2027년 1분기로 예정했다. 기업 데이터 소유자와 모델 제공자가
      서로의 자산을 직접 노출하지 않고 추론을 수행하도록 설계한 제품이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 실행 환경을 확인한 뒤 복호화 키를 전달
        paragraphs:
          - 데이터 소유자와 모델 소유자는 각각 키를 관리한다. 원격 검증으로 실행 환경이 정책을 충족하는지 확인한 뒤 키를 전달해,
            승인된 보호 영역 안에서 데이터와 모델을 복호화하고 처리한다.
          - VAST는 격리망 운영과 감사 기록도 지원한다고 설명했다. 이는 공급업체가 발표한 보안 설계이며 독립적인 침투시험 결과나
            모든 공격에 대한 방어 보장은 아니다.
        source_urls:
          - https://www.vastdata.com/press-releases/vast-data-introduces-dataenclave-to-bring-leading-ai-models-and-enterprise-data-together-on-trusted-infrastructure
  - title: Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Proofpoint
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: Proofpoint 기업 보안 제품
      what: Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표
      how: 신원·데이터·의도 그래프와 탐지·조사·대응 에이전트
      why: 데이터 유출과 AI 사용 위험의 통합 관리
    lead: Proofpoint는 9월 22일 데이터 보호와 AI 사용 통제를 결합한 Agentic Data and AI Security 기능을
      발표했다. 탐지·조사·대응 에이전트가 사용자 신원, 접근 권한, 데이터와 의도를 연결한 공통 그래프를 활용한다. 제공 시점은
      2026년 말까지로 예고했다.
    papers: []
    relations: []
    topic_ids:
      - execution-permissions
    explanations:
      - heading: 업무 정책을 실행 통제로 연결
        paragraphs:
          - 회사는 자연어로 적은 업무 정책을 실행 시점의 통제로 연결하고, 에이전트가 탐지 결과의 맥락을 조사하도록 설계했다고
            설명했다. 대응 과정에는 사람의 검토를 포함한다.
          - 공통 그래프와 자동 대응은 제품 설계 설명이다. 실제 오탐률, 대응 지연과 사람이 승인해야 하는 범위는 도입 환경에서
            별도로 확인할 사항이다.
        source_urls:
          - https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-breaks-down-divide-between-data-security-and-ai-security
  - title: 네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시
    kind: 사건 뉴스
    region: 국내
    facts:
      who: NAVER
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 네이버클라우드 고객 가상 네트워크
      what: 네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시
      how: 프록시 경유 접근·권한 정책·작업 로그·민감정보 마스킹
      why: DB·서버 접근과 감사 기록의 통합
    lead: 네이버클라우드는 9월 22일 데이터베이스와 서버의 접근 권한·작업 이력을 통합 관리하는 DSAC를 출시했다고 밝혔다. 고객의 가상
      네트워크 안에 프록시를 자동 구성하고, 이를 거쳐 DB와 서버에 접속하도록 하는 서비스다. 관리자는 콘솔에서 사용자별 접근 정책과
      작업 기록을 확인할 수 있다.
    papers: []
    relations: []
    topic_ids:
      - execution-permissions
    explanations:
      - heading: 접속 경로와 작업 이력을 한곳에서 관리
        paragraphs:
          - 서비스는 주민등록번호·카드번호 같은 민감정보의 마스킹과 업무 시간 외 접근·대량 조회 감시를 지원한다. 기존 로그 관리
            서비스와도 연동한다.
          - 접근 통제 도구의 제공과 조직의 정책 준수는 별개다. 사용자 권한·예외 정책·경보 후 대응을 실제 업무에 맞게 설정해야
            하며, 제품 도입만으로 규정 준수가 보장되지는 않는다.
        source_urls:
          - https://navercorp.com/media/pressReleasesDetail?seq=10034680
  - title: LS일렉트릭, 부산 변압기 공장에 사족보행 로봇 Spot 도입
    kind: 사건 뉴스
    region: 국내
    facts:
      who: LS ELECTRIC, Boston Dynamics
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 대한민국 부산 초고압 변압기 공장
      what: LS일렉트릭, 부산 변압기 공장에 사족보행 로봇 Spot 도입
      how: 보행 로봇을 이용한 생산·시험설비 모니터링
      why: 설비 고장·안전사고 예방이라는 회사 목적
    lead: LS일렉트릭은 9월 22일 최근 증설한 부산사업장에 Boston Dynamics의 사족보행 로봇 Spot을 도입했다고 발표했다.
      초고압 변압기 생산 공정과 시험설비를 모니터링해 품질·안전 관리에 활용하는 현장 적용이다. 회사는 수집 데이터의 AI 분석을 바탕으로
      전 사업장 확대를 검토한다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 현장 점검 적용과 전사 확대 계획
        paragraphs:
          - 로봇의 적용 대상은 변압기 공정과 시험설비의 상태 점검이다. 부품을 집고 조립하는 산업용 로봇팔이나 협동로봇의 공급
            실적으로 분류하지 않는다.
          - 부산 도입은 발표된 실행 단계지만 다른 사업장 확대는 검토 단계다. 발표에는 도입 가격, 고장 감소율이나 투자 회수 기간이
            제시되지 않았다.
        source_urls:
          - https://lsholdings.co.kr/ko/media/news/306c38774167465a5137683163335633354a6952646459724d77734f74753645
  - title: Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Intrinsic, Open Robotics, Universal Robots
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 미국 캘리포니아 실제 UR5e 작업셀·원격 참가팀
      what: Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%
      how: 시각 위치 추정과 힘·토크 피드백 기반 삽입
      why: 전자 조립의 유연 케이블 자동화 검증
    lead: Intrinsic은 9월 22일 AI for Industry Challenge의 실제 로봇 작업셀 최종 시험에서 두 팀이 성공률
      100%를 기록했다고 발표했다. 참가팀은 미국 캘리포니아의 UR5e 작업셀에 원격으로 소프트웨어를 배포해 케이블 커넥터를 찾아 집고
      지정 포트에 끼우는 과제를 수행했다. 미국 Flex 팀이 우승하고 인도 TCS-PLGRM 팀이 2위를 차지했다.
    papers: []
    relations: []
    topic_ids:
      - evaluation
    explanations:
      - heading: 위치 인식과 힘 제어에 서로 다른 방법 적용
        paragraphs:
          - 상위 10개 팀 모두 부품 위치 인식에 Intrinsic Vision Model을 사용했고, 90%는 삽입 단계에 힘·토크
            센서 피드백과 규칙 기반 제어를 사용했다. 물체를 보는 단계와 접촉하며 움직이는 단계의 방법을 나눈 것이다.
          - 주최 측은 시뮬레이션이 커넥터의 걸림이나 휘어지는 케이블을 충분히 재현하지 못했다고 설명했다. 대회 작업셀의 성공률은 여러
            공장의 장기 가동률이나 양산 불량률을 입증하는 수치가 아니다.
        source_urls:
          - https://www.intrinsic.ai/blog/posts/ai-for-industry-challenge
  - title: Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cadence, Honda R&D
      when: 2026-09-22 09:00 EDT; Business Wire 회사 배포문 미러 본문 확인
      where: 미국 Cadence 발표·Honda R&D 초기 평가
      what: Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공
      how: 설계 사양→RTL 생성·수정→EDA 기능 및 PPA 검증
      why: 칩 설계 기간과 초기 설계 품질 개선
    lead: Cadence는 9월 22일 자연어 설계 사양을 RTL로 변환하고 전력·성능·면적을 최적화하는 ChipStack RTL
      Generation Agent를 발표했다. 기존 RTL도 새 기능이나 구조 요구에 맞춰 수정하고 EDA 도구로 검증하는 방식이다.
      확대된 기능은 2026년 4분기 일부 조기 접근 고객에게 제공할 예정이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 회로 동작을 작성한 뒤 설계 도구로 검증
        paragraphs:
          - RTL은 레지스터 사이의 데이터 이동과 논리 동작을 기술하는 설계 표현이다. 에이전트는 이를 생성·수정한 뒤 구현·검증
            도구를 이용해 기능과 PPA 조건을 확인한다. Honda R&D는 자동차용 SoC의 개발 생산성 개선을 위해 평가 중이라고
            밝혔다.
          - Cadence는 초기 시험에서 기반 모델만으로 코드를 생성한 경우보다 평균 면적 24%, 전력 18% 감소를 보고했다.
            공개문에는 시험 설계 수와 상세 비교 조건이 없어 일반적인 칩 설계나 양산 성과로 확대할 수 없다.
        source_urls:
          - https://www.businesswire.com/news/home/20260922021231/en/
          - https://fwnbc.marketminute.com/article/bizwire-2026-9-22-cadence-expands-chipstack-ai-super-agent-with-a-new-agent-for-rtl-generation-and-early-ppa-optimization
  - title: LG에너지솔루션 ESS, NVIDIA DSX Ready 요건 충족
    kind: 사건 뉴스
    region: 국내
    facts:
      who: LG에너지솔루션, NVIDIA
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 서울 발표·북미 공급망
      what: LG에너지솔루션 ESS, NVIDIA DSX Ready 요건 충족
      how: 모듈형 교류 연계 ESS의 DSX 설계 요건 검증
      why: 대형 전력 수요의 부하 변동 대응
    lead: LG에너지솔루션은 9월 22일 자사 배터리 에너지저장장치가 NVIDIA DSX Ready BESS 자격을 획득했다고 발표했다. DSX
      설계 요건에 맞는 교류 연계형 저장장치로, 2.5MW 출력·5.1MWh 용량의 배터리 블록을 조합한다. AI 데이터센터 등의 전력
      부하 변동과 전압 저하에 대응하도록 설계했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 출력·용량과 생산능력 계획을 구분
        paragraphs:
          - 2.5MW는 블록의 출력, 5.1MWh는 저장 에너지 용량이다. 회사는 계통 형성 기능과 빠른 응답, 전압 저하 대응을
            지원한다고 설명했다.
          - 북미 5개 생산시설을 활용해 연말까지 LFP 셀 생산능력 50GWh 이상을 확보하겠다는 내용은 계획이다. 이번 자격 획득은
            해당 규모의 실제 생산이나 고객 수주·설치 완료를 뜻하지 않는다.
        source_urls:
          - https://lgcorp.com/media/release/30596
  - title: Pila·Brooklyn SolarWorks, 뉴욕 옥상 태양광과 플러그형 배터리 실증
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Pila Energy, Brooklyn SolarWorks
      when: 2026-09-22 09:00 ET 회사 배포문
      where: 미국 뉴욕 브루클린·퀸스
      what: Pila·Brooklyn SolarWorks, 뉴욕 옥상 태양광과 플러그형 배터리 실증
      how: 옥상 태양광·콘센트 연결 배터리·가구 참여 실증
      why: 정전 대비 및 시간대별 전력 사용 조절
    lead: Pila Energy는 9월 22일 뉴욕에서 Brooklyn SolarWorks의 옥상 태양광에 플러그형 가정용 배터리를 결합하는
      시범사업을 발표했다. 회사에 따르면 브루클린·퀸스의 참여 가구가 이미 태양광 발전량을 저장하고 있으며, 가을에 참여 가구를 늘릴
      예정이다. 이웃이 함께 신청하면 공동 할인 혜택을 받는 Pila Neighborhoods도 발표했다.
    papers: []
    relations: []
    topic_ids:
      - grid-home-batteries
    explanations:
      - heading: 가전제품 전원과 건물 전체의 전원은 다르다
        paragraphs:
          - 배터리는 표준 120V 콘센트에 연결하고 냉장고·라우터 등 연결된 기기에 전력을 공급한다. 전기요금이 낮을 때 충전해 높은
            시간대에 사용하거나 정전 시 필수 기기를 유지하는 방식이다.
          - 시범사업의 가구 수, 실제 절감액과 장시간 정전 시험 결과는 공개되지 않았다. 제품에 연결된 기기의 백업 기능을 주택
            전체에 전력을 공급하는 설비와 동일하게 해석할 수 없다.
        source_urls:
          - https://www.prweb.com/releases/pila-energy-launches-first-plug-in-path-to-home-battery-storage-in-new-york-city-302886178.html
  - title: Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 다기관 제2형 당뇨병 임상시험
      what: Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개
      how: 주1회 주사·48주 무작위 위약 대조 평가
      why: 혈당과 체중 조절 효과 평가
    lead: Roche는 9월 22일 과체중·비만을 동반한 성인 제2형 당뇨병 환자 447명이 참여한 enicepatide 2상 시험의 주요
      결과를 발표했다. 주 1회 24mg 투여군은 48주 시점에 당화혈색소가 평균 8.1%에서 2.65%포인트 낮아졌고 체중은 평균
      15.5% 감소했다. 이는 회사가 공개한 주요 결과로, 치료제 승인이나 임상 논문 전문 공개를 뜻하지 않는다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 투여군의 변화량과 위약 대비 효과
        paragraphs:
          - CT-388-104는 무작위·이중눈가림·위약 대조 시험이다. 447명은 전체 참여자 수이며 24mg군의 인원 수가 아니다.
            발표된 체중 감소율을 위약 보정 효과로 바꿔 읽을 수 없다.
          - 회사는 모든 용량군 합산에서 이상반응으로 치료를 중단한 비율이 2%, 위약군은 0%였으며 주로 경도·중등도 위장관
            이상반응이었다고 밝혔다. 혈당·심혈관 결과를 평가하는 3상은 2027년 상반기 시작할 계획이다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-09-22
  - title: Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약
    kind: 연구 사업화
    region: 해외
    facts:
      who: Envisagenics, Boehringer Ingelheim
      when: 2026-09-22 공식 발표; 게시 시각 미표시
      where: 미국 뉴욕 발표·Envisagenics와 Boehringer 공동 연구
      what: Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약
      how: 스플라이싱 표적 발굴→실험 검증→선택적 독점 라이선스
      why: 정상 조직과 구별되는 고형암 표적 확보
    lead: Envisagenics는 9월 22일 베링거인겔하임과 고형암 치료 표적을 검증하는 다년간 연구 협업·옵션 계약을 발표했다. 자체
      SpliceCore 플랫폼으로 찾은 종양 특이적 표적을 연구하고, 성공적으로 검증되면 베링거가 선택한 표적의 독점 개발·사업화 권리를
      확보할 수 있는 구조다. 선급금·연구비·옵션료·개발 및 상업화 단계별 지급금을 합친 잠재 금액은 10억달러 이상이며 향후 판매
      로열티는 별도다.
    papers: []
    relations:
      - person_id: martin-akerman-cshl-envisagenics
        person_name: Martin Akerman
        affiliation: CSHL 연구실 출신·Envisagenics
        organization: Envisagenics
        role: 공동창업
        claim: CSHL 박사후연구원 당시 SpliceCore 개발; Envisagenics 공동창업
        as_of: 2026-09-23
        evidence_urls:
          - https://www.cshl.edu/envisagenics-and-biogen-partner-for-rna-splicing-research/
          - https://envisagenics.com/about
      - person_id: adrian-krainer-cshl
        person_name: Adrian Krainer
        affiliation: Cold Spring Harbor Laboratory
        organization: Envisagenics
        role: 기술자문
        claim: 2021년 CSHL 자료가 확인한 과학자문위원 관계; 창업 관계로 확대하지 않음
        as_of: 2021-06-09
        evidence_urls:
          - https://www.cshl.edu/envisagenics-and-biogen-partner-for-rna-splicing-research/
    topic_ids:
      - venture-envisagenics
    explanations:
      - heading: 유전자의 이름보다 RNA가 이어지는 방식을 본다
        paragraphs:
          - 같은 유전자라도 RNA 조각을 다르게 이어 붙이면 다른 단백질 형태가 생길 수 있다. SpliceCore는 1,400만개
            이상의 스플라이싱 사건 자료와 전사체 분석·실험을 결합해 암에서 나타나는 표적을 선별한다. 이번 협업에서는 항체약물접합체,
            T세포 연결체, 다중특이 항체 등으로 활용할 가능성을 검증한다.
        source_urls:
          - https://envisagenics.com/news/envisagenics-and-boehringer-ingelheim-enter-multi-target-collaboration-to-develop-first-in-class-precision-therapies-based-on-rna-splicing-derived-targets-for-hard-to-treat-cancers
      - heading: 연구실에서 나온 플랫폼의 사업화 경로
        paragraphs:
          - CSHL은 2021년 공식 자료에서 Envisagenics를 연구소 스핀아웃으로 소개하고, Martin Akerman이
            Adrian Krainer 연구실의 박사후연구원 시절 SpliceCore를 개발했다고 설명했다. Akerman은
            공동창업자이며 Krainer의 확인된 회사 관계는 과학자문이다. 회사 소개도 Akerman의 공동창업 관계를 확인한다.
        source_urls:
          - https://www.cshl.edu/envisagenics-and-biogen-partner-for-rna-splicing-research/
          - https://envisagenics.com/about
      - heading: 분석 · 계약 규모보다 표적 검증과 옵션 행사가 관건
        paragraphs:
          - 이번 계약은 연구용 표적 발굴 플랫폼이 제약사의 후속 개발로 이어질 수 있는 경로를 마련한다. 다만 10억달러 이상은
            조건부 미래 지급을 포함한 잠재 합계이며 지금 받은 현금이나 확정 매출이 아니다. 표적 검증의 성공, 독점 옵션 행사와
            후속 임상 진입이 실제 사업화 진척을 가를 단계다.
        source_urls:
          - https://envisagenics.com/news/envisagenics-and-boehringer-ingelheim-enter-multi-target-collaboration-to-develop-first-in-class-precision-therapies-based-on-rna-splicing-derived-targets-for-hard-to-treat-cancers
    analysis_summary: 연구실 유래 표적 발굴 플랫폼을 제약사 검증·독점 옵션으로 연결한 계약이다. 잠재 지급 총액과 실제 연구 성과·현금 수령은 구분한다.
    next_check: 표적 검증 결과, 독점 옵션 행사, 후속 임상 진입과 실제 지급 공시.
  - title: 우주항공청, 제2우주센터 설계에 민간 발사 수요 의견 수렴
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 우주항공청, 대한항공, 비츠로넥스텍, 이노스페이스, 한양ENG, 한화에어로스페이스
      when: 2026-09-22T14:00:00+09:00 공식 등록; 같은 날 간담회
      where: 대한민국 한국항공우주연구원
      what: 우주항공청, 제2우주센터 설계에 민간 발사 수요 의견 수렴
      how: 발사 수요·시설 요건·공간·운영 요구 간담회
      why: 민간이 활용할 발사 인프라 설계
    lead: 우주항공청은 9월 22일 한국항공우주연구원에서 국내 발사체 관련 5개 기업과 제2우주센터 민간 활용 간담회를 열었다. 기업들은 향후
      발사 수요와 상업 발사 시작 시점을 고려한 인프라 우선순위, 시설 요건과 기업 활용 공간에 관한 요구를 제시했다. 우주항공청은 설계
      단계부터 이러한 수요를 반영하겠다고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 수요 조사와 발사 계약을 구분
        paragraphs:
          - 이번에 진행된 것은 발사장 설계·운영 요구를 모으는 협의다. 발표에는 확정 발사 횟수나 시설 가동일, 기업별 사용 계약
            금액이 제시되지 않았다. 실제 상업 발사 능력 확대는 설계 확정과 건설·운영 일정에서 확인할 수 있다.
        source_urls:
          - https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=498
article_reviews:
  - title: OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하
    event_id: 73461b3e97af0d93
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Nutanix, 프랑스 AI 연산 조율 기업 Ryax 인수
    event_id: 299dfd60a92b85ff
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: VAST, 데이터·모델을 보호하는 DataEnclave 공개…출하는 내년 1분기
    event_id: 48f3b502c43f955e
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표
    event_id: f73f3c73e2cee66d
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: 네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시
    event_id: c2a48879e9e88507
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: LS일렉트릭, 부산 변압기 공장에 사족보행 로봇 Spot 도입
    event_id: 94d03e7f8181fafd
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%
    event_id: c2d62bc474a75d21
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공
    event_id: 3742191de5126dd0
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: LG에너지솔루션 ESS, NVIDIA DSX Ready 요건 충족
    event_id: 8eef4c45f7f30411
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Pila·Brooklyn SolarWorks, 뉴욕 옥상 태양광과 플러그형 배터리 실증
    event_id: fbfa93226b6339d4
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개
    event_id: 66c52fd129c04f36
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약
    event_id: cab7656fd9930f79
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
  - title: 우주항공청, 제2우주센터 설계에 민간 발사 수요 의견 수렴
    event_id: 6bbcd64185c1cd83
    review_status: verified
    published_at: 2026-09-22
    reviewed_at: 2026-09-23
    concept_ids: []
---

# 이번 호 표지

> AI 모델 요금 인하와 로봇 현장 적용, RNA 연구의 제약사 계약

# 차례

커버 스토리 · 뉴스 데스크 · 리서치 노트

# 커버 스토리

## OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품, 가격 변경
**기업·기관:** OpenAI

OpenAI는 9월 22일 GPT-6 Sol과 Luna를 공개하고 API와 ChatGPT Work·Codex에 제공하기 시작했다. API의 100만 토큰당 입력·출력 가격은 Sol이 각각 2달러·10달러, Luna가 0.10달러·0.50달러다. 이전 GPT-5.6 Sol의 4달러·20달러, Luna의 0.20달러·1.20달러보다 낮다. [S1]

### 긴 작업에서 앞선 문맥의 계산을 재사용

새 모델은 추론 노력 수준이나 사용 가능한 도구를 바꾸더라도 그 이전 문맥의 프롬프트 캐시를 유지하도록 개선됐다. 개발자는 명시적 캐시 경계도 지정할 수 있으며, 캐시된 입력에는 90% 할인이 적용된다. [S1]

이는 토큰 단가와 캐시 정책의 변화다. 실제 작업 비용은 입력·출력 길이, 추론량, 캐시 적중률과 재시도 횟수에 따라 달라지므로 같은 과제의 성공률·총비용으로 비교해야 한다. [S1]

# 뉴스 데스크

## Nutanix, 프랑스 AI 연산 조율 기업 Ryax 인수

**분야:** 소프트웨어·클라우드
**테마:** 투자·기업거래
**보조 테마:** 없음
**세부 태그:** 인수합병
**기업·기관:** Nutanix, Ryax Technologies

Nutanix는 9월 22일 프랑스의 AI 연산 조율 소프트웨어 기업 Ryax Technologies를 인수했다고 발표했다. Ryax의 GPU·CPU 자원 최적화와 작업 배치 기술을 Nutanix Kubernetes Platform 및 Enterprise AI에 통합할 계획이다. 회사는 거래가 재무에 미치는 영향이 중요하지 않은 수준이라고 밝혔지만 인수 금액은 공개하지 않았다. [S2]

### 인수 완료와 제품 통합은 다른 단계

Ryax 기술은 사내 인프라와 대형 클라우드·GPU 전문 클라우드에 걸쳐 작업에 필요한 연산 자원을 배치하는 데 쓰인다. Ryax 팀은 프랑스 Nutanix 조직에 합류한다. [S2]

이번 발표로 확인되는 것은 회사 인수다. 통합 제품의 기능·성능과 제공 시점은 개발 계획이며, 특정 출시일이나 고객의 절감 실적은 제시되지 않았다. [S2]

## VAST, 데이터·모델을 보호하는 DataEnclave 공개…출하는 내년 1분기

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** VAST Data, NVIDIA

VAST Data는 9월 22일 민감한 기업 데이터와 AI 모델을 보호된 연산 환경에서 함께 실행하는 DataEnclave를 사전 공개했다. NVIDIA의 기밀 컴퓨팅 기술을 사용하며, 정식 출하는 2027년 1분기로 예정했다. 기업 데이터 소유자와 모델 제공자가 서로의 자산을 직접 노출하지 않고 추론을 수행하도록 설계한 제품이다. [S3]

### 실행 환경을 확인한 뒤 복호화 키를 전달

데이터 소유자와 모델 소유자는 각각 키를 관리한다. 원격 검증으로 실행 환경이 정책을 충족하는지 확인한 뒤 키를 전달해, 승인된 보호 영역 안에서 데이터와 모델을 복호화하고 처리한다. [S3]

VAST는 격리망 운영과 감사 기록도 지원한다고 설명했다. 이는 공급업체가 발표한 보안 설계이며 독립적인 침투시험 결과나 모든 공격에 대한 방어 보장은 아니다. [S3]

## Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Proofpoint

Proofpoint는 9월 22일 데이터 보호와 AI 사용 통제를 결합한 Agentic Data and AI Security 기능을 발표했다. 탐지·조사·대응 에이전트가 사용자 신원, 접근 권한, 데이터와 의도를 연결한 공통 그래프를 활용한다. 제공 시점은 2026년 말까지로 예고했다. [S4]

### 업무 정책을 실행 통제로 연결

회사는 자연어로 적은 업무 정책을 실행 시점의 통제로 연결하고, 에이전트가 탐지 결과의 맥락을 조사하도록 설계했다고 설명했다. 대응 과정에는 사람의 검토를 포함한다. [S4]

공통 그래프와 자동 대응은 제품 설계 설명이다. 실제 오탐률, 대응 지연과 사람이 승인해야 하는 범위는 도입 환경에서 별도로 확인할 사항이다. [S4]

## 네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** NAVER

네이버클라우드는 9월 22일 데이터베이스와 서버의 접근 권한·작업 이력을 통합 관리하는 DSAC를 출시했다고 밝혔다. 고객의 가상 네트워크 안에 프록시를 자동 구성하고, 이를 거쳐 DB와 서버에 접속하도록 하는 서비스다. 관리자는 콘솔에서 사용자별 접근 정책과 작업 기록을 확인할 수 있다. [S5]

### 접속 경로와 작업 이력을 한곳에서 관리

서비스는 주민등록번호·카드번호 같은 민감정보의 마스킹과 업무 시간 외 접근·대량 조회 감시를 지원한다. 기존 로그 관리 서비스와도 연동한다. [S5]

접근 통제 도구의 제공과 조직의 정책 준수는 별개다. 사용자 권한·예외 정책·경보 후 대응을 실제 업무에 맞게 설정해야 하며, 제품 도입만으로 규정 준수가 보장되지는 않는다. [S5]

## LS일렉트릭, 부산 변압기 공장에 사족보행 로봇 Spot 도입

**분야:** 로봇·제조
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 고객 도입
**기업·기관:** LS ELECTRIC, Boston Dynamics

LS일렉트릭은 9월 22일 최근 증설한 부산사업장에 Boston Dynamics의 사족보행 로봇 Spot을 도입했다고 발표했다. 초고압 변압기 생산 공정과 시험설비를 모니터링해 품질·안전 관리에 활용하는 현장 적용이다. 회사는 수집 데이터의 AI 분석을 바탕으로 전 사업장 확대를 검토한다. [S6]

### 현장 점검 적용과 전사 확대 계획

로봇의 적용 대상은 변압기 공정과 시험설비의 상태 점검이다. 부품을 집고 조립하는 산업용 로봇팔이나 협동로봇의 공급 실적으로 분류하지 않는다. [S6]

부산 도입은 발표된 실행 단계지만 다른 사업장 확대는 검토 단계다. 발표에는 도입 가격, 고장 감소율이나 투자 회수 기간이 제시되지 않았다. [S6]

## Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Intrinsic, Open Robotics, Universal Robots

Intrinsic은 9월 22일 AI for Industry Challenge의 실제 로봇 작업셀 최종 시험에서 두 팀이 성공률 100%를 기록했다고 발표했다. 참가팀은 미국 캘리포니아의 UR5e 작업셀에 원격으로 소프트웨어를 배포해 케이블 커넥터를 찾아 집고 지정 포트에 끼우는 과제를 수행했다. 미국 Flex 팀이 우승하고 인도 TCS-PLGRM 팀이 2위를 차지했다. [S7]

### 위치 인식과 힘 제어에 서로 다른 방법 적용

상위 10개 팀 모두 부품 위치 인식에 Intrinsic Vision Model을 사용했고, 90%는 삽입 단계에 힘·토크 센서 피드백과 규칙 기반 제어를 사용했다. 물체를 보는 단계와 접촉하며 움직이는 단계의 방법을 나눈 것이다. [S7]

주최 측은 시뮬레이션이 커넥터의 걸림이나 휘어지는 케이블을 충분히 재현하지 못했다고 설명했다. 대회 작업셀의 성공률은 여러 공장의 장기 가동률이나 양산 불량률을 입증하는 수치가 아니다. [S7]

## Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공

**분야:** 반도체·컴퓨팅
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Cadence, Honda R&D

Cadence는 9월 22일 자연어 설계 사양을 RTL로 변환하고 전력·성능·면적을 최적화하는 ChipStack RTL Generation Agent를 발표했다. 기존 RTL도 새 기능이나 구조 요구에 맞춰 수정하고 EDA 도구로 검증하는 방식이다. 확대된 기능은 2026년 4분기 일부 조기 접근 고객에게 제공할 예정이다. [S8]

### 회로 동작을 작성한 뒤 설계 도구로 검증

RTL은 레지스터 사이의 데이터 이동과 논리 동작을 기술하는 설계 표현이다. 에이전트는 이를 생성·수정한 뒤 구현·검증 도구를 이용해 기능과 PPA 조건을 확인한다. Honda R&D는 자동차용 SoC의 개발 생산성 개선을 위해 평가 중이라고 밝혔다. [S8] [S9]

Cadence는 초기 시험에서 기반 모델만으로 코드를 생성한 경우보다 평균 면적 24%, 전력 18% 감소를 보고했다. 공개문에는 시험 설계 수와 상세 비교 조건이 없어 일반적인 칩 설계나 양산 성과로 확대할 수 없다. [S8] [S9]

## LG에너지솔루션 ESS, NVIDIA DSX Ready 요건 충족

**분야:** 에너지·기후기술
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 호환성
**기업·기관:** LG에너지솔루션, NVIDIA

LG에너지솔루션은 9월 22일 자사 배터리 에너지저장장치가 NVIDIA DSX Ready BESS 자격을 획득했다고 발표했다. DSX 설계 요건에 맞는 교류 연계형 저장장치로, 2.5MW 출력·5.1MWh 용량의 배터리 블록을 조합한다. AI 데이터센터 등의 전력 부하 변동과 전압 저하에 대응하도록 설계했다. [S10]

### 출력·용량과 생산능력 계획을 구분

2.5MW는 블록의 출력, 5.1MWh는 저장 에너지 용량이다. 회사는 계통 형성 기능과 빠른 응답, 전압 저하 대응을 지원한다고 설명했다. [S10]

북미 5개 생산시설을 활용해 연말까지 LFP 셀 생산능력 50GWh 이상을 확보하겠다는 내용은 계획이다. 이번 자격 획득은 해당 규모의 실제 생산이나 고객 수주·설치 완료를 뜻하지 않는다. [S10]

## Pila·Brooklyn SolarWorks, 뉴욕 옥상 태양광과 플러그형 배터리 실증

**분야:** 에너지·기후기술
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 고객 도입
**기업·기관:** Pila Energy, Brooklyn SolarWorks

Pila Energy는 9월 22일 뉴욕에서 Brooklyn SolarWorks의 옥상 태양광에 플러그형 가정용 배터리를 결합하는 시범사업을 발표했다. 회사에 따르면 브루클린·퀸스의 참여 가구가 이미 태양광 발전량을 저장하고 있으며, 가을에 참여 가구를 늘릴 예정이다. 이웃이 함께 신청하면 공동 할인 혜택을 받는 Pila Neighborhoods도 발표했다. [S11]

### 가전제품 전원과 건물 전체의 전원은 다르다

배터리는 표준 120V 콘센트에 연결하고 냉장고·라우터 등 연결된 기기에 전력을 공급한다. 전기요금이 낮을 때 충전해 높은 시간대에 사용하거나 정전 시 필수 기기를 유지하는 방식이다. [S11]

시범사업의 가구 수, 실제 절감액과 장시간 정전 시험 결과는 공개되지 않았다. 제품에 연결된 기기의 백업 기능을 주택 전체에 전력을 공급하는 설비와 동일하게 해석할 수 없다. [S11]

## Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Roche

Roche는 9월 22일 과체중·비만을 동반한 성인 제2형 당뇨병 환자 447명이 참여한 enicepatide 2상 시험의 주요 결과를 발표했다. 주 1회 24mg 투여군은 48주 시점에 당화혈색소가 평균 8.1%에서 2.65%포인트 낮아졌고 체중은 평균 15.5% 감소했다. 이는 회사가 공개한 주요 결과로, 치료제 승인이나 임상 논문 전문 공개를 뜻하지 않는다. [S12]

### 투여군의 변화량과 위약 대비 효과

CT-388-104는 무작위·이중눈가림·위약 대조 시험이다. 447명은 전체 참여자 수이며 24mg군의 인원 수가 아니다. 발표된 체중 감소율을 위약 보정 효과로 바꿔 읽을 수 없다. [S12]

회사는 모든 용량군 합산에서 이상반응으로 치료를 중단한 비율이 2%, 위약군은 0%였으며 주로 경도·중등도 위장관 이상반응이었다고 밝혔다. 혈당·심혈관 결과를 평가하는 3상은 2027년 상반기 시작할 계획이다. [S12]

## 우주항공청, 제2우주센터 설계에 민간 발사 수요 의견 수렴

**분야:** 우주·기초과학
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 기술 제휴
**기업·기관:** 우주항공청, 대한항공, 비츠로넥스텍, 이노스페이스, 한양ENG, 한화에어로스페이스

우주항공청은 9월 22일 한국항공우주연구원에서 국내 발사체 관련 5개 기업과 제2우주센터 민간 활용 간담회를 열었다. 기업들은 향후 발사 수요와 상업 발사 시작 시점을 고려한 인프라 우선순위, 시설 요건과 기업 활용 공간에 관한 요구를 제시했다. 우주항공청은 설계 단계부터 이러한 수요를 반영하겠다고 밝혔다. [S16]

### 수요 조사와 발사 계약을 구분

이번에 진행된 것은 발사장 설계·운영 요구를 모으는 협의다. 발표에는 확정 발사 횟수나 시설 가동일, 기업별 사용 계약 금액이 제시되지 않았다. 실제 상업 발사 능력 확대는 설계 확정과 건설·운영 일정에서 확인할 수 있다. [S16]

# 리서치 노트

## Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약

**분야:** 바이오·의료기술
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 수주·계약
**기업·기관:** Envisagenics, Boehringer Ingelheim

Envisagenics는 9월 22일 베링거인겔하임과 고형암 치료 표적을 검증하는 다년간 연구 협업·옵션 계약을 발표했다. 자체 SpliceCore 플랫폼으로 찾은 종양 특이적 표적을 연구하고, 성공적으로 검증되면 베링거가 선택한 표적의 독점 개발·사업화 권리를 확보할 수 있는 구조다. 선급금·연구비·옵션료·개발 및 상업화 단계별 지급금을 합친 잠재 금액은 10억달러 이상이며 향후 판매 로열티는 별도다. [S13]

### 유전자의 이름보다 RNA가 이어지는 방식을 본다

같은 유전자라도 RNA 조각을 다르게 이어 붙이면 다른 단백질 형태가 생길 수 있다. SpliceCore는 1,400만개 이상의 스플라이싱 사건 자료와 전사체 분석·실험을 결합해 암에서 나타나는 표적을 선별한다. 이번 협업에서는 항체약물접합체, T세포 연결체, 다중특이 항체 등으로 활용할 가능성을 검증한다. [S13]

### 연구실에서 나온 플랫폼의 사업화 경로

CSHL은 2021년 공식 자료에서 Envisagenics를 연구소 스핀아웃으로 소개하고, Martin Akerman이 Adrian Krainer 연구실의 박사후연구원 시절 SpliceCore를 개발했다고 설명했다. Akerman은 공동창업자이며 Krainer의 확인된 회사 관계는 과학자문이다. 회사 소개도 Akerman의 공동창업 관계를 확인한다. [S14] [S15]

### 분석 · 계약 규모보다 표적 검증과 옵션 행사가 관건

이번 계약은 연구용 표적 발굴 플랫폼이 제약사의 후속 개발로 이어질 수 있는 경로를 마련한다. 다만 10억달러 이상은 조건부 미래 지급을 포함한 잠재 합계이며 지금 받은 현금이나 확정 매출이 아니다. 표적 검증의 성공, 독점 옵션 행사와 후속 임상 진입이 실제 사업화 진척을 가를 단계다. [S13]

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

없음

# Source List

- [S1] https://openai.com/index/introducing-gpt-6-sol-and-luna/
- [S2] https://www.nutanix.com/press-releases/2026/nutanix-acquires-ryax-technologies-to-help-customers-accelerate-agentic-ai-initiatives
- [S3] https://www.vastdata.com/press-releases/vast-data-introduces-dataenclave-to-bring-leading-ai-models-and-enterprise-data-together-on-trusted-infrastructure
- [S4] https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-breaks-down-divide-between-data-security-and-ai-security
- [S5] https://navercorp.com/media/pressReleasesDetail?seq=10034680
- [S6] https://lsholdings.co.kr/ko/media/news/306c38774167465a5137683163335633354a6952646459724d77734f74753645
- [S7] https://www.intrinsic.ai/blog/posts/ai-for-industry-challenge
- [S8] https://www.businesswire.com/news/home/20260922021231/en/
- [S9] https://fwnbc.marketminute.com/article/bizwire-2026-9-22-cadence-expands-chipstack-ai-super-agent-with-a-new-agent-for-rtl-generation-and-early-ppa-optimization
- [S10] https://lgcorp.com/media/release/30596
- [S11] https://www.prweb.com/releases/pila-energy-launches-first-plug-in-path-to-home-battery-storage-in-new-york-city-302886178.html
- [S12] https://www.roche.com/media/releases/med-cor-2026-09-22
- [S13] https://envisagenics.com/news/envisagenics-and-boehringer-ingelheim-enter-multi-target-collaboration-to-develop-first-in-class-precision-therapies-based-on-rna-splicing-derived-targets-for-hard-to-treat-cancers
- [S14] https://www.cshl.edu/envisagenics-and-biogen-partner-for-rna-splicing-research/
- [S15] https://envisagenics.com/about
- [S16] https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=498
