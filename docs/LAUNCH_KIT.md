# Launch Kit — v0.4.0

Copy-paste material for the 1k-star push. Post these yourself from your own accounts; adjust tone freely. Updated for v0.4.0 (2026-07-16).

## The strategy in three sentences

1k stars comes from **one front-page moment compounding**, not from posting everywhere: a Show HN that lands drives 300–800 stars in 48 hours, that velocity puts the repo on **GitHub Trending (TypeScript)**, and Trending brings the next wave for free. That only works if the launch is **concentrated into 24–48 hours** — HN, Reddit, and X on the same day — instead of dripped over weeks. The MCP directories and newsletters are the long tail that carries you from a few hundred to 1k over the following month.

**The differentiator to lead with everywhere:** the checked-in, reproducible evaluation. Every AI tool claims magic; FixMap publishes unflattering numbers about itself (top-1 33%, top-5 67% on six real bugs in Express/Axios/debug/ky/Zod/Pino, pinned to exact commits so the results can't be gamed). Honesty is the hook — especially on HN.

## Prerequisites (all done as of v0.4.0)

- [x] `@aryam/fixmap@0.4.0` + `@aryam/fixmap-core@0.4.0` on npm with signed provenance.
- [x] `v0.4.0` tag + GitHub release published.
- [x] Cross-repository evaluation with honest published results (`benchmarks/external/`).
- [x] Animated CLI demo at the top of the README; refined site at fixmap-flax.vercel.app.
- [x] Action validated on read-only fork-PR tokens; Marketplace branding in place.
- [x] `mcp` + `mcp-server` repository topics set.
- [x] `npx -y @aryam/fixmap@latest mcp` verified: MCP initialize handshake returns `serverInfo { name: "fixmap", version: "0.4.0" }` outside the repo.
- [ ] For X: record a short MP4/GIF of the CLI demo (X does not animate SVGs; screen-record the README demo or the site).

## Launch-day sequence (pick a Tue/Wed/Thu)

| Time (UTC) | Action |
| --- | --- |
| ~14:00–15:30 | Submit **Show HN** (8–10am US Eastern). Post the prepared first comment immediately. |
| +15 min | Post **r/LocalLLaMA** and **r/ClaudeAI** (different drafts below — never the same text twice). |
| +30 min | Post the **X thread** with the demo video. |
| All day | Reply to every HN/Reddit comment within minutes — response speed visibly drives HN ranking. Concede valid criticism instantly; the honest-numbers positioning only works if the author acts the same way. |
| Day 2–3 | MCP directory submissions, awesome-list PRs, newsletter submissions (below) while star velocity is visible. |
| Week 2 | Dev.to write-up on the evaluation; Product Hunt if energy remains. |

If Show HN doesn't front-page (most don't), it's allowed to retry once after a week or two with a different title — many successful launches were second attempts.

## Show HN draft

**Title:** Show HN: FixMap – maps a bug report to the files to edit (right 67% of the time)

**Body:**

AI coding agents are fast once they have the right context. The expensive mistakes happen before the first edit: reading a plausible file instead of the owning module, missing the test that would catch the regression, or treating an unresolved git diff as "no changes".

FixMap is a small open-source tool that maps an issue, prompt, or git diff to: the files worth reading first (with confidence scores and reasons), the test commands most likely to validate the change, and risk notes for review. It is deterministic and inspectable — no model calls, no account, nothing leaves your machine.

Because "it finds the right files" is easy to claim, the repo ships a reproducible evaluation against six real, already-fixed bugs in Express, Axios, debug, ky, Zod, and Pino, each pinned to the commit where the bug existed. Current honest numbers: the fix file is ranked #1 in 33% of cases and in the top 5 in 67%. The dataset selection rule was frozen before measuring, and cases must not be edited to match output, so I can't quietly game it.

Three ways to use it:

- CLI: `npx @aryam/fixmap plan --issue "password reset emails fail"`
- MCP server: `claude mcp add fixmap -- npx -y @aryam/fixmap mcp` — the agent calls `fixmap_plan` itself
- GitHub Action: comments a context/test/risk report on every PR (stays green on fork PRs where the token is read-only)

The ranker is intentionally simple: token/path overlap, real git diff signals, static import-graph proximity, workspace boundaries. Every recommendation carries a reason string. A trainable model may come later, but only after the transparent version stops improving.

Repo: https://github.com/aryamthecodebreaker/FixMap
Eval methodology and results: https://github.com/aryamthecodebreaker/FixMap/tree/main/benchmarks/external
Live demo: https://fixmap-flax.vercel.app

Honest scope: JavaScript/TypeScript repositories today. I'd love feedback on the eval methodology and what signals you'd want next.

**Prepared first comment (post immediately after submitting):**

Author here. The part I'd most like feedback on is the evaluation: six cases is obviously small, and I picked "most recent qualifying merged PR per repo" to avoid cherry-picking, but I'm sure there are failure modes I haven't thought of. The two misses are instructive — in Zod the fix lived in a regex constants file while FixMap surfaced the JSON-schema modules that consume it, and in Pino it surfaced `examples/transport.js` over `lib/transport.js`. Import-graph proximity was added specifically because of misses like these, and the eval reruns weekly in CI so regressions are visible.

## r/LocalLLaMA draft

**Title:** Local, deterministic repo-context tool for coding agents — with published (unflattering) accuracy numbers

**Body:**

FixMap turns an issue or git diff into ranked context files, test commands, and risk notes for a coding agent — CLI, MCP server, or GitHub Action. Everything runs locally: no API key, no model calls, no telemetry, nothing leaves your machine. The ranking is deterministic and every result carries a human-readable reason.

Since this sub is rightly allergic to benchmark theater: the repo ships a reproducible eval against six real fixed bugs in Express/Axios/debug/ky/Zod/Pino at pinned commits. Top-1 33%, top-5 67%, misses documented, dataset frozen before measurement. It's a routing layer, not magic — but a deterministic 67% top-5 for zero tokens before your agent starts grepping is a decent trade.

Setup for any MCP client: `npx -y @aryam/fixmap mcp`. MIT, JS/TS repos for now. https://github.com/aryamthecodebreaker/FixMap

## r/ClaudeAI · r/cursor draft

**Title:** I built an MCP server that hands your agent a repo map before it edits anything

**Body:**

Every agent session starts the same way: it greps around, opens a plausible-looking file, and starts editing. Sometimes it picks right. When it doesn't, you burn tokens and review time.

FixMap is a free, local MCP server (also a CLI and GitHub Action) that turns a task description or git diff into ranked context files with reasons, the test commands most likely to matter, and risk notes. Deterministic — no LLM inside, no API key, nothing leaves your machine. And instead of claiming accuracy, it ships a checked-in eval against real bugs in Express/Axios/Zod/etc. with honest numbers (top-5 67%).

Claude Code setup: `claude mcp add fixmap -- npx -y @aryam/fixmap mcp`

MIT licensed, JS/TS repos for now. Feedback and issues welcome: https://github.com/aryamthecodebreaker/FixMap

## X/Twitter thread

1/ Coding agents don't fail at writing code. They fail at knowing where to start.

FixMap gives any agent a map of your repo before it edits: ranked files with reasons, test routes, risk notes. Local, deterministic, no API key.

[attach demo video]

2/ Instead of claiming accuracy, the repo ships a reproducible eval: six real fixed bugs in Express, Axios, debug, ky, Zod, Pino — pinned to the commits where the bugs existed.

Honest numbers: top-1 33%, top-5 67%. Dataset frozen before measuring. It reruns weekly in CI.

3/ Three ways in:
- `npx @aryam/fixmap plan --issue "..."`
- MCP server for Claude Code / Cursor: `claude mcp add fixmap -- npx -y @aryam/fixmap mcp`
- GitHub Action that leaves a context/test/risk report on every PR

4/ No model inside. Token overlap, git diff signals, static import-graph proximity, workspace boundaries — every recommendation with a reason string, every ranking change gated by evals.

MIT. JS/TS today. https://github.com/aryamthecodebreaker/FixMap

## Directory + newsletter submissions (day 2–3)

MCP directories — submit `@aryam/fixmap` (command: `npx -y @aryam/fixmap mcp`):

- [ ] PulseMCP — pulsemcp.com/submit
- [ ] mcp.so — submit form on site
- [ ] Glama — glama.ai/mcp/servers (GitHub sign-in, add server)
- [ ] Smithery — smithery.ai (add server)
- [ ] PR to `modelcontextprotocol/servers` community list
- [ ] PR to `punkpeye/awesome-mcp-servers` (follow contributing rules)

Newsletters (all have submission forms; free):

- [ ] Console.dev — console.dev/submit (dev-tool of the week format, good fit)
- [ ] TLDR — tldr.tech advertise/submit link for community submissions
- [ ] Node Weekly / JavaScript Weekly — cooperpress.com contact form
- [ ] Changelog News — changelog.com/news tips

Awesome lists:

- [ ] awesome-claude-code, awesome-ai-tools, awesome-code-review (read each list's PR rules first)

## Expectations, honestly

- A Show HN that reaches the front page: 300–800 stars in 48h, plus Trending compounding. Most Show HNs don't front-page on the first try; the retry is part of the plan.
- Reddit posts: 20–150 stars each when they land with the right framing for the sub.
- MCP directories: a steady 5–20/week of exactly the right users, indefinitely.
- Newsletters: 50–200 stars per feature, weeks later.

What compounds after launch week: answer issues fast, merge small PRs generously, post a short changelog thread per release. Stars follow momentum, not one spike — but the spike is what starts the momentum.
