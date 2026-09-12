---
title: Enterprise AI Operating Model
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-07-11
updated: 2026-09-13
aliases:
  - 기업 AI 운영 모델
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI 거버넌스]]"
  - "[[Knowledge/AI Systems/Agent Evaluation|에이전트 평가]]"
  - "[[Knowledge/Data Systems/Aggregate Metrics|집계 지표]]"
tags:
  - AI
  - EnterpriseAI
  - OperatingModel
last_reviewed: 2026-09-13
concept_id: enterprise
label: 기업 AI 운영 모델
group: 평가와 운영
keywords:
  - 업무 설계
  - 책임자
  - 성과 기준
  - 사람 이관
verified_sources:
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://prometheus.io/docs/practices/histograms/
relations:
  - target: governance
    type: uses
    reason: 업무 도입·운영 책임에 AI 위험 관리 체계를 결합한다.
    basis: inference
    evidence:
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
  - target: evaluation
    type: uses
    reason: 도입 범위를 정할 때 실제 업무 결과를 평가한다.
    basis: inference
    evidence:
      - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - target: metrics
    type: uses
    reason: 성과를 볼 때 사용량과 과제 성공 기준을 구분해 집계한다.
    basis: inference
    evidence:
      - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
      - https://prometheus.io/docs/practices/histograms/
---

# Enterprise AI Operating Model

## 한 문장 정의

AI를 업무에 도입하고 유지하기 위해 역할·의사결정·성과 기준·위험 관리 책임을 배분하는 운영 구조다. [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 기업 AI 운영 모델 |
| 영어 | Enterprise AI Operating Model |
| 키워드 | 업무 설계 · 책임자 · 성과 기준 · 사람 이관 |

## 범위

**포함:** 업무 선택, 사람과 AI의 역할, 평가와 운영 피드백.

**포함하지 않음:** 단순한 모델 구매나 사용자 계정 수 확대.

## 왜 중요한가

실험용 AI 기능을 반복 가능한 업무로 옮길 때 책임·성과·운영 피드백이 빠지지 않게 한다.

## 핵심 구성 요소

- 업무 설계
- 책임자
- 성과 기준
- 사람 이관

## 작동 원리

업무 목적과 책임자를 정하고 성공 기준을 만든다. 실제 결과와 위험을 측정해 권한·업무 흐름·운영 정책을 수정한다. [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 실제 예시

자동 처리 성공과 사람 재작업을 함께 측정해 고객 지원 업무 범위를 조정하는 운영 설계.

## 한계와 실패 조건

호출량과 사용량은 업무 성과의 대체 지표가 될 수 없다. 팀마다 다른 과제를 같은 기준 없이 비교하면 왜곡된다.

## 혼동하기 쉬운 개념

AI 거버넌스는 위험·책임 체계이고 운영 모델은 업무·역할·성과 운영까지 포함하는 편집상 묶음이다.

## 관련 개념

- → 활용: [[Knowledge/AI Systems/AI Governance#한 문장 정의|AI 거버넌스]] — 업무 도입·운영 책임에 AI 위험 관리 체계를 결합한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/))
- → 활용: [[Knowledge/AI Systems/Agent Evaluation#한 문장 정의|에이전트 평가]] — 도입 범위를 정할 때 실제 업무 결과를 평가한다. (해석; [근거](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) · [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))
- → 활용: [[Knowledge/Data Systems/Aggregate Metrics#한 문장 정의|집계 지표]] — 성과를 볼 때 사용량과 과제 성공 기준을 구분해 집계한다. (해석; [근거](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [근거](https://prometheus.io/docs/practices/histograms/))

## 최근 변화

- 2026-09-09 — OpenAI는 Astra 기업 안내에서 앱·웹사이트와 파일 전송 통제, 기본 비활성화된 Enterprise 접근을 설명했습니다. 모델 도입과 업무 자원 접근 정책을 함께 관리할 필요를 구체화했습니다. [source](https://openai.com/index/gpt-6-astra-next-generation-work/)

- 2026-09-08 — GHES 3.22는 정식 출시됐지만 폐쇄망 Copilot CLI 연동은 기술 미리보기입니다. 기업 AI 운영은 서버 버전과 개별 기능 성숙도, 모델 공급자·데이터 경로를 각각 관리해야 합니다. [source](https://github.blog/changelog/2026-09-08-github-enterprise-server-3-22-is-now-generally-available/)

- 2026-09-04 — GitHub는 Copilot의 Astra 정식 제공과 조직 모델 정책에 따른 기본 활성화를 공지했습니다. 새 모델 도입은 접근·비용·자체 평가를 함께 관리할 운영 변경임을 보여줍니다. 내부 성능 설명은 독립 검증과 구분해야 합니다. [source](https://github.blog/changelog/2026-09-04-gpt-6-astra-is-generally-available-in-github-copilot/)

- 2026-09-02 — Microsoft Fabric의 GCC High 공개 미리보기는 정부용 규제 환경에서 데이터 통합·분석·의미 계층을 에이전트 기반과 연결했습니다. 기업 AI 운영은 모델 배치뿐 아니라 지원되는 workload, 데이터 위치, 공통 용량과 단계별 출시 범위를 함께 관리해야 합니다. [source](https://www.microsoft.com/en-us/microsoft-cloud/blog/us-government/2026/09/02/microsoft-fabric-in-gcc-high-building-the-data-foundation-for-ai/)
- 2026-08-25 — OpenAI는 ChatGPT Work와 Codex용 Admin plugin을 발표해 사용량·권한 조회와 지원되는 관리 변경을 기존 역할·승인 경계 안의 대화형 흐름으로 연결했습니다. 이는 AI 운영 자동화가 단순 질의에서 권한 인식형 실행과 결과 확인으로 넓어지는 신호지만, 내부 지원 티켓 해결 수치는 공급업체 사례입니다. [source](https://openai.com/index/introducing-admin-plugin/)
- 2026 — 기업 AI 성과 측정은 좌석 수와 토큰 단가에서 성공 업무당 총비용, 품질 문턱, 사람 수정·이관 비율로 이동하고 있습니다.

## 출처

- [NIST · AI RMF Core 1.0](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [Anthropic · Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Prometheus · Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
