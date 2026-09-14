import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  buildFixMapAnalysis,
  scanRepo,
  validateFixMapReport
} from "../packages/core/dist/index.js";

const exec = promisify(execFile);
const MCP_WIRE_TIMEOUT_MS = process.platform === "win32" ? 30_000 : 10_000;
const root = await mkdtemp(join(tmpdir(), "fixmap-v0100-stress-repo-"));
const cacheRoot = await mkdtemp(join(tmpdir(), "fixmap-v0100-stress-cache-"));
const outside = await mkdtemp(join(tmpdir(), "fixmap-v0100-stress-outside-"));
const previousCache = process.env.FIXMAP_CACHE_DIR;
const summary = {
  files: 0,
  concurrentAnalyses: 0,
  coldConcurrentMs: 0,
  warmMs: 0,
  cacheRecovery: false,
  artifactIsolation: false,
  linkContainment: false,
  mcpPreinitialize: false,
  mcpParseError: false
};

try {
  process.env.FIXMAP_CACHE_DIR = cacheRoot;
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "test"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "stress", scripts: { test: "node --test" } }));
  await Promise.all(Array.from({ length: 300 }, (_, index) => writeFile(
    join(root, "src", `module-${index}.ts`),
    index === 123
      ? "export function targetStressIdentifier() { return 123; }\n"
      : `export const module${index} = ${index};\n`
  )));
  await writeFile(
    join(root, "test", "module-123.test.ts"),
    "import { targetStressIdentifier } from '../src/module-123'; test('target', () => targetStressIdentifier());\n"
  );
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Stress"], { cwd: root });
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", "stress fixture"], { cwd: root });

  const started = performance.now();
  const analyses = await Promise.all(Array.from({ length: 4 }, () => buildFixMapAnalysis({
    repoRoot: root,
    issueText: "targetStressIdentifier returns the wrong value",
    useCache: true,
    includeHistory: false
  })));
  summary.coldConcurrentMs = Math.round(performance.now() - started);
  summary.concurrentAnalyses = analyses.length;
  for (const analysis of analyses) {
    assert(analysis.report.contextFiles[0]?.path === "src/module-123.ts", "concurrent ranking did not select the planted target");
    assert(validateFixMapReport(analysis.report, "stress report").success, "concurrent analysis returned an invalid report");
  }
  const signatures = new Set(analyses.map((analysis) => JSON.stringify({
    context: analysis.report.contextFiles.map((entry) => entry.path),
    tests: analysis.report.testRoutes.map((entry) => ({ command: entry.command, files: entry.relatedFiles }))
  })));
  assert(signatures.size === 1, "concurrent analyses were not deterministic");
  summary.files = analyses[0].repo.files.length;

  const warmStarted = performance.now();
  const warm = await buildFixMapAnalysis({
    repoRoot: root,
    issueText: "targetStressIdentifier returns the wrong value",
    useCache: true,
    includeHistory: false
  });
  summary.warmMs = Math.round(performance.now() - warmStarted);
  assert(warm.report.diagnostics.some((entry) => entry.code === "cache-hit"), "exact-state warm scan did not hit cache");
  assert(summary.warmMs < summary.coldConcurrentMs, "exact-state warm scan was not faster than the concurrent cold population");

  const indexName = (await readdir(cacheRoot)).find((entry) => entry.endsWith("-index-v2.json"));
  assert(indexName, "persistent incremental index was not created");
  await writeFile(join(cacheRoot, indexName), "{broken");
  await writeFile(join(root, "src", "module-123.ts"), "export function targetStressIdentifier() { return 124; }\n");
  const recovered = await buildFixMapAnalysis({
    repoRoot: root,
    issueText: "targetStressIdentifier returns the wrong value",
    useCache: true,
    includeHistory: false
  });
  assert(recovered.repo.files.find((file) => file.path === "src/module-123.ts")?.textSample.includes("124"), "corrupt index recovery served stale source");
  JSON.parse(await readFile(join(cacheRoot, indexName), "utf8"));
  summary.cacheRecovery = true;

  await writeFile(join(root, "saved-report.json"), JSON.stringify(analyses[0].report));
  const isolated = await buildFixMapAnalysis({
    repoRoot: root,
    issueText: "targetStressIdentifier returns the wrong value",
    workingTree: true,
    includeUntracked: true,
    useCache: false,
    includeHistory: false
  });
  assert(!isolated.repo.files.some((file) => file.path === "saved-report.json"), "saved FixMap report remained in the analysis file snapshot");
  assert(!isolated.report.changedFiles.includes("saved-report.json"), "saved FixMap report remained in changed files");
  summary.artifactIsolation = true;

  await writeFile(join(outside, "secret.ts"), "export const shouldNeverBeScanned = true;\n");
  await symlink(outside, join(root, "linked-outside"), process.platform === "win32" ? "junction" : "dir");
  const linked = await scanRepo({ repoRoot: root, useCache: false, includeHistory: false });
  assert(!linked.files.some((file) => file.path.includes("shouldNeverBeScanned") || file.textSample.includes("shouldNeverBeScanned")), "scanner followed a linked directory outside the repository");
  summary.linkContainment = true;

  const cli = resolve("packages", "cli", "dist", "cli.js");
  const preinitialize = JSON.parse((await runMcp(cli, '{"jsonrpc":"2.0","id":9,"method":"tools/list"}\n')).trim());
  assert(preinitialize.error?.code === -32002, "MCP pre-initialize request did not return -32002");
  summary.mcpPreinitialize = true;
  const parseError = JSON.parse((await runMcp(cli, "{bad json\n")).trim());
  assert(parseError.error?.code === -32700 && parseError.id === null, "MCP malformed JSON did not return -32700 with null id");
  summary.mcpParseError = true;

  console.log(JSON.stringify({ stressVersion: 1, passed: true, ...summary }, null, 2));
} finally {
  if (previousCache === undefined) delete process.env.FIXMAP_CACHE_DIR;
  else process.env.FIXMAP_CACHE_DIR = previousCache;
  await removeStressDirectory(root);
  await removeStressDirectory(cacheRoot);
  await removeStressDirectory(outside);
}

function assert(condition, message) {
  if (!condition) throw new Error(`v0.10 stress failure: ${message}`);
}

function runMcp(cli, input) {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(process.execPath, [cli, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("v0.10 stress failure: MCP wire smoke timed out"));
    }, MCP_WIRE_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`v0.10 stress failure: MCP exited ${code}: ${Buffer.concat(stderr).toString("utf8")}`));
      else resolveOutput(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(input);
  });
}

async function removeStressDirectory(path) {
  const temporaryRoot = resolve(tmpdir());
  const target = resolve(path);
  const distance = relative(temporaryRoot, target);
  if (!distance || distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance) ||
    !distance.split(/[\\/]/)[0]?.startsWith("fixmap-v0100-stress-")) {
    throw new Error(`Refusing to remove non-stress path ${target}`);
  }
  await rm(target, { recursive: true, force: true });
}
