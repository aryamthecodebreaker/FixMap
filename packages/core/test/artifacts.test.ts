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

  it.each([
    ".claude/skills/fixmap/SKILL.md",
    ".cursor/commands/fixmap.md",
    ".github/prompts/fixmap.prompt.md",
    ".agents/skills/fixmap/SKILL.md"
  ])("detects a FixMap setup command at %s without excluding unrelated instructions", (path) => {
    const generated = {
      path,
      textSample: "You are the FixMap workflow assistant for this repository.\nRun `fixmap features`.\n",
      textSampleComplete: true
    };
    const unrelated = { ...generated, textSample: "Team-owned instructions for this repository.\n" };

    expect(fixMapArtifactKind(generated)).toBe("agent-command");
    expect(isFixMapArtifact(unrelated)).toBe(false);
  });

  it.each([
    ["scope.md", "# FixMap Change Scope\n\n## Declared anchors\n", "change-scope-markdown"],
    ["capability.md", "# FixMap Capability: Checkout\n\n## Declared anchors\n", "capability-map-markdown"],
    ["capabilities.md", "# FixMap Capabilities\n\nNo capabilities declared.\n", "capability-list-markdown"],
    ["scope.json", JSON.stringify({ changeScopeVersion: 1, anchors: [], selected: [], affected: [] }), "change-scope-json"],
    ["capability.json", JSON.stringify({ capabilityMapVersion: 1, capability: {}, scope: {} }), "capability-map-json"],
    ["capabilities.json", JSON.stringify({ capabilityListVersion: 1, capabilities: [] }), "capability-list-json"]
  ])("detects generated product-scope artifact %s", (path, textSample, kind) => {
    expect(fixMapArtifactKind({ path, textSample, textSampleComplete: true })).toBe(kind);
  });
});
