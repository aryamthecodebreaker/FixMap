import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { runAnnotationTool } from "../src/annotation-tool.js";

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
