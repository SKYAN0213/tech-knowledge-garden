---
schema_version: tech-trend/v1
type: trend-topic-source
reviewed: 2026-10-01
id: agent-runtime
title: 에이전트의 실행 계층을 분리
question: 모델 밖의 실행·복구·대화 계층은 무엇을 책임지는가?
thesis: 긴 작업 관리, 음성 대화, 샌드박스 복구가 별도의 계층으로 제공되고 있다. 실행을 맡길 수 있어도 완료 기준과 격리·중단 조건은
  업무에 맞게 검증해야 한다. 9월22일 Nutanix의 Ryax 인수는 연산 배치 기술 확보이며 통합 제품 제공·운영 개선 실적과 구분한다.
  9월25일 Microsoft가 발표한 Copilot Autopilot도 제한적 프리뷰 계획이며 실제 업무 성공과 권한 통제는 아직 검증
  대상이다.  10월1일 Google Cloud는 에이전트 데이터 작업의 IAM 권한 전파를 정식 키트로 제공했고, DigitalOcean은
  microVM·추론·저장·도구를 구독형 공개 프리뷰로 묶었다. GKE Agent Substrate도 격리 실행 경로를 제공한다고 발표했다.
  기능·가격과 배포 단계가 다르므로 실제 복구·권한·완료 품질은 별도 확인한다.
watch_for: 같은 작은 과제로 문맥 보존, 중단·복구 결과, 권한 경계와 전체 비용을 비교한다.
disconfirming: 관리 계층의 도입 뒤에도 경계 우회나 정보 손실이 발생하거나 복구 실패를 성공으로 보고하면 제공 기능과 운영 신뢰성을 분리해 판단한다.
knowledge_notes:
  - Knowledge/AI Systems/AI Agents
  - Knowledge/AI Systems/AI Agent Security
  - Knowledge/AI Systems/Conversational Voice AI
lessons: []
---

# 에이전트의 실행 계층을 분리

기존 수록 원문 기반 기사에서 검토한 편집 판단이다. 관측 이력과 근거는 [[Briefings/Topics/agent-runtime|누적 기록]]에서 읽는다.

2026-09-20: Gemini의 음성·배경 도구 병행과 AgentCore V2의 세션 메모리·시작 경로를 추가 검토했다. 제공 기능과 전체 업무 성공률을 구분하는 기존 판단을 유지한다.


2026-09-23 검토: 9월22일 Nutanix의 Ryax 인수는 연산 배치 기술 확보이며 통합 제품 제공·운영 개선 실적과 구분한다.

2026-09-30 검토: Copilot에 장시간 작업 위임 기능이 추가됐지만 현재 확인된 것은 제한 배포 계획이다. 실행 경계·복구와 완료 품질에 관한 실제 운영 근거를 기다린다.

2026-10-01 검토: DigitalOcean Agent Droplets는 공개 프리뷰의 구독 묶음이며, Google Data Agent Kit는 정식 제공된 데이터 도구지만 서비스 과금은 별도다. GKE Agent Substrate의 격리·재개 주장은 회사 제시 사양이다. 운영 성공률·권한 경계·총비용 자료를 기다린다.
