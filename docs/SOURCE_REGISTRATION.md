# 수집 경로 등록과 공유 레시피

## 조사 목록 등록

`data/research-source-catalog.json`은 [경로 조사](SOURCE_EXPANSION_CATALOG.md)의 ID·주소·유형·확인일·접근 결과·인증/원문 조건·기존 경로 연결·남은 검증 항목을 보존한다. 최초 65개에 실제 확인한 RSS 3개를 추가해 현재 68개다. 기사나 온톨로지의 별도 저장소가 아니라 출처 설정의 입력이다.

등록기는 기존 `discovery.registry`와 canonical URL을 사용한다. 정확한 URL이 이미 있으면 해당 channel ID를 재사용하고 설정을 덮어쓰지 않는다. 다른 주소의 같은 회사는 `related_channel_ids`로 연결하되 동일 원문·사건으로 자동 병합하지 않는다. ID 충돌·복수 URL 등록·분류 오류·비공개 IP·인증정보가 담긴 URL·없는 레시피는 적용 전에 거부한다.

```sh
# 전체 목록과 등록 연결, 남은 검증 항목
npm run research:sources -- list
# 파일 변경 없이 묶음 미리보기
npm run research:sources -- plan --id X04 --id X20 --id X50
# 지정 묶음 등록
npm run research:sources -- register --id X04 --id X20 --id X50 --apply
# 전체 목록 등록; 이미 있는 주소는 재사용
npm run research:sources -- register --apply
# 공통 레시피를 상속까지 펼쳐 확인
npm run research:sources -- recipes
```

`register`도 `--apply` 없이는 읽기 전용이다. 반복 적용은 등록 수를 늘리지 않는다. 잘못된 선택 ID는 전체 요청을 거부한다. 같은 스키마의 새 조사 목록은 `--input`으로 받는다. `--repo`, `--root`로 저장소와 비공개 작업 위치를 지정할 수 있다. 일일 활성 설정·후보 장부·기사 승인·예약·발행은 바꾸지 않는다.

## 공통 방법 공유

공통 설정은 `data/research-source-recipes.json`, 해석은 `scripts/research/source-recipes.mjs`에 둔다. `extends`로 상속하고 중첩 객체는 병합한다. 배열은 통째로 대체하므로 host·selector 목록을 암묵적으로 넓히지 않는다. 순환 상속·prototype 변경 키·ID/URL/검증 상태를 바꾸는 레시피는 거부한다. 명시한 출처 설정이 기본값보다 우선한다. source-channels와 research-acquisition 양쪽에서 사용할 수 있다.

| 레시피                  | 기존 기능                  | 출처별 확인                                                   |
| ----------------------- | -------------------------- | ------------------------------------------------------------- |
| `registered-route-v1`   | 등록만 수행, 요청 금지     | 실제 목록 주소·접근·아래 검증                                 |
| `bounded-rss-v1`        | RSS/Atom 날짜 창·상세 원문 | feed title, GUID, 시간대, 원문 URL, 보존 기간, 종료           |
| `dated-html-list-v1`    | 날짜 HTML 목록             | 제목/날짜/링크 selector, 고정 공지, 상세 날짜, 이전 날짜 종료 |
| `calendar-html-list-v1` | 월별 HTML 아카이브         | 월 URL, 월 경계, 날짜 규칙, 빈 월                             |
| `path-html-list-v1`     | 페이지 번호 HTML 목록      | URL template, 상한, 순서, 종료, 재개                          |
| `mit-news-rss-v1`       | RSS + MIT News 공통 설정   | 분야별 feed 이름·규칙 ID·범위                                 |
| `ndsoft-news-rss-v1`    | NDSoft 매체 RSS 공통 설정  | feed 이름·허용 host·기사 범위·이미지 본문                       |

기존 MIT AI·Robotics 두 경로는 `mit-news-rss-v1`을 실제 공유한다. host·상세 URL 패턴·목록/상세 상한·GUID 규칙을 한 번 정의하고, 각 feed의 이름·규칙 ID·범위는 개별 설정에 남긴다. 펼친 설정은 전환 전과 같다. AI feed의 acquisition 설정 예:

```json
{
  "source_recipe": "mit-news-rss-v1",
  "listing_profile": {
    "rule_id": "mit-ai-rss-v1",
    "feed_title": "MIT News - Artificial intelligence",
    "scope": "Official MIT AI topic feed; selected dated full originals and an older feed item are required for window completion. Topic labels are not publication approval."
  }
}
```

새 crawler 개발 전에 레시피와 기존 `article_profiles` 옵션으로 차이를 표현한다. 요청 정책·원본 보관·파싱·장부 중복 검토는 기존 모듈을 사용한다. API·OAI/JATS·인증 수집은 실제 adapter의 지원 범위를 먼저 확인한다. API 문서를 HTML 뉴스 목록으로 수집하거나 레시피 등록을 수집 완료로 세지 않는다. 확인한 endpoint와 공통 adapter가 준비되기 전에는 대기로 남긴다.

## 등록 이후 개발

`onboarding`에 관측 결과와 `remaining_checks`를 보존한다. `suggested_recipe`는 제안이며 자동 적용하지 않는다.

1. `registered`, `collection_enabled: false`: discovery와 scan-list가 요청을 차단한다. 안내 문서·동적 입구·실제 목록을 구분한다.
2. 공식 원문으로 실제 주소와 profile을 확인해 route/acquisition에 설정하고 적합한 공유 레시피를 선택한다. `status: configured`, `collection_enabled: true`로 지정하면 기존 scan-list로 개별 기간을 시험할 수 있다. 일일 활성화는 아직 거부한다.
3. [기존 활성화 체크리스트](DAILY_NEWS_INGESTION_IMPLEMENTATION.md#32-새-출처를-활성화하는-체크리스트)의 정책·원문·파싱/날짜·기간 종료·빈 기간·재개·중복 검토 근거를 비공개 run에 기록한다. 완료 항목만 remaining_checks에서 제거한다. 인증정보·실패 원문은 공개 설정에 넣지 않는다.
4. 아래 `verify`로 검증 receipt를 만든 뒤 `activate`의 dry-run을 확인하고 `--apply`로 기존 daily 설정에 baseline을 연결한다. 상태 문자열만 변경해서 활성화하지 않는다. 등록 명령은 활성화를 수행하지 않는다.

기존 비공개 delivery status 출처 표에 `registration_pending`, 사용 레시피와 남은 검증 항목을 표시한다. list 명령에서는 기존 경로로 재사용된 조사 항목도 확인한다. 독자 기사·브리핑·RSS에는 이 운영 정보를 넣지 않는다.

## 보존과 검증

적용은 기존 garden-operation lock 아래에서 수행하고 설정·조사 목록 hash를 쓰기 직전에 대조한다. `.local/research/local-ai/source-registrations/<UUID>/`에 정확한 기존 파일, prepared와 applied receipt를 보존한다. source-channels 한 파일만 atomic 교체한다. 실패 시 receipt와 실제 파일 hash로 적용 여부를 구분한다.

복구본에는 다른 작업자의 등록 전 변경도 포함된다. 복구 시 applied receipt의 `channels_after_sha256`와 현재 파일이 일치하는지 확인하고 같은 lock 아래에서 복원한다. 이후 변경이 있으면 복구본으로 덮어쓰지 않고 이번 추가 channel만 검토해 제거한다. 복구본·receipt는 Git에서 제외한다.

레시피 데이터와 코드도 일일·개별 수집 fingerprint에 포함한다. 앞선 통합 성공을 새 설정의 성공으로 재사용하지 않는다. 이번 묶음은 좁은 등록·레시피·기존 RSS/daily 검사만 한 번 묶어 실행한다. 전체 suite·50경로 live 재수집·Drive/공개 배포는 별도다.


## 실제 수집 검증과 일일 활성화

```sh
npm run research:sources -- verify --channel catalog-x46 \
  --baseline-run onboarding-kisa-normal-20261003-v1 \
  --empty-run onboarding-kisa-empty-20261003-v1
# 위 결과의 receipt 값을 그대로 사용한다. 먼저 dry-run, 이후 적용한다.
npm run research:sources -- activate --channel catalog-x46 \
  --receipt source-onboarding/f3842287-786d-4214-adde-aad9acf36ee2/verification.json
npm run research:sources -- activate --channel catalog-x46 \
  --receipt source-onboarding/f3842287-786d-4214-adde-aad9acf36ee2/verification.json --apply
```

`verify`는 별도의 정상/빈 기간 run을 요구한다. 원문 bytes·immutable parse·날짜·정책 확인·후보 본문 지문을 검증하고, 현재 수집 코드/설정과 일치하는 `collection-basis` checkpoint를 확인한다. 두 run을 실제 CLI로 재개해 checkpoint와 결과 파일의 동일성을 대조한다. 격리 장부에 정상 run을 두 번, 빈 run을 한 번 병합해 전체 파일 hash가 유지되어야 한다. 미래 기간·미완료·변조·낡은 설정은 거부한다. 운영 후보 장부는 쓰지 않는다.

`collection-basis`는 펼친 route 설정·article profile·collector와 worker 코드·Node 버전을 고정한다. 관측 문구/진척 상태인 `onboarding`만 제외하며 수집 허용 여부는 별도로 검사한다. selector·host·레시피·파서 구현이 바뀌면 새 수집 증거가 필요하다. 기존 run 전체 fingerprint 관문도 유지한다.

`activate`는 receipt와 실제 원문/checkpoint/격리 장부를 다시 읽고 해당 channel의 verified 상태와 기존 일일 설정의 baseline만 변경한다. 다른 route는 보존한다. 기존 baseline이 다른 route는 자동 교체하지 않고 coverage reconciliation을 요구한다. 반복 적용은 unchanged이며 `list`는 catalog의 과거 조사 상태 대신 현재 등록 상태와 `daily_enabled`를 표시한다. 기사 승인·발행·Drive 보관·예약 생성은 수행하지 않는다.

두 설정 파일의 정확한 복구본과 prepared/applied receipt는 private `source-onboarding/<UUID>/`에 보존한다. source-channels를 먼저 쓰고 daily를 뒤에 쓴다. 중간 I/O 실패 시 verified지만 inactive인 상태가 가능하며 applied receipt 없이 완료로 표시하지 않는다. prepared와 현재 파일 hash를 확인해 재적용하거나 이번 route만 복구한다. 이후 다른 변경이 있으면 전체 복구본으로 덮어쓰지 않는다.

2026-10-03 실제 KISA/KITECH 정상 7/1건, 별도 빈 창 0/0건, 실제 재개·격리 중복 검증을 통과했다. 두 경로를 활성화해 기존 50개는 유지하고 일일 활성 52개가 됐다. 새 두 경로만 별도 root/장부에서 기존 일일 CLI로 실행해 4/4창 성공·후보 8건·retry 0·28.002초를 확인했다. 기존 운영 장부 313건/coverage는 불변이다. 전체 52경로의 최신 fingerprint 통합 성공으로 해석하지 않는다. 세부 증거와 재개 지점은 [런북 331절](LOCAL_AI_NEWS_RUNBOOK.md#331-공통-출처-검증과-일일-활성화-수직-슬라이스)에 기록한다.


2026-10-04 추가 적용: 전자신문 AI RSS/디일렉 전체 RSS 정상 창 17/23건, 별도 빈 창 0/0건을 검증해 일일 활성 54개로 확장했다. 빈 창은 00시대의 관측 스냅샷이다. 제목의 ‘단독’ 배지는 공통 파서에서 원본 위치를 남기며 분리한다. 기존 기준 run의 후보가 운영 장부에 없으면 활성화 상태만으로 편입을 완료한 것으로 보지 않는다. 기존 daily CLI의 --reconcile-scan으로 검증된 baseline 후보를 편입해 receipt를 기록한다. 최초 편입은 병합하고 반복은 already_reconciled다. 실제 네 경로 48건은 운영 장부 361건에 연결됐고 기존 313건은 그대로다. 최신 결과·복구본은 [런북 332절](LOCAL_AI_NEWS_RUNBOOK.md#332-매체-rss-실제-확장과-운영-후보-편입)을 따른다.


미완료 기간의 정상 기사 편입은 source 활성화와 별개다. `scan-list --merge-backlog`는 listing 기간이 확인된 detail_incomplete에서 정확한 정상 후보만 공통 검증/중복 병합한다. 창은 incomplete, coverage는 unresolved 그대로다. immutable 편입 receipt와 비공개 현황판에서 근거를 확인한다. 로봇신문 11개 정상 후보는 편입됐지만 이미지 표 2건은 미검토이며 일일 활성화는 보류 중이다. 현재 운영 장부 372개, 상세는 [런북 333절](LOCAL_AI_NEWS_RUNBOOK.md#333-미완료-기간의-정상-기사-편입과-실제-검증).


## 수집 증거 재사용의 실행 경계

개별 수집은 node scripts/research-scan.mjs scan-list로 실행한다. 기존 research.mjs scan-list도 같은 공통 command/checkpoint를 사용한다. onboarding 재개와 daily는 전용 entry를 호출해 편집/archive 변경 때문에 수집을 반복하던 의존성을 제거했다. selector/host/profiles/collector/parser/정책/worker 변경은 계속 재검증 대상이다. 입력 v2가 날짜를 고정하므로 같은 ID로 창을 바꿀 수 없고 이전 run은 덮어쓰지 않는다. 별도 root로 일일 수집/reconciliation을 실행하면 --backlog도 명시한다. root는 Python 설치나 장부 경로를 자동 변경하지 않는다. RESEARCH_PYTHON에 기존 실행기를 지정한다. 실제 검증·복구 경계는 [런북336절](LOCAL_AI_NEWS_RUNBOOK.md#336-수집-실행-경계-분리와-실제-디버깅)에 있다.

개별 scan-list의 --merge-backlog는 기본 root에서만 지원한다. custom root의 후보 병합은 위 daily --backlog 경로로 실행한다.


2026-10-04 제조사 실제 디버깅: 개별 scan-list 완료 창의 --merge-backlog도 일일 수집과 동일한 검토된 same-event aliases를 적용한다. FANUC 일본어/두산 다국어 원문을 별도 후보로 재생성하는 경로를 수정했다. HD 공식 API는 size100을 실물 확인해 전체 조회150건을 보존하면서19→2페이지로 줄였다. 변경 전 baseline은 새 설정에서 자동 재사용하지 않는다. [런북339절](LOCAL_AI_NEWS_RUNBOOK.md#339-로봇-제조사-실제-수집과-개별-병합-중복-수정).


2026-10-04 최신 fingerprint의 실제 일일54경로/108창은106완료/2미완료다. 전자신문 AI·더일렉은 최신50 RSS만으로 주간 경계가 확인되지 않는다(feed_cutoff_not_reached). 개별 정상/빈 기간 검증과 일일 활성화는 과거 일주일 전체 수집 보장을 뜻하지 않는다. 현행 daily가 실패를 보존하고 현재-day 창은 수집했다. 다음 보강은 공통 fallback_archive/날짜 목록의 실제 과거 페이지·종료 경계 확인이며 같은 feed 재요청을 반복하지 않는다. 108영수증·원문/parse·장부 고유키 대조는 런북344절을 따른다.

## RSS 보존 범위가 짧은 경로의 주간 보강

RSS가 요청 기간의 이전 경계를 제공하지 않으면 `fallback_archive`에 실제 관측한 날짜 목록과 `path-pages` profile을 등록한다. 목록의 최대 페이지·상세 원문 상한은 관측된 기간 경계를 충분히 포함하도록 제한적으로 설정한다. 날짜의 연도가 없으면 공통 `article_date_resolution: yearless-month-day`와 `max_date_resolution_details`를 사용한다. 원문의 완전한 날짜/본문/제목과 목록 MM-DD를 대조하며 연도를 추정하지 않는다. 목록의 제목 편집이 원문과 실제로 다를 때만 해당 archive에 `rss_title_policy: source_title_authoritative`를 지정한다.

동일 기간의 실패/완료 실행에서 이미 받은 원문은 아래처럼 재사용할 수 있다. 관측 시간이 최신으로 바뀌지 않고 커버리지·승인은 다시 검증한다. 기존 run 입력/원문/checkpoint/의존성이 바뀌거나 새 실행 시작 때 관측이1시간보다 오래됐으면 거부한다.

```sh
node scripts/research-scan.mjs scan-list \
  --run etnews-weekly-archive-20261004-v3 --channel etnews-ai-rss \
  --since 2026-09-27 --until 2026-10-04 \
  --reuse-source-run etnews-weekly-archive-20261004-v2
npm run research:daily -- --run media-etnews-weekly-reconcile-20261004-v1 \
  --reconcile-scan etnews-weekly-archive-20261004-v3
```

이 명령은 기록된 실행의 재개 예다. 새 기간/변경된 코드에는 새 run ID를 쓴다. 현재 검증 결과와 원문/후보/Drive 증거는 [런북346절](LOCAL_AI_NEWS_RUNBOOK.md#346-rss-주간-누락-보강-실제-수집-및-재개-검증)에 있다.


## 승인 원문 변경을 공통 재검토로 연결하기

승인된 원문은 새 관측의 source identity·내용 지문·판본·parse 차이를 비교한다. 다른 언어 CMS 관측은 주 원문을 덮어쓰지 않고 관련 관측에 기록한다. 수집 당시 alert가 없던 과거 장부도 approvalSourceChange로 찾아낸다. 저장 근거와 기존 승인에 연결된 실제 의존 항목만 재검토한다.

```sh
node scripts/research-revisions.mjs plan --snapshot REVIEW_ID
node scripts/research-revisions.mjs inspect --snapshot REVIEW_ID
```

입력이 바뀌면 새 REVIEW_ID를 사용한다. 별도 승인 저장 위치는 --approval-root RUN=PATH로 명시한다. 동일 본문 재연결은 제목·발표일·전체 문단 및 인용 보조 원문의 bytes까지 검토한 뒤 기존 candidate-approval에 --candidate-source-run와 --source-revision-review를 함께 전달한다. 변경된 본문은 이 경로로 승인하지 않는다. 재검토 목록 생성/조회는 기사 승인·발행을 수행하지 않는다. 실제 입력·실패·재개·Drive 증거는 [런북347절](LOCAL_AI_NEWS_RUNBOOK.md#347-승인-원문의-변경-감지와-기존-근거-재검토)에 있다.


### 승인 원문 변경의 실제 해결

`node scripts/research-revisions.mjs resolve --run NEW_ID --review PRIVATE_PATH`는 명시적 검토 JSON을 적용한다. schema는 `research-source-revision-resolution-review/v1`이다. action은 `restore_primary` 또는 `replace_approval`이고 prior_approved_run/current_source_run, candidate_key/expected_candidate_sha256, reviewer/reviewed_at/reason을 지정한다. source_read/revision_read/identity_checked/dates_checked/numbers_checked/dependencies_checked는 true, new_article/candidate_published는 false여야 한다.

replace_approval에는 기존 사실·최종 편집 검증을 통과한 별도 new_approved_run이 필요하다. restore_primary는 명시적인 publisher/profile/CMS item 별칭과 정확한 기존 승인 판본을 요구한다. 같은 사건/발표일/원문 주소를 유지하며 이전 판단과 관측을 보존한다. resolve는 기사·회차를 발행하지 않는다. archive-closure는 현재 관측과 이전/새 승인 및 직전 resolution을 묶으며 Drive 위치 색인은 현재 승인 원문의 정확한 URL만 사건에 연결한다. [실제 복구·변조·Drive 검증](LOCAL_AI_NEWS_RUNBOOK.md#348-kuka-주-원문-복구와-kaist-변경-판본-재승인)을 따른다.
