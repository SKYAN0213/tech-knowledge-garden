# 수집 경로 등록과 공유 레시피

현재 정기 활성63경로, registry203경로·확장 catalog76항목의 차이, 실제 수집 시간·자원·이력은 [수집 범위와 비용 분석](SOURCE_COLLECTION_ANALYSIS.md)을 따른다. 자동63(활성63·검증 대기0)·탐색137·자동 제외3으로 구분했다. KRIBB 직접 주소의 정책 실패는 보존하고 자동 수집 대상에서 뺐으며, 공식 BioIN에 게재된 KRIBB 연구성과와 TechCrunch 공식 날짜 목록을 독립 경로로 검증·활성화했다. ScienceDaily 최신 목록과 PMLR 권별 피드는 탐색용이다. 등록이나 공개 목록 접근만으로 자동 원문 수집 완료에 포함하지 않는다.

## 조사 목록 등록

`data/research-source-catalog.json`은 [경로 조사](SOURCE_EXPANSION_CATALOG.md)의 ID·주소·유형·확인일·접근 결과·인증/원문 조건·기존 경로 연결·남은 검증 항목을 보존한다. 최초65개에 실제 확인한 파생 경로11개를 추가해 현재76개다. 기사나 온톨로지의 별도 저장소가 아니라 출처 설정의 입력이다.

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

### 발행 주체 국가와 공시·규제 관할의 명시 등록

`publisher_country`는 해당 자료를 발행하는 주체의 국가이며 `regulatory_jurisdiction`은 해당 공시·규제 자료가 적용되는 관할이다. 두 값은 독립적이다. 기존 `region`의 국내/해외 구분과도 다르며 언어·도메인·회사 본사에서 추정하지 않는다. 조사 catalog 항목, 명시한 source channel 또는 해당 channel의 acquisition override에서 선택적으로 선언할 수 있다. 여러 출처가 공유하는 recipe에는 넣을 수 없다.

각 선언은 엄격한 `{ "value": "공식 자료에 명시된 값", "official_evidence": { "url": "https://공식근거주소", "quote": "그 값을 직접 뒷받침하는 실제 인용" } }` 형식이다. 값·공식 근거 URL·비어 있지 않은 인용을 모두 요구하며 추가 필드, 비공개 주소, 인증정보가 담긴 URL은 거부한다. 근거의 발행 주체와 실제 내용은 등록 담당자가 먼저 검토한다. Schema 통과는 공식 원문 열람이나 사실 승인 결과가 아니다.

선언이 없거나 `null`이면 수집 입력에 새 값을 주입하지 않는다. `research:sources list`와 수집 inventory는 각각 `publisher_country: null`·`publisher_country_status: "unknown"`, `regulatory_jurisdiction: null`·`regulatory_jurisdiction_status: "unknown"`으로 구분한다. 유효한 선언은 인용을 포함해 원래 값 그대로 제공하고 상태는 `declared`다. 이미 등록한 URL의 catalog 선언은 `catalog_geography`에 별도로 보이며 기존 channel 설정을 덮어쓰거나 자동 승인·활성화하지 않는다. 새 기능 등록 후에도 현재203경로의 실제 국가·관할 값은 미등록 상태로 유지하며, 공식 근거를 검토한 실제 값 등록은 별도 단계다.

완료한 catalog의 `remaining_checks: []`는 정확한 기존 URL·channel의 `verified`/수집 허용 상태, 일일 활성 baseline, 실제 저장된 onboarding receipt의 channel·수집 route SHA·baseline·checkpoint 재사용 계약이 일치할 때만 조회·재사용할 수 있다. 새/미검증/다른 URL의 빈 검증 목록은 계속 거부한다. 이 대조는 기존 활성화의 상태·저장 계약 확인이며, 과거 원문·scan checkpoint를 현재 제품 판본으로 다시 검증한 결과가 아니다.

## 공개 접근 조사와 수집 용도

등록 주소는 공통 감사기로 목록·피드·공식 입구를 실제 읽고 원본·정책·파싱 결과를 기존 비공개 root에 보존한다. 이 조사에서는 collection_enabled가 아직 false인 등록 경로도 관찰할 수 있지만 후보 승인이나 정기 활성화 권한은 생기지 않는다. 같은 호스트는 직렬, 다른 호스트는 최대6개 병렬이며 기존 체크포인트를 재사용한다.

```sh
# 전체 등록 경로 감사; 일부는 --channel ID를 반복 지정
node scripts/research-source-audit.mjs --run NEW_AUDIT_ID
# 실제 감사에 근거한 전체 선택 목록의 용도 미리보기 / 반영
node scripts/research-source-dispositions.mjs --run NEW_AUDIT_ID --input PRIVATE_DECISIONS_JSON
node scripts/research-source-dispositions.mjs --run NEW_AUDIT_ID --input PRIVATE_DECISIONS_JSON --apply
# 주소·수집 용도·활성·남은 검사·비공개 판단 근거
node scripts/research-collection.mjs --inventory
```

판정 파일은 감사한 주소마다 정확한 `channel_id`, `url`, `mode`(automatic/discovery/excluded), `role`(listing/entrypoint/documentation), `reason`을 요구한다. excluded는 실제 저장 robots 금지(`reason_code: policy_denied`)나 공식 redirect/link가 입증하는 대체 주소(`replaced`, `replacement_channel_id`)만 허용한다. 접속 오류나 robots 요청 실패만으로 제외할 수 없으며 활성 일일 경로는 별도로 비활성화하지 않고 용도를 바꿀 수 없다. 설정 백업과 판정 근거는 `.local`에 저장하고 최신 감사 묶음들을 합쳐 목록화한다.

`collection_mode: discovery`는 발견 링크를 반환하되 자동 기사 후보 장부에는 편입하지 않는다. `excluded`는 요청을 수행하지 않는다. automatic도 정상·빈 기간·재개·후보 병합을 통과한 뒤 기존 verify/activate를 거쳐야 일일 경로가 된다. 홈페이지·IR 일정·논문집 메타데이터를 기사로 취급하지 않는다.

공개 원문만 수집하는 출처는 `access_policy: public-only`를 명시한다. 회원 전용 예외는 저장 원본과 파싱의 제목·발표일·본문 없음·회원 안내를 대조해 URL별로 기록한다. Transport·파서 실패는 캐시 제외 사유가 아니다. 알려진 예외는 목록의 제목·날짜가 같을 때 일상 상세 요청과 후보 생성을 생략하고 근거 메타데이터를 유지한다. 별도 정책 재점검 큐는 낮은 빈도로 공개 조건을 확인하며, 새 공개 본문의 원래 제목·발표일과 실제 블록을 검증한 뒤 명시적 검토를 거쳐야 이 예외를 해제한다. 지속 제외는 미래의 영구 불가 판정이 아니다.

```sh
# 과거 실제 접근 근거에서 공개 범위 예외를 등록
node scripts/research-access.mjs seed --run STORED_SCAN_ID --channel CHANNEL_ID --apply
# 명시적으로 다시 확인할 URL
node scripts/research-access.mjs reopen --url ORIGINAL_URL --apply
```

## 정책 변화와 지속 재점검

공통 `fetchWithPolicy`는 목록·상세·탐색·리다이렉트 목적지에서 정책 근거와 접근 상태를 구분한다. 상태는 기존 비공개 root의 `source-policy/index`, hash로 고정한 `source-policy/observations`, `source-policy/watches`에 저장한다. 원문과 parse의 SHA, 이전 관측, 판정 시각, 마지막 확인된 robots 판본, 다음 점검 시각을 보존하고 재시작 후 그대로 읽는다. 과거 run/접근 제외 receipt나 일일 활성 설정을 다시 쓰지 않는다.

| 상태 | 판단 근거 | 기본 재점검 |
| --- | --- | --- |
| `available` | 공개 응답 관측 또는 명시적 재개 검토 | 실제 다음 수집에서 정책 재확인 |
| `temporary_unavailable` | 429/408/500/502/503/504, 알려진 일시 네트워크 오류 | 15분부터 지수 증가, 최대24시간 |
| `policy_restricted` | 실제 robots 금지, 검증된 회원 전용 원문, 판본을 고정한 공식 정책 검토 | 7일 |
| `undetermined` | 403/404/410, 원인 불명 오류, 정책 확인 실패·변경 검토 대기 | 24시간 |

실패 횟수나 경과 시간만으로 영구 제외하지 않으며 `permanence`는 항상 `undetermined`다. 410도 해당 자원의 지속 삭제 신호일 뿐 사이트 전체 수집 정책 변경으로 확대하지 않는다. 단순 HTML/약관 판본 차이는 검토 필요 신호이며, 자동으로 새 금지 정책이라고 확정하지 않는다. robots의 `Allow`는 이용 권한 자체를 대신하지 않는다. [HTTP 상태 의미](https://www.rfc-editor.org/rfc/rfc9110.html), [robots 표준](https://www.rfc-editor.org/rfc/rfc9309.html)을 따른다.

robots는 새 수집 fetcher에서 확인하고 장기 실행 중 캐시는 최대24시간만 유지한다. 저장 바이트와 304 캐시의 hash를 검증하며 HTML 로그인 화면은 빈 허용 정책으로 해석하지 않는다. 이전 판본이 없으면 변경 시점을 추정하지 않는다. robots 바이트가 바뀌어도 해당 경로의 허용 여부·요청 간격이 같으면 변경 기록만 남긴다. 금지→허용은 검토 대기이며 정확한 새 판본을 검토하기 전에는 본문 요청을 재개하지 않는다. 리다이렉트 목적지도 같은 관문을 적용한다.

`Retry-After`는 초 단위와 HTTP 날짜 모두 보존하고, 명시된 시간보다 이르게 재요청하지 않는다. 429/503의 대기는 호스트 단위로 저장하므로 다른 URL이나 재시작도 존중한다. 긴 대기는 실행을 붙잡는 sleep 대신 다음 점검 시각으로 저장한다. 일일 재시도 큐의 `awaiting_retry_time`은 대기 중 새 시도를 할당하지 않으며 과거 실패 receipt·coverage는 유지한다.

기존 수집 실행에서 새 fetcher가 처음 요청할 때 due 큐를 최대3건·시작 시간 예산6초로 처리한다. 이미 시작된 단일 요청은 기존 요청 timeout 안에서 마친다. 제외/비활성 경로도 등록된 점검 상태로 관찰할 수 있지만 자동 활성화나 기사 승인 권한은 생기지 않는다. 별도 예약을 생성하지 않으며 수집 실행이 없는 동안에는 점검이 실행되지 않는다. 최근 점검 결과는 `source-policy/maintenance-latest.json`과 관리 CLI에서 읽는다.

약관/API 안내 감시는 **등록한 공식 문서 URL**에 적용하며 출처 주소와 같은 origin의 모든 수집 요청·redirect에 영향을 준다. robots만 확인한 출처를 약관 전체 검토 완료로 보고하지 않는다. 정책 문서를 처음 등록하거나 판본이 바뀌면 검토 대기로 전환하고, 확인 실패는 마지막 정상 문서 바이트를 보존한 채 일시 실패 또는 판단 보류로 기록한다. 확인되지 않은 텍스트를 자동 법률 판정하거나 로그인·권한 제한을 우회하지 않는다.

```sh
# 읽기 전용 상태/점검 기한
npm run research:policy -- list
npm run research:policy -- list --due
# 기존 회원 예외와 실제 robots 금지 receipt를 새 큐에 연결; HTTP 요청0
npm run research:policy -- seed --apply
# 공식 약관/API 문서 등록과 첫 정책 관측
npm run research:policy -- watch --url SOURCE_URL --document OFFICIAL_TERMS_URL --kind terms --apply
# 기한이 지난 큐의 제한된 확인 / 특정 주소의 명시적 재검증
npm run research:policy -- recheck --limit 3 --apply
npm run research:policy -- recheck --url ORIGINAL_URL --apply
# list/recheck가 반환한 최신 reference.sha256를 고정한 검토
npm run research:policy -- review --url ORIGINAL_URL --expected OBSERVATION_SHA --decision allow --reviewer NAME --reason EVIDENCE_REASON --apply
```

`watch`는 같은 origin의 공식 문서만 기본 허용한다. 다른 공식 문서 호스트는 `--host`를 명시해야 하며 기존 공용 IP·redirect 검증을 그대로 거친다. `review --decision restrict`는 실제 robots 금지 또는 확인된 공식 정책 문서 근거를 요구한다. `allow`는 최근24시간 안의 정상 robots·등록 정책 문서, 최신 관측 SHA, 검토자와 사유를 요구한다. 회원 예외는 원래 제목·발표일에 맞는 새 공개 parse가 추가로 필요하다. `reopen`은 조사 요청만 열며 새로운 원문/파싱 검증을 생략하지 않는다. 전체 정기 등록·일일 활성화는 기존 정상/빈 기간/onboarding 검증을 계속 따른다.

목록 밖 추천·배너가 기간 검증을 방해하면 공통 파서의 `listing_scope_xpath`로 정확한 목록 영역을 지정한다. 영역 밖 링크는 context_links로 보존하며 영역 안의 프로필 누락 링크는 계속 검증 오류다. 등록 상태·메모 갱신은 실제 수집 조건을 바꾸지 않으므로 체크포인트를 다시 실행하지 않는다. 수집 권한은 정규화 전에 별도 확인한다.

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

### 여러 발행처가 섞인 RSS

공통 bounded RSS의 기본값은 `listing_profile.outside_policy_items: "reject"`다. 실제 피드에 다른 발행처의 공개 링크가 함께 들어온 경우, 직접 확인한 경로에 `"retain_uncollected"`를 지정할 수 있다. 정책 밖 항목의 URL·제목·GUID·게시일·목록 판본은 보존하지만 해당 원문을 요청하거나 후보로 승인하지 않는다. `allowed_hosts`는 자동 확장하지 않는다.

정상 항목은 기존 상세 수집과 `merged_partial`을 통해 후보 장부·편집 handoff로 이어진다. 외부 항목에는 `article_outside_source_policy`, `fetched: false`를 기록하고 전체 날짜 창은 `incomplete`로 유지한다. 제목·GUID·날짜·순서·기간 경계 검사는 외부 항목에도 적용하며 위험한 주소나 잘못된 신원을 건너뛰어 성공으로 처리하지 않는다. 외부 발행처를 수집하려면 기존 등록·정책·원문 파싱 검토를 별도로 거친다.

## 등록 이후 개발

`onboarding`에 관측 결과와 `remaining_checks`를 보존한다. `suggested_recipe`는 제안이며 자동 적용하지 않는다.

1. `registered`, `collection_enabled: false`: discovery와 scan-list가 요청을 차단한다. 안내 문서·동적 입구·실제 목록을 구분한다.
2. 공식 원문으로 실제 주소와 profile을 확인해 route/acquisition에 설정하고 적합한 공유 레시피를 선택한다. `status: configured`, `collection_enabled: true`로 지정하면 기존 scan-list로 개별 기간을 시험할 수 있다. 일일 활성화는 아직 거부한다.
3. [기존 활성화 체크리스트](DAILY_NEWS_INGESTION_IMPLEMENTATION.md#32-새-출처를-활성화하는-체크리스트)의 정책·원문·파싱/날짜·기간 종료·빈 기간·재개·중복 검토 근거를 비공개 run에 기록한다. 완료 항목만 remaining_checks에서 제거한다. 인증정보·실패 원문은 공개 설정에 넣지 않는다.
4. 아래 `verify`로 검증 receipt를 만든 뒤 `activate`의 dry-run을 확인하고 `--apply`로 기존 daily 설정에 baseline을 연결한다. 상태 문자열만 변경해서 활성화하지 않는다. 등록 명령은 활성화를 수행하지 않는다.

기존 비공개 delivery status 출처 표에 `registration_pending`, 사용 레시피와 남은 검증 항목을 표시한다. list 명령에서는 기존 경로로 재사용된 조사 항목도 확인한다. 독자 기사·브리핑·RSS에는 이 운영 정보를 넣지 않는다.

## HTML 상세 원문의 구조 보존 공유

문단만 추출한 결과를 원문 전체 확보로 간주하지 않는다. 원문에 표가 있으면 기존 `content_block_xpath`에 `.//table`을 포함하고 `required_content_xpath: ".//table"`을 지정한다. 공통 파서가 독립 표 블록/행 보존, 누락/부모 텍스트로 평탄화 여부를 검사한다. 본문 컨테이너와 날짜 규칙만 출처별로 확인한다. `content_coverage`의 누락 수가 있으면 native 결과는 `partial`이며 같은 저장 bytes를 새 profile로 재파싱한다. 이미 저장한 원문과 이전 추출 결과는 덮어쓰지 않는다. 세부 계약과 실제 AWS 표77항목 복구는 [일일 수집 구현3.4절](DAILY_NEWS_INGESTION_IMPLEMENTATION.md#34-html-본문-표의-누락-검사)을 따른다. 목록·코드·표의 의미 검토와 자동 승인은 이 구조 검사만으로 완료되지 않는다.

## 보존과 검증

적용은 기존 garden-operation lock 아래에서 수행하고 설정·조사 목록 hash를 쓰기 직전에 대조한다. `.local/research/local-ai/source-registrations/<UUID>/`에 정확한 기존 파일, prepared와 applied receipt를 보존한다. source-channels 한 파일만 atomic 교체한다. 실패 시 receipt와 실제 파일 hash로 적용 여부를 구분한다.

복구본에는 다른 작업자의 등록 전 변경도 포함된다. 복구 시 applied receipt의 `channels_after_sha256`와 현재 파일이 일치하는지 확인하고 같은 lock 아래에서 복원한다. 이후 변경이 있으면 복구본으로 덮어쓰지 않고 이번 추가 channel만 검토해 제거한다. 복구본·receipt는 Git에서 제외한다.

레시피 데이터와 코드도 일일·개별 수집 fingerprint에 포함한다. 앞선 통합 성공을 새 설정의 성공으로 재사용하지 않는다. 이번 묶음은 좁은 등록·레시피·기존 RSS/daily 검사만 한 번 묶어 실행한다. 전체 suite·50경로 live 재수집·Drive/공개 배포는 별도다.


## 저장된 본문에서 후속 원문 찾기

새 출처도 기존 본문 anchor와 공통 수집기를 먼저 사용한다. 현재 후보의 정확한 저장 판본을 지정해 일일 재수집 없이 시작할 수 있다.

```sh
node scripts/research-followups.mjs --parent-source-run STORED_SOURCE_RUN \
  --candidate CANDIDATE_KEY --backlog .local/research/candidate-backlog.json \
  --target https://publisher.example/original --intake --collect-run NEW_SOURCE_RUN
```

`--target`은 저장 본문에 실제로 있는 링크여야 한다. 생략하면 기존 본문 링크 목록과 수집 한도를 사용한다. 원문 bytes·parse·후보 신원이 바뀌면 등록 전에 중단한다. 새 자료의 발표일과 본문은 해당 자료에서 다시 읽으며, 확보 성공은 기사 승인이나 정기 수집 경로 활성화가 아니다. 일일 입력에서 시작할 때는 기존 `--handoff`를 사용한다. 두 시작 방식은 혼용하지 않는다.

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

### 저장 직후 파싱 실패와 이미지 OCR 재개 (2026-10-10)

`parsing.reparse`와 기존 `reparse --source-run`은 원문은 저장됐지만 run의 `documents.json`·`parses.json`이 아직 생성되지 않은 실패를 복구한다. `fetch-*` 외에 `listing-fetch`·날짜/페이지 목록·`detail-*`·`body-image-*`·공식 보충 자료 fetch 단계도 읽는다. 완료 체크포인트의 정확한 경로·JSON hash·source ID·원문 bytes를 검증하고 확보된 응답만 재사용한다. 같은 출처의 판본 또는 관측이 충돌하면 명시적으로 거부한다. 이미 존재하는 원문/parse snapshot과 기존 실패 run은 변경하지 않는다. worker 경로는 모듈 파일에서 해석하므로 파서의 직접 호출도 현재 shell 디렉터리에 의존하지 않는다.

```sh
node scripts/research/modules/parsing.mjs reparse \
  --job module-parallel-collection-20261010-reparse-v1 \
  --json '{"run_id":"parallel-collection-20261010-reparse-v1","source_run":"STORED_FAILED_RUN"}'
```

이미지 본문은 원 기사 제목·발표일을 목록과 먼저 대조한다. 충돌하면 이미지 요청/OCR 전에 `title_conflict`·`date_conflict`로 남긴다. 이미지 OCR 예외는 `article_image_body_parse_failed`와 `body_images[].parse_status=failed`·`error`로 보존하며, 확보한 이미지 document를 누락시키지 않고 다른 이미지를 계속 처리한다. 실패한 파싱 단계는 수정 후 재개할 수 있고 완료 fetch 단계는 재요청하지 않는다. 원문 수집 성공·OCR 문자열은 숫자/표 검토 완료나 기간 수집 완료를 대신하지 않는다. 아래 전체 프레임 검토·영구 재사용 경로로 로봇신문의 대기를 해결했다. KRIBB는 아래 공식 허용 경로 전환으로 자동 수집 검증 대기에서 정리했다.

### 이미지 본문 검토의 영구 재사용 (2026-10-10)

원 이미지를 열어 전체 프레임·표·모든 셀을 대조한 `ocr-table`의 whole-image 결과를 `article-image-source`로 원 기사 DOM과 연결한다. HTML 제목·발표일은 메타데이터 parse, 이미지 표는 별도 원문과 검토 parse로 유지한다. 실제 빈 셀은 명시적 원본 대조와 위치 근거가 있고 OCR 참조가 없는 정확한 빈 문자열만 허용한다. 공백 문자열, 미검토 빈칸, 인식된 텍스트를 지우는 빈칸은 거부한다.

```sh
node scripts/research/modules/parsing.mjs remember_image_review \
  --job module-REGISTER_ID \
  --json '{"source_run":"COMPLETE_ARTICLE_IMAGE_SOURCE_RUN"}'
node scripts/research/modules/collection.mjs scan \
  --job module-REPAIR_ID \
  --json '{"run_id":"NEW_RUN","channel":"CHANNEL_ID","since":"2026-10-08","until":"2026-10-09","repair_source_run":"ORIGINAL_INCOMPLETE_RUN"}'
```

등록은 비공개 root의 `article-image-reviews/index/<article-id>/<HTML-sha>.json`에 실제 native binding의 경로·SHA를 저장한다. 프로세스 재시작 후 같은 root를 쓰면 재사용한다. 인덱스는 검색용이며 매번 원 HTML·전체 이미지 bytes·DOM 위치·제목·발표일·검토 셀·parse 파생 근거를 다시 검증한다. 최신 관측 시각은 해당 수집 run에만 반영하고 기존 canonical parse와 검토 시각은 변경하지 않는다. 원본이 달라지면 새 이미지 검토가 필요하며, 검토 기록 변조나 재개 단계 충돌은 완료로 인정하지 않는다. 백업·이동 시 기존 `documents/`, `parses/`, `runs/`와 `article-image-reviews/`를 함께 보존한다.

정상/부분 수집 검증과 원문 선택, onboarding의 본문 지문 검증은 연결된 이미지 본문을 포함한다. 원문 복구 run의 재개는 저장된 `repair-source-run`/`reuse-source-run`을 유지한다. 수집 후보는 `unreviewed`이며 기사·사건 승인과 발행은 별도다.

실제 로봇신문 보존2개·최신2개 이미지의 1,084셀과995 OCR블록을 원본 대조해 등록했다. 최신 정상 창 `[2026-10-08, 2026-10-09)`은21후보/24원문, 빈 창 `[2026-10-09, 2026-10-10)`은0후보다. 24원문을 재요청 없이 복구했고 정상/빈 창의 실제 재개·격리 장부 중복 병합을 검증해 정기61경로로 활성화했다. 원문 해시가 달라지는 다음 주가표까지 자동 검토한 결과는 아니다. 자세한 native run·receipt는 [수집 분석](SOURCE_COLLECTION_ANALYSIS.md)에 기록했다.

### 접근 차단의 진단과 재개 조건

robots 요청 실패는 `policy_failure`에 실패 단계·URL·최종 URL·HTTP·관측 시각을 남긴다. HTTP400/403/503 정책 확인 실패와 실제 robots 수집 금지를 구분하고,429는 기존 rate-limit 상태와 대기 규칙을 유지한다. 등록 출처의 `onboarding.access_resolution`과 수집 inventory에서 외부 재개 조건을 조회한다. 실패한 원문 수집을 뉴스 없음이나 기간 완료로 바꾸지 않는다.

KRIBB의 `https://www.kribb.re.kr/robots.txt`는2026-10-10에도 HTTP400과 공개 오류 `400 Bad Request Request Blocked`를 반환했다. 정확한 차단 장비나 규칙은 확인되지 않았다. `parallel-collection-20261010-kribb-diagnosis-v1`에 실패 정책 기록과166바이트 오류 원문/SHA를 보존했다. 정기 비활성 상태를 유지하며 같은 실패를 반복 요청하지 않았다.

직접 주소를 다시 수집하려면 사이트 운영자가 robots 정책을 정상 공개 응답으로 복구해야 한다. 기존 `import-capture`는 정책이 허용된 공개 페이지의403에 한정된 원본 반입 경로이므로, 정책 자체가 확인되지 않는 이번400의 해결 방법으로 사용할 수 없다. 회원·로그인 자료는 제공자의 허용된 API/접근 방법과 공개 범위를 먼저 확인한다.

### KRIBB의 공식 허용 경로 전환 (2026-10-10)

사용자의 「수집 허용 방법을 찾고 없으면 제외」 요청에 따라 [생명공학정책연구센터 BioIN](https://www.bioin.or.kr/bioin.do?cmd=greeting)의 [공식 RSS 안내](https://www.bioin.or.kr/bioin.do?cmd=rss)와 [공개 robots 정책](https://www.bioin.or.kr/robots.txt)을 확인했다. `Allow: /`가 적용되는 [부처연구성과 목록](https://www.bioin.or.kr/rsrch_Rslt.do?bid=research&cPage=1&listCnt=50)과 자체 게재 KRIBB 기사 본문 두 건은 공통 안전 요청으로 HTTP200·정책 checked였다. 허용 경로가 있으므로 KRIBB 기관 전체를 제외하지 않았다.

뉴스 RSS2,096항목과 부처·정책 RSS40항목은 본문 없이 외부 사이트를 연결하고 날짜 순서도 섞여 있다. 이 feed를 자동 기간 완료 근거로 사용하지 않는다. 기존 날짜 HTML 수집기를 재사용해 연구기관에 `한국생명공학연구원`이 명시된 카드8개만 수집하고, 다른 기관의 카드42개는 별도 ignored rule로 원문과 날짜를 보존한다. 기관 표시가 없거나 목록이 달라져 신원·순서·이전 날짜 경계가 증명되지 않으면 기존 검사에서 incomplete로 남긴다.

독립 경로 `bioin-kribb-research`는 BioIN 등록일·본문·출처 링크를 보존한다. 원 KRIBB 뉴스 게시판 전체를 수집한 결과가 아니며, 원 도메인·첨부 논문·그림을 추가 수집하거나 검토 완료로 간주하지 않는다. `kribb-bio-research`는 `discovery`로 남겨 원 주소와 실패 이력을 보존하며 자동 재시도·활성화 대기에서 제외했다. 실패한 robots를 수집 금지로 바꾸지 않았다.

정상 `[2026-10-03, 2026-10-10)`은1후보/2원문, 빈 `[2026-10-09, 2026-10-10)`은0후보/1목록 원문이다. 실제 CLI 재개와 격리 장부의 반복 병합을 검증해 정기61→62경로로 활성화했다. 기존61개 경로의 collection basis는 모두 같으며 기존 후보 승인·발행은 변경하지 않았다. 설정·원본·체크포인트·native 검증/활성화 receipt가 저장되어 같은 run을 재개할 수 있다. 근거와 복구본 위치는 [수집 분석](SOURCE_COLLECTION_ANALYSIS.md)에 기록했다.

### 관측 메타데이터와 수집 지문

후속 관측은 `onboarding.route_check`에 저장한다. BioIN의 최상위 `route_check`를 이 위치로 옮겨 관측 내용은 보존하고 정상/빈 실행에 저장된 route SHA `64744241f58572b63713a721527b6f1db5b75d117f07dd5544722422e118813e`와 다시 일치시켰다. URL·selector·host·정책·기간 변경은 계속 수집 지문을 바꾸며, 과거 receipt나 원문을 덮어쓰지 않는다. 구현 코드 변경의 재개 호환성은 별도 검증한다.

### TechCrunch 공식 날짜 목록과 탐색 경로의 종료 조건

`techcrunch-latest-archive`는 [공식 Latest](https://techcrunch.com/latest/)의 첫 목록20항목과 `/latest/page/{page}/`를 기존 `path-html-list-v1`로 수집한다. 목록의 실제 발행 `datetime`과 본문의 고유 h1·발행 time·entry-content를 대조하며, 발행처 달력은 `America/Los_Angeles`다. RSS20항목의 짧은 범위를 완전한 기간으로 취급하지 않는다.

정상 `[2026-10-08, 2026-10-09)`은3페이지에서 기간 경계를 확인하고29후보/32원문을 저장했다. 최초 제목 충돌의0후보 실패 기록을 보존하고, 같은32원문을 새 복구 실행에서 재사용했다. 후보 편입 검사의1개 이상 조건은 유지하면서 저장 원문 복구의 정확한 실패 근거를 별도로 검증한다. 실제 정상/빈 재개와 격리 장부의 반복 병합을 통과해 정기62→63경로에 추가했다. 빈 `[2026-10-10, 2026-10-11)`은 `2026-10-10T07:43:28.511Z`의 목록 관측까지0후보이며, 아직 끝나지 않은 발행처 하루 전체의 뉴스 없음이나 운영 수용 완료를 뜻하지 않는다. 검증·적용 receipt와 정확한 재개 입력은 [수집 분석](SOURCE_COLLECTION_ANALYSIS.md)에 있다.

`sciencedaily-latest-news`의 공개 HTML도 날짜가 섞여 있어 자동 수집에서 제외하고 discovery로 유지한다. 공식 날짜별 archive/API의 순서·페이지·기간 종료 근거가 있어야 재개한다. `pmlr-volumes-feed`는329개 권별 메타데이터에 개별 논문 발행일이 없어 탐색용으로 유지한다. 공식 논문별 발행일·전문·목록 경계가 필요하며 회의 날짜를 논문 발행일로 추정하지 않는다.

TheLEC의 회원 전용 원문23건은 기존 `source-access`의 정확한 metadata-only 제외 receipt가 유지된다. 같은 제목·발행일·원문 판본이면 요청하지 않으며 본문·후보·승인 근거에 포함하지 않는다. 공개 본문 또는 별도로 허용된 입력 범위가 확인되면 native reopen 절차로 재조사한다. IEEE 피드의 Wiley 외부 호스트 링크는 원문 요청 전 정책 범위 밖으로 중단된 사례로, 파싱 실패나 확인된 robots 금지로 바꾸지 않는다.

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


## 등록 경로의 공통 후처리

출처별 목록·상세 수집과 parse가 완료되면 같은 `research.mjs process-source` 경로로 추출→원문 의미 대조→명시적 사실 검토→원고를 진행한다. 별도 출처마다 모델 처리 코드를 만들지 않는다. 정확히 일치하는 완료 추출·대조·작성은 재사용하고, 출처별 특수성은 기존 profile/adapter에서만 처리한다. 이 후처리는 수집 경로 활성화나 자동 기사 승인·발행을 뜻하지 않는다. 명령, 검토 packet, 정정과 재개 방법은 [런북357절](LOCAL_AI_NEWS_RUNBOOK.md#357-공통-원문-후처리와-실제-작성정정재개)을 따른다.


일일 handoff의 명시적 후보 여러 개를 처리할 때는 `npm run research:process-daily -- --run <batch> --daily-run <collected-run> --candidate-keys <key> --plan-only|--execute|--resume`를 사용한다. 실패 항목은 원래 오류를 보존하고 다음 항목을 수행하며 동일 run에서 자동 재호출하지 않는다. 각 source/identity/fact/editorial 상태는 비공개 현황판에서 확인한다. 명령·명시적 검토 경로는 [런북358절](LOCAL_AI_NEWS_RUNBOOK.md#358-일일-후보의-공통-묶음-처리와-단계별-현황)에 있다.

모델에 원문을 전달할 때 날짜는 공통 `modelSourceDates`를 사용한다. `parse.dates` 전체를 프롬프트에 넣지 않는다. 날짜 후보의 raw 값에 본문 또는 내장 script가 들어갈 수 있으므로 resolved published_at/modified_at/precision/observed_at만 전달하고, 원래 검증 근거는 immutable parse에 보존한다. 기사 본문 block은 이 처리를 이유로 절단하지 않는다. 실제 ABB 사례와 회귀 검증은 [런북359절](LOCAL_AI_NEWS_RUNBOOK.md#359-abb-실제-일일-묶음과-날짜-근거-문맥-중복-디버깅)을 따른다.

과거 verified 후보에 event_id가 있지만 현재 승인 receipt가 없는 경우에는 공통 묶음 처리에서 identity_review로 분기한다. 기존 승인을 덮어쓰거나 신규 사건으로 등록하지 않는다. 실제 수집 디버깅과 전체 원문 대조 복구는 [런북360절](LOCAL_AI_NEWS_RUNBOOK.md#360-abb-전체-원문-대조-복구회사명-검토기존-승인-중복-차단)을 참조한다.

이미 verified인 private 후보에 현재 approval binding이 없으면 `candidate-approval --existing-editorial-review`로 과거 승인·원문·현재 재검토 원고의 동일 사건 관계를 명시적으로 검토한다. 이벤트ID를 바꾸거나 기존 승인 삭제로 우회하지 않는다. 일반 적용 FAQ의 뉴스 제외는 기존 `candidate-disposition`을 사용하고 원문은 보존한다. 명령/리뷰 스키마/실제 사례는 [런북362절](LOCAL_AI_NEWS_RUNBOOK.md#362-기존-비공개-승인-연결과-배경자료의-반복-처리-종료)을 따른다.


### 공통 후처리 인용 오류의 재사용 가능한 복구

출처별 파서나 crawler를 추가하기 전에 원문 block과 모델 인용의 차이를 확인한다. 공백·곡선 따옴표 차이만이면 기존 exact 검증을 유지하고 `npm run research:evidence-quotes -- --run NEW_RUN --source-run FAILED_ASSESSMENT --review PRIVATE_JSON`으로 명시적 검토를 새 run에 기록할 수 있다. source read/원 input·raw SHA/동일 block의 실제 quote/검토 이유가 필요하며 판정·수치·주체·의미 변경은 거부한다. 생성 모델을 재호출하지 않고 core evidence validator와 기존 process-source --assessment-run을 재사용한다. 실제 source·claim/schema가 잘못된 경우에는 이 경로로 성공처럼 만들지 않는다. 입력·검증·실제 GitHub/MLX 사례는 [런북363절](LOCAL_AI_NEWS_RUNBOOK.md#363-mlx-새-출처-전체-처리와-명시적-인용-정정-재사용)을 따른다.


### 일일 처리에서 완료된 원문·검토·원고의 재사용

새 source crawler나 모델 생성 전에 기존 완료 run을 확인한다. `research:process-daily --processing-runs PRIVATE_JSON`은 같은 후보/판본/parse/본문/URL과 기존 input SHA를 고정하고 원문·packet·사실 승인·원고 정정·승인을 읽는다. metadata·추론·수집을 하지 않으며 삭제한 모델을 재설치하지 않는다. 미완료 결과는 성공으로 승격하지 않고 fact/writer/editorial/approval 단계와 기존 identity 관문을 구분한다. 같은 입력의 source/core reader 지문 변경은 새 batch를 사용한다. [런북364절](LOCAL_AI_NEWS_RUNBOOK.md#364-일일-묶음에서-완료된-처리-결과를-다시-추론하지-않고-연결)의 실제 명령과 실패/재개 증거를 따른다.

### 출처와 무관한 원고 편집 검사

원고 생성 이후에는 출처별 편집 규칙을 새로 만들지 않고 `research.mjs editorial-check` 및 새 승인 관문을 공통으로 적용한다. 문장 수·리드 길이·알려진 날짜 표기·정확한 반복을 검사하고, 같은 사실을 쓰는 설명은 직접 검토한다. 원출력과 정정 이력은 보존한다. [읽을 내용이 있는 브리핑](BRIEFING_QUALITY.md#로컬-원고의-편집-검사)의 명령·승인 입력을 따른다.

### 발표일이 관측되지 않은 readable 원문과 독립 날짜 근거

`manual-readable-capture/v1`의 실제 도구 transcript에 발표일 헤더가 없으면 `publication_date_policy: "not-observed"`를 명시하고 필요할 때 `markdown_title_line`만 지정한다. transcript의 정확한 URL·조회 범위·SHA, 추출 본문 bytes와 기존 정책 허용/본문 403 관측은 그대로 검증한다. 날짜 selector나 목록 날짜를 함께 넣을 수 없으며 원문 parse의 `dates.published_at`은 null로 보존한다. 저장 transcript를 이번에 다시 읽은 시각은 원래 HTTP 요청·도구 열람 시각과 구분하고, readable text를 raw HTML이나 성공한 live GET으로 기록하지 않는다.

별도의 공식 RSS item이 같은 원 URL·제목·발행자를 직접 확인해 주면 독립 sourceVersion/parse의 정확한 `link`, `title`, `pubDate` 위치와 사용한 claim 인용으로 날짜를 결속할 수 있다. 이를 원문 행에 삽입하거나 RSS 전체의 `lastBuildDate`·수정일로 대신하지 않는다. 명시적 `publication_date_preserve_time`은 유효한 ISO 또는 GMT/숫자 UTC offset이 있는 RFC2822 원 헤더의 시각을 보존한다. 시간대 없는 값·잘못된 날짜/요일·불명확한 시간대 약어는 거부한다. 기본 day 계약은 유지하며, 날짜만 있는 ISO 헤더는 `source-publication-time` 근거가 될 수 없다. 원문 게시일과 한국 날짜가 다르면 timestamp 정밀도를 유지해 `Asia/Seoul` 날짜와 원 source-day를 함께 검토한다. 원문 확보와 날짜 결속만으로 사실·편집·소급 검토 또는 발행 승인이 완료되지는 않는다.
