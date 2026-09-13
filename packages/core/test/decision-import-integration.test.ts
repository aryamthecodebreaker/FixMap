import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildFixMapAnalysis } from "../src/plan.js";
import { renderMarkdownReport } from "../src/report.js";
import { validateFixMapReport } from "../src/validate.js";

it("carries a local PR description through a real scan and report without rewriting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-decision-import-"));
  try {
    await promisify(execFile)("git", ["init", "--quiet"], { cwd: root, timeout: 10_000 });
    await mkdir(join(root, "docs", "decisions"), { recursive: true });
    await writeFile(join(root, "token.ts"), "export function validateToken() { return true; }\n");
    const body = "Keep token validation opaque; preserve the partner boundary.\n";
    const source = JSON.stringify({ title: "Token validation", body, url: "https://github.com/acme/auth/pull/42", fixmapAppliesTo: "file:token.ts" });
    const path = join(root, "docs", "decisions", "pr-42.json");
    await writeFile(path, source);
    const { report } = await buildFixMapAnalysis({ repoRoot: root, issueText: "validateToken in token.ts", useCache: false, includeHistory: false });
    expect(report.decisions).toContainEqual(expect.objectContaining({ decision: body, status: "unknown", source: expect.objectContaining({ verification: "unverified-local-attribution" }) }));
    expect(renderMarkdownReport(report)).toContain("remote source unverified");
    expect(validateFixMapReport(JSON.parse(JSON.stringify(report)), "report").success).toBe(true);
    expect(await readFile(path, "utf8")).toBe(source);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 30_000);
