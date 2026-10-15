# 검토된 기사 근거의 온톨로지 투영

## 목적과 입력 경계

`scripts/research-ontology.mjs`는 이미 저장된 **비공개 승인 run**을 읽어 사건·사실·원문 근거의 관계를 별도 스냅샷으로 만든다. 수집, 파싱, Ollama 호출, 기사 승인, Drive 쓰기, 사이트 생성은 실행하지 않는다. 새 원문을 얻으려면 기존 수집 경로가 필요하지만, 과거 승인본의 관계를 다시 계산할 때는 재수집이 필요 없다.

입력은 `research.mjs approve`가 만든 `draft.json`, `reviewed-claims.json`, `documents.json`, `parses.json`, `editorial-review.json`, `approved-article.json`이다. 기존 `loadCurrentApproval`이 원문 bytes·파싱·사실 검토 지문·최종 원고 승인을 다시 검증한 뒤에만 투영한다. 입력 파일을 읽는 동안 해시가 바뀌면 중단한다. 여러 승인 run을 묶을 때 같은 `event_id`의 두 판본을 자동 병합하지 않는다.

완료 큐 이후 기사에 용어 연결이나 편집 수정이 추가되면 `resolveFrozenCandidateApproval`이 기존 승인 파일·원문·기사 ID·발표일과 native 수정 승인 계보를 확인한다. 큐의 고정 결과와 영수증은 보존하고, 일일 core에서 검토된 수정본을 시간순으로 반영한다. 여러 중간 수정본을 건너뛰어 합치지 않으며, 이미 누적한 수정 이력은 재개할 때 되살리지 않는다. 승인 계보 없는 변경·다른 사건·변조된 검토 기록은 거부한다. 원문 수집·모델 작성의 재실행이나 신규 기사 발행 권한이 아니다.

기존 후보가 원문 판본 비교로 승인됐더라도 같은 사건의 편집 수정에 이어질 수 있다. 새 승인 run에 귀속된 `source-revision-review`와 `existing-editorial-review`를 함께 전달한다. 이전 native 후보 승인과 이전·현재 원문 비교를 다시 확인하며, 관측 판본과 기사의 검토 판본을 각각 보존한다. 새 명시 판본 검토가 빠지면 다른 parse를 자동 채택하지 않는다. 재개 시 편집 계보를 단순 원문 재결합으로 덮어쓰지 않는다. 같은 본문·발표일 비교를 통과하지 못한 실제 원문 내용 변경은 이 경로로 승격할 수 없다.

## 관계 생성 규칙

| 클래스                                    | 생성 근거                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `Article`, `Event`                        | 정확히 승인된 원고와 고정 `event_id`                                            |
| `Claim`                                   | 승인 원고의 문장 또는 검토된 심층 문맥에서 참조한 `verified` 주장만             |
| `SourceVersion`, `Parse`, `EvidenceBlock` | 그 주장의 직접 근거가 실제로 위치한 저장 원문 판본·파싱·블록                    |
| `EntityMention`                           | 승인 원고의 명시적 기업·기관 표기. 사건 내부에서만 식별                         |
| `Concept`                                 | 기사 검토자가 명시한 `concept_id`. 지도 포함이나 새 정의 승인으로 간주하지 않음 |

허용 관계와 출발점·도착점의 타입은 [`ontology.mjs`](../scripts/research/ontology.mjs)의 `ONTOLOGY`에 고정한다. 알고리즘은 `Article → Event → Claim → EvidenceBlock → Parse → SourceVersion` 근거 경로를 만들고, 승인된 기업·기관 표기 및 개념 ID만 연결한다. `Claim`의 `claim_kind`, `event_state`, `published_at`, `effective_period`, 수치의 원문 표기·단위·조건을 유지한다. `planned`를 `completed`로 추론하거나 한 기사에 함께 나온 이름만으로 관계를 만들지 않는다.

`EntityMention`은 사건 안의 표기다. 조회에서 같은 이름을 모아 보여 줄 수 있지만 서로 다른 사건의 동일 법인이라는 판정은 하지 않는다. 제품명이나 일반 단어는 기업 노드로 만들지 않는다. 공개 연결 지도 `learning-connections/v3`의 전문용어 선정·관계 규칙을 바꾸지 않는다.

## 사용

### 기존 정의의 관계 검토와 저장 결과 조회

`knowledge.index`는 기존 graph의 `graph_file`(research root 상대 경로)·파일 `graph_sha256`과 선택한 `knowledge_selections_file`(저장소 상대 경로), `trend_review_runs`, `connection_review_run`으로 기존 지식 색인을 읽는다. 원문·정의·전체 graph를 다시 만들지 않는다. 독립 실행 결과는 기존 module 작업 결과 파일로 저장한다.

`knowledge.read`는 그 색인 파일의 `result_file`·정확한 `result_sha256`, `section`, `offset`, `limit`으로 구조별 페이지를 반환한다. raw 색인과 `knowledge.index`의 native module 결과(`research-module-result/v1`의 data)를 모두 읽으며, SHA는 전체 저장 파일에 고정한다. 다른 모듈·작업의 결과 파일은 거부한다. `page.next_offset`이 null이 될 때까지 같은 파일·SHA를 유지한다. `concepts`, `events`, `trend_topics`, `knowledge_connections`, `entity_timelines`, `company_timelines`, `research_papers`, `research_people`, `research_relationships`를 읽을 수 있다. 페이지 읽기는 원문·승인을 다시 검증하거나 graph를 재생성하지 않으며, 현재 저장본이 달라지면 SHA 오류를 반환한다. `knowledge.review`는 명시적 `review_file`·`run_id`를 기존 `approveNoteReview`에 전달해 Knowledge·Signals·TrendTopics의 native 검토 영수증을 저장한다. canonical 반영은 기존 별도 경로다.

`knowledge.connections`는 `run_id`, `review_file`, `knowledge_selections_file`을 받는다. 정의35개를 다시 승인하지 않고, 이미 작성된 관계만 양쪽의 현재 전문용어 승인 판본에 고정해 검토한다. 검토 입력은 `research-knowledge-connection-review/v1`이며 reviewer·reviewed_at·reason, source_read·definitions_read·relationships_checked·cooccurrence_rejected=true와 connections 배열이 필요하다. 각 관계는 from·target·field(`connections`/`relations`)·기존 type(있을 때)·source_sha256·target_sha256·구체적인 검토 reason·evidence(run_id/claim_ids)를 지정한다.

양쪽은 현재 적용된 native 정의 승인이 있는 포함 전문용어여야 한다. 선택 사실은 양쪽 정의의 기존 승인 의존성에 있어야 하며 정확한 원문 bytes·parse·검토 영수증을 재사용한다. 기존 관계의 evidence URL은 모두 선택한 사실로 확인하고, 추가 배경 사실도 양쪽의 검토된 출처 안에서만 사용한다. 일반어·회사·제품·제외 노트나 공동 등장으로 새 관계를 만들지 않는다. `relations`의 source/inference 구분과 원문 reason을 보존하고, 이번 검토 reason과 날짜를 별도로 저장한다.

native run의 `connection-review.json`·`approved-connections.json`은 입력/근거 변경을 거부하며 동일 입력 재개와 저장 직후 중단 복구를 지원한다. `ontologyKnowledgeIndex(..., {connectionReviewRun})`는 이 영수증을 재검증하고 `knowledge_connections`로 읽는다. `ontologyImpact(..., {connectionReviewRun})`는 선택한 원문 판본·run/claim·사건에 직접 의존하는 관계만 반환한다. 정의·기사·canonical 관계 파일과 공개 지도는 수정하지 않는다.

native 주제 승인은 완전한 Signals 승인보다 먼저 연결할 수 있다. `trend_topics[].source_facts`는 그 주제에서 명시적으로 선택한 **현재 승인 기사에 실제 사용한 사실**만 담는다. Signals가 아직 없으면 history·분석을 만들지 않는다. 이전 note 판본은 native before/after와 원문 검토로 검증하고 previous_versions로 보존하되, 퇴역 기사 사실을 현재 의존성으로 사용하지 않는다. 현재 판본이 퇴역 기사에 의존하면 계속 차단한다. 이는 missing review를 reviewed-empty로 바꾸는 기능이 아니다.

## 지속 연결 workflow

`knowledge.sync`는 한 번의 검토 run과 별개로 고정 `workflow_id`의 연결 상태를 유지한다. 최초에는 native `event-workflows/<run>/latest.json` 또는 일일 core 결과를 가리키는 root 상대 `basis_file`을 전달한다. 그 파일의 정확한 ontology SHA와 native 기사·원문·승인을 확인하고, 현재 canonical Knowledge·Signals·TrendTopics 및 기존 native note/connection 승인을 자동 발견한다. 이후 호출은 저장된 basis를 재사용하며, 새 core/run으로 넘어갈 때만 새 `basis_file`을 전달한다. 날짜나 run ID를 코드에 추가할 필요가 없다.

```sh
node scripts/research-module.mjs run knowledge sync \
  --json '{"workflow_id":"knowledge-linking-system","basis_file":"event-workflows/<native-run>/latest.json","max_items":20}'

node scripts/research-module.mjs run knowledge sync \
  --json '{"workflow_id":"knowledge-linking-system","max_items":20}'

node scripts/research-module.mjs run knowledge status \
  --json '{"workflow_id":"knowledge-linking-system","status":"review_pending","offset":0,"limit":20}'
```

같은 workflow ID로 호출하되 독립 module 작업의 `--job` ID는 호출마다 달라야 한다. 생략하면 native 실행기가 새 작업 ID를 만든다. 같은 작업 ID의 `resume`은 그 작업의 고정 입력만 재개한다. 이 기능은 registry의 엄격한 CLI 계약과 MCP에 함께 노출된다. detailed 모드는 `knowledge_sync`/`knowledge_status`를 사용한다. compact 모드는 `research_modules`에서 knowledge의 sync/status 입력 계약을 확인한 뒤 `research_execute`의 `module: "knowledge"`, `operation: "sync"` 또는 `"status"`, `parameters`로 같은 작업을 실행한다. 두 모드 모두 반환된 작업 ID의 완료 상태와 저장 결과를 확인한다.

- `pending`: 이번 호출의 `max_items`0~256 안에서 아직 확인하지 않은 항목. 상태는 `yielded`이며 다음 호출이 이어서 처리한다.
- `ready`: 현재 판본의 native 승인과 실제 근거가 일치한 항목.
- `review_pending`: native 의미 검토·현재 사실 재연결·원문 판본 재검토가 필요한 항목.
- `blocked`: 현재 정의 승인, 회차의 일부 기사 승인, 주제가 인용한 Signals/Knowledge 승인 또는 native 검증이 빠진 항목. 빈 Signals도 회차 전체 기사 승인을 먼저 확인한다.

정의·양끝 관계·Signals 회차·주제의 명시적 Knowledge/관측 이력에 각각 입력 지문을 둔다. 관련 없는 정의가 변경되어도 이미 검토한 관계나 주제를 반복 검토하지 않는다. 같은 입력은 완료 checkpoint와 index를 재사용하고 `processed_items: 0`을 반환한다. 새 승인·정의·근거·기사 판본이 생기면 영향을 받는 항목만 다시 확인한다. 같은 입력 판본으로 돌아오는 경우도 과거 checkpoint를 덮어쓰지 않고 새 checkpoint를 추가한다. 새 graph에서 기존 사건이 빠지거나 기사 교체의 native revision 이력이 빠지면 마지막 성공 상태를 유지하고 거부한다.

기사 의존성은 현재 native `run`과 `file_hashes`의 정확한 원고·사실·문서·parse·편집 검토·승인 SHA를 함께 고정한다. 같은 원문 bytes로 기사만 재검토한 경우에도 Signals/주제의 옛 사실 연결을 다시 확인한다. 항목의 구현 지문은 그 검토 종류가 사용하는 지식 helper만 포함한다. 공통 원문/graph 검증기의 구현 지문도 전체 frozen input에 보존하며 매 sync에서 실제 native 검증을 수행한다.

이전 v1 항목 지문은 **동일한 정확한 graph와 변경되지 않은 지원 구현**에서만 v2로 옮긴다. 현재 canonical·승인·관측 의존성을 구식 지문으로 다시 계산해 원래 SHA가 일치한 항목만 재사용하고 `migrated_items`에 집계한다. 정의나 승인이 바뀐 항목은 새 검토 대기열로 남는다. native 승인·canonical·과거 checkpoint는 수정하지 않는다. 먼저 이전 basis로 migration을 마친 뒤 새 basis를 전달한다. 이전 지문 상태에서 graph나 지원 구현이 먼저 바뀌면 마지막 포인터를 보존하고 migration 오류를 반환한다.

기존 connection 승인 입력에 관련 없는 옛 정의 판본이 포함되어 있더라도 역사적 native 영수증 전체를 검증한 뒤 관계별 **현재 양끝 SHA와 현재 양끝의 승인 사실**을 다시 확인한다. 한 관계의 stale 판본이 다른 유효한 관계의 승인을 무효화하지 않는다. 승인 생성과 canonical 반영은 기존 `knowledge.review`, `knowledge.connections` 및 기존 반영 경로를 사용하며, 다음 sync가 새 결과를 자동 인식한다. sync 자체는 새 의미 관계·승인·공개 콘텐츠를 만들지 않는다.

상태는 `.local/research/local-ai/runs/<workflow_id>/knowledge-linking/`에 저장한다. `config.json`의 vault 권한을 고정하고 `cycles/<입력 SHA>/input.json`·`checkpoint-<순번>.json`의 정확한 SHA와 이전 checkpoint 연결, `indexes/<내용 SHA>.json`을 보존한다. `latest.json`만 현재 checkpoint 포인터로 갱신한다. checkpoint 저장 직후 중단된 경우 다음 sync가 그 checkpoint를 검증해 복구한다. 동시에 실행할 수 없으며 죽은 작업의 잠금은 status에 표시된 정확한 `recover_lock_owner`를 명시해야 복구한다. 살아 있는 PID의 잠금은 복구하지 않는다.

`knowledge.status`는 저장 상태만 읽고 필터·`offset`·`limit`1~100으로 분할 반환한다. `index`가 있으면 반환된 정확한 path/SHA를 기존 `knowledge.read`에 전달한다. status/read는 원문이 잠시 접근 불가능해도 저장본을 읽을 수 있지만, 새로운 sync는 매번 native 원문 bytes·parse·revision proof를 재검증한다. 승인 파일·canonical·basis·구현 지문이 실행 중 바뀌면 마지막 성공 포인터를 교체하지 않는다. `partial`의 `projection_error`와 `native_errors`는 숨기지 않는다.

이 workflow는 기존 core/이벤트 실행기나 에이전트가 계속 호출할 수 있는 영속 실행 경로다. 자동 예약이나 상주 프로세스의 가동 여부와는 별개다. 모델 호출·원문 요청·canonical 쓰기는 각각 0이며, 승인 대기 상태를 운영 완료나 reviewed-empty로 올리지 않는다.

프로젝트 루트에서 실행한다. 결과는 `.gitignore`에 포함된 `.local/research/local-ai/ontology/<snapshot>/graph.json`에 **새 파일로만** 저장된다. 같은 스냅샷 이름의 파일은 덮어쓰지 않는다.

```sh
node scripts/research-ontology.mjs build \
  --snapshot reviewed-pilot-v1 \
  --approved-run 20260928-rubygems-sep13-extract-v1

node scripts/research-ontology.mjs timeline \
  --snapshot reviewed-pilot-v1 --entity 'rubygems.org team'

node scripts/research-ontology.mjs trace \
  --snapshot reviewed-pilot-v1 --claim-id <검토된-claim-id>

node scripts/research-ontology.mjs concept \
  --snapshot reviewed-pilot-v1 --concept-id <검토된-concept-id>
```

`trace`는 주장·사건·기사와 짧은 원문 인용, URL, 원문 SHA, parse/block ID를 되돌린다. `timeline`은 **정확한 편집 표기**가 같은 사건과 검토 주장 상태를 날짜순으로 보여 준다. `concept`은 명시적으로 연결된 승인 기사만 보여 준다. 명령의 JSON 출력과 그래프 파일에는 비공개 인용·검토 정보가 들어갈 수 있으므로 공개 저장소·웹·RSS로 복사하지 않는다.

원문 정정·제외를 검토할 때는 `impact`로 현재 승인 결과의 직접 의존을 조회한다. 세 선택자 중 하나만 사용하고, 주장 ID는 검토 run을 함께 지정한다.

```sh
node scripts/research-ontology.mjs impact \
  --snapshot <승인-스냅샷-ID> --source-version-id <정정-대상-기존-원문-판본-ID>

node scripts/research-ontology.mjs impact \
  --snapshot <승인-스냅샷-ID> --claim-id <검토된-claim-id> --run <검토-run-ID>

node scripts/research-ontology.mjs impact \
  --snapshot <승인-스냅샷-ID> --event-id <고정-사건-ID> \
  --note-review-run <Signals-또는-TrendTopics-승인-run-ID>
```

현재 기사에서 실제 사용한 사실, 명시한 전문용어의 관련 사건 이력, 현재 정의의 native note-review 근거를 반환한다. 정의용 배경 원문은 기사에 등장하지 않아도 찾는다. 추가 Signals/TrendTopics는 명시한 승인 판본만 조회하며 최신 전체 기록을 조회했다고 간주하지 않는다. native 사실 영수증이 없는 기존 정의는 내부 `unbound_definition_paths`에 남기고 URL·별칭·공동 등장으로 의존을 추정하지 않는다. 이전 기사 판본은 중복 기사로 반환하지 않고 수정 승인 계보를 검증한다.

누적 기록 조회는 원문 시각과 기사에 검토된 달력 날짜를 분리한다. 원문 달력 날짜를 유지한 기사와 한국시간 날짜를 사용한 기사를 모두 처리하되, 관측의 시각은 해당 기사에서 실제 사용한 사실의 정확한 원문 시각과 일치해야 한다. 본문 bytes가 같은 근거 재승인의 자기 before hash는 새 내용 판본이나 순환 연결로 해석하지 않는다. 서로 다른 판본의 경쟁·순환과 동일 bytes의 상충 근거는 계속 거부한다.

완전한 Signals 승인에 아직 native 주제 승인이 없는 관측이 포함될 수 있다. 모든 관측의 원문·사건·날짜 검증을 수행한 뒤, 명시적으로 승인된 주제에 해당하는 관측만 주제 조회에 투영한다. 원 Signals의 관측을 삭제하거나 reviewed-empty로 변경하지 않는다. 해당 주제 승인을 추가하면 같은 관측을 다시 작성·수집하지 않고 연결한다. 미승인 주제의 설명이나 분석을 현재 조회에 사용하지 않는다.

일일 core의 실제 `source_revision` 대기는 고정 영수증과 기존 승인·현재 원문 파일을 확인한 후 이전 승인 판본을 조회해 `source_revision_impacts`로 연결한다. 보충 원문 검토는 이 변경 분기로 처리하지 않는다. 결과와 근거를 해시로 고정하고 같은 원문의 조회·승인 입력 로딩을 재사용한다. 조회 결과는 정정·제외·재승인·발행을 실행하지 않는다.

`knowledge-index`와 일일 core의 지식 색인은 현재 승인 기사 전체에서 기존 `reconcilePaperVersions`를 재사용한다. 동일 DOI의 대소문자 표기와 같은 arXiv의 v1/v2가 다른 `work_id`로 지정되면 색인을 반환하지 않는다. 제목 유사도는 논문을 합치는 근거가 아니다. 명시적으로 검토된 같은 `work_id`의 사전공개본·후속 출판본은 `research_papers`에서 원 식별자와 날짜별 기사·원문·전문/초록·출판 상태를 보존한다. 일반 기사와 심층 메타데이터가 같은 논문을 담아도 한 기사 등장은 한 번만 표시한다. 같은 기사 안의 상충 메타데이터는 거부한다. 전문 여부나 최신 출판 상태를 과거 등장에 소급하지 않는다.

같은 `work_id`도 식별자 집합이 서로 연결되어야 한다. 동일한 정규화 식별자를 공유하거나, 기존 원문 검토를 통과한 한 등장 기록에 함께 확인된 식별자들이 연결을 이루는 경우에만 전이적으로 결합한다. 입력 순서와 관계없이 모든 등장 기록을 확인하며, 연결되지 않은 DOI·arXiv·원문 URL 집합은 `Paper work identity conflict`로 재검토를 요구한다. ID만 같다는 이유로 서로 다른 논문을 합치지 않는다.

```sh
node scripts/research-ontology.mjs paper \
  --snapshot <승인-스냅샷-ID> --work-id <검토된-work-id>
```

논문 단독 조회도 전체 색인과 같은 native 승인·수정 계보·식별자 관문을 따른다. 명시적 수정으로 바뀐 논문 ID는 현재 이력에 사용하고 이전 ID는 해당 기사의 `previous_versions`에 남긴다. 철회·제외된 과거 ID를 현재 논문 관계로 다시 연결하지 않는다. 이 읽기 모델은 기존 승인 입력에서 생성하며 별도 논문 원본 저장소나 지도 노드를 만들지 않는다. 논문 정보가 없으면 빈 논문 목록을 출력하지 않는다. 같은 이름의 다른 연구자를 합치거나 기업 별칭을 승인하는 기능과는 별개다.

검토된 연구 사업화 관계의 `person_id`와 이름 검사는 단일 심층 검토와 누적 색인에서 같은 `reconcilePersonNames`를 사용한다. 같은 고정 ID에 서로 다른 이름을 승인한 경우 자동으로 합치거나 별칭을 추정하지 않고 재검토를 요구한다. 같은 이름이라도 ID가 다르면 다른 인물로 유지한다. 소속은 관계의 `as_of`와 실제 검토일별로 보존하므로 나중 소속을 이전 관계에 덮어쓰지 않는다. `research_people`는 명시적 관계·기사·검증 사실과 직접 원문 근거를 모은 읽기 모델이며 기술자문을 창업으로 승격하지 않는다. 관계가 없으면 목록도 생략한다.

```sh
node scripts/research-ontology.mjs person \
  --snapshot <승인-스냅샷-ID> --person-id <검토된-person-id>
```

이 조회 역시 전체 native 승인·이력·논문/인물 식별 관문을 따른다. 일반 기업 표기나 인물 이름을 전문용어 노드로 추가하지 않는다.

## 사건별로 검토한 기업 식별과 별칭

기존 `entity_timelines`는 정확한 편집 표기만 모으는 기능으로 보존한다. 기업별 고정 ID 조회는 비공개 `research-company-identity-review/v1`을 명시적으로 전달한 경우에만 `company_timelines`를 생성한다. 추적 목록의 aliases, 같은 이름, 공동 등장 또는 제목 유사도를 병합 승인으로 사용하지 않는다. 별도 기업 원본 저장소나 지도 노드를 만들지 않는다.

검토는 `reviewer`, `reviewed_at`, `companies`를 갖는다. 각 기업은 `company_id`, `label`, `kind`, `assignments`를 기록한다. kind는 company / legal_entity / corporate_group / brand / division이며 제품은 기업으로 등록하지 않는다. 회사의 탐색용 company 유형은 특정 등기 법인임을 증명하지 않는다. 법인 또는 거래 이후 정체성은 해당 원문으로 따로 검토한다.

각 assignment는 다음 입력을 전부 기록한다.

- 원 승인 `run`, `event_id`, `approval_files_sha256` = sha256(JSON.stringify(native input.file_hashes)).
- 해당 사건의 승인 기사 entities 또는 선택한 검증 사실 subject에 실제 있는 `entity_label`.
- 같은 사건의 선택한 직접 인용에 실제 있는 `source_names`와 `claim_ids`.
- 확인한 관계 시점 `as_of`, `identity_checked: true`, `kind_checked: true` 및 비공개 reason.

전체 승인 그래프와 수정 계보를 먼저 검증한 후 현재 승인 입력의 파일 해시·사건·참조된 검증 사실과 대조한다. 원고의 미참조 사실과 다른 사건의 사실, 상충하는 승인 판본, 원문 인용에 없는 이름은 연결할 수 없다. 같은 사건/표기를 두 ID에 배정하는 것도 거부한다. 라틴 이름의 단어 일부가 우연히 인용에 있다는 이유로 이름을 승인하지 않는다. 한국어 조사·접미 표현은 원문 이름 포함 확인과 명시적 의미 검토를 함께 사용한다.

같은 이름의 다른 ID는 분리한다. 같은 ID의 별칭은 검토한 사건에만 연결하고, 같은 이름이 있는 나머지 기사에는 전파하지 않는다. 두 별칭을 같은 사건에서 확인해도 이력의 사건은 한 번만 출력한다. 법인·브랜드·사업부는 다른 ID로 기록하고, 매각 계약을 소유권 이전 완료로 표현하거나 이전 사업부를 새 법인에 자동 병합하지 않는다. 이름 변경·법인 전환은 새 원문 대조가 필요하다.

조회 이력에는 원 사건 발표일·기사 재검토일과 별칭 확인의 as_of/검토일, 선택한 사실 ID, 직접 원문 URL·인용·판본 해시·parse/block을 보존한다. 과거 이름을 최신 이름으로 덮어쓰지 않는다. 검토자·내부 reason·승인 파일 경로/지문은 독자용 읽기 모델에 넣지 않는다. 이 결과도 비공개 CLI 산출물이므로 공개 projection 없이 파일을 통째로 배포하지 않는다.

```sh
node scripts/research-ontology.mjs company \
  --snapshot <승인-스냅샷-ID> --company-id <검토한-company-id> \
  --company-review .local/research/<기업-식별-검토>.json

node scripts/research-ontology.mjs knowledge-index \
  --snapshot <승인-스냅샷-ID> \
  --company-review .local/research/<기업-식별-검토>.json
```

일일 core도 `--company-review FILE`을 받는다. 검토 파일 경로와 원 bytes SHA를 request/input에 고정하고 파일 변경 또는 다른 검토로 같은 run을 재개하면 작업 전에 거부한다. 실행 중 변경도 지식 색인 생성 전에 확인한다. 기존 수집·원문·모델 결과는 재사용하며, 검토 대상 승인본이 정정/제외되면 해당 연결을 새로 검토해야 한다. 기업 검토를 전달하지 않은 기존 실행/조회는 기업 이력 필드를 생성하지 않는다. 전체 기업 별칭의 소급 완료를 의미하지 않는다.

스냅샷은 생성 시점의 승인 입력 해시와 자체 내용 해시를 가진다. 승인 원고·원문·검토가 바뀌면 새 이름으로 다시 생성한다. 기존 스냅샷을 현재 사실로 자동 승격하지 않는다. 현재의 08시 수집·발행 예약과는 연결하지 않았고 공개 사이트에도 투영하지 않는다.

## 기존 전문용어·변화 이력의 공통 조회

`knowledge-index`와 `impact`는 일일 core와 동일한 `--knowledge-reviews FILE`, `--trend-reviews FILE` 입력을 받는다. 전자는 현재 정의의 정확한 `{run,path,sha256}` 선택 배열이고, 후자는 기존 Signals·TrendTopics를 검토한 native 승인 run 배열이다. 최대64개의 서로 다른 안전한 ID만 허용하고 전체 노트 승인·원문·현재 그래프의 기사와 사실 연결을 확인한다. 파일명이나 `reviewed` 값만으로 검토를 대신하지 않는다.

```sh
node scripts/research-ontology.mjs knowledge-index \
  --snapshot core-existing-articles-linked-20261009-v1 \
  --knowledge-reviews .local/research/core-reviewed-knowledge-selections-20261009-v2.json \
  --trend-reviews .local/research/core-reviewed-trend-runs-20261009-v3.json

node scripts/research-ontology.mjs impact \
  --snapshot core-existing-articles-linked-20261009-v1 \
  --event-id bcbd171efb3de844 \
  --knowledge-reviews .local/research/core-reviewed-knowledge-selections-20261009-v2.json \
  --trend-reviews .local/research/core-reviewed-trend-runs-20261009-v3.json
```

`impact`는 선택한 변화 기록 승인과 기존 `--note-review-run`을 중복 없이 함께 조사한다. 조회는 원고 수정이나 발행 권한이 아니다. 근거 있는 단일 사건 이력은 표시하고, 검토한 빈 Signals는 근거 의존성만 확인한다. 빈 분석이나 관측 사건을 만들지 않는다. 이전 기사 승인 대신 현재 용어 연결 수정본을 사용할 때는 원 사실 payload·원문/parse hash를 대조하고 명시적인 새 노트 승인에 연결한다. 전체 graph 검증은 조회마다 유지하며 동일 조회 안의 사실 추적에는 immutable reader를 재사용한다.

## 검증

```sh
node --test tests/research-ontology.test.mjs
npm run test:garden
npx tsc --noEmit
```

회귀시험은 미승인·미참조 주장 제외, 직접 원문 근거 연결, 계획/완료 상태 보존, 사건 ID 충돌, 해시·관계 타입 오류, 기존 스냅샷 덮어쓰기 거부를 확인한다. 실제 승인 run으로 스냅샷을 만든 뒤 `timeline`과 `trace`의 원문 경로를 확인해야 운영 자료에 적용한 것이다. 구조 검증만으로 기업 동일성, 수치의 비교 가능성, 출처 독립성 또는 기사 전체의 사실 정확도를 새로 승인하지 않는다.

2026-09-29 로컬 검증에서는 RubyGems·OpenAI Jalapeño·연구 사업화 심층 기사 승인 run 세 개로 `reviewed-evidence-20260929-v1`을 만들었다. 사건 3개, 참조된 검토 주장 27개, 근거 블록 38개, 원문 판본 5개가 연결됐다. RubyGems 기업 표기의 사건 조회, 한 주장부터 원문 SHA·parse/block까지의 역추적, `inference` 개념의 명시적 기사 연결을 CLI로 확인했다. 생성 파일은 비공개 `.local/`의 0600 파일이며 Drive·작성 `vault/`·공개 사이트·기존 예약에는 반영하지 않았다.

### 기업 이력의 사실과 검토 날짜 (2026-10-09)

company_timelines.events.facts는 기업 식별 assignment에서 명시 선택한 verified 사실의 statement/subject/claim_kind/event_state/published_at/effective_period/numbers/reviewed_at/evidence를 제공한다. 같은 사건의 여러 assignment가 같은 사실을 지정하면 claim_id로 한 번만 표시한다. 이름 유사성으로 다른 기사의 사실을 추가하지 않는다. assignment.reviewed_at을 지정하면 원래 검토일을 보존할 수 있으며 기사 검토 이전·ledger 이후·빈 날짜는 거부한다. 생략한 기존 v1 검토는 ledger 날짜를 사용한다.

### 원문 게시일과 실제 사건일 (2026-10-09)

명시적으로 검토한 `source-reported-event-date` 기사는 `published_at`을 원문 게시일로 보존하고 `occurred_at`에 완료 사건 날짜를 별도로 기록한다. 원문 게시일에 기준한 한국어 현재/직전 달 표현, 정확한 직접 인용과 사용 검증 사실을 확인하며 수집일·검토일로 연도를 추정하지 않는다. 사건 노드와 지식 색인의 사건·명칭·기업·전문용어 이력은 `occurred_at || published_at`으로 정렬한다. 기존 입력에는 빈 사건일 필드를 추가하지 않는다. 논문 출판일·관계 as_of·검토일을 이 값으로 대체하지 않는다. 새 검토가 과거 사건일을 확인해도 이전 승인 판본과 원 게시일·ID/주소를 보존한다.

Signals의 기존 `event_date`는 그 사건에서 선택한 검증 사실의 정확한 원문 게시일·시각이다. 실제 사건일이 다르면 선택한 같은 사건의 verified 사실에 `effective_period`로 정확히 기록된 `YYYY-MM-DD`만 optional `occurred_at`에 명시한다. 계획·미확인 상태나 게시일 이후 날짜, 다른 사건·다른 게시 시각의 사실, 근거에 없는 날짜를 거부한다. native 기사에도 `occurred_at`이 있으면 관측 날짜와 일치해야 한다. `scripts/research/signal-dates.mjs`의 공통 검증을 새 노트 승인과 native 투영이 사용하며, 공개 Signals는 날짜 형식과 기사 상충을 확인한다. 이 검사는 기사 승인을 생성하거나 source-only 검증을 기사 승인으로 승격하지 않는다.

트렌드의 사건 이력·날짜별 집계·공개 표시는 관측의 `occurred_at`을 우선하고 원문 게시일로 fallback한다. 정확한 게시 시각 `event_date`와 투영의 `source_published_at`, 기사 `published_at` 및 사건·관측 ID는 유지한다. 미지정 v1 노트와 저장 승인에는 빈 필드를 추가하지 않고, 기존 원고의 before/after와 승인 SHA를 그대로 보존한 명시적 수정 승인으로 새 사건일을 연결한다. 과거 회차의 포함 범위는 기존 회차 순번으로 계속 제한한다.

legacy 관측이 실제 사건일을 `event_date`에 저장했다면, 기존 `occurred_at`·`source_published_at` 둘 다 미지정이고 동일 사건의 기존 `event_date`가 새 `occurred_at`과 정확히 같을 때만 게시일과 사건일을 분리할 수 있다. 새 `event_date`와 사건일은 같은 사건의 검증 사실·native 기사 날짜 관문을 계속 통과해야 한다. 이전 날짜와 정본 SHA는 승인 before/after 이력에 보존하며 일반 게시일 변경을 허용하지 않는다.
