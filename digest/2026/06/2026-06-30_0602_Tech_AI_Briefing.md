# 2026-06-30 아침 브리핑

2026-06-30 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/06/2026-06-30_0602_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GitHub Copilot, Claude Opus 4.8 fast mode 프리뷰 확대](https://skyan0213.github.io/tech-knowledge-garden/news/3ab1311f879e64a8)

발표 2026-06-30

GitHub는 2026년 6월 30일(한국시간) Copilot에 Claude Opus 4.8 fast mode 프리뷰를 순차 제공한다고 발표했다. Pro+·Max·Business·Enterprise 이용자가 대상이며, 기업용 플랜에서는 관리자가 기본 꺼짐 상태인 정책을 활성화해야 한다.

### [GitHub, 저장소 이슈 생성을 쓰기 권한 보유자로 제한하는 설정 추가](https://skyan0213.github.io/tech-knowledge-garden/news/6c26cbb466f80e14)

발표 2026-06-30

GitHub는 2026년 6월 30일(한국시간) 저장소 관리자가 이슈 생성자를 쓰기 권한이 있는 협업자로 한정할 수 있도록 했다. 옵션을 켜면 쓰기 권한이 없는 이용자는 Issues·Comments·Discussions·Projects·Copilot에서 새 이슈를 만들 수 없다.

### [AWS, AgentCore 실행 추적으로 무한 루프·도구 오류를 찾는 절차 공개](https://skyan0213.github.io/tech-knowledge-garden/news/65854015519164e0)

발표 2026-06-30

AWS는 2026년 6월 30일(한국시간) Amazon Bedrock AgentCore Observability로 운영 중 에이전트의 반복 실행과 도구 호출 오류를 진단하는 구현 지침을 공개했다. CloudWatch 지표·추적·구조화 로그를 함께 보고, 오류율이 낮아도 토큰 사용량과 세션 시간이 늘어나는 무한 루프를 찾아내는 방식이다.

### [PAR, 고객별 데이터 경계를 SQL 앞단에서 강제하는 분석 에이전트 공개](https://skyan0213.github.io/tech-knowledge-garden/news/ed903f9a68cea8a4)

발표 2026-06-30

PAR Technology는 2026년 6월 30일(한국시간) AWS 공식 블로그에서 다중 고객용 자연어 분석 에이전트의 보안 구조를 소개했다. AWS SigV4 요청 서명, Bedrock의 질문 검토, 서버가 생성하는 행 단위 데이터 필터를 결합해 LLM이 조회할 수 있는 범위를 먼저 한정한다.

### [AWS, 의료 청구 PDF를 FHIR로 변환하는 에이전트 구현 예시 공개](https://skyan0213.github.io/tech-knowledge-garden/news/0be6e69d8c04db75)

발표 2026-06-30

AWS는 2026년 6월 30일(한국시간) Bedrock Data Automation·AgentCore·HealthLake를 연결한 의료 청구 처리 샘플을 공개했다. CMS-1500 PDF를 S3에 올리면 서류를 JSON으로 추출하고, 에이전트가 환자·의료진·보험 기록과 대조한 뒤 조건을 충족한 청구를 FHIR 자원으로 저장한다.

## 분야별 브리핑

### AI · 5건

#### [AWS, AgentCore 실행 추적으로 무한 루프·도구 오류를 찾는 절차 공개](https://skyan0213.github.io/tech-knowledge-garden/news/65854015519164e0)

발표 2026-06-30

연구·기술 · 구현·운영 지침 · Amazon Bedrock AgentCore

AWS는 2026년 6월 30일(한국시간) Amazon Bedrock AgentCore Observability로 운영 중 에이전트의 반복 실행과 도구 호출 오류를 진단하는 구현 지침을 공개했다. CloudWatch 지표·추적·구조화 로그를 함께 보고, 오류율이 낮아도 토큰 사용량과 세션 시간이 늘어나는 무한 루프를 찾아내는 방식이다.

##### 정상 종료와 올바른 답변을 구분하는 추적

AWS는 문제를 품질·신뢰성·효율로 구분했다. 품질 문제는 실행이 끝났어도 답이 틀린 경우이며, 신뢰성 문제는 도구 오류나 상태 유실로 작업을 마치지 못하는 경우다. 지연·과도한 토큰 사용은 효율 문제로 분리한다.

OpenTelemetry 형식으로 추적·span 로그·지표를 내보내며 CloudWatch가 기본 수신처다. 같은 데이터를 Datadog·Grafana Cloud·Elastic Observability로도 보낼 수 있다. CloudWatch Transaction Search를 켠 뒤, 개별 실행의 추론 단계·도구 호출·메모리 조회를 따라간다.

##### 반복 실행과 권한 오류를 다르게 처리

무한 루프에서는 토큰 사용량이 많은 세션을 먼저 찾고 동일 도구 호출과 추론 패턴을 대조한다. AWS는 종료 조건을 명시하고 같은 행동이 세 번 반복되면 멈추는 로직을 넣는 예를 제시했다.

도구 오류는 인증 401·인가 403·입력 형식 400·리소스 없음 404·실행 오류 500으로 나누어 원인을 좁힌다. 인증·권한 오류는 Gateway 서비스 역할과 자격 증명을 확인하고, 입력 형식 오류는 에이전트가 전달한 값과 도구 스키마를 대조한다.

진단 쿼리는 대시보드와 경보로 옮기고, AgentCore Evaluators는 세션을 품질 기준으로 평가한다. 실행 경로를 기록하는 관측성과 답변 품질을 판단하는 평가는 서로 다른 단계다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/debugging-production-agents-with-amazon-bedrock-agentcore-observability/)

#### [PAR, 고객별 데이터 경계를 SQL 앞단에서 강제하는 분석 에이전트 공개](https://skyan0213.github.io/tech-knowledge-garden/news/ed903f9a68cea8a4)

발표 2026-06-30

연구·기술 · 구현·운영 지침 · PAR

PAR Technology는 2026년 6월 30일(한국시간) AWS 공식 블로그에서 다중 고객용 자연어 분석 에이전트의 보안 구조를 소개했다. AWS SigV4 요청 서명, Bedrock의 질문 검토, 서버가 생성하는 행 단위 데이터 필터를 결합해 LLM이 조회할 수 있는 범위를 먼저 한정한다.

##### 권한은 프롬프트가 아니라 서버에서 결정

요청에는 Tenant ID·Business ID·Admin ID를 넣고 SigV4로 서명한다. 검증 뒤 세 값을 합친 세션 키를 만들어 후속 처리를 해당 사용자 문맥에 묶는다. PAR는 처음에는 프롬프트에 사업체 ID 필터를 지시했지만, 운영 단계에서는 모델의 필터 누락 가능성을 보안 경계로 받아들일 수 없어 구조를 바꿨다고 설명했다.

질문이 지원되는 지표에 해당하는지 확인하는 단계는 인증 뒤, 데이터 접근 전에 실행한다. 매출 금액과 매출 건수처럼 의미가 모호하면 질문 구체화를 요청하고 SQL 생성을 진행하지 않는다.

서버는 검증된 사용자 ID를 기준으로 공통 테이블 식(CTE)을 생성해 허용된 행만 남긴다. 모델에는 원본 테이블이 아니라 이 CTE의 열 이름·자료형만 전달하고, 모델이 만든 분석 SQL을 서버의 CTE와 결합해 Databricks에서 실행한다.

##### 회사에서 보고한 운영 결과

PAR는 해당 구조로 운영 환경에서 5만 건이 넘는 쿼리를 처리했으며 고객 간 데이터 노출 사고는 없었다고 밝혔다. 이는 회사가 보고한 해당 구현의 운영 결과다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)

#### [AWS, 의료 청구 PDF를 FHIR로 변환하는 에이전트 구현 예시 공개](https://skyan0213.github.io/tech-knowledge-garden/news/0be6e69d8c04db75)

발표 2026-06-30

연구·기술 · 구현·운영 지침 · AWS HealthLake

AWS는 2026년 6월 30일(한국시간) Bedrock Data Automation·AgentCore·HealthLake를 연결한 의료 청구 처리 샘플을 공개했다. CMS-1500 PDF를 S3에 올리면 서류를 JSON으로 추출하고, 에이전트가 환자·의료진·보험 기록과 대조한 뒤 조건을 충족한 청구를 FHIR 자원으로 저장한다.

##### 고정 처리 순서와 에이전트 검색을 분리

Lambda는 문서 업로드에 반응해 처리를 시작하고, 처리 완료 또는 예외 큐 전달 여부를 감독한다. Bedrock Data Automation의 blueprint는 서식 차이가 있는 CMS-1500에서 필요한 항목을 일정한 JSON 구조로 추출하며 필드 신뢰도와 위치 정보도 제공한다.

Strands 에이전트는 HealthLake 검색과 FHIR 청구 생성을 위한 두 도구를 사용한다. 기본 검색으로 참조 기록을 찾지 못하면 추출 신뢰도가 높은 속성으로 두 번 더 검색하고, 식별 근거를 설명하도록 구성했다.

##### 담당자·환자에게 전달하는 처리 결과

처리 결과는 청구 담당자용 기술 요약과 환자에게 전달할 쉬운 설명으로 나누어 SNS로 보낸다. 샘플의 성공 시나리오는 식별자 끝의 숫자 0과 문자 O가 다른 상황을 넣어 다른 검색 정보로 기록을 대조하는 과정을 보여준다.

이 글은 샘플 데이터로 실패·성공 흐름을 시연한다. AWS는 알려진 처리 순서를 코드로 정하고 Lambda를 최종 성공·실패 판단자로 두는 설계 방식을 설명했다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/build-an-agentic-ai-healthcare-claims-pipeline-with-amazon-bedrock-and-aws-healthlake/)

#### [AWS, Nova 2 Lite 추출·Claude 공간 추론으로 연감 사진과 이름 연결](https://skyan0213.github.io/tech-knowledge-garden/news/bd1bd59784866649)

발표 2026-06-30

연구·기술 · 구현·운영 지침 · 비용 절감 · Amazon Nova 2 Lite · Claude Sonnet 4.6

AWS는 2026년 6월 30일(한국시간) Nova 2 Lite와 Claude Sonnet 4.6을 나눠 쓰는 스캔 연감 디지털화 구현을 소개했다. Nova가 사진·이름의 위치를 추출하고 Claude가 배치를 해석해 연결하며, AWS는 336쪽에서 이름과 얼굴의 연결 3,122건을 생성했다고 보고했다.

##### 추출과 공간 추론을 서로 다른 모델에 맡김

Nova는 사진 경계 상자·이름 위치·페이지 메타데이터를 한 번의 호출로 반환한다. 전체 OCR 텍스트 대신 이름만 요청해 출력량을 줄였다. 두 모델은 같은 좌표계를 사용하고 Claude는 캡션과 열 배치를 고려해 이름과 얼굴을 연결한다.

AWS는 이 추출 작업에서 LOW·MEDIUM·HIGH 추론 수준 간 의미 있는 정확도 차이를 보지 못해 Nova를 LOW로 설정했다고 설명했다. Claude에는 adaptive thinking을 사용하고, 최종 단계는 신뢰도 기준과 rapidfuzz 이름 대조로 결과를 거른다.

##### 실험 규모·신뢰도·비용 조건

연결 결과의 93.3%가 0.95 이상의 신뢰도를 받았다. 이 점수는 Claude가 부여한 연결 확신도이며 정답률 측정치와는 다르다. 텍스트만 있는 페이지는 건너뛰었고, 캡션이 모호한 단체 사진은 연결하지 않았다.

AWS는 페이지당 비용을 두 모델 구성 약 0.033달러, Claude에 OCR·사진 탐지·이름 연결을 모두 맡긴 비교 구성 약 0.10달러로 추산했다. 사용한 Bedrock 가격, 이름 밀도, 추론 토큰 수에 따라 달라지는 추정치다.

두 호출이 순차 실행되는 구성에서 Nova 추출은 2\~5초, Claude 공간 추론은 20\~30초, 전체는 페이지당 약 22\~35초였다고 보고했다. 비용을 낮춘 구성에서도 공간 추론 단계가 처리 시간을 대부분 차지했다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/pair-nova-2-lite-with-claude-for-cost-optimized-document-processing/)

#### [NVIDIA, Azure GB300 기반 Claude의 Microsoft Foundry 정식 제공 발표](https://skyan0213.github.io/tech-knowledge-garden/news/f870f3c172e9d7ad)

발표 2026-06-30

제품·서비스 · 기능 추가 · NVIDIA · Anthropic

NVIDIA는 2026년 6월 30일(한국시간) Azure에서 GB300 Blackwell Ultra GPU로 실행되는 Anthropic Claude 모델의 Microsoft Foundry 정식 제공을 발표했다. 구성에는 GB300 NVL72 시스템과 Quantum-X800 InfiniBand 네트워킹을 사용한다.

##### 인프라 제공과 에이전트 실행 환경

NVIDIA는 도메인별 에이전트 기능을 위해 자사의 도구와 verified agent skills를 Anthropic 스택에 통합하는 협업도 진행한다고 설명했다. 이번 공지는 Microsoft·NVIDIA·Anthropic이 앞서 발표한 협력의 연장선으로 소개됐다.

Azure에서 Claude 에이전트를 실행하는 Secure Agent Workspace Reference Design은 신원·네트워크 접근·자격 증명·실행 정책을 인프라 계층에서 관리하는 청사진이다.

[NVIDIA 원문](https://blogs.nvidia.com/blog/anthropic-nvidia-gb300-blackwell-ultra-microsoft-azure/)

### 소프트웨어·클라우드 · 4건

#### [GitHub Copilot, Claude Opus 4.8 fast mode 프리뷰 확대](https://skyan0213.github.io/tech-knowledge-garden/news/3ab1311f879e64a8)

발표 2026-06-30

제품·서비스 · 기능 추가 · GitHub

GitHub는 2026년 6월 30일(한국시간) Copilot에 Claude Opus 4.8 fast mode 프리뷰를 순차 제공한다고 발표했다. Pro+·Max·Business·Enterprise 이용자가 대상이며, 기업용 플랜에서는 관리자가 기본 꺼짐 상태인 정책을 활성화해야 한다.

##### 접근 조건과 비용

GitHub는 fast mode가 표준 Opus 4.8의 지능을 유지하면서 출력 토큰 속도를 높인다고 설명했다.

모델 선택기는 VS Code·Visual Studio·Copilot CLI·cloud agent·Copilot 앱·github.com·모바일·JetBrains·Xcode·Eclipse에서 제공된다. 점진 배포이므로 모든 이용자에게 동시에 나타나는 방식은 아니다.

사용량 기반 과금에서는 공급자 정가를 적용한다. GitHub에 따르면 이전 fast mode보다는 저렴하지만 표준 Opus 4.8보다는 비용이 높다.

[GitHub 원문](https://github.blog/changelog/2026-06-29-claude-opus-4-8-fast-mode-is-now-in-preview-for-github-copilot)

#### [GitHub, 저장소 이슈 생성을 쓰기 권한 보유자로 제한하는 설정 추가](https://skyan0213.github.io/tech-knowledge-garden/news/6c26cbb466f80e14)

발표 2026-06-30

제품·서비스 · 기능 추가 · GitHub

GitHub는 2026년 6월 30일(한국시간) 저장소 관리자가 이슈 생성자를 쓰기 권한이 있는 협업자로 한정할 수 있도록 했다. 옵션을 켜면 쓰기 권한이 없는 이용자는 Issues·Comments·Discussions·Projects·Copilot에서 새 이슈를 만들 수 없다.

##### 설정 위치와 적용 범위

저장소 Settings의 Features에서 Issues를 선택한 뒤, Creation allowed by를 Collaborators only로 설정한다. GitHub는 원치 않는 이슈 생성을 줄이면서 유지보수자와 기여자의 작업 흐름을 유지하기 위한 기능이라고 설명했다.

제한 대상은 이슈 생성이다. GitHub는 기존의 협업자 전용 풀 리퀘스트 생성 권한과 설정 방식을 맞추는 변경이라고 밝혔다.

[GitHub 원문](https://github.blog/changelog/2026-06-29-restrict-issue-creation-to-collaborators-only)

#### [AWS, Quick Sight 자산·사용자 정보를 분리 백업하는 도구 공개](https://skyan0213.github.io/tech-knowledge-garden/news/84b7a491c35da1a6)

발표 2026-06-30

연구·기술 · 구현·운영 지침 · Amazon Quick Sight

AWS는 2026년 6월 30일(한국시간) Quick Sight의 대시보드·분석·데이터셋 등을 백업하는 AssetsAsBundle API 지침과 샘플 도구를 공개했다. 자산 묶음은 S3에, 사용자·그룹·그룹 구성원 정보는 DynamoDB에 나누어 보관한다.

##### 대시보드와 의존 자산을 함께 내보냄

대시보드에는 데이터셋·데이터 소스·VPC 연결·테마 등의 의존성이 있다. 샘플은 기본적으로 의존 자산을 함께 내보내고, 자산 종류별로 최대 100개씩 묶어 비동기 export 작업을 시작한다.

완료 상태는 DescribeAssetBundleExportJob으로 조회한다. 반환되는 다운로드 URL은 5분 동안 유효하며 같은 API를 다시 호출해 갱신할 수 있다. 다운로드한 묶음은 지속 보관용 S3 위치로 옮긴다.

사용자와 그룹은 AssetsAsBundle API에 포함되지 않는다. 별도 API로 조회해 날짜를 붙인 DynamoDB 테이블에 저장하며, identity\_region과 자산의 aws\_region을 따로 설정해 두 리전이 다른 계정을 처리한다.

##### 샘플 도구의 실행 범위

도구는 전체·사용자 전용·자산 전용 모드를 제공하고 이전 백업을 덮어쓰지 않는다. 일부 데이터 소스와 연결된 SageMaker 추론 열이 있는 데이터셋은 export 대상에서 제외해야 한다.

이 샘플은 요청 시 실행하는 도구다. EventBridge·Step Functions·Lambda를 이용한 정기 백업은 별도의 설계안으로 소개됐으며, 그 구조의 구현 코드는 글에 포함되지 않았다. 같은 계정에서 샘플 도구를 동시에 여러 번 실행하면 API 제한에 걸릴 수 있어 동시 실행을 피하도록 안내한다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/implement-a-backup-strategy-for-amazon-quick-sight-bi-assets/)

#### [vLLM 0.24.0, 스트리밍 도구 파서·모델 지원·서버 보안 변경](https://skyan0213.github.io/tech-knowledge-garden/news/12b14cdd73636e1c)

발표 2026-06-30

제품·서비스 · 기능 추가 · 오류 수정 · vLLM

vLLM 프로젝트는 2026년 6월 30일(한국시간) 0.24.0을 공개했다. MiniMax-M3·DiffusionGemma 지원, 모델별 도구 호출과 추론 출력을 통합하는 Streaming Parser Engine, Rust 프런트엔드 인증 기능 등을 추가했다.

##### 모델 실행과 응답 파싱

Model Runner V2는 양자화 모델을 기본 지원하고 Qwen·DeepSeek-V2 MoE 실행 경로와 DFlash 추측 디코딩을 확장했다. DiffusionGemma에는 CPU 실행 경로와 구조화 출력 제어가 추가됐다.

새 스트리밍 파서 엔진에는 Qwen3·MiniMax-M2·GLM·Nemotron 계열 파서가 포함된다. Chat Completions와 Responses API의 도구 호출에는 strict mode를 추가했다.

##### 운영 시 달라지는 서버 설정

Rust 프런트엔드는 API 키 인증·CORS·토큰화·요청 중단·일시 정지와 재개를 지원한다. thinking\_token\_budget, parallel\_tool\_calls 설정 및 사용량 통계도 추가됐다.

장치 선택에서는 vLLM이 내부에서 CUDA\_VISIBLE\_DEVICES를 설정하던 동작을 없애고 device\_ids 인자를 제공한다. ROCm에서는 기존 환경 변수에 대해 폐기 전환 기간을 시작했다.

##### 서비스 거부와 의존성 보안 수정

보안 변경에는 오디오 압축 폭탄·잘못된 복구 토큰 재삽입·prompt\_embeds를 이용한 서비스 거부 대응, 오디오 업로드 크기와 디코딩 시간 제한, 구조화 출력의 정규식 컴파일 시간 제한이 포함된다.

Starlette 의존성은 CVE-2026-48710 대응을 위해 1.0.1 이상으로 올렸다.

[api.github.com 원문](https://api.github.com/repos/vllm-project/vllm/releases/tags/v0.24.0)
