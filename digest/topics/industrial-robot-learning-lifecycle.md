# 산업용 로봇의 현장 재학습과 운전 수명주기

ABB는 10월 15일 Fashion Inductor에 AI Robot Trainer를 통합했다. 회사 발표는 운전 중 이상 감시에서 학습 데이터 생성과 셀별 재학습, 실제 로봇 배포까지 이어지는 흐름을 설명한다.

[← 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/industrial-robot-learning-lifecycle.md)

## 사건 이력

<a id="20261016-industrial-robot-learning-lifecycle"></a>

### 2026-10-15 · [ABB, 의류 분류 로봇에 AI 학습·재학습 기능 통합](https://skyan0213.github.io/tech-knowledge-garden/news/f4114c3b83b33336)

ABB Robotics가 10월 15일 의류 물류 모듈 Fashion Inductor에 AI Robot Trainer를 통합한 비전 기반 피지컬 AI 솔루션을 출시했다. 회사는 셀당 시간당 최대 1,300개 처리, 집기 정확도 목표 99.5% 초과, 엔지니어링·시운전 작업량 최대 75% 감소를 제시했다.

[abb.com 원문](https://www.abb.com/global/en/news/139480/prsrl-abb-robotics-brings-industrial-grade-physical-ai-to-fashion-logistics) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-16_0800_tech_ai_briefing)

<a id="flexiv-isaac-sim-to-real-insertion-workflow-20261011"></a>

### 2026-10-11 · [플렉시브 라이즌 4, 엔비디아 아이작 지원…접촉 적응성 부품 꽂기 워크플로 공개](https://skyan0213.github.io/tech-knowledge-garden/news/357d071ec3549884)

2026년 10월 11일 로보틱스247 보도에 따르면 플렉시브의 라이즌 4 시리즈는 엔비디아 아이작 지원을 받으며, 플렉시브는 지원 항목에 아이작 랩·아이작 ROS와 라이즌 4 기반의 새로운 접촉 다발성 부품꽂기 참조 워크플로가 포함된다고 밝혔다. 플렉시브는 참조 워크플로의 첫 적용 사례로 Grav 그리퍼를 장착한 라이즌 4 암의 디스플레이포트 케이블 꽂기를 제시했으며, 이 작업 정책은 Newton 물리 엔진을 쓰는 Isaac Lab에서 대규모 학습되고 소켓 자세·접촉 특성·로봇 동역학을 무작위화해 정확한 소켓 위치를 미리 알리지 않아도 성공하도록 학습된다고 밝혔다. 학습된 정책은 GPU 가속 Isaac ROS 패키지로 실제 로봇에서 실행되며 접근 단계의 자세 추정용 FoundationPose 및 운동 계획용 cuMotion과 함께 작동하고, 라이즌 4의 힘 제어 프레임워크는 부품꽂기 마지막 수 밀리미터 구간에 순응적이고 접촉을 감지하는 동적 정밀 실행을 제공한다. 플렉시브는 개발자가 디스플레이포트 워크플로를 재현해 자체 커넥터·소켓·고정 장치에 맞게 변형하도록 워크플로와 시뮬레이션 자산을 공개 중이라고 밝혔으며, 라이즌 4 SDK는 하위 제어에서 동작 명령을 1000Hz로 스트리밍할 수 있고 원문은 이를 산업용 로봇에서 드물며 실제 하드웨어에서 학습 정책을 높은 주기로 실행하는 데 필요한 기능이라고 설명했다.

[irobotnews.com 원문](https://www.irobotnews.com/news/articleView.html?idxno=48924) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/11/2026-11-03_0800_tech_ai_briefing)
