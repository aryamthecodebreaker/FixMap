import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepoAtRef } from "../src/architecture-history.js";
import { buildFixMapReport } from "../src/plan.js";
import { scanRepo } from "../src/repo-scan.js";

const exec = promisify(execFile);
const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

async function git(root: string, ...args: string[]): Promise<string> {
  return (await exec("git", ["-c", "user.name=FixMap", "-c", "user.email=fixmap@example.test", "-c", "commit.gpgsign=false", ...args], { cwd: root })).stdout.trim();
}

async function repository(): Promise<{ root: string; head: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-historical-parity-"));
  roots.push(root);
  // A file just over the 64 kB sample limit with a distinctive word near its end, a Vue
  // component, a binary-looking source file, a test, and two commits of co-change history.
  const big = `export const start = 1;\n${"// filler line for the size limit\n".repeat(2_200)}export function reconcileLedgerTotals() { return 0; }\n`;
  const files: Record<string, string> = {
    "src/ledger.ts": big,
    "src/App.vue": "<template><div>{{ total }}</div></template>\n<script setup lang=\"ts\">\nconst total = 1;\n</script>\n",
    "src/blob.ts": "abc\u0000def\n",
    "src/ledger.test.ts": "import { reconcileLedgerTotals } from './ledger';\ntest('x', () => reconcileLedgerTotals());\n",
    "README.md": "# Ledger\n",
    "package.json": JSON.stringify({ name: "parity", scripts: { test: "vitest" } })
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await git(root, "init", "--quiet");
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "-m", "base");
  await writeFile(join(root, "src/App.vue"), files["src/App.vue"]!.replace("1", "2"));
  await writeFile(join(root, "src/ledger.test.ts"), files["src/ledger.test.ts"]!.replace("'x'", "'y'"));
  await git(root, "commit", "--quiet", "-am", "co-change");
  return { root, head: await git(root, "rev-parse", "HEAD") };
}

describe("historical scans read files like a checkout", () => {
  it("describes every file identically, including large, Vue, and binary-looking files, with the same history", async () => {
    const { root, head } = await repository();
    const checkout = await scanRepo({ repoRoot: root, useCache: false, includeHistory: true });
    const historical = (await scanRepoAtRef({ repoRoot: root, ref: head })).repo;
    const fields = (file: (typeof checkout.files)[number]) => ({
      path: file.path, kind: file.kind, isSource: file.isSource, isTest: file.isTest, sizeBytes: file.sizeBytes,
      textSample: file.textSample, searchTextSample: file.searchTextSample, complete: file.textSampleComplete, skip: file.textSampleSkipReason
    });
    const sort = (files: typeof checkout.files) => [...files].sort((a, b) => a.path.localeCompare(b.path)).map(fields);
    expect(sort(historical.files)).toEqual(sort(checkout.files));

    const ledger = historical.files.find((file) => file.path === "src/ledger.ts")!;
    expect(ledger.textSampleComplete).toBe(false);
    expect(ledger.searchTextSample).toContain("reconcileLedgerTotals");
    expect(historical.files.find((file) => file.path === "src/App.vue")!.textSample).not.toContain("<template>");
    expect(historical.files.find((file) => file.path === "src/blob.ts")!.textSampleSkipReason).toBe("not-text");

    expect(historical.history?.commits.map((commit) => commit.hash)).toEqual(checkout.history?.commits.map((commit) => commit.hash));
  }, TIMEOUT);

  it("ranks the same top five through plan --at as on a checkout of that commit", async () => {
    const { root, head } = await repository();
    const task = "Ledger totals do not reconcile\n\nreconcileLedgerTotals returns 0 for every ledger.";
    const checkout = await buildFixMapReport({ repoRoot: root, issueText: task, useCache: false });
    const historical = await buildFixMapReport({ repoRoot: root, issueText: task, useCache: false, atRef: head });
    expect(historical.contextFiles.slice(0, 5).map((file) => file.path)).toEqual(checkout.contextFiles.slice(0, 5).map((file) => file.path));
  }, TIMEOUT);

  it("reads history only up to the requested commit", async () => {
    const { root } = await repository();
    const first = await git(root, "rev-list", "--max-parents=0", "HEAD");
    const historical = (await scanRepoAtRef({ repoRoot: root, ref: first })).repo;
    expect(historical.history?.commits.map((commit) => commit.hash)).toEqual([first]);
  }, TIMEOUT);
});
