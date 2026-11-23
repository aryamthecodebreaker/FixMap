import {
  collectSensitiveDataSignals,
  SENSITIVE_DATA_PROVIDER_ID,
  SENSITIVE_DATA_PROVIDER_VERSION,
  sensitiveSignalLine,
  type SensitiveDataCategory,
  type SensitiveSinkCategory
} from "./sensitive-data.js";
import { markdownCode } from "./markdown.js";
import { isRepositoryRelativePath } from "./paths.js";
import type { RepoFile, RepoMap, VerifyFinding } from "./types.js";

/** One end of a possible flow: a file, the indicator kind, and the rule ids that matched. Never the matched text. */
export type SensitiveDataSignalLocation<T extends string> = {
  path: string;
  category: T;
  ruleIds: string[];
  /** First 1-based line where one of the rules matched on a single line, when one did. */
  line?: number;
};

export type SensitiveDataFlow = {
  relation: "same-file" | "direct-import";
  source: SensitiveDataSignalLocation<SensitiveDataCategory>;
  sink: SensitiveDataSignalLocation<SensitiveSinkCategory>;
  /** Verify only: absent from the pre-change file contents reconstructed from the diff. */
  introducedByDiff?: true;
};

/**
 * Lexical sensitive-data indicators about the files a report covers. Locations and
 * kinds only: matched values are never copied into the report.
 */
export type ReportSensitiveData = {
  sensitiveDataVersion: 1;
  provider: { id: typeof SENSITIVE_DATA_PROVIDER_ID; version: string };
  analysis: "lexical-signals-and-direct-import-structure";
  completeness: "not-a-security-proof";
  scannedFiles: number;
  skippedFiles: number;
  flows: SensitiveDataFlow[];
  /** Flows touching the report's paths that were not listed because of the size bound. */
  omittedFlows: number;
  /** Verify only: whether pre-change contents could be reconstructed from the diff. */
  introducedCheck?: "compared-with-diff" | "unavailable-diff-truncated";
};

export const MAX_REPORT_SENSITIVE_DATA_FLOWS = 50;

const SOURCE_CATEGORIES: readonly string[] = ["credential", "token", "pii", "payment"];
const SINK_CATEGORIES: readonly string[] = ["logging", "network", "storage", "analytics"];
const RULE_ID = /^[a-z0-9-]{1,64}$/;

type Signal = { path: string; role: "source" | "sink"; category: string; ruleIds: string[] };

/**
 * Runs the local `fixmap-sensitive-data` analysis and keeps flows with an end among
 * `focusPaths`. With `compareWithDiff`, each changed file's pre-change contents are
 * reconstructed from `repo.diffText` and the flows absent there are marked as introduced.
 */
export function buildReportSensitiveData(
  repo: Pick<RepoMap, "root" | "files" | "changedFiles" | "diffText" | "diagnostics" | "trackedFiles">,
  focusPaths: ReadonlySet<string>,
  options: { compareWithDiff?: boolean } = {}
): ReportSensitiveData {
  const after = flowsFrom(repo.root, repo.files);
  let introducedCheck: ReportSensitiveData["introducedCheck"];
  let before: Set<string> | undefined;
  if (options.compareWithDiff) {
    const previousFiles = filesBeforeDiff(repo);
    introducedCheck = previousFiles ? "compared-with-diff" : "unavailable-diff-truncated";
    if (previousFiles) before = new Set(flowsFrom(repo.root, previousFiles).flows.map(flowKey));
  }

  const relevant = after.flows
    .filter((flow) => focusPaths.has(flow.source.path) || focusPaths.has(flow.sink.path))
    .map((flow): SensitiveDataFlow => before && !before.has(flowKey(flow)) ? { ...flow, introducedByDiff: true } : flow)
    .sort((a, b) =>
      Number(b.introducedByDiff === true) - Number(a.introducedByDiff === true) ||
      a.relation.localeCompare(b.relation) ||
      flowKey(a).localeCompare(flowKey(b))
    );
  const textByPath = new Map(repo.files.map((file) => [file.path, file.textSample]));
  const withLine = <T extends string>(end: SensitiveDataSignalLocation<T>): SensitiveDataSignalLocation<T> => {
    const line = sensitiveSignalLine(textByPath.get(end.path) ?? "", end.ruleIds);
    return line === undefined ? end : { ...end, line };
  };
  const flows = relevant.slice(0, MAX_REPORT_SENSITIVE_DATA_FLOWS)
    .map((flow) => ({ ...flow, source: withLine(flow.source), sink: withLine(flow.sink) }));
  return {
    sensitiveDataVersion: 1,
    provider: { id: SENSITIVE_DATA_PROVIDER_ID, version: SENSITIVE_DATA_PROVIDER_VERSION },
    analysis: "lexical-signals-and-direct-import-structure",
    completeness: "not-a-security-proof",
    scannedFiles: after.scannedFiles,
    skippedFiles: after.skippedFiles,
    flows,
    omittedFlows: relevant.length - flows.length,
    ...(introducedCheck ? { introducedCheck } : {})
  };
}

/** Advisory Verify finding for flows the diff introduced; undefined when there are none. */
export function sensitiveDataVerifyFinding(evidence: ReportSensitiveData): VerifyFinding | undefined {
  const introduced = evidence.flows.filter((flow) => flow.introducedByDiff);
  if (introduced.length === 0) return undefined;
  const paths = [...new Set(introduced.flatMap((flow) => [flow.source.path, flow.sink.path]))];
  const examples = introduced.slice(0, 3).map(describeFlow).join("; ");
  return {
    code: "sensitive-data-flow-introduced",
    severity: "info",
    paths: paths.slice(0, 8),
    message:
      `This diff adds ${introduced.length === 1 ? "a possible sensitive-data flow" : `${introduced.length} possible sensitive-data flows`} ` +
      `from lexical evidence (${examples}${introduced.length > 3 ? "; …" : ""}). ` +
      "Value flow was not verified; check that no secret or personal data reaches the sink."
  };
}

export function renderSensitiveDataMarkdown(evidence: ReportSensitiveData): string[] {
  return [
    "",
    "## Sensitive Data",
    "",
    `Lexical indicators from \`${evidence.provider.id}\` ${evidence.provider.version} across ${evidence.scannedFiles} scanned file${evidence.scannedFiles === 1 ? "" : "s"}` +
      `${evidence.skippedFiles > 0 ? ` (${evidence.skippedFiles} skipped)` : ""}. Locations and kinds only; matched values are not shown. ` +
      "This is not a taint analysis or a security proof.",
    ...(evidence.introducedCheck === "unavailable-diff-truncated"
      ? ["", "The diff was too large to reconstruct pre-change contents, so newly introduced flows could not be identified."]
      : []),
    "",
    ...(evidence.flows.length > 0
      ? evidence.flows.map((flow) => `- ${flow.introducedByDiff ? "**new** " : ""}${describeFlow(flow)}`)
      : ["- No possible source-to-sink flows touch the files in this report."]),
    ...(evidence.omittedFlows > 0
      ? ["", `${evidence.omittedFlows} further flow${evidence.omittedFlows === 1 ? " was" : "s were"} not listed.`]
      : [])
  ];
}

export function isReportSensitiveData(candidate: unknown): candidate is ReportSensitiveData {
  if (!isRecord(candidate) || candidate.sensitiveDataVersion !== 1 || !isRecord(candidate.provider) ||
    candidate.provider.id !== SENSITIVE_DATA_PROVIDER_ID || typeof candidate.provider.version !== "string" ||
    candidate.analysis !== "lexical-signals-and-direct-import-structure" || candidate.completeness !== "not-a-security-proof" ||
    !count(candidate.scannedFiles) || !count(candidate.skippedFiles) || !count(candidate.omittedFlows) ||
    (candidate.introducedCheck !== undefined && !["compared-with-diff", "unavailable-diff-truncated"].includes(String(candidate.introducedCheck))) ||
    !Array.isArray(candidate.flows) || candidate.flows.length > MAX_REPORT_SENSITIVE_DATA_FLOWS) return false;
  return candidate.flows.every((flow) => isRecord(flow) &&
    (flow.relation === "same-file" || flow.relation === "direct-import") &&
    (flow.introducedByDiff === undefined || flow.introducedByDiff === true) &&
    validEnd(flow.source, SOURCE_CATEGORIES) && validEnd(flow.sink, SINK_CATEGORIES) &&
    (flow.relation !== "same-file" || (flow.source as { path: string }).path === (flow.sink as { path: string }).path));
}

function validEnd(candidate: unknown, categories: readonly string[]): boolean {
  return isRecord(candidate) && isRepositoryRelativePath(candidate.path) && categories.includes(String(candidate.category)) &&
    Array.isArray(candidate.ruleIds) && candidate.ruleIds.length > 0 && candidate.ruleIds.length <= 8 &&
    candidate.ruleIds.every((id) => typeof id === "string" && RULE_ID.test(id)) &&
    (candidate.line === undefined || (Number.isSafeInteger(candidate.line) && (candidate.line as number) > 0));
}

function describeFlow(flow: SensitiveDataFlow): string {
  const at = (end: SensitiveDataSignalLocation<string>) => markdownCode(end.line ? `${end.path}:${end.line}` : end.path);
  return flow.relation === "same-file"
    ? `${flow.source.category} → ${flow.sink.category} in ${at(flow.source)} and ${at(flow.sink)} (same file)`
    : `${flow.source.category} in ${at(flow.source)} → ${flow.sink.category} in ${at(flow.sink)} (direct import)`;
}

function flowsFrom(root: string, files: readonly RepoFile[]): { flows: SensitiveDataFlow[]; scannedFiles: number; skippedFiles: number } {
  const result = collectSensitiveDataSignals({ root, files: [...files] });
  const signals = new Map<string, Signal>();
  let scannedFiles = 0;
  let skippedFiles = 0;
  for (const item of result.items) {
    const metadata = item.metadata ?? {};
    if (item.id === "scope") {
      scannedFiles = Number(metadata.scannedFiles) || 0;
      skippedFiles = Number(metadata.skippedFiles) || 0;
      continue;
    }
    const subject = item.subjects[0];
    if (!subject || subject.kind !== "file") continue;
    signals.set(item.id, {
      path: subject.path,
      role: metadata.role === "sink" ? "sink" : "source",
      category: String(metadata.category),
      ruleIds: String(metadata.matchedRuleIds ?? "").split(",").filter(Boolean)
    });
  }
  const flows: SensitiveDataFlow[] = [];
  for (const relationship of result.relationships ?? []) {
    const source = signals.get(relationship.from);
    const sink = signals.get(relationship.to);
    if (!source || !sink) continue;
    flows.push({
      relation: relationship.relation === "same-file-sensitive-signal-and-sink" ? "same-file" : "direct-import",
      source: { path: source.path, category: source.category as SensitiveDataCategory, ruleIds: source.ruleIds },
      sink: { path: sink.path, category: sink.category as SensitiveSinkCategory, ruleIds: sink.ruleIds }
    });
  }
  return { flows, scannedFiles, skippedFiles };
}

function flowKey(flow: SensitiveDataFlow): string {
  return [flow.relation, flow.source.path, flow.source.category, flow.sink.path, flow.sink.category].join("\0");
}

type FilePatch = { added: string[]; removed: string[]; created: boolean };

/**
 * Pre-change contents of the scanned files, rebuilt from the unified diff as a line
 * multiset (the lexical rules match single lines, so order does not matter). Returns
 * undefined when the diff was sampled and no longer carries removed lines.
 */
function filesBeforeDiff(
  repo: Pick<RepoMap, "files" | "changedFiles" | "diffText" | "diagnostics" | "trackedFiles">
): RepoFile[] | undefined {
  if (repo.diagnostics.some((diagnostic) => diagnostic.code === "diff-text-truncated")) return undefined;
  const patches = parseUnifiedDiff(repo.diffText);
  const changed = new Set(repo.changedFiles);
  const tracked = repo.trackedFiles ? new Set(repo.trackedFiles) : undefined;
  return repo.files.flatMap((file): RepoFile[] => {
    if (!changed.has(file.path)) return [file];
    const patch = patches.get(file.path);
    // A changed path with no textual patch is untracked (new) or binary/renamed (treated as unchanged).
    if (!patch) return tracked && !tracked.has(file.path) ? [] : [file];
    if (patch.created) return [];
    const lines = file.textSample.split(/\r?\n/);
    for (const added of patch.added) {
      const index = lines.indexOf(added);
      if (index !== -1) lines.splice(index, 1);
    }
    return [{ ...file, textSample: [...lines, ...patch.removed].join("\n") }];
  });
}

function parseUnifiedDiff(diffText: string): Map<string, FilePatch> {
  const patches = new Map<string, FilePatch>();
  let current: FilePatch | undefined;
  let created = false;
  let inHunk = false;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current = undefined;
      created = false;
      inHunk = false;
    } else if (!inHunk && line.startsWith("--- ")) {
      created = line === "--- /dev/null";
    } else if (!inHunk && line.startsWith("+++ ")) {
      const path = diffPath(line.slice(4));
      current = path ? { added: [], removed: [], created } : undefined;
      if (path && current) patches.set(path, current);
    } else if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && current) {
      if (line.startsWith("+")) current.added.push(line.slice(1));
      else if (line.startsWith("-")) current.removed.push(line.slice(1));
    }
  }
  return patches;
}

function diffPath(raw: string): string | undefined {
  if (raw === "/dev/null") return undefined;
  let path = raw.replace(/\t.*$/, "");
  if (path.startsWith("\"")) {
    try { path = JSON.parse(path) as string; } catch { return undefined; }
  }
  return path.replace(/^[a-z]\//, "");
}

function count(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
