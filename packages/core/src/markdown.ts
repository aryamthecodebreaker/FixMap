/** Render arbitrary repository text as a CommonMark code span without breaking on backticks. */
export function markdownCode(value: string): string {
  const longestRun = longestBacktickRun(value);
  const fence = "`".repeat(longestRun + 1);
  const needsPadding = value.startsWith("`") || value.endsWith("`") || value.startsWith(" ") || value.endsWith(" ");
  return `${fence}${needsPadding ? " " : ""}${value}${needsPadding ? " " : ""}${fence}`;
}

export function longestBacktickRun(value: string): number {
  let longest = 0;
  for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}
