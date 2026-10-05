---
schema_version: tech-signals/v1
type: trend-observations
edition: Editions/2026/07/2026-07-27_0800_Tech_AI_Briefing
date: 2026-07-27
reviewed: 2026-10-05
review_basis: primary-research
observations:
  - id: galaxydit-settings-20260726
    topic_id: performance-path
    event_id: a9911e33a5a858b4
    event_date: 2026-07-26
    stance: context
    change: GalaxyDiT는 CFG 두 경로를 함께 재사용하며, 본문 실험표에 모델·재사용 설정별 속도와 VBench 결과를 보고한다.
    meaning: 속도와 품질을 같은 모델·설정의 결과로 짝지어 보존하는 연구 사례다.
    limit: Wan2.1은 50단계·1330프롬프트, 1.3B는 A100 1대와 81프레임·832×480, 14B는 A100 8대와
      81프레임·1280×720이다.
    next_check: 후속 판본에서 같은 모델·GPU·프레임·해상도·평가 조건으로 비교한 결과가 추가되는지 확인한다.
---

# GalaxyDiT 설정별 실험 결과

[[Editions/2026/07/2026-07-27_0800_Tech_AI_Briefing|2026-07-27 브리핑]]

GalaxyDiT는 CFG 두 경로를 함께 재사용하며, 본문 실험표에 모델·재사용 설정별 속도와 VBench 결과를 보고한다.
