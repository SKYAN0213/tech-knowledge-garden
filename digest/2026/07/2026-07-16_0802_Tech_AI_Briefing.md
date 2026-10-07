# 2026-07-16 아침 브리핑

2026-07-16 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-16_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GitHub, Resend 키 탐지·VolcEngine Ark 커밋 차단 추가](https://skyan0213.github.io/tech-knowledge-garden/news/3fbe8ceb6f00f58a)

발표 2026-07-16

GitHub는 2026년 7월 16일(한국시간) Resend를 secret scanning 파트너로 추가하고 APIclub·Resend 키 탐지를 지원한다고 밝혔다. VolcEngine Ark 키가 포함된 커밋의 기본 차단 대상도 확대하고, 보안 경보 웹훅과 기업용 유출 현황 화면을 개선했다.

## 분야별 브리핑

### 사이버보안 · 1건

#### [GitHub, Resend 키 탐지·VolcEngine Ark 커밋 차단 추가](https://skyan0213.github.io/tech-knowledge-garden/news/3fbe8ceb6f00f58a)

발표 2026-07-16

제품·서비스 · 기능 추가 · 기능 변경 · GitHub · Resend · APIclub · VolcEngine

GitHub는 2026년 7월 16일(한국시간) Resend를 secret scanning 파트너로 추가하고 APIclub·Resend 키 탐지를 지원한다고 밝혔다. VolcEngine Ark 키가 포함된 커밋의 기본 차단 대상도 확대하고, 보안 경보 웹훅과 기업용 유출 현황 화면을 개선했다.

##### 발급사 통보와 커밋 차단

공개 저장소에서 노출된 Resend 키는 GitHub가 발급사에 전달하고, Resend가 키 폐기나 관리자 통지 등의 조치를 한다는 설명이다. 새 탐지 유형은 APIclub의 apiclub_api_key와 Resend의 resend_api_key다.

secret scanning이 켜진 저장소는 volcengine_ark_api_key가 포함된 커밋을 기본 push protection으로 차단한다. 무료 공개 저장소도 적용 대상에 포함된다.

##### 경보 분류와 유출 귀속

secret_scanning_alert 웹훅의 secret_category는 제공자·사용자 정의 패턴을 default로, 일반 패턴·AI 탐지 결과를 generic으로 구분한다.

기업용 public monitoring은 기업 구성원이 작성한 커밋과 검증된 도메인의 커미터 이메일을 기준으로 유출 경보 수를 나눠 보여준다. 기업 구성원 수와 검증된 도메인도 같은 화면에서 확인할 수 있다.

[GitHub 원문](https://github.blog/changelog/2026-07-15-improvements-to-secret-scanning-and-public-monitoring/)
