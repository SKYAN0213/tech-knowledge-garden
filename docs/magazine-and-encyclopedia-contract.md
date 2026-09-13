# Magazine and encyclopedia contract

## Garden sector and theme extension (effective 2026-09-14)

For Tech Knowledge Garden, read the current repository docs/SECTOR_BRIEFING.md and docs/NEWS_THEMES.md. New issues require briefing_format: sector-five/v1 and theme_format: news-themes/v1. Every cover/news/research/tool card begins with **분야:**, **테마:**, **보조 테마:**, **세부 태그:** and **기업·기관:**. Use exactly one primary sector and theme, up to one distinct secondary theme, and 1–3 event tags belonging to those themes. The secondary theme and entity list may be explicitly 없음. Investigate technology/products and corporate operations independently in each sector, including financials, funding/deals, workforce and supply. Keep the total five-event sector cap. Use the repository research coverage template to record checked sources, times, exclusions and failures in all 16 sector/channel combinations. Preserve historical editions without guessed classifications. Classification tags and entity metadata never create specialist map nodes or news-to-term associations.

This reference is mandatory for every run of `create-tech-ai-briefing`.

## 1. Publication model

The system publishes two different artifacts with different jobs:

| Artifact                   | Job                                                         | Authority                 |
| -------------------------- | ----------------------------------------------------------- | ------------------------- |
| Daily magazine issue       | Explain what changed inside one research window             | Time-bounded reporting    |
| Encyclopedia concept entry | Explain one reusable concept independently of a daily event | Evergreen knowledge       |
| Concept index              | Route readers among several atomic entries                  | Navigation only           |
| Knowledge map              | Show how canonical concepts relate and flow                 | Curated relationship view |

Do not copy a whole news story into an encyclopedia definition. Do not bury reusable definitions inside a daily issue.

## 2. Daily magazine: `tech-ai-magazine/v2`

### Required metadata

Use YAML frontmatter with these fields:

```yaml
title: "YYYY-MM-DD 데일리 Tech & AI 매거진"
type: briefing
schema_version: tech-ai-magazine/v2
date: YYYY-MM-DD
timezone: Asia/Seoul
coverage_start: "RFC3339 timestamp"
coverage_end: "RFC3339 timestamp"
source_count: 0
new_items_count: 0
linked_knowledge_notes: []
knowledge_notes_created: []
knowledge_notes_updated: []
```

`source_count` counts unique full URLs in `Source List`. `new_items_count` counts accepted news, paper, and tool items; it does not count analysis or action bullets.

### Required order

Use these level-1 headings exactly and in this order:

1. `# 이번 호 표지`
2. `# 차례`
3. `# 커버 스토리`
4. `# 뉴스 데스크`
5. `# 리서치 노트`
6. `# 도구 상자`
7. `# 흐름 읽기`
8. `# 오늘의 적용`
9. `# 개념 색인`
10. `# Source List`

The first two headings are editorial framing. The next seven are substantive content sections. `Source List` is evidence inventory.

### Cover and contents

The cover is a compact callout, not a prose introduction:

```markdown
> [!abstract] YYYY년 M월 D일 · 데일리 Tech & AI
> **한 줄 편집:** today's most important change in easy Korean.
> **취재 범위:** coverage_start → coverage_end (KST)
> **이번 호:** 새 항목 N건 · 원문 N개 · 새 개념 N개 · 갱신 개념 N개
```

When no item qualifies, use `**한 줄 편집:** 검증된 새 소식 없음.` Do not manufacture a theme.

The contents table lists each substantive section and one of `커버`, `N건`, or `없음`. It is navigation, not another summary.

### Cover story card

Use at most one cover story. A cover story must have enough evidence and consequence to justify the space.

```markdown
## Easy, specific headline

> [!summary] 30초 요약
> One or two easy sentences.

### 무엇이 바뀌었나

Verified facts with source markers such as `[S1]`.

### 왜 중요한가

Concrete technical or practical meaning.

### 독자에게 미치는 영향

Who is affected and how. Write `직접 영향 확인 불가` if evidence does not support a claim.

### 아직 모르는 것

Uncertainty, vendor-only measurements, rollout limits, beta status, or missing independent validation.

### 다음에 볼 것

Specific observable follow-up.

### 개념 더 읽기

Atomic Obsidian links such as `[[Agent Evaluation]]`.

**근거:** [S1], [S2]
```

### News desk card

Use for verified items that do not need cover-story depth:

```markdown
## Headline

**핵심:** what changed.

**의미:** why it matters.

**확인할 점:** limitation or next observable signal.

**개념:** atomic links or `없음`.

**근거:** [S3]
```

### Research card

Include title, easy explanation, method/data, result, why it matters, limitations, concept links, and original source. Distinguish a paper's claim from independent reproduction. A paper release outside the cutoff may be background but not a new item.

### Tool card

Include project, easy explanation, maturity/status, intended use, limitations, concept links, and official repository/documentation. For star trend use comparable timestamped counts or `추세 확인 불가`.

### Trend and application sections

`흐름 읽기` must contain separate callouts for `확인된 사실` and `분석`. Analysis may connect at least two accepted items or one accepted item with established background, but may not invent a forecast.

`오늘의 적용` contains only actions supported by the issue. State the intended user, action, and guardrail. If there is no safe practical action, write exactly `없음`.

### Concept index

Use a table with `개념`, `이 기사에서 필요한 이유`, and `문서 상태`. Link only atomic canonical concept entries. Do not link a combined compatibility index as deeper reading.

### Empty sections

If a substantive section has no qualifying content, its body is exactly:

```markdown
없음
```

Do not add explanations, caveats, bullets, or stale background under an empty section. If all items are empty, `source_count` and `new_items_count` are zero, `Source List` is `없음`, and no URL appears anywhere in the issue.

### Sources

List each unique original URL once:

```markdown
- [S1] https://example.com/original
- [S2] https://example.org/paper
```

Every `[S#]` used in the issue must be defined. Every defined source must support at least one accepted item. Full URLs are mandatory.

## 3. Encyclopedia entry: `tech-encyclopedia/v2`

### Atomicity rule

One canonical file explains one reusable concept.

Split a page when two subjects can answer different versions of any of these questions:

- What is it?
- How does it work?
- How is it evaluated?
- What can fail?
- What should it be compared with?

A conjunction in a title (`and`, `&`, `와`, `과`, slash) is a strong split signal unless it is part of an indivisible official term. A broad umbrella concept is allowed, but its independently reusable mechanisms must be linked child entries rather than second definitions inside the page.

Examples:

| Mixed page                         | Canonical split                                |
| ---------------------------------- | ---------------------------------------------- |
| Agent Evaluation and Observability | `Agent Evaluation`, `Agent Observability`      |
| AI Agent Security and Governance   | `AI Agent Security`, `AI Agent Governance`     |
| AI Content Access and Monetization | `AI Content Access`, `AI Content Monetization` |

Keep an old combined filename as `entry_type: index` when existing Obsidian links depend on it. The index must say it is navigation-only and point to the canonical atomic entries.

### Required concept metadata

```yaml
title: "Canonical concept name"
type: knowledge
entry_type: concept
schema_version: tech-encyclopedia/v2
status: evergreen
domain: "AI Systems"
created: YYYY-MM-DD
updated: YYYY-MM-DD
aliases: []
parent_concepts: []
related_concepts: []
tags: []
```

### Required concept sections

Use these level-2 headings exactly and in this order:

1. `## 한 문장 정의`
2. `## 용어 카드`
3. `## 범위`
4. `## 왜 중요한가`
5. `## 핵심 구성 요소`
6. `## 작동 원리`
7. `## 실제 예시`
8. `## 한계와 실패 조건`
9. `## 혼동하기 쉬운 개념`
10. `## 관련 개념`
11. `## 최근 변화`
12. `## 출처`

The definition must stand on its own and must not depend on a company announcement. `범위` states what is included and excluded. `혼동하기 쉬운 개념` uses explicit distinctions, preferably a table. `관련 개념` records confirmed associations as `- [[Knowledge/…|Concept]] — a concrete reason`. Direction, reference type and citation are not mandatory for connections. Reviewed concepts preserve `concept_id`, Korean `label`, `group`, source-reviewed `keywords`, `verified_sources` and `last_reviewed`; new `connections` contain the target concept ID and reason, plus optional evidence URLs. Preserve historical typed `relations` with their source/inference distinction and evidence. See [CONNECTION_MAP.md](CONNECTION_MAP.md). Empty parent/child/contrast placeholders are not required. Historical entries without `concept_id` retain their original taxonomy format.

`최근 변화` is a short evidence ledger, not a news dump. Keep only signals that changed how the concept is understood or implemented. Format each as `YYYY-MM-DD — fact and why it changes the concept. [source]`. Daily product details remain in the issue.

### Learning map selection

An encyclopedia entry is not automatically a map node. For the Tech Knowledge Garden, GPT reviews whether a general IT/AI/robotics news reader needs a separate explanation of a specialist mechanism, protocol, architecture, model, evaluation method, technical metric or security principle. A node needs a standalone definition, a complete reading page, reviewed primary sources and a specific learning reason. Frequency, English spelling, acronyms, broad business/application categories and general words do not establish learning value.

Record `map_review: {decision: include|exclude, kind: ..., reason: ..., reviewed: YYYY-MM-DD}`. An included term's kind is one of `mechanism`, `protocol`, `architecture`, `model`, `evaluation`, `metric`, `security`; excluded terms need a reason and review date. Missing review means no map inclusion. This is editorial curation, not user approval or a per-note publication flag. Preserve excluded notes and their historical links. `keywords` never generate nodes or article links. `aliases` contain only exact names and abbreviations of the same term, not broadly related words. News remains separate data shown when a term is selected. The repository's `docs/CONNECTION_MAP.md` defines matching, confirmed connections and one-neighbor article expansion.

### Concept index metadata and sections

An index uses `type: knowledge-index`, `entry_type: index`, and the same schema version. It contains these headings:

1. `## 이 문서의 역할`
2. `## 포함하는 개념`
3. `## 개념 경계`
4. `## 읽는 순서`
5. `## 관련 인덱스`
6. `## 출처`

An index may group concepts but may not be used as the canonical definition of any one of them.

## 4. Linking and migration

- Use `[[Canonical Title]]` for canonical entries. Use aliases only for reader convenience, not as competing canonical names.
- Update `Tech Knowledge/Knowledge/00 Tech Encyclopedia Index.md` when an entry is created, renamed, split, or deprecated.
- Update the flow map when a node or relationship changes. Keep an index and a map separate: the index answers “what exists,” the map answers “how it connects.”
- Preserve old paths during a split with a compatibility index. Do not silently delete historical content; archive it inside `Tech Knowledge/Archive/` when a clean canonical page replaces it.
- A briefing may link only to canonical atomic concept entries in its `개념 색인` and `개념 더 읽기` sections.

## 5. Validation gates

Before completion, the validator must confirm:

- required frontmatter and heading order;
- exact empty-section behavior;
- source-marker and URL consistency;
- unique source count;
- resolving Obsidian links;
- one-concept titles for canonical entries;
- required encyclopedia sections and index sections;
- no unresolved links in the changed canonical entries.

Passing structural validation is necessary but not sufficient. Also inspect the rendered Markdown for hierarchy, skimmability, factual/analysis separation, and whether each concept really has a distinct boundary.


## Garden cumulative briefing extension

In Tech Knowledge Garden, follow the repository docs/TREND_WORKFLOW.md after saving the v2 issue. Write an explicit issue review in vault/Signals and maintain source-event-backed topic judgments in vault/TrendTopics. Record change, meaning, limitation, next check, opposing evidence and actual review provenance. Reusable lessons need reviewed evidence from different events and dates. Broad trend buckets never become map nodes. News pages contain no embedded map. Briefings, cumulative topic pages, GitHub digest Markdown and rich daily RSS are generated together from these source records; preserve existing issue URLs and feed GUIDs.
