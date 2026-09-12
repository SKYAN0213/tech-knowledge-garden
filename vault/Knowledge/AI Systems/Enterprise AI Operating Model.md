---
title: Enterprise AI Operating Model
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-07-11
updated: 2026-09-10
aliases:
  - 기업 AI 운영 모델
parent_concepts:
  - "[[Knowledge/AI Systems/AI Governance|AI Governance]]"
related_concepts:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]"
tags:
  - AI
  - EnterpriseAI
  - OperatingModel
---

# Enterprise AI Operating Model

## 한 문장 정의

Enterprise AI Operating Model은 기업이 AI를 개별 도구가 아니라 업무 설계, 역할, 데이터, 보안, 비용, 평가, 고객 경험을 함께 바꾸는 지속 가능한 운영 방식으로 정착시키는 구조입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | 기업 AI 운영 모델 |
| 영어 이름 | Enterprise AI Operating Model |
| 중심 단위 | 모델이나 좌석이 아니라 업무 결과 |
| 상위 개념 | [[Knowledge/AI Systems/AI Governance|AI Governance]], 기업 운영 모델 |

## 범위

**포함:** AI 적용 포트폴리오, 업무 재설계, 역할·역량, 데이터·도구 접근, 플랫폼, 평가, 비용 귀속, 사람 이관, 변화 관리입니다.

**포함하지 않음:** 모델 API 배포만 하는 기술 아키텍처, AI 사용 교육만 하는 프로그램, 조직 전체 거버넌스와 완전히 같은 개념은 아닙니다.

## 왜 중요한가

좌석과 모델을 배포해도 실제 업무가 바뀌지 않으면 작은 편의 개선에 그칩니다. 기업은 어떤 일을 AI와 사람이 나누고, 성공을 어떻게 측정하며, 실패와 비용을 누가 책임지는지 운영 단위로 설계해야 합니다.

## 핵심 구성 요소

- 우선순위가 있는 업무 포트폴리오
- 사람·AI 역할과 책임 재설계
- 데이터·도구·권한 플랫폼
- 공통 평가와 배포 문턱
- 비용센터와 사용량·가치 측정
- 사람 이관, 승인, 사고 대응
- 교육, 채택, 피드백, 변경 관리

## 작동 원리

1. 반복량과 가치, 위험이 큰 업무를 선택합니다.
2. 현재 흐름과 실패 비용을 측정합니다.
3. AI와 사람이 맡을 단계·승인·이관을 다시 설계합니다.
4. 공통 플랫폼과 정책 안에서 작은 운영 실험을 합니다.
5. 성공 업무당 비용, 품질 통과율, 수정·이관 비율을 비교합니다.
6. 기준을 통과한 방식만 확대하고 조직 역할과 교육을 갱신합니다.

## 실제 예시

- 고객 지원에서 답변 생성률이 아니라 해결률·재문의·사람 이관·총비용을 함께 봅니다.
- 코딩 도구의 활성 사용자 수보다 실제 PR 활동, 병합 속도, 회귀와 보안 실패를 연결합니다.
- 연구 조직이 문헌·시뮬레이션·실험 자원을 공통 에이전트 플랫폼에 연결하되 전문가 승인을 유지합니다.

## 한계와 실패 조건

- 사용량을 성과로 착각하면 품질과 책임 비용을 숨깁니다.
- 현업 소유자 없이 중앙 AI 팀만 운영하면 실제 흐름과 맞지 않습니다.
- 사람 검토를 비용으로만 보면 고위험 업무의 안전 장치를 약화시킵니다.
- 작은 시범 성공을 조직 전체로 바로 일반화하면 데이터·역할 차이를 놓칩니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/AI Governance|AI Governance]] | 거버넌스는 책임·위험 규칙 전체이고 운영 모델은 가치가 나는 업무와 역할·플랫폼 배치를 구체화합니다. |
| AI 전략 | 전략은 방향과 선택을 정하고 운영 모델은 반복 실행 구조를 만듭니다. |
| AI 플랫폼 | 플랫폼은 기술 기반이며 운영 모델은 조직·업무·성과·책임까지 포함합니다. |

## 관련 개념

- 상위: [[Knowledge/AI Systems/AI Governance|AI Governance]], 기업 운영 모델
- 하위: AI 포트폴리오 운영, 업무 재설계, AI 비용 귀속
- 함께 쓰임: [[Knowledge/AI Systems/AI Agents|AI Agents]], [[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]], [[Knowledge/AI Systems/Agent Evaluation|Agent Evaluation]]
- 대비: 도구 좌석 배포 중심 접근

## 최근 변화

- 2026-09-09 — OpenAI는 Astra 기업 안내에서 앱·웹사이트와 파일 전송 통제, 기본 비활성화된 Enterprise 접근을 설명했습니다. 모델 도입과 업무 자원 접근 정책을 함께 관리할 필요를 구체화했습니다. [source](https://openai.com/index/gpt-6-astra-next-generation-work/)

- 2026-09-08 — GHES 3.22는 정식 출시됐지만 폐쇄망 Copilot CLI 연동은 기술 미리보기입니다. 기업 AI 운영은 서버 버전과 개별 기능 성숙도, 모델 공급자·데이터 경로를 각각 관리해야 합니다. [source](https://github.blog/changelog/2026-09-08-github-enterprise-server-3-22-is-now-generally-available/)

- 2026-09-04 — GitHub는 Copilot의 Astra 정식 제공과 조직 모델 정책에 따른 기본 활성화를 공지했습니다. 새 모델 도입은 접근·비용·자체 평가를 함께 관리할 운영 변경임을 보여줍니다. 내부 성능 설명은 독립 검증과 구분해야 합니다. [source](https://github.blog/changelog/2026-09-04-gpt-6-astra-is-generally-available-in-github-copilot/)

- 2026-09-02 — Microsoft Fabric의 GCC High 공개 미리보기는 정부용 규제 환경에서 데이터 통합·분석·의미 계층을 에이전트 기반과 연결했습니다. 기업 AI 운영은 모델 배치뿐 아니라 지원되는 workload, 데이터 위치, 공통 용량과 단계별 출시 범위를 함께 관리해야 합니다. [source](https://www.microsoft.com/en-us/microsoft-cloud/blog/us-government/2026/09/02/microsoft-fabric-in-gcc-high-building-the-data-foundation-for-ai/)
- 2026-08-25 — OpenAI는 ChatGPT Work와 Codex용 Admin plugin을 발표해 사용량·권한 조회와 지원되는 관리 변경을 기존 역할·승인 경계 안의 대화형 흐름으로 연결했습니다. 이는 AI 운영 자동화가 단순 질의에서 권한 인식형 실행과 결과 확인으로 넓어지는 신호지만, 내부 지원 티켓 해결 수치는 공급업체 사례입니다. [source](https://openai.com/index/introducing-admin-plugin/)
- 2026 — 기업 AI 성과 측정은 좌석 수와 토큰 단가에서 성공 업무당 총비용, 품질 문턱, 사람 수정·이관 비율로 이동하고 있습니다.

## 출처

- https://openai.com/index/how-ai-is-expanding-what-people-do-at-work/
- https://cdn.openai.com/pdf/work-at-the-frontier-report.pdf
- https://openai.com/index/a-scorecard-for-the-ai-age/
- https://github.blog/changelog/2026-07-22-new-copilot-usage-metrics-impact-dashboard/
- https://openai.com/index/introducing-admin-plugin/
- https://www.microsoft.com/en-us/microsoft-cloud/blog/us-government/2026/09/02/microsoft-fabric-in-gcc-high-building-the-data-foundation-for-ai/
- https://github.blog/changelog/2026-09-04-gpt-6-astra-is-generally-available-in-github-copilot/
- https://github.blog/changelog/2026-09-08-github-enterprise-server-3-22-is-now-generally-available/
- https://openai.com/index/gpt-6-astra-next-generation-work/
