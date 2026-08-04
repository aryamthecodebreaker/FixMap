# FixMap growth log

This log records dated baselines and distribution experiments for the 5,000-star goal. GitHub traffic is a rolling 14-day window, so snapshots are preserved here instead of reconstructed later.
> **Dated document.** Entries are point-in-time snapshots. Accuracy figures below were correct when written and are **not** kept current — the live numbers are on <https://usefixmap.vercel.app/evidence>, generated from the recorded suites. Check any figure there before quoting it.


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
| 2026-07-26 07:06 | v0.7.1 release: identifier grounding and confidence capping | [v0.7.1 release](https://github.com/aryamthecodebreaker/FixMap/releases/tag/v0.7.1) | 4 | — | — | — | — | Two external agent stress tests, both self-commissioned |
| 2026-07-26 10:15 | v0.7.2 release: `--explain`, confidence intervals, misleading-top-result rate | [v0.7.2 release](https://github.com/aryamthecodebreaker/FixMap/releases/tag/v0.7.2) | 4 | — | — | 25 baseline | 677 over 7 days | — |
| 2026-07-26 ~10:30 | X post on the misleading-rate finding | _URL pending_ | 4 | due 2026-07-27 ~10:30 | due 2026-07-29 ~10:30 | 25 at 10:26 (rolling 14 days) | 677 over 7 days; 0 on 2026-07-26 | — |
| 2026-07-26 ~10:30 | LinkedIn post on the same finding | _URL pending_ | 4 | due 2026-07-27 ~10:30 | due 2026-07-29 ~10:30 | 25 at 10:26 (rolling 14 days) | 677 over 7 days; 0 on 2026-07-26 | — |

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

## Baseline — 2026-07-26 10:26 UTC

Recorded immediately before the v0.7.2 X and LinkedIn posts.

| Metric | Value | Change since 2026-07-22 baseline |
| --- | ---: | --- |
| GitHub stars | 4 | unchanged |
| GitHub forks | 0 | unchanged |
| GitHub watchers | 0 | unchanged |
| Views (rolling 14 days) | 195 total / 25 unique | 160 / 14 |
| Clones (rolling 14 days) | 634 total / 204 unique | 551 / 178 |
| npm CLI downloads (7 days) | 677 | 652 |
| npm CLI downloads (2026-07-26) | 0 | — |
| Open issues | 0 | was 1 (#59, since closed) |
| External issues, PRs, or forks | 0 | unchanged |

Top referrers: GitHub (65 views / 4 unique), LinkedIn Android (2 / 1), Slack (1 / 1), the production site (1 / 1), `t.co` (1 / 1).

### Interpretation

Four stars and zero external contributions across four weeks and five releases. The 204 unique cloners against 25 unique visitors continues to look like automated traffic rather than people, and the two release-day download spikes (516 on 07-22, 0 on 07-26) confirm those counts track CI and publication rather than adoption.

**The binding constraint has moved.** Through 2026-07-25 it was correctness: promoting a tool that could not find chalk's own colour-detection code would have converted qualified visitors into permanent non-users. That is fixed and measured. What remains is that nobody outside this repository has run FixMap and said anything about it.

No amount of further ranking work changes that number. The next milestone worth recording is not a benchmark figure — it is **one issue opened by a stranger**.

## v0.7.1 and v0.7.2 — 2026-07-26

Two releases in one day, both published to npm, the MCP Registry, and GitHub releases.

**v0.7.1** added repository-grounded identifier analysis. Fabricated identifiers are named in the report and their component words are excluded from ranking evidence, confidence is capped when grounding is weak or the scan incomplete, and the frozen 15-repository suite rose from 40% / 67% / 67% to 60% / 100% / 100% top-1/3/5 against a freshly measured pre-change baseline.

**v0.7.2** added `--explain <path>`, confidence intervals on every published rate, and a misleading-top-result rate.

Three evidence changes matter more for this log than the features:

A **held-out suite** of 12 repositories was added, selected by the same frozen rule *after* the ranker was finished and never tuned against. It measures 67% top-1 and 75% top-3, against the regression suite's 60% / 100%. The previously advertised 100% describes fit, not generalization, and the README now tells readers to plan around 75%.

**Confidence intervals** were added because at twelve cases one result flipping moves top-3 by eight points. The honest reading of 75% is 47–91%. Quoting it to two significant figures was an overclaim of the same kind as the figures removed below, in a subtler form.

Two published figures were **deleted outright**: a "98.6% fewer tokens" context proxy that compared the top five files against every file in the repository, and a "14.97 minutes saved" comparison against an assumed manual baseline that was never measured. Both carried estimate labels, but a reader cannot separate honest numbers from invented ones, and one indefensible headline discredits the measured figures beside it. No savings claim is made anywhere now, and the benchmark card says why.

Separately, `docs/LAUNCH_KIT.md` held ready-to-paste post copy quoting `4/6` top-1 and `6/6` top-3 from the retired six-case suite. Those figures came from a `results.json` that had drifted from the committed ranker and were not reproducible when written. Six passages carried them, including a paragraph written for verbatim publication. All are corrected, and the kit now instructs never to quote the regression figure alone.

### Distribution checkpoint due

X and LinkedIn posts published around 10:30 UTC on the misleading-rate finding: the regression suite's 100% top-3 was concealing that a wrong file ranked first in 40% of those cases, while the held-out suite does so in 8%. Record impressions, reactions, and profile views separately from repository outcomes at 24 and 72 hours. Stars, unique visitors, and qualified feedback remain the decision metrics.

Add the post URLs to the experiments table once available; the rows are recorded with the timestamps and pending links rather than left out, so the checkpoints stay honest if either post produces nothing.

## Evidence correction — 2026-08-04

An audit found that 3 of the 12 held-out tasks name their expected fixing file in the task text. Those cases remain useful tests of explicit-file-mention handling, but they no longer contribute to the generalization headline. On the nine tasks that did not name the file, FixMap measures 4/9 Top-1, 5/9 Top-3, and 6/9 Top-5; the 95% interval remains wide enough that these are exploratory point estimates.

The same scanned corpora were then ranked with literal keyword retrieval and BM25. On the held-out unmentioned cohort, BM25-over-code ties FixMap at Top-1 and Top-3 and leads 9/9 to 6/9 at Top-5. The paired Top-1 and Top-3 comparisons are exact ties; at this sample size none establishes a stable effect size.

**Decision gate:** FixMap does not currently beat the naive retrieval baseline on unseen repositories. Pause distribution built on a “better than search” claim and do not add workflow surface area on that premise. The next evidence work is to expand the mechanically selected unmentioned cohort and improve recall without tuning against cases that remain held out.
