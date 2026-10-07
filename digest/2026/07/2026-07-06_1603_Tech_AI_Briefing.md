# 2026-07-06 아침 브리핑

2026-07-06 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-06_1603_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정](https://skyan0213.github.io/tech-knowledge-garden/news/830814f3f9f9f11b)

발표 2026-07-06

Vercel AI SDK의 Anthropic 연동 패키지 3.0.93이 2026년 7월 6일(한국시간) 공개됐다. 생각 기능을 끄는 thinking: { type: 'disabled' } 설정이 Anthropic API로 전달되도록 수정했다.

### [Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송](https://skyan0213.github.io/tech-knowledge-garden/news/c7b2e07cfca0bff5)

발표 2026-07-06

Vercel AI SDK의 OpenAI 연동 패키지 4.0.8이 2026년 7월 6일(한국시간) 공개됐다. OpenAI 채팅 요청에 포함된 인라인 이미지 파일을 base64 문자열 대신 data URL로 보내도록 바꿨다.

### [Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정](https://skyan0213.github.io/tech-knowledge-garden/news/a8d066afc8b4014f)

발표 2026-07-06

Vercel AI SDK가 2026년 7월 6일(한국시간) Anthropic AWS 연동 패키지 2.0.0을 공개했다. 처음 1.0.0으로 배포된 버전 번호를 의도했던 v2 계열에 맞춰 정정한 릴리스다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 3건

#### [Vercel AI SDK, Anthropic의 thinking 비활성화 설정 누락 수정](https://skyan0213.github.io/tech-knowledge-garden/news/830814f3f9f9f11b)

발표 2026-07-06

제품·서비스 · 오류 수정 · Anthropic

Vercel AI SDK의 Anthropic 연동 패키지 3.0.93이 2026년 7월 6일(한국시간) 공개됐다. 생각 기능을 끄는 thinking: { type: 'disabled' } 설정이 Anthropic API로 전달되도록 수정했다.

##### 요청에서 사라지던 설정

이전에는 providerOptions.anthropic.thinking = { type: 'disabled' } 값을 설정해도 스키마 검사만 통과하고 전송 요청에서는 빠졌다.

릴리스 문서는 생각 기능이 기본으로 켜진 모델에서 이 문제 때문에 작은 max\_tokens 예산을 모두 소모할 수 있었다고 설명한다.

[api.github.com 원문](https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fanthropic%403.0.93)

#### [Vercel AI SDK, OpenAI 채팅 요청의 인라인 이미지를 data URL로 전송](https://skyan0213.github.io/tech-knowledge-garden/news/c7b2e07cfca0bff5)

발표 2026-07-06

제품·서비스 · 오류 수정 · OpenAI

Vercel AI SDK의 OpenAI 연동 패키지 4.0.8이 2026년 7월 6일(한국시간) 공개됐다. OpenAI 채팅 요청에 포함된 인라인 이미지 파일을 base64 문자열 대신 data URL로 보내도록 바꿨다.



[api.github.com 원문](https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fopenai%404.0.8)

#### [Vercel AI SDK, Anthropic AWS 연동 패키지 버전을 2.0.0으로 정정](https://skyan0213.github.io/tech-knowledge-garden/news/a8d066afc8b4014f)

발표 2026-07-06

제품·서비스 · 오류 수정 · Vercel

Vercel AI SDK가 2026년 7월 6일(한국시간) Anthropic AWS 연동 패키지 2.0.0을 공개했다. 처음 1.0.0으로 배포된 버전 번호를 의도했던 v2 계열에 맞춰 정정한 릴리스다.

##### 버전 번호가 달라진 경위

프로젝트는 메이저 변경이 시작 버전 0.0.1에 적용되면서 1.0.0으로 공개됐다고 설명했다. 이번 메이저 버전 변경은 의도한 v2 계열을 반영한다.

[api.github.com 원문](https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fanthropic-aws%402.0.0)
