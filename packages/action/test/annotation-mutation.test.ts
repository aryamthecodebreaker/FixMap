import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { runAction } from "../src/runner.js";
import { runAnnotationAction } from "../src/annotations.js";

it.each([
  { kind: "service", name: "auth", path: "src/auth.ts" },
  { kind: "file", path: "src/auth.ts", symbol: "login" },
  { kind: "symbol", path: "src/auth.ts", symbol: "login", name: "auth" },
  { kind: "contract", name: "auth", typo: true },
  { kind: "toString", name: "auth" }
])("rejects ambiguous or unsupported scopes without creating a store: %j", async (scope) => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-action-invalid-scope-"));
  try {
    await expect(runAnnotationAction(JSON.stringify({ action: "add", scope, note: "Keep scope exact" }), root, true))
      .rejects.toThrow("unsupported kind or fields");
    await expect(stat(join(root, ".fixmap"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each([
  { INPUT_DIFF: "main...HEAD" }, { INPUT_ISSUE: "untrusted task" },
  { INPUT_WORKING_TREE: "true" }, { INPUT_REPORT_PATH: "plan.json" }
])("rejects conflicting Action inputs before accessing the annotation store: %j", async (extra) => {
  const cwd = vi.fn(() => { throw new Error("must not access checkout"); });
  await expect(runAction({ INPUT_MODE: "annotate", INPUT_ANNOTATION_REQUEST: '{"action":"list"}', ...extra }, { cwd })).rejects.toThrow("does not accept analysis inputs");
  expect(cwd).not.toHaveBeenCalled();
});

it("requires explicit write permission and never invokes the GitHub client for annotations", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-action-mutation-"));
  try {
    const request = JSON.stringify({ action: "add", scope: { kind: "service", name: "auth" }, note: "Reviewed contract" });
    const client = vi.fn(() => { throw new Error("must not contact GitHub"); });
    const output: string[] = [];
    const dependencies = { cwd: () => root, createClient: client, stdout: (text: string) => { output.push(text); } };
    const env = { INPUT_MODE: "annotate", INPUT_ANNOTATION_REQUEST: request, GITHUB_TOKEN: "unused-test-token" };
    await expect(runAction(env, dependencies)).rejects.toThrow("allow-annotation-write");
    await runAction({ ...env, INPUT_ALLOW_ANNOTATION_WRITE: "true" }, dependencies);
    const added = JSON.parse(output.pop()!);
    const path = join(root, ".fixmap", "annotations.json");
    expect(JSON.parse(await readFile(path, "utf8")).annotations[0].note).toBe("Reviewed contract");
    await runAction({ INPUT_MODE: "annotate", INPUT_ANNOTATION_REQUEST: '{"action":"list"}' }, dependencies);
    expect(JSON.parse(output.pop()!).annotations).toHaveLength(1);
    await runAction({ INPUT_MODE: "annotate", INPUT_ALLOW_ANNOTATION_WRITE: "true", INPUT_ANNOTATION_REQUEST: JSON.stringify({ action: "remove", id: added.id }) }, dependencies);
    expect(JSON.parse(await readFile(path, "utf8")).annotations).toEqual([]);
    expect(client).not.toHaveBeenCalled();
  } finally { await rm(root, { recursive: true, force: true }); }
});
