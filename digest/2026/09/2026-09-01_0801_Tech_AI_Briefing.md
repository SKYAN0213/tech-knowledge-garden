# 2026-09-01 아침 브리핑

2026-09-01 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-01_0801_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개](https://skyan0213.github.io/tech-knowledge-garden/news/09a390c59d8969e0)

발표 2026-08-31

Google Research는 8월 31일 3억 3천만 매개변수의 다변량 시계열 예측 모델 TimesFM-3를 공개했다. 여러 목표 시계열을 함께 예측하고, 과거에만 알 수 있는 변수와 예정 행사처럼 미래 구간에도 알려진 변수를 입력으로 받는다. 모델은 GitHub와 Hugging Face에서 제공하며, BigQuery 통합은 발표 당시 향후 몇 주 내 제공할 계획이라고 밝혔다.

### [Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대](https://skyan0213.github.io/tech-knowledge-garden/news/89b2997d0ccfa477)

업데이트 2026-08-31

Google은 8월 31일 업데이트에서 Search Console의 생성형 검색 제어와 인사이트 기능을 전 세계 모든 웹사이트로 확대했다고 밝혔다. 사이트 운영자는 자신의 콘텐츠와 링크가 AI Overviews·AI Mode 등의 응답 근거로 쓰일지 선택할 수 있다. 인사이트에서는 생성형 AI 검색의 노출 지표, AI 응답에 나타나는 페이지, 노출 국가 정보를 확인할 수 있다.

## 분야별 브리핑

### AI · 2건

#### [Google, 여러 시계열과 미래 변수를 함께 쓰는 TimesFM-3 공개](https://skyan0213.github.io/tech-knowledge-garden/news/09a390c59d8969e0)

발표 2026-08-31

연구·기술 · 새로운 방법 · Google

Google Research는 8월 31일 3억 3천만 매개변수의 다변량 시계열 예측 모델 TimesFM-3를 공개했다. 여러 목표 시계열을 함께 예측하고, 과거에만 알 수 있는 변수와 예정 행사처럼 미래 구간에도 알려진 변수를 입력으로 받는다. 모델은 GitHub와 Hugging Face에서 제공하며, BigQuery 통합은 발표 당시 향후 몇 주 내 제공할 계획이라고 밝혔다.

##### 시간의 흐름과 변수 사이의 관계를 함께 처리

연속된 32개 시점의 값을 패치라는 묶음으로 만들고, 크기가 다른 시계열을 다루기 위해 각 시계열을 정규화한다.

시간 방향의 어텐션은 같은 시계열의 과거 토큰만 보고, 변수 방향의 어텐션은 같은 시점의 다른 시계열을 본다. 두 어텐션을 번갈아 적용한다.

미래 예측 구간에서 목표값과 과거에만 알 수 있는 변수는 가리고, 미리 알려진 미래 변수는 그대로 둔다. 전체 예측 구간은 반복 생성하지 않고 한 번의 순전파로 계산한다.

##### 9개 분위수 출력과 공개 벤치마크 비교

각 목표 시계열의 미래 시점마다 10\~90백분위에 해당하는 9개 분위수를 출력한다.

개발팀은 Gift-Eval·FEV-Bench·Time에서 비교한 사전학습 기반 모델 중 점 예측과 확률 예측의 평균 순위가 가장 좋았다고 보고했다.

[Google 원문](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)

#### [Google, 생성형 검색 제어·노출 정보를 전 세계 웹사이트로 확대](https://skyan0213.github.io/tech-knowledge-garden/news/89b2997d0ccfa477)

업데이트 2026-08-31

제품·서비스 · 기능 추가 · Google

Google은 8월 31일 업데이트에서 Search Console의 생성형 검색 제어와 인사이트 기능을 전 세계 모든 웹사이트로 확대했다고 밝혔다. 사이트 운영자는 자신의 콘텐츠와 링크가 AI Overviews·AI Mode 등의 응답 근거로 쓰일지 선택할 수 있다. 인사이트에서는 생성형 AI 검색의 노출 지표, AI 응답에 나타나는 페이지, 노출 국가 정보를 확인할 수 있다.

##### 생성형 검색에서 제외했을 때의 적용 범위

Google은 이 제어에서 제외한 사이트가 생성형 AI 기능의 트래픽과 노출을 받지 않는다고 밝혔다. 이 제어 자체를 생성형 기능 밖의 일반 검색 결과 순위를 판단하는 신호로 사용하지 않는다고 설명했다.

[Google 원문](https://blog.google/products-and-platforms/products/search/new-controls-website-owners/)
