import { createRequire as __fixmapCreateRequire } from 'module'; const require = __fixmapCreateRequire(import.meta.url);

// packages/action/src/runner.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { appendFileSync, readFileSync, statSync } from "node:fs";
import { resolve as resolve3 } from "node:path";

// packages/core/dist/plan.js
import { readFile as readFile2 } from "node:fs/promises";
import { join as join2, resolve as resolve2 } from "node:path";

// packages/core/dist/exclude.js
var COMMENT = /^\s*#/;
var NO_EXCLUSIONS = {
  excludes: () => false,
  reasonFor: () => void 0,
  patterns: [],
  matchedPatterns: /* @__PURE__ */ new Set()
};
function buildPathExcluder(patterns2) {
  const cleaned = [...new Set(patterns2.map((pattern) => normalizeSeparators(pattern.trim())).filter((pattern) => pattern.length > 0 && !COMMENT.test(pattern)))];
  if (cleaned.length === 0) {
    return NO_EXCLUSIONS;
  }
  const matchers = cleaned.map((pattern) => {
    const negated = pattern.startsWith("!");
    const body = negated ? pattern.slice(1) : pattern;
    return { pattern, negated, test: compile(body) };
  });
  const cache = /* @__PURE__ */ new Map();
  const matchedPatterns = /* @__PURE__ */ new Set();
  const reasonFor = (path) => {
    if (cache.has(path)) {
      return cache.get(path);
    }
    let hit;
    for (const matcher of matchers) {
      if (matcher.test(path)) {
        matchedPatterns.add(matcher.pattern);
        hit = matcher.negated ? void 0 : matcher.pattern;
      }
    }
    cache.set(path, hit);
    return hit;
  };
  return {
    excludes: (path) => reasonFor(path) !== void 0,
    reasonFor,
    patterns: cleaned,
    matchedPatterns
  };
}
function parseIgnoreFile(contents) {
  return contents.split(/\r?\n/);
}
function normalizeSeparators(pattern) {
  return pattern.replace(/\\/g, "/");
}
function compile(pattern) {
  const anchored = pattern.startsWith("/");
  const directoryOnly = pattern.endsWith("/");
  const body = pattern.replace(/^\//, "").replace(/\/$/, "");
  if (body.length === 0) {
    return () => false;
  }
  const source = `${anchored ? "^" : "(?:^|/)"}${globToRegExp(body)}${directoryOnly ? "/" : "(?:/|$)"}`;
  const expression = new RegExp(source);
  return (path) => expression.test(directoryOnly ? `${path}/` : path);
}
function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*") {
      if (glob[index + 1] === "*") {
        source += ".*";
        index += 1;
        if (glob[index + 1] === "/") {
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    source += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return source;
}

// packages/core/dist/markdown.js
function markdownCode(value) {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const needsPadding = value.startsWith("`") || value.endsWith("`") || value.startsWith(" ") || value.endsWith(" ");
  return `${fence}${needsPadding ? " " : ""}${value}${needsPadding ? " " : ""}${fence}`;
}

// packages/core/dist/language-adapters.js
var IDENTIFIER = "[A-Za-z_$][A-Za-z0-9_$]*";
var JAVA_CONTROL_WORDS = /* @__PURE__ */ new Set(["catch", "do", "else", "for", "if", "new", "return", "switch", "synchronized", "throw", "while"]);
var CSHARP_CONTROL_WORDS = /* @__PURE__ */ new Set(["catch", "do", "else", "for", "foreach", "if", "lock", "return", "switch", "throw", "using", "while"]);
var javascriptAdapter = {
  id: "javascript-typescript",
  extensions: [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"],
  extractImports(text) {
    const patterns2 = [
      /\bimport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
      /\bimport\s*["']([^"'\n]+)["']/g,
      /\bexport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
      /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
      /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
    ];
    return uniqueImports(patterns2.flatMap((pattern) => [...text.matchAll(pattern)].flatMap((match) => match[1] ? [{ adapter: "javascript-typescript", specifier: match[1], importedNames: [], wildcard: false }] : [])));
  },
  extractDefinitions(text) {
    const definitions = [];
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:(?:const|let|var)\\s+)|(class|interface|type|enum)\\s+)(${IDENTIFIER})(?![\\p{L}\\p{N}_$])`, "gu");
    for (const match of text.matchAll(pattern)) {
      const name = match[2];
      if (!name)
        continue;
      const declaration = match[1];
      const kind = declaration === "class" ? "class" : declaration === "interface" ? "interface" : declaration === "type" || declaration === "enum" ? "type" : match[0].includes("function") ? "function" : "variable";
      definitions.push({ adapter: "javascript-typescript", name, kind, offset: match.index });
    }
    return uniqueDefinitions(definitions);
  },
  isTestPath(path) {
    return /(?:\.test(?:\.|-d\.)|\.spec\.|(?:^|\/)__tests__\/|(?:^|\/)tests?\/)/i.test(path);
  }
};
var pythonAdapter = {
  id: "python",
  extensions: [".py", ".pyi"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*from\s+([.A-Za-z_][.A-Za-z0-9_]*)\s+import\s+([^#\n]+)/gm)) {
      const specifier = match[1];
      if (!specifier)
        continue;
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
    const definitions = [];
    for (const match of text.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) {
      if (match[1])
        definitions.push({ adapter: "python", name: match[1], kind: "function", offset: match.index });
    }
    for (const match of text.matchAll(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm)) {
      if (match[1])
        definitions.push({ adapter: "python", name: match[1], kind: "class", offset: match.index });
    }
    return uniqueDefinitions(definitions);
  },
  isTestPath(path) {
    return /(?:^|\/)(?:tests?\/|test_[^/]+\.py$|[^/]+_test\.py$)/i.test(path);
  }
};
var javaAdapter = {
  id: "java",
  extensions: [".java"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*import\s+(static\s+)?([A-Za-z_][A-Za-z0-9_.]*?)(\.\*)?\s*;/gm)) {
      let specifier = match[2];
      if (!specifier)
        continue;
      if (match[1]) {
        const segments = specifier.split(".");
        if (segments.length > 1)
          segments.pop();
        specifier = segments.join(".");
      }
      imports.push({ adapter: "java", specifier, importedNames: [], wildcard: Boolean(match[3]) });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text) {
    const definitions = [];
    for (const match of text.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      const name = match[2];
      if (!name)
        continue;
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
var goAdapter = {
  id: "go",
  extensions: [".go"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*import\s+(?:[A-Za-z_.][A-Za-z0-9_.]*\s+)?["`]([^"`\n]+)["`]/gm)) {
      if (match[1])
        imports.push({ adapter: "go", specifier: match[1], importedNames: [], wildcard: false });
    }
    for (const block of text.matchAll(/^\s*import\s*\(([\s\S]*?)^\s*\)/gm)) {
      for (const match of (block[1] ?? "").matchAll(/^\s*(?:[A-Za-z_.][A-Za-z0-9_.]*\s+)?["`]([^"`\n]+)["`]/gm)) {
        if (match[1])
          imports.push({ adapter: "go", specifier: match[1], importedNames: [], wildcard: false });
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
  isTestPath(path) {
    return /(?:^|\/)[^/]+_test\.go$/i.test(path);
  }
};
var rustAdapter = {
  id: "rust",
  extensions: [".rs"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;\n]+)\s*;/gm)) {
      const specifier = (match[1] ?? "").replace(/\s+/g, "").replace(/::\{.*$/, "");
      if (specifier)
        imports.push({ adapter: "rust", specifier, importedNames: [], wildcard: specifier.endsWith("::*") });
    }
    for (const match of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm)) {
      if (match[1])
        imports.push({ adapter: "rust", specifier: `self::${match[1]}`, importedNames: [], wildcard: false });
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
  isTestPath(path) {
    return /(?:^|\/)(?:tests?|benches)\/[^/]+\.rs$|(?:^|\/)[^/]+_test\.rs$/i.test(path);
  }
};
var rubyAdapter = {
  id: "ruby",
  extensions: [".rb", ".rake"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*(require_relative|require|load)\s*\(?\s*["']([^"'\n]+)["']/gm)) {
      if (match[2])
        imports.push({ adapter: "ruby", specifier: `${match[1] === "require_relative" ? "relative:" : "absolute:"}${match[2]}`, importedNames: [], wildcard: false });
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
  isTestPath(path) {
    return /(?:^|\/)spec\/.*_spec\.rb$|(?:^|\/)test\/.*_test\.rb$/i.test(path);
  }
};
var phpAdapter = {
  id: "php",
  extensions: [".php", ".phtml"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*use\s+(?:function\s+|const\s+)?([^;\n]+)\s*;/gm)) {
      for (const entry of (match[1] ?? "").split(",")) {
        const specifier = entry.trim().replace(/^\\+/, "").split(/\s+as\s+/i)[0]?.trim();
        if (specifier)
          imports.push({ adapter: "php", specifier, importedNames: [], wildcard: false });
      }
    }
    for (const match of text.matchAll(/\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?["']([^"'\n]+)["']/g)) {
      if (match[1])
        imports.push({ adapter: "php", specifier: `file:${match[1]}`, importedNames: [], wildcard: false });
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
  isTestPath(path) {
    return /(?:^|\/)tests?\/|(?:Test|Tests)\.php$/i.test(path);
  }
};
var dotnetAdapter = {
  id: "dotnet",
  extensions: [".cs", ".csx"],
  extractImports(text) {
    const imports = [];
    for (const match of text.matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm)) {
      if (match[1])
        imports.push({ adapter: "dotnet", specifier: match[1], importedNames: [], wildcard: false });
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
      if (match[1] && !CSHARP_CONTROL_WORDS.has(match[1]))
        definitions.push({ adapter: "dotnet", name: match[1], kind: "method", offset: match.index });
    }
    return uniqueDefinitions(definitions.sort(byOffset));
  },
  isTestPath(path) {
    return /(?:^|\/)(?:tests?|specs?)\/|(?:Test|Tests|TestCase)\.cs$/i.test(path);
  }
};
var BUILT_IN_LANGUAGE_ADAPTERS = Object.freeze([
  javascriptAdapter,
  pythonAdapter,
  javaAdapter,
  goAdapter,
  rustAdapter,
  rubyAdapter,
  phpAdapter,
  dotnetAdapter
]);
var ADAPTER_BY_EXTENSION = new Map(BUILT_IN_LANGUAGE_ADAPTERS.flatMap((adapter) => adapter.extensions.map((extension) => [extension, adapter])));
var IMPORT_CACHE = /* @__PURE__ */ new WeakMap();
var DEFINITION_CACHE = /* @__PURE__ */ new WeakMap();
function languageAdapterForFile(file) {
  return ADAPTER_BY_EXTENSION.get(file.extension.toLowerCase());
}
function extractLanguageImports(file) {
  const cached = IMPORT_CACHE.get(file);
  if (cached)
    return cached;
  const imports = languageAdapterForFile(file)?.extractImports(file.searchTextSample ?? file.textSample) ?? [];
  IMPORT_CACHE.set(file, imports);
  return imports;
}
function extractLanguageDefinitions(file) {
  const cached = DEFINITION_CACHE.get(file);
  if (cached)
    return cached;
  const definitions = languageAdapterForFile(file)?.extractDefinitions(file.searchTextSample ?? file.textSample) ?? [];
  DEFINITION_CACHE.set(file, definitions);
  return definitions;
}
function isLanguageTestPath(path, extension) {
  return ADAPTER_BY_EXTENSION.get(extension.toLowerCase())?.isTestPath(path.replace(/\\/g, "/")) ?? false;
}
function splitImportedNames(raw) {
  return raw.replace(/[()]/g, "").split(",").flatMap((entry) => {
    const name = entry.trim().split(/\s+as\s+/i)[0]?.trim();
    return name && (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name === "*") ? [name] : [];
  });
}
function uniqueImports(imports) {
  const seen = /* @__PURE__ */ new Set();
  return imports.filter((entry) => {
    const key = `${entry.adapter}\0${entry.specifier}\0${entry.importedNames.join(",")}\0${String(entry.wildcard)}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function uniqueDefinitions(definitions) {
  const seen = /* @__PURE__ */ new Set();
  return definitions.filter((entry) => {
    const key = `${entry.name}\0${entry.kind}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function definitionsFromPatterns(adapter, text, patterns2) {
  const definitions = [];
  for (const { pattern, kind } of patterns2) {
    for (const match of text.matchAll(pattern)) {
      if (match[1])
        definitions.push({ adapter, name: match[1], kind, offset: match.index });
    }
  }
  return uniqueDefinitions(definitions.sort(byOffset));
}
function byOffset(left, right) {
  return (left.offset ?? 0) - (right.offset ?? 0) || left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind);
}

// packages/core/dist/paths.js
var ALWAYS_IGNORED_DIRS = /* @__PURE__ */ new Set([".cache", ".git", ".venv", "node_modules"]);
var LOCKFILE_NAMES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb"
]);
var GENERATED_DIRS = /* @__PURE__ */ new Set([
  ".idea",
  ".netlify",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "target",
  "vendor"
]);
var SOURCE_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cjs",
  ".cs",
  ".css",
  ".cts",
  ".go",
  ".gradle",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml"
]);
var BACKUP_SEGMENT_WORDS = /* @__PURE__ */ new Set([
  "archive",
  "archived",
  "archives",
  "backup",
  "backups",
  "bak",
  "deprecated",
  "legacy",
  "old",
  "quarantine"
]);
var BACKUP_FILE_PATTERNS = [
  /\.(?:bak|orig|rej|old|save|swp)$/i,
  /~$/,
  /\bconflicted copy\b/i,
  /\bconflict(?:ed)?[-_ ]copy\b/i,
  // A bare `-copy`/`_copy` is an ordinary module name (`deep-copy.ts`). Sync clients use
  // a space before "copy", or add a numbered suffix to the hyphen/underscore form.
  /(?: copy|[-_]copy\s*\(\d+\))\.[^.]+$/i,
  /\s\(\d+\)\.[^.]+$/
];
function segmentWords(segment) {
  return segment.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function directorySegments(path) {
  return path.split("/").slice(0, -1);
}
function isGeneratedPath(path) {
  return directorySegments(path).some((segment) => GENERATED_DIRS.has(segment.toLowerCase())) || isRecordedEvaluationOutput(path);
}
function isRecordedEvaluationOutput(path) {
  return /^benchmarks\/[^/]+\/(?:results|savings-results)\.json$/i.test(path);
}
var SOURCE_ROOT_DIRS = /* @__PURE__ */ new Set(["lib", "source", "src"]);
function moduleStem(path) {
  const segments = path.replace(/\.[^./]+$/, "").split("/");
  const rootIndex = segments.findIndex((segment) => {
    const normalized = segment.toLowerCase();
    return GENERATED_DIRS.has(normalized) || SOURCE_ROOT_DIRS.has(normalized);
  });
  if (rootIndex !== -1)
    segments.splice(rootIndex, 1);
  return segments.join("/");
}
function pathMatchesMention(path, mention) {
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  const normalizedMention = mention.replace(/\\/g, "/").toLowerCase();
  if (normalizedPath === normalizedMention || normalizedPath.endsWith(`/${normalizedMention}`) || normalizedPath.includes("/") && normalizedMention.endsWith(`/${normalizedPath}`))
    return true;
  if (!normalizedMention.includes("/") && !normalizedMention.includes(".")) {
    const fileName = normalizedPath.split("/").at(-1) ?? "";
    return fileName.replace(/\.[^.]+$/, "") === normalizedMention;
  }
  return false;
}
function isBackupPath(path) {
  const inBackupDirectory = directorySegments(path).some((segment) => segmentWords(segment).some((word) => BACKUP_SEGMENT_WORDS.has(word)));
  if (inBackupDirectory) {
    return true;
  }
  const fileName = path.split("/").pop() ?? "";
  return BACKUP_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

// packages/core/dist/signals.js
var TOKEN_SPLIT = /[^\p{L}\p{N}]+/gu;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "add",
  "all",
  "also",
  "and",
  "any",
  "are",
  "async",
  "await",
  "been",
  "being",
  "both",
  "break",
  "but",
  "can",
  "cannot",
  "catch",
  "class",
  "const",
  "continue",
  "codebase",
  "could",
  "debugger",
  "did",
  "doe",
  "does",
  "down",
  "else",
  "enum",
  "extends",
  "false",
  "finally",
  "each",
  "even",
  "export",
  "for",
  "from",
  "function",
  "github",
  "got",
  "had",
  "has",
  "have",
  "her",
  "him",
  "his",
  "how",
  "implements",
  "import",
  "index",
  "instanceof",
  "instead",
  "interface",
  "into",
  "its",
  "just",
  "let",
  "main",
  "make",
  "may",
  "might",
  "more",
  "most",
  "must",
  "namespace",
  "new",
  "node",
  "not",
  "now",
  "null",
  "off",
  "only",
  "other",
  "our",
  "out",
  "over",
  "packages",
  "private",
  "quality",
  "protected",
  "readonly",
  "return",
  "same",
  "she",
  "should",
  "some",
  "src",
  "static",
  "still",
  "such",
  "super",
  "switch",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "thing",
  "throw",
  "true",
  "try",
  "typeof",
  "under",
  "undefined",
  "uses",
  "var",
  "very",
  "void",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "yield",
  "you",
  "your"
]);
var MAX_FILE_MENTION_LENGTH = 200;
var FILE_MENTION_EXTENSIONS = [...SOURCE_FILE_EXTENSIONS].map((extension) => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((left, right) => right.length - left.length).join("|");
var FILE_MENTION_PATTERN = new RegExp(`(?:[A-Za-z]:[\\\\/]|[\\\\/])?[A-Za-z0-9_@$][A-Za-z0-9_.$/\\\\-]{0,${MAX_FILE_MENTION_LENGTH}}\\.(?:${FILE_MENTION_EXTENSIONS}|d\\.ts)\\b`, "g");
var CONVENTIONAL_FILE_MENTION_PATTERN = /\b(?:AUTHORS|CHANGELOG|CODE_OF_CONDUCT|CONTRIBUTING|LICENSE|NOTICE|README|SECURITY|CODEOWNERS|Dockerfile|Gemfile|Jenkinsfile|Makefile|Procfile|Rakefile|Vagrantfile)\b/gi;
var MEMBER_MENTION_PATTERN = /(?<![\p{L}\p{N}_$])[\p{L}_$][\p{L}\p{N}_$]*\.([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;
var FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  "c",
  "cc",
  "cjs",
  "cpp",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "less",
  "md",
  "mdx",
  "mjs",
  "py",
  "rb",
  "rs",
  "scss",
  "ts",
  "tsx",
  "yaml",
  "yml"
]);
var IDENTIFIER_PATTERN = /[\p{L}_$][\p{L}\p{N}_$]{4,}/gu;
var MAX_EXACT_FRAGMENTS = 8;
var MAX_IDENTIFIERS = 24;
function extractTaskSignals(input) {
  const prepared = prepareChecklistText(redactSensitiveTaskText(input.issueText ?? ""));
  const issueText = prepared.text;
  const visibleIssueText = stripHtmlComments(issueText);
  const issueSignalText = stripHttpUrls(visibleIssueText);
  const diffSignalText = stripHttpUrls(redactSensitiveTaskText(extractDiffContentLines(input.diffText ?? "")));
  const taskText = [issueSignalText, diffSignalText].join("\n");
  const tokens = tokenizeText(taskText);
  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? []),
    fileMentions: extractFileMentions(visibleIssueText),
    memberMentions: extractMemberMentions(issueSignalText),
    exactFragments: extractExactFragments(taskText),
    identifiers: extractIdentifiers(taskText),
    uncheckedChecklistLinesRemoved: prepared.removed,
    uncheckedChecklistLinesPreserved: prepared.preserved
  };
}
function prepareChecklistText(text) {
  const unchecked = /^\s*[-*]\s*\[\s\]\s+/;
  const lines = text.split(/\r?\n/);
  const removed = lines.filter((line) => unchecked.test(line));
  if (removed.length === 0)
    return { text, removed: 0, preserved: 0 };
  const retained = lines.filter((line) => !unchecked.test(line));
  const hasSubstantiveRetainedText = retained.some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !/^#{1,6}\s+/.test(trimmed);
  });
  return hasSubstantiveRetainedText ? { text: retained.join("\n"), removed: removed.length, preserved: 0 } : { text, removed: 0, preserved: removed.length };
}
function extractExactFragments(text) {
  const fragments = /* @__PURE__ */ new Set();
  for (const quoted of scanQuotedFragments(text)) {
    const fragment = quoted.value.trim();
    if (isDistinctiveFragment(fragment)) {
      fragments.add(fragment);
      if (fragments.size >= MAX_EXACT_FRAGMENTS) {
        break;
      }
    }
  }
  return [...fragments];
}
function extractIdentifiers(text) {
  const identifiers = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(IDENTIFIER_PATTERN)) {
    const identifier = match[0];
    if (isDistinctiveIdentifier(identifier)) {
      addIdentifier(identifiers, identifier);
    }
  }
  for (const quoted of scanQuotedFragments(text)) {
    if (quoted.delimiter !== "`") {
      continue;
    }
    const fragment = quoted.value.trim();
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(fragment.trim())) {
      continue;
    }
    if (!isDistinctiveIdentifier(fragment) && fragment.length < 6) {
      continue;
    }
    for (const match of fragment.matchAll(IDENTIFIER_PATTERN)) {
      addIdentifier(identifiers, match[0]);
    }
  }
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_$])([\p{L}_$][\p{L}\p{N}_$]{2,})\(/gu)) {
    if (match[1])
      addIdentifier(identifiers, match[1]);
  }
  return identifiers;
}
function addIdentifier(identifiers, identifier) {
  if (identifiers.size >= MAX_IDENTIFIERS || STOP_WORDS.has(identifier.toLowerCase())) {
    return;
  }
  identifiers.add(identifier);
}
function isDistinctiveIdentifier(identifier) {
  return /[0-9_$]/.test(identifier) || /[\p{Ll}][\p{Lu}]/u.test(identifier) || !/^[\x00-\x7F]+$/.test(identifier);
}
function isDistinctiveFragment(fragment) {
  if (fragment.length < 6 || fragment.length > 160) {
    return false;
  }
  if (/\s/.test(fragment)) {
    return fragment.trim().split(/\s+/).length >= 2 && /[\p{L}\p{N}]/u.test(fragment);
  }
  const punctuationCount = [...fragment].filter((character) => /[^\p{L}\p{N}$]/u.test(character)).length;
  return punctuationCount >= 1 && /[\p{L}\p{N}]/u.test(fragment);
}
function redactSensitiveTaskText(text) {
  return text.replace(/(https?:\/\/)[^/\s@]+@/gi, "$1").replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{8,}\b/g, "[redacted]").replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]").replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted]");
}
function stripHttpUrls(text) {
  return text.includes("://") ? text.replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " [url] ") : text;
}
function stripHtmlComments(text) {
  return text.includes("<!--") ? text.replace(/<!--[\s\S]*?-->/g, " ") : text;
}
function scanQuotedFragments(text) {
  const fragments = [];
  for (const line of text.split(/\r?\n/)) {
    let cursor = 0;
    while (cursor < line.length) {
      const delimiter = line[cursor];
      const closingDelimiter = delimiter === "\u201C" || delimiter === "\u201E" ? "\u201D" : delimiter === "\u2018" ? "\u2019" : delimiter === "\xAB" ? "\xBB" : delimiter;
      if (!['"', "'", "`", "\u201C", "\u201E", "\u2018", "\xAB"].includes(delimiter ?? "")) {
        cursor += 1;
        continue;
      }
      if (delimiter === "'" && cursor > 0 && /[A-Za-z0-9]/.test(line[cursor - 1] ?? "")) {
        cursor += 1;
        continue;
      }
      let end = cursor + 1;
      while (end < line.length) {
        if (line[end] === closingDelimiter && !isEscaped(line, end)) {
          break;
        }
        end += 1;
      }
      if (end < line.length) {
        fragments.push({ delimiter, value: line.slice(cursor + 1, end) });
        cursor = end + 1;
      } else {
        if (delimiter !== "'")
          fragments.push({ delimiter, value: line.slice(cursor + 1) });
        cursor += 1;
      }
    }
  }
  return fragments;
}
function isEscaped(text, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
function extractFileMentions(text) {
  const mentions = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(CONVENTIONAL_FILE_MENTION_PATTERN)) {
    if (match[0])
      mentions.add(match[0]);
  }
  for (const match of text.matchAll(
    // blob, tree and blame all address a path in the repository; only the view differs, and
    // a tree or blame link is the same deliberate "the code is here" gesture as a blob one.
    // The ref is any branch, tag or sha — restricting to a hex sha kept only permalinks and
    // dropped the branch links people paste far more often.
    /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:blob|tree|blame)\/[^/\s]+\/([^\s#?]+)/gi
  )) {
    const encodedPath = match[1];
    if (!encodedPath)
      continue;
    let path = encodedPath;
    try {
      path = decodeURIComponent(encodedPath);
    } catch {
    }
    const file = path.match(FILE_MENTION_PATTERN)?.[0];
    if (file && file.length >= 4)
      mentions.add(file.replace(/\\/g, "/"));
  }
  const withoutUrls = text.includes("://") ? text.replace(/https?:\/\/\S+/gi, " ") : text;
  for (const match of withoutUrls.matchAll(FILE_MENTION_PATTERN)) {
    const cleaned = match[0].replace(/\\/g, "/").replace(/^\.\.?\//, "");
    if (cleaned.length >= 4) {
      mentions.add(cleaned);
    }
  }
  return mentions;
}
function extractMemberMentions(text) {
  return new Set([...text.matchAll(MEMBER_MENTION_PATTERN)].map((match) => match[1]).filter((member) => typeof member === "string" && !FILE_EXTENSIONS.has(member.toLowerCase())));
}
function extractDiffContentLines(diffText) {
  if (!diffText) {
    return "";
  }
  return diffText.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");
}
function tokenizeText(text) {
  return new Set(text.replace(/\bhttp\s*\/\s*([123])\b/gi, "http h$1").replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(TOKEN_SPLIT).map((token) => token.trim()).filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token)).map((token) => normalizeToken(token)).filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token)));
}
function tokenizeIdentifier(identifier) {
  return new Set(identifier.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(TOKEN_SPLIT).map((token) => normalizeToken(token.trim())).filter((token) => isSearchableToken(token)));
}
var MAX_SEARCHABLE_TOKEN_LENGTH = 64;
var SHORT_SEARCHABLE_TOKENS = /* @__PURE__ */ new Set(["ci", "ui"]);
function isSearchableToken(token) {
  if (token.length > MAX_SEARCHABLE_TOKEN_LENGTH) {
    return false;
  }
  return token.length >= 3 || SHORT_SEARCHABLE_TOKENS.has(token.toLowerCase()) || /^[a-z]\d$/i.test(token);
}
function normalizeToken(token) {
  if (token === "kubernetes")
    return token;
  if (token === "scss" || token === "sass" || token === "less")
    return "css";
  if (token === "contributor" || token === "contributors")
    return "contribute";
  if (token.length > 5 && token.endsWith("ies"))
    return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("ied"))
    return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing"))
    return normalizeVerbStem(token.slice(0, -3));
  if (token.length > 3 && token.endsWith("ed"))
    return normalizeVerbStem(token.slice(0, -2));
  if (token.length > 4 && /(?:sses|shes|ches|xes|zes)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}
function normalizeVerbStem(stem) {
  const wasDoubled = /([a-z])\1$/.test(stem) && !stem.endsWith("ss");
  if (wasDoubled) {
    return stem.slice(0, -1);
  }
  const silentEStem = /(?:at|bl|iz|ap|ud|ac|ut|ov|et|dl|rg|ng|ic|out|rs|ch|lv)$/;
  return silentEStem.test(stem) || stemMeasure(stem) === 1 && endsConsonantVowelConsonant(stem) ? `${stem}e` : stem;
}
function stemMeasure(word) {
  let measure = 0;
  let previousWasVowel = false;
  for (let index = 0; index < word.length; index += 1) {
    const vowel = isStemVowel(word, index);
    if (previousWasVowel && !vowel)
      measure += 1;
    previousWasVowel = vowel;
  }
  return measure;
}
function endsConsonantVowelConsonant(word) {
  if (word.length < 3)
    return false;
  const last = word.length - 1;
  return !isStemVowel(word, last - 2) && isStemVowel(word, last - 1) && !isStemVowel(word, last) && !/[wxy]/.test(word[last] ?? "");
}
function isStemVowel(word, index) {
  const character = word[index] ?? "";
  if (/[aeiou]/.test(character))
    return true;
  return character === "y" && index > 0 && !isStemVowel(word, index - 1);
}
function tokenizePath(path) {
  return tokenizeText(path);
}

// packages/core/dist/grounding.js
var MAX_IDENTIFIER_MATCHED_FILES = 5;
var VAGUE_TASK_PATTERN = /^\s*(?:please\s+)?(?:improve|make|clean(?:\s+(?:this|it|things?))?\s+up|cleanup|refactor)\b/i;
var VAGUE_TASK_TERMS = /\b(?:please|improve|better|clean(?:\s+(?:this|it|things?))?\s+up|cleanup|refactor|developer\s+experience|dx|general|overall|codebase|quality|make|things?)\b/gi;
var CLUSTERED_RANKING_MARGIN = 2;
function analyzeTaskGrounding(repo, input) {
  const issueText = input.issueText ?? "";
  const signals = extractTaskSignals({
    issueText,
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const anchorIdentifiers = [...signals.identifiers].filter((identifier) => isAnchorIdentifier(identifier, issueText));
  const batchedMatches = collectBatchedIdentifierMatches(repo, anchorIdentifiers);
  const identifiers = anchorIdentifiers.map((identifier) => groundIdentifier(repo, identifier, batchedMatches.definitions.get(identifier), batchedMatches.text.get(identifier)));
  const unresolvedIdentifiers = identifiers.filter((entry) => entry.status === "not-found").map((entry) => entry.identifier);
  const partiallyResolvedIdentifiers = identifiers.filter((entry) => entry.status === "partial-definition").map((entry) => entry.identifier);
  const unverifiedIdentifiers = identifiers.filter((entry) => entry.status === "unverified").map((entry) => entry.identifier);
  const resolvedIdentifierCount = identifiers.filter((entry) => entry.status === "exact-definition" || entry.status === "exact-text").length;
  const hasMatchedFileMention = [...signals.fileMentions].some((mention) => repo.files.some((file) => pathMatchesMention(file.path, mention)));
  const hasDirectAnchor = hasMatchedFileMention || resolvedIdentifierCount > 0 || partiallyResolvedIdentifiers.length > 0;
  const issueTokens = tokenizeText(issueText);
  const singleTokenHasRepoMatch = issueTokens.size === 1 && repo.files.some((file) => {
    const token = [...issueTokens][0];
    return tokenizeText(file.path).has(token) || tokenizeText(file.textSample).has(token);
  });
  const singleUnmatchedToken = issueTokens.size === 1 && !singleTokenHasRepoMatch;
  const vague = !hasDirectAnchor && (isVagueTaskText(issueText) || singleUnmatchedToken);
  return {
    specificity: hasDirectAnchor ? "anchored" : vague ? "vague" : "descriptive",
    identifiers,
    unresolvedIdentifiers,
    partiallyResolvedIdentifiers,
    unverifiedIdentifiers,
    // "Complete" has to mean every candidate was actually read, not merely that the file
    // limit was never reached. A file past the sample ceiling, or one holding NUL bytes, is
    // still listed and still scored on its path while its contents were never seen — so a
    // report could claim a complete scan of a repository whose largest definition files went
    // unread, which is exactly where an answer hides.
    scanComplete: !repo.diagnostics.some((diagnostic) => diagnostic.code === "scan-limit-reached" || diagnostic.code === "tracked-paths-absent") && // Explicitly false, not merely absent: `textSampleComplete` is optional, and callers
    // that build a RepoMap by hand — the browser demo, an MCP client — leave it undefined.
    // Reading undefined as "incomplete" capped confidence for every one of them.
    !repo.files.some((file) => file.isSource && file.textSampleComplete === false)
  };
}
function buildGroundedTaskTokens(grounding, input) {
  if (grounding.unresolvedIdentifiers.length === 0) {
    return extractTaskSignals(input).tokens;
  }
  const sanitizedIssueText = removeIdentifiers(input.issueText ?? "", grounding.unresolvedIdentifiers);
  const sanitizedDiffText = removeIdentifiers(input.diffText ?? "", grounding.unresolvedIdentifiers);
  return extractTaskSignals({
    ...input,
    issueText: sanitizedIssueText,
    diffText: sanitizedDiffText
  }).tokens;
}
function buildRankingShape(contextFiles) {
  const sortedScores = contextFiles.map((file) => file.score).sort((a, b) => b - a);
  const topScore = sortedScores[0] ?? null;
  const runnerUpScore = sortedScores[1] ?? null;
  const topGap = topScore === null || runnerUpScore === null ? null : topScore - runnerUpScore;
  const thirdScore = sortedScores[2];
  const clustered = topScore !== null && thirdScore !== void 0 && topScore - thirdScore <= CLUSTERED_RANKING_MARGIN;
  return { topScore, runnerUpScore, topGap, clustered };
}
function buildNextAction(grounding, ranking, contextFiles, hasRoutedTests = true) {
  if (grounding.unresolvedIdentifiers.length > 0) {
    return "Verify or correct the unresolved identifiers before editing ranked files.";
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    return "Inspect the content diagnostics and make those source files readable before trusting identifier-based recommendations.";
  }
  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    return "Verify the partially matched symbol name in the leading file before editing.";
  }
  if (!grounding.scanComplete) {
    return "Narrow the repository or package scope, then rerun FixMap before treating the ranking as complete.";
  }
  if (grounding.specificity === "vague") {
    return "Add a concrete failing behavior, symbol, error string, command, or file path and rerun FixMap.";
  }
  if (ranking.clustered) {
    return "Treat the leading files as a subsystem neighborhood and verify the exact edit point before changing code.";
  }
  if (contextFiles[0]) {
    const leading = contextFiles.find((file) => !file.reasons.includes("generated build artifact; maintained source counterpart exists")) ?? contextFiles[0];
    return hasRoutedTests ? `Inspect ${leading.path} and its routed tests before editing.` : `Inspect ${leading.path} before editing; no related test file was routed.`;
  }
  return "Add a concrete repository anchor and rerun FixMap.";
}
function collectBatchedIdentifierMatches(repo, identifiers) {
  const definitions = collectIdentifierMatches(repo, identifiers, true);
  const withoutDefinitions = identifiers.filter((identifier) => (definitions.get(identifier)?.length ?? 0) === 0);
  return { definitions, text: collectIdentifierMatches(repo, withoutDefinitions, false) };
}
function collectIdentifierMatches(repo, identifiers, definitions) {
  const matches = new Map(identifiers.map((identifier) => [identifier, []]));
  if (identifiers.length === 0)
    return matches;
  const wanted = new Set(identifiers);
  const alternatives = [...identifiers].sort((a, b) => b.length - a.length || a.localeCompare(b)).map(escapeRegExp).join("|");
  const prefix = definitions ? "(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)" : "";
  const pattern = new RegExp("(?<![\\p{L}\\p{N}_$])" + prefix + "(" + alternatives + ")(?![\\p{L}\\p{N}_$])", "gu");
  for (const file of repo.files) {
    const found = /* @__PURE__ */ new Set();
    if (definitions) {
      for (const definition of extractLanguageDefinitions(file)) {
        if (wanted.has(definition.name))
          found.add(definition.name);
      }
    }
    for (const match of file.textSample.matchAll(pattern)) {
      if (match[1])
        found.add(match[1]);
    }
    for (const identifier of found) {
      const paths = matches.get(identifier);
      if (paths && paths.length < MAX_IDENTIFIER_MATCHED_FILES)
        paths.push(file.path);
    }
  }
  return matches;
}
function groundIdentifier(repo, identifier, precomputedDefinitionFiles, precomputedTextFiles) {
  const definitionPattern = new RegExp(`(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`, "u");
  const exactPattern = new RegExp(`(?<![\\p{L}\\p{N}_$])${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`, "u");
  const definitionFiles = precomputedDefinitionFiles ?? repo.files.filter((file) => extractLanguageDefinitions(file).some((entry) => entry.name === identifier) || definitionPattern.test(file.textSample)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  if (definitionFiles.length > 0) {
    return {
      identifier,
      status: "exact-definition",
      matchedFiles: definitionFiles
    };
  }
  const textFiles = precomputedTextFiles ?? repo.files.filter((file) => exactPattern.test(file.textSample)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  return textFiles.length > 0 ? { identifier, status: "exact-text", matchedFiles: textFiles } : groundPartialOrUnverifiedIdentifier(repo, identifier);
}
function groundPartialOrUnverifiedIdentifier(repo, identifier) {
  const identifierParts = tokenizeIdentifier(identifier);
  const partialFiles = repo.files.filter((file) => hasDefinitionContainingTokens(file, identifierParts)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  if (identifierParts.size >= 2 && partialFiles.length > 0) {
    return {
      identifier,
      status: "partial-definition",
      matchedFiles: partialFiles
    };
  }
  if (repo.files.some((file) => file.isSource && file.textSampleComplete === false)) {
    return { identifier, status: "unverified", matchedFiles: [] };
  }
  return { identifier, status: "not-found", matchedFiles: [] };
}
function hasDefinitionContainingTokens(file, expectedTokens) {
  if (expectedTokens.size < 2) {
    return false;
  }
  for (const definition of extractLanguageDefinitions(file)) {
    const candidateTokens = tokenizeIdentifier(definition.name);
    if ([...expectedTokens].every((token) => candidateTokens.has(token)))
      return true;
  }
  const definitionPattern = /(?<![\p{L}\p{N}_$])(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\s+)([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;
  for (const match of file.textSample.matchAll(definitionPattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const candidateTokens = tokenizeIdentifier(name);
    if ([...expectedTokens].every((token) => candidateTokens.has(token))) {
      return true;
    }
  }
  return false;
}
function isAnchorIdentifier(identifier, issueText) {
  if (new RegExp(`\`${escapeRegExp(identifier)}\``).test(issueText)) {
    return true;
  }
  if (/[_$0-9]/.test(identifier)) {
    return true;
  }
  if (!/^[\x00-\x7F]+$/.test(identifier)) {
    return true;
  }
  if (/^[a-z][A-Za-z0-9_$]*[A-Z]/.test(identifier)) {
    return true;
  }
  return [...identifier].filter((character) => /[A-Z]/.test(character)).length >= 3;
}
var MAX_RESIDUAL_TOKENS_FOR_VAGUE = 3;
function isVagueTaskText(issueText) {
  if (issueText.trim().length === 0 || !VAGUE_TASK_PATTERN.test(issueText)) {
    return false;
  }
  if (/^\s*(?:please\s+)?(?:refactor|cleanup|clean\s+up)\s+(?:broke|breaks?|caused|causes|deleted?|deletes?|fails?|failed)\b/i.test(issueText)) {
    return false;
  }
  const residual = tokenizeText(issueText.replace(VAGUE_TASK_TERMS, " "));
  return residual.size <= MAX_RESIDUAL_TOKENS_FOR_VAGUE;
}
function removeIdentifiers(text, identifiers) {
  return identifiers.reduce((current, identifier) => current.replace(new RegExp(escapeRegExp(identifier), "g"), " "), text);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// packages/core/dist/composer-projects.js
function buildComposerProjects(files) {
  const canonicalPaths = new Map(files.map((file) => [file.path.toLowerCase(), file.path]));
  return files.filter((file) => file.path === "composer.json" || file.path.endsWith("/composer.json")).sort((left, right) => left.path.localeCompare(right.path)).flatMap((file) => {
    let manifest;
    try {
      const parsed = JSON.parse(file.textSample);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return [];
      manifest = parsed;
    } catch {
      return [];
    }
    const root = directoryOf(file.path);
    const autoload = collectAutoload(manifest.autoload, root);
    const autoloadDev = collectAutoload(manifest["autoload-dev"], root);
    const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
    const testScript = typeof scripts.test === "string" && scripts.test.trim().length > 0 || Array.isArray(scripts.test) && scripts.test.length > 0 && scripts.test.every((entry) => typeof entry === "string" && entry.trim().length > 0);
    const requireDev = isRecord(manifest["require-dev"]) ? manifest["require-dev"] : {};
    const required = isRecord(manifest.require) ? manifest.require : {};
    const phpunitConfig = ["phpunit.xml", "phpunit.xml.dist"].map((name) => root ? `${root}/${name}` : name).map((path) => canonicalPaths.get(path.toLowerCase())).find((path) => path !== void 0);
    return [{
      path: file.path,
      root,
      psr4: [...autoload.psr4, ...autoloadDev.psr4].sort((left, right) => right.prefix.length - left.prefix.length || left.prefix.localeCompare(right.prefix)),
      classmap: [.../* @__PURE__ */ new Set([...autoload.classmap, ...autoloadDev.classmap])].sort((left, right) => left.localeCompare(right)),
      testScript,
      phpunitDependency: typeof requireDev["phpunit/phpunit"] === "string" && requireDev["phpunit/phpunit"].trim().length > 0 || typeof required["phpunit/phpunit"] === "string" && required["phpunit/phpunit"].trim().length > 0,
      ...phpunitConfig ? { phpunitConfig } : {}
    }];
  });
}
function composerProjectForPath(projects, path) {
  const matching = projects.filter((project) => project.root ? path.startsWith(`${project.root}/`) : true);
  if (matching.length === 0)
    return void 0;
  const deepest = Math.max(...matching.map((project) => depth(project.root)));
  const nearest = matching.filter((project) => depth(project.root) === deepest);
  return nearest.length === 1 ? nearest[0] : void 0;
}
function resolveComposerSymbol(project, symbol, repoPaths, suffixPaths) {
  const targets = /* @__PURE__ */ new Set();
  for (const mapping of project.psr4) {
    if (!symbol.startsWith(mapping.prefix))
      continue;
    const relative2 = symbol.slice(mapping.prefix.length).replace(/\\/g, "/");
    if (!relative2)
      continue;
    for (const root of mapping.roots) {
      const candidate = [root, `${relative2}.php`].filter(Boolean).join("/");
      if (repoPaths.has(candidate))
        targets.add(candidate);
    }
  }
  const shortName = symbol.split("\\").pop();
  if (shortName) {
    const suffix = `${shortName}.php`;
    for (const classmapRoot of project.classmap) {
      if (classmapRoot.toLowerCase().endsWith(".php"))
        continue;
      for (const candidate of suffixPaths.get(suffix) ?? []) {
        if (!classmapRoot || candidate.startsWith(`${classmapRoot}/`))
          targets.add(candidate);
      }
    }
  }
  return [...targets].sort((left, right) => left.localeCompare(right)).slice(0, 20);
}
function composerTestCommandForProject(project) {
  if (project.testScript) {
    return {
      command: project.root ? `composer --working-dir ${project.root} test` : "composer test",
      reason: `${project.path} explicitly declares the Composer test script`,
      scopeDir: project.root
    };
  }
  if (project.phpunitConfig || project.phpunitDependency) {
    const executable = project.phpunitDependency ? project.root ? `${project.root}/vendor/bin/phpunit` : "vendor/bin/phpunit" : "phpunit";
    return {
      command: `${executable}${project.phpunitConfig ? ` -c ${project.phpunitConfig}` : ""}`,
      reason: project.phpunitConfig ? `${project.phpunitConfig} explicitly configures PHPUnit` : `${project.path} declares phpunit/phpunit in require-dev`,
      scopeDir: project.root
    };
  }
  return void 0;
}
function collectAutoload(value, root) {
  if (!isRecord(value))
    return { psr4: [], classmap: [] };
  const rawPsr4 = isRecord(value["psr-4"]) ? value["psr-4"] : {};
  const psr4 = Object.entries(rawPsr4).flatMap(([prefix, rawRoots]) => {
    const roots = (typeof rawRoots === "string" ? [rawRoots] : Array.isArray(rawRoots) ? rawRoots : []).filter((entry) => typeof entry === "string").map((entry) => resolveManifestPath(root, entry)).filter((entry) => entry !== void 0);
    return prefix && roots.length > 0 ? [{ prefix, roots: [...new Set(roots)] }] : [];
  });
  const classmap = (Array.isArray(value.classmap) ? value.classmap : []).filter((entry) => typeof entry === "string").map((entry) => resolveManifestPath(root, entry)).filter((entry) => entry !== void 0);
  return { psr4, classmap };
}
function normalizeRepositoryPath(path) {
  const segments = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".")
      continue;
    if (segment === "..") {
      if (segments.length === 0)
        return void 0;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/").replace(/\/$/, "");
}
function resolveManifestPath(root, value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".")
    return root;
  if (/[$*?]/.test(trimmed) || /^[A-Za-z]:[\\/]|^[\\/]/.test(trimmed))
    return void 0;
  return normalizeRepositoryPath(root ? `${root}/${trimmed}` : trimmed);
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function directoryOf(path) {
  return path.split("/").slice(0, -1).join("/");
}
function depth(path) {
  return path.split("/").filter(Boolean).length;
}

// packages/core/dist/dotnet-projects.js
var PROJECT_FILE = /\.(?:csproj|fsproj|vbproj)$/i;
var PROJECT_REFERENCE = /<ProjectReference\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
function buildDotnetProjects(files) {
  const projectFiles = files.filter((file) => PROJECT_FILE.test(file.path)).sort((left, right) => left.path.localeCompare(right.path));
  const canonicalPaths = new Map(projectFiles.map((file) => [file.path.toLowerCase(), file.path]));
  return projectFiles.map((file) => {
    const root = directoryOf2(file.path);
    const references = /* @__PURE__ */ new Set();
    PROJECT_REFERENCE.lastIndex = 0;
    for (const match of file.textSample.matchAll(PROJECT_REFERENCE)) {
      const include = match[2]?.trim();
      if (!include || /[$*?]/.test(include) || /^[A-Za-z]:[\\/]|^[\\/]/.test(include))
        continue;
      const normalized = normalizeRepositoryPath2(root ? `${root}/${include}` : include);
      const canonical = normalized ? canonicalPaths.get(normalized.toLowerCase()) : void 0;
      if (canonical && canonical !== file.path)
        references.add(canonical);
    }
    return {
      path: file.path,
      root,
      references: [...references].sort((left, right) => left.localeCompare(right)),
      test: isDotnetTestProject(file)
    };
  });
}
function dotnetProjectForPath(projects, path) {
  if (PROJECT_FILE.test(path))
    return projects.find((project) => project.path === path);
  const matching = projects.filter((project) => project.root ? path.startsWith(`${project.root}/`) : true);
  if (matching.length === 0)
    return void 0;
  const deepest = Math.max(...matching.map((project) => project.root.split("/").filter(Boolean).length));
  const nearest = matching.filter((project) => project.root.split("/").filter(Boolean).length === deepest);
  return nearest.length === 1 ? nearest[0] : void 0;
}
function dotnetReferenceClosure(projects, projectPath) {
  const byPath = new Map(projects.map((project) => [project.path, project]));
  const reachable = /* @__PURE__ */ new Set();
  const pending = [projectPath];
  while (pending.length > 0) {
    const current = pending.shift();
    if (reachable.has(current))
      continue;
    reachable.add(current);
    for (const reference of byPath.get(current)?.references ?? []) {
      if (!reachable.has(reference))
        pending.push(reference);
    }
  }
  return reachable;
}
function referencingDotnetTestProjects(projects, projectPath) {
  return projects.filter((project) => project.test && dotnetReferenceClosure(projects, project.path).has(projectPath)).sort((left, right) => left.path.split("/").length - right.path.split("/").length || left.path.localeCompare(right.path));
}
function isDotnetTestProject(file) {
  return /<IsTestProject>\s*true\s*<\/IsTestProject>/i.test(file.textSample) || /<ProjectCapability\b[^>]*\bInclude\s*=\s*["'][^"']*\bTestContainer\b/i.test(file.textSample) || /<PackageReference\b[^>]*\bInclude\s*=\s*["']Microsoft\.NET\.Test\.Sdk["']/i.test(file.textSample) || /(?:^|\/)(?:test|tests)(?:\/|$)/i.test(file.path) || /(?:^|[._-])tests?\.(?:csproj|fsproj|vbproj)$/i.test(file.path.split("/").pop() ?? "");
}
function directoryOf2(path) {
  return path.split("/").slice(0, -1).join("/");
}
function normalizeRepositoryPath2(path) {
  const segments = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".")
      continue;
    if (segment === "..") {
      if (segments.length === 0)
        return void 0;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

// packages/core/dist/ruby-projects.js
function buildRubyProjects(files) {
  const manifests = files.filter((file) => file.path.split("/").pop()?.toLowerCase() === "gemfile").sort((left, right) => left.path.localeCompare(right.path));
  const shells = manifests.map((file) => ({ path: file.path, root: directoryOf3(file.path) }));
  return manifests.map((manifest) => {
    const root = directoryOf3(manifest.path);
    const scoped = files.filter((file) => rubyProjectForPath(shells, file.path)?.path === manifest.path);
    const rspecEvidence = /* @__PURE__ */ new Set();
    const minitestEvidence = /* @__PURE__ */ new Set();
    if (/^\s*gem\s*(?:\(|\s)\s*["']rspec(?:-[a-z0-9_-]+)?["']/im.test(manifest.textSample))
      rspecEvidence.add(manifest.path);
    if (/^\s*gem\s*(?:\(|\s)\s*["']minitest["']/im.test(manifest.textSample))
      minitestEvidence.add(manifest.path);
    for (const file of scoped) {
      const relative2 = root ? file.path.slice(root.length + 1) : file.path;
      if (relative2.toLowerCase() === ".rspec" || /(?:^|\/)spec\/(?:spec_helper|rails_helper)\.rb$/i.test(relative2) || /_spec\.rb$/i.test(relative2)) {
        rspecEvidence.add(file.path);
      }
      if (/(?:^|\/)test\/test_helper\.rb$/i.test(relative2) || /_test\.rb$/i.test(relative2) || /^(?:\s*require\s*\(?\s*["']minitest|\s*class\s+[^\n<]+<\s*(?:Minitest::Test|MiniTest::Unit)\b)/m.test(file.textSample)) {
        minitestEvidence.add(file.path);
      }
    }
    const rakefile = scoped.find((file) => file.path.split("/").pop()?.toLowerCase() === "rakefile");
    const rakeTestPath = rakefile && /\b(?:Rake::TestTask|task\s*(?:\(|\s)\s*:test\b)/.test(rakefile.textSample) ? rakefile.path : void 0;
    return {
      path: manifest.path,
      root,
      rspecEvidence: [...rspecEvidence].sort((left, right) => left.localeCompare(right)),
      minitestEvidence: [...minitestEvidence].sort((left, right) => left.localeCompare(right)),
      ...rakeTestPath ? { rakeTestPath } : {}
    };
  });
}
function rubyProjectForPath(projects, path) {
  const matching = projects.filter((project) => project.root ? path.startsWith(`${project.root}/`) : true);
  if (matching.length === 0)
    return void 0;
  const deepest = Math.max(...matching.map((project) => depth2(project.root)));
  const nearest = matching.filter((project) => depth2(project.root) === deepest);
  return nearest.length === 1 ? nearest[0] : void 0;
}
function rubyTestCommandForProject(project, relatedTests = []) {
  const relatedRspec = relatedTests.filter((path) => /_spec\.rb$/i.test(path));
  const relatedMinitest = relatedTests.filter((path) => /_test\.rb$/i.test(path));
  if (relatedRspec.length > 0 && relatedMinitest.length > 0)
    return void 0;
  const useRspec = relatedRspec.length > 0 || relatedMinitest.length === 0 && project.rspecEvidence.length > 0 && project.minitestEvidence.length === 0;
  const useMinitest = relatedMinitest.length > 0 || relatedRspec.length === 0 && project.minitestEvidence.length > 0 && project.rspecEvidence.length === 0;
  if (useRspec && project.rspecEvidence.length > 0) {
    return {
      command: scopedBundleCommand(project.root, "rspec"),
      reason: `${project.rspecEvidence[0]} provides RSpec test evidence for ${project.path}`,
      scopeDir: project.root
    };
  }
  if (useMinitest && project.minitestEvidence.length > 0) {
    if (project.rakeTestPath) {
      return {
        command: scopedBundleCommand(project.root, "rake test"),
        reason: `${project.path} has Minitest evidence and ${project.rakeTestPath} declares a test task`,
        scopeDir: project.root
      };
    }
    const testPath = relatedMinitest[0] ?? project.minitestEvidence.find((path) => /_test\.rb$/i.test(path));
    if (!testPath)
      return void 0;
    const relative2 = project.root ? testPath.slice(project.root.length + 1) : testPath;
    return {
      command: scopedBundleCommand(project.root, `ruby -Itest ${relative2}`),
      reason: `${testPath} provides executable Minitest evidence for ${project.path}`,
      scopeDir: project.root
    };
  }
  return void 0;
}
function scopedBundleCommand(root, command) {
  return root ? `ruby -C ${root} -S bundle exec ${command}` : `bundle exec ${command}`;
}
function directoryOf3(path) {
  return path.split("/").slice(0, -1).join("/");
}
function depth2(path) {
  return path.split("/").filter(Boolean).length;
}

// packages/core/dist/languages.js
var ROOT_MANIFESTS = {
  "cargo.toml": "rust",
  "go.mod": "go",
  "pyproject.toml": "python",
  "setup.py": "python",
  "setup.cfg": "python",
  // A requirements-only project is still declaring Python at the root; it just predates
  // pyproject.toml. Leaving these out labeled such repositories by extension share, which
  // reads as a guess when the root was in fact explicit.
  "requirements.txt": "python",
  "pipfile": "python",
  "package.json": "node",
  "gemfile": "ruby",
  "composer.json": "php",
  "pom.xml": "java",
  "build.gradle": "java",
  "build.gradle.kts": "java"
};
var EXTENSION_LANGUAGES = {
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".ts": "node",
  ".tsx": "node",
  ".js": "node",
  ".jsx": "node",
  ".mjs": "node",
  ".cjs": "node",
  ".rb": "ruby",
  ".php": "php",
  ".java": "java",
  ".cs": "dotnet"
};
function detectPrimaryLanguage(repo) {
  const manifests = rootManifestLanguages(repo.files);
  if (manifests.size === 1) {
    const [language, manifest2] = [...manifests][0];
    return { language, evidence: manifest2 };
  }
  const files = repo.files;
  const shares = countCodeFiles(files);
  const candidates = manifests.size > 1 ? [...manifests.keys()] : [...shares.keys()];
  const leader = candidates.map((language) => ({ language, count: shares.get(language) ?? 0 })).sort((a, b) => b.count - a.count || a.language.localeCompare(b.language))[0];
  if (!leader || leader.count === 0) {
    return { language: "unknown", evidence: "no root manifest and no recognizable source files" };
  }
  const total = [...shares.values()].reduce((sum, count) => sum + count, 0);
  const share = Math.round(leader.count / total * 100);
  const manifest = manifests.get(leader.language);
  if (manifest) {
    return { language: leader.language, evidence: `${manifest} and ${share}% of source files` };
  }
  const nested = nearestManifest(files, leader.language);
  return {
    language: leader.language,
    evidence: nested ? `${nested.path} and ${share}% of source files` : `${share}% of source files`
  };
}
function rootManifestLanguages(files) {
  const found = /* @__PURE__ */ new Map();
  for (const file of files) {
    if (file.path.includes("/")) {
      continue;
    }
    const language = languageForManifest(file.path.toLowerCase());
    if (language && !found.has(language)) {
      found.set(language, file.path);
    }
  }
  return found;
}
function nearestManifest(files, language) {
  const candidates = files.filter((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    return languageForManifest(name) === language;
  }).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const nearest = candidates[0];
  if (!nearest)
    return void 0;
  const segments = nearest.path.split("/");
  segments.pop();
  return { path: nearest.path, packageDir: segments.join("/") };
}
function countCodeFiles(files) {
  const counts = /* @__PURE__ */ new Map();
  for (const file of files) {
    if (file.isTest) {
      continue;
    }
    const language = EXTENSION_LANGUAGES[file.extension];
    if (language) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }
  return counts;
}
function manifestTestCommand(language, packageDir, files = []) {
  if (language === "go") {
    const manifest = nearestManifest(files, "go");
    if (!manifest) {
      return { command: "go test ./...", reason: "Go source files; no go.mod was found" };
    }
    if (manifest.packageDir) {
      return {
        command: `go test -C ${manifest.packageDir} ./...`,
        reason: `nearest module (${manifest.packageDir}) declared by ${manifest.path}`
      };
    }
    return { command: "go test ./...", reason: "go.mod at the repository root" };
  }
  if (language === "rust") {
    const requestedManifest = packageDir ? files.find((file) => file.path.toLowerCase() === `${packageDir}/cargo.toml`.toLowerCase()) : void 0;
    const manifest = requestedManifest ? { path: requestedManifest.path, packageDir } : nearestManifest(files, "rust");
    if (!manifest)
      return { command: "cargo test", reason: "Rust source files; no Cargo.toml was found" };
    return manifest.packageDir ? { command: `cargo test --manifest-path ${manifest.path}`, reason: `nearest crate (${manifest.packageDir}) declared by ${manifest.path}` } : { command: "cargo test", reason: "Cargo.toml at the repository root" };
  }
  if (language === "python") {
    const config = nearestPythonTestConfig(files, packageDir);
    if (!config)
      return void 0;
    const directory = config.path.split("/").slice(0, -1).join("/");
    if (config.runner === "nox") {
      return {
        command: directory ? `nox -f ${config.path}` : "nox",
        reason: `${config.path} explicitly configures nox`
      };
    }
    if (config.runner === "tox") {
      return {
        command: directory ? `tox -c ${config.path}` : "tox",
        reason: `${config.path} explicitly configures tox`
      };
    }
    if (config.runner === "unittest") {
      return {
        command: directory ? `python -m unittest discover -s ${directory}` : "python -m unittest discover",
        reason: `${config.path} uses Python's unittest framework`
      };
    }
    return {
      command: directory ? `python -m pytest -c ${config.path} ${directory}` : "python -m pytest",
      reason: `${config.path} explicitly configures pytest`
    };
  }
  if (language === "ruby") {
    const projects = buildRubyProjects(files);
    const candidates = packageDir ? projects.filter((project) => project.root === packageDir) : projects;
    return candidates.length === 1 ? rubyTestCommandForProject(candidates[0]) : void 0;
  }
  if (language === "php") {
    const projects = buildComposerProjects(files);
    const candidates = packageDir ? projects.filter((project) => project.root === packageDir) : projects;
    return candidates.length === 1 ? composerTestCommandForProject(candidates[0]) : void 0;
  }
  if (language === "java") {
    const javaManifest = requestedOrNearestManifest(files, "java", packageDir);
    if (!javaManifest)
      return void 0;
    const directory = javaManifest.packageDir;
    if (javaManifest.path.toLowerCase().endsWith("pom.xml")) {
      const wrapper2 = findWrapper(files, directory, ["mvnw", "mvnw.cmd"]);
      const command2 = wrapper2 ? `${posixExecutable(wrapper2)} test` : directory ? `mvn -f ${javaManifest.path} test` : "mvn test";
      const framework2 = javaTestFramework(files, directory);
      return {
        command: command2,
        reason: `${javaManifest.path} declares a Maven project${wrapper2 ? " with a wrapper" : ""}${framework2 ? `; ${framework2} tests detected` : ""}`
      };
    }
    const wrapper = findWrapper(files, directory, ["gradlew", "gradlew.bat"]);
    const executable = wrapper ? posixExecutable(wrapper) : "gradle";
    const command = directory ? `${executable} -p ${directory} test` : `${executable} test`;
    const framework = javaTestFramework(files, directory);
    return {
      command,
      reason: `${javaManifest.path} declares a Gradle project${wrapper ? " with a wrapper" : ""}${framework ? `; ${framework} tests detected` : ""}`
    };
  }
  if (language === "dotnet") {
    const projects = buildDotnetProjects(files);
    if (projects.length === 0) {
      return { command: "dotnet test", reason: ".NET source files; no project file was found" };
    }
    const candidates = packageDir ? projects.filter((project) => project.root === packageDir) : projects;
    return candidates.length === 1 ? dotnetCommandForProject(projects, candidates[0]) : void 0;
  }
  return void 0;
}
function dotnetTestCommandForPath(files, sourcePath) {
  const projects = buildDotnetProjects(files);
  const sourceProject = dotnetProjectForPath(projects, sourcePath);
  return sourceProject ? dotnetCommandForProject(projects, sourceProject) : void 0;
}
function phpTestCommandForPath(files, sourcePath) {
  const projects = buildComposerProjects(files);
  const project = composerProjectForPath(projects, sourcePath);
  return project ? composerTestCommandForProject(project) : void 0;
}
function rubyTestCommandForPath(files, sourcePath, relatedTests = []) {
  const projects = buildRubyProjects(files);
  const project = rubyProjectForPath(projects, sourcePath);
  return project ? rubyTestCommandForProject(project, relatedTests) : void 0;
}
function dotnetCommandForProject(projects, sourceProject) {
  const testProject = sourceProject.test ? sourceProject : referencingDotnetTestProjects(projects, sourceProject.path)[0];
  if (testProject && testProject.path !== sourceProject.path) {
    return {
      command: `dotnet test ${testProject.path}`,
      reason: `${testProject.path} is a test project that references ${sourceProject.path}`,
      scopeDir: testProject.root
    };
  }
  return {
    command: `dotnet test ${sourceProject.path}`,
    reason: `${sourceProject.path} declares the nearest .NET ${sourceProject.test ? "test " : ""}project`,
    scopeDir: sourceProject.root
  };
}
function nearestPythonTestConfig(files, packageDir) {
  const candidates = files.flatMap((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    let runner;
    if (name === "noxfile.py")
      runner = "nox";
    else if (name === "tox.ini" || name === "pyproject.toml" && /\[tool\.tox\b/i.test(file.textSample))
      runner = "tox";
    else if (name === "pytest.ini" || name === "pyproject.toml" && /\[tool\.pytest\.ini_options\]/i.test(file.textSample) || name === "setup.cfg" && /\[(?:tool:)?pytest\]/i.test(file.textSample))
      runner = "pytest";
    else if (file.isTest && /\b(?:import\s+unittest|unittest\.TestCase|from\s+unittest\s+import)\b/.test(file.textSample))
      runner = "unittest";
    return runner ? [{ file, runner }] : [];
  });
  const inRequestedPackage = packageDir ? candidates.filter(({ file, runner }) => runner === "unittest" ? file.path.startsWith(`${packageDir}/`) : file.path === `${packageDir}/${file.path.split("/").pop()}`) : [];
  const rootDeclaresPython = files.some((file) => !file.path.includes("/") && languageForManifest(file.path) === "python");
  const eligible = packageDir ? inRequestedPackage : rootDeclaresPython ? candidates.filter(({ file, runner }) => runner === "unittest" || !file.path.includes("/")) : candidates;
  const selected = eligible.sort((a, b) => a.file.path.split("/").length - b.file.path.split("/").length || a.file.path.localeCompare(b.file.path))[0];
  return selected ? { path: selected.file.path, runner: selected.runner } : void 0;
}
function javaTestFramework(files, packageDir) {
  const scoped = packageDir ? files.filter((file) => file.path.startsWith(`${packageDir}/`)) : files;
  const samples = scoped.filter((file) => file.isTest || /(?:pom\.xml|build\.gradle(?:\.kts)?)$/i.test(file.path)).map((file) => file.textSample).join("\n");
  if (/\b(?:org\.testng|testng)\b/i.test(samples))
    return "TestNG";
  if (/\b(?:org\.junit|junit-jupiter|junit)\b/i.test(samples))
    return "JUnit";
  return void 0;
}
function requestedOrNearestManifest(files, language, packageDir) {
  if (packageDir) {
    const requested = files.filter((file) => file.path.split("/").slice(0, -1).join("/") === packageDir).filter((file) => languageForManifest(file.path) === language).sort((a, b) => a.path.localeCompare(b.path))[0];
    if (requested)
      return { path: requested.path, packageDir };
  }
  return nearestManifest(files, language);
}
function findWrapper(files, packageDir, names) {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  const paths = packageDir ? names.map((name) => `${packageDir}/${name}`) : names;
  return files.find((file) => paths.some((path) => file.path.toLowerCase() === path.toLowerCase()))?.path ?? files.find((file) => !file.path.includes("/") && normalizedNames.has(file.path.toLowerCase()))?.path;
}
function posixExecutable(path) {
  return `./${path.replace(/\.cmd$|\.bat$/i, "")}`;
}
function suggestedRunner(language, files) {
  if (language === "python") {
    const configs = files.filter((file) => ["tox.ini", "pytest.ini", "pyproject.toml", "setup.cfg"].includes(file.path.split("/").pop()?.toLowerCase() ?? "")).sort((a, b) => a.path.split("/").length - b.path.split("/").length || Number((b.path.split("/").pop()?.toLowerCase() ?? "") === "tox.ini") - Number((a.path.split("/").pop()?.toLowerCase() ?? "") === "tox.ini") || a.path.localeCompare(b.path));
    const nearest = configs[0]?.path.split("/").pop()?.toLowerCase();
    if (nearest === "tox.ini") {
      return "tox";
    }
    if (nearest) {
      return "pytest";
    }
    return "pytest or unittest";
  }
  if (language === "go") {
    return "go test ./...";
  }
  if (language === "rust") {
    return "cargo test";
  }
  if (language === "ruby") {
    const commands = [...new Set(buildRubyProjects(files).map((project) => rubyTestCommandForProject(project)?.command).filter((command) => command !== void 0))];
    return commands.length === 1 ? commands[0] : void 0;
  }
  if (language === "php")
    return "composer test or vendor/bin/phpunit";
  if (language === "java")
    return "mvn test or ./gradlew test";
  if (language === "dotnet")
    return "dotnet test";
  return void 0;
}
function languageForManifest(path) {
  const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  return ROOT_MANIFESTS[name] ?? (/\.(?:csproj|fsproj|vbproj)$/.test(name) ? "dotnet" : void 0);
}

// packages/core/dist/import-graph.js
var RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];
var COMPILED_TO_SOURCE = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
var MAX_GRAPH_FILES = 5e3;
var MAX_EDGES_PER_FILE = 200;
function buildImportGraph(files) {
  const allParseable = files.filter((file) => languageAdapterForFile(file) && file.textSample.length > 0);
  const parseable = allParseable.slice(0, MAX_GRAPH_FILES);
  const dotnetProjects = buildDotnetProjects(files);
  const composerProjects = buildComposerProjects(files);
  const resolverIndex = buildResolverIndex(files, dotnetProjects, composerProjects);
  const aliases = buildAliases(files);
  const workspacePackages = buildWorkspacePackages(files);
  const imports = /* @__PURE__ */ new Map();
  const importedBy = /* @__PURE__ */ new Map();
  let truncatedEdges = 0;
  for (const file of parseable) {
    let edges = 0;
    for (const imported of extractLanguageImports(file)) {
      for (const target of resolveLanguageImport(file.path, imported, resolverIndex, aliases, workspacePackages)) {
        if (edges >= MAX_EDGES_PER_FILE) {
          truncatedEdges += 1;
          break;
        }
        if (target === file.path || imports.get(file.path)?.has(target))
          continue;
        addEdge(imports, file.path, target);
        addEdge(importedBy, target, file.path);
        edges += 1;
      }
      if (edges >= MAX_EDGES_PER_FILE)
        break;
    }
  }
  for (const project of dotnetProjects) {
    for (const reference of project.references.slice(0, MAX_EDGES_PER_FILE)) {
      addEdge(imports, project.path, reference);
      addEdge(importedBy, reference, project.path);
    }
    truncatedEdges += Math.max(0, project.references.length - MAX_EDGES_PER_FILE);
  }
  return {
    imports,
    importedBy,
    truncatedFiles: Math.max(0, allParseable.length - parseable.length),
    truncatedEdges
  };
}
function findImportProximity(graph, seedPaths) {
  const seeds = new Set(seedPaths);
  const proximity = /* @__PURE__ */ new Map();
  const orderedSeeds = [...seeds];
  for (const seed of orderedSeeds) {
    for (const neighbor of neighborsOf(graph, seed)) {
      if (!seeds.has(neighbor.path) && !proximity.has(neighbor.path)) {
        proximity.set(neighbor.path, { distance: 1, seed, direction: neighbor.direction });
      }
    }
  }
  const firstHop = [...proximity.keys()];
  for (const mid of firstHop) {
    const seed = proximity.get(mid)?.seed ?? mid;
    for (const neighbor of neighborsOf(graph, mid)) {
      if (!seeds.has(neighbor.path) && !proximity.has(neighbor.path)) {
        proximity.set(neighbor.path, { distance: 2, seed, direction: neighbor.direction });
      }
    }
  }
  return proximity;
}
function neighborsOf(graph, path) {
  const neighbors = [];
  for (const imported of [...graph.imports.get(path) ?? []].sort((a, b) => a.localeCompare(b))) {
    neighbors.push({ path: imported, direction: "imported-by" });
  }
  for (const importer of [...graph.importedBy.get(path) ?? []].sort((a, b) => a.localeCompare(b))) {
    neighbors.push({ path: importer, direction: "imports" });
  }
  return neighbors;
}
function resolveLanguageImport(fromPath, imported, resolverIndex, aliases, workspacePackages) {
  if (imported.adapter === "python") {
    return resolvePythonImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "java") {
    return resolveJavaImport(imported, resolverIndex);
  }
  if (imported.adapter === "go") {
    return resolveGoImport(imported, resolverIndex);
  }
  if (imported.adapter === "rust") {
    return resolveRustImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "ruby") {
    return resolveRubyImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "php") {
    return resolvePhpImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "dotnet") {
    return resolveDotnetImport(fromPath, imported, resolverIndex);
  }
  const target = resolveSpecifier(fromPath, imported.specifier, resolverIndex.repoPaths, aliases, workspacePackages);
  return target ? [target] : [];
}
function resolvePythonImport(fromPath, imported, resolverIndex) {
  const relativeMatch = /^(\.+)(.*)$/.exec(imported.specifier);
  let roots;
  if (relativeMatch?.[1] !== void 0) {
    const base = fromPath.split("/").slice(0, -1);
    const parentLevels = Math.max(0, relativeMatch[1].length - 1);
    if (parentLevels > base.length)
      return [];
    const packageRoot = base.slice(0, base.length - parentLevels);
    const moduleSegments = (relativeMatch[2] ?? "").split(".").filter(Boolean);
    roots = [[...packageRoot, ...moduleSegments].join("/")];
  } else {
    const modulePath = imported.specifier.replace(/\./g, "/");
    roots = [modulePath, `src/${modulePath}`];
  }
  const memberRoots = imported.importedNames.filter((name) => name !== "*").flatMap((name) => roots.map((root) => root ? `${root}/${name}` : name));
  const targets = /* @__PURE__ */ new Set();
  for (const root of [...memberRoots, ...roots]) {
    for (const candidate of pythonCandidates(root, resolverIndex, !relativeMatch)) {
      targets.add(candidate);
    }
  }
  return [...targets].sort((a, b) => a.localeCompare(b));
}
function pythonCandidates(root, resolverIndex, allowSuffix) {
  if (!root)
    return [];
  const suffixes = [`${root}.py`, `${root}.pyi`, `${root}/__init__.py`, `${root}/__init__.pyi`];
  const exact = suffixes.filter((candidate) => resolverIndex.repoPaths.has(candidate));
  if (exact.length > 0 || !allowSuffix)
    return exact;
  return [...new Set(suffixes.flatMap((suffix) => resolverIndex.suffixPaths.get(suffix) ?? []))].sort(shortestPathFirst).slice(0, 8);
}
function resolveJavaImport(imported, resolverIndex) {
  const modulePath = imported.specifier.replace(/\./g, "/");
  if (imported.wildcard) {
    return [...resolverIndex.javaPackagePaths.get(modulePath) ?? []].sort(shortestPathFirst);
  }
  const suffix = `${modulePath}.java`;
  const exact = resolverIndex.repoPaths.has(suffix) ? [suffix] : [];
  return [...exact, ...resolverIndex.suffixPaths.get(suffix) ?? []].sort(shortestPathFirst).slice(0, 1);
}
function resolveGoImport(imported, resolverIndex) {
  const module = resolverIndex.goModules.find((entry) => imported.specifier === entry.name || imported.specifier.startsWith(`${entry.name}/`));
  if (!module)
    return [];
  const suffix = imported.specifier === module.name ? "" : imported.specifier.slice(module.name.length + 1);
  const directory = [module.root, suffix].filter(Boolean).join("/");
  return (resolverIndex.directoryPaths.get(directory) ?? []).filter((path) => path.endsWith(".go") && !path.endsWith("_test.go")).sort(shortestPathFirst).slice(0, 20);
}
function resolveRustImport(fromPath, imported, resolverIndex) {
  const cargoRoot = nearestManifestDirectory(fromPath, "Cargo.toml", resolverIndex.repoPaths);
  const sourceRoot = cargoRoot ? `${cargoRoot}/src`.replace(/^\//, "") : fromPath.startsWith("src/") ? "src" : "";
  const segments = imported.specifier.replace(/::\*$/, "").split("::").filter(Boolean);
  const head = segments.shift();
  let base;
  if (head === "crate") {
    base = sourceRoot;
  } else if (head === "self" || head === "super") {
    const pathSegments = fromPath.split("/");
    const fileName = pathSegments.pop() ?? "";
    const stem = fileName.replace(/\.rs$/i, "");
    const isRootModule = ["lib", "main", "mod"].includes(stem);
    const moduleSegments = isRootModule ? pathSegments : [...pathSegments, stem];
    if (head === "super")
      moduleSegments.pop();
    base = moduleSegments.join("/");
  } else {
    return [];
  }
  for (let length = segments.length; length >= 1; length -= 1) {
    const root = [base, ...segments.slice(0, length)].filter(Boolean).join("/");
    const match = [`${root}.rs`, `${root}/mod.rs`].find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (match)
      return [match];
  }
  return [];
}
function resolveRubyImport(fromPath, imported, resolverIndex) {
  const separator = imported.specifier.indexOf(":");
  const mode = separator === -1 ? "" : imported.specifier.slice(0, separator);
  const raw = separator === -1 ? imported.specifier : imported.specifier.slice(separator + 1);
  const normalized = raw.replace(/\.rb$/i, "");
  const roots = mode === "relative" ? [normalizeSegments(`${fromPath.split("/").slice(0, -1).join("/")}/${normalized}`)].filter((value) => Boolean(value)) : [normalized, `lib/${normalized}`, `app/${normalized}`];
  for (const root of roots) {
    const match = [`${root}.rb`, `${root}/init.rb`].find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (match)
      return [match];
  }
  return [];
}
function resolvePhpImport(fromPath, imported, resolverIndex) {
  if (imported.specifier.startsWith("file:")) {
    const raw = imported.specifier.slice("file:".length);
    const root = normalizeSegments(`${fromPath.split("/").slice(0, -1).join("/")}/${raw}`);
    if (!root)
      return [];
    return resolverIndex.repoPaths.has(root) ? [root] : resolverIndex.repoPaths.has(`${root}.php`) ? [`${root}.php`] : [];
  }
  const symbol = imported.specifier.replace(/^\\+/, "").toLowerCase();
  const exact = resolverIndex.phpSymbols.get(symbol);
  const sourceProject = resolverIndex.composerProjectByFile.get(fromPath);
  if (exact?.length) {
    const scoped = sourceProject ? exact.filter((path) => resolverIndex.composerProjectByFile.get(path)?.path === sourceProject.path) : exact;
    if (scoped.length > 0)
      return [...scoped].sort(shortestPathFirst).slice(0, 1);
  }
  if (sourceProject) {
    const mapped = resolveComposerSymbol(sourceProject, imported.specifier.replace(/^\\+/, ""), resolverIndex.repoPaths, resolverIndex.suffixPaths);
    if (mapped.length > 0)
      return mapped;
  }
  const namespace = symbol.split("\\").slice(0, -1).join("\\");
  const namespacePaths = resolverIndex.phpNamespaces.get(namespace) ?? [];
  return (sourceProject ? namespacePaths.filter((path) => resolverIndex.composerProjectByFile.get(path)?.path === sourceProject.path) : namespacePaths).sort(shortestPathFirst).slice(0, 20);
}
function resolveDotnetImport(fromPath, imported, resolverIndex) {
  const namespace = imported.specifier.toLowerCase();
  const exact = resolverIndex.dotnetNamespaces.get(namespace) ?? [];
  const sourceProject = resolverIndex.dotnetProjectByFile.get(fromPath);
  if (!sourceProject)
    return exact.slice(0, 20);
  let reachableProjects = resolverIndex.dotnetReferenceClosures.get(sourceProject.path);
  if (!reachableProjects) {
    reachableProjects = dotnetReferenceClosure(resolverIndex.dotnetProjects, sourceProject.path);
    resolverIndex.dotnetReferenceClosures.set(sourceProject.path, reachableProjects);
  }
  return exact.filter((path) => {
    const targetProject = resolverIndex.dotnetProjectByFile.get(path);
    return targetProject !== void 0 && reachableProjects.has(targetProject.path);
  }).slice(0, 20);
}
function buildResolverIndex(files, dotnetProjects, composerProjects) {
  const repoPaths = new Set(files.map((file) => file.path));
  const suffixPaths = /* @__PURE__ */ new Map();
  const javaPackagePaths = /* @__PURE__ */ new Map();
  const directoryPaths = /* @__PURE__ */ new Map();
  const goModules = [];
  const phpSymbols = /* @__PURE__ */ new Map();
  const phpNamespaces = /* @__PURE__ */ new Map();
  const dotnetNamespaces = /* @__PURE__ */ new Map();
  const dotnetProjectByFile = /* @__PURE__ */ new Map();
  const composerProjectByFile = /* @__PURE__ */ new Map();
  const dotnetProjectsByRoot = /* @__PURE__ */ new Map();
  for (const project of dotnetProjects) {
    const existing = dotnetProjectsByRoot.get(project.root);
    if (existing)
      existing.push(project);
    else
      dotnetProjectsByRoot.set(project.root, [project]);
  }
  const composerProjectsByRoot = /* @__PURE__ */ new Map();
  for (const project of composerProjects) {
    const existing = composerProjectsByRoot.get(project.root);
    if (existing)
      existing.push(project);
    else
      composerProjectsByRoot.set(project.root, [project]);
  }
  for (const file of files) {
    const segments = file.path.split("/");
    addIndexedPath(directoryPaths, segments.slice(0, -1).join("/"), file.path);
    if (/\.(?:py|pyi|java|php)$/i.test(file.path)) {
      for (let start = 1; start < segments.length; start += 1) {
        addIndexedPath(suffixPaths, segments.slice(start).join("/"), file.path);
      }
    }
    if (file.path.toLowerCase().endsWith(".java")) {
      const directories = segments.slice(0, -1);
      for (let start = 0; start < directories.length; start += 1) {
        addIndexedPath(javaPackagePaths, directories.slice(start).join("/"), file.path);
      }
    }
    if (file.path === "go.mod" || file.path.endsWith("/go.mod")) {
      const name = /^\s*module\s+([^\s]+)\s*$/m.exec(file.textSample)?.[1];
      if (name)
        goModules.push({ name, root: segments.slice(0, -1).join("/") });
    }
    if (file.path.toLowerCase().endsWith(".php")) {
      const owner = projectForSourcePath(file.path, composerProjectsByRoot);
      if (owner)
        composerProjectByFile.set(file.path, owner);
      const namespace = /^\s*namespace\s+([^;{\n]+)\s*[;{]/m.exec(file.textSample)?.[1]?.trim().replace(/^\\+|\\+$/g, "");
      if (namespace) {
        const normalizedNamespace = namespace.toLowerCase();
        addIndexedPath(phpNamespaces, normalizedNamespace, file.path);
        for (const definition of extractLanguageDefinitions(file)) {
          if (["class", "interface", "type"].includes(definition.kind)) {
            addIndexedPath(phpSymbols, `${normalizedNamespace}\\${definition.name.toLowerCase()}`, file.path);
          }
        }
      }
    }
    if (file.path.toLowerCase().endsWith(".cs")) {
      const namespace = /\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(?:;|\{)/m.exec(file.textSample)?.[1]?.toLowerCase();
      if (namespace)
        addIndexedPath(dotnetNamespaces, namespace, file.path);
      const owner = projectForSourcePath(file.path, dotnetProjectsByRoot);
      if (owner)
        dotnetProjectByFile.set(file.path, owner);
    }
  }
  goModules.sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
  for (const paths of dotnetNamespaces.values())
    paths.sort(shortestPathFirst);
  return {
    repoPaths,
    suffixPaths,
    javaPackagePaths,
    directoryPaths,
    goModules,
    phpSymbols,
    phpNamespaces,
    dotnetNamespaces,
    dotnetProjects,
    dotnetProjectByFile,
    dotnetReferenceClosures: /* @__PURE__ */ new Map(),
    composerProjectByFile
  };
}
function projectForSourcePath(path, projectsByRoot) {
  const directories = path.split("/").slice(0, -1);
  for (let length = directories.length; length >= 0; length -= 1) {
    const root = directories.slice(0, length).join("/");
    const projects = projectsByRoot.get(root) ?? [];
    if (projects.length > 0)
      return projects.length === 1 ? projects[0] : void 0;
  }
  return void 0;
}
function nearestManifestDirectory(fromPath, manifest, repoPaths) {
  const directories = fromPath.split("/").slice(0, -1);
  for (let length = directories.length; length >= 0; length -= 1) {
    const directory = directories.slice(0, length).join("/");
    const candidate = directory ? `${directory}/${manifest}` : manifest;
    if (repoPaths.has(candidate))
      return directory;
  }
  return void 0;
}
function addIndexedPath(index, key, path) {
  const existing = index.get(key);
  if (existing)
    existing.push(path);
  else
    index.set(key, [path]);
}
function shortestPathFirst(left, right) {
  return left.split("/").length - right.split("/").length || left.localeCompare(right);
}
function resolveSpecifier(fromPath, specifier, repoPaths, aliases, workspacePackages) {
  const baseDir = fromPath.split("/").slice(0, -1).join("/");
  const roots = [];
  if (specifier.startsWith(".")) {
    const joined = normalizeSegments(baseDir ? `${baseDir}/${specifier}` : specifier);
    if (joined)
      roots.push(joined);
  } else {
    roots.push(...workspacePackages.get(specifier) ?? []);
    for (const alias of aliases) {
      if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix))
        continue;
      const middle = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length || void 0);
      roots.push(...alias.targets.map((target) => target.replace("*", middle)));
    }
  }
  for (const root of roots) {
    const resolved = resolveCandidate(root, repoPaths);
    if (resolved)
      return resolved;
  }
  return void 0;
}
function resolveCandidate(joined, repoPaths) {
  const candidates = [joined];
  const lastSegment = joined.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  const extension = dot > 0 ? lastSegment.slice(dot) : "";
  for (const sourceExtension of COMPILED_TO_SOURCE[extension] ?? []) {
    candidates.push(`${joined.slice(0, -extension.length)}${sourceExtension}`);
  }
  if (!extension) {
    for (const resolveExtension of RESOLVE_EXTENSIONS) {
      candidates.push(`${joined}${resolveExtension}`);
    }
  }
  for (const resolveExtension of RESOLVE_EXTENSIONS) {
    candidates.push(`${joined}/index${resolveExtension}`);
  }
  return candidates.find((candidate) => repoPaths.has(candidate));
}
function buildWorkspacePackages(files) {
  const packages = /* @__PURE__ */ new Map();
  for (const file of files.filter((entry) => entry.path === "package.json" || entry.path.endsWith("/package.json"))) {
    try {
      const manifest = JSON.parse(file.textSample);
      if (typeof manifest.name !== "string" || !manifest.name.trim())
        continue;
      const dir = file.path.split("/").slice(0, -1).join("/");
      const declared = [manifest.source, manifest.module, manifest.main, manifest.types].filter((entry) => typeof entry === "string").map((entry) => normalizeSegments(dir ? `${dir}/${entry}` : entry)).filter((entry) => Boolean(entry));
      packages.set(manifest.name, [
        ...declared,
        ...dir ? [`${dir}/src/index`, `${dir}/index`] : ["src/index", "index"]
      ]);
    } catch {
    }
  }
  return packages;
}
function buildAliases(files) {
  const aliases = [];
  for (const file of files.filter((entry) => /(^|\/)(?:tsconfig|jsconfig)(?:\.[^/]*)?\.json$/i.test(entry.path))) {
    try {
      const config = JSON.parse(file.textSample);
      const paths = config.compilerOptions?.paths;
      if (!paths || typeof paths !== "object" || Array.isArray(paths))
        continue;
      const dir = file.path.split("/").slice(0, -1).join("/");
      const baseUrl = typeof config.compilerOptions?.baseUrl === "string" ? config.compilerOptions.baseUrl : ".";
      const base = normalizeSegments(dir ? `${dir}/${baseUrl}` : baseUrl) ?? "";
      for (const [pattern, rawTargets] of Object.entries(paths)) {
        if (!Array.isArray(rawTargets) || !rawTargets.every((entry) => typeof entry === "string"))
          continue;
        const star = pattern.indexOf("*");
        aliases.push({
          prefix: star === -1 ? pattern : pattern.slice(0, star),
          suffix: star === -1 ? "" : pattern.slice(star + 1),
          targets: rawTargets.map((target) => normalizeSegments(base ? `${base}/${target}` : target)).filter((target) => Boolean(target))
        });
      }
    } catch {
    }
  }
  return aliases;
}
function normalizeSegments(path) {
  const segments = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return void 0;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}
function addEdge(edges, from, to) {
  const existing = edges.get(from);
  if (existing) {
    existing.add(to);
  } else {
    edges.set(from, /* @__PURE__ */ new Set([to]));
  }
}

// packages/core/dist/artifacts.js
var AGENT_COMMAND_PATHS = /* @__PURE__ */ new Set([
  ".agents/skills/fixmap/skill.md",
  ".claude/skills/fixmap/skill.md",
  ".cursor/commands/fixmap.md",
  ".github/prompts/fixmap.prompt.md"
]);
var AGENT_COMMAND_MARKER = "You are the FixMap workflow assistant for this repository.";
function fixMapArtifactKind(file) {
  const text = file.textSample.trimStart();
  if (!text)
    return void 0;
  if (AGENT_COMMAND_PATHS.has(file.path.replace(/\\/g, "/").toLowerCase()) && text.includes(AGENT_COMMAND_MARKER)) {
    return "agent-command";
  }
  if (text.startsWith("# FixMap Report\n") && text.includes("\n## Context Files\n"))
    return "report-markdown";
  if (text.startsWith("# FixMap Context\n") && text.includes("\n## Task\n"))
    return "context-markdown";
  if (text.startsWith("# FixMap Change Scope\n") && text.includes("\n## Declared anchors\n"))
    return "change-scope-markdown";
  if (text.startsWith("# FixMap Capability:") && text.includes("\n## Declared anchors\n"))
    return "capability-map-markdown";
  if (text.startsWith("# FixMap Capability Diff:") && text.includes("\n## Selected scope\n"))
    return "capability-history-markdown";
  if (text.startsWith("# FixMap Capabilities\n"))
    return "capability-list-markdown";
  if (!file.path.toLowerCase().endsWith(".json") || file.textSampleComplete === false)
    return void 0;
  let candidate;
  try {
    candidate = JSON.parse(file.textSample);
  } catch {
    return void 0;
  }
  if (!isRecord2(candidate))
    return void 0;
  if (candidate.changeScopeVersion === 1 && Array.isArray(candidate.anchors) && Array.isArray(candidate.selected) && Array.isArray(candidate.affected)) {
    return "change-scope-json";
  }
  if (candidate.capabilityMapVersion === 1 && isRecord2(candidate.capability) && isRecord2(candidate.scope)) {
    return "capability-map-json";
  }
  if (candidate.capabilityHistoryVersion === 1 && typeof candidate.id === "string" && isRecord2(candidate.from) && isRecord2(candidate.to)) {
    return "capability-history-json";
  }
  if (candidate.capabilityListVersion === 1 && Array.isArray(candidate.capabilities))
    return "capability-list-json";
  if ((candidate.reportVersion === void 0 || candidate.reportVersion === 1) && typeof candidate.summary === "string" && Array.isArray(candidate.contextFiles) && Array.isArray(candidate.testRoutes) && Array.isArray(candidate.risks) && Array.isArray(candidate.changedFiles) && Array.isArray(candidate.diagnostics))
    return "report-json";
  if (candidate.contextVersion === 1 && typeof candidate.task === "string" && typeof candidate.budgetTokens === "number" && candidate.tokenEstimate === "utf8-bytes-divided-by-4" && Array.isArray(candidate.snippets) && Array.isArray(candidate.omitted))
    return "context-json";
  if (typeof candidate.summary === "string" && Array.isArray(candidate.changedFiles) && Array.isArray(candidate.findings) && Array.isArray(candidate.diagnostics))
    return "verify-json";
  return void 0;
}
function isFixMapArtifact(file) {
  return fixMapArtifactKind(file) !== void 0;
}
function isRecord2(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

// packages/core/dist/impact.js
var DEFAULT_IMPACT_LIMIT = 12;
var MAX_IMPACT_SEEDS = 3;
var MIN_CO_CHANGE_OCCURRENCES = 2;
function buildImpactMap(repo, requestedSeeds, testRoutes = [], limit = DEFAULT_IMPACT_LIMIT) {
  const repositoryPaths = new Set(repo.files.filter((file) => !isFixMapArtifact(file)).map((file) => file.path));
  const seeds = [...new Set(requestedSeeds)].filter((path) => repositoryPaths.has(path)).slice(0, MAX_IMPACT_SEEDS);
  const seedSet = new Set(seeds);
  const candidates = /* @__PURE__ */ new Map();
  const addEvidence = (path, score, evidence) => {
    if (seedSet.has(path) || !repositoryPaths.has(path) || isGeneratedPath(path) || isBackupPath(path))
      return;
    const current = candidates.get(path) ?? { path, score: 0, evidence: [] };
    if (!current.evidence.some((entry) => entry.kind === evidence.kind && entry.seed === evidence.seed)) {
      current.evidence.push(evidence);
      current.score += score;
    }
    candidates.set(path, current);
  };
  const graph = buildImportGraph(repo.files);
  for (const seed of seeds) {
    for (const imported of [...graph.imports.get(seed) ?? []].sort((a, b) => a.localeCompare(b))) {
      addEvidence(imported, 4, {
        kind: "imports",
        seed,
        reason: `${seed} imports this file`
      });
    }
    for (const importer of [...graph.importedBy.get(seed) ?? []].sort((a, b) => a.localeCompare(b))) {
      addEvidence(importer, 6, {
        kind: "imported-by",
        seed,
        reason: `this file imports ${seed}`
      });
    }
  }
  for (const route of testRoutes.filter((entry) => entry.kind === "test")) {
    for (const path of route.relatedFiles) {
      const importedSeeds = [...graph.imports.get(path) ?? []].filter((imported) => seedSet.has(imported));
      const seed = nearestSeed(path, importedSeeds) ?? nearestSeed(path, seeds) ?? seeds[0];
      if (!seed)
        continue;
      addEvidence(path, 7, {
        kind: "test-route",
        seed,
        reason: `routed test for ${seed} via ${route.command}`
      });
    }
  }
  const history = repo.history;
  if (history) {
    for (const seed of seeds) {
      const seedCommits = history.commits.filter((commit) => commit.files.includes(seed));
      const coOccurrences = /* @__PURE__ */ new Map();
      for (const commit of seedCommits) {
        for (const path of commit.files) {
          if (path !== seed && repositoryPaths.has(path)) {
            coOccurrences.set(path, (coOccurrences.get(path) ?? 0) + 1);
          }
        }
      }
      for (const [path, occurrences] of coOccurrences) {
        if (occurrences < MIN_CO_CHANGE_OCCURRENCES)
          continue;
        const strength = occurrences / Math.max(seedCommits.length, 1);
        const score = Math.min(8, 2 + Math.round(strength * 6));
        addEvidence(path, score, {
          kind: "co-change",
          seed,
          reason: `changed alongside ${seed} in ${occurrences} of its ${seedCommits.length} eligible ${seedCommits.length === 1 ? "change" : "changes"}`,
          occurrences,
          seedChanges: seedCommits.length
        });
      }
    }
  }
  const files = [...candidates.values()].map(toImpactFile).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)).slice(0, Math.max(0, limit));
  return {
    seeds,
    files,
    inspectionOrder: [...seeds, ...files.map((file) => file.path)],
    history: {
      available: Boolean(history),
      eligibleCommits: history?.commits.length ?? 0,
      shallow: history?.shallow ?? false,
      truncated: history?.truncated ?? false
    }
  };
}
function toImpactFile(candidate) {
  const kinds = new Set(candidate.evidence.map((entry) => entry.kind));
  const strongestCoChange = candidate.evidence.filter((entry) => entry.kind === "co-change").reduce((best, entry) => Math.max(best, (entry.occurrences ?? 0) / Math.max(entry.seedChanges ?? 1, 1)), 0);
  const confidence = kinds.has("test-route") || kinds.size >= 2 || strongestCoChange >= 0.6 ? "high" : kinds.has("imported-by") || kinds.has("imports") || strongestCoChange >= 0.3 ? "medium" : "low";
  return {
    path: candidate.path,
    score: candidate.score,
    confidence,
    evidence: candidate.evidence.sort((left, right) => left.kind.localeCompare(right.kind) || left.seed.localeCompare(right.seed))
  };
}
function nearestSeed(path, seeds) {
  const pathParts = path.split("/");
  return [...seeds].map((seed) => {
    const seedParts = seed.split("/");
    let common = 0;
    while (common < pathParts.length && common < seedParts.length && pathParts[common] === seedParts[common])
      common += 1;
    return { seed, common };
  }).sort((left, right) => right.common - left.common || left.seed.localeCompare(right.seed))[0]?.seed;
}

// packages/core/dist/retrieval.js
var STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being
below between both but by can cannot could did do does doing down during each few for from further had has have having
he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other
ought our out over own same she should so some such than that the their them then there these they this those through
to too under until up very was we were what when where which while who whom why with would you your
bug issue issues error errors expected actual behavior behaviour reproduce reproduction steps version versions node npm
report repo repository description example code please thanks title type severity confidence location line lines
following above below see also would should could may might must will can also using used use uses`.split(/\s+/));
function retrievalTokens(text) {
  const tokens = [];
  for (const raw of text.match(/[A-Za-z0-9_$]+/g) ?? []) {
    const lower = raw.toLowerCase();
    if (lower.length >= 3)
      tokens.push(lower);
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter((part) => part.length >= 3);
    if (parts.length > 1)
      tokens.push(...parts.map((part) => part.toLowerCase()));
  }
  return tokens;
}
function retrievalQueryTerms(task) {
  return [...new Set(retrievalTokens(task))].filter((term) => !STOPWORDS.has(term));
}
var TECHNICAL_ALIASES = Object.freeze({
  auth: ["authentication"],
  authentication: ["auth"],
  cli: ["commandline"],
  commandline: ["cli"],
  config: ["configuration"],
  configuration: ["config"],
  db: ["database"],
  database: ["db"],
  env: ["environment"],
  environment: ["env"],
  ui: ["interface"],
  interface: ["ui"]
});
function buildRetrievalQuery(task) {
  const originalTerms = retrievalQueryTerms(task);
  const seen = new Set(originalTerms);
  const expansions = [];
  const add = (term, source, rule) => {
    if (term.length < 3 || STOPWORDS.has(term) || seen.has(term))
      return;
    seen.add(term);
    expansions.push({ term, source, rule });
  };
  for (const source of originalTerms) {
    const aliases = Object.hasOwn(TECHNICAL_ALIASES, source) ? TECHNICAL_ALIASES[source] ?? [] : [];
    for (const alias of aliases)
      add(alias, source, "technical-alias");
    if (source.endsWith("ies") && source.length > 5)
      add(`${source.slice(0, -3)}y`, source, "inflection");
    else if (source.endsWith("s") && !source.endsWith("ss") && source.length > 4)
      add(source.slice(0, -1), source, "inflection");
  }
  return { originalTerms, terms: [...seen], expansions };
}
function rankByBm25Detailed(files, task, limit = 5, eligibleKinds = /* @__PURE__ */ new Set(["code"])) {
  const candidates = files.filter((file) => file.isSource && !file.isTest && eligibleKinds.has(file.kind));
  return rankDocumentsByBm25(candidates.map((file) => ({ id: file.path, text: `${file.path}
${file.searchTextSample ?? file.textSample}` })), task, limit);
}
function rankSymbolsByBm25Detailed(files, task, limit = 50) {
  const units = files.flatMap((file) => extractLanguageDefinitions(file).map((definition, index) => {
    const searchText = file.searchTextSample ?? file.textSample;
    const offset = definition.offset ?? searchText.indexOf(definition.name);
    const start = Math.max(0, offset - 500);
    const end = Math.min(searchText.length, offset + definition.name.length + 1e3);
    return {
      id: `${file.path}#${definition.name}:${index}`,
      path: file.path,
      symbol: definition.name,
      kind: definition.kind,
      text: `${file.path}
${definition.kind} ${definition.name}
${searchText.slice(start, end)}`
    };
  }));
  const ranked = rankDocumentsByBm25(units, task, Math.max(limit * 4, limit));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const seenPaths = /* @__PURE__ */ new Set();
  const hits = [];
  for (const entry of ranked) {
    const unit = byId.get(entry.id);
    if (!unit || seenPaths.has(unit.path))
      continue;
    seenPaths.add(unit.path);
    hits.push({ ...entry, rank: hits.length + 1, path: unit.path, symbol: unit.symbol, kind: unit.kind });
    if (hits.length >= Math.max(0, limit))
      break;
  }
  return hits;
}
function rankDocumentsByBm25(inputs, task, limit = 5) {
  const terms = buildRetrievalQuery(task).terms;
  if (inputs.length === 0 || terms.length === 0)
    return [];
  const queryTerms = new Set(terms);
  const documentFrequency = new Map(terms.map((term) => [term, 0]));
  const documents = inputs.map((input) => {
    const statistics = bm25DocumentStatistics(input.text, queryTerms);
    for (const term of statistics.counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    return { id: input.id, ...statistics };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const top = [];
  const boundedLimit = Math.max(0, Math.min(documents.length, limit));
  if (boundedLimit === 0)
    return [];
  for (const document of documents) {
    let score = 0;
    for (const term of terms) {
      const frequency = document.counts.get(term) ?? 0;
      if (frequency === 0)
        continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      score += idf * (frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * document.length / averageLength)));
    }
    if (score > 0)
      insertBoundedBm25(top, { id: document.id, score }, boundedLimit);
  }
  return top.map((entry, index) => ({ ...entry, rank: index + 1 }));
}
function insertBoundedBm25(top, entry, limit) {
  let low = 0;
  let high = top.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (compareBm25(entry, top[middle]) < 0)
      high = middle;
    else
      low = middle + 1;
  }
  if (low >= limit)
    return;
  top.splice(low, 0, entry);
  if (top.length > limit)
    top.pop();
}
function compareBm25(left, right) {
  return right.score - left.score || left.id.localeCompare(right.id);
}
function bm25DocumentStatistics(text, queryTerms) {
  const counts = /* @__PURE__ */ new Map();
  let length = 0;
  const record = (token) => {
    length += 1;
    if (queryTerms.has(token))
      counts.set(token, (counts.get(token) ?? 0) + 1);
  };
  for (const match of text.matchAll(/[A-Za-z0-9_$]+/g)) {
    const raw = match[0];
    const lower = raw.toLowerCase();
    if (lower.length >= 3)
      record(lower);
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter((part) => part.length >= 3);
    if (parts.length > 1)
      for (const part of parts)
        record(part.toLowerCase());
  }
  return { counts, length };
}

// packages/core/dist/rank.js
var DEPLOYMENT_TERMS = [
  "deploy",
  "deployment",
  "vercel",
  "netlify",
  "docker",
  "kubernetes",
  "hosting",
  "serverless",
  "production"
];
var CONFIGURATION_TERMS = ["config", "configuration", "workflow", "action", "ci", "yaml"];
var PRESENTATION_TERMS = [
  "browser",
  "button",
  "client",
  "display",
  "form",
  "frontend",
  "layout",
  "page",
  "screen",
  "ui",
  "visitor",
  "web",
  "website"
];
var RANKING_SIGNAL_TERMS = [...DEPLOYMENT_TERMS, ...CONFIGURATION_TERMS, ...PRESENTATION_TERMS];
var AUXILIARY_CODE_DIRS = /* @__PURE__ */ new Set(["demo", "demos", "example", "examples", "sample", "samples"]);
var COMPILED_TO_SOURCE_MENTION_EXTENSIONS = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
var MAX_FILES_PER_MENTION = 5;
var MAX_PROXIMITY_SEEDS = 5;
var IMPORT_PROXIMITY_BOOSTS = { 1: 4, 2: 2 };
var EXAMPLE_CODE_PENALTY = 8;
var AUXILIARY_REPRODUCTION_PENALTY = 20;
var PRESENTATION_CODE_PENALTY = 8;
var INTERACTIVE_PRESENTATION_BOOST = 4;
var TYPE_DECLARATION_PENALTY = 4;
var TYPE_DECLARATION_DIRECT_PENALTY = 8;
var BACKUP_COPY_PENALTY = 10;
var BUNDLED_OUTPUT_PENALTY = 16;
var GENERATED_TWIN_PENALTY = 21;
var GENERATED_TWIN_REASON = "generated build artifact; maintained source counterpart exists";
var BUNDLED_LINE_LENGTH = 400;
var MIN_BUNDLE_SAMPLE_BYTES = 2e3;
var BUNDLE_MARKERS = [
  /\b__webpack_require__\b/,
  /\bwebpackChunk[A-Za-z0-9_$]*\b/,
  /\/\*\s*webpack\/runtime\//,
  /\/\*\s*harmony (?:export|import)\s*\*\//,
  /\b__commonJS\s*=/,
  /\b__toESM\s*=/,
  /\b__defProp\s*=/,
  /\/\/# sourceMappingURL=/
];
var EXPLICIT_PATH_BOOST = 60;
var EXACT_LITERAL_BOOST = 8;
var MEMBER_MENTION_BOOST = 8;
var WIDESPREAD_TOKEN_SHARE = 0.85;
var DEFINITION_IDENTIFIER_BOOST = 24;
var DEFINITION_LITERAL_BOOST = 8;
var MAX_DEFINITION_IDENTIFIERS = 2;
var TASK_MATCHED_DEFINITION_BOOST = 4;
var HIGH_CONFIDENCE_MARGIN = CLUSTERED_RANKING_MARGIN;
var REPORT_SCORE_CUTOFF = 4;
var DEFAULT_CONTEXT_FILE_LIMIT = 8;
var RETRIEVAL_CANDIDATES_PER_SOURCE = 50;
function rankContextFiles(repo, input, limit = DEFAULT_CONTEXT_FILE_LIMIT, minScore = REPORT_SCORE_CUTOFF) {
  if (minScore !== REPORT_SCORE_CUTOFF) {
    return rankContextFilesDetailed(repo, input, limit, minScore).contextFiles;
  }
  return rankContextFilesEvidenceDetailed(repo, input, limit, minScore).contextFiles;
}
function rankContextFilesEvidenceDetailed(repo, input, limit = DEFAULT_CONTEXT_FILE_LIMIT, minScore = REPORT_SCORE_CUTOFF) {
  const startedAt = performance.now();
  const structuralResult = rankContextFilesDetailed(repo, input, Number.MAX_SAFE_INTEGER, Number.NEGATIVE_INFINITY);
  const structuralFinishedAt = performance.now();
  const structural = structuralResult.contextFiles;
  const structuralByPath = new Map(structural.map((file) => [file.path, file]));
  const eligibleFiles = repo.files.filter((file) => structuralByPath.has(file.path));
  const task = [input.issueText ?? "", input.diffText ?? ""].filter(Boolean).join("\n");
  const query = buildRetrievalQuery(task);
  const intent = classifyRetrievalIntent(task);
  const lexicalKinds = intent === "documentation" ? /* @__PURE__ */ new Set(["code", "documentation"]) : intent === "configuration" ? /* @__PURE__ */ new Set(["code", "config"]) : /* @__PURE__ */ new Set(["code"]);
  const sourceLimit = Math.min(eligibleFiles.length, RETRIEVAL_CANDIDATES_PER_SOURCE);
  const structuralCandidates = structural.slice(0, sourceLimit);
  const lexicalCandidates = rankByBm25Detailed(eligibleFiles, task, sourceLimit, lexicalKinds);
  const lexicalFinishedAt = performance.now();
  const symbolCandidates = rankSymbolsByBm25Detailed(eligibleFiles, task, sourceLimit);
  const symbolFinishedAt = performance.now();
  const structuralRank = new Map(structuralCandidates.map((file, index) => [file.path, index + 1]));
  const lexicalByPath = new Map(lexicalCandidates.map((entry) => [entry.id, entry]));
  const symbolByPath = new Map(symbolCandidates.map((entry) => [entry.path, entry]));
  const union = /* @__PURE__ */ new Set([
    ...structuralCandidates.map((file) => file.path),
    ...lexicalCandidates.map((entry) => entry.id),
    ...symbolCandidates.map((entry) => entry.path)
  ]);
  const profiles = [...union].flatMap((path) => {
    const structuralFile = structuralByPath.get(path);
    if (!structuralFile)
      return [];
    const lexical = lexicalByPath.get(path);
    const symbol = symbolByPath.get(path);
    const structuralPosition = structuralRank.get(path);
    const direct = hasDirectRetrievalEvidence(structuralFile);
    const sources = [structuralPosition, lexical?.rank, symbol?.rank].filter((rank) => rank !== void 0).length;
    const fusionScore = structuralFile.score + boundedRankBonus(lexical?.rank, 3) + boundedRankBonus(symbol?.rank, 2) + Math.max(0, sources - 1) * 0.5;
    return [{
      path,
      intent,
      tier: direct ? "direct" : sources >= 2 ? "corroborated" : "single-source",
      direct,
      ...structuralPosition === void 0 ? {} : {
        structuralRank: structuralPosition,
        structuralScore: structuralFile.score
      },
      ...lexical ? { lexicalRank: lexical.rank, lexicalScore: roundRetrieval(lexical.score) } : {},
      ...symbol ? {
        symbolRank: symbol.rank,
        symbolScore: roundRetrieval(symbol.score),
        symbol: symbol.symbol
      } : {},
      queryExpansions: query.expansions,
      fusionScore: roundRetrieval(fusionScore)
    }];
  }).sort((left, right) => right.fusionScore - left.fusionScore || (left.structuralRank ?? Number.MAX_SAFE_INTEGER) - (right.structuralRank ?? Number.MAX_SAFE_INTEGER) || left.path.localeCompare(right.path));
  const eligibleProfiles = profiles.filter((profile) => {
    const file = structuralByPath.get(profile.path);
    return profile.direct || (file?.score ?? Number.NEGATIVE_INFINITY) >= minScore;
  });
  const selectedProfiles = selectEvidenceProfiles(eligibleProfiles, Math.max(0, limit));
  const contextFiles = selectedProfiles.map((profile, index) => {
    const file = structuralByPath.get(profile.path);
    const reasons = [...file.reasons];
    if (profile.lexicalRank !== void 0)
      reasons.push(`BM25 whole-file candidate #${profile.lexicalRank}`);
    if (profile.symbolRank !== void 0 && profile.symbol) {
      reasons.push(`BM25 symbol candidate #${profile.symbolRank}: ${profile.symbol}`);
    }
    if (profile.tier === "corroborated")
      reasons.push("corroborated by independent retrieval sources");
    return {
      ...file,
      rank: index + 1,
      fusionScore: profile.fusionScore,
      retrieval: {
        ...profile.structuralRank === void 0 ? {} : {
          structuralRank: profile.structuralRank,
          structuralScore: profile.structuralScore
        },
        ...profile.lexicalRank === void 0 ? {} : { lexicalRank: profile.lexicalRank },
        ...profile.symbolRank === void 0 ? {} : { symbolRank: profile.symbolRank }
      },
      reasons
    };
  });
  const finishedAt = performance.now();
  return {
    contextFiles,
    structuralFiles: structural,
    profiles,
    ranking: structuralResult.ranking,
    candidateCounts: {
      structural: structuralCandidates.length,
      lexical: lexicalCandidates.length,
      symbol: symbolCandidates.length,
      union: union.size
    },
    timingsMs: {
      structural: roundRetrieval(structuralFinishedAt - startedAt),
      lexical: roundRetrieval(lexicalFinishedAt - structuralFinishedAt),
      symbol: roundRetrieval(symbolFinishedAt - lexicalFinishedAt),
      rerank: roundRetrieval(finishedAt - symbolFinishedAt),
      total: roundRetrieval(finishedAt - startedAt)
    }
  };
}
function rankContextFilesDetailed(repo, input, limit = DEFAULT_CONTEXT_FILE_LIMIT, minScore = REPORT_SCORE_CUTOFF) {
  const exclude = input.exclude ?? NO_EXCLUSIONS;
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const grounding = analyzeTaskGrounding(repo, input);
  const taskTokens = buildGroundedTaskTokens(grounding, {
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const mentionedPaths = matchMentionedPaths(signals.fileMentions, repo.files.map((file) => file.path), repo.root);
  const scannable = repo.files.filter((file) => !exclude.excludes(file.path) && (mentionedPaths.has(file.path) || file.isSource && !file.isTest && !LOCKFILE_NAMES.has(file.path.split("/").pop() ?? "")));
  const maintainedStems = new Set(scannable.filter((file) => !isGeneratedPath(file.path) && !isBackupPath(file.path)).map((file) => moduleStem(file.path)));
  const candidateFiles = scannable.filter((file) => !isRecordedEvaluationOutput(file.path) && !isFixMapArtifact(file) && (mentionedPaths.has(file.path) || signals.changedFiles.has(file.path) || !isGeneratedPath(file.path) || !maintainedStems.has(moduleStem(file.path))));
  const regexTokensByPath = new Map(candidateFiles.map((file) => [file.path, extractRegexTokens(rankingText(file))]));
  const contentTokensByPath = new Map(candidateFiles.map((file) => [
    file.path,
    taskTokensInFile(rankingText(file), taskTokens, regexTokensByPath.get(file.path) ?? /* @__PURE__ */ new Set())
  ]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const allTaskTermsAreWidespread = taskTokens.size > 0 && [...taskTokens].every((token) => commonTokens.has(token));
  const definitionSignals = buildDefinitionSignals(signals.identifiers);
  const memberSignals = [...signals.memberMentions].map((member) => ({
    member,
    pattern: exactIdentifierPattern(member)
  }));
  const taskText = [input.issueText ?? "", input.diffText ?? ""].join("\n");
  const exactFragmentOccurrences = new Map(signals.exactFragments.map((fragment) => [fragment, countOccurrences(taskText, fragment)]));
  const taskTargetsDocumentation = targetsDocumentation(taskText);
  const taskTargetsConfiguration = hasAnyNormalized(taskTokens, taskText, CONFIGURATION_TERMS);
  const taskTargetsDeployment = hasAnyNormalized(taskTokens, taskText, DEPLOYMENT_TERMS);
  const taskTargetsExamples = /\b(?:demos?|examples?|samples?)\b/i.test(taskText.replace(/\bfor example\b/gi, ""));
  const taskTargetsPresentation = hasAnyNormalized(taskTokens, taskText, PRESENTATION_TERMS);
  const taskTargetsTypeDeclarations = /\b(?:typescript|types?|type definitions?|declarations?|typings?|\.d\.(?:ts|mts|cts))\b/i.test(taskText);
  const scored = candidateFiles.map((file) => {
    const reasons = [];
    let score = 0;
    const isChanged = signals.changedFiles.has(file.path);
    if (isChanged) {
      score += 20;
      reasons.push("changed file");
    }
    if (mentionedPaths.has(file.path)) {
      score += EXPLICIT_PATH_BOOST;
      reasons.push("explicitly named in the task");
    }
    if (isGeneratedPath(file.path) && maintainedStems.has(moduleStem(file.path))) {
      score -= GENERATED_TWIN_PENALTY;
      reasons.push(GENERATED_TWIN_REASON);
      reasons.push("generated counterpart deprioritized below maintained source");
    }
    const pathTokens = tokenizePath(file.path);
    const pathOverlap = [...pathTokens].filter((token) => taskTokens.has(token));
    if (pathOverlap.length > 0) {
      score += pathOverlap.length * 3;
      reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
      if (pathOverlap.length >= 2) {
        score += 4;
        reasons.push("multiple task terms converge in the file path");
        const fileName = file.path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? "";
        const fileNameTokens = tokenizeText(fileName);
        if (fileNameTokens.size === 1 && [...fileNameTokens].some((token) => taskTokens.has(token))) {
          score += 5;
          reasons.push("file module name exactly matches a task term");
        }
      }
    }
    const contentTokens = contentTokensByPath.get(file.path) ?? /* @__PURE__ */ new Set();
    const contentOverlap = [...contentTokens].filter((token) => taskTokens.has(token) && (allTaskTermsAreWidespread || !commonTokens.has(token)));
    if (contentOverlap.length > 0) {
      score += Math.min(contentOverlap.length, 8) * 2;
      reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
    }
    const regexTokenOverlap = [...regexTokensByPath.get(file.path) ?? []].filter((token) => taskTokens.has(token)).slice(0, 2);
    if (regexTokenOverlap.length > 0) {
      score += Math.min(regexTokenOverlap.length, 2) * 12;
      reasons.push(`regex literal matches task tokens: ${regexTokenOverlap.join(", ")}`);
    }
    const matchedMembers = memberSignals.filter((signal) => signal.pattern.test(rankingText(file))).map((signal) => signal.member).slice(0, 3);
    if (matchedMembers.length > 0) {
      score += matchedMembers.length * MEMBER_MENTION_BOOST;
      reasons.push(`contains task member names: ${matchedMembers.join(", ")}`);
    }
    const exactLiteral = signals.exactFragments.filter((fragment) => rankingText(file).includes(fragment)).sort((a, b) => (exactFragmentOccurrences.get(b) ?? 0) - (exactFragmentOccurrences.get(a) ?? 0) || b.length - a.length)[0];
    if (exactLiteral) {
      score += EXACT_LITERAL_BOOST * Math.min(3, exactFragmentOccurrences.get(exactLiteral) ?? 0);
      reasons.push(`contains exact task literal: ${previewFragment(exactLiteral)}`);
    }
    const definedIdentifiers = (file.kind === "documentation" ? [] : findDefinedIdentifiers(file, definitionSignals)).slice(0, MAX_DEFINITION_IDENTIFIERS);
    if (definedIdentifiers.length > 0) {
      score += definedIdentifiers.length * DEFINITION_IDENTIFIER_BOOST;
      reasons.push(`defines task identifiers: ${definedIdentifiers.join(", ")}`);
      if (file.kind === "code" && !file.isTest && !isAuxiliaryCodePath(file.path) && !isTypeDeclarationPath(file.path) && !file.path.toLowerCase().startsWith("benchmarks/")) {
        score += 4;
        reasons.push("task identifier is defined in maintained implementation source");
      }
    }
    const taskMatchedDefinitions = signals.exactFragments.length === 0 && !taskTargetsDocumentation ? (file.kind === "documentation" ? [] : findTaskMatchedDefinitions(file, taskTokens)).filter((identifier) => !definedIdentifiers.includes(identifier)).slice(0, MAX_DEFINITION_IDENTIFIERS) : [];
    if (taskMatchedDefinitions.length > 0) {
      score += taskMatchedDefinitions.length * TASK_MATCHED_DEFINITION_BOOST;
      reasons.push(`defines symbols matching task terms: ${taskMatchedDefinitions.join(", ")}`);
    }
    const definitionFragment = file.kind === "documentation" ? void 0 : signals.exactFragments.find((fragment) => hasExactFragmentAtDefinition(rankingText(file), fragment, definedIdentifiers));
    if (definitionFragment) {
      score += DEFINITION_LITERAL_BOOST;
      reasons.push(`exact task literal at definition: ${previewFragment(definitionFragment)}`);
    }
    if (isNearbyChangedFile(file.path, repo.changedFiles)) {
      score += 2;
      reasons.push("near changed file");
    }
    if (file.kind === "code") {
      score += 2;
    } else if (file.kind === "documentation" && taskTargetsDocumentation) {
      score += 8;
      reasons.push("documentation-focused task");
    } else if (file.kind === "documentation" && !taskTargetsDocumentation && !isChanged) {
      score -= 14;
      reasons.push("documentation deprioritized for an implementation task");
    } else if (file.kind === "config" && (taskTargetsConfiguration || taskTargetsDeployment)) {
      score += 2;
      reasons.push(taskTargetsConfiguration ? "configuration-focused task" : "deployment-focused task");
    } else if (file.kind === "config" && !isChanged) {
      score -= 4;
    }
    const isDeploymentConfig = file.path === "package.json" || DEPLOYMENT_TERMS.some((term) => [...tokenizeText(term)].some((token) => pathTokens.has(token)));
    if (taskTargetsDeployment && file.kind === "config" && !file.path.includes("/") && isDeploymentConfig) {
      score += 5;
      reasons.push("root configuration for a deployment-related task");
    }
    if (file.kind === "code" && isAuxiliaryCodePath(file.path) && !taskTargetsExamples && !taskTargetsPresentation && !isChanged && !mentionedPaths.has(file.path)) {
      score -= EXAMPLE_CODE_PENALTY;
      reasons.push("example or demo code deprioritized for an implementation task");
      if (exactLiteral && definedIdentifiers.length > 0) {
        score -= AUXILIARY_REPRODUCTION_PENALTY;
        reasons.push("task reproduction evidence is weaker in auxiliary example code");
      }
    }
    if (isPresentationSurfacePath(file.path)) {
      if (taskTargetsPresentation) {
        score += PRESENTATION_CODE_PENALTY;
        reasons.push("presentation surface matches a UI-focused task");
        if (isInteractivePresentation(file.textSample)) {
          score += INTERACTIVE_PRESENTATION_BOOST;
          reasons.push("interactive presentation surface matches the requested user flow");
        }
      } else if (!taskTargetsExamples && !isChanged && !mentionedPaths.has(file.path)) {
        score -= PRESENTATION_CODE_PENALTY;
        reasons.push("presentation or demo surface deprioritized for a non-UI implementation task");
      }
    }
    if (isTypeDeclarationPath(file.path) && !taskTargetsTypeDeclarations && !isChanged && !mentionedPaths.has(file.path)) {
      score -= TYPE_DECLARATION_PENALTY;
      reasons.push("type declaration deprioritized for a runtime task");
      if (definedIdentifiers.length > 0) {
        score -= TYPE_DECLARATION_DIRECT_PENALTY;
        reasons.push("runtime implementation preferred over a matching declaration");
      }
    } else if (isTypeDeclarationPath(file.path) && taskTargetsTypeDeclarations && !isChanged) {
      score += TYPE_DECLARATION_PENALTY;
      reasons.push("type declaration matches a type-focused task");
    }
    if (isBackupPath(file.path) && !isChanged && !mentionedPaths.has(file.path)) {
      score -= BACKUP_COPY_PENALTY;
      reasons.push("backup or archived copy deprioritized");
    }
    if (isBundledOutput(file.textSample, file.path) && !isChanged && !mentionedPaths.has(file.path)) {
      score -= BUNDLED_OUTPUT_PENALTY;
      reasons.push("machine-generated bundle deprioritized");
    }
    if (pathTokens.has("auth") || pathTokens.has("login")) {
      if (taskTokens.has("auth") || taskTokens.has("login") || taskTokens.has("password")) {
        score += 2;
        reasons.push("auth-related task signal");
      }
    }
    return { path: file.path, score, isChanged, reasons };
  });
  applyImportProximity(scored, repo);
  const candidates = scored.filter((file) => file.score >= minScore).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const ranking = buildRankingShape(candidates);
  const clustered = ranking.clustered;
  const leadIsContested = hasContestedLead(candidates);
  const ranked = candidates.slice(0, limit);
  const contextFiles = ranked.map((entry, position) => ({
    rank: position + 1,
    path: entry.path,
    score: entry.score,
    confidence: confidenceForEntry(entry, grounding, clustered, {
      position,
      topScore: candidates[0]?.score ?? entry.score,
      leadIsContested,
      issueIsVague: isVagueTaskText(input.issueText ?? "")
    }),
    reasons: entry.reasons.length > 0 ? entry.reasons : ["source file baseline"]
  }));
  return { contextFiles, ranking };
}
function hasContestedLead(ranked) {
  const leader = ranked[0];
  if (!leader || hasDefinitionEvidence(leader)) {
    return false;
  }
  return ranked.slice(1).some((entry) => hasDefinitionEvidence(entry));
}
function hasDefinitionEvidence(entry) {
  return entry.reasons.some((reason2) => reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
}
function applyImportProximity(scored, repo) {
  const directSeeds = scored.filter((entry) => entry.score >= 8 && hasDirectEvidence(entry)).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, MAX_PROXIMITY_SEEDS);
  const seedEntries = directSeeds.length > 0 ? directSeeds : scored.filter((entry) => entry.score >= 8).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 2);
  if (seedEntries.length === 0) {
    return;
  }
  const seeds = seedEntries.map((entry) => entry.path);
  const seedScores = new Map(seedEntries.map((entry) => [entry.path, entry.score]));
  const graph = buildImportGraph(repo.files);
  if ((graph.truncatedFiles > 0 || graph.truncatedEdges > 0) && !repo.diagnostics.some((entry) => entry.code === "import-graph-truncated")) {
    repo.diagnostics.push({
      code: "import-graph-truncated",
      severity: "info",
      message: `Import proximity was bounded: ${graph.truncatedFiles.toLocaleString()} parseable files and ${graph.truncatedEdges.toLocaleString()} high-fanout files were not fully traversed. Ranking still uses path and content evidence.`
    });
  }
  const proximity = findImportProximity(graph, seeds);
  for (const entry of scored) {
    const hit = proximity.get(entry.path);
    if (hit) {
      const seedScore = seedScores.get(hit.seed);
      const availableBoost = seedScore === void 0 ? 0 : Math.max(0, seedScore - entry.score - 1);
      const boost = Math.min(IMPORT_PROXIMITY_BOOSTS[hit.distance], availableBoost);
      if (boost === 0) {
        continue;
      }
      entry.score += boost;
      entry.reasons.push(proximityReason(hit));
    }
  }
}
function proximityReason(hit) {
  if (hit.distance === 2) {
    return `within two import hops of ranked file ${hit.seed}`;
  }
  return hit.direction === "imported-by" ? `imported by ranked file ${hit.seed}` : `imports ranked file ${hit.seed}`;
}
function confidenceForEntry(entry, grounding, clustered, shape) {
  const hasMaintainedSourceTwin = entry.reasons.includes(GENERATED_TWIN_REASON);
  if (entry.reasons.includes("explicitly named in the task") && shape.position === 0 && !shape.leadIsContested && !hasMaintainedSourceTwin) {
    return "high";
  }
  let confidence = entry.score >= 14 ? "high" : entry.score >= 8 ? "medium" : "low";
  const leads = shape.position === 0 || entry.score >= shape.topScore - HIGH_CONFIDENCE_MARGIN;
  if (!leads && !hasDirectEvidence(entry)) {
    confidence = capConfidence(confidence, "medium");
  }
  if (shape.position === 0 && shape.leadIsContested) {
    confidence = capConfidence(confidence, "medium");
  }
  if (hasMaintainedSourceTwin) {
    confidence = capConfidence(confidence, "medium");
  }
  if (!hasDirectEvidence(entry)) {
    confidence = capConfidence(confidence, "medium");
  }
  const supportedIdentifierCount = grounding.identifiers.filter((identifier) => identifier.status === "exact-definition" || identifier.status === "exact-text" || identifier.status === "partial-definition").length;
  if (grounding.unresolvedIdentifiers.length > 0) {
    if (supportedIdentifierCount === 0) {
      return "low";
    }
    confidence = capConfidence(confidence, "medium");
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    if (supportedIdentifierCount === 0) {
      return "low";
    }
    confidence = capConfidence(confidence, "medium");
  }
  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    confidence = capConfidence(confidence, "medium");
  }
  if (grounding.specificity === "vague" || shape.issueIsVague) {
    return "low";
  }
  if (!grounding.scanComplete) {
    confidence = capConfidence(confidence, "medium");
  }
  if (clustered && !hasDirectEvidence(entry)) {
    confidence = capConfidence(confidence, "medium");
  }
  return confidence;
}
function capConfidence(confidence, maximum) {
  const levels = ["low", "medium", "high"];
  return levels.indexOf(confidence) > levels.indexOf(maximum) ? maximum : confidence;
}
function hasDirectEvidence(entry) {
  return entry.isChanged || entry.reasons.some((reason2) => reason2 === "explicitly named in the task" || reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
}
function hasAnyNormalized(tokens, rawText, values) {
  return values.some((value) => {
    const normalized = tokenizeText(value);
    if (normalized.size > 0 && [...normalized].every((token) => tokens.has(token)))
      return true;
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp2(value)}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(rawText);
  });
}
function matchMentionedPaths(mentions, repoPaths, repoRoot) {
  const matched = /* @__PURE__ */ new Set();
  for (const rawMention of mentions) {
    const mention = repositoryRelativeMention(rawMention, repoRoot);
    if (!mention)
      continue;
    const exactMatches = repoPaths.filter((path) => pathMatchesMention(path, mention));
    if (exactMatches.length > 0) {
      if (exactMatches.length <= MAX_FILES_PER_MENTION) {
        for (const path of exactMatches) {
          matched.add(path);
        }
      }
      continue;
    }
    const fallbackVariants = compiledSourcePathVariants(mention);
    const fallbackMatches = repoPaths.filter((path) => fallbackVariants.some((variant) => pathMatchesMention(path, variant)));
    if (fallbackMatches.length > 0 && fallbackMatches.length <= MAX_FILES_PER_MENTION) {
      for (const path of fallbackMatches) {
        matched.add(path);
      }
    }
  }
  return matched;
}
function repositoryRelativeMention(mention, repoRoot) {
  const normalizedMention = mention.replace(/\\/g, "/");
  if (!/^(?:[A-Za-z]:\/|\/)/.test(normalizedMention))
    return normalizedMention;
  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = `${normalizedRoot}/`;
  return normalizedMention.toLowerCase().startsWith(prefix.toLowerCase()) ? normalizedMention.slice(prefix.length) : void 0;
}
function compiledSourcePathVariants(path) {
  const lowerPath = path.toLowerCase();
  for (const [compiledExtension, sourceExtensions] of Object.entries(COMPILED_TO_SOURCE_MENTION_EXTENSIONS)) {
    if (!lowerPath.endsWith(compiledExtension)) {
      continue;
    }
    const stem = path.slice(0, -compiledExtension.length);
    return sourceExtensions.map((extension) => `${stem}${extension}`);
  }
  return [];
}
function isAuxiliaryCodePath(path) {
  const parts = path.split("/");
  const stem = (parts.at(-1) ?? "").replace(/\.[^.]+$/, "").toLowerCase();
  const parentSegments = parts.slice(0, -1).map((segment) => segment.toLowerCase());
  return parentSegments.some((segment) => AUXILIARY_CODE_DIRS.has(segment)) || stem === "sample-repo" && parentSegments.some((segment) => segment === "web" || segment === "website");
}
function isPresentationSurfacePath(path) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return /^(?:page|layout|demo)\.[cm]?[jt]sx?$/.test(name) || /\.(?:css|less|sass|scss)$/.test(name);
}
function isInteractivePresentation(text) {
  return /<(?:button|form|input|select|textarea)\b|\bon(?:Change|Click|Input|Submit)\s*=|\buseState\s*\(/.test(text);
}
function tokenizeFileContent(text, regexTokens) {
  const tokens = tokenizeText(text);
  for (const token of regexTokens)
    tokens.add(token);
  return tokens;
}
function taskTokensInFile(text, taskTokens, regexTokens) {
  const regexOverlap = [...regexTokens].some((token) => taskTokens.has(token));
  if (!regexOverlap && !mightContainTaskToken(text, taskTokens))
    return /* @__PURE__ */ new Set();
  const tokens = tokenizeFileContent(text, regexTokens);
  return new Set([...tokens].filter((token) => taskTokens.has(token)));
}
function mightContainTaskToken(text, taskTokens) {
  const lower = text.toLowerCase();
  for (const token of taskTokens) {
    if (token === "css" && /\b(?:css|scss|sass|less)\b/.test(lower))
      return true;
    if (/^h[123]$/.test(token) && new RegExp(`(?:\\b${token}\\b|\\bhttp\\s*\\/\\s*${token[1]}\\b)`).test(lower)) {
      return true;
    }
    const prefix = token.length <= 4 ? token : token.slice(0, 4);
    if (lower.includes(prefix))
      return true;
  }
  return false;
}
function extractRegexTokens(text) {
  const tokens = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/\b([A-Za-z])\{(\d+),(\d+)\}/g)) {
    const character = match[1]?.toLowerCase();
    const minimum = Number(match[2]);
    const maximum = Math.min(Number(match[3]), 8);
    if (!character || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      continue;
    }
    for (let length = Math.max(3, minimum); length <= maximum; length += 1) {
      tokens.add(character.repeat(length));
    }
  }
  return tokens;
}
function isBundledOutput(textSample, path) {
  if (textSample.length < MIN_BUNDLE_SAMPLE_BYTES) {
    return false;
  }
  const lineCount = textSample.split("\n").length;
  if (textSample.length / lineCount >= BUNDLED_LINE_LENGTH) {
    return true;
  }
  const markerCount = BUNDLE_MARKERS.filter((marker) => marker.test(textSample)).length;
  return markerCount >= 2 || markerCount >= 1 && isConventionalBundlePath(path);
}
function isConventionalBundlePath(path) {
  return isGeneratedPath(path) || path.split("/").slice(0, -1).some((segment) => segment.toLowerCase() === "compiled");
}
function isTypeDeclarationPath(path) {
  return /\.d\.(?:ts|mts|cts)$/i.test(path);
}
function targetsDocumentation(taskText) {
  const documentation = "(?:docs?|documentation|readme|guide)";
  const action = "(?:add|change|correct|document|edit|fix|improve|remove|revise|rewrite|update|write)";
  const defect = "(?:typos?|spelling|grammar|wording|broken links?)";
  return new RegExp(`\\b${action}\\b[^\\n.]{0,60}\\b${documentation}\\b`, "i").test(taskText) || new RegExp(`\\b${documentation}\\b[^\\n.]{0,60}\\b${action}\\b`, "i").test(taskText) || new RegExp(`\\b${defect}\\b[^\\n.]{0,60}\\b${documentation}\\b`, "i").test(taskText) || new RegExp(`\\b${documentation}\\b[^\\n.]{0,60}\\b${defect}\\b`, "i").test(taskText) || /\b(?:marketing|landing|website|page|button|label|headline|cta)\s+copy\b/i.test(taskText);
}
function buildDefinitionSignals(identifiers) {
  return [...identifiers].sort((a, b) => a.localeCompare(b)).map((identifier) => ({
    identifier,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)${escapeRegExp2(identifier)}(?![\\p{L}\\p{N}_$])`, "u")
  }));
}
function findDefinedIdentifiers(file, signals) {
  const adapterDefinitions = new Set(extractLanguageDefinitions(file).map((entry) => entry.name));
  return signals.filter((signal) => adapterDefinitions.has(signal.identifier) || signal.pattern.test(rankingText(file))).map((signal) => signal.identifier);
}
function exactIdentifierPattern(identifier) {
  return new RegExp(`(?<![\\p{L}\\p{N}_$])${escapeRegExp2(identifier)}(?![\\p{L}\\p{N}_$])`, "u");
}
function findTaskMatchedDefinitions(file, taskTokens) {
  const definitions = new Set(extractLanguageDefinitions(file).map((entry) => entry.name));
  const pattern = /(?<![\p{L}\p{N}_$])(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\s+)([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;
  for (const match of rankingText(file).matchAll(pattern)) {
    const identifier = match[1];
    if (identifier)
      definitions.add(identifier);
  }
  const matched = [];
  for (const identifier of definitions) {
    const overlap = [...tokenizeText(identifier)].filter((token) => taskTokens.has(token));
    if (overlap.length >= 2 || overlap.length === 1 && identifier.length >= 6) {
      matched.push(identifier);
    }
  }
  return matched;
}
function hasExactFragmentAtDefinition(text, fragment, definedIdentifiers) {
  let index = text.indexOf(fragment);
  while (index !== -1) {
    const prefix = text.slice(Math.max(0, index - 240), index);
    const namesNearby = definedIdentifiers.some((identifier) => prefix.includes(identifier));
    const assignmentNearby = /\b(?:const|let|var)\s+[$A-Za-z_][$A-Za-z0-9_]*(?:\s*:[^=\r\n]+)?\s*=\s*[/("'`]?\s*$/.test(prefix);
    if (namesNearby || assignmentNearby) {
      return true;
    }
    index = text.indexOf(fragment, index + fragment.length);
  }
  return false;
}
function previewFragment(fragment) {
  return fragment.length <= 40 ? fragment : `${fragment.slice(0, 37)}...`;
}
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countOccurrences(text, value) {
  if (!value) {
    return 0;
  }
  return text.split(value).length - 1;
}
function findCommonTokens(contentTokensByPath) {
  const fileCount = contentTokensByPath.size;
  if (fileCount < 4) {
    return /* @__PURE__ */ new Set();
  }
  const threshold = Math.ceil(fileCount * WIDESPREAD_TOKEN_SHARE);
  const frequency = /* @__PURE__ */ new Map();
  for (const tokens of contentTokensByPath.values()) {
    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  return new Set([...frequency].filter(([, count]) => count >= threshold).map(([token]) => token));
}
function isNearbyChangedFile(path, changedFiles) {
  const folder = path.split("/").slice(0, -1).join("/");
  if (!folder) {
    return false;
  }
  return changedFiles.some((changedPath) => changedPath !== path && changedPath.startsWith(`${folder}/`));
}
function rankingText(file) {
  return file.searchTextSample ?? file.textSample;
}
function hasDirectRetrievalEvidence(file) {
  return file.reasons.some((reason2) => reason2 === "changed file" || reason2 === "explicitly named in the task" || reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
}
function classifyRetrievalIntent(task) {
  if (/\b(?:docs?|documentation|readme|guide|wording|typos?)\b/i.test(task))
    return "documentation";
  if (/\b(?:test|tests|testing|spec|coverage|fixture)\b/i.test(task))
    return "tests";
  if (/\b(?:typescript|types?|typings?|declarations?|\.d\.(?:ts|mts|cts))\b/i.test(task))
    return "types";
  if (/\b(?:config|configuration|workflow|ci|yaml|docker|deploy(?:ment)?)\b/i.test(task))
    return "configuration";
  if (/\b(?:browser|button|client|form|frontend|layout|page|screen|ui|website)\b/i.test(task))
    return "presentation";
  return "implementation";
}
function boundedRankBonus(rank, maximum) {
  if (rank === void 0 || rank > RETRIEVAL_CANDIDATES_PER_SOURCE)
    return 0;
  return maximum * ((RETRIEVAL_CANDIDATES_PER_SOURCE + 1 - rank) / RETRIEVAL_CANDIDATES_PER_SOURCE);
}
function selectEvidenceProfiles(profiles, limit) {
  if (profiles.length <= limit || limit < 3)
    return profiles.slice(0, limit);
  const primaryCount = Math.max(1, limit - 1);
  const selected = profiles.slice(0, primaryCount);
  const selectedPaths = new Set(selected.map((profile) => profile.path));
  const byCoverage = [...profiles].filter((profile) => profile.direct && (profile.structuralRank ?? Number.MAX_SAFE_INTEGER) <= limit || consensusRank(profile) !== Number.MAX_SAFE_INTEGER).sort((left, right) => Number(isStrongConsensus(right)) - Number(isStrongConsensus(left)) || right.fusionScore - left.fusionScore || consensusRank(left) - consensusRank(right) || (left.structuralRank ?? Number.MAX_SAFE_INTEGER) - (right.structuralRank ?? Number.MAX_SAFE_INTEGER) || left.path.localeCompare(right.path));
  const byConsensus = [...profiles].sort((left, right) => consensusRank(left) - consensusRank(right) || right.fusionScore - left.fusionScore || left.path.localeCompare(right.path));
  const byLexical = [...profiles].sort((left, right) => (left.lexicalRank ?? Number.MAX_SAFE_INTEGER) - (right.lexicalRank ?? Number.MAX_SAFE_INTEGER) || right.fusionScore - left.fusionScore || left.path.localeCompare(right.path));
  const bySymbol = [...profiles].sort((left, right) => (left.symbolRank ?? Number.MAX_SAFE_INTEGER) - (right.symbolRank ?? Number.MAX_SAFE_INTEGER) || right.fusionScore - left.fusionScore || left.path.localeCompare(right.path));
  for (const candidate of [...byCoverage, ...byConsensus, ...byLexical, ...bySymbol, ...profiles]) {
    if (selected.length >= limit)
      break;
    if (selectedPaths.has(candidate.path))
      continue;
    selected.push(candidate);
    selectedPaths.add(candidate.path);
  }
  for (const candidate of profiles) {
    if (selected.length >= limit)
      break;
    if (!selectedPaths.has(candidate.path))
      selected.push(candidate);
  }
  return selected;
}
function isStrongConsensus(profile) {
  return consensusRank(profile) <= 6;
}
function consensusRank(profile) {
  return profile.lexicalRank !== void 0 && profile.lexicalRank <= 10 && profile.symbolRank !== void 0 && profile.symbolRank <= 10 ? profile.lexicalRank + profile.symbolRank : Number.MAX_SAFE_INTEGER;
}
function roundRetrieval(value) {
  return Math.round(value * 1e6) / 1e6;
}

// packages/core/dist/test-gates.js
var CONDITIONAL_GATE_PATTERN = /\.(?:skipIf|runIf)\s*\(/;
var UNCONDITIONAL_GATE_PATTERNS = [
  /\b(?:it|test|describe|context)\.(?:skip|todo)\s*\(/,
  /\b(?:xit|xtest|xdescribe|xcontext)\s*\(/,
  /\bthis\.skip\s*\(/,
  /@(?:pytest\.mark\.(?:skip|skipif)|unittest\.skip(?:If|Unless)?)\b/,
  /\bt\.Skip(?:f|Now)?\s*\(/,
  /#\[ignore(?:\s*=|\s*\])/
];
var ENV_NAME_PATTERNS = [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g];
function findGatedTestDiagnostics(files, routedTestPaths) {
  const routed = new Set(routedTestPaths);
  const diagnostics = [];
  for (const file of files) {
    const conditional = CONDITIONAL_GATE_PATTERN.test(file.textSample);
    const unconditional = UNCONDITIONAL_GATE_PATTERNS.some((pattern) => pattern.test(file.textSample));
    if (!file.isTest || !routed.has(file.path) || !conditional && !unconditional) {
      continue;
    }
    diagnostics.push({
      code: "gated-test-skipped",
      severity: "warning",
      message: unconditional ? `${file.path} contains skipped or ignored tests; the suggested test command will not exercise them until the skip is removed.` : gateMessage(file.path, extractEnvNames(file.textSample))
    });
  }
  return diagnostics;
}
function gateMessage(path, envNames) {
  if (envNames.length === 0) {
    return `${path} contains conditionally skipped suites; verify the suggested test command actually exercises it.`;
  }
  const condition = envNames.length === 1 ? `${envNames[0]} is set` : `${envNames.join(", ")} are set`;
  return `${path} is skipped unless ${condition}; the suggested test command will not exercise it by default.`;
}
function extractEnvNames(textSample) {
  const names = /* @__PURE__ */ new Set();
  for (const pattern of ENV_NAME_PATTERNS) {
    for (const match of textSample.matchAll(pattern)) {
      names.add(match[1] ?? "");
    }
  }
  names.delete("");
  return [...names].sort((a, b) => a.localeCompare(b));
}

// packages/core/dist/text.js
var DIAGNOSTIC_TERM_LIMIT = 48;
var DIAGNOSTIC_SPEC_LIMIT = 80;
function stripByteOrderMark(value) {
  return value.replace(/^\uFEFF/, "");
}
function truncateForDiagnostic(value, limit) {
  return value.length <= limit ? value : `${value.slice(0, limit)}\u2026`;
}

// packages/core/dist/semantic.js
var PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var SHA_256 = /^[a-f0-9]{64}$/;
var DEFAULT_LIMIT = 8;
var DEFAULT_MAX_SEMANTIC_CANDIDATES = 1e3;
var DEFAULT_TIMEOUT_MS = 12e4;
var DEFAULT_WEIGHTS = {
  structural: 3,
  lexical: 1,
  semantic: 3.5,
  reciprocalRankConstant: 60
};
async function rankContextFilesHybrid(repo, input, options = {}) {
  const limit = positiveInteger(options.limit, DEFAULT_LIMIT);
  const weights = {
    structural: positiveNumber(options.weights?.structural, DEFAULT_WEIGHTS.structural),
    lexical: positiveNumber(options.weights?.lexical, DEFAULT_WEIGHTS.lexical),
    semantic: positiveNumber(options.weights?.semantic, DEFAULT_WEIGHTS.semantic),
    reciprocalRankConstant: DEFAULT_WEIGHTS.reciprocalRankConstant
  };
  const detailed = rankContextFilesEvidenceDetailed(repo, { ...input, exclude: options.exclude }, Number.MAX_SAFE_INTEGER, options.minStructuralScore ?? Number.NEGATIVE_INFINITY);
  const structuralByPath = new Map(detailed.structuralFiles.map((file) => [file.path, file]));
  const evidenceByPath = new Map(detailed.contextFiles.map((file) => [file.path, file]));
  const task = [input.issueText ?? "", input.diffText ?? ""].filter(Boolean).join("\n");
  const signals = /* @__PURE__ */ new Map();
  detailed.profiles.forEach((profile) => {
    signals.set(profile.path, {
      ...profile.structuralRank === void 0 ? {} : {
        structuralRank: profile.structuralRank,
        structuralScore: profile.structuralScore
      },
      ...profile.lexicalRank === void 0 ? {} : { lexicalRank: profile.lexicalRank },
      ...profile.symbolRank === void 0 ? {} : { symbolRank: profile.symbolRank }
    });
  });
  const diagnostics = [];
  let semantic;
  const provider = options.embeddingProvider;
  if (!provider) {
    diagnostics.push({
      code: "semantic-disabled",
      severity: "info",
      message: "Semantic retrieval was not configured; ranking used structural and lexical evidence only."
    });
  } else if (!provider.local && options.allowRemoteEmbeddings !== true) {
    diagnostics.push({
      code: "semantic-remote-disallowed",
      severity: "warning",
      message: `Embedding provider ${provider.id} is remote; source upload remains disabled unless explicitly allowed.`
    });
  } else {
    const providerError = validateProvider(provider);
    if (providerError) {
      diagnostics.push({ code: "semantic-provider-invalid", severity: "warning", message: providerError });
    } else if (task.trim() && detailed.contextFiles.length > 0) {
      const maxCandidates = positiveInteger(options.maxSemanticCandidates, DEFAULT_MAX_SEMANTIC_CANDIDATES);
      const semanticCandidates = repo.files.filter((file) => file.isSource && !file.isTest && file.kind === "code" && !isFixMapArtifact(file) && !(options.exclude?.excludes(file.path) ?? false)).sort((left, right) => left.path.localeCompare(right.path)).slice(0, maxCandidates);
      const semanticEligibleCount = repo.files.filter((file) => file.isSource && !file.isTest && file.kind === "code" && !isFixMapArtifact(file) && !(options.exclude?.excludes(file.path) ?? false)).length;
      const truncatedFiles = semanticEligibleCount - semanticCandidates.length;
      if (truncatedFiles > 0) {
        diagnostics.push({
          code: "semantic-candidates-truncated",
          severity: "warning",
          message: `Semantic retrieval embedded ${semanticCandidates.length.toLocaleString()} candidates and omitted ${truncatedFiles.toLocaleString()} lower structural candidates.`
        });
      }
      try {
        const vectors = await embedWithTimeout(provider, [task, ...semanticCandidates.map((file) => semanticDocument(repo, file.path))], positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS));
        const query = vectors[0];
        const semanticScores = semanticCandidates.map((file, index) => ({
          path: file.path,
          similarity: cosineSimilarity(query, vectors[index + 1])
        })).filter((entry) => entry.similarity > 0).sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path));
        semanticScores.forEach((entry, index) => {
          const signal = signals.get(entry.path) ?? {};
          signal.semanticRank = index + 1;
          signal.semanticSimilarity = round(entry.similarity, 6);
          signals.set(entry.path, signal);
        });
        semantic = {
          id: provider.id,
          version: provider.version,
          model: provider.model,
          artifactHash: provider.artifactHash,
          runtime: provider.runtime,
          dimensions: provider.dimensions,
          normalization: provider.normalization,
          local: provider.local,
          cacheKey: semanticCacheKey(provider),
          indexedFiles: semanticCandidates.length,
          truncatedFiles
        };
      } catch (error) {
        diagnostics.push({
          code: "semantic-provider-failed",
          severity: "warning",
          message: `Semantic retrieval failed without aborting FixMap: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }
  const fused = [...signals.entries()].flatMap(([path, signal]) => {
    const file = evidenceByPath.get(path) ?? structuralByPath.get(path);
    if (!file)
      return [];
    const fusionScore = reciprocalContribution(signal.structuralRank, weights.structural, weights.reciprocalRankConstant) + reciprocalContribution(signal.lexicalRank, weights.lexical, weights.reciprocalRankConstant) + reciprocalContribution(signal.symbolRank, weights.lexical, weights.reciprocalRankConstant) + reciprocalContribution(signal.semanticRank, weights.semantic, weights.reciprocalRankConstant);
    const reasons = [...file.reasons];
    if (signal.lexicalRank !== void 0)
      reasons.push(`BM25 lexical rank #${signal.lexicalRank}`);
    if (signal.semanticRank !== void 0 && signal.semanticSimilarity !== void 0 && semantic) {
      reasons.push(`semantic rank #${signal.semanticRank} (cosine ${signal.semanticSimilarity.toFixed(3)}) via ${semantic.id}/${semantic.model}`);
    }
    return [{ ...file, fusionScore: round(fusionScore, 8), retrieval: signal, reasons }];
  }).sort((a, b) => Number(isFusionAnchor(b)) - Number(isFusionAnchor(a)) || b.fusionScore - a.fusionScore || (a.retrieval.structuralRank ?? Number.MAX_SAFE_INTEGER) - (b.retrieval.structuralRank ?? Number.MAX_SAFE_INTEGER) || a.path.localeCompare(b.path)).slice(0, limit).map((file, index) => ({ ...file, rank: index + 1 }));
  return {
    files: fused,
    mode: semantic ? "structural-lexical-semantic" : "structural-lexical",
    weights,
    ...semantic ? { semantic } : {},
    diagnostics,
    structuralRanking: detailed.ranking
  };
}
function isFusionAnchor(file) {
  return file.reasons.some((reason2) => reason2 === "changed file" || reason2 === "explicitly named in the task" || reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
}
function validateProvider(provider) {
  if (!PROVIDER_ID.test(provider.id) || !provider.version.trim() || !provider.model.trim() || !provider.runtime.trim()) {
    return "Embedding provider identity, version, model, or runtime is invalid.";
  }
  if (!SHA_256.test(provider.artifactHash))
    return `Embedding provider ${provider.id} must declare a lowercase SHA-256 artifact hash.`;
  if (!Number.isSafeInteger(provider.dimensions) || provider.dimensions < 1 || provider.dimensions > 65536) {
    return `Embedding provider ${provider.id} declares invalid dimensions.`;
  }
  if (provider.normalization !== "l2" && provider.normalization !== "none") {
    return `Embedding provider ${provider.id} declares invalid normalization.`;
  }
  return void 0;
}
async function embedWithTimeout(provider, texts, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`embedding provider timed out after ${timeoutMs.toLocaleString()} ms`));
      }, timeoutMs);
    });
    const output = await Promise.race([provider.embed(texts, { signal: controller.signal }), timeout]);
    if (!Array.isArray(output) || output.length !== texts.length) {
      throw new Error(`embedding provider returned ${Array.isArray(output) ? output.length : "invalid"} vectors for ${texts.length} texts`);
    }
    return output.map((vector, index) => validateVector(vector, provider, index));
  } finally {
    if (timer)
      clearTimeout(timer);
    controller.abort();
  }
}
function validateVector(vector, provider, index) {
  if (!Array.isArray(vector) && !ArrayBuffer.isView(vector)) {
    throw new Error(`embedding vector ${index} is not an array`);
  }
  const values = Array.from(vector);
  if (values.length !== provider.dimensions || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`embedding vector ${index} does not contain ${provider.dimensions} finite dimensions`);
  }
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0)
    throw new Error(`embedding vector ${index} has zero magnitude`);
  if (provider.normalization === "l2" && Math.abs(magnitude - 1) > 0.01) {
    throw new Error(`embedding vector ${index} is not L2-normalized as declared`);
  }
  return provider.normalization === "l2" ? values : values.map((value) => value / magnitude);
}
function cosineSimilarity(left, right) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}
function semanticDocument(repo, path) {
  const file = repo.files.find((candidate) => candidate.path === path);
  return `${path}
${file?.searchTextSample ?? file?.textSample ?? ""}`.slice(0, 16e3);
}
function reciprocalContribution(rank, weight, constant) {
  return rank === void 0 ? 0 : weight / (constant + rank);
}
function semanticCacheKey(provider) {
  return [
    provider.id,
    provider.version,
    provider.model,
    provider.artifactHash,
    provider.runtime,
    provider.dimensions,
    provider.normalization
  ].join(":");
}
function positiveInteger(value, fallback) {
  return value !== void 0 && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function positiveNumber(value, fallback) {
  return value !== void 0 && Number.isFinite(value) && value > 0 ? value : fallback;
}
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// packages/core/dist/annotations.js
var ID = /^annotation:[a-f0-9]{16}$/;
var REVISION = /^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,255}$/;
function validateAnnotationStore(candidate) {
  if (!isRecord3(candidate) || candidate.annotationStoreVersion !== 1 || !Array.isArray(candidate.annotations)) {
    throw new Error("Unsupported or invalid FixMap annotation store. Expected annotationStoreVersion 1.");
  }
  const ids = /* @__PURE__ */ new Set();
  const annotations = candidate.annotations.map((value) => {
    validateAnnotation(value);
    if (ids.has(value.id))
      throw new Error(`Duplicate annotation ID: ${value.id}`);
    ids.add(value.id);
    return copyAnnotation(value);
  }).sort((a, b) => scopeKey(a.scope).localeCompare(scopeKey(b.scope)) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { annotationStoreVersion: 1, annotations };
}
function assessAnnotations(store, repo, options) {
  const validated = validateAnnotationStore(store);
  const now = parseTimestamp(options.now, "assessment time");
  const paths = new Set(repo.files.map((file) => normalizePath(file.path)));
  const renames = new Map((options.renames ?? []).map((rename2) => {
    const from = validateRelativePath(rename2.from, "rename source");
    const to = validateRelativePath(rename2.to, "rename target");
    return [from, to];
  }));
  return validated.annotations.map((annotation) => {
    if (annotation.expiresAt && parseTimestamp(annotation.expiresAt, "annotation expiry") <= now) {
      return { annotation, status: "expired", message: `Annotation ${annotation.id} expired at ${annotation.expiresAt}.` };
    }
    const targetPath = annotation.scope.kind === "file" || annotation.scope.kind === "symbol" || annotation.scope.kind === "contract" && annotation.scope.path ? annotation.scope.path : void 0;
    if (targetPath) {
      const renamedTo = renames.get(targetPath);
      if (renamedTo) {
        return {
          annotation,
          status: "renamed-target",
          message: `Annotation target ${targetPath} was renamed to ${renamedTo}; review and update the annotation scope.`,
          suggestedPath: renamedTo
        };
      }
      if (!paths.has(targetPath)) {
        return { annotation, status: "missing-target", message: `Annotation target ${targetPath} is not present in this repository snapshot.` };
      }
    }
    return { annotation, status: "active", message: `Annotation ${annotation.id} is active.` };
  });
}
function normalizeAnnotationInput(input) {
  const scope = validateScope(input.scope);
  const note = normalizeText(input.note, "annotation note", 2e3);
  const createdAt = new Date(parseTimestamp(input.createdAt, "annotation creation time")).toISOString();
  const expiresAt = input.expiresAt ? new Date(parseTimestamp(input.expiresAt, "annotation expiry")).toISOString() : void 0;
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(createdAt))
    throw new Error("Annotation expiry must be after its creation time.");
  const owner = input.owner ? normalizeText(input.owner, "annotation owner", 200) : void 0;
  const sourceRevision = input.sourceRevision?.trim();
  if (sourceRevision && !REVISION.test(sourceRevision))
    throw new Error(`Invalid annotation source revision: ${sourceRevision}`);
  return {
    scope,
    note,
    ...owner ? { owner } : {},
    createdAt,
    ...expiresAt ? { expiresAt } : {},
    ...sourceRevision ? { sourceRevision } : {}
  };
}
function validateAnnotation(candidate) {
  if (!isRecord3(candidate) || typeof candidate.id !== "string" || !ID.test(candidate.id) || typeof candidate.note !== "string" || typeof candidate.createdAt !== "string") {
    throw new Error("Invalid FixMap annotation record.");
  }
  const normalized = normalizeAnnotationInput({
    scope: candidate.scope,
    note: candidate.note,
    ...typeof candidate.owner === "string" ? { owner: candidate.owner } : {},
    createdAt: candidate.createdAt,
    ...typeof candidate.expiresAt === "string" ? { expiresAt: candidate.expiresAt } : {},
    ...typeof candidate.sourceRevision === "string" ? { sourceRevision: candidate.sourceRevision } : {}
  });
  if (candidate.note !== normalized.note || candidate.createdAt !== normalized.createdAt || candidate.owner !== normalized.owner || candidate.expiresAt !== normalized.expiresAt || candidate.sourceRevision !== normalized.sourceRevision || canonicalize(candidate.scope) !== canonicalize(normalized.scope)) {
    throw new Error(`Annotation ${candidate.id} is not canonically encoded.`);
  }
  const expectedId = `annotation:${stableHash(canonicalize(normalized))}`;
  if (candidate.id !== expectedId)
    throw new Error(`Annotation ${candidate.id} does not match its content identity.`);
}
function validateScope(candidate) {
  if (!isRecord3(candidate) || typeof candidate.kind !== "string")
    throw new Error("Annotation scope is invalid.");
  if (candidate.kind === "file") {
    return { kind: "file", path: validateRelativePath(String(candidate.path ?? ""), "annotation file") };
  }
  if (candidate.kind === "symbol") {
    return {
      kind: "symbol",
      path: validateRelativePath(String(candidate.path ?? ""), "annotation symbol file"),
      symbol: normalizeText(String(candidate.symbol ?? ""), "annotation symbol", 300)
    };
  }
  if (candidate.kind === "service") {
    return { kind: "service", name: normalizeText(String(candidate.name ?? ""), "annotation service", 300) };
  }
  if (candidate.kind === "contract") {
    const path = candidate.path === void 0 ? void 0 : validateRelativePath(String(candidate.path), "annotation contract file");
    return {
      kind: "contract",
      name: normalizeText(String(candidate.name ?? ""), "annotation contract", 300),
      ...path ? { path } : {}
    };
  }
  throw new Error("Unsupported annotation scope.");
}
function validateRelativePath(value, label) {
  const normalized = normalizePath(value.trim());
  if (!normalized || /^(?:[\\/]|[A-Za-z]:)/.test(value) || value.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
}
function normalizePath(path) {
  return path.replace(/\\/g, "/");
}
function normalizeText(value, label, maximum) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0"))
    throw new Error(`Invalid ${label}.`);
  return normalized;
}
function parseTimestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}
function scopeKey(scope) {
  if (scope.kind === "file")
    return `file:${scope.path}`;
  if (scope.kind === "symbol")
    return `symbol:${scope.path}:${scope.symbol}`;
  if (scope.kind === "service")
    return `service:${scope.name}`;
  return `contract:${scope.path ?? ""}:${scope.name}`;
}
function copyAnnotation(annotation) {
  return { ...annotation, scope: { ...annotation.scope } };
}
function canonicalize(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stableHash(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

// packages/core/dist/decisions.js
var DECISION_PATH = /(?:^|\/)(?:docs\/)?(?:adr|adrs|architecture\/decisions|decisions|rfcs?|design)(?:\/|$)|(?:^|\/)(?:architecture|design|rationale)\.md$|(?:^|\/)adr[-_ ]?\d+[^/]*\.md$/i;
var PATH_LIKE = /^(?:[A-Za-z0-9_.@-]+\/)+[A-Za-z0-9_.@() +\[\]-]+(?:\.[A-Za-z0-9]+)?$/;
function inventoryDecisionRecords(repo) {
  const records = [];
  const diagnostics = [];
  const knownPaths = new Set(repo.files.map((file) => normalizePath2(file.path)));
  for (const file of repo.files.filter((candidate) => DECISION_PATH.test(normalizePath2(candidate.path)))) {
    if (file.textSampleComplete === false || !file.contentFingerprint) {
      diagnostics.push({
        code: "decision-source-incomplete",
        severity: "warning",
        path: file.path,
        message: `${file.path} looks like a decision record, but complete content and an exact fingerprint were unavailable.`
      });
      continue;
    }
    const result = parseDecisionRecord({
      path: file.path,
      content: file.textSample,
      fingerprint: file.contentFingerprint,
      knownPaths
    });
    if (result.record) {
      records.push(result.record);
      const missing = result.record.targets.flatMap((target) => {
        const targetPath = target.kind === "file" ? target.path : target.kind === "symbol" ? target.path : void 0;
        return targetPath && !knownPaths.has(targetPath) ? [targetPath] : [];
      });
      if (missing.length > 0)
        diagnostics.push({
          code: "decision-target-missing",
          severity: "warning",
          path: file.path,
          message: `${file.path} explicitly targets missing repository path${missing.length === 1 ? "" : "s"}: ${[...new Set(missing)].sort().join(", ")}.`
        });
    }
    if (result.diagnostic)
      diagnostics.push(result.diagnostic);
  }
  return {
    decisionInventoryVersion: 1,
    records: records.sort((a, b) => a.path.localeCompare(b.path)),
    diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))
  };
}
function selectDecisionRecords(inventory, input) {
  if (inventory.decisionInventoryVersion !== 1)
    throw new Error("Unsupported decision inventory version.");
  const paths = new Set(input.paths.map(normalizePath2));
  const task = input.task.toLowerCase();
  return inventory.records.filter((record) => record.targets.some((target) => target.kind === "file" && paths.has(target.path) || target.kind === "symbol" && Boolean(target.path && paths.has(target.path)) || (target.kind === "service" || target.kind === "contract") && task.includes(target.name.toLowerCase())) || titleTerms(record.title).some((term) => task.includes(term)));
}
function parseDecisionRecord(input) {
  const path = validatePath(input.path);
  if (!input.fingerprint.trim() || /[\0-\x20]/.test(input.fingerprint))
    throw new Error(`Invalid decision fingerprint for ${path}.`);
  const { frontmatter, body } = splitFrontmatter(input.content);
  const sections = markdownSections(body);
  const title = firstHeading(body) ?? frontmatter.title;
  const decision = section(sections, ["decision", "resolution", "proposal"]);
  if (!title || !decision) {
    return {
      diagnostic: {
        code: "decision-parse-failed",
        severity: "warning",
        path,
        message: `${path} was not treated as human intent because it needs a title and a Decision, Resolution, or Proposal section.`
      }
    };
  }
  const statusText = frontmatter.status ?? section(sections, ["status"]);
  const context = section(sections, ["context", "problem", "motivation"]);
  const consequences = section(sections, ["consequences", "tradeoffs", "trade-offs", "outcome"]);
  const appliesTo = [frontmatter["fixmap-applies-to"], section(sections, ["applies to", "scope"])].filter((value) => Boolean(value)).join("\n");
  const supersedesText = [frontmatter.supersedes, section(sections, ["supersedes"])].filter((value) => Boolean(value)).join("\n");
  const targets = normalizeTargets([
    ...parseExplicitTargets(appliesTo),
    ...literalPathTargets(body, input.knownPaths ?? /* @__PURE__ */ new Set())
  ]);
  const date = normalizeDate(frontmatter.date ?? section(sections, ["date"]));
  return {
    record: {
      id: `decision:${stableHash2(path)}`,
      path,
      title: normalizeProse(title, 300),
      status: normalizeStatus(statusText),
      ...date ? { date } : {},
      ...context ? { context: normalizeProse(context, 8e3) } : {},
      decision: normalizeProse(decision, 8e3),
      ...consequences ? { consequences: normalizeProse(consequences, 8e3) } : {},
      targets,
      supersedes: parseReferences(supersedesText),
      sourceFingerprint: input.fingerprint
    }
  };
}
function splitFrontmatter(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n"))
    return { frontmatter: {}, body: content };
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/.exec(content);
  if (!match)
    return { frontmatter: {}, body: content };
  const frontmatter = {};
  let currentKey;
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (field?.[1] && field[2] !== void 0) {
      currentKey = field[1].toLowerCase();
      frontmatter[currentKey] = unquote(field[2].trim());
      continue;
    }
    const item = /^\s*-\s+(.+)$/.exec(line)?.[1]?.trim();
    if (item && currentKey)
      frontmatter[currentKey] = `${frontmatter[currentKey] ? `${frontmatter[currentKey]}
` : ""}${unquote(item)}`;
  }
  return { frontmatter, body: content.slice(match[0].length) };
}
function markdownSections(body) {
  const sections = /* @__PURE__ */ new Map();
  const matches = [...body.matchAll(/^#{2,6}\s+(.+?)\s*#*\s*$/gm)];
  for (const [index, match] of matches.entries()) {
    const title = match[1]?.trim().toLowerCase();
    if (!title || match.index === void 0)
      continue;
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    sections.set(title, body.slice(start, end).trim());
  }
  return sections;
}
function section(sections, names) {
  for (const name of names) {
    const exact = sections.get(name);
    if (exact)
      return exact;
    const prefixed = [...sections].find(([heading]) => heading.startsWith(`${name}:`) || heading.startsWith(`${name} `))?.[1];
    if (prefixed)
      return prefixed;
  }
  return void 0;
}
function firstHeading(body) {
  return body.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
}
function parseExplicitTargets(text) {
  const targets = [];
  const values = text.replace(/^\s*[-*]\s+/gm, "").replace(/^\[|\]$/g, "").split(/[\n,]/).map((value) => unquote(value.trim().replace(/^`|`$/g, ""))).filter(Boolean);
  for (const value of values) {
    const typed = /^(file|symbol|service|contract)\s*:\s*(.+)$/i.exec(value);
    const kind = typed?.[1]?.toLowerCase();
    const payload = (typed?.[2] ?? value).trim();
    if (kind === "symbol") {
      const [name, path] = payload.split("@").map((part) => part.trim());
      if (name)
        targets.push({ kind: "symbol", name, ...path ? { path: validatePath(path) } : {}, evidence: "explicit" });
    } else if (kind === "service" || kind === "contract") {
      if (payload)
        targets.push({ kind, name: payload, evidence: "explicit" });
    } else if (kind === "file" || PATH_LIKE.test(payload)) {
      targets.push({ kind: "file", path: validatePath(payload), evidence: "explicit" });
    }
  }
  return targets;
}
function literalPathTargets(body, knownPaths) {
  return [...body.matchAll(/`([^`\r\n]+)`/g)].flatMap((match) => {
    const candidate = normalizePath2(match[1]?.trim() ?? "");
    return knownPaths.has(candidate) ? [{ kind: "file", path: candidate, evidence: "literal-mention" }] : [];
  });
}
function normalizeTargets(targets) {
  const byKey = /* @__PURE__ */ new Map();
  for (const target of targets) {
    const key = target.kind === "file" ? `file:${target.path}` : target.kind === "symbol" ? `symbol:${target.path ?? ""}:${target.name}` : `${target.kind}:${target.name}`;
    const existing = byKey.get(key);
    if (!existing || existing.evidence === "literal-mention")
      byKey.set(key, { ...target });
  }
  return [...byKey.values()].sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}
function targetKey(target) {
  if (target.kind === "file")
    return `file:${target.path}`;
  if (target.kind === "symbol")
    return `symbol:${target.path ?? ""}:${target.name}`;
  return `${target.kind}:${target.name}`;
}
function parseReferences(text) {
  return [...new Set(text.split(/[\n,]/).map((value) => value.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean))].sort();
}
function normalizeStatus(value) {
  const normalized = value?.toLowerCase().replace(/[*_`]/g, " ").trim() ?? "";
  if (/\baccepted|approved|active\b/.test(normalized))
    return "accepted";
  if (/\bproposed|draft|pending\b/.test(normalized))
    return "proposed";
  if (/\brejected|declined\b/.test(normalized))
    return "rejected";
  if (/\bdeprecated|obsolete\b/.test(normalized))
    return "deprecated";
  if (/\bsuperseded|replaced\b/.test(normalized))
    return "superseded";
  return "unknown";
}
function normalizeDate(value) {
  if (!value)
    return void 0;
  const candidate = value.trim().split(/\s+/)[0];
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate))
    return void 0;
  const parsed = /* @__PURE__ */ new Date(`${candidate}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== candidate)
    return void 0;
  return candidate;
}
function normalizeProse(value, maximum) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0"))
    throw new Error("Decision record prose is empty or exceeds the supported bound.");
  return normalized;
}
function titleTerms(title) {
  return title.toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}/g)?.filter((term) => !["decision", "record", "architecture", "using", "with"].includes(term)) ?? [];
}
function validatePath(value) {
  const normalized = normalizePath2(value.trim());
  if (!normalized || /^(?:[\\/]|[A-Za-z]:)/.test(value) || value.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid decision path: ${value}`);
  }
  return normalized;
}
function normalizePath2(path) {
  return path.replace(/\\/g, "/");
}
function unquote(value) {
  return value.replace(/^(?:["'])(.*)(?:["'])$/, "$1");
}
function stableHash2(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

// packages/core/dist/architecture.js
var RULE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function parseArchitecturePolicy(input) {
  const sourcePath = validateRelativePath2(input.path, "architecture policy path");
  if (!input.fingerprint.trim() || /[\0-\x20]/.test(input.fingerprint))
    throw new Error("Architecture policy needs a valid source fingerprint.");
  let parsed;
  try {
    parsed = JSON.parse(input.content);
  } catch {
    throw new Error(`${sourcePath} is not valid JSON.`);
  }
  if (!isRecord4(parsed) || parsed.architecturePolicyVersion !== 1) {
    throw new Error(`${sourcePath} must declare architecturePolicyVersion 1.`);
  }
  const policy = {
    architecturePolicyVersion: 1,
    source: { path: sourcePath, fingerprint: input.fingerprint },
    boundaries: array(parsed.boundaries).map((rule, index) => boundaryRule(rule, index)),
    requiredTests: array(parsed.requiredTests).map((rule, index) => testRule(rule, index)),
    requiredReviews: array(parsed.requiredReviews).map((rule, index) => reviewRule(rule, index)),
    contracts: array(parsed.contracts).map((rule, index) => contractRule(rule, index))
  };
  const ids = [
    ...policy.boundaries.map((rule) => rule.id),
    ...policy.requiredTests.map((rule) => rule.id),
    ...policy.requiredReviews.map((rule) => rule.id),
    ...policy.contracts.map((rule) => rule.id)
  ];
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate)
    throw new Error(`Duplicate architecture policy rule id: ${duplicate}`);
  if (ids.length > 500)
    throw new Error("Architecture policy exceeds the 500-rule bound.");
  return policy;
}
function architecturePolicyFromRepo(repo) {
  const file = repo.files.find((candidate) => candidate.path === ".fixmap/policy.json");
  if (!file)
    return void 0;
  if (file.textSampleComplete === false || !file.contentFingerprint) {
    throw new Error(".fixmap/policy.json requires complete content and an exact fingerprint.");
  }
  return parseArchitecturePolicy({ path: file.path, content: file.textSample, fingerprint: file.contentFingerprint });
}
function evaluateArchitecturePolicy(policy, input) {
  const findings = [];
  const graph = buildImportGraph(input.repo.files);
  const focus = input.focusPaths ? new Set(input.focusPaths) : void 0;
  for (const rule of policy.boundaries) {
    for (const [from, targets] of graph.imports) {
      if (focus && !focus.has(from))
        continue;
      if (!matchesAny(from, rule.from))
        continue;
      for (const to of targets) {
        if (!matchesAny(to, rule.deny))
          continue;
        findings.push({
          code: "boundary-violation",
          severity: rule.severity,
          ruleId: rule.id,
          message: `${from} imports denied architecture target ${to}: ${rule.reason}`,
          paths: [from, to],
          evidence: [
            { kind: "import", path: from, relatedPath: to, detail: `${from} imports ${to}.` },
            ...rule.decisionId ? [{ kind: "decision-record", detail: rule.decisionId }] : []
          ]
        });
      }
    }
  }
  const changed = input.repo.changedFiles;
  for (const rule of policy.requiredTests) {
    const triggering = changed.filter((path) => matchesAny(path, rule.paths));
    if (triggering.length === 0 || changed.some((path) => matchesAny(path, rule.tests)))
      continue;
    findings.push({
      code: "required-test-missing",
      severity: rule.severity,
      ruleId: rule.id,
      message: `${triggering.length} changed path${triggering.length === 1 ? "" : "s"} triggered ${rule.id}, but no required test pattern changed: ${rule.reason}`,
      paths: triggering,
      evidence: [
        ...triggering.map((path) => ({ kind: "changed-file", path, detail: `Matches ${rule.paths.join(", ")}.` })),
        ...rule.tests.map((pattern) => ({ kind: "test-pattern", detail: pattern }))
      ]
    });
  }
  for (const rule of policy.requiredReviews) {
    const triggering = changed.filter((path) => matchesAny(path, rule.paths));
    if (triggering.length === 0)
      continue;
    findings.push({
      code: "review-required",
      severity: "info",
      ruleId: rule.id,
      message: `${rule.reviewers.join(", ")} should review ${triggering.join(", ")}: ${rule.reason}`,
      paths: triggering,
      evidence: rule.reviewers.map((reviewer) => ({ kind: "reviewer", detail: reviewer }))
    });
  }
  for (const rule of policy.contracts) {
    if (!rule.forbidBreaking || !input.contractComparison)
      continue;
    for (const change of input.contractComparison.changes.filter((candidate) => candidate.compatibility === "breaking" && matchesAny(candidate.path, rule.paths))) {
      findings.push({
        code: "breaking-contract",
        severity: rule.severity,
        ruleId: rule.id,
        message: `${change.path} has a breaking contract change forbidden by ${rule.id}: ${rule.reason}`,
        paths: [change.path],
        evidence: [{ kind: "contract-change", path: change.path, detail: `${change.id}: ${change.reason}` }]
      });
    }
  }
  return {
    policyFingerprint: policy.source.fingerprint,
    findings: findings.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || a.ruleId.localeCompare(b.ruleId) || a.paths.join("\0").localeCompare(b.paths.join("\0")))
  };
}
function boundaryRule(value, index) {
  const rule = ruleRecord(value, "boundaries", index);
  return {
    id: ruleId(rule.id, "boundaries", index),
    from: patterns(rule.from, "boundary from"),
    deny: patterns(rule.deny, "boundary deny"),
    reason: reason(rule.reason),
    severity: severity(rule.severity),
    ...typeof rule.decisionId === "string" && rule.decisionId.trim() ? { decisionId: rule.decisionId.trim() } : {}
  };
}
function testRule(value, index) {
  const rule = ruleRecord(value, "requiredTests", index);
  return {
    id: ruleId(rule.id, "requiredTests", index),
    paths: patterns(rule.paths, "test paths"),
    tests: patterns(rule.tests, "required tests"),
    reason: reason(rule.reason),
    severity: severity(rule.severity)
  };
}
function reviewRule(value, index) {
  const rule = ruleRecord(value, "requiredReviews", index);
  const reviewers = strings(rule.reviewers, "reviewers");
  return { id: ruleId(rule.id, "requiredReviews", index), paths: patterns(rule.paths, "review paths"), reviewers, reason: reason(rule.reason) };
}
function contractRule(value, index) {
  const rule = ruleRecord(value, "contracts", index);
  if (typeof rule.forbidBreaking !== "boolean")
    throw new Error(`contracts[${index}].forbidBreaking must be boolean.`);
  return {
    id: ruleId(rule.id, "contracts", index),
    paths: patterns(rule.paths, "contract paths"),
    forbidBreaking: rule.forbidBreaking,
    reason: reason(rule.reason),
    severity: severity(rule.severity)
  };
}
function ruleRecord(value, section2, index) {
  if (!isRecord4(value))
    throw new Error(`${section2}[${index}] must be an object.`);
  return value;
}
function ruleId(value, section2, index) {
  if (typeof value !== "string" || !RULE_ID.test(value))
    throw new Error(`${section2}[${index}] has an invalid id.`);
  return value;
}
function reason(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 1e3)
    throw new Error("Architecture policy rules need a bounded reason.");
  return value.trim();
}
function severity(value) {
  if (value !== "warning" && value !== "error")
    throw new Error("Architecture policy severity must be warning or error.");
  return value;
}
function patterns(value, label) {
  const values = strings(value, label);
  if (values.length > 100)
    throw new Error(`${label} exceeds the 100-pattern bound.`);
  for (const pattern of values) {
    if (pattern.length > 500 || pattern.startsWith("!") || pattern.includes("\0") || /^(?:[\\/]|[A-Za-z]:)/.test(pattern) || pattern.split(/[\\/]/).includes("..")) {
      throw new Error(`Invalid ${label} pattern: ${pattern}`);
    }
  }
  return [...new Set(values.map((pattern) => pattern.replace(/\\/g, "/")))].sort();
}
function strings(value, label) {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string" && entry.trim() && entry.length <= 500)) {
    throw new Error(`${label} must be a non-empty string array.`);
  }
  return value.map((entry) => entry.trim());
}
function matchesAny(path, patternsToMatch) {
  return patternsToMatch.some((pattern) => buildPathExcluder([pattern]).excludes(path));
}
function severityOrder(value) {
  return value === "error" ? 0 : value === "warning" ? 1 : 2;
}
function validateRelativePath2(value, label) {
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || /^(?:[\\/]|[A-Za-z]:)/.test(value) || value.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error(`Invalid ${label}: ${value}`);
  return normalized;
}
function array(value) {
  if (value === void 0)
    return [];
  if (!Array.isArray(value))
    throw new Error("Architecture policy sections must be arrays.");
  return value;
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/dist/report.js
var MAX_REPORTED_TERMS = 8;
function buildReportFromRepo(repo, input) {
  const grounding = analyzeTaskGrounding(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const ranked = rankContextFilesEvidenceDetailed(repo, {
    issueText: input.issueText,
    diffText: repo.diffText,
    exclude: input.exclude
  }, input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT);
  const contextFiles = ranked.contextFiles;
  const ranking = ranked.ranking;
  return assembleReport(repo, input, grounding, contextFiles, ranking);
}
async function buildHybridReportFromRepo(repo, input) {
  const grounding = analyzeTaskGrounding(repo, { issueText: input.issueText, diffText: repo.diffText });
  const hybrid = await rankContextFilesHybrid(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  }, {
    embeddingProvider: input.embeddingProvider,
    limit: input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT,
    ...input.allowRemoteEmbeddings !== void 0 ? { allowRemoteEmbeddings: input.allowRemoteEmbeddings } : {},
    ...input.exclude ? { exclude: input.exclude } : {}
  });
  const contextFiles = hybrid.files.map((file) => ({
    ...file,
    confidence: hybridConfidence(file)
  }));
  const retrieval = {
    mode: hybrid.mode,
    weights: hybrid.weights,
    ...hybrid.semantic ? { semantic: hybrid.semantic } : {}
  };
  const diagnostics = hybrid.diagnostics.flatMap((entry) => entry.code === "semantic-disabled" ? [] : [{ ...entry, code: entry.code }]);
  return assembleReport(repo, input, grounding, contextFiles, hybrid.structuralRanking, diagnostics, retrieval, hybrid);
}
function assembleReport(repo, input, grounding, contextFiles, ranking, extraDiagnostics = [], retrieval, hybrid) {
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];
  const impact = buildImpactMap(repo, contextPaths, testRoutes);
  const annotations = input.annotationAsOf ? buildReportAnnotations(repo, [...contextPaths, ...impact.inspectionOrder, ...repo.changedFiles], input.issueText ?? "", input.annotationAsOf) : void 0;
  const decisionInventory = inventoryDecisionRecords(repo);
  const decisions = selectDecisionRecords(decisionInventory, {
    paths: [...contextPaths, ...impact.inspectionOrder, ...repo.changedFiles],
    task: input.issueText ?? ""
  });
  let policy;
  const policyDiagnostics = [];
  try {
    const architecturePolicy = architecturePolicyFromRepo(repo);
    if (architecturePolicy)
      policy = evaluateArchitecturePolicy(architecturePolicy, {
        repo,
        focusPaths: [...contextPaths, ...repo.changedFiles]
      });
  } catch (error) {
    policyDiagnostics.push({
      code: "architecture-policy-invalid",
      severity: "error",
      paths: [".fixmap/policy.json"],
      message: `.fixmap/policy.json was not applied: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  return {
    reportVersion: 1,
    summary: buildSummary(contextFiles.length, testRoutes.length, impact.files.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    impact,
    changedFiles: repo.changedFiles,
    diagnostics: [
      ...repo.diagnostics,
      ...findGatedTestDiagnostics(repo.files, routedTestPaths),
      ...findMissingTestRouteDiagnostics(repo, contextFiles, testRoutes),
      ...findTaskDiagnostics(repo, grounding, ranking),
      ...findTaskPreprocessingDiagnostics(input.issueText ?? ""),
      ...findEmptyResultDiagnostics(repo, contextFiles, input.issueText ?? "", input.exclude),
      ...annotations?.diagnostics ?? [],
      ...decisionInventory.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        paths: [diagnostic.path]
      })),
      ...policyDiagnostics,
      ...(policy?.findings ?? []).map((finding) => ({
        code: policyDiagnosticCode(finding.code),
        severity: finding.severity,
        message: finding.message,
        paths: finding.paths
      })),
      ...extraDiagnostics
    ],
    analysis: {
      grounding,
      ranking,
      ...hybrid ? { retrievalRanking: buildRetrievalRanking(hybrid) } : {},
      // Only a test route's related paths are tests. A lint, typecheck or Go route fills the
      // same field with implementation paths, and counting those made nextAction promise
      // "and its routed tests" when nothing of the sort had been routed.
      nextAction: buildNextAction(grounding, ranking, contextFiles, testRoutes.some((route) => route.kind === "test" && route.relatedFiles.length > 0))
    },
    ...retrieval ? { retrieval } : {},
    ...annotations && annotations.entries.length > 0 ? { annotations: {
      asOf: input.annotationAsOf,
      sourcePath: ".fixmap/annotations.json",
      sourceFingerprint: repo.files.find((file) => file.path === ".fixmap/annotations.json").contentFingerprint,
      entries: annotations.entries
    } } : {},
    ...decisions.length > 0 ? { decisions } : {},
    ...policy ? { policy } : {}
  };
}
function policyDiagnosticCode(code) {
  if (code === "boundary-violation")
    return "architecture-boundary-violation";
  if (code === "required-test-missing")
    return "architecture-required-test";
  if (code === "review-required")
    return "architecture-review-required";
  return "architecture-breaking-contract";
}
function buildReportAnnotations(repo, relevantPaths, issueText, asOf) {
  const source = repo.files.find((file) => file.path === ".fixmap/annotations.json");
  if (!source)
    return void 0;
  if (source.textSampleComplete === false || !source.contentFingerprint) {
    return { entries: [], diagnostics: [{
      code: "annotation-source-incomplete",
      severity: "warning",
      paths: [source.path],
      message: ".fixmap/annotations.json exceeded the scanner content bound or could not be read; human-intent notes were not applied."
    }] };
  }
  let assessments;
  try {
    const store = validateAnnotationStore(JSON.parse(source.textSample));
    assessments = assessAnnotations(store, repo, { now: asOf, renames: diffRenames(repo.diffText) });
  } catch (error) {
    return { entries: [], diagnostics: [{
      code: "annotation-store-invalid",
      severity: "warning",
      paths: [source.path],
      message: `.fixmap/annotations.json was not applied: ${error instanceof Error ? error.message : String(error)}`
    }] };
  }
  const paths = new Set(relevantPaths);
  const lowerIssue = issueText.toLowerCase();
  const entries = assessments.filter((assessment) => {
    const scope = assessment.annotation.scope;
    if (scope.kind === "file" || scope.kind === "symbol")
      return paths.has(scope.path);
    if (scope.kind === "contract")
      return Boolean(scope.path && paths.has(scope.path)) || lowerIssue.includes(scope.name.toLowerCase());
    return lowerIssue.includes(scope.name.toLowerCase());
  });
  const diagnostics = entries.flatMap((assessment) => {
    const paths2 = annotationPaths(assessment);
    if (assessment.status === "expired")
      return [{
        code: "annotation-expired",
        severity: "info",
        message: assessment.message,
        ...paths2 ? { paths: paths2 } : {}
      }];
    if (assessment.status === "missing-target" || assessment.status === "renamed-target")
      return [{
        code: "annotation-target-stale",
        severity: "warning",
        message: assessment.message,
        ...paths2 ? { paths: paths2 } : {}
      }];
    return [];
  });
  return { entries, diagnostics };
}
function annotationPaths(assessment) {
  const scope = assessment.annotation.scope;
  const path = scope.kind === "file" || scope.kind === "symbol" || scope.kind === "contract" ? scope.path : void 0;
  return path ? [path] : void 0;
}
function diffRenames(diffText) {
  const lines = diffText.split(/\r?\n/);
  const renames = [];
  for (let index = 0; index < lines.length; index += 1) {
    const from = lines[index]?.match(/^rename from (.+)$/)?.[1];
    const to = lines[index + 1]?.match(/^rename to (.+)$/)?.[1];
    if (from && to)
      renames.push({ from, to });
  }
  return renames;
}
function hybridConfidence(file) {
  if (file.retrieval.structuralRank === file.rank || file.confidence !== "high")
    return file.confidence;
  const anchored = file.reasons.some((reason2) => reason2 === "changed file" || reason2 === "explicitly named in the task" || reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
  return anchored ? file.confidence : "medium";
}
function buildRetrievalRanking(hybrid) {
  const top = hybrid.files[0]?.fusionScore;
  const runnerUp = hybrid.files[1]?.fusionScore;
  return {
    topFusionScore: top ?? null,
    runnerUpFusionScore: runnerUp ?? null,
    topGap: top !== void 0 && runnerUp !== void 0 ? Number((top - runnerUp).toFixed(8)) : null
  };
}
function findMissingTestRouteDiagnostics(repo, contextFiles, testRoutes) {
  if (!contextFiles.some((entry) => repo.files.find((file) => file.path === entry.path)?.kind === "code")) {
    return [];
  }
  if (testRoutes.length > 0) {
    const routedTests = testRoutes.filter((route) => route.kind === "test");
    if (routedTests.length > 0 && routedTests.every((route) => route.relatedFiles.length === 0)) {
      return [{
        code: "no-related-tests",
        severity: "info",
        message: `A test command was routed (\`${routedTests[0].command}\`) but no existing test file covers the ranked context, so the command will not exercise this change until one is written.`
      }];
    }
    return [];
  }
  const { language, evidence } = detectPrimaryLanguage(repo);
  const runner = suggestedRunner(language, repo.files) ?? configuredJsRunner(repo.files);
  return [{
    code: "no-test-route",
    severity: "warning",
    message: runner ? `No test command was routed. FixMap read this as a ${language} repository (${evidence}) and found no supported package script; \`${runner}\` is the runner that fits, but confirm it against the project's own configuration before relying on it.` : "No test command was routed. FixMap found code context but no supported package test script, so tests were not assumed to be absent."
  }];
}
function findTaskDiagnostics(repo, grounding, ranking) {
  const diagnostics = [];
  if (grounding.unresolvedIdentifiers.length > 0) {
    diagnostics.push({
      code: "unresolved-identifier",
      severity: "warning",
      message: `Identifier${grounding.unresolvedIdentifiers.length === 1 ? "" : "s"} not found exactly in the scanned repository: ${grounding.unresolvedIdentifiers.join(", ")}. Component words from unresolved identifiers were ignored, and unsupported recommendations were capped at low confidence.`
    });
  }
  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    diagnostics.push({
      code: "partially-resolved-identifier",
      severity: "info",
      message: `Identifier${grounding.partiallyResolvedIdentifiers.length === 1 ? "" : "s"} matched a longer repository symbol by component terms: ${grounding.partiallyResolvedIdentifiers.join(", ")}. The component terms were retained, but confidence was capped at medium.`
    });
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    const skipReasons = new Set(repo.files.filter((file) => file.isSource && file.textSampleComplete === false).map((file) => file.textSampleSkipReason));
    const cause = skipReasons.size === 1 && skipReasons.has("too-large") ? "one or more source files exceeded the text-sampling limit" : "one or more source files could not be sampled as UTF-8 text";
    diagnostics.push({
      code: "identifier-unverified",
      severity: "warning",
      message: `Identifier${grounding.unverifiedIdentifiers.length === 1 ? "" : "s"} could not be verified because ${cause}: ${grounding.unverifiedIdentifiers.join(", ")}. FixMap did not claim that the identifier was absent, and confidence was capped at low without another anchor.`
    });
  }
  if (grounding.specificity === "vague") {
    diagnostics.push({
      code: "vague-task",
      severity: "warning",
      message: "The task is broad and has no verified symbol, file, or diff anchor. Treat the ranking as subsystem guidance only, or add a failing behavior, error string, command, symbol, or file path."
    });
  }
  if (ranking.clustered && grounding.specificity !== "anchored") {
    diagnostics.push({
      code: "flat-ranking",
      severity: "warning",
      message: "The leading files have tightly clustered scores, so FixMap cannot identify a decisive edit point. Use them as a starting neighborhood and verify the exact file before editing."
    });
  }
  return diagnostics;
}
function findTaskPreprocessingDiagnostics(issueText) {
  const signals = extractTaskSignals({ issueText });
  if (signals.uncheckedChecklistLinesPreserved > 0) {
    return [{
      code: "task-checklist-filtered",
      severity: "info",
      message: `Preserved ${signals.uncheckedChecklistLinesPreserved} unchecked checklist ${signals.uncheckedChecklistLinesPreserved === 1 ? "line" : "lines"} because they contained the issue's only substantive task details.`
    }];
  }
  if (signals.uncheckedChecklistLinesRemoved > 0) {
    return [{
      code: "task-checklist-filtered",
      severity: "info",
      message: `Removed ${signals.uncheckedChecklistLinesRemoved} unchecked issue-template ${signals.uncheckedChecklistLinesRemoved === 1 ? "option" : "options"} before ranking; selected checklist items and prose were retained.`
    }];
  }
  return [];
}
function findEmptyResultDiagnostics(repo, contextFiles, issueText, exclude) {
  if (contextFiles.length > 0 || repo.files.length === 0) {
    return [];
  }
  const signals = extractTaskSignals({
    issueText,
    diffText: repo.diffText,
    changedFiles: repo.changedFiles
  });
  const terms = [...signals.tokens].sort();
  if (exclude?.patterns.length) {
    const withoutExclusions = rankContextFiles(repo, { issueText, diffText: repo.diffText }, DEFAULT_CONTEXT_FILE_LIMIT);
    const excludedMatches = withoutExclusions.filter((file) => exclude.excludes(file.path));
    if (excludedMatches.length > 0) {
      const paths = excludedMatches.map((file) => file.path);
      return [{
        code: "no-context-match",
        severity: "warning",
        message: `No context files: ${paths.length} matching ${paths.length === 1 ? "file was" : "files were"} removed by exclusion patterns (${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ", \u2026" : ""}). Remove the pattern or run --explain on one of these paths.`,
        paths: paths.slice(0, 8)
      }];
    }
  }
  if (terms.length === 0 && signals.identifiers.size === 0 && signals.fileMentions.size === 0) {
    return [{
      code: "no-task-terms",
      severity: "warning",
      message: "No context files: the task text contained no searchable term. Every word was a common word, a language keyword, or shorter than three characters. Name the failing behavior, a symbol, or a file path."
    }];
  }
  const preview = terms.slice(0, MAX_REPORTED_TERMS).map((term) => truncateForDiagnostic(term, DIAGNOSTIC_TERM_LIMIT)).join(", ");
  const remainder = terms.length > MAX_REPORTED_TERMS ? ` (+${terms.length - MAX_REPORTED_TERMS} more)` : "";
  return [{
    code: "no-context-match",
    severity: "warning",
    message: `No context files: no file in the ${repo.files.length} scanned matched the task terms ${preview}${remainder}. The repository may not contain this behavior, or it may name it differently.`
  }];
}
function scopeToPackage(paths, packageDir) {
  if (!packageDir) {
    return paths;
  }
  const prefix = `${packageDir}/`;
  return paths.filter((path) => path.startsWith(prefix));
}
var JS_RUNNER_CONFIGS = [
  [/^vitest\.config\.[cm]?[jt]s$/, "npx vitest run"],
  [/^jest\.config\.([cm]?[jt]s|json)$/, "npx jest"],
  [/^playwright\.config\.[cm]?[jt]s$/, "npx playwright test"],
  [/^karma\.conf\.[cm]?[jt]s$/, "npx karma start"]
];
function configuredJsRunner(files) {
  const names = new Set(files.map((file) => file.path.split("/").pop()?.toLowerCase() ?? ""));
  for (const [pattern, runner] of JS_RUNNER_CONFIGS) {
    if ([...names].some((name) => pattern.test(name)))
      return runner;
  }
  return void 0;
}
function classifyScript(name) {
  const lower = name.toLowerCase();
  if (lower === "test" || lower === "tests")
    return { category: "test", exact: true };
  if (/^tests?:[a-z0-9:_-]+$/.test(lower))
    return { category: "test", exact: false };
  return void 0;
}
function buildTestRoutes(repo, contextPaths) {
  const codeContextPaths = contextPaths.filter((path) => repo.files.find((file) => file.path === path)?.kind === "code");
  if (codeContextPaths.length === 0) {
    return [];
  }
  const relatedTests = findRelatedTests(repo, contextPaths).filter((path) => {
    const file = repo.files.find((entry) => entry.path === path);
    return file?.isTest === true && file.kind === "code";
  });
  const candidates = repo.packageScripts.map((script) => ({ script, kind: classifyScript(script.name) })).filter((candidate) => candidate.kind !== void 0).map(({ script, kind }) => ({
    script,
    kind,
    proximity: packageProximity(script.packageDir, codeContextPaths),
    priority: kind.exact ? 0 : 1
  })).filter((candidate) => candidate.proximity >= 0).sort((a, b) => b.proximity - a.proximity || a.priority - b.priority || a.script.packageDir.localeCompare(b.script.packageDir));
  const commands = /* @__PURE__ */ new Set();
  const routes = [];
  for (const { script } of candidates) {
    const command = formatScriptCommand(repo.packageManager, script.packageDir, script.name, script.packageName);
    if (commands.has(command))
      continue;
    commands.add(command);
    routes.push({
      command,
      kind: "test",
      reason: `${script.packageDir ? `nearest package (${script.packageDir})` : "repository root"} script named ${script.name}`,
      relatedFiles: scopeToPackage(relatedTests, script.packageDir)
    });
    if (routes.length === 3)
      break;
  }
  if (routes.length === 0) {
    const manifestRoute = buildManifestTestRoute(repo, codeContextPaths, relatedTests);
    if (manifestRoute) {
      routes.push(manifestRoute);
    }
  }
  return routes;
}
function buildManifestTestRoute(repo, codeContextPaths, relatedTests) {
  const { language } = detectPrimaryLanguage(repo);
  const packageDir = language === "rust" ? nearestManifestDir(repo, codeContextPaths, ["Cargo.toml"]) : language === "python" ? nearestManifestDir(repo, codeContextPaths, ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile"]) : language === "java" ? nearestManifestDir(repo, codeContextPaths, ["pom.xml", "build.gradle", "build.gradle.kts"]) : "";
  const route = language === "dotnet" ? codeContextPaths.map((path) => dotnetTestCommandForPath(repo.files, path)).find((entry) => entry !== void 0) ?? manifestTestCommand(language, packageDir, repo.files) : language === "php" ? codeContextPaths.map((path) => phpTestCommandForPath(repo.files, path)).find((entry) => entry !== void 0) ?? manifestTestCommand(language, packageDir, repo.files) : language === "ruby" ? codeContextPaths.map((path) => rubyTestCommandForPath(repo.files, path, relatedTests)).find((entry) => entry !== void 0) ?? manifestTestCommand(language, packageDir, repo.files) : manifestTestCommand(language, packageDir, repo.files);
  if (!route) {
    return void 0;
  }
  return {
    command: route.command,
    kind: "test",
    reason: route.reason,
    // Only real test files count as related here. Falling back to the implementation made
    // nextAction claim routed tests for a Go module that had none.
    relatedFiles: scopeToPackage(relatedTests, route.scopeDir ?? packageDir)
  };
}
function nearestManifestDir(repo, contextPaths, manifests) {
  const manifestNames = new Set(manifests.map((manifest) => manifest.toLowerCase()));
  const manifestDirs = repo.files.filter((file) => manifestNames.has(file.path.split("/").pop()?.toLowerCase() ?? "")).map((file) => file.path.split("/").slice(0, -1).join("/")).filter(Boolean);
  return manifestDirs.filter((dir) => contextPaths.some((path) => path.startsWith(`${dir}/`))).sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b))[0] ?? "";
}
var RISK_RULES = [
  { area: "authentication", severity: "high", terms: ["auth", "login", "password"], reason: "authentication-related files are affected" },
  { area: "billing", severity: "high", terms: ["billing", "payment", "invoice"], reason: "billing or payment-related files are affected" },
  { area: "automation", severity: "medium", terms: ["config", "workflow", "action", "ci"], reason: "configuration or CI automation files may affect developer workflows" },
  { area: "data", severity: "high", terms: ["migration", "schema", "database", "sql"], reason: "database or schema-related files may affect stored data" },
  { area: "public-api", severity: "medium", terms: ["api", "route", "public"], reason: "public interfaces or request handling may change" },
  { area: "dependencies", severity: "medium", terms: ["dependency", "lock", "package"], reason: "dependency changes can affect build and supply-chain behavior" }
];
var AUXILIARY_RISK_DIRS = /* @__PURE__ */ new Set(["demo", "demos", "example", "examples", "sample", "samples", "fixture", "fixtures"]);
function carriesRiskEvidence(path) {
  return !path.split("/").slice(0, -1).some((segment) => AUXILIARY_RISK_DIRS.has(segment.toLowerCase()));
}
function buildRiskNotes(contextPaths, changedFiles = []) {
  const contextTokens = new Set(contextPaths.filter(carriesRiskEvidence).flatMap((path) => [...riskTokens(path)]));
  const changedTokens = new Set(changedFiles.flatMap((path) => [...riskTokens(path)]));
  const diffPresent = changedFiles.length > 0;
  const risks = [];
  for (const rule of RISK_RULES) {
    const terms = rule.terms.flatMap((term) => [...riskTokens(term)]);
    const inChanged = terms.some((token) => changedTokens.has(token));
    const inContext = terms.some((token) => contextTokens.has(token));
    if (!inChanged && !inContext) {
      continue;
    }
    if (inChanged) {
      risks.push({ area: rule.area, severity: rule.severity, reason: rule.reason });
    } else {
      risks.push({
        area: rule.area,
        severity: "low",
        reason: diffPresent ? `context ranking surfaced ${rule.area}-related files, but none of the changed files touch this area` : `ranked files touch ${rule.area}; review this area before editing, but no diff evidence is available yet`
      });
    }
  }
  return risks;
}
function pathsForRiskArea(area, paths) {
  const rule = RISK_RULES.find((candidate) => candidate.area === area);
  if (!rule)
    return [];
  return paths.filter((path) => {
    const tokens = riskTokens(path);
    return rule.terms.flatMap((term) => [...riskTokens(term)]).some((token) => tokens.has(token));
  });
}
function riskTokens(value) {
  return /* @__PURE__ */ new Set([
    ...tokenizePath(value),
    ...value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  ]);
}
function packageProximity(packageDir, contextPaths) {
  if (!packageDir)
    return 1;
  const matches = contextPaths.filter((path) => path === packageDir || path.startsWith(`${packageDir}/`));
  return matches.length > 0 ? 10 + packageDir.split("/").length : -1;
}
function formatScriptCommand(manager, packageDir, script, packageName) {
  if (!packageDir)
    return `${manager} run ${script}`;
  if (manager === "npm")
    return `npm --prefix ${packageDir} run ${script}`;
  if (manager === "pnpm")
    return `pnpm --dir ${packageDir} run ${script}`;
  if (manager === "yarn") {
    return packageName ? `yarn workspace ${packageName} run ${script}` : `yarn --cwd ${packageDir} ${script}`;
  }
  return `bun --cwd ${packageDir} run ${script}`;
}
function findRelatedTests(repo, contextPaths) {
  const changedSet = new Set(repo.changedFiles);
  const changedTests = repo.files.filter((file) => file.isTest && changedSet.has(file.path)).map((file) => file.path).sort((a, b) => a.localeCompare(b));
  const changedTestSet = new Set(changedTests);
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));
  const overlapping = repo.files.filter((file) => file.isTest && !changedTestSet.has(file.path)).map((file) => {
    const testTokens = tokenizePath(file.path);
    const overlap = [...testTokens].filter((token) => contextTokens.has(token)).length;
    return { path: file.path, score: overlap };
  }).filter((file) => file.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).map((file) => file.path);
  return [...changedTests, ...overlapping].slice(0, 8);
}
function buildSummary(contextFileCount, testRouteCount, impactFileCount = 0) {
  const files = contextFileCount === 1 ? "context file" : "context files";
  const routes = testRouteCount === 1 ? "test route" : "test routes";
  const impact = impactFileCount === 1 ? "impact file" : "impact files";
  return `FixMap found ${contextFileCount} ${files}, ${impactFileCount} ${impact}, and generated ${testRouteCount} ${routes}.`;
}
function renderMarkdownReport(report) {
  const lines = [
    "# FixMap Report",
    "",
    report.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report.contextFiles.map((file) => `- ${markdownCode(file.path)} (${file.confidence} confidence, score ${file.score}): ${file.reasons.join("; ")}`)),
    "",
    "## Impact Graph",
    "",
    ...listOrEmpty((report.impact?.files ?? []).map((file) => `- ${markdownCode(file.path)} (${file.confidence} confidence, impact ${file.score}): ${file.evidence.map((entry) => entry.reason).join("; ")}`)),
    ...report.impact ? [
      "",
      `Inspection order: ${report.impact.inspectionOrder.map(markdownCode).join(" \u2192 ") || "None"}.`,
      `History evidence: ${report.impact.history.available ? `${report.impact.history.eligibleCommits.toLocaleString()} eligible ${report.impact.history.eligibleCommits === 1 ? "commit" : "commits"}${report.impact.history.shallow ? " (shallow)" : ""}${report.impact.history.truncated ? " (bounded)" : ""}` : "not available; import and test evidence only"}.`
    ] : [],
    "",
    "## Test Routes",
    "",
    ...listOrEmpty(report.testRoutes.map((route) => {
      const related = route.relatedFiles.length > 0 ? ` Related: ${route.relatedFiles.map(markdownCode).join(", ")}.` : "";
      return `- ${markdownCode(route.command)}: ${route.reason}.${related}`;
    })),
    "",
    "## Risk Map",
    "",
    ...listOrEmpty(report.risks.map((risk) => `- **${risk.severity}** ${risk.area}: ${risk.reason}`)),
    ...report.annotations || report.decisions ? [
      "",
      "## Human Intent",
      "",
      ...listOrEmpty([
        ...(report.decisions ?? []).map((decision) => `- **ADR ${decision.status}** ${markdownCode(decision.path)} \u2014 ${decision.title}: ${inlineProse(decision.decision)}`),
        ...(report.annotations?.entries ?? []).map((assessment) => `- **annotation ${assessment.status}** ${describeAnnotationScope(assessment)}: ${assessment.annotation.note}`)
      ])
    ] : [],
    ...report.policy ? [
      "",
      "## Architecture Policy",
      "",
      ...listOrEmpty(report.policy.findings.map((finding) => `- **${finding.severity}** ${markdownCode(finding.ruleId)}: ${finding.message}`))
    ] : [],
    "",
    "## Changed Files",
    "",
    ...listOrEmpty(report.changedFiles.map((path) => `- ${markdownCode(path)}`)),
    ...report.analysis ? [
      "",
      "## Analysis",
      "",
      `- Task grounding: **${report.analysis.grounding.specificity}**`,
      `- Repository scan: **${report.analysis.grounding.scanComplete ? "complete" : "incomplete"}**`,
      `- Ranking shape: **${report.analysis.ranking.clustered ? "clustered" : "separated"}**`,
      `- Next action: ${report.analysis.nextAction}`
    ] : [],
    "",
    "## Diagnostics",
    "",
    ...listOrEmpty(report.diagnostics.flatMap((diagnostic) => [
      `- **${diagnostic.severity}** ${diagnostic.message}`,
      ...(diagnostic.paths ?? []).slice(0, 8).map((path) => `  - ${markdownCode(path)}`)
    ]))
  ];
  return `${lines.join("\n")}
`;
}
function renderJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}
`;
}
function describeAnnotationScope(assessment) {
  const scope = assessment.annotation.scope;
  if (scope.kind === "file")
    return markdownCode(scope.path);
  if (scope.kind === "symbol")
    return `${markdownCode(scope.symbol)} in ${markdownCode(scope.path)}`;
  if (scope.kind === "service")
    return `service ${markdownCode(scope.name)}`;
  return `contract ${markdownCode(scope.name)}${scope.path ? ` in ${markdownCode(scope.path)}` : ""}`;
}
function inlineProse(value) {
  return value.replace(/\s+/g, " ").trim();
}
function listOrEmpty(lines) {
  return lines.length > 0 ? lines : ["- None found"];
}

// packages/core/dist/repo-scan.js
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
var WALK_IGNORED_DIRS = /* @__PURE__ */ new Set([
  ...ALWAYS_IGNORED_DIRS,
  ...[...GENERATED_DIRS].filter((directory) => directory !== "vendor")
]);
var SOURCE_EXTENSIONS = SOURCE_FILE_EXTENSIONS;
var CONVENTIONAL_DOCUMENT_NAMES = /* @__PURE__ */ new Set([
  "authors",
  "changelog",
  "code_of_conduct",
  "contributing",
  "license",
  "notice",
  "readme",
  "security"
]);
var CONVENTIONAL_CONFIG_NAMES = /* @__PURE__ */ new Set([
  ".dockerignore",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".npmignore",
  ".rspec",
  "codeowners",
  "dockerfile",
  "gemfile",
  "jenkinsfile",
  "makefile",
  "procfile",
  "rakefile",
  "vagrantfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradlew",
  "gradlew.bat",
  "mvnw",
  "mvnw.cmd",
  "phpunit.xml",
  "phpunit.xml.dist",
  "pyproject.toml",
  "pytest.ini",
  "setup.cfg",
  "tox.ini"
]);
var SFC_EXTENSIONS = /* @__PURE__ */ new Set([".vue", ".svelte"]);
var SFC_SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
var TEST_PATTERNS = [
  /\.test(?:\.|-d\.)/,
  /\.spec\./,
  /(^|\/|\\)__tests__(\/|\\)/,
  /(^|\/|\\)tests?(\/|\\)/,
  /(^|\/|\\)spec(\/|\\)/,
  /_spec\.rb$/i,
  /(?:Test\.java|Tests?\.cs|Test\.php)$/i,
  /_test\.go$/,
  /(^|\/|\\)(?:test_[^/\\]+|[^/\\]+_test)\.py$/
];
var MAX_TEXT_SAMPLE_BYTES = 64e3;
var MAX_DIFF_TEXT_CHARS = 2e5;
var MAX_SCANNED_FILES = 25e3;
var TRACKED_SCAN_IO_CONCURRENCY = 32;
var GIT_MAX_BUFFER = 10 * 1024 * 1024;
var GIT_HISTORY_MAX_BUFFER = 24 * 1024 * 1024;
var MAX_HISTORY_COMMITS = 1e3;
var MAX_HISTORY_FILES_PER_COMMIT = 30;
var exec = promisify(execFile);
var SCAN_CACHE_VERSION = 7;
var SCAN_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var SCAN_CACHE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1e3;
var SCAN_CACHE_FILE = /^[a-f0-9]{24}-[a-f0-9]{24}\.json$/;
var SCAN_CACHE_TEMP_FILE = /^[a-f0-9]{24}-[a-f0-9]{24}\.json\.\d+-[0-9a-f-]+\.tmp$/i;
var INCREMENTAL_INDEX_VERSION = 2;
var INCREMENTAL_INDEX_TEMP_FILE = /^[a-f0-9]{24}-index-v2\.json\.\d+-[0-9a-f-]+\.tmp$/i;
async function scanRepo(input) {
  const repoRoot = resolve(input.repoRoot);
  if (!await isDirectory(repoRoot)) {
    return {
      root: input.repoRoot,
      files: [],
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [{
        code: "repo-root-missing",
        severity: "error",
        message: `Repository root "${input.repoRoot}" does not exist or is not a directory.`
      }]
    };
  }
  const diagnostics = [];
  const internalPaths = await resolveInternalPaths(repoRoot, input.internalExclude ?? []);
  const cacheRoot = configuredScanCacheRoot();
  const internalCacheRoot = sameFilesystemPath(cacheRoot, repoRoot) || containedPath(repoRoot, cacheRoot) !== void 0 ? cacheRoot : void 0;
  const cacheDecision = input.useCache === true ? await buildScanCacheLocation(repoRoot, cacheRoot, internalPaths, input.includeHistory === true) : void 0;
  const cacheLocation = cacheDecision?.location;
  const incrementalIndexLocation = input.useCache === true && !sameFilesystemPath(cacheRoot, repoRoot) && containedPath(repoRoot, cacheRoot) === void 0 ? buildIncrementalIndexLocation(repoRoot, cacheRoot) : void 0;
  if (input.useCache === false) {
    diagnostics.push({
      code: "cache-bypass",
      severity: "info",
      message: "Repository scan caching was bypassed by --no-cache; this report used a fresh scan."
    });
  } else if (input.useCache === true && cacheDecision?.skipReason) {
    diagnostics.push({
      code: "cache-skip",
      severity: "info",
      message: cacheDecision.skipReason
    });
  }
  const cached = cacheLocation ? await readScanCache(cacheLocation) : void 0;
  let files;
  let trackedFiles;
  let packageScripts;
  let packageManager;
  let history;
  if (cached) {
    files = cached.files;
    trackedFiles = cached.trackedFiles;
    packageScripts = cached.packageScripts;
    packageManager = cached.packageManager;
    history = cached.history ?? void 0;
    diagnostics.push(...cached.diagnostics, {
      code: "cache-hit",
      severity: "info",
      message: `Reused the repository scan for the exact current git state (${files.length.toLocaleString()} files, ${describeCacheAge(cached.createdAt)}). Pass --no-cache to rescan.`
    });
  } else {
    files = await listFiles(repoRoot, diagnostics, internalCacheRoot, internalPaths, incrementalIndexLocation);
    trackedFiles = await listTrackedPaths(repoRoot, internalPaths);
    packageScripts = await readPackageScripts(repoRoot, files, diagnostics);
    packageManager = detectPackageManager(files, diagnostics);
    history = input.includeHistory === true ? await readRepositoryHistory(repoRoot, new Set(files.map((file) => file.path)), diagnostics) : void 0;
    if (cacheLocation) {
      await writeScanCache(cacheLocation, {
        version: SCAN_CACHE_VERSION,
        stateKey: cacheLocation.stateKey,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        files,
        trackedFiles,
        packageScripts,
        packageManager,
        diagnostics: [...diagnostics],
        history: history ?? null
      });
    }
  }
  const diffSpec = resolveDiffSpec(input);
  const diff = input.workingTree ? await readWorkingTree(repoRoot, input.includeUntracked === true, diagnostics, internalPaths) : await readDiff(repoRoot, diffSpec, diagnostics, internalPaths);
  const orderedDiagnostics = [
    ...diagnostics.filter((entry) => !entry.code.startsWith("impact-history-")),
    ...diagnostics.filter((entry) => entry.code.startsWith("impact-history-"))
  ];
  return {
    root: repoRoot,
    files,
    trackedFiles,
    packageScripts,
    changedFiles: diff.changedFiles,
    diffText: diff.diffText,
    packageManager,
    diagnostics: orderedDiagnostics,
    ...history ? { history } : {}
  };
}
function buildIncrementalIndexLocation(root, cacheRoot) {
  const repoKey = hashText(resolve(root));
  return { path: join(cacheRoot, `${repoKey}-index-v2.json`), repoKey };
}
function configuredScanCacheRoot() {
  return resolve(process.env.FIXMAP_CACHE_DIR ?? join(process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "fixmap", "scans"));
}
function containedPath(root, candidate) {
  const distance = relative(root, candidate);
  return distance === "" || distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance) ? void 0 : normalizePath3(distance);
}
async function resolveInternalPaths(root, paths) {
  const requested = paths.flatMap((path) => {
    const relativePath = containedPath(root, resolve(path));
    return relativePath ? [relativePath] : [];
  });
  if (requested.length === 0 || process.platform !== "win32")
    return new Set(requested);
  try {
    const { stdout } = await exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    const repositoryPaths = stdout.split("\0").filter(Boolean).map(normalizePath3);
    return new Set(requested.map((path) => repositoryPaths.find((candidate) => sameFilesystemPath(candidate, path)) ?? path));
  } catch {
    return new Set(requested);
  }
}
function hasInternalPath(paths, path) {
  return [...paths].some((candidate) => sameFilesystemPath(candidate, path));
}
function gitPathspec(internalPaths) {
  return ["--", ".", ...[...internalPaths].sort((a, b) => a.localeCompare(b)).map((path) => `:(exclude,literal)${path}`)];
}
async function buildScanCacheLocation(root, cacheRoot, internalPaths, includeHistory) {
  if (sameFilesystemPath(cacheRoot, root) || containedPath(root, cacheRoot) !== void 0) {
    return {
      skipReason: "Repository scan caching was skipped because FIXMAP_CACHE_DIR is inside the scanned repository. Move the cache outside the repository to enable exact-state reuse."
    };
  }
  try {
    const [{ stdout: head }, { stdout: status }] = await Promise.all([
      exec("git", ["rev-parse", "HEAD"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", ...gitPathspec(internalPaths)], {
        cwd: root,
        maxBuffer: GIT_MAX_BUFFER
      })
    ]);
    if (status.split("\0").some((entry) => entry.startsWith("?? "))) {
      return {
        skipReason: "Repository scan caching was skipped because untracked files are scanner inputs and can change without a stable git diff."
      };
    }
    const dirtyDiff = status.length > 0 ? (await exec("git", ["diff", "--binary", "--no-ext-diff", "HEAD", ...gitPathspec(internalPaths)], {
      cwd: root,
      maxBuffer: GIT_MAX_BUFFER
    })).stdout : "";
    const stateKey = hashText([
      String(SCAN_CACHE_VERSION),
      resolve(root),
      head.trim(),
      status,
      dirtyDiff,
      includeHistory ? "history" : "no-history",
      ...[...internalPaths].sort((a, b) => a.localeCompare(b))
    ].join("\0"));
    return { location: {
      path: join(cacheRoot, `${hashText(resolve(root))}-${stateKey}.json`),
      stateKey
    } };
  } catch {
    return {
      skipReason: "Repository scan caching was skipped because this directory has no exact git state to key safely."
    };
  }
}
async function readScanCache(location) {
  try {
    const cached = JSON.parse(await readFile(location.path, "utf8"));
    const createdAt = typeof cached.createdAt === "string" ? Date.parse(cached.createdAt) : Number.NaN;
    if (cached.version !== SCAN_CACHE_VERSION || cached.stateKey !== location.stateKey || typeof cached.createdAt !== "string" || !Number.isFinite(createdAt) || Date.now() - createdAt > SCAN_CACHE_MAX_AGE_MS || createdAt - Date.now() > SCAN_CACHE_MAX_FUTURE_SKEW_MS || !Array.isArray(cached.files) || !cached.files.every(isCachedRepoFile) || !Array.isArray(cached.trackedFiles) || !cached.trackedFiles.every(isCachedRelativePath) || !Array.isArray(cached.packageScripts) || !cached.packageScripts.every(isCachedPackageScript) || !Array.isArray(cached.diagnostics) || !cached.diagnostics.every(isCachedDiagnostic) || !(cached.history === null || isCachedHistory(cached.history)) || !["npm", "pnpm", "yarn", "bun"].includes(cached.packageManager ?? ""))
      return void 0;
    return cached;
  } catch {
    return void 0;
  }
}
async function readIncrementalScanIndex(location) {
  try {
    const candidate = JSON.parse(await readFile(location.path, "utf8"));
    if (candidate.version !== INCREMENTAL_INDEX_VERSION || candidate.repoKey !== location.repoKey || typeof candidate.updatedAt !== "string" || !Number.isFinite(Date.parse(candidate.updatedAt)) || !Array.isArray(candidate.files))
      return void 0;
    const entries = /* @__PURE__ */ new Map();
    for (const entry of candidate.files) {
      if (!isRecord5(entry) || !isCachedRelativePath(entry.path) || typeof entry.fingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(entry.fingerprint) || !isCachedRepoFile(entry.file) || entry.file.path !== entry.path || entries.has(entry.path)) {
        return void 0;
      }
      entries.set(entry.path, entry);
    }
    return entries;
  } catch {
    return void 0;
  }
}
function isCachedHistory(candidate) {
  if (!isRecord5(candidate) || !Array.isArray(candidate.commits) || typeof candidate.inspectedCommits !== "number" || !Number.isSafeInteger(candidate.inspectedCommits) || candidate.inspectedCommits < 0 || typeof candidate.skippedLargeCommits !== "number" || !Number.isSafeInteger(candidate.skippedLargeCommits) || candidate.skippedLargeCommits < 0 || typeof candidate.shallow !== "boolean" || typeof candidate.truncated !== "boolean") {
    return false;
  }
  return candidate.commits.every((commit) => {
    if (!isRecord5(commit) || typeof commit.hash !== "string" || !/^[a-f0-9]{40}$/i.test(commit.hash) || typeof commit.committedAt !== "number" || !Number.isSafeInteger(commit.committedAt) || commit.committedAt < 0 || commit.author !== void 0 && (typeof commit.author !== "string" || !commit.author.trim() || commit.author.length > 200 || /[\0-\x1f\x7f]/.test(commit.author)) || !Array.isArray(commit.files))
      return false;
    return commit.files.every(isCachedRelativePath);
  });
}
function isCachedRepoFile(candidate) {
  if (!isRecord5(candidate))
    return false;
  const validSkipReason = candidate.textSampleSkipReason === "too-large" || candidate.textSampleSkipReason === "not-text" || candidate.textSampleSkipReason === "unreadable";
  return isCachedRelativePath(candidate.path) && typeof candidate.contentFingerprint === "string" && /^(?:git|worktree):[a-f0-9]{40,64}$/i.test(candidate.contentFingerprint) && typeof candidate.extension === "string" && typeof candidate.sizeBytes === "number" && Number.isFinite(candidate.sizeBytes) && candidate.sizeBytes >= 0 && typeof candidate.isTest === "boolean" && typeof candidate.isSource === "boolean" && (candidate.kind === "code" || candidate.kind === "config" || candidate.kind === "documentation" || candidate.kind === "other") && typeof candidate.textSample === "string" && typeof candidate.textSampleComplete === "boolean" && (candidate.textSampleComplete && candidate.textSampleSkipReason === void 0 || !candidate.textSampleComplete && validSkipReason);
}
function isCachedPackageScript(candidate) {
  if (!isRecord5(candidate))
    return false;
  return typeof candidate.name === "string" && candidate.name.trim().length > 0 && typeof candidate.command === "string" && (candidate.packageDir === "" || isCachedRelativePath(candidate.packageDir)) && (candidate.packageName === void 0 || typeof candidate.packageName === "string" && candidate.packageName.trim().length > 0);
}
function isCachedDiagnostic(candidate) {
  if (!isRecord5(candidate))
    return false;
  return typeof candidate.code === "string" && candidate.code.trim().length > 0 && typeof candidate.message === "string" && candidate.message.trim().length > 0 && (candidate.severity === "info" || candidate.severity === "warning" || candidate.severity === "error") && (candidate.paths === void 0 || Array.isArray(candidate.paths) && candidate.paths.every(isCachedRelativePath));
}
function isRecord5(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
function isCachedRelativePath(candidate) {
  if (typeof candidate !== "string" || candidate.trim().length === 0 || candidate.includes("\0") || isAbsolute(candidate) || /^[\\/]/.test(candidate) || /^[A-Za-z]:/.test(candidate)) {
    return false;
  }
  const segments = candidate.replace(/\\/g, "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
async function writeScanCache(location, cached) {
  const temporaryPath = `${location.path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(location.path), { recursive: true });
    await pruneExpiredScanCache(dirname(location.path));
    await writeFile(temporaryPath, `${JSON.stringify(cached)}
`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, location.path);
  } catch {
    try {
      await unlink(temporaryPath);
    } catch {
    }
  }
}
async function writeIncrementalScanIndex(location, files) {
  const temporaryPath = `${location.path}.${process.pid}-${randomUUID()}.tmp`;
  const index = {
    version: INCREMENTAL_INDEX_VERSION,
    repoKey: location.repoKey,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    files
  };
  try {
    await mkdir(dirname(location.path), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(index)}
`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, location.path);
  } catch {
    try {
      await unlink(temporaryPath);
    } catch {
    }
  }
}
async function pruneExpiredScanCache(cacheRoot) {
  try {
    const entries = await readdir(cacheRoot, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(entries.filter((entry) => entry.isFile() && (SCAN_CACHE_FILE.test(entry.name) || SCAN_CACHE_TEMP_FILE.test(entry.name) || INCREMENTAL_INDEX_TEMP_FILE.test(entry.name))).map(async (entry) => {
      const path = join(cacheRoot, entry.name);
      try {
        const metadata = await stat(path);
        if (now - metadata.mtimeMs > SCAN_CACHE_MAX_AGE_MS)
          await unlink(path);
      } catch {
      }
    }));
  } catch {
  }
}
function describeCacheAge(createdAt) {
  const ageMs = Math.max(0, Date.now() - Date.parse(createdAt));
  if (ageMs < 5e3)
    return "scanned just now";
  const minutes = Math.floor(ageMs / 6e4);
  if (minutes < 1)
    return "scanned less than a minute ago";
  if (minutes < 60)
    return `scanned ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `scanned ${hours}h ago`;
  return `scanned ${Math.floor(hours / 24)}d ago`;
}
function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
async function listTrackedPaths(root, internalPaths) {
  try {
    const { stdout } = await exec("git", ["ls-files", "--cached", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    return stdout.split("\0").filter(Boolean).map(normalizePath3).filter((path) => !hasInternalPath(internalPaths, path));
  } catch {
    return [];
  }
}
function resolveDiffSpec(input) {
  return input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : void 0);
}
async function listFiles(root, diagnostics, internalCacheRoot, internalPaths, incrementalIndexLocation) {
  const gitPaths = await listGitPaths(root);
  const visiblePaths = gitPaths?.paths.filter((path) => !hasInternalPath(internalPaths, normalizePath3(path)) && !isInternalCachePath(root, path, internalCacheRoot));
  let files;
  if (gitPaths) {
    const previous = incrementalIndexLocation ? await readIncrementalScanIndex(incrementalIndexLocation) : void 0;
    const built = await buildFilesFromPaths(root, visiblePaths ?? [], diagnostics, gitPaths.gitLinks, gitPaths.fingerprints, previous);
    files = built.files;
    if (incrementalIndexLocation) {
      await writeIncrementalScanIndex(incrementalIndexLocation, built.indexedFiles);
    }
    if (previous && built.reused > 0) {
      diagnostics.push({
        code: "incremental-index-hit",
        severity: "info",
        message: `Reused ${built.reused.toLocaleString()} unchanged file record${built.reused === 1 ? "" : "s"} from the persistent index and refreshed ${built.refreshed.toLocaleString()} changed or new path${built.refreshed === 1 ? "" : "s"}.`
      });
    }
  } else {
    const state = { count: 0, limitReported: false, linkedPaths: [] };
    files = (await walkFiles(root, root, diagnostics, state, internalCacheRoot, internalPaths)).sort((a, b) => a.path.localeCompare(b.path));
    if (state.linkedPaths.length > 0) {
      const paths = [...new Set(state.linkedPaths)].sort();
      diagnostics.push({
        code: "linked-paths-skipped",
        severity: "info",
        message: `Skipped ${paths.length} symbolic link or junction ${paths.length === 1 ? "path" : "paths"} during the filesystem scan to avoid leaving the repository or following a loop: ${paths.slice(0, 5).map(markdownCode).join(", ")}${paths.length > 5 ? ", ..." : ""}.`,
        paths: paths.slice(0, 8)
      });
    }
  }
  reportUnreadContent(diagnostics, files);
  reportGeneratedDominance(diagnostics, files);
  return files;
}
function isInternalCachePath(root, path, internalCacheRoot) {
  if (!internalCacheRoot)
    return false;
  const relativeCacheRoot = containedPath(root, internalCacheRoot);
  if (relativeCacheRoot) {
    const candidate = process.platform === "win32" ? path.toLowerCase() : path;
    const cachePath = process.platform === "win32" ? relativeCacheRoot.toLowerCase() : relativeCacheRoot;
    return candidate === cachePath || candidate.startsWith(`${cachePath}/`);
  }
  return sameFilesystemPath(internalCacheRoot, root) && (SCAN_CACHE_FILE.test(path) || SCAN_CACHE_TEMP_FILE.test(path));
}
async function listGitPaths(root) {
  try {
    const [{ stdout }, { stdout: staged }, { stdout: dirty }] = await Promise.all([
      exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: root,
        maxBuffer: GIT_MAX_BUFFER
      }),
      exec("git", ["ls-files", "--stage", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--name-only", "-z", "HEAD", "--"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }).catch(() => exec("git", ["diff", "--name-only", "-z", "--"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }))
    ]);
    const gitLinks = /* @__PURE__ */ new Set();
    const fingerprints = /* @__PURE__ */ new Map();
    for (const entry of staged.split("\0")) {
      const match = /^(\d+)\s+([0-9a-f]+)\s+\d+\t(.+)$/i.exec(entry);
      if (!match?.[1] || !match[2] || !match[3])
        continue;
      const path = normalizePath3(match[3]);
      if (match[1] === "160000") {
        gitLinks.add(path);
      } else if (!/^0+$/.test(match[2])) {
        fingerprints.set(path, `git:${match[2].toLowerCase()}`);
      }
    }
    for (const path of dirty.split("\0").filter(Boolean).map(normalizePath3)) {
      fingerprints.delete(path);
    }
    return { paths: [...new Set(stdout.split("\0").filter(Boolean))], gitLinks, fingerprints };
  } catch {
    return void 0;
  }
}
async function buildFilesFromPaths(root, paths, diagnostics, knownGitLinks = /* @__PURE__ */ new Set(), fingerprints = /* @__PURE__ */ new Map(), previous) {
  const results = [];
  const indexedByPath = /* @__PURE__ */ new Map();
  const reusedPaths = /* @__PURE__ */ new Set();
  const absent = [];
  const gitLinks = [];
  const seenRealPaths = /* @__PURE__ */ new Map();
  const linked = [];
  const realRoot = await resolveRealPath(root);
  const preparePath = async (rawPath, index) => {
    const relativePath = normalizePath3(rawPath);
    if (isInAlwaysIgnoredDir(relativePath)) {
      return { index, relativePath, status: "ignored" };
    }
    if (knownGitLinks.has(relativePath)) {
      return { index, relativePath, status: "git-link" };
    }
    const absolutePath = join(root, rawPath);
    const fingerprint = fingerprints.get(relativePath) ?? await hashWorktreeFile(absolutePath);
    const prior = fingerprint ? previous?.get(relativePath) : void 0;
    const reused2 = prior && prior.fingerprint === fingerprint ? prior.file : void 0;
    const scanned = await toRepoFile(absolutePath, relativePath, fingerprint, reused2);
    return { index, relativePath, status: "scanned", fingerprint, reused: reused2 !== void 0, scanned };
  };
  let limitReached = false;
  for (let start = 0; start < paths.length && !limitReached; start += TRACKED_SCAN_IO_CONCURRENCY) {
    const batch = paths.slice(start, start + TRACKED_SCAN_IO_CONCURRENCY);
    const prepared = await Promise.all(batch.map((rawPath, offset) => preparePath(rawPath, start + offset)));
    for (const candidate of prepared) {
      if (results.length >= MAX_SCANNED_FILES) {
        reportScanLimit(diagnostics, paths.slice(candidate.index).map(normalizePath3));
        limitReached = true;
        break;
      }
      if (candidate.status === "ignored")
        continue;
      if (candidate.status === "git-link") {
        gitLinks.push(candidate.relativePath);
        continue;
      }
      if (candidate.status !== "scanned")
        continue;
      const { relativePath, fingerprint, reused: reused2, scanned } = candidate;
      if (scanned.status === "absent") {
        absent.push(relativePath);
        continue;
      }
      if (scanned.status === "not-a-file") {
        gitLinks.push(relativePath);
        continue;
      }
      if (scanned.status !== "ok") {
        continue;
      }
      const seenIndex = seenRealPaths.get(scanned.realPath);
      if (seenIndex !== void 0) {
        const seenFile = results[seenIndex];
        const seenIsAlias = !sameFilesystemPath(resolve(realRoot, seenFile.path), scanned.realPath);
        const currentIsAlias = !sameFilesystemPath(resolve(realRoot, relativePath), scanned.realPath);
        if (seenIsAlias && !currentIsAlias) {
          linked.push({ path: seenFile.path, target: relativePath });
          indexedByPath.delete(seenFile.path);
          reusedPaths.delete(seenFile.path);
          results[seenIndex] = scanned.file;
          if (fingerprint) {
            indexedByPath.set(relativePath, { path: relativePath, fingerprint, file: scanned.file });
            if (reused2)
              reusedPaths.add(relativePath);
          }
        } else {
          linked.push({ path: relativePath, target: seenFile.path });
        }
        continue;
      }
      seenRealPaths.set(scanned.realPath, results.length);
      results.push(scanned.file);
      if (fingerprint) {
        indexedByPath.set(relativePath, { path: relativePath, fingerprint, file: scanned.file });
        if (reused2)
          reusedPaths.add(relativePath);
      }
    }
  }
  reportAbsentTrackedPaths(diagnostics, absent);
  reportLinkedDuplicates(diagnostics, linked);
  reportSkippedSubmodules(diagnostics, gitLinks);
  const files = results.sort((a, b) => a.path.localeCompare(b.path));
  const indexedFiles = files.flatMap((file) => {
    const indexed = indexedByPath.get(file.path);
    return indexed ? [indexed] : [];
  });
  const reused = files.filter((file) => reusedPaths.has(file.path)).length;
  return { files, indexedFiles, reused, refreshed: Math.max(0, indexedFiles.length - reused) };
}
async function hashWorktreeFile(path) {
  return await new Promise((resolveHash) => {
    const hash = createHash("sha256");
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", () => resolveHash(void 0));
    input.on("end", () => resolveHash(`worktree:${hash.digest("hex")}`));
  });
}
function reportAbsentTrackedPaths(diagnostics, absent) {
  if (absent.length === 0)
    return;
  diagnostics.push({
    code: "tracked-paths-absent",
    severity: "warning",
    message: `${absent.length.toLocaleString()} tracked path${absent.length === 1 ? " is" : "s are"} not present on disk and went unranked, mostly under ${summarizeSkippedScope(absent)}. That means a sparse or partial checkout, an uncommitted deletion, or a path this filesystem could not create.`
  });
}
function reportUnreadContent(diagnostics, files) {
  const unavailable = files.filter((file) => file.isSource && file.textSampleComplete === false && file.textSampleSkipReason !== "too-large");
  for (const reason2 of ["not-text", "unreadable"]) {
    const affected = unavailable.filter((file) => file.textSampleSkipReason === reason2);
    if (affected.length === 0)
      continue;
    const sample2 = affected.slice(0, 3).map((file) => file.path).join(", ");
    const prefix = `${affected.length.toLocaleString()} source file${affected.length === 1 ? "" : "s"}`;
    diagnostics.push({
      code: reason2 === "not-text" ? "content-not-utf8" : "content-unreadable",
      severity: "warning",
      message: reason2 === "not-text" ? `${prefix} ${affected.length === 1 ? "is" : "are"} not UTF-8 text (for example UTF-16 or binary) and rank${affected.length === 1 ? "s" : ""} on path alone: ${sample2}${affected.length > 3 ? ", ..." : ""}. Re-save source as UTF-8 to rank its contents.` : `${prefix} could not be read and rank${affected.length === 1 ? "s" : ""} on path alone: ${sample2}${affected.length > 3 ? ", ..." : ""}. Check file permissions and retry.`,
      paths: affected.slice(0, 8).map((file) => file.path)
    });
  }
  const unread = files.filter((file) => file.isSource && file.textSampleComplete === false && file.textSampleSkipReason === "too-large");
  if (unread.length === 0)
    return;
  const sample = unread.slice().sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 3).map((file) => `${file.path} (${Math.ceil(file.sizeBytes / 1e3).toLocaleString()} kB)`).join(", ");
  diagnostics.push({
    code: "content-too-large",
    severity: "warning",
    message: `${unread.length.toLocaleString()} source file${unread.length === 1 ? "" : "s"} exceeded the complete text window \u2014 largest: ${sample}${unread.length > 3 ? ", \u2026" : ""}. Files over ${(MAX_TEXT_SAMPLE_BYTES / 1e3).toLocaleString()} kB use bounded head and distributed retrieval samples; context and grounding remain incomplete.`,
    paths: unread.slice(0, 8).map((file) => file.path)
  });
}
function reportSkippedSubmodules(diagnostics, gitLinks) {
  if (gitLinks.length === 0)
    return;
  diagnostics.push({
    code: "submodules-skipped",
    severity: "info",
    message: `${gitLinks.length.toLocaleString()} git submodule${gitLinks.length === 1 ? " was" : "s were"} not scanned: ${gitLinks.slice(0, 3).join(", ")}${gitLinks.length > 3 ? ", \u2026" : ""}. Submodules are separate repositories; point --repo at one to map its contents.`,
    paths: gitLinks.slice(0, 8)
  });
}
var GENERATED_DOMINANCE_SHARE = 0.4;
var GENERATED_DOMINANCE_MINIMUM = 500;
function reportGeneratedDominance(diagnostics, files) {
  if (files.length < GENERATED_DOMINANCE_MINIMUM)
    return;
  const generated = files.filter((file) => isGeneratedPath(file.path));
  const share = generated.length / files.length;
  if (share < GENERATED_DOMINANCE_SHARE)
    return;
  diagnostics.push({
    code: "generated-paths-dominant",
    severity: "info",
    message: `${Math.round(share * 100)}% of the ${files.length.toLocaleString()} scanned files are committed build output (mostly ${summarizeSkippedScope(generated.map((file) => file.path))}). They are penalized in ranking but still consume the scan budget \u2014 point --repo at the source directory for a sharper result.`
  });
}
function reportLinkedDuplicates(diagnostics, linked) {
  if (linked.length === 0)
    return;
  const sample = linked.slice(0, 3).map((entry) => `${entry.path} -> ${entry.target}`).join(", ");
  diagnostics.push({
    code: "duplicate-real-path",
    severity: "info",
    message: `${linked.length.toLocaleString()} tracked path${linked.length === 1 ? "" : "s"} resolved to a file already scanned under another name and ${linked.length === 1 ? "was" : "were"} ranked once: ${sample}${linked.length > 3 ? ", \u2026" : ""}.`
  });
}
async function walkFiles(root, current, diagnostics, state, internalCacheRoot, internalPaths) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (state.count >= MAX_SCANNED_FILES) {
      if (!state.limitReported) {
        reportScanLimit(diagnostics);
        state.limitReported = true;
      }
      break;
    }
    if (entry.isSymbolicLink()) {
      state.linkedPaths.push(normalizePath3(relative(root, join(current, entry.name))));
      continue;
    }
    if (entry.isDirectory()) {
      if (WALK_IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const directory = join(current, entry.name);
      if (internalCacheRoot && sameFilesystemPath(directory, internalCacheRoot))
        continue;
      results.push(...await walkFiles(root, directory, diagnostics, state, internalCacheRoot, internalPaths));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const absolutePath = join(current, entry.name);
    const relativePath = normalizePath3(relative(root, absolutePath));
    if (hasInternalPath(internalPaths, relativePath) || isInternalCachePath(root, relativePath, internalCacheRoot))
      continue;
    const fingerprint = await hashWorktreeFile(absolutePath);
    const scanned = await toRepoFile(absolutePath, relativePath, fingerprint);
    if (scanned.status === "ok") {
      results.push(scanned.file);
      state.count += 1;
    }
  }
  return results;
}
async function toRepoFile(absolutePath, relativePath, contentFingerprint, reusable) {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return { status: "absent" };
  }
  if (!fileStat.isFile()) {
    return { status: "not-a-file" };
  }
  if (reusable?.path === relativePath && contentFingerprint) {
    return {
      status: "ok",
      realPath: await resolveRealPath(absolutePath),
      file: { ...reusable, contentFingerprint, sizeBytes: fileStat.size }
    };
  }
  const extension = extname(relativePath).toLowerCase();
  const conventionalKind = classifyConventionalTextFile(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(extension) || conventionalKind !== void 0;
  const sample = isSource ? await readTextSample(absolutePath, fileStat.size) : { text: "", complete: true };
  if (SFC_EXTENSIONS.has(extension) && sample.text) {
    sample.text = extractScriptBlocks(sample.text);
    if (sample.searchText)
      sample.searchText = extractScriptBlocks(sample.searchText);
  }
  return {
    status: "ok",
    realPath: await resolveRealPath(absolutePath),
    file: {
      path: relativePath,
      ...contentFingerprint ? { contentFingerprint } : {},
      extension,
      sizeBytes: fileStat.size,
      isTest: isLanguageTestPath(relativePath, extension) || TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
      isSource,
      kind: classifyFile(relativePath, extension),
      textSample: sample.text,
      ...sample.searchText ? { searchTextSample: sample.searchText } : {},
      textSampleComplete: sample.complete,
      ...sample.skipReason ? { textSampleSkipReason: sample.skipReason } : {}
    }
  };
}
async function resolveRealPath(absolutePath) {
  try {
    return await realpath(absolutePath);
  } catch {
    return absolutePath;
  }
}
function extractScriptBlocks(text) {
  const blocks = [...text.matchAll(SFC_SCRIPT_BLOCK)].map((match) => match[1] ?? "");
  const joined = blocks.join("\n").trim();
  return joined || text;
}
function sameFilesystemPath(left, right) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function isInAlwaysIgnoredDir(relativePath) {
  return relativePath.split("/").slice(0, -1).some((segment) => ALWAYS_IGNORED_DIRS.has(segment));
}
function reportScanLimit(diagnostics, skipped) {
  const advice = `Stopped scanning after ${MAX_SCANNED_FILES.toLocaleString()} files. Narrow the repository root for more precise results.`;
  const scope = skipped && skipped.length > 0 ? ` ${skipped.length.toLocaleString()} path${skipped.length === 1 ? "" : "s"} went unread, mostly under ${summarizeSkippedScope(skipped)}.` : "";
  diagnostics.push({
    code: "scan-limit-reached",
    severity: "warning",
    message: `${advice}${scope}`
  });
}
function summarizeSkippedScope(paths) {
  const counts = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const [head] = path.split("/");
    const scope = path.includes("/") && head ? `${head}/` : "the repository root";
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([scope, count]) => `${scope} (${count.toLocaleString()})`).join(", ");
}
async function readPackageScripts(root, files, diagnostics) {
  const manifests = files.filter((file) => file.path === "package.json" || file.path.endsWith("/package.json"));
  const scripts = [];
  for (const manifest of manifests) {
    const absolutePath = join(root, manifest.path);
    let bytes;
    try {
      bytes = await readFile(absolutePath);
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message: `Could not read ${manifest.path}; scripts from that package were skipped.`
      });
      continue;
    }
    let decoded;
    try {
      decoded = decodeManifest(bytes);
      const parsed = JSON.parse(decoded.text);
      const packageDir = normalizePath3(dirname(manifest.path));
      const packageName = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : void 0;
      scripts.push(...Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({
        name,
        command,
        packageDir: packageDir === "." ? "" : packageDir,
        ...packageName ? { packageName } : {}
      })));
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message: `Could not parse ${manifest.path}; scripts from that package were skipped.` + // Encoding is no longer a cause of failure, so naming it here rules it out rather
        // than sending someone to re-save a file whose real problem is a syntax error.
        (!decoded || decoded.encoding === "utf8" ? "" : ` It was decoded as ${decoded.encoding}, so the problem is the JSON itself, not the encoding.`)
      });
    }
  }
  return scripts;
}
function decodeManifest(bytes) {
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 254) {
    return { text: bytes.subarray(2).toString("utf16le"), encoding: "UTF-16LE" };
  }
  if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) {
    const body = bytes.subarray(2);
    if (body.length % 2 !== 0) {
      throw new Error("Truncated UTF-16BE input has an odd byte count");
    }
    return { text: Buffer.from(body).swap16().toString("utf16le"), encoding: "UTF-16BE" };
  }
  if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    return { text: bytes.subarray(3).toString("utf8"), encoding: "UTF-8 with a byte order mark" };
  }
  return { text: bytes.toString("utf8"), encoding: "utf8" };
}
async function readDiff(repoRoot, diffSpec, diagnostics, internalPaths) {
  if (!diffSpec) {
    return { changedFiles: [], diffText: "" };
  }
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", diffSpec, ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", diffSpec, ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map(normalizePath3);
    const untracked = diffSpec.includes("..") ? [] : await listUntrackedPaths(repoRoot, internalPaths);
    const changedFiles = [.../* @__PURE__ */ new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));
    diagnostics.push({
      code: "diff-resolved",
      severity: "info",
      message: changedFiles.length === 0 ? `The diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}" resolved to zero changed files, so results use the task text only. Paths are relative to the working directory; run from the repository root to include changes outside it.` : `Diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}" resolved ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"}.`,
      paths: changedFiles.slice(0, 8)
    });
    return { changedFiles, diffText: sampleDiffText(diffText, diagnostics) };
  } catch (error) {
    const checkoutState = isMissingGit(error) ? void 0 : await describeGitCheckout(repoRoot);
    const detail = truncateForDiagnostic(gitErrorDetail(error), DIAGNOSTIC_SPEC_LIMIT * 2);
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: checkoutState === "not-repository" ? `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ${NOT_A_GIT_CHECKOUT}` : checkoutState === "no-history" ? `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ${NO_GIT_HISTORY}` : `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ${detail}. Results use the task text only.`
    });
    return { changedFiles: [], diffText: "" };
  }
}
function sampleDiffText(diffText, diagnostics) {
  if (diffText.length <= MAX_DIFF_TEXT_CHARS)
    return diffText;
  const groups = [];
  let current;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current = [];
      groups.push(current);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (!current) {
        current = [];
        groups.push(current);
      }
      current.push(line);
    }
  }
  const queues = groups.filter((group) => group.length > 0);
  const selected = [];
  let selectedChars = 0;
  let selectedLines = 0;
  const totalLines = queues.reduce((total, group) => total + group.length, 0);
  let cursor = 0;
  let madeProgress = true;
  while (madeProgress && selectedChars < MAX_DIFF_TEXT_CHARS) {
    madeProgress = false;
    for (const group of queues) {
      const line = group[cursor];
      if (line === void 0)
        continue;
      madeProgress = true;
      const separator = selected.length === 0 ? 0 : 1;
      if (selectedChars + separator + line.length <= MAX_DIFF_TEXT_CHARS) {
        selected.push(line);
        selectedChars += separator + line.length;
        selectedLines += 1;
      }
    }
    cursor += 1;
  }
  diagnostics.push({
    code: "diff-text-truncated",
    severity: "warning",
    message: `The git diff was ${diffText.length.toLocaleString()} characters, above FixMap's ${MAX_DIFF_TEXT_CHARS.toLocaleString()}-character signal budget. FixMap sampled ${selectedLines.toLocaleString()} of ${totalLines.toLocaleString()} complete added lines across ${queues.length.toLocaleString()} changed ${queues.length === 1 ? "file" : "files"}; changed-file paths remain complete, but omitted diff content could reduce ranking precision.`
  });
  return selected.join("\n");
}
async function readWorkingTree(repoRoot, includeUntracked, diagnostics, internalPaths) {
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", "HEAD", ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", "HEAD", ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map(normalizePath3);
    const untracked = includeUntracked ? await listUntrackedPaths(repoRoot, internalPaths) : [];
    const changedFiles = [.../* @__PURE__ */ new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));
    diagnostics.push({
      code: "working-tree-diff",
      severity: "info",
      message: changedFiles.length === 0 ? "Working-tree mode found no changes against HEAD; results use the task text only." : `Working-tree mode used ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"} against HEAD${includeUntracked ? ", including untracked files" : " (untracked files are not counted as changed, though they still rank; pass --include-untracked to count them)"}.`,
      paths: changedFiles.slice(0, 8)
    });
    return { changedFiles, diffText: sampleDiffText(diffText, diagnostics) };
  } catch (error) {
    const checkoutState = isMissingGit(error) ? void 0 : await describeGitCheckout(repoRoot);
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: checkoutState === "not-repository" ? `Could not read the working tree: ${NOT_A_GIT_CHECKOUT}` : checkoutState === "no-history" ? `Could not read the working tree: ${NO_GIT_HISTORY}` : `Could not read the working tree: ${truncateForDiagnostic(gitErrorDetail(error), DIAGNOSTIC_SPEC_LIMIT * 2)}. Results use the task text only.`
    });
    return { changedFiles: [], diffText: "" };
  }
}
var NOT_A_GIT_CHECKOUT = "this directory is not a git checkout. Ranking still works from the task text; --diff, --base/--head and --working-tree need a repository with history.";
var NO_GIT_HISTORY = "this repository has no commits yet, so there is nothing to diff against. Commit the initial work first, or run with --issue alone to rank from the task text.";
async function readRepositoryHistory(root, repositoryPaths, diagnostics) {
  try {
    const [{ stdout: shallowText }, { stdout: countText }, { stdout: logText }] = await Promise.all([
      exec("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["rev-list", "--count", "--no-merges", "HEAD", "--", "."], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", [
        "-c",
        "core.quotepath=false",
        "log",
        "--relative",
        "--no-merges",
        "-n",
        String(MAX_HISTORY_COMMITS),
        "--format=%x1e%H%x1f%ct%x1f%aN",
        "--name-only",
        "-z",
        "HEAD",
        "--",
        "."
      ], { cwd: root, maxBuffer: GIT_HISTORY_MAX_BUFFER })
    ]);
    const parsed = parseHistoryLog(logText, repositoryPaths);
    const totalCommits = Number.parseInt(countText.trim(), 10);
    const shallow = shallowText.trim() === "true";
    const truncated = Number.isFinite(totalCommits) && totalCommits > parsed.inspectedCommits;
    const history = {
      commits: parsed.commits,
      inspectedCommits: parsed.inspectedCommits,
      skippedLargeCommits: parsed.skippedLargeCommits,
      shallow,
      truncated
    };
    if (shallow) {
      diagnostics.push({
        code: "impact-history-shallow",
        severity: "info",
        message: `Impact history is shallow (${parsed.inspectedCommits.toLocaleString()} visible non-merge ${parsed.inspectedCommits === 1 ? "commit" : "commits"}). Import and test relationships remain available, but co-change evidence may be incomplete.`
      });
    }
    if (truncated) {
      diagnostics.push({
        code: "impact-history-truncated",
        severity: "info",
        message: `Impact history inspected the newest ${parsed.inspectedCommits.toLocaleString()} of ${totalCommits.toLocaleString()} non-merge commits. Commits touching more than ${MAX_HISTORY_FILES_PER_COMMIT} files were excluded from co-change evidence.`
      });
    }
    return history;
  } catch (error) {
    const checkoutState = isMissingGit(error) ? void 0 : await describeGitCheckout(root);
    diagnostics.push({
      code: "impact-history-unavailable",
      severity: "info",
      message: checkoutState === "not-repository" ? "Impact history is unavailable because this directory is not a Git checkout; import and test relationships are still reported." : checkoutState === "no-history" ? "Impact history is unavailable because this repository has no commits; import and test relationships are still reported." : `Impact history could not be read (${truncateForDiagnostic(gitErrorDetail(error), DIAGNOSTIC_SPEC_LIMIT * 2)}); import and test relationships are still reported.`
    });
    return void 0;
  }
}
function parseHistoryLog(logText, repositoryPaths) {
  const commits = [];
  let inspectedCommits = 0;
  let skippedLargeCommits = 0;
  for (const record of logText.split("")) {
    if (!record)
      continue;
    const fields = record.split("\0");
    const header = fields.shift()?.replace(/^\r?\n/, "") ?? "";
    const separator = header.indexOf("");
    if (separator === -1)
      continue;
    const hash = header.slice(0, separator).trim();
    const secondSeparator = header.indexOf("", separator + 1);
    const committedAt = Number.parseInt(header.slice(separator + 1, secondSeparator === -1 ? void 0 : secondSeparator).trim(), 10);
    const rawAuthor = secondSeparator === -1 ? "" : header.slice(secondSeparator + 1).trim();
    const author = rawAuthor && !/[\0-\x1f\x7f]/.test(rawAuthor) ? rawAuthor.slice(0, 200) : void 0;
    if (!/^[a-f0-9]{40}$/i.test(hash) || !Number.isSafeInteger(committedAt) || committedAt < 0)
      continue;
    inspectedCommits += 1;
    const allFiles = [...new Set(fields.map((path) => path.replace(/^\r?\n/, "")).filter(Boolean).map(normalizePath3))];
    if (allFiles.length > MAX_HISTORY_FILES_PER_COMMIT) {
      skippedLargeCommits += 1;
      continue;
    }
    const currentFiles = allFiles.filter((path) => repositoryPaths.has(path));
    if (currentFiles.length === 0)
      continue;
    commits.push({ hash, committedAt, ...author ? { author } : {}, files: currentFiles });
  }
  return { commits, inspectedCommits, skippedLargeCommits };
}
async function describeGitCheckout(root) {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    if (stdout.trim() !== "true")
      return "not-repository";
  } catch {
    return "not-repository";
  }
  try {
    await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    return void 0;
  } catch {
    return "no-history";
  }
}
function gitErrorDetail(error) {
  const candidate = error;
  if (candidate?.code === "ENOENT")
    return "Git is not installed or is not available on PATH";
  const stderr = typeof candidate?.stderr === "string" ? candidate.stderr : "";
  const message = typeof candidate?.message === "string" ? candidate.message : String(error);
  return stderr.split(/\r?\n/).find((line) => line.trim()) ?? message.split(/\r?\n/)[0] ?? "unknown git error";
}
function isMissingGit(error) {
  return error?.code === "ENOENT";
}
function detectPackageManager(files, diagnostics) {
  const rootManagers = packageManagersForPaths(files.map((file) => file.path).filter((path) => !path.includes("/")));
  if (rootManagers.length > 1) {
    diagnostics.push({
      code: "package-manager-conflict",
      severity: "warning",
      message: `Conflicting root package-manager files were found (${rootManagers.join(", ")}); using ${rootManagers[0]} deterministically. Remove the stale lockfile so routed commands are unambiguous.`
    });
  }
  if (rootManagers[0])
    return rootManagers[0];
  const nestedManagers = packageManagersForPaths(files.map((file) => file.path));
  if (nestedManagers.length === 1)
    return nestedManagers[0];
  if (nestedManagers.length > 1) {
    diagnostics.push({
      code: "package-manager-conflict",
      severity: "warning",
      message: `Nested package-manager files disagree (${nestedManagers.join(", ")}); defaulting to npm for root routes. Point --repo at one workspace to get an unambiguous command.`
    });
  }
  return "npm";
}
function packageManagersForPaths(paths) {
  const names = new Set(paths.map((path) => path.split("/").at(-1) ?? path));
  const managers = [];
  if (names.has("pnpm-lock.yaml") || names.has("pnpm-workspace.yaml"))
    managers.push("pnpm");
  if (names.has("yarn.lock") || names.has(".yarnrc.yml"))
    managers.push("yarn");
  if (names.has("bun.lock") || names.has("bun.lockb"))
    managers.push("bun");
  if (names.has("package-lock.json") || names.has("npm-shrinkwrap.json"))
    managers.push("npm");
  return managers;
}
function classifyFile(path, extension) {
  const lower = path.toLowerCase();
  const conventionalKind = classifyConventionalTextFile(path);
  if (conventionalKind)
    return conventionalKind;
  if (extension === ".md" || lower.startsWith("docs/"))
    return "documentation";
  if (lower.startsWith(".github/") || [".json", ".yaml", ".yml"].includes(extension) || /(^|\/)(?:[^/]+\.config|\.[^/]*rc)\.[^/]+$/.test(lower))
    return "config";
  if (SOURCE_EXTENSIONS.has(extension))
    return "code";
  return "other";
}
function classifyConventionalTextFile(path) {
  const name = path.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
  if (CONVENTIONAL_DOCUMENT_NAMES.has(name))
    return "documentation";
  if (CONVENTIONAL_CONFIG_NAMES.has(name))
    return "config";
  if (/\.(?:csproj|fsproj|vbproj)$/.test(name))
    return "config";
  return void 0;
}
async function readTextSample(path, sizeBytes) {
  try {
    const bytes = sizeBytes <= MAX_TEXT_SAMPLE_BYTES ? await readFile(path) : await readFileWindow(path, 0, MAX_TEXT_SAMPLE_BYTES);
    if (bytes.includes(0)) {
      return { text: "", complete: false, skipReason: "not-text" };
    }
    const text = bytes.toString("utf8");
    if (sizeBytes <= MAX_TEXT_SAMPLE_BYTES)
      return { text, complete: true };
    const searchBytes = await readDistributedWindows(path, sizeBytes);
    if (searchBytes.includes(0))
      return { text: "", complete: false, skipReason: "not-text" };
    return { text, searchText: searchBytes.toString("utf8"), complete: false, skipReason: "too-large" };
  } catch {
    return { text: "", complete: false, skipReason: "unreadable" };
  }
}
async function readFileWindow(path, position, length) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
async function readDistributedWindows(path, sizeBytes) {
  const windowBytes = Math.floor(MAX_TEXT_SAMPLE_BYTES / 4);
  const maximumStart = Math.max(0, sizeBytes - windowBytes);
  const starts = [.../* @__PURE__ */ new Set([
    0,
    Math.floor(maximumStart / 3),
    Math.floor(maximumStart * 2 / 3),
    maximumStart
  ])];
  const windows = await Promise.all(starts.map((position) => readFileWindow(path, position, windowBytes)));
  return Buffer.concat(windows.flatMap((window, index) => index === 0 ? [window] : [Buffer.from("\n"), window]));
}
async function listUntrackedPaths(repoRoot, internalPaths = /* @__PURE__ */ new Set()) {
  try {
    const { stdout } = await exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER });
    return stdout.split("\0").filter(Boolean).map(normalizePath3).filter((path) => !hasInternalPath(internalPaths, path));
  } catch {
    return [];
  }
}
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
function normalizePath3(path) {
  return path.split(sep).join("/");
}

// packages/core/dist/plan.js
async function buildFixMapReport(input) {
  return (await buildFixMapAnalysis(input)).report;
}
async function buildFixMapAnalysis(input) {
  const scannedRepo = await scanRepo({ ...input, includeHistory: input.includeHistory !== false });
  const generatedArtifacts = scannedRepo.files.filter(isFixMapArtifact);
  const generatedPaths = new Set(generatedArtifacts.map((file) => file.path));
  const repo = generatedArtifacts.length === 0 ? scannedRepo : {
    ...scannedRepo,
    files: scannedRepo.files.filter((file) => !generatedPaths.has(file.path)),
    changedFiles: scannedRepo.changedFiles.filter((path) => !generatedPaths.has(path)),
    ...scannedRepo.trackedFiles ? { trackedFiles: scannedRepo.trackedFiles.filter((path) => !generatedPaths.has(path)) } : {}
  };
  const requestedExclude = await resolveExclusions(input.repoRoot, input.exclude ?? []);
  const internalExclude = buildPathExcluder((input.internalExclude ?? []).map((pattern) => normalizeAbsolutePattern(input.repoRoot, pattern)));
  const exclude = combineExclusions(requestedExclude, internalExclude);
  const reportInput = {
    issueText: input.issueText,
    limit: input.limit,
    exclude,
    annotationAsOf: (/* @__PURE__ */ new Date()).toISOString()
  };
  const report = input.embeddingProvider ? await buildHybridReportFromRepo(repo, { ...reportInput, embeddingProvider: input.embeddingProvider }) : buildReportFromRepo(repo, reportInput);
  if (generatedArtifacts.length > 0) {
    const described = generatedArtifacts.slice(0, 8).map((file) => `${markdownCode(file.path)} (${fixMapArtifactKind(file)})`);
    report.diagnostics.push({
      code: "fixmap-artifact-excluded",
      severity: "info",
      message: `Excluded ${generatedArtifacts.length} previously generated FixMap ${generatedArtifacts.length === 1 ? "artifact" : "artifacts"} from ranking, impact analysis, and context packing: ${described.join(", ")}${generatedArtifacts.length > 8 ? ", ..." : ""}.`,
      paths: generatedArtifacts.slice(0, 8).map((file) => file.path)
    });
  }
  if (requestedExclude.patterns.length > 0) {
    const excludedPaths = repo.files.filter((file) => requestedExclude.excludes(file.path)).map((file) => file.path);
    const effectivePatterns = [...new Set(repo.files.map((file) => requestedExclude.reasonFor(file.path)).filter((pattern) => pattern !== void 0))];
    const unmatchedPatterns = requestedExclude.patterns.filter((pattern) => !pattern.startsWith("!") && !requestedExclude.matchedPatterns.has(pattern));
    if (unmatchedPatterns.length > 0) {
      const sample = unmatchedPatterns.slice(0, 5).map(markdownCode).join(", ");
      report.diagnostics.push({
        code: "exclusion-no-match",
        severity: "warning",
        message: `${unmatchedPatterns.length} exclusion ${unmatchedPatterns.length === 1 ? "pattern matched" : "patterns matched"} no scanned paths: ${sample}${unmatchedPatterns.length > 5 ? ", ..." : ""}. Check that patterns are repository-relative or run --explain on an expected file.`
      });
    }
    if (excludedPaths.length > 0) {
      report.diagnostics.push({
        code: "paths-excluded",
        severity: report.contextFiles.length === 0 ? "warning" : "info",
        message: `${effectivePatterns.length} exclusion ${effectivePatterns.length === 1 ? "pattern" : "patterns"} removed ${excludedPaths.length} ${excludedPaths.length === 1 ? "path" : "paths"} from ranking: ${effectivePatterns.map(markdownCode).join(", ")}. Run --explain on a file you expected to see if this is why it is absent.`,
        paths: excludedPaths.slice(0, 8)
      });
    }
  }
  return { report, repo };
}
function combineExclusions(primary, internal) {
  if (internal.patterns.length === 0)
    return primary;
  if (primary.patterns.length === 0)
    return internal;
  return {
    excludes: (path) => primary.excludes(path) || internal.excludes(path),
    reasonFor: (path) => primary.reasonFor(path) ?? internal.reasonFor(path),
    patterns: [...primary.patterns, ...internal.patterns],
    matchedPatterns: /* @__PURE__ */ new Set([...primary.matchedPatterns, ...internal.matchedPatterns])
  };
}
async function resolveExclusions(repoRoot, patterns2) {
  const combined = [...await readIgnoreFile(repoRoot), ...patterns2].map((pattern) => normalizeAbsolutePattern(repoRoot, pattern));
  return combined.length > 0 ? buildPathExcluder(combined) : NO_EXCLUSIONS;
}
function normalizeAbsolutePattern(repoRoot, pattern) {
  const trimmed = pattern.trim();
  const negated = trimmed.startsWith("!");
  const body = (negated ? trimmed.slice(1) : trimmed).replace(/\\/g, "/");
  const normalizedRoot = resolve2(repoRoot).replace(/\\/g, "/").replace(/\/$/, "");
  const caseInsensitive = /^[A-Za-z]:\//.test(normalizedRoot);
  const comparableBody = caseInsensitive ? body.toLowerCase() : body;
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  if (!comparableBody.startsWith(`${comparableRoot}/`))
    return pattern;
  return `${negated ? "!" : ""}/${body.slice(normalizedRoot.length + 1)}`;
}
async function readIgnoreFile(repoRoot) {
  try {
    return parseIgnoreFile(await readFile2(join2(repoRoot, ".fixmapignore"), "utf8"));
  } catch {
    return [];
  }
}

// packages/core/dist/verify.js
function verifyPlan(report, repo) {
  const changed = repo.changedFiles;
  const findings = [];
  const fileByPath = new Map(repo.files.map((file) => [file.path, file]));
  const plannedPaths = report.contextFiles.map((file) => file.path);
  const missingPlanned = plannedPaths.filter((path) => !fileByPath.has(path));
  const changedMissingPlanned = missingPlanned.filter((path) => changed.includes(path));
  const unexplainedMissingPlanned = missingPlanned.filter((path) => !changed.includes(path));
  if (plannedPaths.length > 0 && unexplainedMissingPlanned.length === plannedPaths.length) {
    const mismatch = {
      code: "plan-repository-mismatch",
      severity: "error",
      paths: plannedPaths.slice(0, 8),
      message: `Verification was not attempted: none of the ${plannedPaths.length} planned files exist in ${repo.root}. This plan appears to be for a different repository or revision; check --repo or regenerate the plan against this checkout.`
    };
    return {
      summary: `None of the ${plannedPaths.length} planned files exist in ${repo.root}; the plan and repository do not match.`,
      changedFiles: changed,
      findings: [mismatch],
      diagnostics: repo.diagnostics
    };
  }
  if (unexplainedMissingPlanned.length > 0) {
    findings.push({
      code: "plan-partially-stale",
      severity: "warning",
      paths: unexplainedMissingPlanned.slice(0, 8),
      message: `${unexplainedMissingPlanned.length} of ${plannedPaths.length} planned paths no longer exist and are not explained by this diff. The plan may predate a rebase or rename; regenerate it before relying on the missing entries.`
    });
  }
  if (changedMissingPlanned.length > 0) {
    findings.push({
      code: "planned-file-deleted",
      severity: "info",
      paths: changedMissingPlanned.slice(0, 8),
      message: `${changedMissingPlanned.length === 1 ? "A planned file was" : `${changedMissingPlanned.length} planned files were`} removed by this diff. The deletion accounts for the missing path, so verification continued.`
    });
  }
  if (changed.length === 0) {
    return {
      summary: "No changes to verify: the diff resolved to zero files.",
      changedFiles: [],
      findings,
      diagnostics: repo.diagnostics
    };
  }
  const planned = new Set(plannedPaths);
  const isTest = (path) => fileByPath.get(path)?.isTest === true;
  const maintainedStems = new Set(repo.files.filter((file) => file.isSource && !isGeneratedPath(file.path) && !isBackupPath(file.path)).map((file) => moduleStem(file.path)));
  const tracked = new Set(repo.trackedFiles ?? []);
  const discardedEdits = changed.filter((path) => isBackupPath(path) || isGeneratedPath(path) && maintainedStems.has(moduleStem(path)) && !tracked.has(path));
  if (discardedEdits.length > 0) {
    findings.push({
      code: "edit-in-generated-location",
      severity: "error",
      paths: discardedEdits,
      message: `${discardedEdits.length === 1 ? "A file was" : `${discardedEdits.length} files were`} edited in a generated or retired location. A build regenerates these, so the change will be lost. Edit the source they are produced from.`
    });
  }
  const trackedGeneratedEdits = changed.filter((path) => isGeneratedPath(path) && maintainedStems.has(moduleStem(path)) && tracked.has(path));
  if (trackedGeneratedEdits.length > 0) {
    findings.push({
      code: "tracked-generated-edit",
      severity: "warning",
      paths: trackedGeneratedEdits,
      message: `${trackedGeneratedEdits.length === 1 ? "A committed generated artifact was" : `${trackedGeneratedEdits.length} committed generated artifacts were`} edited. Confirm the maintained source changed too and the artifact was rebuilt; tracked release artifacts are not treated as discarded edits.`
    });
  }
  const unmapped = changed.filter((path) => !planned.has(path) && !isTest(path) && !discardedEdits.includes(path) && !trackedGeneratedEdits.includes(path) && fileByPath.get(path)?.isSource !== false);
  if (unmapped.length > 0) {
    findings.push({
      code: "unmapped-change",
      severity: "warning",
      paths: unmapped,
      message: `${unmapped.length === 1 ? "One file" : `${unmapped.length} files`} changed that the plan did not rank. Either the task grew beyond the original description, or the ranking missed them \u2014 worth checking which.`
    });
  }
  const leading = report.contextFiles[0];
  if (leading && !changed.includes(leading.path)) {
    findings.push({
      code: "leading-file-untouched",
      severity: leading.confidence === "high" ? "warning" : "info",
      paths: [leading.path],
      message: `The highest-ranked file was not changed (${leading.confidence} confidence). That is expected if it was only read for context, and worth a second look if it was not opened at all.`
    });
  }
  const changedSource = changed.filter((path) => !isTest(path) && !trackedGeneratedEdits.includes(path) && !discardedEdits.includes(path) && fileByPath.get(path)?.kind === "code");
  const changedTests = changed.filter(isTest);
  if (changedSource.length > 0 && changedTests.length === 0) {
    const suggested = [...new Set(report.testRoutes.flatMap((route) => route.relatedFiles))].filter(isTest);
    const anchors = suggested.length > 0 ? suggested : changedSource;
    findings.push({
      code: "no-test-changed",
      severity: "warning",
      paths: anchors,
      message: suggested.length > 0 ? `Code changed but no test did. The plan routed ${suggested.length === 1 ? "this test" : "these tests"} as most related.` : report.testRoutes.length > 0 ? `Code changed but no test did. Run the routed ${report.testRoutes.length === 1 ? "command" : "commands"}: ${report.testRoutes.map((route) => route.command).join(", ")}.` : "Code changed but no test did, and the plan found no related test to point at."
    });
  }
  const impact = buildImpactMap(repo, changed, report.testRoutes);
  const highImpactOutsidePlan = impact.files.filter((entry) => entry.confidence === "high" && !planned.has(entry.path) && !changed.includes(entry.path) && !isTest(entry.path));
  if (highImpactOutsidePlan.length > 0) {
    findings.push({
      code: "impact-file-unreviewed",
      severity: "info",
      paths: highImpactOutsidePlan.slice(0, 8).map((entry) => entry.path),
      message: `${highImpactOutsidePlan.length === 1 ? "One high-evidence impact file is" : `${highImpactOutsidePlan.length} high-evidence impact files are`} outside both the original plan and this diff. They are not required edits, but inspect the recorded import/history evidence before finishing.`
    });
  }
  const plannedAreas = new Set(report.risks.map((risk) => risk.area));
  const newRisks = buildRiskNotes(changed, changed).filter((risk) => !plannedAreas.has(risk.area));
  for (const risk of newRisks) {
    findings.push({
      code: "new-risk-area",
      severity: "warning",
      paths: pathsForRiskArea(risk.area, changed),
      message: `The change touches ${risk.area}, which the original plan did not flag: ${risk.reason}.`
    });
  }
  let policy;
  try {
    const architecturePolicy = architecturePolicyFromRepo(repo);
    if (architecturePolicy) {
      policy = evaluateArchitecturePolicy(architecturePolicy, { repo, focusPaths: changed });
      findings.push(...policy.findings.map(policyVerifyFinding));
    }
  } catch (error) {
    findings.push({
      code: "architecture-policy-invalid",
      severity: "error",
      paths: [".fixmap/policy.json"],
      message: `.fixmap/policy.json was not applied: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  return {
    summary: buildVerifySummary(changed.length, findings),
    changedFiles: changed,
    findings,
    diagnostics: repo.diagnostics,
    impact,
    narrative: buildVerifyNarrative(report, changed, changedSource, changedTests, impact, newRisks, policy)
  };
}
function policyVerifyFinding(finding) {
  return {
    code: finding.code === "boundary-violation" ? "architecture-boundary-violation" : finding.code === "required-test-missing" ? "architecture-required-test" : finding.code === "review-required" ? "architecture-review-required" : "architecture-breaking-contract",
    severity: finding.severity,
    paths: finding.paths,
    message: finding.message
  };
}
function buildVerifyNarrative(report, changed, changedSource, changedTests, impact, newRisks, policy) {
  const narrative = [];
  if (changed.length > 0)
    narrative.push({
      classification: "observation",
      text: `${changed.length} file${changed.length === 1 ? "" : "s"} changed: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? ", ..." : ""}.`,
      evidence: changed.map((path) => ({ kind: "changed-file", path, detail: "Present in the resolved verification diff." }))
    });
  for (const finding of policy?.findings ?? []) {
    narrative.push({
      classification: "observation",
      text: `Architecture policy ${finding.ruleId} reports ${finding.code}: ${finding.message}`,
      evidence: finding.evidence.map((entry) => ({
        kind: "architecture-policy",
        ...entry.path ? { path: entry.path } : {},
        ...entry.relatedPath ? { relatedPath: entry.relatedPath } : {},
        detail: `${finding.ruleId}: ${entry.kind}: ${entry.detail}`,
        sourceFingerprint: policy.policyFingerprint
      }))
    });
  }
  for (const file of impact.files.slice(0, 8)) {
    const relationship = file.evidence[0];
    if (!relationship)
      continue;
    narrative.push({
      classification: relationship.kind === "co-change" ? "inference" : "observation",
      text: `${file.path} is in the recalculated impact graph because ${relationship.reason}.`,
      evidence: [{
        kind: "impact-relationship",
        path: relationship.seed,
        relatedPath: file.path,
        detail: `${relationship.kind}: ${relationship.reason}`
      }]
    });
  }
  if (changedSource.length > 0 && changedTests.length === 0 && report.testRoutes.length > 0) {
    narrative.push({
      classification: "observation",
      text: `Source changed without a changed test; FixMap had routed ${report.testRoutes.map((route) => route.command).join(", ")}.`,
      evidence: report.testRoutes.map((route) => ({
        kind: "test-route",
        ...route.relatedFiles[0] ? { path: route.relatedFiles[0] } : {},
        detail: `${route.command}: ${route.reason}`
      }))
    });
  }
  for (const risk of newRisks)
    narrative.push({
      classification: "inference",
      text: `The diff may introduce ${risk.area} risk: ${risk.reason}.`,
      evidence: [{ kind: "risk-rule", detail: `${risk.severity} ${risk.area}: ${risk.reason}` }]
    });
  for (const assessment of report.annotations?.entries ?? []) {
    const scope = assessment.annotation.scope;
    const path = scope.kind === "file" || scope.kind === "symbol" || scope.kind === "contract" ? scope.path : void 0;
    if (path && !changed.includes(path))
      continue;
    narrative.push({
      classification: "observation",
      text: `Repository annotation ${assessment.annotation.id} is ${assessment.status}: ${assessment.annotation.note}`,
      evidence: [{
        kind: "annotation",
        ...path ? { path } : {},
        detail: assessment.message,
        sourceFingerprint: report.annotations.sourceFingerprint
      }]
    });
  }
  for (const decision of report.decisions ?? []) {
    const targetPaths = decision.targets.flatMap((target) => target.kind === "file" ? [target.path] : target.kind === "symbol" && target.path ? [target.path] : []);
    if (targetPaths.length > 0 && !targetPaths.some((path) => changed.includes(path)))
      continue;
    narrative.push({
      classification: "observation",
      text: `${decision.path} records an ${decision.status} decision relevant to this diff: ${decision.decision.replace(/\s+/g, " ").trim()}`,
      evidence: [{
        kind: "decision-record",
        path: decision.path,
        detail: decision.title,
        sourceFingerprint: decision.sourceFingerprint
      }]
    });
  }
  return narrative.slice(0, 16);
}
function buildVerifySummary(changedCount, findings) {
  const files = `${changedCount} changed ${changedCount === 1 ? "file" : "files"}`;
  if (findings.length === 0) {
    return `FixMap verified ${files} against the plan and found nothing to flag.`;
  }
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const counts = [
    errors > 0 ? `${errors} ${errors === 1 ? "error" : "errors"}` : "",
    warnings > 0 ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""
  ].filter(Boolean);
  const tail = counts.length > 0 ? counts.join(" and ") : `${findings.length} note${findings.length === 1 ? "" : "s"}`;
  return `FixMap verified ${files} against the plan and raised ${tail}.`;
}
function renderVerifyMarkdown(result) {
  if (result.changedFiles.length === 0) {
    return [
      "# FixMap Verification",
      "",
      result.summary,
      "",
      "Nothing was compared against the plan. Run verify with a diff that contains the edit, such as `--diff HEAD~1...HEAD`.",
      ""
    ].join("\n");
  }
  const lines = ["# FixMap Verification", "", result.summary, "", "## Findings", ""];
  if (result.findings.length === 0) {
    lines.push("- None found");
  } else {
    for (const finding of result.findings) {
      lines.push(`- **${finding.severity}** ${finding.message}`);
      for (const path of finding.paths.slice(0, 8)) {
        lines.push(`  - ${markdownCode(path)}`);
      }
    }
  }
  if (result.narrative && result.narrative.length > 0) {
    lines.push("", "## Why This Diff Needs Attention", "");
    for (const statement of result.narrative) {
      lines.push(`- **${statement.classification}** ${statement.text}`);
    }
  }
  lines.push("", "## Changed Files", "");
  lines.push(...result.changedFiles.length > 0 ? result.changedFiles.map((path) => `- ${markdownCode(path)}`) : ["- None found"]);
  if (result.impact) {
    lines.push("", "## Recalculated Impact", "");
    lines.push(...result.impact.files.length > 0 ? result.impact.files.map((file) => `- ${markdownCode(file.path)} (${file.confidence} confidence): ${file.evidence.map((entry) => entry.reason).join("; ")}`) : ["- None found"]);
  }
  return `${lines.join("\n")}
`;
}

// packages/core/dist/sandbox.js
import { execFile as execFile2, spawn } from "node:child_process";
import { promisify as promisify2 } from "node:util";
var exec2 = promisify2(execFile2);
var DEFAULT_LIMITS = {
  timeoutMs: 5 * 6e4,
  outputBytes: 1e6,
  cpus: 1,
  memoryMb: 1024,
  pids: 256,
  tmpfsMb: 256
};

// packages/core/dist/ci-matrix.js
var DIMENSIONS = ["os", "runtime", "database", "browser", "feature-flag", "deployment"];
var DIMENSION_SET = new Set(DIMENSIONS);

// packages/core/dist/validate.js
function validateFixMapReport(candidate, label) {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) || !Array.isArray(candidate.contextFiles)) {
    return {
      success: false,
      message: `${label} is not a FixMap JSON report: no contextFiles array.`
    };
  }
  const record = candidate;
  if (record.reportVersion !== void 0 && record.reportVersion !== 1) {
    return {
      success: false,
      message: `${label} uses unsupported reportVersion ${JSON.stringify(record.reportVersion)}; this FixMap release supports reportVersion 1.`
    };
  }
  const invalidEnvelopeFields = [
    typeof record.summary === "string" ? void 0 : "summary (string)",
    Array.isArray(record.testRoutes) ? void 0 : "testRoutes (array)",
    Array.isArray(record.risks) ? void 0 : "risks (array)",
    Array.isArray(record.changedFiles) ? void 0 : "changedFiles (array)",
    Array.isArray(record.diagnostics) ? void 0 : "diagnostics (array)"
  ].filter((field) => field !== void 0);
  if (invalidEnvelopeFields.length > 0) {
    return {
      success: false,
      message: `${label} is missing or has invalid fields in the complete FixMap report envelope: ${invalidEnvelopeFields.join(", ")}.`
    };
  }
  const versioned = record.reportVersion === 1;
  const contextFiles = candidate.contextFiles;
  const unsafeContextPath = contextFiles.findIndex((file) => isRecord6(file) && typeof file.path === "string" && file.path.trim().length > 0 && !isRepositoryRelativePath(file.path));
  if (unsafeContextPath !== -1) {
    const path = contextFiles[unsafeContextPath].path;
    return {
      success: false,
      message: `${label} contextFiles[${unsafeContextPath}].path must stay inside the repository and use a normalized repository-relative path (got ${JSON.stringify(path)}).`
    };
  }
  const invalid = contextFiles.findIndex((file) => {
    if (!isRecord6(file))
      return true;
    const ranked = file;
    if (!isRepositoryRelativePath(ranked.path))
      return true;
    if ((versioned || ranked.rank !== void 0) && (!Number.isSafeInteger(ranked.rank) || ranked.rank < 1))
      return true;
    if ((versioned || ranked.score !== void 0) && (typeof ranked.score !== "number" || !Number.isFinite(ranked.score)))
      return true;
    if ((versioned || ranked.confidence !== void 0) && ranked.confidence !== "high" && ranked.confidence !== "medium" && ranked.confidence !== "low")
      return true;
    if ((versioned || ranked.reasons !== void 0) && !isStringArray(ranked.reasons))
      return true;
    if (ranked.fusionScore === void 0 !== (ranked.retrieval === void 0))
      return true;
    if (ranked.fusionScore !== void 0 && (!isPositiveFiniteNumber(ranked.fusionScore) || !isRetrievalSignal(ranked.retrieval)))
      return true;
    return false;
  });
  if (invalid !== -1) {
    return {
      success: false,
      message: `${label} has an invalid contextFiles entry at index ${invalid}; each entry needs a non-empty string "path", ${versioned ? "and version 1 requires" : "and optional"} rank, score, confidence, and reasons fields with their documented types.`
    };
  }
  const duplicatePath = contextFiles.findIndex((file, index) => contextFiles.findIndex((candidate2) => candidate2.path === file.path) !== index);
  if (duplicatePath !== -1) {
    return {
      success: false,
      message: `${label} has a duplicate contextFiles path at index ${duplicatePath}; each ranked path must appear once.`
    };
  }
  if (versioned) {
    const outOfOrderRank = contextFiles.findIndex((file, index) => file.rank !== index + 1);
    if (outOfOrderRank !== -1) {
      return {
        success: false,
        message: `${label} has an out-of-order contextFiles rank at index ${outOfOrderRank}; version 1 ranks must be sequential and match array order.`
      };
    }
  }
  const testRoutes = record.testRoutes;
  const invalidRoute = testRoutes.findIndex((route) => {
    if (!isRecord6(route))
      return true;
    return typeof route.command !== "string" || !route.command.trim() || !isRepositoryRelativePathArray(route.relatedFiles) || (versioned || route.kind !== void 0) && route.kind !== "test" && route.kind !== "validation" || (versioned || route.reason !== void 0) && typeof route.reason !== "string";
  });
  if (invalidRoute !== -1) {
    return {
      success: false,
      message: `${label} has an invalid testRoutes entry at index ${invalidRoute}; each route needs a string "command" and an array of non-empty string paths named relatedFiles; optional kind and reason fields must use their documented types.`
    };
  }
  const risks = record.risks;
  const invalidRisk = risks.findIndex((risk) => {
    if (!isRecord6(risk))
      return true;
    return typeof risk.area !== "string" || !risk.area.trim() || (versioned || risk.reason !== void 0) && typeof risk.reason !== "string" || (versioned || risk.severity !== void 0) && risk.severity !== "low" && risk.severity !== "medium" && risk.severity !== "high";
  });
  if (invalidRisk !== -1) {
    return {
      success: false,
      message: `${label} has an invalid risks entry at index ${invalidRisk}; each risk needs a non-empty string "area", and optional reason and severity fields must use their documented types.`
    };
  }
  if (record.impact !== void 0) {
    const impact = record.impact;
    const history = isRecord6(impact) ? impact.history : void 0;
    if (!isRecord6(impact) || !isRepositoryRelativePathArray(impact.seeds) || !Array.isArray(impact.files) || !isRepositoryRelativePathArray(impact.inspectionOrder) || !isRecord6(history) || typeof history.available !== "boolean" || typeof history.eligibleCommits !== "number" || !Number.isSafeInteger(history.eligibleCommits) || history.eligibleCommits < 0 || typeof history.shallow !== "boolean" || typeof history.truncated !== "boolean") {
      return { success: false, message: `${label} has an invalid impact graph envelope.` };
    }
    const invalidImpact = impact.files.findIndex((file) => {
      if (!isRecord6(file) || !isRepositoryRelativePath(file.path) || typeof file.score !== "number" || !Number.isFinite(file.score) || file.score < 0 || file.confidence !== "high" && file.confidence !== "medium" && file.confidence !== "low" || !Array.isArray(file.evidence))
        return true;
      return file.evidence.some((evidence) => !isRecord6(evidence) || !["imports", "imported-by", "co-change", "test-route"].includes(String(evidence.kind)) || !isRepositoryRelativePath(evidence.seed) || typeof evidence.reason !== "string" || !evidence.reason.trim() || evidence.occurrences !== void 0 && (!Number.isSafeInteger(evidence.occurrences) || evidence.occurrences < 0) || evidence.seedChanges !== void 0 && (!Number.isSafeInteger(evidence.seedChanges) || evidence.seedChanges < 0));
    });
    if (invalidImpact !== -1) {
      return { success: false, message: `${label} has an invalid impact.files entry at index ${invalidImpact}.` };
    }
  }
  if (!isRepositoryRelativePathArray(record.changedFiles)) {
    return { success: false, message: `${label} has invalid changedFiles; every entry must be a safe repository-relative path.` };
  }
  if (record.annotations !== void 0) {
    const annotations = record.annotations;
    if (!isRecord6(annotations) || typeof annotations.asOf !== "string" || !Number.isFinite(Date.parse(annotations.asOf)) || !isRepositoryRelativePath(annotations.sourcePath) || typeof annotations.sourceFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(annotations.sourceFingerprint) || !Array.isArray(annotations.entries)) {
      return { success: false, message: `${label} has an invalid annotations envelope.` };
    }
    const invalidAnnotation = annotations.entries.findIndex((assessment) => {
      if (!isRecord6(assessment) || !isRecord6(assessment.annotation) || typeof assessment.message !== "string" || !["active", "expired", "missing-target", "renamed-target"].includes(String(assessment.status)) || assessment.suggestedPath !== void 0 && !isRepositoryRelativePath(assessment.suggestedPath))
        return true;
      try {
        validateAnnotationStore({ annotationStoreVersion: 1, annotations: [assessment.annotation] });
        return false;
      } catch {
        return true;
      }
    });
    if (invalidAnnotation !== -1) {
      return { success: false, message: `${label} has an invalid annotations entry at index ${invalidAnnotation}.` };
    }
  }
  if (record.decisions !== void 0) {
    if (!Array.isArray(record.decisions))
      return { success: false, message: `${label} has invalid decisions; expected an array.` };
    const invalidDecision = record.decisions.findIndex((decision) => {
      if (!isRecord6(decision) || typeof decision.id !== "string" || !/^decision:[a-f0-9]{16}$/.test(decision.id) || !isRepositoryRelativePath(decision.path) || typeof decision.title !== "string" || !decision.title.trim() || !["proposed", "accepted", "rejected", "deprecated", "superseded", "unknown"].includes(String(decision.status)) || typeof decision.decision !== "string" || !decision.decision.trim() || typeof decision.sourceFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(decision.sourceFingerprint) || !Array.isArray(decision.targets) || !Array.isArray(decision.supersedes) || !decision.supersedes.every((value) => typeof value === "string" && value.trim()) || decision.date !== void 0 && (typeof decision.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(decision.date)) || decision.context !== void 0 && typeof decision.context !== "string" || decision.consequences !== void 0 && typeof decision.consequences !== "string")
        return true;
      return decision.targets.some((target) => {
        if (!isRecord6(target) || !["explicit", "literal-mention"].includes(String(target.evidence)))
          return true;
        if (target.kind === "file")
          return !isRepositoryRelativePath(target.path);
        if (target.kind === "symbol")
          return typeof target.name !== "string" || !target.name.trim() || target.path !== void 0 && !isRepositoryRelativePath(target.path);
        return target.kind !== "service" && target.kind !== "contract" || typeof target.name !== "string" || !target.name.trim();
      });
    });
    if (invalidDecision !== -1)
      return { success: false, message: `${label} has an invalid decisions entry at index ${invalidDecision}.` };
  }
  if (record.policy !== void 0) {
    const policy = record.policy;
    if (!isRecord6(policy) || typeof policy.policyFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(policy.policyFingerprint) || !Array.isArray(policy.findings)) {
      return { success: false, message: `${label} has an invalid architecture policy envelope.` };
    }
    const invalidPolicyFinding = policy.findings.findIndex((finding) => {
      if (!isRecord6(finding) || !["boundary-violation", "required-test-missing", "review-required", "breaking-contract"].includes(String(finding.code)) || !["info", "warning", "error"].includes(String(finding.severity)) || typeof finding.ruleId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(finding.ruleId) || typeof finding.message !== "string" || !finding.message.trim() || !isRepositoryRelativePathArray(finding.paths) || !Array.isArray(finding.evidence))
        return true;
      return finding.evidence.some((evidence) => !isRecord6(evidence) || !["import", "changed-file", "test-pattern", "reviewer", "contract-change", "decision-record"].includes(String(evidence.kind)) || typeof evidence.detail !== "string" || !evidence.detail.trim() || evidence.path !== void 0 && !isRepositoryRelativePath(evidence.path) || evidence.relatedPath !== void 0 && !isRepositoryRelativePath(evidence.relatedPath));
    });
    if (invalidPolicyFinding !== -1) {
      return { success: false, message: `${label} has an invalid architecture policy finding at index ${invalidPolicyFinding}.` };
    }
  }
  const diagnostics = record.diagnostics;
  const invalidDiagnostic = diagnostics.findIndex((diagnostic) => {
    if (!isRecord6(diagnostic))
      return true;
    return typeof diagnostic.code !== "string" || !diagnostic.code.trim() || typeof diagnostic.message !== "string" || diagnostic.severity !== "info" && diagnostic.severity !== "warning" && diagnostic.severity !== "error" || diagnostic.paths !== void 0 && !isRepositoryRelativePathArray(diagnostic.paths);
  });
  if (invalidDiagnostic !== -1) {
    return {
      success: false,
      message: `${label} has an invalid diagnostics entry at index ${invalidDiagnostic}; each diagnostic needs string code and message fields, an info, warning, or error severity, and optional non-empty string paths.`
    };
  }
  if (record.analysis !== void 0) {
    const analysis = record.analysis;
    const grounding = isRecord6(analysis) ? analysis.grounding : void 0;
    const specificity = isRecord6(grounding) ? grounding.specificity : void 0;
    if (specificity !== "anchored" && specificity !== "descriptive" && specificity !== "vague") {
      return {
        success: false,
        message: `${label} has invalid analysis.grounding.specificity; expected anchored, descriptive, or vague.`
      };
    }
    if (!isRecord6(analysis) || !isRecord6(grounding) || !Array.isArray(grounding.identifiers) || !isStringArray(grounding.unresolvedIdentifiers) || !isStringArray(grounding.partiallyResolvedIdentifiers) || !isStringArray(grounding.unverifiedIdentifiers) || typeof grounding.scanComplete !== "boolean" || !isRecord6(analysis.ranking) || !isNullableFiniteNumber(analysis.ranking.topScore) || !isNullableFiniteNumber(analysis.ranking.runnerUpScore) || !isNullableFiniteNumber(analysis.ranking.topGap) || typeof analysis.ranking.clustered !== "boolean" || typeof analysis.nextAction !== "string") {
      return {
        success: false,
        message: `${label} has incomplete or invalid analysis grounding, ranking, or nextAction fields.`
      };
    }
    const invalidIdentifier = grounding.identifiers.findIndex((identifier) => !isRecord6(identifier) || typeof identifier.identifier !== "string" || !identifier.identifier.trim() || !isIdentifierStatus(identifier.status) || !isRepositoryRelativePathArray(identifier.matchedFiles));
    if (invalidIdentifier !== -1) {
      return {
        success: false,
        message: `${label} has an invalid analysis.grounding.identifiers entry at index ${invalidIdentifier}.`
      };
    }
    if (analysis.retrievalRanking !== void 0) {
      const retrievalRanking = analysis.retrievalRanking;
      if (!isRecord6(retrievalRanking) || !isNullableFiniteNumber(retrievalRanking.topFusionScore) || !isNullableFiniteNumber(retrievalRanking.runnerUpFusionScore) || !isNullableFiniteNumber(retrievalRanking.topGap)) {
        return { success: false, message: `${label} has invalid analysis.retrievalRanking fields.` };
      }
    }
  }
  if (record.retrieval !== void 0) {
    const retrieval = record.retrieval;
    const weights = isRecord6(retrieval) ? retrieval.weights : void 0;
    if (!isRecord6(retrieval) || retrieval.mode !== "structural-lexical" && retrieval.mode !== "structural-lexical-semantic" || !isRecord6(weights) || !isPositiveFiniteNumber(weights.structural) || !isPositiveFiniteNumber(weights.lexical) || !isPositiveFiniteNumber(weights.semantic) || !isPositiveFiniteNumber(weights.reciprocalRankConstant)) {
      return { success: false, message: `${label} has an invalid retrieval envelope.` };
    }
    if (retrieval.mode === "structural-lexical-semantic" && !isSemanticProvenance(retrieval.semantic)) {
      return { success: false, message: `${label} has invalid or missing semantic retrieval provenance.` };
    }
    if (retrieval.mode === "structural-lexical" && retrieval.semantic !== void 0) {
      return { success: false, message: `${label} carries semantic provenance while declaring structural-lexical retrieval.` };
    }
  }
  return { success: true, report: candidate };
}
function isRecord6(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
function isStringArray(candidate) {
  return Array.isArray(candidate) && candidate.every((entry) => typeof entry === "string");
}
function isRepositoryRelativePathArray(candidate) {
  return Array.isArray(candidate) && candidate.every(isRepositoryRelativePath);
}
function isRepositoryRelativePath(candidate) {
  if (typeof candidate !== "string" || !candidate.trim() || candidate.includes("\0") || /^[\\/]/.test(candidate) || /^[A-Za-z]:/.test(candidate)) {
    return false;
  }
  const segments = candidate.replace(/\\/g, "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isNullableFiniteNumber(candidate) {
  return candidate === null || typeof candidate === "number" && Number.isFinite(candidate);
}
function isIdentifierStatus(candidate) {
  return candidate === "exact-definition" || candidate === "exact-text" || candidate === "partial-definition" || candidate === "not-found" || candidate === "unverified";
}
function isRetrievalSignal(candidate) {
  if (!isRecord6(candidate))
    return false;
  const ranks = [candidate.structuralRank, candidate.lexicalRank, candidate.semanticRank];
  if (ranks.every((rank) => rank === void 0))
    return false;
  if (ranks.some((rank) => rank !== void 0 && (!Number.isSafeInteger(rank) || Number(rank) < 1)))
    return false;
  if (candidate.structuralScore !== void 0 && (typeof candidate.structuralScore !== "number" || !Number.isFinite(candidate.structuralScore)))
    return false;
  return candidate.semanticSimilarity === void 0 || typeof candidate.semanticSimilarity === "number" && Number.isFinite(candidate.semanticSimilarity) && candidate.semanticSimilarity >= -1 && candidate.semanticSimilarity <= 1;
}
function isSemanticProvenance(candidate) {
  if (!isRecord6(candidate))
    return false;
  return typeof candidate.id === "string" && candidate.id.trim().length > 0 && typeof candidate.version === "string" && candidate.version.trim().length > 0 && typeof candidate.model === "string" && candidate.model.trim().length > 0 && typeof candidate.artifactHash === "string" && /^[a-f0-9]{64}$/.test(candidate.artifactHash) && typeof candidate.runtime === "string" && candidate.runtime.trim().length > 0 && Number.isSafeInteger(candidate.dimensions) && Number(candidate.dimensions) > 0 && (candidate.normalization === "l2" || candidate.normalization === "none") && typeof candidate.local === "boolean" && typeof candidate.cacheKey === "string" && candidate.cacheKey.trim().length > 0 && Number.isSafeInteger(candidate.indexedFiles) && Number(candidate.indexedFiles) >= 0 && Number.isSafeInteger(candidate.truncatedFiles) && Number(candidate.truncatedFiles) >= 0;
}
function isPositiveFiniteNumber(candidate) {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0;
}

// packages/core/dist/architecture-history.js
import { execFile as execFile3, spawn as spawn2 } from "node:child_process";
import { promisify as promisify3 } from "node:util";
var exec3 = promisify3(execFile3);
var MAX_TREE_BYTES = 32 * 1024 * 1024;
var MAX_BATCH_BYTES = 64 * 1024 * 1024;
var MAX_BATCH_OUTPUT_BYTES = MAX_BATCH_BYTES + 2 * 1024 * 1024;

// packages/action/src/github.ts
var FIXMAP_REPORT_MARKER = "<!-- fixmap-report -->";
var MAX_COMMENT_BODY_CHARS = 65536;
var COMMENT_TRUNCATION_FOOTER = "\n\n> Report truncated to fit GitHub's comment size limit. Run FixMap locally with `--output` to retain a complete report.\n";
function fitCommentBody(body, limit = MAX_COMMENT_BODY_CHARS) {
  if (body.length <= limit) return body;
  const keep = Math.max(0, limit - COMMENT_TRUNCATION_FOOTER.length - "\n```".length);
  const cut = body.slice(0, keep);
  const lastBreak = cut.lastIndexOf("\n\n");
  const trimmed = lastBreak > keep / 2 ? cut.slice(0, lastBreak) : cut;
  const fenceCount = (trimmed.match(/^```/gm) ?? []).length;
  const closed = fenceCount % 2 === 0 ? trimmed : `${trimmed}
\`\`\``;
  return `${closed}${COMMENT_TRUNCATION_FOOTER}`;
}
function buildPullRequestIssueText(event) {
  const pullRequest = event?.pull_request;
  const parts = [pullRequest?.title, pullRequest?.body].filter((part) => Boolean(part?.trim())).map((part) => part.trim());
  return parts.join("\n\n");
}
function createGitHubClient(options = {}) {
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async upsertPullRequestComment(input) {
      const headers = {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      };
      const commentsUrl = `${apiBaseUrl}/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`;
      const existing = await findExistingComment(
        fetchImpl,
        commentsUrl,
        headers,
        input.commentAuthor?.trim()
      );
      const body = fitCommentBody(`${FIXMAP_REPORT_MARKER}
${input.markdown}`);
      if (existing) {
        await requestJson(fetchImpl, `${apiBaseUrl}/repos/${input.owner}/${input.repo}/issues/comments/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body })
        }, "update the existing FixMap comment");
        return "updated";
      }
      await requestJson(fetchImpl, commentsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ body })
      }, "create the FixMap comment");
      return "created";
    }
  };
}
async function findExistingComment(fetchImpl, commentsUrl, headers, commentAuthor) {
  const maxPages = 50;
  let latest;
  for (let page = 1; page <= maxPages; page += 1) {
    const comments = await requestJson(
      fetchImpl,
      `${commentsUrl}?per_page=100&page=${page}`,
      { headers },
      "list pull request comments"
    );
    const match = comments.filter(
      (comment) => comment.body?.includes(FIXMAP_REPORT_MARKER) && // GitHub logins are case-insensitive, so a config saying "github-actions[bot]" did
      // not match a comment authored by "GitHub-Actions[bot]" and the Action posted a
      // second comment beside the one it meant to update.
      (!commentAuthor || comment.user?.login?.toLowerCase() === commentAuthor.toLowerCase())
    ).sort((left, right) => right.id - left.id)[0];
    if (match && (!latest || match.id > latest.id)) latest = match;
    if (comments.length < 100) {
      return latest;
    }
  }
  if (latest) return latest;
  throw new Error(
    "FixMap stopped after searching 5,000 pull request comments without finding its marker; it refused to create a duplicate comment. Remove old comments or set comment-author to narrow the search."
  );
}
function isPermissionDeniedError(error) {
  return error instanceof GitHubRequestError && (error.status === 401 || error.status === 404 || error.status === 403 && !error.rateLimited && /resource not accessible|insufficient permission|forbidden|write access/i.test(error.detail));
}
var GitHubRequestError = class extends Error {
  constructor(message, status, detail, rateLimited) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.rateLimited = rateLimited;
    this.name = "GitHubRequestError";
  }
  status;
  detail;
  rateLimited;
};
async function requestJson(fetchImpl, url, init, action) {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    const suffix = detail ? `: ${detail}` : "";
    const rateLimited = response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0" || /secondary rate limit|rate limit exceeded/i.test(detail);
    throw new GitHubRequestError(
      `FixMap could not ${action}; GitHub returned ${response.status} ${response.statusText}${suffix}`,
      response.status,
      detail,
      rateLimited
    );
  }
  return response.json();
}

// packages/action/src/issue-source.ts
var MAX_API_RESPONSE_CHARS = 1e6;
var MAX_ISSUE_BODY_CHARS = 2e4;
function parseActionIssueSource(input) {
  let trimmed = input.trim();
  if (/^https?:\/\/[^/\s@]+@/i.test(trimmed)) {
    throw new Error(
      "The issue URL contains credentials. Remove the user:token@ prefix and pass the public https://github.com/owner/repository/issues/123 URL; the Action reads public issues anonymously."
    );
  }
  if (/^https?:\/\/(?:www\.|api\.)?github\.com\//i.test(trimmed)) {
    const canonical = new URL(trimmed);
    if (canonical.protocol !== "https:") {
      throw new Error("GitHub issue input must use https://github.com/owner/repository/issues/123.");
    }
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(canonical.pathname)) {
      throw new Error("GitHub issue URLs must not contain encoded separators or control characters.");
    }
    canonical.search = "";
    canonical.hash = "";
    if (canonical.hostname.toLowerCase() === "www.github.com") canonical.hostname = "github.com";
    if (canonical.hostname.toLowerCase() === "api.github.com") {
      const apiSegments = canonical.pathname.split("/").filter(Boolean);
      if (apiSegments.length === 5 && apiSegments[0]?.toLowerCase() === "repos" && apiSegments[3]?.toLowerCase() === "issues") {
        canonical.hostname = "github.com";
        canonical.pathname = `/${apiSegments[1]}/${apiSegments[2]}/issues/${apiSegments[4]}`;
      }
    }
    trimmed = canonical.toString();
  }
  if (/^https?:\/\/[^/\s]*@github\.com\//i.test(trimmed)) {
    throw new Error(
      "The issue URL contains credentials. Remove the user:token@ prefix and pass the public https://github.com/owner/repository/issues/123 URL; the Action reads public issues anonymously."
    );
  }
  if (!/^https?:\/\/github\.com\//i.test(trimmed)) {
    return void 0;
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("GitHub issue input must use https://github.com/owner/repository/issues/123.");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const number = Number(segments[3]);
  const kind = segments[2]?.toLowerCase();
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.search || url.hash || segments.length !== 4 || kind !== "issues" && kind !== "pull" || !segments[0] || !segments[1] || !/^[1-9]\d*$/.test(segments[3] ?? "") || !Number.isSafeInteger(number)) {
    throw new Error(
      "Only canonical public GitHub issue and pull request URLs are supported. Discussion, compare, tree, and file URLs are not fetched."
    );
  }
  const isPullRequest = kind === "pull";
  return {
    owner: segments[0],
    repository: segments[1],
    number,
    isPullRequest,
    displayUrl: `https://github.com/${segments[0]}/${segments[1]}/${isPullRequest ? "pull" : "issues"}/${number}`
  };
}
async function fetchActionIssue(source) {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/issues/${source.number}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "fixmap-action",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      redirect: "error",
      signal: AbortSignal.timeout(15e3)
    }
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Could not fetch public GitHub issue ${source.displayUrl}: it was not found or is not publicly accessible.`
      );
    }
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      const resetAt = Number(response.headers.get("x-ratelimit-reset"));
      const resets = Number.isSafeInteger(resetAt) && resetAt > 0 ? ` The limit resets at ${new Date(resetAt * 1e3).toISOString()}.` : "";
      throw new Error(
        `Could not fetch public GitHub issue ${source.displayUrl}: GitHub's anonymous API rate limit is exhausted for this runner.${resets} Pass the issue text directly, or retry later.`
      );
    }
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: GitHub returned HTTP ${response.status}.`);
  }
  const rawPayload = await response.text();
  if (rawPayload.length > MAX_API_RESPONSE_CHARS) {
    throw new Error(
      `Could not fetch public GitHub issue ${source.displayUrl}: the API response exceeded the safe size limit.`
    );
  }
  let payload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: GitHub returned an invalid response.`);
  }
  if (payload.pull_request && !source.isPullRequest) {
    throw new Error(
      `${source.displayUrl} resolves to a pull request, not an issue. Use https://github.com/${source.owner}/${source.repository}/pull/${source.number} instead.`
    );
  }
  if (typeof payload.title !== "string" || !payload.title.trim()) {
    throw new Error(`Could not fetch public GitHub issue ${source.displayUrl}: the response was not an issue.`);
  }
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  return {
    title: payload.title.trim(),
    body: body.slice(0, MAX_ISSUE_BODY_CHARS),
    truncated: body.length > MAX_ISSUE_BODY_CHARS
  };
}

// packages/action/src/runner.ts
var STEP_SUMMARY_LIMIT_BYTES = 1024 * 1024;
var TRUNCATION_FOOTER = "\n\n> FixMap report truncated to fit GitHub's 1 MiB step-summary limit. Run FixMap locally with `--output` to retain a complete report.\n";
var ACTION_OUTPUT_REPORT_LIMIT_BYTES = 900 * 1024;
var OUTPUT_TRUNCATION_FOOTER = "\n\n[FixMap report truncated to fit the GitHub Actions output limit. Run FixMap locally with --output for a complete report.]\n";
async function runAction(env = process.env, dependencies = {}) {
  const appendFile = dependencies.appendFile ?? ((path, contents) => appendFileSync(path, contents));
  const readFile3 = dependencies.readFile ?? ((path) => readFileSync(path, "utf8"));
  const stdout = dependencies.stdout ?? ((text) => process.stdout.write(text));
  const event = readEvent(env.GITHUB_EVENT_PATH, readFile3);
  const rawIssue = readInput("issue", env) || buildPullRequestIssueText(event);
  const diffSpec = readInput("diff", env);
  const workingTree = parseBooleanInput("working-tree", readInput("working-tree", env));
  const includeUntracked = parseBooleanInput("include-untracked", readInput("include-untracked", env));
  const noCache = parseBooleanInput("no-cache", readInput("no-cache", env));
  const baseRef = readInput("base", env) || (!workingTree && env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : void 0);
  const headRef = readInput("head", env) || (!workingTree && env.GITHUB_HEAD_REF ? "HEAD" : void 0);
  const format = parseFormat(readInput("format", env));
  const mode = parseMode(readInput("mode", env));
  const failOn = parseFailOn(readInput("fail-on", env));
  const exclude = splitExcludeInput(readInput("exclude", env) ?? "");
  const limit = parseLimit(readInput("limit", env));
  if (includeUntracked && !workingTree) throw new Error("include-untracked requires working-tree.");
  if (workingTree && (diffSpec || baseRef || headRef)) throw new Error("Use either working-tree or diff/base/head, not both.");
  if (diffSpec && (baseRef || headRef)) throw new Error("Use either diff or base/head, not both.");
  if (mode === "verify") {
    const planOnly = [
      readInput("limit", env) ? "limit" : "",
      readInput("exclude", env) ? "exclude" : "",
      readInput("issue", env) ? "issue" : ""
    ].filter(Boolean);
    if (planOnly.length > 0) {
      throw new Error(
        `FixMap verify mode does not use plan-only input${planOnly.length === 1 ? "" : "s"}: ${planOnly.join(", ")}. Remove them, or set mode: plan.`
      );
    }
    return runVerifyMode({ env, dependencies, readFile: readFile3, appendFile, stdout, format, failOn, diffSpec, baseRef, headRef, workingTree, includeUntracked, noCache });
  }
  if (failOn === "warning") throw new Error("fail-on: warning is a verify-mode input; remove it or set mode: verify.");
  const issueSource = rawIssue ? parseActionIssueSource(rawIssue) : void 0;
  if (issueSource && env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY.toLowerCase() !== `${issueSource.owner}/${issueSource.repository}`.toLowerCase()) {
    throw new Error(
      `Issue ${issueSource.displayUrl} belongs to ${issueSource.owner}/${issueSource.repository}, but this Action is scanning ${env.GITHUB_REPOSITORY}.`
    );
  }
  const fetchedIssue = issueSource ? await (dependencies.fetchIssue ?? fetchActionIssue)(issueSource) : void 0;
  const issue = fetchedIssue ? [fetchedIssue.title, fetchedIssue.body].filter(Boolean).join("\n\n") : rawIssue;
  if (!issue && !diffSpec && !baseRef && !workingTree) {
    throw new Error("FixMap needs a pull_request event, an issue input, or a diff/base input to build a useful report.");
  }
  const report = await (dependencies.buildReport ?? buildFixMapReport)({
    repoRoot: (dependencies.cwd ?? process.cwd)(),
    issueText: issue,
    diffSpec,
    baseRef,
    headRef,
    workingTree,
    includeUntracked,
    useCache: !noCache,
    limit,
    exclude
  });
  if (issueSource) {
    report.diagnostics.unshift({
      code: issueSource.isPullRequest ? "remote-pull-fetched" : "remote-issue-fetched",
      severity: "info",
      message: `Fetched ${issueSource.displayUrl} anonymously and used its title${fetchedIssue?.body ? " and body" : ""} as task context` + (fetchedIssue?.truncated ? "; the body was truncated to 20,000 characters, so later text did not inform the ranking." : ".")
    });
  }
  const markdown = renderMarkdownReport(report);
  const output = format === "json" ? renderJsonReport(report) : markdown;
  stdout(output);
  if (env.GITHUB_STEP_SUMMARY) {
    appendBoundedStepSummary(env.GITHUB_STEP_SUMMARY, format === "json" ? withJsonDetails(markdown, output) : markdown, dependencies, appendFile, stdout);
  }
  if (env.GITHUB_OUTPUT) {
    appendFile(env.GITHUB_OUTPUT, renderActionOutputs(output, report, dependencies.uuid ?? randomUUID2));
  }
  const token = readInput("github-token", env) || env.GITHUB_TOKEN;
  const commentAuthor = readInput("comment-author", env);
  if (token) {
    try {
      const comment = format === "json" ? `\`\`\`json
${output.trimEnd()}
\`\`\`
` : markdown;
      await upsertPullRequestComment(token, event, comment, commentAuthor, env, dependencies.createClient);
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      stdout(
        `::warning::FixMap could not comment on the pull request, which is expected when the token is read-only (for example on forked pull requests). The bounded report remains in the step summary and report output; run FixMap locally with --output if either surface reports truncation. ${detail}
`
      );
    }
  }
}
function parseMode(value) {
  if (!value) {
    return "plan";
  }
  const normalized = value.toLowerCase();
  if (normalized === "plan" || normalized === "verify") {
    return normalized;
  }
  throw new Error(`Invalid mode input ${JSON.stringify(value)}; expected plan or verify.`);
}
async function runVerifyMode(context) {
  const reportPath = readInput("report-path", context.env);
  if (!reportPath) {
    throw new Error(
      "FixMap verify mode needs report-path pointing at the JSON plan this change was made from. Save one with a prior plan step using format: json, then download it as an artifact."
    );
  }
  if (!context.diffSpec && !context.baseRef && !context.workingTree) {
    throw new Error("FixMap verify mode needs diff, base/head, or working-tree so it can see what changed.");
  }
  let report;
  try {
    report = JSON.parse(stripByteOrderMark(context.readFile(reportPath)));
  } catch (error) {
    throw new Error(
      `FixMap could not read the plan at "${reportPath}": ${error instanceof Error ? error.message : String(error)}.`
    );
  }
  const loaded = validateFixMapReport(report, `"${reportPath}"`);
  if (!loaded.success) throw new Error(loaded.message);
  report = loaded.report;
  const repoRoot = (context.dependencies.cwd ?? process.cwd)();
  const repo = await (context.dependencies.scanRepo ?? scanRepo)({
    repoRoot,
    diffSpec: context.diffSpec,
    baseRef: context.baseRef,
    headRef: context.headRef,
    workingTree: context.workingTree,
    includeUntracked: context.includeUntracked,
    useCache: !context.noCache,
    includeHistory: true,
    internalExclude: [resolve3(repoRoot, reportPath)]
  });
  const diffFailure = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
  if (diffFailure) {
    throw new Error(`${diffFailure.message} Verification needs a resolvable diff.`);
  }
  const result = verifyPlan(report, repo);
  const markdown = renderVerifyMarkdown(result);
  const output = context.format === "json" ? `${JSON.stringify(result, null, 2)}
` : markdown;
  context.stdout(output);
  if (context.env.GITHUB_STEP_SUMMARY) {
    appendBoundedStepSummary(context.env.GITHUB_STEP_SUMMARY, markdown, context.dependencies, context.appendFile, context.stdout);
  }
  if (context.env.GITHUB_OUTPUT) {
    context.appendFile(
      context.env.GITHUB_OUTPUT,
      renderVerifyOutputs(output, result, context.dependencies.uuid ?? randomUUID2)
    );
  }
  if (result.findings.some(
    (finding) => finding.severity === "error" || context.failOn === "warning" && finding.severity === "warning"
  )) {
    throw new Error(
      context.failOn === "warning" ? "FixMap verification found findings at or above the configured warning threshold." : "FixMap verification found an edit in a generated or retired location, which the next build discards."
    );
  }
}
function renderVerifyOutputs(reportText, result, uuid = randomUUID2) {
  const delimiter = `fixmap_${uuid().replaceAll("-", "")}`;
  const fittedReport = fitOutputReport(reportText);
  const terminated = fittedReport.endsWith("\n") ? fittedReport : `${fittedReport}
`;
  return [
    `report<<${delimiter}
`,
    terminated,
    `${delimiter}
`,
    `finding-count=${result.findings.length}
`,
    `changed-file-count=${result.changedFiles.length}
`
  ].join("");
}
function parseFormat(value) {
  if (!value) {
    return "markdown";
  }
  const normalized = value.toLowerCase();
  if (normalized === "markdown" || normalized === "json") {
    return normalized;
  }
  throw new Error(`Invalid format input ${JSON.stringify(value)}; expected markdown or json.`);
}
function parseLimit(value) {
  if (!value) return void 0;
  const normalized = value.trim();
  const parsed = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) throw new Error("limit must be a whole number from 1 to 20.");
  return parsed;
}
function parseFailOn(value) {
  const normalized = value?.trim().toLowerCase() ?? "error";
  if (normalized === "error" || normalized === "warning") return normalized;
  throw new Error("fail-on must be error or warning.");
}
function parseBooleanInput(name, value) {
  if (!value) return false;
  if (/^(?:true|1|yes)$/i.test(value)) return true;
  if (/^(?:false|0|no)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false.`);
}
function renderActionOutputs(reportText, report, uuid = randomUUID2) {
  const delimiter = `fixmap_${uuid().replaceAll("-", "")}`;
  const fittedReport = fitOutputReport(reportText);
  const terminatedReport = fittedReport.endsWith("\n") ? fittedReport : `${fittedReport}
`;
  return [
    `report<<${delimiter}
`,
    terminatedReport,
    `${delimiter}
`,
    `context-count=${report.contextFiles.length}
`,
    `test-route-count=${report.testRoutes.length}
`
  ].join("");
}
function fitOutputReport(reportText) {
  const bytes = Buffer.from(reportText);
  if (bytes.length <= ACTION_OUTPUT_REPORT_LIMIT_BYTES) return reportText;
  const footer = Buffer.from(OUTPUT_TRUNCATION_FOOTER);
  let end = ACTION_OUTPUT_REPORT_LIMIT_BYTES - footer.length;
  while (end > 0 && (bytes[end] & 192) === 128) end -= 1;
  return `${bytes.subarray(0, end).toString("utf8")}${OUTPUT_TRUNCATION_FOOTER}`;
}
function withJsonDetails(markdown, json) {
  return `${markdown}

<details>
<summary>JSON report</summary>

\`\`\`json
${json.trimEnd()}
\`\`\`

</details>
`;
}
function trimToBoundary(text) {
  const lastBreak = text.lastIndexOf("\n\n");
  const trimmed = lastBreak > text.length / 2 ? text.slice(0, lastBreak) : text;
  const fences = (trimmed.match(/^```/gm) ?? []).length;
  return fences % 2 === 0 ? trimmed : `${trimmed}
\`\`\``;
}
function splitExcludeInput(raw) {
  const patterns2 = [];
  let current = "";
  let depth3 = 0;
  for (const character of raw) {
    if (character === "{") depth3 += 1;
    else if (character === "}") depth3 = Math.max(0, depth3 - 1);
    if (character === "\n" || character === "\r" || character === "," && depth3 === 0) {
      patterns2.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  patterns2.push(current);
  return patterns2.map((pattern) => pattern.trim()).filter(Boolean);
}
function fitStepSummary(markdown, limitBytes = STEP_SUMMARY_LIMIT_BYTES) {
  const bytes = Buffer.from(markdown);
  if (bytes.length <= limitBytes) {
    return markdown;
  }
  const footer = Buffer.from(TRUNCATION_FOOTER);
  if (footer.length >= limitBytes) {
    throw new Error("GitHub step-summary limit is too small for the FixMap truncation notice.");
  }
  let end = limitBytes - footer.length - Buffer.byteLength("\n```");
  while (end > 0 && (bytes[end] & 192) === 128) {
    end -= 1;
  }
  return `${trimToBoundary(bytes.subarray(0, end).toString("utf8"))}${TRUNCATION_FOOTER}`;
}
function appendBoundedStepSummary(path, markdown, dependencies, appendFile, stdout) {
  const fileSize = dependencies.fileSize ?? ((summaryPath) => {
    try {
      return statSync(summaryPath).size;
    } catch {
      return 0;
    }
  });
  const remaining = Math.max(0, STEP_SUMMARY_LIMIT_BYTES - fileSize(path));
  if (remaining <= Buffer.byteLength(TRUNCATION_FOOTER)) {
    stdout("::warning::FixMap skipped its step summary because earlier steps already consumed GitHub's 1 MiB summary budget. The bounded report remains available through the report output.\n");
    return;
  }
  appendFile(path, fitStepSummary(markdown, remaining));
}
function readInput(name, env) {
  const githubName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const shellSafeName = `INPUT_${name.replace(/[- ]/g, "_").toUpperCase()}`;
  const value = env[githubName] || env[shellSafeName];
  return value?.trim() || void 0;
}
function readEvent(eventPath, readFile3) {
  if (!eventPath) {
    return void 0;
  }
  try {
    return JSON.parse(readFile3(eventPath));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FixMap could not read the GitHub event payload: ${detail}`);
  }
}
async function upsertPullRequestComment(token, event, markdown, commentAuthor, env, createClient = createGitHubClient) {
  if (!event?.pull_request?.number || !env.GITHUB_REPOSITORY) {
    return;
  }
  const [owner, repoName] = env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repoName) {
    throw new Error("FixMap requires GITHUB_REPOSITORY in owner/repository form to comment on a pull request.");
  }
  await createClient().upsertPullRequestComment({
    token,
    owner,
    repo: repoName,
    issueNumber: event.pull_request.number,
    markdown,
    commentAuthor
  });
}

// packages/action/src/index.ts
await runAction();
