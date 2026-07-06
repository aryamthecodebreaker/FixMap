import { describe, expect, it } from "vitest";
import { buildRiskNotes, buildTestRoutes, renderJsonReport, renderMarkdownReport } from "../src/report.js";
import type { FixMapReport, RepoMap } from "../src/types.js";

describe("report rendering", () => {
  it("renders context files, test routes, and risks", () => {
    const report: FixMapReport = {
      summary: "FixMap found 1 context file and 1 likely test route.",
      changedFiles: ["src/auth/reset-password.ts"],
      contextFiles: [
        { path: "src/auth/reset-password.ts", score: 13, reasons: ["changed file"] }
      ],
      testRoutes: [
        { command: "npm test", reason: "package script named test", relatedFiles: ["test/auth/reset-password.test.ts"] }
      ],
      risks: [
        { area: "authentication", severity: "high", reason: "auth-related files are affected" }
      ]
    };

    const markdown = renderMarkdownReport(report);
    const json = renderJsonReport(report);

    expect(markdown).toContain("# FixMap Report");
    expect(markdown).toContain("src/auth/reset-password.ts");
    expect(markdown).toContain("npm test");
    expect(markdown).toContain("authentication");
    expect(JSON.parse(json)).toEqual(report);
  });

  it("routes nearby tests by path overlap and adds risk notes", () => {
    const repo: RepoMap = {
      root: "/repo",
      changedFiles: [],
      diffText: "",
      packageScripts: [
        { name: "test", command: "vitest run" },
        { name: "typecheck", command: "tsc --noEmit" }
      ],
      files: [
        { path: "src/auth/reset-password.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, textSample: "" },
        { path: "test/auth/reset-password.test.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: true, textSample: "" }
      ]
    };

    const routes = buildTestRoutes(repo, ["src/auth/reset-password.ts"]);
    const risks = buildRiskNotes(["src/auth/reset-password.ts"]);

    expect(routes[0]?.relatedFiles).toEqual(["test/auth/reset-password.test.ts"]);
    expect(routes.map((route) => route.command)).toEqual(["npm run test", "npm run typecheck"]);
    expect(risks[0]?.area).toBe("authentication");
  });
});
