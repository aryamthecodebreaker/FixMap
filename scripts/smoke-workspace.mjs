import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { buildFixMapReport, renderMarkdownReport } from "../packages/core/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = join(repoRoot, "examples", "pnpm-turbo-workspace");
const update = process.argv.includes("--update");

const reportsRoot = join(repoRoot, "examples", "reports");
const cases = [
  {
    task: "roundToCents keeps fractions of a cent when formatting currency",
    reportFile: "workspace-utils-rounding.md",
    expectedFirstRoute: "pnpm --dir packages/utils run test",
    expectedContext: "packages/utils/src/currency.ts"
  },
  {
    task: "orderTotal ignores unknown discountCode values",
    reportFile: "workspace-api-discount.md",
    expectedFirstRoute: "pnpm --dir apps/api run test",
    expectedContext: "apps/api/src/orders.ts"
  }
];

let failed = false;

for (const benchmark of cases) {
  const report = await buildFixMapReport({ repoRoot: exampleRoot, issueText: benchmark.task });
  const firstRoute = report.testRoutes[0]?.command;
  const contextPaths = report.contextFiles.map((file) => file.path);

  if (firstRoute !== benchmark.expectedFirstRoute) {
    console.error(`Workspace smoke failed: "${benchmark.task}" routed to "${firstRoute}" instead of "${benchmark.expectedFirstRoute}".`);
    failed = true;
  }
  if (!contextPaths.includes(benchmark.expectedContext)) {
    console.error(`Workspace smoke failed: "${benchmark.task}" did not rank ${benchmark.expectedContext}.`);
    failed = true;
  }

  const markdown = renderMarkdownReport(report);
  const reportPath = join(reportsRoot, benchmark.reportFile);
  if (update) {
    await writeFile(reportPath, markdown);
    continue;
  }

  const checkedIn = (await readFile(reportPath, "utf8")).replaceAll("\r\n", "\n");
  if (checkedIn !== markdown) {
    console.error(
      `Workspace smoke failed: ${benchmark.reportFile} is stale. Run "node scripts/smoke-workspace.mjs --update" and commit the result.`
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(`Workspace smoke passed: ${cases.length} tasks routed to their nearest package with fresh reports.`);
