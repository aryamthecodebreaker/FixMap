/**
 * The single list of FixMap capabilities. The CLI's `fixmap features`, agent setup
 * text, and the website all read this, so the product and the site cannot drift.
 * `preview` marks work that functions and is tested but may change before v0.10.0.
 */
export type FixMapFeature = {
  readonly name: string;
  readonly command: string;
  readonly detail: string;
  readonly preview?: true;
};

export const FIXMAP_FEATURES: readonly FixMapFeature[] = [
  { name: "Plan", command: "fixmap plan", detail: "Rank context files, test routes, risks, changed files, and uncertainty from a task, issue URL, diff, or working tree." },
  { name: "Impact Graph", command: "fixmap plan", detail: "Map likely dependents, dependencies, tests, and repeated Git co-change relationships around the primary context, with explicit evidence." },
  { name: "Context Pack", command: "fixmap context --issue <task> --budget 10000", detail: "Select task-aware source ranges from primary and impact files within a deterministic token budget." },
  { name: "Graph export", command: "fixmap graph --issue <task> --format mermaid", detail: "Export imports, reverse dependents, routed tests, and co-change evidence as Mermaid or JSON." },
  { name: "Change scope", preview: true, command: "fixmap change-scope --touch <path> [--add <path>]", detail: "Expand explicit planned code surfaces into bounded dependencies, dependents, tests, contracts, decisions, reviewers, and policy evidence without interpreting product requirements." },
  { name: "Reviewer suggestions", preview: true, command: "fixmap reviewers --diff <spec> [--no-history-authors]", detail: "Suggest reviewers per changed path from CODEOWNERS (last matching rule wins), annotation owners, architecture policy, and .mailmap-canonical commit authors; names print without @ and never request reviews or imply availability." },
  { name: "Product capabilities", preview: true, command: "fixmap capability <id>", detail: "Persist human-named product capabilities as reviewed path anchors, rebuild their current implementation map, or diff exact Git refs without checkout; generated conclusions never enter the store." },
  { name: "Cross-repository workspace", preview: true, command: "fixmap workspace --config .fixmap/workspace.json --seed <repository-id>", detail: "Resolve Node, Python, and Maven package identities across local checkouts, then trace provider-to-consumer impact with manifest and import evidence." },
  { name: "Repository Q&A", preview: true, command: "fixmap ask --report <plan.json> --question <text>", detail: "Answer structural context, impact, test, risk, and rationale questions from report evidence only, with citations and explicit unknowns." },
  { name: "Migration planning", preview: true, command: "fixmap migrate --input <migration.json>", detail: "Validate an exact identity graph and explicit steps, then order compatibility windows, tests, rollback points, and blast radius without applying changes." },
  { name: "Plan alternatives", preview: true, command: "fixmap alternatives --input <alternatives.json>", detail: "Compare 2-20 alternative plans on the same graph state, or saved Plan reports, side by side on edits, blast radius, contract compatibility, policy, tests, reversibility and uncertainty; trade-offs are stated from evidence and no winner is picked by score." },
  { name: "Reverse documentation", preview: true, command: "fixmap reverse-docs --input <reverse-docs.json>", detail: "Draft review-only module or architecture Markdown from exact file fingerprints, structural edges, and authored decisions without writing repository files." },
  { name: "Architecture history", preview: true, command: "fixmap history --repo . --from <ref> --to <ref>", detail: "Compare exact committed architecture snapshots without checking out either ref or changing the worktree, including decision disagreements with accepted ADR import rules and a per-commit snapshot cache." },
  { name: "Historical plans", preview: true, command: "fixmap plan --issue <task> --at <ref>", detail: "Rank context files against the repository as it was at a committed ref, read from Git objects without checkout or worktree changes." },
  { name: "Architecture policy", preview: true, command: "fixmap policy init | check | explain <rule-id>", detail: "Enforce import boundaries, required tests, review routing, and forbidden breaking contract changes from .fixmap/policy.json in Plan and Verify; init writes a starter from the module layout without overwriting, check points at each problem with a JSON pointer, and reviewed allowBreaking entries record exceptions." },
  { name: "Agent coordination", preview: true, command: "fixmap intent record --agent <id> --task <text> --edit <path>; fixmap conflicts", detail: "Agents sharing a checkout record expiring intents (files and optional line ranges) in .fixmap/intents/, one atomic file each, and check them for same-file, impact-zone, and contract overlaps before editing; disjoint line ranges are warnings. CLI and MCP; source files are never touched." },
  { name: "Contract Guardian", preview: true, command: "fixmap contracts diff <from>..<to>", detail: "List OpenAPI, AsyncAPI, GraphQL, Protobuf, JSON Schema, and SQL migration contracts, or classify their changes between two exact Git refs as breaking, unknown, or compatible with before/after fingerprints, without checkout." },
  { name: "Supply-chain evidence", preview: true, command: "fixmap supply-chain --input <bundle.json>", detail: "Validate normalized external scanner or SBOM evidence with exact tool, database, document, advisory, version, and license provenance." },
  { name: "Runtime evidence", preview: true, command: "fixmap runtime --input <runtime.json>", detail: "Map redaction-reviewed OpenTelemetry, APM, Speedscope, or pprof observations only through exact repository paths and file fingerprints." },
  { name: "Evidence import", preview: true, command: "fixmap plan --evidence <bundle.json>", detail: "Attach findings from other tools (scanners, CI, runtime monitors) to the files in a plan from a version-1 data-only bundle; claims are shown as supplied and never executed." },
  { name: "Sensitive-data flows", preview: true, command: "fixmap plan --sensitive-data", detail: "Attach possible credential, token, PII, or payment source-to-sink flows (logging, network, storage, analytics) touching a plan's files from local lexical and direct-import evidence; verify --sensitive-data adds an advisory finding when the diff introduces one. Locations and kinds only, never matched values." },
  { name: "Supply-chain in plans", preview: true, command: "fixmap plan --supply-chain <bundle.json>", detail: "Attach imported scanner or SBOM findings for packages declared in manifests among a plan's files, with tool, database, document, and bundle SHA-256 provenance." },
  { name: "Outcome feedback loop", preview: true, command: "fixmap outcome record --report <plan.json> --working-tree", detail: "Save what a plan predicted next to what was edited and which commands passed, one atomic file per record in .fixmap/outcomes/, then calibrate precision and recall; ranking weights never change automatically." },
  { name: "Change dossier", preview: true, command: "fixmap dossier create --report <plan.json> --task <text>", detail: "Save a fingerprinted record linking the request, plan and graph fingerprints, ADRs, diff, command results, and commit/PR identifiers in .fixmap/dossiers/, with optional SHA-256 redaction of the task text." },
  { name: "Execution sandbox", preview: true, command: "fixmap sandbox --request <sandbox.json> --execute-declared-command", detail: "Run exactly one reviewed command in an already-present digest-pinned Docker image with network off and source/root read-only by default." },
  { name: "Explain", command: "fixmap plan --explain <path>", detail: "Show whether a path ranked, tied below the limit, was excluded, or was never scanned." },
  { name: "Compare", command: "fixmap plan --compare <report.json>", detail: "Compare a refined task and current plan with an earlier JSON report." },
  { name: "Verify", command: "fixmap verify --report <report.json>", detail: "Compare the completed diff or working tree with the saved plan; add --fail-on warning for a strict CI gate." },
  { name: "Validate", command: "fixmap validate <artifact.json>", detail: "Check a saved report, dossier, outcome, store, policy, workspace config or map, agent intent, or evidence bundle against FixMap's versioned compatibility contract; artifacts from a newer FixMap are rejected with an upgrade message, and real artifacts from 0.9.0, 0.9.5 and 0.9.7 are tested to stay readable." },
  { name: "Doctor", command: "fixmap doctor", detail: "Diagnose stale local, global, PATH, and npx install shadows." },
  { name: "MCP", command: "fixmap mcp", detail: "Expose Plan, Context, Graph, Change Scope, Reviewers, Capability maps, Workspace, Ask, Migrate, Alternatives, Reverse Docs, History, Contracts, Supply Chain, Runtime, Outcomes, Dossiers, Explain, Compare, Verify, and Doctor over local stdio." },
  { name: "Public tasks", command: "fixmap owner/repository#123", detail: "Fetch public GitHub issue or pull-request text anonymously and scan its repository in an isolated checkout." },
  { name: "Repository sources", command: "--repo <path|url> --ref <branch|tag>", detail: "Map a local checkout, file URL, directory archive, or a named branch or tag from a public GitHub repository." },
  { name: "Task files", command: "--issue-file <file|->", detail: "Read long task text from UTF-8, UTF-16, or stdin, including BOM-less UTF-16 from common Windows tools." },
  { name: "Focus", command: "--limit, --exclude, .fixmapignore", detail: "Narrow ranking without changing the repository." },
  { name: "Live changes", command: "--working-tree --include-untracked", detail: "Map staged, unstaged, and optionally untracked work against HEAD." },
  { name: "Fresh scan", command: "--no-cache", detail: "Bypass the exact git-state cache with CLI --no-cache, MCP noCache: true, or Action no-cache: true, and report that a fresh scan was used." },
  { name: "Local hybrid retrieval", preview: true, command: "--semantic-model <dir>", detail: "Opt into structural + BM25 + local embedding rank fusion with a pre-existing model directory; model loading is local-files-only and source is never uploaded." },
  { name: "Machine output", command: "--format json --output <file>", detail: "Emit a versioned JSON contract or readable Markdown without executing repository code." },
  { name: "Compact agent output", command: "--format agent", detail: "Emit EDIT CANDIDATE, INSPECT, TEST, RISK, AVOID, and UNCERTAINTY sections for a small context window." },
  { name: "Repository benchmark", command: "fixmap benchmark --repo . --last 50", detail: "Backtest BM25, FixMap, and Impact Graph on historical parent snapshots with history cut off before each target change." },
  { name: "Watch", command: "fixmap watch --report plan.json --repo .", detail: "Continuously verify working-tree drift and recalculate impact as an agent edits." },
  { name: "Annotations", command: "fixmap annotate <file> --note <text>", detail: "Attach reviewable file, symbol, service, or contract knowledge with optional ownership and expiry; relevant active or stale notes surface in plans." },
  { name: "Test routing", command: "fixmap plan", detail: "Detect package, workspace, and language test commands, related tests, and skipped or gated suites." },
  { name: "Risk and diagnostics", command: "fixmap plan", detail: "Report bounded risk areas, grounding quality, unread content, scan limits, package-manager conflicts, and unresolved diffs." },
  { name: "GitHub Action", command: "uses: aryamthecodebreaker/FixMap@<version>", detail: "Plan or verify pull requests with bounded summaries, outputs, and one updated comment." },
  { name: "Agent setup", command: "fixmap setup --agent <name|all>", detail: "Explicitly install the discoverable /fixmap command for Claude Code, Cursor, GitHub Copilot, or Agent Skills; bare setup is preview-only." }
];
