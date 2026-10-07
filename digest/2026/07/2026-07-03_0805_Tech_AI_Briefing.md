# 2026-07-03 아침 브리핑

2026-07-03 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-03_0805_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GitHub Copilot CLI, GitHub Actions에서 GITHUB_TOKEN으로 실행 가능](https://skyan0213.github.io/tech-knowledge-garden/news/4045784f5c7327c9)

발표 2026-07-03

GitHub는 2026년 7월 3일(한국시간) GitHub Copilot CLI가 GitHub Actions에서 내장 GITHUB\_TOKEN을 사용해 실행될 수 있도록 업데이트했다고 밝혔다. 이로써 개인 액세스 토큰(PAT) 없이도 워크플로에서 Copilot CLI를 구동할 수 있게 됐다.

### [AWS, Amazon Bedrock 기반 피싱 탐지 파이프라인 구현 방법 공개](https://skyan0213.github.io/tech-knowledge-garden/news/085adc2b94553d8f)

발표 2026-07-03

AWS는 2026년 7월 3일(한국시간) Amazon Bedrock을 이용해 AI 생성 피싱 이메일을 분석하는 구현 방법을 공개했다. 기존 메일 인증에 발신자의 평소 행동과 업무 맥락을 비교하는 모델 분석을 더하고, 위험 점수에 따라 수신·격리·차단을 나누는 설계다.

### [AWS, 다중 턴 에이전트 강화학습의 환경·보상·평가 설계 지침 공개](https://skyan0213.github.io/tech-knowledge-garden/news/bfeae69131afd34f)

발표 2026-07-03

AWS는 2026년 7월 3일(한국시간) Amazon SageMaker AI에서 다중 턴 에이전트를 강화학습으로 훈련할 때 적용할 설계 지침을 공개했다. SOP-Bench 사례를 바탕으로 실제 서비스와 분리한 학습 환경, 보상과 독립적인 업무 성공 평가, 학습 중 점검할 지표를 설명했다.

### [Vercel AI SDK 7.0.14, 실험적 스트리밍 음성 전사 지원 추가](https://skyan0213.github.io/tech-knowledge-garden/news/b435ebb16bb8038a)

발표 2026-07-03

Vercel은 2026년 7월 3일(한국시간) AI SDK의 ai 패키지 7.0.14를 공개했다. OpenAI gpt-realtime-whisper와 xAI WebSocket STT를 포함한 음성 전사 모델에 실험적 스트리밍 지원을 추가했다.

## 분야별 브리핑

### AI · 1건

#### [AWS, 다중 턴 에이전트 강화학습의 환경·보상·평가 설계 지침 공개](https://skyan0213.github.io/tech-knowledge-garden/news/bfeae69131afd34f)

발표 2026-07-03

연구·기술 · 구현·운영 지침 · AWS

AWS는 2026년 7월 3일(한국시간) Amazon SageMaker AI에서 다중 턴 에이전트를 강화학습으로 훈련할 때 적용할 설계 지침을 공개했다. SOP-Bench 사례를 바탕으로 실제 서비스와 분리한 학습 환경, 보상과 독립적인 업무 성공 평가, 학습 중 점검할 지표를 설명했다.

##### 도구 실행을 실제 서비스와 분리

AWS는 실제 도구의 입력·출력 형식과 업무 로직을 유지한 시뮬레이션 또는 샌드박스 환경을 권장했다. 읽기 전용 도구는 기록한 응답을 재생하고, 상태를 바꾸는 도구는 학습 에피소드마다 자원을 따로 만든 뒤 실패하거나 종료돼도 정리한다. 코드·SQL·수학 결과는 격리된 환경에서 실행해 같은 입력과 상태가 같은 결과를 내도록 한다.

##### 보상 점수와 업무 성공을 따로 확인

SOP-Bench의 독립 평가는 final\_output 태그에 담긴 최종 JSON의 모든 필드가 정답과 일치해야 성공으로 판정한다. 학습 보상에는 부분 점수를 줄 수 있지만, 이를 업무 성공 평가와 동일하게 취급하지 않는다. SageMaker의 MultiTurnRLEvaluator도 기본적으로 에이전트가 정의한 보상 함수로 평가하므로, 보상과 독립적인 검증을 하려면 같은 실행 결과를 별도의 엄격한 판정기로 확인해야 한다.

##### 출력 형식 불일치가 만든 실패 사례

AWS가 소개한 SOP-Bench 실행에서는 보상 계산기가 final\_output 대신 final\_response 형식도 받아들였다. 모델이 평가에 필요한 태그를 생략하면서 학습 보상은 올라갔지만 독립 평가 성능은 내려갔다. AWS는 이런 차이를 발견하면 실행 과정을 읽고 보상 계산기와 평가 기준을 대조하도록 설명했다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/best-practices-for-multi-turn-reinforcement-learning-in-amazon-sagemaker-ai/)

### 소프트웨어·클라우드 · 2건

#### [GitHub Copilot CLI, GitHub Actions에서 GITHUB_TOKEN으로 실행 가능](https://skyan0213.github.io/tech-knowledge-garden/news/4045784f5c7327c9)

발표 2026-07-03

제품·서비스 · 기능 추가 · GitHub

GitHub는 2026년 7월 3일(한국시간) GitHub Copilot CLI가 GitHub Actions에서 내장 GITHUB\_TOKEN을 사용해 실행될 수 있도록 업데이트했다고 밝혔다. 이로써 개인 액세스 토큰(PAT) 없이도 워크플로에서 Copilot CLI를 구동할 수 있게 됐다.

##### 조직 단위 AI 크레딧 청구

조직 소유 저장소에서 Copilot CLI가 Actions 토큰으로 실행되면, CLI가 소모한 AI 크레딧은 해당 조직에 직접 청구된다.

이 기능을 사용하려면 'Allow use of Copilot CLI billed to the organization' 정책이 활성화되어야 하며, 기존 'Copilot CLI' 정책이 켜져 있다면 기본으로 활성화된다.

GitHub는 조직 단위 청구에 사용자별 예산이 적용되지 않는다고 밝혔다. 조직을 비용 센터(cost center)에 묶어 예산을 설정하고, 청구·사용량 대시보드로 비용을 확인하며, 각 워크플로에 최대 AI 크레딧 세션 한도를 둘 수 있다.

##### 실행 조건 및 설정

내장 GITHUB\_TOKEN을 사용하는 워크플로는 copilot-requests: write 권한이 필요하며, 추가 시크릿은 요구되지 않는다.

사용자는 copilot update 명령으로 업데이트하거나 npm install -g @github/copilot로 재설치하여 최신 버전의 Copilot CLI를 사용해야 한다.

[GitHub 원문](https://github.blog/changelog/2026-07-02-copilot-cli-no-longer-needs-a-personal-access-token-in-github-actions/)

#### [Vercel AI SDK 7.0.14, 실험적 스트리밍 음성 전사 지원 추가](https://skyan0213.github.io/tech-knowledge-garden/news/b435ebb16bb8038a)

발표 2026-07-03

제품·서비스 · 기능 추가 · Vercel

Vercel은 2026년 7월 3일(한국시간) AI SDK의 ai 패키지 7.0.14를 공개했다. OpenAI gpt-realtime-whisper와 xAI WebSocket STT를 포함한 음성 전사 모델에 실험적 스트리밍 지원을 추가했다.



[api.github.com 원문](https://api.github.com/repos/vercel/ai/releases/tags/ai%407.0.14)

### 사이버보안 · 1건

#### [AWS, Amazon Bedrock 기반 피싱 탐지 파이프라인 구현 방법 공개](https://skyan0213.github.io/tech-knowledge-garden/news/085adc2b94553d8f)

발표 2026-07-03

연구·기술 · 구현·운영 지침

AWS는 2026년 7월 3일(한국시간) Amazon Bedrock을 이용해 AI 생성 피싱 이메일을 분석하는 구현 방법을 공개했다. 기존 메일 인증에 발신자의 평소 행동과 업무 맥락을 비교하는 모델 분석을 더하고, 위험 점수에 따라 수신·격리·차단을 나누는 설계다.

##### 메일 인증 뒤 행동과 업무 맥락 비교

소개된 흐름은 먼저 SPF·DKIM·DMARC로 발신 서버와 메시지 인증을 검사한다. 이어 발신자의 평소 어휘·말투·요청 유형을 데이터베이스에 둔 기준선과 비교하고, 이메일 내용·조직의 업무 맥락·알려진 피싱 사례를 Amazon Bedrock Knowledge Bases에서 가져와 분석 프롬프트를 구성한다.

##### 필터 설정과 메시지 처리

AWS는 Bedrock Guardrails로 개인정보를 가릴 수 있지만, 필터가 너무 엄격하면 검토해야 할 의심스러운 문구까지 분석 전에 막을 수 있다고 설명했다. 보안 분석에는 해당 콘텐츠를 평가할 수 있도록 설정하면서 다른 용도의 입력·출력 보호를 유지하고, 답변이 실제 이메일 내용에 근거하는지도 확인하는 방식이다.

콘텐츠 이상·행동 편차·맥락의 적절성 점수는 0\~100의 위험 점수로 합쳐진다. 안전한 메일은 수신함으로 보내고, 의심스러운 메일은 보안팀 검토를 위해 격리하며, 위험한 메일은 차단하도록 구성한다.

##### 검토 결과를 다음 분석에 반영

보안팀이 오탐으로 확인한 결과는 발신자 기준선을 수정하는 데 사용한다. 확인된 피싱과 정상 메시지는 검증된 예시로 쌓아 다음 프롬프트에 포함하고, 보안팀의 피드백으로 분석 지시를 다듬는다.

[aws.amazon.com 원문](https://aws.amazon.com/blogs/machine-learning/how-amazon-bedrock-catches-ai-generated-phishing/)
