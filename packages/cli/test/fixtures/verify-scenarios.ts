import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { buildFixMapReport } from "@aryam/fixmap-core";

const exec = promisify(execFile);

/**
 * Five representative diffs against one saved plan, shared by the CLI/MCP snapshot test and the
 * Action parity test so every surface narrates the same repository states.
 */
export const VERIFY_SCENARIOS = {
  clean: { "src/users/list.ts": "export function listUsers(ids: number[]) { return [...new Set(ids)]; }\n", "src/users/list.test.ts": "import { listUsers } from './list';\ntest('dedupes', () => listUsers([1, 1]));\n" },
  "surprise-file": { "src/users/list.ts": "export function listUsers(ids: number[]) { return [...new Set(ids)]; }\n", "src/users/list.test.ts": "import { listUsers } from './list';\ntest('dedupes', () => listUsers([1, 1]));\n", "src/db/query.ts": "export const query = 2;\n" },
  "new-risk": { "src/users/list.ts": "export function listUsers(ids: number[]) { return [...new Set(ids)]; }\n", "src/users/list.test.ts": "import { listUsers } from './list';\ntest('dedupes', () => listUsers([1, 1]));\n", "src/payments/charge.ts": "export const charge = (cents: number) => Math.max(cents, 0);\n" },
  "policy-violation": { "src/users/list.ts": "export function listUsers(ids: number[]) { return [...new Set(ids)]; }\n", "src/users/list.test.ts": "import { listUsers } from './list';\ntest('dedupes', () => listUsers([1, 1]));\n", "src/ui/view.ts": "import { query } from '../db/query';\nexport const view = query;\n" },
  "missed-test": { "src/users/list.ts": "export function listUsers(ids: number[]) { return [...new Set(ids)]; }\n" }
} as const;

export type VerifyScenario = keyof typeof VERIFY_SCENARIOS;

const BASE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "verify-fixture", private: true, scripts: { test: "vitest run" } }, null, 2),
  ".fixmap/policy.json": JSON.stringify({
    architecturePolicyVersion: 1,
    boundaries: [{ id: "ui-no-db", from: ["src/ui/**"], deny: ["src/db/**"], reason: "The UI reads data through the API.", severity: "error" }]
  }, null, 2),
  "src/users/list.ts": "export function listUsers(ids: number[]) { return ids; }\n",
  "src/users/list.test.ts": "import { listUsers } from './list';\ntest('lists', () => listUsers([1]));\n",
  "src/ui/view.ts": "export const view = 1;\n",
  "src/db/query.ts": "export const query = 1;\n",
  "src/payments/charge.ts": "export const charge = (cents: number) => cents;\n",
  "README.md": "# Fixture\n"
};

export type VerifyScenarioFixture = {
  /** Repository root; scenario branches share it, so check one out before verifying it. */
  root: string;
  /** Saved plan, outside the repository so it is never scanned as a change. */
  planPath: string;
  checkout(scenario: VerifyScenario): Promise<void>;
  /** Replaces the temporary root so outputs compare across runs and operating systems. */
  normalize(text: string): string;
  cleanup(): Promise<void>;
};

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-c", "user.name=FixMap Test", "-c", "user.email=fixmap@example.test", "-c", "commit.gpgsign=false", ...args], { cwd: root });
  return stdout.trim();
}

async function write(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

export async function createVerifyScenarios(): Promise<VerifyScenarioFixture> {
  const workspace = await mkdtemp(join(tmpdir(), "fixmap-verify-scenarios-"));
  const root = join(workspace, "repo");
  await mkdir(root);
  await git(root, "init", "--quiet", "-b", "main");
  await write(root, BASE_FILES);
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "-m", "base");
  for (const [scenario, files] of Object.entries(VERIFY_SCENARIOS)) {
    await git(root, "checkout", "--quiet", "-b", scenario, "main");
    await write(root, files);
    await git(root, "add", "-A");
    await git(root, "commit", "--quiet", "-m", scenario);
  }
  await git(root, "checkout", "--quiet", "main");
  const report = await buildFixMapReport({ repoRoot: root, issueText: "listUsers returns duplicate users", useCache: false });
  const planPath = join(workspace, "plan.json");
  await writeFile(planPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    root,
    planPath,
    checkout: async (scenario) => { await git(root, "checkout", "--quiet", scenario); },
    normalize: (text) => text.split(root).join("<repo>").split(root.replace(/\\/g, "/")).join("<repo>").replace(/\r\n/g, "\n"),
    cleanup: () => rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  };
}
