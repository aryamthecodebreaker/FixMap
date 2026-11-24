import { validateAnnotationStore } from "./annotations.js";
import { parseArchitecturePolicy } from "./architecture.js";
import { validateCapabilityStore } from "./capabilities.js";
import { validateChangeDossier } from "./dossier.js";
import { parseEvidenceProviderBundle } from "./evidence-bundle.js";
import { validateAgentIntent } from "./intent-store.js";
import { validateOutcomeRecord, validateOutcomeStore } from "./outcomes.js";
import { validateRuntimeEvidenceBundle } from "./runtime-evidence.js";
import { validateSupplyChainEvidenceBundle } from "./supply-chain.js";
import { validateTestHistoryBundle } from "./test-reliability.js";
import { validateFixMapReport } from "./validate.js";
import { parseWorkspaceConfig } from "./workspace-config.js";

/**
 * Compatibility contract for saved FixMap artifacts. Each artifact names its schema in one
 * version field. Within a version, changes are additive (new optional fields); anything that
 * would change the meaning of existing data bumps the version. A release reads exactly the
 * versions listed here and tells the user to upgrade when an artifact is newer.
 */
export type ArtifactKind =
  | "report" | "change-dossier" | "annotation-store" | "outcome-store" | "outcome-record" | "capability-store"
  | "architecture-policy" | "workspace-config" | "workspace-map" | "agent-intent"
  | "evidence-bundle" | "supply-chain-bundle" | "runtime-evidence-bundle" | "test-history-bundle";

export type ArtifactCompatibility = {
  artifactCompatibilityVersion: 1;
  kind: ArtifactKind | "unknown";
  versionField?: string;
  version?: unknown;
  supportedVersions: number[];
  status: "supported" | "newer-version" | "older-version" | "invalid" | "unknown-kind";
  message: string;
};

type Entry = { kind: ArtifactKind; field: string; supported: number[]; validate: (value: Record<string, unknown>) => void };

const REGISTRY: readonly Entry[] = [
  { kind: "report", field: "reportVersion", supported: [1], validate: (value) => {
    const result = validateFixMapReport(value, "report");
    if (!result.success) throw new Error(result.message);
  } },
  { kind: "change-dossier", field: "changeDossierVersion", supported: [1], validate: (value) => { validateChangeDossier(value); } },
  { kind: "annotation-store", field: "annotationStoreVersion", supported: [1], validate: (value) => { validateAnnotationStore(value); } },
  { kind: "outcome-store", field: "outcomeStoreVersion", supported: [1], validate: (value) => { validateOutcomeStore(value); } },
  { kind: "outcome-record", field: "outcomeRecordVersion", supported: [1], validate: (value) => { validateOutcomeRecord(value); } },
  { kind: "capability-store", field: "capabilityStoreVersion", supported: [1], validate: (value) => { validateCapabilityStore(value); } },
  { kind: "architecture-policy", field: "architecturePolicyVersion", supported: [1], validate: (value) => {
    parseArchitecturePolicy({ path: ".fixmap/policy.json", content: JSON.stringify(value), fingerprint: "compatibility-check" });
  } },
  { kind: "workspace-config", field: "workspaceConfigVersion", supported: [1], validate: (value) => { parseWorkspaceConfig(value); } },
  { kind: "workspace-map", field: "workspaceVersion", supported: [1], validate: validateWorkspaceMapShape },
  { kind: "agent-intent", field: "agentIntentVersion", supported: [1], validate: (value) => { validateAgentIntent(value); } },
  { kind: "evidence-bundle", field: "bundleVersion", supported: [1], validate: (value) => { parseEvidenceProviderBundle(JSON.stringify(value)); } },
  { kind: "supply-chain-bundle", field: "supplyChainBundleVersion", supported: [1], validate: (value) => { validateSupplyChainEvidenceBundle(value); } },
  { kind: "runtime-evidence-bundle", field: "runtimeEvidenceBundleVersion", supported: [1], validate: (value) => { validateRuntimeEvidenceBundle(value); } },
  { kind: "test-history-bundle", field: "testHistoryBundleVersion", supported: [1], validate: (value) => { validateTestHistoryBundle(value); } }
];

/** The supported version of every artifact kind, for documentation and tooling. */
export function supportedArtifactVersions(): Array<{ kind: ArtifactKind; versionField: string; supportedVersions: number[] }> {
  return REGISTRY.map((entry) => ({ kind: entry.kind, versionField: entry.field, supportedVersions: [...entry.supported] }));
}

/** Classifies a parsed JSON artifact and validates it with the same code FixMap uses to read it. */
export function checkArtifactCompatibility(candidate: unknown): ArtifactCompatibility {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return { artifactCompatibilityVersion: 1, kind: "unknown", supportedVersions: [], status: "unknown-kind", message: "Not a FixMap artifact: expected a JSON object." };
  }
  const value = candidate as Record<string, unknown>;
  // Legacy reports (before reportVersion existed) are still read; recognize them by shape.
  const entry = REGISTRY.find((item) => item.field in value) ??
    (Array.isArray(value.contextFiles) ? REGISTRY.find((item) => item.kind === "report") : undefined);
  if (!entry) {
    return {
      artifactCompatibilityVersion: 1, kind: "unknown", supportedVersions: [], status: "unknown-kind",
      message: `Not a recognized FixMap artifact: none of ${REGISTRY.map((item) => item.field).join(", ")} is present.`
    };
  }
  const version = value[entry.field];
  const base = { artifactCompatibilityVersion: 1 as const, kind: entry.kind, versionField: entry.field, ...(version !== undefined ? { version } : {}), supportedVersions: [...entry.supported] };
  if (version !== undefined && (typeof version !== "number" || !Number.isInteger(version) || version < 1)) {
    return { ...base, status: "invalid", message: `${entry.field} must be a positive whole number; found ${JSON.stringify(version)}.` };
  }
  const newest = Math.max(...entry.supported);
  if (typeof version === "number" && version > newest) {
    return { ...base, status: "newer-version", message: `This ${entry.kind} uses ${entry.field} ${version}, written by a newer FixMap. This release reads ${entry.field} ${entry.supported.join(", ")}; upgrade FixMap to read it.` };
  }
  if (typeof version === "number" && !entry.supported.includes(version)) {
    return { ...base, status: "older-version", message: `This ${entry.kind} uses ${entry.field} ${version}, which this release no longer reads. Regenerate it with this release.` };
  }
  try {
    entry.validate(value);
  } catch (error) {
    return { ...base, status: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
  return { ...base, status: "supported", message: `Valid ${entry.kind} (${entry.field} ${version ?? "legacy"}).` };
}

function validateWorkspaceMapShape(value: Record<string, unknown>): void {
  for (const key of ["repositories", "packages", "dependencies", "diagnostics"]) {
    if (!Array.isArray(value[key])) throw new Error(`Workspace map ${key} must be an array.`);
  }
  if (typeof value.workspace !== "string" || !value.workspace.trim()) throw new Error("Workspace map workspace must be a non-blank string.");
  if (typeof value.identityGraph !== "object" || value.identityGraph === null) throw new Error("Workspace map identityGraph must be an object.");
}
