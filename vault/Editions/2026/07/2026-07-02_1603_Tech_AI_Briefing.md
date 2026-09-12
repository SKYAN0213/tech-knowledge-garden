---
title: Tech & AI Briefing - 16:03
date: 2026-07-02
time: 16:03
timezone: Asia/Seoul
coverage_start: 2026-07-02T08:05:09+09:00
coverage_end: 2026-07-02T16:03:53+09:00
type: briefing
source_count: 26
new_items_count: 3
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]"
  - "[[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]"
  - "[[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]]"
tags:
  - AI
  - TechBriefing
  - Obsidian
---

# 한눈에 보기

- NVIDIA는 AI cloud 사업자가 GPU 인프라를 더 빨리 확보하도록 revenue-sharing과 credit-support를 결합한 새 모델을 공개했습니다. AI 인프라 경쟁이 GPU 구매에서 자금 조달, 가동률, 지역별 AI factory 운영으로 넓어지고 있습니다.
- GitHub는 기업 비밀정보가 자사 저장소 밖의 공개 GitHub 영역에 새어도 찾아주는 public monitoring을 공개 preview로 열었습니다. 보안팀은 이제 "내 repo"뿐 아니라 직원 계정과 검증 도메인을 기준으로 공개 노출까지 추적해야 합니다.
- Vercel AI SDK의 Google provider는 Vertex AI의 Gemini Interactions API를 호출하는 `vertex.interactions()`를 추가했습니다. 멀티모달 출력 모델을 앱 SDK에서 다루는 표면이 조금 더 넓어졌습니다.
- 논문과 연구: 없음

# 오늘의 핵심 기사

## NVIDIA, AI cloud용 GPU 인프라를 수익 공유 모델로 넓히다

NVIDIA가 2026년 7월 2일 12:34 KST에 AI cloud 사업자가 NVIDIA 인프라를 고객에게 더 빨리 공급하도록 돕는 새 사업 모델을 공개했습니다. 핵심은 AI cloud가 NVIDIA 기반 cloud 서비스를 팔고, NVIDIA가 일반 제품 매출과 함께 지원된 capacity에서 나오는 cloud revenue 일부를 받는 구조입니다.

핵심 사실

- NVIDIA는 model builder, inference provider, agent platform, enterprise가 production inference와 agentic inference를 위해 더 많은 compute를 필요로 한다고 설명했습니다.
- 새 구조는 revenue-sharing과 credit-support를 결합해 AI cloud의 대규모 NVIDIA 인프라 조달을 돕는 방식입니다.
- Sharon AI와 Firmus가 초기 참여사로 제시됐습니다.
- Sharon AI는 최대 40,000개 NVIDIA Grace Blackwell GB300 GPU를 배치한다고 밝혔습니다.
- Firmus는 인도네시아 Batam에 DSX AI factory campus를 만들고, 최대 360MW와 170,000개 NVIDIA GPU 규모로 확장할 계획이라고 NVIDIA가 설명했습니다.
- NVIDIA는 Baseten, Fireworks AI, Together AI 같은 AI-native 수요가 training, post-training, fine-tuning, high-volume agentic inference로 이동하고 있다고 봤습니다.

왜 중요한가

AI 서비스 병목은 모델 아이디어만이 아니라 GPU capacity를 언제, 어디서, 어떤 비용 구조로 확보하느냐가 되고 있습니다. 대형 데이터센터를 직접 짓지 못하는 AI 회사는 cloud capacity를 빌려야 하고, cloud 사업자는 대규모 장비 조달과 가동률 위험을 안아야 합니다. NVIDIA의 새 모델은 이 위험을 매출 공유 구조로 나눠 AI factory 확장을 앞당기려는 시도입니다.

구독자가 알아두면 좋은 점

AI 서비스를 만들거나 도입할 때는 모델 가격표만 보지 말고, provider가 실제 capacity를 안정적으로 확보했는지, region과 전력 조건이 어떤지, 대량 inference가 늘 때 비용이 어떻게 바뀌는지 같이 봐야 합니다.

더 깊게 보기: [[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]

## GitHub, 기업 밖 공개 영역의 secret 노출도 찾아준다

GitHub가 2026년 7월 2일 09:37 KST에 GitHub Secret Protection 또는 Advanced Security를 쓰는 Enterprise Cloud 고객을 대상으로 public monitoring 공개 preview를 발표했습니다. 기업이 소유한 저장소 안에서만 secret을 찾는 것이 아니라, 공개 GitHub 영역 전체에서 기업과 관련된 노출을 찾아 attribution하는 기능입니다.

핵심 사실

- GitHub는 공개 github.com surface 전체에서 노출된 secret을 실시간으로 모니터링한다고 설명했습니다.
- 대상에는 git content, pull request comments, GitHub issues 같은 공개 콘텐츠가 포함됩니다.
- attribution은 GitHub identity layer와 verified domains를 사용합니다.
- 주요 방식은 enterprise member 기반 attribution과 verified domain matching입니다.
- enterprise owner와 enterprise security manager가 Security 탭에서 public monitoring을 켤 수 있습니다.
- private repository는 스캔하지 않고, 이미 공개된 secret만 표시한다고 GitHub는 밝혔습니다.
- GitHub Enterprise Cloud with data residency 지원은 아직 예정 상태입니다.

왜 중요한가

토큰과 API key는 회사 저장소 밖에서도 새어 나갑니다. 직원이 개인 fork, 공개 오픈소스 repo, issue 댓글에 실수로 secret을 올리면 기존 repo 중심 스캔만으로는 놓치기 쉽습니다. GitHub의 public monitoring은 secret scanning을 저장소 소유권 기준에서 사람과 도메인 기준으로 넓힙니다.

구독자가 알아두면 좋은 점

개발 조직은 secret scanning을 "우리 repo 안의 검사"로만 보지 말아야 합니다. verified domain, enterprise member 관리, 토큰 회수 절차, 공개 노출 알림 대응 SLA를 함께 정해야 실제 사고 시간을 줄일 수 있습니다.

더 깊게 보기: [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]], [[Knowledge/Software Engineering/AI-Assisted Security Engineering|AI-Assisted Security Engineering]]

# 논문과 연구

없음

# 오픈소스와 도구

## Vercel AI SDK, Vertex AI의 Gemini Interactions API 호출을 추가하다

- 프로젝트: Vercel AI SDK `@ai-sdk/google@4.0.6`
- 쉬운 설명: Google provider에 `vertex.interactions()`가 추가되어 Vertex AI의 location-scoped Gemini Interactions API를 호출할 수 있게 됐습니다.
- GitHub: https://github.com/vercel/ai/releases/tag/%40ai-sdk/google%404.0.6
- Star 증가 추세: 추세 확인 불가. 이번 실행에서 GitHub API로 확인한 `vercel/ai` star는 25,294개였지만, 같은 기준의 과거값을 검증하지 못했습니다.
- 어디에 쓸 수 있나: `gemini-omni-flash-preview` 같은 멀티모달 출력 모델을 Vertex OAuth credentials와 region scope 안에서 앱 SDK로 연결할 때 쓸 수 있습니다.
- 더 깊게 보기: [[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference Infrastructure]]

# 흐름 읽기

분석: 이번 창의 흐름은 AI 운영이 "모델을 호출한다"에서 "capacity, 보안 경계, provider API 표면을 관리한다"로 확장되는 것입니다. NVIDIA는 인프라 조달과 사업 모델을, GitHub는 공개 영역 secret 노출 추적을, Vercel은 멀티모달 provider 연결 표면을 각각 다뤘습니다.

확인된 사실과 구분한 해석: 확인된 사실은 NVIDIA 공식 블로그, GitHub 공식 changelog와 문서, Vercel GitHub release/API, 공식 RSS/API에서 확인한 게시·배포 시각입니다. 해석은 AI 서비스 운영의 경쟁축이 모델 성능뿐 아니라 compute 조달, secret 노출 대응, provider별 API 연결 안정성으로 넓어진다는 점입니다.

앞으로 볼 점

- NVIDIA의 revenue-sharing·credit-support 모델이 AI cloud capacity 가격과 장기 계약 구조를 어떻게 바꾸는지
- Sharon AI와 Firmus의 대규모 GB300 배치가 실제 availability와 region 선택으로 이어지는지
- GitHub public monitoring이 enterprise 외부 개인 계정과 공개 issue 노출을 얼마나 빠르게 attribution하는지
- Enterprise Cloud with data residency에서 public monitoring이 언제 지원되는지
- Vercel AI SDK의 Gemini Interactions API 지원이 실제 영상·멀티모달 앱 개발 흐름을 얼마나 단순화하는지

# 바로 써먹을 점

- 업무 자동화: API key와 cloud token은 repo 안뿐 아니라 issue, PR 댓글, 개인 fork 노출까지 대응 절차를 만듭니다.
- AI 활용: AI 서비스를 고를 때 model quality, price, region, capacity 약정, 장애 시 대체 provider를 한 표에 넣습니다.
- 개발 생산성: 멀티모달 모델을 쓸 때 SDK provider가 region, credential, output type을 어디까지 감싸주는지 먼저 확인합니다.
- 연구 개발: 대량 inference 실험은 GPU 수량뿐 아니라 provider capacity, queue time, region latency를 실험 로그에 남깁니다.
- 개인 프로젝트: 공개 repo에 secret scanning과 push protection을 켜고, 실수로 공개된 token을 즉시 폐기하는 체크리스트를 둡니다.

# Source List

- https://openai.com/news/rss.xml
- https://github.blog/wp-json/wp/v2/changelogs?per_page=20
- https://github.blog/changelog/2026-07-01-secret-scanning-public-monitoring-for-enterprises/
- https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/secret-security/secret-scanning
- https://api.github.com/repos/vercel/ai/releases?per_page=10
- https://api.github.com/repos/vercel/ai
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/google%404.0.6
- https://github.com/vercel/ai/releases/tag/%40ai-sdk/perplexity%403.0.42
- https://api.github.com/repos/modelcontextprotocol/servers/releases?per_page=10
- https://api.github.com/repos/openai/openai-python/releases?per_page=10
- https://api.github.com/repos/openai/openai-cookbook/commits?per_page=10
- https://api.github.com/repos/vllm-project/vllm/releases?per_page=10
- https://aws.amazon.com/blogs/machine-learning/feed/
- https://blog.google/technology/ai/rss/
- https://blogs.nvidia.com/feed/
- https://blogs.nvidia.com/blog/nvidia-unlocks-ai-compute-at-scale-capital-partners-to-power-ai-infrastructure-buildout/
- https://www.microsoft.com/en-us/research/feed/
- https://huggingface.co/blog/feed.xml
- https://techcrunch.com/category/artificial-intelligence/feed/
- https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.CL&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.CV&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.SE&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.CR&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:stat.ML&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
- https://export.arxiv.org/api/query?search_query=cat:cs.RO&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending
