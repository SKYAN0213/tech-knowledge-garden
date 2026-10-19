# 2026-06-29 아침 브리핑

2026-06-29 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/06/2026-06-29_1204_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GLM-5.2 보안 평가 공개…IDOR 탐지 F1 39%, 조사 과제 28/59](https://skyan0213.github.io/tech-knowledge-garden/news/946d307c203886f8)

발표 2026-06-29

The Verge는 2026년 6월 29일(한국시간) Z.ai의 GLM-5.2가 일부 버그 탐지·사이버보안 과제에서 상용 모델과의 격차를 줄였다는 연구자 평가를 보도했다. 관련 평가에서는 코드의 접근 권한 누락을 찾는 과제와 보안 조사 과제를 각각 시험했다.

## 분야별 브리핑

### AI · 1건

#### [GLM-5.2 보안 평가 공개…IDOR 탐지 F1 39%, 조사 과제 28/59](https://skyan0213.github.io/tech-knowledge-garden/news/946d307c203886f8)

발표 2026-06-29

연구·기술 · 실증·재현 · Z.ai · Semgrep · Graphistry

The Verge는 2026년 6월 29일(한국시간) Z.ai의 GLM-5.2가 일부 버그 탐지·사이버보안 과제에서 상용 모델과의 격차를 줄였다는 연구자 평가를 보도했다. 관련 평가에서는 코드의 접근 권한 누락을 찾는 과제와 보안 조사 과제를 각각 시험했다.

##### IDOR 탐지: 무엇을 찾아 어떤 조건으로 비교했나

Semgrep의 IDOR 탐지 평가에서 GLM-5.2는 F1 39%를 기록했다. 같은 데이터셋·평가 방식·시스템 프롬프트를 사용하고 모델과 실행 도구를 달리한 실험이다.

GLM-5.2는 Pydantic AI에서 프롬프트와 코드만 받았다. Semgrep의 전용 도구는 접근 지점을 열거하고 관련 코드로 모델을 안내했으며, 그 구성의 F1은 53\~61%였다.

IDOR는 요청에 들어 있는 사용자·객체 식별자를 사용하면서 그 객체에 대한 접근 권한을 확인하지 않는 취약점이다. 식별자만 바꿔 다른 사용자의 데이터를 읽을 수 있는 상황이 이에 해당한다. F1은 탐지 결과 중 실제 취약점의 비율인 정밀도와, 실제 취약점 중 찾아낸 비율인 재현율을 조화평균한 지표다.

##### 보안 조사: 모델·실행 도구·제공 환경

Graphistry는 6월 23일 공개한 보안 조사 평가에서 OpenCode·Fireworks AI로 실행한 GLM-5.2가 59개 과제 중 28개를 해결했다고 밝혔다. 같은 글의 Louie·Opus 구성은 35개를 해결했으며 실행 도구도 달랐다.

##### 공식 모델 구조: 긴 문맥과 계산량 조절

Z.ai는 GLM-5.2를 100만 토큰 문맥을 지원하는 장기 작업용 모델로 설명한다. 공식 설명의 IndexShare는 네 개 Transformer 층에서 하나의 인덱서를 공유해 희소 어텐션 계산을 줄이는 구조다.

Z.ai는 긴 코드 작업에 맞춘 학습, 추론 강도 선택, KV 캐시·메모리 처리 최적화를 함께 설명했다.

[theverge.com 원문](https://www.theverge.com/ai-artificial-intelligence/958804/chinas-z-ai-glm-52-mythos-cybersecurity) · [semgrep.dev 원문](https://semgrep.dev/blog/2026/we-have-mythos-at-home-glm-52-beats-claude-in-our-cyber-benchmarks/) · [graphistry.com 원문](https://www.graphistry.com/blog/glm-5-2-cybersecurity-open-model) · [z.ai 원문](https://z.ai/blog/glm-5.2) · [raw.githubusercontent.com 원문](https://raw.githubusercontent.com/zai-org/GLM-5/main/README.md)
