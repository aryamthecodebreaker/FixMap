const TOKEN_SPLIT = /[^\p{L}\p{N}]+/gu;

// Path-segment words like src, main, index, package and packages are in here on purpose.
// They appear in nearly every path, so as task terms they match everything and rank nothing —
// the boilerplate problem the document-frequency cutoff exists for, but structural rather than
// statistical. The cost, filed as #386: a free-text task consisting only of those words, such
// as "index module in src", loses both terms and grounds as vague. That is the correct outcome
// for a task that names nothing specific, and a file mention like src/index.ts is unaffected
// because mentions are matched before tokenization.
const STOP_WORDS = new Set([
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

// The body run is bounded rather than `*` on purpose. It contains `.`, so it competes with
// the `\.` that follows it: on a long unbroken run with no extension the engine matches the
// whole run, fails, and retries one character shorter from every start position — quadratic.
// A 30,000-character paste took 2.4 seconds here, and the Action feeds this pattern issue
// text from public pull requests. No real path mention is longer than this bound.
const MAX_FILE_MENTION_LENGTH = 200;
import { SOURCE_FILE_EXTENSIONS } from "./paths.js";

const FILE_MENTION_EXTENSIONS = [...SOURCE_FILE_EXTENSIONS]
  .map((extension) => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .sort((left, right) => right.length - left.length)
  .join("|");
const FILE_MENTION_PATTERN =
  new RegExp(
    `(?:[A-Za-z]:[\\\\/]|[\\\\/])?[A-Za-z0-9_@$][A-Za-z0-9_.$/\\\\-]{0,${MAX_FILE_MENTION_LENGTH}}` +
    `\\.(?:${FILE_MENTION_EXTENSIONS}|d\\.ts)\\b`,
    "g"
  );
const CONVENTIONAL_FILE_MENTION_PATTERN =
  /\b(?:AUTHORS|CHANGELOG|CODE_OF_CONDUCT|CONTRIBUTING|LICENSE|NOTICE|README|SECURITY|CODEOWNERS|Dockerfile|Gemfile|Jenkinsfile|Makefile|Procfile|Rakefile|Vagrantfile)\b/gi;
const MEMBER_MENTION_PATTERN =
  /(?<![\p{L}\p{N}_$])[\p{L}_$][\p{L}\p{N}_$]*\.([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;
const FILE_EXTENSIONS = new Set([
  "c", "cc", "cjs", "cpp", "css", "go", "h", "hpp", "html", "java", "js", "json",
  "jsx", "kt", "less", "md", "mdx", "mjs", "py", "rb", "rs", "scss", "ts", "tsx",
  "yaml", "yml"
]);
const IDENTIFIER_PATTERN = /[\p{L}_$][\p{L}\p{N}_$]{4,}/gu;
const MAX_EXACT_FRAGMENTS = 8;
const MAX_IDENTIFIERS = 24;
export type TaskSignals = {
  tokens: Set<string>;
  changedFiles: Set<string>;
  fileMentions: Set<string>;
  memberMentions: Set<string>;
  exactFragments: string[];
  identifiers: Set<string>;
  uncheckedChecklistLinesRemoved: number;
  uncheckedChecklistLinesPreserved: number;
};

export function extractTaskSignals(input: {
  issueText?: string | undefined;
  diffText?: string | undefined;
  changedFiles?: string[];
}): TaskSignals {
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

function prepareChecklistText(text: string): { text: string; removed: number; preserved: number } {
  const unchecked = /^\s*[-*]\s*\[\s\]\s+/;
  const lines = text.split(/\r?\n/);
  const removed = lines.filter((line) => unchecked.test(line));
  if (removed.length === 0) return { text, removed: 0, preserved: 0 };

  const retained = lines.filter((line) => !unchecked.test(line));
  // If the only remaining text is headings/whitespace, the checklist is the issue body,
  // not a set of unselected template options. Preserve it instead of erasing the task.
  const hasSubstantiveRetainedText = retained.some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !/^#{1,6}\s+/.test(trimmed);
  });
  return hasSubstantiveRetainedText
    ? { text: retained.join("\n"), removed: removed.length, preserved: 0 }
    : { text, removed: 0, preserved: removed.length };
}

export function extractExactFragments(text: string): string[] {
  const fragments = new Set<string>();

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

export function extractIdentifiers(text: string): Set<string> {
  const identifiers = new Set<string>();

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
    if (match[1]) addIdentifier(identifiers, match[1]);
  }

  return identifiers;
}

function addIdentifier(identifiers: Set<string>, identifier: string): void {
  if (identifiers.size >= MAX_IDENTIFIERS || STOP_WORDS.has(identifier.toLowerCase())) {
    return;
  }
  identifiers.add(identifier);
}

function isDistinctiveIdentifier(identifier: string): boolean {
  return /[0-9_$]/.test(identifier) || /[\p{Ll}][\p{Lu}]/u.test(identifier) || !/^[\x00-\x7F]+$/.test(identifier);
}

function isDistinctiveFragment(fragment: string): boolean {
  if (fragment.length < 6 || fragment.length > 160) {
    return false;
  }
  if (/\s/.test(fragment)) {
    return fragment.trim().split(/\s+/).length >= 2 && /[\p{L}\p{N}]/u.test(fragment);
  }
  const punctuationCount = [...fragment].filter((character) => /[^\p{L}\p{N}$]/u.test(character)).length;
  return punctuationCount >= 1 && /[\p{L}\p{N}]/u.test(fragment);
}

export function redactSensitiveTaskText(text: string): string {
  return text
    .replace(/(https?:\/\/)[^/\s@]+@/gi, "$1")
    .replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{8,}\b/g, "[redacted]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted]");
}

/** URLs are never identifier evidence. Removing them before exact-fragment and identifier
 * extraction also prevents an unfamiliar token shape in a URL from being repeated in a
 * diagnostic. File mentions from GitHub blob URLs are extracted separately, before this. */
function stripHttpUrls(text: string): string {
  return text.includes("://") ? text.replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " [url] ") : text;
}

function stripHtmlComments(text: string): string {
  return text.includes("<!--") ? text.replace(/<!--[\s\S]*?-->/g, " ") : text;
}

function scanQuotedFragments(text: string): Array<{ delimiter: string; value: string }> {
  const fragments: Array<{ delimiter: string; value: string }> = [];

  for (const line of text.split(/\r?\n/)) {
    let cursor = 0;
    while (cursor < line.length) {
      const delimiter = line[cursor]!;
      const closingDelimiter = delimiter === "“" || delimiter === "„" ? "”" :
        delimiter === "‘" ? "’" : delimiter === "«" ? "»" : delimiter;
      if (!["\"", "'", "`", "“", "„", "‘", "«"].includes(delimiter ?? "")) {
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
        if (delimiter !== "'") fragments.push({ delimiter, value: line.slice(cursor + 1) });
        cursor += 1;
      }
    }
  }

  return fragments;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

export function extractFileMentions(text: string): Set<string> {
  const mentions = new Set<string>();
  for (const match of text.matchAll(CONVENTIONAL_FILE_MENTION_PATTERN)) {
    if (match[0]) mentions.add(match[0]);
  }
  // A blob permalink with an immutable commit is stronger than a prose path mention: it
  // is a deliberate pointer to code. Preserve only its repository-relative path before
  // stripping URLs generally. This avoids turning badges, issue links and external docs
  // into ranking terms while restoring links such as .../blob/<sha>/src/core/index.ts#L4.
  for (const match of text.matchAll(
    // blob, tree and blame all address a path in the repository; only the view differs, and
    // a tree or blame link is the same deliberate "the code is here" gesture as a blob one.
    // The ref is any branch, tag or sha — restricting to a hex sha kept only permalinks and
    // dropped the branch links people paste far more often.
    /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:blob|tree|blame)\/[^/\s]+\/([^\s#?]+)/gi
  )) {
    const encodedPath = match[1];
    if (!encodedPath) continue;
    let path = encodedPath;
    try { path = decodeURIComponent(encodedPath); } catch { /* Leave malformed escapes unchanged. */ }
    const file = path.match(FILE_MENTION_PATTERN)?.[0];
    if (file && file.length >= 4) mentions.add(file.replace(/\\/g, "/"));
  }
  // Avoid a full second pass for the overwhelmingly common case. Long issue bodies are
  // already scanned several times for signals, so paying for URL stripping when there is
  // no URL made the linear-time safety check needlessly sensitive on slower CI runners.
  const withoutUrls = text.includes("://") ? text.replace(/https?:\/\/\S+/gi, " ") : text;

  for (const match of withoutUrls.matchAll(FILE_MENTION_PATTERN)) {
    const cleaned = match[0].replace(/\\/g, "/").replace(/^\.\.?\//, "");
    if (cleaned.length >= 4) {
      mentions.add(cleaned);
    }
  }

  return mentions;
}

export function extractMemberMentions(text: string): Set<string> {
  return new Set(
    [...text.matchAll(MEMBER_MENTION_PATTERN)]
      .map((match) => match[1])
      .filter(
        (member): member is string =>
          typeof member === "string" && !FILE_EXTENSIONS.has(member.toLowerCase())
      )
  );
}

function extractDiffContentLines(diffText: string): string {
  if (!diffText) {
    return "";
  }

  return diffText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
}

export function tokenizeText(text: string): Set<string> {
  return new Set(
    text
      .replace(/\bhttp\s*\/\s*([123])\b/gi, "http h$1")
      .replace(/https?:\/\/[^\s<>()\[\]{}]+/gi, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token))
      .map((token) => normalizeToken(token))
      .filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token))
  );
}

/** Tokenize a symbol name without prose stop-word filtering. `getUser` and `runJob` need
 * both camel-case segments for partial-definition grounding even though `get` and `run`
 * are intentionally ignored in ordinary issue prose. */
export function tokenizeIdentifier(identifier: string): Set<string> {
  return new Set(
    identifier
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map((token) => normalizeToken(token.trim()))
      .filter((token) => isSearchableToken(token))
  );
}

// An unbroken alphanumeric run this long is a hash, a base64 blob, or a paste artifact,
// never a term someone is searching for. Dropping it here rather than at the point of
// display means it can neither pollute a diagnostic nor score a file for matching noise.
const MAX_SEARCHABLE_TOKEN_LENGTH = 64;
const SHORT_SEARCHABLE_TOKENS = new Set(["ci", "ui"]);

function isSearchableToken(token: string): boolean {
  if (token.length > MAX_SEARCHABLE_TOKEN_LENGTH) {
    return false;
  }
  return token.length >= 3 || SHORT_SEARCHABLE_TOKENS.has(token.toLowerCase()) || /^[a-z]\d$/i.test(token);
}

function normalizeToken(token: string): string {
  if (token === "kubernetes") return token;
  if (token === "scss" || token === "sass" || token === "less") return "css";
  if (token === "contributor" || token === "contributors") return "contribute";
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("ied")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return normalizeVerbStem(token.slice(0, -3));
  if (token.length > 3 && token.endsWith("ed")) return normalizeVerbStem(token.slice(0, -2));
  if (token.length > 4 && /(?:sses|shes|ches|xes|zes)$/.test(token)) {
    return token.slice(0, -2);
  }
  // A trailing `s` is a plural only when it is not part of the word itself. `pass`, `class`
  // and `process` end in `ss`; `status` and `bus` in `us`; `analysis` and `basis` in `is`.
  // Stripping it produced `pas`, `clas`, `proces`, `statu` — stems that match nothing, and
  // for a short task like "pass reset emails" it removed the most specific term there was.
  if (token.length > 3 && token.endsWith("s") && !/(?:ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

function normalizeVerbStem(stem: string): string {
  // Undoing a doubled consonant turns `stopped` into `stop`, which is the point. English
  // doubles a *single* final consonant to inflect, so a base already ending in `ss` never
  // got there that way: `passed` and `processed` strip to `pass` and `process`, and
  // deduplicating those produced `pas` and `proces` — stems that match nothing at all.
  const wasDoubled = /([a-z])\1$/.test(stem) && !stem.endsWith("ss");
  if (wasDoubled) {
    return stem.slice(0, -1);
  }

  // Porter-style spelling rules handle an open vocabulary. The previous implementation
  // restored a trailing e from a growing word allowlist, so every unlisted verb repeated
  // the same bug. These rules make the surface forms take the same path instead:
  // validate/validated -> validate, file/files/filed -> file, store/stored -> store.
  const silentEStem = /(?:at|bl|iz|ap|ud|ac|ut|ov|et|dl|rg|ng|ic|out|rs|ch|lv)$/;
  return silentEStem.test(stem) || (stemMeasure(stem) === 1 && endsConsonantVowelConsonant(stem))
    ? `${stem}e`
    : stem;
}

/** Number of vowel-to-consonant groups in a lowercase ASCII word (Porter's `m`). */
function stemMeasure(word: string): number {
  let measure = 0;
  let previousWasVowel = false;
  for (let index = 0; index < word.length; index += 1) {
    const vowel = isStemVowel(word, index);
    if (previousWasVowel && !vowel) measure += 1;
    previousWasVowel = vowel;
  }
  return measure;
}

function endsConsonantVowelConsonant(word: string): boolean {
  if (word.length < 3) return false;
  const last = word.length - 1;
  return !isStemVowel(word, last - 2) &&
    isStemVowel(word, last - 1) &&
    !isStemVowel(word, last) &&
    !/[wxy]/.test(word[last] ?? "");
}

function isStemVowel(word: string, index: number): boolean {
  const character = word[index] ?? "";
  if (/[aeiou]/.test(character)) return true;
  return character === "y" && index > 0 && !isStemVowel(word, index - 1);
}

export function tokenizePath(path: string): Set<string> {
  return tokenizeText(path);
}
