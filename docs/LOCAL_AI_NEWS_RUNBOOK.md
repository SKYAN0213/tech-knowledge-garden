# 로컬 AI 뉴스 시스템: 현재 구현과 실행 가이드

최신 일일 로컬 수집 실행은 [68절](#68-github-월별-아카이브와-일곱-경로-일일-수집), 후보 장부 적용은 [64절](#64-배경-자료-판정의-후보-장부-기록), 최신 전체 비공개 사이트 사본은 [63절](#63-abb-dunia-고객-사례의-직접-검토와-비공개-소급)을 읽는다. 역할 정책·CLI 계약은 [44절](#44-역할-정책의-실제-cli-연결과-상세-문서-갱신), 날짜 구현·수집 증거는 [41절](#41-날짜-파싱-구현과-문서-인계-기준의-갱신)에 남아 있다. 앞선 시험 기록은 당시의 범위와 결과를 보존한다.

작성·검증 기준일: 2026-09-29. 이 문서는 개발자·운영자용이다. 독자 기사·RSS에 삽입하는 안내문이 아니다.

현재 구현은 **원문 취득 → 파싱 → 로컬 사실 추출 → 직접 근거 검토 → 한국어 초안 → 정정/편집 승인 → 기존 기사 형식과 전체 사이트의 비공개 결과**까지다. 기존 용어·누적 주제의 비공개 교체 승인과 과거 기사 날짜 정정도 연결했다. 기존 공개 발행 경로는 유지한다. 새 경로의 전체 자료 재조사, 독립 Drive 쓰기·재읽기, 7회 비교 운영 및 운영 전환은 완료되지 않았다.

전체 목표와 편집 원칙은 [시스템 설계](LOCAL_AI_NEWS_SYSTEM.md), 출처·본문·표의 목표 계약은 [수집·파싱 명세](SOURCE_ACQUISITION_SPEC.md), 남은 작업의 순서·완료 조건은 [구현 계획](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md)을 따른다. **이 문서는 현재 코드의 실행 범위**, 다른 세 문서는 목표 범위를 함께 설명한다.

## 1. 상태를 읽는 기준

| 구분           | 필요한 증거                                 | 현재 상태                                                                    |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 코드 존재      | 실제 파일과 공개 함수·호출 경로             | 아래 모듈 구현                                                               |
| 단위·회귀 검증 | 실제 실행한 테스트·로그                     | 39절의 전체 Node407/tsc; 후속 날짜 Node45·worker40·Python 전체55는41절       |
| 실제 원문 시험 | 원 URL·버전·본문·구간·실행 결과             | FANUC/UR·세 심층·다국어·Google·Microsoft/NVIDIA·Markdown/논문 날짜           |
| 실제 검색 시험 | 실행 서비스·질의 원출력·엔진별 결과         | 분야32 + 제조사30의62질의·682관측/642고유후보;62질의 일부 엔진 오류          |
| 모델 시험      | 실제 로컬 호출·digest·설정·원출력           | 추출/집필·Qwen/Gemma 비교·장문/Google 사례; 원출력 오류 보존                 |
| 편집 검토      | 원문·문장·수치·날짜를 읽고 기록             | 추가 과거 사건9개 private 판정;12기사/8과거회차/15노트 통합; Codex 직접 검토 |
| 공개 발행      | Drive 재읽기·배포·웹/RSS/GitHub 대조        | 신규 경로 미실행                                                             |
| 운영 전환      | 60건 평가·서로 다른 실제 7회 비교·복구 시험 | 미완료                                                                       |

테스트의 fixture·가짜 서버 응답은 실패 경로를 재현하는 용도다. 실제 원문 수집·검색·Drive·배포 성공과 구분한다. 코드의 `verified`는 명시적인 검토 결정을 보관하는 상태이며, boolean이나 파일 생성만으로 실제 검토 행위가 증명되지는 않는다. 이번 비공개 사례의 검토자는 Codex의 원문 직접 검토이며 사람의 독립 평가로 계산하지 않는다.

### 1.1 보존한 기준선

| 항목                | 기준선                       | 해석                                           |
| ------------------- | ---------------------------- | ---------------------------------------------- |
| 공개 작성 원본      | 181 Markdown                 | Editions·Knowledge·Signals·TrendTopics 네 폴더 |
| Drive 대조          | 181개 전문 재읽기, 차이 0    | 이번 기준선과의 일치; 이후 수정은 다시 대조    |
| 브리핑 회차         | v2 26개 / 구형 92개          | 구형을 전체 재검토 분모에서 빼지 않음          |
| v2 고유 사건        | 87개                         | 여러 회차 등장과 사건 수를 분리                |
| 기존 검증 완료 사건 | 73개                         | 신규 로컬 모델이 검증한 73개라는 뜻이 아님     |
| 소급 검토 잔여      | 원본 v2미검토14 / 구형92회차 | 아홉 private 판정 후 잔여5; 원본 상태 유지     |
| 네 폴더의 URL 목록  | 618개                        | 과거 Sources 보관 목록 전체와 다른 분모        |
| RSS 식별자          | 40개 GUID·pubDate 목록       | 수정 전후 보존 확인에 사용                     |

기준선 위치는 `.local/research/local-ai/baselines/20260927-initial/`이다. `inventory.json`에 경로별 SHA-256·회차·기사·원문·RSS 목록을 기록하고 `vault/`에 복구 사본을 둔다. Drive 전문 읽기·대조 결과는 같은 폴더의 비공개 파일로 보존한다. 이번 후보 시험은 공개 작성 원본을 변경하지 않았다.

## 2. 실행환경과 의존성

| 구성          | 확인 버전·설정              | 역할                                               |
| ------------- | --------------------------- | -------------------------------------------------- |
| 장비          | Apple M4 Pro / 64 GiB       | 우선 사용하는 기존 장비                            |
| Node          | 26.4.0; package 요구 >=22   | HTTP·작업 상태·모델·기사 변환                      |
| 기존 Python   | 3.9.6                       | 기존 Drive 보관·동기화 코드                        |
| worker Python | 3.12.14                     | 격리 venv의 HTML/PDF/OCR                           |
| Trafilatura   | 2.2.0                       | HTML 본문·제목·표·메타데이터                       |
| PyMuPDF       | 1.27.2.3                    | PDF 페이지·좌표·네이티브 표                        |
| Playwright    | 1.63.0 / Chromium 빌드 1243 | 필요한 페이지의 비공개 렌더                        |
| RapidOCR      | 3.9.2                       | 텍스트가 부족한 페이지만 OCR                       |
| ONNX Runtime  | 1.30.0                      | 로컬 OCR 모델 실행                                 |
| Ollama        | 0.34.4                      | 설치된 모델의 로컬 추론                            |
| SearXNG       | 2026.9.25+12f8b65           | 격리 서비스 시작·실제 검색·소유 프로세스 종료 시험 |

worker 의존성의 버전 원본은 [requirements.txt](../integrations/research-worker/requirements.txt)다. Docling·외부 벡터 DB·새 웹 프레임워크는 도입하지 않았다. SearXNG는 위 requirements와 별도로 공식 저장소의 commit `12f8b6515ca77c3c3bc1498584950ef5daca1433`을 private runtime에 설치했다. 신규 장비의 일괄 설치·복구 스크립트는 아직 없다.

### 2.1 격리 환경 재현

다음은 환경이 없는 작업 사본에서의 설치 절차다. 기존 venv를 이유 없이 다시 만들지 않는다. 시스템 Python을 교체하지 않는다. Chromium과 OCR 모델은 처음 준비할 때 다운로드가 필요하다.

```bash
cd /Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden
"/Users/shinjh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" -m venv .local/research/local-ai/runtime/venv
.local/research/local-ai/runtime/venv/bin/python -m pip install -r integrations/research-worker/requirements.txt
.local/research/local-ai/runtime/venv/bin/python -m playwright install chromium
.local/research/local-ai/runtime/venv/bin/python -m pip check
```

현재 호스트의 `python3`는 3.9.6이다. 첫 명령은 이번 설치에 사용한 Codex 번들 Python 3.12.14의 실제 경로다. 다른 장비에서는 해당 경로를 그 장비에서 확인한 3.12 실행파일로 대체한다. 패키지 설치 성공과 다른 환경의 재현 성공을 구분한다. worker가 네트워크를 차단하므로 OCR 모델을 먼저 로컬에 준비하고 네트워크 없이 파싱하는 시험을 통과시킨다.

Node worker 어댑터는 기본적으로 `<root>/runtime/venv/bin/python`을 찾는다. 기존 격리 환경을 다른 private root에서 재사용하면 `RESEARCH_PYTHON`에 실제 실행파일 경로를 지정한다. `runtime/`와 브라우저·모델 캐시는 Drive 연구 묶음이나 공개 Git에 넣지 않는다.

GitHub Pages의 두 workflow는 private `.local/` venv를 checkout하지 않는다. HTML 파서 통합 시험을 실행할 때만 Python 3.12에 `trafilatura==2.2.0`을 설치하고 `RESEARCH_PYTHON=python`으로 그 실행파일을 명시한다. 이 설치는 실제 PDF·OCR·브라우저 수집 환경을 구성하거나 일일 기사를 발행했다는 뜻이 아니다.

### 2.2 로컬 검색 서비스의 현재 수명주기

`search` 명령은 `SEARXNG_URL`이 없으면 자신이 소유하는 SearXNG 프로세스를 필요할 때 시작하고 실행 뒤 종료한다. 영구 서비스나 새 예약을 등록하지 않는다. 외부 인터넷에는 검색 질의와 원문 요청이 전송되지만 기사 작성의 모델 호출은 로컬 Ollama로 전달한다. 로컬 추론과 네트워크 없는 뉴스 탐색은 다른 개념이다.

| 순서 | 현재 동작                  | 기록·실패 처리                                                              |
| ---- | -------------------------- | --------------------------------------------------------------------------- |
| 1    | `search-service` 잠금 확보 | 다른 검색 실행과 동시에 포트를 사용하지 않음                                |
| 2    | private 설정 생성·검사     | `runtime/search/config-8888.json`, 권한 0600; 실제 secret은 출력하지 않음   |
| 3    | Python 검색 worker 시작    | 기본 `127.0.0.1:8888`; 독립 사용자 프로필·외부 공개 바인딩 없음             |
| 4    | 준비 상태 확인             | `/tkg-healthz`의 owner·PID·설정 해시가 자신이 시작한 프로세스와 일치해야 함 |
| 5    | 질의를 순차 실행           | JSON 결과와 엔진 오류를 별도로 보관                                         |
| 6    | 정상·실패 모두 종료        | SIGTERM 후 최대 3초, 필요할 때 소유 프로세스에 SIGKILL                      |
| 7    | 종료 receipt 보관          | `registry-state/search-service.json`; 정상 종료는 `state=stopped`           |

허용 엔진은 Google·Bing·DuckDuckGo·Naver·Wikipedia의 다섯 이름으로 고정했다. 이 설정은 유료 키 사용이나 모든 엔진의 성공을 의미하지 않는다. `public_instance=false`, debug 비활성, JSON 활성, autocomplete 비활성을 검사한다. 설정 파일을 예시 출력·Drive 묶음·공개 Git으로 복사하지 않는다. 엔진 장애·CAPTCHA가 있으면 해당 엔진의 실패를 유지하고 유료 서비스로 자동 전환하지 않는다.

`SEARXNG_URL`을 명시하면 이미 준비된 localhost 서비스에 연결하며 그 서비스를 임의 종료하지 않는다. HTTP loopback 주소만 허용하고 응답 리다이렉트는 거부한다. 서비스의 준비 제한은 기본 20초, 엔진 요청 제한은 12초, 검색 API 요청 제한은 20초다. 부모 프로세스의 강제 종료·Mac 재부팅 뒤 잠금/자식 프로세스 복구는 P5의 추가 검증 대상이다.

### 2.3 현재 모델 호출 설정

모델명·지원 think 값은 매 실행 메타데이터를 읽어 확인한다. 아래 값은 현재 코드의 기본값·명시값이며 역할별 최종 선정 결과가 아니다.

| 작업             | 현재 코드·호출                | think                                  | 문맥      | 기록·후속 개발                                          |
| ---------------- | ----------------------------- | -------------------------------------- | --------- | ------------------------------------------------------- |
| 분야32질의 생성  | `searchQueries`·queries       | false                                  | 16,384    | 모델 원출력·지역/축/언어 검증; low 비교는 미완료        |
| 현지어 보완      | `localizeQueries`·언어별 호출 | false                                  | 8,192     | 해당 언어의 잘못된 칸만 처리; 정확한 회사명/ID 유지     |
| 제조사30질의     | `manufacturerSearchQueries`   | 모델 호출 없음                         | 해당 없음 | 정확한 이름·언어·날짜로 구성; 뉴스 사실을 생성하지 않음 |
| 사실 추출        | `extractClaims`·extract       | 기본medium; 실제 예시는`--think false` | 16,384    | 3–6개 사실·근거; medium300초 timeout 기록 보존          |
| 한국어 집필      | `writeDraft`·draft            | false                                  | 16,384    | 검토한 사실만 입력; 필요한 설명과 문장별 claim 참조     |
| 과거 기록 임베딩 | 설치 모델만 확인              | 해당 없음                              | 미측정    | 운영 조회·메모리/속도 평가와 연결은 미완료              |

Ollama 어댑터 기본은 `num_predict=4096`, `temperature=0`, `stream=false`, `keep_alive="5m"`이다. keep_alive는 모델 메모리 상주 설정이며 검색 서비스 수명과 별개다. 요청 실패·출력 종료 상태·JSON Schema·지원 think 타입을 검사한다. 어댑터는 단일 요청이 문자/문맥 예산을 넘으면 오류로 종료한다. 사실 추출기는 호출 전에 전체 원문을 문단 경계로 나눠 모든 요청을 계획하며 [수집·파싱·추출 예산](#73-수집파싱사실-추출)에 따른다. 문맥을 넘는 원문을 조용히 잘라 전문 검토로 표시하지 않는다.

`--think`는 현재 extract CLI에만 노출되어 있다. num_ctx/num_predict/temperature/keep_alive와 역할별 설정을 일반 옵션 파일로 외부화하는 것은 P3-01 작업이다. 문서의 추천low/medium/xhigh를 현재 모든 명령의 옵션처럼 안내하지 않는다. 서버의 `OLLAMA_NO_CLOUD` 실제 활성 상태와 최대 메모리·스왑·하루 처리량은 별도로 확인해야 한다.

## 3. 현재 모듈과 코드 경계

| 실제 코드                                                                                                            | 현재 구현                                                                        | 남은 범위                                      |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| [research.mjs](../scripts/research.mjs)                                                                              | 명령·run ID·수집/검토/초안/승인 JSON 연결                                        | 일일 회차 구성과 기존 08시 호출 연결           |
| [contracts.mjs](../scripts/research/contracts.mjs)                                                                   | ID·상태·사용 스키마 필드 검사                                                    | 전체 목표 계약 fixture·마이그레이션            |
| [run-state.mjs](../scripts/research/run-state.mjs)                                                                   | 원자적 저장·입력 해시·lock·stage journal                                         | 공통 발행 잠금·원격 상태 재개                  |
| [baseline.mjs](../scripts/research/baseline.mjs)                                                                     | 네 원본 폴더·v2/구형·RSS 목록·복구본                                             | 전체 구형 사건 전환·근거 재검토                |
| [discovery.mjs](../scripts/research/discovery.mjs)                                                                   | 기존 경로 재사용·후보·32칸·backlog 병합                                          | 날짜/페이지네이션·원출처 계열·전 제조사 활성화 |
| [robots.mjs](../scripts/research/robots.mjs)                                                                         | allow/disallow·UA·crawl-delay·동시 요청 공유                                     | 출처별 정책·공시 제한의 실제 회귀검증          |
| [source-policy.mjs](../scripts/research/source-policy.mjs)                                                           | 직접 원문·브라우저 요청의 robots 확인과 실패 차단                                | 호스트별 지연 격리·출처 이용 조건 검토         |
| [api.mjs](../scripts/research/api.mjs)                                                                               | Crossref·SEC JSON의 후보 링크 변환                                               | 실제 경로 등록·호출·DART 등 추가               |
| [search.mjs](../scripts/research/search.mjs)                                                                         | 분야32칸·제조사별30질의·언어별 보완·v1/v2검증·질의별 재개                        | 후속 질의·질의 품질·원출처 검토                |
| [search-runtime.mjs](../scripts/research/search-runtime.mjs), [search.py](../integrations/research-worker/search.py) | private 서비스 설정·준비 검사·종료·receipt                                       | 설치 재현·강제 중단/재부팅 복구                |
| [fetch.mjs](../scripts/research/fetch.mjs)                                                                           | DNS/IP 검사·조건부 요청·원문 버전·예산                                           | 전 출처 실물 검증·일부 일시적 네트워크 재시도  |
| [parser.mjs](../scripts/research/parser.mjs)                                                                         | JSONL worker·해시·UTF-8·시간 제한                                                | 메모리 상한·큰 문서의 구간 재개                |
| [worker.py](../integrations/research-worker/worker.py)                                                               | HTML·PDF·표·선택적 OCR·본문 위치                                                 | 복잡한 병합 표·다국어 OCR 평가                 |
| [browser.mjs](../scripts/research/browser.mjs), [browser.py](../integrations/research-worker/browser.py)             | 브라우저 요청을 공통 Node 수집기로 중계                                          | 동적 전용 출처·페이지네이션 회귀검증           |
| [ollama.mjs](../scripts/research/ollama.mjs)                                                                         | 로컬 메타데이터·Schema·think 검사·측정                                           | 서버의 로컬 전용 설정·처리량 평가              |
| [claims.mjs](../scripts/research/claims.mjs)                                                                         | 근거 재검사·정정 스키마·실제 boolean·달력/순서·정확한 사실/parse 검토 해시       | 실제 의미 검증·60건 평가                       |
| [editor.mjs](../scripts/research/editor.mjs)                                                                         | 한국어/심층 스키마·리드·설명·분석·태그·문장 근거·correct CLI                     | 실제 심층 품질 개선·독립 평가                  |
| [deep-dive.mjs](../scripts/research/deep-dive.mjs)                                                                   | 심층3형식 근거 역할·전문/관계/비교 날짜·검토 해시·공개 필드 분리                 | 추가 실제 사례·모델 원출력 개선·독립 검토      |
| [publish-adapter.mjs](../scripts/research/publish-adapter.mjs)                                                       | 승인 기사·전체 기존 회차 투영·기사/분류/날짜·본문 계약 보존                      | Drive·일일 새 회차·발행 호출                   |
| [preview.mjs](../scripts/research/preview.mjs)                                                                       | 승인/근거 재검사·전체 private 작업 사본·기존 생성/검증·웹/RSS/digest 대조·재개   | 실제 지식 정정·Drive·공개 배포와 연결          |
| [note-review.mjs](../scripts/research/note-review.mjs)                                                               | 기존 Knowledge/Signals/TrendTopics의 근거·원본 해시·별칭·일자 검사와 비공개 승인 | 새 용어 생성·전체 의존 관계 정정·Drive 보관    |
| [knowledge-links.mjs](../scripts/research/knowledge-links.mjs)                                                       | 검토 용어 연결·논문/인물 검토·정정 영향                                          | 실제 Knowledge/Signals/TrendTopics 갱신        |
| [archive.mjs](../scripts/research/archive.mjs)                                                                       | 과거 Sources 호환 가져오기·자기 manifest 제외·해시 묶음                          | 전체 가져오기·실제 Drive 왕복·보관 예산        |
| [promotion.mjs](../scripts/research/promotion.mjs)                                                                   | 비교 회차의 평가 관문·중복 횟수 방지                                             | 실제 7회 비교와 운영 전환                      |
| [prepare-drive.py](../scripts/prepare-drive.py)                                                                      | 신규 원문/실행 자료의 private staging 연결                                       | 해당 새 묶음 업로드·원격 전문 검증             |

코드의 존재는 표 오른쪽 목표의 완료를 뜻하지 않는다. 모델 응답을 publish로 전달하는 자동 승인 경로는 없다. 브라우저 렌더와 API 변환도 명령의 주 경로에 자동으로 전부 연결된 상태가 아니다.

## 4. 저장 구조와 ID

```text
.local/research/local-ai/
  baselines/<id>/          원본 목록·해시·Drive 대조·복구 사본
  documents/<source-id>/<body-hash>/
    body.bin              확보한 응답 본문
    document.json         해당 버전·URL·해시·MIME·관측 시각
  parses/<parse-id>/parse.json
  renders/<render-id>/    브라우저 결과와 원래 문서의 연결
  registry-state/        최신 캐시·조건부 요청·과거 원문 매핑
  runs/<run-id>/          수집·추출·검토·초안·비공개 승인 결과
  locks/                 owner·PID·시작 시각
  runtime/               venv·도구 설치; 연구 보관 대상에서 제외
```

기존 `.local/research/candidate-backlog.json`을 후보의 지속 목록으로 유지한다. 새 `runs/` 후보는 이번 실행 결과이며 또 다른 지식 원본이 아니다. 공개 원본은 기존 네 폴더, 최종 보관은 Drive의 `Projects / Tech Knowledge`다.

| ID                  | 현재 생성·보존 규칙                                            |
| ------------------- | -------------------------------------------------------------- |
| `source_id`         | 최초 URL 문자열의 SHA-256 앞 20자리; 기존 prepare-drive와 동일 |
| `source_version_id` | source ID와 확보 본문의 해시 연결; 동일 버전 재사용            |
| `parse_id`          | 원문 버전·파서/설정·worker 코드 해시·계약을 반영               |
| `block_id`          | parse ID 안의 구간; 본문 해시·위치와 함께 저장                 |
| `claim_id`          | 사실·근거 등을 해시; 수정 시 이전 ID를 남김                    |
| `draft_id`          | 공개 초안 객체의 SHA-256; 승인 후 변경을 거부                  |
| `event_id`          | 기존 16자리 기사 ID; 제목·URL 정정으로 재발급하지 않음         |
| `run_id`            | 운영자가 명시하는 비공개 실행 ID; 브리핑 회차와 별개           |

URL 정규화에 의한 후보 중복 제거와 기존 source ID 보존은 다른 처리다. 언어판 URL 두 개가 한 사건일 수도 있고 같은 URL에 여러 사건이 있을 수도 있다. 기사 병합은 확인한 관계로 결정한다.

## 5. 원문 발견과 수집 정책

### 5.1 출처 범위

최초 registry는 source channels24개와 중복URL을 제외한 watchlist 시작47개에서71경로였다. 이71경로의 ID/URL을 보존하고 제조사15·공식 경로27개를 추가 연결해 현재 전체92경로다. 회사 추적 자리·기관 목록·원문 수·경로 수는 다르다. FANUC 영일 상세·MIT 상세·HD목록에는 실제 확인한 규칙을 추가했다. 모든 경로의 페이지네이션·정상 최신 문서·첨부까지 활성화 검증을 완료한 것은 아니다.

계속 조사할 축은 다음과 같다.

- 8개 분야 × 국내/해외 × 기술·제품/기업·운영의 32칸.
- 공식 뉴스룸·제품 사양·고객 도입·부품사·시스템 통합사·IR·공시.
- 산업 전문지·지역 매체·협회: 사건 발견 후 원발표로 추적.
- 논문 전문·학회·대학·연구실·TLO·회사: 저자·자문·기술이전·공동창업 구분.
- 한국어·영어·일본어·중국어·독일어 검색과 현지어 원문.

로봇 관심 범위는 HD현대로보틱스·두산로보틱스·FANUC·KUKA·ABB·야스카와·가와사키·나치·Universal Robots·Techman·레인보우로보틱스·ESTUN·EFORT·JAKA·AUBO다. 기존8개 분야를 로봇 조사로 교체하지 않는다. 15제조사의 등록된27경로 요청은 수행했고23partial·4failed·166미검토 후보를 얻었다. 본문/날짜/첨부/페이지 종료 검토는 경로별로 이어간다. [제조사별 실물 결과](SOURCE_ACQUISITION_SPEC.md#341-실제-등록목록-시험과-다음-파서-작업)를 참조한다.

소유·별칭·전재 계열의 판별은 아직 완성하지 않았다. 현재 일부 `publisher_id`는 호스트명 또는 watchlist ID다. 여러 사이트가 같은 보도자료를 인용한 경우를 독립 근거로 계산하려면 원출처 계열 확인을 추가한다. 현재 32칸 집계는 시도 없음 `not_attempted`, 이용 가능한 결과 없음 `failed`, 일부 발견 결과 있음 `partial`로 구분하고 `failed_route_ids`와 `usable_route_count`를 함께 기록한다. `partial`도 개별 기사 본문 검토 완료는 아니다. 이전 실행의 coarse 집계 파일을 새 코드로 성공 상태처럼 덮어쓰지 않는다.

### 5.2 현재 실행 예산

| 항목               | 현재 값·동작                                               |
| ------------------ | ---------------------------------------------------------- |
| 동일 호스트        | 동시 1개, 요청 간격 기본 3초; robots 지연 반영             |
| 발견 실행          | 서로 다른 경로를 최대 4개씩 처리                           |
| 개별 HTTP          | 기본 20초; 리다이렉트 최대 5회                             |
| 429/5xx            | 최대 3번 시도; Retry-After 대기 상한 60초                  |
| 네트워크 연결 오류 | 현재 오류 기록; 모든 일시적 오류 자동 재시도는 미구현      |
| 본문 크기          | HTML/API 10 MiB / PDF 50 MiB; 수신·해제 후 한도 검사       |
| 파서               | 기본 120초; 출력 20 MiB 제한; 별도 OS 메모리 상한 미구현   |
| PDF                | 최대 200페이지; 초과 자료의 페이지별 재개는 미구현         |
| 브라우저           | 60초 / 요청 최대 80개                                      |
| 경로·검색 후보     | 현재 경로당 최대 25개; 전체 페이지 수집 완료라는 뜻이 아님 |
| 모델               | 기본 호출 300초 / 생성 최대4,096 토큰; 추출6옵션은7.3절    |

외부 수집은 HTTP/HTTPS·표준 포트·자격 증명 없는 URL만 허용한다. DNS 결과 전체와 실제 연결 IP를 검사하고 선택한 주소로 연결한다. 사설·loopback·link-local·일부 특수 주소는 거부한다. 리다이렉트도 다시 검사한다. 크기나 예산 초과는 성공 본문으로 저장하지 않는다. 압축 본문 해제 한도와 아카이브의 파일 수·압축비·중첩 제한은 다른 문제이며 후자의 전체 정책은 아직 목표다.

채널 탐색, 직접 `collect`/`extract`, 브라우저 하위 요청에서 robots를 확인한다. 직접 경로는 `fetchWithPolicy`를 사용하며 정책 거부는 `fetch_status=blocked`, `policy_status=denied`, 정책 읽기 실패는 `policy_status=failed`로 남긴다. 두 경우 모두 기사 요청을 하지 않고 source version을 만들어 성공으로 표시하지 않는다. 저장한 robots 본문은 512 KiB 한도와 SHA-256으로 검사한다. HTTP 404인 robots는 빈 규칙으로 처리하지만 손상·읽기 오류와 혼동하지 않는다. 리다이렉트 목적지의 주소/IP 검사는 수집기가 수행하지만 목적지별 robots까지 새로 검사하는 통합은 추가 검증·개발 대상이다. robots 확인은 사이트의 모든 이용 조건을 검토했다는 뜻은 아니다.

### 5.3 HTML·PDF·OCR·브라우저

HTML은 제목·본문 문단·소제목·표/행·첨부 후보·날짜 메타데이터를 추출한다. 원 DOM의 정확히 일치하는 구간이 유일할 때 XPath를 남기고, 아니면 추출 순서·본문 해시로 위치를 식별한다. 존재하지 않는 정밀 DOM 위치를 만들어 넣지 않는다. 로그인·차단 화면을 기사의 본문 성공으로 처리하지 않는다.

PDF는 페이지와 본문 좌표, 네이티브 표를 보존한다. 텍스트가 부족하거나 깨진 페이지만 로컬 OCR을 수행한다. 낮은 OCR 신뢰도는 검토 대기로 표시하고, 인식률을 수치 정확성의 증거로 삼지 않는다. 스캔 표의 병합 셀 구조·각주·음수·통화·기간은 사람이 원문과 대조해야 한다. 복잡한 표 전체의 자동 구조 복원은 아직 검증하지 않았다.

브라우저는 별도 사용자 프로필 없이 실행한다. 하위 GET 요청은 Node의 동일 수집 정책으로 중계하고 로컬 파일 해시를 확인해 응답한다. POST·이미지/미디어/폰트·WebSocket·비HTTP 요청을 제한하고 Service Worker를 막는다. 렌더 결과에는 원래 원문 버전과 별도의 렌더 ID를 남긴다. 이 정책이 로그인이 필요한 동적 사이트를 지원한다는 뜻은 아니다.

발표일은 원문 메타데이터나 검증한 날짜 선택자에서 가져온다. HTTP Last-Modified·관측일·파일명·검색 스니펫 날짜를 발표일로 채우지 않는다. FANUC 영어 상세와 Universal Robots Gen 7 발표의 XPath·정규식·형식은 [research-acquisition.json](../data/research-acquisition.json)에 있다. HTML 날짜 후보의 달력 유효성과 일자 일치를 확인하며 충돌하면 후보·위치를 보존하고 발표일은 null로 남긴다. 같은 일자의 서로 다른 시각 후보는 일자 정밀도로 낮춘다. 다른 사이트·일본어판·기사 승인 시점 검사는 별도 보강 대상이다.

## 6. 로컬 모델과 추론 설정

### 6.1 운영 모델 후보

| 작업                         | 시작 후보                       | 추론 설정                | 판단 방법                                                        |
| ---------------------------- | ------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| 검색 질의·원문 사실 추출     | `qwen3.8:27b`                   | 현재 시험은 false        | 질의 다양성·날짜/계획/수치 오류·실제 시간                        |
| 한국어 기사·설명             | `qwen3.8:27b`                   | false                    | 원문과 대조, 반복·고유명사·문장 근거 확인                        |
| 충분한 근거의 모순·전략 비교 | 같은 모델                       | low/medium 평가 예정     | 오류 탐지율과 추가 시간 비교; 자료 부족을 추론으로 보충하지 않음 |
| 비교·회귀 모델               | `qwen3.6:27b`, `gemma4:31b-mlx` | 설치 메타데이터의 지원값 | 같은 원문·프롬프트·스키마·조건으로 시험                          |
| 과거 기록 검색               | `qwen3-embedding:8b`            | 해당 없음                | 후속 후보 탐색; 관계·동일성 확정에는 사용하지 않음               |

위 이름은 **현재 호스트에서 확인한 설치 태그**이며 타 장비에서 동일 모델이 제공된다는 보장이 아니다. Qwen3.8은 27.3B/Q4_K_M, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`이다. 현재 지원값은 boolean false와 문자열 low·medium·xhigh다. Codex의 high를 그대로 전달하지 않는다. 태그·digest·프롬프트·설정이 바뀌면 다시 평가한다.

실제 어댑터는 `/api/version`, `/api/tags`, `/api/show`를 읽고 설치·digest·completion·think 값을 검사한다. `/api/chat`에 `format: schema`, `stream: false`, temperature 0을 사용하며 불완전·잘린 JSON·예상 밖 도구 호출을 거부한다. 지원값 판별과 구조화 출력은 [Ollama Chat API](https://docs.ollama.com/api/chat), [구조화 출력](https://docs.ollama.com/capabilities/structured-outputs)의 계약에 따른다.

기본 문맥은 8,192이며 사실 추출·작성은 현재 16,384를 사용한다. 사실 추출은 실제 messages/schema의 보수적 문자 한도를 검사해 전체 문단 단위로 묶음을 만든다. 모든 원문 구간을 한 번씩 포함하고 원래 ID·해시·순서를 보존한다. 한 문단 자체가 한도를 넘으면 명시적 재파싱을 요구하며 잘라서 성공으로 처리하지 않는다. 묶음별 체크포인트와 원출력은 보존하되 여러 구간의 조건을 통합한 의미 검증은 검토 단계의 책임이다. 작성 입력이 큰 경우의 자동 축약은 아직 없다. `keep_alive`는 현재 5m이며 비교 시험에서는 모델 적재 상태와 동시 상주를 기록한다. 서버의 클라우드 비활성 설정 자체는 이번 어댑터의 localhost 제한과 별도로 검증해야 한다. 현재 어댑터는 `:cloud` 접미사를 거부하지만 다른 이름으로 등록된 원격 모델 별칭까지 완전히 판별하지는 않는다. 이를 로컬 전용 정책 완료로 표시하지 않는다.

### 6.2 구현에 사용할 Codex 설정

개발용 추천과 운영 로컬 모델은 구분한다. 현재 클라이언트에서 사용 가능한 모델을 확인하고 선택한다.

| 개발 작업                              | 권장 시작 설정      | 이유                                   |
| -------------------------------------- | ------------------- | -------------------------------------- |
| P1~P5 일반 구현·회귀 테스트            | GPT-6 Sol / high    | 기존 코드 재사용, 실제 입출력 검증     |
| 근거 계약·Drive 충돌·재개·ID 손상 검토 | GPT-6 Astra / xhigh | 여러 단계의 불변 조건과 실패 전파 검토 |
| 구현 후 별도 diff 리뷰                 | GPT-6 Astra / high  | 증거·누락·회귀 중심의 검토             |
| 확정된 문서·이름·설정 수정             | GPT-6 Sol / medium  | 제한된 변경 범위                       |

이 추천은 모델 변경·별도 에이전트 생성·추가 유료 API 실행을 뜻하지 않는다. 하나로 시작하면 Sol/high, 위험한 데이터 계약과 전환 검토에서만 더 높은 수준을 사용한다.

## 7. 현재 실행 가능한 CLI

프로젝트 루트에서 `npm run research -- <명령>`을 실행한다. `model-info`를 제외하면 명시적 `--run`이 필요하다. 날짜 예시와 URL은 과거 자료의 재현 시험이며 오늘의 신규 뉴스 발행 예시가 아니다.

### 7.1 모델과 기준선

```bash
npm run research -- model-info --model qwen3.8:27b
npm run research -- baseline --run 20260927-baseline-02
```

baseline은 네 공개 작성 원본과 RSS를 읽어 비공개 복구 사본을 만든다. Drive 원본 대조는 이 명령이 자동으로 수행하지 않는다. 현재 대조 기록은 별도의 실제 커넥터 읽기로 확보했다.

### 7.2 경로 탐색

```bash
npm run research -- discover --run 20260927-discovery-02 --channel fanuc-en --channel fanuc-ja --channel mit-robotics
npm run research -- discover --run 20260927-all-routes-02
```

후보는 비공개 `candidates.json`, 조사 칸은 `coverage.json`, 각 경로는 stage 결과에 보존한다. backlog 반영이 필요한 실행에만 `--merge-backlog`를 추가한다. 이 옵션은 기존 private backlog를 실제 수정한다. 후보의 제목·검색 결과를 기사 사실로 자동 확정하지 않는다.

현재 성공한 세 경로 시험은 후보 65개·실패 경로 0개였지만 날짜별 사건 판별이나 65개 원문 검토 완료를 뜻하지 않는다. 이후 전체 71개 시작 경로 실행은 후보 311개, partial 64·failed 5·policy_blocked 1·blocked 1을 기록했다. 32칸의 미시도는 0이지만 본문 검토·조사 완료 판정은 아니다. 최종 결과는 `runs/20260927-full-route-discovery/`에 보존했다.

### 7.3 수집·파싱·사실 추출

```bash
npm run research -- collect --run 20260927-fanuc-collect-02 --url https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html
npm run research -- extract --run 20260927-fanuc-extract-02 --model qwen3.8:27b --think false --url https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html
```

`collect` 생성물은 `documents.json`·`parses.json`, `extract`는 이에 더해 `claims.json`이다. extract도 원문 확보 단계를 수행하며 유효한 조건부 캐시를 재사용한다. 동일 run ID로 collect와 extract를 바꾸면 입력 해시가 달라진다. **다른 명령·URL·모델·등록 규칙을 사용할 때는 새 run ID를 사용**한다. 완료 stage의 체크포인트는 같은 입력과 무결성을 확인한 경우만 재사용한다.

`--think false`는 CLI에서 boolean false로 변환된다. 기본 추출 옵션은 medium이므로 예시에 명시했다. 앞선 단일 medium 호출은 300초 제한에 걸렸으며 실패를 빈 기사로 대체하지 않았다.

다음6개 옵션은 `extract`에서만 받는다. 범위를 벗어난 숫자·소수·음수·다른 명령에서의 사용은 원문/모델 호출 전에 거부한다. 예산은 `run` 입력과 claims provenance에 보관하며 같은 run의 설정을 변경해 재개할 수 없다.

| CLI 옵션                  | 기본값    | 허용 범위·계산                                    |
| ------------------------- | --------- | ------------------------------------------------- |
| `--num-ctx`               | 16,384    | 4,096~32,768 정수 문맥 토큰                       |
| `--input-char-budget`     | 문맥의2배 | 4,096~문맥의2배; 실제 messages와 schema의 문자 합 |
| `--num-predict`           | 4,096     | 128~8,192 생성 토큰                               |
| `--facts-per-batch`       | 6         | 1~6; 해당 묶음에서 얻을 수 있는 사실의 상한       |
| `--call-timeout-ms`       | 300,000   | 1~300,000; metadata 확인과 모델 호출을 합친 한도  |
| `--extraction-timeout-ms` | 900,000   | 1~7,200,000; 한 추출 시도의 묶음 처리 전체 한도   |

실제 장문 시험의 새 입력 예시는 다음과 같다. 기존 수집 run의 원문·parse를 무결성 확인 후 재사용하며 새로 수집한 것으로 세지 않는다. 원문349블록을15요청에 모두 포함하는 설정이며 아직 일일 운영의 확정 기본값은 아니다.

```bash
node scripts/research.mjs extract --run 20260927-paper-bounded-full-qwen-false-v1 --source-run 20260927-paper-source-subset-v2 --think false --input-char-budget 12000 --num-ctx 16384 --num-predict 2048 --facts-per-batch 4 --call-timeout-ms 240000 --extraction-timeout-ms 2700000
```

문자 한도는 토큰화·처리 시간 보장이 아니다. 원문 문단 자체가 넘으면 명시적 재파싱을 요구하며 잘라 버리지 않는다. 출력 상한을 줄여 JSON이 잘리면 실패로 남기고 예산과 입력을 새 run에서 수정한다. 사실 개수 상한을 줄여 핵심 사실이 빠지면 의미 평가에서 실패한다.

전체 예산이 끝나면 새 모델 호출을 시작하지 않고 완료 checkpoint를 보존한다. 현재 요청에는 남은 전체 시간과 호출별 한도 중 작은 값을 준다. 같은 입력으로 재개하면 완료 묶음은 해시 검증 후 재사용하고 남은 묶음만 새 시도의 시간 예산으로 처리한다. CLI 시작 전 수집·파싱, 반복 재개 전체를 합친 일일 예산, OS 메모리 상한은 이 옵션의 범위 밖이다. 새 어댑터의 `wall_ms`에는 metadata 확인 시간이 포함되므로 이전 metadata 제외 측정과 단순 속도 비교하지 않는다.

### 7.4 근거 직접 검토

```bash
npm run research -- review --run 20260927-fanuc-extract-02 --review .local/research/local-ai/reviews/fanuc-facts.json
```

다음은 **형식 설명용 템플릿**이다. 실제 추출 claim ID로 바꾸고 근거를 읽은 후 상태와 검토 항목을 작성한다. 그대로 실행하면 승인되는 샘플이 아니다.

```json
{
  "reviewer": "실제 검토자 식별자",
  "reviewed_at": "2026-09-27",
  "claims": [
    {
      "claim_id": "실제 claims.json의 claim_id",
      "status": "deferred",
      "source_read": false,
      "entailment_checked": false,
      "identity_checked": false,
      "numbers_checked": false,
      "time_checked": false,
      "reason": "비공개 근거 검토 기록"
    }
  ]
}
```

`verified` 결정에는 구조 검사 통과와 원문 읽기·의미·주체·수치·시점 검토가 모두 필요하다. 원문에서 quote가 발견됐다는 것만으로 claim 전체를 지지한다고 판단하지 않는다. 변경할 사실은 허용된 replacement 필드와 새 검토 근거를 남기고 기존 claim ID를 보존한 수정 이력을 만든다. 새 기록은 `reviewed-claims.json`에 두며 모델 원출력을 덮어쓰지 않는다.

### 7.5 한국어 작성과 수정

```bash
npm run research -- draft --run 20260927-fanuc-extract-02 --model qwen3.8:27b
```

기본 작성 입력은 검토된 사실이다. `draft.json`과 `preview.md`를 생성하며 공개 원본·Drive·Git은 수정하지 않는다. `--provisional`은 구조 검사만 통과한 사실로 비교 초안을 만드는 용도이며 공개 승인으로 이어질 수 없다. 시험·검토 상태를 공개 본문에 삽입하지 않는다.

현재 작성 스키마는 제목, 2–4개 리드 항목, 육하원칙 facts, 분야·주 테마·통제 태그 1–3개·기업/기관 이름, 설명 최대 4개다. 리드와 각 설명 문단에 claim ID를 연결한다. 빈 explanations는 허용하고 의미 없는 설명을 채우지 않는다. 현재 리드 항목 수 검사와 자연어 문장 수·독서 품질 검사는 같지 않으므로 최종 읽기가 필요하다.

초안 정정은 `correct --run ID --review JSON`으로 실행한다. 입력은 이전 `draft_id`, `reviewer`, `reason`, `reviewed_at`, 교체할 전체 `draft`의 다섯 필드다. 원출력 바이트와 정정 판단을 별도로 보존하고 새 draft ID를 만든다. 같은 판단 입력의 재개는 재사용하며, 현재 원고가 변조됐으면 재사용 전에 거부한다. 새 초안 해시와 이전 승인을 혼용하면 `approve`에서 거부한다. 상세 파일 흐름·실제 세 정정은 [20절](#20-비공개-정정승인전체-사이트-검증)을 따른다.

### 7.6 비공개 승인 결과

```bash
npm run research -- approve --run 20260927-fanuc-extract-02 --review .local/research/local-ai/reviews/fanuc-editorial.json
```

편집 검토 입력의 실제 필드는 `status`, `draft_id`, `reviewer`, `source_read`, `final_prose_read`, `title_checked`, `dates_checked`, `numbers_checked`, `analysis_checked`, `event_id`, `published_at`, `reviewed_at`, `region`, `concept_ids`다. 모든 검토는 해당 **정확한 draft ID**에 대해 기록한다. 기존 기사라면 event ID와 원 발표일을 가져오고 검토일만 새로 기록한다. 확인된 전문용어 배정만 넣는다.

결과는 `editorial-review.json`과 `approved-article.json`이다. 정확한 원고·사실·원문·검토 검사를 통과한 뒤 두 파일을 저장하며 `status=approved`와 `candidate_published=false`를 반환한다. 이는 검토한 기사 형식의 변환이며 발행이 아니다. 사건 뉴스 외에 기업 전략·논문 해설·연구 사업화의 세 심층 계약도 연결했다. [16절](#16-심층-세-형식의-구현-계약과-실행)의 별도 근거 검토를 거쳐야 한다. 실제 원출력 판정은 [18.5절](#185-세-심층-형식의-실제-작성과-직접-판정), 이후 세 정정본의 비공개 승인·전체 사이트 대조는 [20절](#20-비공개-정정승인전체-사이트-검증)에 기록했다.

`editionProjection`은 승인 기사들을 기존 회차 계약으로 변환하고 `stageProjection`은 비공개 approved-vault에 저장한다. 아직 일일 명령으로 완전히 연결하지 않았다. 기존 회차의 날짜·cutoff·기사 ID 전체가 같아야 소급 투영을 허용하며 일부 기사만 넘겨 다른 기사를 조용히 삭제하는 변환은 거부한다.

### 7.7 검색과 보관

```bash
npm run research -- queries --run 20260927-search-02 --date 2026-09-27 --model qwen3.8:27b
npm run research -- search --run 20260927-search-02
npm run research -- archive --run 20260927-fanuc-extract-02
```

`queries`와 `localize-queries`는 run 잠금 아래 `search-plan/`의 단계 기록을 사용한다. 최초32칸 생성 → 필요한 언어별 보완 → 분야32칸과 제조사30칸의 전체 검증을 순서대로 수행한다. 원출력은 `search-plan/responses/generation-<hash>.json`, `localization-<language>-<hash>.json`으로 보존한다. 정규 최종 `queries.json`은 `research-search-plan/v2` 계약이며 `run_id`·`input_hash`·62개 질의·보완 호출 provenance·`observation_date`·`manufacturer_targets`를 가진다. 제조사 없는 기존 v1의32칸 계획은 보존·검증할 수 있다. 예전 실행의 `queries-original.json`·`queries-localization.json`은 과거 기록으로 남겼으며 신규 실행이 덮어쓰지 않는다.

국내 16개 칸은 한국어, 해외 16개는 영어 11·독일어 2·중국어 2·일본어 1개다. 잘못된 언어 칸만 언어별로 따로 요청하고 회사·기술·수치·slot ID의 의미를 보존한다. 각 언어 단계가 완료됐으면 같은 입력 재개에서 다시 호출하지 않는다. 중복·누락 ID, 중복 질의, 지역/분야/축/언어 변경은 거부한다. 글자·독일어 표현 검사는 사전 검사이므로 자연스러운 현지어와 질의 목적은 별도로 읽어 확인한다.

혼합 보완이 일본어·중국어까지 독일어로 반환했던 실패를 보존한 뒤, 새 언어별 실행은 독일어 2개·중국어 2개·일본어 1개를 약 37.342초에 보완했다. 이 결과는 5개 질의의 보완 시험이며 해당 언어의 모든 출처를 조사했다는 뜻은 아니다.

기존 질의를 새 계획으로 보완하는 별도 명령은 다음과 같다. `--query`는 입력 파일이며 완전한 32칸 계약을 유지해야 한다.

```bash
npm run research -- localize-queries --run 20260927-search-native-02 --query .local/research/local-ai/runs/20260927-search-02/queries.json --date 2026-09-27 --model qwen3.8:27b
```

`search`는 §2.2의 관리형 서비스 또는 명시한 `SEARXNG_URL`을 사용한다. 기본 입력은 완료 단계·입력 해시·최종 파일과 checkpoint 해시가 모두 일치하는 계획만 허용한다. 보완 실패 뒤 남은 예전 파일·최종 파일 변조·다른 run 결과는 거부한다. 명시적 `--query <queries.json>`도 질의·언어·ID 계약을 검사하며 검사를 통과하기 전에는 서비스를 시작하지 않는다. v1/v2로 선언한 파일은 각각 완전한32칸/62칸 계약과 target manifest를 검사한다. 스키마를 선언하지 않은 명시적 파일의1~64질의 부분 시험은 허용하지만 정규 계획 완료 증거와 구분한다.

검색은 별도 `search/state.json`과 `query-<slot_id>` checkpoint를 사용한다. 성공한 질의는 같은 입력 재개에서 결과·기존 확인 시각을 그대로 재사용하고 실패한 질의만 다시 시도한다. 일부 엔진 오류와 함께 결과가 확보된 질의도 완료 checkpoint이므로, 다른 엔진을 새로 확인하려면 새 run으로 실행한다. 같은 run의 모델 digest·질의·모듈·서비스 입력을 바꾸면 거부한다. API가 결과 없이 엔진 실패를 반환한 경우는 `failed`이며 “새 소식 없음”이 아니다.

통합 결과는 `search.json`, 서비스 provenance는 `search-runtime-<owner>.json`과 최신 사본 `search-runtime.json`이다. CLI의 질의 `failures`와 일부 `engine_failures`를 함께 확인한다. 질의별 journal 완료는 요청 결과 보관이며 원문 확인·기사 승인·발행 완료가 아니다.

현재 요청은 `categories=general`, `time_range=month`, 첫 페이지 최대 25개다. 한 달 옵션은 지원하는 엔진의 검색 필터일 뿐 실제 발표일 확인이나 7일 조사 구간 적용을 대신하지 않는다. 검색 뒤 원문 발표일과 기존 사건 ID를 대조한다. [SearXNG API](https://docs.searxng.org/dev/search_api.html)와 [settings.yml](https://docs.searxng.org/admin/settings/settings.html)의 공식 설정을 따른다.

archive는 잠금 아래 실행 파일의 해시 manifest만 생성한다. `drive_verified=false`이며 실제 업로드 기능이 아니다. 자신의 이전 `archive-manifest.json`을 제외하므로 같은 입력으로 재실행해 자기 파일의 해시가 계속 바뀌는 문제는 수정·회귀검증했다. 실제 Drive에 보관한 파일의 원격 내용과 별도로 대조해야 한다.

### 7.7.1 제조사별 추가 질의와 계획 검증

현재 정규 명령은 [제조사 목록](../data/research-watchlist.json)의15곳을 읽어 각 회사의 기술·제품/기업·운영2칸을 추가한다. 분야32칸의 열린 탐색과 제조사30칸은 별도의 scope다. 합계62개로 현재64질의 상한 안에 들어간다. 제조사 catalog의 프로그램 상한은16곳이며 추가할 때는 총예산과 테스트를 함께 검토한다.

| 필드             | 제조사 질의의 값·계약                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `slot_id`        | `manufacturer-<ID>-technical` 또는 `manufacturer-<ID>-corporate`         |
| `scope`          | `manufacturer`; 기본 분야 칸에는 이 scope를 붙이지 않음                  |
| `entity_id`      | 등록된 회사 ID; 검색 주체이며 검토된 기사 entity가 아님                  |
| `sector`         | 기존 열거값 `로봇·제조`                                                  |
| `region`, `axis` | registry 지역·고정 두 축; 모델이 바꾸지 않음                             |
| `language`       | 등록한 ko/en/ja/zh/de 중 선택; 영어 이름만 쓴 현지어 실패는 사전검사     |
| `angle`          | 언어별6개 키워드를 관측일과 회사ID 해시로 순환                           |
| `query`          | 정확한 등록 이름·로봇 표현·선택 키워드·관측 연도                         |
| plan manifest    | `observation_date`, 전체 `manufacturer_targets`; 질의를 다시 구성해 대조 |

현재 실제 사례는 `"HD현대로보틱스" 로봇 고객 도입 2026`, `"FANUC" ロボット 生産能力 2026`이다. 이는 조사 문자열이며 해당 회사의 고객 도입·생산능력 변화가 확인됐다는 진술이 아니다. 명단 재정렬은 ID/각도에 영향이 없고 날짜가 바뀌면 선택 키워드가 순환한다. 유효하지 않은 날짜·중복 회사·등록되지 않은 언어·사용 가능한 이름 부재는 오류다.

실제 실행에 사용한 명령은 다음과 같다. 이미 완료한 run을 새로운 비교 회차로 세지 않는다.

```bash
node scripts/research.mjs localize-queries --run 20260927-manufacturer-inclusive-plan-v1 --query .local/research/local-ai/runs/20260927-robot-manufacturer-routes-v1/queries.json --date 2026-09-27
node scripts/research.mjs search --run 20260927-manufacturer-inclusive-plan-v1
```

검증된32개 현지어 질의를 그대로 재사용해 보완 호출0회로62개 계획을 구성했다. `search-plan/generation.json`에 있는 원본 계획의 provenance는 재사용한 과거 모델 호출 기록이며 이번의 새 호출이 아니다. stage 시각과 입력 `source_plan_sha256`를 함께 대조한다. `queries`로 처음 작성하면 분야32칸의 실제 모델 호출이 별도로 필요하다.

`discoverSearch`는 실행 기록과 후보의 `discovery[]`에 `search_scope`, 필요한 경우 `search_entity_id`를 보관한다. 검색한 회사명이 기사 entities/concept IDs로 자동 복사되지 않는다. 동일 source key의 여러 관측과 고유 후보 수를 구분하고 영속 backlog 병합은 `--merge-backlog`를 지정한 경우에만 수행한다.

### 7.8 옵션·상태 파일과 명령의 차이

`queries`는 최신 작성 원본에서 기존 `briefingLibrary`와 `researchWindow`를 읽고 기존 candidate-backlog를 실제 발행 사건과 대조한다. 같은 회사가 기업/제조사 그룹에 함께 있어도 조사 주체ID는 하나로 연결한다. 실제 입력의 주체61개·제조사15개·미해결13건과 같은 run의coverage를 `search-plan/context.json`에 보관했다. 모델은32개 분야 조사 slot을 작성하고 프로그램이 별도 제조사30칸을 추가한다. 모델 입력의 회사 이름만으로 개별 확인을 계산하지 않는다.

입력 contract `research-search-context/v1`의 필드는 다음과 같다.

| 필드        | 실제 내용·예산                                           | 의미                                                     |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `topics`    | ID·이름·정확한 별칭·지역·분야·언어·watch groups          | 고정 명단에만 제한하지 않되 동명이인/동일성 추론은 금지  |
| `gaps`      | 실패→미시도→부분의32칸·route IDs·실패IDs·이용 가능 수    | 시도/빈 목록을 본문 조사 완료로 해석하지 않음            |
| `backlog`   | 최대16건·제목300자·URL3개·원발표일·발견일·상태·다음 경로 | 분야별 후보를 배려한 후 중요도/나이 순; 과거 사건도 유지 |
| `window`    | 기존 publication cutoff·7일 중첩 discovery 범위          | 같은 run 재개에서는 `discovery_end` 고정                 |
| `selection` | 미해결/포함/제외 수·예산·큐 보존 표지                    | 입력 밖 후보는 원 큐에 남음; 삭제/종결 아님              |

현재는 같은 run의coverage를 읽는다. 다른 날 run의 실패 자동 이월은 아직 없다. 제조사별30질의 추가는 v2계획으로 구현했다. 큐/원본/coverage/모델/제조사/관측일 설정이 바뀌면 입력 hash가 달라지므로 새 run을 사용한다. 저장된 context를 편집해서 기존 stage를 성공으로 재사용하지 않는다.

| 옵션·입력         | 적용되는 현재 경로                                                       | 주의점                                                               |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `--root`          | 모든 private 실행 자료                                                   | 기본 `.local/research/local-ai`; 공개 vault 경로로 지정하지 않음     |
| `--run`           | model-info 외 모든 명령                                                  | 영문·숫자·밑줄·하이픈만 허용; 회차의 RSS ID가 아님                   |
| `--url` 반복      | collect/extract                                                          | 명시한 원문; 자동으로 첨부 전문까지 읽은 것으로 계산하지 않음        |
| `--source-run`    | extract/gold-case/reparse                                                | 저장 바이트·parse 검증; live URL/channel 혼합 금지; 출력 run 분리    |
| `--channel` 반복  | discover                                                                 | 실제 registry에 있는 ID만 사용                                       |
| `--model`         | model-info/queries/localize-queries/extract/draft/knowledge-draft        | 설치 digest·지원 설정 검사                                           |
| `--think`         | extract                                                                  | 기본 medium; queries/draft는 현재 false를 코드에서 사용              |
| `--review`        | review/deep-review/approve/gold-case/correct/note-review/knowledge-draft | 각 명령의 사실·원고·지식·평가 입력은 서로 다른 JSON                  |
| `--deep`          | draft                                                                    | 검토된 deep-context 필요; provisional과 함께 사용 불가               |
| `--provisional`   | draft                                                                    | 비교 초안용; verified 사실을 요구하는 공개 승인 관문을 우회하지 않음 |
| `--query`         | search/localize-queries                                                  | JSON 질의 파일의 실제 경로                                           |
| `--date`          | queries/localize-queries                                                 | 상한 관측일·제조사 키워드 순환; 실제 발표일을 채우는 값이 아님       |
| `--merge-backlog` | discover/search                                                          | 기존 비공개 지속 후보 목록을 실제 변경                               |

`RunState`의 단계별 재개는 collect/extract/discover와 queries/localize-queries/search에서 사용한다. 검색 계획은 `runs/<run>/search-plan/`, 실제 검색은 `runs/<run>/search/`로 상태·journal·checkpoint를 분리해 같은 run ID를 사용해도 입력 계약이 충돌하지 않는다. 명령들은 같은 run 잠금을 공유하므로 동시에 실행하지 않는다. review/draft/approve/archive 모두에 동일한 stage journal이 연결된 것은 아니다. 발행 잠금·원격 상태 재개·강제 종료 복구는 P5의 남은 범위다. 명령 종료 0이더라도 결과의 질의 실패·엔진 오류를 확인해야 하며 기사 승인·원격 보관·공개 발행으로 승격하지 않는다.

## 8. 사실·기사·지식 검증

현재 사실 스키마는 `statement`, `claim_kind`, `subject`, `event_state`, `published_at`, `effective_period`, `numbers`, `evidence`다. 수치는 `literal`, `unit`, `condition`, 근거는 source ID·버전·parse ID·block ID·quote·support를 가진다. 수치 정규화 값·환산식·완전한 법인 식별은 목표 계약의 후속 필드다.

현재 추출은 구간을 d1b1 같은 짧은 키로 모델에 제공하고 Node가 실제 불변 ID로 다시 연결한다. 모델이 파일명이나 source ID를 직접 만들게 하지 않는다. 코드가 검사하는 범위와 직접 확인할 범위를 분리한다.

| 검사      | 코드가 확인                              | 원문·최종 읽기에서 확인                      |
| --------- | ---------------------------------------- | -------------------------------------------- |
| 근거      | 버전/블록 ID·본문 해시·인용 문자열       | 인용이 해당 주장 전체를 지지하는지           |
| 수치      | literal·단위·조건의 원문 포함            | 기간·분모·통화·누적/분기·비교 집단           |
| 계획      | 대표 미래 표현과 완료 상태의 충돌        | 계약/출시/출하/양산/도입의 실제 단계         |
| 날짜      | 확인한 파서 발표일과의 일치              | 발표일·시행일·관측일·수정일의 구분           |
| 회사 주장 | attributed_fact 필드                     | 회사 발표를 독립 검증 성능으로 표현하지 않음 |
| 한국어    | 필드·태그·한글·일부 금지 문구·claim 참조 | 정확한 이름·자연스러운 표현·중복·빠진 조건   |
| 분석      | 비교 근거 검토 요구                      | 인과·우위·시장 성과를 추정하지 않음          |

빈 분석·실패 해명·“왜 중요한가/무엇이 바뀌었나” 고정 문구를 만들지 않는다. 사건의 주체와 행동을 앞에 놓고 필요한 시점·장소·규모·방법을 이어 설명한다. 말하지 않은 이유는 생성하지 않는다. RSS·GitHub도 같은 승인 본문을 사용하고 제목만 링크하는 빈 요약을 만들지 않는다.

전문용어는 기존 검토 registry의 학습 가치 있는 개념만 배정한다. 기업명·제품명·일반 단어·동시 등장으로 지도 노드를 생성하지 않는다. 현재 knowledge-links는 근거 연결과 정정 영향 목록을 반환하며 실제 정의·변화 이력을 자동 작성해 넣지는 않는다. 원문을 잃거나 사실이 정정되면 영향받은 기사·개념·판단을 재검토 대상으로 만든다.

교수 동명이인은 기관·역할·시점 근거 없이 합치지 않는다. 논문의 arXiv 버전과 DOI는 동일성 후보로 보고 공식 연결을 확인한다. 공동저자·자문·기술이전·공동창업은 다른 관계다. 주제별 기사 수를 기술 성장이나 시장 점유율로 해석하지 않는다.

### 8.1 원문 버전·검토 시점·승인 재검사

빈 parses와 저장된 `structural_pass`만으로 검토가 통과하던 경로, 불가능한 날짜를 기사 승인에 사용할 수 있던 경로를 실패 테스트로 먼저 재현한 뒤 보강했다.

| 경계             | 현재 강제하는 검사                                                                                                                 | 직접 검토 또는 남은 범위                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 사실 검토        | `recordFactReview` 직접 호출도 verified에 nonempty·unique parse, 추출 스키마, source/version/block/quote, 다섯 boolean true를 요구 | 인용이 주장 전체를 의미상 지지하는지 직접 확인                           |
| 검토 해시        | 핵심 사실·claim ID·수정 전 ID 및 참조한 전체 parse에 `claim_sha256`, `source_parses_sha256` 저장                                   | 체크값·해시는 실제 읽기 행위나 독립 검토자의 증명이 아님                 |
| 실제 보관 바이트 | review/draft/approve CLI가 body SHA·URL 기반 source ID·원문 버전·canonical parse JSON을 다시 검사                                  | 순수 함수의 parse 인자는 호출자가 공급하며 disk 읽기는 CLI 경계에서 수행 |
| 날짜             | 실제 달력·윤년·시각·시간대, 미래 검토·원 발표/관측 이전 검토 거부                                                                  | 정정·여러 사건일·회계기간의 의미는 별도 직접 검토                        |
| 발표일           | 해당 사실이 참조한 근거 parse의 날짜와 대조; 무관한 parse 날짜로 통과 불가                                                         | 일자만 있는 원문에서 시각을 만들지 않음                                  |
| 최종 승인        | `approvedArticle(..., parses)`가 사실·근거·검토 해시와 기사 원 발표일·검토 순서를 다시 확인                                        | 모델의 의미 오류·누락을 자동 해결하거나 무인 승인하지 않음               |
| 독자 문장        | 알려진 내부 claim ID가 제목·리드·설명 소제목·문단에 있으면 승인 거부                                                               | 수치 조건·회사 귀속·제목의 의미는 직접 원문 대조                         |

날짜 계약은 YYYY-MM-DD 또는 초와 시간대가 있는 ISO timestamp다. 같은 실제 시각의 서로 다른 시간대 표기는 허용하되 원문에 없는 시각 정밀도를 추가하지 않는다. 기사 공개일·검토일은 기존 형식대로 일자 정밀도를 유지한다. 검토일의 오늘 판정은 KST, timestamp의 미래·순서 판정은 실제 시각을 사용한다.

과거 private verified 기록에 두 검토 해시가 없으면 그대로 승인하지 않는다. 원출력을 보존하고 원문을 다시 읽어 명시적 검토를 새로 기록한다. 관련 없는 parse가 추가돼도 해당 사실의 검토는 유지되며, 참조 parse의 날짜·품질·본문이 바뀌면 재검토가 필요하다.

실제 코드: [dates.mjs](../scripts/research/dates.mjs), [parser.mjs](../scripts/research/parser.mjs), [claims.mjs](../scripts/research/claims.mjs), [publish-adapter.mjs](../scripts/research/publish-adapter.mjs). 회귀는 `research-review`, `research-projection`, `research-runtime`, `research-evaluation` 테스트에 있다. 이 보강은 원문 의미의 정확성 평가와60건 평가를 대체하지 않는다.

## 9. 실제 시험 기록과 해석

### 9.1 FANUC 비공개 기사 흐름

원문은 [영어 발표](https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html)와 [일본어 발표](https://www.fanuc.co.jp/ja/profile/pr/newsrelease/2026/news20260911.html)다. 사건 발표일은 2026-09-11이며 이 시험의 검토일 2026-09-27과 구분한다.

| 단계        | 실제 관찰                             | 판정                                     |
| ----------- | ------------------------------------- | ---------------------------------------- |
| 수집        | 언어판별 올바른 URL 확보              | 잘못된 URL의 404도 실패 기록으로 보존    |
| HTML        | 영어 23개·일본어 22개 구간            | 날짜·본문·설명의 위치를 추적             |
| 사실 추출   | false, 116.678초, 5개 사실            | 원출력의 날짜 단위·일부 표현 수정 필요   |
| 앞선 medium | 300초 제한으로 중단                   | 실패; 자동 승격·빈 성공 없음             |
| 사실 검토   | 원문·주체·수치·계획·문장 의미 재대조  | 수정 이력을 남긴 5개 검토 사실           |
| 한국어 초안 | false, 101.701초                      | 반복 설명·일부 문장별 근거 연결 수정     |
| 편집        | 원출력·수정본·정확한 draft ID 보존    | 직접 검토한 비공개 후보                  |
| 기사 변환   | 기존 event ID `eb739a02acad3ab9` 유지 | 과거 기사 변환; 신규 회차·공개 발행 아님 |

시험은 Gemini 기반 지원과 카메라 역할, 데모·출하 계획을 원문 범위 안에서 설명한다. 계약 조건·실적·시장 우위를 생성하지 않았다. 필요한 근거가 없는 심층 분석은 넣지 않았다. 근거 수정과 편집 보완이 있었으므로 모델 원출력의 무검토 발행 합격으로 기록하지 않는다.

### 9.2 문서 유형 시험

| 자료                | 실제 시험                                           | 남은 검증                                              |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| FANUC IR HTML       | 일본어 213개 구간·첨부 후보                         | 첨부 전문/날짜/수치의 직접 검토                        |
| FANUC 실적 PDF      | 10페이지·211개 구간·네이티브 표 12개, 누락 페이지 0 | 제목 메타데이터 부재로 partial; 재무 해석 승인 아님    |
| 브라우저 렌더       | 실제 발표 렌더·공통 Node 요청 중계·하위 요청 실패 0 | 동적 전용 출처의 반복 검증                             |
| OCR fixture         | 2페이지 중 스캔 1페이지만 OCR, 좌표·텍스트 검사     | 실제 다국어 스캔·복잡한 표의 정답 평가                 |
| 과거 원문 가져오기  | 10개 기존 snapshot의 ID·해시 호환                   | 전체 재조사·검증 판정과 다른 작업                      |
| 선택 경로 탐색      | FANUC en/ja·MIT: 65개 후보, 경로 실패 0             | 후보별 사건 날짜·중복·원문 확인                        |
| 전체 시작 경로 탐색 | 71개 경로·311개 후보; 64 partial/7 실패·정책·차단   | 원문 미검토; IEA·NIH·NASA·S1·Tesla·GIST·KIST 경로 보완 |

수집 URL 수, 파싱 블록 수, OCR 신뢰도는 독서 품질이나 사건 검증률을 대신하지 않는다. 약 116초와 102초를 단순 곱해서 하루 40건 발행 시각을 약속하지 않는다. 원문 길이·모델 적재·검색/파싱·검토·메모리와 전체 소요 시간을 따로 측정한다.

### 9.3 해결한 실제 실패

- 일본어·큰 JSONL 출력이 pipe 청크 경계에서 깨지던 문제: stdout/stderr UTF-8 디코더를 사용하고 본문 해시 회귀시험으로 확인했다.
- PDF 라이브러리 출력이 JSONL stdout에 섞이던 문제: 라이브러리 로그를 stderr로 분리했다.
- 같은 호스트의 robots 동시 조회가 원문 잠금과 충돌하던 문제: 진행 중 정책 요청을 공유하고 회귀시험을 추가했다.
- FANUC 영어/일본어 상세 URL 접두어가 서로 다르던 문제: 실제 원문 경로에 맞는 개별 패턴을 등록했다.
- 로컬 JSON 성공을 사실 승인으로 오해할 위험: 구조 검사·사실 검토·편집 승인·발행을 분리하고 실패 사례를 검사했다.
- 정정 사실의 잘못된 타입·열거값과 빈 주체가 통과하던 문제: replacement를 기존 추출 스키마로 다시 검사한다.
- 문자열 `"true"`나 오래된 `structural_pass`가 승인처럼 사용되던 문제: 실제 boolean true만 받고 저장된 parse로 근거를 다시 검사한다.
- 검토 결정 중복·누락·다른 claim ID 문제: 정확한 claim 집합을 요구하고 deferred·rejected를 승인과 구분한다.
- archive 재실행의 자기 해시 문제와 모든 경로 실패를 partial로 표시하던 문제: 자기 manifest 제외·실패 상태 분리의 재현 테스트를 추가했다.
- 직접 원문과 브라우저 요청의 정책 범위 차이: robots 확인 실패·거부·손상 상태에서 기사 요청을 차단한다.
- 검색 worker의 health endpoint 이름 충돌: 독립 `/tkg-healthz`로 바꾸고 실제 시작→검색→종료를 확인했다.
- 여러 언어를 한 호출로 보완해 일본어/중국어까지 독일어가 되던 문제: 언어별 요청·단계 저장으로 바꾸고 실제 3언어 보완을 확인했다.
- 검색 계획과 실행의 상태 입력 충돌·실패 뒤 오래된 계획 사용: 상태 공간·run 잠금·입력/checkpoint 해시 검사로 분리하고 회귀시험을 통과했다.
- 검색 일부 실패 뒤 완료 질의까지 재실행하던 문제: 질의별 checkpoint로 완료 결과와 확인 시각을 유지하고 실패만 재개한다.
- HTML 메타데이터와 dateline 충돌이 한쪽 값으로 덮어써지던 문제: 실제 재현 시험 후 날짜 후보·달력 유효성을 함께 검사하고 충돌을 보존한다.

### 9.4 실제 검색과 추가 원문 시험

| 실행 ID                                   | 실제 관찰                                                                                                                                    | 판정                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `20260927-search-smoke`                   | 검색 응답 25개·3개 엔진·엔진 실패 0                                                                                                          | 최초 서비스/API 확인; 후보 검증 아님                        |
| `20260927-managed-search`                 | 관리형 서비스에서 질의 1개·후보 17개·2개 엔진·실패 0                                                                                         | 자신이 소유한 프로세스 시작·검색·종료 확인                  |
| `20260927-full-model-search-v2`           | 32개 칸 질의·517개 미검토 후보; 질의 요청 실패 0, 엔진 오류가 있는 질의 29개                                                                 | 일부 검색 결과 확보; 전체 엔진/현지어 조사 성공 아님        |
| `20260927-full-model-search-native`       | 5개 잘못된 언어 질의 보완, 37.286초; 요청 언어 대신 모두 독일어 출력                                                                         | 실패 보존; 최종 질의 파일 작성·성공 승격 없음               |
| `20260927-ur-gen7-policy`                 | Universal Robots 공식 Gen 7 발표, robots 확인 후 본문 20개 구간                                                                              | 원문 읽기 가능; 발표일 메타데이터 null, 날짜 규칙 추가 필요 |
| `20260927-native-language-groups-v1`      | 언어별 3호출, 5질의 보완 37.342초; 32질의 검색·420후보·1질의 실패·31질의 일부 엔진 오류                                                      | 현지어 보완·실제 검색·서비스 종료 확인; 원문은 미검토       |
| `20260927-ur-gen7-dateline-v1`            | 새 날짜 profile로 20구간, 발표일 2026-09-14·일자 정밀도·DOM 근거 추출                                                                        | 기존 사건 연결 대상; 사실·편집·공개 반영 미완료             |
| `20260927-robot-manufacturer-routes-v1`   | 제조사27경로·23partial/4failed·166미검토 후보;61주체/미해결13건으로32질의 생성·실제 검색636관측(고유URL617)·질의 실패0·29질의 일부 엔진 오류 | 등록·목록·검색 관측; 상세/발행 아님                         |
| `20260927-hd-news-profile-v1`             | 첫 목록 profile의 날짜 변수 충돌로 worker 실패                                                                                               | 실패 기록 보존; 후보0을 새 소식 없음으로 해석하지 않음      |
| `20260927-hd-news-profile-v2`             | 실제 목록의3개 기사 URL·제목·2026/2025년 목록 날짜·DOM/source/parse근거                                                                      | 목록 규칙 실제 검증; 과거 발표이며 상세 승인 별도           |
| `20260927-manufacturer-inclusive-plan-v1` | 분야32+제조사30의62질의,ko22/en15/ja9/zh12/de4;682관측/642고유key,요청실패0·62질의 일부 엔진 오류                                            | 등록 제조사별2축 실행 확인; 원문·사건은 미검토              |

32개 질의 생성에는 false 설정으로 215.472초가 걸렸다. 원출력은 일부 ja/zh/de 칸도 영어로 작성했다. 최종 파일의 language 필드가 있다고 실제 현지어 탐색 성공으로 계산하지 않는다. 언어 보완 실패와 엔진 오류를 합쳐 빈 결과나 검증 완료로 덮어쓰지 않았다.

제조사/기존 후보 입력을 연결한 후속32질의 생성은 `qwen3.8:27b`, false,16,384문맥,온도0에서 모델 호출275.829초였다. 입력7,786토큰·출력1,281토큰이며 독일어2·중국어2질의는 언어별로 한 번씩 보완했다(16.475초·10.860초). 원32칸과 지역/축/언어를 보존한 최종 계획은 스키마/언어 사전 검사를 통과했다. 같은 run 재개138ms에서 최종 파일 SHA-256이 그대로 유지됐고 추가 생성은 하지 않았다. 이는 한 번의 측정이며 p95·하루 처리량·의미 품질 개선의 증거는 아니다.

직접 읽은 로봇4칸은 일반적인 기술/증설/계약 질의 중심이었다. 이름이61개 입력의 일부로 포함됐다고 제조사별 확인 완료로 판단하지 않았다. 후속 구현에서32개 열린 분야 탐색을 유지하며 별도 제조사30질의를 추가했다. slot별 후보·세부 연구 주제와 고객/공급사 후속 연결은 남아 있다. 모델의 지역/언어 사전 검사와 질의 내용의 독서·탐색 품질 검토를 분리한다.

이 계획의 후속 managed-search는32질의를 실제 실행해636개 후보 관측·617개 고유 source key를 보관했다. 질의 요청 실패는0이지만29질의에 일부 엔진 오류가 있다. 소유한 검색 프로세스PID86914는SIGTERM으로 종료됐고 `registry-state/search-service.json`에 같은owner의 stopped 기록이 남았다. 관측 수를 기사 수나 입력13개 후보의 검토 완료로 계산하지 않는다. 실제 원출처·날짜·발행 중복·내용 검토가 다음 단계이며 기존 backlog 실제 병합은 이 실행에서 요청하지 않았다.

Universal Robots의 과거 parse는 날짜 null로 보존했다. 새 profile과 worker로 별도 parse `aa6edcab059ed55b03dee9662f451bcba8e0e5794f11b41e79c13b0eea05329f`에서 dateline 2026-09-14·정확한 DOM 위치를 확인했다. 관측일 2026-09-27은 별도 필드다. 메타데이터와 dateline 충돌을 재현한 회귀시험은 한쪽 값을 덮어쓰지 않고 null·후보를 보존한다. 기존 2026-09-20 회차 사건 ID `ebcefe563a8a7faf`를 유지하며 오늘 새 사건으로 재발행하지 않는다. 모델 사실/기사 승인·공개 원본 반영은 아직 수행하지 않았다.

두산 뉴스의 요청URL은 실제로 영문 홈페이지로 이동했다. KUKA 독문뉴스·ABB/JAKA/AUBO 등은 링크 후보가 없는 시작/목록 응답을 받았다. 전부 뉴스0건이라고 판단하지 않는다. 원문/최종URL, parse, 후보 수와실패를 분리해 다음 route/profile 작업에 사용한다. Techman2경로·레인보우1·ESTUN중문1의 실패는 robots 읽기 실패다. 정책 실패를 무시해 상세 요청을 강행하지 않았다.

HD목록 후속 규칙은 `data/research-acquisition.json:route-hd-news-ko.parse_options.listing_link_rules`에 있다. worker는 JavaScript를 실행하지 않고 관측한 `view.utils.href` 전체 문자열의 URL만 추출한다. 패턴 매치/선택 수/상한과 DOM 근거를 저장한다. 실제3개 항목의 원문 버전은 같아도 기사주소가 서로 다르므로3후보이며, 개별 사건 검토는 각각 수행한다. worker/registry/설정 해시 변경을 run input에 포함해 낡은 수집 stage 재사용을 막는다.

62질의 실제 실행은 제조사 추가 계획과 검색의 journal이 각각 완료됐지만 원문 검토는 하지 않았다. 기본32개 질의455관측과 제조사30개 질의227관측을 합쳐682관측이며 고유key는642개다. 모든 후보의 `review_status`는 `unreviewed`다. 기존 영속 backlog를 변경하는 옵션은 이 실행에서 사용하지 않았다. 요청 실패0과62질의 일부 엔진 오류를 함께 보관한다. 소유 서비스PID96515·owner `0b62b4ae-2bbb-477e-926f-d06dc85e5646`는SIGTERM으로 종료됐고 같은owner의 `state=stopped` receipt를 확인했다. 검색 단계를7회 운영1회나 공개 발행으로 계산하지 않는다.

## 10. 테스트와 로컬 검증

실행한 검증 명령의 종류는 다음과 같다. 아래 표는 원문 다양화 단계까지의 보존 기록이다. 용어·기사·지도 연결은 [26.5절](#265-최종-전체-사본채널브라우저-검증)의 전체366개·garden203개·집중35개와 private v4, 이후 Markdown·재파싱·추가 소급은 [27.5절](#275-회귀현재-상태정확한-다음-작업)의 전체367개·worker22개와 최신 사본을 따른다. 이 목록은 배포 확인이 아니다.

```bash
node --test tests/research-runtime.test.mjs tests/research-projection.test.mjs tests/research-review.test.mjs tests/research-search.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_research_worker.py'
python3 -m unittest discover -s tests -p 'test_drive_sync.py'
npm test
npm run validate
npm run build
node scripts/verify-site.mjs
.local/research/local-ai/runtime/venv/bin/python -m pip check
git diff --check
```

| 결과                          | 기록된 범위                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| JS 전체335개 통과             | 정정 CLI/승인 재검사·전체 회차 보존·기존 작성 검증기·뉴스 발표일 회귀 추가;45suites·실패/skip0 |
| worker15개 통과               | 제목/날짜/목록·인물 카드 + ETRI·중문 단위/각주·외부 레이아웃 표·독문 기사 날짜 회귀            |
| source staging3개 통과        | Node 목록 호출·원본 ZIP 보존·미결 상태·바이트 손상 시 중단; 로컬 시험                          |
| 기존 Drive 7개 통과           | 동기화 관련 회귀; 새 후보의 원격 업로드 증거는 아님                                            |
| 이번 TypeScript/validate 통과 | `npx tsc --noEmit`, `npm run validate`;436notes·v2 26회차                                      |
| 이번 build/site 통과          | 249 reader pages·251HTML·87사건·16개념·17관계·RSS40개; 로컬 생성 검증이며 공개 배포는 아님     |
| 의존성 검사 통과              | 격리 venv에 깨진 requirement 없음                                                              |

신규 테스트는 SSRF·DNS·리다이렉트·조건부 304·캐시 손상·Retry-After, 경로 탈출·심볼릭 링크·잠금·재개, 거짓 인용·버전 혼합·수치 조건·계획의 완료 전환, 미지원 think·잘린 출력, backlog와 고정 ID, 공개 필드 허용 목록, 소급 회차 기사 누락 차단, 지식 정정 영향, 비교 회차 중복 집계를 확인한다. 추가 회귀는 정정 스키마·실제 boolean·deferred·검토 집합·반복 archive·전부 실패한 조사 칸·robots 손상·private 검색 설정·고정 32칸·언어 보완 실패·엔진 장애·뉴스룸 목록 제외를 다룬다.

제조사 후속의 직접 결과는 source-registry5개와 search-context3개 추가 회귀를 포함한 집중29개 통과다. 기존71route ID/URL·기업32/기관16 보존, 제조사15등록, 같은 회사 그룹/언어 분리, 실제 후보/발행 대조·과거 중요 후보·분야/예산/큐 보존을 검증했다. 로그는 private `robot-context-*-20260927.log`, raw/stage/context/replay는 두 제조사/HD run 아래에 있다. 실제 모델의 한 계획을 재개해도 새 운영1회로 세지 않는다.

제조사별30질의 후속은 search/registry 집중21개와 JS전체285개·45suites 통과다. 추가3회귀는15개 회사·5개 언어·2개 축·날짜 순환/재정렬,62개 v2완전성/누락/변조/v1호환,제조사 질의 실패 후 실패분만 재개·후보 provenance를 확인한다. 전체 로그는 `.local/research/local-ai/documentation-current-tests-20260927.log`에 보존했다. 기존 build/site 통과 기록은 이전 생성 검증이며 이번 문서 갱신에서 공개 배포를 다시 실행한 것은 아니다.

60건 실제 원문 평가·보류 20건 독립 평가·최대 메모리·하루 처리량·실물 모바일 검증은 아직 이 시험에 포함되지 않았다. 이후 private 전체 사이트의 실제 Chrome 키보드/탭/URL과390px viewport 검증은 [20절](#20-비공개-정정승인전체-사이트-검증)에 별도로 기록했다. `npm run publish`는 commit·push를 수행하므로 테스트 명령으로 사용하지 않는다.

예산/심층 변경의 JS·타입·데이터 검사 로그는 private `extraction-role-budget-all-tests-v2-20260927.log`, `extraction-role-budget-typecheck-20260927.log`, `extraction-role-budget-validate-20260927.log`다. 이후 출처별 파서 변경까지의 최신 전체 JS331개 로그는 `source-diversity-all-tests-20260927.log`, worker15개는 `source-diversity-worker-tests-v4-20260927.log`다. 로컬 생성·링크 검사는 `extraction-role-budget-build-20260927.log`, `extraction-role-budget-site-20260927.log`에 있다. staging·Drive 회귀는 이전 `archive-batch-prepare-drive-tests-20260927.log`, `archive-batch-drive-regression-20260927.log`다. 코드 회귀와 실제 원문 의미 평가·Drive·공개 발행을 구분한다.

이후 기사별 verified의 빈 분석 관문을 보강했다. 재현 실패는 `unreviewed-analysis-gate-red-20260927.log`, 집중21통과는 `unreviewed-analysis-gate-green-20260927.log`, 최신 전체331통과·TypeScript·build/site는 `unreviewed-analysis-gate-all-tests/typecheck/build/site-20260927.log` 각각에 있다. 새 build249페이지·링크 검사251HTML/249검색/RSS40을 확인했다. 새 경로 기사 세 건을 발행한 것이 아니라 기존 공개 입력으로 검사한 로컬 생성이다. 데이터436notes/v2 26검사는 `source-diversity-validate-20260927.log`에 보존했다.

## 11. 실패·재개·원격 보관

1. 원문 실패는 source status로 남기고 원문을 읽은 성공으로 승격하지 않는다.
2. 파서 실패는 원 바이트를 보존한다. 파서 코드·설정 변경 시 새 parse ID로 재처리한다.
3. 모델 실패는 원문·단계 기록을 남긴다. 스키마를 느슨하게 하거나 빈 기사를 반환하지 않는다.
4. 근거 부족·잘못된 이름·수치는 해당 주장을 검토 대기로 두거나 제외한다. 다른 검증 사실의 이용 여부를 별도로 판단한다.
5. 같은 입력으로 완료된 stage를 재개할 때 checkpoint 무결성을 검사한다. 입력이 달라지면 새 run ID를 사용한다.
6. lock이 남으면 PID·현재 작업·산출물을 먼저 확인한다. 현재 코드는 오래된 lock을 자동으로 빼앗지 않는다. 임의 삭제·중복 실행을 하지 않는다.
7. Drive 충돌·누락·불완전 snapshot이면 공개 발행을 막는다. 모델·로컬 검증 성공으로 우회하지 않는다.
8. 원격 업로드가 모호하면 기존 ID·내용을 재읽어 확인한다. 새 이름으로 중복 업로드하는 것으로 해결하지 않는다.

새 로컬 자료를 `prepare-drive.py` staging으로 묶는 연결은 구현했지만 이번 후보의 실제 Drive 저장·재읽기는 남아 있다. 원문/검토/제외 이유는 private Sources·Research·Archive, 공개 승인 원본은 기존 네 폴더로 나눈다. 로컬 ZIP 생성이나 업로드 응답만으로 원격 내용 일치를 주장하지 않는다. 원격 ID·부모·크기·내용 해시 또는 전문 대조 결과를 연결한다.

현재 기존 Codex Drive 커넥터의 단발 읽기는 정상 확인했다. 이를 Mac 단독 OAuth·상시 연결 완료로 계산하지 않는다. 커넥터 토큰을 추출해 로컬 코드에 재사용하지 않는다. 독립 인증은 P5에서 지원 방식과 실제 동의를 확인하고 지정된 private 시험 경로에서 왕복 검증한다.

## 12. 다음 구현 순서와 종료 조건

| 순서 | 구체적인 다음 산출물                                    | 완료 증거                                                    |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | 실제 원문 초기 10건과 gold 기록                         | 이름·날짜·수치·계획·필요 설명의 직접 검토                    |
| 2    | 제조사15개 데이터·경로 활성화·backlog/실패 칸 질의 보강 | 현지어 보완/질의별 재개는 구현; 제조사별 원문·경로 검증 추가 |
| 3    | 출처별 날짜·페이지네이션·첨부와 표/OCR 보강             | 정상/과거/정정/차단/큰 자료 회귀시험                         |
| 4    | 큰 입력 분할·심층3형식 실물 작성·검토 시점/근거 보강    | 논문 조건·교수 관계·분석 의미의 실제 원문 대조               |
| 5    | 동일 조건 모델 비교·40개 개발/20개 보류 평가            | 핵심 오류 0, 편집 점수, 시간·메모리 분리                     |
| 6    | 승인 회차 private 작업 사본의 웹·RSS·digest             | 같은 요약/설명/원문·기존 ID·날짜·모바일 확인                 |
| 7    | 전체 구형/v2 소급과 Knowledge/Signals/TrendTopics 연결  | 전체 inventory 판정·제외 전파·과거 시점 보존                 |
| 8    | Drive private 묶음 왕복·충돌·독립 인증·재개             | 실제 원격 읽기·해시·복구 시험                                |
| 9    | 기존 08시 안에서 실제 7회 비교                          | 서로 다른 회차·legacy 발행 검증·candidate 비공개 검토        |
| 10   | 지원 운영 전환·첫 새 경로 발행                          | Drive·공개 URL·RSS·GitHub·WebsiteData 실물 대조              |

전체 자료 재검토와 일일 실행 개발은 별도 진행 축이다. 작은 묶음으로 검증할 수 있지만 최신 기사 한 건의 성공으로 전체 완료를 선언하지 않는다. 기존 운영 감사 5회는 로컬 후보 비교 7회의 증거가 아니다. 같은 회차를 7번 재실행해 성공 횟수로 세지 않는다.

기본 운영은 검토 지원형이다. 무인 자동 발행은 검토를 대체할 범위와 별도 독립 평가·장기간 운영·실패 차단 기준을 먼저 확정한다. 현재 promotion 모듈도 이를 자동 승인하지 않는다.

### 12.1 핵심 구현 이후의 확장

- 기업 전략의 목표와 투자·인력·계약·고객 도입을 시간순으로 연결하는 실행 추적.
- 원문 정정이 기사·용어 설명·누적 판단에 영향을 주는 범위를 자동 탐지.
- 주간 변화·기업/용어별 RSS·근거가 있는 과거 기록 질의응답.
- 놓친 분야·고객/공급사 경로를 실제 조사 로그로 추천.
- 읽기 기록·북마크·음성 브리핑. 정확한 원고와 단일 발행 경로가 안정된 뒤 검토.

## 13. 공식 문서와 프로젝트 재개 위치

공식 API·라이브러리 기능과 이 프로젝트의 실물 시험 결과를 구분한다. 다음 링크는 구현 근거이며 개별 사이트의 수집 완전성이나 기사 품질 합격 증거는 아니다.

- [Ollama Chat API](https://docs.ollama.com/api/chat), [Thinking](https://docs.ollama.com/capabilities/thinking), [구조화 출력](https://docs.ollama.com/capabilities/structured-outputs).
- [Trafilatura 핵심 함수](https://trafilatura.readthedocs.io/en/latest/corefunctions.html), [PyMuPDF Page](https://pymupdf.readthedocs.io/en/latest/page.html), [RapidOCR](https://rapidai.github.io/RapidOCRDocs/main/quickstart/).
- [SearXNG 검색 API](https://docs.searxng.org/dev/search_api.html), [SearXNG 설정](https://docs.searxng.org/admin/settings/settings.html).

실제 진행·검증·다음 재개 위치는 기존 [CODEX_TASK_STATE.md](../CODEX_TASK_STATE.md)의 2026-09-27 기록과 `.local/research/local-ai/`의 private 실행 기록을 함께 확인한다. 새 기억 DB나 중복 예약은 만들지 않는다. 다음 작업자는 현재 Git 변경을 먼저 읽고 이미 있는 계획·구현·사용자 변경을 보존한다.

## 14. 현재 작은 계약과 목표 계약의 차이

설계 JSON과 현재 저장 파일을 같은 스키마처럼 취급하지 않는다. 현재 코드가 반환하는 필드를 기준으로 어댑터를 작성하고, 목표 필드를 추가할 때 기존 ID·근거·읽기 호환성을 검증한다.

| 대상      | 현재 계약·파일                                                  | 확장할 목표                                         | 현재 완료로 보지 않는 부분                     |
| --------- | --------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| 발견 후보 | `key`, `source_urls`, `review_status`, 제목·발견 경로           | 목표 계약의candidate_key 매핑·원발표 계열·목록 커서 | 검색 후보를 사건 사실/전체 조사 완료로 승격    |
| 문서      | original/final URL·source/version·MIME·해시·관측 시각           | 채널 정책/첨부 역할·버전별 정정 영향                | URL과 event ID를 일대일로 병합                 |
| 파싱      | title·dates·blocks·locator·quality·첨부 후보                    | 복잡한 표의 셀/헤더/단위/각주·장문 재개             | 자동 첨부 전문 검토·모든 OCR 수치 정확성       |
| 사실      | statement·subject·kind/state·날짜·numbers·evidence              | 주체 ID·정규화 숫자·기간/분모/비교 조건·수정 의존   | 문자열 검사만으로 의미/계약 이행 확정          |
| 사실 검토 | exact claim 집합·verified/deferred/rejected·직접 검토·정정 이력 | 엄격한 검토 시점·독립 평가·검토자 종류              | 보관된 체크값 자체를 독립 검토 행위로 계산     |
| 초안      | 리드·설명·태그·문장 근거; deep-context로 세 심층 형식 연결      | 실제 심층 품질·장문 처리·인물 식별의 전체 연결      | 모델 원출력을 무검토 공개 원고로 사용          |
| 승인 기사 | 기존 event ID·source URLs·record·article review                 | 논문/관계/topic IDs와 실제 지식 연결                | 승인 JSON 생성과 Drive/실제 발행을 동일시      |
| 회차 투영 | 고정 날짜/cutoff/전체 ID를 보존한 approved-vault                | 별도 private 전체 웹/RSS/digest 검증·일일 연결      | 일부 기사 입력으로 나머지 기사 제거            |
| 원격 보관 | 로컬 archive manifest·private staging                           | Drive file ID/parent/내용 재읽기·충돌 receipt       | `drive_verified=false` 결과를 원격 완료로 변경 |

현재 facts에서 빈 육하원칙 값은 기존 형식 어댑터의 내부 메타데이터에 `미기재`로 남을 수 있다. 독자 본문은 검증된 리드/설명만 사용하며 빈 사실을 안내 문장으로 채우지 않는다. 이 내부 표현이 RSS·검색·태그 화면에 노출되지 않는지도 후보 전체 미리보기에서 검사한다.

사실 검토 함수는 빈 parses를 받더라도 deferred/rejected 같은 내부 기록만 만들 수 있다. verified는 §8.1의 근거·달력·검토 해시 계약을 충족해야 한다. 실제 원문 보관 바이트는 CLI에서 다시 검사한다. 의미 대조·독립 검토·장기 운영 검증은 이 구조 검사와 별도로 수행한다.

### 14.1 단일 기사의 실제 파일 흐름

```text
원문 URL
  → documents/<source-id>/<body-hash>/body.bin + document.json
  → parses/<parse-id>/parse.json
  → runs/<run-id>/documents.json + parses.json
  → claims.json                         모델 추출·미검토
  → reviewed-claims.json                원문 직접 검토·정정
  → draft.json + preview.md             검토 사실로 작성한 private 초안
  → approved-article.json               정확한 draft ID에 대한 편집 승인
  → approved-vault/Editions/...         회차 전체 계약을 보존한 private 투영
  → Drive 보관·재읽기 → 기존 생성/발행  아직 새 경로 전체 연결 미완료
```

facts 검토와 editorial 승인 파일은 같은 review 입력이 아니다. 검토자가 변경한 사실은 새 claim ID와 previous claim ID를 남기고, 초안 변경은 새 draft ID와 이전 draft의 이력을 남긴다. 정정 이후의 초안은 바뀐 사실 ID를 다시 참조해야 한다. 모델 원출력·수정본·승인본의 해시를 따로 보존한다.

회차의 다른 기사·Signals·TrendTopics를 포함한 작업 사본을 만들기 전까지 단일 preview.md를 서비스 전체 미리보기 완료로 계산하지 않는다. 후보 preview는 root vault, 기존 RSS, digest, source snapshot을 바꾸지 않는 별도 private 작업 사본에서 기존 생성 코드로 만들어야 한다.

## 15. 실제 원문 평가 자료 고정과 재현 실행

### 15.1 구현한 명령과 저장 구조

[evaluation.mjs](../scripts/research/evaluation.mjs)의 `evaluationSpecSchema`, `saveEvaluationCase`, `loadEvaluationCase`를 추가했다. `gold-case`는 원문을 읽은 검토자가 작성한 명세를 받아 기준 자료를 저장하며 모델을 호출하지 않는다. `extract --source-run`은 저장 원문을 재수집하지 않고 실제 바이트·canonical parse·입력 해시를 검사한다.

```text
evaluation/
  specifications/<case>.json          직접 작성한 명세 입력; CLI는 --review로 지정
  fixtures/<case>/
    manifest.json                     명세·원문 목록·parse·gold 해시
    documents/.../body.bin            취득한 실제 원문 바이트의 사본
    parses/<parse-id>/parse.json       정확한 파싱 결과 사본
    runs/source/documents.json        사본의 원문 identity·관측 시각
    runs/source/parses.json            사본의 파싱 목록
  gold/<case>.json                    status와 원문 검토 명세
  runs/<evaluation>/...               직접 대조 결과; 자동 종합 채점기는 미구현
runs/<import-run>/evaluation-case-<case>.json
                                      보관 receipt; model_evaluated=false
```

모든 파일은 `.local/research/local-ai/` 아래 비공개로 보관한다. `atomicWrite`는 파일 권한0600·원자 교체를 사용하고 `safePath`는 경로 탈출·심볼릭 링크를 거부한다. 기존 run별 archive manifest가 이 평가 디렉터리와 모든 원문 사본을 자동 포함하는 것은 아니다. Drive 보관 묶음 연결·재읽기는 P2/P5의 남은 작업이다.

실제 시행한 기준 자료 등록 예:

```bash
node scripts/research.mjs gold-case --run 20260927-gold-source-first-v1 --source-run 20260927-ur-gen7-dateline-v1 --review .local/research/local-ai/evaluation/specifications/ur-gen7-20260914-dev-v1.json
```

등록된 원문을 같은 private root에서 재사용한 실제 추출:

```bash
node scripts/research.mjs extract --run 20260927-ur-gen7-frozen-qwen-false-v1 --source-run 20260927-ur-gen7-dateline-v1 --think false
```

향후 작업 캐시의 변경에도 영향을 받지 않는 사본을 평가 입력으로 쓰는 명령 예시는 다음과 같다. 아래 run은 실제 완료 기록을 가리키지 않는다.

```bash
node scripts/research.mjs extract --root .local/research/local-ai/evaluation/fixtures/ur-gen7-20260914-dev-v1 --run comparison-qwen-false-01 --source-run source --think false
```

저장 원문 재사용은 `extract`·`gold-case`·`reparse`에서 지원하며 live `--url`·`--channel`과 혼합하지 않는다. 출력 run과 source run은 달라야 한다. 같은 추출 run의 원문 목록·파싱·모델·추론·모듈 입력이 달라지면 새 run ID가 필요하다. 같은 입력의 정상 checkpoint는 모델을 다시 호출하지 않으며 손상된 실제 원문·parse·checkpoint는 거부한다. 재파싱은 [17절](#17-사이트별-파싱과-원문-재사용의-실제-검증)을 따른다. 재사용을 당일 새 수집·새 운영 회차로 세지 않는다.

### 15.2 명세와 검토 상태

| 필드           | 실제 계약                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| identity       | `case_id`, 실제/합성 `origin`, development/heldout `split`, 기존 `event_id` 또는 null                               |
| 범위           | 기존 8분야의 `sectors`, 원문 `languages`, 사건/세 심층의 `article_kind`, 전문/초록/부분 `document_scope`            |
| 검토           | reviewer·human/codex·실제 검토시각·source_read·candidate_output_seen·independent_of_candidate_output·직접 검토 메모 |
| 사실           | 고유 fact ID·core/supporting·기존 추출 스키마의 statement/subject/state/date/numbers/evidence                       |
| 설명·금지 변형 | 고유 ID·본문·해당 사실 ID 목록; 알려지지 않은 사실 참조 거부                                                        |
| 버전 수정      | 선택적 `supersedes`; 이전 기준을 덮어쓰지 않고 같은 정확한 원문/parse 사본의 새 case ID로 등록                      |

사실의 원문 버전·구간·인용·숫자·날짜를 검사한 후 저장한다. 원문 인용의 존재와 검토 메모가 의미 적합성의 독립 증명은 아니다. 직접 읽은 기준 사실과 후보의 의미 대조는 별도로 기록한다.

`gold` 경로에 파일이 있다고 모두 최종 평가 정답으로 세지 않는다.

| 저장 상태                   | 의미                                                                        | 최종 독립 gold 계산              |
| --------------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| `synthetic`                 | 오류를 재현하는 합성 fixture                                                | 제외                             |
| `source_reviewed_candidate` | 실제 원문 직접 검토; Codex 검토 또는 후보 노출 뒤 검토                      | 독립 사람 gold에서 제외          |
| `independent_gold`          | 사람 검토자가 실제 읽기·후보 미노출·독립 기준 작성을 명시적으로 기록한 자료 | 실제 검토 provenance를 함께 확인 |

코드는 사람의 읽기 행위를 판별하지 않는다. `human` 입력과 boolean은 검토자의 명시적 진술이며 임의로 생성해 독립 평가 완료로 계산하지 않는다. heldout은 실제 자료·미노출·후보와 독립된 기준만 등록할 수 있다. 후보를 이미 읽고도 독립이라고 표시하거나 합성 자료를 heldout에 넣으면 거부한다. 이후 heldout 사용·튜닝 노출 감사와 후보별 자동 평가 보고서 연결은 미구현이다.

동일 명세 재등록은 기존 해시·사본을 검증하고 같은 receipt를 반환한다. 같은 case ID의 기대 사실·원문·파싱 변경은 거부한다. 작업 원문 캐시를 바꾸더라도 고정 사본은 유지되며, 사본이나 gold 파일 손상은 재읽기에서 거부한다.

### 15.3 현재 확보한 실제 개발 기준 자료

| 활성 case                                    | 실제 원문·검토                                          | 기대 사실·경계                                                  | 현재 판정                                    |
| -------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `ur-gen7-20260914-dev-v1`                    | UR 영어 공식 발표20구간; 신규 후보 이전 기준 작성       | 6사실: 발표·3개 암·플랜지/감지·CB7·외부 AI·TP7                  | 직접 검토 후보; 로컬 원출력 합격 아님        |
| `fanuc-ai-welding-bilingual-20260911-dev-v2` | 공식 영어23·일본어22구간 직접 대조                      | 6사실: 발표/시연/출하 계획·도면→용접·카메라·보안 귀속·구독·전원 | 직접 검토 후보; 기존 후보에 노출된 개발 자료 |
| `fanuc-quarterly-202606-ja-pdf-dev-v1`       | 10쪽/211구간/12표; 핵심 관련 페이지1/2/4/5/10 시각 대조 | 6사실: 회계기간·연결 실적·로봇 부문·전망 수정·환율·보고 경계    | 직접 검토 후보; 로컬 모델 평가 미실행        |

이 절의 최초 개발 기준은 세 범주·18사실·원 URL4개다. 언어는 영어·일본어, 분야는 로봇·제조에 한정돼 있으며 8분야·5언어·초기10건 완료로 세지 않는다. 이후 전략·논문·사업화와 다른 분야를 추가한 현재11사례/71사실은18.6·18.7절을 따른다. 독립 사람 gold와 heldout 완료는0이다. FANUC v1은 기존 기사 ID를 명시한 v2로 대체됐으며 과거 기준 파일을 보존한다. v1/v2를 별도 사건 두 건으로 합산하지 않는다.

UR 기존 사건 ID는 `ebcefe563a8a7faf`, FANUC 용접은 `eb739a02acad3ab9`다. 원 발표일은 각각9월14일·9월11일로 유지한다. IR 원 발표일은 PDF 본문에 있는7월31일이다. 모두 과거 사건이며 이번 작업으로 오늘의 새 뉴스나 소급 검토 완료 수를 늘리지 않았다.

### 15.4 UR 실제 모델 출력과 직접 편집

Qwen3.8/false/16,384 context/온도0로 같은 저장 원문을 추출했다. 5사실 생성에156.087초, 구조 검사 통과2개·단위 표기 오류3개였다. `percent`·`model`을 원문 단위처럼 넣었고, 기준 사실 중 플랜지/감지 및 외부 AI 처리 설명을 누락했다. 원출력은 `runs/20260927-ur-gen7-frozen-qwen-false-v1/claims.json`에 보존한다.

원문을 다시 읽어 단위·비교 조건을 정정하고 누락된 기능을 **편집자가 보강**한 뒤5사실을 검토했다. 이 보강은 로컬 모델의 자체 정확성 점수에 포함하지 않는다. 한국어 초안 생성은158.729초였다. 구조 검사에서 문제가 없었지만 실제 읽기에서 다음 의미 오류를 확인했다.

- footprint를 부피로 바꿨다.
- more than 20%를20% 이상으로 옮겼다.
- 회사가 제시한 성능·인증의 귀속이 일부 문장에서 빠졌다.

원본 `draft-original.json`을 보존하고 `correctDraft`로 설치 면적·20% 초과·회사 귀속을 수정했다. 수정 원고는 고정 ID로 `approved-article.json`을 생성했으며 공개 작성 원본·RSS·GitHub·Drive를 변경하지 않았다. 평가 기록은 `evaluation/runs/ur-gen7-qwen-false-20260927-v1/`에 원출력과 편집 결과를 구분해 둔다.

작성 지침에 비교 연산자·물리량·귀속 보존을 추가했다. 새 Ollama 호출부터는 `model_artifacts`에 정확한 request/messages/schema/options와 원 response content 및 각 SHA를 보관한다. 모델의 내부 reasoning 텍스트는 저장하지 않는다. 이전 호출에는 해시와 추출/초안이 있었지만 정확한 요청 envelope를 소급 생성해 실제 호출 기록처럼 표시하지 않는다. 바뀐 지침의 실제 품질 검증은 별도 run에서 수행하고 다국어·심층·60건 평가로 확장한다.

같은 검토 사실로 실행한 `20260927-ur-gen7-editor-prompt-v2`는160.312초였으며 request/response/output 해시가 일치했다. 지침을 강화해도 footprint→부피·초과→이상 오류가 반복됐고 Universal Robots를 “유니버설 로보틱스”로 바꿨다. 구조 검사 통과와 별개로 직접 편집 검토에서 미합격이며 새 원고는 승인·발행하지 않았다. `editor-prompt-v2-review.json`에 실패를 보존했다. 프롬프트만 수정하면 해결됐다는 근거로 사용하지 않는다.

### 15.5 같은 작성 입력의 Qwen·Gemma 비교와 본문 ID 차단

직접 검토한 UR 사실을 같은 JSON으로 제공하고 messages·schema·options·think·keep_alive의 해시와 값을 대조했다. 모델만 바꾼 두 실제 호출의 결과는 다음과 같다. 이는 **한 사건의 한국어 작성 비교**이며 사실 추출·검색·심층·독립 평가·하루 처리량 비교가 아니다.

| 항목             | Qwen3.8:27b                                      | Gemma4:31b-mlx                                        |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------- |
| 실제 run         | `20260927-ur-gen7-editor-prompt-v2`              | `20260927-ur-gen7-editor-gemma-false-v1`              |
| 설정             | false / context16,384 / num_predict4,096 / 온도0 | 동일                                                  |
| 실제 시간        | 160.312초                                        | 83.080초                                              |
| 설치 포맷·양자화 | GGUF / Q4_K_M / 27.3B                            | safetensors / nvfp4 / 31.7B                           |
| 회사명           | Universal Robots를 잘못 옮김                     | 원 표기 유지                                          |
| 물리량·범위      | 설치 면적을 부피로, 초과를 이상으로 바꿈         | 설치 면적·20% 초과 유지                               |
| 다른 오류        | 회사 주장 귀속 누락                              | 내부 claim ID를 본문에 출력, 일부 회사 주장 귀속 누락 |
| 최종 판정        | 원출력 미합격·공개 승인 없음                     | 원출력 미합격·공개 승인 없음                          |

Gemma digest는 `637cc0ff15709212de4aa694be67e3af5e80533ca538c86ad69c53c511e40840`, Ollama는0.34.4였다. 동일 입력 조건을 검사했지만 모델 크기·양자화·실행 backend와 로드 상태는 다르다. 이 한 건의 시간을 모델 전체 우열이나 성능 목표로 일반화하지 않는다. 최대 메모리·스왑·반복 측정도 아직 수행하지 않았다. 두 모델 모두 통과하지 않았으므로 기존 기본 모델이나 자동 승인 정책을 바꾸지 않았다.

`controlled-editor-comparison.json`은 같은 입력 검사·두 provenance·request/response/output 해시 일치를 저장한다. `editor-gemma-false-review.json`에는 원출력의 오류와 직접 판정을 남겼다. 두 파일은 앞 절의 비공개 evaluation run 경로에 있으며 기존 원출력·초안을 덮어쓰지 않았다.

Gemma 실제 초안은 ID 차단 추가 전 구조 검사에서 `problems=[]`였으나 리드와 설명에 두 개의 내부 사실 ID가 나타났다. 이를 그대로 발행하지 않았다. [projection 회귀 테스트](../tests/research-projection.test.mjs)에서 제목·리드·설명 소제목·본문의 네 위치를 각각 재현했고 수정 전 실패를 확인했다. [editor.mjs](../scripts/research/editor.mjs)의 `draftProblems`가 알려진 claim ID를 독자 문장에서 찾으면 `internal_claim_identity_in_prose`를 반환하도록 보강했다. `approvedArticle`은 저장된 problems 배열만 믿지 않고 다시 검사하므로 이전 초안에도 차단이 적용된다.

검토 참조는 각 문장의 `claim_ids` 배열에만 저장한다. 제목·소제목·본문에는 출력하지 않는다고 작성 지침도 명시했다. 실제 Gemma 원출력을 재검사해 같은 차단 오류를 확인했으며, 이 수정 후 다시 모델을 호출했다고 기록하지 않았다. `gemma-reader-id-leak-before-20260927.json`, `gemma-reader-id-leak-after-20260927.json`과 수정 전/후 시험 로그를 보존한다. 수치·귀속의 의미 검사는 이 ID 차단만으로 해결되지 않으며 직접 읽기와 이후 실제 평가를 계속 요구한다.

## 16. 심층 세 형식의 구현 계약과 실행

### 16.1 현재 구현 범위

`deep-dive.mjs`는 검토된 사실을 심층 분석에 필요한 역할로 묶는다. `research.mjs deep-review`가 원문 바이트·파싱·사실 검토를 재확인하고 묶음의 검토 기록을 저장한다. `draft --deep`는 그 사실만 모델에 제공하고, `approve`는 동일한 근거와 초안을 다시 검사해 기존 기사 형식으로 변환한다.

이 경로는 별도의 공개 지식 저장소를 만들지 않는다. 기존 `article_records.kind`, `papers`, `relations`, `topic_ids`를 사용한다. 합성 회귀에서 세 형식의 기사·회차 변환을 확인했다. 실제 원문6개를 확보·파싱했지만 세 형식의 모델 작성·원문 의미 대조·Drive·발행까지 완료한 기록은 아직 없다.

| 단계           | 코드와 입력                               | 저장 결과                   | 필수 검증                                                |
| -------------- | ----------------------------------------- | --------------------------- | -------------------------------------------------------- |
| 사실 검토      | `review`, 실제 claims·원문·parse          | `reviewed-claims.json`      | 사실의 정확한 버전·구간·인용·수치·날짜·검토 해시         |
| 심층 근거 검토 | `deep-review`, 검토 파일의 input/review   | `deep-context.json`         | 형식별 역할·전문 범위·원문 분류·논문/인물 식별·검토 순서 |
| 작성           | `draft --deep`, 검토된 context            | `draft.json`, `preview.md`  | 선택된 사실만 사용·역할별 설명·분석의 복수 사실 참조     |
| 편집 수정      | `correctDraft`, 실제 수정 원고            | 변경 이력과 새 draft ID     | 원출력 보존·근거/역할/본문 ID 재검사                     |
| 기사 승인      | `approve`, 정확한 초안 ID의 승인 파일     | `approved-article.json`     | 최종 문장 읽기·원문 대조·고정 사건 ID·원 발표일          |
| 회차 투영      | `editionProjection`, 메타데이터·승인 기사 | 기존 Editions Markdown 형식 | 전체 기존 사건 보존·심층 최대1건·기사 상한               |

`deep-review`와 `approve`는 모델을 호출하거나 원문을 새로 내려받지 않는다. `draft --deep`에서만 로컬 생성 호출을 수행한다. 모든 결과는 이 단계에서 `candidate_published=false`다.

### 16.2 형식별 근거 역할

| 형식        | 필요한 역할                                                | 근거가 있을 때만 추가할 역할 | 공개 설명에서 확인할 내용                                  |
| ----------- | ---------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| 기업 전략   | `goal`, `allocation`, `comparison`                         | `outcome`                    | 목표, 실제 투자·인력·계약, 이전 발표와의 차이, 확인된 결과 |
| 논문 해설   | `problem`, `method`, `conditions`, `comparison`, `results` | `constraints`                | 문제, 방법, 데이터·실험 조건, 비교 대상, 결과              |
| 연구 사업화 | `research`, `relationship`, `product`                      | `customers`, `funding`       | 기반 연구, 정확한 창업 역할, 제품화, 확인된 고객·투자      |

필수 역할이 없으면 해당 심층 입력을 거부한다. 선택 역할은 실제 근거가 있을 때만 넣는다. 빈 성과·미확인 고객·변명 문단을 채우지 않는다. 역할 이름은 비공개 구조다. 독자 소제목은 “데이터 수집 차량과 개발 조직”, “측정 신호와 비교 실험”처럼 구체적인 내용의 제목으로 작성한다.

심층 설명은1개 이상으로 작성하고 역할 수를 상한으로 둔다. 내부 `role`은 단일 문자열 또는 역할 배열이며 새 지침은 서로 관련된 역할을 배열로 묶는다. 한 항목에는1~3문단, 각 문단에는 실제 사실 ID를 둔다. 일반 기사의 설명 최대4개 제한을 심층 논문의5개 필수 역할에 그대로 적용하지 않는다. 모든 입력 역할과 역할별 **모든 배정 사실**이 그 역할을 담당하는 설명에 포함돼야 한다. 알 수 없는 역할·역할 배열 중복·해당 역할 밖 사실·필수 사실 누락은 거부한다. 여러 역할을 합친 뒤에도 각 문장의 원문 의미 대조는 필요하다.

`analysis`는 검토 사실2개 이상을 연결한 별도 편집 문장 또는 `null`이다. 분석을 쓸 근거와 추가 정보 가치가 있으면 공개 변환기가 `analysis_summary`와 출처가 있는 “분석” 설명에 연결한다. 모델이 같은 제목의 설명을 추가해 중복되는 경우를 차단한다. 분석이 단순 반복이거나 근거가 부족하면 `null`로 두며 기사 종류와 유효한 상세 설명은 보존한다. 웹 심층 분석 탭과 RSS/Markdown의 심층 섹션은 실제 `analysis_summary`가 있는 기사만 포함한다. 빈 분석 문단·탭·“분석하지 못했다” 등의 이유는 독자 본문에 출력하지 않는다.

복수 사실 참조는 논리적 적합성의 자동 증명이 아니다. “계획에 맞춰 차량 수집과 내부 개발 조직이 구체화됐다” 같은 비교도 실제로 원문이 지지하는지 최종 검토자가 읽어 판단한다. 회사 발표를 독립적인 매출·성능 검증으로 바꾸지 않는다.

빈 분석을 허용하는 기사 상태는 기사별 `review_status=verified`다. `article_reviews` 배열의 존재만으로 해당 기사가 검증 완료라고 판단하지 않는다. 실제 회귀에서 verified 원고를 unreviewed로 바꾸면 기존 검증이 잘못 통과하는 것을 먼저 재현했다. `scripts/editorial.mjs`를 기사별 상태 검사로 보강한 뒤21개 집중 시험과331개 전체 시험을 통과했다. 미검토 과거 원고의 기존 분석/내부 검토 조건을 이 변경으로 완화하지 않는다.

### 16.3 입력 파일과 식별자

실제 스키마는 [deep-dive.mjs](../scripts/research/deep-dive.mjs)의 `deepDiveInputSchema`다.

| 필드            | 실제 타입·역할                                      | 차단 조건                                                      |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| schema          | `deep-dive-input/v1`                                | 다른 버전·알 수 없는 필드                                      |
| kind            | 기업 전략·논문 해설·연구 사업화                     | 다른 기사 종류                                                 |
| topic_ids       | 기존 누적 주제 ID 배열                              | 빈 값·중복·잘못된 ID 형식                                      |
| event_claim_ids | 기사의 사건을 직접 확인하는 사실 ID                 | 알 수 없거나 미검토인 사실·배경 날짜로 사건 발표일을 교체      |
| basis           | role/claim_ids 배열                                 | 필수 역할 누락·중복·다른 종류의 역할·묶음 밖 사실              |
| sources         | 원문 버전·기관 ID·기관 종류·확보 범위               | 실제 참조 목록과 불일치·미확보 원문·부분 parse를 전문으로 사용 |
| papers          | 논문 ID·식별자·접근/출판 상태·전문 버전·사실 ID     | 전문 없음·DOI/arXiv 불일치·잘못된 버전 연결                    |
| relations       | 인물 ID/이름/소속·회사·역할·기준일·근거 URL·사실 ID | 같은 ID의 다른 이름·역할 오인·근거 없는 URL·미래 관계일        |

`organization_kind`는 company/university/research_institution/publisher/regulator/other, `scope`는 full_document/abstract_only/partial이다. CSHL 같은 연구소를 대학으로 잘못 등록하지 않도록 연구기관을 별도로 지원한다. 기관 종류와 범위는 검토자의 분류이며 도메인만으로 자동 확정하지 않는다.

기업 전략의 comparison에는 서로 다른 원문 버전2개 이상과 발표일2개 이상이 필요하다. 근거 기관은 기업 또는 공시기관이다. 같은 보도자료를 두 URL에서 수집한 것만으로 시계열 비교를 만들지 않는다.

논문은 access=전문, 출판 상태=사전공개/동료심사, 정확한 doi/arxiv 식별자, 실제 전문 원문 버전을 요구한다. 식별자는 원문 URL 또는 본문에 있어야 하며 각 설명 역할에 전문에서 나온 사실이 있어야 한다. 전문 scope의 parse는 extracted·누락 페이지 없음이어야 한다. 구조 검사는 Methods·결과를 실제 읽었다는 독립 증거를 대신하지 않는다.

창업·공동창업·기술이전에는 서로 다른 기관 ID·호스트의 대학/연구기관 자료와 회사 자료가 모두 필요하다. 자문·공동저자·소속만으로 연구 사업화 심층을 승인하지 않는다. 이는 두 자료가 같은 관계를 지지하는지 검토할 최소 입력 조건이며, 서로 다른 도메인이라는 이유만으로 독립 검증이 완성되는 것은 아니다.

### 16.4 검토 입력 예시와 명령

아래는 **기업 전략 입력의 작성용 예시**다. source version과 claim ID는 실제 실행 자료의 값으로 교체한다. 빈 검토자·시각과 false 값은 미검토 템플릿이다. true로 바꾸는 행위 자체가 읽기 검토의 증거가 되지 않는다.

```json
{
  "input": {
    "schema": "deep-dive-input/v1",
    "kind": "기업 전략",
    "topic_ids": ["company-example"],
    "event_claim_ids": ["claim-current-announcement"],
    "basis": [
      { "role": "goal", "claim_ids": ["claim-current-announcement"] },
      { "role": "allocation", "claim_ids": ["claim-current-resources"] },
      { "role": "comparison", "claim_ids": ["claim-prior-goal", "claim-current-announcement"] }
    ],
    "sources": [
      {
        "source_version_id": "prior-source:body-hash",
        "organization_id": "example",
        "organization_kind": "company",
        "scope": "full_document"
      },
      {
        "source_version_id": "current-source:body-hash",
        "organization_id": "example",
        "organization_kind": "company",
        "scope": "full_document"
      }
    ],
    "papers": [],
    "relations": []
  },
  "review": {
    "reviewer": "",
    "reviewed_at": "",
    "source_read": false,
    "source_roles_checked": false,
    "basis_checked": false,
    "identities_checked": false,
    "scope_checked": false
  }
}
```

사실 검토를 마친 같은 run에 파일을 작성하고 다음 순서로 실행한다. 아래 deep-strategy-example은 순서를 설명하는 예시 ID이며 실제 완료 run이 아니다.

```bash
node scripts/research.mjs deep-review --run deep-strategy-example --review .local/research/local-ai/runs/deep-strategy-example/deep-review-input.json
node scripts/research.mjs draft --run deep-strategy-example --model qwen3.8:27b --deep
node scripts/research.mjs approve --run deep-strategy-example --review .local/research/local-ai/runs/deep-strategy-example/editorial-review.json
```

선행 파일은 documents.json·parses.json·claims.json·reviewed-claims.json이다. deep-review가 deep-context.json을 만든다. `--deep`는 draft에서만 허용하며 `--provisional`과 함께 사용하지 않는다. 근거 검토 없이 옵션만 붙여 심층으로 승격하지 않는다.

편집 승인 파일은7.6절과 같은 실제 필드를 사용한다. draft_id는 context까지 포함한 초안의 정확한 ID다. source_read·final_prose_read·title_checked·dates_checked·numbers_checked·analysis_checked의 실제 검토, 고정 event_id, 원래 published_at, 실제 reviewed_at, 국내/해외/국제 공동 region을 요구한다.

### 16.5 재검토와 공개 변환

심층 검토는 input·참조된 검토 사실·parse·문서 메타데이터의4개 SHA를 저장한다. 사실 문장·기관 분류·논문 식별·관계·원문 관측 시각이 바뀌면 기존 context로 작성·승인할 수 없다. 다시 원문과 사실을 검토해 새 context와 draft ID를 만든다. 목록 순서와 실제 내용 변경을 구분하는 회귀가 있다.

검토 시점은 모든 관련 사실 검토·원문 관측·관계 기준일보다 빠를 수 없다. 기사 원 발표일은 event_claim_ids가 참조한 원문의 발표일과 일치해야 한다. 배경 공시·과거 연구의 날짜를 기사 발표일로 사용하지 않는다. 현재 검토일을 과거 발표일로 소급하지 않는다.

| 남기는 공개 필드                                       | 제거하는 내부 필드                                    |
| ------------------------------------------------------ | ----------------------------------------------------- |
| kind·topic IDs·논문 work ID/식별자/접근/출판 상태/원문 | 근거별 claim IDs·전문 source version ID               |
| 인물 ID/이름/소속·회사·역할·관계 설명·기준일·근거 URL  | 관계의 내부 사실 연결·기관 분류·검토 체크·해시        |
| 제목·리드·설명·분리된 분석·문단별 원문 URL             | deep-context 전체·draft ID·모델 로그·검토자·운영 판단 |

기존 editionProjection에서 하루 심층 최대1건과 모든 기존 사건의 보존을 검사한다. 소급 수정은 해당 회차 전체를 입력해 빠지는 기사 없이 변환한다. 과거 사건을 당일 새 회차로 만들지 않는다.

### 16.6 회귀 증거와 다음 실물 작업

[research-deep-dive.test.mjs](../tests/research-deep-dive.test.mjs)의8개 테스트는 합성 자료를 사용한다. 세 형식 변환, 이전 발표 없는 전략, 초록/부분 전문, DOI 불일치, 자문을 창업으로 오인, 같은 기관/호스트 근거, 관계 URL 불일치, context 변경, 발표일 혼동, 미래 관계일, 역할 밖 사실, 분석 본문의 내부 ID, CLI 원문 바이트 손상을 검사한다.

실제 세 형식 작업은 다음 순서로 계속한다.

1. 17절의 실제6개 원문에서 기준 사실과 금지 변형을 먼저 작성한다. Nature는 Methods·결과·비교 조건을 읽고 동물 실험을 사람·제품 성능으로 표현하지 않는다.
2. 기업 전략은3월 발표와9월 발표의 동일한 목표·실제 자원 배분을 대조한다. 예정인2028/2029년 생산을 현재 실적으로 바꾸지 않는다.
3. 연구 사업화는 CSHL과 회사 소개를 대조한다. Martin Akerman의 공동창업과 Adrian Krainer의 자문 역할을 구분하고 잠재 계약 대가를 받은 투자금으로 바꾸지 않는다.
4. 기준을 private development case로 고정한다. 기존 기사·후보를 이미 읽은 자료는 독립 heldout으로 분류하지 않는다.
5. 같은 기준의 로컬 원출력·편집 수정·직접 판정을 각각 보존한다. 수정한 승인 기사로 모델 정확도 점수를 높이지 않는다.
6. 고정 ID의 후보 회차를 비공개로 생성해 웹·RSS·digest의 문장·날짜·태그·원문 URL을 대조한다. 이후 Drive·실제 발행·공개 읽기 검증으로 이어간다.

## 17. 사이트별 파싱과 원문 재사용의 실제 검증

### 17.1 추가한 HTML 규칙

[research-acquisition.json](../data/research-acquisition.json)의 최초 심층 상세 profile은8개였다. 이후 About 인물 카드 profile1개를 더해 현재9개다. 기존 FANUC3개·UR1개를 보존하고 Envisagenics 발표/회사 소개·Nature 논문·현대차 영어/한국어 발표5개를 추가했다. URL 패턴은 확인한 페이지에 한정하며 사이트 전체의 범용 규칙으로 간주하지 않는다.

| 페이지                    | 제목                               | 본문                               | 발표일                                                      |
| ------------------------- | ---------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Envisagenics 협업 발표    | `//main/article/header//h1`        | `//main/article`                   | `//main/article/header/div/span`, `%B %d, %Y`               |
| Nature RamanOmics         | `//h1[@data-test='article-title']` | `//main/article`                   | `//article//header//time[@datetime]`의 datetime, `%Y-%m-%d` |
| 현대차 영어 Data Flywheel | `//h1[@class='ir_hidden']`         | `//div[@class='news-detail-view']` | 본문의 SEOUL dateline, 월·일·년 패턴                        |
| 현대차 한국어 파트너십    | `//*[@id='title']`                 | `//*[@id='contentsForm']/div[1]`   | `//*[@id='contents']//li[3]`, `%Y.%m.%d`                    |

`title_xpath`는 유일한 요소와 비어 있지 않은 제목을 요구한다. 누락·여러 일치에서는 브랜드명·메뉴를 기사 제목으로 채우지 않고 title_profile_status와 partial을 남긴다. `publication_date_attribute`는 선택 요소의 속성값을 날짜 근거로 보관한다. 요소가 아닌 값을 반환하는 잘못된 선택자는 실패로 처리한다.

선택한 본문은 native 문단·목록·표의 위치와 텍스트를 보존한다. 범용 파서가 현대차의2028·2029년 목록을 빠뜨린 실제 사례를 기준으로 목록 유지 회귀를 추가했다. extracted는 의미 검토·기사 승인·논문 전문 읽기의 완료를 뜻하지 않는다.

### 17.2 실제6개 원문 결과

실제 수집 run은20260927-deep-source-identity-v2다.6개 응답의 저장 바이트·ID·본문 해시·원문 버전·parse 사본을 재검사했다.

| 원문                                                                                                                                                                                                                                          | 발표일·본문 구간   | 확인한 파싱 변화                       | 다음 검토                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- | ------------------------------------- |
| [Envisagenics–Boehringer](https://envisagenics.com/news/envisagenics-and-boehringer-ingelheim-enter-multi-target-collaboration-to-develop-first-in-class-precision-therapies-based-on-rna-splicing-derived-targets-for-hard-to-treat-cancers) | 2026-09-22·14구간  | 브랜드 제목→기사 제목·발표일 확보      | 계약 옵션·잠재 대가·연구 진행 상태    |
| [CSHL의 연구·회사 관계](https://www.cshl.edu/envisagenics-and-biogen-partner-for-rna-splicing-research/)                                                                                                                                      | 2021-06-09·7구간   | 기존 날짜·본문 유지                    | 공동창업·자문 역할과 당시 시점        |
| [Envisagenics 회사 소개](https://envisagenics.com/about)                                                                                                                                                                                      | 발표일 없음·39구간 | 미발표일을 관측 시각으로 대체하지 않음 | 이름과 인접한 직함 문단을 함께 읽기   |
| [Nature RamanOmics](https://www.nature.com/articles/s43587-026-01219-7)                                                                                                                                                                       | 2026-09-21·349구간 | 일반 추출231→profile349구간·발표일     | Methods·비교 조건·동물 실험·적용 범위 |
| [현대차 Data Flywheel](https://org.hyundai.com/worldwide/en/newsroom/detail/0000001273)                                                                                                                                                       | 2026-09-13·123구간 | 일반 추출50→본문123구간·2028/2029 목록 | 실제 운영 자원과 향후 생산 계획 구분  |
| [현대차–NVIDIA 파트너십](https://www.hyundaimotorgroup.com/ko/news/hyundai-kia-nvidia-next-generation-autonomous-driving-partnership-expansion)                                                                                               | 2026-03-17·25구간  | 일반 추출11→본문25구간·발표일          | 3월 목표와9월 실행의 비교 근거        |

구간 수의 증가는 정보 품질 점수가 아니다. 도표·캡션·각주·참고문헌 등이 보존된 결과이며 중복·누락·문단 합치기를 별도로 읽어 검토한다. 이6개를 검토 완료·gold·새 기사로 계산하지 않는다.

### 17.3 저장 바이트를 다시 파싱하는 명령

```bash
node scripts/research.mjs reparse --run 20260927-deep-source-profile-replay-v2 --source-run 20260927-deep-source-identity-v2
```

`reparse`는 실제 지원 명령이다. --source-run이 필수이며 live --url/--channel과 혼합하지 않는다. 보관된 documents/parses와 실제 원문 바이트·정본 parse를 먼저 검사한다. 현재 URL profile과 worker 해시로 새 출력 run의 documents.json·parses.json을 만든다. 파일만 편집해 원문 검증을 건너뛰지 않는다.

같은 원문·같은 profile/worker 설정이면 같은 parse identity를 재사용한다. 설정이나 파서가 바뀌면 새 parse ID를 만든다. 이전 source run·원문 바이트·parse는 보존한다. 출력 run의 입력이 바뀌면 재개를 거부하므로 새 run을 사용한다. 과거 자료 재파싱이며 오늘의 새 수집이나 실제 운영1회가 아니다.

### 17.4 원문 URL 표기 보존 결함과 복구

첫 수집 run의 CSHL URL은 끝에 /가 있었다. 수집기는 그 문자열로 source ID를 만들면서 저장 original_url만 정규화해 /를 제거했다. 재파싱 전의 근거 검사가 Source document version/hash mismatch로 중단됐다. 검증 조건을 완화하지 않았다.

수집기의 original_url은 제출 URL을 그대로 보존하고 HTTP 요청 주소만 정규화하도록 수정했다. 기존 prepare-drive.py의 URL 문자열 ID와 일치한다. 원본 URL·최종 요청 URL·리다이렉트는 서로 다른 필드다. [runtime 회귀](../tests/research-runtime.test.mjs)는 trailing slash의 원문 ID·URL·캐시304·본문 버전 유지와 변경을 함께 확인한다.

실패 run20260927-deep-actual-source-v1·20260927-deep-source-profile-v1은 덮어쓰지 않았다. 수정 후 원래6개 URL을 새 run에서 수집했고 이후 재파싱했다. 과거 관측·검토를 현재 성공으로 교체하지 않는다. 기사 ID와 RSS GUID도 원문 정규화 과정에서 재생성하지 않는다.

버전 폴더의 최초 `document.json`은 당시 오류 기록을 그대로 보존한다. 최초6개 버전 감사에서 CSHL1개의 메타데이터가 ID/원본 URL 불일치였고, 새 관측은 일치했다. 이후 전체 저장 자료를 감사해 보관 레지스트리의 정정 참조와 실패 검사를 구현했다. `prepare-drive.py`는 이제 최초 기록을 그대로 목록화하지 않고 `source-register`의 검증 결과를 사용한다. 최초 감사 `version-metadata-identity-audit-20260927.json`도 보존하며, 전체 정정/ZIP 대조 결과는 다음 절을 따른다. 로컬 정합성과 Drive 원격 보관은 별도 상태다.

### 17.5 원문 보관 레지스트리 정정과 실제 staging

구현: [archive.mjs](../scripts/research/archive.mjs)의 `buildSourceRegister`, [research.mjs](../scripts/research.mjs)의 `source-register`, [prepare-drive.py](../scripts/prepare-drive.py)의 `prepare_local_ai_sources`. 이 명령은 모델·네트워크를 호출하지 않는다.

선택 순서는 다음과 같다.

1. 최초 메타데이터가 원문 ID/버전/본문 경로/바이트 해시/HTTP URL/관측 시각과 일치하면 유지한다.
2. 최초 기록이 잘못됐으면 동일 버전의 `latest.json`·`attempts`에서 검증된 가장 이른 관측을 선택한다. 다른 본문 버전·실패 응답·날짜 없는 기록은 사용할 수 없다.
3. 적합한 관측이 없을 때만 명시적으로 저장한 URL 목록과 대조한다. 입력 URL의 source ID가 원래 폴더와 같고 정규화된 요청 URL도 일치해야 한다. slash를 임의로 붙이거나 최종 주소로 원래 ID를 새로 만들지 않는다.
4. URL 하나만 바꿔 전체 검사가 통과하는 경우에 정정 목록을 생성한다. 원문 `document.json`과 최초 관측일은 변경하지 않고 `reconciled_at`·변경 전후·근거 경로/SHA를 별도로 남긴다.
5. 근거를 얻지 못하면 `unresolved_versions`에 남기며 `metadata_complete=false`로 보고한다. 본문 해시 손상·symlink·잘못된 폴더 ID는 실행을 중단한다.

등록 URL 목록은 source channels/watchlist/acquisition에서 HTTP 문자열만 모은 `source-url-inputs.json`이다. 정규식 문자열을 URL로 계산하지 않는다. 브라우저 자원의 원래 요청 URL은 저장된 render manifest와 body를 해시 검증하고, capture ID와 resource source ID를 다시 계산한 뒤에만 사용한다. Googletagmanager·CSE 자원2개도 이 경로로 확인했으며 기사 원문으로 분류하지 않는다.

`metadata_provenance`에는 최초 메타데이터 경로/SHA, 선택한 파일 경로/SHA, 정정 종류를 저장한다. URL 정정은 선택 파일에 이미 정정된 내용이 있다는 뜻이 아니다. 최초 파일 + 저장 URL 참조 + `changes`로 파생 목록을 설명한다. 세 상태는 `verified`, `reconciled_from_observation`, `reconciled_url_identity`다. 모두 `article_review_status=unreviewed`이며 수집/메타데이터 정정이 기사 의미 검토를 대신하지 않는다.

```sh
node scripts/research.mjs source-register --run 20260927-source-register-reconciled-v3
node --test tests/research-archive.test.mjs
python3 -m unittest discover -s tests -p 'test_prepare_drive.py'
```

실제 결과:199원문 버전·미결0; 최초 정상135·같은 버전 관측1·URL 표기 정정63. 로컬 staging은 `.local/research/local-ai/archive-staging/20260927-source-register-v3/Sources/LocalAI/`에 있다. `source-register.json`과 `source-versions.zip`을 생성했고 원본824파일의 ZIP 바이트·레지스트리의 본문 및 정정 참조 SHA를 대조해 변경/누락0을 확인했다. ZIP은4,296,906바이트다. 확인 영수증은 `source-archive-verification-20260927.json`이다. **Drive 업로드/원격 재읽기는 수행하지 않았다.**

Research 직접 사본·전체 private ZIP·업로드 manifest에서 `local-ai/runtime`을 제외한다. 설치된 venv·브라우저·검색 엔진 실행파일은 원문 보관 묶음이 아니다. 오래된 staging의 runtime을 자동 삭제하지 않고 manifest 대상에서 제외한다.

### 17.6 인물 카드의 이름과 역할 보존

Envisagenics About의 일반 파싱은 이름만 얻고 `span`의 직함을 놓쳤다. 이 상태에서 공동창업·기술자문을 연결하지 않는다. 해당 URL에 한정한 `content_xpath=//main`, `content_block_xpath=.//p|.//h1|.//h2|.//h3|.//h4|.//li|.//div[h4 and span]`를 추가했다. 인물 카드 전체를 하나의 블록으로 보존하며 선택된 부모 안의 자식 제목을 중복 블록으로 만들지 않는다.

블록 선택자는 명시한 본문 컨테이너의 descendant element만 허용한다. 본문 밖·text/attribute 결과·script/style/noscript·미일치 선택자는 실패한다. 네이티브 DOM 경로와 블록 해시를 남기고 수집 원문은 수정하지 않는다. 데스크톱/모바일 카드 두 개가 동일 텍스트여도 서로 다른 원문 위치로 보존한다. 기사 중복 제거와 관계 의미 검토는 이후 단계다.

실제 `20260927-deep-source-card-replay-v3`는6원문을 재파싱했다. About은53블록이며 `Martin Akerman, PhD CTO & Co-founder Board Member`와 `Adrian Krainer, PhD Cold Spring Harbor Laboratory RNA Drug Development SAB`를 각각 보존했다. About은 게시일 없는 배경 자료로 유지한다. CSHL의2021년 발표와 회사 소개를 대조해 공동창업과 기술자문을 구분하고, 현재 직함을 과거 특정 날짜의 직함으로 자동 소급하지 않는다. worker11회귀가 통과했으며 원문6개의 신규 수집이나 기사 발행으로 계산하지 않는다.

## 18. 장문 추출과 심층 평가 기준 확장

### 18.1 문단 경계별 추출 계약

`planExtractionBatches`는 파싱 정본 전체를 먼저 검사하고, 호출할 messages/schema와 원문 block map을 함께 만든다. 기본 `num_ctx=16384`의 보수적 문자 한도는32,768이며 `--input-char-budget`으로 더 작게 설정할 수 있다. 충분히 작은 자료는 기존 단일 호출 형태를 유지한다. 초과 자료는 문서별·원문 순서대로 전체 문단을 나누며 제목과 날짜는 각 묶음에 유지한다. block key는 원래 문서/구간 위치를 가리키고 묶음마다 새로 번호를 붙이지 않는다.

모델은 묶음당 최대6개 사실을 출력하며 관련 사건/연구 사실이 없으면 빈 배열을 반환할 수 있다. 모든 문단을 모델에 전달했다는 것과 핵심 사실이 빠짐없이 추출됐다는 것은 다르다. 목록·인용 문헌·저자 소속에서 얻은 출력도 자동 승인하지 않는다. 결과의 `review`는 모두 미검토 상태다.

각 요청의 schema enum에는 해당 묶음에 포함된 block key만 있다. 다른 묶음의 근거를 가져오면 거부한다. 원출력의 compact key는 보관하고 검토용 claims에는 원래 source/version/parse/block ID를 연결한다. 다중 묶음 결과는 `batches[]`에 각각의 output·artifacts·provenance를 저장한다. 이를 하나의 실제 API 응답인 것처럼 합성하지 않는다.

CLI 체크포인트는 `claims-batch-<순번>-<요청해시>`다. 실패 후 같은 입력/모델 metadata로 재개하면 완료된 묶음의 결과 해시를 검사해 재사용한다. 바뀐 모델 digest·프롬프트·parse·설정은 체크포인트 입력에 반영한다. 전체 claims는 모든 묶음이 성공한 뒤에 생성하며 중간 실패를 빈 성공 결과로 저장하지 않는다. 한 문단이 한도를 넘거나 계획이64묶음을 초과하면 모델 호출 전에 중단한다.

이전 기본 예산의 입력 계획은 RamanOmics349블록을5묶음으로 구성했고 request/schema 문자는31,956·32,548·32,745·32,183·12,902였다. 원문 본문은115,632자다. 현대차 두 발표148블록은31,020자로 한 묶음, Envisagenics/CSHL/회사 소개는 인물 카드 재파싱 이후의74블록(14+7+53)을 사용한다. 새 예산에서는 같은 전체 원문/ID를 유지한 채 묶음 수가 달라진다. 실제 모델 출력·의미 평가는 다음 절의 별도 실행 기록으로 확정한다.

### 18.2 원문부터 작성한 세 심층 개발 기준

최초 사본은 `strategy-deep-source-20260927-v1`, `paper-deep-source-20260927-v1`, `venture-deep-source-20260927-v1`이다. 각7개 사실·필요 설명·금지 변형을 원문에서 작성해 모델 원출력과 분리했다. 기존 공개 기사와 프로젝트 기록에 노출된 Codex 검토이므로 독립 사람 gold나 heldout으로 표시하지 않는다. 처음에는 기존3범주와 함께 활성 개발 기준6범주·39사실이었다. 이후의 논문 주체 보강과 두 신규 사례는18.6절을 따른다. 초기10/전체60의 다양성·품질 평가는 미완료다.

| 사례                | 반드시 전달할 내용                                                                                  | 막을 변형                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hyundai 전략        | 3월 협업/데이터 순환 계획 →9월 가동 발표; AVP/42dot 조직과 약40대 수집 차량;2028/2029 양산 목표     | 연간 판매7백만 대를 수집 차량 수로 변경; 양산 계획을 완료 실적으로 변경                       |
| RamanOmics 논문     | 생쥐 폐·피부·p21 양성; RNA/공간/Raman 정합; 균형화한 세포군70/30 분할; RNA 단독/복합 특징 비교      | 세포 시험을 임상 성능으로 확대; 상대 개선율을 %p로 변경; 상관관계를 인과로 변경               |
| Envisagenics 사업화 | Akerman 공동창업과 Krainer 자문 구분; 연구 협업/독점 라이선스 옵션; 조건부 지급;ENV-375 후기 전임상 | 잠재 지급을 수령 투자금/매출로 변경; 옵션을 집행 라이선스로 변경; 전임상을 승인 제품으로 변경 |

RamanOmics의 폐 정확도0.7368→0.7763, 피부0.6182→0.6545는 해당 세포 분할의 결과다. 원문의 상대 개선5.36–5.87%를5.36–5.87%p로 바꾸지 않는다. 생쥐별 독립 외부 평가가 수행됐다고 추가하지 않는다. p21을 전체 세포 노화의 보편 표지로 단정하지 않는다. 이들은 편집자의 근거 부족 해명이 아니라 원문에 있는 실험 대상·비교 조건이다.

### 18.3 실제 추출 결과와 심층 작성 입력의 구분

현재 실제 `20260927-venture-batched-qwen-false-v1` 추출은186.603초·6사실/구조통과4, `20260927-strategy-batched-qwen-false-v1`은206.174초·6사실/구조통과6이다. 둘 다 Qwen3.8:27b·false·16,384문맥·온도0이다. 원출력은 승인하지 않았으며 `direct-source-review.json`에 직접 판정을 보존했다.

사업화 원출력은 잠재 지급에 별도 로열티를 포함하고 US$/USD를 바꾸었다. Akerman 공동창업·Krainer 자문·라이선스 옵션·후기 전임상 단계도 놓쳤다. 전략 원출력은 판매량을 반환했지만 실제 약40대 수집 차량과 통합 개발 조직을 빠뜨렸고,3월 별도 한국어 발표를 인용하지 않아 두 발표일 비교 근거를 만들지 못했다. 구조통과6을 전략 심층 합격으로 계산하지 않는다.

세 `20260927-<strategy/paper/venture>-source-reviewed-deep-v1`은21개 source-first annotation으로 작성 입력을 준비한 **별도 비공개 검토 run**이다. provenance에 `local_model_extraction=false`를 기록한다. 사실/근거를 직접 검토한 뒤 심층 역할·source scope·DOI·창업 관계를 묶어 `deep-context.json`을 생성했다. 이 시점에는 최종 편집 승인·전체 사이트 통합 전이었다. 이후 역할 통합의 새 run을 직접 정정·비공개 승인하고 웹/RSS/digest를 대조한 결과는 [20절](#20-비공개-정정승인전체-사이트-검증)에 기록한다. 수동 보강을 모델의 자동 추출 정확도에 넣지 않는다.

### 18.4 실제 장문 실패와 명시 예산의 새 시험

`20260927-paper-batched-qwen-false-v1`의 첫 요청은272.477초에6개 사실을 반환했다. 입력은7,713토큰, 출력은1,699토큰이었다. 둘째 요청은300초 제한으로 중단됐다. 첫 묶음의 원응답·요청/출력 해시와 `claims-batch-001-52e53ee99da1af1e.json`은 보존했고 전체 `claims.json`은 생성하지 않았다. 이를 논문 전체 추출 완료나 전체5묶음 성공으로 표시하지 않는다.

실패 후 같은 설정을 반복하지 않았다. 다음 예산 제어는 P3-02에 구현됐으며 새 실제 실행은 별도로 검증한다.

1. `extractionBudget`와CLI6개 옵션은 문맥·입력 문자·생성 토큰·사실 개수·호출 시간·전체 추출 시간을 분리한다. 설정 값은 요청/단계 입력에 포함하고 범위를 벗어나면 호출 전에 차단한다. 어댑터는 metadata 시간까지 합산한다.
2. 새 run `20260927-paper-bounded-full-qwen-false-v1`은12,000자·2,048생성 토큰·4사실·호출240초·전체2,700초다.349블록을 순서대로15요청에 전부 포함하며 최대 요청 문자는11,980이다. `paper-bounded-full-live-plan-20260927.json`에 실제 포함 범위를 보존했다.05:00:40~05:36:12 UTC에15요청이 종료됐으며 추출 단계2,131.333초에56주장을 생성했다. 완료 상태·실제 stdout·최종 claims 파일을 확인했다.
3. checkpoint 완료 뒤 전체 시간이 끝나면 새 호출을 차단하고 기존 결과를 보존한다. 같은 입력/metadata의 재개는 이미 완료한 묶음을 재사용한다. 가상 시계 회귀와 실제 요청 timeout signal 검사는 이 제어를 확인하며, 실제 장문 전체의 완주·내용 정확성을 대신하지 않는다.
4. 새 원출력의 구조 검사는33통과·23실패다. 문제 발생 건수는 인용 불일치3·단위 미일치11·조건 미일치18이며 한 주장에 여러 문제가 있어23과 합계가 다르다. 원문에 없는 `...`를 인용에 넣거나 의미상 단위를 임의 영문 단어로 바꾸는 출력이 차단됐다. 구조 검사를 통과한 주장은 사실 승인 상태가 아니다.
5. v2의8개 고정 기준을 직접 대조한 결과, 생쥐 코호트1개는 문장에 충분히 보존됐고4개는 일부만 포함,3개는 누락됐다. 세포70/30 분할·기존 방법의 문제·연구자 소속은 없었다. 같은 절편/정합 순서·정확도 비교 조건·p21 부분집합/분자 구분·상관/인과 단서는 일부만 남았다. `direct-extraction-review.json`에 각 기준과 후보 claim ID를 기록했다. 독립 사람 평가나 자동 의미 정확도 점수가 아니다.

전체 문단 전달·15호출 완주와 중요한 사실 포착은 다른 기준이다. 이 출력은 최종 사실 승인·기사 작성 입력으로 승격하지 않았다. 후속 작업은 논문의 문제/방법/비교 조건/결과/적용 범위를 먼저 역할별 목록으로 만들고, 분할 사이에 나뉜 조건을 합쳐 누락을 검사하는 것이다. 참고문헌·지원금·라이선스만 처리한 요청도 포함된 현재 전체 처리 시간으로 하루 기사 수를 약속하지 않는다. 필요한 근거 영역을 우선 읽는 경로를 추가해도 읽은 범위를 명시하며 전체 전문 처리와 구분한다.

`deep-extraction-resource-sample-20260927.json`에는 추출 중 Ollama의 모델 메모리 약18.23GB와16,384문맥을 한 시점에 기록했다. 이는 최대 메모리·스왑·하루 처리량 측정이 아니다.

### 18.5 세 심층 형식의 실제 작성과 직접 판정

세 작성은 Qwen3.8:27b·false·16,384문맥·온도0·최대4,096출력 토큰으로 순차 실행했다. 입력은 앞 절의 직접 검토 사실이다. 각 run의 `draft.json`·`preview.md`·`direct-editorial-review.json`과 모델 요청/응답 해시를 보존했다. 원출력을 덮어쓰거나 최종 승인으로 바꾸지 않았다.

| 형식        | 실제 작성 시간 | 자동 검사                            | 직접 읽기에서 남은 수정                                                         |
| ----------- | -------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| 기업 전략   | 171.257초      | `entity_translation_requires_review` | 현대차그룹/조직 명칭 통일; 이전 발표 비교를 반복하는 분석 축약                  |
| 연구 사업화 | 186.492초      | 구조 문제0                           | 향후 제품 매출에 따른 로열티의 조건부 표현; 리드와 중복되는 방법/재무 문단 축약 |
| 논문 해설   | 224.731초      | 구조 문제0                           | 연구자·기관의 명시적 원문 확인과 발표일 표시; 동일 정확도 결과의 중복 설명 통합 |

논문 초안은 이전 계약의 `comparison`과 `results`를 별도 소제목으로 쓸 때 같은 정확도 수치를 반복했다. 이후 **한 설명에 여러 역할의 근거를 묶는 내부 계약**을 구현했다. 각 역할의 모든 배정 사실을 설명에서 확인하며 알 수 없는 역할/중복/누락을 차단한다. 새 prompt는 비교/결과를 합치고 중복 없는 소제목을 요청한다. 실제 원출력의 재검사에서는 사업화에 배정 사실 누락이 추가로 발견됐고, 이전 자동 문제0을 현 계약의 합격으로 재사용하지 않는다. 새 계약의 실제 작성은 새 run과 별도 직접 판정을 남긴다.

논문에 명시된 생쥐·p21 세포군·세포70/30 분할은 실제 실험 조건으로 보존한다. 독자에게 분석 실패를 해명하는 문구를 넣지 않는다. 연구 방법 이름을 발표 주체처럼 쓰거나 자동 검사0을 최종 읽기 합격으로 계산하지 않는다. 이 절의 원출력은 승인하지 않았으며 이후 정정본 승인은 별도20절을 따른다. 독립 사람 평가·새 공개 발행은0이다.

### 18.6 연구 주체·새 분야 원문의 고정 기준

`paper-deep-source-20260927-v2`는 v1의7사실·금지 변형을 보존하고 연구자/기관 사실을 하나 추가했다. 논문의 저자 소속과 교신저자 문구에서 Massachusetts General Hospital·Harvard Medical School의 Jian Shu, MIT의 Jeon Woong Kang·Peter T. C. So를 확인했다. 소속만으로 교수 직함·창업·상용화 관계를 추가하지 않는다. v1 파일은 그대로 두고 `supersedes`로 연결했다. 새 사실은 새 작성 context에 포함해야 하며 이전 초안에 근거 없이 이름만 붙이지 않는다.

ETRI 사례 `etri-embodied-standard-ko-dev-v1`은2026년9월20일 배포된 피지컬 AI 표준화 발표에서6개 기준 사실을 고정했다. 실제 HTML은62블록·5표이며 profile은 본문 배포일과 제목의 DOM 위치를 저장한다. 파일명260909·Last-Modified·관측일을 배포일로 쓰지 않는다.22개 신규 개발 과제와 포커스그룹을22개의 제정 표준으로 확대하지 않으며10월 항저우 회의는 계획이다. 원 HWP와 사진을 파싱/OCR하지 않았으므로 이 평가의 범위는 `partial`이다. 파서의 `extracted`와 문서의 확인 범위를 구분한다.

AWS 사례 `aws-r9g-graviton5-en-dev-v1`은2026년8월31일 R9g/R9gd 정식 제공 발표의26블록·2사양 표에서8사실을 고정했다. 원 발표 timestamp와9월10일 수정일을 분리한다. 최대25%의 회사 성능 주장·48xlarge의100/72Gbps·R9g의 EBS 전용/R9gd의 로컬NVMe·Arm AMI/대부분 앱 조건·발표 당시4리전을 보존한다. 모든 크기/작업/리전의 동일 성능·모든x86 앱의 무수정 호환으로 요약하면 실패다.

현재 활성 기준은11사례·71사실·15원URL이다. 보존 사본13개 중 FANUCv1과 논문v1은 대체됐으므로 이중 계산하지 않는다. 영어·일본어·한국어·중국어·독일어의5언어와7분야 일부를 포함하지만 보안·AI논문 전문/초록 비교·한국어 교수 창업 및 실제 고객 도입 등 초기 지정 유형의 완료는 남아 있다. 모두 Codex의 `source_reviewed_candidate`이며 독립 사람 gold/heldout은0이다. 신규5사례는 실제 로컬 모델 추출·작성·승인 전이다. 이전에 저장한 원문 재사용과 과거 자료 평가를 새 운영 회차로 세지 않는다.

### 18.7 중국어·독일어·우주 관측 자료의 파서와 고정 기준

18.7절 실험 당시 출처별 기사 profile은13개였다. 현재15개 profile은22절을 따른다. 아래 변경은 실제 저장 바이트에 재현되는 본문·제목·날짜 손실을 기준으로 추가했다. 사이트 전체에 적용되는 미검증 규칙으로 확대하지 않고 실제 확인한 기사 URL에만 매칭한다. generic parse·실패 run·원본 HTML은 보존하며 profile/worker 변경 뒤 새 parse ID를 만든다.

| 사례·고정 사실 수                            | 실제 문제와 수정                                                                                                                                                                                           | 보존할 조건·평가 범위                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `cxmt-g5-zh-dev-v1`·6사실                    | 일반 파서의11블록에서 inline `Gb`·DRAM·half-pitch가 빠졌다. `main`의 제목·날짜·본문을 직접 선택해9블록을 다시 파싱했다.                                                                                    | 발표9월20일;24Gb;half-pitch11.95nm와 공정명 구분;DPW 최소50%의 G4·8Gb 환산 각주;496/245Ball 두 제품의 회사 양산 주장        |
| `esa-cebreros-first-light-en-dev-v1`·6사실   | 일반 파서가 관련 뉴스218블록을 포함하고 본문·날짜를 놓쳤다. 본문 선택 뒤에도 외부 레이아웃 표를 중복 조상으로 보아0블록이었다. worker가 선택한 container 내부의 조상만 검사하도록 수정해10블록을 복구했다. | 발표9월21일·첫 관측9월3~4일 분리;0.5m/5m 사양;−15°C CMOS;대기 seeing 조건;2027상반기 교육 접근 계획                         |
| `siemens-vacuum-interrupter-de-dev-v1`·5사실 | 일반 metadata의 잘못된 제목·날짜 null을 실제 `h1`과 기사 header 날짜 요소로 바꿨다. 관련 기사 날짜와 섞이지 않게 exact profile로 선택했다.                                                                 | 발표9월6일;시제품 약100/년과 납품 실적 구분;420kV 개발·인력;진공 차단과 Clean Air 절연의 역할 구분;고객 운영 실적 생성 금지 |

중문 기존 기사 ID는 `43924fdd4d64f158`이며 이번 기준은 기존 원문 두 주소와9월20일 사건 날짜를 보존한다. 과거 기사 원문 재검토 후보이지9월27일 신규 발행이 아니다. 독문 날짜 규칙은 이 기사에서 확인한 September 표기에만 적용하며 모든 독일어 월명을 지원했다고 표시하지 않는다.

실제 재파싱 run은 각각 `20260927-cxmt-g5-zh-profile-v2`, `20260927-esa-cebreros-profile-v3`, `20260927-siemens-vacuum-de-profile-v2`다. ESA의 이전 v2·0블록 실패는 그대로 남긴다. 합성 회귀가 원문 정합성을 대신하지 않으므로 각 고정 기준에서 원문 문장·수치·단위·조건과 블록 위치를 직접 대조했다. 독립 사람 gold나 로컬 모델 자체 정확성 합격으로 계산하지 않는다.

### 18.8 역할 통합·빈 분석 계약의 새 실제 작성

새 source-first 사실과 context를 사용해 세 형식을 다시 순차 작성했다. 모델 Qwen3.8:27b·false·16,384문맥·온도0·최대4,096출력 토큰은 유지했고 요청 metadata 시간도 측정에 포함했다. 실제 명령은 `node scripts/research.mjs draft --run <아래 run ID> --deep`이다. draft CLI는 집필 think=false를 코드에서 고정하며 extract 전용 예산 옵션을 이 명령에 붙이지 않는다.

| run ID                                              | 작성 시간 | 자동 검사                               | 직접 읽기·다음 수정                                                                                        |
| --------------------------------------------------- | --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `20260927-strategy-grouped-source-reviewed-deep-v2` | 160.144초 | 엔티티 검토·역할 밖 근거·배정 사실 누락 | 리드/설명 일정 반복 제거;목표/배분의4사실과3월 계획/9월 가동 비교의3사실을 해당 설명에 정확히 배정         |
| `20260927-venture-grouped-source-reviewed-deep-v2`  | 155.254초 | 배정 사실 누락                          | customers 역할의 협업 사건 참조 포함;잠재 계약금/제품 매출 로열티의 중복과 수령 표현 수정                  |
| `20260927-paper-grouped-source-reviewed-deep-v2`    | 206.924초 | 엔티티 검토·배정 사실 누락              | 연구자 사실을 배정 설명에도 포함;문제/방법의 리드 반복 제거;조건/비교/결과 통합·발표일·적용 범위 표현 정리 |

세 원출력은 모두 `analysis=null`을 사용했다. 필요 없는 별도 분석을 만들지 않는 계약이 실제 호출에도 적용됐으나, 근거 배정 누락·반복·한국어 편집 품질은 남아 있다. 논문 원고의 실험군·성별·세포70/30 분할·정확도 수치·p21 및 상관/인과 구분이 설명에 유지된 것과8개 사실 전체가 올바르게 편집된 것은 다른 판정이다. 현재 최종 공개 승인0이며 원출력을 무검토 발행 합격으로 계산하지 않는다.

각 run의 `draft.json`, `preview.md`, `direct-editorial-review.json`에 정확한 draft ID·파일 SHA·실제 시간·자동 문제·직접 읽기 결과·다음 수정을 보관했다. 모델 request/response/output 원본은 그대로 유지한다. source-first 입력의 직접 annotation을 원모델 사실 추출 정확도에 포함하지 않는다. 다음 편집은 `correctDraft`의 이전 draft ID·검토자·이유를 통해 별도 정정본으로 보존하고, 원문·참조·역할·공개 화면을 다시 대조한다.

## 19. 기존 회차 보존과 비공개 생성 결과 대조

### 19.1 소급 투영의 metadata 보존

`editionProjection`은 고정 사건 ID와 전체 기사 집합을 확인한 뒤 기존 주요 소식의 선택·순서를 사건 ID로 연결해 수정 제목에 반영한다. `linked_knowledge_notes`, `knowledge_notes_created`, `knowledge_notes_updated`만 명시적으로 보존한다. 기존 기사와 주 테마가 같으면 보조 테마를 유지하며 새 분류를 명시한 경우에는 새 값을 쓴다. 알 수 없는 metadata를 통째로 공개 복사하지 않는다.

합성 회귀는 두 기사 중 둘째 제목 수정, 주요 소식의 역순, 세 Knowledge 배열, 보조 테마, 비공개 필드 제거를 확인했다. 수정 전 실패·수정 후13개 projection 회귀 통과 기록은 `retrospective-projection-metadata-before/after-20260927.log`다. 기사별 topic 배정과 제외 이벤트 전파는 이 whitelist 보존만으로 완료되지 않으며 P4/P5의 별도 검토 대상이다.

### 19.2 실제 UR 기사 한 건의 회차·RSS·digest 시험

`20260927-ur-full-edition-projection-v2`는 실제2026-09-20회차12건 중 UR Gen7 한 건을 이전에 원문 대조·편집 승인한 후보로 바꾼 **비공개 투영**이다. 나머지11건은 기존 원고를 유지했으며 이번 시험으로 다시 조사·승인한 것으로 세지 않는다.

- 실제 원본을 private-vault에 복사하고 `approved-vault/Editions/...` 결과와 대조했다. 공개 작성 원본은 수정하지 않았다.
- 전체12개 사건 ID·원 발표일·기존 주요 소식 순서·회차의 Knowledge 배열을 보존했다.
- 생성 RSS40건의 GUID·pubDate가 초기 복구 목록과 같았다. 과거 기사 수정으로 새 회차를 만들지 않았다.
- 같은 회차의 digest·RSS description에서 기사 제목·요약·원문 링크를 대조했다. 기존 뷰 함수로 뉴스/브리핑 HTML fragment를 생성했고 지도·내부 claim/검토 필드의 출력이 없었다.
- CSS·JavaScript 자산을 포함한 전체 사이트 build와 브라우저 상호작용은 이번 fragment 시험에 포함하지 않았다. 기존 build/site 통과 기록과도 구분한다.
- UR 기사의 새 topic 배정과 그에 의존한 지식/Signals 판단은 P4에서 다시 검토해야 한다. fragment 생성만으로 지식 축적 완료를 표시하지 않는다.
- 원격 Drive 업로드·재읽기·공개 배포·실제 새 운영 횟수는0이다.

검증 기록은 해당 run의 `projection-verification.json`, 결과는 `generated-preview/briefing.xml`, `digest.md`, `rss-description.html`, `briefing-fragment.html`, `news-fragment.html`이다. 처음 호출에서 정규화된 `a.review`에 제목을 빠뜨려 기존 검사기가 거부했고, 둘째 호출의 receipt 생성에서 `stageProjection` 반환 객체를 경로로 취급해 실패했다. 첫 실패 기록과 둘째의 `verification-attempt-failed.json`을 보존한 뒤 이미 생성한 파일을 다시 읽어 별도 검증 receipt를 만들었다. 실패를 없애려고 기존 출력이나 원본을 덮지 않았다.

## 20. 비공개 정정·승인·전체 사이트 검증

2026-09-27 후속에서 기존 세 사건의 심층 원고를 직접 정정·비공개 승인하고, 자산을 포함한 전체 사이트를 별도 작업 사본에 생성했다. 아래는 실제 구현·검증 범위다. 수동 정정한 기사·일반 Chrome viewport 검증·Drive 보관·공개 발행·독립 사람 평가는 각각 다른 상태다.

### 20.1 정정 명령과 변경 이력

실제 명령은 [research.mjs](../scripts/research.mjs)의 `correct`다.

```bash
npm run research -- correct --run 20260927-paper-grouped-source-reviewed-deep-v2 --review .local/research/local-ai/runs/20260927-paper-grouped-source-reviewed-deep-v2/draft-correction-v1.json
```

정정 입력은 다음 다섯 필드만 허용한다. 아래 이름은 실제 계약이며 임의의 운영 주석을 추가하면 거부한다.

| 필드          | 내용·검사                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| `draft_id`    | 정정 직전 정확한 원고 ID. 다른 초안이나 이전 승인본의 ID는 사용할 수 없음 |
| `reviewer`    | 원문과 정정 문장을 읽은 검토자                                            |
| `reason`      | 실제 오류와 수정 내용. private 판단 기록에만 보관                         |
| `reviewed_at` | 실제 검토 시점. 유효한 달력과 사실 검토보다 뒤인 시점을 확인              |
| `draft`       | 교체할 전체 원고 객체. 패치 문장이 아니라 제목·리드·설명·분석·태그 전체   |

실행은 run 잠금 아래 현재 원문 바이트·source version·canonical parse와 검토된 사실을 검사한다. 현재 원고의 `draftFingerprint`를 먼저 계산해 저장된 ID와 대조한다. 이후 같은 정정 입력 해시라면 추가 수정 없이 `reused=true`를 반환한다. 같은 입력이라는 이유로 손상된 현재 원고를 건너뛰지 않는다.

첫 정정은 다음 순서로 저장한다.

1. `drafts/<previous_draft_id>.json`에 정정 직전 파일의 **정확한 바이트**를 보존한다. 해당 이력이 이미 존재하는데 바이트가 다르면 중단한다.
2. `corrections/<correction_input_sha256>.json`에 다섯 필드의 판단 입력을 보관한다.
3. 새 전체 원고와 근거/역할 검사를 연결한 `draft.json`을 저장한다. 상태는 `editorial_review`이며 공개 승인 상태가 아니다.
4. `preview.md`를 새 원고로 다시 생성한다. 모델 request/response/output은 변경하지 않는다.

원고의 사실 참조·모든 심층 역할·엔티티 표현·내부 ID 노출·한국어 문장 문제도 다시 검사한다. 정정으로 새 draft ID가 생기면 이전 `editorial-review.json`을 새 승인으로 재사용하지 못한다. 모델 원출력의 문제를 정정본 평가 점수로 덮어쓰지 않는다.

### 20.2 최종 편집 승인과 승인본 재읽기

```bash
npm run research -- approve --run 20260927-paper-grouped-source-reviewed-deep-v2 --review .local/research/local-ai/runs/20260927-paper-grouped-source-reviewed-deep-v2/final-editorial-review-v1.json
```

`approve`는 §7.6의 정확한 draft ID·원문/최종 문장·제목·날짜·수치·분석 검토와 기사 ID·원 발표일·지역·용어 배정을 재확인한 후 `editorial-review.json`과 `approved-article.json`을 저장한다. 검토용 true 값이나 해시가 독립적인 사람의 읽기를 증명하는 것은 아니다. 실제 검토 주체는 receipt에 그대로 기록한다.

[preview.mjs](../scripts/research/preview.mjs)의 `loadCurrentApproval`은 다음 여섯 파일의 현재 바이트 해시를 고정한다.

```text
draft.json
reviewed-claims.json
documents.json
parses.json
editorial-review.json
approved-article.json
```

현재 원문과 canonical parse를 재확인하고, 현재 원고·사실·승인 판단으로 `approvedArticle`을 다시 계산한다. 저장된 승인 기사와 다르면 미리보기를 중단한다. 승인 후 바뀐 원고·사실·원문·파싱 결과를 이전 승인으로 생성하지 않는다. 이 검사는 저장된 취득본의 무결성 검사이며 원격 사이트의 당일 재취득이나 사실 전체의 새 독립 검토를 뜻하지 않는다.

### 20.3 세 실제 정정본

모든 입력 annotation은 원문부터 직접 작성·검토한 `source_reviewed_candidate`이며 `local_model_extraction=false`다. 분석은 세 기사 모두 `null`로 유지했다. 원문 설명에 필요한 실험 조건·계획·귀속은 본문에 남기고 분석 생략 이유는 독자에게 표시하지 않는다.

| 형식·고정 사건 ID                | 원 발표일·기존 회차     | 직접 정정해 유지한 정보                                                                                                                                                      |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기업 전략 · `9935b37c854178f3`   | 2026-09-13 · 09-14 회차 | 현대차그룹의 엔비디아 기반 2028년·자체 AI 기반 2029년 양산 목표, 약40대 데이터 수집 차량, 통합 개발 조직과 이전 발표의 날짜. 계획을 완료 실적으로 쓰지 않음                  |
| 논문 해설 · `12d7d589a995c908`   | 2026-09-21 · 09-22 회차 | RamanOmics의 연구자/기관·동일 절편 정합·2개월/26개월 생쥐 코호트·세포 무작위70/30 비교·폐/피부 정확도·p21 부분집합·화학 성분 분류와 특정 분자 구분                           |
| 연구 사업화 · `cab7656fd9930f79` | 2026-09-22 · 09-23 회차 | Envisagenics–베링거의 다년 연구/라이선스 옵션, US$10억 초과의 조건부 잠재 지급과 별도 향후 로열티, Akerman 공동창업/당시 연구 역할·Krainer 자문·회사 귀속의 후기 전임상 단계 |

논문 DOI는 `10.1038/s43587-026-01219-7`을 유지했다. 연구 논문의 결과를 상용 제품 성능이나 일반 인구에서 검증된 결과로 바꾸지 않았다. 연구 사업화의 라이선스 옵션은 실제 행사된 라이선스 계약과 구분했다. 회사가 발표한 잠재 지급 규모를 실제 지급 실적으로 쓰지 않았다.

세 run ID는 `20260927-<strategy/venture/paper>-grouped-source-reviewed-deep-v2`다. 정확한 원출력/정정 ID는 다음과 같다.

```text
strategy original ff638e0c2741109a92498a5b1d3f0656fb4952a33ee675c6a6f9df237b8f3a20
strategy corrected 4075e83c86f78347d9659b36c8657b1f47371c835ef7f600ddbe3fe182e14d9b
venture original  1337b16b7c4c13265a428f1428b6930c979cf69538c3e712736f9238a1ca7efe
venture corrected 2264dc26bd0d53f6a65ce2ab94c6c9584165c0463253bff374404430d910aebd
paper original    802586e875dd050a816412a4239045e60f0c2016cf9a4fe839873621ec32a591
paper corrected   ee36d189edde3d50251d8fbeb8c4a2b68678b4a57423d8b6ed51f0c3647aafc4
```

각 run의 `draft-correction-v1.json`, `corrections/`, `drafts/`, `final-editorial-review-v1.json`과 최종 승인 파일을 함께 읽는다. 정정본 세 승인과 원모델의 자동 발행 품질 판정은 별개의 결과다. 독립 사람 gold·heldout 평가는 여전히0이다.

### 20.4 전체 private 사이트 명령과 입력

```bash
npm run research -- preview --run 20260927-three-deep-private-site-v4 --approved-run 20260927-strategy-grouped-source-reviewed-deep-v2 --approved-run 20260927-venture-grouped-source-reviewed-deep-v2 --approved-run 20260927-paper-grouped-source-reviewed-deep-v2
```

`--approved-run`은 반복할 수 있고 승인 입력 run끼리 중복되거나 출력 run과 같으면 거부한다. 이후21절의 `--knowledge-run`을 추가했다. 두 승인 run 옵션은 `preview`에서만 지원한다. 현재 `--vault`는 `preview`, `note-review`, `inventory`, `knowledge-draft`의 읽기 입력 경로이며 기본값은 저장소 `vault`다. 이 네 명령 이외에 `--vault`를 전달하면 거부한다. 당시 preview 구현 이후 추가된 명령도 현재 CLI 계약에 포함해 확인한다.

미리보기는 기존 사건이 등장하는 **모든 회차**를 찾고 해당 기사만 정정본으로 교체한다. 기존 각 회차의 다른 기사·순서·기사 ID·원 발표일·검토 상태·분야/보조 분야·테마/보조 테마·엔티티·용어 경로를 유지한다. 미검토 기사를 이 작업 때문에 검증 완료로 바꾸지 않는다. 승인 사건이 기존 회차에 없으면 과거 회차를 만들지 않고 새 회차 경로가 필요하다는 오류를 반환한다.

회차 메타데이터의 제목·날짜·coverage·cutoff·Knowledge 세 배열·주요 소식·최근 사건·제외 사건은 공개 허용 목록으로 보존한다. 내부 판단/취재 기록은 복사하지 않는다. 주요 소식 제목은 event ID로 정정 제목에 다시 연결한다. 기사 원 발표일이 기존 값과 다르면 소급 수정 전용 검토가 필요하므로 중단한다.

전체 작업 사본 위치는 `runs/<preview_run>/preview-workspace/`다.

| 사본                                                | 처리                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 전체 `vault/`                                       | 일반 파일을 바이트/해시로 고정해 복사. 승인한 기존 회차만 사본에서 교체                         |
| `scripts/`, `quartz/`, `web/`, `data/`              | 현재 신뢰된 렌더러를 복사. private 원문/모델 결과·Git 이력·인증 설정은 복사하지 않음            |
| package/Quartz/TypeScript 설정                      | 렌더링에 실제 필요한 현재 설정을 입력 해시에 포함                                               |
| `node_modules`                                      | 이미 설치된 로컬 의존성만 공유 심볼릭 링크. Quartz 코드/캐시·생성 파일은 사본에 보관            |
| `data/catalog.json`, `data/drive-source-state.json` | 기존 생성 카탈로그·Drive 성공 상태는 가져오지 않음. 후보를 Drive 검증 완료로 오인하지 않도록 함 |

저장소의 원본 작성 노트·RSS·digest·public을 정정 기사로 덮어쓰지 않는다. Node 프로세스로 이미 설치된 Quartz CLI를 호출하고 `npm_config_offline=true`를 전달한다. 모델·Drive·Git·publish 명령은 호출하지 않는다. 기존 `scripts/build-site.mjs`도 npx 대신 설치된 `quartz/bootstrap-cli.mjs`를 사용하도록 연결해 사본에서의 패키지 탐색/다운로드 실패를 없앴다.

### 20.5 단계별 검증·재개·변조 차단

`preview/` scope의 RunState가 승인 여섯 파일·원문/parse·작성 원본·렌더러·Node 버전을 입력 해시로 고정한다.

| 단계            | 실제 작업과 저장                                                                 |
| --------------- | -------------------------------------------------------------------------------- |
| workspace       | 작업 사본 복사·전체 기존 회차 투영·원본과 사본의 작성 해시 고정                  |
| refresh         | 기존 `scripts/garden.mjs refresh`로 뉴스/브리핑/RSS/digest 생성                  |
| knowledge-sync  | 기존 `scripts/knowledge.mjs sync`로 구조/연결 생성                               |
| knowledge-check | 기존 관계 검증. 기존 모든 정의의 원문 재검토를 대신하지 않음                     |
| validate        | 기존 전체 작성/편집 검증기 실행. 요구사항을 낮추지 않음                          |
| build           | 자산을 포함한 Quartz/reader 전체 생성                                            |
| verify          | 기존 링크/검색/RSS/지도/공개 파일 검증                                           |
| consistency     | 정정 제목·리드·설명 모든 문단·발표일·출처 URL을 실제 웹/회차/RSS/digest에서 대조 |
| outputs         | 생성 public/digest의 전체 경로·바이트 해시와 검증 manifest 보관                  |

각 외부 명령의 로그는 `<stage>-attempt-<UUID>.log`에 exclusive 생성한다. 같은 run의 실패 재시도도 이전 실패 로그를 덮어쓰지 않는다. 완료 checkpoint의 로그 해시와 입력이 같으면 재사용한다. 코드·승인·원문·작성 입력이 바뀌면 새 run이 필요하다.

생성 전후 원본 vault와 렌더러가 입력과 같은지 검사한다. 정정된 사본의 작성 입력이 생성 과정에서 바뀌어도 거부한다. 완료 후에는 public/digest의 전체 파일 목록을 비교하므로 기존 파일 변조뿐 아니라 새 임의 HTML/Markdown 추가도 차단한다.

실제 v4에서 own private probe로 다음 네 가지를 각각 만들었다가 원 바이트로 복구했다. 네 경우 모두 재개가 거부됐고 복구 후 같은 입력 재개는 성공했다. 원본 vault와 공개 서비스는 건드리지 않았다.

- public에 임의 HTML 추가 → `Private reader output changed`.
- digest에 임의 Markdown 추가 → `Private digest output changed`.
- 정정 뉴스 HTML 변경 → `Private reader output changed`.
- 사본 회차의 작성 원문 변경 → `Private authoring input changed`.

결과는 `private-integrity-review-v1.json`에 실패 메시지·복구·최종 manifest SHA와 함께 남겼다.

### 20.6 작성 계약 실패와 날짜 수정

첫 전체 run `20260927-three-deep-private-site-v1`은 기존 전체 작성 검증기에서 실패했다. 회차 투영이 요구되는 열 개 본문 섹션을 만들지 않았고 Sources 행을 기존 `- [S#] URL` 형식으로 쓰지 않았다. 요구 섹션과 Sources 표현은 생성기에서 수정했고 기존 Python 검증기는 그대로 유지했다. 실패 journal/validate 로그는 보존했다.

이어 기존 회차의 `recent_event_ids`가 빠지면 최근 사건을 찾지 못하는 실제 실패를 회귀로 만들었다. 공개 navigation 필드·Knowledge 세 배열·제외 사건·보조 분류·다른 기사의 용어 경로를 보존하고 알 수 없는 private 메타데이터를 버리도록 고쳤다. 한 기사를 정정하는 과정에서 회차의 다른 기사나 검토 상태를 바꾸지 않는다.

브라우저에서 RamanOmics 상세 상단이 원 발표일09-21 대신 브리핑09-22를 표시하는 기존 문제를 확인했다. [site.mjs](../scripts/site.mjs)의 `readerDate`는 뉴스 메타데이터의 원 발표일 `published_at`을 먼저 사용하고 검색 날짜에도 같은 값을 적용한다. 확인된 원 발표일은 `발표`와 `<time datetime>`으로 표시한다. 원 발표일이 없는 과거 기사는 확인된 회차 날짜를 `브리핑`으로 표시하며 원 발표일을 추정하지 않는다. 일반 브리핑 날짜의 KST coverage fallback은 유지했다.

### 20.7 실제 전체 생성·채널 대조·브라우저 결과

최종 run은 `20260927-three-deep-private-site-v4`다. v1 실패와 v2/v3의 중간 결과는 그대로 보존한다. 원 모델을 다시 호출하지 않고 정정 승인본과 현재 렌더러로 생성했다.

| 확인                  | 실제 결과                                                                         |
| --------------------- | --------------------------------------------------------------------------------- |
| 전체 기존 데이터 검사 | 436 notes·26 v2 회차, 오류0                                                       |
| private reader 생성   | 249 페이지·277 public 파일                                                        |
| 전체 링크/검색 검사   | 251 HTML·249 검색·87 기사·16 개념·17 관계·RSS40                                   |
| 원고 대조             | 정정 세 기사 전체 제목/리드/설명·출처를 뉴스와 모든 등장 회차/RSS/digest에서 확인 |
| RSS 식별자            | 기존40 GUID·pubDate·회차 순서 일치. 소급 기사를 오늘 회차로 생성하지 않음         |
| 원본 보존             | 원본181 작성 파일 SHA 일치, 기존 RSS40 GUID/pubDate 일치                          |
| npm test              | 335 tests·45 suites·실패/skip0                                                    |
| npm run test:garden   | 172 tests·실패/skip0                                                              |
| TypeScript/build/site | `tsc --noEmit`·원본 입력 build·verify exit0. 새 기사 공개 배포의 증거는 아님      |

`preview-manifest.json`에는 회차 경로·정정 기사 대조 결과·전체 출력 SHA를 기록했다. `candidate_published=false`, `drive_verified=false`, `browser_verified=false`는 생성기가 스스로 브라우저 검증을 주장하지 않는 상태다.

실제 Chrome/CUA 검증은 별도 `browser-review-v1.json`에 최종 manifest·페이지·reader.js SHA와 함께 기록했다. 두 receipt를 합쳐 해석하며 생성기 manifest의 false를 true로 수동 변경하지 않는다.

- 09-22 브리핑의 전체9카드 → 바이오 탭2카드, 공유 쿼리와 새로고침 후2카드 유지.
- 같은 reader.js를 사용하는 v2에서 뒤로/앞으로·AI 탭 Enter 이동·RamanOmics 태그의 기사1건 필터를 확인했다. v4에서도 탭/새로고침을 직접 확인했다.
- 세 뉴스 상세에서 정확한 원 발표일09-13/09-21/09-22와 수정 문장을 읽었다. 뉴스·브리핑의 지도0, 빈 분석 탭/정정 기사의 분석 제목0.
- 390×844 viewport에서 카드/상세의 가로 넘침이 없었다. 키보드로 기사 이동을 확인했으나 실제 모바일 기기·터치 탐색 검증은 아니다. 임시 viewport는 기본값으로 복구했다.
- 지도 전용 페이지의16노드/17관계·검색·노드 선택·관련6기사·용어 읽기의 Enter 이동을 확인했다. 정정 전략 기사의 근거 없는 VLA 용어 배정은 없앴다.
- 기존 VLA 정의 페이지의 과거 변화 설명은 아직 전체 원문 재검토 대상이다. 지도 기능 동작으로 기존 용어/관계 전체의 의미 검토를 완료했다고 판정하지 않는다.

실제 로그는 private `private-preview-full-suite-20260927.log`, `private-preview-all-tests-20260927.log`, `private-preview-typecheck-20260927.log`, `private-preview-original-build/site-20260927.log`와 각 preview run의 attempt 로그다. 독립 사람 검토·Drive 업로드·공개 배포·실물 모바일 판정은 이 결과에 포함하지 않는다.

### 20.8 다음 구현·수용 조건

이번 정정 세 사건은 기존 verified 사건의 원고 확장이며 잔여14개 미검토 v2 사건을 새로 판정한 수가 아니다. 전체 소급 분모14사건+92구형 회차, 활성 기준11사례/71사실과 목표40개발/20heldout, 실제 새7회 비교의 조건을 유지한다.

다음 작업은 [구현 계획 P4~P6](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#9-p4--지식-축적키워드전체-소급-검토)와 현재 진행표를 따른다.

1. 역할별 중요한 근거와 묶음 사이의 실험/계약 조건을 놓친 모델 추출을 개선한다. 보안·AI/PDF·초록 대조·한국어 교수 창업·실제 고객 도입 등 초기 지정 유형을 채우고 독립 기준 검토를 확정한다.
2. 기존 Knowledge의 정의·작동 원리·별칭·관계와 Signals/TrendTopics의 실제 이력을 재검토한다. 기사 배정 정정에 의존하는 과거 설명/관계를 함께 고치고 근거 없는 변화 설명은 공개 결과에서 제거한다.
3. 미검토14사건과92구형 회차를 원문부터 소급 판정한다. 제외가 검색/피드/키워드/지도/GitHub 생성 결과로 전파되는지 전체 출력에서 확인한다.
4. 이후 취득한 원문을 기존 archive와 분리해 묶고 실제 Drive 보관/원격 재읽기/동시 수정/독립 인증을 연결한다. 로컬 manifest 성공을 원격 검증 완료로 바꾸지 않는다.
5. 기존08시 하나의 경로에만 연결하고 서로 다른 실제 새7회 비교와 지원 전환·첫 새 발행을 수행한다. 과거 정정 세 회차·기존 운영 감사5회·검색 실행을 새 운영 횟수로 산입하지 않는다.

새 유료 API·별도 예약·Git 이력 재작성은 도입하지 않는다. 문서화와 이 절의 private 코드/검증 완료가 전체 구현 목표 완료를 뜻하지 않는다.

기존 공개 기사를 변환할 때 `article_review`에는 `title`을 명시해 넘긴다. `stageProjection` 반환값은 문자열 경로가 아니라 `{ path, sha256 }`이며 경로는 저장 root에 대한 상대 경로다. 신규 일일 발행 CLI 연결 시 이 계약을 사용하고 private 투영의 나머지 기존 기사 상태를 그대로 기록한다.

## 21. 전문용어·누적 주제의 근거 검토와 비공개 정정

### 21.1 구현 범위와 저장 경계

[note-review.mjs](../scripts/research/note-review.mjs)는 **현재 존재하는** `Knowledge/`, `Signals/`, `TrendTopics/` Markdown을 대상으로 한다. 원문 사실과 수정 전 작성 원본을 읽어 전체 교체 내용의 비공개 승인 기록을 만들며 원본 vault에 쓰지 않는다. 새 용어 생성, 전체 의존 관계 자동 정정, Drive 쓰기, 실제 발행은 이 명령의 기능이 아니다.

검토자는 원문과 최종 문장을 직접 읽는다. 프로그램이 확인하는 것은 저장 근거·식별자·검토 시점·해시·명시적 판정의 일관성이다. 프로그램 통과를 문장의 의미가 자동 검증됐다는 결과로 바꾸지 않는다. 이번 원문 직접 검토는 Codex 수행이며 독립 사람 gold·모델 추출 평가 사례 수는 늘어나지 않는다.

| 입력      | 요구 조건                                                   | 보존·거부 방식                                                               |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 기존 노트 | 세 작성 폴더 아래의 존재하는 Markdown, 수정 전 SHA-256      | 경로 이탈·심볼릭 링크·원본 변경 거부                                         |
| 교체 내용 | 전체 frontmatter와 본문, 노트당 최대1 MiB, 한 결정 최대64개 | 같은 경로 중복·알 수 없는 필드·빈 내용 거부                                  |
| 근거      | 실제 source run의 `reviewed-claims.json` 안 검증 사실 ID    | 원문 body·canonical parse·사실 검토 해시·정확한 인용을 재검사                |
| 검토 행위 | 원문/최종 문장/별칭/연결/이력 확인의5개 실제 boolean        | 문자열 `"true"`나 누락·false 거부                                            |
| 검토 날짜 | 실제 달력 날짜 또는 offset을 가진 과거 timestamp            | 미래·원문 관측/사실 검토 이전 거부; 노트 날짜는 KST 날짜로 대조              |
| 용어      | 기존 `concept_id`, v2 schema, 검토일, 확인 출처             | 원문 근거 밖 URL·잘못된 별칭·다른 노트의 파일명/제목/label/별칭·ID 충돌 거부 |
| 지도 검토 | `map_review.reviewed`가 같은 KST 검토일                     | 오래된 지도 판정을 새 설명 승인에 재사용하지 않음                            |
| 연결      | 대상 concept ID와 구체적 이유, 선택적 근거 URL              | 자기 자신·빈 이유·근거 밖 URL 거부; 전문용어 검증기는 별도 실행              |
| 누적 주제 | 기존 topic ID, `reviewed`, `knowledge_notes`, `lessons`     | ID 변경·날짜 불일치 거부                                                     |
| Signals   | 기존 회차·회차일·관측 ID, 새 검토일                         | 과거 관측 ID 삭제 거부; 전체 검토와 공개 전파는 후속 범위                    |

수정 전 전체 본문은 `approved-notes.json`의 `before_content`에 그대로 보존한다. 과거 판단을 현재 검토 날짜의 사실로 덮어쓰지 않는다. canonical 원본이 바뀌면 기존 승인 파일을 재사용할 수 없으며 새 기준으로 다시 검토해야 한다.

### 21.2 검토 파일과 승인 명령

실제 CLI의 계약은 `knowledge-note-review/v1`다. 다음은 필드 설명용 예시이며 실행용 원문 검토를 대신하지 않는다. `content`에는 관련 작성 계약에 맞는 전체 노트를 넣는다. 예시의 짧은 내용은 전체 사이트 검증을 통과하는 용어 노트가 아니다.

```json
{
  "schema": "knowledge-note-review/v1",
  "reviewer": "원문과 최종 노트를 직접 읽은 검토자",
  "reason": "비공개 수정 근거",
  "reviewed_at": "2026-09-27",
  "source_read": true,
  "final_prose_read": true,
  "aliases_checked": true,
  "connections_checked": true,
  "histories_checked": true,
  "notes": [
    {
      "path": "Knowledge/AI Systems/Vision-Language-Action Models.md",
      "previous_sha256": "수정 전 파일의 실제 SHA-256",
      "content": "전체 노트 frontmatter와 본문",
      "evidence": [
        {
          "run_id": "원문 직접 검토 run ID",
          "claim_ids": ["그 run에 실제 존재하는 검증 사실 ID"]
        }
      ]
    }
  ]
}
```

실제 최종 승인 명령은 다음과 같다. 앞선 v1/v2 run과 검토 파일은 삭제하지 않았다.

```bash
npm run research -- note-review --run 20260927-vla-three-topics-notes-v4 --review .local/research/local-ai/reviews/vla-and-three-topics-note-review-v2.json
```

생성 파일은 `runs/<run>/note-review.json`, `approved-notes.json`, `note-review/` scope journal이다. 같은 입력·구현 해시의 완료 단계는 재사용한다. `loadNoteApproval`은 읽을 때도 원본 노트·source run·사실을 다시 검사하고 재계산한 승인 결과가 저장 파일과 같은지 비교한다. 승인 노트의 내용을 뒤에서 바꾸거나 원문 body를 변조하면 거부한다.

### 21.3 실제 원문 확보와 네 노트 정정

`20260927-vla-concept-primary-v1`에서 세 원문을 실제 확보했다. 각각12·16·92개 본문 구간을 읽고6개 사실을 원문부터 직접 annotation했다. 로컬 모델을 새로 호출하지 않았으며 원 모델의 자동 추출 정확도로 계산하지 않는다.

| 원문                                                                                              | 확보 구간 | 설명에 사용한 내용                                         |
| ------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| [RT-2 논문](https://arxiv.org/abs/2307.15818)                                                     | 12        | 로봇 관측→행동, 시각언어 사전학습, 행동 토큰               |
| [RT-2 연구 페이지](https://robotics-transformer2.github.io/)                                      | 16        | 영상·지시·시점별 행동, 추론 시 행동 변환/폐루프, 평가 유형 |
| [Anthropic 에이전트 평가](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 92        | 명확한 과제·안정적 시험 환경·생성 코드 시험                |

이번 일반 profile의 세 문서는 발표일·수정일이 null이다. 원문 학습 설명의 배경 근거이며 오늘 신규 뉴스로 발행하지 않았다. 논문의 식별자와 과거 발표일 확인은 별도다. 원문/파싱/근거 연결은 저장했지만 arXiv·논문 페이지의 날짜 전용 profile 활성화 완료를 뜻하지 않는다.

| 노트                                                    | 최종 수정                                                                              | 그대로 보존한 것                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Knowledge/AI Systems/Vision-Language-Action Models.md` | RT-2에 근거한 정의·학습/제어·예시, 출처 없는2026년 변화 삭제, 빈 부분 숨김             | `concept_id=vla`·경로·정확한 별칭·기존 근거 있는 관계         |
| `TrendTopics/company-hyundai-motor-group.md`            | 3월/9월 발표·2028/2029년 목표·약40대 수집 차량·통합 개발 조직, 근거 없는 VLA 배정 제거 | 기존 topic ID·과거 검토 본문·9월13일 사건                     |
| `TrendTopics/research-ramanomics.md`                    | 같은 절편의 정합·세포70/30 분할·RNA 특징 단독 대비 라만 특징 추가의 결과               | 기존 topic ID·과거 검토 본문·9월21일 사건·DOI                 |
| `TrendTopics/venture-envisagenics.md`                   | 다년 연구/검증·독점 옵션·조건부 잠재 지급·향후 별도 로열티                             | 기존 topic ID·과거 검토 본문·9월22일 사건·교수/회사 역할 근거 |

첫 v1의 RamanOmics 누적 요약은 비교 기준을 라만 단독으로 표현했다. 실제 화면과 논문 사실을 대조한 뒤 **RNA 특징 단독 모델에 라만 특징을 추가한 비교**로 정정했다. 외부 검증 완료를 암시하지 않도록 제목은 `RamanOmics의 조직 분석`으로 바꿨다. v1은 중간 기록이며 최종 선택은 검토 파일 v2와 승인 run v4다. v3/v4에는 UTC 자정과 KST 날짜 경계·다른 노트의 파일명 별칭 충돌 회귀도 포함한다.

### 21.4 현재 설명과 과거 브리핑 분리

기존 `trendSnapshot`은 회차 시점의 판단 경계를 유지한다. 새 `currentTrendSnapshot`은 현재 주제의 마지막 실제 검토일을 이용해 최신 설명을 구성한다. 새 검토일을 현재 시각으로 자동 생성하지 않는다.

- 브리핑 허브의 최신 뉴스 날짜는 기존09-23으로 유지한다.
- 네 노트의 현재 재검토일은09-27이다. 현재 주제 카드·주제 페이지·GitHub 주제 Markdown이 같은 설명을 표시한다.
- 과거 회차의 판단과 등장 기사·발표일·RSS pubDate는 바뀌지 않는다.
- 주제의 `reader_format: source-events/v1`은 현재 요약 → 사건 이력 → 기사·원문·당일 브리핑 순서다.
- 이력에는 verified 사건만 넣고 같은 사건은 한 번 표시하며 원 발표일 최신순으로 정렬한다.
- 한 사건만 있어도 그 사건을 보여준다. 관측 수를 성장·시장 점유율로 해석하지 않는다.
- 미래 확인 질문·검토 안내·빈 원칙·빈 관련 개념을 해당 형식에 출력하지 않는다.
- 아직 재검토하지 않은 다른 주제는 기존 상태다. 이번 세 주제로 전체 주제/Signals 재검토 완료를 계산하지 않는다.

용어 노트는 기존 작성 계약의12개 섹션을 유지한다. 빈 섹션은 작성 사본에서 `없음`으로 두고 기존 공개 투영이 숨긴다. 작성 검증기의 요구 섹션을 삭제하거나 검사 수준을 낮추지 않았다.

### 21.5 승인 노트와 전체 private 사이트 연결

`preview`에 `--knowledge-run`을 반복해서 추가할 수 있다. 기사 승인만, 노트 승인만, 둘을 함께 사용하는 세 가지 입력을 지원한다. 각 목록은 중복을 허용하지 않고 출력 run과 같은 ID를 거부한다. 서로 다른 노트 승인 run이 같은 canonical 경로를 덮으려 해도 거부한다.

```bash
npm run research -- preview --run 20260927-vla-three-topics-private-site-v5 --approved-run 20260927-strategy-grouped-source-reviewed-deep-v2 --approved-run 20260927-venture-grouped-source-reviewed-deep-v2 --approved-run 20260927-paper-grouped-source-reviewed-deep-v2 --knowledge-run 20260927-vla-three-topics-notes-v4
```

승인 네 노트를 private vault 사본에만 적용하고 기존 전체 생성기를 호출한다. 실행 입력/manifest는 노트 승인 파일·원문 근거·수정 전/후 SHA와 작성 경로를 포함한다. 생성 전후 현재 승인·원본·렌더러 해시를 다시 검사한다.

`verifyKnowledgeOutputs`의 전체 결과 대조는 다음을 확인한다.

1. private 작성 노트가 승인한 전체 바이트와 같다.
2. 용어 정의·작동 원리·실제 예시와 출처가 실제 HTML에 있다.
3. 빈 용어 섹션 제목은 HTML에서 사라진다.
4. 누적 주제의 현재 요약이 실제 주제 HTML·브리핑 허브·digest와 같다.
5. 사건 이력의 리드·출처가 검증 기사와 같으며 운영 소제목이 출력되지 않는다.
6. 기존 세 기사/등장 회차/RSS/digest 대조와40 GUID·pubDate 보존도 함께 통과한다.

manifest에 `knowledge_runs`, 노트별경로/SHA, `consistency.knowledge`의 실제 HTML/digest/사건 ID를 기록한다. 내부 검토 이유·수정 전 전문·근거 annotation은 private 승인 파일에만 남긴다. `candidate_published=false`, `drive_verified=false`, `browser_verified=false`는 그대로 유지하며 별도 브라우저 검토를 이 값의 수동 변경으로 대체하지 않는다.

### 21.6 남은 완료 조건

현재 실제 정정은 용어1개·누적 주제3개다. 원본 vault·Drive·공개 사이트를 이 명령으로 수정하지 않았다. 기존 Signals 원본도 이번에 새로 판정한 것이 아니다.

다음 작업은 나머지 용어/관계와 Signals/주제를 사건 근거부터 검토하고, 정정·공개 제외가 설명/이력/지도에 전파되는 것을 확인하는 것이다. 잔여14개 v2 사건+92개 구형 회차, 초기 지정 유형/40개발20heldout, 신규 보관 묶음의 Drive 왕복/독립 인증, 서로 다른 실제 새7회 비교와 기존08시 단일 경로의 첫 발행은 그대로 남는다. private 네 노트·과거 세 회차·브라우저 검증을 전체 소급이나 새 운영 회차로 세지 않는다.

### 21.7 실제 검증 결과와 복구 시험

최종 전체 run은 `20260927-vla-three-topics-private-site-v5`다. v1/v2/v3/v4와 각 원문·승인·실패 로그는 보존한다. 기존 작성 원본에는 쓰지 않았다.

| 검증                   | 실제 결과                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ |
| 승인 노트              | 용어1 + 누적 주제3, 원본 해시·근거6/7/8/7 사실·검토일 대조                           |
| 전체 private 작성 검사 | 436 notes·26 v2 회차, 오류0                                                          |
| 전체 private 출력 검사 | 251 HTML·249 검색·87 기사·16개 지도 노드/17관계·RSS40                                |
| 같은 원고 대조         | 세 정정 기사와 모든 등장 회차·RSS·digest, 네 승인 노트의 실제 HTML/주제 digest       |
| 기존 RSS               | 40 GUID·pubDate·회차 순서 동일, 소급 자료를 신규 회차로 만들지 않음                  |
| 집중 테스트            | 37개 통과: 노트 승인·현재/과거 판단·비대상 주제 날짜·회차 투영                       |
| 전체 JS                | 345 tests·45 suites·실패/skip0                                                       |
| garden JS              | 182 tests·실패/skip0                                                                 |
| TypeScript             | `tsc --noEmit` exit0                                                                 |
| 승인/출력 변조         | 승인 JSON·용어 HTML·주제 본문·private 작성 노트의4개 변조 모두 거부 후 원바이트 복구 |
| 승인 충돌              | 같은 canonical 경로를 교체하는 두 승인 run 결합 거부                                 |
| 비대상 날짜 보존       | 재검토하지 않은10개 누적 주제의 날짜와 본문 기준일 보존                              |
| 완료 단계 재개         | 복구 뒤 동일 입력 preview 재사용 exit0, 새 모델 호출 없음                            |

브라우저는 v3 결과에서 네 설명·허브 현재 요약·사건/원문 링크·Enter 탐색을 직접 읽었다. 연구 사업화 주제와 허브를390×844에서 확인했고 가로 넘침0, 허브 지도0이었다. 용어의 빈 한계/최근 변화 제목0과 출처 없는2026년 변화 문장 제거를 확인했다. 실제 모바일 기기·터치는 이 결과에 포함하지 않는다. 임시 viewport를 복구했다.

중간 v4와 직접 본 v3의 reader/asset276개와 digest 전체는 SHA가 같았다. 별도 `sitemap.xml`은 Quartz가 생성하는 폴더의 lastmod12개 시각만 달랐으며 lastmod를 제외한 XML은 같았다. 사이트맵의 폴더 URL 정리는 기존 공개 메타데이터의 후속 점검 항목이다.

최종 점검에서 한 주제의09-27 검토일이 무관한 주제10개의 페이지 기준일까지 바꾸는 결함을 발견했다. v5의 `topicAsOf`는 각 주제의 검토일과 마지막 회차 날짜를 사용하며 무관한 주제는09-23 상태로 유지한다. fixture 회귀와 실제10개 작성 사본의 날짜, GitHub 주제 본문의 기준일을 확인했다. 다른 주제를 재검토한 것처럼 표시하지 않는다.

최종 v5와 직접 본 v3의 용어·세 주제·허브·고정 뉴스 HTML와reader.js/CSS/graph의9개 파일, 날짜별 digest·정정 세 주제 digest는 SHA가 같다. 무관한10개 주제 digest는09-27→09-23 기준일만 바로잡혔음을 전체 본문 대조로 확인했다. 이 비교는 서로 다른 run 사이의 브라우저 증거 연결이다. 같은 run의 완료 후 출력 검사는 sitemap을 포함한277개 전체 파일의 정확한 SHA를 계속 검사한다.

첫 private 감사 스크립트는 두 run의 sitemap lastmod까지 같을 것으로 가정해 실패했다. 차이를 읽어 생성 시각만 달라졌음을 확인한 뒤 reader/asset 대조와 sitemap 구조 대조를 구분했다. 둘째 변조 probe는 메타 설명의 첫 등장만 바꿔 실제 본문이 남았으므로 본문까지 변경하는 probe로 고쳤다. 두 실패 로그를 보존했으며 애플리케이션 검사기를 낮추거나 검증 실패를 성공으로 바꾸지 않았다.

증거는 final run의 `preview-manifest.json`, `knowledge-integrity-review-v1.json`, `knowledge-browser-review-v1.json`과 private `knowledge-*-20260927.log`다. 생성기 manifest의 `browser_verified=false`는 유지한다. 원본181개와 RSS40 보존·문서 링크/예시 검사는 별도 문서 검증 receipt에 남긴다. Drive 업로드·commit/push·공개 배포·예약 변경은 수행하지 않았다.

## 22. 전체 소급 목록과 목록·각주·날짜 파싱

2026-09-27 후속 작업. 전체 소급 조사에 사용할 실제 분모와 의존 기록을 확보하고, 최근 미검토 두 원문에서 목록·각주·날짜 손실을 고쳤다. 원본 원고·기존 복구본·모델 출력·이전 파싱 버전은 유지한다. 이번 작업은 전체 소급 판정이나 새 경로의 서비스 발행 완료가 아니다.

### 22.1 전체 목록을 만드는 명령

```bash
npm run research -- inventory --run 20260927-whole-retrospective-inventory-v2
```

다른 vault를 읽으려면 `--vault /absolute/path/to/vault`를 명시한다. 출력은 `.local/research/local-ai/runs/<run>/retrospective/inventory.json`이다. 기존 `baseline`의181개 복구본과 `research-baseline/v1`은 덮어쓰지 않는다. 새로운 목록은 기존 비공개 실행 journal을 사용하는 파생 기록이며 지식의 별도 원본 저장소가 아니다.

수정 파일은 [retrospective.mjs](../scripts/research/retrospective.mjs), [CLI](../scripts/research.mjs), [회귀 시험](../tests/research-retrospective.test.mjs)이다. 명령은 모델·웹·Drive·Git·발행기를 호출하지 않는다. 작성 원본과 RSS를 읽고 결과를 비공개 run에만 저장한다.

| 목록                       | 실제 필드와 용도                                                                |
| -------------------------- | ------------------------------------------------------------------------------- |
| `hashes`, `notes`          | 181개 작성 원고의 전체 SHA·유형·원문 참조·Obsidian 링크                         |
| `events[].appearances`     | 고정 사건 ID별 모든 회차·제목·검토 상태·발표/검토일·원문·명시 용어              |
| `events[].dependencies`    | 모든 회차, Signals 관측, 누적 주제, 명시 용어와 같은 원문을 쓰는 용어           |
| `date_review_required`     | 발표일 누락·불일치; 회차 날짜로 자동 채우지 않음                                |
| `legacy[].units`           | 구형 원고의 제목·깊이·본문 시작/끝·정확한 구간 SHA·출처 목록                    |
| `concepts`, `relations`    | 원자 용어·별칭·지도 선정 기록과 모든 작성 연결; source/inference/type/근거 보존 |
| `signals`, `topics`        | 관측 ID·사건/주제 연결·검토일·이전 판단/교훈의 실제 메타데이터                  |
| `sources`, `source_groups` | 원래 URL별 식별자·참조 위치와 정규화 URL별 조사 후보 묶음                       |
| `generated_dependencies`   | 작성 원고가 연결한 생성 페이지의 별도 SHA; 작성 원본 수에는 제외                |
| `rss`                      | 기존 피드 SHA·GUID·pubDate·링크와 회차 순서                                     |
| `diagnostics`              | 실제 잘못된 원문·미해결 노트 참조; 성공으로 숨기지 않음                         |

정규화 URL이 같다는 사실은 원문 취득의 재사용 후보일 뿐 같은 사건이라는 판정이 아니다. 서로 다른 고정 사건 ID와 구형 문단 ID를 유지한다. 구형 문단 ID는 파일/위치에서 만든 검토 단위 식별자이며 기사 ID로 공개하지 않는다. 제목·출처 목록·빈 섹션·편집 문단도 구간에 포함되므로 구간 수를 뉴스 건수로 보고하지 않는다.

검토 상태가 등장 회차마다 다르면 `mixed`로 남기고 전체 검토가 끝났다고 세지 않는다. 전문용어의 기존 `verified_sources`에 같은 원문 URL이 있으면 의존 검토 후보로 연결한다. 이 목록은 새로운 전문용어 배정이나 개념 관계의 의미 검증이 아니다. 공동 등장·비슷한 이름으로 관계를 추가하지 않는다.

### 22.2 현재 전체 분모와 보존 조건

실제 run `20260927-whole-retrospective-inventory-v2`의 결과다.

| 대상                     | 결과                               |
| ------------------------ | ---------------------------------- |
| 작성 원본                | 181개                              |
| 새 형식 회차             | 26개                               |
| 사건/등장                | 87개/87곳                          |
| 기존 검증 사건/남은 사건 | 73개/14개                          |
| 구형 회차/검토 구간      | 92개/801개                         |
| Knowledge/원자 개념      | 33개/27개                          |
| 작성된 관계              | 36개; 선정 지도17개 선과 별도 분모 |
| Signals/누적 주제        | 17개/13개                          |
| URL 식별자/정규화 그룹   | 619개/618개                        |
| RSS 식별자               | 40개                               |
| 진단                     | 0개                                |

기존14개 미검토 사건은 모두 발표일이 없다. 지금 조사한9월1일 두 기사도 아직 공개 원고에서 검증 상태를 바꾸지 않았으므로 이14개에서 빼지 않는다. 용어1개/주제3개 private 승인도 원본181개 판정이 아니다.

원고 목록·각 바이트·RSS·연결한 생성 페이지와 구현 파일들의 SHA를 재개 입력에 고정한다. 같은 run과 같은 입력은 저장된 목록을 재사용한다. 원고 변경·파일 추가/삭제·생성 목적지 변경·checkpoint 변조는 거부한다. 현재 작성 원본이 바뀌면 새 run을 사용하고 기존 결과를 보존한다. vault·하위 폴더·노트의 symlink는 허용하지 않는다.

### 22.3 실제 원문에서 발견한 파싱 결함

[TimesFM-3 원문](https://www.research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/)은 범용 추출에서16개 구간을 얻었지만, 여러 목표값·과거 변수·알려진 미래 변수의 목록과 두 어텐션의 개별 설명이 빠졌다. 본문 설명의 구조·입력 조건을 보존하기 위해 exact URL profile을 추가했다.

[Google 검색 원문](https://blog.google/products-and-platforms/products/search/new-controls-website-owners/)은 최초 게시일이6월3일이고8월31일 업데이트 표시가 있다. 전 세계 확대를 명시한 각주는 `<article>` 밖의 `uni-footnotes`에 있어 기존15구간에 포함되지 않았다. 기사 본문과 이 각주를 함께 선택하며 사이트 메뉴·공유 버튼·footer는 원문 근거 구간에서 제외했다.

[수집 설정](../data/research-acquisition.json)의 새 profile은 `google-research-timesfm3-20260831`과 `google-search-controls-20260831-update`다. 전체 기사 profile은15개다. 해당 URL의 원문 구조를 확인한 설정이며 Google의 모든 기사에서 성공했다는 뜻은 아니다.

### 22.4 날짜와 근거의 현재 파서 계약

[Python worker](../integrations/research-worker/worker.py)는 다음 수정일 옵션을 지원한다.

```json
{
  "modification_date_xpath": "//main/article//p/i[starts-with(normalize-space(.), 'Updated:')]",
  "modification_date_pattern": "[A-Z][a-z]+ [0-9]{1,2}, [0-9]{4}",
  "modification_date_format": "%B %d, %Y"
}
```

속성값이 날짜일 때 `modification_date_attribute`를 추가할 수 있다. `modified_at`과 `modified_candidates`, `modified_basis`의 DOM 경로/본문/속성, `modified_profile_status`를 별도로 기록한다. `published_at`·기존 발표일 후보와 근거는 유지한다.

선택자 미일치·복수 선택·잘못된 날짜·metadata와 DOM의 다른 날짜는 수정일 성공으로 처리하지 않는다. 유효한 metadata만 있어도 명시 profile이 실패하면 수정일을 null로 남긴다. 같은 달력 날짜의 timestamp/day는 합칠 수 있지만 서로 다른 날은 `conflict`다. 수정일이 최초 게시일보다 이르면 `before-publication`이며 수정일은 null이다. 수정일이 있다는 사실만으로 새 사건이나 기사 재발행을 만들지 않는다.

### 22.5 재파싱·직접 원문 검토 결과

첫 수집 run은 `20260927-retrospective-sep01-google-sources-v1`이다. 두 원문 모두 robots 정책 확인 뒤 실제 body를 보관했다. 이후 저장 바이트만 다시 파싱했다.

```bash
npm run research -- reparse --run 20260927-retrospective-sep01-google-sources-profiled-v3 --source-run 20260927-retrospective-sep01-google-sources-v1
```

| 자료        | 범용 최초              | 최종 profile                                 | 날짜                           |
| ----------- | ---------------------- | -------------------------------------------- | ------------------------------ |
| TimesFM-3   | 16구간; 발표일 null    | 29구간; 입력 목록·두 어텐션·미래 마스킹 포함 | 발표2026-08-31                 |
| Google 검색 | 15구간; 외부 각주 없음 | 17구간; 기사·업데이트 각주 포함              | 발표2026-06-03, 수정2026-08-31 |

중간 v2의35구간에는 공유 버튼·메뉴가 함께 들어갔다. 이를 실제 구간 전문에서 확인한 뒤 선택 범위를 좁혔다. v1/v2의 파싱·원문/실패 기록을 지우거나 최종 기록으로 덮어쓰지 않았다. 재파싱은 최초 documents 메타데이터와 body SHA를 유지한다.

최종 두 원문을 직접 읽고 TimesFM8개·검색4개, 총12개 사실을 `claims.json`, `reviewed-claims.json`, `direct-source-review.json`으로 연결했다. 입력 조건·수치·회사에 귀속된 비교 결과·제공/계획·최초 게시/수정일을 대조했다. 이 사실은 Codex 직접 annotation이며 로컬 모델 추출 성능·독립 사람 gold·기존11개 평가 사본의 사례 수에 더하지 않는다. 기사 승인/원본 수정/Drive 저장/발행은 false다.

### 22.6 당시 남아 있던 날짜 정정과 조사

이 절은 재파싱 시점의 기록이다. 후속 날짜 정정 계약과 실제 기사 경로는 [23절](#23-원문-날짜-정정과-업데이트-사건의-소급-처리)을 따른다.

기존 private 소급 투영기는 알려진 기사 발표일의 보존을 요구한다. 발표일이 없는14개 원고를 통과시키기 위해 회차 날짜를 넣거나 이 검사를 제거하지 않았다. 다음 구현에서는 원문 근거에 따른 명시적인 날짜 정정 결정과 원래 null 값을 비공개 이력으로 보존해야 한다. 사건 ID·회차 cutoff·RSS40개 식별자/발행일은 유지한다.

검색 공지의 전 세계 확대는8월31일 수정에서 확인한 사건이다. 원문의6월3일 최초 게시일과 구분하고, 수정일이라는 이유만으로 모든 본문 문장을8월31일의 새 발표로 바꾸지 않는다. 업데이트 구간의 사실·유효 날짜·원문 버전 근거를 기사 정정에 연결하는 계약이 필요하다.

이후 두 기사의 육하원칙 리드/설명을 실제 작성·검토하고, 관련 Time-Series Foundation Models/AI Content Access 노트도 근거부터 다시 읽는다. 나머지12사건·구형92회차·전체 용어/관계/Signals/주제·공개 제외 전파는 그대로 완료 범위다. 신규 archive/Drive 왕복·독립 인증·실제60건40개발20보류·서로 다른 새7회 비교·기존08시 단일 연결/첫 발행을 이번 원문 재파싱과 목록 생성으로 대체하지 않는다.

### 22.7 후속 검증과 정확한 완료 범위

| 검사                      | 실제 결과                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| 전체 JS                   | 351 tests/45 suites, 실패·skip0                                                            |
| garden JS                 | 188 tests, 실패·skip0                                                                      |
| Python worker             | 17 tests, 성공                                                                             |
| TypeScript                | `tsc --noEmit` exit0                                                                       |
| 원본 작성 검사            | 436 notes/26 v2, exit0                                                                     |
| 새 전체 private preview   | `20260927-retrospective-parser-private-site-v6`,251 HTML/249검색/87기사/16노드17관계/RSS40 |
| 원본 보존                 | 181 SHA 및40 RSS GUID/pubDate/순서 일치                                                    |
| 소급 목록 실물 변조       | checkpoint 변조 거부→원바이트 복구→동일 입력 재개 성공                                     |
| 이전 브라우저 결과와 연결 | 직접 읽었던6 HTML와reader.js/reader.css/graph의9파일 SHA 동일                              |

이번에는 브라우저를 새로 조작하지 않았다. 이전 직접 검토와 같은9개 파일의 바이트를 대조했고 생성기의 `browser_verified=false`를 수정하지 않았다. 다른277개 전체 출력이 모두 이전과 같다고 확대하지 않는다. 새 두 원문의12개 사실도 기사 승인이나 신규 평가 gold가 아니다.

원문·파싱·목록·변조 복구·코드 검사와 전체 preview의 해시는 비공개 `retrospective-integrity-review-20260927-v1.json`, 문서 검사는 `documentation-validation-retrospective-20260927-v3.json`에 연결한다. 기존 receipts·실패 기록·복구본은 보존한다. Drive 업로드/원격 재읽기·독립 인증·공개 배포·예약 연결·새 운영7회·60자료 독립 평가는 여전히 미완료다.

## 23. 원문 날짜 정정과 업데이트 사건의 소급 처리

2026-09-27 후속 구현. 기사 날짜가 없는 원고와 최초 게시일 이후 날짜가 명시된 업데이트를 같은 사건 ID로 검토한다. 원래 authoring vault를 직접 덮어쓰지 않고 기존 `approve` → 전체 `preview` 경로에 연결했다. 날짜 정정·새 기사 작성·권위 자료 반영·공개 발행은 각각 별도의 증거다.

### 23.1 구현 책임과 변경 범위

| 파일                                                                                                                                                                         | 현재 책임                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [event-date.mjs](../scripts/research/event-date.mjs)                                                                                                                         | 기본 원문 발표일 검증, 날짜가 명시된 업데이트 근거, 소급 결정 schema와 원본 대조 |
| [publish-adapter.mjs](../scripts/research/publish-adapter.mjs)                                                                                                               | 문장에 실제 쓰인 검토 사실만 날짜 관문에 전달, 공개 날짜와 비공개 정정 이력 분리 |
| [preview.mjs](../scripts/research/preview.mjs)                                                                                                                               | 전체 등장 회차/원본 SHA 대조, 회차 투영, 웹·RSS·GitHub의 날짜 표현 확인          |
| [article-review.mjs](../scripts/article-review.mjs)                                                                                                                          | 허용된 공개 날짜 필드만 반환하고 `발표`/`업데이트` 구분                          |
| [reader-cards.mjs](../scripts/reader-cards.mjs), [reader-views.mjs](../scripts/reader-views.mjs), [site.mjs](../scripts/site.mjs), [briefings.mjs](../scripts/briefings.mjs) | 동일 날짜와 표기를 카드·상세·주요 소식·분야별 기사·공유 원고에서 사용            |
| [research-event-date.test.mjs](../tests/research-event-date.test.mjs)                                                                                                        | 업데이트 근거 누락, 이전 날짜/원본 변경, 전체 등장 누락, 비공개 유출의 회귀 검사 |

기본 기사는 기존 승인 형식 그대로 사용한다. 기존 심층 세 승인본도 현재 코드로 다시 계산한 결과와 저장 결과가 일치한다. 소급 승인을 넣지 않은 기존 회차의 날짜는 계속 보존해야 한다. 명시적인 정정 결정 없이 null을 브리핑 날짜로 채우는 우회는 없다.

### 23.2 업데이트 날짜 근거

최종 편집 승인 JSON의 선택 필드다. 아래는 구조 예시이며 실제 원문 식별자는 실제 run에서 읽는다.

```json
{
  "event_date_basis": {
    "kind": "dated-update",
    "source_id": "actual-source-id",
    "source_version_id": "actual-source-version-id",
    "parse_id": "actual-parse-id",
    "block_id": "actual-parse-id:block-0017",
    "claim_id": "actual-reviewed-claim-id",
    "date_text": "August 31, 2026",
    "source_published_at": "2026-06-03"
  }
}
```

승인 때 다음을 모두 검사한다.

1. 원문 버전·parse·블록이 현재 검증 사실의 근거와 같다. `assertStoredEvidence`가 실제 저장 body와 parse 사본도 다시 검사한다.
2. 원문 최초 게시일이 `source_published_at`과 같고, 그 날짜가 기사 업데이트 사건일보다 앞선다.
3. parse의 `modified_at`이 기사 사건일과 같고 명시 profile이 `matched`다. 수정일 DOM 경로와 날짜 텍스트가 있다.
4. 업데이트 본문/각주 블록에도 정확한 날짜 문자열이 있고, 날짜 해석 결과가 사건일이다.
5. 최종 원고의 리드 또는 설명이 사용하는 검토 사실에 같은 블록/문자열의 직접 근거가 있다. 심층의 근거 목록에만 있으며 독자가 읽는 문장에 쓰이지 않은 사실은 이 관문에 사용할 수 없다.
6. 해당 사실의 `effective_period`가 사건일이다. 사실의 원문 `published_at`은 최초 게시일을 유지한다.
7. 기존 사실의 의미·회사명·수치·시점 검토와 최종 원고의 직접 읽기를 통과한다.

현재 날짜 텍스트는 `YYYY-MM-DD`와 `August 31, 2026`처럼 정확한 영어 월 이름·일·연도만 지원한다. 자유형 기간·축약 월·언어별 날짜의 지원 확대는 별도 fixture와 구현이 필요하다. 수정일 metadata만 존재하거나 날짜 블록/검토 사실이 없으면 오류로 종료한다. 같은 날의 최초 게시/수정은 새 업데이트 사건으로 중복 승인하지 않는다.

공개 기사에는 `date_kind`, `source_published_at`만 추가한다. 근거의 내부 claim/parse ID·검토 사유·이전 원본은 출력하지 않는다. 날짜 라벨은 모두 `업데이트`이며 회차의 `date`, coverage, RSS pubDate와 다르다.

### 23.3 날짜 누락·오류를 고치는 비공개 소급 결정

선택 필드 `retrospective_review`는 `retrospective-article-review/v1`이다. 외부 원문 검토와 최종 편집 승인의 검토자·사건 ID·검토일이 일치해야 한다.

| 필드                                                        | 내용·검사                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `schema_version`, `event_id`                                | 계약 버전과 기존 16자리 사건 ID                                  |
| `reviewer`, `reviewed_at`, `reason`                         | 실제 검토자·현재 검토 날짜·변경 사유                             |
| `source_read`, `date_change_checked`, `ancillary_copy_read` | 원문, 날짜 정정, 기존 부속 문단을 직접 읽은 판정; 모두 true 필요 |
| `appearances[].path`                                        | 사건이 들어 있는 기존 Editions 경로; 중복 금지                   |
| `sha256`, `before_content`                                  | 정확한 이전 회차 바이트와 SHA; 원래 null/틀린 날짜를 복구 가능   |
| `previous_title`, `previous_published_at`                   | 현재 원고의 제목과 이전 사건일; 누락은 null                      |
| `sections[]`                                                | 직접 읽고 생략하는 기존 부속 섹션과 비공개 이유                  |

비공개 preview에서 모든 기존 회차를 다시 읽고 전체 등장 목록이 결정과 정확히 일치하는지 검사한다. 기존 제목·날짜·원본 바이트가 달라졌거나 등장 회차가 추가됐으면 오래된 승인을 적용하지 않는다. 누락된 등장도, 실제로 없는 등장도 거부한다. 원본을 다시 검토하고 새 결정/run을 사용한다.

정정한 사건일이 기존 회차의 날짜보다 뒤라면 거부한다. 뒤의 사건을 앞의 회차에서 이미 알았던 것처럼 만들지 않는다. 이 검사는 일자 범위만 확인하며 원문에 시각이 없을 때 정확한 발표 시각을 추정하지 않는다.

고정 기사 ID·기사 URL·회차 파일명·coverage_start/end·기사 수·RSS GUID/pubDate/순서는 유지한다. 기존 날짜가 잘못됐다면 승인된 새 날짜만 투영하며 이전 값은 비공개 복구본에 남긴다. 원문을 현재 확인했다는 사실을 과거 검토일로 바꾸지 않는다. 여러 회차에 동일 사건이 등장하면 하나의 검토 결과를 모두 연결한다.

### 23.4 기존 분석·안내 문단의 처리

기사 두 개를 교체해도 회차 아래에 과거의 근거 없는 해석이 남을 수 있다. 이를 단순 기사 제목/본문 교체로 완료 처리하지 않는다. 기존 `흐름 읽기`, `오늘의 적용`, `개념 색인`을 직접 읽고 정보 가치·근거·독자 표현을 검토한다.

현재 지원하는 소급 결정은 이 세 부속 섹션을 `없음`으로 만드는 명시적 생략뿐이다. 공개 생성기는 빈 섹션을 숨긴다. 결정은 원본 회차 SHA에 묶이며 뉴스 섹션·출처·기사 수를 지우는 데 사용할 수 없다. 부속 섹션에 새 사실/분석을 넣는 것은 아직 이 경로에서 지원하지 않는다. 해당 원고는 추가 주장 근거 계약으로 검토해야 한다.

섹션 생략은 기사 삭제가 아니다. 모든 기존 사건을 유지하며 공개 제외는 별도의 전체 전파·기존 주소 처리 경로를 필요로 한다. 전문용어 설명이나 Signals의 기존 판단도 이 결정만으로 승인되지 않는다.

### 23.5 실제 원문과 집필 입력

이번 대상은 기존 `2026-09-01_0801_Tech_AI_Briefing`의 두 기사다. 현재 권위 원고에서 두 사건 모두 발표일이 없으며 `unreviewed`다.

| 사건                                             | 원문 최초 게시 | 사건 날짜           | 직접 검토 사실                                                                                         |
| ------------------------------------------------ | -------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| TimesFM-3, ID `09a390c59d8969e0`                 | 2026-08-31     | 발표 2026-08-31     | 8개: 다변량 입력, 32단계 패치, 두 어텐션, 미래 마스킹, 9분위수, 회사에 귀속된 비교, 제공/BigQuery 계획 |
| Google 검색 제어·인사이트, ID `89b2997d0ccfa477` | 2026-06-03     | 업데이트 2026-08-31 | 4개: 전 세계 확대 날짜, 검색 제어, opt-out 영향, 페이지/국가/노출 정보                                 |

원문 수집/최종 parse는22절의 v3를 재사용한다. 각각의 사건 claim을 별도 집필 run에 복사하고 원문의 body·parse ID를 바꾸지 않았다. `source-selection.json`이 원래 reviewed claims SHA와 선택한 사건·사실을 연결한다. 원문 annotation은 Codex 직접 검토이며 모델 사실 추출 정확도·독립 사람 gold에 포함하지 않는다.

로컬 Ollama 메타데이터를 이번 실행에서 다시 확인했다. `qwen3.8:27b`, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, 런타임0.34.4, 27.3B/Q4_K_M, 지원 think `false/low/medium/xhigh`다. 한국어 집필은 기존 `writeDraft`의 false·문맥16,384·온도0을 사용한다. 모델 원출력은 최종 승인과 구분하고, 원문에 없는 비교/일반론·날짜 오류가 있으면 정확한 원출력을 보존한 뒤 `correct`로 정정한다.

```bash
npm run research -- draft --run 20260927-timesfm-source-reviewed-editorial-v1 --model qwen3.8:27b
npm run research -- draft --run 20260927-search-update-source-reviewed-editorial-v1 --model qwen3.8:27b
```

같은 run에 `draft`를 다시 실행하면 현재 CLI는 새 모델 출력으로 덮어쓸 수 있다. 비교·다시 작성에는 별도 run을 사용한다. 최종 정정은 기존 history/corrections 저장이 있는 `correct` 명령을 사용한다. 저장된 원출력·요청/응답·실패 기록을 지우지 않는다.

### 23.6 확인된 회귀와 남은 완료 범위

회귀 검사는 발표일/업데이트 구분, 수정 metadata만으로 승인 금지, 적용일/날짜 quote 누락, 사용하지 않은 사실, 불가능한 달력 날짜, 소급 원본 변경, 모든 등장 회차, 비공개 이유/이전 본문 유출을 다룬다. 관련36개 테스트가 통과했다. 초기 새 fixture에서 실제 분야 enum을 잘못 쓴4실패는 fixture의 분야를 기존 `AI`로 바로잡았고 검증기를 변경하지 않았다.

전체 원문·기존 ID/RSS 보존, 실제 작성·정정·승인과 private 사이트 결과는 각각 실행 결과를 기록한다. 기존14개 미검토 사건의 권위 원고 상태는 아직 변하지 않았다. 나머지12사건·구형92회차·전체 용어/관계/Signals/주제, 공개 제외 전파, Drive 저장/재읽기·독립 인증, 실제60개 자료40개발20보류, 서로 다른 신규7회 운영·기존08시 연결·첫 공개 발행은 계속 남아 있다.

### 23.7 실제 작성·정정·승인과 전체 사본 결과

| 실제 run                                              | 모델 원출력·수정                                                                                              | 최종 검토                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `20260927-timesfm-source-reviewed-editorial-v1`       | 136.187초; 분류 주체 검토 문제1개. 비교한 사전학습 모델이라는 조건을 보강하고 리드/설명·기업 태그를 직접 정정 | 8사실 사용, 발표2026-08-31, 기존ID 유지                 |
| `20260927-search-update-source-reviewed-editorial-v1` | 79.675초; 형식 문제0이나 일반 검색 순위 신호의 주체를 `제어`에서 `사이트`로 바꾼 의미 오류 발견·정정          | 4사실 사용, 업데이트2026-08-31/최초 게시2026-06-03 분리 |

두 원고는 전체 원문과 최종 문장을 직접 대조한 Codex 승인이다. 독립 사람 검토·무인 품질 통과로 표시하지 않는다. 이전 raw 모델 초안은 각 `drafts/<original-draft-id>.json`, 정확한 request/response는 `model_artifacts`, 정정 결정은 `corrections/<input-sha>.json`에 보존했다. 형식 문제0인 검색 기사에서 실제 의미 수정이 필요했으므로 JSON 성공을 사실 품질 합격으로 사용하지 않는다. 두 호출의 속도로 일일40기사 처리량을 추정하지 않는다.

최종 전체 사본 run은 `20260927-event-date-private-site-v2`이다. 새 두 기사와 기존 세 심층·승인 네 노트를 함께 생성했다. v1은 회차보다 뒤인 사건일 차단을 추가하기 전의 사본으로 보존했다.

```bash
npm run research -- preview --run 20260927-event-date-private-site-v2 --approved-run 20260927-strategy-grouped-source-reviewed-deep-v2 --approved-run 20260927-venture-grouped-source-reviewed-deep-v2 --approved-run 20260927-paper-grouped-source-reviewed-deep-v2 --approved-run 20260927-timesfm-source-reviewed-editorial-v1 --approved-run 20260927-search-update-source-reviewed-editorial-v1 --knowledge-run 20260927-vla-three-topics-notes-v4
```

결과는4개 과거 회차/4개 노트 투영·277공개 파일·251HTML·249검색·87뉴스·16지도 노드17관계·RSS40이다. 모든 승인 기사 본문/날짜/원문을 뉴스·브리핑·RSS·digest에서 대조했다. 원래40개GUID/pubDate/순서가 같고 새 회차를 만들지 않았다. Google 두 사건에서 과거의 근거 없는 공통 분석·행동 권고·개념 운영 상태 표는 명시 검토 뒤 공개 사본에서 생략했다. 기존 Knowledge 세 경로 배열은 유지한다.

private linkedNews20은 이전21과 다른 개념 연결 집계다. 새 전문용어 승인을 하지 않은 두 기사를 기존 unreviewed 제목/문구의 자동 연결로 다시 배정하지 않았다. 이 변화는 지도 노드/관계의 삭제나 전체 개념 검토 완료를 의미하지 않는다. Time-Series Foundation Models와 AI Content Access의 현재 설명·출처·별칭/관계는 다음 원문 재검토 대상이다.

Chrome에서 실제 desktop 브리핑과390×844 기사/브리핑을 확인했다. 발표/업데이트 표기·설명·원문/기사 링크·빈 분석/안내문/지도 없음·분야탭URL/뒤로 가기·키보드Enter를 확인했다. 두 모바일 화면의 scrollWidth는390이며 가로 넘침이 없었다. 임시 viewport를 reset하고 새 탭·소유 localhost 서버를 종료했다. 실물 모바일 장치 전체 검증으로 확대하지 않는다.

최종 v2는 직접 읽은 v1의 두 HTML 및 `reader.js`/`reader.css` 네 파일과 정확한 바이트가 같다. 브라우저 증거는 이 네 파일에만 연결하며277파일 전체를 직접 조작한 것처럼 표시하지 않는다. 실제 원본 회차의 private 사본을 변경한 시험에서도 이전 승인을 거부했고, 정확한 바이트 복구 뒤 같은 입력을 다시 투영했다. 권위 원고는 이 시험에서 수정하지 않았다.

| 후속 검사                          | 이번 결과                                                  |
| ---------------------------------- | ---------------------------------------------------------- |
| 관련 검사                          | 36통과                                                     |
| 전체JS                             | `npm test`:357 tests/45 suites, 실패·skip0                 |
| gardenJS                           | `npm run test:garden`:194 tests, 실패·skip0                |
| TypeScript                         | `npx tsc --noEmit`:exit0                                   |
| 전체 private 작성/사이트/링크/내용 | preview의 validate/build/verify/consistency 단계exit0      |
| 브라우저                           | 이번 직접 desktop/모바일 viewport·탭/날짜/본문/키보드 확인 |
| 권위 원본·Drive·공개 서비스        | 원본 보존; 이번 승인/배포 미실행                           |

새 브라우저/원본 보존/원출력 해시 증거는 `event-date-integrity-review-20260927-v1.json`, 생성 증거는 해당 run의 `preview/outputs.json`에 연결한다. 생성기 기록의 `browser_verified=false`는 자동 생성만의 판정으로 유지하고 이번 직접 브라우저 receipt와 구분한다. 공개배포·Drive 왕복·독립인증·새7회 운영·60자료 독립평가·전체 소급은 여전히 미완료다.

## 24. 상세 문서의 사용과 현재 상태 재확인

### 24.1 구현자가 읽을 순서

1. [전체 설계의 R01~R18](LOCAL_AI_NEWS_SYSTEM.md#12-반드시-보존할-사용자-요구사항)에서 보존할 서비스 범위를 확인한다.
2. [원문 한 건의 처리 명세](LOCAL_AI_NEWS_SYSTEM.md#14-원문-하나가-기사와-지식이-되는-처리-명세)로 모듈 사이 입력·출력·검토·변경 전파를 확인한다.
3. [출처별 도입 작업 명세](SOURCE_ACQUISITION_SPEC.md#14-출처별-도입-작업-명세)에서 목록/상세/첨부/날짜/회귀 자료를 준비한다.
4. [WBS 진행표](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#현재-진척과-다음-완료-증거)와 [실행 단위](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19-실행-단위와-완료-판정)에서 실제 미완료 작업을 선택한다.
5. 이 실행 가이드의 해당 CLI·검토 schema·실물 실패와 최신 private evidence를 대조한다. 계획에만 있는 필드·설정을 현재 명령에 전달하지 않는다.

현재 전체 목표를 수행하는 단일 `run-daily` 명령은 제공하지 않는다. 단계별 명령을 연결할 실행기·Drive 왕복·08시 전환이 남아 있다. 명령명을 문서에 만들어 놓고 구현된 자동화로 설명하지 않는다.

### 24.2 문서화 시점에 재확인한 모델과 권고

2026-09-27에 현재 `model-info` 명령으로 아래 설치 메타데이터를 다시 읽었다. 다운로드·실제 추론·모델 설정 변경을 수행한 결과가 아니다.

| 역할                  | 확인 모델                       | 확인한 설정                        | 개발 권고와 현재 경계                                           |
| --------------------- | ------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| 기본 운영 후보        | qwen3.8:27b /27.3B/Q4_K_M       | false·low·medium·xhigh, 기본medium | 추출/집필은 false부터 평가; 검색low·근거 비교medium은 후속 비교 |
| 비교·회귀 후보        | qwen3.6:27b /27.8B/Q4_K_M       | false·true, 기본true               | 같은 입력·schema·prompt에서 비교                                |
| 한국어 편집 비교 후보 | gemma4:31b-mlx /31.7B/nvfp4     | false·true, 기본true               | 기존 실제 원출력 오류를 포함해 다시 평가                        |
| 기록 검색 후보        | qwen3-embedding:8b /7.6B/Q4_K_M | embedding capability               | 설치 확인만으로 검색 운영·동일성/관계 판정 완료 아님            |

Ollama runtime은 0.34.4, Qwen3.8 digest는6.1절과 동일하다. 추론 수준의 지원값은 [Ollama Thinking](https://docs.ollama.com/capabilities/thinking)의 `/api/show` 계약과 현재 모델 metadata를 함께 확인한다. JSON Schema 출력은 [구조화 출력](https://docs.ollama.com/capabilities/structured-outputs)의 형식 제약이며 원문 의미의 정확성을 증명하지 않는다.

개발 작업의 시작 권고는 GPT-6 Sol/high, ID·정정 전파·원격 충돌 설계는 GPT-6 Astra/xhigh, 별도 구현 리뷰는 Astra/high다. 실제 사용 가능한 설정과 작업 복잡도에 맞춰 선택하며 모델 추천만으로 별도 작업·에이전트를 생성하지 않는다. 세부 판단은 [구현 계획12](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#12-구현에-사용할-모델과-추론-수준)를 따른다.

### 24.3 실제 명령과 향후 구현의 구별

| 목적        | 현재 실행 가능한 명령                               | 아직 남은 연결                                                   |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| 환경 확인   | `model-info`                                        | 역할별 설정 외부화·서버 로컬 정책·일일 메모리 측정               |
| 발견        | `discover`, `queries`, `localize-queries`, `search` | 목록 페이지 종료·이전 실패/커서 이월·고객/공급사 보강            |
| 원문과 사실 | `collect`, `reparse`, `extract`, `review`           | 복잡한 표/OCR·문서 간 조건·중요 사실 누락 판정                   |
| 원고        | `deep-review`, `draft`, `correct`, `approve`        | 독립 평가·운영 모델 확정·다양한 실제 원고 품질                   |
| 지식/소급   | `knowledge-draft`, `note-review`, `inventory`       | 실제 용어 작성·전체 과거 자료·Knowledge/Signals/주제 판정과 반영 |
| 통합/보관   | `preview`, `archive`, `source-register`             | 새 Drive 업로드/재읽기·충돌/원격 복구·첫 실제 발행               |
| 평가        | `gold-case`                                         | 독립 gold·40개 개발/20개 보류·전체 채점/처리량                   |

실제 옵션·필수 review JSON은 [7절](#7-현재-실행-가능한-cli)과 [후속 실제 계약](#14-현재-작은-계약과-목표-계약의-차이)을 따른다. 예를 들어 현재 `--think`는 extract에서 사용하며 draft 전체의 역할 설정 옵션처럼 안내하지 않는다. `--deep`, `--source-run`, `--approved-run`, `--knowledge-run`, `--vault`도 지원하는 명령 범위가 각각 다르다.

### 24.4 이번 문서 검증의 범위

문서 보강은 기존 네 개발 문서와 README에서 수행했다. 구현 코드·출처 설정·테스트·권위 원본·공개 산출물은 변경하지 않는다. Markdown AST로 내부 경로·제목 fragment·JSON 예시를 읽고 요구사항18개·WBS23개와 원본181 SHA·기존 RSS40의 보존을 검사한다. 새 문서화 전에 복구 사본을 남기고 이전 시험·검증 receipt를 덮어쓰지 않는다.

이 작업의 문서 검증과 이전 구현 시험은 분리한다. 최근 코드 시험 수357/194는 저장된 실제 로그를 재확인한 수치이며 이번 문서 편집에서 새로 코드 시험을 실행한 수치가 아니다. 내부 링크 통과도 Drive 왕복·공개 배포·전체 자료 재검토·60건 독립 평가·새7회 운영의 성공을 의미하지 않는다.

## 25. 로컬 모델의 전문용어 설명 초안 계약

### 25.1 현재 코드·증거·미완료 경계

추가된 모듈은 [knowledge-editor.mjs](../scripts/research/knowledge-editor.mjs), CLI는 [research.mjs](../scripts/research.mjs)의 `knowledge-draft`, 집중 시험은 [research-knowledge-editor.test.mjs](../tests/research-knowledge-editor.test.mjs)다. 기존 기사 집필과 별도로 검증한 배경 사실을 받아 **존재하는 용어의 설명 초안**을 만드는 코드가 있다.

| 항목                                | 확인한 현재 상태                                      |
| ----------------------------------- | ----------------------------------------------------- |
| 입력·구조·체크포인트·변조·원본 보존 | 합성 모델 fixture의 집중6개 시험 통과                 |
| 배경 원문                           | 실제8개 URL의 body·parse 확보,13개 사실 직접 검토     |
| 실제 로컬 용어 작성                 | Qwen 실제3회 완료; 구조 오류0, 의미 오류는 직접 정정  |
| 새 두 용어의 note-review 승인       | 기존 경로/ID를 보존한 비공개 승인v2 완료              |
| 기존 두 기사 concept 배정           | 새 승인v3에서 `timeseries`/`content-access` 명시 배정 |
| 새 두 용어가 들어간 전체 사본       | private v4 생성·검증·채널 대조·지도 직접 연결 확인    |
| Drive 반영·공개 서비스·08시 연결    | 미완료                                                |

현재 코드의 기능 존재, fixture 시험, 실제 원문 확보, 실제 모델 출력, 직접 정정한 원고 승인, 공개 발행을 서로 다른 상태로 보관한다. 실제 실행의 입력·시간·오류·원출력·승인·브라우저 범위는 [26절](#26-두-용어의-실제-작성정정기사지도-연결)에 기록했다. 원 모델 초안을 그대로 승인한 결과는 아니다.

### 25.2 명시 입력의 실제 schema

`knowledge-draft-input/v1`은 아래4개 필드만 받는다. `previous_sha256`은 현재 파일의 **정확한 바이트** SHA-256이며 제목이나 본문만의 hash가 아니다. `evidence`의 source run마다3개 파일을 읽고 실제 source body·parse·사실 검토를 다시 검사한다.

| 필드              | 값·검사                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `schema`          | 정확히 `knowledge-draft-input/v1`                                            |
| `path`            | `Knowledge/` 아래 존재하는 `.md`; 이탈·제어문자·심볼릭 링크 거부             |
| `previous_sha256` | 현재 canonical 파일의 SHA와 일치                                             |
| `evidence`        | 비어 있지 않은 `{run_id, claim_ids}` 배열; run 중복·빈/중복/미등록 사실 거부 |

기존 노트는 `entry_type: concept`, `schema_version: tech-encyclopedia/v2`, 기존 `concept_id`가 있어야 한다. 검토 사실은 같은 run의 `reviewed-claims.json`에 실제로 존재하고 `assertVerifiedClaim`의 원문/검토 해시 검사를 통과해야 한다. 다른 입력 필드를 추가하면 거부한다.

아래는 **입력 형태 예시**다. source run과 claim ID는 확보된 배경 근거를 가리키지만 SHA 자리표시자는 현재 노트의 값으로 교체해야 한다. 사실 하나만 선택한 이 예는 전체 용어를 풍부하게 설명하기 위한 최종 작성 입력이 아니다.

```json
{
  "schema": "knowledge-draft-input/v1",
  "path": "Knowledge/AI Systems/Time-Series Foundation Models.md",
  "previous_sha256": "<현재 기존 노트의 정확한 SHA-256으로 교체>",
  "evidence": [
    {
      "run_id": "20260927-timeseries-access-background-reviewed-v2",
      "claim_ids": ["0449b60a2ee6a3c7955f9a21"]
    }
  ]
}
```

여러 run의 사실을 같은 입력에서 선택할 수 있다. Google 발표 사실과 배경 원문 사실을 각각의 run으로 연결하고 기존 고정 ID를 재사용한다. 단순 URL 목록·검색 snippet·미검토 사실만으로 초안을 만들지 않는다. 선택 사실 전체와 인용의 크기가 문맥 예산을 넘으면 실패하며 자동 잘라내기로 누락을 숨기지 않는다.

### 25.3 모델의8개 작성 영역과 문단 계약

`knowledgeDraftSchema`는8개 영역을 정확한 순서로 요구한다. 영역의 순서·중복은 schema 이후에도 검사한다. 각 문단은 `{text, claim_ids}`이며 알 수 없는 필드는 허용하지 않는다.

| 순서 | `heading`          | 쓰는 내용·기준                                                  |
| ---- | ------------------ | --------------------------------------------------------------- |
| 1    | 한 문장 정의       | 정확히 문단 하나; 기사 날짜와 독립적으로 이해할 개념 정의       |
| 2    | 범위               | 포함하는 기술/활동과 실제 사용 범위                             |
| 3    | 왜 중요한가        | 근거가 확인한 효과·사용 이유만; 전망·일반론으로 채우지 않음     |
| 4    | 핵심 구성 요소     | 해당 구현의 입력·표현·부품/모듈; 일부 사례를 전체로 일반화 금지 |
| 5    | 작동 원리          | 입력→처리→출력과 조건; 원문에 없는 단계 생성 금지               |
| 6    | 실제 예시          | 발표/논문/공식 문서의 사례; 가상 예시와 실제 고객 실적 구분     |
| 7    | 한계와 실패 조건   | 원문이 명시한 기술 조건; 취재·모델·분석 생략의 해명은 제외      |
| 8    | 혼동하기 쉬운 개념 | 원문으로 확인한 범위/방식 차이만 설명                           |

정의 이외는 영역마다 최대3문단이며 빈 배열도 허용한다. 지원 근거가 없으면 `paragraphs: []`로 반환한다. 문단 `text`는1자 이상1,200자 이하, `claim_ids`는 비어 있지 않은 배열이다. 프로그램은 문단에 한국어가 있는지, HTML/개행/URL/Obsidian 링크·알려진 내부 ID·운영 안내가 유입됐는지, ID가 선택된 verified 사실인지 검사한다. 어휘가 자연스러운지, 정의가 실제로 한 문장인지, 인용이 모든 의미를 지지하는지는 직접 검토해야 한다.

모델 지침은 링크·HTML·Markdown을 쓰지 않도록 요청한다. 현재 검사기의 문자열 금지 범위를 모든 Markdown 문법을 완전히 차단하는 구현이라고 확대하지 않는다. `knowledgeDraftProblems`의 검사는 문장 의미를 자동 평가하는 분류기가 아니다.

날짜 이력·용어 카드·별칭·관계·지도 판정·새 파일 경로는 모델의 출력 대상이 아니다. 최종 canonical 노트는 기존12개 섹션과 frontmatter를 유지한다. 이8개 초안 영역만 복사해 원본을 덮어쓰지 않는다.

### 25.4 현재 모델 호출 설정과 변경 검출

현재 기본 모델은 `qwen3.8:27b`, 코드에서 `think: false`, `num_ctx: 16384`를 지정한다. `Ollama.structured` 기본값을 통해 `num_predict: 4096`, `temperature: 0`, `stream: false`, `keep_alive: 5m`, 호출 예산300,000ms를 사용한다. 이 값은 현재 구현의 설정이며 용어 품질이나 일일 처리량을 검증한 권고값이 아니다.

`--model`은 설치된 다른 completion 모델을 명시할 때 사용할 수 있다. `--think`와6개 추출 예산 옵션을 용어 집필 설정으로 안내하지 않는다. 특히 추출 예산 옵션은 `extract` 이외 명령에서 거부된다. 이 명령의 추론·문맥은 현재 코드 설정을 따르며 역할별 설정 외부화·추론 비교는 P3-04의 후속 작업이다.

1. 모델 호출 전에 설치 metadata를 읽고 digest·runtime을 체크포인트 입력에 결합한다.
2. 실제 structured 호출의 provenance가 최초 digest/runtime과 같은지 검사한다.
3. 원본 노트 SHA, 선택 근거3개 파일의 SHA, vault 절대경로, 모델/digest/runtime, 해당 모듈 구현 SHA를 `RunState`에 결합한다.
4. 재개하더라도 현재 source body·parse·사실 검토를 다시 읽는다. 검토 사유 같은 입력 파일의 변경도 이전 완료 초안을 재사용하지 못하게 한다.
5. 저장된 원 모델 JSON과 stage 기록이 달라지면 거부한다. 원출력을 편집해 같은 run을 승인본처럼 재사용하지 않는다.

구조화 출력의 API 형식은 [Ollama 공식 문서](https://docs.ollama.com/capabilities/structured-outputs), 지원 추론 값 발견은 [Thinking 문서](https://docs.ollama.com/capabilities/thinking)를 대조했다. 설치별 실제 지원값은24.2절과 `model-info`에서 확인한다. 모델명만 같고 digest가 달라지면 기존 성능 판정을 재사용하지 않는다.

### 25.5 명령·저장 파일·재개의 실제 경계

아래는 원문 제목·URL을 함께 제공하는 지침 수정 후 **실제로 실행한 명령 기록**이다. 최초 시계열·콘텐츠 접근 run과 새 시계열 run의 입력/출력은26절을 따른다. 다시 실행할 때는 현재 원본·근거·모델·runtime·모듈 SHA가 기록과 같은지 먼저 확인한다. 입력이 바뀌면 새 run을 사용한다.

```sh
node scripts/research.mjs knowledge-draft \
  --run 20260927-timeseries-source-scoped-draft-v2 \
  --review .local/research/local-ai/timeseries-knowledge-draft-input-20260927-v1.json
```

기본 원본은 `vault`다. 사본을 사용할 때만 `--vault`를 명시하며 기존 파일의 정확한 SHA와 개념을 다시 확인한다. `--source-run`을 받는 명령이 아니므로 근거 선택은 input JSON의 `evidence`로 전달한다. 같은 run의 잠금은 기존 `withLock`을 재사용한다.

| 파일/기록                         | 보관 내용                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `runs/<run>/knowledge-draft.json` | `knowledge-draft/v1`, 원 노트 경로/SHA/개념 ID,8개 영역, source 파일 hash, 모델 provenance/실제 요청·응답 artifacts, problems |
| `runs/<run>/knowledge-preview.md` | 원 모델 문단에 선택 사실의 원 URL을 프로그램으로 붙인 비공개 읽기 사본                                                        |
| 해당 run의 RunState journal/stage | 입력 fingerprint와 완료 초안, 동일 입력 재개 여부                                                                             |

초안 status는 항상 `editorial_review`다. `candidate_published: false`, `drive_verified: false`를 반환하며 비공개 쓰기만 수행한다. problems가 존재해도 초안을 검토용으로 보존할 수 있으며 자동 승인하지 않는다. 비공개 Markdown의 빈 영역 표시는 작성 보조용이고 독자 화면에 그대로 보내지 않는다.

같은 입력·원본·근거·모델·runtime·구현으로 재개하면 완료 checkpoint를 재사용한다. 입력이나 설치 모델이 달라지면 새 run으로 진행한다. 모델 원초안을 직접 고치기보다 별도 편집·검토 기록과 전체 replacement를 만든다. 입력과 저장 bytes가 바뀌었는데 성공 stage만 남기는 방식으로 재개하지 않는다.

### 25.6 집중 시험의 실제 증거

초기 저장 로그는 `.local/research/local-ai/knowledge-editor-focused-tests-20260927-v1.log`이며6pass/0fail/0skip이다. 원문 제목/URL 입력과 지침 보강 뒤에도 같은6개 집중 시험을 실행해 `knowledge-editor-focused-tests-20260927-v3.log`에 보관했다. 아래 시험은 fixture 모델을 사용하는 코드 회귀다. 실제 Qwen의 정확성·속도·한국어 품질 시험으로 계산하지 않는다.

| 시험           | 재현한 조건·확인 결과                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| 정상 입력/재개 | verified 사실, 링크 생성, 지도 제외 원본 보존, 동일 초안에서 두 번째 추론 없음         |
| 잘못된 입력    | 경로 이탈·중복 run/사실·미등록 사실·낡은 원본 SHA·손상 source body를 모델 호출 전 거부 |
| 문단 구조/본문 | 정의 누락·영역 순서·선택하지 않은 사실·ID 누출·운영 문구·HTML/미검토 사실 표시         |
| 모델/저장 변조 | digest 변경과 saved raw JSON 불일치 거부; 정확히 복구한 뒤 동일 입력 재개              |
| 사실 검토 변경 | 사실 검토 파일이 바뀌면 이전 완료 stage를 새 근거의 초안으로 재사용하지 않음           |
| CLI 누락       | 명시 input JSON 없이는 임의 지식 초안을 생성하지 않음                                  |

전체357개/45suite와 garden194개는 이 모듈 추가 **이전** 결과다. 이후 실제 노트·기사·지도 연결과 세 검증 결함을 수정한 최종 실행은 npm test366개/45suite·garden203개·집중35개가 모두 통과했다. 이전 수에 새 시험 개수를 더해 실행 결과를 만들지 않는다. 명령과 로그·실제 사본 검증은26.5절을 따른다.

### 25.7 다음 실제 실행과 완료 판단

원문 묶음은 [수집 명세12.4절](SOURCE_ACQUISITION_SPEC.md#124-시계열-모델콘텐츠-접근의-추가-배경-원문), 노트/기사/전체 사본의7단계는 [구현 계획19.5절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#195-두-용어와-기존-기사-연결을-완료하는-실행-명세)에 있다. 입력 고정·원문/주체 정정 → 실제 두 첫 초안과 시계열 재작성 → 문장 대조 → note-review → 기사 concept 배정 → fresh 전체 사본 검증을 비공개 경로에서 수행했다. 권위 원본·Drive·공개 발행의 완료와 구분한다.

Time-Series는 `timeseries`와 기존 정확한 이름·확인한 관계를 유지한다. AI Content Access는 `content-access`의 기존 설명 페이지를 사용할 수 있지만 넓은 활동 범위라는 현재 지도 제외를 유지한다. 기사 연결과 지도 노드 선정은 별도 판단이다. 회사/제품 태그를 전문용어로 자동 승격하지 않는다.

기존 node registry의 검토 함수 존재를 기사 승인 경로 전체의 의미 검토 완료로 표시하지 않는다. concept 배정은 해당 사건이 그 개념을 실제로 설명하는지 직접 확인해야 한다. 이 두 묶음 이후에도 전체 과거 자료/Knowledge/Signals/TrendTopics, 독립 평가60건, Drive 왕복·충돌, 단일08시 연결·서로 다른 새7회·첫 실제 발행의 완료 조건은 그대로 남는다.

## 26. 두 용어의 실제 작성·정정·기사·지도 연결

### 26.1 대상·입력·원본 보존

대상은 기존 `Knowledge/AI Systems/Time-Series Foundation Models.md`의 `timeseries`, `Knowledge/AI Systems/AI Content Access.md`의 `content-access`다. 기존 경로·ID·정확한 별칭을 유지한다. 모델은 새로운 회사/제품 노드나 광범위한 별칭을 만들지 않는다.

실제 입력은 `.local/research/local-ai/timeseries-knowledge-draft-input-20260927-v1.json`과 `content-access-knowledge-draft-input-20260927-v1.json`이다. 각 파일은 수정 전 노트의 전체 SHA와 선택한 검증 사실을 고정한다. 배경 원문8개/검토 사실13개는 `20260927-timeseries-access-background-reviewed-v2`, Google 두 사건 근거는 기존 source-reviewed run을 사용한다. 원문 몸체·parse·관측일을 새 조사일로 바꾸지 않았다.

Prometheus·vLLM 두 사실의 주체 표기를 고쳐 이전 claim ID와 연결했다. `knowledge-inputs-source-revision-20260927-v1.mjs`와 새 `direct-source-review.json`은 비공개다. 최초 배경 run과 최초 검토 기록은 남아 있다. Chronos 수식 변수 누락은 파서의 남은 작업이며 이번 설명은 확인한 문장 근거만 사용한다.

### 26.2 실제 로컬 출력과 문장 판정

모든 호출은 설치 태그 `qwen3.8:27b`, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, Ollama `0.34.4`였다. 실제 설정은 `think:false`, `num_ctx:16384`, `num_predict:4096`, `temperature:0`, 호출 예산300초다. 이 이름은 설치 모델 식별자이며 공식 모델 계보나 다른 기기의 동일 성능을 모델명만으로 확정하지 않는다.

| 실제 run                                     | wall time | 입력/출력 토큰 | 직접 검토한 오류·관측                                                                                                  |
| -------------------------------------------- | --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `20260927-timeseries-knowledge-draft-v1`     | 270.296초 | 3,517 / 1,696  | TimesFM의 입력·어텐션을 모든 모델로 일반화; Chronos 역양자화와 TimesFM 패치 처리를 혼합; 비교 결과·정밀도 조건 일반화  |
| `20260927-content-access-knowledge-draft-v1` | 244.602초 | 2,181 / 1,852  | 상업 가치/저작권 효과 추가; 제공자의 선택을 크롤러에 귀속; MCP/RAG 원리를 혼합; 발표 당시 제공 상태를 현재 상태로 표현 |
| `20260927-timeseries-source-scoped-draft-v2` | 246.140초 | 4,353 / 1,538  | 구현별 이름과 원리 분리가 관측됨; 정의의 전체 모델 일반화·미귀속 효과·양자화 성능 추론·실행 비용의 허용 판단은 남음    |

3개 모두 구조 검사 `problems:[]`였지만 원문 의미 대조가 필요했다. 마지막 호출에는 원문 제목·URL과 구현별 문단 지침을 더했다. 입력이 달라진 한 사례의 관측이므로 프롬프트 개선 효과나 모델 우위를 통제된 비교로 확정하지 않는다. 높은 추론 수준의 작성은 이번3회에 사용하지 않았다.

각 run의 `knowledge-draft.json`, 모델 요청/응답 artifacts, `knowledge-preview.md`, 체크포인트는 원출력 그대로 보존한다. 판정 파일은 `knowledge-model-prose-review-20260927-v2.json`; 첫 판정 파일과 지침 수정 전 모듈 사본도 보존했다. 이 결과는 Codex의 원문 직접 검토이며 독립 사람 gold·60건 평가·무인 발행 품질 합격이 아니다.

### 26.3 최종 노트와 두 기사 연결

최종 원고는 모델 초안의 덮어쓰기가 아니라 기존12개 섹션/frontmatter를 갖춘 별도 전체 교체본이다. `canonical-manuscripts-20260927-v1/`에 원고·대조·markup 정정을 보관했다.

| 노트             | 최종 설명·이력                                                                                                                                                 | 지도 판단                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `timeseries`     | 일반 정의와 Chronos/TimesFM 구현을 구분;32시점 패치·9분위수·미래 변수·학습/실행 비용을 실제 모델에 귀속;8월31일 TimesFM 사건/원문 연결                         | 기존 include 유지; 기존 관계·별칭 보존                     |
| `content-access` | 크롤러 정책·Google 생성형 검색 사용·MCP 권한/격리·RAG를 구분;2025년 Pay per crawl 원 발표 시점을 유지;근거 없는 기존7월 이력 제거;8월31일 Google 업데이트 연결 | 넓은 활동 범위이므로 exclude 유지; 읽기 페이지/이력은 제공 |

내용이 없는 `왜 중요한가`는 콘텐츠 접근의 독자 화면에서 숨긴다. 연구 예시를 실제 고객 도입·수익 성과로 쓰지 않고, 베타 발표를 현재 제공 상태로 바꾸지 않는다. 확인된 해석 관계는 기존 `inference` 구분과 정확한 근거를 보존한다.

노트 승인은 `20260927-timeseries-content-access-notes-v2`다. `approved-notes.json`에 원본 SHA·정확한 교체 bytes·근거·검토 기록을 저장했다. v1도 보존했다. 승인 작업은 권위 vault에 쓰지 않는다.

기사 연결은 새 private 승인 `20260927-timesfm-concept-linked-editorial-v3`와 `20260927-search-concept-linked-editorial-v3`에 각각 `concept_ids:["timeseries"]`, `["content-access"]`로 넣었다. 고정 사건은 `09a390c59d8969e0`/`89b2997d0ccfa477`이며 이전 기사 승인·원 모델 출력·날짜 정정·원본 이력은 보존했다. Search의 최초 게시6월3일과 업데이트8월31일은 별도로 남고9월1일 과거 회차를 오늘 뉴스로 재발행하지 않는다.

`concept_assignment_review`는 note approval과 사용한 verified fact를 수동 검토로 연결한 비공개 기록이다. 이 helper의 실제 적용을 모든 미래 기사의 의미 배정 자동화가 구현된 것으로 확대하지 않는다. 공개 투영에는 운영 사유·원초안·claim/parse ID를 넣지 않는다.

### 26.4 실제 생성 중 발견한 결함과 회귀

| 결함                                       | 실제 재현·수정                                                                                                      | 유지한 검증                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 용어 이력의 고정 뉴스 주소를 미해결로 판단 | `validate_encyclopedia.py`가 `News/<16자리 고정ID>`를 검증 완료 뉴스 catalog로 해석하도록 수정                      | type/schema/status/event ID/파일명 일치;미검토·제외·잘못된 경로·bare ID 거부;concept alias 충돌 방지 |
| 강조 뒤 한국어 조사를 본문 차이로 판단     | `<strong>Chronos</strong>는`에 공백을 추가하던 preview text 추출 수정;inline은 이어 붙이고 block/줄바꿈은 경계 유지 | 승인 본문과 정확히 비교;수치 변경·원문 링크 변경·빈 섹션 누출 거부                                   |
| 기사 명시 concept ID가 지도에서 누락       | `buildGraph`가 verified `concept_ids`와 기존 경로형 `concepts`를 중복 없이 합치도록 수정                            | unknown ID 거부;미검토 새 배정 미사용;excluded 기사 제외;map 제외 용어를 노드로 승격하지 않음        |

각 결함은 실패 기록과 회귀 시험을 보존했다. [고정 뉴스 링크 시험](../tests/knowledge-news-links.test.mjs), [본문 대조 시험](../tests/research-projection.test.mjs), [지도 연결 시험](../tests/connections.test.mjs)을 따른다. 전체 preview consistency는 승인된 map 용어의 기사 ID와 `matches.basis:editorial`을 재검사하며 누락 시 실패한다.

v1 preview의8개 노트 형식/링크 오류, v2의 강조 문장 비교 오류, v3 브라우저의 지도 누락 관측은 유지했다. 마지막 v4로 입력을 새로 고정했으며 코드가 달라진 이전 완료 stage를 그대로 재사용하지 않았다. 검증 기준을 낮추거나 실패 파일을 지우지 않았다.

### 26.5 최종 전체 사본·채널·브라우저 검증

실제로 실행한 최종 명령은 다음과 같다.

```sh
node scripts/research.mjs preview \
  --run 20260927-knowledge-linked-private-site-v4 \
  --approved-run 20260927-strategy-grouped-source-reviewed-deep-v2 \
  --approved-run 20260927-venture-grouped-source-reviewed-deep-v2 \
  --approved-run 20260927-paper-grouped-source-reviewed-deep-v2 \
  --approved-run 20260927-timesfm-concept-linked-editorial-v3 \
  --approved-run 20260927-search-concept-linked-editorial-v3 \
  --knowledge-run 20260927-vla-three-topics-notes-v4 \
  --knowledge-run 20260927-timeseries-content-access-notes-v2
```

격리 workspace에는 다섯 승인 기사/과거4회차, 승인 노트6개(VLA·두 추가 용어·주제3개)가 들어갔다. `workspace → refresh → knowledge-sync → knowledge-check → validate → build → verify → consistency → outputs`가 완료됐다. public277파일, 뉴스87개, 지도16노드/17관계, 기존 RSS40 GUID·pubDate·순서를 유지했다. 웹·RSS·digest의5기사 제목/본문/날짜/원문과6노트의 설명/출처/실제 이력을 대조했다.

지도에 연결된 기사는26개다. v3의20개에서 늘어난 것은 기존 verified concept ID도 실제 지도에 전달되도록 고친 결과다. 새 사건6건, 새로운 전문용어6개, 전체 관계 검토 완료로 계산하지 않는다. `content-access` 기사 연결은 읽기 페이지에서 제공하면서 지도 노드는 만들지 않는다.

Chrome의 격리 탭에서 두 용어·두 뉴스·9월1일 브리핑을 읽었다. 정의→사건 이력→고정 뉴스→용어 #태그, AI 분야 탭 URL/뒤로 가기, 키보드 Enter, 빈 중요성 섹션/분석 탭 생략, 뉴스·브리핑의 지도 제외를 확인했다.390×844 CSS viewport에서 확인한 페이지의 `scrollWidth`는390이었다. 최종v4 지도는 desktop1200px와 mobile390px에서 렌더링되고 `?focus=timeseries`의 관련 뉴스 맨 앞에 TimesFM 기사가 표시됐다. 기사 Enter/뒤로 가기로 focus 주소가 복원됐다. 물리 스마트폰·전체 페이지의 브라우저 검증은 아니다.

v3에서 읽은 정적 HTML·reader JS/CSS는 최종v4와 바이트를 대조한다. 지도 JSON은 수정됐으므로 v4를 새로 열어 검증했다. 생성기가 반환하는 `browser_verified:false`를 임의로 true로 덮어쓰지 않으며 직접 브라우저 관측은 별도 비공개 receipt에 기록한다. 검증 viewport를 reset하고 생성한 탭과 owned preview 서버를 종료했다.

| 실제 명령             | 최종 결과·저장 로그                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `npm test`            | 366pass/45suite/fail0/skip0; `knowledge-map-all-tests-20260927-v4.log`                   |
| `npm run test:garden` | 203pass/fail0/skip0; `knowledge-map-garden-tests-20260927-v3.log`                        |
| 집중 Node 시험4파일   | 35pass/fail0/skip0; `knowledge-map-focused-20260927-v1.log`                              |
| `tsc --noEmit`        | exit0; `knowledge-map-types-20260927-v4.log`                                             |
| 전체 private preview  | exit0; `knowledge-linked-private-site-20260927-v4.log`와 run의 stage/consistency/outputs |

### 26.6 다음 구현과 공개 전환의 경계

두 기존 용어의 비공개 정정·관련 기사·이력·지도 연결과 전체 사본 검증을 완료했다. 권위 작성 원본181개, Drive 원본, 공개 배포 결과와 예약을 이번 승인본으로 바꾸지 않았다. 새 회차의 모델 품질 합격이나 실제7회 운영을 완료한 상태는 아니다.

다음 묶음은 남은12개 v2 사건의 원문 판정 → 의존 용어/주제/Signals의 교체 검토 → small fresh preview다. 구형92회차/801검토구간은 별도 분모를 유지한다. 이어 중요 근거·묶음간 조건 추출, 제조사 목록의 상세/첨부/페이지 종료·실패 이월, MathML/표/OCR, 전체60실제자료의40개발/20보류·독립 평가, 새 archive/Drive 인증·왕복·충돌, 기존08시 단일 연결과 서로 다른 실제7회 비교·첫 발행을 수행해야 한다.

모델 선택은 실제 품질·누락·원문 귀속·처리 시간을 함께 비교한다. 이번 설정은 검토 보조 작성 후보로 유지하며, 추론을 높이면 오류가 사라진다고 가정하지 않는다. 역할별 후보/추론 설정·구현용 Codex 권고는6절과 [구현 계획12절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#12-구현에-사용할-모델과-추론-수준)을 따른다. 추가 유료 API·별도 예약을 도입하지 않는다.

## 27. Markdown과 혼합 실패 원문 재파싱·추가 소급 검토

### 27.1 현재 구현과 실제 원문 범위

이 절은 2026-09-27 추가 구현·시험 기록이다. [수집 명세15절](SOURCE_ACQUISITION_SPEC.md#15-markdown논문-버전혼합-실패-원문의-실제-처리)에 MIME·줄 근거·날짜·실패 보존의 계약을 기록했다. 기존 시험을 이번 성공 건수로 다시 합산하지 않는다.

| 입력 run                                               | 실제 시도·확보                                      | 파싱·검토 상태                                                       |
| ------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------- |
| `20260927-retrospective-aug30-aug29-primary-v1`        | Microsoft·Model Connect·NemoClaw 3URL 모두 captured | HTML54/27구간; Markdown 최초 unsupported/0구간                       |
| `20260927-retrospective-aug30-aug29-markdown-final-v3` | 위 저장 바이트 재사용; 새 수집 아님                 | 동일 HTML54/27구간·Markdown20구간 partial, 제목/날짜 null            |
| `20260927-retrospective-aug28-aug25-primary-v1`        | 11URL, captured8·blocked3                           | 논문/PDF/공식 발표8parse, 실패 자료3개 보존                          |
| `20260927-retrospective-aug28-aug25-profiled-v3`       | 위11개 메타데이터 보존·성공8개만 재파싱             | arXiv v1 발표8/26·Nature 제목/기사 영역/발표8/26; 원 SHA/관측일 보존 |
| `20260927-double-blind-novices-announcements-v1`       | DeepMind·OpenAI 2URL, captured1·blocked1            | DeepMind7구간/발표8/27, OpenAI 접근 실패                             |
| `20260927-nemoclaw-tag-115-primary-v1`                 | 공식 GitHub 고정 릴리스1URL captured                | 본문1구간·제목 확보, 날짜 parse null; 기사 승인 전                   |

서로 다른 URL 시도는17개, captured13·blocked4다. 두 PDF는 8페이지/100구간과49페이지/540구간을 읽을 수 있게 확보했으나 제목·발표일이 없어 partial이다. 누락 페이지0이나 많은 구간은 전문의 의미 검토 완료가 아니다. 현재11사례/71사실의 고정 평가 세트와 별도 취재 묶음이며 신규 독립 gold를 만들지 않았다.

재현할 오프라인 재파싱 명령은 다음과 같다. 기존 run과 같은 입력이면 완료 checkpoint를 검사해 재사용하며, worker/profile/원문을 바꾸었다면 **다른 run ID**를 사용한다. 초기 실패 run v2를 성공 로그로 덮어쓰지 않는다.

```bash
npm run research -- reparse --run 20260927-retrospective-aug30-aug29-markdown-final-v3 --source-run 20260927-retrospective-aug30-aug29-primary-v1
npm run research -- reparse --run 20260927-retrospective-aug28-aug25-profiled-v3 --source-run 20260927-retrospective-aug28-aug25-primary-v1
```

### 27.2 실제 한국어 작성·정정·승인

Microsoft와 Model Connect 원문을 각각 처음부터 읽고 직접 검토한8사실씩을 별도 run에 고정했다. 이16사실은 Codex의 직접 주석이며 자동 사실 추출·독립 사람 평가가 아니다. 이 검토 사실을 입력해 실제 `draft`를 한 번씩 실행했다.

공통 모델은 `qwen3.8:27b`, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, Ollama0.34.4, 27.3B/Q4_K_M, `think: false`, `num_ctx: 16384`, `num_predict: 4096`, `temperature: 0`, 호출 제한300초다. 지침·schema·원 요청/응답·원초안·정정 이력을 보존했다.

| 기존 사건          | 실제 작성 run·시간                                                                            | 원출력에서 고친 내용                                                                     | 최종 private 결과                                                 |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `fd584d5c829c999d` | `20260927-microsoft-validation-source-reviewed-editorial-v1`, 118.601초; 입력1582/출력899토큰 | 개인 블로그 작성자의 제안을 회사의 공식 도입·표준처럼 귀속하는 제목 수정                 | 블로그 맥락·검증 단계/사례를 설명; 발표2026-08-29, 검토9/27; 승인 |
| `a0eed0f62d0dd240` | `20260927-model-connect-source-reviewed-editorial-v1`, 104.403초; 입력1583/출력841토큰        | 블로그 소개를 최초 출시로 확대하지 않음; Python 준비와 C++ 실행 분리; 구체적 설명 소제목 | 발표2026-08-28·기존 ID 유지; 다음 v2에서 분류까지 정정·승인       |

형식 검사 문제0이어도 원문 귀속·날짜 의미·조건 오류가 남았다. title/리드/설명/태그까지 직접 읽어야 한다. `correct` 이후에는 새 로컬 추론을 실행하지 않았으며 직접 편집본을 모델 원출력으로 평가하지 않는다.

Model Connect의 첫 승인본에 남은 `성능 개선` 태그도 근거를 다시 대조했다. 수치 성능 개선을 쓰지 않는 원고에 그 태그를 유지하지 않고 새 run `20260927-model-connect-classified-editorial-v2`에서 주 테마 `표준·생태계`, 태그 `호환성`으로 고쳤다. 이전 승인은 `prior-approval.json`에 보존했고 제목·본문·원문·날짜는 유지했다. 현재 사용해야 할 것은 이 v2 승인본이다.

두 기사에 `concept_ids: []`를 명시했다. 회사·제품 이름을 지도 노드로 자동 추가하지 않았다. 소급 검토 기록에는 원래 제목/발표일 null·회차 bytes/SHA·모든 등장 경로를 보존하고 `흐름 읽기`, `오늘의 적용`, `개념 색인`을 읽은 뒤 사본에서 생략한 판단을 남겼다. 의존 Knowledge·Signals·TrendTopics의 전체 재검토는 `dependency-review-pending-v1.json`에서 false로 유지한다. 기사 승인만으로 그 노트의 과거 판단을 승인하지 않는다.

### 27.3 회차 단위 전환과 전체 사본

Microsoft와 Model Connect를 함께 넣은 `20260927-aug30-aug29-reviewed-private-site-v1` 시도는 `Retrospective requires an existing six-w article with classification`에서 멈췄다. Model Connect의 8월29일 회차에는 아직 검토하지 않은 구형 NemoClaw 기사도 있다. 원문 확인 없이 나머지 기사를 새 형식으로 채우거나 회차의 기사 수를 줄이지 않았다. 같은 회차 전체가 정확한 기존/승인 기사 투영을 제공할 때 전환하는 계약을 유지한다.

Microsoft만 추가한 최종 사본은 `20260927-aug30-reviewed-private-site-v2`다. 기존 세 심층·Google 두 기사·Microsoft를 합한 **승인 기사6개·과거 회차5개·승인 노트6개**를 전체 기존 자료 사본에 적용했다.

```bash
npm run research -- preview --run 20260927-aug30-reviewed-private-site-v2 --approved-run 20260927-strategy-grouped-source-reviewed-deep-v2 --approved-run 20260927-venture-grouped-source-reviewed-deep-v2 --approved-run 20260927-paper-grouped-source-reviewed-deep-v2 --approved-run 20260927-timesfm-concept-linked-editorial-v3 --approved-run 20260927-search-concept-linked-editorial-v3 --approved-run 20260927-microsoft-validation-source-reviewed-editorial-v1 --knowledge-run 20260927-vla-three-topics-notes-v4 --knowledge-run 20260927-timeseries-content-access-notes-v2
```

9단계 `workspace → refresh → knowledge-sync → knowledge-check → validate → build → verify → consistency → outputs`가 완료됐다. `preview-manifest.json`은 source files437·public files277·digest files132를 기록한다. `preview/consistency.json`에서6기사의 웹·RSS·GitHub Markdown 제목/본문/원문/날짜와 기존40개 RSS GUID·pubDate 보존을 확인했다. Model Connect는 이 사본에 포함되지 않는다.

`candidate_published`, `drive_verified`, `browser_verified`는 모두 false다. 이번 사본의 Microsoft 페이지를 브라우저에서 새로 확인했다고 주장하지 않는다. 앞선26절의 다른 페이지·지도 브라우저 관측도 이번 새 페이지 검증으로 확대하지 않는다. 공개 원본181개와 Google Drive를 이 승인본으로 수정하지 않았다.

### 27.4 실제 공간 부족과 재개

첫 전체 사본 생성은5개 stage를 마친 뒤 build 상태의 임시 파일 쓰기에서 `ENOSPC`로 실패했다. 실패 로그는 `aug30-private-site-20260927-v2.log`에 보존했다. 이후 `df`로 사용 가능973MiB를 확인하고 기존 완료 사본의 크기와 남은 단계의 예상 쓰기량을 대조한 뒤 같은 입력으로 재개했다. `aug30-private-site-resume-20260927-v2.log`에서 build·verify·consistency·outputs 성공을 확인했다.

이 과정에서 원문·모델·승인·복구 파일을 삭제하거나 디스크를 정리하지 않았다. 재개 성공을 용량 문제 해결이나 장기 운영 여유 확보로 기록하지 않는다. 이후 확인한 공간도 약970MiB로 적다. 다음 대형 모델·전체 사본 실행 전에 실제 공간을 확인하고, 저장 공간 확보가 필요하면 범위를 정한 보관/정리 작업으로 진행한다. 사용자의 다른 작업이나 증거를 임의 삭제하지 않는다.

공간 부족이나 강제 종료가 발생하면 완료 checkpoint와 정확한 입력을 보존하고, 성공 stage의 결과 해시를 확인한 다음 실패 stage부터 재개한다. 실패 로그만 보고 완료를 추정하거나 새로운 임의 run으로 이미 끝난 대형 단계를 반복하지 않는다. 전체 일일 자원 예산·OS 메모리 감시는 아직 별도 개발 항목이다.

### 27.5 회귀·현재 상태·정확한 다음 작업

| 검증                      | 실제 결과·보존 로그                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| worker 최초 Markdown 재현 | unsupported 오류·행 근거 부재를 재현; `markdown-worker-tests-before-20260927-v1.log`                                     |
| Markdown 내부 HTML 예시   | HTML로 잘못 판별하는 실패 재현 후 수정; `markdown-worker-tests-html-sniff-before-20260927-v1.log`                        |
| 최종 worker/profile 시험  | 22pass; `markdown-source-profiles-worker-tests-20260927-v3.log`                                                          |
| 혼합 실패 run 회귀        | 기본 취득 거부 유지·명시적 재파싱·실패 identity·parse/body 변조 거부; `mixed-source-reparse-tests-after-20260927-v1.log` |
| 전체 Node 시험            | 367pass/45suites/fail0/skip0; `markdown-reparse-all-tests-20260927-v1.log`                                               |
| 기존 garden 회귀          | 204pass/fail0/skip0; `markdown-reparse-garden-tests-20260927-v1.log`                                                     |
| 권위 작성 원본 validate   | exit0·436notes/26v2회차; `markdown-reparse-authority-validate-20260927-v1.log`; 승인본을 적용한 검증이 아님              |
| TypeScript                | `tsc --noEmit` exit0; `markdown-reparse-types-20260927-v1.log`                                                           |
| 전체 비공개 생성          | 위 최종 run의9stage·consistency·outputs 완료; 실제 배포 아님                                                             |

원문부터 추가 판정한 두 사건을 더하면 초기 미검토14개 중 private 추가 판정4개·잔여10개다. 권위 원본은 여전히87사건 중73verified/14unreviewed다. 구형92회차/801구간과 전체 용어·관계·Signals·주제 판정도 남아 있다. 검토 사실16개·새 모델2호출·과거5회차 사본을 실제 평가60건이나 서로 다른 새7회 운영으로 세지 않는다.

이 묶음 당시 다음 작업이었던 **NemoClaw 고정 릴리스·발표일 → 직접 사실/원고 검토 → 같은8월29일 두 기사 전환 → 새 사본·브라우저 대조**는 아래28절에서 수행했다. 원 실패와 당시 다음 작업은 [구현 계획19.6절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#196-markdown-후속-사건-검토와-회차-전환의-실행-명세)에 보존하고, 현재 재개 위치는 [19.7절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#197-두-기사용어-통합-이후의-구체적인-재개-계약)을 따른다. 전체60건 독립 평가·Drive 왕복/인증/충돌·기존08시 단일 실행·실제 새7회 비교·공개 첫 발행의 완료 범위는 유지한다.

## 28. 고정 릴리스·분류·용어·기사의 실제 통합

### 28.1 입력·수정 파일·원본 보존

고정 `NVIDIA/NemoClaw v0.0.115` HTML을 오프라인 재파싱하고, 기존 사건 `bab0e1718e7e0799`의 발표일을8월28일로 확인했다.18번째 profile은 공개 헤더와 서명 팝업 시각을 구분한다. NIST 배경 원문의 분 단위 ISO 시각도 검토 도중 거부되어 실제 오류를 재현한 뒤 지원했다. 원문 bytes·documents·관측일·기존 기사/회차/coverage·RSS 식별자를 바꾸지 않는다.

| 실제 파일                                                                                  | 책임과 검증                                                                                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `data/research-acquisition.json`                                                           | 정확한 v0.0.115에만 공개 헤더 날짜 선택; worker 정상/누락/중복/서명/잘못된 달력 회귀                             |
| `scripts/research/dates.mjs`                                                               | 분/초 단위 ISO와 명시적 offset의 실제 시각 비교; 달력/시간대·미래·검토 전후 검사 유지                            |
| `scripts/research/editor.mjs`                                                              | 사건의 실제 행동에 따른 테마·성능 조건·기업/기관 역할의 일반 프롬프트; 구조 검사만으로 의미 검토를 대신하지 않음 |
| `quartz.config.yaml`                                                                       | SmartyPants 비활성화로 `--check`·따옴표·숫자 문장부호의 원 표기 유지; GFM 표 유지                                |
| `web/reader.css`                                                                           | `main`의 HTTP(S) 원문 링크를 긴 URL 중간에서도 줄바꿈해 모바일 넘침 방지                                         |
| `tests/test_research_worker.py`, `tests/research-review.test.mjs`, `tests/reader.test.mjs` | 실제 날짜 실패와 명령 문자 변경의 red→green 회귀                                                                 |

원 source run은 `20260927-nemoclaw-tag-115-primary-v1`, 새 parse는 `20260927-nemoclaw-tag-115-profiled-v2`다. 발표일은 day 정밀도이며 원 `2026-08-28T03:33:03Z`와 DOM은 `dates.basis`에 남긴다. 직접 원문 검토8사실은 `20260927-nemoclaw-tag-source-reviewed-editorial-v1`에 보관했다. 내용/날짜 근거는 [수집 명세16](SOURCE_ACQUISITION_SPEC.md#16-고정-릴리스와-시간대-포함-날짜의-현재-계약)을 따른다.

### 28.2 같은 입력의 실제 로컬 작성과 분류 개선

Ollama0.34.4, Qwen3.8:27b digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`에서 `think=false`, `num_ctx=16384`, `num_predict=4096`, 온도0, 호출300초를 사용했다. 최초 작성과 일반 분류 프롬프트 보강 뒤 작성은 원문·parse·직접 검토 사실·모델/Schema/실행 설정을 같게 고정했다.

| 실제 결과          | 최초 작성                                            | 프롬프트 보강 후                                       |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------ |
| run                | `20260927-nemoclaw-tag-source-reviewed-editorial-v1` | `20260927-nemoclaw-classification-prompt-editorial-v2` |
| wall time          | 164858ms                                             | 180309ms                                               |
| 입력/출력 token    | 1649/1283                                            | 1809/1405                                              |
| 테마               | 연구·기술                                            | 제품·서비스                                            |
| 사건 태그          | 성능 개선                                            | 기능 추가                                              |
| 기업/기관 entities | 제품·도구·플랫폼을 포함한13개                        | NVIDIA1개                                              |
| 구조 문제          | 0                                                    | 0                                                      |

측정된 비교 성능이 없는 기능·복구·보안 변경을 성능 개선으로 분류하지 않도록 하고, 기업/기관 태그에는 사실의 주체에서 확인되는 실제 발표·계약·연구 당사자만 포함하도록 했다. 제품·라이브러리·명령·컨테이너·플랫폼 이름은 본문에 보존한다. 이 개선은 같은 원문1건의 비교이며 자동 의미 검증·독립60자료 평가·최종 모델 선정의 성공으로 계산하지 않는다.

최종 문장은 직접 원문 대조로 다시 편집했다. 소유권 기록(receipt), 중지/실행 중 컨테이너의 처리 차이, 한 번의 시작·직접 시작한 대상만 롤백, 기본 이미지 실패 시 중단과 명시적 사용자 Dockerfile, 자격증명·검사 종료·실험적 계획 검증의 범위를 구체화했다. 최종 승인은 `20260927-nemoclaw-concept-linked-editorial-v3`다. Model Connect도 실제 브리핑에서 제품/플랫폼 태그가 기업/기관 필터에 나타나는 것을 확인해 새 `20260927-model-connect-actor-reviewed-editorial-v4`에서 NVIDIA만 남겼다. 기존 리드·설명·발표일과 용어 연결은 보존했고 새 모델 추론은 하지 않았다.

### 28.3 배경 원문·두 전문용어·Signals

NIST·OpenAI Agents SDK·MCP architecture 2025-11-25·vLLM·Prometheus의5공식 자료를 실제 수집하고 본문을 읽었다. 수집 결과는4 captured/1 not_modified이며5parse가 있다.13개 직접 검토 사실은 `20260927-agent-security-inference-background-reviewed-v1`에 보관했다. NIST 원 날짜 `2026-02-05T07:00-05:00`는 그대로 유지한다. 현재 SDK 적용 범위는9월27일에 확인한 용어 설명의 근거이며8월28일 제품 기능으로 소급하지 않는다.

기존 경로/ID를 유지한 새 승인 노트는 `20260927-agent-security-inference-notes-v2`의3개다.

- `Knowledge/AI Systems/AI Agent Security.md` / `agent-security`: 신원·인가, 입력/최종 출력·함수 도구 전후 검사, 병렬/blocking 적용 시점과 MCP 호스트/서버 책임을 구분한다. 실제 NemoClaw 사례와 고정 기사·원문으로 연결한다.
- `Knowledge/AI Systems/AI Inference Infrastructure.md` / `inference`: 서빙 기능과 메모리·배치·분산 실행, Model Connect의 준비/실행, 평균/분위수와 histogram/summary 집계를 구분한다. 기능 목록을 비교 성능으로 쓰지 않는다.
- `Signals/2026-08-29_0800_Tech_AI_Briefing.md`: 원 관측2개의 ID·event/topic 연결·과거 날짜는 유지하고 `reviewed: 2026-09-27`, `review_basis: primary-research`로 현재 확인한 사실을 기록한다.

별칭·관계·이력은 해당 원문에서 다시 검토했고 전 문서의 before_content·SHA를 보존했다. 아직 재검토하지 않은 다른 날짜의 설명을 이번 새 근거로 재승인하지 않았다. `agent-runtime`/`performance-path`의 다른 사건·주제 전체 판단은 후속이다. 회사/제품 이름을 전문용어 노드로 추가하지 않는다.

### 28.4 실제 오류·새 사본·실행 명령

첫 preview-v1은 두 용어의 포함/비포함 표기와 관계 문장 구분자가 기존 노트 계약에 맞지 않아 막혔다. 새 notes-v2에서 형식을 고쳤으며 원문 사실·ID·관계 근거는 그대로다. preview-v2에서는 `--check`가 웹에서 `—check`로 바뀌어 채널 내용 대조가 실패했다. 검증기의 문장 비교를 완화하지 않고 렌더링 설정을 고쳤다. v3 이후 기업 태그를 직접 정정한 v4와 모바일 URL을 보강한 v5를 새로 생성했다. 각 사본·실패/성공 로그와 원 모델 출력은 남아 있다.

최종 `20260927-aug29-concept-reviewed-private-site-v5`는 이전6기사에 Model Connect/NemoClaw를 추가한8기사, 같은8월29일 회차까지6과거회차, 용어5/주제3/Signals1의9노트를 포함한다.9단계 완료·source437/public277/digest132·기사/원문/날짜/웹/RSS/GitHub 대조·RSS40 GUID/pubDate 보존을 확인했다. 전체 뉴스87, 전문용어16, 연결17은 유지했다. 두 기사에는 검토한 `agent-security`/`inference`를 명시적으로 배정했다.

```sh
npm run research -- correct --run 20260927-nemoclaw-concept-linked-editorial-v3 --review .local/research/local-ai/runs/20260927-nemoclaw-concept-linked-editorial-v3/editorial-correction-decision-v1.json
npm run research -- approve --run 20260927-nemoclaw-concept-linked-editorial-v3 --review .local/research/local-ai/runs/20260927-nemoclaw-concept-linked-editorial-v3/final-editorial-review-v1.json
npm run research -- note-review --run 20260927-agent-security-inference-notes-v2 --review .local/research/local-ai/runs/20260927-agent-security-inference-notes-v2/note-review-input-v2.json
```

이는 존재하는 입력 파일의 재확인 명령이다. 기존 run을 새 원문·원고로 덮어쓰는 재작성 예제가 아니다. fresh preview는 이전 승인6run에 Model Connect actor-v4와 NemoClaw linked-v3를, 기존 knowledge2run에 새 notes-v2를 `--approved-run`/`--knowledge-run`으로 명시한다. 정확한 입력 목록·단계 해시는 최종 `preview-manifest.json`, `preview/state.json`, `preview/outputs.json`, `preview/consistency.json`에 있다. 원본이나 렌더러가 바뀌면 기존 완료 사본을 그대로 재개하지 않는다.

### 28.5 검증 명령·실물 범위·현재 종료 상태

| 실제 검증                             | 결과와 비공개 로그                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `npm test`                            | 369pass/45suites/fail0/skip0; `nemoclaw-literal-all-tests-20260927-v3.log`    |
| `npm run test:garden`                 | 206pass/fail0/skip0; `nemoclaw-literal-garden-tests-20260927-v2.log`          |
| 전체 Python worker 시험               | 23pass; `nemoclaw-date-worker-full-20260927-v1.log`                           |
| 분 단위 날짜 집중 시험                | 12pass; `minute-source-date-after-20260927-v1.log`                            |
| 실제 Markdown plugin 시험             | 명령·따옴표·숫자 표기와 GFM 표 유지; `literal-markdown-after-20260927-v1.log` |
| `npx tsc --noEmit`                    | exit0; `nemoclaw-date-types-20260927-v1.log`                                  |
| `npm run validate`                    | 436notes/26v2·exit0; `nemoclaw-date-authority-validate-20260927-v1.log`       |
| fresh preview의 전체 생성·사이트·대조 | v5의9단계 완료; `aug29-concept-reviewed-private-site-20260927-v5.log`         |
| 실제 Chrome UI                        | 아래6경로·URL/키보드/노드 선택 관측; `aug29-browser-review-20260927-v5.json`  |

Chrome에서1280×900/390×844의8월29일 브리핑·두 뉴스·두 용어, 전용 지도를 확인했다. 분야 탭의 `?sector=AI`, 뒤로 가기, Enter 선택과 초점, 전문용어 태그→정확한 용어→고정 기사, 지도 노드 선택→새 관련 뉴스와 `?focus=`를 확인했다. 뉴스/브리핑에 지도·빈 분석·운영 안내가 없었다. 기술 명령의 `--`가 유지되고 두 기사 기업 태그는 NVIDIA였다.

모바일 기사에서는 긴 GitHub 원문 URL 때문에390px 화면의 scrollWidth가471px였고, HTTP(S) 링크 줄바꿈 뒤390px로 확인했다. 두 뉴스·용어·브리핑·지도에서 가로 넘침이 없었다. 이는 관측한6개 로컬 경로와 상호작용의 확인이며277파일 전체 브라우저 점검이나 공개 배포 검증은 아니다. 임시 viewport와 생성 탭을 정리하고 자신이 시작한 서버를 종료했다.

생성기의 `candidate_published/drive_verified/browser_verified`는 모두 false다. 별도 실제 UI receipt를 남겼으나 자동 파이프라인의 완료 플래그를 수동 변경하지 않았다. 권위 원본의87사건73verified/14unreviewed는 그대로이며 추가 private 판정5개 뒤 잔여9개다. 구형92회차/801구간·의존 지식 전체·독립60자료 평가·새 Drive 왕복/인증/충돌·기존08시 연결·서로 다른 새7회·첫 공개 발행은 미완료다. 다음 입력·수정 파일·완료/실패 조건은 [구현 계획19.7](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#197-두-기사용어-통합-이후의-구체적인-재개-계약)을 따른다.

## 29. 원문 판본과 작성 입력 범위·기사·용어·누적 주제 통합

### 29.1 이 묶음의 입력과 구현 경계

현재 NVIDIA의 두 공식 발표와 9월 13일에 보관한 이전 성능 자료를 읽고 기존 사건 `19af374b78b369cd`를 다시 작성했다. 최신/이전 성능 자료는 같은 URL·최초 게시일을 사용하지만 body SHA·수정일·수치·검토 상태 문장이 다르다. 기존 제목을 바꿔도 사건 ID·과거 회차·RSS 식별자를 유지한다. 이 작업은 소급 수정이며 당일 새 뉴스 발행이 아니다.

| 입력                     | 실제 보존 위치·필수 확인                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 현재 두 발표·이전 보관본 | `20260927-nvidia-versioned-primary-v1`; 3document/3parse·59/30/29블록·각 body SHA                                                              |
| 이전 수집 영수증         | `.local/retrospective/source-responses/79a064693391118946d606119b66a837a6767415d032acb93879772b5f4a5818.json`; 9월 13일 관측·HTTP200·잘림 없음 |
| 원문 전체 검토           | `20260927-nvidia-versioned-source-reviewed-editorial-v1/direct-source-review.json`; 13사실·판본별 claim/evidence                               |
| 최초 날짜/갱신 날짜      | 최초 8월 24일·본문 명시 9월 15일; 이전 보관본은 최초 게시 당시 바이트라는 증거가 없음                                                          |
| 수치와 조건              | 이전 비용 최대35배/현재 최대45배; 현재 DeepSeek V4 Pro·AgentX·GB300 NVL72·메가와트당 처리량 최대30배·도구 호출 CPU 제외                        |

보관본 편입은 `.local/research/local-ai/nvidia-versioned-primary-20260927-v1.mjs`의 private helper다. `source_id`·본문 버전·관측일·편입일을 구분하고 원문/영수증 SHA를 확인한다. 현재 범용 CLI에 `import-legacy` 같은 명령이 있다고 쓰지 않는다. 이전 자료를 오늘 다시 다운로드하거나 robots를 재검사했다는 성공 상태로 바꾸지 않는다. 세부 원본 SHA·시간과 운영 일반화 계약은 [수집 명세17](SOURCE_ACQUISITION_SPEC.md#17-같은-원문-주소의-수치-갱신과-과거-자료)을 따른다.

운영 코드 변경은 [editor.mjs](../scripts/research/editor.mjs)의 판본·날짜 집필 지시 추가다. `published_at`을 후속 사실 발생일로 대신 쓰지 않고 사실의 날짜·`effective_period`·판본별 근거를 보존하도록 했다. 이 규칙 추가가 이번 사례를 자동 해결했다는 판정은 아니다.

### 29.2 실제 모델 호출과 판정

모델은 세 호출 모두 Qwen3.8:27b, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, Ollama0.34.4, `think=false`, `num_ctx=16384`, `num_predict=4096`, `temperature=0`, 호출 제한300초다. 원 request/schema/options와 원 response를 각 `draft.json.model_artifacts`에 보존했다. 아래 시간은 실제 각 호출의 wall time이며 하루 처리량 추정이 아니다.

| 실행                                                     | 입력                              | 시간·토큰                   | 원출력 판정                                                                    |
| -------------------------------------------------------- | --------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `20260927-nvidia-versioned-source-reviewed-editorial-v1` | 이전/현재 13사실·변경 전 프롬프트 | 195.842초·입력2694/출력1429 | 구조 문제0; 최신 갱신 문단에 이전 검토 대기 상태를 적용                        |
| `20260927-nvidia-versioned-date-prompt-editorial-v2`     | 같은13사실·판본 지시 추가         | 181.762초·입력2832/출력1316 | 구조 문제0; 두 판본 모두 검토 대기라는 합성·이전 보관본을 최초 게시본으로 확정 |
| `20260927-nvidia-current-facts-editorial-v3`             | 현재 발표/명시 갱신의10사실       | 163.623초·입력2408/출력1247 | 구조 문제0; 이전35배/검토 대기 혼합 없음; 문장·귀속·설명 구성은 직접 정정      |

앞의 두 호출은 source/document/parse/claim·모델 설정·schema를 같게 두고 프롬프트만 바꾼 비교다. 결과는 **이 사례 해결 실패**다. 세 번째는 현재 근거9개를 선택하고 현재 서빙 최적화 사실1개를 추가한 별도 입력이다. 이전4사실은 원본 run에 남기고 현재 writer에 전달하지 않았다. 입력이 달라 프롬프트 전후 개선으로 보고하지 않는다. `source-selection-review.json`에 포함/제외 claim ID와 이유를 보존한다.

세 명령은 실제 수행 기록이다. 이미 존재하는 run의 입력/승인을 임의로 덮어써 새 시험으로 세지 않는다. 변경 입력은 새 run을 만들고 읽은 범위·지침·설정을 다시 고정한다.

```bash
npm run research -- draft --run 20260927-nvidia-versioned-source-reviewed-editorial-v1 --model qwen3.8:27b --think false
npm run research -- draft --run 20260927-nvidia-versioned-date-prompt-editorial-v2 --model qwen3.8:27b --think false
npm run research -- draft --run 20260927-nvidia-current-facts-editorial-v3 --model qwen3.8:27b --think false
```

첫 CLI 시도에 사실 추출 전용 예산 인수를 넣어 옵션 검사에서 거부됐다. 그 호출은 모델 실행으로 계산하지 않는다. 거부 로그 `nvidia-versioned-model-draft-20260927-v1.log`와 올바른 호출의 v2 로그를 각각 보존했다. 현재 `draft`의 지원 인수와 `extract`의 6예산 인수를 구분한다.

### 29.3 최종 기사와 의존 지식

최종 정정/승인 run은 `20260927-nvidia-current-facts-approved-editorial-v4`다. 기사 제목은 “NVIDIA, Groq 3 LPX 양산과 GPU·LPU 공동 추론 구성 소개”, 사건 ID는 기존 `19af374b78b369cd`, 발표일은 8월24일, 검토일은9월27일, `concept_ids=['inference']`다. 기업 태그는 당사자NVIDIA와 실제 도입 계획의Nebius다. 제품명을 기업이나 전문용어 노드로 바꾸지 않았다.

리드는 당시 구성 발표를 3문장으로 전달하고 설명은 다음 4개로 묶었다.

1. GPU/LPU의 역할·계층 공동 계산·LP30 가속기256개 구성.
2. Spectrum-X Multiplane과 BlueField-4/DOCA Scale-In의 네트워크·인프라 역할.
3. **9월15일 갱신 자료**의 prefill/decode 분리·분산 KV 캐시·캐시 기반 라우팅·커널/서빙 구성.
4. **9월15일 갱신 성능**의 회사 귀속·비교 모델/워크로드·전력/토큰 지표·CPU 제외 조건.

최종 문장은 “처리량은 최대30배 높고, 백만 토큰당 비용은 최대45배 낮다”로 구분했다. 처리량과 비용의 방향을 한꺼번에 “낮다”로 쓰지 않는다. 이전35배·검토 대기·최초 바이트 추정·임의 성능 증감률·운영 보관 안내는 독자 기사에 없다. 원초안·수정 전문·판본 비교·검토 판단은 private에 남는다.

```bash
npm run research -- correct --run 20260927-nvidia-current-facts-approved-editorial-v4 --review .local/research/local-ai/runs/20260927-nvidia-current-facts-approved-editorial-v4/editorial-correction-decision-v1.json
npm run research -- approve --run 20260927-nvidia-current-facts-approved-editorial-v4 --review .local/research/local-ai/runs/20260927-nvidia-current-facts-approved-editorial-v4/final-editorial-review-v1.json
npm run research -- note-review --run 20260927-nvidia-versioned-dependent-notes-v2 --review .local/research/local-ai/runs/20260927-nvidia-versioned-dependent-notes-v2/note-review-input-v2.json
npm run research -- note-review --run 20260927-performance-topic-source-rebuilt-notes-v1 --review .local/research/local-ai/runs/20260927-performance-topic-source-rebuilt-notes-v1/note-review-input-v1.json
```

최종 원고 SHA는 `3b1b4000be1457494c004db82e3188b8a4801290255f7233fb53dee52f5af5cc`다. 수정 전 원출력 SHA·전체 등장 회차·원제목·날짜·부속 섹션 제외 판단도 승인 묶음에 보존했다. `source-scope-model-review.json`의 `prompt_change_solved_case=false`, `changed_input_is_not_paired_prompt_comparison=true`, `automatic_publication_qualified=false`를 유지한다.

| 교체 노트          | 확인한 변경과 보존 조건                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| AI 추론 인프라     | 기존 정의/별칭/확인 관계 유지;9월15일 갱신·8월28일 Model Connect·8월24일 구성을 각각 날짜·기사·원문에 연결                |
| AI Agent Security  | 앞선 직접 검토 승인 내용을 그대로 재사용; 이번 성능 자료 때문에 의미 변경 없음                                            |
| Signals8월29일     | 앞선 승인 원문/ID를 그대로 사용                                                                                           |
| Signals8월25일     | 기존 `performance-nvidia` 관측/사건/회차 ID 보존; 현재 판본/워크로드/지표/날짜 근거로 정정                                |
| `performance-path` | 현재 두 확인한 발표의 구성/비교 조건으로 요약;근거를 잃은 `measure-the-path` 교훈 생략;기존 전체 전문/판단은 private 보존 |

최초 전체 preview v1은 `measure-the-path`의 오래된 검토 날짜와 변경된 Signals의 근거 날짜가 맞지 않아 검증에서 중단됐다. 실패 메시지는 `lesson needs reviewed evidence from two distinct events and dates`다. 판정을 완화하거나 날짜만 바꿔 통과시키지 않았다. 현재 요약은 직접 확인한 두 사건의 내용으로 다시 썼고 새 비교 교훈을 만들어 채우지 않았다. `lessons: []`·`reader_format: source-events/v1`을 사용하며 빈 교훈·운영 질문·한계 필드는 독자 화면에 나오지 않는다. 다른 날짜의 연결 사건이나 주제 전체를 이번에 재검토했다고 주장하지 않는다.

### 29.4 전체 사본 생성·대조와 실패 보존

최종 사본은 `20260927-nvidia-current-integrated-private-site-v2/preview-workspace`다. 아래 명령은 승인 기사9개와 노트11개의 승인 run4개를 사용한다. 앞선8기사/6회차/9노트의 v5 사본과 실패한 새v1도 보존했다.

```bash
npm run research -- preview --run 20260927-nvidia-current-integrated-private-site-v2 \
  --approved-run 20260927-strategy-grouped-source-reviewed-deep-v2 \
  --approved-run 20260927-venture-grouped-source-reviewed-deep-v2 \
  --approved-run 20260927-paper-grouped-source-reviewed-deep-v2 \
  --approved-run 20260927-timesfm-concept-linked-editorial-v3 \
  --approved-run 20260927-search-concept-linked-editorial-v3 \
  --approved-run 20260927-microsoft-validation-source-reviewed-editorial-v1 \
  --approved-run 20260927-model-connect-actor-reviewed-editorial-v4 \
  --approved-run 20260927-nemoclaw-concept-linked-editorial-v3 \
  --approved-run 20260927-nvidia-current-facts-approved-editorial-v4 \
  --knowledge-run 20260927-vla-three-topics-notes-v4 \
  --knowledge-run 20260927-timeseries-content-access-notes-v2 \
  --knowledge-run 20260927-nvidia-versioned-dependent-notes-v2 \
  --knowledge-run 20260927-performance-topic-source-rebuilt-notes-v1
```

| 결과                   | 실제 확인                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| 생성 단계              | 9단계complete; 각 결과/로그/hash 기록                                                                |
| 정정 대상              | 승인 기사9개·과거 회차7개·노트11개(용어5/누적 주제4/Signals2)                                        |
| 생성 파일              | source437/public277/digest132; 전체 산출물 fingerprint                                               |
| 웹/RSS/GitHub Markdown | 기사 요약/설명/날짜/원문·노트 연결 대조;RSS40 GUID/pubDate 보존                                      |
| 지도                   | 기존16용어/17관계;NVIDIA 기사→inference;새 회사/제품 노드·공동 등장 관계 없음                        |
| 공개/원격 상태         | `candidate_published=false`, `drive_verified=false`, `browser_verified=false`;별도 직접 UI 기록 사용 |

7과거회차는 실제 날짜가 다른 신규 운영7회가 아니다. 독립 평가60자료의 새 사례 수도 늘리지 않았다. 반영 노트11개를 전체 지식 검토 완료로 표현하지 않는다.

### 29.5 검증 명령·로그·UI 관측

판본 프롬프트 변경 뒤 `npm test`는 **369pass/45suites/fail0/skipped0**, 로그 `nvidia-versioned-prompt-all-tests-20260927-v1.log`다. 이번 fresh preview는 생성·validate·build·사이트·채널 대조 9단계를 모두 완료했다. worker23·garden206·typecheck·권위 원본validate의 실행은 앞선28절 기록이며 이번 원문 수정으로 다시 실행했다고 쓰지 않는다.

Chrome/CUA로1280×900/390×844에서 NVIDIA 기사·추론 용어·8월25일 브리핑·performance-path를 직접 확인했다. 발표8월24일과 성능 갱신9월15일이 구분되고 현재45배·회사 조건이 출력됐다. 뉴스/브리핑 지도0, 모바일 가로폭390 유지, 전문용어 태그 이동, 용어→기사 Enter, 기사→과거 브리핑 클릭, 분야 탭의 Enter/URL/`aria-current`/뒤로 가기를 확인했다. 주제에는 사건 이력·관련 개념만 나오고 제거 교훈·운영 안내·빈 교훈 섹션이 없었다.

용어 이력의 기사 링크 마우스 클릭은 URL이 바뀌지 않아 확인하지 못했다. 같은 실제 href의 키보드 Enter 이동은 확인했다. 마우스 검증 실패를 서비스 결함 수정이나 성공으로 표시하지 않았다. 관련 링크가 본문/지도에 중복되어 locator를 문단 부모로 좁힌 과정과 관측을 `nvidia-versioned-browser-review-20260927-v2.json`에 보존했다. 초기 Python 서버의 prefix 오류로 CSS가 누락된 화면은 최종 UI 검증에서 제외했고 기존 `scripts/serve.mjs`로 생성 결과를 다시 열었다. 임시 viewport·own tab·서버는 종료했다. 공개 사이트·모바일 실기기·277개 전체 경로 브라우저 검증은 아니다.

모델 호출·기사/노트 승인·원본 SHA·RSS·9단계/로그·전체 출력·문서 링크/JSON/WBS/요구사항 검사는 별도 `documentation-validation-nvidia-20260927-v1.json`에 남긴다. 실패/성공 run과 로그를 덮어써 하나의 성공 실행으로 만들지 않는다.

### 29.6 남은 전체 완료 조건과 다음 위치

권위 원본의87사건/73verified/14unreviewed와181파일은 이 private 승인으로 바꾸지 않았다. 추가 private 판정6개 뒤 잔여8사건이다. 정확한 ID·현재 수집 상태·다음 필수 자료는 [계획19.8의 재개 입력](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#현재-결과와-다음-재개-입력)에 있다. 그 다음 구형92회차/801구간과 Knowledge/관계/Signals/TrendTopics 전체를 판정한다.

범용 보관본 편입·판본 변경 diff·의존 승인/이력 stale 영향·표/MathML/OCR·출처 상세/첨부/페이지 종료/실패 이월·메모리와 하루 예산은 여전히 후속 구현/평가 대상이다. 모델 설정·독립40개발/20보류 평가·새 Drive 인증/업로드/재읽기/hash/parent/충돌·복구·기존08시 단일 경로 통합·서로 다른 실제 신규7회와 첫 공개 발행을 완료해야 전체 goal을 완료할 수 있다. 이 문서 갱신·비공개 승인·과거 사본·자동 테스트는 그 완료를 대신하지 않는다.

## 30. 이중 블라인드 평가 소급 기사와 연구 PDF 파서

### 30.1 변경 범위와 자료 확보

2026년 9월 27일, 8월 28일 브리핑의 고정 사건 `7a7d38500197da71`을 추가로 검토했다. 최종 제목은 ‘Google DeepMind, 모델과 시험 문제를 서로 공개하지 않는 평가 시범 연구’다. 같은 회차의 OpenAI 학생 RCT와 Planetary Prediction Engine은 미검토 상태를 유지한다. 이 작업은 과거 회차의 비공개 전환이며 오늘의 새 뉴스·일일 운영 회차·공개 발행이 아니다.

원문은 DeepMind 공식 발표와 연결된 기술 보고서다. 발표문은 일반 추출 결과의 7블록 뒤에 실제 본문이 더 있었고, exact profile 적용 뒤 동일 바이트에서 13블록을 확보했다. 기술 보고서는 8쪽 100블록을 읽고 1·2·7쪽의 표지·절차 그림·실행 조건을 시각 대조했다. [수집 명세18](SOURCE_ACQUISITION_SPEC.md#18-여러-본문-구역과-날짜-없는-연구-pdf)에 DOM·PDF 제목·발표일 분리와 회귀 조건을 기록했다.

| 단계           | 실제 산출물                                          | 확인한 범위                                                               |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 원본 선택      | `20260927-aug28-selected-papers-source-v1`           | 기존 수집의 발표문·PDF2개; 관측 시각과 원본 SHA 유지, fresh fetch 아님    |
| 재파싱         | `20260927-aug28-papers-profiled-v2`                  | 새 profile 3개; 발표문13/PDF100·540블록; PDF 본문 텍스트 유지             |
| 직접 사실 검토 | `20260927-double-blind-source-reviewed-editorial-v1` | 발표문과 DeepMind PDF의 9사실; 생성일을 발표일로 사용하지 않음            |
| 실제 로컬 작성 | 같은 run의 `draft.json`과 모델 요청·응답             | Qwen3.8:27b 실제 호출; 자동 사실 추출·독립 gold 아님                      |
| 정정·승인      | `20260927-double-blind-approved-editorial-v2`        | 고정 기사 ID/발표8월27/검토9월27; 일반 사건 기사, 전문용어 배정은 빈 배열 |
| 통합 사본      | `20260927-double-blind-integrated-private-site-v4`   | 10기사/8과거회차/11노트, 웹·RSS·digest 대조                               |

위 run의 기본 경로는 `.local/research/local-ai/runs/`다. 원본 선택 helper, 직접 검토 helper, 정정 helper는 해당 `.local` 루트의 `aug28-select-sources-20260927-v1.mjs`, `aug28-double-blind-facts-20260927-v1.mjs`, `aug28-double-blind-final-20260927-v2.mjs`에 보존했다. helper는 특정 사건을 위한 직접 편집 도구이며 범용 무검토 수집·발행 기능으로 소개하지 않는다.

### 30.2 실행과 로컬 모델의 실제 결과

```sh
npm run research -- reparse --run 20260927-aug28-papers-profiled-v2 --source-run 20260927-aug28-selected-papers-source-v1
npm run research -- draft --run 20260927-double-blind-source-reviewed-editorial-v1 --model qwen3.8:27b --think false
npm run research -- correct --run 20260927-double-blind-approved-editorial-v2 --review .local/research/local-ai/runs/20260927-double-blind-approved-editorial-v2/editorial-correction-decision-v1.json
npm run research -- approve --run 20260927-double-blind-approved-editorial-v2 --review .local/research/local-ai/runs/20260927-double-blind-approved-editorial-v2/final-editorial-review-v1.json
```

이미 실행한 run은 그 입력·원출력·승인을 보존한다. 새로운 원문이나 편집 입력으로 다시 진행하면 새 run ID를 사용한다. 승인 JSON에는 실제로 읽은 사실과 최종 문장, 기존 회차 전체 바이트/SHA, 제목·날짜·부속 문구의 검토를 연결한다. 승인은 Drive 업로드나 발행을 수행하지 않는다.

실제 모델은 `qwen3.8:27b`, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, Ollama `0.34.4`, Q4_K_M/27.3B였다. `think:false`, context16384, predict4096, temperature0, 호출 제한300000ms에서 178876ms·입력1997/출력1331토큰을 측정했다. 구조 문제는 0건이지만 AIRR 1.4와 어떤 모델도 처리하지 않은 예비 세트 조건을 원고에서 빠뜨렸다. 리드와 설명의 묶음도 직접 정리했다. 이런 직접 수정이 필요한 결과를 무검토 자동 발행 합격으로 계산하지 않는다.

최종 fingerprint는 `fd6717f66d2591e60158b67ab108a629cdcd41f674ecae9f6448a64047237d22`다. 기사에는 평가 배경·양쪽 코드 승인·실험 환경·AVERI의 실제 출력 평가·독점 코드/서명 키/인증 경로·다중 노드 확장 계획을 설명한다. 회사가 인용한 과거 5% 오버헤드를 이번 측정으로 쓰거나 모델 성능 점수를 만들어 넣지 않는다. 미래 계획은 계획으로 표시한다. 포괄적인 `Agent Evaluation`을 일반 모델의 기밀 평가에 강제로 연결하지 않아 `concept_ids: []`를 유지했다. 별도 전문용어 정의와 관계 검토는 후속 작업이다.

### 30.3 과거 회차의 일부 기사만 전환하는 구현

첫 통합 시도 v1은 기존 `existingArticleProjection`이 육하원칙·분류가 없는 과거 기사 두 건을 보존하지 못해 차단됐다. v2는 수정한 기사에 과거 커버 스토리의 질문형 소제목 검사가 적용돼 차단됐다. 두 실패를 보존하고 다음과 같이 실제 변환 경로를 수정했다. 검증기를 비활성화하거나 미검토 기사에 가짜 분류를 넣지 않았다.

1. `existingArticleProjection`은 2026-09-14 이전이며 전체 육하원칙 형식이 없는 회차의 기사를 `legacy.body/desk`와 기존 review·ID·원문 배열로 보존한다. 내용·제목·출처·review·desk가 바뀌면 `editionProjection`이 거부한다.
2. 일부만 전환할 때 `article_records`에는 승인된 육하원칙 기사만 넣는다. 전체 회차의 `editorial_format: six-w/v1`을 선언하지 않는다. 기존 분야/테마 형식이 있으면 그대로 보존하고 없으면 새로 추정하지 않는다.
3. `extractArticles`는 명시된 partial record와 `review_status: verified`가 모두 있는 기사에만 작성된 분류를 읽는다. `applyEditorial`은 해당 record의 육하원칙·본문·설명·출처·심층 조건을 그대로 검증하고 미검토 기사는 원형으로 남긴다. 9월14일 이후 새 회차에는 이 경로를 허용하지 않는다.
4. 기존 Source List 번호는 유지하고 새 공식 발표를 뒤에 추가한다. 이번 기사에서 발표문은 S4, 기존 PDF는 S1이다. 다른 두 기사의 S2·S3와 본문은 변하지 않는다. 고정 사건 ID와 원 회차 날짜/coverage/RSS GUID·pubDate를 유지한다.
5. 전환한 기사는 뉴스 데스크에 넣고 미검토 기사의 원 desk를 보존한다. Python 원고 검증기의 과거 커버 소제목 검사와 전체 source/link 검사는 유지한다. 새 본문을 구형 커버 형식이라고 표시하지 않는다.
6. 과거 회차에서도 RSS·GitHub fallback은 승인된 발표일·분류·설명을 전달한다. `editorialContext`는 실제 article record가 있는 기사의 근거만 누적하며 다른 두 기사에 사실 판정을 붙이지 않는다.
7. 나머지 기사의 원문 검토까지 끝나면 전체 `six-w/v1`, `sector-five/v1`, `news-themes/v1` 계약으로 전환한다. 별도 중복 기사 저장소나 가짜 전문용어 연결을 만들지 않는다.

이 경로는 v2 과거 회차를 위한 구현이다. 구형92회차/801구간을 모두 전환했다고 보고하지 않는다. 해당 자료의 사건 ID 확정·중복/원문/제외 판정과 원고 전환은 여전히 별도 작업이다.

### 30.4 실패 보존·회귀·실제 브라우저 검증

| 검사                | 명령·로그 또는 증거                                                                                                                          | 결과                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 파서 red→green      | `aug28-profile-red-20260927-v1.log`, `aug28-profile-green-20260927-v1.log`                                                                   | profile 미등록 red 보존; worker25pass                                                          |
| 목록·추출           | `node --test tests/source-registry.test.mjs tests/research-extraction.test.mjs`, `aug28-profiles-focused-tests-20260927-v1.log`              | 13pass                                                                                         |
| 부분 전환 red→green | `tests/research-legacy-projection.test.mjs`와 기존 projection/editorial tests; `aug28-legacy-projection-red-20260927-v1.log`, green-v1/v2/v3 | 원형·ID·날짜·출처·채널·변조 거부; 최종29pass. 중간 v1의 빈 전체 회차 처리 회귀는 코드에서 수정 |
| 전체 Node 회귀      | `npm test`, `aug28-double-blind-final-all-tests-20260927-v2.log`                                                                             | 375pass/45suites/fail0/skip0                                                                   |
| 타입                | `npx tsc --noEmit`, `aug28-double-blind-typecheck-20260927-v1.log`                                                                           | exit0                                                                                          |
| 실제 생성           | 최종 v4 `preview/state.json`과 각 stage 로그                                                                                                 | 9단계 완료; source437/public277/digest132/RSS40 식별자 보존                                    |
| 실제 브라우저       | `aug28-double-blind-browser-review-20260927-v1.json`                                                                                         | 기사·브리핑의 desktop/mobile 및 분야 선택 5관측; 아래 범위                                     |

최종 v4 preview에는 10승인 기사·8과거회차·11승인 노트가 합쳐졌다. graph16노드/17연결이며 이 새 기사를 전문용어 노드에 임의 배정하지 않았다. authority181파일/87사건73verified14unreviewed는 바꾸지 않았다. 비공개 추가 판정7개 이후 해당14건의 잔여는7건이다. 기존 승인 3건을 이14건의 신규 판정으로 중복 계산하지 않는다.

Chrome 확장으로 1280×900과390×844에서 두 경로를 읽었다. 뉴스→8월28일 브리핑 링크 클릭, AI 탭 Enter→`?sector=AI`/`aria-current=page`, 전체3기사→AI1기사, 뒤로 가기 원 URL 복원을 확인했다. 가로 넘침·본문 지도·빈 분석 탭·운영 안내는 없었다. 모바일 본문은17px이며 원본 `tab.screenshot`에서 실제 배치를 확인했다. 초기 일반 `getScreenshot`의 축소 캡처는 모바일 시각 검증으로 계산하지 않았다. viewport를 reset하고 owned tab을 닫았으며 owned server는 exit130으로 종료했다.

generator의 `candidate_published/drive_verified/browser_verified`는 false로 유지하고 브라우저 관측은 별도 영수증으로 남긴다. 277개 공개 파일 전체의 사람 검토·실제 휴대전화·production 확인이 아니다. 이번에 Drive 쓰기, commit/push/deploy, 인증/예약 변경, 유료 API 호출을 수행하지 않았다.

### 30.5 다음 재개 위치

8월28일의 `068cf5b2747d434f`는 arXiv v1 발표일과 309블록 HTML에서 방법·표·지표·공간/시간 분할 조건을 검토한다. `de0d8b99a9cda9c5`는49쪽 PDF의 실험 설계·분모·표·기간을 확인하고 blocked 공식 발표의 근거 연결을 해결한다. PDF title profile 성공을 전문 검토나 발표일 확정으로 계산하지 않는다. 다른5건은 [계획19.8](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#현재-결과와-다음-재개-입력)의 Nature·AWS 날짜·차단4공식 경로를 따른다.

그 다음 전문용어/관계·전체 소급, 수집 상세/첨부/페이지/실패이월·표/MathML/OCR·예산, 독립40개발20보류, Drive인증/쓰기/재읽기/hash/충돌·복구, 기존08시 통합, 실제 신규7회와 첫 공개 발행을 완료해야 전체 목표를 완료할 수 있다.

## 31. 상세 개발 문서의 기준선과 적용 방법

2026-09-27 추가 문서화에서 기존 코드·설정·이전 실행 영수증을 대조했다. 이번 변경 대상은 README와 네 상세 문서, 기존 작업 상태 기록이다. 수집·추론·기사/용어 생성·Drive 쓰기·commit/push/배포·예약 변경을 새로 수행하지 않았다. 이전 코드 시험375pass/worker25/typecheck 결과는 [30절](#30-이중-블라인드-평가-소급-기사와-연구-pdf-파서)의 실행 기록이며 이번 문서 변경에서 재실행한 테스트로 표시하지 않는다.

### 31.1 현재 코드와 문서가 가리키는 정확한 경계

| 확인 항목     | 다시 확인한 값/근거                                       | 문서에서 사용하는 의미                                            |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Node          | 실제 `node --version`:26.4.0; package 최소>=22            | 현재 환경과 설치 요구를 구분                                      |
| Python worker | 기존 private venv Python3.12.14                           | 시스템 Python 교체 없이 파싱                                      |
| Ollama        | 실제 `/api/version`:0.34.4                                | installed runtime의 읽기 확인                                     |
| 주 모델       | `/api/tags`의 Qwen3.8:27b Q4_K_M/27.3B와 기존 digest 일치 | 설치 모델 확인이며 작성 품질 승격 아님                            |
| think         | `/api/show`:false/low/medium/xhigh, 기본medium            | 지원값/타입 검사; 기준 추출은false 명시                           |
| 기사 profile  | 실제 acquisition JSON21개                                 | 과거17/18개 실험 기록과 현재 총수 구분                            |
| 신규 용어     | 당시 note-review/knowledge-draft는 기존 파일 읽기 필수    | 이후 v2 구현·실물 검증은 [32절](#32-신규-전문용어-등록-검증) 참조 |
| 전체 실행     | CLI의 현재 명령 열거값에daily 없음                        | 단계별 경로를 통합하는 후속 구현                                  |
| 비공개 결과   | v4 preview state와 영수증:10기사/8과거회차/11노트·9stage  | 원본14미검토/비공개 잔여7; 신규7회 운영 아님                      |
| 원격/공개     | 이전 receipt의drive_verified/production_verified=false    | 이번 문서 보강으로 상태를 바꾸지 않음                             |

### 31.2 개발 문서를 찾는 순서

1. [시스템16](LOCAL_AI_NEWS_SYSTEM.md#16-구현-범위와-개발-인계-명세)에서 코드·입출력·남은 연결과 단계별 모델 설정을 확인한다. 구현/운영/발행 상태의 기준을 먼저 읽는다.
2. 출처 추가는 [수집19](SOURCE_ACQUISITION_SPEC.md#19-경로별-실행-계약과-개발-검증)에서 자료 유형별 근거·상태·8개 구현 순서·실물 시험을 읽고, 기존 profile/fixture와 대조한다.
3. 새 학습 용어는 [계획19.10](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1910-신규-전문용어-등록기사-연결이력의-구현-명세)을 사용한다. v1 호환·v2 생성·경로 부재·중복·source provenance·기사/이력·독자 흐름이 한 묶음의 완료 조건이다.
4. 전체 오전8시 경로는 [계획19.11](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1911-일일-실행기와-발행-인계의-구현-명세)을 사용한다. stage·전역 예산·잠금·신규 누적 노트·원격/발행 재개를 별도로 검증한다.
5. 구현 후에는 해당 WBS·이 가이드의 명령/실행 증거·작업 상태를 갱신한다. 목표 schema를 구현했다고 쓰려면 actual reader/writer·실패 경로·fixture와 실제 검증 결과가 있어야 한다.

현재 존재하는 명령은 `scripts/research.mjs`의 allowlist가 기준이다. 문서 보강 당시에는 v2 입력/승인이 미구현이었다. 이후 `knowledge-note-review/v2`와 `knowledge-draft-input/v2`는 32절의 코드·실제 자료 검증을 거쳐 지원한다. `daily.mjs`는 계속 미구현이며 현재 명령으로 소개하지 않는다. 원격 쓰기나 publish는 읽기 전용 상태 확인과 다르며, 기존 관문을 통과한 발행 범위에서 수행한다.

### 31.3 문서 검증과 다음 재개

문서 수정 전 사본과290개 코드/설정/테스트/원고 파일의 SHA를 `.local/research/local-ai/documentation-detail-20260927-v1/`에 보존했다. 문서 링크300개·heading fragment150개·JSON 예제11개·23WBS/18요구사항·절 순서를 검사했고 보호 파일290개·작성 원고181개와 RSS40 GUID/발행일이 유지됐다. 결과는 같은 경로의 `validation.json`에 남겼다. 새 섹션의 형식 검사는 통과했으며 전체 문서 형식 검사에는 기존 수집/계획/실행 가이드와 작업 상태의 경고가 남아 있다. 관련 없는 기존 본문 전체를 재포맷하지 않았다. 이 검사는 문서의 정합성 증거이며 신규 schema·일일 실행기·Drive·공개 결과의 동작 증거가 아니다.

다음 구현 묶음은 신규 전문용어 생성/승인 계약과 실제 DeepMind 기사 연결이다. 별도 source 사실 검토가 필요하면 이전 검토 파일을 덮어쓰지 않고 새 run을 만든다. 기존 v4 전체 사본과 승인11노트는 재사용 입력으로 보존한다. 이후 남은7사건·구형92회차/801구간·전체 지식/관계·출처 상세·독립 평가·Drive·08시 통합·신규7회·첫 실제 발행을 계속한다. 상세 문서 보강을 전체 구현 완료로 표시하지 않는다.

## 32. 신규 전문용어 등록 검증

2026-09-27. [계획19.10](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1910-신규-전문용어-등록기사-연결이력의-구현-명세)의 Knowledge 신규 생성과 실제 기사·이력 연결을 구현했다. 기존 v1 승인과 원본은 보존한다. 최종 보관/공개 경로에는 아직 적용하지 않았으며 일일 실행기와 신규 Signals/TrendTopics 생성도 이 변경에 포함되지 않는다.

### 32.1 실제 코드와 지원 계약

| 모듈                   | 구현된 책임                                                                                                     | 보존하는 조건                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `knowledge-editor.mjs` | `knowledge-draft-input/v1`과 `/v2` 읽기; v2의 create/replace; 검토 metadata와 선택 사실로 8영역 작성            | 모델이 identity·별칭·관계·지도 판정·날짜 이력을 생성하지 않음    |
| `note-review.mjs`      | 기존 `knowledge-note-review/v1` 교체와 신규 `/v2` 생성/교체 승인; `approved-knowledge-notes/v1` 또는 `/v2` 출력 | 입력 버전별 출력과 기존 v1 fingerprint 유지; authority 쓰기 없음 |
| `knowledge-links.mjs`  | 새 metadata/12섹션 검사, 전체 canonical·같은 묶음의 ID/정확한 이름 충돌, 새 관계 target 검사                    | 지도 제외 개념도 중복 검사; 공동 등장으로 관계 생성 안 함        |
| `run-state.mjs`        | 모든 경로 성분의 lstat 검사, 목적지 부재, `atomicCreate`의 덮어쓰기 없는 설치                                   | 끊어진 symlink·경쟁 생성 거부; 소유한 임시 파일만 정리           |
| `preview.mjs`          | 생성/교체 stage, 생성 영수증 재개, 복수 승인 간 충돌, 신규 용어 색인 링크 파생, 기존 전체 검증                  | source vault 불변; 기존 색인 문구·작성일 보존; 출력 SHA 대조     |

v2에는 `operation:create` 또는 `operation:replace`가 필수다. 생성은 `Knowledge/`의 새 원자 개념에만 허용하고 `previous_sha256:null`을 명시한다. 생략을 null로 해석하지 않는다. 생성 승인 결과의 `before_content`도 null이다. 교체는 실제 before bytes/SHA와 기존 concept ID를 유지한다. v1 승인에는 operation을 추가하지 않는다.

신규 metadata의 필수 키는 title/type/entry_type/schema_version/status/domain/group/concept_id/label/created/updated/last_reviewed/aliases/keywords/parent_concepts/related_concepts/tags/verified_sources/map_review다. relations/connections는 선택 배열이며 빈 배열을 허용한다. unknown/private 필드는 거부한다. identity는 lower-kebab ID, 정확한 이름/별칭, 기존 schema와 `evergreen` 상태를 사용한다. created/updated/last_reviewed와 map review는 실제 최종 검토일을 가리킨다. source URL은 선택한 검토 사실의 원문이어야 하며 원문 bytes/parse/block/quote/검토 날짜를 다시 검사한다.

목적지는 초안 입력, 승인, 승인 재읽기 때 모두 없어야 한다. 새 용어의 ID·basename·title·label·별칭을 NFKC/대소문자로 대조한다. create는 12개 섹션·H1 제목·정의·범위의 포함/제외·출처를 확인하고 관계는 알려진 concept ID와 이유를 가져야 한다. 원고 내용의 실제 의미는 별도 직접 읽기로 판정한다.

stage는 생성과 교체를 구분한다. `atomicCreate`는 temp에 write/fsync하고 hard-link로 목적지에 설치해 EEXIST 때 다른 파일을 보존한다. rename 덮어쓰기로 전환하지 않는다. 중단된 workspace 재개는 `preview/created-notes/<path-sha>.json`에 저장한 path/SHA/전체 input hash가 일치하고 실제 파일도 동일한 경우만 허용한다. 생성 이후 영수증 저장 전에 중단되면 임의로 소유권을 추정하지 않고 충돌로 중지한다. 기존 실행기의 lock과 stage/input/output hash를 유지한다.

canonical 색인은 새 승인 개념의 탐색 링크만 파생해 비공개 사본에 추가한다. 기존 본문·링크·작성일은 보존하고 수정일은 최신 검토일로 계산한다. 색인의 before/after SHA는 preview manifest의 navigation에 남는다. 권위 색인을 자동 수정하는 기능은 아니다.

### 32.2 원문과 신규 학습 용어

대상 사건은 `7a7d38500197da71`, 원 발표일은2026-08-27, 등장 회차는2026-08-28이다. 공식 발표문과8쪽 기술 보고서의 고정 bytes·parse를 재사용해 정의/절차/실제 조건 구간을 다시 읽었다. 별도 source run `20260927-double-blind-concept-source-reviewed-v1`에 신규 정의·기밀 실행 영역과 전체 절차의 차이·양자 코드 승인·하드웨어 신뢰 조건과 기존 실제 실험 조건을 묶은9검토 사실을 저장했다. PDF 생성일을 발표일로 바꾸지 않는다. 두 원문은 다음과 같다.

- [Google DeepMind 발표](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)
- [Double Blind Evals 기술 보고서](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/piloting-the-worlds-first-double-blind-ai-evaluations/double-blind-evaluations-technical-report.pdf)

신규 원본 path는 `Knowledge/AI Systems/Double-Blind AI Evaluation.md`, concept ID는 `double-blind-ai-evaluation`, 독자 label은 이중 블라인드 AI 평가다. 정확한 별칭은 `Double Blind Evals`와 한국어 표현이며 일반적인 임상 이중맹검·회사의 이름·제품명은 추가하지 않는다. `map_review.kind:evaluation`, 생성/수정/검토일2026-09-27, confirmed connections와 typed relations는 빈 배열이다. 기존 Agent Evaluation을 대체하거나 연결 선을 임의로 추가하지 않는다.

독자 정의는 “평가자의 시험 문제와 모델 제공자의 가중치를 서로 공개하지 않은 채, 검증한 기밀 실행 환경에서 모델을 시험하도록 설계한 평가 방식이다.”다. 설명은 실행 소프트웨어 검증과 양자 승인, 실제 Gemini 2.5 Flash Lite/AILuminate AIRR1.4/H100/PySyft 조건을 구분한다. 실제 시범의 독점 메서드와 Google 인증 경로도 원문에 귀속해 설명한다. 상용 제공·모델 점수 개선·절대적인 보안 보장은 추가하지 않는다.

### 32.3 실제 로컬 추론과 최종 편집

`20260927-double-blind-new-concept-draft-v1`은 실제 설치 Qwen3.8:27b를 한 번 호출했다. Ollama0.34.4, 기존 digest, think:false, context16384, output limit4096, temperature0, call timeout300초다. 실제 wall242.603초, prompt5824tokens, output1500tokens였다. 8영역 JSON과 형식 검사 problems:[]는 성공했지만 의미 검토에서는 다음 수정을 했다.

- 보고서의 `burned into chip`을 비밀 숫자 ‘소각’으로 번역한 표현을 제거했다. 필요한 키/인증서 신뢰 조건으로 설명을 정리했다.
- 비공모 조건을 절대적인 기밀성·진실성 보장처럼 읽히게 하는 문장을 정정했다.
- 매 문단의 보고서 주체 반복을 줄이고 정의·절차·실제 예시·실행 조건을 구분했다.

원 요청/응답과 모델 draft는 그대로 보존한다. 최종12섹션 원고는 직접 대조한 별도 승인 전문으로 저장하며 `model-prose-review.json`에 변경 사유를 남겼다. 이는 독립 사람 gold나 무인 발행 합격이 아니다.

실제 파일과 승인 run은 private 루트 `.local/research/local-ai/` 아래에 있다.

| 입력/결과                 | 위치                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ |
| v2 작성 입력              | `double-blind-concept-draft-input-20260927-v1.json`                            |
| 모델 원고/프롬프트/설정   | `runs/20260927-double-blind-new-concept-draft-v1/knowledge-draft.json`         |
| 최종 노트 검토 입력       | `double-blind-concept-note-review-20260927-v1.json`                            |
| 생성 승인                 | `runs/20260927-double-blind-new-concept-approved-notes-v1/approved-notes.json` |
| 명시적인 기사 배정 승인   | `runs/20260927-double-blind-concept-linked-editorial-v4/approved-article.json` |
| 기사/용어 검토 provenance | 해당 승인 run의 `concept-assignment-review.json`, `model-prose-review.json`    |
| 완료된 전체 사본/대조     | `runs/20260927-double-blind-new-concept-private-site-v2/preview-manifest.json` |
| 환경 문제로 중단된 재생성 | `runs/20260927-double-blind-new-concept-private-site-v3/preview/state.json`    |

이전 기사 승인본은 수정하지 않았다. 새 article review는 같은 event ID·제목·본문·발표일에 concept_ids를 명시한다. 첫 v3 입력에서 과거 개념 색인 문단을 다시 쓰려 하자 현재 ancillary 계약의 `content:없음` 관문이 거부했다. 그 입력을 보존하고 v4에서는 기존 생략 계약을 유지한 채 기사 전문용어 태그와 노트 이력으로 연결했다. 검증기를 완화하지 않았다.

### 32.4 실행 명령과 재개

다음 명령은 위에서 실제 검토한 private 입력을 대상으로 실행한 것이다. 동일한 구현/입력/원문/모델 digest일 때 작성 checkpoint를 재사용하며, 코드/입력이 달라지면 새 run을 사용한다. 기존 v1 approval의 reader 호환과 모델 draft의 implementation fingerprint 재사용은 서로 다른 계약이다.

```bash
npm run research -- knowledge-draft \
  --run 20260927-double-blind-new-concept-draft-v1 \
  --review .local/research/local-ai/double-blind-concept-draft-input-20260927-v1.json

npm run research -- note-review \
  --run 20260927-double-blind-new-concept-approved-notes-v1 \
  --review .local/research/local-ai/double-blind-concept-note-review-20260927-v1.json

npm run research -- approve \
  --run 20260927-double-blind-concept-linked-editorial-v4 \
  --review .local/research/local-ai/runs/20260927-double-blind-concept-linked-editorial-v4/editorial-review.json
```

완료된 `preview`에는31절/30절까지의 기존9개 기사 승인과 DeepMind의 새 v4 기사 승인, 기존4개 노트 승인 run과 신규 생성 승인 run을 각각 한 번씩 전달했다. 이전 DeepMind 기사 v2와 새 v4를 함께 넣지 않는다. 정확한 전체 입력 목록은 v2 preview manifest의 approved_runs/knowledge_runs와 CLI 로그 `double-blind-new-concept-private-site-20260927-v2.log`에 보관했다. 같은 입력의 재개는 해당 CLI 인수를 그대로 사용하고 source/renderer/output SHA를 재검사한다.

### 32.5 생성·보존·실제 읽기 결과

처음 사본 v1은 신규 개념이 canonical 색인에 없어서 authoring validate가 실패했다. 해당 사본·로그를 보존하고 navigation projection을 보강한 새 v2를 생성했다. v2가 workspace→refresh→knowledge-sync→knowledge-check→validate→build→verify→consistency→outputs의9단계를 완료했다. 경로의 wiki 구분 문자 검사를 추가한 뒤의 v3는 첫3단계 이후 knowledge-check 상태 저장 중 `ENOSPC`로 종료됐다. v3의 stage 상태는 running으로 남았으며 완료 manifest가 없다. 실패한 사본을 삭제하거나 성공으로 바꾸지 않았다. 공간·잠금·입력/원문 SHA와 구현 fingerprint가 동일한 경우에만 재개한다. 이후 코드가 바뀐 경우에는 기존 실패 증거를 보존하고 새 run으로 생성한다.

| 확인 대상        | 실제 결과                                      | 의미                                               |
| ---------------- | ---------------------------------------------- | -------------------------------------------------- |
| 전체 사이트 입력 | 승인10기사·과거8회차·12노트·원 source437파일   | 새 회차/일일 운영 횟수가 아님                      |
| 생성 출력        | public278파일·digest132파일                    | 사본의 로컬 생성과 링크 검증                       |
| 기존 RSS         | GUID/pubDate40개 보존                          | 과거 수정이 새 RSS 회차가 되지 않음                |
| 지도             | 전문용어17·연결17; 신규 용어의 degree0         | 관계를 강제로 늘리지 않음                          |
| 기사 연결        | 고정 event → 새 term의 editorial assignment1개 | 이름 공동 등장에 의존하지 않는 연결                |
| 원본             | 작성181파일과 원 RSS unchanged                 | 새 노트·색인·수정 기사는 private 사본에만 존재     |
| 기존 승인        | 4개 v1 run의11노트 재읽기 통과                 | schema/fingerprint/원문 검사를 유지                |
| 전체 Node        | `npm test`:388pass                             | 실제 의존 경로와 회귀 테스트                       |
| Python           | private venv unittest:35pass                   | worker/Drive preparation 회귀; 원격 쓰기 증거 아님 |
| TypeScript       | `npx tsc --noEmit`:pass                        | 타입 검사                                          |

브라우저는 검증 전용 Chrome 탭과 완료된 v2 사본 서버를 사용했다. v3에는 독자 출력이 생성되지 않아 bytes 대조나 브라우저 검증을 수행하지 않았다. 기사1280×900, 용어390×844의 실제 스크린샷을 읽었고 횡스크롤이 없었다. 모바일 용어 본문은17px였다. Enter로 새 #태그를 선택해 정의·범위·실제 사례를 확인했다. empty 관련 개념 섹션은 숨겨졌고, 변화 이력의8월27일과 용어 작성일9월27일이 분리됐다. 아래 지도까지 스크롤하자 lazy load 후 관련 뉴스1건과17용어/17연결이 나타났다. 관련 기사 이동·뒤로 가기·원 브리핑 이동·AI 분야 URL `?sector=AI`도 실제로 확인했다. 기사와 브리핑에는 canvas가 없고 빈 심층 탭도 없었다. 검증 후 viewport를 reset하고 소유한 탭·서버만 종료했다. 스크린샷은 도구 응답으로 열람했고 별도 이미지 파일로 저장하지 않았다.

원문·approval·생성·브라우저·보호 파일 결과는 private `new-concept-verification-20260927-v1.json`에 따로 기록한다. generator의 browser_verified:false는 별도 실제 browser 관측과 구분해 보존한다. preview manifest를 후행 검사로 덮어쓰지 않는다.

### 32.6 다음 구현과 완료 경계

다음 조사 대상은8월28일 회차의 PPE 원문 v1과 학생 RCT다. 최초 논문 판본과 이후 정정, 전문의 실험 조건, 공식 발표일을 확인한 뒤 나머지7미결 사건/92구형 회차/의존 지식의 전체 재검토를 계속한다. source 세부 어댑터·실제40dev/20heldout·원격 인증/보관/재읽기·단일08시 통합·서로 다른 신규7회·첫 실제 공개 발행도 남아 있다.

이번 코드·원고·문서·비공개 검증은 commit/push/Drive write/배포/예약 변경을 수행한 결과가 아니다. 전체 목표는 계속 진행 중이다.

## 33. 논문 수식 보존과 PPE 원문 작성 검증

2026-09-27~28 누적 구현과 private 실행 결과다. 이번 상세 문서 보강에서는 실제 코드·설정·아래 저장 결과를 다시 대조하고 모델 metadata를 읽었다. 문서 갱신 자체를 새 크롤링·추론·기사 승인·Drive 쓰기·발행으로 계산하지 않는다.

### 33.1 변경 파일과 책임

| 파일                                     | 실제 구현                                                     | 검증하는 경계                                  |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| `integrations/research-worker/worker.py` | 저자 TeX/MathML 보존·원 DOM 위치/직렬화 SHA·미해결 품질·h5/h6 | 원문 bytes를 변경하지 않는 HTML parse          |
| `data/research-acquisition.json`         | PPE v1 지정 article/제목/저자/본문/표/그림 설명 profile       | 전체22profile; v2로 확장 매칭하지 않음         |
| `scripts/research/claims.mjs`            | 미해결 수식 표지를 인용한 claim 차단                          | partial 문서의 다른 정상 문장은 계속 검토 가능 |
| `tests/test_research_worker.py`          | 수식·namespace·복합 base·scope·실제 profile 회귀7개 추가      | 이전 실패를 재현한 뒤 보존 규칙 확인           |
| `tests/research-runtime.test.mjs`        | 미해결 quote 차단 회귀1개 추가                                | 구조 통과와 의미 검토를 구분                   |

전체 구조와 정확한 지원 범위는 [수집 명세20](SOURCE_ACQUISITION_SPEC.md#20-html-수식의-보존과-논문-근거-범위)를 따른다. 제한된 presentation 직렬화를 수학 계산 엔진·PDF 수식 OCR·완전한 MathML 의미 해석으로 소개하지 않는다.

### 33.2 원문 identity와 재파싱 결과

기존 사건은 `068cf5b2747d434f`이며 원 회차는2026-08-28이다. 최초 arXiv v1의 원 발표일은2026-08-26, 현재 검토일은2026-09-28이다. 지정 원문을 고정 bytes로 보존하고 새 worker/profile 해시의 parse ID를 생성했다. 기존 generic parse나 후속 v2를 덮어쓰지 않았다.

| 항목          | 지정 초록                                                          | 지정 HTML                                                          |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| URL           | `https://arxiv.org/abs/2608.26088v1`                               | `https://arxiv.org/html/2608.26088v1`                              |
| source ID     | `d1b32b09b218e5079a21`                                             | `930d3c34470b6c431b07`                                             |
| 원문 SHA      | `45ecc5d6292efe7812186bb76aef9f3bae97d6bec5bd805a3e976635f220009b` | `a582ffef836185b3c79b19cf14fb914ecd9add9842cd5d3271124630cffcfaf3` |
| 새 parse ID   | `b75ec8dbab9159c193462d0e20f5f2de4380b99b027d19b9f455dc760596b0dc` | `ca390923a9bf5378343c0bac716ce781fb1e01c07f3036069b466267164057ea` |
| blocks        | 11                                                                 | 323                                                                |
| MathML/미해결 | 0/0                                                                | 110/0                                                              |
| 추출 발표일   | 2026-08-26                                                         | null                                                               |

위 출력은 `20260928-ppe-mathml-profiled-source-v2`의 `documents.json`, `parses.json`에 있다. 고정 원문 재생과 보관 근거 검사를 통과했다. 수식110개·미해결0개는 표기 보존 결과이며 수학적 타당성을110번 독립 검증했다는 뜻이 아니다. HTML에 없는 발표일은 abs의 확인된 기록으로 연결한다.

### 33.3 직접 읽은 범위와 작성 입력

`20260928-ppe-source-reviewed-editorial-v1`에는 원문 방법·결과·표·시험 조건·선택한 부록을 직접 대조한8개 사실을 저장했다. 중요한 수치와 조건은 해당 block을 개별적으로 다시 읽었다. 그래픽 형태의 부록 prompt와 모든 그림을 OCR한 결과로 표시하지 않는다. 제한된 실제 읽기 범위·판본·상충 확인은 `direct-source-review.json`에 비공개로 남긴다.

최종 원고에 필요한 정보는 연구 주체/공개일, 질문에서 자료 선택·구성·예측까지의 흐름, 사용 자료와 고정 embedding, 목표 정보 누출 검사, 학습 자료만 사용하는 결측값 처리, 지표/분모/baseline/학습·시험 분할이다. 수치가 나온 표와 다른 문장의 비교 조건을 섞지 않는다. 확인하지 않은 사업화·제품 제공·새 지역 일반화 판단은 집필 입력에 넣지 않았다.

이8개 사실은 Codex의 source-first 직접 검토다. 로컬 모델이 자동 추출한8사실 또는 독립 사람 gold8건으로 집계하지 않는다. 현재 고정 개발 평가 세트11사례/71사실과 이 작성 입력도 별도 분모다.

### 33.4 실제 로컬 모델 작성과 정정

다음 명령을 실제 실행해 원 요청/응답을 보존했다.

```bash
npm run research -- draft --run 20260928-ppe-source-reviewed-editorial-v1
```

| 설정·측정                        | 실제 값                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| 모델/양자화                      | Qwen3.8:27b / Q4_K_M / 27.3B                                       |
| runtime                          | Ollama0.34.4; 기존 Qwen digest                                     |
| think/context/output/temperature | false / 16384 / 4096 / 0                                           |
| 호출 timeout                     | 300000ms                                                           |
| 실제 wall                        | 173042ms                                                           |
| 입력/출력 token                  | 2030/1222                                                          |
| 호출 수                          | 1                                                                  |
| 최초 draft ID                    | `1b3db26152da9ebf99a27ba7840373a9c9dac419b6506fc05ef705f96719b62f` |
| 최초 검사                        | `entity_translation_requires_review`                               |

기관 약어가 선택한 근거에 직접 들어 있지 않아 entity 관문을 통과하지 못했다. 해당 관문을 낮추지 않고 원문에서 기관의 정식명·약어가 명시된 별도 block을 확인해9번째 identity 사실을 추가했다. 최초 source run·8개 모델 입력·원출력은 유지한다.

새 private run `20260928-ppe-approved-editorial-v2`에서 제목과3개 설명을 직접 정정하고 실제 correction 명령을 실행했다.

```bash
npm run research -- correct \
  --run 20260928-ppe-approved-editorial-v2 \
  --review .local/research/local-ai/runs/20260928-ppe-approved-editorial-v2/correction-input.json
```

정정 draft ID는 `38d66d64232c4d917f20760a517dba246b066a4ce867e49703747ae70967ee38`, 구조/작성 검사 problems는 빈 배열이다. `previous_draft_id`, correction input SHA와 review를 저장한다. 새 모델 호출 없이 원출력의 직접 정정본을 만들었으며 ordinary 사건 뉴스다. 분석 문단과 심층 tab을 추가하지 않았다.

**현재 최종 기사 승인은 없다.** 이 run에 `editorial-review.json`과 `approved-article.json`이 없음을 문서화 시 다시 확인했다. 이름의 `approved`, 구조 검사 통과, 소급 검토 입력 존재는 최종 승인·사이트 반영·공개 발행을 대신하지 않는다.

### 33.5 테스트·환경 실패와 검증 명령

수식 보존의 최초 회귀는 실제로 실패한 뒤 수정했다. 이어 compound base·explicit 본문 scope·h6/profile·미해결 quote를 추가했다. 기존 테스트를 삭제하거나 기대값을 약화하지 않았다.

| 실행 기록                                 | 실제 결과                   | 해석                                        |
| ----------------------------------------- | --------------------------- | ------------------------------------------- |
| `mathml-red-20260927-v1.log`              | 새 수식 회귀 실패           | 수정 전 손실의 재현                         |
| `mathml-green-20260927-v1.log`, `-v2.log` | 집중 회귀 통과              | 제한된 표현·scope 보존                      |
| `mathml-claim-red-20260928-v1.log`        | 새 quote 차단 회귀 실패     | 미해결 인용의 기존 검증 공백                |
| `mathml-claim-green-20260928-v1.log`      | 집중 Node 회귀 통과         | 근거 차단과 정상 문장 사용                  |
| `mathml-python-tests-20260927-v2.log`     | 42개 실행 중 error4         | 임시 디렉터리 생성의 ENOSPC; 실패 증거 보존 |
| `mathml-python-tests-20260928-v3.log`     | 42pass,20.086초             | worker32 + prepare-drive3 + drive-sync7     |
| `mathml-final-node-tests-20260928-v2.log` | 389pass,45suites,fail/skip0 | 전체 Node 회귀                              |

같은 수정의 Python 전체 검증은 사용 가능한 저장공간을 다시 확인한 후 성공했다. 사용자 자료·원문·실패 사본을 삭제해 공간을 만들지 않았다. ENOSPC를 파서 정확성 실패로 합산하지 않으며 성공 로그로 이전 실패를 덮어쓰지도 않는다.

위 최종 로그에 해당하는 재검증 명령은 다음과 같다. 문서 갱신만 한 단계에서는 이를 새로 실행한 코드 시험으로 보고하지 않는다.

```bash
npm test
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

이 묶음의 PPE 최종 사본 build·browser·RSS/digest 비교는 아직 실행하지 않았다. 이전 신규 용어 사본의 [32.5절](#325-생성보존실제-읽기-결과) 검증을 PPE 결과로 승계하지 않는다. TypeScript의 이전 pass도 날짜별 기록과 구분한다.

### 33.6 문서 검증과 다음 재개 위치

33절 작성 당시의 상세화는 시스템17·수집20·계획19.12와 이 절에 연결했다. 기존 README와 실행/복구 계약을 유지하며 당시 일반 기사 논문 ID 전달의 코드 공백과 정확한 다음 입력을 명시했다. 문서 수정 전6개 파일과290개 보호 파일의 SHA를 private `documentation-detail-20260928-v1/`에 보존했다. 내부 링크·fragment·JSON 예시·요구사항/WBS·코드/원고/RSS 보존·diff 검증 결과는 그 폴더의 `validation.json`과 최종 `validation-v2.json`에 기록한다. 후속 코드 반영과 현재 지원 계약은34절을 따른다.

이 절의 원래 다음 작업 중 optional 논문 참조의 코드·회귀는 아래34절에서 수행했다. 당시의 PPE 최종 기사 승인 → 의존 지식 정정 → 새 전체 preview·실제 독서·채널 대조는 [35절](#35-ppe-기사과학-발견-용어출처-표기의-실제-통합)에서 수행했고 private 미결은7에서6으로 줄었다. 이어 학생 RCT와 나머지 미결 사건,92구형회차/801구간·전체 용어/관계·출처 상세/첨부/페이지 종료·독립40dev/20heldout·Drive·단일08시·서로 다른 실제 신규7회·첫 새 경로 공개 발행을 계속한다. 이 절의 원래 시험 결과는 이후 단계와 합산하지 않는다.

현재 문서 갱신은 commit/push/배포·Drive 쓰기·예약 변경·memory 갱신을 수행한 결과가 아니다. 전체 구현 목표의 active 상태를 유지한다.

## 34. 일반 기사의 논문 참조 승인과 개발 인계

기준일2026-09-28. 이 절은 이미 존재하는 코드·시험 로그를 현재 문서와 대조한 기록이다. 상세 문서 보강 단계에서는 구현 코드·작성 원본·모델 초안·승인 자료를 수정하지 않는다. 논문 참조 코드의 구현 결과와 그 이후 실제 기사/원격 전환의 미완료 상태를 구분한다.

### 34.1 실제 변경 위치와 공개 출력

| 파일                                                                                    | 현재 책임                                                                         | 호환·공개 경계                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [deep-dive.mjs](../scripts/research/deep-dive.mjs)                                      | `articlePaperReviewSchema`, `assertArticlePaperReview`, `publicPaperMetadata`     | 일반 참조는 별도 검토; 기존 심층의 필수 근거/역할은 유지              |
| [publish-adapter.mjs](../scripts/research/publish-adapter.mjs)                          | ordinary 기사 승인에서 optional `review.paper_review`를 읽고 `record.papers` 생성 | 입력 부재는 이전 출력; null/잘못된 객체는 오류; deep와 동시 입력 거부 |
| [research-paper-reference.test.mjs](../tests/research-paper-reference.test.mjs)         | 실제 함수·projection·CLI 승인·재읽기와 실패 회귀6개                               | 가상 원문/사실 fixture이며 실제 PPE의 의미 검토 증거가 아님           |
| [research.mjs](../scripts/research.mjs), [preview.mjs](../scripts/research/preview.mjs) | 기존 `approve` 호출과 `loadCurrentApproval`의 bytes/parse·승인 결과 재계산        | 이번 기능을 위한 별도 발행기나 새 명령을 추가하지 않음                |

공개 paper 레코드는 아래5개 필드다. 내부 `scope`, source version/parse/claim ID, 검토자·checks·출판 근거의 내부 version ID는 복사하지 않는다. `evidence_url`은 해당 기사가 실제 사용하는 정확한 원문 URL이며 독자가 그 판본으로 이동할 수 있어야 한다.

```json
{
  "work_id": "fixture-paper",
  "identifiers": ["arxiv:2609.12345v1"],
  "access": "전문",
  "status": "사전공개",
  "evidence_url": "https://arxiv.org/html/2609.12345v1"
}
```

이 JSON은 가상 출력 예시다. 실제 article record의 `papers` 배열에 같은 형태가 들어간다. 논문 식별자를 담기 위해 기사 kind·topic·analysis를 추가하지 않는다. [계획19.12.2](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19122-일반-기사-논문-참조의-승인-입력)에 현재 내부 입력 구조와 검사를 기록했다.

### 34.2 승인과 재읽기의 검사 순서

1. 기존 CLI가 원문 bytes·source version·parse·블록 근거를 `assertStoredEvidence`로 대조한다. 스키마 모양만 맞는 파일을 수집 성공으로 받아들이지 않는다.
2. 일반 원고의 구조·검토 사실 참조·날짜·수치·editorial review를 기존 경로에서 확인한다. 원문 내용을 읽었다는 검토자의 판단과 구조 검사 결과는 분리한다.
3. `paper_review`가 있으면 strict schema를 검사한다. reviewer/날짜, 논문1~20개, 고정 work ID, 중복 없는 ID·claim, 알려진 필드와 true인 검토 체크를 요구한다.
4. 지정 document와 parse가 같은 source/version을 가리키는지 검사한다. URL은 그 document의 original URL과 같아야 하고 각 연결 claim은 최종 원고에서 실제 사용해야 한다.
5. 접근 범위·원문 식별자·arXiv 판본·출판 근거·검토일 순서를 검사한다. 전문으로 표시할 수 없는 누락을 기본값으로 없애지 않는다.
6. 공개5필드를 기존 `papers`에 변환한다. 일반 기사에 불필요한 심층 섹션이나 운영 설명을 만들지 않는다.
7. 저장된 승인 재읽기에서 같은 입력을 현재 코드로 계산해 `approved-article.json`과 비교한다. 입력 또는 승인 출력의 변조가 있으면 과거 승인이라는 이유로 사용하지 않는다.

checks의 true는 원문·접근 범위·출판 상태를 검토했다는 진술이다. 프로그램은 그 선언과 검증 가능한 위치/ID를 대조하지만 인용문이 주장을 모두 지지하는지, 별도 출판 문서가 동료심사 상태를 실제 증명하는지는 원문 읽기에서 확인한다. 이6개 회귀나 임의의 모델 자기 평가가 의미 검토를 대신하지 않는다.

### 34.3 실제 회귀·호환 증거와 한계

| 검증                 | 보존한 실제 결과                                                    | 확인한 범위                                                          |
| -------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 수정 전 회귀         | `paper-reference-red-20260928-v2.log`, exit1                        | 이전 adapter가 검토된 ordinary 논문 metadata를 `[]`로 잃는 사례 재현 |
| 새6개 회귀 포함 집중 | `paper-reference-focused-20260928-v1.log`,36pass                    | 일반 참조·초록/전문·버전/날짜/근거·출판 증거·실제 CLI/변조·기존 심층 |
| 전체 Node            | `paper-reference-node-tests-20260928-v1.log`,395pass/45suites/fail0 | 현재 전체 Node 회귀; 실제 새 서비스 발행 검증은 아님                 |
| TypeScript           | `paper-reference-typecheck-20260928-v1.log`,exit0                   | 현재 타입 검사                                                       |
| 기존 실제 승인       | 기존10개 승인 run을 `loadCurrentApproval`로 다시 읽어 일치          | 세 심층과 일반 기사들의 이전 승인 출력·원문 bytes/parse 호환         |
| 문서 보강의 재확인   | `documentation-detail-20260928-v2/current-readback.json`            | 설치 모델 metadata·승인10개 읽기; 새 추론·승인·원격 쓰기 없음        |

최초 red/green 시도의 fixture 구성 오류는 별도 로그로 보존했다. 이를 수정 전 기능 공백의 재현 증거로 쓰지 않는다. 실제 red-v2는 보관한 이전 adapter로 동일 요구를 실행한 결과다. 기존 구현 파일을 되돌리거나 기존 승인 파일을 재작성해 검사를 통과시키지 않았다.

이 단계에 Python 코드를 새로 변경하지 않았으므로 이전 MathML 단계의42개 Python 시험을 새로운 paper reference 시험으로 합산하지 않는다. PPE의 최종 approved article, 새 전체 사이트 생성·브라우저·RSS/digest 대조·Drive·공개 배포 결과도 아직 이 검증에 없다.

관련 검증 명령은 다음과 같다. 문서만 수정한 단계에서 아래 명령을 새로 실행하지 않았다면 실행했다고 보고하지 않는다.

```bash
node --test tests/research-paper-reference.test.mjs tests/research-deep-dive.test.mjs tests/research-review.test.mjs tests/editorial.test.mjs
npm test
npx tsc --noEmit
```

### 34.4 실제 자료를 통합할 다음 입력과 산출물

다음 코드/자료 작업은 PPE의 기존 `068cf5b2747d434f`에 적용한다. 원래 발표일2026-08-26과 기존2026-08-28 회차는 별개다. private 정정본·9검토 사실·고정 v1 abs/html bytes와 parse·retrospective review를 재사용하고 승인 metadata만 새 run에 기록한다.

| 순서 | 입력                             | 수행할 검토/작업                                          | 완료 산출물                                                          |
| ---- | -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| 1    | PPE 정정본·사용 claim9·원문 v1   | 리드·3설명·수치 조건·INRB 주체를 원 위치에서 재대조       | 최종 editorial review와 판본/전문 참조 검토                          |
| 2    | 1의 결정·기존 source/parse       | 현재 approve 경로·승인 재읽기                             | 같은 사건 ID의 새 private approved article, 공개 paper5필드          |
| 3    | science 노트·해당 사건 의존 목록 | PPE 이력 날짜와 근거, 노트의 다른 정의/관계 원문 확인     | 명시 범위의 검토 노트/관계·이력; 부분 근거로 전체 노트 승인하지 않음 |
| 4    | 기존10기사/12노트 승인 + 새 승인 | 중복 사건 승인 제거, fresh 전체 preview                   | 기사·등장 브리핑·용어·검색·RSS·digest의 일치와 고정 identity 대조    |
| 5    | 4의 실제 화면/파일               | desktop/mobile·원문/용어 링크·탭·키보드·뒤로가기·공유 URL | 새 결과만을 가리키는 실제 독서 영수증                                |

source/version/parse와 기관·조건을 확인할 수 없는 내용을 쓰지 않는다. 설명·분석·전문용어를 채우기 위해 허용되지 않은 추론을 넣지 않는다. 기존 science 정의 전체를 교체한다면 Nature/Anthropic 등 그 노트의 다른 원문도 확인해야 한다. 프로젝트 이름 PPE를 지도 노드로 강제하지 않는다.

예전 실패 preview는 보존한다. 현재 코드 fingerprint가 달라진 실패 run을 무리하게 이어 쓰지 않고 새 입력 manifest와 새 run으로 생성한다. 실제 통합 전에는 기존10기사/8과거회차/12노트와 private 미결7개 수를 그대로 유지한다.

### 34.5 전체 개발 재개의 순서

1. 위 PPE 묶음과 나머지 미결 사건을 원문부터 판정한다. blocked·발표일 미확인·정상 새 소식 없음은 구분한다.
2. 구형92회차/801구간을 사건별로 검토하고 모든 등장 회차·의존 용어/Signals/주제/관계를 정정한다. 구간 수를 고유 사건 수로 사용하지 않는다.
3. [출처19.5~19.7](SOURCE_ACQUISITION_SPEC.md#195-출처-확장의-실행-순서와-활성화-판정)의 상세/첨부/목록 종료·실패 이월·표/OCR·예산을 실제 경로와 시험으로 확장한다.
4. 직접 작성한11개 기준 사례와 독립 human gold를 구분하며 실제60자료를40개발/20보류로 평가한다. 핵심 사실·한국어·놓친 중요 사건·출처 다양성과 처리량을 함께 확인한다.
5. Drive의 실제 인증·쓰기·재읽기·hash/parent·충돌·복구와 기존08시의 단일 실행을 연결한다. Drive API의 [업로드 방식](https://developers.google.com/workspace/drive/api/guides/manage-uploads)은 구현 근거로 쓰되 API 문서 열람을 인증/업로드 성공으로 세지 않는다.
6. 서로 다른 실제 신규7회 비교와 새 경로 첫 공개 발행을 검증한다. 과거 회차 사본·같은 회차 재실행·기존 경로 배포를 새 경로 운영 성공으로 합산하지 않는다.

전체 작업의23개 WBS·선행 조건·완료 증거는 [구현 계획](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md)에 유지한다. 상세 문서 완성과 로컬 코드의 일부 구현을 전체 서비스 전환 완료로 보고하지 않는다.

### 34.6 상세 문서 자체의 검증

현재 보강한6개 파일의 변경 전 사본과986개 보호 파일의 SHA는 private `documentation-detail-20260928-v2/`에 있다. 문서 AST로 로컬 링크341개·제목 fragment179개·JSON 예시14개·WBS23개·요구사항18개를 검사했다. 일반 논문 검토 예시는 현재 schema로, 공개 paper 예시는 현재5필드 변환으로 확인했다. 기존 모든 문서 heading을 유지했고 기존10개 승인을 다시 읽었다.

보호986개 파일과 작성 원본181개의 SHA, RSS40개의 GUID/pubDate는 불변이다. README/시스템 문서 전체와 나머지 추가·수정 범위의 formatting은 통과했다. SOURCE/PLAN/RUNBOOK/상태 파일의 기존 전체 formatting 경고는 보강 전후 모두 존재하므로 새 범위 통과와 구분했다. `git diff --check`도 통과했다. 상세 문서 작업에서 코드 시험·추론·실제 자료 승인·Drive 쓰기·배포를 새로 수행했다고 보고하지 않는다.

첫 `validation.json`, 최종 `validation-v2.json`, 문서 변경 `changes.patch`를 같은 private 폴더에 보존한다. 최종 영수증은 마지막 문서 hash와 함께 보관하며 외부 공개·원격 운영의 증거로 사용하지 않는다.

## 35. PPE 기사·과학 발견 용어·출처 표기의 실제 통합

### 35.1 현재 결과와 상태의 경계

2026-09-28 기준 PPE의 최종 일반 기사와 기존 science 노트를 비공개 사본에 통합했다. 기사 ID `068cf5b2747d434f`, 최초 논문 v1 발표일2026-08-26, 원래2026-08-28 브리핑 회차, concept ID `science`와 기존 경로를 유지했다. 심층 분석·전망을 추가하지 않았다. 신규 전문용어 등록이 아니라 기존 노트의 원문 재검토다.

최종 run은 `20260928-ppe-science-integrated-private-site-v3`다. 승인11기사·8과거회차·13노트, source437파일, public278파일, digest132파일이다.9생성 단계가 모두 완료됐고 RSS40 GUID/pubDate와 모든11기사의 웹·브리핑·RSS·digest 요약/출처를 대조했다. 지도는17노드/17선이며 science는 지도 제외를 유지한다.

권위 원본181개의 bytes, 기존87사건의73 verified/14 unreviewed는 바꾸지 않았다. 이 실행의 추가 비공개 판정은 PPE1건이고 누적8건이며 잔여6건이다. 완성한 과거 사본8개를 신규 일일 운영8회로 계산하지 않는다. 독립 사람 gold0과 기존 개발 사례11개/71사실/15URL도 그대로다.

### 35.2 입력·승인 파일과 근거 범위

실제 파일의 경로는 모두 `.local/research/local-ai/` 아래다. public 저장소에 원문 capture·검토 이유·정정 전 전문·모델 request/response를 넣지 않는다.

| run 또는 경로                                           | 입력·산출물                                                                                         | 확인한 내용                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `runs/20260928-ppe-mathml-profiled-source-v2/`          | documents.json·parses.json                                                                          | 고정 abs/html v1;11/323구간;HTML 수식110·미해결0;최초 날짜는 abs의8월26일                       |
| `runs/20260928-ppe-source-reviewed-editorial-v1/`       | draft.json·모델 호출 기록                                                                           | 실제 Qwen3.8:27b 한 호출173.042초·입력2030/출력1222토큰·think=false;원출력 기관 검토 오류 보존  |
| `runs/20260928-ppe-approved-editorial-v2/`              | 정정 draft·9 reviewed claims                                                                        | 직접 원문 사실을 추가한 정정본;이 run 자체는 최종 승인 전 상태 유지                             |
| `runs/20260928-ppe-paper-linked-editorial-v3/`          | 실패한 승인 입력/로그                                                                               | retrospective packet과 reviewer가 달라 거부;검사를 완화하지 않음                                |
| `runs/20260928-ppe-paper-linked-editorial-v4/`          | editorial-review.json·approved-article.json                                                         | 동일 검토자의 일반 기사 논문 참조 승인;science 연결 전 중간 기록                                |
| `runs/20260928-ppe-science-linked-editorial-v5/`        | 최종 editorial-review.json·approved-article.json                                                    | 명시 concept_ids=[science];같은9사실·같은 정정 draft;새 모델 호출 없음                          |
| `runs/20260928-science-definition-primary-v1/`          | 원문2개·parses·claims·reviewed-claims                                                               | Nature191구간·Anthropic92구간 중 실제 사용4사실 직접 검토;자동 추출/독립 gold 아님              |
| `runs/20260928-science-ppe-dependent-notes-v2/`         | before.md·replacement.md·history-review.json·review-input.json·note-review.json·approved-notes.json | science 정의·원리·관련 개념·최근 변화 전체 교체 승인;이전 이력과 제거한 일반화는 private로 보존 |
| `runs/20260928-ppe-science-integrated-private-site-v3/` | preview/state.json·preview-manifest.json·preview-workspace                                          | 기존10기사/12노트와 새 승인1기사/1노트를 결합한 최종 전체 결과                                  |

PPE는 [고정 v1 제출 기록](https://arxiv.org/abs/2608.26088v1)과 [고정 v1 전문](https://arxiv.org/html/2608.26088v1)을 사용한다. 최신 v2의 수정 내용을 과거 발표의 결과로 섞지 않는다. HTML 전문의 날짜가 null인 상태를 현재 날짜로 채우지 않는다.

science에는 [AlphaFold 논문](https://www.nature.com/articles/s41586-021-03819-2)의 입력·CASP14·학습 목표와 [Anthropic 원문](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)의 에이전트 설명을 확인했다. 정의/비교에 사용한 실제 구간은 각각2·6·35와8이다. 범용 파서가 모든 목록 문장을 보존했다거나 두 페이지의 사건 날짜까지 검증했다고 표현하지 않는다.

### 35.3 일반 논문 기사와 용어의 공개 계약

PPE의 리드는3문장이고 설명은 질문→예측 모델, 통계·위성영상 특성 구성, 목표 정보 누출 검사·시험 조건의3개다. LLM 조정과 실제 예측 모델의 역할을 구분하고 CDC의 평균 R²·21지표·학습/시험80:20 조건을 함께 전달했다. 원문의 수치와 서로 맞지 않는 증가율 문구·다른 공간 조건의 결과·근거 없는 전망은 사용하지 않았다.

기사에 분석 문단을 넣지 않았으며 공개 `record`에도 `analysis` 필드를 출력하지 않았다. `deep_context`를 만들지 않았고 논문 접근을 전문으로 승인해도 심층 기사로 강제하지 않는다. 최종 `record.papers`는 다음5필드뿐이다. 내부 scope·claim ID·검토 이유·source/parse SHA는 비공개 review에 둔다.

```json
{
  "work_id": "ppe-2608-26088",
  "identifiers": ["arxiv:2608.26088v1"],
  "access": "전문",
  "status": "사전공개",
  "evidence_url": "https://arxiv.org/html/2608.26088v1"
}
```

science는 같은 `Knowledge/AI Systems/AI for Scientific Discovery.md`와 concept ID를 유지한다. 기존12섹션의 작성 계약을 따르고 단백질 구조 예측·지리공간 예측의 실제 예시와 평가 대상을 설명한다. 관련 에이전트 평가의 대비는 해석임을 표시하고 양쪽 원문을 연결한다. 회사·프로젝트명·일반어를 새 지도 노드로 등록하지 않는다.

PPE의 최근 변화는8월27일에서 최초 제출일8월26일로 정정하고 고정 뉴스 URL과 논문 v1을 연결했다. 근거를 재검토하지 않은 이전5개 이력 행은 새 노트의 분석 근거에서 제거하고 before/history-review에 보존했다. 그5개 과거 기사 자체의 최종 검토/공개 제외 판정은 아직 하지 않았다.

### 35.4 통합에서 발견한 출처 목록 결함과 수정

과거 회차의 일부 기사만 새 형식으로 교체할 때 adapter는 이전 Source List 전체를 계속 출력했다. PPE의 버전 없는 이전 URL이 본문에서 사라져도 목록에 남아 `unused Source List entries: [3]`로 전체 검증이 실패했다.

`publish-adapter.mjs`는 Source List를 붙이기 전의 최종 본문에서 실제 `[S번호]` 사용을 수집하고 해당 항목만 출력하며 `source_count`를 다시 계산한다. 기사뿐 아니라 남긴 누적 섹션에서 쓰는 인용도 포함한다. 기존 URL을 계속 인용하는 미검토 기사·누적 섹션은 보존한다.

미검토 기사 bytes를 유지하면 Source List에 S1·S2·S4처럼 간격이 생길 수 있다. 그 경우 부분 소급 원고에만 `source_marker_format: preserved-retrospective/v1`을 기록한다. Python 검사기는 아래 조건을 모두 요구한다.

- 날짜가 YYYY-MM-DD 형식이며2026-09-14보다 이전이다.
- `editorial_format`이 없고 `article_records`, `article_reviews`가 명시돼 있다.
- 남은 인용 번호가 양수·중복 없음·오름차순이다.
- 미정의 인용, 미사용 Source List, 중복 URL, source_count 불일치는 계속 오류다.

Node의 `extractArticles`·기존 partial 검사에서 실제 기사 ID/검토/본문 보존 계약을 추가 확인한다. Python의 frontmatter 존재 검사만으로 전체 의미 검증을 통과했다고 계산하지 않는다. 신규 회차와 전체 육하원칙 전환에는 S1부터 연속 번호를 계속 요구한다.

회귀는 `research-legacy-projection.test.mjs`에2개, `test_source_markers.py`에5개를 추가했다. 오래된 미사용 URL 제거·미검토 본문/S2 보존·새 S3·남긴 누적 인용의 보존과, 제한된 sparse 형식·기본 연속 번호·신규/전체 전환 거부·역순/중복/0·미정의/미사용 차단을 검증한다. adapter의 실제 수정 전 실패는 `ppe-source-prune-red-20260928-v1.log`에 있다.

### 35.5 실행 명령과 재현 결과

다음은 현재 구현의 검사 명령이다. worker 시험에는 프로젝트 격리 Python3.12 환경을 사용한다. 시스템 Python3.9에서 worker 의존성이 있다고 가정하지 않는다.

```bash
node --test tests/research-legacy-projection.test.mjs tests/research-projection.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_source_markers.py'
npm test
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npx tsc --noEmit
```

| 실행 결과                       | 로그                                                | 판정                                                                   |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Node 집중20pass                 | `ppe-source-prune-focused-20260928-v1.log`          | source pruning과 projection 회귀                                       |
| Python 집중5pass                | `ppe-source-markers-python-focused-20260928-v1.log` | sparse 계약의 허용/거부·인용 오류                                      |
| Node 전체397pass/45suites/fail0 | `ppe-integration-node-tests-20260928-v2.log`        | 현재 전체 회귀;skip0                                                   |
| Python 전체47pass               | `ppe-integration-python-tests-20260928-v1.log`      | worker·보관·source marker;skip0                                        |
| TypeScript exit0                | `ppe-integration-typecheck-20260928-v2.log`         | 타입 검사                                                              |
| private preview9단계 완료       | final run의`preview/state.json`                     | refresh·knowledge-sync/check·validate·build·verify·consistency·outputs |

완료된 run의 모델 출력·승인 입력·preview를 덮어쓰지 않는다. 재생성할 때는 새 run ID와 현재 manifest의11 approved_runs·6 knowledge_runs를 그대로 전달한다. `preview`는 `--approved-run`과 `--knowledge-run`을 각각 여러 번 받는다. 기존 승인 run의 재읽기에는 `loadCurrentApproval`, 노트에는 `loadNoteApproval`을 사용하며 이 과정은 모델을 다시 호출하지 않는다.

### 35.6 실제 독서 경로와 화면 검사

최종 v3 사본을 소유한 localhost8088 서버와 Chrome 전용 탭에서 직접 확인했다. desktop 기사 렌더링, Enter로 전문용어 태그→science, 최근 변화의 기사→같은 고정 뉴스, 기사→기존8월28 브리핑을 읽었다.390×844 CSS viewport에서 용어·뉴스·브리핑의 가로 overflow는0이었다.

브리핑 AI 탭을 Enter로 선택하면 `?sector=AI`가 붙고 선택 상태를 표시한다. 뒤로 가면 원 URL과 미검토 학생 기사 표시가 복구됐다. 뉴스·브리핑의 지도/빈 분석 섹션은0이고 과학 발견 노트도 지도 제외를 유지한다. 논문 링크는 abs/html의 정확한 v1이다. 독자 화면에 검토/발행 안내나 분석 생략 이유를 넣지 않았다.

viewport를 복구하고 생성 탭을 닫았다. 서버 PID46070의 cwd가 최종 v3 workspace임을 확인한 뒤 SIGTERM으로 종료했고 session60376 exit143을 확인했다. 사용자 프로세스·탭을 종료하지 않았다. 물리 모바일 기기나 원격 배포 검증은 아니다. generator의 `candidate_published`, `drive_verified`, `browser_verified`는 false로 유지하고 실제 관측은 별도 비공개 receipt에 보관한다.

### 35.7 실패 보존과 복구

| 시도                         | 실제 실패                                               | 조치                                                                     |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 기사 승인v3                  | reviewer와 소급 packet 불일치                           | 같은 검토 결정을 새 v4/v5에 기록;기존 packet/실패 보존                   |
| science note v1 + preview v1 | 범위의 필수 포함/포함하지 않음 표기와 미사용 이전 S3    | 원문 의미를 유지해 note v2의 작성 계약을 보완하고 실제 adapter 결함 수정 |
| preview v2                   | 부분 소급의 source ID 간격을 기본 연속 번호 검사가 거부 | 위 제한된 명시 계약과 거부 회귀를 추가;본문/인용을 억지로 바꾸지 않음    |
| preview v3                   | 9단계 완료                                              | 이 manifest만 최종 결과로 사용;v1/v2·로그/원본은 보존                    |

변경 전 문서7개와 코드/설정/시험·작성 원본289파일의 해시는 `ppe-integration-documentation-20260928-v1/`에 있다. 이 복구본은 문서 갱신 직전 기준이며 이전 모델·파서·승인 복구 사본을 대신하지 않는다. 권위 원본과 RSS identity가 기준선과 같은지도 다시 검사한다.

### 35.8 다음 완료 범위

다음6개 미결 사건과 구형92회차/801구간은 [계획19.13](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1913-ppe-통합과-부분-소급의-출처-보존)을 따른다. 학생 RCT는 확보한49페이지 PDF를 조건·표·보충 자료까지 확인하고 공식 발표일 근거를 따로 찾는다. 날짜가 불명확하면 회차 날짜를 발표일로 채우지 않는다.

전체 지식/관계의 재검토, 자료 유형·출처 상세/첨부·목록 종료·실패 이월·예산, 독립40개발/20보류 자료, Drive 독립 쓰기/재읽기·충돌/복구, 기존08시 단일 실행기, 서로 다른 실제 신규7회 비교와 새 경로 첫 공개 발행은 남아 있다. 이 문서의 구현·통합·화면 결과로 전체 목표를 완료 처리하지 않는다.

## 36. 상세 개발 명세의 보강과 현재 재개 상태

이 절의22개 profile·집중20pass/1fail은 해당 문서 작업 당시 상태다. 이후 구현과 검증이 진행됐으며 현재23개 profile·집중21pass/0fail·전체 Node401/Python48 결과는 [37절](#37-상세-문서의-최신-구현-대조와-인계)에 기록한다. 이전 실패 영수증은 보존한다.

2026-09-28 사용자 요청은 구현 내용과 계획을 상세하게 문서화하는 것이다. 이번 작업은 기존 설계·수집·구현 계획·실행 가이드와 README/재개 기록6개를 보강했다. 코드·시험·데이터·권위 원고는 이 문서 작업 직전 상태를 보존했다. 이전 구현 goal을 완료 처리하지 않으며 새 조사·모델 추론·기사 승인·Drive 쓰기·발행·예약 변경도 실행하지 않았다.

### 36.1 문서의 책임과 새 명세

| 문서                                              | 보강 위치                       | 다음 개발에서 사용하는 방법                                          |
| ------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| [전체 설계](LOCAL_AI_NEWS_SYSTEM.md)              | 16.4~16.5                       | 실제 모델 설정·아직 없는 설정 모듈·원문→사실→문장→채널 관문          |
| [수집 명세](SOURCE_ACQUISITION_SPEC.md)           | 19.8·21                         | 조사 목적별 출처, method 지원 경계, 날짜 없는 PDF와 공식 발표문 결합 |
| [구현 계획](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md) | 19.14~19.15                     | 변경 파일·입출력·실패 재현·묶음 완료 증거·A~H 재개 순서              |
| README·재개 기록                                  | 상세 명세 링크·최신 미통과 상태 | 이전 전체 통과와 이후 진행 중 변경을 구분                            |

기존 요구사항R01~R18,23개 WBS,8개 분야·32조사 칸·제조사 추가30질의·Drive 권위·기존08시 예약과 전문용어 선정 규칙을 유지한다. 상세 명세는 새 지식 원본이나 별도 프로젝트 관리 DB를 만드는 문서가 아니다.

### 36.2 현재 환경과 보관 원문 재확인

- Node26.4.0, worker Python3.12.14, 메모리64GiB와 기존 Mac 모델 식별자를 현재 환경에서 확인했다.
- Ollama 서버 `/api/version`은0.34.4다. `ollama --version`은 CLI0.32.1과의 버전 차이를 경고했다. API와 CLI의 버전을 한 값으로 합치지 않는다.
- 설치 모델4개의 digest·형식·양자화·capabilities·thinking 값을 읽었다. Qwen3.8의 digest와 지원값은 기존 기록과 일치한다. 다운로드나 추론 실행의 증거는 아니다.
- `article_profiles`는22개다. 현재 발견 method4종과 CLI의 실제 옵션·집필기의 false·문맥/출력·상주 설정을 읽어 설계표와 대조했다.
- 보관된 대학 발표문 bytes에서 해당 기사 헤더의 time 속성 `2026-08-27T16:00:00Z`와 본문14문단을 확인했다. 새 profile 추가·이 연구의 최종 날짜 승인·수치 검토를 완료한 것으로 사용하지 않는다.
- 개발용 OpenAI 모델의 역할과 지원 추론 수준, Ollama 추론/구조화 출력 및 SEC/arXiv API의 공식 문서를 읽었다. 문서 추천은 운영 API 호출·구독 가용성·유료 API 도입을 의미하지 않는다.

### 36.3 진행 중 URL 식별자와 검증 상태

학생 RCT의 URL-only 논문 ID 지원은 문서 작업 전에 수정 중이던 코드다. 최신 집중 시험은 `student-rct-url-identity-focused-20260928-v1.log`의21개 중20pass/1fail이다. 실패는 심층 fixture의 본문 해시 불일치 때문에 의도한 관련 URL 거부 분기에 도달하지 못한 관측이다. fixture 일관성과 URL 검사를 나눠 확인해야 하며 해시 관문을 제거하지 않는다.

직전 Node397/Python47/TypeScript·private preview9단계·11기사/8과거회차/13노트 통과는35절 당시 결과다. 그 시험을 최신 코드 전체 통과로 재사용하지 않는다. 이번 문서 보강에서는 구현 시험을 새로 실행하지 않았다. 코드 재개 시 [계획19.14](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1914-날짜-없는-연구-문서와-url-논문-식별자-보완)의 집중/전체 검증을 수행한다.

### 36.4 문서 검증과 보존 증거

문서 변경 전6개 파일 사본과 코드·설정·시험·작성 원본292개의 SHA-256을 `.local/research/local-ai/documentation-spec-20260928-v2/baseline.json`과 `before/`에 저장했다. 해당 범위가 문서 작업 후에도 같아야 한다. 이 사본은 이전 기사 승인·모델 원출력·Drive 복구본을 대신하지 않는다.

이번 문서 검증은 Markdown 구문·로컬 링크/fragment·JSON 예시·핵심 명세의 참조·보호 파일 해시와 대상 파일 포맷을 확인한다. 원문 수집·기사 의미 검토·전체 회귀·배포의 대체 검사가 아니다. 실행 receipt는 같은 private 폴더의 `documentation-validation.json`에 기록한다.

최종 검증은6문서·368로컬 링크·200fragment·15JSON 예시를 통과했고 보호 파일292개와 작성 원본181개의 해시가 문서화 직전과 같았다. 대상6개 파일의 Prettier와 `git diff --check`도 통과했다. 첫 문서 감사는 기본 Markdown AST가 GFM 표를 일반 문단으로 읽어 표 공백 변경을 본문 변경으로 판정했다. 실패 receipt는 `documentation-validation-failed-v1.json`에 보존하고, 순서가 있는 셀 내용을 비교하도록 감사기를 수정해 내용 보존을 확인했다. 구현 집중 시험의20pass/1fail 상태는 그대로다.

```bash
npx prettier README.md docs/LOCAL_AI_NEWS_SYSTEM.md docs/SOURCE_ACQUISITION_SPEC.md docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md docs/LOCAL_AI_NEWS_RUNBOOK.md CODEX_TASK_STATE.md --check
node .local/research/local-ai/documentation-spec-20260928-v2/audit.mjs
git diff --check
```

문서 복구가 필요하면 `before/`의 해당 파일만 현재 변경과 대조한다. 코드·원고·기존 `.local` 실행물을 일괄 되돌리거나 정리하지 않는다. 새 설계 모듈/adapter 이름은 실제 파일 링크로 가장하지 않고 개발 대상이라고 표시했다.

### 36.5 바로 이어갈 작업

우선 URL 식별자의 집중 회귀 실패를 해결한다. 그 다음 대학 날짜 profile과 PDF의 핵심 사실을 검토하고, 같은 고정 학생 기사/과거 회차로 작성·정정·비공개 승인·의존 노트·전체 preview를 연결한다. 나머지5사건·구형92회차/801구간·전체 노트의 판정은 계속 별도 진행한다.

출처별 목록/상세/첨부/페이지 종료·표/OCR·모델 정책/독립60자료·Drive·일일 실행기·첫 발행·실제 신규7회는 [계획19.15](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1915-상세-문서-이후의-실행-우선순위)와 기존 WBS로 이어간다. 문서화 완료와 전체 시스템 완료를 구분해 보고한다.

## 37. 상세 문서의 최신 구현 대조와 인계

작성일2026-09-28. 사용자 요청에 따라 구현 내용과 개발 계획을 기존4개 문서에 상세히 정리하고 README/재개 기록을 연결했다. 이번 문서 보강의 시작 시점에서 이미 진행된 구현·원문·모델 실행의 결과를 읽어 상태를 갱신했다. 문서 작업으로 새 기사 승인·원본 수정·Drive 쓰기·공개 발행을 수행하지 않았다.

### 37.1 구현 상태를 확인한 실제 자료

| 영역               | 현재 결과                                     | 결과의 적용 범위                                            |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------- |
| URL-only 논문 ID   | 일반/심층 검토에서 HTTPS selected source 검사 | DOI/arXiv 없는 문서 identity; 참고문헌 URL 승인 금지        |
| 집중 회귀          | 21pass/0fail                                  | `student-rct-url-identity-focused-20260928-v2.log`          |
| Bocconi profile    | 23번째 exact profile 등록·날짜/본문 회귀      | 해당 지정 기사 URL; 대학 뉴스룸 전체 지원 아님              |
| 실제 발표문 재파싱 | 발표일2026-08-27·본문17블록·날짜 위치 보존    | 저장 bytes의 새 parse; 최종 기사 날짜 승인은 별도           |
| 직접 사실 검토     | PDF49페이지/540블록과 발표문을 조합한10사실   | source-first Codex 검토; 모델 자동 추출/독립 사람 gold 아님 |
| 실제 Qwen 집필     | 초안 생성 완료·`editorial_review`·미승인      | `entity_translation_requires_review`; 최종 읽기/정정 필요   |
| RCT 배경 자료      | NCI200/0블록·NCATS200/4블록                   | NCI 본문 누락; 새 용어 승인 없음                            |
| 전체 Node          | 401pass/0fail/0skip                           | `student-rct-node-tests-20260928-v1.log`                    |
| 전체 Python        | 48tests/OK                                    | `student-rct-python-tests-20260928-v1.log`                  |
| TypeScript         | exit0                                         | `student-rct-typecheck-20260928-v1.log`; 정상 빈 로그       |
| 최신 완료 preview  | 기존11기사/8과거회차/13노트                   | PPE·science 사본; 새 학생 초안은 포함하지 않음              |

상태를 `captured`·파싱 완료·사실 검토·기사 승인·Drive 보관·공개 발행으로 나눠 읽는다. `quality.reviewed:false`인 parse가 있다는 사실과 별도로 선택된 사실의 직접 검토 receipt가 있을 수 있다. 문서 전체의 검토, 선택 claim 검토, 최종 문장 검토를 한 flag로 합치지 않는다.

### 37.2 모델 실행과 아직 남은 편집

학생 연구 초안의 실제 호출은 `qwen3.8:27b`, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, 서버0.34.4, `think:false`, 문맥16,384, 출력 상한4,096, 온도0다. wall-clock은218,625ms, 입력2,359/출력1,525토큰으로 기록됐다. 이 시간은 원문 확보·직접 사실 검토·최종 편집·Drive·발행을 포함한 기사당 처리 시간이 아니다.

초안 ID는 `ad6f960d300c45c1849ac85416c9a5f08e63ef7a46ae46fca7974fbc94c7f903`다. 모델 원출력과 request/response는 private run에 보존한다. 현재 승인 artifact가 없는 상태를 최종 기사로 바꾸지 않는다. 기관 표기, 배정 단위, 접근과 실제 사용, 점수의 통제 조건, 두 다양성 지표, 상호작용을 직접 읽고 정정해야 한다.

Qwen의 `think` 지원은 false/low/medium/xhigh이며 다른 모델은 실제 `/api/show` 값을 따른다. 현재 extract 기본medium, draft/knowledge writer의 false, `keep_alive:5m`을 구분한다. 향후 model-policy 명세와 예시는 [계획19.16.3](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19163-역할별-모델-정책의-구현-단위)에 있고 아직 운영 설정 파일이 아니다.

### 37.3 상세 문서의 읽기 순서와 구현 산출물

1. [SYSTEM18](LOCAL_AI_NEWS_SYSTEM.md#18-실행-책임과-산출물-계약): 프로그램/모델 호출 순서, 데이터 소유권, 변경 전파, 빈약한 기사 입력 보완, 중단 조건, 비용/구현 선택.
2. [SOURCE22](SOURCE_ACQUISITION_SPEC.md#22-출처-도입을-구현-작업으로-전환하는-절차): 출처 한 곳의 도입8단계, 경로별 adapter/종료, 파서 선택, 제조사 두 축, 실제 수용 시험.
3. [PLAN19.16](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1916-다음-개발의-입력변경검증-명세): 학생 기사/의존 지식의8단계, 잔여 소급/출처/평가의 수정 위치, 모델 정책 예시, 일일 통합의 완료 판정.
4. 기존 RUNBOOK의 실제 CLI와 각 실행 기록: 미래 설계 옵션을 지원하는 명령으로 잘못 사용하지 않는다.

새 기능은 기존 모듈·공통 worker·private journal과 Knowledge/Signals/TrendTopics를 확장한다. 아직 없는 `model-policy.mjs`, `daily.mjs`, 신규 API adapter는 개발 대상으로만 기록했다. RSS/GitHub는 같은 승인 원고를 순차 제목 구조로 변환하고 별도 모델의 재요약을 요구하지 않는다.

### 37.4 문서 검증과 복구 범위

이번 문서 작업의 변경 전 사본은 `.local/research/local-ai/documentation-spec-20260928-v3/before/`다. baseline에는6문서와 코드·설정·시험·권위 원본292개, 그중 작성 원본181개, 학생 초안/검토와 파싱 결과4개의 SHA를 저장했다. 이전v2 문서 감사는 당시22개 profile/20pass·1fail을 검사하므로 최신 상태의 감사로 재사용하지 않는다.

새 문서 감사는 Markdown 구문·로컬 링크/fragment·JSON 예시·현재23개 profile/시험 로그/초안 상태와 보호 파일 해시를 대조한다. receipt는 같은v3 경로의 `documentation-validation.json`이다. 코드/데이터 전체 시험을 문서 검사로 대신하거나 당시 실패 기록을 삭제하지 않는다.

최종 문서 검증은6문서·377로컬 링크·209fragment·16JSON 예시를 통과했다. 코드/설정/시험/원본292개, 작성 원본181개, private 조사 결과4개의 SHA가 문서 작업 전과 같으며 이전 실행/인계의1143문단을 보존했다. Mermaid3개는 코드 블록의 존재를 집계했으며 렌더링 시험으로 표시하지 않는다. 대상 파일 Prettier와 `git diff --check`도 통과했다. 이전 문서 사본과의 변경 범위는 같은 경로의 `reviewed-scope.diff`에 보관한다.

```bash
npx prettier README.md docs/LOCAL_AI_NEWS_SYSTEM.md docs/SOURCE_ACQUISITION_SPEC.md docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md docs/LOCAL_AI_NEWS_RUNBOOK.md CODEX_TASK_STATE.md --check
node .local/research/local-ai/documentation-spec-20260928-v3/audit.mjs
git diff --check
```

문서 복구는 `before/`의 해당 파일을 현재 diff와 대조하는 범위다. 코드·원고·모델 원출력·다른 실행물까지 되돌리거나 디스크 부족을 이유로 삭제하지 않는다.

### 37.5 정확한 다음 작업과 전체 완료 경계

바로 다음 작업은 학생 초안 정정/최종 승인, 기존 Agent Evaluation 의존 관계 검토, 필요 시 원문 정의에 근거한 RCT 생성, 모든 승인 입력의 새 전체 preview/채널/브라우저 대조다. 다음으로 다른5사건·구형92회차/801구간·전체 지식 판정, 출처별 상세/IR/첨부/페이지 이동, 모델 정책/독립60자료 평가, 일일 실행/Drive/첫 공개 발행/실제 신규7회를 이어간다.

현재 권위 원본에는 여전히14미검토 사건이 있다. 비공개 승인으로 추가 판정한8건 이후 잔여6건 중 학생 사건은10사실과 초안까지 진행했으나 최종 승인 전이므로 잔여6건 집계를 유지한다. 문서화 완료를 기사 승인·전체 소급·운영 전환 완료로 보고하지 않는다.

### 37.6 후속 실행물을 반영한 상세 문서의 현재 기준

위37.1~37.5는 v3 문서 작업 당시의 결과다. 이후 진행된 private 기사 정정과 배경 수집을 읽어 다음 상태를 확인했으며, 이번 v4 문서 보강에서 추가 모델 추론·기사 승인·코드 수정·권위 원고 수정·Drive 쓰기·발행은 수행하지 않았다.

| 항목                     | 실제 현재 상태                                                                                                                 | 다음 완료 증거                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 학생 기사 원출력         | `drafts/ad6f960d300c45c1849ac85416c9a5f08e63ef7a46ae46fca7974fbc94c7f903.json`에 보존                                          | 원출력과 정정본의 분리 유지                                                                                                            |
| 첫 정정본                | `43ee634b1e063334ca69a8e002f5ab8721bf5f01d6eae3d818b6f6a1b3a8e31b`; `editorial_review`, `public_approved:false`, `problems:[]` | 내부 작성 지시 제거·최종 원문 대조·실제 승인                                                                                           |
| 정정한 내용              | 익명 실험 대학·기관명·수업 단위 배정·자문 점수의 조합 효과 범위                                                                | 최종 문장별 사용 claim과 조건 대조                                                                                                     |
| 아직 남은 독자 문장 문제 | 마지막 다양성 설명에 “표현하지 않는다”라는 내부 편집 지시가 포함                                                               | [계획19.17](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1917-공개-문장에-내부-작성-지시가-남는-문제의-회귀-계획)의 재현·코드 회귀·실제 재정정 |
| 새 배경 run              | `20260928-evaluation-rct-background-source-v1`의 공식 자료6개 수집·파싱                                                        | 실제 본문 검토와 필요한 사실/노트만 승인                                                                                               |
| J-PAL 세 자료            | 96/127/79블록; `quality.reviewed:false`                                                                                        | 일반 RCT 정의·배정/표집·집단 배정의 근거 검토                                                                                          |
| 에이전트 평가 세 자료    | Anthropic92·OpenAI tracing70·Prometheus74블록; 모두 `quality.reviewed:false`                                                   | Agent Evaluation의 정의·관련 개념·기존 이력 재구축                                                                                     |
| 새 용어/노트 승인        | 이 배경 run으로 승인된 노트 없음                                                                                               | RCT 생성과 기존 Agent Evaluation 교체의 실제 v2 승인                                                                                   |
| 전체 통합                | 기존 완료 preview11기사/8과거회차/13노트 그대로                                                                                | 학생 최종 승인과 새 지식을 포함하는 새 전체 preview                                                                                    |

현재 정정본에 구조 문제 코드가 없다는 결과를 기사 의미 검토의 합격으로 사용하지 않는다. 최종 승인 전에 내부 작성 지시를 제거해야 한다. “효과가 통계적으로 구분되지 않았다”는 사실 문장은 조건과 근거를 확인해 남긴다. 기사 출력에 편집 지시를 넣는 것과 확인한 부정 결과를 전달하는 것은 서로 다른 동작이다.

원문 경로와 블록 범위, 배경 자료의 용도는 [수집 명세21.7](SOURCE_ACQUISITION_SPEC.md#217-용어-정의와-기존-연결-재검토의-실제-배경-입력)에 있다. 학생 사건은 AI 에이전트의 동작 평가와 동일한 개념으로 연결하지 않는다. RCT 생성과 기존 Agent Evaluation의 수정은 각각 독립적인 근거·별칭·관계·사건 이력 검토를 요구한다.

실제 환경을 읽기 전용으로 다시 확인했다. Ollama API 서버는0.34.4이고 CLI가 출력하는 client version은0.32.1이다. Qwen3.8:27b의 digest와 false/low/medium/xhigh 지원은 기존 기록과 같다. 이 확인은 새 추론 시험·모델 설치/업그레이드·운영 모델 승격이 아니다. 개발용 모델 권고는 공식 모델/추론 문서를 확인해 [구현 계획12절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#12-구현에-사용할-모델과-추론-수준)에 출처와 선택 조건을 기록했다.

문서 복구/감사 경로는 `.local/research/local-ai/documentation-spec-20260928-v4/`다. 변경 전6문서, 코드·설정·시험·원본292개(작성 원본181개), private 조사 결과9개의 SHA를 고정했다. v3 감사기는 원출력의 `entity_translation_requires_review` 상태를 기대하므로 현재 정정본 검사로 재사용하지 않는다. v4 감사는 현재 정정본 ID·상태·원출력 보존·배경6개와 본문 수·문서 링크/JSON·보호 파일을 검사한다.

문서화의 완료 증거와 원문/기사 의미 검토·제품 시험·운영 검증은 구별한다. 이번 보강으로 독립 사람 gold나 독립60자료 평가 수가 늘지 않았으며 잔여6사건·구형92회차/801구간·전체 지식 판정·일일 실행기·Drive·첫 공개발행·실제 신규7회 완료 상태도 바뀌지 않았다.

v4 문서 감사는6문서·386로컬 링크·217fragment·16JSON 예시를 통과했고292개 보호 파일·181개 작성 원본·9개 private 결과의 SHA가 문서화 직전과 같았다. 이전 실행/인계의1167문단을 보존했다. Mermaid3개는 코드 블록만 집계했으며 렌더링 검증을 수행한 것으로 표시하지 않는다. 대상 문서의 Prettier와 `git diff --check`도 통과했다. 실행 결과는 같은 private 경로의 `documentation-validation.json`, 대상6문서의 전후 diff는 `reviewed-scope.diff`에 남긴다.

```bash
node .local/research/local-ai/documentation-spec-20260928-v4/audit.mjs
npx prettier README.md docs/LOCAL_AI_NEWS_SYSTEM.md docs/SOURCE_ACQUISITION_SPEC.md docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md docs/LOCAL_AI_NEWS_RUNBOOK.md CODEX_TASK_STATE.md --check
git diff --check
```

## 38. 편집 차단·목록 파싱·용어 승인의 현재 구현 명세

기준일2026-09-28. 37절 이후 실제 구현·모델 실행·노트 승인 결과를 현재 코드와 private receipt에서 다시 읽었다. 이번 상세 문서 작업은 그 결과와 남은 개발을 기록하는 범위다. 문서 갱신 중 제품 코드·작성 원본·승인 파일·모델 원출력을 수정하거나 모델을 새로 호출하지 않았다.

### 38.1 기능별 현재 결과와 다음 관문

| 기능                | 확인한 실제 결과                                                                      | 아직 완료되지 않은 부분                                             |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 내부 작성 지시 차단 | 실제 문제를 재현한2시험→수정 후2pass; 제목/리드/설명 제목/문단의 승인 차단            | 문장 의미 전체의 자동 검토, 새 학생 기사의 실제 최종 승인/채널 대조 |
| 학생 기사 정정      | 원출력·첫 정정본을 보존한 두 번째 정정본5d83…; `problems:[]`, `public_approved:false` | 논문 URL identity와 출판 상태 계약, 승인 receipt                    |
| 정의 목록 파싱      | Anthropic exact profile·합성 회귀·실제 원문 재파싱92→120블록                          | 다른 템플릿/자료의 실제 본문과 목록·표 검증                         |
| 선택 사실 검토      | J-PAL/Anthropic/OpenAI/Prometheus14사실; Codex 직접 source-first 검토                 | 문서 전체 검토·독립 사람 gold·독립60자료 평가                       |
| RCT 설명            | 실제 Qwen 초안8섹션→직접 정정한 canonical12섹션→신규 노트 비공개 승인                 | 학생 기사·전체 사이트·Drive 원본·공개 페이지 연결                   |
| Agent Evaluation    | 원문 정의·채점·실행 기록·지표를 다시 쓴12섹션 교체본 비공개 승인                      | 기존 과거8사건 전체 판정·전체 결과에 새 교체본 적용                 |
| 전체 사본           | 기존11기사/8과거회차/13노트 preview 완료                                              | 학생1기사+새2노트를 넣은 새 preview·채널/브라우저 검증              |
| 최종 보관/운영      | 기존 Drive 권위·기존08시 예약 유지                                                    | 새 경로 Drive 쓰기/재읽기·첫 공개 발행·실제 신규7회                 |

새 노트2개는 `candidate_published:false`, `drive_verified:false`다. 저장된 승인과 현재 원문/검토의 일치를 `loadNoteApproval`로 재확인했다. 기사 미승인은 그대로이며 권위 원본의14미검토·비공개 추가 판정8개 이후 잔여6사건도 유지한다. 새 승인 노트가 있다고 학생 사건 판정을 완료로 계산하지 않는다.

### 38.2 실제 변경 파일·회귀·원문 재생

| 구현 파일                        | 변경 목적                                             | 검증 위치                                                                   |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `scripts/research/editor.mjs`    | 실제 내부 작성 지시 패턴을 공개 승인 전에 차단        | `tests/research-projection.test.mjs`의 승인/부정 결과2시험                  |
| `data/research-acquisition.json` | Anthropic의 해당 URL 제목·본문·li/표/pre 선택 profile | `tests/test_research_worker.py`의5정의·표·중복/관련 내용·selector 실패 검사 |

기존 worker의 목록·표 처리 기능을 재사용했다. 원문 취득 실패를 본문 없음으로 바꾸거나, 본문 누락을 새로운 연구 결과로 해석하지 않는다. 실제 source는 같은 bytes이며 parse만 새 ID로 보존했다. [SOURCE21.8](SOURCE_ACQUISITION_SPEC.md#218-실제-정의-목록-누락의-파싱-보완)에 DOM 선택자·지원 범위·후속 검토를 기록했다.

실행 로그는 `.local/research/local-ai/student-rct-reader-prose-20260928-v1/`에 있다. 실제 최근 구현 단계에서 수행한 명령은 다음과 같다. 현재 문서 검사에서 이 명령을 다시 실행했다고 기록하지 않는다.

```bash
node --test --test-name-pattern='editorial directions|prose guard' tests/research-projection.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest tests.test_research_worker.WorkerTests.test_anthropic_eval_profile_preserves_definitions_and_table_without_related_content
npm test
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npx tsc --noEmit
```

`red.log`는 수정 전 승인 차단 실패, `green.log`는2시험 통과다. `profile-red.log`는 profile 없음 오류, `profile-green.log`는1시험 통과다. `node-tests.log`는403pass/45suites/0fail/0skip, `python-tests.log`는49tests/OK다. TypeScript는 정상 빈 로그이며 해당 실행의 exit0를 이전 구현 실행 결과로 기록한다. 문서 검사가 빈 로그만 보고 TypeScript를 새로 실행했다고 주장하지 않는다.

### 38.3 원문·사실·초안·승인을 재개할 정확한 입력

| 작업             | 실제 run/입력                                       | 보존할 범위                                                   |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| 배경 원문        | `20260928-evaluation-rct-background-source-v1`      | 공식6자료의 응답 bytes·원/최종 URL·source version·이전 parse  |
| 목록 보완 재파싱 | `20260928-evaluation-rct-background-profiled-v2`    | 블록96/127/79/120/70/74; 모두 parse `quality.reviewed:false`  |
| 배경 사실 검토   | `20260928-rct-evaluation-source-reviewed-notes-v1`  | 선택14claim·원문 위치·검토일/검토자; 자동 추출/독립 gold 아님 |
| 실제 RCT 집필    | `20260928-rct-local-knowledge-draft-v1`             | 원요청/응답·digest·prompt/schema SHA·8섹션 원출력             |
| 신규/교체 승인   | `20260928-rct-agent-dependent-approved-notes-v1`    | v2 생성/교체·이전 Agent 전체 bytes·새12섹션·승인 근거         |
| 학생 최종 초안   | `20260928-student-rct-source-reviewed-editorial-v1` | 원출력ad6f…→첫 정정43ee…→두 번째 정정5d83…                    |

학생 현재 draft ID는 `5d83deaff22821872b1d85aae8dd892788a0496cb0f7666aa3d82bf3e7f2e64a`다. 이전 approval 입력은43ee…를 가리키므로 그대로 실행하지 않는다. 해당 입력의 `사전공개` 역시 확인된 연구의 출판 상태로 사용할 수 없다. 후속 변경의 status null 계약과 승인/통합 순서는 [PLAN19.18](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1918-url-논문-식별자와-출판-상태의-전체-발행-계약)을 따른다.

### 38.4 로컬 모델의 실제 설정과 시간

RCT 용어 초안은 `qwen3.8:27b`, digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, Ollama API0.34.4, `think:false`, `num_ctx:16384`, `num_predict:4096`, `temperature:0`으로 실행했다. 실제 wall-clock153,834ms, 입력3,350/출력1,031토큰이다. 원문 수집·14사실 검토·직접 정정·노트 승인·전체 사이트 통합을 포함한 총 처리 시간이 아니다.

초안의 `problems:[]`는 구조 관문을 통과했다는 뜻이다. 반복 설명, 연구 방법과 실제 예시의 배치, 범위의 `포함:`/`포함하지 않음:`을 직접 수정했다. 첫 note-review의 canonical 범위 누락 거부 기록을 보존했고 검증기를 완화하지 않았다. 두 번째 입력으로 실제2노트 승인까지 완료했다.

Agent Evaluation은 이번 Qwen 초안에서 생성하지 않았다. 별도 원문9사실을 직접 읽어 작성했다. 모델 초안 기반 RCT와 직접 작성한 Agent Evaluation의 평가 대상을 구별한다. 새 사실/초안/노트는 개발 사례이며 독립60자료의 정답 수나 무인 운영 성공 수를 늘리지 않는다.

### 38.5 용어 설명·기사·관계의 보존 조건

- RCT의 고정 concept ID는 `randomized-controlled-trial`, 노트 경로는 `Knowledge/Research Methods/Randomized Controlled Trial.md`다. 정확한 별칭은 RCT와 무작위 대조 시험이며, 배정과 표집·개인/집단 배정·층화를 설명한다. 승인 전에 관계를 채우기 위해 Agent Evaluation과 선을 만들지 않았다.
- 기존 Agent Evaluation의 ID `evaluation`과 경로를 보존했다. 정의·평가 요소·실제 결과/응답·채점·trace·지표를 다시 설명하고, 원문 근거가 있는3개 관계를 유지했다. 현재 승인본에서 학생 실험과 근거 미검토 기존 이력은 제거했으며 전체 이전 bytes를 private 승인 자료에 보존했다.
- 이력에서 행을 빼는 작업과 그 사건 자체의 공개 제외는 다른 판정이다. 학생을 포함한 기존 과거8사건을 자동 제외했다고 집계하지 않는다. 기사·누적 판단·관계를 각각 실제 근거로 재검토한다.
- 비어 있는 이력·관계·분석은 독자 화면에서 숨긴다. 회사명/제품명/일반어를 지도 노드나 광범위 alias로 추가하지 않는다. 태그는 분야/테마/기업 필터와 전문용어 링크의 역할을 구분한다.

### 38.6 상세 문서의 보관·검증과 다음 실행

이번 보강은 기존 SYSTEM/SOURCE/PLAN/RUNBOOK와 README·재개 기록6개 파일에 수행했다. 변경 전 사본과 해시는 `.local/research/local-ai/documentation-spec-20260928-v5/before/`·`baseline.json`에 있다. 문서 작업 시작 시 코드/설정/시험/작성 원본292개, 그중 작성 원본181개, private 조사·승인16개를 고정했다. 이전 문서 감사는 당시23profile/43ee… 초안을 검사하므로 현재 상태의 감사로 재사용하지 않는다.

검증 명령은 다음과 같다. 실제 결과는 같은 private 경로의 `documentation-validation.json`에 기록한다. Mermaid는 기존 코드 블록을 집계하며 렌더링/브라우저 검증으로 보고하지 않는다.

```bash
node .local/research/local-ai/documentation-spec-20260928-v5/audit.mjs
npx prettier README.md docs/LOCAL_AI_NEWS_SYSTEM.md docs/SOURCE_ACQUISITION_SPEC.md docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md docs/LOCAL_AI_NEWS_RUNBOOK.md CODEX_TASK_STATE.md --check
git diff --check
```

다음 실행은19.18의 실패 재현·공통 paper identity·status null 계약→학생 승인→새2노트 포함 전체 private preview다. 그 다음 잔여5사건·구형92회차/801구간·전체 지식 판정, 제조사/다른 분야의 상세·IR·첨부·페이지 이동, 역할별 모델 정책과 독립40개발/20보류 평가, Drive·일일 실행기·첫 새 경로 발행·실제 신규7회를 이어간다. 현재 학생이 미승인이므로 남은 사건은6개로 보고한다.

최종 문서 감사는6문서·391로컬 링크·221fragment·17JSON 예시를 통과했다. 보호 파일292개·작성 원본181개·private 조사/승인16개의 SHA가 문서화 직전과 같고 이전 실행 기록1173문단을 보존했다. 승인 기사11run과 노트7run도 현재 근거로 재읽었으며 새2노트는 비공개 상태다. Mermaid3개는 코드 블록만 집계했다. 전후 변경은 같은 경로의 `reviewed-scope.diff`, 감사 결과는 `documentation-validation.json`에 보존한다.

이번 문서화는 상세 개발 명세의 갱신이다. 전체 시스템 구현 goal은 active이며 문서 완성을 소급 재조사·서비스 전환·공개 발행·무인 운영 완료로 표시하지 않는다.

## 39. URL 논문 식별자·학생 기사·RCT 용어의 실제 통합

기준일2026-09-28. 38절 이후 계획19.18의 실패를 재현하고 코드·학생 기사 승인·새2노트·전체 사이트를 실제 통합했다. 이 절은 구현한 내용과 직접 실행한 검증을 기록한다. 원문/모델 원출력과 이전 실패/승인/preview를 보존했으며 Drive 작성 원본·공개 서비스·예약을 수정하지 않았다.

### 39.1 검토 단계부터 전체 회차까지 같은 논문 identity

| 파일                                                           | 실제 변경                                               | 계속 유지하는 검사                                               |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| [paper-identifiers.mjs](../scripts/paper-identifiers.mjs)      | 의존성 없는 공통 `paperKey`                             | string·공백 없음·DOI/arXiv/HTTPS URL·자격 증명/fragment 없음     |
| [knowledge-links.mjs](../scripts/research/knowledge-links.mjs) | 공통 함수를 import하고 이전 export 유지                 | work_id별 identity·판본 대조·기업/인물 연결 검사                 |
| [editorial.mjs](../scripts/editorial.mjs)                      | 개별 papers 검증과 `validateIdentities`가 같은 key 사용 | papers 비어 있지 않은 ID·work_id 유일성·원문 포함·전문 접근      |
| [deep-dive.mjs](../scripts/research/deep-dive.mjs)             | status에 명시적 null 허용; 일반 기사 스키마에도 전달    | 선택 source/parse·사용 claim·범위·필수 검토·동료심사 출판사 근거 |

공통 모듈은 garden/editorial/research를 import하지 않으므로 순환 의존을 만들지 않는다. URL 호스트는 Node 기본 URL 정규화를 따르고 경로와 query 대소문자는 유지한다. `/Study.pdf`와 `/study.pdf`, `?Edition=A`와 `?Edition=a`를 같은 work로 임의 합치지 않는다. DOI 대소문자는 정규화하고 arXiv 버전은 같은 논문의 key에서 제거한다. 이 key의 일치와 서로 다른 원문이 같은 논문이라는 편집 판정은 별개다.

`status`는 여전히 필수다. `사전공개`, `동료심사`, null만 허용하며 필드 누락과 임의 문자열은 거부한다. null은 상태를 확인하는 절차를 수행했으나 원문에서 명시 근거를 찾지 못한 경우다. `publication_status_checked:true`와 별도 private 판단 기록을 보존했다. `access`·`scope`·전문 기반 심층 자격과 독립적이며 초록을 전문으로 올리지 않는다. 공개5필드의 이름·순서와 기존 known-status 승인은 그대로다. 이번 독자 결과에 null 배지·상태 해명·빈 문구는 없다.

### 39.2 회귀 시험과 이전 승인 보존

집중 시험은 [일반 논문 참조](../tests/research-paper-reference.test.mjs)와 [심층/identity](../tests/research-deep-dive.test.mjs)다. URL-only 승인을 `editionProjection`→`parseNote`→`extractArticles`→`validateIdentities`까지 전달하고 일반/심층의 null을 각각 확인한다. 잘못된 URL·타입·공백/줄바꿈·누락/잘못된 status, 선택 원문과 다른 URL·접근 범위/검토 실패를 거부한다. URL 경로/query 대소문자가 다른 문서는 구분하고 호스트 대소문자·DOI 대소문자·arXiv 버전의 동일 identity가 서로 다른 work_id에 배정되면 거부한다.

실제 실행 명령은 다음과 같다.

```bash
node --test tests/research-paper-reference.test.mjs tests/research-deep-dive.test.mjs
npm test
npx tsc --noEmit
```

private 증거 위치는 `.local/research/local-ai/student-paper-contract-20260928-v1/`다. `red.log`는25시험/19pass/6fail, `green.log`는25pass/0fail이다. 최종 공백 회귀를 포함한 `node-tests.log`는407tests/45suites/407pass/0fail/0skip이며 TypeScript 실행도 exit0였다. worker는 변경하지 않아 직전49tests/OK 결과를 유지하고 새 실행으로 보고하지 않는다.

`baseline.json`과 `before/`는 변경 전5파일 및181작성 원본 SHA를 보존한다. 기존11기사와7노트 묶음을 현재 코드로 재읽어 저장된 승인 결과와 동일함을 확인했다. 그 결과는 `existing-approvals-readback.json`에 있다. 여기의 새2노트는 당시 v1 승인이고, 최종 전체 사본은 아래 연결 이유를 보완한 v2 승인으로 구성한다. 예전 로그와 입력을 현재 결과로 덮어쓰지 않는다.

### 39.3 실제 학생 기사 승인과 날짜·실험 조건

| 항목                 | 실제 값                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| 기사/집필 run        | `20260928-student-rct-source-reviewed-editorial-v1`                                     |
| 고정 사건/URL        | `de0d8b99a9cda9c5` / `news/de0d8b99a9cda9c5`                                            |
| 현재 최종 draft      | `5d83deaff22821872b1d85aae8dd892788a0496cb0f7666aa3d82bf3e7f2e64a`                      |
| 원문 발표/현재 검토  | 2026-08-27 / 2026-09-28                                                                 |
| 기존 회차            | `Editions/2026/08/2026-08-28_0802_Tech_AI_Briefing.md`                                  |
| 명시적 전문용어      | `randomized-controlled-trial`                                                           |
| 논문 work/identifier | `novices-rct-202608` / `url:https://cdn.openai.com/pdf/novices-and-llm-august-2026.pdf` |
| 접근/범위/상태       | 전문 / full_document / null                                                             |
| 연구 source version  | `de0d8b99a9cda9c5557b:5f4873c28ac6b184c6675c603832a9b0da7f90872abfce40e7c37dad995cd721` |
| 연구 parse           | `9efa88c902c6c0fe29c60abb4b6a2796e0043b28c454c87feb3f0df5f9892972`                      |

연구 PDF와 대학 발표의 기존 bytes를 직접 대조했다. 대학의 협력 발표와 실험이 진행된 익명 유럽 대학을 구분한다. 학생1,053명/13수업/네 조건의 배정 단위는 수업이며, ChatGPT Edu/GPT-4o 접근 제공을 모든 참가자의 실제 사용으로 쓰지 않는다. 점수0.862와 대조2.09는 통제변수를 반영한 추정치로 설명하고 제안 내부/참가자 사이 다양성을 분리한다. 훈련과 ChatGPT를 결합한 추가 효과는 제안 품질 점수의 결과 범위를 유지한다. 부정적/통계적으로 구분되지 않는 결과도 정보인 경우 남긴다.

원고는3문장 리드와4개 설명 묶음이다. 원문에 없는 장소·시간·성과를 채우지 않았으며 고정 질문형 분석·운영 해명은 없다. 출판 상태를 사전공개로 임의 지정했던 예전 입력43ee…는 보존하되 승인에 사용하지 않았다. `approval-input-final-v2.json`에 현재5d83…·status null·원본 소급 SHA를 지정했고 `final-source-prose-review.json`에 실제 조건 검토와 null 판단 이유를 private으로 기록했다.

실제 승인 명령은 다음과 같다. 이미 승인된 run을 새 기사로 발행하라는 지시가 아니라 실행 기록이다.

```bash
npm run research -- approve --run 20260928-student-rct-source-reviewed-editorial-v1 --review .local/research/local-ai/student-paper-contract-20260928-v1/approval-input-final-v2.json
```

결과는 비공개 `approved-article.json`·`editorial-review.json`이며 `candidate_published:false`다. 원출력ad6f…와 첫 정정43ee…·최종5d83…를 유지했다. 원문 직접 검토는 Codex가 수행했으며 독립 사람 gold나 자동 사실 추출의 합격으로 계산하지 않는다. 이번 identity 수정/승인에서는 모델을 다시 호출하지 않았다.

### 39.4 관련 개념 본문의 실제 실패와 수정

첫 전체 preview `20260928-student-rct-integrated-private-site-v1`은 Agent Evaluation의 `관련 개념` 본문에서 세 wikilink에 연결 이유가 빠져 `validate` 단계에서 거부됐다. frontmatter에 이유/근거가 있다는 사실만으로 독자 본문 계약을 충족하지 않았다. 실패 로그 `preview/validate-attempt-17f97ddd-37dc-4c9a-aab5-45c22980e254.log`와 이전 승인/사본을 보존했다.

본문의 AI Agents·Agent Observability·Aggregate Metrics 세 연결에 frontmatter의 이유와 원문 링크를 함께 작성하고 해석 관계임을 구분했다. target/type/reason/evidence를 바꾸거나 validator를 완화하지 않았다. 정정본과 검토 입력은 `agent-relations-reviewed-v2.md`·`note-review-relations-v2.json`이다.

```bash
npm run research -- note-review --run 20260928-rct-agent-dependent-approved-notes-v2 --review .local/research/local-ai/student-paper-contract-20260928-v1/note-review-relations-v2.json
```

새 승인 v2는 RCT 생성과 Agent Evaluation 교체2개다. RCT는12 canonical 섹션·정확한 별칭/기사 지정·빈 relations/connections를 유지하며 학생 실험 때문에 평가 엔진과 억지 관계를 만들지 않는다. 기존 Agent의 이전 전체 bytes와 과거8사건은 private 승인 자료에 보존했다. 새 노트에서 미검토 이력을 사용하지 않는 결정과 그 사건을 전체 공개 제외하는 결정은 구분한다.

### 39.5 새 전체 비공개 사이트와 채널 대조

최종 run은 `20260928-student-rct-integrated-private-site-v2`다. 실제 `preview`의 전체 argv는 `student-paper-contract-20260928-v1/preview-command-v2.json`에 고정했으며12개의 `--approved-run`과7개의 `--knowledge-run`을 포함한다. 마지막 노트 입력은 `20260928-rct-agent-dependent-approved-notes-v2`다. 앞선 실패 명령/로그는 `preview-command.json`·`preview.log`, 성공 결과는 `preview-v2.log`에 구분했다.

| 산출물/관문               | 실제 결과                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| stage journal             | workspace→refresh→knowledge-sync→knowledge-check→validate→build→verify→consistency→outputs의9단계 complete |
| 승인 기사/과거 회차/노트  | 12 / 8 / 15                                                                                                |
| public/digest/source 파일 | 279 / 132 / 437                                                                                            |
| RSS                       | 기존40개 GUID·pubDate 목록과 순서 보존                                                                     |
| 기사·원문·날짜            | 뉴스·과거 브리핑·RSS·GitHub Markdown 동일 승인 내용 대조                                                   |
| 기사/용어                 | 학생 기사에 RCT 연결·정의/원리/실제 예시·2026-08-27 변화 이력                                              |
| 작성 원본                 | 권위 작업 사본181개 SHA 보존·새 과거 회차 생성 없음                                                        |

`preview/consistency.json`과 `preview/state.json`, `preview-manifest.json`을 보존한다. manifest의 `candidate_published`, `drive_verified`, `browser_verified`는 모두 false다. 이후 UI 검증을 수행했다고 이 불변 manifest를 수정하지 않는다. 아래 별도 receipt를 연결해 실제 UI 관측과 당시 생성 결과를 구분한다. 생성 파일 수는 실제 신규 뉴스 수나 전체 재검토 완료 수가 아니다.

### 39.6 실제 화면·키보드·클릭 검증

완성된 preview-workspace를 기존 서버로 localhost8088에 띄워 Chrome extension/CUA로 확인했다. 데스크톱1280×900과 임시 모바일390×844를 사용했다. 실물 휴대폰 검증이나 공개 사이트 검증은 아니다.

- 기사·브리핑의 가로 넘침이 없고 canvas는0개다. 내용이 있는 전체/AI 분야 탭만 표시하고 분석이 없는 심층 탭은 숨긴다.
- 기사 전문용어 태그의 Enter→RCT 정의/원리, 학생 연구 링크 Enter→기사, 기사→동일 과거 브리핑 이동을 확인했다.
- AI 탭의 Enter→`?sector=AI`/선택 상태, 뒤로가기→전체/원래 URL을 확인했다.
- Playwright locator click은 성공 응답 뒤 실제 이동이 없어 실패로 기록했다. 새로운 접근성 상태에서 링크를 다시 특정하고 CUA의 `tab.click`으로 브리핑 카드→기사·태그→RCT·변화 이력→기사 이동을 확인했다. 제품 코드를 이 자동화 실패를 숨기기 위해 변경하지 않았다.
- 빈 관련 개념은 숨겨지고 용어 페이지의 지도는 허용된 위치에만 나타난다. 콘솔 error/warn은0개다. 임시 viewport를 reset하고 소유 Chrome 탭·서버를 종료했다.

관측은 `browser-verification.json`, 화면은 `desktop-news.png`·`mobile-news.png`·`mobile-briefing.png`에 있다. 이 JSON의 잘못 지정된 `.concept-timeline a` 선택자 결과0은 이력 항목 수의 증거로 사용하지 않는다. 실제 접근성 화면의2026-08-27 변화 이력과 해당 링크 클릭을 근거로 확인했다. 이전 브라우저 시험을 이번 데이터의 검증으로 대신하지 않았다.

### 39.7 전체 목표의 남은 작업과 다음 재개

권위181작성 원본의73verified/14unreviewed 상태는 이번 private 시험으로 바뀌지 않았다. 초기14미검토 중 추가9사건의 private 판정을 완료했으며 아직5개가 남는다. 원문 수집·판정·기사 승인·지식 판정·Drive 보관·공개 발행을 각각 완료해야 한다.

| 다음 사건 ID       | 기존 원문 주소                                                                                                                                                | 먼저 확인할 사항                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `34e62ff4c7cf4def` | `https://openai.com/index/hugging-face-incident-and-the-road-ahead/`                                                                                          | 기존 사고 기사·발표/갱신 판본·공식 대체 자료 |
| `8bc2cce05a4ccf4a` | `https://www.nature.com/articles/s43588-026-01037-2`                                                                                                          | 논문 전문/초록 접근·실험 조건·정식 식별자    |
| `9f43a79e9c23b1f3` | `https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai` | 계약/계획/집행·수량·기간·두 회사 공식 근거   |
| `33eae878317d27dc` | `https://openai.com/index/introducing-admin-plugin/`                                                                                                          | 발표 당시 기능·권한·현재 문서와의 차이       |
| `b9406ae170bd9133` | `https://openai.com/index/jalapeno-first-results/`                                                                                                            | 연구 결과·시험 조건·원문/논문 판본           |

다음 실행은 첫 사건의 기존 고정 ID·회차·source version을 읽은 뒤 원/공식 대체 자료를 취득하고 근거를 직접 검토한다. 접근 실패를 새 소식 없음이나 공개 제외 판정으로 자동 변환하지 않는다. 기존 실패 기록을 유지하며 근거가 확보되지 않은 기사/분석을 새로 작성하지 않는다.

그 뒤 구형92회차/801구간과 전체 개념·관계·Signals/TrendTopics 판정, 실제 상세/IR/첨부/페이지 이동의 출처 도입, 역할별 모델 정책·독립40개발/20보류 평가, 일일 실행기·Drive 쓰기/재읽기·첫 새 경로 발행·서로 다른 실제 신규7회를 이어간다. 새 모델 다운로드·유료 API·중복 예약·Git 이력 재작성은 이번 묶음에 없다. 전체 goal은 active이며 이 비공개 통합을 전체 구현 완료로 보고하지 않는다.

## 40. 잔여5원문의 수집 상태와 상세 개발 문서화

기준일2026-09-28. 이 절은39절 이후에 저장된 실제 원문 수집 결과를 다시 읽고, 구현 범위/미완료 기능과 다음 개발을 문서화한 기록이다. 문서화 작업에서는 제품 코드·작성 원본·승인 기사/노트·preview·Drive·공개 서비스·예약을 변경하지 않았다. 새 모델 추론도 수행하지 않았다.

### 40.1 실제 수집 run과 상태의 의미

수집 run은 `20260928-retrospective-final-five-source-v1`이다. 시작시각 `2026-09-27T19:18:02.634Z`는 KST2026-09-28 04:18:02다. 요청5건 중2건은 확보/파싱,3건은 HTTP403이었다. 수집/파싱 stage7개는 결과 저장을 완료했으나 기사/사실 검토 완료를 뜻하지 않는다. `candidate_published:false`, `published_by:null`을 유지한다.

이전 실행의 실제 입력은 다음과 같다. 이 명령을 문서 검증 과정에서 다시 실행하지 않았다.

```bash
node scripts/research.mjs collect --run 20260928-retrospective-final-five-source-v1 \
  --url https://openai.com/index/hugging-face-incident-and-the-road-ahead/ \
  --url https://www.nature.com/articles/s43588-026-01037-2 \
  --url https://press.aboutamazon.com/aws/2026/8/aws-and-nvidia-to-deliver-2-million-additional-gpus-and-next-generation-infrastructure-for-agentic-and-physical-ai \
  --url https://openai.com/index/introducing-admin-plugin/ \
  --url https://openai.com/index/jalapeno-first-results/
```

| 고정 사건 ID       | 이번 source ID         | 실제 상태                    | 파싱·검토                                           |
| ------------------ | ---------------------- | ---------------------------- | --------------------------------------------------- |
| `34e62ff4c7cf4def` | `d8e6fd2ea6146d975999` | blocked/403, policy checked  | 본문·parse 없음                                     |
| `8bc2cce05a4ccf4a` | `8bc2cce05a4ccf4a2db5` | captured/200, policy checked | 168블록·발표2026-08-26/day·quality.reviewed:false   |
| `9f43a79e9c23b1f3` | `9f43a79e9c23b1f329d8` | captured/200, policy checked | 28블록·offset 없는 timestamp·quality.reviewed:false |
| `33eae878317d27dc` | `6a76c1b91788dc267c00` | blocked/403, policy checked  | 본문·parse 없음                                     |
| `b9406ae170bd9133` | `9edfd1aea862a8c289b5` | blocked/403, policy checked  | 본문·parse 없음                                     |

제출 URL/최종 URL 또는 과거 URL 표기가 달라 source ID가 기존 event ID의 앞부분과 다를 수 있다. 고정 event ID는 보존한다. robots의 요청 허용과 HTTP 본문 확보를 별도로 읽는다. 원문3건의403을 소식 없음이나 공개 제외로 자동 변경하지 않았다.

private 증거는 `runs/20260928-retrospective-final-five-source-v1/documents.json`, `parses.json`, `state.json`, `journal.jsonl`과 각 stage 결과다. 본문/parse 원형은 같은 private root의 `documents/`·`parses/`에 고정돼 있다.

### 40.2 확보한 두 원문과 발견한 다음 작업

| 자료         | 고정 원문/parse                                                                                        | 현재 확인과 남은 작업                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Nature       | source version `8bc2cce05a4ccf4a2db5:b1bb076d51acf24b505d770c61e78b26a7d23ca08522509d4b9ee1fda9d0d42d` | 날짜 DOM은 matched. 초록/서지/참고문헌 등이 포함되므로 전문으로 승격하지 않음            |
| Nature parse | `89a674980d182b9f3ccc7f3203c7fd9e7c562686c5c2e34656e53a6d71551e63`                                     | 정식85%의 준안정성 조건과 사전공개 표현을 판본별로 검토해야 함                           |
| AWS          | source version `9f43a79e9c23b1f329d8:a20f94c76fb87cb0e38eff67d672a9b9bd670b702aeeac0eeb5f7cfec44679b5` | 확보 DOM에서 `August 26, 2026`/날짜 요소1개·h1 1개를 확인                                |
| AWS parse    | `e49798c8d7690abeab32bdd8b8f93e774eee14a430aa5f843db40d4d7d8002bd`                                     | 발표/수정 timestamp에 offset/basis 없음. exact 표시 날짜 profile과 승인 날짜 회귀가 필요 |

AWS의 현재 날짜는 `2026-08-26T21:09:39.124`, 수정은 `2026-08-26T21:09:49.555`다. 임의의 UTC/KST를 붙이지 않았고 기존 날짜 validator를 수정하지 않았다. actual DOM 날짜를 사용하는 profile은 [수집23.2](SOURCE_ACQUISITION_SPEC.md#232-aws-날짜-profile의-설계와-변경-위치)의 개발 예시다. 설정은 현재24개 그대로이며 새 profile/worker 회귀/재파싱은 수행하지 않았다.

Nature의168블록과 정상 추출 상태를 전문 접근/사실 검토의 합격으로 계산하지 않았다. 정식 논문과 arXiv의 실제 연결, 초록의 용어/조건 차이와 접근 상태는 [수집23.3](SOURCE_ACQUISITION_SPEC.md#233-논문의-초록전문판본-분리)에 기록했다. 공식 페이지가 연결한 사고 보고서 PDF도 대체 확보 후 검토할 후보이며 아직 로컬 파싱/승인하지 않았다.

### 40.3 현재 모델 metadata 재확인

문서화 과정에서 localhost Ollama의 `/api/version`, `/api/tags`, Qwen `/api/show`를 실제 읽었다. 서버0.34.4, Qwen3.8:27b/Q4_K_M의 기존 digest와 지원값 false/low/medium/xhigh·기본medium을 확인했다. Qwen3.6:27b·Qwen3 embedding8b·Gemma4:31b-mlx도 현재 설치 목록에 있었다. 모델 추론·다운로드·클라우드 호출·계정 모델 설정 변경은 하지 않았다.

작업 receipt의 `runtime-metadata.json`에 이 읽기 결과만 저장한다. 지원값과 설치 여부는 품질 평가나 운영 모델 채택 완료를 뜻하지 않는다. 운영 시작 후보/개발 모델 권고와 비용은 [시스템19.3~19.4](LOCAL_AI_NEWS_SYSTEM.md#193-로컬-운영-모델과-개발-모델의-선정), 고정 평가/모델 정책은 [계획19.19.6](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19196-작업-e--모델-정책정보-품질처리-예산)을 따른다.

### 40.4 보강한 문서와 실제 변경 범위

| 문서                                   | 구체적으로 추가/정정한 내용                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `LOCAL_AI_NEWS_SYSTEM.md`              | 실제 기능별 코드/검증/미완료 표, 사건9단계, 운영/개발 모델, 무료 운영/자원, 전체 완료 증거 |
| `SOURCE_ACQUISITION_SPEC.md`           | 남은5원문, AWS exact 날짜와 실패 회귀, Nature 접근/판본,403의 공식 대체 근거와 보존 계약   |
| `LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md` | 날짜·다섯 기사·의존 지식/전체 소급·출처 완주·모델 품질·일일/Drive/발행의6작업 상세 계약    |
| 이 실행 가이드                         | 새 수집 실제 상태·원문/parse·모델 metadata·문서 검증/보존·다음 재개                        |
| `README.md`·`CODEX_TASK_STATE.md`      | 상세 문서 진입점과 현재 완료/미완료 및 재개 위치                                           |

개발 모델 권고의 일부 절에서 Astra/xhigh를 시작값으로 적은 설명은12절과 일치하도록 Astra/high로 정리했다. xhigh는 대표 작업의 오류/시간/사용량 비교 후 선택한다. 이미 시행한 모델 시험의 실제 think/옵션과 원출력 기록은 수정하지 않았다. 학생 승인/통합이 아직 미완료라고 적혀 있던19.17의 현재 안내도19.18.5의 비공개 완료와 Drive/공개 미완료로 바로잡았다.

변경 전6문서와181작성 원본·114개 관련 구현/설정/시험 파일의 SHA를 `.local/research/local-ai/documentation-spec-20260928-source-contracts-v1/baseline.json`과 `before/`에 보존했다. 검증에서는 문서의 파일/앵커·JSON 예시·명령/현 코드·수집/모델 실제 증거를 확인하고 이 보호 파일의 SHA를 다시 대조한다. Node407/worker49/브라우저 결과는39절의 직전 실행 기록이며 이번 문서 편집에서 새로 실행한 결과가 아니다.

### 40.5 다음 재개 위치와 전체 목표 경계

다음은 [계획19.19.2 작업 A](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#19192-작업-a--aws-날짜와-혼합-실패-자료-재파싱)의 실패 fixture와 exact 날짜 profile부터 개발한다. 확보된 AWS/Nature의 사실/기사 검토를 진행하고, 세 blocked 자료는 실제 공개 공식 첨부를 별도 취득해 검토한다. 실패 수집과 과거 판본은 유지한다.

이후 잔여5사건/의존 지식·전체92구형 회차/801구간·전체 개념/관계·독립40/20 평가·역할별 정책·출처 목록/상세/IR/첨부/페이지 종료·일일 실행·Drive 왕복·공개 전환·서로 다른 실제 신규7회를 계속한다. 전체 goal은 active다. 이번 상세 문서화는 전체 시스템의 구현/배포/무인 운영 완료가 아니다.

### 40.6 문서화 검증 결과

문서 보강 후 `documentation-spec-20260928-source-contracts-v1/audit.mjs`를 실행했고 `validation.json`에 PASS를 기록했다. 문서6개에서 로컬 링크434개·Markdown 제목 링크252개·JSON 예시18개를 실제 검사했다. Mermaid3개는 코드블록 목록을 확인했으며 그림 렌더링 시험을 새로 수행한 것은 아니다.

- 과거 실행 가이드/상태 기록의 문단1,231개가 보존됐다.
- 작성 원본181개와 관련 구현/설정/시험114개 파일의 SHA가 변경 전과 같다.
- 실제5요청·2확보 bytes/parse·7stage 결과 hash를 재검증했다. 수집 자료는 여전히 미검토/미발행이다.
- 기존12기사·7노트 승인 묶음을 재읽고 이전 private preview public279개/digest132개의 bytes를 확인했다.
- 직전 Node407/45suites/0fail/0skip·Python49와 브라우저 receipt를 읽어 문서의 수량/판정을 대조했다. 이번 문서 편집에서 제품 테스트/빌드/화면 검증을 다시 실행했다고 보고하지 않는다.
- 변경한6문서의 Prettier check와 Git diff check를 통과했다. 문서 보강 diff와 최종 SHA·검증 결과는 같은 작업 receipt에 보관한다.

실행 명령은 다음과 같다. 첫 명령은 이 작업의 private 검사 파일이며 프로젝트의 새로운 운영 CLI가 아니다.

```bash
node .local/research/local-ai/documentation-spec-20260928-source-contracts-v1/audit.mjs
./node_modules/.bin/prettier README.md CODEX_TASK_STATE.md docs/LOCAL_AI_NEWS_SYSTEM.md docs/SOURCE_ACQUISITION_SPEC.md docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md docs/LOCAL_AI_NEWS_RUNBOOK.md --check
git diff --check
```

## 41. 날짜 파싱 구현과 문서 인계 기준의 갱신

기준일2026-09-28.40절 이후 실제 날짜 구현·재파싱·공식 PDF 확보 결과를 재읽고 상세 문서를 현 코드와 맞췄다.40절의24profiles·새 profile 미구현·PDF 미확보와 당시 검증 수량은 과거 기록이다. 최신 상태는 이 절과 SYSTEM19·SOURCE23·PLAN19.19를 따른다. 문서 보강 구간에서는 새 모델 추론·원문 재수집·기사/노트 승인·preview 생성·Drive 쓰기·배포·예약 변경을 수행하지 않았다.

### 41.1 구현된 날짜 처리와 보호한 범위

구현 checkpoint는 `.local/research/local-ai/aws-date-retrospective-20260928-v1/`다. 변경 전3개 코드/설정/시험 파일·6문서·181작성 원본·기존 수집 manifest는 `baseline.json`/`before/`에 있다. 실제 변경은 다음과 같다.

| 파일                                     | 구현 내용                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/research-acquisition.json`         | AWS/NVIDIA2026-08-26 발표의 exact25번째 profile. `h1`, 표시 날짜 선택자·pattern·format을 지정하고 다른 Amazon URL에는 적용하지 않음                           |
| `integrations/research-worker/worker.py` | 명시 날짜 선택자 실패 때 metadata fallback 확정값을 지움. `source_date_value`가 day/명시 offset timestamp만 허용하고 offset 없는 발표/수정 시각은 후보에 보존 |
| `tests/test_research_worker.py`          | 실제 DOM을 축소한 정상·실패 fixture와6개 신규 회귀 메서드. calendar conflict, 정상day/offset, exact URL 범위를 함께 확인                                      |

`dates.mjs`의 Node 검토 날짜 검사, 기존 source bytes/parse, 기사 event ID, 작성 원본과 기존 private 기사/노트 승인은 변경하지 않았다. 날짜를 확정하기 위해 UTC/KST를 추정하거나 당일을 기본값으로 넣지 않았다.

### 41.2 재현 회귀와 실제 재파싱

먼저 명시 profile 실패의 metadata fallback, offset 없는 timestamp, 미등록 profile을 red로 확인했다. 실패 로그는 `red-aws.log`, `red-publication.log`, `red-timezone.log`에 있다. 구현 이후 결과는 다음과 같다. 이 실행 기록을 문서 검증에서 새로 시험한 결과로 보고하지 않는다.

| 검증                               | 실제 결과와 로그                            |
| ---------------------------------- | ------------------------------------------- |
| Node 관련 날짜/정정/승인/출처 시험 | 45pass/0fail/0skip, `node-focused.log`      |
| Python worker 단독                 | 40tests/OK, `python-tests.log`              |
| Python 전체4개 시험 파일           | 55tests/OK, `python-all.log`                |
| 저장 원문/새 parse/검토 날짜 경계  | 일치, `reparse-readback.json`·`reparse.log` |

6개 신규 메서드는 `test_aws_registered_profile_uses_display_day_without_guessing_timezone`, `test_explicit_publication_profile_failure_does_not_reuse_metadata`, `test_explicit_publication_date_conflict_remains_unresolved`, `test_timezone_less_html_metadata_dates_remain_candidates`, `test_offset_html_timestamps_and_day_metadata_are_preserved`, `test_aws_date_profile_is_scoped_to_one_announcement`다. 하나의 메서드 안에 여러 누락/중복/패턴/달력 실패 subcase를 포함한다. 과거 문서의Python49는 당시 전체 시험 수이며 worker 단독49를 뜻하지 않는다.

실제 명령과 출력 run은 다음과 같다.

```bash
node scripts/research.mjs reparse --run 20260928-final-five-date-reparse-v2 --source-run 20260928-retrospective-final-five-source-v1
```

새 run은5문서/2parse/3blocked를 유지한다. 두 captured 자료의 bytes·source version은 원 수집과 같다. AWS 새 parse `4dcf979e746d51d7074a344a6442274e41cd575adcded2e9a37254d4b33549c6`는 발표2026-08-26/day·profile matched·실제 DOM basis를 갖는다. 수정 시각은null이며 기존 offset 없는 시각을 후보로 보존한다. Nature 새 parse `8b7f2c10828291dccc521a4d8e3945ad6839a73b09cbc75aaccef29e9d15926e`는2026-08-26/168블록을 유지한다. 초록/서지 접근을 전문으로 승격하지 않는다. 양쪽 `quality.reviewed:false`와 미발행 상태를 유지하며 실제 사실 `review`·기사 `approve`는 남았다.

### 41.3 공식 사고 보고서 PDF의 실제 확보

`20260928-hf-official-incident-report-source-v1`은 공식 발표에서 실제 연결한 CDN PDF를 별도 요청으로 확보한 run이다. 수집 로그는 날짜 checkpoint의 `hf-report-collect.log`, 원문/parse/state는 해당 run에 있다.

- HTTP200/application-pdf, PyMuPDF1.27.2.3,38페이지/504블록, 누락 페이지0/OCR 페이지0.
- source version `2869273e2d01cccce129:dd635cf6e5f39f0e1f646f08c36549090d77156ed89cbd3d733ed496648cae9c`.
- parse ID `4c0d08e6a66de9d9f18dba8563f3995e78f9b44e4b589bc9728189956d56a587`.
- 확정 발표일null/precision unknown/profile not-configured, `quality.reviewed:false`·미발행.

PDF CreationDate와 Last-Modified는 원문 제작/HTTP metadata이며 기사 발표일로 사용하지 않았다. 실제 사고/발견/대응/공개 날짜와 회사/독립 조사 주장을 원문별로 검토해야 한다. 최초 HTML의403과 이 PDF의200을 별개로 보존하며 로컬 확보가 되지 않은 독립 조사 자료를 확보 성공으로 표시하지 않는다.

### 41.4 상세 문서의 구성과 모델 확인

문서 인계 receipt는 `.local/research/local-ai/documentation-implementation-handoff-20260928-v1/`다. `before/`·`baseline.json`에 변경 전6문서와 현재114구현/설정/시험·181작성 원본·3수집/재파싱 run의12기록 파일 SHA를 보존했다. 기존40절 receipt를 덮어쓰지 않는다.

| 문서                   | 이번 보강의 책임                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SYSTEM19               | 현 코드/남은 기능 표, 원문→block→claim→문장→기사/지식의 입력·산출물·관문, 로컬/개발 모델·자원·전체 완료 증거            |
| SOURCE23               | 25profile·명시 날짜 실패/시간대 없는 후보·실제 재파싱, 초록/전문·판본, blocked HTML/별도 공식 PDF·날짜/사실 검토 경계   |
| PLAN19.19              | 작업 A의 실제 결과/B~F의 남은 입력·수정·시험·복구·완료, 한 사건의 실제 CLI 순서·검토 파일·혼합 실패/소급/중복 승인 처리 |
| RUNBOOK41·README·STATE | 최신 실제 증거와 문서 진입점, 과거 시험과 새 문서 검증의 구분, 남은 전체 목표와 재개 위치                               |

문서 보강에서 `model-info`로 localhost Qwen metadata를 다시 읽었다. `runtime-metadata.json`에는 서버0.34.4, Qwen3.8:27b/Q4_K_M·digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, 지원값 false/low/medium/xhigh·기본medium과 `inference_performed:false`를 기록했다. API 호출의 `format`·`think`·`stream`·`keep_alive` 계약은 [Ollama API](https://docs.ollama.com/api/chat), [구조화 출력](https://docs.ollama.com/capabilities/structured-outputs), [추론 설정](https://docs.ollama.com/capabilities/thinking)과 대조했다. 실제 현재 `keep_alive:"5m"`, writer false·16,384문맥·기본4,096출력과 추출 CLI 기본medium을 보존한다. 역할별 외부 설정·정책 연결은 앞으로 구현한다.

개발은 Sol/high·설계/식별/Drive 충돌/리뷰 Astra/high를 시작 권고로 두고 제한된 문서 수정은Sol/medium, xhigh는 필요성과 비용 비교 후 선택한다. [Sol 공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-sol), [Astra 공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-astra)를 읽어 지원 범위를 확인했으며 역할별 선택은 프로젝트 판단이다. 이 권고가 새 모델 호출·유료 API·계정 설정 변경을 뜻하지 않는다.

### 41.5 문서 검증과 다음 개발 경계

문서 검증은 Markdown 파일/제목 링크·JSON 예시·실제 CLI 옵션/profile·수집/parse SHA·기존 승인/preview bytes·보호한 원본/코드·과거 실행 문단 보존을 확인한다. 결과와 정확한 검사 수량은 이 receipt의 `validation.json`에 기록한다. 문서 검증만으로 제품 테스트·새 기사 검토·공개 배포를 통과했다고 보고하지 않는다.

실제 문서 검사 결과는PASS다.6문서의 로컬 링크448개·제목 링크267개·JSON 예시18개를 확인했고, 과거 실행/상태 문단1,257개를 보존했다.114구현/설정/시험·181작성 원본·12수집기록 파일 SHA가 문서 보강 전과 같다.3run의11문서 기록/5parse 기록/11stage hash, 기존12기사/7노트 승인 묶음과 prior preview public279/digest132 bytes를 재검증했다. 같은 문서에 재파싱 전/후 기록이 있다는 이유로11개를 서로 다른 원문이나 기사로 세지 않는다. Mermaid3개는 코드블록을 확인했으며 새 렌더링 시험은 하지 않았다. 변경6문서의 Prettier check와 Git diff check도 통과했다.

```bash
node .local/research/local-ai/documentation-implementation-handoff-20260928-v1/audit.mjs
./node_modules/.bin/prettier README.md CODEX_TASK_STATE.md docs/LOCAL_AI_NEWS_SYSTEM.md docs/SOURCE_ACQUISITION_SPEC.md docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md docs/LOCAL_AI_NEWS_RUNBOOK.md --check
git diff --check
```

첫 명령은 해당 문서 작업의 private 검사 파일이며 운영 CLI가 아니다. 전후 diff·최종 SHA·검사 결과는 같은 receipt에 보존한다. 모델 metadata와 이전 시험 로그의 재읽기를 모델 추론/새 제품 시험으로 승격하지 않는다.

다음 개발은 A의 파서/재파싱 결과를 사용해 확보된 AWS/Nature와 공식 PDF의 직접 사실·날짜·판본·한국어 기사를 검토하는 B다. blocked 자료는 실제 과거 snapshot 또는 공식 대체 자료의 확보 상태를 먼저 확인한다. 관련 전문용어·이력과 모든 등장 회차는 C에서 함께 검토한다. 전체92구형 회차/801검토 구간·개념/관계·출처 완주·독립40/20평가·모델 정책·일일 통합·Drive 왕복·첫 공개/실제 신규7회는 남아 있다. 현재 goal은active이며 이번 상세 문서 완료를 전체 시스템 완료로 바꾸지 않는다.

## 42. 상세 개발 문서의 재확인

기준일2026-09-28. 사용자의 상세 문서화 요청에 따라 기존 네 개발 문서를 보강하고 README·이 상태 기록을 연결했다. 이번 작업은 문서 범위다. 서비스 코드·작성 원본·예약·발행 설정을 변경하지 않았다.

| 문서               | 보강한 개발 계약                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| SYSTEM20           | 아침 한 회차의 조사·기사·심층·키워드·보관/배포 산출물, 정보가 충분한 설명, 과거 정정과 새 사건의 구별 |
| SOURCE24           | 출처별 주체/목록/상세/첨부/회귀/실물 패키지, 제조사 우선순위와8분야 보존, exact profile 일반화 조건   |
| PLAN19.20          | 작업별 선행 입력·수정 위치·현재 시험 파일, 검증 명령, 역할별 모델·추론·독립 평가 착수                 |
| 실행 가이드/README | 최신 날짜 구현 기록41과 기사/노트 통합 기록39의 범위를 분리하고 상세 진입점 연결                      |

현재 registry를 실제 함수로 다시 읽어92경로·25개 article profile을 확인했다. 현재 로컬 모델 API의 metadata만 읽어 Ollama0.34.4와 Qwen3.8:27b/Q4_K_M·digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`·지원 추론값 false/low/medium/xhigh·기본 medium을 재확인했다. writer의 false 강제, 추출 CLI의 기본 medium, 역할별 모델 정책/일일 실행기 파일의 미구현을 코드와 대조했다. 새 모델 추론·설치·설정 변경은 이 문서 작업에 포함하지 않는다.

공식 Ollama 구조화 출력/추론, Trafilatura 사용법, PyMuPDF 텍스트 추출, OpenAI Sol/Astra 문서를 확인했다. 지원 API와 이 프로젝트의 권고를 구분하며 외부 문서가 모든 사이트의 파싱 성공 또는 모델 품질 합격을 보장한다고 적지 않는다. 기존 Python 전체55·Node 날짜 관련45 결과는 이전 로그를 재읽었으며 이번 새 시험 실행으로 집계하지 않는다.

문서 전후 사본과181개 작성 원본·107개 선택 구현/설정/시험 파일의 SHA는 `.local/research/local-ai/documentation-development-contract-20260928-v2/`에 보존한다.107은 이번 보호 목록의 분모이며 이전114개 목록을 대체하거나 파일 감소를 뜻하지 않는다. 링크·제목 앵커·JSON·명령/실제 시험 파일·보호 SHA와 Prettier/diff를 확인하고 결과는 같은 receipt의 `validation.json`에 기록한다. Mermaid는 이번 문서 검사에서 렌더링 시험하지 않는다.

이 작업의 완료는 상세 설계와 현재 구현 사실의 일치, 문서 링크/예시의 유효성, 기존 코드·자료 보존으로 판정한다. 실제 전체 소급 판정·독립40/20평가·출처 완주·모델 정책·일일 연결·Drive 쓰기/재읽기·공개 전환·신규7회는 구현 계획에 남아 있다.

문서 감사PASS:6문서·458개 로컬 링크·277개 제목 앵커·18개 JSON 예시·현재 시험 파일20개의 존재, 과거 문단1279개 보존,181원본·107선택 구현 파일의 SHA 동일을 확인했다. 기존3개 수집 run의11문서/5parse,12기사/7노트 승인 묶음과 이전 public279/digest132의 bytes도 재검증했다. 이 수량은 새 기사·새 발행·새 제품 시험의 수량이 아니다. 검사 명령은 `node .local/research/local-ai/documentation-development-contract-20260928-v2/audit.mjs`이며 상세 결과와 문서 전후 diff를 같은 receipt에 보존한다.

## 43. 상세 명세의 현 코드 대조

기준일2026-09-28. 이번 요청은 구현 내용·개발 계획의 상세 문서화다. 기존6문서를 수정하고 실제 설정·CLI·시험·private 원문/초안 레코드와 대조했다. 서비스 코드·작성 원본·모델 설정·예약·배포를 변경하지 않았다. 앞선42절의 정책 파일 미존재는 당시 상태이며 현재 정책 초기 파일의 존재·미연결·시험 실패와 구별한다.

### 43.1 보강한 명세와 실제 입력

| 문서               | 상세 기록                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- |
| SYSTEM21           | 역할별 모델·think·문맥/출력/시간·fingerprint·cache·실패 재개·정보량·일일 입출력/승격        |
| SOURCE25           | 출처 계열별 발견/본문/첨부·adapter 구현 순서·자료별 parser·페이지 종료·정정·납품/완주       |
| PLAN19.21          | 정책 M1~M6 수정 위치·입력·수용 시험·실제 AWS/Nature 소급·지식 연결·독립 평가·일일/원격/공개 |
| README·STATE·이 절 | 현재/계획 구분·문서 진입점·검사 결과·남은 범위·다음 재개                                    |

`registry()`를 CLI와 같은 세 설정 파일로 다시 읽어92경로·25개 article profile을 확인했다.92개 `method`는 모두 html-list이며 ko34/en46/ja5/de3/zh4다. RSS/Crossref/SEC 함수의 존재를 실제 adapter 등록이나 해당 계열의 반복 수집 성공으로 보고하지 않는다. 현재 `discoverChannel()`은 한 페이지 확인을 partial로 기록한다. 실물 기간/페이지/첨부 완주는 후속 개발 계약이다.

Ollama `model-info`로 metadata만 조회했다. 서버0.34.4·Qwen3.8:27b/Q4_K_M·digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`·think false/low/medium/xhigh·기본medium을 확인했다. 다른 모델의 metadata·새 모델 추론·다운로드·설정 변경은 이번 문서 작업에서 실행하지 않았다. 역할5개 설정은 현재 CLI에 자동 적용되지 않는다.

기존 private 레코드를 읽어 AWS 자동 추출10사실의3verified/4deferred/3rejected, 별도 source-reviewed run의9verified와 모델 draft `035c5ab07f5562aba4fd2be2046ff30220fd2d2aaabfb5f7e8a12c71c44cfb33`·editorial_review 상태를 확인했다. Nature run에는7verified 입력만 있고 draft/기사 승인은 없다. 이 숫자는 기존 Codex 직접 검토 레코드이며 독립 human gold나 이번 새 취재/승인이 아니다. 양쪽의 approve·관련 지식·전체 preview 통합은 남았다.

### 43.2 확인한 정책 결함과 후속 구현

다음 현재 시험만 새로 실행했다. 실제 모델 대신 HTTP fixture로 정책의 설정·예산·재개를 검사한다.

```sh
node --test tests/research-model-policy.test.mjs
```

결과10개 중8pass/2fail, exit1이다. 실패는 다음 두 재개 계약이다.

- `same policy and same input reuse a checked result but changed prompts require a new call`.
- `prior settled cost survives restart and blocks new inference when exhausted`.

즉시 반환 provenance에 포함된 선택적 `undefined` 값이 JSON 저장 후 사라져 deep equality가 실패한다. 이는 문서화 시 확인한 기존 작성 중인 모듈의 결함이다. 이번 범위에서 코드를 수정하거나 기대값을 바꾸지 않았다. PLAN19.21의 M1에서 직렬화 계약을 일치시키고 같은 시험을 통과시킨 뒤 CLI·stage 연결과 실물 평가를 진행한다. 이전 전체 Node407·Python55 등은 당시 기록이며 이번 전체 제품 회귀 결과가 아니다.

현재 `research.mjs`에는 `--model-policy` 옵션/역할 wrapper 연결이 없고 search/knowledge stage에 정책 identity도 연결되지 않았다. `daily.mjs`는 없다. 존재하는 정책 파일을 운영 기능 완료로 표시하거나 아직 없는 옵션을 실행 예시로 안내하지 않는다. 기존 추출 CLI 기본medium·writer false 동작은 보존한다.

### 43.3 문서 검사와 보호 범위

작업 receipt는 `.local/research/local-ai/documentation-detailed-spec-20260928-v3/`다. 변경 전6문서를 `before/`에 보존하고 `baseline.json`에296개 관련 코드/설정/시험/웹/작성 원본의 SHA를 기록했다. 실제 명령 출력은 `model-policy-tests.log`, `runtime-metadata.json`, `registry.json`에 보관한다. secret 값을 수집하거나 공개 문서에 넣지 않는다.

문서 검사는 로컬 파일/제목 링크·JSON 예시·현재 시험 경로·현재 CLI/정책/registry/metadata·보호 파일 SHA와 문서 diff/Prettier를 확인한다. Mermaid 코드블록은 검사하지만 이번 요청에서 새 렌더링 시험은 하지 않는다. 결과는 `validation.json`, `format-check.log`, `diff-check.log`, `completion.json`에 기록한다. 새 기사/노트 승인·사이트 생성·Drive 쓰기/재읽기·공개 검사·예약 변경은 수행하지 않는다.

이 문서 작업의 완료 기준은 요구사항과 실제 구현/계획의 구분, 구체적인 입력/산출물/수정 위치/회귀/복구/완료 계약, 유효한 문서 링크와 기존 자료 보존이다. 전체 시스템 목표는 active다. 다음 구현은 정책 직렬화2실패 수정→CLI/RunState 연결·회귀와 확보된 원문의 정확한 기사/지식 검토다. 이후 전체 소급 판정·출처 반복 도입·독립40/20평가·일일/Drive/공개·서로 다른 신규7회를 진행한다.

문서 감사PASS:6문서의 로컬 링크474개·제목 앵커293개·JSON 예시18개·현재 시험 파일21개를 검사했다. 과거 문단1288개와 관련296파일(작성 원본181개 포함)의 SHA를 보존했다. 정책 fixture10개 중8pass/2fail은 확인된 미완료로 기록하며 문서 감사의 성공과 구별한다. 최종 문서 형식/diff 검사와 SHA는 같은 receipt에 보관한다.

## 44. 역할 정책의 실제 CLI 연결과 상세 문서 갱신

기준일2026-09-28.43절은 이전 문서화 당시의 미연결/8pass·2fail 기록이다. 후속 구현의 코드와 실행 결과를 다시 읽어 현재 명세에 반영했다. 이번 문서화 구간에서는 서비스 코드·작성 원본·예약·배포를 변경하지 않았다. 상세 문서6개와 보호 파일573개의 변경 전 SHA를 `.local/research/local-ai/documentation-current-implementation-20260928-v4/`에 보존한다.

### 44.1 현재 구현의 책임과 연결

| 실제 위치                           | 수행하는 일                                                                     | 보존하는 조건                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `scripts/research/model-policy.mjs` | 역할 설정·metadata 지원값·모델 digest·호출 예산·비용/결과 ledger·cache 검사     | boolean false와 문자열 구분; 선택 통계 누락 유지; 설정/모델/런타임/입력 변경 재사용 차단 |
| `data/research-model-policy.json`   | search_plan/fact_extract/article_write/concept_write/evidence_compare 시작 설정 | 필수·허용 필드·문맥/출력/시간 범위 검증; 새 유료/클라우드 모델 없음                      |
| `scripts/research.mjs`              | 선택적 `--model-policy`·명시 override·생성 명령 역할 대응·정정 초안 보호        | 정책 없는 기존 CLI 유지; 생성 외 명령 사전 거부; extract 예산을 유효 정책 문맥으로 검증  |
| `search.mjs`·`knowledge-editor.mjs` | 정책 identity를 외부 RunState와 내부 stage에 전달                               | stage cache가 정책 검사를 우회하지 않음; 기존 승인 지식 변경과 구분                      |
| 정책/CLI 시험 파일                  | 재개·예산·변조·default/override·기사/검색/용어의 실제 CLI 경로 검사             | fixture는 구조/오류 검증이며 실물 모델 품질이나 발행 실적이 아님                         |

정책을 지정할 수 있는 실제 명령은 다음5개다. 공통 추가 인수는 `--model-policy data/research-model-policy.json`이다.

| 명령               | 적용 역할     | 선행 입력/주의                                                          |
| ------------------ | ------------- | ----------------------------------------------------------------------- |
| `queries`          | search_plan   | 기존 watchlist·조사 기간·backlog; 기본32칸과 제조사30질의 유지          |
| `localize-queries` | search_plan   | 해당 run의 저장된 계획; 현지어 보완 후 전체 구조 재검증                 |
| `extract`          | fact_extract  | 수집/parse 또는 `--source-run`의 고정 입력; 추출된 사실은 아직 미검토   |
| `draft`            | article_write | reviewed-claims와 원문; `--deep`는 별도 전문/심층 검토 계약 필요        |
| `knowledge-draft`  | concept_write | 명시 `--review` 입력과 기존 vault/검토 근거; 기사 승인·노트 승인은 별도 |

`--model`/`--think`를 사용자가 명시한 경우만 정책을 덮어쓴다. `--think=false`는 boolean false로 변환한다. CLI의 기본medium이 정책 false를 덮어쓰지 않는다. 예산 CLI 인수6개는 extract에만 지원한다. 검색·기사·용어 역할 예산은 정책 JSON으로 설정한다. `evidence_compare` 전용 명령과 `daily`는 아직 없다.

예산 ledger는 `runs/<run>/model-policy/<role>/budget.json`의 model-budget/v1이다. 실행 binding, attempt의 running/complete/failed·reserved_ms·wall_ms·request fingerprint·result hash를 보존한다. 중단된 running 예약은 재개 비용에 반영하며 실패를 성공 cache로 바꾸지 않는다. 완료값은 즉시 반환/JSON 저장/재읽기의 동일 계약으로 정규화했다. 정정되거나 승인된 draft의 모델 재집필은 새 run에서 수행하며 기존 검토 원고를 덮어쓰지 않는다.

### 44.2 실제 시험 결과와 실물 호출

구현 receipt는 `.local/research/local-ai/model-policy-integration-20260928-v2/`다. 이전 실패와 수정 전 파일, 집중/전체 시험, TypeScript와 실물 draft 결과를 보존한다. 현재 실행 결과는 다음과 같다.

```sh
node --test tests/research-model-policy.test.mjs \
  tests/research-model-policy-cli.test.mjs \
  tests/research-extraction.test.mjs \
  tests/research-knowledge-editor.test.mjs \
  tests/research-search.test.mjs
npm run test:garden
npx tsc --noEmit
```

- 집중53pass/0fail/0skip, 약3.535초. 기존 정책10개·새 CLI10개와 관련 추출/검색/지식 시험을 포함한다.
- 현재 `npm run test:garden`264pass/0fail/0skip, 약5.869초. 이전 기록407개·45suites를 이번 결과로 보고하지 않는다.
- TypeScript exit0. 이번 정책 연결은 Python worker를 수정하지 않았으며 Python55개는41절의 이전 검증이다.
- 핵심 회귀: 누락 token 통계의 JSON 재개, 정책 false·명시 override, 정책 문맥으로 예산 검증, 설정/digest/runtime 변경, 실패 비용/중단 예약/hash 변조, stage 우회 차단, 정정 draft 보존, 현지어 보완의32칸/30제조사 질의 보존.

실제 실행한 Nature 집필 명령은 아래다. 이는 **실행 증거**이며 해당 과거 run을 무조건 재실행하는 운영 지침이 아니다.

```sh
node scripts/research.mjs draft \
  --run 20260928-nature-source-reviewed-editorial-v1 \
  --model-policy data/research-model-policy.json
```

Ollama0.34.4·Qwen3.8:27b/Q4_K_M, model digest `22130167c4c20e20c7b71454612966ca8e8171e9b3cc8ab6ce8aa6cbfec79643`, article_write/false·문맥16384·출력4096·temperature0으로 완료됐다. ledger wall132594ms, 입력1810/출력962tokens다. 실제 model-policy binding과 요청/응답/hash는 private run에 있다.

초안 `6d8e6fffc5b8162d9f26832b4336e92077fca0c8b13770a9dc376df378667638`은 `editorial_review`, `invalid_reader_prose`, `public_approved:false`다. `E hull < 0.1 eV`의 `<`가 현재 독자 문장 검사를 통과하지 못했다. 같은 의미의 한국어 표기와 반복 설명을 직접 정정하고 원문을 다시 대조해야 한다. 검사를 낮춰 발행하지 않았다.7검토 사실의 입력과 모델 호출 성공은 기사 승인·전문 논문 심층·독립 평가 합격의 증거가 아니다.

AWS는 기존9검토 사실과 초안만 있으며 Nature와 함께 아직 미승인이다. 기존12기사/15노트의 승인 및 전체 preview에 이번 초안을 추가하지 않았다. 새 Drive 쓰기/재읽기·공개 발행·예약 변경도 수행하지 않았다.

### 44.3 상세 개발 문서와 다음 재개점

- SYSTEM19/21: 실제 역할 정책과 아직 없는 비교/하루 실행·운영 품질을 구분; 설치/실물 호출/원고 승인 구분, 모델·추론·입력/출력·예산·재개 책임.
- SOURCE25.6~25.9: 제조사 기술/IR·고객·전문지·공시·논문/TLO 도입 순서, 실제 RSS 발견·SEC/DART/arXiv 계약, 본문/날짜/표/PDF/OCR fixture와 페이지 종료/receipt.
- PLAN19.21: 구현된 M1~M5와 남은 M6, B/C/D/E/F의 입력·변경 위치·납품·수용·복구·개발 모델/추론 권고.
- README/STATE: 현재 문서 진입점·검증과 미완료 범위. 문서화 완료는 전체 구현goal의 완료가 아니다.

다음은 B의 AWS/Nature 직접 정정·기사 승인→C의 inference/science 의존 노트 통합→기존12기사/15노트를 보존한 전체 private preview다. 이후 남은 사건/전체 소급·출처 반복 완주·독립40/20평가·일일/Drive/공개·신규7회를 진행한다. 관련 원문·판본·후보·기존 원고·검토 이유는 private에 보관한다.

문서 감사는6개 문서의 파일/제목 링크·JSON·형식·diff와 보호573파일 SHA를 검사하고 같은 documentation receipt에 기록한다. 이번 요청으로 새 추론·기사/노트 승인·전체 사이트/브라우저·Drive/공개 검사를 수행한 것처럼 표시하지 않는다.

문서 감사PASS:6문서·로컬 링크478개/제목 앵커297개·JSON 예시18개, 과거 문단1306개 보존, 보호573파일과 작성 원본181개 SHA 동일. 최초 감사에서 발견한19.21.1의 이전 제목 링크와 남은 미연결 설명을 현재 구현으로 정정한 뒤 통과했다. Prettier와 Git diff check도 통과했으며 코드/원고/원격/예약의 추가 변경은 없다. 실제 검사·변경 전 문서·diff·최종SHA는 documentation-current-implementation-20260928-v4에 보존한다.

## 45. AWS·Nature 기사와 의존 노트의 비공개 통합

기준일 2026-09-28. 이 절은44절 이후 실행한 소급 기사·지식 연결 결과다. 44절의 “AWS/Nature 미승인”은 그 당시 상태로 보존한다. 이번 결과는 **원문 검토→직접 정정→기사 승인→의존 지식 검토/승인→전체 비공개 preview→로컬 화면 검사**까지이며 Drive 권위 원본·GitHub·공개 사이트·예약의 완료 증거가 아니다.

### 45.1 두 사건의 출처·범위와 승인

| 사건       | 원문과 읽은 범위                                                                            | 최종 비공개 승인                                                                 | 독자 문장의 조건                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS/NVIDIA | AWS 2026-08-26 공식 발표, 고정 source version/parse와 직접 검토9사실                        | run `20260928-aws-source-reviewed-editorial-v1`; 기존 사건 `9f43a79e9c23b1f3`    | Blackwell Ultra·Rubin·Rubin Ultra GPU200만 개는 **2027~2028년 추가 배치 계획**. 2026년부터 100만 개 이상이라는 기존 계획과 구분. Vera CPU/NVHBM·Nemotron·Amazon Robotics는 발표문의 각 진행 상태로 서술 |
| CrysVCD    | Nature Computational Science 2026-08-26 정식 페이지의 **초록·서지** 168블록, 직접 검토7사실 | run `20260928-nature-source-reviewed-editorial-v1`; 기존 사건 `8bc2cce05a4ccf4a` | 조성 생성→확산 결정 구조, 원자당 Ehull0.1eV 미만 준안정성85%와 **별도** 포논 안정성68%. 초록만 확보했으므로 전문 실험 해설/상용 성능으로 확장하지 않음                                                  |

Nature의 정책 기반 모델 원출력은 `invalid_reader_prose`에서 거부됐다. `E hull < 0.1 eV`를 독자에게 읽히는 한국어 조건으로 정정하고 반복 설명을 줄인 뒤 다시 원문 블록과 문장별 claim을 대조했다. 한 번 더 기관명 번역/metadata entity 검사가 거부된 것도 기록하고, 본문 한국어는 유지하되 정규 entity 값을 원문 이름으로 복구했다. 검증기를 완화하지 않았다. AWS 역시 CPU·칩/메모리, EC2/Nemotron, Amazon Robotics 작업을 별도 설명으로 나누고 계획/진행/기존 제공 상태를 보존했다. 두 기사 모두 최초 사건 ID, 2026-08-26 발표일, 기존 등장 회차 `Editions/2026/08/2026-08-27_0802_Tech_AI_Briefing.md`를 유지한다. 혼합 추론이 들어 있던 기존 부속 섹션3개는 비공개 projection에서 비웠다.

실제 실행된 편집 입력·이전 원고·결정·최종 해시는 `.local/research/local-ai/aws-nature-integrated-editorial-20260928-v1/`에 있다. 특히 `aws-approval.json`, `nature-approval.json`, `make-approval-inputs.mjs`, 두 correction 입력을 함께 읽는다. `approved-article.json`의 `candidate_published:false`는 기사 검토 승인과 실제 공개를 분리한다.

### 45.2 의존 노트의 전체 승인 묶음

기존 `20260927-nvidia-versioned-dependent-notes-v2`의4노트 묶음은 새 AWS 근거와 함께 **새4노트 묶음**으로 다시 검토했다. `AI Inference Infrastructure`만 AWS 사실·2026-08-26 이력·원문이 늘고, `AI Agent Security` 및 8월25/29일 Signals의 이전 사실·ID는 보존했다. Nature는 기존 `20260928-science-ppe-dependent-notes-v2`의 과학 발견 AI 노트를 새1노트 묶음으로 검토해 CrysVCD 방법·정확한 두 안정성 지표·출판일 이력을 연결했다. 기존 AlphaFold/PPE 설명과 넓은 응용 개념의 지도 제외를 유지했다. `science`는 기사에서 용어 페이지로 연결되지만 지도 노드로 자동 추가되지 않는다.

```sh
node scripts/research.mjs note-review \
  --run 20260928-aws-inference-dependent-notes-v1 \
  --review .local/research/local-ai/aws-nature-integrated-editorial-20260928-v1/nvidia-aws-dependent-notes-review.json \
  --vault vault

node scripts/research.mjs note-review \
  --run 20260928-crysvcd-science-dependent-note-v1 \
  --review .local/research/local-ai/aws-nature-integrated-editorial-20260928-v1/science-nature-dependent-note-review.json \
  --vault vault
```

둘 다 exit0이고 승인 결과는 각각4노트/1노트, `candidate_published:false`, `drive_verified:false`다. 직접 원문 claim·이전 권위 원본 SHA·용어 ID/별칭/관계 근거·검토 날짜가 `note-review.mjs` 검사에 들어갔다. 입력 생성기는 같은 checkpoint의 `make-dependent-note-inputs.py`다. 승인된 대체 내용은 `.local/research/local-ai/runs/<run>/approved-notes.json`에 있으며 **권위 `vault/` 파일을 쓰지 않는다.**

### 45.3 전체 사본과 읽기 경로 검사

기존12기사 승인 run과 새 AWS·Nature 2개를 합치고, 기존7지식 묶음 중 겹치는 NVIDIA/Science 2묶음을 새 승인 묶음으로 교체했다. 실행 결과:

| 결과                    | 값/확인                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| private preview run     | `20260928-aws-nature-integrated-private-site-v1`                                                       |
| 승인 입력               | 기사14개 run·지식7개 묶음·승인 노트15개                                                                |
| 영향을 받은 기존 브리핑 | 9개. AWS와 CrysVCD의 원래 8월27일 회차 포함                                                            |
| 채널 생성               | HTML279파일·digest Markdown132파일; 웹/브리핑/RSS/digest의 승인 문장·출처/날짜는 preview verifier 통과 |
| 식별자                  | 이전 RSS GUID·pubDate·순서40개 보존. 두 사건의 고정 ID와 발표일2026-08-26 유지                         |
| 공개 상태               | `candidate_published:false`, `drive_verified:false`, manifest의 `browser_verified:false` 그대로        |

manifest는 `.local/research/local-ai/runs/20260928-aws-nature-integrated-private-site-v1/preview-manifest.json`이다. 비공개 생성기가 실행한 내부 HTML/XML/Markdown 일치 검사를 통과했고, 별도로 Python Playwright의 로컬 HTTP server에서 두 기사와 두 용어 페이지를 1440×900·390×844 화면으로 열었다. 발표일·제목·`#AI추론인프라`/`#과학발견AI`→용어 이력의 기사 링크가 동작했고 네 경우 모두 가로 넘침이 없었다. 실행 기록·스크린샷은 checkpoint의 `preview-ui-smoke.json`과 `preview-*.png`다. 로컬 headless 검사는 manifest의 웹 검증 flag나 실제 기기·공개 URL 검증으로 승격하지 않았다.

`dependent-integration-check.json`은 보호한 작성 원본181개와 AWS/Nature 원문·검토 관련10파일의 SHA가 이전과 같은지, 14/9/15·RSS40/화면4 검사를 다시 수행한 결과다. 이번 문서화와 비공개 통합 뒤 `npm run test:garden`을 새로 실행해 **264pass/0fail/0skip**(약6.36초), `npx tsc --noEmit` exit0을 확인했다. 44절의 집중53/전체264·TypeScript 결과는 정책 연결 당시의 별도 시험이다. 이번 명령의 성공은 로컬 승인과 미리보기의 증거이고 새 자료의 Drive 저장·공개 발행·운영7회를 증명하지 않는다.

### 45.4 다음 실행 지점

1. 초기 잔여5사건 중 아직 승인되지 않은 OpenAI/Hugging Face 사고·OpenAI 관리 발표·Jalapeño 연구3건을 원문/대체 공식 자료에서 확인한다. HTML 차단을 숨기지 않고 공식 PDF와 날짜 근거를 별도 판정한다.
2. 전체 과거 회차/기사/용어/관계·Signals/TrendTopics inventory를 사건별로 닫고, 수정/제외 영향을 기존 URL·RSS·검색·지식 이력에 전파한다.
3. [수집 명세25.10](SOURCE_ACQUISITION_SPEC.md#2510-다음-출처-도입의-수집파싱-검증-패키지)의 실제 RSS/공시/논문·제조사 기술/기업 두 축을 한 경로씩 완주한다. 병행해 독립40/20 평가와 모델 비용·읽기 품질을 판정한다.
4. [계획19.22](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1922-현재-승인본에서-전체-운영까지의-실행-계획)에 따라 기존 오전8시 경로의 일일 실행→Drive 보관/원격 재읽기→실제 웹/RSS/GitHub 대조→서로 다른 신규7회 운영을 검증한다.

## 46. OpenAI·Hugging Face 사고의 원문 묶음·기사·지식 통합

기준일 2026-09-28. 45절의 AWS·CrysVCD 비공개 결과를 보존한 채 기존 사건 `34e62ff4c7cf4def`를 추가 검토했다. 이 절의 승인·미리보기는 **권위 vault 수정, Drive 원격 보관, GitHub 게시 또는 공개 배포가 아니다.** 이전 절의 “남은 3건”은 당시 수량이며, 이 절 이후 아직 기사 판정이 남은 사건은 OpenAI Admin plugin과 Jalapeño 연구 2건이다.

### 46.1 원문 확보와 날짜 파싱

| 자료                   | 고정 수집·파싱 근거                                                                                                                                                                            | 읽은 범위와 한계                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI 기술 보고서 PDF | `20260928-hf-official-incident-report-source-v1`; source version `2869273e2d01cccce129:dd635cf6e5f39f0e1f646f08c36549090d77156ed89cbd3d733ed496648cae9c`; 38쪽/504블록                         | 회사의 조사, 사고 날짜·영향·대응을 회사에 귀속한다. PDF 생성 시각은 게시일 근거로 사용하지 않는다.                                                                    |
| METR 독립 조사 HTML    | `20260928-metr-hf-investigation-source-v1`→`20260928-metr-hf-date-reparse-v1`; source version `8e38112b54f32b66b991:405de9f2b28d6b431fae6d5bbdddf0b1ce5d764b0fa4360b8fb24da1203ba565`; 771블록 | 화면의 `August 26, 2026`과 본문 “동시 게시” 기록을 날짜 근거로 사용한다. 조사는 주로 7월7~13일 에이전트 활동이며 OpenAI의 후속 대응 전체를 독립 확인한 자료가 아니다. |

기존 OpenAI 소개 페이지의 수집 응답은 403 상태로 남긴다. 인증 우회나 실패한 HTML을 성공으로 바꾸지 않고, 실제 확보한 **공식 PDF**와 **독립 조사 HTML**을 기사 근거로 삼았다. METR 페이지는 처음에는 `dates.published_at:null`이었다. 실제 DOM의 `div.header-date > span.post-date`를 이 URL만의 profile로 등록했다. `reparse`는 원문 bytes/source version을 바꾸지 않고 parse ID만 새로 만든다. 날짜는 `2026-08-26/day`, DOM basis는 해당 날짜 요소이며, 전·후 블록 수 771과 모든 블록 텍스트가 동일하다. 날짜 누락·중복·형식 오류·다른 URL로의 오적용은 worker 회귀로 막는다.

```sh
node scripts/research.mjs reparse \
  --run 20260928-metr-hf-date-reparse-v1 \
  --source-run 20260928-metr-hf-investigation-source-v1

node scripts/research.mjs bundle \
  --run 20260928-hf-openai-metr-bundle-v1 \
  --source-run 20260928-hf-official-incident-report-source-v1 \
  --additional-source-run 20260928-metr-hf-date-reparse-v1
```

새 `bundle` 명령은 기존 수집 run 2~8개를 **재다운로드 없이** 결합한다. 각 입력의 저장 원문 SHA와 immutable parse를 먼저 검증하고 중복 run/source version을 거부한다. 출력 `documents.json`·`parses.json`과 `source-bundle.json`에는 입력 run별/합본 hash가 남는다. 같은 run의 입력이 바뀌면 덮어쓰지 않고 새 run을 요구한다. 이는 독립 출처를 한 기사에 함께 인용하기 위한 보관·검토 경로이며, 미취득·차단 source를 자동 보완하지 않는다.

### 46.2 사실 추출, 로컬 집필, 직접 정정

38쪽 보고서와 771블록 독립 조사 전체를 이번 건에서 모델이 전수 추출했다고 표시하지 않는다. 두 원문을 직접 읽어 선별한 **8개 사실**을 `manual-source-extraction/v1`, `model_generated:false`로 기록하고, 원문 block/quote·숫자 조건·발표일·조사 범위를 개별 검토했다. `review` 결과는 verified 8, deferred/rejected 0이다. 실제 입력과 검토 결정은 `.local/research/local-ai/20260928-hf-editorial-v1/prepare-claims.mjs`, `fact-review.json`, 합본 run의 `claims.json`·`reviewed-claims.json`에 있다. 사람이 골라 작성한 사실과 로컬 LLM 추출 성능은 구분한다.

이 **검토된 사실 8개**를 `article_write` 역할 정책으로 Qwen3.8:27b/Q4_K_M에 전달했다. 실제 호출은 `think:false`, `num_ctx:16384`, `num_predict:4096`, `temperature:0`; 원고 생성 wall 159.534초, 입력 1,831/출력 1,005토큰이었다. 모델 원고는 구조 검사를 통과했지만 ‘내부 모델이 사고의 주된 원인’이라는 출처 밖 인과 표현, 회사 주장과 독립 확인을 혼동할 수 있는 소제목을 직접 정정했다. 두 correction 입력과 이전 draft ID를 보존했으며 검증기를 낮추지 않았다. 최종 제목은 **「OpenAI·METR, Hugging Face 침해 사건 조사 결과 공개」**, 발표일은 2026-08-26, 검토일은 2026-09-28이다. 7월 사고 발생과 8월 보고서 게시를 섞지 않고, 약 1,200개 에이전트/7만 건 이상/약 700개 에이전트 수치를 METR 집계로 귀속했다. 회사의 고객 데이터·제품 영향은 OpenAI 발표로만 적었다.

기사 승인 run은 `20260928-hf-openai-metr-bundle-v1`, 원 사건 ID는 `34e62ff4c7cf4def`다. `approval.json`의 retrospective packet은 기존 8월27일 회차의 원문 전체 SHA와 부속 문단을 대조한다. 근거 없는 기존 흐름·권고·색인 문장은 비공개 projection에서 제외하고 기존 기사 URL·회차·RSS GUID/pubDate를 유지한다. `approved-article.json`은 공개 파일이 아니다.

### 46.3 의존 용어·트렌드와 최종 비공개 화면

기존 `AI Agent Security`의 승인된 NIST·SDK·MCP·NemoClaw 정의/관계를 보존하고, 새 원문 두 개를 verified sources에 넣었다. 2026-08-26 이력에는 회사 발표와 METR가 확인한 비인가 통신·공격 참여 수치를 각각 명시해 `[[News/34e62ff4c7cf4def]]`로 연결했다. 기존 8월27일 Signal의 “중단 조건이 함께 실패”라는 직접 뒷받침되지 않은 판단은 삭제하고 실제 보고된 격리 우회와 에이전트 간 통신으로 교체했다. Signal의 검토 근거는 허용된 `primary-research`, 검토일은 2026-09-28이다. 앞선 AWS 승인의 4노트 묶음과 충돌하지 않도록 같은 보안 용어를 포함한 **5노트 통합 승인** `20260928-hf-aws-dependent-notes-integrated-v2`를 새로 만들고 이전 묶음은 보존하되 최종 preview에 중복 투입하지 않았다.

최종 비공개 run `20260928-hf-aws-nature-integrated-private-site-v4`은 승인 기사15건, 영향받은 과거 회차9개, 승인 노트16개, HTML279개, digest132개를 생성했다. 8월27일 원래 기사 URL에 수정 원고가 나오고, 뉴스→`#에이전트보안`→용어 이력→기존 기사 링크가 동작한다. 기사와 브리핑에 지도는 없고 웹의 두 원문, 브리핑, RSS, Markdown 출처·날짜를 대조했다. 이전 비공개 사본의 RSS40개 `(GUID,pubDate)` 순서가 그대로 유지됐다. 출처가 여러 곳일 때 `원문 2` 대신 각 발행처 이름을 표시하도록 웹/브리핑 출처 링크도 정리했다.

Python Playwright 로컬 HTTP 미리보기에서 기사/용어 페이지를 1440×900과 390×844로 열어 제목·발표일·태그 이동·이력 역링크·가로 넘침 없음·두 발행처 링크를 확인했다. 실행 기록과 스크린샷은 `.local/research/local-ai/20260928-hf-editorial-v1/preview-ui-smoke.json` 및 `preview-*.png`에 보존한다. 이 화면 시험은 실제 휴대폰·공개 URL·Drive 검증이 아니다. `npm run test:garden` 266pass/0fail/0skip, worker43pass, `npx tsc --noEmit` exit0, `git diff --check` 통과를 확인했다. manifest의 `candidate_published:false`, `drive_verified:false`, `browser_verified:false`는 로컬 미리보기가 운영 검증으로 승격되지 않았음을 나타낸다.

같은 checkpoint의 `final-integrity.json`은 작성 원본181개·보호 원문10개 SHA 불변, METR 771블록 일치, 승인15/9/16, HTML279/digest132, RSS40 식별자, 화면 2크기와 비공개 상태를 별도로 검사한 영수증이다. `documentation-audit.json`은 README·상세 4문서·상태 기록의 로컬 링크502개/제목 앵커322개/JSON 예시18개를 검사해 오류0을 기록했다. 이 두 로컬 영수증도 원격 Drive/공개 배포의 readback을 대신하지 않는다.

### 46.4 남은 실행 경계

남은 기사 판정은 Admin plugin과 Jalapeño 2사건이다. 두 원 URL의 403은 ‘새 소식 없음’이 아니며 대체 공식 원문, 정확한 게시일, 제품/연구 주장과 의존 개념을 다시 조사해야 한다. 이어 전체 구형 회차/801 구간 및 연결·지식 영향 판정, 제조사·IR·RSS/공시/논문 반복 수집, 독립 40/20 평가, 단일 오전8시 daily/Drive 원격 readback, 실제 공개/RSS/GitHub 대조와 신규 성공7회가 남는다. 이 절의 소급 기사 1건은 신규 성공 회차에 세지 않는다.

## 47. Admin plugin·Jalapeño 공식 HTML의 접근 재확인과 편입 계획

2026-09-28 07:48~07:52 KST에 앞 절의 잔여 두 사건 원 URL을 재확인했다. `node scripts/research.mjs collect --run 20260928-openai-admin-jalapeno-primary-v1 --url https://openai.com/index/introducing-admin-plugin/ --url https://openai.com/index/jalapeno-first-results/`는 두 `documents.json` 항목을 모두 `fetch_status:blocked`/HTTP403으로 남겼고 `parses:[]`다. `candidate_published:false`이며 기존 `20260928-retrospective-final-five-source-v1`의 같은 403 두 건도 보존했다. 현재 Node 경로의 host 정책은 robots 허용을 확인했지만 HTTP 본문은 받지 못했다.

별도 일반 Python `urllib.request` HTTPS GET에서 두 공식 페이지가 HTTP200/HTML로 응답했다. 새 `.local/research/local-ai/openai-source-recovery-20260928-v1/`에 원 bytes와 `capture-manifest.json`을 비공개 저장했다. manifest에는 원/최종 URL·관측 시각·상태·MIME·크기·SHA와 `article_review_status:unreviewed`가 있다. 저장 HTML을 다시 해시로 읽어 검증한 결과는 다음과 같다.

| 문서         |     저장 크기 | SHA-256                                                            | 화면에서 확인한 기사 머리                                                                              | 콘텐츠 조사 단서                                                         |
| ------------ | ------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Admin plugin | 405,777 bytes | `cb3923fdaa4f8d4b3cda39c3baecc0d6298fb91605a21478ec0c7c5ddedfc5c5` | `Introducing the Admin plugin for ChatGPT Work and Codex`, August 25, 2026                             | 기사 내부 h1 1/h2 7/p 21/li 18; `Author`·`Keep reading` 제외 필요        |
| Jalapeño     | 566,864 bytes | `99ccd71ffb35255603cdcfe0f6bbb49dc65545a57abc013997701df994d2e0e9` | `Jalapeño’s first results show industry-leading speed and efficiency in AI inference`, August 25, 2026 | 기사 내부 h1 1/h2 7/h3 9/p 73/figure 10/figcaption 6; Appendix 보존 필요 |

두 페이지의 전체 `//time`에는 각각 관련 기사 날짜 3개가 포함된다. 게시일은 `article` 머리의 `August 25, 2026`을 단일 매치로 확인해야 한다. [공식 Admin 원문](https://openai.com/index/introducing-admin-plugin/)의 약45% 지원 티켓 해결은 OpenAI IT의 Slack 기반 ChatGPT Work agent 사례에 붙으며 plugin 자체 성능 지표가 아니다. [공식 Jalapeño 원문](https://openai.com/index/jalapeno-first-results/)의 비교는 OpenAI의 InferenceX 시험·선정한 세 모델/시스템/전력 정규화 조건과 함께 읽어야 한다. 이번 단계에서는 원문 저장과 DOM 규모·날짜 후보만 확인했으며 해당 문장을 claim으로 승인하지 않았다.

```sh
shasum -a 256 \
  .local/research/local-ai/openai-source-recovery-20260928-v1/admin-plugin.html \
  .local/research/local-ai/openai-source-recovery-20260928-v1/jalapeno-first-results.html

node scripts/research.mjs collect \
  --run 20260928-openai-admin-jalapeno-primary-v1 \
  --url https://openai.com/index/introducing-admin-plugin/ \
  --url https://openai.com/index/jalapeno-first-results/
```

두 번째 명령은 위 403 증거의 당시 실행 형식이다. 같은 run을 무작정 재시도해 수동 HTML 편입을 끝냈다고 표시하지 않는다. `urllib`과 Node 결과가 갈린 원인은 아직 특정하지 않았다. 수동 HTML은 기존 `documents/`/`parses/` 계약에 자동 편입되지 않고, 편집 기사·Knowledge·Signals·TrendTopics·전체 preview에도 아직 연결되지 않았다. 별도 수입 관문/정확한 article profile/직접 사실 검토/기존 ID와 의존 자료의 비공개 승인·전체 사본 검증이 [수집 명세25.12](SOURCE_ACQUISITION_SPEC.md#2512-공식-html에-접근-경로별-결과가-다른-경우)와 [계획19.24](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1924-admin-pluginjalapeño-두-사건의-원문-편입과-기사-재구축)의 다음 작업이다. 이번 원문 확보는 새로운 오전8시 성공 회차, Drive 보관 또는 공개 배포가 아니다.

비공개 `20260928-openai-source-documentation-v1/source-capture-validation.json`은 원본 두 파일의 바이트/SHA·기사 h1/발표일 단일 선택·같은 URL의 Node blocked 시도·`unreviewed`를 재검사해 PASS다. 같은 체크포인트의 `documentation-audit.json`은 README·상태 기록·상세 네 문서의 로컬 링크 510개, 제목 앵커 330개, JSON 예시 18개와 보호된 원본/기존 비공개 preview 수량을 검사해 오류 0이다. 이 검사는 새 article profile/claim/모델 품질/Drive/공개 결과의 수용 시험이 아니다.

## 48. 두 공식 HTML의 오프라인 편입과 실제 파싱

2026-09-28, 47절에 보존한 원문을 네트워크 재요청 없이 수입했다. 구현과 파싱 결과를 구별하는 기준은 다음과 같다.

| 항목           | 현재 구현·실제 입력                                                              | 확인한 결과                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 수입 CLI       | `scripts/research.mjs import-capture`                                            | 같은 원 URL에 대해 policy-allowed HTTP403이 있던 run과 수동 HTTP200 manifest·bytes를 함께 요구한다. 수입 run의 `candidate_published:false`.                                                                                                                |
| 수입 검증/보관 | `scripts/research/archive.mjs`의 `inspectManualCapture`·`storeManualCapture`     | root-relative 경로, 공개 HTTPS, 같은 origin, 응답 상태/MIME, 크기/SHA, 중복 ID/버전, 관측 날짜, 기존 blocked 정책 결과 확인. 불변 `documents/<source_id>/<sha>/body.bin`/`document.json`과 `attempts/manual-*.json` 생성. 원 `latest.json`과 403 run 유지. |
| 기사 profile   | `data/research-acquisition.json`의 exact URL 두 개                               | `//article//h1`, 머리 날짜 `//article/div[1]/div[1]/div/div/div/div[1]/p`, 본문 `//article/div[2]/div`, `h2/h3/p/li/figcaption` 블록. 관련 기사/TOC/Author/Keep reading 제외.                                                                              |
| 실제 저장 run  | `.local/research/local-ai/runs/20260928-openai-admin-jalapeno-manual-import-v1/` | 두 source version과 두 parse가 생성됐다. Admin 21블록, Jalapeño 77블록, 두 발표일 모두 `2026-08-25/day`와 머리 DOM basis. Jalapeño Appendix·InferenceX·비교 수치 문자열 포함.                                                                              |
| 공개/검토 경계 | 두 `document.json`/run manifest                                                  | `article_review_status:unreviewed`, `candidate_published:false`. 이 단계는 claim·기존 기사/노트 승인, Drive 업로드, 공개 발행에 해당하지 않는다.                                                                                                           |

실행 명령은 repository root에서 다음과 같다. `--review`는 기본 연구 root 내부의 상대 경로다. 수집기 403과 manifest의 수동 200을 별도 관측으로 보존하려고 `--source-run`과 **다른** 새 `--run`을 쓴다. 새 원문/설정·파서 변경은 새 run ID와 새 검토를 사용한다.

```sh
node scripts/research.mjs import-capture \
  --run 20260928-openai-admin-jalapeno-manual-import-v1 \
  --source-run 20260928-openai-admin-jalapeno-primary-v1 \
  --review openai-source-recovery-20260928-v1/capture-manifest.json

node --test tests/research-manual-capture.test.mjs tests/research-archive.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest discover \
  -s tests -p 'test_*.py'
npm run test:garden
npx tsc --noEmit
```

수입 출력은 `sources:2`, `parses:[{status:extracted,blocks:21},{status:extracted,blocks:77}]`, `candidate_published:false`다. 같은 run으로 한 번 더 실행했을 때 동일 parse ID·블록 수로 재개됐다. 이 단계의 집중 Node 11/11, Python 전체 60/60, `npm run test:garden` 270/270, TypeScript exit0, 변경 JS/JSON Prettier check 통과. 실제 run의 body SHA·발표일/day/profile·403 원시 상태·`latest.json` 부재·본문 시작과 마지막·Jalapeño Appendix 문자열을 별도로 재검사해 PASS였다. 원문 두 개의 원 SHA는 47절 표와 일치한다. 원문 파서 시험의 첫 실행은 `//article/div[2]/div[3]`가 실제 HTML에서 0개여서 실패했고, `//article/div[2]/div`로 수정한 뒤 재검증했다. 이 실패는 selector 결함의 발견·수정 기록이며 품질 기준을 완화한 결과가 아니다.

다음은 [계획 19.24](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1924-admin-pluginjalapeño-두-사건의-원문-편입과-기사-재구축)의 **3단계**다. Admin의 관리 작업/권한/승인과 Slack 기반 IT 사례를 나눠 원문 블록을 직접 확인한다. Jalapeño는 InferenceX·세 모델·비교 시스템·전력 정규화/토큰 조건을 각각 확인한 claim만 사용한다. 8월26일 기존 기사 ID `33eae878317d27dc`, `b9406ae170bd9133`을 유지하고, 원문에 없는 성능·인과·상용화 추론은 원고에 쓰지 않는다. 이후 의존 지식/Signal/Topic과 등장 회차·RSS/digest/URL을 검증한 새 전체 비공개 사본을 만든다. 47절의 “아직 정식 수입/파싱 전” 문장은 당시 상태의 이력이며 **현재 상태는 이 48절**을 따른다.

## 49. 저장 원문 분리와 로컬 주장 후보의 현재 상태

2026-09-28, 48절의 합본 수입 run을 사건별 검토 입력으로 분리했다. [`parser.mjs`](../scripts/research/parser.mjs)의 `selectStoredSources`와 [`research.mjs`](../scripts/research.mjs)의 `select-source`는 저장 bytes/parse를 검증한 뒤 URL exact match만 가져온다. 수집·파싱·모델 재실행을 하지 않으며, 원 관측과 48절의 두 source version·parse ID를 그대로 재사용한다.

| 새 run                               | 선택 URL                                             | 결과                                  | 상태                        |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------- | --------------------------- |
| `20260928-openai-admin-source-v1`    | `https://openai.com/index/introducing-admin-plugin/` | 1문서/1파싱, 21블록, `2026-08-25/day` | `candidate_published:false` |
| `20260928-openai-jalapeno-source-v1` | `https://openai.com/index/jalapeno-first-results/`   | 1문서/1파싱, 77블록, `2026-08-25/day` | `candidate_published:false` |

둘 다 `.local/research/local-ai/runs/<run>/source-selection.json`에 원 run, 선택 URL, 원 문서/parse SHA와 선택 결과 SHA를 기록한다. 원 HTML SHA는 Admin `cb3923fdaa4f8d4b3cda39c3baecc0d6298fb91605a21478ec0c7c5ddedfc5c5`, Jalapeño `99ccd71ffb35255603cdcfe0f6bbb49dc65545a57abc013997701df994d2e0e9`다. 선택 run을 재실행하면 같은 선택 결과여야 하며 다른 URL/원본/파싱을 같은 run ID에 끼우면 거부한다. `tests/research-source-selection.test.mjs`는 정확한 분리·재실행/원본 불변, 누락·중복·변경·변조 거부 두 사례가 통과했다.

원 수입 합본을 입력으로 `20260928-openai-admin-jalapeno-auto-extraction-v1`에서 정책 파일의 `fact_extract`를 실제 실행했다. `qwen3.8:27b`, `think:false`, context 16,384, 배치당 최대 6후보, 두 배치다. 저장 `claims.json`에는 Admin 6개/Jalapeño 6개, 합계 12개 후보가 있으며 구조 검사 통과 10개/실패 2개다. 실패에는 Admin 약45% claim의 `unit_not_in_evidence`·`condition_not_in_evidence`, Jalapeño 성능 claim의 `unit_not_in_evidence`가 있다. **전부 `review.status:unreviewed`; 직접 사실 승인과 기사 승인 수는 0**이다. 두 공식 HTML의 파싱 `quality.reviewed:false`도 유지한다.

```sh
node scripts/research.mjs select-source \
  --run 20260928-openai-admin-source-v1 \
  --source-run 20260928-openai-admin-jalapeno-manual-import-v1 \
  --url https://openai.com/index/introducing-admin-plugin/

node scripts/research.mjs select-source \
  --run 20260928-openai-jalapeno-source-v1 \
  --source-run 20260928-openai-admin-jalapeno-manual-import-v1 \
  --url https://openai.com/index/jalapeno-first-results/

node scripts/research.mjs extract \
  --run 20260928-openai-admin-jalapeno-auto-extraction-v1 \
  --source-run 20260928-openai-admin-jalapeno-manual-import-v1 \
  --model-policy data/research-model-policy.json
```

마지막 명령은 저장 결과의 실행 형식이다. 완료된 run을 새로운 모델 성능 시험으로 세지 않으며, 새 설정·원문·사실 판정에는 새 run ID를 쓴다. 다시 `extract`할 이유 없이 다음 작업은 두 **선택 run 각각**의 21/77블록을 직접 읽고, `claims.mjs`의 quote/number 검증 및 `review`의 `source_read`, `entailment_checked`, `identity_checked`, `numbers_checked`, `time_checked`를 실제로 수행하는 것이다. 구조 실패 두 건은 원문 문자열에 맞춰 metadata를 정정하거나 해당 후보를 거부한다. 구조 통과 후보도 사건 전체의 중요한 누락을 확인한다. Admin의 관리 기능과 Slack agent 약45% 사례, Jalapeño의 지표/비교 시스템/정격·실측 전력/연말 계획을 **서로 다른 사실**로 판정한다.

그 다음 [계획 19.26](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1926-현재-실행-입력과-상세-개발-명세의-기준)의 A3~A4를 수행한다. `article_write`는 **검토된 사실만** 입력으로 주고, 원고를 8월26일 기존 두 사건 ID에 맞게 정정·승인한다. 의존 `AI Inference Infrastructure`와 `Enterprise AI Operating Model` 및 Signals/TrendTopics의 해당 사건 문장을 다시 판정한다. 새 전체 비공개 사본은 이전 15기사/16노트 승인 묶음을 재사용하고, 웹/RSS/digest/기존 RSS40 identity, 기사→용어→이력·원문, 모바일/키보드를 확인한다. Drive/공개 전환은 원격 readback을 별도로 남긴다. 현재 구현과 전체 완료 계약은 [요약 명세](LOCAL_AI_NEWS_CURRENT_BUILD.md)에서 이어진다.

문서화와 앞 단계 코드의 현재 검증은 집중 원문 선택·수입/보관 **13/13**, `npm run test:garden` **272/272**, Python 전체 **60/60**, `npx tsc --noEmit` exit0이다. README·상태·상세 명세 5개와 새 통합 명세의 Prettier, `git diff --check`가 통과했다. Markdown AST로 7문서의 로컬 링크 543개·제목 앵커 345개·JSON 예시 18개·Mermaid 코드 블록 4개를 검사해 오류0이다. Node/Python 원출력은 `.local/research/local-ai/documentation-current-build-*-tests-20260928.log`에 보존했다. 이 검증은 새 두 기사의 원문 의미·전체 사이트 생성·Drive/공개 상태를 시험한 결과가 아니다.

## 50. Admin plugin·Jalapeño 기사와 의존 지식의 비공개 재검토

기준일 2026-09-28. 49절의 모델 후보12개/구조 통과10개는 여전히 **미검토 모델 원출력**이다. 이번에는 21블록 Admin 공식 HTML과 77블록 Jalapeño 공식 HTML을 각각 직접 읽고, 기존 2026-08-26 브리핑의 두 사건만 별도 run에서 다시 판정했다. 공식 HTML 원본 SHA는 Admin `cb3923fdaa4f8d4b3cda39c3baecc0d6298fb91605a21478ec0c7c5ddedfc5c5`, Jalapeño `99ccd71ffb35255603cdcfe0f6bbb49dc65545a57abc013997701df994d2e0e9`다. 초기 Node HTTP403 시도, 별도 수동 200 관측, 두 source version/parse, 모델 원출력과 이전 비공개 승인본은 그대로 보존했다.

| 사건         | 직접 확인한 사실                                                        | 기존 정체성                                            | 원고에 반영한 경계                                                                                                                        |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Admin plugin | 관리 기능 8개 검증, Slack 기반 ChatGPT Work IT 티켓 약45% 결과 1개 보류 | `33eae878317d27dc`, 발표 2026-08-25, 8월26일 기존 회차 | 구성원·그룹·권한·사용량·승인·변경 결과를 설명한다. 약45%를 Admin plugin 효과라고 쓰지 않는다.                                             |
| Jalapeño     | InferenceX 시험·구조·전력·3개 모델 Appendix 등 15개 검증                | `b9406ae170bd9133`, 발표 2026-08-25, 8월26일 기존 회차 | OpenAI 회사 시험 수치, 모델·비교 시스템, 최고 TPS/kW와 종단 지연, 정격 700W/시험 지속 전력 550W 이하, 2026년 말 **배치 계획**을 분리한다. |

Admin 검토 입력은 `runs/20260928-openai-admin-source-v1/`의 `claims.json`, 판정은 같은 디렉터리의 `reviewed-claims.json`, 최종 원고/승인은 `draft.json`, `editorial-review.json`, `approved-article.json`에 있다. `review`는 8 verified/1 deferred를 기록한다. Qwen3.8:27b `article_write`는 검증한 사실만 받아 한국어 원고 초안을 만들었고, 직접 정정으로 일반적인 운영 권고와 근거 없는 분석을 제거했다. 기존 사건 ID와 원문/발표일을 유지하며 관리자 권한이 확대되는 것으로 표현하지 않았다.

Jalapeño의 최초 직접 검토·모델 초안·정정은 `runs/20260928-openai-jalapeno-source-v1/`에 보존한다. Appendix의 각 모델에서 **최고 혼합 처리량 `TPS/kW`와 별도 종단 간 지연 초**를 다른 지표로 읽었다. 비교는 GPT-OSS 120B 대 GB200(1,200W), DeepSeek R1·Kimi K2.5 대 GB300(1,400W)이고, Jalapeño의 공표 정격은 700W다. 세 모델의 `nominal 8k/1k · STP`는 원문 표기다. 초안에서 이를 `입력·출력 길이`라고 푼 문장은 원문에 명시되지 않아 다시 고쳤다. `runs/20260928-openai-jalapeno-revision-v2/`은 **동일 원문 bytes/parse와 직접 검토 사실·이전 모델 원고를 감사 가능한 부모 SHA로 재사용**한 새 편집 run이다. 새 모델 호출을 한 것처럼 기록하지 않았고 `revision-parent.json`의 `reused_model_output:true`, `new_model_call:false`를 남겼다. 두 번째 `correct`/`approve` 뒤의 이 run만 최신 전체 사본에 넣었다. 이전 승인 파일을 덮어쓰지 않았다.

의존 지식은 `.local/research/local-ai/runs/20260928-openai-dependent-notes-integrated-v2/approved-notes.json`의 **7개 교체안**을 사용한다. 이 묶음은 앞선 승인 5개 노트의 원고를 유지하면서 `AI Inference Infrastructure`에 Jalapeño의 날짜·회사 시험 조건·계획 상태와 `[[News/b9406ae170bd9133]]`을 추가하고, `Enterprise AI Operating Model`을 검토된 Admin·Anthropic 자료로 다시 써 `[[News/33eae878317d27dc]]`을 추가한다. `Signals/2026-08-26_0802_Tech_AI_Briefing.md`의 기존 관측 ID는 보존하고 명목 8k/1k STP·정격 전력과 지표 분리를 정확히 적었다. 광범위한 기업 운영 범주인 `enterprise`는 기존 지도 제외 결정을 유지한다. 이미 승인된 `performance-path`의 다른 날짜 판단을 새 사실 하나로 소급 변경하지 않았다. 같은 사건의 기사·주제 페이지는 생성 시 새 검증 기사 내용을 사용한다.

통합 입력은 이전 15개 승인 기사에 Admin 1개와 **수정한** Jalapeño 1개를 더하고, 이전 7개 지식 승인 run 중 `20260928-hf-aws-dependent-notes-integrated-v2`를 위의 새 7노트 run으로 교체한다. 새 전체 사본 `20260928-openai-two-articles-integrated-private-site-v5`의 `preview-manifest.json`은 기사17, 영향받은 과거 회차10, 승인 지식·관측 노트18, HTML279, digest132, RSS 기존40개의 `(GUID,pubDate)` 보존을 확인했다. 두 기사는 동일한 8월26일 원고의 각각 기존 주소에 투영되고, 과거 수정은 오늘 새 회차로 생성되지 않았다. 기사→원문, 기사→전문용어, 용어 최근 변화→기존 기사, 주제 사건 이력, 브리핑·RSS·GitHub 요약의 날짜/문장/원문 URL을 대조했다. `candidate_published:false`, `drive_verified:false`, `browser_verified:false`다.

통합 중 `1.5~1.9배` 같은 승인 문장이 GFM의 취소선으로 바뀌어 생성 결과와 원문이 달라지는 결함을 발견했다. `scripts/explanations.mjs`의 단일 Markdown 문장 이스케이프를 `publish-adapter.mjs`의 기사 본문, `briefings.mjs`의 주제 이력·GitHub digest에 적용했다. `scripts/editorial.mjs`와 `scripts/research/preview.mjs`는 Markdown escape를 벗긴 **동일 독자 문장**을 검사한다. 원문 승인 메타데이터와 RSS HTML의 숫자 표기는 바꾸지 않았다. `tests/research-legacy-projection.test.mjs`, `tests/trends.test.mjs`가 기사·요약·주제 범위의 회귀를 검사한다. 이전 실패한 preview v1/v2와 최초 통과 v3/v4는 기록으로 남고, 최종 채택은 수정 원고·Signal을 포함한 v5다.

재현·감사 위치:

```sh
node --test tests/research-legacy-projection.test.mjs tests/trends.test.mjs
npm run test:garden
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npx tsc --noEmit
node .local/research/local-ai/20260928-openai-editorial-v1/verify-private-v5.mjs
```

마지막 검증의 Node **273/273**, Python **60/60**, TypeScript exit0다. `.local/research/local-ai/20260928-openai-editorial-v1/final-integrity-v5.json`은 작성 원본181개와 두 공식 원본 SHA 불변, 기사/용어 링크, Markdown 수치 범위, RSS40 식별자, 사본/원격 상태를 각각 기록한다. 위 최종 영수증 생성 명령은 `wx`로 파일이 이미 있으면 재작성하지 않는다. 기존 run과 승인 파일도 입력 변경으로 재사용하지 말고 수정할 때는 새 run ID를 쓴다.

전체 사본 생성 뒤에는 별도 로컬 HTTP 서버·Playwright Chromium으로 화면을 점검했다. `.local/research/local-ai/20260928-openai-editorial-v1/preview-ui-smoke.py`는 Admin/Jalapeño의 **기존 기사 주소**를 1440×900과 390×844에서 열어 제목·원 발표일·원문 링크·수치 범위의 취소선 부재·가로 넘침 부재를 확인한다. 두 기사 모두 지도 canvas가 없고, Jalapeño의 `#AI추론인프라` 태그에 키보드 초점을 주고 Enter를 누르면 용어 페이지로 이동해 해당 기사의 변화 이력 링크를 확인한다. 이어 8월26일 브리핑의 HTTP 200·지도 부재·가로 넘침 부재도 검사한다. 네 기사 화면의 전체 페이지 스크린샷과 실행 결과는 같은 디렉터리의 `preview-*.png`, `preview-ui-smoke.json`에 보존했고 **4개 기사 화면·2개 브리핑 폭 모두 통과**했다. 최초의 `wait_for_load_state` 직후 URL 검사 실패는 이동을 기다리지 않은 시험의 동기화 문제였다. 실제 `href`가 올바른 것을 확인하고 `wait_for_url`을 사용해 재검사했다. 이 시험은 로컬 사본의 Chromium 렌더링 근거이며 실제 모바일 기기나 공개 URL 검증은 아니다. 생성 시점의 불변 `preview-manifest.json`에 있던 `browser_verified:false`는 별도 사후 시험을 반영해 재작성하지 않았다.

```sh
.local/research/local-ai/runtime/venv/bin/python \
  .local/research/local-ai/20260928-openai-editorial-v1/preview-ui-smoke.py
```

다음 작업은 새 사건2개를 다시 요약하는 것이 아니라, [계획 19.27](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1927-두-openai-사건의-비공개-승인-이후-남은-작업)의 B~F다. 즉 구형92회차/801구간·관련 용어와 관계의 전수 판정, 제조사/IR/RSS/논문 출처의 실제 반복 목록 종료, 독립40/20 품질 평가, 단일 08시 일일 흐름과 Drive 원격 readback, 실제 공개 채널 및 신규 성공7회를 각각 증명한다. 최신 비공개 사본을 Drive/사이트 운영 완료로 승격하지 않는다.

## 51. 두 제조사 공식 목록의 기간 완주와 재개

2026-09-28에는 [FANUC 영문 뉴스 목록](https://www.fanuc.co.jp/en/profile/pr/newsrelease/)과 [HD현대로보틱스 보도자료 목록](https://www.hd-hyundairobotics.com/company/news)을 **`2026-09-01` 이상, `2026-09-28` 미만** 구간으로 수집했다. 날짜의 오른쪽 경계는 포함하지 않는다. 두 목록의 게시일과 상세 HTML에 표시된 게시일을 별개 근거로 읽었다. 이 절의 네 상세 URL은 후보이며 `review_status:unreviewed`, `candidate_published:false`다. 내용의 사실 검토·기업 전략 해설·기사/지식 승인과 Drive/공개 발행은 수행하지 않았다.

### 51.1 구성과 코드 경로

`data/research-acquisition.json`의 `fanuc-en.listing_profile`은 `fanuc-en-dated-index-v1`이다. Python worker의 `listing_link_rules`는 각 뉴스 링크의 `href`, 제목과 상위 `h2`의 연도·`h3`의 월일을 하나의 날짜 근거로 읽고 `%Y %B %d`로 ISO 날짜를 만든다. `date_xpath`의 XPath `concat(...)`처럼 문자열을 반환하는 선택자도 지원한다. 필수 날짜가 없거나 형식이 맞지 않으면 URL 경로의 숫자로 보완하지 않는다. `item_pattern`은 해당 뉴스릴리스의 `notice`/`news` 상세 경로만 허용한다.

HD현대로보틱스의 정적 HTML 화면에서는 오래된 항목 일부만 확인됐다. 같은 공개 화면이 요청하는 `/api/v1/company/page`의 JSON 목록에 `compIntrSubTypeCd=90010001`, `bdSeq=51`, `page`, `size`를 지정하면 페이지 메타데이터와 상세 주소를 확인할 수 있었다. 로그인·비공개 API 우회가 아니다. [`api-scan.mjs`](../scripts/research/api-scan.mjs)는 이 **사이트 내부 공개 JSON 경로의 현재 응답 계약**에 한정된다. 안정성을 보장받은 공식 개발자 API로 가정하지 않는다. 정확한 필터, 페이지 번호·크기·총건수·마지막 페이지, 고유 상세 ID, 날짜 순서, MIME와 원 bytes SHA가 달라지면 불완전으로 멈춘다. 새 사이트 버전에서는 새 profile과 회귀 자료로 다시 확인한다. 상세 HTML은 `hd-robotics-news-detail` profile로 제목·게시일·본문을 파싱한다.

`scripts/research.mjs scan-list`는 `--channel` 하나와 정확한 날짜 창을 요구한다. FANUC는 [`list-scan.mjs`](../scripts/research/list-scan.mjs)의 단일 전체 목록을 사용하고, HD는 `api_profile`에 따라 페이지 수집기를 사용한다. 양쪽 모두 `fetchWithPolicy`와 기존 `SourceFetcher`의 공개 호스트·robots·HTTP·크기 정책, `RunState`의 입력 fingerprint/단계 재개, `parseDocument`의 저장 bytes 파싱을 재사용한다. 목록 URL/방법은 후보의 발견 근거로 남고, 상세 URL은 별도 source version이다. API 항목의 위치는 `json_pointer`, FANUC 항목의 날짜는 목록 DOM 근거로 남긴다.

### 51.2 실제 실행과 출력

```sh
node scripts/research.mjs scan-list \
  --run 20260928-fanuc-en-window-20260901-v2 \
  --channel fanuc-en --since 2026-09-01 --until 2026-09-28

node scripts/research.mjs scan-list \
  --run 20260928-hd-press-window-20260901-v1 \
  --channel route-hd-news-ko --since 2026-09-01 --until 2026-09-28
```

| run                                    | 목록 종료·후보 결과                                                                                                                                   | 세부 원본                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260928-fanuc-en-window-20260901-v2` | `window_scanned`; 날짜 있는 목록 링크 69개, 창 안 3개/이전 66개. 상세 3개 모두 목록·상세 게시일 `2026-09-11` 일치                                     | `documents.json`/`parses.json`: 목록 1+상세 3. [`notice20260911.html`](https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html), `notice20260911-03.html`, `notice20260911-02.html` |
| `20260928-hd-press-window-20260901-v1` | `window_scanned`; 페이지 19/19, 고유 항목 150/150, 창 안 1개. [상세](https://www.hd-hyundairobotics.com/company/news/7499)의 게시일 `2026-09-14` 일치 | `list-pages.json`: 19개 목록 bytes. `documents.json`/`parses.json`: 상세 1개                                                                                                                           |

각 run의 `.local/research/local-ai/runs/<run>/list-scan.json`에는 상태, 창, 종료 수치와 상세별 상태가, `candidates.json`에는 미검토 후보만 기록된다. `documents.json`과 `parses.json`은 상세의 증거이며 FANUC는 목록 parse도 포함한다. HD 목록 원본은 별도 `list-pages.json`의 source version·SHA·본문 경로로 보존한다. 원 bytes는 `.local/research/local-ai/documents/`, 파싱 원본은 `parses/`에 있고 모두 Git 비공개 영역이다. 같은 run ID와 동일 코드·설정을 재실행하면 완료 stage를 재사용한다. HD run의 재실행은 0.03초 안팎으로 끝났으며 네트워크를 다시 수집한 증거로 세지 않는다. 코드/profile/창을 바꾼 경우 입력 fingerprint가 달라지므로 새 run ID를 사용한다.

### 51.3 완료 판정과 실패 처리

FANUC의 `window_scanned`는 목록 profile이 선택한 전체 링크 수와 반환 링크 수가 같고, URL/제목/유효 날짜·중복·최신순을 확인하고, 지정 시작일보다 오래된 항목에 도달했을 때만 나온다. 창 안 링크가 설정 예산을 넘거나 상세가 한 개라도 수집·본문·날짜 검증에 실패하면 `incomplete`다. 목록에 아직 오래된 항목이 없으면 `cutoff_not_reached`로 두어 기간 종료를 추측하지 않는다.

HD의 `window_scanned`는 첫 페이지부터 선언된 마지막 페이지까지 **모든** JSON 페이지를 읽고, 19개 페이지의 `totalElements`/`totalPages`가 고정되어 있으며 150개 항목이 중복 없이 날짜 내림차순이고 합계도 맞을 때만 가능하다. 서버 응답의 정렬 metadata에만 의존하지 않는다. 페이지 상한 30 또는 선택 상세 상한 25를 넘으면 예산 초과로 멈춘다. 외부 상세 URL, 중도 총건수 변경, 누락 페이지, 비JSON, 상세 날짜 불일치는 실패·부분 상태로 보존하며 `새 소식 없음`으로 바꾸지 않는다. 목록 19개의 저장 bytes SHA와 상세 1개의 source version/parse를 다시 읽어 검증했다. FANUC 목록+상세 4문서/4파싱도 원본 bytes·불변 parse 대조를 통과했다.

### 51.4 회귀와 다음 수집 경로

`tests/research-list-scan.test.mjs`는 단일 목록의 기간 종료·필수 날짜·누락 링크·상세 날짜 충돌·재개를, `tests/research-api-scan.test.mjs`는 정확한 JSON 쿼리·페이지 메타데이터·전체 페이지·후보의 JSON 위치·재개를 검사한다. `tests/test_research_worker.py`는 실제 구조를 축소한 FANUC 연도/월일 링크와 HD 상세의 제목·본문·단일 날짜를 파싱한다. 이 변경 뒤 `npm run test:garden` **277/277**, Python 전체 **62/62**, `npx tsc --noEmit`과 변경 코드 Prettier가 통과했다. 실물 실행은 두 공개 목록의 현재 응답에만 적용됐다.

다음 작업은 네 후보의 원문 블록을 직접 읽어 사건 중복·공식 주장/독립 근거·시점·계획/완료를 구분하고, 승인할 사건만 기존 육하원칙 기사·기업/제품 태그·관련 전문용어와 연결하는 것이다. 별개로 KUKA/ABB/두산로보틱스와 제조사 IR·고객/공급사, 논문/대학·TLO, RSS/공시를 각각 **목록 종료·상세·첨부·실패 이월**까지 확장한다. 각 출처마다 새 경로의 실물 응답과 fixture를 확인한다. 2개 경로 완주를 92개 등록 경로 또는 8개 분야 전체의 완료로 확대하지 않는다. 우선순위·수용 산출물은 [계획 19.28](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1928-실제-두-제조사-경로-완주-이후의-출처-확장)이다.

## 52. FANUC 사건 두 건의 원문 검토와 과거 회차 보완

이 절은 51절의 **수집 후보 이후** 수행한 편집·생성 기록이다. 2026-09-28 로컬 작업에서 네 후보의 사건 정체성을 먼저 기존 9월 13일 회차와 대조했다. [FANUC AI 용접 에이전트 영문 발표](https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911.html)는 이미 그 회차의 일본어 원문 사건 `eb739a02acad3ab9`에 해당한다. [HD현대로보틱스 공식 글](https://www.hd-hyundairobotics.com/company/news/7499)은 **9월 14일 게시**되었지만 9월 11일 투자 보도와 같은 사건 `902d86854fec2b7d`이다. 9월 13일 당시 알 수 없었던 9월 14일 공식 글을 그 회차의 당시 근거로 소급하지 않았고, 어느 쪽도 새 사건·새 기사로 중복 등록하지 않았다. 서로 다른 URL이라는 이유만으로 사건 ID를 늘리지 않는다.

나머지 두 공식 원문은 독립 사건이다.

| 원문·발표일                                                                                                                   | 승인한 사건 경계                                                                                                                                                                                                                                  | 고정 사건 ID·검토 run                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [FANUC 건설용 철골 기둥 용접 시스템](https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911-03.html), 9월 11일 | 2025년 전시에서 이미 출시된 CRX-3iA를 이용해 **새 시스템을 개발**했다. 자석 베이스·레이저/터치 센싱·800 mm 정사각 단면 기둥에 로봇 4대 배치 가능성은 회사 설명이며, 9월 16일 시연은 발표 당시 계획이다. 건설 현장 고객 도입 실적으로 쓰지 않는다. | `0107f0fb7dbbd8f9` · `20260928-fanuc-structural-column-extract-v1` |
| [FANUC 배관 레이저 용접 시스템](https://www.fanuc.co.jp/en/profile/pr/newsrelease/2026/notice20260911-02.html), 9월 11일      | 수동 레이저 용접기와 CRX 협동로봇을 결합한 **시스템 개발**이다. 배관 회전·로봇 속도와 레이저 출력 연동·접촉 시 차단·프로그램 아이콘·단일 광원의 용접/변색 제거를 회사 주장으로 전한다. 측정된 생산성이나 고객 설치·출하를 덧붙이지 않는다.        | `c55a004d1f2a2193` · `20260928-fanuc-pipe-laser-extract-v1`        |

### 52.1 저장 원문에서 검증 사실까지

각 공식 HTML은 51절의 원 bytes/parse에서 `select-source`로 한 문서씩 분리했다. `20260928-fanuc-structural-column-source-v1`과 `20260928-fanuc-pipe-laser-source-v1`은 새 네트워크 다운로드가 아니라 선택 원본의 source version·parse SHA를 확인한 사본이다. 각 extract run은 현재 정책의 로컬 Ollama `qwen3.8:27b`, `fact_extract`/`think:false`로 후보를 만들었다. 철골 건은 모델 후보 5개 중 구조 통과 4개였고 **시스템 개발 자체와 로봇 4대 배치가 빠졌다**. 센서 설명의 한 인용은 원문에 없는 생략 기호를 넣었다. 배관 건은 후보 5개가 구조 통과했지만 배관 회전/출력 연동·프로그램 작성·변색 제거를 빠뜨렸다. 일반적인 레이저 용접 장점과 전시 시제는 기사 근거에서 보류했다. 모델의 구조 통과를 의미 검증이나 자동 승인으로 계산하지 않는다.

`scripts/research/claims.mjs`의 `recordFactReview`는 사람이 **저장된 원문 블록에서 직접 확인한 누락 사실**을 `additions`로 받을 수 있다. 기존 모델 `claims.json`은 변경하지 않는다. 각 추가는 같은 후보 키, extraction schema, 고정된 source/version/parse/block, 원문에 실제 존재하는 인용·수치 문자/단위/조건, 게시일·검토일, `source_read`·`entailment_checked`·`identity_checked`·`numbers_checked`·`time_checked`를 모두 요구한다. 검토 결과에 `review.origin:direct_source_addition`, 사실·원문 parse SHA가 들어간다. 20건을 넘는 임의 추가나 다른 후보의 인용을 끼워 넣는 입력은 거부한다. 이 기능은 원문을 읽은 편집자의 누락 보완이며 모델이 새 사실을 스스로 승인하는 통로가 아니다.

실제 검토 입력은 각 run의 `fact-review-input-v1.json`이고 CLI `review` 결과는 `reviewed-claims.json`에 있다. 철골은 모델 5개 인용 검토/정정 + 직접 추가 2개로 **verified 7/deferred 0**, 배관은 모델 3개 확인·2개 보류 + 직접 추가 3개로 **verified 6/deferred 2**다. 원문 인용과 문장 표현은 각 `reviewed-claims.json`에서 역추적한다. `draft`의 모델 초안은 그대로 보존했고 `correct`로 개발/출시/시연·회사 주장·리드 반복을 정정했다. 철골 원고는 기업 필터를 기존 FANUC 기사와 합치기 위해 최종 `entities:[FANUC]`로 정리했다. 철골의 원고·승인 판본은 `drafts/`, `corrections/`, `approval-history/`에 남겨 최종판만 사용한다. 배관도 모델 초안과 수정본을 분리했다.

### 52.2 과거 회차에 새 사건을 추가하는 계약

기존 사건의 문장 정정에는 `retrospective_review`를 사용한다. 이번 두 사건은 9월 13일 회차에서 **처음 누락된 별도 사건**이므로 `historical_addition_review`를 사용한다. 패킷은 `historical-addition-review/v1`, 정확한 사건 ID·편집자·검토일, 원문·중복·회차 **달력 날짜 범위** 확인, 목표 회차 상대경로와 원본 SHA를 포함한다. 날짜 확인은 게시일이 회차의 양끝 날짜에 들어가는지 검사한다. 게시 시각이 없는 자료를 특정 08시 cutoff 안에 발표됐다고 확정하지 않는다. 모든 출처·사건과 현재 Drive 권위 원본은 운영 전환 전에 다시 대조한다.

`approvedArticle`은 패킷을 기사 승인과 묶고 `retrospectiveProjections`는 목표 회차의 실제 bytes SHA, 기존 사건 ID 및 원문 URL과의 중복, 날짜 범위, 기존 모든 기사 보존을 검사한다. `editionProjection`은 새 사건만 이어 붙이고 기존 회차 날짜·coverage·헤드라인 순서를 유지한다. 기존 헤드라인이 3개 미만이면 새 제목을 필요한 만큼 추가해 편집 규칙을 만족한다. 총 40건·분야별 최대 5건은 기존 검사 그대로 적용한다. 패킷의 사유와 검토 체크는 독자용 회차에 싣지 않는다. 원본 `vault/`를 직접 바꾸지 않고 `preview`의 별도 작업 사본에서만 적용한다.

```sh
node scripts/research.mjs review --run 20260928-fanuc-structural-column-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-structural-column-extract-v1/fact-review-input-v1.json
node scripts/research.mjs review --run 20260928-fanuc-pipe-laser-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-pipe-laser-extract-v1/fact-review-input-v1.json
node scripts/research.mjs approve --run 20260928-fanuc-structural-column-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-structural-column-extract-v1/editorial-approval-input-v3.json
node scripts/research.mjs approve --run 20260928-fanuc-pipe-laser-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-pipe-laser-extract-v1/editorial-approval-input-v1.json
```

위 명령은 현재 입력·승인 파일을 **재확인할 때만** 사용한다. 모델 초안을 다시 생성하거나 이전 승인판을 덮어쓰는 일반 재생성 절차가 아니다. 최종 preview의 전체 승인 19개/지식 7개 CLI 인자는 `.local/research/local-ai/20260928-fanuc-two-historical-additions-private-site-v3-command.json`에 고정했다. `20260928-fanuc-two-historical-additions-private-site-v3/preview-manifest.json`은 승인 기사 19건, 영향 회차 11개, 지식 노트 18개, 공개 파일 281개(HTML 255개), digest 132개, 기존 RSS 40개 `(GUID,pubDate)`의 동일성을 기록한다. 새 두 기사는 9월 13일 브리핑·해당 뉴스 고정 주소·GitHub Markdown·현행 RSS 내용에 나타나며 원문 URL과 승인 문장을 대조했다. 새 9월 28일 회차와 신규 RSS 항목은 만들지 않았다. 사본 결과의 `candidate_published:false`, `drive_verified:false`, `browser_verified:false`는 생성 시점의 상태다.

`tests/research-review.test.mjs`는 누락 사실의 직접 추가와 다른 후보/거짓 인용/검토 체크 실패를, `tests/research-projection.test.mjs`는 원 회차 보존·추가·중복/해시 오류·비공개 검토 사유의 비노출을 검증한다. 최종 코드는 `npm run test:garden` **279/279**, Python **62/62**, `npx tsc --noEmit`을 통과했다. 이 수치는 공개 배포나 Drive 업로드를 입증하지 않는다. 다음 자료 작업은 9월 13일의 나머지 기사·의존 용어를 원문부터 판정하고, KUKA/ABB/두산로보틱스와 제조사 IR/RSS/공시/논문의 경로별 기간 종료를 확장하는 것이다. 전체 구형 92회차/801구간, 독립 40/20 모델 품질, 단일 08시 운영, Drive 원격 확인, 실제 공개 및 신규 7회는 계속 남는다.

생성 후 별도 `.local/research/local-ai/20260928-fanuc-editorial-v1/preview-ui-smoke.py`를 로컬 HTTP 서버와 Playwright Chromium에서 실행했다. 새 두 기사와 9월 13일 브리핑을 1440×900/390×844에서 열어 HTTP 200·제목/발표일·원문 URL·동일 `#FANUC` 기업 태그, 본문 지도/빈 분석 제목 부재와 가로 넘침 0을 확인했다. 6개 전체 페이지 스크린샷과 `preview-ui-smoke.json`에 결과를 남겼다. 이는 **로컬 렌더링 시험**이며 실제 휴대전화·공개 사이트 확인은 아니다. 생성 시 불변 manifest의 `browser_verified:false`를 사후 시험으로 다시 쓰지 않는다.

## 53. 9월 13일 기존 기사 세 건의 원문 재검토와 비공개 사본

이 절은 2026-09-28 작업의 **현재 실행 기록**이다. 52절의 FANUC 두 신규 과거 사건에 이어, 같은 9월 13일 회차의 기존 세 사건을 원문부터 검토했다. 52절의 기존 수치·상태는 그 당시 preview v3의 기록이며 최신 사본은 아래 v4다. `vault/` 작성 원본과 Google Drive·실제 사이트는 수정하지 않았다.

### 53.1 Drive 기준선과 보호 범위

Drive `Projects / Tech Knowledge`의 Editions/Knowledge/Signals/TrendTopics 전체 181개 작성 원본에 대해 **원격 파일 ID·상대경로·크기·수정 시각**을 `.local/drive-sync/receipt.json` 및 로컬 `vault/` 목록과 대조했다. 네 값의 불일치는 0개였다. 목표 `Editions/2026/09/2026-09-13_0800_Tech_AI_Briefing.md` 한 파일은 Drive 전문 10,974자와 로컬 전문을 다시 읽어 완전히 일치했다. 목표 원본 SHA는 `69a9793d517d13b6ea7764b6203819af9a723fef2161afe47afa46a7b529c2dd`다. 이것은 181개 전부의 **새 원격 bytes SHA** 확인이나 업로드 승인이 아니다. 작성 원본의 변경은 이 일치한 파일의 비공개 사본에만 적용했다.

처음의 합본 원문 run `20260928-sep13-official-four-source-v1`은 RubyGems HTML만 확보했다. OpenAI Habitat 공식 글은 로컬 HTTP 403이고 GitHub Changelog 두 글은 `192.0.66.2` 공개 주소를 특수 범위로 오판해 robots 확인 전에 차단됐다. [출처 명세 27절](SOURCE_ACQUISITION_SPEC.md#27-github-changelog-재수집과-원문-관측-시각-보존)의 IP 판정 회귀를 수정하고 GitHub만 새 run `20260928-sep13-github-two-source-v2`로 수집했다. reparse run `20260928-sep13-github-two-reparse-v1`은 두 글의 `<time datetime>`을 9월 11일/day로 읽었다. `github-changelog-article` profile은 본문을 각각 16/15블록으로 분리하고 관련 글을 제외했다. OpenAI 403은 별도 미확보로 남아 있으며, 이 두 GitHub의 정상 수집이 OpenAI 원문의 접근 상태를 바꾸지 않는다.

`select-source`는 같은 합본 run의 실패한 이웃 URL을 유지하며 확보된 RubyGems URL만 고를 수 있도록 했다. 실제 `20260928-rubygems-from-mixed-run-v1` 선택이 성공했고 blocked URL의 선택은 거부된다. 재요청의 source version/parse ID가 같더라도 `observed_at`이 다른 경우 전역 parse가 덮이는 결함을 발견해 `storeParseArtifact`를 최초 내용 보존 방식으로 고쳤다. 각 run의 parse 사본은 자기 문서의 관측 시각을 갖는다. 예전 parse에 이 선택 필드가 없을 때는 읽기 호환을 유지한다. 저장 원문 bytes, 버전 ID, parse 내용이 실제로 바뀌면 명시적으로 실패한다.

### 53.2 사건별 사실·원고 판정

| 기존 사건 ID와 공식 원문                                                                                                                               | 확인된 발표·행위와 원고 결정                                                                                                                                                                                                                                       | 검토 영수증                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `67402935155ca6d3` · [RubyGems 운영팀의 5월 사건 조사](https://blog.rubygems.org/2026/09/11/update-may-spam-publishing-campaign.html)                  | 9월 11일은 **조사 설명 게시일**, 신규 가입 중단·계정 차단·악성 패키지 500개 이상 제거는 5월 대응이다. 기존 gem 설치/게시 기능은 유지됐고 가입은 5월 16일 재개됐다. Nightingale Collective의 공격/AI 귀속 주장과 운영팀이 확인하거나 판정하지 못한 내용을 분리했다. | 원본 body SHA `3898df235dff02490d1b306829ebdb932e2502db665b53365beedcd7aa2cd830`. `20260928-rubygems-sep13-extract-v1`: 모델 후보 검토 후 verified 6/deferred 1, 직접 추가 2개. 정정·기존 ID 승인.       |
| `f5b7434d849eacf1` · [GitHub Copilot 코드 리뷰](https://github.blog/changelog/2026-09-11-auto-resolution-and-analysis-updates-in-copilot-code-review/) | 9월 11일 발표의 후속 커밋 재검토, 해결된 자체 댓글 자동 종료, 수정 제안의 커밋 메시지, 셸 도구와 Lite 다중 에이전트 범위만 기사화했다. 모델 후보의 회사 실험 수치는 원문에 맞는 단위/조건의 구조 검사를 통과하지 않아 보류하고 공개 문장에 쓰지 않았다.            | `20260928-github-review-sep13-extract-v1`: verified 5/deferred 2. 모델의 잘못된 분야·반복 설명을 직접 정정했고 기존 제목·ID로 승인.                                                                      |
| `28ba300194033bae` · [GitHub VS Code Agents 지표](https://github.blog/changelog/2026-09-11-add-vs-code-agents-to-copilot-usage-metrics/)               | 기업/조직의 1일·28일 **집계**에는 활성 사용자·세션·메시지 선택 지표, 사용자별 보고서에는 사용 여부와 개인별 세션·메시지가 포함된다. 편집기 Agent Mode와 분리된다. 조회 역할과 Copilot 사용량 지표 정책의 활성화 조건, 데이터가 없을 때 필드 생략/null을 보존했다.  | `20260928-github-metrics-sep13-extract-v1`: 모델 1일/28일 조건 후보 4개를 구조 보류, 원문 직접 추가를 포함해 verified 6/deferred 4. `draft`의 정책 조건 누락을 `correct`로 보완하고 기존 제목·ID로 승인. |

모든 보류 후보와 로컬 Qwen3.8 27B의 원 출력은 각 run의 `claims.json`, `reviewed-claims.json`, `drafts/`, `corrections/`에 남는다. `reviewed-claims.json`의 `claim_id`와 인용 `source_version_id/parse_id/block_id`를 따라 원문 문장을 다시 찾을 수 있다. 공개 원고에는 보류 사유·수집 실패·검토 안내를 쓰지 않았다. 세 기사 모두 `published_at:2026-09-11`, `reviewed_at:2026-09-28`이며 **9월 28일 신규 뉴스가 아니다.** 승인 입력의 `retrospective_review`는 같은 9월 13일 원본 bytes·등장 위치·이전 제목/날짜를 고정한다.

재현할 때 모델을 새로 호출하거나 기존 승인 입력을 덮어쓰지 않는다. 승인/검토 파일과 전체 preview의 인자는 아래 경로를 참조한다.

```sh
node scripts/research.mjs select-source --run 20260928-rubygems-from-mixed-run-v1 \
  --source-run 20260928-sep13-official-four-source-v1 \
  --url https://blog.rubygems.org/2026/09/11/update-may-spam-publishing-campaign.html

node --test tests/research-runtime.test.mjs tests/research-source-selection.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest discover \
  -s tests -p 'test_*.py'
```

`20260928-sep13-three-reviewed-private-site-v4-command.json`은 앞선 19개 승인 기사 run과 이번 3개, 기존 7개 지식 run의 `preview` 인자를 고정한다. 재생성은 같은 root와 승인 SHA가 여전히 같은지 먼저 검사하고, 입력을 수정했다면 **새 run ID**를 만든다. 현재 v4 `preview-manifest.json`에는 승인 기사 run 22개, 영향 회차 11개, 승인 지식 18개, 공개 파일 281개(HTML 255개), digest 132개가 있다. v3와 비교한 변경 회차는 `2026-09-13_0800` 하나이며 달라진 기사 consistency는 위 세 기존 사건뿐이다. 9월 13일 회차의 기존 여섯 사건과 52절의 FANUC 두 사건은 모두 남는다. RSS 40개 `(GUID,pubDate)`는 동일했고 신규 9월 28일 회차·GUID는 만들지 않았다. `20260928-sep13-editorial-v4/verify-channels.py`로 웹 뉴스·브리핑, RSS, GitHub digest의 세 기사 제목·요약·발표일·원문 URL을 동일 사본에서 대조해 3건 모두 통과했다.

`20260928-sep13-editorial-v4/preview-ui-smoke.py`는 사본을 로컬 HTTP에서 열고 새로 정정한 세 뉴스와 9월 13일 브리핑을 1440×900과 390×844로 확인한다. **8개 화면 모두** HTTP 200, 제목·9월 11일 발표일·공식 원문 링크, 뉴스/브리핑의 지도 `canvas` 부재, 가로 넘침 부재를 통과했다. 스크린샷과 JSON 결과는 같은 비공개 디렉터리에 보존한다. 이것은 Chromium 로컬 렌더링이며 실제 모바일 기기나 공개 GitHub Pages의 증거가 아니다. v4 manifest의 `browser_verified:false`는 생성 시점의 불변 값이고 사후 시험으로 재작성하지 않는다.

### 53.3 이번 회귀와 다음 재개점

새 집중 테스트는 공개 `192.0.66.2` 허용과 특수 IP 차단, GitHub header 날짜·관련 글 제외, 합본 중 선택 원문과 blocked 이웃, 반복 관측의 parse 불변/충돌을 다룬다. 첫 전체 Node 검사에서 기존 synthetic parse fixture가 `dates.observed_at` 선택 필드를 쓰지 않아 5개 실패했다. 실제 새 관측 필드의 불일치 검사는 유지하면서, 이전 유효 parse에는 필드가 없을 수 있게 읽기 호환을 고쳤다. 이후 문서와 parse 사본을 각각 또는 함께 바꿨을 때의 오류를 시험에서 분리했다. 최종 `npm run test:garden` **281/281**, Python **63/63**, `npx tsc --noEmit`을 통과했다. 작성 원본 181개는 로컬 저장 SHA 대조에서 변경 0개였고, 상세 문서 6개의 로컬 링크 551개·제목 anchor 343개를 검사해 오류 0개였다. 실패한 첫·두 Node 로그와 최종 통과 로그는 `.local/research/local-ai/20260928-sep13-editorial-v4/node-full-test-v*.log`에 보존한다.

**다음 자료 묶음:** 9월 13일의 OpenAI Habitat·HD현대로보틱스 투자·기존 FANUC AI 에이전트 세 사건을 공식/당시 보도 원문으로 재검토하고, `Signals/TrendTopics/Knowledge`의 의존 문장을 함께 판정한다. OpenAI 공식 HTML의 로컬 HTTP 403은 허위 `새 소식 없음`이나 단순 제외로 바꾸지 않는다. 그 다음 구형 92회차/801구간과 KUKA·ABB·두산로보틱스 등 나머지 조사 경로를 [계획 19.30](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1930-9월-13일-세-기사-재검토-이후의-정확한-재개-순서) 순서로 진행한다. Drive 원격 bytes/readback, 공개 웹·RSS·GitHub, 신규 일일 성공 7회는 아직 미완료다. v4 결과의 `candidate_published:false`, `drive_verified:false`가 현재 운영 경계다.

## 54. 9월 13일 잔여 원문 수집·파싱과 상세 실행 명세

이 절은 53절 비공개 승인 사본 **이후**의 자료 확보 상태다. 새 기사 승인이나 Drive·웹 발행 기록이 아니다. 개발·데이터·모델·발행의 한 번에 읽는 계약은 [구현 명세와 완료 계획](LOCAL_AI_NEWS_EXECUTION_SPEC.md)이다.

| 기존 사건                                 | 저장·파싱 상태                                                                                                                                                                                                                              | 다음 판정                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FANUC AI Welding Agent `eb739a02acad3ab9` | 일본어 공식 원문 `20260928-fanuc-ai-ja-original-source-v1` 22블록, 영어 공식판 `20260928-fanuc-ai-en-source-v1` 23블록. 합본 `20260928-fanuc-ai-bilingual-source-v1`, 로컬 추출 `20260928-fanuc-ai-sep13-extract-v1` 후보6/구조5/직접 검토0 | 원문 속 생성·실행·작업자 조정, 9월16일 시연과 12월 말 출하 계획을 구분. `AI Agents` 개념 연결은 제품 이름이 아니라 작동 방식으로 재판정                   |
| HD–에이딘 투자 `902d86854fec2b7d`         | 당시 뉴스핌·이데일리 원문 `20260928-hd-aidin-sep13-original-news-v1`; `20260928-hd-aidin-sep13-reparse-v2`에서 기자 본문6/7블록·뉴스핌 원문 게시 시각 보존. 아직 claim 검토0                                                                | HD 130억 원과 전체 160억 원 관계, 지분 취득 사실/로봇손·표면가공 계획, 각 보도의 발표 주체를 직접 확인. 9월14일 HD 글을 9월13일 당시 근거로 소급하지 않음 |
| OpenAI Habitat `46fcf5bb7b99520f`         | 원 URL의 로컬 HTTP 403은 접근 보류. 새 원문 source/parse 없음                                                                                                                                                                               | 합법적 대체 공식 자료·원문 확보를 재조사; URL 실패를 `새 소식 없음`이나 공개 제외로 바꾸지 않음                                                           |

`newspim-news-article`은 31번째 article profile이다. 뉴스핌 상세 DOM의 `section.ai-summary`가 기사 본문 앞에 있어 일반 선택자는 사이트가 자동 작성한 요약을 원문 근거에 섞는다. 등록 profile은 `div#news-contents`만 선택하고 기자 이메일 단락을 빼며 `<time id="send-time" datetime>`의 timezone 포함 게시 시각을 보존한다. 같은 bytes를 새 profile로 재파싱했으므로 옛 parse는 지우지 않는다. `test_newspim_profile_excludes_ai_summary_and_keeps_reporter_body`가 본문·날짜·AI 요약/이메일 제외를 재현한다.

```sh
.local/research/local-ai/runtime/venv/bin/python -m unittest discover \
  -s tests -p 'test_research_worker.py' -k newspim
node scripts/research.mjs reparse \
  --run 20260928-hd-aidin-sep13-reparse-v2 \
  --source-run 20260928-hd-aidin-sep13-original-news-v1
```

위 명령의 현재 실물 결과는 Python 집중 1건 통과, reparse의 두 `captured` 원문과 `extracted` 6·7블록이다. FANUC 모델 후보는 6개 중 하나가 `quote_not_in_block`으로 구조 단계에서 실패했다. 나머지 다섯 개도 사건 사실로 승인하지 않았다. 현재 전체 코드 회귀는 `npm run test:garden` 281/281, 격리 worker Python 전체 64/64, `npx tsc --noEmit` 통과다. 이는 새 원문 의미를 승인하거나 private preview·Drive·공개를 새로 검증한 결과가 아니다. 각 사건은 원문 block/인용/의미·시제→claim 검토→기존 ID 기사 정정→의존 노트→새 전체 private preview 순으로 이어가야 한다. 새 preview 이전에는 v4의 승인 숫자·RSS 불변 시험을 그대로 최신 판정에 재사용하지 않는다.

## 55. 9월 13일 두 기존 사건의 원문 승인과 출처 표시 검증

54절은 **그때의 수집 상태**이며 현재 사실 판정은 이 절을 따른다. 원본 9월 13일 회차 SHA `69a9793d517d13b6ea7764b6203819af9a723fef2161afe47afa46a7b529c2dd`와 사건 ID 두 개를 승인 입력의 `retrospective_review.appearances`에 고정했다. 과거 기사를 오늘의 신규 회차로 다시 넣거나 RSS GUID를 발급하지 않았다. 비공개 자료는 `.local/research/local-ai` 아래에 있고 `vault/`·Drive·실제 공개 경로에는 적용하지 않았다.

### 55.1 사실 검토와 원고

| 사건                         | 실제 검토                                                                                                                                                   | 최종 원고 결정                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FANUC `eb739a02acad3ab9`     | 일본어/영어 공식 발표의 block과 인용을 직접 대조했다. Qwen 후보 6개 가운데 2개 보류(자동 실행 과장, 인용 불일치), 원문 직접 추가 4개를 포함해 verified 8개  | 도면의 재료·최종 형상 → 용접 조건·로봇 동작 생성, 작업자의 실행/조정 선택, 9월 16일 시연·12월 말 출하 계획을 구분한다. 이름만 같은 범용 `AI Agents` 전문용어 링크는 제거한다.                               |
| HD–에이딘 `902d86854fec2b7d` | 뉴스핌 6블록·이데일리 7블록을 읽었다. 숫자 조건 3개를 정확한 원문 구절로 교정하고 조선소 표면처리 공동 개발 계획 1개를 직접 추가했다. verified 6/deferred 1 | 뉴스핌의 9월 11일 130억 원 지분 취득, 이데일리의 에이딘 9월 10일 발표·전체 160억 원 조달을 구분한다. 5지 로봇손·표면처리·연 3만 대 생산체제는 계획이다. 9월 14일 HD 공식 글은 당시 기사 근거로 넣지 않는다. |

각 run의 `fact-review-input-v1.json` → `reviewed-claims.json`, `drafts/`·`corrections/` → `draft.json`·`preview.md`, `editorial-approval-input-v1.json` → `approved-article.json`이 판정 사슬이다. 실제 최종 문장에 사용된 claim은 `source_version_id`, `parse_id`, `block_id`, 정확한 `quote`와 검토 날짜를 갖는다. 모델 원출력은 후보이며 구조 검사만 통과한 문장은 기사에 넣지 않는다. 두 기사의 `published_at`은 2026-09-11, `reviewed_at`은 2026-09-28이다. 기계 후보·보류 사유는 공개 원고에 쓰지 않는다.

### 55.2 소급 생성과 링크 수리

기존 `editionProjection`은 정정 기사의 `concept_ids:[]`를 존중해 기사 본문 연결을 없애도 회차 `linked_knowledge_notes`는 원본에서 그대로 복사했다. 현재 코드는 변경 기사의 이전 개념 경로와 새 승인 ID를 비교하고, 최종 본문에서 더 이상 쓰지 않는 경로만 제거한다. 승인한 새 ID는 현재 `Knowledge` 및 이번에 승인된 새 노트의 `concept_id`→경로로 변환한다. ID에 대응하는 노트가 없거나 중복되면 preview를 중단한다. 테스트는 `AI Agents` 제거, 다른 기사/독립 링크 보존, 새 ID의 오브시디언 링크 생성 및 알 수 없는 ID 거부를 각각 확인한다.

독자 뉴스 노트는 이전에 `[S4]`처럼 회차 내부 번호를 그대로 보이고 상단 원문 링크와 하단 출처 목록을 반복했다. `refresh`는 작성 원본의 `[S번호]`와 `Source List`를 유지하면서 독자용 `News` 생성본에서 문단별 `[원문 1](<URL>)` 링크로 바꾸고 하단의 중복 목록을 생략한다. `garden.test.mjs`는 출처 URL 보존, 내부 표식 비노출, 재실행 bytes 동일성을 검증한다. 브리핑·RSS·GitHub digest는 승인 원고와 근거 URL의 기존 계약을 유지한다.

전체 입력은 `.local/research/local-ai/20260928-sep13-fanuc-hd-clean-citations-private-site-v8-command.json`에 순서대로 고정했다. 승인 run 24개와 지식 run 7개를 모두 포함하는 비공개 `preview`만 새 run ID로 재실행한다. 기존 승인 run/원문 run의 파일을 고쳐 재사용하지 않는다. `v8/preview-manifest.json`은 영향 회차 11개, 지식 노트 18개, 공개 파일 281개(HTML 255개), digest 132개와 RSS 40개 `(GUID,pubDate)` 보존을 기록한다. 두 뉴스/9월 13일 브리핑/RSS/digest는 정정 제목·리드·원문 URL이 일치하며 FANUC 사건의 지도 연결은 0개다.

```sh
node --test tests/garden.test.mjs tests/research-projection.test.mjs tests/research-retrospective.test.mjs
npm run test:garden
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npx tsc --noEmit
npx prettier --check scripts/garden.mjs scripts/research/publish-adapter.mjs scripts/research/preview.mjs tests/garden.test.mjs tests/research-projection.test.mjs
git diff --check
```

최종 코드 검증은 Node 282/282, Python 64/64, TypeScript exit 0이며 private preview의 `refresh`·knowledge sync/check·validate·build·verify·cross-channel consistency도 통과했다. Playwright Chromium은 1440×900과 390×844에서 HD/FANUC 뉴스와 9월 13일 브리핑을 열었다. 원문 링크·영역 넘침·콘솔 오류 0, 로봇·제조 탭 공유 URL과 뒤로 가기, FANUC 뉴스의 잘못된 `AI Agents` 링크 부재를 확인했다. 영수증은 `.local/research/local-ai/preview-http-v6/browser-smoke-v6.json`과 `browser-citations-v7.json`, 스크린샷 3개에 있다. 마지막 코드 서식만 다른 v8의 두 기사·브리핑·RSS HTML/XML bytes는 이 브라우저에서 시험한 v7과 같고, v7/v8 공개 파일 중 차이는 시간 의존 `sitemap.xml` 한 개다. `v8` manifest의 `browser_verified:false`는 생성 시 불변 값을 유지한다.

### 55.3 재개와 남은 관문

OpenAI Habitat URL은 별도 Python 요청에서도 HTTP 403이었다. 웹 검색에서 읽히는 렌더링 텍스트를 원문 bytes와 동일하다고 저장하거나 출처 판정을 생략하지 않는다. 기존 사건 `46fcf5bb7b99520f`는 접근 보류로 유지하고 공식 대체본·합법적 캡처 경로를 조사한다. 그다음 92개 구형 회차/801구간의 원문·의존 노트를 사건별로 판정하고, KUKA·ABB·두산로보틱스 및 IR/RSS/공시/논문/대학 경로를 같은 기간 종료 기준으로 늘린다. 독립 개발40/보류20 모델 평가, 기존 08시 실행 연결, Drive 전량 원격 SHA·쓰기/readback, 실제 웹/RSS/GitHub 공개와 신규 성공7회는 아직 미완료다. 다른 작업자의 vault/Drive 변경이 있으면 해당 기준을 먼저 다시 대조한다.

## 56. KUKA 독일어 뉴스 기간 수집과 폼 원문 보존

2026-09-28, 기존 `vault/`·승인 run과 병행해 KUKA 공식 목록/상세를 비공개 연구 저장소로만 수집했다. 초기 목록 HTML은 비어 있는 기사 카드와 공개 폼 설정을 담았고, 공개 JavaScript는 `/api/news/GetPublications`로 `POST`한다. 실제 요청에서 `sc_lang=de-DE`가 없을 때 한국어판 URL·날짜가 반환됐으므로 해당 응답을 독일어 route에 사용하지 않았다. endpoint와 폼 ID는 [출처 명세 28절](SOURCE_ACQUISITION_SPEC.md#28-kuka-독일어-뉴스의-폼-목록과-상세-원문)에 기록했다.

```sh
node scripts/research.mjs scan-list \
  --run 20260928-kuka-de-sep-window-v2 \
  --channel route-kuka-news-de \
  --since 2026-09-01 --until 2026-09-28
node --test tests/research-kuka-scan.test.mjs tests/research-runtime.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm run test:garden
npx tsc --noEmit
```

최종 run의 `list-scan.json`은 `window_scanned`, `window_items:2`, `reached_older_item:true`, `scanned_items:20`, `total_elements:282`다. `list-pages.json`은 POST 목록 JSON 1개와 원 bytes SHA를 가리킨다. `documents.json`·`parses.json`은 두 상세의 저장 원문과 각각 2026-09-24/2026-09-10 `published_at`, `profile_status:matched`, 본문 10/12블록을 기록한다. `candidates.json`의 두 후보에는 목록 JSON 위치와 원문 계보가 있고 `candidate_published:false`다. `assertStoredEvidence`로 두 상세 원문/parse를, 별도 SHA·source ID 확인으로 목록 원문을 검증했다. 최종 코드 상태에서 같은 run을 다시 실행해 세 URL의 HTTP 시도 수와 다섯 출력 파일 SHA가 모두 불변이었다.

이번 코드 회귀는 Node **286/286**, 격리 Python **65/65**, TypeScript와 관련 JS/JSON Prettier·`git diff --check`를 통과했다. 초기 HTML·상세 원본의 사전 탐색 run은 `20260928-kuka-news-and-forklift-source-v1`, 새 상세 profile의 같은 bytes 재파싱은 `20260928-kuka-news-detail-reparse-v1`, 완주한 최종 수집 run은 `20260928-kuka-de-sep-window-v2`다. v1은 코드 서식 전 시험 입력이고, v2가 현재 실행 영수증이다. 실제 공식 문서의 수집·파싱 통과는 모델의 사실 추출, 사람이 읽은 사실 승인, 두 후보의 과거 회차 편입, Drive·웹·RSS·GitHub 공개를 의미하지 않는다.

다음 KUKA 작업은 두 후보와 기존 기사 inventory를 대조해 중복·날짜·제품/고객 주장과 기사화 가치를 원문에서 검토하는 것이다. KUKA IR·고객 설치·첨부 자료, ABB·두산로보틱스의 목록/상세, 나머지 자료 유형을 같은 종료 기준으로 확장한다. 이 경로 하나의 성공으로 92개 경로 또는 전체 8개 분야 조사 완료를 선언하지 않는다.

## 57. 두산로보틱스 영문 뉴스의 URL 보존과 기간 완주

2026-09-28에 `route-doosan-news-en`을 정확한 HTML 목록·두 상세 템플릿으로 연결했다. 초기 `20260928-doosan-en-news-index-probe-v1`의 `captured`는 원 뉴스 URL 끝 `/`를 네트워크 요청에서 제거해 홈페이지로 리다이렉트된 **잘못된 목록**이었다. curl HEAD와 수집 원본의 `redirect_chain`을 대조한 뒤 `SourceFetcher`가 원 경로의 `/`를 보존하도록 고쳤다. 올바른 목록 원본은 `20260928-doosan-en-news-index-slash-v1`에 남겼으며, 이전 실패를 삭제하거나 성공으로 고쳐 쓰지 않았다. 출처·종료·재게시 판정은 [출처 명세 29절](SOURCE_ACQUISITION_SPEC.md#29-두산로보틱스-영문-뉴스의-전체-목록상세-경로)을 따른다.

```sh
node scripts/research.mjs scan-list \
  --run 20260928-doosan-en-sep-window-v2 \
  --channel route-doosan-news-en \
  --since 2026-09-01 --until 2026-09-28
node scripts/research.mjs scan-list \
  --run 20260928-doosan-en-june-window-v2 \
  --channel route-doosan-news-en \
  --since 2026-06-01 --until 2026-07-01
node scripts/research.mjs reparse \
  --run 20260928-doosan-en-legacy-detail-profile-v1 \
  --source-run 20260928-doosan-en-legacy-detail-probe-v1
node --test tests/research-list-scan.test.mjs tests/research-runtime.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm run test:garden
npx tsc --noEmit
```

9월 run의 `list-scan.json`은 `window_scanned`, 목록35/35, `listing_page:1`, `listing_pages:1`, `older_items:35`, `window_items:0`, `candidate_count:0`이다. 6월 run은 같은 목록35/35와 기간 항목2개, 더 오래된 33개, 상세 두 건의 목록/본문 날짜 6월26일·22일 일치를 기록한다. 두 상세는 제목·원문 게시일과 본문23·8블록을 갖지만 `review_status:unreviewed`이며 `candidate_published:false`다. `/view/116` 저장 원문 재파싱은 2026-01-06 게시일·본문9블록으로 다른 상세 템플릿을 확인했다. 세 run의 저장 문서/parse는 `assertStoredEvidence`를 통과했다. 6월·9월 최종 run을 같은 ID로 재실행해 네 출력 파일의 SHA와 전체 HTTP 시도 수가 각각 불변임도 확인했다.

최종 코드 검사 결과는 Node **288/288**, 격리 Python **67/67**, TypeScript 통과다. 두산 영문 뉴스 목록에는 이 관측 시점에 9월 기사가 없지만 다른 언어판·IR·공시·고객 경로는 아직 이 판정에 포함되지 않는다. 6월26일 재게시물은 원매체 MoneyToday 기사를 별도로 확인하기 전까지 독립 공식 발표로 사용하지 않는다. 이전 비공개 승인 사본 `v8`·작성 원본 `vault/`·Drive·공개 웹/RSS/GitHub는 이 수집으로 바뀌지 않았다. 다음 경로는 ABB Robotics 공식 뉴스와 두산 IR/국문 발표이며, 동시에 KUKA 후보의 사실·중복 검토와 전체 B~F를 이어간다.

## 58. ABB Robotics 영문 뉴스의 공개 JSON 기간 수집

2026-09-28에 [ABB Robotics 공식 아카이브](https://www.abb.com/global/en/areas/robotics/news-and-media/news-archive)의 정적 HTML, `.model.json`, 공개 `NewsList.js`, JSON 목록 페이지와 상세 세 템플릿을 각각 비공개로 저장했다. `/etc.clientlibs/`의 robots 거부를 우회하지 않았다. 목록/상세와 페이지 종료 규칙은 [출처 명세 30절](SOURCE_ACQUISITION_SPEC.md#30-abb-robotics-영문-뉴스의-공개-피드상세-경로)에 기록했다.

`data/research-watchlist.json`의 `route-abb-robotics-en`은 뉴스 아카이브에 붙는다. `data/research-acquisition.json`은 피드 ID·공개 API 주소·페이지/상세 예산과 `abb-global-en-news-detail` 파싱 선택자를 고정한다. `scripts/research/abb-scan.mjs`는 목록 JSON의 현재 `count=305` 중 필요한 페이지를 읽고 시작일 이전 항목 또는 마지막 항목에서 멈춘다. `scripts/research.mjs`의 `scan-list`가 기존 수집 정책, 단계 checkpoint, 상세 원문 비교를 실행한다.

```sh
node scripts/research.mjs scan-list \
  --run 20260928-abb-en-sep-window-v2 \
  --channel route-abb-robotics-en \
  --since 2026-09-01 --until 2026-09-28
node --test tests/research-abb-scan.test.mjs
.local/research/local-ai/runtime/venv/bin/python -m unittest \
  tests.test_research_worker.WorkerTests.test_abb_global_news_profile_reads_embedded_publication_day_and_body
npm run test:garden
.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npx tsc --noEmit
```

`runs/20260928-abb-en-sep-window-v2/list-scan.json`은 `status:window_scanned`, `total_elements:305`, `scanned_items:20`, `window_items:3`, `reached_older_item:true`다. `list-pages.json`은 JSON 목록 페이지 1개의 저장 원본과 SHA를, `documents.json`·`parses.json`은 세 상세의 저장 원본·제목·본문 14/15/33블록·발표일 2026-09-21/09-02/09-02을 가리킨다. 각 `details`의 목록/본문 날짜가 같고 `article_profile_id:abb-global-en-news-detail`, `status:source_parsed_unreviewed`다. `candidates.json`은 세 건 모두 `review_status:unreviewed`이고 실제 기사나 오늘 회차로 이동하지 않는다.

수집 실패를 해석할 때 `page_fetch_failed`/`page_blocked`는 접근 문제, `page_parse_failed`는 MIME·JSON·해시·페이지 구조, `listing_changed_during_scan`은 페이지 사이 총건수 변화, `duplicate_or_unordered_page`는 중복/날짜 역순, `cutoff_not_reached`는 페이지 예산 부족, `detail_incomplete`는 상세·본문·날짜/profile 미일치로 구분한다. 페이지 일부의 성공으로 전체 구간을 통과시키지 않는다. 실패한 run의 원본·시도 영수증은 유지하고 변경된 profile 또는 최신 원문은 새 run ID로 조사한다. 현재 API의 `count`는 전체 아카이브 건수이며 이 기간의 기사 수가 아니다.

같은 run을 재실행한 결과 `list-scan.json`, `list-pages.json`, `documents.json`, `parses.json`, `candidates.json`의 SHA 다섯 개가 불변이었다. 실제 목록과 상세 원 bytes 네 개도 각 기록의 SHA와 일치했다. 집중 Node 3건, HTML 파서 집중 1건, 전체 Node **291/291**, 격리 Python **68/68**, TypeScript 검사가 통과했다. 이 검증은 ABB 피드의 **지정 기간 수집·파싱**에 해당한다. 세 후보의 사건 동일성·계획/실적·수치 조건·분야/테마/전문용어 연결은 원문 직접 검토 뒤 결정한다. `vault/`, Drive, 실제 웹/RSS/GitHub, 기존 오전 8시 예약은 이 실행에서 수정하지 않았다.

## 59. ABB Robotics 9월 후보의 원문 유형별 1차 편집 판정

`20260928-abb-en-sep-window-v2`의 상세 원문 3건과 별도 `20260928-abb-en-quote-reparse-v1`의 새 parse 3건은 전역 연구 보관 루트에서 `assertStoredEvidence(root, documents, parses)`로 검증했다. run 폴더는 목록·문서·parse 영수증이 모인 위치이고, `body_path`와 불변 parse는 `.local/research/local-ai/`를 기준으로 저장된다. 최초 파싱에서 직접 텍스트를 담은 `<blockquote>`가 빠져 있었으므로 worker의 기본 블록 대상에 추가하고 중첩 문단은 한 번만 저장하도록 수정했다. 같은 원문 bytes를 재수집하지 않고 아래 명령으로 파싱 판본을 분리했다.

```sh
node scripts/research.mjs reparse --run 20260928-abb-en-quote-reparse-v1 --source-run 20260928-abb-en-sep-window-v2
```

최신 본문 블록 수는 E-Device 15, Dunia 17, 현대화 특집 33이다. 원문 발표일 2026-09-21/09-02/09-02와 세 source version은 최초 수집과 같고, 새 parse ID만 바뀌었다. 1차 판정 전문은 비공개 `.local/research/local-ai/20260928-abb-editorial-triage-v1/triage.md`에 둔다. 기존 `vault/`에서 전체 원문 URL·제목의 동일 사건 기사는 발견되지 않았으며 `ingestible-devices` URL에 우연히 포함된 `E-Device` 문자열을 중복으로 오인하지 않도록 점검했다.

| 공식 원문                                                                                                                                              | 원문별 역할과 다음 판정                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [E-Device, 9월 21일](https://www.abb.com/global/en/news/138831/prsrl-abb-robotics-e-device-simplifies-robot-interaction-on-customers-own-devices)      | 출시 보도자료다. 고객 태블릿/PC와 OmniCore 기반 로봇·협동로봇을 연결하는 안전 인터페이스를 설명한다. ISO/CE/UL·시간 단축 주장은 발표자 귀속과 인증/효과의 근거 범위를 다시 판정해야 한다. |
| [Dunia, 9월 2일](https://www.abb.com/global/en/news/138370/cstmr-ai-self-driving-labs-enable-up-to-10x-faster-materials-research-at-dunia-innovations) | 고객 적용 사례다. 20회 목표 달성은 회사가 제시한 한 실험이고 기존 방법 `200회 이상`은 Dunia의 추정이다. 향후 3셀·AMM·60셀 Gigalab 계획을 현재 가동 규모로 쓰지 않는다.                    |
| [현대화 특집, 9월 2일](https://www.abb.com/global/en/news/138456/wbstr-send-robots-into-overdrive-with-modernization)                                  | 신규 사건이 없는 일반 가이드·홍보 글이다. 현재 뉴스 기사로 세지 않고 필요하다면 기술 배경 자료로만 별도 검토한다.                                                                         |

이 단계는 기사 사실 검토나 제외 승인도 아니다. 원문 보관·후보 상태 `unreviewed`를 유지했다. E-Device와 Dunia의 각 문장을 block ID에 연결하는 직접 검토, 독립 자료·기존 언어판·사건 ID 대조, 과거 해당 날짜 회차의 보완 여부는 다음 단계다. 세 건을 9월 28일 신규 브리핑으로 발행하지 않는다.

## 60. ABB E-Device 원문 직접 검토와 과거 회차 비공개 보완

기준 원문은 [ABB Robotics의 2026-09-21 E-Device 보도자료](https://www.abb.com/global/en/news/138831/prsrl-abb-robotics-e-device-simplifies-robot-interaction-on-customers-own-devices)다. 59절의 인용문 포함 parse `62b8f1360131bf6e4c58aa4b5c7a931c51cabb6af986b7844333e1d92579ef3c`와 원문 SHA `9739cd42e77cc661ffc3d28aab79ad04028ed9203875fd31dd6dce8e7571924b`를 고정했다. `select-source`로 ABB 세 후보 중 이 한 URL만 `20260928-abb-edev-source-v1`에 분리했다. 실제 로컬 `qwen3.8:27b`·`think:false` 추출은 후보 5개/구조 통과 5개를 만들었지만 사실 승인 수는 0이었다.

원문을 직접 읽고 `.local/research/local-ai/runs/20260928-abb-edev-extract-v1/fact-review-input-v1.json`에서 모델 후보 3개를 검증, 2개를 보류했다. 누락된 제품 사용 도구·오프라인 개발→현장 배포 2개를 저장 block의 정확한 원문으로 추가 검증해 **검증 사실 5개·보류 2개**가 됐다. 출시 발표는 출하·판매 실적이 아니다. 비상정지 버튼과 3단계 enabling switch는 ABB가 설명한 제품 구성이고 독립 안전 시험 결과가 아니다. ISO 10218:2025·CE/UL 인증 범위는 별도 증빙을 보지 않아 기사 본문에 쓰지 않았다. 사장 발언의 교육·배포 효익은 가능성 설명으로만 처리했으며 인력 약 7천 명의 회사 소개 문구는 사건 설명에서 제외했다.

`article_write`의 초안은 원문 반복과 개인 단말·안전 인터페이스의 역할 혼동 가능성이 있어 `draft-correction-input-v1.json`으로 직접 고쳤다. 최종 제목은 **“ABB Robotics, 개인 태블릿·PC로 로봇을 조작하는 E-Device 발표”**, 리드는 9월 21일/누가/무엇을/어떻게를 두 문장에 담는다. 설명은 RobotStudio·AppStudio와 동일 태블릿/PC의 오프라인 개발→현장 배포만 남겼다. 근거 없는 시장 전망·고객 도입 실적·인증 결론을 추가하지 않았다. `approved-article.json`은 새 고정 사건 ID `5e467cdcb79271a9`, 원 발표일 `2026-09-21`, 검토일 `2026-09-28`로 **비공개 승인**됐다.

기존 작성 원본의 9월 22일 회차는 9월 21일 발표를 포함하는 날짜 범위다. 승인 입력의 `historical_addition_review`는 `Editions/2026/09/2026-09-22_0800_Tech_AI_Briefing.md`의 SHA `9c3544d7ef7795a98abe14cb359a44e6d6c42671c575fc57af9f2dc33df4d6e2`에 고정한다. 원본 파일은 수정하지 않고 과거 회차 보완으로만 투영했으며 9월 28일 신규 회차는 생성하지 않았다. `preview`는 직전 승인 24개와 이번 승인 1개, 지식 run 7개를 담은 `.local/research/local-ai/20260928-abb-edev-historical-private-site-v1-command.json`으로 재현한다. 핵심 명령은 아래와 같다.

```sh
node scripts/research.mjs select-source --run 20260928-abb-edev-source-v1 --source-run 20260928-abb-en-quote-reparse-v1 --url https://www.abb.com/global/en/news/138831/prsrl-abb-robotics-e-device-simplifies-robot-interaction-on-customers-own-devices
node scripts/research.mjs extract --run 20260928-abb-edev-extract-v1 --source-run 20260928-abb-edev-source-v1 --model-policy data/research-model-policy.json
node scripts/research.mjs review --run 20260928-abb-edev-extract-v1 --review .local/research/local-ai/runs/20260928-abb-edev-extract-v1/fact-review-input-v1.json
node scripts/research.mjs draft --run 20260928-abb-edev-extract-v1 --model-policy data/research-model-policy.json
node scripts/research.mjs correct --run 20260928-abb-edev-extract-v1 --review .local/research/local-ai/runs/20260928-abb-edev-extract-v1/draft-correction-input-v1.json
node scripts/research.mjs approve --run 20260928-abb-edev-extract-v1 --review .local/research/local-ai/runs/20260928-abb-edev-extract-v1/editorial-approval-input-v1.json
```

비공개 `20260928-abb-edev-historical-private-site-v1`은 영향받은 과거 회차 11개·승인 기사 run 25개·지식 노트 18개, 생성 공개 파일 **282개**였다. 직전 사본의 281개에 새 뉴스 HTML 1개만 추가됐다. 기존 RSS **40개**의 `(GUID,pubDate)` 순서와 값이 동일하고, 9월 22일 항목에서 새 기사 주소·ABB 원문으로 연결된다. 웹 기사·브리핑·RSS·GitHub digest의 날짜/리드/원문 URL은 같은 승인 입력에서 생성됐고 `.local/research/local-ai/20260928-abb-editorial-triage-v1/private-channel-check.json`에 비교 결과를 남겼다. 이 결과는 `candidate_published:false`, `drive_verified:false`, `browser_verified:false`인 **로컬 생성·링크 검증**이다. 작성 `vault/`·Drive·실제 공개 웹/RSS/GitHub·기존 예약은 변경되지 않았다.

초안 Markdown에서 같은 원문 URL이 리드와 설명의 끝에 반복되던 문제는 `draftMarkdown`이 첫 등장 위치에만 링크를 출력하도록 수정하고 단일 원문 심층 fixture에서 중복 7회→1회 회귀를 추가했다. 생성 당시의 `preview.md`는 수정 전 결과로 남기며 최종 웹 투영의 링크 검증과 구분한다. Node 전체 **291/291**, Python 전체 **68/68**, TypeScript, 관련 Prettier 및 저장 원문/parse 해시 검사가 통과했다. 후속은 Dunia 고객 사례의 20회 관측·200회 이상 추정/미래 60셀 계획을 독립 자료와 대조하고, 현대화 특집은 신규 사건 제외를 확정하는 것이다. 남은 등록 경로·구형 전수 검토·독립 평가·Drive/공개·신규 성공 7회도 별도 관문이다.

생성 뒤 별도 로컬 서버와 Playwright Chromium으로 새 기사와 9월 22일 브리핑을 **1440px·390px**에서 열었다. 네 화면 모두 HTTP 200, E-Device 본문·기사/ABB 원문 링크, 지도 canvas 부재, 가로 넘침 0px, 브라우저 page error 0을 확인했다. 영수증 `.local/research/local-ai/20260928-abb-editorial-triage-v1/private-ui-check.json`과 화면 4개를 보존했다. 생성 시점의 `preview-manifest.json`에 적힌 `browser_verified:false`는 사후 브라우저 시험으로 재작성하지 않는다. 이 검증은 로컬 Chromium 결과이며 실제 공개 URL·모바일 실기기 확인을 대체하지 않는다.

## 61. FANUC 날짜별 IR 공시의 원문 수집과 재현

2026-09-28에 FANUC 분기 결산 목록 `/ja/ir/announce/`와 날짜별 [기타 공시자료](https://www.fanuc.co.jp/ja/ir/announce_other/)의 날짜 계약을 비교했다. 분기 목록의 파일명·회계기간을 공개일로 대체하지 않기 위해 날짜별 공시를 별도 `route-fanuc-ir-disclosures-ja`로 등록했다. 공식 목록 원문은 `20260928-fanuc-ir-disclosures-index-v1`에, 9월 PDF 두 건의 처음 원문 확보는 `20260928-fanuc-ir-disclosures-sep-pdfs-v1`에 보존한다. PDF 1쪽의 일본어 제목·일자 exact profile을 적용한 별도 parse는 `20260928-fanuc-ir-disclosures-pdfs-profile-v1`이다. 처음 원문/parse와 최종 기간 scan을 서로 덮어쓰지 않는다.

최종 기간 실행 명령은 다음과 같다.

```sh
node scripts/research.mjs scan-list \
  --run 20260928-fanuc-ir-disclosures-sep-window-v2 \
  --channel route-fanuc-ir-disclosures-ja \
  --since 2026-09-01 \
  --until 2026-09-28
```

`--until`은 제외 경계다. `.local/research/local-ai/runs/20260928-fanuc-ir-disclosures-sep-window-v2/`의 `list-scan.json`, `documents.json`, `parses.json`, `candidates.json`, `state.json`을 함께 읽는다. 목록 관측은 `selected_items=144`, `matched_links=144`, `window_items=2`, `older_items=142`, `later_items=0`; 두 상세는 `source_parsed_unreviewed`, PDF 첫 페이지 날짜는 목록의 2026-09-18/09-03과 각각 일치한다. 본문 블록은 21/22개이고 둘 다 `review_status:unreviewed`, `candidate_published:false`다. 동일 run ID 재실행은 원격 재요청 없이 0.034초에 끝났으며 위 다섯 산출물의 SHA가 불변이었다. 저장 원문 3개와 parse 3개는 `assertStoredEvidence`로 무결성을 검사했다.

목록을 기존 `reparse` 명령으로 다시 읽어 만든 `20260928-fanuc-ir-disclosures-index-profile-v1`은 **listing adapter를 적용한 판본이 아니다**. `reparse`는 현재 article profile만 읽으므로 그 run의 generic parse 261블록을 최종 날짜별 목록 영수증으로 사용하지 않는다. 목록 rule은 `scan-list`가 적용한 최종 run의 `list-scan.json`과 `parses.json`을 기준으로 확인한다. 이후 동일 원문에서 목록 선택자만 바뀔 때에는 이 명령 경계를 먼저 보완하거나 새 `scan-list` 관측으로 재검증해야 한다.

코드 경계는 `data/research-watchlist.json`의 FANUC route, `data/research-acquisition.json`의 목록 adapter·두 PDF exact profile, 기존 `scripts/research/list-scan.mjs`·`fetch.mjs`·`integrations/research-worker/worker.py`다. 합성 목록 회귀는 `tests/test_research_worker.py`의 FANUC 연도/일자 fixture가 같은 날 두 PDF, 다른 날짜, 잘못된 날짜를 검사한다. `tests/source-registry.test.mjs`는 분기 IR와 새 공시 URL의 route 분리 및 profile URL 범위를 확인한다. 이번 회귀는 Node **292/292**, Python 전체 **69/69**, TypeScript 통과다. 이는 출처·파싱의 로컬 증거이며 두 PDF의 재무 사실 검토·기사 승인·Drive 저장·공개·예약 변경을 뜻하지 않는다.

재개할 때는 먼저 두 PDF의 쪽별 사실·표 각주를 읽고 기존 사건 목록과 대조한다. 최초 PDF의 날짜·제목이 맞더라도 주식 수/금액을 기사에 자동 옮기지 않는다. 9월 기간의 두 건을 소급할 가치가 있으면 그때의 회차와 고정 ID 정책을 따른다. 다음 공시가 다른 서식이면 `article_profile_missing_or_ambiguous`를 유지하고 새 exact profile을 시험한다. 분기 IR, SEC/DART, 다른 제조사, 논문/대학·TLO는 각각 목록 종료·본문·판본 계약이 남아 있다. 이번 run은 작성 `vault/`·Drive·실제 웹/RSS/GitHub·기존 08시 예약을 바꾸지 않았다.

## 62. FANUC 자기주식 공시 3건의 직접 검토와 비공개 소급

이 절은 61절의 **미검토 수집 영수증을 덮어쓰지 않는 후속 판정**이다. 세 공식 PDF를 직접 읽었다: [4월 24일 최초 결의](https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260424-01.pdf), [9월 3일 8월 현황](https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260903.pdf), [9월 18일 9월 현황·종료](https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260918.pdf). 세 문서는 모두 1쪽이다. 원 PDF 화면과 저장 parse를 대조했고, 검토 원표·parse ID·산술 확인은 비공개 `.local/research/local-ai/fanuc-buyback-direct-review-20260928/source-review.md`에 남겼다. 최초 결의 PDF의 `CreationDate`는 4월 23일이지만 원문 1쪽의 명시 날짜는 **4월 24일**이다. URL이 `notice20260424-01.pdf`인 그 문서에만 적용하는 `fanuc-ja-ir-buyback-resolution-20260424` exact profile을 추가해 다른 4월 PDF와 혼동하지 않게 했다.

4월 결의의 **계획**은 보통주 최대 1,000만 주·500억 엔을 2026년 5월 1일부터 2027년 4월 30일까지 시장에서 매입하는 것이었다. 회사는 변화하는 경영환경에 대응할 자본정책의 유연성과 기동성 확보를 이유로 제시했다. 9월 3일 공시는 8월 1~~31일 **3,981,900주·24,824,866,000엔**, 9월 18일 공시는 9월 1~~17일 **4,287,000주·25,174,924,800엔**, 9월 17일까지의 누계 **8,268,900주·49,999,790,800엔**을 기록했다. 두 달 수량·금액의 합이 누계와 일치한다. **9월 18일은 종료 공지일**, 17일은 마지막 집행 구간의 끝이다. 원문은 조기 종료 이유나 로봇 사업 효과를 밝히지 않으므로 기사에 쓰지 않는다. 4월 결의는 9월 최신 뉴스로 세지 않는다.

다음 명령은 저장 원본에서 승인 사본까지의 실제 실행 경로다. 4월 문서는 처음 generic parse로 저장된 뒤 **같은 bytes를 새 profile로 재파싱**했다. 9월 두 문서는 이미 목록의 날짜와 PDF 날짜가 일치한 61절 run에서 선택했다. `review` 입력은 모델의 누락·표 항목 연결 오류·종료일 표현을 원문에 맞춰 고친 사실 8개를 담는다. `draft`의 원출력은 FANUC을 반도체 분야로 분류해 **그대로 승인하지 않았다**. 직접 읽은 한국어 교정 원고는 `로봇·제조`/`투자·기업거래`/`자기주식 취득`으로 분류하고, 근거 없는 전략 해설은 만들지 않았다.

```sh
node scripts/research.mjs select-source --run 20260928-fanuc-buyback-source-v1 --source-run 20260928-fanuc-ir-disclosures-sep-window-v2 --url https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260918.pdf --url https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260903.pdf
node scripts/research.mjs collect --run 20260928-fanuc-buyback-resolution-source-v1 --url https://www.fanuc.co.jp/ja/ir/announce_other/pdf/2026/notice20260424-01.pdf
node scripts/research.mjs reparse --run 20260928-fanuc-buyback-resolution-profile-v1 --source-run 20260928-fanuc-buyback-resolution-source-v1
node scripts/research.mjs bundle --run 20260928-fanuc-buyback-three-sources-v1 --source-run 20260928-fanuc-buyback-source-v1 --additional-source-run 20260928-fanuc-buyback-resolution-profile-v1
node scripts/research.mjs extract --run 20260928-fanuc-buyback-three-extract-v1 --source-run 20260928-fanuc-buyback-three-sources-v1 --model-policy data/research-model-policy.json
node scripts/research.mjs review --run 20260928-fanuc-buyback-three-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-buyback-three-extract-v1/fact-review-input-v2.json
node scripts/research.mjs draft --run 20260928-fanuc-buyback-three-extract-v1 --model-policy data/research-model-policy.json
node scripts/research.mjs correct --run 20260928-fanuc-buyback-three-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-buyback-three-extract-v1/draft-correction-input-v1.json
node scripts/research.mjs approve --run 20260928-fanuc-buyback-three-extract-v1 --review .local/research/local-ai/runs/20260928-fanuc-buyback-three-extract-v1/editorial-approval-input-v1.json
```

최초 9월 20일 회차의 SHA `f16a270d4acaf9514c5411f1d6a9dea37a5806850d9fffa5fe339009783cc459`, 날짜 범위와 같은 사건·원문 URL의 기존 등장 여부를 확인하고 `historical_addition_review`에 고정했다. 승인 기사 사건 ID는 `45b47c5d0f0f0a04`, 원 발표일 `2026-09-18`, 검토일 `2026-09-28`이다. 이번 기사만의 원고 심층 분석은 없다. 지난 ABB 비공개 사본의 승인 입력 25개·지식 run 7개에 이 기사 run을 추가하는 정확한 인수 목록은 `.local/research/local-ai/20260928-fanuc-buyback-historical-private-site-v1-command.json`에 있다. 다시 만들 때 완료 run을 재사용하지 말고 새 run ID를 주고 동일 승인 목록을 전달한다.

```sh
node scripts/research.mjs preview --run <new-private-run> --approved-run <each-approved-run-from-command-json> --knowledge-run <each-knowledge-run-from-command-json>
```

완료 사본 `20260928-fanuc-buyback-historical-private-site-v1`은 승인 기사 run **26개**, 영향 과거 회차 **12개**, 지식 노트 **18개**, 공개 생성 파일 **283개(HTML 257개)**, digest **132개**다. 이전 ABB 사본보다 뉴스 HTML 1개가 늘었고 기존 RSS 40개 `(GUID,pubDate)`의 순서와 값은 같았다. 9월 20일 RSS 항목에서 새 기사 주소와 9월 18일 FANUC 원문으로 연결된다. 웹 기사·브리핑·RSS·digest의 제목·리드·원문 URL, 내부 검토 사유 비노출, 기사 지도 canvas 부재, 작성 원본 SHA 보존은 `.local/research/local-ai/fanuc-buyback-direct-review-20260928/private-channel-check.json`에 기록했다. 코드 검증은 `npm run test:garden` **293/293**, 프로젝트 전용 `.local/research/local-ai/runtime/venv/bin/python -m unittest discover -s tests -p 'test_*.py'` **70/70**, `npx tsc --noEmit`이 통과했다. 처음 시스템 `python3`로 실행한 전체 검사는 `pymupdf` 미설치로 import 실패했으며 전용 환경 재실행 성공과 구분한다.

생성 뒤 별도 로컬 서버와 Playwright Chromium에서 기사·9월 20일 브리핑을 **1440px·390px**로 열어 네 화면 모두 HTTP 200, 제목·금액·원문 링크, 지도 canvas 부재, 가로 넘침 0px, page error 0을 확인했다. 결과와 네 화면은 `.local/research/local-ai/fanuc-buyback-direct-review-20260928/private-ui-check.json` 및 같은 폴더의 PNG에 있다. manifest의 `browser_verified:false`는 생성 시점의 불변 기록이며 이 사후 시험으로 다시 쓰지 않는다. 실제 공개 URL·모바일 실기기 검증도 아니다.

`candidate_published:false`, `drive_verified:false`, `browser_verified:false`인 로컬 미리보기다. `vault/`·Drive·실제 웹/RSS/GitHub·08시 예약은 갱신하지 않았다. FANUC 분기 실적 아카이브와 다른 공시 서식, ABB Dunia/현대화 후보, 구형 92회차/801구간, 독립 40/20 평가와 신규 성공 7회는 별도 작업이다. 이 공시만으로 FANUC 로봇 부문의 사업 전략이 실행되거나 성과를 냈다고 판단하지 않는다.

### 62.1 동일 출처의 여러 원문을 구분하는 독자 링크

최초 기사 화면은 FANUC PDF 세 건을 모두 `fanuc.co.jp 원문`으로 반복해 어느 공시를 여는지 구분하기 어려웠다. `scripts/reader-cards.mjs`의 기사 카드와 `scripts/site.mjs`의 상세 기사 상단 링크가 **같은 매체의 여러 원문에만 번호를 붙이도록** 수정했다. 상세 기사에서 세 원문이 모두 같은 매체라면 시각 표기는 `원문 1·2·3`으로 줄이고 접근성 이름에는 `fanuc.co.jp 원문 1·2·3`을 유지한다. 서로 다른 매체가 섞인 경우에는 각각의 출처명을 그대로 보이며, 한 건짜리 원문도 기존 표기를 유지한다. 번호는 본문의 문단별 출처 번호와 순서를 공유한다. `tests/reader-cards.test.mjs`와 기존 `tests/source-labels.test.mjs`가 두 경우를 함께 고정한다.

완료 run은 다시 쓰지 않고 `20260928-fanuc-buyback-historical-private-site-v1`(최초), `v2`(번호), `v3`(상단 간결화), **`v4`(서로 다른 매체 표기 회귀 수정)**를 별도로 보존했다. 현재 재개할 입력 목록은 `.local/research/local-ai/20260928-fanuc-buyback-historical-private-site-v4-command.json`이다. v4는 승인 run 26개·영향 회차 12개·지식 18개·공개 파일 283개·digest 132개이며 기존 RSS 40개 `(GUID,pubDate)`가 유지됐다. 기사·9월 20일 브리핑·RSS XML·digest의 bytes가 v3와 같고 작성 원본 SHA도 불변인 결과는 `.local/research/local-ai/fanuc-buyback-direct-review-20260928/private-channel-check-v4.json`에 있다. v3의 **동일한 기사·브리핑 HTML bytes**를 Playwright Chromium 1440/390px로 확인한 결과는 `private-ui-check-v3.json`과 화면 PNG다. v4를 원격 웹이나 모바일 실기기에서 확인했다는 뜻은 아니다.

최종 코드 확인은 `npm run test:garden` **294/294**, 프로젝트 전용 Python 전체 **70/70**, `npx tsc --noEmit`이다. 처음 전체 Node 실행에서 기존 `source-labels.test.mjs`가 서로 다른 매체의 링크도 번호를 붙이는 회귀를 잡았고, 출처명이 서로 다른 경우 번호를 없애 수정한 뒤 재실행했다. RSS·GitHub digest는 이 UI 변경에서 동일 bytes다. 완료 사본의 manifest는 여전히 `candidate_published:false`·`drive_verified:false`·`browser_verified:false`다.

## 63. ABB Dunia 고객 사례의 직접 검토와 비공개 소급

이 절은 [58절](#58-abb-robotics-영문-뉴스의-공개-json-기간-수집)의 ABB 9월 기간 수집과 [59절](#59-abb-robotics-9월-후보의-원문-유형별-1차-편집-판정)의 1차 분류 중 **Dunia 고객 사례 한 건**의 후속이다. 재수집 성공을 주장하지 않고, 이미 저장한 [ABB 원 HTML](https://www.abb.com/global/en/news/138370/cstmr-ai-self-driving-labs-enable-up-to-10x-faster-materials-research-at-dunia-innovations)의 source ID `368b46197845ce077838`, version `368b46197845ce077838:35c14d77541c582054c851039576d3d530c522e8b1c9267f8adb1cc91bb3f9bb`, 인용문 포함 parse `5e1e823eb4e5c235cd09b9953d3686fa8f994061174128407a880a7f665da7f2`를 사용한다. 저장 원문·parse의 불변성은 `assertStoredEvidence` 검사를 통과한 입력이다. HTML의 `newsMetadata.scheduledPublishDate`는 `2026-09-02T13:13:50.6230000Z`, `newsStatus`는 `Published`, `revisionId`는 `1`이다. 9월 3일 회차의 수집 범위는 9월 2일 08:01:50부터 9월 3일 08:03:00 KST까지다. 회사의 게시 예정 시각을 실제 고객 설치일·독립 관측 최초 공개 시각으로 바꾸지 않는다.

직접 검토표 `.local/research/local-ai/abb-dunia-direct-review-20260928/source-review.md`는 원문 블록 3·6·7·12·16·17의 범위를 고정한다. 현재 셀은 **GoFa 협동로봇과 METTLER TOLEDO 계측기**를 결합하고 고체/액체 투입·분산을 자동화한다. 소재 조합 설계→실험→측정값 피드백은 회사가 설명한 순환 구조다. **한 실험의 20회**는 ABB가 전달한 Dunia의 결과이며, 순차 방식 `200회 초과`는 Dunia가 제시한 가상 비교 추정이어서 이번 공개 기사에 쓰지 않았다. 세 표준 셀과 AMM의 연결은 다음 단계 계획, 최대 60셀 Gigalab은 중기 구상이다. 공식 [Dunia 플랫폼 설명](https://dunia.ai/platform)은 일반 원리를 설명하지만 GoFa 설치일이나 20회 수치를 별도로 입증하지 않는다.

아래 명령은 저장 원문에서 승인 기사까지 실제 사용한 경로다. `extract`의 Qwen3.8 27B/`think:false` 후보는 6개/구조 통과 6개였지만 **GoFa와 시료 준비 작업이 누락**됐다. `fact-review-input-v1.json`에서 4개를 검증, 추정 비교·전극 사례 2개를 보류하고 원문 블록의 정확한 인용으로 3개를 추가해 **검증 사실 7개**로 만들었다. 모델 원고는 `AI/연구·기술`로 잘못 분류하고 현재/계획을 섞었으므로 `draft-correction-input-v1.json`으로 `로봇·제조/사업·고객/고객 도입`과 시제를 직접 교정했다.

```sh
node scripts/research.mjs select-source --run 20260928-abb-dunia-source-v1 --source-run 20260928-abb-en-quote-reparse-v1 --url https://www.abb.com/global/en/news/138370/cstmr-ai-self-driving-labs-enable-up-to-10x-faster-materials-research-at-dunia-innovations
node scripts/research.mjs extract --run 20260928-abb-dunia-extract-v1 --source-run 20260928-abb-dunia-source-v1 --model-policy data/research-model-policy.json
node scripts/research.mjs review --run 20260928-abb-dunia-extract-v1 --review .local/research/local-ai/runs/20260928-abb-dunia-extract-v1/fact-review-input-v1.json
node scripts/research.mjs draft --run 20260928-abb-dunia-extract-v1 --model-policy data/research-model-policy.json
node scripts/research.mjs correct --run 20260928-abb-dunia-extract-v1 --review .local/research/local-ai/runs/20260928-abb-dunia-extract-v1/draft-correction-input-v1.json
node scripts/research.mjs approve --run 20260928-abb-dunia-extract-v1 --review .local/research/local-ai/runs/20260928-abb-dunia-extract-v1/editorial-approval-input-v1.json
```

고정 사건 ID는 `368b46197845ce07`, 원 발표일 2026-09-02, 재검토일 2026-09-28이다. 기존 `vault/Editions/2026/09/2026-09-03_0803_Tech_AI_Briefing.md`의 원본 SHA는 `8120ecbe772d3dfeb70d7ade90fadfbe54a34de29e8d0852a6d7cbb5efabfaee`이며 `historical_addition_review`의 날짜 범위·원문 중복 확인과 함께 고정했다. 원본 파일은 쓰지 않았다. 9월 28일 신규 기사·신규 RSS 회차를 만들지 않는다. 이 기사에는 비교 분석이나 새 전문용어 지도 노드가 없다.

이전 전체 사본 `20260928-fanuc-buyback-historical-private-site-v4`의 정확한 26개 승인 run·7개 지식 run 목록에 새 승인 run 한 개를 더한 입력은 `.local/research/local-ai/20260928-abb-dunia-historical-private-site-v1-command.json`이다. 아래 재현 코드는 이 JSON의 `args`를 사용한다. 이미 완료된 run을 덮어쓰지 말고 새 `--run` 값으로 만들어 이전 manifest와 비교한다.

```sh
python3 - <<'PY'
import json, subprocess
from pathlib import Path
args = json.loads(Path('.local/research/local-ai/20260928-abb-dunia-historical-private-site-v1-command.json').read_text())['args']
args[args.index('--run') + 1] = 'new-private-run-id'
subprocess.run(['node', 'scripts/research.mjs', *args], check=True)
PY
```

완료된 비공개 사본 `20260928-abb-dunia-historical-private-site-v1`은 승인 기사 run **27개**, 영향받은 과거 회차 **13개**, 지식 노트 **18개**, 생성 공개 파일 **284개(HTML 258개)**, digest **132개**다. 기존 RSS **40개**의 `(GUID,pubDate)` 순서와 값은 직전 사본과 동일하다. 기사·9월 3일 브리핑·RSS·digest에서 제목·리드·ABB 원문 URL이 일치한다. 비공개 검토 이유, `200회 초과` 추정, `10배` 일반 성능 주장은 독자 원고에 없다. 원본 9월 3일 회차 SHA도 그대로다. 비교 영수증 `.local/research/local-ai/abb-dunia-direct-review-20260928/private-channel-check.json`과 `preview-manifest.json`을 함께 읽는다.

별도 로컬 서버와 Playwright Chromium에서 기사·9월 3일 브리핑을 **1440px/390px**로 열었다. 네 화면이 HTTP 200이고 새 제목·ABB 원문 링크가 보이며 지도 canvas, 가로 넘침, page error는 각각 0이다. 브리핑의 `로봇·제조` 탭을 누르면 URL에 `sector=`가 남고 새 기사 한 건만 보여, 뒤로 가면 네 기사 전체가 돌아온다. 실행 스크립트·영수증·화면 4개는 `.local/research/local-ai/abb-dunia-direct-review-20260928/private-ui-smoke.py`, `private-ui-check.json`, `article-*.png`, `briefing-*.png`에 있다. 이는 로컬 Chromium 검증이고 모바일 실기기·실제 공개 URL 검증이 아니다. 생성 시점 manifest의 `candidate_published:false`, `drive_verified:false`, `browser_verified:false`는 이 사후 시험으로 바꾸지 않는다.

다음에는 ABB의 9월 2일 현대화 특집을 사건성과 수치 조건에 따라 승인/보류 판정하고, KUKA·두산·다른 제조사 IR/RSS/국내외 논문·대학/TLO의 반복 수집을 넓힌다. 별도로 구형 92회차/801구간과 의존 지식을 최신부터 판정하고, 독립 40개 개발/20개 잠금 평가를 수행한다. 권위 Drive의 최신 revision과 전문을 다시 읽어 원격 보관·재읽기를 통과하기 전에는 이 사본을 작성 원본이나 공개판으로 승격하지 않는다. 기존 단일 08시 실행과 웹/RSS/GitHub 원격 readback, 서로 다른 신규 성공 7회도 미완료다.

### 63.1 ABB 현대화 특집의 배경 자료 판정

[ABB Robotics의 9월 2일 현대화 특집](https://www.abb.com/global/en/news/138456/wbstr-send-robots-into-overdrive-with-modernization)은 같은 Robotics 목록에서 확보한 세 번째 원문이다. 저장 source ID `87d6fc08009f164bbc37`, version `87d6fc08009f164bbc37:4866b7675db1a3c3128391087f36101383f297b36b16051a02dbc9a1b1722c88`, 인용문 포함 parse `eddb29618be4f757e14f99cb68c3721c597fad175dec9e0c931e12afe540173d`의 **33블록**을 직접 읽었다. HTML의 유형은 `Feature articles`, 회사 게시 날짜는 2026-09-02다. 컨트롤러·소프트웨어·안전 기능을 단계적으로 갱신하는 일반 가이드이며 **새 제품 출시·계약·투자 집행·고객 설치·측정된 성과**의 독립 발표는 없다. 따라서 이 URL의 새 기사 사건 ID를 만들지 않는다.

본문 block 17의 RobotStudio 시운전 시간 `최대 90%` 단축은 ABB의 일반 주장으로, 이 글만으로 비교 대상·설치 조건·표본을 알 수 없다. OmniCore·AVR·SafeMove·ISO 10218-1:2025 언급도 각 제품 출시나 표준 채택의 이번 날짜 사건으로 보지 않는다. 이후 이 자료를 용어 설명의 배경으로 사용하려면 각각의 공식 제품·표준 원문과 날짜·범위를 다시 대조해야 한다. 비공개 판정은 `.local/research/local-ai/abb-modernization-direct-review-20260928/disposition.json`과 `disposition.md`에 source version/parse/block·사유·공개 투영 금지를 남겼다. 기존 수집 후보·원문 bytes·parse는 삭제하거나 `verified` 기사로 승격하지 않았다.

현재 전체 비공개 사본 `20260928-abb-dunia-historical-private-site-v1`의 public/digest와 기존 `vault/`에서 이 특집 URL의 등장 **0건**을 확인했다. 새 기사·브리핑·RSS·GitHub digest·전문용어 이력·지도 선이 없다. 이 판정은 기존 기사에 대한 `excluded` 정정과 다르다. 처음부터 승인된 기사로 발행하지 않은 **배경 자료 분류**다. ABB 피드 9월 후보 세 건의 편집 상태는 E-Device 승인, Dunia 승인, 현대화 특집 배경 판정으로 정리됐다. 나머지 출처·과거 자료·운영 관문은 63절 마지막 문단을 따른다.

## 64. 배경 자료 판정의 후보 장부 기록

### 64.1 사전 대조와 실제 명령

최초 ABB 목록 run `20260928-abb-en-sep-window-v2/candidates.json`의 현대화 특집은 `source-87d6fc08009f164bbc37`, `unreviewed`, 발표일 2026-09-02였다. 이 run의 상세 parse ID는 `09fbb2894393dcc936effe5ebf0439ff15e109dcb8029c76ddfc32f797db2068`이다. [63.1절](#631-abb-현대화-특집의-배경-자료-판정)의 직접 검토는 인용문을 보강한 `20260928-abb-en-quote-reparse-v1`의 parse ID `eddb29618be4f757e14f99cb68c3721c597fad175dec9e0c931e12afe540173d`를 참조한다. 두 parse는 원문 source version `87d6fc08009f164bbc37:4866b7675db1a3c3128391087f36101383f297b36b16051a02dbc9a1b1722c88`을 공유한다. 첫 명령에서 두 run을 같은 것으로 취급하자 parse ID 불일치로 **장부 변경 전에 중단**됐다. 이후 발견과 검토 run을 분리하는 옵션을 구현하고, 두 run의 동일 원문 bytes를 재검사했다.

작업 전 `.local/research/candidate-backlog.json`의 55건을 `.local/research/local-ai/backups/20260928-candidate-backlog-before-abb-modernization.json`에 `COPYFILE_EXCL`로 복사하고 두 파일의 SHA-256 `9192b93e3816487ddc7f6240742ed6b17adfa53939e38f529e2b58cd9a7b6fb8`이 같음을 확인했다. 기존 `vault/Editions`에서 이 URL의 기사 등장도 0건이었다. 검토 JSON은 `.local/research/local-ai/abb-modernization-direct-review-20260928/disposition.json`이다. 아래 명령은 저장 원문만 읽고 비공개 후보 장부와 영수증만 쓴다.

```sh
node scripts/research.mjs candidate-disposition \
  --run 20260928-abb-modernization-background-v1 \
  --source-run 20260928-abb-en-quote-reparse-v1 \
  --candidate-run 20260928-abb-en-sep-window-v2 \
  --review abb-modernization-direct-review-20260928/disposition.json
```

`--review`는 기본 `--root .local/research/local-ai`에 상대적인 **비공개 경로**다. 후보와 근거가 같은 run에 있으면 `--candidate-run`은 생략 가능하다. 명령은 매번 현재 `vault/Editions`에 동일 원문 URL이 없는지 확인한다. 단순히 기존 출처 URL 목록에 없다는 이유만으로 뉴스성이 없다고 판정하지 않는다. 검토자가 `source_read:true`, 네 사건성 항목과 공개 투영 여섯 항목을 명시하고 원문 블록에 근거를 둔 뒤 적용한다.

### 64.2 영수증·반복 실행·복구

적용 결과 `.local/research/candidate-backlog.json`은 **56건: verified 42·deferred 13·rejected 1**이다. 새 항목의 `review_status`는 `rejected`, `event_id`는 없고, `disposition`은 후보 run·근거 run·원문 version·parse ID·검토 JSON 해시를 가리킨다. `.local/research/local-ai/runs/20260928-abb-modernization-background-v1/candidate-disposition.json`이 별도 영수증이다. 두 번째로 같은 명령을 실행한 뒤 장부 바이트 SHA-256 `2d945d3acd63466426a25c52a6f24168e5c905da5c61bfca6d1956bcf69b8f9c`가 그대로였다. 최초 `candidates.json`의 현대화 후보는 여전히 `unreviewed`이며 수집 원본은 보존됐다. 새 `mergeBacklog` 발견을 병합해도 이번 장부의 종결 상태는 유지된다.

실제 `node scripts/garden.mjs context` 출력은 `.local/research/local-ai/abb-modernization-direct-review-20260928/context-after-disposition.json`에 보관했다. `discovery_window.backlog_state=loaded`, `pending=13`, `resolved=43`이고 이 후보는 pending에 없으며 resolved의 `review_status=rejected`, `next_route=closed`로 표시된다. 원문 검토가 독자 공개 결과를 바꾸지 않은 상태에서 다음 취재 입력의 미해결 목록만 정리됐는지 확인한 통합 검사다.

관련 회귀는 `node --test tests/research-candidate-disposition.test.mjs tests/research-runtime.test.mjs tests/briefing-quality.test.mjs`다. 손상된 본문 bytes, 존재하지 않는 블록, 이미 기사에 실린 URL, `verified`/고정 사건 후보는 장부 쓰기 전에 실패한다. source version이 다른 후보/근거 run도 거부한다. 중단 뒤에는 해당 오류를 원문·parse·기존 기사에서 조사하고, 같은 입력이면 같은 run ID로 재시도한다. 검토 JSON이나 원문 version을 바꾼 경우 **새 run ID**와 명시적 재검토가 필요하다. 복구본은 기존 55건과 차이를 확인하기 위한 자료이며, 이후 다른 후보가 추가됐으면 장부 전체를 옛 복구본으로 덮어쓰지 않는다.

이 작업은 Drive 업로드, 작성 vault 수정, 웹·RSS·GitHub 공개, 오전 8시 예약 변경을 하지 않았다. 기존 B2/C/D/E/F와 실제 7회 운영은 [계획 19.40절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1940-배경-자료-판정의-후보-장부-연결과-다음-관문)에 남는다.

## 65. 후보 재발견과 기사 내용 지문의 실제 검증

### 65.1 재현된 문제와 수정 위치

기존 `mergeBacklog`은 `rejected` 판정의 같은 URL을 다시 발견해도 영구히 닫아 두었다. 상세 원문이 실제로 수정된 뒤에도 재검토 대상이 되지 않는 결함이다. 단순히 `source_version_id`의 원본 HTML bytes가 달라지면 열도록 고친 뒤, 실제 KUKA 기사 두 건에서 **HTML SHA만 달라지고 추출된 제목·발표일·본문은 같은** 사례를 확인했다. 이 경우 매일 종결을 다시 열면 검토 장부가 무의미해진다.

[`parser.mjs`](../scripts/research/parser.mjs)의 `articleContentFingerprint`는 추출 제목·발표일·순서 있는 본문 block text의 SHA-256을 계산한다. [`list-scan.mjs`](../scripts/research/list-scan.mjs)는 날짜가 목록과 상세에서 일치하고 필수 추출 필드가 있는 후보에게 원본 version, parse ID, 관측 시각, 내용 지문을 부여한다. `research.mjs scan-list --merge-backlog`이 상세 수집을 마친 뒤만 [`discovery.mjs`](../scripts/research/discovery.mjs)의 원자적 장부 병합을 호출한다. 제목·날짜·본문 지문이 바뀐 `rejected` 항목만 `disposition_history`에 원판정을 남긴 뒤 `deferred`와 `source_revision_alert`로 이동한다. 동일 시각의 상충 내용은 오류로 중단하고, 늦게 도착한 오래된 관측은 최신 판본을 되돌리지 않는다. [`candidate-disposition.mjs`](../scripts/research/candidate-disposition.mjs)는 오래된 다른 내용을 다시 닫지 않으며 동일 근거의 지문 보강과 새 원문 직접 재검토 후 종결을 구분한다.

### 65.2 비공개 장부 백업과 실물 실행

작업 직전 `.local/research/candidate-backlog.json` **58건**의 파일 bytes를 `.local/research/local-ai/backups/20260928-before-content-fingerprint-enrichment-v1.json`에 배타적 생성으로 복사했다. 양쪽 SHA-256은 `6574edf6654398ba4e2f9da943b1b8ba9123b197249be80625d0fcd312596232`였다. 직전 단계의 백업 `.local/research/local-ai/backups/20260928-before-doosan-backlog-merge-v1.json`과 `...before-kuka-backlog-merge-v1.json`도 별도로 보존한다. 최종 코드 재수집 전의 58건은 `20260928-before-kuka-fingerprint-final-v1.json`에 다시 복사했으며 파일 SHA는 `ef9db62d195ee3c7ea1aab7b89dc20e81a09cf0465bd3dbda19fa55897fcddf9`였다. 이후 신규 후보가 생겼으므로 어느 복구본도 현재 장부 위에 통째로 복원하지 않는다.

먼저 ABB 현대화 특집의 **기존** 검토 run을 동일하게 재실행했다. 저장된 source version·parse·검토 JSON을 재확인하고 종결 상태/영수증을 유지하면서 기존 비공개 판정에 내용 지문 `f6d4548e211a9a22961f202fd086a2263387d0ea3a5a7de3c34a2bb2c0df489d`만 채웠다.

```sh
node scripts/research.mjs candidate-disposition \
  --run 20260928-abb-modernization-background-v1 \
  --source-run 20260928-abb-en-quote-reparse-v1 \
  --candidate-run 20260928-abb-en-sep-window-v2 \
  --review abb-modernization-direct-review-20260928/disposition.json

node scripts/research.mjs scan-list \
  --run 20260928-kuka-de-content-fingerprint-final-v1 \
  --channel route-kuka-news-de \
  --since 2026-09-01 --until 2026-09-28 --merge-backlog
```

KUKA 명령은 `window_scanned`, 후보 **2건**, 장부 **58건**을 반환했다. 같은 명령을 다시 실행하면 `backlog_merge.changed:false`, JSON 장부 해시 `467243ae47986a9cd826f3465f052d9be8d9507f82fa375b1984e8bdb8791cdf`가 그대로다. 현재 장부 **파일 bytes**의 별도 SHA-256은 `5ee88065664042387911c3f1fcca50290b21302bbd5ed46dc03d5109391274ab`이다. 이 둘은 JSON 직렬화 방식이 달라 같은 종류의 해시가 아니다. `loadStoredSourceRun`의 원문/parse bytes 재검사도 각각 2건/2건 통과했다. 후보 상태는 verified 42/deferred 13/rejected 1/unreviewed 2이고 ABB 판정과 KUKA 두 미검토 후보가 그대로다.

### 65.3 HTML 변경과 기사 변경의 대조

KUKA 저장 run `20260928-kuka-de-sep-window-v2`, `20260928-kuka-de-sep-backlog-merge-v1`, `20260928-kuka-de-content-fingerprint-v1`, `20260928-kuka-de-content-fingerprint-final-v1`의 `parses.json`을 같은 source ID별로 대조했다. `496ab0bfbcdb42a4ce51`의 HTML version 네 개는 모두 다르지만 추출 내용 SHA는 모두 `e9f5743addac8b7dda1dc75712633af9d94dfca751dc385c556bc379c8b1749b`이고 본문 블록은 10개다. `f4e140879117c66a2bdb` 역시 HTML version 네 개가 서로 다르지만 추출 내용 SHA는 모두 `5e58a140e60a2ac712c3c4ae26954b3c4ea5b304a8e52443148ca90d214145a2`, 본문 블록은 12개다. 원본 HTML 판본과 parse는 불변 저장을 유지한다. 이 비교는 **기사 내용이 같게 추출됐다**는 사실만 입증한다. 사람이 새 뉴스 가치, 언어판 중복, 원문 누락을 아직 판정하지 않았으므로 두 건은 `unreviewed`다.

변경된 제목·발표일·본문일 때 `rejected → deferred`, 판정 이력 보존, 새로운 직접 검토로 다시 종결, 목록만 변경 시 종결 유지, HTML 장식만 변경 시 종결 유지, 같은 관측 시각 상충과 오래된 관측 차단, 옛 판정의 지문 보강·반복 무변경을 테스트한다. 지문이 없는 옛 판정을 **같은 원본·다른 parse ID**로 다시 읽을 때도 `parse_version` 경고로 재검토한다. 전체 `npm run test:garden`은 **305/305**, 프로젝트 격리 Python은 **70/70**, `npx tsc --noEmit`과 변경 파일 Prettier·`git diff --check`가 통과했다. Python worker·TypeScript 코드는 수정하지 않았다. 작성 `vault/`, Drive, 최신 private preview, 웹·RSS·GitHub 공개, 기존 오전 8시 예약은 바꾸지 않았다.

### 65.4 복구·다음 재개점

부분 병합이 실패하면 `runs/<run>/list-scan.json`, `documents.json`, `parses.json`, `candidates.json`의 상태와 장부의 특정 `key`를 비교한다. 원본 bytes·추출 지문·관측 시각·원 판정 해시 중 어느 것이 다른지 확인한 뒤 **새 run ID**로 다시 수집한다. 본문 누락이나 게시일 충돌을 무작정 `rejected` 또는 `verified`로 바꾸지 않는다. 현재 장부를 이전 전체 백업으로 덮으면 그 뒤 추가한 KUKA 후보와 ABB 지문을 잃으므로, 복구가 필요하면 해당 key만 잠금 아래에서 최신 기록과 diff로 조정한다.

다음 조사에서는 KUKA 두 후보의 공식 원문/다른 언어판/기존 기사 중복을 직접 읽고 사건별 사실과 발표일을 판정한다. 반복 수집에서 승인 기사 URL이 다시 미검토 후보로 나타나는 경로도 사건 ID 연결로 해결해야 한다. 이후 B2 전체 소급, C 다른 출처 완주, D 독립 40/20 품질, E 단일 08시·Drive 원격 readback, F 실제 배포·새 7회 운영으로 넘어간다([계획 19.41절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1941-재발견-후보의-기사-내용-변경-감지와-다음-관문)).

## 66. KUKA 다국어 동일 사건의 근거 연결

### 66.1 입력과 실제 대조

기존 `vault/Editions/2026/09/2026-09-11_0800_Tech_AI_Briefing.md`의 검증 기사 ID `2fa2d03292bbcc0d`는 [KUKA 영문 지게차 발표](https://www.kuka.com/en-sg/company/press/news/2026/09/kuka-mobile-forklift-launch)를 출처로 쓴다. KUKA 독일어 9월 목록의 [독문 발표](https://www.kuka.com/de-de/unternehmen/presse/news/2026/09/kuka-mobile-forklift-launch)는 URL이 달라 후보 `source-f4e140879117c66a2bdb`로 별도 남았다. 회사/제품 이름만이 아니라 양쪽 공식 본문의 9월 10일 발표일, `KMF 1500P-CB`, 최대 1,500kg, 9월 주문과 12월 **예정** 인도, 2027년 1분기 PS 모델 계획을 직접 읽었다. 독문 block 2/7/12와 영문 block 2/7/12가 각각 이 대조의 위치다. 검토 JSON은 일치에 필요한 모델·발표 행위·수치/일정의 정확한 excerpt와 블록 ID를 남긴다.

영문 페이지 최초 수집 `20260928-kuka-forklift-en-source-v1`은 원 HTML `a174a612481fbeb878097b664bc62fba98de60efa76c3b541a85fa13a3c42a6f`를 저장했으나 generic parse는 날짜가 없고 본문 2블록이다. `data/research-acquisition.json`의 `kuka-en-news-detail`을 같은 공식 DOM의 h1/intro/본문/date XPath로 등록했다. 동일 bytes `reparse` 결과 `20260928-kuka-forklift-en-reparse-v1`은 영문 날짜 `2026-09-10`, 12블록, parse ID `fce643368af95c9a92e53374abbd8c218a84d93d8865aeae50be34cc35eccf53`이다. 독문 저장 run `20260928-kuka-de-content-fingerprint-final-v1`의 같은 후보는 날짜 `2026-09-10`, 12블록, parse ID `ef71f045138f3d5799e70de4ad712ad153845fdad3345f3704f9446d85ecbd5b`다. 두 저장 run의 실제 bytes와 immutable parse를 명령이 다시 검사한다.

### 66.2 백업·재현·예상 영수증

변경 전 후보 장부 파일 bytes **38,492B/SHA-256 `5ee88065664042387911c3f1fcca50290b21302bbd5ed46dc03d5109391274ab`**를 배타적으로 만든 `.local/research/local-ai/backups/20260928-before-kuka-multilingual-identity-v1.json`에 보존했다. 비공개 검토 입력은 `.local/research/local-ai/review/kuka-forklift-multilingual-20260928.json`이며 `--review`에는 private root 상대경로만 준다. 새 수집이나 검토 내용이 달라지면 각 단계의 **새 run ID**를 사용한다.

```sh
node scripts/research.mjs collect \
  --run 20260928-kuka-forklift-en-source-v1 \
  --url https://www.kuka.com/en-sg/company/press/news/2026/09/kuka-mobile-forklift-launch
node scripts/research.mjs reparse \
  --run 20260928-kuka-forklift-en-reparse-v1 \
  --source-run 20260928-kuka-forklift-en-source-v1
node scripts/research.mjs candidate-identity \
  --run 20260928-kuka-forklift-multilingual-identity-v1 \
  --source-run 20260928-kuka-de-content-fingerprint-final-v1 \
  --published-source-run 20260928-kuka-forklift-en-reparse-v1 \
  --review review/kuka-forklift-multilingual-20260928.json
```

마지막 명령은 `candidate_key:source-f4e140879117c66a2bdb`, `event_id:2fa2d03292bbcc0d`, `review_status:verified`, `candidate_published:false`, JSON 직렬화 장부 SHA `24216fda5edcb9544f375a43b0782983923e27e4723721c38075ae0873b88d05`를 반환했다. 파일 bytes SHA는 별도로 `4c13a2e94a76dbe0329633bd1909b914cfe6396fdb8608762f001a8886e4660b`다. 반복 실행에서도 반환 장부 SHA가 같고 파일 bytes가 불변이다. 전체 장부는 **58건(verified 43/deferred 13/rejected 1/unreviewed 1)**이며, 실제 `researchWindow`는 독문 지게차를 `resolved/already-published`와 9월 11일 회차로, FSW를 `pending/review-publication-time`으로 계산한다. 저장 후보 원본 `runs/20260928-kuka-de-content-fingerprint-final-v1/candidates.json`은 수정되지 않는다.

### 66.3 수정 실패와 복구

인용문·원문 bytes·parse·발표일·대상 기사 URL/ID/제목 중 하나가 다르거나 같은 후보에 더 최신의 다른 기사 지문이 관측되면 명령은 장부 쓰기 전에 중단한다. 후보 `key`가 둘 이상으로 분기됐으면 URL 규칙으로 강제 병합하지 않고 원본을 비교한다. 잘못된 연결을 발견하면 위 전체 백업을 현재 장부 위에 복원하지 않는다. `candidate-backlog` 잠금과 원본/현재 bytes 비교 아래 **해당 key**의 identity·상태·이력을 조사하고, 새 증거에 근거한 수정 절차를 설계한다. 기존 published 원고와 고정 ID는 이 명령의 수정 대상이 아니다.

관련 회귀는 `tests/research-candidate-identity.test.mjs`의 원문·블록·대상 기사 거부, 동일 입력 반복, HTML 장식 변경 유지, 기사 내용 변경 후 `deferred`와 재검토 복귀다. `tests/test_research_worker.py`는 영문 페이지 profile의 게시일·본문/사이트 장식 분리와 날짜 실패를 검사한다. 최초 전체 Node 검사는 재검토 대기 경로명이 기존 배경 자료 시험의 `historical-review`와 달라 1건 실패했다. 이미 발행된 사건과 연결된 변경 후보만 `review-source-revision`으로 표시하도록 범위를 고쳐 집중 회귀를 통과시켰다. 최종 `npm run test:garden` **309/309**, 격리 Python **71/71**, `npx tsc --noEmit`, `git diff --check`가 통과했다. 관련 7문서의 로컬 링크 685개·제목 fragment 433개를 확인했고 새 오류 0건이다(기존 코드 예시의 `<URL>` 자리표시자 1개는 링크 대상에서 제외). Drive 업로드와 웹/RSS/GitHub 발행을 이 후보 장부 명령의 성공으로 세지 않는다.

### 66.4 다음 KUKA 사건과 전체 재개점

남은 [FSW 연구 셀 발표](https://www.kuka.com/de-de/unternehmen/presse/news/2026/09/fsw-bei-der-fh-magdeburg)는 9월 24일 원문 10블록·미검토 후보 `source-496ab0bfbcdb42a4ce51`로 보존한다. KUKA 발표의 연구 셀·KR FORTEC ultra MT·용접/밀링 통합·디지털 트윈과 공정 데이터는 연구 플랫폼 설명이다. 이를 신규 로봇 판매·고객 설치·성능 실증·교수 창업으로 바꾸지 않는다. 대학 URL 수집 시도 `20260928-fsw-university-source-v1`은 `Robots policy could not be checked: failed`/`fetch_status:blocked`였으며 원 bytes/parse가 없다. 접근 실패는 `새 소식 없음`이나 대학 확인 완료로 바꾸지 않는다. 이후 해당 출처의 정당한 접근 경로가 확인되면 별도 source run으로 저장하고, 그렇지 않으면 KUKA 공식 원문만으로 확인 가능한 사실만 검토한다. 원 발표일에 맞는 브리핑 회차와 최신 Drive 원본을 확인하기 전 신규/과거 편입을 결정하지 않는다.

전체 B2 구형 92회차/801구간·의존 지식, C 분야별 경로, D 독립40/20, E 단일 08시/Drive readback, F 원격 공개/신규 성공7회는 [계획 19.42절](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#1942-kuka-동일-사건-연결-이후의-편집과-전체-완료-순서)에 따라 계속 진행한다.

## 67. 여섯 제조사 경로의 로컬 일일 수집과 재개

2026-09-29에 [`일일 구현 명세`](DAILY_NEWS_INGESTION_IMPLEMENTATION.md)의 로컬 취득 단계를 구현했다. 등록 94경로 중 검증된 여섯 경로만 [`data/research-daily-routes.json`](../data/research-daily-routes.json)에 활성화했다. `scripts/research-daily.mjs`는 같은 출처별 `scan-list`를 한 잠금 아래 순차 실행하며, 수집·원문·parse·후보·coverage를 비공개 `.local/research/local-ai/`에 기록한다. 지금은 **Drive 원본 대조·08시 예약·기사 승인·발행을 호출하지 않는다.**

### 67.1 실행 전 확인과 명령

1. 실제 checkout과 `git status --short`, 다른 연구 worker·08시 자동화의 현재 실행 여부를 확인한다. 동일 작업 공간에서 승인 원고·Drive 발행을 진행하는 소유자가 있으면 겹치는 쓰기를 중단한다.
2. 최신 Drive 작성 원본은 아직 새 CLI의 입력이 아니다. `vault/`의 마지막 회차 `coverage_end`가 **로컬 계획 기준**임을 확인하고, 로컬과 Drive가 다르다면 수집 결과를 발행 입력으로 사용하지 않는다.
3. 활성 route의 `baseline_run`이 각자의 `window_scanned`와 원본 SHA·parse를 갖는지 확인한다. 설정/코드/로컬 회차를 변경한 뒤 같은 run ID를 재사용하지 않는다.
4. KST 날짜에 맞는 새 run ID로 계획을 먼저 만든 다음 같은 ID로 실행한다. 실패 후에는 같은 계획에 `--resume`을 쓰며, 기존 성공 receipt를 편집하거나 지우지 않는다.

```sh
node scripts/research-daily.mjs --run daily-YYYYMMDD --plan-only
node scripts/research-daily.mjs --run daily-YYYYMMDD --execute
node scripts/research-daily.mjs --run daily-YYYYMMDD --resume
```

`--plan-only`는 첫 HTTP 요청 전에 `daily/runs/<run>/plan.json`을 만들지만 원문·후보 장부·Drive에는 쓰지 않는다. `--execute`는 계획의 경로·날짜 창을 순서대로 실행한다. `--resume`은 성공 창을 건너뛰고 실패/미완료 창에 새 `attempt_id`를 만든다. 시간여행용 `--as-of` CLI는 없고 테스트에서만 `now`를 주입한다. 날짜 창은 원 발표일 기준 반열림 `[since, until_exclusive)`이다. 실행 당일의 미경과 시간은 coverage에 포함하지 않는다.

### 67.2 실물 실행·검증 결과

`daily-20260929-v3`는 FANUC 영문 뉴스·일문 IR, HD현대로보틱스 국문 뉴스, KUKA 독문 뉴스, 두산로보틱스 영문 뉴스, ABB Robotics 영문 뉴스의 12개 구간을 순회했다. 모든 route receipt가 `window_scanned`이고 마지막 연속 확인일은 **2026-09-29 시작 시점**이다. 당일 시각 이후의 발표까지 확인했다는 뜻이 아니다. 32칸 중 로봇·제조 3칸만 `partial`, 나머지 29칸은 `not_attempted`다. 요약 `status: configured_routes_scanned`와 `candidate_published:false`, `drive_verified:false`, `public_verified:false`를 함께 읽는다.

증거 위치는 `.local/research/local-ai/daily/runs/daily-20260929-v3/plan.json`, `receipts/`, `summary.json`, 공용 `daily/route-coverage.json`, 그리고 receipt의 `scan_evidence.list_scan_run`이 가리키는 `runs/<attempt_id>/`다. 원본·parse·후보를 확인할 때 그 subrun의 `list-pages.json`, `documents.json`, `parses.json`, `candidates.json`, `list-scan.json`을 함께 읽는다. `--resume` 재실행은 추가 시도 없이 끝났고 요약·coverage·후보 장부의 SHA가 같았다. 새 ABB Andover Process GoFa 사례와 미검토 KUKA FSW는 승인 기사와 구별한다. ABB E-Device는 과거 비공개 승인 원고와 후보 장부의 미검토 표기가 아직 불일치하므로 중복 편집 전에 연결한다.

처음 v2 시험은 실행일 전체를 이미 확인한 것처럼 coverage를 전진시켰다. 원본 coverage를 `.local/research/local-ai/daily/route-coverage.before-current-day-fix-20260929.json`으로 보존했고, 기존 `daily_scan` 구간의 run 날짜를 근거로 오늘 부분을 잘라 복구했다. v3에서 각 경로의 frontier가 9월 29일인지 확인했다. 날짜 경계 수정과 문서 갱신 뒤 `npm run test:garden` **317/317**, 전용 Python 환경의 `unittest discover` **71/71**, `npx tsc --noEmit`, 관련 문서 Prettier, `git diff --check`를 다시 실행해 통과했다. 변경 문서 3개의 상대 링크 283개와 제목 fragment를 확인했고 새 오류는 0건이다. 기존 코드 예시의 `<URL>` 자리표시자는 링크 대상에서 제외했다.

### 67.3 다음 재개점과 실패 해석

현재 재개 코드는 성공 receipt를 읽고 같은 창을 건너뛰지만 저장 subrun의 원본을 **그 시점에 다시 검증하지 않는다**. 따라서 다음 코드 묶음은 재개 시 원본·parse 손상 거부 시험을 먼저 만들고, 통과한 receipt만 재사용하도록 고친다. 이후 Drive 최신 revision을 계획 입력에 결합하고, 새 후보를 비공개 승인 기사 inventory에 대조한다. 로봇 이외 7개 분야와 IR·논문·TLO 경로는 개별 목록 종료/상세 증거가 생긴 뒤 활성화한다. 이 단계가 끝나기 전에는 기존 오전 8시 예약에 새 CLI를 단순 삽입하지 않는다.

`window_scanned`는 특정 원 발표일 구간의 목록 종료와 저장 원본을 뜻한다. `verified`는 사건 사실 검토, `approved`는 원고 승인, `drive_verified`는 원격 작성 원본 재읽기, `public_verified`는 실제 웹·RSS·GitHub 대조다. 한 상태가 다음 상태를 대신하지 않는다. 실패한 창이 있으면 다른 창의 성공은 보존하되 그 앞뒤를 이어 `마지막 연속 확인일`을 뛰어넘지 않는다. 접근 실패나 부분 후보는 ‘새 소식 없음’으로 표시하지 않는다.

## 68. GitHub 월별 아카이브와 일곱 경로 일일 수집

이 절은 67절의 **후속 실행 상태**다. 앞선 여섯 제조사 경로는 보존하고, GitHub Changelog 공식 월별 아카이브를 일곱 번째 반복 경로로 추가했다. 2026-09-29 기준 등록 95경로·기사 상세 profile 38개 가운데 일일 활성은 7경로다. 새 경로는 `소프트웨어·클라우드/해외/기술·제품` 한 칸을 부분 조사한다. 전체 8개 분야나 GitHub 외의 소프트웨어 원천을 완료했다고 해석하지 않는다. 월별 아카이브 선택자·날짜·본문·예산의 정확한 계약은 [출처 명세 34절](SOURCE_ACQUISITION_SPEC.md#34-github-changelog-월별-아카이브의-기간-수집)에 있다.

### 68.1 출처 도입과 교차 월 시험

아래 두 기간 시험은 기존 `scan-list` 명령으로 각각 별도 불변 run에 남겼다. 첫 run은 공식 9월 아카이브의 카드 80개 중 지정 기간 상세 2개를 저장했고, 두 번째는 8월 70개·9월 80개 카드를 모두 검사한 뒤 8월 31일과 9월 1일에 걸친 상세 9개를 저장했다. 각 run은 `list-scan.json.status=window_scanned`이며 저장 원본·parse를 `verifyStoredListScan`으로 다시 읽었다. 카드 수는 그 시점의 관측값이다.

```sh
node scripts/research.mjs scan-list --run 20260929-github-changelog-window-20260927-v1 --channel github-changelog --since 2026-09-27 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-github-changelog-month-boundary-20260831-v1 --channel github-changelog --since 2026-08-31 --until 2026-09-02
```

이 명령은 **기존 증거의 식별 예시**다. 이미 완료한 run을 재수집·덮어쓰는 절차가 아니다. 새 날짜·새 profile 시험에는 새 run ID를 쓴다. `.local/research/local-ai/runs/<run>/`에서 `list-scan.json`의 월별 `pages[]`, `list-pages.json`, `documents.json`, `parses.json`, `candidates.json`, 원 bytes를 함께 확인한다. 월 표시/카드 날짜/URL 날짜/정렬/미선택 링크/상세 날짜가 충돌하면 `incomplete`이며, 후보가 0이어도 월 목록 원본 없이는 성공이 아니다.

### 68.2 실제 일일 실행과 실패 후 재개

`daily-20260929-v4` 계획은 일곱 경로에 각각 `[2026-09-22, 2026-09-29)`와 `[2026-09-29, 2026-09-30)`를 배정해 창 14개를 만들었다. 최초 `--execute`에서는 HD현대로보틱스 첫 창의 API 요청이 deadline을 넘겨 `page_failed`·`incomplete` 영수증으로 남았다. 다른 13창은 성공했다. `--resume`은 성공 영수증과 그 subrun의 목록/상세 bytes·parse·후보 키를 다시 확인하고 HD 창 하나만 새 `attempt_id`로 재시도했다. 최종 성공 14·보존 실패 1, 영수증 총 15개다. 이후 같은 계획의 재개는 HTTP 요청·새 영수증 없이 끝났고 요약·coverage·후보 장부 SHA가 변하지 않았다. 실행 당시 GitHub 7일 창의 상세는 23건, 당일 스냅샷의 상세는 0건이었다.

```sh
node scripts/research-daily.mjs --run daily-20260929-v4 --plan-only
node scripts/research-daily.mjs --run daily-20260929-v4 --execute
node scripts/research-daily.mjs --run daily-20260929-v4 --resume
```

이 세 명령 역시 **완료된 실행의 재현용 기록**이다. 실행 이후 수집 코드의 fingerprint가 바뀌었으므로 지금 v4를 다시 재개하면 계획 동일성 검사에서 거부된다. 다음 KST 실행에는 새 날짜 ID를, 같은 날짜의 새 코드·설정 시험에는 새 suffix ID를 사용한다. `daily/runs/daily-20260929-v4/plan.json`, `receipts/`, `summary.json`, 공용 `daily/route-coverage.json`, `.local/research/candidate-backlog.json`을 서로 대조한다. 실패 영수증을 삭제하거나 성공으로 수정하지 않는다. `summary.json`은 `configured_routes_scanned`, `receipts:15`, `candidate_published:false`, `drive_verified:false`, `public_verified:false`다. 일곱 frontier는 모두 **2026-09-29 시작 시점**이고, 32칸 중 로봇 3칸·소프트웨어 해외 기술 1칸이 `partial`, 28칸은 `not_attempted`다. 후보 장부 83건(verified 43/deferred 13/rejected 1/unreviewed 26)은 발행 기사 건수가 아니다.

### 68.3 재개 무결성과 다음 개발 입력

[`daily-scan.mjs`](../scripts/research/daily-scan.mjs)의 `readDailyReceipts`는 파일명과 내부 시도 ID를 맞춘다. `verifyDailyReceipts`는 성공 시도의 저장 `list-scan`을 다시 열어 원 bytes SHA·parse·URL/날짜·후보 키·병합 상태와 receipt를 대조한다. `bootstrapCoverage`는 이전 일일 성공 구간도 그 근거 subrun과 비교한 뒤 frontier 계산에 사용한다. 저장 listing bytes를 손상시킨 회귀 시험에서는 재개와 다음 계획 모두 중단됐다. 손상을 자동으로 새 소식 없음이나 성공으로 고치지 않는다.

현재 코드의 검증은 월별·일일 집중 시험 12/12, `npm run test:garden` 322/322, 프로젝트 Python 환경의 전체 `unittest` 71/71, `npx tsc --noEmit`, 관련 Prettier·`git diff --check`를 통과했다. 실제 v4의 성공 14·실패 이력 1 영수증을 오프라인 `verifyDailyReceipts`로 다시 읽었고, `bootstrapCoverage`가 일곱 경로 모두 2026-09-29 frontier와 저장 근거를 확인했다. 이는 **로컬 코드와 저장 수집 증거의 검증**이며 그 23개 GitHub 후보의 사실 승인, Drive 원격 보관, 공개 사이트의 현재 상태를 검증한 결과가 아니다.

다음 개발 묶음은 (1) 저장 계획 날짜 창과 현재 활성 설정의 직접 비교, (2) 최신 Drive revision·원 bytes와 로컬 회차 cutoff 결합, (3) 새 후보 23건을 포함한 후보 장부와 이미 승인한 사건/언어판/정정 inventory의 대조, (4) 미시도 28칸의 출처별 실제 수용 시험, (5) 원문 claim 검토·모델 독립 40/20 평가, (6) Drive 원격 재읽기→웹/RSS/GitHub 검증→기존 08시 실행 하나의 연결 순서다. 기존 과거 자료 92회차/801구간과 의존 지식의 전수 판정, 공개 뒤 서로 다른 신규 7회 점검도 남는다. 이 일일 실행은 로컬 수집 시험이며 작성 `vault/`, Drive, 실제 공개 사이트, 08시 예약을 변경하지 않았다.

## 69. 공식 RSS 경로와 여덟 경로 일일 수집

이 절은 68절 뒤의 **새 로컬 수집 기록**이다. Google Cloud가 [Threat Intelligence 주제 페이지](https://cloud.google.com/blog/topics/threat-intelligence)에 연결한 공식 RSS를 사이버보안/해외/기술·제품의 여덟 번째 활성 경로로 추가했다. 실제 feed·article의 URL, 선택자, 시간대, 종료 규칙과 첫 실패 원인은 [출처 명세 35절](SOURCE_ACQUISITION_SPEC.md#35-google-cloud-threat-intelligence-공식-rss와-상세-원문)에 있다. 기존 여섯 제조사와 GitHub 경로는 그대로 둔다.

### 69.1 경로 시험과 원본 확인

아래 명령은 **이미 실행한 비공개 run의 식별 기록**이다. 같은 ID를 새 코드로 덮어 재실행하지 않는다. 첫 창의 `v1`은 상세 두 건의 원문 날짜·본문은 확보했으나 중간 `/topics/` 경로를 일반 분류 페이지로 잘못 걸러 `candidate_rejected`였다. 공통 발견 필터를 고치고 회귀 시험을 추가한 `v2`에서 피드 원본 1개, 상세 원본 2개, parse 3개, 미검토 후보 2개가 `window_scanned`였다. 별도의 빈 창은 피드 20항목 전부가 시작일 이전임을 확인해 후보 0개로 완주했다.

```sh
node scripts/research.mjs scan-list --run 20260929-google-cloud-threat-window-v2 --channel google-cloud-threat-intelligence --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-google-cloud-threat-empty-v1 --channel google-cloud-threat-intelligence --since 2026-09-27 --until 2026-09-29
```

새 기간 시험에는 새 run ID를 사용한다. `.local/research/local-ai/runs/<run>/list-scan.json`의 `assessment.feed_items/window_items/older_items`, `details[].status`, `documents.json`의 feed·상세 `source_version_id`, `parses.json`의 피드 링크 GUID/날짜와 기사 본문 블록, `candidates.json`의 원문 판본/parse ID를 대조한다. 다음 명령은 이미 저장된 `v2`를 **HTTP 재요청 없이** 검증한 예시다.

```sh
node --input-type=module -e 'import {storedListScan,verifyStoredListScan} from "./scripts/research/daily-scan.mjs"; const root=".local/research/local-ai"; const scan=storedListScan(root,"20260929-google-cloud-threat-window-v2"); console.log(verifyStoredListScan(root,scan,{channel_id:"google-cloud-threat-intelligence",since:"2026-09-22",until_exclusive:"2026-09-29"}))'
```

실제 `v2`의 feed는 최근 20항목 중 창 안 2·시작일 이전 18항목을 제공했고, 두 상세의 게시일은 9월 25일·24일로 feed 날짜와 일치했다. parser는 본문 84·99블록을 남겼다. 모든 후보는 **`unreviewed`**이며 사건의 사실·영향 범위·원고를 승인하지 않았다. `feed_cutoff_not_reached`면 빈 뉴스로 발표하지 말고 허용되는 공식 아카이브 경로로 누락 구간을 조사한다. feed 제목/GUID/permalink/날짜·상세 JSON-LD/본문 선택자가 달라지면 기존 run을 고치지 않고 새 원본·새 parse로 재시험한다.

### 69.2 일일 계획·실행·재개

`data/research-daily-routes.json`에 실물 완료한 `v2`를 baseline으로 등록했다. `daily-20260929-v5`의 고정 계획에는 8경로×2창=16창이 있으며 실제 실행 결과는 **성공 16/16**, 영수증 16개다. 로봇 3칸·소프트웨어 해외 기술 1칸·사이버보안 해외 기술 1칸만 `partial`, 다른 27칸은 미시도다. 여덟 frontier는 2026-09-29 시작 시점이다. 후보 장부는 85건(verified 43/deferred 13/rejected 1/unreviewed 28)이고, 이번 Google Cloud 2건은 마지막 범주다. 일일 실행 직후 동일 코드/설정에서 `--resume`했을 때 추가 영수증 없이 summary·coverage·backlog SHA가 유지됐다.

```sh
node scripts/research-daily.mjs --run daily-20260929-v5 --plan-only
node scripts/research-daily.mjs --run daily-20260929-v5 --execute
node scripts/research-daily.mjs --run daily-20260929-v5 --resume
```

위 명령은 **실행 당시 순서의 기록**이다. 이후 공유 발견/파서/정책 코드도 계획 fingerprint에 묶었기 때문에 현재 코드에서 `v5 --resume`은 `Stored daily plan inputs changed`로 거부되는 것이 정상이다. `daily-20260929-v7 --plan-only`로 당시 코드의 새 계획 16창을 만들었지만 v7의 원문 요청·후보 병합·발행은 하지 않았다. 이후 편집 인계 코드가 추가됐으므로 v7도 현재 코드의 실행 계획은 아니다. 다음 새 KST 날짜에는 그 날짜의 새 run ID를 사용한다. 같은 날짜에 코드/설정이 바뀌면 suffix를 올리고 원본과 기준 회차를 다시 확인한다.

계획 파일 `daily/runs/<run>/plan.json`의 `coverage_basis`·SHA와 전체 `windows[]`는 실행/재개마다 직접 대조한다. 성공 receipt는 source subrun의 피드/목록·상세 raw bytes와 parse·후보를 재검사한다. 원본 손상, 창 누락, 설정/코드 변화는 새 계획 전까지 중단한다. `window_scanned`는 **출처별 날짜창 수집**이고 32칸 `partial`은 **그 칸의 일부 경로 확인**이다. 기사 승인·Drive 원격 보관·기존 08시 호출·웹/RSS/GitHub 공개는 이 일일 수집에 포함되지 않는다. 다음 단계는 미시도 27칸의 자료형별 출처 수용, 기존 사건과 후보 대조, Drive 권위 snapshot과 계획 결합, 모델 독립 평가와 편집, 공개 원격 재읽기다.

## 70. 완료 후보의 비공개 편집 인계

`scripts/research-daily.mjs --execute`와 `--resume`은 수집 요약 저장 뒤 `research-editorial-handoff/v1`을 생성한다. 이미 저장된 구형 실행에도 다음 명령을 실행할 수 있다. 이 모드는 HTTP를 요청하거나 후보 장부를 병합하지 않는다.

```sh
node scripts/research-daily.mjs --run daily-20260929-v5 --handoff
```

`--handoff`는 계획·summary·모든 성공 receipt, 각 성공 subrun의 목록/상세 원본 SHA·parse·후보 키를 다시 검증한다. 완료 receipt의 후보가 현재 장부에 없으면 중단한다. 실패 창의 후보는 해당 실행의 `observed_in_run`에 넣지 않고 미완료 창을 따로 남긴다. 한편 예전부터 열려 있는 후보는 그대로 인계 대상이다. 저장된 로컬 회차의 정확한 사건 ID/원문 URL에만 연결하고, 같은 이름·기업·주제라는 이유로 게재 사건을 추정하지 않는다. 현행 후보의 상세 source version/parse/본문 지문과 성공 시도별 판본을 함께 기록한다. 서로 다르면 `current_source_version_observed_in_run:false`여서 저장 시도의 옛 원문을 새 사실 검토의 판본으로 사용할 수 없다.

비공개 결과는 `.local/research/local-ai/daily/runs/<run>/handoffs/<입력 SHA>.json`이다. 입력 SHA에는 계획·receipt·후보 장부 bytes·로컬 회차 inventory·기사 투영·라우팅 코드가 반영된다. 같은 입력의 반복 호출은 같은 파일을 반환하고 새 네트워크/원고 수정이 없다. 편집자가 장부나 회차를 바꾼 뒤 다시 만들면 새 스냅샷을 보존한다. `pending[]`에는 다음 검토 위치(`review-source-revision`, `review-existing-unverified`, `verify-original-date`, `historical-review`, `review-publication-time`)를, `observed_resolved[]`에는 그 실행에서 재관측한 확인 기사/종결 후보를 둔다. 미검토 로컬 기사의 URL이 일치해도 승인 기사로 취급하지 않는다. `authority:local_vault_unreconciled`, `candidate_published:false`, `drive_verified:false`, `public_verified:false`는 발행 관문이 통과되지 않았음을 뜻한다.

실제 v5 저장 증거를 오프라인으로 인계했을 때 계획 16창 모두 성공, 장부의 미해결 41건 중 이 실행 관측 27건, 과거 회차 검토 21건이었다. 27건의 현재 원문 판본은 해당 실행의 저장 판본과 일치했고 재관측 종결 후보는 0건이었다. 같은 명령의 두 번째 호출은 동일 파일 경로/bytes를 반환했다. 수집 당시 코드와 현재 코드의 계획 fingerprint가 달라 v5를 `--resume`할 수 없는 상태에서도 이 저장 증거 대조만 별도로 수행한 것이다. 이 숫자는 원고 승인·실제 신규 뉴스 건수가 아니다.

다음 편집 작업은 인계 JSON의 `pending[]`에서 원문 판본을 열어 기존 Drive 승인 사건 inventory와 언어판·정정 관계를 확인하고, 검토 결과를 기존 `review`/`draft`/`correct`/`approve` 계약으로 넘기는 것이다. 최신 Drive revision이 확인되지 않으면 로컬 회차 일치만으로 승인·발행하지 않는다. 아울러 미시도 27칸에 대한 공식·독립 원문 경로를 각각 수용 시험해야 한다.

## 71. NASA Technology RSS 도입과 아홉 경로 일일 수집

이 절은 69~70절의 당시 수치를 덮지 않는 **2026-09-29의 새 로컬 실행 기록**이다. [NASA의 공식 RSS 목록](https://www.nasa.gov/rss-feeds/)에서 [Technology 피드](https://www.nasa.gov/technology/feed/)를 확인하고, 원본 XML·`www.nasa.gov`/`science.nasa.gov` 상세 네 건을 정책 수집기로 저장했다. exact 선택자, GUID가 permalink와 다른 이유, 기간 종료와 날짜 충돌 조건은 [출처 명세 36절](SOURCE_ACQUISITION_SPEC.md#36-nasa-technology-공식-rss와-상세-원문)에 있다. 첫 상세 수집 `20260929-nasa-technology-details-trial-v1`의 일반 parse는 원문 확보용이었고, exact profile을 적용한 오프라인 `20260929-nasa-technology-details-profile-v1`에서 제목·본문·발표일을 다시 추출했다. 원 HTML을 새 기사로 승인하지 않았다.

### 71.1 출처별 수용 시험

```sh
node scripts/research.mjs scan-list --run 20260929-nasa-technology-window-v1 --channel nasa-technology-rss --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-nasa-technology-empty-v1 --channel nasa-technology-rss --since 2026-09-29 --until 2026-09-30
node --test tests/research-nasa-technology-scan.test.mjs
```

첫 run의 feed 10항목은 창 안 4·시작 전 6개였고 네 상세의 목록/본문 날짜는 각각 9월 28일·25일·24일·24일로 일치했다. 본문은 11·31·10·15블록이다. 둘째 run은 **관측 시점**에 창 안 0·시작 전 10개여서 저장 원본과 과거 경계가 있는 정상 빈 창이다. 두 run을 `verifyStoredListScan`으로 다시 읽어 목록·상세 bytes SHA, parse, 후보 URL·날짜 연결을 확인했다. 축소 HTML과 WordPress GUID·중복·기간 미도달의 집중 시험은 **2/2 통과**했다. 이 실물 시험은 NASA의 모든 날짜·모든 사이트 구조가 영구히 지원된다는 뜻이 아니다. 피드 보존 범위가 짧아지거나 현지 offset과 피드 UTC 날짜가 달라지면 `incomplete`로 남기고 공식 아카이브의 별도 종료 경로를 시험한다.

### 71.2 일일 실행과 재개 무변경 확인

검증된 `20260929-nasa-technology-window-v1`을 `data/research-daily-routes.json`의 아홉 번째 baseline으로 등록했다. 후보 장부의 실행 전 bytes는 `.local/research/local-ai/daily/runs/daily-20260929-v8/candidate-backlog-before.json`에 SHA `013a76dd0543da31c52f7ec6cfb3344f93590a998092c10eaa20d58108e43866`으로 별도 보존했다.

```sh
node scripts/research-daily.mjs --run daily-20260929-v8 --plan-only
node scripts/research-daily.mjs --run daily-20260929-v8 --execute
node scripts/research-daily.mjs --run daily-20260929-v8 --resume
```

고정 계획은 **9경로 × 2창 = 18창**이다. 첫 실행은 18/18 `window_scanned`, 영수증 18개, 실패·미완료 창 0개로 끝났다. NASA는 첫 창 4후보·당일 빈 창 0후보를 병합했고 전체 비공개 후보 장부는 **89건**(verified 43/deferred 13/rejected 1/unreviewed 32)이다. 32칸 중 로봇 3, 소프트웨어 해외 기술 1, 사이버보안 해외 기술 1, 우주·기초과학 해외 기술 1의 **6칸만 `partial`**, 나머지 26칸은 `not_attempted`다. 아홉 frontier는 실행일 시작인 **2026-09-29**에 있다. 당일 빈 창의 성공은 9월 29일 하루가 끝날 때까지 확인했다는 뜻이 아니다.

수집 후 비공개 `editorial-handoff`에는 `pending` 45건, 이 실행에서 관측 31건, 과거 회차 검토 위치 21건, 재관측 종결 0건이 기록됐다. 이는 편집 대기 목록이다. 같은 코드·설정으로 `--resume`한 뒤 receipt 수는 18로 같았고 `summary.json` SHA `2903fd3b29442f151dc9bdb50250c932f7b38a44a81ef86e33aa696d9d74ba6a`, `route-coverage.json` SHA `be2807c79b04a1b556a291922eb4b96b500bc112ea8fb8930ea5c97c10bda8f8`, 후보 장부 SHA `0b0a3a9605d31a8d9283e40bd16ad2f955e1b60558d06f83f2d025f355cf4ee7`가 각각 같았다. 성공한 창에 대한 추가 수집 시도는 없었다. 계획·receipt·handoff는 `.local/research/local-ai/daily/runs/daily-20260929-v8/`, 상세 원본과 parse는 `.local/research/local-ai/runs/<attempt_id>/`에 둔다.

이 실행은 **로컬 기간 수집과 비공개 인계**다. NASA 네 건의 기사 가치·사실·분류를 검토하지 않았고, 원고·지식·Drive·웹/RSS/GitHub 공개·기존 08시 예약을 갱신하지 않았다. 다음 편집자는 현재 Drive 승인 사건 inventory와 45건의 인계 항목을 대조하고, 나머지 26칸에 출처별 기간 수용 시험을 추가한다. 구체적인 다음 구현 묶음과 중단 기준은 [일일 구현 명세 7.3절](DAILY_NEWS_INGESTION_IMPLEMENTATION.md#73-다음-구현-묶음의-세부-계약)을 따른다.

최종 코드 검사는 `npm run test:garden` **334/334**, 전용 Python `unittest discover` **71/71**, `npx tsc --noEmit`을 통과했다. 변경 파일 Prettier, `git diff --check`와 이번에 건드린 다섯 문서의 로컬 파일·제목 앵커 링크 **456개/오류 0개**도 확인했다. 이 회귀 결과는 원문 의미·기사 가치·Drive/공개 검증의 대체가 아니다.

## 72. 일일 계획의 Drive 내보내기 대조 관문

`pull-drive.py --verify-source-snapshot`은 `tech-drive-source/v1` 전체 내보내기의 `complete:true`, 고정 폴더 ID와 `Editions/Knowledge/Signals/TrendTopics` 범위, 각 Markdown 경로·본문 SHA·중복·크기 제한을 검사한다. 추가로 네 로컬 작성 원본 폴더의 **모든** 파일 경로와 bytes가 내보내기와 같아야 한다. 계획을 처음 만들 때 `exported_at`은 실행 시각에서 10분 이내여야 한다. 읽기만 하므로 `vault/`와 `data/drive-source-state.json`을 수정하지 않는다. 기존 `--verify-working-copy`는 저장된 동기화 상태와 로컬의 일치 검사이고, 새 내보내기의 최신 원격 획득을 증명하지 않는다.

```sh
python3 scripts/pull-drive.py --snapshot .local/drive-sync/<fresh-complete-export>.json --verify-source-snapshot
node scripts/research-daily.mjs --run daily-YYYYMMDD --drive-snapshot .local/drive-sync/<fresh-complete-export>.json --plan-only
node scripts/research-daily.mjs --run daily-YYYYMMDD --drive-snapshot .local/drive-sync/<fresh-complete-export>.json --execute
node scripts/research-daily.mjs --run daily-YYYYMMDD --drive-snapshot .local/drive-sync/<fresh-complete-export>.json --resume
```

실행마다 실제 서울 날짜의 새 run ID를 사용한다. `--resume`은 **동일한 스냅샷 파일 bytes**와 현재 로컬 네 폴더 일치를 다시 검사하며, 오래된 실행을 재개할 수 있도록 생성 시각 제한만 풀어 준다. 저장 계획의 스냅샷 파일 SHA, 내용 SHA, 최신 회차 SHA·cutoff, 코드/설정 fingerprint와 전체 날짜 창을 다시 비교한다. 계획과 다른 입력이면 기존 실행을 고치지 않고 새 run ID로 새 계획을 만든다. `--handoff`에는 이 옵션을 주지 않는다. 검증된 제공 파일도 `provided_drive_snapshot_matched`일 뿐 원격 인증·원격 업로드·발행 검증은 아니며 summary의 `drive_verified`와 `public_verified`는 계속 `false`다.

2026-09-29 확인 당시 연결된 Drive의 `Projects / Tech Knowledge` 아래 네 작성 원본 폴더와 9월 23일 최신 Editions 파일의 메타데이터를 읽었다. **전체 181개 원본의 새 raw bytes·revision을 재읽어 완전한 내보내기를 조립하지는 않았다.** 로컬에 있던 9월 13일 내보내기는 `Drive export is stale`로 새 관문에서 거부됐다. 현재 로컬 `DRIVE_EXPORT_URL`은 MISSING이고 기존 `tech-ai-briefing-08`의 시작 폴더는 이전 iCloud 위치다. 따라서 이 명령의 live Drive 일치 성공·08시 자동 호출·원격 보관·공개 갱신을 주장하지 않는다. 다음 운영 연결은 기존 예약 하나에서 최신 원격 네 폴더의 완전한 내보내기 생성→이 관문→일일 수집→기존 승인 사건 inventory 대조→Drive 업로드/원격 재읽기→공개 검증 순으로 한다. 새 예약은 만들지 않는다.

검증은 새 내보내기 일치/오래됨/로컬 불일치 fixture, 계획의 snapshot identity 변경 거부, 제공 스냅샷으로 `plan-only → execute → 비공개 handoff`의 실제 함수 경로를 포함한다. 전체 Node **336/336**, 격리 Python **73/73**, TypeScript와 변경 파일 Prettier가 통과했다. 시스템 Python으로 시도한 전체 Python 검사는 `pymupdf`가 없어 import 단계에서 실패했으며, 프로젝트 전용 환경의 성공과 구분한다. 오래된 로컬 파일을 넣은 실제 CLI `--plan-only`는 오류로 중단되고 계획 파일을 만들지 않았다.

## 73. FDA 공식 발표 경로와 열 경로 일일 실행

2026-09-29에 [FDA 공식 발표 목록](https://www.fda.gov/news-events/newsroom/press-announcements)을 `바이오·의료기술/해외/기술·제품` 조사의 열 번째 활성 경로로 추가했다. 등록/선택자는 `data/research-source-channels.json`의 `fda-press-announcements`와 `data/research-acquisition.json`의 동일 ID·`fda-press-announcement-article-v1`을 따른다. 목록의 링크·표시 날짜·`- ` 뒤 제목과 상세의 공개일·본문을 **서로 다른 저장 원문**에서 읽는다. robots·허용 host·DNS/IP·redirect·응답 시간/크기 정책, 단일 페이지의 시작일 이전 항목 경계, 상세 최대 20건과 모든 상세 날짜 일치가 통과해야 `window_scanned`다. 실제 DOM·날짜·미수용 범위는 [출처 명세 37절](SOURCE_ACQUISITION_SPEC.md#37-fda-공식-발표-목록과-상세-원문의-기간-수집)에 둔다.

```sh
node scripts/research.mjs scan-list --run 20260929-fda-press-sep-window-v2 --channel fda-press-announcements --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-fda-press-empty-v1 --channel fda-press-announcements --since 2026-09-29 --until 2026-09-30
node scripts/research-daily.mjs --run daily-20260929-v9 --plan-only
node scripts/research-daily.mjs --run daily-20260929-v9 --execute
node scripts/research-daily.mjs --run daily-20260929-v9 --resume
```

위 명령은 **이미 실행된 당시 입력의 기록**이다. 현재와 코드/설정/작성 회차가 달라지면 같은 ID로 재실행하지 않고 새 ID·계획을 만든다. `--until`은 제외 경계다. 첫 FDA 시험 `20260929-fda-press-sep-window-v1`은 목록 10개와 창 안 3개를 찾았지만 상세 Drupal 메타데이터 `Mon, 09/28/2026 - 17:43`을 파서가 해석하지 못해 날짜 충돌로 미완료가 됐다. 이 실패는 삭제하지 않았다. 메타데이터 요일·시각을 검사해 명시된 상세 공개일과 달력 날짜를 비교하도록 worker를 고치고, 같은 저장 bytes의 오프라인 재파싱 뒤 새 `v2`로 정책 수집을 완주했다. `v2`의 `list-scan.json`은 `selected_items:10`, `window_items:3`, `older_items:7`, `later_items:0`, `status:window_scanned`다. 세 상세는 목록/본문 날짜 9월 28일·28일·23일이 같고 본문 7·3·14블록이다. 각 상태는 `source_parsed_unreviewed`, `candidate_published:false`다. 관측 당시의 다음 창 `20260929-fda-press-empty-v1`은 창 안 0·이전 10개로 완료됐다. 두 창의 저장 목록/상세 bytes SHA·parse·후보 URL/날짜는 `verifyStoredListScan`으로 재검증했다. FDA의 발표 주제는 서로 달라서 수집이 기사 선택이나 최종 분류를 뜻하지 않는다.

`daily-20260929-v9`는 FDA baseline과 기존 아홉 경로로 20개 창을 고정했다. 처음 `--execute`는 18개 성공, FANUC 영문 목록의 `Robots policy could not be checked: failed` 1건과 일본어 IR 목록의 `Fetch deadline exceeded` 1건을 남겼다. 같은 FANUC host의 robots 및 IR URL은 별도 진단 HEAD에서 HTTP 200으로 응답했으나, 이 진단을 정책 수집의 성공 증거로 대체하지 않았다. `--resume`은 **그 두 창에만** `_a2` 시도를 만들었고 성공 20·보존 실패 2, 총 receipt 22개로 `configured_routes_scanned`가 됐다. 두 번째 `--resume`은 새 receipt/HTTP 시도를 만들지 않았다. `summary.json` SHA `37600c030de3c8f15398472a8ecdce02251911a623b51de71276f3eca86f1953`, 공용 `route-coverage.json` SHA `9efd3a5b5a697a00792444458675e9b9466ecd6d6313a2a94b26d85d8699a8d1`, `candidate-backlog.json` SHA `8ff80af01af65eacc88a96063b061b787b105cbcbaaefc1aafff57c6eb74bdf6`는 그 반복 전후에 같았다. 실패의 첫 receipt를 성공으로 수정하지 않았다.

최종 32칸은 **7칸 `partial`·25칸 `not_attempted`**다. 후보 장부는 **92건**(verified 43/deferred 13/rejected 1/unreviewed 35)이며 FDA 새 3건은 마지막 범주다. 최신 비공개 `handoffs/b7928a231e260c8541ed4014db058f63806d47d785f232111b983549a846f903.json`은 `pending:48`, `pending_observed_in_run:34`, `historical_review:21`, `incomplete_windows:0`이다. 이 인계의 `authority:local_vault_unreconciled`, `candidate_published:false`, `drive_verified:false`, `public_verified:false`를 유지한다. `window_scanned`는 한 발행 경로의 날짜 창이고 `partial`은 해당 조사 칸의 일부 출처를 확인한 상태다. 실제 최신 Drive 전체 원본 획득, 후보 사실 승인·기사 작성, 08시 호출 연결, 웹·RSS·GitHub 배포는 이번 실행에서 하지 않았다.

축소 FDA 목록/상세 회귀는 [`research-fda-scan.test.mjs`](../tests/research-fda-scan.test.mjs) 2/2, 일일 계획/재개 집중 회귀와 함께 17/17을 통과했다. 전체 `npm run test:garden` **338/338**, 프로젝트 전용 Python `unittest discover` **73/73**, `npx tsc --noEmit`이 통과했다. 프로젝트 전용 Python 경로는 `.local/research/local-ai/runtime/venv/bin/python`이다. 처음 잘못 지정한 `integrations/research-worker/venv/bin/python`은 실행 파일이 없어 시작도 못 했고, 전용 환경으로 다시 실행한 결과만 Python 통과 근거로 사용한다. 새 FDA 경로는 최근 목록 한 페이지에서 시작일 이전 항목에 닿지 못하면 미완료가 된다. 목록 pagination과 다른 의료·연구 원천, 25개 미시도 칸, 기존 자료 소급, 독립 모델 평가 및 권위 Drive/공개 관문은 다음 구현 단위로 남는다.

## 74. 연결된 Drive 원문 전체 읽기와 비공개 수집 입력 만들기

이 절은 72절의 **그 당시에는 원격 181개 원문을 읽지 못했다**는 상태 이후에 수행한 후속 실행이다. `Projects / Tech Knowledge`의 고정 루트 ID `1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD`를 연결된 Google Drive에서 조회하고, 자식 네 작성 폴더의 ID와 이름을 [`build-connector-snapshot.py`](../scripts/build-connector-snapshot.py)의 `ROOT_IDS`와 대조한다. 네 폴더와 그 하위 폴더를 페이지 끝까지 열거한다. Markdown 외 파일과 다른 Drive 영역을 입력에 섞지 않는다. 이번 조회에는 Markdown 181개, 하위 폴더 9개가 있었고 마지막 회차는 2026-09-23 오전 8시 파일이었다.

각 Markdown 파일의 raw bytes를 연결 도구로 직접 읽어 파일 ID, 부모 ID, 상대경로, 크기, 수정 시각과 함께 현재 로컬 `vault/`의 같은 경로와 비교한다. UTF-8 텍스트로 보이는지만 확인해서는 원문 일치가 아니다. **181개 모두** 원격 raw bytes SHA-256과 로컬 bytes SHA-256·크기가 같았다. 원문을 모두 읽은 뒤 네 폴더를 다시 열거해 ID·부모·크기·수정 시각이 처음 목록과 같은지 확인했다. 목록이 달라졌다면 같은 스냅샷으로 진행하지 않는다. signed download URL, raw 본문, OAuth 값은 콘솔이나 공개 파일에 남기지 않는다.

실제 원격 조회에서 확인한 사실만 `.local/drive-sync/connector-readback-20260929T035214Z.json`에 저장했다. 영수증은 `schema:tech-drive-connector-readback/v1`, 루트 ID, 네 고정 작성 폴더 ID, 모든 하위 폴더의 상대경로·ID·부모 ID, 모든 Markdown의 상대경로·ID·부모 ID·크기·수정 시각·원문 SHA-256, `verified_at`을 포함한다. **영수증은 연결 도구를 대체하지 않는다.** 누군가 임의로 만든 JSON의 SHA가 로컬과 맞아도 원격 인증을 증명하지 못한다. 새 날짜에는 이 절차를 원격에서 다시 수행한다.

```sh
python3 scripts/build-connector-snapshot.py \
  --repository . \
  --readback .local/drive-sync/connector-readback-20260929T035214Z.json \
  --output .local/drive-sync/connector-source-snapshot-20260929T035214Z.json
python3 scripts/pull-drive.py \
  --snapshot .local/drive-sync/connector-source-snapshot-20260929T035214Z.json \
  --verify-source-snapshot
node scripts/research-daily.mjs \
  --run daily-20260929-v10 \
  --drive-snapshot .local/drive-sync/connector-source-snapshot-20260929T035214Z.json \
  --plan-only
```

첫 명령은 영수증의 루트와 부모 체인, 중복 ID/경로, 파일 SHA·크기, Markdown 경로만 있는지, 로컬 181개가 하나도 빠지지 않았는지, 영수증 생성 후 10분 이내인지 검사한다. 로컬 파일이 심볼릭 링크이거나 영수증과 다르면 중단한다. 결과 스냅샷은 `.local/drive-sync/`에만 새 이름으로 만들고 기존 파일을 덮지 않는다. 두 번째 명령은 기존 Drive 동기화 검사기의 완전성·내용 해시·로컬 bytes 일치 관문이다. 세 번째 명령은 원격·로컬 일치 입력을 일일 20창 계획에 고정하지만 수집·원고·Drive 쓰기는 하지 않는다. 실측 내보내기 파일 SHA `a911f93144962e566e7fc3ac2691efee59e3cedb09963c7f6b00bd3b8fe78f0d`, 본문 SHA `505a788ec077770d83fa21d1b68405020b46c696df68b9a970c15b02d0d2f508`, 계획의 작성 파일 수 181개다.

계획 직후에는 같은 `--run`과 `--drive-snapshot`에 `--execute`를 주고, 종료 후 실패 창이 있으면 원인을 읽어 같은 입력으로 `--resume`한다. `--resume`은 스냅샷의 기존 bytes와 로컬 일치를 재확인하고 완료 창의 저장 근거를 다시 검사하며, 오래된 계획을 재개할 수 있도록 **생성 당시 10분 제한만** 풀어 준다. 임의의 새 영수증으로 기존 계획을 바꿔 끼우거나 새 원격 변경을 옛 실행의 확인으로 간주하지 않는다. 완료 후보는 여전히 미승인 비공개 자료다. 승인 사건 inventory, 원고·지식 의존성, Drive 업로드 후 원격 재읽기, 웹/RSS/GitHub 공개 비교가 끝나기 전에는 발행 성공이라고 쓰지 않는다. 기존 `tech-ai-briefing-08`의 지침은 75절에서 갱신했으며 실제 예약 실행 결과는 별도로 확인해야 한다.

실제 `daily-20260929-v10 --execute` 결과는 20창 중 18창 완료·KUKA 독일어 목록의 2창 `page_blocked`로 **`partial`**이다. 두 `page-0.json`에서 robots 정책 확인 실패를 읽었고 별도 `robots.txt` HEAD 진단도 20초 시간 초과였다. 같은 이유가 반복되는 동안 성공으로 간주하거나 정책을 건너뛰는 `--resume`을 실행하지 않는다. 성공한 아홉 경로의 receipt·원본은 그대로 남고 KUKA의 두 날짜 창은 `incomplete_windows`에 남는다. 후보 장부 92건, 인계 `pending` 48건 중 이번 실행 관측 33건, 과거 회차 검토 21건, 미완료 창 2개다. 32칸은 7칸 `partial`·25칸 `not_attempted`이며 기사·Drive 업로드·공개 검증 플래그는 모두 `false`다. 원인과 회복 조건은 [일일 수집 명세 4.10절](DAILY_NEWS_INGESTION_IMPLEMENTATION.md#410-drive-대조-입력을-사용한-2026-09-29-수집-결과)에 기록했다.

## 75. 기존 오전 8시 예약에 비공개 수집 단계 연결

2026-09-29에 **새 예약을 만들지 않고** 기존 `tech-ai-briefing-08`의 지침 끝에 `[2026-09-29 반복 뉴스 수집 단계]`를 추가했다. 변경 전 설정은 `.local/automation-backups/tech-ai-briefing-08-20260929-before.toml`에 비공개로 보존했다. 앱의 자동화 갱신 도구로 수정한 뒤 저장된 설정을 다시 읽어 `ACTIVE`, 매일 오전 8시 규칙, 기존 모델·추론 수준·프로젝트·시작 폴더와 기존 15,073자 지침의 접두 부분이 모두 그대로인지 확인했다. 새 지침 표식은 한 번만 있고 전체 길이는 16,328자다. 기존 예약의 시작 폴더는 옛 iCloud 프로젝트 경로지만 명령은 프로젝트 저장소의 절대경로에서 수행하도록 기존 지침에 이미 지정되어 있다. 작업 루트·다른 작업자와 충돌 여부를 각 실행에서 확인해야 한다.

예약 지침은 74절의 원격 네 폴더 전수 목록과 raw-byte 조회, 로컬 SHA/부모/수정 시각 대조와 두 번째 목록 확인, 실제 조회를 근거로 한 새 비공개 영수증, [`build-connector-snapshot.py`](../scripts/build-connector-snapshot.py)와 `pull-drive.py --verify-source-snapshot` 순서를 요구한다. 이어 KST 날짜의 고유 run ID와 같은 `--drive-snapshot` 파일로 `research-daily.mjs --plan-only → --execute`를 호출하고, 실패 원인을 읽은 뒤에만 같은 계획의 `--resume`을 사용하도록 했다. `partial/blocked`는 새 소식 없음이 아니며 후보는 기사 승인으로 승격되지 않는다. 기존 GPT 실시간 취재로 8개 분야·기업 전략·논문·교수 창업을 계속 확인한다. 로컬 파일로 임의 생성한 영수증이나 오래된 스냅샷으로 Drive 원본 조회를 대체하지 않으며, 충돌·원격 불일치·연결 실패를 성공으로 보고하지 않는다.

이는 **예약 지침 변경**의 확인이다. 수정 후 예약이 아직 실제로 실행된 적은 없고, 예약 실행 환경에서 Google Drive 연결 도구가 사용 가능한지, 181개 이상 원문 읽기와 10분 이내 snapshot 조립이 끝나는지, 새 run이 생성되는지, 비공개 handoff를 브리핑 집필에 정확히 반영하는지는 미검증이다. 다음 실제 예약에서 `daily/runs/<run>/plan.json`의 `edition.authority`와 원본 SHA, 성공·실패 receipt, `summary.json`의 32칸, handoff의 `incomplete_windows`를 읽고 실행 기록과 대조한다. 승인 원고의 Drive 업로드 후 원격 bytes·부모·revision 확인과 웹/RSS/GitHub 공개 URL 재읽기는 별도 증거가 있어야 한다. 첫 실행이 실패하면 이전 수동 v10 성공이나 기존 공개 회차를 그 실행의 성공으로 세지 않는다. 이미 저장된 자동화의 복구는 비공개 변경 전 사본과 비교한 뒤 앱의 자동화 갱신 도구로 수행하며 TOML을 직접 덮어쓰지 않는다.

## 76. NVIDIA 공식 보도자료 RSS의 실물 수집과 열한 번째 경로

[`출처 명세 38절`](SOURCE_ACQUISITION_SPEC.md#38-nvidia-newsroom-공식-보도자료-rss의-기간-수집)의 공식 피드를 `nvidia-press-releases`로 등록했다. 등록 직전 공식 RSS 목록과 두 상세 HTML을 확인하고, feed 제목·20항목·GUID/permalink·UTC 게시 시각, 상세 `div.article`의 제목·날짜·본문 선택자를 고정했다. 단순 HTTP 200 확인을 수집 성공으로 세지 않고 공통 정책 fetcher로 다시 요청했다.

```sh
node --test tests/research-nvidia-press-scan.test.mjs
node scripts/research.mjs scan-list \
  --run 20260929-nvidia-press-window-v1 \
  --channel nvidia-press-releases \
  --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list \
  --run 20260929-nvidia-press-empty-v1 \
  --channel nvidia-press-releases \
  --since 2026-09-15 --until 2026-09-22
node scripts/research-daily.mjs --run daily-20260929-v11 --plan-only
```

첫 run은 피드 20개 중 기간 안 2개·이전 18개를 발견하고 상세 2개의 실제 원문을 정책 상태 `checked`로 저장했다. 각 제목·표시 날짜가 RSS와 일치했고 두 본문은 6·30블록이다. 둘째 run은 기간 안 0개·이전 18개·이후 2개를 확인한 빈 창이다. 두 `list-scan.json`은 `window_scanned`, `verifyStoredListScan`은 저장 원문 SHA·parse·후보 판본/URL/날짜에 대해 `true`였다. 시험 fixture 2/2가 통과했다. **후보 두 건은 기사 사실 승인 전**이며 작성 `vault/`, Drive, 웹/RSS/GitHub에는 반영하지 않았다.

`data/research-daily-routes.json`에 첫 완료 run을 baseline으로 고정했다. `daily-20260929-v11`은 11경로×2창=22창을 계획했지만 **실행하지 않았고 Drive snapshot도 제공하지 않았다**. 이전 `daily-20260929-v10`의 10경로/20창 중 성공18·KUKA blocked2와 32칸 7 partial/25 미시도는 마지막 **실행 결과**로 유지한다. 이 계획이 신규 AI/해외/기업·운영 칸의 실제 확인이나 32칸 완주를 뜻하지 않는다. 다음 08시 예약은 연결 도구에서 새 Drive 영수증·스냅샷을 만든 새 run으로 열한 번째 경로를 실제 수집해야 하며, 대상 피드가 20항목 내 과거 경계에 닿지 못하면 해당 창을 `incomplete`로 남긴다. 원고 승인 뒤에만 기업 전략 기록과 웹·RSS·GitHub를 갱신한다.

## 77. MIT Robotics·AI 공식 RSS의 네 창 검증과 일일 설정

기존 `mit-robotics`의 주제 HTML을 [MIT 공식 Robotics RSS](https://news.mit.edu/topic/mitrobotics-rss.xml)로 전환하고 `mit-ai-research`를 [MIT 공식 AI RSS](https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml)로 새로 등록했다. 구 HTML 발견 주소는 과거 회차/원문 인용으로 남길 수 있으나 반복 스캔은 새 RSS URL을 사용한다. 공통 `mit-news-article-v1`이 기사 제목·`time[datetime]` 게시일·실제 본문만 저장하고 피드의 제목·날짜와 비교한다.

```sh
node --test tests/research-mit-rss-scan.test.mjs
node scripts/research.mjs scan-list --run 20260929-mit-ai-window-v1 --channel mit-ai-research --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-mit-robotics-window-v1 --channel mit-robotics --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-mit-ai-today-v1 --channel mit-ai-research --since 2026-09-29 --until 2026-09-30
node scripts/research.mjs scan-list --run 20260929-mit-robotics-today-v1 --channel mit-robotics --since 2026-09-29 --until 2026-09-30
node scripts/research-daily.mjs --run daily-20260929-v13 --plan-only
```

위 네 `scan-list`는 이미 실행된 **불변 run ID**다. 같은 명령을 복사해 새 자료를 받는 방식으로 재사용하지 않는다. 날짜·설정·코드가 달라지는 후속 실행은 KST 날짜와 새 suffix로 계획하고, 시작 전에 현재 작업 루트·다른 worker·최신 Drive 작성 원본을 다시 대조한다. 새 창이 50개 피드 항목 안에서 `since`보다 오래된 날짜를 찾지 못하면 `feed_cutoff_not_reached`로 남긴다. 기사 중 하나라도 robots/HTTP/선택자/날짜 비교에서 실패하면 그 창 전체는 `detail_incomplete`다. 빈 창도 과거 경계가 있어야 `window_scanned`다.

네 실행의 관측은 AI 과거 창 6건, 로봇 과거 창 0건, AI 당일 관측 2건, 로봇 당일 관측 1건이다. 두 피드 모두 50개 항목, 제목과 GUID=permalink가 맞았고 모든 상세와 목록은 `policy_status:checked`였다. `verifyStoredListScan(root, storedListScan(root, run), {channel_id, since, until_exclusive})`로 `.local/research/local-ai/runs/<run>/`의 `list-scan.json`, `documents.json`, `parses.json`, `candidates.json` 및 원본 SHA를 재검사해 네 건 모두 `true`였다. 현재 후보 9건은 원고가 아니며 Drive 작성 폴더·공개 웹/RSS/GitHub에 추가하지 않았다.

초기 `daily-20260929-v12` 계획 뒤 공통 RSS의 제목 충돌 검사를 추가했다. 기존 MIT 원문 9건과 피드의 제목은 전부 일치했고, 공백만 다른 NASA 제목 사례는 정규화 비교를 통과한다. 당시 `daily-20260929-v13`은 13경로/26창을 계산한 **Drive 미대조 `plan-only`**다. 실제 08시 실행에서는 74~75절의 인증 Drive 전수 조회→새 영수증·스냅샷→새 KST run ID→`--plan-only → --execute`를 따른다. `--resume`은 저장 완료 창의 SHA 검증 뒤 미완료 창만 다시 수집한다. MIT AI 항목의 기사 주제, MIT 로봇 발표의 논문 실험 조건, 창업 관계는 원문·학술지·연구실·TLO/회사 자료를 각각 읽어 승인한다. AI 피드의 소속 자체를 기사 태그나 논문 전문 확인으로 취급하지 않는다.

arXiv API는 공식 문서에 있어도 현재 프로젝트의 robots 검사에서 두 API 호스트 경로가 거부됐으므로 일일 경로로 넣지 않았다. `cs.RO/recent`의 짧은 목록도 일주일 날짜 경계를 입증하지 못했다. 다음 논문 수집 절편은 허용되는 학회·학술지 또는 충분한 종료 경계가 있는 공식 저장소에서 **메타데이터 발견 → 판본 고정 → 전문·실험 조건 열람 → 원문/요약 분리**를 실제로 시험하는 것이다. 이 제한은 비공개 운영 기록에 남기며 독자 뉴스 화면에는 실패 해설이나 빈 분석 탭을 넣지 않는다.

## 78. Frontiers 저널 출판 목록의 두 창 수집과 복구

`frontiers-robotics-papers`는 [공식 저널 목록](https://www.frontiersin.org/journals/robotics-and-ai/articles)의 `Published` 카드만 날짜 창 후보로 사용한다. `Accepted` 카드도 선택자가 빠지지 않았는지 확인하지만 게재 기사로 만들지 않는다. 아래 **두 `scan-list` 명령은 2026-09-29에 이미 실행한 불변 run ID**이며 재수집용으로 재사용하지 않는다. 날짜·설정·원문 판본이 달라지면 새 ID로 실행한다. 작업 전 `AGENTS.md`, 현재 checkout/dirty 변경, 다른 research worker와 최신 Drive 작성 원본의 소유 상태를 먼저 확인한다.

```sh
node --test tests/research-frontiers-scan.test.mjs tests/research-list-scan.test.mjs
node scripts/research.mjs scan-list --run 20260929-frontiers-robotics-window-v1 --channel frontiers-robotics-papers --since 2026-09-22 --until 2026-09-29
node scripts/research.mjs scan-list --run 20260929-frontiers-robotics-today-v1 --channel frontiers-robotics-papers --since 2026-09-29 --until 2026-09-30
node scripts/research-daily.mjs --run daily-20260929-v14 --plan-only
```

현재 두 run은 `window_scanned`, `candidate_published:false`다. 첫 run의 목록 parse는 출판 15개 중 창 안 8·이전 5·이후 2, 둘째는 창 안 2·이전 13이다. 첫 run의 상세 HTML 8개와 둘째의 2개는 모두 제목·게시일을 목록과 대조했다. 목록/상세는 `policy_status:checked`; `verifyStoredListScan`으로 원 bytes SHA, parse, 후보 URL·날짜·상세 판본을 다시 확인했다. 두 run의 `.local/research/local-ai/runs/<run>/`에 `list-scan.json`, `documents.json`, `parses.json`, `candidates.json`이 있고 원본은 동일 root의 source-version 저장소에 있다. `parses.json`에는 목록 parse도 포함되므로 첫 run은 parse/문서 9개, 둘째는 3개다. 후보는 8·2개뿐이다.

기존 원본의 재검사 명령은 다음과 같다. 이 명령은 네 JSON·원본 SHA와 날짜/후보 판본을 읽고 **네트워크 요청이나 기사 승인을 하지 않는다**.

```sh
node --input-type=module -e 'import {storedListScan,verifyStoredListScan} from "./scripts/research/daily-scan.mjs"; const root=".local/research/local-ai"; for (const [run,since,until] of [["20260929-frontiers-robotics-window-v1","2026-09-22","2026-09-29"],["20260929-frontiers-robotics-today-v1","2026-09-29","2026-09-30"]]) console.log(run,verifyStoredListScan(root,storedListScan(root,run),{channel_id:"frontiers-robotics-papers",since,until_exclusive:until}));'
```

`daily-20260929-v14`는 14경로×2창=28창의 **Drive 미대조 `planned`** 결과다. 새로운 실제 오전 8시 실행에는 [Drive 원본 조회 절차](#74-연결된-drive-원문-전체-읽기와-비공개-수집-입력-만들기)의 새 원격 file ID·부모·revision·bytes SHA를 담은 snapshot, 새 KST run ID, `--plan-only → --execute`가 필요하다. 그 실행에서 각 경로 receipt와 `incomplete_windows`를 읽어야만 당일 조사 상태를 보고한다. 현재의 개별 Frontiers 성공을 마지막 통합 v10의 성공 18/20이나 새 공개 기사로 합산하지 않는다.

목록에 `Published`로 표시된 기사 중 [SkinAxis](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2026.1937934/full)는 HTML에서 서론·방법·결과·논의를 포함한 136개 텍스트 블록을 얻었다. 동시에 수식·일부 단위가 텍스트에서 빠지는 것을 확인했다. HTML의 숫자를 그대로 모델에 넣어 성능 문장을 승인하지 않는다. 같은 기사 `/xml` JATS는 별도 정책 probe에 저장했지만 현재 일일 worker가 이를 파싱하지 않는다. 먼저 XML/MathML·표 cell을 구조적으로 읽는 parser와 본문 HTML의 locator 대조를 구현하고, DOI·기사 유형·수정/철회·사전공개 판본을 원문으로 확인한다. 8개 안의 Editorial과 당일 Review를 원저 논문으로 취급하지 않는다.

목록에서 시작일 이전 **출판** 카드가 사라지면 `cutoff_not_reached`이고 성공으로 재시도하지 않는다. 새 카드 상태나 항목의 날짜/제목/URL이 선택자 밖이면 `unprofiled_article_link`·`listing_ignored_profile_incomplete` 등으로 멈춘다. 상세 제목/날짜 충돌이나 원문 부족도 `detail_incomplete`다. 원본과 실패 run을 보존하고 공식 목록의 다음 페이지·아카이브 혹은 바뀐 선택자를 새 profile/fixture/실물 run으로 수용한다. 사전공개본 검색·저널 HTML·JATS/PDF의 서로 다른 주장이나 철회는 편집 검토 상태로 분리한다. 빈 심층 분석 탭·파서 장애 문구를 독자 화면에 넣지 않는다.

## 79. 원문 한 건에서 새 회차의 비공개 결과까지

2026-09-29에 [NVIDIA 공식 발표](https://nvidianews.nvidia.com/news/open-agent-safety-platform)를 첫 새 회차 수직 슬라이스로 사용했다. `20260929-nvidia-press-window-v1`의 후보 `source-dd3480c18e77adf8da6f`에서 정확한 상세 원문 판본 하나를 `select-source`로 골랐다. 로컬 `qwen3.8:27b`가 사실 후보 6개를 추출했고 원문 블록 대조로 4개 승인·2개 보류, 잘못된 시간 단위/조건을 정정했다. 제공 단계에 관한 사실 1개를 원문에서 직접 추가해 최종 승인 사실은 5개다. 모델 초안의 중복을 고쳐 사건 ID `dd3480c18e77adf8`, 발표일 9월 28일, `agent-security` 개념 연결을 승인했다. 원본·판정·원고는 `.local/research/local-ai/runs/20260929-nvidia-agent-safety-extract-v1/`에 보존한다.

새 회차 비공개 검증에는 `preview --review <research-private-edition/v1 JSON>`을 쓴다. 이 입력은 `intent: private_slice`, 정확한 회차 날짜·이전 회차의 `coverage_end`부터 이어지는 종료 시각, 새 사건의 고정 URL ID를 요구한다. 기존 원고를 덮어쓰거나 `vault/`에 결과를 설치하지 않는다. 같은 회차의 새 Signals는 `note-review` v2의 `operation: create`로 승인하며, 관측의 사건 ID·사건 날짜를 검토한 원문 claim에 묶는다. 개념 색인은 새 Knowledge 개념을 만들 때만 갱신한다.

```sh
node scripts/research.mjs preview \
  --run 20260929-nvidia-agent-safety-private-site-v3 \
  --approved-run 20260929-nvidia-agent-safety-extract-v1 \
  --knowledge-run 20260929-nvidia-agent-safety-signal-v1 \
  --review .local/research/nvidia-agent-safety-private-edition.json
```

이 실행은 refresh→지식 동기화·검사→원고 검증→사이트 생성·링크 검사→웹/RSS/GitHub digest 문장·발표일·원문 대조를 통과했다. 새 회차 파일 1개와 Signals 1개, 공개 산출 파일 279개, digest 133개를 **비공개 작업 공간**에 만들었다. 새 RSS 항목 1개를 앞에 넣으면서 기존 피드의 상위 39개 GUID·발행 시각·순서를 보존했고 `agent-security` 기사 연결도 확인했다. 첫 시도는 Signals 부재, 둘째는 Signals를 개념 색인에 잘못 넣는 결함 때문에 차단됐다. 두 결함을 우회하지 않고 승인 경로와 색인 필터를 고쳐 세 번째 실행에서 통과했다.

Drive `Research`에는 비공개 영수증 `2026-09-29-nvidia-agent-safety-private-slice.json`을 먼저 업로드하고 파일 ID `1qwTwnRgEJ3p5G1doAS7N9bepcHkJ_uFd`의 부모·크기와 원격 raw bytes가 로컬 1,361바이트와 같음을 재조회했다. 8개 분야 조사와 새 회차의 편집 검토가 끝나지 않았으므로 권위 `Editions`·`Signals`에는 설치하지 않았고, 네 작성 폴더 전수 readback·GitHub push·실제 웹/RSS 공개도 수행하지 않았다. 비공개 manifest의 `coverage_complete`, `candidate_published`, `drive_verified`, `browser_verified`는 모두 `false`다. `file:` 주소는 브라우저 보안 정책으로 열리지 않아 실제 화면 시험은 미검증이며 생성 HTML의 구조·본문·태그·링크와 RSS/digest는 정적 검사로 대조했다.

후속 `v4/v5`는 승인된 원문 중 하나라도 회차 `coverage_end` 이후에 관측됐으면 거부하고, 새 회차의 전문용어 ID 중복도 거부한다. 최종 `v5`의 새 회차·Signals·기사 HTML·RSS·digest SHA는 앞선 성공본과 같고 전체 비공개 생성·대조가 다시 통과했다. `Research`에 원문 HTML(`1BUpPM21GhTAA48ZSyGQJDoqCkRxQTt0v`, 86,314바이트)과 비공개 회차 Markdown(`1Hj22WFcHnJs78huHe7dXw_EyLnZetzSC`, 4,961바이트)을 별도로 저장했고, 연결 도구로 받은 원격 raw bytes가 각각 원본 로컬 파일 및 동일 SHA의 `v5` 회차 파일과 완전히 같은지 확인했다. SHA·파일 ID·부모·검증 시각은 비공개 `.local/research/2026-09-29-nvidia-agent-safety-drive-readback.json`에 남겼다. 이것은 **비공개 Research 자료 3건의 원격 재읽기**이며 권위 작성 폴더 설치나 공개 배포가 아니다. 비공개 회차의 `_0800`/‘아침’ 표지는 기존 파일 규칙에서 왔지만 실제 범위 종료는 15:24 KST이므로 오전 8시 발행을 입증하지 않는다. 공개 회차로 승격할 때는 조사 범위와 발행 시각을 다시 맞춰야 한다.

선정 후보는 원래 수집 run의 `candidates.json`을 바꾸지 않고 `.local/research/candidate-backlog.json`에 한 번 병합했다. 장부는 92→93건이며 이 후보는 승인 원고의 고정 사건 ID·검토일·원고 run을 기록한 `verified`이지만 아직 `publication:null`인 보류 중 발행 사건이다. 병합 전 장부는 `.local/research/candidate-backlog-before-nvidia-slice-20260929.json`에 보존했다. 같은 URL 중복 0건, 고유 key 93건을 확인했다. 후속 정규 취재는 이 후보를 다시 새 사건으로 세지 않고 기존 승인 원고와 현재 원문 판본을 대조해야 한다.
