import { mkdtemp, readFile, rm, writeFile, mkdir, symlink, link } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { runAnnotationTool } from "../src/annotation-tool.js";

it("preserves explicit symbol, service and contract scopes with owner and expiry", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-scopes-"));
  try {
    await writeFile(join(root, "auth.ts"), "export function authenticate() {}\n");
    const cases = [
      { fields: { target: "auth.ts", symbol: "authenticate" }, scope: { kind: "symbol", path: "auth.ts", symbol: "authenticate" } },
      { fields: { service: "auth" }, scope: { kind: "service", name: "auth" } },
      { fields: { contract: "AuthAPI" }, scope: { kind: "contract", name: "AuthAPI" } },
      { fields: { target: "auth.ts", contract: "AuthAPI" }, scope: { kind: "contract", name: "AuthAPI", path: "auth.ts" } }
    ];
    for (const entry of cases) {
      const result = await runAnnotationTool({ action: "add", ...entry.fields, note: "Reviewed constraint", owner: "platform", expires: "2099-01-01T00:00:00Z" }, root);
      expect(result.isError).toBeUndefined();
    }
    const path = join(root, ".fixmap", "annotations.json");
    const before = await readFile(path, "utf8");
    const store = JSON.parse(before);
    expect(store.annotations).toHaveLength(4);
    for (const entry of cases) expect(store.annotations).toEqual(expect.arrayContaining([expect.objectContaining({
      scope: entry.scope, owner: "platform", expiresAt: "2099-01-01T00:00:00.000Z"
    })]));
    for (const fields of [
      { symbol: "authenticate" },
      { target: "auth.ts", service: "auth" },
      { service: "auth", contract: "AuthAPI" },
      { target: "../outside.ts" },
      { service: "auth", expires: "2000-01-01T00:00:00Z" }
    ]) {
      expect((await runAnnotationTool({ action: "add", note: "must not persist", ...fields }, root)).isError).toBe(true);
      expect(await readFile(path, "utf8")).toBe(before);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("refuses hard-linked annotation stores without changing the external file", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-hardlink-"));
  try {
    const repo = join(root, "repo");
    await mkdir(join(repo, ".fixmap"), { recursive: true });
    const outside = join(root, "external.json");
    const original = '{"annotationStoreVersion":1,"annotations":[]}\n';
    await writeFile(outside, original);
    await link(outside, join(repo, ".fixmap", "annotations.json"));
    expect((await runAnnotationTool({ action: "list" }, repo)).isError).toBe(true);
    expect((await runAnnotationTool({ action: "add", service: "auth", note: "no external writes" }, repo)).isError).toBe(true);
    expect(await readFile(outside, "utf8")).toBe(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("refuses an annotation store redirected outside the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-link-"));
  const repo = join(root, "repo");
  const outside = join(root, "outside");
  try {
    await mkdir(repo); await mkdir(outside);
    const path = join(outside, "annotations.json");
    const original = '{"annotationStoreVersion":1,"annotations":[]}\n';
    await writeFile(path, original);
    await symlink(outside, join(repo, ".fixmap"), process.platform === "win32" ? "junction" : "dir");
    expect((await runAnnotationTool({ action: "list" }, repo)).isError).toBe(true);
    expect((await runAnnotationTool({ action: "add", service: "auth", note: "do not write outside" }, repo)).isError).toBe(true);
    expect(await readFile(path, "utf8")).toBe(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("adds, lists and removes annotations through the shared local store", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-tool-"));
  try {
    await writeFile(join(root, "auth.ts"), "export const auth = true;\n");
    const added = await runAnnotationTool({ action: "add", target: "auth.ts", note: "--remove=not-an-option" }, root);
    expect(added.isError).toBeUndefined();
    const store = JSON.parse(await readFile(join(root, ".fixmap", "annotations.json"), "utf8"));
    expect(store.annotations[0].note).toBe("--remove=not-an-option");
    const listed = await runAnnotationTool({ action: "list" }, root);
    expect(JSON.parse(listed.content[0]!.text)).toEqual(store);
    const rejected = await runAnnotationTool({ action: "remove", id: store.annotations[0].id, note: "ambiguous" }, root);
    expect(rejected.isError).toBe(true);
    expect(JSON.parse(await readFile(join(root, ".fixmap", "annotations.json"), "utf8"))).toEqual(store);
    expect((await runAnnotationTool({ action: "remove", id: store.annotations[0].id }, root)).isError).toBeUndefined();
    expect(JSON.parse((await runAnnotationTool({ action: "list" }, root)).content[0]!.text).annotations).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each([{}, { action: "remove" }, { action: "add" }, { action: "list", repo: "ftp://example.com" }, { action: "add", target: "--list", note: "bad" }])("rejects invalid requests before accessing a store: %j", async (args) => {
  expect((await runAnnotationTool(args, "nonexistent-fixture-root")).isError).toBe(true);
});
