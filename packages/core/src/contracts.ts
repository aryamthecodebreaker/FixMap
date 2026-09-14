import type { RepoMap } from "./types.js";
import { createGraphIdentity } from "./identity-graph.js";
import type { IdentityGraphNode } from "./identity-graph.js";
import { markdownCode } from "./markdown.js";

export type ContractKind = "openapi" | "asyncapi" | "graphql" | "protobuf" | "json-schema" | "migration";
export type ContractEntryRole = "operation" | "type" | "field" | "argument" | "required-field" | "migration";

export type ContractSource = {
  path: string;
  content: string;
  fingerprint: string;
};

export type ContractEntry = {
  key: string;
  role: ContractEntryRole;
  signature: string;
  required: boolean;
};

export type ContractSurface = {
  id: string;
  kind: ContractKind;
  path: string;
  name: string;
  sourceFingerprint: string;
  entries: ContractEntry[];
};

export type ContractDiagnostic = {
  code: "contract-source-incomplete" | "contract-parse-failed" | "contract-format-ambiguous";
  severity: "info" | "warning";
  path: string;
  message: string;
};

export type ContractInventory = {
  inventoryVersion: 1;
  surfaces: ContractSurface[];
  diagnostics: ContractDiagnostic[];
};

export type ContractCompatibility = "compatible" | "breaking" | "unknown";

export type ContractChange = {
  id: string;
  contractId: string;
  contractKind: ContractKind;
  path: string;
  change: "contract-added" | "contract-removed" | "entry-added" | "entry-removed" | "entry-changed";
  compatibility: ContractCompatibility;
  reason: string;
  entry?: string;
  before?: string;
  after?: string;
  evidence: {
    beforeFingerprint?: string;
    afterFingerprint?: string;
  };
};

export type ContractComparison = {
  comparisonVersion: 1;
  summary: string;
  changes: ContractChange[];
  diagnostics: ContractDiagnostic[];
};

export type ContractGraphOptions = {
  workspace: string;
  repository: string;
  /** Service, package, or repository identity that owns these contracts. */
  parent: string;
};

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const CONTRACT_PATH = /(?:^|\/)(?:openapi|swagger|asyncapi)(?:\.[^/]+)?\.(?:json|ya?ml)$|\.(?:graphql|gql|proto)$|(?:^|\/)migrations?\/.*\.sql$|\.schema\.json$/i;

/** Converts a scanned repository into bounded contract sources without pretending omitted content was parsed. */
export function contractSourcesFromRepo(repo: RepoMap): { sources: ContractSource[]; diagnostics: ContractDiagnostic[] } {
  const sources: ContractSource[] = [];
  const diagnostics: ContractDiagnostic[] = [];
  for (const file of repo.files.filter((candidate) => isContractCandidate(candidate.path, candidate.textSample))) {
    if (file.textSampleComplete === false || !file.contentFingerprint) {
      diagnostics.push({
        code: "contract-source-incomplete",
        severity: "warning",
        path: file.path,
        message: `${file.path} looks like a contract, but its complete content and exact fingerprint were not available.`
      });
      continue;
    }
    sources.push({ path: file.path, content: file.textSample, fingerprint: file.contentFingerprint });
  }
  return { sources: sources.sort((a, b) => a.path.localeCompare(b.path)), diagnostics };
}

/** Parses supported contracts into one format-neutral, deterministic compatibility surface. */
export function inventoryContracts(
  sources: readonly ContractSource[],
  inheritedDiagnostics: readonly ContractDiagnostic[] = []
): ContractInventory {
  const surfaces: ContractSurface[] = [];
  const diagnostics = inheritedDiagnostics.map((entry) => ({ ...entry }));
  const seenPaths = new Set<string>();
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    validateContractSource(source);
    if (seenPaths.has(source.path)) throw new Error(`Duplicate contract source path: ${source.path}`);
    seenPaths.add(source.path);
    const result = parseContract(source);
    if (result.surface) surfaces.push(result.surface);
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  }
  return {
    inventoryVersion: 1,
    surfaces: surfaces.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))
  };
}

/** Compares two exact inventories. Every sentence is backed by before/after fingerprints. */
export function compareContractInventories(
  previous: ContractInventory,
  current: ContractInventory
): ContractComparison {
  if (previous.inventoryVersion !== 1 || current.inventoryVersion !== 1) {
    throw new Error("Unsupported contract inventory version.");
  }
  const changes: ContractChange[] = [];
  const beforeById = uniqueSurfaceIndex(previous.surfaces, "previous");
  const afterById = uniqueSurfaceIndex(current.surfaces, "current");
  const unavailableBefore = unavailableContractPaths(previous.diagnostics);
  const unavailableAfter = unavailableContractPaths(current.diagnostics);
  for (const [id, before] of beforeById) {
    const after = afterById.get(id);
    if (!after) {
      if (unavailableAfter.has(before.path)) continue;
      changes.push(contractChange(before, undefined, "contract-removed", "breaking", `Removed ${before.kind} contract ${before.name}.`));
      continue;
    }
    compareSurface(before, after, changes);
  }
  for (const [id, after] of afterById) {
    if (!beforeById.has(id)) {
      if (unavailableBefore.has(after.path)) continue;
      changes.push(contractChange(undefined, after, "contract-added", "compatible", `Added ${after.kind} contract ${after.name}.`));
    }
  }
  changes.sort((a, b) => severityOrder(a.compatibility) - severityOrder(b.compatibility) ||
    a.path.localeCompare(b.path) || (a.entry ?? "").localeCompare(b.entry ?? "") || a.change.localeCompare(b.change));
  const breaking = changes.filter((change) => change.compatibility === "breaking").length;
  const unknown = changes.filter((change) => change.compatibility === "unknown").length;
  const compatible = changes.length - breaking - unknown;
  return {
    comparisonVersion: 1,
    summary: changes.length === 0
      ? "No supported contract surface changed."
      : `${changes.length} contract change${changes.length === 1 ? "" : "s"}: ${breaking} breaking, ${unknown} unknown, ${compatible} compatible.`,
    changes,
    diagnostics: deduplicateDiagnostics([...previous.diagnostics, ...current.diagnostics])
  };
}

/** Converts parsed surfaces into exact, hierarchically owned graph nodes. Consumer edges stay explicit. */
export function contractGraphNodes(inventory: ContractInventory, options: ContractGraphOptions): IdentityGraphNode[] {
  return inventory.surfaces.map((surface): IdentityGraphNode => ({
    id: createGraphIdentity({
      workspace: options.workspace,
      kind: "contract",
      key: `${surface.kind}:${surface.path}`,
      repository: options.repository,
      parent: options.parent
    }),
    kind: "contract",
    key: `${surface.kind}:${surface.path}`,
    repository: options.repository,
    parent: options.parent,
    label: surface.name,
    attributes: { contractKind: surface.kind, entryCount: surface.entries.length },
    derivedFrom: [{
      kind: "source",
      repository: options.repository,
      path: surface.path,
      fingerprint: surface.sourceFingerprint
    }]
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function renderContractComparisonMarkdown(comparison: ContractComparison): string {
  const lines = ["# FixMap Contract Compatibility", "", comparison.summary, ""];
  if (comparison.changes.length === 0) return `${lines.join("\n").trimEnd()}\n`;
  for (const compatibility of ["breaking", "unknown", "compatible"] as const) {
    const changes = comparison.changes.filter((change) => change.compatibility === compatibility);
    if (changes.length === 0) continue;
    lines.push(`## ${compatibility[0]!.toUpperCase()}${compatibility.slice(1)}`, "");
    for (const change of changes) {
      lines.push(`- ${markdownCode(change.path)}: ${change.reason}`);
    }
    lines.push("");
  }
  if (comparison.diagnostics.length > 0) {
    lines.push("## Diagnostics", "");
    for (const diagnostic of comparison.diagnostics) lines.push(`- ${markdownCode(diagnostic.path)}: ${diagnostic.message}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function compareSurface(before: ContractSurface, after: ContractSurface, changes: ContractChange[]): void {
  const beforeEntries = new Map(before.entries.map((entry) => [entry.key, entry]));
  const afterEntries = new Map(after.entries.map((entry) => [entry.key, entry]));
  for (const [key, entry] of beforeEntries) {
    const current = afterEntries.get(key);
    if (!current) {
      changes.push(contractChange(before, after, "entry-removed", removalCompatibility(entry),
        `Removed ${describeEntry(entry)}.`, entry));
    } else if (entry.signature !== current.signature || entry.required !== current.required) {
      const compatibility = changedCompatibility(entry, current);
      const detail = entry.signature === current.signature
        ? `requiredness from ${entry.required} to ${current.required}`
        : `signature from ${entry.signature} to ${current.signature}`;
      changes.push(contractChange(before, after, "entry-changed", compatibility,
        `${describeEntry(entry)} changed ${detail}.`, current, entry.signature, current.signature));
    }
  }
  for (const [key, entry] of afterEntries) {
    if (beforeEntries.has(key)) continue;
    const compatibility = additionCompatibility(entry);
    changes.push(contractChange(before, after, "entry-added", compatibility,
      additionReason(entry), entry));
  }
}

function contractChange(
  before: ContractSurface | undefined,
  after: ContractSurface | undefined,
  change: ContractChange["change"],
  compatibility: ContractCompatibility,
  reason: string,
  entry?: ContractEntry,
  beforeSignature?: string,
  afterSignature?: string
): ContractChange {
  const surface = after ?? before!;
  const key = `${surface.id}\0${change}\0${entry?.key ?? ""}\0${beforeSignature ?? ""}\0${afterSignature ?? ""}`;
  return {
    id: `contract-change:${stableHash(key)}`,
    contractId: surface.id,
    contractKind: surface.kind,
    path: surface.path,
    change,
    compatibility,
    reason,
    ...(entry ? { entry: entry.key } : {}),
    ...(beforeSignature !== undefined ? { before: beforeSignature } : {}),
    ...(afterSignature !== undefined ? { after: afterSignature } : {}),
    evidence: {
      ...(before ? { beforeFingerprint: before.sourceFingerprint } : {}),
      ...(after ? { afterFingerprint: after.sourceFingerprint } : {})
    }
  };
}

function removalCompatibility(entry: ContractEntry): ContractCompatibility {
  return entry.role === "migration" ? "unknown" : "breaking";
}

function additionCompatibility(entry: ContractEntry): ContractCompatibility {
  if (entry.role === "migration") return /^destructive:/.test(entry.signature) ? "breaking" : "compatible";
  return entry.required && (entry.role === "argument" || entry.role === "required-field") ? "breaking" : "compatible";
}

function changedCompatibility(before: ContractEntry, after: ContractEntry): ContractCompatibility {
  if (!before.required && after.required) return "breaking";
  if (before.role === "migration") return /^destructive:/.test(after.signature) ? "breaking" : "unknown";
  return "breaking";
}

function describeEntry(entry: ContractEntry): string {
  return `${entry.role.replace("-", " ")} ${entry.key}`;
}

function additionReason(entry: ContractEntry): string {
  if (entry.role === "migration") {
    const [classification, ...statement] = entry.signature.split(":");
    return `Added ${classification} migration statement: ${statement.join(":")}.`;
  }
  return `Added ${describeEntry(entry)}${entry.required ? " as required" : ""}.`;
}

function parseContract(source: ContractSource): { surface?: ContractSurface; diagnostic?: ContractDiagnostic } {
  const lower = source.path.toLowerCase();
  if (lower.endsWith(".graphql") || lower.endsWith(".gql")) {
    const graphql = parseGraphql(source.content);
    if (graphql.entries.length === 0 && source.content.replace(/#[^\r\n]*/g, "").trim()) {
      return parseFailed(source, "GraphQL source contains no supported type, interface, or input definitions.");
    }
    return parsed(source, "graphql", graphql);
  }
  if (lower.endsWith(".proto")) return parsed(source, "protobuf", parseProtobuf(source.content));
  if (/(?:^|\/)migrations?\/.*\.sql$/i.test(source.path)) return parsed(source, "migration", parseMigration(source.content));

  const json = parseJson(source.content);
  if (json) {
    if (typeof json.openapi === "string" || typeof json.swagger === "string") return parsed(source, "openapi", parseOpenApiJson(json));
    if (typeof json.asyncapi === "string") return parsed(source, "asyncapi", parseAsyncApiJson(json));
    if (typeof json.$schema === "string" || isRecord(json.properties)) return parsed(source, "json-schema", parseJsonSchema(json));
  }
  if (/^\s*(?:openapi|swagger)\s*:/m.test(source.content)) return parsed(source, "openapi", parseOpenApiYaml(source.content));
  if (/^\s*asyncapi\s*:/m.test(source.content)) return parsed(source, "asyncapi", parseAsyncApiYaml(source.content));
  if (CONTRACT_PATH.test(source.path)) {
    return {
      diagnostic: {
        code: "contract-parse-failed",
        severity: "warning",
        path: source.path,
        message: `${source.path} looks like a supported contract, but FixMap could not parse a format marker.`
      }
    };
  }
  return {};
}

function parseFailed(source: ContractSource, detail: string): { diagnostic: ContractDiagnostic } {
  return {
    diagnostic: {
      code: "contract-parse-failed",
      severity: "warning",
      path: source.path,
      message: `${source.path} could not be safely inventoried: ${detail}`
    }
  };
}

function parsed(source: ContractSource, kind: ContractKind, parsedSurface: { name?: string; entries: ContractEntry[] }): { surface: ContractSurface } {
  return {
    surface: {
      id: `contract:${kind}:${source.path.replace(/\\/g, "/")}`,
      kind,
      path: source.path.replace(/\\/g, "/"),
      name: parsedSurface.name ?? source.path.split(/[\\/]/).at(-1) ?? source.path,
      sourceFingerprint: source.fingerprint,
      entries: normalizeEntries(parsedSurface.entries)
    }
  };
}

function parseOpenApiJson(root: Record<string, unknown>): { name?: string; entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  const paths = recordValue(root.paths);
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathRecord = recordValue(pathValue);
    for (const [method, operationValue] of Object.entries(pathRecord)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation = `${method.toUpperCase()} ${path}`;
      entries.push(entry(`operation:${operation}`, "operation", operation));
      const parameters = Array.isArray(recordValue(operationValue).parameters)
        ? recordValue(operationValue).parameters as unknown[]
        : [];
      for (const parameterValue of parameters) {
        const parameter = recordValue(parameterValue);
        if (typeof parameter.name !== "string") continue;
        const location = typeof parameter.in === "string" ? parameter.in : "unknown";
        const signature = scalarSignature(recordValue(parameter.schema));
        entries.push(entry(`argument:${operation}:${location}:${parameter.name}`, "argument", signature, parameter.required === true));
      }
    }
  }
  const schemas = recordValue(recordValue(root.components).schemas);
  appendSchemaEntries(entries, schemas);
  return { ...titleFromRoot(root), entries };
}

function parseAsyncApiJson(root: Record<string, unknown>): { name?: string; entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  for (const [channel, channelValue] of Object.entries(recordValue(root.channels))) {
    const channelRecord = recordValue(channelValue);
    for (const operation of ["publish", "subscribe"] as const) {
      if (!isRecord(channelRecord[operation])) continue;
      entries.push(entry(`operation:${operation}:${channel}`, "operation", `${operation} ${channel}`));
    }
  }
  appendSchemaEntries(entries, recordValue(recordValue(root.components).schemas));
  return { ...titleFromRoot(root), entries };
}

function parseJsonSchema(root: Record<string, unknown>): { name?: string; entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  appendOneSchema(entries, typeof root.title === "string" ? root.title : "root", root);
  for (const [name, schema] of Object.entries(recordValue(root.$defs))) appendOneSchema(entries, name, recordValue(schema));
  for (const [name, schema] of Object.entries(recordValue(root.definitions))) appendOneSchema(entries, name, recordValue(schema));
  return { ...(typeof root.title === "string" ? { name: root.title } : {}), entries };
}

function appendSchemaEntries(entries: ContractEntry[], schemas: Record<string, unknown>): void {
  for (const [name, schema] of Object.entries(schemas)) appendOneSchema(entries, name, recordValue(schema));
}

function appendOneSchema(entries: ContractEntry[], name: string, schema: Record<string, unknown>): void {
  entries.push(entry(`type:${name}`, "type", scalarSignature(schema)));
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : []);
  for (const [field, value] of Object.entries(recordValue(schema.properties))) {
    const isRequired = required.has(field);
    entries.push(entry(`field:${name}.${field}`, isRequired ? "required-field" : "field", scalarSignature(recordValue(value)), isRequired));
  }
}

function parseGraphql(content: string): { entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  const clean = content.replace(/#[^\r\n]*/g, "");
  for (const match of clean.matchAll(/\b(type|interface|input)\s+([_A-Za-z][_0-9A-Za-z]*)[^\{]*\{([\s\S]*?)\}/g)) {
    const category = match[1] ?? "type";
    const typeName = match[2]!;
    entries.push(entry(`type:${typeName}`, "type", category));
    for (const fieldMatch of (match[3] ?? "").matchAll(/([_A-Za-z][_0-9A-Za-z]*)\s*(\([^)]*\))?\s*:\s*([\[\]!_0-9A-Za-z]+)/g)) {
      const field = fieldMatch[1]!;
      const signature = fieldMatch[3]!;
      const required = category === "input" && signature.endsWith("!");
      entries.push(entry(`field:${typeName}.${field}`, required ? "required-field" : "field", signature, required));
      for (const argumentMatch of (fieldMatch[2] ?? "").matchAll(/([_A-Za-z][_0-9A-Za-z]*)\s*:\s*([\[\]!_0-9A-Za-z]+)(?:\s*=\s*[^,)]+)?/g)) {
        const argument = argumentMatch[1]!;
        const argumentType = argumentMatch[2]!;
        const hasDefault = new RegExp(`${argument}\\s*:[^,)]*=`, "m").test(fieldMatch[2] ?? "");
        entries.push(entry(`argument:${typeName}.${field}:${argument}`, "argument", argumentType, argumentType.endsWith("!") && !hasDefault));
      }
    }
  }
  for (const match of clean.matchAll(/\benum\s+([_A-Za-z][_0-9A-Za-z]*)[^\{]*\{([\s\S]*?)\}/g)) {
    const typeName = match[1]!;
    entries.push(entry(`type:${typeName}`, "type", "enum"));
    for (const value of (match[2] ?? "").matchAll(/\b([_A-Za-z][_0-9A-Za-z]*)\b/g)) {
      entries.push(entry(`field:${typeName}.${value[1]}`, "field", "enum-value"));
    }
  }
  for (const match of clean.matchAll(/\bscalar\s+([_A-Za-z][_0-9A-Za-z]*)/g)) {
    entries.push(entry(`type:${match[1]}`, "type", "scalar"));
  }
  for (const match of clean.matchAll(/\bunion\s+([_A-Za-z][_0-9A-Za-z]*)\s*=\s*([^\r\n]+)/g)) {
    const members = (match[2] ?? "").split("|").map((member) => member.trim()).filter(Boolean).sort();
    entries.push(entry(`type:${match[1]}`, "type", `union:${members.join("|")}`));
  }
  return { entries };
}

function parseProtobuf(content: string): { entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  const clean = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
  for (const match of clean.matchAll(/\bmessage\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)) {
    const message = match[1]!;
    entries.push(entry(`type:${message}`, "type", "message"));
    for (const field of (match[2] ?? "").matchAll(/\b(?:(?:optional|required|repeated)\s+)?([.A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s+([A-Za-z_]\w*)\s*=\s*(\d+)/g)) {
      entries.push(entry(`field:${message}#${field[3]}`, "field", `${field[1]} ${field[2]}`, false));
    }
  }
  for (const match of clean.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)) {
    const enumName = match[1]!;
    entries.push(entry(`type:${enumName}`, "type", "enum"));
    for (const value of (match[2] ?? "").matchAll(/\b([A-Za-z_]\w*)\s*=\s*(-?\d+)/g)) {
      entries.push(entry(`field:${enumName}#${value[2]}`, "field", `enum-value ${value[1]}`));
    }
  }
  for (const match of clean.matchAll(/\bservice\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)) {
    const service = match[1]!;
    entries.push(entry(`type:${service}`, "type", "service"));
    for (const rpc of (match[2] ?? "").matchAll(/\brpc\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s+returns\s*\(([^)]*)\)/g)) {
      entries.push(entry(`operation:${service}.${rpc[1]}`, "operation", `${rpc[2]?.trim()} -> ${rpc[3]?.trim()}`));
    }
  }
  return { entries };
}

function parseMigration(content: string): { entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  const statements = content.split(";").map((statement) => statement.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const statement of statements) {
    const destructive = /\bDROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)\b|\bALTER\s+(?:TABLE\s+)?[^;]+\b(?:SET\s+NOT\s+NULL|TYPE\s+)\b|\bTRUNCATE\b/i.test(statement);
    entries.push(entry(`migration:${stableHash(statement.toLowerCase())}`, "migration", `${destructive ? "destructive" : "additive"}:${statement}`, false));
  }
  return { entries };
}

function parseOpenApiYaml(content: string): { name?: string; entries: ContractEntry[] } {
  return parseChannelYaml(content, "paths", HTTP_METHODS);
}

function parseAsyncApiYaml(content: string): { name?: string; entries: ContractEntry[] } {
  return parseChannelYaml(content, "channels", new Set(["publish", "subscribe"]));
}

function parseChannelYaml(content: string, sectionName: string, operations: Set<string>): { name?: string; entries: ContractEntry[] } {
  const entries: ContractEntry[] = [];
  const lines = content.split(/\r?\n/);
  let inSection = false;
  let sectionIndent = -1;
  let currentPath: string | undefined;
  let pathIndent = -1;
  for (const raw of lines) {
    const withoutComment = raw.replace(/\s+#.*$/, "");
    const trimmed = withoutComment.trim();
    if (!trimmed) continue;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    if (!inSection && trimmed === `${sectionName}:`) {
      inSection = true;
      sectionIndent = indent;
      continue;
    }
    if (!inSection) continue;
    if (indent <= sectionIndent) break;
    const key = /^([^:]+):\s*$/.exec(trimmed)?.[1]?.trim();
    if (!key) continue;
    if (indent > sectionIndent && (currentPath === undefined || indent <= pathIndent)) {
      currentPath = unquote(key);
      pathIndent = indent;
      continue;
    }
    if (currentPath && indent > pathIndent && operations.has(key.toLowerCase())) {
      const operation = sectionName === "paths" ? `${key.toUpperCase()} ${currentPath}` : `${key.toLowerCase()} ${currentPath}`;
      entries.push(entry(`operation:${sectionName === "paths" ? operation : `${key.toLowerCase()}:${currentPath}`}`, "operation", operation));
    }
  }
  const title = content.match(/^\s*title\s*:\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
  return { ...(title ? { name: title } : {}), entries };
}

function entry(key: string, role: ContractEntryRole, signature: string, required = false): ContractEntry {
  return { key, role, signature: signature.trim(), required };
}

function normalizeEntries(entries: ContractEntry[]): ContractEntry[] {
  const byKey = new Map<string, ContractEntry>();
  for (const value of entries) {
    const existing = byKey.get(value.key);
    if (existing && (existing.signature !== value.signature || existing.required !== value.required || existing.role !== value.role)) {
      throw new Error(`Contract parser produced conflicting entries for ${value.key}.`);
    }
    byKey.set(value.key, { ...value });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function uniqueSurfaceIndex(surfaces: readonly ContractSurface[], label: string): Map<string, ContractSurface> {
  const index = new Map<string, ContractSurface>();
  for (const surface of surfaces) {
    if (index.has(surface.id)) throw new Error(`Duplicate ${label} contract surface: ${surface.id}`);
    index.set(surface.id, surface);
  }
  return index;
}

function unavailableContractPaths(diagnostics: readonly ContractDiagnostic[]): Set<string> {
  return new Set(diagnostics
    .filter((diagnostic) => diagnostic.code === "contract-parse-failed" || diagnostic.code === "contract-source-incomplete")
    .map((diagnostic) => diagnostic.path));
}

function deduplicateDiagnostics(diagnostics: readonly ContractDiagnostic[]): ContractDiagnostic[] {
  const byKey = new Map<string, ContractDiagnostic>();
  for (const diagnostic of diagnostics) {
    byKey.set(`${diagnostic.code}\0${diagnostic.path}\0${diagnostic.message}`, { ...diagnostic });
  }
  return [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
}

function validateContractSource(source: ContractSource): void {
  if (!source.path.trim() || source.path.includes("\0") || /^(?:[\\/]|[A-Za-z]:)/.test(source.path) ||
    source.path.replace(/\\/g, "/").split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid contract source path: ${source.path}`);
  }
  if (!source.fingerprint.trim() || source.fingerprint.length > 256 || /[\0-\x20]/.test(source.fingerprint)) {
    throw new Error(`Invalid contract source fingerprint for ${source.path}.`);
  }
}

function isContractCandidate(path: string, content: string): boolean {
  return CONTRACT_PATH.test(path.replace(/\\/g, "/")) ||
    /^\s*(?:openapi|swagger|asyncapi)\s*:/m.test(content) ||
    /^\s*\{[\s\S]*?"(?:openapi|swagger|asyncapi|\$schema)"\s*:/m.test(content);
}

function scalarSignature(schema: Record<string, unknown>): string {
  if (typeof schema.$ref === "string") return `$ref:${schema.$ref}`;
  const type = typeof schema.type === "string" ? schema.type : "unknown";
  const format = typeof schema.format === "string" ? `:${schema.format}` : "";
  const nullable = schema.nullable === true ? ":nullable" : "";
  return `${type}${format}${nullable}`;
}

function titleFromRoot(root: Record<string, unknown>): { name?: string } {
  const title = recordValue(root.info).title;
  return typeof title === "string" && title.trim() ? { name: title.trim() } : {};
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseJson(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function severityOrder(value: ContractCompatibility): number {
  return value === "breaking" ? 0 : value === "unknown" ? 1 : 2;
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
