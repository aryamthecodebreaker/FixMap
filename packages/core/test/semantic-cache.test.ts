import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withPersistentEmbeddingCache } from "../src/semantic-cache.js";
import type { EmbeddingProvider } from "../src/semantic.js";

function provider(calls: string[][], artifactHash = "a".repeat(64)): EmbeddingProvider {
  return {
    id: "fixture",
    version: "1",
    model: "tiny",
    artifactHash,
    runtime: "fixture/1",
    dimensions: 2,
    normalization: "l2",
    local: true,
    async embed(texts) {
      calls.push([...texts]);
      return texts.map((text) => text.includes("session") ? [1, 0] : [0, 1]);
    }
  };
}

describe("withPersistentEmbeddingCache", () => {
  it("embeds only misses and reuses vectors across wrapper instances", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fixmap-semantic-repo-"));
    const cacheRoot = await mkdtemp(join(tmpdir(), "fixmap-semantic-cache-"));
    const calls: string[][] = [];
    const first = await withPersistentEmbeddingCache(provider(calls), { repositoryRoot, cacheRoot });
    await first.embed(["session document", "account document"], { signal: new AbortController().signal });
    const second = await withPersistentEmbeddingCache(provider(calls), { repositoryRoot, cacheRoot });
    const vectors = await second.embed(["session document", "new document"], { signal: new AbortController().signal });

    expect(calls).toEqual([["session document", "account document"], ["new document"]]);
    expect(vectors).toEqual([[1, 0], [0, 1]]);
    expect((await readdir(cacheRoot)).filter((name) => name.endsWith(".json"))).toHaveLength(1);
  });

  it("isolates caches by model artifact and heals corrupt JSON", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fixmap-semantic-repo-"));
    const cacheRoot = await mkdtemp(join(tmpdir(), "fixmap-semantic-cache-"));
    const calls: string[][] = [];
    const first = await withPersistentEmbeddingCache(provider(calls), { repositoryRoot, cacheRoot });
    await first.embed(["session"], { signal: new AbortController().signal });
    const firstPath = join(cacheRoot, (await readdir(cacheRoot))[0]!);
    await writeFile(firstPath, "{broken");
    const healed = await withPersistentEmbeddingCache(provider(calls), { repositoryRoot, cacheRoot });
    await healed.embed(["session"], { signal: new AbortController().signal });
    const changedModel = await withPersistentEmbeddingCache(provider(calls, "b".repeat(64)), { repositoryRoot, cacheRoot });
    await changedModel.embed(["session"], { signal: new AbortController().signal });

    expect(calls).toEqual([["session"], ["session"], ["session"]]);
    expect((await readdir(cacheRoot)).filter((name) => name.endsWith(".json"))).toHaveLength(2);
  });

  it("refuses a cache inside the scanned repository", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fixmap-semantic-repo-"));
    await expect(withPersistentEmbeddingCache(provider([]), {
      repositoryRoot,
      cacheRoot: join(repositoryRoot, ".fixmap-cache")
    })).rejects.toThrow("outside the scanned repository");
  });
});
