import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadEditorSnapshot } from "../src/editor-loader.js";
import { createEditorSession } from "../src/editor-session.js";

it("loads and refreshes real local evidence while preserving ignored-path boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-editor-loader-"));
  try {
    await writeFile(join(root, "auth.ts"), "export const authenticate = () => false;\n");
    await writeFile(join(root, "secret.ts"), "export const authenticateSecret = true;\n");
    await writeFile(join(root, ".fixmapignore"), "secret.ts\n");
    const load = () => loadEditorSnapshot({ repoRoot: root, issueText: "authenticate fails", useCache: false, includeHistory: false });
    const session = createEditorSession(await load());
    const before = session.snapshot();
    expect(before.repository?.files.map((file) => file.path)).not.toContain("secret.ts");
    expect(before.report.contextFiles.map((file) => file.path)).not.toContain("secret.ts");
    await writeFile(join(root, "auth.ts"), "export const authenticate = () => true;\n");
    expect((await session.refresh(load)).applied).toBe(true);
    expect(session.snapshot().snapshotFingerprint).not.toBe(before.snapshotFingerprint);
    expect(session.snapshot().repository?.files.find((file) => file.path === "auth.ts")?.textSample).toContain("true");
    expect(before.repository?.files.find((file) => file.path === "auth.ts")?.textSample).toContain("false");
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
