# Google Drive 자료 보관 및 원문 수집

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

## 기존 자료 이전 기준

- 현재 vault의 모든 일반 파일을 상대 경로 그대로 보관하고 크기·해시를 확인한다.
- 구 iCloud 및 기존 로컬 취재·이전 증거를 ZIP으로 보존하며 ZIP 무결성을 검사한다.
- URL별 수집 결과와 관련 노트 경로를 제공한다.
- 예약 자동화와 스킬에 새 최종 저장 위치와 업로드 검증 조건을 반영한다.

## Drive 원본의 사이트 자동 반영

`docs/DRIVE_GITHUB_SYNC.md`가 발행 순서를 정한다. 작성 원본 네 폴더를 먼저 Drive에 저장하고 GitHub가 읽어 사이트를 생성한다. `WebsiteData`는 배포 결과를 다시 확인하는 자료이며 작성 원본이 아니다. Google 내보내기 연결과 성공한 동기화 실행을 확인하기 전에는 상시 자동 반영 완료라고 보고하지 않는다.
