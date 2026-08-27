import { link, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCapabilitiesCommand, runCapabilityCommand } from "../src/capability-command.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-capability-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "checkout.js"), "export const checkout = true;\n");
  await writeFile(join(root, "src", "cart.js"), "import { checkout } from './checkout.js'; export { checkout };\n");
  return root;
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value), now: () => "2026-08-26T00:00:00.000Z" } };
}

describe("fixmap capability", () => {
  it("creates, lists, shows, updates, and removes a persistent capability", async () => {
    const root = await fixture();
    const created = capture();
    expect(await runCapabilityCommand([
      "create", "checkout",
      "--name", "Checkout",
      "--touch", "src/checkout.js",
      "--direction", "dependents",
      "--repo", root,
      "--workspace", "shop",
      "--repository", "store"
    ], created.io)).toBe(0);
    expect(created.stdout.join("")).toContain("Created capability checkout");

    const stored = JSON.parse(await readFile(join(root, ".fixmap", "capabilities.json"), "utf8"));
    expect(stored).toMatchObject({
      capabilityStoreVersion: 1,
      workspace: "shop",
      repository: "store",
      capabilities: [{ id: "checkout", name: "Checkout" }]
    });
    expect(stored.capabilities[0]).not.toHaveProperty("affected");
    expect(stored.capabilities[0]).not.toHaveProperty("discoveredFiles");

    const listed = capture();
    expect(await runCapabilitiesCommand(["--repo", root], listed.io)).toBe(0);
    expect(listed.stdout.join("")).toContain("**Checkout** (`checkout`)");
    expect(listed.stdout.join("")).toContain("Source: `.fixmap/capabilities.json`");

    const shown = capture();
    expect(await runCapabilityCommand(["checkout", "--repo", root, "--format", "json", "--no-cache"], shown.io)).toBe(0);
    const map = JSON.parse(shown.stdout.join(""));
    expect(map.scope.selected.map((entry: { path: string }) => entry.path)).toEqual(["src/checkout.js"]);
    expect(map.scope.affected.map((entry: { path: string }) => entry.path)).toEqual(["src/cart.js"]);

    const outputPath = join(root, "capability-map.json");
    expect(await runCapabilityCommand(["checkout", "--repo", root, "--format", "json", "--output", outputPath, "--no-cache"], capture().io)).toBe(0);
    expect(await runCapabilityCommand(["checkout", "--repo", root, "--format", "json", "--output", outputPath, "--no-cache"], capture().io)).toBe(0);

    const updated = capture();
    expect(await runCapabilityCommand([
      "update", "checkout", "--name", "Checkout flow", "--depth", "4", "--repo", root
    ], updated.io)).toBe(0);
    const updatedStore = JSON.parse(await readFile(join(root, ".fixmap", "capabilities.json"), "utf8"));
    expect(updatedStore.capabilities[0]).toMatchObject({
      name: "Checkout flow",
      anchors: [{ operation: "touch", path: "src/checkout.js" }],
      traversal: { direction: "dependents", maxDepth: 4 }
    });

    const removed = capture();
    expect(await runCapabilityCommand(["remove", "checkout", "--repo", root], removed.io)).toBe(0);
    expect(JSON.parse(await readFile(join(root, ".fixmap", "capabilities.json"), "utf8")).capabilities).toEqual([]);
  });

  it("refuses duplicates, unknown updates, active locks, and unsafe stores", async () => {
    const root = await fixture();
    const first = capture();
    expect(await runCapabilityCommand(["create", "checkout", "--touch", "src/checkout.js", "--repo", root], first.io)).toBe(0);

    const duplicate = capture();
    expect(await runCapabilityCommand(["create", "checkout", "--touch", "src/checkout.js", "--repo", root], duplicate.io)).toBe(1);
    expect(duplicate.stderr.join("")).toContain("already exists");

    const missing = capture();
    expect(await runCapabilityCommand(["update", "search", "--name", "Search", "--repo", root], missing.io)).toBe(1);
    expect(missing.stderr.join("")).toContain("does not exist");

    const noChange = capture();
    expect(await runCapabilityCommand(["update", "checkout", "--repo", root], noChange.io)).toBe(1);
    expect(noChange.stderr.join("")).toContain("requires a name, anchor, direction, depth, or node-bound change");

    await writeFile(join(root, ".fixmap", "capabilities.lock"), "busy\n");
    const locked = capture();
    expect(await runCapabilityCommand(["update", "checkout", "--name", "Locked", "--repo", root], locked.io)).toBe(1);
    expect(locked.stderr.join("")).toContain("update is in progress");
  });

  it("refuses to overwrite an ordinary repository file with capability output", async () => {
    const root = await fixture();
    expect(await runCapabilityCommand(["create", "checkout", "--touch", "src/checkout.js", "--repo", root], capture().io)).toBe(0);
    const output = capture();
    expect(await runCapabilityCommand([
      "checkout", "--repo", root, "--output", join(root, "src", "checkout.js"), "--no-cache"
    ], output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("refuses to overwrite repository file src/checkout.js");
  });

  it("refuses a capability directory that resolves outside the repository", async () => {
    const root = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "fixmap-capability-outside-"));
    await symlink(outside, join(root, ".fixmap"), process.platform === "win32" ? "junction" : "dir");
    const output = capture();

    expect(await runCapabilityCommand(["create", "checkout", "--touch", "src/checkout.js", "--repo", root], output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("resolves outside the repository");
    await expect(readFile(join(outside, "capabilities.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to overwrite a hard-linked capability store", async () => {
    const root = await fixture();
    const first = capture();
    expect(await runCapabilityCommand(["create", "checkout", "--touch", "src/checkout.js", "--repo", root], first.io)).toBe(0);
    await link(join(root, ".fixmap", "capabilities.json"), join(root, "capabilities-copy.json"));
    const output = capture();

    expect(await runCapabilityCommand(["update", "checkout", "--name", "Changed", "--repo", root], output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("hard-linked");
  });
});
