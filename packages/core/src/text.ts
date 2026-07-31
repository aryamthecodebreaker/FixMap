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

export function truncateForDiagnostic(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}
