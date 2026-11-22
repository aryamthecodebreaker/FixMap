import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createAnnotation, addAnnotation } from "../src/annotations.js";
import { updateAnnotationStore } from "../src/annotation-store.js";
import { buildFixMapAnalysis } from "../src/plan.js";
import { renderMarkdownReport } from "../src/report.js";

const exec = promisify(execFile);

it("keeps authored notes review-only through a real staged Git rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-rename-"));
  const git = (...args: string[]) => exec("git", args, { cwd: root, timeout: 10_000 });
  try {
    await git("init", "--quiet");
    await writeFile(join(root, "old.ts"), "export function authenticate() { return false; }\n");
    const annotation = createAnnotation({ scope: { kind: "file", path: "old.ts" }, note: "Preserve partner contract", owner: "platform", createdAt: "2026-01-01T00:00:00Z" });
    await updateAnnotationStore(root, (store) => addAnnotation(store, annotation));
    await git("add", ".");
    await git("-c", "user.name=FixMap Test", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    const storePath = join(root, ".fixmap", "annotations.json");
    const bytes = await readFile(storePath);
    await git("mv", "old.ts", "new.ts");
    const { report, repo } = await buildFixMapAnalysis({ repoRoot: root, issueText: "authenticate in new.ts", workingTree: true, useCache: false, includeHistory: false });
    expect(repo.diffText).toContain("rename to new.ts");
    expect(report.annotations?.entries).toEqual([expect.objectContaining({
      status: "renamed-target", suggestedPath: "new.ts", annotation
    })]);
    expect(renderMarkdownReport(report)).toContain("Preserve partner contract");
    expect(report.diagnostics.some((entry) => entry.code === "annotation-target-stale")).toBe(true);
    expect(await readFile(storePath)).toEqual(bytes);
    expect((await git("diff", "--", ".fixmap/annotations.json")).stdout).toBe("");
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 30_000);
