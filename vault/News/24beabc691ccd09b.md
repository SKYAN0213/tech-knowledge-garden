---
title: CodeQL 2.27.2, C++ 정규표현식 파서 추가·Go 그래프 표현 변경
type: news
schema_version: tech-news/v1
date: 2026-10-12
created: 2026-10-12
updated: 2026-10-12
event_id: 24beabc691ccd09b
review_status: verified
concept_ids: []
published_at: 2026-10-09
reviewed_at: 2026-10-11
source_url: https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis
sources:
  - https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis
concepts: []
description: GitHub는 10월 10일(한국시간) 코드 스캔용 정적 분석 엔진 CodeQL 2.27.2를 공개하고 C++ 정규표현식
  파서와 여러 언어의 분석 변경 사항을 발표했다. github.com의 코드 스캔에는 새 버전이 자동 배포되며, GitHub
  Enterprise Server(GHES)에는 향후 릴리스로 제공될 예정이다.
theme_format: news-themes/v1
sector: 사이버보안
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
  - 기능 변경
entities:
  - GitHub
tags:
  - sector/cybersecurity
  - theme/products
  - event/기능-추가
  - event/기능-변경
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: GitHub는 10월 10일(한국시간) 코드 스캔용 정적 분석 엔진 CodeQL 2.27.2를 공개하고 C++ 정규표현식 파서와 여러
  언어의 분석 변경 사항을 발표했다. github.com의 코드 스캔에는 새 버전이 자동 배포되며, GitHub Enterprise
  Server(GHES)에는 향후 릴리스로 제공될 예정이다.
facts:
  who: GitHub
  when: 2026-10-10(한국시간)
  where: GitHub 코드 스캔과 GitHub Enterprise Server
  what: CodeQL 2.27.2 공개와 언어별 분석 변경
  how: C++ 정규표현식 파서, 라이브러리 데이터 흐름 모델과 Go 제어 흐름 그래프 변경
  why: 미기재
explanations:
  - heading: C++·Rust 분석 대상
    paragraphs:
      - C++에서는 std::regex의 ECMAScript 문법 정규표현식을 파싱한다. Comdb2 C API의 SQL 인젝션 관련
        sink 모델과 Bloomberg BDE 코덱·바이트 스트림 역직렬화기의 데이터 흐름 요약도 추가됐다.
      - Rust 추출기는 AnyAttr·DocComment 클래스를 지원한다. await와 함께 쓰는 비동기 블록의 데이터 흐름이 바뀌며
        native-tls·async-native-tls·tokio-native-tls의 흐름 요약이 추가됐다.
    source_urls:
      - https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis
  - heading: Go 제어 흐름 그래프의 표현 변경
    paragraphs:
      - Go의 제어 흐름 그래프(CFG)는 공통 CFG 라이브러리를 사용한다. 대입, 매개변수와 반환 결과, range 문, 지연 호출에
        해당하는 노드가 추가되고 진입점에서 도달할 수 없는 노드는 제외된다. 이전 그래프 표현에 의존하는 쿼리는 수정이 필요할 수 있다.
    source_urls:
      - https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis
  - heading: macOS·Xcode 빌드 지원 조건
    paragraphs:
      - 컴파일 언어의 autobuild·manual build 모드는 macOS 27에서는 Xcode 버전과 관계없이 지원되지 않으며,
        macOS 26에서 Xcode 27을 선택한 경우도 지원 대상에서 빠진다. GitHub는 이 빌드 모드에 macOS
        26·Xcode 26 이하를 사용하도록 안내했고, macOS의 build mode none 지원 개선은 진행 중이라고 밝혔다.
    source_urls:
      - https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis
  - heading: 기존 GHES의 수동 업그레이드
    paragraphs:
      - 이전 GHES 버전을 쓰는 이용자는 CodeQL 버전을 수동으로 업그레이드할 수 있다.
    source_urls:
      - https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# CodeQL 2.27.2, C++ 정규표현식 파서 추가·Go 그래프 표현 변경


GitHub는 10월 10일(한국시간) 코드 스캔용 정적 분석 엔진 CodeQL 2.27.2를 공개하고 C++ 정규표현식 파서와 여러 언어의 분석 변경 사항을 발표했다. github.com의 코드 스캔에는 새 버전이 자동 배포되며, GitHub Enterprise Server(GHES)에는 향후 릴리스로 제공될 예정이다. [원문 1](<https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis>)

### C++·Rust 분석 대상

C++에서는 std::regex의 ECMAScript 문법 정규표현식을 파싱한다. Comdb2 C API의 SQL 인젝션 관련 sink 모델과 Bloomberg BDE 코덱·바이트 스트림 역직렬화기의 데이터 흐름 요약도 추가됐다.

Rust 추출기는 AnyAttr·DocComment 클래스를 지원한다. await와 함께 쓰는 비동기 블록의 데이터 흐름이 바뀌며 native-tls·async-native-tls·tokio-native-tls의 흐름 요약이 추가됐다. [원문 1](<https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis>)

### Go 제어 흐름 그래프의 표현 변경

Go의 제어 흐름 그래프(CFG)는 공통 CFG 라이브러리를 사용한다. 대입, 매개변수와 반환 결과, range 문, 지연 호출에 해당하는 노드가 추가되고 진입점에서 도달할 수 없는 노드는 제외된다. 이전 그래프 표현에 의존하는 쿼리는 수정이 필요할 수 있다. [원문 1](<https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis>)

### macOS·Xcode 빌드 지원 조건

컴파일 언어의 autobuild·manual build 모드는 macOS 27에서는 Xcode 버전과 관계없이 지원되지 않으며, macOS 26에서 Xcode 27을 선택한 경우도 지원 대상에서 빠진다. GitHub는 이 빌드 모드에 macOS 26·Xcode 26 이하를 사용하도록 안내했고, macOS의 build mode none 지원 개선은 진행 중이라고 밝혔다. [원문 1](<https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis>)

### 기존 GHES의 수동 업그레이드

이전 GHES 버전을 쓰는 이용자는 CodeQL 버전을 수동으로 업그레이드할 수 있다. [원문 1](<https://github.blog/changelog/2026-10-09-codeql-2-27-2-improves-c-go-rust-and-javascript-analysis>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/10/2026-10-12_0800_Tech_AI_Briefing|2026-10-12 브리핑]]
