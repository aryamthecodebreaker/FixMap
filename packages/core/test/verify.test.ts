import { describe, expect, it } from "vitest";
import { renderVerifyMarkdown, verifyPlan } from "../src/verify.js";
import type { FixMapReport, RepoFile, RepoMap } from "../src/types.js";

function source(path: string, overrides: Partial<RepoFile> = {}): RepoFile {
  return {
    path,
    extension: `.${path.split(".").pop() ?? "ts"}`,
    sizeBytes: 40,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample: "export const value = 1;",
    ...overrides
  };
}

const files: RepoFile[] = [
  source("src/auth/reset-password.ts"),
  source("src/billing/charge.ts"),
  source("dist/auth/reset-password.js"),
  source("test/reset-password.test.ts", { isTest: true })
];

function repoWith(changedFiles: string[]): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [],
    changedFiles,
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

function planFor(topPath: string): FixMapReport {
  return {
    summary: "",
    contextFiles: [{ rank: 1, path: topPath, score: 20, confidence: "high", reasons: ["path matches task terms: reset"] }],
    testRoutes: [{ command: "npm run test", reason: "root script", relatedFiles: ["test/reset-password.test.ts"] }],
    risks: [],
    changedFiles: [],
    diagnostics: []
  };
}

describe("verifyPlan", () => {
  it("says there is nothing to verify when the diff is empty", () => {
    const result = verifyPlan(planFor("src/auth/reset-password.ts"), repoWith([]));

    expect(result.findings).toEqual([]);
    expect(result.summary).toContain("zero files");
  });

  it("raises an error for an edit a build will discard", () => {
    const result = verifyPlan(
      planFor("src/auth/reset-password.ts"),
      repoWith(["dist/auth/reset-password.js"])
    );
    const finding = result.findings.find((entry) => entry.code === "edit-in-generated-location");

    expect(finding?.severity).toBe("error");
    expect(finding?.paths).toEqual(["dist/auth/reset-password.js"]);
    expect(finding?.message).toContain("will be lost");
  });

  it("warns instead of failing for a committed generated release artifact", () => {
    const repo = repoWith(["dist/auth/reset-password.js"]);
    repo.trackedFiles = ["dist/auth/reset-password.js"];

    const result = verifyPlan(planFor("src/auth/reset-password.ts"), repo);

    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "tracked-generated-edit",
      severity: "warning"
    }));
    expect(result.findings.map((entry) => entry.code)).not.toContain("edit-in-generated-location");
    expect(result.findings.map((entry) => entry.code)).not.toContain("unmapped-change");
    expect(result.findings.map((entry) => entry.code)).not.toContain("no-test-changed");
  });

  it("refuses to verify a plan whose paths do not exist in this repository", () => {
    const result = verifyPlan(planFor("other-repo/src/auth.ts"), repoWith(["src/auth/reset-password.ts"]));

    expect(result.findings).toEqual([expect.objectContaining({
      code: "plan-repository-mismatch",
      severity: "error"
    })]);
    expect(result.summary).toContain("plan and repository do not match");
  });

  it("names files the change needed that the plan never ranked", () => {
    const result = verifyPlan(
      planFor("src/auth/reset-password.ts"),
      repoWith(["src/auth/reset-password.ts", "src/billing/charge.ts"])
    );
    const finding = result.findings.find((entry) => entry.code === "unmapped-change");

    expect(finding?.paths).toEqual(["src/billing/charge.ts"]);
    expect(finding?.severity).toBe("warning");
  });

  it("does not count a new test as an unmapped change", () => {
    const result = verifyPlan(
      planFor("src/auth/reset-password.ts"),
      repoWith(["src/auth/reset-password.ts", "test/reset-password.test.ts"])
    );

    expect(result.findings.map((entry) => entry.code)).not.toContain("unmapped-change");
    expect(result.findings.map((entry) => entry.code)).not.toContain("no-test-changed");
  });

  it("flags source moving with no test moving, and points at the routed test", () => {
    const result = verifyPlan(
      planFor("src/auth/reset-password.ts"),
      repoWith(["src/auth/reset-password.ts"])
    );
    const finding = result.findings.find((entry) => entry.code === "no-test-changed");

    expect(finding?.paths).toEqual(["test/reset-password.test.ts"]);
  });

  it("anchors no-test-changed to the changed source when routes have no test files", () => {
    const plan = planFor("src/auth/reset-password.ts");
    plan.testRoutes = [{ command: "npm test", reason: "root script", relatedFiles: [] }];

    const result = verifyPlan(plan, repoWith(["src/auth/reset-password.ts"]));
    const finding = result.findings.find((entry) => entry.code === "no-test-changed");

    expect(finding?.paths).toEqual(["src/auth/reset-password.ts"]);
    expect(finding?.message).toContain("npm test");
  });

  it("notes an untouched leading file without calling it wrong", () => {
    const result = verifyPlan(
      planFor("src/auth/reset-password.ts"),
      repoWith(["src/billing/charge.ts", "test/reset-password.test.ts"])
    );
    const finding = result.findings.find((entry) => entry.code === "leading-file-untouched");

    expect(finding?.severity).toBe("warning");
    expect(finding?.message).toContain("expected if it was only read for context");
  });

  it("reports risk the plan never mentioned", () => {
    const plan = planFor("src/billing/charge.ts");
    const result = verifyPlan(plan, repoWith(["src/auth/reset-password.ts", "test/reset-password.test.ts"]));
    const finding = result.findings.find((entry) => entry.code === "new-risk-area");

    expect(finding?.message).toContain("authentication");
    expect(finding?.paths).toEqual(["src/auth/reset-password.ts", "test/reset-password.test.ts"]);
    expect(finding?.severity).toBe("warning");
  });

  it("stays quiet about risk the plan already flagged", () => {
    const plan = planFor("src/auth/reset-password.ts");
    plan.risks = [{ area: "authentication", severity: "high", reason: "authentication-related files are affected" }];

    const result = verifyPlan(plan, repoWith(["src/auth/reset-password.ts", "test/reset-password.test.ts"]));

    expect(result.findings.map((entry) => entry.code)).not.toContain("new-risk-area");
  });

  it("reports a clean change as clean", () => {
    // A real plan that ranks an auth file also carries the auth risk, so nothing
    // about this change is new to it.
    const plan = planFor("src/auth/reset-password.ts");
    plan.risks = [{ area: "authentication", severity: "high", reason: "authentication-related files are affected" }];

    const result = verifyPlan(plan, repoWith(["src/auth/reset-password.ts", "test/reset-password.test.ts"]));

    expect(result.findings).toEqual([]);
    expect(result.summary).toContain("nothing to flag");
  });

  it("renders findings and changed files as markdown", () => {
    const result = verifyPlan(planFor("src/auth/reset-password.ts"), repoWith(["dist/auth/reset-password.js"]));
    const markdown = renderVerifyMarkdown(result);

    expect(markdown).toContain("# FixMap Verification");
    expect(markdown).toContain("**error**");
    expect(markdown).toContain("`dist/auth/reset-password.js`");
  });

  it("explains an empty diff instead of rendering empty sections", () => {
    const markdown = renderVerifyMarkdown(verifyPlan(planFor("src/auth/reset-password.ts"), repoWith([])));

    // "## Findings - None found" is accurate and reads like a missing-data bug.
    expect(markdown).not.toContain("None found");
    expect(markdown).not.toContain("## Findings");
    expect(markdown).toContain("zero files");
    expect(markdown).toContain("HEAD~1...HEAD");
  });

  it("carries scan diagnostics so verify JSON reports what plan JSON does", () => {
    const repo = repoWith(["src/auth/reset-password.ts"]);
    repo.diagnostics = [{
      code: "scan-limit-reached",
      severity: "warning",
      message: "Stopped scanning after 25,000 files."
    }];

    const result = verifyPlan(planFor("src/auth/reset-password.ts"), repo);

    expect(result.diagnostics).toEqual(repo.diagnostics);
    // Both commands now hand an agent the same three concepts, so consuming either does
    // not require branching on the output shape.
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(["summary", "changedFiles", "findings", "diagnostics"])
    );
  });

  it("carries diagnostics even when the diff resolved to nothing", () => {
    const repo = repoWith([]);
    repo.diagnostics = [{ code: "diff-unavailable", severity: "warning", message: "Could not resolve git diff." }];

    expect(verifyPlan(planFor("src/auth/reset-password.ts"), repo).diagnostics).toEqual(repo.diagnostics);
  });
});
