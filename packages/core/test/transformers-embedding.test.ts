import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalTransformersEmbeddingProvider } from "../src/transformers-embedding.js";

async function modelDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-local-model-"));
  await writeFile(join(root, "config.json"), JSON.stringify({ hidden_size: 2 }));
  await writeFile(join(root, "tokenizer.json"), "fixture tokenizer");
  return root;
}

describe("createLocalTransformersEmbeddingProvider", () => {
  it("hashes a local model and forces local-only normalized feature extraction", async () => {
    const root = await modelDirectory();
    const calls: unknown[][] = [];
    const env = { version: "4.2.0-test", allowRemoteModels: true };
    const provider = await createLocalTransformersEmbeddingProvider({
      modelPath: root,
      modelId: "fixture/model",
      runtimeLoader: async () => ({
        env,
        pipeline: async (...args: unknown[]) => {
          calls.push(args);
          return async (...extractArgs: unknown[]) => {
            calls.push(extractArgs);
            return { dims: [2, 2], data: new Float32Array([1, 0, 0, 1]) };
          };
        }
      })
    });

    const vectors = await provider.embed(["query", "document"], { signal: new AbortController().signal });

    expect(env.allowRemoteModels).toBe(false);
    expect(provider).toMatchObject({
      model: "fixture/model",
      dimensions: 2,
      normalization: "l2",
      local: true,
      runtime: "@huggingface/transformers/4.2.0-test"
    });
    expect(provider.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[0]).toEqual(["feature-extraction", expect.any(String), { local_files_only: true }]);
    expect(calls[1]).toEqual([["query", "document"], { pooling: "mean", normalize: true }]);
    expect(vectors).toEqual([[1, 0], [0, 1]]);
  });

  it("changes provenance when any model artifact changes", async () => {
    const root = await modelDirectory();
    const runtimeLoader = async () => ({ env: { version: "test", allowRemoteModels: true }, pipeline: async () => async () => ({}) });
    const before = await createLocalTransformersEmbeddingProvider({ modelPath: root, runtimeLoader });
    await writeFile(join(root, "tokenizer.json"), "changed tokenizer");
    const after = await createLocalTransformersEmbeddingProvider({ modelPath: root, runtimeLoader });

    expect(after.artifactHash).not.toBe(before.artifactHash);
  });

  it("rejects model bundles that can escape through symbolic links", async () => {
    const root = await modelDirectory();
    const { symlink } = await import("node:fs/promises");
    await symlink(join(root, "config.json"), join(root, "linked-config.json"));

    await expect(createLocalTransformersEmbeddingProvider({
      modelPath: root,
      runtimeLoader: async () => ({ env: { allowRemoteModels: true }, pipeline: async () => async () => ({}) })
    })).rejects.toThrow("symbolic link");
  });
});
