import { describe, expect, it } from "vitest";
import { rankContextFiles } from "../src/rank.js";
import type { RepoMap } from "../src/types.js";

describe("rankContextFiles", () => {
  it("prioritizes files whose paths overlap the issue text and changed files", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: ["src/auth/reset-password.ts"],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "src/auth/reset-password.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function resetPassword() {}" },
        { path: "src/billing/invoice.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function invoice() {}" },
        { path: "test/auth/reset-password.test.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: true, kind: "code", textSample: "describe('reset password')" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "password reset fails for auth users",
      diffText: ""
    });

    expect(ranked[0]?.path).toBe("src/auth/reset-password.ts");
    expect(ranked[0]?.reasons).toContain("changed file");
  });

  it("uses file content when the path does not contain the task terms", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "src/services/UserAccount.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export async function sendPasswordResetEmail() {}" },
        { path: "src/ui/Button.tsx", extension: ".tsx", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function Button() {}" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "password reset email fails"
    });

    expect(ranked[0]?.path).toBe("src/services/UserAccount.ts");
    expect(ranked[0]?.reasons.some((reason) => reason.startsWith("content matches task terms"))).toBe(true);
  });

  it("ignores tokens that appear in most files in the repo", () => {
    const boilerplate = "import { widget } from 'widget';";
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "src/a.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: boilerplate },
        { path: "src/b.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: boilerplate },
        { path: "src/c.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: boilerplate },
        { path: "src/d.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: `${boilerplate} export function resetPassword() {}` }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "widget password reset fails"
    });

    expect(ranked.map((file) => file.path)).toEqual(["src/d.ts"]);
    expect(ranked[0]?.reasons.join(" ")).not.toContain("widget");
  });

  it("keeps documentation noise below matching code unless the task targets docs", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "README.md", extension: ".md", sizeBytes: 100, isSource: true, isTest: false, kind: "documentation", textSample: "password reset email troubleshooting guide" },
        { path: "src/email/reset.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "send password reset email" }
      ]
    };

    expect(rankContextFiles(repo, { issueText: "password reset email fails" })[0]?.path).toBe("src/email/reset.ts");
    expect(rankContextFiles(repo, { issueText: "update password reset documentation guide" })[0]?.path).toBe("README.md");
  });
});
