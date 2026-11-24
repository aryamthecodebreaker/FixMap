import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parseArchitecturePolicy } from "../src/architecture.js";
import { diffRange } from "../src/contract-baseline.js";
import { buildFixMapReport, contractBaselineOrError } from "../src/plan.js";
import { scanRepo } from "../src/repo-scan.js";
import { verifyPlan } from "../src/verify.js";

const exec = promisify(execFile);
const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

const SPEC_BEFORE = "openapi: 3.0.3\npaths:\n  /users:\n    get: {}\n  /teams:\n    get: {}\n";
const SPEC_AFTER = "openapi: 3.0.3\npaths:\n  /teams:\n    get: {}\n";

function policy(allowBreaking?: unknown[]): string {
  return JSON.stringify({
    architecturePolicyVersion: 1,
    contracts: [{
      id: "public-api",
      paths: ["specs/**"],
      forbidBreaking: true,
      reason: "Clients pin the public API.",
      severity: "error",
      ...(allowBreaking ? { allowBreaking } : {})
    }]
  });
}

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

async function git(root: string, ...args: string[]): Promise<void> {
  await exec("git", ["-c", "user.name=FixMap Test", "-c", "user.email=fixmap@example.test", "-c", "commit.gpgsign=false", ...args], { cwd: root });
}

/** Two commits: the second removes GET /users from a spec a policy rule protects. */
async function repository(policyText: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-contract-baseline-"));
  roots.push(root);
  await git(root, "init", "--quiet");
  await write(root, {
    ".fixmap/policy.json": policyText,
    "specs/users-api.yml": SPEC_BEFORE,
    "src/users.ts": "export const listUsers = () => [];\n"
  });
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "-m", "base");
  await write(root, { "specs/users-api.yml": SPEC_AFTER, "src/users.ts": "export const listUsers = () => [1];\n" });
  await git(root, "commit", "--quiet", "-am", "drop users endpoint");
  return root;
}

describe("policy contract baseline", () => {
  it("maps diff specs to the two states Git compares", () => {
    expect(diffRange({ repoRoot: ".", diffSpec: "main...HEAD" })).toEqual({ from: "main", to: "HEAD", mergeBase: true });
    expect(diffRange({ repoRoot: ".", diffSpec: "a..b" })).toEqual({ from: "a", to: "b", mergeBase: false });
    expect(diffRange({ repoRoot: ".", diffSpec: "HEAD~1" })).toEqual({ from: "HEAD~1", mergeBase: false });
    expect(diffRange({ repoRoot: ".", baseRef: "main" })).toEqual({ from: "main", to: "HEAD", mergeBase: true });
    expect(diffRange({ repoRoot: ".", workingTree: true })).toEqual({ from: "HEAD", mergeBase: false });
    expect(diffRange({ repoRoot: "." })).toBeUndefined();
    expect(() => diffRange({ repoRoot: ".", diffSpec: "a\nb" })).toThrow(/single-line/);
  });

  it("fails Plan and Verify on a forbidden breaking change, with a machine-readable code", async () => {
    const root = await repository(policy());
    const report = await buildFixMapReport({ repoRoot: root, issueText: "list users", diffSpec: "HEAD~1...HEAD", useCache: false });
    expect(report.policy?.findings).toContainEqual(expect.objectContaining({ code: "breaking-contract", ruleId: "public-api", severity: "error", paths: ["specs/users-api.yml"] }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: "architecture-breaking-contract", severity: "error" }));

    const repo = await scanRepo({ repoRoot: root, diffSpec: "HEAD~1...HEAD", useCache: false, includeHistory: true });
    const baseline = await contractBaselineOrError(repo, { repoRoot: root, diffSpec: "HEAD~1...HEAD" });
    expect(baseline.error).toBeUndefined();
    const result = verifyPlan(report, repo, { ...(baseline.comparison ? { contractComparison: baseline.comparison } : {}) });
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "architecture-breaking-contract", severity: "error", paths: ["specs/users-api.yml"] }));
    expect(result.narrative?.some((statement) => statement.text.startsWith("Architecture rule public-api forbids this breaking contract change:"))).toBe(true);
  }, TIMEOUT);

  it("downgrades an allowlisted break to an info finding that still names the reason", async () => {
    const root = await repository(policy([{ path: "specs/users-api.yml", reason: "Deprecated in v3; removal announced." }]));
    const report = await buildFixMapReport({ repoRoot: root, issueText: "list users", diffSpec: "HEAD~1...HEAD", useCache: false });
    expect(report.policy?.findings.filter((finding) => finding.code === "breaking-contract")).toEqual([]);
    expect(report.policy?.findings).toContainEqual(expect.objectContaining({
      code: "breaking-contract-allowed",
      severity: "info",
      message: expect.stringContaining("Deprecated in v3; removal announced.")
    }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: "architecture-breaking-contract-allowed", severity: "info" }));
  }, TIMEOUT);

  it("reports an unresolvable baseline instead of silently passing", async () => {
    const root = await repository(policy());
    const repo = await scanRepo({ repoRoot: root, diffSpec: "HEAD~1...HEAD", useCache: false, includeHistory: true });
    const baseline = await contractBaselineOrError(repo, { repoRoot: root, diffSpec: "no-such-ref...HEAD" });
    expect(baseline.comparison).toBeUndefined();
    expect(baseline.error).toMatch(/no-such-ref/);
    const report = await buildFixMapReport({ repoRoot: root, issueText: "list users", useCache: false });
    const result = verifyPlan(report, repo, { contractBaselineError: baseline.error! });
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "contract-baseline-unavailable", severity: "warning" }));
  }, TIMEOUT);

  it("costs nothing without a forbidBreaking rule", async () => {
    const root = await repository(JSON.stringify({ architecturePolicyVersion: 1 }));
    const repo = await scanRepo({ repoRoot: root, useCache: false, includeHistory: true });
    expect(await contractBaselineOrError(repo, { repoRoot: root, diffSpec: "no-such-ref...HEAD" })).toEqual({});
  }, TIMEOUT);

  it("validates allowBreaking entries strictly", () => {
    const parse = (allowBreaking: unknown) => parseArchitecturePolicy({ path: ".fixmap/policy.json", fingerprint: "sha", content: policy(allowBreaking as unknown[]) });
    expect(parse([{ id: "openapi:GET /users:removed", reason: "ok" }]).contracts[0]!.allowBreaking).toEqual([{ id: "openapi:GET /users:removed", reason: "ok" }]);
    const bad: Array<[unknown, RegExp]> = [
      [[{ reason: "neither" }], /exactly one of id or path/],
      [[{ id: "x", path: "specs/**", reason: "both" }], /exactly one of id or path/],
      [[{ path: "../outside", reason: "traversal" }], /Invalid allowBreaking path/],
      [[{ path: "/abs", reason: "absolute" }], /Invalid allowBreaking path/],
      [[{ id: "x", reason: "" }], /bounded reason/],
      [[{ id: "x", reason: "r", extra: 1 }], /unknown field extra/],
      [[{ id: "line\nbreak", reason: "r" }], /one non-blank line/],
      [Array.from({ length: 101 }, () => ({ id: "x", reason: "r" })), /at most 100/]
    ];
    for (const [allowBreaking, message] of bad) expect(() => parse(allowBreaking)).toThrow(message);
  });
});
