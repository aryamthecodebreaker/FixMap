import { describe, expect, it } from "vitest";
import { validateFixMapReport } from "../src/validate.js";

const envelope = {
  reportVersion: 1,
  summary: "No matches.",
  contextFiles: [],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

describe("validateFixMapReport", () => {
  it("accepts a complete empty report and legacy reports without a marker", () => {
    expect(validateFixMapReport(envelope, "report").success).toBe(true);
    const legacy = Object.fromEntries(
      Object.entries(envelope).filter(([key]) => key !== "reportVersion")
    );
    expect(validateFixMapReport(legacy, "report").success).toBe(true);
  });

  it("rejects unsupported report versions", () => {
    const result = validateFixMapReport({ ...envelope, reportVersion: 2 }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("unsupported reportVersion 2");
  });

  it("rejects truncated empty report-shaped objects", () => {
    const result = validateFixMapReport({ reportVersion: 1, contextFiles: [] }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("complete FixMap report envelope");
  });

  it("rejects a non-empty context list when the rest of the report envelope is truncated", () => {
    const result = validateFixMapReport({
      reportVersion: 1,
      contextFiles: [{ path: "src/reset.ts" }]
    }, "report");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain("complete FixMap report envelope");
      expect(result.message).toContain("testRoutes");
      expect(result.message).toContain("risks");
    }
  });

  it.each([
    [{ ...envelope, contextFiles: [{ path: "src/reset.ts" }], testRoutes: [null] }, "testRoutes entry"],
    [{ ...envelope, contextFiles: [{ path: "src/reset.ts" }], testRoutes: [{ command: "npm test" }] }, "relatedFiles"],
    [{ ...envelope, contextFiles: [{ path: "src/reset.ts" }], risks: [null] }, "risks entry"],
    [{ ...envelope, contextFiles: [{ path: "src/reset.ts" }], changedFiles: [42] }, "changedFiles"],
    [{ ...envelope, contextFiles: [{ path: "src/reset.ts" }], analysis: {} }, "analysis.grounding.specificity"]
  ])("rejects consumer-unsafe nested report data: %s", (candidate, message) => {
    const result = validateFixMapReport(candidate, "report");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain(message);
  });
});
