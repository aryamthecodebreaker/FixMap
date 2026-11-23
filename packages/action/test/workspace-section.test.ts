import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixMapReport } from "@aryam/fixmap-core";
import { runAction, type ActionDependencies } from "../src/runner.js";
import { resolveWorkspaceInput } from "../src/workspace-section.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })));
});

async function workspaceFixture(): Promise<{ root: string; api: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-action-workspace-"));
  roots.push(root);
  const files: Record<string, string> = {
    "api/packages/client/package.json": JSON.stringify({ name: "@acme/api-client", version: "2.0.0" }),
    "api/packages/client/src/index.ts": "export const call = () => 1;\n",
    "api/README.md": "api\n",
    "web/package.json": JSON.stringify({ name: "web", dependencies: { "@acme/api-client": "^2.0.0" } }),
    "web/src/app.ts": "export const app = 1;\n",
    "workspace.json": JSON.stringify({
      workspaceConfigVersion: 1,
      workspace: "acme",
      repositories: [{ id: "api", path: "api" }, { id: "web", path: "web" }]
    })
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return { root, api: join(root, "api") };
}

function report(changedFiles: string[]): FixMapReport {
  return { summary: "Mapped the change.", contextFiles: [], testRoutes: [], risks: [], changedFiles, diagnostics: [] };
}

async function run(repoRoot: string, env: NodeJS.ProcessEnv, changedFiles: string[], overrides: ActionDependencies = {}) {
  const writes = new Map<string, string>();
  let comment: string | undefined;
  await runAction({
    INPUT_ISSUE: "change the client",
    INPUT_NO_CACHE: "true",
    GITHUB_STEP_SUMMARY: "summary.md",
    GITHUB_OUTPUT: "output.txt",
    GITHUB_TOKEN: "token",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_EVENT_PATH: "event.json",
    GITHUB_REPOSITORY: "acme/api",
    ...env
  }, {
    appendFile: (path, contents) => writes.set(path, (writes.get(path) ?? "") + contents),
    buildReport: vi.fn(async () => report(changedFiles)),
    createClient: () => ({
      upsertPullRequestComment: async (input: { markdown: string }) => { comment = input.markdown; }
    }) as never,
    cwd: () => repoRoot,
    fileSize: () => 0,
    now: () => "2026-11-23T00:00:00.000Z",
    readFile: (path) => {
      if (path !== "event.json") throw new Error(`unexpected read of ${path}`);
      return JSON.stringify({ pull_request: { number: 9, title: "Change" } });
    },
    stdout: () => undefined,
    uuid: () => "stable",
    ...overrides
  });
  return { summary: writes.get("summary.md") ?? "", outputs: writes.get("output.txt") ?? "", comment };
}

describe("Action cross-repository impact (preview)", { timeout: 60_000 }, () => {
  it("leaves the comment byte-identical and loads nothing when the input is unset or blank", async () => {
    const { api } = await workspaceFixture();
    const loadWorkspace = vi.fn();
    const unset = await run(api, {}, ["packages/client/src/index.ts"], { loadWorkspace: loadWorkspace as never });
    const blank = await run(api, { INPUT_WORKSPACE: "   " }, ["packages/client/src/index.ts"], { loadWorkspace: loadWorkspace as never });
    expect(loadWorkspace).not.toHaveBeenCalled();
    expect(blank.comment).toBe(unset.comment);
    expect(unset.comment).not.toContain("Cross-repository impact");
  });

  it("names the consuming checkout with its evidence and never mentions anyone", async () => {
    const { root, api } = await workspaceFixture();
    const result = await run(api, { INPUT_WORKSPACE: "../workspace.json", GITHUB_WORKSPACE: root }, ["packages/client/src/index.ts", "README.md"]);
    expect(result.comment).toContain("## Cross-repository impact (preview)");
    expect(result.comment).toContain("Workspace `acme`, this checkout `api`, 2 repositories, 1 cross-repository dependency.");
    expect(result.comment).toContain("- **observation** web depends on `@acme/api-client`, and this diff changes 1 file in it: packages/client/src/index.ts. (evidence: `package.json`)");
    expect(result.comment!.replace(/`[^`]*`/g, "")).not.toMatch(/(^|[^A-Za-z0-9_.+-])@[A-Za-z0-9]/m);
    expect(result.summary).toContain("Cross-repository impact");
  });

  it("says so when nothing downstream consumes the change, or nothing changed", async () => {
    const { root, api } = await workspaceFixture();
    const env = { INPUT_WORKSPACE: "../workspace.json", GITHUB_WORKSPACE: root };
    expect((await run(api, env, ["README.md"])).comment).toContain("No other workspace checkout consumes a package this pull request changes.");
    expect((await run(api, env, [])).comment).toContain("No changed files to trace.");
  });

  it("rejects configs outside the job workspace, URLs, configs that omit this checkout, and verify mode", async () => {
    const { root, api } = await workspaceFixture();
    expect(() => resolveWorkspaceInput("../../outside.json", api, root)).toThrow(/inside the job workspace/);
    expect(() => resolveWorkspaceInput("https://example.test/workspace.json", api, root)).toThrow(/not a URL/);
    expect(resolveWorkspaceInput("../workspace.json", api, root)).toBe(join(root, "workspace.json"));

    await writeFile(join(root, "other.json"), JSON.stringify({ workspaceConfigVersion: 1, workspace: "acme", repositories: [{ id: "web", path: "web" }] }));
    await expect(run(api, { INPUT_WORKSPACE: "../other.json", GITHUB_WORKSPACE: root }, ["packages/client/src/index.ts"]))
      .rejects.toThrow(/does not list this checkout/);
    await expect(run(api, { INPUT_WORKSPACE: "../workspace.json", GITHUB_WORKSPACE: root, INPUT_MODE: "verify", INPUT_REPORT_PATH: "plan.json" }, []))
      .rejects.toThrow(/plan-only input.*workspace/);
  });
});
