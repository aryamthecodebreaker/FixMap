import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixMapReport } from "@aryam/fixmap-core";
import { runAction, type ActionDependencies } from "../src/runner.js";
import { SECTION_PATH_LIMIT, splitPathListInput } from "../src/scope-sections.js";

const report: FixMapReport = {
  summary: "Mapped the change.",
  contextFiles: [],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));
});

async function repoWith(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-action-scope-"));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  await writeFiles(root, files);
  commit(root, "base");
  return root;
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=FixMap Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd: root,
    encoding: "utf8"
  }).trim();
}

function commit(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

const importGraph = {
  "src/a.ts": 'import { b } from "./b";\nexport const a = b + 1;\n',
  "src/b.ts": "export const b = 1;\n",
  "src/c.ts": 'import { a } from "./a";\nexport const c = a + 1;\n'
};

function store(capabilities: unknown[]): string {
  return `${JSON.stringify({ capabilityStoreVersion: 1, workspace: "local", repository: "demo", capabilities }, null, 2)}\n`;
}

type Run = { stdout: string; summary: string; outputs: string; comment: string | undefined };

async function run(root: string, env: NodeJS.ProcessEnv, overrides: ActionDependencies = {}): Promise<Run> {
  let stdout = "";
  const writes = new Map<string, string>();
  let comment: string | undefined;
  await runAction({
    INPUT_ISSUE: "change the module",
    INPUT_NO_CACHE: "true",
    GITHUB_STEP_SUMMARY: "summary.md",
    GITHUB_OUTPUT: "output.txt",
    ...env
  }, {
    appendFile: (path, contents) => writes.set(path, (writes.get(path) ?? "") + contents),
    buildReport: vi.fn(async () => structuredClone(report)),
    createClient: () => ({
      upsertPullRequestComment: async (input: { markdown: string }) => { comment = input.markdown; }
    }) as never,
    cwd: () => root,
    fileSize: () => 0,
    now: () => "2026-11-22T00:00:00.000Z",
    readFile: (path) => {
      if (path !== "event.json") throw new Error(`unexpected read of ${path}`);
      return JSON.stringify({ pull_request: { number: 9, title: "Change" } });
    },
    stdout: (text) => { stdout += text; },
    uuid: () => "stable",
    ...overrides
  });
  return { stdout, summary: writes.get("summary.md") ?? "", outputs: writes.get("output.txt") ?? "", comment };
}

describe("Action change scope (preview)", () => {
  it("splits newline- and comma-separated path inputs", () => {
    expect(splitPathListInput(" src/a.ts,\nsrc/b.ts\r\n\n, src/c ")).toEqual(["src/a.ts", "src/b.ts", "src/c"]);
    expect(splitPathListInput(undefined)).toEqual([]);
  });

  it("leaves the report, outputs, and scans unchanged when no scope input is set", async () => {
    const scanRepo = vi.fn();
    const compareCapabilityRefs = vi.fn();
    const result = await run("C:/unused", {}, { scanRepo: scanRepo as never, compareCapabilityRefs: compareCapabilityRefs as never });
    expect(scanRepo).not.toHaveBeenCalled();
    expect(compareCapabilityRefs).not.toHaveBeenCalled();
    expect(result.summary).not.toContain("Change scope");
    expect(result.summary).not.toContain("Capability");
    expect(result.outputs).not.toContain("change-scope-affected-count");
    expect(result.outputs).toMatch(/test-route-count=0\n$/);
  });

  it("adds a change-scope section and affected-count output from the real Core engine", async () => {
    const root = await repoWith(importGraph);
    const result = await run(root, { INPUT_CHANGE_SCOPE_TOUCH: "src/a.ts" });
    expect(result.outputs).toContain("change-scope-affected-count=2\n");
    expect(result.summary).toContain("## Change scope (preview)");
    expect(result.summary).toContain("- Selected: 1");
    expect(result.summary).toContain("- Affected: 2");
    expect(result.summary).toContain("- Unresolved anchors: 0");
    expect(result.summary).toContain("- Truncated: no");
    expect(result.summary).toContain("- `src/b.ts` (distance 1)");
    expect(result.summary).toContain("- `src/c.ts` (distance 1)");
    expect(result.stdout).toContain("## Change scope (preview)");
  });

  it("reports unresolved touch and add anchors without inventing evidence", async () => {
    const root = await repoWith(importGraph);
    const result = await run(root, {
      INPUT_CHANGE_SCOPE_TOUCH: "src/b.ts, src/missing.ts",
      INPUT_CHANGE_SCOPE_ADD: "src/new-feature.ts\nsrc/a.ts"
    });
    expect(result.summary).toContain("- Selected: 2");
    expect(result.summary).toContain("- Unresolved anchors: 2");
    expect(result.summary).toContain("- touch `src/missing.ts`");
    expect(result.summary).toContain("- add `src/new-feature.ts`");
    expect(result.summary).not.toContain("- add `src/a.ts`");
    expect(result.outputs).toContain("change-scope-affected-count=1\n");
  });

  it("reports truncation at the node bound and bounds the listed paths", async () => {
    const files: Record<string, string> = { "src/hub.ts": "export const hub = 1;\n" };
    for (let index = 0; index < 205; index += 1) {
      files[`src/leaf-${String(index).padStart(3, "0")}.ts`] = `import { hub } from "./hub";\nexport const leaf${index} = hub;\n`;
    }
    const root = await repoWith(files);
    const result = await run(root, { INPUT_CHANGE_SCOPE_TOUCH: "src/hub.ts" });
    expect(result.summary).toContain("- Affected: 199");
    expect(result.summary).toContain("- Truncated: yes; 6 nodes omitted at the 200-node bound");
    expect(result.summary).toContain(`- …and ${199 - SECTION_PATH_LIMIT} more`);
    const section = result.summary.slice(result.summary.indexOf("Top affected paths:"));
    expect(section.match(/^- `src\/leaf-/gm)).toHaveLength(SECTION_PATH_LIMIT);
    expect(result.outputs).toContain("change-scope-affected-count=199\n");
  });

  it("rejects invalid anchor paths and scope inputs outside plan mode", async () => {
    const root = await repoWith(importGraph);
    await expect(run(root, { INPUT_CHANGE_SCOPE_TOUCH: "../outside.ts" })).rejects.toThrow(/Invalid change-scope path/);
    await expect(run(root, { INPUT_MODE: "verify", INPUT_ISSUE: "", INPUT_REPORT_PATH: "plan.json", INPUT_BASE: "main", INPUT_CHANGE_SCOPE_TOUCH: "src/a.ts" }))
      .rejects.toThrow(/plan-only input: change-scope-touch/);
    await expect(run(root, { INPUT_MODE: "annotate", INPUT_ISSUE: "", INPUT_NO_CACHE: "", INPUT_ANNOTATION_REQUEST: "{}", INPUT_CAPABILITY: "billing" }))
      .rejects.toThrow(/annotate mode does not accept analysis inputs: capability/);
  });
});

describe("Action capability maps (preview)", () => {
  const checkout = { "src/checkout.ts": 'import { b } from "./b";\nexport const checkout = b;\n', ...importGraph };

  it("adds the current capability map without writing the store", async () => {
    const storeText = store([{ id: "checkout", name: "Checkout flow", anchors: [{ operation: "touch", path: "src/checkout.ts" }] }]);
    const root = await repoWith({ ...checkout, ".fixmap/capabilities.json": storeText });
    const result = await run(root, { INPUT_CAPABILITY: "Checkout" });
    expect(result.summary).toContain("## Capability (preview): `checkout`");
    expect(result.summary).toContain("**Checkout flow**, defined in `.fixmap/capabilities.json`");
    expect(result.summary).toContain("### Current map");
    expect(result.summary).toContain("- `src/b.ts` (distance 1)");
    expect(result.summary).not.toContain("Base vs head");
    expect(result.stdout).not.toContain("::warning::");
    expect(await readFile(join(root, ".fixmap/capabilities.json"), "utf8")).toBe(storeText);
    expect((await readdir(join(root, ".fixmap"))).sort()).toEqual(["capabilities.json"]);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("degrades a missing store to a warning and a notice", async () => {
    const root = await repoWith(importGraph);
    const result = await run(root, { INPUT_CAPABILITY: "checkout" });
    expect(result.summary).toContain("Capability map unavailable: .fixmap/capabilities.json was not found");
    expect(result.stdout).toContain("::warning::FixMap capability checkout: .fixmap/capabilities.json was not found");
    expect(result.summary).toContain("Mapped the change.");
  });

  it("degrades an invalid store to a warning and a notice", async () => {
    const root = await repoWith({ ...importGraph, ".fixmap/capabilities.json": "{ not json" });
    const result = await run(root, { INPUT_CAPABILITY: "checkout" });
    expect(result.summary).toContain("Capability map unavailable: .fixmap/capabilities.json is not valid JSON");
    expect(result.stdout).toContain("::warning::FixMap could not read the capability store");

    const schemaRoot = await repoWith({ ...importGraph, ".fixmap/capabilities.json": JSON.stringify({ capabilityStoreVersion: 2 }) });
    const schemaResult = await run(schemaRoot, { INPUT_CAPABILITY: "checkout" });
    expect(schemaResult.summary).toContain("Capability map unavailable: Capability store must be a version-1 object");
  });

  it("reports an unknown capability id and rejects a malformed one before scanning", async () => {
    const root = await repoWith({ ...checkout, ".fixmap/capabilities.json": store([{ id: "checkout", name: "Checkout", anchors: [{ operation: "touch", path: "src/checkout.ts" }] }]) });
    const result = await run(root, { INPUT_CAPABILITY: "billing" });
    expect(result.summary).toContain('Capability map unavailable: Capability "billing" was not found in .fixmap/capabilities.json.');
    expect(result.stdout).toContain("::warning::FixMap capability billing:");

    const scanRepo = vi.fn();
    await expect(run(root, { INPUT_CAPABILITY: "billing flow" }, { scanRepo: scanRepo as never })).rejects.toThrow(/capability must be one id/);
    expect(scanRepo).not.toHaveBeenCalled();
  });

  it("compares base and head capability maps on a real pull request checkout", async () => {
    const root = await repoWith({
      ...checkout,
      ".fixmap/capabilities.json": store([{ id: "checkout", name: "Checkout", anchors: [{ operation: "touch", path: "src/checkout.ts" }] }])
    });
    const base = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "-b", "feature");
    await writeFiles(root, {
      "src/payment.ts": "export const payment = 1;\n",
      ".fixmap/capabilities.json": store([{
        id: "checkout",
        name: "Checkout",
        anchors: [{ operation: "touch", path: "src/checkout.ts" }, { operation: "touch", path: "src/payment.ts" }]
      }])
    });
    const head = commit(root, "add payment to checkout");

    const result = await run(root, {
      GITHUB_EVENT_PATH: "event.json",
      INPUT_ISSUE: "",
      INPUT_BASE: base,
      INPUT_HEAD: "HEAD",
      INPUT_CAPABILITY: "checkout",
      INPUT_GITHUB_TOKEN: "token",
      GITHUB_REPOSITORY: "owner/demo"
    });
    expect(result.summary).toContain("### Base vs head");
    expect(result.summary).toContain(`Capability checkout has`);
    expect(result.summary).toContain(`between ${base} and ${head}.`);
    expect(result.summary).toContain("- Definition changed: yes");
    expect(result.summary).toContain("- Selected: +1 −0 ~0");
    expect(result.summary).toContain("- added selected `src/payment.ts`");
    expect(result.comment).toContain("### Base vs head");
    expect(git(root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("explains a base ref that the checkout cannot resolve", async () => {
    const root = await repoWith({
      ...checkout,
      ".fixmap/capabilities.json": store([{ id: "checkout", name: "Checkout", anchors: [{ operation: "touch", path: "src/checkout.ts" }] }])
    });
    const result = await run(root, {
      GITHUB_EVENT_PATH: "event.json",
      INPUT_ISSUE: "",
      INPUT_BASE: "origin/missing-base",
      INPUT_HEAD: "HEAD",
      INPUT_CAPABILITY: "checkout"
    });
    expect(result.summary).toContain("### Current map");
    expect(result.summary).toMatch(/Diff unavailable: .+ Fetch the base ref/);
  });

  it("keeps the JSON report contract and appends the sections after the fenced comment", async () => {
    const root = await repoWith(importGraph);
    const result = await run(root, {
      GITHUB_EVENT_PATH: "event.json",
      GITHUB_REPOSITORY: "owner/demo",
      INPUT_GITHUB_TOKEN: "token",
      INPUT_FORMAT: "json",
      INPUT_CHANGE_SCOPE_TOUCH: "src/a.ts"
    });
    const reportOutput = result.outputs.slice(result.outputs.indexOf("\n") + 1, result.outputs.indexOf("\nfixmap_stable"));
    expect(JSON.parse(reportOutput)).not.toHaveProperty("changeScope");
    expect(reportOutput).not.toContain("Change scope");
    expect(result.comment).toMatch(/```\n\n## Change scope \(preview\)/);
    expect(result.outputs).toContain("change-scope-affected-count=2\n");
  });
});
