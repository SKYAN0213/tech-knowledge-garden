# 2026-07-21 아침 브리핑

2026-07-21 IT · AI · 로보틱스

[웹 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/07/2026-07-21_0801_tech_ai_briefing) · [브리핑 모음](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/README.md) · [RSS](https://skyan0213.github.io/tech-knowledge-garden/briefing.xml)

## 주요 소식

### [GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시](https://skyan0213.github.io/tech-knowledge-garden/news/80bba25e13259f42)

발표 2026-07-21

GitHub는 한국시간 7월 21일 Copilot Business·Enterprise 사용자가 개인 예산 없이도 이번 결제 주기의 AI 크레딧 사용량을 볼 수 있게 했다. 사용량은 GitHub 설정의 Copilot 사용량 페이지에서 확인한다.

### [GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리](https://skyan0213.github.io/tech-knowledge-garden/news/e6ab1f9b9683cfdd)

발표 2026-07-21

GitHub는 한국시간 7월 21일 비용센터를 만들거나 수정하는 청구 화면에서 Copilot AI 크레딧 풀을 직접 관리할 수 있게 했다. 대상은 GitHub Enterprise Cloud에서 Copilot Business·Enterprise를 사용하는 고객이며, 기존에는 REST API로만 관리할 수 있었다.

### [GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가](https://skyan0213.github.io/tech-knowledge-garden/news/426d91706ebf17e3)

발표 2026-07-20

GitHub는 한국시간 7월 20일 코드 품질 검사 제품 Code Quality를 GitHub Enterprise Cloud와 GitHub Team에 정식 출시했다. CodeQL의 규칙 기반 분석과 AI 탐지로 풀 리퀘스트의 유지보수성·신뢰성 문제를 찾고, Copilot Autofix가 병합 전에 사람이 검토할 수정안을 제안한다.

## 분야별 브리핑

### 소프트웨어·클라우드 · 3건

#### [GitHub Copilot, 개인 예산 없이도 결제 주기별 AI 크레딧 사용량 표시](https://skyan0213.github.io/tech-knowledge-garden/news/80bba25e13259f42)

발표 2026-07-21

제품·서비스 · 기능 추가 · GitHub

GitHub는 한국시간 7월 21일 Copilot Business·Enterprise 사용자가 개인 예산 없이도 이번 결제 주기의 AI 크레딧 사용량을 볼 수 있게 했다. 사용량은 GitHub 설정의 Copilot 사용량 페이지에서 확인한다.

##### 예산 설정에 따른 표시

기존 페이지는 예산 대비 사용 비율만 보여줘, 개인 예산이 없는 사용자는 월간 사용량을 확인하기 어려웠다.

관리자가 예산을 설정하면 전체 예산 중 사용한 크레딧을 표시하고, 예산이 없으면 현재 결제 주기의 총 사용 크레딧을 표시한다.

[GitHub 원문](https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle/)

#### [GitHub, 비용센터별 Copilot AI 크레딧 풀을 청구 화면에서 관리](https://skyan0213.github.io/tech-knowledge-garden/news/e6ab1f9b9683cfdd)

발표 2026-07-21

제품·서비스 · 기능 추가 · GitHub

GitHub는 한국시간 7월 21일 비용센터를 만들거나 수정하는 청구 화면에서 Copilot AI 크레딧 풀을 직접 관리할 수 있게 했다. 대상은 GitHub Enterprise Cloud에서 Copilot Business·Enterprise를 사용하는 고객이며, 기존에는 REST API로만 관리할 수 있었다.

##### 한도 계산과 초과 사용 정책

풀 한도는 해당 비용센터에 배정된 라이선스에 따라 자동 계산되며, 라이선스 추가·제거에 맞춰 조정된다. 관리자가 한도 숫자를 직접 지정하는 방식은 아니다.

한도에 도달하면 포함 사용량을 더 쓰지 못하게 하거나, 기업이 초과 사용을 허용하는 경우 추가 지출로 계속 사용하게 설정할 수 있다.

##### 포함 크레딧과 추가 요금의 별도 한도

크레딧 풀은 비용센터의 Copilot 라이선스가 제공하는 포함 AI 크레딧의 사용 한도다. 비용센터 예산은 풀이 소진된 뒤 발생하는 사용량 기반 요금을 제한하며, 같은 비용센터에 두 설정을 함께 적용할 수 있다.

[GitHub 원문](https://github.blog/changelog/2026-07-20-ai-credit-pools-for-cost-centers-in-the-billing-ui/)

#### [GitHub Code Quality 정식 출시, 활성 커미터당 월 10달러에 사용료 추가](https://skyan0213.github.io/tech-knowledge-garden/news/426d91706ebf17e3)

발표 2026-07-20

제품·서비스 · 신제품 · 가격 변경 · GitHub

GitHub는 한국시간 7월 20일 코드 품질 검사 제품 Code Quality를 GitHub Enterprise Cloud와 GitHub Team에 정식 출시했다. CodeQL의 규칙 기반 분석과 AI 탐지로 풀 리퀘스트의 유지보수성·신뢰성 문제를 찾고, Copilot Autofix가 병합 전에 사람이 검토할 수정안을 제안한다.

##### 품질 지표와 병합 기준

조직 전체에서 기능을 켜고 대시보드로 저장소별 유지보수성·신뢰성 점수를 볼 수 있다. 기존 Cobertura XML 테스트 보고서의 코드 커버리지도 풀 리퀘스트에 표시한다.

GitHub ruleset으로 커버리지 기준을 포함한 품질 기준을 설정하고, evaluate 모드에서 점진적으로 적용할 수 있다. 저장소의 기능 활성화 관리와 발견 항목 조회를 위한 API도 제공한다.

GitHub는 자사 엔지니어링 조직에서 발견 항목의 67.3%를 풀 리퀘스트 병합 전에 해결한다고 밝혔다.

##### 기본 요금과 과금 대상

기본 요금은 활성 커미터 1명당 월 10달러다. 최근 90일 동안 Code Quality가 켜진 저장소에 커밋을 푸시한 사용자가 대상이다.

여러 저장소에 기여해도 조직 내에서는 한 번만 계산하며, 봇 계정은 과금하지 않는다.

GitHub Advanced Security와 별도로 판매하는 유료 제품이며, 출시 시점에는 GitHub Enterprise Server를 지원하지 않는다.

##### 별도 사용료

AI 탐지와 Copilot Autofix에는 사용량 기반 요금이 붙는다. 이 기능을 쓰기 위해 GitHub Copilot 구독이 필요하지는 않다.

규칙 기반 CodeQL 분석에는 GitHub Actions 실행 비용이 발생하며, GitHub 호스팅 러너와 자체 호스팅 러너를 모두 지원한다.

##### 공개 시험 운영에서 유료 서비스로 전환

과금은 정식 출시일인 7월 20일 자동으로 시작된다. GitHub에 따르면 공개 시험 운영에 1만 개가 넘는 기업이 참여했으며, 기존 사용자는 이전 작업이나 재설정 없이 기존 GitHub 계약에 따라 유료 제품을 계속 사용한다.

이후 검사와 과금을 중단하려면 저장소 또는 조직에서 Code Quality를 비활성화해야 한다.

[GitHub 원문](https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/)
