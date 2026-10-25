# 실행·배포 권한을 경로별로 세분화

자동화가 할 수 있는 일을 어느 단계에서 제한하는가?

[← 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [GitHub 정리](https://github.com/SKYAN0213/tech-knowledge-garden/blob/main/digest/topics/execution-permissions.md)

## 현재 판단

npm 배포 신원, 에이전트 작업, PR 병합, 캐시 접근에 각각 통제 지점이 추가됐다. 제어 기능이 존재하는 것과 실제 설정이 안전하게 적용된 것은 구분해야 한다. 9월21일 GitHub의 자격증명 목록 내보내기는 감사 입력을 추가했지만 토큰 폐기나 최소 권한 적용은 별도 조치다. 9월22일 네이버 DSAC 출시와 Proofpoint 연말 기능 예고는 제공 단계가 다르다. 접근 정책·로그·사람 승인 적용은 별도 운영 검증이 필요하다.  9월30일 Data Agent Kit은 사용자·서비스 계정 권한 전파를 설명했지만, 같은 날 Cisco와 AMD는 각각 관리 API·RCCL 실행 경계 취약점을 공지했다. 통제 기능의 존재와 설치된 최소 권한·패치 안전성을 구분한다.

2026-10-25까지 서로 다른 원문 17건 · 11일에 걸쳐 관측. 최근 7일 4건 / 이전 7일 2건. 수집한 기사에 한정한 기록이며 미정리 기간을 포함한다.

## 다음 확인

실제 실행 SHA·환경 신원, 예외·우회 권한, 실패 시 차단 결과를 테스트하고 변경 이력을 확인한다.

## 판단을 바꿀 조건

하위 설정이나 우회 권한이 경계를 넓히거나 낮은 신뢰 이벤트에 쓰기를 허용하면 통제 강화 효과를 다시 평가한다.

## 재사용할 원칙

여러 날짜의 근거와 적용 한계를 더 확인하는 중이다.

## 관측 기록

기존 수록 기사 재정리 · 2026-10-09, 2026-10-10 검토. 아래 날짜는 기사 수록일이다.

<a id="php-session-rce-20261024"></a>

### 2026-10-24 · 반대·제약

**10월24일 KRCERT 권고문은 PHP 세션 처리의 CVE-2026-115560 원격 코드 실행 취약점과 패치 전 임시 설정·워커 재시작을 안내했다.**

실행 경계의 안전성은 설치한 판본뿐 아니라 실제 세션 설정과 실행 중인 워커에 달렸다는 제약 사례다. 기존 권한 통제 기능이 있다는 사실과 실제 안전한 실행을 구분하는 주제에 반대·제약 근거를 더한다.

- 한계: 세 조건을 모두 충족할 때만 영향받는다: 설정 파일의 serialize handler가 php_binary 또는 php_serialize이고, session_start() 전 ini_set()으로 php로 바꾸며, upload_progress가 활성화된 경우다. 영향 판본은 미공개, 해결 판본은 미배포이며10월21일 PHP2Shell 보안 업데이트로도 해결되지 않는다. 임시 조치는 upload_progress=0과 모든 PHP 워커 재시작이다. 실제 악용이나 특정 서버 침해를 확인한 결과는 아니다.
- 다음 확인: 공식 해결 판본의 배포와 해당 CVE 반영, 실제 웹 서비스의 세션 설정 및 재시작된 워커를 확인한다. PHP2Shell 대응과 이 CVE의 해결 여부를 따로 대조한다.
- [PHP 세션 취약점 CVE-2026-115560 임시 조치 권고](https://skyan0213.github.io/tech-knowledge-garden/news/4c4435f5cbe49c5a) · [krcert.or.kr 원문](https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72237) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="github-enterprise-apps-ga-20261023"></a>

### 2026-10-23 · 관측

**GitHub가 enterprise 단위 GitHub Apps 설치를 정식 제공하고 거버넌스·보안·관리 API 권한을 확장해 더 많은 기업·조직 자동화에서 classic PAT를 대체할 수 있도록 했다.**

기존 자격증명 목록 감사와 다른 변화로, 기업 자동화가 사용할 App 권한을 선택하는 경로가 넓어졌다. 권한별 Read/Write와 의존 권한을 따로 검토해야 한다는 기존 주제를 보강하지만, 실제 최소 권한 적용이나 사고 감소를 입증한 결과는 아니다.

- 한계: 모든 PAT나 API가 대체된다는 발표가 아니다. 기업 조직·저장소 정책 접근에는 Enterprise settings의 Read가 필수이며, 새 권한과 기존 people·billing 권한의 API 추가 범위를 구분한다. App에서 필요한 권한을 선택해야 하고 GitHub Enterprise Server는 3.24에서 제공될 예정이다. 저장소 visibility 정책을 모든 비공개 본문 접근 권한으로 읽지 않는다.
- 다음 확인: 실제 App이 요청·부여받은 Read/Write 및 Enterprise settings 의존 권한, 미선택 권한 호출의 거부, 기존 PAT 회수와 GHES 3.24의 실제 제공 범위를 확인한다.
- [GitHub Apps 기업 설치 GA…정책·보안·관리 API 지원 확대](https://skyan0213.github.io/tech-knowledge-garden/news/16c7779781249595) · [GitHub 원문](https://github.blog/changelog/2026-10-23-enterprise-installations-for-github-apps-generally-available) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="php2shell-response-20261022"></a>

### 2026-10-22 · 반대·제약

**KRCERT는 로그인 없이 서버 명령을 실행할 수 있는 PHP2Shell CVE-2026-109618·109619와 메모리의 인증정보 유출 위험을 알리고 패치·실제 웹 서비스 재시작·침해 흔적 점검을 함께 권고했다.**

패치 파일이나 명령줄의 버전 확인만으로 실제 서버의 실행 경계가 복구됐다고 볼 수 없다는 운영 조건을 더한다. 기존 자격증명 감사 관찰과도 달리 취약 실행 환경과 노출된 인증정보의 대응을 함께 묻는 사건이다.

- 한계: 권고문이 제시한 해결 판본은 PHP8.5.12·8.4.27·8.3.36·8.2.35 이상이며 배포판 패치는 버전 문자열이 그대로일 수 있다. 재시작되지 않은 웹 서비스는 이전 코드가 남을 수 있고 컨테이너는 새 이미지 재배포가 필요하다. 임시 설정은 완전한 차단이 아니며 로그에 이상이 없다고 안전이 보장되지 않는다. 침해 대응 때는 업데이트·재시작 전에 메모리 등 증거를 먼저 보존해야 한다. 이 권고만으로 특정 서버 침해를 확정하지 않는다.
- 다음 확인: 실제 웹 실행 판본과 패키지 CVE 변경 이력, 증거 보존 뒤 패치·재시작·컨테이너 재배포 및 노출 인증정보 교체 여부를 확인한다.
- [KRCERT, PHP2Shell 취약점 대응 위해 패치와 침해 흔적 점검 권고](https://skyan0213.github.io/tech-knowledge-garden/news/26cee6c8988b9fda) · [krcert.or.kr 원문](https://www.krcert.or.kr/kr/bbs/view.do?searchCnd=&bbsId=B0000133&searchWrd=&menuNo=205020&pageIndex=1&categoryCode=&nttId=72230) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="github-npm-package-firewall-20261021"></a>

### 2026-10-21 · 관측

**npm 패키지 취득 경로의 메타데이터 요청과 다운로드에 정책 평가를 적용하는 공개 미리보기가 추가됐다.**

기존 실행·배포 권한 통제에 의존성 취득 경로의 점검이 더해졌다는 편집 해석이다.

- 한계: Enterprise Cloud 공개 미리보기·npm만 지원하며 엔드포인트 설정이 필요하다. 실제 차단 효과나 우회 방지를 검증한 결과는 아니다.
- 다음 확인: 실제 설정·직접 다운로드 경로·오탐 예외 권한과 감사 기록을 확인한다.
- [GitHub, npm 패키지 방화벽 공개 미리보기 제공](https://skyan0213.github.io/tech-knowledge-garden/news/d2f4c2d99fe6839a) · [GitHub 원문](https://github.blog/changelog/2026-10-20-github-package-firewall-in-public-preview) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-22_0800_tech_ai_briefing)
- 2026-10-22 원문 검토

<a id="unc7017-aomei-config-execution-boundary"></a>

### 2026-10-15 · 참고

**GTIG와 Mandiant는 2026년 4~7월 AOMEI 업데이트 설정을 5~10분씩 변조해 정상 업데이트·팝업 흐름으로 악성코드를 전달·실행한 캠페인을 보고했다.**

이 관측은 자동 업데이트가 원격 설정을 실행 지시로 받아들이는 경계를 검토할 구체적인 사례다. 보고서의 payload·설정 서명 검증 권고는 통제 지점을 전송 경로뿐 아니라 실행 전 검증까지 나눠 살펴보게 한다.

- 한계: 가용 텔레메트리에 따른 소급 관측이며 추가 변조와 전체 피해 범위는 확정되지 않았다. 서명 검증 권고의 실제 도입이나 차단 성과를 확인한 보고는 아니다.
- 다음 확인: 업데이트 설정과 실행 파일의 서명 검증 적용 여부, 변조창에 업데이트한 endpoint의 잔존 payload, 캐시 설정과 정확한 경보 시점의 네트워크 기록을 확인한다.
- [AOMEI 업데이트 서버, 5~10분씩 설정 변조돼 공급망 침해에 악용](https://skyan0213.github.io/tech-knowledge-garden/news/22e9e157a17745fa) · [Google 원문](https://cloud.google.com/blog/topics/threat-intelligence/investigating-ephemeral-supply-chain-tampering/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="armory-castle-remote-support-root-credentials"></a>

### 2026-10-15 · 참고

**Mandiant는 ARMORY CASTLE이 2026년 8월 말 BeyondTrust Remote Support 취약점을 제로데이로 악용한 뒤 호스트 root 권한을 얻어 저장·중개 자격 증명에 접근할 수 있게 되고 내부 endpoint에 원격 지원 세션을 설정한 사례를 보고했다.**

웹 서비스 계정, 호스트 root, 비밀정보, 내부 endpoint 사이의 권한 경계를 따로 확인할 근거다. 패치·호스트 재구축·자격 증명 교체와 재연결의 순서를 나눈 지침은 통제 기능의 존재와 실제 적용 상태를 구분한다는 기존 질문과 직접 연결된다.

- 한계: 사고 대응 관측과 취약 버전·인터넷 노출 조건에 따른 대응 지침이다. 모든 설치의 침해나 모든 credential의 유출을 확정하지 않으며, 추가 통제는 패치를 대체하지 못한다.
- 다음 확인: SaaS와 자체 호스팅의 패치 상태, 노출창의 세션·파일 전송 기록, 패치·재구축 뒤의 의존 순서 credential 교체와 재연결 전 검토 완료 여부를 확인한다.
- [Mandiant, BeyondTrust 원격 지원 취약점의 8월 말 제로데이 악용 정황 공개](https://skyan0213.github.io/tech-knowledge-garden/news/43436d5aea1b860e) · [Google 원문](https://cloud.google.com/blog/topics/threat-intelligence/armory-castle-exploits-beyondtrust/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-25_0800_tech_ai_briefing)
- 2026-10-25 원문 검토

<a id="20261001-data-agent-permissions"></a>

### 2026-09-30 · 관측

**Data Agent Kit 도구가 사용자 또는 가장된 서비스 계정 권한을 사용하고 IAM 및 데이터 보안 정책을 따르도록 제공됐다.**

에이전트 데이터 작업에 기존 사용자 권한을 전파하는 통제 지점이 명시됐다.

- 한계: 문서화된 기능은 실제 조직 설정, 최소 권한과 감사 적용이 안전하다는 증거가 아니다.
- 다음 확인: 가장 역할 설정, 행·열 수준 정책, 감사 로그와 비인가 호출 거부를 실제 구성에서 확인한다.
- [Google Cloud Data Agent Kit 정식 제공…Bigtable·Spark 지원 추가](https://skyan0213.github.io/tech-knowledge-garden/news/294333117691a99b) · [Google 원문](https://cloud.google.com/blog/topics/developers-practitioners/data-agent-kit-is-now-ga-bring-google-data-cloud-to-any-coding-agent/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-01_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="20261001-cisco-api-vulnerability"></a>

### 2026-09-30 · 반대·제약

**Cisco는 SD-WAN Manager API의 비인증 관리자 접근 취약점 CVE-2026-76504를 공개하고 9월의 실제 악용을 인지했다고 밝혔다.**

관리 API의 인증 경계 결함으로 정상 승인 절차 밖에서 관리자 권한에 접근할 수 있다는 사례다.

- 한계: Cisco의 실제 악용 보고는 특정 고객의 침해 판정과 다르다. 10월 2일 추가된 Live Protect shield는 임시 부분 보호이며 수정 버전 업그레이드를 대체하지 않는다.
- 다음 확인: 설치 버전과 수정 릴리스, 접근·인증 로그 및 고객 환경의 침해 여부를 확인한다.
- [Cisco Catalyst SD-WAN Manager API 인증 우회 취약점 공개](https://skyan0213.github.io/tech-knowledge-garden/news/0b883a59e5850ce3) · [cisco.com 원문](https://www.cisco.com/c/en/us/support/docs/csa/cisco-sa-sdwan-webauth-xr8beuuU.html) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-01_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="20261001-amd-rccl-vulnerability"></a>

### 2026-09-30 · 반대·제약

**AMD는 RCCL 입력 검증 취약점 CVE-2026-43598의 메모리 노출·ASLR 우회와 조건부 원격 코드 실행 가능성을 공지하고 ROCm 7.14를 완화 버전으로 제시했다.**

분산 GPU 통신 라이브러리 입력 검증이 에이전트·계산 작업의 실행 권한 경계에 영향을 줄 수 있다.

- 한계: 손상된 peer rank 또는 네트워크 인접 공격자 조건을 명시한 권고문이다. 10월 6일 제품 표의 CVE 정정 뒤 현재 표는 CVE-2026-43598로 일치한다. 가능성 설명만으로 개별 고객의 침해가 확인된 것은 아니다.
- 다음 확인: 대상 Instinct 제품과 RCCL 설치 버전, ROCm 7.14 적용 및 악용·침해 근거를 확인한다.
- [AMD ROCm RCCL 입력 검증 취약점, 원격 코드 실행 가능성 보고](https://skyan0213.github.io/tech-knowledge-garden/news/2000861d5f1c75c8) · [amd.com 원문](https://www.amd.com/en/resources/product-security/bulletin/amd-sb-6033.html) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/10/2026-10-01_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="20260923-proofpoint-execution-permissions"></a>

### 2026-09-22 · 참고

**Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표**

데이터 유출과 AI 사용 위험의 통합 관리

- 한계: 공통 그래프와 자동 대응은 제품 설계 설명이다. 실제 오탐률, 대응 지연과 사람이 승인해야 하는 범위는 도입 환경에서 별도로 확인할 사항이다.
- 다음 확인: 실제 제공 범위, 오탐률, 사람 승인 정책.
- [Proofpoint, 데이터·AI 보안을 묶는 세 가지 에이전트 발표](https://skyan0213.github.io/tech-knowledge-garden/news/f73f3c73e2cee66d) · [proofpoint.com 원문](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-breaks-down-divide-between-data-security-and-ai-security) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-23_0800_tech_ai_briefing)
- 2026-10-11 원문 검토

<a id="20260923-naver-execution-permissions"></a>

### 2026-09-22 · 참고

**네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시**

DB·서버 접근과 감사 기록의 통합

- 한계: 접근 통제 도구의 제공과 조직의 정책 준수는 별개다. 사용자 권한·예외 정책·경보 후 대응을 실제 업무에 맞게 설정해야 하며, 제품 도입만으로 규정 준수가 보장되지는 않는다.
- 다음 확인: 실제 권한·예외 설정과 경보 대응 결과.
- [네이버클라우드, DB·서버 접근 통제 서비스 DSAC 출시](https://skyan0213.github.io/tech-knowledge-garden/news/c2a48879e9e88507) · [navercorp.com 원문](https://navercorp.com/media/pressReleasesDetail?seq=10034680) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-23_0800_tech_ai_briefing)
- 2026-10-11 원문 검토

<a id="20260922-github-execution-permissions"></a>

### 2026-09-21 · 참고

**GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공**

기업 접근 권한의 목록화와 감사

- 한계: Enterprise Server 지원은 향후 제공 예정이다. 목록을 얻는 것만으로 오래된 토큰이 폐기되지는 않으므로, 실제 권한 축소와 자격증명 정리는 별도 운영 조치다.
- 다음 확인: 기업 설정 적용, 토큰 폐기·권한 축소 여부.
- [GitHub Enterprise, 토큰·SSH 키 목록을 CSV와 API로 제공](https://skyan0213.github.io/tech-knowledge-garden/news/f631d543deb02b09) · [GitHub 원문](https://github.blog/changelog/2026-09-21-github-enterprise-adds-credential-inventory-exports/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-22_0800_tech_ai_briefing)
- 2026-10-10 원문 검토

<a id="permissions-cache"></a>

### 2026-09-10 · 관측

**Actions 캐시의 읽기·쓰기 권한을 명시한다.**

캐시 서비스에서 접근을 제한하고 재사용 workflow의 상위 권한 경계를 유지할 수 있다.

- 한계: 낮은 신뢰 이벤트에 쓰기를 명시하면 기존 읽기 전용 기본값을 덮어쓸 수 있다.
- 다음 확인: 신뢰 수준별 캐시 쓰기 허용과 경고 이후 실제 권한.
- [GitHub Actions, 작업별 캐시 읽기·쓰기 권한 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/688d14b85e07a8db) · [GitHub 원문](https://github.blog/changelog/2026-09-10-control-github-actions-cache-access-with-cache-mode/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-11_0800_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-10 검토

<a id="permissions-secrets"></a>

### 2026-09-09 · 관측

**비밀정보 경보가 남은 PR의 병합을 막는 규칙이 추가됐다.**

푸시 이후 병합 시점에도 검사 결과를 통제 조건으로 쓸 수 있다.

- 한계: 일부 고객 대상 공개 미리보기이며 탐지 패턴과 우회 권한에 따라 범위가 달라진다.
- 다음 확인: 최신 커밋의 검사 완료, 경보 처리, 우회·패턴 설정.
- [GitHub, 비밀정보 경보가 남은 PR의 병합을 막는 규칙 공개](https://skyan0213.github.io/tech-knowledge-garden/news/0ef68bd8a0105dab) · [GitHub 원문](https://github.blog/changelog/2026-09-09-block-pull-requests-with-exposed-secrets-from-merging/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-10_0801_tech_ai_briefing)
- 2026-10-11 원문 검토

<a id="permissions-agent"></a>

### 2026-09-09 · 관측

**조직 정책으로 에이전트의 셸·파일·도메인 권한을 집행한다.**

개인의 승인 이력 외에 조직이 허용 범위를 정하는 통제 지점이 생겼다.

- 한계: 발표에 명시된 Copilot 앱·CLI·Agent Host 사용 세션 범위다.
- 다음 확인: 실제 조직 정책과 사용자 설정 충돌 시 차단 결과.
- [Copilot, 조직 정책으로 셸·파일·네트워크 작업 권한을 관리](https://skyan0213.github.io/tech-knowledge-garden/news/faa37362568657fb) · [GitHub 원문](https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-10_0801_tech_ai_briefing)
- 2026-10-11 원문 검토

<a id="permissions-workflow"></a>

### 2026-09-03 · 관측

**GitHub Actions가 실행기 버전별 지원 종료 API, vulnerability-alerts 읽기 권한과 재사용 워크플로 job 신원 속성을 추가했다.**

job.workflow_*는 현재 작업을 정의한 파일의 ref·커밋·저장소·경로를 가리킨다.

- 한계: 해당 job 신원 속성은 GitHub Enterprise Server에서 제공하지 않는다.
- 다음 확인: SHA 고정과 권한 검토, runner 지원 종료 점검.
- [GitHub Actions, 실행기 지원 종료 API와 취약점 읽기 권한 추가](https://skyan0213.github.io/tech-knowledge-garden/news/473fea8bb1cbf9cb) · [GitHub 원문](https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-09 검토

<a id="permissions-oidc"></a>

### 2026-09-03 · 관측

**npm이 패키지별 여러 OIDC 신뢰 배포 구성을 정식 제공했다.**

각 구성은 저장소·워크플로·환경 조건을 갖고 어느 한 구성과 일치하는 토큰으로 게시 또는 게시 대기를 허용한다.

- 한계: 여러 구성은 독립적으로 추가되고 즉시 게시는 구성별로 별도 허용한다.
- 다음 확인: 각 경로의 opt-in과 예외, 변경 감사·회수 절차.
- [npm, 패키지 하나에 여러 OIDC 배포 설정 지원](https://skyan0213.github.io/tech-knowledge-garden/news/322b7c88af36f3ac) · [GitHub 원문](https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/) · [당일 브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/2026/09/2026-09-04_0802_tech_ai_briefing)
- 기존 수록 기사 재정리 · 2026-10-09 검토

## 관련 개념

- [OpenID Connect](https://skyan0213.github.io/tech-knowledge-garden/knowledge/security/openid-connect)
- [Software Supply Chain Security](https://skyan0213.github.io/tech-knowledge-garden/knowledge/software-engineering/software-supply-chain-security)
- [AI Agent Security](https://skyan0213.github.io/tech-knowledge-garden/knowledge/ai-systems/ai-agent-security)
