import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildArchitectureSnapshotAtRef, compareArchitectureRefs, scanRepoAtRef } from "../src/architecture-history.js";

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; before: string; after: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-history-"));
  roots.push(root);
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
  await writeFile(join(root, "a.ts"), "export const a = true;\n", "utf8");
  await writeFile(join(root, "b.ts"), "export const b = true;\n", "utf8");
  await exec("git", ["add", "a.ts", "b.ts"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", "before"], { cwd: root });
  const before = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFile(join(root, "a.ts"), "import { b } from './b'; export const a = b;\n", "utf8");
  await exec("git", ["add", "a.ts"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", "after"], { cwd: root });
  const after = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  return { root, before, after };
}

describe("historical architecture", () => {
  it("reads exact blob identities at a ref without moving HEAD or changing the worktree", async () => {
    const { root, before, after } = await fixture();
    const headBefore = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    const statusBefore = (await exec("git", ["status", "--porcelain=v1"], { cwd: root })).stdout;

    const historical = await scanRepoAtRef({ repoRoot: root, ref: before });

    expect(historical.commit).toBe(before);
    expect(historical.repo.files.find((file) => file.path === "a.ts")?.contentFingerprint).toMatch(/^git:[a-f0-9]{40}$/);
    expect(historical.repo.files.find((file) => file.path === "a.ts")?.textSample).not.toContain("import");
    expect((await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim()).toBe(headBefore);
    expect((await exec("git", ["status", "--porcelain=v1"], { cwd: root })).stdout).toBe(statusBefore);
    expect(headBefore).toBe(after);
  }, 15_000);

  it("builds and compares deterministic snapshots at two committed refs", async () => {
    const { root, before, after } = await fixture();
    const first = await buildArchitectureSnapshotAtRef({ repoRoot: root, ref: before });
    const comparison = await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after, couplingDelta: 1 });

    expect(first.snapshot.fingerprint).toBe(comparison.from.snapshot.fingerprint);
    expect(comparison.from.commit).toBe(before);
    expect(comparison.to.commit).toBe(after);
    expect(comparison.drift.addedEdges).toContainEqual({ from: "a.ts", to: "b.ts" });
  }, 15_000);

  it("rejects control-character refs before invoking Git", async () => {
    const { root } = await fixture();
    await expect(scanRepoAtRef({ repoRoot: root, ref: "HEAD\n--help" })).rejects.toThrow("single-line");
  });
});
