# FixMap 5,000-star growth kit

This is an evidence-based operating kit for earning adoption, not a forecast that any post will produce a fixed number of stars. Recheck every version, command, benchmark result, and platform rule immediately before using it.
> **Dated document.** This kit is revised between releases, not continuously. Accuracy figures below were correct when written and are **not** kept current — the live numbers are on <https://usefixmap.vercel.app/evidence>, generated from the recorded suites. Check any figure there before quoting it.


## The hook

Let a developer try FixMap on a real public repository in one command, without cloning, creating an account, or supplying an API key:

```bash
npx -y @aryam/fixmap@latest plan \
  --issue https://github.com/aryamthecodebreaker/FixMap/issues/152
```

The report ranks likely files with reasons, suggests test routes, and names risks and diagnostics. Public URL analysis is issue-only; diff analysis still requires a local checkout.

## Proof worth leading with

- MIT licensed, deterministic, local-first analysis with no model call or account.
- CLI, MCP server, and GitHub Action share the same core ranker.
- Public GitHub issue URLs supply both task context and the repository in one input; source is scanned in an isolated anonymous shallow checkout that is removed after analysis.
- Two frozen evaluations use real fixed issues at pinned pre-fix commits, selected by a mechanical rule.
- **Held-out tasks that did not name the fixing file (9 repositories, never tuned against): top-1 `3/9` (33%), top-3 `5/9` (56%), top-5 `5/9` (56%).** Three further cases named their answer and are reported separately.
- On that same cohort and scanned corpus, BM25-over-code leads `4/9` to `3/9` at Top-1, ties `5/9` at Top-3, and leads `9/9` to `5/9` at Top-5. FixMap's advantage over naive retrieval is unproven.
- Regression (16 repositories, guided development): top-1 `11/16` (69%), top-3 and top-5 `16/16` (100%).
- Confidence labels are directional heuristics, not calibrated probabilities; all per-band counts remain public.
- An adversarial suite measures false confidence on fabricated identifiers, vague tasks, and absent features: `0.0` across 9 cases.
- Every ranked output and both frozen selection rules are public in [`benchmarks/`](../benchmarks/).
- A release cannot publish unless the local CI suite and external evaluation gate pass.

**Always quote the unmentioned held-out cohort beside the BM25 baseline. Never use the pooled held-out or regression figure as a generalization claim.** The regression suite guided ranking work, while three held-out tasks already contained their fixing path.

## Truth guardrails

Do not say:

- “FixMap is 100% accurate” or “always finds the right file.”
- “FixMap runs or verifies the tests.” It suggests test routes; it does not execute them.
- “Any GitHub URL works.” Only canonical public repository and issue URLs are supported.
- “Your code never leaves your machine” without the remote-mode nuance: FixMap downloads public source from GitHub, but does not upload analyzed source to a FixMap service.
- “5,000 stars is expected.” It is the goal, not a promised outcome.

Keep every per-case result and any future miss visible. If a scheduled evaluation regresses, pause promotion, fix or explain the regression, and update the published result before resuming.

## Release gate before any campaign

- [ ] The latest GitHub release, npm CLI, npm core package, and official MCP Registry entry show the same version.
- [ ] `npx -y @aryam/fixmap@latest --version` returns that version from a fresh cache outside the repository.
- [ ] The public GitHub issue URL command above succeeds from a fresh cache.
- [ ] Main CI and the manual external-evaluation workflow are green at the release commit.
- [ ] The production site shows the public URL command and current product language.
- [ ] The README, changelog, benchmark page, Action pin, and release notes agree.
- [ ] The root Action metadata is present before attempting a Marketplace listing.

## Measure a baseline

Record this immediately before each distribution experiment:

| Metric | Source |
| --- | --- |
| Stars and forks | GitHub repository |
| Unique visitors and views | GitHub Insights → Traffic |
| Clones | GitHub Insights → Traffic |
| Top referring sites and paths | GitHub Insights → Traffic |
| npm CLI downloads | npm downloads API/package page |
| Issues, discussions, and external PRs | GitHub |
| External-evaluation result | `external-eval` workflow |

GitHub traffic and referral data is a rolling 14-day view, so save a dated snapshot rather than relying on memory.

For every experiment, log:

| Date/time UTC | Channel | Link or post ID | Stars before | Stars +24h | Stars +72h | Unique visitors | npm downloads | Qualified feedback |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
|  |  |  |  |  |  |  |  |  |

A “qualified” result is a real install, issue, discussion, PR, integration, or technically specific comment—not raw impressions.

## Growth loop

### 1. Convert repository visitors

- Put the one-command public repository trial above the fold.
- Keep the animated result, live site, npm version, license, and CI status visible.
- Make the first screen answer: what it does, how to try it, why to trust it, and where it still misses.
- Give each release a short user-facing body with a working command and links to npm, MCP, and the benchmark.
- Make the GitHub Action installable from the repository root and list it in Marketplace once the owner accepts the Marketplace terms.

### 2. Run one channel at a time

Use a distinct angle and measure the 24/72-hour result before deciding whether to repeat it:

1. Show HN: local deterministic tooling, one-command trial, and the public miss.
2. Local-model communities: zero-token context routing before an agent starts searching.
3. Claude Code/Cursor communities: MCP setup and a concrete before/after workflow.
4. TypeScript/Node communities: transparent ranking and monorepo-aware test routing.
5. Maintainer communities: Action output, fork-PR safety, and contribution opportunities.

Do not paste the same copy across communities, coordinate votes, or ask friends to boost a submission.

### 3. Turn feedback into public proof

- Label small, well-scoped contributor issues.
- Answer reproducible bug reports quickly and link the fix to a release.
- Add new external evaluation cases by a frozen selection rule, never by choosing examples FixMap already wins.
- Publish short engineering notes about misses, fixes, and benchmark movement.
- Highlight external integrations and contributor PRs with permission.

### 4. Repeat what converts

Continue a channel when it produces qualified feedback, installs, or repository traffic that converts to stars. Stop or change the angle when it produces only impressions. The path to 5,000 is a series of measured loops, not one manufactured spike.

## Show HN maintainer outline

Hacker News says a Show HN must be something people can try, should avoid signup barriers, must not solicit votes, and should be discussed by the maker. Its current guidelines also say not to post generated or AI-edited text. Therefore, use these facts to write the submission in your own words; do not paste an assistant-written body.

Possible factual title:

> Show HN: FixMap – map a GitHub issue to likely files without an API key

Points for the maintainer to explain personally:

1. The recurring problem that made you build it: agents lose time before the first edit because they start in the wrong module or miss the owning test.
2. The one-sentence solution: deterministic repo context—ranked files, test routes, risks, and diagnostics.
3. The fastest trial: include the one-input public GitHub issue URL command.
4. The technical mechanism: path/content signals, real git diff signals, bounded static import proximity, file-kind priors, and workspace boundaries.
5. The honest evidence: on nine held-out tasks that did not name their fixing file, FixMap scores `3/9` Top-1 and `5/9` Top-3; BM25 scores `4/9` and `5/9`, then leads at Top-5. Link every per-case ranking.
6. The scope: JavaScript/TypeScript today; remote URLs are issue-only; suggested tests are not executed.
7. What the benchmarks did not catch: both suites passed while FixMap could not find chalk's own color-detection code, because a directory blocklist ran after git had already applied `.gitignore` and a frequency cutoff suppressed the word "color" in a library about color. Pointing it at a repository it had never been run on found that; the benchmark never would have.
8. Ask for technical criticism of the evaluation and useful next signals.

Before submitting:

- [ ] Read the current [Show HN rules](https://news.ycombinator.com/showhn.html) and [HN guidelines](https://news.ycombinator.com/newsguidelines.html).
- [ ] Write the post yourself in your normal voice.
- [ ] Use the repository or live product as the original link.
- [ ] Be free to answer technical questions for the rest of the day.
- [ ] Never solicit upvotes, comments, or booster posts.

## Community-specific briefs

These are angles and evidence, not identical copy to syndicate.

### Local-model communities

- Problem: agents spend context and tokens discovering where to start.
- Demo: run FixMap first on a public repository, then hand the report to the agent.
- Evidence: deterministic, zero model calls, and inspectable reasons; on nine held-out tasks that did not name the file, FixMap trails BM25-over-code at Top-1 and Top-5 and ties it at Top-3.
- Honest caveat: it is a routing aid, not semantic code understanding or a correctness oracle.

### Claude Code and Cursor communities

Setup:

```bash
claude mcp add fixmap -- npx -y @aryam/fixmap@latest mcp
```

- Show the `fixmap_plan` tool returning ranked files and test routes.
- Use a real repository/task pair and include the exact report.
- Explain that the MCP process runs locally over stdio.
- Ask which client workflow or output field would make it more useful.

### TypeScript and Node communities

- Lead with the ranking-engine postmortem: `.js` issue paths can map to `.ts` source, example/declaration noise is deprioritized, and import neighbors cannot outrank their evidence seed.
- Link the unit tests and frozen external result.
- Invite additional repository layouts and externally selected benchmark cases.

### Short-form post structure

1. One pain sentence.
2. The public repository command.
3. A screenshot or short terminal video of the real output.
4. One evidence sentence: nine held-out pinned bugs whose tasks did not name the file, FixMap scored `3/9` Top-1 and `5/9` Top-3 versus BM25's `4/9` and `5/9`, with every ranking public.
5. Repository link and a specific feedback question.

Avoid generic feature lists and unsupported superlatives.

## Historical LinkedIn draft (superseded)

Do not publish the copy below. Use `docs/releases/v0.9.0-social-posts.md`, which contains the reviewed X, LinkedIn, and Show HN drafts for the current release candidate.

Coding agents are fast once they know where to work. The expensive mistakes happen before the first edit: opening the wrong module, missing the owning test, or overlooking a risky change.

I have been building FixMap to make that handoff explicit.

Give it a public GitHub issue URL and it returns ranked context files with reasons, suggested test routes, risk notes, and diagnostics—without an account or API key:

```text
npx -y @aryam/fixmap@latest plan --issue https://github.com/aryamthecodebreaker/FixMap/issues/152
```

The latest work includes:

- one-command analysis of public GitHub issue URLs
- safer isolated repository fetching with bounded inputs and no credentials, hooks, submodules, or executed repository scripts
- a shared CLI, MCP server, and GitHub Action workflow
- a GitHub Marketplace listing for the Action
- a production dependency audit gate with no high or critical findings
- 727 automated tests, production builds, smoke tests, and frozen cross-repository and adversarial evaluation gates
- a new 32-second product film on the README and live site

The evaluation is intentionally public and modest. Across 12 pinned real bugs in repositories the ranker was never tuned against, FixMap ranks an expected file in the top 1 for 7 and in the top 3 for 9. Every per-case ranking is published, including the three misses, and 12 cases are not a general accuracy claim.

Watch the film and try the live experience: https://usefixmap.vercel.app/fixmap-launch.mp4

GitHub: https://github.com/aryamthecodebreaker/FixMap

Marketplace: https://github.com/marketplace/actions/fixmap

npm: https://www.npmjs.com/package/@aryam/fixmap

Release: publish the v0.9.0 URL only after the release exists and is verified

I would especially value feedback on the ranking explanations and which repository signals would make FixMap more useful before an agent starts editing.

#opensource #devtools #githubactions #mcp #typescript #aicoding

## Distribution checklist

- [ ] Official MCP Registry metadata is current; downstream directories can ingest the canonical entry.
- [x] GitHub Marketplace listing is enabled from a root `action.yml`.
- [ ] Relevant awesome-list submissions follow each list's current contribution rules and add a genuinely missing category entry.
- [ ] Release notes contain the one-command trial and benchmark delta.
- [x] A short demo video is rendered from real output for platforms that do not animate the README SVG.
- [ ] Repository topics, description, homepage, and social preview use the current product language.
- [ ] GitHub Discussions has a clear “show how you use FixMap” prompt after there are real users to answer it.

## Decision rules

- If visitors rise but stars and installs do not, fix the README/release conversion path before adding channels.
- If installs rise but issues report poor rankings, expand the evaluation and ranker before promoting harder.
- If a channel produces real integrations or PRs, invest in that community even if raw star growth is modest.
- If the benchmark turns red, stop the campaign until the public evidence is coherent again.
- Revisit the 5,000-star goal monthly with measured deltas; never rewrite history or benchmark inputs to make the chart look better.
