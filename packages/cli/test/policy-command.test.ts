import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArchitecturePolicy } from "@aryam/fixmap-core";
import { runCli } from "../src/cli-runner.js";
import { checkPolicyText } from "../src/policy-command.js";

const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } };
}

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-policy-"));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const layout = {
  "src/ui/view.ts": "import { query } from '../db/query';\nexport const view = query;\n",
  "src/db/query.ts": "export const query = 1;\n",
  "src/ui/view.test.ts": "import { view } from './view';\ntest('v', () => view);\n",
  "packages/client/src/index.ts": "export const client = 1;\n",
  "packages/client/test/index.test.ts": "test('c', () => 1);\n",
  "scripts/build.ts": "export const build = 1;\n",
  "specs/users-api.yml": "openapi: 3.0.3\npaths:\n  /users:\n    get: {}\n"
};

describe("fixmap policy", () => {
  it("init writes a valid starter from the module layout and never overwrites", async () => {
    const root = await repository(layout);
    const first = output();
    expect(await runCli(["policy", "init", "--repo", root], first.io)).toBe(0);
    const text = await readFile(join(root, ".fixmap", "policy.json"), "utf8");
    const policy = parseArchitecturePolicy({ path: ".fixmap/policy.json", content: text, fingerprint: "x" });
    expect(policy.requiredTests.map((rule) => rule.paths[0])).toEqual(["packages/client/**", "src/**"]);
    expect(policy.contracts).toEqual([expect.objectContaining({ id: "public-contracts", paths: ["specs/users-api.yml"], forbidBreaking: true, severity: "warning" })]);
    expect(policy.boundaries).toEqual([]);
    expect(first.stdout.join("")).toContain("fixmap policy check");

    await writeFile(join(root, ".fixmap", "policy.json"), "{ \"mine\": true }\n");
    const second = output();
    expect(await runCli(["policy", "init", "--repo", root], second.io)).toBe(1);
    expect(second.stderr.join("")).toMatch(/never overwrites/);
    expect(await readFile(join(root, ".fixmap", "policy.json"), "utf8")).toBe("{ \"mine\": true }\n");
  }, TIMEOUT);

  it("check points at each problem with a JSON pointer and exits 1", async () => {
    const root = await repository({
      ".fixmap/policy.json": JSON.stringify({
        architecturePolicyVersion: 1,
        boundary: [],
        boundaries: [
          { id: "ok", from: ["src/ui/**"], deny: ["src/db/**"], reason: "UI uses the API.", severity: "error" },
          { id: "Bad Id", from: ["src/**"], deny: ["x/**"], reason: "r", severity: "error" },
          { id: "dots", from: ["../outside/**"], deny: ["x/**"], reason: "r", severity: "error", sevrity: "x" }
        ],
        contracts: [{ id: "c", paths: ["specs/**"], forbidBreaking: "yes", reason: "r", severity: "warning" }]
      })
    });
    const capture = output();
    expect(await runCli(["policy", "check", "--repo", root, "--format", "json"], capture.io)).toBe(1);
    const result = JSON.parse(capture.stdout.join(""));
    expect(result).toMatchObject({ policyCheckVersion: 1, valid: false, ruleCount: 4 });
    expect(result.errors.map((entry: { pointer: string }) => entry.pointer)).toEqual(["/boundaries/1", "/boundaries/2", "/contracts/0"]);
    expect(result.errors[0].message).toMatch(/boundaries\[1\] has an invalid id/);
    expect(result.warnings.map((entry: { pointer: string }) => entry.pointer)).toEqual(["/boundary", "/boundaries/2/sevrity"]);

    const markdown = output();
    expect(await runCli(["policy", "check", "--repo", root], markdown.io)).toBe(1);
    expect(markdown.stdout.join("")).toContain("- `/contracts/0` contracts[0].forbidBreaking must be boolean.");
  }, TIMEOUT);

  it("check reports JSON syntax, duplicate ids, empty policies, and a missing file", () => {
    expect(checkPolicyText("{", "p").errors[0]).toMatchObject({ pointer: "", message: expect.stringMatching(/Not valid JSON/) });
    expect(checkPolicyText("[]", "p").errors[0]!.message).toMatch(/JSON object/);
    expect(checkPolicyText(JSON.stringify({ architecturePolicyVersion: 2 }), "p").errors[0]!.pointer).toBe("/architecturePolicyVersion");
    const duplicate = { id: "same", paths: ["src/**"], reviewers: ["team"], reason: "r" };
    expect(checkPolicyText(JSON.stringify({ architecturePolicyVersion: 1, requiredReviews: [duplicate, duplicate] }), "p").errors)
      .toEqual([{ pointer: "", message: "Duplicate architecture policy rule id: same" }]);
    expect(checkPolicyText(JSON.stringify({ architecturePolicyVersion: 1 }), "p")).toMatchObject({ valid: true, warnings: [expect.objectContaining({ message: expect.stringMatching(/no rules/) })] });
  });

  it("explain describes a rule and the files it covers now", async () => {
    const root = await repository({
      ...layout,
      ".fixmap/policy.json": JSON.stringify({
        architecturePolicyVersion: 1,
        boundaries: [{ id: "ui-no-db", from: ["src/ui/**"], deny: ["src/db/**"], reason: "UI uses the API.", severity: "error" }],
        contracts: [{ id: "api", paths: ["specs/**"], forbidBreaking: true, reason: "Clients pin it.", severity: "error", allowBreaking: [{ path: "specs/users-api.yml", reason: "Deprecated." }] }]
      })
    });
    const boundary = output();
    expect(await runCli(["policy", "explain", "ui-no-db", "--repo", root, "--format", "json"], boundary.io)).toBe(0);
    expect(JSON.parse(boundary.stdout.join(""))).toMatchObject({
      id: "ui-no-db",
      kind: "boundary",
      severity: "error",
      coveredFiles: { count: 2, sample: ["src/ui/view.test.ts", "src/ui/view.ts"] },
      currentViolations: 1
    });
    const contract = output();
    expect(await runCli(["policy", "explain", "api", "--repo", root], contract.io)).toBe(0);
    expect(contract.stdout.join("")).toContain("- path `specs/users-api.yml`: Deprecated.");

    const unknown = output();
    expect(await runCli(["policy", "explain", "nope", "--repo", root], unknown.io)).toBe(1);
    expect(unknown.stderr.join("")).toContain("Rules in this policy: ui-no-db, api.");
  }, TIMEOUT);

  it("rejects bad arguments and explains a missing policy", async () => {
    const root = await repository({ "src/a.ts": "export const a = 1;\n" });
    const cases: Array<[string[], RegExp]> = [
      [["policy"], /Usage: fixmap policy init/],
      [["policy", "make"], /Unknown policy action/],
      [["policy", "explain"], /requires a rule id/],
      [["policy", "init", "--format", "json"], /Unknown policy init option/],
      [["policy", "check", "--format", "yaml"], /markdown or json/],
      [["policy", "check", "--repo", root, "--repo", root], /only once/],
      [["policy", "check", "--repo", root], /Create one with: fixmap policy init/]
    ];
    for (const [args, message] of cases) {
      const capture = output();
      expect(await runCli(args, capture.io)).toBe(1);
      expect(capture.stderr.join("")).toMatch(message);
    }
  }, TIMEOUT);
});
