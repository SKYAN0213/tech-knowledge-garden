# 2026-07-14 아침 브리핑

2026-07-14 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-14_0002_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가](https://skyan0213.github.io/tech-knowledge-garden/news/661912ab39baa4f1)

발표 2026-07-13

OpenAI는 7월 13일 19시 49분(한국시각) GitHub에 Codex 0.145.0-alpha.7 시험판을 공개했다. 공식 변경 자료에는 Max·Ultra 추론 선택 경고와 다중 에이전트의 모델·추론 수준 지정 기능이 담겼다. 현재 다중 에이전트 백엔드와 맞지 않는 모델은 선택 목록에서 제외하고 실행 요청도 거부한다.

## 분야별 브리핑

### AI · 1건

#### [Codex 시험판, 고급 추론 선택 경고와 에이전트 모델 지정 추가](https://skyan0213.github.io/tech-knowledge-garden/news/661912ab39baa4f1)

발표 2026-07-13

제품·서비스 · 기능 추가

OpenAI는 7월 13일 19시 49분(한국시각) GitHub에 Codex 0.145.0-alpha.7 시험판을 공개했다. 공식 변경 자료에는 Max·Ultra 추론 선택 경고와 다중 에이전트의 모델·추론 수준 지정 기능이 담겼다. 현재 다중 에이전트 백엔드와 맞지 않는 모델은 선택 목록에서 제외하고 실행 요청도 거부한다.

##### Max·Ultra 선택과 Ultra 적용 범위

Max와 Ultra는 일반 추론 단계와 분리된 More reasoning… 항목에서 경고와 설명을 거쳐 고른다. 공식 변경 설명은 두 수준이 일반 추론보다 사용 한도를 더 빨리 소모한다고 명시했다.

단축키가 고급 단계로 조용히 넘어가지 않도록 했다. Ultra는 현재 대화에 적용해 새 대화의 기본값을 바꾸지 않으며, 모드 전환과 대화 재개에서도 설정을 유지한다.

##### 에이전트별 모델 지정과 허용 조건

다중 에이전트 v2의 spawn\_agent는 기본 설정에서 model과 reasoning\_effort를 노출한다. features.multi\_agent\_v2.expose\_spawn\_agent\_model\_overrides 설정으로 이 기능을 독립적으로 끌 수 있으며, 다른 spawn 메타정보가 숨겨져도 모델 지정 기능은 유지된다.

모델과 추론 수준을 지정할 때는 명시적 허가와 부분 문맥 또는 문맥 없는 fork에서 사용하라는 지침이 적용된다.

호환성 검사는 현재 다중 에이전트 백엔드를 기준으로 한다. 오류 메시지의 대안 제안도 선택기에 표시되는 호환 모델로 제한한다.

[api.github.com 원문](https://api.github.com/repos/openai/codex/compare/rust-v0.145.0-alpha.4...rust-v0.145.0-alpha.7) · [api.github.com 원문](https://api.github.com/repos/openai/codex/releases/tags/rust-v0.145.0-alpha.7)
