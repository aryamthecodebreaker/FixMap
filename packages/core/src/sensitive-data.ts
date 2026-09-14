import { buildImportGraph } from "./import-graph.js";
import type { EvidenceItem, EvidenceProvider, EvidenceProviderResult, EvidenceRelationship } from "./evidence.js";
import type { RepoFile } from "./types.js";

export type SensitiveDataCategory = "credential" | "token" | "pii" | "payment";
export type SensitiveSinkCategory = "logging" | "network" | "storage" | "analytics";

type SignalRule<T extends string> = { id: string; category: T; pattern: RegExp };
type ClassifiedFile = { file: RepoFile; sources: SensitiveDataCategory[]; sinks: SensitiveSinkCategory[] };

const MAX_ANALYZED_FILES = 5_000;
const MAX_RELATIONSHIPS = 10_000;
const PROVIDER_VERSION = "1.0.0";

const SOURCE_RULES: readonly SignalRule<SensitiveDataCategory>[] = [
  { id: "credential-password", category: "credential", pattern: /\b(?:password|passwd|credential|client[_-]?secret|api[_-]?key)\b/i },
  { id: "token-auth", category: "token", pattern: /\b(?:access[_-]?token|refresh[_-]?token|bearer|authorization|jwt)\b/i },
  { id: "pii-contact", category: "pii", pattern: /\b(?:email[_-]?address|phone[_-]?number|date[_-]?of[_-]?birth|social[_-]?security|ssn)\b/i },
  { id: "payment-card", category: "payment", pattern: /\b(?:card[_-]?number|payment[_-]?method|cvv|cvc|iban)\b/i }
];

const SINK_RULES: readonly SignalRule<SensitiveSinkCategory>[] = [
  { id: "sink-log", category: "logging", pattern: /\b(?:console\.(?:log|info|warn|error)|logger\.(?:debug|info|warn|error)|logging\.(?:debug|info|warning|error))\s*\(/i },
  { id: "sink-network", category: "network", pattern: /\b(?:fetch|axios\.(?:get|post|put|patch)|requests\.(?:get|post|put|patch)|httpClient\.(?:get|post|put|patch)|sendRequest)\s*\(/i },
  { id: "sink-storage", category: "storage", pattern: /\b(?:writeFile|localStorage\.setItem|sessionStorage\.setItem|\.save|\.persist|INSERT\s+INTO|UPDATE\s+[^\s]+\s+SET)\b/i },
  { id: "sink-analytics", category: "analytics", pattern: /\b(?:analytics\.(?:track|identify)|telemetry\.(?:track|capture)|captureEvent|trackEvent)\s*\(/i }
];

/**
 * Local lexical and import-structure evidence. This is deliberately not a taint engine:
 * it never claims that a value flowed, that a sink is unsafe, or that unmatched code is safe.
 */
export const sensitiveDataFlowEvidenceProvider: EvidenceProvider = {
  id: "fixmap-sensitive-data",
  version: PROVIDER_VERSION,
  capabilities: { network: "never", executesCode: false },
  collect({ repo }): EvidenceProviderResult {
    const codeFiles = repo.files.filter((file) => file.kind === "code");
    const eligible = codeFiles.filter((file) => file.textSampleComplete !== false && file.contentFingerprint);
    const selected = eligible.slice(0, MAX_ANALYZED_FILES);
    const classified = selected.map(classifyFile).filter((entry) => entry.sources.length > 0 || entry.sinks.length > 0);
    const exact = classified;
    const skippedFiles = codeFiles.length - selected.length;
    const items: EvidenceItem[] = [scopeItem(repo.root, selected.length, skippedFiles)];
    const itemId = new Map<string, string>();

    for (const entry of exact) {
      for (const category of entry.sources) {
        const id = stableId("source", category, entry.file.path);
        itemId.set(key(entry.file.path, "source", category), id);
        items.push(fileItem(id, entry.file, "source", category));
      }
      for (const category of entry.sinks) {
        const id = stableId("sink", category, entry.file.path);
        itemId.set(key(entry.file.path, "sink", category), id);
        items.push(fileItem(id, entry.file, "sink", category));
      }
    }

    const relationships: EvidenceRelationship[] = [];
    const relationshipIds = new Set<string>();
    for (const entry of exact) {
      for (const source of entry.sources) for (const sink of entry.sinks) {
        pushRelationship(relationships, relationshipIds, {
          from: itemId.get(key(entry.file.path, "source", source))!,
          to: itemId.get(key(entry.file.path, "sink", sink))!,
          relation: "same-file-sensitive-signal-and-sink",
          reason: `${entry.file.path} contains both ${source} vocabulary and a ${sink} call pattern; value flow was not verified.`
        });
      }
    }

    const graph = buildImportGraph(repo.files);
    const byPath = new Map(exact.map((entry) => [entry.file.path, entry]));
    for (const [fromPath, targets] of graph.imports) {
      const from = byPath.get(fromPath);
      if (!from) continue;
      for (const toPath of targets) {
        const to = byPath.get(toPath);
        if (!to) continue;
        connectAcrossImport(relationships, relationshipIds, itemId, from, to);
        connectAcrossImport(relationships, relationshipIds, itemId, to, from);
      }
    }
    return {
      items: items.sort((a, b) => a.id.localeCompare(b.id)),
      relationships: relationships.slice(0, MAX_RELATIONSHIPS).sort((a, b) => a.id.localeCompare(b.id))
    };
  }
};

function classifyFile(file: RepoFile): ClassifiedFile {
  return {
    file,
    sources: categories(file.textSample, SOURCE_RULES),
    sinks: categories(file.textSample, SINK_RULES)
  };
}

function categories<T extends string>(text: string, rules: readonly SignalRule<T>[]): T[] {
  return [...new Set(rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.category))].sort();
}

function scopeItem(repository: string, scannedFiles: number, skippedFiles: number): EvidenceItem {
  return {
    id: "scope",
    kind: "security",
    summary: "Approximate sensitive-data indicators from local lexical and import-structure analysis; this is not a complete security or taint-flow proof.",
    confidence: "low",
    subjects: [{ kind: "repository", repository }],
    metadata: {
      analysis: "lexical-signals-and-direct-import-structure",
      completeness: "not-a-security-proof",
      scannedFiles,
      skippedFiles
    }
  };
}

function fileItem(
  id: string,
  file: RepoFile,
  role: "source" | "sink",
  category: SensitiveDataCategory | SensitiveSinkCategory
): EvidenceItem {
  const rules = role === "source" ? SOURCE_RULES : SINK_RULES;
  const matchedRuleIds = rules
    .filter((rule) => rule.category === category && rule.pattern.test(file.textSample))
    .map((rule) => rule.id)
    .join(",");
  return {
    id,
    kind: "security",
    summary: `Possible sensitive-data ${role} indicator (${category}) in ${file.path}; lexical evidence only.`,
    confidence: "low",
    subjects: [{ kind: "file", path: file.path }],
    metadata: {
      role,
      category,
      matchedRuleIds,
      sourceFingerprint: file.contentFingerprint!,
      detectorVersion: PROVIDER_VERSION,
      completeness: "not-a-security-proof"
    }
  };
}

function connectAcrossImport(
  relationships: EvidenceRelationship[],
  relationshipIds: Set<string>,
  ids: ReadonlyMap<string, string>,
  sourceEntry: ClassifiedFile,
  sinkEntry: ClassifiedFile
): void {
  for (const source of sourceEntry.sources) for (const sink of sinkEntry.sinks) {
    pushRelationship(relationships, relationshipIds, {
      from: ids.get(key(sourceEntry.file.path, "source", source))!,
      to: ids.get(key(sinkEntry.file.path, "sink", sink))!,
      relation: "structurally-connected-sensitive-signal",
      reason: `${sourceEntry.file.path} and ${sinkEntry.file.path} are directly import-connected; runtime data transfer was not verified.`
    });
  }
}

function pushRelationship(
  relationships: EvidenceRelationship[],
  relationshipIds: Set<string>,
  input: Pick<EvidenceRelationship, "from" | "to" | "relation" | "reason">
): void {
  if (relationships.length >= MAX_RELATIONSHIPS) return;
  const id = stableId(input.relation, input.from, input.to);
  if (relationshipIds.has(id)) return;
  relationshipIds.add(id);
  relationships.push({ id, ...input, confidence: "low" });
}

function key(path: string, role: "source" | "sink", category: string): string {
  return `${path}\0${role}\0${category}`;
}

function stableId(...values: string[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(values.join("\0"))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `signal-${hash.toString(16).padStart(16, "0")}`;
}
