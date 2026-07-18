import { createRequire as __fixmapCreateRequire } from 'module'; const require = __fixmapCreateRequire(import.meta.url);

// packages/action/src/index.ts
import { appendFileSync, readFileSync } from "node:fs";

// packages/core/dist/import-graph.js
var JS_EXTENSIONS = /* @__PURE__ */ new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
var RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
var COMPILED_TO_SOURCE = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
var SPECIFIER_PATTERNS = [
  /\bimport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
  /\bimport\s*["']([^"'\n]+)["']/g,
  /\bexport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
];
var MAX_GRAPH_FILES = 5e3;
var MAX_EDGES_PER_FILE = 200;
function buildImportGraph(files) {
  const parseable = files.filter((file) => JS_EXTENSIONS.has(file.extension) && file.textSample.length > 0).slice(0, MAX_GRAPH_FILES);
  const repoPaths = new Set(files.map((file) => file.path));
  const imports = /* @__PURE__ */ new Map();
  const importedBy = /* @__PURE__ */ new Map();
  for (const file of parseable) {
    let edges = 0;
    for (const specifier of extractSpecifiers(file.textSample)) {
      if (edges >= MAX_EDGES_PER_FILE) {
        break;
      }
      const target = resolveSpecifier(file.path, specifier, repoPaths);
      if (!target || target === file.path) {
        continue;
      }
      addEdge(imports, file.path, target);
      addEdge(importedBy, target, file.path);
      edges += 1;
    }
  }
  return { imports, importedBy };
}
function findImportProximity(graph, seedPaths) {
  const seeds = new Set(seedPaths);
  const proximity = /* @__PURE__ */ new Map();
  const orderedSeeds = [...seeds];
  for (const seed of orderedSeeds) {
    for (const neighbor of neighborsOf(graph, seed)) {
      if (!seeds.has(neighbor.path) && !proximity.has(neighbor.path)) {
        proximity.set(neighbor.path, { distance: 1, seed, direction: neighbor.direction });
      }
    }
  }
  const firstHop = [...proximity.keys()];
  for (const mid of firstHop) {
    const seed = proximity.get(mid)?.seed ?? mid;
    for (const neighbor of neighborsOf(graph, mid)) {
      if (!seeds.has(neighbor.path) && !proximity.has(neighbor.path)) {
        proximity.set(neighbor.path, { distance: 2, seed, direction: neighbor.direction });
      }
    }
  }
  return proximity;
}
function neighborsOf(graph, path) {
  const neighbors = [];
  for (const imported of [...graph.imports.get(path) ?? []].sort((a, b) => a.localeCompare(b))) {
    neighbors.push({ path: imported, direction: "imported-by" });
  }
  for (const importer of [...graph.importedBy.get(path) ?? []].sort((a, b) => a.localeCompare(b))) {
    neighbors.push({ path: importer, direction: "imports" });
  }
  return neighbors;
}
function extractSpecifiers(textSample) {
  const specifiers = /* @__PURE__ */ new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of textSample.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier && specifier.startsWith(".")) {
        specifiers.add(specifier);
      }
    }
  }
  return specifiers;
}
function resolveSpecifier(fromPath, specifier, repoPaths) {
  const baseDir = fromPath.split("/").slice(0, -1).join("/");
  const joined = normalizeSegments(baseDir ? `${baseDir}/${specifier}` : specifier);
  if (joined === void 0 || joined === "") {
    return void 0;
  }
  const candidates = [joined];
  const lastSegment = joined.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  const extension = dot > 0 ? lastSegment.slice(dot) : "";
  for (const sourceExtension of COMPILED_TO_SOURCE[extension] ?? []) {
    candidates.push(`${joined.slice(0, -extension.length)}${sourceExtension}`);
  }
  if (!extension) {
    for (const resolveExtension of RESOLVE_EXTENSIONS) {
      candidates.push(`${joined}${resolveExtension}`);
    }
  }
  for (const resolveExtension of RESOLVE_EXTENSIONS) {
    candidates.push(`${joined}/index${resolveExtension}`);
  }
  return candidates.find((candidate) => repoPaths.has(candidate));
}
function normalizeSegments(path) {
  const segments = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return void 0;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}
function addEdge(edges, from, to) {
  const existing = edges.get(from);
  if (existing) {
    existing.add(to);
  } else {
    edges.set(from, /* @__PURE__ */ new Set([to]));
  }
}

// packages/core/dist/signals.js
var TOKEN_SPLIT = /[^a-zA-Z0-9]+/g;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "add",
  "all",
  "also",
  "and",
  "any",
  "are",
  "async",
  "await",
  "been",
  "being",
  "both",
  "break",
  "but",
  "can",
  "cannot",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "could",
  "debugger",
  "default",
  "delete",
  "did",
  "doe",
  "does",
  "down",
  "else",
  "enum",
  "extends",
  "false",
  "finally",
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
  "implements",
  "import",
  "index",
  "instanceof",
  "instead",
  "interface",
  "into",
  "its",
  "just",
  "let",
  "main",
  "may",
  "might",
  "more",
  "most",
  "must",
  "name",
  "namespace",
  "new",
  "node",
  "not",
  "now",
  "null",
  "off",
  "only",
  "other",
  "our",
  "out",
  "over",
  "package",
  "packages",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "run",
  "same",
  "she",
  "should",
  "some",
  "src",
  "static",
  "still",
  "such",
  "super",
  "switch",
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
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "under",
  "undefined",
  "uses",
  "var",
  "very",
  "void",
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
  "yield",
  "you",
  "your"
]);
var FILE_MENTION_PATTERN = /[A-Za-z0-9_@$][A-Za-z0-9_.$/\\-]*\.[A-Za-z][A-Za-z0-9]*/g;
function extractTaskSignals(input) {
  const tokens = tokenizeText([input.issueText ?? "", extractDiffContentLines(input.diffText ?? "")].join("\n"));
  return {
    tokens,
    changedFiles: new Set(input.changedFiles ?? []),
    fileMentions: extractFileMentions(input.issueText ?? "")
  };
}
function extractFileMentions(text) {
  const mentions = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(FILE_MENTION_PATTERN)) {
    const cleaned = match[0].replace(/\\/g, "/").replace(/^\.\.?\//, "");
    if (cleaned.length >= 4) {
      mentions.add(cleaned);
    }
  }
  return mentions;
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
var AUXILIARY_CODE_DIRS = /* @__PURE__ */ new Set(["demo", "demos", "example", "examples", "sample", "samples"]);
var COMPILED_TO_SOURCE_MENTION_EXTENSIONS = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
var MAX_FILES_PER_MENTION = 5;
var MAX_PROXIMITY_SEEDS = 5;
var IMPORT_PROXIMITY_BOOSTS = { 1: 4, 2: 2 };
var EXAMPLE_CODE_PENALTY = 2;
var TYPE_DECLARATION_PENALTY = 4;
function rankContextFiles(repo, input, limit = 8) {
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const mentionedPaths = matchMentionedPaths(signals.fileMentions, repo.files.map((file) => file.path));
  const taskTargetsEvaluation = hasAny(signals.tokens, ["benchmark", "benchmarks", "evaluation", "evaluate"]);
  const candidates = repo.files.filter((file) => mentionedPaths.has(file.path) || file.isSource && !file.isTest && !LOCKFILES.has(file.path.split("/").pop() ?? "") && (!file.path.startsWith("benchmarks/") || taskTargetsEvaluation));
  const contentTokensByPath = new Map(candidates.map((file) => [file.path, tokenizeText(file.textSample)]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const taskTargetsDocumentation = hasAny(signals.tokens, ["docs", "documentation", "readme", "guide", "copy"]);
  const taskTargetsConfiguration = hasAny(signals.tokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);
  const taskTargetsDeployment = hasAny(signals.tokens, DEPLOYMENT_TERMS);
  const taskText = [input.issueText ?? "", input.diffText ?? ""].join("\n");
  const taskTargetsExamples = /\b(?:demos?|examples?|samples?)\b/i.test(taskText.replace(/\bfor example\b/gi, ""));
  const taskTargetsTypeDeclarations = /\b(?:typescript|type definitions?|declarations?|typings?|\.d\.(?:ts|mts|cts))\b/i.test(taskText);
  const scored = candidates.map((file) => {
    const reasons = [];
    let score = 0;
    const isChanged = signals.changedFiles.has(file.path);
    if (isChanged) {
      score += 20;
      reasons.push("changed file");
    }
    if (mentionedPaths.has(file.path)) {
      score += 12;
      reasons.push("explicitly named in the task");
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
    if (file.kind === "code" && isAuxiliaryCodePath(file.path) && !taskTargetsExamples && !isChanged && !mentionedPaths.has(file.path)) {
      score -= EXAMPLE_CODE_PENALTY;
      reasons.push("example or demo code deprioritized for an implementation task");
    }
    if (isTypeDeclarationPath(file.path) && !taskTargetsTypeDeclarations && !isChanged && !mentionedPaths.has(file.path)) {
      score -= TYPE_DECLARATION_PENALTY;
      reasons.push("type declaration deprioritized for a runtime task");
    }
    if (pathTokens.has("auth") || pathTokens.has("login")) {
      if (signals.tokens.has("auth") || signals.tokens.has("login") || signals.tokens.has("password")) {
        score += 2;
        reasons.push("auth-related task signal");
      }
    }
    return { path: file.path, score, isChanged, reasons };
  });
  applyImportProximity(scored, repo);
  return scored.map((entry) => ({
    path: entry.path,
    score: entry.score,
    confidence: confidenceForScore(entry.score, entry.isChanged),
    reasons: entry.reasons.length > 0 ? entry.reasons : ["source file baseline"]
  })).filter((file) => file.score >= 4).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}
function applyImportProximity(scored, repo) {
  const seedEntries = scored.filter((entry) => confidenceForScore(entry.score, entry.isChanged) === "high").sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, MAX_PROXIMITY_SEEDS);
  if (seedEntries.length === 0) {
    return;
  }
  const seeds = seedEntries.map((entry) => entry.path);
  const seedScores = new Map(seedEntries.map((entry) => [entry.path, entry.score]));
  const proximity = findImportProximity(buildImportGraph(repo.files), seeds);
  for (const entry of scored) {
    const hit = proximity.get(entry.path);
    if (hit) {
      const seedScore = seedScores.get(hit.seed);
      const availableBoost = seedScore === void 0 ? 0 : Math.max(0, seedScore - entry.score - 1);
      const boost = Math.min(IMPORT_PROXIMITY_BOOSTS[hit.distance], availableBoost);
      if (boost === 0) {
        continue;
      }
      entry.score += boost;
      entry.reasons.push(proximityReason(hit));
    }
  }
}
function proximityReason(hit) {
  if (hit.distance === 2) {
    return `within two import hops of ranked file ${hit.seed}`;
  }
  return hit.direction === "imported-by" ? `imported by ranked file ${hit.seed}` : `imports ranked file ${hit.seed}`;
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
function matchMentionedPaths(mentions, repoPaths) {
  const matched = /* @__PURE__ */ new Set();
  for (const mention of mentions) {
    const exactMatches = repoPaths.filter((path) => pathMatchesMention(path, mention));
    if (exactMatches.length > 0) {
      if (exactMatches.length <= MAX_FILES_PER_MENTION) {
        for (const path of exactMatches) {
          matched.add(path);
        }
      }
      continue;
    }
    const fallbackVariants = compiledSourcePathVariants(mention);
    const fallbackMatches = repoPaths.filter((path) => fallbackVariants.some((variant) => pathMatchesMention(path, variant)));
    if (fallbackMatches.length > 0 && fallbackMatches.length <= MAX_FILES_PER_MENTION) {
      for (const path of fallbackMatches) {
        matched.add(path);
      }
    }
  }
  return matched;
}
function pathMatchesMention(path, mention) {
  return path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`);
}
function compiledSourcePathVariants(path) {
  const lowerPath = path.toLowerCase();
  for (const [compiledExtension, sourceExtensions] of Object.entries(COMPILED_TO_SOURCE_MENTION_EXTENSIONS)) {
    if (!lowerPath.endsWith(compiledExtension)) {
      continue;
    }
    const stem = path.slice(0, -compiledExtension.length);
    return sourceExtensions.map((extension) => `${stem}${extension}`);
  }
  return [];
}
function isAuxiliaryCodePath(path) {
  return path.split("/").slice(0, -1).some((segment) => AUXILIARY_CODE_DIRS.has(segment.toLowerCase()));
}
function isTypeDeclarationPath(path) {
  return /\.d\.(?:ts|mts|cts)$/i.test(path);
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
var RISK_RULES = [
  { area: "authentication", severity: "high", tokens: ["auth", "login", "password"], reason: "authentication-related files are affected" },
  { area: "billing", severity: "high", tokens: ["billing", "payment", "invoice"], reason: "billing or payment-related files are affected" },
  { area: "automation", severity: "medium", tokens: ["config", "workflow", "action"], reason: "configuration or CI automation files may affect developer workflows" },
  { area: "data", severity: "high", tokens: ["migration", "schema", "database", "sql"], reason: "database or schema-related files may affect stored data" },
  { area: "public-api", severity: "medium", tokens: ["api", "route", "public"], reason: "public interfaces or request handling may change" },
  { area: "dependencies", severity: "medium", tokens: ["dependency", "lock", "package"], reason: "dependency changes can affect build and supply-chain behavior" }
];
function buildRiskNotes(contextPaths, changedFiles = []) {
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));
  const changedTokens = new Set(changedFiles.flatMap((path) => [...tokenizePath(path)]));
  const diffPresent = changedFiles.length > 0;
  const risks = [];
  for (const rule of RISK_RULES) {
    const inChanged = rule.tokens.some((token2) => changedTokens.has(token2));
    const inContext = rule.tokens.some((token2) => contextTokens.has(token2));
    if (!inChanged && !inContext) {
      continue;
    }
    if (inChanged || !diffPresent) {
      risks.push({ area: rule.area, severity: rule.severity, reason: rule.reason });
    } else {
      risks.push({
        area: rule.area,
        severity: "low",
        reason: `context ranking surfaced ${rule.area}-related files, but none of the changed files touch this area`
      });
    }
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
  const changedSet = new Set(repo.changedFiles);
  const changedTests = repo.files.filter((file) => file.isTest && changedSet.has(file.path)).map((file) => file.path).sort((a, b) => a.localeCompare(b));
  const changedTestSet = new Set(changedTests);
  const contextTokens = new Set(contextPaths.flatMap((path) => [...tokenizePath(path)]));
  const overlapping = repo.files.filter((file) => file.isTest && !changedTestSet.has(file.path)).map((file) => {
    const testTokens = tokenizePath(file.path);
    const overlap = [...testTokens].filter((token2) => contextTokens.has(token2)).length;
    return { path: file.path, score: overlap };
  }).filter((file) => file.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).map((file) => file.path);
  return [...changedTests, ...overlapping].slice(0, 8);
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

// packages/core/dist/test-gates.js
var GATE_PATTERN = /\.(skipIf|runIf)\s*\(/;
var ENV_NAME_PATTERNS = [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g];
function findGatedTestDiagnostics(files, routedTestPaths) {
  const routed = new Set(routedTestPaths);
  const diagnostics = [];
  for (const file of files) {
    if (!file.isTest || !routed.has(file.path) || !GATE_PATTERN.test(file.textSample)) {
      continue;
    }
    diagnostics.push({
      code: "gated-test-skipped",
      severity: "warning",
      message: gateMessage(file.path, extractEnvNames(file.textSample))
    });
  }
  return diagnostics;
}
function gateMessage(path, envNames) {
  if (envNames.length === 0) {
    return `${path} contains conditionally skipped suites; verify the suggested test command actually exercises it.`;
  }
  const condition = envNames.length === 1 ? `${envNames[0]} is set` : `${envNames.join(", ")} are set`;
  return `${path} is skipped unless ${condition}; the suggested test command will not exercise it by default.`;
}
function extractEnvNames(textSample) {
  const names = /* @__PURE__ */ new Set();
  for (const pattern of ENV_NAME_PATTERNS) {
    for (const match of textSample.matchAll(pattern)) {
      names.add(match[1] ?? "");
    }
  }
  names.delete("");
  return [...names].sort((a, b) => a.localeCompare(b));
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
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];
  return {
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    changedFiles: repo.changedFiles,
    diagnostics: [...repo.diagnostics, ...findGatedTestDiagnostics(repo.files, routedTestPaths)]
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
function isPermissionDeniedError(error) {
  return error instanceof Error && /GitHub returned (401|403|404)\b/.test(error.message);
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
  try {
    await upsertPullRequestComment(token, event, markdown, commentAuthor);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `::warning::FixMap could not comment on the pull request, which is expected when the token is read-only (for example on forked pull requests). The full report is in the step summary and the report output. ${detail}
`
    );
  }
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
