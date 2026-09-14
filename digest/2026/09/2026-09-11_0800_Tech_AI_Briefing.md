# 2026-09-11 아침 브리핑

DeepSeek의 비대칭 모델 구조, KUKA의 자율 지게차, NVIDIA·Palantir의 공급망 AI

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-11_0800_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [KUKA, 1.5톤 자율 지게차 KMF 1500P-CB 공개…12월 인도 예정](https://skyan0213.github.io/tech-knowledge-garden/news/2fa2d03292bbcc0d)

발표 2026-09-10

KUKA는 9월 10일 최대 1,500kg의 팔레트와 컨테이너를 운반하는 자율 지게차 KMF 1500P-CB를 발표했다. 개방형·폐쇄형 팔레트를 취급하고 최대 3m까지 들어 올리며, 9월부터 전 세계 주문을 받고 12월 인도를 시작할 예정이다. 2027년 1분기에는 좁은 공간의 개방형 팔레트 작업을 위한 PS 모델을 추가할 계획이다.

### [DeepSeek V4.1-Flash, 입력·출력 계산을 나눈 5,520억 매개변수 모델 공개](https://skyan0213.github.io/tech-knowledge-garden/news/90208487c77211d8)

발표 2026-09-10

DeepSeek은 9월 10일 이미지 이해를 기본 지원하는 V4.1-Flash를 API에 공개했다. 총 5,520억 개 매개변수를 가진 MoE 모델로, 입력 처리에는 80억 개, 출력 생성에는 160억 개를 활성화하는 비대칭 구조를 사용한다. 회사는 이전 세대 대비 KV 캐시에 필요한 HBM 용량을 4분의 1, SSD 저장공간을 8분의 1로 줄였다고 밝혔다.

### [NVIDIA·Palantir, 엔비디아 공급망에 맞춤형 AI와 제약 최적화 도입](https://skyan0213.github.io/tech-knowledge-garden/news/c705d902c5bf7a4a)

발표 2026-09-10

NVIDIA와 Palantir는 9월 10일 엔비디아의 공급망 운영에 맞춤형 AI 체계를 먼저 도입한다고 발표했다. Palantir Foundry·AIP의 업무 데이터 위에 NVIDIA Nemotron 모델을 결합하고, cuOpt로 자재 배분의 제약과 대안을 계산하는 구조다. AI는 행동과 대안을 제안하며 최종 결정은 공급망 담당자가 맡는다.

### [OpenAI, 회사 데이터와 지표 정의를 연결하는 ChatGPT Work Data agent 공개](https://skyan0213.github.io/tech-knowledge-garden/news/6a886414536a09e3)

발표 2026-09-10

OpenAI는 9월 10일 기업 데이터에 질문하고 분석 결과를 대시보드로 만드는 ChatGPT Work의 Data agent를 공개했다. BigQuery·Snowflake·Databricks 등 승인된 데이터 연결과 Drive·SharePoint 문서를 이용하며, 조직의 지표 정의와 계산식도 분석에 반영한다. 관리자가 연결과 이용 역할을 정하고, 쿼리에는 연결 계정의 테이블·행·열 접근 제한이 적용된다.

### [OpenAI, 장기 실행 에이전트를 위한 Agents API 공개 베타 출시](https://skyan0213.github.io/tech-knowledge-garden/news/b32e9b8471353987)

발표 2026-09-10

OpenAI는 9월 10일 Codex의 실행 관리 기능을 제공하는 Agents API를 공개 베타로 출시했다. 개발자는 모델·도구·실행 환경을 지정해 에이전트를 구성하고, OpenAI 관리 샌드박스나 자체 인프라를 선택할 수 있다. API는 긴 세션의 문맥 압축, 필요한 도구 검색, 하위 에이전트의 병렬 작업을 지원한다.

## 분야별 브리핑

### AI · 2건

#### [OpenAI, 동시에 듣고 말하는 GPT-Live-1을 API로 제공](https://skyan0213.github.io/tech-knowledge-garden/news/b8a75fb67d817922)

발표 2026-09-10

제품·서비스 · 신제품 · OpenAI

OpenAI는 9월 10일 동시에 듣고 말할 수 있는 음성 모델 GPT-Live-1을 API로 출시했다. 모델은 들어오는 음성과 나가는 음성을 함께 처리하며, 깊은 추론과 도구 호출을 연결된 텍스트 모델에 위임할 수 있다. 개발자는 시스템 프롬프트로 말투·속도·대화 스타일을 조정하고 전화 상담 등의 음성 서비스에 적용할 수 있다.



[OpenAI 원문](https://openai.com/index/introducing-gpt-live-1-in-the-api/)

#### [DeepSeek V4.1-Flash, 입력·출력 계산을 나눈 5,520억 매개변수 모델 공개](https://skyan0213.github.io/tech-knowledge-garden/news/90208487c77211d8)

발표 2026-09-10

제품·서비스 · 연구·기술 · 신제품 · 새로운 방법 · 비용 절감 · DeepSeek

DeepSeek은 9월 10일 이미지 이해를 기본 지원하는 V4.1-Flash를 API에 공개했다. 총 5,520억 개 매개변수를 가진 MoE 모델로, 입력 처리에는 80억 개, 출력 생성에는 160억 개를 활성화하는 비대칭 구조를 사용한다. 회사는 이전 세대 대비 KV 캐시에 필요한 HBM 용량을 4분의 1, SSD 저장공간을 8분의 1로 줄였다고 밝혔다.

##### 전체 크기와 한 번에 쓰는 계산량은 다르다

5,520억 개는 모델 전체의 매개변수 수다. MoE는 입력마다 일부 전문가만 활성화하는 구조이고, 이번 모델은 읽는 단계와 답을 생성하는 단계의 활성 규모도 다르게 설계했다. 따라서 5,520억 개와 80억·160억 개는 서로 다른 대상을 나타내는 수치다.

KV 캐시는 앞서 처리한 토큰의 계산 정보를 보관해 다음 토큰 생성 때 재사용한다. DeepSeek이 제시한 HBM·SSD 절감 수치는 이 캐시의 이전 세대 대비 저장 요구량에 관한 회사 발표다.

[deepseek.com 원문](https://www.deepseek.com/en/news/deepseek-v4-1-flash/)

### 소프트웨어·클라우드 · 2건

#### [OpenAI, 장기 실행 에이전트를 위한 Agents API 공개 베타 출시](https://skyan0213.github.io/tech-knowledge-garden/news/b32e9b8471353987)

발표 2026-09-10

제품·서비스 · 신제품 · OpenAI

OpenAI는 9월 10일 Codex의 실행 관리 기능을 제공하는 Agents API를 공개 베타로 출시했다. 개발자는 모델·도구·실행 환경을 지정해 에이전트를 구성하고, OpenAI 관리 샌드박스나 자체 인프라를 선택할 수 있다. API는 긴 세션의 문맥 압축, 필요한 도구 검색, 하위 에이전트의 병렬 작업을 지원한다.



[OpenAI 원문](https://openai.com/index/introducing-the-agents-api/)

#### [OpenAI, 회사 데이터와 지표 정의를 연결하는 ChatGPT Work Data agent 공개](https://skyan0213.github.io/tech-knowledge-garden/news/6a886414536a09e3)

발표 2026-09-10

제품·서비스 · 표준·생태계 · 신제품 · 호환성 · OpenAI

OpenAI는 9월 10일 기업 데이터에 질문하고 분석 결과를 대시보드로 만드는 ChatGPT Work의 Data agent를 공개했다. BigQuery·Snowflake·Databricks 등 승인된 데이터 연결과 Drive·SharePoint 문서를 이용하며, 조직의 지표 정의와 계산식도 분석에 반영한다. 관리자가 연결과 이용 역할을 정하고, 쿼리에는 연결 계정의 테이블·행·열 접근 제한이 적용된다.

##### 숫자와 함께 지표의 의미를 읽는다

분석에 쓰이는 시맨틱 계층은 조직의 업무 용어, 지표 정의, 계산식, 데이터 관계를 정리한 정보다. Data agent는 dbt나 기존 BI 대시보드 등에서 이 맥락을 가져오도록 설계됐다. 데이터 조회뿐 아니라 회사가 어떤 기준으로 지표를 계산하는지도 연결하는 방식이다.

결과를 대화로 수정하고 공유 가능한 대시보드로 만들 수 있으며, Power BI·Tableau 등 기존 BI 도구와의 작업도 지원한다고 발표했다.

[OpenAI 원문](https://openai.com/index/put-data-to-work/)

### 사이버보안 · 1건

#### [GitHub Actions, 작업별 캐시 읽기·쓰기 권한 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/688d14b85e07a8db)

발표 2026-09-10

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 10일 모든 요금제에 GitHub Actions의 cache-mode 설정을 정식 제공한다고 발표했다. 워크플로 또는 작업 단위에서 캐시 읽기, 읽기·쓰기, 쓰기 전용, 접근 차단 중 하나를 선택할 수 있다. 작업 단위 설정이 우선하며, 재사용 워크플로는 호출자가 부여한 캐시 권한을 초과할 수 없다.



[GitHub 원문](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/)

### 반도체·컴퓨팅 · 1건

#### [NVIDIA·Palantir, 엔비디아 공급망에 맞춤형 AI와 제약 최적화 도입](https://skyan0213.github.io/tech-knowledge-garden/news/c705d902c5bf7a4a)

발표 2026-09-10

표준·생태계 · 사업·고객 · 기술 제휴 · 고객 도입 · NVIDIA · Palantir

NVIDIA와 Palantir는 9월 10일 엔비디아의 공급망 운영에 맞춤형 AI 체계를 먼저 도입한다고 발표했다. Palantir Foundry·AIP의 업무 데이터 위에 NVIDIA Nemotron 모델을 결합하고, cuOpt로 자재 배분의 제약과 대안을 계산하는 구조다. AI는 행동과 대안을 제안하며 최종 결정은 공급망 담당자가 맡는다.

##### 업무 데이터·언어 모델·최적화 계산의 역할

Palantir Ontology는 부품·공급사·운영 조건 등 업무 데이터를 연결하는 기반이다. Nemotron은 조직의 운영 데이터에 맞춰 추가 학습해 권고안을 설명하고, cuOpt는 공급 제약 아래에서 자재 배분 대안을 계산하는 역할을 맡는다.

계획 담당자의 선택과 실제 생산 결과를 후속 모델 개선에 돌려주는 체계도 포함한다. 기업은 자사 데이터와 모델의 통제권을 유지하면서 사내 인프라나 클라우드에 배치할 수 있다는 구상이다.

[NVIDIA 원문](https://nvidianews.nvidia.com/news/nvidia-and-palantir-bring-sovereign-intelligence-to-critical-supply-chains)

### 로봇·제조 · 1건

#### [KUKA, 1.5톤 자율 지게차 KMF 1500P-CB 공개…12월 인도 예정](https://skyan0213.github.io/tech-knowledge-garden/news/2fa2d03292bbcc0d)

발표 2026-09-10

제품·서비스 · 표준·생태계 · 신제품 · 호환성 · KUKA

KUKA는 9월 10일 최대 1,500kg의 팔레트와 컨테이너를 운반하는 자율 지게차 KMF 1500P-CB를 발표했다. 개방형·폐쇄형 팔레트를 취급하고 최대 3m까지 들어 올리며, 9월부터 전 세계 주문을 받고 12월 인도를 시작할 예정이다. 2027년 1분기에는 좁은 공간의 개방형 팔레트 작업을 위한 PS 모델을 추가할 계획이다.

##### 운반에 팔레트 인수·적재 기능을 더하다

CB는 균형추를 사용하는 카운터밸런스 구조를 뜻한다. KUKA는 이 구조로 롤러 컨베이어처럼 아래쪽 접근이 제한된 인계 지점에서도 하중을 집어 들고, 기존 인계 설비를 활용해 다양한 팔레트를 취급하도록 설계했다고 설명했다.

소프트웨어는 KUKA.AMR 체계를 사용하고 VDA 5050 인터페이스로 다른 차량 관제 시스템과 연결한다. 전원은 LFP 배터리이며 접촉식 충전을 사용한다.

[kuka.com 원문](https://www.kuka.com/en-sg/company/press/news/2026/09/kuka-mobile-forklift-launch)
