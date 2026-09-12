---
title: Tech & AI Briefing - 16:02
date: 2026-07-13
time: 16:02
timezone: Asia/Seoul
coverage_start: 2026-07-13T08:02:28+09:00
coverage_end: 2026-07-13T16:02:25+09:00
type: briefing
source_count: 16
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]"
excluded_items_count: 5
tags:
  - AI
  - TechBriefing
  - Obsidian
---

# 한눈에 보기

- 오늘의 핵심 기사: 없음
- 논문과 연구: 없음
- 오픈소스와 도구: Codex가 자동 코드 리뷰의 프롬프트 회귀를 되돌려 이전 리뷰 정책과 도구 동작을 복구했습니다.
- 흐름 읽기: AI 코딩 도구의 신뢰성은 새 기능뿐 아니라 프롬프트·정책·도구 계약을 함께 검증하고 안전하게 되돌리는 능력에 달려 있습니다.
- 바로 써먹을 점: Codex 자동 리뷰를 쓰는 팀은 `0.144.2` 적용 뒤 리뷰 요청 형식과 결과가 기대한 동작으로 돌아왔는지 확인할 수 있습니다.

# 오늘의 핵심 기사

없음

# 논문과 연구

없음

# 오픈소스와 도구

## Codex, 자동 코드 리뷰의 프롬프트 회귀를 되돌리다

OpenAI는 7월 13일 13:39 KST에 Codex `0.144.2`를 공개했습니다. 이번 버전은 자동 코드 리뷰 프롬프트 변경에서 생긴 회귀를 되돌려 이전 Guardian 리뷰 정책, 요청 형식, 도구 동작을 복구한 버그 수정입니다.

- 프로젝트: OpenAI Codex `0.144.2`
- 핵심 사실: 변경을 되돌린 공식 pull request는 이전 정책 템플릿, 리뷰 요청 레이아웃, 도구 사양과 관련 테스트·snapshot을 함께 복구했습니다.
- GitHub: https://github.com/openai/codex/releases/tag/rust-v0.144.2
- Star 증가 추세: 추세 확인 불가
- 어디에 쓸 수 있나: Codex 자동 리뷰를 사용 중이라면 업데이트 뒤 기존 리뷰 정책과 출력 형식이 정상으로 돌아왔는지 확인하는 기준으로 삼을 수 있습니다.
- 왜 중요한가: 코딩 agent는 모델만 바뀌는 제품이 아닙니다. 프롬프트, 정책, 요청 형식, 도구 정의 중 하나의 회귀도 리뷰 결과를 바꿀 수 있어 이들을 함께 테스트하고 되돌리는 운영 절차가 필요합니다.
- 다음에 볼 점: 이후 안정 버전에서 자동 리뷰 프롬프트가 다시 조정되는지, 회귀 방지 검증이 강화되는지 확인해야 합니다.
- 더 깊게 보기: [[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation and Observability]]

# 흐름 읽기

- 확인된 사실: 조사 창 안에서 확인된 실질적 업데이트는 Codex `0.144.2`의 자동 리뷰 회귀 복구 1건입니다. 뒤이은 `0.144.3`은 공식 설명상 병합된 변경이 없는 버전 전용 릴리스라 제외했습니다.
- 확인된 제외: OpenAI 뉴스, GitHub Changelog, Anthropic 뉴스, arXiv 최근 피드와 나머지 주요 오픈소스 공식 릴리스에는 컷오프 뒤 포함할 만한 중복 없는 업데이트가 없었습니다.
- 분석: 이번 수정은 coding agent의 품질 관리 단위가 모델 성능을 넘어 프롬프트, 정책, 요청 형식, 도구 계약과 회귀 테스트까지 넓어지고 있음을 보여줍니다.
- 앞으로 볼 점: 자동 리뷰 동작을 바꾸는 다음 업데이트가 정책·도구 계약과 함께 검증되는지 확인해야 합니다.

# 바로 써먹을 점

- 개발 생산성: Codex 자동 리뷰를 쓰는 팀은 `0.144.2`로 업데이트한 뒤 대표 pull request에서 리뷰 요청 형식, 사용 도구, 지적 결과가 기존 기대와 일치하는지 짧은 회귀 점검을 할 수 있습니다.
- AI 활용: agent 프롬프트를 바꿀 때 프롬프트 문자열만 비교하지 말고 정책 템플릿, 도구 정의, snapshot 테스트를 한 묶음으로 관리하는 방식이 안전합니다.

# Source List

- https://github.com/openai/codex/releases/tag/rust-v0.144.2
- https://api.github.com/repos/openai/codex/releases?per_page=10
- https://api.github.com/repos/anthropics/claude-code/releases?per_page=10
- https://api.github.com/repos/vercel/ai/releases?per_page=20
- https://api.github.com/repos/langchain-ai/langchain/releases?per_page=20
- https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG+OR+cat:cs.RO+OR+cat:cs.CR&sortBy=submittedDate&sortOrder=descending&max_results=30
- https://openai.com/news/rss.xml
- https://github.blog/changelog/feed/
- https://www.anthropic.com/news
- https://api.github.com/repos/ollama/ollama/releases?per_page=10
- https://api.github.com/repos/vllm-project/vllm/releases?per_page=10
- https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/releases?per_page=10
- https://api.github.com/repos/huggingface/transformers/releases?per_page=10
- https://aws.amazon.com/blogs/machine-learning/
- https://blogs.nvidia.com/
- https://blog.google/technology/ai/
