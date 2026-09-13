# 매일의 변화를 지식으로 쌓기

뉴스는 사건 단위로 읽고, 브리핑은 오늘의 판단과 누적 주제를 읽는다. `원문 사건 → 날짜별 관측 → 주제 이력 → 검토한 판단 원칙 → 전문 개념`을 연결한다. GPT가 판단을 작성하고 로컬 프로그램은 근거·날짜·중복·링크를 검사한다. 키워드 빈도로 주제나 지식 지도 노드를 만들지 않는다.

## 매일 작성

1. 취재 전에 `npm run context`의 기존 주제, 최근 관측, 다음 확인, 반대 조건을 읽는다. 최신 `vault/TrendTopics/`와 `vault/Signals/` 기록을 확인한다.
2. 기존 규칙대로 일차 자료를 조사하고 `vault/Editions/`에 원고를 저장한다. 다시 `npm run context`를 실행해 `latest_issue.edition`, `date`, `articles[].event_id`를 얻는다. 이 명령은 최신 트렌드 기록이 아직 없어도 작동한다. 파일 이름이나 임의 해시로 사건 ID를 만들지 않는다.
3. 해당 원고별 `vault/Signals/<원고파일명>.md`를 작성한다. 기존 파일이 있으면 그 파일을 갱신한다. 같은 주제·사건을 한 원고에서 두 번 기록하지 않는다. 오늘의 변화가 무엇인지, 기존 판단을 어떻게 보강·제약하는지 쉬운 한국어로 적는다. 원고의 실제 사건에만 연결한다.
4. 기존 주제의 `thesis`, `watch_for`, `disconfirming`, `reviewed`를 실제 검토에 맞게 갱신한다. 새로운 주제는 계속 확인할 구체적인 질문이 있을 때 추가한다. 단순 일반어·기업명·제품명 나열을 피하고 기사 수를 채우기 위해 분류하지 않는다.
5. 적어도 두 날짜의 서로 다른 사건에서 재사용할 원칙이 보이면 `lessons`에 편집 분석으로 기록한다. 반대 근거·실패 조건·적용 범위를 함께 읽는다. 건수 기준 통과는 지식의 참을 자동 승인하지 않는다. 원문에 없던 인과·성과·예측을 만들지 않는다. 재사용 정의는 기존 atomic `Knowledge/`에 연결한다.
6. `npm run refresh`, `npm run validate`, `npm run build`, `node scripts/verify-site.mjs`를 통과한 뒤 `npm run publish`로 발행한다. 최신 원고의 review가 빠지면 발행은 중단된다. Pages와 RSS, GitHub 요약의 실제 접근을 확인한다.

`observations: []`는 **검토했지만 새로 기록할 변화 없음**이다. 파일이 없으면 **미정리**다. 접근 실패를 검토 완료나 변화 없음으로 바꾸지 않는다. 새 소식이 없는 날에도 취재 기록과 명시적 빈 review를 남길 수 있다. 기존 원문을 재정리할 때는 `saved-coverage`와 실제 검토일을 적는다. 초기 2026-09-13 기록은 기존 수록 기사 17건을 재정리한 것으로 과거 날짜에 실시간 평가를 수행한 기록이 아니다.

## 주제 원본

`vault/TrendTopics/<id>.md`의 예시. 대괄호 안 문구는 채워야 할 예시이며 그대로 저장하지 않는다.

```yaml
---
schema_version: tech-trend/v1
type: trend-topic-source
id: execution-permissions
title: 실행·배포 권한을 경로별로 세분화
question: 자동화의 권한을 어느 단계에서 제한하는가?
thesis: "[현재 판단과 그 근거의 범위]"
watch_for: "[다음에 관측할 구체적인 지표·발표·재현]"
disconfirming: "[현재 판단을 바꿀 반대 조건]"
reviewed: YYYY-MM-DD
knowledge_notes:
  - Knowledge/Security/OpenID Connect
lessons: []
---
```

원칙을 기록할 때 `lessons`의 각 항목은 `id`, `claim`, `limit`, `reviewed`, `signal_ids`를 가진다. 모든 signal은 같은 주제에 속해야 하고 원칙 검토일 이전에 검토돼야 한다. 다른 날짜의 서로 다른 원문 사건이 최소 2개 필요하다. 원칙 수정·폐기 이유는 본문에 남기고 Git 이력으로 보존한다. 과거 원고와 관측 기록을 현재 판단에 맞춰 덮어쓰지 않는다.

## 원고별 관측

```yaml
---
schema_version: tech-signals/v1
type: trend-observations
edition: Editions/YYYY/MM/YYYY-MM-DD_HHMM_Tech_AI_Briefing
date: YYYY-MM-DD
reviewed: YYYY-MM-DD
review_basis: primary-research
observations:
  - id: stable-observation-id
    topic_id: execution-permissions
    event_id: "[context가 출력한 event_id]"
    stance: support
    change: "[원문에서 확인한 변화]"
    meaning: "[이 변화가 기존 주제에 주는 의미: 편집 분석]"
    limit: "[독립 검증 여부·제공 범위·실패 조건]"
    next_check: "[다음에 확인할 관측 가능한 항목]"
---
```

`stance`는 `support`(관측), `challenge`(반대·제약), `context`(참고)다. `review_basis`는 실제 원문 취재의 `primary-research` 또는 기존 수록 자료 재정리의 `saved-coverage`다. 원문 URL은 연결된 사건에서 가져오며 별도 입력값으로 근거를 바꿀 수 없다.

## 누적 계산과 과거 기록

- 같은 원문 URL은 기존 사건 ID를 유지한다. 반복 언급은 관측 이력에 남겨도 누적 원문 수와 주간 수를 늘리지 않는다. 주제에서 처음 관측한 수록일에 한 번 센다.
- 최근 7일은 기준일 포함 7개 달력 날짜, 이전 7일은 그 직전 7개 날짜다. 정리된 이 수집 자료의 규모이며 산업 성장률·시장 관심도·성과 점수가 아니다. 미정리 브리핑 수를 함께 표시한다.
- 과거 회차의 오늘 변화는 해당 회차 관측만 사용한다. 같은 날 뒤 회차도 섞지 않는다. 이후 작성된 판단 원칙은 이전 날짜에 소급 노출하지 않는다. 과거 회차에서 누적 주제를 클릭하면 현재 기록으로 이동한다.
- 전문 용어 지도 선정은 별도다. 넓은 트렌드 주제는 지도 노드가 되지 않는다.

## 공유 산출물

| 경로                                                      | 역할                                               |
| --------------------------------------------------------- | -------------------------------------------------- |
| `/`와 `/news/index`                                       | 날짜별 뉴스·검색·원문. 지도 없음                   |
| `/briefings/index`                                        | 최신 변화, 누적 주제, 월별 회차                    |
| `/briefings/YYYY/MM/…`                                    | 오늘 변화, 근거 펼치기, 헤드라인·분석, GitHub 링크 |
| `/briefings/topics/<id>`                                  | 현재 판단, 반대 조건, 원칙과 근거 이력             |
| `/briefing.xml`                                           | 기존 GUID를 유지하는 최근 40회 브리핑 RSS          |
| `digest/README.md`, `digest/YYYY/MM/…`, `digest/topics/…` | Obsidian 없이 읽는 GitHub Markdown 요약            |

`Briefings/`, `News/`, `Trends/`, `digest/`는 생성 결과다. 작성 원본을 수정한다. `npm run publish`는 검증한 vault, catalog와 digest를 함께 커밋한다. 뉴스 홈·목록·상세와 브리핑에는 지도 위젯을 넣지 않는다. 지도는 전용 경로와 관련 전문 개념에서 읽는다. `Signals`, `TrendTopics`, Editions, Archive, 운영 폴더는 웹·검색에서 제외하지만 공개 Git 저장소에 있는 파일은 공개 자료다.

RSS 2.0의 description에는 entity-encoded HTML로 제목·요약·변화·한계·다음 확인·원문·GitHub 링크를 담는다. item link/GUID는 브리핑 주소이며 channel link는 브리핑 모음이다. 기사 원문은 HTML 링크로 제공하고 RSS feed를 뜻하는 source 요소로 오용하지 않는다. [RSS 2.0 규격](https://www.rssboard.org/rss-specification)

## 분야별 5건과 8시 일괄 검증 (2026-09-13)

`docs/SECTOR_BRIEFING.md`를 매회 읽고 따른다. 8개 분야를 각각 취재하고 분야별 최대 5건으로 요약한다. 새로운 회차에는 `briefing_format: sector-five/v1` 및 기사별 `**분야:**`를 작성한다. 기존 8시 예약에서 Drive 저장·사이트 배포·공개 결과 검증을 함께 수행한다. 이 사용자 요청이 이전의 5분 간격 상시 연결 지침보다 우선한다.
