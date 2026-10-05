# 2026-07-29 아침 브리핑

2026-07-29 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-29_0801_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영](https://skyan0213.github.io/tech-knowledge-garden/news/1618822b0726a28a)

발표 2026-07-28

GitHub는 7월 28일 OpenSSF malicious-packages 저장소의 악성 패키지 보고를 Advisory Database에 자동 반영하기 시작했다고 발표했다. npm과 PyPI 등을 포함해 경보 범위가 넓어졌으며, Malware alerts를 켠 저장소의 의존성이 등록된 악성 패키지 정보와 일치하면 Dependabot 경보를 받는다.

### [GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류](https://skyan0213.github.io/tech-knowledge-garden/news/7e9257b6dba23518)

발표 2026-07-28

GitHub는 7월 28일 악성으로 의심되는 일부 Actions 워크플로를 실행 전에 승인 대기 상태로 보류하는 보호 조치를 발표했다. 당시 적용 대상은 github.com의 공개 저장소이며, GitHub가 별도 설정 없이 자동 적용한다.

## 분야별 브리핑

### 사이버보안 · 2건

#### [GitHub, OpenSSF 악성 패키지 정보를 Dependabot 경보에 자동 반영](https://skyan0213.github.io/tech-knowledge-garden/news/1618822b0726a28a)

발표 2026-07-28

제품·서비스 · 기능 추가 · GitHub · OpenSSF

GitHub는 7월 28일 OpenSSF malicious-packages 저장소의 악성 패키지 보고를 Advisory Database에 자동 반영하기 시작했다고 발표했다. npm과 PyPI 등을 포함해 경보 범위가 넓어졌으며, Malware alerts를 켠 저장소의 의존성이 등록된 악성 패키지 정보와 일치하면 Dependabot 경보를 받는다.

##### 기능을 켜면 새 보고가 자동 반영

이미 Malware alerts를 사용 중이면 추가 설정 없이 확대된 데이터를 적용받으며, 새 보고가 게시될 때 경보가 생성된다. 처음 사용하는 경우 저장소나 조직의 Settings → Advanced security → Dependabot에서 Malware alerts를 켠다.

##### 악성 패키지 보고 조회

Advisory Database에서는 type:malware 필터로 악성 패키지 보고를 확인할 수 있다.

[GitHub 원문](https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/)

#### [GitHub Actions, 악성 의심 워크플로를 승인 전 실행 보류](https://skyan0213.github.io/tech-knowledge-garden/news/7e9257b6dba23518)

발표 2026-07-28

제품·서비스 · 기능 추가 · GitHub

GitHub는 7월 28일 악성으로 의심되는 일부 Actions 워크플로를 실행 전에 승인 대기 상태로 보류하는 보호 조치를 발표했다. 당시 적용 대상은 github.com의 공개 저장소이며, GitHub가 별도 설정 없이 자동 적용한다.

##### 승인 권한과 실행 재개

보류된 워크플로는 저장소의 쓰기 권한이 있는 협업자가 검토하고 승인할 때까지 실행되지 않는다. 승인은 인증된 웹 세션에서 제출해야 하며, 승인 뒤 워크플로가 정상적으로 계속 실행된다.

##### 탈취된 계정으로 올린 자동화 코드에 대응

GitHub는 공격자가 탈취한 GitHub 자격증명으로 악성 워크플로를 올리고, CI/CD 자격증명을 훔쳐 추가 공격을 하는 사례를 배경으로 들었다. 7월 28일 발표에서 GitHub Enterprise Server는 이 보호의 적용 대상에 포함하지 않았다.

[GitHub 원문](https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/)
