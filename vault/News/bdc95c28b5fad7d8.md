---
title: Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가
type: news
schema_version: tech-news/v1
date: 2026-07-07
created: 2026-07-07
updated: 2026-07-07
event_id: bdc95c28b5fad7d8
review_status: verified
concept_ids: []
published_at: 2026-07-07
reviewed_at: 2026-10-07
date_kind: source-publication-time
source_published_at: 2026-07-06T22:51:16Z
source_url: https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
sources:
  - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
concepts: []
description: Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를
  small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌 권장
  기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run_id와 workflow.name을 추가해
  실행별 활동을 추적할 수 있도록 했다.
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
lead: Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를
  small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌 권장
  기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run_id와 workflow.name을 추가해
  실행별 활동을 추적할 수 있도록 했다.
facts:
  who: Claude Code
  when: 2026-07-07
  where: 미기재
  what: v2.1.202 업데이트
  how: 동적 워크플로 크기 설정 및 실행 추적 속성 추가, 원격 제어와 세션 오류 수정
  why: 미기재
explanations:
  - heading: 원격 제어와 백그라운드 작업
    paragraphs:
      - 모바일·웹 Remote Control에서 보낸 명령이 Unknown command로 실패하거나 설명 없이 전송한 이미지·파일이
        누락되는 문제를 수정했다. 원격 제어 화면에 잘못된 권한 모드를 표시하는 문제도 수정 목록에 포함됐다.
      - 백그라운드 세션에서 /rename으로 변경한 이름이 작업 재시작 때 되돌아가는 문제를 고쳤다. claude agents에서 대화를
        열 때 백그라운드 에이전트로 실행 중이라는 오류와 작업 프로세스의 충돌·재시작이 반복되는 문제도 수정했다.
      - 마이크나 녹음기에서 캡처가 반복적으로 실패하면 음성 입력을 일시 중지하도록 바꿨다. 이전의 무제한 재시도 동작을 중단하는 변경이다.
    source_urls:
      - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
  - heading: 인증·연결과 세션 복원
    paragraphs:
      - 클라이언트 인증서를 실행 중 교체하면서 설정을 다시 적용할 때 일시적으로 mTLS 핸드셰이크가 실패하는 문제를 수정했다.
      - Ctrl+R 기록 검색이 파일을 스캔하는 동안 선택하거나 취소하면 충돌하던 문제를 수정했다. Git worktree가 많은
        저장소에서 세션을 이름으로 복원하거나 복원 목록을 열 때 오래 걸리고 메모리를 많이 쓰는 문제도 수정했다.
      - SSH에서 줄이 나뉘어 클릭하기 어려웠던 로그인 URL을 하나의 링크로 출력한다. 설치·업데이트 다운로드 중 프록시나 네트워크
        연결이 일시적으로 끊어지면 즉시 실패하는 대신 다시 시도하도록 바꿨다.
    source_urls:
      - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
  - heading: 워크플로와 MCP 설정
    paragraphs:
      - 워크플로 스크립트 문자열의 Unicode 따옴표 이스케이프가 파싱 전에 손상되는 문제와 이미 읽은 스킬을 다시 호출할 때 지시문이
        중복되는 문제를 수정했다. 파싱 오류에는 실제 문제가 발생한 줄을 표시하며, /workflows 목록에는 넓어진 제목 영역과 별도
        시간 열 등을 적용했다.
      - MCP 서버 설정에 url만 있고 type이 없으면 type을 http로 지정하라는 안내를 표시한다. 기존의 command 문자열
        오류 메시지를 실제 설정 문제에 맞게 바꾼 것이다.
    source_urls:
      - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
  - heading: PR 검토 명령
    paragraphs:
      - /review 명령은 PR을 한 차례 검토하는 빠른 방식으로 되돌렸다. 여러 에이전트로 검토하려면 /code-review 명령에
        검토 강도와 PR 번호를 지정한다.
    source_urls:
      - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가


Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를 small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌 권장 기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run\_id와 workflow.name을 추가해 실행별 활동을 추적할 수 있도록 했다. [원문 1](<https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202>)

### 원격 제어와 백그라운드 작업

모바일·웹 Remote Control에서 보낸 명령이 Unknown command로 실패하거나 설명 없이 전송한 이미지·파일이 누락되는 문제를 수정했다. 원격 제어 화면에 잘못된 권한 모드를 표시하는 문제도 수정 목록에 포함됐다.

백그라운드 세션에서 /rename으로 변경한 이름이 작업 재시작 때 되돌아가는 문제를 고쳤다. claude agents에서 대화를 열 때 백그라운드 에이전트로 실행 중이라는 오류와 작업 프로세스의 충돌·재시작이 반복되는 문제도 수정했다.

마이크나 녹음기에서 캡처가 반복적으로 실패하면 음성 입력을 일시 중지하도록 바꿨다. 이전의 무제한 재시도 동작을 중단하는 변경이다. [원문 1](<https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202>)

### 인증·연결과 세션 복원

클라이언트 인증서를 실행 중 교체하면서 설정을 다시 적용할 때 일시적으로 mTLS 핸드셰이크가 실패하는 문제를 수정했다.

Ctrl+R 기록 검색이 파일을 스캔하는 동안 선택하거나 취소하면 충돌하던 문제를 수정했다. Git worktree가 많은 저장소에서 세션을 이름으로 복원하거나 복원 목록을 열 때 오래 걸리고 메모리를 많이 쓰는 문제도 수정했다.

SSH에서 줄이 나뉘어 클릭하기 어려웠던 로그인 URL을 하나의 링크로 출력한다. 설치·업데이트 다운로드 중 프록시나 네트워크 연결이 일시적으로 끊어지면 즉시 실패하는 대신 다시 시도하도록 바꿨다. [원문 1](<https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202>)

### 워크플로와 MCP 설정

워크플로 스크립트 문자열의 Unicode 따옴표 이스케이프가 파싱 전에 손상되는 문제와 이미 읽은 스킬을 다시 호출할 때 지시문이 중복되는 문제를 수정했다. 파싱 오류에는 실제 문제가 발생한 줄을 표시하며, /workflows 목록에는 넓어진 제목 영역과 별도 시간 열 등을 적용했다.

MCP 서버 설정에 url만 있고 type이 없으면 type을 http로 지정하라는 안내를 표시한다. 기존의 command 문자열 오류 메시지를 실제 설정 문제에 맞게 바꾼 것이다. [원문 1](<https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202>)

### PR 검토 명령

/review 명령은 PR을 한 차례 검토하는 빠른 방식으로 되돌렸다. 여러 에이전트로 검토하려면 /code-review 명령에 검토 강도와 PR 번호를 지정한다. [원문 1](<https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/07/2026-07-07_0804_Tech_AI_Briefing|2026-07-07 브리핑]]
