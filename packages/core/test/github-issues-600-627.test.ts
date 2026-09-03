import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { explainFile } from "../src/explain.js";
import { analyzeTaskGrounding } from "../src/grounding.js";
import { isBackupPath, moduleStem } from "../src/paths.js";
import { buildReportFromRepo, buildTestRoutes, RISK_RULES } from "../src/report.js";
import { rankContextFiles, RANKING_SIGNAL_TERMS, REPORT_SCORE_CUTOFF } from "../src/rank.js";
import { scanRepo } from "../src/repo-scan.js";
import { extractFileMentions, extractTaskSignals, tokenizeText } from "../src/signals.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function code(path: string, textSample: string, kind: RepoFile["kind"] = "code"): RepoFile {
  return {
    path,
    extension: /\.[^.]+$/.exec(path)?.[0]?.toLowerCase() ?? "",
    sizeBytes: textSample.length,
    isSource: true,
    isTest: false,
    kind,
    textSample
  };
}

function repo(files: RepoFile[], changedFiles: string[] = []): RepoMap {
  return {
    root: "/repo",
    files,
    packageScripts: [],
    changedFiles,
    diffText: "",
    packageManager: "npm",
    diagnostics: []
  };
}

describe("GitHub issues #600-#627", () => {
  it("#600 keeps vague task specificity vague when a diff is present", () => {
    const map = repo([code("src/index.ts", "export const value = 1")], ["src/index.ts"]);
    expect(analyzeTaskGrounding(map, { issueText: "improve the codebase", diffText: "+value" }).specificity).toBe("vague");
  });

  it("#607 keeps every ranking literal searchable and every risk literal effective", () => {
    for (const term of RANKING_SIGNAL_TERMS) expect(tokenizeText(term).size, term).toBeGreaterThan(0);
    for (const rule of RISK_RULES) {
      for (const term of rule.terms) {
        expect(buildReportFromRepo(repo([code(`src/${term}.ts`, "export const value = 1")]), { issueText: term }).risks.map((risk) => risk.area), `${rule.area}:${term}`).toContain(rule.area);
      }
    }
  });

  it("#610 derives clustering from the full ranking before --limit truncation", () => {
    const map = repo(["a", "b", "c", "d"].map((name) =>
      code(`src/${name}.ts`, "alpha bravo charlie delta echo foxtrot golf hotel india juliet")
    ));
    const full = buildReportFromRepo(map, { issueText: "alpha bravo charlie delta echo foxtrot golf hotel india juliet", limit: 8 });
    const one = buildReportFromRepo(map, { issueText: "alpha bravo charlie delta echo foxtrot golf hotel india juliet", limit: 1 });
    expect(full.analysis?.ranking.clustered).toBe(true);
    expect(one.analysis?.ranking).toEqual(full.analysis?.ranking);
    expect(one.contextFiles[0]?.confidence).toBe(full.contextFiles[0]?.confidence);
  });

  it("#611 keeps a vocabulary leader contested when --limit hides the definition site", () => {
    const map = repo([
      code("src/consumer.ts", "resolveToken resolveToken resolveToken is called here"),
      code("src/definition.ts", "export function resolveToken(){ return 1; }")
    ]);
    const issueText = "resolveToken is broken, see src/consumer.ts";
    expect(rankContextFiles(map, { issueText }, 8)[0]?.confidence).toBe("medium");
    expect(rankContextFiles(map, { issueText }, 1)[0]?.confidence).toBe("medium");
  });

  it("#612 reports the actual cutoff when the report has unused slots", () => {
    const map = repo([
      code("src/hit.ts", "resolveToken resolveToken export function resolveToken(){}"),
      code("src/barely.ts", "unrelated words only here")
    ]);
    const explanation = explainFile(map, { issueText: "resolveToken is broken" }, "src/barely.ts");
    expect(explanation.status).toBe("below-cutoff");
    expect(explanation.cutoff).toBe(REPORT_SCORE_CUTOFF);
    expect(explanation.summary).toContain(`reporting cutoff of ${REPORT_SCORE_CUTOFF}`);
  });

  it.each(["foo.php", "foo.vue", "foo.svelte", "foo.cs", "foo.cjs", "foo.mts"])(
    "#616 extracts the scannable file mention %s",
    (path) => expect(extractFileMentions(`fix src/${path}`)).toContain(`src/${path}`)
  );

  it("#618 strips only one source/generated layout segment from module stems", () => {
    expect(moduleStem("src/foo/lib/index.ts")).toBe("foo/lib/index");
    expect(moduleStem("src/lib/foo/index.ts")).toBe("lib/foo/index");
    expect(moduleStem("packages/api/dist/index.js")).toBe("packages/api/index");
    expect(moduleStem("packages/api/src/index.ts")).toBe("packages/api/index");
  });

  it("#621 recognizes typographic quote pairs as exact fragments", () => {
    for (const issueText of ["error “reset-token.ts” here", "error ‘reset-token.ts’ here", "error «reset-token.ts» here", "error „reset-token.ts” here"]) {
      expect(extractTaskSignals({ issueText }).exactFragments, issueText).toContain("reset-token.ts");
    }
  });

  it("#622 does not boost a root basename when a nested path was named", () => {
    const ranked = rankContextFiles(repo([
      code("foo.ts", "export const unrelated = 1"),
      code("src/foo.ts", "export const target = 1")
    ]), { issueText: "bug in src/foo.ts" });
    expect(ranked.find((entry) => entry.path === "src/foo.ts")?.reasons).toContain("explicitly named in the task");
    expect(ranked.find((entry) => entry.path === "foo.ts")?.reasons).not.toContain("explicitly named in the task");
  });

  it("#623 grounds stop-word-prefixed identifiers through their complete symbol tokens", () => {
    const grounding = analyzeTaskGrounding(
      repo([code("src/user.ts", "export function getCurrentUser(){ return null; }")]),
      { issueText: "getUser returns the wrong value" }
    );
    expect(grounding.identifiers).toContainEqual({
      identifier: "getUser",
      status: "partial-definition",
      matchedFiles: ["src/user.ts"]
    });
  });

  it("#624 recognizes generator functions as definition sites", () => {
    const ranked = rankContextFiles(repo([
      code("src/saga.ts", "export async function* fetchUser(){ yield 1; }")
    ]), { issueText: "fetchUser saga is broken" });
    expect(ranked[0]?.reasons).toContain("defines task identifiers: fetchUser");
  });

  it("#626 distinguishes copy utilities from sync-client backup copies", () => {
    expect(isBackupPath("src/deep-copy.ts")).toBe(false);
    expect(isBackupPath("src/shallow-copy.ts")).toBe(false);
    expect(isBackupPath("src/user_copy.ts")).toBe(false);
    expect(isBackupPath("src/foo copy.ts")).toBe(true);
    expect(isBackupPath("src/foo-copy (2).ts")).toBe(true);
  });

  it("#625, #617, and #627 keep source config files, vendored source, and nested Yarn routing", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-issues-625-627-"));
    try {
      await mkdir(join(root, "apps", "api", "src"), { recursive: true });
      await mkdir(join(root, "vendor", "first-party"), { recursive: true });
      await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
      await writeFile(join(root, "apps", "api", "package.json"), JSON.stringify({ name: "@app/api", scripts: { test: "vitest run" } }));
      await writeFile(join(root, "apps", "api", "yarn.lock"), "# yarn lockfile\n");
      await writeFile(join(root, "apps", "api", "src", "config.ts"), "export function resolveToken(){ return 1; }\n");
      await writeFile(join(root, "vendor", "first-party", "copy.php"), "<?php function copiedValue() { return 1; }\n");

      const scanned = await scanRepo({ repoRoot: root, useCache: false });
      expect(scanned.packageManager).toBe("yarn");
      expect(scanned.files.find((file) => file.path === "apps/api/src/config.ts")?.kind).toBe("code");
      expect(scanned.files.map((file) => file.path)).toContain("vendor/first-party/copy.php");
      expect(buildTestRoutes(scanned, ["apps/api/src/config.ts"])[0]?.command).toBe("yarn workspace @app/api run test");
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("#627 diagnoses conflicting root package-manager declarations", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-package-conflict-"));
    try {
      await writeFile(join(root, "package.json"), "{}");
      await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      await writeFile(join(root, "yarn.lock"), "# yarn\n");
      const scanned = await scanRepo({ repoRoot: root, useCache: false });
      expect(scanned.packageManager).toBe("pnpm");
      expect(scanned.diagnostics).toContainEqual(expect.objectContaining({ code: "package-manager-conflict" }));
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
