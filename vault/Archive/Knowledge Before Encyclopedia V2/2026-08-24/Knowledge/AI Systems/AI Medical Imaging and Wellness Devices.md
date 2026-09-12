---
title: AI Medical Imaging and Wellness Devices
type: knowledge
status: evergreen
created: 2026-07-04
updated: 2026-07-24
tags:
  - AI
  - Healthcare
  - MedicalImaging
  - Governance
---

# AI Medical Imaging and Wellness Devices

## 한 줄 정의

AI Medical Imaging and Wellness Devices는 영상 센서, 대규모 계산, AI 분석을 결합해 몸 상태를 보여주려는 제품군입니다. 의료 진단 기기와 웰니스 기기 사이의 경계가 핵심 쟁점입니다.

## 왜 중요한가

이미징 제품은 사용자가 건강 결정을 내리는 데 직접 영향을 줄 수 있습니다. 제품이 "건강 데이터"나 "웰니스"를 말하더라도, 암 검진·질병 조기 발견처럼 의료적인 기대를 만들면 검증, 규제, 설명 책임이 필요합니다.

## 어떻게 작동하나

일반적인 구조는 세 단계입니다.

1. 초음파, 광학, MRI, CT 같은 센서가 신체 신호를 수집합니다.
2. 대규모 계산이 원시 신호를 2D 또는 3D 영상으로 재구성합니다.
3. AI가 노이즈 제거, 압축, 패턴 분석, 변화 추적, 사용자 설명을 돕습니다.

## 예시

- Midjourney Medical은 물과 초음파를 이용한 전신 "Ultrasonic CT"를 제안했습니다. 회사는 60초 스캔, 방사선 없음, 샌프란시스코 첫 spa, 6년 안에 약 50,000대 배치를 목표로 말합니다.
- 제품 설명은 MRI급 가능성을 강조하지만, 첫 단계는 진단 기기가 아니라 body composition map 같은 웰니스 용도로 시작하겠다고 밝힙니다.

## 한계와 위험

- 초음파는 공기, 뼈, 체형, 깊은 조직에서 물리적 한계가 큽니다.
- 의료 영상은 예쁜 이미지보다 민감도, 특이도, 재현성, 임상 유용성 검증이 중요합니다.
- 웰니스 제품으로 출시하면 FDA 같은 의료기기 검증을 일부 피할 수 있지만, 사용자가 기존 검진을 대체한다고 오해할 위험이 있습니다.
- AI가 영상 재구성이나 설명에 쓰이면 원시 데이터, 모델 변경, 오류율, 사용자 고지 방식이 감사 가능해야 합니다.

## Recent Signals

- 2026-07-24 08:00 KST 브리핑: OpenAI는 미국의 18세 이상 ChatGPT Free·Go·Plus·Pro 사용자에게 의료기관 기록과 Apple Health를 연결하는 Health 기능을 순차 출시했습니다. 기본적으로 건강 데이터를 답변에 쓰기 전 허가를 묻고, 연결 데이터와 이를 사용한 대화는 기반 모델 학습이나 광고 표적화에 쓰지 않습니다. 연결 해제 뒤 동기화 데이터는 30일 안에 삭제되지만 이미 대화에 포함된 정보는 대화를 직접 지울 때까지 남으므로, 건강 AI의 검토 범위는 모델 정확도뿐 아니라 데이터 최신성, 사용 허가, 기억·대화 보존, 삭제 경계까지 포함해야 합니다. 이 기능은 진단·치료용이 아니며 의료진을 대체하지 않습니다.
- 2026-07-04 00:05 KST 브리핑: The Verge는 Midjourney가 초음파 스캐너의 제작 과정을 담은 영상을 공개했지만, 전문가들이 제기한 영상 품질, 초음파 물리 한계, MRI급 주장, 웰니스와 의료 진단의 경계 문제에는 충분히 답하지 않았다고 보도했습니다. Midjourney의 공식 페이지는 60초 전신 초음파, 2027년 샌프란시스코 spa, body composition 중심의 초기 사용 계획을 설명합니다.

## 브리핑에서 볼 체크리스트

- 제품이 진단 기기인지, 웰니스 기기인지 명확히 구분하는가
- 임상 검증, FDA clearance, 시험 결과가 공개되어 있는가
- AI가 실제로 맡는 역할이 재구성, 압축, 분석, 설명 중 무엇인가
- 기존 검진을 대체하지 않는다는 사용자 고지가 충분한가
- 성능 주장이 센서 물리 한계와 실제 임상 데이터로 뒷받침되는가

## 연결 문서

- [[Knowledge/AI Systems/AI for Scientific Discovery|AI for Scientific Discovery]]
- [[Knowledge/AI Systems/AI Governance and Conformity Assessment|AI Governance and Conformity Assessment]]
- [[Knowledge/AI Systems/AI Agent Security and Governance|AI Agent Security and Governance]]

## Source Links

- https://openai.com/index/health-in-chatgpt/
- https://help.openai.com/en/articles/20001036
- https://www.midjourney.com/medical
- https://www.midjourney.com/medical/blogpost
- https://www.theverge.com/ai-artificial-intelligence/961265/midjourney-medical-ultrasound-scanner-behind-the-scenes-video
- https://www.theverge.com/report/954826/midjourney-medical-ai-ultrasound-body-scanner-lacks-evidence
