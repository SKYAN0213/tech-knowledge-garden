# 기술의 다음 장 · Tech Knowledge Garden

GPT가 조사한 IT · AI · 로보틱스 소식을 Obsidian에 쌓고 공유하는 전용 프로젝트입니다.

- **웹:** https://skyan0213.github.io/tech-knowledge-garden/
- **아침 브리핑 RSS:** https://skyan0213.github.io/tech-knowledge-garden/briefing.xml
- **Obsidian:** 이 저장소의 `vault/` 폴더를 별도 보관함으로 엽니다.

## 읽기와 축적

`헤드라인 → 기사 상세 → 개념 사전 → 주간 흐름`을 링크로 연결합니다. 사이트에서 제목·본문 검색, 백링크와 지식 지도를 사용할 수 있습니다. 전체 vault가 공유 대상이므로 노트별 공개 플래그를 관리할 필요가 없습니다.

| 위치 | 역할 | 작성 주체 |
|---|---|---|
| `vault/Editions/` | 출처와 취재 구간을 갖춘 원본 매거진 | GPT + 사용자 |
| `vault/Briefings/` | 짧은 헤드라인과 상세 링크 | 로컬 프로그램 |
| `vault/News/` | 사건별 기사, 후속 브리핑 연결 | 로컬 프로그램 |
| `vault/Knowledge/` | 한 개념씩 축적하는 사전 | GPT + 사용자 |
| `vault/Knowledge Maps/` | 개념 관계 지도 | GPT + 사용자 |
| `vault/Trends/` | 주간 개념별 기사 관측 | 로컬 프로그램 |
| `.local/` | 취재 로그, 복구 사본, 검증 증거 | 공개·Git 저장 제외 |

## 사용

Node.js 24 이상과 Python 3를 사용합니다.

```sh
npm ci
npm run context        # 다음 취재 cutoff와 기존 원문 목록
npm run refresh        # 원고에서 기사·브리핑·주간 기록 재생성
npm run validate       # 원문 마커, 연결, 매거진·개념 형식 검사
npm run build          # 공유 사이트 생성
npm run dev            # http://localhost:8088
npm run publish        # 검증 → 콘텐츠 커밋 → GitHub Pages 발행 시작
```

조사와 집필의 상세 규칙은 [BRIEFING_WORKFLOW.md](docs/BRIEFING_WORKFLOW.md)에 있습니다. `create-tech-ai-briefing` 스킬은 이 프로젝트를 사용하도록 연결되어 있습니다. 기존 오전 8시 예약 작업을 이어 사용하며 별도 중복 예약은 만들지 않습니다.

## 비용과 실행 조건

정리 도구, Obsidian 로컬 사용, Quartz와 공개 GitHub Pages를 사용합니다. 별도 AI API 키와 유료 자동화 서비스는 필요하지 않습니다. GPT 조사는 기존 ChatGPT/Codex 계정의 사용량 한도에 따르며 구독 자체를 무료로 바꾸지는 않습니다. 로컬 예약 실행에는 Mac과 Codex 앱이 켜져 있어야 합니다. 휴대폰에서는 웹으로 읽을 수 있으며, Obsidian 기기 간 편집 동기화는 별도입니다.

## 이전과 검증

기존 문서 162개 중 독자용 159개를 이전했습니다. 운영 가이드 3개와 과거 자동화 설정은 원본 복구 사본으로 보존했습니다. 원본 보관함은 삭제하지 않았습니다. 파일별 해시·대응 경로는 `data/migration.json`, 복구 사본은 `.local/migration/`에 있습니다.

구형 원고 11개에는 원래 취재 cutoff가 없습니다. 날짜 탐색에는 파일명을 사용하고 최신 조사 cutoff는 검증된 원고 값만 사용합니다. 개인 보관함으로 향한 링크 1개는 텍스트 참조로 보존했습니다. 모든 과거 기사를 현재 사실로 재검증한 것은 아닙니다.

`npm test`는 Quartz와 이 프로젝트의 테스트를 실행합니다. `node scripts/verify-site.mjs`는 빌드 결과의 페이지·자산 링크, 제목, 검색 색인과 RSS 도착 주소를 검사합니다.

## 기반 프로젝트

[Quartz v5](https://github.com/jackyzha0/quartz), MIT License. 초기 기반 커밋: `f1fba3fc55cbf60a60a5d09c95a49c042cdab63a`. 원본 라이선스는 [LICENSE.txt](LICENSE.txt)에 보존합니다.
