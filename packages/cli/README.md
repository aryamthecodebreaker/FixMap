# @aryam/fixmap

**Give your coding agent a map before it starts editing.**

FixMap turns an issue, prompt, or git diff into ranked context files, test routes, and risk notes — with no account or API key and no source upload.

## Quick start

Install FixMap once, then paste a public GitHub issue URL. FixMap fetches its task context and infers the repository:

```bash
npm install --global @aryam/fixmap@latest
fixmap plan --issue https://github.com/chalk/chalk/issues/624
```

Or supply your own task and public repository:

```bash
fixmap plan \
  --issue "support public GitHub issue URLs" \
  --repo https://github.com/aryamthecodebreaker/FixMap
```

For private source or working-tree changes, run from a local JavaScript or TypeScript repository:

```bash
fixmap plan --issue "password reset emails fail"
```

Install a discoverable `/fixmap` command for supported coding agents, then invoke it without a task to see the complete workflow menu:

```bash
fixmap setup
fixmap features
```

`fixmap setup` supports Claude Code, Cursor, GitHub Copilot prompt files, and the open Agent Skills layout. It preflights every target, is idempotent, and refuses to overwrite customized commands unless you explicitly pass `--force` after reviewing them.

Use a real branch diff:

```bash
fixmap plan --diff main...HEAD
```

Machine-readable output:

```bash
fixmap plan --base main --head HEAD --format json --output fixmap-report.json
```

Public GitHub issue, pull request, and repository URL modes are available in the CLI and MCP server for issue-only analysis. FixMap fetches task context anonymously, shallow-clones the default branch into an isolated temporary directory, disables credentials and repository execution surfaces, and removes the checkout before returning. Clone locally to use `--diff`, `--base`, `--head`, or working-tree inputs.

For long task text, use `--issue-file task.md` or pipe text to `--issue -`. A leading `@` in `--issue` is ordinary task text; only the explicit file flag reads from disk. A one-off `npx -y @aryam/fixmap@latest ...` run is also available, but npm may choose an existing project-local FixMap first. Run `fixmap doctor`, treat its printed running version as authoritative, and update or remove a stale install. For a reproducible clean test, install the exact version into an isolated npm prefix and invoke that prefix's `fixmap` shim directly; the repository README includes complete PowerShell and POSIX commands.

## Complete feature catalog

- **Plan** — rank context files, related tests, test commands, risks, changed files, diagnostics, grounding, confidence, and a next action from task text, a task file, stdin, a public GitHub issue or pull request, a branch diff, or the working tree.
- **Explain** — use `--explain <path>` to distinguish ranked, below-cutoff, tie-truncated, excluded, and not-scanned paths.
- **Compare** — use `--compare <report.json>` to measure how a refined task changed ranks, scores, confidence, and grounding.
- **Verify** — compare a saved plan with the completed diff or working tree; FixMap reports drift but does not pretend to run tests or prove correctness.
- **Validate** — run `fixmap validate <report.json>` to check report compatibility without writing custom JavaScript.
- **Focus controls** — cap output with `--limit`, repeat `--exclude`, or use ordered `.fixmapignore` patterns with negation. Pasted absolute paths inside the repository are normalized, and unmatched patterns produce a warning.
- **Live changes** — `--working-tree` maps staged and unstaged tracked edits; `--include-untracked` opts new files into the changed-file set.
- **Exact-state cache** — clean and tracked dirty git states are cached by repository, commit, status, and binary diff. Cache hits report age, entries expire after seven days, and `--no-cache` reports a fresh bypass.
- **Artifact isolation** — current issue, comparison, verification, and output files are removed from ranking, change detection, and cache state, so a saved plan cannot recommend or invalidate itself.
- **Doctor** — report the running version, resolved binary, global/PATH shadows, Node compatibility, and an optionally requested npm version.
- **MCP** — expose Plan, Explain, Compare, Verify, and Doctor as five local stdio tools.
- **Slash-command discovery** — `fixmap setup` installs `/fixmap`; `fixmap features` prints the same complete catalog in Markdown or JSON.
- **Safe repository handling** — public repositories use isolated temporary checkouts with credentials, hooks, filters, and submodule recursion disabled. Local source is read without installing dependencies or running repository scripts.
- **Human and machine output** — Markdown is the default; JSON reports carry `reportVersion: 1` and follow the documented additive compatibility policy.

## MCP server

FixMap ships five Model Context Protocol tools: `fixmap_plan`, `fixmap_explain`, `fixmap_compare`, `fixmap_verify`, and `fixmap_doctor`. Plan, Explain, and Verify accept `noCache: true` when an agent needs a fresh repository scan rather than an exact-state cache hit.

Claude Code:

```bash
claude mcp add fixmap -- fixmap mcp
```

Cursor, Windsurf, or any MCP client:

```json
{
  "mcpServers": {
    "fixmap": {
      "command": "fixmap",
      "args": ["mcp"]
    }
  }
}
```

## Options

```text
fixmap plan            Generate a FixMap report for a task or diff
fixmap verify          Compare a saved plan with the diff that followed
fixmap doctor          Report the resolved version and any shadowing install
fixmap validate        Validate a saved FixMap JSON report
fixmap features        List every FixMap capability in Markdown or JSON
fixmap setup           Install /fixmap discovery for supported coding agents
fixmap mcp             Run FixMap as an MCP server over stdio

--issue <text|url>     Issue text, task description, or public GitHub issue or pull request URL
--issue-file <file>    Read task text from a UTF-8 or UTF-16 file, or - for stdin
--diff <spec>          Git diff spec, such as main...HEAD
--base <ref>           Base ref for diffing when --diff is not given
--head <ref>           Head ref for diffing (defaults to HEAD)
--working-tree         Map staged and unstaged tracked changes against HEAD
--include-untracked    With --working-tree, count untracked files as changed
--explain <path>       Explain why one path ranked where it did, or did not appear
--compare <file>       Diff this plan against a saved JSON plan
--limit <n>            Cap reported context files, 1 to 20 (default 8)
--exclude <pattern>    Leave paths out of ranking; repeatable, gitignore-flavored
--no-cache             Bypass the exact-state repository scan cache
--repo <source>        Local path, file:// URL, or public GitHub HTTPS/SSH URL
--format <fmt>         Output format: markdown (default) or json
--output <file>        Write the report to a file instead of stdout
```

## Example output

```text
## Context Files
- src/auth/reset-password.ts (high confidence): path and content match

## Test Route
- npm --prefix apps/api run test

## Risk Map
- high authentication: authentication-related files are affected
```

## Links

- [GitHub repository](https://github.com/aryamthecodebreaker/FixMap)
- [Live demo](https://usefixmap.vercel.app)
- [Changelog](https://github.com/aryamthecodebreaker/FixMap/blob/main/CHANGELOG.md)

MIT © FixMap contributors.
