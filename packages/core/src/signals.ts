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

export type TaskSignals = {
  tokens: Set<string>;
  changedFiles: Set<string>;
  fileMentions: Set<string>;
};

export function extractTaskSignals(input: {
  issueText?: string | undefined;
  diffText?: string | undefined;
  changedFiles?: string[];
}): TaskSignals {
  const tokens = tokenizeText([input.issueText ?? "", extractDiffContentLines(input.diffText ?? "")].join("\n"));

  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? []),
    fileMentions: extractFileMentions(input.issueText ?? "")
  };
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
