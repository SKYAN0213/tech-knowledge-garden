# Tech Knowledge

GPT가 조사한 IT·AI·로보틱스 소식을 Google Drive에 축적하고, 검증된 자료를 GitHub와 웹사이트로 보여줍니다. 이 저장소의 `vault/`는 Drive 작성 원본의 작업·배포 사본입니다.

로컬 AI 시스템의 상세 개발 문서는 아래 순서로 읽습니다.

| 문서                                                                                                                     | 정리한 내용                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [일일 뉴스 수집·편집·발행 구현 명세](docs/DAILY_NEWS_INGESTION_IMPLEMENTATION.md)                                        | 반복 수집 실행기·출처 확대·실패 이월·모델/편집/Drive/공개 관문과 작업별 수용 기준              |
| [구현 명세와 완료 계획](docs/LOCAL_AI_NEWS_EXECUTION_SPEC.md)                                                            | 현재 구현·데이터 계약·출처별 수집/파싱·모델·편집·B~F 개발 단위·검증·운영 전환을 한 문서로 연결 |
| [현재 구현·남은 개발 계약](docs/LOCAL_AI_NEWS_CURRENT_BUILD.md#25-kuka-독일어-재게시와-기존-사건의-명시적-연결)          | 구현/실행/검토/운영 상태, 전체 데이터 흐름, 출처별 수집·파싱, 모델 정책, 소급 전환과 완료 관문 |
| [전체 구조·현재 구현·모델 권고](docs/LOCAL_AI_NEWS_SYSTEM.md#29-abb-robotics-공식-뉴스의-동적-목록을-수집하는-현재-경로) | 요구사항, 모듈 책임·입출력, 데이터·공개 경계, 로컬 모델과 실제 반복 수집 경로                  |
| [출처·크롤링·파싱 명세](docs/SOURCE_ACQUISITION_SPEC.md#40-frontiers-in-robotics-and-ai-출판-목록과-전문-html)           | 기업/IR/공시/논문/대학/고객 경로, RSS·HTML·JSON·PDF·표·OCR, 날짜·버전·실패·기간 종료           |
| [단계별 구현 계획](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1945-학술-출판물-경로-수용-뒤의-구현편집-관문)              | 작업별 입력·수정 위치·산출물·시험·복구와 전체 서비스 전환 순서                                 |
| [실행 가이드와 최신 증거](docs/LOCAL_AI_NEWS_RUNBOOK.md#78-frontiers-저널-출판-목록의-두-창-수집과-복구)                 | 실제 CLI·원문/사실 검토·과거 회차 보완·비공개 사본과 다음 재개 위치                            |

2026-09-29 현재 등록 조사 경로는 **101개**, 기사 상세 profile은 **44개**이고, 실제 날짜 창을 검증한 **14개 경로**를 로컬 일일 수집기에 활성화했습니다. 여섯 로봇 제조사 경로에 GitHub Changelog, Google Cloud Threat Intelligence·NASA Technology·NVIDIA 보도자료 RSS, FDA 공식 발표 목록, MIT Robotics·AI RSS와 Frontiers Robotics and AI 저널을 더했습니다. 저널은 Published와 Accepted를 분리해 과거 7일 출판 항목 8개·당일 관측 2개의 상세 HTML을 확보했으나 논문 주장·표·수식은 편집 검토 전입니다. 마지막 전체 수집 `daily-20260929-v10`은 Drive 원본 181개를 인증 조회해 만든 스냅샷으로 10경로/20창을 실행했고, 18창 성공·KUKA 두 창의 robots 정책 확인 실패를 보존했습니다. 32개 조사 칸은 그 실행에서 7칸 `partial`·25칸 미시도, 후보 장부는 **92건**이었습니다. 추가 경로를 포함한 `daily-20260929-v14`는 **Drive 미대조 로컬 계획 28창**까지만 확인했습니다. 기존 오전 8시 예약에는 최신 Drive 조회와 비공개 수집 단계 지침을 추가했으나 수정 후 첫 예약 실행은 미검증입니다. 새 기사 승인, Drive 재저장, 실제 공개 사이트 갱신은 하지 않았습니다. JATS 표·수식 판독, 기존 자료 전수 검토, 독립 모델 평가, 원고의 Drive 원격 재읽기·공개 검증과 신규 성공 7회는 남아 있습니다. 구현·실행·복구·완료 기준은 [일일 구현 명세](docs/DAILY_NEWS_INGESTION_IMPLEMENTATION.md#414-학술-출판물의-날짜-수집과-해설-승인-사이)와 [런북 78절](docs/LOCAL_AI_NEWS_RUNBOOK.md#78-frontiers-저널-출판-목록의-두-창-수집과-복구)을 따릅니다.

2026-09-28 당시의 비공개 **사이트 사본** `20260928-abb-dunia-historical-private-site-v1`은 승인 기사 run 27개·과거 회차 13개·지식/관측 노트 18개, 생성 파일 284개(HTML 258개)·GitHub digest 132개였습니다. 기존 RSS 40개 항목의 GUID와 발행 시각을 보존했습니다. 당시 후보 장부는 58건(verified 43·deferred 13·rejected 1·unreviewed 1)이었습니다. KUKA 독문 지게차 발표는 저장된 영문 공식판과 직접 대조해 기존 사건 ID `2fa2d03292bbcc0d`에 연결했으며 새 기사·RSS 항목은 만들지 않았습니다. FSW 연구 셀 발표 한 건은 별도 미검토였습니다. 당시 registry는 94개 경로/38개 profile, 완주 경로는 제조사 6개였습니다. 작성 원본 `vault/`와 Drive·공개 사이트는 이 후보 판정으로 갱신되지 않았습니다. [현재 빌드 25절](docs/LOCAL_AI_NEWS_CURRENT_BUILD.md#25-kuka-독일어-재게시와-기존-사건의-명시적-연결), [계획 19.42절](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1942-kuka-동일-사건-연결-이후의-편집과-전체-완료-순서), [런북 66절](docs/LOCAL_AI_NEWS_RUNBOOK.md#66-kuka-다국어-동일-사건의-근거-연결)은 그때의 근거와 다음 작업입니다.

두 공식 HTML은 기존 Node HTTP403 시도와 별도 수동 확보본을 보존한 채 21개·77개 블록으로 파싱했습니다. 초기 로컬 모델의 후보12개/구조 통과10개는 여전히 미검토 원출력입니다. 원문을 별도로 읽어 Admin 기능8개를 검증하고 Slack IT 티켓 약45%를 해당 plugin 성과에서 제외했으며, Jalapeño 시험15개 사실을 검증했습니다. 숫자 조건·정격/지속 전력·선택 블록 결과·연말 배치 계획을 분리한 최종 기사와 더 자세한 과정은 [현재 구현·남은 개발 계약](docs/LOCAL_AI_NEWS_CURRENT_BUILD.md)과 [실행 가이드 50절](docs/LOCAL_AI_NEWS_RUNBOOK.md#50-admin-pluginjalapeño-기사와-의존-지식의-비공개-재검토)에 기록했습니다.

구현에 착수할 때는 [사용 시나리오별 산출물](docs/LOCAL_AI_NEWS_SYSTEM.md#20-사용-시나리오별-개발-산출물), [반복 조사용 출처 도입 패키지](docs/SOURCE_ACQUISITION_SPEC.md#24-반복-조사용-출처-도입-패키지), [현재 작업 단위와 수용 조건](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1933-kuka-목록-완주-이후의-조사발행-관문)을 함께 확인합니다. 현재 코드, 목표 계약, 실제 검증 기록을 구분하고 작업별 입력·출력·회귀시험·운영 승격 조건을 연결했습니다. 과거의 상세 설계와 검토 기록은 [가이드42](docs/LOCAL_AI_NEWS_RUNBOOK.md#42-상세-개발-문서의-재확인), [가이드46](docs/LOCAL_AI_NEWS_RUNBOOK.md#46-openaihugging-face-사고의-원문-묶음기사지식-통합), [가이드48](docs/LOCAL_AI_NEWS_RUNBOOK.md#48-두-공식-html의-오프라인-편입과-실제-파싱)에 보존했습니다.

- [뉴스](https://skyan0213.github.io/tech-knowledge-garden/)
- [브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index)
- [GitHub 브리핑 모음](digest/README.md)
- [RSS 구독](https://skyan0213.github.io/tech-knowledge-garden/rss)
- [연결 지도](https://skyan0213.github.io/tech-knowledge-garden/knowledge-maps/ai-technology-knowledge-map)
- [Drive → GitHub 연결 및 운영](docs/DRIVE_GITHUB_SYNC.md)

Drive의 `Editions`, `Knowledge`, `Signals`, `TrendTopics`를 작성 원본으로 사용합니다. 기존 오전 8시 실행에서 Drive 변경 확인·검증·생성·배포를 함께 수행하며, 별도 5분 예약은 두지 않습니다. Google 읽기 내보내기는 선택적 수동 실행 경로이며, 단발성 Drive 읽기와 독립 자동 연동의 완료 상태는 구분합니다. 원문 수집물·취재 기록은 개인 Drive에 보관하며 이 동기화의 공개 입력에서 제외합니다.

기존 `옵시디언_iCloudSync` 프로젝트의 오전 8시 예약 작업을 이어 사용합니다. 새 프로젝트 등록은 필요 없습니다. 소스 저장소의 경로는 `/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden`, 현재 Obsidian 보관함은 이 저장소의 `vault/`입니다.

웹의 기본 메뉴는 뉴스·브리핑·연결 지도입니다. 뉴스와 브리핑은 읽기에 집중하고, 지도는 전용 경로와 관련 전문 개념에서 볼 수 있습니다. 용어를 누르면 관련 뉴스가 나타납니다. 브리핑에는 오늘의 변화, 누적 주제, 근거·반대 조건·판단 원칙을 모읍니다. RSS에서 웹 브리핑·원문·GitHub 요약으로 연결됩니다. Vault 폴더, 보관 원고와 작업 안내를 웹 화면이나 검색에 노출하지 않습니다. 별도 공개 체크 없이 콘텐츠 유형에 따라 화면을 생성합니다.

| 원본 위치                              | 역할                           | 웹                          |
| -------------------------------------- | ------------------------------ | --------------------------- |
| `vault/Editions/`                      | 출처·취재 구간을 가진 원고     | 브리핑과 기사로 변환        |
| `vault/Briefings/`                     | 날짜별 헤드라인·흐름           | 브리핑                      |
| `vault/News/`                          | 발표별 상세 기사               | 뉴스                        |
| `vault/Knowledge/`                     | 정의·키워드·근거·관계          | 맥락으로 연결되는 개념      |
| `vault/Knowledge Maps/`                | 같은 관계를 담은 Obsidian 지도 | 관계 기반 자동 배치         |
| `vault/TrendTopics/`, `vault/Signals/` | 주제 판단·날짜별 근거 관측     | 브리핑의 누적 기록으로 변환 |
| `digest/`                              | 표준 Markdown 브리핑·누적 기록 | GitHub에서 직접 읽기        |
| `vault/Archive/`, `vault/Trends/`      | 보관과 개인 참고               | 출력 제외                   |
| `.local/`                              | 조사 기록·복구 사본            | Git·웹 제외                 |

package.json의 Node.js 최소 요구는22 이상이며 현재 확인 환경은26.4.0입니다. 기존 보관 코드는 Python 3, 신규 문서 worker는 격리된 Python3.12.14 환경을 사용합니다.

```sh
npm ci
npm run context
npm run refresh
npm run validate
npm run build
node scripts/verify-site.mjs
npm run dev        # http://127.0.0.1:8088/tech-knowledge-garden/
npm run publish
```

`npm run dev`는 마지막으로 빌드한 결과를 미리 봅니다. 수정 후 다시 빌드합니다. `npm run publish`는 검증된 Drive 입력과 로컬 원본이 같은지 확인한 뒤 콘텐츠를 커밋합니다. 원고를 Drive에 먼저 저장하고 읽기 검증을 마쳐야 하며, 코드 변경은 별도로 검토·커밋합니다.

정의와 키워드는 원문으로 확인합니다. 연결은 `connections`의 `target`과 `reason`으로 기록합니다. 확인한 연관성이면 충분하며 방향·참조 유형·인용은 필수가 아닙니다. 기존 관계의 원문 근거는 보존합니다. 지도에는 별도 설명을 배워야 하는 전문 용어만 `map_review` 검토를 거쳐 표시합니다. 정의·설명 노트·일차 자료·구체적인 학습 이유가 필요합니다. 일반어·기사 제목·단순 키워드는 노드로 만들지 않습니다. 뉴스는 용어의 정확한 이름·별칭 또는 명시적 기사 지정으로 연결하고, 선택하면 관련 기사 목록을 보여 줍니다. Sigma.js의 WebGL과 ForceAtlas2가 연결을 고려해 자동 배치하며, 검색·연결 필터·이동·확대·드래그·재배치를 지원합니다. WebGL이 없으면 검색과 노드 목록으로 관련 뉴스를 읽을 수 있습니다.

[트렌드 누적·배포 규칙](docs/TREND_WORKFLOW.md) · [운영 규칙](docs/BRIEFING_WORKFLOW.md) · [연결 규칙과 엔진 비교](docs/CONNECTION_MAP.md) · [용어 선정 기록](data/graph-node-review-2026-09-13.json) · [원문 재검토 기록](data/knowledge-review-2026-09-13.json) · [구현 상태](docs/IMPLEMENTATION_STATUS.md)

로컬 AI 전환의 상세 개발 문서(2026-09-28)는 다음 순서로 읽습니다.

ABB의 제품 발표와 고객 사례는 각각 [E-Device 원문 판정](docs/LOCAL_AI_NEWS_RUNBOOK.md#60-abb-e-device-원문-직접-검토와-과거-회차-비공개-보완)과 [Dunia 고객 사례 원문 판정](docs/LOCAL_AI_NEWS_RUNBOOK.md#63-abb-dunia-고객-사례의-직접-검토와-비공개-소급)에 기록했습니다. 같은 Robotics 피드의 현대화 특집은 [신규 사건이 없는 배경 자료로 판정](docs/LOCAL_AI_NEWS_RUNBOOK.md#631-abb-현대화-특집의-배경-자료-판정)했습니다. 두 승인 사본은 Drive·공개 사이트에 반영되지 않았습니다.

이번 상세 보강은 [원문→사실→기사→지식→발행의 책임과 산출물](docs/LOCAL_AI_NEWS_SYSTEM.md#18-실행-책임과-산출물-계약), [출처 한 곳을 도입하는 수집·파싱 절차](docs/SOURCE_ACQUISITION_SPEC.md#22-출처-도입을-구현-작업으로-전환하는-절차), [수정 파일·입출력·수용 시험·모델 정책·일일 통합 계획](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1916-다음-개발의-입력변경검증-명세)에 있습니다. 현재 구현과 미래 설계, 코드 시험과 기사 승인/배포를 구분했습니다. 최신 논문 식별자·학생 기사 승인·15노트 통합·채널/브라우저 검증은 [가이드39](docs/LOCAL_AI_NEWS_RUNBOOK.md#39-url-논문-식별자학생-기사rct-용어의-실제-통합)을 먼저 읽습니다. 내부 작성 지시 차단은 [계획19.17](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1917-공개-문장에-내부-작성-지시가-남는-문제의-회귀-계획)에 실제 결과를, URL-only 논문 identity·출판 상태 null의 전체 발행 계약과 구현 결과은 [계획19.18](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1918-url-논문-식별자와-출판-상태의-전체-발행-계약)에 기록했습니다.

설계 문서에는 원문 한 건의 단계별 입력·산출물·검증과 육하원칙 기사·설명의 정보 기준을, 수집 명세에는 실제 목록 파서 예시·상세/첨부/페이지 종료·정정 전파를 기록했습니다. [다음 실행 단위와 완료 기준](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19-실행-단위와-완료-판정), [현재 명령과 미구현 연결](docs/LOCAL_AI_NEWS_RUNBOOK.md#24-상세-문서의-사용과-현재-상태-재확인)을 통해 바로 작업을 이어갈 수 있습니다. 목표 설계·부분 구현·실제 원문 시험·공개 적용 상태를 구분합니다.

개발에 바로 필요한 명세는 [기능별 코드·입출력·모델 설정](docs/LOCAL_AI_NEWS_SYSTEM.md#16-구현-범위와-개발-인계-명세), [자료 유형별 크롤링·파싱·회귀 기준](docs/SOURCE_ACQUISITION_SPEC.md#19-경로별-실행-계약과-개발-검증), [신규 전문용어 생성과 기사·이력 연결](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1910-신규-전문용어-등록기사-연결이력의-구현-명세), [오전8시 전체 실행·Drive·발행 인계](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1911-일일-실행기와-발행-인계의-구현-명세)에서 확인합니다. 신규 전문용어 v2 생성·승인은 비공개 검증까지 구현했고, 일일 실행기는 후속 개발 계약입니다. [실제 신규 용어·기사·이력 검증](docs/LOCAL_AI_NEWS_RUNBOOK.md#32-신규-전문용어-등록-검증)에서 코드·원문·로컬 모델·사이트 결과와 공개 미적용 상태를 확인합니다. 문서의 기준선·명령 확인·검증 방법은 [실행 가이드31](docs/LOCAL_AI_NEWS_RUNBOOK.md#31-상세-개발-문서의-기준선과-적용-방법)에 있습니다.

현재35개 기사 profile·MathML/정의 목록 보존·일반 기사 논문 참조 승인/공개5필드를 구현했습니다. URL-only 논문 ID를 공통 모듈로 검토·canonical 원고·전체 회차 중복 검사에 연결하고 출판 상태 null을 지원합니다. 새 대학 profile은 관련 카드 날짜를 제외하고 발표일·본문을 분리합니다. 학생 연구 기사와 RCT 신규 생성·Agent Evaluation 교체를 최종 비공개 승인하고 PPE/과학 발견 AI를 포함한 전체 사이트에 통합했습니다. 논문 ID를 넣기 위해 심층 분석을 강제로 만들지 않습니다. Drive 보관·공개 전환은 별도 완료 조건입니다.

| 문서                                                                    | 기록한 내용                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [전체 시스템 설계](docs/LOCAL_AI_NEWS_SYSTEM.md)                        | 요구사항18개·데이터/근거/기사 계약·하루12단계·모델/추론 선택·지식 축적·보관/배포 경계                  |
| [출처 수집·크롤링·파싱 명세](docs/SOURCE_ACQUISITION_SPEC.md)           | 8개 분야의 출처 확장·15개 제조사27공식경로·RSS/API/HTML/동적페이지/PDF/표/OCR·날짜/첨부/버전/실패 처리 |
| [단계별 구현·검증·전환 계획](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md) | 23개 WBS의 의존성·수정 파일·입출력·회귀·완료/복구 증거·요구사항 추적·초기10→60건 평가·실제7회 비교     |
| [현재 구현과 실행 가이드](docs/LOCAL_AI_NEWS_RUNBOOK.md)                | 실제 모듈/런타임/CLI·검토 JSON·심층3형식 계약·사이트별 선택자/재파싱·실험·다음 재개 위치               |

수집·HTML/PDF/Markdown/OCR·private 검색·현지어 보완/재개·로컬 사실 추출·직접 검토·한국어 작성·기존 기사 형식 변환은 비공개 경로에서 부분 구현했습니다. 기존32개 분야 탐색에 제조사별 기술/기업2축의30질의를 더한62개 계획도 실제 실행했습니다. 검색 후보·원문 검토·기사 승인·Drive 보관·공개 발행·운영 전환을 별도 상태로 기록합니다. 전체 자료 재검토, 새 경로의 Drive 보관·공개 발행과 운영 전환은 아직 완료되지 않았습니다.

Markdown의 줄별 근거, 논문·고정 릴리스 날짜, 혼합 실패 원문 재파싱, 분류·판본 프롬프트와 기술 문자 보존을 구현했습니다. Microsoft·Model Connect·NemoClaw·NVIDIA 추론 구성의 직접 정정·비공개 승인과 같은 URL의35→45배 갱신 검토는 [가이드29](docs/LOCAL_AI_NEWS_RUNBOOK.md#29-원문-판본과-작성-입력-범위기사용어누적-주제-통합), 판본 전파 계획은 [계획19.8](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#198-원문-판본-변경을-기사용어에-전파하는-구현-명세)에 보존했습니다.

추가로 DeepMind 발표의 본문 누락, 연구 PDF의 표지 제목/생성일 분리, 과거 회차의 승인 기사만 육하원칙으로 전환하는 경로를 구현했습니다. 미검토 기사의 본문·분류·검토 상태는 보존합니다. 이전 사본과 시험은 [가이드30](docs/LOCAL_AI_NEWS_RUNBOOK.md#30-이중-블라인드-평가-소급-기사와-연구-pdf-파서), [신규 용어 검증](docs/LOCAL_AI_NEWS_RUNBOOK.md#32-신규-전문용어-등록-검증), [PPE 원문 작성](docs/LOCAL_AI_NEWS_RUNBOOK.md#33-논문-수식-보존과-ppe-원문-작성-검증)에 보존합니다. 최신 완료 사본은12기사/8과거회차/15노트·공개 생성 파일279개이며 전체 생성·링크·RSS40 보존과1280/390px 화면·탭 URL/뒤로가기·키보드·접근성 클릭을 검증했습니다. 전체 Node407·TypeScript와 위 화면 검증은39절의 실행 기록입니다. 이후 날짜 worker/profile 보완에서는 관련 Node45·worker40·Python 전체55가 통과했고, 같은 원문 bytes의 재파싱과 공식 보고서 PDF 확보를 확인했습니다. 초기14미검토 사건 중 private 추가 판정은9개, 잔여는5개입니다. 권위 원본14미검토 상태와 Drive·공개 서비스는 이번 승인본으로 변경하지 않았습니다.

실제 원문 평가 기준11사례·71사실·15원URL, Qwen/Gemma 작성 비교, 세 심층 초안의 직접 편집 판정도 실행 가이드에 기록했습니다. 다섯 언어·일곱 분야의 일부를 확인했으며 독립 사람 평가·60건 평가는 남아 있습니다. 원출력과 편집자가 수정한 비공개 승인본을 구분하고, 현재 두 작성 후보를 무검토 발행 가능한 모델로 판정하지 않았습니다. 장문349블록/15요청의 실제 완주와 핵심 사실 누락, 문단별 추출·명시 예산·중단 재개, 인물 카드의 이름/직함 보존, 출처별 단위/표/날짜 수정도 연결했습니다.

`correct` 명령으로 세 심층 원고를 원문부터 정정·비공개 승인했고, `preview` 명령으로 전체 사이트를 별도 작업 사본에 생성했습니다. 웹·RSS·GitHub Markdown의 본문/날짜/원문을 대조하고 기존40개 RSS GUID·발행일을 보존했습니다. 실제 Chrome에서 탭·태그·키보드·공유 URL·뒤로 가기와390px 폭의 가로 넘침을 확인했습니다. 뉴스 상세 상단도 원 발표일을 표시하도록 고쳤습니다. 명령·파일 이력·실물 검증·남은 공개 전환 조건은 [실행 가이드20절](docs/LOCAL_AI_NEWS_RUNBOOK.md#20-비공개-정정승인전체-사이트-검증)을 따릅니다. 전체 지식/소급 재검토와 Drive 업로드·공개 배포가 완료된 상태는 아닙니다.

`note-review`는 기존 용어·Signals·누적 주제의 원본과 원문 근거를 검사해 비공개 교체본을 승인합니다. VLA 설명1개와 기업 전략·논문·연구 사업화 주제3개를 정정하고 `preview --knowledge-run`으로 전체 사본에 반영했습니다. 현재 주제 설명과 과거 브리핑 판단을 분리하며 실제 사건·원문으로 연결합니다. 전체 계약·명령·파일·정정 이력·남은 범위는 [실행 가이드21절](docs/LOCAL_AI_NEWS_RUNBOOK.md#21-전문용어누적-주제의-근거-검토와-비공개-정정)을 따릅니다.

발표일이 없던9월1일 두 기사도 원문부터 재검토해 로컬 작성·정정·비공개 승인했습니다. 최초 게시일과 날짜가 적힌 업데이트 사건을 구분하고, 이전 null·원본 바이트·모든 등장 회차·검토 사유를 비공개로 보존합니다. 웹·RSS·GitHub에서 `발표`/`업데이트` 표기를 함께 검증했습니다. 날짜 정정 계약·실제 모델 오류·복구·남은 용어 검토는 [실행 가이드23절](docs/LOCAL_AI_NEWS_RUNBOOK.md#23-원문-날짜-정정과-업데이트-사건의-소급-처리)에 있습니다. 권위 원본과 공개 서비스에는 아직 이 승인본을 반영하지 않았습니다.

`knowledge-draft`의 명시 근거 선택·8개 작성 영역·모델 설정·변조/재개·최종12개 노트 계약은 [실행 가이드25절](docs/LOCAL_AI_NEWS_RUNBOOK.md#25-로컬-모델의-전문용어-설명-초안-계약)에 기록했습니다. 배경 원문8개 URL/검토 사실13개를 사용해 실제 모델 작성3회를 수행하고 원문부터 정정한 두 기존 용어와 두 기사 연결을 비공개 승인했습니다. 고정 뉴스 링크·강조 뒤 한국어 조사 대조·지도 concept ID 누락을 회귀 시험으로 고치고 전체 사본/기사·지도/모바일 흐름을 확인했습니다. 실제 입력·원출력 오류·정정·승인·검증과 남은 공개 전환은 [실행 가이드26절](docs/LOCAL_AI_NEWS_RUNBOOK.md#26-두-용어의-실제-작성정정기사지도-연결), 재현 순서는 [구현 계획19.5절](docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#195-두-용어와-기존-기사-연결을-완료하는-실행-명세)에 있습니다. 전체 지식 재검토·Drive·공개 반영은 아직 완료하지 않았습니다.

별도 AI API와 유료 자동화 서비스는 사용하지 않습니다. GPT 조사는 기존 ChatGPT/Codex 구독의 사용량 한도에 따릅니다. 로컬 예약에는 Mac과 Codex 앱이 켜져 있어야 합니다. 기기 간 편집 동기화는 별도입니다.

초기165개 파일의 복구 사본을 보존했고,2026-09-27에는 현재 작성 원본181개와 Drive 전문을 다시 대조했습니다. 기존 날짜별 뉴스 이력은 당시 기록이며 이번 정의 재검토가 모든 과거 보도를 재검증한 것은 아닙니다. 공개 저장소에서 웹 출력 제외는 비공개 보관을 의미하지 않습니다.

Markdown 변환 기반은 [Quartz v5](https://github.com/jackyzha0/quartz), MIT License입니다. 원본 [LICENSE.txt](LICENSE.txt)를 보존합니다.

오전 8시에는 [8개 분야별 브리핑](docs/SECTOR_BRIEFING.md)을 분야당 최대 5건으로 정리하고 Drive 저장부터 웹 배포 검증까지 함께 수행합니다. 과거 회차는 기존 내용과 주소를 유지합니다.

반복 수집기의 현재 범위와 미완료 발행 관문은 [일일 뉴스 수집 구현 명세](docs/DAILY_NEWS_INGESTION_IMPLEMENTATION.md)를 따릅니다. 2026-09-29에는 연결된 Drive의 네 작성 폴더 Markdown 181개를 원격 raw bytes부터 로컬 사본과 전수 대조하고, 비공개 스냅샷을 만들어 10개 출처·20개 날짜 창의 일일 계획에 고정했습니다. [Drive 원본 조회 런북](docs/LOCAL_AI_NEWS_RUNBOOK.md#74-연결된-drive-원문-전체-읽기와-비공개-수집-입력-만들기)에 재현 절차가 있습니다. 이 수집·대조는 기사 승인이나 Drive 재저장·공개 배포의 완료를 뜻하지 않습니다.

전체 소급 검토를 위한 `inventory` 명령은 사건의 모든 등장 회차·용어·Signals·주제·원문·RSS 식별자를 비공개 목록으로 묶습니다. 구형 문단을 임의로 새 사건으로 합치지 않으며, Google 원문의 목록·외부 각주·발표일/수정일도 별도 버전으로 보존했습니다. 실제 실행과 미완료 항목은 [실행 가이드22절](docs/LOCAL_AI_NEWS_RUNBOOK.md#22-전체-소급-목록과-목록각주날짜-파싱)을 따릅니다.
