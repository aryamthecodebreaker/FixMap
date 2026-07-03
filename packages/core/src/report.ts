import { tokenizePath } from "./signals.js";
import type { FixMapReport, RepoMap, RiskNote, TestRoute } from "./types.js";

export function buildTestRoutes(repo: RepoMap, contextPaths: string[]): TestRoute[] {
  const relatedTests = findRelatedTests(repo, contextPaths);
  const routes: TestRoute[] = [];
  const testScript = repo.packageScripts.find((script) => script.name === "test");
  const typecheckScript = repo.packageScripts.find((script) => script.name === "typecheck");

  if (testScript) {
    routes.push({
      command: `npm run ${testScript.name}`,
      reason: relatedTests.length > 0 ? "package script named test; related tests ranked by path overlap" : "package script named test",
      relatedFiles: relatedTests
    });
  }

  if (typecheckScript) {
    routes.push({
      command: `npm run ${typecheckScript.name}`,
      reason: "package script named typecheck",
      relatedFiles: contextPaths
    });
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

  return risks;
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

export function renderMarkdownReport(report: FixMapReport): string {
  const lines = [
    "# FixMap Report",
    "",
    report.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report.contextFiles.map((file) => `- \`${file.path}\` (${file.score}): ${file.reasons.join("; ")}`)),
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
    ...listOrEmpty(report.changedFiles.map((path) => `- \`${path}\``))
  ];

  return `${lines.join("\n")}\n`;
}

export function renderJsonReport(report: FixMapReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function listOrEmpty(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None found"];
}
