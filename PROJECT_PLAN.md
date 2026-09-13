# News reading and cumulative briefings · 2026-09-13

Baseline: main at 885f103, clean. 113 issues, 42 source events, 27 concepts, 16 reviewed map terms. News home and details embed maps; RSS contains only a one-line introduction. The existing repository, vault, daily 08:00 job and GitHub Pages remain the publishing path.

## Intended result

News home/list/detail contain no connection map. Use a quiet editorial layout: a clear date, readable headline and summary, named source, generous line spacing and a narrow reading measure. Keep the dedicated map and specialist-term selection intact. The briefing hub is distinct from the news stream, with an issue lead, specific changes, accumulated topics and a compact issue archive. No decorative slogans or vault navigation.

The content chain is source event → dated observation → topic history → reviewed reusable lesson → specialist explanation. GPT writes the observations and lessons; local code validates provenance, deduplicates and publishes them. Topic buckets never become graph nodes. Counts describe this collection, not industry growth. Missing reviews are unknown, not zero. Historical briefings use observations available in that issue; initial retrospective records visibly state when they were reviewed.

RSS retains existing issue GUIDs and URLs, but includes readable headlines and observations, with links to the web briefing, original sources and standard Markdown summaries in this repository's digest directory. GitHub summaries and web views derive from the same source records.

## Milestones and completion checks

1. Complete — Implement topic/observation validation and time-bounded aggregation. Seed a small, explicitly retrospective set from saved primary-source coverage. Preserve Editions, Archive and concept definitions.
2. Complete — Generate cumulative topic pages, briefing summaries, GitHub Markdown and full briefing RSS. Keep source links and stable issue identity. Make reruns idempotent.
3. Complete — Remove news embeds; implement readable news, briefing hub and topic history views. Verify desktop/mobile reading, navigation, filters, RSS and graph separation.
4. Complete — Update daily authoring instructions and the existing 08:00 prompt. Run focused tests, full tests, TypeScript, build/link/feed checks, then publish and verify live Pages and GitHub summaries. No paid API or new job.

## Risks to check

- Repeated source URLs must not inflate trend counts; old issue views must not reveal later observations or lessons.
- No unsupported trend or lesson should be inferred by term frequency. Preserve limitations and opposing evidence.
- Old pre-v2 issues remain readable and subscribed; unreviewed history is not silently upgraded.
- Projection must continue to exclude source editions, raw observation/topic source files and operational folders; public Git remains public.
- Automated publication must include the generated GitHub summaries and reject a missing latest trend review once topics are configured.

Local checks: 204 tests, TypeScript, skill validation and 4 skill tests passed. Web validation: 192 HTML, 190 search entries, 16 map terms/17 edges, 42 articles, RSS 40. Preserved 163 source/archive/knowledge files. Desktop and 390px browser checks passed. Published and verified via successful Actions 34737722632 (9120edf). Live Pages, RSS and GitHub summaries match the local build; asset 4f4a9cb22f16.

## Sector and theme research · 2026-09-13

Objective: from the next daily run, investigate both technology/products and corporate operations in each of the eight sectors; preserve a reviewed primary theme, optional secondary theme, event tags and named entities through news, briefings, RSS and GitHub summaries. Baseline: clean main at 302a3e8; all 45 garden tests pass.

Scope: authoring rules/template, versioned classification validation and publication, compact news filters, existing 08:00 automation. Keep the five-event sector cap, stable event IDs/feed GUIDs, Drive source authority and specialist-only graph. Preserve original historical issues, concepts and judgments. Do not fabricate a new research issue or retrospectively classify old articles. No additional job, paid API or source migration.

1. Complete — Define the ten themes and two-channel research checklist; implement strict new-issue classification with explicit legacy compatibility.
2. Complete — Carry classifications into news metadata, context, web filters, briefings, digest and RSS; test real source-to-output behavior and malformed inputs.
3. In progress — The existing daily automation and maintained skill assets are updated. Full Node tests, TypeScript, 7 Drive tests, 4 skill tests, build and site validation pass. Scheduler prompt readback matches; schedule, project, model and status are preserved. Publishing the verified code is the remaining step.

Acceptance: missing/unknown/duplicate or excessive themes fail for the new format; metadata never becomes a headline or graph association; both research channels are explicitly recorded for all sectors, including access failures; old editions remain readable without inferred tags. New classifications survive every output and combined filters. A configured future run is reported separately from actual research execution.

Verification: eight classification tests include source-to-news/briefing/digest/RSS propagation and repeat-run equality. Browser fixture checks pass for secondary themes, combined zero-result filters, exact entity selection, URL restoration and reset; 390px layout has no horizontal overflow and filter targets are at least 44px. Desktop screenshot reviewed. The mobile screenshot command stalled in the browser tool; DOM/layout checks passed. All 178 protected source/state files are byte-identical. Existing site projection remains 192 HTML pages, 190 search entries, 42 events, 16 graph terms/17 relationships and 40 RSS issues. No new research issue was authored; the new requirements start with the 2026-09-14 daily run.
