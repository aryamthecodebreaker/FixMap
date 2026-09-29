import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  collectEvidence,
  createSupplyChainEvidenceProvider,
  validateSupplyChainEvidenceBundle,
  type SupplyChainEvidenceBundle
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const SUPPLY_CHAIN_USAGE = `Usage: fixmap supply-chain --input <bundle.json> [--format markdown|json] [--output <file>]

Validates a version-1 normalized external scanner/SBOM bundle and renders package-aware vulnerability, outdated-version, and license-policy evidence. FixMap does not fetch advisory data, maintain a CVE corpus, or execute a scanner.
`;

export type SupplyChainReport = Awaited<ReturnType<typeof buildSupplyChainReport>>;

export async function buildSupplyChainReport(candidate: unknown) {
  const bundle = validateSupplyChainEvidenceBundle(candidate);
  const evidence = await collectEvidence([createSupplyChainEvidenceProvider(bundle)], {
    repo: { root: "", files: [], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] },
    issueText: "",
    diffText: ""
  }, { now: bundle.generatedAt });
  return {
    supplyChainReportVersion: 1 as const,
    bundle,
    evidence,
    claims: {
      externalEvidenceOnly: true as const,
      fixMapMaintainsVulnerabilityDatabase: false as const,
      fixMapExecutedScanner: false as const,
      remediationAuthorized: false as const
    }
  };
}

export async function runSupplyChainCommand(
  args: string[],
  dependencies: {
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    writeOutput?: (path: string, contents: string) => Promise<void>;
  } = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") {
    stdout(SUPPLY_CHAIN_USAGE);
    return 0;
  }
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    stderr(`${parsed.message}\n\n${SUPPLY_CHAIN_USAGE}`);
    return 1;
  }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.input))) {
    stderr("Supply-chain --output must not overwrite the input file.\n");
    return 1;
  }
  try {
    const report = await buildSupplyChainReport(JSON.parse(readDecodedTextFile(parsed.input)) as unknown);
    const rendered = parsed.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderSupplyChainMarkdown(report);
    if (parsed.output) await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    else stdout(rendered);
    return 0;
  } catch (error) {
    stderr(`Could not import supply-chain evidence from "${parsed.input}": ${describeInputReadError(parsed.input, error)}\n`);
    return 1;
  }
}

export function renderSupplyChainMarkdown(report: SupplyChainReport): string {
  const bundle: SupplyChainEvidenceBundle = report.bundle;
  const counts = ["critical", "high", "medium", "low", "info", "unknown"].map((severity) => ({
    severity,
    count: bundle.findings.filter((finding) => finding.severity === severity).length
  })).filter((entry) => entry.count > 0);
  return `${[
    "# FixMap supply-chain evidence",
    "",
    `Source: \`${bundle.source.tool}\` \`${bundle.source.toolVersion}\` at \`${bundle.source.documentFingerprint}\``,
    `Generated: ${bundle.generatedAt}`,
    `Inventory: ${bundle.components.length} component${bundle.components.length === 1 ? "" : "s"}; ${bundle.findings.length} finding${bundle.findings.length === 1 ? "" : "s"}.`,
    ...(counts.length > 0 ? [`Severity counts: ${counts.map((entry) => `${entry.severity}=${entry.count}`).join(", ")}.`] : []),
    "",
    "## Findings",
    "",
    ...(bundle.findings.length > 0 ? bundle.findings.map((finding) => {
      const component = bundle.components.find((entry) => entry.id === finding.componentId)!;
      const details = [finding.advisoryId && `advisory \`${finding.advisoryId}\``, finding.fixedVersion && `fixed \`${finding.fixedVersion}\``,
        finding.licenseId && `license \`${finding.licenseId}\``, finding.policy && `policy \`${finding.policy}\``].filter(Boolean).join("; ");
      return `- **${finding.severity}** ${finding.kind} for \`${component.name}${component.version ? `@${component.version}` : ""}\`: ${finding.summary}${details ? ` (${details})` : ""}`;
    }) : ["- No findings were present in the imported bundle."]),
    "",
    "> External evidence only. FixMap did not fetch advisory data, maintain the vulnerability database, execute a scanner, prove exploitability, or authorize remediation."
  ].join("\n")}\n`;
}

type ParsedArgs = { ok: true; input: string; format: "markdown" | "json"; output?: string } | { ok: false; message: string };
function parseArgs(args: string[]): ParsedArgs {
  let input: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--input", "--format", "--output"].includes(flag)) return { ok: false, message: `Unknown supply-chain option: ${raw}` };
    if (seen.has(flag)) return { ok: false, message: `Pass ${flag} only once.` };
    seen.add(flag);
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("--") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return { ok: false, message: `${flag} requires a value.` };
    if (flag === "--input") input = expandHomePath(value.trim());
    else if (flag === "--output") output = expandHomePath(value.trim());
    else {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") return { ok: false, message: "--format must be markdown or json." };
      format = normalized;
    }
  }
  if (!input) return { ok: false, message: "supply-chain requires --input <bundle.json>." };
  return { ok: true, input, format, ...(output ? { output } : {}) };
}
function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
