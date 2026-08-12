# @aryam/fixmap-core

Core repository scanner, ranker, and report renderer for [FixMap](https://github.com/aryamthecodebreaker/FixMap). Zero dependencies.

Most users want the CLI and MCP server instead: [`@aryam/fixmap`](https://www.npmjs.com/package/@aryam/fixmap).

## Usage

```ts
import { buildFixMapReport, renderAgentReport, renderMarkdownReport } from "@aryam/fixmap-core";

const report = await buildFixMapReport({
  repoRoot: "/path/to/repo",
  issueText: "password reset emails fail"
});

console.log(renderMarkdownReport(report));
console.log(renderAgentReport(report));
```

`buildFixMapReport` runs the full pipeline: scan the repository, resolve exclusions, rank primary context against the task, build a separate likely-impact view, route to relevant test commands, and collect risk notes and diagnostics. Impact evidence includes imports, reverse dependents, routed tests, and repeated bounded Git co-change relationships; it is explicitly an inspection aid rather than a claim that every related file must change. Exact git states can reuse a seven-day scan cache, while `useCache: false` forces a fresh scan and reports the bypass.

The package also exports the lower-level scanner, excluder, ranker, BM25 retriever, grounding, import graph, Impact Graph builder, test routing, risk, comparison, explanation, verification, structural validation, and Markdown/JSON/agent rendering APIs. `@aryam/fixmap-core/browser` exposes the filesystem-free report, Impact Graph, Compare, Explain, Verify, validation, and rendering logic for browser applications.

JSON reports use `reportVersion: 1`. Additive fields and diagnostic codes may appear within that version; consumers should ignore unknown fields and use diagnostic severity as the stable fallback.

MIT © FixMap contributors.
