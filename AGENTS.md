# Tech Knowledge Garden

## 개발·기사 처리 모델 분리 (2026-10-16 사용자 지정)

개발·코드 수정과 통합은 Sol로 수행한다. 원문 조사·사실 추출·사건 비교·큐레이션·기사/용어 작성에 쓰는 GPT는 계정 구독의 `gpt-6-luna`다. 기본 정책의 다섯 역할을 모두 같은 모델 ID로 고정한다. Sol 운영자가 `reasoning.pending/read`의 요청 모델을 확인하고 실제 Luna 실행에 위임한 다음, 실제 실행 모델을 명시해 결과를 제출한다. 요청한 Luna를 Sol의 결과로 대체하거나 모델명을 임의로 붙이지 않는다. 모델 실행 불가 시 같은 요청을 대기로 보존한다. 로컬 모델은 사용자가 선택하는 별도 실행 경로로 유지하며 자동 전환하지 않는다. 이번 10월13~15일 누락분은 현재 검토한 과거 발표의 소급 보완이며 당시 실행한 정규 운영으로 집계하지 않는다.

## 개발 완료 전 정규 운영 금지 (2026-10-16 사용자 지정)

정규 예약은 먼저 `node scripts/research/operation-policy.mjs status`를 읽는다. `data/research-operation-policy.json`의 phase가 development이거나 개발 완료 근거 검증을 통과하지 못하면 `development_pending`으로 정상 대기한다. 이 상태에서는 정규 원문 수집·새 context 고정·모델 호출·기사 작성·Drive 쓰기·배포·전체 테스트를 시작하지 않는다. 이전 WBS 완료 비율·Git 변경 개수·저장 전환 완료를 개발 완료로 대신 판정하지 않는다. 개발자가 명시적으로 수행하는 비공개 기능 구현·표적 검증은 정규 운영과 구분한다. 새 예약·개발 전 운영용 checkout을 만들지 않는다.

개발 완료 후 기본 수행자는 계정 구독의 GPT(Codex)이며 기존 Drive 연결을 사용한다. MCP/독립 모듈의 기본 정책도 `data/research-model-policy-codex.json`이다. GPT 완료는 수집/파싱·큐레이션/작성·GPT 재개·Drive 복원 재개·발행 복구·표적 회귀의6개 실제 근거와 코드/설정 manifest를 v2 완료 기록으로 고정한다. 구현 파일이나 실행 설정이 달라지면 이전 완료 기록으로 운영하지 않는다. `operation-policy.mjs finalize`에 원문 대조한 검토 기록의 정확한 path/SHA를 전달하며 완료 라벨만 임의로 작성하지 않는다. 로컬은 같은 MCP 모듈/체크포인트를 쓰는 선택 기능이다. 로컬 정규 실행은 `status --executor ollama`와 별도의 선택 기능 완료 근거를 요구하며 GPT ready로 허용되지 않는다. 로컬 명시 개발 실행은 기존 로컬 정책을 직접 선택한다. 자동 로컬 planner의 검토·발행·Drive 인증 경계는 유지한다. 실제 원문 대조를 수행한 GPT의 명시 검토 제출과 근거 없이 승인 표시를 작성하는 행위를 구분한다.

실패 복구는 기존 작업 ID/입력·정책·구현 SHA와 저장 결과를 확인한 뒤 필요한 단계만 명시 재개한다. `waiting_for_storage`, `waiting_for_reasoning`, 검토 대기, 실패, worker 확인 불가를 구분한다. 프로세스 조회 권한 오류는 worker 종료의 증거가 아니며 대체 worker 실행이나 잠금 회수를 허용하지 않는다. 기존 실패는 attempts의 불변 기록에 보존한다. uncertain write는 동일 Drive/발행 ID의 실제 readback을 먼저 수행한다. 자세한 절차는 `docs/RESEARCH_MODULES.md`의 개발 완료 관문과 실패 복구 절을 따른다.

## 조사 입력의 페이지별 조회 (2026-10-07)

조사 입력은 `npm run research:context --silent`로 한 번 고정한다. snapshot.input·sha256을 후속 `--input`·`--sha256`에 함께 전달하고 page.next_offset으로 필요한 구간의 전 페이지를 읽는다. pending_by_route는 작업 분류이며 자동 제외 기준이 아니다. sources·companies·institutions·robot-manufacturers·entities·events·terms·evidence·deep·known-sources는 `--section`으로 조회한다. 승인·정정 전에는 `--candidate 정확한-key`로 전체 발견·승인·정정 이력을 읽고 기존 원문/승인 검증기를 통과한다. history_summary와 목록은 사실 근거나 승인 결과를 대신하지 않는다. 원본 npm run context와 비공개 장부는 유지한다. docs/DAILY_NEWS_INGESTION_IMPLEMENTATION.md 7.4절을 따른다.

## 브리핑 내용 보강 (2026-09-14)

매회 `docs/BRIEFING_QUALITY.md`를 읽는다. context의 discovery_window로 최근 7일을 겹쳐 탐색하고 비공개 candidate-backlog를 실제 발행 기사와 대조한다. cutoff 이전이라는 이유만으로 미수록 중요 사건을 버리지 않는다. 2026-10-12 사용자 요청에 따라 `curation`에서 오늘 후보와 과거 미수록 사건을 함께 평가하고, 높은 정보 가치의 미수록 사건은 오늘 브리핑에 처음 소개할 수 있다. 정확한 선정 참조·native 승인을 사용하고 원 발표일·검토일·처음 소개한 회차 날짜를 분리한다. 이미 발행한 사건의 과거 정정·보완은 기존 회차/ID/GUID를 유지한다. 육하원칙 2~4문장은 리드이며, 원문에 근거한 구체적 설명을 explanations에 작성해 웹·RSS·GitHub에서 바로 읽게 한다. 운영 안내·분석 부족 해명·억지 전망을 쓰지 않는다. 기존 예약·조사 범위를 유지한다.

## 출처 다양화 (2026-09-14)

매회 `docs/SOURCE_DIVERSITY.md`와 context의 `discovery_sources`, `source_diversity`를 읽는다. 기존 기업·기관 명단에 산업 전문지·지역 매체·공시·고객·공급사·협회·기술이전 경로를 추가한다. 발견 경로를 과거의 소수 매체 목록에 제한하지 않는다. 한국어·영어 외에 제조사의 현지어 자료도 조사한다. 원문 검증과 기존 8개 분야·로봇 추가 조사는 유지한다. 출처 편중 수치는 추가 탐색 신호이며 기사를 자동 제외하거나 조사 완료로 판정하는 기준이 아니다.

## 수집 경로 확장: 공통 우선, 차이만 별도 검증 (2026-09-30)

새 출처는 기존 안전 요청·원본 보관·RSS/날짜 목록/월별 아카이브 수집기·상세 파서·날짜/제목 대조·후보 장부·일일 실행을 우선 재사용한다. 출처마다 새 crawler를 만들지 않는다. 실제 원문에서 확인한 URL/GUID, 공개·비공개 분류, 시간대, 페이지 종료, 본문 위치, 정정·첨부 같은 차이만 route/profile 옵션으로 분리한다. 공통 설정으로 표현할 수 없는 형식에만 재사용 가능한 작은 adapter를 추가하고, 정상·빈 기간·충돌/실패와 기존 경로 회귀를 시험한 뒤 활성화한다. 목록 수집 성공을 기사 검토나 발행 성공으로 승격하지 않는다. 세부 수용 계약은 `docs/DAILY_NEWS_INGESTION_IMPLEMENTATION.md` 3.2절을 따른다.

일일 handoff의 비공개 `intake_ontology`에서 동일 URL·추출 본문·제목/발표일 관계 후보를 먼저 검토한다. 이 관계는 같은 사건의 확정 판정이 아니다. 승인한 기사는 `candidate-approval`로 정확한 원문 판본·사건 ID에 연결하고, 다른 URL의 같은 사건은 원문 대조 근거로 한 사건 ID에 묶는다. 충돌 후보를 별도 기사로 밀어내지 않는다. 브리핑의 짧은 리드는 상세 기사를 대체하지 않으며 필요한 `explanations`를 승인 원고와 공개 채널에 보존한다.

## 육하원칙·기업 전략·논문·교수 창업 (2026-09-14 적용)

매회 프로젝트 `docs/EDITORIAL_RESEARCH.md`를 읽는다. 이 규칙이 과거 뉴스 카드의 고정 질문형 소제목보다 우선한다. 새 원고는 `editorial_format: six-w/v1`, `article_records`, `headlines`를 사용한다. 일반 기사는 육하원칙을 담은 2~4문장, 심층은 기업 전략/논문 해설/연구 사업화를 순환해 하루 최대 1건이다. 국내외 조사 기회는 균등하게 배분하고 32개 기업 추적 자리와 국내외 각 8개 기관의 공식 경로를 확인한다. 분량과 기사 비율을 강제하지 않는다. 심층 생략 사유를 기록하고 전문 미열람 논문은 심층으로 쓰지 않는다. 교수 창업은 대학·회사 원문으로 역할을 확인한다. 기존 Signals·TrendTopics에 전략·연구·사업화 이력을 축적한다. 첫 실제 발행 7회의 운영 감사는 `scripts/research-audit.mjs`로 집계한다. 기존 Drive 보관과 8시 예약을 유지한다.

From the 2026-09-14 issue, read `docs/NEWS_THEMES.md` on every run. Independently check technology/products and corporate operations in every sector, including financials, capital, people and supply. Use `theme_format: news-themes/v1` alongside `sector-five/v1`; every article needs a primary theme, an optional secondary theme, controlled event tags and named entities. Preserve these in news, briefings, RSS and digest. Follow the 16-row research coverage template and existing 08:00 schedule. Classification metadata must never create graph nodes or term matches. Do not infer tags for historical articles.

Work from this repository within the existing 옵시디언_iCloudSync daily-briefing project (c9d65b6f-2fcd-49ba-a120-3fce98a14cf3). Do not require another Codex project registration. The dedicated Obsidian vault is the content authority; no per-note publication selection.

The website presents news and briefings, a dedicated connection map in navigation, and contextual concept pages. Do not expose the vault tree, archive, source editions, operational notes or bookkeeping copy. Build a type-based projection. News home/list/detail and briefing pages must not embed a map. The briefing hub owns daily changes, cumulative topic histories and reviewed lessons; RSS links to full briefings, original sources and digest Markdown in GitHub. Reader text is factual and concise, without slogans or descriptions of the UI.

Read docs/BRIEFING_WORKFLOW.md, docs/TREND_WORKFLOW.md and docs/magazine-and-encyclopedia-contract.md before authoring. GPT performs live research using the signed-in account; no paid API is configured. Save v2 editions under vault/Editions and concepts under vault/Knowledge. Definitions and keywords require primary-source review. A confirmed association is sufficient for a connection; direction, relation type and citation are not mandatory. Record connections with target concept ID and a concrete reason, optionally evidence URLs. Preserve existing sourced relations and distinguish editorial inference from explicit source claims. Preserve stable note paths and Obsidian links. See docs/CONNECTION_MAP.md for the exact graph rules and Sigma.js/ForceAtlas2 engine. Map nodes must be reviewed specialist learning terms with a standalone definition, source-backed explanation and map_review decision/kind/reason/reviewed. General words, broad topic buckets, keywords and article titles never become nodes. Missing review means excluded; preserve existing notes. GPT judges learning value for a general IT/AI/robotics news reader, not term frequency. Only exact names/aliases or explicit article assignments attach news; confirmed neighboring terms add one step of related news. Never put broad associated words in aliases.

Run npm run refresh, npm run validate, npm run build and node scripts/verify-site.mjs. Generated Briefings, News, Trends and indexes come from scripts/garden.mjs; edit sources instead. Author topic judgments in vault/TrendTopics and one explicit review ledger per issue in vault/Signals. Broad trend topics never become graph nodes. Preserve missing-review versus reviewed-empty status, source-event identity, opposing evidence, review provenance and historical time boundaries. digest/ is generated GitHub Markdown and is staged by publish. Validate web fragments and graph destinations too.

Preserve source material and citations. Last saved coverage end is the next exclusive cutoff. Inaccessible searches are not evidence of no news. Review primary sources across IT, AI and robotics; record coverage gaps without padding.

Keep .local, credentials and backups out of Git. The repository is public; presentation exclusions do not make committed files private. npm run publish only stages validated content and never force-pushes.

Scope GitHub CLI operations with `--repo SKYAN0213/tech-knowledge-garden`; this checkout also has a Quartz upstream remote. The daily publication and verification target is the user's garden repository.

## Google Drive 최종 보관 (2026-09-13 사용자 지정)

2026-10-14부터 비공개 payload는 공통 Drive cold storage를 사용한다. `.local/.storage/catalog.sqlite`와 정책에 명시된 캐시, native ID/승인 및 원본 네 폴더를 유지한다. 2026-10-22 운영 복구에서 반복 복원에 필요한 약20.3GB의 검증 원문보다 작았던2GiB 상한을 기존 저장 모듈로32GiB로 조정했다. 외장 볼륨 여유 공간을 확인하고 이 운영값을 유지한다. 자료가 로컬에 없으면 collection.storage pending의 정확한 Drive ID를 기존 연결 또는 사전 인증된 로컬 OAuth adapter의 remote-pull로 받아 hydrate하고 같은 작업을 명시 재개한다. STORAGE_PENDING을 새 소식 없음/빈 자료로 처리하거나 원문을 다시 GET하지 않는다. 새 조사 자료는 prepare→pending→Drive 저장/실제 bytes verify→catalog export/보관 순으로 연결하고 검증된 사본만 evict한다. 일일 작성 원본은 기존 approved-preview 경로를 사용한다. 전체 연구·미리보기 사본의 반복 ZIP 생성을 기본으로 하지 않는다. 로컬 모델은 원격 검증 metadata를 자체 작성하거나 캐시 정리를 임의 실행하지 않는다. 로컬 OAuth는 scripts/research-drive.mjs의 Desktop client/Google 동의로 별도 설정하며 토큰·인증 코드·session URI를 모델·MCP 결과·Git에 전달하지 않는다. 기존 Drive 연결도 유지한다. docs/DRIVE_STORAGE.md의 독립 로컬 Drive OAuth 절을 따른다.

최종 자료 저장 위치는 Google Drive `Projects / Tech Knowledge`(폴더 ID `1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD`)다. 로컬 vault는 작업·검증·웹 생성용 사본으로 유지한다. 과거의 로컬 전용 저장 설명보다 이 규칙이 우선한다. 매회 `docs/DRIVE_STORAGE.md`를 읽고 원문 수집 상태·취재 기록·관련 노트를 함께 Drive에 업로드하고 원격 메타데이터를 검증한다. 로컬 저장만으로 작업 완료를 보고하지 않는다.

Drive 원본에서 GitHub 사이트를 갱신하는 규칙은 `docs/DRIVE_GITHUB_SYNC.md`를 따른다. 작성 원본 네 폴더를 Drive에 먼저 저장·검증한 뒤 사이트를 배포한다. `npm run publish`는 검증된 Drive 스냅샷과 다른 로컬 원본의 발행을 거부한다. 상시 연결이 설정되기 전의 단발성 읽기·배포를 자동 연동 완료로 보고하지 않는다.

## 분야별 5건과 8시 일괄 검증 (2026-09-13)

`docs/SECTOR_BRIEFING.md`를 매회 읽고 따른다. 8개 분야를 각각 취재하고 분야별 최대 5건으로 요약한다. 새로운 회차에는 `briefing_format: sector-five/v1` 및 기사별 `**분야:**`를 작성한다. 기존 8시 예약에서 Drive 저장·사이트 배포·공개 결과 검증을 함께 수행한다. 이 사용자 요청이 이전의 5분 간격 상시 연결 지침보다 우선한다.

## 테스트 실행 빈도

관련 코드 변경을 기능 묶음으로 마친 뒤 변경 경로에 직접 대응하는 가장 좁은 표적 검사를 한 번 실행한다. 작은 수정마다 연속 실행하거나, 같은 코드 상태에서 통과한 검사를 반복하지 않는다. 실패를 수정했을 때는 실패한 표적 검사만 재실행한다. 문서·데이터·설정만 바뀌고 동작 계약이 바뀌지 않았다면 테스트를 생략하고 필요한 JSON parse·문법·diff 검사나 산출물 readback만 한다. 여러 변경은 가능한 한 하나의 표적 검사로 묶는다. 전체 테스트 suite는 릴리스 후보 통합 후 한 차례 실행하며, 일상 개발 묶음이나 출처 추가마다 돌리지 않는다. 공통 identity·승인·중복 제거·공개 경계 변경은 릴리스 전에도 영향 범위의 표적 검사로 확인한다. 프로젝트별 세부 적용 기록은 `docs/LOCAL_AI_NEWS_IMPLEMENTATION_PLAN.md` 19.160절과 `docs/LOCAL_AI_NEWS_RUNBOOK.md` 247절을 따른다.

독자 화면의 시스템 안내문 제외, 분야 탭, #태그 블록 원칙은 `docs/EDITORIAL_RESEARCH.md`의 「독자 화면과 편집 기록 분리」를 따른다. 운영 기록은 공개 본문과 분리한다.

분석은 근거와 정보 가치가 있을 때만 게재한다. 근거 부족 시 추론·분석 섹션·빈 탭을 모두 생략하고 독자에게 해명 문구를 쓰지 않는다. `docs/EDITORIAL_RESEARCH.md`의 「근거 있는 분석만 게재」를 따른다.
