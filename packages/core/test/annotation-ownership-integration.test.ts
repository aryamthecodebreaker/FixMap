import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createAnnotation, addAnnotation, removeAnnotation } from "../src/annotations.js";
import { updateAnnotationStore } from "../src/annotation-store.js";
import { scanRepo } from "../src/repo-scan.js";
import { buildChangeScope } from "../src/change-scope.js";

it("reassesses persisted ownership at the exact expiry boundary and after removal", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixmap-owner-workflow-"));
  try {
    await writeFile(join(root, "billing.ts"), "export const bill = () => 1;\n");
    await writeFile(join(root, "CODEOWNERS"), "/billing.ts @billing-team\n");
    const annotation = createAnnotation({
      scope: { kind: "symbol", path: "billing.ts", symbol: "bill" },
      note: "Temporary migration reviewer", owner: "@migration-reviewer",
      createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-02-01T00:00:00Z"
    });
    await updateAnnotationStore(root, (store) => addAnnotation(store, annotation));
    const path = join(root, ".fixmap", "annotations.json");
    const bytes = await readFile(path);
    const snapshot = await scanRepo({ repoRoot: root, useCache: false });
    const scope = (asOf: string) => buildChangeScope(snapshot, {
      workspace: "acceptance", repository: "billing", anchors: [{ operation: "touch", path: "billing.ts" }], asOf
    });
    const active = scope("2026-01-31T23:59:59.999Z");
    const reviewer = active.reviewers.find((entry) => entry.reviewer === "@migration-reviewer");
    expect(reviewer?.evidence).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: "annotation", sourceFingerprint: `worktree:${createHash("sha256").update(bytes).digest("hex")}`
    })]));
    expect(reviewer?.availabilityInferred).toBe(false);
    const expired = scope("2026-02-01T00:00:00Z");
    expect(expired.reviewers.map((entry) => entry.reviewer)).toEqual(["@billing-team"]);
    expect(await readFile(path)).toEqual(bytes);
    await updateAnnotationStore(root, (store) => removeAnnotation(store, annotation.id));
    const fresh = await scanRepo({ repoRoot: root, useCache: false });
    const removed = buildChangeScope(fresh, {
      workspace: "acceptance", repository: "billing", anchors: [{ operation: "touch", path: "billing.ts" }], asOf: "2026-01-31T00:00:00Z"
    });
    expect(removed.reviewers.map((entry) => entry.reviewer)).toEqual(["@billing-team"]);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
