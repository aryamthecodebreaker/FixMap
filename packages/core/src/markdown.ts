/** Render arbitrary repository text as a CommonMark code span without breaking on backticks. */
export function markdownCode(value: string): string {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const needsPadding = value.startsWith("`") || value.endsWith("`") || value.startsWith(" ") || value.endsWith(" ");
  return `${fence}${needsPadding ? " " : ""}${value}${needsPadding ? " " : ""}${fence}`;
}
