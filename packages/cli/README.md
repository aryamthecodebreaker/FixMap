# @aryam/fixmap

**Give your coding agent a map before it starts editing.**

FixMap turns an issue, prompt, or git diff into ranked context files, test routes, and risk notes — with no account or API key and no source upload.

## Quick start

Try a public GitHub repository without cloning it first:

```bash
npx -y @aryam/fixmap plan \
  --issue "support public GitHub repository inputs" \
  --repo https://github.com/aryamthecodebreaker/FixMap
```

Or run from a local JavaScript or TypeScript repository:

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

Public GitHub URL mode is available in the CLI and MCP server for issue-only analysis. FixMap anonymously shallow-clones the default branch into an isolated temporary directory, disables credentials and repository execution surfaces, and removes the checkout before returning. Clone locally to use `--diff`, `--base`, or `--head`.

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
--repo <source>        Local path or public GitHub HTTPS URL
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
