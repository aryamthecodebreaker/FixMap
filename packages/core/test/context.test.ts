import { describe, expect, it } from "vitest";
import { buildContextPack, estimateContextTokens, renderContextPackMarkdown } from "../src/context.js";
import type { FixMapReport, RepoMap } from "../src/types.js";

const report: FixMapReport = {
  reportVersion: 1,
  summary: "Reset context.",
  contextFiles: [{ rank: 1, path: "src/reset.ts", score: 20, confidence: "high", reasons: ["defines resetPassword"] }],
  impact: {
    seeds: ["src/reset.ts"],
    files: [{ path: "test/reset.test.ts", score: 10, confidence: "high", evidence: [{ kind: "test-route", seed: "src/reset.ts", reason: "routed test" }] }],
    inspectionOrder: ["src/reset.ts", "test/reset.test.ts"],
    history: { available: false, eligibleCommits: 0, shallow: false, truncated: false }
  },
  testRoutes: [], risks: [], changedFiles: [], diagnostics: []
};

const repo: RepoMap = {
  root: "/repo",
  files: [
    { path: "src/reset.ts", extension: ".ts", sizeBytes: 100, isTest: false, isSource: true, kind: "code", textSample: "const unrelated = 1;\n\nexport function resetPassword(email: string) {\n  return sendResetEmail(email);\n}\n", textSampleComplete: true },
    { path: "test/reset.test.ts", extension: ".ts", sizeBytes: 100, isTest: true, isSource: true, kind: "code", textSample: "test('reset password', () => {\n  expect(resetPassword('a')).toBeTruthy();\n});\n", textSampleComplete: true }
  ],
  packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: []
};

describe("context packs", () => {
  it("selects primary and supporting source under a stable budget", () => {
    const pack = buildContextPack({ report, repo, task: "resetPassword emails fail", budgetTokens: 256 });
    expect(pack.snippets.map((snippet) => snippet.role)).toEqual(["primary", "supporting"]);
    expect(pack.snippets[0]).toMatchObject({ path: "src/reset.ts", startLine: 1, language: "typescript" });
    expect(pack.estimatedSourceTokens).toBeLessThanOrEqual(256);
    expect(pack.snippets[0]?.content).toContain("resetPassword");
  });

  it("reports budget omissions without exceeding the source budget", () => {
    const pack = buildContextPack({ report, repo, task: "resetPassword", budgetTokens: 48 });
    expect(pack.estimatedSourceTokens).toBeLessThanOrEqual(48);
    expect(pack.omitted).toContainEqual({ path: "test/reset.test.ts", reason: "budget" });
  });

  it("renders fenced ranges and uses the documented byte estimate", () => {
    expect(estimateContextTokens("12345678")).toBe(2);
    const markdown = renderContextPackMarkdown(buildContextPack({ report, repo, task: "resetPassword", budgetTokens: 256 }));
    expect(markdown).toContain("`src/reset.ts`:1-6");
    expect(markdown).toContain("```typescript");
    expect(markdown).toContain("UTF-8 bytes divided by four");
  });

  it("keeps expanding on the other side when one neighboring line exceeds the allowance", () => {
    const asymmetricRepo: RepoMap = {
      ...repo,
      files: [{
        ...repo.files[0]!,
        textSample: `${"x".repeat(800)}\nexport function resetPassword() {}\nreturn sendResetEmail();\n`,
        textSampleComplete: true
      }]
    };
    const primaryOnly: FixMapReport = { ...report, impact: undefined };

    const pack = buildContextPack({ report: primaryOnly, repo: asymmetricRepo, task: "resetPassword", budgetTokens: 64 });

    expect(pack.snippets[0]?.content).toContain("sendResetEmail");
    expect(pack.estimatedSourceTokens).toBeLessThanOrEqual(64);
  });
});
