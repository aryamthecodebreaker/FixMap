# FixMap MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable FixMap MVP: a local CLI that maps an issue or diff to relevant files, likely tests, risk notes, and markdown/JSON output, plus a GitHub Action wrapper and Vercel-ready docs site.

**Architecture:** Start with a transparent deterministic baseline before adding trainable ranking. The core package scans a repository, extracts lightweight features, ranks files/tests, and renders reports. The GitHub Action calls the same CLI so local and CI behavior stay consistent.

**Tech Stack:** Node.js, TypeScript, npm workspaces, Vitest, tsx, esbuild/tsup, GitHub Actions, Next.js for the Vercel docs/playground.

---

## Scope

This plan deliberately avoids building a chatbot. FixMap's first useful product is a repo-routing and verification assistant for AI coding workflows.

The MVP must work without GPUs, external APIs, databases, paid services, or hosted model inference. The first release can use a deterministic ranker. The training command can ship after the CLI and report format are stable.

## File Structure

- Create `package.json`: npm workspace root and shared scripts
- Create `tsconfig.base.json`: shared TypeScript compiler settings
- Create `.gitignore`: Node, build, coverage, and local env ignores
- Create `.github/workflows/ci.yml`: test and typecheck workflow
- Create `packages/core/package.json`: core scanner/ranker/report package
- Create `packages/core/src/index.ts`: public exports
- Create `packages/core/src/types.ts`: shared domain types
- Create `packages/core/src/repo-scan.ts`: filesystem, package script, git, and test discovery
- Create `packages/core/src/signals.ts`: prompt/diff tokenization and feature extraction
- Create `packages/core/src/rank.ts`: transparent baseline ranker
- Create `packages/core/src/report.ts`: markdown and JSON report rendering
- Create `packages/core/test/*.test.ts`: focused unit tests for scanner, ranker, and report output
- Create `packages/cli/package.json`: executable CLI package
- Create `packages/cli/src/cli.ts`: argument parsing and command dispatch
- Create `packages/action/action.yml`: GitHub Action metadata for `uses: aryamthecodebreaker/FixMap/packages/action@v0`
- Create `packages/action/entrypoint.mjs`: Action wrapper around the CLI
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
  "name": "fixmap",
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
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.11"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
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
  issueText?: string;
  diffText?: string;
  baseRef?: string;
  headRef?: string;
};

export type RepoFile = {
  path: string;
  extension: string;
  sizeBytes: number;
  isTest: boolean;
  isSource: boolean;
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
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../src/repo-scan.js";

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
    expect(repo.packageScripts).toEqual([
      { name: "test", command: "vitest run" },
      { name: "typecheck", command: "tsc --noEmit" }
    ]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -w @fixmap/core -- repo-scan.test.ts`

Expected: FAIL because `repo-scan.js` does not exist.

- [ ] **Step 3: Implement scanner**

Create `packages/core/src/repo-scan.ts`:

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type { FixMapInput, PackageScript, RepoFile, RepoMap } from "./types.js";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", ".next", "coverage"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rs"]);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /(^|\/|\\)__tests__(\/|\\)/, /(^|\/|\\)tests?(\/|\\)/];

export async function scanRepo(input: Pick<FixMapInput, "repoRoot">): Promise<RepoMap> {
  const files = await walkFiles(input.repoRoot, input.repoRoot);
  const packageScripts = await readPackageScripts(input.repoRoot);

  return {
    root: input.repoRoot,
    files,
    packageScripts,
    changedFiles: []
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

    results.push({
      path: relativePath,
      extension,
      sizeBytes: fileStat.size,
      isTest: TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
      isSource: SOURCE_EXTENSIONS.has(extension)
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
        { path: "src/auth/reset-password.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false },
        { path: "src/billing/invoice.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: false },
        { path: "test/auth/reset-password.test.ts", extension: ".ts", sizeBytes: 100, isSource: true, isTest: true }
      ]
    };

    const ranked = rankContextFiles(repo, {
      issueText: "password reset fails for auth users",
      diffText: ""
    });

    expect(ranked[0]?.path).toBe("src/auth/reset-password.ts");
    expect(ranked[0]?.reasons).toContain("changed file");
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
  issueText?: string;
  diffText?: string;
  changedFiles?: string[];
}): TaskSignals {
  const text = [input.issueText ?? "", input.diffText ?? ""].join("\n").toLowerCase();
  const tokens = new Set(
    text
      .split(TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );

  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? [])
  };
}

export function tokenizePath(path: string): Set<string> {
  return new Set(
    path
      .toLowerCase()
      .split(TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}
```

- [ ] **Step 4: Implement ranker**

Create `packages/core/src/rank.ts`:

```ts
import { extractTaskSignals, tokenizePath } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

export function rankContextFiles(
  repo: RepoMap,
  input: { issueText?: string; diffText?: string },
  limit = 12
): RankedFile[] {
  const signals = extractTaskSignals({
    issueText: input.issueText,
    diffText: input.diffText,
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

      if (file.path.includes("auth") || file.path.includes("login")) {
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
import type { FixMapReport, RepoMap, RiskNote, TestRoute } from "./types.js";

export function buildTestRoutes(repo: RepoMap, contextPaths: string[]): TestRoute[] {
  const testFiles = repo.files.filter((file) => file.isTest).map((file) => file.path);
  const routes: TestRoute[] = [];
  const testScript = repo.packageScripts.find((script) => script.name === "test");
  const typecheckScript = repo.packageScripts.find((script) => script.name === "typecheck");

  if (testScript) {
    routes.push({
      command: `npm run ${testScript.name}`,
      reason: "package script named test",
      relatedFiles: testFiles.slice(0, 8)
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
  const joined = contextPaths.join("\n").toLowerCase();

  if (joined.includes("auth") || joined.includes("login") || joined.includes("password")) {
    risks.push({
      area: "authentication",
      severity: "high",
      reason: "authentication-related files are affected"
    });
  }

  if (joined.includes("billing") || joined.includes("payment") || joined.includes("invoice")) {
    risks.push({
      area: "billing",
      severity: "high",
      reason: "billing or payment-related files are affected"
    });
  }

  return risks;
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

Run: `npm test -w @fixmap/core -- report.test.ts`

Expected: PASS.

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
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "node --test"
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
  format: "markdown" | "json";
  output?: string;
};

const options = parseArgs(process.argv.slice(2));

if (options.command !== "plan") {
  console.error("Usage: fixmap plan --issue \"...\" [--repo .] [--format markdown|json] [--output file]");
  process.exit(1);
}

const repo = await scanRepo({ repoRoot: options.repoRoot });
const contextFiles = rankContextFiles(repo, { issueText: options.issueText });
const contextPaths = contextFiles.map((file) => file.path);
const report: FixMapReport = {
  summary: `FixMap found ${contextFiles.length} context files and generated ${buildTestRoutes(repo, contextPaths).length} test routes.`,
  contextFiles,
  testRoutes: buildTestRoutes(repo, contextPaths),
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
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--issue" && value) {
      issueText = value;
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
    format,
    output
  };
}
```

- [ ] **Step 4: Build CLI**

Run: `npm run build -w fixmap`

Expected: PASS and creates `packages/cli/dist/cli.js`.

- [ ] **Step 5: Smoke test CLI**

Run: `node packages/cli/dist/cli.js plan --issue "password reset fails" --repo .`

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
- Create: `packages/action/entrypoint.mjs`

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
  format:
    description: Output format.
    required: false
    default: markdown
runs:
  using: node20
  main: entrypoint.mjs
```

- [ ] **Step 2: Create action entrypoint**

The MVP action builds FixMap from the checked-out action repository at runtime. This is slower than a bundled action, but it keeps the first release GitHub-only and avoids requiring an npm publish step.

Create `packages/action/entrypoint.mjs`:

```js
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const issue = process.env.INPUT_ISSUE || "Pull request review";
const format = process.env.INPUT_FORMAT || "markdown";

const actionDir = dirname(fileURLToPath(import.meta.url));
const actionRoot = resolve(actionDir, "../..");
const targetRepo = process.cwd();

run("npm", ["install"], actionRoot);
run("npm", ["run", "build", "-w", "@fixmap/core"], actionRoot);
run("npm", ["run", "build", "-w", "fixmap"], actionRoot);

const result = spawnSync(process.execPath, [
  resolve(actionRoot, "packages/cli/dist/cli.js"),
  "plan",
  "--issue",
  issue,
  "--repo",
  targetRepo,
  "--format",
  format
], {
  encoding: "utf8"
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.stdout);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}
```

- [ ] **Step 3: Build before local action smoke**

Run: `npm run build`

Expected: PASS and `packages/cli/dist/cli.js` exists for the action entrypoint.

- [ ] **Step 4: Commit**

```bash
git add packages/action
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
node packages/cli/dist/cli.js plan --issue "password reset fails" --repo . --output fixmap-report.md
```

Expected: typecheck, tests, and build pass. The CLI writes `fixmap-report.md`.

- [ ] **Step 2: Update README status**

Modify `README.md` status section:

```md
## Status

FixMap is in early MVP development. The CLI can scan a JavaScript or TypeScript repository and produce a context/test/risk report from a prompt.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update mvp status"
```

## Approval Gate

Stop here before implementation. The next coding step is Task 1, but it should not start until Aryam approves this plan or requests changes.

## Self-Review

- Spec coverage: README and plan cover the product promise, solo developer flow, maintainer flow, local CLI, GitHub Action, Vercel website, and CPU-only/no-paid-service constraint.
- Placeholder scan: no unresolved placeholders are intentionally left in the plan.
- Type consistency: shared types are defined before scanner, ranker, report, CLI, and action tasks use them.
- Scope check: the MVP is narrow enough to ship; trainable ranking is named as a later enhancement after deterministic ranking works.
