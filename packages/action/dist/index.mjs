import { createRequire as __fixmapCreateRequire } from 'module'; const require = __fixmapCreateRequire(import.meta.url);

// packages/action/src/index.ts
import { appendFileSync, readFileSync } from "node:fs";

// packages/core/dist/signals.js
var TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "has",
  "the",
  "this",
  "that",
  "with",
  "when",
  "where"
]);
function extractTaskSignals(input) {
  const tokens = tokenizeText([input.issueText ?? "", input.diffText ?? ""].join("\n"));
  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? [])
  };
}
function tokenizeText(text) {
  return new Set(text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(TOKEN_SPLIT).map((token2) => token2.trim()).filter((token2) => token2.length >= 3).filter((token2) => !STOP_WORDS.has(token2)));
}
function tokenizePath(path) {
  return tokenizeText(path);
}

// packages/core/dist/rank.js
function rankContextFiles(repo2, input, limit = 12) {
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo2.changedFiles
  });
  return repo2.files.filter((file) => file.isSource && !file.isTest).map((file) => {
    const reasons = [];
    let score = 0;
    if (signals.changedFiles.has(file.path)) {
      score += 10;
      reasons.push("changed file");
    }
    const pathTokens = tokenizePath(file.path);
    const pathOverlap = [...pathTokens].filter((token2) => signals.tokens.has(token2));
    if (pathOverlap.length > 0) {
      score += pathOverlap.length * 3;
      reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
    }
    const contentTokens = tokenizeText(file.textSample);
    const contentOverlap = [...contentTokens].filter((token2) => signals.tokens.has(token2));
    if (contentOverlap.length > 0) {
      score += Math.min(contentOverlap.length, 8) * 2;
      reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
    }
    if (isNearbyChangedFile(file.path, repo2.changedFiles)) {
      score += 3;
      reasons.push("near changed file");
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
  }).filter((file) => file.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}
function isNearbyChangedFile(path, changedFiles) {
  const folder = path.split("/").slice(0, -1).join("/");
  if (!folder) {
    return false;
  }
  return changedFiles.some((changedPath) => changedPath !== path && changedPath.startsWith(`${folder}/`));
}

// packages/core/dist/report.js
function buildTestRoutes(repo2, contextPaths2) {
  const relatedTests = findRelatedTests(repo2, contextPaths2);
  const routes = [];
  const testScript = repo2.packageScripts.find((script) => script.name === "test");
  const typecheckScript = repo2.packageScripts.find((script) => script.name === "typecheck");
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
      relatedFiles: contextPaths2
    });
  }
  return routes;
}
function buildRiskNotes(contextPaths2) {
  const risks = [];
  const tokens = new Set(contextPaths2.flatMap((path) => [...tokenizePath(path)]));
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
  return risks;
}
function findRelatedTests(repo2, contextPaths2) {
  const contextTokens = new Set(contextPaths2.flatMap((path) => [...tokenizePath(path)]));
  return repo2.files.filter((file) => file.isTest).map((file) => {
    const testTokens = tokenizePath(file.path);
    const overlap = [...testTokens].filter((token2) => contextTokens.has(token2)).length;
    return { path: file.path, score: overlap };
  }).filter((file) => file.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 8).map((file) => file.path);
}
function renderMarkdownReport(report2) {
  const lines = [
    "# FixMap Report",
    "",
    report2.summary,
    "",
    "## Context Files",
    "",
    ...listOrEmpty(report2.contextFiles.map((file) => `- \`${file.path}\` (${file.score}): ${file.reasons.join("; ")}`)),
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
    ...listOrEmpty(report2.changedFiles.map((path) => `- \`${path}\``))
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
import { extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
var IGNORED_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", "dist", ".next", "coverage"]);
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
var exec = promisify(execFile);
async function scanRepo(input) {
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
async function walkFiles(root, current) {
  const entries = await readdir(current, { withFileTypes: true });
  const results = [];
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
async function readPackageScripts(root) {
  try {
    const raw = await readFile(join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({ name, command }));
  } catch {
    return [];
  }
}
async function readChangedFiles(input) {
  const diffSpec2 = input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : void 0);
  if (!diffSpec2) {
    return [];
  }
  try {
    const { stdout } = await exec("git", ["diff", "--name-only", diffSpec2], { cwd: input.repoRoot });
    return stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean).map(normalizePath).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
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
function normalizePath(path) {
  return path.split(sep).join("/");
}

// packages/action/src/index.ts
var issue = process.env.INPUT_ISSUE || "Pull request review";
var targetRepo = process.cwd();
var diffSpec = process.env.INPUT_DIFF || void 0;
var baseRef = process.env.INPUT_BASE || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : void 0);
var headRef = process.env.INPUT_HEAD || (process.env.GITHUB_HEAD_REF ? "HEAD" : void 0);
var format = process.env.INPUT_FORMAT === "json" ? "json" : "markdown";
var repo = await scanRepo({
  repoRoot: targetRepo,
  diffSpec,
  baseRef,
  headRef
});
var contextFiles = rankContextFiles(repo, {
  issueText: issue,
  diffText: diffSpec ?? [baseRef, headRef].filter(Boolean).join(" ")
});
var contextPaths = contextFiles.map((file) => file.path);
var testRoutes = buildTestRoutes(repo, contextPaths);
var report = {
  summary: `FixMap found ${contextFiles.length} context files and generated ${testRoutes.length} test routes.`,
  contextFiles,
  testRoutes,
  risks: buildRiskNotes(contextPaths),
  changedFiles: repo.changedFiles
};
var markdown = renderMarkdownReport(report);
var output = format === "json" ? renderJsonReport(report) : markdown;
process.stdout.write(output);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}
var token = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
if (token) {
  await upsertPullRequestComment(token, markdown);
}
async function upsertPullRequestComment(token2, markdown2) {
  if (!process.env.GITHUB_EVENT_PATH || !process.env.GITHUB_REPOSITORY) {
    return;
  }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const issueNumber = event.pull_request?.number;
  if (!issueNumber) {
    return;
  }
  const [owner, repoName] = process.env.GITHUB_REPOSITORY.split("/");
  if (!owner || !repoName) {
    return;
  }
  const marker = "<!-- fixmap-report -->";
  const body = `${marker}
${markdown2}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token2}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28"
  };
  const commentsUrl = `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`;
  const commentsResponse = await fetch(commentsUrl, { headers });
  const comments = await commentsResponse.json();
  const existing = Array.isArray(comments) ? comments.find((comment) => comment.body?.includes(marker)) : void 0;
  if (existing) {
    await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/comments/${existing.id}`, {
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
