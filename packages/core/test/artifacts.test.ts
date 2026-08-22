import { describe, expect, it } from "vitest";
import { fixMapArtifactKind, isFixMapArtifact } from "../src/artifacts.js";

describe("FixMap generated artifact detection", () => {
  it("detects report contracts independent of filename", () => {
    const textSample = JSON.stringify({
      reportVersion: 1,
      summary: "FixMap found context.",
      contextFiles: [],
      testRoutes: [],
      risks: [],
      changedFiles: [],
      diagnostics: []
    });

    expect(fixMapArtifactKind({ path: "saved-anywhere.json", textSample, textSampleComplete: true }))
      .toBe("report-json");
  });

  it("does not exclude an ordinary repository-owned plan.json", () => {
    const file = {
      path: "plan.json",
      textSample: JSON.stringify({ plan: "enterprise migration", steps: ["prepare", "ship"] }),
      textSampleComplete: true
    };

    expect(isFixMapArtifact(file)).toBe(false);
  });

  it("does not classify a truncated JSON sample from a partial contract", () => {
    const file = {
      path: "plan.json",
      textSample: JSON.stringify({ summary: "x", contextFiles: [], testRoutes: [], risks: [], changedFiles: [], diagnostics: [] }),
      textSampleComplete: false
    };

    expect(isFixMapArtifact(file)).toBe(false);
  });
});
