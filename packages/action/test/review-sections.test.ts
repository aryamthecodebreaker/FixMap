import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixMapReport } from "@aryam/fixmap-core";
import { GitHubRequestError } from "../src/github.js";
import { runAction, type ActionDependencies } from "../src/runner.js";

const baseReport: FixMapReport = {
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
  const root = await mkdtemp(join(tmpdir(), "fixmap-action-review-"));
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

/** Commits `head` on a feature branch and returns both commits; HEAD stays on the feature branch. */
async function pullRequest(base: Record<string, string>, head: Record<string, string>, remove: string[] = []) {
  const root = await repoWith(base);
  const baseCommit = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "-b", "feature");
  await writeFiles(root, head);
  for (const path of remove) git(root, "rm", "-q", path);
  const headCommit = commit(root, "feature");
  return { root, baseCommit, headCommit };
}

type Run = { stdout: string; summary: string; outputs: string; comment: string | undefined };

async function run(root: string, env: NodeJS.ProcessEnv, overrides: ActionDependencies = {}, report: Partial<FixMapReport> = {}): Promise<Run> {
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
    buildReport: vi.fn(async () => ({ ...structuredClone(baseReport), ...report })),
    createClient: () => ({
      upsertPullRequestComment: async (input: { markdown: string }) => { comment = input.markdown; }
    }) as never,
    cwd: () => root,
    fileSize: () => 0,
    now: () => "2026-11-22T00:00:00.000Z",
    readFile: (path) => {
      if (path === "event.json") return JSON.stringify({ pull_request: { number: 9, title: "Change" } });
      if (path === "plan.json") return JSON.stringify(baseReport);
      throw new Error(`unexpected read of ${path}`);
    },
    stdout: (text) => { stdout += text; },
    uuid: () => "stable",
    ...overrides
  });
  return { stdout, summary: writes.get("summary.md") ?? "", outputs: writes.get("output.txt") ?? "", comment };
}

/** A pull request run against exact base and head commits. */
function prEnv(baseCommit: string, extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    GITHUB_EVENT_PATH: "event.json",
    GITHUB_REPOSITORY: "owner/demo",
    INPUT_ISSUE: "",
    INPUT_BASE: baseCommit,
    INPUT_HEAD: "HEAD",
    ...extra
  };
}

const usersApi = (operations: string) => `openapi: 3.0.3\ninfo:\n  title: Users\n  version: "1"\npaths:\n  /users:\n${operations}`;
const getAndPost = "    get: {}\n    post: {}\n";

// Real Git repositories and scans run several times slower on Windows runners than locally.
describe("Action review sections (preview)", { timeout: 30_000 }, () => {
  it("leaves the report, outputs, and scans unchanged when no preview input is set", async () => {
    const scanRepo = vi.fn();
    const compareContractRefs = vi.fn();
    const compareArchitectureRefs = vi.fn();
    const result = await run("C:/unused", {
      // action.yml defaults that GitHub always passes.
      INPUT_CONTRACTS: "false",
      INPUT_REVIEWERS: "false",
      INPUT_REVIEWERS_HISTORY_AUTHORS: "true",
      INPUT_ARCHITECTURE_DRIFT: "false"
    }, { scanRepo: scanRepo as never, compareContractRefs: compareContractRefs as never, compareArchitectureRefs: compareArchitectureRefs as never });
    expect(scanRepo).not.toHaveBeenCalled();
    expect(compareContractRefs).not.toHaveBeenCalled();
    expect(compareArchitectureRefs).not.toHaveBeenCalled();
    expect(result.summary).not.toMatch(/Contract changes|Suggested reviewers|Architecture drift/);
    expect(result.outputs).not.toContain("breaking-contract-count");
    expect(result.outputs).toMatch(/test-route-count=0\n$/);
  });

  it("adds contract changes and the breaking count from an exact-ref diff without checkout", async () => {
    const { root, baseCommit, headCommit } = await pullRequest(
      { "specs/users-api.yml": usersApi(getAndPost) },
      { "specs/users-api.yml": usersApi("    get: {}\n") }
    );
    const result = await run(root, prEnv(baseCommit, { INPUT_CONTRACTS: "true", INPUT_GITHUB_TOKEN: "token" }));
    expect(result.summary).toContain("## Contract changes (preview)");
    expect(result.summary).toContain("- Breaking: 1");
    expect(result.summary).toMatch(/- breaking `specs\/users-api\.yml` \(openapi\): /);
    expect(result.summary).toContain(`head \`HEAD\` at \`${headCommit}\``);
    expect(result.summary).toContain("never fail this step");
    expect(result.outputs).toContain("breaking-contract-count=1\n");
    expect(result.comment).toContain("## Contract changes (preview)");
    expect(git(root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feature");
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("adds contract changes in verify mode without failing on breaking changes", async () => {
    const { root, baseCommit } = await pullRequest(
      { "specs/users-api.yml": usersApi(getAndPost) },
      { "specs/users-api.yml": usersApi("    get: {}\n") }
    );
    const result = await run(root, prEnv(baseCommit, { INPUT_MODE: "verify", INPUT_REPORT_PATH: "plan.json", INPUT_CONTRACTS: "true" }));
    expect(result.summary).toContain("## Contract changes (preview)");
    expect(result.outputs).toContain("breaking-contract-count=1\n");
    expect(result.outputs).toContain("finding-count=");
  });

  it("degrades missing refs to a warning for contracts and architecture drift", async () => {
    const root = await repoWith({ "src/a.ts": "export const a = 1;\n" });
    const missing = await run(root, prEnv("origin/missing-base", { INPUT_CONTRACTS: "true", INPUT_ARCHITECTURE_DRIFT: "true" }));
    expect(missing.summary).toMatch(/Contract comparison unavailable: .+ Fetch the base ref/);
    expect(missing.summary).toMatch(/Architecture drift unavailable: .+ Fetch the base ref/);
    expect(missing.stdout).toContain("::warning::FixMap contract comparison unavailable:");
    expect(missing.stdout).toContain("::warning::FixMap architecture drift unavailable:");
    expect(missing.outputs).not.toContain("breaking-contract-count");
    expect(missing.summary).toContain("Mapped the change.");

    // No pull request event: there is no exact base/head pair to compare.
    const noPr = await run(root, { INPUT_CONTRACTS: "true", INPUT_ARCHITECTURE_DRIFT: "true" });
    expect(noPr.summary).toContain("Contract comparison needs a pull request with both base and head refs.");
    expect(noPr.stdout).toContain("::warning::FixMap architecture drift needs a pull request with both base and head refs.");
  });

  it("suggests reviewers without any @ mention and never requests a review", async () => {
    const root = await repoWith({
      ".github/CODEOWNERS": "* @org/everyone\n/src/auth.ts @security-team\n",
      "src/auth.ts": "export const auth = 1;\n"
    });
    let requested = false;
    const result = await run(root, { GITHUB_EVENT_PATH: "event.json", GITHUB_REPOSITORY: "owner/demo", INPUT_GITHUB_TOKEN: "token", INPUT_REVIEWERS: "true" }, {
      createClient: () => ({
        upsertPullRequestComment: async () => undefined,
        requestReviewers: async () => { requested = true; }
      }) as never
    }, { changedFiles: ["src/auth.ts"] });
    expect(result.summary).toContain("## Suggested reviewers (preview)");
    expect(result.summary).toContain("- Changed paths routed: 1");
    expect(result.summary).toMatch(/- `security-team` \(high; CODEOWNERS\): `src\/auth\.ts`/);
    expect(result.summary).toContain("`FixMap Test`");
    expect(result.summary).not.toMatch(/(^|[^A-Za-z0-9_.+-])@[A-Za-z0-9]/m);
    expect(result.stdout).not.toMatch(/(^|[^A-Za-z0-9_.+-])@[A-Za-z0-9]/m);
    expect(requested).toBe(false);
  });

  it("leaves out commit authors when reviewers-history-authors is false", async () => {
    const root = await repoWith({ ".github/CODEOWNERS": "/src/auth.ts @security-team\n", "src/auth.ts": "export const auth = 1;\n" });
    const result = await run(root, { INPUT_REVIEWERS: "true", INPUT_REVIEWERS_HISTORY_AUTHORS: "false" }, {}, { changedFiles: ["src/auth.ts"] });
    expect(result.summary).toContain("`security-team`");
    expect(result.summary).not.toContain("FixMap Test");
    await expect(run(root, { INPUT_REVIEWERS_HISTORY_AUTHORS: "false" })).rejects.toThrow(/requires reviewers: true/);
  });

  it("adds architecture drift with added edges and new cycles from Git objects", async () => {
    const { root, headCommit } = await pullRequest(
      { "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 1;\n" },
      { "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n', "src/b.ts": 'import { a } from "./a";\nexport const b = a;\n' }
    );
    const result = await run(root, prEnv(git(root, "rev-parse", "main"), { INPUT_ARCHITECTURE_DRIFT: "true" }));
    expect(result.summary).toContain("## Architecture drift (preview)");
    expect(result.summary).toContain("- Added edges: 2");
    expect(result.summary).toContain("- New cycles: 1 (resolved: 0)");
    expect(result.summary).toContain("- `src/a.ts` -> `src/b.ts`");
    expect(result.summary).toContain(`at \`${headCommit}\``);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("keeps the sections when a read-only token cannot comment", async () => {
    const { root, baseCommit } = await pullRequest(
      { "specs/users-api.yml": usersApi(getAndPost) },
      { "specs/users-api.yml": usersApi("    get: {}\n") }
    );
    const result = await run(root, prEnv(baseCommit, { INPUT_CONTRACTS: "true", INPUT_GITHUB_TOKEN: "token" }), {
      createClient: () => ({
        upsertPullRequestComment: async () => { throw new GitHubRequestError("GitHub API request failed (403).", 403, "Resource not accessible by integration", false); }
      }) as never
    });
    expect(result.stdout).toContain("::warning::FixMap could not comment on the pull request");
    expect(result.summary).toContain("## Contract changes (preview)");
    expect(result.outputs).toContain("breaking-contract-count=1\n");
  });

  it("rejects plan-only previews in verify mode and every preview in annotate mode", async () => {
    const root = await repoWith({ "src/a.ts": "export const a = 1;\n" });
    await expect(run(root, { INPUT_MODE: "verify", INPUT_ISSUE: "", INPUT_REPORT_PATH: "plan.json", INPUT_BASE: "main", INPUT_REVIEWERS: "true", INPUT_ARCHITECTURE_DRIFT: "true" }))
      .rejects.toThrow(/plan-only inputs: reviewers, architecture-drift/);
    await expect(run(root, { INPUT_MODE: "annotate", INPUT_ISSUE: "", INPUT_NO_CACHE: "", INPUT_ANNOTATION_REQUEST: "{}", INPUT_CONTRACTS: "true" }))
      .rejects.toThrow(/annotate mode does not accept analysis inputs: contracts/);
    await expect(run(root, { INPUT_CONTRACTS: "maybe" })).rejects.toThrow(/contracts must be true or false/);
  });
});
