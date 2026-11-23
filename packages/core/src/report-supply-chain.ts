import type { EvidenceConfidence } from "./evidence.js";
import { inlineProse, markdownCode } from "./markdown.js";
import { isRepositoryRelativePath } from "./paths.js";
import type { SupplyChainEvidenceBundle, SupplyChainFindingKind, SupplyChainSeverity } from "./supply-chain.js";

export type ReportSupplyChainFinding = {
  id: string;
  kind: SupplyChainFindingKind;
  severity: SupplyChainSeverity;
  confidence: EvidenceConfidence;
  summary: string;
  package: { name: string; version?: string; purl?: string };
  /** Manifests among the report's paths that declare this package. */
  manifestPaths: string[];
  advisoryId?: string;
  fixedVersion?: string;
  licenseId?: string;
  policy?: string;
  sourceUrl?: string;
};

/**
 * External scanner/SBOM findings for packages declared in manifests the report covers.
 * Claims are shown as supplied; FixMap never fetched, scanned, or verified them.
 */
export type ReportSupplyChain = {
  supplyChainVersion: 1;
  source: {
    tool: string;
    toolVersion: string;
    databaseVersion?: string;
    /** Producer-declared fingerprint of the original scanner document. */
    documentFingerprint: string;
    generatedAt: string;
    /** SHA-256 of the exact bundle bytes FixMap read. */
    documentSha256: string;
  };
  findings: ReportSupplyChainFinding[];
  /** Bundle findings not attached: their manifests are outside the report, or the size bound was reached. */
  omittedFindings: number;
};

export const MAX_REPORT_SUPPLY_CHAIN_FINDINGS = 50;

const SEVERITIES: readonly string[] = ["critical", "high", "medium", "low", "info", "unknown"];

export function buildReportSupplyChain(
  bundle: SupplyChainEvidenceBundle,
  documentSha256: string,
  focusPaths: ReadonlySet<string>
): ReportSupplyChain {
  const components = new Map(bundle.components.map((component) => [component.id, component]));
  const relevant: ReportSupplyChainFinding[] = [];
  for (const finding of bundle.findings) {
    const component = components.get(finding.componentId);
    const manifestPaths = component?.paths.filter((path) => focusPaths.has(path)) ?? [];
    if (!component || manifestPaths.length === 0) continue;
    relevant.push({
      id: finding.id,
      kind: finding.kind,
      severity: finding.severity,
      confidence: finding.confidence,
      summary: finding.summary,
      package: {
        name: component.name,
        ...(component.version ? { version: component.version } : {}),
        ...(component.purl ? { purl: component.purl } : {})
      },
      manifestPaths,
      ...(finding.advisoryId ? { advisoryId: finding.advisoryId } : {}),
      ...(finding.fixedVersion ? { fixedVersion: finding.fixedVersion } : {}),
      ...(finding.licenseId ? { licenseId: finding.licenseId } : {}),
      ...(finding.policy ? { policy: finding.policy } : {}),
      ...(finding.sourceUrl ? { sourceUrl: finding.sourceUrl } : {})
    });
  }
  // The validated bundle is already ordered by severity, then id.
  const findings = relevant.slice(0, MAX_REPORT_SUPPLY_CHAIN_FINDINGS);
  return {
    supplyChainVersion: 1,
    source: {
      tool: bundle.source.tool,
      toolVersion: bundle.source.toolVersion,
      ...(bundle.source.databaseVersion ? { databaseVersion: bundle.source.databaseVersion } : {}),
      documentFingerprint: bundle.source.documentFingerprint,
      generatedAt: bundle.generatedAt,
      documentSha256
    },
    findings,
    omittedFindings: bundle.findings.length - findings.length
  };
}

export function renderSupplyChainReportMarkdown(evidence: ReportSupplyChain): string[] {
  const { source } = evidence;
  return [
    "",
    "## Supply-Chain Evidence",
    "",
    `Imported from ${markdownCode(source.tool)} ${inlineProse(source.toolVersion)}` +
      `${source.databaseVersion ? `, database ${inlineProse(source.databaseVersion)}` : ""}, generated ${source.generatedAt} ` +
      `(bundle sha256 ${markdownCode(source.documentSha256)}). Findings are shown as supplied; FixMap did not fetch advisories, run a scanner, or verify exploitability.`,
    "",
    ...(evidence.findings.length > 0
      ? evidence.findings.map((finding) => {
        const details = [
          finding.advisoryId && `advisory ${markdownCode(finding.advisoryId)}`,
          finding.fixedVersion && `fixed in ${markdownCode(finding.fixedVersion)}`,
          finding.licenseId && `license ${markdownCode(finding.licenseId)}`,
          finding.policy && `policy ${inlineProse(finding.policy)}`
        ].filter(Boolean).join("; ");
        const name = `${finding.package.name}${finding.package.version ? `@${finding.package.version}` : ""}`;
        return `- **${finding.severity}** ${finding.kind} for ${markdownCode(name)} declared in ${finding.manifestPaths.map(markdownCode).join(", ")}: ` +
          `${inlineProse(finding.summary)}${details ? ` (${details})` : ""}`;
      })
      : ["- No imported findings are for packages declared in manifests among this report's files."]),
    ...(evidence.omittedFindings > 0
      ? ["", `${evidence.omittedFindings} further finding${evidence.omittedFindings === 1 ? " was" : "s were"} for manifests outside this report or over the listing limit.`]
      : [])
  ];
}

export function isReportSupplyChain(candidate: unknown): candidate is ReportSupplyChain {
  if (!isRecord(candidate) || candidate.supplyChainVersion !== 1 || !isRecord(candidate.source)) return false;
  const source = candidate.source;
  if (!text(source.tool, 100) || !text(source.toolVersion, 100) || !optionalText(source.databaseVersion, 200) ||
    typeof source.documentFingerprint !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.documentFingerprint) ||
    typeof source.generatedAt !== "string" || !Number.isFinite(Date.parse(source.generatedAt)) ||
    typeof source.documentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.documentSha256) ||
    !Number.isSafeInteger(candidate.omittedFindings) || (candidate.omittedFindings as number) < 0 ||
    !Array.isArray(candidate.findings) || candidate.findings.length > MAX_REPORT_SUPPLY_CHAIN_FINDINGS) return false;
  return candidate.findings.every((finding) => isRecord(finding) &&
    text(finding.id, 80) && ["vulnerability", "outdated-version", "license-policy"].includes(String(finding.kind)) &&
    SEVERITIES.includes(String(finding.severity)) && ["low", "medium", "high"].includes(String(finding.confidence)) &&
    text(finding.summary, 1_000) && isRecord(finding.package) && text(finding.package.name, 300) &&
    optionalText(finding.package.version, 300) &&
    (finding.package.purl === undefined || (typeof finding.package.purl === "string" && finding.package.purl.startsWith("pkg:"))) &&
    Array.isArray(finding.manifestPaths) && finding.manifestPaths.length > 0 && finding.manifestPaths.every(isRepositoryRelativePath) &&
    optionalText(finding.advisoryId, 300) && optionalText(finding.fixedVersion, 300) &&
    optionalText(finding.licenseId, 200) && optionalText(finding.policy, 500) &&
    (finding.sourceUrl === undefined || (typeof finding.sourceUrl === "string" && finding.sourceUrl.startsWith("https://"))));
}

function text(value: unknown, max: number): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function optionalText(value: unknown, max: number): boolean {
  return value === undefined || text(value, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
