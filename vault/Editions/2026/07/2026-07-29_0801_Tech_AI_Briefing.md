---
title: 2026-07-29 Tech & AI Briefing
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-07-29
timezone: Asia/Seoul
coverage_start: 2026-07-28T08:05:00+09:00
coverage_end: 2026-07-29T08:01:07+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 2
linked_knowledge_notes:
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software
    Supply Chain Security]]"
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영
  - GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류
article_records:
  - title: GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-28
      where: GitHub Advisory Database와 Dependabot
      what: OpenSSF 악성 패키지 보고 자동 반영과 경보 범위 확대
      how: 의존성을 Advisory Database의 악성 패키지 보고와 대조
      why: 미기재
    lead: GitHub는 7월 28일 OpenSSF malicious-packages 저장소의 악성 패키지 보고를 Advisory
      Database에 자동 반영하기 시작했다고 발표했다. npm과 PyPI 등을 포함해 경보 범위가 넓어졌으며, Malware
      alerts를 켠 저장소의 의존성이 등록된 악성 패키지 정보와 일치하면 Dependabot 경보를 받는다.
    explanations:
      - heading: 기능을 켜면 새 보고가 자동 반영
        paragraphs:
          - 이미 Malware alerts를 사용 중이면 추가 설정 없이 확대된 데이터를 적용받으며, 새 보고가 게시될 때 경보가
            생성된다. 처음 사용하는 경우 저장소나 조직의 Settings → Advanced security →
            Dependabot에서 Malware alerts를 켠다.
        source_urls:
          - https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
      - heading: 악성 패키지 보고 조회
        paragraphs:
          - Advisory Database에서는 type:malware 필터로 악성 패키지 보고를 확인할 수 있다.
        source_urls:
          - https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류
    kind: 사건 뉴스
    region: 해외
    facts:
      who: GitHub
      when: 2026-07-28
      where: github.com 공개 저장소
      what: 악성 의심 Actions 워크플로 실행 전 승인 대기
      how: 쓰기 권한 협업자의 인증된 웹 세션 승인
      why: 탈취된 GitHub 자격증명으로 CI/CD 자격증명을 훔치는 악성 워크플로 공격 대응
    lead: GitHub는 7월 28일 악성으로 의심되는 일부 Actions 워크플로를 실행 전에 승인 대기 상태로 보류하는 보호 조치를
      발표했다. 당시 적용 대상은 github.com의 공개 저장소이며, GitHub가 별도 설정 없이 자동 적용한다.
    explanations:
      - heading: 승인 권한과 실행 재개
        paragraphs:
          - 보류된 워크플로는 저장소의 쓰기 권한이 있는 협업자가 검토하고 승인할 때까지 실행되지 않는다. 승인은 인증된 웹 세션에서
            제출해야 하며, 승인 뒤 워크플로가 정상적으로 계속 실행된다.
        source_urls:
          - https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
      - heading: 탈취된 계정으로 올린 자동화 코드에 대응
        paragraphs:
          - GitHub는 공격자가 탈취한 GitHub 자격증명으로 악성 워크플로를 올리고, CI/CD 자격증명을 훔쳐 추가 공격을
            하는 사례를 배경으로 들었다. 7월 28일 발표에서 GitHub Enterprise Server는 이 보호의 적용 대상에
            포함하지 않았다.
        source_urls:
          - https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영
    event_id: 1618822b0726a28a
    review_status: verified
    published_at: 2026-07-28
    reviewed_at: 2026-10-05
    concept_ids:
      - supply-chain
  - title: GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류
    event_id: 7e9257b6dba23518
    review_status: verified
    published_at: 2026-07-28
    reviewed_at: 2026-10-05
    concept_ids:
      - supply-chain
---

# 이번 호 표지

GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영

# 차례

- GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영
- GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류

# 커버 스토리

없음

# 뉴스 데스크

## GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub, OpenSSF

GitHub는 7월 28일 OpenSSF malicious-packages 저장소의 악성 패키지 보고를 Advisory Database에 자동 반영하기 시작했다고 발표했다. npm과 PyPI 등을 포함해 경보 범위가 넓어졌으며, Malware alerts를 켠 저장소의 의존성이 등록된 악성 패키지 정보와 일치하면 Dependabot 경보를 받는다. [S1]

### 기능을 켜면 새 보고가 자동 반영

이미 Malware alerts를 사용 중이면 추가 설정 없이 확대된 데이터를 적용받으며, 새 보고가 게시될 때 경보가 생성된다. 처음 사용하는 경우 저장소나 조직의 Settings → Advanced security → Dependabot에서 Malware alerts를 켠다. [S1]

### 악성 패키지 보고 조회

Advisory Database에서는 type:malware 필터로 악성 패키지 보고를 확인할 수 있다. [S1]

**개념:** [[Knowledge/Software Engineering/Software Supply Chain Security]]

## GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 7월 28일 악성으로 의심되는 일부 Actions 워크플로를 실행 전에 승인 대기 상태로 보류하는 보호 조치를 발표했다. 당시 적용 대상은 github.com의 공개 저장소이며, GitHub가 별도 설정 없이 자동 적용한다. [S2]

### 승인 권한과 실행 재개

보류된 워크플로는 저장소의 쓰기 권한이 있는 협업자가 검토하고 승인할 때까지 실행되지 않는다. 승인은 인증된 웹 세션에서 제출해야 하며, 승인 뒤 워크플로가 정상적으로 계속 실행된다. [S2]

### 탈취된 계정으로 올린 자동화 코드에 대응

GitHub는 공격자가 탈취한 GitHub 자격증명으로 악성 워크플로를 올리고, CI/CD 자격증명을 훔쳐 추가 공격을 하는 사례를 배경으로 들었다. 7월 28일 발표에서 GitHub Enterprise Server는 이 보호의 적용 대상에 포함하지 않았다. [S2]

**개념:** [[Knowledge/Software Engineering/Software Supply Chain Security]]

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

- [S1] https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
- [S2] https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
