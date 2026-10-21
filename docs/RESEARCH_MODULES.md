# 조사 모듈과 MCP 실행 계약

수집 단위는 출처와 원문 판본이고, 작성 단위는 선별된 사건이다. 독립 CLI와 MCP가 같은 JSON Schema·모듈 함수·native 실행기를 사용한다. 출처별 crawler나 별도 지식 DB를 새로 만들지 않는다.

현재12모듈67작업이며 외부 MCP 기본 도구는5개다. `collection.storage`는 `status/prepare/pending/verify/export/import/enable/hydrate/evict`와 로컬 OAuth의 `remote-status/remote-pull/remote-push/remote-import`를 같은 독립 `scripts/research-storage.mjs`로 제공한다. 저장 목록은 source/event/approval를 새 지식 DB로 복제하지 않고 기존 파일의 Drive 위치와 해시만 연결한다. cold 원문은 worker가 `waiting_for_storage`를 반환하며 기존 Drive 연결 또는 사전 인증된 로컬 adapter로 정확한 묶음을 받은 뒤 같은 job을 명시 재개한다. 로컬 planner는 보관 검증·정리 작업을 자율 실행할 수 없다. [Drive 보관 계약](DRIVE_STORAGE.md#독립-로컬-drive-oauth-2026-10-16)에 인증 설정·전송 재개·실제 검증 범위를 기록한다.

### 미완료 수집 보완

`collection.recover`는 정확한 `report_path/report_sha256`에서 미완료 날짜 창만 골라 `plan-only → execute → resume`로 처리한다. 완료 출처를 다시 수집하지 않는다. 원래 실패 보고서·run을 보존하며 `base_report`와 보완한 창의 `report_sources`를 반환한다. 수집과 보고서 생성을 분리하므로 묶음마다 기존 전체 원문을 다시 검증하지 않는다. 필요한 범위의 `collection.report`를 한 번 생성해 다음 회차에 연결한다. 기존 전체와 통합한 보고서가 필요할 때만 `build_report: true`로 요청하며, 그 과정의 cold 자료 대기는 `report_wait`로 반환하고 완료 수집을 반복하지 않는다. 이미 고정한 브리핑 입력은 교체하지 않는다.

첫 요청은 `run_id`, `mode`, 보고서 참조를 주고 선택적으로 `channels`, `max_attempts`를 지정한다. 재개는 같은 `run_id`와 `mode: "resume"`이면 된다. `max_routes`(기본10), `time_budget_ms`(기본600000)는 호출별 새 경로 착수 제한이며 시작한 원문의 timeout은 별도다. `detail_batch_size`를 선언한 출처는 새 본문 요청만 묶음 예산을 소비한다. 저장된 원문과 동일 worker·parser·옵션의 완료된 파싱은 재사용하고, 원래의 partial/blocked 판정도 그대로 유지한다. 예산으로 미룬 본문은 다른 실패가 섞여 있어도 다음 묶음에서 처리한다. 일반 오류만 남았을 때의 재시도는 `retry_incomplete: true`로 명시하고 출처별 시도 상한을 유지한다.

수집 설정·코드가 바뀌면 새 복구 ID를 만든다. `scan.recovery_source_run` 또는 독립 CLI `scan-list --recovery-source-run ID`는 바뀐 설정으로도 같은 출처·같은 창의 검증된 원문을 재사용한다. 원문 시각을 현재로 바꾸거나 과거 완료·승인을 승계하지 않는다. URL은 현재 허용 host 안이어야 한다. `STORAGE_PENDING`은 사이트 접근 실패로 기록하지 않고 정확한 Drive 묶음 요청과 같은 native run을 보존한다. 복원 후 같은 복구 ID를 재개한다.

결과 파일을 쓰기 전에 중단된 수집도 `collection-input.json`과 native 체크포인트의 해시·원문을 검증해 재사용한다. 코드 수정 뒤에는 `source_runs: {"출처ID": "이전-native-run-ID"}`로 정확한 같은 창의 체크포인트를 지정할 수 있다. 활동 중인 run 소유자나 아직 실행 중인 단계는 재사용하지 않는다. 실패·보관 대기 단계는 새 완료로 바꾸지 않으며 `unreported_attempts`에 남긴다. 원문·파싱의 정상 단계를 다시 실행하지 않는다.

조건부 요청에 쓸 ETag/Last-Modified가 없는 cold HTTP 캐시는 과거 본문을 먼저 복원하지 않는다. 새로 받은 동일 해시의 응답은 정확한 bytes로 복원하고 과거 immutable 메타데이터는 보존한다. 304에 필요한 캐시와 실제 원문 검증은 기존 관문을 유지한다. 정책 점검 목록은 메타데이터로 고르고 선택한 정책만 원문을 확인한다. 검토 대기는 독자 화면·기사 본문에 출력하지 않는다.

RSS 범위가 짧은 NDSoft 매체는 공통 `ndsoft-news-rss-archive-v1`에 매체별 공식 archive URL만 지정할 수 있다. 연도가 없는 목록 날짜는 원문의 명시 날짜로 대조한다. 페이지의 반복 행은 기본 오류이며, 확인한 출처에만 `identical-rows` 상한을 선언한다. 같은 URL·제목·날짜의 인접 페이지 행만 합치고 전체 페이지 반복·내용 변경은 계속 차단한다. NVIDIA의 RSS 재노출일은 명시된 원문 발표일과 두 날짜가 모두 조사 창 안에 있을 때만 원문 날짜로 연결하며 두 근거를 함께 보존한다.

## 기본 흐름

### 개발 완료 관문과 실패 복구 (2026-10-16)

정규 실행은 개발 완료 뒤에만 시작한다. 기준 파일은 `data/research-operation-policy.json`이다. 상태 조회는 파일만 읽고 native job·모델·수집·Drive·잠금을 생성하지 않는다.

```sh
node scripts/research/operation-policy.mjs status
```

`development_pending`은 정상 대기이고 실패나 새 소식 없음이 아니다. `validation.progress`도 같은 `operation_gate`를 반환하며, WBS 비율만으로 운영을 허용하지 않는다. `phase: ready`와 비공개 `research-development-completion/v2`의 정확한 path/SHA·코드 manifest가 필요하다. GPT의 필수6개는 수집/파싱·큐레이션/작성·GPT 재개·Drive 복원 재개·발행 복구·표적 회귀다. 각 check는 passed와 실제 검토한 근거 path/SHA를 요구한다. finalize가 근거 bytes를 재대조하고 실제12/12 시스템 WBS·GPT 역할 정책을 확인한 뒤 구현/설정 파일 목록·SHA와 완료 영수증을 불변 저장한다. 상태 조회는 이 hot 영수증과 실제 코드 판본을 확인하며 큰 cold 원문을 매번 복원하지 않는다. 파일 추가/삭제·내용 또는 실행 설정 변경은 운영을 차단한다. 과거 v1 성공 문자열만으로 운영하지 않는다. 완료 근거는 사실·편집·release 승인을 대신하지 않으며 정규 발행 횟수는 별도다.

```sh
node scripts/research/operation-policy.mjs finalize --review .local/research/<review>.json --review-sha256 <exact-SHA>
node scripts/research/operation-policy.mjs status --executor codex
node scripts/research/operation-policy.mjs status --executor ollama
```

finalize 검토 파일은 research-development-review/v1, executor codex, storage_backend connected_drive, release_id와6개 checks를 담는다. 검토자가 실제 원문/기사·현재 검사·복구 기록을 읽고 근거 SHA를 선택한다. 자동으로 passed를 채우는 명령이 아니다. 코드 변경 후에는 development로 되돌리고 새 release_id에서 필요한 변경 구간만 확인해 finalize한다. 기존 완료 파일은 덮어쓰지 않는다.

기본 수행자는 GPT(Codex)이며 MCP/독립 모듈 기본 정책은 data/research-model-policy-codex.json이다. Codex가 추론 요청을 읽고 실제 결과를 제출하며 같은 native job을 재개한다. 명시 로컬 operator의 기본 정책은 기존 data/research-model-policy.json(Gemma)을 유지한다. 로컬 정규 실행은 기본 비활성이며 GPT 완료로 자동 활성화하지 않는다. optional_execution.ollama의 명시 활성화와 local_execution_resume/local_oauth_roundtrip의 별도 판본 고정 완료 근거가 필요하다. 미활성은 executor_not_ready로 정상 대기한다. 모델/수행자 전환은 기존 요청과 SHA를 보존하고 정책/구현이 달라지면 새 job ID에 유효한 선행 결과를 연결한다.

로컬 정규 실행에는 `npm run research:operator -- --regular ...`를 사용한다. 개발 대기이면 MCP 연결·모델·체크포인트를 만들기 전에 정상 종료한다. 상태 조회 같은 명시 개발 검증은 기존 `--modules/--operations` 범위에서 별도로 수행한다. 정규/개발 실행 목적은 저장 입력에 고정하므로 재개 시 목적을 바꿀 수 없다.

| 관측 상태 | 다음 처리 |
|---|---|
| completed | 저장 결과의 SHA를 확인해 재사용; 같은 도구를 다시 실행하지 않음 |
| waiting_for_reasoning | 정확한 task/request SHA를 읽어 Codex submit 또는 로컬 execute를 완료한 뒤 원 job 재개 |
| waiting_for_storage | pending의 정확한 Drive ID/묶음 SHA로 hydrate 후 원 job 재개 |
| 사실·편집·관계 검토 대기 | 원문을 실제 대조한 검토 결과를 기존 검증 경로에 제출; planner가 자체 승인하지 않음 |
| failed / interrupted | 저장 오류·입력·worker·부분 결과를 확인하고 원인 해결 후 명시 재개 |
| worker_status_unknown | 프로세스 조회 권한/수단을 복구하고 같은 job 재조회; 중복 실행·잠금 회수 금지 |
| 입력·정책·구현 변경 | 원 job과 오류는 보존; 새 job에서 유효한 선행 결과를 재사용 |
| 원격 쓰기 결과 불명 | 동일 대상 ID·raw bytes·receipt를 readback한 뒤 미적용 단계만 수행 |

authoring delivery 내부에서 connector write intent와 capture event가 만들어지기 전에 발생한 `STORAGE_PENDING`은 실행 ID·입력 SHA를 고정한 `waiting_for_storage`로 보존한다. 정확히 요청한 파일의 SHA·크기를 복원한 뒤 같은 모듈 job과 execution ID를 재개한다. write intent 또는 connector event가 이미 생긴 경우에는 이 경로를 쓰지 않고 새 execution ID와 원격 readback으로 불확실 쓰기를 먼저 조정한다.

일일 계획 검증은 보관된 coverage의 모든 참조 회차를 계속 확인한다. 첫 성공 검증은 실제로 읽은 scan artifact·원문·parse 및 parse 종속 경로와 검증기 코드 지문, 검증된 cold-storage/Drive 묶음 바인딩을 `daily/scan-verifications/<run>/<proof-sha>/verification.json`에 불변 저장한다. 이후에는 코드와 각 입력 SHA 또는 원격 묶음 식별이 그대로일 때만 이 영수증을 재사용한다. 파일·카탈로그·묶음·검증기 지문이 달라지거나 영수증이 손상되면 기존 원문 검증으로 되돌아간다. 첫 검증에서 cold payload가 필요하면 검증기는 본문·parse·OCR·이미지 parse 종속 경로를 순회하며 정확한 요청을 모아 `STORAGE_PENDING`으로 반환한다. 요청된 raw bytes만 검증·hydrate한 뒤 같은 계획을 재개한다. cold 증거가 완전히 복원되어야 영수증을 만들며, 누락 증거를 건너뛰거나 coverage를 완료로 표시하지 않는다.

MCP는 기존5도구를 유지한다. `research_job_status`의 recovery는 구체적인 다음 행동과 자동 재시도 금지를 반환한다. `research_job_resume`은 입력/구현/정책 검증을 유지하며, 재개 직전에 이전 state와 SHA를 `module-jobs/<job>/attempts/<번호>-before-resume.json`에 불변 저장한다. 결과가 이미 저장된 worker는 정확한 결과를 복구하고 완료 모듈 호출을 반복하지 않는다. 로컬 운영자는 중단 지점을 조회하고, 원인을 해결한 native job이 완료된 뒤 자신의 `--resume`으로 이어간다.

Drive 인증은 기존 Codex/GPT 연결과 선택적인 로컬 OAuth adapter를 지원한다. 로컬 Desktop client를 등록하고 Google 동의를 마치면 supervisor가 collection.storage remote-pull/push/import를 명시 호출할 수 있다. 인증이 없거나 취소됐으면 waiting_for_storage를 유지한다. adapter는 실제 원격 metadata·raw bytes를 받아 기존 pending/verify/hydrate에 넘기며, 인증 설정을 모델에게 넘기거나 검증 metadata를 스스로 만들어 해결하지 않는다. 독립 CLI는 scripts/research-drive.mjs이고 실제 계정 최초 동의와 live 왕복은 코드·fixture 통과와 별도로 판정한다. [Ollama 도구 호출](https://docs.ollama.com/capabilities/tool-calling), [Google Drive 로컬 OAuth 예제](https://developers.google.com/workspace/drive/api/quickstart/python).

```mermaid
flowchart LR
  C[여러 출처 수집·파싱] --> E[회차 자료 고정]
  E --> P[사건 후보·관계 판정]
  P --> Q[오늘·이전 미수록 사건 큐레이션]
  Q --> S[선정 사건의 원문·블록 선별]
  S --> F[사건별 근거 추출·대조]
  F --> I[중요 사실·수치 조건 검토]
  I --> W[육하원칙 기사·상세 설명]
  W --> V[핵심 사실 전달 대조·편집 승인]
  V --> K[전문용어·변화 이력·온톨로지]
  K --> H[승인 결과·정의 판본 발행 인계]
```

`collection.daily`의 계획된 창마다 수집 시도 결과가 있어야 `edition.freeze`를 실행할 수 있다. 기존 출처별 완료 run을 모을 때는 `collection.report`의 `source_runs`로 각 저장 run과 당시 `policy_recheck_limit`을 명시한다. 별도 `held_sources`는 실패했던 원 창·관측 시각을 유지하며 지금 요청한 범위와 구분한다. 일일 `supplement_runs`와 출처별 frontier는 같은 보고서에서 혼합하지 않는다. 미시도 창이 남으면 고정을 거부한다. 실패·부분 수집 창은 `partial`로 보존하고 성공한 창의 실제 저장 원문으로 편집을 진행할 수 있다. 실패를 빈 뉴스나 완료 coverage로 바꾸지 않는다.

회차는 기존 collection report의 SHA와 source/version/parse를 연결한다. 새 원문이나 늦은 도착을 고정 회차에 덧붙이지 않는다. 새 회차·새 판정 계획에서 검토한다. 기존 원문·발표일·승인·기사 URL·RSS GUID는 수정하지 않는다.

사건 그룹 ID는 비공개 작성 계획의 식별자다. 공개 사건 ID는 기존 native 승인 경로에서 확정하며 두 ID를 같은 것으로 취급하지 않는다.

### 독립 큐레이션

`curation.prepare`는 검토한 `plan` 참조와 대기 큐의 이전 계획을 같은 날짜의 불변 풀로 만든다. 원문·parse·블록을 복사하거나 다시 수집하지 않는다. 후보에 원 발표일, 원 사건 계획, 관련 canonical 기사 ID/본문 SHA, 실제 원 writer의 선택 참조를 연결한다. `curation/queue.json`은 기존 계획의 참조이며 별도 기사/지식 DB가 아니다. 오래된 후보를 지우지 않고 읽을 수 없는 이전 계획은 비공개 재검토 항목으로 남긴다.

`curation.evaluate`의 `execute: true`는 기존 `search_plan` 역할의 Gemma 또는 Codex 수행자로 점수 **제안**을 만든다. 검토된 사건의 정확한 원문 인용과 기존 기사 본문을 비교 입력으로 제공하고 역할별 실제 요청 예산을 적용한다. 원문 전체는 native 저장소에 남으며 이후 사실 추출에서 선정 블록을 그대로 읽는다. 제안은 `curation_review`로 대기한다. `review_file`을 사용하는 명시적 큐레이터 검토는 같은 원문 블록의 정확한 인용·기존 기사 전체 ID·다섯 조건·항목별0~5점/이유를 확인한다. `execute`와 `review_file`은 동시에 사용하지 않는다. 사실/기사 승인과 별도다.

`curation.select`는 검토한 신규성30/영향25/구체성20/지식 가치15/시의성10을100점으로 환산한다. 최소70·우선85점, 분야5·전체40 상한이며 `max_articles`는 그 안에서 운영자가 정한다. 발표일만으로 감점하거나 기사 수를 채우지 않는다. 과거 미수록 고득점이 오늘 약한 후보보다 먼저 선정된다. 선택은 불변이므로 이후 점수 수정/정책·원문·기사 이력 변경은 새 `run_id`의 풀/선정을 사용한다. 변경되지 않은 점수 검토 판본은 재사용한다.

`curation.advance`는 점수 순서대로 원래 회차/계획의 선정 사건만 native 근거 추출·작성기로 보낸다. 이전 `defer`를 선정하면 같은 원문 회차에 새 명시 사건 판정을 남긴다. `max_items`, 시간, 모델 호출 예산을 공유하며 완료 원고와 다른 원 회차의 checkpoint를 재사용한다. `fact_reviews/editorial_reviews/revision_reviews`는 **candidate_id**별 파일 지도다. 여러 원 회차의 승인 인계는 하나의 `research-curation-publication-handoff/v1`로 합치되 각 native source/사실/편집 승인 검사는 유지한다.

기사에 딸린 용어 승인 외에 이번 회차의 누적 기록을 발행할 때는 `curation.advance.note_review_runs`에 native 승인된 Signals/TrendTopics의 run ID를 명시한다. 승인·검토 파일의 SHA와 사실 근거를 다시 검증하고, 원 회차의 handoff에서 합친 `knowledgeRuns`를 최종 미리보기와 Drive 전송까지 보존한다. 기존 입력의 승인 목록이 달라지면 새 workflow/delivery ID로 진행하며, 완료된 기사와 모델 결과는 재사용한다.

새 브리핑의 `privatePreview`는 이 인계와 명시적 `editionSpec`을 함께 받는다. 선정일이 브리핑 날짜와 같고 정확한 native 승인 원고일 때만 수집 구간 이전 미수록 사건의 첫 소개를 허용한다. 공개 기사/원문 중복, 미래 발표, 원문 관측 cutoff, 수록 이력 변경, 원고 변조는 차단한다. 브리핑 날짜와 원 발표일을 분리하고 기존 사건 ID를 유지한다. 과거 손상/정정 처리와 이미 발행한 기사의 재참조는 기존 경로를 따른다.

### 같은 회차를 통합 실행·재개

`edition.advance`의 `round: true`는 기존 단계들을 `research-round-workflow/v1`로 연결한다. 최초 입력은 `daily_run`, 정확한 `report_path/report_sha256`, 정확한 `edition_path/edition_sha256` 중 하나다. 이후에는 같은 `run_id`와 `round: true`만으로 저장 입력을 읽을 수 있다. 입력·정책·수집 설정·검토된 사건 계획의 SHA가 바뀌면 새 회차를 사용한다. 최초 관계 검토 후 `plan_path/plan_sha256`를 한 번 연결할 수 있고, 이미 연결된 계획을 조용히 교체하지 않는다.

새 MCP 통합 회차와 `research:core --round`는 작성 전에 큐레이션을 요구한다. 관계 검토 뒤 `curation_required`의 다음 입력으로 prepare/evaluate/select를 진행하고 `curation_path/curation_sha256`를 한 번 연결한다. 선정 참조를 조용히 교체하거나 최초 수집 입력을 다시 쓰지 않는다. 이전 원 회차가 함께 선정되면 `curation_ready`와 `curation.advance` 입력을 반환하여 그 사건을 잃지 않는다. 직접 native 사건 API의 기존 동작은 유지하며 이전 고정 입력의 정책을 새 기본값으로 덮어쓰지 않는다. 명시적 기존 경로의 `require_curation: false`는 로컬 planner가 선택할 수 없다.

일일 입력에서 `collect: true`와 `execute: true`를 함께 주어야 실제 수집한다. `execute: false`의 수집은 계획만 저장한다. 미시도 창이 남으면 `collection_pending`과 다음 입력을 반환하며, 모든 창을 시도한 부분 수집은 원 실패를 유지한 채 회차를 고정한다. `collection_config_file`, `collection_max_windows`, `collection_time_budget_ms`로 기존 공통 수집기를 제한한다. 네트워크 권한이 있는 작업이라는 표시가 곧 수집 실행을 의미하지 않는다.

계획 모드에는 수집 창/시간의 실행 제한을 넘기지 않는다. 이 제한을 지정하려면 `collect`와 `execute`가 모두 참이어야 한다. 저장소 내부 설정의 상대·절대 경로는 같은 상대 경로/SHA로 고정하고, 저장소 밖 설정은 기존 경로 관문에서 거부한다. `daily_run`은 실제 한국 실행일에 맞는 `daily-YYYYMMDD-이름` 형식이며, 활성 경로의 검증된 기준 수집 영수증은 선택한 비공개 root에 있어야 한다.

반환값의 `stages`에는 collection/edition/events/knowledge/publication 각각의 상태·정확한 참조·재사용 여부가 있고, `next_inputs`는 관계·사실·편집 검토, 추론 제출, 명시 재시도에 필요한 입력을 구분한다. 기본 `max_items: 4`, `time_budget_ms: 600000`이며 선택적 `max_model_calls`는1~64다. 남은 시간과 모델 호출 예산을 사건 후보·사실 추출·작성에 공유한다. 완료한 사건과 모델 응답은 예산을 새로 소비하지 않으며, 검토 대기·부분 처리·실패가 뒤의 사건을 막지 않는다.

`fact_reviews`, `editorial_reviews`, `revision_reviews`는 기존 명시 검토 파일을 연결한다. 실패 사건은 `retry_groups`로 지정하고, 실패한 로컬 모델 요청의 새 시도는 `retry_failed: true`를 명시한다. 기본 재개는 실패한 요청을 자동 반복하지 않는다. Codex 요청은 기존 `reasoning.pending/read/submit`과 같은 job의 재개를 사용한다. 검토·추론 대기를 승인이나 빈 기사로 바꾸지 않는다.

승인 결과의 온톨로지로 기존 지식 색인을 생성하며 선택적인 `knowledge_selections_file`, `trend_review_runs`, `connection_review_run`의 native 승인을 대조한다. 후속 지식/발행 준비가 실패해도 완료한 사건·색인 참조를 먼저 저장해 다음 실행에서 재사용한다. 재사용 때도 현재 원문·승인·인계 파일을 검증한다. 이 작업의 종점은 정확한 발행 준비 인계이며 정본 수정·Drive 전송·공개·정규 운영 횟수를 만들지 않는다.

```json
{"module":"edition","operation":"advance","parameters":{"run_id":"system-round-20261011-v1","round":true,"execute":false}}
```

독립 CLI는 `node scripts/research-core.mjs --round --run system-round-20261011-v1 --plan-only`다. 기본 경로는 스크립트의 저장소에서 해석하므로 다른 작업 디렉터리에서도 동일 회차를 읽는다. 최초 실행은 `--daily-run` 또는 `--report/--report-sha256` 또는 `--edition/--edition-sha256`를 연결하고, 새 검토를 소비할 때 `--resume`과 해당 검토 파일을 준다. `--max-model-calls`, `--retry-failed`, `--knowledge-selections`는 같은 native 계약으로 전달한다. 이전 고정 회차 모드와 legacy core는 유지하며 둘의 검토 인수를 혼합하지 않는다.

CLI가 직접 읽는 설정·검토 매핑·Drive snapshot·회사 검토 파일은 호출한 폴더에서 먼저 해석한 후 native 수집기의 작업 위치를 저장소로 맞춘다. 원문·회차·계획의 path/SHA 참조는 각 저장 root 기준이다. 실제 계획 실행 예시는 `node scripts/research-core.mjs --round --run system-round-collection-cli-20261011-v2 --daily-run daily-20261011-system-collection-plan-v2 --collect --plan-only`다. 다른 폴더에서는 스크립트의 절대 경로를 사용한다.

### 역할별 실제 요청 예산

Codex 위임의 컨텍스트 상한은131072토큰으로 분리한다. 현재 호스트의 `gpt-6-luna` 메타데이터(context272000) 범위에서 `data/research-model-policy-codex.json`의 `search_plan`에131072 예산을 명시해 긴 기존 기사 대조를 그대로 전달한다. 로컬/Ollama 및 직접 API의32768 상한은 유지한다. 메시지·Schema·출력 여유를 포함한 기존 admission 추정, 요청 SHA, 초과 시 거부, 원문 무절삭과 실제 검토 계약도 유지한다. 설정 변경 전 실패 job은 보존하고 새 job에서 같은 고정 회차·원문을 재사용한다.

로컬 요청은 실제 system/user 메시지와 전송 Schema의 직렬화 크기, 출력 토큰, template 여유를 함께 계산한다. 문자 기반 admission 추정과 API가 보고한 토큰을 구분하며 전체 context 사용 가능성을 인증하지 않는다. 서버의 원문 자동 절삭과 context 이동을 비활성화하고 초과 요청은 생성 전에 거부한다. 추출은 해당 역할의 실제 request factory로 분할하며 원문 블록과 조건을 잘라 맞추지 않는다. 작성에 필요한 검토 사실과 상세가 초과하면 명시 분할/재개 대상으로 남긴다.

완료한 batch·응답은 정확한 입력/모델/정책 참조로 재사용하고, 미완료 batch와 원 실패는 checkpoint에 남긴다. 공유 실행 창이 줄어들면 새 call의 timeout도 남은 시간으로 제한한다. 실제 `TimeoutError/AbortError`의 read-only `DOMException.code`는 원 오류·부분 stream·비용 기록을 보존하는 writable wrapper로 변환한다. 잘못된 JSON, schema 위반, 출력 길이 종료, 미완료 stream을 성공으로 저장하지 않는다.

## 모듈과 입력·출력

| 모듈             | 독립 작업                                                                                 | 입력 → 출력                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `collection`     | `inventory`, `audit`, `scan`, `daily`, `targeted`, `followups`, `report`, `inquiries`                    | 등록 경로·날짜 창·표적 질의·후속 링크 → 원문/parse/수집 영수증/회차 보고서              |
| `parsing`        | `remember_image_review`, `inspect`, `bundle`, `reparse`                                   | 저장 원문·명시적 이미지 검토 → 검증한 parse·원문 묶음·검토 기록                        |
| `edition`        | `freeze`, `read`, `advance`                                                               | 마감된 수집 보고서 → 고정 회차·사건 처리·검토 대기·승인 결과                           |
| `classification` | `extract`, `plan`, `review`, `inspect`, `queue`                                           | 고정 회차·명시적 관계 검토 → 원문 기반 최소 후보·사건 계획                             |
| `curation`       | `prepare`, `evaluate`, `select`, `advance`, `status`, `feedback`                                                | 검토한 오늘/이전 계획·기존 기사 이력 → 근거 있는 점수·선정 사건·native 작성/인계        |
| `selection`      | `prepare`, `reuse`                                                                        | 검토된 사건 계획 → 선별 원문 묶음·기존 승인 원고 재사용                                |
| `evidence`       | `extract`, `inspect`, `review`                                                            | 선별 참조·저장 원문·명시적 사실 대조 → 추출/검토 사실                                  |
| `writing`        | `draft`, `correct`                                                                        | 선별 참조·검증 사실·정확한 교정 파일 → 초안·상세 설명·교정 이력                        |
| `knowledge`      | `explore`, `draft`, `project`, `index`, `read`, `review`, `connections`, `sync`, `status`            | 전문용어 근거·승인 run → 용어 초안·온톨로지·분할 조회·검토 영수증·지속 연결 checkpoint |
| `validation`     | `completeness`, `progress`, `evaluation_prepare`, `evaluation_read`, `evaluation_import`, `evaluation_audit`, `scan`, `reader`, `approve` | 계획 SHA·고정 원문·명시 사람/편집 검토 → WBS·독립 검토 묶음·실제 완료 수·native 승인 |
| `publication`    | `prepare`, `status`, `request_delivery`, `deliver`, `delivery_receipt`, `delivery_status`, `fallback`, `shadow_basis`, `shadow_record`, `shadow_status` | native 승인 인계·예약 invocation·비교 검토·raw capture → 고정 전달 요청·운영 비교·실제 검증 상태 |
| `reasoning`      | `pending`, `read`, `submit`, `execute`                                                    | 원문·역할·출력 Schema로 고정한 요청 → Codex 또는 Ollama의 검증된 정형 결과             |

승인된 미발행 기사는 원문·정확한 prior 승인 run을 대조한 `classification.review`의 `reuse`로 재사용할 수 있다. curation의 `already_featured`는 승인 자체가 아니라 canonical 발행 이력에 그 사건 ID가 있는지 확인한다. 같은 편집 점수에서는 정확한 native 승인 재사용을 새 writer보다 먼저 선택하며, 중요도 점수·반복 페널티·분야 상한·동일 사건 중복 검사는 유지한다. 실제 발행 이력에 있는 `reuse`는 다시 선정하지 않는다.

12개 모듈·65개 작업이다. 기본 MCP와 현재 Codex 등록은 공통 도구5개로 같은 작업들을 호출한다. 명시적 상세 모드는 작업65개와 공통 조회/상태/결과/재개4개를 합친69개다. `classification.inspect`는 기존 후보 장부의 URL/본문/제목 관계 후보를 조회하고 `classification.queue`는 기존 처리 큐의 계획을 저장한다. 새 사건 중심 흐름은 `extract → review → curation.prepare/evaluate/select → selection.prepare`다. `plan`은 모델 없이 메타데이터와 원문 접근을 제공한다. 분류·큐레이션의 모델 출력은 미검토 후보이며 작성/기사 승인을 만들지 않는다.

`knowledge.project`는 검토된 native 승인을 입력으로 기존 온톨로지를 투영한다. 후보의 공동 등장으로 개념 노드나 관계를 생성하지 않는다. 실제 Knowledge·Signals·TrendTopics 갱신과 기존 운영 수용 조건은 원래 승인·반영 경로를 따른다.

새 작성 요청의 리드·설명·분석 `claim_ids`는 제공된 실제 ID의 enum·중복 금지·개수 상한으로 제한한다. 응답의 ID를 자동 교정하지 않으며 과거 generic Schema와 draft fingerprint는 유지한다. 육하원칙의 표시일은 검증된 원문 시각을 한국 날짜로 계산하고, 알려진 원문 날짜를 초안의 `facts.when`으로 대체하지 않는다. 참조 형식이 맞아도 리드 반복·근거 범위·단위·계획/완료 조건은 기존 편집 검토를 통과해야 한다.

OpenAI를 명시 선택한 새 요청은 [공식 Structured Outputs 지원 목록](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas)에서 확인되지 않는 `uniqueItems` keyword만 전송 Schema에서 제외한다. 내부 검증은 원 Schema의 중복 거부를 유지하고, 실제 projection이 달라질 때만 내부/전송 Schema SHA를 구분해 기록한다. 같은 이름의 실제 property·enum·min/max와 기존 generic wire/result 형태는 보존한다. 이 경로의 새 검증은 injected fetch fixture이며 실제 유료 API 수용 검증은 아니다.

### WBS와 독립 평가를 필요한 범위만 읽기

`validation.progress`는 `plan_file: "docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"`를 필수 입력으로 받아 그 한 파일의 SHA와 **시스템 구축12항목**을 주 집계로 읽는다. `completion_scope: system_construction`, `status: current_system_wbs`이며 상위 `required/completed/partial/not_started/rows`는 이 분모다. 현재12완료·부분0이다. [대표 실제 장문 전체 처리·재개 근거](../.local/research/local-ai/runs/system-s3-04-frontiers-pending-20261011-v8/full-source-final-audit.json)와 [현재 WBS MCP 조회](../.local/research/parallel-20261010/common/system-final-wbs-mcp-readback-20261011-v2.json)를 연결한다. 문서 라벨 조회이며 `evidence_verified: false`를 유지한다. 전체 원문/온톨로지 스캔·네트워크·모델·운영 승인을 수행하지 않으며 문서가 바뀌면 새 module job을 사용한다.

이전22개4완료·16부분·2미착수는 `operational_acceptance`의 `completion_scope: post_build_operational_acceptance`로 보존한다. 기사 장부·과거 원문 잔량·독립60사례·공개 전환·실제7회는 시스템 완료 분모에서 제외한다. 새 시스템 표가 누락/중복/잘못된 상태나 이전 WBS 참조를 포함하면 `invalid_system_wbs`·주 분모0과 issues를 반환하며 기존 운영 집계로 성공을 대신하지 않는다. 시스템 표를 아직 포함하지 않은 역사 문서는 기존 `current_plan_wbs/operational_acceptance` 조회를 유지한다.

선택적인 `workflow_id`를 주면 마지막 설치 checkpoint의 상태·수치·index·최대20개 차단 작업과 다음 `knowledge.status` 인수를 함께 반환한다. 미등록 workflow는 수치 `null`이며 root를 만들지 않는다. `scope: last_installed_checkpoint`, `current_canonical_checked: false`, `semantic_review_performed: false`를 유지하므로 저장 실행 결과를 최신 정본 재검토로 해석하지 않는다. `workflow_id`가 없으면 기존 계획 조회 형태를 유지한다.

선택적인 `evaluation_packet_run`은 준비된 원문 검토 packet의 SHA·split·원문/parse 참조·실제 독립 검토 제출 무결성을 검사하고 준비/제출/잔량을 나눠 반환한다. 묶음 미준비는 `null/not_prepared`, 손상·변경은 오류이며0건으로 숨기지 않는다. 원문이나 정답 payload는 진행 결과에 노출하지 않고 사람 판정·모델 품질·운영 승인을 만들지 않는다.

선택적인 `publication_run_id`는 지정한 native 전달 요청의 `next_actions`를 함께 반환한다. `user_decisions`, `external_requirements`, `local_requirements`, `failures`와 exact request/handoff/preview/plan 참조를 분리한다. 이 조회는 기존08시 예약의 상태만 읽고 재개·새 예약·release·Drive/공개를 수행하지 않는다. 새 시스템 표의 `work_queue`는 이전 완료 묶음과 운영 입력5종류의 집계이며 `scope: completed_batches_and_operational_inputs`, `is_primary_completion_scope: false`다. 상위 시스템12개·완료 묶음14개·운영22개와 실제 저장 검토 수를 서로 합산하지 않는다.

기존 CLI `delivery-status`의 `overall_completion`도 같은 시스템 분모·completion_scope를 사용하고 이전 운영 상태는 별도 `operational_acceptance`로 제공한다. percent는 완료 행 비율(`percentage_basis: completed_wbs_rows`)이며 공수·품질·실제 운영 성공률이 아니다. 출력/원문/승인 관문은 이 WBS 변경으로 완화하지 않는다.

```json
{"module":"validation","operation":"progress","parameters":{"plan_file":"docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md","workflow_id":"knowledge-linking-system","evaluation_packet_run":"evaluation-human-60-source-first-20261011-v1","publication_run_id":"parallel-publication-delivery-20261011-preview-v2"}}
```

새 writer·source-bound editorial author·reader는 같은 사실 ID와 같은 내용어로 리드를 다시 쓰는 설명을 차단한다. 수치·부호·단위·부정·조건·별도 상세는 삭제하지 않으며 새 단어가 있다는 이유로 유효한 분석이라고 승인하지 않는다. 기존 draft fingerprint·draftProblems·native 승인은 유지한다. 저장된 개발 응답의 `evaluation quality` 조회는 wire `num_ctx`와 native API 관측을 비교하며 API 보고값이 맞아도 전체 사용 가능 context를 인증하지 않는다.

`publication.delivery_status`의 `next_actions`도 같은 남은 입력을 제공한다. 완료된 native preview의 prepare/release는 기존 generation checkpoint·승인/handoff·현재 projection·출력 bytes를 읽어 소비하고 다시 렌더링하지 않는다. generation의 관측 시점/input hash와 consumer의 시점/구현 SHA는 별도다. 손상·원문/승인/출력 변경은 거부하며 미완료 preview는 기존 준비 경로를 따른다. 전달 준비는 release 승인이 아니다.

`validation.evaluation_prepare`는 연구 root 상대 `selection_file`과 `run_id`로 원문 판본·parse·개발/보류 split을 고정한 참조 묶음을 만든다. 원문 payload를 복사하거나 기존 정답·모델 출력을 검토 화면에 넣지 않는다. `evaluation_read(packet_run, case_id?)`가 지정 사례의 정확한 본문·표·위치 참조를 제공한다. `evaluation_import(run_id, packet_run, review_file)`는 실제 원문을 읽은 사람의 명시 검토만 native 평가 정답으로 가져오며 자동 운영자가 호출할 수 없다. `evaluation_audit(packet_run?)`는 묶음 준비와 실제 독립 사람 판정을 별도로 센다. 이전 개발 자료는 보류로 바꿀 수 없다.

`publication.shadow_basis`는 기존 회차의 저장 수집 근거를 고정한다. `shadow_record`는 실제 예약 invocation과 명시 비교 검토에 결속된 기록을 등록하고, `shadow_status`는 서로 다른 완료 회차를 세는 읽기 전용 조회다. 별도 예약을 만들거나 과거 worker 완료를 새 운영 횟수로 바꾸지 않는다. 기존 경로 발행·새 결과 비공개 비교와 지원 운영 전환 후 발행을 구분한다.

`publication.fallback`은 `run_id`, 연구 root 상대 `review_path`, 파일 bytes의 `review_sha256`로 이미 승인된 같은 회차의 legacy 경로를 명시 선택한다. 원 native 전달 요청·비공개 미리보기·legacy release/미리보기·실제 Drive 읽기 근거를 고정하고 원 실패·실행 기록은 보존한다. 실행 중 worker, 미확인 쓰기, 불명확한 push 결과, 오래된 Drive 근거는 선택을 차단한다. 선택 후 새 run/코드 지문으로 같은 회차나 사건을 native 경로에 재진입시키지 않는다. 이 선택은 원격 복구·발행을 실행하거나 운영 복귀 시험을 완료한 결과가 아니다. 자동 로컬 운영자는 이 명시 판단을 제출할 수 없다.

`collection.inventory`는 언어·지역·분야·기술/기업 조사 축·자료 종류와 접근 검토를 함께 제공한다. `access_observation.reviewed_at`은 저장된 접근 검토 시각이며 새 원문 수집 시각이 아니다. `url_matches_current`와 `audit_reference`를 확인하고, 경로 목록/접근 관측을 기사 근거·사건 선별 승인으로 계산하지 않는다.

출처 등록의 선택적 `publisher_country`는 자료 발행 기관의 국가, `regulatory_jurisdiction`은 공시·규제 적용 관할이다. 각각 `{value, official_evidence: {url, quote}}` 또는 명시적 `null`을 받고 근거 URL·인용이 없는 선언은 거부한다. 목록은 선언을 `declared`로, 미기재를 `null/unknown`으로 제공한다. 언어·도메인·기업 본사로 추정하거나 공통 recipe에서 물려받지 않는다. 등록 목록의 선언은 실제 원문 검증·접근 성공·취재 coverage가 아니다. 기존 경로에 새 값이 없으면 수집 입력은 그대로 유지한다.

`collection.targeted(run_id, mode, daily_run?, observation_day?, report_path?, report_sha256?, languages?, slot_ids?, max_queries?)`는 등록 출처와 공통 무료 검색을 사용한다. `max_queries`는1~8이고 `mode`는 `plan-only/execute/resume`다. 일일 run, 관측일, 정확한 저장 보고서 중 하나만 입력한다. 저장 보고서는 native 경로와 SHA를 함께 전달하며 원 수집 증거와 관측 시각을 대조한다. 일일 수집 영수증이 없는 registry-only 계획을 완전한 조사 근거로 올리지 않는다. provider 실패·실제 빈 결과·미등록 탐색 후보를 분리하고 같은 실패를 자동 재시도하지 않는다.

부분 수집 칸에서는 성공한 경로를 다시 검색하지 않고 `failed_route_ids`와 `pending_route_ids`를 대상으로 한다. RSS 전달 서버와 실제 발행 사이트가 다르면 등록된 `publisher_id`가 명시 `allowed_hosts`에 있는 경우에만 발행 사이트를 검색한다. 검색의 `source_url`은 실제 검색 호스트, `source_listing_url`은 원 RSS 주소이며 원 경로 ID와 복구 대상은 유지한다. 같은 발행 사이트의 여러 RSS 전달 경로는 하나의 검색 범위로 묶는다. 등록하지 않은 호스트나 회사 ID를 도메인으로 추정하지 않는다. 계획 생성은 새 검색·원문 취득·coverage 완료가 아니다.

다국어 또는 `registered-source` 질의는 설치된 기존 Yahoo provider를 명시 선택해 언어와 month 요청 범위를 유지한다. 영문 일반 탐색의 기존 경로는 유지한다. `primary_engines/provider_requests`로 선택·시각·loopback HTTP·빈 결과·provider 실패를 보존하며 loopback200을 upstream 원문 확보로 해석하지 않는다. DDG parser/Google403을 먼저 반복하거나 정책을 우회하지 않는다. 실제0후보는 coverage false이며 별도 사건/원문 검토가 필요하다.

`collection.followups(run_id, mode, candidate_key?, parent_material_id?, parent_source_run?, handoff_file?, source_run?, target_urls?, limit?, inquiry_plan_path?, inquiry_plan_sha256?, question_id?)`는 부모 원문 블록에 있는 후속 링크만 계획하거나 수집한다. `mode`는 `plan-only/reuse/collect`, `limit`은1~8이다. 정확한 원문·parse·인용 위치를 고정하고 저장 원문을 우선 재사용한다. 추가 취득에서도 대상 robots·접근 정책은 유지하며 `policy_recheck_limit: 0`으로 관련 없는 기존 차단 출처 재확인을 실행하지 않는다. 직접 collect CLI의 `--policy-recheck-limit`은0~3으로 제한하고 미지정 시 기존 기본값을 유지한다. 후보와 원문은 별도 사실·사건·편집 검토를 거친다.

native 질문 경로는 `collection.inquiries`가 반환한 `followup_parents[].next_parameters`를 그대로 전달한다. `parent_material_id`와 질문 계획의 정확한 경로·SHA·질문 ID가 필요하며 candidate/handoff/부모 수집 run과 함께 사용할 수 없다. 현재 검토/관측에서 직접 인용한 부모 material의 원문 버전·parse·raw SHA를 대조한다. canonical 후보 등록이나 날짜·정체성 승인을 대신 생성하지 않는다. 입력 변경은 실패로 보존하고, 완료 plan-only를 재사용한다. 기본 compact5도구의 `research_execute`로 같은 모듈 작업을 호출한다. 오래 실행 중인 서버가 이전 계약을 노출하면 다음 MCP 연결에서 현재 코드를 읽어야 한다.

## 운영자와 추론 수행자 교체

공유 Ollama에서 다른 요청의 대기도 요청 시간에 포함된다. 기본 호출 제한300000ms는 유지하며 역할 정책과 사실 추출기의 명시 `call_timeout_ms`는 같은1..3600000ms 범위를 받는다. 총 역할/추출/회차 예산은 별도로 적용한다. timeout을 같은 실패의 자동 재시도로 바꾸지 않고 완료 배치·실패 영수증·남은 블록을 저장한 뒤 명시 재개한다. 예산/정책 SHA가 바뀌면 새 binding을 사용하며 이전 실행의 승인·provenance를 고치지 않는다.

Node fetch의 별도 HTTP header/body 제한도 Ollama의 해당 요청 예산에 맞춘다. Ollama 전용 dispatcher와 양의 `AbortSignal` 제한을 함께 사용하며 전역 dispatcher나 원문 collector를 변경하지 않는다. 직접 의존성은`undici@7.30.0`(Node >=20.18.1)이며 기존 프로젝트 Node >=22 범위에 포함된다. 새 native 실패는 하위 HTTP 오류 코드/메시지를 보존한다. 원 실패에서 누락된 원인을 소급 채우지 않는다.

`TKG_OLLAMA_KEEP_ALIVE`는 해당 클라이언트 실행의 유휴 보존 시간이다. 미지정 기본값은`5m`, 허용값은 양의 정수와`s`/`m`을 붙인1..300초다. 예를 들어`TKG_OLLAMA_KEEP_ALIVE=1s node …`는 모델이 유휴 상태가 된 뒤 만료되도록 요청한다. 강제 해제값0이나 무기한 보존은 이 클라이언트에서 거부한다. 다른 프로젝트의 실행 중 모델·Ollama 서비스·시스템 설정은 변경하지 않는다. [공식 Chat API의 keep_alive](https://docs.ollama.com/api/chat)를 사용하며 실제 요청값과 응답 provenance에 기록한다.

도구를 고르는 운영자와 도구 안에서 글을 읽고 작성하는 추론 수행자를 독립적으로 선택한다. 운영자는 Codex 또는 로컬 MCP 실행기이고, 추론 수행자는 역할별 정책의 `ollama` 또는 `codex`다. 네 조합 모두 같은 모듈·원문·작업 상태·검토 관문을 사용한다.

| 선택                    | 설정                                             | 실행                                                                     |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Codex 운영 + 로컬 추론  | 기본 `data/research-model-policy.json`           | Codex가 MCP 도구 호출; 내부 추론은 설치된 Gemma                          |
| Codex 운영 + Codex 추론 | `--policy data/research-model-policy-codex.json` | 추론 요청 대기 → Codex가 입력을 읽고 정형 결과 제출 → native worker 재개 |
| 로컬 운영 + 로컬 추론   | `research:operator`, 기본 정책                   | Gemma가 MCP의 다음 도구를 결정하고 로컬 추론 도구 실행                   |
| 로컬 운영 + Codex 추론  | `research:operator`와 Codex 정책                 | 로컬 운영자가 대기 지점까지 진행; 제출된 결과로 명시 재개                |

기본 모델은 `gemma4:31b-mlx`다. `search_plan`, `fact_extract`, `article_write`, `concept_write`는 `think: false`, `evidence_compare`는 설치된 Gemma가 지원하는 `think: true`를 사용한다. 역할별 컨텍스트·출력·시간 예산은 유지한다. 모든 역할을 일괄 바꿀 필요 없이 각 역할의 provider를 선택할 수 있다. 정책을 실행 중 몰래 바꾸지 않는다. 정책 SHA와 입력이 바뀌면 새 native job/run을 사용한다. 이미 고정된 Codex 요청을 Ollama에 넘길 때는 `reasoning.execute`를 사용하면 같은 원문 메시지/Schema·context/output 예산을 이어받는다. 실제 로컬 모델과 thinking은 현재 로컬 역할 정책에서 선택하고 원 Codex 요청·SHA와 별도로 기록한다. 다른 모델을 명시하면 원 요청의 thinking을 사용한다. 이전 Qwen 실행의 정책·완료 응답은 당시 바인딩 그대로 보존한다.

Codex 위임은 현재 대화의 Codex가 수행하는 계약이다. MCP 서버가 Codex 세션을 자동으로 만들거나 ChatGPT 구독으로 API를 호출하는 기능이 아니다. 서버는 `.local/research/local-ai/reasoning-tasks/`에 원문 입력·역할·설정·출력 Schema·정확한 SHA를 저장한다. 결과 미제출은 `waiting_for_reasoning`으로 남으며 모델 실패 예산을 소비하지 않는다.

위임 결과를 이어가는 순서:

1. `research_job_status`가 돌려준 `reasoning_task`의 `task_id`와 `request_sha256`를 사용한다. 내부 추출 run은 회차 run과 다를 수 있다.
2. `reasoning.read`의 `next_offset`이 null일 때까지 입력·출력 Schema를 읽는다.
3. Codex는 원문을 읽고 `reasoning.submit`에 `executor: "codex"`와 정형 `output`을 제출한다. Ollama로 넘기려면 같은 참조로 `reasoning.execute`를 실행한다.
4. 제출/실행 worker가 완료된 뒤 원래 job에 `research_job_resume`을 호출한다. 완료 결과는 재사용한다.

사실 추출은 같은 job 안에서도 여러 본문 묶음으로 나뉜다. 매번 현재 요청의 `block_key` 범위 안에서만 결과를 제출하고, 재개 후 다음 `reasoning_task`가 반환되면 그 요청을 읽어 이어간다. 전체 원문 사실을 첫 요청에 몰아넣거나 첫 묶음 제출을 전체 추출 완료로 세지 않는다. 원고 본문의 한국시간 표시일과 기사 승인·후보 장부의 원문 달력 날짜는 구분한다. 승인 메타데이터는 실제 원문 날짜를 보존하며 한국시간 변환만으로 원 날짜를 바꾸지 않는다.

잘못된 JSON Schema, 다른 입력 SHA, 기존 결과 덮어쓰기를 거부한다. Codex의 모델 이름과 수행자 정보는 제출 귀속이고, 로컬 실행은 실제 Ollama 응답을 별도로 보존한다. 결과 제출은 사실·관계·편집 승인과 독립적이다. 사건 후보·사실 추출·기사·용어의 원래 검토/승인 지점은 유지한다.

## MCP 간소화 모드

서버 기본값과 현재 Codex 등록은 compact다. 다음5개만 노출하며, 기존 작업별 도구를 사용하는 클라이언트에는 `--tool-profile detailed`로 상세 호환 모드를 제공한다. 실제 Codex 초기화에서5개 이름과 조회 오류 없음까지 확인했다.

| 공통 도구             | 역할                                                      |
| --------------------- | --------------------------------------------------------- |
| `research_modules`    | 가벼운 작업 목록 또는 선택한 작업의 원래 입력 Schema 조회 |
| `research_execute`    | `module`, `operation`, `parameters`로 등록 작업 실행      |
| `research_job_status` | 실행·대기·완료·실패 상태 조회                             |
| `research_job_result` | 저장 결과를 페이지별로 읽고 SHA 확인                      |
| `research_job_resume` | 원인 해결 또는 결과 제출 후 명시 재개                     |

```bash
node integrations/research-mcp/server.mjs \
  --repo /Volumes/X5Storage/Projects/Personal/Apps/tech-knowledge-garden \
  --tool-profile compact
```

예를 들어 `collection_inventory`는 간소화 모드에서 `research_execute`의 `{"module":"collection","operation":"inventory","parameters":{}}`로 호출한다. 실행 전에 기존 작업별 Schema로 다시 검증하며 비활성 모듈 호출과 해당 모듈의 상태/결과/재개를 거부한다. `--modules collection,parsing`으로 활성 모듈도 좁힐 수 있다. `--operations collection.inventory,parsing.inspect`로 해당 모듈 안의 허용 작업을 제한하면 실행뿐 아니라 그 작업 밖의 job 상태·결과·재개도 거부한다. 작업 목록은 시작 시 고정한다. 이미 연결된 Codex의 도구 목록은 자동 교체되지 않으며 새 연결 또는 설정 다시 읽기가 필요하다.

### 필요한 계약만 조회하기

`research_modules`는 다음 JSON으로 호출한다. 인수 없이 호출하는 기존 전체 Schema 조회도 유지한다.

```json
{ "include_schemas": false }
```

```json
{ "module": "collection", "operation": "inventory" }
```

첫 호출은 Schema를 제외한 작업 목록, 둘째는 실제 inventory의 입력 계약만 반환한다. 선택된 서버 밖의 모듈/작업은 조회할 수 없다. 2026-10-10의45작업 catalog에서 측정한 당시 자동 선택36작업은18,927자, `collection.inventory` 하나는238자였다. 당시53작업의 입력 크기나 전체 모델 prompt·실제 토큰·지연 측정값을 뜻하지 않는다.

## 독립 로컬 운영 실행기

```bash
npm run research:operator -- \
  --run inventory-example \
  --task '등록된 수집 경로 현황을 한 번 조회하고 결과를 확인한 뒤 종료한다.' \
  --modules collection --operations collection.inventory --max-steps 2 --timeout-ms 180000
```

공식 MCP Client가 같은 stdio 서버에 연결한다. 기본 Gemma의 다음 도구 선택은 고정 JSON을 검증한 뒤 실행하며 완료된 job·결과·체크포인트를 이어받는다. 실패/중단/추론 대기/검토 대기에서 멈추고 원문 수집부터 반복하지 않는다. 모델의 선택만으로 사실·편집·관계 승인, 임의 shell/파일 작업, 운영 배포를 실행하지 않는다. 실행 범위·재개·실패 보존은 [운영 실행기 사용법](../integrations/research-mcp/OPERATOR.md)을 따른다.

## 독립 CLI

Node 22 이상에서 실행한다. 작업 루트는 실행 파일의 실제 저장소를 기본값으로 사용하며 worker의 cwd를 해당 저장소로 고정한다. 다른 디렉터리에서 절대 실행 파일 경로로 호출해도 같은 설정을 읽는다.

```bash
node scripts/research-module.mjs list
node scripts/research/modules/collection.mjs list
node scripts/research/modules/collection.mjs inventory --job module-inventory --background
node scripts/research-module.mjs status --job module-inventory
node scripts/research-module.mjs result --job module-inventory --limit 16000
```

각 모듈은 `node scripts/research/modules/<module>.mjs <operation>` 또는 `npm run module:<module> -- <operation>`으로 실행한다. 통합 명령은 `node scripts/research-module.mjs run <module> <operation>`이다. JSON 입력은 `--input <저장소 상대 파일>`·`--input -`(stdin)·`--json '<JSON>'` 중 하나다. 입력 파일과 리뷰 파일은 저장소 상대 경로, 회차·계획·선별 참조는 연구 root 상대 경로다.

```bash
node scripts/research-module.mjs run collection report \
  --json '{"run_id":"daily-20261009-acquisition-55-v1","supplement_runs":["acquisition-wiley-hiphi-probe-20261009-v1"]}' \
  --job module-report --background
```

뒤 단계는 앞 단계 결과의 정확한 `path`·`sha256`를 전달한다. 임의 run만으로 `evidence.extract`나 `writing.draft`를 호출할 수 없다.

| 단계                           | 필수 입력                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `collection.scan`              | `run_id`, `channel`, `since`, `until`; 선택적 `policy_recheck_limit`0~3. 명시0은 이번 수집과 무관한 보류 정책 재확인을 하지 않음 |
| `collection.report`            | `run_id`; 기존 일일 `supplement_runs` 또는 저장 출처별 `source_runs: [{run_id, policy_recheck_limit?}]`와 선택적 `held_sources`. 완료 원문·실패 창을 다시 취득하지 않고 정확히 고정 |
| `edition.freeze`               | `run_id`, `report_path`, `report_sha256`                                                                                       |
| `classification.plan`          | `edition_path`, `edition_sha256`                                                                                               |
| `classification.extract`       | `run_id`, 위 회차 참조; 선택적으로 `material_ids`, `offset`, `max_items`                                                       |
| `classification.review`        | `run_id`, 위 회차 참조, `review_file`                                                                                          |
| `selection.prepare`            | `run_id`, `plan_path`, `plan_sha256`, `group_id`                                                                               |
| `evidence.extract`             | 반환된 `writer_run`을 `run_id`로 사용, `selection_path`, `selection_sha256`                                                    |
| `evidence.review`              | 동일 `run_id`, 원문 대조한 `review_file`                                                                                       |
| `writing.draft`                | 동일 `run_id`, `selection_path`, `selection_sha256`                                                                            |
| `validation.approve`           | 동일 `run_id`, 정확한 초안과 근거에 대응하는 `review_file`; 수정은 `revision_file` 추가                                        |
| `edition.advance`              | `run_id`, 회차 참조; 판정 계획·그룹별 사실/편집/수정 검토 파일·기존 온톨로지 참조; 선택적 `connection_review_run`              |
| `publication.prepare`          | `run_id`, `workflow_path`, `workflow_sha256`; 선택적으로 `group_ids`                                                           |
| `publication.status`           | 인계 `run_id`; native 승인·원문을 다시 검사하는 읽기 전용 조회                                                                 |
| `publication.request_delivery` | `run_id`, `handoff_path`, `handoff_sha256`; 선택적 `preview_run_id`, `edition_spec_path`·`edition_spec_sha256` 쌍              |
| `publication.deliver`          | `run_id`, `execution_id`, `stage`, `release_path`, `release_sha256`; 단계별 acquisition/snapshot/readback의 root 상대 path·SHA |
| `publication.delivery_receipt` | 같은 run/execution과 `event_id`, `acquisition_path`, `acquisition_sha256`; 실제 연결 도구 capture 제출                         |
| `publication.delivery_status`  | `run_id`; 선택적 `source_capture_run`, `source_reconcile_run`. 전달 대기·Drive 원본의 시각/차이·전달 준비와 부족 근거를 각각 조회 |
| `validation.progress`          | `plan_file`; 선택적 `workflow_id`, `evaluation_packet_run`, `publication_run_id`, `source_capture_run`, `source_reconcile_run` |
| `knowledge.sync`               | `workflow_id`; 선택적으로 root 상대 `basis_file`·`article_links_file`, `max_items`0~256, 정확한 `recover_lock_owner`           |
| `knowledge.status`             | `workflow_id`; 선택적으로 대기 상태 필터와 `offset`/`limit`1~100의 읽기 전용 조회                                              |

`publication.request_delivery.preview_run_id`를 지정하면 exact 승인 인계에서 비공개 미리보기를 생성해 기존 전달 요청에 연결한다. 새 회차 spec은 path·bytes SHA를 함께 명시하고, 소급 회차는 기존 인계의 회차를 사용한다. 요청·승인·지식 선택·준비 입력·산출 manifest·파일 SHA를 고정하며 완료 산출물은 다시 렌더링하지 않는다. `delivery_status`는 준비 상태와 Drive/공개 상태를 분리한다. 실패한 preview의 입력이나 실행 코드를 바꾸려면 새 request와 preview ID를 함께 사용하고 원 실패·원 선택·승인 계보는 보존한다.

`source_capture_run`을 지정한 조회는 이미 확보한 `drive-source/<run>/capture.json`의 정확한 source snapshot·raw receipt·파일 bytes를 검증하고 현재 작업본과 대조한다. 관측 후10분이 지나면 `freshness: stale`, 차이가 있으면 `working_copy_matches: false`로 반환한다. 읽기 전용 조회가 원격 파일을 다시 내려받거나 승인·전달을 만들지는 않는다. missing 또는 변경된 capture는 오류이며 미확인 원본을 확보됐다고 채우지 않는다. 기본 도구5개를 유지하며 현재 내부 작업은 목적별 보강을 포함한65개다.

`source_reconcile_run`은 `drive-reconcile/<run>/reconciliation.json`의 원 capture·지식 checkpoint·native 승인·고정 전달 bytes를 읽는다. 기존 승인으로 재현한 파일 수와 실제 보류 파일·현재 작업본 차이를 분리하고 `stored_source_reconciliation`으로 반환한다. 과거 준비 시점의 구현 SHA와 현재 reader의 구현 SHA도 분리한다. 로컬 전달 준비가 완료돼도 stale 원본을 새 관측으로 바꾸거나 release·업로드를 허용하지 않는다. 전달 준비와 원격 적용은 다른 단계다.

실제 Drive raw를 연결할 때는 기존 원격 capture의 비공개 acquisition 파일을 `research-authoring.mjs capture-source --root <research-root> --capture-run <새 run> --acquisition <acquisition-json>`에 전달한다. `files[].payload.raw`의 정확한 UTF-8 bytes와 원격 ID·폴더·시각을 검증한 뒤 기존 native source snapshot·readback을 생성한다. 로컬 `vault`가 같은 내용이라고 가정해서 원격 본문을 대체하지 않는다. 작업본의 차이는 별도 비공개 diff로 남기며 canonical 파일은 변경하지 않는다.

비공개 미리보기의 개념 탐색은 기존 승인된 전문용어와 map 검토를 확인해 누락된 링크를 보완한다. 정의·승인·정본을 새로 작성하지 않는다. 소급 자료의 source 표지는 정확한 보존 표지·완전 분류·검토 기사와 일치할 때만 유지한다. 과거의 명시적 null cutoff는 전체 검토된 기사 또는 원0건 기록과 정확히 일치하는 경우에만 그대로 보존하며 현재 회차의 누락·가짜 날짜를 허용하지 않는다.

### 회차 밖에서 승인된 기사의 지식 연결

`knowledge.sync.article_links_file`은 기존 native basis에 아직 없는 **이미 승인된 기사**를 연결한다. research root 상대 JSON 파일에 `schema: "research-knowledge-article-links/v1"`, 현재 `basis: {path, sha256}`, `articles: [{run, event_id, files}]`를 기록한다. `files`에는 `loadApprovedOntologyInput`의 `file_hashes`를 그대로 사용한다. 원고·검토 사실·문서·parse·편집 검토·승인6파일과 해당될 때 전문용어 검토 파일까지 고정하며, 파일에서 계산한 SHA를 임의의 승인 표시로 대신하지 않는다.

```sh
node scripts/research-module.mjs run knowledge sync \
  --json '{"workflow_id":"knowledge-linking-system","article_links_file":"runs/<native-run>/article-links.json","max_items":40}'
```

MCP에서는 같은 인수를 `research_execute`의 `module: "knowledge"`, `operation: "sync"`로 전달한다. 기본5개 도구와65개 내부 작업을 사용한다. 선택 파일 자체의 SHA도 module job에 고정한다. source-only 자료, 다른 basis·기사 ID·승인 SHA와 승인 계보 없는 사건 교체는 거부한다. 다음 호출은 연결을 저장 checkpoint에서 재사용하므로 선택 파일을 반복 전달할 필요가 없다. 새로운 native basis가 도착해도 기존 연결과 사건·판본 이력을 보존하며, 영향 항목만 다시 확인한다. 이 접점은 사실·기사·지식 승인이나 canonical·공개 발행을 수행하지 않는다. 저장 경로와 전체 규칙은 [온톨로지 workflow](ONTOLOGY_PROJECTION.md#지속-연결-workflow)를 따른다.

판본 변경은 개별 task의 원문·승인6파일·지식 노트와 Signals가 참조하는 기존 회차 SHA로 감지한다. 처리 후 `latest.json`을 설치하기 직전에도 회차 파일을 확인한다. 처리 중 회차·원문·승인·구현이 바뀌면 이전 정상 checkpoint를 유지하고 새 입력으로 재개해야 한다. 날짜가 같은 새 판본도 SHA가 다르면 영향 항목을 다시 검토한다.

Topic의 `ready` 판정은 실제 읽기 색인과 같은 `validateTrendRecords`를 사용한다. 해설의 서로 다른 사건·날짜, 연결된 관측과 정의, 해설과 관측의 검토 시점을 확인한다. 부적합한 Topic은 `native_topic_projection_invalid`로 내부 차단하고 다른 준비된 지식의 색인은 유지한다. 새 근거를 실제로 검토한 명시적 native 판본이 도착하면 해당 항목을 재개한다. 공통 검증기의 SHA도 작업 지문에 포함한다.

Signals의 `event_date`는 정확한 원문 게시일을 유지한다. 선택적인 `occurred_at`은 같은 사건의 검증된 `effective_period`와 일치하는 실제 날짜이며, 승인된 기사와 날짜가 상충하거나 계획만 있는 날짜는 거부한다. 과거 노트가 행사일을 `event_date`에 저장한 경우에는 그 날짜를 `occurred_at`으로 보존하는 명시적 native 검토에서만 분리하고, 이전 값과 SHA를 판본 이력에 남긴다. 날짜 helper와 그 의존 구현의 SHA도 저장 작업의 지문에 포함한다.

날짜만 저장된 관측과 게시 시각까지 보존한 native 사실은 연결 검증과 읽기 색인의 추세 투영 모두에서 `samePublicationDate(event_date, claim.published_at)`로 출처의 달력일을 대조한다. 관측 날짜·기사 날짜·원문 시각과 사건 ID를 바꾸지 않으며, 다른 날짜나 다른 사건의 근거는 계속 차단한다.

## 사건 판정과 선별

`classification.plan`은 원문의 제목·발표일·판본·parse·블록 접근을 제공한다. 결과는 `relationship_review`이고 `writer_allowed=false`다. 전체 원문에서 의미를 읽어 사건을 판정하는 일을 제목 유사도나 자동 URL 병합으로 대신하지 않는다.

관계 검토 파일의 schema는 `research-event-decisions/v1`이다. 모든 필드의 실제 제약은 `scripts/research/event-pipeline.mjs`의 `eventReviewSchema`를 따른다. 파일에는 다음을 기록한다.

- `reviewer`, `reviewed_at`, `events`.
- 사건마다 `group_id`, `identity`의 `who/action/object/occurred_at/external_id`, `action`, `reason`, `materials`. 모르는 사건 날짜·외부 식별자는 명시적 `null`이다.
- 원문마다 정확한 `material_id`, 역할(`primary/same_event/supplement/counter_evidence`), 사용할 `block_ids`, 실제 원문에 포함된 인용 `evidence`.
- 주 원문은 하나다. `identity_marker`·`event_action` 근거가 필요하다. `same_event` 원문은 두 측의 블록·인용·결론을 담은 `matches`로 같은 주체/식별 대상과 행위를 대조한다.
- 기존 사건과 비교할 때는 `prior_run`과 승인 원문의 정확한 `parse_id`·블록·인용을 담은 `prior_matches`를 사용한다. 최신 native 승인 원고를 다시 검증한다.

`write`는 신규 기사, `update/correction`은 기존 기사의 수정 원고를 선별한다. `reuse`는 대조한 기존 승인 원고를 반환하고 새 모델·기사·날짜를 만들지 않는다. `defer`는 작성하지 않는다. `write`에 기존 사건 비교를 넣으면 별도 후속 사건으로 기록하며 새 사건 ID가 필요하다. 기존 승인 원문을 다시 사용해 작성하려면 native 승인과 정확한 원문을 대조한 `prior_run/prior_matches`가 필요하다. URL·제목·동시 등장만으로 기존 사건 판정을 대신할 수 없다.

수정 승인에는 `research-event-revision-review/v1` 파일이 필요하다. `action`, `prior_run/current_run`, `event_id`, `selection_sha256`, `prior_article_sha256`, `draft_id`, 검토자·이유·시각과 원문/이전 기사/최종 원고/동일성/날짜/수치 확인을 기록한다. `changes`에 이전 공개 사용 사실 **전부**를 `retained/corrected/removed`로 판정하고 현재 사용 `claim_id`를 연결한다. 유지한 사실의 문장·계획/완료 상태·적용 기간·수치 조건이 바뀌면 정정 판정이 필요하다. 기존 전문용어 연결 삭제도 명시적 `concept_changes`가 필요하다. 기사 ID와 원 발표일을 유지하며 과거 원고·근거와 수정 영수증을 함께 보존한다.

동일 계획의 사건 그룹을 다른 run 이름으로 다시 선별해도 최초 `writer_run`·선별 SHA를 반환한다. 소비자는 반환된 run을 사용해야 한다. 한 원문의 여러 사건은 별도 그룹과 근거 블록 범위로 구분한다. 원문의 전문은 그대로 보존한다. 다른 사건의 검증 사실이 남아 있으면 작성 전에 원문 대조 파일에서 보류/제외하고, writer가 해당 블록 범위 밖의 사실을 발견하면 모델 준비 전에 차단한다.

서로 다른 출처를 모아도 계획·집행, 수치 조건, 반대 근거, 회사 귀속을 합쳐 없애지 않는다. 같은 회사 발표의 언어판이나 전재는 독립적 교차 검증으로 세지 않는다.

`evidence.extract`는 기존 native 추출·검증기를 사용한다. 동일 판정 계획에서 선택한 사건들이 공유하는 원문의 블록 범위를 합쳐 **사실만 한 번** 추출하고, 사건마다 그 범위 안의 사실을 연결한다. 전문 parse는 보존하며 모델에는 선택한 블록만 공급한다. 다른 사건까지 걸친 사실은 비공개 범위 검토 대상으로 남긴다. 원문 내용·발표일·정확한 인용이 같은 기존 승인 사실도 새 사실 검토를 거쳐 재사용한다. 원문/parse·블록·정책·코드 SHA가 달라지면 캐시를 자동 승인 근거로 사용하지 않는다.

최소 사건 추출은 `search_plan`, 사실 추출은 `fact_extract`, 기사는 `article_write` 역할의 기존 모델 정책을 따른다. 정규 Codex 경로는 `data/research-model-policy-codex.json`의 `gpt-6-luna` 요청을 사용한다. 원문의 숫자가 아닌 지역·제품명을 수치로 추출한 경우 등은 비공개 후보 문제로 보존한다. 구조 검사 성공을 사실 확인으로 올리지 않는다.

## 회차 진행과 기존 자동화 연결

`edition.advance`는 판정 계획이 없으면 `relationship_review`에서 멈춘다. `execute/propose=true`일 때만 최소 사건 추출 모델을 호출한다. `offset/max_items`로 다음 페이지를 처리하며 회차 자료 전체를 한 모델 입력에 넣지 않는다. 검토된 계획이 있으면 선별 → 공유 사실 추출 → 사실 검토 → 기사 작성 → 편집/수정 승인 → 온톨로지의 순서로 진행한다.

사건 제안의 `input/v2`는 회차·전체 요청 자료 순서·정책·구현 SHA를 고정한다. 페이지 범위는 별도의 불변 `pages/<sha>.json`에 기록한다. 같은 run에서 `next_offset`을 전달해 다음 페이지를 처리하며 `overall`과 checksummed `progress.json`은 앞 페이지의 완료 결과·실패·전체 잔량을 보존한다. `overall.next_offset`은 처음 남은 자료 위치다. 실패한 자료는 명시 재개하고, 완료 페이지 재조회는 모델을 다시 호출하지 않는다. 전체 자료가 처리된 뒤에만 집계 `result.json`을 저장한다. 모든 제안은 계속 `unreviewed`, `writer_allowed: false`다. 이전 v1 입력이나 정책·구현이 달라진 run은 덮어쓰지 않고 새 job에서 검증된 선행 결과를 참조한다.

`collection.daily`의 `drive_snapshot_file`은 저장소 상대 경로다. 정규 계획·수집에는 최신 전수 Drive snapshot을 이 입력으로 전달한다. 독립 CLI의 대응 옵션은 `--drive-snapshot`이며 같은 native 검증기를 사용한다. 원격 원고와 작업본이 다르거나 snapshot이 오래되면 새 계획을 만들기 전에 거부한다. 이미 저장된 계획의 입력을 다른 snapshot으로 바꾸지 않는다.

`fact_reviews`, `editorial_reviews`, `revision_reviews`는 `group_id`를 키로 하는 저장소 상대 검토 파일 경로 객체다. 사실 검토가 없으면 `fact_review`, 편집 검토가 없으면 `editorial_review`에서 멈춘다. GPT도 MCP로 원문을 읽고 이 파일을 작성한 뒤 진행할 수 있다. 검토 자료 없이 자동 승인하지 않는다. 사실 검토 파일의 native 배열 이름은 `claims`다.

완료 사건과 검토 파일을 기다리는 사건은 다음 실행의 `max_items`를 소비하지 않는다. 오류 사건은 같은 실행을 반복해도 자동 재시도하지 않고 다른 선별 사건을 진행한다. 원인을 고친 뒤 `retry_groups`에 정확한 그룹 ID를 전달한다. native CLI의 대응 입력은 `--event-retry-groups` JSON 배열 파일이다. 이전 오류·원문·모델 예산은 삭제하지 않는다.

```json
{
  "run_id": "edition-events-reviewed",
  "edition_path": "editions/edition-id/materials.json",
  "edition_sha256": "앞 단계가 반환한 실제 SHA256",
  "plan_path": "event-plans/plan-id/plan.json",
  "plan_sha256": "판정 단계가 반환한 실제 SHA256",
  "execute": true,
  "max_items": 4,
  "fact_reviews": { "event-group": ".local/research/fact-review.json" },
  "editorial_reviews": { "event-group": ".local/research/editorial-review.json" },
  "revision_reviews": { "event-group": ".local/research/revision-review.json" }
}
```

위 SHA 표기는 사용 설명용이다. 실행에는 결과의 실제 64자리 SHA를 전달한다. 기존 온톨로지를 이어갈 때 `ontology_path/ontology_sha256`를 함께 전달한다. 입력 그래프는 모델 호출 전에 검증하고, 승인된 관련 사건만 교체한다. 영향 조회는 현재 연결된 정의 판본의 실제 근거·관련 기사 이력을 보고한다. `note_review_runs`(CLI `--event-note-reviews` JSON 배열)에 기존 승인 run을 명시하면 Signals/TrendTopics의 정확한 사실 의존성도 조회한다. 공개 정의 선택이나 누적 기록의 승인은 기존 명시적 note 승인 경로를 따른다.

`research:core`의 새 회차는 원문 수집 마감 → 고정 회차 → 사건 검토를 기본 경로로 사용한다. 기존 `queue_run`, 고정 `collection_basis` 또는 저장된 legacy core 입력이 있는 작업은 원래 큐로 재개한다. `--edition/--edition-sha256`, `--event-plan/--event-plan-sha256`, `--event-proposals/--event-offset`과 세 종류 `--event-*-reviews` JSON 객체 파일로 사건 경로를 직접 실행한다. legacy 후보 검토 옵션은 사건 경로에 섞어 무시하지 않고 거부한다. 기존 예약 시간과 GPT 조사 권한은 변경하지 않았다.

## 승인 결과의 발행 인계

`edition.advance`와 사건 중심 `research:core`는 native `event-workflows/<run>/latest.json`을 먼저 저장한 뒤 그 정확한 바이트 SHA로 인계를 준비한다. 반환 값의 `publication_handoff`가 기존 preview 입력이고 `publication`은 로컬 준비 상태·`approved_runs/knowledge_runs/workflow_status/collection_status`다. 자동 인계 run은 `event-publication-` 뒤에 workflow run 문자열 SHA의 앞40자리를 붙인다. native latest에는 자신을 참조하는 인계를 다시 넣지 않아 해시 순환을 만들지 않는다. 인계의 별도 latest와 불변 snapshot이 재개점을 보존한다.

독립 실행은 `npm run module:publication -- prepare --json '<정확한 JSON>'` 또는 기존 `research-publication.mjs handoff`다. 준비·상태 조회는 모델·네트워크를 사용하지 않는다. worker는 workflow 파일과 발행/승인 검증 코드의 SHA를 고정하며 입력이나 코드가 바뀌면 새 job ID를 요구한다.

`research.mjs preview --publication-handoff <반환된 path>`는 v3의 정확한 `knowledge_runs`를 자동 전달한다. 별도 명시한 지식 승인과 중복된 필수 run은 한 번만 전달하되, 사용자가 명시적으로 중복한 입력은 기존 관문에서 거부한다. `loadPreviewPublicationInputs`는 같은 native 승인/정의 검증을 읽기 전용으로 수행하며 vault 복사·빌드·원격 작업을 하지 않는다.

승인된 write/update/correction만 새 작성 입력이다. reuse는 이전 승인 참조, defer/검토 대기/실패는 제외 상태로 남는다. `approval_ready/partial_approval_ready`는 로컬 입력 준비이며 Drive 저장·공개 발행·정규 운영 완료가 아니다. 신규 회차와 소급 수정이 섞이면 `group_ids` 또는 기존 CLI의 `--group`으로 각각의 authoring 인계를 준비한다. [실제 전달 관문](DRIVE_STORAGE.md#사건-중심-승인-결과의-로컬-발행-인계)을 유지한다.

## 저장·재개·성능

모듈은 native source/parse/검토/승인 저장소를 공유한다. 새 파일은 비공개 실행 계획과 참조이며 원문·지식의 중복 저장소가 아니다.

```text
.local/research/local-ai/
  module-jobs/<job>/input.json, state.json, result.json, stdout.log, stderr.log
  editions/<edition>/materials.json
  event-plans/<plan>/review.json, plan.json, selections/<group>.json
  event-selections/<writer>/input.json, selection.json
  runs/<writer>/event-selection.json
  runs/<native-source-selection-or-bundle>/...
```

모듈 입력·리뷰 파일 해시·실행 코드 판본을 작업 ID에 바인딩한다. 입력·코드가 바뀌면 새 작업 ID를 사용한다. `completed`는 해당 모듈 호출이 결과를 저장했다는 뜻이며 `native_status=partial/relationship_review/editorial_review`를 전체 운영 완료로 올리지 않는다. 완료 결과는 재실행하지 않는다.

```bash
node scripts/research-module.mjs resume --job module-failed-job --background
```

실패·중단 작업은 위 명시 재개로만 다시 시작한다. 죽은 해당 **모듈 worker 잠금**만 소유자를 대조해 복구한다. native 수집·원고 잠금은 기존 복구 도구로 확인해야 하며 임의 삭제하지 않는다. 결과 저장 직후 상태 기록 전에 중단된 경우 저장 결과 SHA와 입력 바인딩을 대조해 복구한다.

기본 worker 상한은 4(설정 가능한 상한 6)다. 같은 연구 root에서 모델 작업은 1개, 네트워크 수집 작업은 1개로 제한한다. 수집기 내부의 기존 host별 제한·병렬 수집은 유지한다. 회차 보고서는 한 호출 안에서 한 번 읽어 색인화하고, 각 원본/parse는 해시 검증한다. 매 원문마다 전체 회차 JSON을 다시 읽거나, 선별 사건 한 개를 처리할 때 전체 사건을 다시 대조하지 않는다.

## 2026-10-10 노출·독립 운영 점검

외부 호출 기본 목록과 실제 Codex 등록은 compact5개다. 당시 내부11모듈·45작업/상세49도구 기록이며 현재는 목적별 보강을 포함한12모듈·65작업/상세69도구다. 원문/판본·관계/사실/편집 승인 Schema와 legacy 재개를 같은 native 계약으로 사용한다.

서버·운영기는 `--modules`와 `--operations`로 현재 단계의 작업만 허용한다. `research_modules(include_schemas=false)`로 가벼운 목록을 읽고 선택한 module/operation의 상세 계약을 조회한다. scope 밖의 실행·job 상태·결과·재개도 거부한다. 기본 전체 자동 선택은36작업이며 실제 전달·검토 입력은 명시 실행에 남긴다.

운영자의 자동 실패 재시도·판본 교체 검토 입력을 차단하고 혼합 partial의 모든 검토/추론 대기와 실패를 인계한다. ontology·knowledge 링크와 실제 발행 helper도 job 구현 지문에 포함했다. 지식 task는 native `file_hashes`와 task별 의존 판본을 고정해 사용 기사·정의·이력이 바뀌면 해당 항목을 다시 검토한다. 변경 없는 과거 스키마 이관과 승인 기사 연결은 기존 checkpoint를 보존한다. [기존 세션별 C/K/D·부모 R 작업과 완료 조건](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#mcp-도구와-독립-개발-배정-재점검-2026-10-10)을 따른다. 수집·지식·전달은 자기 helper/결과를 독립적으로 구현하고 common registry/runtime/MCP/core 접점은 부모가 통합한다.

## MCP 선언

[공식 TypeScript SDK의 stdio 서버](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/first-server.md)를 사용한다. integration은 별도 lockfile로 `@modelcontextprotocol/server` 2.3.1과 Zod 4를 고정한다. 루트 Quartz 의존성이나 기존 모델 정책을 교체하지 않는다.

```bash
npm ci --prefix integrations/research-mcp --ignore-scripts --no-audit --no-fund
node integrations/research-mcp/server.mjs
```

상세 모드에서는 선택한 모듈의 작업을 `${module}_${operation}` 도구로 등록한다. 수집 전용 서버는 `--modules collection,parsing`으로 실행할 수 있다. 현재 전체12모듈은 도메인 작업65개와 공통 도구4개로 상세69도구다. `--tool-profile compact`은 같은 작업 계약을 공통5도구로 호출한다. 서버 기본값과 현재 Codex 등록, 로컬 운영기의 기본 연결은 compact다.

- `research_modules`: Schema·모듈·작업·입출력·네트워크/모델 사용 여부.
- `research_job_status`: worker 상태와 native 결과 상태.
- `research_job_result`: 해시 검증한 저장 JSON의 페이지. `next_offset`이 있으면 이어서 읽는다.
- `research_job_resume`: 이 서버에서 활성화한 모듈의 실패/중단 작업만 명시 재개.

도메인 호출은 optional `job_id`를 받고 독립 worker 작업을 시작한 뒤 바로 ID를 반환한다. stdout은 MCP 프로토콜 전용이며 native 명령 출력은 해당 worker 로그로 분리한다. 입력 오류와 이미 실패/중단된 작업의 재호출은 `isError=true`로 반환하며 저장 상태도 보존한다. 비동기 worker의 이후 실패는 `research_job_status`에서 `state/error/resume_available`로 확인한다. 상태 조회 자체는 정상 응답이며 실패 작업을 다시 실행하지 않는다. 임의 shell 명령·root 변경·모델 변경·승인 우회 옵션을 도구 입력으로 받지 않는다.

초기화의 `instructions`에는 상태→저장 결과 페이지→명시 재개, 검토 대기/부분 수집/발행 준비의 구분과 서버의 실제 repo/root/vault·활성 모듈을 제공한다. Codex가 다른 cwd에서 연결해도 검토 파일과 native 참조의 경로를 정확히 해석할 수 있다.

서버 시작 옵션은 `--repo`, `--root`, `--vault`, `--backlog`, `--policy`, `--modules`, `--tool-profile`, `--max-active-jobs`다. 연구 root·vault·정책은 선택 저장소 안의 경로만 허용한다. 기본 root는 `.local/research/local-ai`이며 모듈별 서버들도 같은 native 저장소를 공유할 수 있다. 모듈 필터는 제공할 작업을 정하는 기능이고 별도 사용자 권한/접근 제어 시스템은 아니다.

클라이언트에는 Node 실행 파일과 위 서버 파일의 절대 경로를 선언한다. 예를 들어 범용 stdio 클라이언트 설정은 다음과 같으며 실제 설정 형식은 해당 클라이언트를 따른다. 2026-10-10 후속 요청으로 현재 Codex 호스트에 `tech-knowledge-research`를 등록했다. 기존 프로젝트에서 사용하며 새 프로젝트 등록이 필요하지 않다.

```json
{
  "mcpServers": {
    "tech-knowledge-research": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "/Volumes/X5Storage/Projects/Personal/Apps/tech-knowledge-garden/integrations/research-mcp/server.mjs",
        "--repo",
        "/Volumes/X5Storage/Projects/Personal/Apps/tech-knowledge-garden"
      ]
    }
  }
}
```

### 실행 점검과 Codex 연결

```bash
npm run research:mcp:check --silent
npm run research:mcp:check --silent -- --publication-run parallel-publication-20261010-integrated-v1
codex mcp get tech-knowledge-research --json
```

점검 명령은 실제 stdio 초기화·현재 도구/모듈 계약을 대조한 다음 읽기 전용 inventory worker를 실행하고 저장 결과의 페이지·입력 바인딩·SHA를 확인한다. `--publication-run`을 주면 같은 MCP 경로로 기존 승인 인계를 조회한다. 수집·모델·vault 복사·build·원격 발행은 실행하지 않는다. 정상 `handoff_pending`은 서버 호출 성공과 검토 대기 상태를 함께 보고한다. worker 실패·서버 종료·timeout은 종료 코드1이며 실패 기록은 보존한다. 기본 점검 제한은30초, `--timeout-ms`는1,000~60,000ms다.

완료했던 inventory 검사를 반복할 필요가 없으면 `--checks-json`에1~6개의 `{module,operation,parameters}`를 지정한다. 선택 작업은 활성 catalog의 읽기 전용·모델/네트워크 미사용 계약으로 제한하고 실제 stdio worker의 저장 결과·전체 페이지·SHA·입력 바인딩을 확인한다. 예를 들어 WBS와 운영 비교만 조회한다.

```bash
npm run research:mcp:check --silent -- \
  --checks-json '[{"module":"validation","operation":"progress","parameters":{"plan_file":"docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md"}},{"module":"publication","operation":"shadow_status","parameters":{}}]'
```

현재 호스트의 등록 명령은 다음과 같다. 다른 checkout에서는 실제 Node와 저장소 경로를 사용한다. 같은 이름의 기존 설정이 있다면 먼저 `codex mcp get`으로 확인한다.

```bash
codex mcp add tech-knowledge-research -- /opt/homebrew/bin/node \
  /Volumes/X5Storage/Projects/Personal/Apps/tech-knowledge-garden/integrations/research-mcp/server.mjs \
  --repo /Volumes/X5Storage/Projects/Personal/Apps/tech-knowledge-garden
```

Codex 앱·CLI·IDE는 같은 호스트의 MCP 설정을 공유한다([공식 MCP 문서](https://developers.openai.com/codex/mcp)). 실행 중인 대화의 도구 목록은 새 대화나 클라이언트의 MCP 설정 다시 읽기 후 확인한다. 서버는 클라이언트가 필요할 때 stdio로 시작하며 작업 worker는 저장 체크포인트로 조회·재개한다. 등록 해제는 `codex mcp remove tech-knowledge-research`로 이 연결만 제거한다.

## 검증과 현재 WBS

2026-10-10 사건 처리 연결의 표적 묶음은 70/70 통과했다. 사건 구조화·공유 추출·수정 계보·native core·기존 온톨로지/판본 승인 회귀를 확인했다. 이후 영향 조회 변경의 기존6검사·정의 충돌 분리1검사, 완료/검토 대기/실패가 다음 사건을 막지 않는2검사, 모듈 Schema/공식 SDK stdio3검사를 각각 변경 범위만 실행해 통과했다. 첫 신규 fixture의 날짜/검토 배열/확인 필드 및 중복 보류 사건은 원래 native 관문에 맞게 수정하고 실패한 표적만 재실행했다. 검증기를 완화하지 않았다. 전체 suite·사이트 build·Drive·공개 배포는 실행하지 않았다.

```bash
node --test tests/research-event-workflow.test.mjs tests/research-daily-core.test.mjs tests/research-ontology.test.mjs tests/research-approved-source-revision.test.mjs
node --test --test-name-pattern='impact|standalone definitions' tests/research-ontology.test.mjs
node --test --test-name-pattern='eleven independently|module contract rejects|official SDK' tests/research-modules.test.mjs integrations/research-mcp/test/server.test.mjs
```

아래는19.506 사건 처리 실물 당시의 기록이며 현재 설정은 등록201·활성62·검증대기0이다. 상세 현재 판정은 [운영 WBS](LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md#현재-진척과-다음-완료-증거)를 따른다.

실제 저장 회차에 공식 AMR 제품 자료1건을 공통 수집기로 보충한 뒤 새 회차를 고정했다. 새 회차는 596개 material/490개 기사 후보·612원문 파일이다. 원래 55경로 회차의 53완료·2부분·미시도0을 보존했다. 현재 등록 상태는 200주소·정기 활성60이며 두 관측의 분모를 섞지 않는다. 원래 회차/보고서는 보존했다. 새 native core의 저장 회차 계획 실행에서도 후보490개·작성0·legacy 큐 생성0을 확인했다.

KUKA·TD SYNNEX의 2026-10-07 공동 발표 영문/독문과 공식 AMR 기술 설명 **3원문을 기사 하나**로 연결했다. 동일 발행자의 언어판·제품 설명이므로 독립 출처3개로 세지 않는다. 기존 기사 ID `bcbd171efb3de844`·발표일10월7일을 유지했고, 이전 공개6사실을5유지+1상태 정정으로 모두 계보에 연결했다. 로컬 Qwen이 추출16사실과 초안을 생성한 뒤 원문 대조·native 사실 검토·문장 교정·최종 승인을 완료했다. AMR 용어 연결도 보존했다.

| 실제 단계                  | 모델 호출 | 작업 시간 | 결과                                                  |
| -------------------------- | --------: | --------: | ----------------------------------------------------- |
| 최소 사건 후보 실물 작업   |         2 | 260.299초 | 미검토 후보; 숫자가 아닌 수치 필드 문제는 비공개 보존 |
| 선택한 사실 추출           |         2 | 162.796초 | 영문 기존6사실 재사용0호출, 독문·제품 자료 추출       |
| 사건 기사 작성             |         1 | 123.496초 | 하나의 초안; 교정·사실/편집 승인에 추가 모델 호출0    |
| 승인 후 온톨로지·영향 조회 |         0 |  18.167초 | 사건296개 중 대상1교체, 나머지295개 불변              |
| 동일 입력 재실행           |         0 |  17.784초 | 기사 작성0, 온톨로지 SHA 동일                         |

작업 시간에는 로컬 모델 대기와 native 바이트 검증이 포함된다. 다른 앱의 모델 작업은 중지하지 않았다. 최소 후보 작업 당시 회사 소개 블록에서 불필요한 호출이 발생해 이후 공통 소개 블록을 후보 추론에서 제외하도록 보강했다. 전문은 보존한다. 위 후보 시간은 보강 전 실제 실행이며 개선 후 실측으로 바꾸지 않는다. 후보별 기존 경로의 같은3원문 비용은 별도 실행하지 않아 절감률은 제시하지 않는다.

영향 조회가 전체 공개 지식 색인을 생성하면서 무관한 동률 정의 충돌로 중단되던 결함을 수정했다. 이제 연결된 정의 판본들의 정확한 의존성을 조회한다. 공개 정의 선택은 여전히 충돌 시 거부한다. 실물 결과는 영향 기사1·정의1·관련 이력1이며, 사건 수정 이력은10→11이다. RSS XML의 실제 SHA는 승인 전후 동일했다. 기존 파일이 불변인 확인이며 새 공개 발행 검증으로 세지 않는다.

실제 근거는 `.local/research/event-core-live-readback-20261010-v1.json`, `event-native-core-final-readback-20261010-v1.json`, `event-core-live-input-20261010-v1.json`과 연결된 native 결과다. 승인 기사 읽기 파일은 `.local/research/local-ai/runs/event-core-live-writer-20261010-v1/preview.md`다. 교정 전 모델 출력·과거 승인 원고·원문·검토 기록을 모두 보존했다.

| 항목                        | 현재 상태                                                     | 남은 완료 증거                                  |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| 독립 모듈 CLI·MCP           | 구현·표적 검증·실제 worker 실행·Codex 등록                    | 전체 운영 수용과 원격 발행은 아래 별도 관문     |
| F1 회차→사건→선별→작성 경계 | 구현·실행 검증: 최소 사건 모델 추출→native 최종 승인          | 완료                                            |
| F2 다중 원문 기사           | 구현·실행 검증: 실제3원문→1기사·16사실 검토·출처 추적         | 완료                                            |
| F3 재사용·보완·후속·정정    | 구현·검증: 실물 수정/재실행, 후속/정정·별도 ID·사실 계보 회귀 | 완료; 공개 반영은 기존 발행 경로의 별도 단계    |
| F4 실제 시나리오·비용 비교  | 실행·호출/시간 계측 연결, 위 실물 및 대표 시나리오 회귀 확인  | 기존 후보별 경로와 같은 입력의 비용 비교 미측정 |
| 전체 운영 수용              | 완료3/부분17/미착수2 유지                                     | 기존 독립60건·정규7회·Drive·공개 결과 조건      |

## 공통 재개·승인 경계

자동 로컬 운영자는 `edition.advance`의 사실·편집·수정 검토, `retry_groups`, 잠금 회수 입력을 제출하지 않는다. `publication.deliver`와 `delivery_receipt`도 자동 선택에서 제외한다. 명시 운영자는 같은 `research_execute`로 release와 실제 connector capture를 전달하며 native 검증기가 완료를 판정한다. 전달 요청·receipt 제출 자체를 Drive 저장·발행 성공으로 취급하지 않는다.

혼합 `partial` 결과는 모든 `reasoning_tasks`, 검토 대기 rows, 실패를 인계하고 planner를 멈춘다. 첫 `reasoning_task`는 기존 소비자용으로 함께 보존한다. 지식·발행 작업은 ontology/link 및 실제 전달 helper의 코드 SHA를 고정하며 다른 구현의 저장 job은 현재 결과로 재개하지 않는다.

`research:core`와 `research-ontology.mjs knowledge-index/impact`는 `--connection-review-run`으로 기존 명시 관계 승인을 전달한다. 승인 path/SHA는 불변 입력에 포함되며 새 관계 승인이나 graph를 자동 생성하지 않는다. 과거 수집 receipt와 current code fingerprint는 구분한다. R1-e의 저장4개 checkpoint 확인은 현재 RunState의 완료 단계 재사용만 증명하고 현재 구현으로 전체 onboarding을 다시 인증한 것은 아니다.


### 기사 처리 모델 고정 (2026-10-16)

개발은 Sol, 기본 Codex 추론 다섯 역할은 `gpt-6-luna`다. `reasoning.pending/read`의 `requested_model`·`requested_thinking`으로 실행 대상을 확인한다. 실제 Luna에서 실행한 결과만 `reasoning.submit`에 `executor: codex`, `model: gpt-6-luna`로 제출한다. 이 값은 호출자 선언이며 서버가 실제 모델 실행을 자동 증명하거나 시작하지 않는다. 명시 모델 요청의 모델 누락/불일치는 저장 전에 거부한다. 기존 generic `codex` 요청/완료 결과는 변경하지 않으며, 명시적인 Ollama 교체의 실제 실행 모델 기록과 승인 경계도 유지한다. 모델 변경 후 옛 run의 바인딩을 수정하지 않고 새 run을 사용한다.


### 저장 복원 묶음과 mutation-lock 회수

`collection.storage hydrate`와 독립 storage CLI는 동일 storageAction의 최대1,000경로 native 묶음을 사용한다. 생략한 paths도 조회한 exact pending 목록에 고정하며 이후 새 요청을 섞지 않는다. 각 묶음은 기존 ZIP/member/파일 SHA 검증 후 commit하고 최초 실패에서 부분 근거를 보존한다. 원래 MCP paths 상한과 승인/모델 경계는 유지한다.

공통 storageAction의 자식 입력은 완성된 권한600 임시 정규파일 fd로 전달한다. 실제 native 읽기 전용 추적에서 재현한 stdin 소켓 EOF 대기를 제거하기 위한 경계이며, 수집·모델 요청·저장 승인이나 timeout 정책을 바꾸지 않는다. fd와 임시 파일은 성공·오류 모두 정리한다.

중단된 `.storage/mutation.lock`의 회수는 독립 storage CLI `recover-mutation-lock`만 명시 제공한다. 정확한 root·원문 SHA·PID·operator·reason 및 현재 ESRCH 검증을 요구하며 원문/회수 영수증을 보존한다. 회수 guard는 프로세스 종료로 해제되는 OS 잠금이다. 살아있는 PID·unknown·바뀐 원문이나 파일 identity는 회수하지 않는다. MCP storage/자동 planner는 이 action을 호출할 수 없다. 구체적 절차는 DRIVE_STORAGE의 대량 복원/잠금 회수 절을 따른다.

### worker 종료 관측의 현재 증거

worker 조회는 `kill(pid,0)`과 같은 `ps` snapshot의 kernel 상태·전체 command를 확인한다. 초기 존재 조회 후 프로세스가 사라져 ps가 실패하거나 argv가 일치하지 않으면 존재를 한 번 더 조회하고 ESRCH만 종료 증거로 사용한다. 커널 상태 Z와 Linux의 X는 쓰기를 수행할 수 없는 종료 상태다. command 문자열의 `defunct`나 Darwin의 X 부가 flag만으로 종료를 추정하지 않는다. 살아 있는 다른 PID/job, 권한 오류, 불명·잘못된 출력은 계속 `worker_status_unknown`으로 남기며 잠금을 회수하지 않는다. job 인자는 공백·문자열 끝 경계까지 일치해야 하므로 다른 job의 ID 접두어와 혼동하지 않는다. 프로세스 조회 후의 native 최종 상태 재검증도 유지한다.
