export type CliShell = "powershell" | "posix";

/** Quote one command-line value for the shell the user will paste it into. */
export function quoteCliValue(value: string, shell: CliShell = "posix"): string {
  if (/^[\p{L}\p{N}._/\\:@+-]+$/u.test(value)) return value;
  return shell === "powershell"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", `'\\''`)}'`;
}
