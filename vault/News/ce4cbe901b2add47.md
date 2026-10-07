---
title: OpenCode v1.17.14, MCP 도구를 실행하는 코드 모드 추가
type: news
schema_version: tech-news/v1
date: 2026-07-07
created: 2026-07-07
updated: 2026-07-07
event_id: ce4cbe901b2add47
review_status: verified
concept_ids: []
published_at: 2026-07-07
reviewed_at: 2026-10-07
date_kind: source-publication-time
source_published_at: 2026-07-06T18:50:53Z
source_url: https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
sources:
  - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
concepts: []
description: OpenCode v1.17.14는 2026년 7월 7일(한국시간) 공개됐다. 연결된 MCP 도구를 대상으로 제한된 조정
  스크립트를 실행하는 코드 모드 어댑터를 추가했다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
  - 오류 수정
entities: []
tags:
  - sector/software-cloud
  - theme/products
  - event/기능-추가
  - event/오류-수정
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: OpenCode v1.17.14는 2026년 7월 7일(한국시간) 공개됐다. 연결된 MCP 도구를 대상으로 제한된 조정 스크립트를
  실행하는 코드 모드 어댑터를 추가했다.
facts:
  who: OpenCode
  when: 2026-07-07
  where: 미기재
  what: 1.17.14 코드 모드 MCP 어댑터 추가와 오류 수정
  how: 코드 모드에서 연결된 MCP 도구의 실행을 조정
  why: 미기재
explanations:
  - heading: 도구 실행과 모델 연결
    paragraphs:
      - execute 도구는 코드 모드가 켜진 경우에만 표시한다. 여러 페이지로 나뉜 MCP 도구 목록에서 메타데이터와 출력 스키마
        검증이 누락되는 문제도 수정했다.
      - OpenRouter 소형 모델 변형의 low 추론 설정을 비활성화하지 않고 유지한다. GitHub Copilot은 모델별로
        제공한다고 명시한 chat 또는 responses 엔드포인트로 연결하도록 수정했다.
      - Cerebras에 이전 답변의 추론 내용을 다시 보낼 때 해당 제공자가 지원하는 필드를 사용하도록 수정했다.
    source_urls:
      - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
  - heading: 세션 표시와 작업 입력
    paragraphs:
      - 같은 인스턴스 디렉터리를 다른 형태로 지정해도 세션 목록이 일치하도록 수정했다. TUI 화면의 로딩 표시가 계속 출력되도록 스피너
        등록도 수정했다.
      - Home에서 새 세션이 잘못된 프로젝트에 연결되거나 첫 실행 안내가 부적절하게 나타나는 문제를 수정했다. 큰 검토 화면의 동작과
        드롭다운 검색도 손봤다.
      - 답변부터 시작하는 타임라인에는 누락된 사용자 입력을 보충한다. 창에 포커스가 없는 동안에도 작성창에 입력할 수 있도록 복원했다.
    source_urls:
      - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
  - heading: 데스크톱 탭과 화면
    paragraphs:
      - 닫힌 탭을 다시 열거나 백그라운드로 탭을 여는 기능을 추가했다. Home에는 최근 닫힌 프로젝트를 표시하고, 탭 이동은 마우스
        버튼을 누르는 시점에 반응하도록 바꿨다.
      - 제목 표시줄에 draft 서버 상태를 표시하고 제공자 연결 절차를 통일했다. 통합 터미널·모델 검색·검토 패널·세션 탭
        미리보기에도 변경을 적용했다.
      - 세션 탭을 바꿔도 검토 패널과 같은 작업공간의 터미널을 유지한다. 앱을 닫았다가 다시 열어도 데스크톱 창의 탭을 보존하도록
        수정했다.
    source_urls:
      - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
  - heading: 서버와 하위 세션
    paragraphs:
      - 세션의 작업 중 표시가 해당 서버에만 연결되도록 수정했다. 탭을 바꾸는 동안 하위 세션을 찾거나 상위·하위 세션 관계를 확인하는
        동작도 수정했다.
    source_urls:
      - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# OpenCode v1.17.14, MCP 도구를 실행하는 코드 모드 추가


OpenCode v1.17.14는 2026년 7월 7일(한국시간) 공개됐다. 연결된 MCP 도구를 대상으로 제한된 조정 스크립트를 실행하는 코드 모드 어댑터를 추가했다. [원문 1](<https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14>)

### 도구 실행과 모델 연결

execute 도구는 코드 모드가 켜진 경우에만 표시한다. 여러 페이지로 나뉜 MCP 도구 목록에서 메타데이터와 출력 스키마 검증이 누락되는 문제도 수정했다.

OpenRouter 소형 모델 변형의 low 추론 설정을 비활성화하지 않고 유지한다. GitHub Copilot은 모델별로 제공한다고 명시한 chat 또는 responses 엔드포인트로 연결하도록 수정했다.

Cerebras에 이전 답변의 추론 내용을 다시 보낼 때 해당 제공자가 지원하는 필드를 사용하도록 수정했다. [원문 1](<https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14>)

### 세션 표시와 작업 입력

같은 인스턴스 디렉터리를 다른 형태로 지정해도 세션 목록이 일치하도록 수정했다. TUI 화면의 로딩 표시가 계속 출력되도록 스피너 등록도 수정했다.

Home에서 새 세션이 잘못된 프로젝트에 연결되거나 첫 실행 안내가 부적절하게 나타나는 문제를 수정했다. 큰 검토 화면의 동작과 드롭다운 검색도 손봤다.

답변부터 시작하는 타임라인에는 누락된 사용자 입력을 보충한다. 창에 포커스가 없는 동안에도 작성창에 입력할 수 있도록 복원했다. [원문 1](<https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14>)

### 데스크톱 탭과 화면

닫힌 탭을 다시 열거나 백그라운드로 탭을 여는 기능을 추가했다. Home에는 최근 닫힌 프로젝트를 표시하고, 탭 이동은 마우스 버튼을 누르는 시점에 반응하도록 바꿨다.

제목 표시줄에 draft 서버 상태를 표시하고 제공자 연결 절차를 통일했다. 통합 터미널·모델 검색·검토 패널·세션 탭 미리보기에도 변경을 적용했다.

세션 탭을 바꿔도 검토 패널과 같은 작업공간의 터미널을 유지한다. 앱을 닫았다가 다시 열어도 데스크톱 창의 탭을 보존하도록 수정했다. [원문 1](<https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14>)

### 서버와 하위 세션

세션의 작업 중 표시가 해당 서버에만 연결되도록 수정했다. 탭을 바꾸는 동안 하위 세션을 찾거나 상위·하위 세션 관계를 확인하는 동작도 수정했다. [원문 1](<https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-07_0804_Tech_AI_Briefing|2026-07-07 브리핑]]
