# @aryam/fixmap

**Give your coding agent a map before it starts editing.**

FixMap turns an issue, prompt, or git diff into ranked context files, test routes, and risk notes — locally, with no account or API key. Nothing leaves your machine.

## Quick start

Run from a JavaScript or TypeScript repository:

```bash
npx @aryam/fixmap plan --issue "password reset emails fail"
```

Use a real branch diff:

```bash
npx @aryam/fixmap plan --diff main...HEAD
```

Machine-readable output:

```bash
npx @aryam/fixmap plan --base main --head HEAD --format json --output fixmap-report.json
```

## MCP server

FixMap ships as a Model Context Protocol server, so coding agents can request a plan themselves. One tool is exposed: `fixmap_plan`.

Claude Code:

```bash
claude mcp add fixmap -- npx -y @aryam/fixmap mcp
```

Cursor, Windsurf, or any MCP client:

```json
{
  "mcpServers": {
    "fixmap": {
      "command": "npx",
      "args": ["-y", "@aryam/fixmap", "mcp"]
    }
  }
}
```

## Options

```text
fixmap plan            Generate a FixMap report for a task or diff
fixmap mcp             Run FixMap as an MCP server over stdio

--issue <text>         Issue, prompt, or task description
--diff <spec>          Git diff spec, such as main...HEAD
--base <ref>           Base ref for diffing when --diff is not given
--head <ref>           Head ref for diffing (defaults to HEAD)
--repo <path>          Repository root to scan (defaults to current directory)
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
- [Live demo](https://fixmap-flax.vercel.app)
- [Changelog](https://github.com/aryamthecodebreaker/FixMap/blob/main/CHANGELOG.md)

MIT © FixMap contributors.
