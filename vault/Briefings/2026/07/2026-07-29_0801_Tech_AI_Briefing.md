---
title: 2026-07-29 · 아침 브리핑
type: briefing-index
date: 2026-07-29
created: 2026-07-29
modified: 2026-07-29
description: 2026-07-29 IT · AI · 로보틱스
coverage_start: 2026-07-28T08:05:00+09:00
coverage_end: 2026-07-29T08:01:07+09:00
item_count: 0
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# 2026-07-29 · 아침 브리핑

## 한눈에 보기

- GitHub가 악성 패키지 경보를 npm 밖의 더 많은 생태계로 넓히고, 탈취된 계정으로 만든 것으로 의심되는 Actions 워크플로는 사람이 승인하기 전까지 실행하지 않도록 했습니다.
- 논문·별도 오픈소스 도구 업데이트는 없음.

## 오늘의 핵심 기사

## 공급망 공격, 설치 뒤 탐지에서 실행 전 차단으로

GitHub가 오픈소스 의존성과 CI/CD(코드를 자동으로 빌드·배포하는 과정)의 서로 다른 공격 경로에 새 방어선을 추가했습니다. 알려진 악성 패키지는 더 넓게 찾아내고, 의심스러운 자동화 코드는 실행 전에 멈춥니다.

**핵심 사실:** GitHub Advisory Database는 OpenSSF의 공개 악성 패키지 데이터를 자동으로 가져오기 시작했습니다. Malware alerts를 켠 저장소는 npm, PyPI 등을 포함한 더 넓은 생태계의 알려진 악성 의존성과 일치할 때 Dependabot 경보를 받습니다. 별도 설정 없이 새 데이터가 반영되지만, 기능 자체는 활성화돼 있어야 합니다.

GitHub Actions는 탈취된 자격증명으로 악성 워크플로를 넣어 CI/CD 비밀정보를 훔치는 공격에 대응해, 의심되는 실행을 자동 보류합니다. 쓰기 권한이 있는 협업자가 인증된 웹 세션에서 승인해야 실행되며, 이 보호는 별도 설정 없이 적용됩니다.

**왜 중요한가:** 패키지 이름만 정상처럼 보이게 하거나 자동화 파일을 바꾸는 공격은 코드 검토를 비켜갈 수 있습니다. 패키지 데이터 공유와 실행 전 승인을 함께 쓰면 “알려진 악성 요소 탐지”와 “아직 확정하지 못한 위험 행동 차단”을 서로 보완할 수 있습니다.

**구독자가 알아둘 점:** 악성 패키지 경보는 모든 새 공격을 즉시 잡지 못하며, 내부 패키지가 공개 악성 패키지와 같은 이름·버전을 쓰면 오탐이 생길 수 있습니다. Actions의 새 자동 보류는 현재 github.com의 공개 저장소에만 적용되고 GitHub Enterprise Server에는 적용되지 않습니다.

**다음에 볼 점:** GitHub가 어떤 신호로 워크플로를 보류하는지, 비공개 저장소와 Enterprise Server로 범위를 넓히는지, 확장된 패키지 데이터에서 오탐을 얼마나 빠르게 정정하는지 확인해야 합니다.

더 깊게 보기: [[Knowledge/Software Engineering/Software Supply Chain Security|Software Supply Chain Security]]

## 논문과 연구

없음

## 오픈소스와 도구

없음

## 흐름 읽기

**분석:** 소프트웨어 공급망 방어는 취약점 목록을 보고 사후 수정하는 방식에서, 여러 생태계의 악성 패키지 정보를 공유하고 의심스러운 CI/CD 실행 자체를 사람 승인 전까지 멈추는 방식으로 이동하고 있습니다. 다만 탐지 데이터와 자동 판정 모두 오탐·지연 가능성이 있어, 경보 검토 책임자와 긴급 승인 절차가 함께 필요합니다.

## 바로 써먹을 점

- **개발 생산성:** 저장소와 조직의 Dependabot Malware alerts가 실제로 켜져 있는지 확인하고, 오탐을 닫을 때는 감사 가능한 근거를 남기세요.
- **업무 자동화:** 공개 저장소의 Actions 실행이 보류될 때 승인할 담당자와 확인 항목을 정하세요. 변경된 워크플로, 요청 권한, 사용하는 secret을 승인 전에 확인하는 것이 핵심입니다.

## Source List

- https://github.blog/changelog/2026-07-28-dependabot-alerts-on-malicious-packages-across-more-ecosystems/
- https://github.blog/changelog/2026-07-28-github-actions-holds-unproven-workflows-for-approval/
- https://github.com/ossf/malicious-packages
- https://docs.github.com/en/code-security/concepts/supply-chain-security/malware-alerts
- https://docs.github.com/en/organizations/managing-organization-settings/actions-policies/workflow-execution-protections
