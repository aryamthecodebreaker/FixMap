const TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;

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
  "case",
  "catch",
  "class",
  "const",
  "continue",
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

const FILE_MENTION_PATTERN =
  /[A-Za-z0-9_@$][A-Za-z0-9_.$/\\-]*\.(?:[cm]?[jt]sx?|json|ya?ml|mdx?|css|scss|less|html|py|rb|rs|go|java|kt|c|cc|cpp|h|hpp|d\.ts)\b/g;
const MEMBER_MENTION_PATTERN =
  /\b(?:window|globalThis|process|request|response|req|res|this)\.([$A-Za-z_][$A-Za-z0-9_$]*)\b/g;
const FILE_EXTENSIONS = new Set([
  "c", "cc", "cjs", "cpp", "css", "go", "h", "hpp", "html", "java", "js", "json",
  "jsx", "kt", "less", "md", "mdx", "mjs", "py", "rb", "rs", "scss", "ts", "tsx",
  "yaml", "yml"
]);
const IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]{4,}/g;
const MAX_EXACT_FRAGMENTS = 8;
const MAX_IDENTIFIERS = 24;

export type TaskSignals = {
  tokens: Set<string>;
  changedFiles: Set<string>;
  fileMentions: Set<string>;
  memberMentions: Set<string>;
  exactFragments: string[];
  identifiers: Set<string>;
};

export function extractTaskSignals(input: {
  issueText?: string | undefined;
  diffText?: string | undefined;
  changedFiles?: string[];
}): TaskSignals {
  const issueText = stripUncheckedChecklistLines(input.issueText ?? "");
  const taskText = [issueText, extractDiffContentLines(input.diffText ?? "")].join("\n");
  const tokens = tokenizeText(taskText);

  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? []),
    fileMentions: extractFileMentions(issueText),
    memberMentions: extractMemberMentions(issueText),
    exactFragments: extractExactFragments(taskText),
    identifiers: extractIdentifiers(taskText)
  };
}

function stripUncheckedChecklistLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*[-*]\s*\[\s\]\s+/.test(line))
    .join("\n");
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

function addIdentifier(identifiers: Set<string>, identifier: string): void {
  if (identifiers.size >= MAX_IDENTIFIERS || STOP_WORDS.has(identifier.toLowerCase())) {
    return;
  }
  identifiers.add(identifier);
}

function isDistinctiveIdentifier(identifier: string): boolean {
  return /[0-9_$]/.test(identifier) || /[a-z][A-Z]/.test(identifier);
}

function isDistinctiveFragment(fragment: string): boolean {
  if (fragment.length < 6 || fragment.length > 96 || /\s/.test(fragment)) {
    return false;
  }
  const punctuationCount = [...fragment].filter((character) => /[^A-Za-z0-9_$]/.test(character)).length;
  return punctuationCount >= 2 && /[A-Za-z0-9]/.test(fragment);
}

function scanQuotedFragments(text: string): Array<{ delimiter: string; value: string }> {
  const fragments: Array<{ delimiter: string; value: string }> = [];

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

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

export function extractFileMentions(text: string): Set<string> {
  const mentions = new Set<string>();

  for (const match of text.matchAll(FILE_MENTION_PATTERN)) {
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
    .filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"))
    .join("\n");
}

export function tokenizeText(text: string): Set<string> {
  return new Set(
    text
      .replace(/\bhttp\s*\/\s*([123])\b/gi, "http h$1")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token))
      .map((token) => normalizeToken(token))
      .filter((token) => isSearchableToken(token) && !STOP_WORDS.has(token))
  );
}

function isSearchableToken(token: string): boolean {
  return token.length >= 3 || /^[a-z]\d$/i.test(token);
}

function normalizeToken(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return normalizeVerbStem(token.slice(0, -3));
  if (token.length > 4 && token.endsWith("ed")) return normalizeVerbStem(token.slice(0, -2));
  if (token.length > 4 && token.endsWith("es")) return normalizeTrailingE(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return normalizeTrailingE(token);
}

function normalizeVerbStem(stem: string): string {
  const deduplicated = /([a-z])\1$/.test(stem) ? stem.slice(0, -1) : stem;
  return normalizeTrailingE(deduplicated);
}

// Strip a trailing "e" so a base form and its inflections converge: "file", "files",
// and "filed" all reach "fil". The guard is > 3 rather than > 4 so four-letter bases
// ("base", "code", "file", "size", "date", "time") are included; the result is still
// at least three characters, which is the minimum token length tokenizeText keeps.
function normalizeTrailingE(token: string): string {
  return token.length > 3 && token.endsWith("e") ? token.slice(0, -1) : token;
}

export function tokenizePath(path: string): Set<string> {
  return tokenizeText(path);
}
