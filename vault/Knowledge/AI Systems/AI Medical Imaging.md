---
title: AI Medical Imaging
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: AI Systems
created: 2026-08-24
updated: 2026-09-13
aliases:
  - AI 의료 영상
parent_concepts: []
related_concepts:
  - "[[Knowledge/AI Systems/AI Conformity Assessment|AI 적합성 평가]]"
tags:
  - AI
  - Healthcare
  - MedicalImaging
last_reviewed: 2026-09-13
concept_id: medical
label: AI 의료 영상
group: 과학과 물리 세계
keywords:
  - 의료 영상
  - 분할
  - 검출
  - 사용 목적
  - 임상 평가
verified_sources:
  - https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices
  - https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices
  - https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng
relations:
  - target: wellness
    type: contrast
    reason: 임상 목적과 저위험 생활습관 지원의 목적 경계가 다르다.
    basis: inference
    evidence:
      - https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices
      - https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices
  - target: conformity
    type: uses
    reason: 의료 목적의 AI는 해당 관할·제품에 맞는 평가 경로를 확인한다. FDA와 EU 절차는 서로 동일하지 않다.
    basis: inference
    evidence:
      - https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices
      - https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng
---

# AI Medical Imaging

## 한 문장 정의

의료 영상의 분석·검출·분할 등을 통해 정해진 임상 사용 목적을 지원하는 AI 기술이다. [FDA · AI-enabled medical devices](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices)

## 용어 카드

| 항목 | 내용 |
|---|---|
| 한국어 | AI 의료 영상 |
| 영어 | AI Medical Imaging |
| 키워드 | 의료 영상 · 분할 · 검출 · 사용 목적 · 임상 평가 |

## 범위

**포함:** 영상 기반 의료기기의 분석 기능과 해당 사용 목적에 대한 평가.

**포함하지 않음:** 생활습관 지원 기기 전체나 일반 이미지 생성.

## 왜 중요한가

AI의 영상 분석 결과가 임상 사용 목적을 지원하는지 확인하려면 대상 환자·기기·검증 자료를 연결해서 읽어야 한다.

## 핵심 구성 요소

- 의료 영상
- 분할
- 검출
- 사용 목적
- 임상 평가

## 작동 원리

영상과 관련 입력을 모델로 처리하고 정의된 임상 작업에 맞는 결과를 제공한다. 성능 증거는 대상 환자·기기·사용 목적에 연결해야 한다. [FDA · AI-enabled medical devices](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices)

## 실제 예시

FDA 목록에 수록된 영상 분할 기기의 허가 자료에서 해당 사용 목적과 근거를 확인한다.

## 한계와 실패 조건

FDA 목록은 전체 기기를 빠짐없이 포함한 목록이 아니다. 등록된 제품의 심사 결과를 다른 용도에 일반화할 수 없다.

## 혼동하기 쉬운 개념

의료 영상의 임상 목적과 저위험 웰니스의 건강 습관 지원 목적을 구분한다.

## 관련 개념

- → 대비: [[Knowledge/AI Systems/AI Wellness Devices#한 문장 정의|AI 웰니스 기기]] — 임상 목적과 저위험 생활습관 지원의 목적 경계가 다르다. (해석; [근거](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices) · [근거](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices))
- → 활용: [[Knowledge/AI Systems/AI Conformity Assessment#한 문장 정의|AI 적합성 평가]] — 의료 목적의 AI는 해당 관할·제품에 맞는 평가 경로를 확인한다. FDA와 EU 절차는 서로 동일하지 않다. (해석; [근거](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices) · [근거](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng))

## 최근 변화

- 2026-09-07 — Nature Communications의 다중 프레임 초음파 연구는 외부 두 기관 평가와 후편집 보고서 평가를 보고했습니다. 기관 간 일반화와 사람 수정 이후 품질을 원시 모델 성능에서 분리해 해석해야 하는 사례입니다. [source](https://www.nature.com/articles/s41467-026-77498-w)
- 2026-06 — FDA는 AI 사용 여부와 LLM 기반 기능을 더 명확히 식별하도록 AI-enabled medical device 목록의 데이터 구조를 확장했습니다.

## 출처

- [FDA · AI-enabled medical devices](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices)
- [FDA · General Wellness (January 2026)](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)
- [EU AI Act · Article 43](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)
