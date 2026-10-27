# AI 사용량과 성과를 분리해 측정

많이 쓴 AI가 실제로 일을 더 잘했는가?

[← 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/evaluation.md)

## 현재 판단

도입·활동 지표와 결과의 정확성·사람 개입량은 다른 질문에 답한다. 사용량, 자동 종료된 댓글과 최종 성공을 하나의 품질 점수로 합치기 전에 각 지표의 판정 범위를 정해야 한다. OpenAI의 내부 연구 관찰은 도움을 받아 끝낸 과제와 자율 완료를 구분하며 불확실한 결과와 계산 자원 확대의 영향이 남아 있다. GitHub의 전용 Agents 창 집계와 코드 리뷰 댓글 정리는 업무 품질 자체를 측정하지 않는다. 9월 21일 OpenAI의 표준 제안과 언어 접근성 공동 목표는 평가·보급 계획이며 달성된 품질 성과가 아니다. 9월 22일 Intrinsic의 실제 작업셀 고정 과제 성공률을 공장 장기 가동률로 확대할 수 없다.

2026-10-27까지 서로 다른 원문 14건 · 10일에 걸쳐 관측. 최근 7일 4건 / 이전 7일 1건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

동일 업무에서 자율 완료율, 사람 검토 시간, 결함 재발과 데이터 누락률을 함께 비교한다.

## 판단을 바꿀 조건

활동량만 증가하고 검증된 결과나 사람의 검토 부담이 개선되지 않으면 생산성 향상 판단을 보류한다.

## 재사용할 원칙

### 사용량·결과 품질·사람 개입량을 별도 지표로 유지한다.

편집 분석 · 2026-10-10 검토

적용 한계: 내부 연구 관찰과 제품 변경 공지를 연결한 편집 분석이다. 일반 조직의 생산성 향상 크기를 입증하지 않으며 누락·불확실 결과도 따로 기록해야 한다.

근거 기록: [2026-09-06 · 연구 에이전트의 최종 성공 옆에 사람 개입량이 드러났다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/evaluation#evaluation-research) · [2026-09-11 · Agents 창 사용량이 별도 집계에 추가됐다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/evaluation#evaluation-usage) · [2026-09-11 · 재검토에서 해결된 댓글을 자동 정리한다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/evaluation#evaluation-review)

## 관측 기록

기존 수록 기사 재정리 · 2026-10-09, 2026-10-10 검토. 아래 날짜는 기사 수록일이다.

<a id="copilot-client-usage-metrics-20261023"></a>

### 2026-10-24 · 참고

**GitHub는 IDE 밖에서 Copilot을 모델 제공자로 쓰는 도구(예: OpenCode)의 사용량을 더 보이게 하는 totals_by_client를 추가했다. enterprise·organization 및 사용자 단위의 1일·28일 보고서에 client별 요청·세션·토큰 지표를 제공한다고 설명했다.**

IDE telemetry에서 빠질 수 있던 모델 트래픽을 서버 측 집계로 보완해 어느 도구가 Copilot 사용량을 만드는지 살필 수 있다는 회사 설명이다. 이는 adoption 계측의 범위를 넓히며, task 성공과 사용량을 따로 측정해야 한다는 evaluation 주제에 맥락을 더한다.

- 한계: request_count는 prompt 수가 아니라 성공한 모델 호출 수이며 한 prompt가 여러 호출을 일으킬 수 있다. client는 요청이 보낸 integration ID에 근거한 best-effort grouping이지 검증된 신원이 아니다. totals_by_client는 Copilot 모델 트래픽이지 GitHub agent app의 job 수나 결과 품질이 아니다.
- 다음 확인: 실제 운영에서 보고서의 client 분류와 포착 범위를 점검하고, 동일 기간의 성공 과제·사람 검토 시간·품질 결함과 함께 비교한다. model call, prompt, agent job을 서로 다른 분모로 유지한다.
- [GitHub Copilot 사용량 API, OpenCode 등 도구별 요청·토큰 집계 추가](https://skyan0213.github.io/tech-knowledge-garden/news/4e3efbae3e238940) · [GitHub 원문](https://github.blog/changelog/2026-10-23-usage-metrics-api-adds-usage-from-tools-like-opencode) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-27_0800_tech_ai_briefing)
- 2026-10-27 원문 검토

<a id="copilot-custom-metrics-granularity-20261022"></a>

### 2026-10-22 · 참고

**GitHub는 Copilot 사용량 API에서 조직이 설정한 skill, custom agent, MCP server, slash command, plugin 이름을 기존 other/custom 묶음 대신 보고하도록 바꿨다. 각 totals_by_* 목록은 레코드당 최대 25개로 늘고 나머지는 other로 묶인다.**

AI 기능별 사용·도입을 더 세분해 살필 수 있는 계측 변화다. 사용량 항목이 정교해져도 출력 정확성, 과제 완료율, 사람의 검토 부담이 측정되는 것은 아니므로 evaluation 주제의 사용량과 성과 분리 원칙을 보강한다.

- 한계: GitHub는 지표가 client telemetry에 의존해 오래된 client나 차단된 telemetry에서 활동을 덜 셀 수 있다고 밝혔다. 보고 이름은 최대 128자로 제한되고 경로처럼 보이는 값은 other/custom으로 묶이며, 이전 report day에는 새 이름이 나타나지 않을 수 있다. 이는 adoption 추세용 지표이지 정확한 회계나 결과 품질 측정이 아니다.
- 다음 확인: 새 기능 적용 뒤 처리된 보고일을 확인하고, totals_by_*의 분류·누락 범위를 점검한다. 같은 기간의 실제 완료 과제, 검토 시간, 재발 결함과 대조해 사용량 변화와 결과를 따로 평가한다.
- [GitHub Copilot 사용 지표, 조직이 설정한 사용자 지정 항목 이름 표시](https://skyan0213.github.io/tech-knowledge-garden/news/1c9138dc3652d49c) · [GitHub 원문](https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-27_0800_tech_ai_briefing)
- 2026-10-27 원문 검토

<a id="github-copilot-industry-comparison-20261022"></a>

### 2026-10-22 · 관측

**GitHub가 Copilot impact dashboard에 자발적 참여 동료집단의 agent-first·multi-agent 사용자 비율과 agentic·nonagentic 사용자의 PR 병합률을 비교하는 Industry comparison을 추가했다.**

기존 사용량 집계에 동료 비교 맥락이 추가됐다는 관찰이다. 활동·도입과 병합률이 무엇을 측정하는지 분리해야 한다는 기존 판단을 보강하며, 병합률 비교를 결함 감소나 Copilot의 인과적 생산성 효과로 바꾸지 않는다.

- 한계: 기본 비활성인 opt-in 기능이며 충분한 참여 뒤 28일 중앙값, 집단이 커질 때 상위 10% 비교가 표시된다. 희소 집단은 같은 규모의 전체 산업으로 넓어지거나 순위가 없을 수 있고, nonagentic 기준이 없으면 leverage 순위가 없다. owner·usage metrics 정책 등 참여 조건이 있으며 DR 고객은 같은 지역끼리만 비교한다. 이 비교는 대시보드 전용으로 API·NDJSON·다운로드에 없다.
- 다음 확인: 충분한 동료 수와 실제 표시 집단·결측 사유를 확인하고, 동일 업무의 결함률·사람 검토 시간·완료 품질과 별도로 나란히 비교한다.
- [GitHub Copilot 영향 대시보드에 업계 비교 기능 추가](https://skyan0213.github.io/tech-knowledge-garden/news/910aa2f8992b1ea1) · [GitHub 원문](https://github.blog/changelog/2026-10-22-industry-comparisons-in-the-copilot-impact-dashboard) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="robot-echo-domain-adaptation-20261021"></a>

### 2026-10-21 · 참고

**로봇 심초음파 도메인 적응 논문은 건강인 15명의 대상자 단위 LOSO 평가에서 Normal-only DANN이 직접 전이보다 정상 사례 위양성률을34.3%에서10.7%로 낮췄다고 보고했다.**

기존 evaluation의 고정 시험 결과를 실제 운영 성과로 넓히지 않는 판단에, 평가 대상 집단과 허용 지표를 함께 고정해야 하는 연구 맥락을 더한다. 사용량 증가나 자율 완료 개선의 증거가 아니며 기존 평가 주제의 적용 대상을 의료 성능 전체로 확장하지 않는다.

- 한계: 로봇 집단은 건강인뿐이므로 특이도·위양성률만 평가했고 로봇 민감도는 미평가다. 150개는 뷰별 클립이며150명이 아니다. 병원 모델 특이도90.6%와 건강 로봇 대상자 평균65.7%는 집계 범위가 다르고,94.8%는 진단 정확도가 아니라 특이도 격차 회복률이다. 적응 후 병원 도메인 성능이 소폭 낮아졌고 임상 사용 전 병리 로봇 사례 검증이 필요하다.
- 다음 확인: 벽운동 이상이 있는 로봇 촬영 사례의 민감도·특이도, 독립 대상자·획득 조건에서의 재현, 병원 도메인 성능 저하와 검사 내 군집성을 함께 확인한다.
- [로봇 심초음파 AI, 건강인 영상에서 위양성률 낮춘 도메인 적응 연구](https://skyan0213.github.io/tech-knowledge-garden/news/9f4b8f91f73d0d47) · [frontiersin.org 원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1900388/full) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="pmo-ddpg-evaluation-20261020"></a>

### 2026-10-20 · 참고

**PMO-DDPG 논문은 자동차 점용접 환경의 통제된 방법 비교와 물리 시험100회를 보고했으며, 방법별 독립 학습5회와 단일 로봇·셀의 평가 범위를 명시했다.**

기존 Intrinsic의 고정 작업셀 시험처럼 연구 안의 개선 수치와 공장 장기 운용·일반화 성과를 분리해 읽는 맥락을 추가한다. 활동량·실험 성공·운영 성공을 하나의 품질 값으로 합치지 않는 기존 평가 판단에 관련된다.

- 한계: 비교는 동일 연구의 통제된 조건이며5회 학습 실행의 평균±표본표준편차다. 공식 가설 검정과 여러 현장의 독립 재현은 없고, 동적 사람 움직임·다중 로봇 간섭·장기 전극 열화는 평가하지 않았다. 평균 추론21.5ms는100Hz의 하드10ms 마감시간 충족 증거가 아니다.100회 물리 시험을100개 현장이나 장기 생산 품질 검증으로 바꾸지 않는다.
- 다음 확인: 정식 통계 검정·여러 현장의 반복 평가, 동적 장애물·장기 열화·실제 용접 품질과 최악 지연의 후속 자료를 확인한다.
- [PMO-DDPG, 자동차 점용접 궤적 계획에서 SAC 대비 지표 개선 보고](https://skyan0213.github.io/tech-knowledge-garden/news/505559b9505a3cb0) · [frontiersin.org 원문](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1939068/full) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="20260930-anthropic-evaluation"></a>

### 2026-09-23 · 참고

**Anthropic이 DNA 후보 탐색에 Claude 에이전트를 적용한 연구팀을 공개하고 ART 후보의 사전공개 결과를 발표했다.**

생물학 후보 탐색과 실험 검증을 하나의 연구 흐름에 연결한 사례지만 토큰 사용량이나 후보 발견만으로 연구 성과를 계량할 수는 없다.

- 한계: 회사가 공개한 초기 연구이며 ART의 주요 기능을 확인하는 연구는 진행 중이다. 사전공개 단계이며 이번 회사 발표에는 독립 재현 자료가 제시되지 않았다.
- 다음 확인: 사전공개 전문의 실험 결과, 독립 연구진 재현, ART 기능 규명과 후속 검증을 확인한다.
- [Anthropic, Claude 생명과학 연구실 공개…새 역전사효소 계열 보고](https://skyan0213.github.io/tech-knowledge-garden/news/ef1b3a4772eab837) · [Anthropic 원문](https://www.anthropic.com/news/claude-discovers-novel-enzyme-system) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-30_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="20260923-intrinsic-evaluation"></a>

### 2026-09-22 · 참고

**Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%**

전자 조립의 유연 케이블 자동화 검증

- 한계: 주최 측은 시뮬레이션이 커넥터의 걸림이나 휘어지는 케이블을 충분히 재현하지 못했다고 설명했다. 대회 작업셀의 성공률은 여러 공장의 장기 가동률이나 양산 불량률을 입증하는 수치가 아니다.
- 다음 확인: 작업 변형·장기 운전에서의 성공률과 접촉 피드백.
- [Intrinsic 로봇 경진대회, 실제 케이블 삽입 시험에서 두 팀 성공률 100%](https://skyan0213.github.io/tech-knowledge-garden/news/c2d62bc474a75d21) · [intrinsic.ai 원문](https://www.intrinsic.ai/blog/posts/ai-for-industry-challenge) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-23_0800_tech_ai_briefing)
- 2026-10-11 원문 검토

<a id="cure-server-call-reduction-20260921"></a>

### 2026-09-21 · 참고

**KAIST는 CURE 개발 발표에서 스마트폰 소형 AI가 서버 대형 AI의 지식을 기기에 저장해 유사 문제에 재사용하고, 높은 정확도를 유지하면서 서버 호출을 평균 55.61% 줄였다고 보고했다.**

한 연구 시스템에서 호출량 감소와 정확도 유지 주장을 함께 제시한 사례다. AI 사용량이나 서버 호출 감소를 결과 품질과 같은 지표로 취급하지 않고, 사용량 변화와 품질 주장을 별도로 확인해야 한다는 기존 evaluation 판단에 연구 사례를 더한다.

- 한계: 대학 발표에 귀속된 결과이며, 이 기사에서 독립 재현이나 실제 모바일 사용자 전체의 효과를 확인하지 않았다. 55.61%는 평균 서버 호출 감소로, 지연 시간·비용 절감률이나 전반적 정확도 수치로 바꾸어 읽지 않는다.
- 다음 확인: 논문의 평가 데이터·반복 문제 구성·정확도 기준과 서버 호출 집계 방법을 확인하고, 독립 조건에서 호출 감소와 품질 유지가 함께 재현되는지 살핀다.
- [KAIST 연구팀, 스마트폰 AI에 서버 지식을 재사용하는 CURE 개발](https://skyan0213.github.io/tech-knowledge-garden/news/d87d7041a1aa0451) · [news.kaist.ac.kr 원문](https://news.kaist.ac.kr/researchnews/html/news/?mode=V&mng_no=67310&GotoPage=1) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-27_0800_tech_ai_briefing)
- 2026-10-27 원문 검토

<a id="20260922-openai-evaluation"></a>

### 2026-09-21 · 참고

**OpenAI, AI 능력·감독·사고 보고의 국제 공통 기준 제안**

빠르게 발전하는 AI를 비교하고 감독하기 위한 회사 제안

- 한계: OpenAI는 이 체계를 모든 모델의 출시 전 허가 절차로 제시하지 않았다. 다음 확인은 다른 기관의 공식 참여, 실제 평가 항목과 보고 기준, 정부의 채택 여부다.
- 다음 확인: 타 기관의 참여와 실제 기준·채택 여부.
- [OpenAI, AI 능력·감독·사고 보고의 국제 공통 기준 제안](https://skyan0213.github.io/tech-knowledge-garden/news/10538c022345675d) · [OpenAI 원문](https://openai.com/index/building-standards-next-phase-ai/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-22_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="20260922-gates-evaluation"></a>

### 2026-09-21 · 참고

**60개 기관, 5년 내 저자원 언어 AI 접근성 확대 공동 목표**

AI 학습 자료와 도구가 부족한 언어의 접근성 개선

- 한계: 약 34억명 대상의 접근성 확대는 5년 공동 목표다. 공개 언어 데이터, 평가·벤치마크, 모델·도구와 개인정보·동의·데이터 주권을 고려한 제공은 협력 계획이며 언어별 성능 개선이나 서비스 제공 완료를 입증하지 않는다.
- 다음 확인: 언어별 벤치마크와 실제 제공 도구, 운영체계.
- [60개 기관, 5년 내 저자원 언어 AI 접근성 확대 공동 목표](https://skyan0213.github.io/tech-knowledge-garden/news/8980fabc70784290) · [gatesfoundation.org 원문](https://www.gatesfoundation.org/ideas/media-center/press-releases/2026/09/ai-language-partnership) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-22_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="evaluation-usage"></a>

### 2026-09-11 · 관측

**Agents 창 사용량이 별도 집계에 추가됐다.**

도입 범위와 활동량을 볼 수 있지만 업무 정확성을 뜻하지는 않는다.

- 한계: 필드 생략·null은 0이 아니며 편집기 Agent Mode와도 다른 집계다.
- 다음 확인: 측정 권한·누락률을 확인한 뒤 동일 업무의 성공률과 나란히 비교.
- [VS Code Agents 전용 창의 사용량을 별도로 집계](https://skyan0213.github.io/tech-knowledge-garden/news/28ba300194033bae) · [GitHub 원문](https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-10 검토

<a id="evaluation-review"></a>

### 2026-09-11 · 관측

**재검토에서 해결된 댓글을 자동 정리한다.**

리뷰 활동과 실제 코드 수정·테스트 결과를 나란히 남길 필요가 있다.

- 한계: 댓글 종료가 결함 제거를 보증하지 않으며 회사 실험은 독립 평가가 아니다.
- 다음 확인: 자동 종료된 지적의 실제 수정 여부와 결함 재발률.
- [Copilot, 수정된 코드 리뷰 댓글을 재검토 때 자동 정리](https://skyan0213.github.io/tech-knowledge-garden/news/f5b7434d849eacf1) · [GitHub 원문](https://github.blog/changelog/2026-09-11-auto-resolution-and-analysis-updates-in-copilot-code-review/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-10 검토

<a id="evaluation-research"></a>

### 2026-09-06 · 관측

**연구 에이전트의 최종 성공 옆에 사람 개입량이 드러났다.**

도움을 받아 끝낸 과제와 자율 완료를 분리해야 자동화의 범위를 판단할 수 있다.

- 한계: 내부 관찰이며 불확실한 결과를 제외했고 자원 확대의 영향도 분리되지 않았다.
- 다음 확인: 개입 시간과 불확실 결과 비율, 다른 조직의 재현.
- [연구를 돕는 AI, 성공률 옆에 사람 개입률을 놓다](https://skyan0213.github.io/tech-knowledge-garden/news/3784d7aba9718af9) · [OpenAI 원문](https://openai.com/index/research-acceleration-view-inside-openai/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-07_0801_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-10 검토

<a id="evaluation-layers"></a>

### 2026-08-29 · 참고

**검사마다 입증 범위와 산출물을 나누는 검증 틀이 제안됐다.**

빌드 통과, 업무 정확성, 운영 동등성을 별도 증거로 다루는 참고 틀이다.

- 한계: 현장 전문가의 의견 프레임워크이며 효과를 입증한 독립 실험은 아니다.
- 다음 확인: 층별 결함 발견률과 검증 구축·유지 비용.
- [Microsoft 개발 블로그, AI 역공학 문서와 생성 코드의 검증 단계 제안](https://skyan0213.github.io/tech-knowledge-garden/news/fd584d5c829c999d) · [Microsoft 원문](https://devblogs.microsoft.com/all-things-azure/only-believe-what-you-can-validate/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/08/2026-08-30_0801_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-09 검토

## 관련 개념

- [Agent Evaluation](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/agent-evaluation)
