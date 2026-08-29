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
fixmap setup --agent all
fixmap features
```

Bare `fixmap setup` is a read-only workflow preview. `fixmap setup --agent all` supports Claude Code, Cursor, GitHub Copilot prompt files, and the open Agent Skills layout. It preflights every target, is idempotent, and refuses to overwrite customized commands unless you explicitly pass `--force` after reviewing them.

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

Map package dependencies and downstream impact across local repositories:

```bash
fixmap workspace --config .fixmap/workspace.json --seed auth --format json
```

The JSON config uses `"workspaceConfigVersion": 1`, a stable `workspace` name, and 1–32 `{ "id", "path" }` repository entries. Paths are relative to the config file. Optional submodule entries use `relationship: { "kind": "submodule", "parentRepository": "auth", "path": "vendor/contracts" }`. FixMap scans at most four checkouts concurrently, never executes their code, and resolves Node, Python, and Maven package/version identities plus manifest/import evidence.

Continuously compare agent edits with a saved plan and recalculate impact:

```bash
fixmap watch --report plan.json --repo . --include-untracked
```

Attach durable, reviewable knowledge to a file (symbol, service, and contract scopes are also supported):

```bash
fixmap annotate src/auth/token.ts --note "Do not refactor; external contract" --owner platform-team
fixmap annotate --list
```

Ask a structural question from a saved report without source access or a model call:

```bash
fixmap ask --report plan.json --question "Why does this code exist?"
```

Answers cite exact report evidence, retain unknowns, and explicitly mark claims unverified. The deterministic CLI and MCP workflow can answer context, impact, test, risk/policy, and authored-rationale questions; it does not interpret source code.

Build dependency-ordered, review-only migration phases from explicit edits, compatibility windows, tests, and rollback points tied to one exact identity graph:

```bash
fixmap migrate --input migration.json --format markdown
```

See the repository's checked-in `examples/migration-plan/migration.json` for the versioned input shape. Migration planning never executes commands, edits source, or authorizes rollout.

Draft review-only module or architecture documentation from exact file fingerprints, an architecture snapshot, authored decisions, and explicit targets:

```bash
fixmap reverse-docs --input examples/reverse-documentation/input.json --format markdown
```

The drafts separate observations, inferences, unknowns, and provenance. Requested destinations remain advisory; the command never writes or overwrites repository documentation.

Compare exact committed architecture snapshots without checking out either ref:

```bash
fixmap history --repo . --from v0.9.0 --to HEAD --coupling-delta 2
```

History reports immutable commit IDs, added and removed edges, new and resolved cycles or boundary violations, and coupling growth while leaving HEAD and the worktree unchanged.

Import normalized external scanner or SBOM evidence with exact provenance:

```bash
fixmap supply-chain --input examples/supply-chain/bundle.json
```

The versioned report retains package, advisory, fix-version, license, tool/database, timestamp, and document-fingerprint evidence. It does not claim FixMap fetched or verified the vulnerability corpus, executed the scanner, proved exploitability, or authorized remediation.

Map redaction-reviewed OpenTelemetry, normalized APM, Speedscope, or pprof observations to exact file fingerprints:

```bash
fixmap runtime --input examples/runtime-evidence/input.json
```

Every mapped record requires an explicit repository ID and safe repository-relative path. Unmapped evidence stays visible, and the report never equates span duration with CPU time, profile samples with wall-clock time, or correlation with causality.

Run exactly one declared command in an already-present digest-pinned Docker image:

```bash
fixmap sandbox --request sandbox.json --execute-declared-command
```

The version-1 request contains `executionId`, an absolute `repoRoot`, `image`, `command`, `declaredCommands`, optional bounded `limits`, and optional `network: { "enabled": true }`. Consent is accepted only from the command line; network also requires `--allow-sandbox-network`. Source and container root are read-only, image pulls and inherited container environment are disabled, and failures never count as passes.

Public GitHub issue, pull request, and repository URL modes are available in the CLI and MCP server for issue-only analysis. FixMap fetches task context anonymously, shallow-clones the default branch into an isolated temporary directory, disables credentials and repository execution surfaces, and removes the checkout before returning. Clone locally to use `--diff`, `--base`, `--head`, or working-tree inputs.

For long task text, use `--issue-file task.md`, pipe it directly to `fixmap plan`, or use explicit stdin with `--issue-file -` / `--issue -`. A leading `@` in `--issue` is ordinary task text; only the explicit file flag reads from disk. A one-off `npx -y @aryam/fixmap@latest ...` run is also available, but npm may choose an existing project-local FixMap first. Run `fixmap doctor`, treat its printed running version as authoritative, and update or remove a stale install. For a reproducible clean test, install the exact version into an isolated npm prefix and invoke that prefix's `fixmap` shim directly; the repository README includes complete PowerShell and POSIX commands.

## Complete feature catalog

- **Plan** — rank primary context, then map likely impact from imports, reverse dependents, related tests, and repeated Git co-change relationships. Impact paths are inspection candidates, not assumed edits.
- **Polyglot project scope** — Go, Rust, Ruby, PHP, and .NET use bounded language adapters. Go follows longest-prefix modules and explicit local `go.work` membership; Rust follows literal local Cargo path dependencies, renamed/workspace-inherited aliases, and exact path modules; Ruby test routing distinguishes scoped RSpec and Minitest evidence and fails closed for a bare Gemfile or mixed ambiguity, while Rails constant autoloading requires both gem and application-class evidence and stays inside the owning project. Composer PSR-4/classmap evidence resolves PHP paths; test routing requires a declared script, an explicit Pest dependency, or PHPUnit evidence, and Pest bootstrap files never count as related tests. Literal .NET `ProjectReference` plus symbol-backed project/source global-using evidence scopes namespace impact; one test project routes directly, while multiple test projects route only through one uniquely matching literal `.sln`.
- **Context Pack** — use `fixmap context` to package deterministic line ranges from primary and impact files within an estimated source-token budget. Markdown is readable by people and agents; JSON preserves roles, reasons, line ranges, truncation, and omitted-file diagnostics.
- **Graph export** — use `fixmap graph` to export the evidence-backed Impact Graph as portable Mermaid or versioned JSON while preserving relationship direction.
- **Change scope** — use `fixmap change-scope --touch <path> [--add <path>]` to expand only caller-selected product work surfaces over bounded dependencies/dependents, then join existing tests, contracts, decisions, reviewers, and policy evidence. Missing additions remain unresolved; no product semantics are inferred.
- **Product capabilities** — use `fixmap capability create|update|remove` to maintain a locked, atomic `.fixmap/capabilities.json` of human names, explicit anchors, and bounds; use `fixmap capability <id>` or `fixmap capabilities` to rebuild/show current evidence. `fixmap capability diff <id> <from>..<to>` compares exact immutable Git objects without checkout mutation. Generated conclusions are never stored.
- **Cross-repository workspace** — use `fixmap workspace --config <file> --seed <repository-id>` to resolve local Node, Python, and Maven package providers and trace downstream consumers with versioned identity, manifest, import, and submodule evidence.
- **Repository Q&A** — use `fixmap ask --report <plan.json> --question <text>` to answer structural context, impact, test, risk, policy, ADR, and annotation questions from bounded report evidence with citations and explicit unknowns.
- **Migration planner** — use `fixmap migrate --input <migration.json>` to validate and render dependency phases, blast radius, compatibility, verification, and rollback without executing or applying the plan.
- **Reverse documentation** — use `fixmap reverse-docs --input <reverse-docs.json>` to create review-only module or architecture drafts from exact structural evidence without writing the requested destination.
- **Architecture history** — use `fixmap history --repo . --from <ref> --to <ref>` to compare immutable committed snapshots without checkout or worktree mutation.
- **Supply-chain evidence** — use `fixmap supply-chain --input <bundle.json>` to validate normalized package/security/license evidence without executing a scanner or inventing advisory truth.
- **Runtime evidence** — use `fixmap runtime --input <runtime.json>` to map redaction-reviewed traces and profiles only through exact repository paths and fingerprints.
- **Execution sandbox** — use `fixmap sandbox --request <sandbox.json> --execute-declared-command` to run one exact reviewed command with a pinned local image, network off, read-only source/root, and resource limits.
- **Explain** — use `--explain <path>` to distinguish ranked, below-cutoff, tie-truncated, excluded, and not-scanned paths.
- **Compare** — use `--compare <report.json>` to measure how a refined task changed ranks, scores, confidence, and grounding.
- **Verify** — compare a saved plan with the completed diff or working tree and recalculate impact around the files actually changed; errors fail by default and `--fail-on warning` provides an opt-in strict CI gate without pretending FixMap ran tests or proved correctness.
- **Repository benchmark** — use `fixmap benchmark --repo . --last 50` to compare BM25, FixMap, and Impact Graph on identical parent-snapshot corpora. Primary hits use maintained source rather than generated twins, and repository code is never executed.
- **Watch** — use `fixmap watch --report plan.json --repo .` to emit drift findings and a recalculated Impact Graph whenever the working tree changes. JSON format is newline-delimited for agent consumers.
- **Human intent** — use `fixmap annotate` to maintain atomic `.fixmap/annotations.json` records for files, symbols, services, and contracts. Relevant notes, expiry, and rename/missing-target state surface with the exact store fingerprint; repository ADR/RFC/design records surface their authored decision text and provenance alongside them.
- **Validate** — run `fixmap validate <report.json>` to check report compatibility without writing custom JavaScript.
- **Focus controls** — cap output with `--limit` from 1 to 20, repeat `--exclude`, or use ordered `.fixmapignore` patterns with negation. Pasted absolute paths inside the repository are normalized, and unmatched patterns produce a warning.
- **Live changes** — `--working-tree` maps staged and unstaged tracked edits; `--include-untracked` opts new files into the changed-file set.
- **Exact-state cache** — clean and tracked dirty git states are cached by repository, commit, status, and binary diff. Cache hits report age, entries expire after seven days, and `--no-cache` reports a fresh bypass.
- **Opt-in local hybrid retrieval** — `--semantic-model <dir>` fuses structural, BM25, and cosine ranks while retaining each signal and model provenance. The model must already exist locally; FixMap forces local-files-only loading, persists model-isolated vectors outside the repository, and never uploads source. FixMap does not bundle the optional Transformers.js runtime, so install a compatible version in the host only after auditing its dependency tree.
- **Artifact isolation** — current issue, comparison, verification, and output files are removed from ranking, change detection, and cache state, so a saved plan cannot recommend or invalidate itself.
- **Doctor** — report the running version, resolved binary, global/PATH shadows, Node compatibility, and an optionally requested npm version.
- **MCP** — expose Plan, Context, Graph, Workspace, Ask, Migrate, Reverse Docs, History, Supply Chain, Runtime, Explain, Compare, Verify, and Doctor as fourteen local stdio tools.
- **Slash-command discovery** — `fixmap setup` previews without writes, `fixmap setup --agent all` installs `/fixmap`, and `fixmap features` prints the same complete catalog in Markdown or JSON.
- **Safe repository handling** — public repositories use isolated temporary checkouts with credentials, hooks, filters, and submodule recursion disabled. Local source is read without installing dependencies or running repository scripts.
- **Human, agent, and machine output** — Markdown is the default; `--format agent` is a compact handoff, and JSON reports carry `reportVersion: 1` with the documented additive compatibility policy.

## MCP server

FixMap ships fourteen Model Context Protocol tools: `fixmap_plan`, `fixmap_context`, `fixmap_graph`, `fixmap_workspace`, `fixmap_ask`, `fixmap_migrate`, `fixmap_reverse_docs`, `fixmap_history`, `fixmap_supply_chain`, `fixmap_runtime`, `fixmap_explain`, `fixmap_compare`, `fixmap_verify`, and `fixmap_doctor`. Plan, Context, Graph, Workspace, Explain, and Verify accept `noCache: true` when an agent needs a fresh repository scan rather than an exact-state cache hit.

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
fixmap workspace       Map package dependencies and impact across local repositories
fixmap ask             Answer report-only structural questions with citations
fixmap migrate         Build a dependency-ordered, review-only migration plan
fixmap reverse-docs    Draft review-only documentation from exact structural evidence
fixmap history         Compare architecture at two committed refs without checkout
fixmap supply-chain    Import normalized external scanner and SBOM evidence
fixmap runtime         Map redaction-reviewed runtime evidence to exact files
fixmap sandbox         Run one explicitly consented command in an isolated container
fixmap change-scope    Expand explicit planned paths into structural consequences
fixmap capability      Create, update, remove, or show one product capability
fixmap capabilities    List persistent product capability definitions
fixmap verify          Compare a saved plan with the diff that followed
fixmap benchmark       Backtest BM25, FixMap, and Impact Graph on local Git history
fixmap watch           Recheck working-tree drift and impact whenever edits change
fixmap annotate        Add, list, or remove reviewable repository knowledge
fixmap doctor          Report the resolved version and any shadowing install
fixmap validate        Validate a saved FixMap JSON report
fixmap features        List every FixMap capability in Markdown or JSON
fixmap setup           Preview workflows without writing files; add --agent to install
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
