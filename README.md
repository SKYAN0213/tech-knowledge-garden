# Tech Knowledge

GPT가 조사한 IT·AI·로보틱스 소식을 Obsidian에 축적하고 웹으로 공유합니다.

- [뉴스](https://skyan0213.github.io/tech-knowledge-garden/)
- [RSS 구독](https://skyan0213.github.io/tech-knowledge-garden/rss)
- [지식 지도](https://skyan0213.github.io/tech-knowledge-garden/knowledge-maps/ai-technology-knowledge-map)

기존 `옵시디언_iCloudSync` 프로젝트의 오전 8시 예약 작업을 이어 사용합니다. 새 프로젝트 등록은 필요 없습니다. 소스 저장소의 경로는 `/Users/shinjh/Projects/Personal/Apps/tech-knowledge-garden`, 현재 Obsidian 보관함은 이 저장소의 `vault/`입니다.

웹의 기본 메뉴는 뉴스·브리핑입니다. 기사에서 개념 설명과 지식 지도로 이어집니다. Vault 폴더, 보관 원고와 작업 안내를 웹 화면이나 검색에 노출하지 않습니다. 별도 공개 체크 없이 콘텐츠 유형에 따라 화면을 생성합니다.

| 원본 위치                         | 역할                           | 웹                     |
| --------------------------------- | ------------------------------ | ---------------------- |
| `vault/Editions/`                 | 출처·취재 구간을 가진 원고     | 브리핑과 기사로 변환   |
| `vault/Briefings/`                | 날짜별 헤드라인·흐름           | 브리핑                 |
| `vault/News/`                     | 발표별 상세 기사               | 뉴스                   |
| `vault/Knowledge/`                | 정의·키워드·근거·관계          | 맥락으로 연결되는 개념 |
| `vault/Knowledge Maps/`           | 같은 관계를 담은 Obsidian 지도 | 관계 기반 자동 배치    |
| `vault/Archive/`, `vault/Trends/` | 보관과 개인 참고               | 출력 제외              |
| `.local/`                         | 조사 기록·복구 사본            | Git·웹 제외            |

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

`npm run dev`는 마지막으로 빌드한 결과를 미리 봅니다. 수정 후 다시 빌드합니다. `npm run publish`는 콘텐츠만 커밋하며, 코드 변경은 별도로 검토·커밋합니다.

정의와 키워드는 원문으로 확인합니다. 관계의 `target`, `type`, `reason`, `basis`, `evidence`를 개념 노트에 저장하면 Obsidian 지도와 웹 그래프가 같은 데이터를 사용합니다. 단순 동시 언급을 의미 관계로 승격하지 않습니다. 그래프는 연결·반발력·라벨 충돌을 계산하고 관계가 없는 컴포넌트는 분리합니다. 검색, 선택, 연결 필터, 이동·확대·노드 드래그와 자동 배치를 지원합니다.

[운영 규칙](docs/BRIEFING_WORKFLOW.md) · [원문 재검토 기록](data/knowledge-review-2026-09-13.json) · [구현 상태](docs/IMPLEMENTATION_STATUS.md)

별도 AI API와 유료 자동화 서비스는 사용하지 않습니다. GPT 조사는 기존 ChatGPT/Codex 구독의 사용량 한도에 따릅니다. 로컬 예약에는 Mac과 Codex 앱이 켜져 있어야 합니다. 기기 간 편집 동기화는 별도입니다.

원본 보관함과 165개 파일의 복구 사본은 보존했습니다. 기존 날짜별 뉴스 이력은 당시 기록이며 이번 정의 재검토가 모든 과거 보도를 재검증한 것은 아닙니다. 공개 저장소에서 웹 출력 제외는 비공개 보관을 의미하지 않습니다.

Markdown 변환 기반은 [Quartz v5](https://github.com/jackyzha0/quartz), MIT License입니다. 원본 [LICENSE.txt](LICENSE.txt)를 보존합니다.
