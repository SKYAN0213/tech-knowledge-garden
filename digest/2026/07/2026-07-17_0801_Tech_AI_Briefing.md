# 2026-07-17 아침 브리핑

2026-07-17 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-17_0801_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Google DeepMind·Isomorphic Labs, AI 감염병 예방·탐지·대응 계획 공개](https://skyan0213.github.io/tech-knowledge-garden/news/16e13c52f7cd02d4)

발표 2026-07-16

Google DeepMind와 Isomorphic Labs가 2026년 7월 16일(한국시간) 생물학적 위기에 대비하는 공동 접근법을 공개했다. 양사는 지난 12개월 동안 정부 기관·생물보안 조직·연구 그룹과 15건이 넘는 협력을 진행했다고 밝혔다. AI 모델의 생물학적 오용을 막는 절차와 정부·연구자의 감염병 대응 활용을 함께 다룬다.

### [Gemini Enterprise Agent Platform, Parallel 웹 검색·출처 인용 지원](https://skyan0213.github.io/tech-knowledge-garden/news/c74104c7d7fe52c0)

발표 2026-07-16

Google Cloud가 2026년 7월 16일 Parallel Web Systems를 Gemini Enterprise Agent Platform의 웹 근거 연결 제공자로 통합했다고 발표했다. Gemini API와 Agent Studio에서 사용할 수 있으며, Google Cloud Marketplace로 구독하고 사용량을 기존 Google Cloud 청구서에 합산한다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 1건

#### [Gemini Enterprise Agent Platform, Parallel 웹 검색·출처 인용 지원](https://skyan0213.github.io/tech-knowledge-garden/news/c74104c7d7fe52c0)

발표 2026-07-16

제품·서비스 · 기능 추가 · Parallel Web Systems · Google Cloud

Google Cloud가 2026년 7월 16일 Parallel Web Systems를 Gemini Enterprise Agent Platform의 웹 근거 연결 제공자로 통합했다고 발표했다. Gemini API와 Agent Studio에서 사용할 수 있으며, Google Cloud Marketplace로 구독하고 사용량을 기존 Google Cloud 청구서에 합산한다.

##### 검색 원문과 데이터 재사용

발표에 따르면 Parallel Search API는 자체 웹 인덱스에서 에이전트가 처리하도록 구조화한 검색 결과를 제공한다. Gemini가 질문을 분해하고 답변을 구성할 때 원문 인용 주석을 제공한다.

개발자는 프로그래밍 방식으로 검색을 호출하고, 웹 데이터를 추출·캐싱해 내부 데이터셋을 보강하거나 다른 대규모 언어 모델로 결과를 후처리할 수 있다.

민감한 워크로드를 위해 데이터 비보관(zero data retention) 옵션도 제공된다.

[developers.googleblog.com 원문](https://developers.googleblog.com/expanding-choice-in-gemini-enterprise-agent-platform-introducing-grounding-with-parallel-web-search/)

### 바이오·의료기술 · 1건

#### [Google DeepMind·Isomorphic Labs, AI 감염병 예방·탐지·대응 계획 공개](https://skyan0213.github.io/tech-knowledge-garden/news/16e13c52f7cd02d4)

발표 2026-07-16

연구·기술 · 새로운 방법 · Google DeepMind · Isomorphic Labs

Google DeepMind와 Isomorphic Labs가 2026년 7월 16일(한국시간) 생물학적 위기에 대비하는 공동 접근법을 공개했다. 양사는 지난 12개월 동안 정부 기관·생물보안 조직·연구 그룹과 15건이 넘는 협력을 진행했다고 밝혔다. AI 모델의 생물학적 오용을 막는 절차와 정부·연구자의 감염병 대응 활용을 함께 다룬다.

##### 모델 오용을 막는 절차

Google DeepMind는 Gemini 같은 모델에 위협 시나리오 분석, 평가, 위험 완화, 운영 중 감시의 4단계 안전 절차를 적용한다고 설명했다.

SynthID 워터마킹을 생물학에 응용해 DNA 합성 업체가 위험 가능성이 있는 AI 생성 서열을 가려내도록 하는 방안도 연구 중이다.

##### 병원체 감시와 대응 연구

Google DeepMind는 AlphaEvolve로 메타게놈 시퀀싱 데이터 생성·분석 알고리즘을 최적화할 수 있다고 설명했다. AlphaGenome과 단백질 기능 주석을 이용해 서열에서 병원체를 탐지하고 특성을 파악하는 방법은 탐색 중이다.

신뢰할 수 있는 연구자에게 최신 AI 시스템 접근을 제공해 기존·새로운 위협에 대응할 백신과 대응 물질 설계를 돕는다고 밝혔다.

[Google 원문](https://deepmind.google/blog/our-approach-to-bioresilience/)
