# 2026-07-10 아침 브리핑

2026-07-10 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-10_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [OpenAI, GPT-5.6 Sol·Terra·Luna 정식 출시](https://skyan0213.github.io/tech-knowledge-garden/news/caaa735c832bdb26)

발표 2026-07-09

OpenAI가 7월 9일 GPT-5.6 제품군의 Sol·Terra·Luna 세 모델을 정식 출시한다고 발표했다. ChatGPT·Codex·OpenAI API에서 전 세계 배포를 시작하며, 이후 24시간에 걸쳐 순차적으로 제공 범위를 넓힌다고 밝혔다.

### [OpenAI, 동시에 듣고 말하는 GPT-Live 공개](https://skyan0213.github.io/tech-knowledge-garden/news/3fb14968493dc682)

발표 2026-07-08

OpenAI가 2026년 7월 8일 음성 모델 GPT-Live-1과 GPT-Live-1 mini를 공개하고 iOS·Android·ChatGPT.com 사용자에게 전 세계 순차 배포를 시작했다. 회사는 입력을 들으면서 동시에 말을 생성하는 풀듀플렉스 구조를 적용하고, 검색이나 심층 추론은 별도 GPT-5.5 모델에 맡겨 대화를 이어가도록 설계했다고 설명했다.

### [GitHub Copilot, 저장소 개요를 대화로 요청하는 기능 제공](https://skyan0213.github.io/tech-knowledge-garden/news/c1b395091566575d)

발표 2026-07-09

GitHub는 7월 9일 github.com에서 저장소 개요를 요청하는 GitHub Copilot 기능을 모든 요금제에 제공한다고 밝혔다. 아직 기여하지 않은 저장소를 처음 살펴볼 때 개요 생성을 제안하고, Copilot Chat에서 요청하면 목적·사용 기술·기여 지침을 요약한다.

### [GitHub Copilot, 기업용 설정을 기기 관리 도구와 파일로 배포](https://skyan0213.github.io/tech-knowledge-garden/news/8380dfc46fdb5389)

발표 2026-07-09

GitHub는 한국시간 7월 9일(미국 태평양시간 7월 8일) Copilot의 기업용 설정을 기기에 직접 배포하는 기능을 VS Code와 Copilot CLI에 정식 제공한다고 밝혔다. 기업 관리자는 기존 서버 설정에 더해 기기 관리 도구인 MDM이나 설정 파일로 Copilot 정책을 전달할 수 있다.

### [GitHub Mobile, Copilot에 코드 병합 충돌 해결 요청](https://skyan0213.github.io/tech-knowledge-garden/news/95b6379f6bf2e5be)

발표 2026-07-08

GitHub는 7월 8일 모바일 앱에서 코드 변경을 병합할 때 생기는 충돌을 Copilot 클라우드 에이전트에 해결하도록 요청하는 기능을 제공한다고 밝혔다. iOS와 Android의 최신 배포판에서 풀 리퀘스트의 병합 영역을 통해 요청을 시작할 수 있다.

## 분야별 브리핑

### AI · 5건

#### [OpenAI, GPT-5.6 Sol·Terra·Luna 정식 출시](https://skyan0213.github.io/tech-knowledge-garden/news/caaa735c832bdb26)

발표 2026-07-09

제품·서비스 · 신제품 · 기능 추가 · OpenAI

OpenAI가 7월 9일 GPT-5.6 제품군의 Sol·Terra·Luna 세 모델을 정식 출시한다고 발표했다. ChatGPT·Codex·OpenAI API에서 전 세계 배포를 시작하며, 이후 24시간에 걸쳐 순차적으로 제공 범위를 넓힌다고 밝혔다.

##### 모델과 요금제별 사용 범위

OpenAI는 Sol을 주력 모델, Terra를 일상 업무용 균형형 모델, Luna를 제품군에서 비용이 가장 낮은 모델로 소개했다. Chat에서는 Plus·Pro·Business·Enterprise 사용자가 medium 이상의 추론 설정으로 Sol을 이용하고, Pro·Enterprise 사용자는 Sol Pro도 선택할 수 있다.

ChatGPT Work와 Codex에서는 Free·Go에 Terra를 제공하고, Plus·Pro·Business·Enterprise에는 세 모델을 선택할 수 있게 한다. max 설정은 이 두 제품에서 GPT-5.6을 이용할 수 있는 모든 사용자에게 제공된다. ultra는 ChatGPT Work에서 Pro·Enterprise, Codex에서 Plus 이상 요금제에 제공된다.

##### API의 도구 실행과 캐시

Responses API의 Programmatic Tool Calling은 모델이 메모리 안에서 프로그램을 작성·실행해 도구를 조정하고 중간 결과를 처리하는 방식이다. OpenAI는 이 기능이 Zero Data Retention(ZDR)과 호환된다고 설명했다. 베타 기능인 Multi-agent는 한 요청 안에서 여러 서브에이전트를 동시에 실행하고 결과를 종합한다.

프롬프트 캐시에는 명시적인 캐시 경계 지정과 최소 30분의 유지 시간이 도입됐다. GPT-5.6 이후 모델의 캐시 작성 요금은 비캐시 입력 요금의 1.25배이며, 캐시 읽기는 입력 요금의 90% 할인율을 유지한다.

##### OpenAI가 공개한 평가 결과

OpenAI는 55개 분야의 장시간 전문 업무를 평가하는 Agents' Last Exam에서 Sol이 53.6을 기록해 Claude Fable 5의 adaptive reasoning보다 13.1점 높았다고 발표했다. Artificial Analysis Coding Agent Index에서는 max 추론 설정의 Sol이 80점으로 Fable 5보다 2.8점 높았고, BrowseComp와 OSWorld 2.0 결과는 각각 92.2%와 62.6%라고 밝혔다.

보안 평가에서는 비슷한 출력 토큰 예산의 ExploitBench에서 GPT-5.6이 73.5%, GPT-5.5가 47.9%를 기록했다고 설명했다. ExploitGym의 2시간 제한에서는 각각 24.9%와 15.1%였으며, GPT-5.6에 6시간을 부여한 결과는 33.7%였다.

##### 문서 작업과 고객 사례

OpenAI는 Sol이 편집 가능한 프레젠테이션을 처음부터 만들고 문서·스프레드시트의 형식과 정확도를 개선했다고 설명했다. 발표문에 실린 Model ML 공동 창업자 Chaz Englander의 발언에서는 FinBench의 고객 업무 20종과 수백 개 프레젠테이션을 평가했을 때 Fable보다 프레젠테이션 한 벌당 토큰을 39% 적게 사용했다고 밝혔다.

같은 발표문에서 Lovable 공동 창업자 Fabian Hedin은 프로덕션 앱 작업에서 이전 모델보다 수행 단계가 약 25%, 도구 호출이 35\~48% 줄고 진행이 멈춘 실행이 15% 감소했다고 설명했다.

[OpenAI 원문](https://openai.com/index/gpt-5-6/)

#### [OpenAI, 동시에 듣고 말하는 GPT-Live 공개](https://skyan0213.github.io/tech-knowledge-garden/news/3fb14968493dc682)

발표 2026-07-08

제품·서비스 · 신제품 · OpenAI

OpenAI가 2026년 7월 8일 음성 모델 GPT-Live-1과 GPT-Live-1 mini를 공개하고 iOS·Android·ChatGPT.com 사용자에게 전 세계 순차 배포를 시작했다. 회사는 입력을 들으면서 동시에 말을 생성하는 풀듀플렉스 구조를 적용하고, 검색이나 심층 추론은 별도 GPT-5.5 모델에 맡겨 대화를 이어가도록 설계했다고 설명했다.

##### 음성 모드별 배경 모델

GPT-Live-1 Instant와 mini는 GPT-5.5 Instant를 사용한다. Medium·High 모드는 GPT-5.5 Thinking을 각각 중간·높은 추론 수준으로 사용한다.

##### OpenAI의 비교 평가

OpenAI는 5\~10분의 길이를 맞춘 대화 비교에서 두 모델이 기존 Advanced Voice Mode보다 선호됐다고 밝혔다. 평가 항목은 전반적 선호도, 발언 순서, 끼어들기, 대화 흐름과 자연스러움이었다.

회사는 생물학·화학·물리학의 전문가 수준 과학 추론을 평가하는 GPQA에서도 GPT-Live-1이 Advanced Voice Mode를 크게 앞섰다고 설명했다.

##### 제공 범위

GPT-Live-1은 Go·Plus·Pro 요금제의 ChatGPT Voice 기본 모델로, mini는 Free 요금제의 기본 모델로 전환할 예정이다. API 제공도 계획으로 발표했으며 개발자·기업의 알림 신청을 받기 시작했다.

출시 당시 GPT-Live는 음성과 함께 쓰는 영상·화면 공유를 지원하지 않았다. 이 기능은 기존 Standard·Advanced Voice Mode에서 계속 사용할 수 있었다. OpenAI는 일부 언어의 억양·유창성을 개선하고 있다고 밝혔다.

[OpenAI 원문](https://openai.com/index/introducing-gpt-live/)

#### [Anthropic, AI의 일자리·사회 영향에 관한 질문 공개 접수](https://skyan0213.github.io/tech-knowledge-garden/news/8dbb2238c30b71eb)

발표 2026-07-09

연구·기술 · 새로운 방법 · Anthropic

Anthropic은 7월 9일(한국시각 10일) AI가 일자리·사회·가족에 미치는 영향과 과학·의료 활용에 관한 질문을 받는 ‘Hard Questions’ 이니셔티브를 발표했다. 회사는 전용 웹사이트에서 대중의 질문을 받고 다른 사람들이 제출한 질문도 보여준다고 밝혔다.

##### 대응 조치 공개 계획

Anthropic은 질문에 대응하기 위해 취하는 구체적인 조치를 공개적으로 추적·보고하고, 그 조치가 회사의 목표에 미치지 못하는 부분도 밝힐 계획이라고 설명했다.

##### 앞서 실시한 조사

회사는 기존 Anthropic Public Record의 첫 조사에서 미국인 5만 2,000명에게 AI에 대한 기대와 우려를 물었다고 밝혔다.

또한 Anthropic Interviewer를 통해 159개국·70개 언어의 Claude 사용자 8만 1,000명을 조사했다고 설명했다. 이 수치는 이번 질문 접수 발표에 앞서 진행한 조사에 해당한다.

[Anthropic 원문](https://www.anthropic.com/news/hard-questions)

#### [단백질·분자·결정 구조를 함께 다루는 SciReasoner 제안](https://skyan0213.github.io/tech-knowledge-garden/news/e6f759764f290fa7)

발표 2026-07-08

연구·기술 · 새로운 방법

연구진은 7월 8일 arXiv에 공개한 사전공개 논문에서 단백질·소분자·무기 결정의 구조를 직접 다루는 멀티모달 모델 SciReasoner를 제안했다. 좌표·위상·주기적 연결을 공통 어휘로 바꾸고, 추론 중 구조 토큰을 근거 단위로 가리키는 방식이다.

##### 단백질 기능 예측

저자들은 초록에서 단백질 상동성을 통제한 Gene Ontology 예측 결과를 보고했다. 상동성이 낮거나 고아 단백질과 유사한 단백질의 Cellular Component 주석 과제에서 F\_max가 0.42에서 0.55로 높아졌다고 밝혔다.

##### 한 단계 역합성

화학 영역에서는 한 단계 역합성 정확도가 0.63에서 0.72로 높아졌다고 보고했다. 분자 조각 수준의 절단과 전구체 검증 과정을 담은 추론 기록도 생성한다고 설명했다.

[arXiv 원문](https://arxiv.org/abs/2607.07708v1)

#### [STRACE, 대표 실패 기록과 의존 그래프로 에이전트 최적화](https://skyan0213.github.io/tech-knowledge-garden/news/27a2def167b365d2)

발표 2026-07-08

연구·기술 · 새로운 방법

연구진은 7월 8일 arXiv에 공개한 사전공개 논문에서 에이전트 실행 기록을 정리해 최적화에 쓰는 STRACE를 제안했다. 형식 검증 과제에서는 전문가가 설계한 에이전트의 성공률 개선도 보고했다.

##### 대표 기록 선별과 원인 단계 추출

여러 실행 기록을 묶어 실패 유형을 찾고, 중복 기록을 걸러 대표 실패 사례를 남긴다.

선별된 개별 기록에서는 텍스트 의존 관계 그래프로 원인 국소화를 수행한다. 저자들은 원인과 무관한 단계를 제거하고 최적화할 원인 모듈을 찾는다고 설명했다.

##### 형식 검증 과제의 결과

저자들은 초록에서 VeruSAGE-Bench 형식 검증 과제의 결과를 제시했다. 전문가 설계 에이전트를 최적화했을 때 성공률이 42.5%에서 58.5%로 높아졌다고 보고했다.

[arXiv 원문](https://arxiv.org/abs/2607.07702v1)

### 소프트웨어·클라우드 · 5건

#### Copilot: 저장소 개요·앱·IDE·모델

##### [GitHub Copilot, 저장소 개요를 대화로 요청하는 기능 제공](https://skyan0213.github.io/tech-knowledge-garden/news/c1b395091566575d)

발표 2026-07-09

제품·서비스 · 기능 추가

GitHub는 7월 9일 github.com에서 저장소 개요를 요청하는 GitHub Copilot 기능을 모든 요금제에 제공한다고 밝혔다. 아직 기여하지 않은 저장소를 처음 살펴볼 때 개요 생성을 제안하고, Copilot Chat에서 요청하면 목적·사용 기술·기여 지침을 요약한다.

###### README가 없는 저장소

GitHub는 README가 없는 저장소라면 Copilot으로 README를 생성할 수 있다고 설명했다. 저장소가 무엇을 하는지, 어떤 기술을 사용하는지 파악하도록 돕는 기능이다.

[GitHub 원문](https://github.blog/changelog/2026-07-09-ask-copilot-for-a-repository-overview/)

##### [GitHub Copilot 데스크톱 앱, 무료·교육 요금제까지 이용 대상 확대](https://skyan0213.github.io/tech-knowledge-garden/news/be4ba95581839c4c)

발표 2026-07-08

제품·서비스 · 기능 추가 · GitHub

GitHub는 한국시간 7월 8일(미국 태평양시간 7월 7일) Copilot 데스크톱 앱을 모든 Copilot 요금제에서 제공한다고 밝혔다. Copilot Free와 GitHub Education 이용자도 macOS·Windows·Linux 앱에서 GitHub 계정으로 로그인해 사용할 수 있다.

###### Copilot 구독 없이 자체 제공사 연결

BYOK는 사용자가 자신의 모델 제공사 API 키를 연결해 세션을 실행하는 방식이다. GitHub는 이 방식에는 Copilot 구독이 필요하지 않다고 설명했다.

###### 기업 요금제의 정책 조건

Copilot Business 또는 Enterprise에서 앱을 이용하려면 조직이나 기업 관리자가 정책 설정에서 Copilot CLI를 활성화해야 한다.

[GitHub 원문](https://github.blog/changelog/2026-07-07-github-copilot-app-available-to-all/)

##### [GitHub Copilot, GPT-5.6 세 모델 점진적 배포](https://skyan0213.github.io/tech-knowledge-garden/news/e7072d841218baed)

발표 2026-07-10

제품·서비스 · 기능 추가 · GitHub · OpenAI

GitHub가 7월 10일(한국시간, 미국 태평양시간 7월 9일) Copilot에 OpenAI의 GPT-5.6 Sol·Terra·Luna를 순차적으로 배포한다고 발표했다. 모델별 지원 요금제가 다르며, Business·Enterprise 사용자는 관리자의 모델 정책 활성화가 필요하다.

###### 세 모델의 용도

GitHub는 Sol을 대규모 코드베이스의 복잡한 추론과 장시간 에이전트 작업에, Terra를 일상적인 대화형·에이전트 코딩에 맞는 선택지로 소개했다. Luna는 작고 빠른 작업용 경량 모델이자 이 제품군에서 비용이 가장 낮은 모델로 설명했다.

###### 요금제와 사용 조건

Sol의 지원 대상은 Pro+·Max·Business·Enterprise이며, Terra와 Luna는 여기에 Pro를 포함한다. 기업 관리자가 켜야 하는 GPT-5.6 모델 정책은 기본적으로 꺼져 있다.

사용량 기반 과금에서는 제공사의 표시 가격을 적용한다.

###### 모델 선택 메뉴

공지된 선택 경로는 VS Code·Visual Studio·Copilot CLI·Copilot cloud agent·Copilot app·github.com·GitHub Mobile(iOS·Android)·JetBrains·Xcode·Eclipse다.

[GitHub 원문](https://github.blog/changelog/2026-07-09-openais-gpt-5-6-sol-terra-and-luna-are-now-available-in-github-copilot/)

##### [JetBrains Copilot에 Codex 미리보기·도구 승인 설정 추가](https://skyan0213.github.io/tech-knowledge-garden/news/f3589f5c7a1073c1)

발표 2026-07-08

제품·서비스 · 기능 추가 · GitHub

GitHub가 7월 8일(한국시간, 미국 태평양시간 7월 7일) JetBrains IDE용 Copilot에 Codex 에이전트 공개 미리보기를 추가하고 Inline Chat을 정식 제공한다고 발표했다. Codex 사용에는 로컬 CLI 설치가 필요하며, Business·Enterprise 사용자는 관리자가 편집기 미리보기 정책을 켜야 한다.

###### Codex 연결

Settings → Tools → GitHub Copilot → Chat에서 Codex를 활성화하고 설치한 CLI의 경로를 지정한다. 이후 Copilot Chat의 에이전트 선택 메뉴에서 Codex를 선택해 세션을 시작한다.

###### 도구 승인과 확인 질문

Copilot CLI의 Default Approvals는 설정한 정책에 따라 확인을 요청한다. Bypass Approvals는 도구 호출을 자동 승인하지만 필요한 확인 질문은 남긴다. 미리보기인 Autopilot은 도구 호출뿐 아니라 확인 질문에도 자동으로 응답하며 작업을 이어간다.

Claude 에이전트 세션에는 권한 모드 선택과 에이전트 디버그 로그 지원이 추가됐다.

###### Hooks와 MCP 서버

Agent Customizations에서 로컬·Copilot CLI 세션의 Hooks를 관리할 수 있다. CLI 세션의 MCP 서버는 명령 실행형과 HTTP형을 지원하며, 상태 확인과 시작·중지·재시작·제거가 가능하다. 프로젝트의 .github/mcp.json에는 작업 공간 단위 서버를 정의한다.

###### 기업 맞춤 모델과 BYOK 수정

Business·Enterprise 관리자가 GitHub 설정에서 구성한 맞춤 모델은 조직 구성원에게 자동으로 제공된다.

GitHub는 BYOK 세션이 Copilot 하위 에이전트를 호출해 Copilot 사용량을 소모하던 오류를 수정했다고 밝혔다. 하위 에이전트 로직이 현재 선택한 BYOK 제공사를 따르도록 바뀌었다.

[GitHub 원문](https://github.blog/changelog/2026-07-07-codex-as-agent-provider-and-agentic-enhancements-in-jetbrains-ides/)

#### Copilot: 기업 설정·원격측정

##### [GitHub Copilot, 기업용 설정을 기기 관리 도구와 파일로 배포](https://skyan0213.github.io/tech-knowledge-garden/news/8380dfc46fdb5389)

발표 2026-07-09

제품·서비스 · 기능 추가

GitHub는 한국시간 7월 9일(미국 태평양시간 7월 8일) Copilot의 기업용 설정을 기기에 직접 배포하는 기능을 VS Code와 Copilot CLI에 정식 제공한다고 밝혔다. 기업 관리자는 기존 서버 설정에 더해 기기 관리 도구인 MDM이나 설정 파일로 Copilot 정책을 전달할 수 있다.

###### 기기 관리 도구로 같은 설정 배포

Microsoft Intune, Jamf, Group Policy로 설정을 보내거나 Chef, Puppet, Ansible로 설정 파일을 배포할 수 있다. GitHub는 기기에서 설정을 읽기 때문에 개발자가 로그인하는 방식과 관계없이 VS Code와 Copilot CLI에 일관되게 적용된다고 설명했다.

###### 여러 채널이 설정을 전달할 때

적용 우선순위는 네이티브 MDM, 서버 관리, 파일 기반 순서다. 둘 이상의 채널이 설정을 제공하면 가장 우선하는 채널의 설정이 통째로 적용된다.

[GitHub 원문](https://github.blog/changelog/2026-07-08-deploy-managed-copilot-settings-via-mdm-in-vs-code-and-cli/)

##### [GitHub Copilot, 기업이 원격측정 데이터 전송과 수집 범위 관리](https://skyan0213.github.io/tech-knowledge-garden/news/25cd2c8cb0feed28)

발표 2026-07-09

제품·서비스 · 기능 추가

GitHub는 한국시간 7월 9일(미국 태평양시간 7월 8일) 기업 관리 설정으로 Copilot의 OpenTelemetry 데이터 전송 경로를 지정할 수 있다고 밝혔다. 이 설정은 VS Code의 Copilot Chat 확장 프로그램과 Copilot CLI를 실행하는 에이전트 호스트에 적용된다.

###### 수집 서버와 기록 범위 지정

관리자는 데이터를 받는 서버의 주소와 OTLP 전송 방식인 otlp-http 또는 otlp-grpc, 서비스 이름과 리소스 속성을 설정할 수 있다.

프롬프트·응답·도구 내용의 기록 여부와 개발자가 그 설정을 바꿀 수 있는지도 관리한다.

###### 관리 설정을 우선 적용

관리 값은 환경변수와 사용자 설정보다 우선한다. 네이티브 MDM, 로그인한 GitHub 계정에서 받는 서버 관리 설정, managed-settings.json 파일로 전달할 수 있다.

###### 인증 헤더의 적용 범위

GitHub는 수집 서버의 인증 토큰 같은 관리 헤더가 Copilot Chat 확장 프로그램의 OTLP 내보내기에만 적용된다고 설명했다. 이 헤더를 환경변수로 전달하지 않아 에이전트 호스트가 생성하는 도구 하위 프로세스에 넘기지 않는다는 설명이다.

[GitHub 원문](https://github.blog/changelog/2026-07-08-enterprise-managed-opentelemetry-export-for-vs-code-and-cli/)

#### GitHub Mobile: 충돌 해결·작업 알림

##### [GitHub Mobile, Copilot에 코드 병합 충돌 해결 요청](https://skyan0213.github.io/tech-knowledge-garden/news/95b6379f6bf2e5be)

발표 2026-07-08

제품·서비스 · 기능 추가

GitHub는 7월 8일 모바일 앱에서 코드 변경을 병합할 때 생기는 충돌을 Copilot 클라우드 에이전트에 해결하도록 요청하는 기능을 제공한다고 밝혔다. iOS와 Android의 최신 배포판에서 풀 리퀘스트의 병합 영역을 통해 요청을 시작할 수 있다.

###### 요청 댓글을 제출해야 에이전트 실행

충돌이 있는 풀 리퀘스트에서 Fix with Copilot을 누르면 해결을 요청하는 댓글이 미리 채워진다. 사용자가 이 댓글을 제출하면 Copilot 클라우드 에이전트가 시작된다.

###### 기존 댓글 요청도 계속 지원

풀 리퀘스트 댓글에서 @copilot을 호출하는 기존 방식도 이용할 수 있다. 실패한 GitHub Actions 작업 수정, 코드 리뷰 의견 반영, 테스트 추가나 후속 코드 변경을 요청하는 방식이다.

[GitHub 원문](https://github.blog/changelog/2026-07-08-github-mobile-fix-merge-conflicts-with-copilot-cloud-agent/)

##### [GitHub Mobile, 원격 Copilot CLI 작업 상태를 실시간 알림으로 제공](https://skyan0213.github.io/tech-knowledge-garden/news/d7c1335c53efecf3)

발표 2026-07-08

제품·서비스 · 기능 추가

GitHub는 7월 8일 모바일 앱에서 원격 Copilot CLI 세션의 진행 상황을 확인하는 실시간 알림을 지원한다고 밝혔다. iOS와 Android의 최신 앱 배포판에서 작업 상태와 사용자 입력이 필요한 시점을 확인할 수 있다.

###### 상태 확인 뒤 세션 로그로 이동

알림은 진행 중, 사용자 입력 대기, 유휴, 완료 상태를 표시한다. 알림을 누르면 GitHub Mobile에서 해당 세션의 로그 화면이 열린다.

###### 운영체제별 지원 조건

iOS의 라이브 액티비티는 iOS 17.2 이상, Android의 라이브 업데이트 알림은 Android 16 이상에서 지원된다. 이보다 이전 Android에서도 기존 진행 상황 알림은 받을 수 있다.

[GitHub 원문](https://github.blog/changelog/2026-07-08-github-mobile-live-notifications-for-copilot-cli-sessions/)

#### [AI SDK 7.0.19, MCP 도구 정의 변경을 감지하는 기능 추가](https://skyan0213.github.io/tech-knowledge-garden/news/5df7e6aa93ded5c9)

발표 2026-07-10

제품·서비스 · 기능 추가

한국시간 7월 10일 공개된 AI SDK의 ai@7.0.19 패치는 MCP 서버의 도구 정의가 이전과 달라졌는지 확인하는 기능을 추가했다. 도구 승인의 서명 보존과 등록 여부 검사도 손보고, 동영상 생성의 참조 입력에 기존 이미지 외에 동영상을 지원한다.

##### 처음 신뢰한 도구 정의와 비교

fingerprintTools는 처음 도구를 신뢰할 때 서버가 제공하는 설명, 입력 스키마, 제목을 고정한다. detectToolDrift는 나중에 가져온 정의와 비교해 도구를 모델에 넘기기 전에 설명의 변경이나 입력 스키마의 확장을 찾아낸다.

비교 기준의 보관과 변경을 발견한 뒤의 대응은 애플리케이션이 맡는다.

##### 등록하지 않은 이름의 처리

도구 이름이나 승인 ID가 constructor, toString, valueOf, \_\_proto\_\_ 같은 상속 속성과 같아도 등록된 도구나 승인으로 읽지 않고 미설정 또는 없는 값으로 처리한다. 직접 등록된 객체 속성인지 확인하는 own-property 검사를 적용한 변경이다.

##### 승인과 동영상 참조 입력

도구 승인의 상태가 responded로 전환될 때 승인 서명을 보존한다. 동영상 생성의 inputReferences 입력은 기존 이미지 참조와 함께 동영상 참조도 받을 수 있도록 확장했다.

[github.com 원문](https://github.com/vercel/ai/releases/tag/ai%407.0.19)

#### Claude Code: v2.1.203·v2.1.204·v2.1.205

##### [Claude Code v2.1.203, 백그라운드 작업 복구·작업 폴더 격리 오류 수정](https://skyan0213.github.io/tech-knowledge-garden/news/aa3c9fe0f3678a1e)

발표 2026-07-08

제품·서비스 · 오류 수정 · 기능 추가

Anthropic은 7월 8일(한국시간) Claude Code v2.1.203을 공개하고 백그라운드 세션과 작업 폴더 격리 관련 오류를 수정했다고 밝혔다. macOS에서 세션을 열거나 전환할 때 잘못된 메모리 부족 판정으로 15\~20초 멈추던 문제를 고쳤으며, 데몬의 세션 토큰이 오래돼 연결·응답·중지에 실패하던 경우 자동 복구하도록 바꿨다. 로그인 만료 전에 경고해 사용자가 백그라운드 세션 중단 전에 다시 인증할 수 있도록 하는 기능도 추가했다.

###### 진행 중인 작업을 유지하는 복구

claude agents 화면으로 돌아올 때 실행 중인 하위 에이전트를 멈추고 프롬프트를 처음부터 다시 실행하던 오류를 수정해, 진행하던 작업을 이어가도록 했다. 데몬 자동 업그레이드 실패가 실행 중인 모든 백그라운드 세션을 조용히 종료하던 문제도 고쳤다.

작업 디렉터리가 삭제되거나 파일로 교체되고 경로가 유효하지 않아질 때 백그라운드 에이전트가 반복 충돌하던 동작은 오류를 한 번 보고하는 방식으로 바뀌었다. TaskStop·TaskOutput이 다른 에이전트가 만든 백그라운드 작업을 찾지 못하던 문제도 수정했으며, 관련 오류에는 실행 중인 에이전트의 ID와 설명을 표시한다.

백그라운드 에이전트 시작 실패에 실제 오류 대신 exit\_with\_message만 나오던 표시를 고쳤다. 데몬을 통해 분기한 세션에서 settings.json의 effortLevel 변경이 무시되던 문제도 수정했다.

###### 분리된 작업 폴더와 실행 환경

격리된 worktree에서 실행해야 할 하위 에이전트의 셸 명령이 부모 체크아웃에서 실행되던 오류를 수정했다. 여러 저장소가 있는 작업공간에서 중첩 저장소 때문에 worktree 생성이 거부되던 문제와, git worktree가 많은 저장소에서 Bash가 argument list too long 오류를 내던 문제도 고쳤다.

Windows 백그라운드 에이전트가 작업을 보낸 셸 대신 데몬의 오래된 PATH를 물려받아 도구를 찾지 못하던 문제를 수정했다. 셸에서 내보낸 ANTHROPIC\_BASE\_URL이 백그라운드·에이전트 화면 세션에서 누락돼 API 키가 기본 엔드포인트로 전송되고 401 오류가 발생하던 문제도 릴리스 노트에 명시했다.

git 저장소가 아닌 디렉터리에서 시작한 백그라운드 세션도 WorktreeCreate 훅이 설정돼 있으면 파일을 편집하지 못하던 오류를 고쳤다. claude agents의 @ 디렉터리 선택기에 등록된 git worktree가 나오지 않던 문제도 수정했다.

###### MCP·편집기 설정과 작업 화면

세션의 추가 작업 디렉터리를 MCP roots/list에 포함하고 디렉터리 집합이 바뀌면 notifications/roots/list\_changed를 보내도록 했다. VS Code 설정에는 모든 세션에 Remote Control을 활성화하는 토글을 추가했다.

진단이나 코드 탐색 요청에 응답하는 LSP 전용 플러그인이 사용되지 않는 플러그인으로 잘못 표시되던 문제를 수정했다. Windows에서는 /clear 뒤 백그라운드 작업 출력이 빈 파일로 계속 대체되던 오류를 고쳤다.

수동 권한 모드에서는 화면 하단에 회색 일시정지 배지를 표시한다. 백그라운드 작업·차이·워크플로 상세 화면을 닫는 키는 왼쪽 화살표 대신 Esc로 바뀌었다.

###### 메모리 처리와 응답 화면

대화 세션의 컨텍스트 사용량 표시기가 매 턴마다 대화 전체를 다시 분석하던 동작을 없애 메모리·턴별 CPU 사용 관련 회귀를 수정했다. 긴 응답이 스트리밍될 때 실시간 미리보기 갱신이 화면 전체를 다시 그리지 않도록 바꿨다.

큰 번들 의존성을 실행 파일에 인라인으로 넣는 대신 지연 로딩하도록 바꿔, 릴리스 노트 기준 바이너리 크기와 시작 시 메모리 사용량이 각각 약 7 MB 줄었다. 하위 에이전트가 자신에게 맡겨진 작업 전체를 다른 하위 에이전트에 다시 위임하는 동작도 줄였다고 설명했다.

macOS의 15\~20초 멈춤 현상은 v2.1.196에서 발생한 회귀로 명시됐다. 수정 대상은 백그라운드 에이전트 세션을 열거나 전환할 때의 잘못된 메모리 부족 판정이다.

[github.com 원문](https://github.com/anthropics/claude-code/releases/tag/v2.1.203)

##### [Claude Code v2.1.204, 원격 작업 중 훅 이벤트 전송 오류 수정](https://skyan0213.github.io/tech-knowledge-garden/news/2f4818ccad349c12)

발표 2026-07-08

제품·서비스 · 오류 수정

Anthropic이 7월 8일 Claude Code v2.1.204를 공개하고, 헤드리스 세션에서 SessionStart 훅의 이벤트가 전송되지 않던 오류를 수정했다고 밝혔다. 릴리스 노트는 이 오류로 원격 작업 프로세스가 훅 실행 도중 유휴 상태로 처리돼 종료될 수 있었다고 설명했다.



[github.com 원문](https://github.com/anthropics/claude-code/releases/tag/v2.1.204)

##### [Claude Code v2.1.205, 자동 모드 승인·Windows 파일 삭제 보호 보강](https://skyan0213.github.io/tech-knowledge-garden/news/414c9891d5ccd917)

발표 2026-07-09

제품·서비스 · 오류 수정 · 기능 추가

Anthropic은 7월 9일(한국시간) Claude Code v2.1.205를 공개하고 자동 모드에서 세션 대화 기록 파일의 변조를 차단하는 규칙을 추가했다. Windows에서는 worktree 내부의 NTFS junction이나 디렉터리 심볼릭 링크 때문에 worktree를 지울 때 바깥 파일까지 삭제되던 오류를 수정했다.

###### 자동 모드의 승인 처리

자동 모드는 문맥에서 값을 알아낼 수 없는 변수를 대상으로 rm -rf를 실행하려 할 때 먼저 확인하도록 바뀌었다. 백그라운드 작업 알림에는 사람이 입력하지 않았다는 사실을 명시해, 대화 기록 안의 가짜 승인이 실행 근거로 쓰이지 않도록 했다.

###### 구조화 출력과 작업 메시지

--json-schema에 잘못된 스키마를 전달했을 때 구조 없는 출력이 조용히 생성되던 오류와, format 키워드를 사용하는 스키마가 거부되던 오류를 수정했다. 작업 도중 보낸 메시지가 --max-turns 한도에 도달한 턴 종료 시 사라지던 문제도 고쳤다.

Bash 호출의 출력이 30K 인라인 한도를 넘으면 그 호출에서 만든 PR과 세션의 연결이 누락되던 문제를 수정했다. 기존 PR을 편집·병합하거나 댓글·push 작업을 하는 세션도 claude agents에서 해당 PR로 연결한다.

프로젝트 검증 스킬은 매 세션 다시 쓰는 대신 문서화된 명령이 바뀔 때만 갱신하도록 수정했다. /doctor는 문제를 진단하고 수정할 수 있는 전체 설정 점검으로 바뀌었으며 /checkup이 별칭으로 추가됐다.

###### MCP·실행 환경과 업데이트

claude mcp add-from-claude-desktop에서 지원하지 않는 문자가 들어간 서버명 때문에 가져오기가 멈추던 오류를 고쳤다. 잘못된 이름을 알리고 나머지 서버는 계속 가져온다. 사용자 설정 MCP 서버는 Claude Browser와 Claude Preview라는 예약된 이름으로 등록할 수 없게 했다.

한 플러그인의 LSP 서버 초기화 실패가 같은 확장자를 처리하는 다른 플러그인의 정상 서버를 막던 오류를 수정했다. CLI 2.1.203 이상에서 Cowork VM 모드의 로컬 에이전트 세션이 로그인 오류로 시작되지 않던 문제도 고쳤다.

Windows에서 명령 실행 중 시작 디렉터리가 삭제·잠금·마운트 해제될 때 발생하던 충돌과, 디렉터리 스캔이 진행되는 동안 파일 감시기가 닫혀 발생하던 충돌을 수정했다. 자동 업데이트용 바이너리를 메모리에 버퍼링하는 대신 디스크로 스트리밍하도록 바꿨다. 릴리스 노트는 이 변경으로 업데이트 프로그램의 최대 메모리 사용량이 약 400 MB 줄었다고 설명했다.

###### 재개 상태와 원격 작업 화면

SendMessage로 재개한 백그라운드 에이전트가 목록에 계속 failed 또는 completed로 남던 표시를 수정했다. 턴에 읽을 수 있는 텍스트가 없으면 needs input 상태가 working으로 되돌아가던 문제도 고쳤다.

백그라운드 에이전트가 업그레이드로 재시작하는 동안 claude attach가 오류를 내는 대신 에이전트가 돌아올 때까지 기다리도록 바꿨다. 웹·모바일 Remote Control의 작업 구성이 바뀔 때 전체 작업 상태를 전달해 Running 표시가 오래 남던 오류도 수정했다.

에이전트 목록의 행에는 색으로 구분한 상태 단어와 분류기가 작성한 제목을 표시한다. 미리보기에서는 전체 상태를 보여주고 막힌 세션이 요청한 내용을 정확히 표시하도록 했다. 작업 목록이 화면을 조금 넘을 때 에이전트 화면이 한 줄 위에 그려져 헤더가 잘리던 오류도 고쳤다.

[github.com 원문](https://github.com/anthropics/claude-code/releases/tag/v2.1.205)
