---
title: Tech & AI Briefing - 00:04
time: 00:04
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-06-27
timezone: Asia/Seoul
coverage_start: 2026-06-26T18:02:04+09:00
coverage_end: 2026-06-27T00:04:57+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 2
linked_knowledge_notes:
  - AI Agents
  - Model Context Protocol
  - Knowledge/AI Systems/Model Context Protocol
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GitHub Desktop 3.6, 워크트리·Copilot 병합 충돌 해결 지원
  - AWS, S3 PDF를 MCP 도구로 읽는 구현 예제 공개
article_records:
  - title: GitHub Desktop 3.6, 워크트리·Copilot 병합 충돌 해결 지원
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-06-26
      where: 미기재
      what: GitHub Desktop 3.6 기능에 관한 6월 26일 공식 발표
      how: Copilot SDK를 기반으로 커밋 메시지 작성과 병합 충돌 해결에 AI 지원 제공, 모델 선택기 및 BYOK 기능 추가
      why: 미기재
    lead: GitHub는 2026년 6월 26일(한국시간) Desktop 3.6의 Git 워크트리 지원과 Copilot 기반 커밋·병합 기능을
      발표했다. Copilot 기능은 공통 SDK로 동작하며, 모델 선택기와 외부 제공사·로컬 모델 연결을 지원한다.
    explanations:
      - heading: 여러 브랜치에서 작업하기
        paragraphs:
          - Git 워크트리 지원으로 변경사항을 반복적으로 임시 저장하거나 브랜치를 전환하지 않고 여러 브랜치에서 작업할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration
      - heading: 커밋 메시지와 병합 충돌
        paragraphs:
          - 커밋 메시지 생성은 .github/copilot-instructions.md와 AGENTS.md의 지침, 저장소의 커밋
            메타데이터 규칙을 반영한다.
          - Copilot이 병합 충돌을 설명하고 해결안을 제안하면, 사용자가 검토·수정한 뒤 병합을 완료한다.
        source_urls:
          - https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration
      - heading: 모델 선택과 이용 조건
        paragraphs:
          - 각 Copilot 기능에서 GitHub를 통해 이용 가능한 모델을 선택할 수 있다. BYOK로 외부 제공사나 로컬 모델을
            연결하는 방식도 제공한다.
          - Desktop 3.6.0은 macOS·Windows에서 무료로 내려받아 사용할 수 있으며, Copilot 기능에는
            GitHub Copilot 접근 권한이 필요하다.
        source_urls:
          - https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, S3 PDF를 MCP 도구로 읽는 구현 예제 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-26
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: AWS는 2026년 6월 26일(한국시간) Amazon S3의 PDF를 필요할 때 읽어 AI 도우미에 전달하는 MCP 서버 구현 글을
      공개했다. 예제는 텍스트가 포함된 PDF를 대상으로 하며, Kiro CLI에서 문서를 요청하는 개발·개념검증 환경을 다룬다.
    explanations:
      - heading: 요청과 결과의 흐름
        paragraphs:
          - 클라이언트가 S3 버킷 이름과 객체 키를 전달하면 MCP 서버가 PDF를 내려받고 텍스트를 추출해 반환한다. CLI·MCP
            통신 계층·서버·S3가 구성 요소이며 IAM이 S3 접근을 제어한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/build-interactive-pdf-text-extraction-from-amazon-s3/
      - heading: 예제 도구의 구현
        paragraphs:
          - Python 예제의 extract_s3_pdf_text 도구는 bucket·key를 필수 입력으로 받는다. boto3로
            파일을 가져오고 PyPDF2의 PdfReader로 페이지별 텍스트를 읽은 뒤 MCP TextContent로 반환한다.
          - Kiro CLI의 MCP 설정에는 Python으로 실행할 서버 파일 경로를 등록한다. 서버 예제는 임시 파일을 사용하고
            처리가 끝나면 해당 파일을 삭제한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/build-interactive-pdf-text-extraction-from-amazon-s3/
      - heading: 문서와 접근 범위
        paragraphs:
          - AWS는 기존 AWS 자격 증명을 사용하고 PDF가 있는 특정 버킷에 읽기 권한만 부여하도록 설명했다. 추출은 요청 시
            수행하며, S3 접근 요청은 CloudTrail에 기록된다는 안내다.
          - 이 예제는 PDF에 포함된 텍스트를 읽으며 OCR·표 구조 복원·폼 추출은 수행하지 않는다. AWS는 스캔 문서, 복잡한
            레이아웃과 대규모 운영 처리를 Textract의 적용 범위로 구분했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/build-interactive-pdf-text-extraction-from-amazon-s3/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub Desktop 3.6, 워크트리·Copilot 병합 충돌 해결 지원
    event_id: 90489b85fa53d76c
    review_status: verified
    published_at: 2026-06-26
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-26T03:32:58-07:00
  - title: AWS, S3 PDF를 MCP 도구로 읽는 구현 예제 공개
    event_id: e0f27b504657fd4a
    review_status: verified
    published_at: 2026-06-26
    reviewed_at: 2026-10-09
    concept_ids:
      - mcp
    date_kind: source-publication-time
    source_published_at: 2026-06-26T06:47:45-08:00
---

# 이번 호 표지

GitHub Desktop 3.6, 워크트리·Copilot 병합 충돌 해결 지원

# 차례

- GitHub Desktop 3.6, 워크트리·Copilot 병합 충돌 해결 지원
- AWS, S3 PDF를 MCP 도구로 읽는 구현 예제 공개

# 커버 스토리

없음

# 뉴스 데스크

## GitHub Desktop 3.6, 워크트리·Copilot 병합 충돌 해결 지원

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 6월 26일(한국시간) Desktop 3.6의 Git 워크트리 지원과 Copilot 기반 커밋·병합 기능을 발표했다. Copilot 기능은 공통 SDK로 동작하며, 모델 선택기와 외부 제공사·로컬 모델 연결을 지원한다. [S1]

### 여러 브랜치에서 작업하기

Git 워크트리 지원으로 변경사항을 반복적으로 임시 저장하거나 브랜치를 전환하지 않고 여러 브랜치에서 작업할 수 있다. [S1]

### 커밋 메시지와 병합 충돌

커밋 메시지 생성은 .github/copilot-instructions.md와 AGENTS.md의 지침, 저장소의 커밋 메타데이터 규칙을 반영한다.

Copilot이 병합 충돌을 설명하고 해결안을 제안하면, 사용자가 검토·수정한 뒤 병합을 완료한다. [S1]

### 모델 선택과 이용 조건

각 Copilot 기능에서 GitHub를 통해 이용 가능한 모델을 선택할 수 있다. BYOK로 외부 제공사나 로컬 모델을 연결하는 방식도 제공한다.

Desktop 3.6.0은 macOS·Windows에서 무료로 내려받아 사용할 수 있으며, Copilot 기능에는 GitHub Copilot 접근 권한이 필요하다. [S1]

## AWS, S3 PDF를 MCP 도구로 읽는 구현 예제 공개

**분야:** 소프트웨어·클라우드
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** AWS

AWS는 2026년 6월 26일(한국시간) Amazon S3의 PDF를 필요할 때 읽어 AI 도우미에 전달하는 MCP 서버 구현 글을 공개했다. 예제는 텍스트가 포함된 PDF를 대상으로 하며, Kiro CLI에서 문서를 요청하는 개발·개념검증 환경을 다룬다. [S2]

### 요청과 결과의 흐름

클라이언트가 S3 버킷 이름과 객체 키를 전달하면 MCP 서버가 PDF를 내려받고 텍스트를 추출해 반환한다. CLI·MCP 통신 계층·서버·S3가 구성 요소이며 IAM이 S3 접근을 제어한다. [S2]

### 예제 도구의 구현

Python 예제의 extract\_s3\_pdf\_text 도구는 bucket·key를 필수 입력으로 받는다. boto3로 파일을 가져오고 PyPDF2의 PdfReader로 페이지별 텍스트를 읽은 뒤 MCP TextContent로 반환한다.

Kiro CLI의 MCP 설정에는 Python으로 실행할 서버 파일 경로를 등록한다. 서버 예제는 임시 파일을 사용하고 처리가 끝나면 해당 파일을 삭제한다. [S2]

### 문서와 접근 범위

AWS는 기존 AWS 자격 증명을 사용하고 PDF가 있는 특정 버킷에 읽기 권한만 부여하도록 설명했다. 추출은 요청 시 수행하며, S3 접근 요청은 CloudTrail에 기록된다는 안내다.

이 예제는 PDF에 포함된 텍스트를 읽으며 OCR·표 구조 복원·폼 추출은 수행하지 않는다. AWS는 스캔 문서, 복잡한 레이아웃과 대규모 운영 처리를 Textract의 적용 범위로 구분했다. [S2]

**개념:** [[Knowledge/AI Systems/Model Context Protocol]]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

없음

# Source List

- [S1] https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration
- [S2] https://aws.amazon.com/blogs/machine-learning/build-interactive-pdf-text-extraction-from-amazon-s3/
