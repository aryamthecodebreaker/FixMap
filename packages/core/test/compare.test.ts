import { describe, expect, it } from "vitest";
import { compareReports, renderComparisonMarkdown } from "../src/compare.js";
import type { FixMapReport, RankedFile } from "../src/types.js";

function reportOf(files: Array<Partial<RankedFile> & { path: string }>): FixMapReport {
  return {
    summary: "",
    contextFiles: files.map((file, index) => ({
      rank: index + 1,
      path: file.path,
      score: file.score ?? 10,
      confidence: file.confidence ?? "medium",
      reasons: file.reasons ?? []
    })),
    testRoutes: [],
    risks: [],
    changedFiles: [],
    diagnostics: []
  };
}

describe("compareReports", () => {
  it("reports a file that rose after the task was refined", () => {
    // The loop FixMap is for: name the identifier, re-plan, watch the fix site climb.
    const previous = reportOf([
      { path: "src/plugin/parser.js", score: 21, confidence: "high" },
      { path: "src/constant.js", score: 20, confidence: "medium" }
    ]);
    const current = reportOf([
      { path: "src/constant.js", score: 44, confidence: "high" },
      { path: "src/plugin/parser.js", score: 21, confidence: "medium" }
    ]);

    const comparison = compareReports(previous, current);

    expect(comparison.moved.map((delta) => delta.path)).toEqual(["src/constant.js", "src/plugin/parser.js"]);
    const constant = comparison.moved.find((delta) => delta.path === "src/constant.js")!;
    expect(constant.previousRank).toBe(2);
    expect(constant.currentRank).toBe(1);
    expect(constant.previousConfidence).toBe("medium");
    expect(constant.currentConfidence).toBe("high");
    expect(comparison.summary).toContain("leading file changed");
  });

  it("separates files that entered from files that left", () => {
    const comparison = compareReports(
      reportOf([{ path: "a.ts" }, { path: "b.ts" }]),
      reportOf([{ path: "a.ts" }, { path: "c.ts" }])
    );

    expect(comparison.entered.map((delta) => delta.path)).toEqual(["c.ts"]);
    expect(comparison.left.map((delta) => delta.path)).toEqual(["b.ts"]);
    expect(comparison.unchanged.map((delta) => delta.path)).toEqual(["a.ts"]);
  });

  it("says plainly when refining the task changed nothing", () => {
    const report = reportOf([{ path: "a.ts" }, { path: "b.ts" }]);

    const comparison = compareReports(report, report);

    expect(comparison.summary).toContain("changed nothing");
    expect(comparison.moved).toEqual([]);
  });

  it("separates confidence-only changes from movement", () => {
    const comparison = compareReports(
      reportOf([{ path: "a.ts", score: 10, confidence: "medium" }]),
      reportOf([{ path: "a.ts", score: 10, confidence: "high" }])
    );
    expect(comparison.moved).toEqual([]);
    expect(comparison.confidenceChanged[0]?.status).toBe("confidence-changed");
    expect(comparison.summary).toBe("1 changed confidence.");
    expect(renderComparisonMarkdown(comparison)).toContain("Confidence changed");
  });

  it("uses explicit report ranks instead of array positions", () => {
    const previous = reportOf([{ path: "a.ts" }, { path: "b.ts" }]);
    const current = reportOf([{ path: "b.ts" }, { path: "a.ts" }]);
    previous.contextFiles[0]!.rank = 2;
    previous.contextFiles[1]!.rank = 1;
    current.contextFiles[0]!.rank = 1;
    current.contextFiles[1]!.rank = 2;

    const comparison = compareReports(previous, current);

    expect(comparison.moved).toEqual([]);
    expect(comparison.unchanged.map((delta) => [delta.path, delta.currentRank])).toEqual([
      ["b.ts", 1],
      ["a.ts", 2]
    ]);
  });

  it("notes a grounding change, which is usually why the ranking moved", () => {
    const previous = reportOf([{ path: "a.ts" }]);
    const current = reportOf([{ path: "a.ts" }]);
    previous.analysis = {
      grounding: {
        specificity: "vague",
        identifiers: [],
        unresolvedIdentifiers: [],
        partiallyResolvedIdentifiers: [],
        unverifiedIdentifiers: [],
        scanComplete: true
      },
      ranking: { topScore: 10, runnerUpScore: null, topGap: null, clustered: false },
      nextAction: ""
    };
    current.analysis = {
      ...previous.analysis,
      grounding: { ...previous.analysis.grounding, specificity: "anchored" }
    };

    const comparison = compareReports(previous, current);

    expect(comparison.groundingChanged).toBe(true);
    expect(comparison.summary).toBe("The ranking is unchanged, but task grounding changed from vague to anchored.");
    expect(comparison.summary).not.toContain("changed nothing");
    expect(renderComparisonMarkdown(comparison)).toContain("vague");
    expect(renderComparisonMarkdown(comparison)).toContain("anchored");
  });

  it("renders the movement as markdown", () => {
    const markdown = renderComparisonMarkdown(compareReports(
      reportOf([{ path: "a.ts", score: 10, confidence: "medium" }]),
      reportOf([{ path: "a.ts", score: 30, confidence: "high" }, { path: "b.ts" }])
    ));

    expect(markdown).toContain("# FixMap Plan Comparison");
    expect(markdown).toContain("## Entered");
    expect(markdown).toContain("`b.ts`");
    expect(markdown).toContain("confidence medium to high");
  });

  it("renders compatible legacy entries without leaking undefined values", () => {
    const legacy = (paths: string[]) => ({
      summary: "",
      contextFiles: paths.map((path) => ({ path })),
      testRoutes: [],
      risks: [],
      changedFiles: [],
      diagnostics: []
    }) as unknown as FixMapReport;

    const entered = renderComparisonMarkdown(compareReports(legacy(["a.ts"]), legacy(["a.ts", "b.ts"])));
    const moved = renderComparisonMarkdown(compareReports(legacy(["a.ts", "b.ts"]), legacy(["b.ts", "a.ts"])));

    expect(entered).toContain("`b.ts` at rank 2");
    expect(moved).toContain("rose from rank 2 to 1");
    expect(entered).not.toContain("undefined");
    expect(moved).not.toContain("undefined");
  });

  it("does not invent a grounding delta when only one report has grounding metadata", () => {
    const legacy = reportOf([{ path: "a.ts" }]);
    const current = reportOf([{ path: "a.ts" }]);
    current.analysis = {
      grounding: {
        specificity: "descriptive",
        identifiers: [],
        unresolvedIdentifiers: [],
        partiallyResolvedIdentifiers: [],
        unverifiedIdentifiers: [],
        scanComplete: true
      },
      ranking: { topScore: 10, runnerUpScore: null, topGap: null, clustered: false },
      nextAction: ""
    };

    const comparison = compareReports(legacy, current);

    expect(comparison.groundingChanged).toBe(false);
    expect(comparison.summary).toContain("predates grounding analysis");
  });

  it("rejects duplicate ranked paths instead of silently collapsing buckets", () => {
    const duplicate = reportOf([{ path: "a.ts" }, { path: "a.ts" }]);

    expect(() => compareReports(duplicate, reportOf([{ path: "a.ts" }]))).toThrow(
      "Previous report has a duplicate contextFiles path: a.ts"
    );
  });

  it("does not dereference missing grounding on a malformed additive analysis object", () => {
    const malformed = reportOf([{ path: "a.ts" }]) as FixMapReport & { analysis?: unknown };
    malformed.analysis = {};

    expect(() => compareReports(malformed as FixMapReport, reportOf([{ path: "a.ts" }]))).not.toThrow();
    expect(compareReports(malformed as FixMapReport, reportOf([{ path: "a.ts" }])).groundingChanged).toBe(false);
  });
});
