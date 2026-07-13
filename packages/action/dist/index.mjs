import { createRequire as __fixmapCreateRequire } from 'module'; const require = __fixmapCreateRequire(import.meta.url);

// packages/action/src/index.ts
import { appendFileSync, readFileSync } from "node:fs";

// packages/core/dist/signals.js
var TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "add",
  "all",
  "also",
  "and",
  "any",
  "are",
  "been",
  "being",
  "both",
  "but",
  "can",
  "cannot",
  "const",
  "could",
  "default",
  "did",
  "doe",
  "does",
  "down",
  "each",
  "even",
  "export",
  "for",
  "from",
  "function",
  "get",
  "github",
  "got",
  "had",
  "has",
  "have",
  "her",
  "him",
  "his",
  "how",
  "import",
  "index",
  "instead",
  "into",
  "its",
  "just",
  "main",
  "may",
  "might",
  "more",
  "most",
  "must",
  "name",
  "new",
  "node",
  "not",
  "now",
  "off",
  "only",
  "other",
  "our",
  "out",
  "over",
  "package",
  "packages",
  "return",
  "run",
  "same",
  "she",
  "should",
  "some",
  "src",
  "still",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "true",
  "type",
  "under",
  "uses",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your"
]);
function extractTaskSignals(input) {
  const tokens = tokenizeText([input.issueText ?? "", extractDiffContentLines(input.diffText ?? "")].join("\n"));
  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? [])
  };
}
function extractDiffContentLines(diffText) {
  if (!diffText) {
    return "";
  }
  return diffText.split(/\r?\n/).filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")).join("\n");
}
function tokenizeText(text) {
  return new Set(text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(TOKEN_SPLIT).map((token2) => token2.trim()).filter((token2) => token2.length >= 3 && !STOP_WORDS.has(token2)).map((token2) => normalizeToken(token2)).filter((token2) => token2.length >= 3 && !STOP_WORDS.has(token2)));
}
function normalizeToken(token2) {
  if (token2.length > 5 && token2.endsWith("ies"))
    return `${token2.slice(0, -3)}y`;
  if (token2.length > 5 && token2.endsWith("ing"))
    return token2.slice(0, -3);
  if (token2.length > 4 && token2.endsWith("ed"))
    return token2.slice(0, -1);
  if (token2.length > 4 && token2.endsWith("es"))
    return token2.slice(0, -1);
  if (token2.length > 3 && token2.endsWith("s"))
    return token2.slice(0, -1);
  return token2;
}
function tokenizePath(path) {
  return tokenizeText(path);
}

// packages/core/dist/rank.js
var DEPLOYMENT_TERMS = [
  "deploy",
  "deployment",
  "vercel",
  "netlify",
  "docker",
  "kubernetes",
  "hosting",
  "serverless",
  "production",
  "404",
  "500",
  "502"
];
var LOCKFILES = /* @__PURE__ */ new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]);
function rankContextFiles(repo, input, limit = 8) {
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const taskTargetsEvaluation = hasAny(signals.tokens, ["benchmark", "benchmarks", "evaluation", "evaluate"]);
  const candidates = repo.files.filter((file) => file.isSource && !file.isTest && !LOCKFILES.has(file.path.split("/").pop() ?? "") && (!file.path.startsWith("benchmarks/") || taskTargetsEvaluation));
  const contentTokensByPath = new Map(candidates.map((file) => [file.path, tokenizeText(file.textSample)]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const taskTargetsDocumentation = hasAny(signals.tokens, ["docs", "documentation", "readme", "guide", "copy"]);
  const taskTargetsConfiguration = hasAny(signals.tokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);
  const taskTargetsDeployment = hasAny(signals.tokens, DEPLOYMENT_TERMS);
  return candidates.map((file) => {
    const reasons = [];
    let score = 0;
    const isChanged = signals.changedFiles.has(file.path);
    if (isChanged) {
      score += 20;
      reasons.push("changed file");
    }
    const pathTokens = tokenizePath(file.path);
    const pathOverlap = [...pathTokens].filter((token2) => signals.tokens.has(token2));
    if (pathOverlap.length > 0) {
      score += pathOverlap.length * 3;
      reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
    }
    const contentTokens = contentTokensByPath.get(file.path) ?? /* @__PURE__ */ new Set();
    const contentOverlap = [...contentTokens].filter((token2) => signals.tokens.has(token2) && !commonTokens.has(token2));
    if (contentOverlap.length > 0) {
      score += Math.min(contentOverlap.length, 8) * 2;
      reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
    }
    if (isNearbyChangedFile(file.path, repo.changedFiles)) {
      score += 2;
      reasons.push("near changed file");
    }
    if (file.kind === "code") {
      score += 2;
    } else if (file.kind === "documentation" && taskTargetsDocumentation) {
      score += 8;
      reasons.push("documentation-focused task");
    } else if (file.kind === "documentation" && !taskTargetsDocumentation && !isChanged) {
      score -= 6;
    } else if (file.kind === "config" && (taskTargetsConfiguration || taskTargetsDeployment)) {
      score += 2;
      reasons.push(taskTargetsConfiguration ? "configuration-focused task" : "deployment-focused task");
    } else if (file.kind === "config" && !isChanged) {
      score -= 4;
    }
    const isDeploymentConfig = file.path === "package.json" || DEPLOYMENT_TERMS.some((term) => pathTokens.has(term));
    if (taskTargetsDeployment && file.kind === "config" && !file.path.includes("/") && isDeploymentConfig) {
      score += 5;
      reasons.push("root configuration for a deployment-related task");
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
      confidence: confidenceForScore(score, isChanged),
      reasons: reasons.length > 0 ? reasons : ["source file baseline"]
    };
  }).filter((file) => file.score >= 4).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}
function confidenceForScore(score, isChanged) {
  if (isChanged || score >= 14)
    return "high";
  if (score >= 8)
    return "medium";
  return "low";
}
function hasAny(tokens, values) {
  return values.some((value) => tokens.has(value));
}
function findCommonTokens(contentTokensByPath) {
  const fileCount = contentTokensByPath.size;
  if (fileCount < 4) {
    return /* @__PURE__ */ new Set();
  }
  const threshold = Math.ceil(fileCount / 2);
  const frequency = /* @__PURE__ */ new Map();
  for (const tokens of contentTokensByPath.values()) {
    for (const token2 of tokens) {
      frequency.set(token2, (frequency.get(token2) ?? 0) + 1);
    }
  }
  return new Set([...frequency].filter(([, count]) => count >= threshold).map(([token2]) => token2));
}
function isNearbyChangedFile(path, changedFiles) {
  const folder = path.split("/").slice(0, -1).join("/");
  if (!folder) {
    return false;
  }
  return changedFiles.some((changedPath) => changedPath !== path && changedPath.startsWith(`${folder}/`));
}

// packages/core/dist/report.js
function buildTestRoutes(repo, contextPaths) {
  const codeContextPaths = contextPaths.filter((path) => repo.files.find((file) => file.path === path)?.kind === "code");
  if (codeContextPaths.length === 0) {
    return [];
  }
  const relatedTests = findRelatedTests(repo, contextPaths);
  const scriptPriority = /* @__PURE__ */ new Map([["test", 0], ["typecheck", 1], ["check", 2], ["lint", 3]]);
  const candidates = repo.packageScripts.filter((script) => scriptPriority.has(script.name)).map((script) => ({
    script,
    proximity: packageProximity(script.packageDir, codeContextPaths),
    priority: scriptPriority.get(script.name) ?? 99
  })).filter((candidate) => candidate.proximity >= 0).sort((a, b) => b.proximity - a.proximity || a.priority - b.priority || a.script.packageDir.localeCompare(b.script.packageDir));
  const commands = /* @__PURE__ */ new Set();
  const routes = [];
  for (const { script } of candidates) {
    const command = formatScriptCommand(repo.packageManager, script.packageDir, script.name);
    if (commands.has(command))
      continue;
    commands.add(command);
    routes.push({
      command,
      reason: `${script.packageDir ? `nearest package (${script.packageDir})` : "repository root"} script named ${script.name}`,
      relatedFiles: script.name === "test" ? relatedTests : codeContextPaths
    });
    if (routes.length === 3)
      break;
  }
  return routes;
}
function buildRiskNotes(contextPaths) {
  const risks = [];
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
  if (tokens.has("config") || tokens.has("workflow") || tokens.has("action")) {
    risks.push({
      area: "automation",
      severity: "medium",
      reason: "configuration or CI automation files may affect developer workflows"
    });
  }
  if (tokens.has("migration") || tokens.has("schema") || tokens.has("database") || tokens.has("sql")) {
    risks.push({ area: "data", severity: "high", reason: "database or schema-related files may affect stored data" });
  }
  if (tokens.has("api") || tokens.has("route") || tokens.has("public")) {
    risks.push({ area: "public-api", severity: "medium", reason: "public interfaces or request handling may change" });
  }
  if (tokens.has("dependency") || tokens.has("lock") || tokens.has("package")) {
    risks.push({ area: "dependencies", severity: "medium", reason: "dependency changes can affect build and supply-chain behavior" });
  }
  return risks;
}
function packageProximity(packageDir, contextPaths) {
  if (!packageDir)
    return 1;
  const matches = contextPaths.filter((path) => path === packageDir || path.startsWith(`${packageDir}/`));
  return matches.length > 0 ? 10 + packageDir.split("/").length : -1;
}
function formatScriptCommand(manager, packageDir, script) {
  if (!packageDir)
    return `${manager} run ${script}`;
  if (manager === "npm")
    return `npm --prefix ${packageDir} run ${script}`;
  if (manager === "pnpm")
    return `pnpm --dir ${packageDir} run ${script}`;
  if (manager === "yarn")
    return `yarn --cwd ${packageDir} ${script}`;
  return `bun --cwd ${packageDir} run ${script}`;
}
function findRelatedTests(repo, contextPaths) {
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));
  return repo.files.filter((file) => file.isTest).map((file) => {
    const testTokens = tokenizePath(file.path);
    const overlap = [...testTokens].filter((token2) => contextTokens.has(token2)).length;
    return { path: file.path, score: overlap };
  }).filter((file) => file.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 8).map((file) => file.path);
}
function buildSummary(contextFileCount, testRouteCount) {
  const files = contextFileCount === 1 ? "context file" : "context files";
  const routes = testRouteCount === 1 ? "test route" : "test routes";
  return `FixMap found ${contextFileCount} ${files} and generated ${testRouteCount} ${routes}.`;
}
function renderMarkdownReport(report2) {
  const lines = [
    "# FixMap Report",
    "",
    report2.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report2.contextFiles.map((file) => `- \`${file.path}\` (${file.confidence} confidence, score ${file.score}): ${file.reasons.join("; ")}`)),
    "",
    "## Test Route",
    "",
    ...listOrEmpty(report2.testRoutes.map((route) => {
      const related = route.relatedFiles.length > 0 ? ` Related: ${route.relatedFiles.map((path) => `\`${path}\``).join(", ")}.` : "";
      return `- \`${route.command}\`: ${route.reason}.${related}`;
    })),
    "",
    "## Risk Map",
    "",
    ...listOrEmpty(report2.risks.map((risk) => `- **${risk.severity}** ${risk.area}: ${risk.reason}`)),
    "",
    "## Changed Files",
    "",
    ...listOrEmpty(report2.changedFiles.map((path) => `- \`${path}\``)),
    "",
    "## Diagnostics",
    "",
    ...listOrEmpty(report2.diagnostics.map((diagnostic) => `- **${diagnostic.severity}** ${diagnostic.message}`))
  ];
  return `${lines.join("\n")}
`;
}
function renderJsonReport(report2) {
  return `${JSON.stringify(report2, null, 2)}
`;
}
function listOrEmpty(lines) {
  return lines.length > 0 ? lines : ["- None found"];
}

// packages/core/dist/repo-scan.js
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
var IGNORED_DIRS = /* @__PURE__ */ new Set([
  ".cache",
  ".git",
  ".idea",
  ".netlify",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".venv",
  ".vercel",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor"
]);
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
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
var TEST_PATTERNS = [/\.test\./, /\.spec\./, /(^|\/|\\)__tests__(\/|\\)/, /(^|\/|\\)tests?(\/|\\)/];
var MAX_TEXT_SAMPLE_BYTES = 64e3;
var MAX_DIFF_TEXT_CHARS = 2e5;
var MAX_SCANNED_FILES = 25e3;
var GIT_MAX_BUFFER = 10 * 1024 * 1024;
var exec = promisify(execFile);
async function scanRepo(input) {
  if (!await isDirectory(input.repoRoot)) {
    return {
      root: input.repoRoot,
      files: [],
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [{
        code: "repo-root-missing",
        severity: "error",
        message: `Repository root "${input.repoRoot}" does not exist or is not a directory.`
      }]
    };
  }
  const diagnostics = [];
  const files = await listFiles(input.repoRoot, diagnostics);
  const packageScripts = await readPackageScripts(input.repoRoot, files, diagnostics);
  const diffSpec2 = resolveDiffSpec(input);
  const diff = await readDiff(input.repoRoot, diffSpec2, diagnostics);
  return {
    root: input.repoRoot,
    files,
    packageScripts,
    changedFiles: diff.changedFiles,
    diffText: diff.diffText,
    packageManager: detectPackageManager(files),
    diagnostics
  };
}
function resolveDiffSpec(input) {
  return input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : void 0);
}
async function listFiles(root, diagnostics) {
  const gitPaths = await listGitPaths(root);
  if (gitPaths) {
    return buildFilesFromPaths(root, gitPaths, diagnostics);
  }
  const files = await walkFiles(root, root, diagnostics, { count: 0, limitReported: false });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function listGitPaths(root) {
  try {
    const { stdout } = await exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    return [...new Set(stdout.split("\0").filter(Boolean))];
  } catch {
    return void 0;
  }
}
async function buildFilesFromPaths(root, paths, diagnostics) {
  const results = [];
  for (const rawPath of paths) {
    if (results.length >= MAX_SCANNED_FILES) {
      reportScanLimit(diagnostics);
      break;
    }
    const relativePath = normalizePath(rawPath);
    if (isInIgnoredDir(relativePath)) {
      continue;
    }
    const file = await toRepoFile(join(root, rawPath), relativePath);
    if (file) {
      results.push(file);
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
async function walkFiles(root, current, diagnostics, state) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (state.count >= MAX_SCANNED_FILES) {
      if (!state.limitReported) {
        reportScanLimit(diagnostics);
        state.limitReported = true;
      }
      break;
    }
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      results.push(...await walkFiles(root, join(current, entry.name), diagnostics, state));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const absolutePath = join(current, entry.name);
    const file = await toRepoFile(absolutePath, normalizePath(relative(root, absolutePath)));
    if (file) {
      results.push(file);
      state.count += 1;
    }
  }
  return results;
}
async function toRepoFile(absolutePath, relativePath) {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return void 0;
  }
  if (!fileStat.isFile()) {
    return void 0;
  }
  const extension = extname(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(extension);
  return {
    path: relativePath,
    extension,
    sizeBytes: fileStat.size,
    isTest: TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
    isSource,
    kind: classifyFile(relativePath, extension),
    textSample: isSource ? await readTextSample(absolutePath, fileStat.size) : ""
  };
}
function isInIgnoredDir(relativePath) {
  return relativePath.split("/").slice(0, -1).some((segment) => IGNORED_DIRS.has(segment));
}
function reportScanLimit(diagnostics) {
  diagnostics.push({
    code: "scan-limit-reached",
    severity: "warning",
    message: `Stopped scanning after ${MAX_SCANNED_FILES.toLocaleString()} files. Narrow the repository root for more precise results.`
  });
}
async function readPackageScripts(root, files, diagnostics) {
  const manifests = files.filter((file) => file.path === "package.json" || file.path.endsWith("/package.json"));
  const scripts = [];
  for (const manifest of manifests) {
    try {
      const raw = await readFile(join(root, manifest.path), "utf8");
      const parsed = JSON.parse(raw);
      const packageDir = normalizePath(dirname(manifest.path));
      scripts.push(...Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({
        name,
        command,
        packageDir: packageDir === "." ? "" : packageDir
      })));
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message: `Could not parse ${manifest.path}; scripts from that package were skipped.`
      });
    }
  }
  return scripts;
}
async function readDiff(repoRoot, diffSpec2, diagnostics) {
  if (!diffSpec2) {
    return { changedFiles: [], diffText: "" };
  }
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--name-only", diffSpec2], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", diffSpec2], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map(normalizePath);
    const untracked = diffSpec2.includes("..") ? [] : await listUntrackedPaths(repoRoot);
    return {
      changedFiles: [.../* @__PURE__ */ new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b)),
      diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS)
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split(/\r?\n/)[0] : "unknown git error";
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: `Could not resolve git diff "${diffSpec2}": ${detail}. Results use the task text only.`
    });
    return { changedFiles: [], diffText: "" };
  }
}
function detectPackageManager(files) {
  const paths = new Set(files.map((file) => file.path));
  if (paths.has("pnpm-lock.yaml"))
    return "pnpm";
  if (paths.has("yarn.lock"))
    return "yarn";
  if (paths.has("bun.lock") || paths.has("bun.lockb"))
    return "bun";
  return "npm";
}
function classifyFile(path, extension) {
  const lower = path.toLowerCase();
  if (extension === ".md" || lower.startsWith("docs/") || lower === "license")
    return "documentation";
  if (lower.startsWith(".github/") || [".json", ".yaml", ".yml"].includes(extension) || /(^|\/)([^/]+\.)?(config|rc)\.[^/]+$/.test(lower))
    return "config";
  if (SOURCE_EXTENSIONS.has(extension))
    return "code";
  return "other";
}
async function readTextSample(path, sizeBytes) {
  if (sizeBytes > MAX_TEXT_SAMPLE_BYTES) {
    return "";
  }
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
async function listUntrackedPaths(repoRoot) {
  try {
    const { stdout } = await exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER });
    return stdout.split("\0").filter(Boolean).map(normalizePath);
  } catch {
    return [];
  }
}
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
function normalizePath(path) {
  return path.split(sep).join("/");
}

// packages/core/dist/plan.js
async function buildFixMapReport(input) {
  const repo = await scanRepo(input);
  const contextFiles = rankContextFiles(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  return {
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths),
    changedFiles: repo.changedFiles,
    diagnostics: repo.diagnostics
  };
}

// packages/action/src/github.ts
var FIXMAP_REPORT_MARKER = "<!-- fixmap-report -->";
var DEFAULT_COMMENT_AUTHOR = "github-actions[bot]";
function buildPullRequestIssueText(event2) {
  const pullRequest = event2?.pull_request;
  const parts = [pullRequest?.title, pullRequest?.body].filter((part) => Boolean(part?.trim())).map((part) => part.trim());
  return parts.join("\n\n");
}
function createGitHubClient(options = {}) {
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async upsertPullRequestComment(input) {
      const headers = {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      };
      const commentsUrl = `${apiBaseUrl}/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`;
      const existing = await findExistingComment(
        fetchImpl,
        commentsUrl,
        headers,
        input.commentAuthor?.trim() || DEFAULT_COMMENT_AUTHOR
      );
      const body = `${FIXMAP_REPORT_MARKER}
${input.markdown}`;
      if (existing) {
        await requestJson(fetchImpl, `${apiBaseUrl}/repos/${input.owner}/${input.repo}/issues/comments/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body })
        }, "update the existing FixMap comment");
        return "updated";
      }
      await requestJson(fetchImpl, commentsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ body })
      }, "create the FixMap comment");
      return "created";
    }
  };
}
async function findExistingComment(fetchImpl, commentsUrl, headers, viewerLogin) {
  for (let page = 1; page <= 10; page += 1) {
    const comments = await requestJson(
      fetchImpl,
      `${commentsUrl}?per_page=100&page=${page}`,
      { headers },
      "list pull request comments"
    );
    const existing = comments.find(
      (comment) => comment.user?.login === viewerLogin && comment.body?.includes(FIXMAP_REPORT_MARKER)
    );
    if (existing) {
      return existing;
    }
    if (comments.length < 100) {
      return void 0;
    }
  }
  return void 0;
}
async function requestJson(fetchImpl, url, init, action) {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`FixMap could not ${action}; GitHub returned ${response.status} ${response.statusText}${suffix}`);
  }
  return response.json();
}

// packages/action/src/index.ts
var event = readEvent(process.env.GITHUB_EVENT_PATH);
var issue = readInput("issue") || buildPullRequestIssueText(event);
var targetRepo = process.cwd();
var diffSpec = readInput("diff");
var baseRef = readInput("base") || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : void 0);
var headRef = readInput("head") || (process.env.GITHUB_HEAD_REF ? "HEAD" : void 0);
var format = readInput("format") === "json" ? "json" : "markdown";
if (!issue && !diffSpec && !baseRef) {
  throw new Error("FixMap needs a pull_request event, an issue input, or a diff/base input to build a useful report.");
}
var report = await buildFixMapReport({
  repoRoot: targetRepo,
  issueText: issue,
  diffSpec,
  baseRef,
  headRef
});
var markdown = renderMarkdownReport(report);
var output = format === "json" ? renderJsonReport(report) : markdown;
process.stdout.write(output);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}
if (process.env.GITHUB_OUTPUT) {
  const delimiter = `fixmap_${Date.now()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `report<<${delimiter}
${output}${delimiter}
`);
  appendFileSync(process.env.GITHUB_OUTPUT, `context-count=${report.contextFiles.length}
`);
  appendFileSync(process.env.GITHUB_OUTPUT, `test-route-count=${report.testRoutes.length}
`);
}
var token = readInput("github-token") || process.env.GITHUB_TOKEN;
var commentAuthor = readInput("comment-author");
if (token) {
  await upsertPullRequestComment(token, event, markdown, commentAuthor);
}
function readInput(name) {
  const githubName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const shellSafeName = `INPUT_${name.replace(/[- ]/g, "_").toUpperCase()}`;
  const value = process.env[githubName] || process.env[shellSafeName];
  return value?.trim() || void 0;
}
function readEvent(eventPath) {
  if (!eventPath) {
    return void 0;
  }
  try {
    return JSON.parse(readFileSync(eventPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`FixMap could not read the GitHub event payload: ${detail}`);
  }
}
async function upsertPullRequestComment(token2, event2, markdown2, commentAuthor2) {
  if (!event2?.pull_request?.number || !process.env.GITHUB_REPOSITORY) {
    return;
  }
  const [owner, repoName] = process.env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repoName) {
    throw new Error("FixMap requires GITHUB_REPOSITORY in owner/repository form to comment on a pull request.");
  }
  await createGitHubClient().upsertPullRequestComment({
    token: token2,
    owner,
    repo: repoName,
    issueNumber: event2.pull_request.number,
    markdown: markdown2,
    commentAuthor: commentAuthor2
  });
}
