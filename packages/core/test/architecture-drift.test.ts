import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareArchitectureRefs } from "../src/architecture-history.js";
import { parseDecisionRecord } from "../src/decisions.js";
import { buildFixMapReport } from "../src/plan.js";

const exec = promisify(execFile);
const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const ODD = "odd dir/ünï cöde/a/b/c/d/e";
const roots: string[] = [];
let previousCacheDir: string | undefined;
let cacheDir: string;

beforeEach(async () => {
  previousCacheDir = process.env.FIXMAP_CACHE_DIR;
  cacheDir = await mkdtemp(join(tmpdir(), "fixmap-arch-cache-"));
  roots.push(cacheDir);
  process.env.FIXMAP_CACHE_DIR = cacheDir;
});

afterEach(async () => {
  if (previousCacheDir === undefined) delete process.env.FIXMAP_CACHE_DIR;
  else process.env.FIXMAP_CACHE_DIR = previousCacheDir;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content, "utf8");
}

async function commit(root: string, message: string): Promise<string> {
  await exec("git", ["add", "-A"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", message], { cwd: root });
  return (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
}

function adr(status: string, rule: string, title: string): string {
  return `---\nstatus: ${status}\nfixmap-deny-imports:\n  - "${rule}"\n---\n# ${title}\n\n## Decision\n\nKeep the layers apart.\n`;
}

/** Two commits: the second adds a policy violation, a cycle, an ADR disagreement, and odd-path edges. */
async function driftFixture(): Promise<{ root: string; before: string; after: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-drift-"));
  roots.push(root);
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
  await exec("git", ["config", "core.autocrlf", "false"], { cwd: root });
  await put(root, "src/ui/view.ts", "export const view = 1;\n");
  await put(root, "src/db/store.ts", "export const store = 1;\n");
  await put(root, "src/core/a.ts", "import { b } from './b';\nexport const a = b;\n");
  await put(root, "src/core/b.ts", "export const b = 1;\n");
  await put(root, `${ODD}/sibling.ts`, "export const sibling = 1;\n");
  await put(root, `${ODD}/leaf.ts`, "import { sibling } from './sibling';\nexport const leaf = sibling;\n");
  await put(root, ".fixmap/policy.json", JSON.stringify({
    architecturePolicyVersion: 1,
    boundaries: [{ id: "ui-no-db", from: ["src/ui/**"], deny: ["src/db/**"], reason: "UI goes through core.", severity: "error" }]
  }));
  await put(root, "docs/adr/0001-core-independent.md", adr("Accepted", "src/core/** -> src/ui/**", "Core does not depend on UI"));
  await put(root, "docs/adr/0002-proposed.md", adr("Proposed", "src/core/** -> src/core/**", "Proposed core isolation"));
  const before = await commit(root, "before");

  await put(root, "src/ui/view.ts", "import { store } from '../db/store';\nexport const view = store;\n");
  await put(root, "src/core/b.ts", "import { a } from './a';\nexport const b = 1;\nexport const again = a;\n");
  await put(root, "src/core/a.ts", "import { b } from './b';\nimport { view } from '../ui/view';\nexport const a = b + view;\n");
  await put(root, `${ODD}/leaf.ts`, "export const leaf = 1;\n");
  await put(root, `${ODD}/new file.ts`, "import { sibling } from './sibling';\nexport const fresh = sibling;\n");
  const after = await commit(root, "after");
  return { root, before, after };
}

async function gitState(root: string): Promise<{ head: string; status: string }> {
  return {
    head: (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(),
    status: (await exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root })).stdout
  };
}

async function cacheFiles(): Promise<string[]> {
  return (await readdir(cacheDir)).filter((name) => name.startsWith("architecture-")).sort();
}

describe("architecture drift over Git refs", () => {
  it("reports edges, cycles, policy violations, coupling, and ADR disagreements with exact commits", async () => {
    const { root, before, after } = await driftFixture();
    const state = await gitState(root);

    const result = await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: "HEAD", couplingDelta: 1 });

    expect(result.from.commit).toBe(before);
    expect(result.to.commit).toBe(after);
    expect(result.to.requestedRef).toBe("HEAD");
    expect(result.drift.addedEdges).toEqual(expect.arrayContaining([
      { from: "src/ui/view.ts", to: "src/db/store.ts" },
      { from: "src/core/b.ts", to: "src/core/a.ts" },
      { from: "src/core/a.ts", to: "src/ui/view.ts" },
      { from: `${ODD}/new file.ts`, to: `${ODD}/sibling.ts` }
    ]));
    expect(result.drift.removedEdges).toEqual([{ from: `${ODD}/leaf.ts`, to: `${ODD}/sibling.ts` }]);
    expect(result.drift.newCycles).toEqual([["src/core/a.ts", "src/core/b.ts"]]);
    expect(result.drift.newBoundaryViolations).toEqual([{ ruleId: "ui-no-db", from: "src/ui/view.ts", to: "src/db/store.ts" }]);
    expect(result.drift.couplingGrowth.map((entry) => entry.path)).toEqual(expect.arrayContaining(["src/core/a.ts", "src/ui/view.ts"]));
    expect(result.decisionDisagreements).toEqual([{
      decisionId: expect.stringMatching(/^decision:[a-f0-9]{16}$/),
      decisionPath: "docs/adr/0001-core-independent.md",
      decisionTitle: "Core does not depend on UI",
      rule: { from: "src/core/**", deny: "src/ui/**" },
      edge: { from: "src/core/a.ts", to: "src/ui/view.ts" },
      introduced: true
    }]);
    // The proposed record's rule is violated by a.ts <-> b.ts, but it states no accepted intent.
    expect(result.to.decisionRules.map((rule) => rule.decisionPath)).toEqual(["docs/adr/0001-core-independent.md"]);
    expect(await gitState(root)).toEqual(state);
  }, TIMEOUT);

  it("reuses per-commit cache entries and rebuilds corrupt ones", async () => {
    const { root, before, after } = await driftFixture();
    const state = await gitState(root);
    const first = await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after });
    const files = await cacheFiles();
    expect(files).toEqual([`architecture-v1-${after}-policy.json`, `architecture-v1-${before}-policy.json`].sort());

    // A well-formed entry with a marker fingerprint proves the second run read the cache.
    const afterPath = join(cacheDir, `architecture-v1-${after}-policy.json`);
    const record = JSON.parse(await readFile(afterPath, "utf8"));
    record.entry.snapshot.fingerprint = "architecture:cachedmarker";
    const { createHash } = await import("node:crypto");
    record.checksum = createHash("sha256").update(JSON.stringify(record.entry)).digest("hex");
    await writeFile(afterPath, JSON.stringify(record), "utf8");
    const hit = await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after });
    expect(hit.to.snapshot.fingerprint).toBe("architecture:cachedmarker");
    expect(hit.decisionDisagreements).toEqual(first.decisionDisagreements);

    // Edited content without a matching checksum, and plain garbage, are both ignored and rebuilt.
    record.entry.snapshot.edges = [];
    await writeFile(afterPath, JSON.stringify(record), "utf8");
    expect((await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after })).to.snapshot).toEqual(first.to.snapshot);
    await writeFile(afterPath, "{not json", "utf8");
    const rebuilt = await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after });
    expect(rebuilt.to.snapshot).toEqual(first.to.snapshot);
    expect(JSON.parse(await readFile(afterPath, "utf8")).entry.snapshot.fingerprint).toBe(first.to.snapshot.fingerprint);
    expect(await gitState(root)).toEqual(state);
  }, TIMEOUT);

  it("skips the cache when disabled or when the cache directory is inside the repository", async () => {
    const { root, before, after } = await driftFixture();
    await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after, useCache: false });
    expect(await cacheFiles()).toEqual([]);

    process.env.FIXMAP_CACHE_DIR = join(root, ".cache");
    await compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: after });
    await expect(readdir(join(root, ".cache"))).rejects.toThrow();
    expect((await gitState(root)).status).toBe("");
  }, TIMEOUT);

  it("fails clearly on unknown refs without touching the worktree", async () => {
    const { root, before } = await driftFixture();
    const state = await gitState(root);
    await expect(compareArchitectureRefs({ repoRoot: root, fromRef: before, toRef: "no-such-ref" })).rejects.toThrow("Could not resolve Git ref");
    expect(await gitState(root)).toEqual(state);
  }, TIMEOUT);
});

describe("historical plans", () => {
  it("ranks against a committed ref without reading the worktree or moving HEAD", async () => {
    const { root, before } = await driftFixture();
    await put(root, "src/core/untracked.ts", "export const untracked = 'view store';\n");
    const state = await gitState(root);

    const report = await buildFixMapReport({ repoRoot: root, issueText: "new file sibling fresh", atRef: before, limit: 20 });

    const paths = report.contextFiles.map((file) => file.path);
    expect(paths).not.toContain(`${ODD}/new file.ts`);
    expect(paths).not.toContain("src/core/untracked.ts");
    expect(paths).toContain(`${ODD}/sibling.ts`);
    expect(report.diagnostics.find((entry) => entry.code === "historical-plan")?.message).toContain(before);
    expect(await gitState(root)).toEqual(state);
  }, TIMEOUT);

  it("rejects diff or working-tree options and unknown refs", async () => {
    const { root } = await driftFixture();
    await expect(buildFixMapReport({ repoRoot: root, issueText: "x", atRef: "HEAD", workingTree: true })).rejects.toThrow("cannot be combined");
    await expect(buildFixMapReport({ repoRoot: root, issueText: "x", atRef: "missing-ref" })).rejects.toThrow("Could not resolve Git ref");
  }, TIMEOUT);
});

describe("decision dependency rules", () => {
  it("parses explicit fixmap-deny-imports rules and rejects malformed ones", () => {
    const parsed = parseDecisionRecord({
      path: "docs/adr/0001.md",
      fingerprint: "git:0000000000000000000000000000000000000000",
      content: adr("Accepted", "src\\core/** -> src/ui/**", "Rule")
    });
    expect(parsed.record?.dependencyRules).toEqual([{ from: "src/core/**", deny: "src/ui/**" }]);
    for (const bad of ["src/core/**", "../outside/** -> src/**", "src/** -> /abs/**", "!src/** -> src/ui/**"]) {
      expect(() => parseDecisionRecord({
        path: "docs/adr/0002.md",
        fingerprint: "git:0000000000000000000000000000000000000000",
        content: adr("Accepted", bad, "Bad")
      })).toThrow();
    }
    const prose = parseDecisionRecord({
      path: "docs/adr/0003.md",
      fingerprint: "git:0000000000000000000000000000000000000000",
      content: "# Prose\n\n## Decision\n\nsrc/core must never import src/ui -> src/core.\n"
    });
    expect(prose.record?.dependencyRules).toBeUndefined();
  });
});
