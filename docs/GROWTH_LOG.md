# FixMap growth log

This log records dated baselines and distribution experiments for the 5,000-star goal. GitHub traffic is a rolling 14-day window, so snapshots are preserved here instead of reconstructed later.

## Baseline — 2026-07-22 10:50 UTC

| Metric | Value |
| --- | ---: |
| GitHub stars | 4 |
| GitHub forks | 0 |
| GitHub views (14 days) | 160 total / 14 unique |
| GitHub clones (14 days) | 551 total / 178 unique |
| npm CLI downloads (last day) | 24 |
| npm CLI downloads (last 7 days) | 652 |
| npm CLI downloads (last 30 days) | 878 |
| Open issues | 1 (#59) |

Top GitHub referrers were GitHub (51 views / 2 unique), LinkedIn Android (3 / 2), LinkedIn web (1 / 1), and `t.co` (1 / 1). The repository overview received 120 views from 11 unique visitors.

### Interpretation

Package and clone activity is materially higher than human repository traffic. The immediate bottleneck is qualified discovery and visitor-to-star conversion, not package availability. The next proof point is the v0.7.0 ranking release: it closes the only frozen external benchmark miss and makes a measurable technical story available for promotion.

## Experiments

| Date/time UTC | Channel/change | Link or post ID | Stars before | Stars +24h | Stars +72h | Unique visitors | npm downloads | Qualified feedback |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-07-22 10:50 | v0.7.0 definition-site ranking and 6/6 Top-5 proof | [v0.7.0 release](https://github.com/aryamthecodebreaker/FixMap/releases/tag/v0.7.0) | 4 | — | — | 14 baseline | 652 weekly | #59 implementation |
| 2026-07-22 11:22 | LinkedIn launch post with the product film and v0.7.0 benchmark delta | [LinkedIn post](https://www.linkedin.com/posts/aryamg_opensource-devtools-githubactions-ugcPost-7485655556637147136-E1t9/) | 4 | 4 at 2026-07-23 12:17 (+24h55m) | 4 at 2026-07-25 11:30 | 17 at 12:19 (rolling 14 days; data through July 22) | 1,159 weekly / 516 latest day at 12:19 | None |
| 2026-07-25 11:30 | Correctness work, not a channel: fixed the scan and ranking defects behind the chalk miss ([#85](https://github.com/aryamthecodebreaker/FixMap/pull/85)) | [PR #85](https://github.com/aryamthecodebreaker/FixMap/pull/85) | 4 | — | — | — | 0 on 2026-07-24 and 2026-07-25 | Self-found; no external reporter |

### LinkedIn 24-hour checkpoint — captured 2026-07-23 12:17 UTC

The owner analytics screenshot was captured 24 hours 55 minutes after publication:

- 72 impressions from 6 members reached; 94% in-network and 6% out-of-network
- 4 video views, 52 seconds total watch time, and 13 seconds average watch time
- 4 social engagements: 3 reactions and 1 comment; 0 reposts, saves, or sends
- 0 profile viewers attributed to the post and 0 followers gained from the post

The repository snapshot at 12:19 UTC showed 4 stars, 174 views from 17 unique visitors, and 634 clones from 193 unique cloners in the rolling 14-day window. GitHub traffic had updated through July 22. npm reported 1,159 downloads in the latest seven-day window and 516 on the latest completed day, up from the 652-weekly and 24-daily baseline.

The post produced limited reach and no star conversion or qualified external feedback at this checkpoint. Package and clone activity increased materially, but those counts include CI, upgrades, and repeat activity and cannot be treated as unique installs or attributed solely to LinkedIn.

Only record real installs, issues, discussions, pull requests, integrations, or technically specific comments as qualified feedback. Never coordinate votes or manufacture engagement.

For the LinkedIn experiment, capture LinkedIn impressions, reactions, comments, reposts, and profile views separately at each checkpoint. Repository outcomes remain the decision metrics: stars, unique visitors, npm downloads, and qualified feedback.

### LinkedIn 72-hour checkpoint — captured 2026-07-25 11:30 UTC

Stars remained at 4, forks at 0, watchers at 0. The post produced no star conversion, no forks, and no qualified feedback across the full 72-hour window. npm recorded 0 downloads on both 2026-07-24 and 2026-07-25, which confirms the earlier 516-download day was release-day and CI traffic rather than adoption.

Treat the LinkedIn experiment as concluded and negative. The constraint it exposed is reach, not message: 72 impressions across 6 members reached cannot convert at any rate that matters. Channels with an existing audience have to come before further posting from a standing start.

### Correctness checkpoint — 2026-07-25

Before promoting anything further, FixMap was tested against a repository it had never been run on. Asked to route `handle chalk color detection on windows terminals` against chalk, it returned two low-confidence files matching only "color" and omitted `source/vendor/supports-color/index.js`, the only file in chalk implementing that behavior, with no diagnostic recording the omission.

Two independent defects caused it. The git scan path re-applied a hardcoded directory blocklist on top of `git ls-files --exclude-standard`, which had already applied `.gitignore` — so the second filter could only remove deliberately committed files. Separately, a term counted as boilerplate once half the files carried it, and chalk names "color" in 55% of its files.

Both are fixed in [#85](https://github.com/aryamthecodebreaker/FixMap/pull/85). The frozen six-repository evaluation improved from 83% / 83% / 100% to 83% / 100% / 100% top-1/3/5. `benchmarks/external/results.json` had drifted from what the committed ranker produced and was re-recorded; the previously published 6/6 top-5 figure was not reproducible against `c35362f`.

The lesson for the growth log specifically: distribution effort spent before this point would have sent qualified visitors to a tool that missed the correct answer on a 22k-star repository with four source files. Promotion converts adoption only when the first run succeeds, and the first run had not been tested outside the repository's own benchmark set.
