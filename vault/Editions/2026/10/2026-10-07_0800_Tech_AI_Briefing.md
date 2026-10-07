---
title: 2026-10-07 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-10-07
timezone: Asia/Seoul
coverage_start: 2026-10-05T20:21:45.039Z
coverage_end: 2026-10-06T22:05:39.063Z
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 8
new_items_count: 8
linked_knowledge_notes:
  - Knowledge/Robotics/Welding Weaving
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - 두산로보틱스, AI 반도체 협동로봇·원전 용접 국책과제 선정
  - CrowdStrike·AWS·NVIDIA, 보안 스타트업 육성 확대…개발 도구와 시장 진출 지원
  - KAIST, 데이터 추가·삭제에도 검색 연결을 유지하는 CONDA 공개
  - 셀트리온, 옴리클로 미국 출시·옵텀 사보험 처방집 등재
  - AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송
article_records:
  - title: 두산로보틱스, AI 반도체 협동로봇·원전 용접 국책과제 선정
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 두산로보틱스; 산업통상부·한국산업기술기획평가원 주관
      when: 2026-10-06 발표; 협동로봇 과제 54개월·용접 과제 45개월; 협동로봇 2031년부터 상용화 계획
      where: 국내; 용접 실증은 두산에너빌리티 원자력센터
      what: 차세대 협동로봇 및 지능형 용접 솔루션 국책과제 2건 선정
      how: 국산 SoC/NPU·실시간 제어 통합; 숙련공 동작 모방 학습과 디지털 트윈
      why: 박인원 사장은 제조 인력난과 숙련 인력 고령화를 추진 배경으로 설명했다.
    lead: 두산로보틱스는 2026년 10월 6일 차세대 협동로봇과 지능형 용접 솔루션을 개발하는 국책과제 2건에 선정됐다고 발표했다. 두 과제의
      총 연구개발비는 약 989억 원이며, 정부 지원금은 그중 약 681억 원이다. 협동로봇에 국산 AI 반도체를 탑재해 현장에서
      인지·판단·제어하게 하고, 숙련공의 동작을 학습하는 원전 기자재 용접 솔루션을 개발할 계획이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 로봇 내부에 AI 연산과 통신·제어를 통합
        paragraphs:
          - 차세대 협동로봇 과제는 외부 PC나 클라우드에 의존하지 않고 작업 현장에서 판단하는 로봇을 목표로 한다. 국산
            시스템반도체(SoC)에 AI 연산 전용장치(NPU)와 실시간 통신·제어 기능을 통합하고, 카메라·촉각·힘과 토크·음성
            정보를 처리하도록 개발한다.
          - 개발 대상은 가반하중 5kg·10kg·20kg의 협동로봇 3종과 양팔 작업·전방향 이동이 가능한 산업용 휴머노이드다.
            회사는 수요 현장 2곳 이상에서 72시간 무중단 실증과 국제 안전인증 취득을 거쳐 2031년부터 표준 제품으로 상용화할
            계획이다.
          - 과제 기간은 54개월이며 두산로보틱스가 총괄주관기관을 맡는다.
            에이딘로보틱스·모빌린트·한국전자기술연구원·한국생산기술연구원·세이지와 고려대·동국대·세종대·연세대 산학협력단 등이 참여한다.
        source_urls:
          - https://www.doosanrobotics.com/kr/about/promotion/news/%EB%91%90%EC%82%B0%EB%A1%9C%EB%B3%B4%ED%8B%B1%EC%8A%A4-%EA%B5%AD%EC%82%B0-ai-%EB%B0%98%EB%8F%84%EC%B2%B4-%ED%95%9C%EA%B5%AD%ED%98%95-%ED%94%BC%EC%A7%80%EC%BB%AC-ai-%EA%B5%AC%ED%98%84
      - heading: 숙련공의 용접 동작을 학습하는 원전 공정 개발
        paragraphs:
          - 지능형 용접 과제는 협동로봇에 AI와 디지털 트윈을 결합한다. 카메라로 용접 대상을 인식해 위치를 보정하고, 숙련공의
            동작을 모방 학습해 용접 경로와 위빙 동작을 자동 생성하도록 개발한다. 위빙은 용접 토치를 좌우로 흔들어 용접 폭과 품질을
            고르게 만드는 기법이다.
          - 성능 목표는 국가공인 시험기관 기준으로 숙련공과 로봇 용접 경로를 95% 이상 일치시키고 경로 오차를 ±3mm 이내로
            만드는 것이다. 회사는 5층 이상의 다층 용접을 자동화해 작업 시간을 50% 이상 단축하는 것도 목표로 제시했다.
          - 45개월 과제로 두산에너빌리티 원자력센터에서 가접·예열·용접 등을 실증할 계획이다. 두산로보틱스가 주관하고
            딥엑스·세이지·국립창원대학교 산학협력단이 공동연구기관, 두산에너빌리티가 수요기업으로 참여한다. 원전 품질 인증을 확보한 뒤
            조선·플랜트·방산으로 적용 범위를 넓힐 예정이다.
        source_urls:
          - https://www.doosanrobotics.com/kr/about/promotion/news/%EB%91%90%EC%82%B0%EB%A1%9C%EB%B3%B4%ED%8B%B1%EC%8A%A4-%EA%B5%AD%EC%82%B0-ai-%EB%B0%98%EB%8F%84%EC%B2%B4-%ED%95%9C%EA%B5%AD%ED%98%95-%ED%94%BC%EC%A7%80%EC%BB%AC-ai-%EA%B5%AC%ED%98%84
      - heading: 두 과제를 협동로봇 플랫폼으로 연결
        paragraphs:
          - 두산로보틱스는 인지·판단·제어 기반 기술과 고난도 제조 응용 기술을 활용해 한국형 피지컬 AI 협동로봇 통합 플랫폼을
            완성할 계획이다. 박인원 사장은 제조 현장의 인력난과 숙련 인력 고령화가 기존 자동화 설비 확대만으로 해결되지 않는
            문제라고 설명했다.
        source_urls:
          - https://www.doosanrobotics.com/kr/about/promotion/news/%EB%91%90%EC%82%B0%EB%A1%9C%EB%B3%B4%ED%8B%B1%EC%8A%A4-%EA%B5%AD%EC%82%B0-ai-%EB%B0%98%EB%8F%84%EC%B2%B4-%ED%95%9C%EA%B5%AD%ED%98%95-%ED%94%BC%EC%A7%80%EC%BB%AC-ai-%EA%B5%AC%ED%98%84
  - title: CrowdStrike·AWS·NVIDIA, 보안 스타트업 육성 확대…개발 도구와 시장 진출 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: CrowdStrike·AWS·NVIDIA
      when: 2026-10-06 발표; 2026-11-02 접수 마감; 2027-01-11~2027-03-08 운영 예정
      where: 세계 각국의 초기 사이버보안 스타트업 대상
      what: 제4회 Cybersecurity Startup Accelerator 모집과 기술·시장 진출 지원 확대
      how: Falcon Foundry·Falcon API·AWS Partner Network·AWS Marketplace·NVIDIA
        Inception을 통한 지원
      why: 사이버보안 스타트업의 개발과 시장 진출 지원
    lead: 크라우드스트라이크는 2026년 10월 6일 AWS·NVIDIA와 함께 제4회 글로벌 사이버보안 스타트업 육성 프로그램의 모집을
      시작했다고 발표했다. 신청 마감은 11월 2일이며, 초기 스타트업을 대상으로 하는 8주 프로그램은 2027년 1월 11일부터 3월
      8일까지 운영할 예정이다. 참가 기업에는 에이전트 개발 도구와 클라우드 기술 검증, 마켓플레이스 등록 및 시장 진출 지원을 제공할
      계획이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 개발 도구부터 마켓플레이스 등록까지
        paragraphs:
          - 크라우드스트라이크는 올해 지원에 Falcon Foundry의 에이전트 생성 기능과 Falcon API 접근을 포함했다.
            검증된 연동 기능을 개발할 기회와 CrowdStrike Marketplace 등록 경로도 제공한다는 설명이다.
          - AWS는 파트너 네트워크 가입, 기술 검증, AWS Marketplace 등록에 대한 실무 지원을 확대한다. NVIDIA
            Inception은 기술 교육과 개발자 자료를 제공하며, 추가 기술·시장 진출 지원은 자격 요건과 참여 수준에 따라
            달라진다.
          - 세 회사의 기술·사업 담당자가 멘토링과 사업 개발, 시장 진출 지도를 함께 맡도록 구성했다.
        source_urls:
          - https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-aws-and-nvidia-expand-global-cybersecurity-startup-0
      - heading: 최대 10곳의 발표 기회, 투자 심사는 별도
        paragraphs:
          - 프로그램 종료 뒤 최대 10개 스타트업이 2027년 4월 5~8일 열리는 RSAC에서 발표하고, 현장 행사에서 우승 기업을
            선정할 예정이다. 우수 기업은 CrowdStrike Falcon Fund의 투자 검토 대상이 될 수 있다.
        source_urls:
          - https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-aws-and-nvidia-expand-global-cybersecurity-startup-0
  - title: KAIST, 데이터 추가·삭제에도 검색 연결을 유지하는 CONDA 공개
    kind: 사건 뉴스
    region: 국내
    facts:
      who: KAIST 전산학부 김민수 교수 연구팀
      when: 2026-10-06 자료 게시; 2026-09-02 VLDB 발표; 2026년 4분기 제품 상용화 계획
      where: 미기재
      what: 동적 벡터 검색 기술 '콘다(CONDA)' 개발 및 성능 검증
      how: 데이터 사이의 거리와 검색 경로의 연결 상태를 함께 고려하여 데이터 추가·삭제 시 중요한 연결을 유지
      why: 미기재
    lead: KAIST가 2026년 10월 6일 공개한 자료에 따르면, 전산학부 김민수 교수 연구팀이 동적 벡터 검색 기술 콘다(CONDA)를
      개발했다. 이 기술은 데이터가 추가되거나 삭제될 때 검색망의 중요한 연결을 유지해 필요한 정보가 고립되는 문제를 다룬다. KAIST는
      데이터가 계속 바뀌는 실험에서 비교 기술보다 검색 정확도를 최대 24.5%, 데이터 처리 속도를 최대 1.90배 높였다고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: CONDA의 동작 원리
        paragraphs:
          - CONDA는 데이터 사이의 거리와 검색 경로의 연결 상태를 함께 고려하며, 데이터 추가·삭제 때 중요한 연결을 유지해
            정보가 검색망에서 고립되는 것을 막는다.
        source_urls:
          - https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67870&GotoPage=1
      - heading: 1억 개 데이터에서 검색과 갱신을 동시 시험
        paragraphs:
          - KAIST는 1억 개 데이터를 대상으로 6시간 동안 검색과 데이터 갱신을 동시에 수행한 실험에서 CONDA가 비교 기술보다
            가장 짧은 응답시간과 높은 검색 정확도를 유지했다고 설명했다.
        source_urls:
          - https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67870&GotoPage=1
      - heading: 상용화 계획
        paragraphs:
          - KAIST는 CONDA 기술을 그래파이(GraphAI)의 데이터베이스 제품 아카식DB(AkasicDB)에 적용해 2026년
            4분기에 상용화할 예정이라고 밝혔다.
        source_urls:
          - https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67870&GotoPage=1
      - heading: 학술 발표
        paragraphs:
          - CONDA 연구 결과는 9월 2일 데이터베이스 분야 국제학술대회 VLDB 2026에서 발표되었으며, 이다래(NAVER
            Corporation)가 제1저자, 김민수(KAIST)가 교신저자로 참여했다.
        source_urls:
          - https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67870&GotoPage=1
  - title: 셀트리온, 옴리클로 미국 출시·옵텀 사보험 처방집 등재
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 셀트리온
      when: 2026-10-06 발표; 2026-10-05 미국 현지 출시
      where: 미국
      what: 오말리주맙 바이오시밀러 '옴리클로' 출시
      how: 75mg·150mg·300mg 3개 용량 제형으로 출시, 오리지널 대비 약 15% 낮은 도매가격(WAC) 적용, 옵텀(Optum)
        사보험 처방집 선호의약품 등재
      why: 미기재
    lead: 셀트리온은 2026년 10월 6일 발표에서 오말리주맙 바이오시밀러 옴리클로를 10월 5일(미국 현지 시간) 출시했으며, 미국 시장 첫
      오말리주맙 바이오시밀러라고 밝혔다. 옴리클로는 75mg·150mg·300mg의 3개 용량 제형으로 출시됐으며, 오리지널 제품보다 약
      15% 낮은 도매가격(WAC)을 적용했다. 옴리클로는 출시와 동시에 옵텀(Optum)의 사보험 처방집에 선호의약품으로 등재됐으며,
      셀트리온은 다른 대형 PBM과의 등재 협상도 진행 중이라고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 옴리클로 판매 계획
        paragraphs:
          - 셀트리온은 옴리클로 판매에 기존 미국 직접 판매망과 영업·유통 네트워크를 활용할 수 있으며, 실제 처방 확대를 위해
            의료진·보험사·유통 채널을 대상으로 현지 마케팅을 본격화할 계획이라고 밝혔다.
        source_urls:
          - https://www.celltrion.com/ko-kr/company/media-center/press-release/4938
  - title: AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-10-06
      where: AWS Batch가 제공되는 모든 AWS 리전
      what: AWS Batch 작업 지표의 CloudWatch 자동 전송
      how: AWS/Batch 네임스페이스에 JobQueueName 차원을 포함해 상태 전환 및 지속 시간 메트릭을 발행
      why: 배치 워크로드에 대한 네이티브 관측성 제공
    lead: AWS는 2026년 10월 6일 AWS Batch가 작업 지표를 Amazon CloudWatch에 자동으로 전송하는 기능을 발표했다.
      제출·실행·성공·실패 상태로 진입한 작업 수와 상태 사이의 소요시간을 확인할 수 있으며, AWS Batch를 제공하는 모든 AWS
      리전에서 사용할 수 있다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: CloudWatch 메트릭 구성
        paragraphs:
          - 지표는 CloudWatch의 AWS/Batch 네임스페이스에 작업 대기열 이름(JobQueueName)별로 기록된다. 상태
            전환 지표는 각 상태에 진입한 작업 수를, 소요시간 지표는 제출부터 실행 가능 상태까지 걸린 시간이나 전체 실행시간을
            추적한다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/
  - title: 누리호 5호기 발사대 이송 시작…7일 발사시각 결정 예정
    kind: 사건 뉴스
    region: 국내
    facts:
      who: 우주항공청, 한국항공우주연구원
      when: 2026년 10월 6일
      where: 나로우주센터
      what: 누리호 5호기 발사대 이송 및 발사 준비
      how: 무인 특수이동차량 이송, 기립, 엄빌리칼 연결, 기밀점검
      why: 발사 준비 절차 이행
    lead: 우주항공청과 한국항공우주연구원은 2026년 10월 6일 오전 6시부터 누리호 5호기의 발사대 이송을 시작했다고 밝혔다.
      한국항공우주연구원은 누리호를 무인 특수이동차량에 실어 나로우주센터 발사체종합조립동에서 제2발사대까지 약 1시간 30분에 걸쳐 이송할
      예정이라고 밝혔다. 우주항공청은 10월 7일 오전 누리호 발사관리위원회에서 기술적 준비·기상·우주환경·우주물체 충돌 가능성을 검토해
      최종 발사시각을 결정할 예정이라고 밝혔다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 이송 결정과 발사 준비 절차
        paragraphs:
          - 한국항공우주연구원은 2026년 10월 5일 오후 6시 30분 발사준비위원회에서 기술적 준비 상황과 기상을 검토해 발사대
            이송을 결정했다고 밝혔다.
          - 이송 후 기립, 전원·추진제(연료·산화제) 공급용 엄빌리칼 연결, 기밀점검을 진행하며, 각 단계에서 이상이 없으면 6일 중
            발사대 설치 작업을 완료할 예정이다.
        source_urls:
          - https://www.kari.re.kr/kor/article/ATCL87374b48c/18726
  - title: LG전자, 북미 5GW 데이터센터에 냉각 솔루션 공급 계약
    kind: 사건 뉴스
    region: 국내
    facts:
      who: LG전자
      when: 2026-10-06
      where: 북미
      what: 5GW 규모 AI 데이터센터용 칠러 장기 공급 본계약 체결
      how: 에어 컨트롤 콘셉트와 계약 체결
      why: 미기재
    lead: LG전자는 2026년 10월 6일 미국법인이 에어 컨트롤 콘셉트와 총 5GW 규모 AI 데이터센터용 칠러 장기 공급 본계약을
      체결했다고 밝혔다. 계약에 따라 북미 데이터센터에 고효율 칠러 등 냉각 솔루션을 순차적으로 공급할 계획이다.
    papers: []
    relations: []
    topic_ids: []
    explanations:
      - heading: 공급 상대와 사업 범위
        paragraphs:
          - LG전자에 따르면 에어 컨트롤 콘셉트는 미국·캐나다에서 데이터센터 설계·구축·공공 조달·애프터마켓 서비스를 총괄한다.
            데이터센터 전문 자회사 AMC를 통해 대규모 프로젝트를 수행한다.
        source_urls:
          - https://www.lge.co.kr/story/newsroom/236201
      - heading: CDU 공급 확대 협의
        paragraphs:
          - LG전자와 에어 컨트롤 콘셉트는 액체냉각 설비인 냉각수 분배장치(CDU) 등으로 공급 품목을 확대하는 방안을 논의 중이다.
            LG전자는 공랭식이 차가운 바람을 순환시키는 방식이고 수랭식은 차가운 물로 열을 직접 식히는 방식이라고 설명했다.
        source_urls:
          - https://www.lge.co.kr/story/newsroom/236201
      - heading: 2026년 상반기 수주
        paragraphs:
          - LG전자는 2026년 상반기 AI 데이터센터 냉각 솔루션 수주액이 6,000억 원을 넘어섰다고 밝혔다.
        source_urls:
          - https://www.lge.co.kr/story/newsroom/236201
  - title: GitHub, 스택드 풀 리퀘스트 정식 출시…자동 병합 기능 순차 적용
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-10-07
      where: 미기재
      what: 스택드 풀 리퀘스트 정식 출시 및 관련 기능 개선
      how: 리베이스 시 승인 상태 유지, 서명된 대체 커밋 생성, 자동 병합 순차 적용
      why: 미기재
    lead: GitHub은 2026년 10월 7일(한국시간) 스택드 풀 리퀘스트(stacked pull requests)를 정식 출시했다고
      밝혔다. 이번 업데이트로 사용자는 큰 변경 사항을 더 작고 집중된 풀 리퀘스트로 나누어 독립적으로 검토하고 함께 병합할 수 있다.
      정식 출시와 함께 GitHub은 리베이스 시 변경되지 않은 코드의 승인 상태를 유지하고 서명된 대체 커밋을 생성하는 등 스택의 생성,
      검토, 병합 과정을 개선하는 기능을 도입했다. 또한 모든 풀 리퀘스트가 준비되고 저장소 병합 요건이 충족되면 그룹으로 함께 병합되는
      자동 병합 기능은 향후 몇 주에 걸쳐 순차적으로 적용될 예정이다.
    explanations:
      - heading: 스택드 풀 리퀘스트의 병합 및 권한 처리
        paragraphs:
          - GitHub은 스택드 풀 리퀘스트가 기존 저장소 우회 권한을 스택 내 가장 아래에 있는 미병합 풀 리퀘스트의 규칙에 따라
            적용한다고 밝혔다. 스택은 단일 병합 그룹으로 병합 큐에 진입하며, 병합 커밋 방식은 해당 스택의 각 풀 리퀘스트마다
            하나의 커밋을 생성한다.
          - 풀 리퀘스트가 스택에 추가되거나 제거될 때 타임라인 이벤트가 발생하며, 풀 리퀘스트가 스택에 합류할 때
            pull_request 웹훅에 stacked 액션이 추가된다. 또한 gh stack 확장 기능은 Git worktrees
            지원과 함께 초기화, 체크아웃, 탐색 기능의 개선을 제공한다.
        source_urls:
          - https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available
      - heading: 지원 범위
        paragraphs:
          - 스택드 풀 리퀘스트는 모든 github.com 플랜에서 사용 가능하며, 향후 GitHub Enterprise Server
            릴리스에도 포함될 예정이다.
        source_urls:
          - https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: 두산로보틱스, AI 반도체 협동로봇·원전 용접 국책과제 선정
    event_id: 7cc23b8dc1f502f5
    review_status: verified
    concept_ids:
      - welding-weaving
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
  - title: CrowdStrike·AWS·NVIDIA, 보안 스타트업 육성 확대…개발 도구와 시장 진출 지원
    event_id: 28865e31f8cb281c
    review_status: verified
    concept_ids: []
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
    date_kind: source-publication-time
    source_published_at: 2026-10-06T08:15:23-04:00
  - title: KAIST, 데이터 추가·삭제에도 검색 연결을 유지하는 CONDA 공개
    event_id: 9059b04353193fee
    review_status: verified
    concept_ids: []
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
  - title: 셀트리온, 옴리클로 미국 출시·옵텀 사보험 처방집 등재
    event_id: 14ae3c84f2654e37
    review_status: verified
    concept_ids: []
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
  - title: AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송
    event_id: 2dae24cccb14cc62
    review_status: verified
    concept_ids: []
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
  - title: 누리호 5호기 발사대 이송 시작…7일 발사시각 결정 예정
    event_id: 9fc8bc0338395f2d
    review_status: verified
    concept_ids: []
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
  - title: LG전자, 북미 5GW 데이터센터에 냉각 솔루션 공급 계약
    event_id: d5bbd37fc92cb75b
    review_status: verified
    concept_ids: []
    published_at: 2026-10-06
    reviewed_at: 2026-10-07
  - title: GitHub, 스택드 풀 리퀘스트 정식 출시…자동 병합 기능 순차 적용
    event_id: 789d3f2f135ddb5f
    review_status: verified
    published_at: 2026-10-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-10-06T13:16:41-07:00
---

# 이번 호 표지

두산로보틱스, AI 반도체 협동로봇·원전 용접 국책과제 선정

# 차례

- 두산로보틱스, AI 반도체 협동로봇·원전 용접 국책과제 선정
- CrowdStrike·AWS·NVIDIA, 보안 스타트업 육성 확대…개발 도구와 시장 진출 지원
- KAIST, 데이터 추가·삭제에도 검색 연결을 유지하는 CONDA 공개
- 셀트리온, 옴리클로 미국 출시·옵텀 사보험 처방집 등재
- AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송

# 커버 스토리

없음

# 뉴스 데스크

## 두산로보틱스, AI 반도체 협동로봇·원전 용접 국책과제 선정

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 실증·재현
**기업·기관:** 두산로보틱스, 두산에너빌리티, 에이딘로보틱스, 모빌린트, 딥엑스, 세이지

두산로보틱스는 2026년 10월 6일 차세대 협동로봇과 지능형 용접 솔루션을 개발하는 국책과제 2건에 선정됐다고 발표했다. 두 과제의 총 연구개발비는 약 989억 원이며, 정부 지원금은 그중 약 681억 원이다. 협동로봇에 국산 AI 반도체를 탑재해 현장에서 인지·판단·제어하게 하고, 숙련공의 동작을 학습하는 원전 기자재 용접 솔루션을 개발할 계획이다. [S1]

### 로봇 내부에 AI 연산과 통신·제어를 통합

차세대 협동로봇 과제는 외부 PC나 클라우드에 의존하지 않고 작업 현장에서 판단하는 로봇을 목표로 한다. 국산 시스템반도체(SoC)에 AI 연산 전용장치(NPU)와 실시간 통신·제어 기능을 통합하고, 카메라·촉각·힘과 토크·음성 정보를 처리하도록 개발한다.

개발 대상은 가반하중 5kg·10kg·20kg의 협동로봇 3종과 양팔 작업·전방향 이동이 가능한 산업용 휴머노이드다. 회사는 수요 현장 2곳 이상에서 72시간 무중단 실증과 국제 안전인증 취득을 거쳐 2031년부터 표준 제품으로 상용화할 계획이다.

과제 기간은 54개월이며 두산로보틱스가 총괄주관기관을 맡는다. 에이딘로보틱스·모빌린트·한국전자기술연구원·한국생산기술연구원·세이지와 고려대·동국대·세종대·연세대 산학협력단 등이 참여한다. [S1]

### 숙련공의 용접 동작을 학습하는 원전 공정 개발

지능형 용접 과제는 협동로봇에 AI와 디지털 트윈을 결합한다. 카메라로 용접 대상을 인식해 위치를 보정하고, 숙련공의 동작을 모방 학습해 용접 경로와 위빙 동작을 자동 생성하도록 개발한다. 위빙은 용접 토치를 좌우로 흔들어 용접 폭과 품질을 고르게 만드는 기법이다.

성능 목표는 국가공인 시험기관 기준으로 숙련공과 로봇 용접 경로를 95% 이상 일치시키고 경로 오차를 ±3mm 이내로 만드는 것이다. 회사는 5층 이상의 다층 용접을 자동화해 작업 시간을 50% 이상 단축하는 것도 목표로 제시했다.

45개월 과제로 두산에너빌리티 원자력센터에서 가접·예열·용접 등을 실증할 계획이다. 두산로보틱스가 주관하고 딥엑스·세이지·국립창원대학교 산학협력단이 공동연구기관, 두산에너빌리티가 수요기업으로 참여한다. 원전 품질 인증을 확보한 뒤 조선·플랜트·방산으로 적용 범위를 넓힐 예정이다. [S1]

### 두 과제를 협동로봇 플랫폼으로 연결

두산로보틱스는 인지·판단·제어 기반 기술과 고난도 제조 응용 기술을 활용해 한국형 피지컬 AI 협동로봇 통합 플랫폼을 완성할 계획이다. 박인원 사장은 제조 현장의 인력난과 숙련 인력 고령화가 기존 자동화 설비 확대만으로 해결되지 않는 문제라고 설명했다. [S1]

**개념:** [[Knowledge/Robotics/Welding Weaving]]

## CrowdStrike·AWS·NVIDIA, 보안 스타트업 육성 확대…개발 도구와 시장 진출 지원

**분야:** 사이버보안
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 기술 제휴
**기업·기관:** CrowdStrike, AWS, NVIDIA

크라우드스트라이크는 2026년 10월 6일 AWS·NVIDIA와 함께 제4회 글로벌 사이버보안 스타트업 육성 프로그램의 모집을 시작했다고 발표했다. 신청 마감은 11월 2일이며, 초기 스타트업을 대상으로 하는 8주 프로그램은 2027년 1월 11일부터 3월 8일까지 운영할 예정이다. 참가 기업에는 에이전트 개발 도구와 클라우드 기술 검증, 마켓플레이스 등록 및 시장 진출 지원을 제공할 계획이다. [S2]

### 개발 도구부터 마켓플레이스 등록까지

크라우드스트라이크는 올해 지원에 Falcon Foundry의 에이전트 생성 기능과 Falcon API 접근을 포함했다. 검증된 연동 기능을 개발할 기회와 CrowdStrike Marketplace 등록 경로도 제공한다는 설명이다.

AWS는 파트너 네트워크 가입, 기술 검증, AWS Marketplace 등록에 대한 실무 지원을 확대한다. NVIDIA Inception은 기술 교육과 개발자 자료를 제공하며, 추가 기술·시장 진출 지원은 자격 요건과 참여 수준에 따라 달라진다.

세 회사의 기술·사업 담당자가 멘토링과 사업 개발, 시장 진출 지도를 함께 맡도록 구성했다. [S2]

### 최대 10곳의 발표 기회, 투자 심사는 별도

프로그램 종료 뒤 최대 10개 스타트업이 2027년 4월 5\~8일 열리는 RSAC에서 발표하고, 현장 행사에서 우승 기업을 선정할 예정이다. 우수 기업은 CrowdStrike Falcon Fund의 투자 검토 대상이 될 수 있다. [S2]

## KAIST, 데이터 추가·삭제에도 검색 연결을 유지하는 CONDA 공개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 성능 개선
**기업·기관:** KAIST, 그래파이(GraphAI), NAVER Corporation

KAIST가 2026년 10월 6일 공개한 자료에 따르면, 전산학부 김민수 교수 연구팀이 동적 벡터 검색 기술 콘다(CONDA)를 개발했다. 이 기술은 데이터가 추가되거나 삭제될 때 검색망의 중요한 연결을 유지해 필요한 정보가 고립되는 문제를 다룬다. KAIST는 데이터가 계속 바뀌는 실험에서 비교 기술보다 검색 정확도를 최대 24.5%, 데이터 처리 속도를 최대 1.90배 높였다고 밝혔다. [S3]

### CONDA의 동작 원리

CONDA는 데이터 사이의 거리와 검색 경로의 연결 상태를 함께 고려하며, 데이터 추가·삭제 때 중요한 연결을 유지해 정보가 검색망에서 고립되는 것을 막는다. [S3]

### 1억 개 데이터에서 검색과 갱신을 동시 시험

KAIST는 1억 개 데이터를 대상으로 6시간 동안 검색과 데이터 갱신을 동시에 수행한 실험에서 CONDA가 비교 기술보다 가장 짧은 응답시간과 높은 검색 정확도를 유지했다고 설명했다. [S3]

### 상용화 계획

KAIST는 CONDA 기술을 그래파이(GraphAI)의 데이터베이스 제품 아카식DB(AkasicDB)에 적용해 2026년 4분기에 상용화할 예정이라고 밝혔다. [S3]

### 학술 발표

CONDA 연구 결과는 9월 2일 데이터베이스 분야 국제학술대회 VLDB 2026에서 발표되었으며, 이다래(NAVER Corporation)가 제1저자, 김민수(KAIST)가 교신저자로 참여했다. [S3]

## 셀트리온, 옴리클로 미국 출시·옵텀 사보험 처방집 등재

**분야:** 바이오·의료기술
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 시장 진출
**기업·기관:** 셀트리온, 옵텀

셀트리온은 2026년 10월 6일 발표에서 오말리주맙 바이오시밀러 옴리클로를 10월 5일(미국 현지 시간) 출시했으며, 미국 시장 첫 오말리주맙 바이오시밀러라고 밝혔다. 옴리클로는 75mg·150mg·300mg의 3개 용량 제형으로 출시됐으며, 오리지널 제품보다 약 15% 낮은 도매가격(WAC)을 적용했다. 옴리클로는 출시와 동시에 옵텀(Optum)의 사보험 처방집에 선호의약품으로 등재됐으며, 셀트리온은 다른 대형 PBM과의 등재 협상도 진행 중이라고 밝혔다. [S4]

### 옴리클로 판매 계획

셀트리온은 옴리클로 판매에 기존 미국 직접 판매망과 영업·유통 네트워크를 활용할 수 있으며, 실제 처방 확대를 위해 의료진·보험사·유통 채널을 대상으로 현지 마케팅을 본격화할 계획이라고 밝혔다. [S4]

## AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 6일 AWS Batch가 작업 지표를 Amazon CloudWatch에 자동으로 전송하는 기능을 발표했다. 제출·실행·성공·실패 상태로 진입한 작업 수와 상태 사이의 소요시간을 확인할 수 있으며, AWS Batch를 제공하는 모든 AWS 리전에서 사용할 수 있다. [S5]

### CloudWatch 메트릭 구성

지표는 CloudWatch의 AWS/Batch 네임스페이스에 작업 대기열 이름(JobQueueName)별로 기록된다. 상태 전환 지표는 각 상태에 진입한 작업 수를, 소요시간 지표는 제출부터 실행 가능 상태까지 걸린 시간이나 전체 실행시간을 추적한다. [S5]

## 누리호 5호기 발사대 이송 시작…7일 발사시각 결정 예정

**분야:** 우주·기초과학
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** 우주항공청, 한국항공우주연구원

우주항공청과 한국항공우주연구원은 2026년 10월 6일 오전 6시부터 누리호 5호기의 발사대 이송을 시작했다고 밝혔다. 한국항공우주연구원은 누리호를 무인 특수이동차량에 실어 나로우주센터 발사체종합조립동에서 제2발사대까지 약 1시간 30분에 걸쳐 이송할 예정이라고 밝혔다. 우주항공청은 10월 7일 오전 누리호 발사관리위원회에서 기술적 준비·기상·우주환경·우주물체 충돌 가능성을 검토해 최종 발사시각을 결정할 예정이라고 밝혔다. [S6]

### 이송 결정과 발사 준비 절차

한국항공우주연구원은 2026년 10월 5일 오후 6시 30분 발사준비위원회에서 기술적 준비 상황과 기상을 검토해 발사대 이송을 결정했다고 밝혔다.

이송 후 기립, 전원·추진제(연료·산화제) 공급용 엄빌리칼 연결, 기밀점검을 진행하며, 각 단계에서 이상이 없으면 6일 중 발사대 설치 작업을 완료할 예정이다. [S6]

## LG전자, 북미 5GW 데이터센터에 냉각 솔루션 공급 계약

**분야:** 에너지·기후기술
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 수주·계약
**기업·기관:** LG전자, 에어 컨트롤 콘셉트

LG전자는 2026년 10월 6일 미국법인이 에어 컨트롤 콘셉트와 총 5GW 규모 AI 데이터센터용 칠러 장기 공급 본계약을 체결했다고 밝혔다. 계약에 따라 북미 데이터센터에 고효율 칠러 등 냉각 솔루션을 순차적으로 공급할 계획이다. [S7]

### 공급 상대와 사업 범위

LG전자에 따르면 에어 컨트롤 콘셉트는 미국·캐나다에서 데이터센터 설계·구축·공공 조달·애프터마켓 서비스를 총괄한다. 데이터센터 전문 자회사 AMC를 통해 대규모 프로젝트를 수행한다. [S7]

### CDU 공급 확대 협의

LG전자와 에어 컨트롤 콘셉트는 액체냉각 설비인 냉각수 분배장치(CDU) 등으로 공급 품목을 확대하는 방안을 논의 중이다. LG전자는 공랭식이 차가운 바람을 순환시키는 방식이고 수랭식은 차가운 물로 열을 직접 식히는 방식이라고 설명했다. [S7]

### 2026년 상반기 수주

LG전자는 2026년 상반기 AI 데이터센터 냉각 솔루션 수주액이 6,000억 원을 넘어섰다고 밝혔다. [S7]

## GitHub, 스택드 풀 리퀘스트 정식 출시…자동 병합 기능 순차 적용

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub은 2026년 10월 7일(한국시간) 스택드 풀 리퀘스트(stacked pull requests)를 정식 출시했다고 밝혔다. 이번 업데이트로 사용자는 큰 변경 사항을 더 작고 집중된 풀 리퀘스트로 나누어 독립적으로 검토하고 함께 병합할 수 있다. 정식 출시와 함께 GitHub은 리베이스 시 변경되지 않은 코드의 승인 상태를 유지하고 서명된 대체 커밋을 생성하는 등 스택의 생성, 검토, 병합 과정을 개선하는 기능을 도입했다. 또한 모든 풀 리퀘스트가 준비되고 저장소 병합 요건이 충족되면 그룹으로 함께 병합되는 자동 병합 기능은 향후 몇 주에 걸쳐 순차적으로 적용될 예정이다. [S8]

### 스택드 풀 리퀘스트의 병합 및 권한 처리

GitHub은 스택드 풀 리퀘스트가 기존 저장소 우회 권한을 스택 내 가장 아래에 있는 미병합 풀 리퀘스트의 규칙에 따라 적용한다고 밝혔다. 스택은 단일 병합 그룹으로 병합 큐에 진입하며, 병합 커밋 방식은 해당 스택의 각 풀 리퀘스트마다 하나의 커밋을 생성한다.

풀 리퀘스트가 스택에 추가되거나 제거될 때 타임라인 이벤트가 발생하며, 풀 리퀘스트가 스택에 합류할 때 pull_request 웹훅에 stacked 액션이 추가된다. 또한 gh stack 확장 기능은 Git worktrees 지원과 함께 초기화, 체크아웃, 탐색 기능의 개선을 제공한다. [S8]

### 지원 범위

스택드 풀 리퀘스트는 모든 github.com 플랜에서 사용 가능하며, 향후 GitHub Enterprise Server 릴리스에도 포함될 예정이다. [S8]

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

- [S1] https://www.doosanrobotics.com/kr/about/promotion/news/%EB%91%90%EC%82%B0%EB%A1%9C%EB%B3%B4%ED%8B%B1%EC%8A%A4-%EA%B5%AD%EC%82%B0-ai-%EB%B0%98%EB%8F%84%EC%B2%B4-%ED%95%9C%EA%B5%AD%ED%98%95-%ED%94%BC%EC%A7%80%EC%BB%AC-ai-%EA%B5%AC%ED%98%84
- [S2] https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-aws-and-nvidia-expand-global-cybersecurity-startup-0
- [S3] https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67870&GotoPage=1
- [S4] https://www.celltrion.com/ko-kr/company/media-center/press-release/4938
- [S5] https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/
- [S6] https://www.kari.re.kr/kor/article/ATCL87374b48c/18726
- [S7] https://www.lge.co.kr/story/newsroom/236201
- [S8] https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available
