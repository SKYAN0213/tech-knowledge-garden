# Tech Knowledge Garden

Work from this repository. The user chose a separate, wholly shareable Obsidian vault: every reader note in `vault/` is published, without `publish: true` or a note selection step. Operational data and backups belong outside the vault.

For a briefing, read `docs/BRIEFING_WORKFLOW.md` and `docs/magazine-and-encyclopedia-contract.md`. GPT performs live research using the signed-in account. No paid API integration is configured. Author magazine v2 editions under `vault/Editions/` and concept v2 entries under `vault/Knowledge/`. Run `npm run refresh`, `npm run validate`, and `npm run build` before publication. Generated Briefings, News, Trends and navigation indexes are maintained by `scripts/garden.mjs`; edit their sources instead.

Preserve original material and citations. Last saved coverage end is the next exclusive cutoff. Empty or inaccessible search results are not evidence that no news exists. Review primary sources across IT, AI and robotics and record coverage gaps. No padding or invented news.

The public website is built from `vault/` only. Keep `.local/`, credentials, local automation exports and backups out of Git. Use `npm run publish` only for this project's validated content; it never stages unrelated paths or force-pushes.
