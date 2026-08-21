import { describe, expect, it, vi } from "vitest";
import { rankContextFiles, REPORT_SCORE_CUTOFF } from "../src/rank.js";
import type { RepoMap } from "../src/types.js";

function codeFile(path: string, textSample: string): RepoMap["files"][number] {
  const extension = /\.[^.]+$/.exec(path)?.[0] ?? "";
  return { path, extension, sizeBytes: textSample.length, isSource: true, isTest: false, kind: "code", textSample };
}

function documentationFile(path: string, textSample: string): RepoMap["files"][number] {
  const extension = /\.[^.]+$/.exec(path)?.[0] ?? "";
  return { path, extension, sizeBytes: textSample.length, isSource: true, isTest: false, kind: "documentation", textSample };
}

function repoWith(files: RepoMap["files"], options: { root?: string; changedFiles?: string[] } = {}): RepoMap {
  return {
    root: options.root ?? "/repo",
    packageScripts: [],
    changedFiles: options.changedFiles ?? [],
    diffText: "",
    packageManager: "npm",
    diagnostics: [],
    files
  };
}

describe("rankContextFiles", () => {
  it("lets an exact definition site beat vocabulary-dense consumers", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/constant.js", extension: ".js", sizeBytes: 40, isSource: true,
          isTest: false, kind: "code", textSample: "export const REGEX_FORMAT = /Y{1,4}/;"
        },
        {
          path: "src/plugin/parser.js", extension: ".js", sizeBytes: 500, isSource: true,
          isTest: false, kind: "code",
          textSample: "format token year offset timezone fallback parser parse custom duration"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "REGEX_FORMAT matches Y and YYY as year tokens but format has no handler"
    });

    expect(ranked[0]?.path).toBe("src/constant.js");
    expect(ranked[0]?.reasons).toContain("defines task identifiers: REGEX_FORMAT");
  });

  it("ranks a Java method definition above a vocabulary-dense caller", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile(
        "src/main/java/com/acme/auth/PasswordResetService.java",
        "public final class PasswordResetService { public User resetPassword(User user) { return user; } }"
      ),
      codeFile(
        "src/main/java/com/acme/api/ResetController.java",
        "password reset recovery token resetPassword password reset recovery token"
      )
    ]), { issueText: "resetPassword rejects a valid recovery token" });

    expect(ranked[0]?.path).toBe("src/main/java/com/acme/auth/PasswordResetService.java");
    expect(ranked[0]?.reasons).toContain("defines task identifiers: resetPassword");
  });

  it("keeps task terms when every file shares the same vocabulary", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: Array.from({ length: 20 }, (_, index) => ({
        path: `src/template-${index}.ts`, extension: ".ts", sizeBytes: 50, isSource: true,
        isTest: false, kind: "code" as const, textSample: "password reset email token"
      }))
    };

    const ranked = rankContextFiles(repo, { issueText: "password reset email token" });

    expect(ranked).toHaveLength(8);
    expect(ranked[0]?.reasons.join(" ")).toContain("password");
  });
  it("prioritizes definitions whose compound name matches multiple task terms", () => {
    const repo: RepoMap = {
      root: "/repo",
      files: [
        {
          path: "src/report.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function buildTestRoutes() { return []; }"
        },
        {
          path: "src/demo.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "import { buildTestRoutes } from './report.js'; console.log(buildTestRoutes());"
        }
      ],
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: []
    };

    const ranked = rankContextFiles(repo, { issueText: "Test routes should use the nearest workspace script" });

    expect(ranked[0]?.path).toBe("src/report.ts");
    expect(ranked[0]?.reasons).toContain("defines symbols matching task terms: buildTestRoutes");
  });

  it("prefers a path where multiple task terms converge over a generic sibling", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("lib/reporters/html.js", "export function escape() { return 'reporter escape'; }"),
      codeFile("lib/reporters/xunit.js", "export function escape() { return 'xunit reporter xml'; }")
    ]), { issueText: "xunit reporter emits invalid XML" });

    expect(ranked[0]?.path).toBe("lib/reporters/xunit.js");
    expect(ranked[0]?.reasons).toContain("multiple task terms converge in the file path");
    expect(ranked[0]?.reasons).toContain("file module name exactly matches a task term");
  });

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

  it("boosts an exact literal at the definition of a task identifier", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/schema-consumer.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function toJsonSchema() { return { format: 'cidrv6', pattern: cidrPattern }; }"
        },
        {
          path: "src/regexes.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export const cidrv6: RegExp =\n  /^(([0-9a-fA-F]{1,4}:){7})$/;"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: 'cidrv6 JSON schema emits the wrong pattern: "^(([0-9a-fA-F]{1"'
    });

    expect(ranked[0]?.path).toBe("src/regexes.ts");
    expect(ranked[0]?.reasons).toContain("defines task identifiers: cidrv6");
    expect(ranked[0]?.reasons.some((reason) => reason.startsWith("exact task literal at definition"))).toBe(true);
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

  it("does not treat a bare HTTP status as deployment evidence", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "vercel.json", extension: ".json", sizeBytes: 20, isSource: true, isTest: false, kind: "config", textSample: "{}" },
        { path: "src/http/account.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "return response.status(404).json({ error: 'account missing' });" }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "account lookup returns 404" });

    expect(ranked[0]?.path).toBe("src/http/account.ts");
    expect(ranked.flatMap((file) => file.reasons)).not.toContain("root configuration for a deployment-related task");
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
    expect(authTest?.confidence).toBe("medium");
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

  it.each(["README", "README.md"])("ranks %s for a terse README typo task", (path) => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path, extension: path.endsWith(".md") ? ".md" : "", sizeBytes: 100, isSource: true, isTest: false, kind: "documentation", textSample: "Hello World" },
        { path: "src/server.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export const server = true;" }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "README typo" });

    expect(ranked[0]?.path).toBe(path);
    expect(ranked[0]?.reasons).toContain("explicitly named in the task");
    expect(ranked[0]?.reasons).toContain("documentation-focused task");
  });

  it("treats changing README copy as documentation work", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "README", extension: "", sizeBytes: 100, isSource: true, isTest: false, kind: "documentation", textSample: "Hello World" }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "change README.md greeting" });

    expect(ranked[0]?.path).toBe("README");
    expect(ranked[0]?.reasons).toContain("documentation-focused task");
    expect(ranked[0]?.reasons).not.toContain("documentation deprioritized for an implementation task");
  });

  it("matches a compiled JavaScript path mention to its TypeScript source file", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "source/core/Ky.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export class Ky {}"
        },
        {
          path: "source/errors/HTTPError.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export class HTTPError {}"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "The response guard in core/Ky.js skips HTTP error handling"
    });

    expect(ranked[0]?.path).toBe("source/core/Ky.ts");
    expect(ranked[0]?.reasons).toContain("explicitly named in the task");
  });

  it("prefers an exact mention before considering compatible source extensions", () => {
    const files = [
      {
        path: "src/index.js",
        extension: ".js",
        sizeBytes: 100,
        isSource: true,
        isTest: false,
        kind: "code" as const,
        textSample: "export const exact = true;"
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        path: `pkg-${index}/src/index.ts`,
        extension: ".ts",
        sizeBytes: 100,
        isSource: true,
        isTest: false,
        kind: "code" as const,
        textSample: "export const fallback = true;"
      }))
    ];
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files
    };

    const ranked = rankContextFiles(repo, { issueText: "src/index.js is broken" });

    expect(ranked[0]?.path).toBe("src/index.js");
    expect(ranked[0]?.reasons).toContain("explicitly named in the task");
    expect(ranked.filter((file) => file.reasons.includes("explicitly named in the task"))).toHaveLength(1);
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

  it("boosts files within two import hops of a high-confidence context file", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: ["src/auth/login.ts"],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        { path: "src/auth/login.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "import { readSession } from \"./session.js\";\nexport function login() {}" },
        { path: "src/auth/session.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "import { fromStore } from \"./store.js\";\nexport function readSession() {}" },
        { path: "src/auth/store.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function fromStore() {}" },
        { path: "src/ui/banner.tsx", extension: ".tsx", sizeBytes: 100, isSource: true, isTest: false, kind: "code", textSample: "export function Banner() {}" }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "login fails", diffText: "" });
    const paths = ranked.map((file) => file.path);

    expect(paths).toContain("src/auth/session.ts");
    const session = ranked.find((file) => file.path === "src/auth/session.ts");
    expect(session?.reasons).toContain("imported by ranked file src/auth/login.ts");
    const store = ranked.find((file) => file.path === "src/auth/store.ts");
    expect(store?.reasons).toContain("within two import hops of ranked file src/auth/login.ts");
    expect(paths).not.toContain("src/ui/banner.tsx");
  });

  it("does not let an import-neighbor boost overtake the seed that supplied the evidence", () => {
    const issueTerms = [
      "alpha beta gamma delta epsilon zeta",
      "hotel india juliet kilo lima mike",
      "november oscar papa quebec romeo sierra",
      "tango uniform victor whiskey xray yankee",
      "amber bronze copper denim emerald fuchsia"
    ];
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/seed.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "import './z-neighbor.js';"
        },
        ...issueTerms.slice(0, 4).map((textSample, index) => ({
          path: `src/${String.fromCharCode(97 + index)}.ts`,
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code" as const,
          textSample
        })),
        {
          path: "src/z-neighbor.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: issueTerms[4] ?? ""
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: `seed.ts ${issueTerms.join(" ")}`
    });

    expect(ranked[0]?.path).toBe("src/seed.ts");
    const neighbor = ranked.find((file) => file.path === "src/z-neighbor.ts");
    expect(neighbor?.score).toBeLessThan(ranked[0]?.score ?? 0);
    expect(neighbor?.reasons).toContain("imported by ranked file src/seed.ts");
  });

  it("deprioritizes example and declaration files for runtime tasks", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "lib/transport.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function filterTransportLevel() {}"
        },
        {
          path: "examples/transport.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function filterTransportLevel() {}"
        },
        {
          path: "transport.d.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export declare function filterTransportLevel(): void"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "transport level filter fails at runtime"
    });

    expect(ranked[0]?.path).toBe("lib/transport.js");
    expect(ranked.find((file) => file.path === "examples/transport.js")?.reasons)
      .toContain("example or demo code deprioritized for an implementation task");
    expect(ranked.find((file) => file.path === "transport.d.ts")?.reasons)
      .toContain("type declaration deprioritized for a runtime task");

    const exampleTask = rankContextFiles(repo, {
      issueText: "update the transport example"
    });
    expect(exampleTask.find((file) => file.path === "examples/transport.js")?.reasons)
      .not.toContain("example or demo code deprioritized for an implementation task");

    const declarationTask = rankContextFiles(repo, {
      issueText: "the TypeScript declaration for the transport filter is wrong"
    });
    expect(declarationTask.find((file) => file.path === "transport.d.ts")?.reasons)
      .not.toContain("type declaration deprioritized for a runtime task");
  });

  it("keeps stylesheet symptom words below implementation unless the task targets presentation", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/checkout.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function applyDiscount(cart: Cart) { return cart.total; }"
        },
        {
          path: "styles/discount.css",
          extension: ".css",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: ".discount-banner .discount-total .discount-cart .discount { color: red; }"
        },
        {
          path: "src/copy.json",
          extension: ".json",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "config",
          textSample: "{ \"discount\": \"Discount total on cart\" }"
        }
      ]
    };

    const implementationTask = rankContextFiles(repo, {
      issueText: "discount total on cart is wrong"
    }, 8, 0);
    expect(implementationTask[0]?.path).toBe("src/checkout.ts");
    expect(implementationTask.find((file) => file.path === "styles/discount.css")?.reasons)
      .toContain("presentation or demo surface deprioritized for a non-UI implementation task");

    const presentationTask = rankContextFiles(repo, {
      issueText: "discount banner CSS layout is wrong on the cart page"
    });
    expect(presentationTask[0]?.path).toBe("styles/discount.css");
    expect(presentationTask[0]?.reasons)
      .not.toContain("presentation or demo surface deprioritized for a non-UI implementation task");
    expect(presentationTask[0]?.reasons).toContain("presentation surface matches a UI-focused task");
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

  it("ranks maintained source above an identical copy kept in a backup directory", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "components/ChatInterface.tsx",
          extension: ".tsx",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function ChatInterface() { return streamResponse(); }"
        },
        {
          path: "untracked quarantine/20260626-121031/components/ChatInterface.tsx",
          extension: ".tsx",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function ChatInterface() { return streamResponse(); }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "ChatInterface fails to stream the response" });

    expect(ranked[0]?.path).toBe("components/ChatInterface.tsx");
    expect(ranked.find((file) => file.path.startsWith("untracked quarantine/"))?.reasons)
      .toContain("backup or archived copy deprioritized");
  });

  it("ranks maintained source above an editor or sync conflict copy", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/uploader.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function uploadAvatar() { return retryUpload(); }"
        },
        {
          path: "src/uploader (Aryams conflicted copy 2026-06-26).ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function uploadAvatar() { return retryUpload(); }"
        },
        {
          path: "src/uploader.ts.bak",
          extension: ".bak",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function uploadAvatar() { return retryUpload(); }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "avatar upload retry fails" });

    expect(ranked[0]?.path).toBe("src/uploader.ts");
  });

  it("ranks first-party source above a build output copy of the same module", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/color-support.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function detectColorSupport() { return isWindowsTerminal(); }"
        },
        {
          path: "dist/color-support.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function detectColorSupport() { return isWindowsTerminal(); }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "color support detection fails on windows terminal" });

    // The build output is not a place to edit while its source is present: the next build
    // overwrites it, so it is left out of the report entirely.
    expect(ranked.map((file) => file.path)).toEqual(["src/color-support.ts"]);
  });

  it("still ranks a build output copy that the task names explicitly", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/color-support.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function detectColorSupport() { return isWindowsTerminal(); }"
        },
        {
          path: "dist/color-support.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function detectColorSupport() { return isWindowsTerminal(); }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "dist/color-support.js is stale and disagrees with the source"
    });

    const artifact = ranked.find((file) => file.path === "dist/color-support.js");
    expect(artifact?.reasons).toContain("explicitly named in the task");
    expect(artifact?.reasons).toContain("generated build artifact; maintained source counterpart exists");
    expect(artifact?.confidence).toBe("medium");
  });

  it("caps confidence when an explicitly named generated path has a maintained twin", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "packages/action/src/index.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function postComment(marker: string) { return marker; }"
        },
        {
          path: "packages/action/dist/index.mjs",
          extension: ".mjs",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function postComment(marker) { return marker; }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "the bundle in packages/action/dist/index.mjs mishandles the comment marker"
    });

    expect(ranked[0]?.path).toBe("packages/action/dist/index.mjs");
    expect(ranked[0]?.confidence).toBe("medium");
    expect(ranked[0]?.reasons).toContain("generated build artifact; maintained source counterpart exists");
  });

  it("keeps an edited generated twin visible but below its maintained source", () => {
    const file = (path: string, extension: string) => ({
      path,
      extension,
      sizeBytes: 100,
      isSource: true,
      isTest: false,
      kind: "code" as const,
      textSample: "export function resetPassword() { return 'token'; }"
    });
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: ["dist/app.js"],
      diffText: "+export function resetPassword() { return 'wrong'; }",
      packageManager: "npm",
      diagnostics: [],
      files: [file("src/app.ts", ".ts"), file("dist/app.js", ".js")]
    };

    const ranked = rankContextFiles(repo, { issueText: "resetPassword returns the wrong value" });

    expect(ranked[0]?.path).toBe("src/app.ts");
    expect(ranked.map((entry) => entry.path)).toContain("dist/app.js");
    expect(ranked.find((entry) => entry.path === "dist/app.js")?.reasons)
      .toContain("generated counterpart deprioritized below maintained source");
  });

  it("still credits a task term that most of a focused repository mentions", () => {
    // A term shared by half the files is normally boilerplate, but in a small
    // single-purpose repository it is the subject: chalk mentions "color" everywhere.
    // Suppressing it outright left chalk with no signal for a color-detection task.
    const file = (path: string, textSample: string) => ({
      path,
      extension: ".js",
      sizeBytes: 100,
      isSource: true,
      isTest: false,
      kind: "code" as const,
      textSample
    });
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        file("source/detect.js", "export function detectColor() { return windowsTerminal(); }"),
        file("source/palette.js", "export const palette = colorNames;"),
        file("source/style.js", "export const style = colorCodes;"),
        file("source/billing.js", "export const invoice = 1;")
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "color detect on windows" });
    const paths = ranked.map((entry) => entry.path);

    expect(paths[0]).toBe("source/detect.js");
    expect(paths).toContain("source/palette.js");
    expect(ranked.find((entry) => entry.path === "source/palette.js")?.reasons)
      .toContain("content matches task terms: color");
  });

  it("keeps a vendored directory rankable when nothing else answers the task", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "source/index.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export const chalk = createChalk();"
        },
        {
          path: "source/vendor/supports-color/index.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function supportsColor() { return detectWindowsTerminal(); }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "color detection on windows terminals" });

    expect(ranked[0]?.path).toBe("source/vendor/supports-color/index.js");
  });

  it("never reports high confidence from component words of invented identifiers", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/cache/state.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function transitionCacheState() { return 'partial invalid scheduler'; }"
        },
        {
          path: "src/cache/navigation.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function scheduleNavigation() { return 'transition state'; }"
        },
        {
          path: "src/build/policy.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function regressionPolicy() { return 'polynomial regression cache threshold'; }"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText:
        "experimentalHoudiniPartialPrerenderScheduler throws InvalidTransitionState when polynomial regression crosses the cache threshold"
    });
    const reasons = ranked.flatMap((file) => file.reasons).join(" ");

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((file) => file.confidence === "low")).toBe(true);
    expect(reasons).not.toMatch(/\bhoudini\b|\bpartial\b|\bscheduler\b|\btransition\b|\binvalid\b/);
  });

  it("caps score-derived confidence when the repository scan is incomplete", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [{
        code: "scan-limit-reached",
        severity: "warning",
        message: "The scan limit was reached."
      }],
      files: [{
        path: "src/cache/policy.ts",
        extension: ".ts",
        sizeBytes: 100,
        isSource: true,
        isTest: false,
        kind: "code",
        textSample: "cache policy threshold regression recovery"
      }]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "cache policy threshold regression recovery"
    });

    expect(ranked[0]?.score).toBeGreaterThanOrEqual(14);
    expect(ranked[0]?.confidence).toBe("medium");
  });

  it("treats a documentation reference as evidence, not as a docs-editing intent", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "lib/request.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "Object.defineProperty(Request.prototype, 'port', { get () { return this.raw.port } })"
        },
        {
          path: "docs/Request.md",
          extension: ".md",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "documentation",
          textSample: "request port documentation invalid mismatch"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "request.port is invalid and directly mismatches documentation"
    });

    expect(ranked[0]?.path).toBe("lib/request.js");
    expect(ranked[0]?.reasons).toContain("contains task member names: port");
    expect(ranked.find((file) => file.path === "docs/Request.md")?.reasons)
      .not.toContain("documentation-focused task");
  });

  it("gives an explicit nested path enough weight to beat large-repository keyword noise", () => {
    const noise = Array.from({ length: 20 }, (_, index) => ({
      path: `packages/toolkit/src/query/core/noise-${index}.ts`,
      extension: ".ts",
      sizeBytes: 100,
      isSource: true,
      isTest: false,
      kind: "code" as const,
      textSample: "query react build hooks error endpoint state request argument"
    }));
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        ...noise,
        {
          path: "packages/toolkit/src/query/react/buildHooks.ts",
          extension: ".ts",
          sizeBytes: 74_000,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "",
          textSampleComplete: false
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "src/query/react/buildHooks.ts(1823,13) has a type error"
    });

    expect(ranked[0]?.path).toBe("packages/toolkit/src/query/react/buildHooks.ts");
    expect(ranked[0]?.confidence).toBe("high");
  });

  it("uses normalized HTTP/2 evidence to prefer the h2 client implementation", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "lib/dispatcher/client-h2.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "abort request response stream client session cleanup"
        },
        {
          path: "lib/web/fetch/body.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "abort request response stream body leak"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "aborted HTTP/2 client requests leak the response stream"
    });

    expect(ranked[0]?.path).toBe("lib/dispatcher/client-h2.js");
    expect(ranked[0]?.reasons).toContain("path matches task terms: client, h2");
  });

  it("uses an exact quoted package literal to find an affected type bridge", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "lib/types/config-api.d.ts",
          extension: ".ts",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "import { type Config } from \"@eslint/config-helpers\"; export { type Config };"
        },
        {
          path: "lib/config/flat-config-array.js",
          extension: ".js",
          sizeBytes: 100,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "config helper object alias package configuration"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "Alias `Config` to `ConfigObject` in `@eslint/config-helpers`"
    });

    expect(ranked[0]?.path).toBe("lib/types/config-api.d.ts");
    expect(ranked[0]?.reasons).toContain("contains exact task literal: @eslint/config-helpers");
  });

  it("ranks readable source above a committed minified bundle that matches the same terms", () => {
    // Repositories commit pre-bundled third-party dependencies (Next.js keeps them
    // under src/compiled/). They have no first-party counterpart, so the
    // generated-duplicate rule keeps them, and their minified text contains the
    // symbol names being searched for. Editing one is always wrong.
    const bundle = `(function(){function safeParse(t){return t};function safeParseAsync(t){return Promise.resolve(t)};${"function h(a,b){return a+b};".repeat(400)}})();`;
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/parser/parse-input.ts",
          extension: ".ts",
          sizeBytes: 200,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function safeParseAsync(source: string) {\n  return parseInput(source);\n}\n"
        },
        {
          path: "src/compiled/safe-parser/index.js",
          extension: ".js",
          sizeBytes: bundle.length,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: bundle
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "safeParseAsync returns the wrong result for nested input" });

    expect(ranked[0]?.path).toBe("src/parser/parse-input.ts");
    expect(ranked.find((file) => file.path === "src/compiled/safe-parser/index.js")?.reasons)
      .toContain("machine-generated bundle deprioritized");
  });

  it("deprioritizes pretty-printed webpack bundles with short lines", () => {
    const bundle = [
      "var __webpack_require__ = {};",
      "var webpackChunkapp = [];",
      ...Array.from({ length: 120 }, (_, index) =>
        `webpackChunkapp.push([${index}, function resetPasswordEmail() {}]);`)
    ].join("\n");
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/auth/reset-password.ts",
          extension: ".ts",
          sizeBytes: 120,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function resetPasswordEmail() { return sendReset(); }"
        },
        {
          path: "public/assets/app.js",
          extension: ".js",
          sizeBytes: bundle.length,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: bundle
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "resetPasswordEmail fails" });

    expect(bundle.length / bundle.split("\n").length).toBeLessThan(100);
    expect(ranked[0]?.path).toBe("src/auth/reset-password.ts");
    expect(ranked.find((file) => file.path === "public/assets/app.js")?.reasons)
      .toContain("machine-generated bundle deprioritized");
  });

  it("deprioritizes a pretty-printed vendored bundle with one marker and no source twin", () => {
    const bundle = [
      ...Array.from(
        { length: 150 },
        (_, index) =>
          `function transitionState${index}() { return "experimental transition state"; }`
      ),
      "//# sourceMappingURL=react-dom.development.js.map"
    ].join("\n");
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "src/router/render.ts",
          extension: ".ts",
          sizeBytes: 120,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export function renderRoute() { return renderPage(); }"
        },
        {
          path: "compiled/react-dom/cjs/react-dom.development.js",
          extension: ".js",
          sizeBytes: bundle.length,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: bundle
        }
      ]
    };

    const ranked = rankContextFiles(
      repo,
      { issueText: "experimental transition state" },
      8,
      Number.NEGATIVE_INFINITY
    );
    const vendoredBundle = ranked.find(
      (file) => file.path === "compiled/react-dom/cjs/react-dom.development.js"
    );

    expect(bundle.length).toBeGreaterThan(2_000);
    expect(bundle.length / bundle.split("\n").length).toBeLessThan(100);
    expect(vendoredBundle?.score).toBeLessThan(REPORT_SCORE_CUTOFF);
    expect(vendoredBundle?.confidence).toBe("low");
    expect(vendoredBundle?.reasons).toContain("machine-generated bundle deprioritized");
  });

  it("leaves readable vendored source alone, however long the file", () => {
    const vendored = Array.from(
      { length: 400 },
      (_, index) => `export function detectTerminal${index}() { return supportsColor(); }`
    ).join("\n");
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          path: "source/vendor/supports-color/index.js",
          extension: ".js",
          sizeBytes: vendored.length,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: vendored
        }
      ]
    };

    const ranked = rankContextFiles(repo, { issueText: "supportsColor detection on windows terminals" });

    expect(ranked[0]?.path).toBe("source/vendor/supports-color/index.js");
    expect(ranked[0]?.reasons.join(" ")).not.toContain("machine-generated bundle");
  });

  it("reserves high confidence for a file that actually leads", () => {
    // Measured on a real Zod task: the top eight scored 43, 24, 22, 20, 20, 20, 19, 19 and
    // every one was labeled high, which tells an agent the eighth guess is as safe to edit
    // as a leader nineteen points ahead.
    const files = [
      {
        path: "src/json-schema-processors.ts",
        extension: ".ts",
        sizeBytes: 400,
        isSource: true,
        isTest: false,
        kind: "code" as const,
        textSample: "export function stringProcessor() { return 'json schema string format processor'; }"
      },
      ...["to-json-schema", "json-schema", "from-json-schema", "schema-generator", "errors"].map((name) => ({
        path: `src/${name}.ts`,
        extension: ".ts",
        sizeBytes: 400,
        isSource: true,
        isTest: false,
        kind: "code" as const,
        textSample: "json schema string invalid produces format processor conversion"
      }))
    ];
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files
    };

    const ranked = rankContextFiles(repo, { issueText: "stringProcessor produces invalid JSON Schema" });
    const high = ranked.filter((file) => file.confidence === "high");

    expect(ranked[0]?.path).toBe("src/json-schema-processors.ts");
    expect(high).toHaveLength(1);
    // The rest are a neighborhood to read, which is what medium already means.
    expect(ranked.slice(1).every((file) => file.confidence !== "high")).toBe(true);
  });

  it("keeps high for a runner-up that ties the lead", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: ["src/alpha-handler.ts", "src/beta-handler.ts"].map((path) => ({
        path,
        extension: ".ts",
        sizeBytes: 400,
        isSource: true,
        isTest: false,
        kind: "code" as const,
        textSample: "export function retryTimeout() { return 'retry timeout backoff handler'; }"
      }))
    };

    const ranked = rankContextFiles(repo, { issueText: "retryTimeout backoff handler never fires" });

    // Identical evidence scores identically; demoting one of a genuine tie would be as
    // misleading as promoting all eight.
    expect(ranked[0]?.score).toBe(ranked[1]?.score);
    expect(ranked[1]?.confidence).toBe(ranked[0]?.confidence);
  });

  it("caps a vocabulary-only leader at medium even when it has a wide score lead", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("src/flags.ts", "export function hasFlag() { return 'flag release build test flag'; }"),
      codeFile("src/other.ts", "export function unrelated() { return false; }")
    ]), { issueText: "add a skip-tests flag for release builds" });

    expect(ranked[0]?.path).toBe("src/flags.ts");
    expect(ranked[0]?.confidence).toBe("medium");
  });

  it("caps a vocabulary-dense lead that a definition site disputes", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [],
      files: [
        {
          // Dense enough in task vocabulary to outscore the definition site outright.
          path: "src/format/token/year/timezone/offset/parse.js",
          extension: ".js",
          sizeBytes: 900,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample:
            "format token year parse formatting fallback timezone offset custom locale ordinal weekday meridiem padding"
        },
        {
          path: "src/constant.js",
          extension: ".js",
          sizeBytes: 80,
          isSource: true,
          isTest: false,
          kind: "code",
          textSample: "export const REGEX_FORMAT = 1;"
        }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText:
        "REGEX_FORMAT year token formatting falls through to timezone offset " +
        "locale ordinal weekday meridiem padding parse"
    });

    // The fixture only tests what it claims if the consumer really does lead.
    expect(ranked[0]?.path).toBe("src/format/token/year/timezone/offset/parse.js");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
    // An agent that opens only the first result never sees the definition site, so the
    // label must not claim the lead settled it.
    expect(ranked[0]?.confidence).not.toBe("high");
    // The definition site keeps its own standing: that evidence is why it is here.
    expect(ranked.find((file) => file.path === "src/constant.js")?.confidence).toBe("high");
  });

  it.each([
    ["internal/auth/token.go", "func"],
    ["Sources/Auth/Token.swift", "func"],
    ["src/main/kotlin/Token.kt", "fun"]
  ])("#500 recognizes %s %s declarations as definition sites", (path, keyword) => {
    const ranked = rankContextFiles(
      repoWith([codeFile(path, `${keyword} resolveToken(id string) string { return id }`)]),
      { issueText: "resolveToken returns the wrong value" }
    );

    expect(ranked[0]?.reasons).toContain("defines task identifiers: resolveToken");
  });

  it("#501 caps changed-file confidence when the task is vague", () => {
    const ranked = rankContextFiles(
      repoWith([codeFile("src/a.ts", "export const value = 1")], { changedFiles: ["src/a.ts"] }),
      { issueText: "improve the codebase" }
    );

    expect(ranked[0]?.confidence).toBe("low");
  });

  it("#502 rejects absolute file mentions from another repository", () => {
    const ranked = rankContextFiles(
      repoWith([
        codeFile("index.js", "export const unrelated = 1"),
        codeFile("src/real.js", "export function resolveCrash() { return true }")
      ], { root: "/home/me/current-project" }),
      { issueText: "resolveCrash fails in /home/other/different-project/index.js" }
    );

    expect(ranked.find((entry) => entry.path === "index.js")?.reasons ?? [])
      .not.toContain("explicitly named in the task");
    expect(ranked[0]?.path).toBe("src/real.js");
  });

  it("still recognizes an absolute file mention inside the scanned repository", () => {
    const ranked = rankContextFiles(
      repoWith([codeFile("src/auth.ts", "export const value = 1")], { root: "/home/me/current-project" }),
      { issueText: "inspect /home/me/current-project/src/auth.ts" }
    );

    expect(ranked[0]?.reasons).toContain("explicitly named in the task");
  });

  it("#503 does not treat a clipboard copy button as documentation work", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("src/copy-command.ts", "export function updateCopyButtonHandler() {}"),
      documentationFile("README.md", "update the copy button handler")
    ]), { issueText: "update the copy button handler" });

    expect(ranked.find((entry) => entry.path === "README.md")?.reasons ?? [])
      .not.toContain("documentation-focused task");
    expect(ranked[0]?.path).toBe("src/copy-command.ts");
  });

  it("#504 keeps maintained benchmark source rankable without a benchmark keyword", () => {
    const ranked = rankContextFiles(
      repoWith([codeFile("benchmarks/runner.ts", "export function resolveToken() { return true }")]),
      { issueText: "resolveToken is broken" }
    );

    expect(ranked[0]?.path).toBe("benchmarks/runner.ts");
  });

  it("#505 does not penalize a project file merely because it is named sample-repo", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("src/sample-repo.ts", "export function resolveToken() { return true }"),
      codeFile("src/other-name.ts", "export function resolveToken() { return true }")
    ]), { issueText: "resolveToken is broken" });

    expect(ranked[0]?.score).toBe(ranked[1]?.score);
    expect(ranked.find((entry) => entry.path === "src/sample-repo.ts")?.reasons)
      .not.toContain("presentation or demo surface deprioritized for a non-UI task");
  });

  it("#506 uses import proximity for a descriptive prose task without a code identifier", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("src/reset.ts", "export const passwordResetEmail = 'delivered';"),
      codeFile("src/transport.ts", "import './reset'; export const transport = true;")
    ]), { issueText: "password reset emails are never delivered" });

    expect(ranked.find((entry) => entry.path === "src/transport.ts")?.reasons.some((reason) =>
      reason.includes("ranked file src/reset.ts")
    )).toBe(true);
  });

  it("#507 keeps task-matched definition evidence when the task includes presentation vocabulary", () => {
    const ranked = rankContextFiles(
      repoWith([codeFile("src/validation.ts", "export function validateForm() { return true }")]),
      { issueText: "form validation rejects the right payload" }
    );

    expect(ranked[0]?.reasons).toContain("defines symbols matching task terms: validateForm");
  });

  it("#508 counts each exact task literal once instead of once per file and sort comparison", () => {
    const fragments = ["FIRST_EXACT_FAILURE", "SECOND_EXACT_FAILURE"];
    const originalSplit = String.prototype.split;
    let occurrenceScans = 0;
    const splitSpy = vi.spyOn(String.prototype, "split").mockImplementation(function (
      this: string,
      separator: string | RegExp,
      limit?: number
    ) {
      if (typeof separator === "string" && fragments.includes(separator)) occurrenceScans += 1;
      return originalSplit.call(this, separator, limit);
    });

    try {
      rankContextFiles(
        repoWith(Array.from({ length: 20 }, (_, index) => codeFile(
          `src/file-${index}.ts`,
          `export const value${index} = '${fragments[index % fragments.length]}';`
        ))),
        { issueText: `failure contains \`${fragments[0]}\` and \`${fragments[1]}\`` }
      );
      expect(occurrenceScans).toBe(fragments.length);
    } finally {
      splitSpy.mockRestore();
    }
  });

  it("#509 precompiles member patterns and expands regex tokens once per candidate file", () => {
    const NativeRegExp = RegExp;
    const constructedPatterns: string[] = [];
    const proxiedRegExp = new Proxy(NativeRegExp, {
      construct(target, args) {
        constructedPatterns.push(String(args[0]));
        return Reflect.construct(target, args);
      }
    });
    const originalMatchAll = String.prototype.matchAll;
    let regexTokenScans = 0;
    const matchAllSpy = vi.spyOn(String.prototype, "matchAll").mockImplementation(function (
      this: string,
      regexp: RegExp
    ) {
      if (regexp.source === "\\b([A-Za-z])\\{(\\d+),(\\d+)\\}") regexTokenScans += 1;
      return originalMatchAll.call(this, regexp);
    });
    vi.stubGlobal("RegExp", proxiedRegExp);

    try {
      const files = Array.from({ length: 20 }, (_, index) => codeFile(
        `src/file-${index}.ts`,
        `export const pattern${index} = /a{3,5}/; config.timeout = user.email;`
      ));
      rankContextFiles(repoWith(files), { issueText: "config.timeout and user.email are wrong" });

      expect(constructedPatterns.filter((pattern) => pattern.includes("timeout") || pattern.includes("email")))
        .toHaveLength(2);
      expect(regexTokenScans).toBe(files.length);
    } finally {
      vi.unstubAllGlobals();
      matchAllSpy.mockRestore();
    }
  });

  it("prefers the interactive surface for a user-flow task over a metadata wrapper", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("app/demo/page.tsx", "export function DemoPage() { return <Demo />; }"),
      codeFile("app/demo.tsx", "export function Demo() { const [task] = useState(''); return <input onChange={() => task} />; }")
    ]), { issueText: "the website demo should let visitors enter a task" });

    expect(ranked[0]?.path).toBe("app/demo.tsx");
    expect(ranked[0]?.reasons).toContain("interactive presentation surface matches the requested user flow");
  });

  it("#512 boosts a lowercase definition named plainly in the task", () => {
    const ranked = rankContextFiles(
      repoWith([codeFile("src/validation.ts", "export function validate() { return true }")]),
      { issueText: "validate rejects the right payload" }
    );

    expect(ranked[0]?.reasons).toContain("defines symbols matching task terms: validate");
  });

  it("uses an exact quoted error message as ranking evidence", () => {
    const ranked = rankContextFiles(repoWith([
      codeFile("src/error.ts", "throw new Error('Cannot read properties of undefined')"),
      codeFile("src/other.ts", "export const login = true")
    ]), { issueText: 'login throws "Cannot read properties of undefined"' });

    expect(ranked[0]?.path).toBe("src/error.ts");
    expect(ranked[0]?.reasons.some((reason) => reason.startsWith("contains exact task literal:"))).toBe(true);
  });

  it("ranks Unicode identifiers and task vocabulary instead of returning an empty map", () => {
    const ranked = rankContextFiles(
      repoWith([
        codeFile("src/login.ts", "export function 修复登录错误() { return true; }"),
        codeFile("src/other.ts", "export function unrelated() { return false; }")
      ]),
      { issueText: "修复登录错误() 失败" }
    );

    expect(ranked[0]?.path).toBe("src/login.ts");
    expect(ranked[0]?.reasons).toContain("defines task identifiers: 修复登录错误");
  });
});
