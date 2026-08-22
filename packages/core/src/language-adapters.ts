import type { RepoFile } from "./types.js";

export type LanguageAdapterId = "javascript-typescript" | "python" | "java";

export type LanguageImport = {
  adapter: LanguageAdapterId;
  specifier: string;
  importedNames: string[];
  wildcard: boolean;
};

export type LanguageDefinition = {
  adapter: LanguageAdapterId;
  name: string;
  kind: "function" | "method" | "class" | "interface" | "type" | "variable";
  /** UTF-16 offset in the scanner text sample, when the adapter can locate it. */
  offset?: number;
};

/**
 * A language adapter extracts facts only. Resolution, ranking, confidence, and policy stay
 * in FixMap's deterministic core so one adapter cannot silently redefine another language's
 * evidence. Adapters must be pure, bounded by the scanner's text sample, and return facts in
 * source order; core performs deduplication and provenance handling.
 */
export type LanguageAdapter = {
  id: LanguageAdapterId;
  extensions: readonly string[];
  extractImports(text: string): LanguageImport[];
  extractDefinitions(text: string): LanguageDefinition[];
  isTestPath(path: string): boolean;
};

const IDENTIFIER = "[A-Za-z_$][A-Za-z0-9_$]*";
const JAVA_CONTROL_WORDS = new Set(["catch", "do", "else", "for", "if", "new", "return", "switch", "synchronized", "throw", "while"]);

const javascriptAdapter: LanguageAdapter = {
  id: "javascript-typescript",
  extensions: [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"],
  extractImports(text) {
    const patterns = [
      /\bimport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
      /\bimport\s*["']([^"'\n]+)["']/g,
      /\bexport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
      /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
      /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
    ];
    return uniqueImports(patterns.flatMap((pattern) => [...text.matchAll(pattern)].flatMap((match) =>
      match[1] ? [{ adapter: "javascript-typescript" as const, specifier: match[1], importedNames: [], wildcard: false }] : []
    )));
  },
  extractDefinitions(text) {
    const definitions: LanguageDefinition[] = [];
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?` +
      `(?:function\\s*\\*?\\s*|(?:(?:const|let|var)\\s+)|(class|interface|type|enum)\\s+)` +
      `(${IDENTIFIER})(?![\\p{L}\\p{N}_$])`,
      "gu"
    );
    for (const match of text.matchAll(pattern)) {
      const name = match[2];
      if (!name) continue;
      const declaration = match[1];
      const kind = declaration === "class" ? "class"
        : declaration === "interface" ? "interface"
          : declaration === "type" || declaration === "enum" ? "type"
            : match[0].includes("function") ? "function" : "variable";
      definitions.push({ adapter: "javascript-typescript", name, kind, offset: match.index });
    }
    return uniqueDefinitions(definitions);
  },
  isTestPath(path) {
    return /(?:\.test(?:\.|-d\.)|\.spec\.|(?:^|\/)__tests__\/|(?:^|\/)tests?\/)/i.test(path);
  }
};

const pythonAdapter: LanguageAdapter = {
  id: "python",
  extensions: [".py", ".pyi"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    for (const match of text.matchAll(/^\s*from\s+([.A-Za-z_][.A-Za-z0-9_]*)\s+import\s+([^#\n]+)/gm)) {
      const specifier = match[1];
      if (!specifier) continue;
      const importedNames = splitImportedNames(match[2] ?? "");
      imports.push({ adapter: "python", specifier, importedNames, wildcard: importedNames.includes("*") });
    }
    for (const match of text.matchAll(/^\s*import\s+([^#\n]+)/gm)) {
      for (const entry of (match[1] ?? "").split(",")) {
        const specifier = entry.trim().split(/\s+as\s+/i)[0]?.trim();
        if (specifier && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(specifier)) {
          imports.push({ adapter: "python", specifier, importedNames: [], wildcard: false });
        }
      }
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    const definitions: LanguageDefinition[] = [];
    for (const match of text.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) {
      if (match[1]) definitions.push({ adapter: "python", name: match[1], kind: "function", offset: match.index });
    }
    for (const match of text.matchAll(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm)) {
      if (match[1]) definitions.push({ adapter: "python", name: match[1], kind: "class", offset: match.index });
    }
    return uniqueDefinitions(definitions);
  },
  isTestPath(path) {
    return /(?:^|\/)(?:tests?\/|test_[^/]+\.py$|[^/]+_test\.py$)/i.test(path);
  }
};

const javaAdapter: LanguageAdapter = {
  id: "java",
  extensions: [".java"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    for (const match of text.matchAll(/^\s*import\s+(static\s+)?([A-Za-z_][A-Za-z0-9_.]*?)(\.\*)?\s*;/gm)) {
      let specifier = match[2];
      if (!specifier) continue;
      if (match[1]) {
        const segments = specifier.split(".");
        if (segments.length > 1) segments.pop();
        specifier = segments.join(".");
      }
      imports.push({ adapter: "java", specifier, importedNames: [], wildcard: Boolean(match[3]) });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    const definitions: LanguageDefinition[] = [];
    for (const match of text.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      const name = match[2];
      if (!name) continue;
      definitions.push({
        adapter: "java",
        name,
        kind: match[1] === "interface" ? "interface" : match[1] === "class" || match[1] === "record" ? "class" : "type",
        offset: match.index
      });
    }
    const methodPattern = /(?:^|[;{}]\s*)(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[A-Za-z0-9_?,.\s]+>\s*)?(?:[A-Za-z_$][A-Za-z0-9_$<>,.?\[\]]*\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/gm;
    for (const match of text.matchAll(methodPattern)) {
      const name = match[1];
      if (name && !JAVA_CONTROL_WORDS.has(name)) {
        definitions.push({ adapter: "java", name, kind: "method", offset: match.index });
      }
    }
    return uniqueDefinitions(definitions);
  },
  isTestPath(path) {
    return /(?:^|\/)src\/test\/|(?:Test|Tests|TestCase)\.java$/i.test(path);
  }
};

export const BUILT_IN_LANGUAGE_ADAPTERS: readonly LanguageAdapter[] = Object.freeze([
  javascriptAdapter,
  pythonAdapter,
  javaAdapter
]);

const ADAPTER_BY_EXTENSION = new Map(
  BUILT_IN_LANGUAGE_ADAPTERS.flatMap((adapter) => adapter.extensions.map((extension) => [extension, adapter] as const))
);
const IMPORT_CACHE = new WeakMap<object, LanguageImport[]>();
const DEFINITION_CACHE = new WeakMap<object, LanguageDefinition[]>();

export function languageAdapterForFile(file: Pick<RepoFile, "extension">): LanguageAdapter | undefined {
  return ADAPTER_BY_EXTENSION.get(file.extension.toLowerCase());
}

export function extractLanguageImports(file: Pick<RepoFile, "extension" | "textSample" | "searchTextSample">): LanguageImport[] {
  const cached = IMPORT_CACHE.get(file);
  if (cached) return cached;
  const imports = languageAdapterForFile(file)?.extractImports(file.searchTextSample ?? file.textSample) ?? [];
  IMPORT_CACHE.set(file, imports);
  return imports;
}

export function extractLanguageDefinitions(file: Pick<RepoFile, "extension" | "textSample" | "searchTextSample">): LanguageDefinition[] {
  const cached = DEFINITION_CACHE.get(file);
  if (cached) return cached;
  const definitions = languageAdapterForFile(file)?.extractDefinitions(file.searchTextSample ?? file.textSample) ?? [];
  DEFINITION_CACHE.set(file, definitions);
  return definitions;
}

export function isLanguageTestPath(path: string, extension: string): boolean {
  return ADAPTER_BY_EXTENSION.get(extension.toLowerCase())?.isTestPath(path.replace(/\\/g, "/")) ?? false;
}

function splitImportedNames(raw: string): string[] {
  return raw.replace(/[()]/g, "").split(",").flatMap((entry) => {
    const name = entry.trim().split(/\s+as\s+/i)[0]?.trim();
    return name && (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name === "*") ? [name] : [];
  });
}

function uniqueImports(imports: LanguageImport[]): LanguageImport[] {
  const seen = new Set<string>();
  return imports.filter((entry) => {
    const key = `${entry.adapter}\0${entry.specifier}\0${entry.importedNames.join(",")}\0${String(entry.wildcard)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueDefinitions(definitions: LanguageDefinition[]): LanguageDefinition[] {
  const seen = new Set<string>();
  return definitions.filter((entry) => {
    const key = `${entry.name}\0${entry.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
