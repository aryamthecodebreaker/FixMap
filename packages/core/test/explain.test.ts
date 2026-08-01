import { describe, expect, it } from "vitest";
import { explainFile } from "../src/explain.js";
import { rankContextFiles } from "../src/rank.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string, overrides: Partial<RepoFile> = {}): RepoFile {
  return {
    path,
    extension: `.${path.split(".").pop() ?? "ts"}`,
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample,
    ...overrides
  };
}

function createRepo(files: RepoFile[]): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

const authRepo = () => createRepo([
  file("src/auth/reset-password.ts", "export function sendResetPasswordEmail() { return true; }"),
  file("src/billing/invoice.ts", "export function invoice() { return 1; }"),
  file("test/auth/reset-password.test.ts", "describe('reset password')", { isTest: true }),
  file("package-lock.json", '{ "lockfileVersion": 3 }', { kind: "config" }),
  file("logo.png", "", { isSource: false, kind: "other" })
]);

const task = { issueText: "password reset emails fail" };

describe("explainFile", () => {
  it("reports the rank and signals for a file that made the report", () => {
    const explanation = explainFile(authRepo(), task, "src/auth/reset-password.ts");

    expect(explanation.status).toBe("ranked");
    expect(explanation.rank).toBe(1);
    expect(explanation.summary).toContain("Ranked 1");
    expect(explanation.reasons.join(" ")).toContain("path matches task terms");
  });

  it("reports the score a candidate earned when it fell below the cutoff", () => {
    const explanation = explainFile(authRepo(), task, "src/billing/invoice.ts");

    expect(explanation.status).toBe("below-cutoff");
    expect(explanation.summary).toContain("below the");
    expect(explanation.summary).toContain("Name a symbol");
  });

  it("says test files are routed rather than ranked", () => {
    const explanation = explainFile(authRepo(), task, "test/auth/reset-password.test.ts");

    expect(explanation.status).toBe("excluded");
    expect(explanation.summary).toContain("routed as test commands");
  });

  it("names lockfiles and unsupported file types as deliberate exclusions", () => {
    expect(explainFile(authRepo(), task, "package-lock.json").summary).toContain("lockfiles");
    expect(explainFile(authRepo(), task, "logo.png").summary).toContain("outside the supported source extensions");
    expect(explainFile(authRepo(), task, "logo.png").status).toBe("not-scanned");
  });

  it("distinguishes a path the scan never saw", () => {
    const explanation = explainFile(authRepo(), task, "src/nowhere.ts");

    expect(explanation.status).toBe("not-scanned");
    expect(explanation.summary).toContain("no such path");
  });

  it("blames the scan limit when one was reached", () => {
    const repo = authRepo();
    repo.diagnostics = [{ code: "scan-limit-reached", severity: "warning", message: "Stopped scanning." }];

    expect(explainFile(repo, task, "src/nowhere.ts").summary).toContain("file limit");
  });

  it("names the source file that displaced a generated duplicate", () => {
    const repo = createRepo([
      file("src/color-support.ts", "export function detectColorSupport() { return isWindowsTerminal(); }"),
      file("dist/color-support.js", "export function detectColorSupport() { return isWindowsTerminal(); }")
    ]);

    const explanation = explainFile(repo, { issueText: "color support detection fails" }, "dist/color-support.js");

    expect(explanation.status).toBe("excluded");
    expect(explanation.summary).toContain("generated output for src/color-support.ts");
    expect(explanation.summary).toContain("next build overwrites");
  });

  it("accepts a Windows-style path for the same file", () => {
    const explanation = explainFile(authRepo(), task, "src\\auth\\reset-password.ts");

    expect(explanation.status).toBe("ranked");
    expect(explanation.path).toBe("src/auth/reset-password.ts");
  });

  it("normalizes case, dot segments, and an absolute path inside the repository", () => {
    const repo = authRepo();
    repo.root = "C:/work/repo";
    expect(explainFile(repo, task, "SRC/./AUTH/../auth/RESET-password.ts").path).toBe("src/auth/reset-password.ts");
    expect(explainFile(repo, task, "C:\\work\\repo\\src\\auth\\reset-password.ts").status).toBe("ranked");
    expect(explainFile(repo, task, "C:\\outside\\secret.ts").summary).toContain("outside this repository");
  });

  it("describes a top-N tie without claiming an equal score is lower", () => {
    const repo = createRepo(Array.from({ length: 9 }, (_, index) =>
      file(`src/${String.fromCharCode(97 + index)}.ts`, "password reset email token")
    ));

    const explanation = explainFile(repo, { issueText: "password reset email token" }, "src/i.ts");

    expect(explanation.status).toBe("outside-limit");
    expect(explanation.summary).toContain("outside the top 8");
    expect(explanation.summary).not.toContain("below the lowest");
  });

  // Guards the one real risk in this module: its exclusion rules mirror the candidate
  // filter inside rankContextFiles, and nothing else would catch the two drifting apart.
  it("agrees with the ranker about every file in the repository", () => {
    const repo = authRepo();
    const ranked = new Set(rankContextFiles(repo, task).map((entry) => entry.path));

    for (const entry of repo.files) {
      const explanation = explainFile(repo, task, entry.path);
      if (ranked.has(entry.path)) {
        expect(explanation.status, `${entry.path} is in the report`).toBe("ranked");
      } else {
        expect(explanation.status, `${entry.path} is not in the report`).not.toBe("ranked");
      }
    }
  });
});
