# 2026-09-13 Reader and knowledge revision

Objective: make the daily briefing site information-first, repair RSS and Obsidian web links, and rebuild the 23-concept knowledge layer with sourced relationships and automatic graph layout.

The existing 08:00 automation stays in the registered 옵시디언_iCloudSync project. Original iCloud notes, migrated source editions, citations and verified research cutoff are protected. No paid API or new service. Preserve the Sep 13 briefing written by the existing automation (baseline 77f5010).

## Milestones and acceptance

1. Reader and RSS: only News and Briefings in primary navigation; remove folder tree, slogans and editorial bookkeeping. Exclude archives, source editions and operational notes from output/search. Concepts and map remain contextual destinations. RSS must parse, preserve Korean, advertise discovery, contain valid links and have an explicit copyable subscription URL.
2. Knowledge: re-read primary sources and rebuild definitions/keywords/typed relationships for all 23 canonical concepts. Keep Obsidian paths/aliases stable, retain dated news evidence, and publish sourced graph data. Distinguish editorial relationships from explicit source assertions.
3. Graph and links: automatic force layout based on actual typed edges, label collision handling, pan/zoom, drag, search, neighbor focus, accessible concept and source links. Resolve aliases, Unicode, headings and block references consistently; reject unknown or ambiguous targets.
4. Verification: focused regressions, full tests/typecheck, publication build, all emitted local links/fragments and graph edges, desktop/mobile reading and map interactions, actual RSS click/copy, then existing GitHub Pages deployment and live checks.

## Current status

Milestones 1–3 complete. Local verification passed: 181 tests, TypeScript, 184 HTML pages and their links/fragments, 182 search entries, 23 concepts, 31 sourced relations and 40 RSS items. Desktop/mobile browser checks cover reading, aliases, definition anchors, copyable RSS, search, graph selection, neighbor filtering, pan/zoom, node drag and deterministic reset. Milestone 4 is complete: GitHub Pages run 34726929373 succeeded for release 7136cb3. Live checks confirmed the reader, RSS, latest issue, concepts and graph; excluded archive/edition routes return 404. The public browser verified RSS copying and map-to-concept navigation. Evidence is saved in .local/evidence/revision-live.json.

The app API cannot reassign the current conversation to a saved project; the daily job already belongs to the requested project. No new project registration is pending. Source repository remains at its stable local path, referenced explicitly by the existing project workflow.
