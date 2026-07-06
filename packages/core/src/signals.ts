const TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;

const STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "has",
  "the",
  "this",
  "that",
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
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
  );
}

export function tokenizePath(path: string): Set<string> {
  return tokenizeText(path);
}
