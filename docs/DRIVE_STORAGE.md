# Google Drive 자료 보관 및 원문 수집

## Drive 원본과 로컬 목록·제한 캐시 (2026-10-14)

`scripts/research-storage.mjs ACTION --root .local`은 비공개 payload의 공통 저장 경로다. `.local/.storage/catalog.sqlite`는 기존 source/event/approval를 복제하는 지식 DB가 아니라 상대 파일 경로·내용 SHA·크기·Drive 파일 ID·ZIP member·다운로드 대기의 목록이다. 원본 ID, native 입력·승인 SHA, 기사 주소와 공개 데이터는 변경하지 않는다. 런타임·모델·자격 증명·Git과 현재 실행/잠긴 자료는 정리하지 않는다.

cold 모드의 런타임은 Node22.13 이상(내장 SQLite)과 Python3.9 이상이다. 현재 전환은 Node26.4.0/Python3.9.6에서 확인했으며 추가 패키지를 설치하지 않았다.

`prepare`는 원문과 큰 파싱/실행 payload, 미리보기 작업 사본을 내용 해시로 중복 제거한다. 기존 검증된 native archive를 우선 참조하고 부족한 내용만 압축 묶음으로 준비한다. `pending`의 새 묶음은 기존 Drive 연결로 비공개 Research에 보관한다. `verify`는 최신 parent/ID/크기/비공개 metadata와 실제 다운로드 SHA·member SHA를 요구한다. 기존 archive는 보존된 원격 raw proof 및 그 검증 뒤 수정되지 않은 최신 metadata를 함께 대조해 재다운로드를 생략할 수 있다. 새로운 archive에는 이 생략이 적용되지 않는다.

`enable` 뒤 공통 `safePath/readJSON`은 사본이 없는 자료를 새 소식 없음/빈 JSON으로 처리하지 않고 `STORAGE_PENDING`을 반환한다. 독립 worker와 MCP는 `waiting_for_storage` 및 정확한 파일 ID/판본 해시를 남긴다. 연결된 Drive 도구로 해당 파일을 받아 `hydrate`한 뒤 원래 job을 명시 재개한다. 모델을 다시 돌리거나 사실/편집 승인을 새로 만드는 단계가 아니다. 기존5개 MCP 도구의 `research_execute`에서 `module: collection`, `operation: storage`를 사용한다. 새 외부 도구·예약·유료 API는 도입하지 않는다.

`evict`는 SHA가 그대로이며 원격 보관이 검증된 사본만 지운다. 기본 payload 캐시 상한은2GiB이며 완료 worker 뒤 같은 정책을 적용한다. 현재 정규 저장소는 검증 원문 작업 집합 약20.3GB보다 작은 상한 때문에 복원 직후 재삭제되는 현상을 확인하여, 기존 `enable` 계약으로32GiB(`cache_bytes: 34359738368`)를 명시했다. 이는 공간 예약이 아니며 외장 볼륨 여유 공간을 확인해 적용한 운영 설정이다. 테스트 fixture는 자체 `enabled:false` 경계를 두어 운영 catalog·정리 정책을 상속하지 않는다. 변경 파일·미보관 자료·현재 native lock이 있는 작업은 유지한다. 새 공통 원본 쓰기는 목록에 기록하고 다음 `prepare/pending`의 Drive 보관 대상으로 남는다. 기존 연결과 아래 로컬 OAuth adapter를 선택할 수 있다. 둘 다 사용할 수 없으면 다운로드 대기를 유지한다.

이번 전환은 payload298,204파일/19,300,370,522bytes를46,073개 내용으로 분류하고 기존197개 Drive archive와 신규118ZIP(2,039,105,075bytes)을 연결했다. 기존 archive/직접 ZIP512등록 모두 원격 검증을 마쳤다. 새118ZIP은 실제 다운로드와 각 member SHA를 확인했다. 복구용25,488,820bytes 목록은 [Drive catalog](https://drive.google.com/file/d/1-11OghUBQ3yQNjk6huzfHWbhMYDJnzq5/view)에 보관하고 원격 gzip SHA·298,204파일/58,023object/512bundle을 대조했다. object에는 참조되지 않는 보관 내용도 포함되므로46,073과 다른 수량이다.

검증된269,063개 사본/17,166,781,741bytes를 정리했다. 실제 할당된 프로젝트 전체는22,868,952→5,761,772KiB(약21.8→5.5GiB), `.local`은22,370,480→5,263,224KiB로 줄었다. 복원 뒤 목록상의 작업 사본은2,136,045,668bytes로2GiB 상한 안에 있다. 원문·parse·native 승인의 실제 cold read→Drive679KB archive1개→필요한37개 경로 복원 뒤 source SHA와 승인 SHA가 전환 전과 동일했다. 실제 stdio MCP도5도구/12모듈66작업의 parsing.inspect 완료를 확인했다. 재수집·모델·기사 재작성·공개 배포·Git commit/push는 수행하지 않았다.

복구에는 `export`가 생성한 gzip JSONL과 그 SHA를 사용한다. 새 private root에 실제 Drive catalog를 내려받아 `import`에 `catalog_path/expected_sha256`를 전달하면 원문 사본 없이 목록을 복원한다. `.storage/remote-catalog.json`에 인증된 파일 ID/부모/원격 SHA를 보존한다. Python의 보관·수집 경로도 같은 목록을 확인해 cold 파일을 없는 자료로 해석하거나 다시 수집하지 않는다. 전체 과거 자료를 한 ZIP으로 재포장하는 legacy 명령은 필요한 cold bytes의 다운로드 대기를 명시한다. 일일 작성 원본은 기존 approved-preview 경로, 새 조사 payload는 storage prepare/pending/verify/export 경로를 사용해 전체 연구 자료의 반복 복사를 줄인다.

내장 임시 공간 부족 때문에 이번 전송·표적 검사에는 외장 `.local/.storage/tmp`를 사용했다. 연구 자료는 외장 저장소에 있으며 모델/런타임·코드·작은 운영 기록은 유지한다. 현재 결과와 증거는 빌드19.528과 `.local/research/drive-cold-store-20261014/`에서 확인한다.

## 독립 로컬 Drive OAuth (2026-10-16)

`scripts/research-drive.mjs`는 Codex 커넥터 없이 cold payload와 복구 catalog를 읽고 보관한다. Google Desktop OAuth·127.0.0.1 임의 포트·PKCE S256·state 검증을 사용한다. 추가 SDK·유료 API·예약은 없다. GPT와 로컬 모델은 같은 `collection.storage`를 호출하고 인증은 adapter가 담당한다. 작성 원고의 승인·release와 실제 사이트 배포는 기존 관문을 따른다. 이 adapter가 정규 운영을 시작하거나 원고를 임의 승인하지 않는다.

### 최초 연결

1. 사용자 Google Cloud 프로젝트에서 Drive API를 사용 설정하고 OAuth 동의 화면을 구성한다. 외부/테스트 상태라면 실제 사용할 계정을 테스트 사용자로 등록한다.
2. OAuth 클라이언트 유형을 **데스크톱 앱**으로 만들고 client JSON을 로컬에 내려받는다. 기존 Codex 연결의 토큰은 가져오지 않는다.
3. 아래 명령으로 파일을 등록하고 브라우저에서 Google 계정 동의를 완료한다. JSON 내용이나 토큰을 채팅에 붙여 넣지 않는다.

```sh
node scripts/research-drive.mjs auth configure --client /absolute/path/desktop-client.json --mode readwrite
node scripts/research-drive.mjs auth login --open-browser
node scripts/research-drive.mjs auth status
```

`--mode readonly`는 기존 보관 파일 조회·다운로드만 허용한다. 기존 커넥터가 보관한 파일 전체를 복원해야 하므로 읽기는 `drive.readonly`, 쓰기까지는 `drive` scope를 요청한다. `drive.file`만으로는 다른 앱이 만든 기존 파일 전체를 읽을 수 없다. Google 권한은 scope 단위이며 애플리케이션은 별도로 `data/research-drive-policy.json`의 프로젝트 루트와 비공개 부모 계보를 검사한다. [Google Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Drive 권한 범위](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

기본 자격 증명은 외장 프로젝트의 `.local/.storage/credentials/drive/`에만 저장한다. 디렉터리0700·파일0600, symlink 거부·원자적 쓰기·refresh 잠금을 적용하며 cold archive와 Git에서 제외한다. access token이 만료되면 refresh하며 HTTP401은 한 번만 새 token으로 재요청한다. refresh가 취소·만료되면 `DRIVE_REAUTH_REQUIRED`로 멈추고 `auth login`을 다시 수행한다. `auth logout`은 로컬 토큰만 제거하며 Google 계정의 앱 권한 철회는 별도로 수행한다. scope/client를 바꾸려면 logout→configure→login 순서다.

### 저장 대기 해소와 새 자료 보관

```sh
node scripts/research-drive.mjs storage status
# pending 다운로드에서 최대1묶음의 필요한 원본 경로만 복원한다.
node scripts/research-drive.mjs storage pull --limit 1
# 새 자료는 기존 prepare로 묶음만 준비한 다음 로컬 adapter로 보관한다.
node scripts/research-storage.mjs prepare --root .local --input /absolute/path/prepare-parameters.json
node scripts/research-drive.mjs storage push --limit 1
```

prepare JSON의 `parent_id`는 정책의 `archive_parent_id`로 명시한다. push는 대기 중인 최대 limit 묶음만 처리하고 전체 자료를 다시 수집·재작성·재포장하지 않는다. 각 묶음을 실제 내려받아 SHA·ZIP member를 기존 Python 검증기에 대조한 뒤 목록을 export해 Drive에 저장하고 원격 gzip bytes도 대조한다. `.storage/remote-catalog.json`은 확인된 목록 ID·SHA와 metadata를 보존한다. source 캐시는 push에서 자동 evict하지 않는다. 읽기·쓰기 모두 공유됨/휴지통/다른 루트/shortcut을 거부한다.

같은 동작은 기존 MCP5도구 안의 `research_execute`에서 `module: collection`, `operation: storage` 및 `action: remote-status|remote-pull|remote-push|remote-import`로 호출한다. `limit`은1~20, `bundle_id`는 선택적으로 지정한다. 기존 `scripts/research-storage.mjs`도 같은 action을 받는다. 자동 planner의 storage 제외는 유지하며 운영자/supervisor가 명시 호출한다. 자격 증명이나 업로드 session URI는 tool 결과에 포함하지 않는다.

새 머신의 빈 private root에서는 동일한 로컬 인증 설정을 한 뒤 보관된 catalog의 정확한 ID/SHA로 복원한다. 원문을 먼저 내려받을 필요는 없다.

```sh
node scripts/research-drive.mjs storage import --file-id <verified-catalog-ID> --sha256 <verified-catalog-SHA>
```

### 중단 후 재개

업로드 전 `files.generateIds`로 ID를 고정하고 비공개 transfer journal을 저장한다. 네트워크 오류·응답 유실 후에는 같은 명령/입력으로 명시 재개한다. 기존 파일의 실제 raw readback 또는 resumable308/Range를 확인해 남은 bytes만 전송한다. session404는 같은 ID로 session만 다시 만들며, 오류를 성공으로 바꾸거나 새 ID로 중복 생성하지 않는다. 완료한 묶음은 재사용하며 catalog만 마무리할 수 있다. 다운로드는 실제 남은 `.part` 크기로 Range를 이어받고 SHA·원격 판본이 다르면 기존 자료를 보존한 채 멈춘다. [Google resumable upload](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [ID 사전 생성](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds).

잠금이 남으면 status의 owner/pid를 확인한다. 프로세스 종료가 확인된 경우에만 `auth recover --lock auth|storage --owner <exact-UUID>`로 기존 공통 잠금 회수를 사용한다. 살아 있거나 확인할 수 없는 프로세스의 잠금은 회수하지 않는다. pull이 끝나도 원래 native job은 자동 재실행하지 않고 동일 job/체크포인트에서 명시 재개한다.

정규 실행용 `storage ... --regular`와 MCP `regular: true`는 개발 완료 gate를 네트워크·인증·잠금 전에 확인한다. 현재 `development_pending`이면 요청·쓰기0으로 끝난다. 별도 플래그 없는 명령은 사용자가 명시한 개발/복구 전송이다. 실제 계정 검증을 끝내기 전 auth 설정 저장이나 프로토콜 fixture 통과만으로 운영 연결 완료를 표시하지 않는다.

## 사건 중심 승인 결과의 로컬 발행 인계

`research-publication.mjs handoff`는 `edition.advance`의 정확한 native workflow 경로·SHA를 받아 기존 승인 원고를 `research-daily-publication-handoff/v3`로 인계한다. 원문·parse·원고·승인 파일은 해시 참조로 재사용하고, 변경 가능한 workflow 결과만 작은 비공개 체크포인트로 고정한다. 같은 입력의 재호출은 같은 인계를 반환하며 모델을 실행하지 않는다. 이후 workflow가 진행해도 이전 인계는 당시 승인 범위를 유지한다. 새 검토가 끝나면 같은 인계 run에 최신 workflow 경로·SHA를 전달해 다음 판본을 준비한다.

`edition.advance`와 사건 중심 `research:core`는 native 결과 저장 직후 이 인계를 자동 준비하고 `publication_handoff/publication`을 반환한다. 독립 `publication.prepare/status`는 공통 CLI·worker·MCP에 등록되어 있으며 `npm run module:publication`으로도 호출한다.

```sh
node scripts/research-publication.mjs handoff --root .local/research/local-ai \
  --run <publication-handoff-run> \
  --workflow event-workflows/<workflow-run>/latest.json \
  --workflow-sha256 <exact-native-workflow-sha256>
node scripts/research-publication.mjs handoff-status --root .local/research/local-ai \
  --run <publication-handoff-run>
```

반환된 `publication_handoff.path`를 기존 `research.mjs preview --publication-handoff`에 전달한다. v3 인계의 `knowledge_runs`는 preview가 자동 전달해 승인 때 선택한 정확한 전문용어 정의를 함께 사용한다. 추가로 검토한 노트는 기존 `--knowledge-run <run-id>`로 명시할 수 있으며 승인/파일 SHA 검증은 유지한다. 신규 회차 원고와 기존 기사 수정은 기존 preview의 서로 다른 입력 규칙을 따르며, `--group <group-id>`를 반복해 같은 경로의 사건만 선택할 수 있다. `write/update/correction` 중 실제 native 승인된 결과만 작성 입력이다. `update/correction`은 원 기사 ID·원 발표일·명시적 사실별 계보·전문용어 연결을 대조한다. `reuse`는 이전 승인 참조만 남기고 새 원고를 준비하지 않으며, `defer`·검토 대기·실패는 작성 입력에서 제외한다. 부분 workflow와 부분 수집 상태는 그대로 반환한다.

준비·상태 조회에는 Drive 인증이나 로컬 OAuth가 필요 없다. `approval_ready`는 로컬 인계 준비 상태이며 `candidate_published/drive_verified/public_verified/new_regular_operation_counted`는 모두 `false`다. preview와 기존 release 검토, connector 저장·raw bytes 확인, canonical import, publisher·공개 결과 확인은 각각 후속 관문이다. 기존 Codex Drive 커넥터를 유지하며 독립 로컬 인증을 새 필수 조건으로 추가하지 않는다.

## 승인 사본의 변경 원본 준비

`python3 scripts/prepare-drive.py --approved-preview <preview-run>`은 기존 preview의 원문·승인·원본 사본·생성 결과를 재검사하고, 공개 작성 네 폴더의 승인된 변경 Markdown만 해당 run의 `drive-authoring/files/`에 준비한다. 전체 자료실 준비 명령은 유지한다. 이 경로는 전체 연구 자료를 재복사·압축하거나 원문을 다시 수집하지 않는다.

`research-authoring.mjs compare --plan <파일> --observation <파일>`은 최신 Drive 부모 목록·대상 raw bytes SHA를 대조한다. 원하는 bytes는 `already_applied`, 원본 bytes는 동일 ID `update`, 신규 경로가 완전한 부모 목록에 없으면 `create`다. 다른 내용·동명 파일·누락 목록·10분 초과 조회는 거부한다. 업로드 응답이 불명확하면 재생성 전에 실제 부모 목록과 raw bytes를 다시 읽는다. 비교 함수는 쓰기를 실행하지 않는다.

현재 준비 결과는 `release_approved=false`, `upload_allowed=false`다. 비공개 시험 회차를 정규 회차로 자동 승격하지 않는다. 실제 작성 원본 저장·전수 Drive 스냅샷·공개 배포·WebsiteData는 기존 발행 관문으로 확인한다.

2026-09-13 사용자 지정 최종 저장 위치: [Projects / Tech Knowledge](https://drive.google.com/drive/folders/1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD). 폴더 ID `1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD`, 부모 Projects ID `1psoNS5hryuS9YGJg7JTK4AhG6X6B2LZE`.

로컬 `vault/`는 편집·검증·웹사이트 생성용 작업 사본이며 Drive 보관을 대체하지 않는다. 기존 iCloud와 로컬 자료를 삭제하지 않는다. 현재 노트는 원래 상대 경로로 Drive 루트에 보관한다. 구 iCloud와 이전 증거는 `Archive/Imports/` ZIP으로 내부 경로를 보존한다. 이 규칙이 과거 문서의 로컬 전용 저장 설명보다 우선한다.

## 매회 저장 완료 조건

1. 기존 취재·원고·개념·관측·웹 검증 절차를 유지한다. 최종 저장 전 이 문서를 읽는다.
2. Google Drive 연결로 대상 폴더와 `.local/drive-sync/receipt.json`의 파일 ID를 확인한다. Drive 파일의 수정 시각이 직전 영수증과 다르면 내려받아 비교·병합하고, 자동으로 덮어쓰지 않는다. 로컬 변경이 없더라도 원격 변경 검사를 생략하지 않는다.
3. `python3 scripts/prepare-drive.py --collect`를 실행한다. 새 출처를 수집하고 성공한 이전 수집 결과는 해시를 검증해 재사용한다. 실패한 URL은 24시간 후 재시도하며 이전 실패 기록도 보존한다. 재취재로 원문 변경을 수집할 때에는 기존 snapshot을 날짜별로 보존한 다음 새 버전을 저장한다. 차단·404·용량 초과·접근 실패를 숨기지 않는다. 현재 다운로드와 과거 취재 증거를 구분한다.
4. `.local/drive-sync/upload-manifest.json`은 업로드할 상대 경로·로컬 경로·크기·SHA-256·MD5를 제공한다. Drive 폴더별 목록으로 기존 경로를 찾고, 없는 폴더만 생성한다. 없는 파일은 upload_file, 기존 파일은 원격 변경 확인 뒤 update_file의 file_uri로 수정한다. Google 문서로 변환하지 않고 Markdown/JSON/CSV/ZIP 원본 형식을 유지한다. 같은 이름의 중복 파일을 만들지 않는다.
5. Sources의 출처 목록·스냅샷, Research의 조사 기록, 현재 노트를 함께 업로드한다. 원문 수집물과 작업 증거는 Drive 개인 보관용이며 공개 Git 저장소에 추가하지 않는다. 업로드 후 Drive 메타데이터의 ID·부모·크기·수정 시각을 확인하고, 가능하면 md5Checksum도 대조한다. 수집한 HTML은 직접 검토하기 전 captured_unreviewed 상태다.
6. 파일별 path, id, url, sha256, bytes, modified_time을 `.local/drive-sync/receipt.json`에 남기고 `Operations/migration-receipt.json`에도 보관한다. manifest 자체도 Operations에 업로드한다. 모든 변경 파일을 검증해야 Drive 저장 완료다. 연결 실패 시 로컬 결과를 보존하고 Drive 미완료를 보고한다.

기존 오전 8시 자동화가 이 경로로 저장한다. 예약 설정 변경만으로 실제 다음 회차 실행이나 자동 양방향 동기화 완료를 주장하지 않는다.

## 웹사이트 참조 데이터

`WebsiteData/`에는 실제 배포 사이트에서 읽어 온 검색 JSON, 지도 JSON, RSS와 페이지·기사·개념·연결 CSV를 보관한다. CSV는 배포본 JSON을 기준으로 만들며 웹주소와 검증된 Drive 원본 노트 링크를 함께 제공한다. `catalog.json`은 로컬 빌드 입력이라는 점을 구분한다. 수집 시각·파일 해시·로컬 생성본 일치 여부는 `snapshot.json`에 기록한다.

`scripts/prepare-drive.py`가 `scripts/export-website-data.py`를 호출하므로 기존 예약의 Drive 저장 목록에도 포함된다. 사이트 배포 후 실행하며, 배포 데이터 수집이나 색인 일관성 검사가 실패하면 저장 준비를 중단한다. 이것은 배포 데이터 보관 절차이며 Drive 파일 수정이 웹사이트에 실시간 반영되는 기능은 아니다.

별도 발행 checkout을 검증할 때는 `python3 scripts/export-website-data.py --repository <publisher-checkout>`을 사용한다. 공개 생성본·작성 원본·lineage와 검증된 Drive receipt를 모두 지정한 checkout에서 읽으며, 기본값은 스크립트가 있는 저장소다. 원래 검색 색인의 기업 필터 항목은 실제 URL과 쿼리로 대조한다. 독립 Drive 노트가 없는 검색 화면은 CSV의 노트 링크를 비워 두고 `snapshot.json`의 미매핑 목록에 기록한다.

Drive 폴더 전체 목록을 확인할 때는 직접 폴더 열거를 사용한다. 텍스트 검색 결과에는 CSV·JSON·XML이 빠질 수 있으므로, 검색 결과만으로 같은 이름의 파일이 없다고 판단하지 않는다. 기존 파일 ID·원격 raw SHA·수정 시각과 부모 폴더를 대조한 후 같은 ID로 갱신하고, 저장 후 직접 폴더 목록과 실제 다운로드 bytes를 다시 확인한다.

`remote-delivery`는 기존 WebsiteData 검증 영수증의 두 형식을 읽는다. native 영수증은 `path/file_id/sha256`, 이전 readback은 `name/file_id/sha256`를 사용한다. 이전 형식은 개별 행의 `verified: true`, 비공개 상태, WebsiteData 부모 ID가 일치할 때만 경로로 정규화하며, 쓰기 전 실제 raw bytes와 파일 ID가 그 영수증의 SHA·ID에 일치해야 갱신한다. 원격 바이트가 이전 검증 내용과 다르면 새 기준으로 덮어쓰지 않고 충돌로 멈춘다.

로컬 `staging` 공간이 부족하면 두 스크립트에 동일한 `TECH_GARDEN_DRIVE_STAGE_DIR` 절대 경로를 지정한다. `--collect`의 응답 캐시 공간도 부족하면 `TECH_GARDEN_DRIVE_SOURCE_CACHE_DIR`에 별도의 저장소 밖 절대 경로를 지정한다. 이 변수는 기존 캐시를 자동 이전하지 않으므로, 이전 캐시를 파일별 SHA-256으로 검증해 복사한 뒤 실행해야 성공 응답을 재사용한다. staging과 캐시 경로는 겹칠 수 없다. 기존 캐시는 검증 전 삭제하지 않는다. 반복 생성되는 `preview-workspace` 사본은 보관 목록에서 빼되 원문·검토 기록과 미리보기 영수증은 유지한다.

## 기존 자료 이전 기준

- 현재 vault의 모든 일반 파일을 상대 경로 그대로 보관하고 크기·해시를 확인한다.
- 구 iCloud 및 기존 로컬 취재·이전 증거를 ZIP으로 보존하며 ZIP 무결성을 검사한다.
- URL별 수집 결과와 관련 노트 경로를 제공한다.
- 예약 자동화와 스킬에 새 최종 저장 위치와 업로드 검증 조건을 반영한다.

## Drive 원본의 사이트 자동 반영

`docs/DRIVE_GITHUB_SYNC.md`가 발행 순서를 정한다. 작성 원본 네 폴더를 먼저 Drive에 저장하고 GitHub가 읽어 사이트를 생성한다. `WebsiteData`는 배포 결과를 다시 확인하는 자료이며 작성 원본이 아니다. Google 내보내기 연결과 성공한 동기화 실행을 확인하기 전에는 상시 자동 반영 완료라고 보고하지 않는다.

## 로컬 수집·검토 묶음의 독립 복구

새 검토 자료를 보관할 때 기존 archive 외에 archive-closure로 실제 참조된 이전 추출·원문 묶음·후보 승인·대체 원보도 검토와 불변 parse store를 포함할 수 있다. source-run은 원고 run, related-run은 그 원고의 후보 승인 run이다. 추가 원문이나 모델 추론 없이 저장 bytes/hash를 확인하며 기존 ZIP을 덮어쓰지 않는다.

```sh
node scripts/research.mjs archive-closure --run <new-archive-id> --source-run <article-run> --related-run <candidate-approval-run>
python3 scripts/research/package-archive.py --root .local/research/local-ai --package archive-staging/<new-archive-id>/research-source-bundle.zip --expected-sha256 <package-sha256> --restore-to restore-checks/<new-directory>
```

복구 대상은 새 private 폴더만 허용하며 원문/모델 출력/검토/parse 파일을 재구성한다. 복구 후 loadCurrentApproval과 해당 관계 검증을 실행해 실제 승인 근거를 확인한다. 이는 연구 자료 복구이며 운영 장부/공개 사이트/일일 상태의 자동 복구나 실행 재개를 의미하지 않는다. Drive 업로드 뒤 metadata 확인·원격 bytes hash 확인·원격 ZIP 복구를 각각 구분한다. connector가 checksum이나 materialized bytes를 제공하지 않으면 remote hash/restore는 미검증으로 유지한다. 실제 사례/제한은 런북335절을 따른다.

기사에 새 `article-concept-review/v1` 연결 검토가 있으면 archive-closure는 정의·별칭/노트 교체 검토용 작성4폴더 snapshot과 선택한 note approval/fact source도 포함한다. 별도 vault로 승인했으면 같은 `--vault`를 제공한다. 복구 뒤 `loadArchivedConceptApproval(restoredRoot, archiveRun, approvedRun)`으로 manifest 전체 bytes·정의 inventory·현재 승인 계약을 다시 확인한다. 검토 origin 경로는 유지하고 정의 파일은 복구 snapshot에서 읽는다. 실제 local/원격 ZIP212파일 복구·승인/온톨로지 SHA 일치는 런북370절에 있다. 이 Research 자료 복구는 최신 Drive authority 동기화나 공개/worker 재개를 자동 수행하지 않는다.

## 승인한 작성 원본의 변경분 저장

prepare-drive.py --approved-preview의 준비 결과는 업로드 승인이 아니다. research-authoring.mjs release가 exact source/preview/변경분·최신 전수 Drive snapshot·최종 편집 검토를 확인한 불변 영수증을 생성한다. 정규회차는32조사칸, 소급정정은 retrospective로 구분한다. 상세 계약과 실제 명령은 LOCAL_AI_NEWS_RUNBOOK.md 342절을 따른다.

업데이트 직전 원본 raw SHA를 확인하고 동일 파일 ID로 저장한 뒤 원격 bytes를 재조회해 desired SHA와 ID/부모를 확인한다. 저장 결과는 release receipt를 고치지 않고 별도 execution proof로 보관한다. post snapshot으로 local vault를 동기화하고 재실행은 동일 bytes 쓰기를 생략한다. 이 단계의 성공은 공개 사이트 배포 성공을 뜻하지 않는다.

## 정확한 원문 판본에서 검증된 Drive 보관본 찾기

새 `scripts/research-archives.mjs`는 기존 portable archive의 불변 receipt와 실제 Drive raw ZIP을 대조해 비공개 위치 기록을 만든다. 메타데이터 JSON은 `research-drive-archive-observation/v1`이며 `observed_at`(timezone 명시·10분 이내), `file_id`, `name`, `mime_type: application/zip`, `size`, `parent_ids`, `shared: false`가 필요하다. 업로드 응답이나 원격 이름만으로 등록할 수 없다.

```sh
node scripts/research-archives.mjs register --run <portable-archive-run> --metadata <fresh-private-metadata.json> --remote-package <actual-downloaded.zip> --parent <verified-Research-folder-id>
node scripts/research-archives.mjs lookup --source-version <exact-source-version-id>
node scripts/research-archives.mjs lookup --event <exact-event-id>
```

위치 기록은 `archive-staging/<run>/drive-location.json`에 불변 저장된다. 같은 고정 입력 재등록은 bytes 불변이며 다른 위치/bytes는 새 archive run을 요구한다. 승인 기사에 명시된 원문 URL·판본과 사건 ID만 연결한다. 원문 캐시가 없어도 위치 조회를 할 수 있지만 다운로드·복구·승인·공개는 실행하지 않는다. 로컬 ZIP만의 복구와 실제 원격 ZIP 복구는 별도다. 실제3원문/1사건 원격 복구와 표적 검증은 런북344절을 따른다.

## MCP에서 기존 전달 실행기 제어 (2026-10-10)

compact MCP의 `research_execute`에 `module: publication`과 아래 `operation`, 해당 `parameters`를 전달한다. 작업별 상세 계약은 `research_modules`의 module/operation 조회로 확인한다. `prepare/status`의 로컬 인계 계약은 유지하고, 새 작업은 같은 authoring/delivery 실행기를 사용한다.

| 작업               | 필요한 입력과 역할                                                                                              | 완료 경계                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `request_delivery` | `run_id`, 정확한 `handoff_path/sha256`. 기존 native 승인·필수 지식 run을 전달 요청으로 고정                     | `release_required`이며 원격 쓰기나 승인 생성 없음   |
| `deliver`          | `run_id`, 별도의 `execution_id`, `stage`, 정확한 `release_path/sha256`. `authoring`과 `publication`을 명시 선택 | 명시적 외부 운영 실행용; 자동 로컬 planner에서 제외 |
| `delivery_receipt` | 대기 중인 `execution_id/event_id`와 실제 `acquisition_path/sha256` 제출                                         | `receipt_submitted`는 원격 완료를 뜻하지 않음       |
| `delivery_status`  | `run_id`의 고정 선택·단계·connector intent·native receipt를 조회                                                | 저장 관측이며 현재 원격 조회/쓰기를 수행하지 않음   |

`deliver`는 기존 release receipt를 검사하여 preview의 정확한 handoff·기사 run/사건 ID·필수 지식 run과 일치할 때만 실행한다. release 검토는 기존 `research-authoring.mjs release` 경로에서 먼저 수행한다. 이 호출의 입력이나 모델 판단이 편집 승인을 대신하지 않는다.

`stage: authoring`에는 최초 실제 connector 획득 파일의 `acquisition_path/sha256`를 전달한다. `wait_ms`는 1~60000이며 기본60000이다. 실행 중 `delivery_status`의 `pending_request`에는 고정 event ID와 native write intent의 원래 파일 ID·부모·전/후 SHA·원본 staged `file_uri`·만료 시각이 나온다. 승인된 intent를 연결된 Drive 도구로 처리한 뒤 metadata·부모 목록 전후·실제 raw bytes가 담긴 `research-authoring-drive-acquisition/v1` JSON을 같은 연구 root 아래에 저장하고 `delivery_receipt`를 제출한다. 인증 정보는 연결 도구에 남긴다. 기존 native 검증기가 이를 소비한 뒤에만 `drive_verified`가 true가 된다. 미확정 create 의도는 기본적으로 재전송하지 않는다. 운영자가 connector 호출 자체가 전송되지 않았음을 확인한 경우에만 `resume_intent`와 `connector_call_not_dispatched: true`를 명시할 수 있으며, 기존 프로세스 종료·동일한 승인 작업·의도 발생 이후의 완전하고 안정적인 Drive 목록에서 대상 부재까지 검증된 경우 같은 intent를 재개한다. 이 확인은 자동 재시도나 새 승인으로 기록되지 않고 별도 복구 근거로 남는다.

`stage: publication`은 이미 검증된 authoring 실행을 요구한다. 최신 전수 Drive 작성 원본의 `source_snapshot_path/sha256`와 `source_readback_path/sha256`를 함께 전달하면 기존 canonical import·publisher·Actions 확인·공개 raw readback을 이어간다. 원본 snapshot이 없으면 `source_snapshot_required`로 대기한다. 선택한 Actions run은 `actions_run`으로 고정하며 자동 workflow dispatch나 재실행은 하지 않는다. 원래 콘텐츠 push 이후 코드만 main에 추가로 반영했다면 `deployment_commit`과 그 커밋을 빌드·배포한 정확한 `actions_run`을 함께 지정할 수 있다. 이 경우 해당 커밋은 원래 콘텐츠 커밋의 후손이어야 하고 `publicationContentPaths`의 모든 파일이 그대로여야 하며, 승인 원고의 Git bytes도 일치해야 한다. 원래 push 영수증은 보존하고 같은 publication run에서 배포·공개 readback만 마친다. 원격 Research/WebsiteData 전달은 기존 `remote_plan_path/sha256`, `remote_acquisition_path/sha256` 계약을 사용하고 같은 durable capture 요청을 통해 후속 bytes를 제출한다.

이 code-only continuation의 WebsiteData·Research 전달은 native public proof가 검증된 `deployment_commit`에 결속됐는지 확인한다. 원격 delivery input은 원래 승인된 content commit을 유지하고 public proof 참조만 실제 배포 커밋과 대조한다.

요청은 `runs/<run>/publication-delivery/input.json`, release 연결은 `binding.json`, 각 실행·대기·응답은 `executions/<execution_id>/`에 저장한다. 같은 execution ID/입력의 완료 결과는 재사용하여 외부 단계를 반복하지 않는다. `research_job_status/result`는 worker 완료와 native 상태를 구분한다. 부분 결과나 source snapshot 대기는 새 입력과 명시적 새 execution ID로 이어간다. 실패/중단 후에는 먼저 기존 writer·publisher intent와 실제 bytes/receipt를 대조하고 잠금 소유권을 확인한다. `resume_intent`, `retry_publish`, `resume_remote_intent`는 기존 명시 재개 조건에서만 사용한다. 미확정 create는 새 요청으로 바꾸지 않는다. connector 호출 자체가 전송되지 않았음을 운영자가 확인한 경우에만 정확한 `resume_intent`와 `connector_call_not_dispatched: true`를 사용하며, 원래 writer 종료·동일 승인/작업·의도 이후의 완전한 안정 목록이 native 검증된 때 같은 intent를 재개하고 해당 확인을 durable resumption record에 남긴다.

`drive_verified`, `public_verified`, `website_data_verified`, `source_archive_verified`는 각각의 native proof에서 판정한다. `remote_current_verified`는 저장 receipt 조회에서 false이며 정규 운영 회차도 자동 집계하지 않는다. 2026-10-10 개발 묶음은 저장 KUKA/AMR 승인 입력과 작은 웹/RSS/GitHub 생성 결과의 일치만 확인했고 Drive 업로드·Git push·공개 배포는 실행하지 않았다.
