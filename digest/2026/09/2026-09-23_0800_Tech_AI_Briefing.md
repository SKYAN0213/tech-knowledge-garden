# 2026-09-23 아침 브리핑

2026-09-23 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-23_0800_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하](https://skyan0213.github.io/tech-knowledge-garden/news/73461b3e97af0d93)

발표 2026-09-23

OpenAI는 한국시간 9월 23일(원문 게시일 9월 22일) GPT-6 Sol과 Luna를 공개하고 API와 ChatGPT Work·Codex에 제공한다고 밝혔다. API의 100만 토큰당 입력·출력 가격은 Sol이 각각 2달러·10달러, Luna가 0.10달러·0.50달러다. 비교표에 제시한 이전 GPT-5.6 프로모션 가격은 Sol이 4달러·20달러, Luna가 0.20달러·1.20달러다.

### [LS일렉트릭, 부산 공장에 Spot 2대 정식 운용…열화상·환경 점검](https://skyan0213.github.io/tech-knowledge-garden/news/94d03e7f8181fafd)

발표 2026-09-22

LS ELECTRIC은 9월 22일 부산사업장에서 Boston Dynamics의 사족보행 로봇 Spot 2대를 정식 운용하고 있다고 밝혔다. 현대오토에버와 7월부터 약 두 달간 시험한 뒤 생산설비 모니터링·품질관리·안전관리 업무에 도입했다. 회사는 부산에서 수집한 운영 데이터를 바탕으로 AI 분석 모델을 구축하고 국내외 주요 생산기지로 적용을 확대할 계획이다.

### [Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공](https://skyan0213.github.io/tech-knowledge-garden/news/3742191de5126dd0)

발표 2026-09-22

Cadence는 한국시간 2026년 9월 22일 자연어 설계 사양에서 RTL 코드를 생성하고 전력·성능·면적(PPA)을 최적화하는 ChipStack RTL Generation Agent를 발표했다. 새 기능은 기존 RTL을 새로운 설계 요구에 맞춰 수정하고 기능과 PPA를 분석·검증한다. 확대된 ChipStack·InnoStack 기능은 2026년 4분기 일부 조기 접근 고객에게 제공할 예정이다.

### [Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개](https://skyan0213.github.io/tech-knowledge-garden/news/66c52fd129c04f36)

발표 2026-09-22

Roche는 9월 22일 과체중·비만을 동반한 성인 제2형 당뇨병 환자 447명이 참여한 enicepatide 2상 시험의 주요 결과를 발표했다. 주 1회 24mg 투여군은 48주 시점에 당화혈색소가 평균 8.1%에서 2.65%포인트 낮아졌고 체중은 평균 15.5% 감소했다. 이는 회사가 공개한 주요 결과로, 치료제 승인이나 임상 논문 전문 공개를 뜻하지 않는다.

### [Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약](https://skyan0213.github.io/tech-knowledge-garden/news/cab7656fd9930f79)

발표 2026-09-22

Envisagenics는 9월 22일 베링거인겔하임과 고형암 치료 표적을 검증하는 다년간 연구 협업·옵션 계약을 발표했다. 자체 SpliceCore 플랫폼으로 찾은 종양 특이적 표적을 연구하고, 성공적으로 검증되면 베링거가 선택한 표적의 독점 개발·사업화 권리를 확보할 수 있는 구조다. 선급금·연구비·옵션료·개발·규제·상업화 단계별 지급금을 합친 잠재 금액은 10억 달러 초과이며 향후 판매 로열티는 별도다.

## 분야별 브리핑

### AI · 1건

#### [OpenAI, GPT-6 Sol·Luna 출시…API 입력·출력 요금 인하](https://skyan0213.github.io/tech-knowledge-garden/news/73461b3e97af0d93)

발표 2026-09-23

제품·서비스 · 신제품 · 가격 변경 · OpenAI

OpenAI는 한국시간 9월 23일(원문 게시일 9월 22일) GPT-6 Sol과 Luna를 공개하고 API와 ChatGPT Work·Codex에 제공한다고 밝혔다. API의 100만 토큰당 입력·출력 가격은 Sol이 각각 2달러·10달러, Luna가 0.10달러·0.50달러다. 비교표에 제시한 이전 GPT-5.6 프로모션 가격은 Sol이 4달러·20달러, Luna가 0.20달러·1.20달러다.

##### 긴 작업에서 앞선 문맥의 계산을 재사용

OpenAI는 프롬프트 캐시를 개선해 이전 문맥을 재사용하도록 했으며, 캐시된 입력 토큰 읽기에는 90% 할인이 적용된다고 설명했다.

추론 노력 수준이나 사용 가능한 도구를 바꾸더라도 이전 문맥의 캐시 재사용을 유지한다. 개발자는 명시적 캐시 경계로 캐시할 프롬프트 접두부의 끝을 지정할 수 있다.

##### 요금제별 제공 대상과 단계적 배포

ChatGPT Work·Codex에서는 Plus·Pro·Business·Enterprise·Edu 사용자에게 두 모델을 제공한다. Free·Go 사용자는 데스크톱 앱에서 Luna를 이용할 수 있으며, 발표 원문은 두 모델이 당시 Chat에는 아직 제공되지 않는다고 명시했다.

OpenAI는 서비스 안정성을 위해 발표 당일 ChatGPT에서 점진적으로 배포할 계획이라고 밝혔다.

[OpenAI 원문](https://openai.com/index/introducing-gpt-6-sol-and-luna/) · [OpenAI 원문](https://openai.com/news/rss.xml)

### 소프트웨어·클라우드 · 1건

#### [Nutanix, 프랑스 AI 연산 조율 기업 Ryax 인수](https://skyan0213.github.io/tech-knowledge-garden/news/299dfd60a92b85ff)

발표 2026-09-22

투자·기업거래 · 인수합병 · Nutanix · Ryax Technologies

Nutanix는 9월 22일 프랑스의 AI 연산 조율 소프트웨어 기업 Ryax Technologies를 인수했다고 발표했다. Ryax의 GPU·CPU 자원 최적화와 작업 배치 기술을 Nutanix Kubernetes Platform 및 Enterprise AI의 후속 제품에 통합할 계획이다. 회사는 거래가 재무에 미치는 영향이 중요하지 않은 수준이라고 밝혔다.

##### 제품 통합과 프랑스 인력 합류 계획

Ryax CEO는 사내 데이터센터와 대형·신흥 클라우드를 함께 사용하는 환경에서 AI 작업을 실행·확장·관리하도록 인프라를 조율한다고 설명했다. Ryax 팀은 프랑스 Nutanix 조직에 합류할 예정이다.

[nutanix.com 원문](https://www.nutanix.com/press-releases/2026/nutanix-acquires-ryax-technologies-to-help-customers-accelerate-agentic-ai-initiatives)

### 사이버보안 · 3건

#### [VAST, 데이터·모델을 보호하는 DataEnclave 공개…출하는 내년 1분기](https://skyan0213.github.io/tech-knowledge-garden/news/48f3b502c43f955e)

발표 2026-09-22

제품·서비스 · 신제품 · VAST Data · NVIDIA

VAST Data는 9월 22일 민감한 기업 데이터와 AI 모델을 보호된 연산 환경에서 함께 실행하는 DataEnclave를 사전 공개했다. NVIDIA의 기밀 컴퓨팅 기술을 사용하며, 정식 출하는 2027년 1분기로 예정했다. 기업 데이터 소유자와 모델 제공자가 서로의 자산을 직접 노출하지 않고 추론을 수행하도록 설계한 제품이다.

##### 실행 환경을 확인한 뒤 복호화 키를 전달

데이터 소유자와 모델 소유자는 각각 키를 관리한다. 원격 검증으로 실행 환경이 정책을 충족하는지 확인한 뒤 키를 전달해, 승인된 보호 영역 안에서 데이터와 모델을 복호화하고 처리한다.

VAST는 격리망 운영과 감사 기록도 지원한다고 설명했다. 이는 공급업체가 발표한 보안 설계이며 독립적인 침투시험 결과나 모든 공격에 대한 방어 보장은 아니다.

[vastdata.com 원문](https://www.vastdata.com/press-releases/vast-data-introduces-dataenclave-to-bring-leading-ai-models-and-enterprise-data-together-on-trusted-infrastructure)

#### [Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표](https://skyan0213.github.io/tech-knowledge-garden/news/f73f3c73e2cee66d)

발표 2026-09-22

제품·서비스 · 기능 추가 · Proofpoint

Proofpoint는 9월 22일 데이터 보호와 AI 사용 통제를 결합한 Agentic Data and AI Security 기능을 발표했다. 탐지·조사·대응 에이전트가 신원·접근·데이터·행동·의도를 연결한 공통 그래프를 활용하도록 설계됐다. 제공 시점은 2026년 말까지로 예고했다.

##### 자연어 업무 정책과 실행 통제 연결

회사는 자연어 업무 정책의 의도를 해석해 실행 통제를 생성하고, AI 상호작용과 도구 사용·정책 결정을 조사하도록 설계했다고 설명했다. 대응 과정에는 접근 권한 조정·DLP 정책 최적화와 사람의 검토를 포함한다.

[proofpoint.com 원문](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-breaks-down-divide-between-data-security-and-ai-security)

#### [네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시](https://skyan0213.github.io/tech-knowledge-garden/news/c2a48879e9e88507)

발표 2026-09-22

제품·서비스 · 신제품 · 네이버클라우드

네이버클라우드는 9월 22일 데이터베이스와 서버의 접근 권한·작업 이력을 통합 관리하는 DSAC를 출시했다고 밝혔다. 고객의 가상 네트워크 안에 프록시를 자동 구성해 DB와 서버의 접속 경로를 관리한다. 관리자는 콘솔에서 사용자별 접근 권한과 작업 기록을 확인할 수 있다.

##### 민감정보 마스킹과 로그 서비스 연동

서비스는 저장하는 주민등록번호·카드정보 등 민감정보를 마스킹하고, 기존 로그 서비스와 연동해 작업 이력을 조회·장기 보관한다. 업무 시간 외 접속과 대량 조회 같은 이상 징후도 감지한다.

[navercorp.com 원문](https://navercorp.com/media/pressReleasesDetail?seq=10034680)

### 반도체·컴퓨팅 · 1건

#### [Cadence, 설계 사양을 RTL로 만드는 에이전트 공개…4분기 제한 제공](https://skyan0213.github.io/tech-knowledge-garden/news/3742191de5126dd0)

발표 2026-09-22

제품·서비스 · 기능 추가 · Cadence · Honda R&D

Cadence는 한국시간 2026년 9월 22일 자연어 설계 사양에서 RTL 코드를 생성하고 전력·성능·면적(PPA)을 최적화하는 ChipStack RTL Generation Agent를 발표했다. 새 기능은 기존 RTL을 새로운 설계 요구에 맞춰 수정하고 기능과 PPA를 분석·검증한다. 확대된 ChipStack·InnoStack 기능은 2026년 4분기 일부 조기 접근 고객에게 제공할 예정이다.

##### 에이전트와 설계 도구의 역할

Cadence는 상위 super agent가 작업별 에이전트를 조율하고, 각 에이전트가 EDA 소프트웨어를 사용하는 구조라고 설명했다.

##### Honda R&D의 초기 평가

Honda R&D는 자동차용 SoC에서 에이전트를 평가하며, 설계 사양부터 RTL 개발까지의 생산성을 높이는 작업을 진행하고 있다고 밝혔다.

##### 기반 모델과 비교한 회사 평가

Cadence는 초기 평가에서 기반 모델만으로 코드를 생성한 경우와 비교해 평균 면적이 24%, 전력이 18% 줄었다고 발표했다.

[fwnbc.marketminute.com 원문](https://fwnbc.marketminute.com/article/bizwire-2026-9-22-cadence-expands-chipstack-ai-super-agent-with-a-new-agent-for-rtl-generation-and-early-ppa-optimization)

### 로봇·제조 · 2건

#### [LS일렉트릭, 부산 공장에 Spot 2대 정식 운용…열화상·환경 점검](https://skyan0213.github.io/tech-knowledge-garden/news/94d03e7f8181fafd)

발표 2026-09-22

사업·고객 · 고객 도입 · LS ELECTRIC · Boston Dynamics

LS ELECTRIC은 9월 22일 부산사업장에서 Boston Dynamics의 사족보행 로봇 Spot 2대를 정식 운용하고 있다고 밝혔다. 현대오토에버와 7월부터 약 두 달간 시험한 뒤 생산설비 모니터링·품질관리·안전관리 업무에 도입했다. 회사는 부산에서 수집한 운영 데이터를 바탕으로 AI 분석 모델을 구축하고 국내외 주요 생산기지로 적용을 확대할 계획이다.

##### 변압기 진공건조 설비 점검

우선 초고압 변압기의 진공건조로 VPD를 관리한다. 열화상 카메라로 챔버 도어의 실링 이상과 열 누설을 비접촉 점검하고, 진공펌프·모터·제어반의 발열·소음·진동 데이터를 수집하는 방식이다.

##### 자율 순찰과 환경 데이터

회사 발표에 따르면 Spot은 자율 순찰 중 AIVI 비전 검사로 항온·항습 설비의 운영 상태를 확인하고, 별도 측정 시스템으로 온·습도를 자동 수집한다. 기존 센서로 확인하기 어려운 사각지대의 환경 데이터도 확보하도록 구성했다.

##### 예지보전으로 확대할 설비

모터·냉각기·펌프·칠러·발전기 등을 주기적으로 순찰해 온도·진동·소음을 수집하고, AI 분석과 연결해 이상을 예측하는 체계도 구축할 계획이다. 중장기 전략은 생산·품질·안전 데이터를 함께 관리하는 디지털 제조 플랫폼이다.

[lsholdings.co.kr 원문](https://lsholdings.co.kr/ko/media/news/306c38774167465a5137683163335633354a6952646459724d77734f74753645)

#### [Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%](https://skyan0213.github.io/tech-knowledge-garden/news/c2d62bc474a75d21)

발표 2026-09-22

연구·기술 · 실증·재현 · Intrinsic · Open Robotics · Universal Robots

Intrinsic은 9월 22일 AI for Industry Challenge의 실제 로봇 작업셀 최종 시험에서 두 팀이 성공률 100%를 기록했다고 발표했다. 참가팀은 캘리포니아의 UR5e 작업셀에 원격으로 소프트웨어를 배포해 케이블 커넥터를 찾아 집고 지정 포트에 끼우는 과제를 수행했다. 미국 Flex 팀이 우승하고 인도 TCS-PLGRM 팀이 2위를 차지했다.

##### 위치 인식과 힘 제어에 적용한 방법

상위 10개 팀 모두 부품의 위치·자세 인식에 Intrinsic Vision Model을 사용했고, 실제 삽입 단계에서 상위 팀의 90%는 힘·토크 센서 피드백과 규칙 기반 제어를 사용했다고 주최 측은 설명했다.

주최 측은 커넥터가 포트에 걸리는 동작과 휘어지는 케이블을 시뮬레이션이 충분히 포착하지 못했다고 밝혔다.

대회는 Intrinsic과 Open Robotics, Universal Robots 등 협력사가 전자 조립의 유연 케이블 조작과 커넥터 삽입을 과제로 진행했다.

[intrinsic.ai 원문](https://www.intrinsic.ai/blog/posts/ai-for-industry-challenge)

### 에너지·기후기술 · 2건

#### [LG에너지솔루션 ESS, NVIDIA DSX Ready 요건 충족](https://skyan0213.github.io/tech-knowledge-garden/news/8eef4c45f7f30411)

발표 2026-09-22

표준·생태계 · 호환성 · LG에너지솔루션 · NVIDIA

LG에너지솔루션은 9월 22일 자사 배터리 에너지저장장치가 NVIDIA DSX Ready BESS 자격을 획득했다고 발표했다. DSX 설계 요건에 맞는 교류 연계형 저장장치로, 2.5MW 출력·5.1MWh 용량의 배터리 블록을 조합한다. AI 데이터센터 등의 전력 부하 변동과 전압 저하에 대응하도록 설계했다.

##### 출력·용량과 생산능력 계획을 구분

2.5MW는 블록의 출력, 5.1MWh는 저장 에너지 용량이다. 회사는 계통 형성 기능과 빠른 응답, 전압 저하 대응을 지원한다고 설명했다.

북미 5개 생산시설을 활용해 연말까지 LFP 셀 생산능력 50GWh 이상을 확보하겠다는 내용은 계획이다. 이번 자격 획득은 해당 규모의 실제 생산이나 고객 수주·설치 완료를 뜻하지 않는다.

[lgcorp.com 원문](https://lgcorp.com/media/release/30596)

#### [Pila·Brooklyn SolarWorks, 뉴욕 옥상 태양광과 플러그형 배터리 실증](https://skyan0213.github.io/tech-knowledge-garden/news/fbfa93226b6339d4)

발표 2026-09-22

사업·고객 · 고객 도입 · Pila Energy · Brooklyn SolarWorks

Pila Energy는 9월 22일 뉴욕에서 Brooklyn SolarWorks의 옥상 태양광과 플러그형 배터리를 결합하는 시범사업을 발표했다. 회사에 따르면 브루클린·퀸스 가구들이 기존 태양광 패널과 배터리를 이미 결합해 발전량을 저장하고, 전기요금이 높은 시간에 사용하고 있다. 이웃이 공동으로 신청하면 배터리 할인 혜택을 받는 Pila Neighborhoods도 발표했다.

##### 콘센트에 연결하는 배터리와 시범사업 확대 계획

Pila는 배터리를 표준 120V 콘센트에 연결해 냉장고·라우터 등 연결된 필수 기기에 정전 시 전력을 공급하도록 설계했다고 설명했다. 전기요금이 낮을 때 충전하고 높은 시간에 해당 기기에 공급하는 방식도 제공한다.

두 회사는 2026년 가을에 시범사업 참여 가구를 확대할 계획이라고 밝혔다.

[prweb.com 원문](https://www.prweb.com/releases/pila-energy-launches-first-plug-in-path-to-home-battery-storage-in-new-york-city-302886178.html)

### 바이오·의료기술 · 2건

#### [Roche, enicepatide 2상에서 48주 혈당·체중 결과 공개](https://skyan0213.github.io/tech-knowledge-garden/news/66c52fd129c04f36)

발표 2026-09-22

연구·기술 · 실증·재현 · Roche

Roche는 9월 22일 과체중·비만을 동반한 성인 제2형 당뇨병 환자 447명이 참여한 enicepatide 2상 시험의 주요 결과를 발표했다. 주 1회 24mg 투여군은 48주 시점에 당화혈색소가 평균 8.1%에서 2.65%포인트 낮아졌고 체중은 평균 15.5% 감소했다. 이는 회사가 공개한 주요 결과로, 치료제 승인이나 임상 논문 전문 공개를 뜻하지 않는다.

##### 투여군의 변화량과 위약 대비 효과

CT-388-104는 무작위·이중눈가림·위약 대조 시험이다. 447명은 전체 참여자 수이며 24mg군의 인원 수가 아니다. 발표된 체중 감소율을 위약 보정 효과로 바꿔 읽을 수 없다.

회사는 모든 용량군 합산에서 이상반응으로 치료를 중단한 비율이 2%, 위약군은 0%였으며 주로 경도·중등도 위장관 이상반응이었다고 밝혔다. 혈당·심혈관 결과를 평가하는 3상은 2027년 상반기 시작할 계획이다.

[roche.com 원문](https://www.roche.com/media/releases/med-cor-2026-09-22)

#### [Envisagenics·베링거, RNA 스플라이싱 기반 항암 표적 공동 검증 계약](https://skyan0213.github.io/tech-knowledge-garden/news/cab7656fd9930f79)

발표 2026-09-22

사업·고객 · 수주·계약 · Envisagenics · Boehringer Ingelheim

Envisagenics는 9월 22일 베링거인겔하임과 고형암 치료 표적을 검증하는 다년간 연구 협업·옵션 계약을 발표했다. 자체 SpliceCore 플랫폼으로 찾은 종양 특이적 표적을 연구하고, 성공적으로 검증되면 베링거가 선택한 표적의 독점 개발·사업화 권리를 확보할 수 있는 구조다. 선급금·연구비·옵션료·개발·규제·상업화 단계별 지급금을 합친 잠재 금액은 10억 달러 초과이며 향후 판매 로열티는 별도다.

##### RNA 스플라이싱으로 표적을 선별한다

RNA 스플라이싱은 RNA 조각을 이어 단백질 정보를 만드는 과정이다. Envisagenics는 SpliceCore가 AI·대규모 전사체·실험 검증을 결합하고 1,400만 개 초과의 스플라이싱 사건을 선별해 표적의 질환 특이성·환자 유병률·치료 적합성을 예측한다고 설명했다.

협업 대상은 SpliceCore로 이미 찾은 종양 특이 표적이다. 항체약물접합체, T세포 연결체, 다중특이 항체 등으로 활용할 가능성을 추가 검증한다.

##### 연구실 출신 창업자와 과학자문

CSHL은 2021년 자료에서 Martin Akerman이 Adrian Krainer 교수 연구실의 박사후연구원 시절 SpliceCore를 개발했으며 Envisagenics의 공동창업자라고 설명했다. 회사 소개도 Akerman의 공동창업 관계를 확인한다.

같은 CSHL 자료에서 Krainer 교수의 회사 역할은 과학자문위원회 구성원으로 명시됐다.

##### 연구 검증·독점 옵션·지급 조건

연구 프로그램을 성공적으로 마치면 Boehringer Ingelheim은 선택한 표적의 후속 개발·상업화를 위한 독점 라이선스를 취득할 옵션을 갖는다. 이번 발표는 표적 검증을 위한 다년간 연구 협업·옵션 계약이다.

회사가 제시한 10억 달러 초과 잠재 지급금에는 선급금·연구비·옵션료와 개발·규제·상업화 마일스톤이 포함된다. 향후 제품 판매 로열티는 별도다.

[envisagenics.com 원문](https://envisagenics.com/news/envisagenics-and-boehringer-ingelheim-enter-multi-target-collaboration-to-develop-first-in-class-precision-therapies-based-on-rna-splicing-derived-targets-for-hard-to-treat-cancers) · [cshl.edu 원문](https://www.cshl.edu/envisagenics-and-biogen-partner-for-rna-splicing-research/) · [envisagenics.com 원문](https://envisagenics.com/about)

### 우주·기초과학 · 1건

#### [우주항공청, 제2우주센터 설계에 민간 발사 수요 의견 수렴](https://skyan0213.github.io/tech-knowledge-garden/news/6bbcd64185c1cd83)

발표 2026-09-22

표준·생태계 · 기술 제휴 · 우주항공청 · 대한항공 · 비츠로넥스텍 · 이노스페이스 · 한양ENG · 한화에어로스페이스

우주항공청은 9월 22일 한국항공우주연구원에서 국내 발사체 관련 5개 기업과 제2우주센터 민간 활용 간담회를 열었다. 기업들은 향후 발사 수요와 상업 발사 시작 시점을 고려한 인프라 우선순위, 시설 요건과 기업 활용 공간에 관한 요구를 제시했다. 우주항공청은 설계 단계부터 이러한 수요를 반영하겠다고 밝혔다.

##### 수요 조사와 발사 계약을 구분

이번에 진행된 것은 발사장 설계·운영 요구를 모으는 협의다. 발표에는 확정 발사 횟수나 시설 가동일, 기업별 사용 계약 금액이 제시되지 않았다.

[kasa.go.kr 원문](https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=498)
