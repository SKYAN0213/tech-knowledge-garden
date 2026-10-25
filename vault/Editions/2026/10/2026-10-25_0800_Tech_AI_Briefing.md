---
title: 2026-10-25 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-10-25
timezone: Asia/Seoul
coverage_start: 2026-10-21T20:01:17.938Z
coverage_end: 2026-10-24T22:18:59.233Z
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 30
new_items_count: 30
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - Solidigm, 잠재적 IPO 검토 중단…생산능력 확충은 우선순위로 유지
  - PHP 세션 취약점 CVE-2026-115560 임시 조치 권고
  - NASA, SR-1 Freedom 핵전력 모듈 계약 진전…2028년 말 발사 계획
  - MIT·톈진대, 3D 프린팅 센서 설계 소프트웨어 X-Hinges 소개
  - Mandiant, BeyondTrust 원격 지원 취약점의 8월 말 제로데이 악용 정황 공개
article_records:
  - title: Solidigm, 잠재적 IPO 검토 중단…생산능력 확충은 우선순위로 유지
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Solidigm과 SK hynix
      when: 2026년 10월 23일
      where: 미기재
      what: Solidigm이 잠재적 pre-IPO 및 IPO 방안 검토를 중단한다고 밝혔다.
      how: SK hynix는 Solidigm 직접 투자와 IPO 외부 조달 등 성장 자금 확보 방안을 검토해 왔다.
      why: Solidigm은 자본시장 여건과 주가 추세를 고려해 IPO가 SK hynix와 기존 주주에게 가장 유익한 방안인지 재평가할 필요가
        있었다고 설명했다.
    lead: Solidigm은 2026년 10월 23일 잠재적 pre-IPO 및 IPO 방안의 검토를 중단하기로 결정했다고 밝혔다.
      Solidigm은 이번 결정이 성장 전망이나 자금 수요의 변화 때문은 아니며, 최근 자본시장 여건과 주가 추세를 고려해 IPO가 SK
      hynix와 기존 주주에게 가장 유익한 방안인지 재평가할 필요가 있었다고 설명했다. 회사는 생산능력 확대와 경쟁력 강화가 계속 중요한
      우선순위라고 설명했다.
    explanations:
      - heading: 증설 수요와 검토했던 자금 조달 방안
        paragraphs:
          - Solidigm은 AI 시대 메모리 수요가 성장 기회를 제공하지만 기존 생산시설의 수용 능력이 제한돼 미국 내 추가
            생산시설 확보가 필요하다고 설명했다. SK hynix는 성장 자금 확보와 효율적인 자본 배분을 위해 Solidigm 직접
            투자와 IPO를 통한 외부 자금 조달 등 여러 방안을 검토해 왔다고 밝혔다.
          - SK hynix는 IPO를 통한 외부 자금 조달이 연결 현금흐름을 늘려 설비 투자 여력을 키우고 배당, 자사주 매입 및
            소각을 통한 주주 환원을 지원할 수 있다고 설명했다.
        source_urls:
          - https://news.skhynix.com/en/fact-12/
      - heading: 향후 투자 평가
        paragraphs:
          - SK hynix는 Solidigm의 성장과 기존 주주가치 제고 방안을 모색하면서 투자 시기·규모·자금 조달 방식을 계속
            평가하겠다고 밝혔다.
        source_urls:
          - https://news.skhynix.com/en/fact-12/
    papers: []
    relations: []
    topic_ids: []
  - title: PHP 세션 취약점 CVE-2026-115560 임시 조치 권고
    kind: 사건 뉴스
    region: 국내
    facts:
      who: PHP 개발팀
      when: 2026년 10월 24일 권고문 게시
      where: 미기재
      what: PHP 세션 처리 원격 코드 실행 취약점 CVE-2026-115560에 대한 임시 조치 안내
      how: session.upload_progress.enabled=0 설정 후 모든 PHP 워커 재시작 권고
      why: 보안 업데이트가 아직 배포되지 않았기 때문
    lead: 2026년 10월 24일자 권고문은 PHP 세션 처리 과정의 원격 코드 실행 취약점 CVE-2026-115560에 대해 PHP
      개발팀이 발표한 임시 조치를 안내했다. 이 취약점은 설정 파일의 session.serialize_handler가 php_binary
      또는 php_serialize이고, session_start() 전에 ini_set()으로 해당 값을 php로 바꾸며,
      session.upload_progress.enabled가 활성화된 세 조건을 모두 충족할 때 영향을 받는다. 보안 업데이트가 아직
      배포되지 않아, 권고문은 업데이트 전까지 php.ini나 PHP-FPM pool 설정 등에서
      session.upload_progress.enabled=0으로 설정하고 모든 PHP 워커를 재시작하도록 안내했다. 영향받는 버전은
      제조사 미공개 상태이며, 10월 21일 배포된 PHP 보안 업데이트 8.5.12, 8.4.27, 8.3.36, 8.2.35로도
      해결되지 않고 차기 정기 업데이트에서 해결 버전이 배포될 예정이다.
    explanations:
      - heading: 임시 조치 적용 조건
        paragraphs:
          - session.upload_progress.enabled는 기본값으로 활성화되어 있다.
            PHP2Shell(CVE-2026-109619) 임시 조치로 이미 이 값을 0으로 설정했다면 추가 적용은 필요하지 않다고
            권고문은 설명한다.
        source_urls:
          - https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72237
    papers: []
    relations: []
    topic_ids: []
  - title: NASA, SR-1 Freedom 핵전력 모듈 계약 진전…2028년 말 발사 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NASA와 파트너들
      when: 2026년 10월 20일 발표; 발사 계획은 2028년 말
      where: 심우주 및 지구 궤도 밖
      what: NASA의 SR-1 Freedom 핵전기 추진 시연 임무와 핵전력 모듈 개발
      how: 핵분열 원자로의 열을 전기로 변환하는 전력 변환 시스템을 원자로와 통합할 계획
      why: 심우주 탐사와 향후 달 기지 운영을 지원할 핵분열 동력 시스템 개발을 위한 계획
    lead: NASA는 2026년 10월 20일 SR-1 Freedom 개발을 진전시키기 위한 주요 계약 조치에 파트너들과 상호 합의했다고
      밝혔다. SR-1 Freedom은 지구 궤도를 넘어 심우주에서 핵전기 추진을 실증할 임무로, NASA는 2028년 말
      Ingenuity 설계를 발전시킨 화성 헬리콥터 3대의 SkyFall 과학 임무를 함께 실어 발사할 계획이다.
    explanations:
      - heading: 핵전력 모듈 구성과 업체 역할
        paragraphs:
          - 핵전력 모듈은 핵분열로 열을 만드는 원자로와, 그 열을 우주선 시스템 및 전기 추진에 쓰는 전기로 바꾸는 전력 변환
            시스템으로 구성된다. Sierra Lobo Inc.는 폐쇄형 브레이턴 사이클 전력 변환 시스템을 공급할 예정이며, 해당
            작업은 2024년에 수주된 Space Flight Systems Development and Operations
            Contract III에 따라 수행된다.
        source_urls:
          - https://www.nasa.gov/centers-and-facilities/glenn/sr-1-freedom-advances-with-progress-on-nuclear-power-module/
      - heading: 원자로 통합과 안전 조치
        paragraphs:
          - 전력 변환 시스템은 미국 에너지부 산하 아이다호 국립연구소가 설계·개발 중인 핵분열 원자로와 통합될 예정이다. NASA와
            에너지부는 설계와 개발 전반에 걸쳐 기관 간 안전 검토, NASA 최고안전책임자의 지속적인 감독, 규정 준수, 위험·고장
            허용성·원자력 안전에 초점을 둔 설계 절차를 적용하며, 원자로는 우주선이 지구 궤도를 벗어날 때까지 비활성 상태로
            유지된다.
        source_urls:
          - https://www.nasa.gov/centers-and-facilities/glenn/sr-1-freedom-advances-with-progress-on-nuclear-power-module/
      - heading: SkyFall 임무의 계획된 목적
        paragraphs:
          - NASA는 SkyFall 임무가 과학 데이터를 수집하고 탐사 구역을 시연하며 잠재적 수원을 찾도록 계획하고 있다. 이
            임무는 심우주 탐사와, 태양광만으로 충분하지 않은 어둠의 기간이나 지역에서 NASA 달 기지의 운영을 지원하도록 설계된
            차세대 핵분열 동력 시스템의 기반을 마련한다는 구상이다.
        source_urls:
          - https://www.nasa.gov/centers-and-facilities/glenn/sr-1-freedom-advances-with-progress-on-nuclear-power-module/
    papers: []
    relations: []
    topic_ids: []
  - title: MIT·톈진대, 3D 프린팅 센서 설계 소프트웨어 X-Hinges 소개
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: MIT CSAIL과 톈진대 연구진
      when: 2026년 10월 22일
      where: 미기재
      what: 3D 프린팅 물체에 센서와 움직임 설계를 통합하는 X-Hinges 소프트웨어를 소개했다.
      how: 서로 다른 두 재료를 사용해 센서와 배선 요소를 구성하고, 최대 세 축의 움직임을 정해 굽힘 부위에 센서를 배치한다.
      why: 미기재
    lead: MIT CSAIL과 톈진대 연구진은 2026년 10월 22일 센서와 움직임 설계를 3D 프린팅 물체에 통합하는 X-Hinges를
      소개했다. X-Hinges는 센서 필라멘트가 강한 신호를 내고 배선 요소는 간섭을 피하도록 서로 다른 두 재료를 배치하며, 사용자는
      압축·상하·좌우 중 최대 세 축의 움직임을 정해 굽힘 부위에 센서를 넣을 수 있다. 연구진은 손 크기에 맞춰 손가락 관절 굽힘을
      기록하고 휴머노이드 손에 전달하는 장갑 등을 제작했지만, 출력물마다 전기 요소 배치가 조금씩 달라 같은 외형의 기기에서도 센서값이
      달라지는 보정 문제가 남아 있다.
    explanations:
      - heading: 제작한 장치의 예시
        paragraphs:
          - 연구진은 손으로 눌러 접으면 그 동작을 감지해 밝기가 달라지는 종이접기 형태의 램프도 제작했다.
          - 소프트웨어에는 사용자 설계 인터페이스와 네 가지 기본 형태가 있다. 연구진은 상어 꼬리 모양의 게임 컨트롤러를 직접 설계해
            꼬리가 위아래로 움직이도록 정한 뒤 센서를 넣어 3D 프린팅했다.
        source_urls:
          - https://news.mit.edu/2026/design-software-reimagines-everyday-objects-as-self-aware-devices-1022
      - heading: 현재 보정 방법과 후속 목표
        paragraphs:
          - Chang과 Li는 같은 종류의 두 출력물에서 데이터가 맞도록 컴퓨터 비전으로 출력 신호를 재보정하는 시스템을 만들었다.
            앞으로는 신호를 내부에서 재보정하는 기구를 개발하기를 희망한다고 밝혔다.
          - Jiaji Li는 다음 단계로 구동과 감지를 한 번의 프린팅 과정에 함께 통합하는 방안을 제시했다.
        source_urls:
          - https://news.mit.edu/2026/design-software-reimagines-everyday-objects-as-self-aware-devices-1022
      - heading: 연구진과 발표 일정
        paragraphs:
          - 이 작업에는 MIT CSAIL과 중국 톈진대 연구진이 참여했다. 주저자 Xiang Chang은 톈진대 박사과정생이자
            CSAIL 방문연구원이고, 선임저자 Jiaji Li는 MIT EECS 박사후연구원 겸 CSAIL 연구원으로 소개됐다.
          - 연구진은 11월 초 ACM 사용자 인터페이스 소프트웨어 및 기술 심포지엄에서 이 연구를 발표할 예정이다.
        source_urls:
          - https://news.mit.edu/2026/design-software-reimagines-everyday-objects-as-self-aware-devices-1022
    papers: []
    relations: []
    topic_ids: []
  - title: Mandiant, BeyondTrust 원격 지원 취약점의 8월 말 제로데이 악용 정황 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: BeyondTrust가 취약점을 공개했으며, Mandiant는 ARMORY CASTLE의 악용 정황을 보고했다.
      when: 취약점 공개일은 2026년 10월 15일이며, 제로데이 악용은 2026년 8월 말로 보고됐다.
      where: BeyondTrust Remote Support 어플라이언스
      what: CVE-2026-102764 취약점과 이를 이용한 침해 활동
      how: 인증되지 않은 원격 파일 작업으로 시작해 호스트 수준 제어와 저장·중개된 자격 증명 접근으로 이어질 수 있다.
      why: ARMORY CASTLE은 침해 어플라이언스에 접근을 유지하고 탐지를 피하기 위해 활동한 것으로 보고됐다.
    lead: BeyondTrust는 2026년 10월 15일 BeyondTrust Remote Support 어플라이언스에 영향을 주는
      CVE-2026-102764를 공개했으며, 취약점 악용에 성공하면 임의 파일을 업로드할 수 있다. Mandiant는 사고 대응
      과정에서 ARMORY CASTLE이 2026년 8월 말 이 취약점을 제로데이로 악용한 증거를 확인했다고 밝혔다. 이 취약점은 지원되는
      Remote Support 버전 26.2.3 이하에 영향을 주며, 인증되지 않은 원격 공격자가 어플라이언스에서 파일 작업을 수행해
      호스트 제어권과 저장·중개된 자격 증명에 접근할 수 있다. Mandiant는 악용 기간 중 취약 버전으로 인터넷에 노출된
      어플라이언스를 검토 전까지 침해 가능성이 있는 것으로 취급하고, 조직의 위험 허용도·침해 증거·운영 요구를 바탕으로 지원 업무 중단과
      격리를 함께 고려하는 단계적 패치 우선 대응을 권고했다.
    explanations:
      - heading: 보고된 침해 방식
        paragraphs:
          - Mandiant는 공격자가 웹 서비스 계정에서 어플라이언스 호스트의 root 수준 제어권으로 권한을 높여, 저장·중개되는
            모든 자격 증명에 접근하고 재부팅·설정 초기화 뒤에도 남는 파일을 수정할 수 있게 됐다고 설명했다. 공격자는 자격 증명
            관리 데이터베이스에서 정보를 직접 수집하려고 BeyondTrust 어플라이언스의 관리용 CLI인
            `/ns/sbin/bt-secrets`를 이용했다.
          - Mandiant는 공격자가 설정 템플릿을 바꿔 site service account에 암호 없는 root 권한을 부여하고,
            내부 엔드포인트에 원격 지원 세션을 설정했다고 관찰했다. 이어 내장 지원 도구로 전체 파일 시스템 접근 권한을 얻고, 파일
            전송 서비스로 사용자 데스크톱에서 소프트웨어 목록 등 내부 문서를 내려받아 유출했다.
          - Mandiant는 공격자가 `/ns/config/haproxy.conf`를 수정해 BARECLAW 터널러가 인터넷에서 직접
            접근되도록 했고, 어플라이언스 로그와 엔드포인트 흔적도 삭제했다고 보고했다. GTIG는 취약점 제로데이 악용과
            SAWFLY·BARECLAW 배치를 ARMORY CASTLE에 귀속했다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-beyondtrust/
      - heading: 패치와 복구 지침
        paragraphs:
          - BeyondTrust는 Remote Support SaaS 전체 테넌트에 2026년 10월 9일 BT26-05 패치를
            적용했다고 밝혔다. SaaS 어플라이언스 자체에 고객 조치는 필요 없지만 자격 증명과 설정 검토 단계는 여전히 적용된다.
          - 자체 호스팅 버전 24.3.1 이상은 `/appliance`에서 BT26-05-RS를 적용하고, 자동 업데이트에 가입한
            경우에는 자동 적용 여부를 확인하도록 권고됐다. 24.3.1보다 오래된 버전은 지원 버전으로 올린 뒤 패치해야 하며,
            업그레이드만으로 이전 노출이 해결되지는 않는다.
          - 변경이나 재부팅 전에는 가상 어플라이언스의 메모리 스냅샷과 디스크를 보존하고, B Series 하드웨어와 SaaS 테넌트는
            BeyondTrust 지원팀에 포렌식 보존을 요청하도록 안내됐다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-beyondtrust/
      - heading: 자격 증명과 접근 기록 점검
        paragraphs:
          - 지침은 패치·재구축을 마친 뒤 `/appliance` 관리자, `/login` 관리자·로컬 사용자, API 비밀정보, 보안
            제공자 계정·SAML 서명 키, Remote Support Vault와 연동 Password Safe·PRA의 대상 시스템
            자격 증명, SMTP·syslog·ITSM 등 통합 자격 증명, 노출 기간 지원 세션에 입력된 자격 증명을 의존 순서대로
            교체하도록 권고했다. 먼저 교체하면 아직 어플라이언스를 제어하는 공격자에게 새 자격 증명이 노출될 수 있다.
          - 지침은 `/login` 설정을 노출 전 기준선과 대조해 사용자·역할 변경, 특히 Jump Item 역할의 관리자 승격,
            그룹·세션 정책, API 계정, 보안 제공자, Jump Items·Jumpoints와 외부 이벤트·syslog 전송 대상을
            검토하도록 권고했다. 변경 기록이나 지정된 소유자가 없는 항목은 제거하도록 했다.
          - 악용 기간의 지원 세션 보고서와 파일 전송 기록으로 접근된 엔드포인트와 반출된 자료를 확인하고, 접촉된 모든 엔드포인트를
            후속 조사 범위에 포함하도록 했다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-beyondtrust/
      - heading: 재배포와 재연결 조건
        paragraphs:
          - 지침은 침해가 확인됐거나 침해 여부가 불명확한 어플라이언스를 깨끗하고 완전히 패치된 이미지로 재배포하도록 권고했다. 고객이
            호스트 파일 시스템을 감사할 수 없고 호스트 수준의 지속성이 재부팅·설정 초기화 뒤에도 남기 때문이다.
          - 설정 백업은 노출 기간 이전 것을 복원하거나, 최신 백업을 격리 상태에서 복원한 뒤 지침의 Option 3, Part B
            검토를 끝내고 나서 연결을 재개하도록 했다. 새 TLS 인증서를 발급하고 재구축한 어플라이언스에서 Jump
            Clients·Jumpoints·담당자 콘솔을 다시 배포하는 조치도 권고했다.
          - 보고서는 추가 통제 조치가 노출과 침해 후 영향을 줄이지만 패치를 대신하지는 않는다고 명시했다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-beyondtrust/
    papers: []
    relations: []
    topic_ids: []
  - title: FDA, 특정 국소 진행성 직장암에 Jemperli 단독요법 가속 승인
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미국 FDA, GSK
      when: 2026-10-19
      where: 미기재
      what: FDA가 특정 dMMR 또는 MSI-H 국소 진행성 직장암 성인 환자에게 Jemperli 단독 사용을 가속 승인했다.
      how: AZUR-1 2상 시험의 중간 결과를 근거로 승인했다.
      why: 일부 환자가 수술·방사선 치료·화학요법을 피할 수 있는 선택지를 제공할 수 있다.
    lead: 미국 FDA는 2026년 10월 19일, 이전 치료를 받지 않은 성인 중 FDA가 허가한 검사에서 dMMR 또는 MSI-H 종양이
      확인된 2기 또는 3기 국소 진행성 직장암 환자의 Jemperli(dostarlimab-gxly) 단독 사용을 가속 승인했으며, 승인
      수령자는 GSK다. 이 용법은 일부 환자에게 수술·방사선 치료·화학요법을 피할 선택지를 제공할 수 있지만, 승인은 AZUR-1 중간
      결과에 근거하며 지속적인 임상적 이득을 입증하기 위한 후속 추적이 필요하다.
    explanations:
      - heading: 기존 치료의 부담과 약물 작용
        paragraphs:
          - 국소 진행성 직장암 환자는 수술 전에 화학요법과 방사선 치료를 받는 경우가 많고, 이 과정은 장·비뇨기·성 기능과 생식력에
            영향을 줄 수 있다. 수술에는 회복 불량, 장 연결부 누출, 일부 환자의 영구 장루를 비롯해 때로 생명을 위협하는 중대한
            합병증 위험도 있다.
          - 발표된 추정치상 국소 진행성 직장암의 약 3%가 dMMR 또는 MSI-H에 해당한다. Jemperli는 면역세포의 PD-1
            단백질을 표적으로 삼아 암세포가 면역계를 피하는 데 이용하는 신호를 차단한다.
        source_urls:
          - https://www.fda.gov/news-events/press-announcements/fda-approves-immunotherapy-may-allow-certain-patients-rectal-cancer-avoid-chemotherapy-radiation-and
      - heading: 서로 다른 두 연구의 추적 결과
        paragraphs:
          - FDA가 근거로 삼은 AZUR-1은 이전 치료를 받지 않은 dMMR 또는 MSI-H 국소 진행성 직장암 환자 154명을
            대상으로 Jemperli 단독 사용을 평가한 2상 연구다. 환자들은 6개월 동안 3주마다 최대 9회 투여받았으며, 중앙
            추적 기간이 2년을 넘었을 때 거의 4분의 3은 수술·방사선 치료·화학요법이 필요하지 않았다.
          - 별도의 앞선 Memorial Sloan Kettering Cancer Center 연구는 같은 미치료 dMMR 또는
            MSI-H 국소 진행성 직장암 환자 50명을 평가했다. 치료 후 암 징후가 검출되지 않았고 93%는 그 상태를 최소
            12개월 유지했으며, 최소 3년 추적한 27명 중 한 명에게 같은 부위의 재발이 보고됐다.
        source_urls:
          - https://www.fda.gov/news-events/press-announcements/fda-approves-immunotherapy-may-allow-certain-patients-rectal-cancer-avoid-chemotherapy-radiation-and
      - heading: 가속 승인 뒤 남은 확인과 안전성
        paragraphs:
          - FDA는 AZUR-1에서 반응이 얼마나 지속되고 암이 얼마나 자주 재발하는지 파악하려면 더 긴 추적이 필요하다고 밝혔다.
            중간 결과에 따른 가속 승인인 만큼, 후원사는 반응이 지속적인 임상적 이득으로 이어지는지 보여주기 위해 환자 추적을
            계속해야 한다.
          - Jemperli는 면역계가 건강한 장기와 조직을 공격하게 할 수 있으며, 이런 반응은 중증이거나 치명적일 수 있다. 이
            직장암 환자군에서 15% 이상에게 보고된 흔한 부작용은 피로, 발진, 설사, 가려움증이었다.
        source_urls:
          - https://www.fda.gov/news-events/press-announcements/fda-approves-immunotherapy-may-allow-certain-patients-rectal-cancer-avoid-chemotherapy-radiation-and
    papers: []
    relations: []
    topic_ids: []
  - title: 항우연, 누리호 단 조립 치공구 129종 순천으로 이송
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 한국항공우주연구원
      when: 2026년 10월 19일 발표; 누리호 비행모델 6호기는 2027년 발사 예정
      where: 순천 단조립장; 조립한 각 단은 나로우주센터로 이송 예정
      what: 단 조립용 치공구 129종을 한화에어로스페이스에 무상 대여하기 위해 이송 완료
      how: 순천에서 각 단을 조립하고 해상으로 나로우주센터에 옮겨 결합할 계획이며, 항우연이 기술 감리와 현장 지원을 제공할 예정
      why: 민간이 누리호 조립 역량과 현장 경험을 축적하도록 지원
    lead: 한국항공우주연구원은 2026년 10월 19일 누리호 단 조립용 치공구 129종을 한화에어로스페이스에 무상 대여하기 위해 순천
      단조립장으로 이송했다고 밝혔다. 2027년 발사 예정인 누리호 비행모델 6호기부터 1·2·3단을 순천에서 각각 조립하고, 각 단을
      해상으로 나로우주센터에 옮겨 결합한 뒤 발사 전 준비를 진행할 예정이다. 항우연은 장비 대여와 함께 기술 감리와 현장 기술 지원을
      제공해 민간의 조립 역량 축적을 도울 계획이다.
    explanations:
      - heading: 치공구의 배분과 역할
        paragraphs:
          - 항우연이 보유한 치공구는 모두 204종이며, 이 가운데 단 조립에 활용되는 129종을 순천으로 옮겼다. 나머지는
            나로우주센터 발사체종합조립동에 보관해 누리호 전기체 총조립에 사용할 예정이다.
          - 치공구는 발사체 부품을 옮기거나 자세를 유지하고 정밀하게 조립·가공하는 장비와 도구다. 조립 과정에서 결합 부위를 정렬하고
            품질을 유지하는 데 쓰인다.
        source_urls:
          - https://www.kari.re.kr/kor/article/ATCL87374b48c/18740
      - heading: 현장 경험 전수 계획
        paragraphs:
          - 항우연은 조립 중 발생하는 문제의 원인을 분석하고 해결 방안을 찾는 과정을 현장에서 공유할 계획이다. 문서나 장비 전달에
            더해 실제 문제 해결 경험을 전수해 민간이 조립 역량을 쌓도록 지원한다.
        source_urls:
          - https://www.kari.re.kr/kor/article/ATCL87374b48c/18740
    papers: []
    relations: []
    topic_ids: []
  - title: MIT 등, 태아 머리 대칭을 반영한 MRI 모델 E(3)-Pose 개발
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: MIT, Boston Children’s Hospital, Inria 연구진
      when: 2026-10-19
      where: 미기재
      what: 움직이는 태아 머리의 MRI 영상화를 돕는 딥러닝 모델 E(3)-Pose 개발 및 훈련
      how: 태아 머리의 좌우 대칭을 신경망 구조에 내장
      why: 미기재
    lead: MIT News는 2026년 10월 19일 MIT·Boston Children’s Hospital·Inria 연구진이 움직이는 태아
      머리를 영상화해 방사선 전문의가 살펴볼 고해상도 이미지를 얻도록 돕는 딥러닝 모델 E(3)-Pose를 개발하고 훈련했다고 소개했다.
      이 모델은 태아 머리의 좌우 대칭을 신경망 구조에 내장해 뇌의 방향을 파악하기 쉽게 한다.
    explanations:
      - heading: 움직임이 만드는 영상 공백
        paragraphs:
          - 태아 MRI는 여러 2D 영상 조각을 쌓아 고해상도 3D 머리 영상으로 구성한다. 촬영 중 머리가 움직이면 조각마다 각도가
            달라져 최종 영상에 공백이나 비정상적인 방향이 생길 수 있고, 의사가 태아 뇌 병리를 놓치거나 잘못 진단할 가능성이 있다.
        source_urls:
          - https://news.mit.edu/2026/teaching-ai-about-symmetry-could-make-prenatal-diagnosis-more-reliable-1019
      - heading: 학회 공개와 훈련 범위
        paragraphs:
          - 연구 논문은 2026 European Conference on Computer Vision에서 발표됐다.
          - 모델은 주로 임신 후기인 3기 태아 자료로 훈련됐다. Muthukrishnan은 임신 중기인 2기 또는 그보다 이른 임신
            시기의 태아 영상화에도 도움이 되도록 모델을 개선하고 싶다고 밝혔다.
        source_urls:
          - https://news.mit.edu/2026/teaching-ai-about-symmetry-could-make-prenatal-diagnosis-more-reliable-1019
      - heading: MRI 자동화에 대한 전망
        paragraphs:
          - Boston Children’s Hospital의 Fetal Neonatal Neuroimaging and
            Developmental Science Center를 이끄는 Ellen Grant는 이 연구가 태아 뇌 MRI를 자동화해
            느린 수동 절차를 대체하고, 산모에게 더 빠르고 편안한 촬영과 판독자를 위한 고품질 영상을 제공할 것이라고 전망했다.
        source_urls:
          - https://news.mit.edu/2026/teaching-ai-about-symmetry-could-make-prenatal-diagnosis-more-reliable-1019
    papers: []
    relations: []
    topic_ids: []
  - title: PMO-DDPG, 자동차 점용접 궤적 계획에서 SAC 대비 지표 개선 보고
    kind: 사건 뉴스
    region: 해외
    facts:
      who: PMO-DDPG 연구 저자
      when: 2026년 10월 20일
      where: Webots 시뮬레이션 및 자동차 점용접 산업 시험 환경
      what: 자동차 점용접 협동로봇의 궤적 계획을 위한 PMO-DDPG 프레임워크와 평가 결과를 발표했다.
      how: 결정론적 액터, 정확도·부드러움·안전·생산성별 비평가 4개, 단계별 선호도, 파레토 정책 아카이브를 결합했다.
      why: 정확도·안전·생산성을 함께 고려하는 궤적 계획을 구현하기 위해서다.
    lead: 2026년 10월 20일 공개된 논문은 자동차 점용접 협동로봇의 궤적 계획을 위해 PMO-DDPG를 제안했다. 논문은 Soft
      Actor-Critic(SAC) 기준으로 궤적 오차 66.4%, 충돌률 82.1%, 에너지 소비 15.5%, 사이클 시간 22.0%,
      추론 지연 22.7%를 낮추고 성공률은 7.5퍼센트포인트 높였다고 보고했다. 동일 연구 내 5회 독립 학습 실행의 평균±표본표준편차는
      궤적 오차 1.08±0.29 mm, 충돌률 1.2±0.5%, 에너지 3.65±0.28 kJ, 사이클 시간 3.87±0.25초, 성공률
      94.6±1.8%, 추론 시간 21.5±1.6 ms였다. 저자들은 비전 유도 점용접 산업 시험 100회에서 밀리미터 미만 위치
      정밀도와 반복 가능한 용접을 확인했다고 보고했으며, 방법 간 차이에 대한 공식 유의성 검정은 하지 않았다고 밝혔다.
    explanations:
      - heading: 방법과 비교 조건
        paragraphs:
          - PMO-DDPG는 정확도·부드러움·안전·생산성에 특화된 비평가 4개를 사용하고, 접근·정렬·용접·후퇴 단계에 따라 선호도를
            조정한다. 여섯 개의 정규화된 물리 보상 요소와 파레토 선택을 활용하면서 온라인 추론은 액터만으로 수행하도록 설계됐다.
          - 시뮬레이션은 저항 점용접 건을 장착한 6자유도 협동로봇과 차량 차체에 배치된 사전 정의 용접 지점 20개를 사용했다. 각
            학습 방법은 최대 500스텝인 에피소드 2,000회로 학습하고 독립 실행 5회로 평가했다.
          - 학습 기반 방법은 같은 용접 환경, 상태·행동 정의, 학습 예산, 종료 기준, 보상 구성과 평가 절차로 재평가됐다. 기존
            궤적 계획기는 같은 작업 공간과 물리 지표로 평가했으나 RL 학습 예산은 배정하지 않아, 결과는 연구 안에서 통제한 기술적
            비교다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1939068/full
      - heading: 산업 시험 결과
        paragraphs:
          - 실제 시험에서는 비전 시스템이 용접 목표를 찾고 로봇 툴 중심점과 목표 위치의 오프셋을 추정한 뒤, 생성된 궤적을
            실행하면서 계획 움직임과 실제 움직임을 기록했다. 이 산업 현장 반복 시험은 100회 수행됐으며, 신뢰구간과 여러
            현장에서의 재현 검증은 향후 과제로 남았다.
          - 논문이 제시한 용접 직전 사례의 위치 오차는 X 0.19 mm, Y −0.17 mm, Z 0.12 mm였고 각도 오차는
            0.22°였다. 반복 물리 시험 100회에서는 세 방향의 위치 오차가 모두 약 0.4 mm 미만으로 유지돼 약 0.2 mm
            부근에서 안정화됐으며, 각도 오차는 약 0.2° 주위에서 변동했다.
          - 보고된 정밀도에서 평균 에너지 소비 3.65 kJ는 Recurrent SAC와 동률이었다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1939068/full
      - heading: 해석 범위
        paragraphs:
          - 연구 결과는 cobot 한 대와 점용접 셀 한 곳, 정적 장애물, 사전 정의된 용접 순서와 한 세트의 물리 시험 100회에
            한정된다. 동적 사람 움직임, 다중 로봇 간섭, 장기 전극 열화는 평가하지 않았다.
          - 독립 실행은 방법별 5회였고 공식 가설 검정은 없었으므로, 보고된 방법 간 차이는 통계적 유의성이 확인된 결과가 아니다.
            평균 추론 시간 21.5 ms도 100 Hz 제어가 의미하는 하드 10 ms 마감시간을 충족한다는 증거로 해석할 수 없다고
            논문은 명시했다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1939068/full
    papers: []
    relations: []
    topic_ids: []
  - title: 로봇 비행선으로 ALICE 검출기 동굴의 누설 자기장 측정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 연구진
      when: 2026년 10월 16일 공개
      where: ALICE 검출기 동굴
      what: 로봇 비행선으로 3차원 누설 자기장을 측정하고 전자기 시뮬레이션과 비교한 연구
      how: 3축 Hall-effect 센서와 ArUco 마커 기반 시각 위치추정을 결합해 정적 측정과 동적 비행을 수행
      why: 미기재
    lead: 2026년 10월 16일 공개된 연구에서 연구진은 ALICE 검출기 동굴의 3차원 누설 자기장을 측정하기 위해 3축
      Hall-effect 센서와 ArUco 마커 기반 시각 위치추정을 결합한 로봇 비행선을 제시했다. 자석을 명목 전류로 운전한 상태에서
      센서 정확도와 위치추정 불확실성을 분리하는 정적 측정과 같은 계측 영역의 동적 비행 캠페인을 수행했으며, 정적 측정은 ArUco 마커
      20곳에서 각각 30초간 진행됐다. 논문은 전자기 시뮬레이션과 측정값의 일치도를 횡방향 성분에서 R² 0.86–0.98, 수직
      성분에서 R² 0.75–0.79로 보고했고, 수직 성분에는 0.65–1.12 mT의 체계적인 양의 편향이 있었다고 설명했다. 비행
      시험은 ALICE 자석이 명목 전류로 작동하고 L3 솔레노이드와 전방 쌍극자가 모두 음극성인 상태에서 2026년 2월 4일과 5월
      22일, 총 네 차례 진행됐다.
    explanations:
      - heading: 실험 구성과 측정 범위
        paragraphs:
          - CST 전자기 모델은 동굴의 국소 강자성 구조물과 시공 오차, 시뮬레이션 형상에 포함되지 않은 인접 자석의 영향을 반영하지
            못하는 단순화 모델이다. 연구진은 시뮬레이션과 실제 환경의 차이를 살피기 위해 두 차례 실험 캠페인을 구성했다.
          - 동적 시험에서는 Hall 센서 불확실성뿐 아니라 ArUco 위치추정 불확실성도 시뮬레이션과의 비교에 영향을 미쳤다. 비행은
            검출기 출입문 옆 콘크리트 차폐 블록 위의 주 비행 구역에서 수동으로 이뤄졌고, 정적 캠페인에 사용한 두 마커 스트립을
            따라 진행됐다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1926428/full
      - heading: 불확실성 산정의 조건
        paragraphs:
          - ALICE 기준 좌표계 변환은 캠페인 내내 고정돼 있었고 문서화된 허용오차가 없어 불확실성 전파에서 제외됐다. CAD
            형상과 실제 시설의 차이는 모든 측정 지점에 공통된 편향으로 나타날 것으로 예상됐다.
          - 카메라와 센서 사이의 변환도 고정돼 있고 문서화된 허용오차가 없어 이상적인 변환으로 취급해 산정에서 제외했다. 기계 조립
            정밀도가 밀리미터 수준이므로 그 영향은 다른 요인보다 작을 것으로 예상됐다.
          - 위치추정 특성은 ALICE 동굴에서 외부 기준 측정 시스템을 설치하기 어려워 통제된 환경에서 확인했다. 마커 배치, 비행선
            플랫폼, 카메라와 위치추정 파이프라인을 동일하게 재현했지만, 산정된 불확실성은 현장 조건을 대표하는 추정치이며 실제
            운용값과 다를 수 있다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1926428/full
      - heading: 측정값과 시뮬레이션 비교
        paragraphs:
          - 정적 시험에서는 시뮬레이션 값이 한 자기장 성분에서 20개 측정 지점 모두의 Hall 센서 불확실성 범위에 들었고, 다른
            성분에서는 20곳 중 18곳, 나머지 성분에서는 20곳 중 8곳에서 범위에 들었다. 논문은 이에 해당하는 비율을 각각
            100%, 90%, 40%로 제시했으며, 세 번째 성분의 차이가 더 컸다고 보고했다. 연구진은 강자성 요크와 관련된 모델링
            오차 가능성을 언급했지만 센서 오프셋·정렬 또는 좌표 변환 오류의 영향을 배제하지 못했다.
          - 네 차례 비행에서 얻은 유효 지점 858개를 합산한 분석에서, 논문은 성분별 불확실성 범위에 대한 포함 기준을 만족한
            비율을 89.4%, 79.3%, 55.4%로 보고했다. 가장 낮은 성분의 결과는 정적 시험의 40%와 비슷하다고 설명했다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1926428/full
      - heading: 현재 제약과 다음 단계
        paragraphs:
          - 비행 중 ArUco 마커가 카메라 시야에 없으면 센서 위치를 알 수 없어 Hall 센서 측정값을 공간 좌표에 연결할 수
            없다. 네 차례 수동 비행은 계측된 시험 구역에서 측정·위치추정 방법을 보였지만 동굴 전체를 조사한 것은 아니다.
          - 연구진이 계획한 주요 발전 방향은 ArUco 기반 위치추정 파이프라인을 폐루프 위치 제어기 및 자기장 인식 경로 계획기와
            통합해 자율 운용으로 전환하는 것이다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1926428/full
    papers: []
    relations: []
    topic_ids: []
  - title: Agility Robotics, Digit 5 공개…사람 곁 작업과 물류 업무 겨냥
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Agility Robotics
      when: 2026년 10월 19일
      where: 미기재
      what: Digit 5 공개
      how: 사람 감지 센서와 모터 차단 동작, 모듈형 설계, 급속 충전 시스템을 갖추도록 설계
      why: 사람과 함께 작업하며 물류 현장의 무거운 작업을 수행하는 범용 로봇으로 발전시키기 위해
    lead: Agility Robotics는 2026년 10월 19일 Digit 5를 공개했으며, 회사는 이 로봇이 유용한 작업을 안전하고
      경제적으로 대규모 수행하도록 설계됐다고 밝혔다. 공동창업자에 따르면 Digit 5는 23kg 상자를 높은 선반에 올리도록 설계됐고,
      9분 충전으로 90분 작동하는 것이 목표이며, 회사는 Digit 4 EVT의 상업 배치에서 배운 점을 바탕으로 첫 10개 사용 사례에
      맞춰 로봇을 처음부터 설계했다. 공동창업자는 Agility Robotics의 Salem 소재 RoboFab이 7만 제곱피트 규모로
      연간 Digit 5를 1만 대 초과 생산할 수 있다고 설명했다. 공동창업자는 유럽 CE 규정 준수, 북미 UL 전기 안전 인증과
      FCC 전자파 한계가 고객 현장 배치를 위한 필수 요구사항이었다고 설명했다.
    explanations:
      - heading: 사람이 가까이 오면 작업을 멈추도록 설계
        paragraphs:
          - Digit 4의 상업 배치에서는 보험과 규제 요구를 충족하기 위해 로봇과 사람 사이에 물리적 장벽을 둬야 했다.
            공동창업자는 이를 배경으로 사람 주변에서 안전하게 작동하도록 하는 일을 Digit 5의 주요 설계 목표로 삼았으며,
            Agility Robotics가 이 과제에 2년을 들였다고 밝혔다.
          - 사람 위치를 감지하는 센서가 사람이 다가오는 것을 포착하면, 사람이 로봇을 만지기 전에 작업을 멈추고 화물을 내려놓은 뒤
            바닥에 앉아 모터 전원을 끊도록 설계됐다. 공동창업자는 이를 사람과 함께 작업할 때 위험을 검증 가능한 방식으로 줄이기
            위한 단기 접근법으로 설명했다.
        source_urls:
          - https://spectrum.ieee.org/agility-robotics-digit-5-redesign
      - heading: 무거운 작업을 위한 구조와 충전
        paragraphs:
          - 공동창업자는 Digit 5의 무게가 120kg을 초과하며, 23kg 상자를 반복해서 들고 1.75m 높이의 선반에 닿는
            작업을 하루 20시간 수행하도록 설계했다고 설명했다. 배터리와 냉각 시스템은 몸통의 약 75%를 차지한다.
          - 충전 도크는 48V에서 240A를 공급하도록 계획됐고, 몸통의 냉각 통로로 강한 팬이 공기를 보내 배터리 과열을 막도록
            설계됐다. 회사가 밝힌 90분 작동과 9분 완전 충전은 설계 목표다.
          - 다만 늘어난 몸체 부피 때문에 Digit 5는 이전 세대처럼 달리거나 점프할 수 없다고 공동창업자는 밝혔다.
        source_urls:
          - https://spectrum.ieee.org/agility-robotics-digit-5-redesign
      - heading: 작업 자세와 향후 기능
        paragraphs:
          - Digit 5는 이전 버전의 타조형 다리 대신 사람과 비슷한 다리 구성을 채택했다. 쪼그려 앉을 때 발목이 바닥에 부딪히는
            문제를 피하고, 무릎과 엉덩이 모터가 함께 토크를 내 일어서는 동작을 돕도록 한 설계다.
          - 회사는 상자 운반 외에도 개별 물품 집기, 머신 텐딩, 조립 부품 준비와 배송, 장기적으로는 조립 작업을 로드맵에
            포함했다. 교체 가능한 도구 인터페이스와 모듈형 설계로 하위 시스템을 점진적으로 업그레이드하고, 향후 행동 학습을 위한
            데이터 플랫폼으로 활용하는 것도 계획하고 있다.
        source_urls:
          - https://spectrum.ieee.org/agility-robotics-digit-5-redesign
    papers: []
    relations: []
    topic_ids: []
  - title: 한국생명공학연구원, 항암 작용·영상 추적 결합 후보물질 BF-04 개발
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 한국생명공학연구원 화학생물연구센터 성낙균 박사 연구팀
      when: 2026년 10월 19일 발표
      where: 미기재
      what: 암 치료와 실시간 진단을 결합하는 항암 효능물질 BF-04를 개발했다고 발표했다.
      how: 암세포·환자 유래 암 오가노이드·동물모델에서 평가하고, Cy5 또는 ⁸⁹Zr를 도입해 영상으로 종양과 약물 분포를 확인했다.
      why: 성낙균 연구책임자는 정밀 암 치료제 개발 등에 활용될 수 있을 것으로 기대한다고 밝혔다.
    lead: 한국생명공학연구원 화학생물연구센터 성낙균 박사 연구팀은 2026년 10월 19일 항암 작용과 실시간 영상 진단을 결합하는 후보물질
      BF-04를 개발했다고 밝혔다. 연구팀은 암세포·환자 유래 암 오가노이드·동물모델에서 이 물질을 평가했으며, 형광물질 또는 방사성
      동위원소를 도입해 암 조직의 위치와 약물 분포를 영상으로 확인했다고 보고했다.
    explanations:
      - heading: 암세포에서 확인한 작용과 종양 축적
        paragraphs:
          - BF-04는 튜불린 단백질에 결합해 세포분열에 필요한 미세소관 형성을 방해하고 암세포 분열 억제와 세포사멸을 유도했다.
            연구팀은 기존 미세소관 표적 항암제에 내성을 보이는 암세포에서도 활성이 나타났다고 보고했다.
          - 동물모델에서는 항체나 나노입자 전달체 없이 종양 조직에 선택적으로 축적되는 양상이 관찰됐다. 항암 효과와 표적화 특성의
            확인은 세포·오가노이드·동물모델을 활용한 실험 범위의 결과다.
        source_urls:
          - https://www.bioin.or.kr/rsrch_Rslt.do?num=317183&cmd=view&bid=research&cPage=1&listCnt=50
      - heading: Cy5 광학영상과 ⁸⁹Zr PET 영상
        paragraphs:
          - 영상 확인을 위해 BF-04에 Cy5 또는 ⁸⁹Zr를 도입했다. Cy5 도입형은 광학영상, ⁸⁹Zr 도입형은 PET 영상이
            가능한 트레이서로 작용하며 생체 내 종양에 축적됐다.
          - 연구팀은 분자 영상 장비로 주사 후 최대 4일 동안 약물이 암 조직에 머물며 작동하는 과정을 실시간으로 추적할 수 있었다고
            밝혔다. 이 추적 결과는 동물모델을 활용한 전임상 연구에서 얻었다.
        source_urls:
          - https://www.bioin.or.kr/rsrch_Rslt.do?num=317183&cmd=view&bid=research&cPage=1&listCnt=50
      - heading: 결합 분석과 논문 공개
        paragraphs:
          - 연구자료에는 DiffDock 도킹 모델을 통한 BF-04와 튜불린 이합체의 결합 예측, BLItz의 bio-layer
            interferometry를 이용한 결합 친화도 분석이 각각 제시됐다.
          - 논문은 Acta Pharmaceutica Sinica B 9월 온라인판에 게재됐으며, BRIC의 ‘한국을 빛낸 사람들’에도
            소개됐다.
        source_urls:
          - https://www.bioin.or.kr/rsrch_Rslt.do?num=317183&cmd=view&bid=research&cPage=1&listCnt=50
    papers: []
    relations: []
    topic_ids: []
  - title: 파푸아뉴기니 산불 탄소 배출, 10월 중순 누적 동기 최고 추정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 뉴기니의 산불. 보고서에는 파푸아뉴기니와 인도네시아령 파푸아의 화재·배출량이 포함됐다.
      when: 2026년 9~10월 발생 상황을 2026년 10월 22일 보도. 파푸아뉴기니 배출량은 10월 17일까지 추정됐다.
      where: 뉴기니섬, 특히 파푸아뉴기니와 인도네시아령 파푸아
      what: 산불과 연기로 대기오염이 발생했고, 파푸아뉴기니와 인도네시아령 파푸아의 산불 탄소 배출량이 높은 수준을 기록했다.
      how: 가뭄과 강한 엘니뇨가 이어지는 가운데 산불이 번졌다. 연구자들은 뉴기니 화재의 대다수가 사람에 의해 시작된다고 말한다.
      why: 연구자들은 엘니뇨에 따른 강수 패턴 변화로 비정상적으로 건조한 날씨가 이어져 생태계가 불에 취약해졌다고 설명했다.
    lead: NASA 지구관측소는 2026년 10월 22일, 가뭄과 강한 엘니뇨가 이어진 9~10월 뉴기니에서 산불이 번지고 연기가 수 주 동안
      넓은 지역을 뒤덮었다고 전했다. GFED 추정에 따르면 파푸아뉴기니 산불의 탄소 배출량은 10월 17일까지 32메가톤에 가까워 연중
      같은 시점 기준 역대 어느 해보다 많았고, 화재 과학자 귀도 판데르베르프는 2015년 연간 총량을 이미 크게 넘어섰으며 2026년이
      1997년을 넘어 연간 최고치가 될 가능성이 매우 높다고 말했다. 인도네시아령 파푸아의 탄소 배출량은 35메가톤을 초과해 2015년과
      1997년에 이어 세 번째로 높았다고 보고서는 밝혔다. 대기오염으로 항공편이 지연·취소되고 학교가 문을 닫았으며, 일부 지역 당국은
      어린이와 고령자에게 마스크 착용을 권고했다.
    explanations:
      - heading: 가뭄과 화재의 양상
        paragraphs:
          - 파푸아뉴기니 최남단 트랜스플라이 지역은 90일 넘게 비가 오지 않았고, 기상청 자료상 이 지역 일부의 8월 이후 강수량은
            평년의 약 5~10%였다. 현지 언론은 가뭄으로 작물 피해와 물 부족, 휴교가 발생했다고 보도했다.
          - 연구자들은 뉴기니 화재의 대다수가 사람이 점화한 것이라고 설명하며, 농작물 소각, 목초지 관리, 산림 벌채와 개간, 사냥
            등을 흔한 이유로 들었다. 건조한 조건에서는 관리 목적의 불이 통제되지 않는 산불로 번지기도 한다.
        source_urls:
          - https://science.nasa.gov/earth/earth-observatory/fires-char-new-guinea/
      - heading: 배출량 추정과 산림 변화
        paragraphs:
          - GFED는 위성 원격탐사와 식생 특성 등의 정보를 결합해 식생 화재의 범위와 배출량을 추정하는 모델링 체계다. 인도네시아령
            파푸아에서는 지난 20년 동안 산업용 기름야자·펄프재 농장, 소규모 경작지 이동, 도시 확장과 채굴을 위해 토지가
            개간됐다.
          - Global Forest Watch에 따르면 인도네시아령 파푸아는 2025년 원시림 2만7,000헥타르를 잃었다. 이는
            2024년의 거의 두 배이며 2017년 이후 가장 큰 면적이다.
          - 양 첸 캘리포니아대학교 어바인 연구원은 2026년 파푸아뉴기니와 동부 인도네시아, 특히 인도네시아령 파푸아와 칼리만탄의
            화재 활동이 수마트라와 서부 인도네시아 다른 지역보다 이례적으로 활발하다고 말했다.
        source_urls:
          - https://science.nasa.gov/earth/earth-observatory/fires-char-new-guinea/
      - heading: 우기 전까지 이어질 가능성
        paragraphs:
          - 연구자들은 뉴기니 남부의 우기가 시작되어 많은 비가 내릴 때까지 산불이 계속될 것으로 예상했으며, 우기는 보통 11월 초에
            시작된다.
          - 인도네시아에서는 대규모 기름야자·사탕수수·펄프재 농장들이 자산 보호를 위해 자체 소방대를 두는 경우가 많다고 필드는
            말했다. 그는 화재가 주로 관리되지 않는 지역이나 원시림 가장자리에서 관찰된다고 설명했다.
        source_urls:
          - https://science.nasa.gov/earth/earth-observatory/fires-char-new-guinea/
    papers: []
    relations: []
    topic_ids: []
  - title: 로봇 심초음파 AI, 건강인 영상에서 위양성률 낮춘 도메인 적응 연구
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 연구진
      when: 2026-10-21
      where: 일본
      what: 병원에서 학습한 심초음파 벽운동 이상 탐지 모델을 로봇 초음파에 적응시키는 적대적 도메인 적응 기법을 평가했다.
      how: 3D ResNet-18과 gradient-reversal 도메인 판별기를 사용하고, 로봇 촬영 대상자 단위의
        leave-one-subject-out 검증을 수행했다.
      why: 병원에서 학습한 모델을 로봇 촬영에 직접 적용했을 때 정상 사례 특이도가 낮아지는 도메인 차이에 대응하기 위해서다.
    lead: 연구진은 2026년 10월 21일 공개된 논문에서 병원과 로봇 심초음파 영상의 특징을 정렬하는 적대적 도메인 적응 방법을 제안했다.
      건강한 로봇 촬영 대상자에서 Normal-only DANN은 직접 전이보다 위양성률을 34.3%에서 10.7%로 낮췄지만, 병리 로봇
      사례가 없어 민감도 평가와 임상 사용을 위한 검증은 남아 있다.
    explanations:
      - heading: 자료와 검증 단위
        paragraphs:
          - 병원 자료는 심초음파 검사 12,000건으로, 기본 모델 학습 10,000건·독립 시험 500건·도메인 특성 분석
            1,500건으로 나뉘었다. 분할은 환자 수준에서 이뤄져 집단 사이에 같은 환자가 겹치지 않았다.
          - 로봇 자료는 건강한 자원봉사자 15명에게서 얻은 뷰별 영상 클립 150개다. Waseda University Iwata
            Laboratory의 ORIZURU 플랫폼을 사용했으며, 촬영은 숙련 심장전문의 감독하에 수행됐고 자원봉사자 전원이 사전에
            서면동의했다.
          - 자료는 대상자·획득 세션·심초음파 뷰·클립·프레임의 계층으로 구성됐고, 모델 예측 단위는 클립, 통계 추론 단위는
            대상자였다. 대상자 단위 LOSO 검증의 각 회차에서 한 명을 시험용으로 남기고 나머지 열네 명 중 열두 명은 적응 학습,
            두 명은 검증에 썼다. 시험 대상자의 클립은 학습·검증·초모수 선택·조기 종료에 사용하지 않았다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1900388/full
      - heading: 도메인 차이와 두 적응 방식
        paragraphs:
          - 직접 적용한 병원 학습 모델의 특이도는 독립 병원 시험에서 90.6%였지만, 건강인 로봇 영상의 대상자 평균은
            65.7%였다. 논문은 두 특이도 값의 격차를 24.9퍼센트포인트로 보고했다.
          - 적응 구조는 3D ResNet-18과 기울기 반전 도메인 판별기로 병원·로봇 특징을 정렬하면서 병원 분류 학습 목표를
            유지한다. 이 설계는 라벨이 붙은 로봇 병리 사례 없이도 적응할 수 있도록 했다.
          - Mixed-DANN은 도메인 적대 손실에 병원의 심근경색 양성·정상 표본과 건강한 로봇 표본을 모두 썼다.
            Normal-only DANN은 그 손실을 병원 정상·건강한 로봇 표본으로 제한했지만, 분류 손실에는 여전히 병원
            양성·정상 표본을 모두 사용했다. 연구진은 질환 구성 차이의 잠재적 교란을 줄이기 위해 이 구성을 도입했다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1900388/full
      - heading: 건강인 결과와 병원 성능의 교환 비용
        paragraphs:
          - 건강한 로봇 대상자 15명의 LOSO 결과에서 정상 사례 특이도의 평균±표준편차는 직접 전이 65.7%±6.4%,
            Mixed-DANN 86.1%±4.3%, Normal-only DANN 89.3%±4.8%였다. 두 전략 모두
            Wilcoxon 검정 p값이 0.001 미만이고 순위 이분 상관 r은 1.0이었으며, 15명 전원의 특이도가 개선됐다.
          - Normal-only DANN의 위양성률 감소 폭은 23.6퍼센트포인트였다. 그 특이도 개선은 병원과 로봇 사이 특이도
            격차의 94.8%를 회복한 결과다.
          - 병원 성능은 동일한 독립 시험 500건·1,600클립에서 고정 판정 기준 0.50과 같은 전처리로 비교했다. 적응 후
            정확도·민감도·특이도 감소 폭은 Mixed-DANN이 각각 2.4퍼센트포인트·1.7퍼센트포인트·3.1퍼센트포인트,
            Normal-only DANN이 각각 1.2퍼센트포인트·0.7퍼센트포인트·1.6퍼센트포인트였다. AUROC도 기준 모델
            0.961에서 Mixed-DANN 0.948, Normal-only DANN 0.955로 낮아졌다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1900388/full
      - heading: 현재 적용 범위와 측정 한계
        paragraphs:
          - 로봇 집단은 병리 음성인 건강인뿐이어서 평가는 정상 사례 특이도와 위양성률에 한정됐다. 로봇 민감도는 평가하지 못했으며,
            임상 배포 전에는 벽운동 이상이 있는 로봇 촬영 사례로 검증해야 한다.
          - 기하학적 변동성은 로봇에서 관절 인코더로, 병원에서는 전문가가 평가한 뷰 일관성으로 간접 측정해 두 측정치를 직접 비교할
            수 없다. 병원 신뢰구간은 클립 수준에서 추정됐고 검사-클립 매핑이 보존되지 않아 같은 검사 내부의 군집성을 반영하지
            못했다.
          - 로봇 촬영은 PLAX·PSAX·A4CH의 세 표준 뷰만 포함했다. ASE 17분절 모형에 따른 포괄적 벽운동 평가에 중요한
            심첨부 2방(A2CH) 뷰는 빠져 있다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1900388/full
    papers: []
    relations: []
    topic_ids: []
  - title: 항우연, 제7회 초소형위성 경연대회 7개 팀 최종 선정
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 한국항공우주연구원
      when: 2026년 10월 22일
      where: 미기재
      what: 제7회 초소형(큐브)위성 경연대회의 초급 5개 팀과 고급 2개 팀, 총 7개 팀을 최종 선정했다고 발표했다.
      how: 1차 심사에서 14개 팀을 선정하고, 2차 심사에서 예비설계 서류·발표 평가를 통해 최종 7개 팀을 확정했다.
      why: 미기재
    lead: 한국항공우주연구원은 2026년 10월 22일 제7회 초소형(큐브)위성 경연대회에서 초급 5개 팀과 고급 2개 팀, 총 7개 팀을 최종
      선정했다고 밝혔다. 1차 심사에서 위성 임무와 기술 설계를 평가해 14개 팀을 선정한 뒤, 2차 심사에서 예비설계 서류·발표 평가를
      거쳐 최종 팀을 확정했다. 선정팀은 설계 검토와 제작, 우주환경시험 등을 거쳐 비행모델을 개발할 예정이며, 우주항공청과 항우연은
      기술·개발비를 지원하고 국내 발사체를 통한 발사 기회를 제공할 계획이다.
    explanations:
      - heading: 선정된 대학별 팀
        paragraphs:
          - 초급 부문에는 부산대 Plato Sat, 경희대 PADO-SAT, 제주대 Blue Orbit, 경상국립대 OFDIR,
            한국항공대 KAUSAIL이 선정됐다. 고급 부문은 연세대 CubeSat Yonsei와 조선대 OLIVESat이다.
        source_urls:
          - https://www.kari.re.kr/kor/article/ATCL87374b48c/18746
      - heading: 팀들이 제안한 위성 임무
        paragraphs:
          - 선정팀의 제안에는 우주환경 관측, 재난·미세먼지 감시, 레이저 광통신이 포함됐다. 이 가운데 기기 이상 감지와 데이터 압축
            등에 AI를 접목해 위성 임무 수행 효율을 높이려는 시도도 있다고 항우연은 전했다.
        source_urls:
          - https://www.kari.re.kr/kor/article/ATCL87374b48c/18746
    papers: []
    relations: []
    topic_ids: []
  - title: KRCERT, PHP2Shell 취약점 대응 위해 패치와 침해 흔적 점검 권고
    kind: 사건 뉴스
    region: 국내
    facts:
      who: KRCERT가 PHP 사용 기업에 보안 대응 수칙을 권고했다.
      when: 2026년 10월 22일 발표. 취약점 정보 유출일은 10월 20일이다.
      where: 미기재
      what: 로그인 없이 서버 명령을 실행할 수 있는 PHP 취약점 2건과 대응 권고를 알렸다.
      how: 해결 버전으로 업데이트하고 서비스 재시작 또는 컨테이너 이미지 재배포, 기록 점검, 증거 보존 및 인증정보 교체를 안내했다.
      why: 취약점 악용 시 서버 메모리에 있는 비밀번호, 토큰, API 키가 유출될 수 있기 때문이다.
    lead: KRCERT는 2026년 10월 22일 PHP에서 로그인 없이 외부 명령을 실행할 수 있는
      CVE-2026-109618·CVE-2026-109619 취약점이 발견됐으며, 심각도는 CVSS 9.2라고 밝혔다. 권고문은 PHP
      8.5.12, 8.4.27, 8.3.36, 8.2.35 이상을 해결 버전으로 제시하고, 호환성과 안정성을 검토한 뒤 패치를 적용하도록
      안내했다. 이 취약점은 서버 메모리의 비밀번호·토큰·API 키를 유출시킬 수 있으며, 기록에 이상이 없더라도 안전이 보장되지는 않아
      업데이트와 침해 점검, 인증정보 교체가 함께 권고됐다.
    explanations:
      - heading: 실제 웹 실행 환경의 패치 반영
        paragraphs:
          - 업데이트 후에는 PHP-FPM, Apache mod_php, php-cgi, FrankenPHP, LiteSpeed 등
            실제 PHP 웹 서비스를 재시작해야 하며, 그렇지 않으면 메모리에 남은 이전 버전이 계속 동작할 수 있다. 컨테이너는 신규
            이미지를 재배포해야 한다. 명령줄 php -v 결과와 웹 서비스의 실행 버전이 다를 수 있어, PHP가 여러 개 설치된
            서버는 각각 확인해야 한다.
          - 리눅스 배포판·제조사가 제공하는 보안 업데이트도 대응에 포함된다. 이런 패키지는 패치 뒤에도 버전 번호가 바뀌지 않을 수
            있으므로 패키지 변경 이력에서 해당 CVE 반영 여부를 확인해야 한다.
        source_urls:
          - https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72230
      - heading: 지원 종료 버전과 임시 설정
        paragraphs:
          - PHP 8.1 이하는 공식 업데이트가 제공되지 않아 지원 버전으로 전환해야 한다. PHP 8.2의 보안 지원은 2026년
            12월 31일 끝날 예정이므로 8.3 이상으로 전환하도록 권고했다. 전환에 시간이 걸리면 배포판·장기지원 업체의 패치나
            PHP 보안팀이 공개한 7.4·8.0·8.1용 소스 패치를 임시 적용하고 전환 계획을 세우도록 안내했다.
          - 공식 임시 설정은 php.ini, PHP-FPM pool 또는 웹 서버 설정에서
            session.upload_progress.enabled=0, memory_limit=-1을 적용하는 방식이다.
            memory_limit은 프로그램이 변경하지 못하도록 관리자 설정으로 강제하며, post_max_size를 낮게 두고
            upload_max_filesize를 그보다 작게 유지하도록 했다.
          - 업로드가 필요 없으면 post_max_size를 8M, 필요하면 32M 수준으로 두고, PHP 8.5에서는
            fatal_error_backtraces=0을 추가하도록 했다. 임시 설정은 공격을 완전히 막지 못하므로 패치 업데이트가
            필요하다.
        source_urls:
          - https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72230
      - heading: 침해 점검과 증거 보존의 순서
        paragraphs:
          - 취약점 정보 유출일인 10월 20일 이후의 기록 전체를 점검하고, 가능하면 그 이전 기록도 확인하도록 권고했다. 침해
            대응의 격리 단계에서는 서버 전원을 끄거나 재시작하지 말고 외부 네트워크 접속만 차단하며, 업데이트·재시작 전에 메모리 등
            공격 흔적을 확보해야 한다.
          - 증거 확보 뒤에는 업데이트·재시작, 웹셸 제거, 인증정보 교체를 진행하도록 안내했다. 업데이트 전까지 인터넷에 노출된
            서버에는 DB 비밀번호·외부 서비스 연동 키·관리자 계정 비밀번호 교체를 권장하고, 침해 흔적이 발견된 서버에는 반드시
            교체하도록 했다.
        source_urls:
          - https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72230
    papers: []
    relations: []
    topic_ids: []
  - title: 카카오, Kanana-2-vision-encoder Medium·Tiny 가중치 공개
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 카카오
      when: 2026년 10월 21일
      where: 미기재
      what: 자체 개발한 Kanana-2-vision-encoder를 소개하고 Medium과 Tiny의 가중치를 공개한다고 발표했다.
      how: Kanana-2 LLM 가중치 초기화, Dense Visual Caption 학습, 슬라이딩 윈도우 어텐션과 그룹 쿼리 어텐션,
        프루닝과 지식 증류 등을 적용했다고 설명했다.
      why: 한국어 문서 이해와 이미지 기반 질의응답에 활용할 비전 인코더를 제공하고, 연구자와 개발자의 비전 언어모델 개발에 기여하려는 목적이다.
    lead: 카카오는 2026년 10월 21일 외부 비전 인코더 가중치에 의존하지 않고 자체 Kanana 언어모델의 가중치와 구조를 활용해 학습한
      Kanana-2-vision-encoder를 소개했다. 카카오는 네 가지 라인업 중 Medium(4억 2,600만 파라미터)과
      Tiny(9,800만 파라미터)의 가중치를 연구·개발과 상업적 활용이 가능한 Kanana-open 라이선스로 공개한다고 밝혔으며,
      한국어 문서 이해와 이미지 기반 질의응답에 활용할 비전 언어모델 개발을 지원하는 것이 목적이라고 설명했다. 카카오는 같은 언어모델과
      VLM 구조를 유지해 비전 인코더를 비교한 자체 평가에서, 약 4억 파라미터 규모의 Medium과 약 1억 규모의 Tiny가 각각
      9개 영역 중 8개 영역의 비교 대상 최고점을 기록했다고 밝혔다. 카카오는 Kanana-o의 언어모델과 시각·음성 처리 모듈 등 구성
      요소를 자체 개발 중이며, 비전 인코더 공개를 시작으로 나머지 요소도 순차 공개할 계획이라고 밝혔다.
    explanations:
      - heading: 학습 방식과 효율
        paragraphs:
          - 카카오는 GenLIP를 이미지에 관한 상세 캡션의 다음 토큰을 예측하는 학습 방식이라고 설명했다. 이미지와 문장은 각각
            패치 임베딩과 텍스트 토큰 임베딩을 거쳐 벡터화되고, 하나의 트랜스포머가 두 입력의 관계를 다룬 뒤 언어모델 헤드가 다음
            토큰의 확률 분포를 만든다.
          - OCR과 문서 이해에 필요한 작은 글자와 복잡한 배치의 정보를 보존하기 위해 이미지의 글자와 세부 사항을 담은 Dense
            Visual Caption을 대규모로 구축했다. 또 Unified Transformer를 무작위 가중치 대신
            Kanana-2 LLM 가중치로 초기화하고 손실 함수는 다음 토큰 예측 하나로 유지했으며, 카카오는 이 방식의 실험에서
            비슷한 손실에 도달하는 데 필요한 학습 단계가 약 4분의 1로 줄어 약 4배의 학습 효율 향상을 확인했다고 밝혔다.
          - 카카오가 설명한 학습은 전체 파라미터를 대상으로 세 단계로 진행됐다. Stage 1은 이미지 비율을 재조정해 224²
            해상도를 사용했고, Stage 2와 Stage 3은 원본 비율을 유지하면서 각각 최대 640²와 1,280² 해상도를
            사용했다.
        source_urls:
          - https://tech.kakao.com/posts/840
      - heading: 고해상도 처리 구조
        paragraphs:
          - 슬라이딩 윈도우 어텐션(SWA)은 각 토큰이 이미지 전체가 아니라 주변의 일정한 윈도우만 참조하도록 해 어텐션 계산량을
            전체 토큰 쌍에 비례하는 O(N²)에서 토큰 수와 윈도우 크기의 곱에 비례하는 O(NW)로 줄인다. 인코더는 SWA를 주로
            쓰면서 Full Attention 레이어도 배치해 이미지 전체 정보를 다루도록 설계됐다.
          - 그룹 쿼리 어텐션(GQA)은 여러 Query 헤드가 Key와 Value를 공유하게 해 이들을 만드는 Projection
            연산과 저장 공간을 줄인다. 카카오는 Full Attention과 Multi-Head Attention을 사용한 구조와
            SWA·GQA 구조를 비교한 결과, 2560×2560 해상도에서 지연 시간이 61.8%, 최대 메모리 사용량이 21.8%
            감소했다고 밝혔다. 낮은 해상도에서는 이득이 작고 고해상도일수록 차이가 커졌다는 비교다.
        source_urls:
          - https://tech.kakao.com/posts/840
      - heading: 모델 라인업과 압축 학습
        paragraphs:
          - 라인업은 Large 약 9억, Medium 약 4억, Small 약 2억, Tiny 약 1억 파라미터의 네 모델로
            구성됐다. 카카오는 다양한 서비스에 맞는 선택지를 늘리고 온디바이스 활용을 고려해 Tiny를 약 1억 파라미터 안에
            구현하는 것을 목표로 했다고 설명했다.
          - Medium·Small·Tiny는 Large에서 순차적으로 프루닝해 시작 가중치를 얻었고, Large를 교사 모델로 삼아
            작은 모델에 지식 증류를 적용했다. 프루닝은 레이어 개수, 내부 차원, 어텐션 헤드, FFN의 네 축에서 진행했으며,
            레이어는 제거했을 때 교사 모델과의 KL 발산 변화가 가장 작은 것부터 줄였다.
          - 카카오는 정답 토큰 하나만 학습하는 대신 전체 어휘의 다음 토큰 확률 분포를 맞추는 Full-Vocabulary KL
            증류로, 약 1억 파라미터 Tiny가 약 9억 파라미터 Large의 분포를 따르도록 학습했다고 설명했다. Tiny에는
            마지막 학습 과정으로 On-Policy Distillation도 추가해, Tiny가 직접 생성한 토큰의 문맥에서 Tiny의
            다음 토큰 분포를 Large에 가깝게 학습시켰다.
        source_urls:
          - https://tech.kakao.com/posts/840
      - heading: 비교 평가의 범위
        paragraphs:
          - 성능 비교는 Kanana-2-1.3b-instruct와 VLM 구조(ViT→Projector→LLM)를 고정하고 비전
            인코더만 바꿔 같은 조건에서 학습·평가한 회사 실험이다. Google·Meta·Apple·Alibaba의 공개 인코더와
            Medium·Tiny를 각각 약 4억·1억 파라미터 규모에서 비교했다. 평가는 STEM·퍼즐, 일반 시각 질의응답, 지시
            이행·정렬, 영어 OCR·문서 이해, 세밀한 인식, 시각적 위치 인식, 한국어 OCR·문서 이해, 한국어 시험, 한국 문화
            이해의 9개 영역·42개 벤치마크로 구성됐다.
          - 회사 평가에서 Medium의 시각적 위치 인식은 78.0점, 한국어 OCR·문서 이해는 71.6점이었고, Tiny는 각각
            67.8점과 65.6점이었다. 9개 영역 평균은 Tiny(9,800만 파라미터)가 51.81점, Medium(4억
            2,600만 파라미터)이 55.62점으로 각각 해당 파라미터 규모의 비교 대상 중 가장 높았다고 카카오는 밝혔다.
        source_urls:
          - https://tech.kakao.com/posts/840
    papers: []
    relations: []
    topic_ids: []
  - title: Roche, IgA 신병증 임상 3상서 sefaxersen의 단백뇨 감소 결과 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche
      when: 2026년 10월 23일
      where: 미기재
      what: 진행 중인 3상 IMAgINATION 연구에서 시험 중인 sefaxersen의 중간 결과를 발표했다.
      how: 24시간 소변 단백질-크레아티닌 비율(UPCR)로 단백뇨를 측정했다.
      why: 미기재
    lead: Roche는 2026년 10월 23일, 최적화된 표준 치료를 받는 원발성 IgA 신병증 성인 대상 3상 IMAgINATION 연구에서
      시험 중인 sefaxersen이 위약 대비 37주 시점의 단백뇨를 24시간 소변 단백질-크레아티닌 비율(UPCR) 기준으로 43.1%
      줄였다는 중간 결과를 발표했다. 신장 기능 변화는 눈가림 연구를 계속해 105주 시점의 추정 사구체여과율(eGFR)로 평가할
      예정이다.
    explanations:
      - heading: 37주 결과와 안전성
        paragraphs:
          - Roche가 제시한 단백뇨 감소 효과의 95% 신뢰구간은 32.5~52.0%였고, P값은 0.0001 미만이었다.
          - 기저 혈뇨가 있던 환자 중 37주에 혈뇨가 해소된 비율은 sefaxersen군이 위약군보다 높았다. Roche는 사전에
            정한 모든 환자 하위군의 치료 효과가 주평가변수에서 나타난 단백뇨 감소 결과와 일관됐다고 설명했다.
          - Roche는 내약성이 양호했고 안전성 양상이 이전 2상과 일치했으며 새 안전 신호는 없었다고 보고했다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-23
      - heading: 시험 설계와 후속 평가
        paragraphs:
          - IMAgINATION은 진행 위험이 높은 원발성 IgA 신병증에서 피하 투여 sefaxersen의 효능과 안전성을 평가하는
            다기관·무작위배정·이중맹검·위약 대조 연구다. 등록한 459명을 sefaxersen 또는 위약에 1:1로 배정해 105주간
            평가한다.
          - 참가자는 연구자 재량으로 105주 이후 공개투여로 전환할 수 있으며, 공통 종료 시점이 먼저 오면 그 시점 이후 전환할 수
            있다.
          - 1차 평가변수는 37주 시점의 기저치 대비 UPCR 변화다. 신장 기능에 대해서는 105주 eGFR로 2년간의 변화를
            평가할 예정이며, 자료를 보건당국과 공유할 계획이다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-23
      - heading: 간 표적 ASO와 투여 설계
        paragraphs:
          - Roche는 sefaxersen을 보체 인자 B의 생성을 억제하는 고특이 간 표적 안티센스 올리고뉴클레오타이드(ASO)로
            소개했으며, IgA 신병증에서 이 방식으로 평가하는 첫 약물이라고 설명했다. 회사는 혈중 보체 인자 B를 낮추면 신장
            기능과 관련된 지표인 소변 단백질이 줄어든다고 설명했다.
          - 시험 중인 이 약물은 대체 보체 경로를 지속적으로 조절해 월 1회 피하 투여하고 집에서 자가 투여할 수 있도록 설계됐다.
            이는 Roche가 설명한 투여 설계와 의도다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-23
    papers: []
    relations: []
    topic_ids: []
  - title: AOMEI 업데이트 서버, 5~10분씩 설정 변조돼 공급망 침해에 악용
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google Threat Intelligence Group(GTIG)와 Mandiant가 조사했으며, 캠페인은 UNC7017에
        귀속됐다.
      when: 보고서 발표일은 2026년 10월 15일이며, 캠페인 관측 기간은 2026년 4~7월이다.
      where: AOMEI Technology의 업데이트 인프라와 이를 이용하는 조직. 가용 텔레메트리에서 확인된 피해 조직은 IT
        서비스·통신·고등교육 분야에 걸쳐 호주·브라질·인도·파키스탄·포르투갈·싱가포르·남아프리카공화국·스페인·스위스·튀르키예·미국에서
        관측됐다.
      what: AOMEI 업데이트 설정을 짧은 시간 동안 변조해 악성 업데이트를 전달하고 실행한 공급망 침해 캠페인이다.
      how: 공격자는 업데이트 설정과 알림 설정을 변조해 클라이언트가 공격자 서버의 악성 ZIP을 내려받고 악성코드를 실행하도록 했다.
      why: 미기재
    lead: Google Threat Intelligence Group(GTIG)와 Mandiant는 2026년 10월 15일 보고서에서
      2026년 4~7월 AOMEI Technology의 업데이트 인프라를 겨냥한 소프트웨어 공급망 침해 캠페인을 조사했다고 밝혔다.
      공격자는 AOMEI 원본 서버의 설정을 반복해서 짧게 변조했으며, 각 변조 구간은 정상 설정으로 되돌아가기 전까지 5~10분간
      이어졌다. 캠페인에는 CROSSROAD 다운로더와 SHINYROAD 백도어가 포함된 다단계 페이로드가 쓰였고, 보고서는 이를
      UNC7017로 추적하는 위협 클러스터에 귀속했다. 보고서가 확인한 노출 구간은 5월 28일 05:40~05:50 UTC의 10분,
      7월 16일 08:33~08:39 UTC의 6분, 7월 20일 10:35~10:40 UTC의 5분이었다.
    explanations:
      - heading: 업데이트 경로를 악용한 침투
        paragraphs:
          - AOMEI Backupper는 데이터 백업·디스크 복제·재해 복구를, AnyViewer는 원격 데스크톱 접근·지원을
            제공한다. 두 제품 이용자의 클라이언트와 관련 백그라운드 서비스는 ABMarket 업데이트 흐름을 통해 HTTPS로 원격
            엔드포인트를 주기적으로 확인한다.
          - UNC7017은 소프트웨어 취약점 대신 AOMEI 클라이언트의 정상 업데이트 및 팝업 표시 흐름을 악용했다. 변조 구간에
            업데이트를 확인한 클라이언트는 정상 업데이트 대신 공격자 서버의 악성 ZIP을 내려받고, 변경된 알림 설정에 따라 이를
            로컬에서 실행할 수 있었다.
          - 7월 16일 6분간의 노출 중에는 Notifycfg.ini에 반복 설정 섹션 3만 5천 줄 초과가 삽입됐다. 이 설정은
            설치된 버전과 관계없이 업데이트를 강제하고, 압축 해제된 CROSSROAD 드로퍼 upgrade-now.exe를 실행하도록
            구성됐다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/investigating-ephemeral-supply-chain-tampering/
      - heading: 다른 페이로드와 피해 범위
        paragraphs:
          - 공격자는 WebDAV를 통해 클라이언트가 원격 file:// 리소스를 요청하게 해, 사용자에게 보이지 않는 방식으로
            엔드포인트가 NetNTLMv2 인증 해시를 공격자 통제 서버로 전송하도록 유도할 수 있었다.
          - 보고서는 RadminComponentRuntime 예약 작업이 서명된 Radmin 실행 파일을 시작한 뒤 검색 순서
            하이재킹으로 서명되지 않은 BlkScrDl.dll을 불러오는 경로도 설명했다. 공격자는 이 DLL을 Radmin의 정상적인
            “blank screen” 드라이버 라이브러리처럼 보이도록 이름 지었다.
          - 가용 텔레메트리에서 확인된 피해 조직은 IT 서비스·통신·고등교육 분야에 걸쳐
            호주·브라질·인도·파키스탄·포르투갈·싱가포르·남아프리카공화국·스페인·스위스·튀르키예·미국에서 관측됐다. 변조 구간에
            업데이트 서버를 확인한 모든 시스템에 악성코드를 전달하려는 기회주의적 배포였으므로, 보고서는 직접 확인한 조직보다 피해가
            넓을 가능성이 있다고 설명했다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/investigating-ephemeral-supply-chain-tampering/
      - heading: 서버 조치 뒤에도 필요한 대응
        paragraphs:
          - 보고서에 따르면 AOMEI Technology는 2026년 7월 29일 시정 조치를 취했다고 답했다. 다만 서버 설정을
            정상화해도 앞선 노출 구간에 악성 업데이트를 받은 엔드포인트가 정리되는 것은 아니다.
          - 노출 구간에 업데이트를 확인해 예약 작업 등을 통해 지속성 페이로드를 내려받은 엔드포인트는 서버의 설정 파일이 복구된
            뒤에도 영향을 받을 수 있다. 보고서는 AOMEI 소프트웨어를 운영하는 조직에 제공된 지표와 YARA 규칙을 사용해
            2026년 4~7월 전체 기간을 대상으로 엔드포인트와 네트워크를 소급 헌팅하라고 권고했다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/investigating-ephemeral-supply-chain-tampering/
      - heading: 업데이트 검증과 사고 분석 권고
        paragraphs:
          - 보고서는 공급업체가 다운로드된 실행 파일과 아카이브를 추출하거나 실행하기 전에 Authenticode 서명과 공급업체
            인증서를 검증하고, HTTPS나 인증되지 않은 설정 파일의 평문 MD5 같은 원격 체크섬만 신뢰하지 말라고 권고했다. 원격
            .ini·.json·.xml 설정 파일에도 비대칭 공개키 암호기법으로 디지털 서명을 적용해 유효한 서명이 없으면
            클라이언트가 거부하도록 제안했다.
          - 설정이 5~10분 뒤 정상으로 돌아오면, 경보 후 공급업체 URL을 실시간 확인한 분석가는 정상 파일을 보고 경보를
            오탐으로 판단할 수 있다. 보고서는 실시간 웹 확인에만 의존하지 말고 AOMEI의 Tmphtml 경로에 캐시된 설정 파일을
            보존·분석하며, 경보가 발생한 정확한 초에 해당하는 프록시·방화벽 기록과 대조하라고 권고했다.
          - GTIG와 METAL의 텔레메트리에서는 2026년의 여러 변조 구간과 4월 말부터 실제 환경에서 관측된 관련 악성코드
            샘플을 확인했다. 연구진은 노출 시간이 짧아 가시성 밖에서 추가 변조가 있었을 가능성을 남겼으며, 활성 구간에 업데이트를
            확인한 시스템은 악성 지시를, 그 전후에는 정상 파일을 받았다고 설명했다.
        source_urls:
          - https://cloud.google.com/blog/topics/threat-intelligence/investigating-ephemeral-supply-chain-tampering/
    papers: []
    relations: []
    topic_ids: []
  - title: Dream Labs, 9000만 달러 시드 투자 유치와 Dream API 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Dream Labs
      when: 2026년 10월 22일 한국시간 보도; 기사에서는 이번 주의 투자 유치 발표로 설명했다.
      where: 미기재
      what: 시드 투자 9000만 달러 유치와 Dream API 출시
      how: Dream API가 로봇 카메라 영상과 자연어 지시를 모터 명령으로 변환한다.
      why: 회사는 신규 자금을 주로 컴퓨팅에 사용해 Dream-1이 처리할 작업과 로봇을 확대하고 더 많은 사용자를 지원할 계획이라고 밝혔다.
    lead: 2026년 10월 22일(한국시간) 보도에 따르면 Dream Labs는 시드 투자 9000만 달러를 유치하고, 로봇 카메라 영상과
      영어 자연어 지시를 모터 명령으로 바꾸는 Dream API를 출시했다고 밝혔다. 회사는 Dream-1이 일상 작업을 수행하는 사람들의
      영상으로 학습해 다음 상황과 로봇 동작을 예측하며, 제조사가 다른 로봇에서도 작동한다고 설명했다. Dream Labs에 따르면
      Dream-1은 평행 그리퍼가 달린 양팔 로봇을 추가 데이터 없이 제어할 수 있고, 현재 물체 집기·놓기와 빨래 개기 같은 탁상
      작업을 처리하며 바퀴형 이동 로봇과 손재주 로봇 지원은 계획 중이다.
    explanations:
      - heading: 사용 조건과 추가 작업 지원
        paragraphs:
          - 보도 시점인 10월 22일부터 개발자와 로봇 애호가가 회사의 AI 제품을 사용할 수 있다고 보고서는 전했다. Dream
            Labs는 등록 사용자가 그리퍼 장착 로봇을 연결해 Dream API를 이용할 수 있고, 현재 지원하는 로봇의 가격은 약
            2,000~10,000달러라고 설명했다.
          - Dream Labs는 20곳이 넘는 하드웨어 파트너와 협력하며 로봇별로 모델을 조정한다고 밝혔다. 지원되지 않는 하드웨어나
            새로운 기능에는 소량의 시연 데이터를 제출하면 몇 시간 안에 맞춤 모델을 제공하는 미세 조정 서비스를 운영한다.
        source_urls:
          - https://www.therobotreport.com/dream-labs-raises-90m-and-launches-dream-api/
      - heading: 투자 참여사와 자금 사용 계획
        paragraphs:
          - 이번 투자 라운드는 B Capital과 Kindred Ventures가 주도했으며 A.Capital, Unusual
            Ventures, SV Angel, Wing VC, Scribble VC 등이 참여했다. Dream Labs는 투자금을
            주로 컴퓨팅에 투입해 Dream-1의 지원 작업과 로봇 범위를 넓히고 더 많은 사용자를 지원할 계획이라고 밝혔다.
        source_urls:
          - https://www.therobotreport.com/dream-labs-raises-90m-and-launches-dream-api/
    papers: []
    relations: []
    topic_ids: []
  - title: Next.js CVE-2026-96889 보안 업데이트 권고
    kind: 사건 뉴스
    region: 국내
    facts:
      who: Vercel
      when: 2026년 10월 20일 권고문 게시
      where: 미기재
      what: Next.js Use After Free 취약점 CVE-2026-96889와 해결 보안 업데이트 안내
      how: 권고문 표의 두 행에서 각각15.5.28 및16.4.1 기준의 영향·해결 판본을 안내하고 업데이트를 권고했다.
      why: 미기재
    lead: 2026년 10월 20일자 권고문은 Next.js의 Use After Free 취약점 CVE-2026-96889와 이를 해결한
      Vercel 보안 업데이트를 안내했다. 권고문 표의 첫 행은 15.5.28 미만을 영향 판본·15.5.28 이상을 해결 판본으로,
      둘째 행은 16.4.1 미만을 영향 판본·16.4.1 이상을 해결 판본으로 제시한다. 영향을 받는 버전을 사용하는 이용자에게는 해결
      방안에 따라 최신 버전으로 업데이트할 것을 권고했다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot 영향 대시보드에 업계 비교 기능 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-10-22
      where: Copilot 영향 대시보드
      what: 참여 기업의 Copilot 에이전트 도입 및 활용 지표를 집계 벤치마크와 비교하는 ‘Industry comparison’ 섹션 추가
      how: 기본 비활성화된 선택 참여 방식으로 집계 벤치마크를 제공하며, 기업 규모와 산업에 따라 비교 집단을 설정
      why: GitHub는 기업이 Copilot 도입 목표를 세우고 도입 격차를 파악하며 진행 상황을 알리는 데 동료 기업 맥락을 제공한다고
        설명했다.
    lead: GitHub는 2026년 10월 22일 현지 기준 변경 안내에서 Copilot 영향 대시보드에 ‘Industry comparison’
      섹션이 추가됐다고 밝혔다. 참여 기업의 집계 벤치마크와 에이전트 우선·멀티 에이전트 사용자 비중 및 에이전트 사용자와 비에이전트
      사용자의 풀 리퀘스트 병합률을 비교하는 기능으로, 참여는 기본 비활성화된 선택 사항이다.
    explanations:
      - heading: 비교 지표와 집단 선택
        paragraphs:
          - 충분한 기업이 참여하면 각 점수는 28일 보고 기간의 비교집단 중앙값을 기준으로 순위가 매겨지며, 집단이 더 커지면 상위
            십분위(top decile)와도 비교한다.
          - 기업 소유자와 기업 소속이 아닌 조직의 소유자는 직원 규모 구간과 10개 산업 중 하나를 선택해 같은 산업 또는 전체
            산업과 비교할 수 있다. 직원 규모의 예시는 1~999명, 1,000~4,999명, 5,000명 이상이다.
          - 선택한 산업의 비교집단이 너무 작으면 같은 직원 규모의 전체 산업으로 범위가 넓어지며, 대시보드는 실제 사용한 비교집단을
            표시한다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-industry-comparisons-in-the-copilot-impact-dashboard
      - heading: 참여 자격과 순위가 보이지 않는 경우
        paragraphs:
          - 기업과 기업 소속이 아닌 조직이 참여할 수 있으며, 기업 소속 조직은 그 기업을 통해 참여한다. Copilot
            Business 라이선스 할당에만 쓰이는 기업은 참여할 수 없다. Copilot 사용량 지표 정책이 켜져 있어야 하며,
            대시보드 열람 권한이 있는 사용자는 비교 결과를 볼 수 있다.
          - 참여 기업이 충분하지 않으면 중앙값만 보이거나 선택보다 넓은 비교집단이 사용되고, 순위가 아직 표시되지 않을 수 있다.
            조직의 모든 사용자가 이미 에이전트 우선 또는 멀티 에이전트여서 활용도 지표의 비에이전트 기준선을 계산할 수 없는 경우에도
            순위는 제공되지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-industry-comparisons-in-the-copilot-impact-dashboard
      - heading: 정책과 데이터 처리
        paragraphs:
          - 대시보드와 기업·조직의 Copilot 정책 설정은 같은 참여 정책을 조절한다. 어느 경로에서든 끄면 데이터 기여와 비교
            접근이 중단되고, 비교 표시는 즉시 사라지며 데이터는 다음 일일 갱신부터 제외된다.
          - 비교 결과는 매일 갱신되고, 식별 정보가 없는 집계 벤치마크는 30일 뒤 삭제된다.
          - 데이터 상주 기능을 사용하는 GitHub Enterprise Cloud에서는 같은 지역의 참여자끼리만 비교하며, 지역 간
            데이터는 합쳐지지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-industry-comparisons-in-the-copilot-impact-dashboard
      - heading: 대시보드 안에서만 제공
        paragraphs:
          - 업계 비교 결과는 Copilot 영향 대시보드에서만 제공되며, Copilot 사용량 지표 API·NDJSON
            내보내기·다운로드에는 포함되지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-industry-comparisons-in-the-copilot-impact-dashboard
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, OpenSearch Serverless에 S3용 지능형 수집 기능 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026년 10월 22일
      where: AWS 7개 리전의 Amazon OpenSearch Serverless (NextGen) 컬렉션
      what: Amazon S3에 저장된 로그와 문서를 검색 가능한 콘텐츠로 변환하는 완전 관리형 intelligent ingestion 제공
      how: AWS Management Console에서 몇 번의 클릭 또는 API 호출 한 번으로 설정할 수 있다.
      why: 미기재
    lead: AWS는 2026년 10월 22일 Amazon OpenSearch Serverless에 S3의 로그와 문서를 검색 가능한 콘텐츠로
      바꾸는 완전 관리형 intelligent ingestion을 제공한다고 밝혔다. 이 기능은 JSON·NDJSON·JSON array
      형식의 관측 로그와 구조화 데이터, PDF·Word·일반 텍스트·Markdown 파일을 지원한다. Amazon S3를 소스로 하는
      Amazon OpenSearch Serverless (NextGen) 컬렉션에서 AWS 7개 리전에 제공되며, 마이그레이션·백필용
      일회성 작업과 새 객체를 반영하는 수집 스트림을 지원한다.
    explanations:
      - heading: 입력 처리와 용량·과금 범위
        paragraphs:
          - AWS 설명에 따르면 Console에서 몇 번의 클릭 또는 API 호출 한 번으로 수집을 설정할 수 있다. S3 소스와
            컬렉션 인덱스를 지정하면 데이터 유형 감지, 문서 파싱, 텍스트 분할과 색인 처리를 맡으므로 별도의 수집·문서 처리
            인프라를 관리할 필요가 없다.
          - 구조화 데이터에는 파이프라인 코드 없이 변환을 적용하고 임베딩을 선택적으로 추가할 수 있다. 비구조화 문서는 제목 구조와
            읽기 순서, 표를 보존해 파싱하며, 차트·도표·스크린샷·사진이 있는 문서는 비전 언어 모델이 만든 설명도 주변 콘텐츠와
            함께 색인한다.
          - S3 소스 버킷은 컬렉션과 같은 AWS 계정이나 다른 계정에 둘 수 있다. 처리 용량은 워크로드에 따라 컬렉션에 설정된
            한도까지 확장되며, 사용자는 실제 처리가 이뤄지는 동안에만 요금을 낸다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/amazon-opensearch-intelligent-ingestion-logs-documents-s3
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Megaport와 Interconnect 라스트마일 프리뷰 출시
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS, Megaport
      when: 2026년 10월 22일
      where: 미국 산호세(us-west-1) 및 북버지니아(us-east-1) 대도시권
      what: AWS Interconnect - last mile 프리뷰 출시
      how: AWS Management Console에서 연결 정보를 선택하고, AWS가 생성한 활성화 키를 사용해 Megaport를 통해
        프로비저닝한다.
      why: 미기재
    lead: AWS는 2026년 10월 22일 Megaport와 함께 지사·데이터센터·원격지에서 AWS로 연결하는 완전 관리형 서비스 AWS
      Interconnect - last mile의 프리뷰를 출시했다. 프리뷰는 Megaport를 통해 미국 산호세(us-west-1)와
      북버지니아(us-east-1) 대도시권에서 제공된다. 정식 출시(GA) 때는 AWS Console에서 대역폭을 1 Gbps에서 100
      Gbps까지 동적으로 조정할 수 있도록 할 계획이다.
    explanations:
      - heading: 연결 정보와 활성화 키로 구성
        paragraphs:
          - 고객은 AWS Management Console에서 리전, 대역폭, Direct Connect Gateway ID, 파트너
            구독자 ID를 선택해 사설 고속 연결을 만든다. AWS는 Megaport 프로비저닝용 활성화 키를 생성하고, 사전
            프로비저닝 용량으로 BGP 피어링·VLAN·ASN 구성을 자동화한다.
          - 고객은 Console·CLI·API로 연결을 생성할 수 있으며, 파트너는 GitHub에 공개된 API 패키지를 통해
            서비스를 도입할 수 있다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-announces-AWS-interconnect-last-mile-megaport-preview/
    papers: []
    relations: []
    topic_ids: []
  - title: Amazon SageMaker AI, 서버리스 모델 맞춤화에 학습 세션 API 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Amazon SageMaker AI
      when: 2026-10-22
      where: 미국 동부(버지니아 북부), 미국 서부(오리건), 아시아 태평양(뭄바이)
      what: 서버리스 모델 맞춤화용 학습 세션 API 지원 및 일반 제공
      how: 고객이 라이브 상태형 세션에서 자체 학습 루프를 구동하고, SageMaker AI가 GPU 인프라와 실행·복구·저장·보안을 처리한다.
      why: 고객이 GPU 인프라를 프로비저닝하거나 관리하지 않고 추가 학습(post-training) 알고리즘을 제어할 수 있도록 한다.
    lead: Amazon SageMaker AI는 2026년 10월 22일 서버리스 모델 맞춤화에 학습 세션 API를 지원한다고 발표했으며,
      고객은 GPU 인프라를 직접 프로비저닝하거나 관리하지 않고 추가 학습(post-training) 알고리즘을 제어할 수 있다. 고객은
      라이브 상태형 세션에서 자체 학습 루프와 연산 호출을 구성하고, SageMaker AI는 GPU 할당, 모델·LoRA 로딩, 분산
      실행, 장애 복구, 체크포인트 저장과 보안을 처리한다. 요금은 처리 토큰 기준으로 부과돼 보상 점수 계산 같은 로컬 연산은 GPU
      시간으로 청구되지 않으며, API는 미국 동부(버지니아 북부), 미국 서부(오리건), 아시아 태평양(뭄바이)에서 일반 제공된다.
    explanations:
      - heading: 학습 연산과 재개
        paragraphs:
          - 고객은 Python 코드에서 forward_backward(), optim_step(), sample()을 호출해 상태가
            유지되는 세션의 학습 루프를 구성할 수 있다. 강화학습, 지도 미세조정 또는 자체 학습 목표를 구동할 수 있고,
            체크포인팅과 재개 기능도 제공된다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/training-session-apis-on-sagemaker-ai
      - heading: 학습 레시피
        paragraphs:
          - Amazon SageMaker AI는 고객이 자체 학습 루프의 청사진으로 활용할 수 있는 실행 준비된 SFT 및 강화학습
            레시피를 담은 트레이닝 세션 쿡북도 공개한다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/training-session-apis-on-sagemaker-ai
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, AgentCore Gateway에 Bedrock API와 모델 대체 라우팅 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Amazon Bedrock AgentCore Gateway
      when: 2026년 10월 22일
      where: 중국을 제외한 AgentCore Gateway 제공 AWS 리전
      what: 추론 엔드포인트에 InvokeModel·InvokeModelWithResponseStream API 지원과 모델 대체 라우팅 추가
      how: 기존 Bedrock SDK 연동을 게이트웨이에 연결하고, 게이트웨이 규칙에 순서가 있는 대체 목적지와 전환 조건을 설정한다. 내장 회로
        차단기는 실패 중인 목적지를 건너뛴다.
      why: 기본 추론 목적지가 요청 제한, 용량 부족 또는 연결 불가 상태일 때 대체 모델이나 제공자로 라우팅해 클라이언트별 재시도 로직의 필요를
        줄이기 위해서
    lead: AWS는 2026년 10월 22일 Amazon Bedrock AgentCore Gateway의 추론 엔드포인트가 Amazon
      Bedrock InvokeModel 및 InvokeModelWithResponseStream API와 추론 트래픽용 모델 대체
      라우팅을 지원한다고 밝혔다. AWS에 따르면 기본 목적지가 요청 제한, 용량 부족 또는 연결 불가 상태일 때 게이트웨이는 대체
      모델이나 제공자로 요청을 라우팅해 클라이언트마다 별도의 재시도 로직을 구현할 필요를 줄인다. 이 기능은 중국을 제외하고
      AgentCore Gateway를 제공하는 모든 AWS 리전에서 이용할 수 있다.
    explanations:
      - heading: 전환 규칙과 클라이언트 연결
        paragraphs:
          - 사용자는 게이트웨이 규칙에 대체 목적지의 순서와 전환 조건을 지정한다. 전환 조건에는 요청 제한, 서버 오류, 응답 시간
            초과 등이 있으며, 내장 회로 차단기는 현재 실패 중인 목적지를 건너뛴다.
          - AWS는 대체 목적지를 찾는 내부 시도가 게이트웨이 뒤에서 처리되므로 클라이언트는 요청 하나를 보내고 응답 하나를 받는다고
            설명한다.
          - 기존 Amazon Bedrock SDK 연동을 게이트웨이에 연결하면 제공자별로 클라이언트 코드를 다시 작성하지 않고도
            하나의 관리 엔드포인트를 통해 모델 제공자에 접근할 수 있다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/agentcore-gateway-invokemodel-fallback/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS Transit Gateway·Cloud WAN, attachment에 관리형 1:1 NAT 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS Transit Gateway와 AWS Cloud WAN
      when: 2026년 10월 23일 발표
      where: 두 서비스가 운영되는 모든 AWS 상용 리전
      what: Regional Private NAT Gateway 통합을 통한 관리형 1:1 NAT 제공
      how: 고객이 attachment에서 주소 변환 규칙을 정하면 네트워크 간 변환이 양방향으로 적용되며 AWS가 NAT 기능을
        운영·확장·관리한다.
      why: 겹치는 IP 주소 대역을 가진 사설 네트워크를 주소 변경이나 NAT 장비 배포 없이 연결할 수 있도록 한다.
    lead: AWS는 2026년 10월 23일 AWS Transit Gateway와 AWS Cloud WAN attachment에서
      Regional Private NAT Gateway 통합을 통한 관리형 1:1 NAT를 제공한다고 발표했다. 이 기능으로 고객은 IP
      주소 대역이 겹치는 사설 네트워크를 주소 변경이나 NAT 장비 배포, 반환 트래픽 규칙 작성 없이 연결할 수 있다. AWS는 두
      서비스가 운영되는 모든 상용 리전에서 이 기능을 제공한다고 밝혔다.
    explanations:
      - heading: 양방향 변환과 관리 범위
        paragraphs:
          - 고객은 Transit Gateway 또는 Cloud WAN attachment에서 각 source CIDR이 변환될
            private IP 범위를 지정한다. 지원 연결에는 Amazon VPC, AWS Site-to-Site VPN, AWS
            Direct Connect, Transit Gateway Connect를 통해 연결된 SD-WAN 장비가 포함된다. 두
            서비스가 변환을 양방향으로 자동 적용하며, AWS는 attachment의 NAT 기능을 운영·확장·관리한다.
          - 설정은 AWS Management Console, AWS CLI, AWS SDKs, AWS CloudFormation으로
            할 수 있으며, 변환된 트래픽은 Amazon CloudWatch 지표와 Amazon EventBridge 이벤트로
            모니터링할 수 있다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-transit-gateway-cloud-wan-1-1-nat/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS CloudFormation, 미완료 롤백 절차를 한 번에 끝내는 force rollback 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026년 10월 22일
      where: 미기재
      what: AWS CloudFormation에 force rollback 기능을 제공한다고 발표했다.
      how: force rollback 옵션으로 continue update rollback을 실행해 롤백 절차를 완료한다. 남은 조치 대상
        리소스는 다음 배포 전에 검토·해결하고, drift-aware change set을 생성해 구성 차이를 검토하도록 안내한다.
      why: 미기재
    lead: AWS는 2026년 10월 22일 일부 리소스가 자동으로 롤백되지 않을 때 CloudFormation의 force rollback으로
      롤백 절차를 한 번의 작업으로 완료할 수 있다고 발표했다. 외부 변경 등으로 여전히 조치가 필요한 리소스는 기록되며, 사용자는 다음
      배포 전에 이를 검토하고 해결해야 한다.
    explanations:
      - heading: 롤백 뒤 구성 차이 확인
        paragraphs:
          - AWS는 force rollback 옵션으로 continue update rollback을 실행한 다음
            drift-aware change set을 생성해 다음 배포 전에 구성 차이를 검토하라고 안내한다.
          - force rollback은 AWS CLI와 SDK, AWS CDK, AI agents를 포함한 모든
            CloudFormation 워크플로에서 사용할 수 있다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-cloudformation-cdk/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Apps 기업 설치 GA…정책·보안·관리 API 지원 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-10-23
      where: 미기재
      what: GitHub Apps 기업 설치의 정식 제공과 기업·조직 관리 API 권한 확대를 발표했다.
      how: 기업·조직 정책, 보안 및 관리 설정을 읽거나 변경하는 API 지원을 확장했다.
      why: 더 많은 기업·조직 자동화에서 기존 PAT를 GitHub Apps로 대체할 수 있도록 하기 위해서다.
    lead: GitHub는 2026년 10월 23일 GitHub Apps의 기업 설치를 정식 제공(GA)하고, 기업·조직의 정책·보안·관리 API
      지원을 확대했다고 발표했다. 지원 범위가 넓어지면서 더 많은 기업·조직 자동화에서 클래식 PAT를 GitHub Apps로 대체할 수
      있게 됐다고 회사는 설명했다.
    explanations:
      - heading: 정책 권한과 필수 설정 읽기
        paragraphs:
          - Enterprise organization and repository policies 권한은 Read/write로,
            EnterpriseOwnerInfo의 정책 필드를 읽고 비공개 저장소 포크·기본 저장소 권한·저장소 공개 범위·저장소
            생성과 삭제·이슈 삭제·협력자 초대·배포 키·보호 브랜치 갱신·dependency insights·조직 및 저장소 프로젝트
            설정을 변경하는 API를 지원한다.
          - Enterprise settings는 Read/write로 기업 데이터, 서버 설치와 조직 초대 정보를 읽고 기업 프로필을
            갱신한다. 기업 조직·저장소 정책에 접근하려면 이 Enterprise settings의 Read 권한이 필요하다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-enterprise-installations-for-github-apps-generally-available
      - heading: 보안과 규칙 관리의 권한 차이
        paragraphs:
          - 기업·조직 IP 허용 목록은 Read/write로 항목 읽기·생성·수정·삭제를 지원한다. 허용 목록 적용, GitHub
            Apps 신뢰 설정, Enterprise Managed Users의 사용자 수준 적용도 전환할 수 있다.
          - 기업 접근 제한은 Write 권한으로 켜거나 끌 수 있다. 기업 저장소 규칙 집합도 Write 권한으로 기업 rules
            REST API와 GraphQL의 RepositoryRuleset을 통해 관리한다.
          - Enterprise bypass requests는 Read, 기업 2단계 인증은 Read/write, 기업·조직 검증
            도메인은 Write로 구분된다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-enterprise-installations-for-github-apps-generally-available
      - heading: 기존 권한의 API 보완과 이전 조건
        paragraphs:
          - 기존 Enterprise people Read/write 권한에서는 EnterpriseRepositoryInfo를 읽으며,
            EnterpriseOwnerInfo.outsideCollaborators를 통한 저장소 세부 정보도 확인할 수 있다. 지원
            API 항목에는 자신을 소유자 또는 구성원 역할로 조직에 추가하는 작업도 포함된다.
          - Enterprise billing Write 권한은 Marketplace의 구성원 구매 설정 갱신을 지원한다.
            GitHub는 이런 API·객체 지원 보완이 더 많은 자동화 시나리오를 가능하게 할 것으로 설명했다.
          - 이전할 워크플로에 필요한 권한은 사용자가 GitHub App에서 선택해야 한다. 해당 업데이트의 GHES 3.24 제공은
            향후 예정이다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-enterprise-installations-for-github-apps-generally-available
    papers: []
    relations: []
    topic_ids: []
  - title: Amazon SageMaker AI, Muse Glimmer·Qwen3.8·Ministral 3 서버리스 맞춤화 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Amazon
      when: 2026년 10월 22일
      where: Amazon SageMaker AI; 미국 동부(버지니아 북부), 미국 서부(오리건), 아시아 태평양(도쿄), 유럽(아일랜드)
      what: Muse Glimmer, Qwen3.8 27B, Ministral 3 3B·8B·14B 모델의 기존 배포 지원에 더해 서버리스 맞춤화
        지원을 추가했다고 발표했다.
      how: 학습 방법으로 SFT·DPO·RFT를, 모델 적응 방식으로 LoRA 또는 전체 미세 조정을 지원한다. SageMaker AI가 인프라
        준비와 학습 오케스트레이션을 맡는다고 Amazon은 설명했다.
      why: 미기재
    lead: Amazon은 2026년 10월 22일 Amazon SageMaker AI에서 Muse Glimmer, Qwen3.8 27B,
      Ministral 3 3B·8B·14B 모델의 기존 배포 지원에 더해 서버리스 맞춤화 지원을 추가했다고 발표했다. Amazon은
      도메인과 업무 흐름에 맞춘 학습에 지도 미세 조정(SFT)·직접 선호도 최적화(DPO)·강화 미세 조정(RFT)을 사용할 수 있으며,
      모델 적응 방식으로 저랭크 적응(LoRA) 또는 전체 미세 조정을 지원한다고 설명했다. Amazon은 사용자가 자체 데이터를 제공하면
      SageMaker AI가 인프라 준비와 학습 오케스트레이션을 맡고, 사용자는 데이터와 평가에 집중하며 사용한 만큼 비용을 낸다고
      설명했다. Amazon에 따르면 서버리스 맞춤화는 미국 동부(버지니아 북부), 미국 서부(오리건), 아시아 태평양(도쿄),
      유럽(아일랜드)에서 이용할 수 있으며, SageMaker Studio의 Models 페이지, SageMaker Python SDK
      또는 코딩 보조 도구와 함께 쓰는 Agent skills로 맞춤화 작업을 시작할 수 있다.
    explanations:
      - heading: 맞춤화 방식
        paragraphs:
          - Amazon은 라벨이 붙은 데이터로 도메인별 작업의 정확도를 높이는 데 SFT를, 선호 데이터로 출력을 조직의 어조에
            맞추는 데 DPO를, 보상 신호로 새 작업 성능을 높이는 데 RFT를 활용할 수 있다고 설명했다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/amazon-sagemaker-muse-qwen-ministral/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: Solidigm, 잠재적 IPO 검토 중단…생산능력 확충은 우선순위로 유지
    event_id: 415fcd1e877744b8
    review_status: verified
    published_at: 2026-10-23
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: PHP 세션 취약점 CVE-2026-115560 임시 조치 권고
    event_id: 4c4435f5cbe49c5a
    review_status: verified
    published_at: 2026-10-24
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: NASA, SR-1 Freedom 핵전력 모듈 계약 진전…2028년 말 발사 계획
    event_id: a56b88dda9c225a2
    review_status: verified
    published_at: 2026-10-20
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: MIT·톈진대, 3D 프린팅 센서 설계 소프트웨어 X-Hinges 소개
    event_id: f486af5a109b4006
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Mandiant, BeyondTrust 원격 지원 취약점의 8월 말 제로데이 악용 정황 공개
    event_id: 43436d5aea1b860e
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: FDA, 특정 국소 진행성 직장암에 Jemperli 단독요법 가속 승인
    event_id: 7c2862a904efcaf3
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 항우연, 누리호 단 조립 치공구 129종 순천으로 이송
    event_id: 8cd5db7ee29aa1be
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: MIT 등, 태아 머리 대칭을 반영한 MRI 모델 E(3)-Pose 개발
    event_id: f52873b716a974b4
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: PMO-DDPG, 자동차 점용접 궤적 계획에서 SAC 대비 지표 개선 보고
    event_id: 505559b9505a3cb0
    review_status: verified
    published_at: 2026-10-20
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 로봇 비행선으로 ALICE 검출기 동굴의 누설 자기장 측정
    event_id: 620ef05ef6350329
    review_status: verified
    published_at: 2026-10-16
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Agility Robotics, Digit 5 공개…사람 곁 작업과 물류 업무 겨냥
    event_id: 18ad06131ba8857f
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 한국생명공학연구원, 항암 작용·영상 추적 결합 후보물질 BF-04 개발
    event_id: 54d80bfbb20da444
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 파푸아뉴기니 산불 탄소 배출, 10월 중순 누적 동기 최고 추정
    event_id: 85bd67089d446bba
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 로봇 심초음파 AI, 건강인 영상에서 위양성률 낮춘 도메인 적응 연구
    event_id: 9f4b8f91f73d0d47
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 항우연, 제7회 초소형위성 경연대회 7개 팀 최종 선정
    event_id: 6d99be7dd6da2d15
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: KRCERT, PHP2Shell 취약점 대응 위해 패치와 침해 흔적 점검 권고
    event_id: 26cee6c8988b9fda
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: 카카오, Kanana-2-vision-encoder Medium·Tiny 가중치 공개
    event_id: 9def2f624f98553c
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Roche, IgA 신병증 임상 3상서 sefaxersen의 단백뇨 감소 결과 발표
    event_id: 98b4374cb5540bd0
    review_status: verified
    published_at: 2026-10-23
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: AOMEI 업데이트 서버, 5~10분씩 설정 변조돼 공급망 침해에 악용
    event_id: 22e9e157a17745fa
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Dream Labs, 9000만 달러 시드 투자 유치와 Dream API 공개
    event_id: 248eeecd73bfe4f1
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Next.js CVE-2026-96889 보안 업데이트 권고
    event_id: 44a573496592b7c5
    review_status: verified
    published_at: 2026-10-20
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: GitHub Copilot 영향 대시보드에 업계 비교 기능 추가
    event_id: 910aa2f8992b1ea1
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: AWS, OpenSearch Serverless에 S3용 지능형 수집 기능 제공
    event_id: 7e048869ec70694c
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: AWS, Megaport와 Interconnect 라스트마일 프리뷰 출시
    event_id: eff15a5a3696c82b
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Amazon SageMaker AI, 서버리스 모델 맞춤화에 학습 세션 API 추가
    event_id: a93a584210e1e8b8
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: AWS, AgentCore Gateway에 Bedrock API와 모델 대체 라우팅 추가
    event_id: a2502ca44383293e
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: AWS Transit Gateway·Cloud WAN, attachment에 관리형 1:1 NAT 추가
    event_id: c7b4abbe4976998d
    review_status: verified
    published_at: 2026-10-23
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: AWS CloudFormation, 미완료 롤백 절차를 한 번에 끝내는 force rollback 추가
    event_id: 71d57daca4402dd1
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: GitHub Apps 기업 설치 GA…정책·보안·관리 API 지원 확대
    event_id: 16c7779781249595
    review_status: verified
    published_at: 2026-10-23
    reviewed_at: 2026-10-25
    concept_ids: []
  - title: Amazon SageMaker AI, Muse Glimmer·Qwen3.8·Ministral 3 서버리스 맞춤화 지원
    event_id: acc181485daa8190
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-25
    concept_ids: []
---

# 이번 호 표지

Solidigm, 잠재적 IPO 검토 중단…생산능력 확충은 우선순위로 유지

# 차례

- Solidigm, 잠재적 IPO 검토 중단…생산능력 확충은 우선순위로 유지
- PHP 세션 취약점 CVE-2026-115560 임시 조치 권고
- NASA, SR-1 Freedom 핵전력 모듈 계약 진전…2028년 말 발사 계획
- MIT·톈진대, 3D 프린팅 센서 설계 소프트웨어 X-Hinges 소개
- Mandiant, BeyondTrust 원격 지원 취약점의 8월 말 제로데이 악용 정황 공개

# 커버 스토리

없음

# 뉴스 데스크

## Solidigm, 잠재적 IPO 검토 중단…생산능력 확충은 우선순위로 유지

**분야:** 반도체·컴퓨팅
**테마:** 투자·기업거래
**보조 테마:** 생산·공급망
**세부 태그:** 자금 조달 검토
**기업·기관:** Solidigm, SK hynix

Solidigm은 2026년 10월 23일 잠재적 pre-IPO 및 IPO 방안의 검토를 중단하기로 결정했다고 밝혔다. Solidigm은 이번 결정이 성장 전망이나 자금 수요의 변화 때문은 아니며, 최근 자본시장 여건과 주가 추세를 고려해 IPO가 SK hynix와 기존 주주에게 가장 유익한 방안인지 재평가할 필요가 있었다고 설명했다. 회사는 생산능력 확대와 경쟁력 강화가 계속 중요한 우선순위라고 설명했다. [S1]

### 증설 수요와 검토했던 자금 조달 방안

Solidigm은 AI 시대 메모리 수요가 성장 기회를 제공하지만 기존 생산시설의 수용 능력이 제한돼 미국 내 추가 생산시설 확보가 필요하다고 설명했다. SK hynix는 성장 자금 확보와 효율적인 자본 배분을 위해 Solidigm 직접 투자와 IPO를 통한 외부 자금 조달 등 여러 방안을 검토해 왔다고 밝혔다.

SK hynix는 IPO를 통한 외부 자금 조달이 연결 현금흐름을 늘려 설비 투자 여력을 키우고 배당, 자사주 매입 및 소각을 통한 주주 환원을 지원할 수 있다고 설명했다. [S1]

### 향후 투자 평가

SK hynix는 Solidigm의 성장과 기존 주주가치 제고 방안을 모색하면서 투자 시기·규모·자금 조달 방식을 계속 평가하겠다고 밝혔다. [S1]

## PHP 세션 취약점 CVE-2026-115560 임시 조치 권고

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** PHP 개발팀

2026년 10월 24일자 권고문은 PHP 세션 처리 과정의 원격 코드 실행 취약점 CVE-2026-115560에 대해 PHP 개발팀이 발표한 임시 조치를 안내했다. 이 취약점은 설정 파일의 session.serialize\_handler가 php\_binary 또는 php\_serialize이고, session\_start() 전에 ini\_set()으로 해당 값을 php로 바꾸며, session.upload\_progress.enabled가 활성화된 세 조건을 모두 충족할 때 영향을 받는다. 보안 업데이트가 아직 배포되지 않아, 권고문은 업데이트 전까지 php.ini나 PHP-FPM pool 설정 등에서 session.upload\_progress.enabled=0으로 설정하고 모든 PHP 워커를 재시작하도록 안내했다. 영향받는 버전은 제조사 미공개 상태이며, 10월 21일 배포된 PHP 보안 업데이트 8.5.12, 8.4.27, 8.3.36, 8.2.35로도 해결되지 않고 차기 정기 업데이트에서 해결 버전이 배포될 예정이다. [S2]

### 임시 조치 적용 조건

session.upload\_progress.enabled는 기본값으로 활성화되어 있다. PHP2Shell(CVE-2026-109619) 임시 조치로 이미 이 값을 0으로 설정했다면 추가 적용은 필요하지 않다고 권고문은 설명한다. [S2]

## NASA, SR-1 Freedom 핵전력 모듈 계약 진전…2028년 말 발사 계획

**분야:** 우주·기초과학
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** NASA, Sierra Lobo Inc., Department of Energy (DOE), Idaho National Laboratory

NASA는 2026년 10월 20일 SR-1 Freedom 개발을 진전시키기 위한 주요 계약 조치에 파트너들과 상호 합의했다고 밝혔다. SR-1 Freedom은 지구 궤도를 넘어 심우주에서 핵전기 추진을 실증할 임무로, NASA는 2028년 말 Ingenuity 설계를 발전시킨 화성 헬리콥터 3대의 SkyFall 과학 임무를 함께 실어 발사할 계획이다. [S3]

### 핵전력 모듈 구성과 업체 역할

핵전력 모듈은 핵분열로 열을 만드는 원자로와, 그 열을 우주선 시스템 및 전기 추진에 쓰는 전기로 바꾸는 전력 변환 시스템으로 구성된다. Sierra Lobo Inc.는 폐쇄형 브레이턴 사이클 전력 변환 시스템을 공급할 예정이며, 해당 작업은 2024년에 수주된 Space Flight Systems Development and Operations Contract III에 따라 수행된다. [S3]

### 원자로 통합과 안전 조치

전력 변환 시스템은 미국 에너지부 산하 아이다호 국립연구소가 설계·개발 중인 핵분열 원자로와 통합될 예정이다. NASA와 에너지부는 설계와 개발 전반에 걸쳐 기관 간 안전 검토, NASA 최고안전책임자의 지속적인 감독, 규정 준수, 위험·고장 허용성·원자력 안전에 초점을 둔 설계 절차를 적용하며, 원자로는 우주선이 지구 궤도를 벗어날 때까지 비활성 상태로 유지된다. [S3]

### SkyFall 임무의 계획된 목적

NASA는 SkyFall 임무가 과학 데이터를 수집하고 탐사 구역을 시연하며 잠재적 수원을 찾도록 계획하고 있다. 이 임무는 심우주 탐사와, 태양광만으로 충분하지 않은 어둠의 기간이나 지역에서 NASA 달 기지의 운영을 지원하도록 설계된 차세대 핵분열 동력 시스템의 기반을 마련한다는 구상이다. [S3]

## MIT·톈진대, 3D 프린팅 센서 설계 소프트웨어 X-Hinges 소개

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** CSAIL, Tianjin University

MIT CSAIL과 톈진대 연구진은 2026년 10월 22일 센서와 움직임 설계를 3D 프린팅 물체에 통합하는 X-Hinges를 소개했다. X-Hinges는 센서 필라멘트가 강한 신호를 내고 배선 요소는 간섭을 피하도록 서로 다른 두 재료를 배치하며, 사용자는 압축·상하·좌우 중 최대 세 축의 움직임을 정해 굽힘 부위에 센서를 넣을 수 있다. 연구진은 손 크기에 맞춰 손가락 관절 굽힘을 기록하고 휴머노이드 손에 전달하는 장갑 등을 제작했지만, 출력물마다 전기 요소 배치가 조금씩 달라 같은 외형의 기기에서도 센서값이 달라지는 보정 문제가 남아 있다. [S4]

### 제작한 장치의 예시

연구진은 손으로 눌러 접으면 그 동작을 감지해 밝기가 달라지는 종이접기 형태의 램프도 제작했다.

소프트웨어에는 사용자 설계 인터페이스와 네 가지 기본 형태가 있다. 연구진은 상어 꼬리 모양의 게임 컨트롤러를 직접 설계해 꼬리가 위아래로 움직이도록 정한 뒤 센서를 넣어 3D 프린팅했다. [S4]

### 현재 보정 방법과 후속 목표

Chang과 Li는 같은 종류의 두 출력물에서 데이터가 맞도록 컴퓨터 비전으로 출력 신호를 재보정하는 시스템을 만들었다. 앞으로는 신호를 내부에서 재보정하는 기구를 개발하기를 희망한다고 밝혔다.

Jiaji Li는 다음 단계로 구동과 감지를 한 번의 프린팅 과정에 함께 통합하는 방안을 제시했다. [S4]

### 연구진과 발표 일정

이 작업에는 MIT CSAIL과 중국 톈진대 연구진이 참여했다. 주저자 Xiang Chang은 톈진대 박사과정생이자 CSAIL 방문연구원이고, 선임저자 Jiaji Li는 MIT EECS 박사후연구원 겸 CSAIL 연구원으로 소개됐다.

연구진은 11월 초 ACM 사용자 인터페이스 소프트웨어 및 기술 심포지엄에서 이 연구를 발표할 예정이다. [S4]

## Mandiant, BeyondTrust 원격 지원 취약점의 8월 말 제로데이 악용 정황 공개

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** BeyondTrust, Mandiant, GTIG

BeyondTrust는 2026년 10월 15일 BeyondTrust Remote Support 어플라이언스에 영향을 주는 CVE-2026-102764를 공개했으며, 취약점 악용에 성공하면 임의 파일을 업로드할 수 있다. Mandiant는 사고 대응 과정에서 ARMORY CASTLE이 2026년 8월 말 이 취약점을 제로데이로 악용한 증거를 확인했다고 밝혔다. 이 취약점은 지원되는 Remote Support 버전 26.2.3 이하에 영향을 주며, 인증되지 않은 원격 공격자가 어플라이언스에서 파일 작업을 수행해 호스트 제어권과 저장·중개된 자격 증명에 접근할 수 있다. Mandiant는 악용 기간 중 취약 버전으로 인터넷에 노출된 어플라이언스를 검토 전까지 침해 가능성이 있는 것으로 취급하고, 조직의 위험 허용도·침해 증거·운영 요구를 바탕으로 지원 업무 중단과 격리를 함께 고려하는 단계적 패치 우선 대응을 권고했다. [S5]

### 보고된 침해 방식

Mandiant는 공격자가 웹 서비스 계정에서 어플라이언스 호스트의 root 수준 제어권으로 권한을 높여, 저장·중개되는 모든 자격 증명에 접근하고 재부팅·설정 초기화 뒤에도 남는 파일을 수정할 수 있게 됐다고 설명했다. 공격자는 자격 증명 관리 데이터베이스에서 정보를 직접 수집하려고 BeyondTrust 어플라이언스의 관리용 CLI인 `/ns/sbin/bt-secrets`를 이용했다.

Mandiant는 공격자가 설정 템플릿을 바꿔 site service account에 암호 없는 root 권한을 부여하고, 내부 엔드포인트에 원격 지원 세션을 설정했다고 관찰했다. 이어 내장 지원 도구로 전체 파일 시스템 접근 권한을 얻고, 파일 전송 서비스로 사용자 데스크톱에서 소프트웨어 목록 등 내부 문서를 내려받아 유출했다.

Mandiant는 공격자가 `/ns/config/haproxy.conf`를 수정해 BARECLAW 터널러가 인터넷에서 직접 접근되도록 했고, 어플라이언스 로그와 엔드포인트 흔적도 삭제했다고 보고했다. GTIG는 취약점 제로데이 악용과 SAWFLY·BARECLAW 배치를 ARMORY CASTLE에 귀속했다. [S5]

### 패치와 복구 지침

BeyondTrust는 Remote Support SaaS 전체 테넌트에 2026년 10월 9일 BT26-05 패치를 적용했다고 밝혔다. SaaS 어플라이언스 자체에 고객 조치는 필요 없지만 자격 증명과 설정 검토 단계는 여전히 적용된다.

자체 호스팅 버전 24.3.1 이상은 `/appliance`에서 BT26-05-RS를 적용하고, 자동 업데이트에 가입한 경우에는 자동 적용 여부를 확인하도록 권고됐다. 24.3.1보다 오래된 버전은 지원 버전으로 올린 뒤 패치해야 하며, 업그레이드만으로 이전 노출이 해결되지는 않는다.

변경이나 재부팅 전에는 가상 어플라이언스의 메모리 스냅샷과 디스크를 보존하고, B Series 하드웨어와 SaaS 테넌트는 BeyondTrust 지원팀에 포렌식 보존을 요청하도록 안내됐다. [S5]

### 자격 증명과 접근 기록 점검

지침은 패치·재구축을 마친 뒤 `/appliance` 관리자, `/login` 관리자·로컬 사용자, API 비밀정보, 보안 제공자 계정·SAML 서명 키, Remote Support Vault와 연동 Password Safe·PRA의 대상 시스템 자격 증명, SMTP·syslog·ITSM 등 통합 자격 증명, 노출 기간 지원 세션에 입력된 자격 증명을 의존 순서대로 교체하도록 권고했다. 먼저 교체하면 아직 어플라이언스를 제어하는 공격자에게 새 자격 증명이 노출될 수 있다.

지침은 `/login` 설정을 노출 전 기준선과 대조해 사용자·역할 변경, 특히 Jump Item 역할의 관리자 승격, 그룹·세션 정책, API 계정, 보안 제공자, Jump Items·Jumpoints와 외부 이벤트·syslog 전송 대상을 검토하도록 권고했다. 변경 기록이나 지정된 소유자가 없는 항목은 제거하도록 했다.

악용 기간의 지원 세션 보고서와 파일 전송 기록으로 접근된 엔드포인트와 반출된 자료를 확인하고, 접촉된 모든 엔드포인트를 후속 조사 범위에 포함하도록 했다. [S5]

### 재배포와 재연결 조건

지침은 침해가 확인됐거나 침해 여부가 불명확한 어플라이언스를 깨끗하고 완전히 패치된 이미지로 재배포하도록 권고했다. 고객이 호스트 파일 시스템을 감사할 수 없고 호스트 수준의 지속성이 재부팅·설정 초기화 뒤에도 남기 때문이다.

설정 백업은 노출 기간 이전 것을 복원하거나, 최신 백업을 격리 상태에서 복원한 뒤 지침의 Option 3, Part B 검토를 끝내고 나서 연결을 재개하도록 했다. 새 TLS 인증서를 발급하고 재구축한 어플라이언스에서 Jump Clients·Jumpoints·담당자 콘솔을 다시 배포하는 조치도 권고했다.

보고서는 추가 통제 조치가 노출과 침해 후 영향을 줄이지만 패치를 대신하지는 않는다고 명시했다. [S5]

## FDA, 특정 국소 진행성 직장암에 Jemperli 단독요법 가속 승인

**분야:** 바이오·의료기술
**테마:** 정책·규제
**보조 테마:** 연구·기술
**세부 태그:** 인허가, 연구 소개
**기업·기관:** 미국 FDA, GSK, Memorial Sloan Kettering Cancer Center

미국 FDA는 2026년 10월 19일, 이전 치료를 받지 않은 성인 중 FDA가 허가한 검사에서 dMMR 또는 MSI-H 종양이 확인된 2기 또는 3기 국소 진행성 직장암 환자의 Jemperli(dostarlimab-gxly) 단독 사용을 가속 승인했으며, 승인 수령자는 GSK다. 이 용법은 일부 환자에게 수술·방사선 치료·화학요법을 피할 선택지를 제공할 수 있지만, 승인은 AZUR-1 중간 결과에 근거하며 지속적인 임상적 이득을 입증하기 위한 후속 추적이 필요하다. [S6]

### 기존 치료의 부담과 약물 작용

국소 진행성 직장암 환자는 수술 전에 화학요법과 방사선 치료를 받는 경우가 많고, 이 과정은 장·비뇨기·성 기능과 생식력에 영향을 줄 수 있다. 수술에는 회복 불량, 장 연결부 누출, 일부 환자의 영구 장루를 비롯해 때로 생명을 위협하는 중대한 합병증 위험도 있다.

발표된 추정치상 국소 진행성 직장암의 약 3%가 dMMR 또는 MSI-H에 해당한다. Jemperli는 면역세포의 PD-1 단백질을 표적으로 삼아 암세포가 면역계를 피하는 데 이용하는 신호를 차단한다. [S6]

### 서로 다른 두 연구의 추적 결과

FDA가 근거로 삼은 AZUR-1은 이전 치료를 받지 않은 dMMR 또는 MSI-H 국소 진행성 직장암 환자 154명을 대상으로 Jemperli 단독 사용을 평가한 2상 연구다. 환자들은 6개월 동안 3주마다 최대 9회 투여받았으며, 중앙 추적 기간이 2년을 넘었을 때 거의 4분의 3은 수술·방사선 치료·화학요법이 필요하지 않았다.

별도의 앞선 Memorial Sloan Kettering Cancer Center 연구는 같은 미치료 dMMR 또는 MSI-H 국소 진행성 직장암 환자 50명을 평가했다. 치료 후 암 징후가 검출되지 않았고 93%는 그 상태를 최소 12개월 유지했으며, 최소 3년 추적한 27명 중 한 명에게 같은 부위의 재발이 보고됐다. [S6]

### 가속 승인 뒤 남은 확인과 안전성

FDA는 AZUR-1에서 반응이 얼마나 지속되고 암이 얼마나 자주 재발하는지 파악하려면 더 긴 추적이 필요하다고 밝혔다. 중간 결과에 따른 가속 승인인 만큼, 후원사는 반응이 지속적인 임상적 이득으로 이어지는지 보여주기 위해 환자 추적을 계속해야 한다.

Jemperli는 면역계가 건강한 장기와 조직을 공격하게 할 수 있으며, 이런 반응은 중증이거나 치명적일 수 있다. 이 직장암 환자군에서 15% 이상에게 보고된 흔한 부작용은 피로, 발진, 설사, 가려움증이었다. [S6]

## 항우연, 누리호 단 조립 치공구 129종 순천으로 이송

**분야:** 우주·기초과학
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 조달 변경
**기업·기관:** 한국항공우주연구원, 한화에어로스페이스

한국항공우주연구원은 2026년 10월 19일 누리호 단 조립용 치공구 129종을 한화에어로스페이스에 무상 대여하기 위해 순천 단조립장으로 이송했다고 밝혔다. 2027년 발사 예정인 누리호 비행모델 6호기부터 1·2·3단을 순천에서 각각 조립하고, 각 단을 해상으로 나로우주센터에 옮겨 결합한 뒤 발사 전 준비를 진행할 예정이다. 항우연은 장비 대여와 함께 기술 감리와 현장 기술 지원을 제공해 민간의 조립 역량 축적을 도울 계획이다. [S7]

### 치공구의 배분과 역할

항우연이 보유한 치공구는 모두 204종이며, 이 가운데 단 조립에 활용되는 129종을 순천으로 옮겼다. 나머지는 나로우주센터 발사체종합조립동에 보관해 누리호 전기체 총조립에 사용할 예정이다.

치공구는 발사체 부품을 옮기거나 자세를 유지하고 정밀하게 조립·가공하는 장비와 도구다. 조립 과정에서 결합 부위를 정렬하고 품질을 유지하는 데 쓰인다. [S7]

### 현장 경험 전수 계획

항우연은 조립 중 발생하는 문제의 원인을 분석하고 해결 방안을 찾는 과정을 현장에서 공유할 계획이다. 문서나 장비 전달에 더해 실제 문제 해결 경험을 전수해 민간이 조립 역량을 쌓도록 지원한다. [S7]

## MIT 등, 태아 머리 대칭을 반영한 MRI 모델 E(3)-Pose 개발

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** MIT, Boston Children’s Hospital, Inria

MIT News는 2026년 10월 19일 MIT·Boston Children’s Hospital·Inria 연구진이 움직이는 태아 머리를 영상화해 방사선 전문의가 살펴볼 고해상도 이미지를 얻도록 돕는 딥러닝 모델 E(3)-Pose를 개발하고 훈련했다고 소개했다. 이 모델은 태아 머리의 좌우 대칭을 신경망 구조에 내장해 뇌의 방향을 파악하기 쉽게 한다. [S8]

### 움직임이 만드는 영상 공백

태아 MRI는 여러 2D 영상 조각을 쌓아 고해상도 3D 머리 영상으로 구성한다. 촬영 중 머리가 움직이면 조각마다 각도가 달라져 최종 영상에 공백이나 비정상적인 방향이 생길 수 있고, 의사가 태아 뇌 병리를 놓치거나 잘못 진단할 가능성이 있다. [S8]

### 학회 공개와 훈련 범위

연구 논문은 2026 European Conference on Computer Vision에서 발표됐다.

모델은 주로 임신 후기인 3기 태아 자료로 훈련됐다. Muthukrishnan은 임신 중기인 2기 또는 그보다 이른 임신 시기의 태아 영상화에도 도움이 되도록 모델을 개선하고 싶다고 밝혔다. [S8]

### MRI 자동화에 대한 전망

Boston Children’s Hospital의 Fetal Neonatal Neuroimaging and Developmental Science Center를 이끄는 Ellen Grant는 이 연구가 태아 뇌 MRI를 자동화해 느린 수동 절차를 대체하고, 산모에게 더 빠르고 편안한 촬영과 판독자를 위한 고품질 영상을 제공할 것이라고 전망했다. [S8]

## PMO-DDPG, 자동차 점용접 궤적 계획에서 SAC 대비 지표 개선 보고

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 연구 소개
**기업·기관:** 없음

2026년 10월 20일 공개된 논문은 자동차 점용접 협동로봇의 궤적 계획을 위해 PMO-DDPG를 제안했다. 논문은 Soft Actor-Critic(SAC) 기준으로 궤적 오차 66.4%, 충돌률 82.1%, 에너지 소비 15.5%, 사이클 시간 22.0%, 추론 지연 22.7%를 낮추고 성공률은 7.5퍼센트포인트 높였다고 보고했다. 동일 연구 내 5회 독립 학습 실행의 평균±표본표준편차는 궤적 오차 1.08±0.29 mm, 충돌률 1.2±0.5%, 에너지 3.65±0.28 kJ, 사이클 시간 3.87±0.25초, 성공률 94.6±1.8%, 추론 시간 21.5±1.6 ms였다. 저자들은 비전 유도 점용접 산업 시험 100회에서 밀리미터 미만 위치 정밀도와 반복 가능한 용접을 확인했다고 보고했으며, 방법 간 차이에 대한 공식 유의성 검정은 하지 않았다고 밝혔다. [S9]

### 방법과 비교 조건

PMO-DDPG는 정확도·부드러움·안전·생산성에 특화된 비평가 4개를 사용하고, 접근·정렬·용접·후퇴 단계에 따라 선호도를 조정한다. 여섯 개의 정규화된 물리 보상 요소와 파레토 선택을 활용하면서 온라인 추론은 액터만으로 수행하도록 설계됐다.

시뮬레이션은 저항 점용접 건을 장착한 6자유도 협동로봇과 차량 차체에 배치된 사전 정의 용접 지점 20개를 사용했다. 각 학습 방법은 최대 500스텝인 에피소드 2,000회로 학습하고 독립 실행 5회로 평가했다.

학습 기반 방법은 같은 용접 환경, 상태·행동 정의, 학습 예산, 종료 기준, 보상 구성과 평가 절차로 재평가됐다. 기존 궤적 계획기는 같은 작업 공간과 물리 지표로 평가했으나 RL 학습 예산은 배정하지 않아, 결과는 연구 안에서 통제한 기술적 비교다. [S9]

### 산업 시험 결과

실제 시험에서는 비전 시스템이 용접 목표를 찾고 로봇 툴 중심점과 목표 위치의 오프셋을 추정한 뒤, 생성된 궤적을 실행하면서 계획 움직임과 실제 움직임을 기록했다. 이 산업 현장 반복 시험은 100회 수행됐으며, 신뢰구간과 여러 현장에서의 재현 검증은 향후 과제로 남았다.

논문이 제시한 용접 직전 사례의 위치 오차는 X 0.19 mm, Y −0.17 mm, Z 0.12 mm였고 각도 오차는 0.22°였다. 반복 물리 시험 100회에서는 세 방향의 위치 오차가 모두 약 0.4 mm 미만으로 유지돼 약 0.2 mm 부근에서 안정화됐으며, 각도 오차는 약 0.2° 주위에서 변동했다.

보고된 정밀도에서 평균 에너지 소비 3.65 kJ는 Recurrent SAC와 동률이었다. [S9]

### 해석 범위

연구 결과는 cobot 한 대와 점용접 셀 한 곳, 정적 장애물, 사전 정의된 용접 순서와 한 세트의 물리 시험 100회에 한정된다. 동적 사람 움직임, 다중 로봇 간섭, 장기 전극 열화는 평가하지 않았다.

독립 실행은 방법별 5회였고 공식 가설 검정은 없었으므로, 보고된 방법 간 차이는 통계적 유의성이 확인된 결과가 아니다. 평균 추론 시간 21.5 ms도 100 Hz 제어가 의미하는 하드 10 ms 마감시간을 충족한다는 증거로 해석할 수 없다고 논문은 명시했다. [S9]

## 로봇 비행선으로 ALICE 검출기 동굴의 누설 자기장 측정

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 실증·재현
**기업·기관:** 없음

2026년 10월 16일 공개된 연구에서 연구진은 ALICE 검출기 동굴의 3차원 누설 자기장을 측정하기 위해 3축 Hall-effect 센서와 ArUco 마커 기반 시각 위치추정을 결합한 로봇 비행선을 제시했다. 자석을 명목 전류로 운전한 상태에서 센서 정확도와 위치추정 불확실성을 분리하는 정적 측정과 같은 계측 영역의 동적 비행 캠페인을 수행했으며, 정적 측정은 ArUco 마커 20곳에서 각각 30초간 진행됐다. 논문은 전자기 시뮬레이션과 측정값의 일치도를 횡방향 성분에서 R² 0.86–0.98, 수직 성분에서 R² 0.75–0.79로 보고했고, 수직 성분에는 0.65–1.12 mT의 체계적인 양의 편향이 있었다고 설명했다. 비행 시험은 ALICE 자석이 명목 전류로 작동하고 L3 솔레노이드와 전방 쌍극자가 모두 음극성인 상태에서 2026년 2월 4일과 5월 22일, 총 네 차례 진행됐다. [S10]

### 실험 구성과 측정 범위

CST 전자기 모델은 동굴의 국소 강자성 구조물과 시공 오차, 시뮬레이션 형상에 포함되지 않은 인접 자석의 영향을 반영하지 못하는 단순화 모델이다. 연구진은 시뮬레이션과 실제 환경의 차이를 살피기 위해 두 차례 실험 캠페인을 구성했다.

동적 시험에서는 Hall 센서 불확실성뿐 아니라 ArUco 위치추정 불확실성도 시뮬레이션과의 비교에 영향을 미쳤다. 비행은 검출기 출입문 옆 콘크리트 차폐 블록 위의 주 비행 구역에서 수동으로 이뤄졌고, 정적 캠페인에 사용한 두 마커 스트립을 따라 진행됐다. [S10]

### 불확실성 산정의 조건

ALICE 기준 좌표계 변환은 캠페인 내내 고정돼 있었고 문서화된 허용오차가 없어 불확실성 전파에서 제외됐다. CAD 형상과 실제 시설의 차이는 모든 측정 지점에 공통된 편향으로 나타날 것으로 예상됐다.

카메라와 센서 사이의 변환도 고정돼 있고 문서화된 허용오차가 없어 이상적인 변환으로 취급해 산정에서 제외했다. 기계 조립 정밀도가 밀리미터 수준이므로 그 영향은 다른 요인보다 작을 것으로 예상됐다.

위치추정 특성은 ALICE 동굴에서 외부 기준 측정 시스템을 설치하기 어려워 통제된 환경에서 확인했다. 마커 배치, 비행선 플랫폼, 카메라와 위치추정 파이프라인을 동일하게 재현했지만, 산정된 불확실성은 현장 조건을 대표하는 추정치이며 실제 운용값과 다를 수 있다. [S10]

### 측정값과 시뮬레이션 비교

정적 시험에서는 시뮬레이션 값이 한 자기장 성분에서 20개 측정 지점 모두의 Hall 센서 불확실성 범위에 들었고, 다른 성분에서는 20곳 중 18곳, 나머지 성분에서는 20곳 중 8곳에서 범위에 들었다. 논문은 이에 해당하는 비율을 각각 100%, 90%, 40%로 제시했으며, 세 번째 성분의 차이가 더 컸다고 보고했다. 연구진은 강자성 요크와 관련된 모델링 오차 가능성을 언급했지만 센서 오프셋·정렬 또는 좌표 변환 오류의 영향을 배제하지 못했다.

네 차례 비행에서 얻은 유효 지점 858개를 합산한 분석에서, 논문은 성분별 불확실성 범위에 대한 포함 기준을 만족한 비율을 89.4%, 79.3%, 55.4%로 보고했다. 가장 낮은 성분의 결과는 정적 시험의 40%와 비슷하다고 설명했다. [S10]

### 현재 제약과 다음 단계

비행 중 ArUco 마커가 카메라 시야에 없으면 센서 위치를 알 수 없어 Hall 센서 측정값을 공간 좌표에 연결할 수 없다. 네 차례 수동 비행은 계측된 시험 구역에서 측정·위치추정 방법을 보였지만 동굴 전체를 조사한 것은 아니다.

연구진이 계획한 주요 발전 방향은 ArUco 기반 위치추정 파이프라인을 폐루프 위치 제어기 및 자기장 인식 경로 계획기와 통합해 자율 운용으로 전환하는 것이다. [S10]

## Agility Robotics, Digit 5 공개…사람 곁 작업과 물류 업무 겨냥

**분야:** 로봇·제조
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Agility Robotics

Agility Robotics는 2026년 10월 19일 Digit 5를 공개했으며, 회사는 이 로봇이 유용한 작업을 안전하고 경제적으로 대규모 수행하도록 설계됐다고 밝혔다. 공동창업자에 따르면 Digit 5는 23kg 상자를 높은 선반에 올리도록 설계됐고, 9분 충전으로 90분 작동하는 것이 목표이며, 회사는 Digit 4 EVT의 상업 배치에서 배운 점을 바탕으로 첫 10개 사용 사례에 맞춰 로봇을 처음부터 설계했다. 공동창업자는 Agility Robotics의 Salem 소재 RoboFab이 7만 제곱피트 규모로 연간 Digit 5를 1만 대 초과 생산할 수 있다고 설명했다. 공동창업자는 유럽 CE 규정 준수, 북미 UL 전기 안전 인증과 FCC 전자파 한계가 고객 현장 배치를 위한 필수 요구사항이었다고 설명했다. [S11]

### 사람이 가까이 오면 작업을 멈추도록 설계

Digit 4의 상업 배치에서는 보험과 규제 요구를 충족하기 위해 로봇과 사람 사이에 물리적 장벽을 둬야 했다. 공동창업자는 이를 배경으로 사람 주변에서 안전하게 작동하도록 하는 일을 Digit 5의 주요 설계 목표로 삼았으며, Agility Robotics가 이 과제에 2년을 들였다고 밝혔다.

사람 위치를 감지하는 센서가 사람이 다가오는 것을 포착하면, 사람이 로봇을 만지기 전에 작업을 멈추고 화물을 내려놓은 뒤 바닥에 앉아 모터 전원을 끊도록 설계됐다. 공동창업자는 이를 사람과 함께 작업할 때 위험을 검증 가능한 방식으로 줄이기 위한 단기 접근법으로 설명했다. [S11]

### 무거운 작업을 위한 구조와 충전

공동창업자는 Digit 5의 무게가 120kg을 초과하며, 23kg 상자를 반복해서 들고 1.75m 높이의 선반에 닿는 작업을 하루 20시간 수행하도록 설계했다고 설명했다. 배터리와 냉각 시스템은 몸통의 약 75%를 차지한다.

충전 도크는 48V에서 240A를 공급하도록 계획됐고, 몸통의 냉각 통로로 강한 팬이 공기를 보내 배터리 과열을 막도록 설계됐다. 회사가 밝힌 90분 작동과 9분 완전 충전은 설계 목표다.

다만 늘어난 몸체 부피 때문에 Digit 5는 이전 세대처럼 달리거나 점프할 수 없다고 공동창업자는 밝혔다. [S11]

### 작업 자세와 향후 기능

Digit 5는 이전 버전의 타조형 다리 대신 사람과 비슷한 다리 구성을 채택했다. 쪼그려 앉을 때 발목이 바닥에 부딪히는 문제를 피하고, 무릎과 엉덩이 모터가 함께 토크를 내 일어서는 동작을 돕도록 한 설계다.

회사는 상자 운반 외에도 개별 물품 집기, 머신 텐딩, 조립 부품 준비와 배송, 장기적으로는 조립 작업을 로드맵에 포함했다. 교체 가능한 도구 인터페이스와 모듈형 설계로 하위 시스템을 점진적으로 업그레이드하고, 향후 행동 학습을 위한 데이터 플랫폼으로 활용하는 것도 계획하고 있다. [S11]

## 한국생명공학연구원, 항암 작용·영상 추적 결합 후보물질 BF-04 개발

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** 한국생명공학연구원

한국생명공학연구원 화학생물연구센터 성낙균 박사 연구팀은 2026년 10월 19일 항암 작용과 실시간 영상 진단을 결합하는 후보물질 BF-04를 개발했다고 밝혔다. 연구팀은 암세포·환자 유래 암 오가노이드·동물모델에서 이 물질을 평가했으며, 형광물질 또는 방사성 동위원소를 도입해 암 조직의 위치와 약물 분포를 영상으로 확인했다고 보고했다. [S12]

### 암세포에서 확인한 작용과 종양 축적

BF-04는 튜불린 단백질에 결합해 세포분열에 필요한 미세소관 형성을 방해하고 암세포 분열 억제와 세포사멸을 유도했다. 연구팀은 기존 미세소관 표적 항암제에 내성을 보이는 암세포에서도 활성이 나타났다고 보고했다.

동물모델에서는 항체나 나노입자 전달체 없이 종양 조직에 선택적으로 축적되는 양상이 관찰됐다. 항암 효과와 표적화 특성의 확인은 세포·오가노이드·동물모델을 활용한 실험 범위의 결과다. [S12]

### Cy5 광학영상과 ⁸⁹Zr PET 영상

영상 확인을 위해 BF-04에 Cy5 또는 ⁸⁹Zr를 도입했다. Cy5 도입형은 광학영상, ⁸⁹Zr 도입형은 PET 영상이 가능한 트레이서로 작용하며 생체 내 종양에 축적됐다.

연구팀은 분자 영상 장비로 주사 후 최대 4일 동안 약물이 암 조직에 머물며 작동하는 과정을 실시간으로 추적할 수 있었다고 밝혔다. 이 추적 결과는 동물모델을 활용한 전임상 연구에서 얻었다. [S12]

### 결합 분석과 논문 공개

연구자료에는 DiffDock 도킹 모델을 통한 BF-04와 튜불린 이합체의 결합 예측, BLItz의 bio-layer interferometry를 이용한 결합 친화도 분석이 각각 제시됐다.

논문은 Acta Pharmaceutica Sinica B 9월 온라인판에 게재됐으며, BRIC의 ‘한국을 빛낸 사람들’에도 소개됐다. [S12]

## 파푸아뉴기니 산불 탄소 배출, 10월 중순 누적 동기 최고 추정

**분야:** 에너지·기후기술
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 안전 문제
**기업·기관:** ["GFED","Wageningen University & Research","Papua New Guinea's National Weather Service","Global Forest Watch","University of California, Irvine"]

NASA 지구관측소는 2026년 10월 22일, 가뭄과 강한 엘니뇨가 이어진 9\~10월 뉴기니에서 산불이 번지고 연기가 수 주 동안 넓은 지역을 뒤덮었다고 전했다. GFED 추정에 따르면 파푸아뉴기니 산불의 탄소 배출량은 10월 17일까지 32메가톤에 가까워 연중 같은 시점 기준 역대 어느 해보다 많았고, 화재 과학자 귀도 판데르베르프는 2015년 연간 총량을 이미 크게 넘어섰으며 2026년이 1997년을 넘어 연간 최고치가 될 가능성이 매우 높다고 말했다. 인도네시아령 파푸아의 탄소 배출량은 35메가톤을 초과해 2015년과 1997년에 이어 세 번째로 높았다고 보고서는 밝혔다. 대기오염으로 항공편이 지연·취소되고 학교가 문을 닫았으며, 일부 지역 당국은 어린이와 고령자에게 마스크 착용을 권고했다. [S13]

### 가뭄과 화재의 양상

파푸아뉴기니 최남단 트랜스플라이 지역은 90일 넘게 비가 오지 않았고, 기상청 자료상 이 지역 일부의 8월 이후 강수량은 평년의 약 5\~10%였다. 현지 언론은 가뭄으로 작물 피해와 물 부족, 휴교가 발생했다고 보도했다.

연구자들은 뉴기니 화재의 대다수가 사람이 점화한 것이라고 설명하며, 농작물 소각, 목초지 관리, 산림 벌채와 개간, 사냥 등을 흔한 이유로 들었다. 건조한 조건에서는 관리 목적의 불이 통제되지 않는 산불로 번지기도 한다. [S13]

### 배출량 추정과 산림 변화

GFED는 위성 원격탐사와 식생 특성 등의 정보를 결합해 식생 화재의 범위와 배출량을 추정하는 모델링 체계다. 인도네시아령 파푸아에서는 지난 20년 동안 산업용 기름야자·펄프재 농장, 소규모 경작지 이동, 도시 확장과 채굴을 위해 토지가 개간됐다.

Global Forest Watch에 따르면 인도네시아령 파푸아는 2025년 원시림 2만7,000헥타르를 잃었다. 이는 2024년의 거의 두 배이며 2017년 이후 가장 큰 면적이다.

양 첸 캘리포니아대학교 어바인 연구원은 2026년 파푸아뉴기니와 동부 인도네시아, 특히 인도네시아령 파푸아와 칼리만탄의 화재 활동이 수마트라와 서부 인도네시아 다른 지역보다 이례적으로 활발하다고 말했다. [S13]

### 우기 전까지 이어질 가능성

연구자들은 뉴기니 남부의 우기가 시작되어 많은 비가 내릴 때까지 산불이 계속될 것으로 예상했으며, 우기는 보통 11월 초에 시작된다.

인도네시아에서는 대규모 기름야자·사탕수수·펄프재 농장들이 자산 보호를 위해 자체 소방대를 두는 경우가 많다고 필드는 말했다. 그는 화재가 주로 관리되지 않는 지역이나 원시림 가장자리에서 관찰된다고 설명했다. [S13]

## 로봇 심초음파 AI, 건강인 영상에서 위양성률 낮춘 도메인 적응 연구

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법, 실증·재현
**기업·기관:** Waseda University, Cardiovascular Institute

연구진은 2026년 10월 21일 공개된 논문에서 병원과 로봇 심초음파 영상의 특징을 정렬하는 적대적 도메인 적응 방법을 제안했다. 건강한 로봇 촬영 대상자에서 Normal-only DANN은 직접 전이보다 위양성률을 34.3%에서 10.7%로 낮췄지만, 병리 로봇 사례가 없어 민감도 평가와 임상 사용을 위한 검증은 남아 있다. [S14]

### 자료와 검증 단위

병원 자료는 심초음파 검사 12,000건으로, 기본 모델 학습 10,000건·독립 시험 500건·도메인 특성 분석 1,500건으로 나뉘었다. 분할은 환자 수준에서 이뤄져 집단 사이에 같은 환자가 겹치지 않았다.

로봇 자료는 건강한 자원봉사자 15명에게서 얻은 뷰별 영상 클립 150개다. Waseda University Iwata Laboratory의 ORIZURU 플랫폼을 사용했으며, 촬영은 숙련 심장전문의 감독하에 수행됐고 자원봉사자 전원이 사전에 서면동의했다.

자료는 대상자·획득 세션·심초음파 뷰·클립·프레임의 계층으로 구성됐고, 모델 예측 단위는 클립, 통계 추론 단위는 대상자였다. 대상자 단위 LOSO 검증의 각 회차에서 한 명을 시험용으로 남기고 나머지 열네 명 중 열두 명은 적응 학습, 두 명은 검증에 썼다. 시험 대상자의 클립은 학습·검증·초모수 선택·조기 종료에 사용하지 않았다. [S14]

### 도메인 차이와 두 적응 방식

직접 적용한 병원 학습 모델의 특이도는 독립 병원 시험에서 90.6%였지만, 건강인 로봇 영상의 대상자 평균은 65.7%였다. 논문은 두 특이도 값의 격차를 24.9퍼센트포인트로 보고했다.

적응 구조는 3D ResNet-18과 기울기 반전 도메인 판별기로 병원·로봇 특징을 정렬하면서 병원 분류 학습 목표를 유지한다. 이 설계는 라벨이 붙은 로봇 병리 사례 없이도 적응할 수 있도록 했다.

Mixed-DANN은 도메인 적대 손실에 병원의 심근경색 양성·정상 표본과 건강한 로봇 표본을 모두 썼다. Normal-only DANN은 그 손실을 병원 정상·건강한 로봇 표본으로 제한했지만, 분류 손실에는 여전히 병원 양성·정상 표본을 모두 사용했다. 연구진은 질환 구성 차이의 잠재적 교란을 줄이기 위해 이 구성을 도입했다. [S14]

### 건강인 결과와 병원 성능의 교환 비용

건강한 로봇 대상자 15명의 LOSO 결과에서 정상 사례 특이도의 평균±표준편차는 직접 전이 65.7%±6.4%, Mixed-DANN 86.1%±4.3%, Normal-only DANN 89.3%±4.8%였다. 두 전략 모두 Wilcoxon 검정 p값이 0.001 미만이고 순위 이분 상관 r은 1.0이었으며, 15명 전원의 특이도가 개선됐다.

Normal-only DANN의 위양성률 감소 폭은 23.6퍼센트포인트였다. 그 특이도 개선은 병원과 로봇 사이 특이도 격차의 94.8%를 회복한 결과다.

병원 성능은 동일한 독립 시험 500건·1,600클립에서 고정 판정 기준 0.50과 같은 전처리로 비교했다. 적응 후 정확도·민감도·특이도 감소 폭은 Mixed-DANN이 각각 2.4퍼센트포인트·1.7퍼센트포인트·3.1퍼센트포인트, Normal-only DANN이 각각 1.2퍼센트포인트·0.7퍼센트포인트·1.6퍼센트포인트였다. AUROC도 기준 모델 0.961에서 Mixed-DANN 0.948, Normal-only DANN 0.955로 낮아졌다. [S14]

### 현재 적용 범위와 측정 한계

로봇 집단은 병리 음성인 건강인뿐이어서 평가는 정상 사례 특이도와 위양성률에 한정됐다. 로봇 민감도는 평가하지 못했으며, 임상 배포 전에는 벽운동 이상이 있는 로봇 촬영 사례로 검증해야 한다.

기하학적 변동성은 로봇에서 관절 인코더로, 병원에서는 전문가가 평가한 뷰 일관성으로 간접 측정해 두 측정치를 직접 비교할 수 없다. 병원 신뢰구간은 클립 수준에서 추정됐고 검사-클립 매핑이 보존되지 않아 같은 검사 내부의 군집성을 반영하지 못했다.

로봇 촬영은 PLAX·PSAX·A4CH의 세 표준 뷰만 포함했다. ASE 17분절 모형에 따른 포괄적 벽운동 평가에 중요한 심첨부 2방(A2CH) 뷰는 빠져 있다. [S14]

## 항우연, 제7회 초소형위성 경연대회 7개 팀 최종 선정

**분야:** 우주·기초과학
**테마:** 인력·조직
**보조 테마:** 연구·기술
**세부 태그:** 교육·훈련, 연구 소개
**기업·기관:** 한국항공우주연구원, 우주항공청

한국항공우주연구원은 2026년 10월 22일 제7회 초소형(큐브)위성 경연대회에서 초급 5개 팀과 고급 2개 팀, 총 7개 팀을 최종 선정했다고 밝혔다. 1차 심사에서 위성 임무와 기술 설계를 평가해 14개 팀을 선정한 뒤, 2차 심사에서 예비설계 서류·발표 평가를 거쳐 최종 팀을 확정했다. 선정팀은 설계 검토와 제작, 우주환경시험 등을 거쳐 비행모델을 개발할 예정이며, 우주항공청과 항우연은 기술·개발비를 지원하고 국내 발사체를 통한 발사 기회를 제공할 계획이다. [S15]

### 선정된 대학별 팀

초급 부문에는 부산대 Plato Sat, 경희대 PADO-SAT, 제주대 Blue Orbit, 경상국립대 OFDIR, 한국항공대 KAUSAIL이 선정됐다. 고급 부문은 연세대 CubeSat Yonsei와 조선대 OLIVESat이다. [S15]

### 팀들이 제안한 위성 임무

선정팀의 제안에는 우주환경 관측, 재난·미세먼지 감시, 레이저 광통신이 포함됐다. 이 가운데 기기 이상 감지와 데이터 압축 등에 AI를 접목해 위성 임무 수행 효율을 높이려는 시도도 있다고 항우연은 전했다. [S15]

## KRCERT, PHP2Shell 취약점 대응 위해 패치와 침해 흔적 점검 권고

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** 없음

KRCERT는 2026년 10월 22일 PHP에서 로그인 없이 외부 명령을 실행할 수 있는 CVE-2026-109618·CVE-2026-109619 취약점이 발견됐으며, 심각도는 CVSS 9.2라고 밝혔다. 권고문은 PHP 8.5.12, 8.4.27, 8.3.36, 8.2.35 이상을 해결 버전으로 제시하고, 호환성과 안정성을 검토한 뒤 패치를 적용하도록 안내했다. 이 취약점은 서버 메모리의 비밀번호·토큰·API 키를 유출시킬 수 있으며, 기록에 이상이 없더라도 안전이 보장되지는 않아 업데이트와 침해 점검, 인증정보 교체가 함께 권고됐다. [S16]

### 실제 웹 실행 환경의 패치 반영

업데이트 후에는 PHP-FPM, Apache mod\_php, php-cgi, FrankenPHP, LiteSpeed 등 실제 PHP 웹 서비스를 재시작해야 하며, 그렇지 않으면 메모리에 남은 이전 버전이 계속 동작할 수 있다. 컨테이너는 신규 이미지를 재배포해야 한다. 명령줄 php -v 결과와 웹 서비스의 실행 버전이 다를 수 있어, PHP가 여러 개 설치된 서버는 각각 확인해야 한다.

리눅스 배포판·제조사가 제공하는 보안 업데이트도 대응에 포함된다. 이런 패키지는 패치 뒤에도 버전 번호가 바뀌지 않을 수 있으므로 패키지 변경 이력에서 해당 CVE 반영 여부를 확인해야 한다. [S16]

### 지원 종료 버전과 임시 설정

PHP 8.1 이하는 공식 업데이트가 제공되지 않아 지원 버전으로 전환해야 한다. PHP 8.2의 보안 지원은 2026년 12월 31일 끝날 예정이므로 8.3 이상으로 전환하도록 권고했다. 전환에 시간이 걸리면 배포판·장기지원 업체의 패치나 PHP 보안팀이 공개한 7.4·8.0·8.1용 소스 패치를 임시 적용하고 전환 계획을 세우도록 안내했다.

공식 임시 설정은 php.ini, PHP-FPM pool 또는 웹 서버 설정에서 session.upload\_progress.enabled=0, memory\_limit=-1을 적용하는 방식이다. memory\_limit은 프로그램이 변경하지 못하도록 관리자 설정으로 강제하며, post\_max\_size를 낮게 두고 upload\_max\_filesize를 그보다 작게 유지하도록 했다.

업로드가 필요 없으면 post\_max\_size를 8M, 필요하면 32M 수준으로 두고, PHP 8.5에서는 fatal\_error\_backtraces=0을 추가하도록 했다. 임시 설정은 공격을 완전히 막지 못하므로 패치 업데이트가 필요하다. [S16]

### 침해 점검과 증거 보존의 순서

취약점 정보 유출일인 10월 20일 이후의 기록 전체를 점검하고, 가능하면 그 이전 기록도 확인하도록 권고했다. 침해 대응의 격리 단계에서는 서버 전원을 끄거나 재시작하지 말고 외부 네트워크 접속만 차단하며, 업데이트·재시작 전에 메모리 등 공격 흔적을 확보해야 한다.

증거 확보 뒤에는 업데이트·재시작, 웹셸 제거, 인증정보 교체를 진행하도록 안내했다. 업데이트 전까지 인터넷에 노출된 서버에는 DB 비밀번호·외부 서비스 연동 키·관리자 계정 비밀번호 교체를 권장하고, 침해 흔적이 발견된 서버에는 반드시 교체하도록 했다. [S16]

## 카카오, Kanana-2-vision-encoder Medium·Tiny 가중치 공개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 제품·서비스
**세부 태그:** 연구 소개, 새로운 방법, 성능 개선
**기업·기관:** 카카오

카카오는 2026년 10월 21일 외부 비전 인코더 가중치에 의존하지 않고 자체 Kanana 언어모델의 가중치와 구조를 활용해 학습한 Kanana-2-vision-encoder를 소개했다. 카카오는 네 가지 라인업 중 Medium(4억 2,600만 파라미터)과 Tiny(9,800만 파라미터)의 가중치를 연구·개발과 상업적 활용이 가능한 Kanana-open 라이선스로 공개한다고 밝혔으며, 한국어 문서 이해와 이미지 기반 질의응답에 활용할 비전 언어모델 개발을 지원하는 것이 목적이라고 설명했다. 카카오는 같은 언어모델과 VLM 구조를 유지해 비전 인코더를 비교한 자체 평가에서, 약 4억 파라미터 규모의 Medium과 약 1억 규모의 Tiny가 각각 9개 영역 중 8개 영역의 비교 대상 최고점을 기록했다고 밝혔다. 카카오는 Kanana-o의 언어모델과 시각·음성 처리 모듈 등 구성 요소를 자체 개발 중이며, 비전 인코더 공개를 시작으로 나머지 요소도 순차 공개할 계획이라고 밝혔다. [S17]

### 학습 방식과 효율

카카오는 GenLIP를 이미지에 관한 상세 캡션의 다음 토큰을 예측하는 학습 방식이라고 설명했다. 이미지와 문장은 각각 패치 임베딩과 텍스트 토큰 임베딩을 거쳐 벡터화되고, 하나의 트랜스포머가 두 입력의 관계를 다룬 뒤 언어모델 헤드가 다음 토큰의 확률 분포를 만든다.

OCR과 문서 이해에 필요한 작은 글자와 복잡한 배치의 정보를 보존하기 위해 이미지의 글자와 세부 사항을 담은 Dense Visual Caption을 대규모로 구축했다. 또 Unified Transformer를 무작위 가중치 대신 Kanana-2 LLM 가중치로 초기화하고 손실 함수는 다음 토큰 예측 하나로 유지했으며, 카카오는 이 방식의 실험에서 비슷한 손실에 도달하는 데 필요한 학습 단계가 약 4분의 1로 줄어 약 4배의 학습 효율 향상을 확인했다고 밝혔다.

카카오가 설명한 학습은 전체 파라미터를 대상으로 세 단계로 진행됐다. Stage 1은 이미지 비율을 재조정해 224² 해상도를 사용했고, Stage 2와 Stage 3은 원본 비율을 유지하면서 각각 최대 640²와 1,280² 해상도를 사용했다. [S17]

### 고해상도 처리 구조

슬라이딩 윈도우 어텐션(SWA)은 각 토큰이 이미지 전체가 아니라 주변의 일정한 윈도우만 참조하도록 해 어텐션 계산량을 전체 토큰 쌍에 비례하는 O(N²)에서 토큰 수와 윈도우 크기의 곱에 비례하는 O(NW)로 줄인다. 인코더는 SWA를 주로 쓰면서 Full Attention 레이어도 배치해 이미지 전체 정보를 다루도록 설계됐다.

그룹 쿼리 어텐션(GQA)은 여러 Query 헤드가 Key와 Value를 공유하게 해 이들을 만드는 Projection 연산과 저장 공간을 줄인다. 카카오는 Full Attention과 Multi-Head Attention을 사용한 구조와 SWA·GQA 구조를 비교한 결과, 2560×2560 해상도에서 지연 시간이 61.8%, 최대 메모리 사용량이 21.8% 감소했다고 밝혔다. 낮은 해상도에서는 이득이 작고 고해상도일수록 차이가 커졌다는 비교다. [S17]

### 모델 라인업과 압축 학습

라인업은 Large 약 9억, Medium 약 4억, Small 약 2억, Tiny 약 1억 파라미터의 네 모델로 구성됐다. 카카오는 다양한 서비스에 맞는 선택지를 늘리고 온디바이스 활용을 고려해 Tiny를 약 1억 파라미터 안에 구현하는 것을 목표로 했다고 설명했다.

Medium·Small·Tiny는 Large에서 순차적으로 프루닝해 시작 가중치를 얻었고, Large를 교사 모델로 삼아 작은 모델에 지식 증류를 적용했다. 프루닝은 레이어 개수, 내부 차원, 어텐션 헤드, FFN의 네 축에서 진행했으며, 레이어는 제거했을 때 교사 모델과의 KL 발산 변화가 가장 작은 것부터 줄였다.

카카오는 정답 토큰 하나만 학습하는 대신 전체 어휘의 다음 토큰 확률 분포를 맞추는 Full-Vocabulary KL 증류로, 약 1억 파라미터 Tiny가 약 9억 파라미터 Large의 분포를 따르도록 학습했다고 설명했다. Tiny에는 마지막 학습 과정으로 On-Policy Distillation도 추가해, Tiny가 직접 생성한 토큰의 문맥에서 Tiny의 다음 토큰 분포를 Large에 가깝게 학습시켰다. [S17]

### 비교 평가의 범위

성능 비교는 Kanana-2-1.3b-instruct와 VLM 구조(ViT→Projector→LLM)를 고정하고 비전 인코더만 바꿔 같은 조건에서 학습·평가한 회사 실험이다. Google·Meta·Apple·Alibaba의 공개 인코더와 Medium·Tiny를 각각 약 4억·1억 파라미터 규모에서 비교했다. 평가는 STEM·퍼즐, 일반 시각 질의응답, 지시 이행·정렬, 영어 OCR·문서 이해, 세밀한 인식, 시각적 위치 인식, 한국어 OCR·문서 이해, 한국어 시험, 한국 문화 이해의 9개 영역·42개 벤치마크로 구성됐다.

회사 평가에서 Medium의 시각적 위치 인식은 78.0점, 한국어 OCR·문서 이해는 71.6점이었고, Tiny는 각각 67.8점과 65.6점이었다. 9개 영역 평균은 Tiny(9,800만 파라미터)가 51.81점, Medium(4억 2,600만 파라미터)이 55.62점으로 각각 해당 파라미터 규모의 비교 대상 중 가장 높았다고 카카오는 밝혔다. [S17]

## Roche, IgA 신병증 임상 3상서 sefaxersen의 단백뇨 감소 결과 발표

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** Roche

Roche는 2026년 10월 23일, 최적화된 표준 치료를 받는 원발성 IgA 신병증 성인 대상 3상 IMAgINATION 연구에서 시험 중인 sefaxersen이 위약 대비 37주 시점의 단백뇨를 24시간 소변 단백질-크레아티닌 비율(UPCR) 기준으로 43.1% 줄였다는 중간 결과를 발표했다. 신장 기능 변화는 눈가림 연구를 계속해 105주 시점의 추정 사구체여과율(eGFR)로 평가할 예정이다. [S18]

### 37주 결과와 안전성

Roche가 제시한 단백뇨 감소 효과의 95% 신뢰구간은 32.5\~52.0%였고, P값은 0.0001 미만이었다.

기저 혈뇨가 있던 환자 중 37주에 혈뇨가 해소된 비율은 sefaxersen군이 위약군보다 높았다. Roche는 사전에 정한 모든 환자 하위군의 치료 효과가 주평가변수에서 나타난 단백뇨 감소 결과와 일관됐다고 설명했다.

Roche는 내약성이 양호했고 안전성 양상이 이전 2상과 일치했으며 새 안전 신호는 없었다고 보고했다. [S18]

### 시험 설계와 후속 평가

IMAgINATION은 진행 위험이 높은 원발성 IgA 신병증에서 피하 투여 sefaxersen의 효능과 안전성을 평가하는 다기관·무작위배정·이중맹검·위약 대조 연구다. 등록한 459명을 sefaxersen 또는 위약에 1:1로 배정해 105주간 평가한다.

참가자는 연구자 재량으로 105주 이후 공개투여로 전환할 수 있으며, 공통 종료 시점이 먼저 오면 그 시점 이후 전환할 수 있다.

1차 평가변수는 37주 시점의 기저치 대비 UPCR 변화다. 신장 기능에 대해서는 105주 eGFR로 2년간의 변화를 평가할 예정이며, 자료를 보건당국과 공유할 계획이다. [S18]

### 간 표적 ASO와 투여 설계

Roche는 sefaxersen을 보체 인자 B의 생성을 억제하는 고특이 간 표적 안티센스 올리고뉴클레오타이드(ASO)로 소개했으며, IgA 신병증에서 이 방식으로 평가하는 첫 약물이라고 설명했다. 회사는 혈중 보체 인자 B를 낮추면 신장 기능과 관련된 지표인 소변 단백질이 줄어든다고 설명했다.

시험 중인 이 약물은 대체 보체 경로를 지속적으로 조절해 월 1회 피하 투여하고 집에서 자가 투여할 수 있도록 설계됐다. 이는 Roche가 설명한 투여 설계와 의도다. [S18]

## AOMEI 업데이트 서버, 5~10분씩 설정 변조돼 공급망 침해에 악용

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** Google Threat Intelligence Group, Mandiant, AOMEI Technology

Google Threat Intelligence Group(GTIG)와 Mandiant는 2026년 10월 15일 보고서에서 2026년 4\~7월 AOMEI Technology의 업데이트 인프라를 겨냥한 소프트웨어 공급망 침해 캠페인을 조사했다고 밝혔다. 공격자는 AOMEI 원본 서버의 설정을 반복해서 짧게 변조했으며, 각 변조 구간은 정상 설정으로 되돌아가기 전까지 5\~10분간 이어졌다. 캠페인에는 CROSSROAD 다운로더와 SHINYROAD 백도어가 포함된 다단계 페이로드가 쓰였고, 보고서는 이를 UNC7017로 추적하는 위협 클러스터에 귀속했다. 보고서가 확인한 노출 구간은 5월 28일 05:40\~05:50 UTC의 10분, 7월 16일 08:33\~08:39 UTC의 6분, 7월 20일 10:35\~10:40 UTC의 5분이었다. [S19]

### 업데이트 경로를 악용한 침투

AOMEI Backupper는 데이터 백업·디스크 복제·재해 복구를, AnyViewer는 원격 데스크톱 접근·지원을 제공한다. 두 제품 이용자의 클라이언트와 관련 백그라운드 서비스는 ABMarket 업데이트 흐름을 통해 HTTPS로 원격 엔드포인트를 주기적으로 확인한다.

UNC7017은 소프트웨어 취약점 대신 AOMEI 클라이언트의 정상 업데이트 및 팝업 표시 흐름을 악용했다. 변조 구간에 업데이트를 확인한 클라이언트는 정상 업데이트 대신 공격자 서버의 악성 ZIP을 내려받고, 변경된 알림 설정에 따라 이를 로컬에서 실행할 수 있었다.

7월 16일 6분간의 노출 중에는 Notifycfg.ini에 반복 설정 섹션 3만 5천 줄 초과가 삽입됐다. 이 설정은 설치된 버전과 관계없이 업데이트를 강제하고, 압축 해제된 CROSSROAD 드로퍼 upgrade-now.exe를 실행하도록 구성됐다. [S19]

### 다른 페이로드와 피해 범위

공격자는 WebDAV를 통해 클라이언트가 원격 file:// 리소스를 요청하게 해, 사용자에게 보이지 않는 방식으로 엔드포인트가 NetNTLMv2 인증 해시를 공격자 통제 서버로 전송하도록 유도할 수 있었다.

보고서는 RadminComponentRuntime 예약 작업이 서명된 Radmin 실행 파일을 시작한 뒤 검색 순서 하이재킹으로 서명되지 않은 BlkScrDl.dll을 불러오는 경로도 설명했다. 공격자는 이 DLL을 Radmin의 정상적인 “blank screen” 드라이버 라이브러리처럼 보이도록 이름 지었다.

가용 텔레메트리에서 확인된 피해 조직은 IT 서비스·통신·고등교육 분야에 걸쳐 호주·브라질·인도·파키스탄·포르투갈·싱가포르·남아프리카공화국·스페인·스위스·튀르키예·미국에서 관측됐다. 변조 구간에 업데이트 서버를 확인한 모든 시스템에 악성코드를 전달하려는 기회주의적 배포였으므로, 보고서는 직접 확인한 조직보다 피해가 넓을 가능성이 있다고 설명했다. [S19]

### 서버 조치 뒤에도 필요한 대응

보고서에 따르면 AOMEI Technology는 2026년 7월 29일 시정 조치를 취했다고 답했다. 다만 서버 설정을 정상화해도 앞선 노출 구간에 악성 업데이트를 받은 엔드포인트가 정리되는 것은 아니다.

노출 구간에 업데이트를 확인해 예약 작업 등을 통해 지속성 페이로드를 내려받은 엔드포인트는 서버의 설정 파일이 복구된 뒤에도 영향을 받을 수 있다. 보고서는 AOMEI 소프트웨어를 운영하는 조직에 제공된 지표와 YARA 규칙을 사용해 2026년 4\~7월 전체 기간을 대상으로 엔드포인트와 네트워크를 소급 헌팅하라고 권고했다. [S19]

### 업데이트 검증과 사고 분석 권고

보고서는 공급업체가 다운로드된 실행 파일과 아카이브를 추출하거나 실행하기 전에 Authenticode 서명과 공급업체 인증서를 검증하고, HTTPS나 인증되지 않은 설정 파일의 평문 MD5 같은 원격 체크섬만 신뢰하지 말라고 권고했다. 원격 .ini·.json·.xml 설정 파일에도 비대칭 공개키 암호기법으로 디지털 서명을 적용해 유효한 서명이 없으면 클라이언트가 거부하도록 제안했다.

설정이 5\~10분 뒤 정상으로 돌아오면, 경보 후 공급업체 URL을 실시간 확인한 분석가는 정상 파일을 보고 경보를 오탐으로 판단할 수 있다. 보고서는 실시간 웹 확인에만 의존하지 말고 AOMEI의 Tmphtml 경로에 캐시된 설정 파일을 보존·분석하며, 경보가 발생한 정확한 초에 해당하는 프록시·방화벽 기록과 대조하라고 권고했다.

GTIG와 METAL의 텔레메트리에서는 2026년의 여러 변조 구간과 4월 말부터 실제 환경에서 관측된 관련 악성코드 샘플을 확인했다. 연구진은 노출 시간이 짧아 가시성 밖에서 추가 변조가 있었을 가능성을 남겼으며, 활성 구간에 업데이트를 확인한 시스템은 악성 지시를, 그 전후에는 정상 파일을 받았다고 설명했다. [S19]

## Dream Labs, 9000만 달러 시드 투자 유치와 Dream API 공개

**분야:** 로봇·제조
**테마:** 제품·서비스
**보조 테마:** 투자·기업거래
**세부 태그:** 신제품, 투자 유치
**기업·기관:** Dream Labs, B Capital, Kindred Ventures, A.Capital, Unusual Ventures, SV Angel, Wing VC, Scribble VC

2026년 10월 22일(한국시간) 보도에 따르면 Dream Labs는 시드 투자 9000만 달러를 유치하고, 로봇 카메라 영상과 영어 자연어 지시를 모터 명령으로 바꾸는 Dream API를 출시했다고 밝혔다. 회사는 Dream-1이 일상 작업을 수행하는 사람들의 영상으로 학습해 다음 상황과 로봇 동작을 예측하며, 제조사가 다른 로봇에서도 작동한다고 설명했다. Dream Labs에 따르면 Dream-1은 평행 그리퍼가 달린 양팔 로봇을 추가 데이터 없이 제어할 수 있고, 현재 물체 집기·놓기와 빨래 개기 같은 탁상 작업을 처리하며 바퀴형 이동 로봇과 손재주 로봇 지원은 계획 중이다. [S20]

### 사용 조건과 추가 작업 지원

보도 시점인 10월 22일부터 개발자와 로봇 애호가가 회사의 AI 제품을 사용할 수 있다고 보고서는 전했다. Dream Labs는 등록 사용자가 그리퍼 장착 로봇을 연결해 Dream API를 이용할 수 있고, 현재 지원하는 로봇의 가격은 약 2,000\~10,000달러라고 설명했다.

Dream Labs는 20곳이 넘는 하드웨어 파트너와 협력하며 로봇별로 모델을 조정한다고 밝혔다. 지원되지 않는 하드웨어나 새로운 기능에는 소량의 시연 데이터를 제출하면 몇 시간 안에 맞춤 모델을 제공하는 미세 조정 서비스를 운영한다. [S20]

### 투자 참여사와 자금 사용 계획

이번 투자 라운드는 B Capital과 Kindred Ventures가 주도했으며 A.Capital, Unusual Ventures, SV Angel, Wing VC, Scribble VC 등이 참여했다. Dream Labs는 투자금을 주로 컴퓨팅에 투입해 Dream-1의 지원 작업과 로봇 범위를 넓히고 더 많은 사용자를 지원할 계획이라고 밝혔다. [S20]

## Next.js CVE-2026-96889 보안 업데이트 권고

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 오류 수정
**기업·기관:** Vercel

2026년 10월 20일자 권고문은 Next.js의 Use After Free 취약점 CVE-2026-96889와 이를 해결한 Vercel 보안 업데이트를 안내했다. 권고문 표의 첫 행은 15.5.28 미만을 영향 판본·15.5.28 이상을 해결 판본으로, 둘째 행은 16.4.1 미만을 영향 판본·16.4.1 이상을 해결 판본으로 제시한다. 영향을 받는 버전을 사용하는 이용자에게는 해결 방안에 따라 최신 버전으로 업데이트할 것을 권고했다. [S21]



## GitHub Copilot 영향 대시보드에 업계 비교 기능 추가

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 사업·고객
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 10월 22일 현지 기준 변경 안내에서 Copilot 영향 대시보드에 ‘Industry comparison’ 섹션이 추가됐다고 밝혔다. 참여 기업의 집계 벤치마크와 에이전트 우선·멀티 에이전트 사용자 비중 및 에이전트 사용자와 비에이전트 사용자의 풀 리퀘스트 병합률을 비교하는 기능으로, 참여는 기본 비활성화된 선택 사항이다. [S22]

### 비교 지표와 집단 선택

충분한 기업이 참여하면 각 점수는 28일 보고 기간의 비교집단 중앙값을 기준으로 순위가 매겨지며, 집단이 더 커지면 상위 십분위(top decile)와도 비교한다.

기업 소유자와 기업 소속이 아닌 조직의 소유자는 직원 규모 구간과 10개 산업 중 하나를 선택해 같은 산업 또는 전체 산업과 비교할 수 있다. 직원 규모의 예시는 1\~999명, 1,000\~4,999명, 5,000명 이상이다.

선택한 산업의 비교집단이 너무 작으면 같은 직원 규모의 전체 산업으로 범위가 넓어지며, 대시보드는 실제 사용한 비교집단을 표시한다. [S22]

### 참여 자격과 순위가 보이지 않는 경우

기업과 기업 소속이 아닌 조직이 참여할 수 있으며, 기업 소속 조직은 그 기업을 통해 참여한다. Copilot Business 라이선스 할당에만 쓰이는 기업은 참여할 수 없다. Copilot 사용량 지표 정책이 켜져 있어야 하며, 대시보드 열람 권한이 있는 사용자는 비교 결과를 볼 수 있다.

참여 기업이 충분하지 않으면 중앙값만 보이거나 선택보다 넓은 비교집단이 사용되고, 순위가 아직 표시되지 않을 수 있다. 조직의 모든 사용자가 이미 에이전트 우선 또는 멀티 에이전트여서 활용도 지표의 비에이전트 기준선을 계산할 수 없는 경우에도 순위는 제공되지 않는다. [S22]

### 정책과 데이터 처리

대시보드와 기업·조직의 Copilot 정책 설정은 같은 참여 정책을 조절한다. 어느 경로에서든 끄면 데이터 기여와 비교 접근이 중단되고, 비교 표시는 즉시 사라지며 데이터는 다음 일일 갱신부터 제외된다.

비교 결과는 매일 갱신되고, 식별 정보가 없는 집계 벤치마크는 30일 뒤 삭제된다.

데이터 상주 기능을 사용하는 GitHub Enterprise Cloud에서는 같은 지역의 참여자끼리만 비교하며, 지역 간 데이터는 합쳐지지 않는다. [S22]

### 대시보드 안에서만 제공

업계 비교 결과는 Copilot 영향 대시보드에서만 제공되며, Copilot 사용량 지표 API·NDJSON 내보내기·다운로드에는 포함되지 않는다. [S22]

## AWS, OpenSearch Serverless에 S3용 지능형 수집 기능 제공

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 22일 Amazon OpenSearch Serverless에 S3의 로그와 문서를 검색 가능한 콘텐츠로 바꾸는 완전 관리형 intelligent ingestion을 제공한다고 밝혔다. 이 기능은 JSON·NDJSON·JSON array 형식의 관측 로그와 구조화 데이터, PDF·Word·일반 텍스트·Markdown 파일을 지원한다. Amazon S3를 소스로 하는 Amazon OpenSearch Serverless (NextGen) 컬렉션에서 AWS 7개 리전에 제공되며, 마이그레이션·백필용 일회성 작업과 새 객체를 반영하는 수집 스트림을 지원한다. [S23]

### 입력 처리와 용량·과금 범위

AWS 설명에 따르면 Console에서 몇 번의 클릭 또는 API 호출 한 번으로 수집을 설정할 수 있다. S3 소스와 컬렉션 인덱스를 지정하면 데이터 유형 감지, 문서 파싱, 텍스트 분할과 색인 처리를 맡으므로 별도의 수집·문서 처리 인프라를 관리할 필요가 없다.

구조화 데이터에는 파이프라인 코드 없이 변환을 적용하고 임베딩을 선택적으로 추가할 수 있다. 비구조화 문서는 제목 구조와 읽기 순서, 표를 보존해 파싱하며, 차트·도표·스크린샷·사진이 있는 문서는 비전 언어 모델이 만든 설명도 주변 콘텐츠와 함께 색인한다.

S3 소스 버킷은 컬렉션과 같은 AWS 계정이나 다른 계정에 둘 수 있다. 처리 용량은 워크로드에 따라 컬렉션에 설정된 한도까지 확장되며, 사용자는 실제 처리가 이뤄지는 동안에만 요금을 낸다. [S23]

## AWS, Megaport와 Interconnect 라스트마일 프리뷰 출시

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** AWS, Megaport

AWS는 2026년 10월 22일 Megaport와 함께 지사·데이터센터·원격지에서 AWS로 연결하는 완전 관리형 서비스 AWS Interconnect - last mile의 프리뷰를 출시했다. 프리뷰는 Megaport를 통해 미국 산호세(us-west-1)와 북버지니아(us-east-1) 대도시권에서 제공된다. 정식 출시(GA) 때는 AWS Console에서 대역폭을 1 Gbps에서 100 Gbps까지 동적으로 조정할 수 있도록 할 계획이다. [S24]

### 연결 정보와 활성화 키로 구성

고객은 AWS Management Console에서 리전, 대역폭, Direct Connect Gateway ID, 파트너 구독자 ID를 선택해 사설 고속 연결을 만든다. AWS는 Megaport 프로비저닝용 활성화 키를 생성하고, 사전 프로비저닝 용량으로 BGP 피어링·VLAN·ASN 구성을 자동화한다.

고객은 Console·CLI·API로 연결을 생성할 수 있으며, 파트너는 GitHub에 공개된 API 패키지를 통해 서비스를 도입할 수 있다. [S24]

## Amazon SageMaker AI, 서버리스 모델 맞춤화에 학습 세션 API 추가

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

Amazon SageMaker AI는 2026년 10월 22일 서버리스 모델 맞춤화에 학습 세션 API를 지원한다고 발표했으며, 고객은 GPU 인프라를 직접 프로비저닝하거나 관리하지 않고 추가 학습(post-training) 알고리즘을 제어할 수 있다. 고객은 라이브 상태형 세션에서 자체 학습 루프와 연산 호출을 구성하고, SageMaker AI는 GPU 할당, 모델·LoRA 로딩, 분산 실행, 장애 복구, 체크포인트 저장과 보안을 처리한다. 요금은 처리 토큰 기준으로 부과돼 보상 점수 계산 같은 로컬 연산은 GPU 시간으로 청구되지 않으며, API는 미국 동부(버지니아 북부), 미국 서부(오리건), 아시아 태평양(뭄바이)에서 일반 제공된다. [S25]

### 학습 연산과 재개

고객은 Python 코드에서 forward\_backward(), optim\_step(), sample()을 호출해 상태가 유지되는 세션의 학습 루프를 구성할 수 있다. 강화학습, 지도 미세조정 또는 자체 학습 목표를 구동할 수 있고, 체크포인팅과 재개 기능도 제공된다. [S25]

### 학습 레시피

Amazon SageMaker AI는 고객이 자체 학습 루프의 청사진으로 활용할 수 있는 실행 준비된 SFT 및 강화학습 레시피를 담은 트레이닝 세션 쿡북도 공개한다. [S25]

## AWS, AgentCore Gateway에 Bedrock API와 모델 대체 라우팅 추가

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 22일 Amazon Bedrock AgentCore Gateway의 추론 엔드포인트가 Amazon Bedrock InvokeModel 및 InvokeModelWithResponseStream API와 추론 트래픽용 모델 대체 라우팅을 지원한다고 밝혔다. AWS에 따르면 기본 목적지가 요청 제한, 용량 부족 또는 연결 불가 상태일 때 게이트웨이는 대체 모델이나 제공자로 요청을 라우팅해 클라이언트마다 별도의 재시도 로직을 구현할 필요를 줄인다. 이 기능은 중국을 제외하고 AgentCore Gateway를 제공하는 모든 AWS 리전에서 이용할 수 있다. [S26]

### 전환 규칙과 클라이언트 연결

사용자는 게이트웨이 규칙에 대체 목적지의 순서와 전환 조건을 지정한다. 전환 조건에는 요청 제한, 서버 오류, 응답 시간 초과 등이 있으며, 내장 회로 차단기는 현재 실패 중인 목적지를 건너뛴다.

AWS는 대체 목적지를 찾는 내부 시도가 게이트웨이 뒤에서 처리되므로 클라이언트는 요청 하나를 보내고 응답 하나를 받는다고 설명한다.

기존 Amazon Bedrock SDK 연동을 게이트웨이에 연결하면 제공자별로 클라이언트 코드를 다시 작성하지 않고도 하나의 관리 엔드포인트를 통해 모델 제공자에 접근할 수 있다. [S26]

## AWS Transit Gateway·Cloud WAN, attachment에 관리형 1:1 NAT 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 23일 AWS Transit Gateway와 AWS Cloud WAN attachment에서 Regional Private NAT Gateway 통합을 통한 관리형 1:1 NAT를 제공한다고 발표했다. 이 기능으로 고객은 IP 주소 대역이 겹치는 사설 네트워크를 주소 변경이나 NAT 장비 배포, 반환 트래픽 규칙 작성 없이 연결할 수 있다. AWS는 두 서비스가 운영되는 모든 상용 리전에서 이 기능을 제공한다고 밝혔다. [S27]

### 양방향 변환과 관리 범위

고객은 Transit Gateway 또는 Cloud WAN attachment에서 각 source CIDR이 변환될 private IP 범위를 지정한다. 지원 연결에는 Amazon VPC, AWS Site-to-Site VPN, AWS Direct Connect, Transit Gateway Connect를 통해 연결된 SD-WAN 장비가 포함된다. 두 서비스가 변환을 양방향으로 자동 적용하며, AWS는 attachment의 NAT 기능을 운영·확장·관리한다.

설정은 AWS Management Console, AWS CLI, AWS SDKs, AWS CloudFormation으로 할 수 있으며, 변환된 트래픽은 Amazon CloudWatch 지표와 Amazon EventBridge 이벤트로 모니터링할 수 있다. [S27]

## AWS CloudFormation, 미완료 롤백 절차를 한 번에 끝내는 force rollback 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 22일 일부 리소스가 자동으로 롤백되지 않을 때 CloudFormation의 force rollback으로 롤백 절차를 한 번의 작업으로 완료할 수 있다고 발표했다. 외부 변경 등으로 여전히 조치가 필요한 리소스는 기록되며, 사용자는 다음 배포 전에 이를 검토하고 해결해야 한다. [S28]

### 롤백 뒤 구성 차이 확인

AWS는 force rollback 옵션으로 continue update rollback을 실행한 다음 drift-aware change set을 생성해 다음 배포 전에 구성 차이를 검토하라고 안내한다.

force rollback은 AWS CLI와 SDK, AWS CDK, AI agents를 포함한 모든 CloudFormation 워크플로에서 사용할 수 있다. [S28]

## GitHub Apps 기업 설치 GA…정책·보안·관리 API 지원 확대

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 10월 23일 GitHub Apps의 기업 설치를 정식 제공(GA)하고, 기업·조직의 정책·보안·관리 API 지원을 확대했다고 발표했다. 지원 범위가 넓어지면서 더 많은 기업·조직 자동화에서 클래식 PAT를 GitHub Apps로 대체할 수 있게 됐다고 회사는 설명했다. [S29]

### 정책 권한과 필수 설정 읽기

Enterprise organization and repository policies 권한은 Read/write로, EnterpriseOwnerInfo의 정책 필드를 읽고 비공개 저장소 포크·기본 저장소 권한·저장소 공개 범위·저장소 생성과 삭제·이슈 삭제·협력자 초대·배포 키·보호 브랜치 갱신·dependency insights·조직 및 저장소 프로젝트 설정을 변경하는 API를 지원한다.

Enterprise settings는 Read/write로 기업 데이터, 서버 설치와 조직 초대 정보를 읽고 기업 프로필을 갱신한다. 기업 조직·저장소 정책에 접근하려면 이 Enterprise settings의 Read 권한이 필요하다. [S29]

### 보안과 규칙 관리의 권한 차이

기업·조직 IP 허용 목록은 Read/write로 항목 읽기·생성·수정·삭제를 지원한다. 허용 목록 적용, GitHub Apps 신뢰 설정, Enterprise Managed Users의 사용자 수준 적용도 전환할 수 있다.

기업 접근 제한은 Write 권한으로 켜거나 끌 수 있다. 기업 저장소 규칙 집합도 Write 권한으로 기업 rules REST API와 GraphQL의 RepositoryRuleset을 통해 관리한다.

Enterprise bypass requests는 Read, 기업 2단계 인증은 Read/write, 기업·조직 검증 도메인은 Write로 구분된다. [S29]

### 기존 권한의 API 보완과 이전 조건

기존 Enterprise people Read/write 권한에서는 EnterpriseRepositoryInfo를 읽으며, EnterpriseOwnerInfo.outsideCollaborators를 통한 저장소 세부 정보도 확인할 수 있다. 지원 API 항목에는 자신을 소유자 또는 구성원 역할로 조직에 추가하는 작업도 포함된다.

Enterprise billing Write 권한은 Marketplace의 구성원 구매 설정 갱신을 지원한다. GitHub는 이런 API·객체 지원 보완이 더 많은 자동화 시나리오를 가능하게 할 것으로 설명했다.

이전할 워크플로에 필요한 권한은 사용자가 GitHub App에서 선택해야 한다. 해당 업데이트의 GHES 3.24 제공은 향후 예정이다. [S29]

## Amazon SageMaker AI, Muse Glimmer·Qwen3.8·Ministral 3 서버리스 맞춤화 지원

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Amazon

Amazon은 2026년 10월 22일 Amazon SageMaker AI에서 Muse Glimmer, Qwen3.8 27B, Ministral 3 3B·8B·14B 모델의 기존 배포 지원에 더해 서버리스 맞춤화 지원을 추가했다고 발표했다. Amazon은 도메인과 업무 흐름에 맞춘 학습에 지도 미세 조정(SFT)·직접 선호도 최적화(DPO)·강화 미세 조정(RFT)을 사용할 수 있으며, 모델 적응 방식으로 저랭크 적응(LoRA) 또는 전체 미세 조정을 지원한다고 설명했다. Amazon은 사용자가 자체 데이터를 제공하면 SageMaker AI가 인프라 준비와 학습 오케스트레이션을 맡고, 사용자는 데이터와 평가에 집중하며 사용한 만큼 비용을 낸다고 설명했다. Amazon에 따르면 서버리스 맞춤화는 미국 동부(버지니아 북부), 미국 서부(오리건), 아시아 태평양(도쿄), 유럽(아일랜드)에서 이용할 수 있으며, SageMaker Studio의 Models 페이지, SageMaker Python SDK 또는 코딩 보조 도구와 함께 쓰는 Agent skills로 맞춤화 작업을 시작할 수 있다. [S30]

### 맞춤화 방식

Amazon은 라벨이 붙은 데이터로 도메인별 작업의 정확도를 높이는 데 SFT를, 선호 데이터로 출력을 조직의 어조에 맞추는 데 DPO를, 보상 신호로 새 작업 성능을 높이는 데 RFT를 활용할 수 있다고 설명했다. [S30]

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

- [S1] https://news.skhynix.com/en/fact-12/
- [S2] https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72237
- [S3] https://www.nasa.gov/centers-and-facilities/glenn/sr-1-freedom-advances-with-progress-on-nuclear-power-module/
- [S4] https://news.mit.edu/2026/design-software-reimagines-everyday-objects-as-self-aware-devices-1022
- [S5] https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-beyondtrust/
- [S6] https://www.fda.gov/news-events/press-announcements/fda-approves-immunotherapy-may-allow-certain-patients-rectal-cancer-avoid-chemotherapy-radiation-and
- [S7] https://www.kari.re.kr/kor/article/ATCL87374b48c/18740
- [S8] https://news.mit.edu/2026/teaching-ai-about-symmetry-could-make-prenatal-diagnosis-more-reliable-1019
- [S9] https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1939068/full
- [S10] https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1926428/full
- [S11] https://spectrum.ieee.org/agility-robotics-digit-5-redesign
- [S12] https://www.bioin.or.kr/rsrch_Rslt.do?num=317183&cmd=view&bid=research&cPage=1&listCnt=50
- [S13] https://science.nasa.gov/earth/earth-observatory/fires-char-new-guinea/
- [S14] https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1900388/full
- [S15] https://www.kari.re.kr/kor/article/ATCL87374b48c/18746
- [S16] https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72230
- [S17] https://tech.kakao.com/posts/840
- [S18] https://www.roche.com/media/releases/med-cor-2026-10-23
- [S19] https://cloud.google.com/blog/topics/threat-intelligence/investigating-ephemeral-supply-chain-tampering/
- [S20] https://www.therobotreport.com/dream-labs-raises-90m-and-launches-dream-api/
- [S21] https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=2&categoryCode=&nttId=72221
- [S22] https://github.blog/changelog/2026-10-22-industry-comparisons-in-the-copilot-impact-dashboard
- [S23] https://aws.amazon.com/about-aws/whats-new/2026/10/amazon-opensearch-intelligent-ingestion-logs-documents-s3
- [S24] https://aws.amazon.com/about-aws/whats-new/2026/10/aws-announces-AWS-interconnect-last-mile-megaport-preview/
- [S25] https://aws.amazon.com/about-aws/whats-new/2026/10/training-session-apis-on-sagemaker-ai
- [S26] https://aws.amazon.com/about-aws/whats-new/2026/10/agentcore-gateway-invokemodel-fallback/
- [S27] https://aws.amazon.com/about-aws/whats-new/2026/10/aws-transit-gateway-cloud-wan-1-1-nat/
- [S28] https://aws.amazon.com/about-aws/whats-new/2026/10/aws-cloudformation-cdk/
- [S29] https://github.blog/changelog/2026-10-23-enterprise-installations-for-github-apps-generally-available
- [S30] https://aws.amazon.com/about-aws/whats-new/2026/10/amazon-sagemaker-muse-qwen-ministral/
