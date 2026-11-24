import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildPathExcluder,
  evaluateArchitecturePolicy,
  inventoryWorkingTreeContracts,
  parseArchitecturePolicy,
  scanRepo,
  type ArchitecturePolicy,
  type RepoMap
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const POLICY_USAGE = `Usage: fixmap policy init [--repo <path>]
       fixmap policy check [--repo <path>] [--policy <file>] [--format markdown|json]
       fixmap policy explain <rule-id> [--repo <path>] [--policy <file>] [--format markdown|json]

Preview. Helps write .fixmap/policy.json, the architecture policy Plan and Verify enforce.
  init     Write a minimal valid starter policy from the repository's current module layout. Never overwrites.
  check    Validate a policy file and print each problem with a JSON pointer to it. Exit 1 when invalid.
  explain  Describe one rule: what it checks, its patterns, and which current files it covers.
`;

const POLICY_PATH = ".fixmap/policy.json";
const MAX_INIT_MODULES = 8;
const MATCH_SAMPLE = 10;
const RULE_KEYS: Record<string, readonly string[]> = {
  boundaries: ["id", "from", "deny", "reason", "severity", "decisionId"],
  requiredTests: ["id", "paths", "tests", "reason", "severity"],
  requiredReviews: ["id", "paths", "reviewers", "reason"],
  contracts: ["id", "paths", "forbidBreaking", "reason", "severity", "allowBreaking"]
};
const TOP_LEVEL_KEYS = new Set(["architecturePolicyVersion", ...Object.keys(RULE_KEYS)]);
const TEST_SEGMENTS = ["test", "tests", "__tests__", "spec"];

export type PolicyCommandDependencies = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  scanRepository?: typeof scanRepo;
};

export type PolicyProblem = { pointer: string; message: string };

export type PolicyCheckResult = {
  policyCheckVersion: 1;
  path: string;
  valid: boolean;
  ruleCount: number;
  errors: PolicyProblem[];
  warnings: PolicyProblem[];
};

type Parsed = {
  action: "init" | "check" | "explain";
  repo: string;
  policy?: string;
  ruleId?: string;
  format: "markdown" | "json";
};

export async function runPolicyCommand(args: string[], dependencies: PolicyCommandDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    (args.length === 0 ? stderr : stdout)(POLICY_USAGE);
    return args.length === 0 ? 1 : 0;
  }
  const parsed = parseArgs(args);
  if (typeof parsed === "string") {
    stderr(`${parsed}\n\n${POLICY_USAGE}`);
    return 1;
  }
  const scan = dependencies.scanRepository ?? scanRepo;
  try {
    if (parsed.action === "init") return await initPolicy(parsed, scan, stdout, stderr);
    const policyPath = resolve(parsed.repo, parsed.policy ?? POLICY_PATH);
    let text: string;
    try {
      text = readDecodedTextFile(policyPath);
    } catch (error) {
      stderr(`Could not read policy "${policyPath}": ${describeInputReadError(policyPath, error)}\n` +
        (parsed.policy ? "" : "Create one with: fixmap policy init\n"));
      return 1;
    }
    const check = checkPolicyText(text, policyPath);
    if (parsed.action === "check") {
      stdout(parsed.format === "json" ? `${JSON.stringify(check, null, 2)}\n` : renderCheck(check));
      return check.valid ? 0 : 1;
    }
    if (!check.valid) {
      stderr(`${policyPath} is not a valid policy; run fixmap policy check to see why.\n`);
      return 1;
    }
    const policy = parseArchitecturePolicy({ path: POLICY_PATH, content: text, fingerprint: "policy-explain" });
    const repo = await scan({ repoRoot: parsed.repo, includeHistory: false, useCache: true });
    const explanation = explainRule(policy, parsed.ruleId!, repo);
    if (!explanation) {
      const ids = allRules(policy).map((rule) => rule.rule.id);
      stderr(`No rule with id "${parsed.ruleId}". Rules in this policy: ${ids.length > 0 ? ids.join(", ") : "none"}.\n`);
      return 1;
    }
    stdout(parsed.format === "json" ? `${JSON.stringify(explanation, null, 2)}\n` : renderExplanation(explanation));
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseArgs(args: string[]): Parsed | string {
  const action = args[0];
  if (action !== "init" && action !== "check" && action !== "explain") return `Unknown policy action: ${action}. Use init, check, or explain.`;
  let repo = process.cwd();
  let policy: string | undefined;
  let ruleId: string | undefined;
  let format: "markdown" | "json" = "markdown";
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 1) {
    const raw = args[index]!;
    if (!raw.startsWith("-")) {
      if (action !== "explain" || ruleId !== undefined) return `Unexpected argument: ${raw}`;
      ruleId = raw.trim();
      continue;
    }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const allowed = action === "init" ? ["--repo"] : ["--repo", "--policy", "--format"];
    if (!allowed.includes(flag)) return `Unknown policy ${action} option: ${raw}`;
    if (seen.has(flag)) return `Pass ${flag} only once.`;
    seen.add(flag);
    const value = separator === -1 ? args[++index] : raw.slice(separator + 1);
    if (!value?.trim() || (separator === -1 && value.startsWith("-"))) return `${flag} requires a value.`;
    if (flag === "--repo") repo = resolve(value.trim());
    else if (flag === "--policy") policy = value.trim();
    else {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") return "--format must be markdown or json.";
      format = normalized;
    }
  }
  if (action === "explain" && !ruleId) return "policy explain requires a rule id.";
  return { action, repo, ...(policy ? { policy } : {}), ...(ruleId ? { ruleId } : {}), format };
}

/** Validates each rule on its own so every problem gets a pointer, then the whole file for cross-rule limits. */
export function checkPolicyText(text: string, path: string): PolicyCheckResult {
  const errors: PolicyProblem[] = [];
  const warnings: PolicyProblem[] = [];
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    errors.push({ pointer: "", message: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` });
    return { policyCheckVersion: 1, path, valid: false, ruleCount: 0, errors, warnings };
  }
  if (!isRecord(value)) {
    errors.push({ pointer: "", message: "A policy must be a JSON object." });
    return { policyCheckVersion: 1, path, valid: false, ruleCount: 0, errors, warnings };
  }
  if (value.architecturePolicyVersion !== 1) errors.push({ pointer: "/architecturePolicyVersion", message: "Must be 1." });
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.has(key)) warnings.push({ pointer: `/${escapePointer(key)}`, message: `Unknown section "${key}" is ignored. Known sections: ${Object.keys(RULE_KEYS).join(", ")}.` });
  }
  let ruleCount = 0;
  for (const [section, keys] of Object.entries(RULE_KEYS)) {
    const rules = value[section];
    if (rules === undefined) continue;
    if (!Array.isArray(rules)) {
      errors.push({ pointer: `/${section}`, message: "Must be an array of rules." });
      continue;
    }
    rules.forEach((rule, index) => {
      ruleCount += 1;
      const pointer = `/${section}/${index}`;
      try {
        parseArchitecturePolicy({ path: POLICY_PATH, fingerprint: "policy-check", content: JSON.stringify({ architecturePolicyVersion: 1, [section]: [rule] }) });
      } catch (error) {
        errors.push({ pointer, message: (error instanceof Error ? error.message : String(error)).replace(`${section}[0]`, `${section}[${index}]`) });
      }
      if (isRecord(rule)) {
        for (const key of Object.keys(rule)) {
          if (!keys.includes(key)) warnings.push({ pointer: `${pointer}/${escapePointer(key)}`, message: `Unknown field "${key}" is ignored. Known fields: ${keys.join(", ")}.` });
        }
      }
    });
  }
  if (errors.length === 0) {
    try {
      parseArchitecturePolicy({ path: POLICY_PATH, fingerprint: "policy-check", content: JSON.stringify(value) });
    } catch (error) {
      errors.push({ pointer: "", message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (ruleCount === 0 && errors.length === 0) warnings.push({ pointer: "", message: "The policy has no rules, so Plan and Verify enforce nothing." });
  return { policyCheckVersion: 1, path, valid: errors.length === 0, ruleCount, errors, warnings };
}

async function initPolicy(parsed: Parsed, scan: typeof scanRepo, stdout: (text: string) => void, stderr: (text: string) => void): Promise<number> {
  const target = join(parsed.repo, POLICY_PATH);
  if (existsSync(target)) {
    stderr(`${target} already exists; fixmap policy init never overwrites it. Run fixmap policy check to validate it.\n`);
    return 1;
  }
  const repo = await scan({ repoRoot: parsed.repo, includeHistory: false, useCache: true });
  const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (scanError) throw new Error(scanError.message);
  const starter = await starterPolicy(repo);
  const text = `${JSON.stringify(starter, null, 2)}\n`;
  // Generated content must itself pass the same validation Plan and Verify apply.
  parseArchitecturePolicy({ path: POLICY_PATH, content: text, fingerprint: "policy-init" });
  await mkdir(join(parsed.repo, ".fixmap"), { recursive: true });
  await writeNew(target, text);
  stdout([
    `Wrote ${target}`,
    "",
    `- ${starter.requiredTests.length} required-test rule${starter.requiredTests.length === 1 ? "" : "s"} (one per top-level module with tests), severity warning`,
    `- ${starter.contracts.length === 0 ? "no contract rule (no API or schema contracts found)" : "1 contract rule forbidding breaking changes to the contracts found, severity warning"}`,
    "- no boundary rules: add one per import direction you want to forbid, for example",
    "  { \"id\": \"ui-no-db\", \"from\": [\"src/ui/**\"], \"deny\": [\"src/db/**\"], \"reason\": \"UI talks to the API, not the database.\", \"severity\": \"error\" }",
    "",
    "Next: edit the reasons, then run fixmap policy check. Plan and Verify apply the policy automatically.",
    ""
  ].join("\n"));
  return 0;
}

/** No-clobber write: a hard link fails if the target appeared meanwhile; filesystems without links fall back to an exclusive create. */
async function writeNew(target: string, text: string): Promise<void> {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
  try {
    await link(temporary, target);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EEXIST") throw new Error(`${target} appeared while writing; it was left untouched.`);
    if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EXDEV" && code !== "ENOSYS") throw error;
    await writeFile(target, text, { encoding: "utf8", flag: "wx" });
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

type StarterPolicy = {
  architecturePolicyVersion: 1;
  boundaries: never[];
  requiredTests: Array<{ id: string; paths: string[]; tests: string[]; reason: string; severity: "warning" }>;
  requiredReviews: never[];
  contracts: Array<{ id: string; paths: string[]; forbidBreaking: true; reason: string; severity: "warning" }>;
};

export async function starterPolicy(repo: RepoMap): Promise<StarterPolicy> {
  const counts = new Map<string, { source: number; tests: number }>();
  for (const file of repo.files) {
    if (file.kind !== "code" || file.path.startsWith(".")) continue;
    const module = moduleOf(file.path);
    if (!module) continue;
    const entry = counts.get(module) ?? { source: 0, tests: 0 };
    if (file.isTest) entry.tests += 1;
    else if (file.isSource) entry.source += 1;
    counts.set(module, entry);
  }
  const modules = [...counts].filter(([, entry]) => entry.source > 0 && entry.tests > 0)
    .sort(([a, left], [b, right]) => right.source - left.source || a.localeCompare(b))
    .slice(0, MAX_INIT_MODULES)
    .map(([module]) => module)
    .sort();
  const ids = new Set<string>();
  const requiredTests = modules.map((module) => {
    const id = uniqueId(`${slug(module)}-tests`, ids);
    return {
      id,
      paths: [`${module}/**`],
      tests: ["**/*.test.*", "**/*.spec.*", ...TEST_SEGMENTS.map((segment) => `${module}/**/${segment}/**`)],
      reason: `Changes to ${module} should come with a changed test. Edit this reason to say why.`,
      severity: "warning" as const
    };
  });
  const inventory = await inventoryWorkingTreeContracts(repo);
  const contractPaths = [...new Set(inventory.surfaces.map((surface) => surface.path))].sort().slice(0, 100);
  return {
    architecturePolicyVersion: 1,
    boundaries: [],
    requiredTests,
    requiredReviews: [],
    contracts: contractPaths.length === 0 ? [] : [{
      id: "public-contracts",
      paths: contractPaths,
      forbidBreaking: true,
      reason: "Consumers depend on these contracts. Add allowBreaking entries for reviewed exceptions.",
      severity: "warning"
    }]
  };
}

function moduleOf(path: string): string | undefined {
  const parts = path.split("/");
  if (parts.length < 2) return undefined;
  if (["packages", "apps", "services", "libs", "modules"].includes(parts[0]!) && parts.length >= 3) return `${parts[0]}/${parts[1]}`;
  if (TEST_SEGMENTS.includes(parts[0]!)) return undefined;
  return parts[0];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 50) || "module";
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

type RuleEntry =
  | { kind: "boundary"; rule: ArchitecturePolicy["boundaries"][number] }
  | { kind: "required-tests"; rule: ArchitecturePolicy["requiredTests"][number] }
  | { kind: "required-review"; rule: ArchitecturePolicy["requiredReviews"][number] }
  | { kind: "contract"; rule: ArchitecturePolicy["contracts"][number] };

function allRules(policy: ArchitecturePolicy): RuleEntry[] {
  return [
    ...policy.boundaries.map((rule) => ({ kind: "boundary" as const, rule })),
    ...policy.requiredTests.map((rule) => ({ kind: "required-tests" as const, rule })),
    ...policy.requiredReviews.map((rule) => ({ kind: "required-review" as const, rule })),
    ...policy.contracts.map((rule) => ({ kind: "contract" as const, rule }))
  ];
}

export type PolicyExplanation = {
  policyExplanationVersion: 1;
  id: string;
  kind: RuleEntry["kind"];
  checks: string;
  reason: string;
  severity: "info" | "warning" | "error";
  patterns: Record<string, string[]>;
  coveredFiles: { count: number; sample: string[] };
  currentViolations?: number;
  allowBreaking?: Array<{ id?: string; path?: string; reason: string }>;
};

function explainRule(policy: ArchitecturePolicy, id: string, repo: RepoMap): PolicyExplanation | undefined {
  const entry = allRules(policy).find((candidate) => candidate.rule.id === id);
  if (!entry) return undefined;
  const covered = (patterns: readonly string[]) => {
    const matcher = buildPathExcluder([...patterns]);
    const paths = repo.files.map((file) => file.path).filter((path) => matcher.excludes(path)).sort();
    return { count: paths.length, sample: paths.slice(0, MATCH_SAMPLE) };
  };
  const base = { policyExplanationVersion: 1 as const, id, kind: entry.kind, reason: entry.rule.reason };
  if (entry.kind === "boundary") {
    const violations = evaluateArchitecturePolicy({ ...policy, boundaries: [entry.rule], requiredTests: [], requiredReviews: [], contracts: [] }, { repo })
      .findings.length;
    return {
      ...base,
      checks: "Files matching from must not import files matching deny. Plan reports it for ranked files; Verify for changed files.",
      severity: entry.rule.severity,
      patterns: { from: entry.rule.from, deny: entry.rule.deny },
      coveredFiles: covered(entry.rule.from),
      currentViolations: violations
    };
  }
  if (entry.kind === "required-tests") return {
    ...base,
    checks: "When a diff changes a file matching paths, at least one changed file must match tests.",
    severity: entry.rule.severity,
    patterns: { paths: entry.rule.paths, tests: entry.rule.tests },
    coveredFiles: covered(entry.rule.paths)
  };
  if (entry.kind === "required-review") return {
    ...base,
    checks: "When a diff changes a file matching paths, Plan and Verify name these reviewers. Nobody is notified.",
    severity: "info",
    patterns: { paths: entry.rule.paths, reviewers: entry.rule.reviewers },
    coveredFiles: covered(entry.rule.paths)
  };
  return {
    ...base,
    checks: entry.rule.forbidBreaking
      ? "When a diff makes a breaking change to a contract matching paths, Plan and Verify report it, unless allowBreaking lists that change or path."
      : "forbidBreaking is false, so this rule reports nothing.",
    severity: entry.rule.severity,
    patterns: { paths: entry.rule.paths },
    coveredFiles: covered(entry.rule.paths),
    allowBreaking: entry.rule.allowBreaking
  };
}

function renderCheck(check: PolicyCheckResult): string {
  const lines = [
    "# FixMap policy check",
    "",
    check.valid
      ? `${check.path} is valid: ${check.ruleCount} rule${check.ruleCount === 1 ? "" : "s"}.`
      : `${check.path} is not valid: ${check.errors.length} problem${check.errors.length === 1 ? "" : "s"}.`
  ];
  if (check.errors.length > 0) lines.push("", "## Errors", "", ...check.errors.map(problemLine));
  if (check.warnings.length > 0) lines.push("", "## Warnings", "", ...check.warnings.map(problemLine));
  return `${lines.join("\n")}\n`;
}

function problemLine(problem: PolicyProblem): string {
  return `- \`${problem.pointer || "/"}\` ${problem.message}`;
}

function renderExplanation(explanation: PolicyExplanation): string {
  const lines = [
    `# Policy rule ${explanation.id}`,
    "",
    `Kind: ${explanation.kind} · severity: ${explanation.severity}`,
    "",
    explanation.checks,
    "",
    `Reason: ${explanation.reason}`,
    "",
    "## Patterns",
    "",
    ...Object.entries(explanation.patterns).map(([name, values]) => `- ${name}: ${values.map((value) => `\`${value}\``).join(", ")}`),
    "",
    `## Files covered now (${explanation.coveredFiles.count})`,
    "",
    ...(explanation.coveredFiles.sample.length > 0
      ? explanation.coveredFiles.sample.map((path) => `- \`${path}\``)
      : ["- None. Check the patterns: they match no scanned file."]),
    ...(explanation.coveredFiles.count > explanation.coveredFiles.sample.length ? [`- ...and ${explanation.coveredFiles.count - explanation.coveredFiles.sample.length} more`] : [])
  ];
  if (explanation.currentViolations !== undefined) lines.push("", `Current violations in the whole repository: ${explanation.currentViolations}`);
  if (explanation.allowBreaking && explanation.allowBreaking.length > 0) {
    lines.push("", "## Allowed breaking changes", "", ...explanation.allowBreaking.map((entry) => `- ${entry.id ? `change \`${entry.id}\`` : `path \`${entry.path}\``}: ${entry.reason}`));
  }
  return `${lines.join("\n")}\n`;
}

function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
