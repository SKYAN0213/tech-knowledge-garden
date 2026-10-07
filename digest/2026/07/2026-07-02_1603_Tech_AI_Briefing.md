# 2026-07-02 아침 브리핑

2026-07-02 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-02_1603_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입](https://skyan0213.github.io/tech-knowledge-garden/news/4f2226d872abe871)

발표 2026-07-02

NVIDIA가 2026년 7월 2일(한국시간) AI 클라우드 사업자의 인프라 조달을 돕는 수익 공유·신용 지원 모델을 발표했다. AI 클라우드가 NVIDIA 기반 서비스를 판매하면, NVIDIA는 일반 제품 판매 매출과 지원 용량에서 발생하는 클라우드 매출 일부를 받는 구조다.

### [GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개](https://skyan0213.github.io/tech-knowledge-garden/news/e456906813d94efb)

발표 2026-07-02

GitHub가 2026년 7월 2일(한국시간) 기업용 public monitoring을 공개 프리뷰로 제공한다고 발표했다. 회사 소유 저장소 밖의 공개 저장소·풀 리퀘스트 댓글·이슈에 노출된 비밀정보를 찾아, GitHub 계정과 검증된 도메인 정보로 해당 기업에 연결하는 기능이다.

### [Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가](https://skyan0213.github.io/tech-knowledge-garden/news/c2ff68732c7e19e0)

발표 2026-07-02

Vercel이 2026년 7월 2일(한국시간) AI SDK의 @ai-sdk/google 패키지 4.0.6을 배포했다. 이번 패치에 Vertex AI의 Gemini Interactions API를 호출하는 vertex.interactions() 함수를 추가했다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 2건

#### [NVIDIA, AI 클라우드에 수익 공유·신용 지원 조달 모델 도입](https://skyan0213.github.io/tech-knowledge-garden/news/4f2226d872abe871)

발표 2026-07-02

사업·고객 · 사업 모델 · NVIDIA · Sharon AI · Firmus · Baseten · Fireworks AI · Together AI

NVIDIA가 2026년 7월 2일(한국시간) AI 클라우드 사업자의 인프라 조달을 돕는 수익 공유·신용 지원 모델을 발표했다. AI 클라우드가 NVIDIA 기반 서비스를 판매하면, NVIDIA는 일반 제품 판매 매출과 지원 용량에서 발생하는 클라우드 매출 일부를 받는 구조다.

##### 초기 참여사의 GPU·전력 규모

NVIDIA는 Sharon AI와 Firmus를 초기 참여사로 소개했다. Sharon AI는 Grace Blackwell GB300 GPU를 최대 4만 개 배치하는 작업을 진행 중이다.

Firmus는 인도네시아 바탐에 DSX AI 팩토리 캠퍼스를 건설하고 있다. NVIDIA가 제시한 확장 계획은 360메가와트와 GPU 최대 17만 개다.

##### 학습에서 상시 추론까지

NVIDIA는 수요가 모델 개발에서 상시 가동하는 추론 인프라로 이동하고 있다고 설명했다. Baseten·Fireworks AI·Together AI가 필요로 하는 작업으로 모델 학습, 후속 학습, 미세조정, 대규모 에이전트 추론을 제시했다.

[NVIDIA 원문](https://blogs.nvidia.com/blog/nvidia-unlocks-ai-compute-at-scale-capital-partners-to-power-ai-infrastructure-buildout/)

#### [Vercel AI SDK, Vertex AI용 Gemini Interactions 호출 추가](https://skyan0213.github.io/tech-knowledge-garden/news/c2ff68732c7e19e0)

발표 2026-07-02

제품·서비스 · 기능 추가 · Vercel

Vercel이 2026년 7월 2일(한국시간) AI SDK의 @ai-sdk/google 패키지 4.0.6을 배포했다. 이번 패치에 Vertex AI의 Gemini Interactions API를 호출하는 vertex.interactions() 함수를 추가했다.

##### 리전별 요청과 기존 인증 사용

함수는 리전별 /locations/{region}/interactions 리소스로 요청하고, 인증에는 기존 Vertex OAuth 자격 증명을 사용한다. 공식 릴리스는 영상 출력이 가능한 gemini-omni-flash-preview를 지원 모델의 예로 들었다.

다른 프로바이더가 재사용할 수 있도록 GoogleInteractionsLanguageModel 클래스도 @ai-sdk/google/internal에서 내보냈다.

[api.github.com 원문](https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk/google%404.0.6)

### 사이버보안 · 1건

#### [GitHub, 기업 밖 공개 콘텐츠의 비밀정보 유출 감시 프리뷰 공개](https://skyan0213.github.io/tech-knowledge-garden/news/e456906813d94efb)

발표 2026-07-02

제품·서비스 · 기능 추가 · GitHub

GitHub가 2026년 7월 2일(한국시간) 기업용 public monitoring을 공개 프리뷰로 제공한다고 발표했다. 회사 소유 저장소 밖의 공개 저장소·풀 리퀘스트 댓글·이슈에 노출된 비밀정보를 찾아, GitHub 계정과 검증된 도메인 정보로 해당 기업에 연결하는 기능이다.

##### 계정과 이메일 도메인으로 기업을 식별

기업 멤버의 GitHub 계정이 커밋했는지 확인하거나, 커미터의 이메일이 기업·조직이 검증한 도메인에 속하는지 대조한다. 도메인 대조는 계정이 기업에 연결돼 있지 않거나 이메일이 공개되지 않은 경우에도 적용된다.

GitHub는 github.com의 공개 콘텐츠를 실시간으로 감시한다고 설명했다. 이 기능은 비공개 저장소를 검사하지 않고, 이미 공개된 비밀정보만 표시한다.

##### 지원 고객과 활성화 권한

대상은 GitHub Enterprise Cloud의 Secret Protection 또는 Advanced Security 고객이며 추가 비용은 없다. 엔터프라이즈 소유자와 보안 관리자가 Security 탭에서 켤 수 있고, 별도 구성을 하지 않아도 최근 유출과 이후 일치 항목을 확인할 수 있다.

데이터 레지던시를 사용하는 Enterprise Cloud 지원은 발표 당시 예정 상태였다.

[GitHub 원문](https://github.blog/changelog/2026-07-01-secret-scanning-public-monitoring-for-enterprises/)
