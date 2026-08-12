import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { benchmarkRepository, renderRepositoryBenchmark } from "../src/benchmark.js";

const exec = promisify(execFile);

describe("repository benchmark", () => {
  it("uses parent snapshots and history cut off before the target change", { timeout: 30_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-repository-benchmark-"));
    try {
      await exec("git", ["init", "-b", "main"], { cwd: root });
      await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
      await exec("git", ["config", "user.email", "fixmap@example.invalid"], { cwd: root });
      await mkdir(join(root, "src", "auth"), { recursive: true });
      await mkdir(join(root, "test", "auth"), { recursive: true });
      await writeFile(join(root, ".gitattributes"), "*.ts filter=fixmap-danger\n");
      await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
      await writeFile(join(root, "src", "auth", "reset.ts"), "export const resetPassword = () => 'first';\n");
      await writeFile(join(root, "src", "session.ts"), "export const sessionExpiry = 10;\n");
      await writeFile(join(root, "test", "auth", "reset.test.ts"), "import '../../src/auth/reset';\n");
      await commit(root, "initial authentication implementation");

      await writeFile(join(root, "src", "auth", "reset.ts"), "import { sessionExpiry } from '../session'; export const resetPassword = () => sessionExpiry;\n");
      await writeFile(join(root, "src", "session.ts"), "export const sessionExpiry = 20;\n");
      await writeFile(join(root, "test", "auth", "reset.test.ts"), "import '../../src/auth/reset'; test('expiry', () => true);\n");
      await commit(root, "fix password reset session expiration");

      await writeFile(join(root, "src", "auth", "reset.ts"), "import { sessionExpiry } from '../session'; export const resetPassword = () => sessionExpiry + 1;\n");
      await writeFile(join(root, "src", "session.ts"), "export const sessionExpiry = 30;\n");
      await writeFile(join(root, "test", "auth", "reset.test.ts"), "import '../../src/auth/reset'; test('expiration', () => true);\n");
      await commit(root, "correct password reset expiration behavior");

      // A local checkout would execute this configured filter unless the benchmark
      // neutralizes repository-defined drivers before creating its parent worktree.
      await exec("git", ["config", "filter.fixmap-danger.smudge", "this-command-must-not-exist-fixmap"], { cwd: root });
      await exec("git", ["config", "filter.fixmap-danger.required", "true"], { cwd: root });

      const result = await benchmarkRepository({ repoRoot: root, last: 1 });

      expect(result.eligibleCases).toBe(1);
      expect(result.safeguards).toMatchObject({ parentSnapshots: true, historyCutoff: "target-parent", primaryTargets: "changed-non-test-code", checkoutFiltersDisabled: true, repositoryCodeExecuted: false });
      expect(result.cases[0]?.mentionsExpectedPath).toBe(false);
      expect(result.cases[0]?.expected).toEqual(expect.arrayContaining(["src/auth/reset.ts", "src/session.ts"]));
      expect(result.cases[0]?.arms.impact.top5Paths).toContain("src/session.ts");
      expect(result.cases[0]?.arms.impact.top5Paths).not.toContain("package-lock.json");
      expect(renderRepositoryBenchmark(result)).toContain("Every case used the target commit's parent snapshot");

      const worktrees = (await exec("git", ["worktree", "list", "--porcelain"], { cwd: root })).stdout;
      expect(worktrees.match(/^worktree /gm)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function commit(root: string, message: string): Promise<void> {
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["commit", "-m", message], { cwd: root });
}
