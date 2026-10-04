---
title: 2026-08-29 데일리 Tech & AI 매거진
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-08-29
timezone: Asia/Seoul
coverage_start: 2026-08-28T08:02:09+09:00
coverage_end: 2026-08-29T08:00:51+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 2
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
knowledge_notes_created: []
knowledge_notes_updated:
  - "[[Knowledge/AI Systems/AI Agent Security|AI Agent Security]]"
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
headlines:
  - NVIDIA NemoClaw v0.0.115, 소유 컨테이너 복구와 샌드박스 검사 강화
  - NVIDIA, 공개 모델 체크포인트를 C++ 추론으로 연결하는 Model Connect 소개
article_records:
  - title: NVIDIA NemoClaw v0.0.115, 소유 컨테이너 복구와 샌드박스 검사 강화
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA
      when: 2026-08-28
      where: NVIDIA/NemoClaw GitHub 릴리스
      what: NemoClaw v0.0.115 릴리스 발표
      how: Portable Hermes 복구 로직 개선, 샌드박스 수명주기 권한 관리, 메시징 자격증명 연결, Docker 온보딩 보안 강화,
        보안·진단 경로 검증 강화
      why: 미기재
    lead: NVIDIA는 2026년 8월 28일 NemoClaw v0.0.115를 발표하고 Portable Hermes 복구, 샌드박스 관리와
      메시징 자격증명 처리를 갱신했다. 복구 작업은 기록에 등록된 정확한 컨테이너와 실행 환경을 다시 확인하며, 기본 Docker 이미지
      조회에 실패하면 샌드박스를 만들기 전에 중단한다. 조치가 필요한 샌드박스 상태에는 0이 아닌 종료 코드를 반환하고, 불완전한 설정을
      성공으로 보고하지 않도록 검사도 보강했다.
    explanations:
      - heading: 복구 대상 확인과 시작·롤백 조건
        paragraphs:
          - Portable Hermes는 각 작업 전에 소유권 기록(receipt)에 등록된 Podman 컨테이너, OpenShell
            게이트웨이, 실행 파일, 정책, 경로와 런타임 식별자를 확인한다.
          - 중지된 소유 컨테이너를 시작했는데 인증된 Hermes 상태가 확인되지 않으면, 기록된 시작 명령을 한 번 실행하고 상태를
            기다린다. 이미 실행 중인 컨테이너에는 추가 시작 명령을 실행하지 않는다. 복구가 실패하면 그 복구가 직접 시작한
            컨테이너만 되돌린다.
        source_urls:
          - https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.115
      - heading: 기본 이미지와 메시징 자격증명 처리
        paragraphs:
          - OpenClaw, Hermes와 LangChain Deep Agents Code의 기본 Docker 온보딩에는 해당
            릴리스의 정확한 관리 이미지가 필요하다. registry나 catalog 조회가 실패하면 로컬 기본 이미지 빌드로 대체하지
            않고 샌드박스 생성 전에 중단한다. 사용자가 명시한 Dockerfile은 별도 경로로 처리한다.
          - 메시징 설정은 샌드박스를 만들거나 다시 만들기 전에 revision별 자격증명을 정식 OpenShell provider에
            연결한다. 유지보수되는 Slack, Discord, Google Chat과 Telegram 경로에서 실행 시 자격증명
            전달을 복구했다고 설명한다.
        source_urls:
          - https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.115
      - heading: 샌드박스 검사와 실험적 실행기의 범위
        paragraphs:
          - upgrade-sandboxes --check는 조치가 필요한 오래된 상태, 버전 불명, 백업 복구 또는 샌드박스 누락에
            0이 아닌 종료 코드를 반환한다. 삭제와 오래된 컨테이너 정리의 대기 시간을 제한하고, 삭제를 확인할 수 없으면
            registry나 수명주기 권한을 유지한다.
          - 심볼릭 링크로 연결된 설정 디렉터리에서는 설정을 읽지 않으며, 디버그 묶음에 담긴 URL의 사용자정보 자격증명은 가린다.
            불완전한 온보딩 상태도 성공으로 표시하지 않는다.
          - 실험적 blueprint runner는 외부 관리 OpenShell 대상의 계획에서 HTTPS endpoint,
            workspace, 예상 릴리스 범위, CA bundle과 인증 파일 메타데이터를 검사한다. 자격증명 내용을 읽거나
            gateway에 연결해 인증·변경 적용을 수행하는 단계는 포함하지 않는다.
        source_urls:
          - https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.115
    papers: []
    relations: []
    topic_ids: []
  - title: NVIDIA, 공개 모델 체크포인트를 C++ 추론으로 연결하는 Model Connect 소개
    kind: 사건 뉴스
    region: 해외
    facts:
      who: NVIDIA
      when: 2026-08-28
      where: NVIDIA 기술 블로그
      what: TensorRT Model Connect 공개
      how: Hugging Face 모델 ID 또는 로컬 체크포인트에서 TensorRT 엔진과 실행 자산을 담은 배포 번들을 생성하여 네이티브
        C++ 애플리케이션으로 배포
      why: 미기재
    lead: NVIDIA는 2026년 8월 28일 기술 블로그에서 지원되는 공개 모델을 TensorRT 기반 네이티브 C++ 애플리케이션으로
      배포하는 TensorRT Model Connect를 소개했다. Hugging Face 모델 ID나 로컬 체크포인트에서 TensorRT
      엔진과 모델별 실행 자산을 담은 번들을 만든 뒤 C++ 애플리케이션에서 불러와 추론한다. 모델 준비에는 Python을 사용할 수
      있지만, 배포된 애플리케이션의 실행에는 PyTorch나 Python 인터프리터가 필요하지 않다.
    explanations:
      - heading: 체크포인트 매핑과 실행 자산을 담은 번들
        paragraphs:
          - Model Connect는 확인·수정·확장할 수 있는 공개 참조 구현 모음으로, 체크포인트 매핑과 TensorRT 엔진
            생성, 전처리, 실행 조정, 후처리를 처리한다.
          - NVIDIA는 이 구현이 새로운 추론 프레임워크나 TensorRT 대체물이 아니라 공개 모델의 전체 추론 경로와
            TensorRT 엔진을 연결한다고 설명했다.
        source_urls:
          - https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/
      - heading: 작업 입출력 API와 텐서 수준 API
        paragraphs:
          - 작업 수준의 semantic API는 프롬프트·이미지·오디오 등의 입출력을 받는다. module API는 이름이 지정된
            텐서와 개별 TensorRT 구성요소를 다뤄 추론 경로를 조정하게 한다.
        source_urls:
          - https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/
      - heading: 모델 일부의 GPU 커널 교체
        paragraphs:
          - TVM FFI를 통해 모델의 일부를 사용자 GPU 커널로 바꾸고, 나머지 추론 경로는 TensorRT로 실행할 수 있다.
        source_urls:
          - https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/
    papers: []
    relations: []
    topic_ids: []
article_reviews:
  - title: NVIDIA NemoClaw v0.0.115, 소유 컨테이너 복구와 샌드박스 검사 강화
    event_id: bab0e1718e7e0799
    review_status: verified
    published_at: 2026-08-28
    reviewed_at: 2026-09-27
    concept_ids:
      - agent-security
  - title: NVIDIA, 공개 모델 체크포인트를 C++ 추론으로 연결하는 Model Connect 소개
    event_id: a0eed0f62d0dd240
    review_status: verified
    published_at: 2026-08-28
    reviewed_at: 2026-09-27
    concept_ids:
      - inference
---

# 이번 호 표지

NVIDIA NemoClaw v0.0.115, 소유 컨테이너 복구와 샌드박스 검사 강화

# 차례

- NVIDIA NemoClaw v0.0.115, 소유 컨테이너 복구와 샌드박스 검사 강화
- NVIDIA, 공개 모델 체크포인트를 C++ 추론으로 연결하는 Model Connect 소개

# 커버 스토리

없음

# 뉴스 데스크

## NVIDIA NemoClaw v0.0.115, 소유 컨테이너 복구와 샌드박스 검사 강화

**분야:** AI
**테마:** 제품·서비스
**보조 테마:** 없음
**세부 태그:** 기능 추가
**기업·기관:** NVIDIA

NVIDIA는 2026년 8월 28일 NemoClaw v0.0.115를 발표하고 Portable Hermes 복구, 샌드박스 관리와 메시징 자격증명 처리를 갱신했다. 복구 작업은 기록에 등록된 정확한 컨테이너와 실행 환경을 다시 확인하며, 기본 Docker 이미지 조회에 실패하면 샌드박스를 만들기 전에 중단한다. 조치가 필요한 샌드박스 상태에는 0이 아닌 종료 코드를 반환하고, 불완전한 설정을 성공으로 보고하지 않도록 검사도 보강했다. [S1]

### 복구 대상 확인과 시작·롤백 조건

Portable Hermes는 각 작업 전에 소유권 기록(receipt)에 등록된 Podman 컨테이너, OpenShell 게이트웨이, 실행 파일, 정책, 경로와 런타임 식별자를 확인한다.

중지된 소유 컨테이너를 시작했는데 인증된 Hermes 상태가 확인되지 않으면, 기록된 시작 명령을 한 번 실행하고 상태를 기다린다. 이미 실행 중인 컨테이너에는 추가 시작 명령을 실행하지 않는다. 복구가 실패하면 그 복구가 직접 시작한 컨테이너만 되돌린다. [S1]

### 기본 이미지와 메시징 자격증명 처리

OpenClaw, Hermes와 LangChain Deep Agents Code의 기본 Docker 온보딩에는 해당 릴리스의 정확한 관리 이미지가 필요하다. registry나 catalog 조회가 실패하면 로컬 기본 이미지 빌드로 대체하지 않고 샌드박스 생성 전에 중단한다. 사용자가 명시한 Dockerfile은 별도 경로로 처리한다.

메시징 설정은 샌드박스를 만들거나 다시 만들기 전에 revision별 자격증명을 정식 OpenShell provider에 연결한다. 유지보수되는 Slack, Discord, Google Chat과 Telegram 경로에서 실행 시 자격증명 전달을 복구했다고 설명한다. [S1]

### 샌드박스 검사와 실험적 실행기의 범위

upgrade-sandboxes --check는 조치가 필요한 오래된 상태, 버전 불명, 백업 복구 또는 샌드박스 누락에 0이 아닌 종료 코드를 반환한다. 삭제와 오래된 컨테이너 정리의 대기 시간을 제한하고, 삭제를 확인할 수 없으면 registry나 수명주기 권한을 유지한다.

심볼릭 링크로 연결된 설정 디렉터리에서는 설정을 읽지 않으며, 디버그 묶음에 담긴 URL의 사용자정보 자격증명은 가린다. 불완전한 온보딩 상태도 성공으로 표시하지 않는다.

실험적 blueprint runner는 외부 관리 OpenShell 대상의 계획에서 HTTPS endpoint, workspace, 예상 릴리스 범위, CA bundle과 인증 파일 메타데이터를 검사한다. 자격증명 내용을 읽거나 gateway에 연결해 인증·변경 적용을 수행하는 단계는 포함하지 않는다. [S1]

**개념:** [[Knowledge/AI Systems/AI Agent Security]]

## NVIDIA, 공개 모델 체크포인트를 C++ 추론으로 연결하는 Model Connect 소개

**분야:** AI
**테마:** 표준·생태계
**보조 테마:** 없음
**세부 태그:** 호환성
**기업·기관:** NVIDIA

NVIDIA는 2026년 8월 28일 기술 블로그에서 지원되는 공개 모델을 TensorRT 기반 네이티브 C++ 애플리케이션으로 배포하는 TensorRT Model Connect를 소개했다. Hugging Face 모델 ID나 로컬 체크포인트에서 TensorRT 엔진과 모델별 실행 자산을 담은 번들을 만든 뒤 C++ 애플리케이션에서 불러와 추론한다. 모델 준비에는 Python을 사용할 수 있지만, 배포된 애플리케이션의 실행에는 PyTorch나 Python 인터프리터가 필요하지 않다. [S2]

### 체크포인트 매핑과 실행 자산을 담은 번들

Model Connect는 확인·수정·확장할 수 있는 공개 참조 구현 모음으로, 체크포인트 매핑과 TensorRT 엔진 생성, 전처리, 실행 조정, 후처리를 처리한다.

NVIDIA는 이 구현이 새로운 추론 프레임워크나 TensorRT 대체물이 아니라 공개 모델의 전체 추론 경로와 TensorRT 엔진을 연결한다고 설명했다. [S2]

### 작업 입출력 API와 텐서 수준 API

작업 수준의 semantic API는 프롬프트·이미지·오디오 등의 입출력을 받는다. module API는 이름이 지정된 텐서와 개별 TensorRT 구성요소를 다뤄 추론 경로를 조정하게 한다. [S2]

### 모델 일부의 GPU 커널 교체

TVM FFI를 통해 모델의 일부를 사용자 GPU 커널로 바꾸고, 나머지 추론 경로는 TensorRT로 실행할 수 있다. [S2]

**개념:** [[Knowledge/AI Systems/AI Inference Infrastructure]]

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

- [S1] https://github.com/NVIDIA/NemoClaw/releases/tag/v0.0.115
- [S2] https://developer.nvidia.com/blog/deploy-an-open-model-from-checkpoint-to-inference-in-two-commands-with-nvidia-tensorrt-model-connect/
