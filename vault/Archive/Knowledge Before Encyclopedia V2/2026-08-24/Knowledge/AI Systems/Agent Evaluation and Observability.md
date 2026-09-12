---
title: Agent Evaluation and Observability
type: knowledge
status: evergreen
created: 2026-06-23
updated: 2026-08-04
tags:
  - AI
  - Agent
  - Evaluation
  - Observability
---

# Agent Evaluation and Observability

## 한 줄 정의

Agent Evaluation은 에이전트가 일을 잘했는지 측정하는 것이고, Observability는 에이전트가 실제로 무엇을 했는지 추적 가능하게 만드는 것입니다.

## 왜 중요한가

에이전트는 여러 단계를 거쳐 작업합니다. 최종 결과가 틀렸을 때 원인이 다음 중 어디에 있는지 알아야 합니다.

- 잘못된 출처를 읽었는가
- 중요한 조건을 빠뜨렸는가
- 잘못된 도구를 호출했는가
- 중간 요약에서 의미가 바뀌었는가
- 비용이나 시간이 과도하게 늘어났는가

기존 소프트웨어는 코드와 로그를 보면 원인을 찾을 수 있습니다. 에이전트는 모델의 판단과 도구 호출이 섞이기 때문에 trace가 훨씬 중요합니다.

## 평가 지표

| 지표 | 설명 | 브리핑 자동화 예시 |
|---|---|---|
| Task Success | 목표를 달성했는가 | 07:00/17:00 파일이 생성됨 |
| Source Quality | 출처가 신뢰할 만한가 | 공식 발표, 논문, 기술 블로그 우선 |
| Novelty | 새 정보만 다뤘는가 | 이전 브리핑 이후 변화만 포함 |
| Grounding | 근거 링크가 있는가 | 각 핵심 주장에 출처 포함 |
| Usefulness | 사용자가 다음 행동을 알 수 있는가 | 체크리스트와 관찰 포인트 제공 |
| Cost | 비용과 호출 수가 적절한가 | 불필요한 반복 검색 방지 |
| Safety | 권한과 출력이 안전한가 | 지정 폴더 외 변경 없음 |

## 관측해야 할 로그

| 로그 | 목적 |
|---|---|
| Source List | 어떤 소스를 확인했는지 |
| Inclusion Decision | 왜 포함했는지 |
| Exclusion Decision | 왜 제외했는지 |
| Tool Calls | 어떤 도구를 썼는지 |
| File Changes | 어떤 노트를 만들거나 수정했는지 |
| Coverage Window | 어느 시간 구간을 다뤘는지 |

## Recent Signals

- 2026-08-04 08:03 KST 브리핑: Microsoft Research는 Kubernetes 기반 격리 환경을 공통 서비스로 두고 코딩·웹·개인 비서 에이전트의 데이터 수집, 강화학습 반복 실행, 평가를 같은 기반에서 수행하는 Orchard를 공개했습니다. 실제 배포용 harness 안에서 학습·평가해 단순화된 훈련 환경과 배포 환경의 차이를 줄이려는 접근입니다. 공개 코드·데이터가 재현 가능성을 높이지만, 공급사 벤치마크 수치가 다른 저장소와 실업무에 일반화되는지는 독립 검증이 필요합니다.
- 2026-07-30 08:03 KST 브리핑: OpenAI는 ARC-AGI-3의 공식 실행기에서 GPT-5.6 Sol 공개 과제 점수가 13.3%였지만, 이전 추론을 유지하고 오래된 문맥을 압축하는 Responses API 실행기에서는 38.3%로 높아지고 출력 토큰은 약 6분의 1로 줄었다고 보고했습니다. 이는 벤치마크가 모델뿐 아니라 reasoning 보존, 문맥 절단·압축, API와 harness 설계를 함께 측정한다는 신호입니다. 자사 모델에 맞춘 제품사 실험이므로 공정 비교에는 실행 설정·비용·로그 공개와 독립 재현이 필요합니다.
- 2026-07-23 08:03 KST 브리핑: OpenAI Presence는 출시 전 시뮬레이션과 grader로 업무 결과, 정책 준수, 도구 사용, 사람 이관 판단을 검사하고, 출시 뒤 production session·escalation·quality signal에서 개선점을 찾는 구조를 제시했습니다. Codex가 변경안을 제안하더라도 팀이 기존 버전과 비교 시험한 뒤 승인해 배포하도록 한 점은 agent 개선 loop에 평가와 사람 통제를 함께 두는 운영 사례입니다.
- 2026-07-23 08:03 KST 브리핑: GitHub Copilot 영향 대시보드는 최근 28일 사용으로 도입 단계를 나누고 단계별 월평균 병합 PR, 병합 시간 중앙값, 하루 코드 줄 수와 6개월 추세를 비교합니다. 사용 깊이와 업무 결과를 연결하는 관측은 진전이지만, 팀 구성·저장소 난이도 같은 교란 요인을 통제하지 않은 집단 비교는 인과 효과로 해석하면 안 됩니다.
- 2026-07-18 08:01 KST 브리핑: GitHub Copilot usage metrics API가 coding agent와 code review의 pull request 활동을 저장소별·일별로 집계하는 endpoint를 정식 제공하기 시작했습니다. 생성·병합된 PR, 리뷰된 PR, 의견 유형별 제안 수를 저장소 단위로 볼 수 있어, 조직 평균보다 실제 업무가 일어나는 저장소별 도입 효과와 AI 준비도를 비교할 수 있습니다.
- 2026-07-18 08:01 KST 브리핑: OpenAI는 AI 업무를 바로 사용 가능, 수정 필요, 사람에게 이관의 세 결과로 나누고, 모델 비용에 재시도·지연·검토·재작업까지 더한 뒤 품질 기준을 통과한 업무 수로 나누는 평가 틀을 제시했습니다. 공급사 제안이라는 한계가 있지만, agent 평가는 token price보다 성공 업무당 총비용과 사람 개입률을 봐야 한다는 운영 신호입니다.
- 2026-07-14 08:01 KST 브리핑: Vercel AI SDK `ai@7.0.23`, `7.0.25`, `7.0.26`은 여러 입력을 묶어 임베딩하는 `embedMany`와 승인 뒤 이어지는 도구 호출을 상위 trace 문맥에 연결하고, 스트리밍 음성 변환을 취소할 때 아직 준비 중인 provider stream까지 중단하도록 고쳤습니다. AI 앱 관측에서는 최종 출력뿐 아니라 비동기 준비 단계의 취소 전파와 승인 전후 span의 부모-자식 관계가 끊기지 않는지 확인해야 합니다.
- 2026-07-13 16:02 KST 브리핑: OpenAI Codex `0.144.2`는 자동 코드 리뷰 프롬프트 변경에서 생긴 회귀를 되돌리고 이전 Guardian 정책 템플릿, 리뷰 요청 형식, 도구 사양을 복구했습니다. agent 평가에서는 새 프롬프트의 의도뿐 아니라 정책·도구 계약·snapshot을 묶어 회귀 테스트하고, 문제가 생기면 검증된 동작으로 빠르게 되돌릴 수 있어야 합니다.
- 2026-07-12 08:01 KST 브리핑: Vercel AI SDK는 Groq provider에서 prompt cache read를 사용량 객체에 반영하지 못하던 문제를 `@ai-sdk/groq@4.0.8`과 `@ai-sdk/groq@3.0.51`에서 고쳤습니다. agent와 AI 앱 관측에서는 최종 답변뿐 아니라 cache hit가 no-cache token으로 잘못 기록되지 않는지까지 확인해야 비용과 성능 판단을 믿을 수 있습니다.
- 2026-07-11 08:03 KST 브리핑: GitHub는 multi-user budget의 사용자별 사용 상태를 한 REST API endpoint에서 조회할 수 있게 했습니다. Copilot AI credit처럼 사용자별로 빠르게 소진되는 비용 항목은 agent 운영 지표에서 성공률, trace, attention queue와 함께 예산 소진률을 봐야 합니다.
- 2026-07-11 00:00 KST 브리핑: GitHub Mobile은 Copilot session을 active 여부, status, repository, type, agent 기준으로 좁히고 최근순, 오래된순, active first, needs-attention first 등으로 정렬할 수 있게 했습니다. agent observability는 trace 저장뿐 아니라, 쌓인 session 중 어느 작업이 진행 중이고 어떤 작업에 사람이 개입해야 하는지 찾는 탐색 UX까지 포함합니다.
- 2026-07-10 16:03 KST 브리핑: Claude Code v2.1.206은 background agent가 Claude Code 업데이트 직후 백그라운드에서 새 버전으로 올라가도록 바꿨습니다. 긴 session을 운영하는 coding agent에서는 stale session으로 인한 느린 attach나 상태 불일치를 줄이는 lifecycle 관리가 관측성과 신뢰성의 일부가 됩니다.
- 2026-07-10 08:02 KST 브리핑: GitHub는 Copilot용 OpenTelemetry export를 기업 관리 설정으로 강제할 수 있게 했습니다. 관리자는 OTLP endpoint, transport, service name, resource attributes, exporter headers, prompt/response/tool content capture 정책을 설정할 수 있고, 인증 헤더가 agent subprocess 환경변수로 전달되지 않도록 했습니다. agent observability는 개인 개발자 설정이 아니라 조직의 승인된 collector와 데이터 캡처 정책으로 이동하고 있습니다.
- 2026-07-10 08:02 KST 브리핑: arXiv STRACE 논문은 긴 agent 실행 trace에서 실패 패턴을 고르고, 각 trace 안에서 원인 단계만 뽑아 agent 최적화 문맥을 만드는 방법을 제안했습니다. agent 평가는 전체 transcript를 많이 넣는 것보다 causal한 실패 근거를 찾아내는 방향으로 고도화되고 있습니다.
- 2026-07-10 08:02 KST 브리핑: Claude Code v2.1.203~v2.1.205는 background agent session 복구, worktree isolation, task state forwarding, transcript tampering 차단, Remote Control stale status 수정 등을 포함했습니다. agent observability는 trace뿐 아니라 session lifetime, worktree 경계, 사람 승인 부재 표시, background task 상태 동기화까지 포함해야 합니다.

- 2026-07-07 08:04 KST 브리핑: Claude Code v2.1.202는 workflow-spawned agent telemetry에 `workflow.run_id`와 `workflow.name` OpenTelemetry attribute를 추가했습니다. 다중 agent workflow에서는 개별 tool call만 남기는 것으로 부족하고, 어떤 workflow run에서 어떤 agent 활동이 이어졌는지 재구성할 수 있어야 합니다.
- 2026-07-07 08:04 KST 브리핑: SageMaker AI의 benchmark/recommendation job 결과를 MLflow app으로 자동 streaming하는 AWS 업데이트는 inference benchmark도 실험 추적 체계 안에서 비교해야 한다는 흐름입니다. 모델 선택과 배포 권고는 수동 표가 아니라 metric, parameter, chart가 같은 experiment로 남아야 재현성과 비교가 좋아집니다.
- 2026-07-07 00:03 KST 브리핑: Vercel AI SDK `@ai-sdk/xai@4.0.7`은 xAI Responses API의 streaming tool call이 완료됐을 때 provider-executed tool result를 방출하도록 고쳤습니다. streaming agent 관측에서는 최종 답변뿐 아니라 provider가 실제 실행한 tool result가 trace와 UI에 빠지지 않는지 확인해야 합니다.
- 2026-07-06 08:02 KST 브리핑: LangChain `langchain-mistralai==1.1.6` 릴리스에는 package version tracking을 tracing metadata에 추가하는 변경이 포함됐습니다. agent와 LLM 앱의 관측에서는 프롬프트와 모델명뿐 아니라 provider 패키지 버전까지 남겨야 같은 실행을 재현하고 회귀 원인을 좁힐 수 있습니다.
- 2026-07-04 16:03 KST 브리핑: Claude Code v2.1.201은 Claude Sonnet 5 session에서 harness reminder를 위해 mid-conversation system role을 더 이상 쓰지 않도록 바꿨습니다. agent evaluation에서는 최종 출력뿐 아니라 system/developer/user/tool/harness 메시지가 어떤 경로로 들어갔는지, 긴 session에서 그 구조가 결과에 영향을 주는지도 관측 대상이 됩니다.
- 2026-07-04 08:02 KST 브리핑: Claude Code v2.1.200은 sleep/wake 뒤 background session이 조용히 멈추는 문제, 중단된 turn이 stall 복구 뒤 다시 실행되는 문제, stale daemon lock과 socket auth token 손상 문제를 고쳤습니다. agent observability에서는 최종 답변뿐 아니라 background daemon handover, restart 후 session state, 취소된 작업의 재실행 여부까지 추적해야 합니다.
- 2026-07-03 16:04 KST 브리핑: Claude Code v2.1.199는 streaming 중간 오류가 난 뒤에도 partial response를 incomplete notice와 함께 보존하고, rate limit이나 server error로 끊긴 subagent의 partial work와 API 오류를 parent agent에 전달하도록 고쳤습니다. agent observability에서는 "실패했다"만 남기는 것보다 어느 정도까지 진행됐는지, 어떤 오류가 누구에게 전파됐는지, 재시도와 중단이 어떤 상태를 남겼는지가 중요합니다.
- 2026-07-03 08:05 KST 브리핑: AWS는 SageMaker AI multi-turn reinforcement learning 모범 사례를 공개하며, agent 학습에서 live system을 직접 때리지 않는 sandbox/simulation 환경, 고정된 외부 평가, reward hacking 감시, trajectory와 reward observability가 필요하다고 설명했습니다. 다중 턴 agent 평가는 reward 점수만 보는 것이 아니라 같은 tool call이 같은 결과를 내는지, per-rollout state가 격리되는지, 최종 업무 성공률이 별도로 검증되는지를 함께 봐야 합니다.
- 2026-07-02 08:05 KST 브리핑: Vercel AI SDK `ai@7.0.10`은 MCP tool call 실패에 `maxRetries` 옵션을 추가했습니다. agent observability와 reliability에서는 실패한 tool call을 얼마나 재시도했는지, 재시도 뒤 결과가 바뀌었는지, 비용과 지연 시간이 얼마나 늘었는지를 trace에 남기는 일이 중요해집니다.
- 2026-07-02 00:04 KST 브리핑: Vercel AI SDK의 `@ai-sdk/harness@1.0.12`는 `activeTools`와 `inactiveTools`로 harness 실행 중 사용할 도구를 필터링하는 기능을 추가했습니다. agent 평가와 회귀 테스트에서는 모델 답변뿐 아니라 어떤 tool set을 열어둔 상태에서 결과가 나왔는지 고정하는 일이 중요해지고 있습니다.
- 2026-07-01 08:05 KST 브리핑: IBM Research는 Hugging Face에 ScarfBench를 공개해 enterprise Java framework migration에서 coding agent가 build, deploy, behavioral validation을 통과하는지 평가하는 benchmark를 제시했습니다. agent 평가가 단순 bug fix에서 dependency, runtime behavior, framework semantics 보존까지 넓어지고 있습니다.
- 2026-06-30 06:02 KST 브리핑: AWS는 Bedrock AgentCore Observability로 production agent의 silent failure, infinite reasoning loop, wrong tool selection, tool invocation failure를 추적하는 패턴을 공개했습니다. agent observability는 metrics와 error rate뿐 아니라 reasoning step, tool invocation trace, CloudWatch Logs Insights query, evaluator 기반 지속 평가를 포함해야 합니다.
- 2026-06-29 06:02 KST 브리핑: TechCrunch는 Ford가 AI와 자동화 품질 시스템의 한계를 겪은 뒤 350명의 베테랑 엔지니어를 재투입해 failure point 탐지, 젊은 엔지니어 교육, AI 도구 재프로그래밍을 보완했다고 보도했습니다. 산업 AI 평가에서는 모델 출력뿐 아니라 domain expert feedback, near-miss 로그, 실패 taxonomy가 운영 지표가 됩니다.
- 2026-06-26 12:04 KST 브리핑: GitHub Copilot code review가 Copilot CLI/SDK의 `grep`, `rg`, `glob`, `view` 기반 파일 탐색 도구를 사용하도록 바뀌고, medium analysis depth 표시와 organization default 설정을 추가했습니다. agent evaluation은 최종 comment 품질뿐 아니라 review depth, 탐색 trace, 비용 효율을 같이 봐야 합니다.
- 2026-06-26 12:04 KST 브리핑: arXiv `Semantic Early-Stopping for Iterative LLM Agent Loops`는 fixed max iteration 대신 semantic change와 품질 개선 정체를 기준으로 agent loop를 멈추는 접근을 제안했습니다. 반복형 agent에서는 품질 parity와 token cost를 분리해 측정해야 합니다.
- 2026-06-26 12:04 KST 브리핑: arXiv `When Does Combining Language Models Help?`는 multi-model router/vote/MoA의 성능 상한이 모든 모델이 같은 query에서 함께 틀리는 co-failure rate에 의해 제한된다고 주장했습니다. ensemble agent 평가에서는 평균 pairwise correlation보다 all-wrong tail risk를 확인해야 합니다.
- 2026-06-26 06:01 KST 브리핑: AWS Health analytics agent 패턴은 operational event, quota, support case triage, duplicate case prevention을 agent workflow에 연결합니다. agent observability는 품질 로그뿐 아니라 운영 이벤트와 escalation history까지 포함해야 합니다.
- 2026-06-26 06:01 KST 브리핑: GitHub Enterprise Cloud cost center의 enterprise team 지원은 Copilot, Actions, Codespaces 같은 usage-based 개발 도구 비용을 팀 구조에 맞춰 추적하는 방향입니다. agent와 AI coding 도구 운영에서는 성공률, 비용 귀속, budget cap을 같이 봐야 합니다.
- 2026-06-26 00:05 KST 브리핑: `Progress Advantage for LLM Agents` 논문은 RL post-training에서 생기는 policy/reference log-probability ratio를 agent step-level scoring, uncertainty quantification, failure attribution에 쓰는 접근을 제안했습니다.
- 2026-06-26 00:05 KST 브리핑: self-distillation 다양성 감소 논문은 pass@1이 좋아져도 rollout diversity와 pass@k 개선 여지가 줄어들 수 있음을 보였습니다. agent 평가에서는 평균 성능과 함께 전략 다양성, OOD 실패, 반복 시도 성능을 봐야 합니다.
- 2026-06-24 07:00 KST 브리핑: Hugging Face는 `huggingface_hub` 릴리스를 주간 자동화로 바꾸면서 AI가 release note와 내부 공지를 초안 작성하고, deterministic script와 human review가 출하 결정을 맡는 구조를 공개했습니다. 에이전트 운영에서 "모델 초안 + 검증 스크립트 + 사람 승인 + 산출물 보관"이 실무 패턴으로 자리 잡는 신호입니다.
- 2026-06-24 07:00 KST 브리핑: Grad Detect 논문은 LLM의 hallucination과 abstention 가능성을 출력 confidence가 아니라 inference 중 gradient pattern으로 예측하려는 접근을 제시했습니다. 에이전트 평가가 최종 답변 채점뿐 아니라 내부 실패 신호 관측으로 확장될 수 있습니다.
- 2026-06-24 07:00 KST 브리핑: AWS Bedrock AgentCore 멀티테넌트 예시는 tenant별 token usage, model invocation cost, memory operation을 구조화해 추적하는 패턴을 제시했습니다. agent observability가 품질뿐 아니라 비용 귀속과 데이터 격리 검증에도 연결되고 있습니다.
LangChain의 agent engineering 관련 자료에서는 observability가 agent 운영의 기본 조건으로 강조됩니다. 특히 production agent에서는 단순 성공률보다 trace, replay, eval dataset, failure analysis가 중요해집니다.

## 이 Obsidian 자동화에 적용

각 브리핑 문서 frontmatter에 다음을 넣는 것이 좋습니다.

- `coverage_start`
- `coverage_end`
- `source_count`
- `new_items_count`
- `linked_knowledge_notes`
- `excluded_items_count`
- `type: briefing`

지식 노트에는 다음 섹션을 고정합니다.

- 한 줄 정의
- 왜 중요한가
- 핵심 개념
- 구체 예시
- Recent Signals
- 브리핑에서 볼 체크리스트
- 연결 문서

## 연결 문서

- [[Knowledge/AI Systems/AI Agents|AI Agents]]
- [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]
- [[Knowledge/AI Systems/Retrieval-Augmented Generation|Retrieval-Augmented Generation]]

## Source Links

- https://www.microsoft.com/en-us/research/blog/orchard-an-open-framework-for-scalable-agentic-ai/
- https://github.com/microsoft/Orchard
- https://huggingface.co/datasets/microsoft/Orchard
- https://arxiv.org/abs/2605.15040
- https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/
- https://huggingface.co/blog/huggingface-hub-release-ci
- https://arxiv.org/abs/2606.24790
- https://aws.amazon.com/blogs/machine-learning/shared-infrastructure-isolated-tenants-pool-model-multi-tenancy-with-amazon-bedrock-agentcore/
- https://arxiv.org/abs/2606.26080
- https://arxiv.org/abs/2606.26091
- https://aws.amazon.com/blogs/machine-learning/build-self-service-aws-health-analytics-to-find-actionable-health-insights-with-ai-agents-powered-by-amazon-bedrock/
- https://github.blog/changelog/2026-06-25-assign-enterprise-teams-to-cost-centers/
- https://github.blog/changelog/2026-06-25-copilot-code-review-analysis-depth-and-efficiency-updates
- https://arxiv.org/abs/2606.27009
- https://arxiv.org/abs/2606.27288
- https://techcrunch.com/2026/06/28/ford-rehires-gray-beard-engineers-after-ai-falls-short/
- https://aws.amazon.com/blogs/machine-learning/debugging-production-agents-with-amazon-bedrock-agentcore-observability/
- https://huggingface.co/blog/ibm-research/scarfbench
- https://github.com/scarfbench/benchmark
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/harness%401.0.12
- https://github.com/vercel/ai/releases/tag/ai%407.0.10
- https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/
- https://github.com/amazon-science/SOP-Bench
- https://github.com/anthropics/claude-code/releases/tag/v2.1.199
- https://github.com/anthropics/claude-code/releases/tag/v2.1.200
- https://github.com/anthropics/claude-code/releases/tag/v2.1.201
- https://github.com/langchain-ai/langchain/releases/tag/langchain-mistralai%3D%3D1.1.6
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/xai%404.0.7
- https://github.com/anthropics/claude-code/releases/tag/v2.1.202
- https://aws.amazon.com/blogs/machine-learning/streaming-benchmark-and-recommendation-results-to-mlflow-with-amazon-sagemaker-ai/
- https://github.com/anthropics/claude-code/releases/tag/v2.1.206
- https://github.blog/changelog/2026-07-10-github-mobile-improved-filters-and-sorting-for-copilot-sessions
- https://github.blog/changelog/2026-07-10-per-user-states-for-multi-user-budgets-in-the-rest-api
- https://docs.github.com/enterprise-cloud@latest/rest/billing/budgets?apiVersion=2026-03-10
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%404.0.8
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/groq%403.0.51
- https://github.com/openai/codex/releases/tag/rust-v0.144.2
- https://github.com/vercel/ai/releases/tag/ai%407.0.23
- https://github.com/vercel/ai/releases/tag/ai%407.0.25
- https://github.com/vercel/ai/releases/tag/ai%407.0.26
- https://openai.com/index/a-scorecard-for-the-ai-age/
- https://github.blog/changelog/2026-07-17-repository-level-github-copilot-usage-metrics-generally-available/
- https://openai.com/index/introducing-openai-presence/
- https://github.blog/changelog/2026-07-22-new-copilot-usage-metrics-impact-dashboard/
