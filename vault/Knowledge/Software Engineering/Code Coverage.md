---
title: Code Coverage
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: Software Engineering
group: 테스트와 품질
concept_id: code-coverage
label: 코드 커버리지
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - 코드 커버리지
keywords:
  - Code coverage
parent_concepts: []
related_concepts: []
tags:
  - SoftwareEngineering
verified_sources:
  - https://docs.github.com/code-security/how-tos/maintain-quality-code/set-up-code-coverage
  - https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests
map_review:
  decision: include
  kind: metric
  reason: 테스트가 코드를 실행하는 범위를 측정하고 브랜치별 차이와 병합 조건에 연결하는 전문 지표다.
  reviewed: 2026-10-09
connections: []
---

# Code Coverage

## 한 문장 정의

코드 커버리지는 테스트가 코드를 얼마나 실행했는지 확인하는 지표다. GitHub는 PR 브랜치의 전체 라인 커버리지 비율과 기본 브랜치 대비 차이, 파일별 증감을 표시한다. [GitHub 문서](https://docs.github.com/code-security/how-tos/maintain-quality-code/set-up-code-coverage)

## 용어 카드

- 한국어: 코드 커버리지
- 영어: Code coverage

## 작동 원리

GitHub의 수동 설정 경로에서는 테스트 실행으로 Cobertura XML 형식의 커버리지 보고서를 만들고 업로드한다. 이 형식의 보고서를 생성할 수 있는 언어와 테스트 프레임워크를 사용할 수 있다. [GitHub 문서](https://docs.github.com/code-security/how-tos/maintain-quality-code/set-up-code-coverage)

기본 브랜치에 대한 push에서는 비교 기준을 만들고, PR 실행에서는 해당 브랜치의 결과를 얻는다. PR 브랜치의 커버리지를 기본 브랜치와 비교한 전체 비율과 파일별 증감으로 확인한다. [GitHub 문서](https://docs.github.com/code-security/how-tos/maintain-quality-code/set-up-code-coverage)

## 실제 예시

GitHub의 병합 보호 규칙은 최소 커버리지 비율과 기본 브랜치 대비 허용할 최대 감소 폭 중 하나 또는 둘 다 설정한다. 평가 모드에서 영향을 확인한 뒤 활성 모드로 전환해 기준을 충족하지 못한 PR의 병합을 막을 수 있다. [GitHub 발표](https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests)

## 최근 변화

- 2026-07-01 — GitHub가 커버리지 기준에 따른 PR 병합 보호를 공개 프리뷰로 제공했다. 한국시간 기준이며, GitHub Code Quality의 제공 대상은 Enterprise Cloud와 Team이다. [관련 기사](../../News/a4de6520a9d0e1a1.md) · [원문](https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests)

## 출처

- [GitHub: Setting up code coverage](https://docs.github.com/code-security/how-tos/maintain-quality-code/set-up-code-coverage)
- [GitHub: Code coverage merge protection for pull requests](https://github.blog/changelog/2026-06-30-github-code-coverage-merge-protection-for-pull-requests)
