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

  it("ranks root configuration files for deployment tasks instead of weak content matches", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "vercel.json", extension: ".json", sizeBytes: 100, isSource: true, isTest: false, kind: "config", textSample: '{ "functions": { "api/index.ts": {} } }' },
        { path: "package.json", extension: ".json", sizeBytes: 100, isSource: true, isTest: false, kind: "config", textSample: '{ "scripts": { "dev": "fastify start" } }' },
        { path: "package-lock.json", extension: ".json", sizeBytes: 100, isSource: true, isTest: false, kind: "config", textSample: '{ "lockfileVersion": 3 }' },
        { path: "tsconfig.json", extension: ".json", sizeBytes: 100, isSource: true, isTest: false, kind: "config", textSample: '{ "compilerOptions": {} }' },
        { path: "src/brain/memoryExtraction.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export const extract = () => 1; // it does not do anything else" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "Deploying to Vercel succeeds but the site returns 404 and the API does not respond"
    });

    expect(ranked[0]?.path).toBe("vercel.json");
    expect(ranked[0]?.reasons).toContain("root configuration for a deployment-related task");
    expect(ranked.map((file) => file.path)).toContain("package.json");
    expect(ranked.map((file) => file.path)).not.toContain("package-lock.json");
    expect(ranked.map((file) => file.path)).not.toContain("tsconfig.json");
    expect(ranked.map((file) => file.path)).not.toContain("src/brain/memoryExtraction.ts");
    expect(ranked.flatMap((file) => file.reasons).join(" ")).not.toMatch(/\bnot\b|\bdoe\b/);
  });

  it("ranks files explicitly named in the task, including test files", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "tests/auth.test.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: true, kind: "code", textSample: "it('hashes') // calls hashPassword" },
        { path: "tests/orchestrator.test.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: true, kind: "code", textSample: "it('loads key')" },
        { path: "src/auth/passwords.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function verifyPassword() {}" },
        { path: "scripts/smoke-gemini.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "const key = process.env.GEMINI_API_KEY;" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText:
        "tests/auth.test.ts fails because it calls hashPassword instead of verifyPassword; tests/orchestrator.test.ts fails because it loads GEMINI_API_KEY instead of using a fake backend"
    });

    const paths = ranked.map((file) => file.path);
    expect(paths).toContain("tests/auth.test.ts");
    expect(paths).toContain("tests/orchestrator.test.ts");
    const authTest = ranked.find((file) => file.path === "tests/auth.test.ts");
    expect(authTest?.reasons).toContain("explicitly named in the task");
    expect(authTest?.confidence).toBe("high");
  });

  it("matches an explicit basename mention against its repository path", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "src/http/server.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export const server = 1;" },
        { path: "src/http/routes/chat.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export const chat = 1;" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "Cannot find module @fastify/rate-limit in server.ts"
    });

    expect(ranked[0]?.path).toBe("src/http/server.ts");
    expect(ranked[0]?.reasons).toContain("explicitly named in the task");
  });

  it("ignores ambiguous bare-filename mentions that match many files", () => {
    const files = Array.from({ length: 6 }, (_, index) => ({
      path: `src/module-${index}/index.ts`,
      extension: ".ts",
      sizeBytes: 100,
      isSource: true,
      isTest: false,
      kind: "code" as const,
      textSample: "export {};"
    }));
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files
    };

    const ranked = rankContextFiles(repo, { issueText: "index.ts is broken" });

    expect(ranked.flatMap((file) => file.reasons)).not.toContain("explicitly named in the task");
  });

  it("does not count generic code keywords as content matches", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "src/generated/clamp.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export async function clamp() { await tick(); throw new TypeError('x'); }" },
        { path: "src/upload/retry.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function retryUpload() {}" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "upload retry fails: async handler does not await and throws"
    });

    expect(ranked[0]?.path).toBe("src/upload/retry.ts");
    expect(ranked.flatMap((file) => file.reasons).join(" ")).not.toMatch(/\basync\b|\bawait\b|\bthrow\b/);
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
