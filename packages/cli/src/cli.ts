#!/usr/bin/env node
import { runCli } from "./cli-runner.js";
import { RepositorySourceError } from "./repository-source.js";

async function readImplicitTask(args: string[]): Promise<{ args: string[]; contents?: Buffer }> {
  if (process.stdin.isTTY === true || !acceptsImplicitTask(args)) return { args };
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const contents = Buffer.concat(chunks);
  return contents.length > 0
    ? { args: args.length === 0 ? ["plan", "--issue-file", "-"] : [...args, "--issue-file", "-"], contents }
    : { args };
}

function acceptsImplicitTask(args: string[]): boolean {
  if (args.length === 0) return true;
  if (args[0] !== "plan") return false;
  return !args.some((arg) =>
    arg === "--issue" || arg.startsWith("--issue=") ||
    arg === "--issue-file" || arg.startsWith("--issue-file=") ||
    arg === "--diff" || arg.startsWith("--diff=") ||
    arg === "--base" || arg.startsWith("--base=") ||
    arg === "--working-tree"
  );
}

// Anything reaching here escaped a handler, and Node's default is to print a stack trace
// carrying internal file paths — which PowerShell then re-wraps as a NativeCommandError. A
// RepositorySourceError's message is already the complete, actionable explanation, so the
// stack is pure noise. Other errors keep theirs: those are bugs, and the frames are evidence.
try {
  const implicit = await readImplicitTask(process.argv.slice(2));
  process.exitCode = await runCli(implicit.args, implicit.contents
    ? { readIssueFile: (path) => path === 0 ? implicit.contents! : Buffer.alloc(0) }
    : {});
} catch (error) {
  if (error instanceof RepositorySourceError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
