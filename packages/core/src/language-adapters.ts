import type { RepoFile } from "./types.js";

export type LanguageAdapterId =
  | "javascript-typescript"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "dotnet";

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
const CSHARP_CONTROL_WORDS = new Set(["catch", "do", "else", "for", "foreach", "if", "lock", "return", "switch", "throw", "using", "while"]);

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

const goAdapter: LanguageAdapter = {
  id: "go",
  extensions: [".go"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    for (const match of text.matchAll(/^\s*import\s+(?:[A-Za-z_.][A-Za-z0-9_.]*\s+)?["`]([^"`\n]+)["`]/gm)) {
      if (match[1]) imports.push({ adapter: "go", specifier: match[1], importedNames: [], wildcard: false });
    }
    for (const block of text.matchAll(/^\s*import\s*\(([\s\S]*?)^\s*\)/gm)) {
      for (const match of (block[1] ?? "").matchAll(/^\s*(?:[A-Za-z_.][A-Za-z0-9_.]*\s+)?["`]([^"`\n]+)["`]/gm)) {
        if (match[1]) imports.push({ adapter: "go", specifier: match[1], importedNames: [], wildcard: false });
      }
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    return definitionsFromPatterns("go", text, [
      { pattern: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm, kind: "function" },
      { pattern: /^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:struct|interface)\b/gm, kind: "class" },
      { pattern: /^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?!(?:struct|interface)\b)/gm, kind: "type" },
      { pattern: /^\s*(?:var|const)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm, kind: "variable" }
    ]);
  },
  isTestPath(path) { return /(?:^|\/)[^/]+_test\.go$/i.test(path); }
};

const rustAdapter: LanguageAdapter = {
  id: "rust",
  extensions: [".rs"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    const pathModules = new Set<string>();
    for (const match of text.matchAll(/^\s*#\s*\[\s*path\s*=\s*["']([^"'\n]+)["']\s*\]\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm)) {
      if (match[1] && match[2]) {
        pathModules.add(match[2]);
        imports.push({ adapter: "rust", specifier: `file:${match[1]}`, importedNames: [], wildcard: false });
      }
    }
    for (const match of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;\n]+)\s*;/gm)) {
      const specifier = (match[1] ?? "").replace(/\s+/g, "").replace(/::\{.*$/, "");
      if (specifier) imports.push({ adapter: "rust", specifier, importedNames: [], wildcard: specifier.endsWith("::*") });
    }
    for (const match of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm)) {
      if (match[1] && !pathModules.has(match[1])) imports.push({ adapter: "rust", specifier: `self::${match[1]}`, importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    const visibility = "(?:pub(?:\\([^)]*\\))?\\s+)?";
    return definitionsFromPatterns("rust", text, [
      { pattern: new RegExp(`^\\s*${visibility}(?:async\\s+)?(?:unsafe\\s+)?fn\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`, "gm"), kind: "function" },
      { pattern: new RegExp(`^\\s*${visibility}(?:struct|enum)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`, "gm"), kind: "class" },
      { pattern: new RegExp(`^\\s*${visibility}trait\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`, "gm"), kind: "interface" },
      { pattern: new RegExp(`^\\s*${visibility}type\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`, "gm"), kind: "type" },
      { pattern: new RegExp(`^\\s*${visibility}(?:const|static(?:\\s+mut)?)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`, "gm"), kind: "variable" }
    ]);
  },
  isTestPath(path) { return /(?:^|\/)(?:tests?|benches)\/[^/]+\.rs$|(?:^|\/)[^/]+_test\.rs$/i.test(path); }
};

const rubyAdapter: LanguageAdapter = {
  id: "ruby",
  extensions: [".rb", ".rake"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    for (const match of text.matchAll(/^\s*(require_relative|require|load)\s*\(?\s*["']([^"'\n]+)["']/gm)) {
      if (match[2]) imports.push({ adapter: "ruby", specifier: `${match[1] === "require_relative" ? "relative:" : "absolute:"}${match[2]}`, importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    return definitionsFromPatterns("ruby", text, [
      { pattern: /^\s*(?:async\s+)?def\s+(?:self\.)?([A-Za-z_][A-Za-z0-9_!?=]*)\b/gm, kind: "method" },
      { pattern: /^\s*class\s+(?:[A-Za-z_][A-Za-z0-9_]*::)*([A-Za-z_][A-Za-z0-9_]*)\b/gm, kind: "class" },
      { pattern: /^\s*module\s+(?:[A-Za-z_][A-Za-z0-9_]*::)*([A-Za-z_][A-Za-z0-9_]*)\b/gm, kind: "type" }
    ]);
  },
  isTestPath(path) { return /(?:^|\/)spec\/.*_spec\.rb$|(?:^|\/)test\/.*_test\.rb$/i.test(path); }
};

const phpAdapter: LanguageAdapter = {
  id: "php",
  extensions: [".php", ".phtml"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    for (const match of text.matchAll(/^\s*use\s+(?:function\s+|const\s+)?([^;\n]+)\s*;/gm)) {
      for (const entry of (match[1] ?? "").split(",")) {
        const specifier = entry.trim().replace(/^\\+/, "").split(/\s+as\s+/i)[0]?.trim();
        if (specifier) imports.push({ adapter: "php", specifier, importedNames: [], wildcard: false });
      }
    }
    for (const match of text.matchAll(/\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?["']([^"'\n]+)["']/g)) {
      if (match[1]) imports.push({ adapter: "php", specifier: `file:${match[1]}`, importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    return definitionsFromPatterns("php", text, [
      { pattern: /\b(?:final\s+|abstract\s+|readonly\s+)*(?:class|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, kind: "class" },
      { pattern: /\binterface\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, kind: "interface" },
      { pattern: /\bfunction\s+&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, kind: "function" }
    ]);
  },
  isTestPath(path) { return /(?:^|\/)tests?\/|(?:Test|Tests)\.php$/i.test(path); }
};

const dotnetAdapter: LanguageAdapter = {
  id: "dotnet",
  extensions: [".cs", ".csx"],
  extractImports(text) {
    const imports: LanguageImport[] = [];
    for (const match of text.matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm)) {
      if (match[1]) imports.push({ adapter: "dotnet", specifier: match[1], importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    const definitions = definitionsFromPatterns("dotnet", text, [
      { pattern: /\b(?:class|record(?:\s+class)?|struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, kind: "class" },
      { pattern: /\binterface\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, kind: "interface" },
      { pattern: /\bdelegate\s+[^;({]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, kind: "type" }
    ]);
    const methodPattern = /(?:^|[;{}]\s*)(?:(?:public|protected|private|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial)\s+)*(?:[A-Za-z_][A-Za-z0-9_<>,.?\[\]]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:where\s+[^={]+)?(?:=>|\{)/gm;
    for (const match of text.matchAll(methodPattern)) {
      if (match[1] && !CSHARP_CONTROL_WORDS.has(match[1])) definitions.push({ adapter: "dotnet", name: match[1], kind: "method", offset: match.index });
    }
    return uniqueDefinitions(definitions.sort(byOffset));
  },
  isTestPath(path) { return /(?:^|\/)(?:tests?|specs?)\/|(?:Test|Tests|TestCase)\.cs$/i.test(path); }
};

export const BUILT_IN_LANGUAGE_ADAPTERS: readonly LanguageAdapter[] = Object.freeze([
  javascriptAdapter,
  pythonAdapter,
  javaAdapter,
  goAdapter,
  rustAdapter,
  rubyAdapter,
  phpAdapter,
  dotnetAdapter
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

function definitionsFromPatterns(
  adapter: LanguageAdapterId,
  text: string,
  patterns: Array<{ pattern: RegExp; kind: LanguageDefinition["kind"] }>
): LanguageDefinition[] {
  const definitions: LanguageDefinition[] = [];
  for (const { pattern, kind } of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) definitions.push({ adapter, name: match[1], kind, offset: match.index });
    }
  }
  return uniqueDefinitions(definitions.sort(byOffset));
}

function byOffset(left: LanguageDefinition, right: LanguageDefinition): number {
  return (left.offset ?? 0) - (right.offset ?? 0) || left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind);
}
