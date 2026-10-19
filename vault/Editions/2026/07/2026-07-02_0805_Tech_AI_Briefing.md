---
title: Tech & AI Briefing - 08:05
time: 08:05
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-02
timezone: Asia/Seoul
coverage_start: 2026-07-02T00:04:30+09:00
coverage_end: 2026-07-02T08:05:09+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 9
new_items_count: 6
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented
    Generation]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - "[[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]"
  - "[[Knowledge/AI Systems/AI Content Access and Monetization|AI Content Access
    and Monetization]]"
  - Knowledge/AI Systems/Metadata Filtering
  - Knowledge/AI Systems/x402
knowledge_notes_created: []
knowledge_notes_updated: []
briefing_group_format: related-events/v1
briefing_groups:
  - id: aws-agent-routing-memory
    title: AWS의 에이전트 연결과 기억 검색
    sector: 소프트웨어·클라우드
    event_ids:
      - 8cd92561a8c8a996
      - 51a5467090ea3ba3
headlines:
  - AWS, GovCloud Bedrock에 GPT OSS·Nemotron 모델 제공
  - AWS, A2A 게이트웨이 참조 구현 공개…검색·권한·라우팅 통합
  - "AWS가 설명한 AgentCore Memory 검색: 속성 조건으로 기억 후보를 먼저 좁힌다"
  - Cloudflare, AI 크롤러 제어 확대…9월 차단 정책·콘텐츠 과금 계획 공개
  - AWS, Bedrock 모델 사양·가격·지역을 비교하는 오픈소스 Model Profiler 소개
article_records:
  - title: AWS, GovCloud Bedrock에 GPT OSS·Nemotron 모델 제공
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-02
      where: AWS GovCloud(US)
      what: Amazon Bedrock에서 OpenAI GPT OSS·NVIDIA Nemotron 오픈웨이트 모델 제공
      how: bedrock-mantle 또는 bedrock-runtime API로 호출
      why: 미기재
    lead: AWS는 7월 2일(한국시간) Amazon Bedrock의 AWS GovCloud(US)에서 OpenAI GPT OSS와 NVIDIA
      Nemotron 오픈웨이트 모델을 제공한다고 발표했다. AWS는 이 모델의 추론이 미국 시민이 미국 영토에서 운영하는 인프라를 통해
      GovCloud 격리 경계 안에서 수행된다고 설명했다.
    explanations:
      - heading: 제공 모델과 GPT OSS 사양
        paragraphs:
          - 제공 목록에는 OpenAI gpt-oss-120b·gpt-oss-20b와 NVIDIA Nemotron Nano 9B
            v2·Nano 12B v2·Nano 30B·Super 120B가 포함된다.
          - AWS가 소개한 GPT OSS 두 모델은 텍스트를 입력받아 텍스트를 생성하며, 128K 토큰의 컨텍스트 창과 최대 16K
            토큰 출력을 지원한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-nvidia-nemotron-and-openai-gpt-oss-models-on-amazon-bedrock-in-aws-govcloud-us/
      - heading: 단일 리전과 GovCloud 내 교차 리전
        paragraphs:
          - AWS에 따르면 단일 리전 추론은 us-gov-west-1에서 제공된다. 지리적 교차 리전 추론은
            us-gov-west-1과 us-gov-east-1 사이로 요청을 분산하며, 트래픽은 GovCloud(US) 경계 안에
            유지된다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-nvidia-nemotron-and-openai-gpt-oss-models-on-amazon-bedrock-in-aws-govcloud-us/
      - heading: 호출 API와 모델별 차이
        paragraphs:
          - bedrock-mantle은 OpenAI 호환 API로 OpenAI Python·TypeScript SDK와 함께
            사용한다. bedrock-runtime은 AWS SDK를 통해 Converse·InvokeModel API를 호출하며
            Guardrails 같은 Bedrock 고유 기능을 제공한다.
          - GPT OSS는 Responses API를 지원한다. 반면 Nemotron 3 Super 120B는 이 API를 지원하지
            않으며 Chat Completions·Converse·Invoke를 사용한다.
          - bedrock-mantle에서 GPT OSS는 클라이언트 측·서버 측 도구 호출을 모두 지원하고, Nemotron 3
            Super 120B는 클라이언트 측 도구 호출만 지원한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-nvidia-nemotron-and-openai-gpt-oss-models-on-amazon-bedrock-in-aws-govcloud-us/
      - heading: 접근 자격과 호출 조건
        paragraphs:
          - bedrock-mantle을 이용하려면 Bedrock 모델 호출 권한이 있는 GovCloud(US) 계정과 Bedrock
            API 키 또는 일반 AWS 자격 증명이 필요하다.
          - AWS는 Standard 티어의 온디맨드 용량이 리전별 공유 자원이며, 보도자료의 오픈웨이트 모델에 대해 Service
            Quotas 콘솔에 계정별 토큰 쿼터가 게시되어 있지 않다고 설명했다.
          - 단기 Bedrock API 키는 최대 12시간 후 자동으로 만료된다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-nvidia-nemotron-and-openai-gpt-oss-models-on-amazon-bedrock-in-aws-govcloud-us/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, A2A 게이트웨이 참조 구현 공개…검색·권한·라우팅 통합
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-02
      where: 미기재
      what: 서버리스 A2A 게이트웨이 참조 구현 가이드 공개
      how: 단일 도메인 경로 기반 라우팅, 3계층 아키텍처(관리/제어/실행), JWT/IAM 기반 접근 제어, DynamoDB 기반 레이트
        리미팅, VPC 프라이빗 배포 옵션, Titan Text Embeddings 기반 시맨틱 검색
      why: 미기재
    lead: AWS는 7월 2일(한국시간) 여러 에이전트를 단일 도메인과 경로 기반 라우팅으로 연결하는 서버리스 A2A 게이트웨이 참조 구현
      가이드를 공개했다. AWS는 ECS·Lambda·AgentCore Runtime뿐 아니라 다른 클라우드와 하이브리드 환경의 에이전트도
      특정 런타임이나 프레임워크에 종속되지 않고 연결할 수 있다고 설명했다.
    explanations:
      - heading: 등록·검색·접근 권한
        paragraphs:
          - 구현은 관리·제어·실행의 세 계층으로 나뉜다. 관리 계층은 에이전트 등록과 검색, 제어 계층은 JWT 스코프와 Lambda
            authorizer를 통한 접근 권한, 실행 계층은 라우팅·OAuth 백엔드 인증·SSE 스트리밍을 맡는다.
          - 에이전트 설명은 Amazon Titan Text Embeddings로 임베딩한 뒤 Amazon S3 Vectors에
            저장한다. 클라이언트는 정확한 이름 대신 자연어 검색어로 에이전트를 찾을 수 있다.
          - Amazon API Gateway의 REST API는 SSE 응답 스트리밍을 위한 단일 진입점이다. Lambda
            authorizer는 JWT 스코프를 검사해 특정 에이전트 경로를 허용하거나 거부하는 IAM 정책을 만든다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/building-a-serverless-a2a-gateway-for-agent-discovery-routing-and-access-control/
      - heading: 호출 방식과 백엔드 자격 증명
        paragraphs:
          - 표준 A2A 클라이언트는 수정 없이 사용할 수 있다. 게이트웨이는 JSON-RPC와 HTTP+JSON/REST 바인딩을
            모두 지원하며, 에이전트 카드 조회·일반 응답을 위한 SendMessage·SSE 스트리밍을 위한
            SendStreamingMessage를 처리한다.
          - 모든 백엔드 에이전트에는 OAuth 인증이 활성화돼 있어야 하며, 프록시는 OAuth 2.0 클라이언트 자격 증명 흐름으로
            토큰을 얻는다. 백엔드 클라이언트 시크릿은 DynamoDB 대신 AWS Secrets Manager에 저장하고, Proxy
            Lambda가 ARN으로 조회한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/building-a-serverless-a2a-gateway-for-agent-discovery-routing-and-access-control/
      - heading: 사용자·에이전트별 요청 제한
        paragraphs:
          - 프록시는 사용자·에이전트·분 단위로 구분한 DynamoDB 원자 카운터로 요청 수를 센다. 한도를 넘으면 백엔드에 요청을
            보내지 않고 HTTP 429와 retry-after 헤더를 반환한다. 카운터는 DynamoDB TTL로 자동 만료된다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/building-a-serverless-a2a-gateway-for-agent-discovery-routing-and-access-control/
      - heading: 프라이빗 배포와 메시지 처리 범위
        paragraphs:
          - 선택적 VPC 모드에서는 Lambda가 프라이빗 서브넷에서 실행되고 API Gateway는 VPC 내부에서만 접근할 수
            있는 프라이빗 엔드포인트로 전환된다. 이 모드에서도 Cognito나 다른 외부 인증 제공자와 OAuth 토큰을 교환하려면
            외부 인터넷 연결이 필요하다.
          - AWS가 설명한 참조 구현은 백엔드 등록과 OAuth 자격 증명 검증 후 응답 내용을 검사하지 않고 전달하며, A2A
            메시지도 수정하지 않는다. 프롬프트 인젝션 방어와 입력 검증은 백엔드 에이전트가 수행한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/building-a-serverless-a2a-gateway-for-agent-discovery-routing-and-access-control/
    papers: []
    relations: []
    topic_ids: []
  - title: "AWS가 설명한 AgentCore Memory 검색: 속성 조건으로 기억 후보를 먼저 좁힌다"
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-02
      where: 미기재
      what: AgentCore Memory의 메타데이터 구성·기록·검색 방법을 설명하는 글 공개
      how: 네임스페이스 안에서 속성 조건을 적용한 뒤 유사도 검색
      why: 미기재
    lead: AWS는 2026년 7월 2일(한국시간) Amazon Bedrock AgentCore Memory의 메타데이터 구성·기록·검색 방법을
      설명하는 글을 공개했다. 이 서비스는 고객·개체별 네임스페이스 안에서 부서·우선순위·기간 같은 속성으로 기억 후보를 좁힌 뒤 벡터
      유사도 검색을 수행한다.
    explanations:
      - heading: 검색 조건과 데이터 격리
        paragraphs:
          - 네임스페이스는 고객·개체별 기억을 격리하는 기본 경계이고, 메타데이터 필터는 그 안의 데이터를 다시 분류한다. AWS는
            tenant_id 필터만으로 네임스페이스 격리를 대신하지 말라고 설명한다.
          - 필터에 사용할 속성은 인덱스 키로 등록해야 한다. 대화에서 값을 추출해 기억 레코드에 채우려면 해당 키가 전략의
            memoryRecordSchema에도 있어야 한다. 스키마에만 있는 비인덱스 속성은 읽을 수 있지만 필터에는 사용할 수
            없다.
          - ListMemoryRecords는 유사도 검색 없이 속성 조건에 맞는 레코드 목록을 조회한다. 시스템 생성 시각과 갱신
            시각인
            x-amz-agentcore-memory-createdAt·x-amz-agentcore-memory-updatedAt에는
            별도의 날짜 인덱스를 선언하지 않고 BEFORE·AFTER 조건을 사용할 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
      - heading: 값을 그대로 전달하는 추출과 직접 기록
        paragraphs:
          - 애플리케이션이 이미 아는 값은 STRICTLY_CONSISTENT로 지정하면 LLM이 다시 추론하지 않고 추출·통합 과정에
            그대로 전달한다. 같은 결정적 속성 값을 가진 이벤트를 함께 추출하며, 값이 다른 레코드끼리는 통합하지 않는다.
          - AWS가 명시한 한도는 전략당 STRICTLY_CONSISTENT 키 최대 3개다. 각각은 기억 리소스의 인덱스 키 10개
            한도에서 한 자리를 차지하며, 추가한 인덱스 키는 제거할 수 없다.
          - BatchCreateMemoryRecords·BatchUpdateMemoryRecords는 추출을 거치지 않으므로
            STRICTLY_CONSISTENT 추출 설정이 적용되지 않는다. 직접 기록할 때 memoryStrategyId가 있으면
            전략 스키마의 키만 저장하고 나머지는 버린다. 없으면 전달한 키를 그대로 저장하지만 필터에는 인덱스 키만 쓸 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
      - heading: 기존 기록과 평가 결과
        paragraphs:
          - 인덱스 키는 추가 방식으로 확장한다. 새 키는 이후 이벤트와 기억 기록에 사용할 수 있지만 기존 기록에 자동으로 소급
            추가되지는 않는다.
          - AWS는 여러 세션의 장기 대화를 다룬 LoCoMo 방식의 질문 151개로 평가했다고 밝혔다. 메타데이터 필터를 켰을 때
            전체 질문의 답변 정확도는 40%에서 64%로 높아졌고, 기간·우선순위·부서 같은 문맥 경계에 의존하는 질문 부분집합에서는
            16%에서 69%로 높아졌다고 보고했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
    papers: []
    relations: []
    topic_ids: []
  - title: Cloudflare, AI 크롤러 제어 확대…9월 차단 정책·콘텐츠 과금 계획 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cloudflare
      when: 2026-07-02
      where: 미기재
      what: AI 크롤러 접근 정책과 콘텐츠 과금 실험에 대한 보도 및 공식 발표 내용
      how: 목적별 크롤러 제어, Pay Per Use 실험, x402 기반 결제 계획
      why: 미기재
    lead: TechCrunch는 한국시간 7월 2일 Cloudflare의 AI 크롤러 정책과 콘텐츠 사용에 따른 과금 실험을 보도했다.
      Cloudflare가 한국시간 7월 1일 공개한 내용에는 목적별 접근 제어, 9월 적용 예정인 기본 차단 정책,
      Monetization Gateway 도입 계획이 포함됐다.
    explanations:
      - heading: 목적별 접근 제어와 9월 정책
        paragraphs:
          - 발표 당시 Search·Agent·Training별 AI 트래픽 설정은 Free 요금제를 포함한 모든 기존 고객에게 제공
            중이었다. 고객은 각 사이트의 Settings에서 이를 구성할 수 있다.
          - 9월 15일에는 Cloudflare에 새로 등록하는 도메인의 광고 표시 페이지에서 Training과 Agent 크롤러를
            기본 차단하고 Search를 기본 허용할 계획이다. Search와 Training을 함께 수행하는
            Googlebot·Applebot·BingBot 등에는 가장 제한적인 규칙이 적용돼 Training 차단을 선택한 고객에게
            차단된다. 사이트 소유자는 시행 전 Security 설정에서 변경 적용을 거부할 수 있다.
          - BotBase의 검색 가능한 봇 목록은 Enterprise Bot Management 고객에게 제공 중이며, 직접 제어
            센터로의 확대는 그해 후반 계획이다. Verified 표시는 해당 목적 분류의 허용 규칙에 따라 접근할 수 있다는 뜻으로
            바뀌며, 검증된 봇을 일괄 허용하는 기본값과 구분된다.
        source_urls:
          - https://blog.cloudflare.com/content-independence-day-ai-options/
      - heading: 콘텐츠 사용 신호와 검색 연구
        paragraphs:
          - Cloudflare는 robots.txt의 Content Signals에 use 항목을 추가하는 실험도 시작했다.
            immediate는 상호작용 후 저장·재사용하지 않는 선호, reference는 색인·발췌·원문 링크, full은
            요약·재생산의 선호를 나타낸다. 이 값은 사이트 소유자의 의사를 표시하며 직접 접근을 차단하지 않는다.
          - 별도로 시작한 AI 검색 연구는 고객이 공유하기로 선택한 콘텐츠 최신성 신호와 사람·봇의 네트워크 트래픽 관찰을 결합한다.
            Cloudflare는 검색 결과의 최신성·품질과 불필요한 크롤링 감소를 측정할 계획이라고 설명했다. 연구는 검색에 한정되며
            콘텐츠를 공유하거나 파운데이션 모델 학습에 사용하지 않는다.
          - Cloudflare는 이 검색 기능을 그해 후반에 더 넓게 제공할 계획이라고 밝혔다.
        source_urls:
          - https://blog.cloudflare.com/content-independence-day-ai-options/
          - https://blog.cloudflare.com/making-ai-search-smarter/
      - heading: Pay Per Use의 두 실험
        paragraphs:
          - Pay Per Use는 콘텐츠를 가져간 횟수에 대한 Pay Per Crawl에서 콘텐츠가 실제 사용되는 경우의 대가로
            옮기는 실험이다. Cloudflare는 Ceramic.ai와 You.com의 결제 모델을 콘텐츠 소유자에게 연결하는 실험을
            진행 중이라고 설명했다.
          - Ceramic.ai의 pay-per-query 모델에서는 참여를 선택한 발행자의 콘텐츠가 검색 결과에 나타나면 대가를 받는
            구조를 시험한다. You.com의 접근은 에이전트가 필요한 특정 프리미엄 콘텐츠에 대해 사전 구매 약정 없이 요청 시
            결제하는 방식이다.
        source_urls:
          - https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/
          - https://blog.cloudflare.com/making-ai-search-smarter/
      - heading: Monetization Gateway와 x402 결제 절차
        paragraphs:
          - Monetization Gateway는 Cloudflare가 보호하는 웹페이지·데이터셋·API·MCP 도구에 과금을
            적용하려는 계획이다. 발표 당시에는 고객 대상 대기자 모집이 열렸다.
          - 계획된 결제 규칙은 경로·REST 메서드별 조건과 가변 가격을 지원하며, 인증되지 않은 요청에 대한 401 응답을 402
            결제 안내로 바꾸는 방식을 포함한다. 대시보드·API·Terraform 설정과 원 서버 접근 전 엣지에서의 결제 검증도
            도입할 계획이다.
          - Cloudflare가 설명한 x402 절차에서는 서버가 402 Payment Required 응답으로 가격·받는 자산·결제
            목적지를 알린다. 클라이언트가 결제 증명을 첨부해 다시 요청하면 facilitator가 검증하고 서버가 자원을 제공한다.
            일반 HTTP 요청·응답 안에서 교환하며, 금액은 판매자의 지갑으로 직접 정산된다. Gateway의 초기 결제는
            스테이블코인과 x402를 사용할 계획이고, 에이전트 인증에 Web Bot Auth를 요구하는 선택도 제공할 계획이다.
        source_urls:
          - https://blog.cloudflare.com/monetization-gateway/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Bedrock 모델 사양·가격·지역을 비교하는 오픈소스 Model Profiler 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-02
      where: 미기재
      what: 오픈소스 Amazon Bedrock Model Profiler 기능 소개
      how: 모델 사양·가격·지역·쿼터 정보를 수집하고 화면에서 비교
      why: 미기재
    lead: AWS는 2026년 7월 2일(한국시간) 오픈소스 Amazon Bedrock Model Profiler의 수집·비교·배포 기능을
      소개했다. 이 웹 도구는 모델 기능·가격·지역별 제공 정보를 하나의 검색 가능한 화면에 모아 모델 선택에 사용한다.
    explanations:
      - heading: 검색과 모델별 상세 정보
        paragraphs:
          - Model Explorer는 공급사·기능·입출력 모달리티·지역·수명주기 상태로 필터링하고 카드 또는 표로 보여준다. 모델
            이름·설명·공급사 정보를 대상으로 전문 검색을 지원한다.
          - 상세 화면에서는 모달리티·컨텍스트 창·추론 유형, 지역·이용 방식별 가격, 교차 리전 추론을 포함한 제공 범위, 지역별
            분당 토큰·요청 수 쿼터와 공식 문서 링크를 확인한다.
          - 즐겨찾기 목록은 브라우저 세션이 바뀌어도 유지되며, 저장한 모델에 대해서도 필터·정렬·상세 보기를 제공한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-model-selection-in-amazon-bedrock-with-the-open-source-model-profiler/
      - heading: 동시 비교와 지역별 제공 방식
        paragraphs:
          - 동시에 비교할 수 있는 모델은 최대 25개다. 가격, 지역별 제공 여부, 컨텍스트·출력 토큰 등 사양과 기능을 나란히
            비교한다.
          - 지역 화면은 모델별·지역별 행렬로 제공 여부를 표시하고, 같은 지역에서의 추론·교차 리전 추론·Mantle을 구분한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-model-selection-in-amazon-bedrock-with-the-open-source-model-profiler/
      - heading: 공통 수집과 데이터 처리
        paragraphs:
          - 자료는 AWS API 5개와 공개 URL 2개에서 수집한다. 가격·모델·쿼터 수집을 병렬로 수행하고 지역별 모델 목록은
            중복을 제거한다. 이후 보강 단계는 저장된 원자료를 사용해 같은 API를 다시 호출하지 않는다.
          - 최종 결과는 bedrock_models.json과 bedrock_pricing.json으로 합쳐 S3에 저장하고
            CloudFront로 제공한다. 공개 전 데이터 누락을 검사하며, 자동 수정은 안전 기준을 만족한 것만 버전과 복구본을
            남겨 적용하고 나머지는 수동 검토로 넘긴다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-model-selection-in-amazon-bedrock-with-the-open-source-model-profiler/
      - heading: 로컬 실행과 서버리스 배포
        paragraphs:
          - 로컬 모드는 기존 AWS 자격 증명과 Bedrock·Pricing API 읽기 권한으로 수집기와 화면을 실행하며 별도
            클라우드 인프라를 배포하지 않는다. 원문에 명시된 개발 도구 조건은 Python 3.11 이상과 Node.js 18
            이상이다.
          - AWS 배포 모드는 서버리스 구성으로 매일 UTC 오전 6시에 데이터를 갱신하고 호스팅된 화면을 제공한다. 로컬 수집기는
            Lambda 코드와 같은 변환 함수를 가져와 동일한 출력 형식을 유지한다.
          - 프로젝트는 MIT No Attribution(MIT-0) 라이선스로 공개됐다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/simplify-model-selection-in-amazon-bedrock-with-the-open-source-model-profiler/
    papers: []
    relations: []
    topic_ids: []
  - title: Vercel ai@7.0.10, MCP 도구 호출에 maxRetries 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: ai 패키지
      when: 2026-07-02
      where: 미기재
      what: ai@7.0.10 공개 및 실패한 MCP 도구 호출을 위한 maxRetries 옵션 추가
      how: 패치 변경을 통해 maxRetries 옵션 도입 및 의존성 업데이트
      why: 미기재
    lead: Vercel의 ai 패키지 7.0.10 버전이 2026년 7월 2일(한국시간)에 공개됐다. 릴리스 노트는 실패한 MCP 도구 호출을
      위한 maxRetries 옵션이 추가됐다고 명시했다.
    explanations:
      - heading: 의존성 업데이트
        paragraphs:
          - 이번 업데이트에서는 @ai-sdk/provider-utils가 5.0.3 버전으로, @ai-sdk/gateway가
            4.0.8 버전으로 갱신됐다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/ai%407.0.10
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: AWS, GovCloud Bedrock에 GPT OSS·Nemotron 모델 제공
    event_id: 451e3eb01190ca14
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-01T10:14:34-08:00
  - title: AWS, A2A 게이트웨이 참조 구현 공개…검색·권한·라우팅 통합
    event_id: 8cd92561a8c8a996
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-01T10:07:06-08:00
  - title: "AWS가 설명한 AgentCore Memory 검색: 속성 조건으로 기억 후보를 먼저 좁힌다"
    event_id: 51a5467090ea3ba3
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-09
    concept_ids:
      - metadata-filtering
    date_kind: source-publication-time
    source_published_at: 2026-07-01T10:03:10-08:00
  - title: Cloudflare, AI 크롤러 제어 확대…9월 차단 정책·콘텐츠 과금 계획 공개
    event_id: 1d209c5581795359
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-09
    concept_ids:
      - x402
    date_kind: source-publication-time
    source_published_at: 2026-07-01T17:48:37+00:00
  - title: AWS, Bedrock 모델 사양·가격·지역을 비교하는 오픈소스 Model Profiler 소개
    event_id: 33188d7720dd69d5
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-01T09:46:54-08:00
  - title: Vercel ai@7.0.10, MCP 도구 호출에 maxRetries 추가
    event_id: 363e3382634f9bd2
    review_status: verified
    published_at: 2026-07-02
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-01T18:26:25Z
---

# 이번 호 표지

AWS, GovCloud Bedrock에 GPT OSS·Nemotron 모델 제공

# 차례

- AWS, GovCloud Bedrock에 GPT OSS·Nemotron 모델 제공
- AWS, A2A 게이트웨이 참조 구현 공개…검색·권한·라우팅 통합
- AWS가 설명한 AgentCore Memory 검색: 속성 조건으로 기억 후보를 먼저 좁힌다
- Cloudflare, AI 크롤러 제어 확대…9월 차단 정책·콘텐츠 과금 계획 공개
- AWS, Bedrock 모델 사양·가격·지역을 비교하는 오픈소스 Model Profiler 소개

# 커버 스토리

없음

# 뉴스 데스크

## AWS, GovCloud Bedrock에 GPT OSS·Nemotron 모델 제공

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** AWS, OpenAI, NVIDIA

AWS는 7월 2일(한국시간) Amazon Bedrock의 AWS GovCloud(US)에서 OpenAI GPT OSS와 NVIDIA Nemotron 오픈웨이트 모델을 제공한다고 발표했다. AWS는 이 모델의 추론이 미국 시민이 미국 영토에서 운영하는 인프라를 통해 GovCloud 격리 경계 안에서 수행된다고 설명했다. [S1]

### 제공 모델과 GPT OSS 사양

제공 목록에는 OpenAI gpt-oss-120b·gpt-oss-20b와 NVIDIA Nemotron Nano 9B v2·Nano 12B v2·Nano 30B·Super 120B가 포함된다.

AWS가 소개한 GPT OSS 두 모델은 텍스트를 입력받아 텍스트를 생성하며, 128K 토큰의 컨텍스트 창과 최대 16K 토큰 출력을 지원한다. [S1]

### 단일 리전과 GovCloud 내 교차 리전

AWS에 따르면 단일 리전 추론은 us-gov-west-1에서 제공된다. 지리적 교차 리전 추론은 us-gov-west-1과 us-gov-east-1 사이로 요청을 분산하며, 트래픽은 GovCloud(US) 경계 안에 유지된다. [S1]

### 호출 API와 모델별 차이

bedrock-mantle은 OpenAI 호환 API로 OpenAI Python·TypeScript SDK와 함께 사용한다. bedrock-runtime은 AWS SDK를 통해 Converse·InvokeModel API를 호출하며 Guardrails 같은 Bedrock 고유 기능을 제공한다.

GPT OSS는 Responses API를 지원한다. 반면 Nemotron 3 Super 120B는 이 API를 지원하지 않으며 Chat Completions·Converse·Invoke를 사용한다.

bedrock-mantle에서 GPT OSS는 클라이언트 측·서버 측 도구 호출을 모두 지원하고, Nemotron 3 Super 120B는 클라이언트 측 도구 호출만 지원한다. [S1]

### 접근 자격과 호출 조건

bedrock-mantle을 이용하려면 Bedrock 모델 호출 권한이 있는 GovCloud(US) 계정과 Bedrock API 키 또는 일반 AWS 자격 증명이 필요하다.

AWS는 Standard 티어의 온디맨드 용량이 리전별 공유 자원이며, 보도자료의 오픈웨이트 모델에 대해 Service Quotas 콘솔에 계정별 토큰 쿼터가 게시되어 있지 않다고 설명했다.

단기 Bedrock API 키는 최대 12시간 후 자동으로 만료된다. [S1]

## AWS, A2A 게이트웨이 참조 구현 공개…검색·권한·라우팅 통합

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** AWS

AWS는 7월 2일(한국시간) 여러 에이전트를 단일 도메인과 경로 기반 라우팅으로 연결하는 서버리스 A2A 게이트웨이 참조 구현 가이드를 공개했다. AWS는 ECS·Lambda·AgentCore Runtime뿐 아니라 다른 클라우드와 하이브리드 환경의 에이전트도 특정 런타임이나 프레임워크에 종속되지 않고 연결할 수 있다고 설명했다. [S2]

### 등록·검색·접근 권한

구현은 관리·제어·실행의 세 계층으로 나뉜다. 관리 계층은 에이전트 등록과 검색, 제어 계층은 JWT 스코프와 Lambda authorizer를 통한 접근 권한, 실행 계층은 라우팅·OAuth 백엔드 인증·SSE 스트리밍을 맡는다.

에이전트 설명은 Amazon Titan Text Embeddings로 임베딩한 뒤 Amazon S3 Vectors에 저장한다. 클라이언트는 정확한 이름 대신 자연어 검색어로 에이전트를 찾을 수 있다.

Amazon API Gateway의 REST API는 SSE 응답 스트리밍을 위한 단일 진입점이다. Lambda authorizer는 JWT 스코프를 검사해 특정 에이전트 경로를 허용하거나 거부하는 IAM 정책을 만든다. [S2]

### 호출 방식과 백엔드 자격 증명

표준 A2A 클라이언트는 수정 없이 사용할 수 있다. 게이트웨이는 JSON-RPC와 HTTP+JSON/REST 바인딩을 모두 지원하며, 에이전트 카드 조회·일반 응답을 위한 SendMessage·SSE 스트리밍을 위한 SendStreamingMessage를 처리한다.

모든 백엔드 에이전트에는 OAuth 인증이 활성화돼 있어야 하며, 프록시는 OAuth 2.0 클라이언트 자격 증명 흐름으로 토큰을 얻는다. 백엔드 클라이언트 시크릿은 DynamoDB 대신 AWS Secrets Manager에 저장하고, Proxy Lambda가 ARN으로 조회한다. [S2]

### 사용자·에이전트별 요청 제한

프록시는 사용자·에이전트·분 단위로 구분한 DynamoDB 원자 카운터로 요청 수를 센다. 한도를 넘으면 백엔드에 요청을 보내지 않고 HTTP 429와 retry-after 헤더를 반환한다. 카운터는 DynamoDB TTL로 자동 만료된다. [S2]

### 프라이빗 배포와 메시지 처리 범위

선택적 VPC 모드에서는 Lambda가 프라이빗 서브넷에서 실행되고 API Gateway는 VPC 내부에서만 접근할 수 있는 프라이빗 엔드포인트로 전환된다. 이 모드에서도 Cognito나 다른 외부 인증 제공자와 OAuth 토큰을 교환하려면 외부 인터넷 연결이 필요하다.

AWS가 설명한 참조 구현은 백엔드 등록과 OAuth 자격 증명 검증 후 응답 내용을 검사하지 않고 전달하며, A2A 메시지도 수정하지 않는다. 프롬프트 인젝션 방어와 입력 검증은 백엔드 에이전트가 수행한다. [S2]

## AWS가 설명한 AgentCore Memory 검색: 속성 조건으로 기억 후보를 먼저 좁힌다

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

AWS는 2026년 7월 2일(한국시간) Amazon Bedrock AgentCore Memory의 메타데이터 구성·기록·검색 방법을 설명하는 글을 공개했다. 이 서비스는 고객·개체별 네임스페이스 안에서 부서·우선순위·기간 같은 속성으로 기억 후보를 좁힌 뒤 벡터 유사도 검색을 수행한다. [S3]

### 검색 조건과 데이터 격리

네임스페이스는 고객·개체별 기억을 격리하는 기본 경계이고, 메타데이터 필터는 그 안의 데이터를 다시 분류한다. AWS는 tenant\_id 필터만으로 네임스페이스 격리를 대신하지 말라고 설명한다.

필터에 사용할 속성은 인덱스 키로 등록해야 한다. 대화에서 값을 추출해 기억 레코드에 채우려면 해당 키가 전략의 memoryRecordSchema에도 있어야 한다. 스키마에만 있는 비인덱스 속성은 읽을 수 있지만 필터에는 사용할 수 없다.

ListMemoryRecords는 유사도 검색 없이 속성 조건에 맞는 레코드 목록을 조회한다. 시스템 생성 시각과 갱신 시각인 x-amz-agentcore-memory-createdAt·x-amz-agentcore-memory-updatedAt에는 별도의 날짜 인덱스를 선언하지 않고 BEFORE·AFTER 조건을 사용할 수 있다. [S3]

### 값을 그대로 전달하는 추출과 직접 기록

애플리케이션이 이미 아는 값은 STRICTLY\_CONSISTENT로 지정하면 LLM이 다시 추론하지 않고 추출·통합 과정에 그대로 전달한다. 같은 결정적 속성 값을 가진 이벤트를 함께 추출하며, 값이 다른 레코드끼리는 통합하지 않는다.

AWS가 명시한 한도는 전략당 STRICTLY\_CONSISTENT 키 최대 3개다. 각각은 기억 리소스의 인덱스 키 10개 한도에서 한 자리를 차지하며, 추가한 인덱스 키는 제거할 수 없다.

BatchCreateMemoryRecords·BatchUpdateMemoryRecords는 추출을 거치지 않으므로 STRICTLY\_CONSISTENT 추출 설정이 적용되지 않는다. 직접 기록할 때 memoryStrategyId가 있으면 전략 스키마의 키만 저장하고 나머지는 버린다. 없으면 전달한 키를 그대로 저장하지만 필터에는 인덱스 키만 쓸 수 있다. [S3]

### 기존 기록과 평가 결과

인덱스 키는 추가 방식으로 확장한다. 새 키는 이후 이벤트와 기억 기록에 사용할 수 있지만 기존 기록에 자동으로 소급 추가되지는 않는다.

AWS는 여러 세션의 장기 대화를 다룬 LoCoMo 방식의 질문 151개로 평가했다고 밝혔다. 메타데이터 필터를 켰을 때 전체 질문의 답변 정확도는 40%에서 64%로 높아졌고, 기간·우선순위·부서 같은 문맥 경계에 의존하는 질문 부분집합에서는 16%에서 69%로 높아졌다고 보고했다. [S3]

**개념:** [[Knowledge/AI Systems/Metadata Filtering]]

## Cloudflare, AI 크롤러 제어 확대…9월 차단 정책·콘텐츠 과금 계획 공개

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가, 기능 변경
**기업·기관:** Cloudflare, Ceramic.ai, You.com

TechCrunch는 한국시간 7월 2일 Cloudflare의 AI 크롤러 정책과 콘텐츠 사용에 따른 과금 실험을 보도했다. Cloudflare가 한국시간 7월 1일 공개한 내용에는 목적별 접근 제어, 9월 적용 예정인 기본 차단 정책, Monetization Gateway 도입 계획이 포함됐다. [S4] [S5] [S6] [S7]

### 목적별 접근 제어와 9월 정책

발표 당시 Search·Agent·Training별 AI 트래픽 설정은 Free 요금제를 포함한 모든 기존 고객에게 제공 중이었다. 고객은 각 사이트의 Settings에서 이를 구성할 수 있다.

9월 15일에는 Cloudflare에 새로 등록하는 도메인의 광고 표시 페이지에서 Training과 Agent 크롤러를 기본 차단하고 Search를 기본 허용할 계획이다. Search와 Training을 함께 수행하는 Googlebot·Applebot·BingBot 등에는 가장 제한적인 규칙이 적용돼 Training 차단을 선택한 고객에게 차단된다. 사이트 소유자는 시행 전 Security 설정에서 변경 적용을 거부할 수 있다.

BotBase의 검색 가능한 봇 목록은 Enterprise Bot Management 고객에게 제공 중이며, 직접 제어 센터로의 확대는 그해 후반 계획이다. Verified 표시는 해당 목적 분류의 허용 규칙에 따라 접근할 수 있다는 뜻으로 바뀌며, 검증된 봇을 일괄 허용하는 기본값과 구분된다. [S6]

### 콘텐츠 사용 신호와 검색 연구

Cloudflare는 robots.txt의 Content Signals에 use 항목을 추가하는 실험도 시작했다. immediate는 상호작용 후 저장·재사용하지 않는 선호, reference는 색인·발췌·원문 링크, full은 요약·재생산의 선호를 나타낸다. 이 값은 사이트 소유자의 의사를 표시하며 직접 접근을 차단하지 않는다.

별도로 시작한 AI 검색 연구는 고객이 공유하기로 선택한 콘텐츠 최신성 신호와 사람·봇의 네트워크 트래픽 관찰을 결합한다. Cloudflare는 검색 결과의 최신성·품질과 불필요한 크롤링 감소를 측정할 계획이라고 설명했다. 연구는 검색에 한정되며 콘텐츠를 공유하거나 파운데이션 모델 학습에 사용하지 않는다.

Cloudflare는 이 검색 기능을 그해 후반에 더 넓게 제공할 계획이라고 밝혔다. [S6] [S5]

### Pay Per Use의 두 실험

Pay Per Use는 콘텐츠를 가져간 횟수에 대한 Pay Per Crawl에서 콘텐츠가 실제 사용되는 경우의 대가로 옮기는 실험이다. Cloudflare는 Ceramic.ai와 You.com의 결제 모델을 콘텐츠 소유자에게 연결하는 실험을 진행 중이라고 설명했다.

Ceramic.ai의 pay-per-query 모델에서는 참여를 선택한 발행자의 콘텐츠가 검색 결과에 나타나면 대가를 받는 구조를 시험한다. You.com의 접근은 에이전트가 필요한 특정 프리미엄 콘텐츠에 대해 사전 구매 약정 없이 요청 시 결제하는 방식이다. [S4] [S5]

### Monetization Gateway와 x402 결제 절차

Monetization Gateway는 Cloudflare가 보호하는 웹페이지·데이터셋·API·MCP 도구에 과금을 적용하려는 계획이다. 발표 당시에는 고객 대상 대기자 모집이 열렸다.

계획된 결제 규칙은 경로·REST 메서드별 조건과 가변 가격을 지원하며, 인증되지 않은 요청에 대한 401 응답을 402 결제 안내로 바꾸는 방식을 포함한다. 대시보드·API·Terraform 설정과 원 서버 접근 전 엣지에서의 결제 검증도 도입할 계획이다.

Cloudflare가 설명한 x402 절차에서는 서버가 402 Payment Required 응답으로 가격·받는 자산·결제 목적지를 알린다. 클라이언트가 결제 증명을 첨부해 다시 요청하면 facilitator가 검증하고 서버가 자원을 제공한다. 일반 HTTP 요청·응답 안에서 교환하며, 금액은 판매자의 지갑으로 직접 정산된다. Gateway의 초기 결제는 스테이블코인과 x402를 사용할 계획이고, 에이전트 인증에 Web Bot Auth를 요구하는 선택도 제공할 계획이다. [S7]

**개념:** [[Knowledge/AI Systems/x402]]

## AWS, Bedrock 모델 사양·가격·지역을 비교하는 오픈소스 Model Profiler 소개

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

AWS는 2026년 7월 2일(한국시간) 오픈소스 Amazon Bedrock Model Profiler의 수집·비교·배포 기능을 소개했다. 이 웹 도구는 모델 기능·가격·지역별 제공 정보를 하나의 검색 가능한 화면에 모아 모델 선택에 사용한다. [S8]

### 검색과 모델별 상세 정보

Model Explorer는 공급사·기능·입출력 모달리티·지역·수명주기 상태로 필터링하고 카드 또는 표로 보여준다. 모델 이름·설명·공급사 정보를 대상으로 전문 검색을 지원한다.

상세 화면에서는 모달리티·컨텍스트 창·추론 유형, 지역·이용 방식별 가격, 교차 리전 추론을 포함한 제공 범위, 지역별 분당 토큰·요청 수 쿼터와 공식 문서 링크를 확인한다.

즐겨찾기 목록은 브라우저 세션이 바뀌어도 유지되며, 저장한 모델에 대해서도 필터·정렬·상세 보기를 제공한다. [S8]

### 동시 비교와 지역별 제공 방식

동시에 비교할 수 있는 모델은 최대 25개다. 가격, 지역별 제공 여부, 컨텍스트·출력 토큰 등 사양과 기능을 나란히 비교한다.

지역 화면은 모델별·지역별 행렬로 제공 여부를 표시하고, 같은 지역에서의 추론·교차 리전 추론·Mantle을 구분한다. [S8]

### 공통 수집과 데이터 처리

자료는 AWS API 5개와 공개 URL 2개에서 수집한다. 가격·모델·쿼터 수집을 병렬로 수행하고 지역별 모델 목록은 중복을 제거한다. 이후 보강 단계는 저장된 원자료를 사용해 같은 API를 다시 호출하지 않는다.

최종 결과는 bedrock\_models.json과 bedrock\_pricing.json으로 합쳐 S3에 저장하고 CloudFront로 제공한다. 공개 전 데이터 누락을 검사하며, 자동 수정은 안전 기준을 만족한 것만 버전과 복구본을 남겨 적용하고 나머지는 수동 검토로 넘긴다. [S8]

### 로컬 실행과 서버리스 배포

로컬 모드는 기존 AWS 자격 증명과 Bedrock·Pricing API 읽기 권한으로 수집기와 화면을 실행하며 별도 클라우드 인프라를 배포하지 않는다. 원문에 명시된 개발 도구 조건은 Python 3.11 이상과 Node.js 18 이상이다.

AWS 배포 모드는 서버리스 구성으로 매일 UTC 오전 6시에 데이터를 갱신하고 호스팅된 화면을 제공한다. 로컬 수집기는 Lambda 코드와 같은 변환 함수를 가져와 동일한 출력 형식을 유지한다.

프로젝트는 MIT No Attribution(MIT-0) 라이선스로 공개됐다. [S8]

## Vercel ai@7.0.10, MCP 도구 호출에 maxRetries 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

Vercel의 ai 패키지 7.0.10 버전이 2026년 7월 2일(한국시간)에 공개됐다. 릴리스 노트는 실패한 MCP 도구 호출을 위한 maxRetries 옵션이 추가됐다고 명시했다. [S9]

### 의존성 업데이트

이번 업데이트에서는 @ai-sdk/provider-utils가 5.0.3 버전으로, @ai-sdk/gateway가 4.0.8 버전으로 갱신됐다. [S9]

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

- [S1] https://aws.amazon.com/blogs/machine-learning/run-nvidia-nemotron-and-openai-gpt-oss-models-on-amazon-bedrock-in-aws-govcloud-us/
- [S2] https://aws.amazon.com/blogs/machine-learning/building-a-serverless-a2a-gateway-for-agent-discovery-routing-and-access-control/
- [S3] https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
- [S4] https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/
- [S5] https://blog.cloudflare.com/making-ai-search-smarter/
- [S6] https://blog.cloudflare.com/content-independence-day-ai-options/
- [S7] https://blog.cloudflare.com/monetization-gateway/
- [S8] https://aws.amazon.com/blogs/machine-learning/simplify-model-selection-in-amazon-bedrock-with-the-open-source-model-profiler/
- [S9] https://api.github.com/repos/vercel/ai/releases/tags/ai%407.0.10
