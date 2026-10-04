---
title: Double-Blind AI Evaluation
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 평가와 보안
created: 2026-09-27
updated: 2026-09-27
last_reviewed: 2026-09-27
concept_id: double-blind-ai-evaluation
label: 이중 블라인드 AI 평가
aliases:
  - Double Blind Evals
  - 이중 블라인드 AI 평가
keywords:
  - 모델 가중치
  - 비공개 벤치마크
  - 기밀 실행 환경
  - 양자 승인
parent_concepts: []
related_concepts: []
tags:
  - AI
  - Evaluation
  - Security
verified_sources:
  - https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/
  - https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf
relations: []
connections: []
map_review:
  decision: include
  kind: evaluation
  reason: 시험 문제와 모델 가중치의 상호 비공개, 실행 환경 검증과 양자 코드 승인을 구분해 배울 수 있는 평가 방식이다.
  reviewed: 2026-09-27
---

# Double-Blind AI Evaluation

## 한 문장 정의

평가자의 시험 문제와 모델 제공자의 가중치를 서로 공개하지 않은 채, 검증한 기밀 실행 환경에서 모델을 시험하도록 설계한 평가 방식이다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | 이중 블라인드 AI 평가 |
| 영어 | Double-Blind AI Evaluation |
| 원문의 표현 | Double Blind Evals |
| 핵심 요소 | 비공개 시험 문제 · 모델 가중치 · 실행 환경 검증 · 양자 코드 승인 |

## 범위

**포함:** 평가 문제와 모델 가중치의 상호 비공개, 실행 소프트웨어 검증, 양쪽의 코드 승인과 결과 수신자 지정.

**포함하지 않음:** 기밀 실행 하드웨어만 준비하고 코드·실행 정책을 검토하지 않는 구성.

## 왜 중요한가

외부 평가자가 비공개 시험 문제를 모델 제공자에게 보내면 문항이 노출되고, 제공자가 가중치를 평가자에게 보내면 모델 자산이 노출된다. Google DeepMind는 이 두 자료를 각각 소유자에게만 공개하는 평가 절차를 연구했다. [원문](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)

## 핵심 구성 요소

모델 제공자는 가중치와 추론 코드를, 평가자는 시험 문제와 평가 코드를 준비한다. 기밀 실행 환경과 소프트웨어 측정값 검증, 양자 코드 승인이 이를 함께 실행하는 절차를 구성한다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

## 작동 원리

두 참여자는 실행 환경이 서명한 소프트웨어 해시를 확인하고 PySyft를 통해 코드와 비공개 자료를 제출한다. 양쪽이 모두 코드를 승인해야 실행되며 결과를 어느 참여자에게 전달할지도 정한다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

보안 실행 영역은 하드웨어 수준에서 메모리를 암호화한다. 이중 블라인드 평가에는 실행 소프트웨어가 자료를 외부로 보내거나 실행 중 바뀌지 않게 하는 구성도 필요하다. 기술 보고서는 하드웨어 격리만으로 이 전체 절차가 구현되지는 않는다고 설명한다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

## 실제 예시

Google DeepMind의 시범 연구는 Gemini 2.5 Flash Lite와 AILuminate AIRR 1.4의 비공개 예비 문제를 사용했다. 보고서는 이 문제들이 어떤 모델도 처리하지 않은 세트라고 설명한다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

실험은 Intel TDX로 호스트 메모리를 암호화하는 Google Cloud A3 Confidential VM과 NVIDIA H100 80GB Confidential GPU, OpenMined PySyft v0.10.x로 구성했다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

## 한계와 실패 조건

보안 실행 영역은 하드웨어 제조사의 키와 인증서를 신뢰의 출발점으로 사용한다. 보고서는 클라우드 제공자와 하드웨어 제조사가 공모하지 않는다는 조건을 설명한다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

실제 시범 연구에서는 일부 독점 메서드 구현이 남아 모든 코드를 검사하거나 허용 목록으로 검증하지는 않았다. AVERI는 이 조건을 전달받고 실행 구성을 수용했다. Confidential Space의 개별 빌드는 비공개 서명 키를 사용하며, 인증 보고서의 서명·검증에는 Google 서비스가 참여했다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

## 혼동하기 쉬운 개념

보안 실행 영역은 자료를 보호할 하드웨어 기반이다. 이중 블라인드 평가는 그 위에서 무엇을 실행할지 검증하고 양쪽이 코드를 승인하는 평가 절차다. 실행 영역을 사용했다는 사실만으로 두 참여자의 비공개 조건이 모두 성립하는 것은 아니다. [원문](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

## 관련 개념

없음

## 최근 변화

- 2026-08-27 — Google DeepMind는 Singapore AI Safety Institute, OpenMined, AVERI, MLCommons와 이중 블라인드 평가 시범 연구를 발표했다. [[News/7a7d38500197da71|평가 시범 연구 기사]] [원문](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)

## 출처

- [Google DeepMind · Piloting double-blind AI evaluations](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)
- [Double Blind Evals · 기술 보고서](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)
