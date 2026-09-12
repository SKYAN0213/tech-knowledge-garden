---
title: Tech & AI Briefing Sample - 17:00
date: 2026-06-23
time: 17:00
timezone: Asia/Seoul
status: sample
coverage_start: 2026-06-23 07:00
coverage_end: 2026-06-23 17:00
type: briefing
source_count: 10
new_items_count: 6
linked_knowledge_notes:
  - AI Agents
  - AI Agent Security and Governance
  - Agent Evaluation and Observability
  - Retrieval-Augmented Generation
  - Model Context Protocol
  - AI-Assisted Security Engineering
tags:
  - AI
  - TechBriefing
  - Obsidian
---

# Tech & AI Briefing Sample - 17:00

> 이 문서는 최신 변화의 입구입니다.  
> 오래 남길 개념과 기술 설명은 연결된 지식 노트에서 관리합니다.

## 1. 결론 먼저

이번 샘플 구간에서 가장 중요한 흐름은 **AI 에이전트가 "답변하는 모델"에서 "권한을 가진 소프트웨어 시스템"으로 다뤄지기 시작했다**는 점입니다.

그래서 앞으로 브리핑은 단순히 "어떤 회사가 무엇을 발표했다"가 아니라 다음 세 가지를 함께 봅니다.

1. 어떤 기술 변화가 새로 나왔는가
2. 그 변화가 실제 개발, 보안, 업무 자동화에 어떤 영향을 주는가
3. 이 변화가 기존 지식 노트 중 어디에 연결되는가

## 2. 신규 변화 요약

| 중요도 | 신규 변화 | 구체적 의미 | 연결 지식 |
|---|---|---|---|
| 높음 | 에이전트 보안 논의가 권한, 도구, 감사 로그 중심으로 이동 | AI가 외부 도구를 호출하면 모델 안전성만으로는 부족함 | [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]] |
| 높음 | Agent BOM, AI BOM, Skill BOM 같은 명세 개념이 등장 | 에이전트가 무엇에 접근하고 무엇을 실행하는지 목록화해야 함 | [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]] |
| 높음 | 에이전트 운영에서 observability가 기본 요건으로 부상 | 실패 원인이 코드가 아니라 추론 과정일 수 있어 trace가 중요함 | [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]] |
| 중간 | RAG와 MCP의 역할 구분이 더 중요해짐 | RAG는 지식 검색, MCP는 도구와 시스템 연결에 가까움 | [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]] / [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]] |
| 중간 | AI 보안 자동화가 취약점 탐지에서 패치 검증까지 확장 | 보안팀의 병목은 알림보다 재현 가능한 수정으로 이동 | [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]] |
| 중간 | 에이전트 논문 큐레이션이 Memory, Tooling, Eval, Security로 분화 | 논문 수집보다 주제별 지식화가 더 중요함 | [[Knowledge/AI Systems/AI Agents|AI Agents]] |

## 3. 자세히 볼 변화

### 3.1 에이전트는 이제 "모델"보다 "권한 있는 시스템"에 가깝다

최근 에이전트 보안 논의에서 반복적으로 나오는 질문은 "모델이 안전한가?"보다 훨씬 구체적입니다.

- 이 에이전트가 어떤 파일을 읽을 수 있는가
- 어떤 API나 MCP 서버에 연결되어 있는가
- 브라우저, 터미널, GitHub, 캘린더 같은 도구를 호출할 수 있는가
- 사람이 승인하지 않아도 파일을 만들거나 수정할 수 있는가
- 실행 과정이 trace로 남는가

예를 들어 Obsidian 브리핑 자동화도 에이전트입니다. 이 자동화는 웹에서 자료를 찾고, 파일을 만들고, 기존 지식 노트와 연결합니다. 따라서 "글을 잘 쓰는가"뿐 아니라 **쓰기 권한이 어느 폴더로 제한되어 있는지**, **이전 브리핑과 중복을 어떻게 피하는지**, **출처가 약한 내용을 어떻게 제외하는지**가 중요합니다.

관련 지식: [[Knowledge/AI Systems/AI Agents|AI Agents]], [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]

### 3.2 Agent BOM은 에이전트 시대의 "부품 명세서" 역할을 한다

소프트웨어 보안에서는 SBOM이 널리 쓰입니다. SBOM은 어떤 라이브러리와 의존성이 들어 있는지 기록한 목록입니다. AI 시스템에서는 AI BOM, Model BOM, Agent BOM 같은 개념이 확장되고 있습니다.

Agent BOM에서 봐야 할 항목은 다음과 같습니다.

| 항목 | 확인 질문 | 브리핑 자동화 예시 |
|---|---|---|
| 데이터 접근 | 무엇을 읽는가 | 공식 발표, arXiv, Hugging Face, GitHub, 기존 Obsidian 노트 |
| 쓰기 권한 | 무엇을 바꾸는가 | `Briefings/`, `Knowledge/` 아래 Markdown 생성 |
| 도구 연결 | 어떤 도구를 호출하는가 | 웹 검색, 파일 작성, 필요 시 GitHub/Hugging Face 확인 |
| 기억 | 무엇을 누적하는가 | 이전 브리핑, 지식 노트, 사용자 선호 |
| 감사 가능성 | 나중에 검토 가능한가 | 출처 링크, 생성 시간, coverage window, 제외 항목 |

이 개념은 아직 표준이 완전히 굳은 것은 아니지만, CycloneDX 쪽에서도 agent BOM 구성 요소 논의가 있고, 연구 쪽에서는 agentic AI skill의 supply chain을 분석하는 방향이 나오고 있습니다.

관련 지식: [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]

### 3.3 Observability는 에이전트 운영의 기본 안전장치가 되고 있다

LangChain의 State of Agent Engineering에 따르면, agent observability 도입은 eval adoption보다 더 빠르게 퍼지고 있습니다. 이 신호가 중요한 이유는 명확합니다. 에이전트는 한 번의 함수 호출처럼 실패하지 않습니다. 검색, 판단, 도구 호출, 중간 요약, 재시도, 파일 수정 같은 여러 단계를 거칩니다.

기존 소프트웨어 오류는 stack trace로 추적할 수 있지만, 에이전트 오류는 다음처럼 나타납니다.

- 처음 검색한 출처가 부정확했다
- 중간 요약에서 중요한 조건을 빠뜨렸다
- 잘못된 도구를 선택했다
- 비용이 높은 루프에 빠졌다
- 사용자의 승인 없이 너무 많은 변경을 시도했다

그래서 에이전트 운영에서는 trace, tool call log, intermediate reasoning summary, evaluation set이 함께 필요합니다.

관련 지식: [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]

### 3.4 RAG와 MCP는 비슷해 보이지만 역할이 다르다

최근 AI 개발 글에서 RAG, MCP, Agentic AI가 자주 함께 등장합니다. 하지만 세 개는 같은 개념이 아닙니다.

| 개념 | 한 줄 설명 | 브리핑 자동화에서의 역할 |
|---|---|---|
| RAG | 문서나 DB를 검색해 답변 근거로 쓰는 방식 | 기존 Obsidian 지식 노트와 새 소식을 연결 |
| MCP | 모델이 외부 도구와 데이터를 표준 방식으로 연결하는 프로토콜 | 검색, 파일, 캘린더, GitHub 같은 도구 연결 |
| Agentic AI | 목표를 받고 여러 도구를 사용해 작업을 수행하는 시스템 | 07:00/17:00 브리핑 생성 자동화 자체 |

쉽게 말하면 RAG는 "무엇을 알고 답할 것인가"에 가깝고, MCP는 "어떤 도구와 연결될 것인가"에 가깝습니다. 에이전트는 이 둘을 사용해 실제 작업을 수행합니다.

관련 지식: [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]], [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]], [[Knowledge/AI Systems/AI Agents|AI Agents]]

### 3.5 AI 보안 자동화는 "발견"보다 "수정 가능한 증거"가 중요해지고 있다

OpenAI의 Daybreak와 Patch the Planet 흐름은 보안 AI의 방향을 잘 보여줍니다. 단순히 취약점 후보를 많이 찾는 것은 유지보수자에게 부담을 줄 수 있습니다. 실제로 필요한 것은 다음입니다.

- 취약점이 발생하는 입력
- 영향을 받는 코드 경로
- 실제 공격 가능성
- 패치 초안
- 회귀 테스트
- 사람이 검토할 수 있는 보고서

따라서 앞으로 보안 AI 도구는 "몇 개 찾았는가"보다 **얼마나 재현 가능하고 병합 가능한 수정을 제안하는가**로 평가해야 합니다.

관련 지식: [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]]

## 4. 이번 브리핑에서 지식 노트로 승격한 항목

| 지식 노트 | 승격 이유 |
|---|---|
| [[Knowledge/AI Systems/AI Agents|AI Agents]] | 에이전트 관련 뉴스와 논문을 해석하기 위한 상위 개념 |
| [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]] | 권한, 도구, 감사 로그, Agent BOM을 함께 관리해야 함 |
| [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]] | 에이전트 운영 품질을 판단하는 핵심 기준 |
| [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]] | Obsidian 지식 창고화의 검색 기반 개념 |
| [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]] | 에이전트와 외부 도구 연결을 이해하는 핵심 프로토콜 |
| [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]] | 보안 자동화와 패치 자동화를 장기 추적할 주제 |

## 5. 제외하거나 보류한 것

| 항목 | 처리 | 이유 |
|---|---|---|
| 단순 전망형 AI 트렌드 글 | 제외 | 기술 사례나 구현 근거가 약함 |
| 출처가 SNS 요약뿐인 주장 | 보류 | 원문 확인 전까지 지식 노트에 반영하지 않음 |
| 오래된 MCP/RAG 비교 글 | 부분 참고 | 개념 설명에는 유용하지만 최신 변화로 보기는 어려움 |
| 기업 홍보성 agent framework 비교 | 부분 참고 | 체크리스트로는 쓸 수 있으나 독립 근거로는 약함 |

## 6. 다음 브리핑에서 추적할 질문

- Agent BOM이나 AI BOM이 실제 표준 형식으로 굳어지는가
- MCP 서버 보안, 권한 스코프, 인증 방식에 대한 실무 가이드가 나오는가
- 에이전트 평가가 단순 성공률을 넘어 비용, 안정성, 보안까지 포함하는가
- 보안 AI 도구가 실제 오픈소스 프로젝트에 패치를 병합시키는 사례가 늘어나는가
- RAG 기반 지식베이스가 최신성 문제를 어떻게 해결하는가

## 참고 링크

- [LangChain - State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering)
- [LangChain - Agent observability and evaluation](https://www.langchain.com/blog/agent-observability-powers-agent-evaluation)
- [LangChain - AI agent frameworks in 2026](https://www.langchain.com/resources/ai-agent-frameworks)
- [Hugging Face Blog](https://huggingface.co/blog)
- [Hugging Face Papers](https://huggingface.co/papers)
- [Hugging Face - Awesome AI Agent Papers dataset](https://huggingface.co/datasets/molmohsen/awesome-ai-agent-papers)
- [arXiv - Formal Analysis and Supply Chain Security for Agentic AI Skills](https://arxiv.org/html/2603.00195v1)
- [arXiv - Reframing LLM Agent Security as an Agent-Human Interaction Problem](https://arxiv.org/html/2605.24309v1)
- [CycloneDX - Agent Bill of Materials discussion](https://github.com/CycloneDX/specification/issues/895)
- [OpenAI - Daybreak](https://openai.com/index/daybreak-securing-the-world/)
- [OpenAI - Patch the Planet](https://openai.com/index/patch-the-planet/)
- [Hugging Face - What is MCP](https://huggingface.co/blog/Kseniase/mcp)
