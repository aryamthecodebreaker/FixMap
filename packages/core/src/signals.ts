const TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;

const STOP_WORDS = new Set([
  "add",
  "and",
  "are",
  "but",
  "const",
  "default",
  "export",
  "for",
  "from",
  "function",
  "github",
  "has",
  "import",
  "index",
  "into",
  "main",
  "name",
  "new",
  "node",
  "package",
  "packages",
  "return",
  "run",
  "src",
  "the",
  "this",
  "that",
  "true",
  "type",
  "uses",
  "with",
  "when",
  "where"
]);

export type TaskSignals = {
  tokens: Set<string>;
  changedFiles: Set<string>;
};

export function extractTaskSignals(input: {
  issueText?: string | undefined;
  diffText?: string | undefined;
  changedFiles?: string[];
}): TaskSignals {
  const tokens = tokenizeText([input.issueText ?? "", extractDiffContentLines(input.diffText ?? "")].join("\n"));

  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? [])
  };
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
      .map((token) => normalizeToken(token.trim()))
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
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
