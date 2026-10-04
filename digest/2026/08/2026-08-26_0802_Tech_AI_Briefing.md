# 2026-08-26 아침 브리핑

2026-08-26 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/08/2026-08-26_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [OpenAI, 자체 추론 칩 Jalapeño의 세 모델 시험 결과 발표](https://skyan0213.github.io/tech-knowledge-garden/news/b9406ae170bd9133)

발표 2026-08-25

OpenAI는 2026년 8월 25일 자체 추론 칩 Jalapeño와 이를 적용한 시스템의 회사 측 성능 시험 결과를 발표했다. 회사는 SemiAnalysis의 공개 InferenceX 벤치마크로 GPT‑OSS 120B, DeepSeek R1, Kimi K2.5 1T를 비교했으며, 최고 처리량 기준 전력당 AI 작업량은 비교 시스템의 1.5\~1.9배, 종단 간 지연은 1.7\~3.6배 낮았다고 밝혔다. Jalapeño의 자사 컴퓨팅 인프라 배치는 2026년 말 시작할 계획이며, 생산 검증과 소프트웨어 준비는 계속 중이다.

### [OpenAI, ChatGPT Work·Codex 관리용 Admin 플러그인 발표](https://skyan0213.github.io/tech-knowledge-garden/news/33eae878317d27dc)

발표 2026-08-25

OpenAI는 2026년 8월 25일 ChatGPT Work와 Codex에서 관리 업무를 처리하는 Admin 플러그인을 발표했다. 관리자는 두 서비스의 활동과 크레딧 사용량을 조회하고, 구성원·그룹, 역할별 기능·모델 접근, 사용 한도를 관리할 수 있다고 회사는 설명했다. 사용 요청을 Slack이나 Microsoft Teams의 승인 담당자에게 보내거나 미리 정한 기준에 맞는 접근 요청을 처리하는 기능도 소개했다.

## 분야별 브리핑

### AI · 1건

#### [OpenAI, ChatGPT Work·Codex 관리용 Admin 플러그인 발표](https://skyan0213.github.io/tech-knowledge-garden/news/33eae878317d27dc)

발표 2026-08-25

제품·서비스 · 기능 추가 · OpenAI

OpenAI는 2026년 8월 25일 ChatGPT Work와 Codex에서 관리 업무를 처리하는 Admin 플러그인을 발표했다. 관리자는 두 서비스의 활동과 크레딧 사용량을 조회하고, 구성원·그룹, 역할별 기능·모델 접근, 사용 한도를 관리할 수 있다고 회사는 설명했다. 사용 요청을 Slack이나 Microsoft Teams의 승인 담당자에게 보내거나 미리 정한 기준에 맞는 접근 요청을 처리하는 기능도 소개했다.

##### 기존 권한과 변경 검토

OpenAI에 따르면 플러그인은 사용자의 기존 역할과 권한 안에서 지원되는 읽기·쓰기 작업을 처리하고 워크스페이스 정책과 승인 절차를 적용한다. 관리자는 작업의 완료 여부와 변경 내역을 확인하고 영향이 큰 작업은 적용 전에 검토할 수 있다.

[OpenAI 원문](https://openai.com/index/introducing-admin-plugin/)

### 반도체·컴퓨팅 · 1건

#### [OpenAI, 자체 추론 칩 Jalapeño의 세 모델 시험 결과 발표](https://skyan0213.github.io/tech-knowledge-garden/news/b9406ae170bd9133)

발표 2026-08-25

연구·기술 · 성능 개선 · OpenAI

OpenAI는 2026년 8월 25일 자체 추론 칩 Jalapeño와 이를 적용한 시스템의 회사 측 성능 시험 결과를 발표했다. 회사는 SemiAnalysis의 공개 InferenceX 벤치마크로 GPT‑OSS 120B, DeepSeek R1, Kimi K2.5 1T를 비교했으며, 최고 처리량 기준 전력당 AI 작업량은 비교 시스템의 1.5\~1.9배, 종단 간 지연은 1.7\~3.6배 낮았다고 밝혔다. Jalapeño의 자사 컴퓨팅 인프라 배치는 2026년 말 시작할 계획이며, 생산 검증과 소프트웨어 준비는 계속 중이다.

##### 시험 조건과 전력 기준

OpenAI는 SemiAnalysis의 공개 InferenceX 형식으로 상용 시스템과 비교했고, 전력당 수치는 각 칩의 공개 정격 전력으로 정규화했다. Jalapeño 정격은 700W이며 시험 중 측정한 지속 전력은 550W 이하였다.

Appendix는 명목 8k/1k·STP 조건을 적었다. GPT‑OSS 120B는 정격 1,200W의 GB200, DeepSeek R1과 Kimi K2.5는 정격 1,400W의 GB300과 비교했다.

##### 모델별 비교 결과

OpenAI의 GPT‑OSS 120B 표에서 최고 혼합 처리량은 Jalapeño 85,448 대 GB200 44,960 TPS/kW다. 별도 종단 간 지연 항목은 1.03초 대 1.80초다.

DeepSeek R1 MXFP4 표의 최고 혼합 처리량은 Jalapeño 19,641 대 GB300 11,781 TPS/kW이며, 별도 지연 항목은 1.65초 대 5.99초다.

Kimi K2.5 MXFP4 표는 최고 혼합 처리량 18,195 대 11,862 TPS/kW와 별도 종단 간 지연 1.56초 대 5.31초를 제시한다.

##### 칩 설계와 배치 계획

OpenAI는 입력을 처리하는 프리필의 연산량과 토큰을 생성하는 디코드의 메모리 대역폭 병목을 함께 고려하고, 데이터 이동을 줄이며 KV 캐시를 가까이 두도록 설계했다고 설명했다. AI 지원 설계로 초기 설계부터 테이프아웃까지 9개월이 걸렸다고 밝혔다.

OpenAI는 선택된 GPT‑OSS 어텐션·MoE 블록의 AI 생성 구현이 기존 사람 작성 구현보다 1.5\~1.8배 빨랐다고 발표했다. 이 수치는 전체 모델 성능이 아니라 선택된 블록의 결과다.

회사는 2026년 말 자사 인프라 배치를 시작할 계획이다. 생산 적격성 검증과 소프트웨어·추가 모델 검증을 진행하는 동안 NVIDIA 등 파트너 가속기도 계속 사용할 방침이라고 밝혔다.

[OpenAI 원문](https://openai.com/index/jalapeno-first-results/)
