import {
  analyzeTaskGrounding,
  buildNextAction
} from "./grounding.js";
import type { RankingShape, TaskGrounding } from "./grounding.js";
import type { PathExcluder } from "./exclude.js";
import { detectPrimaryLanguage, dotnetTestCommandForPath, manifestTestCommand, phpTestCommandForPath, suggestedRunner } from "./languages.js";
import { buildImpactMap } from "./impact.js";
import { DEFAULT_CONTEXT_FILE_LIMIT, rankContextFiles, rankContextFilesEvidenceDetailed } from "./rank.js";
import { extractTaskSignals, tokenizePath } from "./signals.js";
import { findGatedTestDiagnostics } from "./test-gates.js";
import { markdownCode } from "./markdown.js";
import { DIAGNOSTIC_TERM_LIMIT, truncateForDiagnostic } from "./text.js";
import { rankContextFilesHybrid } from "./semantic.js";
import type { EmbeddingProvider, HybridRankingResult } from "./semantic.js";
import type { FixMapReport, PackageScript, RankedFile, RepoFile, RepoMap, ReportRetrieval, RiskNote, ScanDiagnostic, TestRoute } from "./types.js";
import { assessAnnotations, validateAnnotationStore } from "./annotations.js";
import type { AnnotationAssessment, AnnotationRename } from "./annotations.js";
import { inventoryDecisionRecords, selectDecisionRecords } from "./decisions.js";
import { architecturePolicyFromRepo, evaluateArchitecturePolicy } from "./architecture.js";
import type { ArchitecturePolicyResult } from "./architecture.js";

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
    annotationAsOf?: string | undefined;
  }
): FixMapReport {
  const grounding = analyzeTaskGrounding(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const ranked = rankContextFilesEvidenceDetailed(
    repo,
    {
      issueText: input.issueText,
      diffText: repo.diffText,
      exclude: input.exclude
    },
    input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT
  );
  const contextFiles = ranked.contextFiles;
  const ranking = ranked.ranking;
  return assembleReport(repo, input, grounding, contextFiles, ranking);
}

/** Builds the same report contract with an explicitly requested hybrid rank. */
export async function buildHybridReportFromRepo(
  repo: RepoMap,
  input: {
    issueText?: string | undefined;
    limit?: number | undefined;
    exclude?: PathExcluder | undefined;
    embeddingProvider: EmbeddingProvider;
    allowRemoteEmbeddings?: boolean;
    annotationAsOf?: string | undefined;
  }
): Promise<FixMapReport> {
  const grounding = analyzeTaskGrounding(repo, { issueText: input.issueText, diffText: repo.diffText });
  const hybrid = await rankContextFilesHybrid(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  }, {
    embeddingProvider: input.embeddingProvider,
    limit: input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT,
    ...(input.allowRemoteEmbeddings !== undefined ? { allowRemoteEmbeddings: input.allowRemoteEmbeddings } : {}),
    ...(input.exclude ? { exclude: input.exclude } : {})
  });
  const contextFiles = hybrid.files.map((file) => ({
    ...file,
    confidence: hybridConfidence(file)
  }));
  const retrieval: ReportRetrieval = {
    mode: hybrid.mode,
    weights: hybrid.weights,
    ...(hybrid.semantic ? { semantic: hybrid.semantic } : {})
  };
  const diagnostics = hybrid.diagnostics.flatMap((entry): ScanDiagnostic[] =>
    entry.code === "semantic-disabled" ? [] : [{ ...entry, code: entry.code }]
  );
  return assembleReport(
    repo,
    input,
    grounding,
    contextFiles,
    hybrid.structuralRanking,
    diagnostics,
    retrieval,
    hybrid
  );
}

function assembleReport(
  repo: RepoMap,
  input: { issueText?: string | undefined; exclude?: PathExcluder | undefined; annotationAsOf?: string | undefined },
  grounding: TaskGrounding,
  contextFiles: RankedFile[],
  ranking: RankingShape,
  extraDiagnostics: ScanDiagnostic[] = [],
  retrieval?: ReportRetrieval,
  hybrid?: HybridRankingResult
): FixMapReport {
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];
  const impact = buildImpactMap(repo, contextPaths, testRoutes);
  const annotations = input.annotationAsOf
    ? buildReportAnnotations(repo, [...contextPaths, ...impact.inspectionOrder, ...repo.changedFiles], input.issueText ?? "", input.annotationAsOf)
    : undefined;
  const decisionInventory = inventoryDecisionRecords(repo);
  const decisions = selectDecisionRecords(decisionInventory, {
    paths: [...contextPaths, ...impact.inspectionOrder, ...repo.changedFiles],
    task: input.issueText ?? ""
  });
  let policy: ArchitecturePolicyResult | undefined;
  const policyDiagnostics: ScanDiagnostic[] = [];
  try {
    const architecturePolicy = architecturePolicyFromRepo(repo);
    if (architecturePolicy) policy = evaluateArchitecturePolicy(architecturePolicy, {
      repo,
      focusPaths: [...contextPaths, ...repo.changedFiles]
    });
  } catch (error) {
    policyDiagnostics.push({
      code: "architecture-policy-invalid",
      severity: "error",
      paths: [".fixmap/policy.json"],
      message: `.fixmap/policy.json was not applied: ${error instanceof Error ? error.message : String(error)}`
    });
  }

  return {
    reportVersion: 1,
    summary: buildSummary(contextFiles.length, testRoutes.length, impact.files.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    impact,
    changedFiles: repo.changedFiles,
    diagnostics: [
      ...repo.diagnostics,
      ...findGatedTestDiagnostics(repo.files, routedTestPaths),
      ...findMissingTestRouteDiagnostics(repo, contextFiles, testRoutes),
      ...findTaskDiagnostics(repo, grounding, ranking),
      ...findTaskPreprocessingDiagnostics(input.issueText ?? ""),
      ...findEmptyResultDiagnostics(repo, contextFiles, input.issueText ?? "", input.exclude),
      ...(annotations?.diagnostics ?? []),
      ...decisionInventory.diagnostics.map((diagnostic): ScanDiagnostic => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        paths: [diagnostic.path]
      })),
      ...policyDiagnostics,
      ...(policy?.findings ?? []).map((finding): ScanDiagnostic => ({
        code: policyDiagnosticCode(finding.code),
        severity: finding.severity,
        message: finding.message,
        paths: finding.paths
      })),
      ...extraDiagnostics
    ],
    analysis: {
      grounding,
      ranking,
      ...(hybrid ? { retrievalRanking: buildRetrievalRanking(hybrid) } : {}),
      // Only a test route's related paths are tests. A lint, typecheck or Go route fills the
      // same field with implementation paths, and counting those made nextAction promise
      // "and its routed tests" when nothing of the sort had been routed.
      nextAction: buildNextAction(
        grounding,
        ranking,
        contextFiles,
        testRoutes.some((route) => route.kind === "test" && route.relatedFiles.length > 0)
      )
    },
    ...(retrieval ? { retrieval } : {}),
    ...(annotations && annotations.entries.length > 0
      ? { annotations: {
          asOf: input.annotationAsOf!,
          sourcePath: ".fixmap/annotations.json",
          sourceFingerprint: repo.files.find((file) => file.path === ".fixmap/annotations.json")!.contentFingerprint!,
          entries: annotations.entries
        } }
      : {}),
    ...(decisions.length > 0 ? { decisions } : {}),
    ...(policy ? { policy } : {})
  };
}

function policyDiagnosticCode(code: import("./architecture.js").ArchitecturePolicyFinding["code"]): ScanDiagnostic["code"] {
  if (code === "boundary-violation") return "architecture-boundary-violation";
  if (code === "required-test-missing") return "architecture-required-test";
  if (code === "review-required") return "architecture-review-required";
  return "architecture-breaking-contract";
}

function buildReportAnnotations(
  repo: RepoMap,
  relevantPaths: readonly string[],
  issueText: string,
  asOf: string
): { entries: AnnotationAssessment[]; diagnostics: ScanDiagnostic[] } | undefined {
  const source = repo.files.find((file) => file.path === ".fixmap/annotations.json");
  if (!source) return undefined;
  if (source.textSampleComplete === false || !source.contentFingerprint) {
    return { entries: [], diagnostics: [{
      code: "annotation-source-incomplete",
      severity: "warning",
      paths: [source.path],
      message: ".fixmap/annotations.json exceeded the scanner content bound or could not be read; human-intent notes were not applied."
    }] };
  }
  let assessments: AnnotationAssessment[];
  try {
    const store = validateAnnotationStore(JSON.parse(source.textSample) as unknown);
    assessments = assessAnnotations(store, repo, { now: asOf, renames: diffRenames(repo.diffText) });
  } catch (error) {
    return { entries: [], diagnostics: [{
      code: "annotation-store-invalid",
      severity: "warning",
      paths: [source.path],
      message: `.fixmap/annotations.json was not applied: ${error instanceof Error ? error.message : String(error)}`
    }] };
  }
  const paths = new Set(relevantPaths);
  const lowerIssue = issueText.toLowerCase();
  const entries = assessments.filter((assessment) => {
    const scope = assessment.annotation.scope;
    if (scope.kind === "file" || scope.kind === "symbol") return paths.has(scope.path);
    if (scope.kind === "contract") return Boolean(scope.path && paths.has(scope.path)) || lowerIssue.includes(scope.name.toLowerCase());
    return lowerIssue.includes(scope.name.toLowerCase());
  });
  const diagnostics: ScanDiagnostic[] = entries.flatMap((assessment): ScanDiagnostic[] => {
    const paths = annotationPaths(assessment);
    if (assessment.status === "expired") return [{
      code: "annotation-expired",
      severity: "info",
      message: assessment.message,
      ...(paths ? { paths } : {})
    }];
    if (assessment.status === "missing-target" || assessment.status === "renamed-target") return [{
      code: "annotation-target-stale",
      severity: "warning",
      message: assessment.message,
      ...(paths ? { paths } : {})
    }];
    return [];
  });
  return { entries, diagnostics };
}

function annotationPaths(assessment: AnnotationAssessment): string[] | undefined {
  const scope = assessment.annotation.scope;
  const path = scope.kind === "file" || scope.kind === "symbol" || scope.kind === "contract" ? scope.path : undefined;
  return path ? [path] : undefined;
}

function diffRenames(diffText: string): AnnotationRename[] {
  const lines = diffText.split(/\r?\n/);
  const renames: AnnotationRename[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const from = lines[index]?.match(/^rename from (.+)$/)?.[1];
    const to = lines[index + 1]?.match(/^rename to (.+)$/)?.[1];
    if (from && to) renames.push({ from, to });
  }
  return renames;
}

function hybridConfidence(file: import("./semantic.js").HybridRankedFile): RankedFile["confidence"] {
  if (file.retrieval.structuralRank === file.rank || file.confidence !== "high") return file.confidence;
  const anchored = file.reasons.some((reason) =>
    reason === "changed file" || reason === "explicitly named in the task" ||
    reason.startsWith("defines task identifiers:") || reason.startsWith("exact task literal at definition:")
  );
  return anchored ? file.confidence : "medium";
}

function buildRetrievalRanking(hybrid: HybridRankingResult): NonNullable<NonNullable<FixMapReport["analysis"]>["retrievalRanking"]> {
  const top = hybrid.files[0]?.fusionScore;
  const runnerUp = hybrid.files[1]?.fusionScore;
  return {
    topFusionScore: top ?? null,
    runnerUpFusionScore: runnerUp ?? null,
    topGap: top !== undefined && runnerUp !== undefined ? Number((top - runnerUp).toFixed(8)) : null
  };
}

function findMissingTestRouteDiagnostics(
  repo: RepoMap,
  contextFiles: RankedFile[],
  testRoutes: TestRoute[]
): ScanDiagnostic[] {
  if (!contextFiles.some((entry) =>
    repo.files.find((file) => file.path === entry.path)?.kind === "code"
  )) {
    return [];
  }

  if (testRoutes.length > 0) {
    // A routed test command with no related test files is a different situation from having
    // no route at all, and `relatedFiles: []` was the only signal — easy to read as "tests
    // exist and were omitted" rather than "the command runs, but nothing here covers this
    // code". Saying so lets an agent decide whether to write a test before editing.
    const routedTests = testRoutes.filter((route) => route.kind === "test");
    if (routedTests.length > 0 && routedTests.every((route) => route.relatedFiles.length === 0)) {
      return [{
        code: "no-related-tests",
        severity: "info",
        message:
          `A test command was routed (\`${routedTests[0]!.command}\`) but no existing test file covers the ranked ` +
          "context, so the command will not exercise this change until one is written."
      }];
    }
    return [];
  }

  // Which language this is decides the wording, and asking "is there any .py file" got
  // that wrong: clap-rs/clap is Rust and keeps a few helper scripts, so it was told to go
  // read pyproject.toml. The root manifest is the deliberate declaration; a stray file
  // extension is incidental.
  const { language, evidence } = detectPrimaryLanguage(repo);
  // A repository carrying vitest.config.ts and test-shaped files is not a repository with no
  // test tooling, and saying nothing left the two indistinguishable. The config file names
  // the runner as squarely as pyproject.toml names pytest.
  const runner = suggestedRunner(language, repo.files) ?? configuredJsRunner(repo.files);

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
  repo: RepoMap,
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
    const skipReasons = new Set(repo.files
      .filter((file) => file.isSource && file.textSampleComplete === false)
      .map((file) => file.textSampleSkipReason));
    const cause = skipReasons.size === 1 && skipReasons.has("too-large")
      ? "one or more source files exceeded the text-sampling limit"
      : "one or more source files could not be sampled as UTF-8 text";
    diagnostics.push({
      code: "identifier-unverified",
      severity: "warning",
      message:
        `Identifier${grounding.unverifiedIdentifiers.length === 1 ? "" : "s"} could not be verified because ${cause}: ` +
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

function findTaskPreprocessingDiagnostics(issueText: string): ScanDiagnostic[] {
  const signals = extractTaskSignals({ issueText });
  if (signals.uncheckedChecklistLinesPreserved > 0) {
    return [{
      code: "task-checklist-filtered",
      severity: "info",
      message:
        `Preserved ${signals.uncheckedChecklistLinesPreserved} unchecked checklist ` +
        `${signals.uncheckedChecklistLinesPreserved === 1 ? "line" : "lines"} because they contained the issue's only substantive task details.`
    }];
  }
  if (signals.uncheckedChecklistLinesRemoved > 0) {
    return [{
      code: "task-checklist-filtered",
      severity: "info",
      message:
        `Removed ${signals.uncheckedChecklistLinesRemoved} unchecked issue-template ` +
        `${signals.uncheckedChecklistLinesRemoved === 1 ? "option" : "options"} before ranking; selected checklist items and prose were retained.`
    }];
  }
  return [];
}

// An empty report is the one result that explains nothing on its own. Say whether the task
// text carried no searchable terms or whether the terms simply matched no file, so the
// reader knows which end to fix.
function findEmptyResultDiagnostics(
  repo: RepoMap,
  contextFiles: RankedFile[],
  issueText: string,
  exclude: PathExcluder | undefined
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

  if (exclude?.patterns.length) {
    // An empty ranked set can mean the repository lacks the behavior, but it can
    // also mean exclusion patterns removed the matching files. Re-rank without
    // exclusions so the diagnostic identifies the latter case precisely.
    const withoutExclusions = rankContextFiles(repo, { issueText, diffText: repo.diffText }, DEFAULT_CONTEXT_FILE_LIMIT);
    const excludedMatches = withoutExclusions.filter((file) => exclude.excludes(file.path));
    if (excludedMatches.length > 0) {
      const paths = excludedMatches.map((file) => file.path);
      return [{
        code: "no-context-match",
        severity: "warning",
        message:
          `No context files: ${paths.length} matching ${paths.length === 1 ? "file was" : "files were"} removed by exclusion patterns ` +
          `(${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ", …" : ""}). Remove the pattern or run --explain on one of these paths.`,
        paths: paths.slice(0, 8)
      }];
    }
  }

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

/** Config filenames that name their own runner, in the order a repository usually means. */
const JS_RUNNER_CONFIGS: ReadonlyArray<[RegExp, string]> = [
  [/^vitest\.config\.[cm]?[jt]s$/, "npx vitest run"],
  [/^jest\.config\.([cm]?[jt]s|json)$/, "npx jest"],
  [/^playwright\.config\.[cm]?[jt]s$/, "npx playwright test"],
  [/^karma\.conf\.[cm]?[jt]s$/, "npx karma start"]
];

function configuredJsRunner(files: RepoFile[]): string | undefined {
  const names = new Set(files.map((file) => file.path.split("/").pop()?.toLowerCase() ?? ""));
  for (const [pattern, runner] of JS_RUNNER_CONFIGS) {
    if ([...names].some((name) => pattern.test(name))) return runner;
  }
  return undefined;
}

type ScriptKind = { category: "test"; exact: boolean };

/**
 * `test:unit` and `test:ci` are test scripts by every convention that matters, and matching
 * only the exact name `test` gave a package that had renamed its script a `no-test-route`
 * diagnostic beside a list of the very test files it would have run. The bare name still
 * wins when both exist, which is what the `exact` flag buys.
 */
function classifyScript(name: string): ScriptKind | undefined {
  const lower = name.toLowerCase();
  if (lower === "test" || lower === "tests") return { category: "test", exact: true };
  if (/^tests?:[a-z0-9:_-]+$/.test(lower)) return { category: "test", exact: false };
  return undefined;
}

export function buildTestRoutes(repo: RepoMap, contextPaths: string[]): TestRoute[] {
  const codeContextPaths = contextPaths.filter((path) => repo.files.find((file) => file.path === path)?.kind === "code");
  if (codeContextPaths.length === 0) {
    return [];
  }

  const relatedTests = findRelatedTests(repo, contextPaths).filter((path) => {
    const file = repo.files.find((entry) => entry.path === path);
    return file?.isTest === true && file.kind === "code";
  });
  const candidates = repo.packageScripts
    .map((script) => ({ script, kind: classifyScript(script.name) }))
    .filter((candidate): candidate is { script: PackageScript; kind: ScriptKind } => candidate.kind !== undefined)
    .map(({ script, kind }) => ({
      script,
      kind,
      proximity: packageProximity(script.packageDir, codeContextPaths),
      priority: kind.exact ? 0 : 1
    }))
    .filter((candidate) => candidate.proximity >= 0)
    .sort((a, b) => b.proximity - a.proximity || a.priority - b.priority || a.script.packageDir.localeCompare(b.script.packageDir));

  const commands = new Set<string>();
  const routes: TestRoute[] = [];
  for (const { script } of candidates) {
    const command = formatScriptCommand(repo.packageManager, script.packageDir, script.name, script.packageName);
    if (commands.has(command)) continue;
    commands.add(command);
    routes.push({
      command,
      kind: "test",
      reason: `${script.packageDir ? `nearest package (${script.packageDir})` : "repository root"} script named ${script.name}`,
      relatedFiles: scopeToPackage(relatedTests, script.packageDir)
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
  const packageDir = language === "rust"
    ? nearestManifestDir(repo, codeContextPaths, ["Cargo.toml"])
    : language === "python"
      ? nearestManifestDir(repo, codeContextPaths, ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile"])
      : language === "java"
        ? nearestManifestDir(repo, codeContextPaths, ["pom.xml", "build.gradle", "build.gradle.kts"])
        : "";
  const route = language === "dotnet"
    ? codeContextPaths.map((path) => dotnetTestCommandForPath(repo.files, path)).find((entry) => entry !== undefined) ??
      manifestTestCommand(language, packageDir, repo.files)
    : language === "php"
      ? codeContextPaths.map((path) => phpTestCommandForPath(repo.files, path)).find((entry) => entry !== undefined) ??
        manifestTestCommand(language, packageDir, repo.files)
    : manifestTestCommand(language, packageDir, repo.files);
  if (!route) {
    return undefined;
  }

  return {
    command: route.command,
    kind: "test",
    reason: route.reason,
    // Only real test files count as related here. Falling back to the implementation made
    // nextAction claim routed tests for a Go module that had none.
    relatedFiles: scopeToPackage(relatedTests, route.scopeDir ?? packageDir)
  };
}

/**
 * The deepest directory that both holds the named manifest and contains a top context
 * file. Scoping a workspace command to the crate being edited keeps the route honest for
 * the same reason package scripts are scoped: a command that cannot reach a file should
 * not list it.
 */
function nearestManifestDir(repo: RepoMap, contextPaths: string[], manifests: string[]): string {
  const manifestNames = new Set(manifests.map((manifest) => manifest.toLowerCase()));
  const manifestDirs = repo.files
    .filter((file) => manifestNames.has(file.path.split("/").pop()?.toLowerCase() ?? ""))
    .map((file) => file.path.split("/").slice(0, -1).join("/"))
    .filter(Boolean);

  return manifestDirs
    .filter((dir) => contextPaths.some((path) => path.startsWith(`${dir}/`)))
    .sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b))[0] ?? "";
}

export const RISK_RULES: { area: string; severity: RiskNote["severity"]; terms: string[]; reason: string }[] = [
  { area: "authentication", severity: "high", terms: ["auth", "login", "password"], reason: "authentication-related files are affected" },
  { area: "billing", severity: "high", terms: ["billing", "payment", "invoice"], reason: "billing or payment-related files are affected" },
  { area: "automation", severity: "medium", terms: ["config", "workflow", "action", "ci"], reason: "configuration or CI automation files may affect developer workflows" },
  { area: "data", severity: "high", terms: ["migration", "schema", "database", "sql"], reason: "database or schema-related files may affect stored data" },
  { area: "public-api", severity: "medium", terms: ["api", "route", "public"], reason: "public interfaces or request handling may change" },
  { area: "dependencies", severity: "medium", terms: ["dependency", "lock", "package"], reason: "dependency changes can affect build and supply-chain behavior" }
];

// Demo code names sensitive areas without touching them. Express ships examples/auth/,
// which the ranker already deprioritizes as demo code — but reading it for risk turned a
// low-confidence example into "high: authentication-related files are affected" on a task
// about request parsing. A risk note derived from evidence the ranking itself discounted
// is exactly the confident-but-wrong output the diagnostics exist to prevent. A changed
// file is different: a diff is fact, so it still counts wherever it lives.
const AUXILIARY_RISK_DIRS = new Set(["demo", "demos", "example", "examples", "sample", "samples", "fixture", "fixtures"]);

// The token lists above are deliberately broad, and `auth` alone will fire on essentially
// any auth-named module whatever the task (#358). That is intentional and stays: a risk note
// answers "what sensitive area does this touch", not "how confident am I in this plan". A
// false positive costs a reader one glance; a missed authentication risk on a plan someone
// hands to an agent costs considerably more, and the note already carries its own reason so
// the evidence can be dismissed on sight.
//
// Narrowing it to require a diff or several signals would make the note strongest exactly
// when it is least needed — after the change exists — and there is no suite that scores risk
// precision, so any tightening would be an unmeasured guess. Revisit with evidence.

function carriesRiskEvidence(path: string): boolean {
  return !path.split("/").slice(0, -1).some((segment) => AUXILIARY_RISK_DIRS.has(segment.toLowerCase()));
}

export function buildRiskNotes(contextPaths: string[], changedFiles: string[] = []): RiskNote[] {
  const contextTokens = new Set(
    contextPaths.filter(carriesRiskEvidence).flatMap((path) => [...riskTokens(path)])
  );
  const changedTokens = new Set(changedFiles.flatMap((path) => [...riskTokens(path)]));
  const diffPresent = changedFiles.length > 0;
  const risks: RiskNote[] = [];

  for (const rule of RISK_RULES) {
    const terms = rule.terms.flatMap((term) => [...riskTokens(term)]);
    const inChanged = terms.some((token) => changedTokens.has(token));
    const inContext = terms.some((token) => contextTokens.has(token));
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

/** Returns the exact paths that triggered a named risk rule. Shared with verify so the
 * finding never claims a risk while attaching an empty or unrelated path list. */
export function pathsForRiskArea(area: string, paths: string[]): string[] {
  const rule = RISK_RULES.find((candidate) => candidate.area === area);
  if (!rule) return [];
  return paths.filter((path) => {
    const tokens = riskTokens(path);
    return rule.terms.flatMap((term) => [...riskTokens(term)]).some((token) => tokens.has(token));
  });
}

function riskTokens(value: string): Set<string> {
  return new Set([
    ...tokenizePath(value),
    ...value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  ]);
}

function packageProximity(packageDir: string, contextPaths: string[]): number {
  if (!packageDir) return 1;
  const matches = contextPaths.filter((path) => path === packageDir || path.startsWith(`${packageDir}/`));
  return matches.length > 0 ? 10 + packageDir.split("/").length : -1;
}

function formatScriptCommand(
  manager: RepoMap["packageManager"],
  packageDir: string,
  script: string,
  packageName?: string
): string {
  if (!packageDir) return `${manager} run ${script}`;
  if (manager === "npm") return `npm --prefix ${packageDir} run ${script}`;
  if (manager === "pnpm") return `pnpm --dir ${packageDir} run ${script}`;
  // `yarn --cwd` is Yarn 1 syntax that Berry removed, so the printed command failed outright
  // on any modern Yarn repository. `yarn workspace <name> run <script>` is understood by
  // both, and needs the declared workspace name rather than its directory. Without a name to
  // address, the old form is still the better guess than nothing.
  if (manager === "yarn") {
    return packageName ? `yarn workspace ${packageName} run ${script}` : `yarn --cwd ${packageDir} ${script}`;
  }
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

export function buildSummary(contextFileCount: number, testRouteCount: number, impactFileCount = 0): string {
  const files = contextFileCount === 1 ? "context file" : "context files";
  const routes = testRouteCount === 1 ? "test route" : "test routes";
  const impact = impactFileCount === 1 ? "impact file" : "impact files";
  return `FixMap found ${contextFileCount} ${files}, ${impactFileCount} ${impact}, and generated ${testRouteCount} ${routes}.`;
}

export function renderMarkdownReport(report: FixMapReport): string {
  const lines = [
    "# FixMap Report",
    "",
    report.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report.contextFiles.map((file) => `- ${markdownCode(file.path)} (${file.confidence} confidence, score ${file.score}): ${file.reasons.join("; ")}`)),
    "",
    "## Impact Graph",
    "",
    ...listOrEmpty((report.impact?.files ?? []).map((file) =>
      `- ${markdownCode(file.path)} (${file.confidence} confidence, impact ${file.score}): ${file.evidence.map((entry) => entry.reason).join("; ")}`
    )),
    ...(report.impact ? [
      "",
      `Inspection order: ${report.impact.inspectionOrder.map(markdownCode).join(" → ") || "None"}.`,
      `History evidence: ${report.impact.history.available
        ? `${report.impact.history.eligibleCommits.toLocaleString()} eligible commits${report.impact.history.shallow ? " (shallow)" : ""}${report.impact.history.truncated ? " (bounded)" : ""}`
        : "not available; import and test evidence only"}.`
    ] : []),
    "",
    "## Test Routes",
    "",
    ...listOrEmpty(report.testRoutes.map((route) => {
      const related = route.relatedFiles.length > 0 ? ` Related: ${route.relatedFiles.map(markdownCode).join(", ")}.` : "";
      return `- ${markdownCode(route.command)}: ${route.reason}.${related}`;
    })),
    "",
    "## Risk Map",
    "",
    ...listOrEmpty(report.risks.map((risk) => `- **${risk.severity}** ${risk.area}: ${risk.reason}`)),
    ...(report.annotations || report.decisions ? [
      "",
      "## Human Intent",
      "",
      ...listOrEmpty([
        ...(report.decisions ?? []).map((decision) =>
          `- **ADR ${decision.status}** ${markdownCode(decision.path)} — ${decision.title}: ${inlineProse(decision.decision)}`
        ),
        ...(report.annotations?.entries ?? []).map((assessment) =>
          `- **annotation ${assessment.status}** ${describeAnnotationScope(assessment)}: ${assessment.annotation.note}`
        )
      ])
    ] : []),
    ...(report.policy ? [
      "",
      "## Architecture Policy",
      "",
      ...listOrEmpty(report.policy.findings.map((finding) =>
        `- **${finding.severity}** ${markdownCode(finding.ruleId)}: ${finding.message}`
      ))
    ] : []),
    "",
    "## Changed Files",
    "",
    ...listOrEmpty(report.changedFiles.map((path) => `- ${markdownCode(path)}`)),
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
    ...listOrEmpty(report.diagnostics.flatMap((diagnostic) => [
      `- **${diagnostic.severity}** ${diagnostic.message}`,
      ...(diagnostic.paths ?? []).slice(0, 8).map((path) => `  - ${markdownCode(path)}`)
    ]))
  ];

  return `${lines.join("\n")}\n`;
}

export function renderJsonReport(report: FixMapReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Compact, stable headings for an agent context window. Evidence stays attached to each path. */
export function renderAgentReport(report: FixMapReport): string {
  const editCandidate = report.contextFiles[0];
  const inspectByPath = new Map<string, string>();
  for (const file of report.contextFiles.slice(1, 4)) {
    inspectByPath.set(file.path, `context: ${file.reasons[0] ?? "ranked evidence"}`);
  }
  for (const file of (report.impact?.files ?? []).slice(0, 5)) {
    if (!inspectByPath.has(file.path)) {
      inspectByPath.set(file.path, `impact: ${file.evidence[0]?.reason ?? "related repository evidence"}`);
    }
  }
  const avoided = [...new Set(report.diagnostics
    .filter((entry) => entry.code === "generated-paths-dominant" || entry.code === "paths-excluded")
    .flatMap((entry) => entry.paths ?? []))];
  const uncertainty = report.diagnostics
    .filter((entry) => entry.severity !== "info" || entry.code.startsWith("impact-history-"))
    .slice(0, 3)
    .map((entry) => entry.message);
  const lines = [
    "EDIT CANDIDATE:",
    editCandidate ? `${editCandidate.path}  # ${editCandidate.confidence}; ${editCandidate.reasons[0] ?? "ranked evidence"}` : "none",
    "",
    "INSPECT:",
    ...listOrEmpty([...inspectByPath].map(([path, reason]) => `${path}  # ${reason}`)),
    "",
    "TEST:",
    ...listOrEmpty(report.testRoutes.map((route) => `${route.command}${route.relatedFiles[0] ? `  # ${route.relatedFiles[0]}` : ""}`)),
    "",
    "RISK:",
    ...listOrEmpty(report.risks.map((risk) => `${risk.severity} ${risk.area}  # ${risk.reason}`)),
    "",
    "INTENT:",
    ...listOrEmpty([
      ...(report.decisions ?? []).map((decision) =>
        `ADR ${decision.status} ${decision.path}  # ${decision.title}: ${inlineProse(decision.decision)}`
      ),
      ...(report.annotations?.entries ?? []).map((assessment) =>
        `annotation ${assessment.status} ${describeAnnotationScope(assessment)}  # ${assessment.annotation.note}`
      )
    ]),
    "",
    "POLICY:",
    ...listOrEmpty((report.policy?.findings ?? []).map((finding) =>
      `${finding.severity} ${finding.ruleId}  # ${finding.message}`
    )),
    "",
    "AVOID:",
    ...listOrEmpty(avoided),
    "",
    "UNCERTAINTY:",
    ...listOrEmpty(uncertainty)
  ];
  return `${lines.join("\n")}\n`;
}

function describeAnnotationScope(assessment: AnnotationAssessment): string {
  const scope = assessment.annotation.scope;
  if (scope.kind === "file") return markdownCode(scope.path);
  if (scope.kind === "symbol") return `${markdownCode(scope.symbol)} in ${markdownCode(scope.path)}`;
  if (scope.kind === "service") return `service ${markdownCode(scope.name)}`;
  return `contract ${markdownCode(scope.name)}${scope.path ? ` in ${markdownCode(scope.path)}` : ""}`;
}

function inlineProse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function listOrEmpty(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None found"];
}
