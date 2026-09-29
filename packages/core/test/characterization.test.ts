import { describe, expect, it } from "vitest";
import {
  proposeCharacterizationTests,
  renderCharacterizationProposalMarkdown,
  validateCharacterizationObservations,
  type CharacterizationObservationBundle
} from "../src/characterization.js";

function bundle(observations: CharacterizationObservationBundle["observations"]): CharacterizationObservationBundle {
  return {
    characterizationObservationBundleVersion: 1,
    source: {
      kind: "sandbox",
      tool: "fixmap-fixture",
      version: "1.0.0",
      documentFingerprint: `sha256:${"a".repeat(64)}`,
      acquiredAt: "2026-08-21T10:00:00Z",
      redactionReviewed: true,
      redactionSummary: "Synthetic fixture; no secrets present."
    },
    observations
  };
}

function observation(
  id: string,
  overrides: Partial<CharacterizationObservationBundle["observations"][number]> = {}
): CharacterizationObservationBundle["observations"][number] {
  return {
    id,
    subjectPath: "src/auth/token.ts",
    subjectSymbol: "parseToken",
    suggestedTestPath: "test/auth/token.characterization.test.ts",
    preconditions: ["Use an expired synthetic token fixture."],
    stimulus: "Call parseToken with the fixture.",
    observedOutcome: "The call returns an expired result instead of throwing.",
    sideEffects: ["No persistence write is observed."],
    repeatCount: 1,
    environments: ["node-22-linux"],
    evidenceReference: `sandbox-run-${id}`,
    observedAt: "2026-08-21T10:01:00Z",
    ...overrides
  };
}

describe("characterization proposals", () => {
  it("builds deterministic, structured drafts without granting execution or commit authority", () => {
    const first = proposeCharacterizationTests(bundle([observation("obs-1")]))[0];
    const again = proposeCharacterizationTests(bundle([observation("obs-1")]))[0];
    expect(first.id).toBe(again.id);
    expect(first).toMatchObject({
      reviewStatus: "required",
      executionAuthorized: false,
      commitAuthorized: false,
      behaviorClaim: "preserve-imported-observation-not-assert-correctness",
      observationStrength: "single-observation",
      suggestedTestPath: "test/auth/token.characterization.test.ts"
    });
    expect(first.draftSteps.map((step) => step.kind)).toEqual(["arrange", "act", "assert", "assert"]);
    expect(first.source.documentFingerprint).toBe(`sha256:${"a".repeat(64)}`);
    expect(first.observationEvidence).toEqual([{
      observationId: "obs-1",
      evidenceReference: "sandbox-run-obs-1",
      observedAt: "2026-08-21T10:01:00.000Z",
      repeatCount: 1,
      environments: ["node-22-linux"]
    }]);
  });

  it("only labels behavior repeated when every observation repeats across multiple environments", () => {
    const repeated = proposeCharacterizationTests(bundle([
      observation("obs-1", { repeatCount: 2, environments: ["node-22-linux"] }),
      observation("obs-2", { repeatCount: 3, environments: ["node-22-windows"] })
    ]))[0];
    expect(repeated.observationStrength).toBe("repeated-observation");
    expect(repeated.environments).toEqual(["node-22-linux", "node-22-windows"]);
    expect(repeated.derivedFromObservationIds).toEqual(["obs-1", "obs-2"]);
  });

  it("deduplicates equal steps while preserving every observation identity", () => {
    const proposal = proposeCharacterizationTests(bundle([observation("obs-1"), observation("obs-2")]))[0];
    expect(proposal.draftSteps).toHaveLength(4);
    expect(proposal.draftSteps.every((step) => step.derivedFromObservationIds.length === 2)).toBe(true);
  });

  it("keeps an unresolved test location visible", () => {
    const proposal = proposeCharacterizationTests(bundle([observation("obs-1", { suggestedTestPath: undefined })]))[0];
    expect(proposal.suggestedTestPath).toBeNull();
    expect(proposal.diagnostics[0]).toContain("reviewer must choose");
    expect(renderCharacterizationProposalMarkdown(proposal)).toContain("Suggested test: not resolved");
  });

  it("renders the non-correctness and review boundaries", () => {
    const markdown = renderCharacterizationProposalMarkdown(proposeCharacterizationTests(bundle([observation("obs-1")]))[0]);
    expect(markdown).toContain("Review: required before execution or commit");
    expect(markdown).toContain("does not establish that behavior is correct");
    expect(markdown).toContain("**assert**");
  });

  it("requires redaction review, exact provenance, safe paths, and unique observation IDs", () => {
    expect(() => validateCharacterizationObservations({
      ...bundle([]), source: { ...bundle([]).source, redactionReviewed: false }
    })).toThrow("envelope");
    expect(() => validateCharacterizationObservations({
      ...bundle([]), source: { ...bundle([]).source, documentFingerprint: "nope" }
    })).toThrow("envelope");
    const duplicate = observation("obs-1");
    expect(() => validateCharacterizationObservations(bundle([duplicate, duplicate]))).toThrow("Duplicate");
    expect(() => validateCharacterizationObservations(bundle([observation("obs-1", { subjectPath: "../secret.ts" })])))
      .toThrow("index 0");
  });
});
