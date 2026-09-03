import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAnnotationStore } from "@aryam/fixmap-core";
import { runAnnotateCommand } from "../src/annotation-command.js";
import { runCli } from "../src/cli-runner.js";

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text), now: () => new Date("2026-08-21T10:00:00Z") } };
}

describe("fixmap annotate", () => {
  it("atomically creates a reviewable file annotation store", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-annotate-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "token.ts"), "export const token = true;\n");
    const capture = output();
    const code = await runAnnotateCommand([
      "src/token.ts", "--note", "Do not refactor; external contract", "--owner", "platform", "--repo", root
    ], capture.io);
    expect(code).toBe(0);
    const store = validateAnnotationStore(JSON.parse(await readFile(join(root, ".fixmap", "annotations.json"), "utf8")) as unknown);
    expect(store.annotations).toContainEqual(expect.objectContaining({
      scope: { kind: "file", path: "src/token.ts" },
      note: "Do not refactor; external contract",
      owner: "platform"
    }));
    expect(capture.stderr).toEqual([]);
  });

  it("lists and removes annotations by stable identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-annotate-remove-"));
    const capture = output();
    expect(await runAnnotateCommand(["--service", "auth", "--note", "Owned by identity", "--repo", root], capture.io)).toBe(0);
    const store = validateAnnotationStore(JSON.parse(await readFile(join(root, ".fixmap", "annotations.json"), "utf8")) as unknown);
    const id = store.annotations[0]!.id;
    const listed = output();
    expect(await runAnnotateCommand(["--list", "--format", "json", "--repo", root], listed.io)).toBe(0);
    expect(listed.stdout.join("")).toContain(id);
    expect(await runAnnotateCommand(["--remove", id, "--repo", root], output().io)).toBe(0);
    const empty = validateAnnotationStore(JSON.parse(await readFile(join(root, ".fixmap", "annotations.json"), "utf8")) as unknown);
    expect(empty.annotations).toEqual([]);
  });

  it("rejects traversal and does not create a store", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-annotate-safe-"));
    const capture = output();
    expect(await runAnnotateCommand(["../outside.ts", "--note", "No", "--repo", root], capture.io)).toBe(1);
    expect(capture.stderr.join("")).toContain("inside the repository");
  });

  it("preserves a valid store when a duplicate is rejected", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-annotate-duplicate-"));
    const args = ["--service", "auth", "--note", "Stable", "--repo", root];
    expect(await runAnnotateCommand(args, output().io)).toBe(0);
    const before = await readFile(join(root, ".fixmap", "annotations.json"), "utf8");
    expect(await runAnnotateCommand(args, output().io)).toBe(1);
    expect(await readFile(join(root, ".fixmap", "annotations.json"), "utf8")).toBe(before);
  });

  it("surfaces a CLI-created annotation in a real plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-annotate-plan-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "auth.ts"), "export function authenticate() { return true; }\n");
    const add = output();
    expect(await runCli([
      "annotate", "src/auth.ts", "--note", "External identity contract; preserve behavior", "--repo", root
    ], add.io)).toBe(0);
    const plan = output();
    expect(await runCli(["plan", "--issue", "authenticate users", "--repo", root, "--no-cache"], plan.io)).toBe(0);
    expect(plan.stdout.join("")).toContain("## Human Intent");
    expect(plan.stdout.join("")).toContain("External identity contract; preserve behavior");
  });
});
