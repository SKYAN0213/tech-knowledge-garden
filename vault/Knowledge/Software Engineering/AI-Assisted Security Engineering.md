---
title: AI-Assisted Security Engineering
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
created: 2026-06-23
updated: 2026-08-24
aliases:
  - AI 보조 보안 엔지니어링
parent_concepts: []
related_concepts:
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]"
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
tags:
  - AI
  - Security
  - SoftwareEngineering
---

# AI-Assisted Security Engineering

## 한 문장 정의

AI-Assisted Security Engineering은 AI를 사용해 취약점 탐지, 공격 가능성 분석, 재현, 패치 초안, 테스트, 코드 리뷰를 보조하되 결정적 검사와 사람 검토로 결과를 통제하는 보안 개발 방식입니다.

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 이름 | AI 보조 보안 엔지니어링 |
| 영어 이름 | AI-Assisted Security Engineering |
| 적용 단계 | 코딩, 리뷰, CI, 사고 분석, 패치 |
| 핵심 원칙 | AI 후보 + 결정적 검증 + 책임 있는 승인 |

## 범위

**포함:** 코드·구성 분석, 취약점 후보, 재현 절차, 데이터 흐름 추적, 패치·테스트 초안, 보안 리뷰 우선순위화입니다.

**포함하지 않음:** AI가 자동으로 위험한 패치를 배포하는 것, 패키지·빌드·서명 전체 신뢰는 [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]의 범위입니다.

## 왜 중요한가

AI는 큰 코드베이스를 빠르게 탐색하고 보안팀의 반복 작업을 줄일 수 있습니다. 하지만 그럴듯한 오탐과 불완전한 패치도 만들 수 있으므로 실제 공격 경로, 회귀 테스트, 정적·동적 검사를 통과해야 합니다.

## 핵심 구성 요소

- 저장소·구성·의존성 문맥 수집
- 취약점 후보와 데이터 흐름 분석
- 재현 가능한 proof와 영향 범위
- 최소 패치와 보안 테스트 초안
- CodeQL·SAST·DAST 같은 결정적 검사
- 사람 검토와 병합·배포 문턱

## 작동 원리

1. AI가 코드와 보안 경계를 읽고 후보를 찾습니다.
2. 입력에서 위험한 sink까지 실제 경로를 확인합니다.
3. 재현 절차와 최소 패치를 제안합니다.
4. 정적 분석, 단위·회귀·공격 테스트를 실행합니다.
5. 사람이 악용 가능성, 부작용, 공개 범위를 검토합니다.
6. 승인된 패치만 병합하고 결과를 추적합니다.

## 실제 예시

- PR에서 prompt injection sink를 탐지하고 관련 코드 경로를 설명합니다.
- secret 노출 후보를 분류하고 발급사 폐기·회수 절차를 제안합니다.
- 취약점 패치와 함께 실패를 재현하는 테스트를 만듭니다.

## 한계와 실패 조건

- AI가 존재하지 않는 공격 경로나 API를 만들어 오탐을 낼 수 있습니다.
- 패치가 테스트를 통과해도 설계 수준의 권한 문제를 남길 수 있습니다.
- 비공개 취약점·secret을 외부 모델에 보내면 새 유출이 생깁니다.
- 자동 병합이 사람 책임과 coordinated disclosure를 우회할 수 있습니다.

## 혼동하기 쉬운 개념

| 개념 | 차이 |
|---|---|
| [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]] | 에이전트 보안은 AI 행동 시스템을 보호하고, AI 보조 보안 엔지니어링은 AI로 소프트웨어 보안 업무를 돕습니다. |
| [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]] | 공급망 보안은 의존성·빌드·서명·배포 경로의 신뢰 전체를 다룹니다. |
| 자동 수정 | 자동 수정은 한 기능이고 보안 엔지니어링은 재현·검증·승인까지 포함합니다. |

## 관련 개념

- 상위: 애플리케이션 보안, 소프트웨어 엔지니어링
- 하위: AI 코드 보안 리뷰, AI 패치 보조
- 함께 쓰임: [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]], [[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]
- 대비: 검증 없는 자동 패치

## 최근 변화

- 2026 — AI 보안 검사는 코딩 중 온디맨드 리뷰와 PR 자동 탐지로 개발 흐름 안에 들어오고 있습니다.

## 출처

- https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/
- https://github.blog/changelog/2026-07-14-security-reviews-now-available-in-the-github-copilot-app/
- https://github.blog/changelog/2026-07-10-codeql-2-26-0-adds-kotlin-2-4-0-support-and-ai-prompt-injection-detection
- https://codeql.github.com/docs/codeql-overview/codeql-changelog/codeql-cli-2.26.0/
