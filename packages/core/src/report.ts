import {
  analyzeTaskGrounding,
  buildNextAction,
  buildRankingShape
} from "./grounding.js";
import type { RankingShape, TaskGrounding } from "./grounding.js";
import type { PathExcluder } from "./exclude.js";
import { detectPrimaryLanguage, manifestTestCommand, suggestedRunner } from "./languages.js";
import { DEFAULT_CONTEXT_FILE_LIMIT, rankContextFiles } from "./rank.js";
import { extractTaskSignals, tokenizePath } from "./signals.js";
import { findGatedTestDiagnostics } from "./test-gates.js";
import { DIAGNOSTIC_TERM_LIMIT, truncateForDiagnostic } from "./text.js";
import type { FixMapReport, RankedFile, RepoMap, RiskNote, ScanDiagnostic, TestRoute } from "./types.js";

const MAX_REPORTED_TERMS = 8;

// Everything between a scanned repository and a finished report. Kept separate from the
// scan so the same assembly runs in the CLI, the MCP server, the Action, and the browser
// demo on the website — a demo that reimplemented this would drift from the tool it
// advertises, and the drift would always favor the demo.
export function buildReportFromRepo(
  repo: RepoMap,
  input: {
    issueText?: string | undefined;
    limit?: number | undefined;
    exclude?: PathExcluder | undefined;
  }
): FixMapReport {
  const grounding = analyzeTaskGrounding(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const contextFiles = grounding.specificity === "vague"
    ? []
    : rankContextFiles(
      repo,
      {
        issueText: input.issueText,
        diffText: repo.diffText,
        exclude: input.exclude
      },
      input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT
    );
  const ranking = buildRankingShape(contextFiles);
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];

  return {
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    changedFiles: repo.changedFiles,
    diagnostics: [
      ...repo.diagnostics,
      ...findGatedTestDiagnostics(repo.files, routedTestPaths),
      ...findMissingTestRouteDiagnostics(repo, contextFiles, testRoutes),
      ...findTaskDiagnostics(grounding, ranking),
      ...(grounding.specificity === "vague"
        ? []
        : findEmptyResultDiagnostics(repo, contextFiles, input.issueText ?? ""))
    ],
    analysis: {
      grounding,
      ranking,
      nextAction: buildNextAction(grounding, ranking, contextFiles)
    }
  };
}

function findMissingTestRouteDiagnostics(
  repo: RepoMap,
  contextFiles: RankedFile[],
  testRoutes: TestRoute[]
): ScanDiagnostic[] {
  if (testRoutes.length > 0 || !contextFiles.some((entry) =>
    repo.files.find((file) => file.path === entry.path)?.kind === "code"
  )) {
    return [];
  }

  // Which language this is decides the wording, and asking "is there any .py file" got
  // that wrong: clap-rs/clap is Rust and keeps a few helper scripts, so it was told to go
  // read pyproject.toml. The root manifest is the deliberate declaration; a stray file
  // extension is incidental.
  const { language, evidence } = detectPrimaryLanguage(repo);
  const runner = suggestedRunner(language, repo.files);

  return [{
    code: "no-test-route",
    severity: "warning",
    message: runner
      ? `No test command was routed. FixMap read this as a ${language} repository (${evidence}) ` +
        `and found no supported package script; \`${runner}\` is the runner that fits, ` +
        "but confirm it against the project's own configuration before relying on it."
      : "No test command was routed. FixMap found code context but no supported package test script, " +
        "so tests were not assumed to be absent."
  }];
}

function findTaskDiagnostics(
  grounding: TaskGrounding,
  ranking: RankingShape
): ScanDiagnostic[] {
  const diagnostics: ScanDiagnostic[] = [];

  if (grounding.unresolvedIdentifiers.length > 0) {
    diagnostics.push({
      code: "unresolved-identifier",
      severity: "warning",
      message:
        `Identifier${grounding.unresolvedIdentifiers.length === 1 ? "" : "s"} not found exactly in the scanned repository: ` +
        `${grounding.unresolvedIdentifiers.join(", ")}. Component words from unresolved identifiers were ignored, ` +
        "and unsupported recommendations were capped at low confidence."
    });
  }

  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    diagnostics.push({
      code: "partially-resolved-identifier",
      severity: "info",
      message:
        `Identifier${grounding.partiallyResolvedIdentifiers.length === 1 ? "" : "s"} matched a longer repository symbol by component terms: ` +
        `${grounding.partiallyResolvedIdentifiers.join(", ")}. The component terms were retained, but confidence was capped at medium.`
    });
  }

  if (grounding.unverifiedIdentifiers.length > 0) {
    diagnostics.push({
      code: "identifier-unverified",
      severity: "warning",
      message:
        `Identifier${grounding.unverifiedIdentifiers.length === 1 ? "" : "s"} could not be verified because one or more source files exceeded the text-sampling limit: ` +
        `${grounding.unverifiedIdentifiers.join(", ")}. FixMap did not claim that the identifier was absent, and confidence was capped at low without another anchor.`
    });
  }

  if (grounding.specificity === "vague") {
    diagnostics.push({
      code: "vague-task",
      severity: "warning",
      message:
        "The task is broad and has no verified symbol, file, or diff anchor. Treat the ranking as subsystem guidance only, " +
        "or add a failing behavior, error string, command, symbol, or file path."
    });
  }

  if (ranking.clustered && grounding.specificity !== "anchored") {
    diagnostics.push({
      code: "flat-ranking",
      severity: "warning",
      message:
        "The leading files have tightly clustered scores, so FixMap cannot identify a decisive edit point. " +
        "Use them as a starting neighborhood and verify the exact file before editing."
    });
  }

  return diagnostics;
}

// An empty report is the one result that explains nothing on its own. Say whether the task
// text carried no searchable terms or whether the terms simply matched no file, so the
// reader knows which end to fix.
function findEmptyResultDiagnostics(
  repo: RepoMap,
  contextFiles: RankedFile[],
  issueText: string
): ScanDiagnostic[] {
  if (contextFiles.length > 0 || repo.files.length === 0) {
    return [];
  }

  const signals = extractTaskSignals({
    issueText,
    diffText: repo.diffText,
    changedFiles: repo.changedFiles
  });
  const terms = [...signals.tokens].sort();

  if (terms.length === 0 && signals.identifiers.size === 0 && signals.fileMentions.size === 0) {
    return [{
      code: "no-task-terms",
      severity: "warning",
      message:
        "No context files: the task text contained no searchable term. Every word was a common word, " +
        "a language keyword, or shorter than three characters. Name the failing behavior, a symbol, or a file path."
    }];
  }

  const preview = terms
    .slice(0, MAX_REPORTED_TERMS)
    .map((term) => truncateForDiagnostic(term, DIAGNOSTIC_TERM_LIMIT))
    .join(", ");
  const remainder = terms.length > MAX_REPORTED_TERMS ? ` (+${terms.length - MAX_REPORTED_TERMS} more)` : "";
  return [{
    code: "no-context-match",
    severity: "warning",
    message:
      `No context files: no file in the ${repo.files.length} scanned matched the task terms ${preview}${remainder}. ` +
      "The repository may not contain this behavior, or it may name it differently."
  }];
}

// A route runs one package's script, so it can only exercise files inside that package.
// Listing a sibling package's tests beneath it claims something the command cannot do:
// `npm --prefix packages/core run test` never reaches packages/action/test. A root
// script has no such boundary and legitimately covers everything.
function scopeToPackage(paths: string[], packageDir: string): string[] {
  if (!packageDir) {
    return paths;
  }
  const prefix = `${packageDir}/`;
  return paths.filter((path) => path.startsWith(prefix));
}

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
      relatedFiles: scopeToPackage(
        script.name === "test" ? relatedTests : codeContextPaths,
        script.packageDir
      )
    });
    if (routes.length === 3) break;
  }

  // Node package scripts are the only route FixMap knew, so a Go or Rust repository got
  // ranked files and an empty command list — ranking without a way to check the change is
  // half the job. Their toolchains each have exactly one test command, so it can be routed
  // rather than guessed at.
  if (routes.length === 0) {
    const manifestRoute = buildManifestTestRoute(repo, codeContextPaths, relatedTests);
    if (manifestRoute) {
      routes.push(manifestRoute);
    }
  }

  return routes;
}

function buildManifestTestRoute(
  repo: RepoMap,
  codeContextPaths: string[],
  relatedTests: string[]
): TestRoute | undefined {
  const { language } = detectPrimaryLanguage(repo);
  const crateDir = language === "rust" ? nearestManifestDir(repo, codeContextPaths, "Cargo.toml") : "";
  const route = manifestTestCommand(language, crateDir);
  if (!route) {
    return undefined;
  }

  return {
    command: route.command,
    reason: route.reason,
    relatedFiles: scopeToPackage(relatedTests.length > 0 ? relatedTests : codeContextPaths, crateDir)
  };
}

/**
 * The deepest directory that both holds the named manifest and contains a top context
 * file. Scoping a workspace command to the crate being edited keeps the route honest for
 * the same reason package scripts are scoped: a command that cannot reach a file should
 * not list it.
 */
function nearestManifestDir(repo: RepoMap, contextPaths: string[], manifest: string): string {
  const manifestDirs = repo.files
    .filter((file) => file.path === manifest || file.path.endsWith(`/${manifest}`))
    .map((file) => file.path.split("/").slice(0, -1).join("/"))
    .filter(Boolean);

  return manifestDirs
    .filter((dir) => contextPaths.some((path) => path.startsWith(`${dir}/`)))
    .sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b))[0] ?? "";
}

const RISK_RULES: { area: string; severity: RiskNote["severity"]; tokens: string[]; reason: string }[] = [
  { area: "authentication", severity: "high", tokens: ["auth", "login", "password"], reason: "authentication-related files are affected" },
  { area: "billing", severity: "high", tokens: ["billing", "payment", "invoice"], reason: "billing or payment-related files are affected" },
  { area: "automation", severity: "medium", tokens: ["config", "workflow", "action"], reason: "configuration or CI automation files may affect developer workflows" },
  { area: "data", severity: "high", tokens: ["migration", "schema", "database", "sql"], reason: "database or schema-related files may affect stored data" },
  { area: "public-api", severity: "medium", tokens: ["api", "route", "public"], reason: "public interfaces or request handling may change" },
  { area: "dependencies", severity: "medium", tokens: ["dependency", "lock", "package"], reason: "dependency changes can affect build and supply-chain behavior" }
];

// Demo code names sensitive areas without touching them. Express ships examples/auth/,
// which the ranker already deprioritizes as demo code — but reading it for risk turned a
// low-confidence example into "high: authentication-related files are affected" on a task
// about request parsing. A risk note derived from evidence the ranking itself discounted
// is exactly the confident-but-wrong output the diagnostics exist to prevent. A changed
// file is different: a diff is fact, so it still counts wherever it lives.
const AUXILIARY_RISK_DIRS = new Set(["demo", "demos", "example", "examples", "sample", "samples", "fixture", "fixtures"]);

function carriesRiskEvidence(path: string): boolean {
  return !path.split("/").slice(0, -1).some((segment) => AUXILIARY_RISK_DIRS.has(segment.toLowerCase()));
}

export function buildRiskNotes(contextPaths: string[], changedFiles: string[] = []): RiskNote[] {
  const contextTokens = new Set(
    contextPaths.filter(carriesRiskEvidence).flatMap((path) => [...tokenizePath(path)])
  );
  const changedTokens = new Set(changedFiles.flatMap((path) => [...tokenizePath(path)]));
  const diffPresent = changedFiles.length > 0;
  const risks: RiskNote[] = [];

  for (const rule of RISK_RULES) {
    const inChanged = rule.tokens.some((token) => changedTokens.has(token));
    const inContext = rule.tokens.some((token) => contextTokens.has(token));
    if (!inChanged && !inContext) {
      continue;
    }

    if (inChanged) {
      risks.push({ area: rule.area, severity: rule.severity, reason: rule.reason });
    } else {
      risks.push({
        area: rule.area,
        severity: "low",
        reason: diffPresent
          ? `context ranking surfaced ${rule.area}-related files, but none of the changed files touch this area`
          : `ranked files touch ${rule.area}; review this area before editing, but no diff evidence is available yet`
      });
    }
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
  const changedSet = new Set(repo.changedFiles);
  const changedTests = repo.files
    .filter((file) => file.isTest && changedSet.has(file.path))
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b));
  const changedTestSet = new Set(changedTests);
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));

  const overlapping = repo.files
    .filter((file) => file.isTest && !changedTestSet.has(file.path))
    .map((file) => {
      const testTokens = tokenizePath(file.path);
      const overlap = [...testTokens].filter((token) => contextTokens.has(token)).length;
      return { path: file.path, score: overlap };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .map((file) => file.path);

  return [...changedTests, ...overlapping].slice(0, 8);
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
    ...(report.analysis ? [
      "",
      "## Analysis",
      "",
      `- Task grounding: **${report.analysis.grounding.specificity}**`,
      `- Repository scan: **${report.analysis.grounding.scanComplete ? "complete" : "incomplete"}**`,
      `- Ranking shape: **${report.analysis.ranking.clustered ? "clustered" : "separated"}**`,
      `- Next action: ${report.analysis.nextAction}`
    ] : []),
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
