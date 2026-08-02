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

Use a real branch diff:

```bash
fixmap plan --diff main...HEAD
```

Machine-readable output:

```bash
fixmap plan --base main --head HEAD --format json --output fixmap-report.json
```

Public GitHub issue, pull request, and repository URL modes are available in the CLI and MCP server for issue-only analysis. FixMap fetches task context anonymously, shallow-clones the default branch into an isolated temporary directory, disables credentials and repository execution surfaces, and removes the checkout before returning. Clone locally to use `--diff`, `--base`, `--head`, or working-tree inputs.

For long task text, use `--issue-file task.md`, `--issue @task.md`, or pipe text to `--issue -`. A one-off `npx -y @aryam/fixmap@latest ...` run is also available, but npm may choose an existing project-local FixMap first. Run `fixmap doctor`, treat its printed running version as authoritative, and update or remove a stale install. For a reproducible clean test, install the exact version into an isolated npm prefix and invoke that prefix's `fixmap` shim directly; the repository README includes complete PowerShell and POSIX commands.

## MCP server

FixMap ships as a Model Context Protocol server with `fixmap_plan` and `fixmap_verify`, so coding agents can plan first and compare the resulting diff with that plan afterwards.

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
