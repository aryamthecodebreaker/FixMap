import { createRequire as __fixmapCreateRequire } from 'module'; const require = __fixmapCreateRequire(import.meta.url);

// packages/action/src/runner.ts
import { randomUUID as randomUUID4 } from "node:crypto";

// packages/action/src/workspace-section.ts
import { isAbsolute as isAbsolute4, relative as relative4, resolve as resolve8 } from "node:path";

// packages/core/dist/plan.js
import { readFile as readFile4 } from "node:fs/promises";
import { join as join3, resolve as resolve5 } from "node:path";

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
  const longestRun = longestBacktickRun(value);
  const fence = "`".repeat(longestRun + 1);
  const needsPadding = value.startsWith("`") || value.endsWith("`") || value.startsWith(" ") || value.endsWith(" ");
  return `${fence}${needsPadding ? " " : ""}${value}${needsPadding ? " " : ""}${fence}`;
}
function longestBacktickRun(value) {
  let longest = 0;
  for (const match of value.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  return longest;
}
function inlineProse(value) {
  return value.replace(/\s+/g, " ").trim();
}

// packages/core/dist/language-adapters.js
var IDENTIFIER = "[A-Za-z_$][A-Za-z0-9_$]*";
var JAVA_CONTROL_WORDS = /* @__PURE__ */ new Set(["catch", "do", "else", "for", "if", "new", "return", "switch", "synchronized", "throw", "while"]);
var CSHARP_CONTROL_WORDS = /* @__PURE__ */ new Set(["catch", "do", "else", "for", "foreach", "if", "lock", "return", "switch", "throw", "using", "while"]);
var javascriptAdapter = {
  id: "javascript-typescript",
  extensions: [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"],
  extractImports(text2) {
    const patterns2 = [
      /\bimport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
      /\bimport\s*["']([^"'\n]+)["']/g,
      /\bexport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
      /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
      /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
    ];
    return uniqueImports(patterns2.flatMap((pattern) => [...text2.matchAll(pattern)].flatMap((match) => match[1] ? [{ adapter: "javascript-typescript", specifier: match[1], importedNames: [], wildcard: false }] : [])));
  },
  extractDefinitions(text2) {
    const definitions = [];
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:(?:const|let|var)\\s+)|(class|interface|type|enum)\\s+)(${IDENTIFIER})(?![\\p{L}\\p{N}_$])`, "gu");
    for (const match of text2.matchAll(pattern)) {
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
function maskPythonNonCode(text2) {
  const output = text2.split("");
  const hide = (index2) => {
    if (text2[index2] !== "\r" && text2[index2] !== "\n")
      output[index2] = " ";
  };
  let index = 0;
  while (index < text2.length) {
    if (text2[index] === "#") {
      while (index < text2.length && text2[index] !== "\r" && text2[index] !== "\n")
        hide(index++);
      continue;
    }
    const quote = text2[index];
    if (quote !== "'" && quote !== '"') {
      index++;
      continue;
    }
    const delimiter = text2.startsWith(quote.repeat(3), index) ? quote.repeat(3) : quote;
    for (let count3 = 0; count3 < delimiter.length; count3++)
      hide(index++);
    while (index < text2.length) {
      if (text2[index] === "\\") {
        hide(index++);
        if (index < text2.length) {
          const crlf = text2[index] === "\r" && text2[index + 1] === "\n";
          hide(index++);
          if (crlf)
            hide(index++);
        }
      } else if (text2.startsWith(delimiter, index)) {
        for (let count3 = 0; count3 < delimiter.length; count3++)
          hide(index++);
        break;
      } else {
        hide(index++);
      }
    }
  }
  return output.join("");
}
var pythonAdapter = {
  id: "python",
  extensions: [".py", ".pyi"],
  extractImports(text2) {
    const imports = [];
    const importText = maskPythonNonCode(text2);
    for (const match of importText.matchAll(/^[\t ]*from[\t ]+([.A-Za-z_][.A-Za-z0-9_]*)[\t ]+import[\t ]+(\([^)]*\)|[^\r\n]+)/gm)) {
      const specifier = match[1];
      if (!specifier)
        continue;
      const importedNames = splitImportedNames(match[2] ?? "");
      imports.push({ adapter: "python", specifier, importedNames, wildcard: importedNames.includes("*") });
    }
    for (const match of importText.matchAll(/^[\t ]*import[\t ]+([^\r\n]+)/gm)) {
      for (const entry2 of (match[1] ?? "").split(",")) {
        const specifier = entry2.trim().split(/\s+as\s+/i)[0]?.trim();
        if (specifier && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(specifier)) {
          imports.push({ adapter: "python", specifier, importedNames: [], wildcard: false });
        }
      }
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text2) {
    const definitions = [];
    const code = maskPythonNonCode(text2);
    for (const match of code.matchAll(/^[\t ]*(?:async[\t ]+)?def[\t ]+([A-Za-z_][A-Za-z0-9_]*)[\t ]*\(/gm)) {
      if (match[1])
        definitions.push({ adapter: "python", name: match[1], kind: "function", offset: match.index });
    }
    for (const match of code.matchAll(/^[\t ]*class[\t ]+([A-Za-z_][A-Za-z0-9_]*)\b/gm)) {
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
  extractImports(text2) {
    const imports = [];
    for (const match of text2.matchAll(/^\s*import\s+(static\s+)?([A-Za-z_][A-Za-z0-9_.]*?)(\.\*)?\s*;/gm)) {
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
  extractDefinitions(text2) {
    const definitions = [];
    for (const match of text2.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
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
    for (const match of text2.matchAll(methodPattern)) {
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
  extractImports(text2) {
    const imports = [];
    for (const match of text2.matchAll(/^\s*import\s+(?:[A-Za-z_.][A-Za-z0-9_.]*\s+)?["`]([^"`\n]+)["`]/gm)) {
      if (match[1])
        imports.push({ adapter: "go", specifier: match[1], importedNames: [], wildcard: false });
    }
    for (const block of text2.matchAll(/^\s*import\s*\(([\s\S]*?)^\s*\)/gm)) {
      for (const match of (block[1] ?? "").matchAll(/^\s*(?:[A-Za-z_.][A-Za-z0-9_.]*\s+)?["`]([^"`\n]+)["`]/gm)) {
        if (match[1])
          imports.push({ adapter: "go", specifier: match[1], importedNames: [], wildcard: false });
      }
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text2) {
    return definitionsFromPatterns("go", text2, [
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
  extractImports(text2) {
    const imports = [];
    const pathModules = /* @__PURE__ */ new Set();
    for (const match of text2.matchAll(/^\s*#\s*\[\s*path\s*=\s*["']([^"'\n]+)["']\s*\]\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm)) {
      if (match[1] && match[2]) {
        pathModules.add(match[2]);
        imports.push({ adapter: "rust", specifier: `file:${match[1]}`, importedNames: [], wildcard: false });
      }
    }
    for (const match of text2.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;\n]+)\s*;/gm)) {
      const specifier = (match[1] ?? "").replace(/\s+/g, "").replace(/::\{.*$/, "");
      if (specifier)
        imports.push({ adapter: "rust", specifier, importedNames: [], wildcard: specifier.endsWith("::*") });
    }
    for (const match of text2.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm)) {
      if (match[1] && !pathModules.has(match[1]))
        imports.push({ adapter: "rust", specifier: `self::${match[1]}`, importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text2) {
    const visibility = "(?:pub(?:\\([^)]*\\))?\\s+)?";
    return definitionsFromPatterns("rust", text2, [
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
  extractImports(text2) {
    const imports = [];
    for (const match of text2.matchAll(/^\s*(require_relative|require|load)\s*\(?\s*["']([^"'\n]+)["']/gm)) {
      if (match[2])
        imports.push({ adapter: "ruby", specifier: `${match[1] === "require_relative" ? "relative:" : "absolute:"}${match[2]}`, importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text2) {
    return definitionsFromPatterns("ruby", text2, [
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
  extractImports(text2) {
    const imports = [];
    for (const match of text2.matchAll(/^\s*use\s+(?:function\s+|const\s+)?([^;\n]+)\s*;/gm)) {
      for (const entry2 of (match[1] ?? "").split(",")) {
        const specifier = entry2.trim().replace(/^\\+/, "").split(/\s+as\s+/i)[0]?.trim();
        if (specifier)
          imports.push({ adapter: "php", specifier, importedNames: [], wildcard: false });
      }
    }
    for (const match of text2.matchAll(/\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?["']([^"'\n]+)["']/g)) {
      if (match[1])
        imports.push({ adapter: "php", specifier: `file:${match[1]}`, importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text2) {
    return definitionsFromPatterns("php", text2, [
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
  extractImports(text2) {
    const imports = [];
    for (const match of text2.matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm)) {
      if (match[1])
        imports.push({ adapter: "dotnet", specifier: match[1], importedNames: [], wildcard: false });
    }
    return uniqueImports(imports);
  },
  extractDefinitions(text2) {
    const definitions = definitionsFromPatterns("dotnet", text2, [
      { pattern: /\b(?:class|record(?:\s+class)?|struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, kind: "class" },
      { pattern: /\binterface\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, kind: "interface" },
      { pattern: /\bdelegate\s+[^;({]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, kind: "type" }
    ]);
    const methodPattern = /(?:^|[;{}]\s*)(?:(?:public|protected|private|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial)\s+)*(?:[A-Za-z_][A-Za-z0-9_<>,.?\[\]]*\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:where\s+[^={]+)?(?:=>|\{)/gm;
    for (const match of text2.matchAll(methodPattern)) {
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
].map((adapter) => Object.freeze({
  ...adapter,
  extensions: Object.freeze([...adapter.extensions])
})));
var ADAPTER_BY_EXTENSION = new Map(BUILT_IN_LANGUAGE_ADAPTERS.flatMap((adapter) => adapter.extensions.map((extension) => [extension, adapter])));
var IMPORT_CACHE = /* @__PURE__ */ new WeakMap();
var DEFINITION_CACHE = /* @__PURE__ */ new WeakMap();
function languageAdapterForFile(file) {
  return ADAPTER_BY_EXTENSION.get(file.extension.toLowerCase());
}
function extractLanguageImports(file) {
  const cached = IMPORT_CACHE.get(file);
  const text2 = file.searchTextSample ?? file.textSample;
  const extension = file.extension.toLowerCase();
  const imports = cached?.text === text2 && cached.extension === extension ? cached.facts : languageAdapterForFile(file)?.extractImports(text2) ?? [];
  if (imports !== cached?.facts)
    IMPORT_CACHE.set(file, { extension, text: text2, facts: imports });
  return imports.map((entry2) => ({ ...entry2, importedNames: [...entry2.importedNames] }));
}
function extractLanguageDefinitions(file) {
  const cached = DEFINITION_CACHE.get(file);
  const text2 = file.searchTextSample ?? file.textSample;
  const extension = file.extension.toLowerCase();
  const definitions = cached?.text === text2 && cached.extension === extension ? cached.facts : languageAdapterForFile(file)?.extractDefinitions(text2) ?? [];
  if (definitions !== cached?.facts)
    DEFINITION_CACHE.set(file, { extension, text: text2, facts: definitions });
  return definitions.map((entry2) => ({ ...entry2 }));
}
function isLanguageTestPath(path, extension) {
  return ADAPTER_BY_EXTENSION.get(extension.toLowerCase())?.isTestPath(path.replace(/\\/g, "/")) ?? false;
}
function splitImportedNames(raw) {
  return raw.replace(/[()]/g, "").split(",").flatMap((entry2) => {
    const name = entry2.trim().split(/\s+as\s+/i)[0]?.trim();
    return name && (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name === "*") ? [name] : [];
  });
}
function uniqueImports(imports) {
  const seen = /* @__PURE__ */ new Set();
  return imports.filter((entry2) => {
    const key2 = `${entry2.adapter}\0${entry2.specifier}\0${entry2.importedNames.join(",")}\0${String(entry2.wildcard)}`;
    if (seen.has(key2))
      return false;
    seen.add(key2);
    return true;
  });
}
function uniqueDefinitions(definitions) {
  const seen = /* @__PURE__ */ new Set();
  return definitions.filter((entry2) => {
    const key2 = `${entry2.name}\0${entry2.kind}`;
    if (seen.has(key2))
      return false;
    seen.add(key2);
    return true;
  });
}
function definitionsFromPatterns(adapter, text2, patterns2) {
  const definitions = [];
  for (const { pattern, kind } of patterns2) {
    for (const match of text2.matchAll(pattern)) {
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
function isRepositoryRelativePath(candidate) {
  if (typeof candidate !== "string" || !candidate.trim() || candidate.includes("\0") || /^[\\/]/.test(candidate) || /^[A-Za-z]:/.test(candidate)) {
    return false;
  }
  const segments = candidate.replace(/\\/g, "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
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
function prepareChecklistText(text2) {
  const unchecked = /^\s*[-*]\s*\[\s\]\s+/;
  const lines = text2.split(/\r?\n/);
  const removed = lines.filter((line) => unchecked.test(line));
  if (removed.length === 0)
    return { text: text2, removed: 0, preserved: 0 };
  const retained = lines.filter((line) => !unchecked.test(line));
  const hasSubstantiveRetainedText = retained.some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !/^#{1,6}\s+/.test(trimmed);
  });
  return hasSubstantiveRetainedText ? { text: retained.join("\n"), removed: removed.length, preserved: 0 } : { text: text2, removed: 0, preserved: removed.length };
}
function extractExactFragments(text2) {
  const fragments = /* @__PURE__ */ new Set();
  for (const quoted of scanQuotedFragments(text2)) {
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
function extractIdentifiers(text2) {
  const identifiers = /* @__PURE__ */ new Set();
  for (const match of text2.matchAll(IDENTIFIER_PATTERN)) {
    const identifier = match[0];
    if (isDistinctiveIdentifier(identifier)) {
      addIdentifier(identifiers, identifier);
    }
  }
  for (const quoted of scanQuotedFragments(text2)) {
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
  for (const match of text2.matchAll(/(?<![\p{L}\p{N}_$])([\p{L}_$][\p{L}\p{N}_$]{2,})\(/gu)) {
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
function redactSensitiveTaskText(text2) {
  return text2.replace(/(https?:\/\/)[^/\s@]+@/gi, "$1").replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{8,}\b/g, "[redacted]").replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]").replace(/\bsk-[A-Za-z0-9_-]{16,}(?=$|[^A-Za-z0-9_])/g, "[redacted]");
}
function stripHttpUrls(text2) {
  return text2.includes("://") ? text2.replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " [url] ") : text2;
}
function stripHtmlComments(text2) {
  return text2.includes("<!--") ? text2.replace(/<!--[\s\S]*?-->/g, " ") : text2;
}
function scanQuotedFragments(text2) {
  const fragments = [];
  for (const line of text2.split(/\r?\n/)) {
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
function isEscaped(text2, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text2[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
function extractFileMentions(text2) {
  const mentions = /* @__PURE__ */ new Set();
  for (const match of text2.matchAll(CONVENTIONAL_FILE_MENTION_PATTERN)) {
    if (match[0])
      mentions.add(match[0]);
  }
  for (const match of text2.matchAll(
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
  const withoutUrls = text2.includes("://") ? text2.replace(/https?:\/\/\S+/gi, " ") : text2;
  for (const match of withoutUrls.matchAll(FILE_MENTION_PATTERN)) {
    const cleaned = match[0].replace(/\\/g, "/").replace(/^\.\.?\//, "");
    if (cleaned.length >= 4) {
      mentions.add(cleaned);
    }
  }
  return mentions;
}
function extractMemberMentions(text2) {
  return new Set([...text2.matchAll(MEMBER_MENTION_PATTERN)].map((match) => match[1]).filter((member) => typeof member === "string" && !FILE_EXTENSIONS.has(member.toLowerCase())));
}
function extractDiffContentLines(diffText) {
  if (!diffText) {
    return "";
  }
  return diffText.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");
}
function tokenizeText(text2) {
  return new Set(text2.replace(/\bhttp\s*\/\s*([123])\b/gi, "http h$1").replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(TOKEN_SPLIT).map((token) => token.trim()).filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token)).map((token) => normalizeToken(token)).filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token)));
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
function definitionsFor(file, custom) {
  if (!custom?.supports(file.extension))
    return extractLanguageDefinitions(file);
  const result = custom.extract(file);
  return result.status === "ok" ? result.facts.definitions : [];
}
var MAX_IDENTIFIER_MATCHED_FILES = 5;
var VAGUE_TASK_PATTERN = /^\s*(?:please\s+)?(?:improve|make|clean(?:\s+(?:this|it|things?))?\s+up|cleanup|refactor)\b/i;
var VAGUE_TASK_TERMS = /\b(?:please|improve|better|clean(?:\s+(?:this|it|things?))?\s+up|cleanup|refactor|developer\s+experience|dx|general|overall|codebase|quality|make|things?)\b/gi;
var CLUSTERED_RANKING_MARGIN = 2;
function analyzeTaskGrounding(repo, input, custom) {
  const issueText = input.issueText ?? "";
  const signals = extractTaskSignals({
    issueText,
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const anchorIdentifiers = [...signals.identifiers].filter((identifier) => isAnchorIdentifier(identifier, issueText));
  const batchedMatches = collectBatchedIdentifierMatches(repo, anchorIdentifiers, custom);
  const identifiers = anchorIdentifiers.map((identifier) => groundIdentifier(repo, identifier, batchedMatches.definitions.get(identifier), batchedMatches.text.get(identifier), custom));
  const unresolvedIdentifiers = identifiers.filter((entry2) => entry2.status === "not-found").map((entry2) => entry2.identifier);
  const partiallyResolvedIdentifiers = identifiers.filter((entry2) => entry2.status === "partial-definition").map((entry2) => entry2.identifier);
  const unverifiedIdentifiers = identifiers.filter((entry2) => entry2.status === "unverified").map((entry2) => entry2.identifier);
  const resolvedIdentifierCount = identifiers.filter((entry2) => entry2.status === "exact-definition" || entry2.status === "exact-text").length;
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
    !repo.files.some((file) => file.isSource && file.textSampleComplete === false) && !repo.files.some((file) => custom?.supports(file.extension) && custom.extract(file).status === "failed")
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
function collectBatchedIdentifierMatches(repo, identifiers, custom) {
  const definitions = collectIdentifierMatches(repo, identifiers, true, custom);
  const withoutDefinitions = identifiers.filter((identifier) => (definitions.get(identifier)?.length ?? 0) === 0);
  return { definitions, text: collectIdentifierMatches(repo, withoutDefinitions, false, custom) };
}
function collectIdentifierMatches(repo, identifiers, definitions, custom) {
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
      for (const definition of definitionsFor(file, custom)) {
        if (wanted.has(definition.name))
          found.add(definition.name);
      }
    }
    for (const match of definitions && custom?.supports(file.extension) ? [] : file.textSample.matchAll(pattern)) {
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
function groundIdentifier(repo, identifier, precomputedDefinitionFiles, precomputedTextFiles, custom) {
  const definitionPattern = new RegExp(`(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`, "u");
  const exactPattern = new RegExp(`(?<![\\p{L}\\p{N}_$])${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`, "u");
  const definitionFiles = precomputedDefinitionFiles ?? repo.files.filter((file) => definitionsFor(file, custom).some((entry2) => entry2.name === identifier) || !custom?.supports(file.extension) && definitionPattern.test(file.textSample)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  if (definitionFiles.length > 0) {
    return {
      identifier,
      status: "exact-definition",
      matchedFiles: definitionFiles
    };
  }
  const textFiles = precomputedTextFiles ?? repo.files.filter((file) => exactPattern.test(file.textSample)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  return textFiles.length > 0 ? { identifier, status: "exact-text", matchedFiles: textFiles } : groundPartialOrUnverifiedIdentifier(repo, identifier, custom);
}
function groundPartialOrUnverifiedIdentifier(repo, identifier, custom) {
  const identifierParts = tokenizeIdentifier(identifier);
  const partialFiles = repo.files.filter((file) => hasDefinitionContainingTokens(file, identifierParts, custom)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  if (identifierParts.size >= 2 && partialFiles.length > 0) {
    return {
      identifier,
      status: "partial-definition",
      matchedFiles: partialFiles
    };
  }
  if (repo.files.some((file) => file.isSource && file.textSampleComplete === false || custom?.supports(file.extension) && custom.extract(file).status === "failed")) {
    return { identifier, status: "unverified", matchedFiles: [] };
  }
  return { identifier, status: "not-found", matchedFiles: [] };
}
function hasDefinitionContainingTokens(file, expectedTokens, custom) {
  if (expectedTokens.size < 2) {
    return false;
  }
  for (const definition of definitionsFor(file, custom)) {
    const candidateTokens = tokenizeIdentifier(definition.name);
    if ([...expectedTokens].every((token) => candidateTokens.has(token)))
      return true;
  }
  if (custom?.supports(file.extension))
    return false;
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
function removeIdentifiers(text2, identifiers) {
  return identifiers.reduce((current2, identifier) => current2.replace(new RegExp(escapeRegExp(identifier), "g"), " "), text2);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// packages/core/dist/composer-projects.js
function buildComposerProjects(files) {
  const canonicalPaths = new Map(files.map((file) => [file.path.toLowerCase(), file.path]));
  const projects = files.filter((file) => file.path === "composer.json" || file.path.endsWith("/composer.json")).sort((left, right) => left.path.localeCompare(right.path)).flatMap((file) => {
    let manifest;
    try {
      const parsed2 = JSON.parse(file.textSample);
      if (!parsed2 || typeof parsed2 !== "object" || Array.isArray(parsed2))
        return [];
      manifest = parsed2;
    } catch {
      return [];
    }
    const root = directoryOf(file.path);
    const autoload = collectAutoload(manifest.autoload, root);
    const autoloadDev = collectAutoload(manifest["autoload-dev"], root);
    const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
    const testScript = typeof scripts.test === "string" && scripts.test.trim().length > 0 || Array.isArray(scripts.test) && scripts.test.length > 0 && scripts.test.every((entry2) => typeof entry2 === "string" && entry2.trim().length > 0);
    const requireDev = isRecord(manifest["require-dev"]) ? manifest["require-dev"] : {};
    const required = isRecord(manifest.require) ? manifest.require : {};
    const name = typeof manifest.name === "string" && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(manifest.name) ? manifest.name : void 0;
    const requiredPackages = [...new Set([...Object.entries(required), ...Object.entries(requireDev)].filter(([entry2, constraint]) => /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(entry2) && typeof constraint === "string" && constraint.trim().length > 0).map(([entry2]) => entry2))].sort();
    const pathRepositoryPatterns = collectPathRepositoryPatterns(manifest.repositories, root);
    const phpunitConfig = ["phpunit.xml", "phpunit.xml.dist"].map((name2) => root ? `${root}/${name2}` : name2).map((path) => canonicalPaths.get(path.toLowerCase())).find((path) => path !== void 0);
    const pestConfig = ["tests/Pest.php", "Pest.php"].map((name2) => root ? `${root}/${name2}` : name2).map((path) => canonicalPaths.get(path.toLowerCase())).find((path) => path !== void 0);
    return [{
      path: file.path,
      root,
      ...name ? { name } : {},
      psr4: [...autoload.psr4, ...autoloadDev.psr4].sort((left, right) => right.prefix.length - left.prefix.length || left.prefix.localeCompare(right.prefix)),
      classmap: [.../* @__PURE__ */ new Set([...autoload.classmap, ...autoloadDev.classmap])].sort((left, right) => left.localeCompare(right)),
      requiredPackages,
      pathRepositoryPatterns,
      pathDependencies: [],
      testScript,
      pestDependency: typeof requireDev["pestphp/pest"] === "string" && requireDev["pestphp/pest"].trim().length > 0 || typeof required["pestphp/pest"] === "string" && required["pestphp/pest"].trim().length > 0,
      phpunitDependency: typeof requireDev["phpunit/phpunit"] === "string" && requireDev["phpunit/phpunit"].trim().length > 0 || typeof required["phpunit/phpunit"] === "string" && required["phpunit/phpunit"].trim().length > 0,
      ...pestConfig ? { pestConfig } : {},
      ...phpunitConfig ? { phpunitConfig } : {}
    }];
  });
  for (const project of projects) {
    const dependencies = [];
    for (const packageName2 of project.requiredPackages) {
      const candidates = projects.filter((candidate) => candidate.path !== project.path && candidate.name === packageName2 && project.pathRepositoryPatterns.some((pattern) => matchesRepositoryPattern(pattern, candidate.root)));
      if (candidates.length === 1) {
        const target = candidates[0];
        dependencies.push({ package: packageName2, projectPath: target.path, root: target.root });
      }
    }
    project.pathDependencies = dependencies.sort((left, right) => left.package.localeCompare(right.package) || left.projectPath.localeCompare(right.projectPath));
  }
  return projects;
}
function composerDependencyClosure(projects, projectPath) {
  const byPath = new Map(projects.map((project) => [project.path, project]));
  const reachable = /* @__PURE__ */ new Set();
  const pending = [projectPath];
  while (pending.length > 0) {
    const current2 = pending.shift();
    if (reachable.has(current2))
      continue;
    reachable.add(current2);
    for (const dependency of byPath.get(current2)?.pathDependencies ?? []) {
      if (!reachable.has(dependency.projectPath))
        pending.push(dependency.projectPath);
    }
  }
  return reachable;
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
    const relative6 = symbol.slice(mapping.prefix.length).replace(/\\/g, "/");
    if (!relative6)
      continue;
    for (const root of mapping.roots) {
      const candidate = [root, `${relative6}.php`].filter(Boolean).join("/");
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
  if (project.pestDependency) {
    const executable = project.root ? `${project.root}/vendor/bin/pest` : "vendor/bin/pest";
    return {
      command: executable,
      reason: project.pestConfig ? `${project.path} declares pestphp/pest and ${project.pestConfig} configures the suite` : `${project.path} declares pestphp/pest in its dependencies`,
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
    const roots = (typeof rawRoots === "string" ? [rawRoots] : Array.isArray(rawRoots) ? rawRoots : []).filter((entry2) => typeof entry2 === "string").map((entry2) => resolveManifestPath(root, entry2)).filter((entry2) => entry2 !== void 0);
    return prefix && roots.length > 0 ? [{ prefix, roots: [...new Set(roots)] }] : [];
  });
  const classmap = (Array.isArray(value.classmap) ? value.classmap : []).filter((entry2) => typeof entry2 === "string").map((entry2) => resolveManifestPath(root, entry2)).filter((entry2) => entry2 !== void 0);
  return { psr4, classmap };
}
function collectPathRepositoryPatterns(value, root) {
  const entries = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  const patterns2 = entries.flatMap((entry2) => {
    if (!isRecord(entry2) || entry2.type !== "path" || typeof entry2.url !== "string")
      return [];
    const pattern = resolveManifestPattern(root, entry2.url);
    return pattern ? [pattern] : [];
  });
  return [...new Set(patterns2)].sort((left, right) => left.localeCompare(right));
}
function resolveManifestPattern(root, value) {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/\/$/, "");
  if (!trimmed || trimmed === "." || /[$?\[\]\0]/.test(trimmed) || /^[A-Za-z]:[\/]|^[\/]/.test(trimmed))
    return void 0;
  const segments = root.split("/").filter(Boolean);
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".")
      continue;
    if (segment === "..") {
      if (segments.length === 0)
        return void 0;
      segments.pop();
      continue;
    }
    if (segment !== "*" && segment.includes("*"))
      return void 0;
    segments.push(segment);
  }
  return segments.join("/");
}
function matchesRepositoryPattern(pattern, root) {
  const expected = pattern.split("/");
  const actual = root.split("/").filter(Boolean);
  if (expected.length !== actual.length)
    return false;
  return expected.every((segment, index) => segment === "*" || segment === actual[index]);
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
var SOLUTION_FILE = /\.sln$/i;
var PROJECT_REFERENCE = /<ProjectReference\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
var PROJECT_USING = /<Using\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
var SOURCE_GLOBAL_USING = /^\s*global\s+using\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm;
var SOLUTION_PROJECT = /^\s*Project\("[^"]+"\)\s*=\s*"[^"]+",\s*"([^"]+\.(?:csproj|fsproj|vbproj))",\s*"[^"]+"\s*$/gim;
function buildDotnetProjects(files) {
  const projectFiles = files.filter((file) => PROJECT_FILE.test(file.path)).sort((left, right) => left.path.localeCompare(right.path));
  const canonicalPaths = new Map(projectFiles.map((file) => [file.path.toLowerCase(), file.path]));
  const projects = projectFiles.map((file) => {
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
    const globalUsings = /* @__PURE__ */ new Set();
    PROJECT_USING.lastIndex = 0;
    for (const match of file.textSample.matchAll(PROJECT_USING)) {
      const namespace = match[2]?.trim();
      if (namespace && validNamespace(namespace))
        globalUsings.add(namespace);
    }
    return {
      path: file.path,
      root,
      references: [...references].sort((left, right) => left.localeCompare(right)),
      globalUsings: [...globalUsings].sort((left, right) => left.localeCompare(right)),
      test: isDotnetTestProject(file)
    };
  });
  const projectsByRoot = /* @__PURE__ */ new Map();
  for (const project of projects) {
    const existing = projectsByRoot.get(project.root);
    if (existing)
      existing.push(project);
    else
      projectsByRoot.set(project.root, [project]);
  }
  for (const source of files.filter((file) => file.path.toLowerCase().endsWith(".cs"))) {
    const owner = dotnetProjectForPathFromRoots(projectsByRoot, source.path);
    if (!owner)
      continue;
    SOURCE_GLOBAL_USING.lastIndex = 0;
    for (const match of source.textSample.matchAll(SOURCE_GLOBAL_USING)) {
      const namespace = match[1]?.trim();
      if (namespace && validNamespace(namespace) && !owner.globalUsings.includes(namespace))
        owner.globalUsings.push(namespace);
    }
  }
  for (const project of projects)
    project.globalUsings.sort((left, right) => left.localeCompare(right));
  return projects;
}
function buildDotnetSolutions(files, projects = buildDotnetProjects(files)) {
  const canonicalProjects = new Map(projects.map((project) => [project.path.toLowerCase(), project.path]));
  return files.filter((file) => SOLUTION_FILE.test(file.path)).sort((left, right) => left.path.localeCompare(right.path)).map((file) => {
    const root = directoryOf2(file.path);
    const members = /* @__PURE__ */ new Set();
    SOLUTION_PROJECT.lastIndex = 0;
    for (const match of file.textSample.matchAll(SOLUTION_PROJECT)) {
      const include = match[1]?.trim();
      if (!include || /[$*?]/.test(include) || /^[A-Za-z]:[\\/]|^[\\/]/.test(include))
        continue;
      const normalized = normalizeRepositoryPath2(root ? `${root}/${include}` : include);
      const canonical = normalized ? canonicalProjects.get(normalized.toLowerCase()) : void 0;
      if (canonical)
        members.add(canonical);
    }
    return {
      path: file.path,
      root,
      projects: [...members].sort((left, right) => left.localeCompare(right))
    };
  });
}
function dotnetSolutionsContaining(solutions, projectPaths) {
  const required = new Set(projectPaths);
  return solutions.filter((solution) => {
    const members = new Set(solution.projects);
    return [...required].every((path) => members.has(path));
  });
}
function dotnetProjectForPathFromRoots(projectsByRoot, path) {
  const directories = path.split("/").slice(0, -1);
  for (let length = directories.length; length >= 0; length -= 1) {
    const projects = projectsByRoot.get(directories.slice(0, length).join("/")) ?? [];
    if (projects.length > 0)
      return projects.length === 1 ? projects[0] : void 0;
  }
  return void 0;
}
function validNamespace(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value) && !/[$*?]/.test(value);
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
    const current2 = pending.shift();
    if (reachable.has(current2))
      continue;
    reachable.add(current2);
    for (const reference of byPath.get(current2)?.references ?? []) {
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
  const rubyEvidenceFiles = files.filter((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    return file.path.toLowerCase().endsWith(".rb") || file.path.toLowerCase().endsWith(".rake") || name === "gemfile" || name === "rakefile" || name === ".rspec";
  });
  return manifests.map((manifest) => {
    const root = directoryOf3(manifest.path);
    const scoped = rubyEvidenceFiles.filter((file) => rubyProjectForPath(shells, file.path)?.path === manifest.path);
    const rspecEvidence = /* @__PURE__ */ new Set();
    const minitestEvidence = /* @__PURE__ */ new Set();
    const railsEvidence = /* @__PURE__ */ new Set();
    if (/^\s*gem\s*(?:\(|\s)\s*["']rspec(?:-[a-z0-9_-]+)?["']/im.test(manifest.textSample))
      rspecEvidence.add(manifest.path);
    if (/^\s*gem\s*(?:\(|\s)\s*["']minitest["']/im.test(manifest.textSample))
      minitestEvidence.add(manifest.path);
    if (/^\s*gem\s*(?:\(|\s)\s*["']rails["']/im.test(manifest.textSample))
      railsEvidence.add(manifest.path);
    for (const file of scoped) {
      const relative6 = root ? file.path.slice(root.length + 1) : file.path;
      if (relative6.toLowerCase() === ".rspec" || /(?:^|\/)spec\/(?:spec_helper|rails_helper)\.rb$/i.test(relative6) || /_spec\.rb$/i.test(relative6)) {
        rspecEvidence.add(file.path);
      }
      if (/(?:^|\/)test\/test_helper\.rb$/i.test(relative6) || /_test\.rb$/i.test(relative6) || /^(?:\s*require\s*\(?\s*["']minitest|\s*class\s+[^\n<]+<\s*(?:Minitest::Test|MiniTest::Unit)\b)/m.test(file.textSample)) {
        minitestEvidence.add(file.path);
      }
    }
    const application = scoped.find((file) => {
      const relative6 = root ? file.path.slice(root.length + 1) : file.path;
      return relative6.toLowerCase() === "config/application.rb" && /\bclass\s+Application\s*<\s*Rails::Application\b/.test(file.textSample);
    });
    if (application)
      railsEvidence.add(application.path);
    const autoloadFiles = railsEvidence.size === 2 ? scoped.filter((file) => {
      const relative6 = root ? file.path.slice(root.length + 1) : file.path;
      return /^app\/(?!assets(?:\/|$)|javascript(?:\/|$)|views(?:\/|$))[^/]+\/.+\.rb$/i.test(relative6);
    }).map((file) => file.path).sort((left, right) => left.localeCompare(right)) : [];
    const rakefile = scoped.find((file) => file.path.split("/").pop()?.toLowerCase() === "rakefile");
    const rakeTestPath = rakefile && /\b(?:Rake::TestTask|task\s*(?:\(|\s)\s*:test\b)/.test(rakefile.textSample) ? rakefile.path : void 0;
    return {
      path: manifest.path,
      root,
      rspecEvidence: [...rspecEvidence].sort((left, right) => left.localeCompare(right)),
      minitestEvidence: [...minitestEvidence].sort((left, right) => left.localeCompare(right)),
      railsEvidence: [...railsEvidence].sort((left, right) => left.localeCompare(right)),
      autoloadFiles,
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
    const relative6 = project.root ? testPath.slice(project.root.length + 1) : testPath;
    return {
      command: scopedBundleCommand(project.root, `ruby -Itest ${relative6}`),
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
  const total = [...shares.values()].reduce((sum, count3) => sum + count3, 0);
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
    return candidates.length === 1 ? dotnetCommandForProject(files, projects, candidates[0]) : void 0;
  }
  return void 0;
}
function dotnetTestCommandForPath(files, sourcePath) {
  const projects = buildDotnetProjects(files);
  const sourceProject = dotnetProjectForPath(projects, sourcePath);
  return sourceProject ? dotnetCommandForProject(files, projects, sourceProject) : void 0;
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
function dotnetCommandForProject(files, projects, sourceProject) {
  const testProjects = sourceProject.test ? [sourceProject] : referencingDotnetTestProjects(projects, sourceProject.path);
  if (testProjects.length > 1) {
    const solutions = dotnetSolutionsContaining(buildDotnetSolutions(files, projects), [sourceProject.path, ...testProjects.map((project) => project.path)]);
    if (solutions.length !== 1)
      return void 0;
    const solution = solutions[0];
    return {
      command: `dotnet test ${solution.path}`,
      reason: `${solution.path} is the only solution containing ${sourceProject.path} and ${testProjects.length} referencing test projects`,
      scopeDir: solution.root
    };
  }
  const testProject = testProjects[0];
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

// packages/core/dist/go-projects.js
function buildGoModules(files) {
  const manifests = files.flatMap((file) => {
    if (file.path.split("/").pop()?.toLowerCase() !== "go.mod")
      return [];
    const name = /^\s*module\s+([^\s]+)\s*$/m.exec(file.textSample)?.[1]?.trim();
    if (!name || /[\0\r\n]/.test(name))
      return [];
    return [{ file, path: file.path, root: directoryOf4(file.path), name }];
  });
  const moduleRoots = new Set(manifests.map((manifest) => manifest.root));
  return manifests.map((manifest) => {
    const replacementsByModule = /* @__PURE__ */ new Map();
    for (const replacement of parseReplaceClauses(manifest.file.textSample)) {
      const targetRoot = normalizeRelativeRoot(manifest.root, replacement.target);
      if (targetRoot === void 0 || !moduleRoots.has(targetRoot))
        continue;
      const targets = replacementsByModule.get(replacement.module);
      if (targets)
        targets.push(targetRoot);
      else
        replacementsByModule.set(replacement.module, [targetRoot]);
    }
    const replacements = [...replacementsByModule.entries()].flatMap(([module, targets]) => targets.length === 1 ? [{ module, targetRoot: targets[0] }] : []).sort((left, right) => right.module.length - left.module.length || left.module.localeCompare(right.module));
    return { path: manifest.path, root: manifest.root, name: manifest.name, replacements };
  }).sort((left, right) => left.root.localeCompare(right.root) || left.name.localeCompare(right.name));
}
function buildGoWorkspaces(files, modules = buildGoModules(files)) {
  const moduleRoots = new Set(modules.map((module) => module.root));
  return files.flatMap((file) => {
    if (file.path.split("/").pop()?.toLowerCase() !== "go.work")
      return [];
    const root = directoryOf4(file.path);
    const uses = parseUsePaths(file.textSample).flatMap((value) => {
      const target = normalizeRelativeRoot(root, value);
      return target !== void 0 && moduleRoots.has(target) ? [target] : [];
    });
    return [{ path: file.path, root, moduleRoots: [...new Set(uses)].sort() }];
  }).sort((left, right) => left.root.localeCompare(right.root));
}
function goModuleForPath(modules, path) {
  const directory = directoryOf4(path);
  const matching = modules.filter((module) => contains(module.root, directory));
  if (matching.length === 0)
    return void 0;
  const deepest = Math.max(...matching.map((module) => depth3(module.root)));
  const nearest = matching.filter((module) => depth3(module.root) === deepest);
  return nearest.length === 1 ? nearest[0] : void 0;
}
function goWorkspaceForModules(workspaces, leftRoot, rightRoot) {
  return [...workspaces].filter((workspace) => workspace.moduleRoots.includes(leftRoot) && workspace.moduleRoots.includes(rightRoot)).sort((left, right) => depth3(right.root) - depth3(left.root) || left.path.localeCompare(right.path))[0];
}
function goReplacementForImport(module, specifier) {
  const matching = module.replacements.filter((replacement) => specifier === replacement.module || specifier.startsWith(`${replacement.module}/`));
  if (matching.length === 0)
    return void 0;
  const longest = matching[0].module.length;
  const equallySpecific = matching.filter((replacement) => replacement.module.length === longest);
  return equallySpecific.length === 1 ? equallySpecific[0] : void 0;
}
function parseUsePaths(text2) {
  const uses = [];
  for (const match of text2.matchAll(/^\s*use\s+([^\s(][^\s]*)\s*(?:\/\/.*)?$/gm)) {
    if (match[1])
      uses.push(match[1]);
  }
  for (const block of text2.matchAll(/^\s*use\s*\(\s*$([\s\S]*?)^\s*\)\s*(?:\/\/.*)?$/gm)) {
    for (const raw of (block[1] ?? "").split(/\r?\n/)) {
      const value = raw.replace(/\/\/.*$/, "").trim().split(/\s+/)[0];
      if (value)
        uses.push(value);
    }
  }
  return uses;
}
function parseReplaceClauses(text2) {
  const clauses = [];
  let inBlock = false;
  let blockClauses = [];
  for (const raw of text2.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line)
      continue;
    if (/^replace\s*\($/.test(line)) {
      inBlock = true;
      blockClauses = [];
      continue;
    }
    if (inBlock && line === ")") {
      inBlock = false;
      clauses.push(...blockClauses);
      blockClauses = [];
      continue;
    }
    if (inBlock)
      blockClauses.push(line);
    else if (line.startsWith("replace "))
      clauses.push(line.slice("replace ".length).trim());
  }
  return clauses.flatMap((clause) => {
    const sides = clause.split(/\s*=>\s*/);
    if (sides.length !== 2)
      return [];
    const left = (sides[0] ?? "").trim().split(/\s+/);
    const right = (sides[1] ?? "").trim().split(/\s+/);
    const module = left[0] ?? "";
    const target = right[0] ?? "";
    if (left.length > 2 || left.length === 2 && !/^v\S+$/.test(left[1] ?? "") || right.length !== 1)
      return [];
    if (!module || module.startsWith(".") || /^[\\/]|^[A-Za-z]:/.test(module) || /[*?\[\]\0]/.test(module))
      return [];
    if (!target.startsWith(".") || /[*?\[\]\0]/.test(target))
      return [];
    return [{ module, target }];
  });
}
function normalizeRelativeRoot(root, value) {
  if (!value || /^[\\/]/.test(value) || /^[A-Za-z]:/.test(value) || value.includes("\0") || /[*?\[]/.test(value))
    return void 0;
  const output = root.split("/").filter(Boolean);
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".")
      continue;
    if (segment === "..") {
      if (output.length === 0)
        return void 0;
      output.pop();
    } else {
      output.push(segment);
    }
  }
  return output.join("/");
}
function contains(root, path) {
  return root ? path === root || path.startsWith(`${root}/`) : true;
}
function directoryOf4(path) {
  return path.split("/").slice(0, -1).join("/");
}
function depth3(path) {
  return path.split("/").filter(Boolean).length;
}

// packages/core/dist/rust-projects.js
function buildRustProjects(files) {
  const manifests = files.filter((file) => file.path.split("/").pop()?.toLowerCase() === "cargo.toml").sort((left, right) => left.path.localeCompare(right.path));
  const manifestRoots = new Set(manifests.map((file) => directoryOf5(file.path)));
  const parsed2 = manifests.map((manifest) => parseManifest(manifest, manifestRoots));
  return parsed2.map((project) => {
    const inherited = project.inherited.flatMap((alias) => {
      const owner = [...parsed2].filter((candidate) => contains2(candidate.root, project.root)).sort((left, right) => depth4(right.root) - depth4(left.root) || left.path.localeCompare(right.path)).find((candidate) => candidate.workspace.some((dependency2) => dependency2.alias === alias));
      const dependency = owner?.workspace.find((candidate) => candidate.alias === alias);
      return dependency ? [{ ...dependency }] : [];
    });
    const byAlias = /* @__PURE__ */ new Map();
    for (const dependency of [...project.direct, ...inherited])
      byAlias.set(rustIdentifier(dependency.alias), dependency);
    return {
      path: project.path,
      root: project.root,
      ...project.name ? { name: project.name } : {},
      pathDependencies: [...byAlias.values()].sort((left, right) => left.alias.localeCompare(right.alias))
    };
  });
}
function rustProjectForPath(projects, path) {
  const matching = projects.filter((project) => contains2(project.root, directoryOf5(path)));
  if (matching.length === 0)
    return void 0;
  const deepest = Math.max(...matching.map((project) => depth4(project.root)));
  const nearest = matching.filter((project) => depth4(project.root) === deepest);
  return nearest.length === 1 ? nearest[0] : void 0;
}
function rustPathDependency(project, identifier) {
  const normalized = rustIdentifier(identifier);
  return project.pathDependencies.find((dependency) => rustIdentifier(dependency.alias) === normalized);
}
function parseManifest(file, manifestRoots) {
  const root = directoryOf5(file.path);
  let section2 = "";
  let name;
  const direct = [];
  const workspace = [];
  const inherited = [];
  for (const raw of file.textSample.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const heading = /^\[([^\]]+)\]$/.exec(line)?.[1]?.trim().toLowerCase();
    if (heading) {
      section2 = heading;
      continue;
    }
    if (section2 === "package" && !name) {
      name = /^name\s*=\s*["']([^"']+)["']\s*$/.exec(line)?.[1]?.trim();
      continue;
    }
    const dependencySection = section2 === "dependencies" || section2 === "dev-dependencies" || section2 === "build-dependencies" || section2.endsWith(".dependencies");
    const workspaceSection = section2 === "workspace.dependencies";
    if (!dependencySection && !workspaceSection)
      continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*\{([^}]*)\}\s*$/.exec(line);
    if (!match?.[1] || !match[2])
      continue;
    const alias = rustIdentifier(match[1]);
    const fields2 = match[2];
    const packageName2 = /(?:^|,)\s*package\s*=\s*["']([^"']+)["']/.exec(fields2)?.[1]?.trim();
    const rawPath = /(?:^|,)\s*path\s*=\s*["']([^"']+)["']/.exec(fields2)?.[1]?.trim();
    if (rawPath) {
      const targetRoot = normalizeRelativeRoot2(root, rawPath);
      if (!targetRoot || !manifestRoots.has(targetRoot))
        continue;
      const dependency = {
        alias,
        ...packageName2 ? { package: packageName2 } : {},
        root: targetRoot,
        evidencePath: file.path
      };
      (workspaceSection ? workspace : direct).push(dependency);
      continue;
    }
    if (dependencySection && /(?:^|,)\s*workspace\s*=\s*true\s*(?:,|$)/.test(fields2))
      inherited.push(alias);
  }
  return {
    path: file.path,
    root,
    ...name ? { name } : {},
    direct,
    workspace,
    inherited: [...new Set(inherited)].sort()
  };
}
function normalizeRelativeRoot2(root, value) {
  if (!value || /^[\\/]/.test(value) || /^[A-Za-z]:/.test(value) || value.includes("\0"))
    return void 0;
  const output = root.split("/").filter(Boolean);
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".")
      continue;
    if (segment === "..") {
      if (output.length === 0)
        return void 0;
      output.pop();
    } else {
      output.push(segment);
    }
  }
  return output.join("/");
}
function rustIdentifier(value) {
  return value.trim().replace(/-/g, "_");
}
function contains2(root, path) {
  return root ? path === root || path.startsWith(`${root}/`) : true;
}
function directoryOf5(path) {
  return path.split("/").slice(0, -1).join("/");
}
function depth4(path) {
  return path.split("/").filter(Boolean).length;
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
function buildImportGraph(files, custom) {
  const allParseable = files.filter((file) => (languageAdapterForFile(file) || custom?.supports(file.extension)) && file.textSample.length > 0);
  const parseable = allParseable.slice(0, MAX_GRAPH_FILES);
  const dotnetProjects = buildDotnetProjects(files);
  const composerProjects = buildComposerProjects(files);
  const rustProjects = buildRustProjects(files);
  const hasRailsGem = files.some((file) => file.path.split("/").pop()?.toLowerCase() === "gemfile" && /^\s*gem\s*(?:\(|\s)\s*["']rails["']/im.test(file.textSample));
  const hasRailsApplication = files.some((file) => /(?:^|\/)config\/application\.rb$/i.test(file.path) && /\bclass\s+Application\s*<\s*Rails::Application\b/.test(file.textSample));
  const rubyProjects = hasRailsGem && hasRailsApplication ? buildRubyProjects(files) : [];
  const goModules = buildGoModules(files);
  const goWorkspaces = buildGoWorkspaces(files, goModules);
  const resolverIndex = buildResolverIndex(files, dotnetProjects, composerProjects, rustProjects, rubyProjects, goModules, goWorkspaces);
  const aliases = buildAliases(files);
  const workspacePackages = buildWorkspacePackages(files);
  const imports = /* @__PURE__ */ new Map();
  const importedBy = /* @__PURE__ */ new Map();
  let truncatedEdges = 0;
  const customDiagnostics = [];
  const candidatePaths = files.map((file) => file.path);
  function* targetGroups(file) {
    if (custom?.supports(file.extension)) {
      const extraction = custom.extract(file);
      if (extraction.status === "failed") {
        if (customDiagnostics.length < MAX_GRAPH_FILES)
          customDiagnostics.push({ path: file.path, adapter: extraction.adapter, code: extraction.code });
      } else if (extraction.status === "ok") {
        for (const imported of extraction.facts.imports) {
          const resolved = custom.resolve(file.extension, file.path, imported, candidatePaths);
          if (resolved.status === "failed") {
            if (customDiagnostics.length < MAX_GRAPH_FILES)
              customDiagnostics.push({ path: file.path, adapter: resolved.adapter, code: resolved.code });
          } else if (resolved.status === "ok")
            yield resolved.targets;
        }
      }
      return;
    }
    for (const imported of extractLanguageImports(file)) {
      yield resolveLanguageImport(file.path, imported, resolverIndex, aliases, workspacePackages);
    }
  }
  for (const file of parseable) {
    let edges = 0;
    let edgeTruncated = false;
    importsLoop: for (const targets of targetGroups(file)) {
      for (const target of targets) {
        if (edges >= MAX_EDGES_PER_FILE) {
          truncatedEdges += 1;
          edgeTruncated = true;
          break importsLoop;
        }
        if (target === file.path || imports.get(file.path)?.has(target))
          continue;
        addEdge(imports, file.path, target);
        addEdge(importedBy, target, file.path);
        edges += 1;
      }
    }
    const dotnetProject = resolverIndex.dotnetProjectByFile.get(file.path);
    if (!edgeTruncated && dotnetProject && file.path.toLowerCase().endsWith(".cs")) {
      const identifiers = new Set(file.textSample.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? []);
      const targetsBySymbol = resolverIndex.dotnetGlobalTargetsByProject.get(dotnetProject.path);
      for (const identifier of identifiers) {
        for (const target of targetsBySymbol?.get(identifier) ?? []) {
          if (edges >= MAX_EDGES_PER_FILE) {
            truncatedEdges += 1;
            edgeTruncated = true;
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
    const rubyProject = resolverIndex.rubyProjectByFile.get(file.path);
    if (!edgeTruncated && rubyProject && file.path.toLowerCase().endsWith(".rb")) {
      const targetsBySymbol = resolverIndex.rubyAutoloadTargetsByProject.get(rubyProject.path);
      for (const identifier of rubyConstantIdentifiers(file.textSample)) {
        for (const target of targetsBySymbol?.get(identifier) ?? []) {
          if (edges >= MAX_EDGES_PER_FILE) {
            truncatedEdges += 1;
            edgeTruncated = true;
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
  }
  for (const project of dotnetProjects) {
    for (const reference of project.references.slice(0, MAX_EDGES_PER_FILE)) {
      addEdge(imports, project.path, reference);
      addEdge(importedBy, reference, project.path);
    }
    truncatedEdges += Math.max(0, project.references.length - MAX_EDGES_PER_FILE);
  }
  for (const project of composerProjects) {
    for (const dependency of project.pathDependencies.slice(0, MAX_EDGES_PER_FILE)) {
      addEdge(imports, project.path, dependency.projectPath);
      addEdge(importedBy, dependency.projectPath, project.path);
    }
    truncatedEdges += Math.max(0, project.pathDependencies.length - MAX_EDGES_PER_FILE);
  }
  return {
    imports,
    importedBy,
    truncatedFiles: Math.max(0, allParseable.length - parseable.length),
    truncatedEdges,
    ...custom ? { customDiagnostics } : {}
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
    return resolveGoImport(fromPath, imported, resolverIndex);
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
function resolveGoImport(fromPath, imported, resolverIndex) {
  const sourceModule = goModuleForPath(resolverIndex.goModules, fromPath);
  const replacement = sourceModule ? goReplacementForImport(sourceModule, imported.specifier) : void 0;
  if (replacement) {
    const suffix2 = imported.specifier === replacement.module ? "" : imported.specifier.slice(replacement.module.length + 1);
    const directory2 = [replacement.targetRoot, suffix2].filter(Boolean).join("/");
    return (resolverIndex.directoryPaths.get(directory2) ?? []).filter((path) => path.endsWith(".go") && !path.endsWith("_test.go")).sort(shortestPathFirst).slice(0, 20);
  }
  const candidates = resolverIndex.goModules.filter((entry2) => imported.specifier === entry2.name || imported.specifier.startsWith(`${entry2.name}/`)).sort((left, right) => right.name.length - left.name.length || left.path.localeCompare(right.path));
  const longest = candidates[0]?.name.length;
  const equallySpecific = candidates.filter((candidate) => candidate.name.length === longest);
  const reachable = sourceModule ? equallySpecific.filter((candidate) => candidate.path === sourceModule.path || goWorkspaceForModules(resolverIndex.goWorkspaces, sourceModule.root, candidate.root) !== void 0) : equallySpecific;
  const module = reachable.length === 1 ? reachable[0] : void 0;
  if (!module)
    return [];
  const suffix = imported.specifier === module.name ? "" : imported.specifier.slice(module.name.length + 1);
  const directory = [module.root, suffix].filter(Boolean).join("/");
  return (resolverIndex.directoryPaths.get(directory) ?? []).filter((path) => path.endsWith(".go") && !path.endsWith("_test.go")).sort(shortestPathFirst).slice(0, 20);
}
function resolveRustImport(fromPath, imported, resolverIndex) {
  if (imported.specifier.startsWith("file:")) {
    const raw = imported.specifier.slice("file:".length);
    const target = normalizeSegments(`${fromPath.split("/").slice(0, -1).join("/")}/${raw}`);
    if (!target)
      return [];
    return resolverIndex.repoPaths.has(target) ? [target] : resolverIndex.repoPaths.has(`${target}.rs`) ? [`${target}.rs`] : [];
  }
  const cargoRoot = nearestManifestDirectory(fromPath, "Cargo.toml", resolverIndex.repoPaths);
  const sourceRoot = cargoRoot ? `${cargoRoot}/src`.replace(/^\//, "") : fromPath.startsWith("src/") ? "src" : "";
  const segments = imported.specifier.replace(/::\*$/, "").split("::").filter(Boolean);
  const head = segments.shift();
  let base;
  let externalRoot;
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
  } else if (head) {
    const project = rustProjectForPath(resolverIndex.rustProjects, fromPath);
    const dependency = project ? rustPathDependency(project, head) : void 0;
    if (!dependency)
      return [];
    base = [dependency.root, "src"].filter(Boolean).join("/");
    externalRoot = [`${base}/lib.rs`, `${base}/main.rs`, `${base}/mod.rs`].find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (segments.length === 0) {
      return externalRoot ? [externalRoot] : [];
    }
  } else {
    return [];
  }
  for (let length = segments.length; length >= 1; length -= 1) {
    const root = [base, ...segments.slice(0, length)].filter(Boolean).join("/");
    const match = [`${root}.rs`, `${root}/mod.rs`].find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (match)
      return [match];
  }
  return externalRoot ? [externalRoot] : [];
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
    if (!sourceProject)
      return [...exact].sort(shortestPathFirst).slice(0, 1);
    const own = exact.filter((path) => resolverIndex.composerProjectByFile.get(path)?.path === sourceProject.path);
    if (own.length > 0)
      return [...own].sort(shortestPathFirst).slice(0, 1);
    const reachable = composerReachableProjects(resolverIndex, sourceProject);
    const dependencyExact = exact.filter((path) => {
      const owner = resolverIndex.composerProjectByFile.get(path);
      return owner !== void 0 && owner.path !== sourceProject.path && reachable.has(owner.path);
    });
    if (dependencyExact.length === 1)
      return dependencyExact;
    if (dependencyExact.length > 1)
      return [];
  }
  if (sourceProject) {
    const mapped = resolveComposerSymbol(sourceProject, imported.specifier.replace(/^\\+/, ""), resolverIndex.repoPaths, resolverIndex.suffixPaths);
    if (mapped.length > 0)
      return mapped;
    const dependencyMapped = /* @__PURE__ */ new Set();
    for (const projectPath of [...composerReachableProjects(resolverIndex, sourceProject)].sort()) {
      if (projectPath === sourceProject.path)
        continue;
      const dependency = resolverIndex.composerProjectsByPath.get(projectPath);
      if (!dependency)
        continue;
      for (const path of resolveComposerSymbol(dependency, imported.specifier.replace(/^\\+/, ""), resolverIndex.repoPaths, resolverIndex.suffixPaths)) {
        dependencyMapped.add(path);
      }
    }
    if (dependencyMapped.size === 1)
      return [...dependencyMapped];
    if (dependencyMapped.size > 1)
      return [];
  }
  const namespace = symbol.split("\\").slice(0, -1).join("\\");
  const namespacePaths = resolverIndex.phpNamespaces.get(namespace) ?? [];
  return (sourceProject ? namespacePaths.filter((path) => {
    const owner = resolverIndex.composerProjectByFile.get(path);
    return owner !== void 0 && composerReachableProjects(resolverIndex, sourceProject).has(owner.path);
  }) : namespacePaths).sort(shortestPathFirst).slice(0, 20);
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
function buildResolverIndex(files, dotnetProjects, composerProjects, rustProjects, rubyProjects, goModules, goWorkspaces) {
  const repoPaths = new Set(files.map((file) => file.path));
  const suffixPaths = /* @__PURE__ */ new Map();
  const javaPackagePaths = /* @__PURE__ */ new Map();
  const directoryPaths = /* @__PURE__ */ new Map();
  const phpSymbols = /* @__PURE__ */ new Map();
  const phpNamespaces = /* @__PURE__ */ new Map();
  const dotnetNamespaces = /* @__PURE__ */ new Map();
  const dotnetSymbolsByFile = /* @__PURE__ */ new Map();
  const dotnetProjectByFile = /* @__PURE__ */ new Map();
  const rubyProjectByFile = /* @__PURE__ */ new Map();
  const composerProjectByFile = /* @__PURE__ */ new Map();
  const composerProjectsByPath = new Map(composerProjects.map((project) => [project.path, project]));
  const composerDependencyClosures = /* @__PURE__ */ new Map();
  const dotnetProjectsByPath = new Map(dotnetProjects.map((project) => [project.path, project]));
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
      const symbols = [...new Set(extractLanguageDefinitions(file).filter((definition) => definition.kind !== "method").map((definition) => definition.name))];
      if (symbols.length > 0)
        dotnetSymbolsByFile.set(file.path, symbols);
      const owner = projectForSourcePath(file.path, dotnetProjectsByRoot);
      if (owner)
        dotnetProjectByFile.set(file.path, owner);
    }
    if (file.path.toLowerCase().endsWith(".rb")) {
      const owner = rubyProjectForPath(rubyProjects, file.path);
      if (owner)
        rubyProjectByFile.set(file.path, owner);
    }
  }
  goModules.sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
  for (const paths of dotnetNamespaces.values())
    paths.sort(shortestPathFirst);
  const dotnetReferenceClosures = /* @__PURE__ */ new Map();
  const dotnetGlobalTargetsByProject = /* @__PURE__ */ new Map();
  for (const project of dotnetProjects) {
    if (project.globalUsings.length === 0)
      continue;
    const reachable = dotnetReferenceClosureFromIndex(dotnetProjectsByPath, project.path);
    dotnetReferenceClosures.set(project.path, reachable);
    const targetsBySymbol = /* @__PURE__ */ new Map();
    for (const namespace of project.globalUsings) {
      for (const path of dotnetNamespaces.get(namespace.toLowerCase()) ?? []) {
        const owner = dotnetProjectByFile.get(path);
        const symbols = dotnetSymbolsByFile.get(path) ?? [];
        if (!owner || !reachable.has(owner.path))
          continue;
        for (const symbol of symbols) {
          const targets = targetsBySymbol.get(symbol);
          if (targets)
            targets.add(path);
          else
            targetsBySymbol.set(symbol, /* @__PURE__ */ new Set([path]));
        }
      }
    }
    dotnetGlobalTargetsByProject.set(project.path, new Map([...targetsBySymbol.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([symbol, targets]) => [symbol, [...targets].sort(shortestPathFirst)])));
  }
  const rubyAutoloadTargetsByProject = /* @__PURE__ */ new Map();
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  for (const project of rubyProjects) {
    if (project.autoloadFiles.length === 0)
      continue;
    const targetsBySymbol = /* @__PURE__ */ new Map();
    for (const path of project.autoloadFiles) {
      const target = filesByPath.get(path);
      if (!target)
        continue;
      for (const definition of extractLanguageDefinitions(target)) {
        if (definition.kind === "method")
          continue;
        const paths = targetsBySymbol.get(definition.name);
        if (paths)
          paths.add(path);
        else
          targetsBySymbol.set(definition.name, /* @__PURE__ */ new Set([path]));
      }
    }
    rubyAutoloadTargetsByProject.set(project.path, new Map([...targetsBySymbol.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([symbol, targets]) => [symbol, [...targets].sort(shortestPathFirst)])));
  }
  return {
    repoPaths,
    suffixPaths,
    javaPackagePaths,
    directoryPaths,
    goModules,
    goWorkspaces,
    rustProjects,
    rubyProjectByFile,
    rubyAutoloadTargetsByProject,
    phpSymbols,
    phpNamespaces,
    dotnetNamespaces,
    dotnetProjects,
    dotnetProjectByFile,
    dotnetReferenceClosures,
    dotnetGlobalTargetsByProject,
    composerProjectByFile,
    composerProjectsByPath,
    composerDependencyClosures
  };
}
function composerReachableProjects(resolverIndex, project) {
  let reachable = resolverIndex.composerDependencyClosures.get(project.path);
  if (!reachable) {
    reachable = composerDependencyClosure([...resolverIndex.composerProjectsByPath.values()], project.path);
    resolverIndex.composerDependencyClosures.set(project.path, reachable);
  }
  return reachable;
}
function rubyConstantIdentifiers(text2) {
  const identifiers = /* @__PURE__ */ new Set();
  let heredocEnd;
  for (const line of text2.split(/\r?\n/)) {
    if (heredocEnd) {
      if (line.trim() === heredocEnd)
        heredocEnd = void 0;
      continue;
    }
    let scrubbed = "";
    let quote = "";
    let escaped = false;
    for (const character of line) {
      if (escaped) {
        escaped = false;
        scrubbed += " ";
        continue;
      }
      if (quote && character === "\\") {
        escaped = true;
        scrubbed += " ";
        continue;
      }
      if (character === '"' || character === "'") {
        quote = quote === character ? "" : quote ? quote : character;
        scrubbed += " ";
        continue;
      }
      if (!quote && character === "#")
        break;
      scrubbed += quote ? " " : character;
    }
    const heredoc = /<<[-~]?\s*(?:["']([A-Za-z_][A-Za-z0-9_]*)["']|([A-Za-z_][A-Za-z0-9_]*))/.exec(line);
    if (heredoc)
      heredocEnd = heredoc[1] ?? heredoc[2];
    const searchable = heredoc ? scrubbed.slice(0, heredoc.index) : scrubbed;
    for (const match of searchable.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
      if (match[0])
        identifiers.add(match[0]);
    }
  }
  return identifiers;
}
function dotnetReferenceClosureFromIndex(projectsByPath, projectPath) {
  const reachable = /* @__PURE__ */ new Set();
  const pending = [projectPath];
  while (pending.length > 0) {
    const current2 = pending.shift();
    if (reachable.has(current2))
      continue;
    reachable.add(current2);
    for (const reference of projectsByPath.get(current2)?.references ?? []) {
      if (!reachable.has(reference))
        pending.push(reference);
    }
  }
  return reachable;
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
function addIndexedPath(index, key2, path) {
  const existing = index.get(key2);
  if (existing)
    existing.push(path);
  else
    index.set(key2, [path]);
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
      const end = alias.suffix.length === 0 ? specifier.length : specifier.length - alias.suffix.length;
      const middle = specifier.slice(alias.prefix.length, end);
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
  for (const file of files.filter((entry2) => entry2.path === "package.json" || entry2.path.endsWith("/package.json"))) {
    try {
      const manifest = JSON.parse(file.textSample);
      if (typeof manifest.name !== "string" || !manifest.name.trim())
        continue;
      const dir = file.path.split("/").slice(0, -1).join("/");
      const declared = [manifest.source, manifest.module, manifest.main, manifest.types].filter((entry2) => typeof entry2 === "string").map((entry2) => normalizeSegments(dir ? `${dir}/${entry2}` : entry2)).filter((entry2) => Boolean(entry2));
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
  for (const file of files.filter((entry2) => /(^|\/)(?:tsconfig|jsconfig)(?:\.[^/]*)?\.json$/i.test(entry2.path))) {
    try {
      const config = JSON.parse(file.textSample);
      const paths = config.compilerOptions?.paths;
      if (!paths || typeof paths !== "object" || Array.isArray(paths))
        continue;
      const dir = file.path.split("/").slice(0, -1).join("/");
      const baseUrl = typeof config.compilerOptions?.baseUrl === "string" ? config.compilerOptions.baseUrl : ".";
      const base = normalizeSegments(dir ? `${dir}/${baseUrl}` : baseUrl) ?? "";
      for (const [pattern, rawTargets] of Object.entries(paths)) {
        if (!Array.isArray(rawTargets) || !rawTargets.every((entry2) => typeof entry2 === "string"))
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
  const text2 = file.textSample.trimStart();
  if (!text2)
    return void 0;
  if (AGENT_COMMAND_PATHS.has(file.path.replace(/\\/g, "/").toLowerCase()) && text2.includes(AGENT_COMMAND_MARKER)) {
    return "agent-command";
  }
  if (text2.startsWith("# FixMap Report\n") && text2.includes("\n## Context Files\n"))
    return "report-markdown";
  if (text2.startsWith("# FixMap Context\n") && text2.includes("\n## Task\n"))
    return "context-markdown";
  if (text2.startsWith("# FixMap Change Scope\n") && text2.includes("\n## Declared anchors\n"))
    return "change-scope-markdown";
  if (text2.startsWith("# FixMap Capability:") && text2.includes("\n## Declared anchors\n"))
    return "capability-map-markdown";
  if (text2.startsWith("# FixMap Capability Diff:") && text2.includes("\n## Selected scope\n"))
    return "capability-history-markdown";
  if (text2.startsWith("# FixMap Capabilities\n"))
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
  if (candidate.contractListVersion === 1 && isRecord2(candidate.inventory))
    return "contract-list-json";
  if (candidate.contractDiffVersion === 1 && isRecord2(candidate.from) && isRecord2(candidate.to) && isRecord2(candidate.comparison)) {
    return "contract-diff-json";
  }
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
function buildImpactMap(repo, requestedSeeds, testRoutes = [], limit = DEFAULT_IMPACT_LIMIT, primaryPaths = [], languageContext) {
  const repositoryPaths = new Set(repo.files.filter((file) => !isFixMapArtifact(file)).map((file) => file.path));
  const seeds = [...new Set(requestedSeeds)].filter((path) => repositoryPaths.has(path)).slice(0, MAX_IMPACT_SEEDS);
  const seedSet = new Set(seeds);
  const candidates = /* @__PURE__ */ new Map();
  const addEvidence = (path, score, evidence) => {
    if (seedSet.has(path) || !repositoryPaths.has(path) || isGeneratedPath(path) || isBackupPath(path))
      return;
    const current2 = candidates.get(path) ?? { path, score: 0, evidence: [] };
    if (!current2.evidence.some((entry2) => entry2.kind === evidence.kind && entry2.seed === evidence.seed)) {
      current2.evidence.push(evidence);
      current2.score += score;
    }
    candidates.set(path, current2);
  };
  const graph = buildImportGraph(repo.files, languageContext);
  const primarySet = new Set(primaryPaths.filter((path) => repositoryPaths.has(path)));
  const primaryImports = [...primarySet].sort((a, b) => a.localeCompare(b)).flatMap((from) => [...graph.imports.get(from) ?? []].filter((to) => to !== from && primarySet.has(to)).sort((a, b) => a.localeCompare(b)).map((to) => ({ from, to })));
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
  for (const route of testRoutes.filter((entry2) => entry2.kind === "test")) {
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
    ...primaryImports.length > 0 ? { primaryImports } : {},
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
  const kinds = new Set(candidate.evidence.map((entry2) => entry2.kind));
  const strongestCoChange = candidate.evidence.filter((entry2) => entry2.kind === "co-change").reduce((best, entry2) => Math.max(best, (entry2.occurrences ?? 0) / Math.max(entry2.seedChanges ?? 1, 1)), 0);
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
function retrievalTokens(text2) {
  const tokens = [];
  for (const raw of text2.match(/[A-Za-z0-9_$]+/g) ?? []) {
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
  return [...new Set(retrievalTokens(task))].filter((term2) => !STOPWORDS.has(term2));
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
  const add2 = (term2, source, rule) => {
    if (term2.length < 3 || STOPWORDS.has(term2) || seen.has(term2))
      return;
    seen.add(term2);
    expansions.push({ term: term2, source, rule });
  };
  for (const source of originalTerms) {
    const aliases = Object.hasOwn(TECHNICAL_ALIASES, source) ? TECHNICAL_ALIASES[source] ?? [] : [];
    for (const alias of aliases)
      add2(alias, source, "technical-alias");
    if (source.endsWith("ies") && source.length > 5)
      add2(`${source.slice(0, -3)}y`, source, "inflection");
    else if (source.endsWith("s") && !source.endsWith("ss") && source.length > 4)
      add2(source.slice(0, -1), source, "inflection");
  }
  return { originalTerms, terms: [...seen], expansions };
}
function rankByBm25Detailed(files, task, limit = 5, eligibleKinds = /* @__PURE__ */ new Set(["code"])) {
  const candidates = files.filter((file) => file.isSource && !file.isTest && eligibleKinds.has(file.kind));
  return rankDocumentsByBm25(candidates.map((file) => ({ id: file.path, text: `${file.path}
${file.searchTextSample ?? file.textSample}` })), task, limit);
}
function rankSymbolsByBm25Detailed(files, task, limit = 50, custom) {
  const units = files.flatMap((file) => {
    const extracted = custom?.supports(file.extension) ? custom.extract(file) : void 0;
    const definitions = extracted ? extracted.status === "ok" ? extracted.facts.definitions : [] : extractLanguageDefinitions(file);
    return definitions.map((definition, index) => {
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
    });
  });
  const ranked = rankDocumentsByBm25(units, task, Math.max(limit * 4, limit));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const seenPaths = /* @__PURE__ */ new Set();
  const hits = [];
  for (const entry2 of ranked) {
    const unit = byId.get(entry2.id);
    if (!unit || seenPaths.has(unit.path))
      continue;
    seenPaths.add(unit.path);
    hits.push({ ...entry2, rank: hits.length + 1, path: unit.path, symbol: unit.symbol, kind: unit.kind });
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
  const documentFrequency = new Map(terms.map((term2) => [term2, 0]));
  const documents = inputs.map((input) => {
    const statistics = bm25DocumentStatistics(input.text, queryTerms);
    for (const term2 of statistics.counts.keys()) {
      documentFrequency.set(term2, (documentFrequency.get(term2) ?? 0) + 1);
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
    for (const term2 of terms) {
      const frequency = document.counts.get(term2) ?? 0;
      if (frequency === 0)
        continue;
      const df = documentFrequency.get(term2) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      score += idf * (frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * document.length / averageLength)));
    }
    if (score > 0)
      insertBoundedBm25(top, { id: document.id, score }, boundedLimit);
  }
  return top.map((entry2, index) => ({ ...entry2, rank: index + 1 }));
}
function insertBoundedBm25(top, entry2, limit) {
  let low = 0;
  let high = top.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (compareBm25(entry2, top[middle]) < 0)
      high = middle;
    else
      low = middle + 1;
  }
  if (low >= limit)
    return;
  top.splice(low, 0, entry2);
  if (top.length > limit)
    top.pop();
}
function compareBm25(left, right) {
  return right.score - left.score || left.id.localeCompare(right.id);
}
function bm25DocumentStatistics(text2, queryTerms) {
  const counts = /* @__PURE__ */ new Map();
  let length = 0;
  const record3 = (token) => {
    length += 1;
    if (queryTerms.has(token))
      counts.set(token, (counts.get(token) ?? 0) + 1);
  };
  for (const match of text2.matchAll(/[A-Za-z0-9_$]+/g)) {
    const raw = match[0];
    const lower = raw.toLowerCase();
    if (lower.length >= 3)
      record3(lower);
    const parts = raw.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter((part) => part.length >= 3);
    if (parts.length > 1)
      for (const part of parts)
        record3(part.toLowerCase());
  }
  return { counts, length };
}

// packages/core/dist/rank.js
function definitionsFor2(file, custom) {
  if (!custom?.supports(file.extension))
    return extractLanguageDefinitions(file);
  const result = custom.extract(file);
  return result.status === "ok" ? result.facts.definitions : [];
}
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
  const symbolCandidates = rankSymbolsByBm25Detailed(eligibleFiles, task, sourceLimit, input.languageContext);
  const symbolFinishedAt = performance.now();
  const structuralRank = new Map(structuralCandidates.map((file, index) => [file.path, index + 1]));
  const lexicalByPath = new Map(lexicalCandidates.map((entry2) => [entry2.id, entry2]));
  const symbolByPath = new Map(symbolCandidates.map((entry2) => [entry2.path, entry2]));
  const union = /* @__PURE__ */ new Set([
    ...structuralCandidates.map((file) => file.path),
    ...lexicalCandidates.map((entry2) => entry2.id),
    ...symbolCandidates.map((entry2) => entry2.path)
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
    },
    diagnostics: structuralResult.diagnostics
  };
}
function rankContextFilesDetailed(repo, input, limit = DEFAULT_CONTEXT_FILE_LIMIT, minScore = REPORT_SCORE_CUTOFF) {
  const exclude = input.exclude ?? NO_EXCLUSIONS;
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const grounding = analyzeTaskGrounding(repo, input, input.languageContext);
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
    const definedIdentifiers = (file.kind === "documentation" ? [] : findDefinedIdentifiers(file, definitionSignals, input.languageContext)).slice(0, MAX_DEFINITION_IDENTIFIERS);
    if (definedIdentifiers.length > 0) {
      score += definedIdentifiers.length * DEFINITION_IDENTIFIER_BOOST;
      reasons.push(`defines task identifiers: ${definedIdentifiers.join(", ")}`);
      if (file.kind === "code" && !file.isTest && !isAuxiliaryCodePath(file.path) && !isTypeDeclarationPath(file.path) && !file.path.toLowerCase().startsWith("benchmarks/")) {
        score += 4;
        reasons.push("task identifier is defined in maintained implementation source");
      }
    }
    const taskMatchedDefinitions = signals.exactFragments.length === 0 && !taskTargetsDocumentation ? (file.kind === "documentation" ? [] : findTaskMatchedDefinitions(file, taskTokens, input.languageContext)).filter((identifier) => !definedIdentifiers.includes(identifier)).slice(0, MAX_DEFINITION_IDENTIFIERS) : [];
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
    const isDeploymentConfig = file.path === "package.json" || DEPLOYMENT_TERMS.some((term2) => [...tokenizeText(term2)].some((token) => pathTokens.has(token)));
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
  const diagnostics = applyImportProximity(scored, repo, input.languageContext);
  const candidates = scored.filter((file) => file.score >= minScore).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const ranking = buildRankingShape(candidates);
  const clustered = ranking.clustered;
  const leadIsContested = hasContestedLead(candidates);
  const ranked = candidates.slice(0, limit);
  const contextFiles = ranked.map((entry2, position) => ({
    rank: position + 1,
    path: entry2.path,
    score: entry2.score,
    confidence: confidenceForEntry(entry2, grounding, clustered, {
      position,
      topScore: candidates[0]?.score ?? entry2.score,
      leadIsContested,
      issueIsVague: isVagueTaskText(input.issueText ?? "")
    }),
    reasons: entry2.reasons.length > 0 ? entry2.reasons : ["source file baseline"]
  }));
  return { contextFiles, ranking, diagnostics };
}
function hasContestedLead(ranked) {
  const leader = ranked[0];
  if (!leader || hasDefinitionEvidence(leader)) {
    return false;
  }
  return ranked.slice(1).some((entry2) => hasDefinitionEvidence(entry2));
}
function hasDefinitionEvidence(entry2) {
  return entry2.reasons.some((reason2) => reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
}
function applyImportProximity(scored, repo, custom) {
  const directSeeds = scored.filter((entry2) => entry2.score >= 8 && hasDirectEvidence(entry2)).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, MAX_PROXIMITY_SEEDS);
  const seedEntries = directSeeds.length > 0 ? directSeeds : scored.filter((entry2) => entry2.score >= 8).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 2);
  if (seedEntries.length === 0) {
    return [];
  }
  const seeds = seedEntries.map((entry2) => entry2.path);
  const seedScores = new Map(seedEntries.map((entry2) => [entry2.path, entry2.score]));
  const graph = buildImportGraph(repo.files, custom);
  const diagnostics = [];
  if ((graph.truncatedFiles > 0 || graph.truncatedEdges > 0) && !repo.diagnostics.some((entry2) => entry2.code === "import-graph-truncated")) {
    diagnostics.push({
      code: "import-graph-truncated",
      severity: "info",
      message: `Import proximity was bounded: ${graph.truncatedFiles.toLocaleString()} parseable files and ${graph.truncatedEdges.toLocaleString()} high-fanout files were not fully traversed. Ranking still uses path and content evidence.`
    });
  }
  const proximity = findImportProximity(graph, seeds);
  for (const entry2 of scored) {
    const hit = proximity.get(entry2.path);
    if (hit) {
      const seedScore = seedScores.get(hit.seed);
      const availableBoost = seedScore === void 0 ? 0 : Math.max(0, seedScore - entry2.score - 1);
      const boost = Math.min(IMPORT_PROXIMITY_BOOSTS[hit.distance], availableBoost);
      if (boost === 0) {
        continue;
      }
      entry2.score += boost;
      entry2.reasons.push(proximityReason(hit));
    }
  }
  return diagnostics;
}
function proximityReason(hit) {
  if (hit.distance === 2) {
    return `within two import hops of ranked file ${hit.seed}`;
  }
  return hit.direction === "imported-by" ? `imported by ranked file ${hit.seed}` : `imports ranked file ${hit.seed}`;
}
function confidenceForEntry(entry2, grounding, clustered, shape) {
  const hasMaintainedSourceTwin = entry2.reasons.includes(GENERATED_TWIN_REASON);
  if (entry2.reasons.includes("explicitly named in the task") && shape.position === 0 && !shape.leadIsContested && !hasMaintainedSourceTwin) {
    return "high";
  }
  let confidence = entry2.score >= 14 ? "high" : entry2.score >= 8 ? "medium" : "low";
  const leads = shape.position === 0 || entry2.score >= shape.topScore - HIGH_CONFIDENCE_MARGIN;
  if (!leads && !hasDirectEvidence(entry2)) {
    confidence = capConfidence(confidence, "medium");
  }
  if (shape.position === 0 && shape.leadIsContested) {
    confidence = capConfidence(confidence, "medium");
  }
  if (hasMaintainedSourceTwin) {
    confidence = capConfidence(confidence, "medium");
  }
  if (!hasDirectEvidence(entry2)) {
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
  if (clustered && !hasDirectEvidence(entry2)) {
    confidence = capConfidence(confidence, "medium");
  }
  return confidence;
}
function capConfidence(confidence, maximum) {
  const levels = ["low", "medium", "high"];
  return levels.indexOf(confidence) > levels.indexOf(maximum) ? maximum : confidence;
}
function hasDirectEvidence(entry2) {
  return entry2.isChanged || entry2.reasons.some((reason2) => reason2 === "explicitly named in the task" || reason2.startsWith("defines task identifiers:") || reason2.startsWith("exact task literal at definition:"));
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
function isInteractivePresentation(text2) {
  return /<(?:button|form|input|select|textarea)\b|\bon(?:Change|Click|Input|Submit)\s*=|\buseState\s*\(/.test(text2);
}
function tokenizeFileContent(text2, regexTokens) {
  const tokens = tokenizeText(text2);
  for (const token of regexTokens)
    tokens.add(token);
  return tokens;
}
function taskTokensInFile(text2, taskTokens, regexTokens) {
  const regexOverlap = [...regexTokens].some((token) => taskTokens.has(token));
  if (!regexOverlap && !mightContainTaskToken(text2, taskTokens))
    return /* @__PURE__ */ new Set();
  const tokens = tokenizeFileContent(text2, regexTokens);
  return new Set([...tokens].filter((token) => taskTokens.has(token)));
}
function mightContainTaskToken(text2, taskTokens) {
  const lower = text2.toLowerCase();
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
function extractRegexTokens(text2) {
  const tokens = /* @__PURE__ */ new Set();
  for (const match of text2.matchAll(/\b([A-Za-z])\{(\d+),(\d+)\}/g)) {
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
function findDefinedIdentifiers(file, signals, custom) {
  const adapterDefinitions = new Set(definitionsFor2(file, custom).map((entry2) => entry2.name));
  return signals.filter((signal) => adapterDefinitions.has(signal.identifier) || !custom?.supports(file.extension) && signal.pattern.test(rankingText(file))).map((signal) => signal.identifier);
}
function exactIdentifierPattern(identifier) {
  return new RegExp(`(?<![\\p{L}\\p{N}_$])${escapeRegExp2(identifier)}(?![\\p{L}\\p{N}_$])`, "u");
}
function findTaskMatchedDefinitions(file, taskTokens, custom) {
  const definitions = new Set(definitionsFor2(file, custom).map((entry2) => entry2.name));
  const pattern = /(?<![\p{L}\p{N}_$])(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\s+)([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;
  for (const match of custom?.supports(file.extension) ? [] : rankingText(file).matchAll(pattern)) {
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
function hasExactFragmentAtDefinition(text2, fragment, definedIdentifiers) {
  let index = text2.indexOf(fragment);
  while (index !== -1) {
    const prefix = text2.slice(Math.max(0, index - 240), index);
    const namesNearby = definedIdentifiers.some((identifier) => prefix.includes(identifier));
    const assignmentNearby = /\b(?:const|let|var)\s+[$A-Za-z_][$A-Za-z0-9_]*(?:\s*:[^=\r\n]+)?\s*=\s*[/("'`]?\s*$/.test(prefix);
    if (namesNearby || assignmentNearby) {
      return true;
    }
    index = text2.indexOf(fragment, index + fragment.length);
  }
  return false;
}
function previewFragment(fragment) {
  return fragment.length <= 40 ? fragment : `${fragment.slice(0, 37)}...`;
}
function escapeRegExp2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countOccurrences(text2, value) {
  if (!value) {
    return 0;
  }
  return text2.split(value).length - 1;
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
  return new Set([...frequency].filter(([, count3]) => count3 >= threshold).map(([token]) => token));
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

// packages/core/dist/sensitive-data.js
var MAX_ANALYZED_FILES = 5e3;
var MAX_RELATIONSHIPS = 1e4;
var SENSITIVE_DATA_PROVIDER_ID = "fixmap-sensitive-data";
var SENSITIVE_DATA_PROVIDER_VERSION = "1.0.0";
var PROVIDER_VERSION = SENSITIVE_DATA_PROVIDER_VERSION;
var SOURCE_RULES = [
  { id: "credential-password", category: "credential", pattern: /\b(?:password|passwd|credential|client[_-]?secret|api[_-]?key)\b/i },
  { id: "token-auth", category: "token", pattern: /\b(?:access[_-]?token|refresh[_-]?token|bearer|authorization|jwt)\b/i },
  { id: "pii-contact", category: "pii", pattern: /\b(?:email[_-]?address|phone[_-]?number|date[_-]?of[_-]?birth|social[_-]?security|ssn)\b/i },
  { id: "payment-card", category: "payment", pattern: /\b(?:card[_-]?number|payment[_-]?method|cvv|cvc|iban)\b/i }
];
var SINK_RULES = [
  { id: "sink-log", category: "logging", pattern: /\b(?:console\.(?:log|info|warn|error)|logger\.(?:debug|info|warn|error)|logging\.(?:debug|info|warning|error))\s*\(/i },
  { id: "sink-network", category: "network", pattern: /\b(?:fetch|axios\.(?:get|post|put|patch)|requests\.(?:get|post|put|patch)|httpClient\.(?:get|post|put|patch)|sendRequest)\s*\(/i },
  { id: "sink-storage", category: "storage", pattern: /\b(?:writeFile|localStorage\.setItem|sessionStorage\.setItem|\.save|\.persist|INSERT\s+INTO|UPDATE\s+[^\s]+\s+SET)\b/i },
  { id: "sink-analytics", category: "analytics", pattern: /\b(?:analytics\.(?:track|identify)|telemetry\.(?:track|capture)|captureEvent|trackEvent)\s*\(/i }
];
function collectSensitiveDataSignals(repo) {
  const codeFiles = repo.files.filter((file) => file.kind === "code");
  const eligible = codeFiles.filter((file) => file.textSampleComplete !== false && file.contentFingerprint);
  const selected = eligible.slice(0, MAX_ANALYZED_FILES);
  const classified = selected.map(classifyFile).filter((entry2) => entry2.sources.length > 0 || entry2.sinks.length > 0);
  const exact = classified;
  const skippedFiles = codeFiles.length - selected.length;
  const items = [scopeItem(repo.root, selected.length, skippedFiles)];
  const itemId = /* @__PURE__ */ new Map();
  for (const entry2 of exact) {
    for (const category of entry2.sources) {
      const id = stableId("source", category, entry2.file.path);
      itemId.set(key(entry2.file.path, "source", category), id);
      items.push(fileItem(id, entry2.file, "source", category));
    }
    for (const category of entry2.sinks) {
      const id = stableId("sink", category, entry2.file.path);
      itemId.set(key(entry2.file.path, "sink", category), id);
      items.push(fileItem(id, entry2.file, "sink", category));
    }
  }
  const relationships = [];
  const relationshipIds = /* @__PURE__ */ new Set();
  for (const entry2 of exact) {
    for (const source of entry2.sources)
      for (const sink of entry2.sinks) {
        pushRelationship(relationships, relationshipIds, {
          from: itemId.get(key(entry2.file.path, "source", source)),
          to: itemId.get(key(entry2.file.path, "sink", sink)),
          relation: "same-file-sensitive-signal-and-sink",
          reason: `${entry2.file.path} contains both ${source} vocabulary and a ${sink} call pattern; value flow was not verified.`
        });
      }
  }
  const graph = buildImportGraph(repo.files);
  const byPath = new Map(exact.map((entry2) => [entry2.file.path, entry2]));
  for (const [fromPath, targets] of graph.imports) {
    const from = byPath.get(fromPath);
    if (!from)
      continue;
    for (const toPath of targets) {
      const to = byPath.get(toPath);
      if (!to)
        continue;
      connectAcrossImport(relationships, relationshipIds, itemId, from, to);
      connectAcrossImport(relationships, relationshipIds, itemId, to, from);
    }
  }
  return {
    items: items.sort((a, b) => a.id.localeCompare(b.id)),
    relationships: relationships.slice(0, MAX_RELATIONSHIPS).sort((a, b) => a.id.localeCompare(b.id))
  };
}
function sensitiveSignalLine(text2, ruleIds) {
  const rules = [...SOURCE_RULES, ...SINK_RULES].filter((rule) => ruleIds.includes(rule.id));
  if (rules.length === 0)
    return void 0;
  const lines = text2.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (rules.some((rule) => rule.pattern.test(lines[index])))
      return index + 1;
  }
  return void 0;
}
function classifyFile(file) {
  return {
    file,
    sources: categories(file.textSample, SOURCE_RULES),
    sinks: categories(file.textSample, SINK_RULES)
  };
}
function categories(text2, rules) {
  return [...new Set(rules.filter((rule) => rule.pattern.test(text2)).map((rule) => rule.category))].sort();
}
function scopeItem(repository, scannedFiles, skippedFiles) {
  return {
    id: "scope",
    kind: "security",
    summary: "Approximate sensitive-data indicators from local lexical and import-structure analysis; this is not a complete security or taint-flow proof.",
    confidence: "low",
    subjects: [{ kind: "repository", repository }],
    metadata: {
      analysis: "lexical-signals-and-direct-import-structure",
      completeness: "not-a-security-proof",
      scannedFiles,
      skippedFiles
    }
  };
}
function fileItem(id, file, role, category) {
  const rules = role === "source" ? SOURCE_RULES : SINK_RULES;
  const matchedRuleIds = rules.filter((rule) => rule.category === category && rule.pattern.test(file.textSample)).map((rule) => rule.id).join(",");
  return {
    id,
    kind: "security",
    summary: `Possible sensitive-data ${role} indicator (${category}) in ${file.path}; lexical evidence only.`,
    confidence: "low",
    subjects: [{ kind: "file", path: file.path }],
    metadata: {
      role,
      category,
      matchedRuleIds,
      sourceFingerprint: file.contentFingerprint,
      detectorVersion: PROVIDER_VERSION,
      completeness: "not-a-security-proof"
    }
  };
}
function connectAcrossImport(relationships, relationshipIds, ids, sourceEntry, sinkEntry) {
  for (const source of sourceEntry.sources)
    for (const sink of sinkEntry.sinks) {
      pushRelationship(relationships, relationshipIds, {
        from: ids.get(key(sourceEntry.file.path, "source", source)),
        to: ids.get(key(sinkEntry.file.path, "sink", sink)),
        relation: "structurally-connected-sensitive-signal",
        reason: `${sourceEntry.file.path} and ${sinkEntry.file.path} are directly import-connected; runtime data transfer was not verified.`
      });
    }
}
function pushRelationship(relationships, relationshipIds, input) {
  if (relationships.length >= MAX_RELATIONSHIPS)
    return;
  const id = stableId(input.relation, input.from, input.to);
  if (relationshipIds.has(id))
    return;
  relationshipIds.add(id);
  relationships.push({ id, ...input, confidence: "low" });
}
function key(path, role, category) {
  return `${path}\0${role}\0${category}`;
}
function stableId(...values) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(values.join("\0"))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `signal-${hash.toString(16).padStart(16, "0")}`;
}

// packages/core/dist/report-sensitive-data.js
var MAX_REPORT_SENSITIVE_DATA_FLOWS = 50;
var SOURCE_CATEGORIES = ["credential", "token", "pii", "payment"];
var SINK_CATEGORIES = ["logging", "network", "storage", "analytics"];
var RULE_ID = /^[a-z0-9-]{1,64}$/;
function buildReportSensitiveData(repo, focusPaths, options = {}) {
  const after = flowsFrom(repo.root, repo.files);
  let introducedCheck;
  let before;
  if (options.compareWithDiff) {
    const previousFiles = filesBeforeDiff(repo);
    introducedCheck = previousFiles ? "compared-with-diff" : "unavailable-diff-truncated";
    if (previousFiles)
      before = new Set(flowsFrom(repo.root, previousFiles).flows.map(flowKey));
  }
  const relevant = after.flows.filter((flow) => focusPaths.has(flow.source.path) || focusPaths.has(flow.sink.path)).map((flow) => before && !before.has(flowKey(flow)) ? { ...flow, introducedByDiff: true } : flow).sort((a, b) => Number(b.introducedByDiff === true) - Number(a.introducedByDiff === true) || a.relation.localeCompare(b.relation) || flowKey(a).localeCompare(flowKey(b)));
  const textByPath = new Map(repo.files.map((file) => [file.path, file.textSample]));
  const withLine = (end) => {
    const line = sensitiveSignalLine(textByPath.get(end.path) ?? "", end.ruleIds);
    return line === void 0 ? end : { ...end, line };
  };
  const flows = relevant.slice(0, MAX_REPORT_SENSITIVE_DATA_FLOWS).map((flow) => ({ ...flow, source: withLine(flow.source), sink: withLine(flow.sink) }));
  return {
    sensitiveDataVersion: 1,
    provider: { id: SENSITIVE_DATA_PROVIDER_ID, version: SENSITIVE_DATA_PROVIDER_VERSION },
    analysis: "lexical-signals-and-direct-import-structure",
    completeness: "not-a-security-proof",
    scannedFiles: after.scannedFiles,
    skippedFiles: after.skippedFiles,
    flows,
    omittedFlows: relevant.length - flows.length,
    ...introducedCheck ? { introducedCheck } : {}
  };
}
function sensitiveDataVerifyFinding(evidence) {
  const introduced = evidence.flows.filter((flow) => flow.introducedByDiff);
  if (introduced.length === 0)
    return void 0;
  const paths = [...new Set(introduced.flatMap((flow) => [flow.source.path, flow.sink.path]))];
  const examples = introduced.slice(0, 3).map(describeFlow).join("; ");
  return {
    code: "sensitive-data-flow-introduced",
    severity: "info",
    paths: paths.slice(0, 8),
    message: `This diff adds ${introduced.length === 1 ? "a possible sensitive-data flow" : `${introduced.length} possible sensitive-data flows`} from lexical evidence (${examples}${introduced.length > 3 ? "; \u2026" : ""}). Value flow was not verified; check that no secret or personal data reaches the sink.`
  };
}
function renderSensitiveDataMarkdown(evidence) {
  return [
    "",
    "## Sensitive Data",
    "",
    `Lexical indicators from \`${evidence.provider.id}\` ${evidence.provider.version} across ${evidence.scannedFiles} scanned file${evidence.scannedFiles === 1 ? "" : "s"}${evidence.skippedFiles > 0 ? ` (${evidence.skippedFiles} skipped)` : ""}. Locations and kinds only; matched values are not shown. This is not a taint analysis or a security proof.`,
    ...evidence.introducedCheck === "unavailable-diff-truncated" ? ["", "The diff was too large to reconstruct pre-change contents, so newly introduced flows could not be identified."] : [],
    "",
    ...evidence.flows.length > 0 ? evidence.flows.map((flow) => `- ${flow.introducedByDiff ? "**new** " : ""}${describeFlow(flow)}`) : ["- No possible source-to-sink flows touch the files in this report."],
    ...evidence.omittedFlows > 0 ? ["", `${evidence.omittedFlows} further flow${evidence.omittedFlows === 1 ? " was" : "s were"} not listed.`] : []
  ];
}
function isReportSensitiveData(candidate) {
  if (!isRecord3(candidate) || candidate.sensitiveDataVersion !== 1 || !isRecord3(candidate.provider) || candidate.provider.id !== SENSITIVE_DATA_PROVIDER_ID || typeof candidate.provider.version !== "string" || candidate.analysis !== "lexical-signals-and-direct-import-structure" || candidate.completeness !== "not-a-security-proof" || !count(candidate.scannedFiles) || !count(candidate.skippedFiles) || !count(candidate.omittedFlows) || candidate.introducedCheck !== void 0 && !["compared-with-diff", "unavailable-diff-truncated"].includes(String(candidate.introducedCheck)) || !Array.isArray(candidate.flows) || candidate.flows.length > MAX_REPORT_SENSITIVE_DATA_FLOWS)
    return false;
  return candidate.flows.every((flow) => isRecord3(flow) && (flow.relation === "same-file" || flow.relation === "direct-import") && (flow.introducedByDiff === void 0 || flow.introducedByDiff === true) && validEnd(flow.source, SOURCE_CATEGORIES) && validEnd(flow.sink, SINK_CATEGORIES) && (flow.relation !== "same-file" || flow.source.path === flow.sink.path));
}
function validEnd(candidate, categories2) {
  return isRecord3(candidate) && isRepositoryRelativePath(candidate.path) && categories2.includes(String(candidate.category)) && Array.isArray(candidate.ruleIds) && candidate.ruleIds.length > 0 && candidate.ruleIds.length <= 8 && candidate.ruleIds.every((id) => typeof id === "string" && RULE_ID.test(id)) && (candidate.line === void 0 || Number.isSafeInteger(candidate.line) && candidate.line > 0);
}
function describeFlow(flow) {
  const at = (end) => markdownCode(end.line ? `${end.path}:${end.line}` : end.path);
  return flow.relation === "same-file" ? `${flow.source.category} \u2192 ${flow.sink.category} in ${at(flow.source)} and ${at(flow.sink)} (same file)` : `${flow.source.category} in ${at(flow.source)} \u2192 ${flow.sink.category} in ${at(flow.sink)} (direct import)`;
}
function flowsFrom(root, files) {
  const result = collectSensitiveDataSignals({ root, files: [...files] });
  const signals = /* @__PURE__ */ new Map();
  let scannedFiles = 0;
  let skippedFiles = 0;
  for (const item of result.items) {
    const metadata = item.metadata ?? {};
    if (item.id === "scope") {
      scannedFiles = Number(metadata.scannedFiles) || 0;
      skippedFiles = Number(metadata.skippedFiles) || 0;
      continue;
    }
    const subject = item.subjects[0];
    if (!subject || subject.kind !== "file")
      continue;
    signals.set(item.id, {
      path: subject.path,
      role: metadata.role === "sink" ? "sink" : "source",
      category: String(metadata.category),
      ruleIds: String(metadata.matchedRuleIds ?? "").split(",").filter(Boolean)
    });
  }
  const flows = [];
  for (const relationship of result.relationships ?? []) {
    const source = signals.get(relationship.from);
    const sink = signals.get(relationship.to);
    if (!source || !sink)
      continue;
    flows.push({
      relation: relationship.relation === "same-file-sensitive-signal-and-sink" ? "same-file" : "direct-import",
      source: { path: source.path, category: source.category, ruleIds: source.ruleIds },
      sink: { path: sink.path, category: sink.category, ruleIds: sink.ruleIds }
    });
  }
  return { flows, scannedFiles, skippedFiles };
}
function flowKey(flow) {
  return [flow.relation, flow.source.path, flow.source.category, flow.sink.path, flow.sink.category].join("\0");
}
function filesBeforeDiff(repo) {
  if (repo.diagnostics.some((diagnostic) => diagnostic.code === "diff-text-truncated"))
    return void 0;
  const patches = parseUnifiedDiff(repo.diffText);
  const changed = new Set(repo.changedFiles);
  const tracked = repo.trackedFiles ? new Set(repo.trackedFiles) : void 0;
  return repo.files.flatMap((file) => {
    if (!changed.has(file.path))
      return [file];
    const patch = patches.get(file.path);
    if (!patch)
      return tracked && !tracked.has(file.path) ? [] : [file];
    if (patch.created)
      return [];
    const lines = file.textSample.split(/\r?\n/);
    for (const added of patch.added) {
      const index = lines.indexOf(added);
      if (index !== -1)
        lines.splice(index, 1);
    }
    return [{ ...file, textSample: [...lines, ...patch.removed].join("\n") }];
  });
}
function parseUnifiedDiff(diffText) {
  const patches = /* @__PURE__ */ new Map();
  let current2;
  let created = false;
  let inHunk = false;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current2 = void 0;
      created = false;
      inHunk = false;
    } else if (!inHunk && line.startsWith("--- ")) {
      created = line === "--- /dev/null";
    } else if (!inHunk && line.startsWith("+++ ")) {
      const path = diffPath(line.slice(4));
      current2 = path ? { added: [], removed: [], created } : void 0;
      if (path && current2)
        patches.set(path, current2);
    } else if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && current2) {
      if (line.startsWith("+"))
        current2.added.push(line.slice(1));
      else if (line.startsWith("-"))
        current2.removed.push(line.slice(1));
    }
  }
  return patches;
}
function diffPath(raw) {
  if (raw === "/dev/null")
    return void 0;
  let path = raw.replace(/\t.*$/, "");
  if (path.startsWith('"')) {
    try {
      path = JSON.parse(path);
    } catch {
      return void 0;
    }
  }
  return path.replace(/^[a-z]\//, "");
}
function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/dist/report-supply-chain.js
var MAX_REPORT_SUPPLY_CHAIN_FINDINGS = 50;
var SEVERITIES = ["critical", "high", "medium", "low", "info", "unknown"];
function buildReportSupplyChain(bundle, documentSha256, focusPaths) {
  const components = new Map(bundle.components.map((component) => [component.id, component]));
  const relevant = [];
  for (const finding of bundle.findings) {
    const component = components.get(finding.componentId);
    const manifestPaths = component?.paths.filter((path) => focusPaths.has(path)) ?? [];
    if (!component || manifestPaths.length === 0)
      continue;
    relevant.push({
      id: finding.id,
      kind: finding.kind,
      severity: finding.severity,
      confidence: finding.confidence,
      summary: finding.summary,
      package: {
        name: component.name,
        ...component.version ? { version: component.version } : {},
        ...component.purl ? { purl: component.purl } : {}
      },
      manifestPaths,
      ...finding.advisoryId ? { advisoryId: finding.advisoryId } : {},
      ...finding.fixedVersion ? { fixedVersion: finding.fixedVersion } : {},
      ...finding.licenseId ? { licenseId: finding.licenseId } : {},
      ...finding.policy ? { policy: finding.policy } : {},
      ...finding.sourceUrl ? { sourceUrl: finding.sourceUrl } : {}
    });
  }
  const findings = relevant.slice(0, MAX_REPORT_SUPPLY_CHAIN_FINDINGS);
  return {
    supplyChainVersion: 1,
    source: {
      tool: bundle.source.tool,
      toolVersion: bundle.source.toolVersion,
      ...bundle.source.databaseVersion ? { databaseVersion: bundle.source.databaseVersion } : {},
      documentFingerprint: bundle.source.documentFingerprint,
      generatedAt: bundle.generatedAt,
      documentSha256
    },
    findings,
    omittedFindings: bundle.findings.length - findings.length
  };
}
function renderSupplyChainReportMarkdown(evidence) {
  const { source } = evidence;
  return [
    "",
    "## Supply-Chain Evidence",
    "",
    `Imported from ${markdownCode(source.tool)} ${inlineProse(source.toolVersion)}${source.databaseVersion ? `, database ${inlineProse(source.databaseVersion)}` : ""}, generated ${source.generatedAt} (bundle sha256 ${markdownCode(source.documentSha256)}). Findings are shown as supplied; FixMap did not fetch advisories, run a scanner, or verify exploitability.`,
    "",
    ...evidence.findings.length > 0 ? evidence.findings.map((finding) => {
      const details = [
        finding.advisoryId && `advisory ${markdownCode(finding.advisoryId)}`,
        finding.fixedVersion && `fixed in ${markdownCode(finding.fixedVersion)}`,
        finding.licenseId && `license ${markdownCode(finding.licenseId)}`,
        finding.policy && `policy ${inlineProse(finding.policy)}`
      ].filter(Boolean).join("; ");
      const name = `${finding.package.name}${finding.package.version ? `@${finding.package.version}` : ""}`;
      return `- **${finding.severity}** ${finding.kind} for ${markdownCode(name)} declared in ${finding.manifestPaths.map(markdownCode).join(", ")}: ${inlineProse(finding.summary)}${details ? ` (${details})` : ""}`;
    }) : ["- No imported findings are for packages declared in manifests among this report's files."],
    ...evidence.omittedFindings > 0 ? ["", `${evidence.omittedFindings} further finding${evidence.omittedFindings === 1 ? " was" : "s were"} for manifests outside this report or over the listing limit.`] : []
  ];
}
function isReportSupplyChain(candidate) {
  if (!isRecord4(candidate) || candidate.supplyChainVersion !== 1 || !isRecord4(candidate.source))
    return false;
  const source = candidate.source;
  if (!text(source.tool, 100) || !text(source.toolVersion, 100) || !optionalText(source.databaseVersion, 200) || typeof source.documentFingerprint !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.documentFingerprint) || typeof source.generatedAt !== "string" || !Number.isFinite(Date.parse(source.generatedAt)) || typeof source.documentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.documentSha256) || !Number.isSafeInteger(candidate.omittedFindings) || candidate.omittedFindings < 0 || !Array.isArray(candidate.findings) || candidate.findings.length > MAX_REPORT_SUPPLY_CHAIN_FINDINGS)
    return false;
  return candidate.findings.every((finding) => isRecord4(finding) && text(finding.id, 80) && ["vulnerability", "outdated-version", "license-policy"].includes(String(finding.kind)) && SEVERITIES.includes(String(finding.severity)) && ["low", "medium", "high"].includes(String(finding.confidence)) && text(finding.summary, 1e3) && isRecord4(finding.package) && text(finding.package.name, 300) && optionalText(finding.package.version, 300) && (finding.package.purl === void 0 || typeof finding.package.purl === "string" && finding.package.purl.startsWith("pkg:")) && Array.isArray(finding.manifestPaths) && finding.manifestPaths.length > 0 && finding.manifestPaths.every(isRepositoryRelativePath) && optionalText(finding.advisoryId, 300) && optionalText(finding.fixedVersion, 300) && optionalText(finding.licenseId, 200) && optionalText(finding.policy, 500) && (finding.sourceUrl === void 0 || typeof finding.sourceUrl === "string" && finding.sourceUrl.startsWith("https://")));
}
function text(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function optionalText(value, max) {
  return value === void 0 || text(value, max);
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/dist/text.js
var DIAGNOSTIC_TERM_LIMIT = 48;
var DIAGNOSTIC_SPEC_LIMIT = 80;
function stripByteOrderMark(value) {
  return value.replace(/^\uFEFF/, "");
}
function truncateForDiagnostic(value, limit) {
  if (value.length <= limit)
    return value;
  let end = Math.max(0, limit);
  const last = value.charCodeAt(end - 1);
  const next = value.charCodeAt(end);
  if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343)
    end -= 1;
  return `${value.slice(0, end)}\u2026`;
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
  const detailed = rankContextFilesEvidenceDetailed(repo, { ...input, exclude: options.exclude, ...options.languageContext ? { languageContext: options.languageContext } : {} }, Number.MAX_SAFE_INTEGER, options.minStructuralScore ?? Number.NEGATIVE_INFINITY);
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
        })).filter((entry2) => entry2.similarity > 0).sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path));
        semanticScores.forEach((entry2, index) => {
          const signal = signals.get(entry2.path) ?? {};
          signal.semanticRank = index + 1;
          signal.semanticSimilarity = round(entry2.similarity, 6);
          signals.set(entry2.path, signal);
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
    structuralDiagnostics: detailed.diagnostics,
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
function emptyAnnotationStore() {
  return { annotationStoreVersion: 1, annotations: [] };
}
function createAnnotation(input) {
  const normalized = normalizeAnnotationInput(input);
  return {
    id: `annotation:${stableHash(canonicalize(normalized))}`,
    ...normalized
  };
}
function addAnnotation(store, annotation) {
  const validated = validateAnnotationStore(store);
  validateAnnotation(annotation);
  if (validated.annotations.some((entry2) => entry2.id === annotation.id)) {
    throw new Error(`Annotation ${annotation.id} already exists.`);
  }
  const semanticDuplicate = validated.annotations.find((entry2) => canonicalize(entry2.scope) === canonicalize(annotation.scope) && entry2.note === annotation.note && entry2.expiresAt === annotation.expiresAt);
  if (semanticDuplicate)
    throw new Error(`An equivalent annotation already exists as ${semanticDuplicate.id}.`);
  return validateAnnotationStore({
    annotationStoreVersion: 1,
    annotations: [...validated.annotations, copyAnnotation(annotation)]
  });
}
function removeAnnotation(store, id) {
  const validated = validateAnnotationStore(store);
  if (!ID.test(id))
    throw new Error(`Invalid annotation ID: ${id}`);
  const annotations = validated.annotations.filter((annotation) => annotation.id !== id);
  if (annotations.length === validated.annotations.length)
    throw new Error(`Annotation ${id} does not exist.`);
  return { annotationStoreVersion: 1, annotations };
}
function validateAnnotationStore(candidate) {
  if (!isRecord5(candidate) || candidate.annotationStoreVersion !== 1 || !Array.isArray(candidate.annotations)) {
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
  const renames = new Map((options.renames ?? []).map((rename4) => {
    const from = validateRelativePath(rename4.from, "rename source");
    const to = validateRelativePath(rename4.to, "rename target");
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
  if (!isRecord5(candidate) || typeof candidate.id !== "string" || !ID.test(candidate.id) || typeof candidate.note !== "string" || typeof candidate.createdAt !== "string") {
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
  if (!isRecord5(candidate) || typeof candidate.kind !== "string")
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
  const parsed2 = Date.parse(value);
  if (!Number.isFinite(parsed2))
    throw new Error(`Invalid ${label}: ${value}`);
  return parsed2;
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
    return `{${Object.entries(value).filter(([, entry2]) => entry2 !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key2, entry2]) => `${JSON.stringify(key2)}:${canonicalize(entry2)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function isRecord5(value) {
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
    let result;
    try {
      result = parseDecisionRecord({
        path: file.path,
        content: file.textSample,
        fingerprint: file.contentFingerprint,
        knownPaths
      });
    } catch {
      diagnostics.push({
        code: "decision-parse-failed",
        severity: "warning",
        path: file.path,
        message: `${file.path} was not treated as human intent because its metadata, targets, or prose failed decision-record validation.`
      });
      continue;
    }
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
  return inventory.records.filter((record3) => record3.targets.some((target) => target.kind === "file" && paths.has(target.path) || target.kind === "symbol" && Boolean(target.path && paths.has(target.path)) || (target.kind === "service" || target.kind === "contract") && containsLiteralTerm(task, target.name)) || titleTerms(record3.title).some((term2) => containsLiteralTerm(task, term2)));
}
function parseDecisionRecord(input) {
  const path = validatePath(input.path);
  if (!input.fingerprint.trim() || /[\0-\x20]/.test(input.fingerprint))
    throw new Error(`Invalid decision fingerprint for ${path}.`);
  if (path.toLowerCase().endsWith(".json")) {
    const document = JSON.parse(input.content);
    if (!document || typeof document !== "object" || Array.isArray(document))
      throw new Error("Invalid local PR description export.");
    const exported = document;
    if (typeof exported.title !== "string" || typeof exported.body !== "string" || !isDecisionPullRequestUrl(exported.url) || exported.fixmapAppliesTo !== void 0 && typeof exported.fixmapAppliesTo !== "string")
      throw new Error("Invalid local PR description export.");
    normalizeProse(exported.body, 8e3);
    return { record: {
      id: `decision:${stableHash2(path)}`,
      path,
      title: normalizeProse(exported.title, 300),
      status: "unknown",
      decision: exported.body,
      targets: normalizeTargets([
        ...parseExplicitTargets(exported.fixmapAppliesTo ?? ""),
        ...literalPathTargets(exported.body, input.knownPaths ?? /* @__PURE__ */ new Set())
      ]),
      supersedes: [],
      sourceFingerprint: input.fingerprint,
      source: { kind: "pull-request", url: exported.url, verification: "unverified-local-attribution" }
    } };
  }
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
  const heading = documentHeadings(body).find((entry2) => entry2.level === 1);
  const titleDate = heading ? /^\s*Date:[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*(?:\r?\n|$)/i.exec(body.slice(heading.end))?.[1] : void 0;
  const date = normalizeDate(frontmatter.date ?? section(sections, ["date"]) ?? titleDate);
  const dependencyRules = parseDependencyRules(frontmatter["fixmap-deny-imports"]);
  const sourceUrl = frontmatter["fixmap-source-pr"];
  if (sourceUrl !== void 0 && !isDecisionPullRequestUrl(sourceUrl))
    throw new Error("Invalid decision pull-request source.");
  return {
    record: {
      id: `decision:${stableHash2(path)}`,
      path,
      title: normalizeProse(title, 300),
      status: normalizeStatus(statusText),
      ...statusText ? { authoredStatus: normalizeProse(statusText, 500) } : {},
      ...date ? { date } : {},
      ...context ? { context: normalizeProse(context, 8e3) } : {},
      decision: normalizeProse(decision, 8e3),
      ...consequences ? { consequences: normalizeProse(consequences, 8e3) } : {},
      targets,
      supersedes: parseReferences(supersedesText),
      ...dependencyRules.length > 0 ? { dependencyRules } : {},
      sourceFingerprint: input.fingerprint,
      ...sourceUrl ? { source: { kind: "pull-request", url: sourceUrl, verification: "unverified-local-attribution" } } : {}
    }
  };
}
function isDecisionPullRequestUrl(value) {
  return typeof value === "string" && value.length <= 500 && /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(value) && !value.split("/").some((part) => part === "." || part === "..");
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
  const matches = documentHeadings(body);
  for (const [index, match] of matches.entries()) {
    if (match.level < 2)
      continue;
    const title = match.title.toLowerCase();
    const start = match.end;
    const end = matches.slice(index + 1).find((next) => next.level <= match.level)?.start ?? body.length;
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
  return documentHeadings(body).find((heading) => heading.level === 1)?.title;
}
function documentHeadings(body) {
  const headings = [];
  let fence;
  let offset = 0;
  for (const line of body.split(/(?<=\n)/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r?\n$/, ""));
    if (fence) {
      if (delimiter && delimiter[1][0] === fence.marker && delimiter[1].length >= fence.length && !delimiter[2].trim())
        fence = void 0;
    } else if (delimiter) {
      fence = { marker: delimiter[1][0], length: delimiter[1].length };
    } else {
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n)?$/.exec(line);
      if (heading)
        headings.push({ level: heading[1].length, title: heading[2].trim(), start: offset, end: offset + line.length });
    }
    offset += line.length;
  }
  return headings;
}
function parseExplicitTargets(text2) {
  const targets = [];
  const values = text2.replace(/^\s*[-*]\s+/gm, "").replace(/^\[|\]$/g, "").split(/[\n,]/).map((value) => unquote(value.trim().replace(/^`|`$/g, ""))).filter(Boolean);
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
    const key2 = target.kind === "file" ? `file:${target.path}` : target.kind === "symbol" ? `symbol:${target.path ?? ""}:${target.name}` : `${target.kind}:${target.name}`;
    const existing = byKey.get(key2);
    if (!existing || existing.evidence === "literal-mention")
      byKey.set(key2, { ...target });
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
var MAX_DEPENDENCY_RULES = 100;
function parseDependencyRules(text2) {
  if (text2 === void 0 || !text2.trim())
    return [];
  const rules = text2.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^(.+?)\s*->\s*(.+)$/.exec(unquote(line.replace(/^`|`$/g, "")));
    if (!match)
      throw new Error(`Invalid fixmap-deny-imports rule: ${line}`);
    return { from: dependencyPattern(match[1]), deny: dependencyPattern(match[2]) };
  });
  if (rules.length > MAX_DEPENDENCY_RULES)
    throw new Error(`fixmap-deny-imports exceeds the ${MAX_DEPENDENCY_RULES}-rule bound.`);
  const unique = new Map(rules.map((rule) => [`${rule.from}\0${rule.deny}`, rule]));
  return [...unique.values()].sort((a, b) => a.from.localeCompare(b.from) || a.deny.localeCompare(b.deny));
}
function dependencyPattern(value) {
  const pattern = value.trim().replace(/^`|`$/g, "").replace(/\\/g, "/");
  if (!pattern || pattern.length > 500 || pattern.startsWith("!") || pattern.includes("\0") || pattern.includes("->") || /^(?:\/|[A-Za-z]:)/.test(pattern) || pattern.split("/").includes("..")) {
    throw new Error(`Invalid fixmap-deny-imports pattern: ${value}`);
  }
  return pattern;
}
function parseReferences(text2) {
  return [...new Set(text2.split(/[\n,]/).map((value) => value.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean))].sort();
}
function normalizeStatus(value) {
  const normalized = value?.toLowerCase().replace(/[*_`]/g, " ").trim() ?? "";
  const labels = {
    accepted: "accepted",
    approved: "accepted",
    active: "accepted",
    proposed: "proposed",
    draft: "proposed",
    pending: "proposed",
    rejected: "rejected",
    declined: "rejected",
    deprecated: "deprecated",
    obsolete: "deprecated",
    superseded: "superseded",
    replaced: "superseded"
  };
  const match = /^([a-z]+)(?=$|[\s:,(.;])/.exec(normalized);
  const status = match?.[1] ? labels[match[1]] : void 0;
  if (!status)
    return "unknown";
  const remainder = normalized.slice(match[0].length);
  if (/\b(?:not|never|no longer)\b/.test(remainder))
    return "unknown";
  for (const word of remainder.match(/[a-z]+/g) ?? []) {
    if (labels[word] && labels[word] !== status)
      return "unknown";
  }
  return status;
}
function normalizeDate(value) {
  if (!value)
    return void 0;
  const candidate = value.trim().split(/\s+/)[0];
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate))
    return void 0;
  const parsed2 = /* @__PURE__ */ new Date(`${candidate}T00:00:00Z`);
  if (!Number.isFinite(parsed2.valueOf()) || parsed2.toISOString().slice(0, 10) !== candidate)
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
  return title.toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}/g)?.filter((term2) => !["decision", "record", "architecture", "using", "with"].includes(term2)) ?? [];
}
function containsLiteralTerm(text2, term2) {
  const literal = term2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_-])${literal}(?=$|[^\\p{L}\\p{N}_-])`, "iu").test(text2);
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
var RULE_ID2 = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function parseArchitecturePolicy(input) {
  const sourcePath = validateRelativePath2(input.path, "architecture policy path");
  if (!input.fingerprint.trim() || /[\0-\x20]/.test(input.fingerprint))
    throw new Error("Architecture policy needs a valid source fingerprint.");
  let parsed2;
  try {
    parsed2 = JSON.parse(input.content);
  } catch {
    throw new Error(`${sourcePath} is not valid JSON.`);
  }
  if (!isRecord6(parsed2) || parsed2.architecturePolicyVersion !== 1) {
    throw new Error(`${sourcePath} must declare architecturePolicyVersion 1.`);
  }
  const policy = {
    architecturePolicyVersion: 1,
    source: { path: sourcePath, fingerprint: input.fingerprint },
    boundaries: array(parsed2.boundaries).map((rule, index) => boundaryRule(rule, index)),
    requiredTests: array(parsed2.requiredTests).map((rule, index) => testRule(rule, index)),
    requiredReviews: array(parsed2.requiredReviews).map((rule, index) => reviewRule(rule, index)),
    contracts: array(parsed2.contracts).map((rule, index) => contractRule(rule, index))
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
      const allowed = rule.allowBreaking.find((entry2) => entry2.id === change.id || entry2.path !== void 0 && matchesAny(change.path, [entry2.path]));
      if (allowed) {
        findings.push({
          code: "breaking-contract-allowed",
          severity: "info",
          ruleId: rule.id,
          message: `${change.path} has a breaking contract change that ${rule.id} allows: ${allowed.reason}`,
          paths: [change.path],
          evidence: [{ kind: "contract-change", path: change.path, detail: `${change.id}: ${change.reason}` }]
        });
        continue;
      }
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
function buildArchitectureSnapshot(repo, policy) {
  const graph = buildImportGraph(repo.files);
  const edges = [...graph.imports].flatMap(([from, targets]) => [...targets].map((to) => ({ from, to }))).sort(edgeOrder);
  const cycles = findCycles(edges);
  const paths = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
  const coupling = paths.map((path) => {
    const incoming = graph.importedBy.get(path)?.size ?? 0;
    const outgoing = graph.imports.get(path)?.size ?? 0;
    return { path, incoming, outgoing, total: incoming + outgoing };
  });
  const boundaryViolations = policy ? evaluateArchitecturePolicy(policy, { repo }).findings.flatMap((finding) => finding.code === "boundary-violation" && finding.paths[0] && finding.paths[1] ? [{ ruleId: finding.ruleId, from: finding.paths[0], to: finding.paths[1] }] : []).sort(violationOrder) : [];
  const incompleteFiles = repo.files.filter((file) => languageAdapterForFile(file) && file.textSampleComplete === false).length;
  const canonical = {
    edges,
    cycles,
    coupling,
    boundaryViolations,
    truncated: { files: graph.truncatedFiles + incompleteFiles, edges: graph.truncatedEdges }
  };
  return {
    architectureSnapshotVersion: 1,
    fingerprint: `architecture:${stableHash3(canonicalize2(canonical))}`,
    sourceFingerprint: repoSourceFingerprint(repo),
    ...canonical
  };
}
function compareArchitectureSnapshots(previous, current2, options = {}) {
  if (previous.architectureSnapshotVersion !== 1 || current2.architectureSnapshotVersion !== 1) {
    throw new Error("Unsupported architecture snapshot version.");
  }
  const previousEdges = new Map(previous.edges.map((edge) => [edgeKey(edge), edge]));
  const currentEdges = new Map(current2.edges.map((edge) => [edgeKey(edge), edge]));
  const previousCycles = new Map(previous.cycles.map((cycle) => [cycle.join("\0"), cycle]));
  const currentCycles = new Map(current2.cycles.map((cycle) => [cycle.join("\0"), cycle]));
  const previousViolations = new Map(previous.boundaryViolations.map((value) => [violationKey(value), value]));
  const currentViolations = new Map(current2.boundaryViolations.map((value) => [violationKey(value), value]));
  const previousCoupling = new Map(previous.coupling.map((value) => [value.path, value.total]));
  const minimumDelta = options.couplingDelta ?? 2;
  return {
    fromFingerprint: previous.fingerprint,
    toFingerprint: current2.fingerprint,
    addedEdges: mapDifference(currentEdges, previousEdges).sort(edgeOrder),
    removedEdges: mapDifference(previousEdges, currentEdges).sort(edgeOrder),
    newCycles: mapDifference(currentCycles, previousCycles).sort(cycleOrder),
    resolvedCycles: mapDifference(previousCycles, currentCycles).sort(cycleOrder),
    newBoundaryViolations: mapDifference(currentViolations, previousViolations).sort(violationOrder),
    resolvedBoundaryViolations: mapDifference(previousViolations, currentViolations).sort(violationOrder),
    couplingGrowth: current2.coupling.flatMap((value) => {
      const before = previousCoupling.get(value.path) ?? 0;
      const delta = value.total - before;
      return delta >= minimumDelta ? [{ path: value.path, before, after: value.total, delta }] : [];
    }).sort((a, b) => b.delta - a.delta || a.path.localeCompare(b.path))
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
    severity: severity(rule.severity),
    allowBreaking: allowBreaking(rule.allowBreaking, index)
  };
}
function allowBreaking(value, index) {
  if (value === void 0)
    return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new Error(`contracts[${index}].allowBreaking must be an array of at most 100 entries.`);
  return value.map((entry2, position) => {
    const where = `contracts[${index}].allowBreaking[${position}]`;
    if (!isRecord6(entry2))
      throw new Error(`${where} must be an object.`);
    const unknown = Object.keys(entry2).filter((key2) => key2 !== "id" && key2 !== "path" && key2 !== "reason");
    if (unknown.length > 0)
      throw new Error(`${where} has unknown field ${unknown[0]}.`);
    const id = typeof entry2.id === "string" && entry2.id.trim() ? entry2.id.trim() : void 0;
    if (entry2.id !== void 0 && (!id || id.length > 500 || /[\0\r\n]/.test(id)))
      throw new Error(`${where}.id must be one non-blank line.`);
    const path = entry2.path === void 0 ? void 0 : patterns([entry2.path], "allowBreaking path")[0];
    if (id === void 0 === (path === void 0))
      throw new Error(`${where} needs exactly one of id or path.`);
    return { ...id ? { id } : {}, ...path ? { path } : {}, reason: reason(entry2.reason) };
  });
}
function ruleRecord(value, section2, index) {
  if (!isRecord6(value))
    throw new Error(`${section2}[${index}] must be an object.`);
  return value;
}
function ruleId(value, section2, index) {
  if (typeof value !== "string" || !RULE_ID2.test(value))
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
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry2) => typeof entry2 === "string" && entry2.trim() && entry2.length <= 500)) {
    throw new Error(`${label} must be a non-empty string array.`);
  }
  return value.map((entry2) => entry2.trim());
}
function matchesAny(path, patternsToMatch) {
  return patternsToMatch.some((pattern) => buildPathExcluder([pattern]).excludes(path));
}
function findCycles(edges) {
  const adjacency = /* @__PURE__ */ new Map();
  for (const edge of edges)
    adjacency.set(edge.from, [...adjacency.get(edge.from) ?? [], edge.to].sort());
  const nodes = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
  const index = /* @__PURE__ */ new Map();
  const low = /* @__PURE__ */ new Map();
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const cycles = [];
  let next = 0;
  const visit = (node) => {
    index.set(node, next);
    low.set(node, next);
    next += 1;
    stack.push(node);
    onStack.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!index.has(neighbor)) {
        visit(neighbor);
        low.set(node, Math.min(low.get(node), low.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        low.set(node, Math.min(low.get(node), index.get(neighbor)));
      }
    }
    if (low.get(node) !== index.get(node))
      return;
    const component = [];
    let popped;
    do {
      popped = stack.pop();
      onStack.delete(popped);
      component.push(popped);
    } while (popped !== node);
    component.sort();
    if (component.length > 1 || adjacency.get(component[0])?.includes(component[0]))
      cycles.push(component);
  };
  for (const node of nodes)
    if (!index.has(node))
      visit(node);
  return cycles.sort(cycleOrder);
}
function repoSourceFingerprint(repo) {
  const unversioned = repo.files.find((file) => !file.contentFingerprint);
  if (unversioned)
    throw new Error(`Architecture snapshots require an exact content fingerprint for ${unversioned.path}.`);
  const sources = repo.files.map((file) => `${file.path}\0${file.contentFingerprint}`).sort();
  return `repository:${stableHash3(sources.join("\0"))}`;
}
function mapDifference(left, right) {
  return [...left].flatMap(([key2, value]) => right.has(key2) ? [] : [value]);
}
function edgeKey(edge) {
  return `${edge.from}\0${edge.to}`;
}
function violationKey(value) {
  return `${value.ruleId}\0${value.from}\0${value.to}`;
}
function edgeOrder(a, b) {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
}
function violationOrder(a, b) {
  return a.ruleId.localeCompare(b.ruleId) || edgeOrder(a, b);
}
function cycleOrder(a, b) {
  return a.join("\0").localeCompare(b.join("\0"));
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
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalize2(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalize2).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key2, entry2]) => `${JSON.stringify(key2)}:${canonicalize2(entry2)}`).join(",")}}`;
  return JSON.stringify(value);
}
function stableHash3(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

// packages/core/dist/report.js
var MAX_REPORTED_TERMS = 8;
function buildReportFromRepo(repo, input) {
  const grounding = analyzeTaskGrounding(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  }, input.languageContext);
  const ranked = rankContextFilesEvidenceDetailed(repo, {
    issueText: input.issueText,
    diffText: repo.diffText,
    exclude: input.exclude,
    ...input.languageContext ? { languageContext: input.languageContext } : {}
  }, input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT);
  const contextFiles = ranked.contextFiles;
  const ranking = ranked.ranking;
  return assembleReport(repo, input, grounding, contextFiles, ranking, ranked.diagnostics);
}
async function buildHybridReportFromRepo(repo, input) {
  const grounding = analyzeTaskGrounding(repo, { issueText: input.issueText, diffText: repo.diffText }, input.languageContext);
  const hybrid = await rankContextFilesHybrid(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  }, {
    embeddingProvider: input.embeddingProvider,
    ...input.languageContext ? { languageContext: input.languageContext } : {},
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
  const diagnostics = hybrid.diagnostics.flatMap((entry2) => entry2.code === "semantic-disabled" ? [] : [{ ...entry2, code: entry2.code }]);
  return assembleReport(repo, input, grounding, contextFiles, hybrid.structuralRanking, hybrid.structuralDiagnostics, diagnostics, retrieval, hybrid);
}
function assembleReport(repo, input, grounding, contextFiles, ranking, rankingDiagnostics = [], extraDiagnostics = [], retrieval, hybrid) {
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];
  const impact = buildImpactMap(repo, contextPaths, testRoutes, void 0, contextPaths, input.languageContext);
  const annotations = input.annotationAsOf ? buildReportAnnotations(repo, [...contextPaths, ...impact.inspectionOrder, ...repo.changedFiles], input.issueText ?? "", input.annotationAsOf) : void 0;
  const decisionInventory = inventoryDecisionRecords(input.exclude ? { ...repo, files: repo.files.filter((file) => !input.exclude.excludes(file.path)) } : repo);
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
        focusPaths: [...contextPaths, ...repo.changedFiles],
        ...input.contractComparison ? { contractComparison: input.contractComparison } : {}
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
      ...rankingDiagnostics,
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
  if (code === "breaking-contract-allowed")
    return "architecture-breaking-contract-allowed";
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
  const namesScope = (name) => {
    const literal = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}_-])${literal}(?![\\p{L}\\p{N}_-])`, "iu").test(issueText);
  };
  const entries = assessments.filter((assessment) => {
    const scope = assessment.annotation.scope;
    if (assessment.status === "renamed-target" && assessment.suggestedPath && paths.has(assessment.suggestedPath))
      return true;
    if (scope.kind === "file" || scope.kind === "symbol")
      return paths.has(scope.path);
    if (scope.kind === "contract")
      return Boolean(scope.path && paths.has(scope.path)) || namesScope(scope.name);
    return namesScope(scope.name);
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
  if (!contextFiles.some((entry2) => repo.files.find((file) => file.path === entry2.path)?.kind === "code")) {
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
  const preview = terms.slice(0, MAX_REPORTED_TERMS).map((term2) => truncateForDiagnostic(term2, DIAGNOSTIC_TERM_LIMIT)).join(", ");
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
    const file = repo.files.find((entry2) => entry2.path === path);
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
  for (const route of buildManifestTestRoutes(repo, codeContextPaths, relatedTests)) {
    if (commands.has(route.command))
      continue;
    commands.add(route.command);
    routes.push(route);
  }
  return routes;
}
function buildManifestTestRoutes(repo, codeContextPaths, relatedTests) {
  const { language } = detectPrimaryLanguage(repo);
  if (language === "go") {
    const modules = buildGoModules(repo.files);
    const selected = /* @__PURE__ */ new Map();
    for (const path of codeContextPaths) {
      const module = goModuleForPath(modules, path);
      if (module && !selected.has(module.path))
        selected.set(module.path, module);
    }
    const exactRoutes = [...selected.values()].map((module) => ({
      command: module.root ? `go test -C ${module.root} ./...` : "go test ./...",
      kind: "test",
      reason: module.root ? `nearest module (${module.root}) declared by ${module.path}` : "go.mod at the repository root",
      relatedFiles: relatedTests.filter((path) => goModuleForPath(modules, path)?.path === module.path)
    }));
    if (exactRoutes.length > 0)
      return exactRoutes;
  }
  const packageDir = language === "rust" ? nearestManifestDir(repo, codeContextPaths, ["Cargo.toml"]) : language === "python" ? nearestManifestDir(repo, codeContextPaths, ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile"]) : language === "java" ? nearestManifestDir(repo, codeContextPaths, ["pom.xml", "build.gradle", "build.gradle.kts"]) : "";
  const route = language === "dotnet" ? codeContextPaths.map((path) => dotnetTestCommandForPath(repo.files, path)).find((entry2) => entry2 !== void 0) ?? manifestTestCommand(language, packageDir, repo.files) : language === "php" ? codeContextPaths.map((path) => phpTestCommandForPath(repo.files, path)).find((entry2) => entry2 !== void 0) ?? manifestTestCommand(language, packageDir, repo.files) : language === "ruby" ? codeContextPaths.map((path) => rubyTestCommandForPath(repo.files, path, relatedTests)).find((entry2) => entry2 !== void 0) ?? manifestTestCommand(language, packageDir, repo.files) : manifestTestCommand(language, packageDir, repo.files);
  if (!route) {
    return [];
  }
  return [{
    command: route.command,
    kind: "test",
    reason: route.reason,
    // Only real test files count as related here. Falling back to the implementation made
    // nextAction claim routed tests for a Go module that had none.
    relatedFiles: scopeToPackage(relatedTests, route.scopeDir ?? packageDir)
  }];
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
    const terms = rule.terms.flatMap((term2) => [...riskTokens(term2)]);
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
    return rule.terms.flatMap((term2) => [...riskTokens(term2)]).some((token) => tokens.has(token));
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
function formatScriptCommand(manager, packageDir, script, packageName2) {
  if (!packageDir)
    return `${manager} run ${script}`;
  if (manager === "npm")
    return `npm --prefix ${packageDir} run ${script}`;
  if (manager === "pnpm")
    return `pnpm --dir ${packageDir} run ${script}`;
  if (manager === "yarn") {
    return packageName2 ? `yarn workspace ${packageName2} run ${script}` : `yarn --cwd ${packageDir} ${script}`;
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
    ...listOrEmpty((report.impact?.files ?? []).map((file) => `- ${markdownCode(file.path)} (${file.confidence} confidence, impact ${file.score}): ${file.evidence.map((entry2) => entry2.reason).join("; ")}`)),
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
        ...(report.decisions ?? []).map((decision) => `- **ADR ${decision.status}**${decision.authoredStatus ? ` (authored status: ${markdownCode(inlineProse(decision.authoredStatus))})` : ""} ${markdownCode(decision.path)} \u2014 ${decision.title}: ${inlineProse(decision.decision)}${decision.source ? ` (locally attributed to ${markdownCode(decision.source.url)}; remote source unverified)` : ""}`),
        ...(report.annotations?.entries ?? []).map((assessment) => `- **annotation ${assessment.status}** ${describeAnnotationScope(assessment)}: ${assessment.annotation.note}`)
      ])
    ] : [],
    ...report.evidence ? [
      "",
      "## External Evidence",
      "",
      `Imported from ${report.evidence.sources.map((source) => `${markdownCode(source.provider)} ${inlineProse(source.version)}`).join(", ")}. Provider claims are shown as supplied; FixMap did not verify them.`,
      "",
      ...listOrEmpty(report.evidence.items.map((item) => `- **${item.confidence}** ${item.kind} (${markdownCode(item.provider.id)}): ${inlineProse(item.summary)} \u2014 ${item.subjects.map((subject) => "path" in subject && typeof subject.path === "string" ? markdownCode(subject.path) : subject.kind).join(", ")}`)),
      ...report.evidence.omittedItems > 0 ? ["", `${report.evidence.omittedItems} further evidence item${report.evidence.omittedItems === 1 ? " was" : "s were"} not about files in this report.`] : [],
      ...report.evidence.diagnostics.map((diagnostic) => `- **${diagnostic.severity}** ${markdownCode(diagnostic.provider)} ${diagnostic.code}: ${inlineProse(diagnostic.message)}`)
    ] : [],
    ...report.sensitiveData ? renderSensitiveDataMarkdown(report.sensitiveData) : [],
    ...report.supplyChain ? renderSupplyChainReportMarkdown(report.supplyChain) : [],
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
  "cargo.toml",
  "codeowners",
  "dockerfile",
  "gemfile",
  "go.mod",
  "go.work",
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
  "pest.php",
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
var SCAN_CACHE_VERSION = 9;
var SCAN_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var SCAN_CACHE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1e3;
var SCAN_CACHE_FILE = /^[a-f0-9]{24}-[a-f0-9]{24}\.json$/;
var SCAN_CACHE_TEMP_FILE = /^[a-f0-9]{24}-[a-f0-9]{24}\.json\.\d+-[0-9a-f-]+\.tmp$/i;
var INCREMENTAL_INDEX_VERSION = 3;
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
  const cacheDecision = input.useCache === true ? await buildScanCacheLocation(repoRoot, cacheRoot, internalPaths, input.includeHistory === true, input.languageRegistry?.cacheIdentity) : void 0;
  const cacheLocation = cacheDecision?.location;
  const incrementalIndexLocation = input.useCache === true && !sameFilesystemPath(cacheRoot, repoRoot) && containedPath(repoRoot, cacheRoot) === void 0 ? buildIncrementalIndexLocation(repoRoot, cacheRoot, input.languageRegistry?.cacheIdentity) : void 0;
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
    const listed = await listFiles(repoRoot, diagnostics, internalCacheRoot, internalPaths, incrementalIndexLocation, input.languageRegistry);
    files = listed.files;
    trackedFiles = listed.trackedFiles;
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
    ...diagnostics.filter((entry2) => !entry2.code.startsWith("impact-history-")),
    ...diagnostics.filter((entry2) => entry2.code.startsWith("impact-history-"))
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
function buildIncrementalIndexLocation(root, cacheRoot, registryIdentity) {
  const repoKey = hashText(resolve(root) + (registryIdentity ? `\0${registryIdentity}` : ""));
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
async function buildScanCacheLocation(root, cacheRoot, internalPaths, includeHistory, registryIdentity) {
  if (sameFilesystemPath(cacheRoot, root) || containedPath(root, cacheRoot) !== void 0) {
    return {
      skipReason: "Repository scan caching was skipped because FIXMAP_CACHE_DIR is inside the scanned repository. Move the cache outside the repository to enable exact-state reuse."
    };
  }
  try {
    const { stdout: status } = await exec("git", ["status", "--porcelain=v2", "--branch", "--no-ahead-behind", "-z", "--untracked-files=all", ...gitPathspec(internalPaths)], {
      cwd: root,
      maxBuffer: GIT_MAX_BUFFER
    });
    const entries = status.split("\0");
    const head = entries.find((entry2) => /^# branch\.oid [a-f0-9]{40,64}$/i.test(entry2))?.slice(13);
    if (!head)
      throw new Error("No committed Git identity in status");
    if (entries.some((entry2) => entry2.startsWith("? "))) {
      return {
        skipReason: "Repository scan caching was skipped because untracked files are scanner inputs and can change without a stable git diff."
      };
    }
    const dirtyDiff = entries.some((entry2) => /^[12u] /.test(entry2)) ? (await exec("git", ["diff", "--binary", "--no-ext-diff", "HEAD", ...gitPathspec(internalPaths)], {
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
      ...registryIdentity ? [registryIdentity] : [],
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
    for (const entry2 of candidate.files) {
      if (!isRecord7(entry2) || !isCachedRelativePath(entry2.path) || typeof entry2.fingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(entry2.fingerprint) || !isCachedRepoFile(entry2.file) || entry2.file.path !== entry2.path || entries.has(entry2.path)) {
        return void 0;
      }
      entries.set(entry2.path, entry2);
    }
    return entries;
  } catch {
    return void 0;
  }
}
function isCachedHistory(candidate) {
  if (!isRecord7(candidate) || !Array.isArray(candidate.commits) || typeof candidate.inspectedCommits !== "number" || !Number.isSafeInteger(candidate.inspectedCommits) || candidate.inspectedCommits < 0 || typeof candidate.skippedLargeCommits !== "number" || !Number.isSafeInteger(candidate.skippedLargeCommits) || candidate.skippedLargeCommits < 0 || typeof candidate.shallow !== "boolean" || typeof candidate.truncated !== "boolean") {
    return false;
  }
  return candidate.commits.every((commit) => {
    if (!isRecord7(commit) || typeof commit.hash !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commit.hash) || typeof commit.committedAt !== "number" || !Number.isSafeInteger(commit.committedAt) || commit.committedAt < 0 || commit.author !== void 0 && (typeof commit.author !== "string" || !commit.author.trim() || commit.author.length > 200 || /[\0-\x1f\x7f]/.test(commit.author)) || !Array.isArray(commit.files))
      return false;
    return commit.files.every(isCachedRelativePath);
  });
}
function isCachedRepoFile(candidate) {
  if (!isRecord7(candidate))
    return false;
  const validSkipReason = candidate.textSampleSkipReason === "too-large" || candidate.textSampleSkipReason === "not-text" || candidate.textSampleSkipReason === "unreadable";
  return isCachedRelativePath(candidate.path) && typeof candidate.contentFingerprint === "string" && /^(?:git|worktree):[a-f0-9]{40,64}$/i.test(candidate.contentFingerprint) && typeof candidate.extension === "string" && typeof candidate.sizeBytes === "number" && Number.isFinite(candidate.sizeBytes) && candidate.sizeBytes >= 0 && typeof candidate.isTest === "boolean" && typeof candidate.isSource === "boolean" && (candidate.kind === "code" || candidate.kind === "config" || candidate.kind === "documentation" || candidate.kind === "other") && typeof candidate.textSample === "string" && typeof candidate.textSampleComplete === "boolean" && (candidate.textSampleComplete && candidate.textSampleSkipReason === void 0 || !candidate.textSampleComplete && validSkipReason);
}
function isCachedPackageScript(candidate) {
  if (!isRecord7(candidate))
    return false;
  return typeof candidate.name === "string" && candidate.name.trim().length > 0 && typeof candidate.command === "string" && (candidate.packageDir === "" || isCachedRelativePath(candidate.packageDir)) && (candidate.packageName === void 0 || typeof candidate.packageName === "string" && candidate.packageName.trim().length > 0);
}
function isCachedDiagnostic(candidate) {
  if (!isRecord7(candidate))
    return false;
  return typeof candidate.code === "string" && candidate.code.trim().length > 0 && typeof candidate.message === "string" && candidate.message.trim().length > 0 && (candidate.severity === "info" || candidate.severity === "warning" || candidate.severity === "error") && (candidate.paths === void 0 || Array.isArray(candidate.paths) && candidate.paths.every(isCachedRelativePath));
}
function isRecord7(candidate) {
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
    await Promise.all(entries.filter((entry2) => entry2.isFile() && (SCAN_CACHE_FILE.test(entry2.name) || SCAN_CACHE_TEMP_FILE.test(entry2.name) || INCREMENTAL_INDEX_TEMP_FILE.test(entry2.name))).map(async (entry2) => {
      const path = join(cacheRoot, entry2.name);
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
async function listFiles(root, diagnostics, internalCacheRoot, internalPaths, incrementalIndexLocation, languageRegistry) {
  const gitPaths = await listGitPaths(root);
  const visiblePaths = gitPaths?.paths.filter((path) => !hasInternalPath(internalPaths, normalizePath3(path)) && !isInternalCachePath(root, path, internalCacheRoot));
  let files;
  if (gitPaths) {
    const previous = incrementalIndexLocation ? await readIncrementalScanIndex(incrementalIndexLocation) : void 0;
    const built = await buildFilesFromPaths(root, visiblePaths ?? [], diagnostics, gitPaths.gitLinks, gitPaths.fingerprints, previous, languageRegistry);
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
    files = (await walkFiles(root, root, diagnostics, state, internalCacheRoot, internalPaths, languageRegistry)).sort((a, b) => a.path.localeCompare(b.path));
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
  const trackedFiles = gitPaths ? gitPaths.trackedPaths.filter((path) => !hasInternalPath(internalPaths, path)) : await listTrackedPaths(root, internalPaths);
  return { files, trackedFiles };
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
      // Fingerprints come from the index, so only index/worktree equality permits
      // reuse. Comparing with HEAD misses unstaged edits that undo a staged edit.
      // This also works before the first commit, without a failing HEAD probe.
      exec("git", ["diff", "--name-only", "-z", "--"], { cwd: root, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const gitLinks = /* @__PURE__ */ new Set();
    const fingerprints = /* @__PURE__ */ new Map();
    const trackedPaths = [];
    for (const entry2 of staged.split("\0")) {
      const match = /^(\d+)\s+([0-9a-f]+)\s+\d+\t(.+)$/is.exec(entry2);
      if (!match?.[1] || !match[2] || !match[3])
        continue;
      const path = normalizePath3(match[3]);
      trackedPaths.push(path);
      if (match[1] === "160000") {
        gitLinks.add(path);
      } else if (!/^0+$/.test(match[2])) {
        fingerprints.set(path, `git:${match[2].toLowerCase()}`);
      }
    }
    for (const path of dirty.split("\0").filter(Boolean).map(normalizePath3)) {
      fingerprints.delete(path);
    }
    return { paths: [...new Set(stdout.split("\0").filter(Boolean))], trackedPaths, gitLinks, fingerprints };
  } catch {
    return void 0;
  }
}
async function buildFilesFromPaths(root, paths, diagnostics, knownGitLinks = /* @__PURE__ */ new Set(), fingerprints = /* @__PURE__ */ new Map(), previous, languageRegistry) {
  const results = [];
  const indexedByPath = /* @__PURE__ */ new Map();
  const reusedPaths = /* @__PURE__ */ new Set();
  const absent = [];
  const gitLinks = [];
  const seenRealPaths = /* @__PURE__ */ new Map();
  const linked = [];
  const escapedLinks = [];
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
    const scanned = await toRepoFile(absolutePath, relativePath, fingerprint, reused2, languageRegistry);
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
      if (!containedPath(realRoot, scanned.realPath)) {
        escapedLinks.push(relativePath);
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
  reportEscapedLinks(diagnostics, escapedLinks);
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
  const unread2 = files.filter((file) => file.isSource && file.textSampleComplete === false && file.textSampleSkipReason === "too-large");
  if (unread2.length === 0)
    return;
  const sample = unread2.slice().sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 3).map((file) => `${file.path} (${Math.ceil(file.sizeBytes / 1e3).toLocaleString()} kB)`).join(", ");
  diagnostics.push({
    code: "content-too-large",
    severity: "warning",
    message: `${unread2.length.toLocaleString()} source file${unread2.length === 1 ? "" : "s"} exceeded the complete text window \u2014 largest: ${sample}${unread2.length > 3 ? ", \u2026" : ""}. Files over ${(MAX_TEXT_SAMPLE_BYTES / 1e3).toLocaleString()} kB use bounded head and distributed retrieval samples; context and grounding remain incomplete.`,
    paths: unread2.slice(0, 8).map((file) => file.path)
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
  const sample = linked.slice(0, 3).map((entry2) => `${entry2.path} -> ${entry2.target}`).join(", ");
  diagnostics.push({
    code: "duplicate-real-path",
    severity: "info",
    message: `${linked.length.toLocaleString()} tracked path${linked.length === 1 ? "" : "s"} resolved to a file already scanned under another name and ${linked.length === 1 ? "was" : "were"} ranked once: ${sample}${linked.length > 3 ? ", \u2026" : ""}.`
  });
}
function reportEscapedLinks(diagnostics, paths) {
  if (paths.length === 0)
    return;
  const unique = [...new Set(paths)].sort();
  diagnostics.push({
    code: "linked-paths-skipped",
    severity: "info",
    message: `Skipped ${unique.length.toLocaleString()} tracked or untracked linked ${unique.length === 1 ? "path" : "paths"} because ${unique.length === 1 ? "it resolves" : "they resolve"} outside the repository: ${unique.slice(0, 5).map(markdownCode).join(", ")}${unique.length > 5 ? ", ..." : ""}.`,
    paths: unique.slice(0, 8)
  });
}
async function walkFiles(root, current2, diagnostics, state, internalCacheRoot, internalPaths, languageRegistry) {
  let entries;
  try {
    entries = await readdir(current2, { withFileTypes: true });
  } catch (error) {
    const reason2 = error.code ?? "unreadable";
    const path = normalizePath3(relative(root, current2));
    if (!path) {
      diagnostics.push({
        code: "directory-unreadable",
        severity: "error",
        message: `Could not read the repository root (${reason2}), so nothing was scanned. Check that this user can list the checkout; in a container, make it readable by the container user or run with that user's uid.`
      });
    } else if (diagnostics.filter((diagnostic) => diagnostic.code === "directory-unreadable").length < 5) {
      diagnostics.push({
        code: "directory-unreadable",
        severity: "warning",
        paths: [path],
        message: `Could not read ${path} (${reason2}); files under it were not scanned.`
      });
    }
    return [];
  }
  const results = [];
  for (const entry2 of entries) {
    if (state.count >= MAX_SCANNED_FILES) {
      if (!state.limitReported) {
        reportScanLimit(diagnostics);
        state.limitReported = true;
      }
      break;
    }
    if (entry2.isSymbolicLink()) {
      state.linkedPaths.push(normalizePath3(relative(root, join(current2, entry2.name))));
      continue;
    }
    if (entry2.isDirectory()) {
      if (WALK_IGNORED_DIRS.has(entry2.name)) {
        continue;
      }
      const directory = join(current2, entry2.name);
      if (internalCacheRoot && sameFilesystemPath(directory, internalCacheRoot))
        continue;
      results.push(...await walkFiles(root, directory, diagnostics, state, internalCacheRoot, internalPaths, languageRegistry));
      continue;
    }
    if (!entry2.isFile()) {
      continue;
    }
    const absolutePath = join(current2, entry2.name);
    const relativePath = normalizePath3(relative(root, absolutePath));
    if (hasInternalPath(internalPaths, relativePath) || isInternalCachePath(root, relativePath, internalCacheRoot))
      continue;
    const fingerprint = await hashWorktreeFile(absolutePath);
    const scanned = await toRepoFile(absolutePath, relativePath, fingerprint, void 0, languageRegistry);
    if (scanned.status === "ok") {
      results.push(scanned.file);
      state.count += 1;
    }
  }
  return results;
}
async function toRepoFile(absolutePath, relativePath, contentFingerprint, reusable, languageRegistry) {
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
  const customSource = languageRegistry?.customForExtension(extension) !== void 0;
  const isSource = customSource || SOURCE_EXTENSIONS.has(extension) || conventionalKind !== void 0;
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
      kind: customSource ? "code" : classifyFile2(relativePath, extension),
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
function extractScriptBlocks(text2) {
  const blocks = [...text2.matchAll(SFC_SCRIPT_BLOCK)].map((match) => match[1] ?? "");
  const joined = blocks.join("\n").trim();
  return joined || text2;
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
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([scope, count3]) => `${scope} (${count3.toLocaleString()})`).join(", ");
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
      const parsed2 = JSON.parse(decoded.text);
      const packageDir = normalizePath3(dirname(manifest.path));
      const packageName2 = typeof parsed2.name === "string" && parsed2.name.trim() ? parsed2.name.trim() : void 0;
      scripts.push(...Object.entries(parsed2.scripts ?? {}).map(([name, command]) => ({
        name,
        command,
        packageDir: packageDir === "." ? "" : packageDir,
        ...packageName2 ? { packageName: packageName2 } : {}
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
    const changedFiles = [...new Set(tracked)].sort((a, b) => a.localeCompare(b));
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
  let current2;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current2 = [];
      groups.push(current2);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (!current2) {
        current2 = [];
        groups.push(current2);
      }
      current2.push(line);
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
async function readRepositoryHistory(root, repositoryPaths, diagnostics, ref = "HEAD") {
  try {
    const [{ stdout: shallowText }, { stdout: countText }, { stdout: logText }] = await Promise.all([
      exec("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["rev-list", "--count", "--no-merges", "--end-of-options", ref, "--", "."], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
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
        "--end-of-options",
        ref,
        "--",
        "."
      ], { cwd: root, maxBuffer: GIT_HISTORY_MAX_BUFFER })
    ]);
    const parsed2 = parseHistoryLog(logText, repositoryPaths);
    const totalCommits = Number.parseInt(countText.trim(), 10);
    const shallow = shallowText.trim() === "true";
    const truncated = Number.isFinite(totalCommits) && totalCommits > parsed2.inspectedCommits;
    const history = {
      commits: parsed2.commits,
      inspectedCommits: parsed2.inspectedCommits,
      skippedLargeCommits: parsed2.skippedLargeCommits,
      shallow,
      truncated
    };
    if (shallow) {
      diagnostics.push({
        code: "impact-history-shallow",
        severity: "info",
        message: `Impact history is shallow (${parsed2.inspectedCommits.toLocaleString()} visible non-merge ${parsed2.inspectedCommits === 1 ? "commit" : "commits"}). Import and test relationships remain available, but co-change evidence may be incomplete.`
      });
    }
    if (truncated) {
      diagnostics.push({
        code: "impact-history-truncated",
        severity: "info",
        message: `Impact history inspected the newest ${parsed2.inspectedCommits.toLocaleString()} of ${totalCommits.toLocaleString()} non-merge commits. Commits touching more than ${MAX_HISTORY_FILES_PER_COMMIT} files were excluded from co-change evidence.`
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
  for (const record3 of logText.split("")) {
    if (!record3)
      continue;
    const fields2 = record3.split("\0");
    const header = fields2.shift()?.replace(/^\r?\n/, "") ?? "";
    const separator = header.indexOf("");
    if (separator === -1)
      continue;
    const hash = header.slice(0, separator).trim();
    const secondSeparator = header.indexOf("", separator + 1);
    const committedAt = Number.parseInt(header.slice(separator + 1, secondSeparator === -1 ? void 0 : secondSeparator).trim(), 10);
    const rawAuthor = secondSeparator === -1 ? "" : header.slice(secondSeparator + 1).trim();
    const author = rawAuthor && !/[\0-\x1f\x7f]/.test(rawAuthor) ? rawAuthor.slice(0, 200) : void 0;
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(hash) || !Number.isSafeInteger(committedAt) || committedAt < 0)
      continue;
    inspectedCommits += 1;
    const allFiles = [...new Set(fields2.map((path) => path.replace(/^\r?\n/, "")).filter(Boolean).map(normalizePath3))];
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
  const message2 = typeof candidate?.message === "string" ? candidate.message : String(error);
  return stderr.split(/\r?\n/).find((line) => line.trim()) ?? message2.split(/\r?\n/)[0] ?? "unknown git error";
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
function classifyFile2(path, extension) {
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
  if (/\.(?:csproj|fsproj|vbproj|sln)$/.test(name))
    return "config";
  return void 0;
}
async function readTextSample(path, sizeBytes) {
  try {
    const bytes = sizeBytes <= MAX_TEXT_SAMPLE_BYTES ? await readFile(path) : await readFileWindow(path, 0, MAX_TEXT_SAMPLE_BYTES);
    if (bytes.includes(0)) {
      return { text: "", complete: false, skipReason: "not-text" };
    }
    const text2 = bytes.toString("utf8");
    if (sizeBytes <= MAX_TEXT_SAMPLE_BYTES)
      return { text: text2, complete: true };
    const searchBytes = await readDistributedWindows(path, sizeBytes);
    if (searchBytes.includes(0))
      return { text: "", complete: false, skipReason: "not-text" };
    return { text: text2, searchText: searchBytes.toString("utf8"), complete: false, skipReason: "too-large" };
  } catch {
    return { text: "", complete: false, skipReason: "unreadable" };
  }
}
function describeFileFromBytes(relativePath, sizeBytes, bytes, contentFingerprint) {
  const extension = extname(relativePath).toLowerCase();
  const conventionalKind = classifyConventionalTextFile(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(extension) || conventionalKind !== void 0;
  const sample = !isSource ? { text: "", complete: true } : bytes ? sampleFromBytes(bytes, sizeBytes) : { text: "", complete: false, skipReason: "too-large" };
  if (SFC_EXTENSIONS.has(extension) && sample.text) {
    sample.text = extractScriptBlocks(sample.text);
    if ("searchText" in sample && sample.searchText)
      sample.searchText = extractScriptBlocks(sample.searchText);
  }
  return {
    path: relativePath,
    ...contentFingerprint ? { contentFingerprint } : {},
    extension,
    sizeBytes,
    isTest: isLanguageTestPath(relativePath, extension) || TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
    isSource,
    kind: classifyFile2(relativePath, extension),
    textSample: sample.text,
    ..."searchText" in sample && sample.searchText ? { searchTextSample: sample.searchText } : {},
    textSampleComplete: sample.complete,
    ..."skipReason" in sample && sample.skipReason ? { textSampleSkipReason: sample.skipReason } : {}
  };
}
function sampleFromBytes(bytes, sizeBytes) {
  const head = sizeBytes <= MAX_TEXT_SAMPLE_BYTES ? bytes : bytes.subarray(0, MAX_TEXT_SAMPLE_BYTES);
  if (head.includes(0))
    return { text: "", complete: false, skipReason: "not-text" };
  const text2 = head.toString("utf8");
  if (sizeBytes <= MAX_TEXT_SAMPLE_BYTES)
    return { text: text2, complete: true };
  const windowBytes = Math.floor(MAX_TEXT_SAMPLE_BYTES / 4);
  const maximumStart = Math.max(0, sizeBytes - windowBytes);
  const starts = [.../* @__PURE__ */ new Set([0, Math.floor(maximumStart / 3), Math.floor(maximumStart * 2 / 3), maximumStart])];
  const windows = starts.map((position) => bytes.subarray(position, position + windowBytes));
  const searchBytes = Buffer.concat(windows.flatMap((window, index) => index === 0 ? [window] : [Buffer.from("\n"), window]));
  if (searchBytes.includes(0))
    return { text: "", complete: false, skipReason: "not-text" };
  return { text: text2, searchText: searchBytes.toString("utf8"), complete: false, skipReason: "too-large" };
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

// packages/core/dist/architecture-history.js
import { execFile as execFile2, spawn } from "node:child_process";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { mkdir as mkdir2, readdir as readdir2, readFile as readFile2, rename as rename2, stat as stat2, unlink as unlink2, writeFile as writeFile2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, isAbsolute as isAbsolute2, join as join2, relative as relative2, resolve as resolve2, sep as sep2 } from "node:path";
import { promisify as promisify2 } from "node:util";
var exec2 = promisify2(execFile2);
var MAX_REF_LENGTH = 500;
var MAX_TREE_BYTES = 32 * 1024 * 1024;
var MAX_FILES = 25e3;
var MAX_HISTORICAL_BLOB_BYTES = 16 * 1024 * 1024;
var MAX_BATCH_BYTES = 64 * 1024 * 1024;
var MAX_BATCH_OUTPUT_BYTES = MAX_BATCH_BYTES + 2 * 1024 * 1024;
var ARCHITECTURE_CACHE_VERSION = 2;
var ARCHITECTURE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var ARCHITECTURE_CACHE_FILE = /^architecture-v\d+-[a-f0-9]{40,64}-(?:policy|no-policy)\.json$/;
var ARCHITECTURE_CACHE_TEMP_FILE = /^architecture-v\d+-[a-f0-9]{40,64}-(?:policy|no-policy)\.json\.\d+-[0-9a-f-]{36}\.tmp$/;
async function scanRepoAtRef(input) {
  const repoRoot = resolve2(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  return scanCommit(repoRoot, requestedRef, await resolveCommit(repoRoot, requestedRef), { includeHistory: true });
}
async function scanCommit(repoRoot, requestedRef, commit, options = {}) {
  const { stdout } = await exec2("git", ["ls-tree", "-r", "-z", "-l", "--full-tree", commit, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_TREE_BYTES
  });
  const allEntries = parseTree(stdout).filter((entry2) => entry2.mode !== "120000");
  const entries = allEntries.slice(0, MAX_FILES);
  const diagnostics = [];
  if (allEntries.length > entries.length)
    diagnostics.push({
      code: "scan-limit-reached",
      severity: "warning",
      message: `Historical scan stopped after ${MAX_FILES.toLocaleString()} files at ${commit}.`
    });
  const wanted = entries.filter((entry2) => (entry2.path === ".fixmapignore" || describeFileFromBytes(entry2.path, entry2.size, void 0).isSource) && entry2.size <= MAX_HISTORICAL_BLOB_BYTES);
  const described = /* @__PURE__ */ new Map();
  let ignoreBytes;
  for (let start = 0; start < wanted.length; ) {
    const batch = [];
    let batchBytes = 0;
    while (start < wanted.length && (batch.length === 0 || batchBytes + wanted[start].size <= MAX_BATCH_BYTES)) {
      batch.push(wanted[start]);
      batchBytes += wanted[start].size;
      start += 1;
    }
    const content = await readBlobs(repoRoot, batch);
    for (const entry2 of batch) {
      const bytes = content.get(entry2.oid);
      if (entry2.path === ".fixmapignore")
        ignoreBytes = bytes;
      described.set(entry2.path, describeFileFromBytes(entry2.path, entry2.size, bytes, `git:${entry2.oid}`));
    }
  }
  const files = entries.map((entry2) => described.get(entry2.path) ?? describeFileFromBytes(entry2.path, entry2.size, void 0, `git:${entry2.oid}`));
  const history = options.includeHistory ? await readRepositoryHistory(repoRoot, new Set(files.map((file) => file.path)), diagnostics, commit) : void 0;
  return {
    requestedRef,
    commit,
    repo: {
      root: repoRoot,
      files,
      trackedFiles: entries.map((entry2) => entry2.path),
      packageScripts: historicalPackageScripts(files, diagnostics),
      changedFiles: [],
      diffText: "",
      packageManager: inferPackageManager(entries),
      diagnostics,
      ...history ? { history } : {}
    },
    ...ignoreBytes ? { ignoreFile: ignoreBytes.toString("utf8") } : {}
  };
}
async function buildArchitectureSnapshotAtRef(input) {
  const repoRoot = resolve2(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  const commit = await resolveCommit(repoRoot, requestedRef);
  const applyPolicy = input.applyRepositoryPolicy !== false;
  const cachePath = input.useCache === false ? void 0 : architectureCachePath(repoRoot, commit, applyPolicy);
  const cached = cachePath ? await readArchitectureCache(cachePath, commit, applyPolicy) : void 0;
  if (cached)
    return { requestedRef, commit, ...cached };
  const historical = await scanCommit(repoRoot, requestedRef, commit);
  const policy = applyPolicy ? architecturePolicyFromRepo(historical.repo) : void 0;
  const inventory = inventoryDecisionRecords(historical.repo);
  const entry2 = {
    snapshot: buildArchitectureSnapshot(historical.repo, policy),
    // Only accepted records state intent. Proposed, rejected, superseded, and unlabeled
    // records are history, and treating them as rules would invent disagreements.
    decisionRules: inventory.records.filter((record3) => record3.status === "accepted").flatMap((record3) => (record3.dependencyRules ?? []).map((rule) => ({
      decisionId: record3.id,
      decisionPath: record3.path,
      decisionTitle: record3.title,
      from: rule.from,
      deny: rule.deny
    }))),
    decisionDiagnostics: inventory.diagnostics.filter((diagnostic) => diagnostic.code !== "decision-target-missing")
  };
  if (cachePath)
    await writeArchitectureCache(cachePath, commit, applyPolicy, entry2);
  return { requestedRef, commit, ...entry2 };
}
async function compareArchitectureRefs(input) {
  const options = {
    repoRoot: input.repoRoot,
    ...input.applyRepositoryPolicy !== void 0 ? { applyRepositoryPolicy: input.applyRepositoryPolicy } : {},
    ...input.useCache !== void 0 ? { useCache: input.useCache } : {}
  };
  const [from, to] = await Promise.all([
    buildArchitectureSnapshotAtRef({ ...options, ref: input.fromRef }),
    buildArchitectureSnapshotAtRef({ ...options, ref: input.toRef })
  ]);
  return {
    from,
    to,
    drift: compareArchitectureSnapshots(from.snapshot, to.snapshot, {
      ...input.couplingDelta !== void 0 ? { couplingDelta: input.couplingDelta } : {}
    }),
    decisionDisagreements: findDecisionDisagreements(from.snapshot, to)
  };
}
function findDecisionDisagreements(previous, current2) {
  const earlier = new Set(previous.edges.map((edge) => `${edge.from}\0${edge.to}`));
  return current2.decisionRules.flatMap((rule) => {
    const from = buildPathExcluder([rule.from]);
    const deny = buildPathExcluder([rule.deny]);
    return current2.snapshot.edges.filter((edge) => from.excludes(edge.from) && deny.excludes(edge.to)).map((edge) => ({
      decisionId: rule.decisionId,
      decisionPath: rule.decisionPath,
      decisionTitle: rule.decisionTitle,
      rule: { from: rule.from, deny: rule.deny },
      edge: { from: edge.from, to: edge.to },
      introduced: !earlier.has(`${edge.from}\0${edge.to}`)
    }));
  }).sort((a, b) => a.decisionPath.localeCompare(b.decisionPath) || a.rule.from.localeCompare(b.rule.from) || a.rule.deny.localeCompare(b.rule.deny) || a.edge.from.localeCompare(b.edge.from) || a.edge.to.localeCompare(b.edge.to));
}
function architectureCacheRoot() {
  return resolve2(process.env.FIXMAP_CACHE_DIR ?? join2(process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? join2(homedir2(), ".cache"), "fixmap", "scans"));
}
function architectureCachePath(repoRoot, commit, applyPolicy) {
  const cacheRoot = architectureCacheRoot();
  const fold = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  const distance = relative2(fold(repoRoot), fold(cacheRoot));
  if (distance === "" || distance !== ".." && !distance.startsWith(`..${sep2}`) && !isAbsolute2(distance))
    return void 0;
  return join2(cacheRoot, `architecture-v${ARCHITECTURE_CACHE_VERSION}-${commit}-${applyPolicy ? "policy" : "no-policy"}.json`);
}
async function readArchitectureCache(path, commit, applyPolicy) {
  try {
    const parsed2 = JSON.parse(await readFile2(path, "utf8"));
    if (parsed2.architectureHistoryCacheVersion !== ARCHITECTURE_CACHE_VERSION || parsed2.commit !== commit || parsed2.applyPolicy !== applyPolicy || typeof parsed2.checksum !== "string")
      return void 0;
    if (parsed2.checksum !== checksum(JSON.stringify(parsed2.entry)))
      return void 0;
    return isArchitectureEntry(parsed2.entry) ? parsed2.entry : void 0;
  } catch {
    return void 0;
  }
}
async function writeArchitectureCache(path, commit, applyPolicy, entry2) {
  const temporaryPath = `${path}.${process.pid}-${randomUUID2()}.tmp`;
  try {
    await mkdir2(dirname2(path), { recursive: true });
    await pruneArchitectureCache(dirname2(path));
    const record3 = {
      architectureHistoryCacheVersion: ARCHITECTURE_CACHE_VERSION,
      commit,
      applyPolicy,
      checksum: checksum(JSON.stringify(entry2)),
      entry: entry2
    };
    await writeFile2(temporaryPath, `${JSON.stringify(record3)}
`, { encoding: "utf8", flag: "wx" });
    await rename2(temporaryPath, path);
  } catch {
    try {
      await unlink2(temporaryPath);
    } catch {
    }
  }
}
async function pruneArchitectureCache(directory) {
  try {
    const now = Date.now();
    await Promise.all((await readdir2(directory, { withFileTypes: true })).filter((entry2) => entry2.isFile() && (ARCHITECTURE_CACHE_FILE.test(entry2.name) || ARCHITECTURE_CACHE_TEMP_FILE.test(entry2.name))).map(async (entry2) => {
      const path = join2(directory, entry2.name);
      try {
        if (now - (await stat2(path)).mtimeMs > ARCHITECTURE_CACHE_MAX_AGE_MS)
          await unlink2(path);
      } catch {
      }
    }));
  } catch {
  }
}
function isArchitectureEntry(value) {
  if (!isRecord8(value) || !isRecord8(value.snapshot) || !Array.isArray(value.decisionRules) || !Array.isArray(value.decisionDiagnostics))
    return false;
  const snapshot = value.snapshot;
  const edge = (entry2) => isRecord8(entry2) && typeof entry2.from === "string" && typeof entry2.to === "string";
  return snapshot.architectureSnapshotVersion === 1 && typeof snapshot.fingerprint === "string" && typeof snapshot.sourceFingerprint === "string" && Array.isArray(snapshot.edges) && snapshot.edges.every(edge) && Array.isArray(snapshot.cycles) && snapshot.cycles.every((cycle) => Array.isArray(cycle) && cycle.every((path) => typeof path === "string")) && Array.isArray(snapshot.coupling) && Array.isArray(snapshot.boundaryViolations) && isRecord8(snapshot.truncated) && value.decisionRules.every((rule) => isRecord8(rule) && ["decisionId", "decisionPath", "decisionTitle", "from", "deny"].every((key2) => typeof rule[key2] === "string"));
}
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function checksum(value) {
  return createHash2("sha256").update(value).digest("hex");
}
function historicalPackageScripts(files, diagnostics) {
  return files.filter((file) => file.path === "package.json" || file.path.endsWith("/package.json")).flatMap((manifest) => {
    if (manifest.textSampleComplete !== true)
      return [];
    try {
      const parsed2 = JSON.parse(manifest.textSample.replace(/^﻿/, ""));
      const packageDir = manifest.path.includes("/") ? manifest.path.slice(0, manifest.path.lastIndexOf("/")) : "";
      const packageName2 = typeof parsed2.name === "string" && parsed2.name.trim() ? parsed2.name.trim() : void 0;
      const scripts = isRecord8(parsed2.scripts) ? parsed2.scripts : {};
      return Object.entries(scripts).flatMap(([name, command]) => typeof command === "string" ? [{ name, command, packageDir, ...packageName2 ? { packageName: packageName2 } : {} }] : []);
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message: `Could not parse ${manifest.path} at this commit; scripts from that package were skipped.`
      });
      return [];
    }
  });
}
function validateRef(value) {
  const ref = value.trim();
  if (!ref || ref.length > MAX_REF_LENGTH || /[\0\r\n]/.test(ref))
    throw new Error("Git ref must be a bounded single-line value.");
  return ref;
}
async function resolveCommit(repoRoot, ref) {
  try {
    const { stdout } = await exec2("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const commit = stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(commit))
      throw new Error("Git returned an invalid commit identity.");
    return commit.toLowerCase();
  } catch (error) {
    throw new Error(`Could not resolve Git ref ${JSON.stringify(ref)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function parseTree(value) {
  return value.split("\0").flatMap((record3) => {
    if (!record3)
      return [];
    const tab = record3.indexOf("	");
    const header = tab === -1 ? "" : record3.slice(0, tab);
    const path = tab === -1 ? "" : record3.slice(tab + 1).replace(/\\/g, "/");
    const match = /^(\d+) blob ([a-f0-9]{40,64})\s+(\d+)$/.exec(header);
    if (!match || !safePath(path))
      return [];
    return [{ mode: match[1], oid: match[2].toLowerCase(), size: Number(match[3]), path }];
  });
}
async function readBlobs(repoRoot, entries) {
  if (entries.length === 0)
    return /* @__PURE__ */ new Map();
  const uniqueOids = [...new Set(entries.map((entry2) => entry2.oid))];
  const child = spawn("git", ["cat-file", "--batch"], { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  child.stdout.on("data", (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > MAX_BATCH_OUTPUT_BYTES)
      child.kill();
    else
      stdout.push(chunk);
  });
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.on("error", () => void 0);
  child.stdin.end(`${uniqueOids.join("\n")}
`);
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", resolveExit);
  });
  if (exitCode !== 0 || outputBytes > MAX_BATCH_OUTPUT_BYTES) {
    throw new Error(`git cat-file failed while reading historical sources: ${Buffer.concat(stderr).toString("utf8").trim() || `exit ${exitCode}`}`);
  }
  return parseBatch(Buffer.concat(stdout), uniqueOids);
}
function parseBatch(output, oids) {
  const result = /* @__PURE__ */ new Map();
  let offset = 0;
  for (const expected of oids) {
    const newline = output.indexOf(10, offset);
    if (newline === -1)
      throw new Error("git cat-file returned a truncated header.");
    const header = output.subarray(offset, newline).toString("ascii");
    const match = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(header);
    if (!match || match[1].toLowerCase() !== expected)
      throw new Error("git cat-file returned an unexpected object.");
    const size = Number(match[2]);
    const start = newline + 1;
    const end = start + size;
    if (!Number.isSafeInteger(size) || end >= output.length || output[end] !== 10) {
      throw new Error("git cat-file returned a truncated object.");
    }
    result.set(expected, output.subarray(start, end));
    offset = end + 1;
  }
  if (offset !== output.length)
    throw new Error("git cat-file returned trailing output.");
  return result;
}
function inferPackageManager(entries) {
  const names = new Set(entries.map((entry2) => entry2.path.split("/").at(-1)?.toLowerCase()));
  if (names.has("pnpm-lock.yaml"))
    return "pnpm";
  if (names.has("yarn.lock"))
    return "yarn";
  if (names.has("bun.lock") || names.has("bun.lockb"))
    return "bun";
  return "npm";
}
function safePath(path) {
  return Boolean(path) && !path.includes("\0") && !path.includes("\uFFFD") && !/^[\/]/.test(path) && path.split("/").every((part) => part && part !== "." && part !== "..");
}

// packages/core/dist/custom-language-context.js
var KINDS = /* @__PURE__ */ new Set(["function", "method", "class", "interface", "type", "variable"]);
var record = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
var term = (value) => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value);
var fields = (value, allowed) => Object.keys(value).every((key2) => allowed.includes(key2));
var repoPath = (value) => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f\\:]/.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
var MAX_RECORDED_FAILURES = 200;
function validImports(value) {
  return Array.isArray(value) && value.length <= 2e3 && value.every((entry2) => record(entry2) && fields(entry2, ["specifier", "importedNames", "wildcard"]) && term(entry2.specifier) && typeof entry2.wildcard === "boolean" && Array.isArray(entry2.importedNames) && entry2.importedNames.length <= 200 && entry2.importedNames.every(term));
}
function validDefinitions(value, textLength) {
  return Array.isArray(value) && value.length <= 2e3 && value.every((entry2) => record(entry2) && fields(entry2, ["name", "kind", "offset"]) && term(entry2.name) && typeof entry2.kind === "string" && KINDS.has(entry2.kind) && (entry2.offset === void 0 || Number.isInteger(entry2.offset) && entry2.offset >= 0 && entry2.offset < textLength));
}
function createCustomLanguageContext(registry) {
  const cache = /* @__PURE__ */ new WeakMap();
  const failures = /* @__PURE__ */ new Map();
  let failureCount = 0;
  const recordFailure = (failure) => {
    const key2 = [failure.adapter, failure.path, failure.code].join("\0");
    if (failures.has(key2))
      return;
    failureCount += 1;
    if (failures.size < MAX_RECORDED_FAILURES)
      failures.set(key2, failure);
  };
  return Object.freeze({
    /** Detached, sorted, bounded failures; total counts every distinct failure seen. */
    failures() {
      const entries = [...failures.values()].map((entry2) => ({ ...entry2 })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.code < right.code ? -1 : left.code > right.code ? 1 : 0);
      return { total: failureCount, entries };
    },
    supports(extension) {
      return registry.customForExtension(extension) !== void 0;
    },
    resolve(extension, fromPath, imported, candidatePaths) {
      const adapter = registry.customForExtension(extension);
      if (!adapter)
        return { status: "unsupported" };
      try {
        if (!repoPath(fromPath) || !validImports([imported]) || !Array.isArray(candidatePaths) || candidatePaths.length > 25e3 || !candidatePaths.every(repoPath))
          throw new Error();
        const candidates = [...new Set(candidatePaths)].sort();
        const allowed = new Set(candidates);
        if (!allowed.has(fromPath))
          throw new Error();
        const input = Object.freeze({
          fromPath,
          imported: Object.freeze({ ...imported, importedNames: Object.freeze([...imported.importedNames]) }),
          candidatePaths: Object.freeze(candidates)
        });
        const proposed = adapter.resolveImport(input);
        if (!Array.isArray(proposed) || proposed.length > 200 || !proposed.every((target) => repoPath(target) && allowed.has(target)))
          throw new Error();
        return { status: "ok", targets: [...new Set(proposed)].filter((target) => target !== fromPath).sort() };
      } catch {
        if (repoPath(fromPath))
          recordFailure({ adapter: adapter.id, path: fromPath, code: "adapter-resolution-failed" });
        return { status: "failed", adapter: adapter.id, code: "adapter-resolution-failed" };
      }
    },
    extract(file) {
      const extension = file.extension.toLowerCase();
      const adapter = registry.customForExtension(extension);
      if (!adapter)
        return { status: "unsupported" };
      const text2 = file.searchTextSample ?? file.textSample;
      const previous = cache.get(file);
      if (previous?.path === file.path && previous.extension === extension && previous.text === text2)
        return structuredClone(previous.result);
      let result;
      if (text2.length > 64e3 || file.path.length > 4096 || !file.path || /[\x00-\x1f\x7f\\:]/.test(file.path) || file.path.split("/").some((part) => !part || part === "." || part === "..")) {
        result = { status: "failed", adapter: adapter.id, code: "adapter-input-invalid" };
      } else {
        try {
          const rawImports = adapter.extractImports(text2);
          if (!validImports(rawImports))
            throw new Error();
          const imports = structuredClone(rawImports);
          const rawDefinitions = adapter.extractDefinitions(text2);
          if (!validDefinitions(rawDefinitions, text2.length))
            throw new Error();
          const definitions = structuredClone(rawDefinitions);
          const isTest = adapter.isTestPath(file.path);
          if (!validImports(imports) || !validDefinitions(definitions, text2.length) || typeof isTest !== "boolean")
            throw new Error();
          result = { status: "ok", facts: { adapter: adapter.id, version: adapter.version, imports, definitions, isTest } };
        } catch {
          result = { status: "failed", adapter: adapter.id, code: "adapter-extraction-failed" };
        }
      }
      if (result.status === "failed" && repoPath(file.path)) {
        recordFailure({ adapter: adapter.id, path: file.path, code: result.code });
      }
      cache.set(file, { path: file.path, extension, text: text2, result });
      return structuredClone(result);
    }
  });
}

// packages/core/dist/evidence.js
var PROVIDER_ID2 = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
var DEFAULT_MAX_ITEMS = 5e3;
var DEFAULT_MAX_RELATIONSHIPS = 1e4;
var DEFAULT_TIMEOUT_MS2 = 3e4;
async function collectEvidence(providers, context, options = {}) {
  const now = normalizeNow(options.now);
  const diagnostics = [];
  const items = [];
  const relationships = [];
  const seenProviders = /* @__PURE__ */ new Set();
  for (const provider of [...providers].sort((a, b) => a.id.localeCompare(b.id))) {
    const label = provider.id || "<unnamed>";
    if (!PROVIDER_ID2.test(provider.id) || !provider.version.trim()) {
      diagnostics.push({
        provider: label,
        severity: "error",
        code: "provider-invalid",
        message: `Evidence provider ${label} has an invalid ID or empty version.`
      });
      continue;
    }
    if (seenProviders.has(provider.id)) {
      diagnostics.push({
        provider: provider.id,
        severity: "error",
        code: "duplicate-provider",
        message: `Evidence provider ${provider.id} was registered more than once; duplicate results were ignored.`
      });
      continue;
    }
    seenProviders.add(provider.id);
    const networkDisallowed = provider.capabilities.network === "required" && options.allowNetwork !== true;
    const executionDisallowed = provider.capabilities.executesCode && options.allowCodeExecution !== true;
    if (networkDisallowed || executionDisallowed) {
      const reasons = [networkDisallowed ? "network access" : "", executionDisallowed ? "code execution" : ""].filter(Boolean).join(" and ");
      diagnostics.push({
        provider: provider.id,
        severity: "info",
        code: "provider-disallowed",
        message: `Evidence provider ${provider.id} was not run because it requires ${reasons}; opt in explicitly to allow it.`
      });
      continue;
    }
    const controller = new AbortController();
    try {
      const result = await withTimeout(Promise.resolve(provider.collect({
        ...context,
        permissions: {
          network: options.allowNetwork === true,
          codeExecution: options.allowCodeExecution === true
        },
        now,
        signal: controller.signal
      })), positiveInteger2(options.timeoutMs, DEFAULT_TIMEOUT_MS2), controller);
      const validated = validateProviderResult(result);
      if (!validated.success) {
        diagnostics.push({
          provider: provider.id,
          severity: "error",
          code: "provider-invalid",
          message: `Evidence provider ${provider.id} returned invalid evidence: ${validated.message}`
        });
        continue;
      }
      const maxItems = positiveInteger2(options.maxItemsPerProvider, DEFAULT_MAX_ITEMS);
      const maxRelationships = positiveInteger2(options.maxRelationshipsPerProvider, DEFAULT_MAX_RELATIONSHIPS);
      const selectedItems = validated.items.slice(0, maxItems);
      const selectedItemIds = new Set(selectedItems.map((item) => item.id));
      const selectedRelationships = validated.relationships.filter((relationship) => selectedItemIds.has(relationship.from) && selectedItemIds.has(relationship.to)).slice(0, maxRelationships);
      if (validated.items.length > selectedItems.length || validated.relationships.length > selectedRelationships.length) {
        diagnostics.push({
          provider: provider.id,
          severity: "warning",
          code: "provider-truncated",
          message: `Evidence provider ${provider.id} was bounded to ${selectedItems.length.toLocaleString()} item(s) and ${selectedRelationships.length.toLocaleString()} relationship(s).`
        });
      }
      const provenance = { id: provider.id, version: provider.version };
      items.push(...selectedItems.map((item) => ({
        ...item,
        id: namespaceId(provider.id, item.id),
        provider: provenance
      })));
      relationships.push(...selectedRelationships.map((relationship) => ({
        ...relationship,
        id: namespaceId(provider.id, relationship.id),
        from: namespaceId(provider.id, relationship.from),
        to: namespaceId(provider.id, relationship.to),
        provider: provenance
      })));
    } catch (error) {
      diagnostics.push({
        provider: provider.id,
        severity: "warning",
        code: "provider-failed",
        message: `Evidence provider ${provider.id} failed without aborting FixMap: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      controller.abort();
    }
  }
  return {
    evidenceVersion: 1,
    collectedAt: now,
    items: items.sort((a, b) => a.id.localeCompare(b.id)),
    relationships: relationships.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics
  };
}
function validateProviderResult(result) {
  if (!isRecord9(result) || !Array.isArray(result.items) || !(result.relationships === void 0 || Array.isArray(result.relationships))) {
    return { success: false, message: "expected { items, relationships? } arrays" };
  }
  const items = result.items;
  const relationships = result.relationships ?? [];
  const itemIds = /* @__PURE__ */ new Set();
  for (const candidate of items) {
    const message2 = validateEvidenceItem(candidate);
    if (message2)
      return { success: false, message: message2 };
    const item = candidate;
    if (itemIds.has(item.id))
      return { success: false, message: `duplicate item ID ${item.id}` };
    itemIds.add(item.id);
  }
  const relationshipIds = /* @__PURE__ */ new Set();
  for (const candidate of relationships) {
    const message2 = validateRelationship(candidate, itemIds);
    if (message2)
      return { success: false, message: message2 };
    const relationship = candidate;
    if (relationshipIds.has(relationship.id))
      return { success: false, message: `duplicate relationship ID ${relationship.id}` };
    relationshipIds.add(relationship.id);
  }
  return {
    success: true,
    items: items.map((item) => structuredClone(item)),
    relationships: relationships.map((relationship) => structuredClone(relationship))
  };
}
function validateEvidenceItem(candidate) {
  if (!isRecord9(candidate) || typeof candidate.id !== "string" || !LOCAL_ID.test(candidate.id))
    return "an item has an invalid ID";
  if (!isEvidenceKind(candidate.kind))
    return `item ${candidate.id} has an invalid kind`;
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 1e3)
    return `item ${candidate.id} has an invalid summary`;
  if (!isConfidence(candidate.confidence))
    return `item ${candidate.id} has invalid confidence`;
  if (!Array.isArray(candidate.subjects) || candidate.subjects.length === 0 || candidate.subjects.length > 100 || !candidate.subjects.every(isEvidenceSubject))
    return `item ${candidate.id} has invalid subjects`;
  if (candidate.observedAt !== void 0 && (typeof candidate.observedAt !== "string" || !Number.isFinite(Date.parse(candidate.observedAt))))
    return `item ${candidate.id} has an invalid observedAt timestamp`;
  if (candidate.metadata !== void 0 && !isScalarMetadata(candidate.metadata))
    return `item ${candidate.id} has invalid metadata`;
  return void 0;
}
function validateRelationship(candidate, itemIds) {
  if (!isRecord9(candidate) || typeof candidate.id !== "string" || !LOCAL_ID.test(candidate.id))
    return "a relationship has an invalid ID";
  if (typeof candidate.from !== "string" || !itemIds.has(candidate.from) || typeof candidate.to !== "string" || !itemIds.has(candidate.to))
    return `relationship ${candidate.id} references an unknown item`;
  if (typeof candidate.relation !== "string" || !candidate.relation.trim() || candidate.relation.length > 100)
    return `relationship ${candidate.id} has an invalid relation`;
  if (typeof candidate.reason !== "string" || !candidate.reason.trim() || candidate.reason.length > 1e3)
    return `relationship ${candidate.id} has an invalid reason`;
  if (!isConfidence(candidate.confidence))
    return `relationship ${candidate.id} has invalid confidence`;
  return void 0;
}
function isEvidenceSubject(candidate) {
  if (!isRecord9(candidate))
    return false;
  if (candidate.kind === "repository")
    return typeof candidate.repository === "string" && candidate.repository.trim().length > 0;
  if (candidate.kind === "package")
    return typeof candidate.name === "string" && candidate.name.trim().length > 0 && candidate.name.length <= 300 && (candidate.version === void 0 || typeof candidate.version === "string" && candidate.version.trim().length > 0 && candidate.version.length <= 300) && (candidate.purl === void 0 || typeof candidate.purl === "string" && candidate.purl.startsWith("pkg:") && candidate.purl.length <= 1e3);
  if (candidate.kind === "file")
    return typeof candidate.path === "string" && isSafeRelativePath(candidate.path);
  if (candidate.kind === "symbol")
    return typeof candidate.path === "string" && isSafeRelativePath(candidate.path) && typeof candidate.symbol === "string" && candidate.symbol.trim().length > 0;
  if (candidate.kind === "contract")
    return typeof candidate.name === "string" && candidate.name.trim().length > 0 && (candidate.path === void 0 || typeof candidate.path === "string" && isSafeRelativePath(candidate.path));
  return candidate.kind === "runtime" && typeof candidate.name === "string" && candidate.name.trim().length > 0;
}
function isSafeRelativePath(path) {
  if (!path.trim() || path.includes("\0") || /^[\\/]/.test(path) || /^[A-Za-z]:/.test(path))
    return false;
  return path.replace(/\\/g, "/").split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isScalarMetadata(candidate) {
  if (!isRecord9(candidate) || Object.keys(candidate).length > 50)
    return false;
  return Object.entries(candidate).every(([key2, value]) => key2.length > 0 && key2.length <= 100 && (typeof value === "string" && value.length <= 1e3 || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)));
}
function isEvidenceKind(candidate) {
  return ["structure", "semantic", "history", "human-intent", "contract", "runtime", "security", "ownership", "custom"].includes(String(candidate));
}
function isConfidence(candidate) {
  return candidate === "high" || candidate === "medium" || candidate === "low";
}
function namespaceId(provider, local) {
  return `${provider}:${local}`;
}
function normalizeNow(now) {
  if (now === void 0)
    return (/* @__PURE__ */ new Date()).toISOString();
  if (!Number.isFinite(Date.parse(now)))
    throw new Error(`Invalid evidence collection timestamp: ${now}`);
  return new Date(now).toISOString();
}
function positiveInteger2(value, fallback) {
  return value !== void 0 && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function withTimeout(promise, timeoutMs, controller) {
  return new Promise((resolve11, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs.toLocaleString()} ms`));
    }, timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve11(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
function isRecord9(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

// packages/core/dist/report-evidence.js
var MAX_REPORT_EVIDENCE_ITEMS = 50;
async function attachReportEvidence(report, repo, sources, context) {
  const collected = await collectEvidence(sources.map((source) => source.provider), { repo, issueText: context.issueText, diffText: repo.diffText ?? "" }, { allowNetwork: false, allowCodeExecution: false, ...context.now ? { now: context.now } : {} });
  const paths = reportPaths(report);
  const relevant = collected.items.filter((item) => item.subjects.some((subject) => (subject.kind === "file" || subject.kind === "symbol" || subject.kind === "contract") && "path" in subject && typeof subject.path === "string" && paths.has(subject.path)));
  const items = relevant.slice(0, MAX_REPORT_EVIDENCE_ITEMS);
  return {
    evidenceVersion: 1,
    collectedAt: collected.collectedAt,
    sources: sources.map((source) => ({
      provider: source.provider.id,
      version: source.provider.version,
      ...source.documentSha256 ? { documentSha256: source.documentSha256 } : {}
    })),
    items,
    omittedItems: collected.items.length - items.length,
    diagnostics: collected.diagnostics
  };
}
function reportPaths(report) {
  return /* @__PURE__ */ new Set([
    ...report.contextFiles.map((file) => file.path),
    ...(report.impact?.files ?? []).map((file) => file.path),
    ...report.changedFiles
  ]);
}

// packages/core/dist/contract-baseline.js
import { execFile as execFile4 } from "node:child_process";
import { resolve as resolve4 } from "node:path";
import { promisify as promisify4 } from "node:util";

// packages/core/dist/identity-graph.js
var ID_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
var FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,255}$/;
var ENTITY_KINDS = /* @__PURE__ */ new Set([
  "repository",
  "service",
  "package",
  "module",
  "file",
  "symbol",
  "contract",
  "runtime-component",
  "deployment"
]);
var RELATIONSHIP_KINDS = /* @__PURE__ */ new Set([
  "contains",
  "depends-on",
  "rationale-for",
  "mentions",
  "imports",
  "implements",
  "publishes",
  "observed-as",
  "deployed-as",
  "aliases",
  "equivalent-to"
]);
function createGraphIdentity(input) {
  if (!ENTITY_KINDS.has(input.kind))
    throw new Error(`Invalid graph entity kind: ${String(input.kind)}`);
  validateIdentityScope(input.workspace, "workspace");
  validateIdentityKey(input.key, "key");
  if (input.repository)
    validateIdentityScope(input.repository, "repository");
  if (input.parent && !input.parent.startsWith("fixmap://"))
    throw new Error("Graph identity parent must be a FixMap identity.");
  const base = `fixmap://workspace/${encodePart(input.workspace)}`;
  if (input.kind === "repository")
    return `${base}/repository/${encodePart(input.key)}`;
  const scope = input.parent ? input.parent : input.repository ? `${base}/repository/${encodePart(input.repository)}` : base;
  return `${scope}/${input.kind}/${encodePart(input.key)}`;
}
function createGraphEdgeIdentity(kind, from, to) {
  if (!RELATIONSHIP_KINDS.has(kind))
    throw new Error(`Invalid graph relationship kind: ${String(kind)}`);
  if (!from.startsWith("fixmap://") || !to.startsWith("fixmap://"))
    throw new Error("Graph edges require FixMap node identities.");
  const [left, right] = kind === "aliases" || kind === "equivalent-to" ? [from, to].sort() : [from, to];
  return `fixmap-edge:${kind}:${stableHash4(`${left}\0${right}`)}`;
}
function buildIdentityGraph(input) {
  validateIdentityScope(input.workspace, "workspace");
  const nodes = [...input.nodes].map(copyNode).sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...input.edges].map(copyEdge).sort((a, b) => a.id.localeCompare(b.id));
  validateGraphElements(input.workspace, nodes, edges);
  const fingerprint = stableHash4(canonicalize3({ workspace: input.workspace, nodes, edges }));
  return {
    identityGraphVersion: 1,
    workspace: input.workspace,
    version: {
      sequence: input.sequence ?? 1,
      fingerprint,
      ...input.parentFingerprint ? { parentFingerprint: input.parentFingerprint } : {}
    },
    nodes,
    edges
  };
}
function validateGraphElements(workspace, nodes, edges) {
  const workspacePrefix = `fixmap://workspace/${encodePart(workspace)}/`;
  const nodeIds = /* @__PURE__ */ new Set();
  const repositoryKeys = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    if (!node.id.startsWith(workspacePrefix))
      throw new Error(`Graph node identity does not belong to workspace ${workspace}: ${node.id}`);
    const canonicalId = createGraphIdentity({
      workspace,
      kind: node.kind,
      key: node.key,
      ...node.repository ? { repository: node.repository } : {},
      ...node.parent ? { parent: node.parent } : {}
    });
    if (node.id !== canonicalId)
      throw new Error(`Graph node ${node.id} is not canonically identified.`);
    if (node.kind === "repository" && node.parent)
      throw new Error(`Repository node ${node.id} cannot have a parent.`);
    if (node.kind !== "repository" && !node.parent)
      throw new Error(`Graph node ${node.id} requires a hierarchical parent.`);
    if (node.kind === "repository")
      repositoryKeys.add(node.key);
    if (nodeIds.has(node.id))
      throw new Error(`Duplicate graph node identity: ${node.id}`);
    nodeIds.add(node.id);
    validateDerivations(node.derivedFrom);
  }
  const edgeIds = /* @__PURE__ */ new Set();
  for (const edge of edges) {
    if (!RELATIONSHIP_KINDS.has(edge.kind))
      throw new Error(`Invalid graph relationship kind: ${String(edge.kind)}`);
    if (!["high", "medium", "low"].includes(edge.confidence)) {
      throw new Error(`Graph edge ${edge.id} has invalid confidence.`);
    }
    if (edge.id !== createGraphEdgeIdentity(edge.kind, edge.from, edge.to))
      throw new Error(`Graph edge ${edge.id} is not canonically identified.`);
    if (edgeIds.has(edge.id))
      throw new Error(`Duplicate graph edge identity: ${edge.id}`);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
      throw new Error(`Graph edge ${edge.id} references an unknown node.`);
    if (!edge.reason.trim())
      throw new Error(`Graph edge ${edge.id} needs a reason.`);
    validateDerivations(edge.derivedFrom);
    edgeIds.add(edge.id);
  }
  for (const node of nodes) {
    if (node.parent && !nodeIds.has(node.parent))
      throw new Error(`Graph node ${node.id} references an unknown parent.`);
    for (const derivation of node.derivedFrom)
      validateDerivationReference(derivation, nodeIds, edgeIds, repositoryKeys);
  }
  for (const edge of edges) {
    for (const derivation of edge.derivedFrom)
      validateDerivationReference(derivation, nodeIds, edgeIds, repositoryKeys);
  }
}
function validateDerivationReference(derivation, nodes, edges, repositories) {
  if (derivation.kind === "source" && !repositories.has(derivation.repository)) {
    throw new Error(`Graph derivation references unknown repository ${derivation.repository}.`);
  }
  if (derivation.kind === "node" && !nodes.has(derivation.id))
    throw new Error(`Graph derivation references unknown node ${derivation.id}.`);
  if (derivation.kind === "edge" && !edges.has(derivation.id))
    throw new Error(`Graph derivation references unknown edge ${derivation.id}.`);
}
function validateDerivations(derivations) {
  for (const derivation of derivations) {
    if (derivation.kind === "source") {
      validateIdentityScope(derivation.repository, "source repository");
      validateSourcePath(derivation.path);
      if (!FINGERPRINT.test(derivation.fingerprint))
        throw new Error(`Invalid graph source fingerprint for ${derivation.path}.`);
    } else if (!derivation.id.trim()) {
      throw new Error("Graph element derivation needs an identity.");
    }
  }
}
function validateSourcePath(path) {
  if (!path.trim() || path.includes("\0") || /^[\\/]/.test(path) || /^[A-Za-z]:/.test(path) || path.replace(/\\/g, "/").split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid graph source path: ${path}`);
  }
}
function validateIdentityScope(value, label) {
  if (!ID_SCOPE.test(value) || value === "." || value === "..")
    throw new Error(`Invalid graph identity ${label}: ${value}`);
}
function validateIdentityKey(value, label) {
  const segments = value.split("/");
  if (!value.trim() || value !== value.trim() || value.length > 512 || /[\0-\x1f\x7f]/.test(value) || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid graph identity ${label}: ${value}`);
  }
}
function encodePart(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}
function copyNode(node) {
  return {
    ...node,
    ...node.attributes ? { attributes: { ...node.attributes } } : {},
    derivedFrom: normalizeDerivations(node.derivedFrom)
  };
}
function copyEdge(edge) {
  return { ...edge, derivedFrom: normalizeDerivations(edge.derivedFrom) };
}
function normalizeDerivations(derivations) {
  const byIdentity = /* @__PURE__ */ new Map();
  for (const derivation of derivations)
    byIdentity.set(canonicalize3(derivation), { ...derivation });
  return [...byIdentity.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, derivation]) => derivation);
}
function canonicalize3(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalize3).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry2]) => entry2 !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key2, entry2]) => `${JSON.stringify(key2)}:${canonicalize3(entry2)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function stableHash4(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

// packages/core/dist/yaml-subset.js
var YamlSubsetError = class extends Error {
};
var MAX_DEPTH = 64;
function parseYamlSubset(content) {
  const lines = toLines(content);
  if (lines.length === 0)
    return null;
  const state = { lines, index: 0 };
  const value = parseNode(state, lines[0].indent, 0);
  if (state.index < lines.length)
    fail(lines[state.index], "unexpected content after the document");
  return value;
}
function toLines(content) {
  const rawLines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = [];
  let started = false;
  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    if (/^%/.test(raw) && !started)
      continue;
    if (/^---(?:\s|$)/.test(raw)) {
      if (started || lines.length > 0)
        throw new YamlSubsetError(`line ${index + 1}: multiple YAML documents are not supported`);
      started = true;
      if (raw.slice(3).trim() && !raw.slice(3).trim().startsWith("#")) {
        throw new YamlSubsetError(`line ${index + 1}: content on the document marker is not supported`);
      }
      continue;
    }
    if (/^\.\.\.(?:\s|$)/.test(raw)) {
      if (rawLines.slice(index + 1).some((rest) => rest.trim() && !rest.trim().startsWith("#"))) {
        throw new YamlSubsetError(`line ${index + 1}: multiple YAML documents are not supported`);
      }
      break;
    }
    const leading = /^[ \t]*/.exec(raw)[0];
    const text2 = stripComment(raw.slice(leading.length)).trimEnd();
    if (!text2) {
      lines.push({ number: index + 1, indent: -1, text: "", raw });
      continue;
    }
    if (leading.includes("	"))
      throw new YamlSubsetError(`line ${index + 1}: tab indentation is not supported`);
    lines.push({ number: index + 1, indent: leading.length, text: text2, raw });
  }
  return lines;
}
function stripComment(text2) {
  if (text2.startsWith("#"))
    return "";
  let quote;
  for (let index = 0; index < text2.length; index += 1) {
    const char = text2[index];
    if (quote) {
      if (quote === '"' && char === "\\")
        index += 1;
      else if (char === quote)
        quote = void 0;
      continue;
    }
    if ((char === '"' || char === "'") && (index === 0 || /[\s:\[\]{},-]/.test(text2[index - 1])))
      quote = char;
    else if (char === "#" && /\s/.test(text2[index - 1] ?? ""))
      return text2.slice(0, index);
  }
  return text2;
}
function current(state) {
  while (state.index < state.lines.length && state.lines[state.index].indent < 0)
    state.index += 1;
  return state.lines[state.index];
}
function parseNode(state, indent, depth5) {
  if (depth5 > MAX_DEPTH)
    throw new YamlSubsetError("YAML nesting is deeper than FixMap reads");
  const line = current(state);
  if (!line || line.indent < indent)
    return null;
  if (isSequenceItem(line.text))
    return parseSequence(state, line.indent, depth5);
  if (splitKey(line.text))
    return parseMapping(state, line.indent, depth5);
  state.index += 1;
  return parseInlineValue(line, line.text, state, line.indent, depth5);
}
function isSequenceItem(text2) {
  return text2 === "-" || text2.startsWith("- ");
}
function parseSequence(state, indent, depth5) {
  const values = [];
  for (let line = current(state); line && line.indent === indent && isSequenceItem(line.text); line = current(state)) {
    const rest = line.text.slice(1).trimStart();
    if (!rest) {
      state.index += 1;
      const next = current(state);
      values.push(next && next.indent > indent ? parseNode(state, next.indent, depth5 + 1) : null);
      continue;
    }
    const column = indent + (line.text.length - rest.length);
    state.lines[state.index] = { ...line, indent: column, text: rest };
    if (isSequenceItem(rest) || splitKey(rest))
      values.push(parseNode(state, column, depth5 + 1));
    else {
      state.index += 1;
      values.push(parseInlineValue(line, rest, state, indent, depth5));
    }
  }
  const after = current(state);
  if (after && after.indent > indent)
    fail(after, "unexpected indentation in a sequence");
  return values;
}
function parseMapping(state, indent, depth5) {
  const result = {};
  for (let line = current(state); line && line.indent === indent; line = current(state)) {
    const split = splitKey(line.text);
    if (!split)
      fail(line, "expected a mapping key");
    const key2 = parseKey(line, split.key);
    if (key2 === "<<")
      fail(line, "merge keys are not supported");
    if (Object.prototype.hasOwnProperty.call(result, key2))
      fail(line, `duplicate key ${JSON.stringify(key2)}`);
    state.index += 1;
    if (!split.value) {
      const next = current(state);
      if (next && (next.indent > indent || next.indent === indent && isSequenceItem(next.text))) {
        result[key2] = parseNode(state, next.indent, depth5 + 1);
      } else {
        result[key2] = null;
      }
    } else {
      result[key2] = parseInlineValue(line, split.value, state, indent, depth5);
    }
  }
  const after = current(state);
  if (after && after.indent > indent)
    fail(after, "unexpected indentation in a mapping");
  return result;
}
function splitKey(text2) {
  if (isSequenceItem(text2) || text2.startsWith("{") || text2.startsWith("["))
    return void 0;
  let index = 0;
  if (text2.startsWith('"') || text2.startsWith("'")) {
    const end = closingQuote(text2, 0);
    if (end === -1)
      return void 0;
    index = end + 1;
    const rest = text2.slice(index);
    const match = /^\s*:(?:\s|$)/.exec(rest);
    if (!match)
      return void 0;
    return { key: text2.slice(0, index), value: rest.slice(match[0].length).trim() };
  }
  for (; index < text2.length; index += 1) {
    if (text2[index] === ":" && (index + 1 === text2.length || /\s/.test(text2[index + 1]))) {
      return { key: text2.slice(0, index).trimEnd(), value: text2.slice(index + 1).trim() };
    }
  }
  return void 0;
}
function parseKey(line, raw) {
  if (raw.startsWith("? "))
    fail(line, "complex mapping keys are not supported");
  if (raw.startsWith('"') || raw.startsWith("'"))
    return parseQuoted(line, raw);
  if (/^[&*!]/.test(raw))
    fail(line, "anchors, aliases, and tags are not supported");
  return raw;
}
function parseInlineValue(line, value, state, parentIndent, depth5) {
  if (/^[&*!]/.test(value))
    fail(line, "anchors, aliases, and tags are not supported");
  if (/^[|>]/.test(value))
    return parseBlockScalar(line, value, state, parentIndent);
  if (value.startsWith("{") || value.startsWith("[")) {
    let text3 = value;
    while (!flowBalanced(text3)) {
      const next = current(state);
      if (!next || next.indent <= parentIndent)
        fail(line, "unterminated flow collection");
      text3 += ` ${next.text}`;
      state.index += 1;
    }
    const parser = { text: text3, index: 0, line };
    const result = parseFlowValue(parser, depth5);
    skipSpace(parser);
    if (parser.index !== text3.length)
      fail(line, "unexpected content after a flow collection");
    return result;
  }
  if (value.startsWith('"') || value.startsWith("'")) {
    let text3 = value;
    while (closingQuote(text3, 0) === -1) {
      const next = current(state);
      if (!next)
        fail(line, "unterminated quoted scalar");
      text3 += ` ${next.raw.trim()}`;
      state.index += 1;
    }
    const end = closingQuote(text3, 0);
    if (text3.slice(end + 1).trim())
      fail(line, "unexpected content after a quoted scalar");
    return parseQuoted(line, text3);
  }
  let text2 = value;
  for (let next = current(state); next && next.indent > parentIndent; next = current(state)) {
    if (splitKey(next.text) || isSequenceItem(next.text))
      fail(next, "a scalar value cannot also open a nested block");
    text2 += ` ${next.text}`;
    state.index += 1;
  }
  return resolvePlain(text2);
}
function parseBlockScalar(line, header, state, parentIndent) {
  const match = /^([|>])([+-]?)(\d?)([+-]?)$/.exec(header.trim());
  if (!match)
    fail(line, "unsupported block scalar header");
  const folded = match[1] === ">";
  const chomping = match[2] || match[4];
  const explicit = match[3] ? Number(match[3]) : void 0;
  const collected = [];
  let contentIndent = explicit !== void 0 ? parentIndent + explicit : void 0;
  while (state.index < state.lines.length) {
    const next = state.lines[state.index];
    const blank = next.raw.trim() === "";
    const leading = /^ */.exec(next.raw)[0].length;
    if (!blank && leading <= parentIndent)
      break;
    if (!blank) {
      contentIndent ??= leading;
      if (leading < contentIndent)
        fail(next, "block scalar line is less indented than its first line");
    }
    collected.push(blank ? "" : next.raw.slice(contentIndent));
    state.index += 1;
  }
  while (collected.length > 0 && collected.at(-1) === "" && chomping !== "+")
    collected.pop();
  let text2 = folded ? foldLines(collected) : collected.join("\n");
  if (chomping !== "-" && collected.length > 0)
    text2 += "\n";
  return text2;
}
function foldLines(lines) {
  let result = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (index === 0) {
      result = line;
      continue;
    }
    const previous = lines[index - 1];
    if (line === "")
      result += "\n";
    else if (previous === "" || /^\s/.test(line) || /^\s/.test(previous))
      result += (previous === "" ? "" : "\n") + line;
    else
      result += ` ${line}`;
  }
  return result;
}
function resolvePlain(text2) {
  const value = text2.trim();
  if (value === "" || value === "~" || /^(?:null|Null|NULL)$/.test(value))
    return null;
  if (/^(?:true|True|TRUE)$/.test(value))
    return true;
  if (/^(?:false|False|FALSE)$/.test(value))
    return false;
  if (/^[-+]?(?:0|[1-9][0-9]*)$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value;
  }
  if (/^[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/.test(value) || /^[-+]?[0-9]+[eE][-+]?[0-9]+$/.test(value))
    return Number(value);
  return value;
}
function closingQuote(text2, start) {
  const quote = text2[start];
  for (let index = start + 1; index < text2.length; index += 1) {
    if (quote === '"' && text2[index] === "\\") {
      index += 1;
      continue;
    }
    if (text2[index] === quote) {
      if (quote === "'" && text2[index + 1] === "'") {
        index += 1;
        continue;
      }
      return index;
    }
  }
  return -1;
}
function parseQuoted(line, text2) {
  const end = closingQuote(text2, 0);
  if (end === -1)
    fail(line, "unterminated quoted scalar");
  const body = text2.slice(1, end);
  if (text2[0] === "'")
    return body.replace(/''/g, "'");
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, escape) => {
    if (escape.length > 1)
      return String.fromCharCode(parseInt(escape.slice(1), 16));
    const simple = { n: "\n", t: "	", r: "\r", "0": "\0", '"': '"', "\\": "\\", "/": "/", " ": " ", b: "\b", f: "\f" };
    if (!(escape in simple))
      fail(line, `unsupported escape \\${escape}`);
    return simple[escape];
  });
}
function flowBalanced(text2) {
  let depth5 = 0;
  let quote;
  for (let index = 0; index < text2.length; index += 1) {
    const char = text2[index];
    if (quote) {
      if (quote === '"' && char === "\\")
        index += 1;
      else if (char === quote)
        quote = void 0;
    } else if (char === '"' || char === "'")
      quote = char;
    else if (char === "{" || char === "[")
      depth5 += 1;
    else if (char === "}" || char === "]")
      depth5 -= 1;
  }
  return depth5 <= 0 && !quote;
}
function skipSpace(parser) {
  while (parser.index < parser.text.length && /\s/.test(parser.text[parser.index]))
    parser.index += 1;
}
function parseFlowValue(parser, depth5) {
  if (depth5 > MAX_DEPTH)
    throw new YamlSubsetError("YAML nesting is deeper than FixMap reads");
  skipSpace(parser);
  const char = parser.text[parser.index];
  if (char === "{")
    return parseFlowMapping(parser, depth5 + 1);
  if (char === "[")
    return parseFlowSequence(parser, depth5 + 1);
  if (char === '"' || char === "'") {
    const end = closingQuote(parser.text, parser.index);
    if (end === -1)
      fail(parser.line, "unterminated quoted scalar");
    const value = parseQuoted(parser.line, parser.text.slice(parser.index, end + 1));
    parser.index = end + 1;
    return value;
  }
  if (char !== void 0 && /[&*!]/.test(char))
    fail(parser.line, "anchors, aliases, and tags are not supported");
  const start = parser.index;
  while (parser.index < parser.text.length && !/[,\]}]/.test(parser.text[parser.index]) && !(parser.text[parser.index] === ":" && /[\s,\]}]/.test(parser.text[parser.index + 1] ?? " ")))
    parser.index += 1;
  return resolvePlain(parser.text.slice(start, parser.index));
}
function parseFlowSequence(parser, depth5) {
  parser.index += 1;
  const values = [];
  skipSpace(parser);
  if (parser.text[parser.index] === "]") {
    parser.index += 1;
    return values;
  }
  for (; ; ) {
    values.push(parseFlowValue(parser, depth5));
    skipSpace(parser);
    const char = parser.text[parser.index];
    parser.index += 1;
    if (char === "]")
      return values;
    if (char !== ",")
      fail(parser.line, "expected , or ] in a flow sequence");
    skipSpace(parser);
    if (parser.text[parser.index] === "]") {
      parser.index += 1;
      return values;
    }
  }
}
function parseFlowMapping(parser, depth5) {
  parser.index += 1;
  const result = {};
  skipSpace(parser);
  if (parser.text[parser.index] === "}") {
    parser.index += 1;
    return result;
  }
  for (; ; ) {
    const keyValue = parseFlowValue(parser, depth5);
    if (keyValue !== null && typeof keyValue === "object")
      fail(parser.line, "complex mapping keys are not supported");
    const key2 = keyValue === null ? "" : String(keyValue);
    if (key2 === "<<")
      fail(parser.line, "merge keys are not supported");
    if (Object.prototype.hasOwnProperty.call(result, key2))
      fail(parser.line, `duplicate key ${JSON.stringify(key2)}`);
    skipSpace(parser);
    if (parser.text[parser.index] === ":") {
      parser.index += 1;
      skipSpace(parser);
      const next = parser.text[parser.index];
      result[key2] = next === "," || next === "}" ? null : parseFlowValue(parser, depth5);
    } else {
      result[key2] = null;
    }
    skipSpace(parser);
    const char = parser.text[parser.index];
    parser.index += 1;
    if (char === "}")
      return result;
    if (char !== ",")
      fail(parser.line, "expected , or } in a flow mapping");
    skipSpace(parser);
    if (parser.text[parser.index] === "}") {
      parser.index += 1;
      return result;
    }
  }
}
function fail(line, message2) {
  throw new YamlSubsetError(`line ${line.number}: ${message2}`);
}

// packages/core/dist/contracts.js
var HTTP_METHODS = /* @__PURE__ */ new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
var CONTRACT_PATH = /(?:^|\/)(?:openapi|swagger|asyncapi)(?:\.[^/]+)?\.(?:json|ya?ml)$|\.(?:graphql|gql|proto)$|(?:^|\/)migrations?\/.*\.sql$|\.schema\.json$/i;
function contractSourcesFromRepo(repo) {
  const sources = [];
  const diagnostics = [];
  for (const file of repo.files.filter((candidate) => isContractCandidate(candidate.path, candidate.textSample))) {
    if (file.textSampleComplete === false || !file.contentFingerprint || !file.isSource) {
      diagnostics.push({
        code: "contract-source-incomplete",
        severity: "warning",
        path: file.path,
        message: `${file.path} looks like a contract, but its complete content and exact fingerprint were not available.`
      });
      continue;
    }
    sources.push({ path: file.path, content: file.textSample, fingerprint: file.contentFingerprint });
  }
  return { sources: sources.sort((a, b) => a.path.localeCompare(b.path)), diagnostics };
}
function inventoryContracts(sources, inheritedDiagnostics = []) {
  const surfaces = [];
  const diagnostics = inheritedDiagnostics.map((entry2) => ({ ...entry2 }));
  const seenPaths = /* @__PURE__ */ new Set();
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    validateContractSource(source);
    if (seenPaths.has(source.path))
      throw new Error(`Duplicate contract source path: ${source.path}`);
    seenPaths.add(source.path);
    const result = parseContract(source);
    if (result.surface)
      surfaces.push(result.surface);
    if (result.diagnostic)
      diagnostics.push(result.diagnostic);
  }
  return {
    inventoryVersion: 1,
    surfaces: surfaces.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))
  };
}
function compareContractInventories(previous, current2) {
  if (previous.inventoryVersion !== 1 || current2.inventoryVersion !== 1) {
    throw new Error("Unsupported contract inventory version.");
  }
  const changes = [];
  const beforeById = uniqueSurfaceIndex(previous.surfaces, "previous");
  const afterById = uniqueSurfaceIndex(current2.surfaces, "current");
  const unavailableBefore = unavailableContractPaths(previous.diagnostics);
  const unavailableAfter = unavailableContractPaths(current2.diagnostics);
  for (const [id, before] of beforeById) {
    const after = afterById.get(id);
    if (!after) {
      if (unavailableAfter.has(before.path)) {
        changes.push(contractChange(before, void 0, "contract-unavailable", "unknown", `${before.kind} contract ${before.name} could not be read on the later side, so its compatibility is unknown.`));
        continue;
      }
      changes.push(contractChange(before, void 0, "contract-removed", "breaking", `Removed ${before.kind} contract ${before.name}.`));
      continue;
    }
    compareSurface(before, after, changes);
  }
  for (const [id, after] of afterById) {
    if (!beforeById.has(id)) {
      if (unavailableBefore.has(after.path)) {
        changes.push(contractChange(void 0, after, "contract-unavailable", "unknown", `${after.kind} contract ${after.name} could not be read on the earlier side, so its compatibility is unknown.`));
        continue;
      }
      changes.push(contractChange(void 0, after, "contract-added", "compatible", `Added ${after.kind} contract ${after.name}.`));
    }
  }
  changes.sort((a, b) => severityOrder2(a.compatibility) - severityOrder2(b.compatibility) || a.path.localeCompare(b.path) || (a.entry ?? "").localeCompare(b.entry ?? "") || a.change.localeCompare(b.change));
  const breaking = changes.filter((change) => change.compatibility === "breaking").length;
  const unknown = changes.filter((change) => change.compatibility === "unknown").length;
  const compatible = changes.length - breaking - unknown;
  return {
    comparisonVersion: 1,
    summary: changes.length === 0 ? "No supported contract surface changed." : `${changes.length} contract change${changes.length === 1 ? "" : "s"}: ${breaking} breaking, ${unknown} unknown, ${compatible} compatible.`,
    changes,
    diagnostics: deduplicateDiagnostics([...previous.diagnostics, ...current2.diagnostics])
  };
}
function compareSurface(before, after, changes) {
  const beforeEntries = new Map(before.entries.map((entry2) => [entry2.key, entry2]));
  const afterEntries = new Map(after.entries.map((entry2) => [entry2.key, entry2]));
  for (const [key2, entry2] of beforeEntries) {
    const current2 = afterEntries.get(key2);
    if (!current2) {
      changes.push(contractChange(before, after, "entry-removed", removalCompatibility(entry2), `Removed ${describeEntry(entry2)}.`, entry2));
    } else if (entry2.signature !== current2.signature || entry2.required !== current2.required) {
      const compatibility = changedCompatibility(entry2, current2);
      const detail = entry2.signature === current2.signature ? `requiredness from ${entry2.required} to ${current2.required}` : `signature from ${entry2.signature} to ${current2.signature}`;
      changes.push(contractChange(before, after, "entry-changed", compatibility, `${describeEntry(entry2)} changed ${detail}.`, current2, entry2.signature, current2.signature));
    }
  }
  for (const [key2, entry2] of afterEntries) {
    if (beforeEntries.has(key2))
      continue;
    const compatibility = additionCompatibility(entry2);
    changes.push(contractChange(before, after, "entry-added", compatibility, additionReason(entry2), entry2));
  }
}
function contractChange(before, after, change, compatibility, reason2, entry2, beforeSignature, afterSignature) {
  const surface = after ?? before;
  const key2 = `${surface.id}\0${change}\0${entry2?.key ?? ""}\0${beforeSignature ?? ""}\0${afterSignature ?? ""}`;
  return {
    id: `contract-change:${stableHash5(key2)}`,
    contractId: surface.id,
    contractKind: surface.kind,
    path: surface.path,
    change,
    compatibility,
    reason: reason2,
    ...entry2 ? { entry: entry2.key } : {},
    ...beforeSignature !== void 0 ? { before: beforeSignature } : {},
    ...afterSignature !== void 0 ? { after: afterSignature } : {},
    evidence: {
      ...before ? { beforeFingerprint: before.sourceFingerprint } : {},
      ...after ? { afterFingerprint: after.sourceFingerprint } : {}
    }
  };
}
function removalCompatibility(entry2) {
  return entry2.role === "migration" ? "unknown" : "breaking";
}
function additionCompatibility(entry2) {
  if (entry2.role === "migration")
    return /^destructive:/.test(entry2.signature) ? "breaking" : "compatible";
  return entry2.required && (entry2.role === "argument" || entry2.role === "required-field") ? "breaking" : "compatible";
}
function changedCompatibility(before, after) {
  if (!before.required && after.required)
    return "breaking";
  if (before.role === "migration")
    return /^destructive:/.test(after.signature) ? "breaking" : "unknown";
  return "breaking";
}
function describeEntry(entry2) {
  return `${entry2.role.replace("-", " ")} ${entry2.key}`;
}
function additionReason(entry2) {
  if (entry2.role === "migration") {
    const [classification, ...statement] = entry2.signature.split(":");
    return `Added ${classification} migration statement: ${statement.join(":")}.`;
  }
  return `Added ${describeEntry(entry2)}${entry2.required ? " as required" : ""}.`;
}
function parseContract(source) {
  const lower = source.path.toLowerCase();
  if (lower.endsWith(".graphql") || lower.endsWith(".gql")) {
    const graphql = parseGraphql(source.content);
    if (graphql.entries.length === 0 && source.content.replace(/#[^\r\n]*/g, "").trim()) {
      return parseFailed(source, "GraphQL source contains no supported type, interface, or input definitions.");
    }
    return parsed(source, "graphql", graphql);
  }
  if (lower.endsWith(".proto")) {
    const syntax = /^\s*(?:syntax|edition)\s*=\s*["']([^"']+)["']/m.exec(source.content.replace(/\/\/[^\r\n]*/g, ""))?.[1];
    return parsed(source, "protobuf", { ...parseProtobuf(source.content), ...syntax ? { version: syntax } : {} });
  }
  if (/(?:^|\/)migrations?\/.*\.sql$/i.test(source.path))
    return parsed(source, "migration", parseMigration(source.content));
  const json = parseJson(source.content);
  if (json)
    return parsedStructured(source, json);
  const yamlLike = /\.ya?ml$/i.test(source.path) || /^\s*(?:openapi|swagger|asyncapi)\s*:/m.test(source.content);
  if (yamlLike) {
    let document;
    try {
      document = parseYamlSubset(source.content);
    } catch (error) {
      if (!(error instanceof YamlSubsetError))
        throw error;
      return parseFailed(source, `YAML ${error.message}.`);
    }
    if (isRecord10(document)) {
      for (const key2 of ["openapi", "swagger", "asyncapi"]) {
        if (typeof document[key2] !== "number")
          continue;
        const written = new RegExp(`^${key2}\\s*:\\s*([^\\s#]+)`, "m").exec(source.content)?.[1];
        if (written)
          document[key2] = written;
      }
      const structured = parsedStructured(source, document);
      if (structured.surface || structured.diagnostic)
        return structured;
    }
  }
  if (CONTRACT_PATH.test(source.path)) {
    return {
      diagnostic: {
        code: "contract-parse-failed",
        severity: "warning",
        path: source.path,
        message: `${source.path} looks like a supported contract, but FixMap could not parse a format marker.`
      }
    };
  }
  return {};
}
function parsedStructured(source, document) {
  const openapi = specVersion(document.openapi) ?? specVersion(document.swagger);
  if (openapi)
    return parsed(source, "openapi", { ...parseOpenApiJson(document), version: openapi });
  const asyncapi = specVersion(document.asyncapi);
  if (asyncapi)
    return parsed(source, "asyncapi", { ...parseAsyncApiJson(document), version: asyncapi });
  if (typeof document.$schema === "string" || isRecord10(document.properties)) {
    return parsed(source, "json-schema", {
      ...parseJsonSchema(document),
      ...typeof document.$schema === "string" ? { version: document.$schema } : {}
    });
  }
  if (CONTRACT_PATH.test(source.path)) {
    return parseFailed(source, "the document has no openapi, swagger, asyncapi, $schema, or properties marker.");
  }
  return {};
}
function specVersion(value) {
  if (typeof value === "string" && value.trim())
    return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(value);
  return void 0;
}
function parseFailed(source, detail) {
  return {
    diagnostic: {
      code: "contract-parse-failed",
      severity: "warning",
      path: source.path,
      message: `${source.path} could not be safely inventoried: ${detail}`
    }
  };
}
function parsed(source, kind, parsedSurface) {
  return {
    surface: {
      id: `contract:${kind}:${source.path.replace(/\\/g, "/")}`,
      kind,
      path: source.path.replace(/\\/g, "/"),
      name: parsedSurface.name ?? source.path.split(/[\\/]/).at(-1) ?? source.path,
      ...parsedSurface.version ? { version: parsedSurface.version } : {},
      sourceFingerprint: source.fingerprint,
      entries: normalizeEntries(parsedSurface.entries)
    }
  };
}
function parseOpenApiJson(root) {
  const entries = [];
  const paths = recordValue(root.paths);
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathRecord = recordValue(pathValue);
    for (const [method, operationValue] of Object.entries(pathRecord)) {
      if (!HTTP_METHODS.has(method.toLowerCase()))
        continue;
      const operation = `${method.toUpperCase()} ${path}`;
      entries.push(entry(`operation:${operation}`, "operation", operation));
      const parameters = Array.isArray(recordValue(operationValue).parameters) ? recordValue(operationValue).parameters : [];
      for (const parameterValue of parameters) {
        const parameter = recordValue(parameterValue);
        if (typeof parameter.name !== "string")
          continue;
        const location = typeof parameter.in === "string" ? parameter.in : "unknown";
        const signature = scalarSignature(recordValue(parameter.schema));
        entries.push(entry(`argument:${operation}:${location}:${parameter.name}`, "argument", signature, parameter.required === true));
      }
    }
  }
  const schemas = recordValue(recordValue(root.components).schemas);
  appendSchemaEntries(entries, schemas);
  return { ...titleFromRoot(root), entries };
}
function parseAsyncApiJson(root) {
  const entries = [];
  for (const [channel, channelValue] of Object.entries(recordValue(root.channels))) {
    const channelRecord = recordValue(channelValue);
    for (const operation of ["publish", "subscribe"]) {
      if (!isRecord10(channelRecord[operation]))
        continue;
      entries.push(entry(`operation:${operation}:${channel}`, "operation", `${operation} ${channel}`));
    }
  }
  appendSchemaEntries(entries, recordValue(recordValue(root.components).schemas));
  return { ...titleFromRoot(root), entries };
}
function parseJsonSchema(root) {
  const entries = [];
  appendOneSchema(entries, typeof root.title === "string" ? root.title : "root", root);
  for (const [name, schema] of Object.entries(recordValue(root.$defs)))
    appendOneSchema(entries, name, recordValue(schema));
  for (const [name, schema] of Object.entries(recordValue(root.definitions)))
    appendOneSchema(entries, name, recordValue(schema));
  return { ...typeof root.title === "string" ? { name: root.title } : {}, entries };
}
function appendSchemaEntries(entries, schemas) {
  for (const [name, schema] of Object.entries(schemas))
    appendOneSchema(entries, name, recordValue(schema));
}
function appendOneSchema(entries, name, schema) {
  entries.push(entry(`type:${name}`, "type", scalarSignature(schema)));
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((value) => typeof value === "string") : []);
  for (const [field, value] of Object.entries(recordValue(schema.properties))) {
    const isRequired = required.has(field);
    entries.push(entry(`field:${name}.${field}`, isRequired ? "required-field" : "field", scalarSignature(recordValue(value)), isRequired));
  }
}
function parseGraphql(content) {
  const entries = [];
  const clean = content.replace(/#[^\r\n]*/g, "");
  for (const match of clean.matchAll(/\b(type|interface|input)\s+([_A-Za-z][_0-9A-Za-z]*)[^\{]*\{([\s\S]*?)\}/g)) {
    const category = match[1] ?? "type";
    const typeName = match[2];
    entries.push(entry(`type:${typeName}`, "type", category));
    for (const fieldMatch of (match[3] ?? "").matchAll(/([_A-Za-z][_0-9A-Za-z]*)\s*(\([^)]*\))?\s*:\s*([\[\]!_0-9A-Za-z]+)/g)) {
      const field = fieldMatch[1];
      const signature = fieldMatch[3];
      const required = category === "input" && signature.endsWith("!");
      entries.push(entry(`field:${typeName}.${field}`, required ? "required-field" : "field", signature, required));
      for (const argumentMatch of (fieldMatch[2] ?? "").matchAll(/([_A-Za-z][_0-9A-Za-z]*)\s*:\s*([\[\]!_0-9A-Za-z]+)(?:\s*=\s*[^,)]+)?/g)) {
        const argument = argumentMatch[1];
        const argumentType = argumentMatch[2];
        const hasDefault = new RegExp(`${argument}\\s*:[^,)]*=`, "m").test(fieldMatch[2] ?? "");
        entries.push(entry(`argument:${typeName}.${field}:${argument}`, "argument", argumentType, argumentType.endsWith("!") && !hasDefault));
      }
    }
  }
  for (const match of clean.matchAll(/\benum\s+([_A-Za-z][_0-9A-Za-z]*)[^\{]*\{([\s\S]*?)\}/g)) {
    const typeName = match[1];
    entries.push(entry(`type:${typeName}`, "type", "enum"));
    for (const value of (match[2] ?? "").matchAll(/\b([_A-Za-z][_0-9A-Za-z]*)\b/g)) {
      entries.push(entry(`field:${typeName}.${value[1]}`, "field", "enum-value"));
    }
  }
  for (const match of clean.matchAll(/\bscalar\s+([_A-Za-z][_0-9A-Za-z]*)/g)) {
    entries.push(entry(`type:${match[1]}`, "type", "scalar"));
  }
  for (const match of clean.matchAll(/\bunion\s+([_A-Za-z][_0-9A-Za-z]*)\s*=\s*([^\r\n]+)/g)) {
    const members = (match[2] ?? "").split("|").map((member) => member.trim()).filter(Boolean).sort();
    entries.push(entry(`type:${match[1]}`, "type", `union:${members.join("|")}`));
  }
  return { entries };
}
function parseProtobuf(content) {
  const entries = [];
  const clean = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
  for (const match of clean.matchAll(/\bmessage\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)) {
    const message2 = match[1];
    entries.push(entry(`type:${message2}`, "type", "message"));
    for (const field of (match[2] ?? "").matchAll(/\b(?:(?:optional|required|repeated)\s+)?([.A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s+([A-Za-z_]\w*)\s*=\s*(\d+)/g)) {
      entries.push(entry(`field:${message2}#${field[3]}`, "field", `${field[1]} ${field[2]}`, false));
    }
  }
  for (const match of clean.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)) {
    const enumName = match[1];
    entries.push(entry(`type:${enumName}`, "type", "enum"));
    for (const value of (match[2] ?? "").matchAll(/\b([A-Za-z_]\w*)\s*=\s*(-?\d+)/g)) {
      entries.push(entry(`field:${enumName}#${value[2]}`, "field", `enum-value ${value[1]}`));
    }
  }
  for (const match of clean.matchAll(/\bservice\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}/g)) {
    const service = match[1];
    entries.push(entry(`type:${service}`, "type", "service"));
    for (const rpc of (match[2] ?? "").matchAll(/\brpc\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s+returns\s*\(([^)]*)\)/g)) {
      entries.push(entry(`operation:${service}.${rpc[1]}`, "operation", `${rpc[2]?.trim()} -> ${rpc[3]?.trim()}`));
    }
  }
  return { entries };
}
function parseMigration(content) {
  const entries = [];
  const statements = content.split(";").map((statement) => statement.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const statement of statements) {
    const destructive = /\bDROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)\b|\bALTER\s+(?:TABLE\s+)?[^;]+\b(?:SET\s+NOT\s+NULL|TYPE\s+)\b|\bTRUNCATE\b/i.test(statement);
    entries.push(entry(`migration:${stableHash5(statement.toLowerCase())}`, "migration", `${destructive ? "destructive" : "additive"}:${statement}`, false));
  }
  return { entries };
}
function entry(key2, role, signature, required = false) {
  return { key: key2, role, signature: signature.trim(), required };
}
function normalizeEntries(entries) {
  const byKey = /* @__PURE__ */ new Map();
  for (const value of entries) {
    const existing = byKey.get(value.key);
    if (existing && (existing.signature !== value.signature || existing.required !== value.required || existing.role !== value.role)) {
      throw new Error(`Contract parser produced conflicting entries for ${value.key}.`);
    }
    byKey.set(value.key, { ...value });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function uniqueSurfaceIndex(surfaces, label) {
  const index = /* @__PURE__ */ new Map();
  for (const surface of surfaces) {
    if (index.has(surface.id))
      throw new Error(`Duplicate ${label} contract surface: ${surface.id}`);
    index.set(surface.id, surface);
  }
  return index;
}
function unavailableContractPaths(diagnostics) {
  return new Set(diagnostics.filter((diagnostic) => diagnostic.code === "contract-parse-failed" || diagnostic.code === "contract-source-incomplete").map((diagnostic) => diagnostic.path));
}
function deduplicateDiagnostics(diagnostics) {
  const byKey = /* @__PURE__ */ new Map();
  for (const diagnostic of diagnostics) {
    byKey.set(`${diagnostic.code}\0${diagnostic.path}\0${diagnostic.message}`, { ...diagnostic });
  }
  return [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
}
function validateContractSource(source) {
  if (!source.path.trim() || source.path.includes("\0") || /^(?:[\\/]|[A-Za-z]:)/.test(source.path) || source.path.replace(/\\/g, "/").split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid contract source path: ${source.path}`);
  }
  if (!source.fingerprint.trim() || source.fingerprint.length > 256 || /[\0-\x20]/.test(source.fingerprint)) {
    throw new Error(`Invalid contract source fingerprint for ${source.path}.`);
  }
}
function isContractCandidate(path, content) {
  return CONTRACT_PATH.test(path.replace(/\\/g, "/")) || /^\s*(?:openapi|swagger|asyncapi)\s*:/m.test(content) || /^\s*\{[\s\S]*?"(?:openapi|swagger|asyncapi|\$schema)"\s*:/m.test(content);
}
function scalarSignature(schema) {
  if (typeof schema.$ref === "string")
    return `$ref:${schema.$ref}`;
  const type = typeof schema.type === "string" ? schema.type : "unknown";
  const format = typeof schema.format === "string" ? `:${schema.format}` : "";
  const nullable = schema.nullable === true ? ":nullable" : "";
  return `${type}${format}${nullable}`;
}
function titleFromRoot(root) {
  const title = recordValue(root.info).title;
  return typeof title === "string" && title.trim() ? { name: title.trim() } : {};
}
function recordValue(value) {
  return isRecord10(value) ? value : {};
}
function parseJson(content) {
  try {
    const parsed2 = JSON.parse(content);
    return isRecord10(parsed2) ? parsed2 : void 0;
  } catch {
    return void 0;
  }
}
function isRecord10(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function severityOrder2(value) {
  return value === "breaking" ? 0 : value === "unknown" ? 1 : 2;
}
function stableHash5(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

// packages/core/dist/contracts-repository.js
import { execFile as execFile3 } from "node:child_process";
import { createHash as createHash3 } from "node:crypto";
import { lstat, readFile as readFile3, realpath as realpath2 } from "node:fs/promises";
import { relative as relative3, resolve as resolve3, sep as sep3 } from "node:path";
import { promisify as promisify3 } from "node:util";
var exec3 = promisify3(execFile3);
var MAX_CONTRACT_BYTES = 2 * 1024 * 1024;
var MAX_TREE_BYTES2 = 32 * 1024 * 1024;
var MAX_TOTAL_BYTES = 64 * 1024 * 1024;
var STRUCTURED_EXTENSION = /\.(?:json|ya?ml)$/i;
async function inventoryWorkingTreeContracts(repo) {
  const root = await realpath2(resolve3(repo.root));
  const sources = [];
  const diagnostics = [];
  let totalBytes = 0;
  for (const file of repo.files) {
    const byPath = CONTRACT_PATH.test(file.path);
    if (!byPath && !(STRUCTURED_EXTENSION.test(file.path) && isContractCandidate(file.path, file.textSample)))
      continue;
    const absolute = resolve3(root, file.path);
    const inside = relative3(root, absolute);
    if (!inside || inside.startsWith(`..${sep3}`) || inside === "..")
      continue;
    let bytes;
    try {
      const info = await lstat(absolute);
      if (info.isFile() && info.size <= MAX_CONTRACT_BYTES && totalBytes + info.size <= MAX_TOTAL_BYTES) {
        bytes = await readFile3(absolute);
        totalBytes += bytes.length;
      }
    } catch {
      bytes = void 0;
    }
    const decoded = bytes ? decodeUtf8(bytes) : void 0;
    if (bytes === void 0 || decoded === void 0 || bytes.length > MAX_CONTRACT_BYTES) {
      diagnostics.push(unread(file.path));
      continue;
    }
    if (!byPath && !isContractCandidate(file.path, decoded))
      continue;
    sources.push({ path: file.path, content: decoded, fingerprint: `worktree:${createHash3("sha256").update(bytes).digest("hex")}` });
  }
  return inventoryContracts(sources, diagnostics);
}
async function inventoryContractsAtRef(input) {
  const repoRoot = resolve3(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  const commit = await resolveCommit(repoRoot, requestedRef);
  const { stdout } = await exec3("git", ["ls-tree", "-r", "-z", "-l", "--full-tree", commit, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_TREE_BYTES2
  });
  const candidates = parseTree(stdout).filter((entry2) => entry2.mode !== "120000" && entry2.mode !== "160000").filter((entry2) => CONTRACT_PATH.test(entry2.path) || STRUCTURED_EXTENSION.test(entry2.path));
  const diagnostics = [];
  const readable = [];
  let totalBytes = 0;
  for (const entry2 of candidates) {
    if (entry2.size <= MAX_CONTRACT_BYTES && totalBytes + entry2.size <= MAX_TOTAL_BYTES) {
      readable.push(entry2);
      totalBytes += entry2.size;
    } else if (CONTRACT_PATH.test(entry2.path)) {
      diagnostics.push(unread(entry2.path));
    }
  }
  const blobs = await readBlobs(repoRoot, readable);
  const sources = [];
  for (const entry2 of readable) {
    const byPath = CONTRACT_PATH.test(entry2.path);
    const content = decodeUtf8(blobs.get(entry2.oid));
    if (content === void 0) {
      if (byPath)
        diagnostics.push(unread(entry2.path));
      continue;
    }
    if (!byPath && !isContractCandidate(entry2.path, content))
      continue;
    sources.push({ path: entry2.path, content, fingerprint: `git:${entry2.oid}` });
  }
  return { requestedRef, commit, inventory: inventoryContracts(sources, diagnostics) };
}
async function compareContractRefs(input) {
  const [from, to] = await Promise.all([
    inventoryContractsAtRef({ repoRoot: input.repoRoot, ref: input.fromRef }),
    inventoryContractsAtRef({ repoRoot: input.repoRoot, ref: input.toRef })
  ]);
  return {
    contractDiffVersion: 1,
    from: { requestedRef: from.requestedRef, commit: from.commit },
    to: { requestedRef: to.requestedRef, commit: to.commit },
    comparison: compareContractInventories(from.inventory, to.inventory)
  };
}
function decodeUtf8(bytes) {
  if (!bytes)
    return void 0;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return void 0;
  }
}
function unread(path) {
  return {
    code: "contract-source-incomplete",
    severity: "warning",
    path,
    message: `${path} looks like a contract, but it is larger than ${MAX_CONTRACT_BYTES / 1024 / 1024} MB, not UTF-8 text, or unreadable, so FixMap did not parse it.`
  };
}

// packages/core/dist/contract-baseline.js
var exec4 = promisify4(execFile4);
async function contractBaselineForDiff(repo, input) {
  let needed = false;
  try {
    needed = architecturePolicyFromRepo(repo)?.contracts.some((rule) => rule.forbidBreaking) ?? false;
  } catch {
    return void 0;
  }
  if (!needed)
    return void 0;
  const range = diffRange(input);
  if (!range)
    return void 0;
  const repoRoot = resolve4(input.repoRoot);
  const fromRef = range.mergeBase ? await mergeBase(repoRoot, range.from, range.to ?? "HEAD") : range.from;
  const from = await inventoryContractsAtRef({ repoRoot, ref: fromRef });
  const to = range.to === void 0 ? await inventoryWorkingTreeContracts(repo) : (await inventoryContractsAtRef({ repoRoot, ref: range.to })).inventory;
  return compareContractInventories(from.inventory, to);
}
function diffRange(input) {
  if (input.workingTree)
    return { from: "HEAD", mergeBase: false };
  const spec = input.diffSpec?.trim() ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : void 0);
  if (!spec)
    return void 0;
  const threeDot = /^(.*?)\.\.\.(.*)$/.exec(spec);
  if (threeDot)
    return { from: validateRef(threeDot[1] || "HEAD"), to: validateRef(threeDot[2] || "HEAD"), mergeBase: true };
  const twoDot = /^(.*?)\.\.(.*)$/.exec(spec);
  if (twoDot)
    return { from: validateRef(twoDot[1] || "HEAD"), to: validateRef(twoDot[2] || "HEAD"), mergeBase: false };
  return { from: validateRef(spec), mergeBase: false };
}
async function mergeBase(repoRoot, left, right) {
  const [from, to] = await Promise.all([resolveCommit(repoRoot, left), resolveCommit(repoRoot, right)]);
  const { stdout } = await exec4("git", ["merge-base", from, to], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  const commit = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/.test(commit))
    throw new Error(`git merge-base returned no commit for ${left}...${right}.`);
  return commit;
}

// packages/core/dist/plan.js
async function buildFixMapReport(input) {
  return (await buildFixMapAnalysis(input)).report;
}
async function buildFixMapAnalysis(input) {
  const historical = input.atRef === void 0 ? void 0 : await scanHistoricalRepo(input.repoRoot, input.atRef, input);
  const scannedRepo = historical?.repo ?? await scanRepo({ ...input, includeHistory: input.includeHistory !== false });
  const generatedArtifacts = scannedRepo.files.filter(isFixMapArtifact);
  const generatedPaths = new Set(generatedArtifacts.map((file) => file.path));
  const repo = generatedArtifacts.length === 0 ? scannedRepo : {
    ...scannedRepo,
    files: scannedRepo.files.filter((file) => !generatedPaths.has(file.path)),
    changedFiles: scannedRepo.changedFiles.filter((path) => !generatedPaths.has(path)),
    ...scannedRepo.trackedFiles ? { trackedFiles: scannedRepo.trackedFiles.filter((path) => !generatedPaths.has(path)) } : {}
  };
  const requestedExclude = historical ? excluderFor(input.repoRoot, [...parseIgnoreFile(historical.ignoreFile ?? ""), ...input.exclude ?? []]) : await resolveExclusions(input.repoRoot, input.exclude ?? []);
  const internalExclude = buildPathExcluder((input.internalExclude ?? []).map((pattern) => normalizeAbsolutePattern(input.repoRoot, pattern)));
  const exclude = combineExclusions(requestedExclude, internalExclude);
  const languageContext = input.languageRegistry ? createCustomLanguageContext(input.languageRegistry) : void 0;
  const analyzedRepo = languageContext ? classifyCustomTests(repo, languageContext) : repo;
  const baseline = historical ? {} : await contractBaselineOrError(repo, input);
  const reportInput = {
    issueText: input.issueText,
    limit: input.limit,
    exclude,
    annotationAsOf: (/* @__PURE__ */ new Date()).toISOString(),
    ...languageContext ? { languageContext } : {},
    ...baseline.comparison ? { contractComparison: baseline.comparison } : {}
  };
  const report = input.embeddingProvider ? await buildHybridReportFromRepo(analyzedRepo, { ...reportInput, embeddingProvider: input.embeddingProvider }) : buildReportFromRepo(analyzedRepo, reportInput);
  if (baseline.error)
    report.diagnostics.push({
      code: "contract-baseline-unavailable",
      severity: "warning",
      paths: [".fixmap/policy.json"],
      message: `Policy contract rules were not checked: ${baseline.error}`
    });
  if (input.evidenceSources && input.evidenceSources.length > 0) {
    report.evidence = await attachReportEvidence(report, analyzedRepo, input.evidenceSources, { issueText: input.issueText ?? "" });
  }
  if (input.sensitiveData) {
    report.sensitiveData = buildReportSensitiveData(analyzedRepo, reportPaths(report));
  }
  if (input.supplyChain) {
    report.supplyChain = buildReportSupplyChain(input.supplyChain.bundle, input.supplyChain.documentSha256, reportPaths(report));
  }
  if (input.languageRegistry && languageContext) {
    report.languageAdapters = input.languageRegistry.customAdapters.map((adapter) => ({
      id: adapter.id,
      version: adapter.version,
      extensions: [...adapter.extensions]
    }));
    const { total, entries } = languageContext.failures();
    if (total > 0) {
      const shown = entries.slice(0, 8);
      report.diagnostics.push({
        code: "language-adapter-failed",
        severity: "warning",
        message: `${total} custom language adapter ${total === 1 ? "call" : "calls"} failed or returned invalid results, so ${total === 1 ? "that file was" : "those files were"} analyzed without custom facts: ` + shown.map((entry2) => `${markdownCode(entry2.path)} (${entry2.adapter}, ${entry2.code})`).join(", ") + `${total > shown.length ? ", ..." : ""}.`,
        paths: shown.map((entry2) => entry2.path)
      });
    }
  }
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
  return { report, repo: analyzedRepo, exclusions: exclude };
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
  return excluderFor(repoRoot, [...await readIgnoreFile(repoRoot), ...patterns2]);
}
function excluderFor(repoRoot, patterns2) {
  const combined = patterns2.map((pattern) => normalizeAbsolutePattern(repoRoot, pattern));
  return combined.length > 0 ? buildPathExcluder(combined) : NO_EXCLUSIONS;
}
async function scanHistoricalRepo(repoRoot, ref, input) {
  if (input.diffSpec !== void 0 || input.baseRef !== void 0 || input.headRef !== void 0 || input.workingTree || input.includeUntracked) {
    throw new Error("A historical plan ranks one committed state, so it cannot be combined with a diff or the working tree.");
  }
  const historical = await scanRepoAtRef({ repoRoot, ref });
  historical.repo.diagnostics.unshift({
    code: "historical-plan",
    severity: "info",
    message: `Preview: ranked against ${markdownCode(historical.requestedRef)} at commit ${markdownCode(historical.commit)}, read from committed Git objects without checking out or changing the worktree. Co-change history and uncommitted files were not used.`
  });
  return historical;
}
function normalizeAbsolutePattern(repoRoot, pattern) {
  const trimmed = pattern.trim();
  const negated = trimmed.startsWith("!");
  const body = (negated ? trimmed.slice(1) : trimmed).replace(/\\/g, "/");
  const normalizedRoot = resolve5(repoRoot).replace(/\\/g, "/").replace(/\/$/, "");
  const caseInsensitive = /^[A-Za-z]:\//.test(normalizedRoot);
  const comparableBody = caseInsensitive ? body.toLowerCase() : body;
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  if (!comparableBody.startsWith(`${comparableRoot}/`))
    return pattern;
  return `${negated ? "!" : ""}/${body.slice(normalizedRoot.length + 1)}`;
}
async function readIgnoreFile(repoRoot) {
  try {
    return parseIgnoreFile(await readFile4(join3(repoRoot, ".fixmapignore"), "utf8"));
  } catch {
    return [];
  }
}
function classifyCustomTests(repo, context) {
  let changed = false;
  const files = repo.files.map((file) => {
    if (file.isTest || !context.supports(file.extension))
      return file;
    const extracted = context.extract(file);
    if (extracted.status !== "ok" || !extracted.facts.isTest)
      return file;
    changed = true;
    return { ...file, isTest: true };
  });
  return changed ? { ...repo, files } : repo;
}
async function contractBaselineOrError(repo, input) {
  try {
    const comparison = await contractBaselineForDiff(repo, input);
    return comparison ? { comparison } : {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// packages/core/dist/workspace.js
var REPOSITORY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function buildWorkspaceMap(inputs, options) {
  validateRepositoryInputs(inputs);
  const ordered = [...inputs].sort((a, b) => a.id.localeCompare(b.id));
  const repositories = ordered.map((input) => ({
    id: input.id,
    identity: createGraphIdentity({ workspace: options.workspace, kind: "repository", key: input.id }),
    root: input.repo.root,
    ...input.revision ? { revision: input.revision } : {},
    ...input.remote ? { remote: input.remote } : {},
    relationship: input.relationship ?? { kind: "checkout" },
    fileCount: input.repo.files.length
  }));
  const diagnostics = [];
  const repositoryIds = new Set(repositories.map((repository) => repository.id));
  for (const repository of repositories) {
    if (repository.relationship.kind === "submodule" && (!repository.relationship.parentRepository || !repositoryIds.has(repository.relationship.parentRepository))) {
      diagnostics.push({
        code: "invalid-submodule-parent",
        severity: "warning",
        message: `Submodule repository ${repository.id} names a parent that is not in this workspace.`,
        repositories: [repository.id]
      });
    }
  }
  const packages = ordered.flatMap((input) => extractRepositoryPackages(input, options.workspace)).sort((a, b) => a.id.localeCompare(b.id));
  const packageIndex = /* @__PURE__ */ new Map();
  for (const pkg of packages) {
    for (const namespace of packageLookupKeys(pkg)) {
      const existing = packageIndex.get(namespace) ?? [];
      existing.push(pkg);
      packageIndex.set(namespace, existing);
    }
  }
  for (const [key2, candidates] of packageIndex) {
    const repositoriesForPackage = [...new Set(candidates.map((candidate) => candidate.repository))];
    if (repositoriesForPackage.length > 1 && key2.startsWith(`${candidates[0]?.ecosystem}:`)) {
      diagnostics.push({
        code: "duplicate-package",
        severity: "warning",
        message: `Workspace package identity ${key2} is provided by multiple repositories; automatic links remain unresolved.`,
        repositories: repositoriesForPackage.sort()
      });
    }
  }
  const aliases = resolveAliases(options.aliases ?? [], repositoryIds, packages, diagnostics);
  const edges = /* @__PURE__ */ new Map();
  for (const input of ordered) {
    for (const declaration of extractManifestDependencies(input)) {
      const alias = aliases.get(aliasKey(input.id, declaration.ecosystem, declaration.package));
      if (alias)
        linkAliasedDependency(edges, input.id, declaration, alias);
      else
        linkDependency(edges, diagnostics, packageIndex, input.id, declaration);
    }
    for (const declaration of extractImportDependencies(input, packages)) {
      linkDependency(edges, diagnostics, packageIndex, input.id, declaration);
    }
  }
  const repositoryIdentityById = new Map(repositories.map((repository) => [repository.id, repository.identity]));
  const packageIdentityByProvider = new Map(packages.map((pkg) => [
    `${pkg.repository}\0${pkg.ecosystem}\0${pkg.name}`,
    pkg.identity
  ]));
  const dependencies = [...edges.values()].map((dependency) => {
    const consumer = repositoryIdentityById.get(dependency.consumerRepository);
    const provider = packageIdentityByProvider.get(`${dependency.providerRepository}\0${dependency.ecosystem}\0${dependency.package}`);
    return {
      ...dependency,
      identity: createGraphEdgeIdentity("depends-on", consumer, provider),
      evidence: dependency.evidence.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path))
    };
  }).sort((a, b) => a.consumerRepository.localeCompare(b.consumerRepository) || a.providerRepository.localeCompare(b.providerRepository) || a.package.localeCompare(b.package));
  const identityGraph = buildWorkspaceIdentityGraph(options, ordered, repositories, packages, dependencies, diagnostics);
  return {
    workspaceVersion: 1,
    workspace: options.workspace,
    repositories,
    packages,
    dependencies,
    identityGraph,
    diagnostics: deduplicateDiagnostics2(diagnostics)
  };
}
function buildWorkspaceImpact(workspace, seedRepositories) {
  const known = new Set(workspace.repositories.map((repository) => repository.id));
  const seeds = [...new Set(seedRepositories)].filter((seed) => known.has(seed)).sort();
  const queue = seeds.map((repository) => ({ repository, distance: 0 }));
  const visited = new Set(seeds);
  const impacted = [];
  while (queue.length > 0) {
    const current2 = queue.shift();
    for (const edge of workspace.dependencies.filter((candidate) => candidate.providerRepository === current2.repository)) {
      if (visited.has(edge.consumerRepository))
        continue;
      visited.add(edge.consumerRepository);
      const distance = current2.distance + 1;
      impacted.push({
        repository: edge.consumerRepository,
        distance,
        via: `${edge.consumerRepository} depends on ${edge.package} from ${edge.providerRepository}`,
        evidence: edge.evidence
      });
      queue.push({ repository: edge.consumerRepository, distance });
    }
  }
  return {
    seeds,
    repositories: impacted.sort((a, b) => a.distance - b.distance || a.repository.localeCompare(b.repository))
  };
}
function aliasKey(consumer, ecosystem, name) {
  return `${consumer}\0${ecosystem}\0${ecosystem === "python" ? normalizePythonName(name) : name}`;
}
function resolveAliases(aliases, repositoryIds, packages, diagnostics) {
  const resolved = /* @__PURE__ */ new Map();
  for (const alias of aliases) {
    if (!repositoryIds.has(alias.consumer) || !repositoryIds.has(alias.provider) || alias.consumer === alias.provider) {
      throw new Error(`Workspace alias for ${alias.consumer} ${alias.ecosystem}:${alias.package} must link two repositories in this workspace.`);
    }
    const key2 = aliasKey(alias.consumer, alias.ecosystem, alias.package);
    if (resolved.has(key2))
      throw new Error(`Workspace alias for ${alias.consumer} ${alias.ecosystem}:${alias.package} is declared more than once.`);
    const wanted = alias.ecosystem === "python" ? normalizePythonName(alias.providerPackage) : alias.providerPackage;
    const provider = packages.find((pkg) => pkg.repository === alias.provider && pkg.ecosystem === alias.ecosystem && (pkg.ecosystem === "python" ? normalizePythonName(pkg.name) : pkg.name) === wanted);
    if (!provider) {
      diagnostics.push({
        code: "alias-unresolved",
        severity: "warning",
        message: `Alias for ${alias.consumer} ${alias.package} names ${alias.ecosystem} package ${alias.providerPackage}, which ${alias.provider} does not provide; no link was made.`,
        repositories: [alias.consumer, alias.provider].sort()
      });
      continue;
    }
    resolved.set(key2, { alias, provider });
  }
  return resolved;
}
function linkAliasedDependency(edges, consumerRepository, declaration, resolved) {
  const provider = resolved.provider;
  const evidence = {
    ...declaration.evidence,
    detail: `${declaration.evidence.detail}; reviewed alias to ${provider.name} from ${provider.repository}: ${resolved.alias.reason}`
  };
  const key2 = `${consumerRepository}\0${provider.repository}\0${provider.ecosystem}\0${provider.name}`;
  const existing = edges.get(key2);
  if (existing) {
    existing.evidence.push(evidence);
    existing.alias ??= { declaredPackage: declaration.package, reason: resolved.alias.reason };
    return;
  }
  edges.set(key2, {
    consumerRepository,
    providerRepository: provider.repository,
    package: provider.name,
    ecosystem: provider.ecosystem,
    ...declaration.requestedVersion ? { requestedVersion: declaration.requestedVersion } : {},
    evidence: [evidence],
    alias: { declaredPackage: declaration.package, reason: resolved.alias.reason }
  });
}
var MAX_WORKSPACE_STATEMENTS = 8;
function buildWorkspaceVerifyNarrative(workspace, repository, changedPaths) {
  const owned = workspace.packages.filter((pkg) => pkg.repository === repository);
  const changedByPackage = /* @__PURE__ */ new Map();
  for (const path of changedPaths) {
    const owner = owned.filter((pkg) => containsPath(manifestDirectory(pkg.manifestPath), path)).sort((a, b) => manifestDirectory(b.manifestPath).length - manifestDirectory(a.manifestPath).length)[0];
    if (!owner)
      continue;
    changedByPackage.set(owner.id, [...changedByPackage.get(owner.id) ?? [], path]);
  }
  const statements = [];
  const direct = /* @__PURE__ */ new Set();
  for (const pkg of owned) {
    const changed = changedByPackage.get(pkg.id);
    if (!changed)
      continue;
    for (const dependency of workspace.dependencies.filter((entry2) => entry2.providerRepository === repository && entry2.package === pkg.name && entry2.ecosystem === pkg.ecosystem)) {
      direct.add(dependency.consumerRepository);
      const consumerEvidence = dependency.evidence[0];
      const shown = changed.slice(0, 4);
      statements.push({
        classification: dependency.evidence.some((entry2) => entry2.kind === "manifest") ? "observation" : "inference",
        text: `${dependency.consumerRepository} depends on ${pkg.name}${dependency.alias ? ` (declared as ${dependency.alias.declaredPackage})` : ""}, and this diff changes ${changed.length} file${changed.length === 1 ? "" : "s"} in it: ${shown.join(", ")}${changed.length > shown.length ? ", ..." : ""}.`,
        evidence: [
          ...shown.map((path) => ({ kind: "changed-file", path, detail: `Inside ${pkg.name} (${pkg.manifestPath}) in ${repository}.` })),
          { kind: "cross-repository", path: consumerEvidence.path, detail: `${dependency.consumerRepository}: ${consumerEvidence.detail}` }
        ]
      });
    }
  }
  if (direct.size > 0) {
    const transitive = buildWorkspaceImpact(workspace, [...direct]).repositories.filter((entry2) => entry2.repository !== repository && !direct.has(entry2.repository));
    for (const entry2 of transitive)
      statements.push({
        classification: "inference",
        text: `${entry2.repository} may also be affected indirectly: ${entry2.via}.`,
        evidence: entry2.evidence.slice(0, 2).map((evidence) => ({
          kind: "cross-repository",
          path: evidence.path,
          detail: `${entry2.repository}: ${evidence.detail}`
        }))
      });
  }
  return statements.slice(0, MAX_WORKSPACE_STATEMENTS);
}
function containsPath(directory, path) {
  return directory === "" || path === directory || path.startsWith(`${directory}/`);
}
function extractRepositoryPackages(input, workspace) {
  const packages = [];
  for (const file of input.repo.files) {
    const name = file.path.split("/").at(-1)?.toLowerCase() ?? "";
    if (name === "package.json") {
      const manifest = parseJson2(file.textSample);
      if (manifest && typeof manifest.name === "string" && manifest.name.trim()) {
        packages.push(workspacePackage(workspace, input.id, "node", manifest.name.trim(), stringValue(manifest.version), file.path, [manifest.name.trim()]));
      }
    } else if (name === "pyproject.toml") {
      const project = tomlProject(file.textSample);
      if (project.name) {
        const namespaces = pythonNamespaces(input.repo.files, manifestDirectory(file.path));
        packages.push(workspacePackage(workspace, input.id, "python", project.name, project.version, file.path, namespaces.length > 0 ? namespaces : [normalizePythonName(project.name)]));
      }
    } else if (name === "pom.xml") {
      const project = mavenProject(file.textSample);
      if (project.artifactId) {
        const identity = project.groupId ? `${project.groupId}:${project.artifactId}` : project.artifactId;
        packages.push(workspacePackage(workspace, input.id, "maven", identity, project.version, file.path, javaPackages(input.repo.files, manifestDirectory(file.path))));
      }
    }
  }
  return packages;
}
function workspacePackage(workspace, repository, ecosystem, name, version, manifestPath, importNamespaces) {
  const repositoryIdentity = createGraphIdentity({ workspace, kind: "repository", key: repository });
  return {
    id: `${repository}:${ecosystem}:${name}`,
    identity: createGraphIdentity({
      workspace,
      kind: "package",
      key: `${ecosystem}:${name}`,
      repository,
      parent: repositoryIdentity
    }),
    repository,
    ecosystem,
    name,
    ...version ? { version } : {},
    manifestPath,
    importNamespaces: [...new Set(importNamespaces)].sort()
  };
}
function extractManifestDependencies(input) {
  const declarations = [];
  for (const file of input.repo.files) {
    const name = file.path.split("/").at(-1)?.toLowerCase() ?? "";
    if (name === "package.json") {
      const manifest = parseJson2(file.textSample);
      for (const section2 of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const dependencies = manifest?.[section2];
        if (!isRecord11(dependencies))
          continue;
        for (const [dependency, version] of Object.entries(dependencies)) {
          if (typeof version !== "string")
            continue;
          declarations.push({
            ecosystem: "node",
            lookup: `node:${dependency}`,
            package: dependency,
            requestedVersion: version,
            evidence: { kind: "manifest", path: file.path, detail: `${section2} declares ${dependency}@${version}` }
          });
        }
      }
    } else if (name === "pyproject.toml") {
      for (const dependency of tomlDependencies(file.textSample))
        declarations.push({
          ecosystem: "python",
          lookup: `python:${normalizePythonName(dependency.name)}`,
          package: dependency.name,
          ...dependency.version ? { requestedVersion: dependency.version } : {},
          evidence: { kind: "manifest", path: file.path, detail: `pyproject declares ${dependency.raw}` }
        });
    } else if (name === "pom.xml") {
      for (const dependency of mavenDependencies(file.textSample))
        declarations.push({
          ecosystem: "maven",
          lookup: `maven:${dependency.groupId}:${dependency.artifactId}`,
          package: `${dependency.groupId}:${dependency.artifactId}`,
          ...dependency.version ? { requestedVersion: dependency.version } : {},
          evidence: { kind: "manifest", path: file.path, detail: `pom dependency declares ${dependency.groupId}:${dependency.artifactId}${dependency.version ? `:${dependency.version}` : ""}` }
        });
    }
  }
  return declarations;
}
function extractImportDependencies(input, packages) {
  const declarations = [];
  for (const file of input.repo.files.filter((candidate) => candidate.isSource && candidate.kind === "code")) {
    for (const imported of extractLanguageImports(file)) {
      if (imported.specifier.startsWith("."))
        continue;
      for (const pkg of packages.filter((candidate) => candidate.repository !== input.id)) {
        const namespace = pkg.importNamespaces.find((candidate) => importMatches(pkg.ecosystem, imported.specifier, candidate));
        if (!namespace)
          continue;
        declarations.push({
          ecosystem: pkg.ecosystem,
          lookup: `${pkg.ecosystem}:${pkg.ecosystem === "python" ? normalizePythonName(namespace) : namespace}`,
          package: pkg.name,
          evidence: { kind: "import", path: file.path, detail: `${file.path} imports ${imported.specifier}` }
        });
      }
    }
  }
  return declarations;
}
function linkDependency(edges, diagnostics, packageIndex, consumerRepository, declaration) {
  const candidates = (packageIndex.get(declaration.lookup) ?? []).filter((candidate) => candidate.repository !== consumerRepository);
  const providers = [...new Map(candidates.map((candidate) => [candidate.repository, candidate])).values()];
  if (providers.length !== 1) {
    if (declaration.evidence.kind === "manifest")
      diagnostics.push({
        code: "unresolved-dependency",
        severity: "info",
        message: providers.length === 0 ? `${consumerRepository} declares ${declaration.package}, but no workspace repository provides it.` : `${consumerRepository} declares ${declaration.package}, but multiple workspace repositories provide it.`,
        repositories: [consumerRepository, ...providers.map((provider2) => provider2.repository)].sort()
      });
    return;
  }
  const provider = providers[0];
  const key2 = `${consumerRepository}\0${provider.repository}\0${provider.ecosystem}\0${provider.name}`;
  const existing = edges.get(key2);
  if (existing) {
    if (!existing.evidence.some((evidence) => evidence.kind === declaration.evidence.kind && evidence.path === declaration.evidence.path && evidence.detail === declaration.evidence.detail)) {
      existing.evidence.push(declaration.evidence);
    }
    if (!existing.requestedVersion && declaration.requestedVersion)
      existing.requestedVersion = declaration.requestedVersion;
    return;
  }
  edges.set(key2, {
    consumerRepository,
    providerRepository: provider.repository,
    package: provider.name,
    ecosystem: provider.ecosystem,
    ...declaration.requestedVersion ? { requestedVersion: declaration.requestedVersion } : {},
    evidence: [declaration.evidence]
  });
}
function buildWorkspaceIdentityGraph(options, inputs, repositories, packages, dependencies, diagnostics) {
  const repositoryById = new Map(repositories.map((repository) => [repository.id, repository]));
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  const packageByProvider = new Map(packages.map((pkg) => [`${pkg.repository}\0${pkg.ecosystem}\0${pkg.name}`, pkg]));
  const nodes = repositories.map((repository) => ({
    id: repository.identity,
    kind: "repository",
    key: repository.id,
    repository: repository.id,
    attributes: {
      ...repository.revision ? { revision: repository.revision } : {},
      ...repository.remote ? { remote: repository.remote } : {},
      relationship: repository.relationship.kind
    },
    derivedFrom: []
  }));
  const graphEdges = [];
  for (const pkg of packages) {
    const input = inputById.get(pkg.repository);
    const source = workspaceSource(input, pkg.manifestPath);
    nodes.push({
      id: pkg.identity,
      kind: "package",
      key: `${pkg.ecosystem}:${pkg.name}`,
      repository: pkg.repository,
      parent: repositoryById.get(pkg.repository).identity,
      label: pkg.name,
      attributes: { ecosystem: pkg.ecosystem, ...pkg.version ? { version: pkg.version } : {} },
      derivedFrom: [source]
    });
    graphEdges.push({
      id: createGraphEdgeIdentity("contains", repositoryById.get(pkg.repository).identity, pkg.identity),
      kind: "contains",
      from: repositoryById.get(pkg.repository).identity,
      to: pkg.identity,
      confidence: "high",
      reason: `${pkg.manifestPath} declares ${pkg.ecosystem} package ${pkg.name}.`,
      derivedFrom: [source]
    });
  }
  for (const repository of repositories) {
    if (repository.relationship.kind !== "submodule" || !repository.relationship.parentRepository)
      continue;
    const parent = repositoryById.get(repository.relationship.parentRepository);
    if (!parent)
      continue;
    graphEdges.push({
      id: createGraphEdgeIdentity("contains", parent.identity, repository.identity),
      kind: "contains",
      from: parent.identity,
      to: repository.identity,
      confidence: "high",
      reason: `${repository.id} is checked out as submodule ${repository.relationship.path ?? repository.id}.`,
      derivedFrom: []
    });
  }
  for (const dependency of dependencies) {
    const consumer = repositoryById.get(dependency.consumerRepository);
    const provider = packageByProvider.get(`${dependency.providerRepository}\0${dependency.ecosystem}\0${dependency.package}`);
    const derivations = dependency.evidence.map((evidence) => workspaceSource(inputById.get(dependency.consumerRepository), evidence.path));
    graphEdges.push({
      id: dependency.identity,
      kind: "depends-on",
      from: consumer.identity,
      to: provider.identity,
      confidence: dependency.evidence.some((evidence) => evidence.kind === "manifest") ? "high" : "medium",
      reason: `${dependency.consumerRepository} depends on ${dependency.package} from ${dependency.providerRepository}.`,
      derivedFrom: derivations
    });
  }
  nodes.push(...(options.identityNodes ?? []).map((entry2) => ({
    ...entry2,
    derivedFrom: entry2.derivedFrom.map((derivation) => ({ ...derivation }))
  })));
  graphEdges.push(...(options.identityEdges ?? []).map((entry2) => ({
    ...entry2,
    derivedFrom: entry2.derivedFrom.map((derivation) => ({ ...derivation }))
  })));
  for (const input of inputs) {
    const files = new Map(input.repo.files.map((file) => [file.path, file]));
    const ensureFile = (path) => {
      const id = createGraphIdentity({ workspace: options.workspace, repository: input.id, kind: "file", key: path });
      if (!nodes.some((node) => node.id === id))
        nodes.push({
          id,
          kind: "file",
          key: path,
          repository: input.id,
          parent: repositoryById.get(input.id).identity,
          derivedFrom: [workspaceSource(input, path)]
        });
      return id;
    };
    const inventory = inventoryDecisionRecords(input.repo);
    for (const diagnostic of inventory.diagnostics) {
      diagnostics.push({ code: "decision-source-invalid", severity: diagnostic.severity, message: diagnostic.message, repositories: [input.id] });
    }
    for (const record3 of inventory.records) {
      for (const target of record3.targets) {
        const unresolved = (reason2) => {
          diagnostics.push({
            code: "decision-unresolved-target",
            severity: "warning",
            message: `${record3.path}: ${target.kind}:${target.kind === "file" ? target.path : target.name} has no rationale edge: ${reason2}.`,
            repositories: [input.id]
          });
        };
        let to;
        let description;
        let targetDerivation;
        if (target.kind === "file") {
          if (!files.get(target.path)?.contentFingerprint || target.path === record3.path) {
            unresolved(target.path === record3.path ? "self-reference" : "missing file or exact source fingerprint");
            continue;
          }
          to = ensureFile(target.path);
          description = target.path;
          targetDerivation = workspaceSource(input, target.path);
        } else {
          const candidates = nodes.filter((node) => node.repository === input.id && node.kind === target.kind && node.key === target.name && (target.kind !== "symbol" || !target.path || node.derivedFrom.some((source) => source.kind === "source" && source.repository === input.id && source.path === target.path && files.get(target.path)?.contentFingerprint === source.fingerprint)));
          if (candidates.length !== 1) {
            unresolved(candidates.length === 0 ? "no exact repository-local identity with matching provenance" : "ambiguous repository-local identities");
            continue;
          }
          to = candidates[0].id;
          description = `${target.kind}:${target.name}`;
          targetDerivation = { kind: "node", id: to };
        }
        const from = ensureFile(record3.path);
        const kind = target.evidence === "explicit" ? "rationale-for" : "mentions";
        graphEdges.push({
          id: createGraphEdgeIdentity(kind, from, to),
          kind,
          from,
          to,
          confidence: "high",
          reason: target.evidence === "explicit" ? `${record3.path} explicitly declares authored scope for ${description}; decision status: ${record3.status}. This is not a code dependency or proof that the decision is enforced.` : `${record3.path} literally mentions ${description}; this does not establish authored scope or a code dependency.`,
          derivedFrom: [workspaceSource(input, record3.path), targetDerivation]
        });
      }
    }
  }
  return buildIdentityGraph({ workspace: options.workspace, nodes, edges: graphEdges });
}
function workspaceSource(input, path) {
  const file = input.repo.files.find((candidate) => candidate.path === path);
  if (!file)
    throw new Error(`Workspace evidence references missing file ${input.id}:${path}.`);
  if (!file.contentFingerprint) {
    throw new Error(`Workspace evidence requires an exact content fingerprint for ${input.id}:${path}.`);
  }
  return {
    kind: "source",
    repository: input.id,
    path,
    fingerprint: file.contentFingerprint
  };
}
function packageLookupKeys(pkg) {
  const keys = [`${pkg.ecosystem}:${pkg.ecosystem === "python" ? normalizePythonName(pkg.name) : pkg.name}`];
  for (const namespace of pkg.importNamespaces) {
    keys.push(`${pkg.ecosystem}:${pkg.ecosystem === "python" ? normalizePythonName(namespace) : namespace}`);
  }
  return [...new Set(keys)];
}
function importMatches(ecosystem, source, namespace) {
  if (ecosystem === "node")
    return nodePackageName(source) === namespace;
  if (ecosystem === "python")
    return normalizePythonName(source.split(".")[0] ?? "") === normalizePythonName(namespace);
  return source === namespace || source.startsWith(`${namespace}.`);
}
function nodePackageName(source) {
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? source;
}
function pythonNamespaces(files, directory) {
  const prefix = directory ? `${directory}/` : "";
  return [...new Set(files.flatMap((file) => {
    if (!file.path.startsWith(prefix) || file.extension !== ".py")
      return [];
    const relative6 = file.path.slice(prefix.length);
    const first = relative6.split("/")[0] ?? "";
    if (!first || ["tests", "test", "scripts"].includes(first))
      return [];
    return [first.replace(/\.py$/, "")];
  }))];
}
function javaPackages(files, directory) {
  const prefix = directory ? `${directory}/` : "";
  return [...new Set(files.flatMap((file) => {
    if (!file.path.startsWith(prefix) || file.extension !== ".java")
      return [];
    const match = file.textSample.match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/);
    return match?.[1] ? [match[1]] : [];
  }))];
}
function tomlProject(text2) {
  const section2 = sectionText(text2, "project") || sectionText(text2, "tool.poetry");
  const name = tomlScalar(section2, "name");
  const version = tomlScalar(section2, "version");
  return { ...name ? { name } : {}, ...version ? { version } : {} };
}
function tomlDependencies(text2) {
  const results = [];
  const project = sectionText(text2, "project");
  const array2 = project.match(/(?:^|\n)\s*dependencies\s*=\s*\[([\s\S]*?)\]/i)?.[1] ?? "";
  for (const match of array2.matchAll(/["']([^"']+)["']/g)) {
    const raw = match[1]?.trim();
    if (!raw)
      continue;
    const parsed2 = raw.match(/^([A-Za-z0-9_.-]+)(.*)$/);
    if (parsed2?.[1])
      results.push({ name: parsed2[1], ...parsed2[2]?.trim() ? { version: parsed2[2].trim() } : {}, raw });
  }
  const poetry = sectionText(text2, "tool.poetry.dependencies");
  for (const match of poetry.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/gm)) {
    if (match[1]?.toLowerCase() === "python")
      continue;
    if (match[1] && match[2])
      results.push({ name: match[1], version: match[2], raw: `${match[1]} ${match[2]}` });
  }
  return results;
}
function mavenProject(text2) {
  const withoutDependencies = text2.replace(/<dependencies\b[\s\S]*?<\/dependencies>/gi, "");
  const groupId = xmlValue(withoutDependencies, "groupId");
  const artifactId = xmlValue(withoutDependencies, "artifactId");
  const version = xmlValue(withoutDependencies, "version");
  return {
    ...groupId ? { groupId } : {},
    ...artifactId ? { artifactId } : {},
    ...version ? { version } : {}
  };
}
function mavenDependencies(text2) {
  return [...text2.matchAll(/<dependency\b[^>]*>([\s\S]*?)<\/dependency>/gi)].flatMap((match) => {
    const groupId = xmlValue(match[1] ?? "", "groupId");
    const artifactId = xmlValue(match[1] ?? "", "artifactId");
    if (!groupId || !artifactId)
      return [];
    const version = xmlValue(match[1] ?? "", "version");
    return [{ groupId, artifactId, ...version ? { version } : {} }];
  });
}
function sectionText(text2, section2) {
  const escaped = section2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text2.match(new RegExp(`(?:^|\\n)\\s*\\[${escaped}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\s*\\[|$)`, "i"))?.[1] ?? "";
}
function tomlScalar(section2, key2) {
  return section2.match(new RegExp(`(?:^|\\n)\\s*${key2}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]?.trim();
}
function xmlValue(text2, tag) {
  return text2.match(new RegExp(`<${tag}\\b[^>]*>\\s*([^<]+?)\\s*</${tag}>`, "i"))?.[1]?.trim();
}
function parseJson2(text2) {
  try {
    const parsed2 = JSON.parse(text2);
    return isRecord11(parsed2) ? parsed2 : void 0;
  } catch {
    return void 0;
  }
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function normalizePythonName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}
function manifestDirectory(path) {
  return path.split("/").slice(0, -1).join("/");
}
function validateRepositoryInputs(inputs) {
  const ids = /* @__PURE__ */ new Set();
  for (const input of inputs) {
    if (!REPOSITORY_ID.test(input.id))
      throw new Error(`Invalid workspace repository ID: ${input.id}`);
    if (ids.has(input.id))
      throw new Error(`Duplicate workspace repository ID: ${input.id}`);
    ids.add(input.id);
  }
}
function deduplicateDiagnostics2(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  return diagnostics.filter((diagnostic) => {
    const key2 = `${diagnostic.code}\0${diagnostic.message}\0${diagnostic.repositories.join("\0")}`;
    if (seen.has(key2))
      return false;
    seen.add(key2);
    return true;
  }).sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
}
function isRecord11(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

// packages/core/dist/verify.js
function verifyPlan(report, repo, options = {}) {
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
  const unmapped = changed.filter((path) => !planned.has(path) && !isTest(path) && !discardedEdits.includes(path) && !trackedGeneratedEdits.includes(path) && fileByPath.get(path)?.isSource === true);
  if (unmapped.length > 0) {
    findings.push({
      code: "unmapped-change",
      severity: "warning",
      paths: unmapped,
      message: `${unmapped.length === 1 ? "One file" : `${unmapped.length} files`} changed that the plan did not rank. Either the task grew beyond the original description, or the ranking missed ${unmapped.length === 1 ? "it" : "them"}; worth checking which.`
    });
  }
  const unscanned = changed.filter((path) => !fileByPath.has(path) && !planned.has(path));
  if (unscanned.length > 0) {
    findings.push({
      code: "unscanned-change",
      severity: "warning",
      paths: unscanned,
      message: `${unscanned.length === 1 ? "One changed path was" : `${unscanned.length} changed paths were`} outside the scanned file set. FixMap cannot judge whether the plan covered these changes; inspect scan-limit, sparse-checkout, binary, deletion, and exclusion diagnostics.`
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
  const highImpactOutsidePlan = impact.files.filter((entry2) => entry2.confidence === "high" && !planned.has(entry2.path) && !changed.includes(entry2.path) && !isTest(entry2.path));
  if (highImpactOutsidePlan.length > 0) {
    findings.push({
      code: "impact-file-unreviewed",
      severity: "info",
      paths: highImpactOutsidePlan.slice(0, 8).map((entry2) => entry2.path),
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
      policy = evaluateArchitecturePolicy(architecturePolicy, {
        repo,
        focusPaths: changed,
        ...options.contractComparison ? { contractComparison: options.contractComparison } : {}
      });
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
  if (options.contractBaselineError)
    findings.push({
      code: "contract-baseline-unavailable",
      severity: "warning",
      paths: [".fixmap/policy.json"],
      message: `Policy contract rules were not checked: ${options.contractBaselineError}`
    });
  const sensitiveData = options.sensitiveData ? buildReportSensitiveData(repo, /* @__PURE__ */ new Set([...reportPaths(report), ...changed, ...impact.files.map((file) => file.path)]), { compareWithDiff: true }) : void 0;
  const sensitiveFinding = sensitiveData ? sensitiveDataVerifyFinding(sensitiveData) : void 0;
  if (sensitiveFinding)
    findings.push(sensitiveFinding);
  return {
    summary: buildVerifySummary(changed.length, findings),
    changedFiles: changed,
    findings,
    diagnostics: repo.diagnostics,
    impact,
    narrative: buildVerifyNarrative(report, changed, changedSource, changedTests, impact, newRisks, policy, options.workspace ? buildWorkspaceVerifyNarrative(options.workspace.map, options.workspace.repository, changed) : [], unmapped),
    ...sensitiveData ? { sensitiveData } : {}
  };
}
function policyVerifyFinding(finding) {
  return {
    code: finding.code === "boundary-violation" ? "architecture-boundary-violation" : finding.code === "required-test-missing" ? "architecture-required-test" : finding.code === "review-required" ? "architecture-review-required" : finding.code === "breaking-contract-allowed" ? "architecture-breaking-contract-allowed" : "architecture-breaking-contract",
    severity: finding.severity,
    paths: finding.paths,
    message: finding.message
  };
}
var POLICY_PHRASES = {
  "boundary-violation": "is broken",
  "required-test-missing": "wants a changed test",
  "review-required": "asks for review",
  "breaking-contract": "forbids this breaking contract change",
  "breaking-contract-allowed": "allows this breaking contract change"
};
function buildVerifyNarrative(report, changed, changedSource, changedTests, impact, newRisks, policy, crossRepository = [], unmapped = []) {
  const narrative = [];
  if (changed.length > 0)
    narrative.push({
      classification: "observation",
      text: `${changed.length} file${changed.length === 1 ? "" : "s"} changed: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? ", ..." : ""}.`,
      evidence: changed.map((path) => ({ kind: "changed-file", path, detail: "Present in the resolved verification diff." }))
    });
  narrative.push(...crossRepository);
  if (unmapped.length > 0)
    narrative.push({
      classification: "observation",
      text: `The plan did not rank ${unmapped.slice(0, 8).join(", ")}${unmapped.length > 8 ? ", ..." : ""}, but the diff changes ${unmapped.length === 1 ? "it" : "them"}.`,
      evidence: unmapped.map((path) => ({ kind: "changed-file", path, detail: "Changed source file absent from the saved plan." }))
    });
  for (const finding of policy?.findings ?? []) {
    narrative.push({
      classification: "observation",
      text: `Architecture rule ${finding.ruleId} ${POLICY_PHRASES[finding.code]}: ${finding.message}`,
      evidence: finding.evidence.map((entry2) => ({
        kind: "architecture-policy",
        ...entry2.path ? { path: entry2.path } : {},
        ...entry2.relatedPath ? { relatedPath: entry2.relatedPath } : {},
        detail: `${finding.ruleId}: ${entry2.kind}: ${entry2.detail}`,
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
      text: `${decision.source ? `Local PR attribution (remote source unverified): ${decision.source.url}. ` : ""}${decision.path} records ${/^[aeiou]/.test(decision.status) ? "an" : "a"} ${decision.status} decision${decision.authoredStatus ? ` (authored status: ${JSON.stringify(decision.authoredStatus)})` : ""} relevant to this diff: ${decisionSummary(decision.decision)}`,
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
var DECISION_SUMMARY_CHARS = 280;
function decisionSummary(text2) {
  const flat = text2.replace(/\s+/g, " ").trim();
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  if (sentence.length <= DECISION_SUMMARY_CHARS)
    return sentence.length < flat.length ? `${sentence} The record has more.` : sentence;
  const cut = sentence.slice(0, DECISION_SUMMARY_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > DECISION_SUMMARY_CHARS / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}\u2026 The record has more.`;
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
    lines.push("", result.findings.length > 0 ? "## Why This Diff Needs Attention" : "## What Changed", "");
    for (const statement of result.narrative) {
      lines.push(`- **${statement.classification}** ${statement.text}`);
    }
  }
  lines.push("", "## Changed Files", "");
  lines.push(...result.changedFiles.length > 0 ? result.changedFiles.map((path) => `- ${markdownCode(path)}`) : ["- None found"]);
  if (result.impact) {
    lines.push("", "## Recalculated Impact", "");
    lines.push(...result.impact.files.length > 0 ? result.impact.files.map((file) => `- ${markdownCode(file.path)} (${file.confidence} confidence): ${file.evidence.map((entry2) => entry2.reason).join("; ")}`) : ["- None found"]);
  }
  if (result.sensitiveData)
    lines.push(...renderSensitiveDataMarkdown(result.sensitiveData));
  return `${lines.join("\n")}
`;
}

// packages/core/dist/ownership.js
var CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
var MAX_RULES = 1e4;
var MAX_HISTORY_COMMITS2 = 250;
function routeReviewers(repo, input) {
  if (!Number.isFinite(Date.parse(input.now)))
    throw new Error("Review routing requires a valid assessment time.");
  const changedPaths = normalizePaths(input.changedPaths ?? repo.changedFiles);
  const diagnostics = [];
  const accumulated = /* @__PURE__ */ new Map();
  addCodeOwners(repo, changedPaths, accumulated, diagnostics);
  addAnnotations(repo, changedPaths, input.now, accumulated, diagnostics);
  addPolicy(repo, changedPaths, accumulated, diagnostics);
  if (input.includeHistoryAuthors === false) {
    diagnostics.push({ source: "git-history", severity: "info", message: "Commit-author suggestions were turned off; only CODEOWNERS, annotations, and architecture policy were used." });
  } else {
    addHistory(repo, changedPaths, accumulated, diagnostics);
  }
  const suggestions = [...accumulated].map(([reviewer, value]) => ({
    reviewer,
    confidence: value.confidence,
    paths: [...value.paths].sort(),
    evidence: value.evidence.sort(evidenceOrder),
    availabilityInferred: false
  })).sort((a, b) => confidenceOrder(a.confidence) - confidenceOrder(b.confidence) || a.reviewer.localeCompare(b.reviewer));
  return { reviewRoutingVersion: 1, changedPaths, suggestions, diagnostics };
}
function addCodeOwners(repo, paths, accumulated, diagnostics) {
  const source = CODEOWNERS_PATHS.map((path) => repo.files.find((file) => file.path === path)).find(Boolean);
  if (!source)
    return;
  if (source.textSampleComplete === false || !source.contentFingerprint) {
    diagnostics.push({ source: source.path, severity: "warning", message: `${source.path} is incomplete or lacks an exact fingerprint; CODEOWNERS routing was skipped.` });
    return;
  }
  const parsed2 = parseCodeOwners(source.textSample);
  diagnostics.push(...parsed2.diagnostics.map((message2) => ({ source: source.path, severity: "warning", message: message2 })));
  for (const path of paths) {
    const rule = [...parsed2.rules].reverse().find((candidate) => matchesCodeOwners(path, candidate.pattern));
    if (!rule)
      continue;
    for (const owner of rule.owners)
      add(accumulated, owner, "high", path, {
        kind: "codeowners",
        sourceFingerprint: source.contentFingerprint,
        path: source.path,
        line: rule.line,
        detail: `${source.path}:${rule.line} assigns ${owner} through pattern ${rule.pattern}.`
      });
  }
}
function parseCodeOwners(content) {
  const rules = [];
  const diagnostics = [];
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const tokens = trimmed.split(/\s+/);
    const pattern = tokens.shift() ?? "";
    const owners = [...new Set(tokens.filter(validOwner))].sort();
    if (!pattern || pattern.startsWith("!") || pattern.includes("[") || owners.length === 0) {
      diagnostics.push(`Ignored unsupported or ownerless CODEOWNERS rule at line ${lineNumber}.`);
      continue;
    }
    if (rules.length >= MAX_RULES) {
      diagnostics.push(`CODEOWNERS rules were bounded to ${MAX_RULES.toLocaleString()} entries.`);
      break;
    }
    rules.push({ pattern, owners, line: lineNumber });
  }
  return { rules, diagnostics };
}
function matchesCodeOwners(path, pattern) {
  try {
    const normalized = pattern.startsWith("/") ? pattern.slice(1) : pattern;
    return buildPathExcluder([normalized]).excludes(path);
  } catch {
    return false;
  }
}
function addAnnotations(repo, paths, now, accumulated, diagnostics) {
  const source = repo.files.find((file) => file.path === ".fixmap/annotations.json");
  if (!source)
    return;
  if (source.textSampleComplete === false || !source.contentFingerprint) {
    diagnostics.push({ source: source.path, severity: "warning", message: "Annotation owners were skipped because the store is incomplete or unversioned." });
    return;
  }
  try {
    const assessments = assessAnnotations(validateAnnotationStore(JSON.parse(source.textSample)), repo, { now });
    for (const assessment of assessments) {
      const annotation = assessment.annotation;
      if (assessment.status !== "active" || !annotation.owner)
        continue;
      const scopePath2 = annotation.scope.kind === "file" || annotation.scope.kind === "symbol" || annotation.scope.kind === "contract" ? annotation.scope.path : void 0;
      const matchedPaths = scopePath2 ? paths.filter((path) => path === scopePath2) : [];
      for (const path of matchedPaths)
        add(accumulated, annotation.owner, "high", path, {
          kind: "annotation",
          sourceFingerprint: source.contentFingerprint,
          path: source.path,
          detail: `${annotation.id} explicitly names ${annotation.owner} for ${path}.`
        });
    }
  } catch (error) {
    diagnostics.push({ source: source.path, severity: "warning", message: `Annotation owners were skipped: ${error instanceof Error ? error.message : String(error)}` });
  }
}
function addPolicy(repo, paths, accumulated, diagnostics) {
  try {
    const policy = architecturePolicyFromRepo(repo);
    if (!policy)
      return;
    const policyRepo = { ...repo, changedFiles: [...paths] };
    const findings = evaluateArchitecturePolicy(policy, { repo: policyRepo, focusPaths: paths }).findings;
    for (const finding of findings.filter((entry2) => entry2.code === "review-required")) {
      for (const evidence of finding.evidence.filter((entry2) => entry2.kind === "reviewer")) {
        for (const path of finding.paths)
          add(accumulated, evidence.detail, "high", path, {
            kind: "architecture-policy",
            sourceFingerprint: policy.source.fingerprint,
            path: policy.source.path,
            detail: `${finding.ruleId} requires ${evidence.detail} for ${path}.`
          });
      }
    }
  } catch (error) {
    diagnostics.push({ source: ".fixmap/policy.json", severity: "warning", message: `Policy reviewers were skipped: ${error instanceof Error ? error.message : String(error)}` });
  }
}
function addHistory(repo, paths, accumulated, diagnostics) {
  if (repo.history?.shallow) {
    diagnostics.push({ source: "git-history", severity: "warning", message: "Commit history is shallow, so commit-author suggestions only reflect the commits present in this clone." });
  } else if (repo.history?.truncated) {
    diagnostics.push({ source: "git-history", severity: "info", message: `Commit-author suggestions use only the newest ${Math.min(repo.history.inspectedCommits, MAX_HISTORY_COMMITS2).toLocaleString()} non-merge commits.` });
  }
  for (const path of paths) {
    const counts = /* @__PURE__ */ new Map();
    for (const commit of (repo.history?.commits ?? []).slice(0, MAX_HISTORY_COMMITS2)) {
      if (!commit.author || !commit.files.includes(path))
        continue;
      const previous = counts.get(commit.author);
      counts.set(commit.author, {
        count: (previous?.count ?? 0) + 1,
        latest: Math.max(previous?.latest ?? 0, commit.committedAt),
        hash: previous && previous.latest > commit.committedAt ? previous.hash : commit.hash
      });
    }
    for (const [author, evidence] of [...counts].sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest || a[0].localeCompare(b[0])).slice(0, 3)) {
      add(accumulated, author, "low", path, {
        kind: "git-history",
        sourceFingerprint: `git:${evidence.hash}`,
        path,
        detail: `${author} authored ${evidence.count} bounded non-merge commit${evidence.count === 1 ? "" : "s"} touching ${path}; current availability or employment is not inferred.`
      });
    }
  }
}
function add(accumulated, reviewer, confidence, path, evidence) {
  const identity = reviewer.trim();
  if (!identity || identity.length > 200 || /[\0-\x1f\x7f]/.test(identity))
    return;
  const existing = accumulated.get(identity) ?? { confidence, paths: /* @__PURE__ */ new Set(), evidence: [] };
  if (confidenceOrder(confidence) < confidenceOrder(existing.confidence))
    existing.confidence = confidence;
  existing.paths.add(path);
  const routed = { ...evidence, changedPath: path };
  if (!existing.evidence.some((entry2) => evidenceKey(entry2) === evidenceKey(routed)))
    existing.evidence.push(routed);
  accumulated.set(identity, existing);
}
function normalizePaths(values) {
  const normalized = values.map((value) => value.replace(/\\/g, "/"));
  const invalid = normalized.find((value) => !safePath2(value));
  if (invalid !== void 0)
    throw new Error(`Invalid review-routing path: ${String(invalid)}`);
  return [...new Set(normalized)].sort();
}
function safePath2(value) {
  return Boolean(value) && value.length <= 1e3 && !value.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) && value.split("/").every((part) => part && part !== "." && part !== "..");
}
function validOwner(value) {
  return value.length <= 200 && (/^@[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}
function evidenceKey(value) {
  return `${value.kind}\0${value.sourceFingerprint}\0${value.path ?? ""}\0${value.line ?? ""}\0${value.changedPath ?? ""}\0${value.detail}`;
}
function evidenceOrder(a, b) {
  return a.kind.localeCompare(b.kind) || (a.changedPath ?? "").localeCompare(b.changedPath ?? "") || (a.path ?? "").localeCompare(b.path ?? "") || (a.line ?? 0) - (b.line ?? 0);
}
function confidenceOrder(value) {
  return value === "high" ? 0 : value === "medium" ? 1 : 2;
}
function withoutMentions(value) {
  return value.replace(/(^|[^A-Za-z0-9_.+-])@+(?=[A-Za-z0-9])/g, "$1");
}
function reviewRoutingWithoutMentions(result) {
  return {
    ...result,
    suggestions: result.suggestions.map((suggestion) => ({
      ...suggestion,
      reviewer: withoutMentions(suggestion.reviewer),
      evidence: suggestion.evidence.map((entry2) => ({ ...entry2, detail: withoutMentions(entry2.detail) }))
    })).sort((a, b) => confidenceOrder(a.confidence) - confidenceOrder(b.confidence) || a.reviewer.localeCompare(b.reviewer)),
    diagnostics: result.diagnostics.map((entry2) => ({ ...entry2, message: withoutMentions(entry2.message) }))
  };
}

// packages/core/dist/change-scope.js
var MAX_ANCHORS = 64;
var MAX_DEPTH2 = 8;
var MAX_NODES = 2e3;
function buildChangeScope(repo, input) {
  if (!Number.isFinite(Date.parse(input.asOf)))
    throw new Error("Change scope requires a valid asOf timestamp.");
  if (input.anchors.length === 0 || input.anchors.length > MAX_ANCHORS) {
    throw new Error(`Change scope requires 1-${MAX_ANCHORS} explicit anchors.`);
  }
  const traversal = normalizeTraversal(input);
  const repositoryIdentity = createGraphIdentity({ workspace: input.workspace, kind: "repository", key: input.repository });
  const files = repo.files.filter((file) => !isFixMapArtifact(file) && !isGeneratedPath(file.path) && !isBackupPath(file.path)).sort((left, right) => left.path.localeCompare(right.path));
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const normalizedAnchors = input.anchors.map(normalizeAnchor);
  const selectedPaths = /* @__PURE__ */ new Map();
  const diagnostics = [];
  const resolvedAnchors = [];
  const omitted = /* @__PURE__ */ new Set();
  for (const anchor of normalizedAnchors) {
    const exact = fileByPath.has(anchor.path) ? [anchor.path] : [];
    const prefix = `${anchor.path}/`;
    const matches = exact.length > 0 ? exact : files.filter((file) => file.path.startsWith(prefix)).map((file) => file.path);
    const accepted = [];
    for (const path of matches) {
      if (selectedPaths.has(path)) {
        const evidence = selectedPaths.get(path);
        const declared = {
          kind: "declared",
          to: path,
          reason: `${anchor.operation} anchor ${anchor.path} explicitly selected ${path}.`
        };
        if (!evidence.some((entry2) => evidenceKey2(entry2) === evidenceKey2(declared)))
          evidence.push(declared);
        accepted.push(path);
        continue;
      }
      if (selectedPaths.size >= traversal.maxNodes) {
        omitted.add(path);
        continue;
      }
      selectedPaths.set(path, [{
        kind: "declared",
        to: path,
        reason: `${anchor.operation} anchor ${anchor.path} explicitly selected ${path}.`
      }]);
      accepted.push(path);
    }
    const status = matches.length > 0 ? "resolved" : "unresolved";
    resolvedAnchors.push({ ...anchor, status, matchedPaths: accepted });
    if (status === "unresolved") {
      diagnostics.push({
        code: "scope-anchor-unresolved",
        severity: anchor.operation === "add" ? "info" : "warning",
        message: `${anchor.operation} anchor ${anchor.path} does not match an existing repository file or directory. It remains declared but was not expanded into invented implementation evidence.`,
        paths: [anchor.path]
      });
    }
  }
  const graph = buildImportGraph(files);
  const affected = /* @__PURE__ */ new Map();
  const visited = new Set(selectedPaths.keys());
  const queue = [...selectedPaths.keys()].map((path) => ({ path, distance: 0 }));
  while (queue.length > 0) {
    const current2 = queue.shift();
    if (current2.distance >= traversal.maxDepth)
      continue;
    for (const neighbor of scopeNeighbors(graph, current2.path, traversal.direction)) {
      if (visited.has(neighbor.path)) {
        const existing = affected.get(neighbor.path);
        if (existing && current2.distance + 1 <= existing.distance && !existing.evidence.some((entry2) => evidenceKey2(entry2) === evidenceKey2(neighbor.evidence))) {
          existing.evidence.push(neighbor.evidence);
          existing.evidence.sort((left, right) => left.kind.localeCompare(right.kind) || left.reason.localeCompare(right.reason));
        }
        continue;
      }
      if (visited.size >= traversal.maxNodes) {
        omitted.add(neighbor.path);
        continue;
      }
      visited.add(neighbor.path);
      const distance = current2.distance + 1;
      affected.set(neighbor.path, { distance, evidence: [neighbor.evidence] });
      queue.push({ path: neighbor.path, distance });
    }
  }
  if (omitted.size > 0) {
    diagnostics.push({
      code: "scope-bounded",
      severity: "warning",
      message: `Change scope reached its ${traversal.maxNodes.toLocaleString()}-node bound and omitted ${omitted.size.toLocaleString()} additional structural ${omitted.size === 1 ? "node" : "nodes"}.`,
      paths: [...omitted].sort().slice(0, 8)
    });
  }
  const selected = [...selectedPaths].map(([path, evidence]) => scopePath(repositoryIdentity, fileByPath.get(path), path, "selected", 0, evidence, input)).sort(pathOrder);
  const affectedPaths = [...affected].map(([path, entry2]) => scopePath(repositoryIdentity, fileByPath.get(path), path, "affected", entry2.distance, entry2.evidence, input)).sort(pathOrder);
  const allPaths = [...selected.map((entry2) => entry2.path), ...affectedPaths.map((entry2) => entry2.path)];
  const pathSet = new Set(allPaths);
  const scopeRepo = { ...repo, changedFiles: allPaths };
  const testRoutes = buildTestRoutes(scopeRepo, allPaths);
  const contractSources = contractSourcesFromRepo(repo);
  const contractInventory = inventoryContracts(contractSources.sources.filter((source) => pathSet.has(source.path)), contractSources.diagnostics.filter((diagnostic) => pathSet.has(diagnostic.path)));
  const contracts = contractInventory.surfaces.filter((surface) => pathSet.has(surface.path));
  diagnostics.push(...contractInventory.diagnostics.map((entry2) => ({
    code: "scope-contract-warning",
    severity: entry2.severity,
    message: entry2.message,
    paths: [entry2.path]
  })));
  const decisionInventory = inventoryDecisionRecords(repo);
  const decisions = selectDecisionRecords(decisionInventory, { paths: allPaths, task: "" });
  diagnostics.push(...decisionInventory.diagnostics.filter((entry2) => pathSet.has(entry2.path)).map((entry2) => ({
    code: "scope-decision-warning",
    severity: entry2.severity,
    message: entry2.message,
    paths: [entry2.path]
  })));
  const reviewRouting = routeReviewers(repo, { changedPaths: allPaths, now: input.asOf });
  const reviewers = reviewRouting.suggestions;
  diagnostics.push(...reviewRouting.diagnostics.map((entry2) => ({
    code: "scope-ownership-warning",
    severity: entry2.severity,
    message: entry2.message
  })));
  let architectureFindings = [];
  try {
    const policy = architecturePolicyFromRepo(repo);
    if (policy) {
      architectureFindings = evaluateArchitecturePolicy(policy, {
        repo: scopeRepo,
        focusPaths: allPaths
      }).findings;
    }
  } catch (error) {
    diagnostics.push({
      code: "scope-policy-warning",
      severity: "warning",
      message: `Architecture evidence was skipped: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  const routedTestPaths = new Set(testRoutes.flatMap((route) => route.relatedFiles));
  return {
    changeScopeVersion: 1,
    workspace: input.workspace,
    repository: input.repository,
    repositoryIdentity,
    traversal,
    anchors: resolvedAnchors,
    selected,
    affected: affectedPaths,
    testRoutes,
    contracts,
    decisions,
    reviewers,
    architectureFindings,
    evidenceCounts: {
      declared: resolvedAnchors.length,
      observed: selected.length + contracts.length + decisions.length + reviewers.length,
      derived: affectedPaths.length + routedTestPaths.size + architectureFindings.length,
      unresolved: resolvedAnchors.filter((anchor) => anchor.status === "unresolved").length
    },
    bounded: { truncated: omitted.size > 0, omittedNodes: omitted.size },
    diagnostics: diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message))
  };
}
function normalizeTraversal(input) {
  const direction = input.direction ?? "both";
  if (!["dependencies", "dependents", "both"].includes(direction)) {
    throw new Error(`Invalid change-scope direction: ${String(direction)}.`);
  }
  const maxDepth = input.maxDepth ?? 2;
  const maxNodes = input.maxNodes ?? 200;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_DEPTH2) {
    throw new Error(`Change-scope maxDepth must be an integer from 0 to ${MAX_DEPTH2}.`);
  }
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_NODES) {
    throw new Error(`Change-scope maxNodes must be an integer from 1 to ${MAX_NODES}.`);
  }
  return { direction, maxDepth, maxNodes };
}
function normalizeAnchor(anchor) {
  if (anchor.operation !== "touch" && anchor.operation !== "add") {
    throw new Error(`Invalid change-scope operation: ${String(anchor.operation)}.`);
  }
  const path = anchor.path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.length > 1e3 || path.includes("\0") || /^[\/]/.test(path) || /^[A-Za-z]:/.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid change-scope path: ${anchor.path}`);
  }
  return { operation: anchor.operation, path };
}
function scopeNeighbors(graph, path, direction) {
  const neighbors = [];
  if (direction === "dependencies" || direction === "both") {
    for (const target of graph.imports.get(path) ?? []) {
      neighbors.push({
        path: target,
        evidence: { kind: "dependency", from: path, to: target, reason: `${path} imports ${target}.` }
      });
    }
  }
  if (direction === "dependents" || direction === "both") {
    for (const dependent of graph.importedBy.get(path) ?? []) {
      neighbors.push({
        path: dependent,
        evidence: { kind: "dependent", from: dependent, to: path, reason: `${dependent} imports ${path}.` }
      });
    }
  }
  return neighbors.sort((left, right) => left.path.localeCompare(right.path) || left.evidence.kind.localeCompare(right.evidence.kind));
}
function scopePath(repositoryIdentity, file, path, role, distance, evidence, input) {
  return {
    identity: createGraphIdentity({
      workspace: input.workspace,
      kind: "file",
      repository: input.repository,
      parent: repositoryIdentity,
      key: path
    }),
    path,
    role,
    distance,
    ...file.contentFingerprint ? { sourceFingerprint: file.contentFingerprint } : {},
    evidence: [...evidence].sort((left, right) => left.kind.localeCompare(right.kind) || left.reason.localeCompare(right.reason))
  };
}
function pathOrder(left, right) {
  return left.distance - right.distance || left.path.localeCompare(right.path);
}
function evidenceKey2(evidence) {
  return `${evidence.kind}\0${evidence.from ?? ""}\0${evidence.to}\0${evidence.reason}`;
}

// packages/core/dist/capabilities.js
var CAPABILITY_PATH = ".fixmap/capabilities.json";
var CAPABILITY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var MAX_CAPABILITIES = 256;
var MAX_ANCHORS2 = 64;
function validateCapabilityStore(candidate) {
  if (!isRecord12(candidate) || candidate.capabilityStoreVersion !== 1 || typeof candidate.workspace !== "string" || typeof candidate.repository !== "string" || !Array.isArray(candidate.capabilities)) {
    throw new Error("Capability store must be a version-1 object with workspace, repository, and capabilities fields.");
  }
  assertOnlyKeys(candidate, ["capabilityStoreVersion", "workspace", "repository", "capabilities"], "capability store");
  createGraphIdentity({ workspace: candidate.workspace, kind: "repository", key: candidate.repository });
  if (candidate.capabilities.length > MAX_CAPABILITIES) {
    throw new Error(`Capability store supports at most ${MAX_CAPABILITIES} capabilities.`);
  }
  const seen = /* @__PURE__ */ new Set();
  const capabilities = candidate.capabilities.map((entry2, index) => validateDefinition(entry2, index));
  for (const capability of capabilities) {
    if (seen.has(capability.id))
      throw new Error(`Duplicate capability id: ${capability.id}.`);
    seen.add(capability.id);
  }
  return {
    capabilityStoreVersion: 1,
    workspace: candidate.workspace,
    repository: candidate.repository,
    capabilities: capabilities.sort((left, right) => left.id.localeCompare(right.id))
  };
}
function capabilityStoreFromRepo(repo) {
  const file = repo.files.find((candidate) => candidate.path === CAPABILITY_PATH);
  if (!file)
    return void 0;
  if (file.textSampleComplete === false || !file.contentFingerprint) {
    throw new Error(`${CAPABILITY_PATH} requires complete content and an exact source fingerprint.`);
  }
  let parsed2;
  try {
    parsed2 = JSON.parse(file.textSample);
  } catch (error) {
    throw new Error(`${CAPABILITY_PATH} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    store: validateCapabilityStore(parsed2),
    source: { path: CAPABILITY_PATH, fingerprint: file.contentFingerprint }
  };
}
function buildCapabilityMap(repo, input) {
  const loaded = capabilityStoreFromRepo(repo);
  if (!loaded)
    throw new Error(`${CAPABILITY_PATH} was not found in the repository snapshot.`);
  const id = input.id.trim().toLowerCase();
  const capability = loaded.store.capabilities.find((entry2) => entry2.id === id);
  if (!capability)
    throw new Error(`Capability ${JSON.stringify(input.id)} was not found in ${CAPABILITY_PATH}.`);
  const scope = buildChangeScope(repo, {
    workspace: loaded.store.workspace,
    repository: loaded.store.repository,
    anchors: capability.anchors,
    asOf: input.asOf,
    ...capability.traversal?.direction ? { direction: capability.traversal.direction } : {},
    ...capability.traversal?.maxDepth !== void 0 ? { maxDepth: capability.traversal.maxDepth } : {},
    ...capability.traversal?.maxNodes !== void 0 ? { maxNodes: capability.traversal.maxNodes } : {}
  });
  return {
    capabilityMapVersion: 1,
    capability: copyDefinition(capability),
    source: loaded.source,
    scope
  };
}
function validateDefinition(candidate, index) {
  if (!isRecord12(candidate))
    throw new Error(`Capability at index ${index} must be an object.`);
  assertOnlyKeys(candidate, ["id", "name", "anchors", "traversal"], `capability at index ${index}`);
  if (typeof candidate.id !== "string" || !CAPABILITY_ID.test(candidate.id)) {
    throw new Error(`Capability at index ${index} has an invalid id; use lowercase letters, numbers, dots, dashes, or underscores.`);
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 120 || /[\0-\x1f\x7f]/.test(candidate.name)) {
    throw new Error(`Capability ${candidate.id} needs a bounded non-empty name.`);
  }
  if (!Array.isArray(candidate.anchors) || candidate.anchors.length === 0 || candidate.anchors.length > MAX_ANCHORS2) {
    throw new Error(`Capability ${candidate.id} requires 1-${MAX_ANCHORS2} explicit anchors.`);
  }
  const anchors = candidate.anchors.map((anchor, anchorIndex) => validateAnchor(anchor, candidate.id, anchorIndex));
  const anchorKeys = /* @__PURE__ */ new Set();
  for (const anchor of anchors) {
    const key2 = `${anchor.operation}\0${anchor.path}`;
    if (anchorKeys.has(key2))
      throw new Error(`Capability ${candidate.id} has a duplicate ${anchor.operation} anchor for ${anchor.path}.`);
    anchorKeys.add(key2);
  }
  const traversal = candidate.traversal === void 0 ? void 0 : validateTraversal(candidate.traversal, candidate.id);
  return {
    id: candidate.id,
    name: candidate.name.trim(),
    anchors,
    ...traversal ? { traversal } : {}
  };
}
function validateAnchor(candidate, capability, index) {
  if (!isRecord12(candidate))
    throw new Error(`Capability ${capability} anchor at index ${index} must be an object.`);
  assertOnlyKeys(candidate, ["operation", "path"], `capability ${capability} anchor at index ${index}`);
  if (candidate.operation !== "touch" && candidate.operation !== "add") {
    throw new Error(`Capability ${capability} anchor at index ${index} needs operation touch or add.`);
  }
  if (typeof candidate.path !== "string")
    throw new Error(`Capability ${capability} anchor at index ${index} needs a path.`);
  const path = normalizePath4(candidate.path);
  return { operation: candidate.operation, path };
}
function validateTraversal(candidate, capability) {
  if (!isRecord12(candidate))
    throw new Error(`Capability ${capability} traversal must be an object.`);
  assertOnlyKeys(candidate, ["direction", "maxDepth", "maxNodes"], `capability ${capability} traversal`);
  const direction = candidate.direction;
  if (direction !== void 0 && direction !== "dependencies" && direction !== "dependents" && direction !== "both") {
    throw new Error(`Capability ${capability} traversal direction is invalid.`);
  }
  if (candidate.maxDepth !== void 0 && (!Number.isSafeInteger(candidate.maxDepth) || Number(candidate.maxDepth) < 0 || Number(candidate.maxDepth) > 8)) {
    throw new Error(`Capability ${capability} traversal maxDepth must be an integer from 0 to 8.`);
  }
  if (candidate.maxNodes !== void 0 && (!Number.isSafeInteger(candidate.maxNodes) || Number(candidate.maxNodes) < 1 || Number(candidate.maxNodes) > 2e3)) {
    throw new Error(`Capability ${capability} traversal maxNodes must be an integer from 1 to 2000.`);
  }
  return {
    ...direction ? { direction } : {},
    ...candidate.maxDepth !== void 0 ? { maxDepth: Number(candidate.maxDepth) } : {},
    ...candidate.maxNodes !== void 0 ? { maxNodes: Number(candidate.maxNodes) } : {}
  };
}
function normalizePath4(value) {
  const path = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.length > 1e3 || path.includes("\0") || /^[\/]/.test(path) || /^[A-Za-z]:/.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid capability anchor path: ${value}`);
  }
  return path;
}
function copyDefinition(capability) {
  return {
    ...capability,
    anchors: capability.anchors.map((anchor) => ({ ...anchor })),
    ...capability.traversal ? { traversal: { ...capability.traversal } } : {}
  };
}
function assertOnlyKeys(record3, allowed, label) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record3).filter((key2) => !allowedSet.has(key2));
  if (unknown.length > 0)
    throw new Error(`${label} has unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
}
function isRecord12(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

// packages/core/dist/intent-store.js
var MAX_TTL_MINUTES = 7 * 24 * 60;

// packages/core/dist/validate.js
function validateFixMapReport(candidate, label) {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) || !Array.isArray(candidate.contextFiles)) {
    return {
      success: false,
      message: `${label} is not a FixMap JSON report: no contextFiles array.`
    };
  }
  const record3 = candidate;
  if (record3.reportVersion !== void 0 && record3.reportVersion !== 1) {
    return {
      success: false,
      message: `${label} uses unsupported reportVersion ${JSON.stringify(record3.reportVersion)}; this FixMap release supports reportVersion 1.`
    };
  }
  const invalidEnvelopeFields = [
    typeof record3.summary === "string" ? void 0 : "summary (string)",
    Array.isArray(record3.testRoutes) ? void 0 : "testRoutes (array)",
    Array.isArray(record3.risks) ? void 0 : "risks (array)",
    Array.isArray(record3.changedFiles) ? void 0 : "changedFiles (array)",
    Array.isArray(record3.diagnostics) ? void 0 : "diagnostics (array)"
  ].filter((field) => field !== void 0);
  if (invalidEnvelopeFields.length > 0) {
    return {
      success: false,
      message: `${label} is missing or has invalid fields in the complete FixMap report envelope: ${invalidEnvelopeFields.join(", ")}.`
    };
  }
  const versioned = record3.reportVersion === 1;
  const contextFiles = candidate.contextFiles;
  const unsafeContextPath = contextFiles.findIndex((file) => isRecord13(file) && typeof file.path === "string" && file.path.trim().length > 0 && !isRepositoryRelativePath(file.path));
  if (unsafeContextPath !== -1) {
    const path = contextFiles[unsafeContextPath].path;
    return {
      success: false,
      message: `${label} contextFiles[${unsafeContextPath}].path must stay inside the repository and use a normalized repository-relative path (got ${JSON.stringify(path)}).`
    };
  }
  const invalid = contextFiles.findIndex((file) => {
    if (!isRecord13(file))
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
  const testRoutes = record3.testRoutes;
  const invalidRoute = testRoutes.findIndex((route) => {
    if (!isRecord13(route))
      return true;
    return typeof route.command !== "string" || !route.command.trim() || !isRepositoryRelativePathArray(route.relatedFiles) || (versioned || route.kind !== void 0) && route.kind !== "test" && route.kind !== "validation" || (versioned || route.reason !== void 0) && typeof route.reason !== "string";
  });
  if (invalidRoute !== -1) {
    return {
      success: false,
      message: `${label} has an invalid testRoutes entry at index ${invalidRoute}; each route needs a string "command" and an array of non-empty string paths named relatedFiles; optional kind and reason fields must use their documented types.`
    };
  }
  const risks = record3.risks;
  const invalidRisk = risks.findIndex((risk) => {
    if (!isRecord13(risk))
      return true;
    return typeof risk.area !== "string" || !risk.area.trim() || (versioned || risk.reason !== void 0) && typeof risk.reason !== "string" || (versioned || risk.severity !== void 0) && risk.severity !== "low" && risk.severity !== "medium" && risk.severity !== "high";
  });
  if (invalidRisk !== -1) {
    return {
      success: false,
      message: `${label} has an invalid risks entry at index ${invalidRisk}; each risk needs a non-empty string "area", and optional reason and severity fields must use their documented types.`
    };
  }
  if (record3.impact !== void 0) {
    const impact = record3.impact;
    const history = isRecord13(impact) ? impact.history : void 0;
    if (!isRecord13(impact) || !isRepositoryRelativePathArray(impact.seeds) || !Array.isArray(impact.files) || !isRepositoryRelativePathArray(impact.inspectionOrder) || !isRecord13(history) || typeof history.available !== "boolean" || typeof history.eligibleCommits !== "number" || !Number.isSafeInteger(history.eligibleCommits) || history.eligibleCommits < 0 || typeof history.shallow !== "boolean" || typeof history.truncated !== "boolean") {
      return { success: false, message: `${label} has an invalid impact graph envelope.` };
    }
    const invalidImpact = impact.files.findIndex((file) => {
      if (!isRecord13(file) || !isRepositoryRelativePath(file.path) || typeof file.score !== "number" || !Number.isFinite(file.score) || file.score < 0 || file.confidence !== "high" && file.confidence !== "medium" && file.confidence !== "low" || !Array.isArray(file.evidence))
        return true;
      return file.evidence.some((evidence) => !isRecord13(evidence) || !["imports", "imported-by", "co-change", "test-route"].includes(String(evidence.kind)) || !isRepositoryRelativePath(evidence.seed) || typeof evidence.reason !== "string" || !evidence.reason.trim() || evidence.occurrences !== void 0 && (!Number.isSafeInteger(evidence.occurrences) || evidence.occurrences < 0) || evidence.seedChanges !== void 0 && (!Number.isSafeInteger(evidence.seedChanges) || evidence.seedChanges < 0));
    });
    if (invalidImpact !== -1) {
      return { success: false, message: `${label} has an invalid impact.files entry at index ${invalidImpact}.` };
    }
    if (impact.primaryImports !== void 0) {
      const primaryPaths = new Set(contextFiles.map((file) => file.path));
      const seenEdges = /* @__PURE__ */ new Set();
      if (!Array.isArray(impact.primaryImports) || impact.primaryImports.some((edge) => {
        if (!isRecord13(edge) || !isRepositoryRelativePath(edge.from) || !isRepositoryRelativePath(edge.to) || edge.from === edge.to || !primaryPaths.has(edge.from) || !primaryPaths.has(edge.to))
          return true;
        const key2 = JSON.stringify([edge.from, edge.to]);
        if (seenEdges.has(key2))
          return true;
        seenEdges.add(key2);
        return false;
      })) {
        return { success: false, message: `${label} has invalid impact.primaryImports; each unique edge must join two distinct primary context paths.` };
      }
    }
  }
  if (!isRepositoryRelativePathArray(record3.changedFiles)) {
    return { success: false, message: `${label} has invalid changedFiles; every entry must be a safe repository-relative path.` };
  }
  if (record3.evidence !== void 0) {
    const evidence = record3.evidence;
    const validSubject = (subject) => isRecord13(subject) && typeof subject.kind === "string" && (subject.path === void 0 || isRepositoryRelativePath(subject.path));
    if (!isRecord13(evidence) || evidence.evidenceVersion !== 1 || typeof evidence.collectedAt !== "string" || !Array.isArray(evidence.sources) || !evidence.sources.every((source) => isRecord13(source) && typeof source.provider === "string" && typeof source.version === "string" && (source.documentSha256 === void 0 || typeof source.documentSha256 === "string" && /^[a-f0-9]{64}$/.test(source.documentSha256))) || !Array.isArray(evidence.items) || evidence.items.length > 50 || !evidence.items.every((item) => isRecord13(item) && typeof item.id === "string" && typeof item.summary === "string" && typeof item.kind === "string" && ["high", "medium", "low"].includes(String(item.confidence)) && isRecord13(item.provider) && Array.isArray(item.subjects) && item.subjects.length > 0 && item.subjects.every(validSubject)) || !Number.isSafeInteger(evidence.omittedItems) || evidence.omittedItems < 0 || !Array.isArray(evidence.diagnostics)) {
      return { success: false, message: `${label} has invalid evidence; it needs evidenceVersion 1, sources, at most 50 items with safe repository-relative subjects, omittedItems, and diagnostics.` };
    }
  }
  if (record3.sensitiveData !== void 0 && !isReportSensitiveData(record3.sensitiveData)) {
    return { success: false, message: `${label} has invalid sensitiveData; it needs sensitiveDataVersion 1, the fixmap-sensitive-data provider, counts, and at most 50 flows with safe paths, known categories, and rule ids.` };
  }
  if (record3.supplyChain !== void 0 && !isReportSupplyChain(record3.supplyChain)) {
    return { success: false, message: `${label} has invalid supplyChain; it needs supplyChainVersion 1, tool and bundle provenance, omittedFindings, and at most 50 findings with manifest paths.` };
  }
  if (record3.languageAdapters !== void 0) {
    const adapters = record3.languageAdapters;
    if (!Array.isArray(adapters) || adapters.length > 32 || !adapters.every((adapter) => isRecord13(adapter) && Object.keys(adapter).every((key2) => key2 === "id" || key2 === "version" || key2 === "extensions") && typeof adapter.id === "string" && /^custom:[a-z][a-z0-9-]{0,63}$/.test(adapter.id) && typeof adapter.version === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(adapter.version) && Array.isArray(adapter.extensions) && adapter.extensions.length > 0 && adapter.extensions.length <= 32 && adapter.extensions.every((extension) => typeof extension === "string" && /^\.[a-z0-9][a-z0-9_-]{0,15}$/.test(extension)))) {
      return { success: false, message: `${label} has invalid languageAdapters; each entry needs a custom: id, a version, and lowercase extensions.` };
    }
  }
  if (record3.annotations !== void 0) {
    const annotations = record3.annotations;
    if (!isRecord13(annotations) || typeof annotations.asOf !== "string" || !Number.isFinite(Date.parse(annotations.asOf)) || !isRepositoryRelativePath(annotations.sourcePath) || typeof annotations.sourceFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(annotations.sourceFingerprint) || !Array.isArray(annotations.entries)) {
      return { success: false, message: `${label} has an invalid annotations envelope.` };
    }
    const invalidAnnotation = annotations.entries.findIndex((assessment) => {
      if (!isRecord13(assessment) || !isRecord13(assessment.annotation) || typeof assessment.message !== "string" || !["active", "expired", "missing-target", "renamed-target"].includes(String(assessment.status)) || assessment.suggestedPath !== void 0 && !isRepositoryRelativePath(assessment.suggestedPath))
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
  if (record3.decisions !== void 0) {
    if (!Array.isArray(record3.decisions))
      return { success: false, message: `${label} has invalid decisions; expected an array.` };
    const invalidDecision = record3.decisions.findIndex((decision) => {
      if (!isRecord13(decision) || typeof decision.id !== "string" || !/^decision:[a-f0-9]{16}$/.test(decision.id) || !isRepositoryRelativePath(decision.path) || typeof decision.title !== "string" || !decision.title.trim() || !["proposed", "accepted", "rejected", "deprecated", "superseded", "unknown"].includes(String(decision.status)) || typeof decision.decision !== "string" || !decision.decision.trim() || typeof decision.sourceFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(decision.sourceFingerprint) || !Array.isArray(decision.targets) || !Array.isArray(decision.supersedes) || !decision.supersedes.every((value) => typeof value === "string" && value.trim()) || decision.date !== void 0 && (typeof decision.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(decision.date)) || decision.context !== void 0 && typeof decision.context !== "string" || decision.authoredStatus !== void 0 && (typeof decision.authoredStatus !== "string" || !decision.authoredStatus.trim() || decision.authoredStatus.length > 500 || decision.authoredStatus.includes("\0")) || decision.consequences !== void 0 && typeof decision.consequences !== "string" || decision.dependencyRules !== void 0 && (!Array.isArray(decision.dependencyRules) || !decision.dependencyRules.every((rule) => isRecord13(rule) && typeof rule.from === "string" && rule.from.trim() && typeof rule.deny === "string" && rule.deny.trim())))
        return true;
      if (decision.source !== void 0 && (!isRecord13(decision.source) || decision.source.kind !== "pull-request" || decision.source.verification !== "unverified-local-attribution" || !isDecisionPullRequestUrl(decision.source.url)))
        return true;
      return decision.targets.some((target) => {
        if (!isRecord13(target) || !["explicit", "literal-mention"].includes(String(target.evidence)))
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
  if (record3.policy !== void 0) {
    const policy = record3.policy;
    if (!isRecord13(policy) || typeof policy.policyFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(policy.policyFingerprint) || !Array.isArray(policy.findings)) {
      return { success: false, message: `${label} has an invalid architecture policy envelope.` };
    }
    const invalidPolicyFinding = policy.findings.findIndex((finding) => {
      if (!isRecord13(finding) || !["boundary-violation", "required-test-missing", "review-required", "breaking-contract"].includes(String(finding.code)) || !["info", "warning", "error"].includes(String(finding.severity)) || typeof finding.ruleId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(finding.ruleId) || typeof finding.message !== "string" || !finding.message.trim() || !isRepositoryRelativePathArray(finding.paths) || !Array.isArray(finding.evidence))
        return true;
      return finding.evidence.some((evidence) => !isRecord13(evidence) || !["import", "changed-file", "test-pattern", "reviewer", "contract-change", "decision-record"].includes(String(evidence.kind)) || typeof evidence.detail !== "string" || !evidence.detail.trim() || evidence.path !== void 0 && !isRepositoryRelativePath(evidence.path) || evidence.relatedPath !== void 0 && !isRepositoryRelativePath(evidence.relatedPath));
    });
    if (invalidPolicyFinding !== -1) {
      return { success: false, message: `${label} has an invalid architecture policy finding at index ${invalidPolicyFinding}.` };
    }
  }
  const diagnostics = record3.diagnostics;
  const invalidDiagnostic = diagnostics.findIndex((diagnostic) => {
    if (!isRecord13(diagnostic))
      return true;
    return typeof diagnostic.code !== "string" || !diagnostic.code.trim() || typeof diagnostic.message !== "string" || diagnostic.severity !== "info" && diagnostic.severity !== "warning" && diagnostic.severity !== "error" || diagnostic.paths !== void 0 && !isRepositoryRelativePathArray(diagnostic.paths);
  });
  if (invalidDiagnostic !== -1) {
    return {
      success: false,
      message: `${label} has an invalid diagnostics entry at index ${invalidDiagnostic}; each diagnostic needs string code and message fields, an info, warning, or error severity, and optional non-empty string paths.`
    };
  }
  if (record3.analysis !== void 0) {
    const analysis = record3.analysis;
    const grounding = isRecord13(analysis) ? analysis.grounding : void 0;
    const specificity = isRecord13(grounding) ? grounding.specificity : void 0;
    if (specificity !== "anchored" && specificity !== "descriptive" && specificity !== "vague") {
      return {
        success: false,
        message: `${label} has invalid analysis.grounding.specificity; expected anchored, descriptive, or vague.`
      };
    }
    if (!isRecord13(analysis) || !isRecord13(grounding) || !Array.isArray(grounding.identifiers) || !isStringArray(grounding.unresolvedIdentifiers) || !isStringArray(grounding.partiallyResolvedIdentifiers) || !isStringArray(grounding.unverifiedIdentifiers) || typeof grounding.scanComplete !== "boolean" || !isRecord13(analysis.ranking) || !isNullableFiniteNumber(analysis.ranking.topScore) || !isNullableFiniteNumber(analysis.ranking.runnerUpScore) || !isNullableFiniteNumber(analysis.ranking.topGap) || typeof analysis.ranking.clustered !== "boolean" || typeof analysis.nextAction !== "string") {
      return {
        success: false,
        message: `${label} has incomplete or invalid analysis grounding, ranking, or nextAction fields.`
      };
    }
    const invalidIdentifier = grounding.identifiers.findIndex((identifier) => !isRecord13(identifier) || typeof identifier.identifier !== "string" || !identifier.identifier.trim() || !isIdentifierStatus(identifier.status) || !isRepositoryRelativePathArray(identifier.matchedFiles));
    if (invalidIdentifier !== -1) {
      return {
        success: false,
        message: `${label} has an invalid analysis.grounding.identifiers entry at index ${invalidIdentifier}.`
      };
    }
    if (analysis.retrievalRanking !== void 0) {
      const retrievalRanking = analysis.retrievalRanking;
      if (!isRecord13(retrievalRanking) || !isNullableFiniteNumber(retrievalRanking.topFusionScore) || !isNullableFiniteNumber(retrievalRanking.runnerUpFusionScore) || !isNullableFiniteNumber(retrievalRanking.topGap)) {
        return { success: false, message: `${label} has invalid analysis.retrievalRanking fields.` };
      }
    }
  }
  if (record3.retrieval !== void 0) {
    const retrieval = record3.retrieval;
    const weights = isRecord13(retrieval) ? retrieval.weights : void 0;
    if (!isRecord13(retrieval) || retrieval.mode !== "structural-lexical" && retrieval.mode !== "structural-lexical-semantic" || !isRecord13(weights) || !isPositiveFiniteNumber(weights.structural) || !isPositiveFiniteNumber(weights.lexical) || !isPositiveFiniteNumber(weights.semantic) || !isPositiveFiniteNumber(weights.reciprocalRankConstant)) {
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
function isRecord13(candidate) {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
function isStringArray(candidate) {
  return Array.isArray(candidate) && candidate.every((entry2) => typeof entry2 === "string");
}
function isRepositoryRelativePathArray(candidate) {
  return Array.isArray(candidate) && candidate.every(isRepositoryRelativePath);
}
function isNullableFiniteNumber(candidate) {
  return candidate === null || typeof candidate === "number" && Number.isFinite(candidate);
}
function isIdentifierStatus(candidate) {
  return candidate === "exact-definition" || candidate === "exact-text" || candidate === "partial-definition" || candidate === "not-found" || candidate === "unverified";
}
function isRetrievalSignal(candidate) {
  if (!isRecord13(candidate))
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
  if (!isRecord13(candidate))
    return false;
  return typeof candidate.id === "string" && candidate.id.trim().length > 0 && typeof candidate.version === "string" && candidate.version.trim().length > 0 && typeof candidate.model === "string" && candidate.model.trim().length > 0 && typeof candidate.artifactHash === "string" && /^[a-f0-9]{64}$/.test(candidate.artifactHash) && typeof candidate.runtime === "string" && candidate.runtime.trim().length > 0 && Number.isSafeInteger(candidate.dimensions) && Number(candidate.dimensions) > 0 && (candidate.normalization === "l2" || candidate.normalization === "none") && typeof candidate.local === "boolean" && typeof candidate.cacheKey === "string" && candidate.cacheKey.trim().length > 0 && Number.isSafeInteger(candidate.indexedFiles) && Number(candidate.indexedFiles) >= 0 && Number.isSafeInteger(candidate.truncatedFiles) && Number(candidate.truncatedFiles) >= 0;
}
function isPositiveFiniteNumber(candidate) {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0;
}

// packages/core/dist/workspace-config.js
import { readFile as readFile5, realpath as realpath3 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname3, isAbsolute as isAbsolute3, resolve as resolve6 } from "node:path";
var REPOSITORY_ID2 = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var MAX_ALIASES = 256;
var MAX_PACKAGE_NAME = 214;
var MAX_REASON = 500;
var ECOSYSTEMS = /* @__PURE__ */ new Set(["node", "python", "maven"]);
var ALIAS_KEYS = /* @__PURE__ */ new Set(["consumer", "ecosystem", "package", "provider", "providerPackage", "reason"]);
function parseWorkspaceConfig(value) {
  if (!isRecord14(value))
    throw new Error("Workspace config must be a JSON object.");
  if (value.workspaceConfigVersion !== 1) {
    throw new Error("Workspace config workspaceConfigVersion must be 1.");
  }
  const workspace = stringField(value.workspace, "workspace");
  if (!Array.isArray(value.repositories) || value.repositories.length < 1 || value.repositories.length > 32) {
    throw new Error("Workspace config repositories must contain 1-32 entries.");
  }
  const repositories = value.repositories.map((entry2, index) => {
    if (!isRecord14(entry2))
      throw new Error(`Workspace repository ${index + 1} must be an object.`);
    const id = stringField(entry2.id, `repositories[${index}].id`);
    if (!REPOSITORY_ID2.test(id))
      throw new Error(`Invalid workspace repository ID: ${id}`);
    const path = stringField(entry2.path, `repositories[${index}].path`);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
      throw new Error(`Workspace repository ${id} must use a local path, not a URL.`);
    }
    const relationship = parseRelationship(entry2.relationship, id);
    return { id, path, ...relationship ? { relationship } : {} };
  });
  const aliases = value.aliases === void 0 ? void 0 : parseAliases(value.aliases, new Set(repositories.map((entry2) => entry2.id)));
  return { workspaceConfigVersion: 1, workspace, repositories, ...aliases ? { aliases } : {} };
}
function parseAliases(value, repositoryIds) {
  if (!Array.isArray(value) || value.length > MAX_ALIASES) {
    throw new Error(`Workspace config aliases must be an array of at most ${MAX_ALIASES} entries.`);
  }
  const seen = /* @__PURE__ */ new Set();
  return value.map((entry2, index) => {
    const where = `aliases[${index}]`;
    if (!isRecord14(entry2))
      throw new Error(`Workspace config ${where} must be an object.`);
    const unknown = Object.keys(entry2).filter((key3) => !ALIAS_KEYS.has(key3));
    if (unknown.length > 0)
      throw new Error(`Workspace config ${where} has unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
    const consumer = stringField(entry2.consumer, `${where}.consumer`);
    const provider = stringField(entry2.provider, `${where}.provider`);
    for (const [field, id] of [["consumer", consumer], ["provider", provider]]) {
      if (!repositoryIds.has(id))
        throw new Error(`Workspace config ${where}.${field} names unknown repository ${id}.`);
    }
    if (consumer === provider)
      throw new Error(`Workspace config ${where} must link two different repositories.`);
    if (typeof entry2.ecosystem !== "string" || !ECOSYSTEMS.has(entry2.ecosystem)) {
      throw new Error(`Workspace config ${where}.ecosystem must be node, python, or maven.`);
    }
    const ecosystem = entry2.ecosystem;
    const pkg = packageName(entry2.package, `${where}.package`);
    const providerPackage = packageName(entry2.providerPackage, `${where}.providerPackage`);
    const reason2 = stringField(entry2.reason, `${where}.reason`);
    if (reason2.length > MAX_REASON || /[\u0000-\u001f\u007f]/.test(reason2)) {
      throw new Error(`Workspace config ${where}.reason must be one line of at most ${MAX_REASON} characters.`);
    }
    const key2 = `${consumer}\0${ecosystem}\0${pkg}`;
    if (seen.has(key2))
      throw new Error(`Workspace config ${where} repeats the alias for ${consumer} ${ecosystem}:${pkg}.`);
    seen.add(key2);
    return { consumer, ecosystem, package: pkg, provider, providerPackage, reason: reason2 };
  });
}
function packageName(value, name) {
  const text2 = stringField(value, name);
  if (text2.length > MAX_PACKAGE_NAME || /[\s\u0000-\u001f\u007f`\\]/.test(text2) || text2.includes("..")) {
    throw new Error(`Workspace config ${name} must be a package name of at most ${MAX_PACKAGE_NAME} characters without whitespace, backslashes, or "..".`);
  }
  return text2;
}
function parseRelationship(value, repository) {
  if (value === void 0)
    return void 0;
  if (!isRecord14(value) || value.kind !== "checkout" && value.kind !== "submodule") {
    throw new Error(`Workspace repository ${repository} relationship.kind must be checkout or submodule.`);
  }
  if (value.kind === "checkout")
    return { kind: "checkout" };
  const parentRepository = stringField(value.parentRepository, `${repository}.relationship.parentRepository`);
  const path = typeof value.path === "string" && value.path.trim() ? value.path.trim() : void 0;
  return { kind: "submodule", parentRepository, ...path ? { path } : {} };
}
async function resolveWorkspaceRepositories(repositories, configDirectory) {
  const ids = /* @__PURE__ */ new Set();
  const roots = /* @__PURE__ */ new Map();
  const resolved = [];
  for (const config of repositories) {
    if (ids.has(config.id))
      throw new Error(`Duplicate workspace repository ID: ${config.id}`);
    ids.add(config.id);
    const literal = expandHomePath(config.path);
    const root = resolve6(isAbsolute3(literal) ? literal : resolve6(configDirectory, literal));
    let canonical;
    try {
      canonical = await realpath3(root);
    } catch (error) {
      const code = error.code;
      throw new Error(`Workspace repository ${config.id} could not be opened at "${root}": ${code === "ENOENT" ? "no such file or directory" : error instanceof Error ? error.message : String(error)}`);
    }
    const key2 = pathKey(canonical);
    const collision = roots.get(key2);
    if (collision)
      throw new Error(`Workspace repositories ${collision} and ${config.id} resolve to the same checkout.`);
    roots.set(key2, config.id);
    resolved.push({ config, root: canonical });
  }
  return resolved;
}
async function loadWorkspaceConfig(configPath, options = {}) {
  let raw;
  try {
    raw = JSON.parse((await readFile5(configPath, "utf8")).replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`Could not read workspace config "${configPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = parseWorkspaceConfig(raw);
  const resolved = await resolveWorkspaceRepositories(config.repositories, dirname3(resolve6(configPath)));
  const scan = options.scanRepository ?? scanRepo;
  const scanned = [];
  for (const entry2 of resolved) {
    const repo = await scan({ repoRoot: entry2.root, includeHistory: false, useCache: options.useCache ?? true });
    assertWorkspaceScan(entry2.config.id, repo);
    scanned.push({ id: entry2.config.id, root: entry2.root, repo, relationship: entry2.config.relationship });
  }
  const map = buildWorkspaceMap(scanned.map((entry2) => ({ id: entry2.id, repo: entry2.repo, relationship: entry2.relationship ?? { kind: "checkout" } })), { workspace: config.workspace, ...config.aliases ? { aliases: config.aliases } : {} });
  return { config, repositories: resolved.map((entry2) => ({ id: entry2.config.id, root: entry2.root })), map };
}
function assertWorkspaceScan(repository, repo) {
  const error = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (error)
    throw new Error(`Workspace repository ${repository} could not be scanned: ${error.message}`);
  if (repo.files.length === 0)
    throw new Error(`Workspace repository ${repository} contains no scannable files.`);
}
async function findWorkspaceRepository(loaded, repoRoot) {
  let canonical;
  try {
    canonical = await realpath3(resolve6(repoRoot));
  } catch {
    return void 0;
  }
  return loaded.repositories.find((entry2) => pathKey(entry2.root) === pathKey(canonical))?.id;
}
function pathKey(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
function expandHomePath(value) {
  if (value === "~")
    return homedir3();
  if (value.startsWith("~/") || value.startsWith("~\\"))
    return resolve6(homedir3(), value.slice(2));
  return value;
}
function stringField(value, name) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Workspace config ${name} must be a non-blank string.`);
  return value.trim();
}
function isRecord14(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/dist/annotation-store.js
import { mkdir as mkdir3, open as open2, readFile as readFile6, realpath as realpath4, rename as rename3, rm, stat as stat3, lstat as lstat2 } from "node:fs/promises";
import { resolve as resolve7 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";
async function readAnnotationStore(repoRoot) {
  return readStore(await annotationRoot(repoRoot));
}
async function updateAnnotationStore(repoRoot, update) {
  const root = await annotationRoot(repoRoot);
  return withStoreLock(root, async () => {
    const updated = validateAnnotationStore(await update(await readStore(root)));
    await writeStore(root, updated);
    return updated;
  });
}
async function annotationRoot(path) {
  const root = await realpath4(path);
  if (!(await stat3(root)).isDirectory())
    throw new Error("Annotation repository must be a directory.");
  return root;
}
async function readStore(repoRoot) {
  await assertStoreBoundary(repoRoot);
  const path = resolve7(repoRoot, ".fixmap", "annotations.json");
  try {
    return validateAnnotationStore(JSON.parse(await readFile6(path, "utf8")));
  } catch (error) {
    if (isNodeError(error, "ENOENT"))
      return emptyAnnotationStore();
    if (error instanceof SyntaxError)
      throw new Error(`${path} is not valid JSON; repair it before adding annotations.`);
    throw error;
  }
}
async function writeStore(repoRoot, store) {
  const directory = resolve7(repoRoot, ".fixmap");
  await mkdir3(directory, { recursive: true });
  await assertStoreBoundary(repoRoot);
  const target = resolve7(directory, "annotations.json");
  const temporary = resolve7(directory, `.annotations.${process.pid}.${randomUUID3()}.tmp`);
  const handle = await open2(temporary, "wx", 384);
  try {
    await handle.writeFile(`${JSON.stringify(validateAnnotationStore(store), null, 2)}
`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename3(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
async function withStoreLock(repoRoot, operation) {
  await assertStoreBoundary(repoRoot);
  const directory = resolve7(repoRoot, ".fixmap");
  await mkdir3(directory, { recursive: true });
  await assertStoreBoundary(repoRoot);
  const lockPath = resolve7(directory, "annotations.lock");
  let handle;
  try {
    handle = await open2(lockPath, "wx", 384);
  } catch (error) {
    if (!isNodeError(error, "EEXIST"))
      throw error;
    throw new Error("Another FixMap annotation update is in progress or left a lock. Retry after it finishes; if interrupted, confirm no annotation writer is running before manually removing .fixmap/annotations.lock.");
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: (/* @__PURE__ */ new Date()).toISOString() })}
`, "utf8");
    await handle.sync();
    return await operation();
  } finally {
    try {
      await handle.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}
async function assertStoreBoundary(repoRoot) {
  const directory = resolve7(repoRoot, ".fixmap");
  const directoryInfo = await lstat2(directory).catch((error) => {
    if (isNodeError(error, "ENOENT"))
      return void 0;
    throw error;
  });
  if (!directoryInfo)
    return;
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || await realpath4(directory) !== directory) {
    throw new Error("Annotation store directory must be a real repository-local .fixmap directory, not a link or junction.");
  }
  for (const name of ["annotations.json", "annotations.lock"]) {
    const info = await lstat2(resolve7(directory, name)).catch((error) => {
      if (isNodeError(error, "ENOENT"))
        return void 0;
      throw error;
    });
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) {
      throw new Error("Annotation store and lock must be regular, unlinked repository-local files.");
    }
  }
}
function isNodeError(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}

// packages/core/dist/sandbox.js
import { execFile as execFile5, spawn as spawn2 } from "node:child_process";
import { promisify as promisify5 } from "node:util";
var exec5 = promisify5(execFile5);
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

// packages/core/dist/editor-transport.js
var EDITOR_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;

// packages/core/dist/capability-history.js
async function compareCapabilityRefs(input) {
  if (!Number.isFinite(Date.parse(input.asOf)))
    throw new Error("Capability history requires a valid asOf timestamp.");
  const id = input.id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))
    throw new Error("Capability history requires a valid capability id.");
  const [historicalFrom, historicalTo] = await Promise.all([
    scanRepoAtRef({ repoRoot: input.repoRoot, ref: input.fromRef }),
    scanRepoAtRef({ repoRoot: input.repoRoot, ref: input.toRef })
  ]);
  const from = capabilitySnapshot(historicalFrom, id, input.asOf);
  const to = capabilitySnapshot(historicalTo, id, input.asOf);
  const selected = comparePaths(from.map?.scope.selected ?? [], to.map?.scope.selected ?? []);
  const affected = comparePaths(from.map?.scope.affected ?? [], to.map?.scope.affected ?? []);
  const contracts = compareEntities(from.map?.scope.contracts.map((entry2) => ({ id: entry2.id, fingerprint: `${entry2.sourceFingerprint}\0${canonicalize4(entry2.entries)}` })) ?? [], to.map?.scope.contracts.map((entry2) => ({ id: entry2.id, fingerprint: `${entry2.sourceFingerprint}\0${canonicalize4(entry2.entries)}` })) ?? []);
  const decisions = compareEntities(from.map?.scope.decisions.map((entry2) => ({ id: entry2.id, fingerprint: entry2.sourceFingerprint })) ?? [], to.map?.scope.decisions.map((entry2) => ({ id: entry2.id, fingerprint: entry2.sourceFingerprint })) ?? []);
  const testAssociations = compareEntities(from.testAssociations.map((entry2) => ({ id: entry2.path, fingerprint: entry2.sourceFingerprint })), to.testAssociations.map((entry2) => ({ id: entry2.path, fingerprint: entry2.sourceFingerprint })));
  const reviewers = compareEntities(reviewerEntities(from.map), reviewerEntities(to.map));
  const architectureFindings = compareEntities(findingEntities(from.map), findingEntities(to.map));
  const definitionChanged = canonicalize4(from.capability ?? null) !== canonicalize4(to.capability ?? null);
  const totalChanges = [selected, affected, contracts, decisions, testAssociations, reviewers, architectureFindings].reduce((total, diff) => total + diff.added.length + diff.removed.length + diff.modified.length, definitionChanged ? 1 : 0);
  return {
    capabilityHistoryVersion: 1,
    id,
    from,
    to,
    definitionChanged,
    selected,
    affected,
    contracts,
    decisions,
    testAssociations,
    reviewers,
    architectureFindings,
    summary: totalChanges === 0 ? `Capability ${id} has no evidenced change between ${from.commit} and ${to.commit}.` : `Capability ${id} has ${totalChanges.toLocaleString()} evidenced ${totalChanges === 1 ? "change" : "changes"} between ${from.commit} and ${to.commit}.`
  };
}
function capabilitySnapshot(historical, id, asOf) {
  const loaded = capabilityStoreFromRepo(historical.repo);
  if (!loaded) {
    return {
      requestedRef: historical.requestedRef,
      commit: historical.commit,
      state: "absent",
      testAssociations: [],
      reason: ".fixmap/capabilities.json is absent at this ref."
    };
  }
  const capability = loaded.store.capabilities.find((entry2) => entry2.id === id);
  if (!capability) {
    return {
      requestedRef: historical.requestedRef,
      commit: historical.commit,
      state: "absent",
      testAssociations: [],
      reason: `Capability ${id} is absent at this ref.`
    };
  }
  const map = buildCapabilityMap(historical.repo, { id, asOf });
  const scopedPaths = new Set([...map.scope.selected, ...map.scope.affected].map((entry2) => entry2.path));
  const testAssociations = historical.repo.files.filter((file) => file.isTest && scopedPaths.has(file.path) && file.contentFingerprint).map((file) => ({ path: file.path, sourceFingerprint: file.contentFingerprint })).sort((left, right) => left.path.localeCompare(right.path));
  return {
    requestedRef: historical.requestedRef,
    commit: historical.commit,
    state: "present",
    capability,
    map,
    testAssociations
  };
}
function comparePaths(previous, current2) {
  return compareMaps(new Map(previous.map((entry2) => [entry2.path, entry2.sourceFingerprint ?? "unknown"])), new Map(current2.map((entry2) => [entry2.path, entry2.sourceFingerprint ?? "unknown"])));
}
function compareEntities(previous, current2) {
  return compareMaps(new Map(previous.map((entry2) => [entry2.id, entry2.fingerprint])), new Map(current2.map((entry2) => [entry2.id, entry2.fingerprint])));
}
function compareMaps(previous, current2) {
  const keys = [.../* @__PURE__ */ new Set([...previous.keys(), ...current2.keys()])].sort();
  const result = { added: [], removed: [], modified: [], unchanged: [] };
  for (const key2 of keys) {
    if (!previous.has(key2))
      result.added.push(key2);
    else if (!current2.has(key2))
      result.removed.push(key2);
    else if (previous.get(key2) !== current2.get(key2))
      result.modified.push(key2);
    else
      result.unchanged.push(key2);
  }
  return result;
}
function reviewerEntities(map) {
  return (map?.scope.reviewers ?? []).map((reviewer) => ({
    id: reviewer.reviewer,
    fingerprint: canonicalize4({ paths: reviewer.paths, evidence: reviewer.evidence })
  }));
}
function findingEntities(map) {
  return (map?.scope.architectureFindings ?? []).map((finding) => ({
    id: `${finding.ruleId}:${finding.code}:${finding.paths.join("|")}`,
    fingerprint: canonicalize4(finding)
  }));
}
function canonicalize4(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalize4).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry2]) => entry2 !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key2, entry2]) => `${JSON.stringify(key2)}:${canonicalize4(entry2)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// packages/action/src/workspace-section.ts
var WORKSPACE_STATEMENT_LIMIT = 8;
function resolveWorkspaceInput(raw, repoRoot, jobRoot = repoRoot) {
  const value = raw?.trim();
  if (!value) return void 0;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new Error("workspace must be a path to a workspace config file in the job workspace, not a URL.");
  const path = resolve8(repoRoot, value);
  const offset = relative4(resolve8(jobRoot), path);
  if (offset === "" || offset.startsWith("..") || isAbsolute4(offset)) {
    throw new Error("workspace must name a config file inside the job workspace.");
  }
  return path;
}
async function buildWorkspaceSection(configPath, context) {
  const loaded = await (context.loadWorkspace ?? loadWorkspaceConfig)(configPath, { useCache: context.useCache });
  const repository = await findWorkspaceRepository(loaded, context.repoRoot);
  if (!repository) {
    throw new Error("workspace config does not list this checkout; add its path so FixMap can trace what depends on it.");
  }
  const statements = buildWorkspaceVerifyNarrative(loaded.map, repository, context.changedPaths);
  const lines = [
    "## Cross-repository impact (preview)",
    "",
    `Workspace ${markdownCode2(loaded.map.workspace)}, this checkout ${markdownCode2(repository)}, ${count2(loaded.map.repositories.length, "repository", "repositories")}, ${count2(loaded.map.dependencies.length, "cross-repository dependency", "cross-repository dependencies")}.`,
    ""
  ];
  if (context.changedPaths.length === 0) {
    lines.push("- No changed files to trace.");
  } else if (statements.length === 0) {
    lines.push("- No other workspace checkout consumes a package this pull request changes.");
  } else {
    for (const statement of statements.slice(0, WORKSPACE_STATEMENT_LIMIT)) {
      const source = statement.evidence.find((entry2) => entry2.kind === "cross-repository");
      lines.push(`- **${statement.classification}** ${safeText(statement.text)}${source?.path ? ` (evidence: ${markdownCode2(source.path)})` : ""}`);
    }
  }
  return `${lines.join("\n")}
`;
}
function safeText(text2) {
  return text2.split(/(@[A-Za-z0-9][\w.-]*\/[\w.-]+)/g).map((part, index) => index % 2 === 1 ? markdownCode2(part) : withoutMentions(part).replace(/[\\`*_[\]<>|]/g, (character) => `\\${character}`)).join("");
}
function count2(value, one, many) {
  return `${value.toLocaleString()} ${value === 1 ? one : many}`;
}
function markdownCode2(value) {
  const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const pad = /^[` ]|[` ]$/.test(value) ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

// packages/action/src/annotations.ts
import { realpath as realpath5, stat as stat4 } from "node:fs/promises";
import { isAbsolute as isAbsolute5, relative as relative5, resolve as resolve9 } from "node:path";
async function runAnnotationAction(input, repoRoot, allowWrite) {
  if (Buffer.byteLength(input, "utf8") > 32768) throw new Error("annotation-request exceeds 32 KiB.");
  let request;
  try {
    request = JSON.parse(input);
  } catch {
    throw new Error("annotation-request must be valid JSON.");
  }
  if (!record2(request) || !["list", "add", "remove"].includes(String(request.action))) throw new Error("annotation-request requires action: list, add, or remove.");
  const allowed = request.action === "list" ? ["action"] : request.action === "remove" ? ["action", "id"] : ["action", "scope", "note", "owner", "expiresAt"];
  if (Object.keys(request).some((key2) => !allowed.includes(key2))) throw new Error("annotation-request contains fields not allowed for this action.");
  if (request.action === "list") return `${JSON.stringify(await readAnnotationStore(repoRoot), null, 2)}
`;
  if (!allowWrite) throw new Error("Annotation mutation requires allow-annotation-write: true.");
  if (request.action === "remove") {
    if (typeof request.id !== "string") throw new Error("Annotation removal requires an exact id.");
    const id = request.id;
    await updateAnnotationStore(repoRoot, (store) => removeAnnotation(store, id));
    return `${JSON.stringify({ action: "remove", id, path: ".fixmap/annotations.json" })}
`;
  }
  if (!record2(request.scope) || typeof request.note !== "string" || request.owner !== void 0 && typeof request.owner !== "string" || request.expiresAt !== void 0 && typeof request.expiresAt !== "string") throw new Error("Invalid annotation scope, note, owner, or expiry.");
  const scopeFields = {
    file: ["kind", "path"],
    symbol: ["kind", "path", "symbol"],
    service: ["kind", "name"],
    contract: ["kind", "name", "path"]
  };
  const fields2 = typeof request.scope.kind === "string" && Object.hasOwn(scopeFields, request.scope.kind) ? scopeFields[request.scope.kind] : void 0;
  if (!fields2 || Object.keys(request.scope).some((key2) => !fields2.includes(key2))) {
    throw new Error("Annotation scope contains an unsupported kind or fields.");
  }
  const annotation = createAnnotation({
    scope: request.scope,
    note: request.note,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...request.owner !== void 0 ? { owner: request.owner } : {},
    ...request.expiresAt !== void 0 ? { expiresAt: request.expiresAt } : {}
  });
  if ("path" in annotation.scope && annotation.scope.path) {
    const root = await realpath5(repoRoot);
    const target = await realpath5(resolve9(root, annotation.scope.path));
    const inside = relative5(root, target);
    if (!inside || isAbsolute5(inside) || inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || !(await stat4(target)).isFile()) {
      throw new Error("Annotation target must be an existing file inside the checkout.");
    }
  }
  await updateAnnotationStore(repoRoot, (store) => addAnnotation(store, annotation));
  return `${JSON.stringify({ action: "add", id: annotation.id, path: ".fixmap/annotations.json" })}
`;
}
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/action/src/runner.ts
import { appendFileSync, readFileSync, statSync } from "node:fs";
import { resolve as resolve10 } from "node:path";

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
  constructor(message2, status, detail, rateLimited) {
    super(message2);
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

// packages/action/src/scope-sections.ts
import { basename } from "node:path";
var SECTION_PATH_LIMIT = 10;
var CAPABILITY_ID2 = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function splitPathListInput(raw) {
  if (!raw) return [];
  return raw.split(/[\r\n,]+/).map((entry2) => entry2.trim()).filter(Boolean);
}
function parseCapabilityInput(raw) {
  if (!raw) return void 0;
  const id = raw.trim().toLowerCase();
  if (!CAPABILITY_ID2.test(id)) {
    throw new Error("capability must be one id of at most 64 lowercase letters, numbers, dots, dashes, or underscores.");
  }
  return id;
}
function hasScopeSections(request) {
  return request.touch.length > 0 || request.add.length > 0 || request.capability !== void 0;
}
async function buildScopeSections(request, context) {
  const repo = await (context.scanRepo ?? scanRepo)({
    repoRoot: context.repoRoot,
    useCache: context.useCache,
    includeHistory: true
  });
  const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (scanError) throw new Error(scanError.message);
  const sections = [];
  const warnings = [];
  let changeScopeAffectedCount;
  if (request.touch.length > 0 || request.add.length > 0) {
    const anchors = [
      ...request.touch.map((path) => ({ operation: "touch", path })),
      ...request.add.map((path) => ({ operation: "add", path }))
    ];
    const scope = buildChangeScope(repo, {
      workspace: "local",
      repository: repositoryId(basename(context.repoRoot)),
      anchors,
      asOf: context.asOf
    });
    changeScopeAffectedCount = scope.affected.length;
    sections.push(renderChangeScopeSection(scope));
  }
  if (request.capability) {
    const result = await buildCapabilitySection(repo, request.capability, context);
    sections.push(result.markdown);
    warnings.push(...result.warnings);
  }
  return {
    markdown: sections.join("\n"),
    warnings,
    ...changeScopeAffectedCount !== void 0 ? { changeScopeAffectedCount } : {}
  };
}
function renderChangeScopeSection(scope, heading = "## Change scope (preview)") {
  const unresolved = scope.anchors.filter((anchor) => anchor.status === "unresolved");
  const lines = [
    heading,
    "",
    `- Selected: ${scope.selected.length.toLocaleString()}`,
    `- Affected: ${scope.affected.length.toLocaleString()}`,
    `- Unresolved anchors: ${unresolved.length.toLocaleString()}`,
    `- Truncated: ${scope.bounded.truncated ? `yes; ${scope.bounded.omittedNodes.toLocaleString()} nodes omitted at the ${scope.traversal.maxNodes.toLocaleString()}-node bound` : "no"}`,
    ""
  ];
  if (scope.affected.length > 0) {
    lines.push("Top affected paths:", "");
    lines.push(...scope.affected.slice(0, SECTION_PATH_LIMIT).map((entry2) => `- ${markdownCode3(entry2.path)} (distance ${entry2.distance})`));
    if (scope.affected.length > SECTION_PATH_LIMIT) {
      lines.push(`- \u2026and ${(scope.affected.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    }
    lines.push("");
  }
  if (unresolved.length > 0) {
    lines.push("Unresolved anchors:", "");
    lines.push(...unresolved.slice(0, SECTION_PATH_LIMIT).map((anchor) => `- ${anchor.operation} ${markdownCode3(anchor.path)}`));
    if (unresolved.length > SECTION_PATH_LIMIT) {
      lines.push(`- \u2026and ${(unresolved.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    }
    lines.push("");
  }
  lines.push(
    `Traversal: ${scope.traversal.direction}, depth ${scope.traversal.maxDepth}. Expanded from explicit anchors over repository import edges only; run \`fixmap change-scope\` for the complete evidence.`,
    ""
  );
  return lines.join("\n");
}
async function buildCapabilitySection(repo, id, context) {
  const heading = `## Capability (preview): ${markdownCode3(id)}`;
  let storePresent;
  try {
    storePresent = capabilityStoreFromRepo(repo) !== void 0;
  } catch (error) {
    const detail = message(error);
    return {
      markdown: [heading, "", `Capability map unavailable: ${detail}`, ""].join("\n"),
      warnings: [`FixMap could not read the capability store: ${detail}`]
    };
  }
  if (!storePresent) {
    const detail = ".fixmap/capabilities.json was not found in this checkout; create one with `fixmap capability create`.";
    return {
      markdown: [heading, "", `Capability map unavailable: ${detail}`, ""].join("\n"),
      warnings: [`FixMap capability ${id}: ${detail}`]
    };
  }
  const lines = [heading, ""];
  const warnings = [];
  let map;
  try {
    map = buildCapabilityMap(repo, { id, asOf: context.asOf });
  } catch (error) {
    const detail = message(error);
    lines.push(`Capability map unavailable: ${detail}`, "");
    warnings.push(`FixMap capability ${id}: ${detail}`);
  }
  if (map) {
    lines.push(
      `**${escapeMarkdown(map.capability.name)}**, defined in ${markdownCode3(map.source.path)} (${map.source.fingerprint}).`,
      "",
      renderChangeScopeSection(map.scope, "### Current map").trimEnd(),
      ""
    );
  }
  if (context.diffRefs) {
    try {
      const diff = await (context.compareCapabilityRefs ?? compareCapabilityRefs)({
        repoRoot: context.repoRoot,
        id,
        fromRef: context.diffRefs.baseRef,
        toRef: context.diffRefs.headRef,
        asOf: context.asOf
      });
      lines.push(renderCapabilityDiffSection(diff));
    } catch (error) {
      lines.push(
        "### Base vs head",
        "",
        `Diff unavailable: ${message(error)} Fetch the base ref (for example \`actions/checkout\` with \`fetch-depth: 0\`) to compare.`,
        ""
      );
    }
  }
  return { markdown: lines.join("\n"), warnings };
}
function renderCapabilityDiffSection(diff) {
  const lines = [
    "### Base vs head",
    "",
    diff.summary,
    "",
    `- Base ${markdownCode3(diff.from.requestedRef)}: ${diff.from.state}`,
    `- Head ${markdownCode3(diff.to.requestedRef)}: ${diff.to.state}`,
    `- Definition changed: ${diff.definitionChanged ? "yes" : "no"}`
  ];
  const categories2 = [
    ["Selected", diff.selected],
    ["Affected", diff.affected],
    ["Contracts", diff.contracts],
    ["Decisions", diff.decisions],
    ["Test associations", diff.testAssociations],
    ["Reviewers", diff.reviewers],
    ["Architecture findings", diff.architectureFindings]
  ];
  for (const [label, entry2] of categories2) {
    if (entry2.added.length + entry2.removed.length + entry2.modified.length === 0) continue;
    lines.push(`- ${label}: +${entry2.added.length} \u2212${entry2.removed.length} ~${entry2.modified.length}`);
  }
  const pathChanges = [
    ...diff.selected.added.map((path) => `added selected ${markdownCode3(path)}`),
    ...diff.selected.removed.map((path) => `removed selected ${markdownCode3(path)}`),
    ...diff.affected.added.map((path) => `added affected ${markdownCode3(path)}`),
    ...diff.affected.removed.map((path) => `removed affected ${markdownCode3(path)}`)
  ];
  if (pathChanges.length > 0) {
    lines.push("", "Path changes:", "", ...pathChanges.slice(0, SECTION_PATH_LIMIT).map((entry2) => `- ${entry2}`));
    if (pathChanges.length > SECTION_PATH_LIMIT) lines.push(`- \u2026and ${(pathChanges.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
  }
  lines.push(
    "",
    "Both sides were read from Git objects without a checkout. Run `fixmap capability diff` for the complete comparison.",
    ""
  );
  return lines.join("\n");
}
function repositoryId(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").slice(0, 64) || "repository";
}
function markdownCode3(value) {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const pad = /^[` ]|[` ]$/.test(value) ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}
function escapeMarkdown(value) {
  return value.replace(/[\\`*_[\]<>#|]/g, (character) => `\\${character}`);
}
function message(error) {
  const text2 = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
  const bounded = text2.length > 300 ? `${text2.slice(0, 299)}\u2026` : text2;
  return /[.…]$/.test(bounded) ? bounded : `${bounded}.`;
}

// packages/action/src/review-sections.ts
function hasReviewSections(request) {
  return request.contracts || request.reviewers || request.architectureDrift;
}
var REFS_NEEDED = "needs a pull request with both base and head refs. Fetch the base ref (for example `actions/checkout` with `fetch-depth: 0`) to compare.";
async function buildReviewSections(request, context) {
  const sections = [];
  const warnings = [];
  let breakingContractCount;
  if (request.contracts) {
    const heading = "## Contract changes (preview)";
    if (!context.diffRefs) {
      sections.push([heading, "", `Contract comparison ${REFS_NEEDED}`, ""].join("\n"));
      warnings.push(`FixMap contract comparison ${REFS_NEEDED}`);
    } else {
      try {
        const result = await (context.compareContractRefs ?? compareContractRefs)({
          repoRoot: context.repoRoot,
          fromRef: context.diffRefs.baseRef,
          toRef: context.diffRefs.headRef
        });
        breakingContractCount = result.comparison.changes.filter((change) => change.compatibility === "breaking").length;
        sections.push(renderContractSection(result));
      } catch (error) {
        sections.push([heading, "", `Contract comparison unavailable: ${message(error)} ${REFS_NEEDED}`, ""].join("\n"));
        warnings.push(`FixMap contract comparison unavailable: ${message(error)}`);
      }
    }
  }
  if (request.reviewers) {
    const heading = "## Suggested reviewers (preview)";
    try {
      const repo = await (context.scanRepo ?? scanRepo)({
        repoRoot: context.repoRoot,
        useCache: context.useCache,
        includeHistory: request.reviewersHistoryAuthors
      });
      const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      if (scanError) throw new Error(scanError.message);
      const result = routeReviewers(repo, {
        changedPaths: context.changedPaths,
        now: context.now,
        includeHistoryAuthors: request.reviewersHistoryAuthors
      });
      sections.push(renderReviewerSection(result));
    } catch (error) {
      const detail = withoutMentions(message(error));
      sections.push([heading, "", `Reviewer suggestions unavailable: ${detail}`, ""].join("\n"));
      warnings.push(`FixMap reviewer suggestions unavailable: ${detail}`);
    }
  }
  if (request.architectureDrift) {
    const heading = "## Architecture drift (preview)";
    if (!context.diffRefs) {
      sections.push([heading, "", `Architecture drift ${REFS_NEEDED}`, ""].join("\n"));
      warnings.push(`FixMap architecture drift ${REFS_NEEDED}`);
    } else {
      try {
        const result = await (context.compareArchitectureRefs ?? compareArchitectureRefs)({
          repoRoot: context.repoRoot,
          fromRef: context.diffRefs.baseRef,
          toRef: context.diffRefs.headRef,
          useCache: context.useCache
        });
        sections.push(renderArchitectureDriftSection(result));
      } catch (error) {
        sections.push([heading, "", `Architecture drift unavailable: ${message(error)} ${REFS_NEEDED}`, ""].join("\n"));
        warnings.push(`FixMap architecture drift unavailable: ${message(error)}`);
      }
    }
  }
  return {
    markdown: sections.join("\n"),
    warnings,
    ...breakingContractCount !== void 0 ? { breakingContractCount } : {}
  };
}
var COMPATIBILITY_ORDER = { breaking: 0, unknown: 1, compatible: 2 };
function renderContractSection(result) {
  const { changes } = result.comparison;
  const count3 = (compatibility) => changes.filter((change) => change.compatibility === compatibility).length;
  const lines = [
    "## Contract changes (preview)",
    "",
    // Reasons quote contract text, where a GraphQL directive such as `@deprecated` would mention someone.
    withoutMentions(result.comparison.summary),
    "",
    `- Breaking: ${count3("breaking").toLocaleString()}`,
    `- Unknown: ${count3("unknown").toLocaleString()}`,
    `- Compatible: ${count3("compatible").toLocaleString()}`,
    ""
  ];
  if (changes.length > 0) {
    const ordered = [...changes].sort((a, b) => COMPATIBILITY_ORDER[a.compatibility] - COMPATIBILITY_ORDER[b.compatibility] || a.path.localeCompare(b.path));
    lines.push("Top changes:", "");
    lines.push(...ordered.slice(0, SECTION_PATH_LIMIT).map((change) => `- ${change.compatibility} ${markdownCode3(change.path)} (${change.contractKind}): ${withoutMentions(change.reason)}`));
    if (changes.length > SECTION_PATH_LIMIT) lines.push(`- \u2026and ${(changes.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    lines.push("");
  }
  if (result.comparison.diagnostics.length > 0) {
    lines.push(`Contracts not compared: ${result.comparison.diagnostics.length.toLocaleString()}; run the CLI for details.`, "");
  }
  lines.push(
    `Base ${markdownCode3(result.from.requestedRef)} at ${markdownCode3(result.from.commit)}; head ${markdownCode3(result.to.requestedRef)} at ${markdownCode3(result.to.commit)}. Both sides were read from Git objects without a checkout. Breaking changes are advisory and never fail this step. Run \`fixmap contracts diff\` for the complete comparison.`,
    ""
  );
  return lines.join("\n");
}
var EVIDENCE_LABEL = {
  codeowners: "CODEOWNERS",
  annotation: "annotation",
  "architecture-policy": "architecture policy",
  "git-history": "commit history"
};
function renderReviewerSection(input) {
  const result = reviewRoutingWithoutMentions(input);
  const lines = [
    "## Suggested reviewers (preview)",
    "",
    "Suggestions only. FixMap does not request reviews or notify anyone, and a name is not evidence of identity, employment, or current availability.",
    ""
  ];
  if (result.changedPaths.length === 0) {
    lines.push("No changed paths, so there is nothing to route.", "");
  } else {
    const covered = new Set(result.suggestions.flatMap((suggestion) => suggestion.paths));
    const uncovered = result.changedPaths.filter((path) => !covered.has(path));
    lines.push(
      `- Changed paths routed: ${result.changedPaths.length.toLocaleString()}`,
      `- Suggested reviewers: ${result.suggestions.length.toLocaleString()}`,
      `- Paths without reviewer evidence: ${uncovered.length.toLocaleString()}`,
      ""
    );
    if (result.suggestions.length > 0) {
      for (const suggestion of result.suggestions.slice(0, SECTION_PATH_LIMIT)) {
        const sources = [...new Set(suggestion.evidence.map((entry2) => EVIDENCE_LABEL[entry2.kind]))].join(", ");
        const paths = suggestion.paths.slice(0, 3).map(markdownCode3).join(", ");
        const more = suggestion.paths.length > 3 ? ` and ${(suggestion.paths.length - 3).toLocaleString()} more` : "";
        lines.push(`- ${markdownCode3(suggestion.reviewer)} (${suggestion.confidence}; ${sources}): ${paths}${more}`);
      }
      if (result.suggestions.length > SECTION_PATH_LIMIT) {
        lines.push(`- \u2026and ${(result.suggestions.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
      }
      lines.push("");
    }
  }
  const warnings = result.diagnostics.filter((entry2) => entry2.severity === "warning");
  if (warnings.length > 0) {
    lines.push(...warnings.slice(0, SECTION_PATH_LIMIT).map((entry2) => `- warning (${markdownCode3(entry2.source)}): ${entry2.message}`), "");
  }
  lines.push("Run `fixmap reviewers` for the per-path evidence.", "");
  return lines.join("\n");
}
function renderArchitectureDriftSection(result) {
  const { drift } = result;
  const edge = (entry2) => `${markdownCode3(entry2.from)} -> ${markdownCode3(entry2.to)}`;
  const lines = [
    "## Architecture drift (preview)",
    "",
    `- Added edges: ${drift.addedEdges.length.toLocaleString()}`,
    `- Removed edges: ${drift.removedEdges.length.toLocaleString()}`,
    `- New cycles: ${drift.newCycles.length.toLocaleString()} (resolved: ${drift.resolvedCycles.length.toLocaleString()})`,
    `- New policy violations: ${drift.newBoundaryViolations.length.toLocaleString()} (resolved: ${drift.resolvedBoundaryViolations.length.toLocaleString()})`,
    `- Decision disagreements: ${result.decisionDisagreements.length.toLocaleString()} (introduced here: ${result.decisionDisagreements.filter((entry2) => entry2.introduced).length.toLocaleString()})`,
    ""
  ];
  const list = (title, values, render) => {
    if (values.length === 0) return;
    lines.push(`${title}:`, "", ...values.slice(0, SECTION_PATH_LIMIT).map((value) => `- ${render(value)}`));
    if (values.length > SECTION_PATH_LIMIT) lines.push(`- \u2026and ${(values.length - SECTION_PATH_LIMIT).toLocaleString()} more`);
    lines.push("");
  };
  list("New cycles", drift.newCycles, (cycle) => cycle.map(markdownCode3).join(" -> "));
  list("New policy violations", drift.newBoundaryViolations, (entry2) => `${markdownCode3(entry2.ruleId)}: ${edge(entry2)}`);
  list("Decision disagreements", result.decisionDisagreements, (entry2) => `${markdownCode3(entry2.decisionPath)} denies ${markdownCode3(entry2.rule.from)} -> ${markdownCode3(entry2.rule.deny)}; ${edge(entry2.edge)} ${entry2.introduced ? "was introduced in this range" : "already existed at the base"}`);
  list("Added edges", drift.addedEdges, edge);
  list("Removed edges", drift.removedEdges, edge);
  lines.push(
    `Base ${markdownCode3(result.from.requestedRef)} at ${markdownCode3(result.from.commit)}; head ${markdownCode3(result.to.requestedRef)} at ${markdownCode3(result.to.commit)}. Both sides were read from Git objects without a checkout. Run \`fixmap history\` for the complete comparison.`,
    ""
  );
  return lines.join("\n");
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
var SCOPE_INPUTS = ["change-scope-touch", "change-scope-add", "capability", "workspace"];
function readReviewSectionRequest(env) {
  const historyAuthors = readInput("reviewers-history-authors", env);
  const request = {
    contracts: parseBooleanInput("contracts", readInput("contracts", env)),
    reviewers: parseBooleanInput("reviewers", readInput("reviewers", env)),
    reviewersHistoryAuthors: historyAuthors === void 0 || parseBooleanInput("reviewers-history-authors", historyAuthors),
    architectureDrift: parseBooleanInput("architecture-drift", readInput("architecture-drift", env))
  };
  const used = [
    request.contracts ? "contracts" : "",
    request.reviewers ? "reviewers" : "",
    request.reviewersHistoryAuthors ? "" : "reviewers-history-authors",
    request.architectureDrift ? "architecture-drift" : ""
  ].filter(Boolean);
  return { ...request, used };
}
async function runAction(env = process.env, dependencies = {}) {
  const appendFile = dependencies.appendFile ?? ((path, contents) => appendFileSync(path, contents));
  const readFile7 = dependencies.readFile ?? ((path) => readFileSync(path, "utf8"));
  const stdout = dependencies.stdout ?? ((text2) => process.stdout.write(text2));
  if (readInput("mode", env)?.toLowerCase() === "annotate") {
    const incompatible = ["issue", "diff", "base", "head", "limit", "exclude", "report-path", "comment-author", ...SCOPE_INPUTS].filter((name) => readInput(name, env));
    incompatible.push(...readReviewSectionRequest(env).used);
    for (const name of ["working-tree", "include-untracked", "no-cache"]) {
      if (parseBooleanInput(name, readInput(name, env))) incompatible.push(name);
    }
    if (parseFailOn(readInput("fail-on", env)) !== "error") incompatible.push("fail-on");
    if (incompatible.length) throw new Error(`annotate mode does not accept analysis inputs: ${incompatible.join(", ")}.`);
    const request = readInput("annotation-request", env);
    if (!request) throw new Error("annotate mode requires annotation-request.");
    const allowWrite = parseBooleanInput("allow-annotation-write", readInput("allow-annotation-write", env));
    const output2 = await runAnnotationAction(request, (dependencies.cwd ?? process.cwd)(), allowWrite);
    if (Buffer.byteLength(output2, "utf8") > ACTION_OUTPUT_REPORT_LIMIT_BYTES) throw new Error("Annotation listing exceeds the Action output limit; read the local store directly.");
    stdout(output2);
    if (env.GITHUB_STEP_SUMMARY) appendBoundedStepSummary(env.GITHUB_STEP_SUMMARY, withJsonDetails("# FixMap annotations\n\nLocal checkout operation only; no commit, push, or GitHub comment was made.", output2), dependencies, appendFile, stdout);
    if (env.GITHUB_OUTPUT) {
      const delimiter = `fixmap_${(dependencies.uuid ?? randomUUID4)().replace(/-/g, "")}`;
      appendFile(env.GITHUB_OUTPUT, `report<<${delimiter}
${output2}
${delimiter}
`);
    }
    return;
  }
  if (readInput("annotation-request", env) || readInput("allow-annotation-write", env) === "true") throw new Error("Annotation inputs require mode: annotate.");
  const event = readEvent(env.GITHUB_EVENT_PATH, readFile7);
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
  const reviewRequest = readReviewSectionRequest(env);
  if (!reviewRequest.reviewersHistoryAuthors && !reviewRequest.reviewers) {
    throw new Error("reviewers-history-authors: false requires reviewers: true.");
  }
  const diffRefs = event?.pull_request?.number && baseRef && headRef ? { baseRef, headRef } : void 0;
  if (mode === "verify") {
    const planOnly = [
      readInput("limit", env) ? "limit" : "",
      readInput("exclude", env) ? "exclude" : "",
      readInput("issue", env) ? "issue" : "",
      ...SCOPE_INPUTS.filter((name) => readInput(name, env)),
      ...reviewRequest.used.filter((name) => name !== "contracts")
    ].filter(Boolean);
    if (planOnly.length > 0) {
      throw new Error(
        `FixMap verify mode does not use plan-only input${planOnly.length === 1 ? "" : "s"}: ${planOnly.join(", ")}. Remove them, or set mode: plan.`
      );
    }
    return runVerifyMode({ env, dependencies, readFile: readFile7, appendFile, stdout, format, failOn, diffSpec, baseRef, headRef, workingTree, includeUntracked, noCache, contracts: reviewRequest.contracts, diffRefs });
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
  const scopeRequest = {
    touch: splitPathListInput(readInput("change-scope-touch", env)),
    add: splitPathListInput(readInput("change-scope-add", env)),
    capability: parseCapabilityInput(readInput("capability", env))
  };
  if (!issue && !diffSpec && !baseRef && !workingTree) {
    throw new Error("FixMap needs a pull_request event, an issue input, or a diff/base input to build a useful report.");
  }
  const repoRoot = (dependencies.cwd ?? process.cwd)();
  const report = await (dependencies.buildReport ?? buildFixMapReport)({
    repoRoot,
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
  const now = (dependencies.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();
  const scopeSections = hasScopeSections(scopeRequest) ? await buildScopeSections(scopeRequest, {
    repoRoot,
    useCache: !noCache,
    asOf: now,
    ...diffRefs ? { diffRefs } : {},
    ...dependencies.scanRepo ? { scanRepo: dependencies.scanRepo } : {},
    ...dependencies.compareCapabilityRefs ? { compareCapabilityRefs: dependencies.compareCapabilityRefs } : {}
  }) : void 0;
  const workspaceConfig = resolveWorkspaceInput(readInput("workspace", env), repoRoot, env.GITHUB_WORKSPACE || repoRoot);
  const workspaceSection = workspaceConfig ? await buildWorkspaceSection(workspaceConfig, {
    repoRoot,
    useCache: !noCache,
    changedPaths: report.changedFiles,
    ...dependencies.loadWorkspace ? { loadWorkspace: dependencies.loadWorkspace } : {}
  }) : void 0;
  const reviewSections = hasReviewSections(reviewRequest) ? await buildReviewSections(reviewRequest, {
    repoRoot,
    useCache: !noCache,
    now,
    changedPaths: report.changedFiles.length > 0 ? report.changedFiles : report.contextFiles.map((file) => file.path),
    ...diffRefs ? { diffRefs } : {},
    ...reviewSectionDependencies(dependencies)
  }) : void 0;
  for (const warning of [...scopeSections?.warnings ?? [], ...reviewSections?.warnings ?? []]) stdout(`::warning::${warning}
`);
  const planMarkdown = renderMarkdownReport(report);
  const extraMarkdown = [scopeSections?.markdown, workspaceSection, reviewSections?.markdown].filter(Boolean).join("\n");
  const markdown = extraMarkdown ? `${planMarkdown.trimEnd()}

${extraMarkdown}` : planMarkdown;
  const output = format === "json" ? renderJsonReport(report) : markdown;
  stdout(output);
  if (env.GITHUB_STEP_SUMMARY) {
    appendBoundedStepSummary(env.GITHUB_STEP_SUMMARY, format === "json" ? withJsonDetails(markdown, output) : markdown, dependencies, appendFile, stdout);
  }
  if (env.GITHUB_OUTPUT) {
    appendFile(env.GITHUB_OUTPUT, renderActionOutputs(output, report, dependencies.uuid ?? randomUUID4) + (scopeSections?.changeScopeAffectedCount !== void 0 ? `change-scope-affected-count=${scopeSections.changeScopeAffectedCount}
` : "") + breakingContractOutput(reviewSections));
  }
  const token = readInput("github-token", env) || env.GITHUB_TOKEN;
  const commentAuthor = readInput("comment-author", env);
  if (token) {
    try {
      const comment = format === "json" ? `\`\`\`json
${output.trimEnd()}
\`\`\`
${extraMarkdown ? `
${extraMarkdown}` : ""}` : markdown;
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
function reviewSectionDependencies(dependencies) {
  return {
    ...dependencies.scanRepo ? { scanRepo: dependencies.scanRepo } : {},
    ...dependencies.compareContractRefs ? { compareContractRefs: dependencies.compareContractRefs } : {},
    ...dependencies.compareArchitectureRefs ? { compareArchitectureRefs: dependencies.compareArchitectureRefs } : {}
  };
}
function breakingContractOutput(sections) {
  return sections?.breakingContractCount !== void 0 ? `breaking-contract-count=${sections.breakingContractCount}
` : "";
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
    internalExclude: [resolve10(repoRoot, reportPath)]
  });
  const diffFailure = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
  if (diffFailure) {
    throw new Error(`${diffFailure.message} Verification needs a resolvable diff.`);
  }
  const baseline = await contractBaselineOrError(repo, {
    repoRoot,
    diffSpec: context.diffSpec,
    baseRef: context.baseRef,
    headRef: context.headRef,
    workingTree: context.workingTree
  });
  const result = verifyPlan(report, repo, { ...baseline.comparison ? { contractComparison: baseline.comparison } : {}, ...baseline.error ? { contractBaselineError: baseline.error } : {} });
  const contractSections = context.contracts ? await buildReviewSections(
    { contracts: true, reviewers: false, reviewersHistoryAuthors: true, architectureDrift: false },
    {
      repoRoot,
      useCache: !context.noCache,
      now: (context.dependencies.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))(),
      changedPaths: [],
      ...context.diffRefs ? { diffRefs: context.diffRefs } : {},
      ...reviewSectionDependencies(context.dependencies)
    }
  ) : void 0;
  for (const warning of contractSections?.warnings ?? []) context.stdout(`::warning::${warning}
`);
  const verifyMarkdown = renderVerifyMarkdown(result);
  const markdown = contractSections ? `${verifyMarkdown.trimEnd()}

${contractSections.markdown}` : verifyMarkdown;
  const output = context.format === "json" ? `${JSON.stringify(result, null, 2)}
` : markdown;
  context.stdout(output);
  if (context.env.GITHUB_STEP_SUMMARY) {
    appendBoundedStepSummary(context.env.GITHUB_STEP_SUMMARY, markdown, context.dependencies, context.appendFile, context.stdout);
  }
  if (context.env.GITHUB_OUTPUT) {
    context.appendFile(
      context.env.GITHUB_OUTPUT,
      renderVerifyOutputs(output, result, context.dependencies.uuid ?? randomUUID4) + breakingContractOutput(contractSections)
    );
  }
  if (result.findings.some(
    (finding) => finding.severity === "error" || context.failOn === "warning" && finding.severity === "warning"
  )) {
    const errors = result.findings.filter((finding) => finding.severity === "error");
    throw new Error(
      errors.length === 0 ? "FixMap verification found findings at or above the configured warning threshold." : errors.length === 1 && errors[0].code === "edit-in-generated-location" ? "FixMap verification found an edit in a generated or retired location, which the next build discards." : `FixMap verification found ${errors.length} error finding${errors.length === 1 ? "" : "s"}: ${[...new Set(errors.map((finding) => finding.code))].join(", ")}.`
    );
  }
}
function renderVerifyOutputs(reportText, result, uuid = randomUUID4) {
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
  const parsed2 = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(parsed2) || parsed2 < 1 || parsed2 > 20) throw new Error("limit must be a whole number from 1 to 20.");
  return parsed2;
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
function renderActionOutputs(reportText, report, uuid = randomUUID4) {
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
function trimToBoundary(text2) {
  const lastBreak = text2.lastIndexOf("\n\n");
  const trimmed = lastBreak > text2.length / 2 ? text2.slice(0, lastBreak) : text2;
  const fences = (trimmed.match(/^```/gm) ?? []).length;
  return fences % 2 === 0 ? trimmed : `${trimmed}
\`\`\``;
}
function splitExcludeInput(raw) {
  const patterns2 = [];
  let current2 = "";
  let depth5 = 0;
  for (const character of raw) {
    if (character === "{") depth5 += 1;
    else if (character === "}") depth5 = Math.max(0, depth5 - 1);
    if (character === "\n" || character === "\r" || character === "," && depth5 === 0) {
      patterns2.push(current2);
      current2 = "";
      continue;
    }
    current2 += character;
  }
  patterns2.push(current2);
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
function readEvent(eventPath, readFile7) {
  if (!eventPath) {
    return void 0;
  }
  try {
    return JSON.parse(readFile7(eventPath));
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
