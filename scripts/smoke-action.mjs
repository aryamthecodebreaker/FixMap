import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eventPath = join(repoRoot, "examples", "events", "password-reset-pr.json");
const actionPath = join(repoRoot, "packages", "action", "dist", "index.mjs");
const result = spawnSync(process.execPath, [actionPath], {
  cwd: join(repoRoot, "examples", "tiny-auth-app"),
  env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
  encoding: "utf8"
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
if (!result.stdout.includes("src/auth/reset-password.ts")) {
  process.stderr.write("Action smoke failed: expected password-reset context was not ranked.\n");
  process.exit(1);
}
