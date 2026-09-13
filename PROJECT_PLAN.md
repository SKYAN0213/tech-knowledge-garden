# 2026-09-13 News connection map

Objective: show a reference-inspired, dark constellation of actual concepts, keywords and news on the website; selecting a node reveals related news. Confirmed association is sufficient: relationships need not be directed references.

Baseline: clean main at 7695994; published reader contains 42 news articles, 23 reviewed concepts and 111 keyword memberships. Preserve the source editions, original dated research/cutoff, concept definitions, RSS, and existing 08:00 Obsidian project. Continue the authorized existing-site publication. No paid API or service.

## Direction

Small colored points, fine undirected lines, clustered structure on a dark background. Labels appear by importance, hover or selection. The graph is the visual focus; selected news remains readable, keyboard reachable, and usable on mobile. No image slogans, fake graph nodes or decorative connections. Reading pages retain their existing white editorial design.

Sigma.js 3 + Graphology/ForceAtlas2 replace the SVG renderer. Graphology Louvain colors actual communities. Build-time deterministic coordinates give an immediately usable graph; a worker handles requested recalculation. The graph and news list must remain usable when WebGL is unavailable.

## Milestones

1. Complete — Association data and engine: preserved legacy evidence, added confirmed target/reason connections, generated 166 real nodes and 323 undirected links, ranked related news within two documented steps. Excluded boilerplate keyword matches and tested canonical alias deduplication and isolated nodes.
2. Complete — Web experience: Sigma WebGL point graph, home/article embeds and direct navigation, news on click, search, neighbor focus, zoom, drag, worker re-layout, responsive and keyboard alternatives. Actual WebGL-disabled Chromium falls back to usable node search and news links.
3. Complete — 188 tests, typecheck, build, all internal links/RSS, actual desktop and 390px browser interactions passed. Layout-only benchmark: 166 nodes in 58ms; synthetic 1,000 nodes in 1,262ms, all finite. Existing briefing skill and 08:00 automation updated. Code commit 06ab001 deployed successfully in run 34732605328. Public home/map render WebGL; a real node click opens 10 relevant stories, article navigation/back and worker re-layout pass without console errors. Public RSS contains 40 entries and excluded source paths return 404. Evidence: .local/evidence/connections-live.json and docs/IMPLEMENTATION_STATUS.md.

## Acceptance

- No arrows or required reference types in the connection visualization; source-backed legacy data remains intact.
- Every node and edge comes from existing editorial data or a documented association rule; no density padding.
- Any selected node shows its related-news list, with explicit empty state where the current archive has no associated story.
- News dates, URLs and selection basis are accurate; hidden vault folders remain excluded.
- The website home visibly embeds the graph and exposes the full map directly.
- Interactive render is backed by Sigma/WebGL with an accessible news/list fallback; layout work cannot freeze the reading UI.
- Existing RSS, briefing and wiki link contracts continue to pass.
