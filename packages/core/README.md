# @aryam/fixmap-core

Core repository scanner, ranker, and report renderer for [FixMap](https://github.com/aryamthecodebreaker/FixMap). Zero dependencies.

Most users want the CLI and MCP server instead: [`@aryam/fixmap`](https://www.npmjs.com/package/@aryam/fixmap).

## Usage

```ts
import {
  buildContextPack,
  buildFixMapGraph,
  buildFixMapReport,
  renderAgentReport,
  renderContextPackMarkdown,
  renderFixMapGraphMermaid,
  renderMarkdownReport,
  scanRepo
} from "@aryam/fixmap-core";

const report = await buildFixMapReport({
  repoRoot: "/path/to/repo",
  issueText: "password reset emails fail"
});

console.log(renderMarkdownReport(report));
console.log(renderAgentReport(report));

const repo = await scanRepo({ repoRoot: "/path/to/repo", includeHistory: true });
console.log(renderContextPackMarkdown(buildContextPack({ report, repo, task: "password reset emails fail", budgetTokens: 10_000 })));
console.log(renderFixMapGraphMermaid(buildFixMapGraph(report)));
```

`buildFixMapReport` runs the full pipeline: scan the repository, resolve exclusions, rank primary context against the task, build a separate likely-impact view, route to relevant test commands, and collect risk notes and diagnostics. Impact evidence includes imports, reverse dependents, routed tests, and repeated bounded Git co-change relationships; it is explicitly an inspection aid rather than a claim that every related file must change. Exact git states can reuse a seven-day scan cache, while `useCache: false` forces a fresh scan and reports the bypass.

The package also exports the lower-level scanner, excluder, ranker, BM25 retriever, grounding, import graph, Context Pack and Impact Graph builders, test routing, risk, comparison, explanation, verification, structural validation, and Markdown/JSON/agent/Mermaid rendering APIs. Context budgets use the deterministic estimate `ceil(UTF-8 bytes / 4)` for source and report sample truncation explicitly.

The v0.10 graph API exposes `createGraphIdentity`, explicit `createGraphEquivalence` relationships, deterministic `buildIdentityGraph` snapshots, `buildGraphDependencyIndex`, and `invalidateIdentityGraph`. Identities cover repository, service, package, module, file, symbol, contract, runtime component, and deployment. `buildWorkspaceMap` uses exact `RepoFile.contentFingerprint` values to link Node, Python, and Maven repositories without guessing that similarly named entities are equivalent. `@aryam/fixmap-core/browser` exposes these filesystem-free workspace and identity primitives alongside report, Context Pack, Impact Graph, Compare, Explain, Verify, validation, and rendering logic for browser applications.

Contract Guardian starts with `inventoryContracts` and `compareContractInventories`: it normalizes OpenAPI, AsyncAPI, GraphQL, Protobuf, JSON Schema, and SQL migrations into deterministic compatibility entries, retains exact before/after fingerprints, and can emit owned contract nodes through `contractGraphNodes`. Findings distinguish compatible, breaking, and unknown changes; incomplete scanner content is diagnosed instead of treated as an absent contract.

Human intent is represented by versioned annotations and authored decision records. `inventoryDecisionRecords` preserves ADR/RFC/design Context, Decision, Consequences, status, date, supersession, explicit scopes, and exact source fingerprints; `selectDecisionRecords` attaches only relevant records. Literal path mentions count only when that path exists in the scanned snapshot, and FixMap never rewrites generated prose as the author’s rationale.

JSON reports use `reportVersion: 1`. Additive fields and diagnostic codes may appear within that version; consumers should ignore unknown fields and use diagnostic severity as the stable fallback.

MIT © FixMap contributors.
