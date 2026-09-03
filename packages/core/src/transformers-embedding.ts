import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import type { EmbeddingProvider } from "./semantic.js";

type FeatureExtractionOutput = {
  data?: ArrayLike<number>;
  dims?: number[];
  tolist?: () => unknown;
};

type FeatureExtractor = (
  texts: readonly string[],
  options: { pooling: "mean"; normalize: true }
) => Promise<FeatureExtractionOutput>;

type TransformersRuntime = {
  env: { version?: string; allowRemoteModels: boolean };
  pipeline: (
    task: "feature-extraction",
    model: string,
    options: { local_files_only: true }
  ) => Promise<FeatureExtractor>;
};

export type LocalTransformersEmbeddingOptions = {
  /** A complete Transformers.js-compatible model directory already present on disk. */
  modelPath: string;
  /** Stable human-readable model identity; defaults to the directory name. */
  modelId?: string;
  /** Test/host injection. Ordinary callers leave this unset. */
  runtimeLoader?: () => Promise<unknown>;
};

/**
 * Creates an on-device embedding provider from an existing model directory. The adapter
 * deliberately has no Transformers.js package dependency: hosts opt into a runtime they
 * have independently audited. Loading is forced to local-files-only and never downloads a
 * model. The complete bundle is hashed before use so semantic caches cannot cross models.
 */
export async function createLocalTransformersEmbeddingProvider(
  options: LocalTransformersEmbeddingOptions
): Promise<EmbeddingProvider> {
  const modelRoot = await validateModelRoot(options.modelPath);
  const dimensions = await readModelDimensions(modelRoot);
  const artifactHash = await hashModelDirectory(modelRoot);
  const runtime = validateRuntime(await (options.runtimeLoader ?? loadTransformersRuntime)());
  runtime.env.allowRemoteModels = false;
  let extractor: FeatureExtractor | undefined;

  return {
    id: "transformers-local",
    version: "1",
    model: options.modelId?.trim() || basename(modelRoot),
    artifactHash,
    runtime: `@huggingface/transformers/${runtime.env.version?.trim() || "unknown"}`,
    dimensions,
    normalization: "l2",
    local: true,
    async embed(texts, { signal }) {
      if (signal.aborted) throw new Error("local embedding was aborted before inference");
      extractor ??= await runtime.pipeline("feature-extraction", modelRoot, { local_files_only: true });
      if (signal.aborted) throw new Error("local embedding was aborted while loading the model");
      const output = await extractor(texts, { pooling: "mean", normalize: true });
      if (signal.aborted) throw new Error("local embedding was aborted during inference");
      return vectorsFromOutput(output, texts.length, dimensions);
    }
  };
}

async function loadTransformersRuntime(): Promise<unknown> {
  const packageName = "@huggingface/transformers";
  try {
    return await import(packageName);
  } catch (error) {
    throw new Error(
      "Local semantic retrieval needs a host-installed @huggingface/transformers runtime. " +
      `FixMap does not install it automatically because its current dependency tree fails FixMap's security audit: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function validateRuntime(candidate: unknown): TransformersRuntime {
  if (!isRecord(candidate) || !isRecord(candidate.env) || typeof candidate.pipeline !== "function") {
    throw new Error("The loaded Transformers.js runtime does not expose env and pipeline.");
  }
  return candidate as TransformersRuntime;
}

async function validateModelRoot(path: string): Promise<string> {
  const root = await realpath(resolve(path));
  const stats = await lstat(root);
  if (!stats.isDirectory()) throw new Error(`Local embedding model is not a directory: ${root}`);
  return root;
}

async function readModelDimensions(root: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolve(root, "config.json"), "utf8"));
  } catch (error) {
    throw new Error(`Could not read local embedding model config.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) throw new Error("Local embedding model config.json is not an object.");
  const dimensions = [parsed.hidden_size, parsed.d_model, parsed.dim]
    .find((value): value is number => Number.isSafeInteger(value) && Number(value) > 0);
  if (dimensions === undefined || dimensions > 65_536) {
    throw new Error("Local embedding model config.json does not declare a supported hidden_size, d_model, or dim.");
  }
  return dimensions;
}

async function hashModelDirectory(root: string): Promise<string> {
  const paths = await listModelFiles(root);
  if (paths.length === 0) throw new Error("Local embedding model directory is empty.");
  const hash = createHash("sha256");
  for (const path of paths) {
    const relativePath = relative(root, path).replace(/\\/g, "/");
    const stats = await lstat(path);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(String(stats.size));
    hash.update("\0");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function listModelFiles(root: string, directory = root, found: string[] = []): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Local embedding model contains a symbolic link: ${relative(root, path)}`);
    if (entry.isDirectory()) await listModelFiles(root, path, found);
    else if (entry.isFile()) found.push(path);
    if (found.length > 10_000) throw new Error("Local embedding model contains more than 10,000 files.");
  }
  return found;
}

function vectorsFromOutput(output: FeatureExtractionOutput, count: number, dimensions: number): number[][] {
  const listed = output.tolist?.();
  if (Array.isArray(listed) && listed.length === count && listed.every(Array.isArray)) {
    return listed.map((vector) => Array.from(vector as unknown[], Number));
  }
  if (output.data && output.dims?.at(-1) === dimensions && output.data.length === count * dimensions) {
    const values = Array.from(output.data, Number);
    return Array.from({ length: count }, (_unused, index) =>
      values.slice(index * dimensions, (index + 1) * dimensions)
    );
  }
  throw new Error(`Transformers.js returned an unexpected feature-extraction tensor for ${count} text(s).`);
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
