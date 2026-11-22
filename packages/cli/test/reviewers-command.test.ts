import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { runReviewersCommand } from "../src/reviewers-command.js";

const MENTION = /(^|[^A-Za-z0-9_.+-])@[A-Za-z0-9]/m;

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd: root, encoding: "utf8" });
}

async function commitAs(root: string, author: string, email: string, path: string, contents: string): Promise<void> {
  await writeFile(join(root, path), contents);
  git(root, ["add", "-A"]);
  git(root, ["-c", `user.name=${author}`, "-c", `user.email=${email}`, "commit", "-q", "-m", `edit ${path}`]);
}

async function fixture(options: { codeowners?: string; mailmap?: string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-reviewers-"));
  git(root, ["init", "-q", "-b", "main"]);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, ".github"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "store" }));
  if (options.codeowners !== undefined) await writeFile(join(root, ".github", "CODEOWNERS"), options.codeowners);
  if (options.mailmap !== undefined) await writeFile(join(root, ".mailmap"), options.mailmap);
  await commitAs(root, "alice-laptop", "alice@old.example", "src/auth.js", "export const auth = 1;\n");
  await commitAs(root, "Alice Example", "alice@example.com", "src/auth.js", "export const auth = 2;\n");
  await commitAs(root, "Bob Example", "bob@example.com", "src/auth.js", "export const auth = 3;\n");
  await writeFile(join(root, "src", "auth.js"), "export const auth = 4;\n");
  return root;
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout, stderr,
    io: { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value), now: () => "2026-11-22T00:00:00.000Z" }
  };
}

type Json = {
  changedPaths: string[];
  suggestions: Array<{ reviewer: string; confidence: string; evidence: Array<{ kind: string; detail: string; changedPath?: string; line?: number }> }>;
  diagnostics: Array<{ message: string; severity: string }>;
};

async function runJson(root: string, extra: string[] = []): Promise<Json> {
  const output = capture();
  expect(await runReviewersCommand(["--working-tree", "--repo", root, "--format", "json", "--no-cache", ...extra], output.io)).toBe(0);
  expect(output.stderr).toEqual([]);
  return JSON.parse(output.stdout.join("")) as Json;
}

describe("fixmap reviewers", () => {
  it("routes CODEOWNERS by last matching rule and prints no @ mentions", async () => {
    const root = await fixture({ codeowners: "* @global\n/src/** @org/src-team\n/src/auth.js @security dev@example.com\n" });
    const result = await runJson(root);
    expect(result.changedPaths).toEqual(["src/auth.js"]);
    const high = result.suggestions.filter((entry) => entry.confidence === "high").map((entry) => entry.reviewer);
    expect(high.sort()).toEqual(["dev@example.com", "security"]);
    expect(result.suggestions.find((entry) => entry.reviewer === "security")?.evidence[0]).toMatchObject({
      kind: "codeowners", line: 3, changedPath: "src/auth.js"
    });

    const markdown = capture();
    expect(await runReviewersCommand(["--working-tree", "--repo", root, "--no-cache"], markdown.io)).toBe(0);
    const text = markdown.stdout.join("");
    expect(text).toContain("## `src/auth.js`");
    expect(text).toContain("- `security` (high)");
    expect(text).toContain("`.github/CODEOWNERS:3`");
    expect(text).toContain("does not request reviews");
    expect(text).not.toMatch(MENTION);
    expect(JSON.stringify(result)).not.toMatch(/"@|[ (]@[A-Za-z0-9]/);
  });

  it("works without a CODEOWNERS file, from commit history alone", async () => {
    const root = await fixture();
    const result = await runJson(root);
    expect(result.suggestions.every((entry) => entry.confidence === "low")).toBe(true);
    expect(result.suggestions.map((entry) => entry.reviewer).sort()).toEqual(["Alice Example", "Bob Example", "alice-laptop"]);
    expect(result.suggestions[0]?.evidence[0]?.detail).toContain("availability or employment is not inferred");
  });

  it("canonicalizes commit authors through .mailmap before counting", async () => {
    const root = await fixture({ mailmap: "Alice Example <alice@example.com> alice-laptop <alice@old.example>\n" });
    const result = await runJson(root);
    expect(result.suggestions.map((entry) => entry.reviewer)).toEqual(["Alice Example", "Bob Example"]);
    expect(result.suggestions[0]?.evidence[0]?.detail).toContain("authored 2 bounded non-merge commits");
  });

  it("drops commit authors with --no-history-authors", async () => {
    const root = await fixture({ codeowners: "/src/** @src-team\n" });
    const result = await runJson(root, ["--no-history-authors"]);
    expect(result.suggestions.map((entry) => entry.reviewer)).toEqual(["src-team"]);
    expect(result.suggestions.flatMap((entry) => entry.evidence).some((entry) => entry.kind === "git-history")).toBe(false);
    expect(result.diagnostics.map((entry) => entry.message).join(" ")).toContain("Commit-author suggestions were turned off");
  });

  it("warns that a shallow clone only sees part of the history", async () => {
    const source = await fixture();
    const parent = await mkdtemp(join(tmpdir(), "fixmap-reviewers-shallow-"));
    git(parent, ["clone", "-q", "--depth", "1", pathToFileURL(source).href, "clone"]);
    const root = join(parent, "clone");
    await writeFile(join(root, "src", "auth.js"), "export const auth = 5;\n");
    const result = await runJson(root);
    expect(result.suggestions.map((entry) => entry.reviewer)).toEqual(["Bob Example"]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "warning", message: expect.stringContaining("shallow") }));
  });

  it("routes the changed or ranked files of a saved report and rejects unsafe report paths", async () => {
    const root = await fixture({ codeowners: "/src/** @src-team\n" });
    const plan = join(root, "plan.json");
    await writeFile(plan, JSON.stringify({ summary: "", contextFiles: [{ path: "src/auth.js", score: 1, reasons: [] }], testRoutes: [], risks: [], changedFiles: [], diagnostics: [] }));
    const output = capture();
    expect(await runReviewersCommand(["--report", plan, "--repo", root, "--format", "json", "--no-cache", "--no-history-authors"], output.io)).toBe(0);
    expect((JSON.parse(output.stdout.join("")) as Json).suggestions.map((entry) => entry.reviewer)).toEqual(["src-team"]);

    await writeFile(plan, JSON.stringify({ summary: "", contextFiles: [], testRoutes: [], risks: [], changedFiles: ["../outside.js"], diagnostics: [] }));
    const traversal = capture();
    expect(await runReviewersCommand(["--report", plan, "--repo", root, "--no-cache"], traversal.io)).toBe(1);
    expect(traversal.stderr.join("")).toContain("safe repository-relative path");

    await writeFile(plan, "# FixMap report\n");
    const markdown = capture();
    expect(await runReviewersCommand(["--report", plan, "--repo", root], markdown.io)).toBe(1);
    expect(markdown.stderr.join("")).toContain("Markdown report");
  });

  it("validates its arguments", async () => {
    for (const args of [[], ["--working-tree", "--diff", "HEAD"], ["--diff"], ["--working-tree", "--format", "yaml"], ["--working-tree", "--bogus"], ["--working-tree", "--repo", "https://github.com/a/b"]]) {
      const output = capture();
      expect(await runReviewersCommand(args, output.io)).toBe(1);
      expect(output.stderr.join("")).toContain("Usage: fixmap reviewers");
    }
    const help = capture();
    expect(await runReviewersCommand(["--help"], help.io)).toBe(0);
    expect(help.stdout.join("")).toContain("--no-history-authors");
  });

  it("fails clearly when a diff spec cannot be resolved", async () => {
    const root = await fixture();
    const output = capture();
    expect(await runReviewersCommand(["--diff", "no-such-ref...HEAD", "--repo", root, "--no-cache"], output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("no-such-ref");
  });
});
