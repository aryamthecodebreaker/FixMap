# Launch Kit

Copy-paste material for announcing FixMap. Post these yourself; adjust tone as needed.

## Positioning

One line: **FixMap gives coding agents a map of your repo before they start editing — relevant files, test routes, and risk notes, all local, no API key.**

Lead with the pain, not the tool: agents read the wrong files, skip the right tests, and leave reviewers guessing. FixMap is the deterministic routing layer in front of any agent.

## Prerequisites before announcing

- [ ] Merge the MCP server PR and publish `@aryam/fixmap@0.3.0` + `@aryam/fixmap-core@0.3.0` to npm (`npm publish -w packages/core -w packages/cli`).
- [ ] Tag `v0.3.0` and create a GitHub release with the CHANGELOG entry.
- [ ] Add the `mcp` topic to the repository: `gh repo edit --add-topic mcp --add-topic mcp-server`.
- [ ] Verify `npx -y @aryam/fixmap@latest mcp` starts cleanly on a machine without the repo cloned.

## Show HN draft

**Title:** Show HN: FixMap – give coding agents a repo map before they edit (local, no API key)

**Body:**

AI coding agents are fast once they have the right context. The expensive mistakes happen before the first edit: reading a plausible file instead of the owning module, missing the test that would catch the regression, or treating an unresolved git diff as "no changes".

FixMap is a small open-source tool that maps an issue, prompt, or git diff to: the files worth reading first (with confidence scores and reasons), the test commands most likely to validate the change, and risk notes for review. It is deterministic and inspectable — no model calls, no account, nothing leaves your machine.

Three ways to use it:

- CLI: `npx @aryam/fixmap plan --issue "password reset emails fail"`
- MCP server: `claude mcp add fixmap -- npx -y @aryam/fixmap mcp` — the agent calls `fixmap_plan` itself
- GitHub Action: comments a context/test/risk report on every PR

I built it because I kept re-explaining the same repo structure to every tool. The ranker is intentionally simple (path/content overlap, diff signals, workspace boundaries) and there's a checked-in evaluation gate so ranking changes can't silently regress. A trainable ranking model is on the roadmap, but only after the report format proves useful.

Repo: https://github.com/aryamthecodebreaker/FixMap
Live demo: https://fixmap-flax.vercel.app

Honest scope: JS/TS repositories today. I'd love feedback on what signals you'd want next.

## Reddit draft (r/ClaudeAI, r/ChatGPTCoding, r/cursor)

**Title:** I built an MCP server that hands your agent a repo map before it edits anything

**Body:**

Every agent session starts the same way: it greps around, opens a plausible-looking file, and starts editing. Sometimes it picks right. When it doesn't, you burn tokens and review time.

FixMap is a free, local MCP server (also a CLI and GitHub Action) that turns a task description or git diff into: ranked context files with reasons, the test commands most likely to matter, and risk notes. Deterministic — no LLM inside, no API key, nothing leaves your machine.

Setup for Claude Code: `claude mcp add fixmap -- npx -y @aryam/fixmap mcp`

MIT licensed, JS/TS repos for now. Feedback and issues welcome: https://github.com/aryamthecodebreaker/FixMap

## X/Twitter thread

1/ Coding agents don't fail at writing code. They fail at knowing where to start.

FixMap gives any agent a map of your repo before it edits: relevant files, test routes, risk notes. Local, deterministic, no API key.

2/ Three ways in:
- `npx @aryam/fixmap plan --issue "..."` for any tool you paste into
- MCP server for Claude Code / Cursor — the agent calls it itself
- GitHub Action that reviews every PR with a context/test/risk report

3/ No model inside. The ranker is transparent: path and content overlap, real git diff signals, workspace boundaries. Every recommendation comes with a reason, and a checked-in eval gate keeps ranking honest.

4/ MIT licensed, JS/TS today, more signals on the roadmap. Star it if you want this to exist: https://github.com/aryamthecodebreaker/FixMap

## Distribution checklist

Ordered by expected return:

- [ ] **MCP directories** — submit `@aryam/fixmap` (command: `npx -y @aryam/fixmap mcp`): PulseMCP, mcp.so, Glama, Smithery, and a PR to the community list in `modelcontextprotocol/servers`.
- [ ] **Show HN** — Tuesday–Thursday, 8–10am US Eastern. Reply to every comment quickly; that drives ranking.
- [ ] **Reddit** — r/ClaudeAI and r/cursor respond well to MCP tooling; post the Reddit draft, not a bare link.
- [ ] **Awesome lists** — PRs to awesome-claude-code, awesome-mcp-servers, awesome-ai-tools (follow each list's contributing rules).
- [ ] **Dev.to / Hashnode article** — "Why coding agents edit the wrong files, and a deterministic fix" walking through a real FixMap report.
- [ ] **GitHub polish** — pin the repo on your profile; keep the social preview image current.

What actually compounds: answer issues fast, merge small PRs generously, and post a short changelog thread for each release. Stars follow momentum, not one launch.
