import type { EvidenceConfidence, EvidenceItem, EvidenceProvider, EvidenceProviderResult, EvidenceRelationship } from "./evidence.js";

export type SupplyChainFindingKind = "vulnerability" | "outdated-version" | "license-policy";
export type SupplyChainSeverity = "info" | "low" | "medium" | "high" | "critical" | "unknown";

export type SupplyChainEvidenceBundle = {
  supplyChainBundleVersion: 1;
  generatedAt: string;
  source: {
    tool: string;
    toolVersion: string;
    databaseVersion?: string;
    documentFingerprint: string;
  };
  components: Array<{
    id: string;
    name: string;
    version?: string;
    purl?: string;
    licenses: string[];
    paths: string[];
  }>;
  findings: Array<{
    id: string;
    kind: SupplyChainFindingKind;
    severity: SupplyChainSeverity;
    confidence: EvidenceConfidence;
    componentId: string;
    summary: string;
    advisoryId?: string;
    fixedVersion?: string;
    licenseId?: string;
    policy?: string;
    sourceUrl?: string;
  }>;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const MAX_COMPONENTS = 50_000;
const MAX_FINDINGS = 100_000;

/** Validate an externally produced, versioned scanner/SBOM normalization bundle. */
export function validateSupplyChainEvidenceBundle(candidate: unknown): SupplyChainEvidenceBundle {
  if (!isRecord(candidate) || candidate.supplyChainBundleVersion !== 1 ||
    typeof candidate.generatedAt !== "string" || !Number.isFinite(Date.parse(candidate.generatedAt)) ||
    !isRecord(candidate.source) || !bounded(candidate.source.tool, 100) || !bounded(candidate.source.toolVersion, 100) ||
    (candidate.source.databaseVersion !== undefined && !bounded(candidate.source.databaseVersion, 200)) ||
    typeof candidate.source.documentFingerprint !== "string" || !SHA256.test(candidate.source.documentFingerprint) ||
    !Array.isArray(candidate.components) || candidate.components.length > MAX_COMPONENTS ||
    !Array.isArray(candidate.findings) || candidate.findings.length > MAX_FINDINGS) {
    throw new Error("Invalid supply-chain evidence bundle envelope.");
  }

  const components = candidate.components.map((value, index) => validateComponent(value, index));
  const componentIds = new Set<string>();
  for (const component of components) {
    if (componentIds.has(component.id)) throw new Error(`Duplicate supply-chain component id: ${component.id}`);
    componentIds.add(component.id);
  }
  const findings = candidate.findings.map((value, index) => validateFinding(value, index, componentIds));
  const findingIds = new Set<string>();
  for (const finding of findings) {
    if (findingIds.has(finding.id)) throw new Error(`Duplicate supply-chain finding id: ${finding.id}`);
    findingIds.add(finding.id);
  }
  return structuredClone({
    supplyChainBundleVersion: 1,
    generatedAt: new Date(candidate.generatedAt).toISOString(),
    source: {
      tool: candidate.source.tool.trim() as string,
      toolVersion: candidate.source.toolVersion.trim() as string,
      ...(typeof candidate.source.databaseVersion === "string" ? { databaseVersion: candidate.source.databaseVersion.trim() } : {}),
      documentFingerprint: candidate.source.documentFingerprint.toLowerCase()
    },
    components: components.sort((a, b) => a.id.localeCompare(b.id)),
    findings: findings.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || a.id.localeCompare(b.id))
  });
}

/** Convert trusted normalized scanner output into the common evidence-provider contract. */
export function createSupplyChainEvidenceProvider(candidate: unknown): EvidenceProvider {
  const bundle = validateSupplyChainEvidenceBundle(candidate);
  return {
    id: "fixmap-supply-chain",
    version: "1.0.0",
    capabilities: { network: "never", executesCode: false },
    collect(): EvidenceProviderResult {
      const items: EvidenceItem[] = [];
      const relationships: EvidenceRelationship[] = [];
      const componentById = new Map(bundle.components.map((component) => [component.id, component]));
      for (const component of bundle.components) items.push({
        id: `component:${component.id}`,
        kind: "security",
        summary: `${component.name}${component.version ? ` ${component.version}` : ""} from imported supply-chain inventory.`,
        confidence: "high",
        subjects: [{
          kind: "package",
          name: component.name,
          ...(component.version ? { version: component.version } : {}),
          ...(component.purl ? { purl: component.purl } : {})
        }],
        observedAt: bundle.generatedAt,
        metadata: {
          sourceTool: bundle.source.tool,
          sourceToolVersion: bundle.source.toolVersion,
          sourceFingerprint: bundle.source.documentFingerprint,
          ...(bundle.source.databaseVersion ? { databaseVersion: bundle.source.databaseVersion } : {}),
          ...(component.licenses.length > 0 ? { declaredLicenses: boundedList(component.licenses) } : {}),
          ...(component.paths.length > 0 ? { manifestPaths: boundedList(component.paths) } : {})
        }
      });
      for (const finding of bundle.findings) {
        const component = componentById.get(finding.componentId)!;
        const findingId = `finding:${finding.id}`;
        const componentId = `component:${component.id}`;
        items.push({
          id: findingId,
          kind: "security",
          summary: finding.summary,
          confidence: finding.confidence,
          subjects: [{
            kind: "package",
            name: component.name,
            ...(component.version ? { version: component.version } : {}),
            ...(component.purl ? { purl: component.purl } : {})
          }],
          observedAt: bundle.generatedAt,
          metadata: {
            findingKind: finding.kind,
            severity: finding.severity,
            sourceTool: bundle.source.tool,
            sourceToolVersion: bundle.source.toolVersion,
            sourceFingerprint: bundle.source.documentFingerprint,
            ...(bundle.source.databaseVersion ? { databaseVersion: bundle.source.databaseVersion } : {}),
            ...(finding.advisoryId ? { advisoryId: finding.advisoryId } : {}),
            ...(finding.fixedVersion ? { fixedVersion: finding.fixedVersion } : {}),
            ...(finding.licenseId ? { licenseId: finding.licenseId } : {}),
            ...(finding.policy ? { policy: finding.policy } : {}),
            ...(finding.sourceUrl ? { sourceUrl: finding.sourceUrl } : {})
          }
        });
        relationships.push({
          id: `affects:${finding.id}`,
          from: findingId,
          to: componentId,
          relation: "reported-for-component",
          reason: `${bundle.source.tool} ${bundle.source.toolVersion} reported ${finding.id} for ${component.name}.`,
          confidence: finding.confidence
        });
      }
      return { items, relationships };
    }
  };
}

function validateComponent(value: unknown, index: number): SupplyChainEvidenceBundle["components"][number] {
  if (!isRecord(value) || typeof value.id !== "string" || !ID.test(value.id) || !bounded(value.name, 300) ||
    (value.version !== undefined && !bounded(value.version, 300)) ||
    (value.purl !== undefined && (typeof value.purl !== "string" || !value.purl.startsWith("pkg:") || value.purl.length > 1_000)) ||
    !stringArray(value.licenses, 100, 200) || !pathArray(value.paths, 100)) {
    throw new Error(`Invalid supply-chain component at index ${index}.`);
  }
  return {
    id: value.id,
    name: value.name.trim() as string,
    ...(typeof value.version === "string" ? { version: value.version.trim() } : {}),
    ...(typeof value.purl === "string" ? { purl: value.purl } : {}),
    licenses: [...new Set(value.licenses as string[])].sort(),
    paths: [...new Set((value.paths as string[]).map(normalizePath))].sort()
  };
}

function validateFinding(
  value: unknown,
  index: number,
  componentIds: ReadonlySet<string>
): SupplyChainEvidenceBundle["findings"][number] {
  if (!isRecord(value) || typeof value.id !== "string" || !ID.test(value.id) ||
    !["vulnerability", "outdated-version", "license-policy"].includes(String(value.kind)) ||
    !["info", "low", "medium", "high", "critical", "unknown"].includes(String(value.severity)) ||
    !["low", "medium", "high"].includes(String(value.confidence)) ||
    typeof value.componentId !== "string" || !componentIds.has(value.componentId) || !bounded(value.summary, 1_000) ||
    !optionalBounded(value.advisoryId, 300) || !optionalBounded(value.fixedVersion, 300) ||
    !optionalBounded(value.licenseId, 200) || !optionalBounded(value.policy, 500) ||
    (value.sourceUrl !== undefined && (typeof value.sourceUrl !== "string" || value.sourceUrl.length > 1_000 || !safeHttpsUrl(value.sourceUrl)))) {
    throw new Error(`Invalid supply-chain finding at index ${index}.`);
  }
  return {
    id: value.id,
    kind: value.kind as SupplyChainFindingKind,
    severity: value.severity as SupplyChainSeverity,
    confidence: value.confidence as EvidenceConfidence,
    componentId: value.componentId,
    summary: value.summary.trim() as string,
    ...(typeof value.advisoryId === "string" ? { advisoryId: value.advisoryId.trim() } : {}),
    ...(typeof value.fixedVersion === "string" ? { fixedVersion: value.fixedVersion.trim() } : {}),
    ...(typeof value.licenseId === "string" ? { licenseId: value.licenseId.trim() } : {}),
    ...(typeof value.policy === "string" ? { policy: value.policy.trim() } : {}),
    ...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {})
  };
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function optionalBounded(value: unknown, max: number): boolean {
  return value === undefined || bounded(value, max);
}

function stringArray(value: unknown, maxEntries: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxEntries && value.every((entry) => bounded(entry, maxLength));
}

function pathArray(value: unknown, maxEntries: number): value is string[] {
  return Array.isArray(value) && value.length <= maxEntries &&
    value.every((entry) => typeof entry === "string" && entry.length <= 500 && safePath(entry));
}

function boundedList(values: readonly string[]): string {
  const selected: string[] = [];
  let length = 0;
  for (const value of values) {
    const added = value.length + (selected.length > 0 ? 1 : 0);
    if (length + added > 1_000) break;
    selected.push(value);
    length += added;
  }
  return selected.join(",");
}

function safePath(value: string): boolean {
  const path = normalizePath(value);
  return Boolean(path) && !path.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    path.split("/").every((part) => part && part !== "." && part !== "..");
}

function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }

function safeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function severityOrder(value: SupplyChainSeverity): number {
  return ["critical", "high", "medium", "low", "info", "unknown"].indexOf(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
