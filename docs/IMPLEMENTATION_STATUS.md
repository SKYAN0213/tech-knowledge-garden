# 구현 및 운영 상태

2026-10-02 · 수집·온톨로지 개발 진행 현황

## 최신 로컬 현황

2026-10-02 최신 운영 입력은 등록 121경로·일일 활성 35경로·수집 profile 37개·기사 profile 91개다. 최근 통합 실행 `daily-20261002-current35-live-v1`은 당시 35/35 route와 70/70 기간 창 receipt를 완료했고 retry는 0이었다. 계측 수정 뒤 실행 코드 fingerprint가 바뀌어 현재 상태판은 이 실행을 `historical_success_requires_current_revalidation`으로 표시한다. 32칸 coverage는 partial 19·not attempted 13이며 후보 원장은 276건(검증 70·미검토 196·보류 9·제외 1)이다. 연결된 모델 추론은 0건이다. 실제 scan 상위 시간은 AWS What's New 290,646ms·GitHub Changelog 186,914ms·FDA Press Announcements 180,815ms다. Boston Dynamics·IEEE의 이전 `total`은 병렬 batch 대기를 포함해 출처 지연을 과장했으며, 새 실행부터 phase 작업시간과 전체 wall span을 분리 계측한다. 이 daily run은 승인·발행·Drive write·공개 검증이 완료된 회차가 아니다. 상세는 [런북 255·257절](LOCAL_AI_NEWS_RUNBOOK.md#257-병렬-수집-시간의-출처별-귀속-수정)이다.

전체 기준은 [로컬 AI 뉴스 구현 계획](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md)의 필수 WBS 22개다. `부분`은 진척으로 보이되 완료율의 분자에는 넣지 않는다. 2026-10-02 현재 운영 입력 기준 **1/22 완료(5%), 19개 부분 진행, 2개 미착수**다. 완전 무인 발행 P6-03은 별도 승격 항목이라 지원 운영 완료율에서 제외한다.

2026-10-02 Google Drive 원본 4개 루트의 195개 Markdown을 raw-byte SHA-256으로 확인하고 로컬 원고를 대조했다. 새 파일 2개와 수정 파일 3개만 반영했으며 삭제는 0개다. Drive/local snapshot은 195개 전체에서 일치한다. 이 동기화는 출처 저장소 정합성 확인이며, 오늘 새 회차의 조사·편집·승인·RSS·GitHub·사이트 배포 완료를 뜻하지 않는다. 세부 증거는 [런북 256절](LOCAL_AI_NEWS_RUNBOOK.md#256-drive-기준-원본-195개와-로컬-원고-동기화)이다.

최신 수치는 저장소에서 다음 명령으로 다시 계산한다.

```sh
npm run research -- status --format html
```

생성 결과는 `.local/research/local-ai/delivery-status.html`에 저장되며 공개 사이트와 분리된 로컬 운영 화면이다. 등록 출처와 활성 수집 경로, 최신·통합 실행 영수증, 32칸 조사 범위, 후보 승인과 기존 발행 관계, 단계별 완료 조건을 탭으로 확인한다. 2026-10-01 현재 등록 출처 114개·일일 활성 27개·수집 프로필 28개·기사 프로필 70개다. 두산로보틱스 국문 뉴스가 기존 영문 경로와 함께 일일 범위에 추가됐고, 공식 목록 41/41 및 과거 6월과 당일 날짜창을 검증했다. 최신 통합 실행 `daily-20261001-main26-integrated-v1`은 변경 전 26경로·52창 중 23경로가 완료, 3경로가 미완료이며, 범위 coverage는 partial 15·not attempted 15·failed 2다. 후보 원장은 161건(검증 64·보류 10·제외 1·미검토 86), 승인 receipt 연결 8건이다. 현황판은 개별 `scan-list` baseline도 대상 route·기간·원문 bytes를 확인하고 기준 증거로 표시한다. 로컬 비교 운영은 7회 목표 중 0회다. 이 수치는 `npm run research -- status --format json`에서 현재 입력을 읽어 다시 계산하며, 날짜 창 수집 완료는 전체 WBS 또는 발행 완료로 계산하지 않는다.

후보 원장, 일일 실행, 평가 사례 등 세부 수치는 시점별 변경 이력과 혼동하지 않도록 위 현황 명령을 기준으로 한다. 과거 사례별 숫자는 해당 실행 시점의 기록으로 읽고, 최신 값처럼 이어 붙이지 않는다.

후보 장부를 읽기 전용으로 온톨로지 투영해 진행 현황에 연결했다. 최신 snapshot은 후보 146개·정규화 출처 148개·연결 사건 59개·관측 원문 판본 91개·연결 관계 61개이며, 동일 URL·본문 지문·제목/날짜로 제기된 미해결 검토 관계는 0건이다. 검색 결과는 저장 원문을 확보하고 정확한 출처 날짜를 파싱한 뒤에만 이 장부에 들어간다. 삼성SDS와 KUKA FSW 후보는 각각 원문 검토·사건 연결 단계가 달라 별도 receipt로 추적한다. 저장 원문 profile·intake receipt는 재실행해도 같은 source version과 parse를 가리킨다. 검색 후보→저장 원문→검증 날짜→사실 검토→초안까지 두 수직 경로를 확인했으나, FSW의 회차 편입과 Drive 원본은 미확인 상태다. 실행마다 별도 지식 저장소를 만들거나 후보를 자동 승인하지 않는다.

미시도 조사 15칸을 위해 `20260930-main23-targeted-v1`에서 등록 출처 기반 질의 29개를 실행했다. 결과 receipt는 17 partial·12 failed이며 15개 질의에서 후보 81행이 나왔다. canonical URL은 79개로, 검색 산출물 안에 중복 URL 2행이 있었다. 검색 결과를 원문·발행일 확인 없이 후보 장부에 병합하지 않도록 유지하면서, exact URL·원문 bytes·parse를 검증하는 새 intake 경로를 추가했다. 삼성SDS 공식 페이지는 동일 저장 HTML의 `datePublished` meta-property를 직접 선택하는 기사 profile로 재파싱해 2026-09-30 발행일을 확인했고, 후보 1건을 기존 키로 `unreviewed` 추가했다. intake 재실행은 backlog 변경 없이 완료됐다. 중복 결과를 미래 검색 실행에서 한 후보로 정규화하고 각 질의 출처·slot provenance를 합치는 변경도 추가했으며, 과거 receipt는 보존한다. 과거 산출물에는 엔진 실패 상세 25건이 기록됐고, 실패 질의 12건은 오류 변환 과정에서 개별 엔진 상세가 유실된 상태다. 새 검색 실행은 이 상세를 실패 receipt에 보존하도록 수정했다. 32칸 coverage는 여전히 15칸 `not_attempted`이며 보완 검색은 일일 원문 수집 완료로 계산하지 않는다.

이번 수행 중 같은 문제를 반복 시도하며 1시간 이상 진척이 멈춘 항목은 없어서 별도 장애 기록을 만들지 않았다. 이후 그런 정체가 실제 발생하면 막힌 시각, 반복한 시도, 확인한 원인, 다음 독립 작업을 비공개 실행 기록에 남기고 다른 완료 가능한 작업을 계속한다.

2026-10-01 승인 단계 재시도 안전성을 보강했다. 동일한 편집 결정과 승인 projection은 기존 바이트를 재사용하고, 변경된 입력이나 변조된 승인 파일은 덮어쓰지 않은 채 새 run을 요구한다. 전체 Node 회귀 460/460, TypeScript, 변경 JS 포맷, `git diff --check` 통과. WBS는 1/22이고 이 국소 checkpoint를 발행 완료로 계산하지 않는다. 문서 전체 Prettier check는 기존 장문 Markdown 서식 때문에 실패했으며 전체 자동 재포맷은 하지 않았다. [계획 19.73](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1973-편집-승인-체크포인트의-불변-재시도), [런북 147절](LOCAL_AI_NEWS_RUNBOOK.md#147-편집-승인-checkpoint-불변성과-정확한-재시도).

일일 창 재시도도 제한했다. 계획당 창별 최대 2회, blocked는 새 관측 전까지 보류, 두 번 실패한 창은 exhausted 상태로 표시하며 반복 resume에서 재요청하지 않는다. 검증된 supplemental coverage는 그 창을 큐에서 제거한다. 상태판은 현재 summary가 구형이어도 저장된 계획·receipt·coverage를 사용해 재시도 큐를 계산한다. 관련 테스트 29/29 통과, TypeScript와 변경 파일 포맷 검사를 확인했다. WBS P5-01은 Drive·배포와 전체 경로 검증이 남아 부분으로 유지한다. [계획 19.74](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1974-일일-수집-실패-큐와-제한-재시도), [런북 148절](LOCAL_AI_NEWS_RUNBOOK.md#148-일일-창-실패-큐와-재시도-상한).

2026-09-30 추가 개발: Frontiers 논문 `/xml`을 기존 정책 수집기로 확보하고 JATS 전용 parser를 연결했다. 실제 SkinAxis 논문의 같은 저장 bytes에서 DOI·제목·날짜가 기존 HTML parse와 일치하고, 표·그림·저자/기관·224개 수식까지 추출한 private parse `frontiers-jats-20260930-skinaxis-reparse-v6`가 `extracted`다. 외부 entity 접근을 막고 모호한 날짜·수식은 추측하지 않는다. P2-02는 복잡한 표 각주·다국어 OCR·메모리 구간 재개가 남아 계속 부분 상태이며, 전체 진척은 0/22 완료 그대로다. Python parser 회귀와 실제 원문 parse를 확인했고 공개 발행은 수행하지 않았다. 상세 증거는 [계획 19.46](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1946-frontiers-jats-원문-파싱-수직-슬라이스)과 [런북 107](LOCAL_AI_NEWS_RUNBOOK.md#107-frontiers-jats-xml-원문-파싱과-html-대조)에 남겼다.

2026-09-30 추가 검토: 기존 HTML·JATS exact source run을 묶고 SkinAxis 표 4의 숫자·비교군 사례 세 건을 기존 사실 검토 CLI로 검토했다. 저장 source bytes와 parse fingerprint를 다시 읽고 세 claim이 모두 `verified`임을 `assertVerifiedClaim`로 확인했다. JATS 표의 평균±표준편차와 1.0 m/s 조건을 근거로 삼고 HTML 본문은 점추정치 대조에 사용했다. 비공개 run `skinaxis-numeric-review-20260930-v1`이며 원문/parse ID와 위치는 런북 108절에 기록했다. 이는 P2-02의 국소 검증 완료로 기록하며 남은 표 각주·미지원 수식·OCR·메모리 구간 재개 때문에 WBS 행은 `부분`, 전체는 0/22 완료다. 공개 생성·배포는 수행하지 않았다.

2026-09-30 추가 연구 해설 슬라이스: 같은 HTML/JATS 원문을 바탕으로 방법·시험 조건·제약 사실까지 더해 7개 claim을 검토했고, DOI와 전문 판본이 고정된 논문 deep-review를 완료했다. 로컬 `qwen3.8:27b`가 초안을 생성했으나 `problem` 설명을 누락해 검증이 실패했다. 그 문제를 원문 근거와 연결해 직접 수정한 후 최종 `problems: []`, `editorial_review`, 공개 승인 false를 확인했다. 비공개 run `skinaxis-paper-deep-dive-20260930-v1`; 약 197초 추론. 전체 WBS는 0/22 완료이고 P2-02/P3-03은 다른 잔여 수용 조건 때문에 부분이다. 상세는 런북 109절이다.

후보 원문과 parse가 확보된 뒤 반복하던 단건 intake를 `intake-search-batch`로 묶었다. 항목별 receipt를 저장하며 부분 실패 뒤 같은 고정 manifest를 재개하고, 성공 항목은 원장 변경 없이 재검증한다. 실제 삼성SDS 후보 한 건은 batch CLI로 완료·실패 0·발행 false를 확인했다. 이 기능은 수집이나 파싱 앞단을 대체하지 않으므로 전체 WBS는 여전히 부분 상태다.

앞단에는 `collect-search-candidates`를 추가했다. 검색 run의 exact key를 source URL에 대조한 뒤 기존 robots-aware fetcher·조건부 HTTP 요청·바이트 보관·기사 profile parser를 재사용한다. 실제 삼성SDS 요청은 304로 기존 hash-verified 원문 40,331 bytes를 재사용하고 게시일·본문 parse를 완료했다. 배치 intake와 source selection도 같은 run으로 연결했다. 후보는 미검토이며 전체 WBS 진척률을 완료로 승격하지 않는다.

이제 `process-search-candidates` 한 명령으로 수집→exact intake→후보별 source-selection까지 이어진다. 삼성SDS 실제 workflow receipt는 단계 모두 complete·후보 선택 1건·미선택 0건·발행 false다. 실행 중 중단하면 같은 입력 run ID를 재사용하고, 승인·초안·공개는 별도 편집 단계로 남는다.

추가로 watchlist의 기업·기관 47개에 출처 역할을 명시하고 공통 registry에 연결했다. 현재 등록 110개에서 출처 유형 미분류가 0건이며, 사업화 기관과 연구기관·기업 IR을 별도 집계한다. 실제 수집 활성화나 조사 범위 완료로 계산하지 않는다.

## 과거 화면 검증 기록

아래는 2026-09-13 뉴스 읽기와 누적 브리핑의 구현·배포 증거다. 오늘의 수집 체계 진척 또는 신규 변경의 배포 증거로 사용하지 않는다.

### 당시 구성

- 기존 `옵시디언_iCloudSync` 프로젝트와 `tech-ai-briefing-08` 오전 8시 일정을 유지한다. 원본은 이 저장소의 `vault/`다.
- 뉴스 홈·목록·상세는 날짜, 제목, 요약, 출처 중심으로 읽는다. 지도 위젯과 지도 자산 로딩이 없다. 목록 내 검색, 원문 바로가기, 별도의 브리핑을 제공한다.
- 브리핑 모음은 최신 변화, 누적 주제, 월별 회차로 나뉜다. 일일 브리핑에서 근거·한계·다음 확인과 헤드라인을 펼쳐 읽는다.
- 기존 수록 기사 17건을 재정리해 4개 주제, 10회차 관측 기록, 3개 재사용 판단 원칙을 만들었다. 실제 재정리일은 2026-09-13으로 표시한다. 과거 날짜에 실시간 판단을 수행한 기록으로 취급하지 않는다.
- 주제별로 현재 판단, 반대 조건, 다음 확인, 날짜별 근거, 재사용 원칙과 전문 개념을 연결한다. 원문 사건의 반복 등장으로 집계가 늘지 않는다. 최근 7일과 이전 7일 수는 수집·정리 범위의 기록이며 산업 성장률이 아니다. 미정리와 검토한 빈 결과를 구분한다.
- RSS는 최근 40회 브리핑의 기존 GUID와 URL을 유지한다. 제목에 당일 한 줄 주제를 포함하고 본문에 변화·한계·다음 확인·헤드라인·원문·GitHub 요약 링크를 제공한다.
- `digest/`에는 표준 Markdown으로 읽는 회차별 요약 113개, 주제별 기록 4개와 모음을 생성한다. Obsidian 없이 GitHub에서 읽고 공유한다. 웹은 원본 Editions, Archive, Signals, TrendTopics, 운영 폴더를 노출하지 않는다.
- 전용 지도와 전문 개념 페이지의 지도는 전문 용어 16개, 확인된 연결 17개를 유지한다. 새 트렌드 주제는 노드가 아니다.
- 기존 집필 스킬과 오전 8시 작업에 [트렌드 운영 규칙](TREND_WORKFLOW.md)을 반영했다. 일정·모델·추론 설정·프로젝트·경로 등 다른 예약 필드가 보존됐는지 비교했다. 다음 예약 실행은 별도 확인 대상이다.

## 검증

- 전체 테스트 204개와 TypeScript 검사, 스킬 형식 검사 및 스킬 테스트 4개 통과.
- 날짜 경계, 같은 날 후속 회차 제외, 반복 사건 중복 집계 방지, 잘못된 근거 연결 거부, 검토 누락/빈 결과 구분, 반대 근거 보존, 원칙의 근거 범위와 GitHub 분석 표기, RSS 내용과 안정적 주소를 검사했다.
- 빌드·웹 검사: HTML 192개, 검색 문서 190개, 뉴스 42개, 지도 용어 16개, 연결 17개, RSS 40회. 모든 내부 링크·문단 ID·GitHub 산출물과 제외 경로를 검사했다.
- 원본 Editions·Archive·Knowledge 163개 파일의 SHA-256이 변경 전과 동일하다. 취재 cutoff는 `2026-09-13T08:01:40+09:00` 그대로다.
- 실제 브라우저에서 PC 브리핑, 390px 모바일 뉴스·브리핑·주제·RSS를 확인했다. 뉴스 필터의 한 건/결과 없음, 상세 근거 펼치기, 뉴스 상세에 지도 없음, RSS 주소 복사와 가로 넘침 없음을 확인했다. 브라우저 콘솔 오류·경고는 없었다.
- 로컬 검증 기록: `.local/briefing-redesign/`. 실제 휴대폰 기기 성능 측정이나 새 RSS 구독 계정 등록을 수행한 것은 아니다.

## 발행과 사용

[뉴스](https://skyan0213.github.io/tech-knowledge-garden/) · [브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index) · [RSS 구독](https://skyan0213.github.io/tech-knowledge-garden/rss) · [GitHub 모음](../digest/README.md)

`main` 변경은 [Publish Garden](https://github.com/SKYAN0213/tech-knowledge-garden/actions/workflows/publish.yaml)이 검사하고 GitHub Pages로 배포한다. 발행은 Actions 성공과 실제 공개 페이지·RSS·GitHub 요약을 확인한 뒤 판정한다. 로컬 검증과 실제 발행은 구분한다.

이번 변경은 `f540173`에 구현됐고, 범위 정리 커밋 `9120edf`의 [배포 34737722632](https://github.com/SKYAN0213/tech-knowledge-garden/actions/runs/34737722632)가 성공했다. 공개 경로 17개의 정상·제외 응답, RSS 40회, 전문 용어 16개·연결 17개, GitHub 요약 6개 표본을 확인했다. 공개 자산 `4f4a9cb22f16`와 요약 원문이 로컬 결과와 일치한다. 최신 원문 3개 중 GitHub 두 주소는 HTTP 200, OpenAI 주소는 자동 요청에 403이었지만 실제 브라우저에서 원문 제목·본문·게시일을 정상 확인했다. 기록은 `.local/briefing-redesign/live.json`과 `original-links.json`에 있다.

동시에 작업 중이던 Drive 문서·스크립트 두 개가 구현 커밋에 섞여, 후속 커밋에서 최신 Git 트리에서 제외했다. 해당 로컬 파일을 보존했으며 중간 커밋 기록은 남아 있다.

별도 AI API나 유료 서비스는 추가하지 않았다. GPT 조사는 기존 ChatGPT/Codex 사용량을 사용한다. 로컬 예약에는 Mac과 Codex 앱이 켜져 있어야 한다. 공개 저장소의 웹 출력 제외 파일도 공개 자료다.

## 2026-10-01 현황 재계산

현재 저장소 기준 `npm run research -- status --format html`은 등록 경로 113개, 일일 활성 26개, 수집 프로필 27개, 기사 프로필 66개를 표시한다. 23개 경로의 과거 46창 완료 receipt는 그 실행 시점의 증거이며, 새 26경로 전체가 완주했다는 뜻이 아니다. 전체 필수 WBS는 **0/22 완료, 20 부분, 2 미착수**다.

개발 현황 탭에는 고정 Drive 사본과 발행 inventory 사건 대조(100건), 저장 후보 원문 근거 확인(96후보 중 62), 과거 저장 원문 연결(96후보 중 94, source version 516·parse 717)을 분리해 표시한다. 세 receipt의 처리 상태는 겹칠 수 있으므로 합산하지 않는다. 모두 읽기 전용이며 승인·발행·Drive 쓰기·공개 검증으로 계산하지 않는다. 후보 원장은 146건(verified 60·deferred 12·rejected 1·unreviewed 73), 승인 연결 4건이다.

2026-10-01에 전체 Node 회귀 429/429, Python worker 70/70과 연관된 receipt·현황 시험 11개를 통과했다. private 화면은 `.local/research/local-ai/delivery-status.html`로 생성됐으며, 문서화된 검증 범위는 [계획 19.49](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1949-후보-근거-대조와-완료-진척-현황-연결), [런북 122](LOCAL_AI_NEWS_RUNBOOK.md#122-후보-증거-대조와-전체-진척-현황-화면)이다. 장시간 동일 문제 정체는 없었다. 과거 14사건/96후보 직접 판정, 미확보·partial 원문, 전 경로 통합 실행, 정기 실행 검증·실제 공개와 신규 7회 검증은 미완료다.

## 2026-10-01 후보 중복 연결 후속

삼성 AI-RAN 동일 URL 후보 1건을 저장 원문·parse 지문·게시일과 이미 발행된 verified 기사의 사건 ID로 대조해 연결했다. 후보 장부는 146건(verified 58·deferred 12·rejected 1·unreviewed 75)이며, 해당 행은 `researchWindow` 대기 결과에서 사라졌다. 동일 검토 실행의 재호출은 같은 장부 SHA를 반환했다. 이 연결은 후보 bookkeeping이며 새 기사나 공개 발행이 아니다.

`tests/research-candidate-identity.test.mjs` 5/5, 전체 Node 430/430, `npx tsc --noEmit`, Prettier와 `git diff --check`가 통과했다. 현황 HTML을 새로 생성했다. 전체 목표 0/22 완료·19 부분·3 미착수는 그대로다. 나머지 미확정 후보, 전 경로 정기 통합, Drive 원격 왕복, 실제 공개 및 7회 운영 검증은 진행 중이다. 상세는 [현재 빌드 26절](LOCAL_AI_NEWS_CURRENT_BUILD.md#26-삼성-ai-ran-동일-원문-재발견-연결), [계획 19.50](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1950-동일-원문-url-후보의-발행-사건-대조), [런북 123](LOCAL_AI_NEWS_RUNBOOK.md#123-같은-url-재발견-기존-사건-연결)이다.

같은 시점의 전체 backlog 146건을 2026-05-01~2026-10-02 관측 창과 현재 verified Editions에 대조한 결과, exact URL로 이미 발행되어 있으나 사건 ID가 비어 대기하는 후보는 0건이다. `researchWindow` pending 95건은 이 exact-URL 중복 문제와 별개이며, 각각 사건 정체성·출처 검토가 더 필요한 후보로 남는다.

## 2026-10-01 발표일 차이 후보의 사건 연결

삼성SDS Helix 투자 후보 1건의 게시일은 기존 Samsung Global 기사보다 하루 뒤였지만, 저장 원문은 발표일을 2026-09-29로 직접 명시하고 있었다. 양쪽 원문의 투자 주체·대상·총액 및 직접 발표일 인용을 검토해 후보를 기존 사건 `171333c4eead9c69`에 연결했다. 후보 source-selection receipt와 backlog key·URL/version/parse 검증, 양쪽 `event_date` 인용이 없으면 날짜 차이 허용은 실패한다. candidate identity 회귀 7/7, 전체 Node 432/432, TypeScript 및 Python worker 96/96 통과. 원장은 146건(verified 59·deferred 12·rejected 1·unreviewed 74), pending 95건이다. 발행 원고·RSS·Drive·공개 사이트는 변경하지 않았다. 상세는 [계획 19.51](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1951-게시일과-사건일이-다른-검색-후보의-중복-차단), [현재 빌드 27절](LOCAL_AI_NEWS_CURRENT_BUILD.md#27-삼성sds-helix-발표일-차이가-있는-동일-사건), [런북 124절](LOCAL_AI_NEWS_RUNBOOK.md#124-삼성sds-helix-발표일-차이가-있는-동일-사건)이다. 전체 WBS는 0/22 완료·19 부분·3 미완료이며, 이 후보 1건만으로 전체 완료율을 올리지 않는다.

## 2026-10-01 ABB E-Device 현행 원문 재검토 및 후보 연결

기존 비공개 ABB E-Device 승인은 후보 장부의 최신 source version보다 오래된 parse를 근거로 해 연결되지 않았다. 저장된 현행 원문은 이전 parse보다 본문 1 block이 많았고, 새 추출에서 빠져 있던 ABB Robotics 사장 발언을 확보했다. 현행 저장 source를 재사용해 로컬 Qwen 추출, 원문 직접 검토, 초안 정정, event `5e467cdcb79271a9` 편집 승인까지 마친 다음 후보 장부와 exact source version·parse·fingerprint 대조를 통과했다. 후보 상태 `verified`, 신규 공개 `false`; 원장은 146건(verified 60·deferred 12·rejected 1·unreviewed 73), 승인 연결 4건이다. identity 경로 회귀·전체 Node 회귀와 다음 UI/status 검증 결과는 [런북 125절](LOCAL_AI_NEWS_RUNBOOK.md#125-abb-e-device-최신-원문-판본으로-후보-연결)을 따른다. Drive·공개 vault·RSS·GitHub는 변경하지 않았다.

## 2026-10-01 Drive 비공개 왕복 관문

Drive connector의 기존 읽기 외에 비공개 `Research` 폴더에서 업로드→동일 파일 ID 업데이트→원본 재읽기까지 시험했다. 두 revision의 크기·SHA-256이 로컬 입력과 일치했고 부모 폴더도 유지됐다. 시험 파일은 제거했으며 같은 이름의 검색 결과가 남지 않았다. 비공개 receipt는 `.local/research/local-ai/drive-roundtrip/20261001-private-research-roundtrip-v1.json`이다. 현재 사용한 인증은 Codex의 연결된 Drive connector이며 로컬 독립 OAuth·token refresh·정기 08시 실제 실행은 검증하지 않았다. 이 근거로 P5-02를 미착수에서 부분으로 갱신했다. 전체 WBS는 0/22 완료·20 부분·2 미착수다. 본문·후보 승인·권위 작성 폴더·공개 결과는 변경하지 않았다. 상세는 [계획 19.53](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1953-비공개-drive-커넥터-쓰기갱신재읽기-검증)과 [런북 126](LOCAL_AI_NEWS_RUNBOOK.md#126-비공개-research-drive-쓰기갱신재읽기-시험)에 있다.

## 2026-10-01 KUKA FSW 원문에서 비공개 후보 승인까지

KUKA 공식 10블록 원문을 로컬 Qwen `qwen3.8:27b`로 추출하고 모든 사실을 원문 블록에 직접 대조했다. 디지털 트윈 설명의 시제를 바로잡고 마찰교반용접 번역, 제목, 반복 설명, 분류 태그를 수정한 한국어 초안을 비공개 승인했다. 고정 사건 ID `496ab0bfbcdb42a4`로 후보를 연결해 후보 원장은 146건(verified 61·deferred 12·rejected 1·unreviewed 72)이 됐다. 후보는 `candidate_published:false`다. 9월 24일 로컬 Edition이 없고 최신 Drive cutoff 확인 전이라 회차에는 넣지 않았다. 재현과 검토 입력은 [런북 127절](LOCAL_AI_NEWS_RUNBOOK.md#127-kuka-fsw-원문-사실검토와-비공개-기사-승인), 비공개 기사와 원문 식별은 [현재 빌드 30절](LOCAL_AI_NEWS_CURRENT_BUILD.md#30-kuka-fsw-원문에서-비공개-후보-승인까지)이다. 공개 사이트·RSS·GitHub·Drive는 변경하지 않았다. 전체 WBS는 0/22 완료·20 부분·2 미착수 그대로다. 로컬 진행 현황 화면 `.local/research/local-ai/delivery-status.html`은 SHA-256 `e01001db1aae2803b956fe79f1b35451b037dd459766e69e1951c73a11aa69bd`로 갱신했다.

## 2026-10-01 ABB Destination Zukunft 파서와 후보 연결

ABB 매거진의 실제 `__NEXT_DATA__` 구조를 수용하는 공통 `nextjs-page-data` parser와 제한된 출처 profile을 추가했다. 저장 HTML의 기존 파서는 말미 3문단만 추출했지만 재파싱 결과는 원문 provenance가 붙은 23 block이었다. 로컬 Qwen 추출 6건에 직접 원문 검토 추가 2건을 더해 8 claim을 verified 처리했고, 번역 오류·분류를 교정한 한국어 기사 `0bfcf38af1af9b18`을 비공개 승인했다. ABB·Liebherr 자동화 사례의 발견 후보 `abb-liebherr-saw`를 source version/parse/content fingerprint까지 대조해 `verified`로 연결했다. 원장은 146건(verified 62·deferred 11·rejected 1·unreviewed 72), 후보 발행은 false다.

공개 회차 cutoff를 확인하지 않아 Edition·Drive·RSS·웹·GitHub는 변경하지 않았다. 출처 registry 9/9, Python worker 71/71, 전체 Node 434/434, `npx tsc --noEmit`, Prettier와 `git diff --check`가 통과했다. 현황 화면 `.local/research/local-ai/delivery-status.html`은 최신 current snapshot을 포함하며 SHA-256은 `d7f3b992f9f02c07977a10abe3b3d4c33ee740b97f7c2ebb7efd6cadef4fc8b1`다. 화면의 WBS는 0/22 완료·20 부분·2 미착수이며, 이 기사 하나를 전체 완료로 계산하지 않는다. 동일 차단으로 1시간 이상 반복 정체한 일은 없다. [계획 19.54](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1954-abb-destination-zukunft의-공통-nextjs-파싱과-후보-승인-수직-슬라이스), [현재 빌드 31절](LOCAL_AI_NEWS_CURRENT_BUILD.md#31-abb-destination-zukunft-본문-모듈-파싱), [런북 128절](LOCAL_AI_NEWS_RUNBOOK.md#128-abb-destination-zukunft-본문-모듈-파싱과-비공개-후보-승인).

## 2026-10-01 현황판 실시간 수치 동기화

실제 후보 장부는 verified 62·deferred 11·approval receipt 6이고 acquisition/article profile은 27/67인데 WBS의 유지보수 문구가 직전 수치를 표시해 상태판 안에서 서로 달랐다. `delivery-status.mjs`에 읽기 전용 `current_snapshot`을 추가하고 상단 카드에 profile 수·후보 상태 분포를 연결했다. 전체 WBS 완료율은 이 건수에 연동하지 않는다. 누락·invalid 장부는 성공처럼 보여주지 않는다. 계획표의 현재 기준도 갱신했고, 같은 입력·실패 상태의 회귀를 추가했다. 관련 파일은 [계획 19.55](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1955-진척-현황의-최신-설정후보-원장-연결), [현재 빌드 32절](LOCAL_AI_NEWS_CURRENT_BUILD.md#32-현황판의-최신-profile과-후보-상태-분리), [런북 129절](LOCAL_AI_NEWS_RUNBOOK.md#129-현재-profile과-후보-분포를-현황판에-연결)이다.

## 2026-10-01 Next.js 미등록 모듈 누락 방지

ABB parser가 모르는 page-data 모듈을 묵시적으로 건너뛰면서 전체를 `extracted` 처리할 수 있어, 출처 profile에 명시된 무시 모듈과 미등록 콘텐츠 모듈을 구분했다. 실제 ABB 원문에서 확인된 갤러리와 관련 기사만 quality에 기록해 제외하며, 이후 새로운 유형이 나타나면 이미 얻은 텍스트는 보존하면서 parse를 `partial`로 낮춘다. fixture 회귀는 명시 제외 기록·unknown module 부분 상태·URL 불일치를 확인하고, 실물 재파싱 v2는 23 block과 명시된 두 무시 유형을 확인했다. 상세는 [계획 19.56](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1956-미등록-nextjs-본문-모듈의-부분-상태-처리)과 [런북 130절](LOCAL_AI_NEWS_RUNBOOK.md#130-미등록-본문-모듈의-부분-처리와-명시적-제외)이다.

이 변경 후 출처 registry 9/9, Python worker 71/71, 전체 Node 434/434, TypeScript, Prettier와 `git diff --check`가 통과했다. private 현황판은 live profile 27/67 및 후보 62/11/1/72를 표시하고 WBS 0/22·20 partial·2 not-started를 별도로 유지한다. 최신 화면 hash는 위에 기록했다.

## 2026-10-01 Reuters 대체 공식 자료로 사실 검토 샘플

Reuters Media Center 후보 원문이 막혀 있어도 후보 원주소를 바꾸지 않은 채 Reuters Agency의 공식 기사에서 동일한 통합을 설명하는 구간을 확보했다. 14 block parse 이후 로컬 Qwen 추출 6건 가운데 사건에 필요한 1건을 검증하고, 원문 직접 검토로 기능 사실 1건을 보탰다. 초안의 해석·반복·연도 오류는 `correct` 경로에서 수정했다. preview는 로컬 `.local/research/local-ai/runs/20261001-reuters-alternate-extract-v2/preview.md`에 있다. Qwen이 처음 출력한 오류를 수정 없이 공개할 수 없다는 점도 이 slice에서 확인했다.

후보 URL–대체 공식 URL의 same-event identity resolution은 신규 command와 private receipt로 구현했지만, 그 receipt를 article/candidate approval link로 소비하는 단계는 남아 있다. 따라서 원 후보는 여전히 `deferred`, event ID·후보 승인·발행 없음이다. 현황판에도 receipt 1건/same-event 1건을 표시하며 전체 WBS는 0/22 완료·20 부분·2 미착수 그대로다. KERI 목록/detail 요청도 collector에서 `blocked`였고 세부 본문을 만들지 않았다. Drive·vault·RSS·GitHub·site 배포는 수행하지 않았다. source-resolution 회귀 4/4와 실제 Reuters receipt가 확인됐다. 재현 절차·다음 기술 관문은 [계획 19.57](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1957-막힌-exact-source-후보의-공식-대체-자료-same-event-receipt), [현재 빌드 34절](LOCAL_AI_NEWS_CURRENT_BUILD.md#34-reuters-공식-대체-원문-수집에서-정정-샘플), [런북 131절](LOCAL_AI_NEWS_RUNBOOK.md#131-공식-대체-원문으로-막힌-후보의-사실-추출정정-샘플)이다.

## 2026-10-01 Reuters 대체 원문의 후보 승인 연결

Reuters Agency의 14-block 공식 원문에서 검증한 2개 fact와 한국어 원고를 기존 후보 승인까지 연결했다. 원 후보 URL은 유지하고 article source는 대체 Reuters Agency URL로 고정했다. 게시 metadata는 `null`로 보존했으며 본문 `12 September`·`during IBC`·`IBC2026`과 direct claim을 별도 사건일 근거로 저장했다. 결과는 private event `ca034e971b056256`, 후보 `verified`, publication false다.

candidate approval·대체 receipt·evidence review·historical scan 회귀와 event-date 계약을 포함해 `npm run test:garden` 445/445, `npx tsc --noEmit`, Prettier, `git diff --check`가 통과했다. live 후보 원장은 146건(verified 63·deferred 10·rejected 1·unreviewed 72), approval link 7건이다. private 상태 화면 `.local/research/local-ai/delivery-status.html` SHA-256은 `e450b7e2c544cd3918b2df88d02c095d874b815b32ad45d02e9213cf36879d12`이다. WBS는 0/22 완료·20 부분·2 미착수로 유지한다. 상세는 [계획 19.58](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1958-공식-대체-원문을-기존-후보의-비공개-승인까지-연결), [현재 빌드 35절](LOCAL_AI_NEWS_CURRENT_BUILD.md#35-공식-대체-원문에서-기존-후보의-비공개-승인까지), [런북 132절](LOCAL_AI_NEWS_RUNBOOK.md#132-reuters-대체-공식-원문에서-후보의-비공개-승인까지)을 따른다. Google Drive·Edition·RSS·GitHub·site 공개는 수행하지 않았다.

## 2026-10-01 Frontiers 로봇 논문 수직 슬라이스

출판사 원문 142 block을 재수집 없이 선택해 로컬 Qwen 추출, 직접 사실 검토, 한국어 초안·정정, 비공개 기사 승인과 후보 identity 연결까지 수행했다. 추출 claim 18개 중 9개는 원문 인용·수치 조건이 맞지 않거나 기사에 불필요해 보류했다. 나머지 9개를 직접 검증하고 문제 설명 및 비교 실험 조건 2개를 원문에서 보충해 최종 11 verified·9 deferred로 마쳤다. 같은 candidate-approval 재실행은 동일 backlog SHA를 반환했다.

후보 원장은 146건(verified 64·deferred 10·rejected 1·unreviewed 71), 승인 receipt 8건이다. Event `ba30558b2b9272b4`, DOI `10.3389/frobt.2026.1935721`. 2구간 공압식 CBHA/Robotino® XT 실측 결과는 3구간 시뮬레이션 로봇의 직접 하드웨어 시험으로 표현하지 않았다. WBS는 0/22 완료·20 부분·2 미착수 그대로이며 P0-03 gold 평가, 나머지 후보 사건 정체성, P6 정규 운영은 미완료다. 모델 추출 세 체크포인트는 총 약 643초, 초안 생성은 약 3분이었고 한 시간 이상 막힌 단계는 없었다. 실행 근거는 [런북 133절](LOCAL_AI_NEWS_RUNBOOK.md#133-frontiers-연속체-로봇-논문-전체-본문-검토와-비공개-승인)이다.

## 2026-10-01 Frontiers 실제 원문 개발 평가 케이스

동일한 Frontiers 전문의 142블록을 immutable evaluation fixture로 저장했다. 후보 출력에 노출된 상태로 작성해 독립 gold가 아닌 development 사례라고 명시했고, verified 11 facts·필수 설명·금지 변형을 출처 근거에 묶었다. frozen fixture에서 `qwen3.8:27b` 실제 재실행은 18 claims/3 묶음, 모델 시간 642,603ms로 끝났다. 구조 검사는 7/18 통과; 직접 coverage는 full 9·partial 1·missing 1이며 missing은 문제 정의, partial은 공통 실험 조건이다. 이 결과는 사례 하나의 개발 관찰치라 독립 평가 점수로 집계하지 않는다. 전체 WBS는 0/22 완료·20 부분·2 미착수, independent gold/heldout은 아직 0이다. 상세 입력·출력·검토는 [계획 19.60](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1960-frontiers-실제-원문-개발-평가-fixture와-재실행-대조), [런북 134절](LOCAL_AI_NEWS_RUNBOOK.md#134-frontiers-실제-원문-개발-evaluation-fixture-재실행과-직접-대조), `.local/research/local-ai/evaluation/` 아래에 있다.

## 2026-10-01 평가 판정 receipt 생성 경로

반복 수작업을 막기 위해 `evaluation-review` CLI를 구현했다. source adjudication input을 frozen case와 완결된 extraction run에 검증 연결하고, claims의 실제 evidence 구조 오류·모델 예산 provenance·처리 시간을 재계산한다. Frontiers 판정은 18 claims 중 7개 구조 통과, coverage 9 full·1 partial·1 missing으로 저장됐으며 같은 명령 재실행은 동일 SHA를 반환했다. CLI 회귀 14/14, 전체 garden suite 448/448, `npx tsc --noEmit` 통과. `public_approved:false`; 독립 gold·heldout 및 전체 WBS 완료도는 그대로다. [계획 19.61](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1961-평가-판정의-공통-cli와-immutable-receipt), [런북 135절](LOCAL_AI_NEWS_RUNBOOK.md#135-평가-판정-cli와-출처-기반-receipt).

## 2026-10-01 실행 계약 fixture와 public projection 경계

시스템 설계의 JSON claim 예시를 현재 `extractionSchema`와 맞추고, 그 예시의 인용이 같은 고정 parse block·source identity에 실제 연결되는지도 검사한다. 여러 층의 status 목록·candidate transitions를 하나의 fixture로 런타임 정의와 대조했다. Article record의 unknown fields는 내부·중첩 단계에서 거부하며 공개 projection은 allowlist로 생성한다. `next_check`, `reason`, `private_notes`는 공개 News metadata에서 빠진다. GET/POST 재시도와 새 원문/parse 분기 규칙도 실행 명세에 반영했다. 관련 회귀 22/22, 전체 452/452, `npx tsc --noEmit`, 포맷 및 `git diff --check` 통과. P0-02는 완료로 전환했고 P0-03·자료 소급·Drive·공개 발행은 계속 남아 있다. [계획 19.62](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1962-실행-계약-fixture공개-필드-경계-통합), [런북 136절](LOCAL_AI_NEWS_RUNBOOK.md#136-기사-계약-fixture와-공개-필드-검증).

## 2026-10-01 평가 세트 진행도 계측

P0-03의 실제 원문 사례 수와 coverage 공백을 반복 수작업 없이 확인하도록 `auditEvaluationCases`를 추가하고 private 현황판에 연결했다. 같은 documents/parses snapshot의 재검토 revision은 한 사례로만 센다. fixture 무결성 오류나 split 충돌은 별도 상태로 보이며, gold 문장과 원문 URL은 집계 화면에 노출하지 않는다. 기존 저장물은 14 revisions·12 unique actual-source snapshots이며 개발 12/40, 보류 0/20, 독립 human gold 0이다.

평가/현황 회귀 23/23, 전체 `npm run test:garden` 453/453, `npx tsc --noEmit`, Prettier, `git diff --check`가 통과했다. private HTML 생성도 확인했으며 전체 목표는 미완료다. [계획 19.63](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1963-p0-03-평가-세트-커버리지-계측), [런북 137절](LOCAL_AI_NEWS_RUNBOOK.md#137-평가-fixture-커버리지-현황-확인).

## 2026-10-01 평가 원문 형식 범위 계측 추가

평가-set 감사에 원문 파일 MIME, parser engine, 실제 table block, recorded OCR pages coverage를 추가했다. 현재 actual snapshots 12개 안에서 고유 source file은 HTML 15·PDF 1, table 포함 5개 평가 사례, recorded OCR page 포함 사례 0개다. 다국어 또는 복수 원문이 한 사례에 묶일 수 있어 파일 수와 사례 수는 따로 센다. 독립 human review와 heldout 모두 0이라 P0-03은 계속 partial이다.

`tests/research-evaluation.test.mjs`의 MIME 분류·unique snapshot/분할 충돌 검사가 통과했다. 전체 Node 453/453, TypeScript와 대상 테스트도 통과했다. 새 private HTML SHA-256은 `94e5789bac35338654082b15a4f9b6ba2c663995e1e7d5b12114fdc0ad794062`다. 자세한 내용은 [계획 19.64](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1964-p0-03-원문-매체와-파서-커버리지-계측), [런북 138절](LOCAL_AI_NEWS_RUNBOOK.md#138-평가-원문-파싱-범주-확인).

## 2026-10-01 사이버보안 개발 평가 원문 추가

기존 immutable OpenAI 38쪽 incident PDF(504 parse blocks)를 재사용해 고유 개발 사례 하나를 만들었다. 7개 핵심 사실과 수치·날짜·사실 귀속·금지 변형을 직접 원문 block에 묶었다. `published_at`은 원문 metadata에 없으므로 null이다. 평가 사례 생성은 새로운 원문 수집이나 공개 발행을 일으키지 않는다.

사건 관련 모델 출력 및 해설에 이미 노출된 Codex가 기준안을 작성해 `source_reviewed_candidate`로 저장했다. 독립 gold/heldout은 아니다. 평가 자료는 이제 15 revisions, 13 unique actual-source, 88 facts, 17 source URLs이며 개발 13/40, 보류 0/20, 사이버보안 분야 1건이다. P0-03은 계속 부분이다. 실행 지침은 [계획 19.65](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1965-사이버보안-공식-사고-pdf-개발-평가-사례), [런북 139절](LOCAL_AI_NEWS_RUNBOOK.md#139-사이버보안-사고-pdf-개발-평가-사례).

## 2026-10-01 KAIST 연구 사업화 평가 사례 추가

저장된 KAIST RAIBO2 공식 원문을 재사용해 교수 연구팀·교원창업기업·실제 마라톤 결과·제품화 상태를 분리한 6-fact 개발 사례를 추가했다. 원문 전체 23블록에서 근거를 고정했고, 판매·납품이나 제품 신뢰성 달성을 추정하지 않는다. 기존 후보 분석에 노출된 Codex가 작성했으므로 independent gold/heldout이 아니다.

정책 고정 `qwen3.8:27b` 실제 추출은 6 claims·구조 근거 4 통과·원문 대조 coverage full 1/partial 3/missing 2였다. `raw_model_pass:false`, public approval false다. 수치 조건과 상용화 진행 상태의 오류·누락을 보존했다. direct adjudication receipt SHA-256은 `8be00a343f18d418da931aa078ad061982cf1c3ddf9cc96a283205b6ccc715af`다. 평가 자료는 16 revisions·14 unique actual-source, 94 facts, 19 URLs이며 development 14/40·heldout 0/20·독립 human gold 0이다. 생성한 비공개 현황판 SHA-256은 `5ce6d316046eebf9214e9561b89758819a637cf45b7d9809fe90d746fe330c92`다. 실행 절차와 남은 P0-03 요건은 [계획 19.66](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1966-kaist-raibo2-연구-사업화-평가-사례), [런북 140절](LOCAL_AI_NEWS_RUNBOOK.md#140-kaist-raibo2-연구-사업화-개발-평가-사례)에 기록했다.

## 2026-10-01 26개 경로 통합 실행과 장애 분기

활성 26개 경로를 새 통합 run에서 52개 날짜 창으로 검사했다. receipt 49개는 `window_scanned`, KUKA 차단·GitHub 파서 조건 불일치·Google Cloud 상세 parse 실패 3개는 미완료다. 저장된 모든 완료 창의 고유 관측 후보 77건 중 7건을 원장에 추가했으며, 현재 153건(verified 64·deferred 10·rejected 1·unreviewed 78), backlog SHA `8191901af0ea8f13642f392329badcb2ef56eb6fbb5abb37c371337d7f50e42c`다. 자동 승인·발행은 없다. 상태판상 최신 통합 실행은 26경로·52창·partial이며 `candidate_published`, `drive_verified`, `public_verified`는 모두 false다.

진행 중 고칠 수 있는 GitHub 원인은 다른 두 출처 실패와 분리했다. 공식 10월 월 페이지에는 명시적 empty-state가 있었지만 월 제목 block만 찾는 설정 탓에 실패했다. 스캐너가 출처 설정에 등록된 빈 상태와 기사 링크 0개를 모두 확인할 때만 `confirmed_empty`로 기록하게 고쳤다. 저장 원문 10월 직접 스캔은 0 후보·완료, 인접 9월30일~10월2일 스캔은 4개 상세를 파싱했다. KUKA는 공개 페이지 blocked, Google Cloud는 상세 incomplete 상태 그대로다. 이에 대한 재시도는 수행하지 않았고 1시간 이상 막힌 작업도 없다. 상세 [현재 빌드 44절](LOCAL_AI_NEWS_CURRENT_BUILD.md#44-26개-일일-경로-통합-실행과-github-빈-월-보정), [계획 19.67](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1967-최신-26개-경로-통합-수집과-빈-월-아카이브-처리), [런북 141절](LOCAL_AI_NEWS_RUNBOOK.md#141-26개-일일-경로-실행과-github-명시적-빈-아카이브-수용)를 참조한다. 로컬 private 상태판 SHA-256은 `ffc9eb80280814d17c733e3daf02d8df56440869a7a6439602bef00fc4851cf8`; WBS는 1/22다.

## 2026-10-01 Google Cloud 상세 parse 경로 복구

Google Cloud Threat Intelligence 기사에서 2개 `<h1>`을 함께 잡던 selector를 첫 article section으로 좁혔다. 저장된 공식 원문을 재요청 없이 재파싱해 `extracted`·76 blocks를 확인했다. 한 날짜 창의 후속 `scan-list`는 `window_scanned`·후보 1건·공개 false다. 후보 승인·장부 병합은 하지 않았다. 원래 main26 통합 run receipt는 `detail_incomplete` 상태를 유지하고 별도 실행 receipt가 보정 근거다. 이는 프로필·파서 수리이지 기존 26개 route run의 전체 완료로 재해석하지 않는다. 상세 [계획 19.68](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1968-google-cloud-위협-분석-상세-제목-구분)·[런북 142절](LOCAL_AI_NEWS_RUNBOOK.md#142-google-cloud-위협-분석-기사-제목-파싱-보정).

KUKA 신규 창은 `www.kuka.com/robots.txt`의 `Fetch deadline exceeded` 때문에 정책 검토 전에 멈췄다. 기사 API 요청은 발행하지 않았고, 이전 robots 파일만으로 현재 접근을 허용 처리하지 않았다. 새 robots 관측이 준비될 때까지 수집 상태는 blocked로 남긴다. 이는 1시간 이상 반복 정체가 아니라 단일 정책 확인 실패다.

## 2026-10-01 선택형 API 추론 provider

실측한 local Qwen 호출은 건당 약 155초, 긴 논문 추출 3회는 합계 643초였다. 지연의 대부분은 모델 생성 구간이다. 같은 전체 run에서 수집부터 생성까지 계측한 값은 아니므로 end-to-end 지연 비율을 단정하지 않는다. 기존 Ollama 호출/역할 budget 경계를 공유하는 Responses API adapter를 구현했으며 역할별 `provider`를 명시해야만 선택된다. 기본 정책은 변경하지 않았다.

mock 검증은 API model metadata, strict JSON Schema, 응답 usage 저장, secret 비저장, 성공결과 cache, ambiguous 실패 자동 재요청 차단을 포함한다. 전용 provider·역할 정책·CLI·runtime 회귀 49/49, 전체 Node 469/469, TypeScript, diff 및 코드 포맷 검사를 통과했다. `OPENAI_API_KEY`가 없으므로 실제 source 전송·비용·속도는 검증하지 않았다. API provider 추가는 독립 40/20 품질 평가나 22개 필수 WBS 완료로 계산하지 않으며 후보 승인·공개·Drive 상태도 바꾸지 않았다. 재현 절차는 [실행 가이드 149절](LOCAL_AI_NEWS_RUNBOOK.md#149-선택형-openai-responses-추론-경로), 설계 경계는 [구현 계획 19.75절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1975-선택형-openai-추론-경로와-로컬-기본값-유지)에 있다.

## 2026-10-01 두산로보틱스 IR PDF 희소 페이지 복구

기존 official PDF 원문 10쪽의 section divider를 missing page로 판정한 PDF parser heuristic을 조사했다. page 3 렌더에는 `Chapter 1. 2Q 2026 Results`만 있고 표·성과 본문은 없었다. exact page/text profile match를 요구하는 공통 sparse-page 예외와 해당 URL의 IR title profile을 추가했다. 저장 bytes 재파싱은 138 blocks, 0 missing pages, `extracted`이며 publication date는 null이다. 게시일 근거가 없는 이 IR 경로는 일일 후보로 활성화하지 않았다. 새 worker 회귀 2개, 전체 Python worker 73/73, 전체 Node 469/469, TypeScript, JSON profile format과 `git diff --check`를 통과했다. [구현 계획 19.70](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1970-두산로보틱스-ir-archive-수집-전-날짜-근거-검증), [실행 가이드 150절](LOCAL_AI_NEWS_RUNBOOK.md#150-두산로보틱스-ir-pdf-희소-구분-페이지-profile-재파싱).

## 2026-10-01 일일 수집 단계별 지연 계측

일일 route/window receipt에 monotonic 기준 `scan`, `verify`, `backlog_merge`, `total` 밀리초를 기록하고, 재개 요약에 측정 합계·route별 시도 수·구형 미계측 수를 연결했다. 기존 receipt 시간은 추정하지 않는다. 비공개 현황판의 조사 범위 탭에서 단계별 시간을 볼 수 있게 했다. 임의의 hard budget은 정하지 않았으며 실제 새 실행 분포와 모델 receipt 시간을 확보한 뒤 설정한다.

`node --test tests/research-daily-scan.test.mjs` 16/16, `node --test tests/research-delivery-status.test.mjs` 9/9, 전체 `npm run test:garden` 470/470, `npx tsc --noEmit`, 관련 파일 Prettier와 `git diff --check`가 통과했다. 최신 비공개 현황판 SHA-256은 `465a192013ef9f7899ebb4f8bb3ea5c7175bb31a336a4d06ef1b0226a3ce678f`다. WBS 1/22, 19 partial, 2 not started이며 P5-01은 부분이다. `OPENAI_API_KEY`는 현재 환경에 없어 실 API 벤치마크를 수행하지 않았고 원문을 외부 API로 보내지 않았다. 실제 단계시간은 계측된 다음 daily run에서 쌓인다.

## 2026-10-01 일일 수집과 모델 추론시간 연결

비공개 진행 현황판에서 route/window 수집 receipt와 후보별 모델 예산 receipt를 exact `daily_run` ID로 결합했다. ledger와 결과 SHA를 확인하고 완료/실패/running 상태, 모델 wall time, 미완료 예약, 역할/provider 집계를 표시한다. 원문·프롬프트·응답·candidate key는 내보내지 않는다. 현재 최신 daily run은 source selection 0건이라 추론시간을 `no_linked_model_runs`로 표시하며 0ms로 오인하지 않는다.

`node --test tests/research-delivery-status.test.mjs tests/research-daily-scan.test.mjs` 26/26 통과. 최신 비공개 현황판은 재생성 후 검사한다. API key가 없는 상태라 API 실측은 별도 완료되지 않았고, P5-01은 부분이다.

## 2026-10-01 콘텐츠 발행 중복 실행 차단

`npm run publish`의 Drive 확인부터 Git push까지 `.local/research/local-ai/locks/content-publication.json`을 소유하도록 묶었다. 동시 발행 프로세스는 원격 작업 전에 배제하고 예외에서는 잠금을 해제한다. 강제 종료 뒤 남은 lock은 PID 확인 후 수동 복구한다. 임시 저장소의 동시 진입·정상 해제·실패 해제 시험은 새로 추가했다. 전체 Node 473/473, TypeScript, 변경 코드 포맷과 `git diff --check`가 통과했다. 실제 publisher 진입은 미커밋 코드 변경에 따른 기존 안전 preflight에서 중단됐고 lock은 해제됨을 확인했다.

이 lock은 `npm run publish` 경로만 보호한다. 기존 오전 8시 Codex 경로·원격 workflow와 owner를 공유하지 않으며 push 응답 유실 복구도 미완료라 P5-01은 부분으로 유지한다. 실제 Drive 쓰기·commit·push·배포는 실행하지 않았다. 같은 원인을 반복 시도하며 1시간 이상 정체한 단계는 없었다. 재개점은 기존 오전 8시 실행과 동일 publication lock을 공유하도록 handoff 및 원격 응답 readback을 묶는 것이다. 상세는 [계획 19.77](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1977-로컬-콘텐츠-발행의-단일-실행-잠금), [현재 빌드 49절](LOCAL_AI_NEWS_CURRENT_BUILD.md#49-콘텐츠-발행-경로의-동시-실행-차단), [런북 153절](LOCAL_AI_NEWS_RUNBOOK.md#153-콘텐츠-발행-중복-실행-잠금)이다.

## 2026-10-01 Git push 응답 유실 재개 확인

기존 `npm run publish`에 push 전·후 remote branch SHA 대조와 private create-only attempt receipt를 추가했다. 응답 오류 뒤 remote HEAD가 local commit과 같으면 원격 상태로 성공을 확인하고, 재실행에서는 이미 존재하는 SHA의 push를 건너뛴다. mismatch·readback 단절은 receipt를 남기고 실패로 반환한다. fake-git 경계 회귀 4개와 전체 Node 477/477, TypeScript, 구문·포맷 검사, `git diff --check`를 확인한다. 실제 push·Drive write·배포는 하지 않았다. 이는 Git branch 반영만 검사하므로 배포/웹/RSS readback과 08시 workflow 공유 lock은 여전히 미완료이며 P5-01은 부분 상태다. [계획 19.78](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1978-git-push-결과-유실의-원격-sha-재확인), [현재 빌드 50절](LOCAL_AI_NEWS_CURRENT_BUILD.md#50-git-push의-원격-상태-readback과-유실-응답-복구), [런북 154절](LOCAL_AI_NEWS_RUNBOOK.md#154-git-push-응답-유실과-원격-sha-재확인).

## 2026-10-01 비공개 Research 원문 묶음 업로드

Yaskawa 「Vision 2035 / Dash 35」 공식 PDF 수집 1건의 원문 bytes·SHA-256·수집 receipt·partial parse·run 상태를 ZIP으로 구성했다. 대상 이름의 Drive 검색 0건을 확인하고 비공개 `Research` 폴더에 업로드한 뒤 file ID·부모·크기·수정시각을 metadata readback했다. 원문은 미검토 상태로 유지했고 기사 승인·공개 데이터 변경은 없다. connector raw fetch가 streamed reference만 제공하고 `md5Checksum`이 없어 원격 bytes hash 일치는 미검증이다. [계획 19.79](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1979-비공개-research의-새-원문-보관-묶음).

## 2026-10-01 archive 입력에 원문 bytes 무결성 추가

`archive --run`이 run-local 파일뿐 아니라 각 캡처 source version의 불변 `body.bin` 경로, source/version identity, SHA-256을 검사해 private manifest에 열거하도록 확장했다. 손상·누락·경로 오류는 실패한다. 회귀 14/14와 실제 Yaskawa 수집 run archive(7개 run 파일 + 1개 원문 version)를 확인했다. 일반 collector 경로의 Drive 업로드/revision/conflict recovery 자동 연결은 P5-03에 남아 있다. 단일 원문 묶음의 원격 bytes hash 재읽기는 19.81에서 완료했다. [계획 19.80](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1980-archive-manifest에-원문-body-무결성-연결), [런북 156절](LOCAL_AI_NEWS_RUNBOOK.md#156-run-archive-manifest에-캡처-원문-연결).

## 2026-10-01 Drive 원문 묶음 byte hash readback

커넥터가 반환한 streamed file reference에서 기존 Yaskawa ZIP을 재읽고 local archive와 바이트 단위로 비교했다. 양쪽 455,630 bytes, SHA-256 `0550b1e85aefa024324cf48edbc0821d1c06213b5f35e003aabf7c6272b19519` 일치; Drive file ID와 Research parent는 이전 metadata readback과 결합된다. 비공개 영수증 `.local/research/local-ai/drive-roundtrip/20261001-yaskawa-vision2035-drive-readback-v1.json`. 이는 신규 1건의 업로드 왕복을 증명한다. 일반 collector와 Drive revision/conflict recovery 자동 연결은 남아 P5-03은 부분이다. [계획 19.81](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1981-drive-원문-묶음-bytes-재읽기).

## 2026-10-01 재사용 가능한 run ZIP과 Drive 동일 ID 갱신

`archive --run`에 원문 무결성 검증·run/source ZIP 생성·내부 package manifest·고정 timestamp·같은 run ID의 변경 입력 덮어쓰기 차단을 통합했다. Yaskawa run으로 실제 ZIP(8 entries)을 생성한 뒤, 이전 modified time/SHA와 충돌이 없음을 확인하고 Drive의 기존 file ID에서 갱신했다. fresh connector readback과 로컬 ZIP 모두 456,622 bytes, SHA-256 `5935207e167a1c1e9aafc344ead4773f36d695df22a39bb072fdaab0de5c2412`로 일치한다. [Drive readback receipt](/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden/.local/research/local-ai/drive-roundtrip/20261001-yaskawa-vision2035-drive-readback-v2.json). generic collector upload/revision/conflict recovery integration remains partial.

## 2026-10-01 기존 08:00 자동화 보관 단계 연결

활성 `Daily Technology Briefing 08`의 기존 prompt에 선택 source-run별 `archive --run` → run ID 기반 Research 파일명 → 중복 검사·byte 비교 → readback SHA·비공개 receipt 기록을 추가했다. 실행 시각·모델·프로젝트·상태는 바뀌지 않았다. 설정/파일 readback에서 단계와 파일명 규칙을 확인했으나, 실제 다음 08:00 run receipt는 아직 없어 P5-02는 부분이다. [계획 19.83](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1983-기존-0800-자동화에-비공개-package-보관-절차-연결).

## 2026-10-01 보완 coverage가 편집 인계에서 누락되던 결함 수정

기존 일일 통합 실행의 49/52 성공 receipt 뒤에 별도 수집·검증·coverage reconcile을 마친 세 날짜 창이 있었지만, 편집 handoff는 daily-run receipt만 집계해 이 창들을 계속 미완료로 보였다. supplemental receipt, 정확한 route/window, 원문 run 무결성, 후보 키와 병합 상태를 재검사한 뒤 handoff 완료 창으로 인정하도록 연결하고 coverage·receipt·검증 코드 fingerprint를 저장한다.

2026-10-01 KST의 새 GitHub Changelog/Google Cloud scan은 각각 4개/1개 후보를 수집했고 모두 미공개다. 별도 기존 KUKA supplement와 합쳐 재생성 handoff의 52/52 창이 완료, 미완료 0이 됐다. 기존 49 성공·3 미완료 receipt summary는 보존했다. regression은 daily scan/handoff 26/26, 전체 `npm run test:garden` 480/480, `npx tsc --noEmit`, 변경 파일 Prettier 검사, `git diff --check`, `python3 -m py_compile scripts/research/package-archive.py`를 통과했고 현재 실제 run에서 재생성된 handoff도 확인했다. 기사 승인·Drive 작성·공개 발행은 수행하지 않았다. 1시간 이상 막힌 반복은 없었다. [계획 19.84](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1984-supplemental-coverage를-일일-편집-인계에-반영), [런북 160](LOCAL_AI_NEWS_RUNBOOK.md#160-supplemental-coverage와-일일-인계의-완료-판정).

## 2026-10-01 로컬 추론 지연과 API 비교 가능성 확인

2026-10-01에 완료된 `qwen3.8:27b` 예산 receipt 14건(사실 추출 7건, 기사 작성 7건)을 집계했다. 추출 wall time은 중앙값 183.5초·합계 1,249.9초, 기사 작성은 중앙값 155.2초·합계 1,081.4초다. 따라서 원문이 이미 수집된 뒤의 사실 추출·기사 작성에서는 로컬 추론이 큰 지연 요인이다. 반면 같은 날 통합 일일 수집 `daily-20261001-main26-integrated-v1`은 26경로·52창을 수행했지만 그 run에 연결된 모델 receipt가 없으므로, 출처 수집 단계의 병목을 로컬 LLM으로 판정할 근거는 없다. 이 결과는 서로 다른 수집 run의 시간과 모델 호출 시간을 합산한 end-to-end 비율이 아니다.

OpenAI Responses API provider와 사용량·wall-time ledger 연동 코드는 이미 있으며, 기본 provider는 계속 Ollama다. 현재 실행 환경에는 `OPENAI_API_KEY`가 없고 실제 API 시도도 없어 API 응답 시간이나 품질 우위는 측정되지 않았다. 따라서 제가 이 세션에서 실제 API로 원문을 보내 속도를 개선했다고 말할 수 없다. 키를 비공개 환경에 설정하고 역할 정책에서 provider/model을 명시하면 기존 호출 경로로 동일 입력을 비교할 수 있다. 원문 외부 전송과 API 비용은 그 호출에 수반된다. [계획 19.85](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1985-로컬-추론-지연과-openai-api-비교-관문), [런북 161](LOCAL_AI_NEWS_RUNBOOK.md#161-로컬-추론-지연과-api-비교-관문).

## 2026-10-01 Ollama 단계별 추론시간 표시

무결성이 확인되고 일일 원문 선택과 정확히 연결된 모델 영수증에서 Ollama의 로딩·입력 평가·생성 시간을 분리해 ms로 집계하고 prompt/output 토큰 수를 표시하도록 현황판을 보강했다. 미측정값은 `null`로 남겨 실제 0ms처럼 보이지 않는다. 회귀는 targeted status 12/12와 전체 `npm run test:garden` 482/482, Prettier, `git diff --check`를 통과했다. 비공개 현황판 SHA-256은 `654d5904ec9cf8e92bf6dde31daafbdc1a06bd21290e2d1e5132ed40df71f247`다. 최신 `daily-20261001-main26-integrated-v1`에는 연결된 모델 영수증이 없어서 해당 수집의 추론시간은 여전히 미관측이다. 실 API 키가 없어 OpenAI 전송·비용·비교는 수행하지 않았다. [계획 19.86](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1986-일일-모델-추론의-내부-위상-집계), [현재 빌드 55](LOCAL_AI_NEWS_CURRENT_BUILD.md#55-모델-추론의-로컬-단계별-시간-표시), [런북 165](LOCAL_AI_NEWS_RUNBOOK.md#165-로컬-모델-추론-위상-계측).

## 2026-10-01 Drive 원문·후보의 최신 증거 대조

현재 Drive 네 작성 루트의 Markdown 193개를 다시 readback하고 현재 작성 inventory의 파일 경로·SHA가 전부 일치함을 검증했다. 최초 reconciliation은 새 connector readback에서 193개 파일의 `parent_id` 필드가 빠져 중단됐다. 원본 receipt를 보존하고 각 파일의 단일 관측 `parent_ids`로 보완한 private normalized receipt와 source snapshot을 만들었으며, `pull-drive.py --verify-source-snapshot`이 193개를 통과했다. 이는 필드 정규화이지 Drive 원문 변경이 아니다.

`daily-20261001-main26-integrated-v1`의 handoff 114후보를 기존 사건 ID·canonical source URL로 대조한 결과 5건은 검증 사건에 exact match, 109건은 신규 사건 검토, 중복 source URL 그룹 0건이다. 109개 후보의 저장 source evidence를 추가 연결해 107개에서 582개 source version·818개 parse를 찾았고 2개 exact URL은 저장 capture가 없다. 비교 집계에서 동일 version의 내용 불일치 7건, 이전 version의 내용 불일치 23건 등은 원문 검토 항목으로 남겼다. 실행 검증 실패는 0건이다. 승인·병합·Drive 작성·공개는 수행하지 않았다. 전체 WBS는 이 부분 증거 작업만으로 변경하지 않는다. 상세 receipt와 분류는 [런북 166절](LOCAL_AI_NEWS_RUNBOOK.md#166-2026-10-01-최신-drive-원본-일일-후보-재대조)에 기록했다.

## 2026-10-01 기존 두 기사와 회차의 private 재작성 슬라이스

기존 source-reviewed TimesFM-3 및 Google Search Console/AI 검색 update approval 두 건의 `retrospective_review`가 현재 Drive 작성 원본과 고정한 issue SHA를 각각 확인한 뒤, 두 승인 run을 하나의 2026-09-01 회차 `preview`로 투영했다. 각 기사 발표/업데이트 일은 2026-08-31이고 Search의 첫 발표 2026-06-03과 갱신일을 구분한다. 두 사건 ID, 원래 회차 날짜와 모든 RSS GUID/pubDate 40쌍은 유지됐다. preview의 회차 HTML·뉴스 상세·digest·RSS를 `verifySite`로 확인했다(HTML 276·검색 문서 274·RSS 40). 작성 vault, Drive, public output에는 쓰지 않았다. 비공개 manifest SHA-256 `925b81f521e61b2d4830b8ee5a5215188be28b9948cf452f057df1a690502587`; 결과 회차는 [private preview](/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden/.local/research/local-ai/runs/20260901-retrospective-private-preview-20261001-v1/preview-workspace/public/briefings/2026/09/2026-09-01_0801_tech_ai_briefing.html)에서 확인한다. 권위 원본에서 나머지 기존 사건 검토, Drive 재읽기, 공개는 아직 남아 WBS 1/22 유지다. 상세는 [런북 167절](LOCAL_AI_NEWS_RUNBOOK.md#167-9월-1일-회차의-기존-두-기사-소급-재작성-미리보기).

## 2026-10-01 기존 14개 사건의 7회차 소급 preview와 용어 무결성 수정

8월 말 날짜 검토 14사건의 과거 원문 승인 중 현재 Drive 작성본과 동일한 source appearance SHA를 가진 기록을 확인해 7회차 private preview에 투영했다. RCT 기사 한 건이 현 canonical 용어 인덱스에 없는 ID를 사용해 새 immutable approval에서 해당 연결만 제거했다. 동일 event ID·기사 원문 근거·기존 회차 URL은 유지했다. preview 결과는 7회차·14사건, 276 HTML·274 search·RSS 40이며 기존 RSS 40개 `(guid,pubDate)` 쌍과 일치한다. manifest SHA-256 `0152f4afe6e5e028142e4ebbfad2a66302219db82684be0b1ada79a691cec85b`.

회차는 [비공개 미리보기](/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden/.local/research/local-ai/runs/20260825-20260831-retrospective-private-preview-20261001-v3/preview-workspace/public/briefings/2026/08/2026-08-28_0802_tech_ai_briefing.html)에서 확인할 수 있다. 원본 Drive/authoring vault/public output은 바뀌지 않았다. 전체 과거 자료 검토·Drive 왕복·실제 공개는 남아 있다. [런북 168절](LOCAL_AI_NEWS_RUNBOOK.md#168-8월-25~31일-소급-기사-묶음과-잘못된-용어-id-제거).

## 2026-10-01 다국어 후보의 기존 승인 근거를 온톨로지에 반영

두산로보틱스 국문·영문 후보는 이미 동일한 검증 승인 기사에 연결돼 있었지만, intake ontology가 approval receipt 결속을 확인하지 않아 같은 게시일 관계를 계속 검토 대기로 표시했다. projection이 두 후보 각각의 source version·parse·content hash와 공유 event/run/article SHA가 모두 맞는 경우만 `same_approved_event`로 나타내도록 했다. 다른 event ID 단독 일치나 불일치 증거는 계속 검토 대상으로 남는다. 온톨로지·현황판 회귀 20/20 및 전체 Node 503/503, TypeScript, 관련 포맷, diff 검사가 통과했다. 최신 private dashboard SHA-256은 `fc115d9d9095a4b81657ebdae4c47bac48ff02d4565e27b0ec2b5a21d603ed21`; review-required 관계는 0이고 전체 WBS는 1/22 완료로 유지한다. 기사 장부·공개 배포는 수정하지 않았다. [계획 19.101](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19101-공유-승인-증거를-다국어-온톨로지-검토-신호에-반영), [런북 187](LOCAL_AI_NEWS_RUNBOOK.md#187-공유-승인-증거와-다국어-온톨로지-검토-신호-정합성).

## 2026-10-01 MIT 기사 단일 원문 수직 슬라이스와 LLM/API 측정 경계

MIT News 단일 원문으로 source selection, parse, candidate-bound claim 추출, 원문 사실 검토, 한국어 기사 preview까지 실행했다. Multi-parse 추출이 listing의 무관한 기사를 후보 하나에 묶은 실패를 보존하고, exact source group/candidate key 없이는 다중 문서 추출이 진행되지 않는 fail-closed 검사를 구현했다. 로컬 Qwen 27B 추출은 211.5초, 기사 작성은 149.4초였고, 6개 claim을 원문과 다시 대조해 발언자 오귀속·quote 누락·추측성 확장을 고쳤다. 기관명과 분야 분류를 교정한 preview의 구조 문제는 0개다. [비공개 preview](/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden/.local/research/local-ai/runs/mit-muscle-robot-facts-selected-20261001-v2/preview.md).

이 실측은 원문을 확보한 뒤의 추론이 오래 걸린다는 근거다. 전체 daily collector latency의 원인이라고 일반화하지 않는다. OpenAI Responses API provider는 존재하지만 현재 환경에 `OPENAI_API_KEY`가 없어 API 호출·원문 전송·비용·속도 비교는 하지 않았다. 전체 Node 505/505, TypeScript, 관련 Prettier와 `git diff --check` 통과. 기사 승인, Drive/RSS/GitHub/사이트 변경 없음; WBS 1/22 유지. 1시간 이상 반복 정체 없음. [계획 19.102](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19102-실제-원문에서-수집-llm-출처검토-초안까지-한-수직-슬라이스), [런북 188](LOCAL_AI_NEWS_RUNBOOK.md#188-mit-원문에서-로컬-추론-시간과-openai-api-경계-확인).

## 2026-10-01 ABB–Liebherr 과거 parse mismatch 판정

ABB–Liebherr 네 과거 parse의 본문 절단 4행, Palladyne–FANUC 한 parse의 날짜 메타데이터 누락 1행, Doosan PalletizHD+ 한 parse의 제목·날짜 블록 중복 1행을 별도 판정했다. 현황 projection은 실제 source bytes, parse bytes/fingerprint/block 관계 및 approval receipt를 재검증해 3 adjudications·6 raw comparison rows를 읽기 전용으로 집계한다. historical reconciliation의 raw count는 감사 추적을 위해 유지하고 승인·후보·발행 데이터는 수정하지 않았다. status 회귀 13/13, private dashboard 생성 및 `git diff --check` 통과. 세부 증거와 receipt SHA는 [runbook 190](LOCAL_AI_NEWS_RUNBOOK.md#190-과거-원문-parse-불일치-판정-사례)에 기록했다. WBS P0-01은 나머지 후보·회차·지식 의존성 검토가 남아 partial이고 전체 1/22를 유지한다.

## 2026-10-01 MIT 로봇 기사 원문을 모델 개발 평가셋에 추가

MIT News 원문을 단일 source snapshot으로 고정해 7개 사실·금지 변환이 있는 `source_reviewed_candidate` 사례를 만들었다. 실제 Qwen 원시 추출 6 claims는 evidence structure 4/6, semantic full 4·partial 3·missing 0이며 raw model pass는 false다. 모델 출력에 노출된 Codex가 기준을 작성했으므로 독립 human gold나 heldout에 계산하지 않는다. 현재 평가 집계는 16/40 고유 개발 원문·104 facts·21 URLs; heldout 0/20·독립 human gold 0. evaluation/CLI 회귀 17/17, fixture invalid 0. 이 사례는 모델 실패를 speaker·인용·수치 근거와 함께 보존하는 개발 데이터이며 기사 승인·공개로 이어지지 않았다. [계획 19.103](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19103-mit-로봇-원문의-frozen-개발-평가-사례와-raw-model-판정), [런북 189](LOCAL_AI_NEWS_RUNBOOK.md#189-mit-원문을-개발-평가셋에-고정하고-모델-원출력을-판정).

## 2026-10-01 승인된 공식 대체 원문을 소급 source-evidence에 반영

후보의 기존 handoff에 대체 URL이 없더라도 고정 event ID·승인 run·source-alternative receipt·source bytes/parse/fingerprint가 모두 정확히 결속된 경우에 한해 원문 대조를 통과하도록 `candidate-evidence-review`를 수정했다. Reuters·CuttingRoom의 이전 `stored_source_or_parse_not_unique`가 `candidate_exact_source_and_parse`로 교정되어 109 후보 중 73 source attempts가 모두 exact로 확인됐다. 이 결과로 새 historical reconciliation도 고정해 782 source versions·1,037 parses와 무결성 실패 0을 기록했다. Targeted 6/6, 전체 Node 508/508, TypeScript, 코드 Prettier, diff 검증 통과. 후보 공개·Drive 쓰기·공개 변경은 없고 전체 WBS는 1/22, P0-01은 partial이다. 상세 receipt·한계는 [런북 191절](LOCAL_AI_NEWS_RUNBOOK.md#191-검토된-공식-대체-원문을-과거-handoff의-출처-대조에-연결)이다.

## 2026-10-01 ABB E-Device 과거 판본 parse 관계 재검증

ABB E-Device 승인 기사와 source-reviewed approval에 정확히 결속된 두 과거 판본 parse는 각 14개 block이 승인 15개 block의 정확한 ordered subset이다. 과거 원문 body SHA는 현재 승인판과 다르므로 판본 식별을 유지한다. 과거 HTML JSON payload에 있는 Marc Segura 인용 구절은 두 과거 parse에서는 빠지고 승인 parse에는 포함된 점을 보존된 bytes와 parse에서 확인했다. Immutable receipt SHA `588af54ae95ebc05fe5cd64ea2b54acadf4be6d3dc160e26f87d6a7fd5a1d58e`. P0-01 adjudication projection은 4개 receipts·8 raw rows·invalid 0이며 남은 ESA mismatch, ABB의 다른 parse, 전체 소급 검토는 계속 미해결이다. 후보·기사·Drive·공개 상태는 바꾸지 않았다. [런북 192절](LOCAL_AI_NEWS_RUNBOOK.md#192-abb-e-device-과거-판본의-부분집합-관계-판정).

## 2026-10-01 교차 판본 날짜 metadata 누락 검증 경로

Historical adjudication projection에 `prior_version_parse_metadata_gap` 유형을 추가했다. 서로 다른 source version이어도 기사 제목과 본문 block이 같고 과거 parse에 날짜만 없으며 양쪽 저장 원문 bytes에 날짜 metadata evidence가 있을 때만 유효하다. Fixture 통과. 실제 FDA PMTA 후보는 승인 receipt identity가 맞는 artifact를 확인하지 못해 adjudication으로 집계하지 않았으며 전체 row 수와 WBS는 그대로다. 전체 `test:garden` 508/508, TypeScript, 변경 코드 Prettier 및 diff 검사를 통과했다. [런북 193절](LOCAL_AI_NEWS_RUNBOOK.md#193-과거-원문-판본의-날짜-metadata-누락-분리).

## 2026-10-01 Ollama phase telemetry 실측

Ollama response `prompt_eval_duration` 누락을 provenance에 연결하고 phase별 계측 건수를 표시했다. 신규 비공개 ABB E-Device 단일 원문 추출은 129.2초(load 9.39초, prompt evaluation 13.03초, generation 106.76초)였고 budget receipt hash가 유효했다. 이 표본에서 주 병목은 출력 생성이다. 전체 `test:garden` 508/508, TypeScript, Prettier, diff check 통과. 후보 승인·Drive·공개 발행은 없고 WBS는 1/22를 유지한다. [런북 194절](LOCAL_AI_NEWS_RUNBOOK.md#194-로컬-모델-대기-시간을-load-입력-평가-출력-생성으로-분해).

## 2026-10-01 collector 프로세스 간 host 요청 조정

SourceFetcher가 같은 root의 별도 프로세스 사이에서도 호스트별 요청 간격을 지키도록 영속 host rate record와 lock을 추가했다. 별도 child process 동시 요청, 큰 간격 보존, runtime 회귀 `28/28`을 확인했다. stale lock은 자동 탈취하지 않고 명시 recovery를 요구한다. live source latency와 여러 root/worker 간 제한은 미검증이므로 P2-01·전체 WBS는 partial(1/22)이다. 1시간 이상 반복 정체 없음. [런북 195절](LOCAL_AI_NEWS_RUNBOOK.md#195-collector-프로세스-간-host-요청-간격-공유).

## 2026-10-01 redirect host와 robots 정책 적용

Redirect 각 단계에서 채널 허용 host와 대상 robots 정책을 확인하고 allowlist 밖 redirect·robots 거부·확인 실패 시 target 본문을 받지 않도록 했다. 합성 source→redirect→destination 정책 trace와 거부 사례, source-policy/runtime 회귀 `46/46`, 전체 `npm run test:garden` `512/512`, TypeScript, 변경 파일 Prettier 및 `git diff --check`를 통과했다. live route redirect/failure 분포는 검증 전이라 P2-01 및 전체 계획은 partial(1/22)이다. [런북 196절](LOCAL_AI_NEWS_RUNBOOK.md#196-redirect-목적지의-host-및-robots-정책-검증).

## 2026-10-02 redirect 정책 실제 출처 검증

GitHub Changelog의 저장 이력에서 관측된 URL을 private root에서 재검증했다. 301 redirect가 동일 route allowlist `github.blog` 안에서 목적지 robots 허용 후 통과했고 96,104-byte 기사 본문과 robots bytes가 각각 source receipt SHA와 일치했다. Nature 기사 URL의 303은 `idp.nature.com`으로 이동하려 해 기본 host 정책에서 차단됐다. source attempts에는 `www.nature.com` 요청만 있어 IDP 요청이 없었고 source 본문도 저장되지 않았다. 두 validation receipt는 별도 local run에 보존했다.

이 실물 사례는 허용·거부 두 경우를 확인하지만 전체 등록 출처의 redirect 통계는 아니다. P2-01 및 전체 WBS는 partial `1/22`; 후보 승인·Drive·RSS·GitHub·공개 배포는 수행하지 않았다. [런북 196절](LOCAL_AI_NEWS_RUNBOOK.md#196-redirect-목적지의-host-및-robots-정책-검증).

## 2026-10-02 인접 날짜 창의 single-page listing 재사용 구현

일일 실행기가 같은 route의 바로 앞 창이 성공했을 때 후속 `single-page` HTML 창에 기존 목록 attempt를 전달하도록 했다. 수신 측은 route 설정 fingerprint, 인접 날짜 경계, 15분 이내 관측, 원문 body hash, parse artifact를 검증한다. 목록 snapshot을 공유해도 후속 창의 상세 기사는 새로 취득·검증하고 날짜별 receipt/후보 구분을 유지한다. 테스트 24/24 통과. live 일일 재실행과 실제 시간 절감은 아직 미측정이고, WBS는 `1/22`, P2-01은 partial이다. [런북 198절](LOCAL_AI_NEWS_RUNBOOK.md#198-인접-단일-목록-날짜-창에서-원문-목록-재사용).

## 2026-10-02 로그인·구독 HTML을 원문 기사로 세지 않는 parser gate

HTML 200 응답에 로그인 벽이 반환되면 짧은 placeholder를 추출 성공으로 세지 않도록 worker parser를 보강했다. 제목, 인증 폼과 짧은 로그인 안내 조합은 blocked 처리하고, 충분한 기사 본문에 로그인 CTA가 공존하는 경우는 보존한다. Python worker 76/76, Node extraction/review 29/29, compile과 diff check가 통과했다. 실제 등록 출처의 false-positive/미검출률은 아직 측정하지 않아 P2-01과 전체 WBS는 partial이다. [런북 199절](LOCAL_AI_NEWS_RUNBOOK.md#199-html-200-로그인·구독-벽-차단).

## 2026-10-02 host 요청 lock 초기화 동시성 수정

두 collector 프로세스가 host lock file을 동시에 처음 열 때 owner JSON write 전 빈 파일을 parse해 수집을 실패시키는 race를 해결했다. 생성 직후의 짧은 malformed 상태만 polling하며 오래된 손상 lock은 자동 복구하지 않는다. 회귀 failure message가 child receipt를 표시하게 보강했다. 전체 Node 514/514, isolated Python worker 76/76, TypeScript·compile·format·diff check 통과. P2-01과 전체 WBS는 partial 유지. [런북 200절](LOCAL_AI_NEWS_RUNBOOK.md#200-동시-host-lock-초기화-race-복구).

## 2026-10-02 FDA 목록 재사용 callback과 canonical URL 실측

실물 영수증에서 인접 single-page 목록의 재사용 옵션이 production callback에 전달되지 않는 점을 확인해 연결했다. FDA의 두 번 redirect되던 목록 주소를 저장된 official final URL로 바꿨다. 새 live scan은 30.395초, 200/no redirect, robots 간격 30초, 빈 창 `window_scanned`였다. 앞선 같은 빈 창은 179.929초였지만 단발 실행 차이이므로 보장된 절감률로 보지 않는다. Targeted daily/list-scan test 25/25 통과. P2-01·전체 WBS는 partial 유지. 자세한 내용은 [런북 201절](LOCAL_AI_NEWS_RUNBOOK.md#201-fda-목록-재사용-연결과-redirect-제거).

## 2026-10-02 FDA 인접 창 목록 재사용 실물 검증

생산 daily executor와 source scanner를 결합한 테스트가 직전 완료 attempt를 `--reuse-listing-run`으로 전달하는 것을 확인했다. FDA 실제 연속 창 한 쌍에서도 source version·parse ID를 보존하며 후속 창이 fetch/parse 없이 0.165초에 완료됐다. 이전 목록 취득은 30.174초였다. 실제 29경로 일일 run에 대한 효과는 아직 검증하지 않았다. Focused 25/25, 전체 Node 515/515 및 TypeScript 통과. [런북 202절](LOCAL_AI_NEWS_RUNBOOK.md#202-fda-인접-날짜-창의-목록-실제-재사용-실행).

## 2026-10-02 29개 출처 통합 수집 및 무중복 재개 검증

활성 29개 route의 58개 window를 한 실행에서 모두 `window_scanned`로 완료했다. Wall span은 8분 48초, retry queue 0, incomplete window 0이다. Handoff의 전체 118개 후보 key 및 이번 실행에서 관측한 68개 key가 각각 고유하며 후보 공개·Drive·사이트 발행은 발생하지 않았다. 후속 `--resume`은 새 수집 없이 receipt-set SHA-256을 보존했다. 분야별 32칸 coverage는 아직 partial/not_attempted를 포함하므로 WBS 1/22, P2-01 partial은 유지한다. [런북 203절](LOCAL_AI_NEWS_RUNBOOK.md#203-29개-출처-통합-수집에서-계획실행재개의-live-검증).

## 2026-10-02 ABB GoFa 원문 대조와 기사 초안

ABB 공식 고객 사례를 보존된 source version/parse에서 검토해 5개 claim을 확인하고 2개를 보류했다. qwen3.8:27b 추출 189.681초, 기사 작성 128.492초였고 provenance상 generation 276.774초가 두 호출 wall의 약 87%다(9.18/8.07 tokens/s). 최종 draft는 자동 편집 검사 문제 0개다. 이미 승인 대기 중인 FANUC/Hitachi 중복 후보는 guard가 차단했다. ABB draft는 아직 공개 승인되지 않았다. OpenAI API adapter는 있으나 이 실행 환경에 `OPENAI_API_KEY`가 없어 성능 비교는 하지 않았다. API 전환은 외부 원문 전송과 별도 사용료가 수반되며, source collection 지연에는 직접 영향을 주지 않는다. [런북 204절](LOCAL_AI_NEWS_RUNBOOK.md#204-로봇업계-후보-한-건의-원문-검토와-육하원칙-기사-초안).

### 2026-10-06 NACHI 기존 회차 보완·공개 검증 완료

NACHI10월5일 승인 기사를 기존10월6일 회차에 추가했다(기존7개 보존, 로봇·제조4건). Drive213개 전후 raw 검증·변경1/기존ID 유지, cf3049f/Actions37464932439 Node1,011/Python15+10+3/build/site/deploy,12파일 공개 동등성·RSS40 GUID/pubDate 보존, 실제 HTTPS 데스크톱/모바일 태그·키보드·뒤로 가기, WebsiteData11raw SHA/링크 누락0을 확인했다. 새 모델 호출0·추가 로컬 전체suite0·릴리스 CI1회다. source closure와 delivery evidence는 비공개 Drive 원격 SHA/전수 복원까지 완료했다. 런북448/계획19.355/외장 core-progress-checkpoint-20261006-v10를 따른다. 전체목표 active/WBS2/22·신규정규0/7 및 전체legacy/독립human/08시 운영 gate는 남는다.

### 2026-10-06 원고 퍼센트 값·단위 관문 배포

문단별 verified 인용 사실 밖의 퍼센트, 다른 fact의 수치, %/%p 혼동을 신규 승인에서 차단한다. 원 NACHI 승인 원고는 통과했고 비공개17.9%변조는 차단됐다. 표적14+새 literal1개 및437d6e9/Actions37467094867 Node1,019·Python15+10+3/build/site/deploy를 확인했다. 기존 공개3파일 bytes/SHA는 동일하고 비공개 Drive 검사 증거11자료의 원격 SHA/전수 복원을 마쳤다. 새 모델 호출0·추가 로컬 전체suite0·새 기사/정규운영0. 지표·기간·인과·분류의 의미 판정은 기존 원문 검토로 확인한다. 런북449/계획19.356을 따른다. 전체목표 active/WBS2/22와 legacy/독립human/08시 운영 gate는 유지한다.

2026-10-06 두산 CEO 보완 완료: 기존 승인 원고·6검증 사실을 재사용해9/18선임 사건을9/20회차12→13기사로 반영하고 한국어 공식 공지를 같은 ID에 연결했다. Drive213 전후 raw/기존ID1업데이트·212불변, c5f83b3/Actions37470663227 Node1,019/Python15+10+3/build/site/deploy,12공개파일 동등성·RSS40/기존12 보존, 실제 HTTPS desktop/mobile 태그·키보드·뒤로가기, WebsiteData11raw/링크누락0과 source/delivery 비공개 Drive 원격ZIP SHA·전수 복원을 확인했다. 모델 재호출0·전체 로컬suite 반복0·정규 증가0. 런북450/계획19.357을 따른다. 전체목표 active/WBS2/22·정규0/7·전체legacy/독립human/08시/복구/fullruntime gate는 유지한다.

### 2026-10-06 PDF 출처별 제한과 browser 추가 탐색

공통 SourceFetcher의 profile budget을 일반·일일·검색 수집 경로에 적용하고 PDF21 profile/ABB첨부 rule에 제한값을 등록했다. redirect와304 cache에도 좁은 한도를 유지하며 실패는 유효 원문을 덮어쓰지 않는다. 실제 FANUC size 초과/cache 보존 및 ABB 공식 alternate 수집/parse를 확인했고, Chromium 같은 host 이동·iframe·popup을 즉시 차단했다. 새 수집기·유료 API·예약은 추가하지 않았다. 최초 표적74/78, 실패한 추가 탐색 수정4/4, live header 오류 수정 후 강화한 표적1/1. 통합 검증은 릴리스 CI한번, private source/실패/수정 증거는 런북451절로 연결한다. 두 구현 체크는 완료, 전출처 운영 통계·독립human·정규7회 등의 완료 조건은 유지해 전체WBS2/22/partial18/not_started2·새정규0/7이다.

후속 완료 증거: codef0cced5/Actions37475100558 Node1,027/1,027·Python28·build/site/deploy success. 공개3파일 SHA와RSS40GUID/pubDate가 그대로이며, source4개/parse2개 archive는 비공개Drive actual SHA/30members restore, delivery13자료는 actual SHA/15members restore/registry까지 확인했다. 전체로컬suite는 반복하지 않았고 코드릴리스CI는1회다. 진척판v14/전체2/22·정규0/7, 상세는 런북451절. 다음은 현재55route의 실제 통합 수집/운영 통계 검증이다.


2026-10-06 전체55경로 원문 실행·공통 보관: 110창 중106완료,52/55경로 완료,830원문관측·정책/redirect·실패 집계를 private status에 표시한다. 과거 좁은 경로 성공을 전체 통합 완료로 오인하지 않도록 scope를 검사한다. 5개 원문 closure를 private Drive에서 actual SHA/4090members 전수 복원하고106성공창을 다시 검증했다. 목록/중간 checkpoint raw BLOB 누락과 빈 창 archive 거부를 수정했다. 후보904→911/고유911·기존112 review_status/편집 필드 보존·재취득31후보 metadata 갱신. KUKA timeout3창/디일렉 인증20포함1창은 미완료다. 신규 기사 승인·정규 발행0, 전체WBS2/22 유지. 상세는 계획19.359/런북452, 다음은 공통 영구 오류 retry 분리다.

완료 증거: ff7de5b/Actions37482298032 Node1,034/1,034·Python28·build/site/deploy success. 공개3파일/40RSS 식별자 보존; source5archive4090members와 delivery220members를 private Drive actual SHA로 전수 복원·등록하고 delivery217inventory/49frozen refs를 확인했다. private 현황판1440/390px 탭/키보드 검증. 전체2/22·정규0/7 유지, 다음 공통 retry eligibility(인증/영구 실패 대기·일시 오류 제한 재시도). 런북452절.

2026-10-07 공통 retry eligibility 구현: queue/executor가 같은 persisted source/parse 원인 판정을 사용한다. 인증/접근 제한은새관측대기, 파싱/identity/예산 및mixed오류는수정필요, 일시서버/네트워크오류만2회상한으로재시도한다. actual디일렉20기사재요청0·기존원장보존, KUKA EN공식주간창복구/대조·DE timeout보존과동일API추가반복중지. 표적34중32통과·수정실패2통과·무결성추가1통과. 기존 source취득8files·browser2files SHA확인. 코드CI/Drive실물보관후P2-01원래완료조건을판정한다. 계획19.360/런북453.

후속 완료: b570db77/Actions37486354169 Node1,038/1,038·Python28·build/site/deploy success/공개3파일·RSS40보존. P2-01 원래11조건을원문/실패/정책/SHA·실제제한재시도와검사로대조해완료판정했다. 전체WBS3/22·partial17/not_started2, 정규0/7·195URL전수가용/전체일일현재runtime·독립human/legacy/08시·fullruntime는별도미완료다. private acceptance: P2-01-acceptance-v1.json. 원격보관·복원은런북453후속증거.


원격 보관 완료: source-retry-closure-20261007-v1은1018자료/1020ZIP members·12,898,384bytes·SHA344246897fa21565155b3b42d4e75f2d9a4b9ad149048d252d65c21e76b7bf24다. 비공개 Drive Research ID1-PREfyGmNHeGQDbioUB_YOdaF6hKIBmu의 actual metadata/shared=false·원격 raw SHA·전수1020members 복원·위치 등록을 확인했다. 복구 사본의 operator7파일 SHA와 원래4실패 원문 판정/EN supplemental 검증으로 DE2retryable·디일렉1새관측대기를 재현했다. 전체55경로 runtime 재개나 기사 승인/정규 발행을 뜻하지 않는다. CLI 복원은 root-relative package 계약으로 실행하며 최초 절대경로 요청 거부 후 root 아래 원격 ZIP 사본으로 수정했다. 닫힌 group/manifest는 추가 수정하지 않는다. 최신 진척판은 외장 tkg-daily-core-20261007-v1/core-progress-checkpoint-20261007-v1.json/html이며3/22·partial17/not_started2·정규0/7이다. 다음은 기존 원문 검토·원고 승인과 Drive/public 전달 연결을 계속한다.

2026-10-07 후속: 일일 수집 CrowdStrike 원문에서 Qwen 실제 추출 1회·근거 대조 2회·작성 1회, 직접 사실 13개 검토, 원고 승인, 후보 연결, 재사용 및 Drive 원격 복원을 완료했다. 사건 ID는 `28865e31f8cb281c`, 발표일은 10월 6일, 검토일은 10월 7일이다. 리드 3문장·222자와 설명 2항목·4문단으로 지원 내용과 일정을 정리했다. 반복 승인 시 장부 SHA가 같고, 완료된 원고 재사용에는 추가 모델 호출이 없었다. 현재 개발 평가 원문은 29개 판본·27개 고유 snapshot이며 독립 human/heldout은 0이다. 이 기사 공개와 작성 네 폴더 수정은 아직 하지 않았다. 전체 WBS 3/22·정규 0/7을 유지한다. 상세 계획 19.361·런북 454와 외장 `tkg-daily-core-20261007-v1/crowdstrike-*`를 참조한다.

최신 비공개 진척판: 외장 tkg-daily-core-20261007-v1/core-progress-checkpoint-20261007-v3.json/html. WBS3/22·partial17/not_started2를 확인했다. 데이터/문서 readback이며 추가 UI 동작 검증 또는 기사 공개가 아니다.


2026-10-07 편집 진행: KAIST·셀트리온·AWS·항우연의 원문 사실26개와 기사4건을 검토·승인했다. 기존 로봇·보안2건을 더한 private reader6건/위빙·Signals2노트의 생성·검증과 웹/RSS/GitHub 요약·링크 동등성을 확인했다. 실제 모델17호출은 완료됐고 같은 실패의1시간 반복은0이다. 원문 재수집 없이 parser recovery를 처리하는 공통 CLI와 정확한 후보/원문/날짜·관측시각·재개·변조 차단을 구현했다. 새4개 비공개 Drive ZIP의240members를 실제 원격 bytes로 복원하고 승인 결과 동일성을 확인했다. 실제 공개 회차·정규 성공은0이며, 전체3/22·legacy44/430/metadata10·독립human40/20·actual08시/복구 관문은 남는다. 구현 계획19.376/런북469를 따른다.
