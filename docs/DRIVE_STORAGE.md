# Google Drive 자료 보관 및 원문 수집

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
