---
title: Tech & AI Briefing - 00:04
date: 2026-07-02
time: 00:04
timezone: Asia/Seoul
coverage_start: 2026-07-01T16:05:55+09:00
coverage_end: 2026-07-02T00:04:30+09:00
type: briefing
source_count: 36
new_items_count: 2
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]"
tags:
  - AI
  - TechBriefing
  - Obsidian
---

# 한눈에 보기

- NVIDIA는 미국 안에서 AI 인프라를 더 많이 만들겠다는 공급망·제조 확대 흐름을 다시 정리했습니다. 핵심은 GPU만이 아니라 반도체, 광섬유, 패키징, 전력, 냉각, 조립 공장이 모두 AI 경쟁의 병목이라는 점입니다.
- Vercel AI SDK의 agent harness에는 테스트 때 쓸 도구를 켜고 끄는 `activeTools`와 `inactiveTools` 기능이 추가됐습니다. agent 평가에서 "어떤 도구를 열어둔 상태였는가"를 고정하기 쉬워졌습니다.
- 논문과 연구: 없음

# 오늘의 핵심 기사

## NVIDIA, AI 경쟁을 "칩 구매"에서 "물리 인프라 확보"로 넓히다

NVIDIA가 2026년 7월 1일 22:00 KST에 미국 내 AI 인프라 제조와 공급망 확대 현황을 공개했습니다. 이번 발표는 새 모델 성능보다 AI를 실제로 돌리는 공장, 전력, 냉각, 광통신, 조립 능력이 중요해지고 있다는 신호입니다.

핵심 사실

- NVIDIA는 TSMC의 Phoenix 공장에서 Blackwell wafer 생산이 진행 중이고, Foxconn은 Houston, Wistron은 Dallas에서 AI supercomputer 제조 공장을 준비한다고 설명했습니다.
- NVIDIA는 TSMC, Foxconn, Wistron, Corning, Lumentum, Coherent, Amkor 등 파트너와 함께 미국에서 최대 5,000억 달러 규모의 AI 인프라를 생산할 계획이라고 밝혔습니다.
- NVIDIA가 인용한 Public First 추정에 따르면, 2026년 NVIDIA 기반 AI 수요는 미국 GDP에 4,850억 달러를 더하고 10만 개 이상의 일자리를 뒷받침할 수 있습니다. 이는 NVIDIA가 인용한 추정치이며, 독립적으로 확정된 실적은 아닙니다.
- 발표는 AI 인프라의 구성 요소를 advanced semiconductor, packaging, power system, cooling, cloud capacity, manufacturing workforce까지 넓게 다뤘습니다.

왜 중요한가

AI 서비스의 병목은 이제 모델 성능표나 GPU 수량만이 아닙니다. 대형 모델을 훈련하고 서비스하려면 빠른 네트워크, 안정적인 전력, 냉각, 패키징, 조립 공장, 현장 인력이 함께 필요합니다. AI 인프라 경쟁은 소프트웨어 경쟁과 산업 공급망 경쟁이 겹친 형태로 바뀌고 있습니다.

구독자가 알아두면 좋은 점

기업이 AI 인프라를 검토할 때는 "어떤 GPU를 쓰나"만 보면 부족합니다. 어느 지역에서 만들고 운영하는지, 전력과 냉각 병목은 없는지, 광통신과 패키징 공급망이 안정적인지, 장애 때 다른 지역이나 공급자로 옮길 수 있는지를 같이 봐야 합니다.

더 깊게 보기: [[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]

# 논문과 연구

없음

# 오픈소스와 도구

## Vercel AI SDK harness 1.0.12, agent 테스트에서 도구 선택을 고정하기 쉽게 하다

- 프로젝트: Vercel AI SDK `@ai-sdk/harness@1.0.12`
- 쉬운 설명: agent나 AI workflow를 테스트할 때 사용할 수 있는 도구 목록을 명시적으로 켜고 끌 수 있게 됐습니다.
- GitHub: https://github.com/vercel/ai/releases/tag/%40ai-sdk/harness%401.0.12
- Star 증가 추세: 추세 확인 불가. 현재 GitHub API에서 확인한 `vercel/ai` star는 25,282개지만, 같은 기준의 과거값을 확인하지 못했습니다.
- 어디에 쓸 수 있나: agent 회귀 테스트, tool-calling 평가, sandbox별 기능 비교에서 "이번 테스트는 어떤 도구를 허용했는가"를 더 명확히 남길 때 쓸 수 있습니다.
- 더 깊게 보기: [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]

# 흐름 읽기

분석: 이번 창의 흐름은 "AI 시스템의 운영 조건을 더 명확히 고정하려는 움직임"입니다. NVIDIA 발표는 AI 성능 경쟁이 데이터센터 바깥의 제조·전력·냉각·광통신으로 넓어졌음을 보여줍니다. Vercel AI SDK harness 업데이트는 agent 평가에서 모델만이 아니라 허용 도구 목록도 실험 조건으로 관리해야 한다는 흐름과 맞닿아 있습니다.

확인된 사실과 구분한 해석: 확인된 사실은 NVIDIA 공식 블로그, GitHub release, GitHub API, 각 공식 피드와 arXiv API에서 확인한 게시·배포 시각입니다. 해석은 AI 경쟁이 모델 성능보다 운영 가능한 인프라와 재현 가능한 agent 평가 조건으로 확장되고 있다는 점입니다.

앞으로 볼 점

- NVIDIA의 미국 내 AI supercomputer 제조 계획이 실제 생산량과 납기 안정성으로 이어지는지
- 광통신, 패키징, 전력, 냉각 공급망이 AI 데이터센터 증설 속도를 따라가는지
- Vercel AI SDK harness의 tool filtering이 agent 평가 리포트나 CI workflow에서 어떻게 쓰이는지
- 다른 agent SDK도 도구 허용 목록, sandbox 조건, 실행 trace를 더 엄격히 기록하는지

# 바로 써먹을 점

- 업무 자동화: agent 업무를 테스트할 때 허용 도구 목록을 기록해, 실패 원인이 모델인지 도구 환경인지 분리합니다.
- AI 활용: AI 서비스 도입 자료를 볼 때 모델명뿐 아니라 운영 지역, 전력·냉각·네트워크 조건도 확인합니다.
- 개발 생산성: tool-calling agent의 회귀 테스트에는 "이번 테스트에서 열린 tool set"을 테스트 이름이나 로그에 남깁니다.
- 연구 개발: 실험 결과를 비교할 때 모델 버전, 데이터셋, 프롬프트와 함께 tool availability를 조건으로 기록합니다.
- 개인 프로젝트: 로컬 agent에 파일·브라우저·터미널 권한을 줄 때, 기능별로 켜고 끄는 설정을 따로 둡니다.

# Source List

- https://openai.com/news/rss.xml
- https://github.blog/changelog/feed/
- https://github.blog/wp-json/wp/v2/changelogs?per_page=20
- https://aws.amazon.com/blogs/machine-learning/feed/
- https://www.anthropic.com/news/rss.xml
- https://huggingface.co/blog/feed.xml
- https://blog.google/technology/ai/rss/
- https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/
- https://mistral.ai/rss.xml
- https://www.nature.com/subjects/machine-learning.rss
- https://www.theverge.com/rss/index.xml
- https://devblogs.microsoft.com/blog/feed/
- https://blogs.nvidia.com/feed/
- https://blogs.nvidia.com/blog/nvidia-and-partners-build-in-america-for-america/
- https://techcrunch.com/category/artificial-intelligence/feed/
- https://techcrunch.com/2026/07/01/gemini-spark-googles-agentic-assistant-is-now-available-on-mac/
- https://techcrunch.com/2026/07/01/meta-like-spacex-looks-to-turn-excess-ai-compute-into-cash/
- https://news.bloomberglaw.com/ip-law/meta-is-building-a-cloud-business-to-sell-excess-ai-compute-1
- https://www.channelnewsasia.com/business/meta-building-cloud-business-sell-excess-ai-capacity-bloomberg-news-reports-6224996?cid=cna_flip_070214
- https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.LG&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.CL&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.CV&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.RO&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.SE&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:stat.ML&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.CR&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://api.github.com/repos/openai/codex/releases?per_page=5
- https://api.github.com/repos/vercel/ai/releases?per_page=5
- https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fharness%401.0.12
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/harness%401.0.12
- https://api.github.com/repos/modelcontextprotocol/typescript-sdk/releases?per_page=5
- https://api.github.com/repos/modelcontextprotocol/python-sdk/releases?per_page=5
- https://api.github.com/repos/langchain-ai/langchain/releases?per_page=5
- https://api.github.com/repos/vllm-project/vllm/releases?per_page=5
- https://api.github.com/repos/huggingface/transformers/releases?per_page=5
