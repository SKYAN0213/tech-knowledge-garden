# Semantic Bundle v1 — 0.1.0

이 규격은 로컬 읽기 전용 교환 계약이다. 검증 성공은 구조·연결·바이트 무결성의 성공이며 원문 검토, 문서 적용, 기사 승인 또는 발행 권한을 부여하지 않는다. 권한은 각 native 프로젝트에 있다.

## Wire와 식별

UTF-8 JSON(BOM 없음), `schema=semantic-bundle/v1`, `contract_version=0.1.0`이다. 실행 검증기는 `runtime/semantic_common.py`와 `runtime/semantic-common.mjs`, 기계 스키마는 같은 폴더의 `semantic-bundle.schema.json`이다. 알려지지 않은 필드는 거부하며 확장은 양쪽 동일 fixture 검증 뒤 별도 산출물로 고정한다.

- `source={id, project}`: 등록된 소스 ID와 `wiki|garden`. source ID는 실행 명령·경로가 아니다.
- `records`: `document|article` 자료와 `concept|entity|claim|event|procedure` 의미 대상을 구별한다. `id`는 묶음 안의 고유하고 안정된 교환 ID, `native_id`는 변경하지 않은 native ID다. 동일 이름·별칭·범위만으로 ID를 합치지 않는다. `title`, `text`, `scope`, `aliases`는 공개 투영/허용 문맥이다. 작은 주장도 `kind=claim`으로 표현할 수 있다.
- `provenance={path,url,urls,bytes_sha256,revision,fingerprints}`: path는 상대 표시 경로, url/urls는 대표 및 전체 http(s) 표시 참조다. URL host는 ASCII DNS label(또는 punycode) 문법, 표준 dotted-decimal IPv4, bracket IPv6만 허용하며 포트는0~65535다. 자격정보·percent host·Unicode host 원문·비표준 숫자 IP·Unicode 공백/BOM은 거부한다. 이는 DNS/접속 검증이 아니며 두 언어가 같은 표시 URL 문법을 사용하기 위한 제한이다. native canonical URL을 그대로 넣고 검증 중 URL을 재직렬화하지 않는다. 둘 다 실행·임의 읽기의 입력이 아니다. `bytes_sha256`은 실제 native 원본 bytes의 SHA-256이며 표시 text의 해시로 다시 만들지 않는다. `revision`은 native의 정확한 판본 문자열이다. 기존 승인/의미 검토 지문은 `{profile,value}` 목록으로 별도 보존한다.
- `evidence`: exact quote와 원본 native ID/revision/bytes SHA, locator를 보존한다. `record_id=null`은 공개 원문 전체를 묶음에 복제하지 않은 외부 근거다. record_id가 있으면 그 record의 판본·바이트 해시와 일치하고 quote가 text에 정확히 존재해야 한다. 검색 정규화로 인용을 맞추지 않는다.
- `relations`: 양끝 record ID를 가리키며 namespace가 붙은 native predicate를 보존한다. relation `id/native_id`, 방향, 상태, 구체적인 reason, evidence ID를 유지한다. `basis=explicit|inferred|unknown`, `native_type/native_directed/native_basis`(각 null 허용)를 별도 보존한다. `native_evidence_ids`는 원래 공개 claim ID/근거 URL을 보존하며 공개 exact quote가 없는 native ID를 evidence 노드로 위조하지 않는다. garden의 공개 associated 투영과 native typed 관계/source|inference 근거를 혼합하지 않는다.

`normalization=nfc-lf-space/v1`은 검색용 NFC, CRLF/CR→LF, 연속 ASCII 공백/탭/줄바꿈 축약이다. 원본·exact quote·수치·부호·단위·기존 revision에 적용하지 않는다. Python과 JS 모두 Unicode code point를 기준으로 문자열 길이를 검증한다.

## 관계와 검토

위키의 `wiki:about`, `wiki:broader`, `wiki:instance_of`, `wiki:part_of`, `wiki:depends_on`은 유방향이다. 기사 역할 `garden:topic`, `garden:application`, `garden:comparison_evaluation`, `garden:context_background`도 유방향이며 `garden:associated`만 무방향이다. 자동 형변환, 전이 추론, 개념 병합은 없다. native source와 namespace가 일치해야 한다. 별도의 대응은 명시적인 제품 메타데이터에서 관리한다.

각 record의 review는 독립된 축이다.

| 축 | 값 |
| --- | --- |
| semantic | unreviewed, reviewed_links, reviewed_none, insufficient, unavailable |
| evidence | unreviewed, declared, verified, insufficient, unavailable |
| currentness | current, stale, unavailable |
| application | not_applied, applied, unknown |
| publication | unapproved, approved, published, private, unknown |
| native_status | native 문자열 또는 null |

`verified` record는 verified evidence를 하나 이상 참조해야 한다. `reviewed_links`는 declared/reviewed outgoing relation이 필요하고, `reviewed_none`에는 그런 relation이 없어야 한다. candidate/rejected 관계는 확정 관계가 아니다. 공개 adapter는 garden 자료의 publication이 approved/published인지 따로 검증한다. 묶음의 publication 값을 native 승인으로 역수입하지 않는다. native 지문은 provenance.fingerprints에 프로필 이름과 함께 담는다.

`coverage={status,inventory,omissions}`는 complete/partial/unavailable와 누락 record ID(불명이면 null)/reason을 구별한다. complete에는 omissions가 없어야 하며 unavailable을 complete로 바꾸지 않는다. inventory=complete일 때만 빠진 record를 확인된 삭제로 처리한다. inventory=partial/unavailable에서 빠진 record는 삭제·reviewed_none가 아니다. 의미 검토 미완료로 status=partial이어도 전체 자료 목록을 확인했다면 inventory=complete일 수 있다. 소비자는 마지막 정상판을 보존하고 누락/불확실 자료를 현재 사실 근거에서 제외한다.

## 저장·검증·증분

`bundles/<bundle_id>/bundle.json`과 `manifest.json`은 불변이다. bundle_id는 bundle.json **파일 bytes** SHA-256이다. manifest는 `semantic-bundle-manifest/v1`, contract_version, source_id, bundle_id와 단일 파일 `{path:"bundle.json",bytes,sha256}`를 포함한다. 새 판본은 .stage 임시 디렉터리에서 파일을 완성·fsync한 뒤 bundle_id 디렉터리로 atomic rename한다. crash가 남긴 .stage 디렉터리는 판본이 아니며 읽거나 자동 삭제하지 않는다. 검증 후 `current.json`의 `{schema:"semantic-bundle-pointer/v1",bundle_id,manifest_sha256}`만 atomic rename한다. serializer 일치를 전제하지 않으며 수신자는 저장된 bytes를 해시한다.

Python: `validate_bundle(value, source_id=None, require_public=False)`, `load_bundle(root, source_id=None, require_public=False)`, `write_bundle(root, value)`, `normalize_search(text)`.
Node: `validateBundle(value, {sourceId, requirePublic})`, `loadBundle(root, options)`, `writeBundle(root, value)`, `normalizeSearch(text)`.
load는 `{bundle, manifest, pointer}`/dict를 반환하고 실패는 예외로 보낸다. 부분 쓰기/해시 오류/소스 불일치/범위 이탈은 빈 묶음으로 대체하지 않는다. Python stdlib와 Node >=22 built-in만 쓴다. 검증기는 네트워크·모델·native 승인/의미 export를 호출하지 않는다.

기사 CLI 계약: `node <registered_repo>/scripts/research/semantic-exchange.mjs export --root <registered_repo> --output <registered_bundle_root> --source-id <registered_source_id>`. 허용된 고정 파일/경로만 manager가 구성한다. stdout은 JSON 결과 1개, 실패는 exit!=0이다. export는 기존 공개 투영/검토 결과를 읽으며 native 파일을 수정하거나 semantic review/export를 시작하지 않는다. 원본 bytes SHA와 native review/registry fingerprint가 동일하면 이전 record를 재사용하며 index/manifest 판본은 함께 검증한다. `--vault`는 명시적으로 등록한 합성 자료 또는 공개 작업 사본 선택에만 사용한다.

## 동등성 시험

공통 fixtures는 실제 CRLF/NFD/± 수치/동명이의어/위키 관계/기사 무방향 연관성/각 검토 상태를 포함한다. `python3 -m unittest discover -s tests -p 'test_*.py'`와 `node --test tests/*.test.mjs`에서 동일 JSON/bytes·반례를 읽는다. `scripts/build_release.py`가 source 파일 SHA와 fixtures를 포함한 `dist/semantic-common-0.1.0/`를 생성한다. 두 소비자는 이 디렉터리 전체와 `artifact-manifest.json` SHA를 pin/vendor한다. vendor를 수동 분기하지 않는다.
