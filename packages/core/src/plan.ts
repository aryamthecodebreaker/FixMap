import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildPathExcluder, parseIgnoreFile, NO_EXCLUSIONS } from "./exclude.js";
import { markdownCode } from "./markdown.js";
import type { PathExcluder } from "./exclude.js";
import { buildHybridReportFromRepo, buildReportFromRepo } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import { scanRepoAtRef, type HistoricalRepoMap } from "./architecture-history.js";
import type { LanguageRegistry } from "./language-registry.js";
import { createCustomLanguageContext } from "./custom-language-context.js";
import type { EmbeddingProvider } from "./semantic.js";
import type { FixMapInput, FixMapReport } from "./types.js";
import { fixMapArtifactKind, isFixMapArtifact } from "./artifacts.js";
import { attachReportEvidence, reportPaths, type ReportEvidenceSource } from "./report-evidence.js";
import { buildReportSensitiveData } from "./report-sensitive-data.js";
import { buildReportSupplyChain } from "./report-supply-chain.js";
import type { SupplyChainEvidenceBundle } from "./supply-chain.js";

export async function buildFixMapReport(
  input: Pick<
    FixMapInput,
    "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked" | "useCache" | "includeHistory"
  > & {
    limit?: number | undefined;
    exclude?: string[] | undefined;
    /** Known command artifacts that must not compete with repository files in ranking. */
    internalExclude?: string[] | undefined;
    embeddingProvider?: EmbeddingProvider | undefined;
    languageRegistry?: LanguageRegistry;
    /** Explicit evidence providers, typically imported bundles; collected without network or code execution. */
    evidenceSources?: readonly ReportEvidenceSource[];
    /** Attach local lexical sensitive-data flows touching the report's files (locations and kinds only). */
    sensitiveData?: boolean;
    /** A validated supply-chain bundle and the SHA-256 of its exact bytes. */
    supplyChain?: { bundle: SupplyChainEvidenceBundle; documentSha256: string };
    /** Preview: rank against this committed ref, read from Git objects without checkout. */
    atRef?: string | undefined;
  }
): Promise<FixMapReport> {
  return (await buildFixMapAnalysis(input)).report;
}

/**
 * Builds a report and returns the exact repository snapshot that produced it. Consumers such as
 * Context Packs must not rescan between ranking paths and selecting their source ranges: an active
 * working tree could change between those reads and produce a mixed-state result.
 */
export async function buildFixMapAnalysis(
  input: Pick<
    FixMapInput,
    "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked" | "useCache" | "includeHistory"
  > & {
    limit?: number | undefined;
    exclude?: string[] | undefined;
    internalExclude?: string[] | undefined;
    embeddingProvider?: EmbeddingProvider | undefined;
    languageRegistry?: LanguageRegistry;
    /** Explicit evidence providers, typically imported bundles; collected without network or code execution. */
    evidenceSources?: readonly ReportEvidenceSource[];
    /** Attach local lexical sensitive-data flows touching the report's files (locations and kinds only). */
    sensitiveData?: boolean;
    /** A validated supply-chain bundle and the SHA-256 of its exact bytes. */
    supplyChain?: { bundle: SupplyChainEvidenceBundle; documentSha256: string };
    /** Preview: rank against this committed ref, read from Git objects without checkout. */
    atRef?: string | undefined;
  }
): Promise<{ report: FixMapReport; repo: Awaited<ReturnType<typeof scanRepo>>; exclusions: PathExcluder }> {
  const historical = input.atRef === undefined ? undefined : await scanHistoricalRepo(input.repoRoot, input.atRef, input);
  const scannedRepo = historical?.repo ?? await scanRepo({ ...input, includeHistory: input.includeHistory !== false });
  const generatedArtifacts = scannedRepo.files.filter(isFixMapArtifact);
  const generatedPaths = new Set(generatedArtifacts.map((file) => file.path));
  const repo = generatedArtifacts.length === 0
    ? scannedRepo
    : {
        ...scannedRepo,
        files: scannedRepo.files.filter((file) => !generatedPaths.has(file.path)),
        changedFiles: scannedRepo.changedFiles.filter((path) => !generatedPaths.has(path)),
        ...(scannedRepo.trackedFiles
          ? { trackedFiles: scannedRepo.trackedFiles.filter((path) => !generatedPaths.has(path)) }
          : {})
      };
  // A historical plan honors the .fixmapignore committed at that ref, not today's worktree copy.
  const requestedExclude = historical
    ? excluderFor(input.repoRoot, [...parseIgnoreFile(historical.ignoreFile ?? ""), ...(input.exclude ?? [])])
    : await resolveExclusions(input.repoRoot, input.exclude ?? []);
  const internalExclude = buildPathExcluder(
    (input.internalExclude ?? []).map((pattern) => normalizeAbsolutePattern(input.repoRoot, pattern))
  );
  const exclude = combineExclusions(requestedExclude, internalExclude);

  const languageContext = input.languageRegistry ? createCustomLanguageContext(input.languageRegistry) : undefined;
  const analyzedRepo = languageContext ? classifyCustomTests(repo, languageContext) : repo;
  const reportInput = {
    issueText: input.issueText,
    limit: input.limit,
    exclude,
    annotationAsOf: new Date().toISOString(),
    ...(languageContext ? { languageContext } : {})
  };
  const report = input.embeddingProvider
    ? await buildHybridReportFromRepo(analyzedRepo, { ...reportInput, embeddingProvider: input.embeddingProvider })
    : buildReportFromRepo(analyzedRepo, reportInput);

  if (input.evidenceSources && input.evidenceSources.length > 0) {
    report.evidence = await attachReportEvidence(report, analyzedRepo, input.evidenceSources, { issueText: input.issueText ?? "" });
  }
  if (input.sensitiveData) {
    report.sensitiveData = buildReportSensitiveData(analyzedRepo, reportPaths(report));
  }
  if (input.supplyChain) {
    report.supplyChain = buildReportSupplyChain(input.supplyChain.bundle, input.supplyChain.documentSha256, reportPaths(report));
  }

  if (input.languageRegistry && languageContext) {
    report.languageAdapters = input.languageRegistry.customAdapters.map((adapter) => ({
      id: adapter.id,
      version: adapter.version,
      extensions: [...adapter.extensions]
    }));
    const { total, entries } = languageContext.failures();
    if (total > 0) {
      const shown = entries.slice(0, 8);
      report.diagnostics.push({
        code: "language-adapter-failed",
        severity: "warning",
        message:
          `${total} custom language adapter ${total === 1 ? "call" : "calls"} failed or returned invalid results, so ` +
          `${total === 1 ? "that file was" : "those files were"} analyzed without custom facts: ` +
          shown.map((entry) => `${markdownCode(entry.path)} (${entry.adapter}, ${entry.code})`).join(", ") +
          `${total > shown.length ? ", ..." : ""}.`,
        paths: shown.map((entry) => entry.path)
      });
    }
  }

  if (generatedArtifacts.length > 0) {
    const described = generatedArtifacts.slice(0, 8).map((file) =>
      `${markdownCode(file.path)} (${fixMapArtifactKind(file)})`
    );
    report.diagnostics.push({
      code: "fixmap-artifact-excluded",
      severity: "info",
      message:
        `Excluded ${generatedArtifacts.length} previously generated FixMap ${generatedArtifacts.length === 1 ? "artifact" : "artifacts"} ` +
        `from ranking, impact analysis, and context packing: ${described.join(", ")}${generatedArtifacts.length > 8 ? ", ..." : ""}.`,
      paths: generatedArtifacts.slice(0, 8).map((file) => file.path)
    });
  }

  if (requestedExclude.patterns.length > 0) {
    const excludedPaths = repo.files.filter((file) => requestedExclude.excludes(file.path)).map((file) => file.path);
    const effectivePatterns = [...new Set(repo.files
      .map((file) => requestedExclude.reasonFor(file.path))
      .filter((pattern): pattern is string => pattern !== undefined))];
    const unmatchedPatterns = requestedExclude.patterns.filter((pattern) =>
      !pattern.startsWith("!") && !requestedExclude.matchedPatterns.has(pattern)
    );
    if (unmatchedPatterns.length > 0) {
      const sample = unmatchedPatterns.slice(0, 5).map(markdownCode).join(", ");
      report.diagnostics.push({
        code: "exclusion-no-match",
        severity: "warning",
        message:
          `${unmatchedPatterns.length} exclusion ${unmatchedPatterns.length === 1 ? "pattern matched" : "patterns matched"} no scanned paths: ${sample}` +
          `${unmatchedPatterns.length > 5 ? ", ..." : ""}. Check that patterns are repository-relative or run --explain on an expected file.`
      });
    }
    if (excludedPaths.length > 0) {
      report.diagnostics.push({
        code: "paths-excluded",
        severity: report.contextFiles.length === 0 ? "warning" : "info",
        message:
          `${effectivePatterns.length} exclusion ${effectivePatterns.length === 1 ? "pattern" : "patterns"} ` +
          `removed ${excludedPaths.length} ${excludedPaths.length === 1 ? "path" : "paths"} from ranking: ${effectivePatterns.map(markdownCode).join(", ")}. ` +
          "Run --explain on a file you expected to see if this is why it is absent.",
        paths: excludedPaths.slice(0, 8)
      });
    }
  }

  return { report, repo: analyzedRepo, exclusions: exclude };
}

function combineExclusions(primary: PathExcluder, internal: PathExcluder): PathExcluder {
  if (internal.patterns.length === 0) return primary;
  if (primary.patterns.length === 0) return internal;
  return {
    excludes: (path) => primary.excludes(path) || internal.excludes(path),
    reasonFor: (path) => primary.reasonFor(path) ?? internal.reasonFor(path),
    patterns: [...primary.patterns, ...internal.patterns],
    matchedPatterns: new Set([...primary.matchedPatterns, ...internal.matchedPatterns])
  };
}

/**
 * Command-line exclusions and `.fixmapignore` combine rather than override. A repository
 * that ships an ignore file has said something durable about itself; a flag is one run's
 * refinement of that, not a replacement for it.
 */
export async function resolveExclusions(repoRoot: string, patterns: string[]): Promise<PathExcluder> {
  return excluderFor(repoRoot, [...await readIgnoreFile(repoRoot), ...patterns]);
}

function excluderFor(repoRoot: string, patterns: string[]): PathExcluder {
  const combined = patterns.map((pattern) => normalizeAbsolutePattern(repoRoot, pattern));
  return combined.length > 0 ? buildPathExcluder(combined) : NO_EXCLUSIONS;
}

async function scanHistoricalRepo(
  repoRoot: string,
  ref: string,
  input: Pick<FixMapInput, "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked">
): Promise<HistoricalRepoMap> {
  if (input.diffSpec !== undefined || input.baseRef !== undefined || input.headRef !== undefined || input.workingTree || input.includeUntracked) {
    throw new Error("A historical plan ranks one committed state, so it cannot be combined with a diff or the working tree.");
  }
  const historical = await scanRepoAtRef({ repoRoot, ref });
  historical.repo.diagnostics.unshift({
    code: "historical-plan",
    severity: "info",
    message:
      `Preview: ranked against ${markdownCode(historical.requestedRef)} at commit ${markdownCode(historical.commit)}, ` +
      "read from committed Git objects without checking out or changing the worktree. Co-change history and uncommitted files were not used."
  });
  return historical;
}

/**
 * A leading slash normally anchors a pattern to the repository root. If a user instead
 * pastes the repository's full absolute path, strip that known prefix so the intent remains
 * portable inside the scan. Paths outside the repository keep their normal anchored meaning.
 */
function normalizeAbsolutePattern(repoRoot: string, pattern: string): string {
  const trimmed = pattern.trim();
  const negated = trimmed.startsWith("!");
  const body = (negated ? trimmed.slice(1) : trimmed).replace(/\\/g, "/");
  const normalizedRoot = resolve(repoRoot).replace(/\\/g, "/").replace(/\/$/, "");
  const caseInsensitive = /^[A-Za-z]:\//.test(normalizedRoot);
  const comparableBody = caseInsensitive ? body.toLowerCase() : body;
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  if (!comparableBody.startsWith(`${comparableRoot}/`)) return pattern;
  return `${negated ? "!" : ""}/${body.slice(normalizedRoot.length + 1)}`;
}

async function readIgnoreFile(repoRoot: string): Promise<string[]> {
  try {
    return parseIgnoreFile(await readFile(join(repoRoot, ".fixmapignore"), "utf8"));
  } catch {
    // Having no ignore file is the normal case, not an error worth reporting.
    return [];
  }
}

type ScannedRepo = Awaited<ReturnType<typeof scanRepo>>;

/**
 * A custom adapter may add test classification (for example its own test-file naming);
 * it never removes the language-neutral classification the scanner already made.
 */
function classifyCustomTests(repo: ScannedRepo, context: ReturnType<typeof createCustomLanguageContext>): ScannedRepo {
  let changed = false;
  const files = repo.files.map((file) => {
    if (file.isTest || !context.supports(file.extension)) return file;
    const extracted = context.extract(file);
    if (extracted.status !== "ok" || !extracted.facts.isTest) return file;
    changed = true;
    return { ...file, isTest: true };
  });
  return changed ? { ...repo, files } : repo;
}
