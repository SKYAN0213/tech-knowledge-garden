---
title: 2026-09-22 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-22
timezone: Asia/Seoul
coverage_start: 2026-09-20T23:11:25.089Z
coverage_end: 2026-09-21T23:18:19.442Z
source_count: 10
new_items_count: 9
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
editorial_format: six-w/v1
theme_format: news-themes/v1
briefing_format: sector-five/v1
headlines:
  - 삼성전자, 광주 HVAC 공장 착공…2,400억원 투자·2028년 가동 계획
  - RamanOmics, 빛의 산란과 유전자 정보를 결합해 노화 세포 분류
  - Navitas, Magnachip에 500만달러 지분 투자 계약
  - GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공
  - Sunrun·Tesla, 캘리포니아 가정용 배터리 580MW 공급 실적 공개
article_records:
  - title: 삼성전자, 광주 HVAC 공장 착공…2,400억원 투자·2028년 가동 계획
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 삼성전자, FläktGroup
      when: 2026-09-21T10:00:00+09:00 게시; 13:41:43 수정. 9월21일 착공, 2028년 초 가동 계획.
      where: 대한민국 광주사업장 3캠퍼스
      what: 삼성전자, 광주 HVAC 공장 착공…2,400억원 투자·2028년 가동 계획
      how: CDU·FWU·CRAH·AHU 생산라인 건설
      why: 동아시아 고객 공조 수요 대응이라는 회사 설명
    lead: 삼성전자는 9월 21일 광주사업장 3캠퍼스에서 FläktGroup의 냉난방공조 생산라인 착공식을 열었다. 회사는 약 2,400억원을
      투자해 연면적 2만1,800㎡ 규모 시설을 짓고 2028년 초 가동할 계획이다. 동아시아 데이터센터와 반도체·배터리 공장, 상업시설의
      공조 수요에 대응하는 생산거점으로 추진한다.
    papers: []
    relations: []
    topic_ids:
      - company-samsung-hvac
    explanations:
      - heading: 냉각 장비의 생산거점을 한국으로 확대
        paragraphs:
          - 계획된 생산 품목은 냉각수 분배 장치(CDU), 팬월 장치(FWU), 전산실 공조 장치(CRAH), 공기조화기(AHU)다.
            서버의 열을 처리하는 액체 냉각 계통과 시설 내부 공기를 조절하는 계통을 함께 다룬다.
          - 완공되면 FläktGroup의 세계 15번째 제조거점이 된다. 이번에 확인된 진행 단계는 착공이며, 투자 총액은 계획
            금액이다. 실제 가동과 품목별 공급 확대는 2028년 일정 및 후속 생산 발표로 확인해야 한다.
        source_urls:
          - https://news.samsung.com/kr/삼성전자-플랙트그룹-hvac-생산라인-착공
  - title: RamanOmics, 빛의 산란과 유전자 정보를 결합해 노화 세포 분류
    kind: 논문 해설
    region: 해외
    facts:
      who: MIT, Massachusetts General Hospital
      when: 2026-09-21 논문 및 MIT 기사 게시; 시각 미표시
      where: 미국 연구진의 쥐 폐·피부·상처 치유 조직 실험
      what: RamanOmics, 빛의 산란과 유전자 정보를 결합해 노화 세포 분류
      how: 라만 영상·공간 전사체·단일핵 RNA·랜덤 포리스트 결합
      why: 단일 분자 표지만으로 놓치는 생화학적 상태를 함께 측정
    lead: MIT와 매사추세츠종합병원 등의 연구진은 9월 21일 Nature Aging에 쥐의 폐·피부에서 노화 세포를 구별하는
      RamanOmics 연구를 발표했다. 라만 영상의 화학적 신호와 유전자 발현 정보를 같은 세포 위치에서 연결해, 어느 유전자가
      작동하는지와 조직의 생화학적 상태를 함께 읽는 방법이다. 2개월령과 26개월령 쥐를 비교한 동료심사 논문으로, 사람의 진단 성능을
      입증한 연구는 아니다.
    papers:
      - work_id: ramanomics-senescence-2026
        identifiers:
          - doi:10.1038/s43587-026-01219-7
        access: 전문
        status: 동료심사
        evidence_url: https://www.nature.com/articles/s43587-026-01219-7
    relations: []
    topic_ids:
      - research-ramanomics
    explanations:
      - heading: 같은 조직에서 서로 다른 신호를 맞춘다
        paragraphs:
          - 입력은 빛이 분자 진동과 상호작용하며 변한 산란 스펙트럼과 RNA 측정값이다. 연구진은 라만 영상을 먼저 얻은 조직에 공간
            전사체 측정을 수행하고 세포 위치를 맞춘 뒤, 단일핵 RNA 자료를 결합해 분류용 특징을 만들었다. 출력은 p21 양성
            세포를 구분하는 모델과 주요 특징을 나열한 바코드다.
        source_urls:
          - https://www.nature.com/articles/s43587-026-01219-7
          - https://news.mit.edu/2026/unmasking-zombie-cells-aging-tissue-ai-powered-barcode-0921
      - heading: 성능 수치의 실험 조건
        paragraphs:
          - 연령군당 쥐 3마리의 자료를 사용했다. 세포 수를 두 분류 간 균형 맞춘 뒤 70%를 학습, 30%를 시험에 쓴 랜덤
            포리스트에서, RNA 단독 대비 결합 모델의 정확도는 폐 0.7368→0.7763, 피부 0.6182→0.6545였다.
            이는 각각 3.95·3.63%포인트 차이다.
        source_urls:
          - https://www.nature.com/articles/s43587-026-01219-7
          - https://news.mit.edu/2026/unmasking-zombie-cells-aging-tissue-ai-powered-barcode-0921
      - heading: 분류 향상이 곧 진단 실용화는 아니다
        paragraphs:
          - "분석: 동일 세포에 화학적 정보와 전사체 정보를 연결한 점은 해석에 도움이 된다. 다만 세포 단위 분할 성능은 독립된
            동물·사람 집단에서의 일반화 성능과 다르다. p21 양성이라는 노화 세포의 일부만 기준으로 삼았고, 상관관계가 원인을
            입증하지는 않는다."
          - MIT는 현재 약 1㎟ 조직 촬영에 30시간이 걸린다고 설명했다. 다음 확인은 독립 집단 검증, 다른 노화 표지자와의
            비교, 촬영 속도 개선이다.
        source_urls:
          - https://www.nature.com/articles/s43587-026-01219-7
          - https://news.mit.edu/2026/unmasking-zombie-cells-aging-tissue-ai-powered-barcode-0921
    analysis_summary: 화학적 신호를 전사체와 연결하면 세포 분류를 보완한다. 세포 분할 시험과 독립 집단 일반화는 구분해야 한다.
    next_check: 독립 동물·사람 조직 검증, 다중 노화 표지자 및 영상 취득 속도.
  - title: Navitas, Magnachip에 500만달러 지분 투자 계약
    kind: 사건 뉴스
    region: 국내
    facts:
      who: Magnachip, Navitas
      when: 2026-09-21 공식 게시, 시각 미표시; 9월24일 전후 종결 예상
      where: 서울 발표; 한국 제조시설 이전 계획
      what: Navitas, Magnachip에 500만달러 지분 투자 계약
      how: 주식1461988주 × 3.42달러; 기존 SiC 라이선스 협력
      why: 고전압 전력반도체 공동 개발 확대 계획
    lead: Magnachip은 9월 21일 Navitas가 자사에 500만달러를 지분 투자하기로 합의했다고 발표했다. 계약에 따라 보통주
      146만1,988주를 주당 3.42달러에 발행하며, 통상적인 종결 조건 충족 또는 면제를 전제로 9월 24일 전후 거래를 마칠
      예정이다. 7월 발표한 고전압 탄화규소(SiC) 기술 협력에 자본 참여를 더한 단계다.
    papers: []
    relations: []
    topic_ids:
      - company-magnachip-sic
    explanations:
      - heading: 기술 라이선스에서 제조 이전으로
        paragraphs:
          - 기존 협력은 Navitas의 GeneSiC 기술을 1,200V·2,300V·3,300V 이상 전압 제품에 적용하고 한국
            Magnachip 공장으로 이식·인증·내재화하는 계획이다. 소재 공급망 접근도 포함된다.
          - 이번 지분 계약은 기술의 양산 인증 완료나 고객 출하를 뜻하지 않는다. 거래 종결 공시와 제조공정 인증, 실제 공급 제품이
            후속 확인 대상이다.
        source_urls:
          - https://www.magnachip.com/cn/magnachip-announces-strategic-investment-by-navitas-semiconductor-share/
  - title: GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-09-21T21:13:18Z 게시; 21:16:49Z 수정
      where: GitHub Enterprise Cloud
      what: GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공
      how: CSV 또는 페이지 단위 REST API로 자격증명 메타데이터 내보내기
      why: 기업 접근 권한의 목록화와 감사
    lead: GitHub는 9월 21일 Enterprise Cloud에서 기업 자격증명 목록을 내보내는 기능을 공개했다. 기업 소유자 또는
      자격증명 열람 권한을 가진 사용자는 설정 화면의 CSV나 페이지 단위 REST API로 목록을 가져올 수 있다. 여러 형태의 접근
      권한을 모아 감사하고 관리하는 기능이다.
    papers: []
    relations: []
    topic_ids:
      - execution-permissions
    explanations:
      - heading: 비밀값보다 권한의 범위를 점검한다
        paragraphs:
          - 목록은 SSH 키, 개인 접근 토큰, OAuth 앱 토큰, GitHub App의 사용자·설치 토큰을 포함한다. 소유자와
            권한, 생성·만료·최근 사용 시점, 대상 조직·저장소 등의 메타데이터를 감사 로그와 대조할 수 있다.
          - Enterprise Server 지원은 향후 제공 예정이다. 목록을 얻는 것만으로 오래된 토큰이 폐기되지는 않으므로, 실제
            권한 축소와 자격증명 정리는 별도 운영 조치다.
        source_urls:
          - https://github.blog/changelog/2026-09-21-github-enterprise-adds-credential-inventory-exports/
  - title: Sunrun·Tesla, 캘리포니아 가정용 배터리 580MW 공급 실적 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Sunrun, Tesla
      when: 2026-09-21 08:00 EDT 발표; 실제 운전일 2026-09-09
      where: 미국 캘리포니아
      what: Sunrun·Tesla, 캘리포니아 가정용 배터리 580MW 공급 실적 공개
      how: 주정부 전력망 지원 프로그램에서 분산 배터리 방전
      why: 전력 피크 시간의 공급 지원
    lead: Sunrun은 9월 21일 Tesla와 함께 9월 9일 캘리포니아 전력망에 14만대 이상의 가정용 배터리로 최대 580MW 이상을
      공급했다고 발표했다. 저녁 3시간 동안 수행한 전력망 지원의 실적 공개이며, 9월 21일 새로 발전소를 가동했다는 뜻은 아니다.
      분산된 저장장치를 수요가 집중되는 시간에 함께 방전시킨 사례다.
    papers: []
    relations: []
    topic_ids:
      - grid-home-batteries
    explanations:
      - heading: 최대 출력과 공급 에너지의 차이
        paragraphs:
          - 발표에 따르면 Tesla Powerwall 11만대 이상이 517MW, 다른 배터리 3만대 이상이 63MW 이상을
            제공했다. Powerwall 중 55%는 Sunrun이 소유·운영한다고 밝혔다.
          - 580MW는 최대 출력이다. 3시간 내내 같은 출력이었다는 자료가 없으므로 이를 곱해 총 공급 전력량으로 쓸 수 없다.
            특정일의 회사 집계이며 연중 공급 신뢰도나 전체 시장 성장률을 뜻하지 않는다.
        source_urls:
          - https://investors.sunrun.com/news-events/press-releases/detail/381/sunrun-and-tesla-dispatch-580-megawatts-to-californias
  - title: OpenAI, AI 능력·감독·사고 보고의 국제 공통 기준 제안
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-09-21 공식 게시, 시각 미표시
      where: OpenAI 정책 제안; 국제 적용 구상
      what: OpenAI, AI 능력·감독·사고 보고의 국제 공통 기준 제안
      how: 능력·사람 감독·사고 심각도에 공통 기술 기준 제안
      why: 빠르게 발전하는 AI를 비교하고 감독하기 위한 회사 제안
    lead: OpenAI는 9월 21일 AI 기술 발전에 맞춘 국제 기술표준 체계를 제안했다. 미국 AI 표준·혁신센터(CAISI)와 국제 AI
      안전연구소 네트워크 등이 모델 능력 평가, 사람의 감독, 사고 보고에 공통 기준을 마련하자는 내용이다. 회사의 정책 제안으로, 정부가
      채택하거나 법적 의무로 시행한 기준은 아니다.
    papers: []
    relations: []
    topic_ids:
      - evaluation
    explanations:
      - heading: 무엇을 함께 측정할 것인가
        paragraphs:
          - 제안은 위험과 능력을 비교할 공통 측정 방식, 적절한 사람의 감독, 사고의 심각도와 보고 체계에 초점을 둔다. 각국이 이를
            자국 제도에 반영하는 방식은 별도로 정하도록 한다.
          - OpenAI는 이 체계를 모든 모델의 출시 전 허가 절차로 제시하지 않았다. 다음 확인은 다른 기관의 공식 참여, 실제
            평가 항목과 보고 기준, 정부의 채택 여부다.
        source_urls:
          - https://openai.com/index/building-standards-next-phase-ai/
  - title: 60개 기관, 5년 내 저자원 언어 AI 접근성 확대 공동 목표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Gates Foundation
      when: 2026-09-21 공식 게시, 시각 미표시
      where: 미국 뉴욕 공동 발표
      what: 60개 기관, 5년 내 저자원 언어 AI 접근성 확대 공동 목표
      how: 60개 초기 서명 기관이 데이터·평가·모델·안전한 보급에 협력
      why: AI 학습 자료와 도구가 부족한 언어의 접근성 개선
    lead: Gates Foundation은 9월 21일 뉴욕에서 60개 초기 서명 기관의 언어·음성 AI 접근성 공동 목표를 발표했다. 현재
      AI에서 충분히 지원되지 않는 언어를 사용하는 약 34억명이 5년 안에 자기 언어와 음성으로 AI 도구를 이용하도록 돕겠다는
      구상이다. 이 숫자는 현재 확보한 이용자가 아니라 목표가 가리키는 인구 추정치다.
    papers: []
    relations: []
    topic_ids:
      - evaluation
    explanations:
      - heading: 데이터부터 실제 이용까지 네 가지 과제
        paragraphs:
          - 참여 기관들은 공개 라이선스의 언어 데이터 기반, 진전을 평가하는 지표, 모델·응용 도구, 개인정보·동의·데이터 주권을
            고려한 제공 방식을 함께 추진한다. 단순 번역뿐 아니라 방언과 음성 이용 환경도 대상이다.
          - 세부 조직 구조와 운영 체계는 앞으로 1년에 걸쳐 공동 설계할 예정이다. 언어별 성능 개선이나 제공 완료를 판단하려면 평가
            결과와 실제 서비스 범위를 확인해야 한다.
        source_urls:
          - https://www.gatesfoundation.org/ideas/media-center/press-releases/2026/09/ai-language-partnership
  - title: MIT, 위장관에서 분해되는 1.84V 배터리 실험 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: MIT
      when: 2026-09-21 MIT 공식 기사 게시; 시각 미표시
      where: MIT 연구진의 모사 위액 및 동물 실험
      what: MIT, 위장관에서 분해되는 1.84V 배터리 실험 공개
      how: 마그네슘·산화몰리브덴 전극과 이온성 액체 겔
      why: 삼키는 기기의 작동 시간과 회수 부담을 함께 다루기 위한 연구
    lead: MIT는 9월 21일 삼켜서 쓰는 전자기기를 위한 생체흡수성 배터리 연구를 소개했다. 마그네슘 음극과 산화몰리브덴 양극, 이온성 액체
      겔을 사용한 1.84V 전지로, 위장관의 산성 환경에서 작동한 뒤 분해되도록 설계했다. 연구진은 소형 기기 전원과 동물의 위 전기자극
      실험을 수행했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 전원을 공급한 뒤 남는 부품까지 확인해야 한다
        paragraphs:
          - 연구에서는 지름 7.5mm 원형과 길이 24mm 막대형을 만들었다. 모사 위액에서 약 3일간 정상 작동한 뒤 출력이
            감소하고, 이후 수주에 걸쳐 분해됐다. 활성 무선 식별 장치를 최대 1.5m 거리에서 읽는 시연도 포함됐다.
          - 배터리가 분해되는 것과 기기 전체가 완전히 사라지는 것은 다르다. 시연 장치에는 인쇄회로기판 등 남는 부분이 있으며, 이번
            결과는 사람용 의료기기의 안전성·유효성 승인을 뜻하지 않는다.
        source_urls:
          - https://news.mit.edu/2026/batteries-safely-break-down-in-gi-tract-could-improve-ingestible-devices-0921
  - title: NASA, 화성 제제로 암석에서 최소 세 차례 물의 작용 구분
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NASA
      when: 2026-09-21T12:54:43-04:00 게시; 16:15:57-04:00 수정
      where: 화성 제제로 분화구 Margin Unit
      what: NASA, 화성 제제로 암석에서 최소 세 차례 물의 작용 구분
      how: SuperCam의 암석 화학 분석과 지층·광물맥 비교
      why: 화성의 초기 물과 암석 상호작용 복원
    lead: NASA는 9월 21일 퍼서비어런스 탐사차의 제제로 분화구 관측에서 서로 다른 물의 작용이 최소 세 차례 나타난다고 밝혔다. 연구진은
      SuperCam으로 185곳 이상의 기반암 표적을 분석하고 265m 고도 범위의 화학적 변화를 비교했다. 탄산염을 포함한 주변부
      지층의 기원이 예상했던 퇴적암보다 감람석을 함유한 화성암에 가깝다는 해석도 제시했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 광물의 생성 순서로 복원한 물의 역사
        paragraphs:
          - 연구는 이산화탄소를 포함한 지하수의 탄산염 형성, 실리카를 남긴 후속 물의 작용, 황산염·형석 등을 포함하는 광물맥을 만든
            더 늦은 물의 활동을 구분한다. 광물 성분과 암석을 가로지르는 구조를 함께 읽어 상대적인 순서를 추론했다.
          - 호수와 지하수의 정확한 시기·지속시간까지 확정한 것은 아니다. 물과 암석의 반응 흔적은 과거 환경의 근거이며 생명체를
            발견했다는 뜻은 아니다.
        source_urls:
          - https://www.nasa.gov/solar-system/planets/mars/nasa-discovery-reveals-complex-water-systems-on-early-mars/
article_reviews:
  - title: 삼성전자, 광주 HVAC 공장 착공…2,400억원 투자·2028년 가동 계획
    event_id: d37e6feb52f811ed
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: RamanOmics, 빛의 산란과 유전자 정보를 결합해 노화 세포 분류
    event_id: 12d7d589a995c908
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: Navitas, Magnachip에 500만달러 지분 투자 계약
    event_id: a49bfbd297aaeae9
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공
    event_id: f631d543deb02b09
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: Sunrun·Tesla, 캘리포니아 가정용 배터리 580MW 공급 실적 공개
    event_id: 4db79fe713e8de1c
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: OpenAI, AI 능력·감독·사고 보고의 국제 공통 기준 제안
    event_id: 10538c022345675d
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: 60개 기관, 5년 내 저자원 언어 AI 접근성 확대 공동 목표
    event_id: 8980fabc70784290
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: MIT, 위장관에서 분해되는 1.84V 배터리 실험 공개
    event_id: a79face44324947c
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
  - title: NASA, 화성 제제로 암석에서 최소 세 차례 물의 작용 구분
    event_id: b429bf3b4fabcc12
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-09-22
    concept_ids: []
---

# 이번 호 표지

> 광주 공조 생산거점의 착공, 노화 세포를 읽는 두 가지 신호

# 차례

커버 스토리 · 뉴스 데스크 · 리서치 노트

# 커버 스토리

## 삼성전자, 광주 HVAC 공장 착공…2,400억원 투자·2028년 가동 계획

**분야:** 에너지·기후기술
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 설비 투자, 증설
**기업·기관:** 삼성전자, FläktGroup

삼성전자는 9월 21일 광주사업장 3캠퍼스에서 FläktGroup의 냉난방공조 생산라인 착공식을 열었다. 회사는 약 2,400억원을 투자해 연면적 2만1,800㎡ 규모 시설을 짓고 2028년 초 가동할 계획이다. 동아시아 데이터센터와 반도체·배터리 공장, 상업시설의 공조 수요에 대응하는 생산거점으로 추진한다. [S1]

### 냉각 장비의 생산거점을 한국으로 확대

계획된 생산 품목은 냉각수 분배 장치(CDU), 팬월 장치(FWU), 전산실 공조 장치(CRAH), 공기조화기(AHU)다. 서버의 열을 처리하는 액체 냉각 계통과 시설 내부 공기를 조절하는 계통을 함께 다룬다. [S1]

완공되면 FläktGroup의 세계 15번째 제조거점이 된다. 이번에 확인된 진행 단계는 착공이며, 투자 총액은 계획 금액이다. 실제 가동과 품목별 공급 확대는 2028년 일정 및 후속 생산 발표로 확인해야 한다. [S1]

# 뉴스 데스크

## Navitas, Magnachip에 500만달러 지분 투자 계약

**분야:** 반도체·컴퓨팅
**테마:** 투자·기업거래
**보조 테마:** 없음
**세부 태그:** 지분 투자
**기업·기관:** Magnachip, Navitas

Magnachip은 9월 21일 Navitas가 자사에 500만달러를 지분 투자하기로 합의했다고 발표했다. 계약에 따라 보통주 146만1,988주를 주당 3.42달러에 발행하며, 통상적인 종결 조건 충족 또는 면제를 전제로 9월 24일 전후 거래를 마칠 예정이다. 7월 발표한 고전압 탄화규소(SiC) 기술 협력에 자본 참여를 더한 단계다. [S3]

### 기술 라이선스에서 제조 이전으로

기존 협력은 Navitas의 GeneSiC 기술을 1,200V·2,300V·3,300V 이상 전압 제품에 적용하고 한국 Magnachip 공장으로 이식·인증·내재화하는 계획이다. 소재 공급망 접근도 포함된다. [S3]

이번 지분 계약은 기술의 양산 인증 완료나 고객 출하를 뜻하지 않는다. 거래 종결 공시와 제조공정 인증, 실제 공급 제품이 후속 확인 대상이다. [S3]

## GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 9월 21일 Enterprise Cloud에서 기업 자격증명 목록을 내보내는 기능을 공개했다. 기업 소유자 또는 자격증명 열람 권한을 가진 사용자는 설정 화면의 CSV나 페이지 단위 REST API로 목록을 가져올 수 있다. 여러 형태의 접근 권한을 모아 감사하고 관리하는 기능이다. [S4]

### 비밀값보다 권한의 범위를 점검한다

목록은 SSH 키, 개인 접근 토큰, OAuth 앱 토큰, GitHub App의 사용자·설치 토큰을 포함한다. 소유자와 권한, 생성·만료·최근 사용 시점, 대상 조직·저장소 등의 메타데이터를 감사 로그와 대조할 수 있다. [S4]

Enterprise Server 지원은 향후 제공 예정이다. 목록을 얻는 것만으로 오래된 토큰이 폐기되지는 않으므로, 실제 권한 축소와 자격증명 정리는 별도 운영 조치다. [S4]

## Sunrun·Tesla, 캘리포니아 가정용 배터리 580MW 공급 실적 공개

**분야:** 에너지·기후기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Sunrun, Tesla

Sunrun은 9월 21일 Tesla와 함께 9월 9일 캘리포니아 전력망에 14만대 이상의 가정용 배터리로 최대 580MW 이상을 공급했다고 발표했다. 저녁 3시간 동안 수행한 전력망 지원의 실적 공개이며, 9월 21일 새로 발전소를 가동했다는 뜻은 아니다. 분산된 저장장치를 수요가 집중되는 시간에 함께 방전시킨 사례다. [S5]

### 최대 출력과 공급 에너지의 차이

발표에 따르면 Tesla Powerwall 11만대 이상이 517MW, 다른 배터리 3만대 이상이 63MW 이상을 제공했다. Powerwall 중 55%는 Sunrun이 소유·운영한다고 밝혔다. [S5]

580MW는 최대 출력이다. 3시간 내내 같은 출력이었다는 자료가 없으므로 이를 곱해 총 공급 전력량으로 쓸 수 없다. 특정일의 회사 집계이며 연중 공급 신뢰도나 전체 시장 성장률을 뜻하지 않는다. [S5]

## OpenAI, AI 능력·감독·사고 보고의 국제 공통 기준 제안

**분야:** AI
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 표준 채택
**기업·기관:** OpenAI

OpenAI는 9월 21일 AI 기술 발전에 맞춘 국제 기술표준 체계를 제안했다. 미국 AI 표준·혁신센터(CAISI)와 국제 AI 안전연구소 네트워크 등이 모델 능력 평가, 사람의 감독, 사고 보고에 공통 기준을 마련하자는 내용이다. 회사의 정책 제안으로, 정부가 채택하거나 법적 의무로 시행한 기준은 아니다. [S6]

### 무엇을 함께 측정할 것인가

제안은 위험과 능력을 비교할 공통 측정 방식, 적절한 사람의 감독, 사고의 심각도와 보고 체계에 초점을 둔다. 각국이 이를 자국 제도에 반영하는 방식은 별도로 정하도록 한다. [S6]

OpenAI는 이 체계를 모든 모델의 출시 전 허가 절차로 제시하지 않았다. 다음 확인은 다른 기관의 공식 참여, 실제 평가 항목과 보고 기준, 정부의 채택 여부다. [S6]

## 60개 기관, 5년 내 저자원 언어 AI 접근성 확대 공동 목표

**분야:** AI
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 기술 제휴
**기업·기관:** Gates Foundation

Gates Foundation은 9월 21일 뉴욕에서 60개 초기 서명 기관의 언어·음성 AI 접근성 공동 목표를 발표했다. 현재 AI에서 충분히 지원되지 않는 언어를 사용하는 약 34억명이 5년 안에 자기 언어와 음성으로 AI 도구를 이용하도록 돕겠다는 구상이다. 이 숫자는 현재 확보한 이용자가 아니라 목표가 가리키는 인구 추정치다. [S7]

### 데이터부터 실제 이용까지 네 가지 과제

참여 기관들은 공개 라이선스의 언어 데이터 기반, 진전을 평가하는 지표, 모델·응용 도구, 개인정보·동의·데이터 주권을 고려한 제공 방식을 함께 추진한다. 단순 번역뿐 아니라 방언과 음성 이용 환경도 대상이다. [S7]

세부 조직 구조와 운영 체계는 앞으로 1년에 걸쳐 공동 설계할 예정이다. 언어별 성능 개선이나 제공 완료를 판단하려면 평가 결과와 실제 서비스 범위를 확인해야 한다. [S7]

# 리서치 노트

## RamanOmics, 빛의 산란과 유전자 정보를 결합해 노화 세포 분류

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** MIT, Massachusetts General Hospital

MIT와 매사추세츠종합병원 등의 연구진은 9월 21일 Nature Aging에 쥐의 폐·피부에서 노화 세포를 구별하는 RamanOmics 연구를 발표했다. 라만 영상의 화학적 신호와 유전자 발현 정보를 같은 세포 위치에서 연결해, 어느 유전자가 작동하는지와 조직의 생화학적 상태를 함께 읽는 방법이다. 2개월령과 26개월령 쥐를 비교한 동료심사 논문으로, 사람의 진단 성능을 입증한 연구는 아니다. [S2]

### 같은 조직에서 서로 다른 신호를 맞춘다

입력은 빛이 분자 진동과 상호작용하며 변한 산란 스펙트럼과 RNA 측정값이다. 연구진은 라만 영상을 먼저 얻은 조직에 공간 전사체 측정을 수행하고 세포 위치를 맞춘 뒤, 단일핵 RNA 자료를 결합해 분류용 특징을 만들었다. 출력은 p21 양성 세포를 구분하는 모델과 주요 특징을 나열한 바코드다. [S2] [S10]

### 성능 수치의 실험 조건

연령군당 쥐 3마리의 자료를 사용했다. 세포 수를 두 분류 간 균형 맞춘 뒤 70%를 학습, 30%를 시험에 쓴 랜덤 포리스트에서, RNA 단독 대비 결합 모델의 정확도는 폐 0.7368→0.7763, 피부 0.6182→0.6545였다. 이는 각각 3.95·3.63%포인트 차이다. [S2] [S10]

### 분류 향상이 곧 진단 실용화는 아니다

분석: 동일 세포에 화학적 정보와 전사체 정보를 연결한 점은 해석에 도움이 된다. 다만 세포 단위 분할 성능은 독립된 동물·사람 집단에서의 일반화 성능과 다르다. p21 양성이라는 노화 세포의 일부만 기준으로 삼았고, 상관관계가 원인을 입증하지는 않는다. [S2] [S10]

MIT는 현재 약 1㎟ 조직 촬영에 30시간이 걸린다고 설명했다. 다음 확인은 독립 집단 검증, 다른 노화 표지자와의 비교, 촬영 속도 개선이다. [S2] [S10]

## MIT, 위장관에서 분해되는 1.84V 배터리 실험 공개

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** MIT

MIT는 9월 21일 삼켜서 쓰는 전자기기를 위한 생체흡수성 배터리 연구를 소개했다. 마그네슘 음극과 산화몰리브덴 양극, 이온성 액체 겔을 사용한 1.84V 전지로, 위장관의 산성 환경에서 작동한 뒤 분해되도록 설계했다. 연구진은 소형 기기 전원과 동물의 위 전기자극 실험을 수행했다. [S8]

### 전원을 공급한 뒤 남는 부품까지 확인해야 한다

연구에서는 지름 7.5mm 원형과 길이 24mm 막대형을 만들었다. 모사 위액에서 약 3일간 정상 작동한 뒤 출력이 감소하고, 이후 수주에 걸쳐 분해됐다. 활성 무선 식별 장치를 최대 1.5m 거리에서 읽는 시연도 포함됐다. [S8]

배터리가 분해되는 것과 기기 전체가 완전히 사라지는 것은 다르다. 시연 장치에는 인쇄회로기판 등 남는 부분이 있으며, 이번 결과는 사람용 의료기기의 안전성·유효성 승인을 뜻하지 않는다. [S8]

## NASA, 화성 제제로 암석에서 최소 세 차례 물의 작용 구분

**분야:** 우주·기초과학
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** NASA

NASA는 9월 21일 퍼서비어런스 탐사차의 제제로 분화구 관측에서 서로 다른 물의 작용이 최소 세 차례 나타난다고 밝혔다. 연구진은 SuperCam으로 185곳 이상의 기반암 표적을 분석하고 265m 고도 범위의 화학적 변화를 비교했다. 탄산염을 포함한 주변부 지층의 기원이 예상했던 퇴적암보다 감람석을 함유한 화성암에 가깝다는 해석도 제시했다. [S9]

### 광물의 생성 순서로 복원한 물의 역사

연구는 이산화탄소를 포함한 지하수의 탄산염 형성, 실리카를 남긴 후속 물의 작용, 황산염·형석 등을 포함하는 광물맥을 만든 더 늦은 물의 활동을 구분한다. 광물 성분과 암석을 가로지르는 구조를 함께 읽어 상대적인 순서를 추론했다. [S9]

호수와 지하수의 정확한 시기·지속시간까지 확정한 것은 아니다. 물과 암석의 반응 흔적은 과거 환경의 근거이며 생명체를 발견했다는 뜻은 아니다. [S9]

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

없음

# Source List

- [S1] https://news.samsung.com/kr/삼성전자-플랙트그룹-hvac-생산라인-착공
- [S2] https://www.nature.com/articles/s43587-026-01219-7
- [S3] https://www.magnachip.com/cn/magnachip-announces-strategic-investment-by-navitas-semiconductor-share/
- [S4] https://github.blog/changelog/2026-09-21-github-enterprise-adds-credential-inventory-exports/
- [S5] https://investors.sunrun.com/news-events/press-releases/detail/381/sunrun-and-tesla-dispatch-580-megawatts-to-californias
- [S6] https://openai.com/index/building-standards-next-phase-ai/
- [S7] https://www.gatesfoundation.org/ideas/media-center/press-releases/2026/09/ai-language-partnership
- [S8] https://news.mit.edu/2026/batteries-safely-break-down-in-gi-tract-could-improve-ingestible-devices-0921
- [S9] https://www.nasa.gov/solar-system/planets/mars/nasa-discovery-reveals-complex-water-systems-on-early-mars/
- [S10] https://news.mit.edu/2026/unmasking-zombie-cells-aging-tissue-ai-powered-barcode-0921
