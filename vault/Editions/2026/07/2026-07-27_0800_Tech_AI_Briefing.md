---
title: 2026-07-27 Tech & AI Briefing
type: briefing
schema_version: tech-ai-magazine/v2
date: 2026-07-27
timezone: Asia/Seoul
coverage_start: 2026-07-26T08:01:50+09:00
coverage_end: 2026-07-27T08:00:24+09:00
editorial_format: six-w/v1
briefing_format: sector-five/v1
theme_format: news-themes/v1
source_count: 2
new_items_count: 1
linked_knowledge_notes:
  - "[[Knowledge/AI Systems/AI Inference Infrastructure|AI Inference
    Infrastructure]]"
  - Knowledge/AI Systems/Classifier-Free Guidance
  - Knowledge/AI Systems/Diffusion Transformer
knowledge_notes_created: []
knowledge_notes_updated: []
headlines:
  - GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용
article_records:
  - title: GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용
    kind: 논문 해설
    region: 해외
    facts:
      who: GalaxyDiT 연구진
      when: 2026-07-26
      where: 미기재
      what: 확산 트랜스포머 영상 생성의 반복 계산 재사용 방법 GalaxyDiT 제안
      how: 조건부·무조건부 경로 함께 계산/재사용, 대리 지표 기반 재사용 판단
      why: 서로 다른 노이즈 단계 예측이 합쳐질 때 발생하는 영상 왜곡 방지
    lead: NVIDIA는 7월 26일 DAC 2026의 GalaxyDiT 논문을 연구 페이지에 소개했다. 이 방법은 영상 확산 트랜스포머의 반복
      계산을 모델 재학습 없이 재사용하며, 조건부·무조건부 경로의 계산과 재사용을 함께 결정한다.
    explanations:
      - heading: CFG의 두 경로를 같은 단계에서 결합
        paragraphs:
          - 연구진은 조건부·무조건부 확산 계산의 재사용을 따로 결정하면 서로 다른 노이즈 단계의 예측이 CFG에서 결합돼 영상 왜곡이
            생길 수 있다고 설명했다. 추가 학습 없이 적용하는 GalaxyDiT는 조건부 경로 첫 DiT 블록의 대리 지표로 두
            경로를 함께 계산할지, 함께 재사용할지 판단한다.
          - 대리 지표는 기준 지표와의 Spearman 순위 상관을 비교해 모델별로 선정한다. 모든 실험 모델에서 초기 20% 확산
            단계는 재사용하지 않았다.
        source_urls:
          - https://arxiv.org/html/2512.03451v1
      - heading: 모델·GPU·영상 길이를 맞춘 비교
        paragraphs:
          - Wan2.1 두 모델은 50단계와 VBench 2.0의 1,330개 프롬프트로 평가했다. 지연 측정에는 1.3B 모델에서
            A100 한 대, 14B 모델에서 A100 여덟 대를 사용했다. Cosmos-Predict2-2B는 36단계·이미지와
            프롬프트 1,118쌍을 A100 한 대에서 평가했다.
          - 비교 기준은 원본 모델의 전체 계산이다. PSNR·SSIM·LPIPS는 원본 모델이 생성한 영상을 기준으로 계산했다.
        source_urls:
          - https://arxiv.org/html/2512.03451v1
      - heading: 재사용 설정별 속도와 영상 품질
        paragraphs:
          - 본문 Table 2에서 Wan2.1-1.3B slow 설정은 81프레임·832×480 영상에서 1.85배 가속했고,
            VBench 점수는 56.65%에서 55.68%로 0.97%포인트 낮아졌다. 같은 모델의 fast 설정은 2.57배 가속과
            52.83%를 보고해 기준보다 3.82%포인트 낮았다.
          - Wan2.1-14B fast 설정은 81프레임·1280×720에서 2.37배 가속했고, VBench는 58.36%에서
            57.64%로 0.72%포인트 낮아졌다. 재사용 임계값에 따라 fast는 속도를, slow는 품질을 우선한다.
        source_urls:
          - https://arxiv.org/html/2512.03451v1
      - heading: 재사용에 필요한 추가 메모리
        paragraphs:
          - 14B 모델의 시퀀스 길이 75,600에서 재사용용 텐서 네 개가 차지하는 GPU 메모리는 2.88GB다. 이는 모델
            매개변수 자체의 28GB 및 텍스트 인코더의 20GB와 별도이며, 텍스트 인코더는 확산 계산 중 오프로딩할 수 있다.
        source_urls:
          - https://arxiv.org/html/2512.03451v1
    papers:
      - work_id: galaxydit
        identifiers:
          - arxiv:2512.03451v1
        access: 전문
        status: 사전공개
        evidence_url: https://arxiv.org/html/2512.03451v1
    relations: []
    topic_ids:
      - performance-path
article_reviews:
  - title: GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용
    event_id: a9911e33a5a858b4
    review_status: verified
    published_at: 2026-07-26
    reviewed_at: 2026-10-05
    concept_ids:
      - classifier-free-guidance
      - diffusion-transformer
---

# 이번 호 표지

GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용

# 차례

- GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용

# 커버 스토리

없음

# 뉴스 데스크

## GalaxyDiT, 영상 확산 모델의 두 계산 경로를 함께 재사용

**분야:** AI
**테마:** 연구·기술
**보조 테마:** 없음
**세부 태그:** 새로운 방법, 성능 개선
**기업·기관:** GalaxyDiT 연구진, NVIDIA

NVIDIA는 7월 26일 DAC 2026의 GalaxyDiT 논문을 연구 페이지에 소개했다. 이 방법은 영상 확산 트랜스포머의 반복 계산을 모델 재학습 없이 재사용하며, 조건부·무조건부 경로의 계산과 재사용을 함께 결정한다. [S1] [S2]

### CFG의 두 경로를 같은 단계에서 결합

연구진은 조건부·무조건부 확산 계산의 재사용을 따로 결정하면 서로 다른 노이즈 단계의 예측이 CFG에서 결합돼 영상 왜곡이 생길 수 있다고 설명했다. 추가 학습 없이 적용하는 GalaxyDiT는 조건부 경로 첫 DiT 블록의 대리 지표로 두 경로를 함께 계산할지, 함께 재사용할지 판단한다.

대리 지표는 기준 지표와의 Spearman 순위 상관을 비교해 모델별로 선정한다. 모든 실험 모델에서 초기 20% 확산 단계는 재사용하지 않았다. [S2]

### 모델·GPU·영상 길이를 맞춘 비교

Wan2.1 두 모델은 50단계와 VBench 2.0의 1,330개 프롬프트로 평가했다. 지연 측정에는 1.3B 모델에서 A100 한 대, 14B 모델에서 A100 여덟 대를 사용했다. Cosmos-Predict2-2B는 36단계·이미지와 프롬프트 1,118쌍을 A100 한 대에서 평가했다.

비교 기준은 원본 모델의 전체 계산이다. PSNR·SSIM·LPIPS는 원본 모델이 생성한 영상을 기준으로 계산했다. [S2]

### 재사용 설정별 속도와 영상 품질

본문 Table 2에서 Wan2.1-1.3B slow 설정은 81프레임·832×480 영상에서 1.85배 가속했고, VBench 점수는 56.65%에서 55.68%로 0.97%포인트 낮아졌다. 같은 모델의 fast 설정은 2.57배 가속과 52.83%를 보고해 기준보다 3.82%포인트 낮았다.

Wan2.1-14B fast 설정은 81프레임·1280×720에서 2.37배 가속했고, VBench는 58.36%에서 57.64%로 0.72%포인트 낮아졌다. 재사용 임계값에 따라 fast는 속도를, slow는 품질을 우선한다. [S2]

### 재사용에 필요한 추가 메모리

14B 모델의 시퀀스 길이 75,600에서 재사용용 텐서 네 개가 차지하는 GPU 메모리는 2.88GB다. 이는 모델 매개변수 자체의 28GB 및 텍스트 인코더의 20GB와 별도이며, 텍스트 인코더는 확산 계산 중 오프로딩할 수 있다. [S2]

**개념:** [[Knowledge/AI Systems/Classifier-Free Guidance]], [[Knowledge/AI Systems/Diffusion Transformer]]

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

- [S1] https://research.nvidia.com/publication/2026-07_galaxydit-efficient-video-generation-guidance-alignment-and-adaptive-proxy
- [S2] https://arxiv.org/html/2512.03451v1
