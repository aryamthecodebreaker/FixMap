import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildFixMapAnalysis } from "../src/plan.js";
import { renderMarkdownReport } from "../src/report.js";
import { buildReportSupplyChain } from "../src/report-supply-chain.js";
import { validateSupplyChainEvidenceBundle } from "../src/supply-chain.js";
import type { RepoFile, RepoMap, FixMapReport } from "../src/types.js";
import { validateFixMapReport } from "../src/validate.js";
import { renderVerifyMarkdown, verifyPlan } from "../src/verify.js";

const exec = promisify(execFile);
const SECRET = "sk_live_SUPERSECRET_9f8e7d6c";
const PERSONAL = "hunter2-ZZTOP-4417";

async function git(root: string, ...args: string[]): Promise<void> {
  await exec("git", args, { cwd: root });
}

async function createRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-sensitive-"));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await git(root, "init", "-q");
  await git(root, "add", "-A");
  await git(root, "-c", "user.name=FixMap Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial");
  return root;
}

function bundle(): ReturnType<typeof validateSupplyChainEvidenceBundle> {
  return validateSupplyChainEvidenceBundle({
    supplyChainBundleVersion: 1,
    generatedAt: "2026-11-01T00:00:00Z",
    source: { tool: "external-scanner", toolVersion: "4.2.0", databaseVersion: "advisories-2026-11-01", documentFingerprint: `sha256:${"a".repeat(64)}` },
    components: [
      { id: "npm-left-pad", name: "left-pad", version: "1.0.0", purl: "pkg:npm/left-pad@1.0.0", licenses: ["MIT"], paths: ["package.json"] },
      { id: "npm-billing-lib", name: "billing-lib", version: "2.0.0", licenses: ["GPL-3.0"], paths: ["services/billing/package.json"] }
    ],
    findings: [
      { id: "adv-1", kind: "vulnerability", severity: "high", confidence: "high", componentId: "npm-left-pad", summary: "Advisory matched left-pad.", advisoryId: "GHSA-xxxx-yyyy-zzzz", fixedVersion: "1.0.1", sourceUrl: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz" },
      { id: "lic-1", kind: "license-policy", severity: "medium", confidence: "medium", componentId: "npm-billing-lib", summary: "GPL license denied by policy.", licenseId: "GPL-3.0", policy: "deny-copyleft" }
    ]
  });
}

describe("sensitive-data evidence in plans", () => {
  it("attaches flows touching ranked files, omits others, and never copies matched values", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "src/auth/session.ts": `export function startSession() {\n  const apiKey = "${SECRET}";\n  console.log("session started", apiKey);\n}\n`,
      "src/reports/export.ts": `export function exportReport(url: string) {\n  const password = "${PERSONAL}";\n  return fetch(url, { body: password });\n}\n`
    });
    try {
      const { report } = await buildFixMapAnalysis({ repoRoot: root, issueText: "startSession session auth", limit: 1, sensitiveData: true });
      expect(report.contextFiles.map((file) => file.path)).toEqual(["src/auth/session.ts"]);
      expect(report.sensitiveData?.flows).toEqual([{
        relation: "same-file",
        source: { path: "src/auth/session.ts", category: "credential", ruleIds: ["credential-password"], line: 2 },
        sink: { path: "src/auth/session.ts", category: "logging", ruleIds: ["sink-log"], line: 3 }
      }]);
      expect(report.sensitiveData).toMatchObject({ completeness: "not-a-security-proof", omittedFlows: 0, provider: { id: "fixmap-sensitive-data" } });
      expect(report.sensitiveData?.introducedCheck).toBeUndefined();
      const markdown = renderMarkdownReport(report);
      expect(markdown).toContain("## Sensitive Data");
      expect(markdown).toContain("`src/auth/session.ts:2`");
      for (const output of [JSON.stringify(report), markdown]) {
        expect(output).not.toContain(SECRET);
        expect(output).not.toContain(PERSONAL);
      }
      expect(validateFixMapReport(report, "sensitive report")).toMatchObject({ success: true });

      const { report: plain } = await buildFixMapAnalysis({ repoRoot: root, issueText: "startSession session auth", limit: 1 });
      expect(plain.sensitiveData).toBeUndefined();
      expect(renderMarkdownReport(plain)).not.toContain("## Sensitive Data");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects tampered sensitiveData fields", async () => {
    const root = await createRepo({
      "src/auth/session.ts": `const apiKey = "${SECRET}";\nconsole.log(apiKey);\n`
    });
    try {
      const { report } = await buildFixMapAnalysis({ repoRoot: root, issueText: "session apiKey", sensitiveData: true });
      const evidence = report.sensitiveData!;
      const flow = evidence.flows[0]!;
      for (const tampered of [
        { ...evidence, sensitiveDataVersion: 2 },
        { ...evidence, completeness: "complete" },
        { ...evidence, omittedFlows: -1 },
        { ...evidence, flows: [{ ...flow, source: { ...flow.source, path: "../outside.ts" } }] },
        { ...evidence, flows: [{ ...flow, sink: { ...flow.sink, category: "email" } }] },
        { ...evidence, flows: [{ ...flow, source: { ...flow.source, ruleIds: [SECRET] } }] },
        { ...evidence, flows: [{ ...flow, sink: { ...flow.sink, path: "src/other.ts" } }] },
        { ...evidence, flows: Array.from({ length: 51 }, () => flow) }
      ]) {
        expect(validateFixMapReport({ ...report, sensitiveData: tampered }, "tampered")).toMatchObject({ success: false });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("supply-chain evidence in plans", () => {
  it("attaches findings for manifests among the report's paths with provenance", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({ dependencies: { "left-pad": "1.0.0" } }),
      "services/billing/package.json": JSON.stringify({ dependencies: { "billing-lib": "2.0.0" } }),
      "src/index.ts": "export const ready = true;\n"
    });
    try {
      await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "left-pad": "1.0.1" } }));
      const sha = "b".repeat(64);
      const { report } = await buildFixMapAnalysis({
        repoRoot: root, issueText: "upgrade left-pad", workingTree: true, supplyChain: { bundle: bundle(), documentSha256: sha }
      });
      expect(report.changedFiles).toEqual(["package.json"]);
      expect(report.supplyChain?.source).toEqual({
        tool: "external-scanner", toolVersion: "4.2.0", databaseVersion: "advisories-2026-11-01",
        documentFingerprint: `sha256:${"a".repeat(64)}`, generatedAt: "2026-11-01T00:00:00.000Z", documentSha256: sha
      });
      expect(report.supplyChain?.findings).toEqual([expect.objectContaining({
        id: "adv-1", severity: "high", manifestPaths: ["package.json"], advisoryId: "GHSA-xxxx-yyyy-zzzz", fixedVersion: "1.0.1",
        package: { name: "left-pad", version: "1.0.0", purl: "pkg:npm/left-pad@1.0.0" }
      })]);
      expect(report.supplyChain?.omittedFindings).toBe(1);
      const markdown = renderMarkdownReport(report);
      expect(markdown).toContain("## Supply-Chain Evidence");
      expect(markdown).toContain("`left-pad@1.0.0` declared in `package.json`");
      expect(markdown).not.toContain("billing-lib");
      expect(validateFixMapReport(report, "supply report")).toMatchObject({ success: true });

      const supply = report.supplyChain!;
      const finding = supply.findings[0]!;
      for (const tampered of [
        { ...supply, supplyChainVersion: 2 },
        { ...supply, source: { ...supply.source, documentSha256: "not-a-digest" } },
        { ...supply, source: { ...supply.source, tool: "" } },
        { ...supply, omittedFindings: 1.5 },
        { ...supply, findings: [{ ...finding, manifestPaths: ["/etc/package.json"] }] },
        { ...supply, findings: [{ ...finding, manifestPaths: [] }] },
        { ...supply, findings: [{ ...finding, severity: "catastrophic" }] },
        { ...supply, findings: [{ ...finding, sourceUrl: "http://example.com/advisory" }] }
      ]) {
        expect(validateFixMapReport({ ...report, supplyChain: tampered }, "tampered")).toMatchObject({ success: false });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("attaches nothing when no manifest is among the report's paths", () => {
    const supply = buildReportSupplyChain(bundle(), "c".repeat(64), new Set(["src/index.ts"]));
    expect(supply.findings).toEqual([]);
    expect(supply.omittedFindings).toBe(2);
    expect(buildReportSupplyChain(bundle(), "c".repeat(64), new Set(["services/billing/package.json"])).findings.map((finding) => finding.id)).toEqual(["lic-1"]);
  });

  it("rejects malformed bundles before attachment", () => {
    const valid = {
      supplyChainBundleVersion: 1, generatedAt: "2026-11-01T00:00:00Z",
      source: { tool: "scanner", toolVersion: "1", documentFingerprint: `sha256:${"a".repeat(64)}` },
      components: [{ id: "c1", name: "x", licenses: [], paths: ["package.json"] }],
      findings: []
    };
    expect(() => validateSupplyChainEvidenceBundle({ ...valid, supplyChainBundleVersion: 2 })).toThrow("envelope");
    expect(() => validateSupplyChainEvidenceBundle({ ...valid, components: [{ ...valid.components[0], paths: ["../package.json"] }] })).toThrow("component");
    expect(() => validateSupplyChainEvidenceBundle({ ...valid, findings: [{ id: "f", kind: "vulnerability", severity: "high", confidence: "high", componentId: "missing", summary: "x" }] })).toThrow("finding");
  });
});

function file(path: string, textSample: string): RepoFile {
  return {
    path, extension: ".ts", sizeBytes: textSample.length, isSource: true, isTest: false, kind: "code",
    textSample, textSampleComplete: true, contentFingerprint: `git:${"0".repeat(40)}`
  };
}

function verifyRepo(files: RepoFile[], changedFiles: string[], diffText: string, diagnostics: RepoMap["diagnostics"] = []): RepoMap {
  return { root: "/repo", files, packageScripts: [], changedFiles, trackedFiles: files.map((entry) => entry.path), diffText, packageManager: "npm", diagnostics };
}

function plan(path: string): FixMapReport {
  return {
    summary: "",
    contextFiles: [{ rank: 1, path, score: 10, confidence: "high", reasons: ["path matches task terms"] }],
    testRoutes: [], risks: [], changedFiles: [], diagnostics: []
  };
}

describe("sensitive-data evidence in verify", () => {
  const sessionAfter = `export function refresh() {\n  const accessToken = "${SECRET}";\n  console.log("refreshed", accessToken);\n  return accessToken;\n}\n`;
  const sessionDiff = [
    "diff --git a/src/auth/session.ts b/src/auth/session.ts",
    "index 1111111..2222222 100644",
    "--- a/src/auth/session.ts",
    "+++ b/src/auth/session.ts",
    "@@ -1,4 +1,5 @@",
    " export function refresh() {",
    `   const accessToken = "${SECRET}";`,
    "+  console.log(\"refreshed\", accessToken);",
    "   return accessToken;",
    " }",
    ""
  ].join("\n");
  const existing = file("src/payments/charge.ts", "const cardNumber = input.cardNumber;\nlogger.info(\"charging\", cardNumber);\nexport const touched = 2;\n");
  const existingDiff = [
    "diff --git a/src/payments/charge.ts b/src/payments/charge.ts",
    "--- a/src/payments/charge.ts",
    "+++ b/src/payments/charge.ts",
    "@@ -3 +3 @@",
    "-export const touched = 1;",
    "+export const touched = 2;",
    ""
  ].join("\n");

  it("adds an advisory finding only for flows the diff introduced", () => {
    const repo = verifyRepo([file("src/auth/session.ts", sessionAfter), existing], ["src/auth/session.ts", "src/payments/charge.ts"], sessionDiff + existingDiff);
    const result = verifyPlan(plan("src/auth/session.ts"), repo, { sensitiveData: true });
    expect(result.sensitiveData?.introducedCheck).toBe("compared-with-diff");
    const flows = result.sensitiveData!.flows;
    expect(flows.find((flow) => flow.source.path === "src/auth/session.ts")).toMatchObject({ relation: "same-file", introducedByDiff: true, source: { category: "token" }, sink: { category: "logging", line: 3 } });
    expect(flows.find((flow) => flow.source.path === "src/payments/charge.ts")).not.toHaveProperty("introducedByDiff");
    const finding = result.findings.find((entry) => entry.code === "sensitive-data-flow-introduced");
    expect(finding).toMatchObject({ severity: "info", paths: ["src/auth/session.ts"] });
    expect(finding?.message).toContain("token → logging");
    const markdown = renderVerifyMarkdown(result);
    expect(markdown).toContain("## Sensitive Data");
    expect(markdown).toContain("**new**");
    for (const output of [JSON.stringify(result), markdown]) expect(output).not.toContain(SECRET);
  });

  it("marks a flow introduced by a new import as new", () => {
    const logger = file("src/auth/logger.ts", "export function write(message: string) { console.log(message); }\n");
    const session = file("src/auth/session.ts", "import { write } from \"./logger\";\nconst password = readPassword();\nwrite(\"ok\");\n");
    const diff = [
      "diff --git a/src/auth/session.ts b/src/auth/session.ts",
      "--- a/src/auth/session.ts",
      "+++ b/src/auth/session.ts",
      "@@ -0,0 +1 @@",
      "+import { write } from \"./logger\";",
      ""
    ].join("\n");
    const result = verifyPlan(plan("src/auth/session.ts"), verifyRepo([logger, session], ["src/auth/session.ts"], diff), { sensitiveData: true });
    expect(result.sensitiveData?.flows).toContainEqual(expect.objectContaining({
      relation: "direct-import", introducedByDiff: true,
      source: expect.objectContaining({ path: "src/auth/session.ts", category: "credential" }),
      sink: expect.objectContaining({ path: "src/auth/logger.ts", category: "logging" })
    }));
    expect(result.findings.map((entry) => entry.code)).toContain("sensitive-data-flow-introduced");
  });

  it("raises no finding for unchanged flows, a truncated diff, or when not requested", () => {
    const unchanged = verifyPlan(plan("src/payments/charge.ts"), verifyRepo([existing], ["src/payments/charge.ts"], existingDiff), { sensitiveData: true });
    expect(unchanged.sensitiveData?.flows).toHaveLength(1);
    expect(unchanged.findings.map((entry) => entry.code)).not.toContain("sensitive-data-flow-introduced");

    const truncated = verifyPlan(
      plan("src/auth/session.ts"),
      verifyRepo([file("src/auth/session.ts", sessionAfter)], ["src/auth/session.ts"], sessionDiff, [{ code: "diff-text-truncated", severity: "warning", message: "sampled" }]),
      { sensitiveData: true }
    );
    expect(truncated.sensitiveData?.introducedCheck).toBe("unavailable-diff-truncated");
    expect(truncated.findings.map((entry) => entry.code)).not.toContain("sensitive-data-flow-introduced");
    expect(renderVerifyMarkdown(truncated)).toContain("could not be identified");

    const off = verifyPlan(plan("src/auth/session.ts"), verifyRepo([file("src/auth/session.ts", sessionAfter)], ["src/auth/session.ts"], sessionDiff));
    expect(off.sensitiveData).toBeUndefined();
    expect(off.findings.map((entry) => entry.code)).not.toContain("sensitive-data-flow-introduced");
  });
});
