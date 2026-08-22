import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

const exec = promisify(execFile);

async function fixture(): Promise<{ root: string; before: string; after: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-history-cli-"));
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

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, dependencies: {
    stdout: (text: string) => stdout.push(text),
    stderr: (text: string) => stderr.push(text)
  } };
}

describe("history command", () => {
  it("compares immutable refs without changing HEAD or the worktree", async () => {
    const { root, before, after } = await fixture();
    const headBefore = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    const statusBefore = (await exec("git", ["status", "--porcelain=v1"], { cwd: root })).stdout;
    const json = capture();

    expect(await runCli(["history", "--repo", root, "--from", before, "--to", after, "--coupling-delta", "1", "--format", "json"], json.dependencies)).toBe(0);
    const result = JSON.parse(json.stdout.join(""));
    expect(result.from.commit).toBe(before);
    expect(result.to.commit).toBe(after);
    expect(result.drift.addedEdges).toContainEqual({ from: "a.ts", to: "b.ts" });
    expect((await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim()).toBe(headBefore);
    expect((await exec("git", ["status", "--porcelain=v1"], { cwd: root })).stdout).toBe(statusBefore);
  }, 20_000);

  it("renders readable Markdown and clean ref errors without raw child commands", async () => {
    const { root, before, after } = await fixture();
    const markdown = capture();
    const invalid = capture();

    expect(await runCli(["history", `--repo=${root}`, `--from=${before}`, `--to=${after}`], markdown.dependencies)).toBe(0);
    expect(markdown.stdout.join("")).toContain("# FixMap architecture history");
    expect(markdown.stdout.join("")).toContain("Read-only historical comparison");

    expect(await runCli(["history", "--repo", root, "--from", "missing-ref", "--to", after], invalid.dependencies)).toBe(1);
    expect(invalid.stderr.join("")).toContain("Confirm both refs exist");
    expect(invalid.stderr.join("")).not.toContain("Command failed");
    expect(invalid.stderr.join("")).not.toContain("rev-parse");
  }, 20_000);

  it("validates bounds before invoking Git", async () => {
    const io = capture();
    expect(await runCli(["history", "--from", "HEAD", "--to", "HEAD", "--coupling-delta", "0"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("integer from 1 to 10000");
  });
});
