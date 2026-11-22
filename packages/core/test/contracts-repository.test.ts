import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { contractSourcesFromRepo } from "../src/contracts.js";
import { compareContractRefs, inventoryContractsAtRef, inventoryWorkingTreeContracts } from "../src/contracts-repository.js";
import { scanRepo } from "../src/repo-scan.js";
import { parseYamlSubset, YamlSubsetError } from "../src/yaml-subset.js";

const exec = promisify(execFile);
const GIT_TEST_TIMEOUT = process.platform === "win32" ? 60_000 : 20_000;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

async function repository(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-contracts-core-"));
  roots.push(root);
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await exec("git", ["add", "-A"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
  return root;
}

describe("YAML subset reader", () => {
  it("reads block, flow, quoted, and block-scalar values like JSON would", () => {
    expect(parseYamlSubset([
      "---",
      "a: 1",
      "b: '2'",
      "c: \"x\\ty\"",
      "d: [1, two, {e: true}]",
      "f:",
      "- g: null",
      "  h: ~",
      "- plain text",
      "i: |-",
      "  line one",
      "  # kept",
      "j: >",
      "  folded",
      "  text",
      "k: it's fine # comment",
      "l: 'it''s'",
      "m: a",
      "  continued",
      ""
    ].join("\n"))).toEqual({
      a: 1, b: "2", c: "x\ty", d: [1, "two", { e: true }],
      f: [{ g: null, h: null }, "plain text"],
      i: "line one\n# kept", j: "folded text\n", k: "it's fine", l: "it's", m: "a continued"
    });
  });

  it("refuses constructs it cannot represent faithfully", () => {
    for (const content of ["a: &x 1\nb: *x\n", "a: !!str 1\n", "<<: {a: 1}\n", "a: 1\na: 2\n", "a:\n\tb: 1\n", "a: [1, 2\n", "a: 1\n---\nb: 2\n"]) {
      expect(() => parseYamlSubset(content)).toThrow(YamlSubsetError);
    }
  });
});

describe("repository contract sources", () => {
  it("reports scanner-unsampled contracts as incomplete instead of empty surfaces", async () => {
    const root = await repository({ "schema.graphql": "type Query { ok: Boolean }\n", "user.proto": "message User { string id = 1; }\n" });
    const repo = await scanRepo({ repoRoot: root, useCache: false });
    const discovered = contractSourcesFromRepo(repo);
    expect(discovered.sources).toEqual([]);
    expect(discovered.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(["schema.graphql", "user.proto"]);

    const inventory = await inventoryWorkingTreeContracts(repo);
    expect(inventory.surfaces.map((surface) => [surface.path, surface.entries.length > 0])).toEqual([["schema.graphql", true], ["user.proto", true]]);
  }, GIT_TEST_TIMEOUT);

  it("reports oversized or non-UTF-8 contracts as unread on both sides", async () => {
    const root = await repository({
      "big.graphql": `type Query { ok: Boolean }\n${"# padding\n".repeat(260_000)}`,
      "binary.proto": Buffer.from([0xff, 0xfe, 0x00, 0x01]),
      "config.yaml": "name: not a contract\n"
    });
    const working = await inventoryWorkingTreeContracts(await scanRepo({ repoRoot: root, useCache: false }));
    const atRef = await inventoryContractsAtRef({ repoRoot: root, ref: "HEAD" });
    for (const inventory of [working, atRef.inventory]) {
      expect(inventory.surfaces).toEqual([]);
      expect(inventory.diagnostics.map((diagnostic) => [diagnostic.path, diagnostic.code])).toEqual([
        ["big.graphql", "contract-source-incomplete"],
        ["binary.proto", "contract-source-incomplete"]
      ]);
    }
  }, GIT_TEST_TIMEOUT);

  it("finds content-marked OpenAPI files at a ref and rejects unknown refs", async () => {
    const root = await repository({ "specs/users-api.yml": "openapi: 3.0.3\npaths:\n  /users:\n    get: {}\n" });
    const atRef = await inventoryContractsAtRef({ repoRoot: root, ref: "HEAD" });
    expect(atRef.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(atRef.inventory.surfaces).toEqual([expect.objectContaining({ kind: "openapi", path: "specs/users-api.yml", version: "3.0.3" })]);
    await expect(compareContractRefs({ repoRoot: root, fromRef: "HEAD", toRef: "missing-ref" })).rejects.toThrow("Could not resolve Git ref");
  }, GIT_TEST_TIMEOUT);
});
