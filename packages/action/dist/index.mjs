import { createRequire as __fixmapCreateRequire } from 'module'; const require = __fixmapCreateRequire(import.meta.url);

// packages/action/src/runner.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

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
function buildPathExcluder(patterns) {
  const cleaned = [...new Set(patterns.map((pattern) => normalizeSeparators(pattern.trim())).filter((pattern) => pattern.length > 0 && !COMMENT.test(pattern)))];
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

// packages/core/dist/signals.js
var TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;
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
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "codebase",
  "could",
  "debugger",
  "default",
  "delete",
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
  "get",
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
  "name",
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
  "package",
  "packages",
  "private",
  "quality",
  "protected",
  "public",
  "readonly",
  "return",
  "run",
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
  "type",
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
var FILE_MENTION_PATTERN = new RegExp(`[A-Za-z0-9_@$][A-Za-z0-9_.$/\\\\-]{0,${MAX_FILE_MENTION_LENGTH}}\\.(?:[cm]?[jt]sx?|json|ya?ml|mdx?|css|scss|less|html|py|rb|rs|go|java|kt|c|cc|cpp|h|hpp|d\\.ts)\\b`, "g");
var MEMBER_MENTION_PATTERN = /\b(?:window|globalThis|process|request|response|req|res|this)\.([$A-Za-z_][$A-Za-z0-9_$]*)\b/g;
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
var IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]{4,}/g;
var MAX_EXACT_FRAGMENTS = 8;
var MAX_IDENTIFIERS = 24;
var TRAILING_E_VERB_STEMS = /* @__PURE__ */ new Set([
  "bas",
  "cach",
  "chang",
  "cod",
  "contribut",
  "creat",
  "dat",
  "fil",
  "improv",
  "invoic",
  "mak",
  "pars",
  "remov",
  "resolv",
  "rout",
  "siz",
  "tim",
  "updat"
]);
function extractTaskSignals(input) {
  const prepared = prepareChecklistText(input.issueText ?? "");
  const issueText = prepared.text;
  const taskText = [issueText, extractDiffContentLines(input.diffText ?? "")].join("\n");
  const tokens = tokenizeText(taskText);
  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? []),
    fileMentions: extractFileMentions(issueText),
    memberMentions: extractMemberMentions(issueText),
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
    if (!/^[$A-Za-z_][$A-Za-z0-9_]*$/.test(fragment.trim())) {
      continue;
    }
    if (!isDistinctiveIdentifier(fragment) && fragment.length < 8) {
      continue;
    }
    for (const match of fragment.matchAll(IDENTIFIER_PATTERN)) {
      addIdentifier(identifiers, match[0]);
    }
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
  return /[0-9_$]/.test(identifier) || /[a-z][A-Z]/.test(identifier);
}
function isDistinctiveFragment(fragment) {
  if (fragment.length < 6 || fragment.length > 96 || /\s/.test(fragment)) {
    return false;
  }
  const punctuationCount = [...fragment].filter((character) => /[^A-Za-z0-9_$]/.test(character)).length;
  return punctuationCount >= 2 && /[A-Za-z0-9]/.test(fragment);
}
function scanQuotedFragments(text) {
  const fragments = [];
  for (const line of text.split(/\r?\n/)) {
    let cursor = 0;
    while (cursor < line.length) {
      const delimiter = line[cursor];
      if (delimiter !== '"' && delimiter !== "'" && delimiter !== "`") {
        cursor += 1;
        continue;
      }
      let end = cursor + 1;
      while (end < line.length) {
        if (line[end] === delimiter && !isEscaped(line, end)) {
          break;
        }
        end += 1;
      }
      fragments.push({ delimiter, value: line.slice(cursor + 1, end) });
      cursor = end < line.length ? end + 1 : line.length;
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
  return diffText.split(/\r?\n/).filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")).join("\n");
}
function tokenizeText(text) {
  return new Set(text.replace(/\bhttp\s*\/\s*([123])\b/gi, "http h$1").replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(TOKEN_SPLIT).map((token) => token.trim()).filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token)).map((token) => normalizeToken(token)).filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token)));
}
var MAX_SEARCHABLE_TOKEN_LENGTH = 64;
function isSearchableToken(token) {
  if (token.length > MAX_SEARCHABLE_TOKEN_LENGTH) {
    return false;
  }
  return token.length >= 3 || /^[a-z]\d$/i.test(token);
}
function normalizeToken(token) {
  if (token === "contributor" || token === "contributors")
    return "contribute";
  if (token.length > 5 && token.endsWith("ies"))
    return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing"))
    return normalizeVerbStem(token.slice(0, -3));
  if (token.length > 4 && token.endsWith("ed"))
    return normalizeVerbStem(token.slice(0, -2));
  if (token.length > 4 && /(?:sses|shes|ches|xes|zes)$/.test(token))
    return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}
function normalizeVerbStem(stem) {
  const deduplicated = /([a-z])\1$/.test(stem) && !stem.endsWith("ss") ? stem.slice(0, -1) : stem;
  return TRAILING_E_VERB_STEMS.has(deduplicated) ? `${deduplicated}e` : deduplicated;
}
function tokenizePath(path) {
  return tokenizeText(path);
}

// packages/core/dist/grounding.js
var MAX_IDENTIFIER_MATCHED_FILES = 5;
var VAGUE_TASK_PATTERN = /\b(?:improve|better|clean\s+up|cleanup|refactor|developer\s+experience|dx|general|overall|errors?|reliability|performance|codebase|quality|make|things?|please)\b/i;
var VAGUE_TASK_TERMS = new RegExp(VAGUE_TASK_PATTERN.source, "gi");
function analyzeTaskGrounding(repo, input) {
  const issueText = input.issueText ?? "";
  const signals = extractTaskSignals({
    issueText,
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const anchorIdentifiers = [...signals.identifiers].filter((identifier) => isAnchorIdentifier(identifier, issueText));
  const identifiers = anchorIdentifiers.map((identifier) => groundIdentifier(repo, identifier));
  const unresolvedIdentifiers = identifiers.filter((entry) => entry.status === "not-found").map((entry) => entry.identifier);
  const partiallyResolvedIdentifiers = identifiers.filter((entry) => entry.status === "partial-definition").map((entry) => entry.identifier);
  const unverifiedIdentifiers = identifiers.filter((entry) => entry.status === "unverified").map((entry) => entry.identifier);
  const resolvedIdentifierCount = identifiers.filter((entry) => entry.status === "exact-definition" || entry.status === "exact-text").length;
  const hasMatchedFileMention = [...signals.fileMentions].some((mention) => repo.files.some((file) => pathMatchesMention(file.path, mention)));
  const hasDirectAnchor = repo.changedFiles.length > 0 || hasMatchedFileMention || resolvedIdentifierCount > 0 || partiallyResolvedIdentifiers.length > 0;
  const issueTokens = tokenizeText(issueText);
  const singleTokenHasRepoMatch = issueTokens.size === 1 && repo.files.some((file) => {
    const token = [...issueTokens][0];
    return tokenizeText(file.path).has(token) || tokenizeText(file.textSample).has(token);
  });
  const singleUnmatchedToken = issueTokens.size === 1 && !singleTokenHasRepoMatch;
  const vague = !hasDirectAnchor && (isVagueTask(issueText) || singleUnmatchedToken);
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
  const clustered = topScore !== null && thirdScore !== void 0 && topScore - thirdScore <= 2;
  return { topScore, runnerUpScore, topGap, clustered };
}
function buildNextAction(grounding, ranking, contextFiles, hasRoutedTests = true) {
  if (grounding.unresolvedIdentifiers.length > 0) {
    return "Verify or correct the unresolved identifiers before editing ranked files.";
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    return "Inspect the content-unread diagnostics and make those source files readable before trusting identifier-based recommendations.";
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
function groundIdentifier(repo, identifier) {
  const definitionPattern = new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\\s+${escapeRegExp(identifier)}\\b`);
  const exactPattern = new RegExp(`(^|[^$A-Za-z0-9_])${escapeRegExp(identifier)}(?=$|[^$A-Za-z0-9_])`);
  const definitionFiles = repo.files.filter((file) => definitionPattern.test(file.textSample)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  if (definitionFiles.length > 0) {
    return {
      identifier,
      status: "exact-definition",
      matchedFiles: definitionFiles
    };
  }
  const textFiles = repo.files.filter((file) => exactPattern.test(file.textSample)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
  return textFiles.length > 0 ? { identifier, status: "exact-text", matchedFiles: textFiles } : groundPartialOrUnverifiedIdentifier(repo, identifier);
}
function groundPartialOrUnverifiedIdentifier(repo, identifier) {
  const identifierParts = tokenizeText(identifier);
  const partialFiles = repo.files.filter((file) => hasDefinitionContainingTokens(file.textSample, identifierParts)).map((file) => file.path).slice(0, MAX_IDENTIFIER_MATCHED_FILES);
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
function hasDefinitionContainingTokens(text, expectedTokens) {
  if (expectedTokens.size < 2) {
    return false;
  }
  const definitionPattern = /\b(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\s+([$A-Za-z_][$A-Za-z0-9_]*)\b/g;
  for (const match of text.matchAll(definitionPattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const candidateTokens = tokenizeText(name);
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
  if (/^[a-z][A-Za-z0-9_$]*[A-Z]/.test(identifier)) {
    return true;
  }
  return [...identifier].filter((character) => /[A-Z]/.test(character)).length >= 3;
}
var MAX_RESIDUAL_TOKENS_FOR_VAGUE = 3;
function isVagueTask(issueText) {
  if (issueText.trim().length === 0 || !VAGUE_TASK_PATTERN.test(issueText)) {
    return false;
  }
  const residual = tokenizeText(issueText.replace(VAGUE_TASK_TERMS, " "));
  return residual.size <= MAX_RESIDUAL_TOKENS_FOR_VAGUE;
}
function removeIdentifiers(text, identifiers) {
  return identifiers.reduce((current, identifier) => current.replace(new RegExp(escapeRegExp(identifier), "g"), " "), text);
}
function pathMatchesMention(path, mention) {
  return path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  "package.json": "node"
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
  ".cjs": "node"
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
    const language = ROOT_MANIFESTS[file.path.toLowerCase()];
    if (language && !found.has(language)) {
      found.set(language, file.path);
    }
  }
  return found;
}
function nearestManifest(files, language) {
  const candidates = files.filter((file) => {
    const name = file.path.split("/").pop()?.toLowerCase() ?? "";
    return ROOT_MANIFESTS[name] === language;
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
    return packageDir ? {
      command: `cargo test --manifest-path ${packageDir}/Cargo.toml`,
      reason: `nearest crate (${packageDir}) declared by Cargo.toml`
    } : { command: "cargo test", reason: "Cargo.toml at the repository root" };
  }
  return void 0;
}
function suggestedRunner(language, files) {
  if (language === "python") {
    const names = new Set(files.map((file) => file.path.split("/").pop()?.toLowerCase() ?? ""));
    if (names.has("tox.ini")) {
      return "tox";
    }
    if (names.has("pytest.ini") || names.has("pyproject.toml") || names.has("setup.cfg")) {
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
  return void 0;
}

// packages/core/dist/import-graph.js
var JS_EXTENSIONS = /* @__PURE__ */ new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"]);
var RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];
var COMPILED_TO_SOURCE = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
var SPECIFIER_PATTERNS = [
  /\bimport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
  /\bimport\s*["']([^"'\n]+)["']/g,
  /\bexport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
];
var MAX_GRAPH_FILES = 5e3;
var MAX_EDGES_PER_FILE = 200;
function buildImportGraph(files) {
  const parseable = files.filter((file) => JS_EXTENSIONS.has(file.extension) && file.textSample.length > 0).slice(0, MAX_GRAPH_FILES);
  const repoPaths = new Set(files.map((file) => file.path));
  const imports = /* @__PURE__ */ new Map();
  const importedBy = /* @__PURE__ */ new Map();
  for (const file of parseable) {
    let edges = 0;
    for (const specifier of extractSpecifiers(file.textSample)) {
      if (edges >= MAX_EDGES_PER_FILE) {
        break;
      }
      const target = resolveSpecifier(file.path, specifier, repoPaths);
      if (!target || target === file.path) {
        continue;
      }
      addEdge(imports, file.path, target);
      addEdge(importedBy, target, file.path);
      edges += 1;
    }
  }
  return { imports, importedBy };
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
function extractSpecifiers(textSample) {
  const specifiers = /* @__PURE__ */ new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of textSample.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier && specifier.startsWith(".")) {
        specifiers.add(specifier);
      }
    }
  }
  return specifiers;
}
function resolveSpecifier(fromPath, specifier, repoPaths) {
  const baseDir = fromPath.split("/").slice(0, -1).join("/");
  const joined = normalizeSegments(baseDir ? `${baseDir}/${specifier}` : specifier);
  if (joined === void 0 || joined === "") {
    return void 0;
  }
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

// packages/core/dist/paths.js
var ALWAYS_IGNORED_DIRS = /* @__PURE__ */ new Set([".cache", ".git", ".venv", "node_modules"]);
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
  /[-_ ]copy(?:\s*\(\d+\))?\.[^.]+$/i,
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
  return path.replace(/\.[^./]+$/, "").split("/").filter((segment) => {
    const normalized = segment.toLowerCase();
    return !GENERATED_DIRS.has(normalized) && !SOURCE_ROOT_DIRS.has(normalized);
  }).join("/");
}
function isBackupPath(path) {
  const inBackupDirectory = directorySegments(path).some((segment) => segmentWords(segment).some((word) => BACKUP_SEGMENT_WORDS.has(word)));
  if (inBackupDirectory) {
    return true;
  }
  const fileName = path.split("/").pop() ?? "";
  return BACKUP_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
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
var LOCKFILES = /* @__PURE__ */ new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]);
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
var PRESENTATION_CODE_PENALTY = 8;
var TYPE_DECLARATION_PENALTY = 4;
var BACKUP_COPY_PENALTY = 10;
var BUNDLED_OUTPUT_PENALTY = 12;
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
var EXPLICIT_PATH_BOOST = 40;
var EXACT_LITERAL_BOOST = 8;
var MEMBER_MENTION_BOOST = 8;
var WIDESPREAD_TOKEN_SHARE = 0.85;
var DEFINITION_IDENTIFIER_BOOST = 24;
var DEFINITION_LITERAL_BOOST = 8;
var MAX_DEFINITION_IDENTIFIERS = 2;
var TASK_MATCHED_DEFINITION_BOOST = 4;
var HIGH_CONFIDENCE_MARGIN = 2;
var REPORT_SCORE_CUTOFF = 4;
var DEFAULT_CONTEXT_FILE_LIMIT = 8;
function rankContextFiles(repo, input, limit = DEFAULT_CONTEXT_FILE_LIMIT, minScore = REPORT_SCORE_CUTOFF) {
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
  const mentionedPaths = matchMentionedPaths(signals.fileMentions, repo.files.map((file) => file.path));
  const taskTargetsEvaluation = hasAny(taskTokens, ["benchmark", "benchmarks", "evaluation", "evaluate"]);
  const scannable = repo.files.filter((file) => !exclude.excludes(file.path) && (mentionedPaths.has(file.path) || file.isSource && !file.isTest && !LOCKFILES.has(file.path.split("/").pop() ?? "") && (!file.path.startsWith("benchmarks/") || taskTargetsEvaluation)));
  const maintainedStems = new Set(scannable.filter((file) => !isGeneratedPath(file.path) && !isBackupPath(file.path)).map((file) => moduleStem(file.path)));
  const candidates = scannable.filter((file) => !isRecordedEvaluationOutput(file.path) && (mentionedPaths.has(file.path) || signals.changedFiles.has(file.path) || !isGeneratedPath(file.path) || !maintainedStems.has(moduleStem(file.path))));
  const contentTokensByPath = new Map(candidates.map((file) => [file.path, tokenizeFileContent(file.textSample)]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const allTaskTermsAreWidespread = taskTokens.size > 0 && [...taskTokens].every((token) => commonTokens.has(token));
  const definitionSignals = buildDefinitionSignals(signals.identifiers);
  const taskText = [input.issueText ?? "", input.diffText ?? ""].join("\n");
  const taskTargetsDocumentation = targetsDocumentation(taskText);
  const taskTargetsConfiguration = hasAny(taskTokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);
  const taskTargetsDeployment = hasAny(taskTokens, DEPLOYMENT_TERMS);
  const taskTargetsExamples = /\b(?:demos?|examples?|samples?)\b/i.test(taskText.replace(/\bfor example\b/gi, ""));
  const taskTargetsPresentation = hasAny(taskTokens, [
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
  ]);
  const taskTargetsTypeDeclarations = /\b(?:typescript|types?|type definitions?|declarations?|typings?|\.d\.(?:ts|mts|cts))\b/i.test(taskText);
  const scored = candidates.map((file) => {
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
    }
    const contentTokens = contentTokensByPath.get(file.path) ?? /* @__PURE__ */ new Set();
    const contentOverlap = [...contentTokens].filter((token) => taskTokens.has(token) && (allTaskTermsAreWidespread || !commonTokens.has(token)));
    if (contentOverlap.length > 0) {
      score += Math.min(contentOverlap.length, 8) * 2;
      reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
    }
    const regexTokenOverlap = findRegexTokenOverlap(file.textSample, taskTokens);
    if (regexTokenOverlap.length > 0) {
      score += Math.min(regexTokenOverlap.length, 2) * 12;
      reasons.push(`regex literal matches task tokens: ${regexTokenOverlap.join(", ")}`);
    }
    const matchedMembers = [...signals.memberMentions].filter((member) => hasExactIdentifier(file.textSample, member)).slice(0, 3);
    if (matchedMembers.length > 0) {
      score += matchedMembers.length * MEMBER_MENTION_BOOST;
      reasons.push(`contains task member names: ${matchedMembers.join(", ")}`);
    }
    const exactLiteral = signals.exactFragments.filter((fragment) => file.textSample.includes(fragment)).sort((a, b) => countOccurrences(taskText, b) - countOccurrences(taskText, a) || b.length - a.length)[0];
    if (exactLiteral) {
      score += EXACT_LITERAL_BOOST * Math.min(3, countOccurrences(taskText, exactLiteral));
      reasons.push(`contains exact task literal: ${previewFragment(exactLiteral)}`);
    }
    const definedIdentifiers = (file.kind === "documentation" ? [] : findDefinedIdentifiers(file.textSample, definitionSignals)).slice(0, MAX_DEFINITION_IDENTIFIERS);
    if (definedIdentifiers.length > 0) {
      score += definedIdentifiers.length * DEFINITION_IDENTIFIER_BOOST;
      reasons.push(`defines task identifiers: ${definedIdentifiers.join(", ")}`);
    }
    const taskMatchedDefinitions = signals.exactFragments.length === 0 && !taskTargetsDocumentation && !taskTargetsPresentation ? (file.kind === "documentation" ? [] : findTaskMatchedDefinitions(file.textSample, taskTokens)).filter((identifier) => !definedIdentifiers.includes(identifier)).slice(0, MAX_DEFINITION_IDENTIFIERS) : [];
    if (taskMatchedDefinitions.length > 0) {
      score += taskMatchedDefinitions.length * TASK_MATCHED_DEFINITION_BOOST;
      reasons.push(`defines symbols matching task terms: ${taskMatchedDefinitions.join(", ")}`);
    }
    const definitionFragment = file.kind === "documentation" ? void 0 : signals.exactFragments.find((fragment) => hasExactFragmentAtDefinition(file.textSample, fragment, definedIdentifiers));
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
    const isDeploymentConfig = file.path === "package.json" || DEPLOYMENT_TERMS.some((term) => pathTokens.has(term));
    if (taskTargetsDeployment && file.kind === "config" && !file.path.includes("/") && isDeploymentConfig) {
      score += 5;
      reasons.push("root configuration for a deployment-related task");
    }
    if (file.kind === "code" && isAuxiliaryCodePath(file.path) && !taskTargetsExamples && !taskTargetsPresentation && !isChanged && !mentionedPaths.has(file.path)) {
      score -= EXAMPLE_CODE_PENALTY;
      reasons.push("example or demo code deprioritized for an implementation task");
    }
    if (isPresentationSurfacePath(file.path) && !taskTargetsPresentation && !taskTargetsExamples && !isChanged && !mentionedPaths.has(file.path)) {
      score -= PRESENTATION_CODE_PENALTY;
      reasons.push("presentation or demo surface deprioritized for a non-UI implementation task");
    }
    if (isTypeDeclarationPath(file.path) && !taskTargetsTypeDeclarations && !isChanged && !mentionedPaths.has(file.path)) {
      score -= TYPE_DECLARATION_PENALTY;
      reasons.push("type declaration deprioritized for a runtime task");
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
  const ranked = scored.filter((file) => file.score >= minScore).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
  const clustered = isClusteredRanking(ranked);
  const leadIsContested = hasContestedLead(ranked);
  return ranked.map((entry, position) => ({
    rank: position + 1,
    path: entry.path,
    score: entry.score,
    confidence: confidenceForEntry(entry, grounding, clustered, {
      position,
      topScore: ranked[0]?.score ?? entry.score,
      leadIsContested
    }),
    reasons: entry.reasons.length > 0 ? entry.reasons : ["source file baseline"]
  }));
}
function hasContestedLead(ranked) {
  const leader = ranked[0];
  if (!leader || hasDefinitionEvidence(leader)) {
    return false;
  }
  return ranked.slice(1).some((entry) => hasDefinitionEvidence(entry));
}
function hasDefinitionEvidence(entry) {
  return entry.reasons.some((reason) => reason.startsWith("defines task identifiers:") || reason.startsWith("exact task literal at definition:"));
}
function applyImportProximity(scored, repo) {
  const seedEntries = scored.filter((entry) => entry.score >= 8 && hasDirectEvidence(entry)).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, MAX_PROXIMITY_SEEDS);
  if (seedEntries.length === 0) {
    return;
  }
  const seeds = seedEntries.map((entry) => entry.path);
  const seedScores = new Map(seedEntries.map((entry) => [entry.path, entry.score]));
  const proximity = findImportProximity(buildImportGraph(repo.files), seeds);
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
  if (entry.isChanged) {
    return "high";
  }
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
  if (grounding.specificity === "vague") {
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
  return entry.isChanged || entry.reasons.some((reason) => reason === "explicitly named in the task" || reason.startsWith("defines task identifiers:") || reason.startsWith("exact task literal at definition:"));
}
function isClusteredRanking(entries) {
  const top = entries[0]?.score;
  const third = entries[2]?.score;
  return top !== void 0 && third !== void 0 && top - third <= 2;
}
function hasAny(tokens, values) {
  return values.some((value) => tokens.has(value));
}
function matchMentionedPaths(mentions, repoPaths) {
  const matched = /* @__PURE__ */ new Set();
  for (const mention of mentions) {
    const exactMatches = repoPaths.filter((path) => pathMatchesMention2(path, mention));
    if (exactMatches.length > 0) {
      if (exactMatches.length <= MAX_FILES_PER_MENTION) {
        for (const path of exactMatches) {
          matched.add(path);
        }
      }
      continue;
    }
    const fallbackVariants = compiledSourcePathVariants(mention);
    const fallbackMatches = repoPaths.filter((path) => fallbackVariants.some((variant) => pathMatchesMention2(path, variant)));
    if (fallbackMatches.length > 0 && fallbackMatches.length <= MAX_FILES_PER_MENTION) {
      for (const path of fallbackMatches) {
        matched.add(path);
      }
    }
  }
  return matched;
}
function pathMatchesMention2(path, mention) {
  return path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`);
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
  return parts.slice(0, -1).some((segment) => AUXILIARY_CODE_DIRS.has(segment.toLowerCase())) || /^(?:demo|example|sample)(?:[-_.]|$)/.test(stem);
}
function isPresentationSurfacePath(path) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return /^(?:page|layout|demo|sample-repo)\.[cm]?[jt]sx?$/.test(name) || /\.(?:css|less|sass|scss)$/.test(name);
}
function tokenizeFileContent(text) {
  const tokens = tokenizeText(text);
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
function findRegexTokenOverlap(text, taskTokens) {
  const overlap = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/\b([A-Za-z])\{(\d+),(\d+)\}/g)) {
    const character = match[1]?.toLowerCase();
    const minimum = Number(match[2]);
    const maximum = Math.min(Number(match[3]), 8);
    if (!character || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      continue;
    }
    for (let length = Math.max(3, minimum); length <= maximum; length += 1) {
      const token = character.repeat(length);
      if (taskTokens.has(token)) {
        overlap.add(token);
      }
    }
  }
  return [...overlap].slice(0, 2);
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
  const documentation = "(?:docs?|documentation|readme|guide|copy)";
  const action = "(?:add|edit|update|write|rewrite|revise|remove|correct|document|improve)";
  return new RegExp(`\\b${action}\\b[^\\n.]{0,60}\\b${documentation}\\b`, "i").test(taskText) || new RegExp(`\\b${documentation}\\b[^\\n.]{0,60}\\b${action}\\b`, "i").test(taskText);
}
function buildDefinitionSignals(identifiers) {
  return [...identifiers].sort((a, b) => a.localeCompare(b)).map((identifier) => ({
    identifier,
    pattern: new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\\s+${escapeRegExp2(identifier)}\\b`)
  }));
}
function findDefinedIdentifiers(text, signals) {
  return signals.filter((signal) => signal.pattern.test(text)).map((signal) => signal.identifier);
}
function hasExactIdentifier(text, identifier) {
  return new RegExp(`(^|[^$A-Za-z0-9_])${escapeRegExp2(identifier)}(?=$|[^$A-Za-z0-9_])`).test(text);
}
function findTaskMatchedDefinitions(text, taskTokens) {
  const definitions = /* @__PURE__ */ new Set();
  const pattern = /\b(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\s+([$A-Za-z_][$A-Za-z0-9_]*)\b/g;
  for (const match of text.matchAll(pattern)) {
    const identifier = match[1];
    if (!identifier) {
      continue;
    }
    const overlap = [...tokenizeText(identifier)].filter((token) => taskTokens.has(token));
    if (overlap.length >= 2) {
      definitions.add(identifier);
    }
  }
  return [...definitions];
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

// packages/core/dist/test-gates.js
var GATE_PATTERN = /\.(skipIf|runIf)\s*\(/;
var ENV_NAME_PATTERNS = [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g];
function findGatedTestDiagnostics(files, routedTestPaths) {
  const routed = new Set(routedTestPaths);
  const diagnostics = [];
  for (const file of files) {
    if (!file.isTest || !routed.has(file.path) || !GATE_PATTERN.test(file.textSample)) {
      continue;
    }
    diagnostics.push({
      code: "gated-test-skipped",
      severity: "warning",
      message: gateMessage(file.path, extractEnvNames(file.textSample))
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

// packages/core/dist/report.js
var MAX_REPORTED_TERMS = 8;
function buildReportFromRepo(repo, input) {
  const grounding = analyzeTaskGrounding(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const contextFiles = grounding.specificity === "vague" ? [] : rankContextFiles(repo, {
    issueText: input.issueText,
    diffText: repo.diffText,
    exclude: input.exclude
  }, input.limit ?? DEFAULT_CONTEXT_FILE_LIMIT);
  const ranking = buildRankingShape(contextFiles);
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];
  return {
    reportVersion: 1,
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    changedFiles: repo.changedFiles,
    diagnostics: [
      ...repo.diagnostics,
      ...findGatedTestDiagnostics(repo.files, routedTestPaths),
      ...findMissingTestRouteDiagnostics(repo, contextFiles, testRoutes),
      ...findTaskDiagnostics(repo, grounding, ranking),
      ...findTaskPreprocessingDiagnostics(input.issueText ?? ""),
      ...grounding.specificity === "vague" ? [] : findEmptyResultDiagnostics(repo, contextFiles, input.issueText ?? "", input.exclude)
    ],
    analysis: {
      grounding,
      ranking,
      // Only a test route's related paths are tests. A lint, typecheck or Go route fills the
      // same field with implementation paths, and counting those made nextAction promise
      // "and its routed tests" when nothing of the sort had been routed.
      nextAction: buildNextAction(grounding, ranking, contextFiles, testRoutes.some((route) => route.kind === "test" && route.relatedFiles.length > 0))
    }
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
var SCRIPT_PRIORITY = { test: 0, validation: 10 };
var VALIDATION_SCRIPTS = /* @__PURE__ */ new Set(["typecheck", "check", "lint"]);
function classifyScript(name) {
  const lower = name.toLowerCase();
  if (lower === "test" || lower === "tests")
    return { category: "test", exact: true };
  if (/^tests?:[a-z0-9:_-]+$/.test(lower))
    return { category: "test", exact: false };
  if (VALIDATION_SCRIPTS.has(lower))
    return { category: "validation", exact: true };
  return void 0;
}
function buildTestRoutes(repo, contextPaths) {
  const codeContextPaths = contextPaths.filter((path) => repo.files.find((file) => file.path === path)?.kind === "code");
  if (codeContextPaths.length === 0) {
    return [];
  }
  const relatedTests = findRelatedTests(repo, contextPaths);
  const candidates = repo.packageScripts.map((script) => ({ script, kind: classifyScript(script.name) })).filter((candidate) => candidate.kind !== void 0).map(({ script, kind }) => ({
    script,
    kind,
    proximity: packageProximity(script.packageDir, codeContextPaths),
    priority: SCRIPT_PRIORITY[kind.category] + (kind.exact ? 0 : 1)
  })).filter((candidate) => candidate.proximity >= 0).sort((a, b) => b.proximity - a.proximity || a.priority - b.priority || a.script.packageDir.localeCompare(b.script.packageDir));
  const ordered = [
    ...candidates.filter((candidate) => candidate.kind.category === "test"),
    ...candidates.filter((candidate) => candidate.kind.category !== "test")
  ];
  const commands = /* @__PURE__ */ new Set();
  const routes = [];
  for (const { script, kind } of ordered) {
    const command = formatScriptCommand(repo.packageManager, script.packageDir, script.name, script.packageName);
    if (commands.has(command))
      continue;
    commands.add(command);
    const isTest = kind.category === "test";
    routes.push({
      command,
      kind: isTest ? "test" : "validation",
      reason: `${script.packageDir ? `nearest package (${script.packageDir})` : "repository root"} script named ${script.name}`,
      // A lint route's related paths are the implementation it would check, never tests, so
      // labeling them the same way let `no-test-changed` cite an implementation file as the
      // test the plan had routed.
      relatedFiles: scopeToPackage(isTest ? relatedTests : codeContextPaths, script.packageDir)
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
  const crateDir = language === "rust" ? nearestManifestDir(repo, codeContextPaths, "Cargo.toml") : "";
  const route = manifestTestCommand(language, crateDir, repo.files);
  if (!route) {
    return void 0;
  }
  return {
    command: route.command,
    kind: "test",
    reason: route.reason,
    // Only real test files count as related here. Falling back to the implementation made
    // nextAction claim routed tests for a Go module that had none.
    relatedFiles: scopeToPackage(relatedTests, crateDir)
  };
}
function nearestManifestDir(repo, contextPaths, manifest) {
  const manifestDirs = repo.files.filter((file) => file.path === manifest || file.path.endsWith(`/${manifest}`)).map((file) => file.path.split("/").slice(0, -1).join("/")).filter(Boolean);
  return manifestDirs.filter((dir) => contextPaths.some((path) => path.startsWith(`${dir}/`))).sort((a, b) => b.split("/").length - a.split("/").length || a.localeCompare(b))[0] ?? "";
}
var RISK_RULES = [
  { area: "authentication", severity: "high", tokens: ["auth", "login", "password"], reason: "authentication-related files are affected" },
  { area: "billing", severity: "high", tokens: ["billing", "payment", "invoice"], reason: "billing or payment-related files are affected" },
  { area: "automation", severity: "medium", tokens: ["config", "workflow", "action"], reason: "configuration or CI automation files may affect developer workflows" },
  { area: "data", severity: "high", tokens: ["migration", "schema", "database", "sql"], reason: "database or schema-related files may affect stored data" },
  { area: "public-api", severity: "medium", tokens: ["api", "route", "public"], reason: "public interfaces or request handling may change" },
  { area: "dependencies", severity: "medium", tokens: ["dependency", "lock", "package"], reason: "dependency changes can affect build and supply-chain behavior" }
];
var AUXILIARY_RISK_DIRS = /* @__PURE__ */ new Set(["demo", "demos", "example", "examples", "sample", "samples", "fixture", "fixtures"]);
function carriesRiskEvidence(path) {
  return !path.split("/").slice(0, -1).some((segment) => AUXILIARY_RISK_DIRS.has(segment.toLowerCase()));
}
function buildRiskNotes(contextPaths, changedFiles = []) {
  const contextTokens = new Set(contextPaths.filter(carriesRiskEvidence).flatMap((path) => [...tokenizePath(path)]));
  const changedTokens = new Set(changedFiles.flatMap((path) => [...tokenizePath(path)]));
  const diffPresent = changedFiles.length > 0;
  const risks = [];
  for (const rule of RISK_RULES) {
    const inChanged = rule.tokens.some((token) => changedTokens.has(token));
    const inContext = rule.tokens.some((token) => contextTokens.has(token));
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
    const tokens = tokenizePath(path);
    return rule.tokens.some((token) => tokens.has(token));
  });
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
function buildSummary(contextFileCount, testRouteCount) {
  const files = contextFileCount === 1 ? "context file" : "context files";
  const routes = testRouteCount === 1 ? "test route" : "test routes";
  return `FixMap found ${contextFileCount} ${files} and generated ${testRouteCount} ${routes}.`;
}
function renderMarkdownReport(report) {
  const lines = [
    "# FixMap Report",
    "",
    report.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report.contextFiles.map((file) => `- \`${file.path}\` (${file.confidence} confidence, score ${file.score}): ${file.reasons.join("; ")}`)),
    "",
    "## Test Routes",
    "",
    ...listOrEmpty(report.testRoutes.map((route) => {
      const related = route.relatedFiles.length > 0 ? ` Related: ${route.relatedFiles.map((path) => `\`${path}\``).join(", ")}.` : "";
      return `- \`${route.command}\`: ${route.reason}.${related}`;
    })),
    "",
    "## Risk Map",
    "",
    ...listOrEmpty(report.risks.map((risk) => `- **${risk.severity}** ${risk.area}: ${risk.reason}`)),
    "",
    "## Changed Files",
    "",
    ...listOrEmpty(report.changedFiles.map((path) => `- \`${path}\``)),
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
      ...(diagnostic.paths ?? []).slice(0, 8).map((path) => `  - \`${path}\``)
    ]))
  ];
  return `${lines.join("\n")}
`;
}
function renderJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}
`;
}
function listOrEmpty(lines) {
  return lines.length > 0 ? lines : ["- None found"];
}

// packages/core/dist/repo-scan.js
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
var WALK_IGNORED_DIRS = /* @__PURE__ */ new Set([...ALWAYS_IGNORED_DIRS, ...GENERATED_DIRS]);
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cjs",
  ".cs",
  ".css",
  ".cts",
  ".go",
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
var SFC_EXTENSIONS = /* @__PURE__ */ new Set([".vue", ".svelte"]);
var SFC_SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
var TEST_PATTERNS = [
  /\.test(?:\.|-d\.)/,
  /\.spec\./,
  /(^|\/|\\)__tests__(\/|\\)/,
  /(^|\/|\\)tests?(\/|\\)/,
  /_test\.go$/,
  /(^|\/|\\)(?:test_[^/\\]+|[^/\\]+_test)\.py$/
];
var MAX_TEXT_SAMPLE_BYTES = 64e3;
var MAX_DIFF_TEXT_CHARS = 2e5;
var MAX_SCANNED_FILES = 25e3;
var GIT_MAX_BUFFER = 10 * 1024 * 1024;
var exec = promisify(execFile);
var SCAN_CACHE_VERSION = 2;
var SCAN_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var SCAN_CACHE_FILE = /^[a-f0-9]{24}-[a-f0-9]{24}\.json$/;
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
  const cacheDecision = input.useCache === true ? await buildScanCacheLocation(repoRoot) : void 0;
  const cacheLocation = cacheDecision?.location;
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
  if (cached) {
    files = cached.files;
    trackedFiles = cached.trackedFiles;
    packageScripts = cached.packageScripts;
    packageManager = cached.packageManager;
    diagnostics.push(...cached.diagnostics, {
      code: "cache-hit",
      severity: "info",
      message: `Reused the repository scan for the exact current git state (${files.length.toLocaleString()} files, ${describeCacheAge(cached.createdAt)}). Pass --no-cache to rescan.`
    });
  } else {
    files = await listFiles(repoRoot, diagnostics);
    trackedFiles = await listTrackedPaths(repoRoot);
    packageScripts = await readPackageScripts(repoRoot, files, diagnostics);
    packageManager = detectPackageManager(files);
    if (cacheLocation) {
      await writeScanCache(cacheLocation, {
        version: SCAN_CACHE_VERSION,
        stateKey: cacheLocation.stateKey,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        files,
        trackedFiles,
        packageScripts,
        packageManager,
        diagnostics: [...diagnostics]
      });
    }
  }
  const diffSpec = resolveDiffSpec(input);
  const diff = input.workingTree ? await readWorkingTree(repoRoot, input.includeUntracked === true, diagnostics) : await readDiff(repoRoot, diffSpec, diagnostics);
  return {
    root: repoRoot,
    files,
    trackedFiles,
    packageScripts,
    changedFiles: diff.changedFiles,
    diffText: diff.diffText,
    packageManager,
    diagnostics
  };
}
async function buildScanCacheLocation(root) {
  try {
    const [{ stdout: head }, { stdout: status }] = await Promise.all([
      exec("git", ["rev-parse", "HEAD"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."], {
        cwd: root,
        maxBuffer: GIT_MAX_BUFFER
      })
    ]);
    if (status.split("\0").some((entry) => entry.startsWith("?? "))) {
      return {
        skipReason: "Repository scan caching was skipped because untracked files are scanner inputs and can change without a stable git diff."
      };
    }
    const dirtyDiff = status.length > 0 ? (await exec("git", ["diff", "--binary", "--no-ext-diff", "HEAD", "--", "."], {
      cwd: root,
      maxBuffer: GIT_MAX_BUFFER
    })).stdout : "";
    const stateKey = hashText([
      String(SCAN_CACHE_VERSION),
      resolve(root),
      head.trim(),
      status,
      dirtyDiff
    ].join("\0"));
    const cacheRoot = process.env.FIXMAP_CACHE_DIR ?? join(process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "fixmap", "scans");
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
    if (cached.version !== SCAN_CACHE_VERSION || cached.stateKey !== location.stateKey || typeof cached.createdAt !== "string" || !Number.isFinite(Date.parse(cached.createdAt)) || Date.now() - Date.parse(cached.createdAt) > SCAN_CACHE_MAX_AGE_MS || !Array.isArray(cached.files) || !Array.isArray(cached.trackedFiles) || !Array.isArray(cached.packageScripts) || !Array.isArray(cached.diagnostics) || !["npm", "pnpm", "yarn", "bun"].includes(cached.packageManager ?? ""))
      return void 0;
    return cached;
  } catch {
    return void 0;
  }
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
async function pruneExpiredScanCache(cacheRoot) {
  try {
    const entries = await readdir(cacheRoot, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(entries.filter((entry) => entry.isFile() && SCAN_CACHE_FILE.test(entry.name)).map(async (entry) => {
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
async function listTrackedPaths(root) {
  try {
    const { stdout } = await exec("git", ["ls-files", "--cached", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    return stdout.split("\0").filter(Boolean).map(normalizePath);
  } catch {
    return [];
  }
}
function resolveDiffSpec(input) {
  return input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : void 0);
}
async function listFiles(root, diagnostics) {
  const gitPaths = await listGitPaths(root);
  const files = gitPaths ? await buildFilesFromPaths(root, gitPaths.paths, diagnostics, gitPaths.gitLinks) : (await walkFiles(root, root, diagnostics, { count: 0, limitReported: false })).sort((a, b) => a.path.localeCompare(b.path));
  reportUnreadContent(diagnostics, files);
  reportGeneratedDominance(diagnostics, files);
  return files;
}
async function listGitPaths(root) {
  try {
    const [{ stdout }, { stdout: staged }] = await Promise.all([
      exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: root,
        maxBuffer: GIT_MAX_BUFFER
      }),
      exec("git", ["ls-files", "--stage", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const gitLinks = new Set(staged.split("\0").flatMap((entry) => {
      const match = /^160000\s+[0-9a-f]+\s+\d+\t(.+)$/i.exec(entry);
      return match?.[1] ? [normalizePath(match[1])] : [];
    }));
    return { paths: [...new Set(stdout.split("\0").filter(Boolean))], gitLinks };
  } catch {
    return void 0;
  }
}
async function buildFilesFromPaths(root, paths, diagnostics, knownGitLinks = /* @__PURE__ */ new Set()) {
  const results = [];
  const absent = [];
  const gitLinks = [];
  const seenRealPaths = /* @__PURE__ */ new Map();
  const linked = [];
  for (const [index, rawPath] of paths.entries()) {
    if (results.length >= MAX_SCANNED_FILES) {
      reportScanLimit(diagnostics, paths.slice(index).map(normalizePath));
      break;
    }
    const relativePath = normalizePath(rawPath);
    if (isInAlwaysIgnoredDir(relativePath)) {
      continue;
    }
    if (knownGitLinks.has(relativePath)) {
      gitLinks.push(relativePath);
      continue;
    }
    const scanned = await toRepoFile(join(root, rawPath), relativePath);
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
      const seenIsAlias = !sameFilesystemPath(resolve(root, seenFile.path), scanned.realPath);
      const currentIsAlias = !sameFilesystemPath(resolve(root, relativePath), scanned.realPath);
      if (seenIsAlias && !currentIsAlias) {
        linked.push({ path: seenFile.path, target: relativePath });
        results[seenIndex] = scanned.file;
      } else {
        linked.push({ path: relativePath, target: seenFile.path });
      }
      continue;
    }
    seenRealPaths.set(scanned.realPath, results.length);
    results.push(scanned.file);
  }
  reportAbsentTrackedPaths(diagnostics, absent);
  reportLinkedDuplicates(diagnostics, linked);
  reportSkippedSubmodules(diagnostics, gitLinks);
  return results.sort((a, b) => a.path.localeCompare(b.path));
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
  for (const reason of ["not-text", "unreadable"]) {
    const affected = unavailable.filter((file) => file.textSampleSkipReason === reason);
    if (affected.length === 0)
      continue;
    const sample2 = affected.slice(0, 3).map((file) => file.path).join(", ");
    const prefix = `${affected.length.toLocaleString()} source file${affected.length === 1 ? "" : "s"}`;
    diagnostics.push({
      code: "content-unread",
      severity: "warning",
      message: reason === "not-text" ? `${prefix} ${affected.length === 1 ? "is" : "are"} not UTF-8 text (for example UTF-16 or binary) and rank${affected.length === 1 ? "s" : ""} on path alone: ${sample2}${affected.length > 3 ? ", ..." : ""}. Re-save source as UTF-8 to rank its contents.` : `${prefix} could not be read and rank${affected.length === 1 ? "s" : ""} on path alone: ${sample2}${affected.length > 3 ? ", ..." : ""}. Check file permissions and retry.`,
      paths: affected.slice(0, 8).map((file) => file.path)
    });
  }
  const unread = files.filter((file) => file.isSource && file.textSampleComplete === false && file.textSampleSkipReason === "too-large");
  if (unread.length === 0)
    return;
  const sample = unread.slice().sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 3).map((file) => `${file.path} (${Math.ceil(file.sizeBytes / 1e3).toLocaleString()} kB)`).join(", ");
  diagnostics.push({
    code: "content-unread",
    severity: "warning",
    message: `${unread.length.toLocaleString()} source file${unread.length === 1 ? "" : "s"} could not be read as text and rank${unread.length === 1 ? "s" : ""} on path alone \u2014 largest: ${sample}${unread.length > 3 ? ", \u2026" : ""}. Files over ${(MAX_TEXT_SAMPLE_BYTES / 1e3).toLocaleString()} kB are not sampled.`,
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
async function walkFiles(root, current, diagnostics, state) {
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
    if (entry.isDirectory()) {
      if (WALK_IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      results.push(...await walkFiles(root, join(current, entry.name), diagnostics, state));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const absolutePath = join(current, entry.name);
    const scanned = await toRepoFile(absolutePath, normalizePath(relative(root, absolutePath)));
    if (scanned.status === "ok") {
      results.push(scanned.file);
      state.count += 1;
    }
  }
  return results;
}
async function toRepoFile(absolutePath, relativePath) {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return { status: "absent" };
  }
  if (!fileStat.isFile()) {
    return { status: "not-a-file" };
  }
  const extension = extname(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(extension);
  const sample = isSource ? await readTextSample(absolutePath, fileStat.size) : { text: "", complete: true };
  if (SFC_EXTENSIONS.has(extension) && sample.text) {
    sample.text = extractScriptBlocks(sample.text);
  }
  return {
    status: "ok",
    realPath: await resolveRealPath(absolutePath),
    file: {
      path: relativePath,
      extension,
      sizeBytes: fileStat.size,
      isTest: TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
      isSource,
      kind: classifyFile(relativePath, extension),
      textSample: sample.text,
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
      const packageDir = normalizePath(dirname(manifest.path));
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
async function readDiff(repoRoot, diffSpec, diagnostics) {
  if (!diffSpec) {
    return { changedFiles: [], diffText: "" };
  }
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", diffSpec], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", diffSpec], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map(normalizePath);
    const untracked = diffSpec.includes("..") ? [] : await listUntrackedPaths(repoRoot);
    const changedFiles = [.../* @__PURE__ */ new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));
    diagnostics.push({
      code: "diff-resolved",
      severity: "info",
      message: changedFiles.length === 0 ? `The diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}" resolved to zero changed files, so results use the task text only. Paths are relative to the working directory; run from the repository root to include changes outside it.` : `Diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}" resolved ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"}.`,
      paths: changedFiles.slice(0, 8)
    });
    return {
      changedFiles,
      diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS)
    };
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
async function readWorkingTree(repoRoot, includeUntracked, diagnostics) {
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", "HEAD"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", "HEAD"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map(normalizePath);
    const untracked = includeUntracked ? await listUntrackedPaths(repoRoot) : [];
    const changedFiles = [.../* @__PURE__ */ new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));
    diagnostics.push({
      code: "working-tree-diff",
      severity: "info",
      message: changedFiles.length === 0 ? "Working-tree mode found no changes against HEAD; results use the task text only." : `Working-tree mode used ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"} against HEAD${includeUntracked ? ", including untracked files" : " (untracked files are not counted as changed, though they still rank; pass --include-untracked to count them)"}.`,
      paths: changedFiles.slice(0, 8)
    });
    return { changedFiles, diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS) };
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
function detectPackageManager(files) {
  const paths = new Set(files.map((file) => file.path));
  if (paths.has("pnpm-lock.yaml") || paths.has("pnpm-workspace.yaml"))
    return "pnpm";
  if (paths.has("yarn.lock") || paths.has(".yarnrc.yml"))
    return "yarn";
  if (paths.has("bun.lock") || paths.has("bun.lockb"))
    return "bun";
  return "npm";
}
function classifyFile(path, extension) {
  const lower = path.toLowerCase();
  if (extension === ".md" || lower.startsWith("docs/") || lower === "license")
    return "documentation";
  if (lower.startsWith(".github/") || [".json", ".yaml", ".yml"].includes(extension) || /(^|\/)([^/]+\.)?(config|rc)\.[^/]+$/.test(lower))
    return "config";
  if (SOURCE_EXTENSIONS.has(extension))
    return "code";
  return "other";
}
async function readTextSample(path, sizeBytes) {
  if (sizeBytes > MAX_TEXT_SAMPLE_BYTES) {
    return { text: "", complete: false, skipReason: "too-large" };
  }
  try {
    const bytes = await readFile(path);
    if (bytes.includes(0)) {
      return { text: "", complete: false, skipReason: "not-text" };
    }
    return { text: bytes.toString("utf8"), complete: true };
  } catch {
    return { text: "", complete: false, skipReason: "unreadable" };
  }
}
async function listUntrackedPaths(repoRoot) {
  try {
    const { stdout } = await exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER });
    return stdout.split("\0").filter(Boolean).map(normalizePath);
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
function normalizePath(path) {
  return path.split(sep).join("/");
}

// packages/core/dist/plan.js
async function buildFixMapReport(input) {
  const repo = await scanRepo(input);
  const exclude = await resolveExclusions(input.repoRoot, input.exclude ?? []);
  const report = buildReportFromRepo(repo, {
    issueText: input.issueText,
    limit: input.limit,
    exclude
  });
  if (exclude.patterns.length > 0) {
    const excludedPaths = repo.files.filter((file) => exclude.excludes(file.path)).map((file) => file.path);
    const unmatchedPatterns = exclude.patterns.filter((pattern) => !pattern.startsWith("!") && !exclude.matchedPatterns.has(pattern));
    if (unmatchedPatterns.length > 0) {
      const sample = unmatchedPatterns.slice(0, 5).join(", ");
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
        message: `${exclude.patterns.length} exclusion ${exclude.patterns.length === 1 ? "pattern" : "patterns"} removed ${excludedPaths.length} ${excludedPaths.length === 1 ? "path" : "paths"} from ranking: ${exclude.patterns.join(", ")}. Run --explain on a file you expected to see if this is why it is absent.`
      });
    }
  }
  return report;
}
async function resolveExclusions(repoRoot, patterns) {
  const combined = [...await readIgnoreFile(repoRoot), ...patterns].map((pattern) => normalizeAbsolutePattern(repoRoot, pattern));
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
  if (plannedPaths.length > 0 && !plannedPaths.some((path) => fileByPath.has(path))) {
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
  return {
    summary: buildVerifySummary(changed.length, findings),
    changedFiles: changed,
    findings,
    diagnostics: repo.diagnostics
  };
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
        lines.push(`  - \`${path}\``);
      }
    }
  }
  lines.push("", "## Changed Files", "");
  lines.push(...result.changedFiles.length > 0 ? result.changedFiles.map((path) => `- \`${path}\``) : ["- None found"]);
  return `${lines.join("\n")}
`;
}

// packages/core/dist/validate.js
function validateFixMapReport(candidate, label) {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) || !Array.isArray(candidate.contextFiles)) {
    return {
      success: false,
      message: `${label} is not a FixMap JSON report: no contextFiles array.`
    };
  }
  const contextFiles = candidate.contextFiles;
  const record = candidate;
  if (record.reportVersion !== void 0 && record.reportVersion !== 1) {
    return {
      success: false,
      message: `${label} uses unsupported reportVersion ${JSON.stringify(record.reportVersion)}; this FixMap release supports reportVersion 1.`
    };
  }
  if (contextFiles.length === 0 && !(typeof record.summary === "string" && Array.isArray(record.testRoutes) && Array.isArray(record.risks) && Array.isArray(record.changedFiles) && Array.isArray(record.diagnostics))) {
    return {
      success: false,
      message: `${label} has no context files and is missing the complete FixMap report envelope (summary, testRoutes, risks, changedFiles, and diagnostics).`
    };
  }
  const invalid = contextFiles.findIndex((file) => {
    if (typeof file !== "object" || file === null)
      return true;
    const ranked = file;
    if (typeof ranked.path !== "string" || ranked.path.trim().length === 0)
      return true;
    if (ranked.rank !== void 0 && (!Number.isSafeInteger(ranked.rank) || ranked.rank < 1))
      return true;
    if (ranked.score !== void 0 && (typeof ranked.score !== "number" || !Number.isFinite(ranked.score)))
      return true;
    if (ranked.confidence !== void 0 && ranked.confidence !== "high" && ranked.confidence !== "medium" && ranked.confidence !== "low")
      return true;
    return false;
  });
  if (invalid !== -1) {
    return {
      success: false,
      message: `${label} has an invalid contextFiles entry at index ${invalid}; each entry needs a non-empty string "path", and optional rank, score, and confidence fields must use their documented types.`
    };
  }
  return { success: true, report: candidate };
}

// packages/action/src/github.ts
var FIXMAP_REPORT_MARKER = "<!-- fixmap-report -->";
var MAX_COMMENT_BODY_CHARS = 65536;
var COMMENT_TRUNCATION_FOOTER = "\n\n> Report truncated to fit GitHub's comment size limit. The complete report is in the step summary and the `report` output.\n";
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
  for (let page = 1; page <= maxPages; page += 1) {
    const comments = await requestJson(
      fetchImpl,
      `${commentsUrl}?per_page=100&page=${page}&sort=created&direction=desc`,
      { headers },
      "list pull request comments"
    );
    const match = comments.filter(
      (comment) => comment.body?.includes(FIXMAP_REPORT_MARKER) && // GitHub logins are case-insensitive, so a config saying "github-actions[bot]" did
      // not match a comment authored by "GitHub-Actions[bot]" and the Action posted a
      // second comment beside the one it meant to update.
      (!commentAuthor || comment.user?.login?.toLowerCase() === commentAuthor.toLowerCase())
    ).sort((left, right) => right.id - left.id)[0];
    if (match) return match;
    if (comments.length < 100) {
      return void 0;
    }
  }
  return void 0;
}
function isPermissionDeniedError(error) {
  return error instanceof Error && /GitHub returned (401|403|404)\b/.test(error.message);
}
async function requestJson(fetchImpl, url, init, action) {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`FixMap could not ${action}; GitHub returned ${response.status} ${response.statusText}${suffix}`);
  }
  return response.json();
}

// packages/action/src/issue-source.ts
var MAX_API_RESPONSE_CHARS = 1e6;
var MAX_ISSUE_BODY_CHARS = 2e4;
function parseActionIssueSource(input) {
  let trimmed = input.trim();
  if (/^https?:\/\/[^/\s]*@(?:www\.|api\.)?github\.com\//i.test(trimmed)) {
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
var TRUNCATION_FOOTER = "\n\n> FixMap report truncated to fit GitHub's 1 MiB step-summary limit. The complete report remains available through the `report` output.\n";
async function runAction(env = process.env, dependencies = {}) {
  const appendFile = dependencies.appendFile ?? ((path, contents) => appendFileSync(path, contents));
  const readFile3 = dependencies.readFile ?? ((path) => readFileSync(path, "utf8"));
  const stdout = dependencies.stdout ?? ((text) => process.stdout.write(text));
  const event = readEvent(env.GITHUB_EVENT_PATH, readFile3);
  const rawIssue = readInput("issue", env) || buildPullRequestIssueText(event);
  const diffSpec = readInput("diff", env);
  const workingTree = parseBooleanInput("working-tree", readInput("working-tree", env));
  const includeUntracked = parseBooleanInput("include-untracked", readInput("include-untracked", env));
  const baseRef = readInput("base", env) || (!workingTree && env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : void 0);
  const headRef = readInput("head", env) || (!workingTree && env.GITHUB_HEAD_REF ? "HEAD" : void 0);
  const format = parseFormat(readInput("format", env));
  const mode = parseMode(readInput("mode", env));
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
    return runVerifyMode({ env, dependencies, readFile: readFile3, appendFile, stdout, format, diffSpec, baseRef, headRef, workingTree, includeUntracked });
  }
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
    useCache: true,
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
    appendFile(env.GITHUB_STEP_SUMMARY, fitStepSummary(format === "json" ? withJsonDetails(markdown, output) : markdown));
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
        `::warning::FixMap could not comment on the pull request, which is expected when the token is read-only (for example on forked pull requests). The full report is in the step summary and the report output. ${detail}
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
  const repo = await (context.dependencies.scanRepo ?? scanRepo)({
    repoRoot: (context.dependencies.cwd ?? process.cwd)(),
    diffSpec: context.diffSpec,
    baseRef: context.baseRef,
    headRef: context.headRef,
    workingTree: context.workingTree,
    includeUntracked: context.includeUntracked,
    useCache: true
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
    context.appendFile(context.env.GITHUB_STEP_SUMMARY, fitStepSummary(markdown));
  }
  if (context.env.GITHUB_OUTPUT) {
    context.appendFile(
      context.env.GITHUB_OUTPUT,
      renderVerifyOutputs(output, result, context.dependencies.uuid ?? randomUUID2)
    );
  }
  if (result.findings.some((finding) => finding.severity === "error")) {
    throw new Error(
      "FixMap verification found an edit in a generated or retired location, which the next build discards."
    );
  }
}
function renderVerifyOutputs(reportText, result, uuid = randomUUID2) {
  const delimiter = `fixmap_${uuid().replaceAll("-", "")}`;
  const terminated = reportText.endsWith("\n") ? reportText : `${reportText}
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
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) throw new Error("limit must be a whole number from 1 to 20.");
  return parsed;
}
function parseBooleanInput(name, value) {
  if (!value) return false;
  if (/^(?:true|1|yes)$/i.test(value)) return true;
  if (/^(?:false|0|no)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false.`);
}
function renderActionOutputs(reportText, report, uuid = randomUUID2) {
  const delimiter = `fixmap_${uuid().replaceAll("-", "")}`;
  const terminatedReport = reportText.endsWith("\n") ? reportText : `${reportText}
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
  const patterns = [];
  let current = "";
  let depth = 0;
  for (const character of raw) {
    if (character === "{") depth += 1;
    else if (character === "}") depth = Math.max(0, depth - 1);
    if (character === "\n" || character === "\r" || character === "," && depth === 0) {
      patterns.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  patterns.push(current);
  return patterns.map((pattern) => pattern.trim()).filter(Boolean);
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
