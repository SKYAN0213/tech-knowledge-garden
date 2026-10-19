---
title: Tech & AI Morning Briefing - 07:00
time: 07:00
type: briefing
tags:
  - AI
  - TechBriefing
  - MorningBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-06-24
timezone: Asia/Seoul
coverage_start: 2026-06-23T17:00:00+09:00
coverage_end: 2026-06-24T07:00:00+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 11
new_items_count: 10
linked_knowledge_notes:
  - AI Agents
  - AI Agent Security and Governance
  - Agent Evaluation and Observability
  - Model Context Protocol
  - Retrieval-Augmented Generation
  - AI Governance and Conformity Assessment
  - AI Inference Infrastructure
  - Knowledge/AI Systems/AI Agents
  - Knowledge/AI Systems/Model Context Protocol
  - Knowledge/AI Systems/Metadata Filtering
knowledge_notes_created: []
knowledge_notes_updated: []
briefing_group_format: related-events/v1
briefing_groups:
  - id: hf-release-and-browser-cache
    title: 주간 릴리스 자동화와 브라우저 모델 공유 실험
    sector: 소프트웨어·클라우드
    event_ids:
      - b0d7df1028b033f7
      - 2e297cf400e7d42e
headlines:
  - Anthropic, Slack 채널에서 작업을 맡기는 Claude Tag 베타 공개
  - GitHub Copilot 앱, 사용자 키와 로컬 모델로 에이전트 세션 실행 지원
  - OpenAI, Appia Foundation의 AI 표준·평가 기준 공동 개발 참여 소개
  - AWS, AgentCore 공동 인프라에서 고객 데이터·메모리·비용을 나누는 예제 공개
  - Microsoft, Copilot 대화에 SPFx 업무 화면을 띄우는 SharePoint Copilot Apps 소개
article_records:
  - title: Anthropic, Slack 채널에서 작업을 맡기는 Claude Tag 베타 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Anthropic은 2026년 6월 23일(한국시간), Slack 채널에서 호출해 팀의 작업을 맡길 수 있는 Claude Tag를
      Enterprise·Team 고객 대상 베타로 공개했다. 채널 구성원이 @Claude를 태그하면 요청을 단계별로 처리하고, 허용된
      도구로 작업한 결과를 Slack 스레드에 남긴다.
    explanations:
      - heading: 채널별 기억과 비동기 작업
        paragraphs:
          - 같은 채널의 구성원은 작업과 대화를 함께 이어 갈 수 있다. Claude는 접근이 허용된 채널의 맥락을 축적하며, 비동기
            작업과 스스로 예약한 작업을 여러 시간이나 며칠에 걸쳐 수행할 수 있다고 회사는 설명했다.
        source_urls:
          - https://www.anthropic.com/news/introducing-claude-tag
      - heading: 관리자가 정하는 접근·사용 범위
        paragraphs:
          - 관리자는 채널별 도구·정보 접근 범위를 정하고 기억도 그 범위 안에 두도록 설정한다. 조직·채널의 토큰 사용 한도를
            지정하고, 수행한 작업과 요청자를 기록한 로그를 확인할 수 있다.
          - Anthropic은 자사 제품팀 코드의 65%가 내부 버전 Claude Tag에서 생성된다고 밝혔다. 해당 수치는 회사
            내부 제품팀에 관한 설명이다.
        source_urls:
          - https://www.anthropic.com/news/introducing-claude-tag
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot 앱, 사용자 키와 로컬 모델로 에이전트 세션 실행 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 23일(한국시간), Copilot 앱에서 사용자의 모델 제공자와 인증 키를 사용하는 BYOK 기능을
      발표했다. OpenAI·Azure OpenAI·Microsoft Foundry·Anthropic, LM Studio·Ollama 및
      OpenAI 호환 엔드포인트를 에이전트 세션에 연결할 수 있다.
    explanations:
      - heading: 설정과 세션별 모델 선택
        paragraphs:
          - Settings의 Model Providers에 엔드포인트와 API 키를 등록한다. LM Studio·Ollama에는
            호스트를 지정하며, 등록한 모델은 Copilot 제공 모델과 함께 선택 목록에 나타난다. 키는 로컬 운영체제의 키체인에
            보관되고 UI에서 다시 읽지 않는다고 GitHub는 설명했다.
        source_urls:
          - https://github.blog/changelog/2026-06-23-github-copilot-app-support-for-byok/
      - heading: 기존 계정과 조직 정책
        paragraphs:
          - 사용자는 기존 제공자의 결제·할당량·지역·데이터 처리 조건을 유지하며 자체 클라우드 계정이나 내부 게이트웨이로 추론 요청을
            보낼 수 있다. Business·Enterprise 요금제에서 앱을 이용하려면 관리자가 정책에서 Copilot CLI를
            활성화해야 한다.
        source_urls:
          - https://github.blog/changelog/2026-06-23-github-copilot-app-support-for-byok/
    papers: []
    relations: []
    topic_ids: []
  - title: OpenAI, Appia Foundation의 AI 표준·평가 기준 공동 개발 참여 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: OpenAI는 2026년 6월 23일, Linux Foundation이 주관하는 Appia Foundation의 설립에 참여했다고
      소개했다. Appia는 국제 표준과 기존 프레임워크를 AI 가치사슬에서 사용할 수 있는 실용적인 평가 기준으로 옮기는 개방형·모듈형
      규격을 개발할 계획이다.
    explanations:
      - heading: 평가 증거를 조직 사이에서 재사용
        paragraphs:
          - OpenAI는 모델·인프라·애플리케이션을 서로 다른 조직이 개발할 때 제3자가 표준 적합성을 확인하고, 그 증거를 명확하고
            재사용 가능한 형태로 제공하는 구조를 목표로 설명했다.
        source_urls:
          - https://openai.com/index/helping-build-shared-standards-for-advanced-ai/
      - heading: Appia FAQ가 설명하는 규격의 역할
        paragraphs:
          - Appia의 FAQ는 규격을 요구사항·지침과 평가 지원의 두 층으로 설명한다. 상위 제공자가 담당 부분의 적합성을 입증한
            증거를 하위 조직이 활용하되, 각 조직은 자신의 역할과 사용에 책임을 진다는 구조다.
          - FAQ는 기술적 적합성 결과와 법적 준수 여부를 구분한다. 법적 의무 충족 여부는 적용되는 법체계와 관할에 따라 결정되며,
            재단이 규제 권한이나 준수 지위를 부여하는 것은 아니라고 명시한다.
        source_urls:
          - https://appiafoundation.org/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, AgentCore 공동 인프라에서 고객 데이터·메모리·비용을 나누는 예제 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: AWS는 2026년 6월 24일(한국시간), Amazon Bedrock AgentCore로 여러 고객이 인프라를 공유하면서 데이터를
      분리하는 구현 예제를 공개했다. 진료소·병원을 가정한 예제에서 서비스 등급·고객·사용자 계층에 따라 문서 검색, 에이전트 기억, 모델
      사용과 비용 추적을 구성했다.
    explanations:
      - heading: 검색·도구·메모리의 고객 범위
        paragraphs:
          - Cognito 토큰의 서비스 등급과 clinic_id를 고객 문맥으로 전달한다. 서비스 등급별 S3 버킷 안의 고객 경로로
            문서를 나누고, Knowledge Base 검색에는 clinic_id 메타데이터 필터를 적용한다.
          - Gateway는 Lambda의 patient_context·clinic_config 함수를 MCP 도구로 제공한다. 고객
            문맥을 헤더로 전달하며, 도구 Lambda는 고객 태그를 가진 임시 자격증명으로 DynamoDB의 접근 범위를 제한하는
            패턴을 사용한다.
          - 메모리는 서비스 등급·clinic_id·사용자 ID를 합친 actor_id와 이름공간으로 구분한다. 실행 시 얻는 임시
            자격증명에 같은 세 가지 태그를 넣어 접근 범위를 제한한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/shared-infrastructure-isolated-tenants-pool-model-multi-tenancy-with-amazon-bedrock-agentcore/
      - heading: 서비스 등급 비용과 고객별 토큰 사용량
        paragraphs:
          - 서비스 등급마다 Bedrock Project와 비용 태그를 두고 추론 요청에 프로젝트 ID를 전달한다. 고객별 사용량은
            clinic_id·모델·입출력 토큰을 구조화 로그로 기록하며, 비용은 토큰 수와 모델별 단가로 추산하는 방식이다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/shared-infrastructure-isolated-tenants-pool-model-multi-tenancy-with-amazon-bedrock-agentcore/
    papers: []
    relations: []
    topic_ids: []
  - title: Microsoft, Copilot 대화에 SPFx 업무 화면을 띄우는 SharePoint Copilot Apps 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Microsoft는 2026년 6월 23일(한국시간), SharePoint Framework(SPFx) 구성요소를 Copilot
      캔버스에 표시하는 SharePoint Copilot Apps를 소개했다. MCP Apps 모델을 바탕으로 대화 안에서 업무 화면을
      열고 동작을 수행하도록 하며, 같은 구성요소를 Copilot·SharePoint·Teams에 재사용할 수 있다고 설명했다.
    explanations:
      - heading: 개발과 호스팅
        paragraphs:
          - SPFx는 React·Angular·Vue·Svelte·TypeScript 등 웹 개발 기술을 지원한다. 구성요소는
            Microsoft 365 고객 테넌트에 자동 호스팅되고, 플랫폼이 요청을 해당 도구로 전달하는 구조라고 Microsoft는
            설명했다.
        source_urls:
          - https://devblogs.microsoft.com/microsoft365dev/going-beyond-text-in-microsoft-365-copilot-introducing-sharepoint-copilot-apps/
      - heading: 최초 일정과 이후 수정
        paragraphs:
          - 최초 글은 SPFx v1.24 프리뷰와 함께 7월 초 프리뷰를 제공하고 가을에 일반 제공을 순차 진행할 계획을 제시했다.
          - 9월 23일 추가한 문구에서는 명칭을 UX components in Copilot으로 바꾸고, SPFx 1.24에 포함해
            2026년 10월부터 일반 제공할 계획이라고 안내했다.
        source_urls:
          - https://devblogs.microsoft.com/microsoft365dev/going-beyond-text-in-microsoft-365-copilot-introducing-sharepoint-copilot-apps/
    papers: []
    relations: []
    topic_ids: []
  - title: Hugging Face, AI 초안·PR 대조·사람 검토로 huggingface_hub 주간 릴리스 구성
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Hugging Face는 2026년 6월 23일(한국시간), huggingface_hub를 기존 4~6주에서 주간 릴리스로 전환한
      작업 흐름을 공개했다. GitHub Actions가 절차를 실행하고 OpenCode와 공개 가중치 모델이 릴리스 노트·Slack
      공지를 초안 작성하며, 사람이 검토·수정한다.
    explanations:
      - heading: 누락·추가 PR 대조와 문서 변경 근거
        paragraphs:
          - 모델 실행 전에 릴리스에 속한 PR 목록을 저장하고 초안의 PR 참조와 비교해 빠진 항목과 추가된 항목을 찾는다. 모델에는
            PR 제목뿐 아니라 실제 docs 디렉터리의 Markdown 변경 내용도 전달한다.
        source_urls:
          - https://huggingface.co/blog/huggingface-hub-release-ci
      - heading: 후보 검증과 초안 이력
        paragraphs:
          - 릴리스 후보를 transformers·datasets·diffusers·sentence-transformers에 고정한
            테스트 브랜치를 열어 하위 라이브러리 CI에서 문제를 확인한다. 원래 AI 초안과 사람이 편집한 최종 원고는 함께
            보관한다.
        source_urls:
          - https://huggingface.co/blog/huggingface-hub-release-ci
    papers: []
    relations: []
    topic_ids: []
  - title: Transformers.js, 해시로 모델 파일을 공유하는 Cross-Origin Storage 실험 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Hugging Face 블로그는 2026년 6월 23일(한국시간), Transformers.js에서 Cross-Origin
      Storage 제안을 시험하는 방법을 소개했다. 서로 다른 웹사이트가 같은 모델·WebAssembly 파일을 반복 저장하는 문제를
      줄이기 위해, 파일의 암호학적 해시를 키로 사용하는 공유 저장소를 제안한다.
    explanations:
      - heading: 저장 시 검증과 공개 범위
        paragraphs:
          - 파일을 쓸 때 선언한 해시와 실제 내용이 일치해야 저장된다. origins 설정은 전역 공개, 지정한 사이트 목록,
            기본값인 같은 사이트 범위를 구분하며, API는 URL 대신 해시로 파일을 찾는다.
        source_urls:
          - https://huggingface.co/blog/cross-origin-storage
      - heading: 선택적으로 켜는 실험 경로
        paragraphs:
          - 글에서 소개한 API는 아직 브라우저에 기본 구현되지 않은 초기 제안이다. 확장 프로그램의 polyfill과
            Transformers.js의 experimental_useCrossOriginStorage 설정으로 시험하며, API가
            없으면 기본 Cache API 경로를 사용한다.
          - 공유 파일이 이용자의 방문 기록을 드러내지 않도록, 브라우저가 파일 존재 확인을 제한하는 방식을 제안한다. 저장소 조회
            오류가 나면 앱은 네트워크 다운로드로 돌아가도록 설명했다.
        source_urls:
          - https://huggingface.co/blog/cross-origin-storage
    papers: []
    relations: []
    topic_ids: []
  - title: 코딩 에이전트 탐지 연구, 저장소 파일·커밋·계정 신호를 함께 대조
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 23일 arXiv에, 1억8천만 개 이상 Git 저장소에서 AI 코딩 에이전트의 흔적을 여러 방식으로
      탐지하는 사전공개 논문을 제출했다. v1 초록은 설정 파일·커밋 메시지·작성자 식별·봇 서명을 결합하고 탐지 유형에 따라 활동을
      분류했다고 설명한다.
    explanations:
      - heading: 한 가지 신호로 찾은 커밋의 비율
        paragraphs:
          - 한 스냅샷에서 여러 탐지 방법으로 찾은 Claude Code 커밋은 850,157개였고, 봇 계정 조회로 회수한 것은
            28,154개(3.3%)였다. 이는 해당 표본에서 탐지 방식별 회수량을 비교한 수치다.
          - 연구진은 탐지 패턴을 495개 수작업 라벨로 검증했다. PR 조사와 커밋 탐지가 서로 다른 도입 집단과 작업을 잡아내며,
            관찰된 작업 구성은 도구 자체뿐 아니라 배포·탐지 방식에 영향을 받는다고 초록은 설명한다.
        source_urls:
          - https://arxiv.org/abs/2606.24429v1
    papers:
      - work_id: arxiv-2606-24429
        identifiers:
          - arxiv:2606.24429v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.24429v1
    relations: []
    topic_ids: []
  - title: Grad Detect 연구, 추론 중 기울기 패턴으로 환각·답변 유보를 예측
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 23일 arXiv에, 언어 모델의 층별 기울기를 분석해 환각을 예측하는 Grad Detect 사전공개 논문을
      제출했다. v1 초록에 따르면 추론 중 한 번의 순전파·역전파에서 얻은 기울기 패턴으로 답변의 정확성과 답변 유보를 예측한다.
    explanations:
      - heading: 비교 대상과 층별 분석
        paragraphs:
          - 연구진은 여러 질의응답 벤치마크에서 신뢰도 기반·샘플링 기반 탐지 방법과 비교해 더 좋은 결과를 보고했다. 초록에서 제시한
            비교 범위는 환각 탐지와 답변 유보 예측이다.
          - 네 가지 구조 계열의 모델 11개를 대상으로 한 층 제거 실험에서, 마지막 다섯 층에 판별용 기울기 신호의 97% 이상이
            집중됐다고 보고했다. 이 비율은 신호가 집중된 위치에 관한 결과이며 환각 탐지 정확도 수치가 아니다.
        source_urls:
          - https://arxiv.org/abs/2606.24790v1
    papers:
      - work_id: arxiv-2606-24790
        identifiers:
          - arxiv:2606.24790v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.24790v1
    relations: []
    topic_ids: []
  - title: RAG 개인정보 보호 연구, 검색 문서를 세 에이전트로 오프라인 재작성
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-23
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 23일 arXiv에, 검색 결과 문서의 민감 식별자를 제거하고 의미를 유지하는 RAG 개인정보 보호 방법을
      사전공개했다. v1 초록은 개인정보 추출·의미 분석·재구성 담당 에이전트를 결합해, 온라인 추론 전에 문서를 한 번 재작성하는 구성을
      제안한다.
    explanations:
      - heading: 데이터셋과 표적 공격 결과
        paragraphs:
          - ChatDoctor·Wiki-PII와 여섯 언어 모델에서 평가했으며, LLaMA-3-8B의 표적 정보 노출은 기준 방법의
            144건에서 1건으로 줄었다고 초록은 보고했다.
        source_urls:
          - https://arxiv.org/abs/2606.24623v1
      - heading: 문맥 보존과 사전 처리
        paragraphs:
          - 문맥 보존을 평가하는 BLEU-1은 제안 방법이 0.122, 비교 방법 SAGE가 0.117이었다. 재작성은 일회성
            오프라인 전처리로 수행하므로 온라인 추론 단계에 추가 지연을 넣지 않는 구성이라고 연구진은 설명했다.
        source_urls:
          - https://arxiv.org/abs/2606.24623v1
    papers:
      - work_id: arxiv-2606-24623
        identifiers:
          - arxiv:2606.24623v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.24623v1
    relations: []
    topic_ids: []
article_reviews:
  - title: Anthropic, Slack 채널에서 작업을 맡기는 Claude Tag 베타 공개
    event_id: 64748ac3266300d1
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids:
      - agents
    date_kind: source-publication-time
    source_published_at: 2026-06-23T14:00:00.000Z
  - title: GitHub Copilot 앱, 사용자 키와 로컬 모델로 에이전트 세션 실행 지원
    event_id: aefdd93cd28250ac
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-23T01:00:02-07:00
  - title: OpenAI, Appia Foundation의 AI 표준·평가 기준 공동 개발 참여 소개
    event_id: 2c0ff8cab504703e
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-23
  - title: AWS, AgentCore 공동 인프라에서 고객 데이터·메모리·비용을 나누는 예제 공개
    event_id: b58cbd8dc63e6f59
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids:
      - mcp
      - metadata-filtering
    date_kind: source-publication-time
    source_published_at: 2026-06-23T07:43:59-08:00
  - title: Microsoft, Copilot 대화에 SPFx 업무 화면을 띄우는 SharePoint Copilot Apps 소개
    event_id: c8a787a9fe2a8772
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids:
      - mcp
    date_kind: source-publication-time
    source_published_at: 2026-06-23T12:25:46+00:00
  - title: Hugging Face, AI 초안·PR 대조·사람 검토로 huggingface_hub 주간 릴리스 구성
    event_id: b0d7df1028b033f7
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-23T00:00:00.713Z
  - title: Transformers.js, 해시로 모델 파일을 공유하는 Cross-Origin Storage 실험 소개
    event_id: 2e297cf400e7d42e
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-23T00:00:00.712Z
  - title: 코딩 에이전트 탐지 연구, 저장소 파일·커밋·계정 신호를 함께 대조
    event_id: 99963ac111426254
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-23
  - title: Grad Detect 연구, 추론 중 기울기 패턴으로 환각·답변 유보를 예측
    event_id: 56038683d388c83d
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-23
  - title: RAG 개인정보 보호 연구, 검색 문서를 세 에이전트로 오프라인 재작성
    event_id: 97a064f78df2cd59
    review_status: verified
    published_at: 2026-06-23
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-23
---

# 이번 호 표지

Anthropic, Slack 채널에서 작업을 맡기는 Claude Tag 베타 공개

# 차례

- Anthropic, Slack 채널에서 작업을 맡기는 Claude Tag 베타 공개
- GitHub Copilot 앱, 사용자 키와 로컬 모델로 에이전트 세션 실행 지원
- OpenAI, Appia Foundation의 AI 표준·평가 기준 공동 개발 참여 소개
- AWS, AgentCore 공동 인프라에서 고객 데이터·메모리·비용을 나누는 예제 공개
- Microsoft, Copilot 대화에 SPFx 업무 화면을 띄우는 SharePoint Copilot Apps 소개

# 커버 스토리

없음

# 뉴스 데스크

## Anthropic, Slack 채널에서 작업을 맡기는 Claude Tag 베타 공개

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Anthropic

Anthropic은 2026년 6월 23일(한국시간), Slack 채널에서 호출해 팀의 작업을 맡길 수 있는 Claude Tag를 Enterprise·Team 고객 대상 베타로 공개했다. 채널 구성원이 @Claude를 태그하면 요청을 단계별로 처리하고, 허용된 도구로 작업한 결과를 Slack 스레드에 남긴다. [S1]

### 채널별 기억과 비동기 작업

같은 채널의 구성원은 작업과 대화를 함께 이어 갈 수 있다. Claude는 접근이 허용된 채널의 맥락을 축적하며, 비동기 작업과 스스로 예약한 작업을 여러 시간이나 며칠에 걸쳐 수행할 수 있다고 회사는 설명했다. [S1]

### 관리자가 정하는 접근·사용 범위

관리자는 채널별 도구·정보 접근 범위를 정하고 기억도 그 범위 안에 두도록 설정한다. 조직·채널의 토큰 사용 한도를 지정하고, 수행한 작업과 요청자를 기록한 로그를 확인할 수 있다.

Anthropic은 자사 제품팀 코드의 65%가 내부 버전 Claude Tag에서 생성된다고 밝혔다. 해당 수치는 회사 내부 제품팀에 관한 설명이다. [S1]

**개념:** [[Knowledge/AI Systems/AI Agents]]

## GitHub Copilot 앱, 사용자 키와 로컬 모델로 에이전트 세션 실행 지원

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 6월 23일(한국시간), Copilot 앱에서 사용자의 모델 제공자와 인증 키를 사용하는 BYOK 기능을 발표했다. OpenAI·Azure OpenAI·Microsoft Foundry·Anthropic, LM Studio·Ollama 및 OpenAI 호환 엔드포인트를 에이전트 세션에 연결할 수 있다. [S2]

### 설정과 세션별 모델 선택

Settings의 Model Providers에 엔드포인트와 API 키를 등록한다. LM Studio·Ollama에는 호스트를 지정하며, 등록한 모델은 Copilot 제공 모델과 함께 선택 목록에 나타난다. 키는 로컬 운영체제의 키체인에 보관되고 UI에서 다시 읽지 않는다고 GitHub는 설명했다. [S2]

### 기존 계정과 조직 정책

사용자는 기존 제공자의 결제·할당량·지역·데이터 처리 조건을 유지하며 자체 클라우드 계정이나 내부 게이트웨이로 추론 요청을 보낼 수 있다. Business·Enterprise 요금제에서 앱을 이용하려면 관리자가 정책에서 Copilot CLI를 활성화해야 한다. [S2]

## OpenAI, Appia Foundation의 AI 표준·평가 기준 공동 개발 참여 소개

**분야:** AI
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 기술 제휴
**기업·기관:** OpenAI, Appia Foundation, Linux Foundation

OpenAI는 2026년 6월 23일, Linux Foundation이 주관하는 Appia Foundation의 설립에 참여했다고 소개했다. Appia는 국제 표준과 기존 프레임워크를 AI 가치사슬에서 사용할 수 있는 실용적인 평가 기준으로 옮기는 개방형·모듈형 규격을 개발할 계획이다. [S3] [S4]

### 평가 증거를 조직 사이에서 재사용

OpenAI는 모델·인프라·애플리케이션을 서로 다른 조직이 개발할 때 제3자가 표준 적합성을 확인하고, 그 증거를 명확하고 재사용 가능한 형태로 제공하는 구조를 목표로 설명했다. [S3]

### Appia FAQ가 설명하는 규격의 역할

Appia의 FAQ는 규격을 요구사항·지침과 평가 지원의 두 층으로 설명한다. 상위 제공자가 담당 부분의 적합성을 입증한 증거를 하위 조직이 활용하되, 각 조직은 자신의 역할과 사용에 책임을 진다는 구조다.

FAQ는 기술적 적합성 결과와 법적 준수 여부를 구분한다. 법적 의무 충족 여부는 적용되는 법체계와 관할에 따라 결정되며, 재단이 규제 권한이나 준수 지위를 부여하는 것은 아니라고 명시한다. [S4]

## AWS, AgentCore 공동 인프라에서 고객 데이터·메모리·비용을 나누는 예제 공개

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** AWS

AWS는 2026년 6월 24일(한국시간), Amazon Bedrock AgentCore로 여러 고객이 인프라를 공유하면서 데이터를 분리하는 구현 예제를 공개했다. 진료소·병원을 가정한 예제에서 서비스 등급·고객·사용자 계층에 따라 문서 검색, 에이전트 기억, 모델 사용과 비용 추적을 구성했다. [S5]

### 검색·도구·메모리의 고객 범위

Cognito 토큰의 서비스 등급과 clinic\_id를 고객 문맥으로 전달한다. 서비스 등급별 S3 버킷 안의 고객 경로로 문서를 나누고, Knowledge Base 검색에는 clinic\_id 메타데이터 필터를 적용한다.

Gateway는 Lambda의 patient\_context·clinic\_config 함수를 MCP 도구로 제공한다. 고객 문맥을 헤더로 전달하며, 도구 Lambda는 고객 태그를 가진 임시 자격증명으로 DynamoDB의 접근 범위를 제한하는 패턴을 사용한다.

메모리는 서비스 등급·clinic\_id·사용자 ID를 합친 actor\_id와 이름공간으로 구분한다. 실행 시 얻는 임시 자격증명에 같은 세 가지 태그를 넣어 접근 범위를 제한한다. [S5]

### 서비스 등급 비용과 고객별 토큰 사용량

서비스 등급마다 Bedrock Project와 비용 태그를 두고 추론 요청에 프로젝트 ID를 전달한다. 고객별 사용량은 clinic\_id·모델·입출력 토큰을 구조화 로그로 기록하며, 비용은 토큰 수와 모델별 단가로 추산하는 방식이다. [S5]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]], [[Knowledge/AI Systems/Metadata Filtering]]

## Microsoft, Copilot 대화에 SPFx 업무 화면을 띄우는 SharePoint Copilot Apps 소개

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Microsoft

Microsoft는 2026년 6월 23일(한국시간), SharePoint Framework(SPFx) 구성요소를 Copilot 캔버스에 표시하는 SharePoint Copilot Apps를 소개했다. MCP Apps 모델을 바탕으로 대화 안에서 업무 화면을 열고 동작을 수행하도록 하며, 같은 구성요소를 Copilot·SharePoint·Teams에 재사용할 수 있다고 설명했다. [S6]

### 개발과 호스팅

SPFx는 React·Angular·Vue·Svelte·TypeScript 등 웹 개발 기술을 지원한다. 구성요소는 Microsoft 365 고객 테넌트에 자동 호스팅되고, 플랫폼이 요청을 해당 도구로 전달하는 구조라고 Microsoft는 설명했다. [S6]

### 최초 일정과 이후 수정

최초 글은 SPFx v1.24 프리뷰와 함께 7월 초 프리뷰를 제공하고 가을에 일반 제공을 순차 진행할 계획을 제시했다.

9월 23일 추가한 문구에서는 명칭을 UX components in Copilot으로 바꾸고, SPFx 1.24에 포함해 2026년 10월부터 일반 제공할 계획이라고 안내했다. [S6]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]

## Hugging Face, AI 초안·PR 대조·사람 검토로 huggingface_hub 주간 릴리스 구성

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** Hugging Face

Hugging Face는 2026년 6월 23일(한국시간), huggingface\_hub를 기존 4\~6주에서 주간 릴리스로 전환한 작업 흐름을 공개했다. GitHub Actions가 절차를 실행하고 OpenCode와 공개 가중치 모델이 릴리스 노트·Slack 공지를 초안 작성하며, 사람이 검토·수정한다. [S7]

### 누락·추가 PR 대조와 문서 변경 근거

모델 실행 전에 릴리스에 속한 PR 목록을 저장하고 초안의 PR 참조와 비교해 빠진 항목과 추가된 항목을 찾는다. 모델에는 PR 제목뿐 아니라 실제 docs 디렉터리의 Markdown 변경 내용도 전달한다. [S7]

### 후보 검증과 초안 이력

릴리스 후보를 transformers·datasets·diffusers·sentence-transformers에 고정한 테스트 브랜치를 열어 하위 라이브러리 CI에서 문제를 확인한다. 원래 AI 초안과 사람이 편집한 최종 원고는 함께 보관한다. [S7]

## Transformers.js, 해시로 모델 파일을 공유하는 Cross-Origin Storage 실험 소개

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** Hugging Face

Hugging Face 블로그는 2026년 6월 23일(한국시간), Transformers.js에서 Cross-Origin Storage 제안을 시험하는 방법을 소개했다. 서로 다른 웹사이트가 같은 모델·WebAssembly 파일을 반복 저장하는 문제를 줄이기 위해, 파일의 암호학적 해시를 키로 사용하는 공유 저장소를 제안한다. [S8]

### 저장 시 검증과 공개 범위

파일을 쓸 때 선언한 해시와 실제 내용이 일치해야 저장된다. origins 설정은 전역 공개, 지정한 사이트 목록, 기본값인 같은 사이트 범위를 구분하며, API는 URL 대신 해시로 파일을 찾는다. [S8]

### 선택적으로 켜는 실험 경로

글에서 소개한 API는 아직 브라우저에 기본 구현되지 않은 초기 제안이다. 확장 프로그램의 polyfill과 Transformers.js의 experimental\_useCrossOriginStorage 설정으로 시험하며, API가 없으면 기본 Cache API 경로를 사용한다.

공유 파일이 이용자의 방문 기록을 드러내지 않도록, 브라우저가 파일 존재 확인을 제한하는 방식을 제안한다. 저장소 조회 오류가 나면 앱은 네트워크 다운로드로 돌아가도록 설명했다. [S8]

## 코딩 에이전트 탐지 연구, 저장소 파일·커밋·계정 신호를 함께 대조

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 23일 arXiv에, 1억8천만 개 이상 Git 저장소에서 AI 코딩 에이전트의 흔적을 여러 방식으로 탐지하는 사전공개 논문을 제출했다. v1 초록은 설정 파일·커밋 메시지·작성자 식별·봇 서명을 결합하고 탐지 유형에 따라 활동을 분류했다고 설명한다. [S9]

### 한 가지 신호로 찾은 커밋의 비율

한 스냅샷에서 여러 탐지 방법으로 찾은 Claude Code 커밋은 850,157개였고, 봇 계정 조회로 회수한 것은 28,154개(3.3%)였다. 이는 해당 표본에서 탐지 방식별 회수량을 비교한 수치다.

연구진은 탐지 패턴을 495개 수작업 라벨로 검증했다. PR 조사와 커밋 탐지가 서로 다른 도입 집단과 작업을 잡아내며, 관찰된 작업 구성은 도구 자체뿐 아니라 배포·탐지 방식에 영향을 받는다고 초록은 설명한다. [S9]

## Grad Detect 연구, 추론 중 기울기 패턴으로 환각·답변 유보를 예측

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** 없음

연구진은 2026년 6월 23일 arXiv에, 언어 모델의 층별 기울기를 분석해 환각을 예측하는 Grad Detect 사전공개 논문을 제출했다. v1 초록에 따르면 추론 중 한 번의 순전파·역전파에서 얻은 기울기 패턴으로 답변의 정확성과 답변 유보를 예측한다. [S10]

### 비교 대상과 층별 분석

연구진은 여러 질의응답 벤치마크에서 신뢰도 기반·샘플링 기반 탐지 방법과 비교해 더 좋은 결과를 보고했다. 초록에서 제시한 비교 범위는 환각 탐지와 답변 유보 예측이다.

네 가지 구조 계열의 모델 11개를 대상으로 한 층 제거 실험에서, 마지막 다섯 층에 판별용 기울기 신호의 97% 이상이 집중됐다고 보고했다. 이 비율은 신호가 집중된 위치에 관한 결과이며 환각 탐지 정확도 수치가 아니다. [S10]

## RAG 개인정보 보호 연구, 검색 문서를 세 에이전트로 오프라인 재작성

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** 없음

연구진은 2026년 6월 23일 arXiv에, 검색 결과 문서의 민감 식별자를 제거하고 의미를 유지하는 RAG 개인정보 보호 방법을 사전공개했다. v1 초록은 개인정보 추출·의미 분석·재구성 담당 에이전트를 결합해, 온라인 추론 전에 문서를 한 번 재작성하는 구성을 제안한다. [S11]

### 데이터셋과 표적 공격 결과

ChatDoctor·Wiki-PII와 여섯 언어 모델에서 평가했으며, LLaMA-3-8B의 표적 정보 노출은 기준 방법의 144건에서 1건으로 줄었다고 초록은 보고했다. [S11]

### 문맥 보존과 사전 처리

문맥 보존을 평가하는 BLEU-1은 제안 방법이 0.122, 비교 방법 SAGE가 0.117이었다. 재작성은 일회성 오프라인 전처리로 수행하므로 온라인 추론 단계에 추가 지연을 넣지 않는 구성이라고 연구진은 설명했다. [S11]

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

- [S1] https://www.anthropic.com/news/introducing-claude-tag
- [S2] https://github.blog/changelog/2026-06-23-github-copilot-app-support-for-byok/
- [S3] https://openai.com/index/helping-build-shared-standards-for-advanced-ai/
- [S4] https://appiafoundation.org/
- [S5] https://aws.amazon.com/blogs/machine-learning/shared-infrastructure-isolated-tenants-pool-model-multi-tenancy-with-amazon-bedrock-agentcore/
- [S6] https://devblogs.microsoft.com/microsoft365dev/going-beyond-text-in-microsoft-365-copilot-introducing-sharepoint-copilot-apps/
- [S7] https://huggingface.co/blog/huggingface-hub-release-ci
- [S8] https://huggingface.co/blog/cross-origin-storage
- [S9] https://arxiv.org/abs/2606.24429v1
- [S10] https://arxiv.org/abs/2606.24790v1
- [S11] https://arxiv.org/abs/2606.24623v1
