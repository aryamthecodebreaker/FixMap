import type { LanguageDefinition, LanguageImport } from "./language-adapters.js";
import type { LanguageRegistry } from "./language-registry.js";

type ImportFact = Omit<LanguageImport, "adapter">;
type DefinitionFact = Omit<LanguageDefinition, "adapter">;
export type CustomLanguageFacts = {
  adapter: `custom:${string}`;
  version: string;
  imports: ImportFact[];
  definitions: DefinitionFact[];
  isTest: boolean;
};
export type CustomExtractionResult =
  | { status: "unsupported" }
  | { status: "ok"; facts: CustomLanguageFacts }
  | { status: "failed"; adapter: string; code: "adapter-input-invalid" | "adapter-extraction-failed" };

const KINDS = new Set(["function", "method", "class", "interface", "type", "variable"]);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const term = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value);
const fields = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
const repoPath = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4_096 &&
  !/[\x00-\x1f\x7f\\:]/.test(value) && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

export type CustomResolutionResult =
  | { status: "unsupported" }
  | { status: "ok"; targets: string[] }
  | { status: "failed"; adapter: string; code: "adapter-resolution-failed" };

function validImports(value: unknown): value is ImportFact[] {
  return Array.isArray(value) && value.length <= 2_000 && value.every((entry: unknown) =>
    record(entry) && fields(entry, ["specifier", "importedNames", "wildcard"]) && term(entry.specifier) &&
    typeof entry.wildcard === "boolean" && Array.isArray(entry.importedNames) && entry.importedNames.length <= 200 && entry.importedNames.every(term));
}

function validDefinitions(value: unknown, textLength: number): value is DefinitionFact[] {
  return Array.isArray(value) && value.length <= 2_000 && value.every((entry: unknown) =>
    record(entry) && fields(entry, ["name", "kind", "offset"]) && term(entry.name) && typeof entry.kind === "string" && KINDS.has(entry.kind) &&
    (entry.offset === undefined || (Number.isInteger(entry.offset) && (entry.offset as number) >= 0 && (entry.offset as number) < textLength)));
}

/** Trusted synchronous callbacks only: exception containment is not execution isolation. */
export function createCustomLanguageContext(registry: LanguageRegistry) {
  const cache = new WeakMap<object, { path: string; extension: string; text: string; result: CustomExtractionResult }>();
  return Object.freeze({
    resolve(extension: string, fromPath: string, imported: ImportFact, candidatePaths: readonly string[]): CustomResolutionResult {
      const adapter = registry.customForExtension(extension);
      if (!adapter) return { status: "unsupported" };
      try {
        if (!repoPath(fromPath) || !validImports([imported]) || !Array.isArray(candidatePaths) ||
          candidatePaths.length > 25_000 || !candidatePaths.every(repoPath)) throw new Error();
        const candidates = [...new Set(candidatePaths)].sort();
        const allowed = new Set(candidates);
        if (!allowed.has(fromPath)) throw new Error();
        const input = Object.freeze({
          fromPath,
          imported: Object.freeze({ ...imported, importedNames: Object.freeze([...imported.importedNames]) }),
          candidatePaths: Object.freeze(candidates)
        });
        const proposed: unknown = adapter.resolveImport(input);
        if (!Array.isArray(proposed) || proposed.length > 200 ||
          !proposed.every((target: unknown) => repoPath(target) && allowed.has(target))) throw new Error();
        // Never retain a plugin-owned result; omit self edges and stabilize ordering.
        return { status: "ok", targets: [...new Set(proposed as string[])].filter((target) => target !== fromPath).sort() };
      } catch {
        return { status: "failed", adapter: adapter.id, code: "adapter-resolution-failed" };
      }
    },
    extract(file: { path: string; extension: string; textSample: string; searchTextSample?: string }): CustomExtractionResult {
      const extension = file.extension.toLowerCase();
      const adapter = registry.customForExtension(extension);
      if (!adapter) return { status: "unsupported" };
      const text = file.searchTextSample ?? file.textSample;
      const previous = cache.get(file);
      if (previous?.path === file.path && previous.extension === extension && previous.text === text) return structuredClone(previous.result);
      let result: CustomExtractionResult;
      if (text.length > 64_000 || file.path.length > 4_096 || !file.path ||
        /[\x00-\x1f\x7f\\:]/.test(file.path) || file.path.split('/').some((part) => !part || part === '.' || part === '..')) {
        result = { status: "failed", adapter: adapter.id, code: "adapter-input-invalid" };
      } else {
        try {
          // Bound each result before copying it; copy before the next callback can
          // modify a retained reference. Validate the detached result as well.
          const rawImports: unknown = adapter.extractImports(text);
          if (!validImports(rawImports)) throw new Error();
          const imports: unknown = structuredClone(rawImports);
          const rawDefinitions: unknown = adapter.extractDefinitions(text);
          if (!validDefinitions(rawDefinitions, text.length)) throw new Error();
          const definitions: unknown = structuredClone(rawDefinitions);
          const isTest: unknown = adapter.isTestPath(file.path);
          if (!validImports(imports) || !validDefinitions(definitions, text.length) || typeof isTest !== "boolean") throw new Error();
          result = { status: "ok", facts: { adapter: adapter.id, version: adapter.version, imports, definitions, isTest } };
        } catch {
          // No raw exception details or source text cross the diagnostic boundary.
          result = { status: "failed", adapter: adapter.id, code: "adapter-extraction-failed" };
        }
      }
      cache.set(file, { path: file.path, extension, text, result });
      return structuredClone(result);
    }
  });
}
