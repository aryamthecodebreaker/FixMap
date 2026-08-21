# @aryam/fixmap

**Give your coding agent a map before it starts editing.**

FixMap turns an issue, prompt, or git diff into ranked primary context, an evidence-backed Impact Graph, test routes, and risk notes — with no account or API key and no source upload.

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

# Optional: add an existing on-device embedding model to structural + BM25 ranking
fixmap plan --issue "keep signed-in users active" --semantic-model C:\models\all-MiniLM-L6-v2
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

Compact output for an agent context window:

```bash
fixmap plan --issue "password reset emails fail" --format agent
```

Backtest BM25, FixMap, and Impact Graph against pre-change snapshots from your own repository:

```bash
fixmap benchmark --repo . --last 50
```

Build a deterministic source pack for an agent, bounded by an estimated source-token budget:

```bash
fixmap context --issue "password reset emails fail" --budget 10000
```

Export the Impact Graph for an issue as Mermaid or JSON:

```bash
fixmap graph --issue "password reset emails fail" --format mermaid
```

Continuously compare agent edits with a saved plan and recalculate impact:

```bash
fixmap watch --report plan.json --repo . --include-untracked
```

Public GitHub issue, pull request, and repository URL modes are available in the CLI and MCP server for issue-only analysis. FixMap fetches task context anonymously, shallow-clones the default branch into an isolated temporary directory, disables credentials and repository execution surfaces, and removes the checkout before returning. Clone locally to use `--diff`, `--base`, `--head`, or working-tree inputs.

For long task text, use `--issue-file task.md` or pipe text to `--issue -`. A leading `@` in `--issue` is ordinary task text; only the explicit file flag reads from disk. A one-off `npx -y @aryam/fixmap@latest ...` run is also available, but npm may choose an existing project-local FixMap first. Run `fixmap doctor`, treat its printed running version as authoritative, and update or remove a stale install. For a reproducible clean test, install the exact version into an isolated npm prefix and invoke that prefix's `fixmap` shim directly; the repository README includes complete PowerShell and POSIX commands.

## Complete feature catalog

- **Plan** — rank primary context, then map likely impact from imports, reverse dependents, related tests, and repeated Git co-change relationships. Impact paths are inspection candidates, not assumed edits.
- **Context Pack** — use `fixmap context` to package deterministic line ranges from primary and impact files within an estimated source-token budget. Markdown is readable by people and agents; JSON preserves roles, reasons, line ranges, truncation, and omitted-file diagnostics.
- **Graph export** — use `fixmap graph` to export the evidence-backed Impact Graph as portable Mermaid or versioned JSON while preserving relationship direction.
- **Explain** — use `--explain <path>` to distinguish ranked, below-cutoff, tie-truncated, excluded, and not-scanned paths.
- **Compare** — use `--compare <report.json>` to measure how a refined task changed ranks, scores, confidence, and grounding.
- **Verify** — compare a saved plan with the completed diff or working tree and recalculate impact around the files actually changed; errors fail by default and `--fail-on warning` provides an opt-in strict CI gate without pretending FixMap ran tests or proved correctness.
- **Repository benchmark** — use `fixmap benchmark --repo . --last 50` to compare BM25, FixMap, and Impact Graph on identical parent-snapshot corpora. Primary hits use maintained source rather than generated twins, and repository code is never executed.
- **Watch** — use `fixmap watch --report plan.json --repo .` to emit drift findings and a recalculated Impact Graph whenever the working tree changes. JSON format is newline-delimited for agent consumers.
- **Validate** — run `fixmap validate <report.json>` to check report compatibility without writing custom JavaScript.
- **Focus controls** — cap output with `--limit`, repeat `--exclude`, or use ordered `.fixmapignore` patterns with negation. Pasted absolute paths inside the repository are normalized, and unmatched patterns produce a warning.
- **Live changes** — `--working-tree` maps staged and unstaged tracked edits; `--include-untracked` opts new files into the changed-file set.
- **Exact-state cache** — clean and tracked dirty git states are cached by repository, commit, status, and binary diff. Cache hits report age, entries expire after seven days, and `--no-cache` reports a fresh bypass.
- **Opt-in local hybrid retrieval** — `--semantic-model <dir>` fuses structural, BM25, and cosine ranks while retaining each signal and model provenance. The model must already exist locally; FixMap forces local-files-only loading, persists model-isolated vectors outside the repository, and never uploads source. FixMap does not bundle the optional Transformers.js runtime, so install a compatible version in the host only after auditing its dependency tree.
- **Artifact isolation** — current issue, comparison, verification, and output files are removed from ranking, change detection, and cache state, so a saved plan cannot recommend or invalidate itself.
- **Doctor** — report the running version, resolved binary, global/PATH shadows, Node compatibility, and an optionally requested npm version.
- **MCP** — expose Plan, Context, Graph, Explain, Compare, Verify, and Doctor as seven local stdio tools.
- **Slash-command discovery** — `fixmap setup` installs `/fixmap`; `fixmap features` prints the same complete catalog in Markdown or JSON.
- **Safe repository handling** — public repositories use isolated temporary checkouts with credentials, hooks, filters, and submodule recursion disabled. Local source is read without installing dependencies or running repository scripts.
- **Human, agent, and machine output** — Markdown is the default; `--format agent` is a compact handoff, and JSON reports carry `reportVersion: 1` with the documented additive compatibility policy.

## MCP server

FixMap ships seven Model Context Protocol tools: `fixmap_plan`, `fixmap_context`, `fixmap_graph`, `fixmap_explain`, `fixmap_compare`, `fixmap_verify`, and `fixmap_doctor`. Plan, Context, Graph, Explain, and Verify accept `noCache: true` when an agent needs a fresh repository scan rather than an exact-state cache hit.

Context budgets use a deterministic estimate of one token per four UTF-8 bytes of source. Metadata does not consume that source budget. Scanner sample limits are reported per snippet with `sourceTruncated`, so consumers can distinguish a complete file from a bounded sample.

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
fixmap context         Build a budgeted Markdown or JSON source pack
fixmap graph           Export the Impact Graph as Mermaid or JSON
fixmap verify          Compare a saved plan with the diff that followed
fixmap benchmark       Backtest BM25, FixMap, and Impact Graph on local Git history
fixmap watch           Recheck working-tree drift and impact whenever edits change
fixmap doctor          Report the resolved version and any shadowing install
fixmap validate        Validate a saved FixMap JSON report
fixmap features        List every FixMap capability in Markdown or JSON
fixmap setup           Install /fixmap discovery for supported coding agents
fixmap mcp             Run FixMap as an MCP server over stdio

--issue <text|url>     Issue text, task description, or public GitHub issue or pull request URL
--issue-file <file>    Read UTF-8/UTF-16 task text (including BOM-less UTF-16), or - for stdin
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
--semantic-model <dir> Use a pre-existing local embedding model; never download or upload source
--repo <source>        Local path, file:// URL, or public GitHub HTTPS/SSH URL
--format <fmt>         Plan: markdown, agent, or json; context: markdown or json; graph: mermaid or json
--budget <tokens>      Context estimated source-token budget, 256 to 200000 (default 10000)
--output <file>        Write the report to a file instead of stdout
--fail-on <level>      Verify exit policy: error (default) or warning
```

## Example output

```text
## Context Files
- src/auth/reset-password.ts (high confidence): path and content match

## Impact Graph
- src/session.ts (high confidence): imported by the primary edit candidate

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
