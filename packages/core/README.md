# @aryam/fixmap-core

Core repository scanner, ranker, and report renderer for [FixMap](https://github.com/aryamthecodebreaker/FixMap). Zero dependencies.

Most users want the CLI and MCP server instead: [`@aryam/fixmap`](https://www.npmjs.com/package/@aryam/fixmap).

## Usage

```ts
import { buildFixMapReport, renderMarkdownReport } from "@aryam/fixmap-core";

const report = await buildFixMapReport({
  repoRoot: "/path/to/repo",
  issueText: "password reset emails fail"
});

console.log(renderMarkdownReport(report));
```

`buildFixMapReport` runs the full pipeline: scan the repository, resolve exclusions, rank context files against the task, route to the most relevant test commands, and collect risk notes and diagnostics. Exact git states can reuse a seven-day scan cache, while `useCache: false` forces a fresh scan and reports the bypass.

The package also exports the lower-level scanner, excluder, ranker, grounding, import-graph, test-routing, risk, comparison, explanation, verification, structural validation, and Markdown/JSON rendering APIs. `@aryam/fixmap-core/browser` exposes the filesystem-free report, Compare, Explain, Verify, validation, and rendering logic for browser applications.

JSON reports use `reportVersion: 1`. Additive fields and diagnostic codes may appear within that version; consumers should ignore unknown fields and use diagnostic severity as the stable fallback.

MIT © FixMap contributors.
