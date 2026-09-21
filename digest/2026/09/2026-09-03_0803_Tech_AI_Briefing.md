# 2026-09-03 아침 브리핑

2026-09-03 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-03_0803_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Gemini 3.8 Flash Cyber, 제한 접근 안에서 탐지부터 패치까지 묶다](https://skyan0213.github.io/tech-knowledge-garden/news/ef239918f16e1482)

발표 2026-09-02

Google은 9월 2일 Gemini 3.8 Flash와 보안 작업용 Flash Cyber를 발표했다. 일반 Flash는 개발자·기업·소비자 제품에 제공하고, Flash Cyber는 Fairwind 프로그램의 승인된 방어 조직에 제한 제공한다. 프로그램은 모델과 CodeMender 실행 도구를 결합해 취약점 탐지·검증·수정 과정을 지원한다.

### [Microsoft Fabric, 미국 정부용 GCC High에서 공개 미리보기](https://skyan0213.github.io/tech-knowledge-garden/news/fe8d5b0d3b3b1415)

발표 2026-09-02

Microsoft는 9월 2일부터 미국 정부용 GCC High 고객에게 Fabric 공개 미리보기를 제공한다고 발표했다. 정식 제공 시작일은 10월 1일로 제시했으며, 지원 기능은 작업 유형별로 다르고 점차 확대될 예정이라고 밝혔다. 기존 Power BI Premium 용량을 이용하거나 신규 Fabric 용량을 구매하는 방식으로 접근한다.

### [Longfellow Zero-Knowledge Proof 라이브러리](https://skyan0213.github.io/tech-knowledge-garden/news/bcb54aceb5f739d9)

발표 2026-09-02

Google은 9월 2일 Longfellow 영지식 증명 라이브러리를 Linux Foundation Europe 산하 Post-Quantum Cryptography Alliance에 기부한다고 발표했다. 2025년 공개한 코드를 공급업체 중립적인 공동 관리 체계로 옮기며, Google도 공개 개발과 지원을 계속한다는 내용이다. 디지털 신원에서 필요한 조건만 증명하는 구현을 공동 검토·활용하도록 하는 조직적 변화다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 1건

#### [Microsoft Fabric, 미국 정부용 GCC High에서 공개 미리보기](https://skyan0213.github.io/tech-knowledge-garden/news/fe8d5b0d3b3b1415)

발표 2026-09-02

제품·서비스 · 기능 추가 · Microsoft

Microsoft는 9월 2일부터 미국 정부용 GCC High 고객에게 Fabric 공개 미리보기를 제공한다고 발표했다. 정식 제공 시작일은 10월 1일로 제시했으며, 지원 기능은 작업 유형별로 다르고 점차 확대될 예정이라고 밝혔다. 기존 Power BI Premium 용량을 이용하거나 신규 Fabric 용량을 구매하는 방식으로 접근한다.

##### 데이터를 모으고 같은 의미로 읽는 기반

Fabric은 OneLake 위에 데이터 통합·분석·데이터베이스·실시간 처리·비즈니스 인텔리전스를 묶는다. Fabric IQ는 의미 모델과 지표, 운영 지식을 연결해 에이전트와 사람이 데이터를 공통된 업무 맥락에서 활용하도록 구성한다.

Power BI와 Fabric 작업은 같은 용량을 소비한다. 고객이 도입할 때 확인할 대상은 자신이 쓸 기능의 GCC High 제공 여부와 용량 조건이다. 다른 고객의 비용 절감 사례를 이 정부 환경의 검증된 성과로 일반화할 수는 없다.

[Microsoft 원문](https://www.microsoft.com/en-us/microsoft-cloud/blog/us-government/2026/09/02/microsoft-fabric-in-gcc-high-building-the-data-foundation-for-ai/)

### 사이버보안 · 2건

#### [Gemini 3.8 Flash Cyber, 제한 접근 안에서 탐지부터 패치까지 묶다](https://skyan0213.github.io/tech-knowledge-garden/news/ef239918f16e1482)

발표 2026-09-02

제품·서비스 · 신제품 · Google

Google은 9월 2일 Gemini 3.8 Flash와 보안 작업용 Flash Cyber를 발표했다. 일반 Flash는 개발자·기업·소비자 제품에 제공하고, Flash Cyber는 Fairwind 프로그램의 승인된 방어 조직에 제한 제공한다. 프로그램은 모델과 CodeMender 실행 도구를 결합해 취약점 탐지·검증·수정 과정을 지원한다.

##### 시험 점수와 패치 운영의 범위

Google은 20개 프로그래밍 언어를 대상으로 한 내부 취약점 탐지 평가에서 성공률 70% 초과, CWE-Bench 패치 평가에서 pass@1 47.2%를 보고했다. 전자는 발견, 후자는 첫 시도의 수정 성공을 측정하는 서로 다른 평가다.

Fairwind 참여 조직은 내부 보안·사고 대응·침투 테스트 담당자로 접근을 제한하고 다중 인증 등의 통제를 적용하기로 한다. 모델의 시험 점수나 생성 패치는 실제 저장소의 회귀 검사·승인·배포 완료를 대신하지 않는다.

[Google 원문](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/) · [Google 원문](https://blog.google/innovation-and-ai/technology/safety-security/fairwind-program/)

#### [Longfellow Zero-Knowledge Proof 라이브러리](https://skyan0213.github.io/tech-knowledge-garden/news/bcb54aceb5f739d9)

발표 2026-09-02

표준·생태계 · 오픈소스 · Google · Linux Foundation Europe · Post-Quantum Cryptography Alliance

Google은 9월 2일 Longfellow 영지식 증명 라이브러리를 Linux Foundation Europe 산하 Post-Quantum Cryptography Alliance에 기부한다고 발표했다. 2025년 공개한 코드를 공급업체 중립적인 공동 관리 체계로 옮기며, Google도 공개 개발과 지원을 계속한다는 내용이다. 디지털 신원에서 필요한 조건만 증명하는 구현을 공동 검토·활용하도록 하는 조직적 변화다.

##### 신분증 정보와 조건의 증명을 구분한다

영지식 증명은 증명의 대상이 되는 비밀 자체를 드러내지 않고 명제가 참임을 확인하는 암호 방식이다. 디지털 신원과 결합하면 생년월일 전체를 전달하는 대신 일정 연령 이상이라는 조건을 증명하는 데 사용할 수 있다.

이번 발표의 확인된 변화는 라이브러리 기부와 공동 관리 방향이다. 재단 이관이 구현의 보안 감사 완료나 표준 채택, 모든 환경의 상호운용성을 자동으로 입증하지는 않는다.

[Google 원문](https://blog.google/products-and-platforms/platforms/google-pay/zero-knowledge-proof-library-linux-foundation/)
