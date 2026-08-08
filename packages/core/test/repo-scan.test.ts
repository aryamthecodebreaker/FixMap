import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { scanRepo, summarizeSkippedScope } from "../src/repo-scan.js";

const exec = promisify(execFile);

describe("summarizeSkippedScope", () => {
  it("names the busiest unread directories so a truncated scan is inspectable", () => {
    const skipped = [
      ...Array.from({ length: 40 }, (_, index) => `services/api/mod${index}.ts`),
      ...Array.from({ length: 12 }, (_, index) => `web/app/page${index}.tsx`),
      ...Array.from({ length: 3 }, (_, index) => `tooling/script${index}.mjs`)
    ];

    expect(summarizeSkippedScope(skipped)).toBe("services/ (40), web/ (12), tooling/ (3)");
  });

  it("reports root-level files separately and keeps only the busiest three scopes", () => {
    const skipped = [
      "README.md",
      ...Array.from({ length: 5 }, (_, index) => `a/one${index}.ts`),
      ...Array.from({ length: 4 }, (_, index) => `b/two${index}.ts`),
      ...Array.from({ length: 3 }, (_, index) => `c/three${index}.ts`),
      ...Array.from({ length: 2 }, (_, index) => `d/four${index}.ts`)
    ];

    const summary = summarizeSkippedScope(skipped);

    expect(summary).toBe("a/ (5), b/ (4), c/ (3)");
    expect(summary).not.toContain("d/");
  });

  it("describes an unread root-level file without inventing a directory", () => {
    expect(summarizeSkippedScope(["CHANGELOG.md"])).toBe("the repository root (1)");
  });
});

describe("scanRepo", () => {
  it("records an absolute repository root so absolute explain paths can be contained safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-root-"));
    const repo = await scanRepo({ repoRoot: root });

    expect(repo.root).toBe(resolve(root));
  });
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

  it("recognizes Go, Python, and TypeScript declaration test naming conventions", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-test-patterns-"));
    for (const path of ["handler_test.go", "test_reset.py", "reset_test.py", "types.test-d.ts"]) {
      await writeFile(join(root, path), "test reset handler\n");
    }

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.files.filter((file) => file.isTest).map((file) => file.path).sort()).toEqual([
      "handler_test.go",
      "reset_test.py",
      "test_reset.py",
      "types.test-d.ts"
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

  it("detects a pnpm workspace before a lockfile exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-pnpm-workspace-"));
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    await writeFile(join(root, "index.ts"), "export const value = 1;\n");
    const repo = await scanRepo({ repoRoot: root });
    expect(repo.packageManager).toBe("pnpm");
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

  it("includes untracked files as changed for working-tree diff specs", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-untracked-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "api"), { recursive: true });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => false;\n");
    await writeFile(join(root, "api", "index.ts"), "export default function handler() {}\n");

    const repo = await scanRepo({ repoRoot: root, diffSpec: "HEAD" });

    expect(repo.changedFiles).toContain("src/login.ts");
    expect(repo.changedFiles).toContain("api/index.ts");
  });

  it("maps tracked edits in working-tree mode and leaves untracked files out", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-worktree-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => false;\n");
    // Agent metadata: exactly what --diff HEAD swept in and what nobody is editing.
    await writeFile(join(root, ".claude", "notes.ts"), "export const scratch = 1;\n");

    const repo = await scanRepo({ repoRoot: root, workingTree: true });

    expect(repo.changedFiles).toEqual(["src/login.ts"]);
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "working-tree-diff");
    expect(diagnostic?.message).toContain("1 changed path");
    expect(diagnostic?.paths).toEqual(["src/login.ts"]);
  });

  it("adds untracked files to working-tree mode only when asked", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-worktree-untracked-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await writeFile(join(root, "src", "signup.ts"), "export const signup = () => true;\n");

    const repo = await scanRepo({ repoRoot: root, workingTree: true, includeUntracked: true });

    expect(repo.changedFiles).toContain("src/signup.ts");
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

  it("uses the scanned subdirectory as the path base for diff results", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-subdirectory-diff-"));
    const packageRoot = join(root, "packages", "core");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true }));
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@example/core" }));
    await writeFile(join(packageRoot, "src", "plan.ts"), "export const plan = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await exec("git", ["checkout", "-b", "change-plan"], { cwd: root });
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true, changed: true }));
    await writeFile(join(packageRoot, "src", "plan.ts"), "export const plan = 2;\n");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "change plan"], { cwd: root });

    const repo = await scanRepo({ repoRoot: packageRoot, diffSpec: "main...HEAD" });

    expect(repo.files.map((file) => file.path)).toContain("src/plan.ts");
    expect(repo.changedFiles).toEqual(["src/plan.ts"]);
    expect(repo.changedFiles.every((path) => repo.files.some((file) => file.path === path))).toBe(true);
    expect(repo.diffText).toContain("plan = 2");
    expect(repo.diffText).not.toContain("package.json");
  });

  it("scans first-party source that git tracks inside a conventionally generated directory", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-vendored-source-"));
    await mkdir(join(root, "source", "vendor", "supports-color"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    await writeFile(join(root, ".gitignore"), "dist/\n");
    await writeFile(join(root, "source", "index.js"), "export const chalk = 1;\n");
    await writeFile(
      join(root, "source", "vendor", "supports-color", "index.js"),
      "export function supportsColor() { return process.platform === 'win32'; }\n"
    );
    await writeFile(join(root, "dist", "bundle.js"), "export const bundled = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root });
    const paths = repo.files.map((file) => file.path);

    expect(paths).toContain("source/vendor/supports-color/index.js");
    expect(paths).not.toContain("dist/bundle.js");
  });

  it("still excludes conventionally generated directories outside a git checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-nogit-generated-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const app = 1;\n");
    await writeFile(join(root, "dist", "bundle.js"), "export const bundled = 1;\n");
    await writeFile(join(root, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");

    const repo = await scanRepo({ repoRoot: root });
    const paths = repo.files.map((file) => file.path);

    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain("dist/bundle.js");
    expect(paths).not.toContain("node_modules/left-pad/index.js");
  });

  it("never scans dependency directories even when git reports them as untracked", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-untracked-modules-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const app = 1;\n");
    await writeFile(join(root, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root });
    const paths = repo.files.map((file) => file.path);

    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain("node_modules/left-pad/index.js");
  });

  // `Set-Content -Encoding utf8` writes a BOM and JSON.parse rejects one, so a valid
  // manifest reported as invalid and every script in it was skipped.
  it.each([
    ["a UTF-8 byte order mark", (json: string) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json, "utf8")])],
    ["UTF-16LE", (json: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(json, "utf16le")])],
    ["UTF-16BE", (json: string) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(json, "utf16le").swap16()])]
  ])("reads package scripts from a manifest saved with %s", async (_label, encode) => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-manifest-encoding-"));
    await writeFile(join(root, "package.json"), encode(JSON.stringify({ name: "app", scripts: { test: "vitest run" } })));

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.packageScripts).toContainEqual(
      expect.objectContaining({ name: "test", command: "vitest run", packageDir: "" })
    );
    expect(repo.diagnostics.map((entry) => entry.code)).not.toContain("package-json-invalid");
  });

  it("rules encoding out of the diagnostic when the JSON itself is broken", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-manifest-broken-"));
    const broken = '{"name":"x","scripts":{"test":"vitest",}}';
    await writeFile(join(root, "package.json"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(broken, "utf16le")]));

    const repo = await scanRepo({ repoRoot: root });
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "package-json-invalid");

    expect(diagnostic?.message).toContain("decoded as UTF-16LE");
    expect(diagnostic?.message).toContain("not the encoding");
  });

  // A NUL byte never appears in real source. Sampling such a file as text produced a garbled
  // sample whose stray identifiers still scored.
  it("does not sample a source-named file containing NUL bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-binary-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "weird.ts"),
      Buffer.concat([Buffer.from("export const applyDiscount = "), Buffer.from([0x00, 0x01, 0xff]), Buffer.from(" junk")])
    );

    const repo = await scanRepo({ repoRoot: root });
    const weird = repo.files.find((file) => file.path === "src/weird.ts");

    expect(weird?.textSample).toBe("");
    expect(weird?.textSampleComplete).toBe(false);
    expect(weird?.textSampleSkipReason).toBe("not-text");
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "content-unread");
    expect(diagnostic?.message).toContain("not UTF-8 text");
    expect(diagnostic?.message).not.toContain("Files over");
    expect(diagnostic?.paths).toContain("src/weird.ts");
  });

  it("uses one decimal unit and rounds oversized samples up at the boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-size-unit-"));
    await writeFile(join(root, "history.ts"), "x".repeat(64_001));

    const repo = await scanRepo({ repoRoot: root });
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "content-unread");

    expect(diagnostic?.message).toContain("history.ts (65 kB)");
    expect(diagnostic?.message).toContain("Files over 64 kB");
  });

  // A sparse checkout lists paths in the index that are not on disk. Dropping them silently
  // let a partial scan read as a complete one, and --explain blamed .gitignore for a path
  // git tracks.
  it("diagnoses tracked paths that are not present on disk", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-sparse-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "present.ts"), "export const present = 1;\n");
    await writeFile(join(root, "src", "absent.ts"), "export const absent = 2;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await rm(join(root, "src", "absent.ts"));

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.files.map((file) => file.path)).toEqual(["src/present.ts"]);
    expect(repo.trackedFiles).toContain("src/absent.ts");
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "tracked-paths-absent");
    expect(diagnostic?.message).toContain("1 tracked path is not present on disk");
  });

  // A symlink beside its target is two tracked paths and one file. `stat` follows the link,
  // so both used to rank at an identical score and one module filled two rows.
  it("ranks a symlinked file once and names the path it collapsed", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-symlink-"));
    await mkdir(join(root, "real-src"), { recursive: true });
    await writeFile(join(root, "real-src", "reset.ts"), "export const alphaValue = 1;\n");
    try {
      await symlink(join(root, "real-src", "reset.ts"), join(root, "link.ts"), "file");
    } catch {
      // An unprivileged Windows session cannot create symlinks. The Linux CI run covers it.
      return;
    }
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "-A"], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.files.map((file) => file.path)).toEqual(["real-src/reset.ts"]);
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "duplicate-real-path");
    expect(diagnostic?.message).toContain("link.ts -> real-src/reset.ts");
  });

  it("collapses files reached through a Windows junction ancestor", { timeout: 30_000 }, async () => {
    if (process.platform !== "win32") return;
    const root = await mkdtemp(join(tmpdir(), "fixmap-junction-"));
    await mkdir(join(root, "real-src"), { recursive: true });
    await writeFile(join(root, "real-src", "reset.ts"), "export const resetPassword = 1;\n");
    await symlink(join(root, "real-src"), join(root, "alias-src"), "junction");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "-A"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.files.filter((file) => file.path.endsWith("reset.ts"))).toHaveLength(1);
    expect(repo.diagnostics.find((entry) => entry.code === "duplicate-real-path")?.message)
      .toContain("alias-src/reset.ts -> real-src/reset.ts");
  });

  it("turns a truncated UTF-16BE manifest into a diagnostic instead of throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-manifest-odd-be-"));
    await writeFile(join(root, "package.json"), Buffer.from([0xfe, 0xff, 0x00]));

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.packageScripts).toEqual([]);
    expect(repo.diagnostics.find((entry) => entry.code === "package-json-invalid")?.message)
      .toContain("Could not parse package.json");
  });

  it("reports a successfully resolved empty diff", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-empty-diff-"));
    await writeFile(join(root, "index.ts"), "export const value = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root, diffSpec: "HEAD...HEAD" });

    expect(repo.changedFiles).toEqual([]);
    expect(repo.diagnostics.find((entry) => entry.code === "diff-resolved")?.message)
      .toContain("resolved to zero changed files");
  });

  it("distinguishes an unborn repository from a non-repository", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-unborn-"));
    await writeFile(join(root, "index.ts"), "export const value = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root, workingTree: true });

    expect(repo.diagnostics.find((entry) => entry.code === "diff-unavailable")?.message)
      .toContain("no commits yet");
  });

  it("reports when Git is unavailable instead of calling the directory a non-repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-no-git-"));
    await writeFile(join(root, "index.ts"), "export const value = 1;\n");
    const previousPath = process.env.PATH;
    process.env.PATH = join(root, "missing-bin");
    try {
      const repo = await scanRepo({ repoRoot: root, diffSpec: "HEAD~1...HEAD" });
      const message = repo.diagnostics.find((entry) => entry.code === "diff-unavailable")?.message;
      expect(message).toContain("Git is not installed or is not available on PATH");
      expect(message).not.toContain("not a git checkout");
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it("reuses an exact clean or dirty scan but invalidates when tracked contents change", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-cache-repo-"));
    const cacheRoot = await mkdtemp(join(tmpdir(), "fixmap-cache-store-"));
    const previousCache = process.env.FIXMAP_CACHE_DIR;
    process.env.FIXMAP_CACHE_DIR = cacheRoot;
    try {
      await writeFile(join(root, "index.ts"), "export const value = 'one';\n");
      await exec("git", ["init", "-b", "main"], { cwd: root });
      await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
      await exec("git", ["config", "user.name", "Test User"], { cwd: root });
      await exec("git", ["add", "."], { cwd: root });
      await exec("git", ["commit", "-m", "initial"], { cwd: root });

      await scanRepo({ repoRoot: root, useCache: true });
      const cleanHit = await scanRepo({ repoRoot: root, useCache: true });
      expect(cleanHit.diagnostics.map((entry) => entry.code)).toContain("cache-hit");

      await writeFile(join(root, "index.ts"), "export const value = 'two';\n");
      const firstDirty = await scanRepo({ repoRoot: root, useCache: true });
      expect(firstDirty.diagnostics.map((entry) => entry.code)).not.toContain("cache-hit");
      expect(firstDirty.files[0]?.textSample).toContain("two");
      expect((await scanRepo({ repoRoot: root, useCache: true })).diagnostics.map((entry) => entry.code))
        .toContain("cache-hit");

      await writeFile(join(root, "index.ts"), "export const value = 'three';\n");
      const secondDirty = await scanRepo({ repoRoot: root, useCache: true });
      expect(secondDirty.diagnostics.map((entry) => entry.code)).not.toContain("cache-hit");
      expect(secondDirty.files[0]?.textSample).toContain("three");
    } finally {
      if (previousCache === undefined) delete process.env.FIXMAP_CACHE_DIR;
      else process.env.FIXMAP_CACHE_DIR = previousCache;
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });

  it("names skipped git submodules and leaves their contents to the nested repository", { timeout: 30_000 }, async () => {
    const child = await mkdtemp(join(tmpdir(), "fixmap-submodule-child-"));
    const root = await mkdtemp(join(tmpdir(), "fixmap-submodule-parent-"));
    await writeFile(join(child, "helper.ts"), "export const helper = 1;\n");
    await exec("git", ["init", "-b", "main"], { cwd: child });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: child });
    await exec("git", ["config", "user.name", "Test User"], { cwd: child });
    await exec("git", ["add", "."], { cwd: child });
    await exec("git", ["commit", "-m", "child"], { cwd: child });
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["-c", "protocol.file.allow=always", "submodule", "add", child, "packages/shared"], { cwd: root });
    await exec("git", ["commit", "-am", "submodule"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root });
    const diagnostic = repo.diagnostics.find((entry) => entry.code === "submodules-skipped");

    expect(repo.files.map((file) => file.path)).not.toContain("packages/shared/helper.ts");
    expect(diagnostic?.paths).toEqual(["packages/shared"]);
  });
});
