# FixMap 5,000-star growth kit

This is an evidence-based operating kit for earning adoption, not a forecast that any post will produce a fixed number of stars. Recheck every version, command, benchmark result, and platform rule immediately before using it.

## The hook

Let a developer try FixMap on a real public repository in one command, without cloning, creating an account, or supplying an API key:

```bash
npx -y @aryam/fixmap@latest plan \
  --repo https://github.com/aryamthecodebreaker/FixMap \
  --issue "the external ranking evaluation regressed"
```

The report ranks likely files with reasons, suggests test routes, and names risks and diagnostics. Public URL analysis is issue-only; diff analysis still requires a local checkout.

## Proof worth leading with

- MIT licensed, deterministic, local-first analysis with no model call or account.
- CLI, MCP server, and GitHub Action share the same core ranker.
- Public GitHub repositories work through an isolated anonymous shallow checkout that is removed after analysis.
- A frozen external evaluation uses six real fixed issues at pinned pre-fix commits.
- Current checked-in result: top-1 `3/6` (50%), top-3 `5/6` (83%), top-5 `5/6` (83%).
- The remaining Zod miss and every ranked output are public in [`benchmarks/external/`](../benchmarks/external/).
- A release cannot publish unless the local CI suite and external evaluation gate pass.

The six-case result is evidence about those six cases, not a general “83% accurate” claim.

## Truth guardrails

Do not say:

- “FixMap is 83% accurate” or “finds the right file 83% of the time.”
- “FixMap runs or verifies the tests.” It suggests test routes; it does not execute them.
- “Any GitHub URL works.” Only canonical public `https://github.com/owner/repository` inputs are supported.
- “Your code never leaves your machine” without the remote-mode nuance: FixMap downloads public source from GitHub, but does not upload analyzed source to a FixMap service.
- “5,000 stars is expected.” It is the goal, not a promised outcome.

Keep the documented miss visible. If a scheduled evaluation regresses, pause promotion, fix or explain the regression, and update the published result before resuming.

## Release gate before any campaign

- [ ] The latest GitHub release, npm CLI, npm core package, and official MCP Registry entry show the same version.
- [ ] `npx -y @aryam/fixmap@latest --version` returns that version from a fresh cache outside the repository.
- [ ] The public GitHub URL command above succeeds from a fresh cache.
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
3. The fastest trial: include the public GitHub URL command.
4. The technical mechanism: path/content signals, real git diff signals, bounded static import proximity, file-kind priors, and workspace boundaries.
5. The honest evidence: six frozen real bugs, `3/6` top-1 and `5/6` top-3/top-5, with the Zod miss linked.
6. The scope: JavaScript/TypeScript today; remote URLs are issue-only; suggested tests are not executed.
7. What changed because the benchmark caught a regression: the floor failed at `2/6` top-3, the thresholds stayed fixed, and general ranking rules lifted it to `5/6`.
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
- Evidence: deterministic, zero model calls, inspectable reasons, `5/6` top-5 on the frozen set.
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
4. One evidence sentence: six pinned bugs, `3/6` top-1 and `5/6` top-5, one public miss.
5. Repository link and a specific feedback question.

Avoid generic feature lists and unsupported superlatives.

## Distribution checklist

- [ ] Official MCP Registry metadata is current; downstream directories can ingest the canonical entry.
- [ ] GitHub Marketplace listing is enabled from a root `action.yml`.
- [ ] Relevant awesome-list submissions follow each list's current contribution rules and add a genuinely missing category entry.
- [ ] Release notes contain the one-command trial and benchmark delta.
- [ ] A short demo video is rendered from real output for platforms that do not animate the README SVG.
- [ ] Repository topics, description, homepage, and social preview use the current product language.
- [ ] GitHub Discussions has a clear “show how you use FixMap” prompt after there are real users to answer it.

## Decision rules

- If visitors rise but stars and installs do not, fix the README/release conversion path before adding channels.
- If installs rise but issues report poor rankings, expand the evaluation and ranker before promoting harder.
- If a channel produces real integrations or PRs, invest in that community even if raw star growth is modest.
- If the benchmark turns red, stop the campaign until the public evidence is coherent again.
- Revisit the 5,000-star goal monthly with measured deltas; never rewrite history or benchmark inputs to make the chart look better.
