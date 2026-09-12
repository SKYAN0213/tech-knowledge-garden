---
title: AI Agents
type: knowledge
status: evergreen
created: 2026-06-23
tags:
  - AI
  - Agent
  - AIEngineering
---

# AI Agents

## 한 줄 정의

AI Agent는 목표를 받고, 필요한 정보를 찾고, 도구를 사용하고, 여러 단계를 거쳐 작업을 수행하는 AI 시스템입니다.

## 핵심 설명

일반 챗봇은 보통 사용자의 질문에 답합니다. 반면 AI Agent는 목표를 달성하기 위해 중간 계획을 세우고, 검색하거나 도구를 호출하고, 결과를 보고 다음 행동을 선택합니다.

예를 들어 "오늘 AI 기술 동향을 Obsidian에 정리해줘"라는 요청을 받으면 에이전트는 다음 단계를 수행할 수 있습니다.

1. 최신 소스 검색
2. 공식 발표와 2차 보도 구분
3. 이전 브리핑과 중복 확인
4. 중요한 개념을 기존 지식 노트와 연결
5. 새 Markdown 파일 생성
6. 출처 링크와 제외 항목 기록

## 구성 요소

| 구성 요소 | 설명 | 예시 |
|---|---|---|
| Goal | 달성해야 할 목표 | 17:00 브리핑 작성 |
| Planner | 작업 순서를 나누는 기능 | 수집, 선별, 요약, 지식 노트 연결 |
| Tools | 외부 세계와 연결되는 도구 | 웹 검색, 파일 쓰기, GitHub 조회 |
| Memory | 이전 정보와 선호를 보존하는 저장소 | 과거 브리핑, Obsidian 지식 노트 |
| Evaluator | 결과가 충분한지 확인하는 기준 | 출처 품질, 중복 여부, 설명 깊이 |
| Guardrails | 위험한 행동을 제한하는 규칙 | 파일 삭제 금지, 출처 없는 주장 제외 |

## 주요 분류

| 유형 | 설명 | 예시 |
|---|---|---|
| Research Agent | 자료를 찾아 정리 | 논문/뉴스 브리핑 |
| Coding Agent | 코드를 읽고 수정 | Codex, Copilot류 작업 |
| Workflow Agent | 반복 업무 처리 | 캘린더 정리, 문서 생성 |
| Security Agent | 취약점 탐지와 패치 보조 | 보안 스캔, 테스트 생성 |
| Multi-Agent System | 여러 에이전트가 역할 분담 | 리서처, 작성자, 검토자 분리 |

## Recent Signals

- 2026-08-07 08:02 KST 브리핑: OpenAI는 ChatGPT용 GPT-5.6 Sol의 빠른 답변과 깊은 추론 경험을 한 모델로 가까이 묶고, 사용자가 생각의 깊이를 조절하는 슬라이더를 추가했습니다. 같은 날 GitHub는 Kimi K3의 Copilot rollout을 GitHub Actions 사고 대응 중 일시 중단했습니다. agent 운영에서는 모델 선택뿐 아니라 reasoning budget, 제공자 의존성, rollout 상태, 조직별 허용 정책을 함께 관리해야 합니다.
- 2026-07-25 08:01 KST 브리핑: GitHub는 Claude Opus 5를 Copilot Pro+, Max, Business, Enterprise의 IDE, CLI, cloud agent, 웹, 모바일에 점진 제공한다고 발표했습니다. 복잡하고 긴 코딩 작업용 모델 선택지가 넓어졌지만, 사용량 기반 요금과 조직 관리자 모델 정책이 함께 적용되므로 모델 성능뿐 아니라 작업별 비용·접근 정책·회귀 검증을 운영 기준으로 관리해야 합니다. GitHub가 공개한 성능 설명은 자체 초기 시험 결과이며 독립 비교 평가는 아닙니다.
- 2026-07-14 00:02 KST 브리핑: Codex `0.145.0-alpha.7`은 `Max`와 `Ultra` 추론 수준을 별도 경고 화면 뒤로 옮기고, 다중 에이전트 v2에서 하위 에이전트별 모델과 추론 수준을 지정하되 현재 백엔드와 맞지 않는 모델은 차단하도록 바꿨습니다. 다중 에이전트 운영은 병렬 실행 자체보다 역할별 모델·비용 배정과 호환성 검증이 중요해지고 있습니다.
- 2026-07-11 00:00 KST 브리핑: GitHub Mobile은 Copilot session 목록에 active, status, repository, type, agent, sort 기준의 필터와 정렬을 추가했습니다. agent 사용 표면이 모바일까지 넓어지면서, 많은 session 중 지금 봐야 할 작업을 빨리 찾는 운영 UX가 중요해지고 있습니다.
- 2026-07-10 16:03 KST 브리핑: Claude Code v2.1.206은 `/cd` path suggestion, repo 외부 worktree 진입 확인, background agent의 업데이트 직후 백그라운드 버전 업그레이드를 추가했습니다. coding agent는 모델 선택뿐 아니라 작업 폴더, worktree 경계, background session lifecycle까지 제품 안정성의 일부로 다루고 있습니다.
- 2026-07-10 08:02 KST 브리핑: OpenAI는 GPT-5.6 family를 ChatGPT, Codex, OpenAI API에 공개하며 `ultra` 설정, Programmatic Tool Calling, multi-agent beta를 설명했습니다. GitHub도 GPT-5.6 Sol/Terra/Luna를 Copilot model picker에 추가했습니다. agent 모델 경쟁은 단일 답변보다 긴 작업, 병렬 subagent, tool coordination, 비용 대비 성공률을 중심으로 전개되고 있습니다.
- 2026-07-10 08:02 KST 브리핑: GitHub Copilot app이 모든 Copilot plan에 제공되고, JetBrains IDE에서는 Codex가 agent provider public preview로 추가됐습니다. agent 사용 표면은 별도 CLI에서 데스크톱 앱, IDE, 모바일, GitHub 웹으로 넓어지고 있습니다.
- 2026-07-10 08:02 KST 브리핑: OpenAI GPT-Live는 음성 대화 중 어려운 질문을 배경 frontier model로 넘기고 대화를 유지하는 구조를 공개했습니다. 음성 인터페이스는 단순 입력 방식이 아니라 agent에게 긴 작업을 시키고 중간에 개입하는 표면이 될 수 있습니다.

- 2026-07-07 08:04 KST 브리핑: AWS는 Amazon Nova Forge와 SageMaker HyperPod로 multi-turn RL agent를 훈련하는 event-driven pipeline을 공개했고, Claude Code v2.1.202는 dynamic workflow size 설정을 추가했습니다. agent 경쟁은 "한 번 답하기"보다 여러 단계 도구 사용, reward 환경, workflow 크기 조절, 실행 추적을 운영 단위로 다루는 방향으로 이동하고 있습니다.
- 2026-07-07 08:04 KST 브리핑: opencode v1.17.14는 connected MCP tools를 대상으로 confined orchestration scripts를 실행하는 code mode MCP adapter를 추가하고, code mode가 꺼져 있으면 `execute` tool을 숨기도록 바꿨습니다. coding agent 도구는 강력한 실행 기능을 기본 노출하기보다 모드와 권한 경계로 감싸는 제품 설계가 중요해지고 있습니다.
- 2026-07-04 16:03 KST 브리핑: Claude Code v2.1.201은 Claude Sonnet 5 session에서 harness reminder를 위해 mid-conversation system role을 더 이상 쓰지 않도록 바꿨습니다. coding agent 제품은 모델 성능뿐 아니라 session 안에서 실행 규칙과 운영 안내를 어떤 역할과 형식으로 전달하는지까지 안정화하는 단계로 들어가고 있습니다.
- 2026-07-04 08:02 KST 브리핑: Claude Code v2.1.200은 기본 권한 모드를 Manual로 명확히 맞추고, AskUserQuestion 대화가 기본적으로 자동 계속되지 않도록 바꿨습니다. coding agent 제품은 사용자 승인, idle timeout, permission mode 같은 작은 기본값이 실제 권한 경계와 신뢰성에 직접 영향을 주는 단계로 들어가고 있습니다.
- 2026-07-03 16:04 KST 브리핑: Claude Code v2.1.199는 stacked slash-skill 호출, subagent partial result 반환, API error 전파, background agent daemon 복구, transient 429 자동 재시도 등을 고쳤습니다. coding agent 제품은 새 기능보다도 partial output 보존, 잘못된 성공 보고 방지, background session state 정합성 같은 운영 신뢰성이 사용자 경험의 핵심이 되고 있습니다.
- 2026-07-03 00:04 KST 브리핑: Microsoft는 `Microsoft Frontier Company`를 공개하며 25억 달러 투자와 6,000명의 산업·엔지니어링 전문가를 고객 조직에 투입해 AI 시스템을 공동 설계, 배포, 지속 개선하겠다고 밝혔습니다. enterprise agent 도입은 모델 API 연결보다 업무 재설계, 현장 엔지니어링, 성과 지표, 고객 자립화까지 포함하는 운영 모델 경쟁으로 커지고 있습니다.
- 2026-07-02 08:05 KST 브리핑: AWS는 agent-to-agent communication을 단일 gateway로 라우팅하는 serverless A2A gateway 패턴을 공개했습니다. 여러 agent가 늘어날수록 agent 운영은 point-to-point 연결보다 중앙 registry, path-based routing, JWT scope, OAuth backend authentication, SSE streaming 같은 연결 계층 관리가 중요해집니다.
- 2026-07-02 08:05 KST 브리핑: AWS는 AgentCore Memory에서 metadata filtering을 써서 agent memory를 issue type, status, time 같은 구조화 조건으로 좁히는 패턴을 공개했습니다. 장기 실행 agent는 단순 semantic similarity만으로 기억을 찾기보다 namespace, metadata, tenant boundary를 함께 써야 실무 정확도가 올라갑니다.
- 2026-07-01 08:05 KST 브리핑: GitHub는 Claude Sonnet 5를 Copilot의 IDE, CLI, cloud agent, Copilot App 등 여러 surface에서 점진 제공한다고 발표했고, JetBrains AI Assistant에는 GitHub Copilot을 agent picker의 first-class option으로 넣었습니다. coding agent 경쟁은 모델 품질뿐 아니라 어느 개발 환경에서 같은 agent를 호출하고, 모델과 reasoning depth를 어떻게 고르는지가 중요해지고 있습니다.
- 2026-07-01 08:05 KST 브리핑: AWS는 Amazon Bedrock AgentCore에서 AG-UI protocol을 써서 agent가 대화창 안에 chart를 렌더링하거나 shared canvas를 갱신하고, 실행 중 사람 승인을 요청하는 패턴을 공개했습니다. agent UX는 채팅 답변에서 interactive UI, shared state, human-in-the-loop 제어로 확장되고 있습니다.
- 2026-07-01 00:04 KST 브리핑: TechCrunch는 Amazon이 purpose-built agent를 빠르게 배포하기 위해 고객사 안에 엔지니어를 투입하는 10억 달러 규모 FDE 조직을 만든다고 보도했습니다. agent 도입 경쟁은 모델 API 판매만이 아니라 현장 업무 재설계, 빠른 배포, 고객 자립화를 포함하는 서비스 운영 모델로 넓어지고 있습니다.
- 2026-07-01 00:04 KST 브리핑: TechCrunch는 OKX가 결제, identity, reputation을 묶은 AI agent marketplace를 준비한다고 보도했습니다. agent가 서로 일을 맡기고 대가를 지불하는 구조는 흥미롭지만, 권한, 책임, 사기 방지, 결제 취소 같은 운영 경계가 함께 설계되어야 합니다.
- 2026-06-30 16:05 KST 브리핑: Base44는 앱 생성 플랫폼용 자체 모델 `Base1`을 공개했습니다. coding/application agent 제품은 범용 모델 호출만이 아니라 사용자 상호작용 데이터, latency, inference cost, 제품 workflow 최적화를 함께 묶는 방향으로 이동하고 있습니다.
- 2026-06-30 16:05 KST 브리핑: Google의 영국 AI 활용 연구는 상위 고급 사용자와 초기 사용자 사이의 차이를 반복 프롬프트, 적절한 도구 선택, 멀티모달 입력, agentic workflow 습관으로 설명했습니다. agent adoption은 단순 사용률보다 업무 흐름에 얼마나 깊게 들어갔는지가 중요해지고 있습니다.
- 2026-06-30 16:05 KST 브리핑: Claude Code v2.1.196은 조직 기본 모델, background agent 복구, code review token 절감, session 식별성 개선을 포함했습니다. coding agent가 개인 CLI에서 조직 운영 surface로 확장되는 신호입니다.
- 2026-06-30 06:02 KST 브리핑: GitHub는 Claude Opus 4.8 fast mode를 Copilot preview로 공개했습니다. interactive coding agent에서는 모델 지능뿐 아니라 output token 속도, plan availability, usage-based billing, admin enablement가 실제 생산성 변수로 함께 관리됩니다.
- 2026-06-27 06:01 KST 브리핑: GitHub는 Microsoft AI의 `MAI-Code-1-Flash`를 Copilot Business와 Copilot Enterprise에서 GA로 제공한다고 발표했습니다. enterprise coding agent 운영은 모델 성능뿐 아니라 plan별 availability, model policy, billing, 품질 검토 기준을 함께 관리해야 합니다.
- 2026-06-27 00:04 KST 브리핑: GitHub Desktop 3.6은 Git worktree 지원과 Copilot 기반 merge conflict resolution, commit message generation을 데스크톱 Git workflow에 통합했습니다. coding agent가 병렬 worktree를 쓰는 패턴이 GUI client와 repository policy 검토 흐름까지 확장되는 신호입니다.
- 2026-06-26 12:04 KST 브리핑: GitHub의 Copilot code review 업데이트와 enterprise plugin marketplace 제한은 agent가 조직 workflow에 들어갈 때 "작업 수행"뿐 아니라 review depth, 비용, plugin source, 정책 적용이 제품 기능이 된다는 신호입니다.
- 2026-06-26 12:04 KST 브리핑: arXiv `Semantic Early-Stopping`, `SKILL-DISCO`, `Autoformalization of Agent Instructions into Policy-as-Code` 계열 흐름은 agent를 단순 prompt loop가 아니라 reusable skill, stopping policy, formal execution policy를 갖춘 시스템으로 다루려는 방향입니다.
- 2026-06-26 06:01 KST 브리핑: AWS는 Bedrock 기반 AWS Health analytics agent와 data mesh 기반 agentic AI application 패턴을 공개했습니다. enterprise agent는 단일 챗봇이 아니라 operational event, support workflow, identity, governed retrieval을 함께 다루는 시스템으로 설계되는 방향입니다.
- 2026-06-26 00:05 KST 브리핑: OpenAI는 Codex 사용 데이터를 바탕으로 agentic work의 경제적 잠재력을 분석한 연구 글을 공개했습니다. 에이전트 효과를 단순 정답률이 아니라 위임된 업무 단위, 역할별 사용, 반복 사용으로 측정하려는 흐름입니다.
- 2026-06-26 00:05 KST 브리핑: Hugging Face의 Moon Bot 사례는 Slack thread에서 coding task를 넘기고 agent workspace를 별도 저장소에 두는 형태를 보여줍니다. 에이전트 UX가 별도 앱보다 기존 협업 surface 안으로 들어가는 신호입니다.
- 2026-06-24 07:00 KST 브리핑: Anthropic의 Claude Tag는 Slack에서 `@Claude`를 호출해 팀 단위 작업을 단계적으로 수행하게 하는 형태로 공개되었습니다. 관리자 권한, 채널/조직별 토큰 지출 한도, 실행 로그가 함께 제시되어 에이전트를 개인 도구가 아니라 조직 운영 시스템으로 다루는 흐름이 강해졌습니다.
- 2026-06-24 07:00 KST 브리핑: arXiv의 오픈소스 코딩 에이전트 탐지 논문은 설정 파일, 커밋 메시지, 작성자 식별, 봇 시그니처를 함께 봐야 에이전트 활동을 포착할 수 있다고 주장합니다. PR만 보거나 봇 계정만 보는 방식은 실제 adoption을 크게 과소추정할 수 있습니다.
- 에이전트 프레임워크 비교에서 orchestration, observability, production readiness가 주요 평가 기준으로 언급됩니다.
- 논문 큐레이션은 Memory & RAG, Tooling, Evaluation & Observability, Security처럼 하위 주제로 분화되고 있습니다.
- 기업 도입에서는 "데모가 되는가"보다 "운영 중 실패를 추적하고 통제할 수 있는가"가 더 중요해지고 있습니다.

## 브리핑에서 볼 체크리스트

- 실제 도구 호출이나 파일 변경이 있는가
- 사람 승인 단계가 있는가
- 실패했을 때 trace가 남는가
- 비용과 반복 안정성을 관리하는가
- 보안 권한이 명확하게 제한되어 있는가

## 연결 문서

- [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]
- [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]
- [[Knowledge/AI Systems/Model Context Protocol|Model Context Protocol]]
- [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]]

## Source Links

- https://openai.com/index/improving-gpt-5-6-sol-in-chatgpt/
- https://github.blog/changelog/2026-08-06-kimi-k3-is-now-available-in-github-copilot
- https://www.anthropic.com/news/introducing-claude-tag
- https://arxiv.org/abs/2606.24429
- https://openai.com/index/how-agents-are-transforming-work/
- https://huggingface.co/blog/huggingface/moon-bot
- https://aws.amazon.com/blogs/machine-learning/build-self-service-aws-health-analytics-to-find-actionable-health-insights-with-ai-agents-powered-by-amazon-bedrock/
- https://aws.amazon.com/blogs/machine-learning/building-agentic-ai-applications-with-a-modern-data-mesh-strategy-on-aws/
- https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates
- https://github.blog/changelog/2026-06-25-enterprise-managed-settings-now-support-strictknownmarketplaces-in-vs-code-and-the-cli
- https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration
- https://github.blog/changelog/2026-06-26-mai-code-1-flash-for-copilot-business-and-copilot-enterprise
- https://docs.github.com/copilot/reference/ai-models/supported-models
- https://arxiv.org/abs/2606.27009
- https://arxiv.org/abs/2606.26669
- https://arxiv.org/abs/2606.26649
- https://github.blog/changelog/2026-06-29-claude-opus-4-8-fast-mode-is-now-in-preview-for-github-copilot
- https://www.wix.com/press-room/home/post/base44-becomes-first-app-creation-platform-to-launch-its-own-proprietary-llm-base-1-marking-a-maj
- https://techcrunch.com/2026/06/29/vibe-coding-platform-base44-launches-own-model-as-ai-startups-seek-defensibility/
- https://blog.google/company-news/inside-google/around-the-globe/google-europe/united-kingdom/unlocking-britains-next-era-of-productivity-building-a-nation-of-ai-trailblazers/
- https://github.com/anthropics/claude-code/releases/tag/v2.1.196
- https://techcrunch.com/2026/06/30/amazon-launches-new-1-billion-fde-org-following-openai-and-anthropic/
- https://techcrunch.com/2026/06/30/crypto-exchange-okx-wants-ai-agents-to-hire-and-pay-each-other/
- https://github.blog/changelog/2026-06-30-claude-sonnet-5-is-generally-available-for-github-copilot
- https://github.blog/changelog/2026-06-30-copilot-agent-is-now-available-in-jetbrains-ai-assistant
- https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/
- https://aws.amazon.com/blogs/machine-learning/building-a-serverless-a2a-gateway-for-agent-discovery-routing-and-access-control/
- https://aws.amazon.com/blogs/machine-learning/structured-memory-filtering-with-metadata-in-agentcore-memory/
- https://blogs.microsoft.com/blog/2026/07/02/microsoft-frontier-company-ai-engineering-that-amplifies-and-protects-your-intelligence/
- https://github.com/anthropics/claude-code/releases/tag/v2.1.199
- https://github.com/anthropics/claude-code/releases/tag/v2.1.200
- https://github.com/anthropics/claude-code/releases/tag/v2.1.201
- https://aws.amazon.com/blogs/machine-learning/deploying-multi-turn-rl-infrastructure-for-amazon-nova-on-amazon-sagemaker-hyperpod/
- https://github.com/anthropics/claude-code/releases/tag/v2.1.202
- https://github.com/anomalyco/opencode/releases/tag/v1.17.14
- https://github.com/anthropics/claude-code/releases/tag/v2.1.206
- https://github.blog/changelog/2026-07-10-github-mobile-improved-filters-and-sorting-for-copilot-sessions
- https://github.com/openai/codex/releases/tag/rust-v0.145.0-alpha.7
- https://github.com/openai/codex/compare/rust-v0.145.0-alpha.4...rust-v0.145.0-alpha.7
- https://github.blog/changelog/2026-07-24-claude-opus-5-is-now-available-in-github-copilot/
