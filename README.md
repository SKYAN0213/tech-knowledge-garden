# Tech Knowledge

GPT가 조사한 IT·AI·로보틱스 소식을 Google Drive에 축적하고, 검증된 자료를 GitHub와 웹사이트로 보여줍니다. 이 저장소의 `vault/`는 Drive 작성 원본의 작업·배포 사본입니다.

- [뉴스](https://skyan0213.github.io/tech-knowledge-garden/)
- [브리핑](https://skyan0213.github.io/tech-knowledge-garden/briefings/index)
- [GitHub 브리핑 모음](digest/README.md)
- [RSS 구독](https://skyan0213.github.io/tech-knowledge-garden/rss)
- [연결 지도](https://skyan0213.github.io/tech-knowledge-garden/knowledge-maps/ai-technology-knowledge-map)
- [Drive → GitHub 연결 및 운영](docs/DRIVE_GITHUB_SYNC.md)

Drive의 `Editions`, `Knowledge`, `Signals`, `TrendTopics`를 작성 원본으로 사용합니다. GitHub의 동기화 작업은 Google 읽기 연결을 설정한 뒤 5분 간격으로 변경을 확인하고 검증·생성·배포합니다. 로컬 단발성 Drive 읽기와 상시 연결 상태는 구분합니다. 원문 수집물·취재 기록은 개인 Drive에 보관하며 이 동기화의 공개 입력에서 제외합니다.

기존 `옵시디언_iCloudSync` 프로젝트의 오전 8시 예약 작업을 이어 사용합니다. 새 프로젝트 등록은 필요 없습니다. 소스 저장소의 경로는 `/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden`, 현재 Obsidian 보관함은 이 저장소의 `vault/`입니다.

웹의 기본 메뉴는 뉴스·브리핑·연결 지도입니다. 뉴스와 브리핑은 읽기에 집중하고, 지도는 전용 경로와 관련 전문 개념에서 볼 수 있습니다. 용어를 누르면 관련 뉴스가 나타납니다. 브리핑에는 오늘의 변화, 누적 주제, 근거·반대 조건·판단 원칙을 모읍니다. RSS에서 웹 브리핑·원문·GitHub 요약으로 연결됩니다. Vault 폴더, 보관 원고와 작업 안내를 웹 화면이나 검색에 노출하지 않습니다. 별도 공개 체크 없이 콘텐츠 유형에 따라 화면을 생성합니다.

| 원본 위치                              | 역할                           | 웹                          |
| -------------------------------------- | ------------------------------ | --------------------------- |
| `vault/Editions/`                      | 출처·취재 구간을 가진 원고     | 브리핑과 기사로 변환        |
| `vault/Briefings/`                     | 날짜별 헤드라인·흐름           | 브리핑                      |
| `vault/News/`                          | 발표별 상세 기사               | 뉴스                        |
| `vault/Knowledge/`                     | 정의·키워드·근거·관계          | 맥락으로 연결되는 개념      |
| `vault/Knowledge Maps/`                | 같은 관계를 담은 Obsidian 지도 | 관계 기반 자동 배치         |
| `vault/TrendTopics/`, `vault/Signals/` | 주제 판단·날짜별 근거 관측     | 브리핑의 누적 기록으로 변환 |
| `digest/`                              | 표준 Markdown 브리핑·누적 기록 | GitHub에서 직접 읽기        |
| `vault/Archive/`, `vault/Trends/`      | 보관과 개인 참고               | 출력 제외                   |
| `.local/`                              | 조사 기록·복구 사본            | Git·웹 제외                 |

Node.js 24 이상과 Python 3를 사용합니다.

```sh
npm ci
npm run context
npm run refresh
npm run validate
npm run build
node scripts/verify-site.mjs
npm run dev        # http://127.0.0.1:8088/tech-knowledge-garden/
npm run publish
```

`npm run dev`는 마지막으로 빌드한 결과를 미리 봅니다. 수정 후 다시 빌드합니다. `npm run publish`는 검증된 Drive 입력과 로컬 원본이 같은지 확인한 뒤 콘텐츠를 커밋합니다. 원고를 Drive에 먼저 저장하고 읽기 검증을 마쳐야 하며, 코드 변경은 별도로 검토·커밋합니다.

정의와 키워드는 원문으로 확인합니다. 연결은 `connections`의 `target`과 `reason`으로 기록합니다. 확인한 연관성이면 충분하며 방향·참조 유형·인용은 필수가 아닙니다. 기존 관계의 원문 근거는 보존합니다. 지도에는 별도 설명을 배워야 하는 전문 용어만 `map_review` 검토를 거쳐 표시합니다. 정의·설명 노트·일차 자료·구체적인 학습 이유가 필요합니다. 일반어·기사 제목·단순 키워드는 노드로 만들지 않습니다. 뉴스는 용어의 정확한 이름·별칭 또는 명시적 기사 지정으로 연결하고, 선택하면 관련 기사 목록을 보여 줍니다. Sigma.js의 WebGL과 ForceAtlas2가 연결을 고려해 자동 배치하며, 검색·연결 필터·이동·확대·드래그·재배치를 지원합니다. WebGL이 없으면 검색과 노드 목록으로 관련 뉴스를 읽을 수 있습니다.

[트렌드 누적·배포 규칙](docs/TREND_WORKFLOW.md) · [운영 규칙](docs/BRIEFING_WORKFLOW.md) · [연결 규칙과 엔진 비교](docs/CONNECTION_MAP.md) · [용어 선정 기록](data/graph-node-review-2026-09-13.json) · [원문 재검토 기록](data/knowledge-review-2026-09-13.json) · [구현 상태](docs/IMPLEMENTATION_STATUS.md)

별도 AI API와 유료 자동화 서비스는 사용하지 않습니다. GPT 조사는 기존 ChatGPT/Codex 구독의 사용량 한도에 따릅니다. 로컬 예약에는 Mac과 Codex 앱이 켜져 있어야 합니다. 기기 간 편집 동기화는 별도입니다.

원본 보관함과 165개 파일의 복구 사본은 보존했습니다. 기존 날짜별 뉴스 이력은 당시 기록이며 이번 정의 재검토가 모든 과거 보도를 재검증한 것은 아닙니다. 공개 저장소에서 웹 출력 제외는 비공개 보관을 의미하지 않습니다.

Markdown 변환 기반은 [Quartz v5](https://github.com/jackyzha0/quartz), MIT License입니다. 원본 [LICENSE.txt](LICENSE.txt)를 보존합니다.
