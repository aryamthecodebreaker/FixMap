import { tokenizePath } from "./signals.js";
import type { FixMapReport, RepoMap, RiskNote, TestRoute } from "./types.js";

export function buildTestRoutes(repo: RepoMap, contextPaths: string[]): TestRoute[] {
  const codeContextPaths = contextPaths.filter((path) => repo.files.find((file) => file.path === path)?.kind === "code");
  if (codeContextPaths.length === 0) {
    return [];
  }

  const relatedTests = findRelatedTests(repo, contextPaths);
  const scriptPriority = new Map([["test", 0], ["typecheck", 1], ["check", 2], ["lint", 3]]);
  const candidates = repo.packageScripts
    .filter((script) => scriptPriority.has(script.name))
    .map((script) => ({
      script,
      proximity: packageProximity(script.packageDir, codeContextPaths),
      priority: scriptPriority.get(script.name) ?? 99
    }))
    .filter((candidate) => candidate.proximity >= 0)
    .sort((a, b) => b.proximity - a.proximity || a.priority - b.priority || a.script.packageDir.localeCompare(b.script.packageDir));

  const commands = new Set<string>();
  const routes: TestRoute[] = [];
  for (const { script } of candidates) {
    const command = formatScriptCommand(repo.packageManager, script.packageDir, script.name);
    if (commands.has(command)) continue;
    commands.add(command);
    routes.push({
      command,
      reason: `${script.packageDir ? `nearest package (${script.packageDir})` : "repository root"} script named ${script.name}`,
      relatedFiles: script.name === "test" ? relatedTests : codeContextPaths
    });
    if (routes.length === 3) break;
  }

  return routes;
}

export function buildRiskNotes(contextPaths: string[]): RiskNote[] {
  const risks: RiskNote[] = [];
  const tokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));

  if (tokens.has("auth") || tokens.has("login") || tokens.has("password")) {
    risks.push({
      area: "authentication",
      severity: "high",
      reason: "authentication-related files are affected"
    });
  }

  if (tokens.has("billing") || tokens.has("payment") || tokens.has("invoice")) {
    risks.push({
      area: "billing",
      severity: "high",
      reason: "billing or payment-related files are affected"
    });
  }

  if (tokens.has("config") || tokens.has("workflow") || tokens.has("action")) {
    risks.push({
      area: "automation",
      severity: "medium",
      reason: "configuration or CI automation files may affect developer workflows"
    });
  }

  if (tokens.has("migration") || tokens.has("schema") || tokens.has("database") || tokens.has("sql")) {
    risks.push({ area: "data", severity: "high", reason: "database or schema-related files may affect stored data" });
  }

  if (tokens.has("api") || tokens.has("route") || tokens.has("public")) {
    risks.push({ area: "public-api", severity: "medium", reason: "public interfaces or request handling may change" });
  }

  if (tokens.has("dependency") || tokens.has("lock") || tokens.has("package")) {
    risks.push({ area: "dependencies", severity: "medium", reason: "dependency changes can affect build and supply-chain behavior" });
  }

  return risks;
}

function packageProximity(packageDir: string, contextPaths: string[]): number {
  if (!packageDir) return 1;
  const matches = contextPaths.filter((path) => path === packageDir || path.startsWith(`${packageDir}/`));
  return matches.length > 0 ? 10 + packageDir.split("/").length : -1;
}

function formatScriptCommand(manager: RepoMap["packageManager"], packageDir: string, script: string): string {
  if (!packageDir) return `${manager} run ${script}`;
  if (manager === "npm") return `npm --prefix ${packageDir} run ${script}`;
  if (manager === "pnpm") return `pnpm --dir ${packageDir} run ${script}`;
  if (manager === "yarn") return `yarn --cwd ${packageDir} ${script}`;
  return `bun --cwd ${packageDir} run ${script}`;
}

function findRelatedTests(repo: RepoMap, contextPaths: string[]): string[] {
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));

  return repo.files
    .filter((file) => file.isTest)
    .map((file) => {
      const testTokens = tokenizePath(file.path);
      const overlap = [...testTokens].filter((token) => contextTokens.has(token)).length;
      return { path: file.path, score: overlap };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 8)
    .map((file) => file.path);
}

export function buildSummary(contextFileCount: number, testRouteCount: number): string {
  const files = contextFileCount === 1 ? "context file" : "context files";
  const routes = testRouteCount === 1 ? "test route" : "test routes";
  return `FixMap found ${contextFileCount} ${files} and generated ${testRouteCount} ${routes}.`;
}

export function renderMarkdownReport(report: FixMapReport): string {
  const lines = [
    "# FixMap Report",
    "",
    report.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report.contextFiles.map((file) => `- \`${file.path}\` (${file.confidence} confidence, score ${file.score}): ${file.reasons.join("; ")}`)),
    "",
    "## Test Route",
    "",
    ...listOrEmpty(report.testRoutes.map((route) => {
      const related = route.relatedFiles.length > 0 ? ` Related: ${route.relatedFiles.map((path) => `\`${path}\``).join(", ")}.` : "";
      return `- \`${route.command}\`: ${route.reason}.${related}`;
    })),
    "",
    "## Risk Map",
    "",
    ...listOrEmpty(report.risks.map((risk) => `- **${risk.severity}** ${risk.area}: ${risk.reason}`)),
    "",
    "## Changed Files",
    "",
    ...listOrEmpty(report.changedFiles.map((path) => `- \`${path}\``)),
    "",
    "## Diagnostics",
    "",
    ...listOrEmpty(report.diagnostics.map((diagnostic) => `- **${diagnostic.severity}** ${diagnostic.message}`))
  ];

  return `${lines.join("\n")}\n`;
}

export function renderJsonReport(report: FixMapReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function listOrEmpty(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None found"];
}
