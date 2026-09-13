# Tech Knowledge Garden

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

최종 자료 저장 위치는 Google Drive `Projects / Tech Knowledge`(폴더 ID `1VKWSC2IYOtOd__3NKEzD-BK34qVqtlAD`)다. 로컬 vault는 작업·검증·웹 생성용 사본으로 유지한다. 과거의 로컬 전용 저장 설명보다 이 규칙이 우선한다. 매회 `docs/DRIVE_STORAGE.md`를 읽고 원문 수집 상태·취재 기록·관련 노트를 함께 Drive에 업로드하고 원격 메타데이터를 검증한다. 로컬 저장만으로 작업 완료를 보고하지 않는다.

Drive 원본에서 GitHub 사이트를 갱신하는 규칙은 `docs/DRIVE_GITHUB_SYNC.md`를 따른다. 작성 원본 네 폴더를 Drive에 먼저 저장·검증한 뒤 사이트를 배포한다. `npm run publish`는 검증된 Drive 스냅샷과 다른 로컬 원본의 발행을 거부한다. 상시 연결이 설정되기 전의 단발성 읽기·배포를 자동 연동 완료로 보고하지 않는다.

## 분야별 5건과 8시 일괄 검증 (2026-09-13)

`docs/SECTOR_BRIEFING.md`를 매회 읽고 따른다. 8개 분야를 각각 취재하고 분야별 최대 5건으로 요약한다. 새로운 회차에는 `briefing_format: sector-five/v1` 및 기사별 `**분야:**`를 작성한다. 기존 8시 예약에서 Drive 저장·사이트 배포·공개 결과 검증을 함께 수행한다. 이 사용자 요청이 이전의 5분 간격 상시 연결 지침보다 우선한다.
