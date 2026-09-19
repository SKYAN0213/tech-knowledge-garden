---
title: 2026-09-20 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-09-20
timezone: Asia/Seoul
coverage_start: 2026-09-13T23:12:04.828Z
coverage_end: 2026-09-19T23:16:34.765Z
source_count: 12
new_items_count: 12
linked_knowledge_notes:
  - Knowledge/AI Systems/Conversational Voice AI
knowledge_notes_created: []
knowledge_notes_updated:
  - Knowledge/AI Systems/Conversational Voice AI
editorial_format: six-w/v1
theme_format: news-themes/v1
briefing_format: sector-five/v1
headlines:
  - Universal Robots, 센서 연결과 힘 제어를 통합한 Gen 7 협동로봇 공개
  - 네이버지도, 대화로 장소를 찾고 동의 후 예약하는 플레이스 에이전트 출시
  - 캐나다 사이버센터, 실제 악용 중인 Cisco ISE 취약점 패치 권고
  - 네이버·거린에너지, 216MW 태양광 사업 지분 투자·전력 구매 협의
  - Roche, 재발성 여포성 림프종 3상에서 무진행생존기간 개선 발표
article_records:
  - title: Google, 대화와 배경 작업을 함께 처리하는 Gemini 3.8 Live 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google
      when: 2026-09-15 발표, 09-17 안내 갱신
      where: Gemini API·AI Studio 및 Google 제품
      what: 실시간 음성 모델 두 종류 공개
      how: 시각 입력과 배경 도구 호출, 동시 추론·발화
      why: 음성 대화 중 복잡한 업무를 이어서 처리
    lead: Google은 9월 15일 음성 대화 모델 Gemini 3.8 Live와 Extended Thinking을 공개하고, 17일 갱신한
      안내에서 Gemini API와 AI Studio 등을 통한 순차 제공 범위를 설명했다. 두 모델은 시각 정보를 대화에 반영하고,
      도구나 API가 배경에서 실행되는 동안에도 사용자와 대화를 이어 간다. Extended Thinking은 여러 단계의 추론이 필요한
      작업에서 말하기와 추론을 함께 수행하도록 설계됐다.
    papers: []
    relations: []
    topic_ids:
      - agent-runtime
    explanations:
      - heading: 대화를 멈추지 않고 작업 진행을 전달
        paragraphs:
          - Live는 97개 언어를 인식해 대화 중 언어를 전환한다. Extended Thinking은 요청을 받았다는 짧은 응답을
            먼저 하고, 여러 단계의 배경 작업이 진행되는 상황을 말로 전달한다. 기업용 Gemini Enterprise 제공은 비공개
            프리뷰이며, 개인용 앱과 Workspace의 제공 대상은 제품·구독별로 다르다.
        source_urls:
          - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/
  - title: 네이버지도, 대화로 장소를 찾고 동의 후 예약하는 플레이스 에이전트 출시
    kind: 사건 뉴스
    region: 국내
    facts:
      who: NAVER
      when: 2026-09-17
      where: 국내 네이버지도 앱
      what: 플레이스 에이전트 공개
      how: 대화 조건과 장소 데이터로 추천 후 동의 기반 예약 신청
      why: 복잡한 장소 탐색과 예약 절차 연결
    lead: 네이버는 9월 17일 지도앱에서 대화로 장소를 추천받고 예약을 신청하는 ‘플레이스 에이전트’를 공개했다. 사용자가 위치와 여러 조건을
      한 문장으로 입력하면 플레이스 정보·방문자 리뷰·블로그 후기·예약 가능 여부를 반영해 장소와 추천 이유를 제시한다. 네이버 예약이
      연결된 장소에서는 날짜·시간·인원을 받은 뒤 예약 조건을 보여 주고 사용자 동의를 거쳐 신청한다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 검색 조건을 다시 입력하지 않고 좁혀 가기
        paragraphs:
          - 첫 추천 뒤에도 대화를 이어 가며 필요한 조건을 더할 수 있다. 이용 대상은 로그인한 만 14세 이상 사용자이며, 지도
            검색 영역의 에이전트 아이콘으로 시작한다. 장소 추천과 예약 신청은 연결되지만, 예약 실행에는 사용자의 동의 단계가
            들어간다.
        source_urls:
          - https://navercorp.com/media/pressReleasesDetail?seq=10034667
  - title: 삼성전자, 한국 Galaxy S26부터 One UI 9 업데이트 시작
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 삼성전자
      when: 2026-09-16 배포 시작, 09-17 발표
      where: 한국 Galaxy S26부터
      what: One UI 9 공식 업데이트
      how: 기기별 순차 소프트웨어 배포
      why: 영상 활용·기기 관리·보안 기능 개선
    lead: 삼성전자는 9월 17일 One UI 9 공식 업데이트를 전날 한국 Galaxy S26 시리즈부터 시작했다고 발표했다. 선택한 인물을
      따라 영상을 구성하는 ‘마이 팬캠’과 기기의 보증·수리 정보를 모으는 ‘워런티 케어’ 등을 추가했다. 업데이트는 이후 다른 국가와
      Galaxy 기기로 확대할 예정이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 보증 확인부터 수리 예약까지
        paragraphs:
          - 워런티 케어는 연결된 기기의 보증 정보, 진단, 예상 수리 비용과 서비스 예약을 한곳에 모은다. 보안 브리프는 의심스러운
            앱이나 권한 등 보안 정보를 알려 준다. 개인정보 알림과 음성 변조 탐지는 지원 모델·지역 조건이 달라 모든 기기에서 같은
            기능을 제공하는 것은 아니다.
        source_urls:
          - https://news.samsung.com/kr/삼성전자-one-ui-9-공식-버전-업데이트-시작
  - title: AWS, 메모리를 회수하고 실행 환경을 복원하는 AgentCore Runtime V2 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-09-18
      where: 미국 동부2곳·서부1곳, 아일랜드, 도쿄
      what: AgentCore Runtime V2 제공
      how: 탄력 메모리 회수와 실행 환경 스냅샷 복원
      why: 메모리 비용과 새 세션 시작 지연 감소
    lead: AWS는 9월 18일 Amazon Bedrock AgentCore에 새 Runtime V2를 제공하기 시작했다. 에이전트 세션에
      필요한 메모리를 늘렸다가 사용하지 않는 부분을 회수하고, 미리 준비한 실행 환경의 스냅샷을 복원해 새 인스턴스를 시작한다. 미국 3개
      리전과 아일랜드·도쿄에서 런타임 생성 또는 수정 시 platformVersion을 V2로 지정해 사용할 수 있다.
    papers: []
    relations: []
    topic_ids:
      - agent-runtime
    explanations:
      - heading: 전체 작업시간과 구분해야 하는 시작 지연
        paragraphs:
          - AWS 자체 시험에서 200MB~2GB 컨테이너 이미지의 시작 지연 P75는 V2가 1.9~2.0초, V1이
            5.4~30초였다. P75는 측정값의 75%가 그 시간 이하였다는 뜻이며, 에이전트의 전체 업무 완료시간은 아니다. 메모리
            과금도 세션 최고점 대신 실제 사용량을 따르도록 바뀐다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime-generally-available/
  - title: AWS PrivateLink, 개별 자원 대신 네트워크 구간을 공유하는 터널 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-09-18
      where: 서울 포함 AWS 리전
      what: PrivateLink Tunnel Endpoints 출시
      how: CIDR 범위 공유와 GENEVE 터널
      why: 협력사에 여러 네트워크 자원을 공유하는 설정 단순화
    lead: AWS는 9월 18일 PrivateLink에 다른 VPC나 계정의 네트워크 구간에 접근하는 Tunnel Endpoint를 추가했다.
      고객은 개별 자원마다 설정을 만드는 대신 CIDR로 지정한 IP 주소 범위를 Resource Configuration으로 정의하고
      AWS RAM으로 협력사에 공유할 수 있다. 이 기능은 서울을 포함한 여러 리전에서 제공되며 터널 사용시간과 처리 데이터량에 따라
      과금한다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 공유자가 지정한 주소 범위로 연결
        paragraphs:
          - 공유받은 협력사는 터널 엔드포인트를 만든 뒤 GENEVE 방식으로 패킷을 감싸 고객 VPC의 지정 구간에 전달한다.
            CIDR은 접근할 네트워크 주소 범위를 나타낸다. 새 기능의 변경점은 여러 자원을 담은 구간을 공유 단위로 사용할 수
            있다는 것이다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/9/privatelink-tunnel-endpoint/
  - title: 캐나다 사이버센터, 실제 악용 중인 Cisco ISE 취약점 패치 권고
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 캐나다 사이버보안센터·Cisco
      when: 2026-09-17 권고, 09-16 Cisco 발표
      where: Cisco ISE·ISE-PIC 운영 환경
      what: 취약점3건과 1건 실제 악용 경고
      how: 계열별 수정 패치 및 지원 버전 이동
      why: 인증 우회·권한 접근 위험 대응
    lead: 캐나다 사이버보안센터는 9월 17일 Cisco ISE와 ISE-PIC에 영향을 주는 취약점 3건에 대한 업데이트 적용을 권고했다.
      Cisco는 이 가운데 인증을 우회해 관리자 수준 접근으로 이어질 수 있는 CVE-2026-76460의 실제 악용을 확인했다. 미국
      CISA도 전날 이 취약점을 실제 악용 목록에 추가했다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 설치 계열별 수정 버전 확인
        paragraphs:
          - 권고문은 3.1 Patch 12, 3.2 Patch 11, 3.3 Patch 12, 3.4 Patch 7, 3.5
            Patch 4를 계열별 수정 버전으로 제시한다. 3.0 이하 계열은 지원되는 수정 버전으로 이동해야 한다. 조직은 현재
            설치 버전에 맞는 Cisco 안내를 확인해 패치와 침해 여부 점검을 진행해야 한다.
        source_urls:
          - https://www.cyber.gc.ca/en/alerts-advisories/al26-021-vulnerabilities-impacting-cisco-identity-services-engine-ise-cisco-ise-passive-identity-connector-ise-pic-cve-2026-20192-cve-2026-76423-cve-2026-76460
  - title: Fujitsu, MONAKA CPU 판매는 11월·서버 출하는 내년 4월부터 예고
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Fujitsu
      when: 2026-09-14 발표
      where: 글로벌 CPU, 일본·유럽 서버
      what: MONAKA CPU·서버 판매 계획 공개
      how: 2nm 코어와5nm 캐시·IO의3D결합
      why: 데이터센터용 Arm 컴퓨팅 제품 공급
    lead: Fujitsu는 9월 14일 Arm 기반 FUJITSU-MONAKA CPU와 이를 탑재한 서버의 판매를 2026년 11월부터
      시작한다고 발표했다. CPU는 2nm 코어와 5nm 캐시·입출력 부분을 3차원으로 결합하고, 최대 3.8GHz 동작과
      8,800MT/s 메모리 전송을 지원한다. 일본·유럽의 1U·2U 서버 판매 개시와 별도로 실제 서버 출하는 2027년 4월부터 순차
      진행할 예정이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: CPU 판매와 완제품 출하 일정
        paragraphs:
          - CPU 단품은 서버 제조사와 데이터센터 운영자를 대상으로 2026회계연도 4분기 공급을 계획한다. 발표한 서버는 행렬 연산
            가속·SVE2 벡터 연산과 Arm CCA의 메모리 보호 기능을 활용한다. 주문·판매를 받는 시점과 고객에게 하드웨어가
            전달되는 시점은 서로 다르다.
        source_urls:
          - https://global.fujitsu/en-global/pr/news/2026/09/14-02
  - title: Universal Robots, 센서 연결과 힘 제어를 통합한 Gen 7 협동로봇 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Universal Robots
      when: 2026-09-14
      where: 미국 시카고 IMTS
      what: Gen7 및g-Series3종 공개
      how: 힘·토크 센서, 연결 플랜지, 제어기·소프트웨어 통합
      why: 센서 기반 산업 자동화 구성 지원
    lead: Universal Robots는 9월 14일 미국 시카고 IMTS에서 Gen 7 플랫폼과 g-Series 협동로봇 3종을 공개했다.
      UR10g-1750, UR17g-1300, UR18g-950은 힘·토크 감지와 센서 연결을 통합하고, CB7 제어기와
      PolyScope X 소프트웨어를 함께 사용한다. 로봇에 카메라나 도구를 붙이고 외부 AI·컴퓨터와 연결하는 자동화 구성을 지원한다.
    papers: []
    relations: []
    topic_ids:
      - company-teradyne-robotics
    explanations:
      - heading: 로봇 끝단에서 감지하고 연결
        paragraphs:
          - 끝단 플랜지에는 데이터·전원·안전 연결을 제공해 카메라와 센서를 붙일 수 있다. 내장 힘·토크 센서와 임피던스 제어는 접촉
            힘에 따라 로봇이 반응하도록 하는 기능이다. PolyScope X는 API와 ROS 2를 통해 외부 컴퓨터와 연결하며,
            신형 CB7 제어기는 기존 e-Series와 UR-Series도 지원한다.
        source_urls:
          - https://www.universal-robots.com/news-and-media/news-center/universal-robots-unveils-gen-7-new-platform-industrial-automation-physical-ai/
  - title: Teradyne Robotics, UR·MiR 영업을 총괄할 CCO 선임
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Teradyne Robotics·Jacob Pascual Pape
      when: 2026-09-15
      where: UR·MiR 글로벌 영업 조직
      what: CCO 선임
      how: 두 로봇 사업의 영업 활동 총괄
      why: 글로벌 사업 수행을 맡을 책임자 배치
    lead: Teradyne Robotics는 9월 15일 Jacob Pascual Pape를 최고사업책임자(CCO)로 선임했다. 그는
      Universal Robots와 Mobile Industrial Robots의 글로벌 영업 활동을 총괄한다. 앞서 Universal
      Robots에서 10년 넘게 일했고, 최근에는 Trener Robotics의 글로벌 영업 부사장을 맡았다.
    papers: []
    relations: []
    topic_ids:
      - company-teradyne-robotics
    explanations: []
  - title: 네이버·거린에너지, 216MW 태양광 사업 지분 투자·전력 구매 협의
    kind: 사건 뉴스
    region: 국내
    facts:
      who: NAVER·Gurīn Energy
      when: 2026-09-16
      where: 진도 태양광 사업·국내 데이터센터
      what: 재생에너지 공급 협력MOU
      how: 지분투자·장기PPA 세부조건 협의
      why: 데이터센터 재생에너지 수급 안정성 확보
    lead: 네이버는 9월 16일 거린에너지와 데이터센터용 재생에너지 확보를 위한 양해각서를 체결했다고 발표했다. 진도그린태양광 사업의 일부 지분
      투자와 장기 전력구매계약을 추진하고, 연말 본계약 체결을 목표로 조건을 협의한다. 216MW는 해당 프로젝트가 확보한 전기사업허가
      규모이며, 이번 발표로 전력 공급이나 투자 집행이 완료된 것은 아니다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 전력 구매와 발전 사업 투자 병행
        paragraphs:
          - 거린에너지가 발전소 개발·운영 관리를 주도하고, 네이버는 생산된 재생에너지를 장기간 구매해 각 세종·각 춘천 등의
            데이터센터 운영에 사용할 계획이다. 장기 전력구매계약(PPA)과 지분 투자를 함께 추진하지만, 현재 공개된 단계는 양해각서
            체결이다.
        source_urls:
          - https://www.navercorp.com/media/pressReleasesDetail?seq=10034661
  - title: Roche, 재발성 여포성 림프종 3상에서 무진행생존기간 개선 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche
      when: 2026-09-17
      where: CELESTIMO 다기관 임상시험
      what: 3상 중간분석 1차평가변수 충족 발표
      how: 두 항체·레날리도마이드 병용군의 PFS 비교
      why: 재발성·불응성 여포성 림프종 치료 평가
    lead: Roche는 9월 17일 재발성·불응성 여포성 림프종 환자를 대상으로 한 CELESTIMO 3상 중간 분석에서 1차 평가변수를
      충족했다고 발표했다. 이전 치료를 한 차례 이상 받은 환자에서 모수네투주맙·레날리도마이드 병용을 리툭시맙·레날리도마이드와 비교한
      시험이다. 회사는 질병 진행이나 사망까지의 기간인 무진행생존기간이 통계적으로 유의하게 개선됐다고 밝혔지만, 발표문에 구체적인 효과
      크기는 제시하지 않았다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 중간 결과와 허가 신청 구분
        paragraphs:
          - 모수네투주맙은 CD20과 CD3를 겨냥해 B세포와 T세포를 가까이 연결하는 이중항체다. 전체생존기간 자료는 아직 성숙하지
            않았으며, 회사는 새 안전성 신호가 관찰되지 않았다고 설명했다. 자세한 결과의 학회 발표와 규제기관 제출은 향후 일정으로,
            이번 발표 자체가 새 적응증 허가를 뜻하지 않는다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-09-17
  - title: Rocket Lab, Synspective 레이더 위성의 572km 궤도 발사 완료
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Rocket Lab·Synspective
      when: 2026-09-19 03:22UTC
      where: Launch Complex1→572km궤도
      what: StriX위성 발사 완료
      how: Electron 전용 발사
      why: SAR 지구관측 위성군 구축
    lead: Rocket Lab은 9월 19일 03시 22분 UTC에 Electron으로 일본 Synspective의 StriX 지구관측 위성
      1기를 572km 궤도로 발사했다. ‘Owl By The Dozen’ 임무는 Launch Complex 1에서 이뤄졌으며, 회사의
      전체 96번째이자 Synspective를 위한 12번째 발사다. 이 위성군은 합성개구레이더(SAR) 관측 데이터를 도시계획·기반시설
      감시·재난 대응에 제공한다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 이번 발사와 남은 계약 물량
        paragraphs:
          - 임무 페이지가 밝힌 궤도 경사각은 38도다. Rocket Lab은 Synspective 위성군을 위해 2030년 전까지
            수행할 15건의 추가 발사를 예약받았다고 설명한다. 이 수치는 이번에 완료한 12번째 고객 발사와 구분되는 향후 계약
            물량이다.
        source_urls:
          - https://rocketlabcorp.com/missions/launches/owl-by-the-dozen/
article_reviews:
  - title: Google, 대화와 배경 작업을 함께 처리하는 Gemini 3.8 Live 공개
    event_id: 25823e681aab7b46
    review_status: verified
    published_at: 2026-09-15
    reviewed_at: 2026-09-20
    concept_ids:
      - voice
  - title: 네이버지도, 대화로 장소를 찾고 동의 후 예약하는 플레이스 에이전트 출시
    event_id: 49c6c9190303aebd
    review_status: verified
    published_at: 2026-09-17
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: 삼성전자, 한국 Galaxy S26부터 One UI 9 업데이트 시작
    event_id: 3280c67c6030a293
    review_status: verified
    published_at: 2026-09-17
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: AWS, 메모리를 회수하고 실행 환경을 복원하는 AgentCore Runtime V2 제공
    event_id: 14a53f7d72ef9b9b
    review_status: verified
    published_at: 2026-09-18
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: AWS PrivateLink, 개별 자원 대신 네트워크 구간을 공유하는 터널 추가
    event_id: 9bddd51aa2915e80
    review_status: verified
    published_at: 2026-09-18
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: 캐나다 사이버센터, 실제 악용 중인 Cisco ISE 취약점 패치 권고
    event_id: 60d190b7985f9093
    review_status: verified
    published_at: 2026-09-17
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: Fujitsu, MONAKA CPU 판매는 11월·서버 출하는 내년 4월부터 예고
    event_id: 6f3a6e0e59363e45
    review_status: verified
    published_at: 2026-09-14
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: Universal Robots, 센서 연결과 힘 제어를 통합한 Gen 7 협동로봇 공개
    event_id: ebcefe563a8a7faf
    review_status: verified
    published_at: 2026-09-14
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: Teradyne Robotics, UR·MiR 영업을 총괄할 CCO 선임
    event_id: 2558745b2bfe7d79
    review_status: verified
    published_at: 2026-09-15
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: 네이버·거린에너지, 216MW 태양광 사업 지분 투자·전력 구매 협의
    event_id: 0e528873a64d1ce6
    review_status: verified
    published_at: 2026-09-16
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: Roche, 재발성 여포성 림프종 3상에서 무진행생존기간 개선 발표
    event_id: 21e5701b8e5bea51
    review_status: verified
    published_at: 2026-09-17
    reviewed_at: 2026-09-20
    concept_ids: []
  - title: Rocket Lab, Synspective 레이더 위성의 572km 궤도 발사 완료
    event_id: c8c055684e1b9e3a
    review_status: verified
    published_at: 2026-09-19
    reviewed_at: 2026-09-20
    concept_ids: []
---

# 이번 호 표지

> **한 줄 편집:** 센서를 품은 협동로봇, 대화로 연결되는 예약, 데이터센터의 장기 전력 조달

# 차례

커버 스토리 · 뉴스 데스크

# 커버 스토리

## Universal Robots, 센서 연결과 힘 제어를 통합한 Gen 7 협동로봇 공개

**분야:** 로봇·제조
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Universal Robots, Teradyne Robotics

Universal Robots는 9월 14일 미국 시카고 IMTS에서 Gen 7 플랫폼과 g-Series 협동로봇 3종을 공개했다. UR10g-1750, UR17g-1300, UR18g-950은 힘·토크 감지와 센서 연결을 통합하고, CB7 제어기와 PolyScope X 소프트웨어를 함께 사용한다. 로봇에 카메라나 도구를 붙이고 외부 AI·컴퓨터와 연결하는 자동화 구성을 지원한다. [S8]

### 로봇 끝단에서 감지하고 연결

끝단 플랜지에는 데이터·전원·안전 연결을 제공해 카메라와 센서를 붙일 수 있다. 내장 힘·토크 센서와 임피던스 제어는 접촉 힘에 따라 로봇이 반응하도록 하는 기능이다. PolyScope X는 API와 ROS 2를 통해 외부 컴퓨터와 연결하며, 신형 CB7 제어기는 기존 e-Series와 UR-Series도 지원한다. [S8]

# 뉴스 데스크

## Google, 대화와 배경 작업을 함께 처리하는 Gemini 3.8 Live 공개

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Google

Google은 9월 15일 음성 대화 모델 Gemini 3.8 Live와 Extended Thinking을 공개하고, 17일 갱신한 안내에서 Gemini API와 AI Studio 등을 통한 순차 제공 범위를 설명했다. 두 모델은 시각 정보를 대화에 반영하고, 도구나 API가 배경에서 실행되는 동안에도 사용자와 대화를 이어 간다. Extended Thinking은 여러 단계의 추론이 필요한 작업에서 말하기와 추론을 함께 수행하도록 설계됐다. [S1]

### 대화를 멈추지 않고 작업 진행을 전달

Live는 97개 언어를 인식해 대화 중 언어를 전환한다. Extended Thinking은 요청을 받았다는 짧은 응답을 먼저 하고, 여러 단계의 배경 작업이 진행되는 상황을 말로 전달한다. 기업용 Gemini Enterprise 제공은 비공개 프리뷰이며, 개인용 앱과 Workspace의 제공 대상은 제품·구독별로 다르다. [S1]

**개념:** [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]

## 네이버지도, 대화로 장소를 찾고 동의 후 예약하는 플레이스 에이전트 출시

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** NAVER

네이버는 9월 17일 지도앱에서 대화로 장소를 추천받고 예약을 신청하는 ‘플레이스 에이전트’를 공개했다. 사용자가 위치와 여러 조건을 한 문장으로 입력하면 플레이스 정보·방문자 리뷰·블로그 후기·예약 가능 여부를 반영해 장소와 추천 이유를 제시한다. 네이버 예약이 연결된 장소에서는 날짜·시간·인원을 받은 뒤 예약 조건을 보여 주고 사용자 동의를 거쳐 신청한다. [S2]

### 검색 조건을 다시 입력하지 않고 좁혀 가기

첫 추천 뒤에도 대화를 이어 가며 필요한 조건을 더할 수 있다. 이용 대상은 로그인한 만 14세 이상 사용자이며, 지도 검색 영역의 에이전트 아이콘으로 시작한다. 장소 추천과 예약 신청은 연결되지만, 예약 실행에는 사용자의 동의 단계가 들어간다. [S2]

## 삼성전자, 한국 Galaxy S26부터 One UI 9 업데이트 시작

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 삼성전자

삼성전자는 9월 17일 One UI 9 공식 업데이트를 전날 한국 Galaxy S26 시리즈부터 시작했다고 발표했다. 선택한 인물을 따라 영상을 구성하는 ‘마이 팬캠’과 기기의 보증·수리 정보를 모으는 ‘워런티 케어’ 등을 추가했다. 업데이트는 이후 다른 국가와 Galaxy 기기로 확대할 예정이다. [S3]

### 보증 확인부터 수리 예약까지

워런티 케어는 연결된 기기의 보증 정보, 진단, 예상 수리 비용과 서비스 예약을 한곳에 모은다. 보안 브리프는 의심스러운 앱이나 권한 등 보안 정보를 알려 준다. 개인정보 알림과 음성 변조 탐지는 지원 모델·지역 조건이 달라 모든 기기에서 같은 기능을 제공하는 것은 아니다. [S3]

## AWS, 메모리를 회수하고 실행 환경을 복원하는 AgentCore Runtime V2 제공

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Amazon Web Services

AWS는 9월 18일 Amazon Bedrock AgentCore에 새 Runtime V2를 제공하기 시작했다. 에이전트 세션에 필요한 메모리를 늘렸다가 사용하지 않는 부분을 회수하고, 미리 준비한 실행 환경의 스냅샷을 복원해 새 인스턴스를 시작한다. 미국 3개 리전과 아일랜드·도쿄에서 런타임 생성 또는 수정 시 platformVersion을 V2로 지정해 사용할 수 있다. [S4]

### 전체 작업시간과 구분해야 하는 시작 지연

AWS 자체 시험에서 200MB~2GB 컨테이너 이미지의 시작 지연 P75는 V2가 1.9~2.0초, V1이 5.4~30초였다. P75는 측정값의 75%가 그 시간 이하였다는 뜻이며, 에이전트의 전체 업무 완료시간은 아니다. 메모리 과금도 세션 최고점 대신 실제 사용량을 따르도록 바뀐다. [S4]

## AWS PrivateLink, 개별 자원 대신 네트워크 구간을 공유하는 터널 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Amazon Web Services

AWS는 9월 18일 PrivateLink에 다른 VPC나 계정의 네트워크 구간에 접근하는 Tunnel Endpoint를 추가했다. 고객은 개별 자원마다 설정을 만드는 대신 CIDR로 지정한 IP 주소 범위를 Resource Configuration으로 정의하고 AWS RAM으로 협력사에 공유할 수 있다. 이 기능은 서울을 포함한 여러 리전에서 제공되며 터널 사용시간과 처리 데이터량에 따라 과금한다. [S5]

### 공유자가 지정한 주소 범위로 연결

공유받은 협력사는 터널 엔드포인트를 만든 뒤 GENEVE 방식으로 패킷을 감싸 고객 VPC의 지정 구간에 전달한다. CIDR은 접근할 네트워크 주소 범위를 나타낸다. 새 기능의 변경점은 여러 자원을 담은 구간을 공유 단위로 사용할 수 있다는 것이다. [S5]

## 캐나다 사이버센터, 실제 악용 중인 Cisco ISE 취약점 패치 권고

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** Cisco, Canadian Centre for Cyber Security

캐나다 사이버보안센터는 9월 17일 Cisco ISE와 ISE-PIC에 영향을 주는 취약점 3건에 대한 업데이트 적용을 권고했다. Cisco는 이 가운데 인증을 우회해 관리자 수준 접근으로 이어질 수 있는 CVE-2026-76460의 실제 악용을 확인했다. 미국 CISA도 전날 이 취약점을 실제 악용 목록에 추가했다. [S6]

### 설치 계열별 수정 버전 확인

권고문은 3.1 Patch 12, 3.2 Patch 11, 3.3 Patch 12, 3.4 Patch 7, 3.5 Patch 4를 계열별 수정 버전으로 제시한다. 3.0 이하 계열은 지원되는 수정 버전으로 이동해야 한다. 조직은 현재 설치 버전에 맞는 Cisco 안내를 확인해 패치와 침해 여부 점검을 진행해야 한다. [S6]

## Fujitsu, MONAKA CPU 판매는 11월·서버 출하는 내년 4월부터 예고

**분야:** 반도체·컴퓨팅
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Fujitsu

Fujitsu는 9월 14일 Arm 기반 FUJITSU-MONAKA CPU와 이를 탑재한 서버의 판매를 2026년 11월부터 시작한다고 발표했다. CPU는 2nm 코어와 5nm 캐시·입출력 부분을 3차원으로 결합하고, 최대 3.8GHz 동작과 8,800MT/s 메모리 전송을 지원한다. 일본·유럽의 1U·2U 서버 판매 개시와 별도로 실제 서버 출하는 2027년 4월부터 순차 진행할 예정이다. [S7]

### CPU 판매와 완제품 출하 일정

CPU 단품은 서버 제조사와 데이터센터 운영자를 대상으로 2026회계연도 4분기 공급을 계획한다. 발표한 서버는 행렬 연산 가속·SVE2 벡터 연산과 Arm CCA의 메모리 보호 기능을 활용한다. 주문·판매를 받는 시점과 고객에게 하드웨어가 전달되는 시점은 서로 다르다. [S7]

## Teradyne Robotics, UR·MiR 영업을 총괄할 CCO 선임

**분야:** 로봇·제조
**테마:** 인력·조직
**보조 테마:** 없음
**세부 태그:** 핵심 인재 이동
**기업·기관:** Teradyne Robotics, Universal Robots, Mobile Industrial Robots

Teradyne Robotics는 9월 15일 Jacob Pascual Pape를 최고사업책임자(CCO)로 선임했다. 그는 Universal Robots와 Mobile Industrial Robots의 글로벌 영업 활동을 총괄한다. 앞서 Universal Robots에서 10년 넘게 일했고, 최근에는 Trener Robotics의 글로벌 영업 부사장을 맡았다. [S9]



## 네이버·거린에너지, 216MW 태양광 사업 지분 투자·전력 구매 협의

**분야:** 에너지·기후기술
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 조달 변경
**기업·기관:** NAVER, Gurīn Energy

네이버는 9월 16일 거린에너지와 데이터센터용 재생에너지 확보를 위한 양해각서를 체결했다고 발표했다. 진도그린태양광 사업의 일부 지분 투자와 장기 전력구매계약을 추진하고, 연말 본계약 체결을 목표로 조건을 협의한다. 216MW는 해당 프로젝트가 확보한 전기사업허가 규모이며, 이번 발표로 전력 공급이나 투자 집행이 완료된 것은 아니다. [S10]

### 전력 구매와 발전 사업 투자 병행

거린에너지가 발전소 개발·운영 관리를 주도하고, 네이버는 생산된 재생에너지를 장기간 구매해 각 세종·각 춘천 등의 데이터센터 운영에 사용할 계획이다. 장기 전력구매계약(PPA)과 지분 투자를 함께 추진하지만, 현재 공개된 단계는 양해각서 체결이다. [S10]

## Roche, 재발성 여포성 림프종 3상에서 무진행생존기간 개선 발표

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** Roche

Roche는 9월 17일 재발성·불응성 여포성 림프종 환자를 대상으로 한 CELESTIMO 3상 중간 분석에서 1차 평가변수를 충족했다고 발표했다. 이전 치료를 한 차례 이상 받은 환자에서 모수네투주맙·레날리도마이드 병용을 리툭시맙·레날리도마이드와 비교한 시험이다. 회사는 질병 진행이나 사망까지의 기간인 무진행생존기간이 통계적으로 유의하게 개선됐다고 밝혔지만, 발표문에 구체적인 효과 크기는 제시하지 않았다. [S11]

### 중간 결과와 허가 신청 구분

모수네투주맙은 CD20과 CD3를 겨냥해 B세포와 T세포를 가까이 연결하는 이중항체다. 전체생존기간 자료는 아직 성숙하지 않았으며, 회사는 새 안전성 신호가 관찰되지 않았다고 설명했다. 자세한 결과의 학회 발표와 규제기관 제출은 향후 일정으로, 이번 발표 자체가 새 적응증 허가를 뜻하지 않는다. [S11]

## Rocket Lab, Synspective 레이더 위성의 572km 궤도 발사 완료

**분야:** 우주·기초과학
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 고객 도입
**기업·기관:** Rocket Lab, Synspective

Rocket Lab은 9월 19일 03시 22분 UTC에 Electron으로 일본 Synspective의 StriX 지구관측 위성 1기를 572km 궤도로 발사했다. ‘Owl By The Dozen’ 임무는 Launch Complex 1에서 이뤄졌으며, 회사의 전체 96번째이자 Synspective를 위한 12번째 발사다. 이 위성군은 합성개구레이더(SAR) 관측 데이터를 도시계획·기반시설 감시·재난 대응에 제공한다. [S12]

### 이번 발사와 남은 계약 물량

임무 페이지가 밝힌 궤도 경사각은 38도다. Rocket Lab은 Synspective 위성군을 위해 2030년 전까지 수행할 15건의 추가 발사를 예약받았다고 설명한다. 이 수치는 이번에 완료한 12번째 고객 발사와 구분되는 향후 계약 물량이다. [S12]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

- [[Knowledge/AI Systems/Conversational Voice AI|대화형 음성 AI]]

# Source List

- [S1] https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/
- [S2] https://navercorp.com/media/pressReleasesDetail?seq=10034667
- [S3] https://news.samsung.com/kr/삼성전자-one-ui-9-공식-버전-업데이트-시작
- [S4] https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime-generally-available/
- [S5] https://aws.amazon.com/about-aws/whats-new/2026/9/privatelink-tunnel-endpoint/
- [S6] https://www.cyber.gc.ca/en/alerts-advisories/al26-021-vulnerabilities-impacting-cisco-identity-services-engine-ise-cisco-ise-passive-identity-connector-ise-pic-cve-2026-20192-cve-2026-76423-cve-2026-76460
- [S7] https://global.fujitsu/en-global/pr/news/2026/09/14-02
- [S8] https://www.universal-robots.com/news-and-media/news-center/universal-robots-unveils-gen-7-new-platform-industrial-automation-physical-ai/
- [S9] https://www.universal-robots.com/news-and-media/news-center/teradyne-robotics-appoints-jacob-pascual-pape-chief-commercial-officer/
- [S10] https://www.navercorp.com/media/pressReleasesDetail?seq=10034661
- [S11] https://www.roche.com/media/releases/med-cor-2026-09-17
- [S12] https://rocketlabcorp.com/missions/launches/owl-by-the-dozen/
