---
title: Tech & AI Briefing - 08:04
time: 08:04
type: briefing
tags:
  - AI
  - TechBriefing
  - Obsidian
schema_version: tech-ai-magazine/v2
date: 2026-07-07
timezone: Asia/Seoul
coverage_start: 2026-07-07T00:03:00+09:00
coverage_end: 2026-07-07T08:04:00+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 9
new_items_count: 9
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agents|AI Agents]]"
  - "[[Knowledge/AI Systems/Agent Evaluation and Observability|Agent Evaluation
    and Observability]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - "[[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security
    and Governance]]"
  - Knowledge/AI Systems/Prompt Caching
knowledge_notes_created: []
knowledge_notes_updated: []
briefing_group_format: related-events/v1
briefing_groups:
  - id: ai-sdk-stream-patches
    title: AI SDK와 xAI 어댑터 패치
    sector: 소프트웨어·클라우드
    event_ids:
      - be8f1792372015fd
      - 67b9774daed42893
headlines:
  - AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개
  - AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개
  - AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명
  - AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가
  - Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가
article_records:
  - title: AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-07
      where: 미기재
      what: Amazon Nova용 멀티턴 강화학습 인프라 공개
      how: SageMaker HyperPod, ECS on AWS Fargate, Nova Forge SDK를 활용한 이벤트 기반 파이프라인 구성
      why: 미기재
    lead: AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에 Amazon Nova를 SageMaker HyperPod에서 멀티턴
      강화학습으로 훈련하는 인프라 구축 방법을 소개했다. 예제는 S3에 학습 데이터를 올리면 컴퓨트를 준비하고, HyperPod에서
      GRPO 가중치 업데이트를 수행하며, Fargate의 보상 환경과 Nova Forge SDK로 모델의 여러 차례 상호작용을 연결하는
      구조다. AWS는 Wordle 예제의 예상 수렴 범위와 인스턴스 구성별 비용도 함께 설명했다.
    explanations:
      - heading: 학습 인프라 구성
        paragraphs:
          - HyperPod 클러스터는 모델의 응답을 생성하고 GRPO 가중치 업데이트를 수행한다. ECS on AWS Fargate는
            보상 환경을 실행하고, Nova Forge SDK는 모델과 환경 사이의 메시지를 전달하면서 대화 상태를 유지한다.
          - 배포는 두 단계로 나뉜다. AWS CDK로 VPC·EKS/HyperPod·ECS·S3·IAM과 파이프라인 등 기본 인프라를
            먼저 만들고, 학습 실행마다 일시적인 리소스를 생성한다. AWS는 Wordle 환경을 자체 API 호출 에이전트나 기업
            업무 흐름으로 바꾸어 적용하는 방법을 제시했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/deploying-multi-turn-rl-infrastructure-for-amazon-nova-on-amazon-sagemaker-hyperpod/
      - heading: Wordle 예제와 인스턴스별 비용
        paragraphs:
          - AWS는 Wordle 환경에서 50~100단계 안에 수렴하고 평균 보상이 거의 0에서 0.6~0.8로 높아지는 것을 예상
            범위로 설명했다. 이 수치는 해당 예제의 학습 동작을 설명하는 값이다.
          - 비용 표의 최소 구성은 전체 10개 인스턴스 중 8개를 컴퓨트에 사용하는 방식이다. AWS가 제시한 HyperPod 비용은
            이 구성에서 시간당 약 786달러, 여유 용량을 둔 12개 ml.p5.48xlarge 인스턴스 구성에서 시간당 약
            1,180달러다.
          - AWS는 유휴 비용을 줄이는 방법으로 단일 인스턴스 클러스터의 자동 확장 정책을 이용한 0까지 축소와, 설정·비혼잡 시간에
            낮은 비용의 인스턴스를 사용하다 학습 시 고성능 인스턴스로 전환하는 방법을 제시했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/deploying-multi-turn-rl-infrastructure-for-amazon-nova-on-amazon-sagemaker-hyperpod/
      - heading: 설정 시간과 리소스 정리
        paragraphs:
          - 가이드가 제시한 기본 인프라 배포 시간은 약 30~40분이다. EKS 클러스터 생성은 약 15분, HyperPod Helm
            차트 설치는 약 5분, HyperPod 클러스터 프로비저닝은 P5 가용량에 따라 약 15~25분, Lambda 컨테이너
            이미지 빌드는 약 5분으로 설명한다.
          - AWS는 정상 운영 시 Step Functions의 예상 단계별 시간을 인프라 설정 2~3분, 보상 워커 배포 1~2분,
            데이터 검증 1분 미만, 학습 제출 3~5분으로 제시했다. 정리 스크립트는 Step Functions 실행, ECS
            태스크, SDK CloudFormation 스택, CDK 스택 순서로 활성 리소스를 중지한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/deploying-multi-turn-rl-infrastructure-for-amazon-nova-on-amazon-sagemaker-hyperpod/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-07
      where: 미기재
      what: 이미지 PII 자동 마스킹 파이프라인 아키텍처 공개
      how: Amazon Nova 2 Lite, Meta SAM 3, Amazon Textract, S3, EventBridge, Step
        Functions, Lambda 활용
      why: 복잡한 이미지 내 PII 식별 및 마스킹 자동화, 불필요한 서비스 호출 비용 절감
    lead: AWS는 2026년 7월 7일(한국시간) Amazon Nova 2 Lite와 SAM 3, Amazon Textract를 조합해
      이미지의 개인정보(PII)를 찾아 가리는 아키텍처 가이드를 공개했다. Nova가 이미지 내용을 판단하고 작업을 나누면, SAM 3는
      시각적 대상의 분할 마스크를 만들고 Textract는 텍스트와 위치를 추출하는 구성이다. 가려진 이미지에 개인정보가 남았다고
      Nova가 판단하면 수동 검토용 격리 폴더로 보내도록 설계했다.
    explanations:
      - heading: 이미지 판단과 작업 분기
        paragraphs:
          - S3의 input/ 폴더에 이미지를 올리면 EventBridge 규칙이 Step Functions 워크플로우를 시작한다.
            파일 형식을 확인한 뒤 Nova 2 Lite가 개인정보 포함 여부를 먼저 살펴본다.
          - Nova가 개인정보가 없다고 판단한 이미지는 noPII/ 폴더로 옮기고 후속 처리를 종료한다. 개인정보가 있는 이미지는
            SAM 3의 분할 마스크와 Textract의 OCR을 이용하는 단계로 보낸다. AWS는 이 분기로 불필요한
            Textract·SAM 3 호출을 피하는 구조를 설명했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/automatically-redact-pii-in-images-with-amazon-nova/
      - heading: 시각 정보와 텍스트를 가리는 방법
        paragraphs:
          - SAM 3는 Nova의 지시에 따라 시각적 개인정보의 경계를 분할 마스크로 나타낸다. 분할 마스크는 대상에 속하는 픽셀을
            구분하므로, 단순한 사각형 영역보다 대상의 윤곽을 따라 가릴 수 있다. Textract는 이미지 속 문자를 읽고 좌표를
            제공한다. AWS는 지문·신분증·여러 각도의 번호판처럼 처리가 까다로운 사례를 고려한 설계로 소개했다.
          - Lambda 함수가 시각 정보와 텍스트에서 얻은 좌표를 합친 뒤, Python Pillow 라이브러리로 원본 이미지의 해당
            영역을 가린다. 처리한 이미지는 S3의 redacted/ 폴더에 저장한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/automatically-redact-pii-in-images-with-amazon-nova/
      - heading: 최종 검토와 적용 방식
        paragraphs:
          - Nova 2 Lite는 가려진 이미지를 다시 확인한다. 개인정보가 남았다고 판단한 이미지는 격리 폴더로 보내 사람이
            검토하도록 한다. AWS는 이 구성을 각 조직의 요구에 맞게 수정해 자체 AWS 계정에 배포하는 아키텍처 가이드로
            제공했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/automatically-redact-pii-in-images-with-amazon-nova/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-07
      where: 14개 AWS 리전
      what: MiniMax M2, M2.1, M2.5 모델 제공
      how: bedrock-mantle 및 bedrock-runtime 엔드포인트를 통해 on-demand 추론 제공
      why: 소프트웨어 엔지니어링 및 에이전트 워크로드 지원
    lead: AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에서 Amazon Bedrock으로 제공하는 MiniMax
      M2·M2.1·M2.5의 사양과 호출 방법을 정리했다. M2의 컨텍스트 길이는 100만 토큰, M2.1과 M2.5는 각각 19만6천
      토큰이며 세 모델 모두 최대 8천 토큰을 출력한다고 설명했다. OpenAI SDK와 같은 Chat Completions 인터페이스를
      쓰는 bedrock-mantle과, Bedrock 고유 기능에 사용하는 bedrock-runtime의 차이도 소개했다.
    explanations:
      - heading: 모델별 사양
        paragraphs:
          - AWS 비교표에서 M2는 긴 문맥과 다국어 작업, M2.1은 복잡한 지시와 다단계 추론, M2.5는 도구 호출과 코딩 중심
            에이전트 작업을 대상으로 설명한다. 컨텍스트 길이는 M2가 1M 토큰, M2.1·M2.5가 각각 196K 토큰이고 최대
            출력은 모두 8K 토큰이다.
          - AWS는 M2.5를 총 2,300억 파라미터 중 토큰마다 100억 파라미터를 활성화하는 mixture-of-experts
            모델로 소개했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-minimax-models-on-amazon-bedrock/
      - heading: 호출 API와 데이터 처리
        paragraphs:
          - bedrock-mantle은 Chat Completions API를 사용한다. AWS는 대부분의 작업에 이 엔드포인트를
            권장하며, 기존 OpenAI SDK 사용자는 기본 URL과 모델 ID를 바꾸는 방식으로 접근할 수 있다고 설명했다.
          - bedrock-runtime은 AWS SDK의 Converse·InvokeModel API를 사용한다.
            Guardrails·Agents·Flows·모델 평가 등 Bedrock 고유 기능을 이용할 때 선택하도록 안내한다.
          - AWS는 Bedrock 추론이 AWS 운영 인프라에서 실행되고, 프롬프트와 생성 결과를 모델 학습에 사용하지 않으며 모델
            제공사와 콘텐츠를 공유하지 않는다고 밝혔다. 테스트용 단기 Bedrock API 키는 최대 12시간 후 만료되고, 콘솔에서
            키를 삭제하면 해당 키를 사용하는 애플리케이션의 접근도 즉시 철회된다고 설명했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-minimax-models-on-amazon-bedrock/
      - heading: 서비스 등급과 처리량
        paragraphs:
          - 기본 등급인 Standard는 용량을 예약하지 않고 토큰 사용량에 따라 과금하는 온디맨드 추론이다. Priority는 추가
            비용과 우선 처리, Flex는 할인과 더 긴 지연 시간을 특징으로 하며 MiniMax의 Reserved 등급은 제공되지
            않는다고 AWS는 설명했다.
          - AWS는 Priority의 초당 출력 토큰 수가 Standard보다 최대 25% 높다고 제시했다. 호출마다
            service_tier를 priority로 설정해 선택할 수 있으며 사전 예약이나 약정은 요구하지 않는다는 설명이다.
          - bedrock-mantle의 처리량은 요청 횟수보다 토큰 기준으로 관리된다. AWS는 이 엔드포인트에 분당 요청
            수(RPM) 할당량이 없고, MiniMax 모델의 계정별 토큰 할당량은 Service Quotas 콘솔에 게시되지 않는다고
            밝혔다. 리전의 수요가 높으면 대기나 제한이 발생할 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-minimax-models-on-amazon-bedrock/
      - heading: 리전과 프롬프트 캐싱
        paragraphs:
          - 지속적인 HTTP 503 응답에는 요청률을 50%씩 낮춰 성공하는 수준을 찾고 15분간 유지한 뒤, 50%씩 높이면서 매
            단계 15분간 유지하는 절차를 AWS는 권고했다. M2.5의 제공 범위는 글 게시 시점 기준 14개 리전이며, 호출한
            리전에서 처리하고 리전 간 추론은 지원하지 않는다고 설명했다.
          - MiniMax 모델의 암묵적 프롬프트 캐싱은 연속 요청의 입력 앞부분이 같을 때 해당 부분의 계산을 재사용하는 방식이다.
            별도 캐시 표시나 코드 변경 없이 Standard·Priority·Flex에서 이용할 수 있으며, AWS는 매 요청마다
            캐시가 일치하는 것은 아니라고 설명했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/run-minimax-models-on-amazon-bedrock/
    papers: []
    relations: []
    topic_ids: []
  - title: AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AWS
      when: 2026-07-07
      where: 미기재
      what: Amazon SageMaker AI에 MLflow 통합 기능 추가
      how: 벤치마크 및 추천 작업의 실험 결과를 서버리스 Amazon SageMaker MLflow 앱으로 실시간 스트리밍
      why: 미기재
    lead: AWS는 2026년 7월 7일(한국시간) Amazon SageMaker AI의 벤치마크·추천 작업 결과를 SageMaker
      MLflow Apps로 보내는 통합 기능을 발표했다. 작업의 지표·매개변수·차트가 실시간으로 기록되며, 사용자가 선택한 앱에서 서로
      다른 구성을 비교할 수 있다.
    explanations:
      - heading: 두 작업이 평가하는 대상
        paragraphs:
          - 벤치마크 작업은 이미 운영 중인 엔드포인트를 평가한다. 추천 작업은 모델 파일의 배포 구성을 평가하고 작업 내부에서 자체
            엔드포인트를 생성한다. AWS는 탐색 범위를 제한할 특별한 이유가 없다면 추천 작업에
            ComputeSpec.InstanceTypes를 전달하지 않도록 안내했다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/streaming-benchmark-and-recommendation-results-to-mlflow-with-amazon-sagemaker-ai/
      - heading: 기록 대상과 사용 조건
        paragraphs:
          - 결과는 SageMaker MLflow Apps에 기록하며 자체 호스팅 MLflow 추적 서버로는 보내지 않는다. 중첩
            실행을 사용하려면 tooling.version을 0.8.0 이상으로 설정해야 한다.
          - 벤치마크 작업에 MlflowConfig를 추가하면 생성된 실행을 MLflow에서 열어 벤치마크 시간·처리량·출력 토큰
            수·요청 지연 시간을 구성별로 비교할 수 있다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/streaming-benchmark-and-recommendation-results-to-mlflow-with-amazon-sagemaker-ai/
      - heading: 부모 실행과 실제 지표
        paragraphs:
          - 실험 화면의 부모 실행은 하위 실행들을 묶는 항목이다. 실제 모델 지표는 동시성별 자식 실행에 있으므로, 부모 항목 아래의
            중첩 실행을 펼쳐 확인한다.
        source_urls:
          - https://aws.amazon.com/blogs/machine-learning/streaming-benchmark-and-recommendation-results-to-mlflow-with-amazon-sagemaker-ai/
    papers: []
    relations: []
    topic_ids: []
  - title: Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: Claude Code
      when: 2026-07-07
      where: 미기재
      what: v2.1.202 업데이트
      how: 동적 워크플로 크기 설정 및 실행 추적 속성 추가, 원격 제어와 세션 오류 수정
      why: 미기재
    lead: Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를
      small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌
      권장 기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run_id와
      workflow.name을 추가해 실행별 활동을 추적할 수 있도록 했다.
    explanations:
      - heading: 원격 제어와 백그라운드 작업
        paragraphs:
          - 모바일·웹 Remote Control에서 보낸 명령이 Unknown command로 실패하거나 설명 없이 전송한
            이미지·파일이 누락되는 문제를 수정했다. 원격 제어 화면에 잘못된 권한 모드를 표시하는 문제도 수정 목록에 포함됐다.
          - 백그라운드 세션에서 /rename으로 변경한 이름이 작업 재시작 때 되돌아가는 문제를 고쳤다. claude agents에서
            대화를 열 때 백그라운드 에이전트로 실행 중이라는 오류와 작업 프로세스의 충돌·재시작이 반복되는 문제도 수정했다.
          - 마이크나 녹음기에서 캡처가 반복적으로 실패하면 음성 입력을 일시 중지하도록 바꿨다. 이전의 무제한 재시도 동작을 중단하는
            변경이다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
      - heading: 인증·연결과 세션 복원
        paragraphs:
          - 클라이언트 인증서를 실행 중 교체하면서 설정을 다시 적용할 때 일시적으로 mTLS 핸드셰이크가 실패하는 문제를 수정했다.
          - Ctrl+R 기록 검색이 파일을 스캔하는 동안 선택하거나 취소하면 충돌하던 문제를 수정했다. Git worktree가 많은
            저장소에서 세션을 이름으로 복원하거나 복원 목록을 열 때 오래 걸리고 메모리를 많이 쓰는 문제도 수정했다.
          - SSH에서 줄이 나뉘어 클릭하기 어려웠던 로그인 URL을 하나의 링크로 출력한다. 설치·업데이트 다운로드 중 프록시나
            네트워크 연결이 일시적으로 끊어지면 즉시 실패하는 대신 다시 시도하도록 바꿨다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
      - heading: 워크플로와 MCP 설정
        paragraphs:
          - 워크플로 스크립트 문자열의 Unicode 따옴표 이스케이프가 파싱 전에 손상되는 문제와 이미 읽은 스킬을 다시 호출할 때
            지시문이 중복되는 문제를 수정했다. 파싱 오류에는 실제 문제가 발생한 줄을 표시하며, /workflows 목록에는 넓어진
            제목 영역과 별도 시간 열 등을 적용했다.
          - MCP 서버 설정에 url만 있고 type이 없으면 type을 http로 지정하라는 안내를 표시한다. 기존의 command
            문자열 오류 메시지를 실제 설정 문제에 맞게 바꾼 것이다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
      - heading: PR 검토 명령
        paragraphs:
          - /review 명령은 PR을 한 차례 검토하는 빠른 방식으로 되돌렸다. 여러 에이전트로 검토하려면 /code-review
            명령에 검토 강도와 PR 번호를 지정한다.
        source_urls:
          - https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
    papers: []
    relations: []
    topic_ids: []
  - title: OpenCode v1.17.14, MCP 도구를 실행하는 코드 모드 추가
    kind: 사건 뉴스
    region: 해외
    facts:
      who: OpenCode
      when: 2026-07-07
      where: 미기재
      what: 1.17.14 코드 모드 MCP 어댑터 추가와 오류 수정
      how: 코드 모드에서 연결된 MCP 도구의 실행을 조정
      why: 미기재
    lead: OpenCode v1.17.14는 2026년 7월 7일(한국시간) 공개됐다. 연결된 MCP 도구를 대상으로 제한된 조정 스크립트를
      실행하는 코드 모드 어댑터를 추가했다.
    explanations:
      - heading: 도구 실행과 모델 연결
        paragraphs:
          - execute 도구는 코드 모드가 켜진 경우에만 표시한다. 여러 페이지로 나뉜 MCP 도구 목록에서 메타데이터와 출력
            스키마 검증이 누락되는 문제도 수정했다.
          - OpenRouter 소형 모델 변형의 low 추론 설정을 비활성화하지 않고 유지한다. GitHub Copilot은 모델별로
            제공한다고 명시한 chat 또는 responses 엔드포인트로 연결하도록 수정했다.
          - Cerebras에 이전 답변의 추론 내용을 다시 보낼 때 해당 제공자가 지원하는 필드를 사용하도록 수정했다.
        source_urls:
          - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
      - heading: 세션 표시와 작업 입력
        paragraphs:
          - 같은 인스턴스 디렉터리를 다른 형태로 지정해도 세션 목록이 일치하도록 수정했다. TUI 화면의 로딩 표시가 계속 출력되도록
            스피너 등록도 수정했다.
          - Home에서 새 세션이 잘못된 프로젝트에 연결되거나 첫 실행 안내가 부적절하게 나타나는 문제를 수정했다. 큰 검토 화면의
            동작과 드롭다운 검색도 손봤다.
          - 답변부터 시작하는 타임라인에는 누락된 사용자 입력을 보충한다. 창에 포커스가 없는 동안에도 작성창에 입력할 수 있도록
            복원했다.
        source_urls:
          - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
      - heading: 데스크톱 탭과 화면
        paragraphs:
          - 닫힌 탭을 다시 열거나 백그라운드로 탭을 여는 기능을 추가했다. Home에는 최근 닫힌 프로젝트를 표시하고, 탭 이동은
            마우스 버튼을 누르는 시점에 반응하도록 바꿨다.
          - 제목 표시줄에 draft 서버 상태를 표시하고 제공자 연결 절차를 통일했다. 통합 터미널·모델 검색·검토 패널·세션 탭
            미리보기에도 변경을 적용했다.
          - 세션 탭을 바꿔도 검토 패널과 같은 작업공간의 터미널을 유지한다. 앱을 닫았다가 다시 열어도 데스크톱 창의 탭을 보존하도록
            수정했다.
        source_urls:
          - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
      - heading: 서버와 하위 세션
        paragraphs:
          - 세션의 작업 중 표시가 해당 서버에만 연결되도록 수정했다. 탭을 바꾸는 동안 하위 세션을 찾거나 상위·하위 세션 관계를
            확인하는 동작도 수정했다.
        source_urls:
          - https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
    papers: []
    relations: []
    topic_ids: []
  - title: LangGraph 1.2.8, 새 스레드의 상태 저장 오류 수정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: LangGraph
      when: 2026-07-07
      where: 미기재
      what: 1.2.8 상태 저장 오류 수정과 의존성 갱신
      how: 새 스레드에서 updateState가 스냅샷을 강제하도록 수정
      why: 미기재
    lead: LangGraph 1.2.8은 2026년 7월 7일(한국시간) 공개됐다. 릴리스 노트에 따르면 새 스레드에서 updateState를
      호출할 때 스텁 체크포인트 대신 스냅샷을 강제하도록 델타 채널 오류를 수정했다. websockets 의존성은 15.0.1에서
      16.0으로 갱신하고 LangGraph·Python SDK의 마이너·패치 의존성 그룹도 업데이트했다.
    explanations: []
    papers: []
    relations: []
    topic_ids: []
  - title: AI SDK 6.0.220, 도구 결과 순서와 스트림 공백 처리 수정
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AI SDK
      when: 2026-07-07
      where: 미기재
      what: ai 6.0.220 패치
      how: 도구 결과 순서와 extractJsonMiddleware의 스트림 공백 처리 변경
      why: 미기재
    lead: AI SDK의 ai 패키지 6.0.220은 2026년 7월 7일(한국시간) 공개됐다. 생성 출력을 응답 메시지로 변환할 때 도구
      결과를 도구 호출 순서대로 정렬하도록 바꿨다. extractJsonMiddleware는 마크다운 코드 블록의 시작 표시를 제거하지
      않은 경우, 마지막으로 스트리밍되는 텍스트 부분의 앞쪽 공백을 보존하도록 수정했다.
    explanations:
      - heading: 의존성 갱신
        paragraphs:
          - 함께 사용하는 패키지는 @ai-sdk/gateway 3.0.144와 @ai-sdk/provider-utils
            4.0.36으로 갱신했다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/ai%406.0.220
    papers: []
    relations: []
    topic_ids: []
  - title: AI SDK xAI 어댑터 3.0.103, 완료된 도구 호출 결과 출력 변경
    kind: 사건 뉴스
    region: 해외
    facts:
      who: AI SDK
      when: 2026-07-07
      where: 미기재
      what: "@ai-sdk/xai 3.0.103 패치"
      how: 완료된 xAI Responses API 스트리밍 도구 호출의 제공자 실행 결과 출력
      why: 미기재
    lead: AI SDK의 @ai-sdk/xai 패키지 3.0.103은 2026년 7월 7일(한국시간) 공개됐다. xAI Responses
      API의 스트리밍 도구 호출이 완료됐을 때, 제공자 측에서 실행한 도구 결과를 출력하도록 패치했다.
    explanations:
      - heading: 의존성 갱신
        paragraphs:
          - 의존성은 @ai-sdk/provider-utils 4.0.36과 @ai-sdk/openai-compatible
            2.0.57으로 갱신했다.
        source_urls:
          - https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fxai%403.0.103
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개
    event_id: 31615a71acf2ec76
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T08:58:13-08:00
  - title: AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개
    event_id: 0003f5c36a86534e
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T08:55:02-08:00
  - title: AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명
    event_id: fb116c5e01814e4b
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids:
      - prompt-caching
    date_kind: source-publication-time
    source_published_at: 2026-07-06T09:00:44-08:00
  - title: AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가
    event_id: dc2e14116dca2332
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T08:53:38-08:00
  - title: Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가
    event_id: bdc95c28b5fad7d8
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T22:51:16Z
  - title: OpenCode v1.17.14, MCP 도구를 실행하는 코드 모드 추가
    event_id: ce4cbe901b2add47
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T18:50:53Z
  - title: LangGraph 1.2.8, 새 스레드의 상태 저장 오류 수정
    event_id: c5f838e53c500f66
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T20:40:30Z
  - title: AI SDK 6.0.220, 도구 결과 순서와 스트림 공백 처리 수정
    event_id: be8f1792372015fd
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T19:28:57Z
  - title: AI SDK xAI 어댑터 3.0.103, 완료된 도구 호출 결과 출력 변경
    event_id: 67b9774daed42893
    review_status: verified
    published_at: 2026-07-07
    reviewed_at: 2026-10-07
    concept_ids: []
    date_kind: source-publication-time
    source_published_at: 2026-07-06T19:31:30Z
---

# 이번 호 표지

AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개

# 차례

- AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개
- AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개
- AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명
- AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가
- Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가

# 커버 스토리

없음

# 뉴스 데스크

## AWS, Nova 멀티턴 강화학습의 HyperPod 구축 방법 소개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** AWS

AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에 Amazon Nova를 SageMaker HyperPod에서 멀티턴 강화학습으로 훈련하는 인프라 구축 방법을 소개했다. 예제는 S3에 학습 데이터를 올리면 컴퓨트를 준비하고, HyperPod에서 GRPO 가중치 업데이트를 수행하며, Fargate의 보상 환경과 Nova Forge SDK로 모델의 여러 차례 상호작용을 연결하는 구조다. AWS는 Wordle 예제의 예상 수렴 범위와 인스턴스 구성별 비용도 함께 설명했다. [S1]

### 학습 인프라 구성

HyperPod 클러스터는 모델의 응답을 생성하고 GRPO 가중치 업데이트를 수행한다. ECS on AWS Fargate는 보상 환경을 실행하고, Nova Forge SDK는 모델과 환경 사이의 메시지를 전달하면서 대화 상태를 유지한다.

배포는 두 단계로 나뉜다. AWS CDK로 VPC·EKS/HyperPod·ECS·S3·IAM과 파이프라인 등 기본 인프라를 먼저 만들고, 학습 실행마다 일시적인 리소스를 생성한다. AWS는 Wordle 환경을 자체 API 호출 에이전트나 기업 업무 흐름으로 바꾸어 적용하는 방법을 제시했다. [S1]

### Wordle 예제와 인스턴스별 비용

AWS는 Wordle 환경에서 50\~100단계 안에 수렴하고 평균 보상이 거의 0에서 0.6\~0.8로 높아지는 것을 예상 범위로 설명했다. 이 수치는 해당 예제의 학습 동작을 설명하는 값이다.

비용 표의 최소 구성은 전체 10개 인스턴스 중 8개를 컴퓨트에 사용하는 방식이다. AWS가 제시한 HyperPod 비용은 이 구성에서 시간당 약 786달러, 여유 용량을 둔 12개 ml.p5.48xlarge 인스턴스 구성에서 시간당 약 1,180달러다.

AWS는 유휴 비용을 줄이는 방법으로 단일 인스턴스 클러스터의 자동 확장 정책을 이용한 0까지 축소와, 설정·비혼잡 시간에 낮은 비용의 인스턴스를 사용하다 학습 시 고성능 인스턴스로 전환하는 방법을 제시했다. [S1]

### 설정 시간과 리소스 정리

가이드가 제시한 기본 인프라 배포 시간은 약 30\~40분이다. EKS 클러스터 생성은 약 15분, HyperPod Helm 차트 설치는 약 5분, HyperPod 클러스터 프로비저닝은 P5 가용량에 따라 약 15\~25분, Lambda 컨테이너 이미지 빌드는 약 5분으로 설명한다.

AWS는 정상 운영 시 Step Functions의 예상 단계별 시간을 인프라 설정 2\~3분, 보상 워커 배포 1\~2분, 데이터 검증 1분 미만, 학습 제출 3\~5분으로 제시했다. 정리 스크립트는 Step Functions 실행, ECS 태스크, SDK CloudFormation 스택, CDK 스택 순서로 활성 리소스를 중지한다. [S1]

## AWS, Nova·SAM 3·Textract로 이미지 개인정보를 가리는 구조 소개

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** AWS, Meta

AWS는 2026년 7월 7일(한국시간) Amazon Nova 2 Lite와 SAM 3, Amazon Textract를 조합해 이미지의 개인정보(PII)를 찾아 가리는 아키텍처 가이드를 공개했다. Nova가 이미지 내용을 판단하고 작업을 나누면, SAM 3는 시각적 대상의 분할 마스크를 만들고 Textract는 텍스트와 위치를 추출하는 구성이다. 가려진 이미지에 개인정보가 남았다고 Nova가 판단하면 수동 검토용 격리 폴더로 보내도록 설계했다. [S2]

### 이미지 판단과 작업 분기

S3의 input/ 폴더에 이미지를 올리면 EventBridge 규칙이 Step Functions 워크플로우를 시작한다. 파일 형식을 확인한 뒤 Nova 2 Lite가 개인정보 포함 여부를 먼저 살펴본다.

Nova가 개인정보가 없다고 판단한 이미지는 noPII/ 폴더로 옮기고 후속 처리를 종료한다. 개인정보가 있는 이미지는 SAM 3의 분할 마스크와 Textract의 OCR을 이용하는 단계로 보낸다. AWS는 이 분기로 불필요한 Textract·SAM 3 호출을 피하는 구조를 설명했다. [S2]

### 시각 정보와 텍스트를 가리는 방법

SAM 3는 Nova의 지시에 따라 시각적 개인정보의 경계를 분할 마스크로 나타낸다. 분할 마스크는 대상에 속하는 픽셀을 구분하므로, 단순한 사각형 영역보다 대상의 윤곽을 따라 가릴 수 있다. Textract는 이미지 속 문자를 읽고 좌표를 제공한다. AWS는 지문·신분증·여러 각도의 번호판처럼 처리가 까다로운 사례를 고려한 설계로 소개했다.

Lambda 함수가 시각 정보와 텍스트에서 얻은 좌표를 합친 뒤, Python Pillow 라이브러리로 원본 이미지의 해당 영역을 가린다. 처리한 이미지는 S3의 redacted/ 폴더에 저장한다. [S2]

### 최종 검토와 적용 방식

Nova 2 Lite는 가려진 이미지를 다시 확인한다. 개인정보가 남았다고 판단한 이미지는 격리 폴더로 보내 사람이 검토하도록 한다. AWS는 이 구성을 각 조직의 요구에 맞게 수정해 자체 AWS 계정에 배포하는 아키텍처 가이드로 제공했다. [S2]

## AWS, Bedrock의 MiniMax 모델 사양과 두 호출 API를 설명

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법
**기업·기관:** AWS, Amazon Bedrock, MiniMax

AWS는 2026년 7월 7일(한국시간) 공식 기술 블로그에서 Amazon Bedrock으로 제공하는 MiniMax M2·M2.1·M2.5의 사양과 호출 방법을 정리했다. M2의 컨텍스트 길이는 100만 토큰, M2.1과 M2.5는 각각 19만6천 토큰이며 세 모델 모두 최대 8천 토큰을 출력한다고 설명했다. OpenAI SDK와 같은 Chat Completions 인터페이스를 쓰는 bedrock-mantle과, Bedrock 고유 기능에 사용하는 bedrock-runtime의 차이도 소개했다. [S3]

### 모델별 사양

AWS 비교표에서 M2는 긴 문맥과 다국어 작업, M2.1은 복잡한 지시와 다단계 추론, M2.5는 도구 호출과 코딩 중심 에이전트 작업을 대상으로 설명한다. 컨텍스트 길이는 M2가 1M 토큰, M2.1·M2.5가 각각 196K 토큰이고 최대 출력은 모두 8K 토큰이다.

AWS는 M2.5를 총 2,300억 파라미터 중 토큰마다 100억 파라미터를 활성화하는 mixture-of-experts 모델로 소개했다. [S3]

### 호출 API와 데이터 처리

bedrock-mantle은 Chat Completions API를 사용한다. AWS는 대부분의 작업에 이 엔드포인트를 권장하며, 기존 OpenAI SDK 사용자는 기본 URL과 모델 ID를 바꾸는 방식으로 접근할 수 있다고 설명했다.

bedrock-runtime은 AWS SDK의 Converse·InvokeModel API를 사용한다. Guardrails·Agents·Flows·모델 평가 등 Bedrock 고유 기능을 이용할 때 선택하도록 안내한다.

AWS는 Bedrock 추론이 AWS 운영 인프라에서 실행되고, 프롬프트와 생성 결과를 모델 학습에 사용하지 않으며 모델 제공사와 콘텐츠를 공유하지 않는다고 밝혔다. 테스트용 단기 Bedrock API 키는 최대 12시간 후 만료되고, 콘솔에서 키를 삭제하면 해당 키를 사용하는 애플리케이션의 접근도 즉시 철회된다고 설명했다. [S3]

### 서비스 등급과 처리량

기본 등급인 Standard는 용량을 예약하지 않고 토큰 사용량에 따라 과금하는 온디맨드 추론이다. Priority는 추가 비용과 우선 처리, Flex는 할인과 더 긴 지연 시간을 특징으로 하며 MiniMax의 Reserved 등급은 제공되지 않는다고 AWS는 설명했다.

AWS는 Priority의 초당 출력 토큰 수가 Standard보다 최대 25% 높다고 제시했다. 호출마다 service\_tier를 priority로 설정해 선택할 수 있으며 사전 예약이나 약정은 요구하지 않는다는 설명이다.

bedrock-mantle의 처리량은 요청 횟수보다 토큰 기준으로 관리된다. AWS는 이 엔드포인트에 분당 요청 수(RPM) 할당량이 없고, MiniMax 모델의 계정별 토큰 할당량은 Service Quotas 콘솔에 게시되지 않는다고 밝혔다. 리전의 수요가 높으면 대기나 제한이 발생할 수 있다. [S3]

### 리전과 프롬프트 캐싱

지속적인 HTTP 503 응답에는 요청률을 50%씩 낮춰 성공하는 수준을 찾고 15분간 유지한 뒤, 50%씩 높이면서 매 단계 15분간 유지하는 절차를 AWS는 권고했다. M2.5의 제공 범위는 글 게시 시점 기준 14개 리전이며, 호출한 리전에서 처리하고 리전 간 추론은 지원하지 않는다고 설명했다.

MiniMax 모델의 암묵적 프롬프트 캐싱은 연속 요청의 입력 앞부분이 같을 때 해당 부분의 계산을 재사용하는 방식이다. 별도 캐시 표시나 코드 변경 없이 Standard·Priority·Flex에서 이용할 수 있으며, AWS는 매 요청마다 캐시가 일치하는 것은 아니라고 설명했다. [S3]

**개념:** [[Knowledge/AI Systems/Prompt Caching]]

## AWS, Amazon SageMaker AI에 MLflow 통합 기능 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** 없음

AWS는 2026년 7월 7일(한국시간) Amazon SageMaker AI의 벤치마크·추천 작업 결과를 SageMaker MLflow Apps로 보내는 통합 기능을 발표했다. 작업의 지표·매개변수·차트가 실시간으로 기록되며, 사용자가 선택한 앱에서 서로 다른 구성을 비교할 수 있다. [S4]

### 두 작업이 평가하는 대상

벤치마크 작업은 이미 운영 중인 엔드포인트를 평가한다. 추천 작업은 모델 파일의 배포 구성을 평가하고 작업 내부에서 자체 엔드포인트를 생성한다. AWS는 탐색 범위를 제한할 특별한 이유가 없다면 추천 작업에 ComputeSpec.InstanceTypes를 전달하지 않도록 안내했다. [S4]

### 기록 대상과 사용 조건

결과는 SageMaker MLflow Apps에 기록하며 자체 호스팅 MLflow 추적 서버로는 보내지 않는다. 중첩 실행을 사용하려면 tooling.version을 0.8.0 이상으로 설정해야 한다.

벤치마크 작업에 MlflowConfig를 추가하면 생성된 실행을 MLflow에서 열어 벤치마크 시간·처리량·출력 토큰 수·요청 지연 시간을 구성별로 비교할 수 있다. [S4]

### 부모 실행과 실제 지표

실험 화면의 부모 실행은 하위 실행들을 묶는 항목이다. 실제 모델 지표는 동시성별 자식 실행에 있으므로, 부모 항목 아래의 중첩 실행을 펼쳐 확인한다. [S4]

## Claude Code v2.1.202, 워크플로 크기 설정·실행 추적 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가, 오류 수정
**기업·기관:** 없음

Claude Code v2.1.202는 2026년 7월 7일(한국시간) 공개됐다. /config에 에이전트 수를 small·medium·large로 안내하는 Dynamic workflow size 설정을 추가했으며, 이 값은 강제 상한이 아닌 권장 기준이다. 워크플로가 생성한 에이전트의 OpenTelemetry 데이터에는 workflow.run\_id와 workflow.name을 추가해 실행별 활동을 추적할 수 있도록 했다. [S5]

### 원격 제어와 백그라운드 작업

모바일·웹 Remote Control에서 보낸 명령이 Unknown command로 실패하거나 설명 없이 전송한 이미지·파일이 누락되는 문제를 수정했다. 원격 제어 화면에 잘못된 권한 모드를 표시하는 문제도 수정 목록에 포함됐다.

백그라운드 세션에서 /rename으로 변경한 이름이 작업 재시작 때 되돌아가는 문제를 고쳤다. claude agents에서 대화를 열 때 백그라운드 에이전트로 실행 중이라는 오류와 작업 프로세스의 충돌·재시작이 반복되는 문제도 수정했다.

마이크나 녹음기에서 캡처가 반복적으로 실패하면 음성 입력을 일시 중지하도록 바꿨다. 이전의 무제한 재시도 동작을 중단하는 변경이다. [S5]

### 인증·연결과 세션 복원

클라이언트 인증서를 실행 중 교체하면서 설정을 다시 적용할 때 일시적으로 mTLS 핸드셰이크가 실패하는 문제를 수정했다.

Ctrl+R 기록 검색이 파일을 스캔하는 동안 선택하거나 취소하면 충돌하던 문제를 수정했다. Git worktree가 많은 저장소에서 세션을 이름으로 복원하거나 복원 목록을 열 때 오래 걸리고 메모리를 많이 쓰는 문제도 수정했다.

SSH에서 줄이 나뉘어 클릭하기 어려웠던 로그인 URL을 하나의 링크로 출력한다. 설치·업데이트 다운로드 중 프록시나 네트워크 연결이 일시적으로 끊어지면 즉시 실패하는 대신 다시 시도하도록 바꿨다. [S5]

### 워크플로와 MCP 설정

워크플로 스크립트 문자열의 Unicode 따옴표 이스케이프가 파싱 전에 손상되는 문제와 이미 읽은 스킬을 다시 호출할 때 지시문이 중복되는 문제를 수정했다. 파싱 오류에는 실제 문제가 발생한 줄을 표시하며, /workflows 목록에는 넓어진 제목 영역과 별도 시간 열 등을 적용했다.

MCP 서버 설정에 url만 있고 type이 없으면 type을 http로 지정하라는 안내를 표시한다. 기존의 command 문자열 오류 메시지를 실제 설정 문제에 맞게 바꾼 것이다. [S5]

### PR 검토 명령

/review 명령은 PR을 한 차례 검토하는 빠른 방식으로 되돌렸다. 여러 에이전트로 검토하려면 /code-review 명령에 검토 강도와 PR 번호를 지정한다. [S5]

## OpenCode v1.17.14, MCP 도구를 실행하는 코드 모드 추가

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가, 오류 수정
**기업·기관:** 없음

OpenCode v1.17.14는 2026년 7월 7일(한국시간) 공개됐다. 연결된 MCP 도구를 대상으로 제한된 조정 스크립트를 실행하는 코드 모드 어댑터를 추가했다. [S6]

### 도구 실행과 모델 연결

execute 도구는 코드 모드가 켜진 경우에만 표시한다. 여러 페이지로 나뉜 MCP 도구 목록에서 메타데이터와 출력 스키마 검증이 누락되는 문제도 수정했다.

OpenRouter 소형 모델 변형의 low 추론 설정을 비활성화하지 않고 유지한다. GitHub Copilot은 모델별로 제공한다고 명시한 chat 또는 responses 엔드포인트로 연결하도록 수정했다.

Cerebras에 이전 답변의 추론 내용을 다시 보낼 때 해당 제공자가 지원하는 필드를 사용하도록 수정했다. [S6]

### 세션 표시와 작업 입력

같은 인스턴스 디렉터리를 다른 형태로 지정해도 세션 목록이 일치하도록 수정했다. TUI 화면의 로딩 표시가 계속 출력되도록 스피너 등록도 수정했다.

Home에서 새 세션이 잘못된 프로젝트에 연결되거나 첫 실행 안내가 부적절하게 나타나는 문제를 수정했다. 큰 검토 화면의 동작과 드롭다운 검색도 손봤다.

답변부터 시작하는 타임라인에는 누락된 사용자 입력을 보충한다. 창에 포커스가 없는 동안에도 작성창에 입력할 수 있도록 복원했다. [S6]

### 데스크톱 탭과 화면

닫힌 탭을 다시 열거나 백그라운드로 탭을 여는 기능을 추가했다. Home에는 최근 닫힌 프로젝트를 표시하고, 탭 이동은 마우스 버튼을 누르는 시점에 반응하도록 바꿨다.

제목 표시줄에 draft 서버 상태를 표시하고 제공자 연결 절차를 통일했다. 통합 터미널·모델 검색·검토 패널·세션 탭 미리보기에도 변경을 적용했다.

세션 탭을 바꿔도 검토 패널과 같은 작업공간의 터미널을 유지한다. 앱을 닫았다가 다시 열어도 데스크톱 창의 탭을 보존하도록 수정했다. [S6]

### 서버와 하위 세션

세션의 작업 중 표시가 해당 서버에만 연결되도록 수정했다. 탭을 바꾸는 동안 하위 세션을 찾거나 상위·하위 세션 관계를 확인하는 동작도 수정했다. [S6]

## LangGraph 1.2.8, 새 스레드의 상태 저장 오류 수정

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 오류 수정
**기업·기관:** 없음

LangGraph 1.2.8은 2026년 7월 7일(한국시간) 공개됐다. 릴리스 노트에 따르면 새 스레드에서 updateState를 호출할 때 스텁 체크포인트 대신 스냅샷을 강제하도록 델타 채널 오류를 수정했다. websockets 의존성은 15.0.1에서 16.0으로 갱신하고 LangGraph·Python SDK의 마이너·패치 의존성 그룹도 업데이트했다. [S7]



## AI SDK 6.0.220, 도구 결과 순서와 스트림 공백 처리 수정

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 오류 수정
**기업·기관:** 없음

AI SDK의 ai 패키지 6.0.220은 2026년 7월 7일(한국시간) 공개됐다. 생성 출력을 응답 메시지로 변환할 때 도구 결과를 도구 호출 순서대로 정렬하도록 바꿨다. extractJsonMiddleware는 마크다운 코드 블록의 시작 표시를 제거하지 않은 경우, 마지막으로 스트리밍되는 텍스트 부분의 앞쪽 공백을 보존하도록 수정했다. [S8]

### 의존성 갱신

함께 사용하는 패키지는 @ai-sdk/gateway 3.0.144와 @ai-sdk/provider-utils 4.0.36으로 갱신했다. [S8]

## AI SDK xAI 어댑터 3.0.103, 완료된 도구 호출 결과 출력 변경

**분야:** 소프트웨어·클라우드
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 변경
**기업·기관:** 없음

AI SDK의 @ai-sdk/xai 패키지 3.0.103은 2026년 7월 7일(한국시간) 공개됐다. xAI Responses API의 스트리밍 도구 호출이 완료됐을 때, 제공자 측에서 실행한 도구 결과를 출력하도록 패치했다. [S9]

### 의존성 갱신

의존성은 @ai-sdk/provider-utils 4.0.36과 @ai-sdk/openai-compatible 2.0.57으로 갱신했다. [S9]

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

- [S1] https://aws.amazon.com/blogs/machine-learning/deploying-multi-turn-rl-infrastructure-for-amazon-nova-on-amazon-sagemaker-hyperpod/
- [S2] https://aws.amazon.com/blogs/machine-learning/automatically-redact-pii-in-images-with-amazon-nova/
- [S3] https://aws.amazon.com/blogs/machine-learning/run-minimax-models-on-amazon-bedrock/
- [S4] https://aws.amazon.com/blogs/machine-learning/streaming-benchmark-and-recommendation-results-to-mlflow-with-amazon-sagemaker-ai/
- [S5] https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.202
- [S6] https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.17.14
- [S7] https://api.github.com/repos/langchain-ai/langgraph/releases/tags/1.2.8
- [S8] https://api.github.com/repos/vercel/ai/releases/tags/ai%406.0.220
- [S9] https://api.github.com/repos/vercel/ai/releases/tags/%40ai-sdk%2Fxai%403.0.103
