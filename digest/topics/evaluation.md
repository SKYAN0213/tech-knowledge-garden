# AI 사용량과 성과를 분리해 측정

많이 쓴 AI가 실제로 일을 더 잘했는가?

[← 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/evaluation.md)

## 현재 판단

도입·활동 지표와 결과의 정확성·사람 개입량은 다른 질문에 답한다. 사용량, 자동 종료된 댓글, 최종 성공을 하나의 품질 점수로 합치기 전에 각 지표의 판정 범위를 정해야 한다.

2026-09-21까지 서로 다른 원문 4건 · 3일에 걸쳐 관측. 최근 7일 0건 / 이전 7일 2건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

동일 업무에서 자율 완료율, 사람 검토 시간, 결함 재발과 데이터 누락률을 함께 비교한다.

## 판단을 바꿀 조건

활동량만 증가하고 검증된 결과나 사람의 검토 부담이 개선되지 않으면 생산성 향상 판단을 보류한다.

## 재사용할 원칙

### 사용량·결과 품질·사람 개입량을 별도 지표로 유지한다.

편집 분석 · 2026-09-13 검토

적용 한계: 내부 연구 관찰과 제품 변경 공지를 연결한 편집 분석이다. 일반 조직의 생산성 향상 크기를 입증하지 않으며 누락·불확실 결과도 따로 기록해야 한다.

근거 기록: [2026-09-07 · 연구 에이전트의 최종 성공 옆에 사람 개입량이 드러났다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/evaluation#evaluation-research) · [2026-09-13 · Agents 창 사용량이 별도 집계에 추가됐다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/evaluation#evaluation-usage) · [2026-09-13 · 재검토에서 해결된 댓글을 자동 정리한다.](https://skyan0213.github.io/tech-knowledge-garden/briefings/topics/evaluation#evaluation-review)

## 관측 기록

기존 수록 기사 재정리 · 2026-09-13 검토. 아래 날짜는 기사 수록일이다.

<a id="evaluation-usage"></a>

### 2026-09-13 · 관측

**Agents 창 사용량이 별도 집계에 추가됐다.**

도입 범위와 활동량을 볼 수 있지만 업무 정확성을 뜻하지는 않는다.

- 한계: 필드 생략·null은 0이 아니며 편집기 Agent Mode와도 다른 집계다.
- 다음 확인: 측정 권한·누락률을 확인한 뒤 동일 업무의 성공률과 나란히 비교.
- [VS Code Agents 전용 창의 사용량을 별도로 집계](https://skyan0213.github.io/tech-knowledge-garden/news/28ba300194033bae) · [GitHub 원문](https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="evaluation-review"></a>

### 2026-09-13 · 관측

**재검토에서 해결된 댓글을 자동 정리한다.**

리뷰 활동과 실제 코드 수정·테스트 결과를 나란히 남길 필요가 있다.

- 한계: 댓글 종료가 결함 제거를 보증하지 않으며 회사 실험은 독립 평가가 아니다.
- 다음 확인: 자동 종료된 지적의 실제 수정 여부와 결함 재발률.
- [Copilot, 수정된 코드 리뷰 댓글을 재검토 때 자동 정리](https://skyan0213.github.io/tech-knowledge-garden/news/f5b7434d849eacf1) · [GitHub 원문](https://github.blog/changelog/2026-09-11-auto-resolution-and-analysis-updates-in-copilot-code-review/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-13_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="evaluation-research"></a>

### 2026-09-07 · 관측

**연구 에이전트의 최종 성공 옆에 사람 개입량이 드러났다.**

도움을 받아 끝낸 과제와 자율 완료를 분리해야 자동화의 범위를 판단할 수 있다.

- 한계: 내부 관찰이며 불확실한 결과를 제외했고 자원 확대의 영향도 분리되지 않았다.
- 다음 확인: 개입 시간과 불확실 결과 비율, 다른 조직의 재현.
- [연구를 돕는 AI, 성공률 옆에 사람 개입률을 놓다](https://skyan0213.github.io/tech-knowledge-garden/news/3784d7aba9718af9) · [OpenAI 원문](https://openai.com/index/research-acceleration-view-inside-openai/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-07_0801_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="evaluation-layers"></a>

### 2026-08-30 · 참고

**검사마다 입증 범위와 산출물을 나누는 검증 틀이 제안됐다.**

빌드 통과, 업무 정확성, 운영 동등성을 별도 증거로 다루는 참고 틀이다.

- 한계: 현장 전문가의 의견 프레임워크이며 효과를 입증한 독립 실험은 아니다.
- 다음 확인: 층별 결함 발견률과 검증 구축·유지 비용.
- [에이전트 검증을 ‘통과 가능한 층’으로 나눈다](https://skyan0213.github.io/tech-knowledge-garden/news/fd584d5c829c999d) · [Microsoft 원문](https://devblogs.microsoft.com/all-things-azure/only-believe-what-you-can-validate/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/08/2026-08-30_0801_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

## 관련 개념

- [Agent Evaluation](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/agent-evaluation)
- [Aggregate Metrics](https://skyan0213.github.io/tech-knowledge-garden/knowledge/data-systems/aggregate-metrics)
