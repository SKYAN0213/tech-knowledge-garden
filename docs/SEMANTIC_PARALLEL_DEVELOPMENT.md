# 의미 연결 병렬 개발: 중앙 관리와 통합

## 승인된 실행 계약

2026-10-23 사용자가 중앙 세션과 담당별 세션, 개발용 worktree 분리, 검색 전용 Qwen 임베딩 사용을 승인했다. 정규 실행은 기존 개발 완료 관문 뒤에만 수행한다. 기존 매일 04시 예약은 그대로 유지한다.

실행 ID는 `parallel-semantic-20261023-v1`이다. 기준 스냅샷·세션 ID·검토 결과·재개 위치는 `.local/research/parallel-semantic-20261023-v1/`에 보존한다. 이 파일은 공통 계약이며 작업별 결과는 비공개 실행 기록에서 조회한다.

## 세션과 파일 소유권

| 세션                              | 독점 수정 범위                                                                | 책임                                                            |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| TKG D0 · 개발 중앙 관리·통합      | 공통 모듈 등록/Schema, reasoning 경계, 운영 정책, 문서, canonical 통합        | 배분, 통합, 검증 근거, v2 완료 기록, 운영 인계                  |
| TKG D1 · 개념 색인·후보 검색      | `concept-candidate-index.mjs`, `ollama.mjs`, 검색 정책과 해당 테스트          | 검색·캐시·fallback의 정확도와 성능                              |
| TKG D2 · 의미 검토·파일럿 정답    | `article-semantic-review.mjs`, `article-concept-review.mjs`, 의미 검토 테스트 | 파일럿 실제 검토 참조, 선택 기사 우선 처리, 결과/재개 무결성    |
| TKG D3 · 성능 계측·연결 지도      | 새 `semantic-review-metrics.mjs`, web 의미 색인/graph 모델과 전용 테스트      | 관측 집계와 공개 관계 보존; D2 파일은 수정하지 않음             |
| TKG Q0 · 독립 검증·완료 관문 감사 | 검토 보고서와 새 독립 회귀 테스트                                             | 계약/원문 경계와 실제 완료 근거 감사; 운영 정책은 수정하지 않음 |

명시한 파일은 별도 언급이 없으면 `scripts/research/`, 테스트는 `tests/`, 검색 정책은 `data/research-semantic-retrieval-policy.json` 아래다. 그 밖의 파일 변경은 D0에게 제안하고 승인을 받아 소유권을 먼저 갱신한다. 각 세션은 배정된 개발 worktree만 수정한다. 사용자 승인에 따라 D0의 작업 지시/재작업 요청과 담당 세션의 D0 결과 보고를 세션 간 메시지로 전달할 수 있다.

## 팬아웃과 팬인

1. HEAD와 현재 미커밋 변경을 해시 고정 스냅샷으로 보존한다. 각 개발 worktree에 동일한 스냅샷을 적용하고 독립 임시 저장 경로를 사용한다.
2. D0가 세션 ID, 소유 파일, 기준 SHA, 의존 작업과 완료 기준을 roster에 고정한다. D1–D3는 동시에 구현하고 Q0는 독립 검토한다.
3. 담당자는 기준 스냅샷 대비 변경 파일, 결과 해시, 검증 명령/결과, 미완료 항목을 제출한다. 임의 commit/push·운영 쓰기·전체 suite 반복은 수행하지 않는다.
4. D0가 canonical 파일의 기준 해시를 확인해 변경을 통합한다. 예상과 달라진 파일은 덮어쓰지 않고 충돌을 해결한다. 통합 순서는 검색 → 의미 검토 → 성능/지도다.
5. 통합판을 고정한 뒤 Q0가 최종 검토한다. 관련 검증을 우선하고 전체 suite는 통합판에서 한 번 실행한다. 이후 변경은 영향받은 검사만 다시 수행한다.

작업 상태는 `assigned`, `in_progress`, `review_requested`, `changes_requested`, `integrated`, `verified`로 관리한다. 완료 메시지·테스트 수·WBS만으로 운영 성공을 표시하지 않는다.

## 고정 인터페이스와 수용 조건

- 기존 `knowledge.semantic_*`와 `reasoning.*` 흐름을 유지한다. `semantic_prepare`에 선택적인 `event_ids`와 `pilot_review_refs`를 추가한다. `event_ids`는 전체 inventory를 축소하지 않고 해당 페이지의 요청 생성 대상만 제한한다. 전체 완료 전 export는 계속 거부한다.
- 실제 준비에서 확인한 동일 공개 기사의 다중 native 승인은 `approval_selection_refs`로 명시 선택할 수 있다. D0가 원본·공개 주장·근거 파일을 실제 대조한 뒤 선택 기록을 작성하며, 구현은 선택과 후보 전체의 SHA를 검증한다. 최신 run 자동 선택, 다른 원문의 대체 승인, 전체 미완료 export는 허용하지 않는다.
- `pilot_review_refs`는 `{path, sha256}` 목록이다. 검토 원본은 기사/public SHA, native 승인 파일 SHA, 공개 claim ID, 원문 참조, 개념 registry SHA, 실제 검토자와 검토 근거를 포함한다. 기존 승인 원본·과거 검토를 수정하지 않는다. 원시 모델 응답만으로 gold를 만들지 않는다.
- `completed_review_refs`는 일반 private 완료 영수증을 새 workflow로 넘긴다. 원 행·선택·전체 요청·결과·영수증을 검증하고 현재 전체 입력이 같을 때만 원 task·검토 시각·영수증을 보존해 재사용한다. 다른 기사의 원문 복구만으로 완료한 기사를 재호출하지 않는다. 완료 항목의 `receipt_ref`를 쓰며, 변경 입력·위조·저장 대기와 전체 미완료 export 경계를 유지한다. full-registry 파일럿 정답의 요건은 별도다.
- 관계 유형은 기존 `topic`, `application`, `comparison_evaluation`, `context_background`를 유지한다. 키워드·새 개념·간접 관계는 후보이며 공개 관계를 자동 생성하지 않는다.
- 검색 질의는 해당 기사 제목과 검증 공개 주장만 사용한다. 모든 다른 기사의 본문을 반복 입력하지 않는다. 정확한 이름/별칭 일치를 보존한다.
- 검색 전용 `qwen3-embedding:8b`의 기존 설치/loopback endpoint/digest를 확인한다. `/api/embed`만 사용하고 다운로드·새 인증·생성 모델로 자동 전환하지 않는다.
- 최소 24개 기사, 최소 4개 분야군에서 각 2개 이상을 실제 검토한다. 추가 8개 모호함/동음이의어/연결 없음 사례를 확인한다. strict recall@12 ≥ 0.95와 개념 설명 직렬화 bytes 중앙값 60% 이상 절감을 모두 통과해야 축약 검색을 쓴다. 미달·저신호·임베딩 불가는 전체 registry fallback이다.
- 개념 색인/질의 캐시는 registry·정책·모델 digest·기사 질의 SHA에 결속한다. 임베딩은 기존 64개 묶음, 의미 검토는 기본 20건씩 처리한다. 독립 Luna 요청은 최대 2개이며 제출/영수증/export는 단일 writer다.
- 성능 관측은 색인 생성/질의 임베딩/캐시 적중/Luna 시간/저장 대기/입력 bytes를 포함한다. 결과 지문과 관측 시간은 분리해 동일 결과를 다시 해석하지 않는다. cold/warm 실제 시간의 중앙값·p95와 입력 절감률을 별도 보고한다.

## 개발 종료와 운영 인계

개발 완료 필수 6개 근거를 현재 변경 범위와 대조한다. 유효한 근거는 재사용하고 무효화된 구간만 검증한다. 실제 검토한 path/SHA로 v2 완료 영수증을 생성해 `regular_execution_allowed=true`를 확인한다. 이전 완료 파일을 덮어쓰거나 임의 passed를 작성하지 않는다.

관문 통과 뒤 canonical 저장소에서 Drive/GitHub/로컬을 새로 대조하고 최신 전체 기사 inventory를 고정한다. 파일럿 → 전체 의미 검토 → 전체 완료 확인 → semantic export → Drive 원본 raw readback → 기존 publisher/공개 기사·지도·RSS·digest readback → WebsiteData 보관/readback으로 진행한다. 정규 예약 세션에는 release/입력·정책·구현 SHA와 정확한 재개 위치를 전달한다. 개발·의미 검토·발행·공개 확인·첫7회 관찰은 별도로 집계한다.
