---
title: 2026-10-01 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-10-01
timezone: Asia/Seoul
coverage_start: 2026-09-29T23:17:13.068Z
coverage_end: 2026-10-01T13:38:20Z
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 20
new_items_count: 20
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약
  - Google Cloud, 에이전트 격리용 GKE Agent Substrate와 고속 저장 VM 공개
  - Micron, 2026 회계연도 매출 1,331억 9천만 달러 발표
  - Hitachi·FANUC, 이바라키 공장서 Physical AI 검증 후 공동 배치 계획
  - NASA, 달 표면 5G·Wi-Fi 6 통신 개발에 Modulate Space 계약
article_records:
  - title: OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: OpenAI와 Synopsys
      when: 2026-09-30 양사 발표
      where: 미국, 전 세계 반도체 설계 고객 대상
      what: 다년 협력과 수익 배분 계약을 체결하고 GPT-Synopsys 공동 개발·판매를 추진
      how: OpenAI 모델을 Synopsys EDA 도구에 특화해 설계·검증 작업을 반복 실행하도록 설계
      why: 엔지니어가 설계 후보와 PPA를 더 빨리 탐색하도록 돕겠다는 양사 구상
    lead: OpenAI와 Synopsys는 2026년 9월 30일 반도체 설계 특화 모델 GPT-Synopsys를 공동 개발하고 고객에게 함께
      제공하는 다년 계약을 발표했다. OpenAI는 Synopsys의 전자설계자동화(EDA) 도구를 사용할 수 있도록 라이선스를 받고,
      양사는 연구개발·시장 출시와 수익 배분에 협력한다. 초기 기술 협의는 시작됐지만 제품 출시일과 실제 설계 성과는 발표되지 않았다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: DigitalOcean, 에이전트 실행·추론·저장을 묶은 Agent Droplets 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: DigitalOcean
      when: 2026-10-01
      where: Managed Agents 공개 프리뷰
      what: Agent Droplets 월간 요금과 실행 환경 제공
      how: 전용 microVM·자동 일시정지·AI 선불 잔액
      why: 에이전트 실행·추론·저장 사용을 함께 관리
    lead: DigitalOcean은 10월 1일 Managed Agents 공개 프리뷰에 Agent Droplets를 도입했다. 월간 Pro는
      50달러, Team은 200달러이며 에이전트 사용료를 각각 15%와 20% 할인한다. 기존 에이전트 실행 도구를 전용
      microVM에서 이용하고 유휴 상태에는 자동으로 일시정지하는 방식이다.
    explanations:
      - heading: 실행 상태와 잔액 소진 후 재개
        paragraphs:
          - 회사 설명에 따르면 microVM은 일시정지 상태에서 약 300밀리초에 재개한다. AI 잔액이 모두 소진되면 세션은 다음
            안전한 지점에서 정지하며 스냅샷에 작업 상태를 보존한다. 자금을 추가하면 그 상태에서 작업을 이어 갈 수 있다.
        source_urls:
          - https://www.digitalocean.com/blog/introducing-agent-droplets
      - heading: AI 선불 잔액과 일반 클라우드 요금
        paragraphs:
          - Agent Droplet 이용 한도를 소진하면 에이전트가 Inference and Agents Balance를 사용한다.
            이 선불 잔액은 AI 제품에만 적용되며 일반 Droplets·Spaces·Managed Databases 비용은 기존 결제
            주기에 따로 청구된다. 월간 요금과 할인율만으로 전체 클라우드 비용이 고정된다고 볼 수 없다.
        source_urls:
          - https://www.digitalocean.com/blog/introducing-agent-droplets
    papers: []
    relations: []
    topic_ids: []
  - title: Google Cloud Data Agent Kit 정식 제공…Bigtable·Spark 지원 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google Cloud
      when: 2026-09-30
      where: Google Cloud 데이터 제품
      what: Data Agent Kit 정식 제공 및 지원 확장
      how: MCP 도구·skills와 사용자 또는 서비스 계정 권한
      why: 기존 코딩 에이전트에서 데이터 작업 수행
    lead: Google Cloud는 9월 30일 Data Agent Kit을 정식 제공하며 BigQuery
      Graph·Bigtable·Managed Service for Apache Spark 지원을 추가했다. MCP 도구와 에이전트
      skills를 통해 기존 코딩 에이전트가 Google Cloud 데이터 제품을 사용하도록 하는 구성이다. 도구 묶음 자체는 무료지만
      실제 클라우드 서비스 사용에는 표준 요금이 적용된다.
    explanations:
      - heading: 사용자·서비스 계정 권한을 따르는 데이터 접근
        paragraphs:
          - 에이전트는 사용자 본인이나 impersonate한 서비스 계정으로 연결하며 행·열 보안 정책을 적용받는다. 회사는 관리자가
            IAM으로 접근을 관리하고 Model Armor로 MCP 트래픽을 검사하며 VPC Service Controls와
            Principal Access Boundary로 범위를 제한할 수 있다고 설명했다.
        source_urls:
          - https://cloud.google.com/blog/topics/developers-practitioners/data-agent-kit-is-now-ga-bring-google-data-cloud-to-any-coding-agent/
      - heading: 쿼리 실행 전 비용 점검
        paragraphs:
          - skills는 파티션 키 확인과 BigQuery 쿼리의 dry run처럼 전체 테이블을 불필요하게 스캔하지 않는 방법을
            안내한다. 에이전트가 이용한 클라우드 서비스의 사용료는 Data Agent Kit의 무료 제공과 별개다.
        source_urls:
          - https://cloud.google.com/blog/topics/developers-practitioners/data-agent-kit-is-now-ga-bring-google-data-cloud-to-any-coding-agent/
    papers: []
    relations: []
    topic_ids: []
  - title: Google Cloud, 에이전트 격리용 GKE Agent Substrate와 고속 저장 VM 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google Cloud
      when: 2026-09-30의 9월 월간 업데이트
      where: GKE·Compute Engine·Filestore
      what: 에이전트 샌드박스 실행·저장 인프라 변경 소개
      how: 커널·네트워크 격리와 VM·전용 파일 작업공간
      why: 에이전트 실행 밀도와 상태·저장 관리 지원
    lead: Google Cloud는 9월 30일 월간 인프라 업데이트에서 GKE Agent Substrate의 샌드박스 실행·격리와
      M4N·Z4D VM을 소개했다. 회사는 GKE Agent Substrate의 밀도가 일반 컨테이너 런타임보다 10배 높고 재개 시간은
      500밀리초 미만이라고 설명했다. M4N과 Z4D는 정식 제공됐으며 에이전트 격리 파일 작업공간을 연결하는 Filestore
      agent volumes는 프리뷰 접근 신청 단계다.
    explanations:
      - heading: 샌드박스 재개와 영구 작업공간
        paragraphs:
          - GKE Agent Substrate는 커널·네트워크 격리를 적용하며 회사가 제시한 suspend/resume 활성화 수는
            초당 500회를 넘는다. Filestore agent volumes는 Agent Substrate·Agent
            Sandbox와 연계해 전용 격리 파일 작업공간을 연결하는 별도 저장 구성으로 소개됐다.
        source_urls:
          - https://cloud.google.com/blog/topics/ai-infrastructure/whats-new-in-ai-infrastructure-this-month
      - heading: M4N 저장 성능과 Z4D bare metal 구성
        paragraphs:
          - M4N은 Titanium과 Hyperdisk Extreme 조합에서 최대 25,000MiB/s 호스트 저장 성능과 최대
            100만 IOPS를 제공한다고 회사는 설명했다. Z4D는 bare metal 구성의 로컬 SSD 용량과 지연을 에이전트
            microVM 실행에 활용하는 VM이다. 해당 수치는 회사가 제시한 구성과 최대치 조건을 따른다.
        source_urls:
          - https://cloud.google.com/blog/topics/ai-infrastructure/whats-new-in-ai-infrastructure-this-month
    papers: []
    relations: []
    topic_ids: []
  - title: Cisco Catalyst SD-WAN Manager API 인증 우회 취약점 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cisco PSIRT
      when: 2026-09-30 공개·2026-10-02 개정
      where: Catalyst SD-WAN Manager API
      what: 인증 우회 취약점과 수정 소프트웨어 공개
      how: 영향 판본을 확인하고 수정 버전으로 업그레이드
      why: 실제 악용이 확인된 관리자 API 접근 위험 대응
    lead: Cisco는 9월 30일 Catalyst SD-WAN Manager API 인증 우회 취약점 CVE-2026-76504를 공개했다.
      영향받는 시스템에서는 인증되지 않은 원격 공격자가 관리자 권한으로 API에 접근할 수 있으며, Cisco PSIRT는 9월 실제
      악용을 인지했다고 밝혔다. 회사는 수정된 소프트웨어로 업그레이드할 것을 권고했다.
    explanations:
      - heading: 수정 버전과 임시 부분 보호
        paragraphs:
          - 취약·수정 소프트웨어 판본은 Cisco의 수정 버전 표에서 구분한다. 10월 2일 개정판에 추가된 Live Protect
            shield는 업그레이드 준비 시간을 위한 임시 부분 보호로 소개됐으며, 취약점을 해결하는 조치는 수정 버전 업그레이드다.
        source_urls:
          - https://www.cisco.com/c/en/us/support/docs/csa/cisco-sa-sdwan-webauth-xr8beuuU.html
      - heading: 관리형 클라우드와 온프레미스 대응
        paragraphs:
          - Cisco 관리형 SD-WAN Cloud에는 수정 릴리스의 조치가 반영돼 사용자 추가 조치가 필요 없다고 회사는 설명했다.
            온프레미스 환경에서 신뢰할 수 없는 네트워크의 접근을 제한하는 것은 완화 조치이며 소프트웨어 수정을 대체하지 않는다.
        source_urls:
          - https://www.cisco.com/c/en/us/support/docs/csa/cisco-sa-sdwan-webauth-xr8beuuU.html
    papers: []
    relations: []
    topic_ids: []
  - title: AMD ROCm RCCL 입력 검증 취약점, 원격 코드 실행 가능성 보고
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AMD
      when: 2026-09-30 공개·2026-10-06 제품 표 정정
      where: ROCm RCCL 프록시 통신 경로
      what: 입력 검증 취약점과 완화 버전 안내
      how: 열거한 Instinct 제품에 권고 완화 버전 적용
      why: 메모리 노출·ASLR 우회·프로세스 내 코드 실행 가능성 대응
    lead: AMD는 9월 30일 ROCm RCCL 프록시 통신 경로의 입력 검증 취약점 CVE-2026-43598을 공개했다. 손상된 peer
      rank 또는 네트워크 인접 공격자 조건에서 메모리 노출과 ASLR 우회, RCCL 프로세스 내 원격 코드 실행으로 이어질 가능성이
      있으며 CVSS 4.0 기본 점수는 7.7이다. 회사는 열거한 Instinct 제품에 ROCm 7.14 완화 버전을 적용할 것을
      권고했다.
    explanations:
      - heading: 공격 조건과 완화 버전
        paragraphs:
          - 권고문은 공격 조건으로 손상된 peer rank 또는 네트워크 인접 공격자를 명시한다. CVSS 기본 점수는 구현 환경에
            따라 달라질 수 있으며 실제 시스템의 조건과 대조해야 한다. 제품 표의 완화 버전 ROCm 7.14는 7월 15일 공개된
            것으로 기록돼 있다.
        source_urls:
          - https://www.amd.com/en/resources/product-security/bulletin/amd-sb-6033.html
      - heading: 제품 표의 CVE 정정
        paragraphs:
          - AMD는 10월 6일 제품 표의 CVE를 정정했다. 현재 표에는 본문과 같은 CVE-2026-43598이 기재돼 있으며,
            최초 공개일인 9월 30일과 정정일을 구분한다.
        source_urls:
          - https://www.amd.com/en/resources/product-security/bulletin/amd-sb-6033.html
    papers: []
    relations: []
    topic_ids: []
  - title: Micron, 2026 회계연도 매출 1,331억 9천만 달러 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Micron Technology
      when: 2026-09-30 실적 발표; FY2026 종료일 2026-09-03
      where: 미국 Idaho의 Boise; SEC 회사 실적 공시
      what: 2026 회계연도 매출 1,331억 9천만 달러 발표
      how: 연간 및 분기 매출과 직전 회계기간을 비교하고 FY2027 1분기 매출 전망을 제시
      why: 미기재
    lead: Micron은 9월 30일, 9월 3일 종료한 2026 회계연도 매출이 1,331억 9천만 달러로 집계됐다고 발표했다. 전년도 매출은
      373억 8천만 달러였으며, 이번 4분기 매출은 542억 3천만 달러로 직전 분기 414억 6천만 달러와 비교된다. 회사는 2027
      회계연도 1분기 매출 가이던스를 615억 달러±15억 달러로 제시했다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: Hitachi·FANUC, 이바라키 공장서 Physical AI 검증 후 공동 배치 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Hitachi, FANUC
      when: 2026-09-30 전략적 제휴 발표
      where: 일본 이바라키 제조시설
      what: Physical AI 공동 검증과 고객 배치 계획
      how: HMAX Industry 등 AI와 산업용 로봇 결합
      why: 미기재
    lead: Hitachi와 FANUC는 9월 30일 일본에서 HMAX Industry 등 Hitachi의 AI 기술과 FANUC의 산업용 로봇을
      결합하는 전략적 제휴를 발표했다. 먼저 Hitachi의 이바라키 제조시설에서 여러 형태의 부품을 집고 생산 품목을 바꾸는 작업을
      검증할 계획이다. 양사는 검증에서 얻은 구현·운영 경험을 바탕으로 회계연도 2027년부터 고객사 배치를 시작하고 반도체·자동차·물류
      등으로 적용을 넓히겠다고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 공장에서 학습하고 평가할 작업
        paragraphs:
          - Hitachi Group 공장을 첫 적용 현장인 Customer Zero로 삼아 생산 현장별 규칙을 AI가 계속 학습하도록
            한다. 검증에서는 인식 정확도, 로봇 동작, 택트 타임과 품질 효과를 평가하고 Hitachi의 엣지 AI 반도체를
            FANUC 로봇과 결합하는 효과도 확인할 계획이다.
        source_urls:
          - https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260930.html
      - heading: 택트 타임의 기준
        paragraphs:
          - 발표 자료에서 택트 타임은 제품 하나를 생산·처리하거나 작업 하나를 완료하는 데 배정하는 표준 시간을 뜻한다.
        source_urls:
          - https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260930.html
  - title: IFR, 2025년 전문 서비스 로봇 출하 24% 증가 집계
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: International Federation of Robotics
      when: 2026-09-30 World Robotics 2026 서비스 로봇 자료 발표
      where: 세계 전문 서비스 로봇 시장
      what: 2025년 전문 서비스 로봇 출하 약 25만 대, 전년 대비 24% 증가 집계
      how: 운송·물류 117,500대가 전문 서비스 로봇 출하의 47% 차지
      why: 제조 현장 밖 물류·의료·청소·접객 등 로봇 수요의 기준 자료 제공
    lead: IFR은 9월 30일 2025년 전 세계 전문 서비스 로봇 출하가 약 25만 대로 전년보다 24% 증가했다고 발표했다. 운송·물류
      로봇은 117,500대로 21% 늘어 전문 서비스 로봇 출하의 47%를 차지했다. 이 집계는 전문 서비스 로봇 기준으로 산업용 로봇
      설치·가동 재고와 같은 지표가 아니다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: Ørsted, 미국 뉴멕시코 200MW 태양광 발전소 건설 착수
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Ørsted Americas Onshore
      when: 2026-09-30 착공 발표; 상업운전은 2027년 말 목표
      where: 미국 뉴멕시코주 Roosevelt County
      what: Blackwater Solar 200MW 사업의 실제 건설 시작
      how: 장기 전력구매계약 기반으로 First Solar 패널 조달
      why: 뉴멕시코 산업 전력수요 공급과 지역 재생에너지 확대
    lead: Ørsted는 9월 30일 뉴멕시코주 Roosevelt County의 200MW Blackwater Solar 건설을 시작했다고
      발표했다. 장기 전력구매계약을 맺었으며 First Solar의 미국산 패널을 사용하고, 상업운전은 2027년 말로 계획됐다.
      56,000가구 상당의 연간 공급량은 회사 추정치로 현재 발전량이 아니다.
    papers: []
    relations: []
    topic_ids: []
    analysis_summary: 이 사건은 사업 발표에서 실제 착공으로 진행된 프로젝트 단계 변화이며, 전력 수요와 패널 공급망을 함께 밝힌다.
      완공과 계통 연결 전에는 계획된 발전용량이 전력망의 실제 공급량으로 계상되지 않는다.
    next_check: 공사 진척, 계통 연결, 장기계약 인도 시점과 2027년 말 상업운전 달성 여부를 확인한다.
  - title: Deployable Energy, INL DOME서 1MWe 이동형 원자로 시험 대상으로 선정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: DOE National Reactor Innovation Center와 Deployable Energy
      when: 2026-09-30 선정 발표; 시험은 2027년 계획
      where: Idaho National Laboratory DOME 시험시설
      what: Nuclear Unity Battery의 전출력 시험 대상 선정
      how: 경수 감속·헬륨 냉각 방식의 수송형 마이크로원자로 1MWe 설계
      why: 무전력 핵임계 도달 뒤 더 높은 출력의 성능·안전·통합 시험 준비
    lead: Idaho National Laboratory는 9월 30일 DOE 산하 National Reactor Innovation
      Center가 Deployable Energy를 2027년 DOME 시험 대상으로 선정했다고 발표했다. 회사의 Nuclear
      Unity Battery는 1MWe급 경수 감속·헬륨 냉각 수송형 마이크로원자로이며, 이전에는 무전력 핵임계 달성을 보고했다. 선정과
      향후 전출력 시험 계획은 전력망 공급이나 상업 운전을 의미하지 않는다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: Candel, 전립선암 면역치료 후보의 장기 3상·초기 2상 면역 자료 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Candel Therapeutics
      when: 2026-09-30 회사 발표; 3상 추적 중앙값 58개월
      where: 전립선암 3상 PrTK03 중간위험군과 2상 PrTK05
      what: 임상결과·조직생검·혈액 면역 지표를 통합해 발표
      how: 3상 635명 중간위험군 분석과 2상 병용군13명·표준치료군6명의 혈액 탐색 분석
      why: 방사선 치료에 아글라티마진을 더했을 때의 임상·면역 반응 탐색
    lead: Candel Therapeutics는 9월 30일 후보물질 아글라티마진의 PrTK03 3상 중간위험군 분석과 PrTK05 2상 면역
      지표를 공개했다. 3상 중간위험군 635명 분석에서 방사선 치료 병용군은 대조군보다 재발 또는 전립선암 사망 위험이 낮았다고 회사는
      보고했다(HR 0.59, 95% CI 0.41–0.84, p=0.0034). 2상 혈액 비교는 병용군 13명과 표준치료군 6명의 탐색
      분석이며, 대조군과의 정식 비교는 진행 중이다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: ARPA-H, 적응형 임상시험 인프라 SURPASS 등 4개 프로그램 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미국 보건복지부 HHS와 ARPA-H
      when: 2026-09-30 신규 프로그램 발표
      where: 미국 임상시험 생태계
      what: SURPASS와 STACK·COMMONS·CINCH를 통해 임상 개발 방법·운영 지원 추진
      how: 적응형 시험 설계·실시간 분석·공통 대조군·자동화와 데이터 인프라를 연구
      why: 시험 기간·환자 부담·운영 중복을 줄일 수 있는 방법 검토
    lead: HHS 산하 ARPA-H는 9월 30일 SURPASS와 임상시험 사이트·데이터·환자 지원을 위한 STACK, COMMONS,
      CINCH를 발표했다. SURPASS는 디지털 트윈 기반 시험 설계와 누적 데이터 실시간 분석, 시험 운영 자동화를 연구한다. 새
      프로그램의 개발 계획이며 임상 기간 단축이나 치료제 승인 결과가 이미 확인된 것은 아니다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: NASA, 달 표면 5G·Wi-Fi 6 통신 개발에 Modulate Space 계약
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NASA Glenn Research Center, Modulate Space Corporation
      when: 2026-09-30 계약 발표; 수행 기간은 각각 2028-01-31과 2028-12-31까지
      where: 미국 Cleveland의 Glenn Research Center; 향후 달 표면 시연
      what: 달 표면용 5G·Wi-Fi 6 핵심 요소 개발 계약 수여
      how: 약 3,800만 달러의 고정가격 계약으로 실험실과 달 표면 시연 과제를 추진
      why: 미래 달 기지 표면 운영을 지원할 확장 가능한 표준 기반 통신 기술 개발
    lead: NASA는 9월 30일 미국 클리블랜드 Glenn Research Center를 위한 달 표면용 5G·Wi-Fi 6 통신 시스템 개발
      계약을 Modulate Space Corporation에 수여했다고 발표했다. 고정가격 계약 규모는 약 3,800만 달러다. 실험실
      시연 과제의 수행 기간은 2028년 1월 31일까지, 달 표면 통합 네트워크·비행 시연 과제는 2028년 12월 31일까지다. 두
      과제는 미래 달 기지의 표면 운영을 지원할 표준 기반 통신 기술을 개발하는 데 초점을 맞춘다.
    papers: []
    relations: []
    topic_ids: []
    explanations: []
  - title: Rocket Lab, Synspective SAR 위성 20회 추가 발사 계약
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: Rocket Lab, 일본 Synspective
      when: 2026-09-30 미국 현지 발표(한국시간 2026-10-01); 2028–2031년 발사 예정
      where: Rocket Lab Launch Complex 1에서 태양동기궤도
      what: Synspective의 신규 Electron 발사 20회 다년 계약 체결
      how: StriX 합성개구레이더 위성을 2028–2031년에 매년 발사
      why: Synspective의 지구관측 위성군 확장
    lead: Rocket Lab은 미국 현지시간 9월 30일(한국시간 10월 1일) 일본 Synspective와 신규 Electron 발사
      20회의 다년 계약을 체결했다고 발표했다. StriX 합성개구레이더(SAR) 위성 20기를 Launch Complex 1에서
      태양동기궤도로 보내며, 발사는 2028~2031년에 매년 진행할 예정이다. 회사는 이번 계약으로 Synspective를 위한
      Electron 총 발사 계약이 47회가 됐으며, 단일 계약 기준 Electron의 최대 상업 발사 계약이라고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations: []
  - title: Roche, 페네브루티닙 신약 신청 FDA 우선심사 접수
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche
      when: 2026-09-30
      where: 미국
      what: 페네브루티닙(fenebrutinib) NDA FDA 우선심사 접수
      how: 3상 FENhance 1·2 및 FENtrepid 연구 결과 기반
      why: 미기재
    lead: Roche는 9월 30일 미국 식품의약국(FDA)이 개발 중인 경구용 다발성경화증 후보약 페네브루티닙(fenebrutinib)의
      신약허가신청(NDA)을 우선심사 대상으로 접수했다고 밝혔다. 대상은 재발성 다발성경화증(RMS)과 일차 진행성
      다발성경화증(PPMS)이며, 회사는 FENhance 1·2와 FENtrepid 3상 연구 결과를 접수의 근거로 제시했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 경구용 BTK 억제제
        paragraphs:
          - 회사는 페네브루티닙을 중추신경계에 도달할 수 있는 가역적·비공유결합 BTK 억제제로 설명한다. 효소에 영구적으로 결합하는
            방식과 달리 결합한 뒤 다시 떨어지는 방식이다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-09-30
      - heading: 재발성·진행성 질환의 서로 다른 비교 시험
        paragraphs:
          - Roche가 인용한 FENhance 1·2 결과에서 페네브루티닙의 연간 환산 재발률은 테리플루노마이드 대비 96주 동안
            각각 51.1%, 58.5% 낮았다. 회사 참고문헌에 따르면 두 연구 결과는 2026년 4월 21일 미국신경학회(AAN)
            연례회의에서 발표됐다.
          - PPMS 대상 FENtrepid는 장애 진행 감소에 관한 Ocrevus 대비 비열등성이라는 1차 평가변수를 충족했다고
            회사는 밝혔다. cCDP12 발생까지 시간의 위험비는 0.88, 95% 신뢰구간은 0.75~1.03으로 보고됐다. 이
            연구의 1차 결과는 2026년 2월 7일 ACTRIMS에서 발표됐으며, 이번 9월 30일 공지는 신청 접수에 관한 발표다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-09-30
      - heading: 비교 약물별 중대한 이상사례
        paragraphs:
          - Roche에 따르면 페네브루티닙과 테리플루노마이드의 중대한 이상사례 비율은 FENhance 1에서 9% 대 9%,
            FENhance 2에서 11% 대 6%였다. FENtrepid에서는 페네브루티닙과 Ocrevus가 각각 19%였다.
          - PPMS 시험의 간효소 상승은 페네브루티닙에서 Ocrevus보다 더 자주 관찰됐다고 회사는 설명했다. 세 핵심 시험에서
            사망 보고의 불균형도 관찰됐으며, 사망 시점과 원인은 다양했다고 덧붙였다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-09-30
  - title: MIT Transit Lab, Google.org Impact Challenge 선정…PTIQ 개발에 210만 달러 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: MIT Transit Lab, Google.org
      when: 2026-09-15
      where: 미기재
      what: "Google.org Impact Challenge: AI for Government Innovation 선정 및 210만 달러 자금
        지원"
      how: Public Transit Intelligence Hub(PTIQ) 프로젝트 개발
      why: 대중교통 기관의 분산된 내부 시스템 데이터를 통합해 의사결정자의 정보 접근성 향상
    lead: MIT는 9월 30일 공개한 자료에서 Google.org가 9월 15일 MIT Transit Lab을 전 세계 지원 프로젝트 15개
      중 하나로 선정하고 210만 달러를 지원한다고 발표했다고 밝혔다. 이번에 선정된 MIT Transit Lab의 프로젝트는 Public
      Transit Intelligence Hub(PTIQ)로, 대중교통 기관의 실시간 모니터링, 운영 제어, 승객 소통 시스템을 하나의
      중앙 집중형 AI 플랫폼으로 통합하는 것을 목표로 한다. Google.org는 3년간의 프로젝트 기간 동안 자금 지원과 함께 자체
      엔지니어와 AI 제품 전문가의 무상 지원도 제공할 예정이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: PTIQ의 핵심 목표와 역할
        paragraphs:
          - Transit Lab 부소장이자 PTIQ 공동 책임 연구자인 Awad Abdelhalim은 PTIQ의 목표가 의사결정을
            자동화하는 것이 아니라, 분산된 내부 시스템의 데이터를 통합하고 간소화해 의사결정자가 최선의 정보를 확보하도록 하는
            것이라고 밝혔다.
          - MIT에 따르면 PTIQ는 예측 모델, 최적화 엔진, 대규모 언어 모델 기반의 맥락 추론을 통합하며, 최종 의사결정권은
            대중교통 종사자가 유지하게 된다.
        source_urls:
          - https://news.mit.edu/2026/mit-transit-lab-to-develop-ai-platform-public-transit-agencies-0930
      - heading: 프로젝트 주요 인력
        paragraphs:
          - 공동 책임 연구자는 MIT 도시·교통 분야 교수이자 MIT Mobility Initiative(MMI) 창립자 겸 디렉터인
            Jinhua Zhao이며, Jim Aloisi MIT 강사가 프로그램 매니저를 맡는다.
        source_urls:
          - https://news.mit.edu/2026/mit-transit-lab-to-develop-ai-platform-public-transit-agencies-0930
  - title: NLR, 전력망 복구 시스템 REORG 현장 시험 완료…발전기 가동·SCADA실 우선 공급
    kind: 사건 뉴스
    region: 해외
    facts:
      who: National Laboratory of the Rockies(NLR), Holy Cross Energy
      when: 2026-09-30
      where: Holy Cross Energy 본사
      what: REORG 솔루션의 현장 시험 완료
      how: 본사 캠퍼스 전력을 메인 라인에서 분리하고 디젤 발전기를 가동해 SCADA실에 우선 공급
      why: 2018년 Lake Christine 산불로 단일 송전선이 위협받자 전력망 복구 및 대응을 위한 운영 솔루션 개발 필요
    lead: National Laboratory of the Rockies(NLR)는 2026년 9월 30일, 적응형 전력망 복구 및 대응을 위한
      운영 솔루션 REORG가 Holy Cross Energy 본사에서 현장 시험을 완료했다고 밝혔다. Holy Cross Energy는
      2018년 Lake Christine 산불이 단일 송전선을 위협한 이후 NLR과 함께 REORG 개발을 추진했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: REORG의 작동 방식
        paragraphs:
          - REORG는 중앙 제어가 마비될 경우 하위 레벨 컨트롤러가 운영을 결정하도록 전력망 구조를 전환한다. 이를 통해 자체적인
            '셀'이 마이크로 그리드로 전환되어, 그리드가 재조직될 때까지 현지 발전 및 저장 장치를 활용한다.
          - NLR에 따르면 독립된 전력망 구역에서는 그리드 포밍 인버터가 전력의 안정성을 맡고 배터리가 전원을 제공한다.
        source_urls:
          - https://www.nlr.gov/news/detail/program/2026/as-local-power-grows-utilities-reorganize-for-resilience
      - heading: 개발 협력 및 현장 시험 결과
        paragraphs:
          - REORG는 University of Connecticut의 그리드 전압 제어 알고리즘 지원과 Minsait ACS의 자체
            제품 라인용 REORG 제어 설정을 통해 개발되었다.
          - NLR은 Holy Cross Energy 엔지니어와 함께 본사 캠퍼스 전력을 메인 라인에서 의도적으로 분리하는 라이브
            실험을 수행했으며, REORG가 디젤 발전기를 가동하고 SCADA실에 전력을 우선 공급했다.
          - NLR은 Holy Cross Energy 본사 현장 실험에서 REORG가 계획된 결과에 따라 전력을 복구했다고 보고했다.
        source_urls:
          - https://www.nlr.gov/news/detail/program/2026/as-local-power-grows-utilities-reorganize-for-resilience
  - title: SK하이닉스, AI 데이터센터 전력·냉각 설계 해설
    kind: 사건 뉴스
    region: 해외
    facts:
      who: SK하이닉스
      when: 2026-09-30
      where: 미기재
      what: AI 데이터센터 전력·냉각 설계 해설 공개
      how: 열 제거와 시설 외부 방출, 고밀도 시스템의 냉각 방식 설명
      why: 미기재
    lead: SK하이닉스는 9월 30일 공개한 AI 인프라 해설에서 데이터센터 냉각을 서버·랙의 열을 제거하는 단계와 회수한 열을 시설 밖으로
      전달하는 단계로 설명했다. 고밀도 AI 시스템에서는 열 발생원에 더 가까운 곳에서 열을 제거하는 액체 냉각과 near-junction
      cooling 방식이 활용된다고 설명했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 냉각과 시스템 효율
        paragraphs:
          - 해설은 냉각이 부족하면 프로세서가 작동 속도를 낮추고, 성능뿐 아니라 장비 신뢰성·수명·유지보수 비용에도 영향을 줄 수
            있다고 설명한다.
          - 전력당 성능은 같은 전력으로 더 많은 추론 요청을 처리하거나, 같은 성능을 더 적은 전력으로 제공하는 관점으로 소개했다.
        source_urls:
          - https://news.skhynix.com/en/ai-infrastructure-insight-ep3/
      - heading: 인용한 전력 전망과 랙 밀도 조사
        paragraphs:
          - SK하이닉스 글이 인용한 IEA 추정에서 전 세계 데이터센터의 2024년 전력 소비는 약 415TWh로 전체 전력 소비의
            약 1.5%였다. IEA의 2030년 전망은 약 945TWh이며, AI와 밀접한 가속 서버의 전력 소비는
            2024~2030년 연평균 30% 증가할 것으로 예상됐다.
          - 글이 인용한 Uptime Institute의 2025년 글로벌 데이터센터 조사에서는 응답자의 82%가 시설 내 최고 밀도
            랙을 30kW 미만이라고 답했으며, 일부 캐비닛은 100kW를 초과하는 것으로 보고됐다.
        source_urls:
          - https://news.skhynix.com/en/ai-infrastructure-insight-ep3/
  - title: 국립보건연구원, 한국인 확장성 심근병증 유전자 변이와 임상 경과 분석
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 국립보건연구원, 서울아산병원, 충북의대
      when: 2026-09-30
      where: 미기재
      what: 한국인 특발성 확장성 심근병증 환자 202명 유전정보 및 임상 경과 분석
      how: 국내 심부전 및 심장이식 등록자료 활용
      why: 미기재
    lead: 국립보건연구원이 9월 30일 웹사이트에 게시한 보도자료에 따르면, 국립보건연구원·서울아산병원·충북의대 연구진은 한국인 특발성 확장성
      심근병증 환자 202명의 유전정보와 임상 경과를 분석했다. 전체 환자 중 64명(31.7%)에서 질환 발생에 영향을 줄 수 있는
      유전자 변이가 확인됐으며, LMNA 변이는 심장이식·사망 및 부정맥 위험과, TNNT2 변이는 상대적으로 많은 심장기능 회복 사례와
      연관됐다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 연구 대상 및 데이터 출처
        paragraphs:
          - 연구 대상 202명은 심장이식을 받은 환자 56명과 외래 진료 환자 146명으로 구성되었다.
          - 국립보건연구원은 이번 연구에 한국인 급성심부전 등록연구(KorAHF), 확장성 심근병증 등록연구(KDCM), 장기이식
            코호트(KOTRY)의 환자 자료를 활용했다고 설명했다.
        source_urls:
          - https://nih.go.kr/ko/bbs/B0000130/view.do?nttId=13322&menuNo=300829&pageIndex=1
      - heading: 분석 결과 및 논문 게재
        paragraphs:
          - 국립보건연구원은 성별과 진단 연령 등을 고려한 뒤에도 LMNA 및 TNNT2 유전자 변이에 따른 임상 경과 차이가
            유지됐다고 설명했다.
          - 국립보건연구원은 연구 결과가 The Journal of Heart and Lung Transplantation에 게재됐다고
            소개했다.
        source_urls:
          - https://nih.go.kr/ko/bbs/B0000130/view.do?nttId=13322&menuNo=300829&pageIndex=1
article_reviews:
  - title: OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약
    event_id: 8fac3ce4d39c6ea9
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: DigitalOcean, 에이전트 실행·추론·저장을 묶은 Agent Droplets 공개
    event_id: a82ab8c2c2f14be9
    review_status: verified
    published_at: 2026-10-01
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Google Cloud Data Agent Kit 정식 제공…Bigtable·Spark 지원 추가
    event_id: 294333117691a99b
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Google Cloud, 에이전트 격리용 GKE Agent Substrate와 고속 저장 VM 공개
    event_id: 72249bd53d8a5849
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Cisco Catalyst SD-WAN Manager API 인증 우회 취약점 공개
    event_id: 0b883a59e5850ce3
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: AMD ROCm RCCL 입력 검증 취약점, 원격 코드 실행 가능성 보고
    event_id: 2000861d5f1c75c8
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Micron, 2026 회계연도 매출 1,331억 9천만 달러 발표
    event_id: 20af87012182fbd4
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Hitachi·FANUC, 이바라키 공장서 Physical AI 검증 후 공동 배치 계획
    event_id: 28543c78d1a0a3ec
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-09
  - title: IFR, 2025년 전문 서비스 로봇 출하 24% 증가 집계
    event_id: 1e78f5fd4a5acdc8
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Ørsted, 미국 뉴멕시코 200MW 태양광 발전소 건설 착수
    event_id: 926dd2776aef7b1b
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-01
  - title: Deployable Energy, INL DOME서 1MWe 이동형 원자로 시험 대상으로 선정
    event_id: f89187a6288f099b
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: Candel, 전립선암 면역치료 후보의 장기 3상·초기 2상 면역 자료 공개
    event_id: f795c88cad060d16
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: ARPA-H, 적응형 임상시험 인프라 SURPASS 등 4개 프로그램 발표
    event_id: 3cfdb073a82debc3
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
    concept_ids: []
  - title: NASA, 달 표면 5G·Wi-Fi 6 통신 개발에 Modulate Space 계약
    event_id: 086bdbb3792ca8d9
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
  - title: Rocket Lab, Synspective SAR 위성 20회 추가 발사 계약
    event_id: a930c8de646354b3
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-10
  - title: Roche, 페네브루티닙 신약 신청 FDA 우선심사 접수
    event_id: e3728daf1bd4be8b
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-06
  - title: MIT Transit Lab, Google.org Impact Challenge 선정…PTIQ 개발에 210만 달러 지원
    event_id: 17f635e65de87807
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-07
  - title: NLR, 전력망 복구 시스템 REORG 현장 시험 완료…발전기 가동·SCADA실 우선 공급
    event_id: ce1e21d4581adaee
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-07
  - title: SK하이닉스, AI 데이터센터 전력·냉각 설계 해설
    event_id: 677a5b5535577a74
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-08
  - title: 국립보건연구원, 한국인 확장성 심근병증 유전자 변이와 임상 경과 분석
    event_id: 0921db2a3ce05bb8
    review_status: verified
    concept_ids: []
    published_at: 2026-09-30
    reviewed_at: 2026-10-08
---

# 이번 호 표지

OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약

# 차례

- OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약
- Google Cloud, 에이전트 격리용 GKE Agent Substrate와 고속 저장 VM 공개
- Micron, 2026 회계연도 매출 1,331억 9천만 달러 발표
- Hitachi·FANUC, 이바라키 공장서 Physical AI 검증 후 공동 배치 계획
- NASA, 달 표면 5G·Wi-Fi 6 통신 개발에 Modulate Space 계약

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI·Synopsys, 반도체 설계 특화 모델 공동 개발 계약

**분야:** 반도체·컴퓨팅
**테마:** 표준·생태계
**보조 테마:** 연구·기술
**세부 태그:** 기술 제휴, 라이선스
**기업·기관:** OpenAI, Synopsys

OpenAI와 Synopsys는 2026년 9월 30일 반도체 설계 특화 모델 GPT-Synopsys를 공동 개발하고 고객에게 함께 제공하는 다년 계약을 발표했다. OpenAI는 Synopsys의 전자설계자동화(EDA) 도구를 사용할 수 있도록 라이선스를 받고, 양사는 연구개발·시장 출시와 수익 배분에 협력한다. 초기 기술 협의는 시작됐지만 제품 출시일과 실제 설계 성과는 발표되지 않았다. [S1]



## DigitalOcean, 에이전트 실행·추론·저장을 묶은 Agent Droplets 공개

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 사업·고객
**세부 태그:** 신제품, 가격 변경
**기업·기관:** DigitalOcean

DigitalOcean은 10월 1일 Managed Agents 공개 프리뷰에 Agent Droplets를 도입했다. 월간 Pro는 50달러, Team은 200달러이며 에이전트 사용료를 각각 15%와 20% 할인한다. 기존 에이전트 실행 도구를 전용 microVM에서 이용하고 유휴 상태에는 자동으로 일시정지하는 방식이다. [S2]

### 실행 상태와 잔액 소진 후 재개

회사 설명에 따르면 microVM은 일시정지 상태에서 약 300밀리초에 재개한다. AI 잔액이 모두 소진되면 세션은 다음 안전한 지점에서 정지하며 스냅샷에 작업 상태를 보존한다. 자금을 추가하면 그 상태에서 작업을 이어 갈 수 있다. [S2]

### AI 선불 잔액과 일반 클라우드 요금

Agent Droplet 이용 한도를 소진하면 에이전트가 Inference and Agents Balance를 사용한다. 이 선불 잔액은 AI 제품에만 적용되며 일반 Droplets·Spaces·Managed Databases 비용은 기존 결제 주기에 따로 청구된다. 월간 요금과 할인율만으로 전체 클라우드 비용이 고정된다고 볼 수 없다. [S2]

## Google Cloud Data Agent Kit 정식 제공…Bigtable·Spark 지원 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 표준·생태계
**세부 태그:** 신제품, 기능 추가
**기업·기관:** Google Cloud

Google Cloud는 9월 30일 Data Agent Kit을 정식 제공하며 BigQuery Graph·Bigtable·Managed Service for Apache Spark 지원을 추가했다. MCP 도구와 에이전트 skills를 통해 기존 코딩 에이전트가 Google Cloud 데이터 제품을 사용하도록 하는 구성이다. 도구 묶음 자체는 무료지만 실제 클라우드 서비스 사용에는 표준 요금이 적용된다. [S3]

### 사용자·서비스 계정 권한을 따르는 데이터 접근

에이전트는 사용자 본인이나 impersonate한 서비스 계정으로 연결하며 행·열 보안 정책을 적용받는다. 회사는 관리자가 IAM으로 접근을 관리하고 Model Armor로 MCP 트래픽을 검사하며 VPC Service Controls와 Principal Access Boundary로 범위를 제한할 수 있다고 설명했다. [S3]

### 쿼리 실행 전 비용 점검

skills는 파티션 키 확인과 BigQuery 쿼리의 dry run처럼 전체 테이블을 불필요하게 스캔하지 않는 방법을 안내한다. 에이전트가 이용한 클라우드 서비스의 사용료는 Data Agent Kit의 무료 제공과 별개다. [S3]

## Google Cloud, 에이전트 격리용 GKE Agent Substrate와 고속 저장 VM 공개

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 연구·기술
**세부 태그:** 기능 추가, 성능 개선
**기업·기관:** Google Cloud

Google Cloud는 9월 30일 월간 인프라 업데이트에서 GKE Agent Substrate의 샌드박스 실행·격리와 M4N·Z4D VM을 소개했다. 회사는 GKE Agent Substrate의 밀도가 일반 컨테이너 런타임보다 10배 높고 재개 시간은 500밀리초 미만이라고 설명했다. M4N과 Z4D는 정식 제공됐으며 에이전트 격리 파일 작업공간을 연결하는 Filestore agent volumes는 프리뷰 접근 신청 단계다. [S4]

### 샌드박스 재개와 영구 작업공간

GKE Agent Substrate는 커널·네트워크 격리를 적용하며 회사가 제시한 suspend/resume 활성화 수는 초당 500회를 넘는다. Filestore agent volumes는 Agent Substrate·Agent Sandbox와 연계해 전용 격리 파일 작업공간을 연결하는 별도 저장 구성으로 소개됐다. [S4]

### M4N 저장 성능과 Z4D bare metal 구성

M4N은 Titanium과 Hyperdisk Extreme 조합에서 최대 25,000MiB/s 호스트 저장 성능과 최대 100만 IOPS를 제공한다고 회사는 설명했다. Z4D는 bare metal 구성의 로컬 SSD 용량과 지연을 에이전트 microVM 실행에 활용하는 VM이다. 해당 수치는 회사가 제시한 구성과 최대치 조건을 따른다. [S4]

## Cisco Catalyst SD-WAN Manager API 인증 우회 취약점 공개

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 제품·서비스
**세부 태그:** 보안 사고
**기업·기관:** Cisco

Cisco는 9월 30일 Catalyst SD-WAN Manager API 인증 우회 취약점 CVE-2026-76504를 공개했다. 영향받는 시스템에서는 인증되지 않은 원격 공격자가 관리자 권한으로 API에 접근할 수 있으며, Cisco PSIRT는 9월 실제 악용을 인지했다고 밝혔다. 회사는 수정된 소프트웨어로 업그레이드할 것을 권고했다. [S5]

### 수정 버전과 임시 부분 보호

취약·수정 소프트웨어 판본은 Cisco의 수정 버전 표에서 구분한다. 10월 2일 개정판에 추가된 Live Protect shield는 업그레이드 준비 시간을 위한 임시 부분 보호로 소개됐으며, 취약점을 해결하는 조치는 수정 버전 업그레이드다. [S5]

### 관리형 클라우드와 온프레미스 대응

Cisco 관리형 SD-WAN Cloud에는 수정 릴리스의 조치가 반영돼 사용자 추가 조치가 필요 없다고 회사는 설명했다. 온프레미스 환경에서 신뢰할 수 없는 네트워크의 접근을 제한하는 것은 완화 조치이며 소프트웨어 수정을 대체하지 않는다. [S5]

## AMD ROCm RCCL 입력 검증 취약점, 원격 코드 실행 가능성 보고

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 제품·서비스
**세부 태그:** 보안 사고
**기업·기관:** AMD

AMD는 9월 30일 ROCm RCCL 프록시 통신 경로의 입력 검증 취약점 CVE-2026-43598을 공개했다. 손상된 peer rank 또는 네트워크 인접 공격자 조건에서 메모리 노출과 ASLR 우회, RCCL 프로세스 내 원격 코드 실행으로 이어질 가능성이 있으며 CVSS 4.0 기본 점수는 7.7이다. 회사는 열거한 Instinct 제품에 ROCm 7.14 완화 버전을 적용할 것을 권고했다. [S6]

### 공격 조건과 완화 버전

권고문은 공격 조건으로 손상된 peer rank 또는 네트워크 인접 공격자를 명시한다. CVSS 기본 점수는 구현 환경에 따라 달라질 수 있으며 실제 시스템의 조건과 대조해야 한다. 제품 표의 완화 버전 ROCm 7.14는 7월 15일 공개된 것으로 기록돼 있다. [S6]

### 제품 표의 CVE 정정

AMD는 10월 6일 제품 표의 CVE를 정정했다. 현재 표에는 본문과 같은 CVE-2026-43598이 기재돼 있으며, 최초 공개일인 9월 30일과 정정일을 구분한다. [S6]

## Micron, 2026 회계연도 매출 1,331억 9천만 달러 발표

**분야:** 반도체·컴퓨팅
**테마:** 실적·재무
**보조 테마:** 생산·공급망
**세부 태그:** 매출, 실적 전망
**기업·기관:** Micron Technology

Micron은 9월 30일, 9월 3일 종료한 2026 회계연도 매출이 1,331억 9천만 달러로 집계됐다고 발표했다. 전년도 매출은 373억 8천만 달러였으며, 이번 4분기 매출은 542억 3천만 달러로 직전 분기 414억 6천만 달러와 비교된다. 회사는 2027 회계연도 1분기 매출 가이던스를 615억 달러±15억 달러로 제시했다. [S7]



## Hitachi·FANUC, 이바라키 공장서 Physical AI 검증 후 공동 배치 계획

**분야:** 로봇·제조
**테마:** 표준·생태계
**보조 테마:** 연구·기술
**세부 태그:** 기술 제휴, 실증·재현
**기업·기관:** Hitachi, FANUC

Hitachi와 FANUC는 9월 30일 일본에서 HMAX Industry 등 Hitachi의 AI 기술과 FANUC의 산업용 로봇을 결합하는 전략적 제휴를 발표했다. 먼저 Hitachi의 이바라키 제조시설에서 여러 형태의 부품을 집고 생산 품목을 바꾸는 작업을 검증할 계획이다. 양사는 검증에서 얻은 구현·운영 경험을 바탕으로 회계연도 2027년부터 고객사 배치를 시작하고 반도체·자동차·물류 등으로 적용을 넓히겠다고 밝혔다. [S8]

### 공장에서 학습하고 평가할 작업

Hitachi Group 공장을 첫 적용 현장인 Customer Zero로 삼아 생산 현장별 규칙을 AI가 계속 학습하도록 한다. 검증에서는 인식 정확도, 로봇 동작, 택트 타임과 품질 효과를 평가하고 Hitachi의 엣지 AI 반도체를 FANUC 로봇과 결합하는 효과도 확인할 계획이다. [S8]

### 택트 타임의 기준

발표 자료에서 택트 타임은 제품 하나를 생산·처리하거나 작업 하나를 완료하는 데 배정하는 표준 시간을 뜻한다. [S8]

## IFR, 2025년 전문 서비스 로봇 출하 24% 증가 집계

**분야:** 로봇·제조
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 시장평가
**기업·기관:** International Federation of Robotics

IFR은 9월 30일 2025년 전 세계 전문 서비스 로봇 출하가 약 25만 대로 전년보다 24% 증가했다고 발표했다. 운송·물류 로봇은 117,500대로 21% 늘어 전문 서비스 로봇 출하의 47%를 차지했다. 이 집계는 전문 서비스 로봇 기준으로 산업용 로봇 설치·가동 재고와 같은 지표가 아니다. [S9]



## Ørsted, 미국 뉴멕시코 200MW 태양광 발전소 건설 착수

**분야:** 에너지·기후기술
**테마:** 생산·공급망
**보조 테마:** 사업·고객
**세부 태그:** 설비 투자, 수주·계약
**기업·기관:** Ørsted, First Solar

Ørsted는 9월 30일 뉴멕시코주 Roosevelt County의 200MW Blackwater Solar 건설을 시작했다고 발표했다. 장기 전력구매계약을 맺었으며 First Solar의 미국산 패널을 사용하고, 상업운전은 2027년 말로 계획됐다. 56,000가구 상당의 연간 공급량은 회사 추정치로 현재 발전량이 아니다. [S10]

## Deployable Energy, INL DOME서 1MWe 이동형 원자로 시험 대상으로 선정

**분야:** 에너지·기후기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Idaho National Laboratory, DOE National Reactor Innovation Center, Deployable Energy

Idaho National Laboratory는 9월 30일 DOE 산하 National Reactor Innovation Center가 Deployable Energy를 2027년 DOME 시험 대상으로 선정했다고 발표했다. 회사의 Nuclear Unity Battery는 1MWe급 경수 감속·헬륨 냉각 수송형 마이크로원자로이며, 이전에는 무전력 핵임계 달성을 보고했다. 선정과 향후 전출력 시험 계획은 전력망 공급이나 상업 운전을 의미하지 않는다. [S11]



## Candel, 전립선암 면역치료 후보의 장기 3상·초기 2상 면역 자료 공개

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Candel Therapeutics

Candel Therapeutics는 9월 30일 후보물질 아글라티마진의 PrTK03 3상 중간위험군 분석과 PrTK05 2상 면역 지표를 공개했다. 3상 중간위험군 635명 분석에서 방사선 치료 병용군은 대조군보다 재발 또는 전립선암 사망 위험이 낮았다고 회사는 보고했다(HR 0.59, 95% CI 0.41–0.84, p=0.0034). 2상 혈액 비교는 병용군 13명과 표준치료군 6명의 탐색 분석이며, 대조군과의 정식 비교는 진행 중이다. [S12]



## ARPA-H, 적응형 임상시험 인프라 SURPASS 등 4개 프로그램 발표

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** HHS, ARPA-H

HHS 산하 ARPA-H는 9월 30일 SURPASS와 임상시험 사이트·데이터·환자 지원을 위한 STACK, COMMONS, CINCH를 발표했다. SURPASS는 디지털 트윈 기반 시험 설계와 누적 데이터 실시간 분석, 시험 운영 자동화를 연구한다. 새 프로그램의 개발 계획이며 임상 기간 단축이나 치료제 승인 결과가 이미 확인된 것은 아니다. [S13]



## NASA, 달 표면 5G·Wi-Fi 6 통신 개발에 Modulate Space 계약

**분야:** 우주·기초과학
**테마:** 사업·고객
**보조 테마:** 연구·기술
**세부 태그:** 수주·계약, 새로운 방법
**기업·기관:** NASA, Modulate Space Corporation

NASA는 9월 30일 미국 클리블랜드 Glenn Research Center를 위한 달 표면용 5G·Wi-Fi 6 통신 시스템 개발 계약을 Modulate Space Corporation에 수여했다고 발표했다. 고정가격 계약 규모는 약 3,800만 달러다. 실험실 시연 과제의 수행 기간은 2028년 1월 31일까지, 달 표면 통합 네트워크·비행 시연 과제는 2028년 12월 31일까지다. 두 과제는 미래 달 기지의 표면 운영을 지원할 표준 기반 통신 기술을 개발하는 데 초점을 맞춘다. [S14]

## Rocket Lab, Synspective SAR 위성 20회 추가 발사 계약

**분야:** 우주·기초과학
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 수주·계약
**기업·기관:** Rocket Lab, Synspective

Rocket Lab은 미국 현지시간 9월 30일(한국시간 10월 1일) 일본 Synspective와 신규 Electron 발사 20회의 다년 계약을 체결했다고 발표했다. StriX 합성개구레이더(SAR) 위성 20기를 Launch Complex 1에서 태양동기궤도로 보내며, 발사는 2028\~2031년에 매년 진행할 예정이다. 회사는 이번 계약으로 Synspective를 위한 Electron 총 발사 계약이 47회가 됐으며, 단일 계약 기준 Electron의 최대 상업 발사 계약이라고 밝혔다. [S15]

## Roche, 페네브루티닙 신약 신청 FDA 우선심사 접수

**분야:** 바이오·의료기술
**테마:** 정책·규제
**보조 테마:** 없음
**세부 태그:** 인허가
**기업·기관:** Roche

Roche는 9월 30일 미국 식품의약국(FDA)이 개발 중인 경구용 다발성경화증 후보약 페네브루티닙(fenebrutinib)의 신약허가신청(NDA)을 우선심사 대상으로 접수했다고 밝혔다. 대상은 재발성 다발성경화증(RMS)과 일차 진행성 다발성경화증(PPMS)이며, 회사는 FENhance 1·2와 FENtrepid 3상 연구 결과를 접수의 근거로 제시했다. [S16]

### 경구용 BTK 억제제

회사는 페네브루티닙을 중추신경계에 도달할 수 있는 가역적·비공유결합 BTK 억제제로 설명한다. 효소에 영구적으로 결합하는 방식과 달리 결합한 뒤 다시 떨어지는 방식이다. [S16]

### 재발성·진행성 질환의 서로 다른 비교 시험

Roche가 인용한 FENhance 1·2 결과에서 페네브루티닙의 연간 환산 재발률은 테리플루노마이드 대비 96주 동안 각각 51.1%, 58.5% 낮았다. 회사 참고문헌에 따르면 두 연구 결과는 2026년 4월 21일 미국신경학회(AAN) 연례회의에서 발표됐다.

PPMS 대상 FENtrepid는 장애 진행 감소에 관한 Ocrevus 대비 비열등성이라는 1차 평가변수를 충족했다고 회사는 밝혔다. cCDP12 발생까지 시간의 위험비는 0.88, 95% 신뢰구간은 0.75\~1.03으로 보고됐다. 이 연구의 1차 결과는 2026년 2월 7일 ACTRIMS에서 발표됐으며, 이번 9월 30일 공지는 신청 접수에 관한 발표다. [S16]

### 비교 약물별 중대한 이상사례

Roche에 따르면 페네브루티닙과 테리플루노마이드의 중대한 이상사례 비율은 FENhance 1에서 9% 대 9%, FENhance 2에서 11% 대 6%였다. FENtrepid에서는 페네브루티닙과 Ocrevus가 각각 19%였다.

PPMS 시험의 간효소 상승은 페네브루티닙에서 Ocrevus보다 더 자주 관찰됐다고 회사는 설명했다. 세 핵심 시험에서 사망 보고의 불균형도 관찰됐으며, 사망 시점과 원인은 다양했다고 덧붙였다. [S16]

## MIT Transit Lab, Google.org Impact Challenge 선정…PTIQ 개발에 210만 달러 지원

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** MIT Transit Lab, Google.org

MIT는 9월 30일 공개한 자료에서 Google.org가 9월 15일 MIT Transit Lab을 전 세계 지원 프로젝트 15개 중 하나로 선정하고 210만 달러를 지원한다고 발표했다고 밝혔다. 이번에 선정된 MIT Transit Lab의 프로젝트는 Public Transit Intelligence Hub(PTIQ)로, 대중교통 기관의 실시간 모니터링, 운영 제어, 승객 소통 시스템을 하나의 중앙 집중형 AI 플랫폼으로 통합하는 것을 목표로 한다. Google.org는 3년간의 프로젝트 기간 동안 자금 지원과 함께 자체 엔지니어와 AI 제품 전문가의 무상 지원도 제공할 예정이다. [S17]

### PTIQ의 핵심 목표와 역할

Transit Lab 부소장이자 PTIQ 공동 책임 연구자인 Awad Abdelhalim은 PTIQ의 목표가 의사결정을 자동화하는 것이 아니라, 분산된 내부 시스템의 데이터를 통합하고 간소화해 의사결정자가 최선의 정보를 확보하도록 하는 것이라고 밝혔다.

MIT에 따르면 PTIQ는 예측 모델, 최적화 엔진, 대규모 언어 모델 기반의 맥락 추론을 통합하며, 최종 의사결정권은 대중교통 종사자가 유지하게 된다. [S17]

### 프로젝트 주요 인력

공동 책임 연구자는 MIT 도시·교통 분야 교수이자 MIT Mobility Initiative(MMI) 창립자 겸 디렉터인 Jinhua Zhao이며, Jim Aloisi MIT 강사가 프로그램 매니저를 맡는다. [S17]

## NLR, 전력망 복구 시스템 REORG 현장 시험 완료…발전기 가동·SCADA실 우선 공급

**분야:** 에너지·기후기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** National Laboratory of the Rockies (NLR), Holy Cross Energy, University of Connecticut, Minsait ACS

National Laboratory of the Rockies(NLR)는 2026년 9월 30일, 적응형 전력망 복구 및 대응을 위한 운영 솔루션 REORG가 Holy Cross Energy 본사에서 현장 시험을 완료했다고 밝혔다. Holy Cross Energy는 2018년 Lake Christine 산불이 단일 송전선을 위협한 이후 NLR과 함께 REORG 개발을 추진했다. [S18]

### REORG의 작동 방식

REORG는 중앙 제어가 마비될 경우 하위 레벨 컨트롤러가 운영을 결정하도록 전력망 구조를 전환한다. 이를 통해 자체적인 '셀'이 마이크로 그리드로 전환되어, 그리드가 재조직될 때까지 현지 발전 및 저장 장치를 활용한다.

NLR에 따르면 독립된 전력망 구역에서는 그리드 포밍 인버터가 전력의 안정성을 맡고 배터리가 전원을 제공한다. [S18]

### 개발 협력 및 현장 시험 결과

REORG는 University of Connecticut의 그리드 전압 제어 알고리즘 지원과 Minsait ACS의 자체 제품 라인용 REORG 제어 설정을 통해 개발되었다.

NLR은 Holy Cross Energy 엔지니어와 함께 본사 캠퍼스 전력을 메인 라인에서 의도적으로 분리하는 라이브 실험을 수행했으며, REORG가 디젤 발전기를 가동하고 SCADA실에 전력을 우선 공급했다.

NLR은 Holy Cross Energy 본사 현장 실험에서 REORG가 계획된 결과에 따라 전력을 복구했다고 보고했다. [S18]

## SK하이닉스, AI 데이터센터 전력·냉각 설계 해설

**분야:** 에너지·기후기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** 없음

SK하이닉스는 9월 30일 공개한 AI 인프라 해설에서 데이터센터 냉각을 서버·랙의 열을 제거하는 단계와 회수한 열을 시설 밖으로 전달하는 단계로 설명했다. 고밀도 AI 시스템에서는 열 발생원에 더 가까운 곳에서 열을 제거하는 액체 냉각과 near-junction cooling 방식이 활용된다고 설명했다. [S19]

### 냉각과 시스템 효율

해설은 냉각이 부족하면 프로세서가 작동 속도를 낮추고, 성능뿐 아니라 장비 신뢰성·수명·유지보수 비용에도 영향을 줄 수 있다고 설명한다.

전력당 성능은 같은 전력으로 더 많은 추론 요청을 처리하거나, 같은 성능을 더 적은 전력으로 제공하는 관점으로 소개했다. [S19]

### 인용한 전력 전망과 랙 밀도 조사

SK하이닉스 글이 인용한 IEA 추정에서 전 세계 데이터센터의 2024년 전력 소비는 약 415TWh로 전체 전력 소비의 약 1.5%였다. IEA의 2030년 전망은 약 945TWh이며, AI와 밀접한 가속 서버의 전력 소비는 2024\~2030년 연평균 30% 증가할 것으로 예상됐다.

글이 인용한 Uptime Institute의 2025년 글로벌 데이터센터 조사에서는 응답자의 82%가 시설 내 최고 밀도 랙을 30kW 미만이라고 답했으며, 일부 캐비닛은 100kW를 초과하는 것으로 보고됐다. [S19]

## 국립보건연구원, 한국인 확장성 심근병증 유전자 변이와 임상 경과 분석

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** 국립보건연구원, 서울아산병원, 충북의대

국립보건연구원이 9월 30일 웹사이트에 게시한 보도자료에 따르면, 국립보건연구원·서울아산병원·충북의대 연구진은 한국인 특발성 확장성 심근병증 환자 202명의 유전정보와 임상 경과를 분석했다. 전체 환자 중 64명(31.7%)에서 질환 발생에 영향을 줄 수 있는 유전자 변이가 확인됐으며, LMNA 변이는 심장이식·사망 및 부정맥 위험과, TNNT2 변이는 상대적으로 많은 심장기능 회복 사례와 연관됐다. [S20]

### 연구 대상 및 데이터 출처

연구 대상 202명은 심장이식을 받은 환자 56명과 외래 진료 환자 146명으로 구성되었다.

국립보건연구원은 이번 연구에 한국인 급성심부전 등록연구(KorAHF), 확장성 심근병증 등록연구(KDCM), 장기이식 코호트(KOTRY)의 환자 자료를 활용했다고 설명했다. [S20]

### 분석 결과 및 논문 게재

국립보건연구원은 성별과 진단 연령 등을 고려한 뒤에도 LMNA 및 TNNT2 유전자 변이에 따른 임상 경과 차이가 유지됐다고 설명했다.

국립보건연구원은 연구 결과가 The Journal of Heart and Lung Transplantation에 게재됐다고 소개했다. [S20]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

> [!summary] 확인된 사실
> Synopsys·OpenAI의 칩 설계 모델, Google Cloud의 데이터 접근·에이전트 격리 도구, DigitalOcean의 실행·추론 묶음처럼 기업이 에이전트 제품을 도입할 수 있도록 데이터 권한·실행 격리·사용료를 하나의 운영 경로로 구성하는 발표가 이어졌다. [S1][S2][S3][S4]

> [!note] 분석
> 발표들은 모델 성능 자체보다 에이전트가 어떤 데이터와 도구에 접근하고, 생성 코드를 어디서 실행하며, 비용을 어떻게 통제하는지를 제품화하고 있다. 다만 대부분 회사 발표 단계이거나 공개 프리뷰이고, 실제 고객 환경에서의 안전성·비용·성과 비교는 아직 공개되지 않았다.

# 오늘의 적용

에이전트 실행이나 클라우드 데이터 접근을 검토하는 IT 운영팀은 도입 전에 권한 범위, 실행 격리, 변경 승인, 사용량 초과 과금을 각각 확인한다. 공개 프리뷰의 성능 수치를 운영 환경의 보장치로 간주하지 않는다.

# 개념 색인

없음

# Source List

- [S1] https://news.synopsys.com/2026-09-30-OpenAI-and-Synopsys-Announce-GPT-Synopsys-Frontier-Intelligence-to-Revolutionize-Chip-Design
- [S2] https://www.digitalocean.com/blog/introducing-agent-droplets
- [S3] https://cloud.google.com/blog/topics/developers-practitioners/data-agent-kit-is-now-ga-bring-google-data-cloud-to-any-coding-agent/
- [S4] https://cloud.google.com/blog/topics/ai-infrastructure/whats-new-in-ai-infrastructure-this-month
- [S5] https://www.cisco.com/c/en/us/support/docs/csa/cisco-sa-sdwan-webauth-xr8beuuU.html
- [S6] https://www.amd.com/en/resources/product-security/bulletin/amd-sb-6033.html
- [S7] https://www.sec.gov/Archives/edgar/data/723125/000072312526000018/a2026q4ex991-pressrelease.htm
- [S8] https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260930.html
- [S9] https://ifr.org/ifr-press-releases/news/global-sales-of-professional-service-robots-surge-24-percent
- [S10] https://us.orsted.com/news-archive/2026/09/orsted-begins-construction-on-blackwater-solar-in-new-mexico
- [S11] https://inl.gov/news-release/deployable-energy-selected-to-test-its-nuclear-battery-at-dome/
- [S12] https://ir.candeltx.com/news-releases/news-release-details/candel-therapeutics-announces-integrated-clinical-and-biomarker
- [S13] https://www.hhs.gov/press-room/hhs-arpa-h-launch-surpass-modernize-clinical-trials.html
- [S14] https://www.nasa.gov/news-release/nasa-awards-contract-to-develop-5g-communications-for-moon/
- [S15] https://investors.rocketlabcorp.com/news-releases/news-release-details/rocket-lab-secures-largest-ever-electron-commercial-deal-20
- [S16] https://www.roche.com/media/releases/med-cor-2026-09-30
- [S17] https://news.mit.edu/2026/mit-transit-lab-to-develop-ai-platform-public-transit-agencies-0930
- [S18] https://www.nlr.gov/news/detail/program/2026/as-local-power-grows-utilities-reorganize-for-resilience
- [S19] https://news.skhynix.com/en/ai-infrastructure-insight-ep3/
- [S20] https://nih.go.kr/ko/bbs/B0000130/view.do?nttId=13322&menuNo=300829&pageIndex=1
