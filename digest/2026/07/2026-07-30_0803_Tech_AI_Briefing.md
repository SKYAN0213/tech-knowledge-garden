# 2026-07-30 아침 브리핑

2026-07-30 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-30_0803_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [OpenAI, 추론 보존·문맥 압축으로 ARC-AGI-3 점수 약 3배 높여](https://skyan0213.github.io/tech-knowledge-garden/news/265c6a0134aba9b6)

발표 2026-07-29

OpenAI는 7월 29일 GPT-5.6 Sol의 ARC-AGI-3 공개 과제 평가에서 추론 보존과 문맥 압축을 함께 적용한 결과를 공개했다. 회사에 따르면 공식 실행기의 점수는 13.3%였고, 두 설정을 적용한 실행기에서는 38.3%를 기록했다. 같은 실험에서 출력 토큰은 약 6분의 1로 줄었다고 보고했다.

### [OpenAI, 대학 연구자 10만 명에 무료 AI 도구 지원 계획 발표](https://skyan0213.github.io/tech-knowledge-garden/news/47da73cdc4f72b4c)

발표 2026-07-29

OpenAI는 7월 29일 선정된 대학 연구자에게 최신 모델과 연구 도구를 무료로 제공하는 ChatGPT for Academic Researchers를 발표했다. 2026년 여름 연구자 1만 명으로 시작해 2027년까지 10만 명으로 확대할 계획이다.

### [OpenAI, GPT-5.6 서빙과 에이전트 실행기의 효율 개선 공개](https://skyan0213.github.io/tech-knowledge-garden/news/eb71f165025c2507)

발표 2026-07-29

OpenAI는 7월 29일 GPT-5.6의 효율을 모델 학습, 추론 서버, Codex·ChatGPT Work 실행기에서 개선한 방법을 공개했다. 회사는 GPU 커널 개선을 합쳐 종단 간 모델 서빙 비용을 20% 줄였고, 초안 모델 개선으로 토큰 생성 효율을 15% 이상 높였다고 보고했다.

### [GitHub Copilot 코드리뷰, agent skills·MCP 정식 지원](https://skyan0213.github.io/tech-knowledge-garden/news/05746085e97d8c7d)

발표 2026-07-29

GitHub는 7월 29일 Copilot Pro·Pro+·Business·Enterprise의 코드리뷰에 agent skills와 MCP 서버 연결을 정식 제공한다고 발표했다. 팀의 코딩 기준과 내부 도구, 이슈 추적기·문서 시스템의 문맥을 리뷰에 반영하며 MCP 호출은 읽기 전용으로 제한한다.

### [GitHub, Copilot 기업용 새 모델 기본 허용 정책 8월 26일 시행 예고](https://skyan0213.github.io/tech-knowledge-garden/news/37ab4b1c66029ac0)

발표 2026-07-29

GitHub는 7월 29일 Copilot Business·Enterprise에서 정식 모델을 기본 허용하는 전역 정책을 발표했다. 정책은 8월 26일 시행되며, 그 전 28일 동안 조직과 기업이 기본 허용 여부를 설정할 수 있다. 이 준비 기간에는 사용자 모델 가용성이 바뀌지 않는다.

## 분야별 브리핑

### AI · 3건

#### [OpenAI, 추론 보존·문맥 압축으로 ARC-AGI-3 점수 약 3배 높여](https://skyan0213.github.io/tech-knowledge-garden/news/265c6a0134aba9b6)

발표 2026-07-29

연구·기술 · 성능 개선 · OpenAI

OpenAI는 7월 29일 GPT-5.6 Sol의 ARC-AGI-3 공개 과제 평가에서 추론 보존과 문맥 압축을 함께 적용한 결과를 공개했다. 회사에 따르면 공식 실행기의 점수는 13.3%였고, 두 설정을 적용한 실행기에서는 38.3%를 기록했다. 같은 실험에서 출력 토큰은 약 6분의 1로 줄었다고 보고했다.

##### 게임 규칙을 익히는 능력과 행동 효율

ARC-AGI-3는 에이전트가 지시 없이 낯선 2차원 게임을 탐색하며 규칙을 익히는 평가다. 점수에는 모델의 수행을 인간 기준과 비교하는 RHAE(Relative Human Action Efficiency) 지표를 사용한다.

##### 행동 뒤 추론을 남기고 오래된 문맥을 압축

공식 실행기는 게임 행동 뒤 내부 추론을 버렸고, 대화가 175,000문자를 넘으면 오래된 메시지를 삭제했다. OpenAI는 이전 응답 ID로 도구 호출과 턴 사이의 추론을 보존하고, 긴 문맥에는 compaction을 적용했다.

OpenAI가 사용한 실행기의 문맥 제한은 175,000토큰이었다. 원문의 공식 실행기 제한인 175,000문자와 비교 단위가 다르다.

[OpenAI 원문](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)

#### [OpenAI, 대학 연구자 10만 명에 무료 AI 도구 지원 계획 발표](https://skyan0213.github.io/tech-knowledge-garden/news/47da73cdc4f72b4c)

발표 2026-07-29

제품·서비스 · 기능 추가 · OpenAI

OpenAI는 7월 29일 선정된 대학 연구자에게 최신 모델과 연구 도구를 무료로 제공하는 ChatGPT for Academic Researchers를 발표했다. 2026년 여름 연구자 1만 명으로 시작해 2027년까지 10만 명으로 확대할 계획이다.

##### 참여 대상과 협업 계정

신청자는 연구 활동이 활발한 학위 수여 대학에 소속되어 있어야 하며, 소속과 수행 중인 연구·과학적 활용 목적을 제출한다. 연구자 한 명은 같은 기관의 협업자 최대 네 명을 초대할 수 있고, 협업자도 소속 인증과 전체 계정 수 집계 대상이다.

회사에 따르면 IAS와 ENS 등 일부 기관에는 발표 당시 접근이 이미 제공됐다.

##### 모델·문헌·데이터를 잇는 연구 도구

ChatGPT·ChatGPT Work·Codex의 최신 모델, 확장된 deep research, 더 높은 사용 한도와 문맥 창을 지원한다. 생명과학 skill 75개 이상은 유전체·단일세포 분석·단백질 모델링·신약 개발 등을 다룬다.

커넥터는 과학 문헌, 공개 유전체·임상 데이터, 위성 영상, 계산 노트북과 참고문헌 관리 도구를 연결한다. 연구 데이터는 기본적으로 모델 학습에 사용하지 않는다고 회사는 밝혔다.

[OpenAI 원문](https://openai.com/index/chatgpt-for-academic-researchers/)

#### [OpenAI, GPT-5.6 서빙과 에이전트 실행기의 효율 개선 공개](https://skyan0213.github.io/tech-knowledge-garden/news/eb71f165025c2507)

발표 2026-07-29

연구·기술 · 성능 개선 · 비용 절감 · OpenAI

OpenAI는 7월 29일 GPT-5.6의 효율을 모델 학습, 추론 서버, Codex·ChatGPT Work 실행기에서 개선한 방법을 공개했다. 회사는 GPU 커널 개선을 합쳐 종단 간 모델 서빙 비용을 20% 줄였고, 초안 모델 개선으로 토큰 생성 효율을 15% 이상 높였다고 보고했다.

##### 요청 배분과 GPU 커널

전역 요청은 지역·가용 용량·가속기 유형으로, 클러스터 내부 작업은 부하·문맥 길이·캐시 가용성 등으로 배분한다. GPT-5.6 Sol이 운영용 GPU 커널을 다시 작성·최적화했으며, FpSan 같은 도구로 정확성을 검증했다고 설명했다.

##### 작은 초안 모델의 토큰을 주 모델이 검증

추측 디코딩은 작은 모델이 여러 후보 토큰을 제안하고 주 모델이 병렬 검증하는 방식이다. 후보가 수락되면 주 모델을 한 번 실행해 여러 출력 토큰을 생성할 수 있다.

##### KV 캐시와 요청 특성에 맞춘 설정

캐시가 없는 입력에서 KV 캐시를 계산하고, 출력 생성에서는 이를 읽고 확장한다. 배치·샤딩·KV 관리 설정은 입력·출력 길이, 배치 크기, 캐시 적중률과 요청 특성에 맞춰 조정한다고 밝혔다.

##### 반복 요청의 앞부분을 재사용

프롬프트 캐싱은 이미 처리한 입력 앞부분의 계산을 재사용한다. 이를 유지하도록 새 기록은 문맥 끝에 추가하고 도구는 일정한 순서로 제시한다. 승인 정책 같은 실행 설정은 도구 정의 대신 실행 중 적용한다.

필요한 시점에 MCP 도구·skill·플러그인을 발견하고, 도구 출력은 별도 한도 요청이 없으면 기본 10,000토큰으로 제한한다.

[OpenAI 원문](https://openai.com/index/gpt-5-6-frontier-intelligence-efficiency/)

### 소프트웨어·클라우드 · 2건

#### [GitHub Copilot 코드리뷰, agent skills·MCP 정식 지원](https://skyan0213.github.io/tech-knowledge-garden/news/05746085e97d8c7d)

발표 2026-07-29

제품·서비스 · 기능 추가 · GitHub

GitHub는 7월 29일 Copilot Pro·Pro+·Business·Enterprise의 코드리뷰에 agent skills와 MCP 서버 연결을 정식 제공한다고 발표했다. 팀의 코딩 기준과 내부 도구, 이슈 추적기·문서 시스템의 문맥을 리뷰에 반영하며 MCP 호출은 읽기 전용으로 제한한다.

##### 저장소별 SKILL.md와 기존 MCP 설정

저장소의 .github/skills 아래 개별 디렉터리에 SKILL.md를 두어 해당 팀의 문맥과 지침을 전달한다. 기존 Copilot cloud agent용 MCP 설정은 코드리뷰에도 적용되고, 공개 미리보기에서 만든 설정을 그대로 사용할 수 있다.

##### 연결 설정과 리뷰 댓글 표시

새 연결은 저장소 설정의 Copilot → MCP servers에서 구성하고 인증 토큰은 Secrets and variables → Agents에 보관한다. GitHub·Playwright MCP는 기본으로 켜도록 안내했다.

리뷰 댓글에는 agent skills나 MCP 문맥을 사용했는지 표시한다.

[GitHub 원문](https://github.blog/changelog/2026-07-29-copilot-code-review-agent-skills-and-mcp-now-generally-available/)

#### [GitHub, Copilot 기업용 새 모델 기본 허용 정책 8월 26일 시행 예고](https://skyan0213.github.io/tech-knowledge-garden/news/37ab4b1c66029ac0)

발표 2026-07-29

제품·서비스 · 기능 추가 · GitHub

GitHub는 7월 29일 Copilot Business·Enterprise에서 정식 모델을 기본 허용하는 전역 정책을 발표했다. 정책은 8월 26일 시행되며, 그 전 28일 동안 조직과 기업이 기본 허용 여부를 설정할 수 있다. 이 준비 기간에는 사용자 모델 가용성이 바뀌지 않는다.

##### 설정하지 않은 모델은 기본 정책을 상속

명시적으로 설정하지 않은 모델은 unconfigured에서 inherits default로 바뀐다. 기본 정책을 켜면 사용할 수 있고 끄면 비활성 상태를 유지하며, 이후 기본 정책을 바꾸면 해당 모델들도 그 설정을 따른다.

##### 개별 설정과 기본 허용 제외 대상

개별 모델을 명시적으로 켜거나 끈 선택은 보존한다. 오픈웨이트 모델과 GitHub 데이터 보존 계약에 포함되지 않는 모델은 기본 허용 대상에서 제외된다.

[GitHub 원문](https://github.blog/changelog/2026-07-29-default-model-enablement-for-copilot-business-and-enterprise/)
