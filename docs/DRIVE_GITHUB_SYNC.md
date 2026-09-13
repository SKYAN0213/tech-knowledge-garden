# Drive 원본 → GitHub 웹사이트

Google Drive `Projects / Tech Knowledge`가 작성 원본이다. GitHub는 검증된 사본의 변경 이력과 웹사이트를 제공한다. 최종 완료 기준은 실제 Drive 읽기, 변경 적용·중복 실행 검증, GitHub 배포 성공, 공개 사이트의 `drive-sync.json`과 원본 해시 일치다. Google 읽기 연결이 없는 상태를 자동 연동 완료로 보고하지 않는다.

## 데이터 흐름

`Drive 원고·개념 → Google의 읽기 전용 내보내기 → GitHub 변경 확인 → 검증·생성 → 커밋·Pages 배포`

- 입력 폴더는 `Editions`, `Knowledge`, `Signals`, `TrendTopics` 네 개다. 여기에 있는 Markdown은 공개용 작성 원본이며 새 파일·수정·소규모 삭제를 반영한다.
- `News`, `Briefings`, `Trends`, 지도 및 `WebsiteData`는 원본에서 생성하는 결과다. 기사 수정은 `Editions` 원고에서, 전문 개념 수정은 `Knowledge`에서 한다. 생성 결과를 편집해 작성 원본을 대신하지 않는다.
- `Sources`, `Research`, `Archive`, `Operations`, `.obsidian`과 기타 폴더는 GitHub 동기화 입력에서 제외한다. 원문 수집·취재 자료의 Drive 공유 권한을 변경하지 않는다.
- Apps Script는 고정된 폴더 네 개의 자료만 읽는다. 요청자가 다른 폴더를 지정할 수 없으며 OAuth 토큰을 응답하지 않는다. HTTP 응답으로 제공되는 원본은 위 공개용 Markdown이다.
- GitHub가 5분 간격으로 확인한다. GitHub 예약은 부하에 따라 지연될 수 있고, 변경 후 검증·배포 시간이 추가된다. 변경이 없으면 설치·빌드·배포를 생략한다. Mac이나 Codex 실행에 의존하지 않는 구조다.

## 최초 연결

1. Drive 소유 계정으로 Google Apps Script에 로그인한다. `integrations/google-drive/Code.gs`와 `appsscript.json`으로 사용자 소유 프로젝트를 준비한다.
2. 코드와 내보내기 폴더를 검토한 뒤 Google의 Drive 읽기 전용 권한을 승인한다. OAuth의 Drive 읽기 범위 자체는 계정 수준이며 코드에서 위 폴더 네 개로 접근·반출 범위를 제한한다. 이 권한 승인은 사용자 확인 단계다.
3. 웹 앱으로 배포한다. 실행 주체는 소유자, 접근 대상은 익명 포함 누구나로 설정한다. 이것은 이미 공개용인 네 폴더의 Markdown 내보내기이며 다른 Drive 자료를 공개하지 않는다.
4. 실제 완료된 `/exec` 주소를 GitHub 저장소 변수 `DRIVE_EXPORT_URL`에 설정한다. 자격 증명·API 키·Drive 파일 전체 공유를 GitHub에 넘기지 않는다.
5. `Sync Drive and Publish Garden`을 수동 실행하고 배포 및 `https://skyan0213.github.io/tech-knowledge-garden/drive-sync.json`의 해시를 확인한다. 주소가 없으면 예약 실행은 건너뛰고 수동 실행은 오류로 종료한다.

## GitHub 처리

`.github/workflows/drive-sync.yaml`은 `scripts/pull-drive.py --apply`로 전체 스냅샷을 검사한다. 경로 이탈·심볼릭 링크·중복 경로·해시 불일치·불완전한 폴더 읽기·큰 폭의 삭제를 적용 전에 차단한다. 이후 기존 전체 테스트·빌드·사이트 링크 검증을 통과해야 커밋하고 배포한다. 일반 push만 사용하고 충돌을 자동으로 덮어쓰지 않는다.

`GITHUB_TOKEN`으로 만든 커밋이 별도 push 배포를 다시 시작하지 않으므로 같은 워크플로에서 Pages 아티팩트를 업로드하고 배포한다. 기존 수동 배포와 같은 `pages` 동시성 그룹을 사용한다.

`data/drive-source-state.json`은 실제 반영한 파일별 해시를 기록하고 `public/drive-sync.json`은 입력 해시·파일 수·읽기 수단을 보여준다. 초기 Codex 연결로 읽은 스냅샷은 `codex-drive-connector`, 상시 Google 내보내기는 `apps-script-webapp`으로 구분한다.

## 매일 새 브리핑을 작성할 때

1. 집필 전에 Drive의 원본 수정과 GitHub 최신 변경을 확인한다. 로컬에 미반영 수정이 있으면 비교·병합한다. Git 변경이 없는 상태에서만 `git pull --ff-only`를 사용한다.
2. 기존 취재·집필·검증 절차를 유지한다. 로컬 생성 결과를 먼저 GitHub에 올리지 않는다.
3. `prepare-drive.py --collect`로 저장 목록을 준비하고, 네 원본 폴더의 변경 파일을 먼저 Drive에 업로드·검증한다. 취재·원문 수집 자료는 기존 개인 Drive 경로에 저장한다.
4. 상시 연결이 설정돼 있으면 `gh workflow run drive-sync.yaml --ref main`으로 즉시 반영을 요청한다. 실제 실행 결과와 공개 브리핑을 확인한다. Google 상시 연결이 아직 없고 Codex가 실행 중이면, 연결된 Drive 도구로 네 원본 폴더를 새로 읽어 완전한 스냅샷을 만들고 `pull-drive.py --snapshot <실제 스냅샷 경로> --apply`로 적용한 다음 `npm run publish`로 단발성 배포할 수 있다. 실제 최신 Drive 읽기 없이 로컬 사본을 대신 발행하지 않는다. 단발성 배포와 상시 자동 반영 미연결을 구분해서 보고한다.
5. 웹 배포가 확인된 뒤 `export-website-data.py`를 실행하여 `WebsiteData`를 갱신·업로드한다. 공개 사이트가 새 원고를 반영하기 전의 데이터를 최신 원고 데이터로 표시하지 않는다.

## 검증 및 현재 상태

- Python 테스트: 반복 실행, 내용 변경, 작은 삭제, 큰 삭제 차단, 불완전 응답, 해시 불일치, 비공개 폴더·경로·심볼릭 링크 차단.
- 초기 실제 Drive 읽기와 GitHub 배포 기록은 `data/drive-source-state.json`, Actions 기록 및 공개 `drive-sync.json`에서 확인한다.
- 상시 연결의 활성 여부는 저장소 변수 `DRIVE_EXPORT_URL`과 성공한 예약/수동 동기화 실행을 함께 확인한다. 코드 설치나 초기 단발성 읽기는 상시 연결의 증거가 아니다.

공식 근거: [Google 웹 앱](https://developers.google.com/apps-script/guides/web), [GitHub 예약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [GITHUB_TOKEN의 후속 실행 제한](https://docs.github.com/en/actions/concepts/security/github_token).
