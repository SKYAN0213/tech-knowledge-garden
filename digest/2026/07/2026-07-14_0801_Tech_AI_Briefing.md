# 2026-07-14 아침 브리핑

2026-07-14 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-14_0801_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [AI SDK, 음성 전사 취소와 도구 호출 추적 수정](https://skyan0213.github.io/tech-knowledge-garden/news/6c31b0895d6be835)

발표 2026-07-14

AI SDK의 ai 패키지는 7월 14일(한국시각) 7.0.23·7.0.25·7.0.26 패치를 공개했다. 7.0.25에서는 스트리밍 음성 전사를 취소할 때 아직 준비 중인 doStream 작업도 중단하도록 고쳤다. 나머지 두 패치는 embedMany의 추적 문맥과 승인 후 도구 호출의 상위 span 연결을 수정했다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 1건

#### [AI SDK, 음성 전사 취소와 도구 호출 추적 수정](https://skyan0213.github.io/tech-knowledge-garden/news/6c31b0895d6be835)

발표 2026-07-14

제품·서비스 · 기능 추가

AI SDK의 ai 패키지는 7월 14일(한국시각) 7.0.23·7.0.25·7.0.26 패치를 공개했다. 7.0.25에서는 스트리밍 음성 전사를 취소할 때 아직 준비 중인 doStream 작업도 중단하도록 고쳤다. 나머지 두 패치는 embedMany의 추적 문맥과 승인 후 도구 호출의 상위 span 연결을 수정했다.

##### 7.0.25: 음성 전사 준비 단계까지 취소

experimental\_streamTranscribe의 fullStream을 취소하면 아직 완료되지 않은 doStream 준비도 중단한다. doStream이 완료되기 전에 취소한 작업이 남는 문제를 수정했다. gateway 문자열 모델 ID가 스트리밍 전사를 지원할 수 있다는 점을 반영해 unsupported-model 오류 메시지도 바꿨다.

##### 7.0.23·7.0.26: 실행 추적 문맥 연결

7.0.23은 embedMany를 tracing channel context 안에서 처리하도록 변경했다. 7.0.26은 도구 승인 뒤 상위 연결을 잃은 도구 호출을 parent span 아래 묶도록 했다.

##### 함께 갱신한 의존성

7.0.23에서는 @ai-sdk/gateway를 4.0.17로 갱신했다. 7.0.25에서는 @ai-sdk/provider-utils가 5.0.9, @ai-sdk/gateway가 4.0.19로 바뀌었다.

[github.com 원문](https://github.com/vercel/ai/releases/tag/ai%407.0.23) · [github.com 원문](https://github.com/vercel/ai/releases/tag/ai%407.0.25) · [github.com 원문](https://github.com/vercel/ai/releases/tag/ai%407.0.26)
