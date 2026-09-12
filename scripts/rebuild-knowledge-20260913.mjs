// One-time editorial reconstruction. Daily runs edit Markdown; never replay this migration.
import fs from "node:fs"
import path from "node:path"
import { walk, parseNote, noteText, sections, editions, extractArticles } from "./garden.mjs"
import { edgeLabels } from "../web/layout.mjs"
const sources = {
  agents: [
    "OpenAI Agents SDK · Agents",
    "https://openai.github.io/openai-agents-python/agents/",
    "모델·지시·도구·handoff·guardrail을 결합한 에이전트 실행 구성.",
  ],
  trace: [
    "OpenAI Agents SDK · Tracing",
    "https://openai.github.io/openai-agents-python/tracing/",
    "실행 trace와 span, 도구 호출·handoff·guardrail 기록.",
  ],
  eval: [
    "Anthropic · Demystifying evals for AI agents",
    "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
    "task, trial, grader, transcript, outcome을 구분한 평가 설계.",
  ],
  guard: [
    "OpenAI Agents SDK · Guardrails",
    "https://openai.github.io/openai-agents-python/guardrails/",
    "병렬 입력 검사에서 취소 전에 도구 부작용이 발생할 수 있는 경계.",
  ],
  mcp: [
    "MCP · Architecture (2025-11-25)",
    "https://modelcontextprotocol.io/specification/2025-11-25/architecture",
    "host-client-server, 1:1 연결, resources/tools/prompts, 호스트의 동의·권한 통제.",
  ],
  rag: [
    "Lewis et al. · Retrieval-Augmented Generation",
    "https://arxiv.org/abs/2005.11401",
    "파라미터 기억과 검색 가능한 외부 기억을 결합한 생성.",
  ],
  rmf: [
    "NIST · AI RMF Core 1.0",
    "https://airc.nist.gov/airmf-resources/airmf/5-sec-core/",
    "GOVERN/MAP/MEASURE/MANAGE, 생애주기 위험 관리와 책임 배분.",
  ],
  identity: [
    "NIST · Identity and Authority of Software Agents",
    "https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents",
    "에이전트 신원과 인가에 대한 개념 문서·의견 수렴. 의무 표준으로 해석하지 않음.",
  ],
  crawl: [
    "Cloudflare · AI Crawl Control",
    "https://blog.cloudflare.com/introducing-ai-crawl-control/",
    "크롤러별 접근 통제와 허용·차단, 라이선스 조건 전달.",
  ],
  pay: [
    "Cloudflare · Pay per crawl",
    "https://blog.cloudflare.com/introducing-pay-per-crawl/",
    "HTTP 402와 가격 헤더, 지불 의사 및 접근 처리.",
  ],
  vllm: [
    "vLLM · Serving",
    "https://docs.vllm.ai/en/latest/",
    "KV 메모리, 연속 배치, 양자화, 분산 추론 기능.",
  ],
  voice: [
    "OpenAI Agents SDK · Voice pipeline",
    "https://openai.github.io/openai-agents-python/voice/pipeline/",
    "음성 인식 → 업무 코드 → 음성 합성 파이프라인.",
  ],
  fda: [
    "FDA · AI-enabled medical devices",
    "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices",
    "기기별 사용 목적과 안전성·유효성 심사; 목록은 포괄적이지 않음.",
  ],
  wellness: [
    "FDA · General Wellness (January 2026)",
    "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices",
    "건강한 생활습관을 지원하는 저위험 제품에 대한 정책 범위.",
  ],
  eu: [
    "EU AI Act · Article 43",
    "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
    "고위험 시스템의 적합성 평가 경로와 중대한 변경 시 재평가. 시행 일정 일반화 제외.",
  ],
  science: [
    "Jumper et al. · AlphaFold",
    "https://www.nature.com/articles/s41586-021-03819-2",
    "서열·물리/생물 지식을 활용한 구조 예측과 CASP14 검증.",
  ],
  vla: [
    "Brohan et al. · RT-2",
    "https://arxiv.org/abs/2307.15818",
    "로봇 행동을 토큰으로 표현하고 웹 시각언어·로봇 궤적을 공동 학습.",
  ],
  timeseries: [
    "Ansari et al. · Chronos",
    "https://arxiv.org/abs/2403.07815",
    "시계열 스케일링·양자화·사전학습과 미관측 데이터셋의 zero-shot 평가.",
  ],
  metrics: [
    "Prometheus · Histograms and summaries",
    "https://prometheus.io/docs/practices/histograms/",
    "분포 집계와 분위수 계산. 사전 계산된 분위수 평균의 오류.",
  ],
  otel: [
    "OpenTelemetry · Metrics",
    "https://opentelemetry.io/docs/concepts/signals/metrics/",
    "런타임 측정, 집계, instrumentation의 관계.",
  ],
  zkp: [
    "NIST · Zero-Knowledge Proof",
    "https://csrc.nist.gov/glossary/term/zero_knowledge_proof",
    "비밀 내용을 추가로 공개하지 않고 명제의 참을 입증하는 암호학적 방식.",
  ],
  secure: [
    "GitHub · Security and quality AI features",
    "https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features",
    "CodeQL 발견에 대한 Autofix 수정 제안과 사람의 검토, 불완전 탐지 한계.",
  ],
  slsa: [
    "SLSA · Build levels v1.1",
    "https://slsa.dev/spec/v1.1/levels",
    "빌드 주체·과정·입력의 provenance와 위변조 방지 수준; L1은 위조 방지를 보장하지 않음.",
  ],
}
// id, canonical title, Korean label, semantic group, primary source keys,
// definition, scope, exclusion, mechanism, concrete example, limits, distinction, keywords
const rows = [
  [
    "agents",
    "AI Agents",
    "AI 에이전트",
    "에이전트",
    "agents",
    "모델이 지시와 현재 상태를 바탕으로 도구를 선택하고 결과를 받아 다음 행동을 정하는 실행 시스템이다.",
    "모델·도구·상태·반복 실행·종료 조건을 연결하는 런타임.",
    "고정 순서로 호출만 이어 붙인 모든 프로그램을 에이전트라고 부르지는 않는다.",
    "목표와 관측을 입력하고 모델이 행동을 선택한다. 런타임이 도구를 실행해 결과를 돌려주고, 완료·재시도·이관 조건을 판단한다.",
    "검색 도구로 근거를 찾고 파일 도구로 브리핑을 저장한 뒤 결과를 확인하는 조사 에이전트.",
    "긴 실행에서 오류가 누적된다. 도구 성공과 목표 달성이 다를 수 있어 종료 조건과 실제 결과 검증이 필요하다.",
    "MCP는 연결 규격이고, 에이전트는 그 규격을 사용할 수 있는 실행 주체다.",
    "도구 호출|실행 루프|상태|handoff",
  ],
  [
    "mcp",
    "Model Context Protocol",
    "MCP",
    "지식과 연결",
    "mcp",
    "AI 호스트와 외부 기능 제공 서버가 도구·리소스·프롬프트를 교환하는 프로토콜이다.",
    "호스트가 관리하는 클라이언트와 서버 간 능력 협상, 메시지 교환, 보안 경계.",
    "에이전트의 계획 능력이나 연결된 도구의 정확성 보증.",
    "호스트가 서버별 클라이언트를 만들고 연결 권한을 관리한다. 서버는 기능을 노출하고 클라이언트가 요청과 응답을 중계한다.",
    "문서 서버의 검색 도구를 AI 호스트가 발견하고 호출하는 연결.",
    "규격을 준수해도 서버를 신뢰할 수 있다는 뜻은 아니다. 동의·인가와 다른 서버의 정보 격리는 호스트가 관리한다.",
    "API 자체와 달리 AI 문맥 교환의 공통 인터페이스를 정의한다. RAG는 검색과 생성 방식이다.",
    "MCP|호스트|클라이언트|서버|JSON-RPC|도구",
  ],
  [
    "rag",
    "Retrieval-Augmented Generation",
    "검색 증강 생성",
    "지식과 연결",
    "rag",
    "질문과 관련된 외부 자료를 검색한 뒤 그 자료를 문맥으로 사용해 답변을 생성하는 방식이다.",
    "검색기·문서 색인·생성 모델을 결합하는 검색-생성 경로.",
    "검색 문서가 사실이라는 보증이나 모델 파라미터의 직접 갱신.",
    "질문으로 후보 문서를 찾고 관련 근거를 생성 모델에 넣는다. 원 논문은 검색 문서가 시퀀스 전체 또는 토큰마다 달라지는 구성을 비교했다.",
    "사내 매뉴얼에서 관련 절을 찾아 출처와 함께 답변하는 시스템.",
    "관련 문서를 놓치거나 오래된 문서를 고르면 답변도 흔들린다. 출처를 붙였다고 문장이 근거와 일치하는 것은 아니다.",
    "미세조정은 가중치를 바꾸고, RAG는 실행 시 참조 자료를 공급한다.",
    "RAG|검색기|문서 색인|근거|생성",
  ],
  [
    "evaluation",
    "Agent Evaluation",
    "에이전트 평가",
    "평가와 운영",
    "eval",
    "정의된 과제와 성공 기준 아래 에이전트를 반복 실행하고 결과·과정·환경 상태를 채점하는 활동이다.",
    "과제, 시도, 채점기, 실행 기록, 실제 결과를 포함한 평가 설계.",
    "한 번의 데모나 모델의 완료 선언만으로 하는 성공 판정.",
    "입력과 초기 환경을 정하고 여러 시도를 실행한다. 최종 응답뿐 아니라 바뀐 환경 상태를 채점하고 실패 유형을 비교한다.",
    "예약 에이전트의 응답과 실제 예약 레코드 생성을 각각 확인하는 평가.",
    "채점기가 잘못되면 올바른 행동을 실패로 판정할 수 있다. 테스트셋 성공률이 배포 환경의 성공률을 보장하지 않는다.",
    "관측성은 무슨 일이 있었는지 기록하고, 평가는 그 일이 목표와 기준을 만족했는지 판단한다.",
    "평가 과제|trial|grader|성공 기준|outcome",
  ],
  [
    "observability",
    "Agent Observability",
    "에이전트 관측성",
    "평가와 운영",
    "trace",
    "에이전트 실행의 모델 호출·도구 사용·이관·오류를 연결된 기록으로 남겨 경로와 원인을 살펴보는 능력이다.",
    "하나의 trace를 구성하는 span과 실행 문맥, 지연·오류 등 운영 증거.",
    "기록의 존재만으로 작업 품질이나 규정 준수를 인증하는 일.",
    "작업별 trace 안에 시작·종료 시각과 부모 span을 기록한다. 모델·도구·이관 이벤트를 연결해 실행 경로를 재구성한다.",
    "응답 지연을 모델 처리와 검색 도구 대기로 나누어 추적한다.",
    "기록 누락과 샘플링은 원인 분석을 제한한다. 입력·음성 같은 민감한 데이터의 수집 범위도 따로 정해야 한다.",
    "집계 지표는 여러 실행을 요약하고 trace는 개별 실행의 연결을 보여준다.",
    "trace|span|도구 호출|지연|오류",
  ],
  [
    "governance",
    "AI Governance",
    "AI 거버넌스",
    "위험과 책임",
    "rmf",
    "AI의 목적·책임·위험 허용 범위와 관리 절차를 조직의 생애주기 활동에 연결하는 체계다.",
    "역할, 감독, 위험 관리, 운영 정책과 재검토.",
    "특정 제품의 법적 적합성을 자동 인정하는 인증서.",
    "NIST AI RMF의 GOVERN은 MAP·MEASURE·MANAGE 전반에 걸친 기능이다. 네 기능은 고정된 일회성 순서가 아니라 반복 관리에 사용된다.",
    "담당자·사용 목적·점검 기준을 정하고 배포 후 위험을 주기적으로 재검토하는 조직 운영.",
    "정책 문서만 있고 실행 책임과 피드백이 없으면 통제가 작동하지 않는다.",
    "거버넌스는 지속적 운영 체계이며 적합성 평가는 특정 요구사항의 충족 여부를 확인하는 절차다.",
    "GOVERN|MAP|MEASURE|MANAGE|책임",
  ],
  [
    "agent-governance",
    "AI Agent Governance",
    "에이전트 거버넌스",
    "위험과 책임",
    "rmf|identity",
    "에이전트가 맡을 목표·위임 범위·승인·중단·책임을 정하고 운영 중 검토하는 거버넌스의 적용 범위다.",
    "조직의 AI 위험 관리를 에이전트의 자율 행동과 권한 위임에 적용하는 정책.",
    "특정 신원 규격 하나만 도입하면 완성되는 통제.",
    "업무 책임과 허용 행동을 정한 뒤 신원·권한 통제와 실행 기록으로 연결한다. 문제가 생기면 권한 회수와 사람 이관을 수행하도록 운영한다.",
    "문서 작성은 자동화하되 외부 전송은 지정 담당자가 승인하도록 정하는 운영 정책.",
    "NIST의 에이전트 신원 문서는 개념·의견 수렴 문서다. 이를 의무 인증이나 완성된 표준으로 취급하면 안 된다.",
    "에이전트 보안은 기술적 공격·권한 오용을 다루고, 거버넌스는 목적과 책임을 함께 정한다.",
    "위임|승인|중단|책임|인가",
  ],
  [
    "agent-security",
    "AI Agent Security",
    "에이전트 보안",
    "위험과 책임",
    "identity|guard|mcp",
    "에이전트의 신원·권한·입출력·도구 실행 경계를 보호해 공격이나 잘못된 행동의 영향을 줄이는 통제다.",
    "권한 검증, 도구 격리, 신뢰 경계, 실행 전 검사.",
    "모델 출력 필터 하나로 전체 실행을 안전하게 만드는 보증.",
    "누가 어떤 권한으로 행동하는지 확인하고, 외부 입력을 지시와 분리한다. 부작용을 막아야 하는 도구는 실행 전에 검사를 마친다.",
    "파일 삭제 도구 호출 전 대상 경로와 권한을 확인하고 실패하면 실행하지 않는 경계.",
    "병렬 guardrail은 검사 실패가 발견되기 전에 도구가 실행될 수 있다. 사후 취소가 이미 발생한 부작용을 되돌리지는 않는다.",
    "인가가 행동의 허용 여부라면 인증은 주체의 신원 확인이다. 둘은 같은 검사가 아니다.",
    "신원|인가|프롬프트 주입|신뢰 경계|guardrail",
  ],
  [
    "conformity",
    "AI Conformity Assessment",
    "AI 적합성 평가",
    "위험과 책임",
    "eu",
    "AI 시스템이 적용 대상 법·기술 요구사항을 충족하는지 정해진 증거와 절차로 확인하는 평가다.",
    "특정 사용 목적·시스템 버전·요구사항에 대응하는 기술 문서와 평가 절차.",
    "일반 벤치마크 점수가 높다는 이유만으로 하는 법적 준수 선언.",
    "대상 시스템과 적용 요건을 정하고 증거를 대응시킨다. EU AI Act 제43조는 시스템 유형별 경로와 중대한 변경 시 재평가를 다룬다.",
    "같은 모델이라도 고위험 제품의 사용 목적과 변경 내용에 맞춰 평가 자료를 구성하는 절차.",
    "관할·제품·변경 범위마다 요구가 다르다. 기존 평가 결과를 다른 버전과 용도에 그대로 확장할 수 없다.",
    "위험 관리 체계의 존재와 특정 요구사항의 충족 판정은 구분한다.",
    "사용 목적|기술 문서|적합성|중대한 변경",
  ],
  [
    "content-access",
    "AI Content Access",
    "AI 콘텐츠 접근",
    "지식과 연결",
    "crawl|mcp",
    "AI 크롤러나 도구가 외부 콘텐츠를 어떤 신원과 조건으로 읽을 수 있는지 관리하는 접근 경계다.",
    "요청 주체 식별, 허용·차단, 콘텐츠 제공 조건.",
    "접근을 허용했다는 이유로 모든 재사용 권한이나 지급 조건이 확정되는 일.",
    "콘텐츠 제공자가 크롤러별 정책을 정하고 요청에 허용·차단 응답을 보낸다. 별도 조건이 있으면 라이선스나 지불 경로를 알린다.",
    "Cloudflare AI Crawl Control로 개별 크롤러의 접근 정책을 관리하는 방식.",
    "봇 식별은 완전하지 않으며 접근 통제와 저작권·계약 해석은 다른 층위다.",
    "접근은 읽을 수 있는 조건이고, 수익화는 가격과 보상 방식이다.",
    "크롤러|접근 정책|허용|차단|라이선스",
  ],
  [
    "content-monetization",
    "AI Content Monetization",
    "AI 콘텐츠 수익화",
    "지식과 연결",
    "pay",
    "AI의 콘텐츠 이용에 가격·지불·정산 조건을 연결해 제공자에게 보상이 돌아가도록 하는 구조다.",
    "요청당 요금, 라이선스, 지급 의사와 제공 조건의 연결.",
    "접근 로그가 있다는 사실만으로 수익 발생을 확정하는 일.",
    "Pay per crawl의 한 구현은 HTTP 402와 가격 헤더로 조건을 알리고, 크롤러가 지불 의사를 표시한 요청을 조건에 맞춰 처리한다.",
    "크롤러가 허용한 최대 가격과 콘텐츠 가격을 비교해 접근을 처리하는 경로.",
    "상대 크롤러의 참여와 지불 지원이 필요하다. 공개 기술 설명을 누구나 즉시 이용할 수 있는 보편적 계약으로 읽으면 안 된다.",
    "접근 통제와 유료 과금은 결합할 수 있지만 서로 필수 조건은 아니다.",
    "HTTP 402|가격|지불 의사|정산",
  ],
  [
    "inference",
    "AI Inference Infrastructure",
    "AI 추론 인프라",
    "평가와 운영",
    "vllm",
    "학습된 모델을 요청에 응답하는 서비스로 실행하기 위한 계산·메모리·스케줄링·서빙 기반이다.",
    "KV 캐시, 배치 처리, 분산 실행, 모델 서빙과 자원 운영.",
    "학습 데이터 수집과 모델 사전학습 전체.",
    "요청을 배치하고 메모리와 실행 장치를 할당한다. vLLM은 PagedAttention, 연속 배치, 캐시와 양자화 등으로 서빙 효율을 다룬다.",
    "여러 사용자의 생성 요청을 연속 배치로 처리하는 모델 서버.",
    "처리량 개선이 개별 사용자의 지연 개선과 같지는 않다. 입력 길이·배치·정밀도·장치 조건을 함께 봐야 한다.",
    "모델 능력은 무엇을 할 수 있는지, 추론 인프라는 어떤 비용과 지연으로 실행하는지를 다룬다.",
    "서빙|KV 캐시|연속 배치|양자화|지연",
  ],
  [
    "voice",
    "Conversational Voice AI",
    "대화형 음성 AI",
    "에이전트",
    "voice|trace",
    "사용자의 음성을 받아 대화 또는 업무를 처리하고 음성으로 응답하는 상호작용 시스템이다.",
    "음성 입력·대화 상태·업무 실행·음성 출력의 결합.",
    "음성 합성 기능만 있는 모든 시스템.",
    "문서화된 파이프라인 방식은 음성 인식으로 텍스트를 만들고 업무 코드를 실행한 뒤 음성을 합성한다. 음성 처리 단계와 업무 단계를 각각 추적할 수 있다.",
    "말로 한 요청을 텍스트 에이전트에 전달하고 결과를 읽어 주는 음성 인터페이스.",
    "인식 오류와 출력 지연이 대화 품질을 바꾼다. 녹음·전사문을 추적할 때 데이터 수집 경계를 정해야 한다.",
    "파이프라인 방식과 음성을 직접 주고받는 모델 구조는 같은 구현이 아니다.",
    "음성 인식|STT|대화 상태|음성 합성|TTS",
  ],
  [
    "enterprise",
    "Enterprise AI Operating Model",
    "기업 AI 운영 모델",
    "평가와 운영",
    "rmf|eval",
    "AI를 업무에 도입하고 유지하기 위해 역할·의사결정·성과 기준·위험 관리 책임을 배분하는 운영 구조다.",
    "업무 선택, 사람과 AI의 역할, 평가와 운영 피드백.",
    "단순한 모델 구매나 사용자 계정 수 확대.",
    "업무 목적과 책임자를 정하고 성공 기준을 만든다. 실제 결과와 위험을 측정해 권한·업무 흐름·운영 정책을 수정한다.",
    "자동 처리 성공과 사람 재작업을 함께 측정해 고객 지원 업무 범위를 조정하는 운영 설계.",
    "호출량과 사용량은 업무 성과의 대체 지표가 될 수 없다. 팀마다 다른 과제를 같은 기준 없이 비교하면 왜곡된다.",
    "AI 거버넌스는 위험·책임 체계이고 운영 모델은 업무·역할·성과 운영까지 포함하는 편집상 묶음이다.",
    "업무 설계|책임자|성과 기준|사람 이관",
  ],
  [
    "metrics",
    "Aggregate Metrics",
    "집계 지표",
    "평가와 운영",
    "metrics|otel",
    "여러 관측을 같은 모집단·시간 구간·계산 규칙으로 묶어 수치나 분포로 요약한 지표다.",
    "횟수, 합계, 평균, 비율, 히스토그램과 적절히 계산한 분위수.",
    "관측 조건이 다른 값을 임의로 더하거나 분위수 자체를 평균하는 계산.",
    "관측 단위와 레이블을 정하고 집계한다. 합계와 건수로 전체 평균을 계산할 수 있지만 서버별 p95를 평균해 전체 p95를 얻을 수는 없다.",
    "서버들의 히스토그램을 합친 뒤 전체 요청 지연 분포를 계산한다.",
    "평균은 느린 꼬리와 작은 집단의 실패를 숨길 수 있다. 분모·시간창·집단 구성이 달라지면 같은 이름의 지표도 비교가 어렵다.",
    "trace는 개별 실행 경로이며 집계 지표는 여러 실행의 요약이다.",
    "집계|모집단|히스토그램|분위수|p95|분모",
  ],
  [
    "science",
    "AI for Scientific Discovery",
    "과학 발견 AI",
    "과학과 물리 세계",
    "science",
    "과학 문제의 예측·후보 생성·분석에 AI를 사용하고 분야별 검증으로 결과를 확인하는 연구 접근이다.",
    "데이터와 도메인 지식을 결합한 예측·설계·실험 지원.",
    "모델이 제안했다는 이유만으로 새로운 과학 사실을 확정하는 일.",
    "문제와 관측 자료를 정하고 모델이 예측을 만든다. 알려진 평가 자료나 실험 결과와 비교해 예측의 정확도와 적용 범위를 확인한다.",
    "AlphaFold는 아미노산 서열과 관련 정보를 활용한 단백질 구조 예측을 CASP14에서 평가했다.",
    "예측 구조가 모든 생물학적 기능이나 실험 조건을 설명하지는 않는다. 모델 결과와 독립 검증을 구분해야 한다.",
    "후보 생성은 발견 과정의 일부다. 실험적으로 확인한 발견과 같은 완료 상태가 아니다.",
    "가설|예측|도메인 지식|실험|재현",
  ],
  [
    "medical",
    "AI Medical Imaging",
    "AI 의료 영상",
    "과학과 물리 세계",
    "fda",
    "의료 영상의 분석·검출·분할 등을 통해 정해진 임상 사용 목적을 지원하는 AI 기술이다.",
    "영상 기반 의료기기의 분석 기능과 해당 사용 목적에 대한 평가.",
    "생활습관 지원 기기 전체나 일반 이미지 생성.",
    "영상과 관련 입력을 모델로 처리하고 정의된 임상 작업에 맞는 결과를 제공한다. 성능 증거는 대상 환자·기기·사용 목적에 연결해야 한다.",
    "FDA 목록에 수록된 영상 분할 기기의 허가 자료에서 해당 사용 목적과 근거를 확인한다.",
    "FDA 목록은 전체 기기를 빠짐없이 포함한 목록이 아니다. 등록된 제품의 심사 결과를 다른 용도에 일반화할 수 없다.",
    "의료 영상의 임상 목적과 저위험 웰니스의 건강 습관 지원 목적을 구분한다.",
    "의료 영상|분할|검출|사용 목적|임상 평가",
  ],
  [
    "wellness",
    "AI Wellness Devices",
    "AI 웰니스 기기",
    "과학과 물리 세계",
    "wellness",
    "건강한 생활습관의 유지·장려를 지원하는 기능에 AI를 사용하는 기기 또는 소프트웨어의 범주다.",
    "일반적인 건강 습관 지원과 저위험 제품의 정책 경계.",
    "질병 진단·치료 주장을 자동으로 허용받는 범주.",
    "생활 활동을 입력받아 기록·피드백을 제공한다. FDA의 일반 웰니스 지침은 건강 습관을 촉진하는 저위험 제품을 대상으로 한다.",
    "운동 기록을 바탕으로 건강 습관을 돌아보게 하는 지원 기능이라는 설계 예.",
    "AI 사용 여부만으로 제품의 규제 분류가 정해지지 않는다. 주장·사용 목적·위험 수준을 함께 확인해야 한다.",
    "생활습관 지원과 임상 판단 기능은 서로 다른 목적이다.",
    "웰니스|생활습관|저위험|사용 목적",
  ],
  [
    "vla",
    "Vision-Language-Action Models",
    "시각·언어·행동 모델",
    "과학과 물리 세계",
    "vla",
    "영상과 언어 지시를 입력으로 받아 로봇 행동을 출력하도록 학습한 모델 계열이다.",
    "로봇 관측·언어 목표·행동 표현을 연결한 정책 학습.",
    "그림을 설명할 수 있다는 이유만으로 가능한 물리 제어.",
    "RT-2는 로봇 궤적과 웹 시각언어 과제를 공동 학습하고 행동을 텍스트 토큰으로 표현한다. 생성한 행동을 로봇 제어 입력으로 변환한다.",
    "영상 속 물체를 보고 자연어 지시가 가리키는 대상을 집는 로봇 정책.",
    "웹 지식 전이가 새로운 환경의 안전한 행동을 보장하지 않는다. 센서·기구·접촉 조건과 실제 로봇 평가가 필요하다.",
    "VLM은 시각과 언어를 다루고 VLA는 행동 출력을 학습 목표에 포함한다.",
    "VLA|로봇 정책|행동 토큰|시각언어|궤적",
  ],
  [
    "timeseries",
    "Time-Series Foundation Models",
    "시계열 파운데이션 모델",
    "과학과 물리 세계",
    "timeseries",
    "여러 시계열에서 사전학습한 패턴을 이용해 새로운 시계열의 예측 등에 전이하는 모델이다.",
    "다양한 시간순 관측의 사전학습과 zero-shot 또는 적응 예측.",
    "관측 순서를 무시한 일반 텍스트 분류나 모든 시계열의 우월 성능 보증.",
    "Chronos는 값을 스케일링·양자화해 토큰으로 표현하고 확률적 예측을 학습한다. 학습에 포함되지 않은 데이터셋에서도 예측을 평가한다.",
    "신규 수요 시계열에 사전학습 모델을 적용하고 해당 업무의 단순 기준선과 비교하는 사용 예.",
    "분포 변화와 학습 데이터 중복이 평가를 왜곡할 수 있다. 시간 순서에 맞춘 분할과 불확실성 점검이 필요하다.",
    "시계열 전용 사전학습 모델과 특정 한 데이터에 맞춘 예측 모델은 학습 범위가 다르다.",
    "시계열|zero-shot|확률 예측|토큰화|시간 분할",
  ],
  [
    "zkp",
    "Zero-Knowledge Proofs",
    "영지식 증명",
    "위험과 책임",
    "zkp",
    "증명자가 비밀 내용 자체를 추가로 공개하지 않고 검증자에게 어떤 명제가 참임을 보이는 암호학적 방식이다.",
    "명제·증거·검증 알고리즘과 공개 정보의 경계.",
    "네트워크 식별이나 발급자 신뢰까지 자동으로 없애는 익명성 보증.",
    "증명자는 비공개 증거를 이용해 증명을 만든다. 검증자는 공개된 명제와 증명으로 참인지 확인하며 비밀 증거를 직접 받지 않는다.",
    "생년월일 전체를 공개하지 않고 나이 조건을 만족한다는 명제를 입증하는 적용 예.",
    "무엇을 증명하는지와 원천 정보의 신뢰가 별도 문제다. 공개 입력이나 사용 방식에서 정보가 드러날 수 있다.",
    "암호화는 내용을 감추고, 영지식 증명은 내용을 드러내지 않은 검증을 다룬다.",
    "ZKP|증명자|검증자|비공개 증거|명제",
  ],
  [
    "ai-security-engineering",
    "AI-Assisted Security Engineering",
    "AI 보조 보안 개발",
    "위험과 책임",
    "secure",
    "보안 탐지·분석·수정 제안에 AI를 사용하고 별도 검증으로 결과를 확인하는 개발 방식이다.",
    "코드 경보 해석, 수정안 생성과 보안 검토 지원.",
    "AI가 만든 수정안을 검증 없이 안전하다고 승인하는 일.",
    "GitHub Copilot Autofix처럼 탐지된 경보와 코드 문맥에서 수정안을 생성하고 개발자가 결과를 검토한다.",
    "CodeQL 경보에 제안된 패치를 적용하기 전 동작 테스트와 보안 재검사를 수행하는 흐름.",
    "탐지는 빠뜨리거나 잘못 판단할 수 있고 제안은 부정확할 수 있다. 책임 있는 검토와 검증이 남는다.",
    "AI 자체를 공격으로부터 보호하는 에이전트 보안과, AI로 보안 업무를 돕는 활동은 대상이 다르다.",
    "CodeQL|Autofix|수정 제안|보안 검토",
  ],
  [
    "supply-chain",
    "Software Supply Chain Security",
    "소프트웨어 공급망 보안",
    "위험과 책임",
    "slsa",
    "소스·의존성·빌드·배포에 이르는 소프트웨어 전달 경로의 무결성과 출처를 보호하는 활동이다.",
    "빌드 입력, 실행 주체, 산출물과 provenance의 검증.",
    "서명된 프로그램에는 취약점이나 악성 동작이 없다는 보증.",
    "SLSA는 산출물을 누가 어떤 입력과 과정으로 만들었는지 기록하고 그 기록과 빌드를 위변조로부터 보호하는 수준을 구분한다.",
    "배포 전에 패키지의 빌드 출처가 기대한 저장소와 과정에 맞는지 확인하는 단계.",
    "낮은 수준의 provenance는 존재해도 위조가 쉬울 수 있다. 출처 확인과 코드 동작의 안전성 검증을 혼동하면 안 된다.",
    "취약점 검사는 코드 결함을 찾고 공급망 보안은 제작·전달 경로의 신뢰를 다룬다.",
    "provenance|의존성|빌드|산출물|무결성",
  ],
]
const relations = [
  [
    "agents",
    "mcp",
    "uses",
    "외부 도구 연결에 MCP를 사용할 수 있다. MCP 사용은 에이전트의 필수 조건이 아니다.",
    "agents|mcp",
  ],
  [
    "agents",
    "rag",
    "uses",
    "외부 문서를 근거로 삼는 작업에는 검색-생성 경로를 조합할 수 있다.",
    "agents|rag",
  ],
  [
    "voice",
    "agents",
    "uses",
    "음성 파이프라인의 업무 처리 단계에 에이전트를 연결할 수 있다.",
    "voice|agents",
  ],
  [
    "voice",
    "observability",
    "uses",
    "음성 처리와 업무 실행의 단계를 추적으로 연결한다.",
    "voice|trace",
  ],
  [
    "observability",
    "agents",
    "observes",
    "모델 호출·도구 사용·이관으로 구성된 실행을 추적한다.",
    "trace|agents",
  ],
  [
    "evaluation",
    "agents",
    "evaluates",
    "에이전트와 실행 환경의 최종 결과를 성공 기준으로 채점한다.",
    "eval",
  ],
  [
    "evaluation",
    "observability",
    "uses",
    "평가는 실행 기록과 최종 환경 상태를 서로 다른 증거로 사용한다.",
    "eval|trace",
  ],
  [
    "evaluation",
    "metrics",
    "uses",
    "동일한 과제·시도 조건의 평가 결과를 집계한다.",
    "eval|metrics",
  ],
  [
    "observability",
    "metrics",
    "informs",
    "개별 실행에서 수집한 관측을 운영 지표로 집계할 수 있다.",
    "trace|otel",
  ],
  ["inference", "metrics", "uses", "서빙 성능을 지연 분포와 처리량으로 비교한다.", "vllm|metrics"],
  [
    "agents",
    "inference",
    "uses",
    "모델 호출을 수행하려면 해당 모델의 추론 실행 기반을 사용한다.",
    "agents|vllm",
  ],
  [
    "agent-security",
    "agents",
    "controls",
    "모델과 도구 실행의 신원·권한·검사 경계를 보호한다.",
    "identity|guard",
  ],
  [
    "agent-security",
    "mcp",
    "controls",
    "호스트가 연결별 동의·권한과 서버 사이의 경계를 유지한다.",
    "mcp",
  ],
  [
    "agent-governance",
    "governance",
    "scope",
    "조직 AI 거버넌스를 자율 행동과 위임 권한에 적용하는 하위 범위다.",
    "rmf|identity",
  ],
  [
    "agent-governance",
    "agent-security",
    "informs",
    "책임과 허용 범위를 신원·인가 통제의 운영 기준으로 연결한다.",
    "rmf|identity",
  ],
  [
    "enterprise",
    "governance",
    "uses",
    "업무 도입·운영 책임에 AI 위험 관리 체계를 결합한다.",
    "rmf",
  ],
  [
    "enterprise",
    "evaluation",
    "uses",
    "도입 범위를 정할 때 실제 업무 결과를 평가한다.",
    "rmf|eval",
  ],
  [
    "enterprise",
    "metrics",
    "uses",
    "성과를 볼 때 사용량과 과제 성공 기준을 구분해 집계한다.",
    "eval|metrics",
  ],
  [
    "conformity",
    "governance",
    "uses",
    "책임·문서·위험 관리 증거를 적용 요구사항의 충족 여부와 대응시킨다.",
    "eu|rmf",
  ],
  [
    "content-monetization",
    "content-access",
    "uses",
    "가격과 지급 조건을 허용된 콘텐츠 접근에 결합한다.",
    "pay|crawl",
  ],
  [
    "rag",
    "content-access",
    "uses",
    "외부 콘텐츠를 검색할 때 제공자의 접근 조건을 확인해야 한다.",
    "rag|crawl",
  ],
  [
    "medical",
    "wellness",
    "contrast",
    "임상 목적과 저위험 생활습관 지원의 목적 경계가 다르다.",
    "fda|wellness",
  ],
  [
    "medical",
    "conformity",
    "uses",
    "의료 목적의 AI는 해당 관할·제품에 맞는 평가 경로를 확인한다. FDA와 EU 절차는 서로 동일하지 않다.",
    "fda|eu",
  ],
  [
    "wellness",
    "governance",
    "uses",
    "건강 지원 주장과 사용 목적을 책임 있는 운영 범위로 관리한다.",
    "wellness|rmf",
  ],
  [
    "vla",
    "evaluation",
    "uses",
    "로봇 행동은 지시 수행 결과와 실환경 조건에 맞춰 평가해야 한다.",
    "vla|eval",
  ],
  [
    "timeseries",
    "metrics",
    "uses",
    "시간 분할과 예측 평가 지표의 계산 조건을 맞춰 비교한다.",
    "timeseries|metrics",
  ],
  [
    "timeseries",
    "inference",
    "uses",
    "예측 모델도 실행 자원과 요청 처리 기반 위에서 동작한다.",
    "timeseries|vllm",
  ],
  [
    "science",
    "evaluation",
    "contrast",
    "과학적 결과의 검증과 에이전트 업무 성공의 평가는 대상·기준이 다르다.",
    "science|eval",
  ],
  [
    "ai-security-engineering",
    "supply-chain",
    "uses",
    "AI가 제안한 코드도 기존 빌드·배포 출처 검증을 거쳐 전달한다.",
    "secure|slsa",
  ],
  [
    "ai-security-engineering",
    "agent-security",
    "contrast",
    "AI로 보안 업무를 돕는 활동과 AI 실행 자체를 보호하는 통제는 대상이 다르다.",
    "secure|identity",
  ],
  [
    "zkp",
    "governance",
    "informs",
    "원본 정보 공개를 줄이는 증명은 데이터 최소화 설계의 한 선택지다. 거버넌스 전체를 대체하지 않는다.",
    "zkp|rmf",
  ],
]
if (fs.existsSync("data/knowledge-review-2026-09-13.json"))
  throw Error(
    "This editorial migration was already applied. Edit canonical Markdown for subsequent revisions.",
  )
const old = walk("vault/Knowledge")
  .filter((f) => f.endsWith(".md"))
  .map((file) => ({ file, ...parseNote(fs.readFileSync(file, "utf8")) }))
  .filter((n) => n.meta.entry_type === "concept")
if (old.length !== rows.length) throw Error("Unexpected concept inventory")
fs.mkdirSync(".local/knowledge-before-rebuild", { recursive: true })
const registry = new Map(
  rows.map((r) => [r[0], { row: r, note: old.find((n) => n.meta.title === r[1]) }]),
)
for (const [id, { row: r, note: n }] of registry) {
  if (!n) throw Error("Missing " + r[1])
  fs.copyFileSync(n.file, path.join(".local/knowledge-before-rebuild", path.basename(n.file)))
  const [
    _,
    title,
    label,
    group,
    keys,
    definition,
    included,
    excluded,
    mechanism,
    example,
    limits,
    distinction,
    words,
  ] = r
  const own = keys.split("|"),
    allRelations = relations.filter((e) => e[0] === id)
  const sourceKeys = [...new Set([...own, ...allRelations.flatMap((e) => e[4].split("|"))])]
  const evidence = sourceKeys.map((k) => sources[k][1]),
    cite = own.map((k) => `[${sources[k][0]}](${sources[k][1]})`).join(" · ")
  const link = (other) => {
    const x = registry.get(other)
    return `[[${x.note.file.replace(/^vault\//, "").replace(/\.md$/, "")}|${x.row[2]}]]`
  }
  const connected = relations.filter((e) => e[0] === id || e[1] === id)
  const relLines = connected
    .map((e) => {
      const outgoing = e[0] === id,
        other = outgoing ? e[1] : e[0]
      return `- ${outgoing ? "→" : "←"} ${edgeLabels[e[2]]}: ${link(other)} — ${e[3]} (해석; ${e[4]
        .split("|")
        .map((k) => `[근거](${sources[k][1]})`)
        .join(" · ")})`
    })
    .join("\n")
  const hierarchy = connected.filter((e) => e[2] === "scope")
  const parent = hierarchy.filter((e) => e[0] === id).map((e) => link(e[1])),
    child = hierarchy.filter((e) => e[1] === id).map((e) => link(e[0]))
  const contrast = connected
    .filter((e) => e[2] === "contrast")
    .map((e) => link(e[0] === id ? e[1] : e[0]))
  const related = [
    ...new Set(
      connected
        .filter((e) => !["scope", "contrast"].includes(e[2]))
        .map((e) => link(e[0] === id ? e[1] : e[0])),
    ),
  ]
  const previous = sections(n.body, 2).find((s) => s.title === "최근 변화")?.body || "없음"
  // Preserve dated sourced history, separately from definitions reviewed here.
  const meta = {
    ...n.meta,
    updated: "2026-09-13",
    last_reviewed: "2026-09-13",
    concept_id: id,
    label,
    group,
    keywords: words.split("|"),
    aliases: [...new Set([...(n.meta.aliases || []), label])],
    parent_concepts: parent,
    related_concepts: related,
    verified_sources: evidence,
    relations: allRelations.map((e) => ({
      target: e[1],
      type: e[2],
      reason: e[3],
      basis: "inference",
      evidence: e[4].split("|").map((k) => sources[k][1]),
    })),
  }
  const body = `# ${title}\n\n## 한 문장 정의\n\n${definition} ${cite}\n\n## 용어 카드\n\n| 항목 | 내용 |\n|---|---|\n| 한국어 | ${label} |\n| 영어 | ${title} |\n| 키워드 | ${words.replaceAll("|", " · ")} |\n\n## 범위\n\n**포함:** ${included}\n\n**포함하지 않음:** ${excluded}\n\n## 왜 중요한가\n\n${distinction}\n\n## 핵심 구성 요소\n\n${words
    .split("|")
    .map((w) => "- " + w)
    .join(
      "\n",
    )}\n\n## 작동 원리\n\n${mechanism} ${cite}\n\n## 실제 예시\n\n${example}\n\n## 한계와 실패 조건\n\n${limits}\n\n## 혼동하기 쉬운 개념\n\n${distinction}\n\n## 관련 개념\n\n- 상위: ${parent.join(" · ") || "독립 개념"}\n- 하위: ${child.join(" · ") || "별도 등록 없음"}\n- 함께 쓰임: ${related.join(" · ") || "없음"}\n- 대비: ${contrast.join(" · ") || distinction}\n\n${relLines}\n\n## 최근 변화\n\n${previous}\n\n## 출처\n\n${sourceKeys.map((k) => `- [${sources[k][0]}](${sources[k][1]})`).join("\n")}\n`
  fs.writeFileSync(n.file, noteText(meta, body))
}
const mapPath = "vault/Knowledge Maps/AI Technology Knowledge Map.md"
const oldMap = parseNote(fs.readFileSync(mapPath, "utf8"))
fs.copyFileSync(mapPath, ".local/knowledge-before-rebuild/AI Technology Knowledge Map.md")
const wikilink = (id) => {
  const { note, row } = registry.get(id)
  return `[[${note.file.replace(/^vault\//, "").replace(/\.md$/, "")}|${row[2]}]]`
}
fs.writeFileSync(
  mapPath,
  noteText(
    { ...oldMap.meta, updated: "2026-09-13", last_reviewed: "2026-09-13" },
    `# AI Technology Knowledge Map\n\n## 개념\n\n${rows.map((r) => "- " + wikilink(r[0])).join("\n")}\n\n## 연결 관계\n\n| 출발 | 관계 | 도착 | 연결 이유와 근거 |\n|---|---|---|---|\n${relations
      .map(
        (e) =>
          `| ${wikilink(e[0])} | ${edgeLabels[e[2]]} | ${wikilink(e[1])} | ${e[3]} (해석; ${e[4]
            .split("|")
            .map((k) => `[근거](${sources[k][1]})`)
            .join(" · ")}) |`,
      )
      .join("\n")}\n`,
  ),
)
fs.writeFileSync(
  "data/knowledge-review-2026-09-13.json",
  JSON.stringify(
    {
      reviewed: "2026-09-13",
      method:
        "Primary documents reread; definitions and keyword scope rewritten; semantic relationships are explicitly editorial inferences. Existing dated news history retained, not re-certified by this review.",
      sources: Object.fromEntries(
        Object.entries(sources).map(([id, [title, url, evidence]]) => [
          id,
          { title, url, evidence },
        ]),
      ),
      concepts: rows.map((r) => ({ id: r[0], title: r[1], primary_sources: r[4].split("|") })),
      relations: relations.length,
    },
    null,
    2,
  ) + "\n",
)
console.log(
  `Rebuilt ${rows.length} concepts and ${relations.length} evidenced semantic relationships.`,
)
