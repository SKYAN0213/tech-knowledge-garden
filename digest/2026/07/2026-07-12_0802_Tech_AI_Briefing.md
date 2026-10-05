# 2026-07-12 아침 브리핑

2026-07-12 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-12_0802_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정](https://skyan0213.github.io/tech-knowledge-garden/news/18f464ca2bf3c740)

발표 2026-07-12

Vercel AI SDK의 Groq 연동 패키지 @ai-sdk/groq가 한국시간 7월 12일 4.0.8과 3.0.51 패치 버전을 GitHub에 공개했다. 두 버전은 캐시에서 읽은 입력 토큰이 일반 입력 토큰과 구분되지 않던 사용량 표기 오류를 수정했다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 1건

#### [Vercel AI SDK, Groq 캐시 입력 토큰을 사용량에 반영하도록 수정](https://skyan0213.github.io/tech-knowledge-garden/news/18f464ca2bf3c740)

발표 2026-07-12

제품·서비스 · 기능 추가 · @ai-sdk/groq · Groq

Vercel AI SDK의 Groq 연동 패키지 @ai-sdk/groq가 한국시간 7월 12일 4.0.8과 3.0.51 패치 버전을 GitHub에 공개했다. 두 버전은 캐시에서 읽은 입력 토큰이 일반 입력 토큰과 구분되지 않던 사용량 표기 오류를 수정했다.

##### 캐시 사용량 필드의 연결

기존 convertGroqUsage는 Groq 응답의 prompt_tokens_details.cached_tokens를 전달받아도 읽지 않아 cacheRead를 undefined로 두고 입력 토큰 전체를 noCache로 기록했다. 수정 후에는 캐시 입력 토큰을 usage.cachedInputTokens와 cacheRead에 반영하고, 그만큼을 noCache에서 뺀다.

##### cacheWrite 값의 처리

SDK 릴리스 설명에 따르면 Groq에는 캐시 생성 과금이 없어 cacheWrite는 undefined로 유지된다.

[github.com 원문](https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%404.0.8) · [github.com 원문](https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%403.0.51)
