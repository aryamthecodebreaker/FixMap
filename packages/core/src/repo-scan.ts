import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { FixMapInput, PackageScript, RepoFile, RepoMap } from "./types.js";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", ".next", "coverage"]);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".go",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /(^|\/|\\)__tests__(\/|\\)/, /(^|\/|\\)tests?(\/|\\)/];
const MAX_TEXT_SAMPLE_BYTES = 64_000;
const exec = promisify(execFile);

export async function scanRepo(input: Pick<FixMapInput, "repoRoot" | "baseRef" | "headRef" | "diffSpec">): Promise<RepoMap> {
  const files = await walkFiles(input.repoRoot, input.repoRoot);
  const packageScripts = await readPackageScripts(input.repoRoot);
  const changedFiles = await readChangedFiles(input);

  return {
    root: input.repoRoot,
    files,
    packageScripts,
    changedFiles
  };
}

async function walkFiles(root: string, current: string): Promise<RepoFile[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const results: RepoFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      results.push(...await walkFiles(root, join(current, entry.name)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    const relativePath = normalizePath(relative(root, absolutePath));
    const fileStat = await stat(absolutePath);
    const extension = extname(entry.name);
    const isSource = SOURCE_EXTENSIONS.has(extension);

    results.push({
      path: relativePath,
      extension,
      sizeBytes: fileStat.size,
      isTest: TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
      isSource,
      textSample: isSource ? await readTextSample(absolutePath, fileStat.size) : ""
    });
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function readPackageScripts(root: string): Promise<PackageScript[]> {
  try {
    const raw = await readFile(join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({ name, command }));
  } catch {
    return [];
  }
}

async function readChangedFiles(input: Pick<FixMapInput, "repoRoot" | "baseRef" | "headRef" | "diffSpec">): Promise<string[]> {
  const diffSpec = input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : undefined);

  if (!diffSpec) {
    return [];
  }

  try {
    const { stdout } = await exec("git", ["diff", "--name-only", diffSpec], { cwd: input.repoRoot });
    return stdout
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map(normalizePath)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function readTextSample(path: string, sizeBytes: number): Promise<string> {
  if (sizeBytes > MAX_TEXT_SAMPLE_BYTES) {
    return "";
  }

  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
