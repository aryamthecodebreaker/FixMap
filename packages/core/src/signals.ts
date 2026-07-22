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

const FILE_MENTION_PATTERN = /[A-Za-z0-9_@$][A-Za-z0-9_.$/\\-]*\.[A-Za-z][A-Za-z0-9]*/g;
const IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]{4,}/g;
const MAX_EXACT_FRAGMENTS = 8;
const MAX_IDENTIFIERS = 24;

export type TaskSignals = {
  tokens: Set<string>;
  changedFiles: Set<string>;
  fileMentions: Set<string>;
  exactFragments: string[];
  identifiers: Set<string>;
};

export function extractTaskSignals(input: {
  issueText?: string | undefined;
  diffText?: string | undefined;
  changedFiles?: string[];
}): TaskSignals {
  const taskText = [input.issueText ?? "", extractDiffContentLines(input.diffText ?? "")].join("\n");
  const tokens = tokenizeText(taskText);

  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? []),
    fileMentions: extractFileMentions(input.issueText ?? ""),
    exactFragments: extractExactFragments(taskText),
    identifiers: extractIdentifiers(taskText)
  };
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
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
      .map((token) => normalizeToken(token))
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  );
}

function normalizeToken(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -1);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -1);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function tokenizePath(path: string): Set<string> {
  return tokenizeText(path);
}
