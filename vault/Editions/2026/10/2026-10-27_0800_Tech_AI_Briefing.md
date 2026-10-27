---
title: 2026-10-27 Tech & AI 브리핑
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-10-27
timezone: Asia/Seoul
coverage_start: 2026-10-24T22:18:59.233Z
coverage_end: 2026-10-26T23:39:04.480Z
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 33
new_items_count: 32
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
briefing_group_format: related-events/v1
briefing_groups:
  - id: isaac-platform-humanoid
    title: Isaac 플랫폼과 Agile ONE SN 휴머노이드
    sector: 로봇·제조
    event_ids:
      - 5c3a57a7151e0d08
      - 2cf5a6f596cc6134
  - id: aws-regional-compute-connectivity
    title: AWS 리전별 컴퓨팅·전용 연결 확대
    sector: 소프트웨어·클라우드
    event_ids:
      - 34740706294da23a
      - dc823a84aead0efd
headlines:
  - GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시
  - FDA, Roche Enspryng을 성인 갑상선안병증 치료제로 승인
  - Roche, fenebrutinib·Ocrevus·Enspryng 다발성경화증 연구 결과 발표
  - GitHub, 저장소 push 이메일 알림 종료…자체 메일 발송 방식 안내
  - Roche, ESMO 2026에서 폐암·유방암 임상 데이터 발표 계획
article_records:
  - title: GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub Copilot 사용 지표
      when: 2026년 10월 23일(한국시간)
      where: 미기재
      what: 조직이 설정한 사용자 지정 항목 이름을 사용 지표에 표시
      how: 클라이언트 telemetry 기반 보고서의 이름별 집계
      why: 미기재
    lead: GitHub은 한국시간 2026년 10월 23일 공개한 변경으로 GitHub Copilot 사용 지표에 조직이 만든 skills,
      custom agents, MCP servers, slash commands, plugins의 설정 이름을 other나 custom
      대신 표시한다. 이름은 기업·조직의 사용자별 1일·28일 및 집계 1일 보고서와 집계 28일 보고서의 day_totals 등에
      반영되며, 각 totals_by_* 배열은 레코드당 최대 25개 항목으로 늘어 종전 5개를 넘는 나머지 활동은 끝의 other 항목에
      합쳐진다. API 보고서는 enterprise owners와 billing managers, organization owners,
      또는 View Copilot Metrics 권한을 부여하는 custom organization·enterprise role을 가진
      사용자가 이용할 수 있으며 Copilot 사용 지표 정책이 켜져 있어야 한다.
    explanations:
      - heading: 보고서에 반영되는 범위
        paragraphs:
          - 이름별 집계 배열은 totals_by_skill, totals_by_custom_agent, totals_by_mcp,
            totals_by_slash_cmd, totals_by_plugin이다. interaction_count와
            distinct_*_use_count 필드는 이전과 같은 방식으로 계산된다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api
      - heading: 이름 수집 조건
        paragraphs:
          - 이름은 Copilot CLI 대화형 세션과 prompt mode, GitHub Copilot 앱, JetBrains 같은
            ACP 연동, Copilot SDK에서 보고된다. prompt mode·앱·ACP에는 Copilot CLI 1.0.97
            이상이, SDK에는 v1.0.21 이상이 필요하다. IDE는 agent 경험이 Copilot SDK v1.0.21 이상에서
            실행될 때 이름을 보고하며 IDE 내장 채팅 telemetry에서는 이름을 보고하지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api
      - heading: 표시와 해석의 한계
        paragraphs:
          - 이름은 설정된 표기를 바탕으로 최대 128자로 자르며, 파일 경로처럼 보이는 이름은 other나 custom으로 계속
            묶인다. 조직 밖에 보고서를 공유하기 전에 이름을 검토해야 한다.
          - 이름은 이 릴리스 이후 처리된 보고일에만 나타나며 이전 날짜에는 other나 custom이 남는다. 클라이언트가 오래됐거나
            telemetry가 차단되면 활동이 과소 집계될 수 있어 정확한 회계가 아니라 추세와 도입 현황을 보는 데 사용하도록
            안내됐다.
        source_urls:
          - https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api
    papers: []
    relations: []
    topic_ids: []
  - title: FDA, Roche Enspryng을 성인 갑상선안병증 치료제로 승인
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche와 미국 FDA
      when: 2026-10-16 (Roche 보도자료 발표일)
      where: 미국
      what: FDA의 성인 갑상선안병증(TED) 치료용 Enspryng 승인
      how: 훈련 후 환자 또는 보호자가 재택 피하주사로 유지 단계에 4주마다 투여
      why: 미기재
    lead: 2026년 10월 16일 Roche는 미국 FDA가 성인 갑상선안병증(TED) 치료제로 Enspryng(satralizumab)을
      승인했다고 발표했다. Roche는 Enspryng이 TED의 첫이자 유일한 재택 피하주사 치료 선택지이며, 의료진 교육 후 환자나
      보호자가 유지 단계에서 4주마다 투여할 수 있다고 설명했다. Roche는 임상 3상 SatraGO-1이 24주 사전 지정 1차 유효성
      평가변수를 충족하지 못한 반면 SatraGO-2에서는 활동성 TED 환자의 안구 돌출과 복시 지표가 개선됐다고 보고했다.
    explanations:
      - heading: SatraGO 임상 설계와 결과
        paragraphs:
          - SatraGO-1과 SatraGO-2는 성인 활동성 중등도~중증 TED와 만성 TED를 대상으로 효능·지속성·내약성을
            평가하도록 동일하게 설계된 무작위배정, 위약 대조, 다기관 3상 시험이다. 두 시험은 19개국에서 총 258명을 등록해
            Enspryng 또는 위약에 1:1로 배정했다.
          - 두 시험의 1차 평가변수는 활동성 중등도~중증 TED 환자에서 24주 시점에 기준선보다 시험 눈의 안구 돌출이 최소 2mm
            줄어든 비율이었다. Roche는 SatraGO-2 활동성 환자에서 안구 돌출 반응이 Enspryng군 52.9%, 위약군
            23.4%였고 복시 감소는 각각 60.7%, 25.8%였다고 보고했다.
          - Roche는 SatraGO-2에서 활동성·만성 환자를 합친 전체 집단에서도 일관된 결과를 얻었다고 보고했으며, TED의
            활동성이나 기간에 관계없이 양호한 안전성 프로필을 보였다고 설명했다. SatraGO 시험에서 새로운 안전성 신호는 확인되지
            않았고 안전성 프로필은 기존 시신경척수염범주질환(NMOSD) 자료와 일치했다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-16
      - heading: 갑상선안병증의 범위와 치료 필요
        paragraphs:
          - Roche 자료에 따르면 TED는 미국에서 10만 명당 약 155명에게 영향을 주는 희귀 진행성 자가면역질환으로, 치료하지
            않으면 안면 변형과 시력을 위협하는 합병증으로 이어질 수 있다. 갑상선기능항진증 환자의 약 50%는 적어도 경증 TED를
            겪지만, 갑상선기능저하증이나 정상 갑상선 기능을 가진 사람에게도 나타날 수 있다고 회사는 설명했다.
          - Roche는 이미 승인된 TED 치료제가 있어도 효과적이고 내약성이 좋으며 투여가 편리한 치료에 대한 의학적 필요가 남아
            있다고 밝혔다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-16
      - heading: Enspryng의 작용과 기존 적응증
        paragraphs:
          - Roche 그룹 Chugai가 개발한 Enspryng은 용해성 및 막 결합 IL-6 수용체에 결합해 IL-6 신호를
            억제하도록 설계된 인간화 단클론항체다. 회사는 Chugai의 항체 재활용 기술이 pH 의존적으로 표적에 반복 결합해 항체
            순환을 연장하고 IL-6 신호 억제를 지속하도록 하며, IL-6R 억제로 자가항체 유발 병리의 상류 신호를 막는다고
            설명했다.
          - Roche는 TED 승인이 Enspryng의 두 번째 적응증이며 첫 승인은 2020년 NMOSD였다고 밝혔다. 회사에
            따르면 Enspryng은 유럽연합과 미국을 포함해 약 90개국에서 NMOSD 치료제로 승인된 최초이자 유일한 IL-6R
            억제제이며, 1만6천 명 초과 환자에서 확립된 안전성 프로필을 갖고 있다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-16
    papers: []
    relations: []
    topic_ids: []
  - title: Roche, fenebrutinib·Ocrevus·Enspryng 다발성경화증 연구 결과 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche
      when: 2026-10-21 (보도자료 발표일)
      where: MSToronto2026, Toronto (2026-10-21~23 예정)
      what: MS 후보약 fenebrutinib, Ocrevus, Enspryng 관련 임상 자료 발표
      how: FENtrepid·FENhance, OPERETTA 2, METEOROID 등 임상시험 자료를 보도자료와 학회 초록으로 소개
      why: 미기재
    lead: 2026년 10월 21일 Roche는 다발성경화증(MS) 후보약 fenebrutinib의 3상 자료와 Ocrevus·Enspryng
      연구 결과를 발표하고, 보도자료 발표 당시 해당 자료를 Toronto의 MSToronto2026(10월 21~23일 예정)의 40건
      초과 초록에서 소개할 계획이라고 밝혔다. Roche는 FENtrepid와 FENhance 1·2 결과가 만성 활성 병변에 치료 효과를
      보였다고 보고했으며, 이 자료가 RMS와 PPMS 모두를 위한 고효능 경구약이 될 fenebrutinib의 가능성을 뒷받침한다고
      밝혔다. Roche는 Ocrevus의 소아 MS 3상 결과와 Enspryng의 MOGAD 탐색 분석도 주요 자료로 꼽았고,
      Enspryng METEOROID 결과는 MSToronto2026의 “Best of” 발표에 포함된다고 밝혔다.
    explanations:
      - heading: Fenebrutinib의 MS 임상 결과
        paragraphs:
          - Roche는 만성 활성 병변에 대한 치료 효과를 MS 3상에서 전향적으로 보인 첫 사례라고 설명했다. 회사 자료에서
            slowly expanding lesion(SEL) 부피는 active comparators 대비 최대 30% 감소했으며,
            관찰 기간은 RMS 96주와 PPMS 120주였고 p값 0.001 미만이었다. RMS에서 paramagnetic rim
            lesion(PRL) 누적도 active comparators 대비 62% 감소했다고 보고했다(p=0.001).
          - FENhance 1·2 통합 3상 자료에서 Roche는 fenebrutinib의 연간 재발률(ARR)이 active
            comparator 대비 55% 낮았다고 밝혔다. 통합 RMS 분석은 96주 동안 진행됐으며 p값 0.001 미만이었다.
          - 통합 RMS 시험에서 fenebrutinib 투여 환자의 75%는 거의 2년 시점에 NEDA-3를 보였다. Roche가
            정의한 NEDA-3는 재발 0건, MRI 활성 0건, 장애 악화 0건이며, 회사는 비교군 대비 70% 감소(p값 0.001
            미만)라고 보고했다. 별도 통합 RMS 수치로 연간 총 뇌 부피 손실은 23% 감소(p값 0.001 미만), 12주 복합
            확정 장애 진행은 16% 감소(p=0.04)했다고 밝혔다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-21
      - heading: Ocrevus 소아·고령 환자 자료
        paragraphs:
          - European Commission은 10월 15일 소아 적응증을 승인했다. OPERETTA 2 3상에서 치료 시작 당시
            10~17세였던 RRMS 소아 중 Ocrevus 투여군의 90%가 2년 동안 재발이 없었다고 Roche는 보고했다.
          - Roche는 Ocrevus가 표적 B세포를 선택적으로 줄이면서 다른 면역세포에는 거의 또는 전혀 영향을 미치지 않았고,
            환자의 81~100%에서 일반적인 소아 백신에 대한 기존 면역을 보존했다고 밝혔다.
          - Phase IIIb CONSONANCE에서 55세 초과 Ocrevus 투여자 중 53%가 2년 뒤 장애 진행이 없었다.
            Roche는 젊은 참가자의 55%와 비슷한 결과라고 보고했다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-21
      - heading: Enspryng와 MOGAD
        paragraphs:
          - Roche는 METEOROID 탐색 분석에서 Enspryng이 MOGAD 환자의 회복 개선 및 장애 진행 감소와 연관됐다고
            밝혔다. 재발 위험 감소는 AAN 2026에서 이미 발표된 결과라고 설명했으며, 이번 결과가 Enspryng이 MOGAD의
            첫 FDA 승인 치료제가 될 가능성을 뒷받침한다고 했다. 미국의 결정은 2027년 1월로 예상된다고 밝혔다. 이는 승인
            완료가 아니라 회사가 밝힌 향후 전망이다.
          - Roche가 보고한 EDSS 자료에서 재발 12주 뒤 회복 변화 중앙값은 Enspryng군 -2, 위약군 -0.5로 수치상
            Enspryng군이 더 컸다. 이중맹검 기간 종료 시점 또는 첫 재발 시점의 전반적 기능은 Enspryng군에서 중앙값
            0으로 안정적이었고 위약군은 중앙값 0.5로 악화됐다.
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-21
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 저장소 push 이메일 알림 종료…자체 메일 발송 방식 안내
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 원 발표일 2026-10-15; 오늘 소개일 2026-10-27
      where: 미기재
      what: repository push events 이메일 알림이 2026년 10월 15일부로 폐기되어 더 이상 발송되지 않음
      how: 계속 알림을 보내려면 push 이벤트로 트리거되는 GitHub Actions workflow와 자체 SMTP 서버 또는 이메일 제공자를
        이용할 수 있음
      why: GitHub는 스팸과 남용을 막기 위한 종료라고 설명했다. 수신자의 사전 동의 없이 이메일이 발송될 수 있었고, GitHub 이메일
        인프라를 통해 원치 않는 메시지를 보내는 데 악용될 수 있었다.
    lead: GitHub는 한국시간 2026년 10월 15일 게시한 안내에서 repository push events 이메일 알림이 10월 15일
      현재 폐기돼 더 이상 발송되지 않는다고 밝혔다. 회사는 수신자 동의 없이 이메일이 발송될 수 있어 스팸·남용을 막기 위해 기능을
      종료했으며, 자사 이메일 인프라를 통한 원치 않는 메시지 전송에 악용될 가능성이 있었다고 설명했다. 계속 알림을 보내려는 사용자는
      push 이벤트로 실행되는 GitHub Actions workflow에서 자체 SMTP 서버나 이메일 제공자를 이용할 수 있다고
      GitHub는 안내했다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: Roche, ESMO 2026에서 폐암·유방암 임상 데이터 발표 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Roche
      when: 2026-10-19 (보도자료 발표일); ESMO 2026은 2026-10-23~27
      where: 스페인 마드리드, ESMO 연례회의
      what: 폐암·유방암 및 기타 암종의 임상 자료 발표 계획
      how: 두 건의 후기 초록과 임상 단계별 발표를 학회 프로그램에 편성
      why: 미기재
    lead: 2026년 10월 19일 Roche는 스페인 마드리드에서 10월 23~27일 열리는 유럽종양학회(ESMO) 연례회의에서 폐암·유방암
      등 여러 암종의 새 자료를 발표하고 후기 초록 2건을 포함할 계획이라고 밝혔다. 회사는 이전 치료를 받은 KRAS G12C 변이
      비소세포폐암(NSCLC) 환자를 대상으로 한 3상 Krascendo 1에서 divarasib가 1세대 억제제보다 우월한 결과를
      보였다고 보고하고, 해당 결과를 학회 심포지엄에서 발표할 예정이다. Roche는 초기·진행성 유방암의 giredestrant 자료와
      여러 고형암을 대상으로 개발 중인 시험용 항체약물접합체 Tam-Peli의 임상 자료도 발표할 계획이라고 밝혔다.
    explanations:
      - heading: Divarasib와 KRAS G12C 폐암 자료
        paragraphs:
          - Roche는 Krascendo 1 3상에서 이전 치료를 받은 진행성 KRAS G12C 변이 폐암 환자의 divarasib
            결과가 표준 치료인 1세대 KRAS G12C 억제제보다 우월했고 동종 계열 내 최고 수준의 효능 잠재력을 보였다고 밝혔다.
            회사는 Krascendo 1을 차세대 KRAS G12C 억제제와 승인된 1세대 억제제를 비교하는 유일한 글로벌 직접 비교
            시험이라고 설명했다.
          - "Roche는 Krascendo 1 결과를 후기 초록으로 대통령 심포지엄에서 발표할 계획이었다. 프로그램에는 이전 치료를
            받은 국소 진행성 또는 전이성 KRAS G12C 변이 NSCLC에서 divarasib와 sotorasib 또는
            adagrasib의 효능·안전성을 비교하는 #LBA5 세션이 10월 25일 16:30~16:42 CET로, 절제된
            II~IIIB기 KRAS G12C 양성 NSCLC에서 divarasib와 면역치료 또는 관찰을 비교하는 진행 중 3상
            Krascendo 3의 #2551 포스터가 10월 26일 12:00~12:45 CET로 편성됐다."
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-19
      - heading: Giredestrant 유방암 프로그램
        paragraphs:
          - Roche는 giredestrant를 경구용 차세대 선택적 에스트로겐 수용체 분해제(SERD)이자 완전 길항제인 시험용
            약물로 소개하고, ER 양성·HER2 음성 유방암의 초기 및 진행 단계에서 새로운 표준 치료가 될 가능성을 뒷받침하는
            자료를 발표할 계획이라고 밝혔다. 회사에 따르면 이 아형 사례의 90% 초과가 진단 시 I~III기 초기 단계다.
          - "Roche는 3상 lidERA의 초기 유방암 환자 보고 결과에서 giredestrant가 표준 내분비요법보다 효능을
            높이면서 내약성이나 건강 관련 삶의 질을 저해하지 않았다고 밝혔다. 학회 일정에는 해당 자료가 10월 23일
            16:20~16:25 CEST #538 구두 발표로, CDK4/6 억제제 치료 후 ER 양성·HER2 음성 진행성 유방암의
            giredestrant와 everolimus 병용 3상 evERA 탐색 바이오마커 분석이 10월 24일
            10:20~10:25 CEST #2 구두 발표로 올라 있었다. giredestrant와 inavolisib 병용의
            업데이트된 중간 결과는 국소 진행성 또는 전이성 ER 양성·HER2 음성 유방암을 다루는 MORPHEUS 연구 자료로
            발표할 계획이었다."
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-19
      - heading: Tam-Peli의 고형암 임상 계획
        paragraphs:
          - Roche는 Tam-Peli(tambotatug pelitecan)를 강한 항종양 활성을 내면서 표적 외 독성을 제한하도록
            설계한 차세대 B7-H3 표적 항체약물접합체(ADC)로 설명하고 여러 고형암에서 연구 중이라고 밝혔다. 회사는 중국 환자의
            전이성 비인두암 3상 결과가 유망한 효능과 양호한 안전성 프로필의 잠재력을 보여줬다고 평가했다.
          - "Roche는 Tam-Peli를 중국 본토·홍콩·마카오 밖에서 개발·상업화하고 있으며 여러 종양 유형의 글로벌 임상시험을
            신속히 시작할 계획이라고 밝혔다. ESMO 발표 목록에는 중증 치료 전력이 있는 재발성·전이성 비인두암 3상 중간 결과,
            진행성 고형암 1·2상 참가자의 간질성 폐질환 분석, 국소 진행성 또는 전이성 NSCLC 환자의 1상 효능·안전성 자료가
            포함됐다. 일정상 Tam-Peli NSCLC #2577 포스터는 10월 26일 12:00~12:45 CET,
            TAISHAN-301의 화학요법 비교 3상 비인두암 #LBA43 발표는 10월 25일 08:40~08:50 CET였다."
        source_urls:
          - https://www.roche.com/media/releases/med-cor-2026-10-19
    papers: []
    relations: []
    topic_ids: []
  - title: Anthropic, IPO용 S-1 SEC에 공개 제출…주식 수·가격 범위 미정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Anthropic
      when: 2026년 10월 26일(현지시간, S-1 공개 제출); 관련 보도 공개일 10월 26일과 27일
      where: 미국 증권거래위원회(SEC)에 S-1 제출
      what: IPO를 위한 S-1 등록서 공개 제출
      how: 공개 상장 신청 및 향후 기관투자가 로드쇼·상장 계획 보도
      why: 미기재
    lead: 2026년 10월 26일 공개된 한 보도는 수 주간의 S-1 유출 뒤 Anthropic이 IPO를 신청했다고 전했고, 10월 27일
      공개된 로이터·월스트리트저널 등 외신 보도는 회사가 현지시간 26일 미국 SEC에 IPO용 S-1 등록서를 공개 제출했다고 보도했다.
      예정 상장 시장은 Nasdaq Global Select Market이고 종목 코드는 ANT지만 공모 주식 수와 가격 범위는 확정되지
      않았으며, 해당 보도는 11월 초 기관투자가 대상 로드쇼와 11월 중순 상장을 전망했다. 보도된 기업가치 전망은 1조5000억~2조
      달러(약 1991조~2654조 원)이며, 시장에서 거론된 IPO 조달 목표 1000억 달러(약 133조 원)가 달성되면 역대 최대
      규모가 된다.
    explanations:
      - heading: 공개된 실적
        paragraphs:
          - 보도된 올해 상반기 매출은 162억9000만 달러(약 21조6168억 원)로 전년 동기 11억6000만 달러보다 약
            14배였고 지난해 연간 매출 45억9000만 달러도 웃돌았다. 같은 기간 순손실은 약 807억 달러로, 주식 전환이 가능한
            금융상품의 회계상 평가손실이 주로 반영된 것으로 설명됐다. 실제 영업손실은 전년 동기 21억4000만 달러에서
            6억9300만 달러로 줄었다.
        source_urls:
          - https://www.etnews.com/20261027000004
      - heading: 컴퓨팅 지출 약정 보도
        paragraphs:
          - 보도에 따르면 Anthropic은 Amazon과 Google 등 협력사와 향후 약 10년에 걸쳐 컴퓨팅 관련 지출
            6000억 달러 이상을 약정한 것으로 전해졌다.
        source_urls:
          - https://www.etnews.com/20261027000004
      - heading: S-1의 Claude 관련 서술
        paragraphs:
          - Anthropic의 SEC 제출 S-1은 기업 고객 도입의 속도와 깊이를 Claude가 AI의 최전선에 있다는 강력한
            증거로 제시했다.
        source_urls:
          - https://techcrunch.com/2026/10/26/anthropics-ipo-filing-reveals-its-strategy-for-keeping-enterprise-customers-hooked/
    papers: []
    relations: []
    topic_ids: []
  - title: 삼성SDI, AOP와 ESS 솔루션 1GWh 공급 계약 체결
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 삼성SDI 미주법인 삼성SDI 아메리카(SDIA)와 AOP
      when: 2026년 10월 26일
      where: 미기재
      what: ESS 솔루션 1GWh 공급 계약 체결
      how: 미기재
      why: 미기재
    lead: 삼성SDI는 2026년 10월 26일 미주법인 삼성SDI 아메리카(SDIA)가 미국 에너지 전문기업 AOP와 1GWh 규모의 ESS
      솔루션 공급 계약을 체결했다고 밝혔다. 이번 계약 1GWh에 지난해 말 체결한 1차 계약 물량 0.5GWh를 포함하면 총 계약 규모는
      1.5GWh다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: 단일 참여자 EMG 연구, Baxter 로봇 팔로 사람 팔 동작 재현
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 연구진
      when: 2026년 10월 26일
      where: 미기재
      what: 표면 EMG를 이용해 사람 팔 동작 시퀀스를 Baxter 로봇 팔에 매핑하고 재현
      how: 필터링·활성 시작점 탐지 후 근육 활성화를 관절 명령으로 변환
      why: 미기재
    lead: 2026년 10월 26일 공개된 연구에서 연구진은 한 명의 참여자가 수행한 네 가지 사전 정의 동작 시퀀스 동안 오른팔 상지의 열
      곳에서 표면 EMG 신호를 순차적으로 수집했다. 연구진은 필터링과 NeuroKit2를 이용한 활성 시작점 탐지를 거쳐 감지된 근육
      활성화를 의수의 대리 장치로 사용한 Baxter 로봇 팔의 관절 명령에 매핑했다. 제안된 파이프라인은 사람 동작의 전반적인 구조와
      범위를 재현했고 로봇 관절 움직임은 참여자와 유사했지만, 모든 시퀀스에서 로봇의 완료 시간은 참여자보다 평균 319% 더 길었다.
    explanations:
      - heading: 측정과 실시간 구현 조건
        paragraphs:
          - 319% 차이는 EMG 신호 처리 시간이 아니라 로봇이 관절을 움직여 목표 각도에 도달하고 다음 동작을 시작하기까지의 동작
            시간이다. 연구 방식은 전체 신호를 분석하는 후처리라 실시간 구현이 아니며, 실시간 시스템에는 순차 수집 대신 동시 다채널
            EMG 기록과 지연 시간 같은 추가 제약이 필요하다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1968921/full
      - heading: 표본과 저자들의 해석
        paragraphs:
          - 단일 참여자 연구여서 사용자 간 일반화에 한계가 있다고 저자들은 밝혔다. 더 넓은 참여자 표본으로 사용자 간 효과를
            특성화하고 근육량·체지방 등 생물학적 차이에 따른 잠재적 성능 차이를 정량화하며, 서로 다른 생리 조건에서 참여자나 세션
            간 전극 배치의 작은 차이가 미치는 영향을 조사하자고 제안했다.
          - 저자들은 연구에서 조정할 수 없었던 로봇의 고정 기본 속도와 관절각 프로파일이 긴 완료 시간에 일부 기여했을 수 있다고
            제시했다. 관찰된 움직임은 로봇이 속도보다 부드러움과 정확성을 우선하도록 설정됐을 가능성을 시사한다고 서술했다.
        source_urls:
          - https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1968921/full
    papers: []
    relations: []
    topic_ids: []
  - title: 삼성전기·엔비디아, FC-BGA 공급 파트너십…전용 생산시설 공동 투자
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: 삼성전기와 엔비디아
      when: 파트너십 발표일 2026-10-21; 공급은 2026년부터 다년간 예정; 엔비디아용 생산능력 배정 전망은 2028년
      where: 세종·부산사업장 및 국내 생산시설
      what: 반도체 패키지기판 공급을 위한 전략적 비즈니스 파트너십 체결, 전용 생산시설 공동 투자·구축 계획 및 차세대 기판 다년 공급 계획
      how: AI 연산 반도체와 데이터센터 네트워크 스위치용 FC-BGA 공급; 물량은 연평균 두 자릿수 이상 성장 전망
      why: 미기재
    lead: 삼성전기는 2026년 10월 21일 엔비디아와 반도체 패키지기판 공급을 위한 전략적 비즈니스 파트너십을 체결했다고 밝혔다. 두 회사는
      공동 투자로 세종·부산사업장에 AI 반도체 패키지기판 전용 생산시설을 구축할 계획이다. 삼성전기는 2026년부터 국내 생산시설에서
      다년간 차세대 반도체 패키지기판을 공급할 예정이다. 공급 물량은 2026년부터 연평균 두 자릿수 이상 성장할 전망이며, 2028년에는
      전체 생산능력 중 유의미한 비중이 엔비디아용으로 구성될 것으로 보인다.
    explanations:
      - heading: 공급 품목
        paragraphs:
          - 공급 품목은 플립칩-볼그리드어레이(FC-BGA) 기판이다. 이 기판은 AI 연산 반도체와 데이터센터에서 칩 간 고속 연결을
            담당하는 네트워크 스위치에 쓰인다.
        source_urls:
          - https://www.thelec.kr/news/articleView.html?idxno=64086
    papers: []
    relations: []
    topic_ids: []
  - title: FDA, 신경과학 의료제품 개발 지원 프로그램 NAIN 출범
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미국 식품의약국(U.S. Food and Drug Administration, FDA)
      when: 원 발표일 2026-10-22; 오늘 소개일 2026-10-27
      where: 미기재
      what: 뇌·신경계 질환 의료제품 개발을 지원할 Neuroscience Advancement and Innovation Nexus(NAIN)
        출범과 첫 Alzheimer's Prevention Accelerator 계획
      how: FDA 세 센터의 과학·규제 전문성 조정, 폭넓은 신경·정신질환 범위와 이해관계자 참여, 알츠하이머 예방·조기개입 임상시험 방법 탐색
      why: 뇌와 신경계에 영향을 주는 질환의 의료제품 개발에 필요한 과학, 도구 및 규제 접근을 발전시키기 위해
    lead: 미국 식품의약국(FDA)은 원 발표일인 2026년 10월 22일 신경과학 발전·혁신 네트워크(Neuroscience
      Advancement and Innovation Nexus, NAIN)를 새 기관 프로그램으로 출범했다고 발표했다. NAIN은
      FDA의 세 센터 전문성을 조정해 약물·생물학적 제제·기기 전반의 과학·규제 쟁점을 다루고, 뇌·신경계 질환 의료제품 개발에 필요한
      과학·도구·규제 접근을 발전시킬 계획이다. 프로그램은 신경·정신질환, 물질사용장애와 통증을 폭넓게 다루며 환자·산업계·학계 등
      이해관계자 참여를 지원할 예정이다. 첫 사업인 Alzheimer's Prevention Accelerator는 알츠하이머를 예방하거나
      지연할 의료제품에 초점을 두고, 예방·조기개입 약물 개발 임상시험을 진전시킬 접근법을 살펴볼 계획이다.
    explanations:
      - heading: 임상시험 설계의 초점
        paragraphs:
          - Alzheimer's Prevention Accelerator는 시험 대상군, 질병 단계에 맞는 평가변수, 알츠하이머로
            인한 인지 저하를 예방하거나 늦췄음을 입증할 근거 접근법을 중점적으로 살펴본다. 이 사업은 FDA 내부와
            환자·돌봄자·연구자·산업계·민관 파트너십·다른 정부기관의 관점을 모을 계획이다.
        source_urls:
          - https://www.fda.gov/news-events/press-announcements/fda-launches-new-program-advance-neuroscience-medical-product-development
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, Isaac 로봇 플랫폼에 런타임·학습 프레임워크·데이터 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA
      when: 2026-10-21
      where: 독일 베를린, GTC Berlin 2026(10월 20~22일)
      what: 오픈 로보틱스 개발 플랫폼 Isaac 확장
      how: 휴머노이드 레퍼런스, 데이터셋, Isaac OS 런타임, Isaac Lab 3.0 및 참조 워크플로를 추가하고 로봇 학습 프레임워크를
        업데이트했다.
      why: 데이터·시뮬레이션·AI 모델·컴퓨팅을 통합해 로봇 개발 기간을 줄이고 상용화를 앞당기려는 전략이라고 밝혔다.
    lead: 2026년 10월 21일 NVIDIA는 GTC Berlin 2026에서 오픈 로보틱스 개발 플랫폼 Isaac의 확장을 발표했다. 확장
      항목에는 휴머노이드 레퍼런스, 데이터셋과 런타임, Isaac Lab 3.0 및 로봇 학습 프레임워크 업데이트가 포함된다.
      NVIDIA는 데이터·시뮬레이션·AI 모델·컴퓨팅을 통합해 로봇 개발 기간을 줄이고 상용화를 앞당기는 것을 전략으로 제시했다.
    explanations:
      - heading: 데이터와 시뮬레이션 자산
        paragraphs:
          - SimReady Central Library에는 시뮬레이션에 바로 쓸 수 있는 로봇·공장 자산이 2,000개 넘게 있으며
            Hugging Face에서 이용할 수 있다. Human 1M Dataset은 다양한 인간 활동, 동기화된 3개 시점 영상과
            3D 손 추적 데이터를 포함해 Hugging Face에서 제공되지만, 전체 데이터셋 접근은 Cosmos Coalition
            파트너로 제한된다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
      - heading: 학습 프레임워크와 런타임
        paragraphs:
          - 일반 공개된 오픈소스·에이전트 대응 Isaac Lab 3.0은 데스크톱에서 데이터센터까지 멀티 GPU 작업흐름과
            Newton 및 NVIDIA PhysX 물리 엔진을 이용해 로봇 정책을 학습·개선한다. NVIDIA Holoscan 기반
            오픈소스 Isaac OS 런타임은 시뮬레이션부터 실제 로봇까지 AI, 센서, 제어, 로봇 하드웨어를 연결해 결정론적 실시간
            성능을 제공하도록 설계됐다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
      - heading: DGX Station 참조 워크플로
        paragraphs:
          - NVIDIA가 공개 중인 참조 워크플로는 세 가지다. 강화학습으로 GR00T 1.7 모델을 개선하고, Isaac Lab에서
            손재주 조작 기술을 학습하며, ChatGPT Astra를 사용해 합성 데이터 생성을 위한 NVIDIA Cosmos 월드
            모델을 추가 학습한다. NVIDIA는 이 오픈소스 워크플로를 DGX Station에서 데이터 생성·훈련·평가에 활용하도록
            제시했다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
      - heading: Halos 안전 아키텍처 통합
        paragraphs:
          - NVIDIA에 따르면 Agile Robots, Agility, Dexory, FORT Robotics와 KION은 창고
            로봇 안전 아키텍처에 NVIDIA Halos를 통합하고 있다. SICK는 고정 구역을 넘어 변하는 조건에 대응하는 산업
            로봇의 동적 안전을 위해 Halos를 평가 중이다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
    papers: []
    relations: []
    topic_ids: []
  - title: Agile Robots, NVIDIA 기술을 탑재한 휴머노이드 레퍼런스 Agile ONE SN 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Agile Robots
      when: 2026-10-21
      where: 독일 베를린, GTC Berlin 2026
      what: NVIDIA Isaac GR00T와 Jetson Thor 기반의 풀스택 레퍼런스 휴머노이드 Agile ONE SN 공개
      how: 개발자가 휴머노이드 작업 역량을 개발·훈련·검증할 수 있는 참조 플랫폼으로 소개했으며 Halos 통합은 계획 상태다.
      why: 최첨단 휴머노이드 연구개발을 진전시키도록 설계됐다고 밝혔다.
    lead: 2026년 10월 21일 Agile Robots는 NVIDIA Isaac GR00T를 사전 탑재하고 Jetson Thor로 구동하는
      풀스택 레퍼런스 휴머노이드 Agile ONE SN을 공개했다. Agile Robots는 NVIDIA Halos 안전 스택을 통합할
      계획이며, Agile ONE SN은 2027년 초 이용 가능할 예정이다. 공개 사양은 Agile ONE S 본체, Dual WUJI
      Hand 2 손과 Jetson Thor의 크기·제어·연산 정보를 제시한다.
    explanations:
      - heading: 본체와 손 사양
        paragraphs:
          - 자료가 제시한 Agile ONE S 휴머노이드 본체는 높이 1.40m(4.59ft), 무게 40kg(88lb), 자유도
            31이며 팔 하나당 3kg을 들 수 있다. 듀얼 WUJI Hand 2는 손마다 손가락이 다섯 개이고 자유도 20, 1kHz
            힘 제어와 촉각 센싱을 제공해 정교한 조작을 지원한다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
      - heading: 온보드 연산과 개발 용도
        paragraphs:
          - NVIDIA Jetson Thor 온보드 컴퓨팅은 2,070 FP4 테라플롭스와 128GB 통합 메모리를 제공하며, 자료는
            이를 온보드 추론과 실시간 제어 용도로 설명했다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
      - heading: Agile Robots 경영진의 설명
        paragraphs:
          - Agile Robots 창립자 겸 CEO Zhaopeng Chen은 여러 기술을 배우고 사람을 위해 만들어진 다양한
            환경에서 일하는 범용 기계를 실용 규모로 구현하는 것이 휴머노이드의 과제라고 말했다. 그는 Agile ONE SN을
            개발자가 작업 역량을 만들고 훈련하며 검증할 수 있는 준비된 시스템이라고 소개했다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA DSX, AI 팩토리 전력·냉각 설계와 파트너 생태계 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA와 AI 팩토리 생태계 파트너
      when: 2026년 10월 21일
      where: 유럽; Nscale의 평가 시설은 아이슬란드, DSX Sim 사용 시설은 포르투갈과 아이슬란드다.
      what: AI 팩토리용 DSX 전력·냉각·시뮬레이션 플랫폼과 파트너 설계·인증 현황
      how: MaxLPS의 전력 배분, Flex의 전력망 연동, 액체 냉각·드라이 쿨러, 디지털 트윈, 참조 설계와 장비별 DSX Ready 인증을
        포함한다.
      why: NVIDIA는 전력 예산 안에서 처리량을 높이고 AI 팩토리의 전력·냉각 운영을 조정하기 위한 플랫폼이라고 설명한다.
    lead: NVIDIA는 2026년 10월 21일 유럽 생태계 파트너들이 냉각수 사용을 최소화하고 같은 AI 산출에 더 적은 전력을 쓰는 DSX
      AI Factory Platform을 도입해 AI 팩토리를 구축한다고 발표했다. NVIDIA는 유럽의 AI 클라우드들이 DSX 기반
      AI 팩토리를 구축·운영 중이며, 이에 따라 유럽 기업·개발자·정부의 가속 컴퓨팅 접근이 확대된다고 밝혔다. NVIDIA에 따르면
      DSX MaxLPS는 같은 수의 토큰을 생성하는 데 필요한 전력을 최대 30% 줄일 수 있고, Lambda의 HGX B200 기반
      개념검증에서는 고정 전력 예산에서 클러스터 토큰 처리량이 24%, GPU 용량이 19% 늘었다. 별도 평가에서 Nscale은
      아이슬란드 AI 팩토리의 NVIDIA GB300 NVL72 랙 4개와 동일한 264킬로와트 전력 예산을 사용해 추론 처리량 49%,
      관리 GPU 용량 37% 증가를 시연했다고 보고했다.
    explanations:
      - heading: 전력 사용과 전력망 연동
        paragraphs:
          - NVIDIA는 DSX MaxLPS가 AI 팩토리에 사전 배정된 전력 예산 안에서 전력을 동적으로 배분한다고 설명했다.
            운영자는 확보한 효율을 같은 전력 예산 안에서 더 많은 GPU 용량과 높은 처리량을 내는 데 쓸 수 있으며,
            CoreWeave, Firmus, Google Cloud, IREN, Lambda, Nebius, Nscale,
            Sharon AI는 DSX MaxLPS를 탐색 중이라고 밝혔다.
          - DSX Flex는 작업부하 전력 사용을 전력회사 요구, 수요반응 이벤트, 전력 가격에 맞추고 전력망·현장 재생에너지·에너지
            저장을 조정해 AI 팩토리를 유연한 부하로 운용하도록 한다는 NVIDIA의 설명이다. 이는 전력망 신뢰성과 더 빠른 연결을
            지원하려는 설계 목표다.
          - 초기 시험에서는 Emerald AI, EPRI, Nebius, 영국 National Grid와 NVIDIA가 모의 전력망
            이벤트에 대응해 Blackwell Ultra GPU 클러스터의 전력 사용을 최대 40% 낮추면서 핵심 작업부하를 계속
            실행하는 모습을 시연했다.
        source_urls:
          - https://nvidianews.nvidia.com/news/european-ecosystem-builds-worlds-most-efficient-ai-factories-with-nvidia-dsx
      - heading: 냉각 설계와 물 절감 추정
        paragraphs:
          - NVIDIA DSX 참조 설계는 폐회로 액체 냉각과 드라이 쿨러로 물 증발 없이 열을 배출해 시설 냉각수 사용을 거의
            0으로 낮추도록 설계됐다. NVIDIA는 2기가와트 규모에서 기존 냉각탑 방식보다 하루 5,400만 리터를 절감할 수
            있으며, 이는 18만 가구의 하루 물 사용량과 같다고 추산했다.
          - NVIDIA는 Vera Rubin 인프라가 100% 액체 냉각을 지원하고 냉각수 온도를 최대 섭씨 45도까지 허용한다고
            설명했다. 가장 더운 시기에 보조 기계식 냉각이 필요한지는 지역 기후에 따라 달라진다고 밝혔다.
        source_urls:
          - https://nvidianews.nvidia.com/news/european-ecosystem-builds-worlds-most-efficient-ai-factories-with-nvidia-dsx
      - heading: 개발·설계·인증 상태
        paragraphs:
          - Nscale은 포르투갈과 아이슬란드 시설에서 DSX Sim을 사용해 배치 전에 전력·냉각·인프라 구성을 평가하는 디지털
            트윈을 만들고 있다. NVIDIA는 모듈형 오픈소스 DSX OS의 구성 요소 세 가지가 developer preview
            단계라고 밝혔다.
          - NVIDIA에 따르면 Schneider Electric은 Vera Rubin용 전력·냉각 참조 설계를 개발했다. Trane
            Technologies와 Eaton은 NVIDIA Vera Rubin DSX AI Factory Reference
            Design의 통합 설계를 함께 만들었으며, Eaton Beam 전력 인프라와 Trane Continuum 냉각·조정
            제어를 grid-to-chip 구조로 연결해 데이터센터 효율을 높이고 설치 비용을 낮추려는 설계다. Trane은 열관리
            시스템 참조 설계 7개를 게시했고 그중 3개는 각각 250메가와트 규모의 DSX 냉각 참조 설계다.
          - NVIDIA는 Trane의 LiquidStack GigaModular 냉각수 분배 장치와 Vertiv의 2.3메가와트
            CoolChip 장치가 각각 해당 DSX Ready 범주에서 인증을 받았고, Hitachi Energy의 배터리 저장
            시스템도 DSX Ready BESS 자격을 얻었다고 보고했다.
        source_urls:
          - https://nvidianews.nvidia.com/news/european-ecosystem-builds-worlds-most-efficient-ai-factories-with-nvidia-dsx
      - heading: 진행 중인 에너지 파트너 작업
        paragraphs:
          - NVIDIA는 GE Vernova, Hitachi Energy, Siemens Energy와 시설 요구에 맞춘 전력
            인프라·디지털 트윈 프로젝트를 진행 중이라고 밝혔다. Hitachi Energy는 전력망·발전·저장 자원과 작업부하 수요를
            최적화하기 위해 에너지관리시스템과 DSX Flex의 연동을 개발 중이다.
        source_urls:
          - https://nvidianews.nvidia.com/news/european-ecosystem-builds-worlds-most-efficient-ai-factories-with-nvidia-dsx
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, 공급망 파트너와 기판·패키징·테스트 생산능력 확대 계획
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: NVIDIA와 IBIDEN·Samsung Electro-Mechanics·Unimicron Technology Corporation 등
        공급망 파트너; Samsung Electro-Mechanics는 NVIDIA와 전략적 공급 파트너십을 체결했다고 발표했다.
      when: NVIDIA 발표 및 Samsung Electro-Mechanics가 밝힌 파트너십 체결일은 2026년 10월 21일; 기판 생산능력
        확대 계획은 향후 3년, Unimicron 증설은 2027년 2분기 시작 및 2028년 중반 완전 가동 목표, Samsung
        Electro-Mechanics의 NVIDIA 배정 생산량은 2028년까지 상당한 비중으로 전망된다.
      where: 글로벌 공급망; 한국 세종·부산 사업장; 한국 내 기존 Samsung Electro-Mechanics 생산시설; 대만
        Unimicron 제조시설.
      what: NVIDIA 공급망 파트너들의 글로벌 제조 역량 확대 계획, 3개 기판 계약에 따른 합산 생산능력 증가 전망, Samsung
        Electro-Mechanics의 기판 공급 파트너십과 공급·시설 계획, Unimicron의 KF 기판 증설 계획.
      how: NVIDIA가 기판·첨단 패키징·테스트·광 엔진 분야의 신규·기존 공급업체 확장을 지원하고 기판 계약과 생산능력 예약 계약으로
        협력한다.
      why: NVIDIA는 가속 컴퓨팅과 풀스택 AI 팩토리 플랫폼의 증가하는 수요에 대응하고 글로벌 공급망의 회복력과 중복성을 강화하기 위한
        계획이라고 설명했다.
    lead: NVIDIA는 2026년 10월 21일 GTC Berlin에서 가속 컴퓨팅과 풀스택 AI 팩토리 플랫폼의 수요 증가에 대응해 공급망
      파트너들과 글로벌 제조 역량을 확대할 계획이라고 발표했다. NVIDIA는 IBIDEN, Samsung
      Electro-Mechanics, Unimicron Technology Corporation과의 기판 계약이 향후 3년 동안 합산
      생산능력의 2.5배 증가를 이끌 것으로 전망했으며, 별도로 자사 제품용 기판 생산능력도 같은 기간 2.5배로 늘릴 계획이라고 밝혔다.
      NVIDIA는 Amkor Technology, IBIDEN, King Yuan Electronics(KYEC), Samsung
      Electro-Mechanics, Siliconware Precision Industries(SPIL), Unimicron
      Technology Corporation과 협력해 신규·기존 공급업체의 기판·첨단 패키징·테스트·광 엔진 제조 역량을 확장하고 자사
      글로벌 공급망의 회복력과 중복성을 강화하고 있다. Samsung Electro-Mechanics는 10월 21일 NVIDIA와 기판
      공급 전략적 파트너십을 체결했다고 밝혔다.
    explanations:
      - heading: 한국 기판 생산시설 계획
        paragraphs:
          - 삼성전기와 NVIDIA는 세종·부산 사업장에 AI 반도체 패키지기판 전용 생산시설을 공동 투자해 구축할 계획이다.
            NVIDIA는 협력이 삼성전기의 시설 개선과 두 지역의 신규 공장을 지원한다고 밝혔고, 2028년까지 NVIDIA에 배정된
            생산량이 삼성전기의 연간 패키지기판 총 생산능력에서 상당한 비중을 차지할 것으로 전망됐다.
          - NVIDIA는 삼성전기가 기존 한국 사업장의 생산능력을 즉시 공급망에 제공한다고 설명했다. 더일렉 보도에 따르면 삼성전기는
            국내 생산시설에서 올해부터 다년간 차세대 반도체 패키지기판을 공급할 예정이다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-and-supply-chain-partners-expand-capacity-to-accelerate-ai-infrastructure-buildout
          - https://www.thelec.kr/news/articleView.html?idxno=64086
      - heading: FC-BGA 공급과 대만 증설
        paragraphs:
          - 더일렉 보도에 따르면 삼성전기가 공급할 FC-BGA는 AI 연산 반도체용과 데이터센터 안에서 칩 사이 고속 연결을 담당하는
            네트워크 스위치용이다. 공급 물량은 2026년부터 연평균 두 자릿수 이상 성장할 전망이다.
          - NVIDIA는 생산능력 예약 계약으로 대만 Unimicron의 KF 기판 제조 확장을 지원하며, 이 확장은 2027년
            2분기에 생산능력을 추가하기 시작해 2028년 중반까지 완전 생산능력에 도달할 것으로 예상된다.
        source_urls:
          - https://nvidianews.nvidia.com/news/nvidia-and-supply-chain-partners-expand-capacity-to-accelerate-ai-infrastructure-buildout
          - https://www.thelec.kr/news/articleView.html?idxno=64086
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA·Amkor, 한국 인터포저 웨이퍼 생산능력 2028년 말까지 300% 초과 확대 목표
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: NVIDIA와 Amkor Technology; 공급망 협력에는 IBIDEN, King Yuan Electronics(KYEC),
        Samsung Electro-Mechanics, Siliconware Precision Industries(SPIL),
        Unimicron Technology Corporation도 포함된다.
      when: NVIDIA 발표일은 2026년 10월 21일; 인터포저 웨이퍼 생산능력 확대 목표 시점은 2028년 말이다.
      where: 한국의 고급 패키징 및 Amkor 신규 제조시설.
      what: NVIDIA와 Amkor가 인터포저 웨이퍼 생산능력을 300% 초과 확대하고 신규 제조시설을 개발할 계획을 발표했다.
      how: NVIDIA 공급망 파트너들과 기판·첨단 패키징·테스트·광 엔진 분야 제조 역량을 확장하고, Amkor의 한국 신규 제조시설 개발을
        병행한다.
      why: NVIDIA는 증가하는 가속 컴퓨팅·풀스택 AI 팩토리 플랫폼 수요에 대응하고, Amkor와의 확장으로 현재 및 차세대 플랫폼의 더
        높은 생산량을 지원하려 한다.
    lead: NVIDIA는 2026년 10월 21일 GTC Berlin에서 가속 컴퓨팅과 풀스택 AI 팩토리 플랫폼의 수요 증가에 대응해 공급망
      파트너들과 글로벌 제조 역량을 확대할 계획이라고 발표했다. 협력에는 Amkor Technology, IBIDEN, King Yuan
      Electronics(KYEC), Samsung Electro-Mechanics, Siliconware Precision
      Industries(SPIL), Unimicron Technology Corporation이 참여하며, 이들은 기판·첨단
      패키징·테스트·광 엔진의 제조 역량을 넓혀 NVIDIA 글로벌 공급망의 회복력과 중복성을 강화하도록 지원한다. 이 가운데
      NVIDIA와 Amkor는 한국에서 고급 패키징 생산능력을 확대해 2028년 말까지 인터포저 웨이퍼 생산능력을 300% 초과 늘리는
      것을 목표로 하고, Amkor의 한국 신규 제조시설 개발과 함께 현재 및 차세대 NVIDIA 플랫폼의 더 높은 생산량을 지원할
      계획이다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, 반도체 테스트 용량 2027년까지 두 배 전망…KYEC 미국 시설 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA와 King Yuan Electronics (KYEC); NVIDIA는 Amkor
        Technology·IBIDEN·Samsung Electro-Mechanics·Siliconware Precision
        Industries (SPIL)·Unimicron Technology Corporation과도 공급망 협력 중이라고 밝혔다.
      when: 발표일은 2026년 10월 21일; NVIDIA의 테스트 용량 전망 기간은 2026년에서 2027년까지이며, KYEC 미국 시설의
        대량 생산 목표 시점은 2027년 4월이다.
      where: 테스트 용량 구축 지역은 미국·대만·싱가포르이며, KYEC의 신규 테스트 시설은 미국에 계획됐다.
      what: NVIDIA는 전체 반도체 테스트 용량이 2026년에서 2027년까지 두 배가 될 것으로 전망하고, KYEC의 미국 신규 테스트
        시설과 장비에 11억 달러 용량 예약 선급금을 지원할 계획이다.
      how: 미국·대만·싱가포르의 시설 구축으로 테스트 용량을 확대하고, KYEC는 NVIDIA의 용량 예약 선급금으로 미국 신규 시설과 장비를
        마련할 계획이다.
      why: NVIDIA는 시설 구축과 KYEC 지원을 포함한 공급망 협력이 자사 글로벌 공급망의 회복력과 중복성을 강화한다고 설명했다.
    lead: 2026년 10월 21일 게시된 NVIDIA 발표에서 회사는 전체 반도체 테스트 용량이 2026년부터 2027년까지 두 배가 될
      것으로 예상했으며, 미국·대만·싱가포르의 시설 구축이 이를 뒷받침한다고 밝혔다. NVIDIA는 Amkor Technology,
      IBIDEN, King Yuan Electronics(KYEC), Samsung Electro-Mechanics,
      Siliconware Precision Industries(SPIL), Unimicron Technology Corporation과
      협력해 기판·첨단 패키징·테스트·광 엔진의 제조 역량을 확대하고 글로벌 공급망의 회복력과 중복성을 강화하고 있다. KYEC는
      NVIDIA의 11억 달러 용량 예약 선급금 지원을 받아 미국에 신규 시설을 건설할 계획이며, 선급금은 미국 테스트 시설과 장비를
      지원하고 대량 생산은 2027년 4월을 목표로 한다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: Bolt, 유럽 로보택시 프로그램에 NVIDIA Alpamayo Stack 선택
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: Bolt와 NVIDIA
      when: 2026년 10월 21일
      where: 유럽 로보택시 프로그램; 마드리드(2027년 주행 데이터 수집 계획)
      what: Bolt의 NVIDIA Alpamayo Stack 선택 및 유럽 로보택시 통합·출시 계획
      how: 유럽 도로용 소프트웨어 조정과 복수 제조사 차량 통합, 실제 주행 데이터 수집 계획
      why: 미기재
    lead: 2026년 10월 21일 공개된 NVIDIA 발표에 따르면 Bolt는 유럽 로보택시 프로그램에 NVIDIA Alpamayo
      Stack을 선택했다. 프로그램은 NVIDIA Hyperion 기반으로 제작될 미래 Lucid 차량부터 시작할 예정이며, Bolt와
      NVIDIA는 여러 제조사의 차량에 통합할 수 있도록 소프트웨어를 유럽 도로 환경에 맞춰 조정하고 양사의 주행·안전 기술과 차량군
      관리·운영·현지 시장 전문성을 결합할 계획이다. Bolt는 규제 승인을 받으면 2027년 마드리드에서 자율주행 기술 개발·검증을 위한
      실제 주행 데이터를 수집할 계획이다. 독일을 미래 배치 우선 지역으로 삼아 NVIDIA Hyperion 기반 레벨 4 지원 미래
      Lucid 차량을 유럽에 최소 2만5000대 출시할 계획이다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, 자율주행 안전 근거 생성하는 Halos SAFE 평가 프레임워크 공개
    kind: 사건 뉴스
    region: 국제 공동
    facts:
      who: NVIDIA; 평가 워크플로에는 dSPACE, IVEX, TÜV Rheinland가 협력한다.
      when: 2026년 10월 21일 발표.
      where: 미기재
      what: NVIDIA Halos 안전 시스템에 시뮬레이션과 물리적 시험을 연계하는 Halos SAFE 자율주행 안전 평가 프레임워크 도입.
      how: 정의된 시나리오·시험·측정 가능한 성능 기준으로 시뮬레이션, 소프트웨어·하드웨어 인 더 루프 평가, 도로 시험, 차량군 모니터링을
        연결한다.
      why: 개발자가 주행 행태와 시뮬레이션 정확도를 반복해서 평가하고, 배치를 지원할 측정 가능하고 추적 가능한 자율주행 안전 근거를 생성하도록
        돕기 위해.
    lead: NVIDIA는 2026년 10월 21일 Halos 안전 시스템 안에 Halos SAFE를 도입해 시뮬레이션과 물리적 시험을 결합하고,
      개발자가 측정 가능하고 추적할 수 있는 자율주행 안전 근거를 만들도록 돕는다. NVIDIA는 주행 행태와 시뮬레이션 정확도를 반복해서
      평가할 수 있도록 이 프레임워크를 공개했으며, dSPACE·IVEX·TÜV Rheinland가 평가 워크플로에서 협력하고 있다.
      Halos SAFE는 정의된 시나리오·시험·측정 가능한 성능 기준을 통해 시뮬레이션, 소프트웨어·하드웨어 인 더 루프 평가, 도로
      시험, 차량군 모니터링을 연결해 배치를 뒷받침할 추적 가능한 안전 근거를 생성한다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: ASEC, PHP2Shell 재현 공개…AhnLab EDR 탐지 사례 소개
    kind: 사건 뉴스
    region: 국내
    facts:
      who: AhnLab SEcurity intelligence Center(ASEC); PHP 보안팀은 취약점 수정 업데이트를 배포했다.
      when: ASEC 문서 공개일 2026년 10월 22일; PHP 수정 업데이트 배포일 2026년 10월 21일.
      where: PHP 내부 요청 처리 과정과 ASEC의 PHP 서버 재현 환경. 실제 지역은 기재되지 않았다.
      what: CVE-2026-109618 및 CVE-2026-109619의 공개 PoC 재현, AhnLab EDR 탐지 사례, PHP 수정 버전과
        웹 서비스 재시작 안내.
      how: 공개 PoC로 단계별 재현을 진행하고 AhnLab EDR/XDR의 의심 행위 탐지 정보를 정리했다.
      why: AhnLab은 관리자가 공격 원인을 파악하고 대응 및 재발 방지 절차를 세우도록 정보를 정리했다고 설명했다.
    lead: AhnLab SEcurity intelligence Center(ASEC)는 2026년 10월 22일 공개 PoC를 참고해
      PHP2Shell 취약점 재현 테스트를 진행하고 AhnLab EDR 탐지 사례를 소개했다. 대상은 PHP 내부 요청 처리 과정의
      CVE-2026-109618과 CVE-2026-109619로, 두 취약점 모두 인증되지 않은 공격자의 원격 코드 실행으로 이어질 수
      있다고 보고됐다. ASEC이 정리한 평가에서 두 취약점은 각각 CVSS v4.0 9.2점이며, PHP 보안팀은 하루 전인 10월
      21일 수정 업데이트를 배포하고 PHP 8.2~8.5 사용자에게 즉시 업데이트를 권고했다. 문서에 적힌 계열별 수정 버전은 PHP
      8.5.12, 8.4.27, 8.3.36, 8.2.35이며, 업데이트 뒤 웹 서비스를 재시작하도록 안내한다.
    explanations:
      - heading: 두 취약점의 원인
        paragraphs:
          - ASEC 문서는 CVE-2026-109618을 메모리 부족으로 요청 처리가 중단될 때 데이터가 완전히 초기화되지 않은 채
            남아 정리 과정에서 잘못된 데이터가 유효한 것으로 취급될 수 있는 문제로 설명했다. 해당 취약점의 잠재적 영향은 인증 없는
            원격 코드 실행으로 기재됐다.
          - CVE-2026-109619은 요청 처리에 쓰인 내부 상태가 메모리 해제 뒤에도 남아 초기화 전에 후속 요청에서 재사용될
            가능성으로 설명됐다. ASEC 자료는 이 취약점도 인증 없는 원격 코드 실행의 잠재적 영향을 가지며 CVSS v4.0
            점수를 9.2로 제시한다.
        source_urls:
          - https://asec.ahnlab.com/ko/95955/
      - heading: 공개 PoC 재현 과정
        paragraphs:
          - ASEC의 재현 타임라인은 0~6초에 공격자와 피해 서버 IP 주소를 확인하고, 6~16초에 PHP 웹사이트 대상 테스트
            스크립트를 실행하는 순서다. 16~20초에는 피해 서버가 공격자 PC에 연결되어 공격자가 피해 서버의 명령 셸을 사용할 수
            있게 되는 장면을 제시한다.
          - 이어 20~23초 구간에는 명령이 서버의 웹 계정인 www-data 권한으로 실행되는 것을 확인하고, 23~29초에는 서버
            IP 주소를 확인해 재현 접속이 대상 서버에 도달했는지 검증한다고 설명한다. 이는 ASEC이 공개 PoC를 참고해 수행한
            재현 과정이다.
        source_urls:
          - https://asec.ahnlab.com/ko/95955/
      - heading: 패치와 탐지 정보
        paragraphs:
          - ASEC의 안내는 PHP 보안 업데이트 적용 뒤 웹 서비스를 재시작하도록 한다. AhnLab EDR/XDR 설명은 PHP
            서비스에서 발생하는 의심스러운 명령 실행이나 파일 생성 등 행위를 위협 또는 주요 행위로 탐지해 관리자의 원인 파악과
            대응·재발 방지 절차 수립을 돕는다는 내용이다.
        source_urls:
          - https://asec.ahnlab.com/ko/95955/
    papers: []
    relations: []
    topic_ids: []
  - title: KAIST, 전하 감지·자외선 집기를 한 소재에 묶은 '이오노그래스퍼' 발표
    kind: 사건 뉴스
    region: 국내
    facts:
      who: KAIST 생명화학공학과 문홍철 교수 연구팀
      when: 2026-09-30 KAIST 발표
      where: 미기재
      what: 접근 감지와 자외선 굽힘을 한 이온성 소재 이오노그래스퍼 개발·집기 시연
      how: 아조벤젠·수분 흡수 고분자 결합과 내부 이온 재배열
      why: 미기재
    lead: KAIST는 9월 30일 문홍철 교수 연구팀이 전하를 띤 물체의 접근을 감지하고 자외선에 굽는 이온성 소재 '이오노그래스퍼'를
      개발했다고 발표했다. 연구팀은 소재가 굽혀지며 물체를 붙잡는 모습을 시연했고, 빛을 끈 뒤에도 잡은 형태를 10분 이상 유지했다고
      밝혔다. 빛에 반응하는 아조벤젠과 수분을 흡수하는 고분자를 결합해 이온이 움직이는 그물망 구조를 만들었다.
    explanations:
      - heading: 접근 감지와 빛에 따른 굽힘
        paragraphs:
          - 연구팀은 전하를 띤 물체가 가까워질 때 소재 안의 양이온과 음이온이 재배열되면서 나타나는 전기 신호로 별도의 감지용 전압
            없이 접근과 움직임을 알아냈다고 설명했다.
          - 자외선을 비추면 아조벤젠의 모양 변화와 소재 한쪽 면의 수분 손실로 굽힘이 생기고, 그 움직임으로 물체를 붙잡는 모습을
            시연했다.
        source_urls:
          - https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67710&GotoPage=1
      - heading: 연구팀이 개선하려는 성능
        paragraphs:
          - 연구팀은 감지 거리와 움직이는 속도, 반복 사용 시 내구성, 물체를 지탱하는 힘을 높이고, 가시광선이나 근적외선으로도
            움직일 수 있도록 연구를 이어갈 계획이다.
        source_urls:
          - https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67710&GotoPage=1
    papers: []
    relations: []
    topic_ids: []
  - title: ASEC, 불법 프로그램 위장 Rust 인포스틸러의 정보 탈취·추가 악성코드 기능 분석
    kind: 사건 뉴스
    region: 국내
    facts:
      who: AhnLab SEcurity intelligence Center (ASEC)
      when: 2026-10-21 (보고서 발표일); 첫 발견 8월 중순; 대량 유포 본격화 9월 초
      where: 미기재
      what: 불법 프로그램으로 위장해 유포된 Rust 기반 정보탈취 악성코드의 분석과 대응 권고
      how: 샘플 실행·유포 방식, C2 설정 및 정보 수집·추가 payload 동작 분석
      why: 저장정보 탈취와 추가 악성코드 실행, 자격정보 악용에 따른 2차 피해 가능성
    lead: 2026년 10월 21일 AhnLab SEcurity intelligence Center(ASEC)는 불법 프로그램으로 위장한 신종
      정보탈취형 악성코드(인포스틸러)를 확인했다고 밝혔다. ASEC에 따르면 이 악성코드는 8월 중순 처음 발견됐고, 초기 소규모 배포에서
      Autolt를 사용한 뒤 Explorer 프로세스 인젝션이나 독립 실행 방식으로 바뀌어 9월 초 대량 유포가 본격화됐으며 일부 샘플은
      별도 다운로더를 거쳤다. 악성코드는 브라우저와 업무용 프로그램에 저장된 정보를 노리고, C2 설정에 따라 수집 범위와 후속 동작이
      달라져 추가 피해로 이어질 수 있다고 ASEC는 설명했다.
    explanations:
      - heading: 유포와 실행 회피
        paragraphs:
          - ASEC은 일부 샘플이 Rust로 작성됐으며 동적 JMP를 활용한 안티 디스어셈블, CPU 메모리 캐시 조회를 이용한 안티
            샌드박스, DLL 인젝션을 사용했다고 분석했다. 보고서는 이러한 기법이 기존 인포스틸러에서 흔하지 않았다고 설명한다.
          - 실행 환경을 샌드박스나 가상 환경으로 판단한 샘플은 정보 탈취를 수행하지 않고 종료했다. 최근 유포된 일부 샘플은 내부에
            암호화해 둔 DLL을 복호화한 뒤 Explorer 프로세스에 주입했다.
          - 참조 문자열은 사용 직전까지 암호화해 두며, 샘플별로 달라지는 변형 색인 테이블을 사용한다. 복호화 함수에 전달된 정수
            값으로 테이블을 회전해 같은 평문도 키에 따라 다르게 암호화할 수 있고, 암호문 끝에 임의 문자열을 붙여 원래 길이를
            추정하기 어렵게 했다.
        source_urls:
          - https://asec.ahnlab.com/ko/95936/
      - heading: C2 통신과 수집 범위
        paragraphs:
          - 실행되면 설치 프로그램 목록, CPU 이름, 그래픽 드라이버 정보, CPUID 명령 데이터, Windows 버전 등 PC
            기본 정보를 공격자가 통제하는 C2 서버로 보낸다. 이후 서버 설정 데이터가 정보 수집 대상과 추가 동작을 정한다.
          - ASEC은 송신 데이터를 XOR로 암호화한 뒤 Windows의 LZNT1 알고리즘으로 압축하고, 수신 데이터는 XOR로
            복호화한다고 설명했다. XOR 키는 샘플마다 달랐으며, 보고서는 네트워크 통신 내용 기반 탐지를 피하려는 의도일 수 있다고
            추정했다.
          - 확인된 C2 설정은 인증서, SSH 키, 암호화폐 지갑, 설정 파일과 문서를 포함한 폭넓은 프로그램·파일을 탈취 대상으로
            지정했다. 실제 수집 범위는 C2 설정에 따라 달라질 수 있으며 VPN이나 원격접속 자격정보가 노출되면 내부 시스템 무단
            접근이나 추가 공격에 악용될 수 있다고 ASEC은 경고했다.
        source_urls:
          - https://asec.ahnlab.com/ko/95936/
      - heading: 추가 payload와 점검 항목
        paragraphs:
          - C2 설정에 지정된 외부 URL에서 payload를 내려받아 실행하는 기능도 있다. 분석된 설정에서는 이 기능이 활성화되어
            있어 다른 악성코드를 배포하는 드로퍼로 활용될 수 있다고 ASEC은 설명했다.
          - ASEC은 신뢰할 수 없는 출처에서 내려받거나 압축을 푼 대용량 ZIP 안의 실행 파일을 실행한 이력을 확인하라고
            권고했다. 함께 살펴볼 흔적으로는 autoit.exe 또는 explorer.exe 관련 비정상 코드 주입, 의심스러운 C2
            통신, 정보 탈취와 추가 악성코드 설치 흔적을 들었다.
        source_urls:
          - https://asec.ahnlab.com/ko/95936/
    papers: []
    relations: []
    topic_ids: []
  - title: KAIST 연구팀, 스마트폰 AI에 서버 지식을 재사용하는 CURE 개발
    kind: 사건 뉴스
    region: 국내
    facts:
      who: KAIST 전산학부 이재길 교수 연구팀
      when: 2026년 9월 21일
      where: KAIST
      what: 스마트폰의 소형 AI와 서버의 대형 AI를 연결하는 CURE 기기-서버 협업 기술 개발
      how: 서버 대형 AI에게서 얻은 지식을 스마트폰에 저장하고 비슷한 문제에 재사용
      why: 미기재
    lead: KAIST는 2026년 9월 21일 전산학부 이재길 교수 연구팀이 스마트폰의 소형 AI와 서버의 대형 AI를 연결하는 기기-서버 협업
      기술 CURE(Cumulative Knowledge Reuse, 누적 지식 재사용)를 개발했다고 밝혔다. 대학 측에 따르면 CURE는
      서버의 대형 AI에게서 얻은 지식을 스마트폰에 저장해 비슷한 문제에 재사용하고, 높은 정확도를 유지하면서 서버 호출을 평균
      55.61% 줄였다. 연구진은 비슷한 문제가 반복될수록 서버 의존을 낮추고 더 빠르게 판단하는 모바일 AI의 가능성을 제시했다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot 사용량 API, OpenCode 등 도구별 요청·토큰 집계 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-10-24 (한국시간; 원문 발표 2026-10-23T16:42:03-07:00)
      where: 미기재
      what: Copilot 사용량 metrics API에 도구별 totals_by_client 집계 추가
      how: 각 요청에 전달된 integration ID로 client를 구분하고 서버에서 모델 요청·세션·토큰 지표를 보고
      why: IDE 밖 Copilot 도구 사용량의 telemetry 공백을 메워 도구 사용과 거버넌스 결정을 지원
    lead: 2026년 10월 24일(한국시간) GitHub는 Copilot 사용량 지표 API가 OpenCode처럼 기존 보고서에 잡히지 않던
      도구의 모델 사용량도 보고하도록 확장하고 `totals_by_client` 배열을 추가했다고 밝혔다. 새 집계는
      엔터프라이즈·조직·사용자 단위 보고서의 1일 및 28일 버전에 적용되며, 28일 통합 보고서에서는 날짜별 `day_totals`
      항목에 표시된다. GitHub는 IDE 밖 도구가 편집기 telemetry를 보내지 않아 `totals_by_ide`에서 빠졌던
      사용량을 서버 요청 집계로 보완해, 도구별 사용과 요청·토큰 규모를 파악하고 지원·거버넌스 결정을 내릴 수 있다고 설명했다.
    explanations:
      - heading: 도구별 집계 필드
        paragraphs:
          - 각 `totals_by_client` 항목은 하나의 client를 나타낸다. `client`에는 요청을 보낸 도구가
            표시되며 예시는 `opencode`, `claude_code`, `codex`, `zed`, `copilot_cli`,
            `github_app`, `cloud_agent`, `code_review`, `vscode`, `jetbrains`다.
            인식되지 않은 값은 `other`로 묶인다.
          - "`request_count`는 해당 client의 성공한 모델 요청 수다. 이는 prompt 수가 아니라 model
            call 수이므로 한 prompt가 여러 call을 만들 수 있고, prompt나 interaction 횟수와 직접
            비교해서는 안 된다. `session_count`는 서로 다른 세션 수이며 `token_usage`는 prompt
            token, output token, 요청당 평균 token을 담는다."
          - "`totals_by_model`은 요청·token 지표를 모델별로 나눈다. `model_selection_mode`는
            직접 요청한 `user_selected`, 자동 선택 `auto`, 제품이 고른 `product_selected`를
            구분하고, 아직 개별 보고되지 않는 선택 방식은 `other`, 정규화할 수 없는 값은 `unknown`으로 나타난다.
            Copilot code review와 cloud agent는 제품이 모델을 고르므로 `product_selected`이며,
            code review 모델은 `unknown`으로 보고된다."
        source_urls:
          - https://github.blog/changelog/2026-10-23-usage-metrics-api-adds-usage-from-tools-like-opencode
      - heading: 식별·접근 조건과 호환성
        paragraphs:
          - GitHub는 각 요청에 실린 integration ID로 client를 식별한다. 따라서 `client`는 실제 도구
            신원을 검증한 값이 아니라 요청에 담긴 ID를 바탕으로 한 best-effort 그룹이다. 이 API의
            `totals_by_client`는 Copilot을 사용하는 모든 도구의 모델 traffic, 즉 요청과 토큰을 측정한다.
            이는 Claude나 Codex 같은 GitHub agent app이 시작한 job 수를 집계하는 agent app
            activity와는 다른 지표다.
          - 이 지표는 엔터프라이즈 소유자와 billing manager, 조직 소유자, 또는 `View Copilot Metrics`
            권한을 가진 사용자 지정 조직·엔터프라이즈 역할이 볼 수 있다. Copilot usage metrics 정책도 활성화되어
            있어야 한다.
          - GitHub는 변경이 추가 방식이라 기존 필드는 그대로 유지되고, 보고할 사용량이 없으면
            `totals_by_client`가 빈 배열이라고 밝혔다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-usage-metrics-api-adds-usage-from-tools-like-opencode
    papers: []
    relations: []
    topic_ids: []
  - title: AWS Lambda MicroVMs, 4개 리전 추가해 총 14개 리전으로 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026년 10월 22일
      where: 아시아 태평양(홍콩·말레이시아·태국) 및 유럽(스페인)의 4개 추가 리전
      what: Lambda MicroVMs 제공 범위를 4개 리전 늘려 총 14개 리전으로 확대
      how: 각 사용자 또는 작업에 격리된 MicroVM 실행 환경을 제공
      why: 최종 사용자에 가까운 리전에서 실행해 지연 시간 및 데이터 레지던시 요구를 맞추는 데 도움
    lead: AWS는 2026년 10월 22일 Lambda MicroVMs를 아시아 태평양(홍콩·말레이시아·태국)과 유럽(스페인) 등 4개 추가
      리전에 제공해 총 14개 AWS 리전에서 사용할 수 있다고 밝혔다. AWS는 이번 출시로 개발자가 최종 사용자 가까운 4개 추가
      리전에서 Lambda MicroVMs를 실행해 지연 시간 및 데이터 레지던시 요구를 맞추는 데 도움을 받을 수 있다고 설명했다.
    explanations:
      - heading: 격리와 상태 보존을 갖춘 실행 환경
        paragraphs:
          - AWS는 Lambda MicroVMs를 사용자 또는 AI가 생성한 코드를 실행하는 서버리스 컴퓨팅 프리미티브로 설명한다.
            VM 수준 격리와 거의 즉시 이뤄지는 실행·재개, 상태 보존을 제공한다고 밝혔다.
          - 개발자는 가상화 인프라를 직접 관리하지 않고 격리·속도·상태 보존 중 하나를 포기하지 않으면서 사용자나 작업마다 독립된
            컴퓨팅 환경을 줄 수 있으며, AWS가 든 활용 예는 AI 코딩 어시스턴트, 대화형 개발 환경, 취약점 스캐너다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/lambda-microvms-4-additional-regions
      - heading: 이미지 생성부터 접속까지
        paragraphs:
          - 개발자는 Dockerfile로 MicroVM 이미지를 만든 뒤 그 이미지에서 MicroVM을 실행한다. 사용자나 작업별
            MicroVM에는 전용 HTTPS URL을 부여할 수 있고, 이 URL은 HTTP/2·gRPC·WebSockets를
            지원한다.
          - 서비스는 AWS Lambda 콘솔, AWS CloudFormation, AWS Cloud Development Kit 또는
            Agent Toolkit for AWS를 사용하는 에이전트 개발 도구로 이용할 수 있다고 AWS는 안내했다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/lambda-microvms-4-additional-regions
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Public monitoring에 경보 관리·데이터 레지던시 지원 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub.
      when: 공개 모니터링 데이터 레지던시 제공 안내는 한국시간 2026년 10월 23일; 경보 관리 기능 안내는 한국시간 2026년 10월
        24일.
      where: GitHub Enterprise Cloud와 엔터프라이즈 보안 대시보드; 데이터 레지던시 환경에서는 지정된 지리 범위 내 대시보드.
      what: Public monitoring의 경보 관리, 토큰 유효성 확인, REST API 및 enterprise webhook 지원과
        GHEC 데이터 레지던시 환경 공개 프리뷰 제공.
      how: 관리자는 대시보드에서 경보를 처리하고, 지원되는 토큰 상태를 확인하며, REST API·enterprise webhook으로 대응
        파이프라인을 연결할 수 있다. 데이터 레지던시 고객의 귀속 판정은 검증된 도메인 일치만 사용한다.
      why: GitHub는 공개 저장소에 노출된 비밀정보 발견을 대규모로 분류하고 대응하도록 경보 관리 기능을 설명했다.
    lead: GitHub는 한국시간 2026년 10월 24일 Public monitoring에 경보 관리 기능을 더해 기업 고객이 엔터프라이즈
      보안 대시보드에서 공개 모니터링 결과를 분류·처리할 수 있다고 밝혔다. 관리자는 경보를 Dismissed 또는 Fixed로 닫고
      선택적으로 설명을 남기거나, 상황이 바뀌면 닫힌 경보를 다시 열 수 있다. 하루 앞선 한국시간 10월 23일에는 Public
      monitoring을 GitHub Enterprise Cloud 데이터 레지던시 고객에게도 공개 프리뷰로 제공한다고 발표했다. 데이터
      레지던시 환경에서는 검증된 도메인 일치만으로 조직 귀속을 판정하고, 일치한 경보를 암호화해 해당 기업 대시보드에 전달하며 지정된 지리
      범위 안에 데이터를 유지한다고 GitHub는 설명했다.
    explanations:
      - heading: 토큰 상태와 경보의 한계
        paragraphs:
          - GitHub는 지원되는 provider의 토큰 유효성을 계속 자동 확인하고 경보에 Active, Inactive,
            Unknown 상태를 표시한다고 밝혔다. 이 구분은 보안팀이 활성 토큰을 우선 대응하도록 돕는 기능이다.
          - 경보를 닫으면 엔터프라이즈의 경보 상태만 바뀐다. 노출된 자격 증명이 폐기되거나 공개 저장소에서 삭제되는 것은 아니라고
            GitHub는 명시했다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-public-monitoring-adds-triage-validity-api-and-webhooks
      - heading: 대시보드 감사와 필터
        paragraphs:
          - 경보 활동 타임라인은 경보에 취해진 모든 조치와 상태 변경의 감사 기록을 제공한다. 목록은 저장소, 커미터, 비밀정보
            유형, 귀속 방식(멤버십 또는 검증된 도메인), 열린 상태·닫힌 상태로 필터링하고 정렬할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-public-monitoring-adds-triage-validity-api-and-webhooks
      - heading: 대응 파이프라인 연결
        paragraphs:
          - 엔터프라이즈 관리자와 엔터프라이즈 보안 관리자는 GET
            /enterprises/{enterprise}/secret-scanning/public-monitoring-alerts
            REST API로 귀속된 발견사항을 조회할 수 있다. 반환 항목에는 경보 메타데이터, 비밀정보 유형, 귀속 정보와 노출
            위치가 포함된다.
          - 조직은 enterprise 수준에서 secret_scanning_public_monitoring_alert webhook을
            구독해 새로 탐지된 유출이 조직에 귀속될 때 실시간 알림을 받을 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-public-monitoring-adds-triage-validity-api-and-webhooks
      - heading: 공개 프리뷰와 라이선스
        paragraphs:
          - Public monitoring은 GitHub Enterprise Cloud 고객을 대상으로 공개 프리뷰 상태이며, 데이터
            레지던시 고객도 포함된다. Enterprise admin 또는 enterprise security manager가 보안
            대시보드에서 기능을 켜고 경보 설정을 관리할 수 있으며, 사용에는 활성 GitHub Advanced Security 또는
            GitHub Secret Protection 라이선스가 필요하다. 기능은 해당 라이선스에 추가 비용 없이 포함된다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-public-monitoring-adds-triage-validity-api-and-webhooks
          - https://github.blog/changelog/2026-10-22-public-monitoring-now-available-with-data-residency
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, SCIM 계정 오삭제 원인 공개…영향 사용자 기록 복원과 재발 방지 조치
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub.
      when: 공지 게시일은 2026년 10월 24일(한국시간); 오삭제 기간은 2026년 6월 1~13일, 잘못된 경로 비활성화일은 2026년
        6월 13일, 영향 사용자 기록 복원은 2026년 10월.
      where: 미기재
      what: SCIM 프로비저닝 해제 과정에서 Enterprise Managed User 계정 일부가 잘못 삭제된 문제와 GitHub의 경로
        비활성화·재발 방지 코드 변경·사용자 기록 복원 보고.
      how: 6월 1일 새 경로가 계정이 Enterprise Managed User인지 확인하지 않은 것이 원인이었고, GitHub은 6월 13일
        그 경로를 비활성화한 뒤 재발 방지 코드를 변경하고 영향받은 기록을 복원했다.
      why: 미기재
    lead: GitHub은 2026년 10월 24일(한국시간) 공개한 공지에서 2026년 6월 1일부터 13일까지 SCIM으로 프로비저닝 해제된
      일부 Enterprise Managed User 계정이 예상된 정지·난독화 대신 잘못 삭제됐다고 밝혔다. GitHub은 여러 기업에서
      약 12,285개 계정이 영향을 받았으며, 해당 사용자가 기업 안에서 정지·난독화된 기록으로 남는 대신 이슈·풀 리퀘스트·감사 로그에
      유령 사용자로 나타났다고 설명했다. 기업은 6월 1일부터 13일까지 감사 로그에 Enterprise Managed User의
      user.delete 이벤트가 있는지로 영향을 확인할 수 있으며, 해당 이벤트가 없으면 영향받지 않았고 이벤트가 있는 기업에는 별도
      조치가 필요 없다고 GitHub은 안내하면서 계정 복원을 진행 중이라고 밝혔다. GitHub은 6월 1일 도입한 새 프로비저닝 해제
      경로가 계정의 Enterprise Managed User 여부를 확인하지 않아 삭제를 일으켰으며, 6월 13일 해당 경로를 비활성화해
      문제를 차단했다고 밝혔다.
    explanations:
      - heading: 계정 삭제 경로와 영향 규모
        paragraphs:
          - GitHub은 영향 계정 대부분이 이미 정지되고 강제 프로비저닝 해제된 상태여서 설계상 다시 프로비저닝할 수 없었다고
            설명했다. 삭제 당시 활성 상태였던 계정은 더 작은 집단인 76개였다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-emu-deletions-fix
      - heading: 복원 및 재발 방지
        paragraphs:
          - GitHub은 재발 방지 코드 변경을 완료했다고 밝혔고, 2026년 10월에 영향 사용자 기록을 복원했다고 보고했다.
            복원된 계정은 예상된 정지·난독화 상태로 돌아갔으며 기업 내부의 추적 가능성과 감사 이력이 보존됐다고 설명했다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-emu-deletions-fix
      - heading: 재프로비저닝 절차
        paragraphs:
          - 강제 프로비저닝 해제된 Enterprise Managed User 계정은 설계상 다시 프로비저닝할 수 없으므로,
            GitHub은 이번 문제가 재프로비저닝 워크플로에 영향을 주지 않는다고 밝혔다.
        source_urls:
          - https://github.blog/changelog/2026-10-23-emu-deletions-fix
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, 벵갈루루 인근 Direct Connect 위치에 100 Gbps 연결 확대
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026년 10월 22일
      where: 인도 벵갈루루 인근 Netmagic DC2 데이터센터의 기존 AWS Direct Connect 위치
      what: 100 Gbps 전용 연결 확장 발표 및 해당 위치에서 AWS 리전·Local Zones로의 비공개 직접 네트워크 접속 제공
      how: AWS Direct Connect의 비공개 물리 네트워크 연결
      why: 미기재
    lead: AWS는 2026년 10월 22일 인도 벵갈루루 인근 Netmagic DC2 데이터센터의 기존 AWS Direct Connect
      위치에서 100 Gbps 전용 연결을 확장했다고 발표했다. 이 위치에서는 중국 내 리전을 제외한 모든 AWS 퍼블릭 리전과 AWS
      GovCloud 리전, AWS Local Zones에 비공개 직접 네트워크 접속을 설정할 수 있다.
    explanations:
      - heading: Direct Connect의 연결 방식
        paragraphs:
          - AWS Direct Connect는 AWS와 고객의 데이터센터·사무실·코로케이션 환경 사이에 비공개 물리 네트워크 연결을
            설정하는 서비스다.
          - AWS는 이러한 비공개 연결이 공용 인터넷을 이용한 연결보다 더 일관적인 네트워크 경험을 제공할 수 있다고 설명했다.
        source_urls:
          - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-direct-connect-100g-bangalore/
    papers: []
    relations: []
    topic_ids: []
  - title: PHP2Shell 두 취약점, 인증 없는 원격 코드 실행 가능…CVSS v4.0 9.2
    kind: 사건 뉴스
    region: 해외
    facts:
      who: PHP Security Team의 공식 공지; AhnLab ASEC가 취약점 및 GitHub 저장소 설명을 다룬 보안 글을 게시했다.
      when: CVE-2026-109618·CVE-2026-109619 공개일은 2026년 10월 21일이며, AhnLab ASEC 글 게시일은
        2026년 10월 22일.
      where: 미기재
      what: PHP 내부 요청 처리 과정의 두 취약점이 인증 없는 원격 코드 실행을 허용할 수 있고 CVSS v4.0 점수는 각각 9.2이며
        위험도가 mod_php 환경에서 가장 높다는 보안 정보.
      how: 공식 공지는 각 취약점의 메모리 부족 정리 및 메모리 해제 뒤 오래된 요청 상태 사용이라는 원인을 설명한다. 별도 GitHub
        저장소들은 session.upload_progress를 공격 경로라고 주장하지만 PHP 공식 공지에서 확인되지 않았다.
      why: 미기재
    lead: AhnLab ASEC가 2026년 10월 22일 공개한 보안 글은 하루 전 공개된 CVE-2026-109618과
      CVE-2026-109619가 PHP 내부 요청 처리 과정에서 발생하며, 인증되지 않은 원격 코드 실행을 허용할 수 있다고 설명했다.
      PHP 공식 공지에 따르면 CVE-2026-109618은 메모리 부족 처리 중 일부만 초기화된 요청 데이터를 정리할 때,
      CVE-2026-109619는 메모리 해제 뒤에도 남은 요청 소유 내부 상태를 같은 워커의 후속 요청이 사용할 때 발생할 수 있다.
      공식 공지는 두 취약점 모두 인증 없는 원격 코드 실행을 허용할 수 있으며 각각 CVSS v4.0 점수는 9.2이고, 위험도는
      mod_php 환경에서 가장 높다고 밝혔다. 일부 GitHub 저장소는 session.upload_progress를 공격 경로로
      설명하고 PHP 5.4부터 기본 활성화됐다고 적었지만, AhnLab ASEC는 이 내용이 저장소 설명에 근거하며 PHP 공식
      공지에서는 확인되지 않았다고 구분했다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: KAIST 라이보2, 배터리 교체 없이 42.195km 로봇 마라톤 완주
    kind: 사건 뉴스
    region: 국내
    facts:
      who: KAIST 기계공학과 황보제민 교수 연구팀이 개발한 사족보행로봇 라이보2(RAIBO2)
      when: 원문 게시일 2026-09-28; 오늘 소개일 2026-10-27
      where: 미기재
      what: 라이보2의 배터리 교체 없는 42.195km 마라톤 완주와 장거리 주행 기술·완주 결과의 Nature 본지 게재; 장거리 운용 설계
        원리 발전 및 제품화 계획
      how: 배터리 교체 없이 사족보행로봇으로 마라톤 거리 완주
      why: 장거리 운용을 위한 설계 원리를 마련하고 실제 산업 현장에서 쓸 수 있는 로봇으로 제품화하기 위해
    lead: 사족보행로봇 라이보2(RAIBO2)가 배터리 교체 없이 42.195km를 완주해 세계 최초 기록을 세웠다. 2026년 9월 28일
      등록된 원문은 기계공학과 황보제민 교수 연구팀이 개발한 라이보2의 장거리 주행 기술과 실제 완주 결과가 Nature 본지에 게재됐다고
      전하며, 본문은 이를 “24일 밝혔다”고 기록했다. 연구진은 이 기록을 장거리 운용을 위한 설계 원리로 발전시켰으며, 실제 산업
      현장에서 사용할 로봇을 제품화할 계획이다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: KAIST·파네시아·Meta, ‘하나의 칩처럼 움직이는’ AI 데이터센터 구조 제시
    kind: 사건 뉴스
    region: 국내
    facts:
      who: KAIST 전기및전자공학부 정명수 교수 연구진, 교원창업기업 파네시아 연구진, Meta 연구진
      when: 원문 게시일 2026-09-09; 오늘 소개일 2026-10-27
      where: 미기재
      what: 차세대 AI 데이터센터 구조를 제시한 리뷰 논문이 Nature Reviews Electrical Engineering에 게재됨
      how: CPU·AI 가속기·메모리를 한 구조로 묶어 데이터센터 전체가 하나의 거대한 칩처럼 움직이게 설계
      why: 미기재
    lead: KAIST는 2026년 9월 9일 전기및전자공학부 정명수 교수 연구진과 교원창업기업 파네시아, Meta 연구진이 함께 제시한 차세대
      AI 데이터센터 구조 리뷰 논문이 Nature Reviews Electrical Engineering에 게재됐다고 밝혔다. 논문은
      CPU·AI 가속기·메모리를 하나로 묶어 데이터센터 전체가 마치 하나의 거대한 칩처럼 움직이도록 하는 구조를 제시한다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: CodeQL, macOS 27·Xcode 27에서 빌드 추적 지원 제한
    kind: 사건 뉴스
    region: 해외
    facts:
      who: CodeQL
      when: 한국시간 2026년 10월 19일
      where: 미기재
      what: macOS 27·Xcode 27에서 traced scan 지원 제한 및 Swift 6.4 미지원 안내
      how: 일부 시스템 바이너리와 라이브러리에서 Intel(x86_64) 코드가 제외된 영향
      why: 미기재
    lead: 한국시간 2026년 10월 19일 공개된 CodeQL 안내에 따르면 macOS 27과 Xcode 27부터 일부 시스템 바이너리와
      라이브러리에서 빌드 추적에 필요한 Intel(x86_64) 코드가 빠져, CodeQL은 이 운영체제와 개발환경의 traced
      scan을 지원하지 않고 Swift 6.4도 분석하지 못한다. Xcode 27이 설치되면 C/C++, C#, Go, Java,
      Kotlin, Swift의 traced extraction을 사용할 수 없고, macOS 27에서는 같은 언어들의
      extraction이 불가능할 수 있다. CodeQL은 Swift 6.4를 모든 플랫폼에서 지원하지 않으며, Intel 기반 Mac
      지원은 2026년 12월 중순부터 deprecated 상태로 전환될 예정이다.
    explanations:
      - heading: 워크플로 고정과 대안
        paragraphs:
          - Swift 스캔이나 다른 언어의 traced build를 사용하는 경우 macOS 26 이하와 Xcode 26 이하에
            워크플로를 고정하라는 안내다. GitHub Actions에서는 최신 버전에 의존하지 말고 runner image와
            toolchain을 워크플로에 고정하도록 했다.
          - C/C++, C#, Java는 build mode none으로 전환할 수 있으며, 이 모드는 빌드 추적을 요구하지 않는다.
        source_urls:
          - https://github.blog/changelog/2026-10-19-codeql-changes-for-macos-27-xcode-27-and-swift-6-4
    papers: []
    relations: []
    topic_ids: []
  - title: SanaHeal, 외상 출혈 막는 생체접착 기술 승인…내년 수술 임상 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: SanaHeal
      when: 기술 소개는 2026년 10월 20일이며 수술 적용 용도의 사람 대상 임상시험은 2027년 계획이다.
      where: MIT에서 처음 개발됐다.
      what: 젖고 고르지 않은 생체 조직에 붙고 공기·액체 누출을 막아 수술을 단순화하는 생체접착 기술이다.
      how: SanaHeal은 의료기기 파트너들과 수술 적용 제품을 개발하고 있다.
      why: 수술 절차를 단순화하기 위해 개발됐다.
    lead: MIT 뉴스는 2026년 10월 20일 SanaHeal이 젖고 고르지 않은 생체 조직에 빠르게 붙어 공기와 액체가 새지 않도록
      밀봉하는 생체접착 기술을 개발했다고 보도했다. 이 기술은 MIT에서 처음 개발됐다. MIT 뉴스에 따르면 SanaHeal 기술은 외상
      출혈을 막는 용도로 이미 규제 승인을 받았으며, 회사는 수술 중 출혈 조절과 여러 손상 조직 수복을 위해 2027년 사람 대상
      임상시험에 들어갈 계획이다. SanaHeal은 더 큰 의료기기 기업들과 임상시험·상용화를 위해 협력 중이며, 파트너들은
      개복·복강경·내시경 수술과 탈장·신경 복구용 무봉합 이식 제품을 개발하고 있다.
    explanations:
      - heading: 조직 접착과 기존 방식
        paragraphs:
          - MIT 기사는 조직을 봉합하거나 붙일 때 쓰는 스테이플과 봉합사가 추가 조직 손상, 면역 반응, 흉터 조직 또는 감염으로
            이어질 수 있다고 설명했다. SanaHeal 창립자 겸 CTO Hyunwoo Yuk은 기존 봉합은 조직을 관통해 꿰매므로
            수술 중 고통스럽고 완벽히 수행하기 어렵지만, 자사 솔루션은 덜 침습적이며 수술 로봇에서 더 쉽게 쓸 수 있다고 말했다.
          - Yuk은 하이드로겔이 고분자와 물로 만들어졌고 면역 반응과 흉터 조직 축적을 최소화하는 생체적합성을 가진다고 설명했다.
            초기 기술은 폴리아크릴산으로 젖은 조직의 물을 흡수해 수초 안에 붙이는 양면테이프처럼 작동했다.
        source_urls:
          - https://news.mit.edu/2026/sanaheal-makes-surgical-stitching-more-like-applying-sticky-note-1020
      - heading: 적용 분야와 사업 방식
        paragraphs:
          - Yuk과 협력자들은 처음에는 상처 출혈을 막는 데 기술을 적용하는 데 집중했다가, 수술 응용 분야가 더 많다고 보고 연구
            방향을 수술로 옮겼다.
          - Yuk은 SanaHeal이 처음부터 플랫폼 기업을 지향했으며, 한 번에 10개 제품을 개발할 자원이 부족해 더 큰 기업과
            상용화 솔루션을 함께 만든다고 설명했다.
        source_urls:
          - https://news.mit.edu/2026/sanaheal-makes-surgical-stitching-more-like-applying-sticky-note-1020
      - heading: 개발 기간
        paragraphs:
          - Yuk은 이 기술을 거의 10년간 연구했고 상용화 과정이 예상보다 오래 걸렸다고 말했다. 환자에게 연구실에서 개발한 기술이
            영향을 주는 모습을 보는 것이 그 여정을 가치 있게 할 것이라는 발언은 그의 기대를 전한 것이다.
        source_urls:
          - https://news.mit.edu/2026/sanaheal-makes-surgical-stitching-more-like-applying-sticky-note-1020
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시
    event_id: 1c9138dc3652d49c
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: FDA, Roche Enspryng을 성인 갑상선안병증 치료제로 승인
    event_id: 63ab3559f77235d3
    review_status: verified
    published_at: 2026-10-16
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: Roche, fenebrutinib·Ocrevus·Enspryng 다발성경화증 연구 결과 발표
    event_id: 4ef26a1b298a6662
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: GitHub, 저장소 push 이메일 알림 종료…자체 메일 발송 방식 안내
    event_id: 1d942767a24e2ea1
    review_status: verified
    published_at: 2026-10-15
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: Roche, ESMO 2026에서 폐암·유방암 임상 데이터 발표 계획
    event_id: 7d28c329b2eda07a
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: Anthropic, IPO용 S-1 SEC에 공개 제출…주식 수·가격 범위 미정
    event_id: fc40e3e8c60e59ad
    review_status: verified
    published_at: 2026-10-26
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: 삼성SDI, AOP와 ESS 솔루션 1GWh 공급 계약 체결
    event_id: 56ea3dab09143eaf
    review_status: verified
    published_at: 2026-10-26
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: 단일 참여자 EMG 연구, Baxter 로봇 팔로 사람 팔 동작 재현
    event_id: 861b92e2e1b0937e
    review_status: verified
    published_at: 2026-10-26
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: 삼성전기·엔비디아, FC-BGA 공급 파트너십…전용 생산시설 공동 투자
    event_id: 7d326b12c65a9b1c
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: FDA, 신경과학 의료제품 개발 지원 프로그램 NAIN 출범
    event_id: 441dfaee73727b5b
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: NVIDIA, Isaac 로봇 플랫폼에 런타임·학습 프레임워크·데이터 추가
    event_id: 5c3a57a7151e0d08
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: Agile Robots, NVIDIA 기술을 탑재한 휴머노이드 레퍼런스 Agile ONE SN 공개
    event_id: 2cf5a6f596cc6134
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: NVIDIA DSX, AI 팩토리 전력·냉각 설계와 파트너 생태계 확대
    event_id: 848f9f2cb5562643
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: NVIDIA, 공급망 파트너와 기판·패키징·테스트 생산능력 확대 계획
    event_id: 266f5cac1a0d84c3
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: NVIDIA·Amkor, 한국 인터포저 웨이퍼 생산능력 2028년 말까지 300% 초과 확대 목표
    event_id: 1088bc333dad415a
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: NVIDIA, 반도체 테스트 용량 2027년까지 두 배 전망…KYEC 미국 시설 지원
    event_id: 5efbe553b645ac1d
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: Bolt, 유럽 로보택시 프로그램에 NVIDIA Alpamayo Stack 선택
    event_id: 42a359f45034b39b
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: NVIDIA, 자율주행 안전 근거 생성하는 Halos SAFE 평가 프레임워크 공개
    event_id: 287c89ed4faace42
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: ASEC, PHP2Shell 재현 공개…AhnLab EDR 탐지 사례 소개
    event_id: 0807c5fe6fc54e81
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: KAIST, 전하 감지·자외선 집기를 한 소재에 묶은 '이오노그래스퍼' 발표
    event_id: 8bbce2ffd63bf26a
    review_status: verified
    published_at: 2026-09-30
    reviewed_at: 2026-10-04
    concept_ids: []
  - title: ASEC, 불법 프로그램 위장 Rust 인포스틸러의 정보 탈취·추가 악성코드 기능 분석
    event_id: b6f4ac0ac649198c
    review_status: verified
    published_at: 2026-10-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: KAIST 연구팀, 스마트폰 AI에 서버 지식을 재사용하는 CURE 개발
    event_id: d87d7041a1aa0451
    review_status: verified
    published_at: 2026-09-21
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: GitHub Copilot 사용량 API, OpenCode 등 도구별 요청·토큰 집계 추가
    event_id: 4e3efbae3e238940
    review_status: verified
    published_at: 2026-10-24
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
    date_kind: source-publication-time
    source_published_at: 2026-10-23T16:42:03-07:00
  - title: AWS Lambda MicroVMs, 4개 리전 추가해 총 14개 리전으로 확대
    event_id: 34740706294da23a
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: GitHub Public monitoring에 경보 관리·데이터 레지던시 지원 추가
    event_id: 302c6b3f3f4c2777
    review_status: verified
    published_at: 2026-10-24
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
    date_kind: source-publication-time
    source_published_at: 2026-10-23T10:17:58-07:00
  - title: GitHub, SCIM 계정 오삭제 원인 공개…영향 사용자 기록 복원과 재발 방지 조치
    event_id: fecd4fc81fa8ed2e
    review_status: verified
    published_at: 2026-10-24
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
    date_kind: source-publication-time
    source_published_at: 2026-10-23T11:56:18-07:00
  - title: AWS, 벵갈루루 인근 Direct Connect 위치에 100 Gbps 연결 확대
    event_id: dc823a84aead0efd
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: PHP2Shell 두 취약점, 인증 없는 원격 코드 실행 가능…CVSS v4.0 9.2
    event_id: f16c8c9cc139d6a3
    review_status: verified
    published_at: 2026-10-22
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: KAIST 라이보2, 배터리 교체 없이 42.195km 로봇 마라톤 완주
    event_id: 55819207c0fce582
    review_status: verified
    published_at: 2026-09-28
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: KAIST·파네시아·Meta, ‘하나의 칩처럼 움직이는’ AI 데이터센터 구조 제시
    event_id: 84192fca279a2150
    review_status: verified
    published_at: 2026-09-09
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
  - title: CodeQL, macOS 27·Xcode 27에서 빌드 추적 지원 제한
    event_id: 14ecf6392faef7f6
    review_status: verified
    published_at: 2026-10-19
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
    date_kind: source-publication-time
    source_published_at: 2026-10-19T03:29:09-07:00
  - title: SanaHeal, 외상 출혈 막는 생체접착 기술 승인…내년 수술 임상 계획
    event_id: 62010757d4094148
    review_status: verified
    published_at: 2026-10-20
    reviewed_at: 2026-10-27
    concept_ids: []
    semantic_review_status: reviewed_none
---

# 이번 호 표지

GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시

# 차례

- GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시
- FDA, Roche Enspryng을 성인 갑상선안병증 치료제로 승인
- Roche, fenebrutinib·Ocrevus·Enspryng 다발성경화증 연구 결과 발표
- GitHub, 저장소 push 이메일 알림 종료…자체 메일 발송 방식 안내
- Roche, ESMO 2026에서 폐암·유방암 임상 데이터 발표 계획

# 커버 스토리

없음

# 뉴스 데스크

## GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub은 한국시간 2026년 10월 23일 공개한 변경으로 GitHub Copilot 사용 지표에 조직이 만든 skills, custom agents, MCP servers, slash commands, plugins의 설정 이름을 other나 custom 대신 표시한다. 이름은 기업·조직의 사용자별 1일·28일 및 집계 1일 보고서와 집계 28일 보고서의 day\_totals 등에 반영되며, 각 totals\_by\_* 배열은 레코드당 최대 25개 항목으로 늘어 종전 5개를 넘는 나머지 활동은 끝의 other 항목에 합쳐진다. API 보고서는 enterprise owners와 billing managers, organization owners, 또는 View Copilot Metrics 권한을 부여하는 custom organization·enterprise role을 가진 사용자가 이용할 수 있으며 Copilot 사용 지표 정책이 켜져 있어야 한다. [S1]

### 보고서에 반영되는 범위

이름별 집계 배열은 totals\_by\_skill, totals\_by\_custom\_agent, totals\_by\_mcp, totals\_by\_slash\_cmd, totals\_by\_plugin이다. interaction\_count와 distinct\_*\_use\_count 필드는 이전과 같은 방식으로 계산된다. [S1]

### 이름 수집 조건

이름은 Copilot CLI 대화형 세션과 prompt mode, GitHub Copilot 앱, JetBrains 같은 ACP 연동, Copilot SDK에서 보고된다. prompt mode·앱·ACP에는 Copilot CLI 1.0.97 이상이, SDK에는 v1.0.21 이상이 필요하다. IDE는 agent 경험이 Copilot SDK v1.0.21 이상에서 실행될 때 이름을 보고하며 IDE 내장 채팅 telemetry에서는 이름을 보고하지 않는다. [S1]

### 표시와 해석의 한계

이름은 설정된 표기를 바탕으로 최대 128자로 자르며, 파일 경로처럼 보이는 이름은 other나 custom으로 계속 묶인다. 조직 밖에 보고서를 공유하기 전에 이름을 검토해야 한다.

이름은 이 릴리스 이후 처리된 보고일에만 나타나며 이전 날짜에는 other나 custom이 남는다. 클라이언트가 오래됐거나 telemetry가 차단되면 활동이 과소 집계될 수 있어 정확한 회계가 아니라 추세와 도입 현황을 보는 데 사용하도록 안내됐다. [S1]

## FDA, Roche Enspryng을 성인 갑상선안병증 치료제로 승인

**분야:** 바이오·의료기술
**테마:** 정책·규제
**보조 테마:** 없음
**세부 태그:** 인허가
**기업·기관:** Roche, FDA, Chugai

2026년 10월 16일 Roche는 미국 FDA가 성인 갑상선안병증(TED) 치료제로 Enspryng(satralizumab)을 승인했다고 발표했다. Roche는 Enspryng이 TED의 첫이자 유일한 재택 피하주사 치료 선택지이며, 의료진 교육 후 환자나 보호자가 유지 단계에서 4주마다 투여할 수 있다고 설명했다. Roche는 임상 3상 SatraGO-1이 24주 사전 지정 1차 유효성 평가변수를 충족하지 못한 반면 SatraGO-2에서는 활동성 TED 환자의 안구 돌출과 복시 지표가 개선됐다고 보고했다. [S2]

### SatraGO 임상 설계와 결과

SatraGO-1과 SatraGO-2는 성인 활동성 중등도\~중증 TED와 만성 TED를 대상으로 효능·지속성·내약성을 평가하도록 동일하게 설계된 무작위배정, 위약 대조, 다기관 3상 시험이다. 두 시험은 19개국에서 총 258명을 등록해 Enspryng 또는 위약에 1:1로 배정했다.

두 시험의 1차 평가변수는 활동성 중등도\~중증 TED 환자에서 24주 시점에 기준선보다 시험 눈의 안구 돌출이 최소 2mm 줄어든 비율이었다. Roche는 SatraGO-2 활동성 환자에서 안구 돌출 반응이 Enspryng군 52.9%, 위약군 23.4%였고 복시 감소는 각각 60.7%, 25.8%였다고 보고했다.

Roche는 SatraGO-2에서 활동성·만성 환자를 합친 전체 집단에서도 일관된 결과를 얻었다고 보고했으며, TED의 활동성이나 기간에 관계없이 양호한 안전성 프로필을 보였다고 설명했다. SatraGO 시험에서 새로운 안전성 신호는 확인되지 않았고 안전성 프로필은 기존 시신경척수염범주질환(NMOSD) 자료와 일치했다. [S2]

### 갑상선안병증의 범위와 치료 필요

Roche 자료에 따르면 TED는 미국에서 10만 명당 약 155명에게 영향을 주는 희귀 진행성 자가면역질환으로, 치료하지 않으면 안면 변형과 시력을 위협하는 합병증으로 이어질 수 있다. 갑상선기능항진증 환자의 약 50%는 적어도 경증 TED를 겪지만, 갑상선기능저하증이나 정상 갑상선 기능을 가진 사람에게도 나타날 수 있다고 회사는 설명했다.

Roche는 이미 승인된 TED 치료제가 있어도 효과적이고 내약성이 좋으며 투여가 편리한 치료에 대한 의학적 필요가 남아 있다고 밝혔다. [S2]

### Enspryng의 작용과 기존 적응증

Roche 그룹 Chugai가 개발한 Enspryng은 용해성 및 막 결합 IL-6 수용체에 결합해 IL-6 신호를 억제하도록 설계된 인간화 단클론항체다. 회사는 Chugai의 항체 재활용 기술이 pH 의존적으로 표적에 반복 결합해 항체 순환을 연장하고 IL-6 신호 억제를 지속하도록 하며, IL-6R 억제로 자가항체 유발 병리의 상류 신호를 막는다고 설명했다.

Roche는 TED 승인이 Enspryng의 두 번째 적응증이며 첫 승인은 2020년 NMOSD였다고 밝혔다. 회사에 따르면 Enspryng은 유럽연합과 미국을 포함해 약 90개국에서 NMOSD 치료제로 승인된 최초이자 유일한 IL-6R 억제제이며, 1만6천 명 초과 환자에서 확립된 안전성 프로필을 갖고 있다. [S2]

## Roche, fenebrutinib·Ocrevus·Enspryng 다발성경화증 연구 결과 발표

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** Roche, European Commission, FDA

2026년 10월 21일 Roche는 다발성경화증(MS) 후보약 fenebrutinib의 3상 자료와 Ocrevus·Enspryng 연구 결과를 발표하고, 보도자료 발표 당시 해당 자료를 Toronto의 MSToronto2026(10월 21\~23일 예정)의 40건 초과 초록에서 소개할 계획이라고 밝혔다. Roche는 FENtrepid와 FENhance 1·2 결과가 만성 활성 병변에 치료 효과를 보였다고 보고했으며, 이 자료가 RMS와 PPMS 모두를 위한 고효능 경구약이 될 fenebrutinib의 가능성을 뒷받침한다고 밝혔다. Roche는 Ocrevus의 소아 MS 3상 결과와 Enspryng의 MOGAD 탐색 분석도 주요 자료로 꼽았고, Enspryng METEOROID 결과는 MSToronto2026의 “Best of” 발표에 포함된다고 밝혔다. [S3]

### Fenebrutinib의 MS 임상 결과

Roche는 만성 활성 병변에 대한 치료 효과를 MS 3상에서 전향적으로 보인 첫 사례라고 설명했다. 회사 자료에서 slowly expanding lesion(SEL) 부피는 active comparators 대비 최대 30% 감소했으며, 관찰 기간은 RMS 96주와 PPMS 120주였고 p값 0.001 미만이었다. RMS에서 paramagnetic rim lesion(PRL) 누적도 active comparators 대비 62% 감소했다고 보고했다(p=0.001).

FENhance 1·2 통합 3상 자료에서 Roche는 fenebrutinib의 연간 재발률(ARR)이 active comparator 대비 55% 낮았다고 밝혔다. 통합 RMS 분석은 96주 동안 진행됐으며 p값 0.001 미만이었다.

통합 RMS 시험에서 fenebrutinib 투여 환자의 75%는 거의 2년 시점에 NEDA-3를 보였다. Roche가 정의한 NEDA-3는 재발 0건, MRI 활성 0건, 장애 악화 0건이며, 회사는 비교군 대비 70% 감소(p값 0.001 미만)라고 보고했다. 별도 통합 RMS 수치로 연간 총 뇌 부피 손실은 23% 감소(p값 0.001 미만), 12주 복합 확정 장애 진행은 16% 감소(p=0.04)했다고 밝혔다. [S3]

### Ocrevus 소아·고령 환자 자료

European Commission은 10월 15일 소아 적응증을 승인했다. OPERETTA 2 3상에서 치료 시작 당시 10\~17세였던 RRMS 소아 중 Ocrevus 투여군의 90%가 2년 동안 재발이 없었다고 Roche는 보고했다.

Roche는 Ocrevus가 표적 B세포를 선택적으로 줄이면서 다른 면역세포에는 거의 또는 전혀 영향을 미치지 않았고, 환자의 81\~100%에서 일반적인 소아 백신에 대한 기존 면역을 보존했다고 밝혔다.

Phase IIIb CONSONANCE에서 55세 초과 Ocrevus 투여자 중 53%가 2년 뒤 장애 진행이 없었다. Roche는 젊은 참가자의 55%와 비슷한 결과라고 보고했다. [S3]

### Enspryng와 MOGAD

Roche는 METEOROID 탐색 분석에서 Enspryng이 MOGAD 환자의 회복 개선 및 장애 진행 감소와 연관됐다고 밝혔다. 재발 위험 감소는 AAN 2026에서 이미 발표된 결과라고 설명했으며, 이번 결과가 Enspryng이 MOGAD의 첫 FDA 승인 치료제가 될 가능성을 뒷받침한다고 했다. 미국의 결정은 2027년 1월로 예상된다고 밝혔다. 이는 승인 완료가 아니라 회사가 밝힌 향후 전망이다.

Roche가 보고한 EDSS 자료에서 재발 12주 뒤 회복 변화 중앙값은 Enspryng군 -2, 위약군 -0.5로 수치상 Enspryng군이 더 컸다. 이중맹검 기간 종료 시점 또는 첫 재발 시점의 전반적 기능은 Enspryng군에서 중앙값 0으로 안정적이었고 위약군은 중앙값 0.5로 악화됐다. [S3]

## GitHub, 저장소 push 이메일 알림 종료…자체 메일 발송 방식 안내

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 서비스 종료
**기업·기관:** GitHub

GitHub는 한국시간 2026년 10월 15일 게시한 안내에서 repository push events 이메일 알림이 10월 15일 현재 폐기돼 더 이상 발송되지 않는다고 밝혔다. 회사는 수신자 동의 없이 이메일이 발송될 수 있어 스팸·남용을 막기 위해 기능을 종료했으며, 자사 이메일 인프라를 통한 원치 않는 메시지 전송에 악용될 가능성이 있었다고 설명했다. 계속 알림을 보내려는 사용자는 push 이벤트로 실행되는 GitHub Actions workflow에서 자체 SMTP 서버나 이메일 제공자를 이용할 수 있다고 GitHub는 안내했다. [S4]



## Roche, ESMO 2026에서 폐암·유방암 임상 데이터 발표 계획

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** Roche

2026년 10월 19일 Roche는 스페인 마드리드에서 10월 23\~27일 열리는 유럽종양학회(ESMO) 연례회의에서 폐암·유방암 등 여러 암종의 새 자료를 발표하고 후기 초록 2건을 포함할 계획이라고 밝혔다. 회사는 이전 치료를 받은 KRAS G12C 변이 비소세포폐암(NSCLC) 환자를 대상으로 한 3상 Krascendo 1에서 divarasib가 1세대 억제제보다 우월한 결과를 보였다고 보고하고, 해당 결과를 학회 심포지엄에서 발표할 예정이다. Roche는 초기·진행성 유방암의 giredestrant 자료와 여러 고형암을 대상으로 개발 중인 시험용 항체약물접합체 Tam-Peli의 임상 자료도 발표할 계획이라고 밝혔다. [S5]

### Divarasib와 KRAS G12C 폐암 자료

Roche는 Krascendo 1 3상에서 이전 치료를 받은 진행성 KRAS G12C 변이 폐암 환자의 divarasib 결과가 표준 치료인 1세대 KRAS G12C 억제제보다 우월했고 동종 계열 내 최고 수준의 효능 잠재력을 보였다고 밝혔다. 회사는 Krascendo 1을 차세대 KRAS G12C 억제제와 승인된 1세대 억제제를 비교하는 유일한 글로벌 직접 비교 시험이라고 설명했다.

Roche는 Krascendo 1 결과를 후기 초록으로 대통령 심포지엄에서 발표할 계획이었다. 프로그램에는 이전 치료를 받은 국소 진행성 또는 전이성 KRAS G12C 변이 NSCLC에서 divarasib와 sotorasib 또는 adagrasib의 효능·안전성을 비교하는 \#LBA5 세션이 10월 25일 16:30\~16:42 CET로, 절제된 II\~IIIB기 KRAS G12C 양성 NSCLC에서 divarasib와 면역치료 또는 관찰을 비교하는 진행 중 3상 Krascendo 3의 \#2551 포스터가 10월 26일 12:00\~12:45 CET로 편성됐다. [S5]

### Giredestrant 유방암 프로그램

Roche는 giredestrant를 경구용 차세대 선택적 에스트로겐 수용체 분해제(SERD)이자 완전 길항제인 시험용 약물로 소개하고, ER 양성·HER2 음성 유방암의 초기 및 진행 단계에서 새로운 표준 치료가 될 가능성을 뒷받침하는 자료를 발표할 계획이라고 밝혔다. 회사에 따르면 이 아형 사례의 90% 초과가 진단 시 I\~III기 초기 단계다.

Roche는 3상 lidERA의 초기 유방암 환자 보고 결과에서 giredestrant가 표준 내분비요법보다 효능을 높이면서 내약성이나 건강 관련 삶의 질을 저해하지 않았다고 밝혔다. 학회 일정에는 해당 자료가 10월 23일 16:20\~16:25 CEST \#538 구두 발표로, CDK4/6 억제제 치료 후 ER 양성·HER2 음성 진행성 유방암의 giredestrant와 everolimus 병용 3상 evERA 탐색 바이오마커 분석이 10월 24일 10:20\~10:25 CEST \#2 구두 발표로 올라 있었다. giredestrant와 inavolisib 병용의 업데이트된 중간 결과는 국소 진행성 또는 전이성 ER 양성·HER2 음성 유방암을 다루는 MORPHEUS 연구 자료로 발표할 계획이었다. [S5]

### Tam-Peli의 고형암 임상 계획

Roche는 Tam-Peli(tambotatug pelitecan)를 강한 항종양 활성을 내면서 표적 외 독성을 제한하도록 설계한 차세대 B7-H3 표적 항체약물접합체(ADC)로 설명하고 여러 고형암에서 연구 중이라고 밝혔다. 회사는 중국 환자의 전이성 비인두암 3상 결과가 유망한 효능과 양호한 안전성 프로필의 잠재력을 보여줬다고 평가했다.

Roche는 Tam-Peli를 중국 본토·홍콩·마카오 밖에서 개발·상업화하고 있으며 여러 종양 유형의 글로벌 임상시험을 신속히 시작할 계획이라고 밝혔다. ESMO 발표 목록에는 중증 치료 전력이 있는 재발성·전이성 비인두암 3상 중간 결과, 진행성 고형암 1·2상 참가자의 간질성 폐질환 분석, 국소 진행성 또는 전이성 NSCLC 환자의 1상 효능·안전성 자료가 포함됐다. 일정상 Tam-Peli NSCLC \#2577 포스터는 10월 26일 12:00\~12:45 CET, TAISHAN-301의 화학요법 비교 3상 비인두암 \#LBA43 발표는 10월 25일 08:40\~08:50 CET였다. [S5]

## Anthropic, IPO용 S-1 SEC에 공개 제출…주식 수·가격 범위 미정

**분야:** AI
**테마:** 투자·기업거래
**보조 테마:** 없음
**세부 태그:** 자금 조달 검토
**기업·기관:** Anthropic, SEC, 아마존, 구글

2026년 10월 26일 공개된 한 보도는 수 주간의 S-1 유출 뒤 Anthropic이 IPO를 신청했다고 전했고, 10월 27일 공개된 로이터·월스트리트저널 등 외신 보도는 회사가 현지시간 26일 미국 SEC에 IPO용 S-1 등록서를 공개 제출했다고 보도했다. 예정 상장 시장은 Nasdaq Global Select Market이고 종목 코드는 ANT지만 공모 주식 수와 가격 범위는 확정되지 않았으며, 해당 보도는 11월 초 기관투자가 대상 로드쇼와 11월 중순 상장을 전망했다. 보도된 기업가치 전망은 1조5000억\~2조 달러(약 1991조\~2654조 원)이며, 시장에서 거론된 IPO 조달 목표 1000억 달러(약 133조 원)가 달성되면 역대 최대 규모가 된다. [S6] [S7] [S8]

### 공개된 실적

보도된 올해 상반기 매출은 162억9000만 달러(약 21조6168억 원)로 전년 동기 11억6000만 달러보다 약 14배였고 지난해 연간 매출 45억9000만 달러도 웃돌았다. 같은 기간 순손실은 약 807억 달러로, 주식 전환이 가능한 금융상품의 회계상 평가손실이 주로 반영된 것으로 설명됐다. 실제 영업손실은 전년 동기 21억4000만 달러에서 6억9300만 달러로 줄었다. [S7]

### 컴퓨팅 지출 약정 보도

보도에 따르면 Anthropic은 Amazon과 Google 등 협력사와 향후 약 10년에 걸쳐 컴퓨팅 관련 지출 6000억 달러 이상을 약정한 것으로 전해졌다. [S7]

### S-1의 Claude 관련 서술

Anthropic의 SEC 제출 S-1은 기업 고객 도입의 속도와 깊이를 Claude가 AI의 최전선에 있다는 강력한 증거로 제시했다. [S8]

## 삼성SDI, AOP와 ESS 솔루션 1GWh 공급 계약 체결

**분야:** 에너지·기후기술
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 수주·계약
**기업·기관:** 삼성SDI 아메리카(SDIA), AOP

삼성SDI는 2026년 10월 26일 미주법인 삼성SDI 아메리카(SDIA)가 미국 에너지 전문기업 AOP와 1GWh 규모의 ESS 솔루션 공급 계약을 체결했다고 밝혔다. 이번 계약 1GWh에 지난해 말 체결한 1차 계약 물량 0.5GWh를 포함하면 총 계약 규모는 1.5GWh다. [S9] [S10]



## 단일 참여자 EMG 연구, Baxter 로봇 팔로 사람 팔 동작 재현

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현
**기업·기관:** 없음

2026년 10월 26일 공개된 연구에서 연구진은 한 명의 참여자가 수행한 네 가지 사전 정의 동작 시퀀스 동안 오른팔 상지의 열 곳에서 표면 EMG 신호를 순차적으로 수집했다. 연구진은 필터링과 NeuroKit2를 이용한 활성 시작점 탐지를 거쳐 감지된 근육 활성화를 의수의 대리 장치로 사용한 Baxter 로봇 팔의 관절 명령에 매핑했다. 제안된 파이프라인은 사람 동작의 전반적인 구조와 범위를 재현했고 로봇 관절 움직임은 참여자와 유사했지만, 모든 시퀀스에서 로봇의 완료 시간은 참여자보다 평균 319% 더 길었다. [S11]

### 측정과 실시간 구현 조건

319% 차이는 EMG 신호 처리 시간이 아니라 로봇이 관절을 움직여 목표 각도에 도달하고 다음 동작을 시작하기까지의 동작 시간이다. 연구 방식은 전체 신호를 분석하는 후처리라 실시간 구현이 아니며, 실시간 시스템에는 순차 수집 대신 동시 다채널 EMG 기록과 지연 시간 같은 추가 제약이 필요하다. [S11]

### 표본과 저자들의 해석

단일 참여자 연구여서 사용자 간 일반화에 한계가 있다고 저자들은 밝혔다. 더 넓은 참여자 표본으로 사용자 간 효과를 특성화하고 근육량·체지방 등 생물학적 차이에 따른 잠재적 성능 차이를 정량화하며, 서로 다른 생리 조건에서 참여자나 세션 간 전극 배치의 작은 차이가 미치는 영향을 조사하자고 제안했다.

저자들은 연구에서 조정할 수 없었던 로봇의 고정 기본 속도와 관절각 프로파일이 긴 완료 시간에 일부 기여했을 수 있다고 제시했다. 관찰된 움직임은 로봇이 속도보다 부드러움과 정확성을 우선하도록 설정됐을 가능성을 시사한다고 서술했다. [S11]

## 삼성전기·엔비디아, FC-BGA 공급 파트너십…전용 생산시설 공동 투자

**분야:** 반도체·컴퓨팅
**테마:** 생산·공급망
**보조 테마:** 사업·고객
**세부 태그:** 설비 투자, 수주·계약
**기업·기관:** 삼성전기, 엔비디아

삼성전기는 2026년 10월 21일 엔비디아와 반도체 패키지기판 공급을 위한 전략적 비즈니스 파트너십을 체결했다고 밝혔다. 두 회사는 공동 투자로 세종·부산사업장에 AI 반도체 패키지기판 전용 생산시설을 구축할 계획이다. 삼성전기는 2026년부터 국내 생산시설에서 다년간 차세대 반도체 패키지기판을 공급할 예정이다. 공급 물량은 2026년부터 연평균 두 자릿수 이상 성장할 전망이며, 2028년에는 전체 생산능력 중 유의미한 비중이 엔비디아용으로 구성될 것으로 보인다. [S12]

### 공급 품목

공급 품목은 플립칩-볼그리드어레이(FC-BGA) 기판이다. 이 기판은 AI 연산 반도체와 데이터센터에서 칩 간 고속 연결을 담당하는 네트워크 스위치에 쓰인다. [S12]

## FDA, 신경과학 의료제품 개발 지원 프로그램 NAIN 출범

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** U.S. Food and Drug Administration

미국 식품의약국(FDA)은 원 발표일인 2026년 10월 22일 신경과학 발전·혁신 네트워크(Neuroscience Advancement and Innovation Nexus, NAIN)를 새 기관 프로그램으로 출범했다고 발표했다. NAIN은 FDA의 세 센터 전문성을 조정해 약물·생물학적 제제·기기 전반의 과학·규제 쟁점을 다루고, 뇌·신경계 질환 의료제품 개발에 필요한 과학·도구·규제 접근을 발전시킬 계획이다. 프로그램은 신경·정신질환, 물질사용장애와 통증을 폭넓게 다루며 환자·산업계·학계 등 이해관계자 참여를 지원할 예정이다. 첫 사업인 Alzheimer's Prevention Accelerator는 알츠하이머를 예방하거나 지연할 의료제품에 초점을 두고, 예방·조기개입 약물 개발 임상시험을 진전시킬 접근법을 살펴볼 계획이다. [S13]

### 임상시험 설계의 초점

Alzheimer's Prevention Accelerator는 시험 대상군, 질병 단계에 맞는 평가변수, 알츠하이머로 인한 인지 저하를 예방하거나 늦췄음을 입증할 근거 접근법을 중점적으로 살펴본다. 이 사업은 FDA 내부와 환자·돌봄자·연구자·산업계·민관 파트너십·다른 정부기관의 관점을 모을 계획이다. [S13]

## NVIDIA, Isaac 로봇 플랫폼에 런타임·학습 프레임워크·데이터 추가

**분야:** 로봇·제조
**테마:** 제품·서비스
**보조 테마:** 연구·기술
**세부 태그:** 기능 추가, 구현·운영 지침
**기업·기관:** NVIDIA, Agile Robots, Agility, Dexory, FORT Robotics, KION, SICK

2026년 10월 21일 NVIDIA는 GTC Berlin 2026에서 오픈 로보틱스 개발 플랫폼 Isaac의 확장을 발표했다. 확장 항목에는 휴머노이드 레퍼런스, 데이터셋과 런타임, Isaac Lab 3.0 및 로봇 학습 프레임워크 업데이트가 포함된다. NVIDIA는 데이터·시뮬레이션·AI 모델·컴퓨팅을 통합해 로봇 개발 기간을 줄이고 상용화를 앞당기는 것을 전략으로 제시했다. [S14] [S15]

### 데이터와 시뮬레이션 자산

SimReady Central Library에는 시뮬레이션에 바로 쓸 수 있는 로봇·공장 자산이 2,000개 넘게 있으며 Hugging Face에서 이용할 수 있다. Human 1M Dataset은 다양한 인간 활동, 동기화된 3개 시점 영상과 3D 손 추적 데이터를 포함해 Hugging Face에서 제공되지만, 전체 데이터셋 접근은 Cosmos Coalition 파트너로 제한된다. [S14]

### 학습 프레임워크와 런타임

일반 공개된 오픈소스·에이전트 대응 Isaac Lab 3.0은 데스크톱에서 데이터센터까지 멀티 GPU 작업흐름과 Newton 및 NVIDIA PhysX 물리 엔진을 이용해 로봇 정책을 학습·개선한다. NVIDIA Holoscan 기반 오픈소스 Isaac OS 런타임은 시뮬레이션부터 실제 로봇까지 AI, 센서, 제어, 로봇 하드웨어를 연결해 결정론적 실시간 성능을 제공하도록 설계됐다. [S14]

### DGX Station 참조 워크플로

NVIDIA가 공개 중인 참조 워크플로는 세 가지다. 강화학습으로 GR00T 1.7 모델을 개선하고, Isaac Lab에서 손재주 조작 기술을 학습하며, ChatGPT Astra를 사용해 합성 데이터 생성을 위한 NVIDIA Cosmos 월드 모델을 추가 학습한다. NVIDIA는 이 오픈소스 워크플로를 DGX Station에서 데이터 생성·훈련·평가에 활용하도록 제시했다. [S14]

### Halos 안전 아키텍처 통합

NVIDIA에 따르면 Agile Robots, Agility, Dexory, FORT Robotics와 KION은 창고 로봇 안전 아키텍처에 NVIDIA Halos를 통합하고 있다. SICK는 고정 구역을 넘어 변하는 조건에 대응하는 산업 로봇의 동적 안전을 위해 Halos를 평가 중이다. [S14]

## Agile Robots, NVIDIA 기술을 탑재한 휴머노이드 레퍼런스 Agile ONE SN 공개

**분야:** 로봇·제조
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Agile Robots, NVIDIA

2026년 10월 21일 Agile Robots는 NVIDIA Isaac GR00T를 사전 탑재하고 Jetson Thor로 구동하는 풀스택 레퍼런스 휴머노이드 Agile ONE SN을 공개했다. Agile Robots는 NVIDIA Halos 안전 스택을 통합할 계획이며, Agile ONE SN은 2027년 초 이용 가능할 예정이다. 공개 사양은 Agile ONE S 본체, Dual WUJI Hand 2 손과 Jetson Thor의 크기·제어·연산 정보를 제시한다. [S14]

### 본체와 손 사양

자료가 제시한 Agile ONE S 휴머노이드 본체는 높이 1.40m(4.59ft), 무게 40kg(88lb), 자유도 31이며 팔 하나당 3kg을 들 수 있다. 듀얼 WUJI Hand 2는 손마다 손가락이 다섯 개이고 자유도 20, 1kHz 힘 제어와 촉각 센싱을 제공해 정교한 조작을 지원한다. [S14]

### 온보드 연산과 개발 용도

NVIDIA Jetson Thor 온보드 컴퓨팅은 2,070 FP4 테라플롭스와 128GB 통합 메모리를 제공하며, 자료는 이를 온보드 추론과 실시간 제어 용도로 설명했다. [S14]

### Agile Robots 경영진의 설명

Agile Robots 창립자 겸 CEO Zhaopeng Chen은 여러 기술을 배우고 사람을 위해 만들어진 다양한 환경에서 일하는 범용 기계를 실용 규모로 구현하는 것이 휴머노이드의 과제라고 말했다. 그는 Agile ONE SN을 개발자가 작업 역량을 만들고 훈련하며 검증할 수 있는 준비된 시스템이라고 소개했다. [S14]

## NVIDIA DSX, AI 팩토리 전력·냉각 설계와 파트너 생태계 확대

**분야:** 에너지·기후기술
**테마:** 표준·생태계
**보조 테마:** 연구·기술
**세부 태그:** 기술 제휴, 실증·재현, 구현·운영 지침
**기업·기관:** NVIDIA, Lambda, Nscale, CoreWeave, Firmus, Google Cloud, IREN, Nebius, Sharon AI, Emerald AI, EPRI, National Grid, Schneider Electric, Trane Technologies, Eaton, Vertiv, Hitachi Energy, GE Vernova, Siemens Energy

NVIDIA는 2026년 10월 21일 유럽 생태계 파트너들이 냉각수 사용을 최소화하고 같은 AI 산출에 더 적은 전력을 쓰는 DSX AI Factory Platform을 도입해 AI 팩토리를 구축한다고 발표했다. NVIDIA는 유럽의 AI 클라우드들이 DSX 기반 AI 팩토리를 구축·운영 중이며, 이에 따라 유럽 기업·개발자·정부의 가속 컴퓨팅 접근이 확대된다고 밝혔다. NVIDIA에 따르면 DSX MaxLPS는 같은 수의 토큰을 생성하는 데 필요한 전력을 최대 30% 줄일 수 있고, Lambda의 HGX B200 기반 개념검증에서는 고정 전력 예산에서 클러스터 토큰 처리량이 24%, GPU 용량이 19% 늘었다. 별도 평가에서 Nscale은 아이슬란드 AI 팩토리의 NVIDIA GB300 NVL72 랙 4개와 동일한 264킬로와트 전력 예산을 사용해 추론 처리량 49%, 관리 GPU 용량 37% 증가를 시연했다고 보고했다. [S16]

### 전력 사용과 전력망 연동

NVIDIA는 DSX MaxLPS가 AI 팩토리에 사전 배정된 전력 예산 안에서 전력을 동적으로 배분한다고 설명했다. 운영자는 확보한 효율을 같은 전력 예산 안에서 더 많은 GPU 용량과 높은 처리량을 내는 데 쓸 수 있으며, CoreWeave, Firmus, Google Cloud, IREN, Lambda, Nebius, Nscale, Sharon AI는 DSX MaxLPS를 탐색 중이라고 밝혔다.

DSX Flex는 작업부하 전력 사용을 전력회사 요구, 수요반응 이벤트, 전력 가격에 맞추고 전력망·현장 재생에너지·에너지 저장을 조정해 AI 팩토리를 유연한 부하로 운용하도록 한다는 NVIDIA의 설명이다. 이는 전력망 신뢰성과 더 빠른 연결을 지원하려는 설계 목표다.

초기 시험에서는 Emerald AI, EPRI, Nebius, 영국 National Grid와 NVIDIA가 모의 전력망 이벤트에 대응해 Blackwell Ultra GPU 클러스터의 전력 사용을 최대 40% 낮추면서 핵심 작업부하를 계속 실행하는 모습을 시연했다. [S16]

### 냉각 설계와 물 절감 추정

NVIDIA DSX 참조 설계는 폐회로 액체 냉각과 드라이 쿨러로 물 증발 없이 열을 배출해 시설 냉각수 사용을 거의 0으로 낮추도록 설계됐다. NVIDIA는 2기가와트 규모에서 기존 냉각탑 방식보다 하루 5,400만 리터를 절감할 수 있으며, 이는 18만 가구의 하루 물 사용량과 같다고 추산했다.

NVIDIA는 Vera Rubin 인프라가 100% 액체 냉각을 지원하고 냉각수 온도를 최대 섭씨 45도까지 허용한다고 설명했다. 가장 더운 시기에 보조 기계식 냉각이 필요한지는 지역 기후에 따라 달라진다고 밝혔다. [S16]

### 개발·설계·인증 상태

Nscale은 포르투갈과 아이슬란드 시설에서 DSX Sim을 사용해 배치 전에 전력·냉각·인프라 구성을 평가하는 디지털 트윈을 만들고 있다. NVIDIA는 모듈형 오픈소스 DSX OS의 구성 요소 세 가지가 developer preview 단계라고 밝혔다.

NVIDIA에 따르면 Schneider Electric은 Vera Rubin용 전력·냉각 참조 설계를 개발했다. Trane Technologies와 Eaton은 NVIDIA Vera Rubin DSX AI Factory Reference Design의 통합 설계를 함께 만들었으며, Eaton Beam 전력 인프라와 Trane Continuum 냉각·조정 제어를 grid-to-chip 구조로 연결해 데이터센터 효율을 높이고 설치 비용을 낮추려는 설계다. Trane은 열관리 시스템 참조 설계 7개를 게시했고 그중 3개는 각각 250메가와트 규모의 DSX 냉각 참조 설계다.

NVIDIA는 Trane의 LiquidStack GigaModular 냉각수 분배 장치와 Vertiv의 2.3메가와트 CoolChip 장치가 각각 해당 DSX Ready 범주에서 인증을 받았고, Hitachi Energy의 배터리 저장 시스템도 DSX Ready BESS 자격을 얻었다고 보고했다. [S16]

### 진행 중인 에너지 파트너 작업

NVIDIA는 GE Vernova, Hitachi Energy, Siemens Energy와 시설 요구에 맞춘 전력 인프라·디지털 트윈 프로젝트를 진행 중이라고 밝혔다. Hitachi Energy는 전력망·발전·저장 자원과 작업부하 수요를 최적화하기 위해 에너지관리시스템과 DSX Flex의 연동을 개발 중이다. [S16]

## NVIDIA, 공급망 파트너와 기판·패키징·테스트 생산능력 확대 계획

**분야:** 반도체·컴퓨팅
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 증설, 설비 투자
**기업·기관:** NVIDIA, Amkor Technology, IBIDEN, King Yuan Electronics (KYEC), Samsung Electro-Mechanics, Siliconware Precision Industries (SPIL), Unimicron Technology Corporation

NVIDIA는 2026년 10월 21일 GTC Berlin에서 가속 컴퓨팅과 풀스택 AI 팩토리 플랫폼의 수요 증가에 대응해 공급망 파트너들과 글로벌 제조 역량을 확대할 계획이라고 발표했다. NVIDIA는 IBIDEN, Samsung Electro-Mechanics, Unimicron Technology Corporation과의 기판 계약이 향후 3년 동안 합산 생산능력의 2.5배 증가를 이끌 것으로 전망했으며, 별도로 자사 제품용 기판 생산능력도 같은 기간 2.5배로 늘릴 계획이라고 밝혔다. NVIDIA는 Amkor Technology, IBIDEN, King Yuan Electronics(KYEC), Samsung Electro-Mechanics, Siliconware Precision Industries(SPIL), Unimicron Technology Corporation과 협력해 신규·기존 공급업체의 기판·첨단 패키징·테스트·광 엔진 제조 역량을 확장하고 자사 글로벌 공급망의 회복력과 중복성을 강화하고 있다. Samsung Electro-Mechanics는 10월 21일 NVIDIA와 기판 공급 전략적 파트너십을 체결했다고 밝혔다. [S17] [S12]

### 한국 기판 생산시설 계획

삼성전기와 NVIDIA는 세종·부산 사업장에 AI 반도체 패키지기판 전용 생산시설을 공동 투자해 구축할 계획이다. NVIDIA는 협력이 삼성전기의 시설 개선과 두 지역의 신규 공장을 지원한다고 밝혔고, 2028년까지 NVIDIA에 배정된 생산량이 삼성전기의 연간 패키지기판 총 생산능력에서 상당한 비중을 차지할 것으로 전망됐다.

NVIDIA는 삼성전기가 기존 한국 사업장의 생산능력을 즉시 공급망에 제공한다고 설명했다. 더일렉 보도에 따르면 삼성전기는 국내 생산시설에서 올해부터 다년간 차세대 반도체 패키지기판을 공급할 예정이다. [S17] [S12]

### FC-BGA 공급과 대만 증설

더일렉 보도에 따르면 삼성전기가 공급할 FC-BGA는 AI 연산 반도체용과 데이터센터 안에서 칩 사이 고속 연결을 담당하는 네트워크 스위치용이다. 공급 물량은 2026년부터 연평균 두 자릿수 이상 성장할 전망이다.

NVIDIA는 생산능력 예약 계약으로 대만 Unimicron의 KF 기판 제조 확장을 지원하며, 이 확장은 2027년 2분기에 생산능력을 추가하기 시작해 2028년 중반까지 완전 생산능력에 도달할 것으로 예상된다. [S17] [S12]

## NVIDIA·Amkor, 한국 인터포저 웨이퍼 생산능력 2028년 말까지 300% 초과 확대 목표

**분야:** 반도체·컴퓨팅
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 증설
**기업·기관:** NVIDIA, Amkor Technology, IBIDEN, King Yuan Electronics (KYEC), Samsung Electro-Mechanics, Siliconware Precision Industries (SPIL), Unimicron Technology Corporation

NVIDIA는 2026년 10월 21일 GTC Berlin에서 가속 컴퓨팅과 풀스택 AI 팩토리 플랫폼의 수요 증가에 대응해 공급망 파트너들과 글로벌 제조 역량을 확대할 계획이라고 발표했다. 협력에는 Amkor Technology, IBIDEN, King Yuan Electronics(KYEC), Samsung Electro-Mechanics, Siliconware Precision Industries(SPIL), Unimicron Technology Corporation이 참여하며, 이들은 기판·첨단 패키징·테스트·광 엔진의 제조 역량을 넓혀 NVIDIA 글로벌 공급망의 회복력과 중복성을 강화하도록 지원한다. 이 가운데 NVIDIA와 Amkor는 한국에서 고급 패키징 생산능력을 확대해 2028년 말까지 인터포저 웨이퍼 생산능력을 300% 초과 늘리는 것을 목표로 하고, Amkor의 한국 신규 제조시설 개발과 함께 현재 및 차세대 NVIDIA 플랫폼의 더 높은 생산량을 지원할 계획이다. [S17]



## NVIDIA, 반도체 테스트 용량 2027년까지 두 배 전망…KYEC 미국 시설 지원

**분야:** 반도체·컴퓨팅
**테마:** 생산·공급망
**보조 테마:** 없음
**세부 태그:** 증설
**기업·기관:** NVIDIA, Amkor Technology, IBIDEN, King Yuan Electronics (KYEC), Samsung Electro-Mechanics, Siliconware Precision Industries (SPIL), Unimicron Technology Corporation

2026년 10월 21일 게시된 NVIDIA 발표에서 회사는 전체 반도체 테스트 용량이 2026년부터 2027년까지 두 배가 될 것으로 예상했으며, 미국·대만·싱가포르의 시설 구축이 이를 뒷받침한다고 밝혔다. NVIDIA는 Amkor Technology, IBIDEN, King Yuan Electronics(KYEC), Samsung Electro-Mechanics, Siliconware Precision Industries(SPIL), Unimicron Technology Corporation과 협력해 기판·첨단 패키징·테스트·광 엔진의 제조 역량을 확대하고 글로벌 공급망의 회복력과 중복성을 강화하고 있다. KYEC는 NVIDIA의 11억 달러 용량 예약 선급금 지원을 받아 미국에 신규 시설을 건설할 계획이며, 선급금은 미국 테스트 시설과 장비를 지원하고 대량 생산은 2027년 4월을 목표로 한다. [S17]



## Bolt, 유럽 로보택시 프로그램에 NVIDIA Alpamayo Stack 선택

**분야:** AI
**테마:** 사업·고객
**보조 테마:** 없음
**세부 태그:** 고객 도입
**기업·기관:** Bolt, NVIDIA, Lucid

2026년 10월 21일 공개된 NVIDIA 발표에 따르면 Bolt는 유럽 로보택시 프로그램에 NVIDIA Alpamayo Stack을 선택했다. 프로그램은 NVIDIA Hyperion 기반으로 제작될 미래 Lucid 차량부터 시작할 예정이며, Bolt와 NVIDIA는 여러 제조사의 차량에 통합할 수 있도록 소프트웨어를 유럽 도로 환경에 맞춰 조정하고 양사의 주행·안전 기술과 차량군 관리·운영·현지 시장 전문성을 결합할 계획이다. Bolt는 규제 승인을 받으면 2027년 마드리드에서 자율주행 기술 개발·검증을 위한 실제 주행 데이터를 수집할 계획이다. 독일을 미래 배치 우선 지역으로 삼아 NVIDIA Hyperion 기반 레벨 4 지원 미래 Lucid 차량을 유럽에 최소 2만5000대 출시할 계획이다. [S18]



## NVIDIA, 자율주행 안전 근거 생성하는 Halos SAFE 평가 프레임워크 공개

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** NVIDIA, dSPACE, IVEX, TÜV Rheinland

NVIDIA는 2026년 10월 21일 Halos 안전 시스템 안에 Halos SAFE를 도입해 시뮬레이션과 물리적 시험을 결합하고, 개발자가 측정 가능하고 추적할 수 있는 자율주행 안전 근거를 만들도록 돕는다. NVIDIA는 주행 행태와 시뮬레이션 정확도를 반복해서 평가할 수 있도록 이 프레임워크를 공개했으며, dSPACE·IVEX·TÜV Rheinland가 평가 워크플로에서 협력하고 있다. Halos SAFE는 정의된 시나리오·시험·측정 가능한 성능 기준을 통해 시뮬레이션, 소프트웨어·하드웨어 인 더 루프 평가, 도로 시험, 차량군 모니터링을 연결해 배치를 뒷받침할 추적 가능한 안전 근거를 생성한다. [S18]



## ASEC, PHP2Shell 재현 공개…AhnLab EDR 탐지 사례 소개

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 연구·기술
**세부 태그:** 실증·재현, 구현·운영 지침
**기업·기관:** AhnLab SEcurity intelligence Center(ASEC), PHP 보안팀

AhnLab SEcurity intelligence Center(ASEC)는 2026년 10월 22일 공개 PoC를 참고해 PHP2Shell 취약점 재현 테스트를 진행하고 AhnLab EDR 탐지 사례를 소개했다. 대상은 PHP 내부 요청 처리 과정의 CVE-2026-109618과 CVE-2026-109619로, 두 취약점 모두 인증되지 않은 공격자의 원격 코드 실행으로 이어질 수 있다고 보고됐다. ASEC이 정리한 평가에서 두 취약점은 각각 CVSS v4.0 9.2점이며, PHP 보안팀은 하루 전인 10월 21일 수정 업데이트를 배포하고 PHP 8.2\~8.5 사용자에게 즉시 업데이트를 권고했다. 문서에 적힌 계열별 수정 버전은 PHP 8.5.12, 8.4.27, 8.3.36, 8.2.35이며, 업데이트 뒤 웹 서비스를 재시작하도록 안내한다. [S19]

### 두 취약점의 원인

ASEC 문서는 CVE-2026-109618을 메모리 부족으로 요청 처리가 중단될 때 데이터가 완전히 초기화되지 않은 채 남아 정리 과정에서 잘못된 데이터가 유효한 것으로 취급될 수 있는 문제로 설명했다. 해당 취약점의 잠재적 영향은 인증 없는 원격 코드 실행으로 기재됐다.

CVE-2026-109619은 요청 처리에 쓰인 내부 상태가 메모리 해제 뒤에도 남아 초기화 전에 후속 요청에서 재사용될 가능성으로 설명됐다. ASEC 자료는 이 취약점도 인증 없는 원격 코드 실행의 잠재적 영향을 가지며 CVSS v4.0 점수를 9.2로 제시한다. [S19]

### 공개 PoC 재현 과정

ASEC의 재현 타임라인은 0\~6초에 공격자와 피해 서버 IP 주소를 확인하고, 6\~16초에 PHP 웹사이트 대상 테스트 스크립트를 실행하는 순서다. 16\~20초에는 피해 서버가 공격자 PC에 연결되어 공격자가 피해 서버의 명령 셸을 사용할 수 있게 되는 장면을 제시한다.

이어 20\~23초 구간에는 명령이 서버의 웹 계정인 www-data 권한으로 실행되는 것을 확인하고, 23\~29초에는 서버 IP 주소를 확인해 재현 접속이 대상 서버에 도달했는지 검증한다고 설명한다. 이는 ASEC이 공개 PoC를 참고해 수행한 재현 과정이다. [S19]

### 패치와 탐지 정보

ASEC의 안내는 PHP 보안 업데이트 적용 뒤 웹 서비스를 재시작하도록 한다. AhnLab EDR/XDR 설명은 PHP 서비스에서 발생하는 의심스러운 명령 실행이나 파일 생성 등 행위를 위협 또는 주요 행위로 탐지해 관리자의 원인 파악과 대응·재발 방지 절차 수립을 돕는다는 내용이다. [S19]

## KAIST, 전하 감지·자외선 집기를 한 소재에 묶은 '이오노그래스퍼' 발표

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** 없음

KAIST는 9월 30일 문홍철 교수 연구팀이 전하를 띤 물체의 접근을 감지하고 자외선에 굽는 이온성 소재 '이오노그래스퍼'를 개발했다고 발표했다. 연구팀은 소재가 굽혀지며 물체를 붙잡는 모습을 시연했고, 빛을 끈 뒤에도 잡은 형태를 10분 이상 유지했다고 밝혔다. 빛에 반응하는 아조벤젠과 수분을 흡수하는 고분자를 결합해 이온이 움직이는 그물망 구조를 만들었다. [S20]

### 접근 감지와 빛에 따른 굽힘

연구팀은 전하를 띤 물체가 가까워질 때 소재 안의 양이온과 음이온이 재배열되면서 나타나는 전기 신호로 별도의 감지용 전압 없이 접근과 움직임을 알아냈다고 설명했다.

자외선을 비추면 아조벤젠의 모양 변화와 소재 한쪽 면의 수분 손실로 굽힘이 생기고, 그 움직임으로 물체를 붙잡는 모습을 시연했다. [S20]

### 연구팀이 개선하려는 성능

연구팀은 감지 거리와 움직이는 속도, 반복 사용 시 내구성, 물체를 지탱하는 힘을 높이고, 가시광선이나 근적외선으로도 움직일 수 있도록 연구를 이어갈 계획이다. [S20]

## ASEC, 불법 프로그램 위장 Rust 인포스틸러의 정보 탈취·추가 악성코드 기능 분석

**분야:** 사이버보안
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 실증·재현, 구현·운영 지침
**기업·기관:** 안랩

2026년 10월 21일 AhnLab SEcurity intelligence Center(ASEC)는 불법 프로그램으로 위장한 신종 정보탈취형 악성코드(인포스틸러)를 확인했다고 밝혔다. ASEC에 따르면 이 악성코드는 8월 중순 처음 발견됐고, 초기 소규모 배포에서 Autolt를 사용한 뒤 Explorer 프로세스 인젝션이나 독립 실행 방식으로 바뀌어 9월 초 대량 유포가 본격화됐으며 일부 샘플은 별도 다운로더를 거쳤다. 악성코드는 브라우저와 업무용 프로그램에 저장된 정보를 노리고, C2 설정에 따라 수집 범위와 후속 동작이 달라져 추가 피해로 이어질 수 있다고 ASEC는 설명했다. [S21]

### 유포와 실행 회피

ASEC은 일부 샘플이 Rust로 작성됐으며 동적 JMP를 활용한 안티 디스어셈블, CPU 메모리 캐시 조회를 이용한 안티 샌드박스, DLL 인젝션을 사용했다고 분석했다. 보고서는 이러한 기법이 기존 인포스틸러에서 흔하지 않았다고 설명한다.

실행 환경을 샌드박스나 가상 환경으로 판단한 샘플은 정보 탈취를 수행하지 않고 종료했다. 최근 유포된 일부 샘플은 내부에 암호화해 둔 DLL을 복호화한 뒤 Explorer 프로세스에 주입했다.

참조 문자열은 사용 직전까지 암호화해 두며, 샘플별로 달라지는 변형 색인 테이블을 사용한다. 복호화 함수에 전달된 정수 값으로 테이블을 회전해 같은 평문도 키에 따라 다르게 암호화할 수 있고, 암호문 끝에 임의 문자열을 붙여 원래 길이를 추정하기 어렵게 했다. [S21]

### C2 통신과 수집 범위

실행되면 설치 프로그램 목록, CPU 이름, 그래픽 드라이버 정보, CPUID 명령 데이터, Windows 버전 등 PC 기본 정보를 공격자가 통제하는 C2 서버로 보낸다. 이후 서버 설정 데이터가 정보 수집 대상과 추가 동작을 정한다.

ASEC은 송신 데이터를 XOR로 암호화한 뒤 Windows의 LZNT1 알고리즘으로 압축하고, 수신 데이터는 XOR로 복호화한다고 설명했다. XOR 키는 샘플마다 달랐으며, 보고서는 네트워크 통신 내용 기반 탐지를 피하려는 의도일 수 있다고 추정했다.

확인된 C2 설정은 인증서, SSH 키, 암호화폐 지갑, 설정 파일과 문서를 포함한 폭넓은 프로그램·파일을 탈취 대상으로 지정했다. 실제 수집 범위는 C2 설정에 따라 달라질 수 있으며 VPN이나 원격접속 자격정보가 노출되면 내부 시스템 무단 접근이나 추가 공격에 악용될 수 있다고 ASEC은 경고했다. [S21]

### 추가 payload와 점검 항목

C2 설정에 지정된 외부 URL에서 payload를 내려받아 실행하는 기능도 있다. 분석된 설정에서는 이 기능이 활성화되어 있어 다른 악성코드를 배포하는 드로퍼로 활용될 수 있다고 ASEC은 설명했다.

ASEC은 신뢰할 수 없는 출처에서 내려받거나 압축을 푼 대용량 ZIP 안의 실행 파일을 실행한 이력을 확인하라고 권고했다. 함께 살펴볼 흔적으로는 autoit.exe 또는 explorer.exe 관련 비정상 코드 주입, 의심스러운 C2 통신, 정보 탈취와 추가 악성코드 설치 흔적을 들었다. [S21]

## KAIST 연구팀, 스마트폰 AI에 서버 지식을 재사용하는 CURE 개발

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** 전산학부 이재길 교수 연구팀

KAIST는 2026년 9월 21일 전산학부 이재길 교수 연구팀이 스마트폰의 소형 AI와 서버의 대형 AI를 연결하는 기기-서버 협업 기술 CURE(Cumulative Knowledge Reuse, 누적 지식 재사용)를 개발했다고 밝혔다. 대학 측에 따르면 CURE는 서버의 대형 AI에게서 얻은 지식을 스마트폰에 저장해 비슷한 문제에 재사용하고, 높은 정확도를 유지하면서 서버 호출을 평균 55.61% 줄였다. 연구진은 비슷한 문제가 반복될수록 서버 의존을 낮추고 더 빠르게 판단하는 모바일 AI의 가능성을 제시했다. [S22]



## GitHub Copilot 사용량 API, OpenCode 등 도구별 요청·토큰 집계 추가

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

2026년 10월 24일(한국시간) GitHub는 Copilot 사용량 지표 API가 OpenCode처럼 기존 보고서에 잡히지 않던 도구의 모델 사용량도 보고하도록 확장하고 `totals_by_client` 배열을 추가했다고 밝혔다. 새 집계는 엔터프라이즈·조직·사용자 단위 보고서의 1일 및 28일 버전에 적용되며, 28일 통합 보고서에서는 날짜별 `day_totals` 항목에 표시된다. GitHub는 IDE 밖 도구가 편집기 telemetry를 보내지 않아 `totals_by_ide`에서 빠졌던 사용량을 서버 요청 집계로 보완해, 도구별 사용과 요청·토큰 규모를 파악하고 지원·거버넌스 결정을 내릴 수 있다고 설명했다. [S23]

### 도구별 집계 필드

각 `totals_by_client` 항목은 하나의 client를 나타낸다. `client`에는 요청을 보낸 도구가 표시되며 예시는 `opencode`, `claude_code`, `codex`, `zed`, `copilot_cli`, `github_app`, `cloud_agent`, `code_review`, `vscode`, `jetbrains`다. 인식되지 않은 값은 `other`로 묶인다.

`request_count`는 해당 client의 성공한 모델 요청 수다. 이는 prompt 수가 아니라 model call 수이므로 한 prompt가 여러 call을 만들 수 있고, prompt나 interaction 횟수와 직접 비교해서는 안 된다. `session_count`는 서로 다른 세션 수이며 `token_usage`는 prompt token, output token, 요청당 평균 token을 담는다.

`totals_by_model`은 요청·token 지표를 모델별로 나눈다. `model_selection_mode`는 직접 요청한 `user_selected`, 자동 선택 `auto`, 제품이 고른 `product_selected`를 구분하고, 아직 개별 보고되지 않는 선택 방식은 `other`, 정규화할 수 없는 값은 `unknown`으로 나타난다. Copilot code review와 cloud agent는 제품이 모델을 고르므로 `product_selected`이며, code review 모델은 `unknown`으로 보고된다. [S23]

### 식별·접근 조건과 호환성

GitHub는 각 요청에 실린 integration ID로 client를 식별한다. 따라서 `client`는 실제 도구 신원을 검증한 값이 아니라 요청에 담긴 ID를 바탕으로 한 best-effort 그룹이다. 이 API의 `totals_by_client`는 Copilot을 사용하는 모든 도구의 모델 traffic, 즉 요청과 토큰을 측정한다. 이는 Claude나 Codex 같은 GitHub agent app이 시작한 job 수를 집계하는 agent app activity와는 다른 지표다.

이 지표는 엔터프라이즈 소유자와 billing manager, 조직 소유자, 또는 `View Copilot Metrics` 권한을 가진 사용자 지정 조직·엔터프라이즈 역할이 볼 수 있다. Copilot usage metrics 정책도 활성화되어 있어야 한다.

GitHub는 변경이 추가 방식이라 기존 필드는 그대로 유지되고, 보고할 사용량이 없으면 `totals_by_client`가 빈 배열이라고 밝혔다. [S23]

## AWS Lambda MicroVMs, 4개 리전 추가해 총 14개 리전으로 확대

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 22일 Lambda MicroVMs를 아시아 태평양(홍콩·말레이시아·태국)과 유럽(스페인) 등 4개 추가 리전에 제공해 총 14개 AWS 리전에서 사용할 수 있다고 밝혔다. AWS는 이번 출시로 개발자가 최종 사용자 가까운 4개 추가 리전에서 Lambda MicroVMs를 실행해 지연 시간 및 데이터 레지던시 요구를 맞추는 데 도움을 받을 수 있다고 설명했다. [S24]

### 격리와 상태 보존을 갖춘 실행 환경

AWS는 Lambda MicroVMs를 사용자 또는 AI가 생성한 코드를 실행하는 서버리스 컴퓨팅 프리미티브로 설명한다. VM 수준 격리와 거의 즉시 이뤄지는 실행·재개, 상태 보존을 제공한다고 밝혔다.

개발자는 가상화 인프라를 직접 관리하지 않고 격리·속도·상태 보존 중 하나를 포기하지 않으면서 사용자나 작업마다 독립된 컴퓨팅 환경을 줄 수 있으며, AWS가 든 활용 예는 AI 코딩 어시스턴트, 대화형 개발 환경, 취약점 스캐너다. [S24]

### 이미지 생성부터 접속까지

개발자는 Dockerfile로 MicroVM 이미지를 만든 뒤 그 이미지에서 MicroVM을 실행한다. 사용자나 작업별 MicroVM에는 전용 HTTPS URL을 부여할 수 있고, 이 URL은 HTTP/2·gRPC·WebSockets를 지원한다.

서비스는 AWS Lambda 콘솔, AWS CloudFormation, AWS Cloud Development Kit 또는 Agent Toolkit for AWS를 사용하는 에이전트 개발 도구로 이용할 수 있다고 AWS는 안내했다. [S24]

## GitHub Public monitoring에 경보 관리·데이터 레지던시 지원 추가

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 한국시간 2026년 10월 24일 Public monitoring에 경보 관리 기능을 더해 기업 고객이 엔터프라이즈 보안 대시보드에서 공개 모니터링 결과를 분류·처리할 수 있다고 밝혔다. 관리자는 경보를 Dismissed 또는 Fixed로 닫고 선택적으로 설명을 남기거나, 상황이 바뀌면 닫힌 경보를 다시 열 수 있다. 하루 앞선 한국시간 10월 23일에는 Public monitoring을 GitHub Enterprise Cloud 데이터 레지던시 고객에게도 공개 프리뷰로 제공한다고 발표했다. 데이터 레지던시 환경에서는 검증된 도메인 일치만으로 조직 귀속을 판정하고, 일치한 경보를 암호화해 해당 기업 대시보드에 전달하며 지정된 지리 범위 안에 데이터를 유지한다고 GitHub는 설명했다. [S25] [S26]

### 토큰 상태와 경보의 한계

GitHub는 지원되는 provider의 토큰 유효성을 계속 자동 확인하고 경보에 Active, Inactive, Unknown 상태를 표시한다고 밝혔다. 이 구분은 보안팀이 활성 토큰을 우선 대응하도록 돕는 기능이다.

경보를 닫으면 엔터프라이즈의 경보 상태만 바뀐다. 노출된 자격 증명이 폐기되거나 공개 저장소에서 삭제되는 것은 아니라고 GitHub는 명시했다. [S25]

### 대시보드 감사와 필터

경보 활동 타임라인은 경보에 취해진 모든 조치와 상태 변경의 감사 기록을 제공한다. 목록은 저장소, 커미터, 비밀정보 유형, 귀속 방식(멤버십 또는 검증된 도메인), 열린 상태·닫힌 상태로 필터링하고 정렬할 수 있다. [S25]

### 대응 파이프라인 연결

엔터프라이즈 관리자와 엔터프라이즈 보안 관리자는 GET /enterprises/{enterprise}/secret-scanning/public-monitoring-alerts REST API로 귀속된 발견사항을 조회할 수 있다. 반환 항목에는 경보 메타데이터, 비밀정보 유형, 귀속 정보와 노출 위치가 포함된다.

조직은 enterprise 수준에서 secret\_scanning\_public\_monitoring\_alert webhook을 구독해 새로 탐지된 유출이 조직에 귀속될 때 실시간 알림을 받을 수 있다. [S25]

### 공개 프리뷰와 라이선스

Public monitoring은 GitHub Enterprise Cloud 고객을 대상으로 공개 프리뷰 상태이며, 데이터 레지던시 고객도 포함된다. Enterprise admin 또는 enterprise security manager가 보안 대시보드에서 기능을 켜고 경보 설정을 관리할 수 있으며, 사용에는 활성 GitHub Advanced Security 또는 GitHub Secret Protection 라이선스가 필요하다. 기능은 해당 라이선스에 추가 비용 없이 포함된다. [S25] [S26]

## GitHub, SCIM 계정 오삭제 원인 공개…영향 사용자 기록 복원과 재발 방지 조치

**분야:** 소프트웨어·클라우드
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 서비스 장애
**기업·기관:** GitHub

GitHub은 2026년 10월 24일(한국시간) 공개한 공지에서 2026년 6월 1일부터 13일까지 SCIM으로 프로비저닝 해제된 일부 Enterprise Managed User 계정이 예상된 정지·난독화 대신 잘못 삭제됐다고 밝혔다. GitHub은 여러 기업에서 약 12,285개 계정이 영향을 받았으며, 해당 사용자가 기업 안에서 정지·난독화된 기록으로 남는 대신 이슈·풀 리퀘스트·감사 로그에 유령 사용자로 나타났다고 설명했다. 기업은 6월 1일부터 13일까지 감사 로그에 Enterprise Managed User의 user.delete 이벤트가 있는지로 영향을 확인할 수 있으며, 해당 이벤트가 없으면 영향받지 않았고 이벤트가 있는 기업에는 별도 조치가 필요 없다고 GitHub은 안내하면서 계정 복원을 진행 중이라고 밝혔다. GitHub은 6월 1일 도입한 새 프로비저닝 해제 경로가 계정의 Enterprise Managed User 여부를 확인하지 않아 삭제를 일으켰으며, 6월 13일 해당 경로를 비활성화해 문제를 차단했다고 밝혔다. [S27]

### 계정 삭제 경로와 영향 규모

GitHub은 영향 계정 대부분이 이미 정지되고 강제 프로비저닝 해제된 상태여서 설계상 다시 프로비저닝할 수 없었다고 설명했다. 삭제 당시 활성 상태였던 계정은 더 작은 집단인 76개였다. [S27]

### 복원 및 재발 방지

GitHub은 재발 방지 코드 변경을 완료했다고 밝혔고, 2026년 10월에 영향 사용자 기록을 복원했다고 보고했다. 복원된 계정은 예상된 정지·난독화 상태로 돌아갔으며 기업 내부의 추적 가능성과 감사 이력이 보존됐다고 설명했다. [S27]

### 재프로비저닝 절차

강제 프로비저닝 해제된 Enterprise Managed User 계정은 설계상 다시 프로비저닝할 수 없으므로, GitHub은 이번 문제가 재프로비저닝 워크플로에 영향을 주지 않는다고 밝혔다. [S27]

## AWS, 벵갈루루 인근 Direct Connect 위치에 100 Gbps 연결 확대

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS

AWS는 2026년 10월 22일 인도 벵갈루루 인근 Netmagic DC2 데이터센터의 기존 AWS Direct Connect 위치에서 100 Gbps 전용 연결을 확장했다고 발표했다. 이 위치에서는 중국 내 리전을 제외한 모든 AWS 퍼블릭 리전과 AWS GovCloud 리전, AWS Local Zones에 비공개 직접 네트워크 접속을 설정할 수 있다. [S28]

### Direct Connect의 연결 방식

AWS Direct Connect는 AWS와 고객의 데이터센터·사무실·코로케이션 환경 사이에 비공개 물리 네트워크 연결을 설정하는 서비스다.

AWS는 이러한 비공개 연결이 공용 인터넷을 이용한 연결보다 더 일관적인 네트워크 경험을 제공할 수 있다고 설명했다. [S28]

## PHP2Shell 두 취약점, 인증 없는 원격 코드 실행 가능…CVSS v4.0 9.2

**분야:** 사이버보안
**테마:** 위험·사고
**보조 테마:** 없음
**세부 태그:** 보안 사고
**기업·기관:** 없음

AhnLab ASEC가 2026년 10월 22일 공개한 보안 글은 하루 전 공개된 CVE-2026-109618과 CVE-2026-109619가 PHP 내부 요청 처리 과정에서 발생하며, 인증되지 않은 원격 코드 실행을 허용할 수 있다고 설명했다. PHP 공식 공지에 따르면 CVE-2026-109618은 메모리 부족 처리 중 일부만 초기화된 요청 데이터를 정리할 때, CVE-2026-109619는 메모리 해제 뒤에도 남은 요청 소유 내부 상태를 같은 워커의 후속 요청이 사용할 때 발생할 수 있다. 공식 공지는 두 취약점 모두 인증 없는 원격 코드 실행을 허용할 수 있으며 각각 CVSS v4.0 점수는 9.2이고, 위험도는 mod\_php 환경에서 가장 높다고 밝혔다. 일부 GitHub 저장소는 session.upload\_progress를 공격 경로로 설명하고 PHP 5.4부터 기본 활성화됐다고 적었지만, AhnLab ASEC는 이 내용이 저장소 설명에 근거하며 PHP 공식 공지에서는 확인되지 않았다고 구분했다. [S19] [S29]



## KAIST 라이보2, 배터리 교체 없이 42.195km 로봇 마라톤 완주

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 실증·재현
**기업·기관:** 라이보2(RAIBO2), 황보제민 교수 연구팀

사족보행로봇 라이보2(RAIBO2)가 배터리 교체 없이 42.195km를 완주해 세계 최초 기록을 세웠다. 2026년 9월 28일 등록된 원문은 기계공학과 황보제민 교수 연구팀이 개발한 라이보2의 장거리 주행 기술과 실제 완주 결과가 Nature 본지에 게재됐다고 전하며, 본문은 이를 “24일 밝혔다”고 기록했다. 연구진은 이 기록을 장거리 운용을 위한 설계 원리로 발전시켰으며, 실제 산업 현장에서 사용할 로봇을 제품화할 계획이다. [S30]



## KAIST·파네시아·Meta, ‘하나의 칩처럼 움직이는’ AI 데이터센터 구조 제시

**분야:** 반도체·컴퓨팅
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** 정명수 교수, 파네시아, 메타(Meta)

KAIST는 2026년 9월 9일 전기및전자공학부 정명수 교수 연구진과 교원창업기업 파네시아, Meta 연구진이 함께 제시한 차세대 AI 데이터센터 구조 리뷰 논문이 Nature Reviews Electrical Engineering에 게재됐다고 밝혔다. 논문은 CPU·AI 가속기·메모리를 하나로 묶어 데이터센터 전체가 마치 하나의 거대한 칩처럼 움직이도록 하는 구조를 제시한다. [S31]



## CodeQL, macOS 27·Xcode 27에서 빌드 추적 지원 제한

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** Apple, GitHub

한국시간 2026년 10월 19일 공개된 CodeQL 안내에 따르면 macOS 27과 Xcode 27부터 일부 시스템 바이너리와 라이브러리에서 빌드 추적에 필요한 Intel(x86\_64) 코드가 빠져, CodeQL은 이 운영체제와 개발환경의 traced scan을 지원하지 않고 Swift 6.4도 분석하지 못한다. Xcode 27이 설치되면 C/C++, C\#, Go, Java, Kotlin, Swift의 traced extraction을 사용할 수 없고, macOS 27에서는 같은 언어들의 extraction이 불가능할 수 있다. CodeQL은 Swift 6.4를 모든 플랫폼에서 지원하지 않으며, Intel 기반 Mac 지원은 2026년 12월 중순부터 deprecated 상태로 전환될 예정이다. [S32]

### 워크플로 고정과 대안

Swift 스캔이나 다른 언어의 traced build를 사용하는 경우 macOS 26 이하와 Xcode 26 이하에 워크플로를 고정하라는 안내다. GitHub Actions에서는 최신 버전에 의존하지 말고 runner image와 toolchain을 워크플로에 고정하도록 했다.

C/C++, C\#, Java는 build mode none으로 전환할 수 있으며, 이 모드는 빌드 추적을 요구하지 않는다. [S32]

## SanaHeal, 외상 출혈 막는 생체접착 기술 승인…내년 수술 임상 계획

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 사업·고객
**세부 태그:** 연구 소개, 사업 모델
**기업·기관:** SanaHeal, MIT

MIT 뉴스는 2026년 10월 20일 SanaHeal이 젖고 고르지 않은 생체 조직에 빠르게 붙어 공기와 액체가 새지 않도록 밀봉하는 생체접착 기술을 개발했다고 보도했다. 이 기술은 MIT에서 처음 개발됐다. MIT 뉴스에 따르면 SanaHeal 기술은 외상 출혈을 막는 용도로 이미 규제 승인을 받았으며, 회사는 수술 중 출혈 조절과 여러 손상 조직 수복을 위해 2027년 사람 대상 임상시험에 들어갈 계획이다. SanaHeal은 더 큰 의료기기 기업들과 임상시험·상용화를 위해 협력 중이며, 파트너들은 개복·복강경·내시경 수술과 탈장·신경 복구용 무봉합 이식 제품을 개발하고 있다. [S33]

### 조직 접착과 기존 방식

MIT 기사는 조직을 봉합하거나 붙일 때 쓰는 스테이플과 봉합사가 추가 조직 손상, 면역 반응, 흉터 조직 또는 감염으로 이어질 수 있다고 설명했다. SanaHeal 창립자 겸 CTO Hyunwoo Yuk은 기존 봉합은 조직을 관통해 꿰매므로 수술 중 고통스럽고 완벽히 수행하기 어렵지만, 자사 솔루션은 덜 침습적이며 수술 로봇에서 더 쉽게 쓸 수 있다고 말했다.

Yuk은 하이드로겔이 고분자와 물로 만들어졌고 면역 반응과 흉터 조직 축적을 최소화하는 생체적합성을 가진다고 설명했다. 초기 기술은 폴리아크릴산으로 젖은 조직의 물을 흡수해 수초 안에 붙이는 양면테이프처럼 작동했다. [S33]

### 적용 분야와 사업 방식

Yuk과 협력자들은 처음에는 상처 출혈을 막는 데 기술을 적용하는 데 집중했다가, 수술 응용 분야가 더 많다고 보고 연구 방향을 수술로 옮겼다.

Yuk은 SanaHeal이 처음부터 플랫폼 기업을 지향했으며, 한 번에 10개 제품을 개발할 자원이 부족해 더 큰 기업과 상용화 솔루션을 함께 만든다고 설명했다. [S33]

### 개발 기간

Yuk은 이 기술을 거의 10년간 연구했고 상용화 과정이 예상보다 오래 걸렸다고 말했다. 환자에게 연구실에서 개발한 기술이 영향을 주는 모습을 보는 것이 그 여정을 가치 있게 할 것이라는 발언은 그의 기대를 전한 것이다. [S33]

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

- [S1] https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api
- [S2] https://www.roche.com/media/releases/med-cor-2026-10-16
- [S3] https://www.roche.com/media/releases/med-cor-2026-10-21
- [S4] https://github.blog/changelog/2026-10-15-email-notifications-for-repository-push-events-have-been-retired
- [S5] https://www.roche.com/media/releases/med-cor-2026-10-19
- [S6] https://techcrunch.com/2026/10/26/anthropic-officially-files-for-its-public-debut/
- [S7] https://www.etnews.com/20261027000004
- [S8] https://techcrunch.com/2026/10/26/anthropics-ipo-filing-reveals-its-strategy-for-keeping-enterprise-customers-hooked/
- [S9] https://www.samsungsdi.co.kr/sdi-now/sdi-news/5061.html
- [S10] https://www.thelec.kr/news/articleView.html?idxno=64226
- [S11] https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1968921/full
- [S12] https://www.thelec.kr/news/articleView.html?idxno=64086
- [S13] https://www.fda.gov/news-events/press-announcements/fda-launches-new-program-advance-neuroscience-medical-product-development
- [S14] https://nvidianews.nvidia.com/news/nvidia-advances-isaac-platform-for-general-purpose-robotics-with-new-reference-humanoid-frameworks-simulation-pipelines-and-data
- [S15] https://www.irobotnews.com/news/articleView.html?idxno=49154
- [S16] https://nvidianews.nvidia.com/news/european-ecosystem-builds-worlds-most-efficient-ai-factories-with-nvidia-dsx
- [S17] https://nvidianews.nvidia.com/news/nvidia-and-supply-chain-partners-expand-capacity-to-accelerate-ai-infrastructure-buildout
- [S18] https://nvidianews.nvidia.com/news/european-mobility-leaders-build-safe-vehicles-and-robotaxi-fleets-on-nvidia-hyperion
- [S19] https://asec.ahnlab.com/ko/95955/
- [S20] https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67710&GotoPage=1
- [S21] https://asec.ahnlab.com/ko/95936/
- [S22] https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67310&GotoPage=1
- [S23] https://github.blog/changelog/2026-10-23-usage-metrics-api-adds-usage-from-tools-like-opencode
- [S24] https://aws.amazon.com/about-aws/whats-new/2026/10/lambda-microvms-4-additional-regions
- [S25] https://github.blog/changelog/2026-10-23-public-monitoring-adds-triage-validity-api-and-webhooks
- [S26] https://github.blog/changelog/2026-10-22-public-monitoring-now-available-with-data-residency
- [S27] https://github.blog/changelog/2026-10-23-emu-deletions-fix
- [S28] https://aws.amazon.com/about-aws/whats-new/2026/10/aws-direct-connect-100g-bangalore/
- [S29] https://asec.ahnlab.com/ko/95943/
- [S30] https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67550&GotoPage=1
- [S31] https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=66810&GotoPage=1
- [S32] https://github.blog/changelog/2026-10-19-codeql-changes-for-macos-27-xcode-27-and-swift-6-4
- [S33] https://news.mit.edu/2026/sanaheal-makes-surgical-stitching-more-like-applying-sticky-note-1020
