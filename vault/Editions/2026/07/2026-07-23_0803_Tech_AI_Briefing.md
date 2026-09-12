---
{}
---

# 한눈에 보기

- OpenAI가 고객 지원 같은 실제 업무에 음성·채팅 agent를 배치하고, 정책·평가·사람 이관까지 함께 관리하는 기업용 제품 Presence를 공개했습니다.
- GitHub는 Copilot 사용자를 사용 깊이에 따라 나누고, PR 처리량과 병합 속도를 비교하는 영향 대시보드를 출시했습니다.
- OpenAI는 미국 국립연구소 과학자 약 2,000명에게 Codex를 지원하고, 대형 과학 연구에 API 자원을 투입한다고 발표했습니다.
- 논문과 연구: 없음
- 오픈소스와 도구: 없음

# 오늘의 핵심 기사

## 기업용 AI agent, 답변보다 운영 전체를 판다

OpenAI가 7월 22일 기업용 음성·채팅 agent 제품 Presence를 공개했습니다. 단순 챗봇 제작 도구가 아니라 업무별 권한, 회사 정책, 시험, 품질 평가, 사람 이관과 출시 뒤 개선을 한 묶음으로 제공하는 제품입니다.

핵심 사실: 기업은 청구 문의, 보험 접수, 사내 IT 지원처럼 구체적인 업무를 정하고 agent에게 필요한 지식과 시스템 접근만 줍니다. 시뮬레이션과 평가기가 결과·정책 준수·도구 사용·이관 판단을 검사하며, 운영 중 발견된 문제에는 Codex가 변경안을 제안하고 사람이 시험·승인합니다. 현재는 일부 기업 고객을 대상으로 제한적으로 제공되며 셀프서비스 제품은 아닙니다.

왜 중요한가: 기업용 agent 경쟁의 중심이 모델 성능에서 [[Knowledge/AI Systems/Enterprise AI Operating Model|업무 설계와 운영 통제]], [[Knowledge/AI Systems/Agent Evaluation and Observability|평가와 관측]], 승인된 행동과 사람 이관으로 옮겨가고 있습니다. OpenAI가 공개한 자사 영어 전화 지원 수치도 유망하지만 공급사가 측정한 사례이므로 외부 고객의 장기 성과는 따로 확인해야 합니다.

앞으로 볼 점: 가격과 도입 조건, 고객별 데이터 경계, 평가 기준, 장애 때의 책임과 사람이 개입해야 하는 범위가 얼마나 구체적으로 공개되는지가 중요합니다.

더 깊게 보기: [[Knowledge/AI Systems/Enterprise AI Operating Model|Enterprise AI Operating Model]], [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]], [[Knowledge/AI Systems/Conversational Voice AI|Conversational Voice AI]], [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]

## Copilot 효과를 사용자 수가 아닌 일하는 방식으로 본다

GitHub는 7월 22일 기업 관리자와 조직 소유자를 위한 Copilot 영향 대시보드를 출시했습니다. 라이선스를 받은 사람 수만 세지 않고, 사용자가 코드 완성 중심인지 agent·다중 agent까지 쓰는지에 따라 도입 깊이를 나눠 보여줍니다.

핵심 사실: 대시보드는 사용자를 수동, 코드 중심, agent 중심, 다중 agent·Copilot 앱 단계로 분류합니다. 각 집단의 월평균 병합 PR 수, PR 병합 시간 중앙값, 사용자 비중, 하루 평균 코드 줄 수와 최근 6개월 추세를 제공합니다. 분류는 최근 28일 제품 사용을 기준으로 합니다.

왜 중요한가: [[Knowledge/AI Systems/Agent Evaluation and Observability|AI 개발 도구 평가]]가 활성 사용자 수에서 실제 작업 방식과 결과 지표로 한 단계 이동했습니다. 다만 대시보드는 상관관계를 보여줄 뿐 Copilot이 생산성 차이를 직접 만들었다는 인과관계를 증명하지는 않습니다.

앞으로 볼 점: 팀과 저장소의 난이도 차이를 통제한 비교, 코드 품질·재작업·장애 같은 속도 밖의 지표, 장기 추세가 함께 제공되는지 봐야 합니다.

더 깊게 보기: [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]], [[Knowledge/AI Systems/Enterprise AI Operating Model|Enterprise AI Operating Model]]

## 국립연구소 과학자에게 Codex와 API 자원을 공급한다

OpenAI는 7월 22일 미국 에너지부의 Genesis Mission 참여 연구자에게 Codex와 API 사용 자원을 제공하고, AI·시뮬레이션·실험을 연결하는 대형 과학 과제를 지원한다고 발표했습니다.

핵심 사실: 약 2,000명의 국립연구소·대학 연구자에게 400만 달러 규모 Codex 접근을 제공하고, 두 과학 캠페인에 API 지원 300만 달러를 배정합니다. 초기 과제 후보에는 더 실용적인 조건에서 작동하는 고온 초전도체 탐색과, 현재 AI·데이터·계산만으로 풀기 쉬워진 과학 문제를 체계적으로 찾는 작업이 포함됩니다.

왜 중요한가: [[Knowledge/AI Systems/AI for Scientific Discovery|과학 AI]]가 논문 요약을 넘어 슈퍼컴퓨터, 시뮬레이션, 실험 시설과 연결되는 연구 인프라로 확장되는 신호입니다. 다만 이번 발표는 자원 투입과 계획이며 실제 발견이나 생산성 향상을 입증한 결과는 아닙니다.

앞으로 볼 점: 연구별 평가 기준, 재현 가능한 결과, 실험 검증 비율과 공개 산출물이 나오는지 확인해야 합니다.

더 깊게 보기: [[Knowledge/AI Systems/AI for Scientific Discovery|AI for Scientific Discovery]], [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]

# 논문과 연구

없음

# 오픈소스와 도구

없음

# 흐름 읽기

- 확인된 사실: 기업용 agent는 정책·권한·평가·사람 이관을 포함한 운영 제품으로 묶이고, 개발 도구는 사용 깊이와 PR 흐름을 함께 측정하기 시작했습니다.
- 분석: AI 도입 경쟁은 모델을 제공하는 단계에서 실제 업무를 안전하게 배치하고 결과를 측정하는 단계로 이동하고 있습니다.
- 앞으로 볼 점: 공급사가 제시한 사용량·속도 지표가 품질, 재작업, 사고, 사람 개입 비용까지 포함한 독립 검증으로 이어지는지 봐야 합니다.

# 바로 써먹을 점

- 업무 자동화: agent를 만들기 전에 맡길 업무, 허용 행동, 승인 지점, 사람 이관 조건을 한 장으로 먼저 정의하세요.
- AI 활용: 활성 사용자 수만 보지 말고 코드 중심·agent 중심처럼 사용 깊이를 나누되, 결과 품질과 재작업도 함께 측정하세요.
- 연구 개발: AI가 낸 후보는 시뮬레이션과 실제 실험에서 검증됐는지 분리 기록하고, 계산량이나 사용액을 연구 성과로 대신하지 마세요.

# Source List

- https://openai.com/index/introducing-openai-presence/
- https://github.blog/changelog/2026-07-22-new-copilot-usage-metrics-impact-dashboard/
- https://openai.com/index/advancing-the-next-era-of-national-science/

전력제품 설계 AI 신뢰체계 및 시스템 구축 전체전략 (개인 보관함 문서)
