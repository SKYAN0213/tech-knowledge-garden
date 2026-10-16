# 로컬 모델 운영 실행기

정규 운영은 개발 완료 뒤에만 허용한다. `data/research-operation-policy.json`의 현재 phase와 완료 판본을 확인하며, 정규 실행에 `--regular`를 전달하면 MCP/모델/잠금/체크포인트 생성 전에 같은 완료 관문을 읽는다. development_pending은 정상 종료다. 아래 inventory 예제는 범위를 지정한 개발 검증이며 정규 브리핑 실행이 아니다. GPT 기본 운영은 기존 Codex 추론 정책, 로컬 선택지는 기존 Gemma 정책을 사용한다. 이 차이는 수집 모듈이나 승인 기준을 바꾸지 않는다.

`operator.mjs`는 로컬 Ollama 모델이 다음 MCP 도구를 선택하고, 같은 연구 서버의 작업 결과를 읽어 다음 행동을 결정하는 실행기다. 원문 수집기나 별도의 지식 저장소를 만들지 않는다. Codex와 로컬 운영 실행기가 같은 MCP 모듈, 원문, 작업 ID와 검토 관문을 사용한다.

- **운영 담당자:** Codex가 직접 MCP를 호출하거나 `operator.mjs`의 로컬 모델이 도구를 선택한다.
- **추론 수행자:** 기존 역할별 모델 정책을 따르며 운영 담당자와 독립적이다. 위임된 추론은 Codex가 `reasoning.read` → `reasoning.submit`으로 처리하거나 로컬 수행자가 `reasoning.execute`로 처리한다.
- **검토·승인:** 생성 결과의 사실·관계·편집 검토는 기존 명시 검토 관문을 통과해야 한다. 로컬 운영 실행기가 승인 파일을 만들어 관문을 건너뛰지 않는다.

## 실행

Node 22 이상, 이 디렉터리의 설치된 MCP SDK 의존성과 로컬 Ollama 모델이 필요하다. 프로젝트 루트에서 다음처럼 실행한다. 실제 조사 목표를 `--task`로 명시하며, 아래 예시는 경로 목록 조회만 요청한다.

```sh
node integrations/research-mcp/operator.mjs \
  --run local-inventory-demo \
  --task '등록된 뉴스 수집 경로의 목록만 조회하고 종료한다.' \
  --modules collection \
  --operations collection.inventory \
  --max-steps 3 \
  --timeout-ms 120000
```

기본 운영 모델은 `gemma4:31b-mlx`다. `--model`로 설치된 다른 로컬 모델을 선택할 수 있다. 운영 모델의 계획 호출은 `think: false`, 출력 4096토큰을 사용한다. 응답은 `action`, `tool_name`, 구조화 객체인 `arguments`, 최대160자의 `reason`으로 제한한다. 도구 인수 Schema는 활성 작업의 원래 계약을 재사용한다. 종료 응답은 `tool_name: null`, `arguments: {}`다. 문자열 인수를 수선하거나 추가 파싱하지 않는다. 전달하는 도구 계약과 직전 결과의 크기에 따라 컨텍스트를 16384 또는 32768로 제한한다. 원문 추출·작성 모델의 선택은 `--policy`가 지정하는 기존 정책과 별개다. 기본 정책의 모델도 Gemma이며 기존 실행의 고정 정책·완료 응답은 덮어쓰지 않는다.

서버에는 기본적으로 `--tool-profile compact`으로 연결한다. `--tool-profile detailed`도 지원하며, 두 표현은 동일한 모듈과 입력 검증기를 호출한다. `--modules collection,parsing,edition,curation`처럼 사용할 범위를 좁힌다. `--operations collection.inventory`처럼 단계별 작업을 지정하면 해당 계약만 planner에 전달하며 서버도 다른 작업 실행·job 조회·결과·재개를 거부한다. 현재 catalog는12모듈/67작업이고 외부 노출은5도구다. 독립 사람 평가와 실제 예약 비교를 포함한 명시 검토·발행 작업은 자동 선택에서 제외한다. 2026-10-10의45작업 catalog에서 측정한 당시 자동 선택36개는18,927자, inventory 한 작업은238자였다. 현재67작업의 입력 크기나 실제 모델 토큰·지연 측정값을 뜻하지 않는다.

수집 보고서에 미완료 창이 있으면 `collection.recover`의 `plan-only`로 원인별 보완 대상을 확인하고 같은 복구 ID로 `execute`한다. 저장된 원문·같은 설정의 완료 파싱과 완료 출처는 재사용한다. 묶음 예산으로 미룬 본문은 `resume`로 계속하고, 일반 오류만 남으면 원인 수정이나 정책 관측 후 `retry_incomplete: true`로 제한해서 재시도한다. Drive 파일 대기는 사이트 실패가 아니며 정확한 묶음을 복원한 뒤 같은 run을 재개한다. 코드 수정 뒤에는 `source_runs`에 동일 창의 이전 native 체크포인트를 지정해 새 복구 ID로 이어갈 수 있다. 기본 반환값의 `report_sources`를 필요한 범위의 `collection.report`로 고정하고, 기존 전체와 통합한 보고서 재생성은 `build_report: true`로 명시한다. 보고서 보관 대기는 수집 완료를 되돌리지 않는다. 이미 발행한 회차·기사·승인을 바꾸지 않는다. 상세 계약은 [미완료 수집 보완](../../docs/RESEARCH_MODULES.md#미완료-수집-보완)을 따른다. 기존에 연결된 MCP는 계약을 캐시하므로 새 연결에서 최신 작업을 조회한다.

작성 대상은 관계 검토 뒤 `curation.prepare/evaluate/select`로 오늘과 이전 미수록 후보를 함께 평가한다. `evaluate`의 모델 점수는 `curation_review`로 대기하며 planner는 review_file을 만들어 자체 승인하지 않는다. Codex 등 큐레이터가 원문·기존 기사·점수 근거를 대조한 뒤 선정한다. 여러 원 회차의 선정은 `curation.advance`가 기존 native writer/checkpoint와 공유 호출·시간 예산으로 처리한다. planner가 `require_curation: false`나 `retry_candidates`로 검토/재시도를 우회할 수 없다. 기존 사실·편집·발행 승인은 그대로다.

시작 위치가 프로젝트 밖이라면 `--repo`에 실제 프로젝트 루트를 지정한다. `--root`와 `--policy`는 프로젝트 내부 경로이며 연구 체크포인트는 `.local/` 아래에만 저장한다. 자동 예약이나 공개 배포를 새로 등록하지 않는다.

## 상태 공유와 재개

Drive cold payload 대기는 사전 인증된 로컬 adapter의 `node scripts/research-drive.mjs storage pull` 또는 명시 MCP `collection.storage`의 `remote-pull`로 해소할 수 있다. 설정은 [독립 로컬 OAuth](../../docs/DRIVE_STORAGE.md#독립-로컬-drive-oauth-2026-10-16)를 따른다. 토큰·인증 코드·upload session URI는 모델에게 전달하지 않는다. 자동 planner의 storage 제외, 명시 native 재개와 개발 완료 전 정규 운영 대기는 유지한다. 새 자료는 동일 adapter의 push가 raw readback과 복구 catalog 보관까지 수행한다.

반환 JSON에는 프로젝트 상대 경로인 `checkpoint.path`, `input.path`, 각 SHA-256, 현재 작업 ID와 `handoff`가 있다. 기본 저장 위치는 다음과 같다.

```text
.local/research/local-ai/operator-runs/<run>/
  input.json
  checkpoint.json
  planner/<번호>.json
  planner/<번호>-intent.json
  planner/<번호>-failure.json
  steps/<번호>-intent.json
  steps/<번호>-response.json
  steps/<번호>-result.json
```

Codex는 반환 경로의 체크포인트와 정확한 작업 ID를 읽고 동일한 `research_job_status/result` 도구로 이어받을 수 있다. 모델 결정과 호출 의도를 저장한 뒤 고정 `job_id`로 작업을 제출한다. 응답을 받기 전에 실행기가 끊겨도 재개 시 원래 작업을 조회한다. 완료된 작업을 다시 제출하지 않는다.

로컬 운영을 다시 시작하려면 동일한 `--run`, `--repo`, `--root`, `--policy`, `--modules`, `--operations`, `--tool-profile` 조건으로 `--resume`를 사용한다. 새 `--task`를 전달하지 않아도 저장한 요청을 읽는다.

```sh
node integrations/research-mcp/operator.mjs \
  --run local-inventory-demo \
  --modules collection \
  --operations collection.inventory \
  --max-steps 5 \
  --timeout-ms 120000 \
  --resume
```

- `waiting_for_reasoning`: `handoff.reasoning_tasks` 전체의 정확한 요청 ID/SHA를 읽는다. 기존 단일 `handoff.reasoning_task`도 보존한다. Codex 결과 제출 또는 `reasoning.execute` 완료 후 원래 작업을 명시적으로 재개하고 실행기를 재개한다.
- `waiting_for_review`: 관계·사실·편집 검토 대기다. 혼합 partial의 `handoff.review_rows`와 `handoff.failures`도 보존한다. 근거와 결과를 검토한 뒤 기존 native 검토 도구로 처리한다.
- `failed` / `interrupted`: 오류와 보존 입력을 확인한다. 작업 실패를 자동 재시도하지 않는다. Codex가 원인을 해결하고 native 작업을 명시 재개한 뒤 실행기는 같은 작업이 완료됐는지 확인한다. `handoff.planner_retry_available: true`라면 다음 도구 호출 전에 모델이 실패했음을 phase·의도·실패·완료 결과 SHA로 확인한 상태다. 명시 `--resume`는 planner만 다시 호출하며 완료된 native 작업은 반복하지 않는다. phase 근거가 없는 과거 실패는 같은 방식으로 재개하지 않는다.
- `budget_exhausted`: 체크포인트를 읽어 허용 단계를 늘리거나 다른 운영 담당자가 이어받는다. 시간 한도는 한 번 실행할 때 적용하고 `max-steps`는 같은 운영 회차의 누적 완료 호출 수에 적용한다.

실행 중 강제 종료로 잠금이 남으면 해당 잠금의 owner와 프로세스 종료를 확인하고 `--recover-lock-owner <정확한 UUID>`로 명시 회수한다. 잠금을 자동 탈취하지 않는다. 작업 ID가 없는 동기 도구 호출의 결과가 유실된 경우 자동 재실행을 하지 않으며 의도와 실제 결과를 확인한다.

`completed`는 이 실행기의 요청 처리가 끝났다는 상태다. 기사 승인, Drive 저장, 정기 운영 또는 공개 배포 완료를 의미하지 않는다.

## 실행 경계와 검사

실행기는 서버에서 조회한 활성 도구명, 도구 JSON Schema, 모듈의 실제 입력 계약을 모두 검증한다. 모델이 고른 shell 명령이나 임의 파일 쓰기를 실행하는 인터페이스는 없다. 검토·승인·원고 정정·잠금 회수·실패 재개와 `publication.deliver/delivery_receipt`, `validation.evaluation_import`, `publication.shadow_record/fallback`는 모델의 자동 선택에서 제외한다. 독립 사람 평가와 실제 예약 비교 완료는 명시 검토를 가져오는 단계이며 모델의 판정으로 대체하지 않는다. `edition.advance`의 fact/editorial/revision 검토와 retry_groups 입력도 실행 전에 거부한다. `reasoning.execute`는 동일한 추론 요청의 로컬 수행 경로이므로 선택할 수 있다.

계획 입력은 최대 60000문자이며 큰 결과에는 표시된 preview와 정확한 결과 참조를 전달한다. 저장 결과는 페이지의 순서·전체 길이·SHA를 확인한 뒤 최대 2 MiB까지 읽는다. 모호한 결과, 잘못된 도구 인수, 해시 변경, 예산 초과는 그대로 중단한다.

`publication.fallback`은 명시 검토로만 같은 회차의 기존 승인 legacy 경로를 선택한다. `research-publication-fallback-review/v1`에 reviewer_kind/reviewer/reviewed_at/reason, native_request/native_preview의 path/SHA, legacy_run과 legacy_release/legacy_preview의 path/SHA를 고정한다. CLI는 `node scripts/research-publication.mjs fallback --repo <repo> --root <private-root> --vault vault --run <native-request-run> --review <root-relative-review> --review-sha256 <sha256>`다. 운영자 자신이 원문과 기존 release/preview 및 실패 기록을 확인해야 하며 모델 planner가 자동 선택할 수 없다.

미해결 Drive/remote 쓰기, 같은 회차의 미확인 publish intent, 살아 있는 native worker 또는 fresh legacy raw Drive proof 부재는 `fallback_blocked` receipt로 보존한다. 응답 유실·부분 업로드는 기존 정확한 intent의 reconcile/resume부터 진행하며 없어진 응답을 새 발행으로 확인하지 않는다. native commit이 이미 확인됐다면 실제 rollback/readback을 별도로 확인하기 전 legacy 재발행을 허용하지 않는다. `legacy_selected`는 비공개 로컬 호출 경로 선택이며 실제 운영 복귀나 원격 복원을 의미하지 않는다. 기존 실패를 덮어쓰지 않으며 회차 경로와 사건 ID에 귀속된 선택 뒤 같은 회차 native는 새 run/작업 지문으로도 재진입할 수 없다. 선택된 legacy도 기존 fresh Drive/release/push/공개 readback 관문을 거쳐야 한다.

이 기능의 표적 검사는 아래 명령이다. fixture 모델로 교체·재개·실패·승인 경계를 시험하고 공식 SDK로 실제 stdio 연결과 catalog 조회를 확인한다. 실제 모델 추론이나 전체 원문 수집을 성공했다고 간주하지 않는다.

```sh
node --test integrations/research-mcp/test/operator.test.mjs
```
