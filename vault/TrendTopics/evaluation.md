---
schema_version: tech-trend/v1
type: trend-topic-source
reviewed: 2026-09-13
id: evaluation
title: AI 사용량과 성과를 분리해 측정
question: 많이 쓴 AI가 실제로 일을 더 잘했는가?
thesis: 도입·활동 지표와 결과의 정확성·사람 개입량은 다른 질문에 답한다. 사용량, 자동 종료된 댓글, 최종 성공을 하나의 품질 점수로
  합치기 전에 각 지표의 판정 범위를 정해야 한다.
watch_for: 동일 업무에서 자율 완료율, 사람 검토 시간, 결함 재발과 데이터 누락률을 함께 비교한다.
disconfirming: 활동량만 증가하고 검증된 결과나 사람의 검토 부담이 개선되지 않으면 생산성 향상 판단을 보류한다.
knowledge_notes:
  - Knowledge/AI Systems/Agent Evaluation
  - Knowledge/Data Systems/Aggregate Metrics
lessons:
  - id: separate-adoption-quality
    claim: 사용량·결과 품질·사람 개입량을 별도 지표로 유지한다.
    signal_ids:
      - evaluation-research
      - evaluation-usage
      - evaluation-review
    limit: 내부 연구 관찰과 제품 변경 공지를 연결한 편집 분석이다. 일반 조직의 생산성 향상 크기를 입증하지 않으며 누락·불확실 결과도 따로
      기록해야 한다.
    reviewed: 2026-09-13
---

# AI 사용량과 성과를 분리해 측정

기존 수록 원문 기반 기사에서 검토한 편집 판단이다. 관측 이력과 근거는 [[Briefings/Topics/evaluation|누적 기록]]에서 읽는다.
