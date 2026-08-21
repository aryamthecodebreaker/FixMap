import { describe, expect, it } from "vitest";
import { buildReportFromRepo, buildRiskNotes, buildTestRoutes, renderAgentReport, renderJsonReport, renderMarkdownReport } from "../src/report.js";
import { addAnnotation, createAnnotation, emptyAnnotationStore } from "../src/annotations.js";
import type { FixMapReport, RepoMap } from "../src/types.js";

describe("report rendering", () => {
  it("renders context files, test routes, and risks", () => {
    const report: FixMapReport = {
      summary: "FixMap found 1 context file and 1 likely test route.",
      changedFiles: ["src/auth/reset-password.ts"],
      diagnostics: [],
      contextFiles: [
        { rank: 1, path: "src/auth/reset-password.ts", score: 13, confidence: "high", reasons: ["changed file"] }
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

  it("renders diagnostic paths and marks new JSON reports with version 1", () => {
    const repo: RepoMap = {
      root: "/repo",
      files: [{
        path: "src/auth.ts", extension: ".ts", sizeBytes: 20, isSource: true,
        isTest: false, kind: "code", textSample: "export const resetPassword = true"
      }],
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [{
        code: "content-unread",
        severity: "warning",
        message: "One path could not be sampled.",
        paths: ["src/large.ts"]
      }]
    };

    const report = buildReportFromRepo(repo, { issueText: "resetPassword fails" });

    expect(report.reportVersion).toBe(1);
    expect(renderMarkdownReport(report)).toContain("  - `src/large.ts`");
  });

  it("surfaces relevant repository annotations in Markdown and agent reports", () => {
    const annotation = createAnnotation({
      scope: { kind: "file", path: "src/auth.ts" },
      note: "Do not refactor; external identity contract.",
      createdAt: "2026-08-21T10:00:00Z"
    });
    const annotationText = JSON.stringify(addAnnotation(emptyAnnotationStore(), annotation));
    const repo: RepoMap = {
      root: "/repo",
      files: [
        {
          path: "src/auth.ts", extension: ".ts", sizeBytes: 40, isSource: true, isTest: false,
          kind: "code", textSample: "export function authenticate() {}"
        },
        {
          path: ".fixmap/annotations.json", extension: ".json", sizeBytes: annotationText.length,
          contentFingerprint: `worktree:${"a".repeat(64)}`,
          isSource: true, isTest: false, kind: "config", textSample: annotationText, textSampleComplete: true
        }
      ],
      packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: []
    };
    const report = buildReportFromRepo(repo, {
      issueText: "authenticate users",
      annotationAsOf: "2026-08-22T00:00:00Z"
    });
    expect(report.annotations?.entries).toContainEqual(expect.objectContaining({
      status: "active",
      annotation: expect.objectContaining({ note: "Do not refactor; external identity contract." })
    }));
    expect(report.annotations?.sourceFingerprint).toBe(`worktree:${"a".repeat(64)}`);
    expect(renderMarkdownReport(report)).toContain("## Human Intent");
    expect(renderAgentReport(report)).toContain("INTENT:");
    expect(renderAgentReport(report)).toContain("external identity contract");
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
    expect(routes.map((route) => route.command)).toEqual(["npm run test"]);
    expect(risks[0]?.area).toBe("authentication");
    expect(risks[0]?.severity).toBe("low");
    expect(risks[0]?.reason).toContain("no diff evidence");
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

  it("warns when code is ranked but no supported test route exists", () => {
    const repo: RepoMap = {
      root: "/repo",
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      packageScripts: [],
      files: [{
        path: "requests/adapters.py", extension: ".py", sizeBytes: 20, isSource: true,
        isTest: false, kind: "code", textSample: "def stream_timeout(): pass"
      }]
    };

    const report = buildReportFromRepo(repo, { issueText: "stream timeout fails" });

    expect(report.testRoutes).toEqual([]);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: "no-test-route" }));
  });

  it("lists only the tests each package command can actually reach", () => {
    // Every route previously carried the same repository-wide list, so a core
    // route advertised action tests that `--prefix packages/core` never runs.
    const source = (path: string) => ({
      path, extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code" as const, textSample: ""
    });
    const test = (path: string) => ({ ...source(path), isTest: true });
    const repo: RepoMap = {
      root: "/repo",
      packageManager: "npm",
      changedFiles: [],
      diffText: "",
      diagnostics: [],
      packageScripts: [
        { name: "test", command: "vitest run", packageDir: "packages/core" },
        { name: "test", command: "vitest run", packageDir: "packages/action" }
      ],
      files: [
        source("packages/core/src/rank.ts"),
        source("packages/action/src/runner.ts"),
        test("packages/core/test/rank.test.ts"),
        test("packages/action/test/runner.test.ts")
      ]
    };

    const routes = buildTestRoutes(repo, ["packages/core/src/rank.ts", "packages/action/src/runner.ts"]);
    const core = routes.find((route) => route.command.includes("packages/core"));
    const action = routes.find((route) => route.command.includes("packages/action"));

    expect(core?.relatedFiles).toEqual(["packages/core/test/rank.test.ts"]);
    expect(action?.relatedFiles).toEqual(["packages/action/test/runner.test.ts"]);
  });

  it("lets a repository-root command keep every related test", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageManager: "npm",
      changedFiles: [],
      diffText: "",
      diagnostics: [],
      packageScripts: [{ name: "test", command: "vitest run", packageDir: "" }],
      files: [
        { path: "packages/core/src/rank.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "" },
        { path: "packages/core/test/rank.test.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: true, kind: "code", textSample: "" }
      ]
    };

    const routes = buildTestRoutes(repo, ["packages/core/src/rank.ts"]);

    expect(routes[0]?.command).toBe("npm run test");
    expect(routes[0]?.relatedFiles).toContain("packages/core/test/rank.test.ts");
  });
  it("does not route lint or typecheck scripts as tests", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageManager: "npm",
      changedFiles: [],
      diffText: "",
      diagnostics: [],
      packageScripts: [
        { name: "lint", command: "eslint .", packageDir: "" },
        { name: "typecheck", command: "tsc --noEmit", packageDir: "" }
      ],
      files: [
        { path: "src/auth.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "" }
      ]
    };

    expect(buildTestRoutes(repo, ["src/auth.ts"])).toEqual([]);
  });

  it("keeps billing, package, and public API risk triggers reachable", () => {
    expect(buildRiskNotes(["src/billing/invoice.ts"])).toContainEqual(expect.objectContaining({ area: "billing" }));
    expect(buildRiskNotes(["package.json"])).toContainEqual(expect.objectContaining({ area: "dependencies" }));
    expect(buildRiskNotes(["src/public/api.ts"])).toContainEqual(expect.objectContaining({ area: "public-api" }));
  });

  it("ignores demo code when deriving risk, but trusts a changed file anywhere", () => {
    // Express ships examples/auth/. Reading it for risk turned a deprioritized demo
    // file into a high-severity authentication note on a request-parsing task.
    expect(buildRiskNotes(["examples/auth/index.js"], [])).toEqual([]);
    expect(buildRiskNotes(["src/auth/login.ts"], [])).toContainEqual(
      expect.objectContaining({ area: "authentication", severity: "low" })
    );
    expect(buildRiskNotes([], ["examples/auth/index.js"])).toContainEqual(
      expect.objectContaining({ area: "authentication" })
    );
  });
});
