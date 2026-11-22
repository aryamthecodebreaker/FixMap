import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createAnnotation, type FixMapReport } from "@aryam/fixmap-core";
import { runAction } from "../src/runner.js";

it("carries authored annotations and exact provenance through the real Action plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-action-annotation-"));
  try {
    await mkdir(join(root, ".fixmap"));
    await writeFile(join(root, "auth.ts"), "export function authenticate() { return false; }\n");
    const annotation = createAnnotation({ scope: { kind: "file", path: "auth.ts" }, note: "Keep the customer contract", owner: "platform", createdAt: "2026-01-01T00:00:00Z" });
    const bytes = JSON.stringify({ annotationStoreVersion: 1, annotations: [annotation] });
    const path = join(root, ".fixmap", "annotations.json");
    await writeFile(path, bytes);
    const stdout: string[] = [];
    const summaries: string[] = [];
    await runAction({ INPUT_ISSUE: "authenticate fails", INPUT_FORMAT: "json", GITHUB_STEP_SUMMARY: "captured-summary" }, {
      cwd: () => root,
      stdout: (value) => { stdout.push(value); },
      appendFile: (_path, value) => { summaries.push(value); }
    });
    const report = JSON.parse(stdout.join("")) as FixMapReport;
    expect(report.annotations?.sourceFingerprint).toBe(`worktree:${createHash("sha256").update(bytes).digest("hex")}`);
    expect(report.annotations?.entries[0]?.annotation).toEqual(annotation);
    expect(summaries.join("")).toContain("Keep the customer contract");
    expect(await readFile(path, "utf8")).toBe(bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});
