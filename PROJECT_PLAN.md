# 2026-09-13 Learning term selection

Objective: make the connection map useful for learning technical news. Nodes must be specialist terms worth explaining, not every keyword or article title.

Baseline: clean main at 05b03bc; 166 nodes = 23 concepts + 101 automatic keyword nodes + 42 article nodes. Generic words such as 책임, 상태, 가격, 근거, 허용 gained nodes and became noisy news bridges. Keep the Sigma/ForceAtlas2 engine and confirmed undirected relationships.

## Selection contract

- Audience: readers of IT/AI/robotics news who need explanations of specialist mechanisms, protocols, architectures, evaluation methods and technical metrics.
- A node needs a reviewed inclusion decision, a concrete learning reason, a standalone definition, an existing explanation note and primary sources. Frequency, English spelling and abbreviation alone do not qualify a term.
- General words, broad application/business buckets, product/release titles and unreviewed keywords do not become nodes. Existing notes remain readable; this is graph selection, not per-note publication approval.
- Articles are attached to terms and shown on selection. Exact canonical names/aliases and editorial assignments attach news; generic keywords cannot create nodes or article bridges.
- Keep confirmed relationships between admitted terms. No shared-article edges, no rewiring through excluded notes, and no expansion beyond one confirmed neighboring term.

## Work

1. Complete — Audit all concepts; add map_review metadata and source-backed atomic terms needed by existing articles (KV cache, OIDC, zero-shot inference, latency percentiles). Preserve original definitions, Editions, Archive, dates and research cutoff.
2. Complete — Replace keyword/article node generation with reviewed term-only projection. Retain direct article matches and explained one-step related concepts. Update contextual embeds, search and labels for a small readable map.
3. In progress — Test common-word exclusion, metadata validation, alias matching, ranking and isolated terms. Validate notes, links, RSS, tests/typecheck/build, desktop/mobile browser, briefing skill/08:00 automation, and actual deployment. No paid service or new project.

## Local verification

192 tests and TypeScript pass. Skill validation and 4 skill tests pass. Build: 188 HTML, 186 search entries, 16 terms, 17 confirmed edges, 42 articles, 30 with direct term links, RSS 40. Preserved 173 original source files and all 23 original concept bodies/metadata. Real desktop/mobile UI and WebGL fallback verified. Only normal publication and live verification remain. Evidence: `.local/learning-term-review/`.
