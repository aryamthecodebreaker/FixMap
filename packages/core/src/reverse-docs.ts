import type { ArchitectureSnapshot } from "./architecture.js";
import type { DecisionRecord } from "./decisions.js";
import type { RepoMap } from "./types.js";

export type ReverseDocumentationTarget = {
  id: string;
  title: string;
  kind: "module" | "architecture";
  paths: string[];
  requestedPath: string;
};

export type ReverseDocumentationDraft = {
  reverseDocumentationVersion: 1;
  id: string;
  title: string;
  kind: ReverseDocumentationTarget["kind"];
  destination: { requestedPath: string; status: "available" | "occupied-existing-file" };
  sources: {
    architectureFingerprint: string;
    files: Array<{ path: string; contentFingerprint: string }>;
    decisions: Array<{ id: string; path: string; sourceFingerprint: string }>;
  };
  observed: string[];
  inferred: Array<{ text: string; evidencePaths: string[] }>;
  unknown: string[];
  markdown: string;
  reviewRequired: true;
  writeAuthorized: false;
  overwriteAuthorized: false;
  diagnostics: string[];
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

/** Produces review-only drafts and never writes to the repository. */
export function draftReverseDocumentation(
  repo: Pick<RepoMap, "files">,
  architecture: ArchitectureSnapshot,
  decisions: readonly DecisionRecord[],
  targets: readonly ReverseDocumentationTarget[]
): ReverseDocumentationDraft[] {
  const normalizedTargets = validateInputs(repo, architecture, decisions, targets);
  const files = new Map(repo.files.map((file) => [normalizePath(file.path), { ...file, path: normalizePath(file.path) }]));
  return normalizedTargets.map((target) => {
    const targetFiles = target.paths.map((path) => files.get(path)!);
    const targetSet = new Set(target.paths);
    const relevantEdges = architecture.edges.filter((edge) => targetSet.has(edge.from) || targetSet.has(edge.to));
    const relevantDecisions = decisions.filter((decision) => decision.targets.some((entry) =>
      (entry.kind === "file" && targetSet.has(entry.path)) || (entry.kind === "symbol" && Boolean(entry.path && targetSet.has(entry.path)))));
    const observed = [
      `${target.paths.length} exact repository file${target.paths.length === 1 ? " is" : "s are"} in the declared ${target.kind} scope.`,
      `${relevantEdges.length} architecture edge${relevantEdges.length === 1 ? " touches" : "s touch"} the declared scope.`,
      ...relevantEdges.slice(0, 1_000).map((edge) => `Observed import edge: ${edge.from} -> ${edge.to}.`),
      ...relevantDecisions.slice(0, 100).map((decision) =>
        `Authored decision ${decision.id} (${decision.status}), "${inlineText(decision.title, 300)}": ${inlineText(decision.decision, 1_500)}`)
    ];
    const inferred = target.paths.flatMap((path) => {
      const coupling = architecture.coupling.find((entry) => entry.path === path);
      if (!coupling || coupling.total === 0) return [];
      return [{
        text: `${path} may require coordination because the snapshot records ${coupling.incoming} incoming and ${coupling.outgoing} outgoing edge${coupling.total === 1 ? "" : "s"}; this does not establish architectural intent.`,
        evidencePaths: [path, ...relevantEdges.filter((edge) => edge.from === path || edge.to === path)
          .flatMap((edge) => [edge.from, edge.to])].filter((value, index, values) => values.indexOf(value) === index).sort()
      }];
    }).slice(0, 1_000);
    const unknown = [
      "Runtime behavior and production traffic are unknown unless separate runtime evidence is supplied.",
      "Ownership and current reviewer availability are unknown from structural evidence alone.",
      ...(relevantDecisions.length === 0 ? ["The design rationale is unknown because no authored decision record targets this scope."] : []),
      "Absence from this draft does not prove that a dependency, contract, or operational constraint does not exist."
    ];
    const destinationStatus = files.has(target.requestedPath) ? "occupied-existing-file" as const : "available" as const;
    const sources = {
      architectureFingerprint: architecture.fingerprint,
      files: targetFiles.map((file) => ({ path: file.path, contentFingerprint: file.contentFingerprint! })),
      decisions: relevantDecisions.map((decision) => ({ id: decision.id, path: decision.path, sourceFingerprint: decision.sourceFingerprint }))
    };
    const id = `reverse-doc:${stableHash(canonicalize({ target, sources }))}`;
    const diagnostics = destinationStatus === "occupied-existing-file"
      ? [`${target.requestedPath} already exists; this draft is not an overwrite proposal.`] : [];
    const base = {
      reverseDocumentationVersion: 1 as const,
      id,
      title: target.title.trim(),
      kind: target.kind,
      destination: { requestedPath: target.requestedPath, status: destinationStatus },
      sources,
      observed,
      inferred,
      unknown,
      reviewRequired: true as const,
      writeAuthorized: false as const,
      overwriteAuthorized: false as const,
      diagnostics
    };
    return { ...base, markdown: renderReverseDocumentationMarkdown(base) };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function renderReverseDocumentationMarkdown(
  draft: Omit<ReverseDocumentationDraft, "markdown">
): string {
  const lines = [
    `# ${draft.title}`,
    "",
    "> Review-only reverse-documentation draft. Observations, inferences, and unknowns are separated. No write or overwrite is authorized.",
    "",
    "## Observed",
    "",
    ...draft.observed.map((entry) => `- ${entry}`),
    "",
    "## Inferred",
    "",
    ...(draft.inferred.length ? draft.inferred.map((entry) => `- ${entry.text} Evidence paths: ${entry.evidencePaths.map((path) => `\`${path}\``).join(", ")}.`) : ["- No structural inference was generated."]),
    "",
    "## Unknown",
    "",
    ...draft.unknown.map((entry) => `- ${entry}`),
    "",
    "## Provenance",
    "",
    `- Architecture snapshot: \`${draft.sources.architectureFingerprint}\``,
    ...draft.sources.files.map((file) => `- File: \`${file.path}\` at \`${file.contentFingerprint}\``),
    ...draft.sources.decisions.map((decision) => `- Decision: \`${decision.id}\` from \`${decision.path}\` at \`${decision.sourceFingerprint}\``)
  ];
  if (draft.diagnostics.length) lines.push("", "## Diagnostics", "", ...draft.diagnostics.map((entry) => `- ${entry}`));
  return `${lines.join("\n")}\n`;
}

function validateInputs(
  repo: Pick<RepoMap, "files">,
  architecture: ArchitectureSnapshot,
  decisions: readonly DecisionRecord[],
  targets: readonly ReverseDocumentationTarget[]
): ReverseDocumentationTarget[] {
  if (!repo || !Array.isArray(repo.files) || !architecture || architecture.architectureSnapshotVersion !== 1 ||
    !exactFingerprint(architecture.fingerprint) || !exactFingerprint(architecture.sourceFingerprint) ||
    !Array.isArray(architecture.edges) || !architecture.edges.every((edge) => safePath(edge.from) && safePath(edge.to)) ||
    !Array.isArray(architecture.coupling) || !architecture.coupling.every((entry) => safePath(entry.path) &&
      [entry.incoming, entry.outgoing, entry.total].every((value) => Number.isSafeInteger(value) && value >= 0) &&
      entry.total === entry.incoming + entry.outgoing) ||
    !Array.isArray(decisions) || decisions.length > 10_000 || !Array.isArray(targets) || targets.length > 100) {
    throw new Error("Invalid reverse-documentation input envelope.");
  }
  const filePaths = repo.files.map((file) => normalizePath(file.path));
  if (!filePaths.every(safePath)) throw new Error("Invalid reverse-documentation repository path.");
  assertUnique(filePaths, "reverse-documentation repository file");
  const filePathSet = new Set(filePaths);
  if (architecture.edges.some((edge) => !filePathSet.has(normalizePath(edge.from)) || !filePathSet.has(normalizePath(edge.to))) ||
    architecture.coupling.some((entry) => !filePathSet.has(normalizePath(entry.path)))) {
    throw new Error("Reverse-documentation architecture references a file outside the repository snapshot.");
  }
  const exactFiles = new Map(repo.files.map((file) => [normalizePath(file.path), file.contentFingerprint]));
  decisions.forEach((decision, index) => {
    if (!decision || !/^decision:[a-f0-9]{16}$/.test(decision.id) || !safePath(decision.path) ||
      !bounded(decision.title, 2_000) || !bounded(decision.decision, 20_000) || !exactFingerprint(decision.sourceFingerprint) ||
      !["proposed", "accepted", "rejected", "deprecated", "superseded", "unknown"].includes(decision.status) ||
      !Array.isArray(decision.supersedes) || !decision.supersedes.every((id: string) => /^decision:[a-f0-9]{16}$/.test(id)) ||
      !Array.isArray(decision.targets) || decision.targets.some((target: DecisionRecord["targets"][number]) =>
        (target.kind === "file" && !safePath(target.path)) ||
        (target.kind === "symbol" && (!bounded(target.name, 500) || (target.path !== undefined && !safePath(target.path)))) ||
        ((target.kind === "service" || target.kind === "contract") && !bounded(target.name, 500)))) {
      throw new Error(`Invalid reverse-documentation decision at index ${index}.`);
    }
  });
  assertUnique(decisions.map((decision) => decision.id), "reverse-documentation decision");
  const normalizedTargets = targets.map((target, index) => {
    if (!target || !ID.test(target.id) || !bounded(target.title, 500) || !["module", "architecture"].includes(target.kind) ||
      !Array.isArray(target.paths) || target.paths.length === 0 || target.paths.length > 1_000 ||
      !target.paths.every(safePath) || !safePath(target.requestedPath)) {
      throw new Error(`Invalid reverse-documentation target at index ${index}.`);
    }
    const normalized = { ...target, title: target.title.trim(), paths: [...new Set(target.paths.map(normalizePath))].sort(),
      requestedPath: normalizePath(target.requestedPath) };
    for (const path of normalized.paths) {
      if (!exactFiles.has(path)) throw new Error(`Reverse-documentation target path does not exist: ${path}`);
      if (!exactFingerprint(exactFiles.get(path))) throw new Error(`Reverse-documentation target lacks exact fingerprint: ${path}`);
    }
    return normalized;
  });
  assertUnique(normalizedTargets.map((target) => target.id), "reverse-documentation target");
  return normalizedTargets;
}

function inlineText(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}
function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }
function safePath(value: string): boolean {
  const normalized = normalizePath(value);
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function exactFingerprint(value: unknown): value is string { return bounded(value, 256) && !/[\0-\x20]/.test(value); }
function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}
function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`Duplicate ${label} id: ${duplicate}`);
}
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, "0");
}
