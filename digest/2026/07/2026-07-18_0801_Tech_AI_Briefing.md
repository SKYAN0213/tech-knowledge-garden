# 2026-07-18 아침 브리핑

2026-07-18 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-18_0801_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [OpenAI, AI 비용 평가에 성공 업무당 총비용 제안](https://skyan0213.github.io/tech-knowledge-garden/news/c5c5248230951857)

발표 2026-07-17

OpenAI는 7월 17일 AI가 끝낸 유용한 업무와 비용을 함께 평가하는 Useful Intelligence per Dollar를 제안했다. Sarah Friar가 쓴 기고문은 토큰 단가에 더해 사람의 검토·재시도·재작업 비용과 결과 품질을 함께 살피는 기준을 설명한다.

### [GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공](https://skyan0213.github.io/tech-knowledge-garden/news/a7ef730e554338df)

발표 2026-07-18

GitHub는 한국시간 7월 18일 Copilot 사용량 지표 REST API에 기업·조직의 저장소별 하루 활동 보고서를 추가했다. 보고서는 Copilot coding agent의 PR 생성·병합과 Copilot code review의 검토·제안 활동을 집계한다.

## 분야별 브리핑

### AI · 1건

#### [OpenAI, AI 비용 평가에 성공 업무당 총비용 제안](https://skyan0213.github.io/tech-knowledge-garden/news/c5c5248230951857)

발표 2026-07-17

연구·기술 · 새로운 방법 · OpenAI

OpenAI는 7월 17일 AI가 끝낸 유용한 업무와 비용을 함께 평가하는 Useful Intelligence per Dollar를 제안했다. Sarah Friar가 쓴 기고문은 토큰 단가에 더해 사람의 검토·재시도·재작업 비용과 결과 품질을 함께 살피는 기준을 설명한다.

##### 전체 비용을 성공한 업무 수로 나눈다

계산은 업무를 수행하는 데 들어간 전체 비용을 합산하고, 요구한 품질 기준을 충족한 업무 수로 나누는 방식이다. 직원의 시간, 사람의 검토, 재시도와 재작업 비용도 기업의 총비용에 포함한다.

기고문은 먼저 한 가지 업무에서 완료의 기준을 정하고 실제 업무 시스템에서 결과를 측정하도록 제안한다. 고객 문의 해결, 테스트를 통과한 코드 변경, 정확하고 기한 내에 끝낸 계약 검토가 예시다.

##### 바로 사용·수정·사람 이관을 구분한다

신뢰성은 세 가지 결과로 살핀다. 그대로 품질 기준을 충족하면 바로 사용, 재시도나 사람의 수정이 필요하면 수정 필요, 사람이 이어받아 끝내야 하면 사람 이관으로 분류한다.

AI가 초안 작성에서 실제 작업 수행으로 넘어가기 전에는 접근할 데이터, 사용하거나 변경할 시스템, 사람이 검토·승인할 시점을 정하도록 설명한다.

##### 같은 업무의 비용과 품질을 시간에 따라 비교한다

사용 규모가 커질 때도 같은 업무를 기준으로 품질을 통과한 업무 수, 전체 비용, 성공 업무당 비용을 함께 추적하는 방식이다. 기고문은 유용한 업무, 결과를 얻는 비용, 안심하고 사용할 수 있는 정도, 사용 확대에 따른 가치를 네 가지 평가 축으로 구분한다.

[OpenAI 원문](https://openai.com/index/a-scorecard-for-the-ai-age/)

### 소프트웨어·클라우드 · 1건

#### [GitHub Copilot, 저장소별 PR 생성·병합·리뷰 지표 제공](https://skyan0213.github.io/tech-knowledge-garden/news/a7ef730e554338df)

발표 2026-07-18

제품·서비스 · 기능 추가 · GitHub

GitHub는 한국시간 7월 18일 Copilot 사용량 지표 REST API에 기업·조직의 저장소별 하루 활동 보고서를 추가했다. 보고서는 Copilot coding agent의 PR 생성·병합과 Copilot code review의 검토·제안 활동을 집계한다.

##### 조직·사용자 집계에서 저장소별 보고서로

기존 지표는 조직과 사용자 단위까지만 제공됐다. 새 보고서는 특정 날짜에 어느 저장소에서 Copilot 활동이 발생했는지 보여준다.

coding agent가 만든 PR과 병합된 PR, code review가 검토한 PR을 담고, 리뷰 제안 수는 댓글 유형별로 나눠 제공한다.

##### 기업·조직별 API와 접근 조건

기업용 경로는 GET /enterprises/{enterprise}/copilot/metrics/reports/repos-1-day?day=YYYY-MM-DD, 조직용 경로는 GET /orgs/{org}/copilot/metrics/reports/repos-1-day?day=YYYY-MM-DD다. day에 지정한 하루의 저장소별 보고서를 반환한다.

기업 소유자·청구 관리자, 조직 소유자, View Copilot Metrics 권한이 있는 기업·조직의 사용자 지정 역할이 조회할 수 있다. Copilot usage metrics 정책도 활성화돼 있어야 한다.

[GitHub 원문](https://github.blog/changelog/2026-07-17-repository-level-github-copilot-usage-metrics-generally-available/)
