import { readFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { materializePinnedRepository } from "./lib/external-cache.mjs";
import { createAnnotation, updateAnnotationStore, addAnnotation, removeAnnotation, buildFixMapReport } from "../packages/core/dist/index.js";

const manifest = JSON.parse(await readFile(new URL("../benchmarks/annotations/cases.json", import.meta.url), "utf8"));
const results = [];
for (const entry of manifest.cases) {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-external-"));
  try {
    const pinned = await materializePinnedRepository(entry);
    await cp(pinned, root, { recursive: true, filter: (path) => basename(path) !== ".git" });
    const source = await readFile(join(root, entry.path));
    const file = createAnnotation({ scope: { kind: "file", path: entry.path }, note: "External annotation acceptance", owner: "acceptance-owner", createdAt: "2026-01-01T00:00:00Z" });
    const service = createAnnotation({ scope: { kind: "service", name: "acceptance-service" }, note: "Explicit service note", createdAt: "2026-01-01T00:00:00Z" });
    await updateAnnotationStore(root, (store) => addAnnotation(addAnnotation(store, file), service));
    const bytes = await readFile(join(root, ".fixmap/annotations.json"));
    const plan = (issueText) => buildFixMapReport({ repoRoot: root, issueText, useCache: false, includeHistory: false });
    const positive = await plan(`Review ${entry.path} acceptance-service`);
    assert.equal(positive.annotations?.sourceFingerprint, `worktree:${createHash("sha256").update(bytes).digest("hex")}`);
    assert(positive.annotations.entries.some((item) => item.annotation.id === file.id));
    assert(positive.annotations.entries.some((item) => item.annotation.id === service.id));
    const negative = await plan(`Review ${entry.path}`);
    assert(!negative.annotations?.entries.some((item) => item.annotation.id === service.id));
    await updateAnnotationStore(root, (store) => removeAnnotation(removeAnnotation(store, file.id), service.id));
    assert.deepEqual(JSON.parse(await readFile(join(root, ".fixmap/annotations.json"), "utf8")).annotations, []);
    assert.equal((await plan(`Review ${entry.path} acceptance-service`)).annotations?.entries.length ?? 0, 0);
    assert.deepEqual(await readFile(join(root, entry.path)), source);
    results.push({ slug: entry.slug, sha: entry.sha, passed: true });
  } catch (error) {
    results.push({ slug: entry.slug, sha: entry.sha, passed: false, error: error.message });
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
process.stdout.write(`${JSON.stringify({ kind: "external-workflow-not-heldout-ranking", results }, null, 2)}\n`);
process.exitCode = results.some((result) => !result.passed) ? 1 : 0;
