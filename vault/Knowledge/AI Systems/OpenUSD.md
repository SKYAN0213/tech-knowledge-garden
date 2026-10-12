---
title: OpenUSD
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
group: 3D 시뮬레이션
concept_id: openusd
label: OpenUSD 장면 기술
created: 2026-10-09
updated: 2026-10-09
last_reviewed: 2026-10-09
aliases:
  - Universal Scene Description
keywords:
  - OpenUSD
  - Universal Scene Description
parent_concepts: []
related_concepts: []
tags:
  - Simulation
verified_sources:
  - https://openusd.org/release/intro.html
  - https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/
map_review:
  decision: include
  kind: architecture
  reason: 3D 자산과 장면을 계층·레이어·합성 규칙으로 구성하는 전문 구조이며 합성데이터와 시뮬레이션 기사를 이해하는 데 독립적인 설명이 필요하다.
  reviewed: 2026-10-09
connections: []
---

# OpenUSD

## 한 문장 정의

OpenUSD(Universal Scene Description)는 여러 3D 자산을 장면으로 조립하고, 원본을 직접 바꾸지 않는 덮어쓰기를 통해 편집하며, 애플리케이션 사이에서 교환하는 장면 기술 체계다. [공식 문서](https://openusd.org/release/intro.html)

## 핵심 구성 요소

장면의 객체인 Prim은 계층으로 배치된다. 각 Prim에는 시간에 따라 달라질 수 있는 속성(Attribute)과 다른 객체를 가리키는 관계(Relationship)가 있으며, 이 내용은 Layer에 저장된다. 여러 Layer와 자산을 합성해 읽는 장면 그래프가 Stage다. [공식 문서](https://openusd.org/release/intro.html)

## 작동 원리

subLayers로 순서가 있는 Layer를 합치고, reference로 다른 자산을 장면에 연결한다. 강한 Layer의 값은 약한 Layer의 값을 덮어쓰므로 원래 자산을 지우거나 직접 수정하지 않고 조합 결과를 바꿀 수 있다. [공식 문서](https://openusd.org/release/intro.html)

VariantSets는 한 자산의 여러 변형을 묶고 선택하도록 한다. Payload는 Stage를 연 뒤에도 필요한 자산 부분만 선택적으로 불러오거나 내려놓아 작업에 필요한 범위를 메모리에 유지하는 지연 참조다. [공식 문서](https://openusd.org/release/intro.html)

## 한계와 실패 조건

USD는 객체를 namespace 경로로 식별한다. 참조한 자산의 내부 경로가 바뀌면 이전에 상위 Layer에서 기록한 덮어쓰기가 원래 객체에 연결되지 않을 수 있다. [공식 문서](https://openusd.org/release/intro.html)

## 최근 변화

- 2026-06-30 — NVIDIA는 비전 AI 구현 지침에서 OpenUSD 기반 Omniverse로 시뮬레이션·합성데이터·디지털 트윈의 장면을 구성하고 조명·날씨·카메라 각도 등의 조건을 바꾸는 역할을 설명했다. [관련 기사](../../News/a5ac4346ca76b814.md) · [원문](https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/)

## 출처

- [OpenUSD: Introduction to USD](https://openusd.org/release/intro.html)
- [NVIDIA: Vision AI Agent Workflows](https://blogs.nvidia.com/blog/vision-ai-agent-skills-omniverse-metropolis/)
