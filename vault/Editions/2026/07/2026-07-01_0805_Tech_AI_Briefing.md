---
title: Tech & AI Briefing - 08:05
time: 08:05
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-01
timezone: Asia/Seoul
coverage_start: 2026-07-01T00:04:06+09:00
coverage_end: 2026-07-01T08:05:25+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 11
new_items_count: 11
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - "[[Knowledge/AI Systems/AI for Scientific Discovery|AI for Scientific
    Discovery]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
  - Knowledge/Software Engineering/Code Coverage
knowledge_notes_created: []
knowledge_notes_updated: []
briefing_group_format: related-events/v1
briefing_groups:
  - id: github-quality-controls
    title: GitHub의 코드 품질·라이선스 정책
    sector: 소프트웨어·클라우드
    event_ids:
      - a4de6520a9d0e1a1
      - 7f08bb6a05ab97c5
  - id: aws-implementation-guides
    title: AWS의 에이전트 화면·모델 권한·추론 운영
    sector: 소프트웨어·클라우드
    event_ids:
      - bdba36a697d4b5d2
      - f535a00948c7870e
      - e9569f49d8c366f5
headlines:
  - GitHub, Copilot에 Claude Sonnet 5 순차 제공
  - AWS, Bedrock과 Claude Platform에 Sonnet 5 제공
  - NVIDIA, Claude Science의 BioNeMo 연구 도구 연동과 공개 베타 소개
  - Google, Nano Banana 2 Lite 출시·Omni Flash 개발자 공개
  - Google, Gemini Spark macOS 베타 출시
article_records:
  - title: GitHub, Copilot에 Claude Sonnet 5 순차 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-01
      where: GitHub Copilot
      what: Claude Sonnet 5 추가와 순차 제공
      how: 개발 환경별 모델 선택과 조직 모델 정책 설정
      why: 미기재
    lead: GitHub는 2026년 7월 1일(한국시간) Copilot에 Anthropic의 Claude Sonnet 5를 추가했다고 발표했다.
      Pro·Pro+·Max·Business·Enterprise 이용자가 제공 대상이며, 배포는 순차적으로 진행할 예정이다.
    explanations:
      - heading: 모델을 선택할 수 있는 개발 환경
        paragraphs:
          - 모델 선택 화면의 제공 범위에는 Visual Studio Code·Visual Studio·Copilot
            CLI·Copilot cloud agent·Copilot App·github.com·GitHub
            Mobile(iOS·Android)·JetBrains·Xcode·Eclipse가 포함된다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-claude-sonnet-5-is-generally-available-for-github-copilot
      - heading: 조직 설정과 데이터 정책
        paragraphs:
          - Business와 Enterprise 관리자는 Copilot의 모델 정책 설정에서 조직의 Sonnet 5 접근을 활성화할
            수 있다. GitHub는 다른 Sonnet 모델과 마찬가지로 Zero Data Retention(ZDR) 정책을 적용한다고
            설명했다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-claude-sonnet-5-is-generally-available-for-github-copilot
      - heading: 사용량에 따른 과금
        paragraphs:
          - 사용량 기반 과금(Usage Based Billing)에서는 모델 제공자의 공시 가격으로 청구한다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-claude-sonnet-5-is-generally-available-for-github-copilot
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Bedrock과 Claude Platform에 Sonnet 5 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-01
      where: Amazon Bedrock·Claude Platform on AWS
      what: Claude Sonnet 5 제공
      how: 플랫폼별 API·콘솔 접근
      why: 미기재
    lead: AWS는 2026년 7월 1일(한국시간) Anthropic의 Claude Sonnet 5를 Amazon Bedrock과 Claude
      Platform on AWS에서 제공한다고 발표했다. Bedrock에서는 지원 AWS 리전에서, Claude Platform on
      AWS에서는 북미·남미·유럽·아시아태평양에서 사용할 수 있다.
    explanations:
      - heading: AWS 청구·인증과 통합한 Anthropic 플랫폼
        paragraphs:
          - Claude Platform on AWS는 AWS Management Console에서 Anthropic의 네이티브
            API·기능·콘솔 환경을 제공한다. AWS 청구와 인증을 함께 사용할 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-on-aws-anthropics-most-capable-sonnet-model/
      - heading: API와 콘솔에서 모델 사용
        paragraphs:
          - 개발자는 Anthropic Messages API 또는 Bedrock의 Invoke·Converse API로 Sonnet
            5를 호출할 수 있다. Anthropic SDK와 AWS CLI·AWS SDK가 프로그램 접근 도구로 제공된다.
          - Amazon Bedrock 콘솔에서는 Test 메뉴의 Playground를 열어 Claude Sonnet 5를 선택할 수
            있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-on-aws-anthropics-most-capable-sonnet-model/
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, Claude Science의 BioNeMo 연구 도구 연동과 공개 베타 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA, Anthropic
      when: 2026-07-01
      where: 미기재
      what: Claude Science에 BioNeMo Agent Toolkit 통합 및 공개 베타 시작
      how: BioNeMo Agent Toolkit을 Claude Science 워크플로에 리소스로 통합하고, NVIDIA 가속 기능을 호출 가능한
        스킬로 패키징
      why: 미기재
    lead: NVIDIA는 2026년 7월 1일(한국시간) Anthropic의 과학 연구 워크벤치 Claude Science에 BioNeMo
      Agent Toolkit을 연결했다고 밝혔다. 회사는 연구자가 Claude Science의 공개 베타에서 BioNeMo 기반 연구
      작업에 접근할 수 있다고 설명했다.
    explanations:
      - heading: 연구 요청을 계산 도구에 연결
        paragraphs:
          - NVIDIA의 설명에 따르면 연구자가 유전체 서열 분석, 단백질 구조 예측이나 결합 후보 설계 같은 작업을 자연어로
            요청하면, Claude Science가 미리 구성된 분야별 에이전트로 작업을 조정한다. BioNeMo Agent
            Toolkit은 Evo 2·Boltz-2·OpenFold3 같은 가속 모델을 연결한다.
          - 툴킷은 가속 기능을 호출 가능한 스킬로 묶는다. 스킬마다 목적과 필요한 입력을 제공해 도구 선택·입력 준비·실행을 돕고,
            연구자는 반환된 결과를 확인한 뒤 질문을 수정하거나 다음 단계를 결정한다.
        source_urls:
          - https://blogs.nvidia.com/blog/claude-science-bionemo-agent-toolkit/
      - heading: 추론 API와 이용 경로
        paragraphs:
          - BioNeMo NIM은 가속 소프트웨어 스택을 컨테이너 기반 추론 마이크로서비스로 묶고, 에이전트가 호출할 수 있는
            API를 제공한다.
          - NVIDIA는 툴킷과 스킬을 개발자 리소스와 GitHub에서 제공하며, 특정 에이전트 프레임워크에 종속되지 않는다고
            설명했다. Anthropic은 공개 베타를 통해 추가 분야 전문가와 도구 연동에 대한 연구자의 의견을 받고 있다.
        source_urls:
          - https://blogs.nvidia.com/blog/claude-science-bionemo-agent-toolkit/
    papers: []
    relations: []
    topic_ids: []
  - title: Google, Nano Banana 2 Lite 출시·Omni Flash 개발자 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google
      when: 2026-07-01
      where: Google AI Studio·Gemini API·Gemini Enterprise Agent Platform
      what: 이미지 모델 출시와 영상 모델 개발자 접근 확대
      how: 이미지 생성 및 자연어 영상 생성·편집 API
      why: 미기재
    lead: Google은 2026년 7월 1일(한국시간) 이미지 생성 모델 Nano Banana 2 Lite를 출시하고, 기존 Gemini
      Omni Flash의 영상 생성·편집 기능을 개발자에게 공개했다. 두 모델은 Google AI Studio·Gemini
      API·Gemini Enterprise Agent Platform에서 제공하며, Omni Flash는 Google AI Studio와
      Gemini API에서 공개 프리뷰로 이용할 수 있다.
    explanations:
      - heading: 이미지 생성 시간과 가격
        paragraphs:
          - Google이 제시한 Nano Banana 2 Lite의 텍스트-이미지 생성 시간은 4초, 가격은 1K 해상도 이미지당
            0.034달러다.
        source_urls:
          - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/
      - heading: 영상 출력과 API 지원 범위
        paragraphs:
          - Gemini Omni Flash는 자연어로 영상을 생성·수정하는 모델로, 영상 출력 1초당 0.10달러다. 공개 당시에는
            10초 길이의 영상 생성을 제공하며, Gemini API에서 오디오 참조 업로드와 장면 확장은 지원하지 않는다.
          - 3초 이하의 영상 참조는 API 스키마가 허용하지만 당시 모델은 이를 올바르게 처리하지 못한다. Google은 장면 변경과
            카메라 패닝에서 인물 일관성에도 제한이 있다고 밝혔다.
        source_urls:
          - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/
      - heading: 이미지를 영상으로 이어 만드는 방식
        paragraphs:
          - Nano Banana 2 Lite가 만든 이미지를 Omni Flash의 참조로 넘겨 영상으로 만들 수 있다. 여러 차례
            수정하는 작업에서는 Interactions API로 세션 이력과 문맥을 유지한다.
        source_urls:
          - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/
      - heading: 생성 콘텐츠의 워터마크
        paragraphs:
          - 두 모델은 SynthID 워터마킹을 사용한다. Google은 Gemini 앱·Chrome의 Gemini·Search에서
            생성 콘텐츠 확인 기능을 제공한다고 설명했다.
        source_urls:
          - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/
    papers: []
    relations: []
    topic_ids: []
  - title: Google, Gemini Spark macOS 베타 출시
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Google
      when: 2026-07-01
      where: 미국·Gemini macOS 앱
      what: Gemini Spark macOS 베타 제공
      how: 사용자가 허용한 파일과 앱·Google Workspace 연결
      why: 데스크톱 작업 자동화
    lead: Google은 2026년 7월 1일(한국시간) 데스크톱 작업을 자동화하는 Gemini Spark를 Gemini macOS 앱에
      도입했다. 미국에서 18세 이상 Google AI Ultra 구독자에게 베타로 제공한다.
    explanations:
      - heading: 허용한 파일과 Workspace로 작업
        paragraphs:
          - Spark는 사용자가 권한을 준 파일에만 접근한다. Google이 제시한 활용 예시는 Downloads의 PDF를 폴더별로
            분류하거나, 컴퓨터에 저장한 청구서로 예산 스프레드시트를 만들고 정기 갱신 일정을 설정하는 작업이다.
        source_urls:
          - https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/
      - heading: 연결 앱의 제공 일정
        paragraphs:
          - Google Tasks·Keep 연결을 지원하며 Canva·Dropbox·Instacart·OpenTable·Zillow
            Rentals 연결도 발표했다. 새 연결은 웹·모바일에서 발표 뒤 일주일에 걸쳐, macOS에서는 향후 몇 주에 걸쳐 순차
            제공할 예정이다.
          - 사용자 지정 Model Context Protocol(MCP) 연결 지원도 순차적으로 추가한다.
        source_urls:
          - https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/
      - heading: 주제 추적과 원격 실행
        paragraphs:
          - 이메일뿐 아니라 블로그·뉴스·소셜 미디어·금융·쇼핑·날씨·스포츠의 주제를 추적하고 사건에 반응하는 기능을 제공한다.
          - 휴대폰에서 다단계 작업을 지정해 Mac이 원격으로 실행하는 기능은 이후 제공할 예정이다. Google은 Mac의 매출
            보고서를 찾아 금액을 추출하고 이메일로 보내는 작업을 예로 들었다.
        source_urls:
          - https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 커버리지 기준에 따른 PR 병합 보호 공개 프리뷰
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-01
      where: github.com
      what: 코드 커버리지 기반 머지 보호 기능 공개
      how: 브랜치 룰셋을 활용해 테스트 커버리지 임계값 설정 및 평가/활성 모드 전환 지원
      why: 미기재
    lead: GitHub는 2026년 7월 1일(한국시간) 테스트 커버리지 기준을 충족하지 못한 풀 리퀘스트(PR)의 병합을 막는 기능을 공개
      프리뷰로 제공했다. github.com의 GitHub Code Quality 사용자를 대상으로 하며, 브랜치 규칙으로 병합 조건을
      설정한다.
    explanations:
      - heading: 커버리지 기준과 적용 모드
        paragraphs:
          - 최소 커버리지 비율과 기본 브랜치 대비 허용할 최대 감소 폭 중 하나 또는 둘 다 설정할 수 있다. 평가 모드에서 영향을
            먼저 확인한 뒤 활성 모드로 전환해 병합을 차단할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests
      - heading: 제공 대상
        paragraphs:
          - GitHub Code Quality는 GitHub Enterprise Cloud와 Team에서 제공되며, GitHub
            Enterprise Server에서는 제공되지 않는다. 프리뷰 기간에는 무료다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 오픈소스 라이선스 준수 기능 공개 프리뷰 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-01
      where: 미기재
      what: 오픈소스 라이선스 준수 기능 공개 프리뷰 제공
      how: ruleset 기반의 기업 전체 라이선스 정책 적용 및 pull request 자동 검사
      why: 비준수 의존성이 프로덕션에 도달하는 것을 차단하기 위해
    lead: GitHub는 2026년 7월 1일(한국시간) 기업의 오픈소스 라이선스 정책에 맞지 않는 의존성을 PR 병합 전에 차단할 수 있는
      기능을 공개 프리뷰로 제공했다. GitHub Advanced Security Code Security 라이선스를 보유한 GitHub
      Enterprise Cloud 고객이 대상이다.
    explanations:
      - heading: 기업 정책을 PR 검사에 적용
        paragraphs:
          - 기존 dependency review action을 확장해 기업 전체 라이선스 정책을 적용한다. 저장소를 지정하는 규칙에서
            Require license compliance check results before merging 조건을 활성화하면,
            의존성을 추가하거나 수정하는 PR에 정책 검사가 실행되고 비준수 의존성이 표시된다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-open-source-license-compliance-is-in-public-preview
      - heading: 비준수 의존성과 승인 요청 처리
        paragraphs:
          - 표시된 문제는 의존성을 제거하거나 교체하고, 정책을 수정하거나 패키지 예외를 만드는 방법으로 해결해야 한다.
          - 새 역할인 Enterprise Open Source License Policy Manager는 개인이나 팀에 지정할 수
            있다. 정책 관리자는 대기 중인 요청의 이메일 알림을 받고 기업 콘솔에서 종료 요청을 검토·승인한다.
        source_urls:
          - https://github.blog/changelog/2026-06-30-open-source-license-compliance-is-in-public-preview
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, AG-UI로 에이전트와 화면을 연결하는 구현 예제 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-01
      where: AWS 기술 블로그
      what: 구현·운영 지침 공개
      how: 미기재
      why: 미기재
    lead: AWS는 2026년 7월 1일(한국시간) Amazon Bedrock AgentCore에서 AG-UI를 활용하는 구현 지침과
      CopilotKit 예제를 공개했다. 예제는 에이전트가 화면에 차트를 띄우고, 사용자와 작업 상태를 공유하며, 실행 중 사용자 입력을
      받아 작업을 이어가는 구조를 보여준다.
    explanations:
      - heading: 에이전트와 화면 사이의 이벤트 규약
        paragraphs:
          - AG-UI는 에이전트와 사용자 화면을 연결하는 공개 프로토콜이다. Strands·LangGraph·CrewAI 같은
            에이전트 프레임워크와 React·Angular·Vue 같은 화면 라이브러리를 분리해 연결한다.
          - FAST v0.4.1에는 Strands와 LangGraph용 AG-UI 패턴이 추가됐다. 두 패턴은 Server-Sent
            Events(SSE)로 같은 형식의 이벤트를 보내므로, 화면의 공통 파서를 유지하면서 백엔드 프레임워크를 바꿀 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/
      - heading: 화면 구성 요소와 사용자 입력
        paragraphs:
          - 이 예제에서는 화면이 미리 준비한 React 구성 요소를 소유하고, 에이전트가 표시할 구성 요소와 데이터를 선택한다. 차트
            도구는 샘플 CSV에서 데이터를 가져와 AG-UI 도구 호출 이벤트로 전달한다.
          - 할 일 캔버스는 STATE_SNAPSHOT으로 상태를 양방향 동기화하며, 사용자가 직접 바꾼 내용은 다음 에이전트 실행에
            반영된다. 회의 예약 예제는 시간 선택기를 띄운 뒤 실행을 멈추고, 사용자 선택을 TOOL_CALL_RESULT로 받아
            이어간다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/
      - heading: Runtime 인증과 선택형 메모리
        paragraphs:
          - AG-UI 플래그로 컨테이너를 배포하면 AgentCore Runtime은 프록시로 동작하면서 인증·세션 격리·확장·관측을
            처리한다. FAST의 두 패턴에서 AgentCore Memory는 선택 사항이며, MEMORY_ID를 설정하지 않으면
            메모리를 별도로 준비하지 않고 실행할 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Bedrock 모델 구독을 여러 계정에 배포하는 절차 설명
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-01
      where: AWS 기술 블로그
      what: 구현·운영 지침 공개
      how: 미기재
      why: 미기재
    lead: AWS는 2026년 7월 1일(한국시간) Bedrock의 managed entitlements를 이용해 중앙 계정의 모델 구독을 조직
      내 여러 계정에 배포하는 지침을 공개했다. 대상은 Claude·Cohere 같은 AWS Marketplace의 외부 모델이며,
      Amazon 모델과 Amazon이 판매하는 모델은 Bedrock 권한으로 접근하는 방식이 적용된다.
    explanations:
      - heading: 구독·배포·활성화
        paragraphs:
          - 절차는 관리 계정에서 모델 구독, 자동 생성된 라이선스 확인, 구성원 계정에 대한 grant 생성, 구성원 계정의 활성화
            순서다. AWS Organizations의 모든 기능 활성화와 관리 계정의 Marketplace·License
            Manager 권한, 두 서비스의 서비스 연결 역할이 필요하다.
          - 조직의 모든 기능을 활성화하면 grant는 자동 수락되지만 Disabled 상태로 남는다. 구성원 계정의 관리자가 직접
            활성화해야 한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-multi-account-access-to-amazon-bedrock-models-with-managed-entitlements/
      - heading: 청구 계정과 관리 리전
        paragraphs:
          - 모델 사용료는 구독을 보유한 관리 계정에 청구된다. 라이선스와 grant의 생성·활성화는 License Manager의
            us-east-1 엔드포인트에서 수행하며, 모델 호출은 지원되는 다른 리전에서도 할 수 있다.
          - 구성원 계정은 private offer 구독이나 활성화한 grant 없이도 모델을 호출할 수 있으나, 이 경우 공개 요금이
            청구된다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-multi-account-access-to-amazon-bedrock-models-with-managed-entitlements/
      - heading: 기존 구독과 해지 처리
        paragraphs:
          - 이미 같은 모델의 구독 권한을 가진 구성원 계정에 결제 계정이 새 구독을 배포하면, 기존 구독의 entitlement는
            비활성화되고 배포된 grant의 권한을 사용한다.
          - 구독을 취소해도 grant는 자동 삭제되지 않는다. private pricing 적용을 철회하려면 grant를 따로
            삭제해야 한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-multi-account-access-to-amazon-bedrock-models-with-managed-entitlements/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Bedrock 추론의 분산·대체 모델·계정 격리 패턴 정리
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-01
      where: AWS 기술 블로그
      what: 구현·운영 지침 공개
      how: 미기재
      why: 미기재
    lead: AWS는 2026년 7월 1일(한국시간) Bedrock 추론의 지역 분산·계정 분할·모델 전환·부하 분산·테넌트 할당량 격리를 다룬
      구현 지침을 공개했다. Bedrock의 기본 기능과 여러 모델을 연결하는 LLM gateway를 구분하고, 각 패턴의 구성 방법과
      데모를 제시했다.
    explanations:
      - heading: 지역 분산과 계정 분할
        paragraphs:
          - Cross-Region inference(CRIS)는 모델 트래픽을 분산하고 단일 리전의 할당량을 넘어 처리량을 확보하는
            방식이다. 모델에 따라 여러 리전으로 동적으로 배분하거나 고정된 추론 리전을 사용하며, 모델·공급자 장애에 대한
            failover나 재해 복구 기능은 아니다.
          - 계정 분할은 각각 독립적인 할당량과 CRIS 프로파일을 가진 여러 AWS 계정에 요청을 나누는 방식이다. AWS는 계정별
            경계를 이용한 작업 격리를 설명했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/
      - heading: 대체 모델로 전환하는 조건
        paragraphs:
          - LLM gateway는 여러 공급자의 모델을 공통 API로 연결하고 재시도·대체 모델 전환·할당량 관리·감사 로그를
            처리하는 프록시다. 주 모델의 요청 제한이나 장애를 기준으로 보조 모델에 전환하는 패턴은, 품질과 비용에 따라 모델을
            선택하는 Bedrock Intelligent Prompt Routing과 구분된다.
          - AWS의 LiteLLM 데모는 주 모델을 분당 3건, 대체 모델을 분당 25건으로 제한하고 동시 요청 10건을 보냈다. 주
            모델이 3건을 처리한 뒤 나머지 7건은 대체 모델로 전환됐으며, 데모의 10건은 모두 완료됐다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/
      - heading: 부하 분산과 사용자별 할당량
        paragraphs:
          - 부하 분산은 여러 모델 인스턴스로 요청을 나누는 방식이다. 지침은 기존 모델로 대부분의 요청을 보내면서 새 모델에 일부만
            보내는 가중 라우팅과 A/B 테스트를 설명한다. 테넌트 격리는 사용자별로 독립적인 요청 제한을 두어 한 사용자의 할당량
            소진이 다른 사용자의 배정량을 소비하지 않게 한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/
      - heading: 데모와 운영용 참조 구성
        paragraphs:
          - AWS의 운영용 Multi-Provider Generative AI Gateway 참조 구현은 LiteLLM에
            ECS·EKS 컨테이너 배포, 자동 확장, AWS WAF, 비밀정보 관리, CloudWatch 관측 기능을 더한 구조다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/
    papers: []
    relations: []
    topic_ids: []
  - title: ScarfBench, Java 프레임워크 이전을 빌드·배포·동작으로 평가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: ScarfBench 개발진
      when: 2026-07-01
      where: 미기재
      what: 엔터프라이즈 자바 프레임워크 마이그레이션 평가 벤치마크 ScarfBench 공개
      how: Spring, Jakarta EE, Quarkus 간 마이그레이션 작업에서 빌드, 배포, 동작 보존을 검증하는 오픈 벤치마크로 설계
      why: 미기재
    lead: ScarfBench 개발진은 2026년 7월 1일(한국시간) 엔터프라이즈 Java 프레임워크 간 이전 작업을 수행하는 AI 에이전트의
      공개 평가 도구 ScarfBench를 소개했다. 변환된 애플리케이션이 빌드되고 배포되며 기존 동작을 유지하는지를 평가한다.
    explanations:
      - heading: 이전 작업과 평가 범위
        paragraphs:
          - Spring·Jakarta EE·Quarkus 간 이전을 대상으로 개별 작업과 전체 애플리케이션 이전을 다룬다. 개발진은
            JSR 기반 엔터프라이즈 Java 분류 체계에서 출발해, 전문가가 프레임워크별로 이전한 검증 구현을 만들었다고 설명했다.
        source_urls:
          - https://huggingface.co/blog/ibm-research/scarfbench
      - heading: 자체 성공 보고와 독립 빌드 검증
        paragraphs:
          - 개발진의 평가에서 Claude Code는 전체 애플리케이션 30개 중 29개의 빌드 성공을 보고했다. 성공했다고 보고한
            29개 중 실제로 빌드에 성공한 것은 22개였으며, 에이전트가 실패로 분류한 애플리케이션 하나는 최종적으로 빌드에
            성공했다.
        source_urls:
          - https://huggingface.co/blog/ibm-research/scarfbench
      - heading: 작업 경로와 환경 문제
        paragraphs:
          - 개발진은 Configuration·Web·Database·Service 계층을 가장 자주 방문했으며,
            Configuration과 Web, Service와 Database 사이의 이동이 흔했다고 보고했다.
          - Docker 캐시 불일치, 포트 연결, Maven wrapper와 빌드 도구 문제도 관찰했다. 개발진은 이런 환경 문제가
            소스 코드 이전이 상당 부분 완료된 경우에도 검증을 지연시키곤 했다고 설명했다.
        source_urls:
          - https://huggingface.co/blog/ibm-research/scarfbench
      - heading: 공개 자료
        paragraphs:
          - 공개 자원에는 벤치마크 데이터셋·평가 인프라·리더보드·문서·오픈소스 코드가 포함된다.
        source_urls:
          - https://huggingface.co/blog/ibm-research/scarfbench
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub, Copilot에 Claude Sonnet 5 순차 제공
    event_id: 5ff450f1bd547f3e
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T10:25:51-07:00
  - title: AWS, Bedrock과 Claude Platform에 Sonnet 5 제공
    event_id: d396cbbb60fa5355
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T10:40:09-08:00
  - title: NVIDIA, Claude Science의 BioNeMo 연구 도구 연동과 공개 베타 소개
    event_id: f1b1af2379f935af
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T17:00:38+00:00
  - title: Google, Nano Banana 2 Lite 출시·Omni Flash 개발자 공개
    event_id: 51316e8a2b80cf8a
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T16:00:00+00:00
  - title: Google, Gemini Spark macOS 베타 출시
    event_id: cfac3368216d4743
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T21:00:00+00:00
  - title: GitHub, 커버리지 기준에 따른 PR 병합 보호 공개 프리뷰
    event_id: a4de6520a9d0e1a1
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids:
      - code-coverage
    date_kind: source-publication-time
    source_published_at: 2026-06-30T09:42:21-07:00
  - title: GitHub, 오픈소스 라이선스 준수 기능 공개 프리뷰 제공
    event_id: 7f08bb6a05ab97c5
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T09:00:17-07:00
  - title: AWS, AG-UI로 에이전트와 화면을 연결하는 구현 예제 공개
    event_id: bdba36a697d4b5d2
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T08:46:17-08:00
  - title: AWS, Bedrock 모델 구독을 여러 계정에 배포하는 절차 설명
    event_id: f535a00948c7870e
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T08:42:49-08:00
  - title: AWS, Bedrock 추론의 분산·대체 모델·계정 격리 패턴 정리
    event_id: e9569f49d8c366f5
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T08:40:47-08:00
  - title: ScarfBench, Java 프레임워크 이전을 빌드·배포·동작으로 평가
    event_id: d2b47e5ca2b10e4d
    review_status: verified
    published_at: 2026-07-01
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-30T18:32:50.094Z
---

# 이번 호 표지

GitHub, Copilot에 Claude Sonnet 5 순차 제공

# 차례

- GitHub, Copilot에 Claude Sonnet 5 순차 제공
- AWS, Bedrock과 Claude Platform에 Sonnet 5 제공
- NVIDIA, Claude Science의 BioNeMo 연구 도구 연동과 공개 베타 소개
- Google, Nano Banana 2 Lite 출시·Omni Flash 개발자 공개
- Google, Gemini Spark macOS 베타 출시

# 커버 스토리

없음

# 뉴스 데스크

## GitHub, Copilot에 Claude Sonnet 5 순차 제공

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub, Anthropic

GitHub는 2026년 7월 1일(한국시간) Copilot에 Anthropic의 Claude Sonnet 5를 추가했다고 발표했다. Pro·Pro+·Max·Business·Enterprise 이용자가 제공 대상이며, 배포는 순차적으로 진행할 예정이다. [S1]

### 모델을 선택할 수 있는 개발 환경

모델 선택 화면의 제공 범위에는 Visual Studio Code·Visual Studio·Copilot CLI·Copilot cloud agent·Copilot App·github.com·GitHub Mobile(iOS·Android)·JetBrains·Xcode·Eclipse가 포함된다. [S1]

### 조직 설정과 데이터 정책

Business와 Enterprise 관리자는 Copilot의 모델 정책 설정에서 조직의 Sonnet 5 접근을 활성화할 수 있다. GitHub는 다른 Sonnet 모델과 마찬가지로 Zero Data Retention(ZDR) 정책을 적용한다고 설명했다. [S1]

### 사용량에 따른 과금

사용량 기반 과금(Usage Based Billing)에서는 모델 제공자의 공시 가격으로 청구한다. [S1]

## AWS, Bedrock과 Claude Platform에 Sonnet 5 제공

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** AWS, Anthropic

AWS는 2026년 7월 1일(한국시간) Anthropic의 Claude Sonnet 5를 Amazon Bedrock과 Claude Platform on AWS에서 제공한다고 발표했다. Bedrock에서는 지원 AWS 리전에서, Claude Platform on AWS에서는 북미·남미·유럽·아시아태평양에서 사용할 수 있다. [S2]

### AWS 청구·인증과 통합한 Anthropic 플랫폼

Claude Platform on AWS는 AWS Management Console에서 Anthropic의 네이티브 API·기능·콘솔 환경을 제공한다. AWS 청구와 인증을 함께 사용할 수 있다. [S2]

### API와 콘솔에서 모델 사용

개발자는 Anthropic Messages API 또는 Bedrock의 Invoke·Converse API로 Sonnet 5를 호출할 수 있다. Anthropic SDK와 AWS CLI·AWS SDK가 프로그램 접근 도구로 제공된다.

Amazon Bedrock 콘솔에서는 Test 메뉴의 Playground를 열어 Claude Sonnet 5를 선택할 수 있다. [S2]

## NVIDIA, Claude Science의 BioNeMo 연구 도구 연동과 공개 베타 소개

**분야:** 바이오·의료기술
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** NVIDIA, Anthropic

NVIDIA는 2026년 7월 1일(한국시간) Anthropic의 과학 연구 워크벤치 Claude Science에 BioNeMo Agent Toolkit을 연결했다고 밝혔다. 회사는 연구자가 Claude Science의 공개 베타에서 BioNeMo 기반 연구 작업에 접근할 수 있다고 설명했다. [S3]

### 연구 요청을 계산 도구에 연결

NVIDIA의 설명에 따르면 연구자가 유전체 서열 분석, 단백질 구조 예측이나 결합 후보 설계 같은 작업을 자연어로 요청하면, Claude Science가 미리 구성된 분야별 에이전트로 작업을 조정한다. BioNeMo Agent Toolkit은 Evo 2·Boltz-2·OpenFold3 같은 가속 모델을 연결한다.

툴킷은 가속 기능을 호출 가능한 스킬로 묶는다. 스킬마다 목적과 필요한 입력을 제공해 도구 선택·입력 준비·실행을 돕고, 연구자는 반환된 결과를 확인한 뒤 질문을 수정하거나 다음 단계를 결정한다. [S3]

### 추론 API와 이용 경로

BioNeMo NIM은 가속 소프트웨어 스택을 컨테이너 기반 추론 마이크로서비스로 묶고, 에이전트가 호출할 수 있는 API를 제공한다.

NVIDIA는 툴킷과 스킬을 개발자 리소스와 GitHub에서 제공하며, 특정 에이전트 프레임워크에 종속되지 않는다고 설명했다. Anthropic은 공개 베타를 통해 추가 분야 전문가와 도구 연동에 대한 연구자의 의견을 받고 있다. [S3]

## Google, Nano Banana 2 Lite 출시·Omni Flash 개발자 공개

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품, 기능 추가
**기업·기관:** Google

Google은 2026년 7월 1일(한국시간) 이미지 생성 모델 Nano Banana 2 Lite를 출시하고, 기존 Gemini Omni Flash의 영상 생성·편집 기능을 개발자에게 공개했다. 두 모델은 Google AI Studio·Gemini API·Gemini Enterprise Agent Platform에서 제공하며, Omni Flash는 Google AI Studio와 Gemini API에서 공개 프리뷰로 이용할 수 있다. [S4]

### 이미지 생성 시간과 가격

Google이 제시한 Nano Banana 2 Lite의 텍스트-이미지 생성 시간은 4초, 가격은 1K 해상도 이미지당 0.034달러다. [S4]

### 영상 출력과 API 지원 범위

Gemini Omni Flash는 자연어로 영상을 생성·수정하는 모델로, 영상 출력 1초당 0.10달러다. 공개 당시에는 10초 길이의 영상 생성을 제공하며, Gemini API에서 오디오 참조 업로드와 장면 확장은 지원하지 않는다.

3초 이하의 영상 참조는 API 스키마가 허용하지만 당시 모델은 이를 올바르게 처리하지 못한다. Google은 장면 변경과 카메라 패닝에서 인물 일관성에도 제한이 있다고 밝혔다. [S4]

### 이미지를 영상으로 이어 만드는 방식

Nano Banana 2 Lite가 만든 이미지를 Omni Flash의 참조로 넘겨 영상으로 만들 수 있다. 여러 차례 수정하는 작업에서는 Interactions API로 세션 이력과 문맥을 유지한다. [S4]

### 생성 콘텐츠의 워터마크

두 모델은 SynthID 워터마킹을 사용한다. Google은 Gemini 앱·Chrome의 Gemini·Search에서 생성 콘텐츠 확인 기능을 제공한다고 설명했다. [S4]

## Google, Gemini Spark macOS 베타 출시

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Google

Google은 2026년 7월 1일(한국시간) 데스크톱 작업을 자동화하는 Gemini Spark를 Gemini macOS 앱에 도입했다. 미국에서 18세 이상 Google AI Ultra 구독자에게 베타로 제공한다. [S5]

### 허용한 파일과 Workspace로 작업

Spark는 사용자가 권한을 준 파일에만 접근한다. Google이 제시한 활용 예시는 Downloads의 PDF를 폴더별로 분류하거나, 컴퓨터에 저장한 청구서로 예산 스프레드시트를 만들고 정기 갱신 일정을 설정하는 작업이다. [S5]

### 연결 앱의 제공 일정

Google Tasks·Keep 연결을 지원하며 Canva·Dropbox·Instacart·OpenTable·Zillow Rentals 연결도 발표했다. 새 연결은 웹·모바일에서 발표 뒤 일주일에 걸쳐, macOS에서는 향후 몇 주에 걸쳐 순차 제공할 예정이다.

사용자 지정 Model Context Protocol(MCP) 연결 지원도 순차적으로 추가한다. [S5]

### 주제 추적과 원격 실행

이메일뿐 아니라 블로그·뉴스·소셜 미디어·금융·쇼핑·날씨·스포츠의 주제를 추적하고 사건에 반응하는 기능을 제공한다.

휴대폰에서 다단계 작업을 지정해 Mac이 원격으로 실행하는 기능은 이후 제공할 예정이다. Google은 Mac의 매출 보고서를 찾아 금액을 추출하고 이메일로 보내는 작업을 예로 들었다. [S5]

## GitHub, 커버리지 기준에 따른 PR 병합 보호 공개 프리뷰

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 7월 1일(한국시간) 테스트 커버리지 기준을 충족하지 못한 풀 리퀘스트(PR)의 병합을 막는 기능을 공개 프리뷰로 제공했다. github.com의 GitHub Code Quality 사용자를 대상으로 하며, 브랜치 규칙으로 병합 조건을 설정한다. [S6]

### 커버리지 기준과 적용 모드

최소 커버리지 비율과 기본 브랜치 대비 허용할 최대 감소 폭 중 하나 또는 둘 다 설정할 수 있다. 평가 모드에서 영향을 먼저 확인한 뒤 활성 모드로 전환해 병합을 차단할 수 있다. [S6]

### 제공 대상

GitHub Code Quality는 GitHub Enterprise Cloud와 Team에서 제공되며, GitHub Enterprise Server에서는 제공되지 않는다. 프리뷰 기간에는 무료다. [S6]

**개념:** [[Knowledge/Software Engineering/Code Coverage]]

## GitHub, 오픈소스 라이선스 준수 기능 공개 프리뷰 제공

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 7월 1일(한국시간) 기업의 오픈소스 라이선스 정책에 맞지 않는 의존성을 PR 병합 전에 차단할 수 있는 기능을 공개 프리뷰로 제공했다. GitHub Advanced Security Code Security 라이선스를 보유한 GitHub Enterprise Cloud 고객이 대상이다. [S7]

### 기업 정책을 PR 검사에 적용

기존 dependency review action을 확장해 기업 전체 라이선스 정책을 적용한다. 저장소를 지정하는 규칙에서 Require license compliance check results before merging 조건을 활성화하면, 의존성을 추가하거나 수정하는 PR에 정책 검사가 실행되고 비준수 의존성이 표시된다. [S7]

### 비준수 의존성과 승인 요청 처리

표시된 문제는 의존성을 제거하거나 교체하고, 정책을 수정하거나 패키지 예외를 만드는 방법으로 해결해야 한다.

새 역할인 Enterprise Open Source License Policy Manager는 개인이나 팀에 지정할 수 있다. 정책 관리자는 대기 중인 요청의 이메일 알림을 받고 기업 콘솔에서 종료 요청을 검토·승인한다. [S7]

## AWS, AG-UI로 에이전트와 화면을 연결하는 구현 예제 공개

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** AWS

AWS는 2026년 7월 1일(한국시간) Amazon Bedrock AgentCore에서 AG-UI를 활용하는 구현 지침과 CopilotKit 예제를 공개했다. 예제는 에이전트가 화면에 차트를 띄우고, 사용자와 작업 상태를 공유하며, 실행 중 사용자 입력을 받아 작업을 이어가는 구조를 보여준다. [S8]

### 에이전트와 화면 사이의 이벤트 규약

AG-UI는 에이전트와 사용자 화면을 연결하는 공개 프로토콜이다. Strands·LangGraph·CrewAI 같은 에이전트 프레임워크와 React·Angular·Vue 같은 화면 라이브러리를 분리해 연결한다.

FAST v0.4.1에는 Strands와 LangGraph용 AG-UI 패턴이 추가됐다. 두 패턴은 Server-Sent Events(SSE)로 같은 형식의 이벤트를 보내므로, 화면의 공통 파서를 유지하면서 백엔드 프레임워크를 바꿀 수 있다. [S8]

### 화면 구성 요소와 사용자 입력

이 예제에서는 화면이 미리 준비한 React 구성 요소를 소유하고, 에이전트가 표시할 구성 요소와 데이터를 선택한다. 차트 도구는 샘플 CSV에서 데이터를 가져와 AG-UI 도구 호출 이벤트로 전달한다.

할 일 캔버스는 STATE\_SNAPSHOT으로 상태를 양방향 동기화하며, 사용자가 직접 바꾼 내용은 다음 에이전트 실행에 반영된다. 회의 예약 예제는 시간 선택기를 띄운 뒤 실행을 멈추고, 사용자 선택을 TOOL\_CALL\_RESULT로 받아 이어간다. [S8]

### Runtime 인증과 선택형 메모리

AG-UI 플래그로 컨테이너를 배포하면 AgentCore Runtime은 프록시로 동작하면서 인증·세션 격리·확장·관측을 처리한다. FAST의 두 패턴에서 AgentCore Memory는 선택 사항이며, MEMORY\_ID를 설정하지 않으면 메모리를 별도로 준비하지 않고 실행할 수 있다. [S8]

## AWS, Bedrock 모델 구독을 여러 계정에 배포하는 절차 설명

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** AWS

AWS는 2026년 7월 1일(한국시간) Bedrock의 managed entitlements를 이용해 중앙 계정의 모델 구독을 조직 내 여러 계정에 배포하는 지침을 공개했다. 대상은 Claude·Cohere 같은 AWS Marketplace의 외부 모델이며, Amazon 모델과 Amazon이 판매하는 모델은 Bedrock 권한으로 접근하는 방식이 적용된다. [S9]

### 구독·배포·활성화

절차는 관리 계정에서 모델 구독, 자동 생성된 라이선스 확인, 구성원 계정에 대한 grant 생성, 구성원 계정의 활성화 순서다. AWS Organizations의 모든 기능 활성화와 관리 계정의 Marketplace·License Manager 권한, 두 서비스의 서비스 연결 역할이 필요하다.

조직의 모든 기능을 활성화하면 grant는 자동 수락되지만 Disabled 상태로 남는다. 구성원 계정의 관리자가 직접 활성화해야 한다. [S9]

### 청구 계정과 관리 리전

모델 사용료는 구독을 보유한 관리 계정에 청구된다. 라이선스와 grant의 생성·활성화는 License Manager의 us-east-1 엔드포인트에서 수행하며, 모델 호출은 지원되는 다른 리전에서도 할 수 있다.

구성원 계정은 private offer 구독이나 활성화한 grant 없이도 모델을 호출할 수 있으나, 이 경우 공개 요금이 청구된다. [S9]

### 기존 구독과 해지 처리

이미 같은 모델의 구독 권한을 가진 구성원 계정에 결제 계정이 새 구독을 배포하면, 기존 구독의 entitlement는 비활성화되고 배포된 grant의 권한을 사용한다.

구독을 취소해도 grant는 자동 삭제되지 않는다. private pricing 적용을 철회하려면 grant를 따로 삭제해야 한다. [S9]

## AWS, Bedrock 추론의 분산·대체 모델·계정 격리 패턴 정리

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** AWS

AWS는 2026년 7월 1일(한국시간) Bedrock 추론의 지역 분산·계정 분할·모델 전환·부하 분산·테넌트 할당량 격리를 다룬 구현 지침을 공개했다. Bedrock의 기본 기능과 여러 모델을 연결하는 LLM gateway를 구분하고, 각 패턴의 구성 방법과 데모를 제시했다. [S10]

### 지역 분산과 계정 분할

Cross-Region inference(CRIS)는 모델 트래픽을 분산하고 단일 리전의 할당량을 넘어 처리량을 확보하는 방식이다. 모델에 따라 여러 리전으로 동적으로 배분하거나 고정된 추론 리전을 사용하며, 모델·공급자 장애에 대한 failover나 재해 복구 기능은 아니다.

계정 분할은 각각 독립적인 할당량과 CRIS 프로파일을 가진 여러 AWS 계정에 요청을 나누는 방식이다. AWS는 계정별 경계를 이용한 작업 격리를 설명했다. [S10]

### 대체 모델로 전환하는 조건

LLM gateway는 여러 공급자의 모델을 공통 API로 연결하고 재시도·대체 모델 전환·할당량 관리·감사 로그를 처리하는 프록시다. 주 모델의 요청 제한이나 장애를 기준으로 보조 모델에 전환하는 패턴은, 품질과 비용에 따라 모델을 선택하는 Bedrock Intelligent Prompt Routing과 구분된다.

AWS의 LiteLLM 데모는 주 모델을 분당 3건, 대체 모델을 분당 25건으로 제한하고 동시 요청 10건을 보냈다. 주 모델이 3건을 처리한 뒤 나머지 7건은 대체 모델로 전환됐으며, 데모의 10건은 모두 완료됐다. [S10]

### 부하 분산과 사용자별 할당량

부하 분산은 여러 모델 인스턴스로 요청을 나누는 방식이다. 지침은 기존 모델로 대부분의 요청을 보내면서 새 모델에 일부만 보내는 가중 라우팅과 A/B 테스트를 설명한다. 테넌트 격리는 사용자별로 독립적인 요청 제한을 두어 한 사용자의 할당량 소진이 다른 사용자의 배정량을 소비하지 않게 한다. [S10]

### 데모와 운영용 참조 구성

AWS의 운영용 Multi-Provider Generative AI Gateway 참조 구현은 LiteLLM에 ECS·EKS 컨테이너 배포, 자동 확장, AWS WAF, 비밀정보 관리, CloudWatch 관측 기능을 더한 구조다. [S10]

## ScarfBench, Java 프레임워크 이전을 빌드·배포·동작으로 평가

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개, 새로운 방법
**기업·기관:** ScarfBench

ScarfBench 개발진은 2026년 7월 1일(한국시간) 엔터프라이즈 Java 프레임워크 간 이전 작업을 수행하는 AI 에이전트의 공개 평가 도구 ScarfBench를 소개했다. 변환된 애플리케이션이 빌드되고 배포되며 기존 동작을 유지하는지를 평가한다. [S11]

### 이전 작업과 평가 범위

Spring·Jakarta EE·Quarkus 간 이전을 대상으로 개별 작업과 전체 애플리케이션 이전을 다룬다. 개발진은 JSR 기반 엔터프라이즈 Java 분류 체계에서 출발해, 전문가가 프레임워크별로 이전한 검증 구현을 만들었다고 설명했다. [S11]

### 자체 성공 보고와 독립 빌드 검증

개발진의 평가에서 Claude Code는 전체 애플리케이션 30개 중 29개의 빌드 성공을 보고했다. 성공했다고 보고한 29개 중 실제로 빌드에 성공한 것은 22개였으며, 에이전트가 실패로 분류한 애플리케이션 하나는 최종적으로 빌드에 성공했다. [S11]

### 작업 경로와 환경 문제

개발진은 Configuration·Web·Database·Service 계층을 가장 자주 방문했으며, Configuration과 Web, Service와 Database 사이의 이동이 흔했다고 보고했다.

Docker 캐시 불일치, 포트 연결, Maven wrapper와 빌드 도구 문제도 관찰했다. 개발진은 이런 환경 문제가 소스 코드 이전이 상당 부분 완료된 경우에도 검증을 지연시키곤 했다고 설명했다. [S11]

### 공개 자료

공개 자원에는 벤치마크 데이터셋·평가 인프라·리더보드·문서·오픈소스 코드가 포함된다. [S11]

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

- [S1] https://github.blog/changelog/2026-06-30-claude-sonnet-5-is-generally-available-for-github-copilot
- [S2] https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-on-aws-anthropics-most-capable-sonnet-model/
- [S3] https://blogs.nvidia.com/blog/claude-science-bionemo-agent-toolkit/
- [S4] https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/
- [S5] https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/
- [S6] https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests
- [S7] https://github.blog/changelog/2026-06-30-open-source-license-compliance-is-in-public-preview
- [S8] https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/
- [S9] https://aws.amazon.com/blogs/machine-learning/simplify-multi-account-access-to-amazon-bedrock-models-with-managed-entitlements/
- [S10] https://aws.amazon.com/blogs/machine-learning/implementing-resilience-patterns-with-amazon-bedrock-and-llm-gateway/
- [S11] https://huggingface.co/blog/ibm-research/scarfbench
