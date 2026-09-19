# SEO refresh — 2026-09-19

## Completed locally

- Rewrote the box-to-box guide with a direct definition, No. 6/CDM/8/10 comparisons, player examples, a decision sequence, training ideas and formation guidance. Added an original SVG movement diagram with descriptive alternative text.
- Refreshed SEO titles/descriptions on eight priority articles; tightened opening answers where needed.
- Rewrote the False 10 guide around meaning, movement and contextual examples. The term is explicitly qualified as non-standardised: an attacking midfielder leaving the expected central pocket as part of a rotation. The comparison article focuses on differences in starting position, movement and team support. They retain separate, self-referencing canonicals and link to each other.
- Added six contextual links to the original box-to-box URL.
- Removed empty image markers, fixed multiple H1s in the No. 8/10 guide, and repaired malformed `file:///https://` references in touched guides.
- Preserved publication dates and permanent URLs; added modification dates.
- Enabled Hugo's existing robots template with the production sitemap.
- Added a project RSS override removing legacy `site.Author` references that fail with the installed Hugo 0.161.1. The project-pinned 0.152.2 also builds successfully.

## Eight priority articles

All paths below are relative to `content/posts/`.

| File | SEO title |
| --- | --- |
| best-soccer-positions-for-short-players-turn-your-height-into-an-advantage.md | Best Soccer Positions for Short Players: Find Your Role |
| box-to-box-midfielder-the-complete-guide-to-footballs-most-demanding-position.md | Box-to-Box Midfielder: Meaning, Role, Skills & Examples |
| false-9-vs-number-10-messi-de-bruyne-false-10-explained.md | False 9 vs Number 10 vs False 10: Key Differences |
| number-9-vs-number-10-in-soccer-striker-vs-playmaker-explained.md | Number 9 vs Number 10: Striker vs Playmaker |
| what-position-should-a-fast-kid-play-in-soccer-1.md | Best Soccer Positions for a Fast Kid: 3 Roles Compared |
| sweeper-keeper-vs-traditional-goalkeeper-how-manuel-neuer-changed-football-forever.md | Sweeper Keeper vs Traditional Goalkeeper: Key Differences |
| inverted-winger-vs-traditional-winger-key-differences-tactics-which-style-suits-your-team.md | Inverted Winger vs Traditional Winger: Which Role Fits? |
| false-10-in-soccer-explained-why-messi’s-role-confuses-even-analysts.md | False 10 in Soccer: Meaning, Movement & Examples |

## Six box-to-box link sources

- `layouts/partials/home_info.html`
- `content/midfield-positions/_index.md`
- `content/posts/number-6-vs-number-8-in-soccer-5-key-differences.md`
- `content/posts/number-8-vs-number-10-in-soccer-1.md`
- `content/posts/soccer-positions-and-numbers-explained.md`
- `content/posts/the-playmaker-essential-skills-every-attacking-midfielder-needs-to-master.md`

## Validation

- Production builds passed using both Hugo 0.161.1 and project-pinned 0.152.2.
- Four existing Node test files passed: homepage hero, navigation, branding and CMS config.
- The before/after Hugo inventory has 30 identical permalink mappings.
- Generated HTML inspection covered 13 changed content pages: one H1 per page, unchanged self-canonical, valid JSON-LD, no empty image sources, and no broken local image/link targets.
- All eight priority titles and descriptions are nonempty and distinct; descriptions are below 175 characters.
- All six inbound links resolve to the original box-to-box URL.
- Production robots.txt allows crawling and references `https://footballposition.soccer/sitemap.xml`. RSS, sitemap and SVG parse as XML.
- Newer Hugo reports pre-existing language-property deprecation warnings. The pinned version builds without these warnings.

## Preview and publication state

Changes are local, on `codex/seo-content-refresh-20260919`; no push or production deployment was performed.

The currently running port-1313 server returned a cached Hugo hot-reload error, although fresh builds pass. An attempted guarded restart was denied by automatic approval (`blocked by policy`). Restart the existing local Hugo preview before reviewing it. Edge browser connection was unavailable, so mobile screenshots and visual layout checks are not complete.

`static/admin/config.yml` uses the GitHub backend on `main`, without `local_backend`. Therefore the CMS can still display repository content rather than these local edits. Review the local front-end preview or source diff; do not overwrite this work by saving stale CMS content. CMS will reflect the changes after the reviewed edits are integrated into its configured remote branch.

## Remaining work requiring inputs or a separate feature pass

- Author/About: owner-approved public name, biography and any genuine review credentials. No person or qualification was invented.
- Analytics: real GA4/Plausible/Cloudflare configuration is needed. Nothing has been provisioned or connected. Select the provider before implementing engaged-session, reading-depth, return-visit and quiz-completion measurements.
- Historical redirects: provide the exact old URLs from Search Console or verified backlink records. Existing redirects were preserved; no mappings were guessed.
- Position recommendation quiz and sourced match-sequence analyses remain follow-on features. This pass concentrates on existing pages as the supplied analysis recommends.
- Check mobile rendering and remote-image loading after restoring preview; verify production robots/sitemap after deployment. Local generation does not establish production HTTP status.

## Measure after publication

1. Record the actual publication date; keep the preceding 28 days as the baseline.
2. After 28 complete days, compare with the preceding 28 in Search Console using the same search type, country and device filters.
3. Track clicks, impressions, CTR and position by query AND page. Track box-to-box variants as a cluster rather than new article ideas.
4. Filter `false 10`, then inspect the Pages tab to see which of the two URLs receives impressions and clicks. Do not assume cannibalisation from aggregate page totals.
5. Compare mobile and desktop separately. Check changes in impressions and position alongside CTR; a title change alone does not prove causation.
6. Keep a record of the changed titles and avoid repeatedly changing them before enough comparable data has accumulated.

No ranking or CTR improvement is claimed by this implementation; it must be measured after indexing and deployment.
