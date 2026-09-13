---
title: 2026-09-10 · 아침 브리핑
type: briefing-index
date: 2026-09-10
created: 2026-09-10
modified: 2026-09-10
description: Astra의 기업 접근 관리와 GitHub의 실행·병합 권한 기능
coverage_start: 2026-09-09T08:02:08+09:00
coverage_end: 2026-09-10T08:01:46+09:00
item_count: 3
edition: Editions/2026/09/2026-09-10_0801_Tech_AI_Briefing
github_url: https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/2026/09/2026-09-10_0801_Tech_AI_Briefing.md
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# 2026-09-10 · 아침 브리핑

## 주요 소식

### [[News/333ccaae81484d3a|Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어]]

OpenAI는 9월 9일 기업용 Astra의 관리자 통제 기능을 소개했다. 관리자는 허용한 웹사이트와 데스크톱 앱으로 접근을 제한하고 업로드·다운로드와 브라우징 기록을 관리할 수 있다. 회사는 업무 시스템 접근 범위를 제한한 구성에서 시작할 수 있도록 했으며, Enterprise 접근은 출시 당시 기본 비활성화 상태로 계약에 따라 관리자가 활성화한다고 밝혔다.

### [[News/faa37362568657fb|Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리]]

GitHub는 9월 9일 Copilot Business·Enterprise 관리자가 셸 명령, 파일 읽기·편집, 네트워크 도메인의 이용 권한을 중앙에서 정하는 기능을 정식 제공한다고 발표했다. 작업별로 차단·사람 승인·자동 허용을 지정할 수 있으며, 사용자·워크스페이스 설정이나 이전 승인이 조직의 제한을 완화할 수 없다. 적용 범위는 Copilot 앱·CLI와 Agent Host를 사용하는 VS Code 세션이다.

### [[News/0ef68bd8a0105dab|GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개]]

GitHub는 9월 9일 비밀정보 경보가 남아 있는 풀 리퀘스트(PR)의 병합을 차단하는 저장소 규칙을 공개 미리보기로 제공한다고 발표했다. GitHub Secret Protection 또는 Advanced Security 고객이 규칙을 켜면 최신 커밋의 비밀정보 검사가 완료되고 해당 PR이 도입한 비밀정보의 열린 경보가 없어야 병합할 수 있다. 기본 탐지 대상은 서비스 제공자 패턴이며, 사용자 정의·일반 패턴은 추가로 설정할 수 있고 우회 권한이 없는 개발자는 경보를 해결해야 차단을 해제할 수 있다.



## 분야별 브리핑

### AI · 1건

#### [[News/333ccaae81484d3a|Astra 기업용 관리 기능, 허용 앱·웹사이트와 파일 전송을 제어]]

제품·서비스 · 기능 추가 · OpenAI

OpenAI는 9월 9일 기업용 Astra의 관리자 통제 기능을 소개했다. 관리자는 허용한 웹사이트와 데스크톱 앱으로 접근을 제한하고 업로드·다운로드와 브라우징 기록을 관리할 수 있다. 회사는 업무 시스템 접근 범위를 제한한 구성에서 시작할 수 있도록 했으며, Enterprise 접근은 출시 당시 기본 비활성화 상태로 계약에 따라 관리자가 활성화한다고 밝혔다.

### 사이버보안 · 2건

#### [[News/faa37362568657fb|Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리]]

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 9일 Copilot Business·Enterprise 관리자가 셸 명령, 파일 읽기·편집, 네트워크 도메인의 이용 권한을 중앙에서 정하는 기능을 정식 제공한다고 발표했다. 작업별로 차단·사람 승인·자동 허용을 지정할 수 있으며, 사용자·워크스페이스 설정이나 이전 승인이 조직의 제한을 완화할 수 없다. 적용 범위는 Copilot 앱·CLI와 Agent Host를 사용하는 VS Code 세션이다.

#### [[News/0ef68bd8a0105dab|GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개]]

제품·서비스 · 기능 추가 · GitHub

GitHub는 9월 9일 비밀정보 경보가 남아 있는 풀 리퀘스트(PR)의 병합을 차단하는 저장소 규칙을 공개 미리보기로 제공한다고 발표했다. GitHub Secret Protection 또는 Advanced Security 고객이 규칙을 켜면 최신 커밋의 비밀정보 검사가 완료되고 해당 PR이 도입한 비밀정보의 열린 경보가 없어야 병합할 수 있다. 기본 탐지 대상은 서비스 제공자 패턴이며, 사용자 정의·일반 패턴은 추가로 설정할 수 있고 우회 권한이 없는 개발자는 경보를 해결해야 차단을 해제할 수 있다.



## 출처

- [S1] https://openai.com/index/gpt-6-astra-next-generation-work/
- [S2] https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/
- [S3] https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/
