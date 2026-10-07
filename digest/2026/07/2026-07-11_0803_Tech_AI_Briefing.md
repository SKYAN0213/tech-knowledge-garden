# 2026-07-11 아침 브리핑

2026-07-11 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-11_0803_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [CodeQL 2.26.0, 시스템 프롬프트 인젝션 탐지 추가](https://skyan0213.github.io/tech-knowledge-garden/news/cd5027de226c01e4)

발표 2026-07-11

GitHub는 2026년 7월 11일(한국 시간) CodeQL 2.26.0의 Kotlin 2.4.0 지원과 JavaScript·TypeScript용 시스템 프롬프트 인젝션 탐지 쿼리를 발표했습니다. GitHub.com의 코드 스캔에는 새 버전이 자동 적용되며, GitHub Enterprise Server에는 향후 릴리스에 포함될 예정이라고 설명했습니다.

### [GitHub, 비밀정보 탐지기 이름을 탐지 방식에 맞춰 변경](https://skyan0213.github.io/tech-knowledge-garden/news/de3b723b4c4d604c)

발표 2026-07-11

GitHub는 2026년 7월 11일(한국 시간) secret scanning에서 Non-provider patterns를 Generic patterns로, Copilot secret scanning을 AI-detected secrets로 바꾼다고 발표했습니다. 탐지 동작은 그대로이며, webhook·감사 로그 이벤트와 REST API에도 변경이 없다고 설명했습니다.

### [GitHub, 다중 사용자 예산을 페이지별로 조회하는 API 추가](https://skyan0213.github.io/tech-knowledge-garden/news/b94c58885676c1b2)

발표 2026-07-11

GitHub는 2026년 7월 11일(한국 시간) 다중 사용자 예산의 사용자별 사용량과 할당 한도를 페이지 단위로 조회하는 REST API 엔드포인트를 추가했습니다. GitHub Enterprise Cloud의 엔터프라이즈 소유자와 청구 관리자가 사용할 수 있으며, 엔터프라이즈 전체 사용자 예산과 비용센터에 한정된 사용자별 예산 모두를 지원합니다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 3건

#### [CodeQL 2.26.0, 시스템 프롬프트 인젝션 탐지 추가](https://skyan0213.github.io/tech-knowledge-garden/news/cd5027de226c01e4)

발표 2026-07-11

제품·서비스 · 기능 추가 · GitHub

GitHub는 2026년 7월 11일(한국 시간) CodeQL 2.26.0의 Kotlin 2.4.0 지원과 JavaScript·TypeScript용 시스템 프롬프트 인젝션 탐지 쿼리를 발표했습니다. GitHub.com의 코드 스캔에는 새 버전이 자동 적용되며, GitHub Enterprise Server에는 향후 릴리스에 포함될 예정이라고 설명했습니다.

##### 사용자 입력이 시스템 지시문으로 흐르는 경로 탐지

js/system-prompt-injection은 신뢰하지 않는 사용자 입력이 AI 모델의 시스템 프롬프트로 들어가는 코드 경로를 찾습니다. 탐지 대상은 공격자가 이 입력 경로를 통해 모델의 행동을 바꾸는 경우입니다.

OpenAI, Anthropic, Google GenAI SDK의 프롬프트 입력 지점도 분석 대상으로 추가했습니다. Sora의 프롬프트, OpenAI Realtime의 세션 지시문, Anthropic의 구형 completion 프롬프트, Google GenAI의 캐시된 콘텐츠와 시스템 지시문이 포함됩니다.

##### C#·Go의 데이터 흐름 모델 보강

C\#에서는 Razor Page의 OnGet·OnPost·OnPostAsync 같은 처리 함수의 인수를 외부 입력의 출발점으로 인식합니다. 해당 인수를 거치는 취약점 경로를 보안 쿼리로 검사할 수 있습니다.

Go에서는 1.21에 도입된 log/slog 패키지의 함수와 Logger 메서드를 분석합니다. go/log-injection과 go/clear-text-logging 쿼리가 해당 로깅 코드의 문제를 찾도록 모델을 추가했습니다.

[GitHub 원문](https://github.blog/changelog/2026-07-10-codeql-2-26-0-adds-kotlin-2-4-0-support-and-ai-prompt-injection-detection)

#### [GitHub, 비밀정보 탐지기 이름을 탐지 방식에 맞춰 변경](https://skyan0213.github.io/tech-knowledge-garden/news/de3b723b4c4d604c)

발표 2026-07-11

제품·서비스 · 명칭 변경 · GitHub

GitHub는 2026년 7월 11일(한국 시간) secret scanning에서 Non-provider patterns를 Generic patterns로, Copilot secret scanning을 AI-detected secrets로 바꾼다고 발표했습니다. 탐지 동작은 그대로이며, webhook·감사 로그 이벤트와 REST API에도 변경이 없다고 설명했습니다.

##### 발급 주체와 탐지 방식을 구분하는 이름

Provider secrets는 AWS 키나 Stripe 토큰처럼 특정 서비스가 발급한 비밀정보입니다. Generic secrets는 특정 서비스에 속하지 않는 개인 키·연결 문자열·비밀번호 등을 가리킵니다.

Patterns는 정규식에 엔트로피 분석 같은 검사를 결합해 일정한 구조가 있는 비밀정보를 찾습니다. 서비스별 키를 찾는 provider patterns와 개인 키·연결 문자열을 찾는 generic patterns가 여기에 포함됩니다.

AI-detected secrets는 주변 코드의 맥락을 읽어 비밀번호처럼 일정한 형식이 없는 generic secret을 찾습니다.

##### 기존 문서 링크는 유지

GitHub는 문서의 용어를 갱신하고 리다이렉트를 추가해 기존 문서 링크를 계속 사용할 수 있게 했다고 밝혔습니다.

[GitHub 원문](https://github.blog/changelog/2026-07-10-clearer-names-for-secret-scanning-detector-types)

#### [GitHub, 다중 사용자 예산을 페이지별로 조회하는 API 추가](https://skyan0213.github.io/tech-knowledge-garden/news/b94c58885676c1b2)

발표 2026-07-11

제품·서비스 · 기능 추가 · GitHub

GitHub는 2026년 7월 11일(한국 시간) 다중 사용자 예산의 사용자별 사용량과 할당 한도를 페이지 단위로 조회하는 REST API 엔드포인트를 추가했습니다. GitHub Enterprise Cloud의 엔터프라이즈 소유자와 청구 관리자가 사용할 수 있으며, 엔터프라이즈 전체 사용자 예산과 비용센터에 한정된 사용자별 예산 모두를 지원합니다.

##### 사용률 필터·정렬과 개별 한도 확인

지정한 사용률 이상인 사용자를 필터링하거나 특정 사용자만 조회할 수 있습니다. 결과는 각 사용자의 사용량을 기준으로 정렬할 수 있습니다.

사용자에게 개별 예산 조정이 적용되어 실제 한도가 달라진 경우도 표시합니다. 여러 사용자의 현황을 하나의 엔드포인트에서 조회하되 결과는 페이지별로 받습니다.

[GitHub 원문](https://github.blog/changelog/2026-07-10-per-user-states-for-multi-user-budgets-in-the-rest-api)
