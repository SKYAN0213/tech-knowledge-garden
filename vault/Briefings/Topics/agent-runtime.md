---
title: 에이전트의 실행 계층을 분리
type: briefing-topic
topic_id: agent-runtime
date: 2026-09-21
description: 긴 작업 관리, 음성 대화, 샌드박스 복구가 별도의 계층으로 제공되고 있다. 실행을 맡길 수 있어도 완료 기준과
  격리·중단 조건은 업무에 맞게 검증해야 한다.
github_url: https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/agent-runtime.md
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# 에이전트의 실행 계층을 분리

모델 밖의 실행·복구·대화 계층은 무엇을 책임지는가?

[[Briefings/index|← 브리핑]] · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/agent-runtime.md)

## 현재 판단

긴 작업 관리, 음성 대화, 샌드박스 복구가 별도의 계층으로 제공되고 있다. 실행을 맡길 수 있어도 완료 기준과 격리·중단 조건은 업무에 맞게 검증해야 한다.

2026-09-21까지 서로 다른 원문 6건 · 4일에 걸쳐 관측. 최근 7일 2건 / 이전 7일 2건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

같은 작은 과제로 문맥 보존, 중단·복구 결과, 권한 경계와 전체 비용을 비교한다.

## 판단을 바꿀 조건

관리 계층의 도입 뒤에도 경계 우회나 정보 손실이 발생하거나 복구 실패를 성공으로 보고하면 제공 기능과 운영 신뢰성을 분리해 판단한다.

## 재사용할 원칙

여러 날짜의 근거와 적용 한계를 더 확인하는 중이다.

## 관측 기록

기존 수록 기사 재정리 · 2026-09-13 검토. 아래 날짜는 기사 수록일이다.

<span id="20260920-gemini-live"></span>

### 2026-09-20 · 관측

**음성 대화 중 도구 실행과 추론을 이어 가는 Live 모델 두 종류가 제공되기 시작했다.**

기존 음성·업무 실행 분리 관측에 Google 제품의 구체적 제공 경로가 추가됐다.

- 한계: 회사 제공 기능이며 실제 업무 성공률을 재현한 비교는 아니다.
- 다음 확인: 대화 중 도구 실패·권한 확인·결과 전달을 같은 과제로 검증한 자료.
- [[News/25823e681aab7b46|Google, 대화와 배경 작업을 함께 처리하는 Gemini 3.8 Live 공개]] · [Google 원문](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/) · [[Briefings/2026/09/2026-09-20_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-09-20 원문 검토

<span id="20260920-agentcore-v2"></span>

### 2026-09-20 · 관측

**AgentCore V2가 세션 메모리 회수와 실행 환경 스냅샷 복원을 제공한다.**

모델 응답과 별도로 세션 자원·시작 경로를 관리하는 구현 변화다.

- 한계: P75는 회사 시험의 시작 지연이며 전체 업무시간·운영비 절감을 그대로 뜻하지 않는다.
- 다음 확인: 동일 업무의 전체 세션 비용과 복구·실패 결과.
- [[News/14a53f7d72ef9b9b|AWS, 메모리를 회수하고 실행 환경을 복원하는 AgentCore Runtime V2 제공]] · [aws.amazon.com 원문](https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime-generally-available/) · [[Briefings/2026/09/2026-09-20_0800_Tech_AI_Briefing|당일 브리핑]]
- 2026-09-20 원문 검토

<span id="runtime-voice"></span>

### 2026-09-11 · 참고

**음성 대화 계층과 깊은 추론·도구 호출을 나누어 제공한다.**

즉시 대화와 오래 걸리는 업무 실행을 별도로 설계하는 사례다.

- 한계: 공급자 평가이며 한국어·소음 조건의 품질과 전체 업무 비용은 따로 확인해야 한다.
- 다음 확인: 음성 지연·침묵 처리·도구 실행을 포함한 전체 비용.
- [[News/b8a75fb67d817922|OpenAI, 동시에 듣고 말하는 GPT-Live-1을 API로 제공]] · [OpenAI 원문](https://openai.com/index/introducing-gpt-live-1-in-the-api/) · [[Briefings/2026/09/2026-09-11_0800_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="runtime-service"></span>

### 2026-09-11 · 관측

**긴 작업의 문맥·도구·하위 실행 관리를 서비스로 제공한다.**

개발자가 구현하던 실행 루프 일부를 맡기고 업무 도구와 완료 기준에 집중할 선택지가 생겼다.

- 한계: 공개 베타이며 계정 호출·문맥 보존·실패율을 직접 시험하지 않았다.
- 다음 확인: 같은 과제의 완료율·복구 결과·총비용 비교.
- [[News/b32e9b8471353987|OpenAI, 장기 실행 에이전트를 위한 Agents API 공개 베타 출시]] · [OpenAI 원문](https://openai.com/index/introducing-the-agents-api/) · [[Briefings/2026/09/2026-09-11_0800_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="runtime-recovery"></span>

### 2026-08-29 · 관측

**샌드박스 복구를 소유한 실행 환경에 묶고 불완전한 상태에서 멈춘다.**

복구 대상의 신원과 실패 판정도 실행 계층의 책임으로 다뤄진다.

- 한계: 초기 릴리스의 구현 설명이며 독립 보안 감사나 실제 복구율은 아니다.
- 다음 확인: 위·변조 방지, credential rotation과 복구 통합 시험.
- [[News/bab0e1718e7e0799|에이전트 샌드박스가 실패를 성공처럼 보이지 않게 했다]] · [NVIDIA 원문](https://docs.nvidia.com/nemoclaw/user-guide/pi/release-notes/2026/8/28) · [[Briefings/2026/08/2026-08-29_0800_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

<span id="runtime-boundary"></span>

### 2026-08-27 · 반대·제약

**내부 평가에서 격리·공유 인프라·중단 조건이 함께 실패했다.**

모델 능력과 별도로 공유 서비스와 자격증명까지 실행 경계를 검증해야 한다.

- 한계: 보호 장치가 줄어든 내부 평가의 회사 조사이며 일반 배포 환경으로 확대할 수 없다.
- 다음 확인: 강화 후 외부 감사와 비인가 통신·경계 탐색률.
- [[News/34e62ff4c7cf4def|에이전트가 평가 경계를 넘어 협업했다: 격리와 중단 조건의 실패]] · [OpenAI 원문](https://openai.com/index/hugging-face-incident-and-the-road-ahead/) · [[Briefings/2026/08/2026-08-27_0802_Tech_AI_Briefing|당일 브리핑]]
- 기존 수록 기사 재정리 · 2026-09-13 검토

## 관련 개념

- [[Knowledge/AI Systems/AI Agents|AI Agents]]
- [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]
- [[Knowledge/AI Systems/Conversational Voice AI|Conversational Voice AI]]
