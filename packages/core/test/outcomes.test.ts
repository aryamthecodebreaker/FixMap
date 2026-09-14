import { describe, expect, it } from "vitest";
import {
  addOutcomeRecord,
  createOutcomeRecord,
  emptyOutcomeStore,
  removeOutcomeRecord,
  summarizeOutcomeCalibration,
  validateOutcomeStore
} from "../src/outcomes.js";

function record(id: string) {
  return createOutcomeRecord({
    id,
    taskId: `task-${id}`,
    repositoryIdentity: "fixmap://workspace/company/repository/api",
    planFingerprint: "plan:0123456789abcdef",
    recordedAt: "2026-08-21T12:00:00Z",
    predictedPaths: ["src/auth.ts", "src/session.ts"],
    editedPaths: ["src/auth.ts", "src/new.ts"],
    testOutcomes: [{
      command: "npm test -- auth",
      status: "passed" as const,
      relatedPaths: ["test/auth.test.ts"],
      evidence: "Process exited 0 in the isolated CI job."
    }],
    taskAssessment: {
      status: "unknown" as const,
      source: "unassessed" as const,
      reason: "A passing test is not treated as task-success evidence."
    }
  });
}

describe("outcome feedback", () => {
  it("keeps predictions, edits, test outcomes, and task assessment separate", () => {
    const outcome = record("one");
    expect(outcome.predictedPaths).toEqual(["src/auth.ts", "src/session.ts"]);
    expect(outcome.editedPaths).toEqual(["src/auth.ts", "src/new.ts"]);
    expect(outcome.testOutcomes[0]?.status).toBe("passed");
    expect(outcome.taskAssessment).toMatchObject({ status: "unknown", source: "unassessed" });
  });

  it("reports visible micro-calibration without changing weights", () => {
    const store = addOutcomeRecord(emptyOutcomeStore(), record("one"));
    const calibration = summarizeOutcomeCalibration(store);
    expect(calibration.totals).toEqual({
      predictedPaths: 2,
      editedPaths: 2,
      correctlyPredictedEdits: 1,
      predictedButUnedited: 1,
      editedButUnpredicted: 1
    });
    expect(calibration.precision).toBe(0.5);
    expect(calibration.recall).toBe(0.5);
    expect(calibration.testOutcomes.passed).toBe(1);
    expect(calibration.taskAssessments.unknown).toBe(1);
    expect(calibration.automaticWeightChanges).toBe(false);
    expect(calibration).not.toHaveProperty("recommendedWeights");
  });

  it("is reversible through explicit record removal", () => {
    const populated = addOutcomeRecord(emptyOutcomeStore(), record("one"));
    expect(removeOutcomeRecord(populated, "one")).toEqual(emptyOutcomeStore());
    expect(() => removeOutcomeRecord(populated, "missing")).toThrow("not found");
  });

  it("normalizes paths and timestamps and rejects duplicates, traversal, or fabricated assessed status", () => {
    const normalized = createOutcomeRecord({
      ...record("one"),
      id: "normalized",
      taskId: "task-normalized",
      predictedPaths: ["src\\auth.ts"],
      recordedAt: "2026-08-21T17:30:00+05:30"
    });
    expect(normalized.predictedPaths).toEqual(["src/auth.ts"]);
    expect(normalized.recordedAt).toBe("2026-08-21T12:00:00.000Z");
    expect(() => validateOutcomeStore({ outcomeStoreVersion: 1, records: [record("one"), record("one")] }))
      .toThrow("Duplicate outcome record id");
    expect(() => createOutcomeRecord({ ...record("one"), id: "bad-path", predictedPaths: ["../secret"] }))
      .toThrow("Invalid predicted outcome paths");
    expect(() => createOutcomeRecord({
      ...record("one"), id: "fake", taskAssessment: { status: "succeeded", source: "unassessed", reason: "No assessor." }
    })).toThrow("Invalid task outcome assessment");
  });

  it("returns null precision and recall when there is no denominator", () => {
    const empty = summarizeOutcomeCalibration(emptyOutcomeStore());
    expect(empty.precision).toBeNull();
    expect(empty.recall).toBeNull();
  });
});
