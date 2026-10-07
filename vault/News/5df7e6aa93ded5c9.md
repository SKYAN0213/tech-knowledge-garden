---
title: AI SDK 7.0.19, MCP 도구 정의 변경을 감지하는 기능 추가
type: news
schema_version: tech-news/v1
date: 2026-07-10
created: 2026-07-10
updated: 2026-07-10
event_id: 5df7e6aa93ded5c9
review_status: verified
concept_ids: []
published_at: 2026-07-10
reviewed_at: 2026-10-06
date_kind: source-publication-time
source_published_at: 2026-07-09T18:07:30Z
source_url: https://github.com/vercel/ai/releases/tag/ai%407.0.19
sources:
  - https://github.com/vercel/ai/releases/tag/ai%407.0.19
concepts: []
description: 한국시간 7월 10일 공개된 AI SDK의 ai@7.0.19 패치는 MCP 서버의 도구 정의가 이전과 달라졌는지 확인하는
  기능을 추가했다. 도구 승인의 서명 보존과 등록 여부 검사도 손보고, 동영상 생성의 참조 입력에 기존 이미지 외에 동영상을 지원한다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
entities: []
tags:
  - sector/software-cloud
  - theme/products
  - event/기능-추가
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: 한국시간 7월 10일 공개된 AI SDK의 ai@7.0.19 패치는 MCP 서버의 도구 정의가 이전과 달라졌는지 확인하는 기능을
  추가했다. 도구 승인의 서명 보존과 등록 여부 검사도 손보고, 동영상 생성의 참조 입력에 기존 이미지 외에 동영상을 지원한다.
facts:
  who: ai@7.0.19
  when: 2026-07-10 (한국시각; 원문 2026-07-09T18:07:30Z)
  where: 미기재
  what: MCP 도구 정의 변경 감지·승인 처리 수정·동영상 참조 입력 지원
  how: fingerprintTools로 신뢰 시점의 도구 정의를 고정하고 detectToolDrift로 이후 정의와 비교
  why: 미기재
explanations:
  - heading: 처음 신뢰한 도구 정의와 비교
    paragraphs:
      - fingerprintTools는 처음 도구를 신뢰할 때 서버가 제공하는 설명, 입력 스키마, 제목을 고정한다.
        detectToolDrift는 나중에 가져온 정의와 비교해 도구를 모델에 넘기기 전에 설명의 변경이나 입력 스키마의 확장을
        찾아낸다.
      - 비교 기준의 보관과 변경을 발견한 뒤의 대응은 애플리케이션이 맡는다.
    source_urls:
      - https://github.com/vercel/ai/releases/tag/ai%407.0.19
  - heading: 등록하지 않은 이름의 처리
    paragraphs:
      - 도구 이름이나 승인 ID가 constructor, toString, valueOf, __proto__ 같은 상속 속성과 같아도
        등록된 도구나 승인으로 읽지 않고 미설정 또는 없는 값으로 처리한다. 직접 등록된 객체 속성인지 확인하는 own-property
        검사를 적용한 변경이다.
    source_urls:
      - https://github.com/vercel/ai/releases/tag/ai%407.0.19
  - heading: 승인과 동영상 참조 입력
    paragraphs:
      - 도구 승인의 상태가 responded로 전환될 때 승인 서명을 보존한다. 동영상 생성의 inputReferences 입력은 기존
        이미지 참조와 함께 동영상 참조도 받을 수 있도록 확장했다.
    source_urls:
      - https://github.com/vercel/ai/releases/tag/ai%407.0.19
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# AI SDK 7.0.19, MCP 도구 정의 변경을 감지하는 기능 추가


한국시간 7월 10일 공개된 AI SDK의 ai@7.0.19 패치는 MCP 서버의 도구 정의가 이전과 달라졌는지 확인하는 기능을 추가했다. 도구 승인의 서명 보존과 등록 여부 검사도 손보고, 동영상 생성의 참조 입력에 기존 이미지 외에 동영상을 지원한다. [원문 1](<https://github.com/vercel/ai/releases/tag/ai%407.0.19>)

### 처음 신뢰한 도구 정의와 비교

fingerprintTools는 처음 도구를 신뢰할 때 서버가 제공하는 설명, 입력 스키마, 제목을 고정한다. detectToolDrift는 나중에 가져온 정의와 비교해 도구를 모델에 넘기기 전에 설명의 변경이나 입력 스키마의 확장을 찾아낸다.

비교 기준의 보관과 변경을 발견한 뒤의 대응은 애플리케이션이 맡는다. [원문 1](<https://github.com/vercel/ai/releases/tag/ai%407.0.19>)

### 등록하지 않은 이름의 처리

도구 이름이나 승인 ID가 constructor, toString, valueOf, \_\_proto\_\_ 같은 상속 속성과 같아도 등록된 도구나 승인으로 읽지 않고 미설정 또는 없는 값으로 처리한다. 직접 등록된 객체 속성인지 확인하는 own-property 검사를 적용한 변경이다. [원문 1](<https://github.com/vercel/ai/releases/tag/ai%407.0.19>)

### 승인과 동영상 참조 입력

도구 승인의 상태가 responded로 전환될 때 승인 서명을 보존한다. 동영상 생성의 inputReferences 입력은 기존 이미지 참조와 함께 동영상 참조도 받을 수 있도록 확장했다. [원문 1](<https://github.com/vercel/ai/releases/tag/ai%407.0.19>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-10_0802_Tech_AI_Briefing|2026-07-10 브리핑]]
