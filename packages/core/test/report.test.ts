import { describe, expect, it } from "vitest";
import { buildRiskNotes, buildTestRoutes, renderJsonReport, renderMarkdownReport } from "../src/report.js";
import type { FixMapReport, RepoMap } from "../src/types.js";

describe("report rendering", () => {
  it("renders context files, test routes, and risks", () => {
    const report: FixMapReport = {
      summary: "FixMap found 1 context file and 1 likely test route.",
      changedFiles: ["src/auth/reset-password.ts"],
      diagnostics: [],
      contextFiles: [
        { path: "src/auth/reset-password.ts", score: 13, confidence: "high", reasons: ["changed file"] }
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

  it("renders informational diagnostics", () => {
    const report: FixMapReport = {
      summary: "FixMap found 0 context files and generated 0 test routes.",
      changedFiles: [],
      contextFiles: [],
      testRoutes: [],
      risks: [],
      diagnostics: [{
        code: "remote-repo-fetched",
        severity: "info",
        message: "Fetched a public repository into an isolated temporary checkout."
      }]
    };

    expect(renderMarkdownReport(report)).toContain(
      "**info** Fetched a public repository into an isolated temporary checkout."
    );
  });

  it("routes nearby tests by path overlap and adds risk notes", () => {
    const repo: RepoMap = {
      root: "/repo",
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      packageScripts: [
        { name: "test", command: "vitest run", packageDir: "" },
        { name: "typecheck", command: "tsc --noEmit", packageDir: "" }
      ],
      files: [
        { path: "src/auth/reset-password.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "" },
        { path: "test/auth/reset-password.test.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: true, kind: "code", textSample: "" }
      ]
    };

    const routes = buildTestRoutes(repo, ["src/auth/reset-password.ts"]);
    const risks = buildRiskNotes(["src/auth/reset-password.ts"]);

    expect(routes[0]?.relatedFiles).toEqual(["test/auth/reset-password.test.ts"]);
    expect(routes.map((route) => route.command)).toEqual(["npm run test", "npm run typecheck"]);
    expect(risks[0]?.area).toBe("authentication");
    expect(risks[0]?.severity).toBe("high");
  });

  it("downgrades risks that come only from context ranking when a diff is present", () => {
    const risks = buildRiskNotes(
      ["src/http/routes/auth.ts", "generated-tools/clamp-number/tool.mjs"],
      ["generated-tools/clamp-number/tool.mjs", "generated-tools/clamp-number/tool.test.mjs"]
    );

    const auth = risks.find((risk) => risk.area === "authentication");
    expect(auth?.severity).toBe("low");
    expect(auth?.reason).toContain("none of the changed files");
  });

  it("keeps full severity when a changed file triggers the risk area", () => {
    const risks = buildRiskNotes(
      ["src/auth/login.ts"],
      ["src/auth/login.ts"]
    );

    const auth = risks.find((risk) => risk.area === "authentication");
    expect(auth?.severity).toBe("high");
    expect(auth?.reason).toBe("authentication-related files are affected");
  });

  it("always includes changed test files in the test route's related files", () => {
    const repo: RepoMap = {
      root: "/repo",
      changedFiles: ["tests/postgres.integration.test.ts", "tests/sandbox.integration.test.ts"],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      packageScripts: [{ name: "test", command: "vitest run", packageDir: "" }],
      files: [
        { path: "src/storage/postgres.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "" },
        { path: "tests/postgres.integration.test.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: true, kind: "code", textSample: "" },
        { path: "tests/sandbox.integration.test.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: true, kind: "code", textSample: "" },
        { path: "tests/auth.test.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: true, kind: "code", textSample: "" }
      ]
    };

    const routes = buildTestRoutes(repo, ["src/storage/postgres.ts"]);

    expect(routes[0]?.relatedFiles).toContain("tests/postgres.integration.test.ts");
    expect(routes[0]?.relatedFiles).toContain("tests/sandbox.integration.test.ts");
  });

  it("uses the nearest workspace command and skips tests for docs-only context", () => {
    const repo: RepoMap = {
      root: "/repo",
      changedFiles: [],
      diffText: "",
      packageManager: "pnpm",
      diagnostics: [],
      packageScripts: [
        { name: "test", command: "vitest run", packageDir: "" },
        { name: "test", command: "vitest run", packageDir: "apps/api" },
        { name: "typecheck", command: "tsc --noEmit", packageDir: "apps/api" }
      ],
      files: [
        { path: "apps/api/src/auth.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "" },
        { path: "README.md", extension: ".md", sizeBytes: 10, isSource: true, isTest: false, kind: "documentation", textSample: "" }
      ]
    };

    const routes = buildTestRoutes(repo, ["apps/api/src/auth.ts"]);
    expect(routes[0]?.command).toBe("pnpm --dir apps/api run test");
    expect(buildTestRoutes(repo, ["README.md"])).toEqual([]);
  });
});
