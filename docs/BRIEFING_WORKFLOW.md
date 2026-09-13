# 아침 브리핑 운영

## 저장과 역할

이 저장소의 `vault/`가 유일한 현재 Tech Knowledge다. 노트별 선별 없이 유형별 웹 화면을 만든다. 뉴스·브리핑·연결 지도를 기본 메뉴로 두고, 홈에도 지도를 표시한다. 개념은 기사와 지도에서 연결한다. 보관용 원고·Archive·Trends·폴더 페이지는 웹 출력과 검색에서 제외한다. GPT는 조사·검증·집필을 맡고, 무료 로컬 스크립트는 기사 중복 연결, 헤드라인, 주간 관측과 RSS를 만든다. 별도 OpenAI API나 자동화 구독은 사용하지 않는다. Codex의 기존 ChatGPT 사용량 한도는 적용된다.

1. `npm run context`로 마지막 취재 cutoff와 기존 원문 URL을 읽는다. 최신 원고와 관련 개념 노트도 읽는다.
2. 웹 검색을 **live**로 사용해 cutoff 이후 발표·실질적 업데이트를 조사한다. IT/소프트웨어, AI, 로보틱스/반도체를 각각 점검한다. 일차 자료의 원문과 게시·갱신 시각을 확인한다. 접근 실패를 새 소식 없음으로 해석하지 않는다.
3. `docs/magazine-and-encyclopedia-contract.md`의 v2 원고·개념 형식을 따른다. 해당 문서에 남은 `Tech Knowledge/Briefings` 경로는 이 프로젝트에서는 `vault/Editions`로, `Tech Knowledge/Knowledge`는 `vault/Knowledge`로 대응한다.
4. 정확한 조사 시각을 사용해 원고를 `vault/Editions/YYYY/MM/YYYY-MM-DD_0800_Tech_AI_Briefing.md`에 작성한다. 날짜에 해당하는 원고가 이미 있으면 읽고 갱신하며 중복 파일을 만들지 않는다. 새 항목이 없으면 substantive section은 `없음`으로 둔다.
5. 일일 사건은 원고에, 재사용 정의는 기존 `vault/Knowledge/`의 canonical concept에 기록한다. 개념의 `최근 변화`에서 해당 기사·원문을 연결한다. 원고의 연결은 `[[Knowledge/AI Systems/AI Agents|AI Agents]]`처럼 vault 기준 경로를 사용한다. 새 개념을 만들었으면 사전 색인을 갱신한다. 모든 개념에는 concept_id(고정 ID), label(한글), group(의미 범주), keywords, verified_sources, last_reviewed를 작성한다. 정의·키워드는 실제 읽은 일차 자료로 확인한다. 새 연결은 `connections` 목록에 `target`(기존 concept_id), `reason`(확인한 연관성)을 기록하고 원문 URL이 있으면 `evidence`를 추가한다. 방향·참조 유형·인용은 연결의 필수 조건이 아니다. 기존 `relations`의 유형·근거·source/inference 구분은 보존한다. 관련 개념 본문에는 `- [[Knowledge/…|개념]] — 확인한 이유`로 동일한 연결을 적는다. 빈 분류나 추측을 채워 넣지 않는다. 지도 노드는 일반 독자가 별도 설명을 배워야 하는 전문 용어만 선정한다. `map_review`에 include/exclude 결정, kind, 구체적인 학습 이유와 검토일을 기록한다. 정의·설명 문서·일차 자료가 없는 노드는 포함하지 않으며 미검토 노트는 제외된다. 일반어·넓은 사업/응용 분류·기사 제목·단순 키워드는 노드가 아니다. 별칭에는 같은 용어의 이름·약어만 기록한다. Obsidian과 웹은 같은 선정 용어와 확인된 관계를 사용한다. 뉴스는 별도 목록으로 연결한다. 규칙은 [연결 지도](CONNECTION_MAP.md)를 따른다.
6. 취재 범위와 누락을 `.local/research/YYYY-MM-DD.md`에 기록한다. 원문 URL별 확인 시각, 게시 시각의 증거, 제외 이유, IT·AI·로봇별 확인 채널, 접근 실패를 남긴다. 비어 있는 브리핑도 이 확인 기록이 있어야 한다.
7. `npm run refresh && npm run validate && npm run build`를 실행한다. 생성된 `Briefings/`, `News/`, `Trends/`, `index.md`는 직접 편집하지 않는다. 자동 검사는 형식과 링크의 증거이며 취재 완전성을 대신하지 않는다.
8. 공유를 업데이트할 때 `npm run publish`를 실행한다. 배포 실행의 성공과 실제 사이트의 새 회차를 확인한 뒤에만 웹 발행 성공을 보고한다. 로컬 저장, Git push, 배포 성공은 각각 구분한다.

## 중복과 사건 경계

기사의 첫 원문 URL을 정규화해 사건 ID를 만든다. 추적 파라미터와 fragment는 제거한다. 같은 발표의 후속 원고는 기존 기사에 연결하고, 최신 원고가 상세 내용에 반영된다. 원고 전체는 날짜별로 남는다. 여러 독립 사건을 하나의 상시 갱신 홈페이지 URL로 묶지 말고 사건별 공식 발표 permalink를 사용한다. 기존 URL의 실질적 업데이트를 재취재할 때에는 무엇이 언제 바뀌었는지 명시한다.

## 오전 8시

기존 `tech-ai-briefing-08`은 등록된 `옵시디언_iCloudSync` 프로젝트(c9d65b6f-2fcd-49ba-a120-3fce98a14cf3)에서 계속 실행한다. 저장소 명령은 이 저장소의 절대 경로에서 실행한다. 새 프로젝트 등록은 필요 없다. 중복 예약은 만들지 않는다. 로컬 예약 실행에는 Mac과 Codex 앱이 켜져 있어야 한다. 실행이 빠진 기간은 마지막 저장 cutoff부터 다음 실행까지 이어서 취재한다.

## Obsidian

Obsidian의 **다른 보관함 열기 → 폴더를 보관함으로 열기**에서 이 저장소의 `vault` 폴더를 선택한다. 기존 iCloud 보관함과 별개다. 웹 공유는 GitHub Pages가 맡으므로 열람자에게 Obsidian 설치나 동기화 구독이 필요하지 않다. 기기 간 편집 동기화는 별도이며 이번 구성에는 유료 Sync가 포함되지 않는다.

## 웹 검증

`npm run build`는 임시 폴더에 독자용 콘텐츠만 투영하고 Quartz로 Obsidian 문법을 변환한 뒤 독자 화면을 생성한다. `node scripts/verify-site.mjs`는 모든 출력 링크·문단 ID·검색 범위·그래프 목적지·RSS를 검사한다. 지도는 Sigma.js의 WebGL과 ForceAtlas2 배치를 사용한다. 용어를 선택하면 명시적 기사 지정, 정확한 이름·별칭의 기사 등장, 확인된 이웃 용어의 기사 순서로 보여 준다. 일반 키워드는 기사 연결에 사용하지 않으며 이웃의 이웃까지 확장하지 않는다. 섹션명·안내·출처 목록은 제외하고 간접 연결의 경유 용어를 표시한다. 원본 뉴스 이력은 날짜별 기록이며 개념 정의의 재검토와 구분한다. `scripts/rebuild-knowledge-20260913.mjs`는 완료한 일회성 이전이므로 예약 실행에서 재실행하지 않는다.
