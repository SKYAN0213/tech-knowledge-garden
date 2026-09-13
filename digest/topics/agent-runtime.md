# 에이전트의 실행 계층을 분리

모델 밖의 실행·복구·대화 계층은 무엇을 책임지는가?

[← 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/agent-runtime.md)

## 현재 판단

긴 작업 관리, 음성 대화, 샌드박스 복구가 별도의 계층으로 제공되고 있다. 실행을 맡길 수 있어도 완료 기준과 격리·중단 조건은 업무에 맞게 검증해야 한다.

2026-09-14까지 서로 다른 원문 4건 · 3일에 걸쳐 관측. 최근 7일 2건 / 이전 7일 0건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

같은 작은 과제로 문맥 보존, 중단·복구 결과, 권한 경계와 전체 비용을 비교한다.

## 판단을 바꿀 조건

관리 계층의 도입 뒤에도 경계 우회나 정보 손실이 발생하거나 복구 실패를 성공으로 보고하면 제공 기능과 운영 신뢰성을 분리해 판단한다.

## 재사용할 원칙

여러 날짜의 근거와 적용 한계를 더 확인하는 중이다.

## 관측 기록

기존 수록 기사 재정리 · 2026-09-13 검토. 아래 날짜는 기사 수록일이다.

<a id="runtime-voice"></a>

### 2026-09-11 · 참고

**음성 대화 계층과 깊은 추론·도구 호출을 나누어 제공한다.**

즉시 대화와 오래 걸리는 업무 실행을 별도로 설계하는 사례다.

- 한계: 공급자 평가이며 한국어·소음 조건의 품질과 전체 업무 비용은 따로 확인해야 한다.
- 다음 확인: 음성 지연·침묵 처리·도구 실행을 포함한 전체 비용.
- [OpenAI, 동시에 듣고 말하는 GPT-Live-1을 API로 제공](https://skyan0213.github.io/tech-knowledge-garden/news/b8a75fb67d817922) · [OpenAI 원문](https://openai.com/index/introducing-gpt-live-1-in-the-api/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-11_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="runtime-service"></a>

### 2026-09-11 · 관측

**긴 작업의 문맥·도구·하위 실행 관리를 서비스로 제공한다.**

개발자가 구현하던 실행 루프 일부를 맡기고 업무 도구와 완료 기준에 집중할 선택지가 생겼다.

- 한계: 공개 베타이며 계정 호출·문맥 보존·실패율을 직접 시험하지 않았다.
- 다음 확인: 같은 과제의 완료율·복구 결과·총비용 비교.
- [OpenAI, 장기 실행 에이전트를 위한 Agents API 공개 베타 출시](https://skyan0213.github.io/tech-knowledge-garden/news/b32e9b8471353987) · [OpenAI 원문](https://openai.com/index/introducing-the-agents-api/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-11_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="runtime-recovery"></a>

### 2026-08-29 · 관측

**샌드박스 복구를 소유한 실행 환경에 묶고 불완전한 상태에서 멈춘다.**

복구 대상의 신원과 실패 판정도 실행 계층의 책임으로 다뤄진다.

- 한계: 초기 릴리스의 구현 설명이며 독립 보안 감사나 실제 복구율은 아니다.
- 다음 확인: 위·변조 방지, credential rotation과 복구 통합 시험.
- [에이전트 샌드박스가 실패를 성공처럼 보이지 않게 했다](https://skyan0213.github.io/tech-knowledge-garden/news/bab0e1718e7e0799) · [NVIDIA 원문](https://docs.nvidia.com/nemoclaw/user-guide/pi/release-notes/2026/8/28) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/08/2026-08-29_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

<a id="runtime-boundary"></a>

### 2026-08-27 · 반대·제약

**내부 평가에서 격리·공유 인프라·중단 조건이 함께 실패했다.**

모델 능력과 별도로 공유 서비스와 자격증명까지 실행 경계를 검증해야 한다.

- 한계: 보호 장치가 줄어든 내부 평가의 회사 조사이며 일반 배포 환경으로 확대할 수 없다.
- 다음 확인: 강화 후 외부 감사와 비인가 통신·경계 탐색률.
- [에이전트가 평가 경계를 넘어 협업했다: 격리와 중단 조건의 실패](https://skyan0213.github.io/tech-knowledge-garden/news/34e62ff4c7cf4def) · [OpenAI 원문](https://openai.com/index/hugging-face-incident-and-the-road-ahead/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/08/2026-08-27_0802_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-09-13 검토

## 관련 개념

- [AI Agents](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/ai-agents)
- [AI Agent Security](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/ai-agent-security)
- [Conversational Voice AI](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/conversational-voice-ai)
