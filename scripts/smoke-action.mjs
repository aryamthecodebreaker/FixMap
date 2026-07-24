import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eventPath = join(repoRoot, "examples", "events", "password-reset-pr.json");
const actionPath = join(repoRoot, "packages", "action", "dist", "index.mjs");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "fixmap-action-smoke-"));
const outputPath = join(temporaryDirectory, "github-output.txt");
const summaryPath = join(temporaryDirectory, "step-summary.md");

try {
  const result = spawnSync(process.execPath, [actionPath], {
    cwd: join(repoRoot, "examples", "tiny-auth-app"),
    env: {
      ...pickEnvironment(["ComSpec", "HOME", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "Path", "PATHEXT", "SystemRoot", "TEMP", "TMP", "USERPROFILE"]),
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath
    },
    encoding: "utf8"
  });

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!result.stdout.includes("src/auth/reset-password.ts")) {
    process.stderr.write("Action smoke failed: expected password-reset context was not ranked.\n");
    process.exit(1);
  }

  const actionOutput = readFileSync(outputPath, "utf8");
  const stepSummary = readFileSync(summaryPath, "utf8");
  if (!/^report<<fixmap_[a-f0-9]+\n/m.test(actionOutput) || !actionOutput.includes("\ncontext-count=")) {
    process.stderr.write("Action smoke failed: GITHUB_OUTPUT did not contain a valid report and counts.\n");
    process.exit(1);
  }
  if (!stepSummary.includes("src/auth/reset-password.ts")) {
    process.stderr.write("Action smoke failed: GITHUB_STEP_SUMMARY did not contain the ranked context.\n");
    process.exit(1);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function pickEnvironment(names) {
  return Object.fromEntries(names.flatMap((name) => {
    const key = Object.keys(process.env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key && process.env[key] !== undefined ? [[key, process.env[key]]] : [];
  }));
}
