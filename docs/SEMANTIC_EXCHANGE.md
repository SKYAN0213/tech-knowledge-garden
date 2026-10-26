# 공개 시맨틱 교환 어댑터

`scripts/research/semantic-exchange.mjs`는 기존 공개 기사·검토된 개념·이미 존재하는 공개 의미 검토 색인을 `semantic-bundle/v1`로 투영한다. 읽기 전용 CLI이며 native 승인, 의미 검토 workflow, 수집, 임베딩, 모델, Drive 복원·접속, 발행을 호출하지 않는다. 정규 운영 정책과 개발 완료 관문도 변경하지 않는다.

## 실행과 입력 범위

등록된 Node.js 22 이상 실행 파일과 저장소의 고정 CLI를 사용한다.

```text
node <registered_repo>/scripts/research/semantic-exchange.mjs export \
  --root <registered_repo> \
  --output <registered_bundle_root> \
  --source-id <registered_source_id>
```

모든 경로 인자는 절대 경로다. `--root`는 실제 CLI가 속한 저장소와 일치해야 한다. `--vault <registered_public_or_synthetic_vault>`를 지정하면 자료 사본을 명시적으로 선택한다. 기본 Vault는 `<root>/vault`다. 선택한 Vault와 의미 색인은 항상 다음 조합으로 묶인다.

| 입력                              | 고정 위치                                            |
| --------------------------------- | ---------------------------------------------------- |
| 공개 기사                         | `<vault>/News/**/*.md`                               |
| 검토 개념 registry                | `<vault>/Knowledge/**/*.md`                          |
| 이미 존재하는 공개 의미 검토 색인 | `<vault>/../data/article-semantic-review-index.json` |

별도 `--review-index`나 문서에서 읽은 명령·경로는 받지 않는다. 합성 Vault를 선택하면 정본의 의미 색인과 섞이지 않는다. `News`·`Knowledge` 안의 숨김 `.md` 파일도 입력에 포함하며 생성·실제 bytes 변경·삭제를 source snapshot에 반영한다. 숨김 하위 디렉터리는 순회하지 않는다. Wiki의 외부 TKG 입력 지문도 이 목록과 일치해야 하며 일반 Wiki의 숨김 경로 정책은 별개다. symlink, hardlink, 일반 파일이 아닌 입력, 잘못된 UTF-8, 읽는 동안 바뀐 입력은 실패한다. 파일별 최대 4 MiB, 전체 입력 최대 64 MiB이며 의미 색인에는 전체 한도를 적용한다.

출력은 저장소와 선택 자료 트리의 바깥에 둔다. 위키 manager가 자체 state 아래의 bundle 디렉터리를 제공하고 단일 처리열을 소유한다. 감시 대상은 위 세 입력으로 한정하고 출력·로그·state·`.local`·`private.local`·`public`·`digest`를 입력에서 제외한다. 어댑터 자체는 감시·timer·반복 polling을 만들지 않는다.

## 공개 필드와 판본

기사는 native 공개 투영의 `review_status=verified`인 자료만 포함한다. 개념은 기존 `conceptRegistry`의 include 선정, 정의, 출처, ID와 검토 메타데이터를 확인한다. 기사 ID는 원래 `event_id`, 개념 ID는 원래 `concept_id`를 `native_id`로 보존한다. 교환 ID는 `garden:<source_id>:<kind>:<native_id>`다. 제목이 같아도 ID를 합치지 않는다. native 관계에 개별 ID가 없으면 자료 종류·양끝 native ID·원래 역할/타입의 JSON tuple로 안정적인 구조 ID를 만든다.

공개 투영은 기사 제목·공개 검색 본문·분야·출처 URL과 개념 제목·정식 label/별칭·한 문장 정의·개념 종류·출처 URL을 담는다. 정식 label이 제목과 다르면 검색 별칭에 포함한다. 여러 출처 URL을 모두 보존한다. 개념의 내부 본문·keywords·map review 이유, 승인 payload, native 작업 경로·run/task 식별자, 원문 전문과 토큰은 내보내지 않는다. 해시 검증에 필요한 metadata는 해시값으로만 남긴다.

`provenance.bytes_sha256`은 실제 공개 노트 bytes의 SHA-256이다. 파일 기반 native 판본은 `revision=sha256:<bytes_sha256>`으로 식별한다. `garden:article-public/v1`은 기존 `articlePublicFingerprint`의 NFC/공백 정규화 지문이며 raw SHA와 별개다. 기존 승인·의미 입력·정책·영수증·개념 registry 지문은 각각 `garden:native-review/<original_hash_field>`에 보존한다. 현재 registry 지문도 별도다. 과거 지문을 현재 값으로 덮어쓰지 않는다.

관계의 `garden:topic`, `garden:application`, `garden:comparison_evaluation`, `garden:context_background` 역할을 유지한다. 개념 사이의 공개 무방향 `garden:associated`와 원래 `native_type/native_directed/native_basis`를 함께 보존한다. 기존 유형 없는 기사 지정은 `native_type=null`, `status=declared`, `semantic=unreviewed`다. 원래 공개 claim ID·근거 URL은 `native_evidence_ids`에 남긴다. 공개 색인에 exact quote/claim 본문이 없으므로 원문 인용을 만들거나 임의 기사 문장에 claim ID를 붙이지 않는다. 현재 출력의 evidence는 `declared`이며 `evidence_ids=[]`, `evidence=[]`다.

## 검토 상태와 삭제

| 입력 상태                                             | 교환 상태                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| 현재 기사·registry·연결 개념 SHA와 일치하는 공개 색인 | 원래 `reviewed_links` 또는 `reviewed_none`                                |
| 공개 색인 부재 또는 해당 기사 검토 부재               | `unreviewed`, coverage `partial`                                          |
| 기존 유형 없는 개념 지정                              | `unreviewed`, native status `legacy_untyped`                              |
| 공개 frontmatter에만 있는 검토 라벨/역할              | 원래 native status/역할 보존, 공통 검토는 `unreviewed`, 누락 이유 표시    |
| 기사 공개 지문·registry·연결 개념 지문 불일치         | `semantic=unavailable`, `currentness=stale`, 원래 native status/지문 보존 |
| 미승인 공개 투영·선정 밖 개념 참조                    | 해당 자료/관계 생략과 구체적인 누락 이유                                  |
| 입력 root 부재·손상·중복 ID·잘못된 색인               | 실패, 기존 current 유지                                                   |

`publication=approved`는 읽은 native 공개 투영의 승인 상태다. 교환 실행이나 구조 검증을 새 native 승인·원문 재검토·원격 발행으로 승격하지 않는다.

`coverage.status`는 의미 자료의 부족을, `coverage.inventory`는 승인된 입력 목록을 실제로 확인했는지를 나타낸다. 성공한 전체 목록 확인은 `inventory=complete`이며 의미 검토가 부족하면 동시에 `status=partial`일 수 있다. 이때 현재 묶음에서 빠진 원래 ID는 확인된 제거로 처리할 수 있다. root를 읽지 못한 경우 빈 목록을 성공으로 내보내지 않는다. 개념 제외/기사 제외도 native 현재 투영의 범위 변경이며 과거 파일은 불변 generation에 남는다.

## 증분과 무결성

실제 bytes SHA, native ID, 관련 의미 검토/registry 지문, 생산 코드 지문이 같은 record는 이전 검증 묶음의 record를 재사용한다. mtime·inode·이벤트 자체로 내용이 같다고 판단하지 않는다. 전후 입력과 생산 코드 SHA가 다르면 `SOURCE_CHANGED`로 실패하며 manager가 미처리 변경을 다시 실행한다. 처리 중 변경을 숨기는 자동 재시도는 없다.

공통 `writeBundle/loadBundle`의 불변 generation·해시 manifest·atomic current 포인터를 사용하고 공개 allowlist로 다시 읽어 검증한다. 내용이 같으면 current를 다시 쓰지 않는다. 기존 묶음이 손상됐으면 이를 빈 결과로 대체하거나 정상으로 재생성하지 않는다. 동시 writer 조율·영속 대기열·crash 복구는 위키 manager가 맡는다. 성공 출력의 `counts.projected/reused/deleted`는 현재 실행의 record 처리 수다.

stdout에는 JSON 결과 하나를 쓴다. `status=updated|unchanged`, `pointer`, `coverage`, `counts`, `source_snapshot_sha256`, `implementation_sha256`, `script_sha256`, `artifact_manifest_sha256`을 반환한다. 실패는 exit 1과 stderr JSON의 안전한 오류 code로 보고한다. parser/IO 오류 본문에는 비공개 metadata나 절대 경로가 있을 수 있으므로 그대로 출력하지 않는다.

`implementationFingerprint()`는 어댑터·실제 local reader import closure·기존 dependency lock·공통 artifact manifest의 상대 경로와 SHA를 정렬한 `files`와 그 compact JSON의 SHA를 반환한다. 등록 시 고정한 코드 목록과 실제 파일 SHA도 실행 전후 확인한다. source snapshot SHA는 `News`, `Knowledge`의 정렬된 재귀 `.md` 목록을 순서대로 `[relative_path,bytes_sha]`로 담고 마지막 `[@public-semantic-index,index_sha_or_null]`를 붙인 compact UTF-8 JSON의 SHA다. source와 implementation 지문은 별개다.

## 고정 공통 artifact와 검증

`scripts/vendor/semantic-common/0.1.1/`은 C0의 frozen candidate 13개 payload와 artifact manifest 전체를 같은 bytes로 포함한다. 소비자의 `.gitattributes`는 raw CRLF fixture에 `-text`를 적용한다. 공통 산출물을 수동 분기하지 않는다. 기존0.1.0 vendor와 과거 generation은 보존한다.

- Artifact manifest SHA: `3f894b066246ac2e163b54e582068aa179bfa28baeed8563ae23f992d236a0fa`
- Fixtures manifest SHA: `ca1f37de2bc0a281d79236ab1c9c42c9c59992b1fdf5a965ef64f09f81e302a4`

라이브러리/산출물 버전은0.1.1이며 bundle·manifest의 `contract_version=0.1.0`과 `semantic-bundle/v1`은 유지한다. 기존 Node/Python0.1.0 reader와 이전 writer의 묶음을 양방향으로 읽는다. NDJSON의 UTF-8 한도1MiB(끝 LF 포함)와 초과 시 해당 root 재대조는 vendored `WATCH_PROTOCOL.md`를 따른다. 어댑터 자체는 watcher를 기동하지 않는다.

공통 manifest와 어댑터 구현 pin이 바뀌므로 기존 Wiki 연결은 명시적 configure로 새 구현을 등록해야 한다. 기존 등록·current 포인터·검증 상태를 자동 갱신하지 않는다. 격리 개발판 반영은 TKG 정본 운영 실행본의 승격과 분리한다.

전용 합성 시험은 다음 명령으로 실행한다.

```sh
node --test tests/semantic-exchange.test.mjs
```

2026-10-26의0.1.1 격리 개발판은 Node22.20.0과 Node26.4.0에서 전용24개 시험을 통과했다. 숨김 Markdown 생성·실제 bytes 변경·삭제와 숨김 디렉터리 제외, 이전 Node/Python reader 및0.1.0 writer와의 양방향 읽기, 과거 generation 불변, raw CRLF fixture의 Git `-text`를 확인했다. 운영 정본·기존 연결의 configure·승인·모델·Drive·배포·commit/push는 수행하지 않았다.

같은 날 사용자의 최신판 운영 적용 요청으로 `tkg-semantic-common-20261026-v5`를 native 완료 관문을 거쳐 설치·활성화했다. 실행본에는 공통 라이브러리의 규격 문서와 raw fixture까지 고정한500개 파일이 포함된다. 설치본에서 실제 공개 자료495개·관계304개를 내보내고 같은 입력의 두 번째 실행에서495개 record를 전부 재사용했으며 current 포인터 bytes가 유지됐다. 원문·승인·기존0.1.0 자산을 보존했다. 검토 registry 밖의 관계 대상6건은 기존대로 partial 근거로 남기며 자동 승인하지 않는다. Wiki의 기존 등록 변경과 운영 Vault 활성화는 이 TKG 실행본 승격에 포함하지 않는다. 개발·설치·실제 실행의 정확한 SHA와 결과는 비공개 `.local/research/semantic-operations-adoption-20261026/`에 보존한다.

2026-10-23 최신 candidate5의 증분 수정판을 기존 Node 22.20.0에서 19개 시험으로 검증했다. Python 3.9.6 reader/writer와 Node reader 왕복도 통과했다. 네 가지 역할·native 관계 보존, 미검토/none/partial 구분, raw/정규화 지문 분리, 시간 복원 후 실제 내용 변경, registry 무효화, rename/delete/recreate, 처리 중 변경, symlink/크기 제한, 손상 묶음, CLI 오류 누출 방지를 포함한다. 바뀌지 않은 기사 5개를 다시 export할 때 native 공개 본문 정규화가 0회임을 실제 호출 계수로 확인했다. fixture는 임시 합성 자료이며 model/네트워크/운영 승인을 호출하지 않는다.

격리 worktree의 공개 데이터 사본을 한 번 읽어 기사 429건·검토 개념 36개·관계 102개를 export/load 검증했다. 전체 원본 목록은 complete, 의미 범위는 partial, 모든 기사는 unreviewed였고 앞뒤 source bytes가 같았다. 같은 입력의 두 번째 실행에서는 465개 record를 재사용했고 실제 공개 본문 정규화 0회와 current 포인터 bytes 불변을 확인했다. 일회성 출력은 정리했다. canonical 통합·위키 실제 이벤트 연동·운영 활성화·Windows 수용은 이 검사에 포함되지 않는다. D0가 canonical 반영 시점을 결정하며 import closure가 바뀌면 새 지문과 영향 시험으로 다시 확인한다.
