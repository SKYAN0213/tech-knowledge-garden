---
title: Tech & AI Briefing - 00:05
time: 00:05
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-06-26
timezone: Asia/Seoul
coverage_start: 2026-06-24T07:00:00+09:00
coverage_end: 2026-06-26T00:05:00+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 11
new_items_count: 10
linked_knowledge_notes:
  - AI Inference Infrastructure
  - AI Agents
  - AI Agent Security and Governance
  - Agent Evaluation and Observability
  - AI for Scientific Discovery
  - Vision-Language-Action Models
  - Knowledge/AI Systems/AI Agents
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - OpenAI·Broadcom, LLM 추론 칩 Jalapeño 시제품 공개…연말 초기 배치 계획
  - OpenAI, Codex 업무 연구 공개…긴 작업 요청과 비개발자 사용 추적
  - GitHub Copilot Free·Student, 모델 수동 선택 대신 자동 선택으로 통일
  - GitHub, 기업 계정의 토큰·SSH 키를 일괄 회수하는 기능 추가
  - Hugging Face, Slack 대화와 작업 기록을 이어가는 내부 Moon Bot 구조 공개
article_records:
  - title: OpenAI·Broadcom, LLM 추론 칩 Jalapeño 시제품 공개…연말 초기 배치 계획
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: OpenAI와 Broadcom은 2026년 6월 24일(한국시간), 대규모 언어 모델의 추론을 위해 설계한 가속기 Jalapeño를
      공개했다. Broadcom 발표에 따르면 엔지니어링 시제품은 연구실에서 목표 주파수·전력으로 모델 작업을 실행하고 있으며, 여러
      세대에 걸친 플랫폼의 초기 배치는 2026년 말까지 진행할 계획이다.
    explanations:
      - heading: 칩과 시스템의 역할
        paragraphs:
          - OpenAI는 모델·커널·서빙 구조에 맞춰 칩을 설계하고, Broadcom은 실리콘 구현·네트워킹을, Celestica는
            보드·랙·시스템 통합을 맡는다. 설계는 데이터 이동을 줄이고 연산·메모리·네트워크 자원의 균형을 맞추는 방향이다.
        source_urls:
          - https://investors.broadcom.com/news-releases/news-release-details/openai-and-broadcom-unveil-llm-optimized-intelligence-processor
      - heading: 개발 기간과 초기 평가
        paragraphs:
          - 양사는 초기 설계부터 제조용 설계 확정인 테이프아웃까지 9개월이 걸렸으며, 설계·최적화 일부에 OpenAI 모델을
            활용했다고 밝혔다. 시제품 공개와 데이터센터 배치 계획은 별개 단계다.
          - 와트당 성능 개선은 초기 시험에 근거한 회사의 설명이다. 최종 성능 측정은 진행 중이며 구체적 기술 보고서를 추후 공개할
            예정이라고 밝혔다.
        source_urls:
          - https://investors.broadcom.com/news-releases/news-release-details/openai-and-broadcom-unveil-llm-optimized-intelligence-processor
    papers: []
    relations: []
    topic_ids: []
  - title: OpenAI, Codex 업무 연구 공개…긴 작업 요청과 비개발자 사용 추적
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: OpenAI는 2026년 6월 25일 Codex 사용 기록으로 에이전트의 업무 활용을 조사한 경제 연구를 소개했다.
      개인·조직·OpenAI 내부 사용을 구분하고, 여러 도구를 쓰며 장시간 진행하는 위임 작업과 비개발자의 사용 변화를 분석했다.
    explanations:
      - heading: 작업 시간 지표의 뜻
        paragraphs:
          - 회사는 2026년 5월 개인 사용자 표본의 80.6%가 사람이 30분 이상 걸릴 것으로 추정한 요청을 한 번 이상 했다고
            밝혔다. 이는 사용자 비율이며 전체 요청의 비율이 아니다.
          - 시간은 실제 절약 시간을 측정한 값이 아니라 Codex 대화를 읽은 판정용 언어 모델의 추정이다. 개인 사용자 중 무작위
            0.1% 표본의 질의를 사용했다.
        source_urls:
          - https://openai.com/index/how-agents-are-transforming-work/
      - heading: 직무를 넘나드는 사용
        paragraphs:
          - OpenAI 내부의 업무 부서에서 생성한 Codex 결과 중 4분의 1 이상은 엔지니어링·코딩 작업으로 분류됐다. 이
            지표는 결과 토큰과 추정 직무를 비교한 것이며 회사 밖 전체 근로자의 생산성 측정은 아니다.
        source_urls:
          - https://openai.com/index/how-agents-are-transforming-work/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub Copilot Free·Student, 모델 수동 선택 대신 자동 선택으로 통일
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 25일(한국시간), Copilot Free·Student 요금제의 모델 선택을 자동 선택으로 통일한다고
      발표했다. 작업별 모델을 자동으로 선택하며, 해당 요금제에서는 자동 선택이 기본이자 유일한 선택 방식이 된다.
    explanations:
      - heading: 접근 범위와 표시 변경
        paragraphs:
          - 자동 선택은 여러 모델 계열을 이용하지만 요금제 제한을 따른다. GitHub는 Microsoft가 출시한 모델의
            Preview 표시도 제거한다고 밝혔다.
        source_urls:
          - https://github.blog/changelog/2026-06-24-changes-to-model-selection-for-free-and-student-plans/
    papers: []
    relations: []
    topic_ids: []
  - title: GitHub, 기업 계정의 토큰·SSH 키를 일괄 회수하는 기능 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: GitHub는 2026년 6월 25일(한국시간), 계정 침해나 자격증명 탈취에 대응하는 기업 계정의 일괄 회수 기능을 발표했다. 기업
      소유자와 Manage enterprise credentials 권한을 가진 구성원은 특정 사용자 또는 기업 전체의 자격증명에 조치할
      수 있다.
    explanations:
      - heading: 인증 해제와 삭제의 범위
        paragraphs:
          - 개인 액세스 토큰·SSH 키·OAuth 토큰의 기업 SSO 승인을 회수할 수 있다. 토큰·SSH 키 자체의 삭제는
            Enterprise Managed Users 계정에만 제공하며, 조직별 SSO 승인 목록·회수는 조직 REST API로
            지원한다.
        source_urls:
          - https://github.blog/changelog/2026-06-24-self-service-credential-revocation-for-incident-response/
      - heading: 본인 회수와 감사 기록
        paragraphs:
          - 개별 기업 구성원은 Settings의 Credentials에서 자신의 자격증명 수를 확인하고 토큰·키를 하나씩 처리하지
            않고 일괄 회수·삭제할 수 있다. 기업 소유자와 해당 사용자는 감사 로그·이메일 알림에서 조치 내용을 확인한다.
        source_urls:
          - https://github.blog/changelog/2026-06-24-self-service-credential-revocation-for-incident-response/
    papers: []
    relations: []
    topic_ids: []
  - title: Hugging Face, Slack 대화와 작업 기록을 이어가는 내부 Moon Bot 구조 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Hugging Face는 2026년 6월 24일(한국시간), Slack에서 코드·로그·데이터를 조회하고 작업을 요청하는 내부 도구
      Moon Bot의 구조를 공개했다. Pi 코딩 에이전트 SDK와 Kubernetes 실행 환경을 사용하며, 대화와 도구 호출 기록을
      Hugging Face Buckets에 저장해 재시작 뒤에도 작업을 이어간다.
    explanations:
      - heading: 스레드별 작업과 기억
        paragraphs:
          - Slack 스레드마다 독립적인 에이전트 세션을 생성한다. 도구 호출 결과까지 담은 JSONL 파일과 스레드·세션의 대응표를
            저장하고, 이어지는 메시지에서 필요한 세션을 내려받는다.
          - 응답 Markdown과 세션 기록에 연결되는 버튼을 Slack에 제공한다. 과거 상호작용 기록은 별도 기억 도구로
            검색하며, Markdown 스킬은 CLI 사용법과 코드베이스 관례를 전달한다.
        source_urls:
          - https://huggingface.co/blog/huggingface/moon-bot
      - heading: 사용한 SDK
        paragraphs:
          - Moon Bot의 코딩 SDK는 Pi다. 별도로 인용한 Pipecat은 실시간 음성·멀티모달 에이전트를 만드는 Python
            프레임워크다.
        source_urls:
          - https://github.com/pipecat-ai/pipecat
          - https://huggingface.co/blog/huggingface/moon-bot
      - heading: 권한과 쓰기 경로
        paragraphs:
          - Okta 그룹으로 사용자의 접근 등급을 결정하고 등급마다 별도 Linux 사용자와 자격증명 환경을 둔다. 외부 서비스 키는
            프록시가 서버 측에서 삽입하고, 에이전트 실행 환경에는 원래 키를 전달하지 않는다.
          - PR·이슈 쓰기는 에이전트의 셸이 아니라 봇 프로세스의 전용 도구가 수행한다. 이 경로에서 짧은 유효기간의 GitHub
            App 토큰을 사용하고 에이전트 도구 호출에는 토큰을 노출하지 않는다.
        source_urls:
          - https://huggingface.co/blog/huggingface/moon-bot
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, Transformers v5 기반 NeMo AutoModel 학습 구조와 MoE 비교 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-25
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: NVIDIA는 2026년 6월 25일(한국시간) Hugging Face에 NeMo AutoModel의 전문가 혼합 모델 학습 구조와
      성능 비교를 공개했다. Transformers v5의 모델 로딩 API를 유지하면서 전문가 병렬화, 통신·연산 결합과 최적화 커널을
      추가하는 방식이다.
    explanations:
      - heading: 모델과 체크포인트 호환
        paragraphs:
          - NeMoAutoModelForCausalLM은 Transformers의 AutoModelForCausalLM을 상속한다.
            모델 종류에 따라 최적화 구현이나 기본 Hugging Face 경로를 사용하고 저장 결과는 표준 Hugging Face
            체크포인트 형식을 유지한다.
        source_urls:
          - https://huggingface.co/blog/nvidia/accelerating-fine-tuning-nvidia-nemo-automodel
      - heading: 속도 비교의 실행 조건
        paragraphs:
          - 단일 노드 비교는 H100 80GB GPU 8개, 시퀀스 길이 4,096, 로컬 배치 크기 1에서 진행했다. NeMo는
            전문가 병렬화 크기 8과 균등 라우팅 게이트를 사용했고, Transformers v5는 같은 더미 토큰에 기본 라우터를
            적용했다.
          - NVIDIA는 Qwen3-30B-A3B와 Nemotron 3 Nano 30B-A3B에서 최적화한 v5 대비 약
            3.4~3.7배 높은 학습 처리량과 29~32% 적은 GPU 메모리를 보고했다. 라우팅 방식이 다른 해당 학습 비교
            결과다.
        source_urls:
          - https://huggingface.co/blog/nvidia/accelerating-fine-tuning-nvidia-nemo-automodel
      - heading: 전문가 병렬화의 역할
        paragraphs:
          - 전문가 가중치를 GPU에 나누고 DeepEP로 토큰 전달과 전문가 계산을 겹친다. NeMo에서는 전문가 병렬화와 데이터
            병렬화를 별도 축으로 구성한다.
        source_urls:
          - https://huggingface.co/blog/nvidia/accelerating-fine-tuning-nvidia-nemo-automodel
    papers: []
    relations: []
    topic_ids: []
  - title: Microsoft, Talos 유전체 재분석 결과 소개…4,735명에서 추가 진단 확인
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: Microsoft Research는 2026년 6월 24일(한국시간), 희귀질환의 기존 유전체 데이터를 반복 재분석하는 오픈소스 도구
      Talos의 연구 결과를 소개했다. 새로운 유전자·질병 관계나 변이 판정 근거를 반영해 후보를 추리고, 반복 실행에서는 지난 분석
      이후 근거가 바뀐 변이만 전문가 검토에 올리는 구조다.
    explanations:
      - heading: 새 근거와 환자 조건의 결합
        paragraphs:
          - PanelApp Australia에서 유전자·질병 관계와 유전 방식을, ClinVar에서 변이의 병원성 정보를 읽는다.
            가족 구조와 이용 가능한 환자 표현형으로 후보를 추가로 좁힌다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/talos-scaling-rare-disease-diagnosis-with-automated-iterative-genomic-reanalysis/
      - heading: 검증 집단과 실제 재분석 집단
        paragraphs:
          - ACG·RGP 검증 집단은 합계 1,089명의 발단자를 포함한다. ACG 부모·자녀 조합에서 분석 범위 안의 기존 진단
            90%를 회수했고, RGP 조합에서는 54건 중 47건을 회수했다고 연구진은 밝혔다.
          - 별도의 미진단 4,735명 재분석 집단에서 238명에게 241개의 새로운 진단이 나왔고 추가 진단 수율은 5.1%였다.
            원인일 가능성이 있는 변이는 이후 인증 검사실에서 병원성 또는 병원성 가능 변이로 확인됐다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/talos-scaling-rare-disease-diagnosis-with-automated-iterative-genomic-reanalysis/
      - heading: 월별 반복 실행
        paragraphs:
          - 29회의 월별 재분석에서는 새로 검토할 변이가 평균적으로 환자 200명당 1개였다고 보고했다. 공개 데이터베이스의 새
            근거부터 진단까지 걸린 시간은 평균 32일이었다.
        source_urls:
          - https://www.microsoft.com/en-us/research/blog/talos-scaling-rare-disease-diagnosis-with-automated-iterative-genomic-reanalysis/
    papers: []
    relations: []
    topic_ids: []
  - title: RL 학습 모델과 기준 모델의 확률비로 에이전트 진행을 평가하는 연구
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 24일 arXiv에 에이전트의 단계별 진행을 평가하는 progress advantage 연구를 사전공개했다.
      강화학습으로 사후 학습한 정책과 기준 정책의 로그 확률비를 이용해, 별도 보상 모델 학습 없이 단계별 평가 신호를 얻는 방법을
      제시했다.
    explanations:
      - heading: 방법과 비교 대상
        paragraphs:
          - 저자들은 확률적 마르코프 의사결정 과정에서 최적 어드밴티지와 연결되는 신호를 유도했다. 실행 중 추가 계산, 불확실성
            정량화, 실패 원인 배정의 세 응용을 시험했다.
          - 초록은 5개 벤치마크와 4개 모델 계열에서 신뢰도 기반 비교 방법 및 별도로 학습한 보상 모델보다 나은 결과를 보고한다.
            작업별 추가 보상 모델 학습이 필요 없는 신호라는 점을 강조했다.
        source_urls:
          - https://arxiv.org/abs/2606.26080v1
    papers:
      - work_id: arxiv-2606-26080
        identifiers:
          - arxiv:2606.26080v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.26080v1
    relations: []
    topic_ids: []
  - title: 자기 증류 모델의 평균 정답률과 답변 다양성을 따로 비교한 연구
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 24일 arXiv에 샘플 정답 시범을 사용하는 온폴리시 자기 증류의 출력 다양성 연구를 사전공개했다. 한
      모델이 교사와 학생을 맡고 교사가 정답 시범을 문맥으로 받아 학생 출력에 피드백을 주는 방식에서, 답변을 더 생성해도 정답률이 잘
      늘지 않는 현상을 분석했다.
    explanations:
      - heading: 학습 신호와 출력 집중
        paragraphs:
          - 저자들은 시범과 학생 출력의 점별 조건부 상호정보량으로 학습 후 분포가 기울어지는 구조를 설명했다. 같은 정도로 맞는 답들
            사이의 확률 차이가 커져 기존에 우세한 응답 방식에 출력이 집중될 수 있다고 제시했다.
        source_urls:
          - https://arxiv.org/abs/2606.26091v1
      - heading: 실험에서 구분한 성능
        paragraphs:
          - 제어된 그래프 경로 찾기와 과학 질의응답 시험에서 평균 성능은 강화학습과 비슷하거나 높았지만 기능·의미 다양성은 낮았다고
            초록은 보고한다. 여러 전략이 필요한 분포 밖 조건에서는 실패가 나타났다.
        source_urls:
          - https://arxiv.org/abs/2606.26091v1
    papers:
      - work_id: arxiv-2606-26091
        identifiers:
          - arxiv:2606.26091v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.26091v1
    relations: []
    topic_ids: []
  - title: 로봇 행동 궤적을 먼저 학습해 VLA에 옮기는 두 단계 연구 공개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: 미기재
      when: 2026-06-24
      where: 미기재
      what: 미기재
      how: 미기재
      why: 미기재
    lead: 연구진은 2026년 6월 24일 arXiv에 서로 다른 로봇 형태의 행동 궤적을 먼저 학습하는 시각·언어·행동 모델 연구를
      사전공개했다. 영상·언어와 행동을 한꺼번에 학습하기 전에 행동 모듈에 시간적 움직임 구조를 학습시키고, 그 결과를 VLA 학습으로
      옮기는 방법이다.
    explanations:
      - heading: 행동 학습과 시각·언어 정렬
        paragraphs:
          - 첫 단계는 영상·언어 토큰 없이 행동 궤적만으로 가벼운 플로 매칭 인코더·디코더를 학습한다. 두 번째 단계는 디코더
            재사용과 초기 잠재 표현 증류로 시각·언어 특징을 행동 표현에 정렬한다.
          - 학습한 인코더는 상태·행동 이력을 하나의 시간 문맥 토큰으로 압축하는 역할도 맡는다.
        source_urls:
          - https://arxiv.org/abs/2606.26095v1
      - heading: 보고된 로봇 시험
        paragraphs:
          - 초록은 시뮬레이션과 실제 환경의 13개 형태 간 작업에서 행동 사전학습 없는 VLA보다 빠른 수렴과 높은 성공률을
            보고한다. 실제 환경의 데이터 부족 조건에서도 성능이 개선됐으며, 첫 단계 행동 데이터를 늘리면 후속 VLA 성능이
            좋아졌다고 밝혔다.
        source_urls:
          - https://arxiv.org/abs/2606.26095v1
    papers:
      - work_id: arxiv-2606-26095
        identifiers:
          - arxiv:2606.26095v1
        access: 초록
        status: 사전공개
        evidence_url: https://arxiv.org/abs/2606.26095v1
    relations: []
    topic_ids: []
article_reviews:
  - title: OpenAI·Broadcom, LLM 추론 칩 Jalapeño 시제품 공개…연말 초기 배치 계획
    event_id: 78dd55bd3d76bf5e
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-24T09:00:48-04:00
  - title: OpenAI, Codex 업무 연구 공개…긴 작업 요청과 비개발자 사용 추적
    event_id: 5f6807aa79d170e1
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids:
      - agents
    date_kind: source-publication-day
    source_published_at: 2026-06-25
  - title: GitHub Copilot Free·Student, 모델 수동 선택 대신 자동 선택으로 통일
    event_id: d9ba5ead7fa4b5a5
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-24T09:28:36-07:00
  - title: GitHub, 기업 계정의 토큰·SSH 키를 일괄 회수하는 기능 추가
    event_id: 83a8d71c767e86f0
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-24T09:47:20-07:00
  - title: Hugging Face, Slack 대화와 작업 기록을 이어가는 내부 Moon Bot 구조 공개
    event_id: 71522d4915be298f
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids:
      - agents
    date_kind: source-publication-time
    source_published_at: 2026-06-24T07:33:01.646Z
  - title: NVIDIA, Transformers v5 기반 NeMo AutoModel 학습 구조와 MoE 비교 공개
    event_id: ad312ce435987076
    review_status: verified
    published_at: 2026-06-25
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-24T16:00:13.165Z
  - title: Microsoft, Talos 유전체 재분석 결과 소개…4,735명에서 추가 진단 확인
    event_id: d68af779b2d48755
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-06-24T14:00:14+00:00
  - title: RL 학습 모델과 기준 모델의 확률비로 에이전트 진행을 평가하는 연구
    event_id: 09b46ad807916591
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-24
  - title: 자기 증류 모델의 평균 정답률과 답변 다양성을 따로 비교한 연구
    event_id: bd280179fb026f84
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-24
  - title: 로봇 행동 궤적을 먼저 학습해 VLA에 옮기는 두 단계 연구 공개
    event_id: cea0a4cfbb6e7a28
    review_status: verified
    published_at: 2026-06-24
    reviewed_at: 2026-10-09
    concept_ids: []
    date_kind: source-publication-day
    source_published_at: 2026-06-24
---

# 이번 호 표지

OpenAI·Broadcom, LLM 추론 칩 Jalapeño 시제품 공개…연말 초기 배치 계획

# 차례

- OpenAI·Broadcom, LLM 추론 칩 Jalapeño 시제품 공개…연말 초기 배치 계획
- OpenAI, Codex 업무 연구 공개…긴 작업 요청과 비개발자 사용 추적
- GitHub Copilot Free·Student, 모델 수동 선택 대신 자동 선택으로 통일
- GitHub, 기업 계정의 토큰·SSH 키를 일괄 회수하는 기능 추가
- Hugging Face, Slack 대화와 작업 기록을 이어가는 내부 Moon Bot 구조 공개

# 커버 스토리

없음

# 뉴스 데스크

## OpenAI·Broadcom, LLM 추론 칩 Jalapeño 시제품 공개…연말 초기 배치 계획

**분야:** 반도체·컴퓨팅
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 신제품
**기업·기관:** OpenAI, Broadcom, Celestica

OpenAI와 Broadcom은 2026년 6월 24일(한국시간), 대규모 언어 모델의 추론을 위해 설계한 가속기 Jalapeño를 공개했다. Broadcom 발표에 따르면 엔지니어링 시제품은 연구실에서 목표 주파수·전력으로 모델 작업을 실행하고 있으며, 여러 세대에 걸친 플랫폼의 초기 배치는 2026년 말까지 진행할 계획이다. [S1]

### 칩과 시스템의 역할

OpenAI는 모델·커널·서빙 구조에 맞춰 칩을 설계하고, Broadcom은 실리콘 구현·네트워킹을, Celestica는 보드·랙·시스템 통합을 맡는다. 설계는 데이터 이동을 줄이고 연산·메모리·네트워크 자원의 균형을 맞추는 방향이다. [S1]

### 개발 기간과 초기 평가

양사는 초기 설계부터 제조용 설계 확정인 테이프아웃까지 9개월이 걸렸으며, 설계·최적화 일부에 OpenAI 모델을 활용했다고 밝혔다. 시제품 공개와 데이터센터 배치 계획은 별개 단계다.

와트당 성능 개선은 초기 시험에 근거한 회사의 설명이다. 최종 성능 측정은 진행 중이며 구체적 기술 보고서를 추후 공개할 예정이라고 밝혔다. [S1]

## OpenAI, Codex 업무 연구 공개…긴 작업 요청과 비개발자 사용 추적

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** OpenAI

OpenAI는 2026년 6월 25일 Codex 사용 기록으로 에이전트의 업무 활용을 조사한 경제 연구를 소개했다. 개인·조직·OpenAI 내부 사용을 구분하고, 여러 도구를 쓰며 장시간 진행하는 위임 작업과 비개발자의 사용 변화를 분석했다. [S2]

### 작업 시간 지표의 뜻

회사는 2026년 5월 개인 사용자 표본의 80.6%가 사람이 30분 이상 걸릴 것으로 추정한 요청을 한 번 이상 했다고 밝혔다. 이는 사용자 비율이며 전체 요청의 비율이 아니다.

시간은 실제 절약 시간을 측정한 값이 아니라 Codex 대화를 읽은 판정용 언어 모델의 추정이다. 개인 사용자 중 무작위 0.1% 표본의 질의를 사용했다. [S2]

### 직무를 넘나드는 사용

OpenAI 내부의 업무 부서에서 생성한 Codex 결과 중 4분의 1 이상은 엔지니어링·코딩 작업으로 분류됐다. 이 지표는 결과 토큰과 추정 직무를 비교한 것이며 회사 밖 전체 근로자의 생산성 측정은 아니다. [S2]

**개념:** [[Knowledge/AI Systems/AI Agents]]

## GitHub Copilot Free·Student, 모델 수동 선택 대신 자동 선택으로 통일

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** GitHub

GitHub는 2026년 6월 25일(한국시간), Copilot Free·Student 요금제의 모델 선택을 자동 선택으로 통일한다고 발표했다. 작업별 모델을 자동으로 선택하며, 해당 요금제에서는 자동 선택이 기본이자 유일한 선택 방식이 된다. [S3]

### 접근 범위와 표시 변경

자동 선택은 여러 모델 계열을 이용하지만 요금제 제한을 따른다. GitHub는 Microsoft가 출시한 모델의 Preview 표시도 제거한다고 밝혔다. [S3]

## GitHub, 기업 계정의 토큰·SSH 키를 일괄 회수하는 기능 추가

**분야:** 사이버보안
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** GitHub

GitHub는 2026년 6월 25일(한국시간), 계정 침해나 자격증명 탈취에 대응하는 기업 계정의 일괄 회수 기능을 발표했다. 기업 소유자와 Manage enterprise credentials 권한을 가진 구성원은 특정 사용자 또는 기업 전체의 자격증명에 조치할 수 있다. [S4]

### 인증 해제와 삭제의 범위

개인 액세스 토큰·SSH 키·OAuth 토큰의 기업 SSO 승인을 회수할 수 있다. 토큰·SSH 키 자체의 삭제는 Enterprise Managed Users 계정에만 제공하며, 조직별 SSO 승인 목록·회수는 조직 REST API로 지원한다. [S4]

### 본인 회수와 감사 기록

개별 기업 구성원은 Settings의 Credentials에서 자신의 자격증명 수를 확인하고 토큰·키를 하나씩 처리하지 않고 일괄 회수·삭제할 수 있다. 기업 소유자와 해당 사용자는 감사 로그·이메일 알림에서 조치 내용을 확인한다. [S4]

## Hugging Face, Slack 대화와 작업 기록을 이어가는 내부 Moon Bot 구조 공개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 구현·운영 지침
**기업·기관:** Hugging Face

Hugging Face는 2026년 6월 24일(한국시간), Slack에서 코드·로그·데이터를 조회하고 작업을 요청하는 내부 도구 Moon Bot의 구조를 공개했다. Pi 코딩 에이전트 SDK와 Kubernetes 실행 환경을 사용하며, 대화와 도구 호출 기록을 Hugging Face Buckets에 저장해 재시작 뒤에도 작업을 이어간다. [S5] [S6]

### 스레드별 작업과 기억

Slack 스레드마다 독립적인 에이전트 세션을 생성한다. 도구 호출 결과까지 담은 JSONL 파일과 스레드·세션의 대응표를 저장하고, 이어지는 메시지에서 필요한 세션을 내려받는다.

응답 Markdown과 세션 기록에 연결되는 버튼을 Slack에 제공한다. 과거 상호작용 기록은 별도 기억 도구로 검색하며, Markdown 스킬은 CLI 사용법과 코드베이스 관례를 전달한다. [S5]

### 사용한 SDK

Moon Bot의 코딩 SDK는 Pi다. 별도로 인용한 Pipecat은 실시간 음성·멀티모달 에이전트를 만드는 Python 프레임워크다. [S6] [S5]

### 권한과 쓰기 경로

Okta 그룹으로 사용자의 접근 등급을 결정하고 등급마다 별도 Linux 사용자와 자격증명 환경을 둔다. 외부 서비스 키는 프록시가 서버 측에서 삽입하고, 에이전트 실행 환경에는 원래 키를 전달하지 않는다.

PR·이슈 쓰기는 에이전트의 셸이 아니라 봇 프로세스의 전용 도구가 수행한다. 이 경로에서 짧은 유효기간의 GitHub App 토큰을 사용하고 에이전트 도구 호출에는 토큰을 노출하지 않는다. [S5]

**개념:** [[Knowledge/AI Systems/AI Agents]]

## NVIDIA, Transformers v5 기반 NeMo AutoModel 학습 구조와 MoE 비교 공개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** NVIDIA

NVIDIA는 2026년 6월 25일(한국시간) Hugging Face에 NeMo AutoModel의 전문가 혼합 모델 학습 구조와 성능 비교를 공개했다. Transformers v5의 모델 로딩 API를 유지하면서 전문가 병렬화, 통신·연산 결합과 최적화 커널을 추가하는 방식이다. [S7]

### 모델과 체크포인트 호환

NeMoAutoModelForCausalLM은 Transformers의 AutoModelForCausalLM을 상속한다. 모델 종류에 따라 최적화 구현이나 기본 Hugging Face 경로를 사용하고 저장 결과는 표준 Hugging Face 체크포인트 형식을 유지한다. [S7]

### 속도 비교의 실행 조건

단일 노드 비교는 H100 80GB GPU 8개, 시퀀스 길이 4,096, 로컬 배치 크기 1에서 진행했다. NeMo는 전문가 병렬화 크기 8과 균등 라우팅 게이트를 사용했고, Transformers v5는 같은 더미 토큰에 기본 라우터를 적용했다.

NVIDIA는 Qwen3-30B-A3B와 Nemotron 3 Nano 30B-A3B에서 최적화한 v5 대비 약 3.4\~3.7배 높은 학습 처리량과 29\~32% 적은 GPU 메모리를 보고했다. 라우팅 방식이 다른 해당 학습 비교 결과다. [S7]

### 전문가 병렬화의 역할

전문가 가중치를 GPU에 나누고 DeepEP로 토큰 전달과 전문가 계산을 겹친다. NeMo에서는 전문가 병렬화와 데이터 병렬화를 별도 축으로 구성한다. [S7]

## Microsoft, Talos 유전체 재분석 결과 소개…4,735명에서 추가 진단 확인

**분야:** 바이오·의료기술
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** Microsoft

Microsoft Research는 2026년 6월 24일(한국시간), 희귀질환의 기존 유전체 데이터를 반복 재분석하는 오픈소스 도구 Talos의 연구 결과를 소개했다. 새로운 유전자·질병 관계나 변이 판정 근거를 반영해 후보를 추리고, 반복 실행에서는 지난 분석 이후 근거가 바뀐 변이만 전문가 검토에 올리는 구조다. [S8]

### 새 근거와 환자 조건의 결합

PanelApp Australia에서 유전자·질병 관계와 유전 방식을, ClinVar에서 변이의 병원성 정보를 읽는다. 가족 구조와 이용 가능한 환자 표현형으로 후보를 추가로 좁힌다. [S8]

### 검증 집단과 실제 재분석 집단

ACG·RGP 검증 집단은 합계 1,089명의 발단자를 포함한다. ACG 부모·자녀 조합에서 분석 범위 안의 기존 진단 90%를 회수했고, RGP 조합에서는 54건 중 47건을 회수했다고 연구진은 밝혔다.

별도의 미진단 4,735명 재분석 집단에서 238명에게 241개의 새로운 진단이 나왔고 추가 진단 수율은 5.1%였다. 원인일 가능성이 있는 변이는 이후 인증 검사실에서 병원성 또는 병원성 가능 변이로 확인됐다. [S8]

### 월별 반복 실행

29회의 월별 재분석에서는 새로 검토할 변이가 평균적으로 환자 200명당 1개였다고 보고했다. 공개 데이터베이스의 새 근거부터 진단까지 걸린 시간은 평균 32일이었다. [S8]

## RL 학습 모델과 기준 모델의 확률비로 에이전트 진행을 평가하는 연구

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 24일 arXiv에 에이전트의 단계별 진행을 평가하는 progress advantage 연구를 사전공개했다. 강화학습으로 사후 학습한 정책과 기준 정책의 로그 확률비를 이용해, 별도 보상 모델 학습 없이 단계별 평가 신호를 얻는 방법을 제시했다. [S9]

### 방법과 비교 대상

저자들은 확률적 마르코프 의사결정 과정에서 최적 어드밴티지와 연결되는 신호를 유도했다. 실행 중 추가 계산, 불확실성 정량화, 실패 원인 배정의 세 응용을 시험했다.

초록은 5개 벤치마크와 4개 모델 계열에서 신뢰도 기반 비교 방법 및 별도로 학습한 보상 모델보다 나은 결과를 보고한다. 작업별 추가 보상 모델 학습이 필요 없는 신호라는 점을 강조했다. [S9]

## 자기 증류 모델의 평균 정답률과 답변 다양성을 따로 비교한 연구

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 24일 arXiv에 샘플 정답 시범을 사용하는 온폴리시 자기 증류의 출력 다양성 연구를 사전공개했다. 한 모델이 교사와 학생을 맡고 교사가 정답 시범을 문맥으로 받아 학생 출력에 피드백을 주는 방식에서, 답변을 더 생성해도 정답률이 잘 늘지 않는 현상을 분석했다. [S10]

### 학습 신호와 출력 집중

저자들은 시범과 학생 출력의 점별 조건부 상호정보량으로 학습 후 분포가 기울어지는 구조를 설명했다. 같은 정도로 맞는 답들 사이의 확률 차이가 커져 기존에 우세한 응답 방식에 출력이 집중될 수 있다고 제시했다. [S10]

### 실험에서 구분한 성능

제어된 그래프 경로 찾기와 과학 질의응답 시험에서 평균 성능은 강화학습과 비슷하거나 높았지만 기능·의미 다양성은 낮았다고 초록은 보고한다. 여러 전략이 필요한 분포 밖 조건에서는 실패가 나타났다. [S10]

## 로봇 행동 궤적을 먼저 학습해 VLA에 옮기는 두 단계 연구 공개

**분야:** 로봇·제조
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 연구 소개
**기업·기관:** 없음

연구진은 2026년 6월 24일 arXiv에 서로 다른 로봇 형태의 행동 궤적을 먼저 학습하는 시각·언어·행동 모델 연구를 사전공개했다. 영상·언어와 행동을 한꺼번에 학습하기 전에 행동 모듈에 시간적 움직임 구조를 학습시키고, 그 결과를 VLA 학습으로 옮기는 방법이다. [S11]

### 행동 학습과 시각·언어 정렬

첫 단계는 영상·언어 토큰 없이 행동 궤적만으로 가벼운 플로 매칭 인코더·디코더를 학습한다. 두 번째 단계는 디코더 재사용과 초기 잠재 표현 증류로 시각·언어 특징을 행동 표현에 정렬한다.

학습한 인코더는 상태·행동 이력을 하나의 시간 문맥 토큰으로 압축하는 역할도 맡는다. [S11]

### 보고된 로봇 시험

초록은 시뮬레이션과 실제 환경의 13개 형태 간 작업에서 행동 사전학습 없는 VLA보다 빠른 수렴과 높은 성공률을 보고한다. 실제 환경의 데이터 부족 조건에서도 성능이 개선됐으며, 첫 단계 행동 데이터를 늘리면 후속 VLA 성능이 좋아졌다고 밝혔다. [S11]

# 리서치 노트

없음

# 도구 상자

없음

# 흐름 읽기

없음

# 오늘의 적용

없음

# 개념 색인

없음

# Source List

- [S1] https://investors.broadcom.com/news-releases/news-release-details/openai-and-broadcom-unveil-llm-optimized-intelligence-processor
- [S2] https://openai.com/index/how-agents-are-transforming-work/
- [S3] https://github.blog/changelog/2026-06-24-changes-to-model-selection-for-free-and-student-plans/
- [S4] https://github.blog/changelog/2026-06-24-self-service-credential-revocation-for-incident-response/
- [S5] https://huggingface.co/blog/huggingface/moon-bot
- [S6] https://github.com/pipecat-ai/pipecat
- [S7] https://huggingface.co/blog/nvidia/accelerating-fine-tuning-nvidia-nemo-automodel
- [S8] https://www.microsoft.com/en-us/research/blog/talos-scaling-rare-disease-diagnosis-with-automated-iterative-genomic-reanalysis/
- [S9] https://arxiv.org/abs/2606.26080v1
- [S10] https://arxiv.org/abs/2606.26091v1
- [S11] https://arxiv.org/abs/2606.26095v1
