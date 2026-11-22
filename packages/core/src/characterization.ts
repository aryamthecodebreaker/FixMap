export type CharacterizationObservationBundle = {
  characterizationObservationBundleVersion: 1;
  source: {
    kind: "sandbox" | "trace" | "ci" | "manual";
    tool: string;
    version: string;
    documentFingerprint: string;
    acquiredAt: string;
    redactionReviewed: true;
    redactionSummary: string;
  };
  observations: Array<{
    id: string;
    subjectPath: string;
    subjectSymbol?: string;
    suggestedTestPath?: string;
    preconditions: string[];
    stimulus: string;
    observedOutcome: string;
    sideEffects: string[];
    repeatCount: number;
    environments: string[];
    evidenceReference: string;
    observedAt: string;
  }>;
};

export type CharacterizationTestProposal = {
  characterizationProposalVersion: 1;
  id: string;
  subject: { path: string; symbol?: string };
  suggestedTestPath: string | null;
  title: string;
  derivedFromObservationIds: string[];
  observationEvidence: Array<{
    observationId: string;
    evidenceReference: string;
    observedAt: string;
    repeatCount: number;
    environments: string[];
  }>;
  observationStrength: "single-observation" | "repeated-observation";
  draftSteps: Array<{
    kind: "arrange" | "act" | "assert";
    text: string;
    derivedFromObservationIds: string[];
  }>;
  environments: string[];
  source: CharacterizationObservationBundle["source"];
  reviewStatus: "required";
  executionAuthorized: false;
  commitAuthorized: false;
  behaviorClaim: "preserve-imported-observation-not-assert-correctness";
  diagnostics: string[];
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const MAX_OBSERVATIONS = 10_000;

/** Builds structured, non-executable review drafts from redaction-reviewed observations. */
export function proposeCharacterizationTests(candidate: unknown): CharacterizationTestProposal[] {
  const bundle = validateCharacterizationObservations(candidate);
  const groups = new Map<string, CharacterizationObservationBundle["observations"]>();
  for (const observation of bundle.observations) {
    const key = `${observation.subjectPath}\0${observation.subjectSymbol ?? ""}\0${observation.suggestedTestPath ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  return [...groups.values()].map((observations) => buildProposal(observations, bundle.source))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function validateCharacterizationObservations(candidate: unknown): CharacterizationObservationBundle {
  if (!isRecord(candidate) || candidate.characterizationObservationBundleVersion !== 1 || !isRecord(candidate.source) ||
    !["sandbox", "trace", "ci", "manual"].includes(String(candidate.source.kind)) ||
    !bounded(candidate.source.tool, 100) || !bounded(candidate.source.version, 100) ||
    typeof candidate.source.documentFingerprint !== "string" || !SHA256.test(candidate.source.documentFingerprint) ||
    typeof candidate.source.acquiredAt !== "string" || !validDate(candidate.source.acquiredAt) ||
    candidate.source.redactionReviewed !== true || !bounded(candidate.source.redactionSummary, 1_000) ||
    !Array.isArray(candidate.observations) || candidate.observations.length > MAX_OBSERVATIONS) {
    throw new Error("Invalid characterization observation bundle envelope.");
  }
  const observations = candidate.observations.map((value, index) => validateObservation(value, index));
  assertUnique(observations.map((observation) => observation.id), "characterization observation");
  return {
    characterizationObservationBundleVersion: 1,
    source: {
      kind: candidate.source.kind as CharacterizationObservationBundle["source"]["kind"],
      tool: candidate.source.tool.trim() as string,
      version: candidate.source.version.trim() as string,
      documentFingerprint: candidate.source.documentFingerprint.toLowerCase(),
      acquiredAt: new Date(candidate.source.acquiredAt).toISOString(),
      redactionReviewed: true,
      redactionSummary: candidate.source.redactionSummary.trim() as string
    },
    observations: observations.sort((a, b) => a.id.localeCompare(b.id))
  };
}

export function renderCharacterizationProposalMarkdown(proposal: CharacterizationTestProposal): string {
  const lines = [
    `## ${proposal.title}`,
    "",
    `- Target: \`${proposal.subject.path}${proposal.subject.symbol ? `#${proposal.subject.symbol}` : ""}\``,
    `- Suggested test: ${proposal.suggestedTestPath ? `\`${proposal.suggestedTestPath}\`` : "not resolved"}`,
    `- Evidence strength: ${proposal.observationStrength}`,
    "- Review: required before execution or commit",
    "- Claim: preserves imported observed behavior; it does not establish that behavior is correct",
    "",
    "### Draft steps",
    ""
  ];
  for (const step of proposal.draftSteps) {
    lines.push(`1. **${step.kind}** — ${step.text} _(observations: ${step.derivedFromObservationIds.join(", ")})_`);
  }
  if (proposal.diagnostics.length > 0) lines.push("", "### Diagnostics", "", ...proposal.diagnostics.map((entry) => `- ${entry}`));
  return `${lines.join("\n")}\n`;
}

function buildProposal(
  observations: CharacterizationObservationBundle["observations"],
  source: CharacterizationObservationBundle["source"]
): CharacterizationTestProposal {
  const first = observations[0]!;
  const observationIds = observations.map((observation) => observation.id).sort();
  const steps: CharacterizationTestProposal["draftSteps"] = [];
  for (const observation of observations) {
    for (const precondition of observation.preconditions) {
      addStep(steps, "arrange", precondition, observation.id);
    }
    addStep(steps, "act", observation.stimulus, observation.id);
    addStep(steps, "assert", observation.observedOutcome, observation.id);
    for (const sideEffect of observation.sideEffects) addStep(steps, "assert", sideEffect, observation.id);
  }
  const target = `${first.subjectPath}${first.subjectSymbol ? `#${first.subjectSymbol}` : ""}`;
  const stableInput = [source.documentFingerprint, target, first.suggestedTestPath ?? "", ...observationIds].join("\0");
  return {
    characterizationProposalVersion: 1,
    id: `characterization:${stableHash(stableInput)}`,
    subject: { path: first.subjectPath, ...(first.subjectSymbol ? { symbol: first.subjectSymbol } : {}) },
    suggestedTestPath: first.suggestedTestPath ?? null,
    title: `Characterize observed behavior of ${target}`,
    derivedFromObservationIds: observationIds,
    observationEvidence: observations.map((observation) => ({
      observationId: observation.id,
      evidenceReference: observation.evidenceReference,
      observedAt: observation.observedAt,
      repeatCount: observation.repeatCount,
      environments: observation.environments
    })),
    observationStrength: observations.every((observation) => observation.repeatCount >= 2) &&
      new Set(observations.flatMap((observation) => observation.environments)).size >= 2
      ? "repeated-observation" : "single-observation",
    draftSteps: steps,
    environments: [...new Set(observations.flatMap((observation) => observation.environments))].sort(),
    source,
    reviewStatus: "required",
    executionAuthorized: false,
    commitAuthorized: false,
    behaviorClaim: "preserve-imported-observation-not-assert-correctness",
    diagnostics: first.suggestedTestPath ? [] : ["No test path was supplied; a reviewer must choose the test location."]
  };
}

function addStep(
  steps: CharacterizationTestProposal["draftSteps"],
  kind: CharacterizationTestProposal["draftSteps"][number]["kind"],
  text: string,
  observationId: string
): void {
  const existing = steps.find((step) => step.kind === kind && step.text === text);
  if (existing) {
    existing.derivedFromObservationIds = [...new Set([...existing.derivedFromObservationIds, observationId])].sort();
  } else {
    steps.push({ kind, text, derivedFromObservationIds: [observationId] });
  }
}

function validateObservation(value: unknown, index: number): CharacterizationObservationBundle["observations"][number] {
  if (!isRecord(value) || typeof value.id !== "string" || !ID.test(value.id) ||
    typeof value.subjectPath !== "string" || !safePath(value.subjectPath) ||
    (value.subjectSymbol !== undefined && !bounded(value.subjectSymbol, 500)) ||
    (value.suggestedTestPath !== undefined && (typeof value.suggestedTestPath !== "string" || !safePath(value.suggestedTestPath))) ||
    !stringList(value.preconditions, 100, 2_000) || !bounded(value.stimulus, 4_000) || !bounded(value.observedOutcome, 4_000) ||
    !stringList(value.sideEffects, 100, 2_000) || !Number.isSafeInteger(value.repeatCount) || Number(value.repeatCount) < 1 ||
    Number(value.repeatCount) > 1_000_000 || !stringList(value.environments, 100, 500) || value.environments.length === 0 ||
    !bounded(value.evidenceReference, 1_000) || typeof value.observedAt !== "string" || !validDate(value.observedAt)) {
    throw new Error(`Invalid characterization observation at index ${index}.`);
  }
  return {
    id: value.id,
    subjectPath: normalizePath(value.subjectPath),
    ...(typeof value.subjectSymbol === "string" ? { subjectSymbol: value.subjectSymbol.trim() } : {}),
    ...(typeof value.suggestedTestPath === "string" ? { suggestedTestPath: normalizePath(value.suggestedTestPath) } : {}),
    preconditions: uniqueStrings(value.preconditions as string[]),
    stimulus: value.stimulus.trim(),
    observedOutcome: value.observedOutcome.trim(),
    sideEffects: uniqueStrings(value.sideEffects as string[]),
    repeatCount: Number(value.repeatCount),
    environments: uniqueStrings(value.environments as string[]),
    evidenceReference: value.evidenceReference.trim(),
    observedAt: new Date(value.observedAt).toISOString()
  };
}

function stringList(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((entry) => bounded(entry, maxLength));
}
function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values.map((value) => value.trim()))].sort(); }
function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }
function safePath(value: string): boolean {
  const normalized = normalizePath(value);
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function validDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}
function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`Duplicate ${label} id: ${duplicate}`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** FNV-1a is a deterministic content identity, not a security digest. */
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
