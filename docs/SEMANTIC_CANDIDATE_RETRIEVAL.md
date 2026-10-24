# 기사 의미 연결 후보 검색

## 목적

기사별 의미 검토에서 매번 모든 개념 설명을 반복 전송하지 않도록, 검토된 개념만 미리 색인하고 현재 기사에 맞는 후보를 좁힌다. 검색은 검토 범위를 정하는 보조 단계다. 연결 확정·사실 판단·승인은 기존 `gpt-6-luna` 원문 대조와 native 승인 경로에 남긴다.

## 입력과 색인

- 개념 문서는 `conceptRegistry`의 검토된 전문 개념만 사용한다. 색인 프로필은 정식 이름, 같은 개념의 정확한 별칭, 개념 노트의 검색용 `keywords`, 한 문장 정의, 지도 검토 이유와 유형으로 만든다.
- 기사 검색 질의는 대상 기사 제목과 그 기사의 native 승인에서 공개 문장에 사용한 검증 주장으로 만든다. 다른 기사의 본문·주장·전문은 질의나 최종 Luna 요청에 넣지 않는다.
- `qwen3-embedding:8b`는 `/api/embed`의 벡터 검색에만 쓴다. `/api/chat`이나 생성 경로를 호출하지 않으며, 임베딩은 연결·동일성·사실을 확정하지 않는다.
- 색인·질의 벡터는 비공개 `.local/research/local-ai/semantic-candidate-retrieval/` 아래 저장한다. 색인은 개념 registry SHA, 전처리 버전, 전용 검색 정책 SHA, 모델 이름·실제 digest와 벡터 차원에 묶는다. 질의 벡터는 색인 SHA와 기사 질의 SHA에 묶으며 원문 텍스트는 캐시에 복제하지 않는다.
- 최초 색인 생성 비용과 질의 임베딩 비용은 별도로 발생한다. 같은 개념·정책·모델 digest의 색인과 같은 공개 기사 질의 벡터는 캐시를 재사용하고, 변경된 기사 질의만 추가 임베딩한다.

## 후보 순위와 안전 대체

1. 기사에 개념의 정식 이름·정확한 별칭이 실제로 나타나면 해당 개념을 모두 보존한다. 이름·별칭의 일치는 검토 후보를 빠뜨리지 않기 위한 신호이며 관계를 만들지 않는다.
2. Unicode/Hangul 토큰 및 글자 n-gram 역색인의 BM25 순위와 임베딩 코사인 유사도 순위를 reciprocal-rank fusion(`k=60`)으로 합친다.
3. 기본 후보는 상위 12개와 모든 정확한 이름·별칭 일치의 합집합이다. 따라서 정확 일치가 12개를 넘으면 그 항목은 모두 남는다.
4. 동일 registry·정책·모델 digest에서 본 기사 24개 이상(최소 네 개 분야군에서 각 두 기사 이상)과 별도 challenge 8개 이상을 대상으로 한 v3 파일럿이 엄격한 상위 12개 순위의 `recall@12 ≥ 0.95`와 실제 Luna 입력에 직렬화되는 개념 본문 크기의 중앙값 60% 이상 절감을 모두 통과해야 축약 목록을 쓴다. 배포 후보는 상위 12개에 정확한 이름·별칭 일치 전체를 더하지만, recall 점수는 상위 12개만 평가해 보수적으로 측정한다. 저신호 기사에서 실제 후보 입력이 전체 목록으로 돌아가는 점도 payload 절감에 반영한다. 후보 신호가 약하거나 임베딩·모델·평가 영수증이 없으면 전체 개념 registry로 되돌린다. 전체 fallback이 불가능하거나 지문이 맞지 않으면 검토를 `reviewed_none`으로 완료하지 않고 오류/대기로 남긴다.
5. 자동 파일럿의 본 기사 정답은 `reviewed-article-concepts/v2`의 native 전문 개념 검토 또는 완료된 full-registry Luna 영수증과 원문 대조를 결속한 `semantic-retrieval-review/v1`에서 읽는다. 공개 주장·기사 판본·승인 파일 묶음·검토 연결과 일치하는 고정 ID를 기록하고, 이후 평가를 읽을 때마다 같은 승인 원본을 다시 불러 SHA와 분야군을 대조한다. 기존 기사 `concept_ids`만 있거나 모델이 새로 제안한 연결은 gold 라벨로 취급하지 않는다. 본 기사 24개·분야군 및 추가 challenge 8개 조건을 채우지 못하면 파일럿 상태를 보고하고 전체 registry fallback을 유지한다.

이 파일럿의 60% 기준은 실제 Luna 요청에 직렬화되는 **개념 설명 bytes**의 절감률이지 전체 workflow의 경과 시간 측정값은 아니다. 임베딩 요청은 묶어서 보내고 색인을 재사용해 반복 검색 일을 줄이며, 기사별 Luna 입력은 축약하지만, 네트워크 대기·출력 길이 때문에 실제 end-to-end 지연이 같은 비율로 줄어든다고 가정하지 않는다.

## 특정 기사의 검토 범위 확대

원문 대조에서 shortlist 밖의 개념 누락을 확인했으면 새 workflow의 `semantic_prepare`에 `full_registry_event_ids`와 `full_registry_review_refs`를 함께 지정할 수 있다. 목록은 서로 다른 정확한 공개 event ID이며, refs는 실제 finding·요청 이유를 기록한 연구 root 내부 파일의 `{event_id, path, sha256}`다. 모든 확대 event에 근거가 필요하고 선언하지 않은 event의 refs는 거부한다. 파일 원본 bytes와 SHA를 다시 확인하고 확대 목록·refs를 inventory 지문에 고정한다. 목록을 지정하지 않거나 새 workflow에서 두 인수가 모두 `[]`이면 기존 직렬화와 동작을 유지한다.

확대한 기사만 `full_registry_fallback`과 `explicit_full_registry_review` 사유로 현재 검토된 전체 개념을 공급한다. 해당 selection과 Luna 입력에는 그 event의 근거 refs만 보존한다. 다른 기사를 확대 목록에 더해도 기존 확대 기사의 입력은 바뀌지 않는다. 이는 후보 범위를 넓히는 명시 요청이며 임베딩 장애를 꾸미거나 특정 관계를 미리 확정하지 않는다. 검색 정책·ranker·top12·registry·다른 기사 payload는 그대로다. 확대 refs는 provenance이며 자동 source-gold나 파일럿 정답이 아니다.

`event_ids`는 이번 페이지에 만들 요청을, `full_registry_event_ids`는 기사별 개념 검토 범위를 고른다. 두 목록은 독립적이며 전체 public inventory와 완료 기준을 줄이지 않는다. 고정 후 확대 목록·근거를 바꾸면 새 workflow가 필요하다. 중복·잘못된 ID·알 수 없는 event·refs 없는 확대·SHA 변경을 조용히 무시하지 않는다. 기존 workflow에 이 필드가 없으면 빈 확대 설정으로 읽되 새 빈 필드를 저장하지 않는다.

C7의 `completed_review_refs`로 원 영수증을 보존하면 전체 입력이 달라진 확대 기사만 새 검토 대상이 되고 다른 동일 입력은 원 task·request·result·시각·receipt_ref를 유지한다. 원 완료 source의 선택 검증은 그 원 workflow의 확대 설정과 근거를 사용한다. 옛 shortlist 결과를 덮어쓰지 않으며, 전체 검토 결과의 수용과 실제 native 제출은 별도로 수행한다. policy·registry·source가 바뀌면 기존 C7 재사용 검증을 그대로 적용한다.

## Luna 검토와 키워드 분리

Luna에는 대상 기사, 그 기사의 정확한 검증 주장·원문 블록, 선택된 개념 설명만 전달한다. `reviewed_none`은 파일럿을 통과한 상위 후보 전체를 검토했거나 전체 registry fallback을 사용했을 때만 유효하다. 링크·간접 후보는 공개 주장 ID와 정확히 연결하고 기존 결과 검증기가 선택된 concept ID 밖의 응답을 거부한다.

개념 노트 `keywords`는 해당 개념을 검색하기 위한 검토된 메타데이터다. `aliases`는 같은 개념의 다른 정식 이름·약칭만 담는다. 기사 응답의 `keyword_candidates`는 기사 공개 주장에서 나온 별도 비공개 검색 후보이며 각 항목은 근거 claim ID를 가진다. 둘 다 단어만으로 관계, 지도 노드, 개념 별칭 또는 공개 index 항목을 만들지 않는다. 기사 키워드 후보는 의미 검토 receipt에만 남고 공개 `article-semantic-review-index/v1`에는 내보내지 않는다.

## 원문 대조 파일럿과 관측

선택 기사 ID는 전체 inventory와 export 완료 기준을 줄이지 않는다. 파일럿을 우선 처리할 때 `semantic_prepare.event_ids`를 전달하고, 완료된 full-registry Luna 검토와 원문·검증 주장·별칭·개념 registry를 실제 대조한 `semantic-retrieval-review/v1`을 별도로 작성한다. 이 검토는 `pilot_review_refs`의 연구 root 상대 path와 파일 bytes SHA로 새 workflow에 고정한다. 기존 native 승인이나 모델 결과를 수정하지 않는다.

본 기사 최소 24개와 별도 challenge 8개는 서로 다른 사건이어야 한다. 본 기사는 최소 4개 분야군에서 각각 2개 이상을 포함한다. challenge에는 모호함(`ambiguous`), 동음이의어(`homonym`), 명시적 연결 없음(`reviewed_none`)이 모두 포함되어야 한다. 연결 없음은 recall 분모에 성공 링크를 추가하지 않는다. v3 평가가 입력·정답·벡터·실제 후보 payload를 재검증하며, challenge가 부족한 평가는 실패 근거로 보존하고 축약을 허용하지 않는다.

`semantic-review-metrics`의 비공개 불변 관측은 색인 생성, 질의 임베딩, 캐시 적중, 후보 입력 bytes, Luna 실행과 저장 대기를 기록한다. 관측 시간은 결과 지문에 포함하지 않는다. cold/warm 시간의 중앙값·p95, 개념 입력 절감률과 전체 실행 경과 시간을 각각 보고하고, 실제로 측정하지 않은 Luna 시간은 0 대신 `null`로 남긴다.

## 무효화와 복구

- 기사 공개문·승인 claim·개념 노트·검색 정책이 바뀌면 해당 workflow 입력 SHA가 달라져 이전 검토를 재사용하지 않는다.
- 개념 registry, 전처리 버전, 정책, Qwen 모델 digest가 바뀌면 새 색인을 만든다. 기존 index·벡터·영수증은 덮어쓰지 않는다.
- 임베딩 endpoint 미사용, 미설치 모델, query 실패는 해당 workflow의 전체 registry fallback으로 기록한다. 같은 workflow에서 다른 digest로 조용히 재시도하지 않는다. 복구 시 원인 확인 후 동일 입력은 명시 재개하고, 입력/정책/구현이 달라졌으면 새 workflow ID를 사용한다. recall 기준에 미달한 파일럿은 유효한 실패 영수증으로 보존하고 계속 전체 registry를 사용한다.
- article-level 키워드 후보는 의미 검토 증거가 아니며 기사 작성, graph, 발행 승인을 대신하지 않는다.

## 코드와 정책

- 검색 정책: [`data/research-semantic-retrieval-policy.json`](../data/research-semantic-retrieval-policy.json)
- 후보 인덱스·순위·파일럿 계산: [`scripts/research/concept-candidate-index.mjs`](../scripts/research/concept-candidate-index.mjs)
- 기존 Luna 요청/재개·영수증: [`scripts/research/article-semantic-review.mjs`](../scripts/research/article-semantic-review.mjs)
- 공개 관계 규칙: [`CONNECTION_MAP.md`](CONNECTION_MAP.md)
