import { BUILT_IN_LANGUAGE_ADAPTERS, type LanguageDefinition, type LanguageImport } from "./language-adapters.js";

/** Trusted host callbacks, not sandboxed code. Not loaded from repository config. */
export type CustomLanguageAdapter = {
  contractVersion: 1;
  id: `custom:${string}`;
  version: string;
  extensions: readonly string[];
  extractImports(text: string): Omit<LanguageImport, "adapter">[];
  extractDefinitions(text: string): Omit<LanguageDefinition, "adapter">[];
  isTestPath(path: string): boolean;
  resolveImport(input: {
    fromPath: string;
    imported: Readonly<Omit<LanguageImport, "adapter" | "importedNames"> & { importedNames: readonly string[] }>;
    candidatePaths: readonly string[];
  }): readonly string[];
};

export type LanguageRegistry = Readonly<{
  /** Canonical metadata key; callers must change version when callback behavior changes. */
  cacheIdentity: string;
  customAdapters: readonly Readonly<CustomLanguageAdapter>[];
  customForExtension(extension: string): Readonly<CustomLanguageAdapter> | undefined;
}>;

const MAX_ADAPTERS = 32;
const MAX_EXTENSIONS = 32;
const CALLBACKS = ["extractImports", "extractDefinitions", "isTestPath", "resolveImport"] as const;

/** Internal foundation until scanner/analysis plumbing and result validation are connected. */
export function createLanguageRegistry(adapters: readonly CustomLanguageAdapter[] = []): LanguageRegistry {
  if (!Array.isArray(adapters) || adapters.length > MAX_ADAPTERS) throw new Error("Invalid language adapter list.");
  const ids = new Set<string>();
  const extensions = new Set(BUILT_IN_LANGUAGE_ADAPTERS.flatMap((adapter) => [...adapter.extensions]));
  const snapshots: Readonly<CustomLanguageAdapter>[] = [];
  for (const adapter of adapters) {
    if (!adapter || typeof adapter !== "object" || adapter.contractVersion !== 1 ||
      typeof adapter.id !== "string" || !/^custom:[a-z][a-z0-9-]{0,63}$/.test(adapter.id) ||
      typeof adapter.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(adapter.version) ||
      !Array.isArray(adapter.extensions) || adapter.extensions.length === 0 || adapter.extensions.length > MAX_EXTENSIONS ||
      CALLBACKS.some((key) => typeof adapter[key] !== "function")) {
      throw new Error("Invalid language adapter contract.");
    }
    if (ids.has(adapter.id)) throw new Error("Duplicate language adapter identity.");
    ids.add(adapter.id);
    const canonicalExtensions: string[] = [];
    for (const extension of adapter.extensions) {
      if (typeof extension !== "string" || !/^\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/.test(extension)) {
        throw new Error("Invalid language adapter extension.");
      }
      const canonical = extension.toLowerCase();
      if (extensions.has(canonical)) throw new Error("Conflicting language adapter extension.");
      extensions.add(canonical);
      canonicalExtensions.push(canonical);
    }
    snapshots.push(Object.freeze({
      contractVersion: 1,
      id: adapter.id,
      version: adapter.version,
      extensions: Object.freeze(canonicalExtensions.sort()),
      extractImports: adapter.extractImports,
      extractDefinitions: adapter.extractDefinitions,
      isTestPath: adapter.isTestPath,
      resolveImport: adapter.resolveImport
    }));
  }
  snapshots.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const byExtension = new Map(snapshots.flatMap((adapter) => adapter.extensions.map((extension) => [extension, adapter] as const)));
  const cacheIdentity = JSON.stringify({
    contractVersion: 1,
    adapters: snapshots.map(({ id, version, extensions: registered }) => ({ id, version, extensions: registered }))
  });
  return Object.freeze({
    cacheIdentity,
    customAdapters: Object.freeze(snapshots),
    customForExtension: (extension: string) => byExtension.get(extension.toLowerCase())
  });
}
