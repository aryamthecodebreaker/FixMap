import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runChangeScopeCommand } from "../src/change-scope-command.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-change-scope-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "test"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "store", scripts: { test: "node --test" } }));
  await writeFile(join(root, "src", "checkout.js"), "import { pay } from './payments.js'; export const checkout = pay;\n");
  await writeFile(join(root, "src", "payments.js"), "export const pay = true;\n");
  await writeFile(join(root, "test", "checkout.test.js"), "import { checkout } from '../src/checkout.js';\n");
  return root;
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value), now: () => "2026-08-26T00:00:00.000Z" } };
}

describe("fixmap change-scope", () => {
  it("prints deterministic JSON from explicit anchors", async () => {
    const root = await fixture();
    const output = capture();

    expect(await runChangeScopeCommand([
      "--touch", "src/checkout.js",
      "--repo", root,
      "--workspace", "shop",
      "--repository", "store",
      "--format", "json",
      "--no-cache"
    ], output.io)).toBe(0);

    const result = JSON.parse(output.stdout.join("")) as {
      workspace: string;
      selected: Array<{ path: string }>;
      affected: Array<{ path: string }>;
      testRoutes: Array<{ command: string }>;
    };
    expect(result.workspace).toBe("shop");
    expect(result.selected.map((entry) => entry.path)).toEqual(["src/checkout.js"]);
    expect(result.affected.map((entry) => entry.path)).toEqual(expect.arrayContaining(["src/payments.js", "test/checkout.test.js"]));
    expect(result.testRoutes[0]?.command).toBe("npm run test");
    expect(output.stderr).toEqual([]);
  });

  it("writes Markdown and leaves a future addition visibly unresolved", async () => {
    const root = await fixture();
    const path = join(root, "scope.md");
    const output = capture();

    expect(await runChangeScopeCommand([
      "--add=db/migrations/057.sql",
      `--repo=${root}`,
      `--output=${path}`,
      "--no-cache"
    ], output.io)).toBe(0);

    const markdown = await readFile(path, "utf8");
    expect(markdown).toContain("# FixMap Change Scope");
    expect(markdown).toContain("`db/migrations/057.sql`: unresolved");
    expect(markdown).toContain("did not interpret the product meaning");
    expect(output.stdout).toEqual([]);
    expect(await runChangeScopeCommand([
      "--add=db/migrations/057.sql",
      `--repo=${root}`,
      `--output=${path}`,
      "--no-cache"
    ], capture().io)).toBe(0);
  });

  it("refuses to overwrite an ordinary repository file with scope output", async () => {
    const root = await fixture();
    const output = capture();
    expect(await runChangeScopeCommand([
      "--touch", "src/checkout.js",
      "--repo", root,
      "--output", join(root, "src", "checkout.js"),
      "--no-cache"
    ], output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("refuses to overwrite repository file src/checkout.js");
    expect(await readFile(join(root, "src", "checkout.js"), "utf8")).toContain("export const checkout");
  });

  it("rejects missing anchors, unsafe paths, and out-of-range bounds before scanning", async () => {
    const noAnchor = capture();
    const unsafe = capture();
    const bound = capture();
    expect(await runChangeScopeCommand([], noAnchor.io)).toBe(1);
    expect(await runChangeScopeCommand(["--touch", "../outside"], unsafe.io)).toBe(1);
    expect(await runChangeScopeCommand(["--touch", "src", "--depth", "9"], bound.io)).toBe(1);
    expect(noAnchor.stderr.join("")).toContain("requires at least one");
    expect(unsafe.stderr.join("")).toContain("Invalid change-scope path");
    expect(bound.stderr.join("")).toContain("--depth must be an integer from 0 to 8");
  });
});
