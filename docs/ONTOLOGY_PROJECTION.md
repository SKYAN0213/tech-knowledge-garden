# 검토된 기사 근거의 온톨로지 투영

## 목적과 입력 경계

`scripts/research-ontology.mjs`는 이미 저장된 **비공개 승인 run**을 읽어 사건·사실·원문 근거의 관계를 별도 스냅샷으로 만든다. 수집, 파싱, Ollama 호출, 기사 승인, Drive 쓰기, 사이트 생성은 실행하지 않는다. 새 원문을 얻으려면 기존 수집 경로가 필요하지만, 과거 승인본의 관계를 다시 계산할 때는 재수집이 필요 없다.

입력은 `research.mjs approve`가 만든 `draft.json`, `reviewed-claims.json`, `documents.json`, `parses.json`, `editorial-review.json`, `approved-article.json`이다. 기존 `loadCurrentApproval`이 원문 bytes·파싱·사실 검토 지문·최종 원고 승인을 다시 검증한 뒤에만 투영한다. 입력 파일을 읽는 동안 해시가 바뀌면 중단한다. 여러 승인 run을 묶을 때 같은 `event_id`의 두 판본을 자동 병합하지 않는다.

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

스냅샷은 생성 시점의 승인 입력 해시와 자체 내용 해시를 가진다. 승인 원고·원문·검토가 바뀌면 새 이름으로 다시 생성한다. 기존 스냅샷을 현재 사실로 자동 승격하지 않는다. 현재의 08시 수집·발행 예약과는 연결하지 않았고 공개 사이트에도 투영하지 않는다.

## 검증

```sh
node --test tests/research-ontology.test.mjs
npm run test:garden
npx tsc --noEmit
```

회귀시험은 미승인·미참조 주장 제외, 직접 원문 근거 연결, 계획/완료 상태 보존, 사건 ID 충돌, 해시·관계 타입 오류, 기존 스냅샷 덮어쓰기 거부를 확인한다. 실제 승인 run으로 스냅샷을 만든 뒤 `timeline`과 `trace`의 원문 경로를 확인해야 운영 자료에 적용한 것이다. 구조 검증만으로 기업 동일성, 수치의 비교 가능성, 출처 독립성 또는 기사 전체의 사실 정확도를 새로 승인하지 않는다.

2026-09-29 로컬 검증에서는 RubyGems·OpenAI Jalapeño·연구 사업화 심층 기사 승인 run 세 개로 `reviewed-evidence-20260929-v1`을 만들었다. 사건 3개, 참조된 검토 주장 27개, 근거 블록 38개, 원문 판본 5개가 연결됐다. RubyGems 기업 표기의 사건 조회, 한 주장부터 원문 SHA·parse/block까지의 역추적, `inference` 개념의 명시적 기사 연결을 CLI로 확인했다. 생성 파일은 비공개 `.local/`의 0600 파일이며 Drive·작성 `vault/`·공개 사이트·기존 예약에는 반영하지 않았다.
