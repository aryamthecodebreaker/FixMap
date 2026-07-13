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

`buildFixMapReport` runs the full pipeline: scan the repository, rank context files against the task, route to the most relevant test commands, and collect risk notes and diagnostics. Lower-level pieces (`scanRepo`, `rankContextFiles`, `buildTestRoutes`, `buildRiskNotes`, `renderJsonReport`) are exported individually.

MIT © FixMap contributors.
