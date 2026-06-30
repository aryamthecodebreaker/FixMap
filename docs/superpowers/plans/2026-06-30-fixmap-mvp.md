# FixMap MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable FixMap MVP: a local CLI that maps an issue or diff to relevant files, likely tests, risk notes, and markdown/JSON output, plus a GitHub Action wrapper and Vercel-ready docs site.

**Architecture:** Start with a transparent deterministic baseline before adding trainable ranking. The core package scans a repository, extracts lightweight features, ranks files/tests, and renders reports. The GitHub Action calls the same CLI so local and CI behavior stay consistent.

**Tech Stack:** Node.js, TypeScript, npm workspaces, Vitest, esbuild, GitHub Actions, Next.js for the Vercel docs/playground.

---

## Scope

This plan deliberately avoids building a chatbot. FixMap's first useful product is a repo-routing and verification assistant for AI coding workflows.

The MVP must work without GPUs, external APIs, databases, paid services, or hosted model inference. The first release can use a deterministic ranker. The training command can ship after the CLI and report format are stable.

Review corrections before implementation:

- The private workspace root is named `fixmap-workspace`; the public CLI package keeps the `fixmap` name.
- Builds run in explicit dependency order: core, CLI, action bundle, then web.
- The CLI and scanner include real diff support through `--diff`, `--base`, and `--head`; changed files are not stubbed.
- The baseline ranker uses path overlap, content overlap, changed-file signals, and nearby test matching.
- The GitHub Action is bundled with esbuild into `packages/action/dist/index.mjs` so consumers can use it without installing dependencies at runtime.

## File Structure

- Create `package.json`: npm workspace root and shared scripts
- Create `tsconfig.base.json`: shared TypeScript compiler settings
- Create `.gitignore`: Node, build, coverage, and local env ignores
- Create `.github/workflows/ci.yml`: test and typecheck workflow
- Create `packages/core/package.json`: core scanner/ranker/report package
- Create `packages/core/src/index.ts`: public exports
- Create `packages/core/src/types.ts`: shared domain types
- Create `packages/core/src/repo-scan.ts`: filesystem, package script, git diff, content sample, and test discovery
- Create `packages/core/src/signals.ts`: prompt/diff tokenization and feature extraction
- Create `packages/core/src/rank.ts`: transparent baseline ranker
- Create `packages/core/src/report.ts`: markdown and JSON report rendering
- Create `packages/core/test/*.test.ts`: focused unit tests for scanner, ranker, and report output
- Create `packages/cli/package.json`: executable CLI package
- Create `packages/cli/src/cli.ts`: argument parsing and command dispatch
- Create `packages/action/action.yml`: GitHub Action metadata for `uses: aryamthecodebreaker/FixMap/packages/action@v0`
- Create `packages/action/src/index.ts`: Action entrypoint that calls the core package
- Create `packages/action/dist/index.mjs`: bundled action artifact built with esbuild
- Create `apps/web/package.json`: Vercel docs/playground app
- Create `apps/web/tsconfig.json`: Next.js TypeScript config
- Create `apps/web/next-env.d.ts`: Next.js generated type reference
- Create `apps/web/app/page.tsx`: product landing and demo surface
- Create `apps/web/app/layout.tsx`: app shell metadata
- Create `apps/web/app/globals.css`: restrained product UI styling

## Milestone 1: Repository Bootstrap

### Task 1: Add Workspace Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create root package metadata**

Create `package.json`:

```json
{
  "name": "fixmap-workspace",
  "version": "0.0.0",
  "private": true,
  "description": "Repo context, test routing, and review receipts for AI-assisted development.",
  "license": "MIT",
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build": "npm run build:core && npm run build:cli && npm run build:action && npm run build:web",
    "build:core": "npm run build -w @fixmap/core",
    "build:cli": "npm run build -w fixmap",
    "build:action": "esbuild packages/action/src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=packages/action/dist/index.mjs",
    "build:web": "npm run build -w @fixmap/web",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.11"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "esbuild": "^0.23.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- [ ] **Step 3: Add ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
!packages/action/dist/
!packages/action/dist/**
.next/
coverage/
.env
.env.*
!.env.example
*.tsbuildinfo
fixmap-report.json
fixmap-report.md
```

- [ ] **Step 4: Add CI**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 5: Verify bootstrap**

Run: `npm install`

Expected: npm creates `package-lock.json` with no install errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .github/workflows/ci.yml
git commit -m "chore: bootstrap fixmap workspace"
```

## Milestone 2: Core Repo Scanner

### Task 2: Define Core Types

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create core package metadata**

Create `packages/core/package.json`:

```json
{
  "name": "@fixmap/core",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 2: Create core TypeScript config**

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create domain types**

Create `packages/core/src/types.ts`:

```ts
export type FixMapInput = {
  repoRoot: string;
  issueText?: string | undefined;
  diffText?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  diffSpec?: string | undefined;
};

export type RepoFile = {
  path: string;
  extension: string;
  sizeBytes: number;
  isTest: boolean;
  isSource: boolean;
  textSample: string;
};

export type PackageScript = {
  name: string;
  command: string;
};

export type RepoMap = {
  root: string;
  files: RepoFile[];
  packageScripts: PackageScript[];
  changedFiles: string[];
};

export type RankedFile = {
  path: string;
  score: number;
  reasons: string[];
};

export type TestRoute = {
  command: string;
  reason: string;
  relatedFiles: string[];
};

export type RiskNote = {
  area: string;
  reason: string;
  severity: "low" | "medium" | "high";
};

export type FixMapReport = {
  summary: string;
  contextFiles: RankedFile[];
  testRoutes: TestRoute[];
  risks: RiskNote[];
  changedFiles: string[];
};
```

- [ ] **Step 4: Export public API surface**

Create `packages/core/src/index.ts`:

```ts
export type {
  FixMapInput,
  FixMapReport,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute
} from "./types.js";
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck -w @fixmap/core`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat: define fixmap core types"
```

### Task 3: Implement Repo Scanning

**Files:**
- Create: `packages/core/src/repo-scan.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/repo-scan.test.ts`

- [ ] **Step 1: Write scanner tests**

Create `packages/core/test/repo-scan.test.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../src/repo-scan.js";

const exec = promisify(execFile);

describe("scanRepo", () => {
  it("discovers source files, test files, and package scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-scan-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "test"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({
      scripts: {
        test: "vitest run",
        typecheck: "tsc --noEmit"
      }
    }));
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await writeFile(join(root, "test", "login.test.ts"), "import '../src/login';\n");

    const repo = await scanRepo({ repoRoot: root });

    expect(repo.files.map((file) => file.path).sort()).toEqual([
      "package.json",
      "src/login.ts",
      "test/login.test.ts"
    ]);
    expect(repo.files.find((file) => file.path === "test/login.test.ts")?.isTest).toBe(true);
    expect(repo.files.find((file) => file.path === "src/login.ts")?.textSample).toContain("login");
    expect(repo.packageScripts).toEqual([
      { name: "test", command: "vitest run" },
      { name: "typecheck", command: "tsc --noEmit" }
    ]);
  });

  it("discovers changed files from a git diff spec", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-diff-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => true;\n");
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Test User"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    await exec("git", ["checkout", "-b", "change-login"], { cwd: root });
    await writeFile(join(root, "src", "login.ts"), "export const login = () => false;\n");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "change login"], { cwd: root });

    const repo = await scanRepo({ repoRoot: root, diffSpec: "main...HEAD" });

    expect(repo.changedFiles).toEqual(["src/login.ts"]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -w @fixmap/core -- repo-scan.test.ts`

Expected: FAIL because `repo-scan.js` does not exist.

- [ ] **Step 3: Implement scanner**

Create `packages/core/src/repo-scan.ts`:

```ts
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { FixMapInput, PackageScript, RepoFile, RepoMap } from "./types.js";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", ".next", "coverage"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rs"]);
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
```

- [ ] **Step 4: Export scanner**

Modify `packages/core/src/index.ts`:

```ts
export { scanRepo } from "./repo-scan.js";
export type {
  FixMapInput,
  FixMapReport,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute
} from "./types.js";
```

- [ ] **Step 5: Verify scanner**

Run: `npm test -w @fixmap/core -- repo-scan.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat: scan repository files and scripts"
```

## Milestone 3: Ranking And Reports

### Task 4: Add Signals And Baseline Ranker

**Files:**
- Create: `packages/core/src/signals.ts`
- Create: `packages/core/src/rank.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/rank.test.ts`

- [ ] **Step 1: Write ranker test**

Create `packages/core/test/rank.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rankContextFiles } from "../src/rank.js";
import type { RepoMap } from "../src/types.js";

describe("rankContextFiles", () => {
  it("prioritizes files whose paths overlap the issue text and changed files", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: ["src/auth/reset-password.ts"],
      files: [
        { path: "src/auth/reset-password.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, textSample: "export function resetPassword() {}" },
        { path: "src/billing/invoice.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, textSample: "export function invoice() {}" },
        { path: "test/auth/reset-password.test.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: true, textSample: "describe('reset password')" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "password reset fails for auth users",
      diffText: ""
    });

    expect(ranked[0]?.path).toBe("src/auth/reset-password.ts");
    expect(ranked[0]?.reasons).toContain("changed file");
  });

  it("uses file content when the path does not contain the task terms", () => {
    const repo: RepoMap = {
      root: "/repo",
      packageScripts: [],
      changedFiles: [],
      files: [
        { path: "src/services/UserAccount.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false, textSample: "export async function sendPasswordResetEmail() {}" },
        { path: "src/ui/Button.tsx", extension: ".tsx", sizeBytes: 100, isSource: true, isTest: false, textSample: "export function Button() {}" }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "password reset email fails"
    });

    expect(ranked[0]?.path).toBe("src/services/UserAccount.ts");
    expect(ranked[0]?.reasons.some((reason) => reason.startsWith("content matches task terms"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -w @fixmap/core -- rank.test.ts`

Expected: FAIL because `rank.js` does not exist.

- [ ] **Step 3: Implement signal extraction**

Create `packages/core/src/signals.ts`:

```ts
const TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;

export type TaskSignals = {
  tokens: Set<string>;
  changedFiles: Set<string>;
};

export function extractTaskSignals(input: {
  issueText?: string | undefined;
  diffText?: string | undefined;
  changedFiles?: string[];
}): TaskSignals {
  const tokens = tokenizeText([input.issueText ?? "", input.diffText ?? ""].join("\n"));

  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? [])
  };
}

export function tokenizeText(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

export function tokenizePath(path: string): Set<string> {
  return tokenizeText(path);
}
```

- [ ] **Step 4: Implement ranker**

Create `packages/core/src/rank.ts`:

```ts
import { extractTaskSignals, tokenizePath, tokenizeText } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

export function rankContextFiles(
  repo: RepoMap,
  input: { issueText?: string; diffText?: string },
  limit = 12
): RankedFile[] {
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });

  return repo.files
    .filter((file) => file.isSource && !file.isTest)
    .map((file) => {
      const reasons: string[] = [];
      let score = 0;

      if (signals.changedFiles.has(file.path)) {
        score += 10;
        reasons.push("changed file");
      }

      const pathTokens = tokenizePath(file.path);
      const overlap = [...pathTokens].filter((token) => signals.tokens.has(token));
      if (overlap.length > 0) {
        score += overlap.length * 3;
        reasons.push(`path matches task terms: ${overlap.join(", ")}`);
      }

      const contentTokens = tokenizeText(file.textSample);
      const contentOverlap = [...contentTokens].filter((token) => signals.tokens.has(token));
      if (contentOverlap.length > 0) {
        score += Math.min(contentOverlap.length, 8) * 2;
        reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
      }

      if (pathTokens.has("auth") || pathTokens.has("login")) {
        if (signals.tokens.has("auth") || signals.tokens.has("login") || signals.tokens.has("password")) {
          score += 2;
          reasons.push("auth-related task signal");
        }
      }

      return {
        path: file.path,
        score,
        reasons: reasons.length > 0 ? reasons : ["source file baseline"]
      };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}
```

- [ ] **Step 5: Export ranker**

Modify `packages/core/src/index.ts`:

```ts
export { rankContextFiles } from "./rank.js";
export { scanRepo } from "./repo-scan.js";
export type {
  FixMapInput,
  FixMapReport,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute
} from "./types.js";
```

- [ ] **Step 6: Verify ranker**

Run: `npm test -w @fixmap/core -- rank.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat: rank context files from task signals"
```

### Task 5: Add Test Routing And Report Rendering

**Files:**
- Create: `packages/core/src/report.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/report.test.ts`

- [ ] **Step 1: Write report test**

Create `packages/core/test/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderMarkdownReport } from "../src/report.js";
import type { FixMapReport } from "../src/types.js";

describe("renderMarkdownReport", () => {
  it("renders context files, test routes, and risks", () => {
    const report: FixMapReport = {
      summary: "FixMap found 1 context file and 1 likely test route.",
      changedFiles: ["src/auth/reset-password.ts"],
      contextFiles: [
        { path: "src/auth/reset-password.ts", score: 13, reasons: ["changed file"] }
      ],
      testRoutes: [
        { command: "npm test", reason: "package script named test", relatedFiles: ["test/auth/reset-password.test.ts"] }
      ],
      risks: [
        { area: "authentication", severity: "high", reason: "auth-related files are affected" }
      ]
    };

    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("# FixMap Report");
    expect(markdown).toContain("src/auth/reset-password.ts");
    expect(markdown).toContain("npm test");
    expect(markdown).toContain("authentication");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @fixmap/core -- report.test.ts`

Expected: FAIL because `report.js` does not exist.

- [ ] **Step 3: Implement report rendering**

Create `packages/core/src/report.ts`:

```ts
import { tokenizePath } from "./signals.js";
import type { FixMapReport, RepoMap, RiskNote, TestRoute } from "./types.js";

export function buildTestRoutes(repo: RepoMap, contextPaths: string[]): TestRoute[] {
  const relatedTests = findRelatedTests(repo, contextPaths);
  const routes: TestRoute[] = [];
  const testScript = repo.packageScripts.find((script) => script.name === "test");
  const typecheckScript = repo.packageScripts.find((script) => script.name === "typecheck");

  if (testScript) {
    routes.push({
      command: `npm run ${testScript.name}`,
      reason: relatedTests.length > 0 ? "package script named test; related tests ranked by path overlap" : "package script named test",
      relatedFiles: relatedTests
    });
  }

  if (typecheckScript) {
    routes.push({
      command: `npm run ${typecheckScript.name}`,
      reason: "package script named typecheck",
      relatedFiles: contextPaths
    });
  }

  return routes;
}

export function buildRiskNotes(contextPaths: string[]): RiskNote[] {
  const risks: RiskNote[] = [];
  const tokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));

  if (tokens.has("auth") || tokens.has("login") || tokens.has("password")) {
    risks.push({
      area: "authentication",
      severity: "high",
      reason: "authentication-related files are affected"
    });
  }

  if (tokens.has("billing") || tokens.has("payment") || tokens.has("invoice")) {
    risks.push({
      area: "billing",
      severity: "high",
      reason: "billing or payment-related files are affected"
    });
  }

  return risks;
}

function findRelatedTests(repo: RepoMap, contextPaths: string[]): string[] {
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));

  return repo.files
    .filter((file) => file.isTest)
    .map((file) => {
      const testTokens = tokenizePath(file.path);
      const overlap = [...testTokens].filter((token) => contextTokens.has(token)).length;
      return { path: file.path, score: overlap };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 8)
    .map((file) => file.path);
}

export function renderMarkdownReport(report: FixMapReport): string {
  const lines = [
    "# FixMap Report",
    "",
    report.summary,
    "",
    "## Context Files",
    "",
    ...report.contextFiles.map((file) => `- \`${file.path}\` (${file.score}): ${file.reasons.join("; ")}`),
    "",
    "## Test Route",
    "",
    ...report.testRoutes.map((route) => `- \`${route.command}\`: ${route.reason}`),
    "",
    "## Risk Map",
    "",
    ...report.risks.map((risk) => `- **${risk.severity}** ${risk.area}: ${risk.reason}`),
    "",
    "## Changed Files",
    "",
    ...report.changedFiles.map((path) => `- \`${path}\``)
  ];

  return `${lines.join("\n")}\n`;
}

export function renderJsonReport(report: FixMapReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
```

- [ ] **Step 4: Export report helpers**

Modify `packages/core/src/index.ts`:

```ts
export { rankContextFiles } from "./rank.js";
export { buildRiskNotes, buildTestRoutes, renderJsonReport, renderMarkdownReport } from "./report.js";
export { scanRepo } from "./repo-scan.js";
export type {
  FixMapInput,
  FixMapReport,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute
} from "./types.js";
```

- [ ] **Step 5: Verify reports**

Run:

```bash
npm test -w @fixmap/core -- report.test.ts
npm run build:core
```

Expected: tests pass and `packages/core/dist/index.js` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat: render fixmap reports"
```

## Milestone 4: CLI

### Task 6: Add `fixmap plan` CLI

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/cli.ts`

- [ ] **Step 1: Create CLI package**

Create `packages/cli/package.json`:

```json
{
  "name": "fixmap",
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "fixmap": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fixmap/core": "0.0.0"
  }
}
```

- [ ] **Step 2: Create CLI TypeScript config**

Create `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Implement CLI command**

Create `packages/cli/src/cli.ts`:

```ts
#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildRiskNotes,
  buildTestRoutes,
  rankContextFiles,
  renderJsonReport,
  renderMarkdownReport,
  scanRepo
} from "@fixmap/core";
import type { FixMapReport } from "@fixmap/core";

type CliOptions = {
  command: string;
  issueText: string;
  repoRoot: string;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  format: "markdown" | "json";
  output?: string;
};

const options = parseArgs(process.argv.slice(2));

if (options.command !== "plan") {
  console.error("Usage: fixmap plan --issue \"...\" [--diff main...HEAD] [--base main --head HEAD] [--repo .] [--format markdown|json] [--output file]");
  process.exit(1);
}

if (!options.issueText && !options.diffSpec && !options.baseRef) {
  console.error("Provide --issue, --diff, or --base/--head so FixMap has a task signal.");
  process.exit(1);
}

const repo = await scanRepo({
  repoRoot: options.repoRoot,
  diffSpec: options.diffSpec,
  baseRef: options.baseRef,
  headRef: options.headRef
});
const contextFiles = rankContextFiles(repo, {
  issueText: options.issueText,
  diffText: options.diffSpec ?? [options.baseRef, options.headRef].filter(Boolean).join(" ")
});
const contextPaths = contextFiles.map((file) => file.path);
const testRoutes = buildTestRoutes(repo, contextPaths);
const report: FixMapReport = {
  summary: `FixMap found ${contextFiles.length} context files and generated ${testRoutes.length} test routes.`,
  contextFiles,
  testRoutes,
  risks: buildRiskNotes(contextPaths),
  changedFiles: repo.changedFiles
};

const rendered = options.format === "json" ? renderJsonReport(report) : renderMarkdownReport(report);

if (options.output) {
  await writeFile(options.output, rendered, "utf8");
} else {
  process.stdout.write(rendered);
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0] ?? "";
  let issueText = "";
  let repoRoot = process.cwd();
  let diffSpec: string | undefined;
  let baseRef: string | undefined;
  let headRef: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--issue" && value) {
      issueText = value;
      index += 1;
    } else if (arg === "--diff" && value) {
      diffSpec = value;
      index += 1;
    } else if (arg === "--base" && value) {
      baseRef = value;
      index += 1;
    } else if (arg === "--head" && value) {
      headRef = value;
      index += 1;
    } else if (arg === "--repo" && value) {
      repoRoot = resolve(value);
      index += 1;
    } else if (arg === "--format" && (value === "markdown" || value === "json")) {
      format = value;
      index += 1;
    } else if (arg === "--output" && value) {
      output = value;
      index += 1;
    }
  }

  return {
    command,
    issueText,
    repoRoot,
    diffSpec,
    baseRef,
    headRef,
    format,
    output
  };
}
```

- [ ] **Step 4: Build CLI**

Run: `npm run build:core && npm run build:cli`

Expected: PASS and creates `packages/cli/dist/cli.js`.

- [ ] **Step 5: Smoke test CLI**

Run: `node packages/cli/dist/cli.js plan --issue "password reset fails" --diff main...HEAD --repo .`

Expected: command prints a `# FixMap Report` markdown document.

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "feat: add fixmap plan cli"
```

## Milestone 5: GitHub Action

### Task 7: Add Pull Request Action Wrapper

**Files:**
- Create: `packages/action/action.yml`
- Create: `packages/action/src/index.ts`
- Create: `packages/action/dist/index.mjs`

- [ ] **Step 1: Create action metadata**

Create `packages/action/action.yml`:

```yaml
name: FixMap
description: Map pull request changes to context files, test routes, and review risks.
inputs:
  issue:
    description: Issue, prompt, or review context for FixMap.
    required: false
    default: Pull request review
  diff:
    description: Git diff spec, such as main...HEAD.
    required: false
  base:
    description: Base ref for diffing when diff is not provided.
    required: false
  head:
    description: Head ref for diffing when diff is not provided.
    required: false
  format:
    description: Output format.
    required: false
    default: markdown
  github-token:
    description: Token used to upsert a pull request comment. If omitted, FixMap only writes the step summary.
    required: false
runs:
  using: node20
  main: dist/index.mjs
```

- [ ] **Step 2: Create bundled action source**

Create `packages/action/src/index.ts`:

```ts
import { appendFileSync, readFileSync } from "node:fs";
import {
  buildRiskNotes,
  buildTestRoutes,
  rankContextFiles,
  renderMarkdownReport,
  scanRepo
} from "@fixmap/core";
import type { FixMapReport } from "@fixmap/core";

const issue = process.env.INPUT_ISSUE || "Pull request review";
const targetRepo = process.cwd();
const diffSpec = process.env.INPUT_DIFF || undefined;
const baseRef = process.env.INPUT_BASE || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined);
const headRef = process.env.INPUT_HEAD || (process.env.GITHUB_HEAD_REF ? "HEAD" : undefined);

const repo = await scanRepo({
  repoRoot: targetRepo,
  diffSpec,
  baseRef,
  headRef
});
const contextFiles = rankContextFiles(repo, {
  issueText: issue,
  diffText: diffSpec ?? [baseRef, headRef].filter(Boolean).join(" ")
});
const contextPaths = contextFiles.map((file) => file.path);
const testRoutes = buildTestRoutes(repo, contextPaths);
const report: FixMapReport = {
  summary: `FixMap found ${contextFiles.length} context files and generated ${testRoutes.length} test routes.`,
  contextFiles,
  testRoutes,
  risks: buildRiskNotes(contextPaths),
  changedFiles: repo.changedFiles
};
const markdown = renderMarkdownReport(report);

process.stdout.write(markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

const token = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
if (token) {
  await upsertPullRequestComment(token, markdown);
}

async function upsertPullRequestComment(token: string, markdown: string): Promise<void> {
  if (!process.env.GITHUB_EVENT_PATH || !process.env.GITHUB_REPOSITORY) {
    return;
  }

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) as {
    pull_request?: { number?: number };
  };
  const issueNumber = event.pull_request?.number;
  if (!issueNumber) {
    return;
  }

  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repo) {
    return;
  }

  const marker = "<!-- fixmap-report -->";
  const body = `${marker}\n${markdown}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28"
  };
  const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const commentsResponse = await fetch(commentsUrl, { headers });
  const comments = await commentsResponse.json() as Array<{ id: number; body?: string }>;
  const existing = Array.isArray(comments)
    ? comments.find((comment) => comment.body?.includes(marker))
    : undefined;

  if (existing) {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body })
    });
    return;
  }

  await fetch(commentsUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ body })
  });
}
```

- [ ] **Step 3: Bundle the action**

Run: `npm run build:core && npm run build:action`

Expected: PASS and `packages/action/dist/index.mjs` exists.

- [ ] **Step 4: Local action smoke**

Run:

```bash
node packages/action/dist/index.mjs
```

Expected: command prints a `# FixMap Report` markdown document and does not require a GitHub token locally.

- [ ] **Step 5: Commit**

```bash
git add packages/action/src packages/action/dist packages/action/action.yml
git commit -m "feat: add github action wrapper"
```

## Milestone 6: Vercel Web Surface

### Task 8: Add Minimal Website And Playground Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`

- [ ] **Step 1: Create web package metadata**

Create `apps/web/package.json`:

```json
{
  "name": "@fixmap/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create web TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "incremental": true,
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `apps/web/next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is required by Next.js TypeScript projects.
```

- [ ] **Step 3: Create Next config**

Create `apps/web/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Create layout**

Create `apps/web/app/layout.tsx`:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FixMap",
  description: "Repo context, test routing, and review receipts for AI-assisted development."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create first page**

Create `apps/web/app/page.tsx`:

```tsx
const sampleReport = `# FixMap Report

FixMap found 3 context files and generated 2 test routes.

## Context Files

- src/auth/reset-password.ts
- src/auth/session.ts
- test/auth/reset-password.test.ts

## Test Route

- npm run test
- npm run typecheck`;

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Open-source repo intelligence for AI-assisted development</p>
        <h1>Help coding agents read the right files and run the right checks.</h1>
        <p className="lede">
          FixMap turns issues, diffs, and pull requests into context packs, test routes, risk maps, and review receipts.
        </p>
        <div className="actions">
          <a href="https://github.com/aryamthecodebreaker/FixMap">GitHub</a>
          <a href="#demo">View demo</a>
        </div>
      </section>
      <section id="demo" className="demo">
        <div>
          <h2>Designed for solo devs and maintainers</h2>
          <p>
            Use FixMap before handing work to an AI tool, or run it in GitHub Actions to make AI-generated PRs easier to review.
          </p>
        </div>
        <pre>{sampleReport}</pre>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Create global styles**

Create `apps/web/app/globals.css`:

```css
:root {
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
  color: #171717;
  background: #f7f5ef;
}

body {
  margin: 0;
}

.page {
  min-height: 100vh;
}

.hero,
.demo {
  max-width: 1120px;
  margin: 0 auto;
  padding: 72px 24px;
}

.eyebrow {
  color: #28655a;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  max-width: 840px;
  margin: 0;
  font-size: 64px;
  line-height: 1.02;
}

.lede {
  max-width: 720px;
  font-size: 22px;
  line-height: 1.5;
  color: #3f3f3f;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.actions a {
  border: 1px solid #171717;
  color: #171717;
  padding: 10px 14px;
  text-decoration: none;
}

.demo {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 32px;
}

.demo pre {
  overflow: auto;
  background: #101514;
  color: #f4f0e6;
  padding: 24px;
  border-radius: 8px;
}

@media (max-width: 760px) {
  h1 {
    font-size: 42px;
  }

  .demo {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Build web app**

Run: `npm run build -w @fixmap/web`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat: add fixmap web surface"
```

## Milestone 7: Release Readiness

### Task 9: Final Verification And Documentation Update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full validation**

Run:

```bash
npm run typecheck
npm test
npm run build
node packages/cli/dist/cli.js plan --issue "password reset fails" --diff main...HEAD --repo . --output fixmap-report.md
```

Expected: typecheck, tests, and build pass. The CLI writes `fixmap-report.md`.

- [ ] **Step 2: Update README status**

Modify `README.md` status section:

```md
## Status

FixMap is in early MVP development. The CLI can scan a JavaScript or TypeScript repository and produce a context/test/risk report from a prompt or diff.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update mvp status"
```

## Approval Gate

Stop here before implementation. The next coding step is Task 1, but it should not start until Aryam approves this plan or requests changes.

## Self-Review

- Spec coverage: README and plan cover the product promise, solo developer flow, maintainer flow, local CLI, diff support, GitHub Action, Vercel website, and CPU-only/no-paid-service constraint.
- Placeholder scan: no unresolved placeholders are intentionally left in the plan.
- Type consistency: shared types are defined before scanner, ranker, report, CLI, and action tasks use them. Optional input types are compatible with `exactOptionalPropertyTypes`.
- Scope check: the MVP is narrow enough to ship; trainable ranking is named as a later enhancement after deterministic ranking works.
