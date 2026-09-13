import type { RepoMap } from "./types.js";

export type DecisionStatus = "proposed" | "accepted" | "rejected" | "deprecated" | "superseded" | "unknown";

export type DecisionTarget =
  | { kind: "file"; path: string; evidence: "explicit" | "literal-mention" }
  | { kind: "symbol"; name: string; path?: string; evidence: "explicit" }
  | { kind: "service" | "contract"; name: string; evidence: "explicit" };

export type DecisionRecord = {
  id: string;
  path: string;
  title: string;
  status: DecisionStatus;
  date?: string;
  context?: string;
  decision: string;
  consequences?: string;
  targets: DecisionTarget[];
  supersedes: string[];
  sourceFingerprint: string;
  /** Repository-authored attribution, not proof of remote contents or authorship. */
  source?: { kind: "pull-request"; url: string; verification: "unverified-local-attribution" };
};

export type DecisionDiagnostic = {
  code: "decision-source-incomplete" | "decision-parse-failed" | "decision-target-missing";
  severity: "info" | "warning";
  path: string;
  message: string;
};

export type DecisionInventory = {
  decisionInventoryVersion: 1;
  records: DecisionRecord[];
  diagnostics: DecisionDiagnostic[];
};

const DECISION_PATH = /(?:^|\/)(?:docs\/)?(?:adr|adrs|architecture\/decisions|decisions|rfcs?|design)(?:\/|$)|(?:^|\/)(?:architecture|design|rationale)\.md$|(?:^|\/)adr[-_ ]?\d+[^/]*\.md$/i;
const PATH_LIKE = /^(?:[A-Za-z0-9_.@-]+\/)+[A-Za-z0-9_.@() +\[\]-]+(?:\.[A-Za-z0-9]+)?$/;

/** Parses repository-owned ADR/rationale documents without generating substitute rationale. */
export function inventoryDecisionRecords(repo: RepoMap): DecisionInventory {
  const records: DecisionRecord[] = [];
  const diagnostics: DecisionDiagnostic[] = [];
  const knownPaths = new Set(repo.files.map((file) => normalizePath(file.path)));
  for (const file of repo.files.filter((candidate) => DECISION_PATH.test(normalizePath(candidate.path)))) {
    if (file.textSampleComplete === false || !file.contentFingerprint) {
      diagnostics.push({
        code: "decision-source-incomplete",
        severity: "warning",
        path: file.path,
        message: `${file.path} looks like a decision record, but complete content and an exact fingerprint were unavailable.`
      });
      continue;
    }
    let result: ReturnType<typeof parseDecisionRecord>;
    try {
      result = parseDecisionRecord({
        path: file.path,
        content: file.textSample,
        fingerprint: file.contentFingerprint,
        knownPaths
      });
    } catch {
      diagnostics.push({
        code: "decision-parse-failed",
        severity: "warning",
        path: file.path,
        message: `${file.path} was not treated as human intent because its metadata, targets, or prose failed decision-record validation.`
      });
      continue;
    }
    if (result.record) {
      records.push(result.record);
      const missing = result.record.targets.flatMap((target) => {
        const targetPath = target.kind === "file" ? target.path : target.kind === "symbol" ? target.path : undefined;
        return targetPath && !knownPaths.has(targetPath) ? [targetPath] : [];
      });
      if (missing.length > 0) diagnostics.push({
        code: "decision-target-missing",
        severity: "warning",
        path: file.path,
        message: `${file.path} explicitly targets missing repository path${missing.length === 1 ? "" : "s"}: ${[...new Set(missing)].sort().join(", ")}.`
      });
    }
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  }
  return {
    decisionInventoryVersion: 1,
    records: records.sort((a, b) => a.path.localeCompare(b.path)),
    diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))
  };
}

export function selectDecisionRecords(
  inventory: DecisionInventory,
  input: { paths: readonly string[]; task: string }
): DecisionRecord[] {
  if (inventory.decisionInventoryVersion !== 1) throw new Error("Unsupported decision inventory version.");
  const paths = new Set(input.paths.map(normalizePath));
  const task = input.task.toLowerCase();
  return inventory.records.filter((record) =>
    record.targets.some((target) => target.kind === "file" && paths.has(target.path) ||
      target.kind === "symbol" && Boolean(target.path && paths.has(target.path)) ||
      (target.kind === "service" || target.kind === "contract") && containsLiteralTerm(task, target.name)) ||
    titleTerms(record.title).some((term) => containsLiteralTerm(task, term))
  );
}

export function parseDecisionRecord(input: {
  path: string;
  content: string;
  fingerprint: string;
  knownPaths?: ReadonlySet<string>;
}): { record?: DecisionRecord; diagnostic?: DecisionDiagnostic } {
  const path = validatePath(input.path);
  if (!input.fingerprint.trim() || /[\0-\x20]/.test(input.fingerprint)) throw new Error(`Invalid decision fingerprint for ${path}.`);
  if (path.toLowerCase().endsWith(".json")) {
    const document: unknown = JSON.parse(input.content);
    if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Invalid local PR description export.");
    const exported = document as Record<string, unknown>;
    if (typeof exported.title !== "string" || typeof exported.body !== "string" || !isDecisionPullRequestUrl(exported.url) ||
      (exported.fixmapAppliesTo !== undefined && typeof exported.fixmapAppliesTo !== "string")) throw new Error("Invalid local PR description export.");
    normalizeProse(exported.body, 8_000);
    return { record: {
      id: `decision:${stableHash(path)}`, path, title: normalizeProse(exported.title, 300),
      status: "unknown", decision: exported.body,
      targets: normalizeTargets([
        ...parseExplicitTargets(exported.fixmapAppliesTo as string | undefined ?? ""),
        ...literalPathTargets(exported.body, input.knownPaths ?? new Set<string>())
      ]),
      supersedes: [], sourceFingerprint: input.fingerprint,
      source: { kind: "pull-request", url: exported.url, verification: "unverified-local-attribution" }
    } };
  }
  const { frontmatter, body } = splitFrontmatter(input.content);
  const sections = markdownSections(body);
  const title = firstHeading(body) ?? frontmatter.title;
  const decision = section(sections, ["decision", "resolution", "proposal"]);
  if (!title || !decision) {
    return {
      diagnostic: {
        code: "decision-parse-failed",
        severity: "warning",
        path,
        message: `${path} was not treated as human intent because it needs a title and a Decision, Resolution, or Proposal section.`
      }
    };
  }
  const statusText = frontmatter.status ?? section(sections, ["status"]);
  const context = section(sections, ["context", "problem", "motivation"]);
  const consequences = section(sections, ["consequences", "tradeoffs", "trade-offs", "outcome"]);
  const appliesTo = [frontmatter["fixmap-applies-to"], section(sections, ["applies to", "scope"])]
    .filter((value): value is string => Boolean(value)).join("\n");
  const supersedesText = [frontmatter.supersedes, section(sections, ["supersedes"])]
    .filter((value): value is string => Boolean(value)).join("\n");
  const targets = normalizeTargets([
    ...parseExplicitTargets(appliesTo),
    ...literalPathTargets(body, input.knownPaths ?? new Set<string>())
  ]);
  const date = normalizeDate(frontmatter.date ?? section(sections, ["date"]));
  const sourceUrl = frontmatter["fixmap-source-pr"];
  if (sourceUrl !== undefined && !isDecisionPullRequestUrl(sourceUrl)) throw new Error("Invalid decision pull-request source.");
  return {
    record: {
      id: `decision:${stableHash(path)}`,
      path,
      title: normalizeProse(title, 300),
      status: normalizeStatus(statusText),
      ...(date ? { date } : {}),
      ...(context ? { context: normalizeProse(context, 8_000) } : {}),
      decision: normalizeProse(decision, 8_000),
      ...(consequences ? { consequences: normalizeProse(consequences, 8_000) } : {}),
      targets,
      supersedes: parseReferences(supersedesText),
      sourceFingerprint: input.fingerprint,
      ...(sourceUrl ? { source: { kind: "pull-request" as const, url: sourceUrl, verification: "unverified-local-attribution" as const } } : {})
    }
  };
}

/** Only canonical public GitHub PR references; this never fetches the URL. */
export function isDecisionPullRequestUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 500 &&
    /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(value) &&
    !value.split("/").some((part) => part === "." || part === "..");
}

function splitFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return { frontmatter: {}, body: content };
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/.exec(content);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter: Record<string, string> = {};
  let currentKey: string | undefined;
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (field?.[1] && field[2] !== undefined) {
      currentKey = field[1].toLowerCase();
      frontmatter[currentKey] = unquote(field[2].trim());
      continue;
    }
    const item = /^\s*-\s+(.+)$/.exec(line)?.[1]?.trim();
    if (item && currentKey) frontmatter[currentKey] = `${frontmatter[currentKey] ? `${frontmatter[currentKey]}\n` : ""}${unquote(item)}`;
  }
  return { frontmatter, body: content.slice(match[0].length) };
}

function markdownSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const matches = documentHeadings(body);
  for (const [index, match] of matches.entries()) {
    if (match.level < 2) continue;
    const title = match.title.toLowerCase();
    const start = match.end;
    const end = matches.slice(index + 1).find((next) => next.level <= match.level)?.start ?? body.length;
    sections.set(title, body.slice(start, end).trim());
  }
  return sections;
}

function section(sections: ReadonlyMap<string, string>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const exact = sections.get(name);
    if (exact) return exact;
    const prefixed = [...sections].find(([heading]) => heading.startsWith(`${name}:`) || heading.startsWith(`${name} `))?.[1];
    if (prefixed) return prefixed;
  }
  return undefined;
}

function firstHeading(body: string): string | undefined {
  return documentHeadings(body).find((heading) => heading.level === 1)?.title;
}

function documentHeadings(body: string): Array<{ level: number; title: string; start: number; end: number }> {
  const headings: Array<{ level: number; title: string; start: number; end: number }> = [];
  let fence: { marker: string; length: number } | undefined;
  let offset = 0;
  for (const line of body.split(/(?<=\n)/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r?\n$/, ""));
    if (fence) {
      if (delimiter && delimiter[1]![0] === fence.marker && delimiter[1]!.length >= fence.length && !delimiter[2]!.trim()) fence = undefined;
    } else if (delimiter) {
      fence = { marker: delimiter[1]![0]!, length: delimiter[1]!.length };
    } else {
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n)?$/.exec(line);
      if (heading) headings.push({ level: heading[1]!.length, title: heading[2]!.trim(), start: offset, end: offset + line.length });
    }
    offset += line.length;
  }
  return headings;
}

function parseExplicitTargets(text: string): DecisionTarget[] {
  const targets: DecisionTarget[] = [];
  const values = text.replace(/^\s*[-*]\s+/gm, "").replace(/^\[|\]$/g, "").split(/[\n,]/)
    .map((value) => unquote(value.trim().replace(/^`|`$/g, ""))).filter(Boolean);
  for (const value of values) {
    const typed = /^(file|symbol|service|contract)\s*:\s*(.+)$/i.exec(value);
    const kind = typed?.[1]?.toLowerCase();
    const payload = (typed?.[2] ?? value).trim();
    if (kind === "symbol") {
      const [name, path] = payload.split("@").map((part) => part.trim());
      if (name) targets.push({ kind: "symbol", name, ...(path ? { path: validatePath(path) } : {}), evidence: "explicit" });
    } else if (kind === "service" || kind === "contract") {
      if (payload) targets.push({ kind, name: payload, evidence: "explicit" });
    } else if (kind === "file" || PATH_LIKE.test(payload)) {
      targets.push({ kind: "file", path: validatePath(payload), evidence: "explicit" });
    }
  }
  return targets;
}

function literalPathTargets(body: string, knownPaths: ReadonlySet<string>): DecisionTarget[] {
  return [...body.matchAll(/`([^`\r\n]+)`/g)].flatMap((match): DecisionTarget[] => {
    const candidate = normalizePath(match[1]?.trim() ?? "");
    return knownPaths.has(candidate) ? [{ kind: "file", path: candidate, evidence: "literal-mention" }] : [];
  });
}

function normalizeTargets(targets: DecisionTarget[]): DecisionTarget[] {
  const byKey = new Map<string, DecisionTarget>();
  for (const target of targets) {
    const key = target.kind === "file" ? `file:${target.path}`
      : target.kind === "symbol" ? `symbol:${target.path ?? ""}:${target.name}`
        : `${target.kind}:${target.name}`;
    const existing = byKey.get(key);
    if (!existing || existing.evidence === "literal-mention") byKey.set(key, { ...target });
  }
  return [...byKey.values()].sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}

function targetKey(target: DecisionTarget): string {
  if (target.kind === "file") return `file:${target.path}`;
  if (target.kind === "symbol") return `symbol:${target.path ?? ""}:${target.name}`;
  return `${target.kind}:${target.name}`;
}

function parseReferences(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((value) => value.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean))].sort();
}

function normalizeStatus(value: string | undefined): DecisionStatus {
  const normalized = value?.toLowerCase().replace(/[*_`]/g, " ").trim() ?? "";
  const labels: Record<string, DecisionStatus> = {
    accepted: "accepted", approved: "accepted", active: "accepted",
    proposed: "proposed", draft: "proposed", pending: "proposed",
    rejected: "rejected", declined: "rejected", deprecated: "deprecated",
    obsolete: "deprecated", superseded: "superseded", replaced: "superseded"
  };
  // A status label is not free-text sentiment: negations and history must not
  // turn an unaccepted or superseded proposal into an accepted decision.
  const match = /^([a-z]+)(?=$|[\s:,(])/.exec(normalized);
  const status = match?.[1] ? labels[match[1]] : undefined;
  if (!status) return "unknown";
  const remainder = normalized.slice(match![0].length);
  if (/\b(?:not|never|no longer)\b/.test(remainder)) return "unknown";
  for (const word of remainder.match(/[a-z]+/g) ?? []) {
    if (labels[word] && labels[word] !== status) return "unknown";
  }
  return status;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim().split(/\s+/)[0];
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== candidate) return undefined;
  return candidate;
}

function normalizeProse(value: string, maximum: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) throw new Error("Decision record prose is empty or exceeds the supported bound.");
  return normalized;
}

function titleTerms(title: string): string[] {
  return title.toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}/g)?.filter((term) => !["decision", "record", "architecture", "using", "with"].includes(term)) ?? [];
}

function containsLiteralTerm(text: string, term: string): boolean {
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_-])${literal}(?=$|[^\\p{L}\\p{N}_-])`, "iu").test(text);
}

function validatePath(value: string): string {
  const normalized = normalizePath(value.trim());
  if (!normalized || /^(?:[\\/]|[A-Za-z]:)/.test(value) || value.includes("\0") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid decision path: ${value}`);
  }
  return normalized;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function unquote(value: string): string {
  return value.replace(/^(?:["'])(.*)(?:["'])$/, "$1");
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
