import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { EmbeddingProvider } from "./semantic.js";

type CachedVector = { vector: number[]; lastUsedAt: string };
type SemanticCacheFile = {
  version: 1;
  providerKey: string;
  entries: Record<string, CachedVector>;
};

export type PersistentEmbeddingCacheOptions = {
  repositoryRoot: string;
  cacheRoot?: string;
  maxEntries?: number;
};

const CACHE_VERSION = 1;
const DEFAULT_MAX_ENTRIES = 50_000;

/** Wraps an embedding provider with an atomic, model-isolated, local persistent cache. */
export async function withPersistentEmbeddingCache(
  provider: EmbeddingProvider,
  options: PersistentEmbeddingCacheOptions
): Promise<EmbeddingProvider> {
  const repositoryRoot = await realpath(resolve(options.repositoryRoot));
  const cacheRoot = resolve(options.cacheRoot ?? configuredSemanticCacheRoot());
  if (samePath(repositoryRoot, cacheRoot) || isContained(repositoryRoot, cacheRoot)) {
    throw new Error("Semantic cache must be outside the scanned repository so derived vectors cannot enter ranking or version control.");
  }
  const providerKey = embeddingProviderKey(provider);
  const cachePath = join(cacheRoot, `${hashText(repositoryRoot)}-${hashText(providerKey)}-semantic-v1.json`);
  const maxEntries = positiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
  let cachePromise: Promise<SemanticCacheFile> | undefined;
  let writeQueue = Promise.resolve();

  async function load(): Promise<SemanticCacheFile> {
    cachePromise ??= readCache(cachePath, providerKey, provider.dimensions);
    return cachePromise;
  }

  return {
    ...provider,
    async embed(texts, context) {
      const cache = await load();
      const now = new Date().toISOString();
      const keys = texts.map((text) => hashText(text));
      const output: Array<number[] | undefined> = keys.map((key) => {
        const hit = cache.entries[key];
        if (!hit) return undefined;
        hit.lastUsedAt = now;
        return [...hit.vector];
      });
      const missingIndexes = output.flatMap((vector, index) => vector ? [] : [index]);
      if (missingIndexes.length > 0) {
        const missingTexts = missingIndexes.map((index) => texts[index]!);
        const generated = await provider.embed(missingTexts, context);
        if (generated.length !== missingTexts.length) {
          throw new Error(`embedding provider returned ${generated.length} vectors for ${missingTexts.length} cache misses`);
        }
        generated.forEach((vector, generatedIndex) => {
          const originalIndex = missingIndexes[generatedIndex]!;
          const copied = Array.from(vector);
          output[originalIndex] = copied;
          cache.entries[keys[originalIndex]!] = { vector: copied, lastUsedAt: now };
        });
      }
      pruneEntries(cache.entries, maxEntries);
      writeQueue = writeQueue.then(() => writeCache(cachePath, cache));
      await writeQueue;
      return output.map((vector) => vector!);
    }
  };
}

function configuredSemanticCacheRoot(): string {
  const configured = process.env.FIXMAP_CACHE_DIR;
  if (configured) return join(configured, "semantic");
  return join(
    process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "fixmap",
    "semantic"
  );
}

async function readCache(path: string, providerKey: string, dimensions: number): Promise<SemanticCacheFile> {
  try {
    const candidate: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(candidate) || candidate.version !== CACHE_VERSION || candidate.providerKey !== providerKey || !isRecord(candidate.entries)) {
      return emptyCache(providerKey);
    }
    const entries: Record<string, CachedVector> = {};
    for (const [key, value] of Object.entries(candidate.entries)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !isRecord(value) || !Array.isArray(value.vector) ||
        value.vector.length !== dimensions || value.vector.some((number) => typeof number !== "number" || !Number.isFinite(number)) ||
        typeof value.lastUsedAt !== "string" || !Number.isFinite(Date.parse(value.lastUsedAt))) continue;
      entries[key] = { vector: [...value.vector], lastUsedAt: value.lastUsedAt };
    }
    return { version: CACHE_VERSION, providerKey, entries };
  } catch {
    return emptyCache(providerKey);
  }
}

async function writeCache(path: string, cache: SemanticCacheFile): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(cache)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function emptyCache(providerKey: string): SemanticCacheFile {
  return { version: CACHE_VERSION, providerKey, entries: {} };
}

function pruneEntries(entries: Record<string, CachedVector>, maximum: number): void {
  const ordered = Object.entries(entries).sort((a, b) =>
    Date.parse(b[1].lastUsedAt) - Date.parse(a[1].lastUsedAt) || a[0].localeCompare(b[0])
  );
  for (const [key] of ordered.slice(maximum)) delete entries[key];
}

function embeddingProviderKey(provider: EmbeddingProvider): string {
  return [provider.id, provider.version, provider.model, provider.artifactHash, provider.runtime,
    provider.dimensions, provider.normalization].join(":");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isContained(root: string, candidate: string): boolean {
  const distance = relative(root, candidate);
  return distance !== "" && distance !== ".." && !distance.startsWith(`..${sep}`) && !isAbsolute(distance);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
