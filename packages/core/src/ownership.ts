import { architecturePolicyFromRepo, evaluateArchitecturePolicy } from "./architecture.js";
import { assessAnnotations, validateAnnotationStore } from "./annotations.js";
import { buildPathExcluder } from "./exclude.js";
import { markdownCode } from "./markdown.js";
import type { RepoMap } from "./types.js";

export type ReviewEvidence = {
  kind: "codeowners" | "annotation" | "architecture-policy" | "git-history";
  sourceFingerprint: string;
  detail: string;
  path?: string;
  line?: number;
  /** The changed path this evidence routes a reviewer for. */
  changedPath?: string;
};

export type ReviewSuggestion = {
  reviewer: string;
  confidence: "high" | "medium" | "low";
  paths: string[];
  evidence: ReviewEvidence[];
  availabilityInferred: false;
};

export type ReviewRoutingResult = {
  reviewRoutingVersion: 1;
  changedPaths: string[];
  suggestions: ReviewSuggestion[];
  diagnostics: Array<{ source: string; severity: "info" | "warning"; message: string }>;
};

type CodeOwnersRule = { pattern: string; owners: string[]; line: number };
const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
const MAX_RULES = 10_000;
const MAX_HISTORY_COMMITS = 250;

export type ReviewRoutingInput = {
  changedPaths?: readonly string[];
  now: string;
  /** Set false to drop commit-author suggestions and keep only CODEOWNERS, annotations, and policy. */
  includeHistoryAuthors?: boolean;
};

export function routeReviewers(repo: RepoMap, input: ReviewRoutingInput): ReviewRoutingResult {
  if (!Number.isFinite(Date.parse(input.now))) throw new Error("Review routing requires a valid assessment time.");
  const changedPaths = normalizePaths(input.changedPaths ?? repo.changedFiles);
  const diagnostics: ReviewRoutingResult["diagnostics"] = [];
  const accumulated = new Map<string, { confidence: ReviewSuggestion["confidence"]; paths: Set<string>; evidence: ReviewEvidence[] }>();
  addCodeOwners(repo, changedPaths, accumulated, diagnostics);
  addAnnotations(repo, changedPaths, input.now, accumulated, diagnostics);
  addPolicy(repo, changedPaths, accumulated, diagnostics);
  if (input.includeHistoryAuthors === false) {
    diagnostics.push({ source: "git-history", severity: "info", message: "Commit-author suggestions were turned off; only CODEOWNERS, annotations, and architecture policy were used." });
  } else {
    addHistory(repo, changedPaths, accumulated, diagnostics);
  }
  const suggestions = [...accumulated].map(([reviewer, value]): ReviewSuggestion => ({
    reviewer,
    confidence: value.confidence,
    paths: [...value.paths].sort(),
    evidence: value.evidence.sort(evidenceOrder),
    availabilityInferred: false
  })).sort((a, b) => confidenceOrder(a.confidence) - confidenceOrder(b.confidence) || a.reviewer.localeCompare(b.reviewer));
  return { reviewRoutingVersion: 1, changedPaths, suggestions, diagnostics };
}

function addCodeOwners(
  repo: RepoMap,
  paths: readonly string[],
  accumulated: Map<string, Accumulated>,
  diagnostics: ReviewRoutingResult["diagnostics"]
): void {
  const source = CODEOWNERS_PATHS.map((path) => repo.files.find((file) => file.path === path)).find(Boolean);
  if (!source) return;
  if (source.textSampleComplete === false || !source.contentFingerprint) {
    diagnostics.push({ source: source.path, severity: "warning", message: `${source.path} is incomplete or lacks an exact fingerprint; CODEOWNERS routing was skipped.` });
    return;
  }
  const parsed = parseCodeOwners(source.textSample);
  diagnostics.push(...parsed.diagnostics.map((message) => ({ source: source.path, severity: "warning" as const, message })));
  for (const path of paths) {
    const rule = [...parsed.rules].reverse().find((candidate) => matchesCodeOwners(path, candidate.pattern));
    if (!rule) continue;
    for (const owner of rule.owners) add(accumulated, owner, "high", path, {
      kind: "codeowners",
      sourceFingerprint: source.contentFingerprint,
      path: source.path,
      line: rule.line,
      detail: `${source.path}:${rule.line} assigns ${owner} through pattern ${rule.pattern}.`
    });
  }
}

function parseCodeOwners(content: string): { rules: CodeOwnersRule[]; diagnostics: string[] } {
  const rules: CodeOwnersRule[] = [];
  const diagnostics: string[] = [];
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tokens = trimmed.split(/\s+/);
    const pattern = tokens.shift() ?? "";
    const owners = [...new Set(tokens.filter(validOwner))].sort();
    if (!pattern || pattern.startsWith("!") || pattern.includes("[") || owners.length === 0) {
      diagnostics.push(`Ignored unsupported or ownerless CODEOWNERS rule at line ${lineNumber}.`);
      continue;
    }
    if (rules.length >= MAX_RULES) {
      diagnostics.push(`CODEOWNERS rules were bounded to ${MAX_RULES.toLocaleString()} entries.`);
      break;
    }
    rules.push({ pattern, owners, line: lineNumber });
  }
  return { rules, diagnostics };
}

function matchesCodeOwners(path: string, pattern: string): boolean {
  try {
    const normalized = pattern.startsWith("/") ? pattern.slice(1) : pattern;
    return buildPathExcluder([normalized]).excludes(path);
  } catch {
    return false;
  }
}

function addAnnotations(
  repo: RepoMap,
  paths: readonly string[],
  now: string,
  accumulated: Map<string, Accumulated>,
  diagnostics: ReviewRoutingResult["diagnostics"]
): void {
  const source = repo.files.find((file) => file.path === ".fixmap/annotations.json");
  if (!source) return;
  if (source.textSampleComplete === false || !source.contentFingerprint) {
    diagnostics.push({ source: source.path, severity: "warning", message: "Annotation owners were skipped because the store is incomplete or unversioned." });
    return;
  }
  try {
    const assessments = assessAnnotations(validateAnnotationStore(JSON.parse(source.textSample) as unknown), repo, { now });
    for (const assessment of assessments) {
      const annotation = assessment.annotation;
      if (assessment.status !== "active" || !annotation.owner) continue;
      const scopePath = annotation.scope.kind === "file" || annotation.scope.kind === "symbol" || annotation.scope.kind === "contract"
        ? annotation.scope.path
        : undefined;
      const matchedPaths = scopePath ? paths.filter((path) => path === scopePath) : [];
      for (const path of matchedPaths) add(accumulated, annotation.owner, "high", path, {
        kind: "annotation",
        sourceFingerprint: source.contentFingerprint,
        path: source.path,
        detail: `${annotation.id} explicitly names ${annotation.owner} for ${path}.`
      });
    }
  } catch (error) {
    diagnostics.push({ source: source.path, severity: "warning", message: `Annotation owners were skipped: ${error instanceof Error ? error.message : String(error)}` });
  }
}

function addPolicy(
  repo: RepoMap,
  paths: readonly string[],
  accumulated: Map<string, Accumulated>,
  diagnostics: ReviewRoutingResult["diagnostics"]
): void {
  try {
    const policy = architecturePolicyFromRepo(repo);
    if (!policy) return;
    const policyRepo = { ...repo, changedFiles: [...paths] };
    const findings = evaluateArchitecturePolicy(policy, { repo: policyRepo, focusPaths: paths }).findings;
    for (const finding of findings.filter((entry) => entry.code === "review-required")) {
      for (const evidence of finding.evidence.filter((entry) => entry.kind === "reviewer")) {
        for (const path of finding.paths) add(accumulated, evidence.detail, "high", path, {
          kind: "architecture-policy",
          sourceFingerprint: policy.source.fingerprint,
          path: policy.source.path,
          detail: `${finding.ruleId} requires ${evidence.detail} for ${path}.`
        });
      }
    }
  } catch (error) {
    diagnostics.push({ source: ".fixmap/policy.json", severity: "warning", message: `Policy reviewers were skipped: ${error instanceof Error ? error.message : String(error)}` });
  }
}

function addHistory(
  repo: RepoMap,
  paths: readonly string[],
  accumulated: Map<string, Accumulated>,
  diagnostics: ReviewRoutingResult["diagnostics"]
): void {
  if (repo.history?.shallow) {
    diagnostics.push({ source: "git-history", severity: "warning", message: "Commit history is shallow, so commit-author suggestions only reflect the commits present in this clone." });
  } else if (repo.history?.truncated) {
    diagnostics.push({ source: "git-history", severity: "info", message: `Commit-author suggestions use only the newest ${Math.min(repo.history.inspectedCommits, MAX_HISTORY_COMMITS).toLocaleString()} non-merge commits.` });
  }
  for (const path of paths) {
    const counts = new Map<string, { count: number; latest: number; hash: string }>();
    for (const commit of (repo.history?.commits ?? []).slice(0, MAX_HISTORY_COMMITS)) {
      if (!commit.author || !commit.files.includes(path)) continue;
      const previous = counts.get(commit.author);
      counts.set(commit.author, {
        count: (previous?.count ?? 0) + 1,
        latest: Math.max(previous?.latest ?? 0, commit.committedAt),
        hash: previous && previous.latest > commit.committedAt ? previous.hash : commit.hash
      });
    }
    for (const [author, evidence] of [...counts].sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest || a[0].localeCompare(b[0])).slice(0, 3)) {
      add(accumulated, author, "low", path, {
        kind: "git-history",
        sourceFingerprint: `git:${evidence.hash}`,
        path,
        detail: `${author} authored ${evidence.count} bounded non-merge commit${evidence.count === 1 ? "" : "s"} touching ${path}; current availability or employment is not inferred.`
      });
    }
  }
}

type Accumulated = { confidence: ReviewSuggestion["confidence"]; paths: Set<string>; evidence: ReviewEvidence[] };
function add(
  accumulated: Map<string, Accumulated>,
  reviewer: string,
  confidence: ReviewSuggestion["confidence"],
  path: string,
  evidence: ReviewEvidence
): void {
  const identity = reviewer.trim();
  if (!identity || identity.length > 200 || /[\0-\x1f\x7f]/.test(identity)) return;
  const existing = accumulated.get(identity) ?? { confidence, paths: new Set<string>(), evidence: [] };
  if (confidenceOrder(confidence) < confidenceOrder(existing.confidence)) existing.confidence = confidence;
  existing.paths.add(path);
  const routed = { ...evidence, changedPath: path };
  if (!existing.evidence.some((entry) => evidenceKey(entry) === evidenceKey(routed))) existing.evidence.push(routed);
  accumulated.set(identity, existing);
}
function normalizePaths(values: readonly string[]): string[] {
  const normalized = values.map((value) => value.replace(/\\/g, "/"));
  const invalid = normalized.find((value) => !safePath(value));
  if (invalid !== undefined) throw new Error(`Invalid review-routing path: ${String(invalid)}`);
  return [...new Set(normalized)].sort();
}
function safePath(value: string): boolean {
  return Boolean(value) && value.length <= 1_000 && !value.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..");
}
function validOwner(value: string): boolean {
  return value.length <= 200 && (/^@[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/.test(value) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}
function evidenceKey(value: ReviewEvidence): string { return `${value.kind}\0${value.sourceFingerprint}\0${value.path ?? ""}\0${value.line ?? ""}\0${value.changedPath ?? ""}\0${value.detail}`; }
function evidenceOrder(a: ReviewEvidence, b: ReviewEvidence): number {
  return a.kind.localeCompare(b.kind) || (a.changedPath ?? "").localeCompare(b.changedPath ?? "") ||
    (a.path ?? "").localeCompare(b.path ?? "") || (a.line ?? 0) - (b.line ?? 0);
}
function confidenceOrder(value: ReviewSuggestion["confidence"]): number { return value === "high" ? 0 : value === "medium" ? 1 : 2; }

/**
 * GitHub notifies anyone written as `@name`. Reviewer output is only a suggestion, so every
 * handle-style mention loses its `@`; e-mail addresses (a word character before `@`) stay.
 */
export function withoutMentions(value: string): string {
  return value.replace(/(^|[^A-Za-z0-9_.+-])@+(?=[A-Za-z0-9])/g, "$1");
}

/** A copy of the routing result that is safe to print or post where `@name` would notify someone. */
export function reviewRoutingWithoutMentions(result: ReviewRoutingResult): ReviewRoutingResult {
  return {
    ...result,
    suggestions: result.suggestions.map((suggestion) => ({
      ...suggestion,
      reviewer: withoutMentions(suggestion.reviewer),
      evidence: suggestion.evidence.map((entry) => ({ ...entry, detail: withoutMentions(entry.detail) }))
    })).sort((a, b) => confidenceOrder(a.confidence) - confidenceOrder(b.confidence) || a.reviewer.localeCompare(b.reviewer)),
    diagnostics: result.diagnostics.map((entry) => ({ ...entry, message: withoutMentions(entry.message) }))
  };
}

const EVIDENCE_LABEL: Record<ReviewEvidence["kind"], string> = {
  codeowners: "CODEOWNERS",
  annotation: "annotation",
  "architecture-policy": "architecture policy",
  "git-history": "commit history"
};

/** Markdown grouped by changed path. Names are code spans without `@`, so nobody is notified. */
export function renderReviewRoutingMarkdown(input: ReviewRoutingResult): string {
  const result = reviewRoutingWithoutMentions(input);
  const lines = [
    "# FixMap reviewer suggestions (preview)",
    "",
    "Suggestions only. FixMap does not request reviews or notify anyone, and a name is not evidence of identity, employment, or current availability.",
    ""
  ];
  if (result.changedPaths.length === 0) lines.push("No changed paths, so there is nothing to route.", "");
  for (const path of result.changedPaths) {
    lines.push(`## ${markdownCode(path)}`, "");
    const rows = result.suggestions
      .map((suggestion) => ({ suggestion, evidence: suggestion.evidence.filter((entry) => entry.changedPath === path) }))
      .filter((row) => row.evidence.length > 0);
    if (rows.length === 0) lines.push("- No reviewer evidence for this path.");
    for (const { suggestion, evidence } of rows) {
      lines.push(`- ${markdownCode(suggestion.reviewer)} (${suggestion.confidence})`);
      for (const entry of evidence) {
        const source = entry.kind !== "git-history" && entry.path
          ? ` ${markdownCode(entry.line === undefined ? entry.path : `${entry.path}:${entry.line}`)}`
          : "";
        lines.push(`  - ${EVIDENCE_LABEL[entry.kind]}${source}: ${entry.detail}`);
      }
    }
    lines.push("");
  }
  if (result.diagnostics.length > 0) {
    lines.push("## Diagnostics", "");
    for (const entry of result.diagnostics) lines.push(`- ${entry.severity} (${markdownCode(entry.source)}): ${entry.message}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
