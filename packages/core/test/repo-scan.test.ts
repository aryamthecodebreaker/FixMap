import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../src/repo-scan.js";

const exec = promisify(execFile);

describe("scanRepo", () => {
  it("discovers source files, test files, and package scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-scan-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "test"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({
      scripts: {
        test: "vitest run",
        typecheck: "tsc --noEmit"
      }
    }));
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await writeFile(join(root, "test", "login.test.ts"), "import '../src/login';\n");

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.files.map((file) => file.path).sort()).toEqual([
      "package.json",
      "src/login.ts",
      "test/login.test.ts"
    ]);
    expect(repo.files.find((file) => file.path === "test/login.test.ts")?.isTest).toBe(true);
    expect(repo.files.find((file) => file.path === "src/login.ts")?.kind).toBe("code");
    expect(repo.files.find((file) => file.path === "src/login.ts")?.textSample).toContain("login");
    expect(repo.packageScripts).toEqual([
      { name: "test", command: "vitest run", packageDir: "" },
      { name: "typecheck", command: "tsc --noEmit", packageDir: "" }
    ]);
  });

  it("discovers workspace scripts and the package manager", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-workspace-"));
    await mkdir(join(root, "apps", "api"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(root, "apps", "api", "package.json"), JSON.stringify({ scripts: { typecheck: "tsc --noEmit" } }));

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.packageManager).toBe("pnpm");
    expect(repo.packageScripts).toContainEqual({ name: "typecheck", command: "tsc --noEmit", packageDir: "apps/api" });
  });

  it("reports a missing repository root as an error instead of an empty success", async () => {
    const missingRoot = join(tmpdir(), "fixmap-missing-root-does-not-exist");

    const repo = await scanRepo({ repoRoot: missingRoot });

    expect(repo.files).toEqual([]);
    expect(repo.diagnostics[0]?.code).toBe("repo-root-missing");
    expect(repo.diagnostics[0]?.severity).toBe("error");
    expect(repo.diagnostics[0]?.message).toContain(missingRoot);
  });

  it("respects .gitignore in git repositories", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-gitignore-"));
    await mkdir(join(root, ".vercel", "output"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, ".gitignore"), ".vercel\n");
    await writeFile(join(root, ".vercel", "output", "builds.json"), '{ "target": "production" }');
    await writeFile(join(root, "vercel.json"), '{ "functions": {} }');
    await writeFile(join(root, "src", "index.js"), "export const app = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root });

    const paths = repo.files.map((file) => file.path);
    expect(paths).toContain("vercel.json");
    expect(paths).toContain("src/index.js");
    expect(paths).not.toContain(".vercel/output/builds.json");
  });

  it("reports an unresolved diff instead of silently returning no changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-invalid-diff-"));
    await writeFile(join(root, "package.json"), "{}");

    const repo = await scanRepo({ repoRoot: root, diffSpec: "missing...HEAD" });

    expect(repo.changedFiles).toEqual([]);
    expect(repo.diagnostics[0]?.code).toBe("diff-unavailable");
  });

  it("discovers changed files from a git diff spec", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-diff-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await exec("git", ["checkout", "-b", "change-login"], { cwd: root });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => false;\n");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "change login"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root, diffSpec: "main...HEAD" });

    expect(repo.changedFiles).toEqual(["src/login.ts"]);
    expect(repo.diffText).toContain("login = () => false");
  });
});
