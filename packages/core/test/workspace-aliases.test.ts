import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkspaceMap, buildWorkspaceVerifyNarrative } from "../src/workspace.js";
import { findWorkspaceRepository, loadWorkspaceConfig, parseWorkspaceConfig } from "../src/workspace-config.js";
import { graphSourceFingerprint } from "../src/identity-graph.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    contentFingerprint: graphSourceFingerprint(textSample),
    extension: /\.[^.]+$/.exec(path)?.[0]?.toLowerCase() ?? "",
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind: "code",
    textSample
  };
}

function repo(root: string, files: RepoFile[]): RepoMap {
  return { root, files, packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
}

const api = { id: "api", repo: repo("/api", [
  file("packages/client/package.json", JSON.stringify({ name: "@acme/api-client", version: "2.0.0" })),
  file("packages/client/src/index.ts", "export const call = () => 1;"),
  file("README.md", "api")
]) };
const web = { id: "web", repo: repo("/web", [
  file("package.json", JSON.stringify({ name: "web", dependencies: { "acme-client": "^2.0.0" } })),
  file("src/app.ts", "export const app = 1;")
]) };
const admin = { id: "admin", repo: repo("/admin", [
  file("package.json", JSON.stringify({ name: "admin", dependencies: { web: "1.0.0" } }))
]) };
const alias = {
  consumer: "web",
  ecosystem: "node" as const,
  package: "acme-client",
  provider: "api",
  providerPackage: "@acme/api-client",
  reason: "acme-client is the published name of the api client."
};

describe("workspace aliases", () => {
  it("links differently named packages only through a reviewed alias", () => {
    const withoutAlias = buildWorkspaceMap([api, web], { workspace: "acme" });
    expect(withoutAlias.dependencies).toHaveLength(0);
    expect(withoutAlias.diagnostics).toContainEqual(expect.objectContaining({ code: "unresolved-dependency" }));

    const linked = buildWorkspaceMap([api, web], { workspace: "acme", aliases: [alias] });
    expect(linked.dependencies).toEqual([expect.objectContaining({
      consumerRepository: "web",
      providerRepository: "api",
      package: "@acme/api-client",
      requestedVersion: "^2.0.0",
      alias: { declaredPackage: "acme-client", reason: alias.reason }
    })]);
    expect(linked.dependencies[0]!.evidence[0]!.detail).toContain("reviewed alias to @acme/api-client from api");
    expect(linked.diagnostics.filter((entry) => entry.code === "unresolved-dependency")).toHaveLength(0);
  });

  it("reports an alias whose provider package does not exist instead of inventing a link", () => {
    const map = buildWorkspaceMap([api, web], { workspace: "acme", aliases: [{ ...alias, providerPackage: "@acme/missing" }] });
    expect(map.dependencies).toHaveLength(0);
    expect(map.diagnostics).toContainEqual(expect.objectContaining({ code: "alias-unresolved", repositories: ["api", "web"] }));
  });

  it("rejects aliases that name unknown or identical repositories, or repeat", () => {
    expect(() => buildWorkspaceMap([api, web], { workspace: "acme", aliases: [{ ...alias, provider: "ghost" }] })).toThrow(/two repositories/);
    expect(() => buildWorkspaceMap([api, web], { workspace: "acme", aliases: [{ ...alias, provider: "web" }] })).toThrow(/two repositories/);
    expect(() => buildWorkspaceMap([api, web], { workspace: "acme", aliases: [alias, alias] })).toThrow(/more than once/);
  });
});

describe("cross-repository Verify narration", () => {
  const map = buildWorkspaceMap([api, web, admin], { workspace: "acme", aliases: [alias] });

  it("names consumers of a changed package and cites both the change and the consumer manifest", () => {
    const statements = buildWorkspaceVerifyNarrative(map, "api", ["packages/client/src/index.ts", "README.md"]);
    expect(statements[0]).toMatchObject({
      classification: "observation",
      text: "web depends on @acme/api-client (declared as acme-client), and this diff changes 1 file in it: packages/client/src/index.ts."
    });
    expect(statements[0]!.evidence).toEqual([
      expect.objectContaining({ kind: "changed-file", path: "packages/client/src/index.ts" }),
      expect.objectContaining({ kind: "cross-repository", path: "package.json" })
    ]);
    expect(statements[1]).toMatchObject({ classification: "inference", text: expect.stringContaining("admin may also be affected indirectly") });
    for (const statement of statements) expect(statement.evidence.length).toBeGreaterThan(0);
  });

  it("says nothing when the diff touches no consumed package or the repository is unknown", () => {
    expect(buildWorkspaceVerifyNarrative(map, "api", ["README.md"])).toEqual([]);
    expect(buildWorkspaceVerifyNarrative(map, "ghost", ["packages/client/src/index.ts"])).toEqual([]);
  });
});

describe("workspace config", () => {
  const base = { workspaceConfigVersion: 1, workspace: "acme", repositories: [{ id: "api", path: "api" }, { id: "web", path: "web" }] };

  it("accepts a valid alias and rejects malformed ones", () => {
    expect(parseWorkspaceConfig({ ...base, aliases: [alias] }).aliases).toEqual([alias]);
    const bad: Array<[unknown, RegExp]> = [
      ["nope", /array/],
      [Array.from({ length: 257 }, () => alias), /at most 256/],
      [[{ ...alias, extra: true }], /unknown field: extra/],
      [[{ ...alias, consumer: "ghost" }], /unknown repository ghost/],
      [[{ ...alias, provider: "web" }], /two different repositories/],
      [[{ ...alias, ecosystem: "cargo" }], /ecosystem/],
      [[{ ...alias, package: "../../etc/passwd" }], /package name/],
      [[{ ...alias, providerPackage: "a b" }], /package name/],
      [[{ ...alias, reason: "" }], /non-blank/],
      [[{ ...alias, reason: "line\nbreak" }], /one line/],
      [[alias, alias], /repeats the alias/]
    ];
    for (const [aliases, message] of bad) expect(() => parseWorkspaceConfig({ ...base, aliases })).toThrow(message);
  });

  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
  });

  it("loads checkouts relative to the config, identifies the current one, and reports missing checkouts", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-workspace-config-"));
    roots.push(root);
    await mkdir(join(root, "api", "packages", "client", "src"), { recursive: true });
    await mkdir(join(root, "web", "src"), { recursive: true });
    await writeFile(join(root, "api", "packages", "client", "package.json"), JSON.stringify({ name: "@acme/api-client" }));
    await writeFile(join(root, "api", "packages", "client", "src", "index.ts"), "export const call = () => 1;\n");
    await writeFile(join(root, "web", "package.json"), JSON.stringify({ name: "web", dependencies: { "acme-client": "^2.0.0" } }));
    await writeFile(join(root, "web", "src", "app.ts"), "export const app = 1;\n");
    const configPath = join(root, "workspace.json");
    await writeFile(configPath, JSON.stringify({ ...base, aliases: [alias] }));

    const loaded = await loadWorkspaceConfig(configPath, { useCache: false });
    expect(loaded.map.dependencies).toHaveLength(1);
    expect(await findWorkspaceRepository(loaded, join(root, "api"))).toBe("api");
    expect(await findWorkspaceRepository(loaded, join(root, "api", "packages"))).toBeUndefined();
    expect(await findWorkspaceRepository(loaded, join(root, "missing"))).toBeUndefined();

    await writeFile(configPath, JSON.stringify({ ...base, repositories: [...base.repositories, { id: "gone", path: "gone" }] }));
    await expect(loadWorkspaceConfig(configPath, { useCache: false })).rejects.toThrow(/gone could not be opened/);
    await writeFile(configPath, "{");
    await expect(loadWorkspaceConfig(configPath)).rejects.toThrow(/Could not read workspace config/);
  }, 30_000);
});
