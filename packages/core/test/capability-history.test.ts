import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compareCapabilityRefs, renderCapabilityHistoryMarkdown } from "../src/capability-history.js";

const exec = promisify(execFile);

async function initialize(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-capability-history-"));
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
  return root;
}

async function commit(root: string, message: string): Promise<string> {
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", message], { cwd: root });
  return (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
}

function store(maxDepth: number) {
  return JSON.stringify({
    capabilityStoreVersion: 1,
    workspace: "shop",
    repository: "store",
    capabilities: [{
      id: "checkout",
      name: "Checkout",
      anchors: [{ operation: "touch", path: "src/checkout.js" }],
      traversal: { direction: "both", maxDepth, maxNodes: 100 }
    }]
  });
}

describe("capability history", () => {
  it("diffs exact committed capability evidence without changing HEAD or the worktree", { timeout: 30_000 }, async () => {
    const root = await initialize();
    await mkdir(join(root, ".fixmap"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "test"), { recursive: true });
    await writeFile(join(root, ".fixmap", "capabilities.json"), store(1));
    await writeFile(join(root, "src", "checkout.js"), "export const checkout = true;\n");
    await writeFile(join(root, "src", "cart.js"), "import { checkout } from './checkout.js'; export { checkout };\n");
    await writeFile(join(root, "test", "checkout.test.js"), "import { checkout } from '../src/checkout.js';\n");
    const before = await commit(root, "before checkout expansion");

    await writeFile(join(root, ".fixmap", "capabilities.json"), store(2));
    await writeFile(join(root, "src", "checkout.js"), "export const checkout = 'v2';\n");
    await writeFile(join(root, "src", "retry.js"), "import { checkout } from './checkout.js'; export { checkout };\n");
    await writeFile(join(root, "test", "checkout.test.js"), "import { checkout } from '../src/checkout.js'; test('checkout', () => checkout);\n");
    const after = await commit(root, "after checkout expansion");
    await writeFile(join(root, "scratch.txt"), "leave me alone\n");
    const headBefore = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
    const statusBefore = (await exec("git", ["status", "--porcelain=v1"], { cwd: root })).stdout;

    const diff = await compareCapabilityRefs({
      repoRoot: root,
      id: "checkout",
      fromRef: before,
      toRef: after,
      asOf: "2026-08-26T00:00:00.000Z"
    });

    expect(diff.from.commit).toBe(before);
    expect(diff.to.commit).toBe(after);
    expect(diff.definitionChanged).toBe(true);
    expect(diff.selected.modified).toEqual(["src/checkout.js"]);
    expect(diff.affected.added).toContain("src/retry.js");
    expect(diff.testAssociations.modified).toEqual(["test/checkout.test.js"]);
    expect(diff.summary).toContain("evidenced changes");
    expect(renderCapabilityHistoryMarkdown(diff)).toContain("Both sides were read from immutable Git objects");
    expect((await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim()).toBe(headBefore);
    expect((await exec("git", ["status", "--porcelain=v1"], { cwd: root })).stdout).toBe(statusBefore);
  });

  it("represents a capability added between refs without inventing a previous map", { timeout: 30_000 }, async () => {
    const root = await initialize();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "checkout.js"), "export const checkout = true;\n");
    const before = await commit(root, "before capability");
    await mkdir(join(root, ".fixmap"), { recursive: true });
    await writeFile(join(root, ".fixmap", "capabilities.json"), store(1));
    const after = await commit(root, "declare capability");

    const diff = await compareCapabilityRefs({
      repoRoot: root,
      id: "checkout",
      fromRef: before,
      toRef: after,
      asOf: "2026-08-26T00:00:00.000Z"
    });

    expect(diff.from).toMatchObject({ state: "absent", testAssociations: [] });
    expect(diff.to.state).toBe("present");
    expect(diff.selected.added).toEqual(["src/checkout.js"]);
    expect(diff.definitionChanged).toBe(true);
  });
});
