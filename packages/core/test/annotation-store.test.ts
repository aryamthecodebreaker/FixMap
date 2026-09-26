import { mkdtemp, readFile, readdir, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readAnnotationStore, updateAnnotationStore } from "../src/annotation-store.js";
import { addAnnotation, createAnnotation } from "../src/annotations.js";

it("keeps reads non-mutating and releases the lock after rejected updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-store-api-"));
  try {
    expect((await readAnnotationStore(root)).annotations).toEqual([]);
    expect(await readdir(root)).toEqual([]);
    const annotation = createAnnotation({ scope: { kind: "service", name: "auth" }, note: "Reviewed", createdAt: "2026-01-01T00:00:00Z" });
    await updateAnnotationStore(root, (store) => addAnnotation(store, annotation));
    const path = join(root, ".fixmap", "annotations.json");
    const before = await readFile(path, "utf8");
    await expect(updateAnnotationStore(root, () => { throw new Error("review rejected"); })).rejects.toThrow("review rejected");
    expect(await readFile(path, "utf8")).toBe(before);
    expect(await readdir(join(root, ".fixmap"))).toEqual(["annotations.json"]);
    expect((await updateAnnotationStore(root, (store) => store)).annotations).toEqual([annotation]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("rejects a concurrent writer while a mutation owns the lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-store-concurrency-"));
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = updateAnnotationStore(root, async (store) => { entered(); await gate; return store; });
  try {
    await ready;
    const lockPath = join(root, ".fixmap", "annotations.lock");
    const lockBytes = await readFile(lockPath, "utf8");
    // A suspended or slow writer still owns its lock, regardless of age.
    await utimes(lockPath, new Date(0), new Date(0));
    await expect(updateAnnotationStore(root, (store) => store)).rejects.toThrow("update is in progress");
    expect(await readFile(lockPath, "utf8")).toBe(lockBytes);
  } finally {
    release();
    await first;
    await rm(root, { recursive: true, force: true });
  }
});
