// Diagnostics quote the user's own input back at them, which is what makes them useful:
// "no file matched the task terms auth, reset, mailer" is actionable in a way that "no
// match" is not. But the input is arbitrary text, and a pasted blob, a stack trace, or a
// mistyped `--diff` argument then travels verbatim into JSON reports, CI logs, and pull
// request comments. A 30,000-character diagnostic is both unreadable and a disclosure.
//
// Truncating at the point of interpolation keeps the useful part — enough to recognize
// which term or ref was meant — and drops the rest.

export const DIAGNOSTIC_TERM_LIMIT = 48;
export const DIAGNOSTIC_SPEC_LIMIT = 80;

/** JSON.parse rejects a leading byte-order mark even though Windows editors commonly add one. */
export function stripByteOrderMark(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

export function truncateForDiagnostic(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let end = Math.max(0, limit);
  const last = value.charCodeAt(end - 1);
  const next = value.charCodeAt(end);
  if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1;
  return `${value.slice(0, end)}…`;
}
