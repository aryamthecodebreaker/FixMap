#!/usr/bin/env node
import { runCli } from "./cli-runner.js";
import { RepositorySourceError } from "./repository-source.js";

// Anything reaching here escaped a handler, and Node's default is to print a stack trace
// carrying internal file paths — which PowerShell then re-wraps as a NativeCommandError. A
// RepositorySourceError's message is already the complete, actionable explanation, so the
// stack is pure noise. Other errors keep theirs: those are bugs, and the frames are evidence.
try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  if (error instanceof RepositorySourceError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
