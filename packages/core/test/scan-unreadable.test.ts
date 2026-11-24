import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepo } from "../src/repo-scan.js";

// Permission bits do not restrict Windows or root, so the check runs where it can mean something.
const enforced = process.platform !== "win32" && process.getuid?.() !== 0;
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await chmod(root, 0o755).catch(() => undefined);
    await chmod(join(root, "private"), 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enforced)("unreadable directories", () => {
  it("reports an unreadable repository root as an error instead of an empty scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-unreadable-"));
    roots.push(root);
    await writeFile(join(root, "a.ts"), "export const a = 1;\n");
    await chmod(root, 0o000);
    const repo = await scanRepo({ repoRoot: root, useCache: false, includeHistory: false });
    expect(repo.files).toEqual([]);
    expect(repo.diagnostics).toContainEqual(expect.objectContaining({ code: "directory-unreadable", severity: "error" }));
  });

  it("warns about an unreadable subfolder and keeps scanning the rest", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-unreadable-"));
    roots.push(root);
    await mkdir(join(root, "private"));
    await writeFile(join(root, "private", "secret.ts"), "export const s = 1;\n");
    await writeFile(join(root, "a.ts"), "export const a = 1;\n");
    await chmod(join(root, "private"), 0o000);
    const repo = await scanRepo({ repoRoot: root, useCache: false, includeHistory: false });
    expect(repo.files.map((file) => file.path)).toEqual(["a.ts"]);
    expect(repo.diagnostics).toContainEqual(expect.objectContaining({ code: "directory-unreadable", severity: "warning", paths: ["private"] }));
  });
});
