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
    expect(repo.files.find((file) => file.path === "src/login.ts")?.textSample).toContain("login");
    expect(repo.packageScripts).toEqual([
      { name: "test", command: "vitest run" },
      { name: "typecheck", command: "tsc --noEmit" }
    ]);
  });

  it("discovers changed files from a git diff spec", async () => {
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
  });
});
