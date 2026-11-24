#!/usr/bin/env node
// Writes real artifacts produced by published FixMap versions into
// packages/core/test/fixtures/compat/<version>/. The compatibility test then proves the current
// release still reads every one of them.
// Usage: node scripts/generate-compat-fixtures.mjs <version> <path-to-installed-cli.js>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [version, cli] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "") || !cli || !existsSync(cli)) {
  console.error("Usage: node scripts/generate-compat-fixtures.mjs <version> <path-to-installed-cli.js>");
  process.exit(1);
}
const output = resolve(import.meta.dirname, "..", "packages", "core", "test", "fixtures", "compat", version);
mkdirSync(output, { recursive: true });

const repo = mkdtempSync(join(tmpdir(), `fixmap-compat-${version}-`));
const git = (...args) => execFileSync("git", ["-c", "user.name=FixMap", "-c", "user.email=fixmap@example.test", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
const fixmap = (...args) => {
  try {
    return { ok: true, stdout: execFileSync(process.execPath, [cli, ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }) };
  } catch (error) {
    return { ok: false, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? error.message) };
  }
};
const files = {
  "package.json": JSON.stringify({ name: "compat-fixture", private: true, scripts: { test: "vitest run" } }, null, 2),
  "src/auth/reset.ts": "export function resetPassword(email: string) { return email.includes('@'); }\n",
  "src/auth/reset.test.ts": "import { resetPassword } from './reset';\ntest('reset', () => resetPassword('a@b'));\n",
  "src/billing/charge.ts": "export const charge = (cents: number) => cents;\n"
};
for (const [path, contents] of Object.entries(files)) {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), contents);
}
git("init", "--quiet");
git("add", "-A");
git("commit", "--quiet", "-m", "base");

const written = [];
// Fixtures are committed: the temporary checkout path (which contains the local user name) is replaced.
const keep = (name, sourcePath) => {
  if (!existsSync(sourcePath)) return;
  let text = readFileSync(sourcePath, "utf8");
  for (const form of [repo, repo.replaceAll("\\", "/"), JSON.stringify(repo).slice(1, -1)]) text = text.split(form).join("/fixtures/app");
  writeFileSync(join(output, name), text);
  written.push(name);
};
const reportPath = join(repo, "..", `compat-report-${version}-${process.pid}.json`);
const plan = fixmap("plan", "--issue", "password reset fails", "--repo", repo, "--format", "json", "--output", reportPath, "--no-cache");
if (!plan.ok) throw new Error(`plan failed on ${version}: ${plan.stderr}`);
keep("report.json", reportPath);

fixmap("annotate", "src/auth/reset.ts", "--note", "Keep the email check; support relies on it.", "--owner", "auth-team", "--repo", repo);
keep("annotation-store.json", join(repo, ".fixmap", "annotations.json"));
fixmap("capability", "create", "password-reset", "--name", "Password reset", "--touch", "src/auth/reset.ts", "--repo", repo);
keep("capability-store.json", join(repo, ".fixmap", "capabilities.json"));

writeFileSync(join(repo, "src/auth/reset.ts"), "export function resetPassword(email: string) { return email.trim().includes('@'); }\n");
fixmap("dossier", "create", "--report", reportPath, "--task", "password reset fails", "--working-tree");
fixmap("outcome", "record", "--report", reportPath, "--working-tree", "--status", "succeeded", "--assessment", "human");
const dossiers = join(repo, ".fixmap", "dossiers");
if (existsSync(dossiers)) {
  const first = readdirSync(dossiers).filter((name) => name.endsWith(".json")).sort()[0];
  if (first) keep("change-dossier.json", join(dossiers, first));
}
const outcomes = join(repo, ".fixmap", "outcomes");
if (existsSync(outcomes)) {
  const record = readdirSync(outcomes).filter((name) => name.endsWith(".json")).sort()[0];
  if (record) keep("outcome-record.json", join(outcomes, record));
}
fixmap("policy", "init", "--repo", repo);
keep("architecture-policy.json", join(repo, ".fixmap", "policy.json"));
fixmap("intent", "record", "--repo", repo, "--agent", "agent-a", "--task", "fix reset", "--edit", "src/auth/reset.ts:1-3", "--id", "compat");
keep("agent-intent.json", join(repo, ".fixmap", "intents", "compat.json"));

const config = join(repo, "..", `compat-workspace-${version}-${process.pid}.json`);
writeFileSync(config, JSON.stringify({ workspaceConfigVersion: 1, workspace: "compat", repositories: [{ id: "app", path: repo }] }));
const workspaceMap = join(repo, "..", `compat-map-${version}-${process.pid}.json`);
if (fixmap("workspace", "--config", config, "--format", "json", "--output", workspaceMap, "--no-cache").ok) keep("workspace-map.json", workspaceMap);

for (const path of [reportPath, config, workspaceMap]) rmSync(path, { force: true });
rmSync(repo, { recursive: true, force: true, maxRetries: 5 });
console.log(`${version}: ${written.join(", ")}`);
