import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";

const exec = promisify(execFile);
const GIT_TEST_TIMEOUT = process.platform === "win32" ? 60_000 : 20_000;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

async function git(root: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root })).stdout;
}

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-contracts-cli-"));
  roots.push(root);
  await git(root, "init", "--quiet");
  await git(root, "config", "user.email", "fixmap@example.test");
  await git(root, "config", "user.name", "FixMap Test");
  await git(root, "config", "core.autocrlf", "false");
  return root;
}

async function commit(root: string, files: Record<string, string>, message: string, remove: string[] = []): Promise<string> {
  await write(root, files);
  for (const path of remove) await git(root, "rm", "--quiet", path);
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "--allow-empty", "-m", message);
  return (await git(root, "rev-parse", "HEAD")).trim();
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    dependencies: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) }
  };
}

async function contractsJson(args: string[]) {
  const io = capture();
  const exitCode = await runCli(["contracts", ...args, "--format", "json"], io.dependencies);
  expect(io.stderr.join("")).toBe("");
  expect(exitCode).toBe(0);
  return JSON.parse(io.stdout.join(""));
}

const OPENAPI_V1 = {
  openapi: "3.1.0",
  info: { title: "Users" },
  paths: { "/users": { get: {}, post: { parameters: [{ name: "trace", in: "header", required: false, schema: { type: "string" } }] } } },
  components: { schemas: { User: { type: "object", properties: { id: { type: "string" } } } } }
};
const OPENAPI_YAML_V1 = `openapi: 3.1.0
info:
  title: Users
paths:
  /users:
    get: {}
    post:
      parameters:
        - name: trace
          in: header
          required: false
          schema:
            type: string
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
`;
const OPENAPI_V2 = {
  openapi: "3.1.0",
  info: { title: "Users" },
  paths: { "/users": { post: { parameters: [
    { name: "trace", in: "header", required: false, schema: { type: "string" } },
    { name: "tenant", in: "header", required: true, schema: { type: "string" } }
  ] } } },
  components: { schemas: { User: { type: "object", properties: { id: { type: "string" }, nickname: { type: "string" } } } } }
};
const OPENAPI_YAML_V2 = `openapi: 3.1.0
info:
  title: Users
paths:
  /users:
    post:
      parameters:
        - name: trace
          in: header
          required: false
          schema:
            type: string
        - name: tenant
          in: header
          required: true
          schema: { type: string }
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
        nickname:
          type: string
`;

describe("contracts command", () => {
  it("lists every supported working-tree contract with kind, version, and exact fingerprint", async () => {
    const root = await repository();
    await commit(root, {
      "api/openapi.yaml": OPENAPI_YAML_V1,
      "events/asyncapi.json": JSON.stringify({ asyncapi: "2.6.0", info: { title: "Events" }, channels: { "user.created": { publish: {} } } }),
      "schema/schema.graphql": "type Query { user(id: ID!): User }\ntype User { id: ID! }\n",
      "proto/user.proto": "syntax = \"proto3\";\nmessage User { string id = 1; }\n",
      "schemas/user.schema.json": JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", title: "User", properties: { id: { type: "string" } } }),
      "db/migrations/001_users.sql": "CREATE TABLE users (id text);\n",
      "src/index.ts": "export const ok = true;\n"
    }, "contracts");

    const list = await contractsJson(["--repo", root, "--no-cache"]);
    expect(list.contractListVersion).toBe(1);
    expect(list.inventory.diagnostics).toEqual([]);
    expect(list.inventory.surfaces.map((surface: { kind: string; path: string; version?: string }) => [surface.kind, surface.path, surface.version])).toEqual([
      ["asyncapi", "events/asyncapi.json", "2.6.0"],
      ["graphql", "schema/schema.graphql", undefined],
      ["json-schema", "schemas/user.schema.json", "https://json-schema.org/draft/2020-12/schema"],
      ["migration", "db/migrations/001_users.sql", undefined],
      ["openapi", "api/openapi.yaml", "3.1.0"],
      ["protobuf", "proto/user.proto", "proto3"]
    ]);
    for (const surface of list.inventory.surfaces) {
      expect(surface.sourceFingerprint).toMatch(/^worktree:[a-f0-9]{64}$/);
      // GraphQL, Protobuf, and SQL are read in full rather than reported as empty surfaces.
      expect(surface.entries.length).toBeGreaterThan(0);
    }

    const markdown = capture();
    expect(await runCli(["contracts", "--repo", root], markdown.dependencies)).toBe(0);
    const text = markdown.stdout.join("");
    expect(text).toMatch(/^# FixMap Contracts\n/);
    expect(text).toContain("6 contract surfaces in the working tree.");
    expect(text).toContain("| `api/openapi.yaml` | openapi | `Users` | `3.1.0` |");
  }, GIT_TEST_TIMEOUT);

  it("reports a repository with no contracts without failing", async () => {
    const root = await repository();
    await commit(root, { "src/index.ts": "export const ok = true;\n", "package.json": "{\"name\":\"plain\"}\n" }, "plain");
    const list = await contractsJson(["--repo", root]);
    expect(list.inventory).toEqual({ inventoryVersion: 1, surfaces: [], diagnostics: [] });
    const io = capture();
    expect(await runCli(["contracts", "--repo", root], io.dependencies)).toBe(0);
    expect(io.stdout.join("")).toContain("No supported contract surfaces were found in the working tree.");
  }, GIT_TEST_TIMEOUT);

  it("reports malformed specs as diagnostics instead of skipping them", async () => {
    const root = await repository();
    await commit(root, {
      "openapi.yaml": "openapi: 3.1.0\npaths:\n  /a: &shared\n    get: {}\n  /b: *shared\n",
      "api/openapi.json": "{ \"openapi\": \"3.1.0\", ",
      "schema.graphql": "this is not GraphQL SDL\n"
    }, "broken");
    const list = await contractsJson(["--repo", root]);
    expect(list.inventory.surfaces).toEqual([]);
    expect(list.inventory.diagnostics.map((diagnostic: { path: string; code: string }) => [diagnostic.path, diagnostic.code])).toEqual([
      ["api/openapi.json", "contract-parse-failed"],
      ["openapi.yaml", "contract-parse-failed"],
      ["schema.graphql", "contract-parse-failed"]
    ]);
    expect(list.inventory.diagnostics[1].message).toContain("anchors, aliases, and tags are not supported");
  }, GIT_TEST_TIMEOUT);

  it("diffs exact refs into breaking, unknown, and compatible changes without changing HEAD or git status", async () => {
    const root = await repository();
    const before = await commit(root, {
      "api/openapi.json": JSON.stringify(OPENAPI_V1, null, 2),
      "schema.graphql": "type Query { ok: Boolean }\n",
      "db/migrations/001.sql": "CREATE TABLE users (id text);\n"
    }, "before");
    const after = await commit(root, {
      "api/openapi.json": JSON.stringify(OPENAPI_V2, null, 2),
      "schema.graphql": "this is not GraphQL SDL\n",
      "db/migrations/001.sql": "CREATE TABLE users (id text, nickname text);\n",
      "proto/new.proto": "message Added { string id = 1; }\n"
    }, "after");
    // Uncommitted edits must survive and must not leak into the committed comparison.
    await writeFile(join(root, "api/openapi.json"), "{ \"dirty\": true }", "utf8");
    const headBefore = await git(root, "rev-parse", "HEAD");
    const statusBefore = await git(root, "status", "--porcelain=v1");

    const diff = await contractsJson(["diff", `${before}..${after}`, "--repo", root]);
    expect(diff.contractDiffVersion).toBe(1);
    expect(diff.from).toEqual({ requestedRef: before, commit: before });
    expect(diff.to).toEqual({ requestedRef: after, commit: after });
    const changes = diff.comparison.changes as Array<Record<string, unknown> & { evidence: Record<string, string> }>;
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "api/openapi.json", entry: "operation:GET /users", compatibility: "breaking" }),
      expect.objectContaining({ path: "api/openapi.json", entry: "argument:POST /users:header:tenant", compatibility: "breaking" }),
      expect.objectContaining({ path: "api/openapi.json", entry: "field:User.nickname", compatibility: "compatible" }),
      expect.objectContaining({ path: "schema.graphql", change: "contract-unavailable", compatibility: "unknown" }),
      expect.objectContaining({ path: "db/migrations/001.sql", change: "entry-removed", compatibility: "unknown" }),
      expect.objectContaining({ path: "proto/new.proto", change: "contract-added", compatibility: "compatible" })
    ]));
    const severity = { breaking: 0, unknown: 1, compatible: 2 } as Record<string, number>;
    expect(changes.map((change) => severity[change.compatibility as string])).toEqual(
      [...changes.map((change) => severity[change.compatibility as string])].sort((a, b) => a! - b!)
    );
    const tenant = changes.find((change) => change.entry === "argument:POST /users:header:tenant")!;
    expect(tenant.evidence.beforeFingerprint).toMatch(/^git:[a-f0-9]{40}$/);
    expect(tenant.evidence.afterFingerprint).toMatch(/^git:[a-f0-9]{40}$/);
    expect(tenant.evidence.beforeFingerprint).not.toBe(tenant.evidence.afterFingerprint);
    expect(diff.comparison.diagnostics).toContainEqual(expect.objectContaining({ path: "schema.graphql", code: "contract-parse-failed" }));

    const markdown = capture();
    expect(await runCli(["contracts", "diff", `${before}..${after}`, "--repo", root], markdown.dependencies)).toBe(0);
    const text = markdown.stdout.join("");
    expect(text).toContain(`From: \`${before}\` at \`${before}\``);
    expect(text).toMatch(/## Breaking\n\n- `api\/openapi\.json` \(openapi\): .* Fingerprints: `git:[a-f0-9]{40}` -> `git:[a-f0-9]{40}`\./);
    expect(text).toContain("## Unknown");
    expect(text).toContain("## Compatible");
    expect(text).toContain("did not checkout a ref or change the worktree");

    expect(await git(root, "rev-parse", "HEAD")).toBe(headBefore);
    expect(await git(root, "status", "--porcelain=v1")).toBe(statusBefore);
    expect(await readFile(join(root, "api/openapi.json"), "utf8")).toBe("{ \"dirty\": true }");
  }, GIT_TEST_TIMEOUT);

  it("produces the same deltas for YAML and JSON spellings of one OpenAPI change", async () => {
    const root = await repository();
    const before = await commit(root, { "json/openapi.json": JSON.stringify(OPENAPI_V1), "yaml/openapi.yaml": OPENAPI_YAML_V1 }, "before");
    const after = await commit(root, { "json/openapi.json": JSON.stringify(OPENAPI_V2), "yaml/openapi.yaml": OPENAPI_YAML_V2 }, "after");
    const diff = await contractsJson(["diff", `${before}..${after}`, "--repo", root]);
    const shape = (prefix: string) => (diff.comparison.changes as Array<Record<string, unknown>>)
      .filter((change) => String(change.path).startsWith(prefix))
      .map(({ change, compatibility, entry, before: was, after: now, reason }) => ({ change, compatibility, entry, was, now, reason }));
    expect(shape("json/").map((change) => [change.entry, change.compatibility])).toEqual([
      ["argument:POST /users:header:tenant", "breaking"],
      ["operation:GET /users", "breaking"],
      ["field:User.nickname", "compatible"]
    ]);
    expect(shape("yaml/")).toEqual(shape("json/"));
    expect(diff.comparison.diagnostics).toEqual([]);
  }, GIT_TEST_TIMEOUT);

  it("reports a contract removed between refs as breaking and an identical range as unchanged", async () => {
    const root = await repository();
    const before = await commit(root, { "schema.graphql": "type Query { ok: Boolean }\n", "README.md": "x\n" }, "before");
    const after = await commit(root, {}, "after", ["schema.graphql"]);
    const removed = await contractsJson(["diff", `${before}..${after}`, "--repo", root]);
    expect(removed.comparison.changes).toEqual([expect.objectContaining({ change: "contract-removed", compatibility: "breaking" })]);
    const same = await contractsJson(["diff", `${after}..HEAD`, "--repo", root]);
    expect(same.comparison).toMatchObject({ summary: "No supported contract surface changed.", changes: [] });
  }, GIT_TEST_TIMEOUT);

  it("fails clearly on refs that do not exist and on non-Git directories", async () => {
    const root = await repository();
    await commit(root, { "schema.graphql": "type Query { ok: Boolean }\n" }, "only");
    const missing = capture();
    expect(await runCli(["contracts", "diff", "HEAD..does-not-exist", "--repo", root], missing.dependencies)).toBe(1);
    expect(missing.stderr.join("")).toContain("Could not resolve one of the requested Git refs");
    expect(missing.stdout).toEqual([]);

    const plain = await mkdtemp(join(tmpdir(), "fixmap-contracts-plain-"));
    roots.push(plain);
    const notGit = capture();
    expect(await runCli(["contracts", "diff", "HEAD~1..HEAD", "--repo", plain], notGit.dependencies)).toBe(1);
    expect(notGit.stderr.join("")).toContain("Could not resolve one of the requested Git refs");

    const absent = capture();
    expect(await runCli(["contracts", "--repo", join(plain, "missing")], absent.dependencies)).toBe(1);
    expect(absent.stderr.join("")).toContain("does not exist or is not a directory");
  }, GIT_TEST_TIMEOUT);

  it("validates arguments strictly", async () => {
    const cases: Array<[string[], string]> = [
      [["diff"], "contracts diff requires <from>..<to>."],
      [["diff", "main"], "contracts diff range must be <from>..<to>."],
      [["diff", "main...HEAD"], "not a three-dot merge-base range"],
      [["diff", "..HEAD"], "contracts diff range must be <from>..<to>."],
      [["diff", "a..b..c"], "contracts diff range must be <from>..<to>."],
      [["diff", "--upload-pack=x..HEAD"], "contracts diff requires <from>..<to>."],
      [["diff", "-x..HEAD"], "cannot start with '-'"],
      [["diff", "a..b", "--no-cache"], "--no-cache does not apply"],
      [["--format", "xml"], "--format must be markdown or json."],
      [["--bogus"], "Unknown contracts option: --bogus"],
      [["--repo", "https://example.com/repo.git"], "local checkout"],
      [["--repo", "a", "--repo", "b"], "Pass --repo only once."],
      [["--output"], "--output requires a value."]
    ];
    for (const [args, expected] of cases) {
      const io = capture();
      expect(await runCli(["contracts", ...args], io.dependencies)).toBe(1);
      expect(io.stderr.join("")).toContain(expected);
    }
    const help = capture();
    expect(await runCli(["contracts", "--help"], help.dependencies)).toBe(0);
    expect(help.stdout.join("")).toContain("fixmap contracts diff <from>..<to>");
  });

  it("refuses to overwrite a repository file but replaces its own prior artifact", async () => {
    const root = await repository();
    await commit(root, { "schema.graphql": "type Query { ok: Boolean }\n", "notes.md": "keep me\n" }, "only");
    const refused = capture();
    expect(await runCli(["contracts", "--repo", root, "--output", join(root, "notes.md")], refused.dependencies)).toBe(1);
    expect(refused.stderr.join("")).toContain("--output refuses to overwrite repository file notes.md");
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe("keep me\n");

    const target = join(root, "contracts.json");
    for (let run = 0; run < 2; run += 1) {
      const io = capture();
      expect(await runCli(["contracts", "--repo", root, "--format", "json", "--output", target], io.dependencies)).toBe(0);
    }
    expect(JSON.parse(await readFile(target, "utf8")).contractListVersion).toBe(1);
  }, GIT_TEST_TIMEOUT);
});
