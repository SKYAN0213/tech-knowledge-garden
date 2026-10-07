---
title: 2026-07-07 · 아침 브리핑
type: briefing-index
date: 2026-07-07
created: 2026-07-07
modified: 2026-07-07
description: 2026-07-07 IT · AI · 로보틱스
coverage_start: 2026-07-07T00:03:00+09:00
coverage_end: 2026-07-07T08:04:00+09:00
item_count: 9
edition: Editions/2026/07/2026-07-07_0804_Tech_AI_Briefing
github_url: https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/2026/07/2026-07-07_0804_Tech_AI_Briefing.md
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# 2026-07-07 · 아침 브리핑

## 주요 소식

### [[News/31615a71acf2ec76|AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개]]

AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에 Amazon Nova를 SageMaker HyperPod에서 멀티턴 강화학습으로 훈련하는 인프라 구축 방법을 소개했다. 예제는 S3에 학습 데이터를 올리면 컴퓨트를 준비하고, HyperPod에서 GRPO 가중치 업데이트를 수행하며, Fargate의 보상 환경과 Nova Forge SDK로 모델의 여러 차례 상호작용을 연결하는 구조다. AWS는 Wordle 예제의 예상 수렴 범위와 인스턴스 구성별 비용도 함께 설명했다.

### [[News/0003f5c36a86534e|AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개]]

AWS는 2026년 7월 7일(한국시간) Amazon Nova 2 Lite와 SAM 3, Amazon Textract를 조합해 이미지의 개인정보(PII)를 찾아 가리는 아키텍처 가이드를 공개했다. Nova가 이미지 내용을 판단하고 작업을 나누면, SAM 3는 시각적 대상의 분할 마스크를 만들고 Textract는 텍스트와 위치를 추출하는 구성이다. 가려진 이미지에 개인정보가 남았다고 Nova가 판단하면 수동 검토용 격리 폴더로 보내도록 설계했다.

### [[News/fb116c5e01814e4b|AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명]]

AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에서 Amazon Bedrock으로 제공하는 MiniMax M2·M2.1·M2.5의 사양과 호출 방법을 정리했다. M2의 컨텍스트 길이는 100만 토큰, M2.1과 M2.5는 각각 19만6천 토큰이며 세 모델 모두 최대 8천 토큰을 출력한다고 설명했다. OpenAI SDK와 같은 Chat Completions 인터페이스를 쓰는 bedrock-mantle과, Bedrock 고유 기능에 사용하는 bedrock-runtime의 차이도 소개했다.

### [[News/dc2e14116dca2332|AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가]]

AWS는 2026년 7월 7일(한국시간) Amazon SageMaker AI의 벤치마크·추천 작업 결과를 SageMaker MLflow Apps로 보내는 통합 기능을 발표했다. 작업의 지표·매개변수·차트가 실시간으로 기록되며, 사용자가 선택한 앱에서 서로 다른 구성을 비교할 수 있다.

### [[News/bdc95c28b5fad7d8|Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가]]

Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를 small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌 권장 기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run_id와 workflow.name을 추가해 실행별 활동을 추적할 수 있도록 했다.



## 분야별 브리핑

### AI · 3건

#### [[News/31615a71acf2ec76|AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개]]

연구·기술 · 새로운 방법 · AWS

AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에 Amazon Nova를 SageMaker HyperPod에서 멀티턴 강화학습으로 훈련하는 인프라 구축 방법을 소개했다. 예제는 S3에 학습 데이터를 올리면 컴퓨트를 준비하고, HyperPod에서 GRPO 가중치 업데이트를 수행하며, Fargate의 보상 환경과 Nova Forge SDK로 모델의 여러 차례 상호작용을 연결하는 구조다. AWS는 Wordle 예제의 예상 수렴 범위와 인스턴스 구성별 비용도 함께 설명했다.

#### [[News/0003f5c36a86534e|AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개]]

연구·기술 · 새로운 방법 · AWS · Meta

AWS는 2026년 7월 7일(한국시간) Amazon Nova 2 Lite와 SAM 3, Amazon Textract를 조합해 이미지의 개인정보(PII)를 찾아 가리는 아키텍처 가이드를 공개했다. Nova가 이미지 내용을 판단하고 작업을 나누면, SAM 3는 시각적 대상의 분할 마스크를 만들고 Textract는 텍스트와 위치를 추출하는 구성이다. 가려진 이미지에 개인정보가 남았다고 Nova가 판단하면 수동 검토용 격리 폴더로 보내도록 설계했다.

#### [[News/fb116c5e01814e4b|AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명]]

연구·기술 · 새로운 방법 · AWS · Amazon Bedrock · MiniMax

AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에서 Amazon Bedrock으로 제공하는 MiniMax M2·M2.1·M2.5의 사양과 호출 방법을 정리했다. M2의 컨텍스트 길이는 100만 토큰, M2.1과 M2.5는 각각 19만6천 토큰이며 세 모델 모두 최대 8천 토큰을 출력한다고 설명했다. OpenAI SDK와 같은 Chat Completions 인터페이스를 쓰는 bedrock-mantle과, Bedrock 고유 기능에 사용하는 bedrock-runtime의 차이도 소개했다.

### 소프트웨어·클라우드 · 5건

#### [[News/dc2e14116dca2332|AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가]]

제품·서비스 · 기능 추가

AWS는 2026년 7월 7일(한국시간) Amazon SageMaker AI의 벤치마크·추천 작업 결과를 SageMaker MLflow Apps로 보내는 통합 기능을 발표했다. 작업의 지표·매개변수·차트가 실시간으로 기록되며, 사용자가 선택한 앱에서 서로 다른 구성을 비교할 수 있다.

#### [[News/bdc95c28b5fad7d8|Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가]]

제품·서비스 · 기능 추가 · 오류 수정

Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를 small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌 권장 기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run_id와 workflow.name을 추가해 실행별 활동을 추적할 수 있도록 했다.

#### [[News/ce4cbe901b2add47|OpenCode v1.17.14, MCP 도구를 실행하는 코드 모드 추가]]

제품·서비스 · 기능 추가 · 오류 수정

OpenCode v1.17.14는 2026년 7월 7일(한국시간) 공개됐다. 연결된 MCP 도구를 대상으로 제한된 조정 스크립트를 실행하는 코드 모드 어댑터를 추가했다.

#### [[News/c5f838e53c500f66|LangGraph 1.2.8, 새 스레드의 상태 저장 오류 수정]]

제품·서비스 · 오류 수정

LangGraph 1.2.8은 2026년 7월 7일(한국시간) 공개됐다. 릴리스 노트에 따르면 새 스레드에서 updateState를 호출할 때 스텁 체크포인트 대신 스냅샷을 강제하도록 델타 채널 오류를 수정했다. websockets 의존성은 15.0.1에서 16.0으로 갱신하고 LangGraph·Python SDK의 마이너·패치 의존성 그룹도 업데이트했다.

#### AI SDK와 xAI 어댑터 패치

##### [[News/be8f1792372015fd|AI SDK 6.0.220, 도구 결과 순서와 스트림 공백 처리 수정]]

제품·서비스 · 오류 수정

AI SDK의 ai 패키지 6.0.220은 2026년 7월 7일(한국시간) 공개됐다. 생성 출력을 응답 메시지로 변환할 때 도구 결과를 도구 호출 순서대로 정렬하도록 바꿨다. extractJsonMiddleware는 마크다운 코드 블록의 시작 표시를 제거하지 않은 경우, 마지막으로 스트리밍되는 텍스트 부분의 앞쪽 공백을 보존하도록 수정했다.

##### [[News/67b9774daed42893|AI SDK xAI 어댑터 3.0.103, 완료된 도구 호출 결과 출력 변경]]

제품·서비스 · 기능 변경

AI SDK의 @ai-sdk/xai 패키지 3.0.103은 2026년 7월 7일(한국시간) 공개됐다. xAI Responses API의 스트리밍 도구 호출이 완료됐을 때, 제공자 측에서 실행한 도구 결과를 출력하도록 패치했다.



## 출처

- [S1] https://aws.amazon.com/blogs/machine-learning/deploying-multi-turn-rl-infrastructure-for-amazon-nova-on-amazon-sagemaker-hyperpod/
- [S2] https://aws.amazon.com/blogs/machine-learning/automatically-redact-pii-in-images-with-amazon-nova/
- [S3] https://aws.amazon.com/blogs/machine-learning/run-minimax-models-on-amazon-bedrock/
- [S4] https://aws.amazon.com/blogs/machine-learning/streaming-benchmark-and-recommendation-results-to-mlflow-with-amazon-sagemaker-ai/
- [S5] https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
- [S6] https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
- [S7] https://api.github.com/repos/langchain-ai/langgraph/releases/tags/1.2.8
- [S8] https://api.github.com/repos/vercel/ai/releases/tags/ai%406.0.220
- [S9] https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fxai%403.0.103
