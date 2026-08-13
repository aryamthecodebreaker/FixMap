import { describe, expect, it } from "vitest";
import * as browserEntry from "../src/browser.js";
import * as nodeEntry from "../src/index.js";

describe("public entrypoint parity", () => {
  it.each([
    "buildReportFromRepo",
    "renderJsonReport",
    "renderMarkdownReport",
    "renderAgentReport",
    "buildImpactMap",
    "validateFixMapReport",
    "quoteCliValue"
  ])("exports deterministic API %s from both node and browser entries", (name) => {
    expect(nodeEntry).toHaveProperty(name);
    expect(browserEntry).toHaveProperty(name);
  });

  it("keeps filesystem scanning node-only", () => {
    expect(nodeEntry).toHaveProperty("buildFixMapAnalysis");
    expect(nodeEntry).toHaveProperty("scanRepo");
    expect(browserEntry).not.toHaveProperty("scanRepo");
    expect(browserEntry).not.toHaveProperty("buildFixMapAnalysis");
  });
});
