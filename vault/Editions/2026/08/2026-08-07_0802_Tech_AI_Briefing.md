---
title: 2026-08-07 Tech & AI Briefing
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-08-07
timezone: Asia/Seoul
coverage_start: 2026-08-06T08:02:08+09:00
coverage_end: 2026-08-07T08:02:13+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 8
new_items_count: 6
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]"
  - "[[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented
    Generation]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - OpenAI, ChatGPT용 Sol 업데이트와 추론량 조절 기능 발표
  - Cloudflare, 무상태 MCP 규격을 Workers에서 지원
  - Cloudflare AI Search, 사이트맵 없는 수집과 공통 검색 엔드포인트 추가
  - Cloudflare, 기존 사이트에 WebMCP 도구를 연결하는 개발자 프리뷰 공개
  - Cloudflare, Workers에서 실행하는 에이전트용 브라우저 Kitesurf 베타 공개
article_records:
  - title: OpenAI, ChatGPT용 Sol 업데이트와 추론량 조절 기능 발표
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenAI
      when: 2026-08-06
      where: 미기재
      what: ChatGPT 업데이트 및 GPT-5.6 Sol·Luna 모델 도입
      how: Free/Go 사용자에게 새 기본 모델, Plus/Pro 사용자에게 GPT-5.6 Sol 업데이트 버전 제공
      why: 미기재
    lead: OpenAI는 2026년 8월 6일 ChatGPT의 Plus·Pro 이용자에게 업데이트된 GPT-5.6 Sol과 답변에 들이는
      추론량을 고르는 슬라이더를 제공한다고 발표했다. Free·Go의 기본 모델도 새 모델로 바뀔 예정이며, Codex와 ChatGPT
      Work의 Sol·Luna는 기존 7월 버전을 유지한다.
    explanations:
      - heading: 적용되는 서비스와 기존 모델
        paragraphs:
          - 이번 시스템 카드는 ChatGPT에 제공할 8월 버전을 다룬다. OpenAI는 새 모델들이 GPT-5.5 Instant를
            대체할 예정이라고 밝혔으며, Codex와 ChatGPT Work에서 사용하는 7월 버전과 구분했다.
        source_urls:
          - https://deploymentsafety.openai.com/gpt-5-6-august-update
      - heading: 사실 오류율 비교의 대상과 측정 방법
        paragraphs:
          - OpenAI가 사용한 평가 자료는 사실 확인이 많이 필요한 ChatGPT 대화, 이전 모델에서 사용자가 사실 오류를 신고한
            비식별화 대화, 어려운 의료·법률·금융 질문의 세 묶음이다. 오류가 나기 쉬운 사례를 골라 구성한 평가이며, 일반 이용자의
            전체 대화를 표본으로 삼은 오류율과는 구분된다.
          - 회사는 웹에 접근하는 언어 모델로 답변을 채점해, 사실 오류가 있는 주장 비율과 사실 오류가 하나 이상 있는 응답 비율을
            각각 보고했다. GPT-5.5 Instant와 비교해 Luna의 사실 오류율은 의료·법률·금융 질문에서 60% 초과,
            나머지 두 묶음에서 약 30% 감소했다고 밝혔다. Sol은 세 묶음에서 약 60% 감소했다고 보고했다.
        source_urls:
          - https://deploymentsafety.openai.com/gpt-5-6-august-update
    papers: []
    relations: []
    topic_ids: []
  - title: Cloudflare, 무상태 MCP 규격을 Workers에서 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cloudflare
      when: 2026-08-06
      where: 미기재
      what: MCP 2026-07-28 규격의 Cloudflare 지원
      how: Workers와 Agents SDK를 통한 무상태 MCP 서버 지원
      why: 미기재
    lead: Cloudflare는 2026년 8월 6일 새 MCP 규격을 자사 플랫폼에서 사용할 수 있으며, Workers에 무상태 MCP 서버를
      배포할 수 있다고 발표했다. 이 규격은 MCP 유지관리팀이 7월 28일 공개한 것으로, 필수 핸드셰이크와 Mcp-Session-Id
      헤더를 핵심 요청 경로에서 제거했다.
    explanations:
      - heading: 요청의 상태와 애플리케이션의 상태를 구분
        paragraphs:
          - 무상태가 되는 것은 프로토콜의 요청 경로다. 애플리케이션에 상태가 필요하면 상태를 계속 유지할 수 있으며,
            Cloudflare는 이런 경우 Durable Objects를 사용하도록 안내했다. Agents SDK도 새 규격을
            지원한다.
        source_urls:
          - https://blog.cloudflare.com/mcp-v2/
          - https://blog.modelcontextprotocol.io/posts/2026-07-28/
      - heading: 사용자 입력과 기존 서버의 이전 방식
        paragraphs:
          - MRTR은 서버가 input_required 결과로 필요한 입력을 요청하면 클라이언트가 답을 inputResponses에
            담아 원래 작업을 다시 요청하는 방식이다. 사용자 답변을 기다리는 동안 양방향 스트림을 계속 열어 둘 필요가 없다.
          - 새 Streamable HTTP 요청에는 Mcp-Method와 Mcp-Name 헤더가 필요하다. Cloudflare의
            /mcp 경로는 2025년 Streamable HTTP 클라이언트의 무상태 요청도 받지만, 이전 세션이나 독립 스트림에
            의존하는 서버에는 별도 이전 작업이 필요하다고 설명했다.
          - 이 규격에서 deprecated 상태가 된 기능은 제거 전까지 최소 12개월의 이전 기간을 제공한다.
        source_urls:
          - https://blog.cloudflare.com/mcp-v2/
          - https://blog.modelcontextprotocol.io/posts/2026-07-28/
      - heading: Cloudflare가 설명한 공개 표준의 역할
        paragraphs:
          - Cloudflare는 에이전트용 인터넷 소개에서 MCP를 x402, Web Bot Auth, PACT와 함께 누구나 구현할
            수 있는 공개 표준으로 설명했다. 사이트 운영자가 인증 제공업체·결제 처리업체·에이전트 파트너를 선택한다고 밝혔다.
        source_urls:
          - https://blog.cloudflare.com/the-agentic-internet/
    papers: []
    relations: []
    topic_ids: []
  - title: Cloudflare AI Search, 사이트맵 없는 수집과 공통 검색 엔드포인트 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cloudflare
      when: 2026-08-06
      where: 미기재
      what: AI Search의 개발자 경험 개선 및 'Discover' 파싱 옵션 도입
      how: Workers AI, AI Gateway, Vectorize, R2, Browser Run 등 Cloudflare 기본 구성 요소를
        활용한 자동 관리 기능 추가
      why: 미기재
    lead: Cloudflare는 2026년 8월 6일 AI Search의 검색 관리 기능을 개선하고, 사이트맵 없는 수집 옵션과 공통 검색
      엔드포인트를 발표했다. 네임스페이스의 공개 URL을 켜면 /search와 /mcp에서 여러 검색 인스턴스나 웹사이트를 인증 없이 함께
      조회할 수 있다. 웹사이트를 자료로 넣을 때에는 사용자의 Cloudflare 계정에 등록된 소유 사이트를 대상으로 하며,
      Discover 옵션은 사이트맵 없이 페이지를 찾도록 한다.
    explanations:
      - heading: 의미 검색과 키워드 검색을 함께 사용
        paragraphs:
          - Cloudflare는 하이브리드 검색이 의미 검색과 키워드 검색을 하나의 질의에 결합한다고 설명했다. 자사 블로그·개발자
            문서·Cloudflare.com 검색에도 이 방식을 사용한다고 밝혔다.
        source_urls:
          - https://blog.cloudflare.com/ai-search-easier/
      - heading: 공개 검색과 비공개 검색의 구성
        paragraphs:
          - 공개 검색 엔드포인트에는 사용자 지정 도메인을 연결할 수 있다. Cloudflare Access를 추가하면 비공개 검색
            인스턴스를 구성할 수 있다고 안내했다.
        source_urls:
          - https://blog.cloudflare.com/ai-search-easier/
      - heading: 크롤링 정책과 에이전트 연결
        paragraphs:
          - 회사는 AI Search가 Browser Run의 /crawl을 사용하고 Cloudflare-AI-Search라는 봇
            이름으로 자신을 식별하며, robots.txt와 사이트의 봇 제어 설정을 따른다고 설명했다.
          - Cloudflare Dev Stack MCP는 개발 문서를 인용한 검색 결과를 코딩 에이전트에 제공하는 활용 사례다.
            회사는 Worker에서 여러 검색 인스턴스를 조회하는 기능을 기존 MCP 도구와 함께 노출했다고 설명했다.
        source_urls:
          - https://blog.cloudflare.com/ai-search-easier/
    papers: []
    relations: []
    topic_ids: []
  - title: Cloudflare, 기존 사이트에 WebMCP 도구를 연결하는 개발자 프리뷰 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cloudflare
      when: 2026-08-06
      where: 미기재
      what: WebMCP 개발자 프리뷰 출시
      how: HTMLRewriter를 통해 엣지에서 same-origin 브릿지 스크립트 주입
      why: 브라우저 에이전트가 사이트를 상호작용할 수 있도록 지원
    lead: Cloudflare는 2026년 8월 6일 기존 사이트에 브라우저 에이전트용 도구를 붙이는 WebMCP 개발자 프리뷰를 공개했다.
      도메인에서 기능을 켜면 Cloudflare가 페이지에 연결 스크립트를 추가하며, 사이트 원본 코드나 배포를 바꿀 필요는 없다고
      설명했다.
    explanations:
      - heading: 브라우저 안에서 동작하는 연결
        paragraphs:
          - Cloudflare는 HTMLRewriter로 같은 출처의 스크립트를 HTML 응답에 삽입한다고 설명했다. 브라우저가
            WebMCP를 지원하지 않으면 이 스크립트는 동작하지 않는다. 자사 원격 브라우저 BrowserRun에서는 사이트가 노출한
            도구를 찾아 호출할 수 있다고 밝혔다.
        source_urls:
          - https://blog.cloudflare.com/webmcp/
      - heading: 사이트 도구와 이미지 메타데이터
        paragraphs:
          - 프리뷰에는 Content Credentials와 Site MCP Server 도구 팩이 포함된다. 두 팩 모두 방문자의
            브라우저에서 실행된다.
          - Site MCP Server 팩은 도구를 찾은 뒤 등록하고, 방문자의 기존 세션을 사용해 페이지에서 사이트의 MCP
            엔드포인트로 직접 연결한다.
          - "Content Credentials의 inspect_image_c2pa는 이미지의 작성자·편집 이력·서명 인증서가 담긴
            메타데이터를 읽는다. 이 프리뷰는 암호학적 서명 검증을 수행하지 않으며 결과에 signatureVerified:
            false를 표시한다."
        source_urls:
          - https://blog.cloudflare.com/webmcp/
    papers: []
    relations: []
    topic_ids: []
  - title: Cloudflare, Workers에서 실행하는 에이전트용 브라우저 Kitesurf 베타 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Cloudflare
      when: 2026-08-06
      where: 미기재
      what: 에이전트 전용 브라우저 Kitesurf 베타 공개
      how: Workers 기반 V8 isolates에서 실행되며, Browser Run의 CDP 및 Quick Action 엔드포인트에서
        browser=kitesurf로 선택 가능
      why: 미기재
    lead: Cloudflare는 2026년 8월 6일 Workers의 V8 격리 환경에서 실행하는 에이전트용 브라우저 Kitesurf를
      공개했다. Browser Run에서 계정별 이용 한도 아래 베타 기간 무료로 제공하며, 기존 CDP·Quick Action
      엔드포인트에 browser=kitesurf를 지정해 사용할 수 있다고 안내했다.
    explanations:
      - heading: 구현과 기존 도구 연결
        paragraphs:
          - Kitesurf는 Rust로 작성된 Blitz와 Stylo를 이용해 HTML과 CSS를 파싱한다. Workers에 네이티브
            eval 지원이 없어 Boa JS로 해당 코드를 실행한다고 회사는 설명했다.
          - Engine은 CDP의 WebSocket과 HTTP REST API를 처리하며 Puppeteer·Playwright 등의
            클라이언트를 연결한다. 회사는 현재 CDP의 일부를 지원하며 범위를 확장하고 있다고 밝혔다.
        source_urls:
          - https://blog.cloudflare.com/kitesurf/
      - heading: 회사가 공개한 스크린샷 비교
        paragraphs:
          - Cloudflare는 14개 URL을 대상으로 Browser Run Quick Action을 5회 실행한 중앙값을
            공개했다. 스크린샷의 CPU 시간은 Kitesurf 380ms와 예열된 풀의 Chromium 1,173ms, 메모리는 각각
            57.8MiB와 271.0MiB였다. 전체 경과 시간은 Kitesurf 1,148ms와 Chromium 637ms로
            Kitesurf가 더 오래 걸렸다.
        source_urls:
          - https://blog.cloudflare.com/kitesurf/
      - heading: 지원하는 작업 범위
        paragraphs:
          - 회사는 동영상 재생, WebGL, 실제 TLS 지문이 필요한 봇 챌린지, 지속적인 상태가 필요한 장기 인증 세션에는 기본
            Chromium을 쓰도록 안내했다.
        source_urls:
          - https://blog.cloudflare.com/kitesurf/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, Kimi K3의 Copilot 배포 재개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-08-06
      where: 미기재
      what: GitHub Copilot에 Kimi K3 제공 재개
      how: Fireworks AI를 통한 호스팅 및 점진적 롤아웃
      why: 미기재
    lead: GitHub는 2026년 8월 6일 Kimi K3의 GitHub Copilot 배포를 재개했다고 발표했다. Kimi K3는
      GitHub가 Fireworks AI를 통해 호스팅하는 오픈웨이트 모델로, Copilot Pro, Pro+, Max,
      Business, Enterprise 플랜에 순차적으로 적용된다. Copilot Business와 Enterprise에서는 기본
      비활성화 상태로, 관리자가 설정에서 Kimi K3 정책을 활성화해야 사용 가능하다.
    explanations:
      - heading: 중단·재개와 과금 방식
        paragraphs:
          - 발표문에는 GitHub Actions 사고 대응 중 배포를 일시 중단했다는 편집자 주와 재개했다는 편집자 주가 함께 실려
            있다. 재개 안내에서 GitHub는 제공업체의 가격표에 따라 사용량 기준으로 과금한다고 설명했다.
        source_urls:
          - https://github.blog/changelog/2026-08-06-kimi-k3-is-now-available-in-github-copilot
      - heading: 모델 선택이 가능한 환경
        paragraphs:
          - GitHub가 안내한 모델 선택 환경은 Visual Studio Code, Visual Studio, Copilot
            CLI, 클라우드 에이전트, Copilot 앱, github.com, 모바일, JetBrains, Xcode,
            Eclipse다.
        source_urls:
          - https://github.blog/changelog/2026-08-06-kimi-k3-is-now-available-in-github-copilot
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: OpenAI, ChatGPT용 Sol 업데이트와 추론량 조절 기능 발표
    event_id: 1bc83fc4634ab269
    review_status: verified
    published_at: 2026-08-06
    reviewed_at: 2026-10-05
    concept_ids: []
  - title: Cloudflare, 무상태 MCP 규격을 Workers에서 지원
    event_id: f66aea27eeabe66a
    review_status: verified
    published_at: 2026-08-06
    reviewed_at: 2026-10-05
    concept_ids:
      - mcp
  - title: Cloudflare AI Search, 사이트맵 없는 수집과 공통 검색 엔드포인트 추가
    event_id: 54aa107c534ae476
    review_status: verified
    published_at: 2026-08-06
    reviewed_at: 2026-10-05
    concept_ids:
      - mcp
  - title: Cloudflare, 기존 사이트에 WebMCP 도구를 연결하는 개발자 프리뷰 공개
    event_id: cb25a842d58a5ffc
    review_status: verified
    published_at: 2026-08-06
    reviewed_at: 2026-10-05
    concept_ids:
      - mcp
  - title: Cloudflare, Workers에서 실행하는 에이전트용 브라우저 Kitesurf 베타 공개
    event_id: d13caba5351daa86
    review_status: verified
    published_at: 2026-08-06
    reviewed_at: 2026-10-05
    concept_ids: []
  - title: GitHub, Kimi K3의 Copilot 배포 재개
    event_id: 412eeeaddaef78db
    review_status: verified
    published_at: 2026-08-06
    reviewed_at: 2026-10-04
    concept_ids: []
---

# 이번 호 표지

OpenAI, ChatGPT용 Sol 업데이트와 추론량 조절 기능 발표

# 차례

- OpenAI, ChatGPT용 Sol 업데이트와 추론량 조절 기능 발표
- Cloudflare, 무상태 MCP 규격을 Workers에서 지원
- Cloudflare AI Search, 사이트맵 없는 수집과 공통 검색 엔드포인트 추가
- Cloudflare, 기존 사이트에 WebMCP 도구를 연결하는 개발자 프리뷰 공개
- Cloudflare, Workers에서 실행하는 에이전트용 브라우저 Kitesurf 베타 공개

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI, ChatGPT용 Sol 업데이트와 추론량 조절 기능 발표

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** OpenAI

OpenAI는 2026년 8월 6일 ChatGPT의 Plus·Pro 이용자에게 업데이트된 GPT-5.6 Sol과 답변에 들이는 추론량을 고르는 슬라이더를 제공한다고 발표했다. Free·Go의 기본 모델도 새 모델로 바뀔 예정이며, Codex와 ChatGPT Work의 Sol·Luna는 기존 7월 버전을 유지한다. [S1]

### 적용되는 서비스와 기존 모델

이번 시스템 카드는 ChatGPT에 제공할 8월 버전을 다룬다. OpenAI는 새 모델들이 GPT-5.5 Instant를 대체할 예정이라고 밝혔으며, Codex와 ChatGPT Work에서 사용하는 7월 버전과 구분했다. [S1]

### 사실 오류율 비교의 대상과 측정 방법

OpenAI가 사용한 평가 자료는 사실 확인이 많이 필요한 ChatGPT 대화, 이전 모델에서 사용자가 사실 오류를 신고한 비식별화 대화, 어려운 의료·법률·금융 질문의 세 묶음이다. 오류가 나기 쉬운 사례를 골라 구성한 평가이며, 일반 이용자의 전체 대화를 표본으로 삼은 오류율과는 구분된다.

회사는 웹에 접근하는 언어 모델로 답변을 채점해, 사실 오류가 있는 주장 비율과 사실 오류가 하나 이상 있는 응답 비율을 각각 보고했다. GPT-5.5 Instant와 비교해 Luna의 사실 오류율은 의료·법률·금융 질문에서 60% 초과, 나머지 두 묶음에서 약 30% 감소했다고 밝혔다. Sol은 세 묶음에서 약 60% 감소했다고 보고했다. [S1]

## Cloudflare, 무상태 MCP 규격을 Workers에서 지원

**분야:** 소프트웨어·클라우드
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 표준 채택, 호환성
**기업·기관:** Cloudflare

Cloudflare는 2026년 8월 6일 새 MCP 규격을 자사 플랫폼에서 사용할 수 있으며, Workers에 무상태 MCP 서버를 배포할 수 있다고 발표했다. 이 규격은 MCP 유지관리팀이 7월 28일 공개한 것으로, 필수 핸드셰이크와 Mcp-Session-Id 헤더를 핵심 요청 경로에서 제거했다. [S2] [S3] [S4]

### 요청의 상태와 애플리케이션의 상태를 구분

무상태가 되는 것은 프로토콜의 요청 경로다. 애플리케이션에 상태가 필요하면 상태를 계속 유지할 수 있으며, Cloudflare는 이런 경우 Durable Objects를 사용하도록 안내했다. Agents SDK도 새 규격을 지원한다. [S2] [S3]

### 사용자 입력과 기존 서버의 이전 방식

MRTR은 서버가 input_required 결과로 필요한 입력을 요청하면 클라이언트가 답을 inputResponses에 담아 원래 작업을 다시 요청하는 방식이다. 사용자 답변을 기다리는 동안 양방향 스트림을 계속 열어 둘 필요가 없다.

새 Streamable HTTP 요청에는 Mcp-Method와 Mcp-Name 헤더가 필요하다. Cloudflare의 /mcp 경로는 2025년 Streamable HTTP 클라이언트의 무상태 요청도 받지만, 이전 세션이나 독립 스트림에 의존하는 서버에는 별도 이전 작업이 필요하다고 설명했다.

이 규격에서 deprecated 상태가 된 기능은 제거 전까지 최소 12개월의 이전 기간을 제공한다. [S2] [S3]

### Cloudflare가 설명한 공개 표준의 역할

Cloudflare는 에이전트용 인터넷 소개에서 MCP를 x402, Web Bot Auth, PACT와 함께 누구나 구현할 수 있는 공개 표준으로 설명했다. 사이트 운영자가 인증 제공업체·결제 처리업체·에이전트 파트너를 선택한다고 밝혔다. [S4]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]

## Cloudflare AI Search, 사이트맵 없는 수집과 공통 검색 엔드포인트 추가

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Cloudflare

Cloudflare는 2026년 8월 6일 AI Search의 검색 관리 기능을 개선하고, 사이트맵 없는 수집 옵션과 공통 검색 엔드포인트를 발표했다. 네임스페이스의 공개 URL을 켜면 /search와 /mcp에서 여러 검색 인스턴스나 웹사이트를 인증 없이 함께 조회할 수 있다. 웹사이트를 자료로 넣을 때에는 사용자의 Cloudflare 계정에 등록된 소유 사이트를 대상으로 하며, Discover 옵션은 사이트맵 없이 페이지를 찾도록 한다. [S5]

### 의미 검색과 키워드 검색을 함께 사용

Cloudflare는 하이브리드 검색이 의미 검색과 키워드 검색을 하나의 질의에 결합한다고 설명했다. 자사 블로그·개발자 문서·Cloudflare.com 검색에도 이 방식을 사용한다고 밝혔다. [S5]

### 공개 검색과 비공개 검색의 구성

공개 검색 엔드포인트에는 사용자 지정 도메인을 연결할 수 있다. Cloudflare Access를 추가하면 비공개 검색 인스턴스를 구성할 수 있다고 안내했다. [S5]

### 크롤링 정책과 에이전트 연결

회사는 AI Search가 Browser Run의 /crawl을 사용하고 Cloudflare-AI-Search라는 봇 이름으로 자신을 식별하며, robots.txt와 사이트의 봇 제어 설정을 따른다고 설명했다.

Cloudflare Dev Stack MCP는 개발 문서를 인용한 검색 결과를 코딩 에이전트에 제공하는 활용 사례다. 회사는 Worker에서 여러 검색 인스턴스를 조회하는 기능을 기존 MCP 도구와 함께 노출했다고 설명했다. [S5]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]

## Cloudflare, 기존 사이트에 WebMCP 도구를 연결하는 개발자 프리뷰 공개

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** Cloudflare

Cloudflare는 2026년 8월 6일 기존 사이트에 브라우저 에이전트용 도구를 붙이는 WebMCP 개발자 프리뷰를 공개했다. 도메인에서 기능을 켜면 Cloudflare가 페이지에 연결 스크립트를 추가하며, 사이트 원본 코드나 배포를 바꿀 필요는 없다고 설명했다. [S6]

### 브라우저 안에서 동작하는 연결

Cloudflare는 HTMLRewriter로 같은 출처의 스크립트를 HTML 응답에 삽입한다고 설명했다. 브라우저가 WebMCP를 지원하지 않으면 이 스크립트는 동작하지 않는다. 자사 원격 브라우저 BrowserRun에서는 사이트가 노출한 도구를 찾아 호출할 수 있다고 밝혔다. [S6]

### 사이트 도구와 이미지 메타데이터

프리뷰에는 Content Credentials와 Site MCP Server 도구 팩이 포함된다. 두 팩 모두 방문자의 브라우저에서 실행된다.

Site MCP Server 팩은 도구를 찾은 뒤 등록하고, 방문자의 기존 세션을 사용해 페이지에서 사이트의 MCP 엔드포인트로 직접 연결한다.

Content Credentials의 inspect_image_c2pa는 이미지의 작성자·편집 이력·서명 인증서가 담긴 메타데이터를 읽는다. 이 프리뷰는 암호학적 서명 검증을 수행하지 않으며 결과에 signatureVerified: false를 표시한다. [S6]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]

## Cloudflare, Workers에서 실행하는 에이전트용 브라우저 Kitesurf 베타 공개

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** Cloudflare

Cloudflare는 2026년 8월 6일 Workers의 V8 격리 환경에서 실행하는 에이전트용 브라우저 Kitesurf를 공개했다. Browser Run에서 계정별 이용 한도 아래 베타 기간 무료로 제공하며, 기존 CDP·Quick Action 엔드포인트에 browser=kitesurf를 지정해 사용할 수 있다고 안내했다. [S7]

### 구현과 기존 도구 연결

Kitesurf는 Rust로 작성된 Blitz와 Stylo를 이용해 HTML과 CSS를 파싱한다. Workers에 네이티브 eval 지원이 없어 Boa JS로 해당 코드를 실행한다고 회사는 설명했다.

Engine은 CDP의 WebSocket과 HTTP REST API를 처리하며 Puppeteer·Playwright 등의 클라이언트를 연결한다. 회사는 현재 CDP의 일부를 지원하며 범위를 확장하고 있다고 밝혔다. [S7]

### 회사가 공개한 스크린샷 비교

Cloudflare는 14개 URL을 대상으로 Browser Run Quick Action을 5회 실행한 중앙값을 공개했다. 스크린샷의 CPU 시간은 Kitesurf 380ms와 예열된 풀의 Chromium 1,173ms, 메모리는 각각 57.8MiB와 271.0MiB였다. 전체 경과 시간은 Kitesurf 1,148ms와 Chromium 637ms로 Kitesurf가 더 오래 걸렸다. [S7]

### 지원하는 작업 범위

회사는 동영상 재생, WebGL, 실제 TLS 지문이 필요한 봇 챌린지, 지속적인 상태가 필요한 장기 인증 세션에는 기본 Chromium을 쓰도록 안내했다. [S7]

## GitHub, Kimi K3의 Copilot 배포 재개

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 8월 6일 Kimi K3의 GitHub Copilot 배포를 재개했다고 발표했다. Kimi K3는 GitHub가 Fireworks AI를 통해 호스팅하는 오픈웨이트 모델로, Copilot Pro, Pro+, Max, Business, Enterprise 플랜에 순차적으로 적용된다. Copilot Business와 Enterprise에서는 기본 비활성화 상태로, 관리자가 설정에서 Kimi K3 정책을 활성화해야 사용 가능하다. [S8]

### 중단·재개와 과금 방식

발표문에는 GitHub Actions 사고 대응 중 배포를 일시 중단했다는 편집자 주와 재개했다는 편집자 주가 함께 실려 있다. 재개 안내에서 GitHub는 제공업체의 가격표에 따라 사용량 기준으로 과금한다고 설명했다. [S8]

### 모델 선택이 가능한 환경

GitHub가 안내한 모델 선택 환경은 Visual Studio Code, Visual Studio, Copilot CLI, 클라우드 에이전트, Copilot 앱, github.com, 모바일, JetBrains, Xcode, Eclipse다. [S8]

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

- [S1] https://deploymentsafety.openai.com/gpt-5-6-august-update
- [S2] https://blog.cloudflare.com/mcp-v2/
- [S3] https://blog.modelcontextprotocol.io/posts/2026-07-28/
- [S4] https://blog.cloudflare.com/the-agentic-internet/
- [S5] https://blog.cloudflare.com/ai-search-easier/
- [S6] https://blog.cloudflare.com/webmcp/
- [S7] https://blog.cloudflare.com/kitesurf/
- [S8] https://github.blog/changelog/2026-08-06-kimi-k3-is-now-available-in-github-copilot
